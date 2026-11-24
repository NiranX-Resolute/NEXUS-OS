"""
Nexus OS v5.0 - Gravitas Guard
Deterministic Invariant Guardrail System enforcing the 6 Core GRAVITAS Invariants:
1. Confined Scope Enforcement
2. Read-Before-Write Verification
3. Anti-Retry Loop Prevention
4. Fresh Evidence Assertion
5. Gated Completion Verification
6. Explicit Epistemic Uncertainty
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from collections import defaultdict
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Set, Tuple


class GravitasInvariantException(Exception):
    """Base exception for all Gravitas invariant guardrail violations."""
    pass


class ScopeViolationError(GravitasInvariantException):
    """Raised when an operation attempts to access paths outside the active workspace perimeter."""
    pass


class ReadBeforeWriteViolationError(GravitasInvariantException):
    """Raised when a mutation is attempted on a target that has not been read in this session."""
    pass


class AntiRetryViolationError(GravitasInvariantException):
    """Raised when an agent attempts byte-identical repeated actions exceeding the retry threshold."""
    pass


class StaleEvidenceError(GravitasInvariantException):
    """Raised when completion is claimed on stale or missing post-mutation validator evidence."""
    pass


class GatedCompletionError(GravitasInvariantException):
    """Raised when completion is attempted while required acceptance criteria remain unverified."""
    pass


class EpistemicUncertaintyError(GravitasInvariantException):
    """Raised when unverified claims are fabricated without explicit epistemic uncertainty markers."""
    pass


class GravitasGuard:
    """
    Enforcer for all 6 Gravitas Invariants. Maintains read histories, mutation timelines,
    call signature frequency tables, and validator evidence registers.
    """

    WRITE_TOOLS = {"write_file", "edit_file", "apply_diff", "patch_file", "append_file"}
    READ_TOOLS = {"read_file", "view_symbol", "read_resource", "inspect_file", "grep_search"}

    def __init__(self, max_retries: int = 3):
        self.max_retries = max_retries
        self.file_read_history: Set[str] = set()
        self.tool_call_counts: Dict[str, int] = defaultdict(int)
        self.mutation_timestamps: Dict[str, float] = {}
        self.validator_evidence: Dict[str, Tuple[bool, float]] = {}  # {criterion_id: (passed, timestamp)}
        self.action_history: List[Dict[str, Any]] = []

    def _normalize_path(self, target_path: str) -> str:
        """Normalizes path for reliable cross-platform comparison."""
        try:
            return str(Path(os.path.abspath(os.path.normpath(target_path))).resolve()).lower()
        except Exception:
            return os.path.normpath(target_path).lower()

    def record_read(self, target_path: str) -> str:
        """
        Records a target path as having been read by the agent.
        
        Args:
            target_path: Path to target file.
            
        Returns:
            Normalized path recorded.
        """
        norm = self._normalize_path(target_path)
        self.file_read_history.add(norm)
        return norm

    def record_action(self, action: str, params: Dict[str, Any]):
        """Records any tool invocation into the guard's action journal."""
        self.action_history.append({
            "action": action,
            "params": params,
            "timestamp": time.time(),
        })

        # Automatically record reads for read tools
        if action.lower() in self.READ_TOOLS:
            path_arg = params.get("Path") or params.get("path") or params.get("target_path")
            if path_arg:
                self.record_read(str(path_arg))

    def assert_scope_confined(self, target_path: str, governor: Any = None):
        """
        Rule 1: Confined Scope Enforcement.
        Writes or operations outside the declared workspace scope are strictly denied.
        """
        if governor is None:
            return

        if not hasattr(governor, "validate_path_access"):
            return

        if not governor.validate_path_access(target_path):
            raise ScopeViolationError(
                f"[GRAVITAS Invariant 1 Violation] Path '{target_path}' is outside the authorized "
                f"perimeter for active workspace mode '{getattr(governor, 'active_mode', 'UNKNOWN')}'. "
                "Amend the contract or change workspace mode before modifying."
            )

    def assert_read_before_write(self, target_path: str, allow_new_file: bool = False):
        """
        Rule 2: Read-Before-Write Tracking.
        Mutating or editing an existing file requires having read it first during this session.
        """
        norm = self._normalize_path(target_path)

        # If file does not exist on disk and allow_new_file is true, writing is permitted
        if not os.path.exists(target_path) and allow_new_file:
            return

        if norm not in self.file_read_history:
            # If the file exists on disk, it MUST have been read first
            if os.path.exists(target_path):
                raise ReadBeforeWriteViolationError(
                    f"[GRAVITAS Invariant 2 Violation] File '{target_path}' has not been read "
                    "in this session. You must inspect the target, its tests, and its callers before editing."
                )

    def assert_anti_retry(self, tool_name: str, params: Dict[str, Any]):
        """
        Rule 3: Anti-Retry Guards.
        Never retry a failed approach byte-identically; max 3 identical tool calls permitted.
        """
        try:
            serialized = json.dumps(params, sort_keys=True, default=str)
        except Exception:
            serialized = str(params)

        call_sig = hashlib.sha256(f"{tool_name.lower()}:{serialized}".encode("utf-8")).hexdigest()
        count = self.tool_call_counts[call_sig]

        if count >= self.max_retries:
            raise AntiRetryViolationError(
                f"[GRAVITAS Invariant 3 Violation] Tool '{tool_name}' with identical parameters "
                f"has been called {count} times, reaching the anti-retry threshold ({self.max_retries}). "
                "Change the diagnosis, context, or strategy before retrying."
            )

        self.tool_call_counts[call_sig] = count + 1

    def record_mutation(self, target_path: str):
        """Tracks the timestamp of a modification for evidence freshness checks."""
        norm = self._normalize_path(target_path)
        self.mutation_timestamps[norm] = time.time()

    def record_validator_result(self, criterion_id: str, passed: bool):
        """Records an execution of an automated test/validator with high-precision timestamp."""
        self.validator_evidence[criterion_id] = (passed, time.time())

    def assert_fresh_evidence(self, criterion_id: str, target_path: Optional[str] = None):
        """
        Rule 4: Fresh Evidence Assertion.
        A criterion is done only when a validator passed AFTER the last relevant mutation.
        """
        evidence = self.validator_evidence.get(criterion_id)
        if not evidence:
            raise StaleEvidenceError(
                f"[GRAVITAS Invariant 4 Violation] No validator evidence recorded for criterion '{criterion_id}'."
            )

        passed, val_time = evidence
        if not passed:
            raise StaleEvidenceError(
                f"[GRAVITAS Invariant 4 Violation] Validator for criterion '{criterion_id}' failed."
            )

        if target_path:
            norm = self._normalize_path(target_path)
            mut_time = self.mutation_timestamps.get(norm, 0.0)
            if val_time <= mut_time:
                raise StaleEvidenceError(
                    f"[GRAVITAS Invariant 4 Violation] Validator evidence for '{criterion_id}' (t={val_time}) "
                    f"is stale. Mutation occurred at t={mut_time}. Re-run verification."
                )

    def assert_gated_completion(
        self,
        required_criteria: List[str],
        completed_criteria: Set[str],
    ):
        """
        Rule 5: Gated Completion.
        Completion is denied unless all required acceptance criteria are verified.
        """
        missing = [c for c in required_criteria if c not in completed_criteria]
        if missing:
            raise GatedCompletionError(
                f"[GRAVITAS Invariant 5 Violation] Completion blocked. Unmet required criteria: {missing}"
            )

    def assert_epistemic_honesty(
        self,
        claim: str,
        confidence: float,
        is_verified: bool,
    ):
        """
        Rule 6: Explicit Epistemic Uncertainty.
        Mark uncertain or unverifiable claims explicitly instead of fabricating certainty.
        """
        if confidence > 0.85 and not is_verified:
            raise EpistemicUncertaintyError(
                f"[GRAVITAS Invariant 6 Violation] High confidence ({confidence}) asserted on "
                f"unverified claim '{claim}'. Mark epistemic uncertainty explicitly."
            )

    def evaluate_tool_call(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        governor: Any = None,
        allow_new_file: bool = False,
    ) -> bool:
        """
        Unified pre-execution gateway evaluating all applicable invariants before dispatch.
        
        Args:
            tool_name: Name of tool to execute.
            arguments: Dictionary of arguments.
            governor: Optional WorkspaceGovernor instance.
            allow_new_file: Whether write to nonexistent file is allowed.
            
        Returns:
            True if all invariants pass.
        """
        norm_tool = tool_name.strip().lower()

        # Enforce Anti-Retry
        self.assert_anti_retry(norm_tool, arguments)

        # Extract target path if present
        path_arg = arguments.get("Path") or arguments.get("path") or arguments.get("target_path")
        target_path = str(path_arg) if path_arg else None

        # Enforce Scope & Read-Before-Write on write tools
        if norm_tool in self.WRITE_TOOLS:
            if target_path:
                if governor:
                    self.assert_scope_confined(target_path, governor)
                self.assert_read_before_write(target_path, allow_new_file=allow_new_file)
                self.record_mutation(target_path)

        # Enforce Scope on read tools & auto-record read
        elif norm_tool in self.READ_TOOLS:
            if target_path:
                if governor:
                    self.assert_scope_confined(target_path, governor)
                self.record_read(target_path)

        self.record_action(norm_tool, arguments)
        return True
