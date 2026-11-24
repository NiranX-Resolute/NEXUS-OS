"""
Nexus OS v5.0 - Unified 2-Method Operator Abstraction
=============================================================================
Defines BaseOperator with:
1. capture_observation() -> dict (UIA/DOM/Device tree + DPI-aware base64 frame)
2. execute_action(action: dict) -> dict
Wired with asyncio.Event and AbortSignal support connected to SafetyGuard E-STOP.
=============================================================================
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.engine.safety_guard import EmergencyStopException, SafetyGuard

logger = logging.getLogger("nexus.engine.operators.base")


class AbortSignal:
    """Lightweight cooperative abort signal wrapper interoperable with asyncio.Event."""

    def __init__(self, event: Optional[asyncio.Event] = None):
        self._event = event or asyncio.Event()
        self._reason: str = ""

    def abort(self, reason: str = "Execution aborted by E-STOP") -> None:
        self._reason = reason
        self._event.set()

    def is_set(self) -> bool:
        return self._event.is_set() or SafetyGuard.is_estop_active()

    @property
    def reason(self) -> str:
        if SafetyGuard.is_estop_active():
            return SafetyGuard._ESTOP_REASON or "Global E-Stop active"
        return self._reason or "Aborted"

    def reset(self) -> None:
        self._reason = ""
        self._event.clear()


class BaseOperator:
    """
    Abstract base class for all NEXUS OS interaction surfaces (Win32, Browser, Android ADB).
    Strictly standardizes observation and actuation into two unified primitives:
    - capture_observation()
    - execute_action()
    """

    def __init__(self, abort_signal: Optional[Union[AbortSignal, asyncio.Event]] = None):
        if isinstance(abort_signal, AbortSignal):
            self.signal = abort_signal
        elif isinstance(abort_signal, asyncio.Event):
            self.signal = AbortSignal(event=abort_signal)
        else:
            self.signal = AbortSignal()

    def wire_estop(self) -> None:
        """Explicitly binds this operator to the global SafetyGuard E-STOP."""
        if SafetyGuard.is_estop_active():
            self.signal.abort(SafetyGuard._ESTOP_REASON or "SafetyGuard E-Stop active")

    def abort(self, reason: str = "Operator manual E-Stop") -> None:
        """Triggers local and global emergency stop immediately."""
        self.signal.abort(reason=reason)
        SafetyGuard.trigger_estop(reason=reason)

    def is_aborted(self) -> bool:
        """Returns True if local abort signal or global E-Stop is asserted."""
        return self.signal.is_set() or SafetyGuard.is_estop_active()

    def check_abort(self) -> None:
        """Raises EmergencyStopException if an E-STOP or abort signal is asserted."""
        if self.is_aborted():
            reason = self.signal.reason
            raise EmergencyStopException(f"[OPERATOR E-STOP ASSERTED] {reason}")

    def capture_observation(
        self,
        include_frame: bool = False,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Captures structural observation (UIA/DOM/ADB tree) and optional DPI-aware base64 frame.
        Overridden by concrete operator subclasses.
        """
        self.check_abort()
        return {
            "success": True,
            "operator": self.__class__.__name__,
            "elements": [],
            "frame_b64": None,
            "latency_ms": 0.0,
        }

    def execute_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes an atomic UI action (click, double_click, right_click, drag, type, hotkey, scroll, wait, finished).
        Overridden by concrete operator subclasses.
        """
        self.check_abort()
        return {
            "success": True,
            "operator": self.__class__.__name__,
            "action": action,
            "latency_ms": 0.0,
        }
