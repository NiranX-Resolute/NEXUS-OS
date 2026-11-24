"""Nexus OS v5.0 - Gravitas Reliability Invariant Test Suite.

Verifies:
1. Confined Scope (path inside vs outside workspace boundary)
2. Read-Before-Write invariant enforcement
3. Anti-Retry limit (throws on >3 duplicate calls)
"""

from __future__ import annotations

import tempfile
from pathlib import Path
import pytest

from core.gravitas.guard import (
    GravitasGuard,
    ScopeViolationError,
    ReadBeforeWriteViolationError,
    AntiRetryViolationError,
)


@pytest.fixture
def temp_workspace() -> Path:
    """Creates a temporary workspace directory for scope testing."""
    with tempfile.TemporaryDirectory() as td:
        yield Path(td).resolve()


@pytest.fixture
def guard(temp_workspace: Path) -> GravitasGuard:
    """Creates GravitasGuard bound to temp_workspace with max_duplicate_calls=3."""
    return GravitasGuard(workspace_root=temp_workspace, max_duplicate_calls=3)


def test_gravitas_confined_scope(guard: GravitasGuard, temp_workspace: Path) -> None:
    """Verifies that paths strictly within the workspace pass, and outside paths raise ScopeViolationError."""
    inside_file = temp_workspace / "core" / "engine.py"
    inside_nested = temp_workspace / "a" / "b" / "c" / "module.ts"

    # Inside workspace passes
    assert guard.check_scope(inside_file) is True
    assert guard.check_scope(inside_nested) is True
    assert guard.is_in_scope(inside_file) is True

    # Outside workspace fails with ScopeViolationError
    outside_dir = temp_workspace.parent / "unauthorized_sibling" / "secret.env"
    system_path = Path("C:/Windows/System32/drivers/etc/hosts") if Path("C:/Windows").exists() else Path("/etc/passwd")

    with pytest.raises((ScopeViolationError, PermissionError)):
        guard.check_scope(outside_dir)

    with pytest.raises((ScopeViolationError, PermissionError)):
        guard.check_scope(system_path)

    assert guard.is_in_scope(outside_dir) is False


def test_gravitas_read_before_write(guard: GravitasGuard, temp_workspace: Path) -> None:
    """Verifies that files cannot be written to until they have been inspected/read."""
    target_file = temp_workspace / "src" / "router.py"

    # Attempting to write before reading must raise ReadBeforeWriteViolationError
    with pytest.raises((ReadBeforeWriteViolationError, PermissionError)):
        guard.check_can_write(target_file)

    # Record read event
    guard.record_read(target_file)

    # Now write is authorized and returns True
    assert guard.check_can_write(target_file) is True


def test_gravitas_anti_retry_limit(guard: GravitasGuard) -> None:
    """Verifies that identical actions are permitted up to 3 times and throw on >3 calls."""
    action = "run_command: npm test --suite=core"

    # Calls 1, 2, and 3 should succeed
    assert guard.record_action(action) == 1
    assert guard.record_action(action) == 2
    assert guard.record_action(action) == 3

    # Call 4 (>3 duplicate calls) must raise AntiRetryViolationError
    with pytest.raises((AntiRetryViolationError, RuntimeError)) as exc_info:
        guard.record_action(action)

    assert "Anti-retry limit exceeded" in str(exc_info.value)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as td:
        ws = Path(td).resolve()
        g = GravitasGuard(workspace_root=ws, max_duplicate_calls=3)
        test_gravitas_confined_scope(g, ws)
        test_gravitas_read_before_write(g, ws)
        test_gravitas_anti_retry_limit(g)
        print("ALL GRAVITAS INVARIANT TESTS PASSED")

