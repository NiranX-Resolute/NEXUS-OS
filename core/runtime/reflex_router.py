"""
Nexus OS v5.0 - Reflex Router
High-speed Sub-100ms Win32 Native Event Injection and Reflex Execution Engine.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

import ctypes
from ctypes import wintypes
import datetime
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Pattern, Tuple, Union

from core.bridge.persona_engine import (
    PERSONA_PRESETS,
    PersonaTelemetry,
    clamp_pct,
    generate_in_character_confirmation,
)

logger = logging.getLogger("nexus.runtime.reflex_router")

# Win32 SendInput constants
INPUT_MOUSE = 0
INPUT_KEYBOARD = 1
INPUT_HARDWARE = 2

KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_SCANCODE = 0x0008

# Win32 Virtual Key Codes
VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF
VK_RETURN = 0x0D

# Resolve pointer type for ULONG_PTR (handles 32-bit and 64-bit architectures)
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


LPINPUT = ctypes.POINTER(INPUT)


def _get_user32():
    """Safely obtain user32 DLL handle on Windows platforms."""
    if sys.platform == "win32":
        try:
            return ctypes.windll.user32
        except Exception:
            return None
    return None


def _get_kernel32():
    """Safely obtain kernel32 DLL handle on Windows platforms."""
    if sys.platform == "win32":
        try:
            return ctypes.windll.kernel32
        except Exception:
            return None
    return None


try:
    from core.runtime.win32_utils import inject_text_at_cursor
except ImportError:
    try:
        from .win32_utils import inject_text_at_cursor
    except ImportError:
        def inject_text_at_cursor(text: str) -> int:
            user32 = _get_user32()
            if not user32 or not text:
                return 0
            events: List[INPUT] = []
            for char in text:
                char_code = ord(char)
                ki_down = KEYBDINPUT(wVk=0, wScan=char_code, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=0)
                events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki_down)))
                ki_up = KEYBDINPUT(wVk=0, wScan=char_code, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)
                events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki_up)))
            count = len(events)
            input_array = (INPUT * count)(*events)
            return int(user32.SendInput(count, input_array, ctypes.sizeof(INPUT)))

type_string_at_cursor = inject_text_at_cursor

# -----------------------------------------------------------------------------
# Win32 Keep-Awake Power State Engine
# -----------------------------------------------------------------------------
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002
ES_CONTINUOUS = 0x80000000

_keep_awake_active: bool = False
_keep_awake_lock = threading.Lock()


def set_keep_awake(enabled: bool) -> bool:
    """
    Toggles Windows sleep prevention using SetThreadExecutionState.
    0x80000003 (ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) prevents sleep/display blanking.
    0x80000000 (ES_CONTINUOUS) restores normal sleep behavior.
    """
    global _keep_awake_active
    kernel32 = _get_kernel32()
    flags = (ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED) if enabled else ES_CONTINUOUS
    with _keep_awake_lock:
        if kernel32:
            try:
                kernel32.SetThreadExecutionState(flags)
            except Exception as exc:
                logger.debug("SetThreadExecutionState failed: %s", exc)
        _keep_awake_active = enabled
    try:
        emit_telemetry_event("keep_awake_state", {"enabled": enabled})
    except Exception as t_err:
        logger.debug("Telemetry dispatch error: %s", t_err)
    return _keep_awake_active


def get_keep_awake() -> bool:
    """Returns the current keep-awake power state."""
    return _keep_awake_active


# -----------------------------------------------------------------------------
# Voice HUD Notch Positioning & Visibility Engine
# -----------------------------------------------------------------------------
def set_notch_position(position: str, db_path: Optional[Union[str, Path]] = None) -> str:
    """
    Updates HUD notch positioning coordinates in ui_preferences table of agent_local.db
    and emits notch_hud_state telemetry.
    Valid positions: 'top-center', 'bottom-left', 'top-right', 'docked-top', etc.
    """
    pos = (position or "top-center").strip().lower()
    coords = {
        "top-center": {"x": "50%", "y": "0px", "docked": True},
        "dock notch top": {"x": "50%", "y": "0px", "docked": True},
        "docked-top": {"x": "50%", "y": "0px", "docked": True},
        "bottom-left": {"x": "20px", "y": "calc(100% - 80px)", "docked": False},
        "top-right": {"x": "calc(100% - 320px)", "y": "20px", "docked": False},
    }.get(pos, {"x": "50%", "y": "0px", "docked": True})

    target_db = Path(db_path) if db_path else Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    try:
        import sqlite3
        if target_db.parent:
            target_db.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(target_db), timeout=2.0)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ui_preferences (
                    pref_key TEXT PRIMARY KEY,
                    pref_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO ui_preferences (pref_key, pref_value, updated_at)
                VALUES ('notch_position', ?, ?)
                ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value, updated_at = excluded.updated_at;
                """,
                (json.dumps({"position": pos, "coords": coords}), now_iso)
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.debug("Failed saving notch position to database: %s", exc)

    try:
        emit_telemetry_event("notch_hud_state", {"position": pos, "coords": coords, "action": "SET_POSITION"})
    except Exception as exc:
        logger.debug("Failed emitting notch HUD state: %s", exc)
    return f"HUD Notch repositioned to {pos}"


