"""
Nexus OS v5.0 - Android ADB Operator Adapter
=============================================================================
Wraps Android ADB Device Control MCP Plugin (android_adb_plugin.py)
with unified 2-method operator abstraction:
- capture_observation() -> dict (ADB device telemetry + lossless frame)
- execute_action(action: dict) -> dict (touchscreen tap, swipe, keyevent)
Guarded by ScopeGuard HITL validation and E-STOP cooperative abort signals.
=============================================================================
"""

from __future__ import annotations

import base64
import logging
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.engine.operators.base import AbortSignal, BaseOperator
from core.mcp.plugins.android_adb_plugin import (
    _run_adb_cmd,
    android_screenshot,
    android_status,
    android_tap,
)
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError

logger = logging.getLogger("nexus.engine.operators.android")


class AndroidADBOperator(BaseOperator):
    """
    Concrete BaseOperator implementation for Android touchscreen devices via USB/Tailscale ADB.
    Provides sub-50ms touchscreen input dispatch and frame capture for visual grounding.
    """

    def __init__(self, abort_signal: Optional[Union[AbortSignal, Any]] = None):
        super().__init__(abort_signal=abort_signal)
        self.scope_guard = ScopeGuard()

    def capture_observation(
        self,
        include_frame: bool = False,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Captures connected Android device connectivity and optional screen frame.
        """
        t_start = time.perf_counter()
        self.check_abort()

        st = android_status()
        frame_b64: Optional[str] = None

        if include_frame and st.get("connected"):
            snap_res = android_screenshot()
            if snap_res.get("success") and snap_res.get("saved_path"):
                try:
                    p = Path(snap_res["saved_path"])
                    if p.exists():
                        frame_b64 = base64.b64encode(p.read_bytes()).decode("ascii")
                except Exception as exc:
                    logger.debug("Failed reading Android screenshot bytes: %s", exc)

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": True,
            "operator": "AndroidADBOperator",
            "connected": bool(st.get("connected", False)),
            "model": st.get("model", ""),
            "battery": st.get("battery", ""),
            "devices": st.get("devices", []),
            "frame_b64": frame_b64,
            "latency_ms": elapsed_ms,
        }

    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes touchscreen or hardware action on connected Android device.
        """
        t_start = time.perf_counter()
        self.check_abort()

        action_type = str(action.get("type") or action.get("action") or "tap").lower().strip()
        auto_approve = bool(action.get("auto_approve", False))

        # 1. Resolve coordinates
        target_pt = action.get("target_point")
        x = action.get("x")
        y = action.get("y")
        if target_pt and isinstance(target_pt, (list, tuple)) and len(target_pt) >= 2:
            x, y = int(target_pt[0]), int(target_pt[1])
        elif x is not None and y is not None:
            x, y = int(x), int(y)

        # 2. ScopeGuard validation on sensitive device actions
        if action_type in ("tap", "click", "keyevent"):
            label = f"Android {action_type} at ({x}, {y})" if (x is not None and y is not None) else f"Android {action_type}"
            self.scope_guard.check_ui_action(
                label=label,
                target="Android Display",
                auto_approve=auto_approve,
            )

        # 3. Dispatch action
        result_details: Dict[str, Any] = {}
        if action_type in ("tap", "click"):
            if x is None or y is None:
                return {"success": False, "error": "Tap action requires 'x' and 'y' coordinates"}
            result_details = android_tap(x=x, y=y)

        elif action_type in ("drag", "swipe"):
            sx = int(action.get("start_x", x or 0))
            sy = int(action.get("start_y", y or 0))
            ex = int(action.get("end_x", sx))
            ey = int(action.get("end_y", sy))
            duration_ms = int(action.get("duration_ms", 300))
            try:
                proc = _run_adb_cmd(["shell", "input", "swipe", str(sx), str(sy), str(ex), str(ey), str(duration_ms)], timeout=5.0)
                result_details = {
                    "success": proc.returncode == 0,
                    "action": "swipe",
                    "from": [sx, sy],
                    "to": [ex, ey],
                    "error": proc.stderr if proc.returncode != 0 else "",
                }
            except Exception as exc:
                result_details = {"success": False, "error": str(exc)}

        elif action_type == "type":
            text = str(action.get("content") or action.get("text") or "")
            clean_text = text.replace(" ", "%s")
            try:
                proc = _run_adb_cmd(["shell", "input", "text", clean_text], timeout=5.0)
                result_details = {"success": proc.returncode == 0, "action": "type", "text": text}
            except Exception as exc:
                result_details = {"success": False, "error": str(exc)}

        elif action_type == "keyevent":
            keycode = str(action.get("key") or action.get("keycode") or "KEYCODE_HOME")
            try:
                proc = _run_adb_cmd(["shell", "input", "keyevent", keycode], timeout=5.0)
                result_details = {"success": proc.returncode == 0, "action": "keyevent", "keycode": keycode}
            except Exception as exc:
                result_details = {"success": False, "error": str(exc)}

        elif action_type == "wait":
            duration = float(action.get("duration", 0.5))
            end_t = time.perf_counter() + duration
            while time.perf_counter() < end_t:
                self.check_abort()
                time.sleep(min(0.05, max(0.001, end_t - time.perf_counter())))
            result_details = {"success": True, "action": "WAIT", "duration": duration}

        elif action_type == "finished":
            result_details = {"success": True, "action": "FINISHED", "message": action.get("message", "Android task finished")}

        else:
            return {"success": False, "error": f"Unknown Android action type '{action_type}'"}

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": result_details.get("success", True),
            "operator": "AndroidADBOperator",
            "action": action_type,
            "latency_ms": elapsed_ms,
            "details": result_details,
        }
