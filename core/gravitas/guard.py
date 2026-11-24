"""Nexus OS v5.0 - Gravitas Invariant Safety Guard.

Enforces deterministic reliability invariants:
1. Confined Scope: Strictly confines mutations to within the workspace tree.
2. Read-Before-Write: Enforces that target files and callers must be read before editing.
3. Anti-Retry Limit: Detects duplicate failed/repeated approaches and halts if >3 duplicate calls occur.
"""

from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Set

logger = logging.getLogger("nexus.gravitas.guard")


class ScopeViolationError(PermissionError):
    """Raised when an operation attempts to access or mutate files outside workspace scope."""
    pass


class ReadBeforeWriteViolationError(PermissionError):
    """Raised when an edit is attempted on a file before reading its contents."""
    pass


class AntiRetryViolationError(RuntimeError):
    """Raised when an identical action is executed more than the allowed retry threshold."""
    pass


class GravitasGuard:
    """Enforces execution boundaries, read-before-write invariants, and anti-retry limits."""

    def __init__(self, workspace_root: Optional[str | Path] = None, max_duplicate_calls: int = 3):
        self.workspace_root = Path(workspace_root or os.getcwd()).resolve()
        self.max_duplicate_calls = max_duplicate_calls
        self._read_paths: Set[str] = set()
        self._action_call_counts: Dict[str, int] = {}
        self._last_action_signature: Optional[str] = None
        self._consecutive_duplicate_count: int = 0

    def check_scope(self, path: str | Path) -> bool:
        """Verifies if path resides strictly inside the configured workspace tree."""
        try:
            target = Path(path).resolve()
        except Exception as e:
            raise ScopeViolationError(f"Invalid path specification: {path} ({e})")

        # Allow if target is workspace root or a child of workspace root
        if target == self.workspace_root or self.workspace_root in target.parents:
            return True

        raise ScopeViolationError(
            f"Scope violation: Path '{target}' lies outside workspace root '{self.workspace_root}'"
        )

    def is_in_scope(self, path: str | Path) -> bool:
        """Helper returning boolean without raising exception."""
        try:
            return self.check_scope(path)
        except ScopeViolationError:
            return False

    def record_read(self, path: str | Path) -> None:
        """Records a path as having been read/inspected."""
        target = Path(path).resolve()
        self._read_paths.add(str(target))
        logger.debug("Recorded read access for: %s", target)

    def check_can_write(self, path: str | Path) -> bool:
        """Enforces both Confined Scope and Read-Before-Write invariants before editing."""
        # 1. Enforce scope confinement
        self.check_scope(path)

        # 2. Enforce read-before-write
        target = str(Path(path).resolve())
        if target not in self._read_paths:
            raise ReadBeforeWriteViolationError(
                f"Read-Before-Write invariant violated: '{path}' has not been read prior to write attempt"
            )

        return True

    def record_action(self, action_signature: str) -> int:
        """Tracks action executions and enforces Anti-Retry limit.

        Throws AntiRetryViolationError if the duplicate call count exceeds 3.
        """
        norm_sig = hashlib.sha256(action_signature.encode("utf-8")).hexdigest()
        count = self._action_call_counts.get(norm_sig, 0) + 1
        self._action_call_counts[norm_sig] = count

        if norm_sig == self._last_action_signature:
            self._consecutive_duplicate_count += 1
        else:
            self._last_action_signature = norm_sig
            self._consecutive_duplicate_count = 1

        # Check threshold (throws on > 3 duplicate calls)
        if count > self.max_duplicate_calls or self._consecutive_duplicate_count > self.max_duplicate_calls:
            raise AntiRetryViolationError(
                f"Anti-retry limit exceeded: action '{action_signature}' attempted > {self.max_duplicate_calls} times"
            )

        return count

    def reset_history(self) -> None:
        """Resets action history and read paths."""
        self._read_paths.clear()
        self._action_call_counts.clear()
        self._last_action_signature = None
        self._consecutive_duplicate_count = 0
