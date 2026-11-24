"""
Nexus OS v5.0 - Acoustic Transient Detection & Away Tracker Engine.
High-precision, low-overhead double-clap transient recognition and Win32 session state monitoring.

Architecture & Specifications:
1. Low-Overhead Acoustic Transient Detection:
   - Evaluates 16-bit Mono PCM audio chunks (default 16kHz).
   - Fast normalized RMS energy calculation (0.0 to 1.0).
   - Transient onset filter with spike threshold > 0.45 (default).
   - Strict double-clap temporal window: [110ms, 420ms].
   - Refractory dead-time (< 110ms) prevents echo/reverberation re-triggering.
   - Post-detection cooldown (default 500ms) prevents trailing burst false-positives.

2. Wake/Focus Actuation & System Notification:
   - Awakens display and resets OS idle timers via SetThreadExecutionState & mouse event.
   - Brings Nexus Desktop or active workspace to foreground focus.
   - Non-blocking SQLite event logging to ~/.nexus-agent/db/agent_local.db.
   - User callback hooks for system-wide wake dispatch.

3. Windows OS Workstation Session Monitoring:
   - Native WtsRegisterSessionNotification (wtsapi32.dll) with hidden Win32 message pump.
   - Real-time WM_WTSSESSION_CHANGE event handling (WTS_SESSION_LOCK, WTS_SESSION_UNLOCK).
   - Fallback polling via OpenInputDesktop for headless or non-interactive environments.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import logging
import math
import os
from pathlib import Path
import sqlite3
import struct
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import uuid

logger = logging.getLogger("nexus.runtime.away_tracker")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [AWAY_TRACKER] %(message)s")

# -----------------------------------------------------------------------------
# Acoustic Transient & Double-Clap Constants
# -----------------------------------------------------------------------------
DEFAULT_SAMPLE_RATE = 16000          # 16kHz
DEFAULT_SAMPLE_WIDTH = 2             # 16-bit (2 bytes per sample)
DEFAULT_SPIKE_THRESHOLD = 0.45       # RMS spike threshold > 0.45
DEFAULT_MIN_CLAP_INTERVAL_MS = 110.0 # 110ms minimum interval
DEFAULT_MAX_CLAP_INTERVAL_MS = 420.0 # 420ms maximum interval
DEFAULT_COOLDOWN_MS = 500.0          # Post-double-clap refractory period

# -----------------------------------------------------------------------------
# Win32 Session & System Power Constants
# -----------------------------------------------------------------------------
WM_WTSSESSION_CHANGE = 0x02B1
NOTIFY_FOR_THIS_SESSION = 0
NOTIFY_FOR_ALL_SESSIONS = 1

WTS_CONSOLE_CONNECT = 0x1
WTS_CONSOLE_DISCONNECT = 0x2
WTS_REMOTE_CONNECT = 0x3
WTS_REMOTE_DISCONNECT = 0x4
WTS_SESSION_LOGON = 0x5
WTS_SESSION_LOGOFF = 0x6
WTS_SESSION_LOCK = 0x7
WTS_SESSION_UNLOCK = 0x8
WTS_SESSION_REMOTE_CONTROL = 0x9

ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002
ES_USER_PRESENT = 0x00000004
ES_CONTINUOUS = 0x80000000

MOUSEEVENTF_MOVE = 0x0001
SW_RESTORE = 9

# Win32 Pointer resolution
ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else wintypes.ULONG
LRESULT = ctypes.c_int64 if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_long


# -----------------------------------------------------------------------------
# Win32 CTypes Window Definitions (Windows Only)
# -----------------------------------------------------------------------------
if sys.platform == "win32":
    WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    user32 = ctypes.windll.user32
    user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    user32.DefWindowProcW.restype = LRESULT
    if hasattr(user32, "RegisterClassExW"):
        user32.RegisterClassExW.argtypes = [ctypes.c_void_p]
        user32.RegisterClassExW.restype = wintypes.ATOM
    if hasattr(user32, "CreateWindowExW"):
        user32.CreateWindowExW.argtypes = [
            wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID
        ]
        user32.CreateWindowExW.restype = wintypes.HWND

    class WNDCLASSEXW(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.UINT),
            ("style", wintypes.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HICON),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
            ("hIconSm", wintypes.HICON),
        ]
else:
    WNDPROC = Any  # type: ignore
    WNDCLASSEXW = Any  # type: ignore


# -----------------------------------------------------------------------------
# Native Windows System Helper Functions
# -----------------------------------------------------------------------------
def check_workstation_locked() -> bool:
    """
    Checks whether the Windows OS workstation is currently locked.
    Uses OpenInputDesktop to verify interactive desktop access.
    Returns True if locked, False if unlocked or non-Windows.
    """
    if sys.platform != "win32":
        return False

    try:
        user32 = ctypes.windll.user32
        # DESKTOP_SWITCHDESKTOP = 0x0100
        h_desk = user32.OpenInputDesktop(0, False, 0x0100)
        if h_desk:
            user32.CloseDesktop(h_desk)
            return False
        # If OpenInputDesktop returns NULL, workstation is locked or in secure desktop
        return True
    except Exception as exc:
        logger.debug("Failed to query OpenInputDesktop: %s", exc)
        return False


def get_operator_idle_seconds() -> float:
    """
    Returns operator idle time in seconds using native Win32 GetLastInputInfo.
    Calculates elapsed time since the most recent keyboard or mouse input.
    Falls back gracefully on non-Windows environments.
    """
    if sys.platform != "win32":
        return 0.0

    try:
        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        if user32.GetLastInputInfo(ctypes.byref(lii)):
            millis = kernel32.GetTickCount() - lii.dwTime
            return max(0.0, float(millis) / 1000.0)
    except Exception as exc:
        logger.debug("Failed to query GetLastInputInfo: %s", exc)

    return 0.0


def wake_or_focus_workstation() -> Dict[str, Any]:
    """
    Awakens Windows display from standby and brings Nexus Desktop to focus.
    Calls SetThreadExecutionState, injects subtle mouse pulse, and restores foreground window.
    """
    result: Dict[str, Any] = {
        "success": True,
        "display_woken": False,
        "mouse_pulsed": False,
        "nexus_focused": False,
        "error": None,
    }

    if sys.platform != "win32":
        result["simulated"] = True
        return result

    try:
        kernel32 = ctypes.windll.kernel32
        user32 = ctypes.windll.user32

        # 1. Inform Windows OS that display & system are required (wakes display from sleep)
        state_flags = ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
        prev_state = kernel32.SetThreadExecutionState(state_flags)
        result["display_woken"] = bool(prev_state != 0)

        # 2. Inject instantaneous relative mouse jiggle (1 pixel move and back) to reset idle timer
        user32.mouse_event(MOUSEEVENTF_MOVE, 1, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_MOVE, -1, 0, 0, 0)
        result["mouse_pulsed"] = True

        # 3. Locate and focus Nexus Desktop / Command Center window
        matched_hwnds: List[int] = []

        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

        def _enum_win_cb(hwnd: int, lparam: int) -> bool:
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                title = buf.value.upper()
                if "NEXUS" in title or "COMMAND CENTER" in title or "NOTCH HUD" in title:
                    matched_hwnds.append(hwnd)
            return True

        user32.EnumWindows(WNDENUMPROC(_enum_win_cb), 0)

        if matched_hwnds:
            target_hwnd = matched_hwnds[0]
            user32.ShowWindow(target_hwnd, SW_RESTORE)
            user32.SetForegroundWindow(target_hwnd)
            result["nexus_focused"] = True
            logger.info("Brought Nexus window (HWND=0x%x) to foreground", target_hwnd)

    except Exception as exc:
        result["success"] = False
        result["error"] = str(exc)
        logger.warning("Wake/focus workstation action encountered error: %s", exc)

    return result


def create_pcm_frame(
    amplitude: float = 0.0,
    duration_ms: float = 30.0,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    frequency_hz: float = 1000.0,
) -> bytes:
    """
    Utility function to generate synthetic 16-bit Mono PCM audio chunks.
    Useful for testing acoustic transient detection and audio pipelines.

    Args:
        amplitude: Normalized amplitude from 0.0 (silence) to 1.0 (peak).
        duration_ms: Duration in milliseconds (default: 30ms).
        sample_rate: Audio sampling frequency in Hz (default: 16000).
        frequency_hz: Sine wave frequency in Hz (default: 1000Hz).

    Returns:
        Raw PCM bytes formatted as 16-bit Mono little-endian.
    """
    num_samples = int(sample_rate * (duration_ms / 1000.0))
    if amplitude <= 0.0 or num_samples <= 0:
        return b"\x00" * (num_samples * DEFAULT_SAMPLE_WIDTH)

    peak = int(32767 * max(0.0, min(1.0, amplitude)))
    samples: List[int] = []
    for i in range(num_samples):
        # Sine wave sampled at frequency_hz
        t = float(i) / sample_rate
        val = int(peak * math.sin(2.0 * math.pi * frequency_hz * t))
        samples.append(max(-32768, min(32767, val)))

    return struct.pack(f"{num_samples}h", *samples)


# -----------------------------------------------------------------------------
# Win32 Session State Monitor
# -----------------------------------------------------------------------------
class WtsSessionMonitor:
    """
    Monitors Windows OS workstation lock/unlock events.
    Uses WTSRegisterSessionNotification when available with a native message loop.
    Falls back gracefully to polling check_workstation_locked() on non-interactive environments.
    """

    def __init__(
        self,
        on_lock: Optional[Callable[[], None]] = None,
        on_unlock: Optional[Callable[[], None]] = None,
        on_session_change: Optional[Callable[[str, int], None]] = None,
        poll_interval_s: float = 1.0,
    ) -> None:
        self.on_lock = on_lock
        self.on_unlock = on_unlock
        self.on_session_change = on_session_change
        self.poll_interval_s = poll_interval_s

        self.is_locked = check_workstation_locked()
        self.is_running = False

        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._hwnd: Optional[int] = None
        self._class_name: Optional[str] = None
        self._wnd_proc_ref: Optional[Any] = None
        self._h_instance: Optional[int] = None

    def start(self) -> bool:
        """Starts the session monitor thread."""
        if self.is_running:
            return True

        self.is_running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._worker, name="WtsSessionMonitorWorker", daemon=True)
        self._thread.start()
        logger.info("WtsSessionMonitor started (Initial Locked=%s)", self.is_locked)
        return True

    def stop(self) -> None:
        """Stops the session monitor and unregisters Win32 notifications."""
        if not self.is_running:
            return

        self.is_running = False
        self._stop_event.set()

        if sys.platform == "win32" and self._hwnd:
            try:
                # Post WM_NULL to immediately wake up PeekMessage loop
                user32 = ctypes.windll.user32
                user32.PostMessageW(self._hwnd, 0x0000, 0, 0)
            except Exception as exc:
                logger.debug("WM_NULL post notice: %s", exc)

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

        logger.info("WtsSessionMonitor stopped")

    def _worker(self) -> None:
        """Background thread executing native Win32 message pump or fallback polling."""
        registered_wts = False

        if sys.platform == "win32" and not os.environ.get("PYTEST_CURRENT_TEST"):
            try:
                registered_wts = self._setup_wts_window()
            except Exception as exc:
                logger.warning("WTSRegisterSessionNotification setup failed (%s). Falling back to polling.", exc)
                registered_wts = False

        try:
            if registered_wts:
                self._run_wts_message_loop()
            else:
                self._run_polling_loop()
        finally:
            if sys.platform == "win32" and self._hwnd:
                try:
                    wtsapi32 = getattr(ctypes.windll, "wtsapi32", None)
                    if wtsapi32:
                        wtsapi32.WTSUnRegisterSessionNotification(self._hwnd)

                    user32 = ctypes.windll.user32
                    user32.DestroyWindow(self._hwnd)
                    if self._class_name and self._h_instance:
                        user32.UnregisterClassW(self._class_name, self._h_instance)
                except Exception as exc:
                    logger.debug("Error cleaning up Win32 session window: %s", exc)
                self._hwnd = None

    def _setup_wts_window(self) -> bool:
        """Registers a hidden native Win32 window and subscribes to session events."""
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        wtsapi32 = getattr(ctypes.windll, "wtsapi32", None)
        if not wtsapi32:
            return False

        self._h_instance = kernel32.GetModuleHandleW(None)
        self._class_name = f"NexusWtsWindow_{uuid.uuid4().hex[:8]}"

        def _wnd_proc(hwnd: int, uMsg: int, wParam: int, lParam: int) -> int:
            if uMsg == WM_WTSSESSION_CHANGE:
                self._dispatch_wts_event(wParam, lParam)
                return 0
            return int(user32.DefWindowProcW(hwnd, uMsg, wParam, lParam))

        # Keep strong reference to avoid garbage collection of the CTypes callback
        self._wnd_proc_ref = WNDPROC(_wnd_proc)

        wc = WNDCLASSEXW()
        wc.cbSize = ctypes.sizeof(WNDCLASSEXW)
        wc.style = 0
        wc.lpfnWndProc = self._wnd_proc_ref
        wc.cbClsExtra = 0
        wc.cbWndExtra = 0
        wc.hInstance = self._h_instance
        wc.hIcon = None
        wc.hCursor = None
        wc.hbrBackground = None
        wc.lpszMenuName = None
        wc.lpszClassName = self._class_name
        wc.hIconSm = None

        reg_atom = user32.RegisterClassExW(ctypes.byref(wc))
        if not reg_atom:
            logger.debug("RegisterClassExW returned 0")
            return False

        # Create hidden top-level window (do not use HWND_MESSAGE as WTSRegisterSessionNotification requires top-level)
        self._hwnd = user32.CreateWindowExW(
            0,
            self._class_name,
            "NexusSessionNotificationListener",
            0,
            0,
            0,
            0,
            0,
            None,
            None,
            self._h_instance,
            None,
        )

        if not self._hwnd:
            logger.debug("CreateWindowExW returned 0")
            user32.UnregisterClassW(self._class_name, self._h_instance)
            return False

        reg_ok = wtsapi32.WTSRegisterSessionNotification(self._hwnd, NOTIFY_FOR_THIS_SESSION)
        if not reg_ok:
            logger.debug("WTSRegisterSessionNotification returned False")
            user32.DestroyWindow(self._hwnd)
            user32.UnregisterClassW(self._class_name, self._h_instance)
            self._hwnd = None
            return False

        logger.info("WTSRegisterSessionNotification successfully registered on HWND 0x%x", self._hwnd)
        return True

    def _run_wts_message_loop(self) -> None:
        """Processes Windows messages for the session notification window."""
        user32 = ctypes.windll.user32
        msg = wintypes.MSG()

        while not self._stop_event.is_set():
            # Check message queue for the window
            while user32.PeekMessageW(ctypes.byref(msg), self._hwnd, 0, 0, 1):
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))

            # Concurrently verify workstation lock status
            current_locked = check_workstation_locked()
            if current_locked != self.is_locked:
                self._update_lock_state(current_locked, reason="polling_sync")

            self._stop_event.wait(0.1)

    def _run_polling_loop(self) -> None:
        """Fallback polling loop for platforms or processes without interactive WTS window."""
        while not self._stop_event.is_set():
            current_locked = check_workstation_locked()
            if current_locked != self.is_locked:
                self._update_lock_state(current_locked, reason="polling")

            self._stop_event.wait(self.poll_interval_s)

    def _dispatch_wts_event(self, event_code: int, session_id: int) -> None:
        """Handles WM_WTSSESSION_CHANGE wParam codes."""
        event_names = {
            WTS_CONSOLE_CONNECT: "CONSOLE_CONNECT",
            WTS_CONSOLE_DISCONNECT: "CONSOLE_DISCONNECT",
            WTS_REMOTE_CONNECT: "REMOTE_CONNECT",
            WTS_REMOTE_DISCONNECT: "REMOTE_DISCONNECT",
            WTS_SESSION_LOGON: "SESSION_LOGON",
            WTS_SESSION_LOGOFF: "SESSION_LOGOFF",
            WTS_SESSION_LOCK: "SESSION_LOCK",
            WTS_SESSION_UNLOCK: "SESSION_UNLOCK",
            WTS_SESSION_REMOTE_CONTROL: "SESSION_REMOTE_CONTROL",
        }
        name = event_names.get(event_code, f"UNKNOWN_0x{event_code:X}")
        logger.info("🔒 [WTS_SESSION] Event: %s (Session ID: %d)", name, session_id)

        if event_code == WTS_SESSION_LOCK:
            self._update_lock_state(True, reason="WTS_SESSION_LOCK")
        elif event_code == WTS_SESSION_UNLOCK:
            self._update_lock_state(False, reason="WTS_SESSION_UNLOCK")

        if self.on_session_change:
            try:
                self.on_session_change(name, session_id)
            except Exception as exc:
                logger.error("Error in on_session_change callback: %s", exc)

    def _update_lock_state(self, locked: bool, reason: str = "") -> None:
        """Transitions lock state and dispatches callbacks."""
        if self.is_locked == locked:
            return

        self.is_locked = locked
        logger.info("🔒 Workstation lock state transitioned: Locked=%s (Trigger: %s)", locked, reason)

        if locked and self.on_lock:
            try:
                self.on_lock()
            except Exception as exc:
                logger.error("Error in on_lock callback: %s", exc)
        elif not locked and self.on_unlock:
            try:
                self.on_unlock()
            except Exception as exc:
                logger.error("Error in on_unlock callback: %s", exc)


# -----------------------------------------------------------------------------
# Main AwayTracker Class
# -----------------------------------------------------------------------------
class AwayTracker:
    """
    AwayTracker combines low-overhead acoustic transient detection (double-clap recognition)
    with Windows OS workstation session lock/unlock monitoring and automated wake actuation.
    """

    def __init__(
        self,
        spike_threshold: float = DEFAULT_SPIKE_THRESHOLD,
        min_clap_interval_ms: float = DEFAULT_MIN_CLAP_INTERVAL_MS,
        max_clap_interval_ms: float = DEFAULT_MAX_CLAP_INTERVAL_MS,
        cooldown_ms: float = DEFAULT_COOLDOWN_MS,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        sample_width: int = DEFAULT_SAMPLE_WIDTH,
        on_double_clap: Optional[Callable[[], Any]] = None,
        on_lock: Optional[Callable[[], Any]] = None,
        on_unlock: Optional[Callable[[], Any]] = None,
        auto_wake: bool = True,
        idle_threshold_sec: float = 300.0,
        db_path: Optional[Path | str] = None,
    ) -> None:
        # Acoustic Configuration
        self.spike_threshold = float(spike_threshold)
        self.min_clap_interval_ms = float(min_clap_interval_ms)
        self.max_clap_interval_ms = float(max_clap_interval_ms)
        self.cooldown_ms = float(cooldown_ms)
        self.sample_rate = int(sample_rate)
        self.sample_width = int(sample_width)
        self.auto_wake = auto_wake
        self.idle_threshold_sec = float(idle_threshold_sec)

        # Callback Handlers
        self.on_double_clap = on_double_clap
        self.on_lock = on_lock
        self.on_unlock = on_unlock

        # Database Path for Event Logging
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)

        # Transient Detection State
        self._candidate_clap_time: Optional[float] = None
        self._last_double_clap_time: Optional[float] = None
        self._cooldown_until: float = 0.0
        self._last_spike_rms: float = 0.0
        self._last_spike_frame_time: float = 0.0
        self._is_in_spike: bool = False
        self._last_rms: float = 0.0
        self._double_clap_count: int = 0
        self._total_frames_processed: int = 0

        # Presence & Session State
        self.is_locked: bool = check_workstation_locked()
        self.is_away: bool = self.is_locked
        self.last_presence_time: float = time.time()
        self.last_lock_time: Optional[float] = time.time() if self.is_locked else None
        self.last_unlock_time: Optional[float] = None
        self.last_away_time: Optional[float] = time.time() if self.is_away else None
        self.last_wake_time: Optional[float] = None
        self.last_catchup_summary: Optional[Dict[str, Any]] = None

        # Lock for thread safety
        self._lock = threading.Lock()

        # Ensure database tables exist
        self._init_db()

        # Session Monitor
        self._session_monitor = WtsSessionMonitor(
            on_lock=self._handle_session_lock,
            on_unlock=self._handle_session_unlock,
        )

        # Audio Capture reference (if started internally)
        self._mic_capture: Optional[Any] = None
        self.is_monitoring: bool = False

    def _init_db(self) -> None:
        """Initializes the away_events and away_digest_queue tables in SQLite WAL mode."""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS away_events (
                        id TEXT PRIMARY KEY,
                        event_type TEXT NOT NULL,
                        details TEXT,
                        timestamp REAL NOT NULL,
                        is_locked INTEGER NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS away_digest_queue (
                        id TEXT PRIMARY KEY,
                        event_type TEXT NOT NULL,
                        source TEXT NOT NULL,
                        title TEXT NOT NULL,
                        content TEXT DEFAULT '',
                        timestamp REAL NOT NULL,
                        created_at TEXT NOT NULL,
                        processed INTEGER NOT NULL DEFAULT 0
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_away_digest_processed
                    ON away_digest_queue(processed);
                    """
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Database initialization notice: %s", exc)

    def set_away(self, away: bool = True, reason: str = "manual") -> bool:
        """
        Manually triggers or clears the away state.
        When set to away, queued alerts accumulate in away_digest_queue.
        When set to active, updates presence and generates a catch-up summary.
        """
        with self._lock:
            prev_away = self.is_away
            self.is_away = bool(away)
            now = time.time()
            if self.is_away:
                self.last_away_time = now
                logger.info("User manually marked as AWAY (reason: %s)", reason)
                self._log_event("MANUAL_AWAY", f"User marked away: {reason}", int(self.is_locked))
            else:
                self.last_wake_time = now
                self.last_presence_time = now
                logger.info("User marked as ACTIVE (reason: %s)", reason)
                self._log_event("MANUAL_ACTIVE", f"User marked active: {reason}", int(self.is_locked))
        return self.is_away

    def mark_away(self, reason: str = "manual") -> bool:
        """Convenience alias for set_away(True)."""
        return self.set_away(True, reason=reason)

    def mark_returned(self, reason: str = "returned") -> Dict[str, Any]:
        """Marks user as returned and immediately generates a catch-up summary."""
        self.set_away(False, reason=reason)
        return self.generate_catchup_summary(mark_processed=True)

    def queue_away_event(
        self,
        event_type: str,
        source: str,
        title: str,
        content: str = "",
        only_if_away: bool = False,
    ) -> Optional[str]:
        """
        Queues an alert, notification, or system event into away_digest_queue.
        If only_if_away is True and the user is currently present, skips queueing.
        """
        if only_if_away and not self.is_away:
            return None

        event_id = f"digest-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
        now = time.time()
        created_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute(
                    """
                    INSERT INTO away_digest_queue (id, event_type, source, title, content, timestamp, created_at, processed)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0);
                    """,
                    (event_id, event_type, source, title, content, now, created_at_iso),
                )
                conn.commit()
            logger.info("Queued away event [%s] from %s: %s", event_type, source, title)
            return event_id
        except Exception as exc:
            logger.error("Failed to queue away event: %s", exc)
            return None

    def queue_alert(
        self,
        title: str,
        content: str = "",
        source: str = "system",
        event_type: str = "alert",
        only_if_away: bool = False,
    ) -> Optional[str]:
        """Convenience alias for queuing an alert notification."""
        return self.queue_away_event(
            event_type=event_type,
            source=source,
            title=title,
            content=content,
            only_if_away=only_if_away,
        )

    def get_pending_digest_events(self) -> List[Dict[str, Any]]:
        """Returns all unprocessed events currently pending in away_digest_queue."""
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    """
                    SELECT id, event_type, source, title, content, timestamp, created_at, processed
                    FROM away_digest_queue
                    WHERE processed = 0
                    ORDER BY timestamp ASC;
                    """
                ).fetchall()
                return [dict(r) for r in rows]
        except Exception as exc:
            logger.debug("Failed to query pending digest events: %s", exc)
            return []

    def generate_catchup_summary(self, mark_processed: bool = True) -> Dict[str, Any]:
        """
        Generates a concise, structured catch-up summary of all notifications
        received in away_digest_queue while the user was away.
        Optionally marks those events as processed in SQLite WAL.
        """
        events = self.get_pending_digest_events()
        count = len(events)
        now = time.time()

        if count > 0:
            lines = [f"While you were away, you received {count} notification(s):"]
            for idx, ev in enumerate(events, start=1):
                src = ev.get("source", "system").upper()
                tit = ev.get("title", "")
                cnt = ev.get("content", "")
                desc = f": {cnt}" if cnt else ""
                lines.append(f"{idx}. [{src}] {tit}{desc}")
            summary_text = "\n".join(lines)

            if mark_processed:
                try:
                    with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                        conn.execute("UPDATE away_digest_queue SET processed = 1 WHERE processed = 0;")
                        conn.commit()
                except Exception as exc:
                    logger.debug("Failed to mark digest events processed: %s", exc)
        else:
            summary_text = "Welcome back! You have no missed notifications while away."

        summary_payload = {
            "count": count,
            "summary": summary_text,
            "events": events,
            "was_away": self.is_away,
            "timestamp": now,
        }
        self.last_catchup_summary = summary_payload
        return summary_payload

    def generate_catchup_digest(self, mark_processed: bool = True) -> Dict[str, Any]:
        """
        Exposes generate_catchup_digest as required by Lane B specification.
        Returns catch-up digest dictionary and marks processed.
        """
        return self.generate_catchup_summary(mark_processed=mark_processed)

    @property
    def away_digest_queue(self) -> List[Dict[str, Any]]:
        """Returns all unprocessed events currently pending in away_digest_queue."""
        return self.get_pending_digest_events()

    def get_idle_seconds(self) -> float:
        """Returns operator idle time in seconds."""
        idle = get_operator_idle_seconds()
        if idle <= 0.0 and self.is_away and self.last_away_time:
            return max(0.0, time.time() - self.last_away_time)
        return idle

    def check_away_state(self, idle_threshold: Optional[float] = None) -> bool:
        """
        Evaluates whether the operator is away based on workstation lock
        or operator idle duration exceeding the threshold.
        """
        thresh = float(idle_threshold) if idle_threshold is not None else self.idle_threshold_sec
        is_locked = check_workstation_locked() if sys.platform == "win32" else self.is_locked
        idle_sec = self.get_idle_seconds()

        is_now_away = bool(is_locked or (idle_sec >= thresh and thresh > 0))
        if is_now_away != self.is_away:
            self.set_away(is_now_away, reason="idle_exceeded" if is_now_away else "activity_resumed")
        return self.is_away

    def clear_digest_queue(self) -> int:
        """Deletes all events in away_digest_queue, returning the count of deleted rows."""
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                res = conn.execute("DELETE FROM away_digest_queue;")
                conn.commit()
                return res.rowcount
        except Exception as exc:
            logger.debug("Failed to clear away_digest_queue: %s", exc)
            return 0

    # -------------------------------------------------------------------------
    # Acoustic Transient Calculation & Double-Clap Recognition
    # -------------------------------------------------------------------------
    @staticmethod
    def calculate_rms(pcm_bytes: bytes) -> float:
        """
        Calculates normalized Root Mean Square (RMS) energy (0.0 to 1.0)
        for 16-bit Mono little-endian PCM audio chunks.
        """
        if not pcm_bytes:
            return 0.0

        sample_count = len(pcm_bytes) // 2
        if sample_count == 0:
            return 0.0

        try:
            samples = struct.unpack(f"{sample_count}h", pcm_bytes)
            sum_sq = sum(s * s for s in samples)
            rms = math.sqrt(sum_sq / sample_count)
            # Normalize to 0.0 .. 1.0 (16-bit max amplitude is 32768)
            return min(1.0, rms / 32768.0)
        except Exception as exc:
            logger.debug("RMS calculation error: %s", exc)
            return 0.0

    def process_audio_chunk(self, pcm_bytes: bytes, timestamp: Optional[float] = None) -> bool:
        """
        Processes a raw PCM audio chunk (16-bit Mono PCM).
        Calculates RMS energy and evaluates transient double-clap criteria:
        - Spike threshold: RMS > 0.45.
        - Temporal window: 110ms to 420ms interval between claps.
        - Refractory dead-time: Rejects spikes < 110ms.
        - Post-detection cooldown: Suppresses immediate echoes.

        Args:
            pcm_bytes: Raw 16-bit Mono PCM audio bytes.
            timestamp: Explicit timestamp in seconds (default: time.time()).

        Returns:
            True if a double-clap sequence was completed and detected, False otherwise.
        """
        now = time.time() if timestamp is None else float(timestamp)
        rms = self.calculate_rms(pcm_bytes)

        with self._lock:
            self._last_rms = rms
            self._total_frames_processed += 1

            is_spike = rms > self.spike_threshold

            if is_spike:
                self._last_spike_rms = rms

                # In post-double-clap cooldown period: ignore
                if now < self._cooldown_until:
                    self._last_spike_frame_time = now
                    return False

                # Check if this frame is a new rising-edge transient onset
                # (either previously not in spike, or frame gap > 80ms)
                is_onset = (not self._is_in_spike) or ((now - self._last_spike_frame_time) > 0.080)
                self._is_in_spike = True
                self._last_spike_frame_time = now

                if not is_onset:
                    # Sustained energy from the same existing transient; do not count as second clap
                    return False

                # We have a valid transient onset!
                if self._candidate_clap_time is not None:
                    delta_ms = (now - self._candidate_clap_time) * 1000.0

                    if delta_ms < self.min_clap_interval_ms:
                        # Too fast (< 110ms): Reverberation or multiple peaks of same clap. Ignore.
                        logger.debug("Transient spike ignored (within refractory window: %.1fms < %.1fms)", delta_ms, self.min_clap_interval_ms)
                        return False

                    elif self.min_clap_interval_ms <= delta_ms <= self.max_clap_interval_ms:
                        # VALID DOUBLE-CLAP DETECTED!
                        self._candidate_clap_time = None
                        self._last_double_clap_time = now
                        self._cooldown_until = now + (self.cooldown_ms / 1000.0)
                        self._double_clap_count += 1
                        was_away = self.is_away
                        self.is_away = False
                        self.last_presence_time = now
                        self.last_wake_time = now

                        logger.info(
                            "👏 [DOUBLE-CLAP] Detected! Interval: %.1fms (RMS=%.3f) - Total: %d (Was Away=%s)",
                            delta_ms,
                            rms,
                            self._double_clap_count,
                            was_away,
                        )

                        # Generate catch-up digest summary if user was away
                        catchup_summary = self.generate_catchup_summary(mark_processed=True) if was_away else None

                        # Trigger wake/focus and notifications
                        self._dispatch_double_clap(delta_ms, rms, catchup_summary=catchup_summary)
                        return True

                    else:
                        # delta_ms > max_clap_interval_ms: Window expired; this onset becomes the new candidate
                        logger.debug("Candidate clap expired (%.1fms > %.1fms). Starting new window.", delta_ms, self.max_clap_interval_ms)
                        self._candidate_clap_time = now
                        return False
                else:
                    # First clap detected: begin double-clap window
                    logger.debug("First clap transient registered at t=%.3f (RMS=%.3f). Waiting for second clap.", now, rms)
                    self._candidate_clap_time = now
                    return False

            else:
                # Energy is below threshold
                self._is_in_spike = False

                # If candidate clap window has elapsed without a second clap, expire candidate
                if self._candidate_clap_time is not None:
                    delta_ms = (now - self._candidate_clap_time) * 1000.0
                    if delta_ms > self.max_clap_interval_ms:
                        self._candidate_clap_time = None

                return False

    def feed_audio(self, pcm_bytes: bytes) -> bool:
        """Alias for process_audio_chunk."""
        return self.process_audio_chunk(pcm_bytes)

    # -------------------------------------------------------------------------
    # Actuation & System Notifications
    # -------------------------------------------------------------------------
    def _dispatch_double_clap(
        self,
        interval_ms: float,
        rms: float,
        catchup_summary: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Triggers system wake/focus actuation, user callback, and event logging."""
        # 1. Automated wake / focus workstation
        if self.auto_wake:
            wake_or_focus_workstation()

        # 2. Invoke user callback if registered
        if self.on_double_clap:
            def _run_cb():
                try:
                    import inspect
                    sig = inspect.signature(self.on_double_clap)
                    if len(sig.parameters) >= 1:
                        self.on_double_clap(catchup_summary)
                    else:
                        self.on_double_clap()
                except Exception as exc:
                    logger.error("Error in on_double_clap callback: %s", exc)

            threading.Thread(target=_run_cb, name="DoubleClapCallbackThread", daemon=True).start()

        # 3. Asynchronously record event in SQLite WAL database
        self._log_event(
            event_type="DOUBLE_CLAP",
            details=f"Acoustic transient double-clap (Interval={interval_ms:.1f}ms, RMS={rms:.3f}, CatchupEvents={catchup_summary.get('count', 0) if catchup_summary else 0})",
            is_locked=int(self.is_locked),
        )

    def trigger_wake_action(self) -> Dict[str, Any]:
        """Manually triggers the system wake and window focus routine."""
        was_away = self.is_away
        self.is_away = False
        self.last_presence_time = time.time()
        self.last_wake_time = time.time()
        wake_res = wake_or_focus_workstation()
        if was_away:
            wake_res["catchup"] = self.generate_catchup_summary(mark_processed=True)
        return wake_res

    # -------------------------------------------------------------------------
    # Workstation Lock / Unlock Handlers
    # -------------------------------------------------------------------------
    def _handle_session_lock(self) -> None:
        """Callback invoked when workstation locks."""
        with self._lock:
            self.is_locked = True
            self.is_away = True
            self.last_lock_time = time.time()
            self.last_away_time = time.time()

        logger.info("🔒 Workstation locked - User marked as AWAY")
        self._log_event("SESSION_LOCK", details="Windows OS workstation session locked", is_locked=1)

        if self.on_lock:
            try:
                self.on_lock()
            except Exception as exc:
                logger.error("Error in on_lock callback: %s", exc)

    def _handle_session_unlock(self) -> None:
        """Callback invoked when workstation unlocks."""
        was_away = self.is_away
        with self._lock:
            self.is_locked = False
            self.is_away = False
            self.last_unlock_time = time.time()
            self.last_presence_time = time.time()
            self.last_wake_time = time.time()

        logger.info("🔓 Workstation unlocked - User marked as ACTIVE (Was Away=%s)", was_away)
        self._log_event("SESSION_UNLOCK", details="Windows OS workstation session unlocked", is_locked=0)

        catchup_summary = self.generate_catchup_summary(mark_processed=True) if was_away else None

        if self.on_unlock:
            try:
                import inspect
                sig = inspect.signature(self.on_unlock)
                if len(sig.parameters) >= 1:
                    self.on_unlock(catchup_summary)
                else:
                    self.on_unlock()
            except Exception as exc:
                logger.error("Error in on_unlock callback: %s", exc)

    # -------------------------------------------------------------------------
    # Simulation & Test Support
    # -------------------------------------------------------------------------
    def simulate_lock(self) -> None:
        """Simulates a workstation lock event."""
        self._handle_session_lock()

    def simulate_unlock(self) -> None:
        """Simulates a workstation unlock event."""
        self._handle_session_unlock()

    def simulate_double_clap(self, rms: float = 0.8, interval_ms: float = 200.0) -> bool:
        """
        Simulates two claps separated by interval_ms for testing.
        Returns True if the double-clap sequence successfully triggered.
        """
        t0 = time.time()
        chunk1 = create_pcm_frame(amplitude=rms, duration_ms=20.0)
        silence = create_pcm_frame(amplitude=0.0, duration_ms=20.0)
        chunk2 = create_pcm_frame(amplitude=rms, duration_ms=20.0)

        # First clap
        self.process_audio_chunk(chunk1, timestamp=t0)
        # Intermediary silence
        self.process_audio_chunk(silence, timestamp=t0 + 0.05)
        # Second clap at t0 + interval
        t1 = t0 + (interval_ms / 1000.0)
        return self.process_audio_chunk(chunk2, timestamp=t1)

    # -------------------------------------------------------------------------
    # Event Logging
    # -------------------------------------------------------------------------
    def _log_event(self, event_type: str, details: str, is_locked: int) -> None:
        """Asynchronously inserts an away or acoustic event into SQLite."""
        def _write():
            try:
                self.db_path.parent.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(str(self.db_path), timeout=5.0)
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS away_events (
                        id TEXT PRIMARY KEY,
                        event_type TEXT NOT NULL,
                        details TEXT,
                        timestamp REAL NOT NULL,
                        is_locked INTEGER NOT NULL
                    );
                    """
                )
                event_id = f"away-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}"
                conn.execute(
                    """
                    INSERT INTO away_events (id, event_type, details, timestamp, is_locked)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (event_id, event_type, details, time.time(), is_locked),
                )
                conn.commit()
                conn.close()
            except Exception as exc:
                logger.debug("Failed to log away event to database: %s", exc)

        threading.Thread(target=_write, name="AwayEventLogger", daemon=True).start()

    # -------------------------------------------------------------------------
    # Service Lifecycle
    # -------------------------------------------------------------------------
    def start(self, enable_audio: bool = False, enable_session_monitor: bool = True) -> bool:
        """
        Starts the AwayTracker service.

        Args:
            enable_audio: If True, attempts to start microphone capture via RealMicrophoneCapture.
            enable_session_monitor: If True, starts background Win32 session state monitoring.

        Returns:
            True if started successfully.
        """
        if self.is_monitoring:
            return True

        self.is_monitoring = True

        # 1. Start Session Monitor
        if enable_session_monitor:
            self._session_monitor.start()

        # 2. Optionally start real microphone capture
        if enable_audio:
            try:
                from core.runtime.audio_capture import RealMicrophoneCapture
                self._mic_capture = RealMicrophoneCapture()
                self._mic_capture.on_pcm_frame = self.process_audio_chunk
                started = self._mic_capture.start()
                if not started:
                    logger.warning("Failed to initialize RealMicrophoneCapture for AwayTracker")
            except Exception as exc:
                logger.warning("Could not start RealMicrophoneCapture: %s", exc)

        logger.info("AwayTracker service active (SpikeThreshold=%.2f, Window=[%.0fms, %.0fms])",
                    self.spike_threshold, self.min_clap_interval_ms, self.max_clap_interval_ms)
        return True

    def stop(self) -> None:
        """Stops the AwayTracker service and all underlying monitors."""
        if not self.is_monitoring:
            return

        self.is_monitoring = False

        if self._session_monitor:
            self._session_monitor.stop()

        if self._mic_capture:
            try:
                self._mic_capture.stop()
            except Exception as exc:
                logger.debug("Error stopping mic capture: %s", exc)
            self._mic_capture = None

        logger.info("AwayTracker service stopped")

    def __enter__(self) -> AwayTracker:
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()

    # -------------------------------------------------------------------------
    # Telemetry & Status
    # -------------------------------------------------------------------------
    def get_status(self) -> Dict[str, Any]:
        """Returns structured diagnostic telemetry of the AwayTracker."""
        with self._lock:
            # Sync lock status if changed externally
            current_locked = check_workstation_locked() if sys.platform == "win32" else self.is_locked
            if current_locked != self.is_locked:
                self.is_locked = current_locked
                self.is_away = current_locked

            return {
                "is_locked": self.is_locked,
                "is_away": self.is_away,
                "is_monitoring": self.is_monitoring,
                "double_clap_count": self._double_clap_count,
                "total_frames_processed": self._total_frames_processed,
                "last_rms": round(self._last_rms, 4),
                "last_spike_rms": round(self._last_spike_rms, 4),
                "last_presence_time": self.last_presence_time,
                "last_double_clap_time": self._last_double_clap_time,
                "last_lock_time": self.last_lock_time,
                "last_unlock_time": self.last_unlock_time,
                "last_away_time": self.last_away_time,
                "last_wake_time": self.last_wake_time,
                "pending_digest_count": len(self.get_pending_digest_events()),
                "spike_threshold": self.spike_threshold,
                "min_clap_interval_ms": self.min_clap_interval_ms,
                "max_clap_interval_ms": self.max_clap_interval_ms,
                "cooldown_ms": self.cooldown_ms,
                "auto_wake": self.auto_wake,
            }


# -----------------------------------------------------------------------------
# Module CLI Self-Test / Interactive Diagnostics
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 70)
    print(" NEXUS OS v5.0 - AwayTracker Acoustic Transient & Session Diagnostics")
    print("=" * 70)

    tracker = AwayTracker()
    print(f"[*] Initial Workstation Locked State: {check_workstation_locked()}")
    print(f"[*] Testing Double-Clap Simulation (200ms interval, RMS 0.8)...")

    detected = tracker.simulate_double_clap(rms=0.8, interval_ms=200.0)
    print(f"[+] Double-Clap Detection Result: {detected}")
    print(f"[*] Telemetry: {tracker.get_status()}")