def set_notch_visibility(visible: bool, db_path: Optional[Union[str, Path]] = None) -> str:
    """
    Updates HUD notch visibility state in ui_preferences table of agent_local.db
    and emits notch_hud_state telemetry.
    """
    target_db = Path(db_path) if db_path else Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    try:
        import sqlite3
        if target_db.parent:
            target_db.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(target_db), timeout=2.0)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ui_preferences (
                    pref_key TEXT PRIMARY KEY,
                    pref_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            conn.execute(
                """
                INSERT INTO ui_preferences (pref_key, pref_value, updated_at)
                VALUES ('notch_visibility', ?, ?)
                ON CONFLICT(pref_key) DO UPDATE SET pref_value = excluded.pref_value, updated_at = excluded.updated_at;
                """,
                (json.dumps({"visible": bool(visible)}), now_iso)
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        logger.debug("Failed saving notch visibility to database: %s", exc)

    try:
        emit_telemetry_event("notch_hud_state", {"visible": bool(visible), "action": "SET_VISIBILITY"})
    except Exception as exc:
        logger.debug("Failed emitting notch visibility telemetry: %s", exc)
    return f"HUD Notch visibility set to {visible}"


def get_notch_hud_state(db_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
    """Retrieves HUD notch position and visibility state from agent_local.db."""
    target_db = Path(db_path) if db_path else Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    state = {"position": "top-center", "visible": True}
    if not target_db.exists():
        return state
    try:
        import sqlite3
        conn = sqlite3.connect(str(target_db), timeout=2.0)
        try:
            rows = conn.execute("SELECT pref_key, pref_value FROM ui_preferences WHERE pref_key IN ('notch_position', 'notch_visibility');").fetchall()
            for k, v in rows:
                if k == "notch_position":
                    data = json.loads(v)
                    state["position"] = data.get("position", "top-center")
                    if "coords" in data:
                        state["coords"] = data["coords"]
                elif k == "notch_visibility":
                    data = json.loads(v)
                    state["visible"] = data.get("visible", True)
        finally:
            conn.close()
    except Exception as exc:
        logger.debug("Failed reading notch state: %s", exc)
    return state


# -----------------------------------------------------------------------------
# Streaming Partial Reflex Matchers (<50ms Deterministic Execution)
# -----------------------------------------------------------------------------
PARTIAL_REFLEX_PATTERNS: List[Tuple[Pattern[str], str, str, Any]] = [
    (re.compile(r"\b(?:launch|open)\s+notepad\b", re.IGNORECASE), "launch_notepad", "LAUNCH_APP", lambda: launch_app_reflex("notepad")),
    (re.compile(r"\b(?:launch|open)\s+(?:vs\s*code|code)\b", re.IGNORECASE), "launch_vscode", "LAUNCH_APP", lambda: launch_app_reflex("code")),
    (re.compile(r"\b(?:mute\s+audio|audio\s+mute|toggle\s+mute|mute)\b", re.IGNORECASE), "mute_audio", "MUTE_AUDIO", lambda: mute_audio_reflex()),
    (re.compile(r"\b(?:keep\s+(?:the\s+)?pc\s+awake|keep\s+awake|prevent\s+sleep)\b", re.IGNORECASE), "keep_awake_enable", "SET_KEEP_AWAKE", lambda: set_keep_awake(True)),
    (re.compile(r"\b(?:allow\s+(?:the\s+)?pc\s+to\s+sleep|allow\s+sleep|enable\s+sleep)\b", re.IGNORECASE), "keep_awake_disable", "SET_KEEP_AWAKE", lambda: set_keep_awake(False)),
    (re.compile(r"\b(?:volume\s+up|increase\s+volume)\b", re.IGNORECASE), "volume_up", "VOLUME_UP", lambda: volume_up_reflex()),
    (re.compile(r"\b(?:volume\s+down|decrease\s+volume)\b", re.IGNORECASE), "volume_down", "VOLUME_DOWN", lambda: volume_down_reflex()),
    (re.compile(r"\b(?:lock\s+workstation|lock\s+pc|lock\s+screen)\b", re.IGNORECASE), "lock_workstation", "LOCK_WORKSTATION", lambda: lock_workstation_reflex()),
    (re.compile(r"\b(?:clear\s+temp\s+files|clean\s+temp\s+files|clear\s+temporary\s+files)\b", re.IGNORECASE), "clear_temp_files", "CLEAR_TEMP_FILES", lambda: clear_temp_files_reflex()),
    (re.compile(r"\b(?:move\s+notch\s+to\s+bottom-left|notch\s+bottom-left)\b", re.IGNORECASE), "notch_bottom_left", "SET_NOTCH_POS", lambda: set_notch_position("bottom-left")),
    (re.compile(r"\b(?:move\s+notch\s+to\s+top-right|notch\s+top-right)\b", re.IGNORECASE), "notch_top_right", "SET_NOTCH_POS", lambda: set_notch_position("top-right")),
    (re.compile(r"\b(?:dock\s+notch\s+top|dock\s+notch)\b", re.IGNORECASE), "dock_notch_top", "SET_NOTCH_POS", lambda: set_notch_position("top-center")),
    (re.compile(r"\b(?:hide\s+notch|notch\s+hide)\b", re.IGNORECASE), "hide_notch", "SET_NOTCH_VIS", lambda: set_notch_visibility(False)),
    (re.compile(r"\b(?:show\s+notch|notch\s+show)\b", re.IGNORECASE), "show_notch", "SET_NOTCH_VIS", lambda: set_notch_visibility(True)),
]


def mute_audio_reflex() -> str:
    """Toggles master volume mute via VK_VOLUME_MUTE (0xAD)."""
    user32 = _get_user32()
    if not user32:
        return "Simulated audio mute toggle (non-Windows or missing user32)"
    user32.keybd_event(VK_VOLUME_MUTE, 0, 0, 0)
    user32.keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_KEYUP, 0)
    return "Toggled master audio mute"


def volume_up_reflex() -> str:
    """Increases volume via VK_VOLUME_UP (0xAF)."""
    user32 = _get_user32()
    if not user32:
        return "Simulated volume up"
    user32.keybd_event(VK_VOLUME_UP, 0, 0, 0)
    user32.keybd_event(VK_VOLUME_UP, 0, KEYEVENTF_KEYUP, 0)
    return "Increased master audio volume"


def volume_down_reflex() -> str:
    """Decreases volume via VK_VOLUME_DOWN (0xAE)."""
    user32 = _get_user32()
    if not user32:
        return "Simulated volume down"
    user32.keybd_event(VK_VOLUME_DOWN, 0, 0, 0)
    user32.keybd_event(VK_VOLUME_DOWN, 0, KEYEVENTF_KEYUP, 0)
    return "Decreased master audio volume"


def inject_timestamp_reflex() -> str:
    """Types current ISO-like timestamp directly at the cursor."""
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    dispatched = type_string_at_cursor(ts)
    return f"Injected timestamp '{ts}' ({dispatched} events dispatched)"


def inject_date_reflex() -> str:
    """Types current date string at the cursor."""
    date_str = datetime.date.today().isoformat()
    dispatched = type_string_at_cursor(date_str)
    return f"Injected date '{date_str}' ({dispatched} events dispatched)"


def lock_workstation_reflex() -> str:
    """Calls LockWorkStation() to immediately secure the operating system session."""
    user32 = _get_user32()
    if not user32:
        return "Simulated LockWorkStation (non-Windows or missing user32)"
    result = user32.LockWorkStation()
    return f"Dispatched LockWorkStation call (result={result})"


def clear_temp_files_reflex() -> str:
    """
    Cleans temporary files from the system/user TEMP directories.
    Dispatches asynchronous purge in a background daemon thread to maintain sub-50ms reflex response.
    """
    def _purge_worker():
        cleaned_count = 0
        errors = 0
        temp_candidates = [
            os.environ.get("TEMP"),
            os.environ.get("TMP"),
        ]
        unique_dirs = set(Path(d) for d in temp_candidates if d and os.path.exists(d))
        for temp_dir in unique_dirs:
            try:
                for item in temp_dir.iterdir():
                    try:
                        if item.is_file() or item.is_symlink():
                            item.unlink(missing_ok=True)
                            cleaned_count += 1
                        elif item.is_dir():
                            shutil.rmtree(item, ignore_errors=True)
                            cleaned_count += 1
                    except (PermissionError, OSError):
                        errors += 1
                    except Exception:
                        errors += 1
            except Exception as e:
                logger.debug("Error iterating temp dir %s: %s", temp_dir, e)
        logger.info("Purged %d temporary files (%d locked/skipped)", cleaned_count, errors)

    threading.Thread(target=_purge_worker, daemon=True, name="nexus-temp-cleaner").start()
    return "Dispatched background purge of temporary files"


def empty_recycle_bin_reflex() -> str:
    """Empties Windows Recycle Bin silently via Shell32."""
    if sys.platform == "win32":
        try:
            shell32 = ctypes.windll.shell32
            # SHERB_NOCONFIRMATION (0x1) | SHERB_NOPROGRESSUI (0x2) | SHERB_NOSOUND (0x4) = 7
            res = shell32.SHEmptyRecycleBinW(None, None, 7)
            return f"Emptied Recycle Bin (code={res})"
        except Exception as exc:
            return f"Recycle Bin empty attempted: {exc}"
    return "Simulated Recycle Bin empty"


def adjust_brightness_reflex(level: int = 70) -> str:
    """Adjusts display brightness (0-100%) via Windows WMI."""
    clamped = max(0, min(100, int(level)))
    if sys.platform == "win32":
        try:
            cmd = f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, {clamped})"
            subprocess.Popen(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return f"Display brightness set to {clamped}%"
        except Exception as exc:
            return f"Brightness command dispatched ({clamped}%): {exc}"
    return f"Simulated brightness set to {clamped}%"


def launch_app_reflex(app_name: str) -> str:
    """Spawns standard desktop applications deterministically in <5ms."""
    app_map = {
        "notepad": "notepad.exe",
        "calculator": "calc.exe",
        "calc": "calc.exe",
        "terminal": "wt.exe",
        "cmd": "cmd.exe",
        "powershell": "powershell.exe",
        "explorer": "explorer.exe",
        "browser": "msedge.exe",
        "edge": "msedge.exe",
        "chrome": "chrome.exe",
    }
    norm = app_name.strip().lower()
    target_bin = app_map.get(norm, f"{norm}.exe")
    if sys.platform == "win32":
        try:
            threading.Thread(
                target=lambda: subprocess.Popen(
                    [target_bin],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                ),
                daemon=True,
            ).start()
            return f"Launched application: {target_bin}"
        except Exception as exc:
            return f"Application launch dispatched for {target_bin} ({exc})"
    return f"Simulated launch for {target_bin}"


# -------------------------------------------------------------------------
# Win32 Keyboard Chords & Virtual Key Codes (<5ms SendInput)
# -------------------------------------------------------------------------
VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt
VK_RETURN = 0x0D
VK_ESCAPE = 0x1B
VK_TAB = 0x09
VK_BACK = 0x08
VK_SPACE = 0x20
VK_DELETE = 0x2E
VK_LWIN = 0x5B
VK_RWIN = 0x5C
VK_UP = 0x26
VK_DOWN = 0x28
VK_LEFT = 0x25
VK_RIGHT = 0x27
VK_HOME = 0x24
VK_END = 0x23
VK_PRIOR = 0x21
VK_NEXT = 0x22

VK_MAP: Dict[str, int] = {
    "ctrl": VK_CONTROL,
    "control": VK_CONTROL,
    "shift": VK_SHIFT,
    "alt": VK_MENU,
    "win": VK_LWIN,
    "windows": VK_LWIN,
    "super": VK_LWIN,
    "enter": VK_RETURN,
    "return": VK_RETURN,
    "esc": VK_ESCAPE,
    "escape": VK_ESCAPE,
    "tab": VK_TAB,
    "backspace": VK_BACK,
    "space": VK_SPACE,
    "del": VK_DELETE,
    "delete": VK_DELETE,
    "up": VK_UP,
    "down": VK_DOWN,
    "left": VK_LEFT,
    "right": VK_RIGHT,
    "home": VK_HOME,
    "end": VK_END,
    "pageup": VK_PRIOR,
    "pagedown": VK_NEXT,
}
for _f_idx in range(1, 13):
    VK_MAP[f"f{_f_idx}"] = 0x70 + (_f_idx - 1)


def parse_shortcut_chord(chord_str: str) -> List[int]:
    """Parses a shortcut string (e.g. 'ctrl+s', 'alt+f4', 'enter') into virtual key codes."""
    if not chord_str:
        return []
    parts = [k.strip().lower() for k in chord_str.replace("-", "+").split("+") if k.strip()]
    vks: List[int] = []
    for k in parts:
        if k in VK_MAP:
            vks.append(VK_MAP[k])
        elif len(k) == 1:
            vks.append(ord(k.upper()))
    return vks


def press_key_shortcut(chord_str: str) -> bool:
    """Dispatches virtual key down events, then key up events in reverse order via SendInput."""
    user32 = _get_user32()
    vks = parse_shortcut_chord(chord_str)
    if not user32 or not vks:
        return False

    events: List[INPUT] = []
    for vk in vks:
        ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=0, time=0, dwExtraInfo=0)
        events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki)))
    for vk in reversed(vks):
        ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)
        events.append(INPUT(type=INPUT_KEYBOARD, union=INPUT_UNION(ki=ki)))

    count = len(events)
    input_array = (INPUT * count)(*events)
    sent = user32.SendInput(count, input_array, ctypes.sizeof(INPUT))
    return int(sent) == count


