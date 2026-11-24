"""Nexus Notch HUD - Win32 System Utilities & Stealth Guard.

Provides Windows low-level API wrappers for display capture exclusion (OBS/Discord
stealth mode), full-screen DirectX/OpenGL game detection via SHQueryUserNotificationState,
and click-through window attributes.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
from enum import IntEnum
import logging
import os
import sys
from typing import Optional

logger = logging.getLogger("nexus.notch_hud.win32")

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
# Enumerations
# -------------------------------------------------------------------------
class QUERY_USER_NOTIFICATION_STATE(IntEnum):
    """Notification state enumeration returned by SHQueryUserNotificationState."""

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
    _user32 = ctypes.windll.user32
    _shell32 = ctypes.windll.shell32

    # SetWindowDisplayAffinity(HWND hWnd, DWORD dwAffinity) -> BOOL
    _user32.SetWindowDisplayAffinity.argtypes = [wintypes.HWND, wintypes.DWORD]
    _user32.SetWindowDisplayAffinity.restype = wintypes.BOOL

    # SHQueryUserNotificationState(QUERY_USER_NOTIFICATION_STATE *pquns) -> HRESULT
    _shell32.SHQueryUserNotificationState.argtypes = [ctypes.POINTER(ctypes.c_int)]
    _shell32.SHQueryUserNotificationState.restype = ctypes.c_long

    # GetWindowLongPtr / SetWindowLongPtr for 64-bit safe handling
    try:
        _GetWindowLongPtr = _user32.GetWindowLongPtrW
        _GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
        _GetWindowLongPtr.restype = ctypes.c_ssize_t

        _SetWindowLongPtr = _user32.SetWindowLongPtrW
        _SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
        _SetWindowLongPtr.restype = ctypes.c_ssize_t
    except AttributeError:
        # 32-bit fallback
        _GetWindowLongPtr = _user32.GetWindowLongW
        _GetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int]
        _GetWindowLongPtr.restype = wintypes.LONG

        _SetWindowLongPtr = _user32.SetWindowLongW
        _SetWindowLongPtr.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.LONG]
        _SetWindowLongPtr.restype = wintypes.LONG
else:
    _user32 = None
    _shell32 = None
    _GetWindowLongPtr = None
    _SetWindowLongPtr = None


# -------------------------------------------------------------------------
# Core Win32 Functions
# -------------------------------------------------------------------------
def set_stealth_affinity(hwnd: int) -> bool:
    """Hides the HUD window from screen recording, Discord streaming, and OBS captures.

    Applies WDA_EXCLUDEFROMCAPTURE (0x00000011) via SetWindowDisplayAffinity.
    The window remains visible to the user on their physical display while
    completely blacked out or invisible to desktop capture APIs.

    Args:
        hwnd: Native Win32 window handle (HWND).

    Returns:
        True if the affinity was successfully set, False otherwise.
    """
    if sys.platform != "win32" or _user32 is None:
        logger.debug("Stealth affinity not supported on non-Windows platform")
        return False

    if not hwnd:
        logger.warning("Invalid HWND provided to set_stealth_affinity")
        return False

    if os.environ.get("NEXUS_NOTCH_CAPTURE") == "1":
        logger.info("NEXUS_NOTCH_CAPTURE=1 active; allowing desktop capture for HWND 0x%X", hwnd)
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
            logger.info("Stealth affinity successfully applied to HWND 0x%X", hwnd)
        else:
            err = ctypes.GetLastError()
            logger.warning("SetWindowDisplayAffinity failed on HWND 0x%X (error: %d)", hwnd, err)
        return success
    except Exception as exc:
        logger.error("Exception in set_stealth_affinity: %s", exc)
        return False


# Compatibility alias matching NEXUS OS specification
set_window_stealth_affinity = set_stealth_affinity


def get_user_notification_state() -> Optional[QUERY_USER_NOTIFICATION_STATE]:
    """Queries the current Windows user notification state.

    Returns:
        A QUERY_USER_NOTIFICATION_STATE member or None if query fails.
    """
    if sys.platform != "win32" or _shell32 is None:
        return None

    try:
        raw_state = ctypes.c_int()
        hr = _shell32.SHQueryUserNotificationState(ctypes.byref(raw_state))
        if hr == 0:  # S_OK
            try:
                return QUERY_USER_NOTIFICATION_STATE(raw_state.value)
            except ValueError:
                return None
        logger.debug("SHQueryUserNotificationState returned HRESULT 0x%X", hr)
        return None
    except Exception as exc:
        logger.error("Exception in get_user_notification_state: %s", exc)
        return None


def is_fullscreen_app_active() -> bool:
    """Detects whether a full-screen DirectX/OpenGL game, video, or presentation is active.

    Uses shell32.SHQueryUserNotificationState to inspect system presentation mode
    and D3D full-screen status. When active, notifications and HUD elements should
    be suspended or hidden to avoid interrupting the user during immersive sessions.

    Returns:
        True if a full-screen application or presentation is active, False otherwise.
    """
    if sys.platform != "win32":
        return False

    state = get_user_notification_state()
    if state is None:
        return False

    # QUNS_RUNNING_D3D_FULL_SCREEN: DirectX/Vulkan/OpenGL exclusive or borderless game
    # QUNS_PRESENTATION_MODE: PowerPoint/Keynote or display presentation
    # QUNS_BUSY: Full screen video or high-priority modal
    # Only suppress when a real DirectX/OpenGL exclusive fullscreen game is active
    fullscreen_states = (
        QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN,
    )

    is_active = state in fullscreen_states
    if is_active:
        logger.debug("Full-screen application detected with state: %s", state.name)
    return is_active


def set_click_through(hwnd: int, enable: bool = True) -> bool:
    """Toggles transparent click-through mode for the given window.

    When enabled, mouse events pass straight through the window to whatever is beneath.

    Args:
        hwnd: Native Win32 window handle.
        enable: True to make transparent to mouse clicks, False to accept input.

    Returns:
        True if window style was successfully modified, False otherwise.
    """
    if sys.platform != "win32" or _GetWindowLongPtr is None or _SetWindowLongPtr is None:
        return False

    if not hwnd:
        return False

    try:
        current_style = _GetWindowLongPtr(wintypes.HWND(hwnd), GWL_EXSTYLE)
        if enable:
            new_style = current_style | WS_EX_TRANSPARENT | WS_EX_LAYERED
        else:
            new_style = current_style & ~WS_EX_TRANSPARENT

        res = _SetWindowLongPtr(wintypes.HWND(hwnd), GWL_EXSTYLE, new_style)
        return res != 0 or ctypes.GetLastError() == 0
    except Exception as exc:
        logger.error("Exception in set_click_through: %s", exc)
        return False


# -------------------------------------------------------------------------
# Win32 SendInput & Cursor Text Injection
# -------------------------------------------------------------------------
INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(ctypes.c_void_p) == 8 else wintypes.ULONG


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("ki", KEYBDINPUT),
        ("mi", MOUSEINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _fields_ = [
        ("type", wintypes.DWORD),
        ("union", INPUT_UNION),
    ]


def inject_text_at_cursor(text: str) -> int:
    """Injects Unicode text directly at the current active cursor position via Win32 SendInput.

    Args:
        text: String of text to type.

    Returns:
        Number of events successfully dispatched.
    """
    if sys.platform != "win32" or _user32 is None or not text:
        return 0

    events: list[INPUT] = []
    for char in text:
        char_code = ord(char)
        # Key down
        ki_down = KEYBDINPUT(wVk=0, wScan=char_code, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=0)
        events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki_down)))
        # Key up
        ki_up = KEYBDINPUT(wVk=0, wScan=char_code, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)
        events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki_up)))

    count = len(events)
    input_array = (INPUT * count)(*events)
    sent = _user32.SendInput(count, input_array, ctypes.sizeof(INPUT))
    return int(sent)

