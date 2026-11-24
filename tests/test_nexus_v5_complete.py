"""
Nexus OS v5.0 - Master Integration & Verification Test Suite
=============================================================================
Verifies complete operational readiness of NEXUS OS v5.0:
1. test_sqlite_wal_initialization(): assert ~/.nexus-agent/db/agent_local.db exists and PRAGMA journal_mode is 'wal'.
2. test_reflex_router_sub50ms(): ReflexRouter().dispatch('lock workstation') == 'REFLEX EXECUTED DIRECTLY', unknown returns None.
3. test_scope_guard_invariants(): assert ScopeGuardException raised on 'rm -rf / --no-preserve-root'.
4. test_mcp_plugin_loader(): assert REGISTERED_TOOLS is populated.
=============================================================================
"""

import os
import sqlite3
import sys
import time
from pathlib import Path
import pytest

# Ensure offline test execution for plugin dependency installations
os.environ["NEXUS_SKIP_DEP_INSTALL"] = "1"

# Ensure repo root and core are on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.runtime.reflex_router import ReflexRouter
from core.runtime.scope_guard import (
    ScopeGuard,
    ScopeGuardException,
    assert_safe_command,
    SOVEREIGN_INVARIANTS,
    NO_SYSTEM32_MODIFICATION,
    NO_RAW_CREDENTIAL_EXPOSURE,
    NO_UNAUTHORIZED_NETWORK_LISTENERS,
    NO_DESTRUCTIVE_FORCE_REBOOT,
    NO_DPAPI_VAULT_DUMP,
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
)
from core.mcp.plugin_loader import (
    REGISTERED_TOOLS,
    REGISTERED_NEXUS_TOOLS,
    load_all_plugins,
    get_registered_tools,
)


def test_sqlite_wal_initialization() -> None:
    """
    Verifies that the local SQLite database exists at ~/.nexus-agent/db/agent_local.db
    and is configured in Write-Ahead Logging (WAL) journal mode.
    """
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    assert db_path.exists(), f"NEXUS local SQLite database not found at {db_path}"

    conn = sqlite3.connect(str(db_path), timeout=5.0)
    try:
        cursor = conn.cursor()
        mode_row = cursor.execute("PRAGMA journal_mode;").fetchone()
        assert mode_row is not None, "PRAGMA journal_mode returned empty row"
        journal_mode = mode_row[0].lower()
        assert journal_mode == "wal", f"Expected PRAGMA journal_mode='wal', got '{journal_mode}'"
    finally:
        conn.close()


def test_reflex_router_sub50ms() -> None:
    """
    Verifies ReflexRouter sub-50ms deterministic command dispatch:
    - ReflexRouter(dry_run=True).dispatch('lock workstation') == 'REFLEX EXECUTED DIRECTLY'
    - Execution latency strictly under 50 milliseconds
    - Unknown or non-reflex utterance returns None for LLM fallback
    """
    router = ReflexRouter(dry_run=True)

    # Measure dispatch latency
    start_t = time.perf_counter()
    result = router.dispatch("lock workstation")
    elapsed_ms = (time.perf_counter() - start_t) * 1000.0

    assert result == "REFLEX EXECUTED DIRECTLY", f"Expected 'REFLEX EXECUTED DIRECTLY', got {result!r}"
    assert elapsed_ms < 50.0, f"Reflex dispatch latency ({elapsed_ms:.2f}ms) exceeded 50ms threshold"

    # Unknown commands must cleanly return None to trigger LLM intent planner fallback
    unknown_result = router.dispatch("calculate quantum mechanical wave equation for hydrogen")
    assert unknown_result is None, f"Expected None for unknown utterance, got {unknown_result!r}"

    # Verify unknown utterance returns None
    assert router.dispatch("unknown command") is None


def test_scope_guard_invariants() -> None:
    """
    Verifies the 6 Sovereign Invariants of ScopeGuard:
    - ScopeGuardException is raised when attempting 'rm -rf / --no-preserve-root'
    - Sovereign Invariant catalog is fully registered and active
    - Safe non-destructive commands pass through without raising
    """
    guard = ScopeGuard()

    # 1. Assert ScopeGuardException raised on forbidden destructive command
    with pytest.raises(ScopeGuardException) as exc_info:
        guard.assert_safe_command("rm -rf / --no-preserve-root")

    assert NO_SYSTEM32_MODIFICATION in str(exc_info.value) or "rm" in str(exc_info.value).lower()

    # Standalone module-level helper check
    with pytest.raises(ScopeGuardException):
        assert_safe_command("rm -rf / --no-preserve-root")

    # 2. Verify all 6 Sovereign Invariants are tracked and secure
    status = guard.get_invariants_status()
    expected_invariants = {
        NO_SYSTEM32_MODIFICATION,
        NO_RAW_CREDENTIAL_EXPOSURE,
        NO_UNAUTHORIZED_NETWORK_LISTENERS,
        NO_DESTRUCTIVE_FORCE_REBOOT,
        NO_DPAPI_VAULT_DUMP,
        REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
    }
    assert expected_invariants.issubset(set(status.keys())), f"Missing invariants: {expected_invariants - set(status.keys())}"
    for inv_name, inv_data in status.items():
        assert inv_data["status"] == "SECURE"
        assert inv_data["enforced"] is True

    # 3. Assert safe benign commands do not raise
    guard.assert_safe_command("git status")
    guard.assert_safe_command("python -m pytest tests/")
    guard.assert_safe_command("echo Hello NEXUS OS v5.0")


def test_mcp_plugin_loader() -> None:
    """
    Verifies Dynamic MCP Plugin Loader & Injector:
    - load_all_plugins() scans core/mcp/plugins/ and populates REGISTERED_TOOLS
    - REGISTERED_TOOLS is populated with native tools
    - REGISTERED_NEXUS_TOOLS compatibility alias is synchronized
    """
    loaded_tools = load_all_plugins()

    # Assert REGISTERED_TOOLS is populated
    assert bool(REGISTERED_TOOLS), "REGISTERED_TOOLS must be populated with loaded MCP tools"
    assert len(REGISTERED_TOOLS) >= 15, f"Expected at least 15 native tools, found {len(REGISTERED_TOOLS)}"
    assert REGISTERED_TOOLS is REGISTERED_NEXUS_TOOLS, "REGISTERED_NEXUS_TOOLS must alias REGISTERED_TOOLS"

    # Verify key native tools and their security metadata
    assert "android_adb_control" in REGISTERED_TOOLS or "android_status" in REGISTERED_TOOLS
    assert "bill_to_reminder_scan" in REGISTERED_TOOLS
    assert "desktop_tidier" in REGISTERED_TOOLS
    assert "excel_expense_writer" in REGISTERED_TOOLS
    assert "smart_light_control" in REGISTERED_TOOLS
    assert "subscription_radar" in REGISTERED_TOOLS

    # Verify get_registered_tools API
    all_meta = get_registered_tools()
    assert len(all_meta) == len(REGISTERED_TOOLS)
    for tool_meta in all_meta:
        assert "name" in tool_meta
        assert "description" in tool_meta
        assert "agent" in tool_meta