# -------------------------------------------------------------------------
# Win32 Window Enumeration, Focus & Lifecycle Primitives
# -------------------------------------------------------------------------
def find_window_by_name(query: str) -> Optional[int]:
    """Finds top-level visible window HWND matching query in title or process name in <5ms."""
    user32 = _get_user32()
    kernel32 = _get_kernel32()
    if not user32 or not query:
        return None

    q_lower = query.strip().lower()

    # Pass 0: Direct class name or exact title match (<0.1ms)
    for candidate in (query, query.capitalize(), query.upper(), query.lower()):
        h = user32.FindWindowW(candidate, None)
        if h:
            return h
        h = user32.FindWindowW(None, candidate)
        if h:
            return h

    found_hwnd: Optional[int] = None

    # Pass 1: High-speed title & class match (<1ms)
    def enum_title_cb(hwnd: int, lparam: int) -> bool:
        nonlocal found_hwnd
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            if q_lower in buff.value.lower():
                found_hwnd = hwnd
                return False
        class_buf = ctypes.create_unicode_buffer(256)
        if user32.GetClassNameW(hwnd, class_buf, 256):
            if q_lower in class_buf.value.lower():
                found_hwnd = hwnd
                return False
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    cb_inst = WNDENUMPROC(enum_title_cb)
    user32.EnumWindows(cb_inst, 0)
    if found_hwnd:
        return found_hwnd

    # Pass 2: Process image name match (fallback only when title doesn't match)
    if kernel32:
        def enum_proc_cb(hwnd: int, lparam: int) -> bool:
            nonlocal found_hwnd
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value:
                PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
                if h_proc:
                    try:
                        name_buf = ctypes.create_unicode_buffer(512)
                        size_buf = wintypes.DWORD(512)
                        if kernel32.QueryFullProcessImageNameW(h_proc, 0, name_buf, ctypes.byref(size_buf)):
                            if q_lower in os.path.basename(name_buf.value).lower():
                                found_hwnd = hwnd
                                return False
                    finally:
                        kernel32.CloseHandle(h_proc)
            return True

        cb_proc = WNDENUMPROC(enum_proc_cb)
        user32.EnumWindows(cb_proc, 0)

    return found_hwnd


def focus_window_hwnd(hwnd: int) -> bool:
    """Brings window HWND to foreground without blocking."""
    user32 = _get_user32()
    if not user32 or not hwnd:
        return False
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.BringWindowToTop(hwnd)
    user32.SwitchToThisWindow(hwnd, True)
    return bool(user32.SetForegroundWindow(hwnd))


def close_window_hwnd(hwnd: int) -> bool:
    """Sends WM_CLOSE (0x0010) to target window HWND."""
    user32 = _get_user32()
    if not user32 or not hwnd:
        return False
    WM_CLOSE = 0x0010
    return bool(user32.PostMessageW(hwnd, WM_CLOSE, 0, 0))


def wait_for_window_focus(target: str, timeout: float = 2.0, poll_interval: float = 0.01) -> Optional[int]:
    """Polls foreground HWND at 10ms intervals until target window is active or timeout occurs."""
    start = time.perf_counter()
    while (time.perf_counter() - start) < timeout:
        hwnd = find_window_by_name(target)
        if hwnd:
            focus_window_hwnd(hwnd)
            return hwnd
        time.sleep(poll_interval)
    return None


# -------------------------------------------------------------------------
# Sub-50ms Compound Reflex Handlers (Web Search, URL Visit, Window Control)
# -------------------------------------------------------------------------
def search_web_reflex(platform: str, query: str) -> str:
    """Dispatches search query directly in default browser in <50ms."""
    import urllib.parse
    import webbrowser
    clean_query = urllib.parse.quote_plus(query.strip())
    plat = platform.lower().strip()
    urls = {
        "youtube": f"https://www.youtube.com/results?search_query={clean_query}",
        "google": f"https://www.google.com/search?q={clean_query}",
        "github": f"https://github.com/search?q={clean_query}",
        "perplexity": f"https://www.perplexity.ai/search?q={clean_query}",
    }
    url = urls.get(plat, f"https://www.google.com/search?q={clean_query}")
    if sys.platform == "win32":
        try:
            os.startfile(url)
        except Exception:
            webbrowser.open(url)
    else:
        webbrowser.open(url)
    return f"Opened {plat.capitalize()} search for '{query}'"


def visit_url_reflex(url: str) -> str:
    """Opens URL directly in default browser in <50ms."""
    import webbrowser
    target = url.strip()
    if not target.startswith("http://") and not target.startswith("https://"):
        target = "https://" + target
    if sys.platform == "win32":
        try:
            os.startfile(target)
        except Exception:
            webbrowser.open(target)
    else:
        webbrowser.open(target)
    return f"Visited URL: {target}"


def switch_to_app_reflex(app_name: str) -> str:
    """Brings named application to foreground in <50ms."""
    hwnd = find_window_by_name(app_name)
    if hwnd:
        focus_window_hwnd(hwnd)
        return f"Switched to application: {app_name} (HWND 0x{hwnd:X})"
    launch_app_reflex(app_name)
    return f"Application '{app_name}' not currently active; launched new instance."


def close_app_reflex(app_name: str) -> str:
    """Closes named application."""
    hwnd = find_window_by_name(app_name)
    if hwnd:
        close_window_hwnd(hwnd)
        return f"Closed application: {app_name} (HWND 0x{hwnd:X})"
    return f"No active window found matching '{app_name}'"


def emit_telemetry_event(event_type: str, payload: Dict[str, Any]) -> None:
    """Emits real telemetry events into ~/.nexus-agent/db/agent_local.db for UI feedback."""
    try:
        db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        if db_path.exists():
            import sqlite3
            conn = sqlite3.connect(str(db_path), timeout=5.0)
            try:
                conn.execute("PRAGMA busy_timeout = 5000;")
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (event_type, json.dumps(payload), time.time()),
                )
                conn.commit()
            finally:
                conn.close()
    except Exception as exc:
        logger.debug("Telemetry emission skipped: %s", exc)


