"""
Nexus Semantic Repetition Guard & Hardware Emergency Stop (E-Stop) Engine
=============================================================================
Inspired by Nous Research / Hermes-Agent.
Guarantees execution safety and resource protection:
1. Repetition Guard: Detects and breaks infinite agent loops when actions repeat >= 3 times.
2. Emergency Stop (E-Stop): Atomic global circuit breaker halting background execution immediately.
=============================================================================
"""

import hashlib
import threading
import time
from typing import List, Dict, Any, Optional


class RepetitionCircuitBreakException(Exception):
    """Raised when the agent enters a repetitive loop."""
    pass


class EmergencyStopException(Exception):
    """Raised when an Emergency Stop (E-Stop) signal is asserted."""
    pass


class SafetyGuard:
    """
    Enforces loop prevention and immediate emergency stop halting.
    """

    _ESTOP_ACTIVE = False
    _ESTOP_REASON: Optional[str] = None
    _LOCK = threading.Lock()

    def __init__(self, loop_threshold: int = 3):
        self.loop_threshold = loop_threshold
        self.action_history: List[str] = []

    @classmethod
    def trigger_estop(cls, reason: str = "Manual User E-Stop Triggered"):
        """Activates the global emergency stop kill switch."""
        with cls._LOCK:
            cls._ESTOP_ACTIVE = True
            cls._ESTOP_REASON = reason

        try:
            from core.runtime.compute_pool import FederatedComputePool
            FederatedComputePool().release_idle_cloud_nodes(reason=f"estop:{reason}")
        except Exception:
            pass

    @classmethod
    def reset_estop(cls):
        """Resets the emergency stop flag."""
        with cls._LOCK:
            cls._ESTOP_ACTIVE = False
            cls._ESTOP_REASON = None

    @classmethod
    def is_estop_active(cls) -> bool:
        with cls._LOCK:
            return cls._ESTOP_ACTIVE

    @classmethod
    def assert_safety(cls):
        """Throws EmergencyStopException if E-Stop is triggered."""
        if cls.is_estop_active():
            raise EmergencyStopException(f"E-STOP ASSERTED: {cls._ESTOP_REASON}")

    def _hash_action(self, action_type: str, action_payload: Any) -> str:
        s = f"{action_type.lower()}:{str(action_payload).strip()}"
        return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]

    def record_and_verify_action(self, action_type: str, action_payload: Any):
        """
        Records the planned action and checks for infinite loops.
        Raises RepetitionCircuitBreakException if repeating beyond threshold.
        """
        # Always check E-Stop first
        self.assert_safety()

        h = self._hash_action(action_type, action_payload)
        self.action_history.append(h)

        # Check trailing repetitions
        if len(self.action_history) >= self.loop_threshold:
            trailing = self.action_history[-self.loop_threshold:]
            if len(set(trailing)) == 1:
                raise RepetitionCircuitBreakException(
                    f"Repetition Guard Triggered: Action '{action_type}' repeated "
                    f"{self.loop_threshold} consecutive times without progress. Breaking loop."
                )

    def reset_history(self):
        self.action_history.clear()
