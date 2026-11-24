"""
Nexus OS v5.0 - Win32 Local Desktop Operator Adapter
=============================================================================
Wraps DesktopUFO (UIA / Win32 tree distillation and SendInput motor actuation)
with unified 2-method operator abstraction:
- capture_observation() -> dict (UIA controls + DPI-aware base64 frame)
- execute_action(action: dict) -> dict (clicks, typing, drag, scroll, hotkeys)
Guarded by ScopeGuard hit-test validation and E-STOP cooperative abort signals.
=============================================================================
"""

from __future__ import annotations

import base64
import ctypes
from ctypes import wintypes
import io
import logging
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.engine.operators.base import AbortSignal, BaseOperator
from core.engine.safety_guard import EmergencyStopException, SafetyGuard
from core.engine.tools.desktop_ufo import (
    DesktopUFO,
    _get_user32,
    click_at,
    drag_element,
    get_foreground_window_info,
    send_keystrokes,
)
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError

logger = logging.getLogger("nexus.engine.operators.win32")


def get_system_dpi_scale(hwnd: int = 0) -> float:
    """Returns the DPI scale multiplier for the window or primary desktop display."""
    user32 = _get_user32()
    if not user32 or sys.platform != "win32":
        return 1.0

    try:
        if hwnd and hasattr(user32, "GetDpiForWindow"):
            dpi = user32.GetDpiForWindow(hwnd)
            if dpi > 0:
                return round(float(dpi) / 96.0, 3)
        if hasattr(user32, "GetDpiForSystem"):
            dpi = user32.GetDpiForSystem()
            if dpi > 0:
                return round(float(dpi) / 96.0, 3)
    except Exception as exc:
        logger.debug("DPI scale query notice: %s", exc)

    return 1.0


def get_screen_dimensions() -> Tuple[int, int]:
    """Returns desktop primary display resolution in physical/logical pixels."""
    user32 = _get_user32()
    if user32 and sys.platform == "win32":
        try:
            w = user32.GetSystemMetrics(0)  # SM_CXSCREEN
            h = user32.GetSystemMetrics(1)  # SM_CYSCREEN
            if w > 0 and h > 0:
                return int(w), int(h)
        except Exception:
            return 1920, 1080
    return 1920, 1080


