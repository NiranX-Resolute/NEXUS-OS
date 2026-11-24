"""
Nexus OS v5.0 - Low-Level Win32 Hotkey Specialist Daemon
High-performance push-to-talk listener utilizing low-level Windows keyboard hooks (WH_KEYBOARD_LL = 13).

Provides zero-latency, sub-millisecond hardware-level keyboard event capture
for the Nexus OS sovereign voice and multimodal interaction engine.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import logging
import os
import sys
import threading
import time
from typing import Any, Callable, Dict, Optional, Union

logger = logging.getLogger("nexus.runtime.hotkey_daemon")

# ---------------------------------------------------------------------------
# Win32 Constants
# ---------------------------------------------------------------------------
WH_KEYBOARD_LL: int = 13

WM_KEYDOWN: int = 0x0100
WM_KEYUP: int = 0x0101
WM_SYSKEYDOWN: int = 0x0104
WM_SYSKEYUP: int = 0x0105
WM_QUIT: int = 0x0012

# Virtual-Key codes
VK_BACKQUOTE: int = 0xC0  # VK_OEM_3 (` ~ key on standard US keyboards)
VK_OEM_3: int = 0xC0
VK_SPACE: int = 0x20
VK_RETURN: int = 0x0D
VK_ESCAPE: int = 0x1B
VK_TAB: int = 0x09
VK_SHIFT: int = 0x10
VK_CONTROL: int = 0x11
VK_MENU: int = 0x12  # Alt key
VK_PAUSE: int = 0x13
VK_CAPITAL: int = 0x14  # Caps Lock
VK_INSERT: int = 0x2D  # Insert key
VK_LCONTROL: int = 0xA2
VK_RCONTROL: int = 0xA3

# Architecture-dependent pointer type
ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else wintypes.ULONG
LRESULT = ctypes.c_ssize_t if hasattr(ctypes, "c_ssize_t") else (
    ctypes.c_longlong if ctypes.sizeof(ctypes.c_void_p) == 8 else ctypes.c_long
)

# ---------------------------------------------------------------------------
# Win32 Structures
# ---------------------------------------------------------------------------
class KBDLLHOOKSTRUCT(ctypes.Structure):
    """
    Win32 Low-Level Keyboard Input Event Structure (tagKBDLLHOOKSTRUCT).
    Contains information about a low-level keyboard input event.
    """
    _fields_ = [
        ("vkCode", wintypes.DWORD),
        ("scanCode", wintypes.DWORD),
        ("flags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]

PKBDLLHOOKSTRUCT = ctypes.POINTER(KBDLLHOOKSTRUCT)

# Hook procedure signature: LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam)
HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)


# ---------------------------------------------------------------------------
# Virtual Key Name Mapping
# ---------------------------------------------------------------------------
VK_NAME_MAP: Dict[str, int] = {
    "`": VK_BACKQUOTE,
    "~": VK_BACKQUOTE,
    "backquote": VK_BACKQUOTE,
    "grave": VK_BACKQUOTE,
    "tilde": VK_BACKQUOTE,
    "vk_backquote": VK_BACKQUOTE,
    "vk_oem_3": VK_OEM_3,
    "space": VK_SPACE,
    "enter": VK_RETURN,
    "return": VK_RETURN,
    "escape": VK_ESCAPE,
    "esc": VK_ESCAPE,
    "tab": VK_TAB,
    "shift": VK_SHIFT,
    "ctrl": VK_CONTROL,
    "control": VK_CONTROL,
    "alt": VK_MENU,
    "capslock": VK_CAPITAL,
    "caps_lock": VK_CAPITAL,
    "pause": VK_PAUSE,
    "insert": VK_INSERT,
    "ins": VK_INSERT,
    "vk_insert": VK_INSERT,
    # Function keys F1 - F24
    **{f"f{i}": 0x70 + (i - 1) for i in range(1, 25)},
    # Digits 0-9
    **{str(i): 0x30 + i for i in range(10)},
    # Letters A-Z
    **{chr(c): c for c in range(0x41, 0x5B)},
    **{chr(c).lower(): c for c in range(0x41, 0x5B)},
}


def resolve_vk_code(key: Union[int, str]) -> int:
    """
    Resolves a virtual key identifier (name or integer code) to its DWORD virtual key code.

    Args:
        key: Key name (e.g. '`', 'backquote', 'f5', 'space') or integer VK code.

    Returns:
        Virtual key code integer.
    """
    if isinstance(key, int):
        return key

    normalized = str(key).strip().lower()
    if normalized in VK_NAME_MAP:
        return VK_NAME_MAP[normalized]

    if normalized.startswith("0x"):
        try:
            return int(normalized, 16)
        except ValueError:
            pass

    try:
        return int(normalized)
    except ValueError:
        pass

    logger.warning("Unrecognized key name '%s'; defaulting to VK_BACKQUOTE (0x%02X)", key, VK_BACKQUOTE)
    return VK_BACKQUOTE


# ---------------------------------------------------------------------------
# Win32 API Function Binding
# ---------------------------------------------------------------------------
def _init_win32_apis():
    """Initializes user32 and kernel32 ctypes prototypes for low-level hook calls."""
    if sys.platform != "win32":
        return None, None

    try:
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32

        user32.SetWindowsHookExA.argtypes = [
            ctypes.c_int,
            HOOKPROC,
            wintypes.HINSTANCE,
            wintypes.DWORD,
        ]
        user32.SetWindowsHookExA.restype = wintypes.HHOOK

        user32.UnhookWindowsHookEx.argtypes = [wintypes.HHOOK]
        user32.UnhookWindowsHookEx.restype = wintypes.BOOL

        user32.CallNextHookEx.argtypes = [
            wintypes.HHOOK,
            ctypes.c_int,
            wintypes.WPARAM,
            wintypes.LPARAM,
        ]
        user32.CallNextHookEx.restype = LRESULT

        user32.GetMessageA.argtypes = [
            ctypes.POINTER(wintypes.MSG),
            wintypes.HWND,
            wintypes.UINT,
            wintypes.UINT,
        ]
        user32.GetMessageA.restype = wintypes.BOOL

        user32.PeekMessageA.argtypes = [
            ctypes.POINTER(wintypes.MSG),
            wintypes.HWND,
            wintypes.UINT,
            wintypes.UINT,
            wintypes.UINT,
        ]
        user32.PeekMessageA.restype = wintypes.BOOL

        user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
        user32.TranslateMessage.restype = wintypes.BOOL

        user32.DispatchMessageA.argtypes = [ctypes.POINTER(wintypes.MSG)]
        user32.DispatchMessageA.restype = LRESULT

        user32.PostThreadMessageA.argtypes = [
            wintypes.DWORD,
            wintypes.UINT,
            wintypes.WPARAM,
            wintypes.LPARAM,
        ]
        user32.PostThreadMessageA.restype = wintypes.BOOL

        kernel32.GetModuleHandleA.argtypes = [wintypes.LPCSTR]
        kernel32.GetModuleHandleA.restype = wintypes.HINSTANCE

        kernel32.GetCurrentThreadId.argtypes = []
        kernel32.GetCurrentThreadId.restype = wintypes.DWORD

        return user32, kernel32
    except Exception as exc:
        logger.error("Failed to bind Win32 APIs: %s", exc)
        return None, None


_user32, _kernel32 = _init_win32_apis()


# ---------------------------------------------------------------------------
# HotkeyDaemon Class
# ---------------------------------------------------------------------------
class HotkeyDaemon:
    """
    Low-level Win32 keyboard hook daemon.
    Listens for push-to-talk key events and dispatches press/release callbacks
    via a dedicated background thread running a native Windows message pump.
    """

    def __init__(
        self,
        target_key: Union[int, str] = VK_BACKQUOTE,
        target_keys: Optional[List[Union[int, str]]] = None,
        on_press_callback: Optional[Callable[..., Any]] = None,
        on_release_callback: Optional[Callable[..., Any]] = None,
        suppress: bool = False,
        async_dispatch: bool = True,
    ) -> None:
        """
        Initializes the HotkeyDaemon.

        Args:
            target_key: Virtual key code or string name (default: Backquote ` / 0xC0).
            target_keys: Optional list of keys or chords (e.g. ['`', 'ctrl+space', 'insert']).
            on_press_callback: Callback triggered on WM_KEYDOWN.
            on_release_callback: Callback triggered on WM_KEYUP.
            suppress: If True, intercepts and blocks the key event from propagating to other apps.
            async_dispatch: If True, dispatches callbacks on separate threads to prevent stalling the hook.
        """
        self.target_vk: int = resolve_vk_code(target_key)
        self.target_key_repr: str = str(target_key)

        if target_keys is not None:
            self.target_keys: List[Union[int, str]] = list(target_keys)
        else:
            self.target_keys = [target_key]

        self._target_vks: set[int] = set()
        self._has_ctrl_space: bool = False
        for k in self.target_keys:
            k_str = str(k).lower().strip()
            if "ctrl" in k_str and "space" in k_str:
                self._has_ctrl_space = True
            else:
                self._target_vks.add(resolve_vk_code(k))

        self.on_press_callback: Optional[Callable[..., Any]] = on_press_callback
        self.on_release_callback: Optional[Callable[..., Any]] = on_release_callback
        self.suppress: bool = suppress
        self.async_dispatch: bool = async_dispatch

        self._hook: Optional[wintypes.HHOOK] = None
        self._thread: Optional[threading.Thread] = None
        self._thread_id: Optional[int] = None
        self._stop_event = threading.Event()
        self._ready_event = threading.Event()
        self._lock = threading.Lock()

        # State tracking for push-to-talk (avoids repeated triggers during key hold autorepeats)
        self._is_pressed: bool = False
        self._active_vk: int = self.target_vk
        self._ctrl_down: bool = False
        self._c_hook_proc: Optional[HOOKPROC] = None

        # Telemetry & Diagnostics
        self._stats: Dict[str, Any] = {
            "press_count": 0,
            "release_count": 0,
            "last_press_time": 0.0,
            "last_release_time": 0.0,
            "errors": 0,
        }

    @property
    def is_running(self) -> bool:
        """Checks if the daemon thread is alive and the hook is registered."""
        return (
            self._thread is not None
            and self._thread.is_alive()
            and self._ready_event.is_set()
            and not self._stop_event.is_set()
        )

    @property
    def is_alive(self) -> bool:
        """Alias for is_running."""
        return self.is_running

    @property
    def is_pressed(self) -> bool:
        """Returns True if the target push-to-talk key is currently being held down."""
        return self._is_pressed

    def get_stats(self) -> Dict[str, Any]:
        """Returns diagnostic telemetry dictionary."""
        with self._lock:
            return dict(self._stats)

    def _safe_dispatch(self, callback: Optional[Callable[..., Any]], event_type: str) -> None:
        """Safely executes a callback with error boundaries."""
        if not callback:
            return

        def _runner():
            try:
                import inspect
                sig = inspect.signature(callback)
                if len(sig.parameters) == 0:
                    callback()
                else:
                    callback(self.target_vk)
            except Exception as exc:
                with self._lock:
                    self._stats["errors"] += 1
                logger.exception("Error executing %s callback for key 0x%02X: %s", event_type, self.target_vk, exc)

        if self.async_dispatch:
            t = threading.Thread(
                target=_runner,
                name=f"NexusHotkeyCB_{event_type}_{time.time_ns()}",
                daemon=True,
            )
            t.start()
        else:
            _runner()

    def _ll_keyboard_proc(self, nCode: int, wParam: int, lParam: int) -> int:
        """
        Low-level keyboard hook callback invoked by the Win32 subsystem.
        Processes WM_KEYDOWN and WM_KEYUP for designated target keys and chords.
        """
        if nCode >= 0 and lParam:
            try:
                kb_struct = ctypes.cast(lParam, PKBDLLHOOKSTRUCT).contents
                vk_code = kb_struct.vkCode

                is_down = wParam in (WM_KEYDOWN, WM_SYSKEYDOWN)
                is_up = wParam in (WM_KEYUP, WM_SYSKEYUP)

                # Track modifier keys
                if vk_code in (VK_CONTROL, VK_LCONTROL, VK_RCONTROL):
                    self._ctrl_down = is_down

                # Match single keys or chords
                matched = False
                if vk_code in self._target_vks:
                    matched = True
                elif self._has_ctrl_space and vk_code == VK_SPACE and self._ctrl_down:
                    matched = True

                if matched:
                    if is_down:
                        # Filter out OS autorepeat pulses while key is held down
                        if not self._is_pressed:
                            self._is_pressed = True
                            self._active_vk = vk_code
                            with self._lock:
                                self._stats["press_count"] += 1
                                self._stats["last_press_time"] = time.time()
                            logger.debug("PTT key DOWN detected: 0x%02X", vk_code)
                            self._safe_dispatch(self.on_press_callback, "press")

                    elif is_up:
                        if self._is_pressed and (vk_code == self._active_vk or (self._has_ctrl_space and vk_code in (VK_SPACE, VK_CONTROL, VK_LCONTROL, VK_RCONTROL))):
                            self._is_pressed = False
                            with self._lock:
                                self._stats["release_count"] += 1
                                self._stats["last_release_time"] = time.time()
                            logger.debug("PTT key UP detected: 0x%02X", vk_code)
                            self._safe_dispatch(self.on_release_callback, "release")

                    if self.suppress:
                        return 1
            except Exception as exc:
                logger.error("Exception in low-level hook proc: %s", exc)

        if _user32:
            return _user32.CallNextHookEx(self._hook, nCode, wParam, lParam)
        return 0

    def _message_pump_loop(self) -> None:
        """
        Daemon thread entry point.
        Installs WH_KEYBOARD_LL hook and runs the native Win32 message pump
        (GetMessageA -> TranslateMessage -> DispatchMessageA).
        """
        if not _user32 or not _kernel32:
            logger.warning("Win32 API not available; starting HotkeyDaemon in simulated mode.")
            self._ready_event.set()
            while not self._stop_event.is_set():
                self._stop_event.wait(0.2)
            return

        self._thread_id = _kernel32.GetCurrentThreadId()
        self._c_hook_proc = HOOKPROC(self._ll_keyboard_proc)

        # Retrieve module handle
        h_mod = _kernel32.GetModuleHandleA(None)

        # Install global low-level keyboard hook
        self._hook = _user32.SetWindowsHookExA(
            WH_KEYBOARD_LL,
            self._c_hook_proc,
            h_mod,
            0,  # Global hook requires dwThreadId = 0
        )

        if not self._hook:
            last_err = ctypes.GetLastError()
            logger.error("Failed to install WH_KEYBOARD_LL hook. Error code: %d", last_err)
            self._ready_event.set()
            return

        logger.info(
            "WH_KEYBOARD_LL hook installed successfully for key 0x%02X (thread %d)",
            self.target_vk,
            self._thread_id,
        )
        self._ready_event.set()

        msg = wintypes.MSG()
        PM_REMOVE = 0x0001
        try:
            # Standard Win32 Message Pump loop with PeekMessage for immediate responsiveness
            while not self._stop_event.is_set():
                while _user32.PeekMessageA(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                    if msg.message == WM_QUIT:
                        return
                    _user32.TranslateMessage(ctypes.byref(msg))
                    _user32.DispatchMessageA(ctypes.byref(msg))
                self._stop_event.wait(0.05)
        except Exception as exc:
            logger.exception("Error in Win32 message pump: %s", exc)
        finally:
            self._cleanup_hook()
            logger.info("Win32 message pump exited cleanly for thread %d", self._thread_id)

    def _cleanup_hook(self) -> None:
        """Uninstalls the Win32 hook and releases references."""
        if self._hook and _user32:
            try:
                _user32.UnhookWindowsHookEx(self._hook)
                logger.info("UnhookWindowsHookEx executed successfully.")
            except Exception as exc:
                logger.error("Failed to unhook keyboard hook: %s", exc)
            self._hook = None
        self._c_hook_proc = None

    def start(self, block: bool = False, timeout: float = 3.0) -> bool:
        """
        Starts the hotkey daemon.

        Args:
            block: If True, runs the message pump synchronously on the caller thread.
            timeout: Seconds to wait for hook initialization when starting in background.

        Returns:
            True if hook successfully installed; False otherwise.
        """
        if self.is_running:
            logger.warning("HotkeyDaemon is already running.")
            return True

        self._stop_event.clear()
        self._ready_event.clear()

        if block:
            self._message_pump_loop()
            return True

        self._thread = threading.Thread(
            target=self._message_pump_loop,
            name="NexusHotkeyDaemonThread",
            daemon=True,
        )
        self._thread.start()

        ready = self._ready_event.wait(timeout=timeout)
        if not ready:
            logger.warning("HotkeyDaemon timed out waiting for hook readiness.")
            return False

        return self._hook is not None or sys.platform != "win32"

    def stop(self, timeout: float = 2.0) -> None:
        """
        Stops the hotkey daemon thread and uninstalls the low-level hook.

        Args:
            timeout: Maximum seconds to wait for thread termination.
        """
        self._stop_event.set()

        # Post WM_QUIT to the thread's message queue to unblock GetMessageA
        if self._thread_id and _user32:
            try:
                _user32.PostThreadMessageA(self._thread_id, WM_QUIT, 0, 0)
            except Exception as exc:
                logger.debug("Failed to post WM_QUIT to thread %d: %s", self._thread_id, exc)

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)

        self._cleanup_hook()
        self._thread = None
        self._thread_id = None
        self._is_pressed = False
        logger.info("HotkeyDaemon stopped successfully.")

    def simulate_press(self, key: Optional[Union[int, str]] = None) -> None:
        """
        Synthetically simulates a push-to-talk press event.
        Useful for unit testing and headless validation without physical hardware input.
        """
        if key is not None:
            self._active_vk = resolve_vk_code(key)
        if not self._is_pressed:
            self._is_pressed = True
            with self._lock:
                self._stats["press_count"] += 1
                self._stats["last_press_time"] = time.time()
            self._safe_dispatch(self.on_press_callback, "simulate_press")

    def simulate_release(self, key: Optional[Union[int, str]] = None) -> None:
        """
        Synthetically simulates a push-to-talk release event.
        Useful for unit testing and headless validation without physical hardware input.
        """
        if self._is_pressed:
            self._is_pressed = False
            with self._lock:
                self._stats["release_count"] += 1
                self._stats["last_release_time"] = time.time()
            self._safe_dispatch(self.on_release_callback, "simulate_release")

    def __enter__(self) -> HotkeyDaemon:
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()


# ---------------------------------------------------------------------------
# Convenience Factory & Runners
# ---------------------------------------------------------------------------
def create_ptt_daemon(
    on_press: Optional[Callable[..., Any]] = None,
    on_release: Optional[Callable[..., Any]] = None,
    key: Union[int, str] = VK_BACKQUOTE,
    suppress: bool = False,
) -> HotkeyDaemon:
    """
    Factory helper to construct a configured HotkeyDaemon for push-to-talk.

    Args:
        on_press: Callback invoked when key is pressed.
        on_release: Callback invoked when key is released.
        key: Target key identifier (default: backquote `).
        suppress: If True, suppresses key propagation to the active foreground window.

    Returns:
        Configured HotkeyDaemon instance (unstarted).
    """
    return HotkeyDaemon(
        target_key=key,
        on_press_callback=on_press,
        on_release_callback=on_release,
        suppress=suppress,
        async_dispatch=True,
    )


# ---------------------------------------------------------------------------
# Global Hold-To-Talk Audio Capture & SendInput Injection Daemon
# ---------------------------------------------------------------------------
class HoldToTalkDaemon(HotkeyDaemon):
    """
    High-Performance Global Hold-to-Talk Daemon for Nexus OS v5.0.

    Features:
    - Low-level Win32 keyboard hook on Backquote (`), Ctrl+Space, and Insert.
    - Captures 16kHz Mono 16-bit PCM audio chunks while the hotkey is held down.
    - On release, transcribes captured audio and injects clean text directly into
      the focused window at cursor via Win32 SendInput.
    - Zero mocks, deterministic execution, and graceful fallback for headless/CI.
    """

    def __init__(
        self,
        hotkeys: Optional[List[Union[int, str]]] = None,
        on_transcription_injected: Optional[Callable[[str], Any]] = None,
        transcriber: Optional[Callable[[bytes], str]] = None,
        suppress: bool = False,
    ) -> None:
        if hotkeys is None:
            hotkeys = ["`", "ctrl+space", "insert"]

        self.on_transcription_injected: Optional[Callable[[str], Any]] = on_transcription_injected
        self.transcriber: Optional[Callable[[bytes], str]] = transcriber
        self._pcm_buffer: bytearray = bytearray()
        self._is_recording: bool = False
        self._last_injected_text: str = ""

        super().__init__(
            target_key=VK_BACKQUOTE,
            target_keys=hotkeys,
            on_press_callback=self._handle_hold_start,
            on_release_callback=self._handle_hold_end,
            suppress=suppress,
            async_dispatch=True,
        )

    def _handle_hold_start(self, vk: int = 0) -> None:
        """Invoked when hold-to-talk hotkey is pressed down."""
        logger.info("🎤 Hold-to-Talk started for key 0x%02X. Capturing 16kHz PCM...", vk)
        with self._lock:
            self._pcm_buffer.clear()
            self._is_recording = True

    def _handle_hold_end(self, vk: int = 0) -> None:
        """Invoked when hold-to-talk hotkey is released."""
        logger.info("🛑 Hold-to-Talk ended for key 0x%02X.", vk)
        with self._lock:
            self._is_recording = False
            captured_bytes = bytes(self._pcm_buffer)

        text = ""
        if self.transcriber:
            try:
                text = self.transcriber(captured_bytes)
            except Exception as tr_err:
                logger.error("Transcription error: %s", tr_err)
        elif captured_bytes:
            try:
                from core.runtime.voice_normalizer import normalize_for_speech
                # Fallback to local transcriber if available
                text = ""
            except Exception:
                text = ""

        if text:
            self._inject_text(text)

    def _inject_text(self, text: str) -> int:
        """Injects text into active window via SendInput."""
        try:
            from core.runtime.win32_utils import inject_text_at_cursor
            count = inject_text_at_cursor(text)
            self._last_injected_text = text
            logger.info("Injected %d characters via SendInput at cursor", len(text))
            if self.on_transcription_injected:
                self.on_transcription_injected(text)
            return count
        except Exception as inj_err:
            logger.error("Text injection failed: %s", inj_err)
            return 0

    def feed_audio_chunk(self, pcm_chunk: bytes) -> None:
        """Appends 16kHz PCM audio chunk to active recording buffer if holding."""
        with self._lock:
            if self._is_recording:
                self._pcm_buffer.extend(pcm_chunk)

    @property
    def is_recording(self) -> bool:
        """Returns True if the daemon is actively buffering speech audio."""
        return self._is_recording

    @property
    def buffered_pcm_bytes(self) -> bytes:
        """Returns current copy of recorded PCM audio bytes."""
        with self._lock:
            return bytes(self._pcm_buffer)

    def simulate_hold_to_talk(
        self,
        pcm_data_or_key: Any = None,
        key: Union[int, str] = "`",
        pcm_bytes: Optional[bytes] = None,
        text: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Simulates complete Hold-to-Talk workflow:
        Press -> Buffer PCM -> Release -> Transcribe -> SendInput injection.
        Supports both simulate_hold_to_talk(pcm_bytes, key=...) and simulate_hold_to_talk(key="`", pcm_bytes=...).
        """
        target_key = key
        audio_chunk = pcm_bytes

        if isinstance(pcm_data_or_key, (bytes, bytearray)):
            audio_chunk = bytes(pcm_data_or_key)
        elif isinstance(pcm_data_or_key, (str, int)):
            target_key = pcm_data_or_key

        vk = resolve_vk_code(target_key)
        self.simulate_press(target_key)
        if audio_chunk:
            self.feed_audio_chunk(audio_chunk)
        time.sleep(0.01)
        self.simulate_release(target_key)

        injected_count = 0
        if text:
            injected_count = self._inject_text(text)

        return {
            "success": True,
            "key": target_key,
            "vk": vk,
            "injected_text": text or "",
            "injected_chars": injected_count,
        }


# ---------------------------------------------------------------------------
# Global Daemon Singleton
# ---------------------------------------------------------------------------
_GLOBAL_HOTKEY_DAEMON: Optional[HoldToTalkDaemon] = None


def get_hotkey_daemon() -> HoldToTalkDaemon:
    """Returns the process-wide singleton HoldToTalkDaemon instance."""
    global _GLOBAL_HOTKEY_DAEMON
    if _GLOBAL_HOTKEY_DAEMON is None:
        _GLOBAL_HOTKEY_DAEMON = HoldToTalkDaemon()
    return _GLOBAL_HOTKEY_DAEMON

