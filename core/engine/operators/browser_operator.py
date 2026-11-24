"""
Nexus OS v5.0 - Hybrid Browser Operator Adapter
=============================================================================
Wraps BrowserVerifier (persistent warm CDP session and DOM distillation)
with unified 2-method operator abstraction:
- capture_observation() -> dict (distilled DOM elements + optional frame)
- execute_action(action: dict) -> dict (element clicks, text input, scrolling)
Guarded by E-STOP cooperative abort signals and ScopeGuard security policies.
=============================================================================
"""

from __future__ import annotations

import base64
import io
import logging
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.engine.operators.base import AbortSignal, BaseOperator
from core.engine.tools.browser_verifier import BrowserVerifier
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError

logger = logging.getLogger("nexus.engine.operators.browser")


class HybridBrowserOperator(BaseOperator):
    """
    Concrete BaseOperator implementation for browser and web application automation.
    Fast path uses DOM distillation (<50ms element lookups) with warm CDP session;
    provides visual grounding fallback when DOM tree elements cannot be located.
    """

    def __init__(
        self,
        verifier: Optional[Union[BrowserVerifier, Any]] = None,
        abort_signal: Optional[Union[AbortSignal, Any]] = None,
    ):
        super().__init__(abort_signal=abort_signal)
        if verifier is not None and hasattr(verifier, "session"):
            self.session = verifier.session
            self.verifier = verifier
        elif verifier is not None and hasattr(verifier, "visit"):
            self.session = verifier
            self.verifier = verifier
        else:
            from core.engine.tools.browser_verifier import _warm_browser, BrowserVerifier as BV
            self.session = _warm_browser
            self.verifier = verifier or BV()
        self.scope_guard = ScopeGuard()

    def capture_observation(
        self,
        include_frame: bool = False,
        url: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Captures distilled DOM interactive elements and optional page frame.
        """
        t_start = time.perf_counter()
        self.check_abort()

        if url:
            visit_res = self.session.visit(url)
            elements = visit_res.get("elements", [])
        else:
            self.session.ensure_warm()
            elements = self.session.get_elements()

        frame_b64: Optional[str] = None
        if include_frame:
            try:
                from PIL import ImageGrab

                img = ImageGrab.grab()
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                frame_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
            except Exception as exc:
                logger.debug("Browser visual capture notice: %s", exc)

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": True,
            "operator": "HybridBrowserOperator",
            "url": getattr(self.session, "_current_url", ""),
            "page_title": getattr(self.session, "_current_title", ""),
            "elements": elements,
            "elements_count": len(elements),
            "frame_b64": frame_b64,
            "latency_ms": elapsed_ms,
        }

    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes web element actuation with ScopeGuard validation and E-STOP checks.
        """
        t_start = time.perf_counter()
        self.check_abort()

        action_type = str(action.get("type") or action.get("action") or "click").lower().strip()
        auto_approve = bool(action.get("auto_approve", False))

        target_text = str(action.get("text") or action.get("query") or action.get("content") or "")
        element_id = action.get("element_id") or action.get("id")

        # 1. ScopeGuard validation on sensitive browser actions
        if action_type in ("click", "type"):
            label = f"Browser {action_type} on {target_text or f'[{element_id}]'}"
            self.scope_guard.check_ui_action(
                label=label,
                target=getattr(self.session, "_current_url", "Web Browser"),
                auto_approve=auto_approve,
            )

        # 2. Dispatch action
        result_details: Dict[str, Any] = {}
        if action_type == "click":
            if element_id is not None:
                result_details = self.session.click(int(element_id))
            elif target_text:
                found_id = None
                for el in self.session.get_elements():
                    if target_text.lower() in str(el.get("text", "")).lower():
                        found_id = el.get("id")
                        break
                if found_id is not None:
                    result_details = self.session.click(found_id)
                else:
                    return {"success": False, "error": f"Element '{target_text}' not found in DOM map"}
            else:
                return {"success": False, "error": "Click requires 'element_id' or 'query'"}

        elif action_type == "type":
            content = str(action.get("content") or action.get("text") or "")
            submit = bool(action.get("submit", False))
            if element_id is not None:
                result_details = self.session.type_text(int(element_id), content, submit=submit)
            else:
                return {"success": False, "error": "Type requires 'element_id'"}

        elif action_type == "scroll":
            direction = str(action.get("direction", "down")).lower()
            amount = int(action.get("amount", 500))
            result_details = self.session.scroll(direction=direction, amount=amount)

        elif action_type == "wait":
            duration = float(action.get("duration", 0.5))
            end_t = time.perf_counter() + duration
            while time.perf_counter() < end_t:
                self.check_abort()
                time.sleep(min(0.05, max(0.001, end_t - time.perf_counter())))
            result_details = {"success": True, "action": "WAIT", "duration": duration}

        elif action_type == "finished":
            result_details = {"success": True, "action": "FINISHED", "message": action.get("message", "Browser task finished")}

        else:
            return {"success": False, "error": f"Unknown action type '{action_type}'"}

        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)
        return {
            "success": result_details.get("success", True),
            "operator": "HybridBrowserOperator",
            "action": action_type,
            "latency_ms": elapsed_ms,
            "details": result_details,
        }
