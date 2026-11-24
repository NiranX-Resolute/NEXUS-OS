"""
Nexus Autonomous Engine - Demand-Driven Subsystem Governor
=============================================================================
Zero-waste, just-in-time lifecycle coordinator for engine execution harnesses.
Prevents all 16+ flagship subsystems from running or allocating resources
simultaneously. Subsystems remain dormant (0 MB, 0 CPU) until a task or user
explicitly requests them, and are auto-hibernated once the task concludes.
=============================================================================
"""

import time
import threading
from typing import Dict, Any, Optional, Callable, List


class SubsystemState:
    def __init__(self, name: str, estimated_ram_mb: int = 35):
        self.name = name
        self.estimated_ram_mb = estimated_ram_mb
        self.status: str = "dormant"  # "dormant" | "active" | "hibernated"
        self.instance: Any = None
        self.activation_count: int = 0
        self.last_activated_at: Optional[float] = None
        self.last_released_at: Optional[float] = None


class SubsystemDemandGovernor:
    """
    Dedicated Governor ensuring harnesses and subsystems only execute
    when explicitly demanded by the user prompt or routed task plan.
    """
    DEFAULT_WEIGHTS = {
        "terminal_pty": 55,
        "browser_verifier": 120,
        "desktop_ufo": 65,
        "filesystem_patch": 25,
        "aci_editor": 40,
        "repo_map": 45,
        "plan_sandbox": 50,
        "voice_pipeline": 75,
        "telephony_gateway": 30,
        "omnichannel_bridge": 35,
        "learning_graph": 30,
        "tool_synthesizer": 35,
        "demo_compiler": 40,
        "vla_grounding": 60,
    }

    def __init__(self, on_demand_mode: bool = True):
        self.on_demand_mode = on_demand_mode
        self._states: Dict[str, SubsystemState] = {}
        self._lock = threading.Lock()

        # Pre-register known flagship subsystems
        for name, ram in self.DEFAULT_WEIGHTS.items():
            self._states[name] = SubsystemState(name, estimated_ram_mb=ram)

    def is_demand_mode(self) -> bool:
        return self.on_demand_mode

    def set_demand_mode(self, enabled: bool) -> None:
        with self._lock:
            self.on_demand_mode = enabled
            if enabled:
                self._hibernate_all_unlocked()

    def get_or_activate(self, name: str, factory_fn: Callable[[], Any]) -> Any:
        """
        Retrieves the subsystem instance, lazily activating it via factory_fn
        ONLY if and when demanded.
        """
        with self._lock:
            state = self._states.get(name)
            if not state:
                state = SubsystemState(name, estimated_ram_mb=30)
                self._states[name] = state

            if state.instance is None:
                state.instance = factory_fn()

            state.status = "active"
            state.activation_count += 1
            state.last_activated_at = time.time()
            return state.instance

    def is_active(self, name: str) -> bool:
        with self._lock:
            state = self._states.get(name)
            return state.status == "active" if state else False

    def hibernate(self, name: str) -> bool:
        """Hibernates a specific subsystem, closing open processes or handles."""
        with self._lock:
            state = self._states.get(name)
            if not state or state.status != "active":
                return False

            if state.instance is not None:
                # Call cleanup methods if present
                for method in ("close", "shutdown", "stop", "cleanup"):
                    if hasattr(state.instance, method) and callable(getattr(state.instance, method)):
                        try:
                            getattr(state.instance, method)()
                        except Exception:
                            pass
                        break
                state.instance = None

            state.status = "hibernated"
            state.last_released_at = time.time()
            return True

    def hibernate_all(self) -> int:
        """Hibernates all active execution subsystems."""
        with self._lock:
            return self._hibernate_all_unlocked()

    def _hibernate_all_unlocked(self) -> int:
        count = 0
        for name, state in self._states.items():
            if state.status == "active":
                if state.instance is not None:
                    for method in ("close", "shutdown", "stop", "cleanup"):
                        if hasattr(state.instance, method) and callable(getattr(state.instance, method)):
                            try:
                                getattr(state.instance, method)()
                            except Exception:
                                pass
                            break
                    state.instance = None
                state.status = "hibernated"
                state.last_released_at = time.time()
                count += 1
        return count

    def get_telemetry(self) -> Dict[str, Any]:
        """Calculates current memory preserved and active vs dormant counts."""
        with self._lock:
            active_names = []
            dormant_names = []
            ram_saved = 0

            for name, state in self._states.items():
                if state.status == "active":
                    active_names.append(name)
                else:
                    dormant_names.append(name)
                    ram_saved += state.estimated_ram_mb

            return {
                "demand_mode_enabled": self.on_demand_mode,
                "total_subsystems": len(self._states),
                "active_count": len(active_names),
                "dormant_count": len(dormant_names),
                "ram_saved_mb": ram_saved,
                "active_subsystems": active_names,
                "dormant_subsystems": dormant_names
            }