class Win32LocalOperator(BaseOperator):
    """
    Concrete BaseOperator implementation for Windows desktop automation.
    Fast path uses native sub-30ms UIA / Win32 tree inspection;
    captures DPI-aware base64 frames when requested for visual grounding.
    """

    def __init__(
        self,
        ufo: Optional[DesktopUFO] = None,
        abort_signal: Optional[Union[AbortSignal, Any]] = None,
    ):
        super().__init__(abort_signal=abort_signal)
        self.ufo = ufo or DesktopUFO()
        self.scope_guard = ScopeGuard()

    def capture_observation(
        self,
        include_frame: bool = False,
        target_hwnd: Optional[int] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Captures sub-30ms UIA active window controls and optional DPI-aware frame.
        """
        t_start = time.perf_counter()
        self.check_abort()

        # 1. Structural inspection via DesktopUFO fast path
        elements = self.ufo.inspect_active_window(target_hwnd=target_hwnd)
        win_meta = get_foreground_window_info()
        hwnd = win_meta.get("hwnd", 0)

        screen_w, screen_h = get_screen_dimensions()
        dpi_scale = get_system_dpi_scale(hwnd=hwnd)

        # 2. Optional DPI-aware screenshot capture
        frame_b64: Optional[str] = None
        if include_frame:
            try:
                from PIL import ImageGrab

                img = ImageGrab.grab()
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                frame_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception as exc:
                logger.debug("Visual frame capture notice: %s", exc)

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": True,
            "operator": "Win32LocalOperator",
            "active_window": win_meta.get("title", ""),
            "process_name": win_meta.get("process_name", ""),
            "hwnd": hwnd,
            "elements": elements,
            "elements_count": len(elements),
            "screen_resolution": [screen_w, screen_h],
            "dpi_scale": dpi_scale,
            "frame_b64": frame_b64,
            "latency_ms": elapsed_ms,
        }

    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes atomic UI action with ScopeGuard hit-test gating and E-STOP checks.
        """
        t_start = time.perf_counter()
        self.check_abort()

        action_type = str(action.get("type") or action.get("action") or "click").lower().strip()
        auto_approve = bool(action.get("auto_approve", False))

        # 1. Resolve coordinates if present
        target_pt = action.get("target_point")
        x = action.get("x")
        y = action.get("y")
        if target_pt and isinstance(target_pt, (list, tuple)) and len(target_pt) >= 2:
            x, y = int(target_pt[0]), int(target_pt[1])
        elif x is not None and y is not None:
            x, y = int(x), int(y)

        # 2. ScopeGuard coordinate hit-testing before clicking
        if x is not None and y is not None and action_type in ("click", "double_click", "right_click", "drag"):
            if hasattr(self.scope_guard, "check_coordinate_action"):
                self.scope_guard.check_coordinate_action(
                    x=x,
                    y=y,
                    action_type=action_type,
                    auto_approve=auto_approve,
                )
            else:
                self.scope_guard.check_ui_action(
                    label=f"{action_type} at ({x}, {y})",
                    target=f"Win32 ({x}, {y})",
                    auto_approve=auto_approve,
                )

        # 3. Dispatch action
        result_details: Dict[str, Any] = {}
        if action_type == "click":
            if x is not None and y is not None:
                result_details = click_at(x, y, button=action.get("button", "left"), clicks=1)
            elif "element_id" in action:
                result_details = self.ufo.click_element_by_id(int(action["element_id"]))
            elif "query" in action:
                result_details = self.ufo.click_element(action["query"])
            else:
                return {"success": False, "error": "Click requires (x, y), element_id, or query"}

        elif action_type == "double_click":
            if x is not None and y is not None:
                result_details = click_at(x, y, button="left", clicks=2)
            else:
                return {"success": False, "error": "Double-click requires (x, y) coordinates"}

        elif action_type == "right_click":
            if x is not None and y is not None:
                result_details = click_at(x, y, button="right", clicks=1)
            else:
                return {"success": False, "error": "Right-click requires (x, y) coordinates"}

        elif action_type == "drag":
            start_coords = action.get("start_coords") or (x, y)
            end_coords = action.get("end_coords") or (action.get("end_x", 0), action.get("end_y", 0))
            result_details = drag_element(
                start_coords_or_index=start_coords,
                end_coords_or_index=end_coords,
                auto_approve=auto_approve,
            )

        elif action_type == "type":
            text = str(action.get("content") or action.get("text") or "")
            submit = bool(action.get("submit", False))
            if "element_id" in action:
                result_details = self.ufo.type_element_by_id(int(action["element_id"]), text, submit=submit)
            else:
                result_details = send_keystrokes(text)
                if submit:
                    send_keystrokes("{ENTER}")

        elif action_type == "hotkey":
            key_combo = str(action.get("key") or action.get("keys") or "")
            result_details = send_keystrokes(key_combo)

        elif action_type == "scroll":
            direction = str(action.get("direction", "down")).lower()
            amount = int(action.get("amount", 300))
            wheel_delta = -amount if direction == "down" else amount
            user32 = _get_user32()
            if user32:
                user32.mouse_event(0x0800, 0, 0, wheel_delta, 0)  # MOUSEEVENTF_WHEEL
            result_details = {"success": True, "action": "SCROLL", "direction": direction, "amount": amount}

        elif action_type == "wait":
            duration = float(action.get("duration", 0.5))
            end_t = time.perf_counter() + duration
            while time.perf_counter() < end_t:
                self.check_abort()
                time.sleep(min(0.05, max(0.001, end_t - time.perf_counter())))
            result_details = {"success": True, "action": "WAIT", "duration": duration}

        elif action_type == "finished":
            result_details = {"success": True, "action": "FINISHED", "message": action.get("message", "Task finished")}

        else:
            return {"success": False, "error": f"Unknown action type '{action_type}'"}

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": result_details.get("success", True),
            "operator": "Win32LocalOperator",
            "action": action_type,
            "target": [x, y] if (x is not None and y is not None) else None,
            "latency_ms": elapsed_ms,
            "details": result_details,
        }
