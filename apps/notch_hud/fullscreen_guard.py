"""Nexus Notch HUD - Fullscreen Guard & Stealth Mode.

Provides Windows low-level API detection via SHQueryUserNotificationState to protect
user immersion by suppressing the Notch HUD during:
- Full-screen DirectX / Vulkan / OpenGL games
- Presentation mode (PowerPoint / Keynote / displays)
- Active conference meetings (Zoom, Microsoft Teams, Webex, Google Meet)

Also provides window stealth affinity via SetWindowDisplayAffinity with
WDA_EXCLUDEFROMCAPTURE (0x00000011) to hide the Notch HUD from OBS, Discord,
and screen-sharing applications.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from enum import IntEnum
import logging
import os
import sys
from typing import Callable, Optional

logger = logging.getLogger("nexus.notch_hud.fullscreen_guard")

# -------------------------------------------------------------------------
# Win32 Constants
# -------------------------------------------------------------------------
WDA_NONE = 0x00000000
WDA_MONITOR = 0x00000001
WDA_EXCLUDEFROMCAPTURE = 0x00000011

GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_TOPMOST = 0x00000008
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_NOACTIVATE = 0x08000000


# -------------------------------------------------------------------------
# Win32 SHQueryUserNotificationState Enumerations
# -------------------------------------------------------------------------
class QUERY_USER_NOTIFICATION_STATE(IntEnum):
    """Notification state enumeration returned by shell32.SHQueryUserNotificationState."""

    QUNS_NOT_PRESENT = 1
    QUNS_BUSY = 2
    QUNS_RUNNING_D3D_FULL_SCREEN = 3
    QUNS_PRESENTATION_MODE = 4
    QUNS_ACCEPTS_NOTIFICATIONS = 5
    QUNS_QUIET_TIME = 6
    QUNS_APP = 7


# -------------------------------------------------------------------------
# CTypes Setup (Windows Only)
# -------------------------------------------------------------------------
if sys.platform == "win32":
    try:
        _user32 = ctypes.windll.user32
        _shell32 = ctypes.windll.shell32

        # SetWindowDisplayAffinity(HWND hWnd, DWORD dwAffinity) -> BOOL
        _user32.SetWindowDisplayAffinity.argtypes = [wintypes.HWND, wintypes.DWORD]
        _user32.SetWindowDisplayAffinity.restype = wintypes.BOOL

        # SHQueryUserNotificationState(QUERY_USER_NOTIFICATION_STATE *pquns) -> HRESULT
        _shell32.SHQueryUserNotificationState.argtypes = [ctypes.POINTER(ctypes.c_int)]
        _shell32.SHQueryUserNotificationState.restype = ctypes.c_long

        # GetForegroundWindow() -> HWND
        _user32.GetForegroundWindow.argtypes = []
        _user32.GetForegroundWindow.restype = wintypes.HWND

        # GetWindowTextW(HWND, LPWSTR, int) -> int
        _user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        _user32.GetWindowTextW.restype = ctypes.c_int

        # GetWindowThreadProcessId(HWND, LPDWORD) -> DWORD
        _user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        _user32.GetWindowThreadProcessId.restype = wintypes.DWORD

        # IsWindowVisible(HWND) -> BOOL
        _user32.IsWindowVisible.argtypes = [wintypes.HWND]
        _user32.IsWindowVisible.restype = wintypes.BOOL

        # EnumWindows(WNDENUMPROC, LPARAM) -> BOOL
        _WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        _user32.EnumWindows.argtypes = [_WNDENUMPROC, wintypes.LPARAM]
        _user32.EnumWindows.restype = wintypes.BOOL

    except Exception as exc:
        logger.warning("Failed to initialize ctypes Win32 bindings: %s", exc)
        _user32 = None
        _shell32 = None
else:
    _user32 = None
    _shell32 = None


# Known meeting application window substrings and process hints
_MEETING_KEYWORDS = (
    "zoom meeting",
    "microsoft teams",
    "webex",
    "google meet",
    "slack huddle",
    "discord - voice",
)

CALL_APP_PROCESSES = (
    "zoom.exe",
    "teams.exe",
    "ms-teams.exe",
    "discord.exe",
    "skype.exe",
    "webex.exe",
    "ciscowebexstart.exe",
    "slack.exe",
)


# -------------------------------------------------------------------------
# Call-Aware & Microphone Active Detection
# -------------------------------------------------------------------------
def _check_mic_consent_store() -> tuple[bool, str | None]:
    """Checks Windows CapabilityAccessManager ConsentStore registry for active microphone capture.

    Returns (True, app_identifier) if any app is currently using the microphone
    (LastUsedTimeStop == 0 and LastUsedTimeStart > 0).
    """
    if sys.platform != "win32":
        return False, None

    try:
        import winreg
    except ImportError:
        return False, None

    keys_to_check = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone",
    ]

    for root_path in keys_to_check:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, root_path, 0, winreg.KEY_READ) as root_key:
                num_subkeys, _, _ = winreg.QueryInfoKey(root_key)
                for i in range(num_subkeys):
                    try:
                        subkey_name = winreg.EnumKey(root_key, i)
                        if subkey_name.lower() == "nonpackaged":
                            continue
                        with winreg.OpenKey(root_key, subkey_name, 0, winreg.KEY_READ) as subkey:
                            try:
                                stop_time, _ = winreg.QueryValueEx(subkey, "LastUsedTimeStop")
                                start_time, _ = winreg.QueryValueEx(subkey, "LastUsedTimeStart")
                                if stop_time == 0 and start_time > 0:
                                    clean_name = (
                                        subkey_name.replace("/", "\\")
                                        .split("\\")[-1]
                                        .split("#")[-1]
                                        .lower()
                                    )
                                    return True, clean_name or subkey_name
                            except FileNotFoundError:
                                pass
                    except OSError:
                        continue
        except (FileNotFoundError, OSError):
            continue

    return False, None


def _check_pycaw_sessions() -> tuple[bool, str | None]:
    """Enumerates active audio sessions via pycaw / IAudioSessionManager2."""
    if sys.platform != "win32":
        return False, None

    try:
        from pycaw.pycaw import AudioUtilities
    except ImportError:
        logger.debug("pycaw is not available; skipping audio session enumeration")
        return False, None

    com_initialized = False
    try:
        hr = ctypes.windll.ole32.CoInitialize(None)
        com_initialized = hr in (0, 1)
    except Exception:
        pass

    try:
        sessions = AudioUtilities.GetAllSessions()
        for session in sessions:
            if not session:
                continue
            proc = getattr(session, "Process", None)
            if proc is not None:
                try:
                    pname = proc.name().lower()
                except Exception:
                    pname = ""
                if pname in CALL_APP_PROCESSES:
                    try:
                        ctl = getattr(session, "_ctl", None)
                        if ctl and hasattr(ctl, "GetState"):
                            if ctl.GetState() == 1:
                                return True, pname
                        else:
                            return True, pname
                    except Exception:
                        return True, pname
    except Exception as exc:
        logger.debug("Exception querying pycaw audio sessions: %s", exc)
    finally:
        if com_initialized:
            try:
                ctypes.windll.ole32.CoUninitialize()
            except Exception:
                pass

    return False, None


CALL_WINDOW_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("zoom meeting", "zoom"),
    ("zoom webinar", "zoom"),
    ("zoom cloud meetings", "zoom"),
    ("microsoft teams", "teams"),
    ("teams meeting", "teams"),
    ("google meet", "google_meet"),
    ("meet.google.com", "google_meet"),
    ("discord", "discord"),
    ("discord - voice", "discord"),
    ("cisco webex", "webex"),
    ("webex meeting", "webex"),
    ("slack huddle", "slack"),
    ("slack call", "slack"),
)


def _check_call_window_titles() -> tuple[bool, str | None]:
    """Inspects visible window titles for active conference sessions (Zoom, Teams, Discord, Google Meet)."""
    if sys.platform != "win32" or _user32 is None:
        return False, None

    # 1. Check foreground window (<0.1ms)
    try:
        fg_hwnd = _user32.GetForegroundWindow()
        if fg_hwnd:
            buf = ctypes.create_unicode_buffer(512)
            length = _user32.GetWindowTextW(fg_hwnd, buf, 512)
            if length > 0:
                fg_title = buf.value.lower()
                for kw, app_id in CALL_WINDOW_KEYWORDS:
                    if kw in fg_title:
                        return True, app_id
    except Exception as fg_exc:
        logger.debug("Foreground window call title inspection notice: %s", fg_exc)

    # 2. Enumerate visible top-level windows (<2ms)
    found_app: list[str] = []

    def _enum_proc(hwnd: int, lparam: int) -> bool:
        if not _user32.IsWindowVisible(hwnd):
            return True
        buf = ctypes.create_unicode_buffer(512)
        length = _user32.GetWindowTextW(hwnd, buf, 512)
        if length > 0:
            title_lower = buf.value.lower()
            for kw, app_id in CALL_WINDOW_KEYWORDS:
                if kw in title_lower:
                    found_app.append(app_id)
                    return False
        return True

    try:
        _WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        cb = _WNDENUMPROC(_enum_proc)
        _user32.EnumWindows(cb, 0)
        if found_app:
            return True, found_app[0]
    except Exception as exc:
        logger.debug("EnumWindows call title inspection notice: %s", exc)

    return False, None


def is_active_call_running() -> tuple[bool, str | None]:
    """Detects whether an active conference call or voice chat is running.

    Checks:
    1. Fast zero-overhead Windows CapabilityAccessManager ConsentStore registry for active microphone capture
       (LastUsedTimeStop == 0 and LastUsedTimeStart > 0).
    2. Active Windows CoreAudio sessions via pycaw / IAudioSessionManager2 matching communication
       apps (zoom.exe, teams.exe, ms-teams.exe, discord.exe, skype.exe, webex.exe).
    3. Active conference session window titles for Zoom, Microsoft Teams, Discord, and Google Meet.

    Returns:
        tuple[bool, str | None]: (True, app_name) if an active call/mic usage is detected,
                                 (False, None) otherwise.
    """
    if sys.platform != "win32":
        return False, None

    # 1. Fast zero-overhead registry check (<1ms)
    mic_active, mic_app = _check_mic_consent_store()
    if mic_active:
        return True, mic_app

    # 2. pycaw CoreAudio active sessions check
    audio_active, audio_app = _check_pycaw_sessions()
    if audio_active:
        return True, audio_app

    # 3. Active conference session window title inspection (<2ms)
    title_active, title_app = _check_call_window_titles()
    if title_active:
        return True, title_app

    return False, None


# -------------------------------------------------------------------------
# Low-Level Win32 Query Functions
# -------------------------------------------------------------------------
def get_user_notification_state() -> Optional[QUERY_USER_NOTIFICATION_STATE]:
    """Queries shell32.SHQueryUserNotificationState for the system notification state.

    Returns:
        QUERY_USER_NOTIFICATION_STATE enum member if successful, None on error or non-Windows.
    """
    if sys.platform != "win32" or _shell32 is None:
        return None

    state_val = ctypes.c_int()
    try:
        hr = _shell32.SHQueryUserNotificationState(ctypes.byref(state_val))
        if hr == 0:  # S_OK
            return QUERY_USER_NOTIFICATION_STATE(state_val.value)
        logger.debug("SHQueryUserNotificationState returned HRESULT 0x%08X", hr)
        return None
    except Exception as exc:
        logger.debug("Exception in SHQueryUserNotificationState: %s", exc)
        return None


def is_fullscreen_game_active() -> bool:
    """Detects whether a full-screen DirectX, Vulkan, or OpenGL game is currently running.

    DirectX exclusive and borderless fullscreen games report
    QUNS_RUNNING_D3D_FULL_SCREEN (3).
    """
    state = get_user_notification_state()
    return state == QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN


def is_presentation_active() -> bool:
    """Detects whether Windows presentation mode or high-priority slide deck is active.

    Reports QUNS_PRESENTATION_MODE (4).
    """
    state = get_user_notification_state()
    return state == QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE


def is_meeting_active() -> bool:
    """Detects active conference meetings or high-priority busy presentation states.

    Windows reports QUNS_BUSY (2) during full-screen modal sessions or meetings.
    Additionally checks the foreground window title for meeting software keywords.
    """
    state = get_user_notification_state()
    if state == QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY:
        return True

    if sys.platform != "win32" or _user32 is None:
        return False

    try:
        fg_hwnd = _user32.GetForegroundWindow()
        if not fg_hwnd:
            return False

        buf = ctypes.create_unicode_buffer(512)
        length = _user32.GetWindowTextW(fg_hwnd, buf, 512)
        if length > 0:
            title_lower = buf.value.lower()
            if any(keyword in title_lower for keyword in _MEETING_KEYWORDS):
                logger.debug("Active meeting detected via window title: '%s'", buf.value)
                return True
    except Exception as exc:
        logger.debug("Exception checking meeting window: %s", exc)

    return False


def is_fullscreen_app_active() -> bool:
    """Unified check: returns True if fullscreen game, presentation, or meeting is active.

    Used by the Notch HUD guard loop to suppress and restore the Dynamic Island.
    """
    if sys.platform != "win32":
        return False

    state = get_user_notification_state()
    if state is None:
        return False

    # DX/OpenGL Fullscreen Game or Presentation Mode
    if state in (
        QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN,
        QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE,
    ):
        return True

    # Active Meeting or Busy Mode
    if state == QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY:
        return True

    # Check window title for meeting apps
    return is_meeting_active()


def should_suppress_hud() -> bool:
    """Returns True if fullscreen game, presentation, or active conference call/meeting is detected."""
    if is_fullscreen_app_active():
        return True
    is_call, _ = is_active_call_running()
    return is_call


# -------------------------------------------------------------------------
# Stealth Display Affinity
# -------------------------------------------------------------------------
def set_window_stealth_affinity(hwnd: int) -> bool:
    """Applies WDA_EXCLUDEFROMCAPTURE (0x00000011) to hide the window from OBS and screen captures.

    Args:
        hwnd: Native Win32 window handle (HWND).

    Returns:
        True if the affinity was applied successfully, False otherwise.
    """
    if sys.platform != "win32" or _user32 is None:
        logger.debug("Stealth affinity not supported on non-Windows platform")
        return False

    if not hwnd:
        logger.warning("Invalid HWND provided to set_window_stealth_affinity")
        return False

    # If NEXUS_NOTCH_CAPTURE=1, allow capture (for automated UI testing or development)
    if os.environ.get("NEXUS_NOTCH_CAPTURE") == "1":
        logger.info("NEXUS_NOTCH_CAPTURE=1 active; bypassing stealth capture exclusion for HWND 0x%X", hwnd)
        try:
            _user32.SetWindowDisplayAffinity(wintypes.HWND(hwnd), wintypes.DWORD(WDA_NONE))
        except Exception:
            pass
        return True

    try:
        result = _user32.SetWindowDisplayAffinity(
            wintypes.HWND(hwnd),
            wintypes.DWORD(WDA_EXCLUDEFROMCAPTURE),
        )
        success = bool(result)
        if success:
            logger.info("Stealth affinity WDA_EXCLUDEFROMCAPTURE successfully applied to HWND 0x%X", hwnd)
        else:
            err = ctypes.GetLastError()
            logger.warning("SetWindowDisplayAffinity failed on HWND 0x%X (error: %d)", hwnd, err)
        return success
    except Exception as exc:
        logger.error("Exception in set_window_stealth_affinity: %s", exc)
        return False


# Compatibility alias
set_stealth_affinity = set_window_stealth_affinity


# -------------------------------------------------------------------------
# FullscreenGuard Manager Class
# -------------------------------------------------------------------------
class FullscreenGuard:
    """Manages fullscreen, presentation, and meeting detection lifecycle for the Notch HUD."""

    def __init__(
        self,
        on_suppress: Optional[Callable[[], None]] = None,
        on_restore: Optional[Callable[[], None]] = None,
    ) -> None:
        self.on_suppress = on_suppress
        self.on_restore = on_restore
        self._is_suppressed = False

    @property
    def is_suppressed(self) -> bool:
        """Returns True if the HUD is currently marked as suppressed."""
        return self._is_suppressed

    def check_state(self) -> dict:
        """Evaluates current system notification state and returns detailed inspection status."""
        state = get_user_notification_state()
        state_name = state.name if state else "UNKNOWN"
        is_game = is_fullscreen_game_active()
        is_pres = is_presentation_active()
        is_meet = is_meeting_active()
        is_call, call_app = is_active_call_running()
        suppress = is_game or is_pres or is_meet or is_call

        return {
            "notification_state": state_name,
            "is_fullscreen_game": is_game,
            "is_presentation": is_pres,
            "is_meeting": is_meet,
            "is_active_call": is_call,
            "active_call_app": call_app,
            "should_suppress": suppress,
        }

    def poll_guard(self) -> bool:
        """Runs a single guard check iteration, triggering on_suppress or on_restore callbacks.

        Returns:
            Current suppression state (True if suppressed/hidden, False if visible).
        """
        suppress = should_suppress_hud()

        if suppress and not self._is_suppressed:
            logger.info("Fullscreen or meeting mode detected; suppressing Notch HUD.")
            self._is_suppressed = True
            if self.on_suppress:
                try:
                    self.on_suppress()
                except Exception as exc:
                    logger.warning("Error in on_suppress callback: %s", exc)

        elif not suppress and self._is_suppressed:
            logger.info("Fullscreen / meeting mode cleared; restoring Notch HUD.")
            self._is_suppressed = False
            if self.on_restore:
                try:
                    self.on_restore()
                except Exception as exc:
                    logger.warning("Error in on_restore callback: %s", exc)

        return self._is_suppressed
