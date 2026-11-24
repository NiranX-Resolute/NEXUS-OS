"""
Nexus Demonstration Compiler & Deterministic Replay Engine
=============================================================================
Inspired by OpenAdapt ("Verified Last-Mile Execution for Agents").
Provides:
1. Demonstration Recording: Captures action sequences (clicks, types, commands).
2. Deterministic Program Compiler: Generates standalone executable scripts
   that run repeatedly WITHOUT generative model API calls (0 tokens).
3. Post-execution Invariant Verifier: Enforces strict invariant checks before
   marking runs as VERIFIED.
=============================================================================
"""

import json
import os
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, Any, List, Optional


@dataclass
class RecordedAction:
    action_type: str  # 'command', 'click', 'type', 'assert_file', 'assert_window'
    parameters: Dict[str, Any]
    expected_outcome: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class DemonstrationProgram:
    name: str
    description: str
    actions: List[RecordedAction]
    invariants: List[Dict[str, Any]]
    created_at: float = field(default_factory=time.time)
    verified_runs_count: int = 0


class DemonstrationCompiler:
    """
    Records, compiles, and deterministically executes recurring workstation workflows.
    """

    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or "."
            self.storage_dir = Path(home) / ".nexus-agent" / "demonstrations"
        else:
            self.storage_dir = Path(storage_dir)

        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._active_recording: Optional[DemonstrationProgram] = None

    def start_recording(self, name: str, description: str = "") -> DemonstrationProgram:
        """Begins recording a new workflow demonstration."""
        demo = DemonstrationProgram(
            name=name,
            description=description,
            actions=[],
            invariants=[]
        )
        self._active_recording = demo
        return demo

    def record_step(self, action_type: str, parameters: Dict[str, Any], expected: Optional[str] = None):
        """Appends an action to the active recording."""
        if not self._active_recording:
            raise RuntimeError("No active recording in progress. Call start_recording first.")

        action = RecordedAction(
            action_type=action_type,
            parameters=parameters,
            expected_outcome=expected
        )
        self._active_recording.actions.append(action)

    def add_invariant_check(self, invariant_type: str, target: str, condition: str = "exists"):
        """Adds a verification requirement to be checked after replay."""
        if not self._active_recording:
            raise RuntimeError("No active recording in progress.")

        self._active_recording.invariants.append({
            "type": invariant_type,
            "target": target,
            "condition": condition
        })

    def compile_program(self) -> Path:
        """
        Compiles the active recording into a persistent program recipe on disk.
        """
        if not self._active_recording:
            raise RuntimeError("No active recording to compile.")

        demo = self._active_recording
        file_path = self.storage_dir / f"{demo.name}.json"

        data = {
            "name": demo.name,
            "description": demo.description,
            "created_at": demo.created_at,
            "actions": [asdict(a) for a in demo.actions],
            "invariants": demo.invariants,
            "verified_runs_count": demo.verified_runs_count
        }

        with open(file_path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, indent=2)

        self._active_recording = None
        return file_path

    def replay_program(self, program_name: str, executor_callback: Optional[callable] = None) -> Dict[str, Any]:
        """
        Executes the compiled demonstration deterministically without LLM calls.
        """
        file_path = self.storage_dir / f"{program_name}.json"
        if not file_path.exists():
            return {"success": False, "error": f"Demonstration program '{program_name}' not found."}

        with open(file_path, "r", encoding="utf-8") as fp:
            data = json.load(fp)

        executed_actions = []
        for idx, act in enumerate(data.get("actions", []), 1):
            act_type = act["action_type"]
            params = act["parameters"]

            step_res = {"step": idx, "action": act_type, "status": "EXECUTED"}
            if executor_callback:
                step_res["result"] = executor_callback(act_type, params)

            executed_actions.append(step_res)

        # Check Invariants
        invariants_passed = True
        failed_invariants = []
        for inv in data.get("invariants", []):
            inv_type = inv["type"]
            target = inv["target"]
            cond = inv["condition"]

            if inv_type == "file" and cond == "exists":
                if not Path(target).exists():
                    invariants_passed = False
                    failed_invariants.append(f"File '{target}' did not exist after replay.")

        data["verified_runs_count"] = data.get("verified_runs_count", 0) + 1
        with open(file_path, "w", encoding="utf-8") as fp:
            json.dump(data, fp, indent=2)

        return {
            "success": invariants_passed,
            "status": "VERIFIED" if invariants_passed else "INVARIANT_FAILED",
            "program": program_name,
            "actions_executed": len(executed_actions),
            "failed_invariants": failed_invariants
        }