def execute_action_batch(
    actions: List[Dict[str, Any]],
    workspace_gov: Optional[Any] = None,
    scope_guard: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Executes a multi-step array of native OS, UIA, and web actions sequentially in native Python.
    Enforces WorkspaceGovernor mode restrictions (SILENT/STUDIO) and ScopeGuard HITL approvals.
    Aborts immediately if any action fails, returning step diagnostics and latency.

    Args:
        actions: List of action dicts (e.g. [{"action": "launch", "app": "notepad"}]).
        workspace_gov: Optional WorkspaceGovernor instance.
        scope_guard: Optional ScopeGuard instance.

    Returns:
        Structured execution result with completed_steps and latency_ms.
    """
    t_start = time.perf_counter()
    completed_steps: List[Dict[str, Any]] = []

    # 1. Enforce WorkspaceGovernor rules
    if workspace_gov:
        mode = workspace_gov.get_mode().upper()
        if mode == "SILENT":
            err_msg = "[WORKSPACE GOVERNOR] GUI actuation strictly blocked in SILENT air-gapped mode."
            logger.warning(err_msg)
            return {
                "success": False,
                "status": "BLOCKED",
                "error": err_msg,
                "completed_steps": 0,
                "total_steps": len(actions),
                "latency_ms": round((time.perf_counter() - t_start) * 1000, 3),
            }
        if mode == "STUDIO":
            for act in actions:
                act_name = act.get("action", "").lower()
                target_app = (act.get("app") or act.get("target") or "").lower()
                if act_name in ("launch", "open") and target_app not in ("vlc", "spotify", "audacity", "obs", "media", "calc"):
                    err_msg = f"[WORKSPACE GOVERNOR] Launching '{target_app}' blocked in STUDIO mode."
                    logger.warning(err_msg)
                    return {
                        "success": False,
                        "status": "BLOCKED",
                        "error": err_msg,
                        "completed_steps": 0,
                        "total_steps": len(actions),
                        "latency_ms": round((time.perf_counter() - t_start) * 1000, 3),
                    }

    has_web_actions = any(a.get("action", "").startswith("web_") for a in actions)
    agent_id = "SCOUT-01" if has_web_actions else "SYS-01"
    slice_id = f"batch_{int(time.time() * 1000)}"

    emit_telemetry_event(
        "agent_slice",
        {
            "agent_id": agent_id,
            "status": "EXECUTING",
            "task_summary": f"Executing batch of {len(actions)} actions",
            "slice_id": slice_id,
        },
    )
    emit_telemetry_event(
        "circuit_pulse",
        {
            "node": "MCP_SKILLS",
            "active": True,
            "detail": f"ActionBatch [{agent_id}]",
            "latency_ms": 0.5,
        },
    )

    # 2. Sequential execution
    for idx, act in enumerate(actions):
        act_type = act.get("action", "").lower().strip()
        step_diag: Dict[str, Any] = {"step": idx + 1, "action": act_type}

        try:
            if act_type in ("launch", "open"):
                app_target = act.get("app") or act.get("target") or "notepad"
                res_str = launch_app_reflex(app_target)
                step_diag["result"] = res_str
                if act.get("wait_focus", True):
                    to = float(act.get("timeout", 2.0))
                    focused_hwnd = wait_for_window_focus(app_target, timeout=to)
                    if focused_hwnd:
                        step_diag["hwnd"] = focused_hwnd

            elif act_type in ("focus", "switch", "switch_to"):
                target = act.get("target") or act.get("app") or ""
                res_str = switch_to_app_reflex(target)
                step_diag["result"] = res_str

            elif act_type == "wait_focus":
                target = act.get("target") or act.get("app") or ""
                hwnd = wait_for_window_focus(target, timeout=float(act.get("timeout", 2.0)))
                if not hwnd:
                    raise TimeoutError(f"Window '{target}' failed to gain focus within timeout.")
                step_diag["result"] = f"Focused HWND 0x{hwnd:X}"

            elif act_type in ("type", "type_text"):
                text_to_type = act.get("text", "")
                count = type_string_at_cursor(text_to_type)
                step_diag["result"] = f"Typed {count} events"

            elif act_type in ("shortcut", "press"):
                chord = act.get("chord") or act.get("shortcut") or act.get("key") or ""
                success = press_key_shortcut(chord)
                if not success:
                    raise RuntimeError(f"Failed to dispatch shortcut chord '{chord}'")
                step_diag["result"] = f"Dispatched shortcut '{chord}'"

            elif act_type == "click_uia":
                el_label = str(act.get("label") or act.get("name") or act.get("query") or act.get("element_id") or "")
                if scope_guard:
                    scope_guard.check_ui_action(el_label, target="active_window")
                from core.engine.tools.desktop_ufo import click_ui_element
                el_id = int(act.get("element_id") or act.get("id") or 1)
                click_res = click_ui_element(el_id)
                step_diag["result"] = click_res

            elif act_type == "type_uia":
                from core.engine.tools.desktop_ufo import type_ui_element
                el_id = int(act.get("element_id") or act.get("id") or 1)
                txt = act.get("text", "")
                sub = act.get("submit", False)
                type_res = type_ui_element(el_id, txt, submit=sub)
                step_diag["result"] = type_res

            elif act_type == "web_visit":
                from core.engine.tools.browser_verifier import web_visit
                url = act.get("url", "")
                vis_res = web_visit(url)
                step_diag["result"] = vis_res

            elif act_type == "web_click":
                el_label = str(act.get("label") or act.get("element_id") or "")
                if scope_guard:
                    scope_guard.check_ui_action(el_label, target="browser")
                from core.engine.tools.browser_verifier import web_click
                el_id = int(act.get("element_id") or act.get("id") or 1)
                click_res = web_click(el_id)
                step_diag["result"] = click_res

            elif act_type == "web_type":
                from core.engine.tools.browser_verifier import web_type
                el_id = int(act.get("element_id") or act.get("id") or 1)
                txt = act.get("text", "")
                sub = act.get("submit", False)
                t_res = web_type(el_id, txt, submit=sub)
                step_diag["result"] = t_res

            elif act_type == "web_scroll":
                from core.engine.tools.browser_verifier import web_scroll
                direction = act.get("direction", "down")
                amount = int(act.get("amount", 500))
                sc_res = web_scroll(direction=direction, amount=amount)
                step_diag["result"] = sc_res

            elif act_type == "close":
                target = act.get("target") or act.get("app") or ""
                res_str = close_app_reflex(target)
                step_diag["result"] = res_str

            else:
                raise ValueError(f"Unknown action type '{act_type}' in action batch.")

            completed_steps.append(step_diag)

        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
            logger.error("[ACTION_BATCH] Aborted at step %d (%s): %s", idx + 1, act_type, exc)
            emit_telemetry_event(
                "agent_slice",
                {
                    "agent_id": agent_id,
                    "status": "ERROR",
                    "task_summary": f"Batch failed at step {idx + 1} ({act_type}): {exc}",
                    "slice_id": slice_id,
                },
            )
            return {
                "success": False,
                "status": "ERROR",
                "failed_step": idx + 1,
                "action": act,
                "error": str(exc),
                "completed_steps": completed_steps,
                "total_steps": len(actions),
                "latency_ms": elapsed_ms,
            }

    elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
    emit_telemetry_event(
        "agent_slice",
        {
            "agent_id": agent_id,
            "status": "COMPLETED",
            "task_summary": f"Executed all {len(actions)} actions successfully",
            "slice_id": slice_id,
        },
    )
    return {
        "success": True,
        "status": "SUCCESS",
        "completed_steps": completed_steps,
        "total_steps": len(actions),
        "latency_ms": elapsed_ms,
    }


# -------------------------------------------------------------------------
# Global Hotkey Listener & Input Focus Guard (Ctrl+Space / Esc)
# -------------------------------------------------------------------------
_global_hotkey_thread: Optional[threading.Thread] = None
_global_hotkey_stop_evt: Optional[threading.Event] = None
_hotkey_guard_active: bool = False
_hotkey_guard_lock = threading.Lock()


def set_hotkey_guard(active: bool) -> bool:
    """Sets the hotkey input focus guard state."""
    global _hotkey_guard_active
    with _hotkey_guard_lock:
        _hotkey_guard_active = active
    try:
        emit_telemetry_event("hotkey_guard_state", {"active": active})
    except Exception as exc:
        logger.debug("Failed emitting hotkey guard state telemetry: %s", exc)
    return _hotkey_guard_active


def get_hotkey_guard() -> bool:
    """Gets the current hotkey input focus guard state."""
    with _hotkey_guard_lock:
        return _hotkey_guard_active


def cancel_hotkey_guard() -> bool:
    """Cancels the active hotkey input focus guard (Esc cancel behavior)."""
    return set_hotkey_guard(False)


def start_global_hotkey_listener(
    callback: Optional[Callable[[], None]] = None,
    hotkey: str = "<ctrl>+<space>",
) -> bool:
    """Starts a daemon background thread listening for Ctrl+Space to trigger cursor injection, and Esc to cancel focus guard."""
    global _global_hotkey_thread, _global_hotkey_stop_evt

    if _global_hotkey_thread and _global_hotkey_thread.is_alive():
        logger.info("Global hotkey listener already running.")
        return True

    def _default_trigger():
        set_hotkey_guard(True)
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        type_string_at_cursor(f"[{ts}] ")

    action_fn = callback or _default_trigger
    _global_hotkey_stop_evt = threading.Event()

    def _listener_loop():
        try:
            from pynput import keyboard

            def on_activate():
                logger.info("Global hotkey %s pressed -> activating focus guard & executing cursor reflex", hotkey)
                set_hotkey_guard(True)
                action_fn()

            def on_cancel():
                logger.info("Esc key pressed -> cancelling hotkey focus guard")
                cancel_hotkey_guard()

            with keyboard.GlobalHotKeys({hotkey: on_activate, "<esc>": on_cancel}) as h:
                while not _global_hotkey_stop_evt.is_set():
                    time.sleep(0.1)
                h.stop()
        except ImportError:
            logger.info("pynput not available; hotkey simulation mode active.")
        except Exception as exc:
            logger.warning("Global hotkey listener error: %s", exc)

    _global_hotkey_thread = threading.Thread(target=_listener_loop, daemon=True, name="NexusGlobalHotkey")
    _global_hotkey_thread.start()
    return True


def stop_global_hotkey_listener() -> None:
    """Stops the global hotkey listener background thread."""
    global _global_hotkey_stop_evt
    if _global_hotkey_stop_evt:
        _global_hotkey_stop_evt.set()


# -----------------------------------------------------------------------------
# Deterministic Command Mappings for Sub-50ms Direct Reflex Dispatch
# -----------------------------------------------------------------------------
DETERMINISTIC_PATTERNS: List[Tuple[Pattern[str], Callable[..., Any]]] = [
    # Required core patterns
    (re.compile(r"^mute audio$"), mute_audio_reflex),
    (re.compile(r"^lock workstation$"), lock_workstation_reflex),
    (re.compile(r"^clear temp files$"), clear_temp_files_reflex),
    # Additional deterministic system reflexes
    (re.compile(r"^unmute audio$"), mute_audio_reflex),
    (re.compile(r"^mute$"), mute_audio_reflex),
    (re.compile(r"^toggle mute$"), mute_audio_reflex),
    (re.compile(r"^lock pc$"), lock_workstation_reflex),
    (re.compile(r"^lock screen$"), lock_workstation_reflex),
    (re.compile(r"^clean temp files$"), clear_temp_files_reflex),
    (re.compile(r"^clear temporary files$"), clear_temp_files_reflex),
    (re.compile(r"^clean temporary files$"), clear_temp_files_reflex),
    (re.compile(r"^clear temp$"), clear_temp_files_reflex),
    (re.compile(r"^clean temp$"), clear_temp_files_reflex),
    (re.compile(r"^volume up$"), volume_up_reflex),
    (re.compile(r"^volume down$"), volume_down_reflex),
    (re.compile(r"^keep awake$"), lambda: set_keep_awake(True)),
    (re.compile(r"^prevent sleep$"), lambda: set_keep_awake(True)),
    (re.compile(r"^allow sleep$"), lambda: set_keep_awake(False)),
    (re.compile(r"^empty recycle bin$"), empty_recycle_bin_reflex),
    (re.compile(r"^inject timestamp$"), inject_timestamp_reflex),
    (re.compile(r"^inject date$"), inject_date_reflex),
    # Voice HUD Positioning Reflexes
    (re.compile(r"^move notch to bottom-left$"), lambda: set_notch_position("bottom-left")),
    (re.compile(r"^move notch to top-right$"), lambda: set_notch_position("top-right")),
    (re.compile(r"^dock notch top$"), lambda: set_notch_position("top-center")),
    (re.compile(r"^hide notch$"), lambda: set_notch_visibility(False)),
    (re.compile(r"^show notch$"), lambda: set_notch_visibility(True)),
    # Context Keeper deterministic reflexes
    (re.compile(r"^/?ck:init(?:\s+.*)?$", re.IGNORECASE), lambda: "CK_INIT"),
    (re.compile(r"^/?ck:save(?:\s+.*)?$", re.IGNORECASE), lambda: "CK_SAVE"),
    (re.compile(r"^/?ck:resume(?:\s+.*)?$", re.IGNORECASE), lambda: "CK_RESUME"),
    (re.compile(r"^/?ck:info(?:\s+.*)?$", re.IGNORECASE), lambda: "CK_INFO"),
    (re.compile(r"^/?ck:list$", re.IGNORECASE), lambda: "CK_LIST"),
]


class ReflexRouter:
    """
    Sub-50ms deterministic reflex router.
    Evaluates natural language intent against fast compiled regex tokens and executes
    native system actions without LLM latency.
    """

    def __init__(self, dry_run: bool = False, store: Optional[Any] = None):
        self.dry_run = dry_run
        self.store = store
        self._reflex_registry: List[Tuple[Pattern, str, str, Callable[..., Any]]] = []
        self._partial_history: Dict[str, float] = {}
        self._partial_lock = threading.Lock()
        self._dispatch_patterns: List[Tuple[Pattern[str], Callable[..., Any]]] = list(DETERMINISTIC_PATTERNS)
        self._spawner = None
        self._register_default_reflexes()
        if self.store is not None:
            try:
                self._get_spawner()
            except Exception as e_init:
                logger.debug("Warmup spawner notice: %s", e_init)

    def close(self) -> None:
        """Closes spawner and releases resources."""
        if getattr(self, "_spawner", None) is not None:
            try:
                self._spawner.close()
            except Exception as exc:
                logger.debug("ReflexRouter close spawner notice: %s", exc)
            self._spawner = None

    def _get_spawner(self):
        db_path = getattr(self.store, "db_path", None) if self.store else None
        if self._spawner is None:
            from core.agents.dynamic_spawner import DynamicAgentSpawner
            self._spawner = DynamicAgentSpawner(db_path=db_path)
        return self._spawner

    def dispatch(self, utterance: str) -> Optional[str]:
        """
        Sub-50ms deterministic reflex command dispatcher bypassing LLM inference.
        Matches clean lowercase text against patterns; executes system command
        directly and returns 'REFLEX EXECUTED DIRECTLY', or returns None if no
        match so it falls back to LLM.
        """
        if not utterance or not isinstance(utterance, str):
            return None

        clean_text = utterance.strip().lower()
        if not clean_text:
            return None

        clean_text = re.sub(r"\s+", " ", clean_text)
        clean_text = clean_text.rstrip(".!?")

        if clean_text.startswith("@swarm "):
            goal = clean_text[7:].strip()
            if goal:
                try:
                    spawner = self._get_spawner()
                    res = spawner.plan_and_spawn_swarm(goal)
                    return f"SWARM SPAWNED: {len(res.get('agents', []))} agents for '{goal[:40]}'"
                except Exception as exc:
                    return f"SWARM SPAWN ERROR: {exc}"

        for pattern, handler in self._dispatch_patterns:
            if pattern.match(clean_text):
                try:
                    if not self.dry_run:
                        handler()
                    else:
                        logger.debug("Reflex dry-run execution for pattern: %s", pattern.pattern)
                    return "REFLEX EXECUTED DIRECTLY"
                except Exception as exc:
                    logger.error("Error executing direct reflex for '%s': %s", clean_text, exc)
                    return "REFLEX EXECUTED DIRECTLY"

        # Check Custom Voice Routines (<50ms match)
        if not getattr(self, "_evaluating_routine", False):
            try:
                self._evaluating_routine = True
                if getattr(self, "_routines_manager", None) is None:
                    from core.runtime.routines_manager import RoutinesManager
                    db_path = getattr(self.store, "db_path", None) if self.store else None
                    self._routines_manager = RoutinesManager(db_path=db_path, reflex_router=self, dry_run=self.dry_run)
                if self._routines_manager.evaluate(clean_text):
                    return "REFLEX EXECUTED DIRECTLY"
            except Exception as exc:
                logger.debug("Custom routine dispatch check notice: %s", exc)
            finally:
                self._evaluating_routine = False

        return None

    def register_dispatch_pattern(self, pattern: Union[str, Pattern[str]], handler: Callable[..., Any]) -> None:
        """Registers a custom pattern and handler for fast direct dispatch."""
        compiled = re.compile(pattern, re.IGNORECASE) if isinstance(pattern, str) else pattern
        self._dispatch_patterns.append((compiled, handler))

    def _get_store(self):
        if self.store is None:
            from core.memory.sovereign_store import SovereignMemoryStore
            self.store = SovereignMemoryStore()
        return self.store

    def _create_voice_timer(self, val: int, unit: str, label: str = "Voice Timer") -> str:
        """Helper to create a persistent countdown/pomodoro timer via ReflexRouter."""
        multiplier = 60 if unit.lower().startswith("min") else 1
        total_sec = val * multiplier
        store = self._get_store()
        t_type = "pomodoro" if "pomodoro" in label.lower() else "countdown"
        timer = store.create_timer(label=label, duration_sec=total_sec, timer_type=t_type)
        return f"Timer set for {val} {unit} ({timer['id']})"

    def register(self, pattern: str, name: str, action: str, handler: Callable[..., Any]):
        """Registers a new fast token pattern with associated reflex handler."""
        compiled = re.compile(pattern, re.IGNORECASE)
        self._reflex_registry.append((compiled, name, action, handler))

    def _set_persona_pct(self, param: str, val_str: str) -> str:
        val = clamp_pct(val_str)
        store = self._get_store()
        updated = store.update_persona_settings(**{param: val})
        t = PersonaTelemetry(
            empathy_pct=updated["empathy_pct"],
            humor_pct=updated["humor_pct"],
            candor_pct=updated["candor_pct"],
            verbosity_pct=updated["verbosity_pct"],
            voice_id=updated["voice_id"],
            active_preset=updated["active_preset"],
        )
        return generate_in_character_confirmation(t, "PARAM_ADJUST", param, val)

    def _set_compound_persona(self, emp_str: str, hum_str: str) -> str:
        emp = clamp_pct(emp_str)
        hum = clamp_pct(hum_str)
        store = self._get_store()
        updated = store.update_persona_settings(empathy_pct=emp, humor_pct=hum)
        t = PersonaTelemetry(
            empathy_pct=updated["empathy_pct"],
            humor_pct=updated["humor_pct"],
            candor_pct=updated["candor_pct"],
            verbosity_pct=updated["verbosity_pct"],
            voice_id=updated["voice_id"],
            active_preset=updated["active_preset"],
        )
        return f"Empathy calibrated to {t.empathy_pct} percent and humor to {t.humor_pct} percent. Ready, Niranjan."

    def _adjust_persona_relative(self, param: str, delta_str: str, is_increase: bool) -> str:
        store = self._get_store()
        current = store.get_persona_settings()
        delta = int(delta_str) if delta_str and delta_str.isdigit() else 10
        current_val = current.get(param, 50)
        new_val = clamp_pct(current_val + (delta if is_increase else -delta))
        updated = store.update_persona_settings(**{param: new_val})
        t = PersonaTelemetry(
            empathy_pct=updated["empathy_pct"],
            humor_pct=updated["humor_pct"],
            candor_pct=updated["candor_pct"],
            verbosity_pct=updated["verbosity_pct"],
            voice_id=updated["voice_id"],
            active_preset=updated["active_preset"],
        )
        return generate_in_character_confirmation(t, "PARAM_ADJUST", param, new_val)

    def _switch_persona_preset(self, preset_key: str) -> str:
        store = self._get_store()
        updated = store.update_persona_settings(active_preset=preset_key)
        t = PersonaTelemetry(
            empathy_pct=updated["empathy_pct"],
            humor_pct=updated["humor_pct"],
            candor_pct=updated["candor_pct"],
            verbosity_pct=updated["verbosity_pct"],
            voice_id=updated["voice_id"],
            active_preset=updated["active_preset"],
        )
        return generate_in_character_confirmation(t, "PRESET_SWITCH", val=preset_key)

    def _query_persona_status(self) -> str:
        store = self._get_store()
        current = store.get_persona_settings()
        t = PersonaTelemetry(
            empathy_pct=current["empathy_pct"],
            humor_pct=current["humor_pct"],
            candor_pct=current["candor_pct"],
            verbosity_pct=current["verbosity_pct"],
            voice_id=current["voice_id"],
            active_preset=current["active_preset"],
        )
        return generate_in_character_confirmation(t, "STATUS_QUERY")

    def _register_default_reflexes(self):
        # Audio
        self.register(r"^(?:mute\s+audio|audio\s+mute|unmute\s+audio|toggle\s+mute|mute)$", "mute_audio", "MUTE_AUDIO", mute_audio_reflex)
        self.register(r"^(?:volume\s+up|increase\s+volume)$", "volume_up", "VOLUME_UP", volume_up_reflex)
        self.register(r"^(?:volume\s+down|decrease\s+volume)$", "volume_down", "VOLUME_DOWN", volume_down_reflex)

        # Workstation
        self.register(r"^(?:lock\s+workstation|lock\s+pc|lock\s+screen|screen\s+lock)$", "lock_workstation", "LOCK_WORKSTATION", lock_workstation_reflex)

        # Maintenance & Storage
        self.register(r"^(?:clear\s+temp\s+files|clean\s+temp\s+files|clear\s+temporary\s+files|clean\s+temporary\s+files|clear\s+temp|clean\s+temp)$", "clear_temp_files", "CLEAR_TEMP_FILES", clear_temp_files_reflex)
        self.register(r"^(?:empty\s+recycle\s+bin|clean\s+recycle\s+bin|clear\s+recycle\s+bin)$", "empty_recycle_bin", "EMPTY_RECYCLE_BIN", empty_recycle_bin_reflex)

        # Timestamps
        self.register(r"^(?:inject\s+timestamp|insert\s+timestamp|get\s+timestamp|timestamp)$", "inject_timestamp", "INJECT_TIMESTAMP", inject_timestamp_reflex)
        self.register(r"^(?:inject\s+date|insert\s+date|get\s+date|date)$", "inject_date", "INJECT_DATE", inject_date_reflex)

        # Brightness
        self.register(r"^(?:adjust\s+brightness|set\s+brightness(?:\s+to)?|brightness)\s*(\d+)?%?$", "adjust_brightness", "ADJUST_BRIGHTNESS", lambda arg="70": adjust_brightness_reflex(int(arg) if arg and arg.isdigit() else 70))
        self.register(r"^(?:increase\s+brightness)$", "brightness_up", "ADJUST_BRIGHTNESS", lambda: adjust_brightness_reflex(85))
        self.register(r"^(?:decrease\s+brightness)$", "brightness_down", "ADJUST_BRIGHTNESS", lambda: adjust_brightness_reflex(45))

        # App Launcher
        self.register(r"^(?:launch|open)\s+([a-zA-Z0-9_\-]+)$", "launch_app", "LAUNCH_APP", lambda app="notepad": launch_app_reflex(app))

        # Keep-Awake Power State Reflexes
        self.register(
            r"^(?:keep\s+(?:the\s+)?pc\s+awake|keep\s+awake|prevent\s+sleep|never\s+sleep)$",
            "keep_awake_enable",
            "SET_KEEP_AWAKE",
            lambda: "PC sleep prevention enabled (Keep-Awake Active)" if set_keep_awake(True) else "Failed to enable keep awake",
        )
        self.register(
            r"^(?:allow\s+(?:the\s+)?pc\s+to\s+sleep|allow\s+sleep|enable\s+sleep|restore\s+sleep)$",
            "keep_awake_disable",
            "SET_KEEP_AWAKE",
            lambda: "PC sleep behavior restored to normal" if not set_keep_awake(False) else "Failed to disable keep awake",
        )

        # Voice HUD Positioning Reflexes
        self.register(
            r"^(?:move\s+notch\s+to\s+bottom-left|notch\s+bottom-left)$",
            "notch_bottom_left",
            "SET_NOTCH_POS",
            lambda: set_notch_position("bottom-left"),
        )
        self.register(
            r"^(?:move\s+notch\s+to\s+top-right|notch\s+top-right)$",
            "notch_top_right",
            "SET_NOTCH_POS",
            lambda: set_notch_position("top-right"),
        )
        self.register(
            r"^(?:dock\s+notch\s+top|dock\s+notch)$",
            "dock_notch_top",
            "SET_NOTCH_POS",
            lambda: set_notch_position("top-center"),
        )
        self.register(
            r"^(?:hide\s+notch|notch\s+hide)$",
            "hide_notch",
            "SET_NOTCH_VIS",
            lambda: set_notch_visibility(False),
        )
        self.register(
            r"^(?:show\s+notch|notch\s+show)$",
            "show_notch",
            "SET_NOTCH_VIS",
            lambda: set_notch_visibility(True),
        )

        # Persistent Timers & Pomodoro Reflexes
        self.register(
            r"^(?:set\s+(?:a\s+)?timer\s+(?:for\s+)?|timer\s+)(\d+)\s*(seconds|second|secs|sec|minutes|minute|mins|min)$",
            "set_timer_voice",
            "SET_TIMER",
            lambda val, unit: self._create_voice_timer(int(val), unit),
        )
        self.register(
            r"^(?:set\s+pomodoro\s+timer|start\s+pomodoro|pomodoro(?:\s+timer)?)$",
            "set_pomodoro_voice",
            "SET_POMODORO",
            lambda: self._create_voice_timer(25, "minutes", label="Pomodoro Focus"),
        )

        # ---------------------------------------------------------------------
        # TARS-Style Voice Persona & Emotional Telemetry Interceptors (<50ms)
        # ---------------------------------------------------------------------
        prefix = r"^(?:nexus[,:\s]+|hey\s+nexus[,:\s]+)?"

        # 1. Compound parameters (e.g., "set empathy to 90 percent and humor to 40 percent")
        self.register(
            prefix + r"set\s+empathy\s+(?:to\s+|level\s+(?:to\s+)?)?(\d{1,3})\s*(?:%|percent)?\s+and\s+humor\s+(?:to\s+|level\s+(?:to\s+)?)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_set_compound",
            "PERSONA_SET_COMPOUND",
            lambda e, h: self._set_compound_persona(e, h),
        )

        # 2. Empathy / Emotional / Care absolute set
        self.register(
            prefix + r"(?:set\s+)?(?:empathy(?:\s+level)?|emotional\s+level|care(?:\s+level)?)(?:\s+(?:to|at|level))?\s*(\d{1,3})\s*(?:%|percent)?$",
            "persona_set_empathy",
            "PERSONA_SET_EMPATHY",
            lambda v: self._set_persona_pct("empathy_pct", v),
        )

        # 3. Humor / Wit absolute set
        self.register(
            prefix + r"(?:set\s+)?(?:humor(?:\s+level)?|wit(?:\s+level)?)(?:\s+(?:to|at|level))?\s*(\d{1,3})\s*(?:%|percent)?$",
            "persona_set_humor",
            "PERSONA_SET_HUMOR",
            lambda v: self._set_persona_pct("humor_pct", v),
        )

        # 4. Candor / Honesty absolute set
        self.register(
            prefix + r"(?:set\s+)?(?:candor(?:\s+level)?|honesty(?:\s+level)?|directness)(?:\s+(?:to|at|level))?\s*(\d{1,3})\s*(?:%|percent)?$",
            "persona_set_candor",
            "PERSONA_SET_CANDOR",
            lambda v: self._set_persona_pct("candor_pct", v),
        )

        # 5. Verbosity absolute set
        self.register(
            prefix + r"(?:(?:set|dial)\s+)?(?:verbosity\s+(?:down|up)|(?:down|up)\s+verbosity|verbosity)(?:\s+(?:to|at|level|down\s+to|up\s+to))?\s*(\d{1,3})\s*(?:%|percent)?(?:\s*[-—].*)?$",
            "persona_set_verbosity",
            "PERSONA_SET_VERBOSITY",
            lambda v: self._set_persona_pct("verbosity_pct", v),
        )

        # 6. Relative Adjustments (e.g., "increase empathy by 15 percent", "lower humor by 20%", "dial care up by 10")
        self.register(
            prefix + r"(?:increase|raise|boost|dial\s+up)\s+(?:empathy|care)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_increase_empathy",
            "PERSONA_ADJUST_EMPATHY",
            lambda d: self._adjust_persona_relative("empathy_pct", d, True),
        )
        self.register(
            prefix + r"(?:lower|decrease|reduce|dial\s+down)\s+(?:empathy|care)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_decrease_empathy",
            "PERSONA_ADJUST_EMPATHY",
            lambda d: self._adjust_persona_relative("empathy_pct", d, False),
        )
        self.register(
            prefix + r"(?:increase|raise|boost|dial\s+up)\s+(?:humor|wit)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_increase_humor",
            "PERSONA_ADJUST_HUMOR",
            lambda d: self._adjust_persona_relative("humor_pct", d, True),
        )
        self.register(
            prefix + r"(?:lower|decrease|reduce|dial\s+down)\s+(?:humor|wit)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_decrease_humor",
            "PERSONA_ADJUST_HUMOR",
            lambda d: self._adjust_persona_relative("humor_pct", d, False),
        )
        self.register(
            prefix + r"(?:increase|raise|boost|dial\s+up)\s+(?:candor|honesty)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_increase_candor",
            "PERSONA_ADJUST_CANDOR",
            lambda d: self._adjust_persona_relative("candor_pct", d, True),
        )
        self.register(
            prefix + r"(?:lower|decrease|reduce|dial\s+down)\s+(?:candor|honesty)\s+(?:by\s+)?(\d{1,3})\s*(?:%|percent)?$",
            "persona_decrease_candor",
            "PERSONA_ADJUST_CANDOR",
            lambda d: self._adjust_persona_relative("candor_pct", d, False),
        )
        self.register(
            prefix + r"(?:lower|decrease|reduce|dial\s+down)\s+verbosity\s+(?:by\s+)(\d{1,3})\s*(?:%|percent)?(?:\s*[-—].*)?$",
            "persona_decrease_verbosity",
            "PERSONA_ADJUST_VERBOSITY",
            lambda d: self._adjust_persona_relative("verbosity_pct", d, False),
        )
        self.register(
            prefix + r"(?:increase|raise|boost|dial\s+up)\s+verbosity\s+(?:by\s+)(\d{1,3})\s*(?:%|percent)?(?:\s*[-—].*)?$",
            "persona_increase_verbosity",
            "PERSONA_ADJUST_VERBOSITY",
            lambda d: self._adjust_persona_relative("verbosity_pct", d, True),
        )

        # 7. Preset Switches (e.g., "switch to caring companion mode", "activate TARS tactical mode", "late night care mode")
        self.register(
            prefix + r"(?:(?:switch\s+to|activate|set(?:\s+to)?)\s+)?caring\s+companion(?:\s+mode)?$",
            "persona_preset_caring_companion",
            "PERSONA_SWITCH_PRESET",
            lambda: self._switch_persona_preset("CARING_COMPANION"),
        )
        self.register(
            prefix + r"(?:(?:switch\s+to|activate|set(?:\s+to)?)\s+)?tars(?:\s+tactical)?(?:\s+mode)?$",
            "persona_preset_tars_tactical",
            "PERSONA_SWITCH_PRESET",
            lambda: self._switch_persona_preset("TARS_TACTICAL"),
        )
        self.register(
            prefix + r"(?:(?:switch\s+to|activate|set(?:\s+to)?)\s+)?late\s*night(?:\s+care)?(?:\s+mode)?$",
            "persona_preset_late_night_care",
            "PERSONA_SWITCH_PRESET",
            lambda: self._switch_persona_preset("LATE_NIGHT_CARE"),
        )
        self.register(
            prefix + r"(?:(?:switch\s+to|activate|set(?:\s+to)?)\s+)?debug\s*surgeon(?:\s+mode)?$",
            "persona_preset_debug_surgeon",
            "PERSONA_SWITCH_PRESET",
            lambda: self._switch_persona_preset("DEBUG_SURGEON"),
        )

        # 8. Status and Level Queries
        self.register(
            prefix + r"(?:what\s+are\s+your\s+current\s+emotional\s+settings|what\s+are\s+your\s+emotional\s+settings|check\s+personality\s+levels|what\s+are\s+your\s+current\s+emotional\s+and\s+candor\s+levels|check\s+emotional\s+settings|persona\s+status|emotional\s+status|what\s+are\s+your\s+personality\s+settings)\??$",
            "persona_status_query",
            "PERSONA_STATUS_QUERY",
            lambda: self._query_persona_status(),
        )

        # ---------------------------------------------------------------------
        # Phase 4 Sub-50ms Compound Reflexes (Zero-LLM Actuation & Web Routing)
        # ---------------------------------------------------------------------
        # 9. Search on Platform (e.g. "search openjarvis on youtube", "search lofi beats on google")
        self.register(
            prefix + r"search\s+(.+?)\s+on\s+(youtube|google|github|perplexity)$",
            "search_on_platform",
            "WEB_SEARCH_PLATFORM",
            lambda q, p: search_web_reflex(p, q),
        )
        self.register(
            prefix + r"search\s+(youtube|google|github|perplexity)\s+(?:for\s+|on\s+)?(.+)$",
            "search_platform_query",
            "WEB_SEARCH_PLATFORM",
            lambda p, q: search_web_reflex(p, q),
        )

        # 10. Direct Web Visit (e.g. "visit github.com", "go to https://news.ycombinator.com")
        self.register(
            prefix + r"(?:visit|go\s+to|open\s+url)\s+(https?://\S+|www\.\S+|\S+\.[a-zA-Z]{2,}(?:/\S*)?)$",
            "visit_url",
            "VISIT_URL",
            lambda u: visit_url_reflex(u),
        )

        # 11. Switch to Application (e.g. "switch to VS Code", "focus notepad")
        self.register(
            prefix + r"(?:switch\s+to|focus)\s+([a-zA-Z0-9_\-\s]+)$",
            "switch_to_app",
            "SWITCH_TO_APP",
            lambda a: switch_to_app_reflex(a),
        )

        # 12. Close Application (e.g. "close notepad", "quit calculator")
        self.register(
            prefix + r"(?:close|quit|exit)\s+([a-zA-Z0-9_\-\s]+)$",
            "close_app",
            "CLOSE_APP",
            lambda a: close_app_reflex(a),
        )

        # 13. Direct Cursor Typing (e.g. "type Nexus v5.0", "type pytest")
        self.register(
            prefix + r"(?:type|input)\s+['\"]?(.+?)['\"]?$",
            "type_text",
            "TYPE_TEXT",
            lambda t: f"Typed {type_string_at_cursor(t)} events at cursor",
        )

        # 14. Direct Shortcut Press (e.g. "press ctrl+s", "shortcut alt+f4", "press enter")
        self.register(
            prefix + r"(?:press|shortcut)\s+([a-zA-Z0-9_\+\-]+)$",
            "press_shortcut",
            "PRESS_SHORTCUT",
            lambda c: f"Dispatched shortcut chord '{c}'" if press_key_shortcut(c) else f"Failed to dispatch shortcut '{c}'",
        )

        # 15. General Web Search Fallback (e.g. "search quantum computing")
        self.register(
            prefix + r"search\s+(.+)$",
            "search_web_default",
            "WEB_SEARCH_DEFAULT",
            lambda q: search_web_reflex("google", q),
        )

        # 16. Context Keeper (/ck) Deterministic Sub-50ms Reflexes
        self.register(
            r"^(?:/)?ck:init(?:\s+([a-zA-Z0-9_\-\.]+))?(?:\s+(.+))?$",
            "ck_init",
            "CK_INIT",
            lambda n=None, d=None: self._ck_init(n, d),
        )
        self.register(
            r"^(?:/)?ck:save(?:\s+([a-zA-Z0-9_\-\.]+))?(?:\s+(.+))?$",
            "ck_save",
            "CK_SAVE",
            lambda n=None, d=None: self._ck_save(n, d),
        )
        self.register(
            r"^(?:/)?ck:resume(?:\s+([a-zA-Z0-9_\-\.]+))?$",
            "ck_resume",
            "CK_RESUME",
            lambda n=None: self._ck_resume(n),
        )
        self.register(
            r"^(?:/)?ck:info(?:\s+([a-zA-Z0-9_\-\.]+))?$",
            "ck_info",
            "CK_INFO",
            lambda n=None: self._ck_info(n),
        )
        self.register(
            r"^(?:/)?ck:list$",
            "ck_list",
            "CK_LIST",
            lambda: self._ck_list(),
        )

        # 17. Ephemeral Swarm Spawning Reflex (@swarm <goal>)
        self.register(
            r"^(?:@swarm|/swarm)(?:\s+|:)(.+)$",
            "swarm_spawn",
            "SPAWN_SWARM",
            lambda g: self._spawn_swarm_reflex(g),
        )

    def _spawn_swarm_reflex(self, goal: str) -> str:
        clean_goal = (goal or "").strip()
        if not clean_goal:
            return "SWARM SPAWN ERROR: Goal cannot be empty"
        try:
            spawner = self._get_spawner()
            res = spawner.plan_and_spawn_swarm(clean_goal)
            agents = res.get("agents", [])
            agent_names = [f"[{a['anchor_orbiter']}] {a['role_title']}" for a in agents]
            return f"SWARM SPAWNED: Swarm '{res.get('swarm_id')}' activated {len(agents)} agents ({', '.join(agent_names)}) for '{clean_goal[:50]}'"
        except Exception as exc:
            return f"SWARM SPAWN ERROR: {exc}"

    def _get_ck_instance(self):
        from core.memory.context_keeper import ContextKeeper
        db_path = getattr(self.store, "db_path", None) if hasattr(self, "store") and self.store else None
        return ContextKeeper(db_path=db_path)

    def _ck_init(self, name: Optional[str] = None, desc: Optional[str] = None) -> str:
        ck = self._get_ck_instance()
        try:
            p = (name or os.getcwd()).strip()
            res = ck.ck_init(p, workspace_mode="DEV")
            return f"Initialized Context Keeper snapshot for '{res['project_path']}' (stack: {', '.join(res['stack'])})."
        except Exception as exc:
            return f"Failed to initialize Context Keeper: {exc}"
        finally:
            ck.close()

    def _ck_save(self, name: Optional[str] = None, desc: Optional[str] = None) -> str:
        ck = self._get_ck_instance()
        try:
            p = (name or os.getcwd()).strip()
            res = ck.ck_save(p, goal=desc or "Ongoing session")
            return f"Saved Context Keeper snapshot for '{res['project_path']}' (git: {res.get('git_head', '')[:8]})."
        except Exception as exc:
            return f"Failed to save Context Keeper snapshot: {exc}"
        finally:
            ck.close()

    def _ck_resume(self, name: Optional[str] = None) -> str:
        ck = self._get_ck_instance()
        try:
            p = (name or os.getcwd()).strip()
            res = ck.ck_resume(p)
            return res.get("brief_text", f"[CK:RESUME {p}] Ready.")
        except Exception as exc:
            return f"Failed to resume Context Keeper: {exc}"
        finally:
            ck.close()

    def _ck_info(self, name: Optional[str] = None) -> str:
        ck = self._get_ck_instance()
        try:
            p = (name or os.getcwd()).strip()
            res = ck.ck_info(p)
            if not res.get("success"):
                return f"Context snapshot '{p}' not found."
            return f"Context: {res['project_path']} | Mode: {res['workspace_mode']} | Stack: {', '.join(res['stack'])} | Goal: {res['goal']}"
        except Exception as exc:
            return f"Failed to query Context Keeper: {exc}"
        finally:
            ck.close()

    def _ck_list(self) -> str:
        ck = self._get_ck_instance()
        try:
            items = ck.ck_list()
            if not items:
                return "No stored project contexts found in Context Keeper."
            names = [f"{it['project_path']} ({it['workspace_mode']})" for it in items[:5]]
            return f"Stored Contexts: {', '.join(names)}"
        except Exception as exc:
            return f"Failed to list Context Keeper snapshots: {exc}"
        finally:
            ck.close()

    def evaluate_and_execute(self, query: str) -> Dict[str, Any]:
        """
        Evaluates a query string against the reflex token dictionary.
        If matched, executes the Win32/native reflex immediately and tracks latency (<100ms).
        """
        start_time = time.perf_counter()
        normalized_query = (query or "").strip()

        for pattern, reflex_name, action_name, handler in self._reflex_registry:
            match = pattern.match(normalized_query)
            if match:
                try:
                    groups = match.groups()
                    active_groups = [g for g in groups if g is not None]

                    if self.dry_run and not (reflex_name.startswith("persona_") or reflex_name.startswith("ck_")):
                        target_arg = active_groups[0] if active_groups else None
                        if reflex_name == "inject_timestamp":
                            res_val = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                        elif reflex_name == "mute_audio":
                            res_val = "System audio state toggled successfully"
                        elif reflex_name == "lock_workstation":
                            res_val = "Workstation locked"
                        elif reflex_name == "clear_temp_files":
                            res_val = "Cleared temporary files (dry-run)"
                        elif reflex_name == "empty_recycle_bin":
                            res_val = "Emptied Recycle Bin (dry-run)"
                        elif reflex_name == "launch_app":
                            app_name = target_arg or "app"
                            res_val = f"Launched application: {app_name}.exe (dry-run)"
                        elif reflex_name == "adjust_brightness":
                            lvl = target_arg or "70"
                            res_val = f"Display brightness set to {lvl}% (dry-run)"
                        else:
                            res_val = f"Dry-run executed reflex: {reflex_name}"
                    else:
                        if len(active_groups) > 1:
                            res_val = handler(*active_groups)
                        elif len(active_groups) == 1:
                            res_val = handler(active_groups[0])
                        else:
                            res_val = handler()

                    latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
                    utc_iso = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

                    response: Dict[str, Any] = {
                        "status": "SUCCESS",
                        "success": True,
                        "matched": True,
                        "reflex": reflex_name,
                        "reflex_name": reflex_name,
                        "action": action_name,
                        "latency_ms": latency_ms,
                        "result": res_val,
                        "output": str(res_val),
                        "spoken_confirmation": str(res_val),
                        "prompt": query,
                        "handled_by": "ReflexRouter",
                    }
                    if reflex_name == "inject_timestamp":
                        response["timestamp"] = utc_iso

                    return response
                except Exception as exc:
                    latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
                    return {
                        "status": "ERROR",
                        "success": False,
                        "reflex": reflex_name,
                        "action": action_name,
                        "latency_ms": latency_ms,
                        "error": str(exc),
                        "prompt": query,
                    }

        # Check Custom Voice Routines (<50ms match)
        if not getattr(self, "_evaluating_routine", False):
            try:
                self._evaluating_routine = True
                if getattr(self, "_routines_manager", None) is None:
                    from core.runtime.routines_manager import RoutinesManager
                    db_path = getattr(self.store, "db_path", None) if self.store else None
                    self._routines_manager = RoutinesManager(db_path=db_path, reflex_router=self, dry_run=self.dry_run)
                detailed = self._routines_manager.evaluate_detailed(normalized_query)
                if detailed.get("matched"):
                    matched_routine = detailed.get("routine", {})
                    actions = detailed.get("actions", [])
                    results = detailed.get("results", [])
                    latency_ms = detailed.get("latency_ms", round((time.perf_counter() - start_time) * 1000, 3))
                    return {
                        "status": "SUCCESS",
                        "success": True,
                        "reflex": "voice_routine",
                        "action": f"ROUTINE_{matched_routine.get('name', 'CUSTOM')}",
                        "latency_ms": latency_ms,
                        "result": f"Executed custom routine '{matched_routine.get('trigger_phrase')}': {len(results)} actions executed",
                        "output": f"Executed custom routine '{matched_routine.get('trigger_phrase')}'",
                        "spoken_confirmation": f"Executed routine {matched_routine.get('trigger_phrase')}",
                        "prompt": query,
                        "routine": matched_routine,
                        "actions": actions,
                        "results": results,
                        "handled_by": "RoutinesManager",
                    }
            except Exception as exc:
                logger.debug("Custom routine evaluation notice: %s", exc)
            finally:
                self._evaluating_routine = False

        latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
        return {
            "status": "NO_MATCH",
            "success": False,
            "matched": False,
            "reflex": None,
            "reflex_name": None,
            "action": None,
            "latency_ms": latency_ms,
            "result": "Query does not match any fast sub-100ms reflex trigger",
            "error": "No reflex rule matched; fallback to LLM intent planner",
            "prompt": query,
        }

    def route_partial_reflex(self, partial_text: str, debounce_sec: float = 2.0) -> Optional[Dict[str, Any]]:
        """
        Evaluates partial speech chunks against deterministic high-priority reflex commands (<50ms).
        Enforces a deduplication lock so commands do not fire multiple times during speech.
        """
        if not partial_text or not partial_text.strip():
            return None

        t0 = time.perf_counter()
        normalized = partial_text.strip().lower()
        now = time.time()

        for pattern, reflex_name, action_name, handler in PARTIAL_REFLEX_PATTERNS:
            if pattern.search(normalized):
                dedup_key = f"{reflex_name}:{action_name}"
                with self._partial_lock:
                    last_fired = self._partial_history.get(dedup_key, 0.0)
                    if now - last_fired < debounce_sec:
                        return None
                    self._partial_history[dedup_key] = now

                # Execute immediately (<50ms)
                try:
                    res_val = handler() if not self.dry_run else f"Dry-run executed partial reflex: {reflex_name}"
                    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                    return {
                        "status": "SUCCESS",
                        "success": True,
                        "reflex": reflex_name,
                        "action": action_name,
                        "latency_ms": latency_ms,
                        "result": res_val,
                        "output": str(res_val),
                        "spoken_confirmation": str(res_val),
                        "partial_text": partial_text,
                        "handled_by": "PartialReflexRouter",
                    }
                except Exception as exc:
                    latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
                    logger.error("Partial reflex execution failed: %s", exc)
                    return {
                        "status": "ERROR",
                        "success": False,
                        "reflex": reflex_name,
                        "action": action_name,
                        "latency_ms": latency_ms,
                        "error": str(exc),
                        "partial_text": partial_text,
                    }
        return None



# Module-level default singleton for global reflex access
_default_router = ReflexRouter()


def get_reflex_router() -> ReflexRouter:
    """Returns the module-level default ReflexRouter singleton."""
    return _default_router


def register_reflex(pattern: str, name: str, action: str, handler: Callable[..., Any]) -> None:
    """Registers a new fast token pattern with associated reflex handler into the global router."""
    _default_router.register(pattern, name, action, handler)


def execute_reflex(query: str) -> Dict[str, Any]:
    """Module-level invocation of reflex evaluation and execution."""
    return _default_router.evaluate_and_execute(query)


def register_tool_as_reflex(tool_name: str, handler: Callable[..., Any], description: str = "") -> None:
    """Registers a discovered MCP tool into the sub-50ms reflex router dispatch."""
    clean_name = tool_name.strip().lower()
    pattern = rf"^(?:run|execute|call|launch)?\s*{re.escape(clean_name)}(?:\s+(.*))?$"
    _default_router.register(pattern, clean_name, f"TOOL_{clean_name.upper()}", handler)


def evaluate_and_execute(query: str) -> Dict[str, Any]:
    """Module-level invocation of reflex evaluation and execution."""
    return _default_router.evaluate_and_execute(query)


def dispatch(utterance: str) -> Optional[str]:
    """Module-level invocation of sub-50ms deterministic reflex dispatch."""
    return _default_router.dispatch(utterance)


def route_partial_reflex(partial_text: str, debounce_sec: float = 2.0) -> Optional[Dict[str, Any]]:
    """Module-level invocation of partial reflex evaluation with deduplication lock."""
    return _default_router.route_partial_reflex(partial_text, debounce_sec=debounce_sec)
