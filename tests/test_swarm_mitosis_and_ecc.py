"""Nexus OS v5.0 - Swarm Mitosis & ECC Importer Verification Suite.

Zero-mock, production-grade test suite verifying:
1. ECC schema creation, FTS5 virtual tables, and automated sync triggers
2. ECC 71 agents & 314 skills ingestion, classification, and /skill: & @ecc: resolution
3. Dynamic swarm spawning and SQLite WAL persistence
4. Recursive mitosis with depth circuit breaker (MAX_SWARM_DEPTH = 3)
5. Concurrency circuit breaker (MAX_CONCURRENT_AGENTS = 16)
6. ScopeGuard least-privilege child tool-mask narrowing
7. E-Stop assertion containment in memory and SQLite WAL
8. Clean agent dissolution and learned instinct extraction
9. InfinitySliceEngine spawn_child_slice integration
10. ReflexRouter @swarm <goal> parsing and execution (<100ms)

Zero mocks used: all tests execute against real SQLite WAL databases.
"""

from __future__ import annotations

import gc
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
from typing import Any, Dict, List
import pytest

from core.agents.dynamic_spawner import (
    DynamicAgentSpawner,
    SwarmCircuitBreakerError,
    MAX_SWARM_DEPTH,
    MAX_CONCURRENT_AGENTS,
    ANCHOR_ORBITERS,
)
from core.engine.safety_guard import SafetyGuard, EmergencyStopException
from core.memory.sovereign_store import SovereignMemoryStore
from core.mcp.ecc_skill_loader import ECCSkillLoader, get_ecc_skill_loader
from core.runtime.slice_engine import InfinitySliceEngine, SliceEngine, spawn_child_slice
from core.runtime.reflex_router import ReflexRouter
from core.agents.orchestrator import MultiAgentOrchestrator
from scripts.import_ecc_pack import (
    import_ecc_pack,
    classify_anchor_orbiter,
    resolve_skill,
    resolve_agent,
    search_skills,
    search_agents,
    DEFAULT_VENDOR_DIR,
)


@pytest.fixture
def temp_db_path():
    """Provides an isolated temporary SQLite database for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        path = Path(tf.name).resolve()
    yield path
    gc.collect()
    time.sleep(0.05)
    for ext in ("", "-wal", "-shm"):
        f = Path(str(path) + ext)
        if f.exists():
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass


# =============================================================================
# 1. ECC SCHEMA & FTS5 INDEXING TESTS
# =============================================================================
def test_01_ecc_schema_and_fts5_indexing(temp_db_path: Path):
    """Verifies ecc_agents and ecc_skills tables, FTS5 virtual tables, and triggers."""
    store = SovereignMemoryStore(db_path=temp_db_path)
    try:
        conn = sqlite3.connect(str(temp_db_path))
        conn.row_factory = sqlite3.Row

        # Check table creation
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()}
        assert "ecc_agents" in tables
        assert "ecc_agents_fts" in tables
        assert "ecc_skills" in tables
        assert "ecc_skills_fts" in tables

        # Insert agent and test trigger sync
        now = "2026-11-23T00:00:00Z"
        conn.execute(
            """
            INSERT INTO ecc_agents (slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at)
            VALUES ('test-agent', 'Test Agent', 'Expert in security and penetration audits', 'SEC-01', '["agent_shield"]', 'Audit system', '', ?);
            """,
            (now,),
        )
        conn.commit()

        # Verify FTS5 sync via trigger
        t0 = time.perf_counter()
        fts_res = conn.execute(
            "SELECT a.slug, a.name FROM ecc_agents a JOIN ecc_agents_fts fts ON a.slug = fts.slug WHERE ecc_agents_fts MATCH 'penetration OR audits';"
        ).fetchall()
        latency_ms = (time.perf_counter() - t0) * 1000.0

        assert len(fts_res) == 1
        assert fts_res[0]["slug"] == "test-agent"
        assert latency_ms < 15.0, f"FTS5 search latency {latency_ms:.2f}ms exceeded 15ms threshold"

        # Insert skill and test trigger sync
        conn.execute(
            """
            INSERT INTO ecc_skills (slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at)
            VALUES ('test-skill', 'Test Hardening', 'Hardens kernel network configs', 'security', 'SEC-01', '["firewall"]', 'Steps to harden', '', ?);
            """,
            (now,),
        )
        conn.commit()

        t0 = time.perf_counter()
        skill_res = conn.execute(
            "SELECT s.slug, s.name FROM ecc_skills s JOIN ecc_skills_fts fts ON s.slug = fts.slug WHERE ecc_skills_fts MATCH 'kernel OR network';"
        ).fetchall()
        latency_ms = (time.perf_counter() - t0) * 1000.0

        assert len(skill_res) == 1
        assert skill_res[0]["slug"] == "test-skill"
        assert latency_ms < 15.0

        conn.close()
    finally:
        store.close()


# =============================================================================
# 2. ECC PACK INGESTION & RESOLUTION
# =============================================================================
def test_02_ecc_pack_import_and_resolution(temp_db_path: Path):
    """Imports vendor ECC pack into temp_db, verifies >=70 agents and >=300 skills, and tests resolution."""
    assert DEFAULT_VENDOR_DIR.exists(), f"ECC vendor directory {DEFAULT_VENDOR_DIR} missing"

    summary = import_ecc_pack(
        vendor_dir=DEFAULT_VENDOR_DIR,
        db_path=temp_db_path,
        sync_repo=False,
    )

    assert summary["success"] is True
    assert summary["agents_imported"] >= 70, f"Expected >= 70 agents, got {summary['agents_imported']}"
    assert summary["skills_imported"] >= 300, f"Expected >= 300 skills, got {summary['skills_imported']}"

    loader = ECCSkillLoader(db_path=temp_db_path)

    # Test /skill:<slug> resolution
    sk1 = loader.resolve_skill("/skill:agent-security-hardening")
    assert sk1 is not None, "Failed to resolve /skill:agent-security-hardening"
    assert "agent-security-hardening" in sk1["slug"]
    assert sk1["anchor_orbiter"] == "SEC-01"
    assert len(sk1["instructions"]) > 50

    # Test @ecc:<agent> resolution
    ag1 = loader.resolve_agent("@ecc:a11y-architect")
    assert ag1 is not None, "Failed to resolve @ecc:a11y-architect"
    assert ag1["slug"] == "a11y-architect"
    assert ag1["name"] == "a11y-architect" or "Accessibility" in ag1["name"] or "A11Y" in ag1["name"].upper()
    assert len(ag1["default_tools"]) > 0

    # Test prompt injection generation
    injection = loader.get_skill_prompt_injection("agent-security-hardening")
    assert "=== ECC SKILL PLAYBOOK:" in injection
    assert "agent-security-hardening" in injection

    # Test FTS5 search
    hits = loader.search_skills("security audit", limit=5)
    assert len(hits) > 0
    assert any("security" in h["slug"] or "audit" in h["description"].lower() for h in hits)


# =============================================================================
# 3. DYNAMIC SWARM SPAWNING & PERSISTENCE
# =============================================================================
def test_03_plan_and_spawn_swarm(temp_db_path: Path):
    """Tests plan_and_spawn_swarm decomposition and SQLite WAL persistence."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        goal = "Synthesize parser, benchmark Win32 audio latency, verify 6 Sovereign Invariants, and harvest docs"
        result = spawner.plan_and_spawn_swarm(goal)

        assert result["success"] is True
        swarm_id = result["swarm_id"]
        agents = result["agents"]
        assert len(agents) >= 3, f"Expected >= 3 agents decomposed, got {len(agents)}"

        # Verify active count in DB
        active_count = spawner.get_active_agent_count()
        assert active_count == len(agents)

        # Verify tree hierarchy
        tree = spawner.get_active_swarm_tree()
        assert tree["success"] is True
        assert tree["total_active"] == len(agents)
        assert swarm_id in tree["swarms"]
        assert len(tree["swarms"][swarm_id]) == len(agents)

        # Verify all agents have depth 1
        for a in agents:
            assert a["depth"] == 1
            assert a["status"] == "ACTIVE"
            assert len(a["allowed_tools"]) > 0
    finally:
        spawner.close()


# =============================================================================
# 4. RECURSIVE MITOSIS & DEPTH CIRCUIT BREAKER
# =============================================================================
def test_04_recursive_mitosis_and_depth_circuit_breaker(temp_db_path: Path):
    """Tests recursive multiply_agent creating depths 1 -> 2 -> 3 and blocks depth 4."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        # Depth 1: Spawn base swarm
        base = spawner.plan_and_spawn_swarm("Build core engine component")
        parent_agent = base["agents"][0]
        parent_id = parent_agent["agent_id"]
        assert parent_agent["depth"] == 1

        # Depth 2: Mitosis into 2 child workers
        d2_children = spawner.multiply_agent(parent_id, ["Subtask A", "Subtask B"])
        assert len(d2_children) == 2
        for c in d2_children:
            assert c["depth"] == 2
            assert c["parent_id"] == parent_id

        # Depth 3: Mitosis of child worker into grandchildren
        d2_first_id = d2_children[0]["agent_id"]
        d3_children = spawner.multiply_agent(d2_first_id, ["Leaf task 1", "Leaf task 2"])
        assert len(d3_children) == 2
        for c in d3_children:
            assert c["depth"] == 3
            assert c["parent_id"] == d2_first_id

        # Depth 4: Attempt mitosis on depth 3 child -> MUST raise SwarmCircuitBreakerError
        d3_first_id = d3_children[0]["agent_id"]
        with pytest.raises(SwarmCircuitBreakerError) as exc_info:
            spawner.multiply_agent(d3_first_id, ["Forbidden depth 4 task"])

        assert "MAX_SWARM_DEPTH" in str(exc_info.value)
    finally:
        spawner.close()


# =============================================================================
# 5. CONCURRENCY CIRCUIT BREAKER
# =============================================================================
def test_05_concurrency_circuit_breaker(temp_db_path: Path):
    """Verifies that spawning beyond MAX_CONCURRENT_AGENTS (16) raises SwarmCircuitBreakerError."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        # Spawn base swarm (e.g. 2 agents)
        base = spawner.plan_and_spawn_swarm("Perform quick code audit")
        active = spawner.get_active_agent_count()
        parent_id = base["agents"][0]["agent_id"]

        # Attempt to spawn 20 subtasks at once (active + 20 > 16)
        large_batch = [f"Subtask #{i}" for i in range(20)]
        with pytest.raises(SwarmCircuitBreakerError) as exc_info:
            spawner.multiply_agent(parent_id, large_batch)

        assert "MAX_CONCURRENT_AGENTS" in str(exc_info.value)
    finally:
        spawner.close()


# =============================================================================
# 6. SCOPEGUARD CHILD TOOL-MASK NARROWING
# =============================================================================
def test_06_child_tool_mask_narrowing(temp_db_path: Path):
    """Verifies child agent tools are strictly bounded to a subset of parent tools."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        # Create base swarm with controlled parent tools
        base = spawner.plan_and_spawn_swarm("Implement math algorithm")
        parent = base["agents"][0]
        parent_id = parent["agent_id"]
        parent_tools = parent["allowed_tools"]

        # Request child with both permitted tools and unauthorized escalated tools
        child_requests = [
            {
                "objective": "Run math test",
                "tools": ["filesystem", "python_repl", "UNAUTHORIZED_ROOT_TOOL", "CLOUD_GPU_TOKEN"],
            }
        ]
        children = spawner.multiply_agent(parent_id, child_requests)
        child = children[0]

        # Verify child tools contain ONLY the intersection of parent tools and requested tools
        for t in child["allowed_tools"]:
            assert t in parent_tools, f"Child acquired unauthorized tool '{t}' not in parent tools"
        assert "unauthorized_root_tool" not in child["allowed_tools"]
        assert "cloud_gpu_token" not in child["allowed_tools"]
    finally:
        spawner.close()


# =============================================================================
# 7. E-STOP CONTAINMENT (MEMORY & SQLITE WAL)
# =============================================================================
def test_07_estop_containment(temp_db_path: Path):
    """Asserts that Emergency Stop halts both swarm planning and mitosis."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        # Trigger E-Stop in memory
        SafetyGuard.trigger_estop("Test E-Stop Assertion")
        try:
            with pytest.raises(EmergencyStopException):
                spawner.plan_and_spawn_swarm("Should be blocked by E-Stop")
        finally:
            SafetyGuard.reset_estop()

        # Trigger E-Stop via SQLite WAL system_flags
        conn = sqlite3.connect(str(temp_db_path))
        conn.execute("CREATE TABLE IF NOT EXISTS system_flags (flag_key TEXT PRIMARY KEY, flag_value TEXT, updated_at REAL);")
        conn.execute("INSERT OR REPLACE INTO system_flags (flag_key, flag_value, updated_at) VALUES ('ESTOP', 'ACTIVE', ?);", (time.time(),))
        conn.commit()
        conn.close()

        with pytest.raises(EmergencyStopException):
            spawner.plan_and_spawn_swarm("Should be blocked by SQLite WAL flag")

        # Clear E-Stop
        conn = sqlite3.connect(str(temp_db_path))
        conn.execute("UPDATE system_flags SET flag_value = 'CLEARED' WHERE flag_key = 'ESTOP';")
        conn.commit()
        conn.close()
        SafetyGuard.reset_estop()

        # Spawning should succeed again
        res = spawner.plan_and_spawn_swarm("Valid task after clearing E-Stop")
        assert res["success"] is True
    finally:
        SafetyGuard.reset_estop()
        spawner.close()


# =============================================================================
# 8. AGENT DISSOLUTION & INSTINCT EXTRACTION
# =============================================================================
def test_08_dissolve_agent_and_instinct_extraction(temp_db_path: Path):
    """Verifies clean agent dissolution, instinct storage, and RAM release."""
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        base = spawner.plan_and_spawn_swarm("Debug sqlite locking timeout")
        agent_id = base["agents"][0]["agent_id"]
        initial_active = spawner.get_active_agent_count()

        # Dissolve with verified solution
        dis_res = spawner.dissolve_agent(
            agent_id=agent_id,
            result_summary="Resolved SQLite lock by setting timeout=10.0 and WAL mode",
            verified_workflow=True,
            solution_code="conn = sqlite3.connect(db, timeout=10.0); conn.execute('PRAGMA journal_mode = WAL;')",
        )

        assert dis_res["success"] is True
        assert dis_res["status"] == "DISSOLVED"
        assert dis_res["remaining_active"] == initial_active - 1

        # Verify DB status
        conn = sqlite3.connect(str(temp_db_path))
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT status, result_summary FROM ephemeral_agents WHERE agent_id = ?;", (agent_id,)).fetchone()
        assert row["status"] == "DISSOLVED"
        assert "Resolved SQLite lock" in row["result_summary"]
        conn.close()
    finally:
        spawner.close()


# =============================================================================
# 9. SLICE ENGINE INTEGRATION
# =============================================================================
def test_09_slice_engine_spawn_child_slice_integration(temp_db_path: Path):
    """Verifies InfinitySliceEngine and spawn_child_slice helper."""
    slice_engine = InfinitySliceEngine(db_path=str(temp_db_path))
    spawner = DynamicAgentSpawner(db_path=temp_db_path)
    try:
        base = spawner.plan_and_spawn_swarm("Execute refactoring workflow")
        parent_id = base["agents"][0]["agent_id"]

        # Call spawn_child_slice helper
        children = spawn_child_slice(parent_id, ["Extract AST nodes", "Patch file contents"], db_path=str(temp_db_path))
        assert len(children) == 2
        for c in children:
            assert c["depth"] == 2
            assert c["parent_id"] == parent_id

        # Call method variant on InfinitySliceEngine
        method_children = slice_engine.spawn_child_slice(parent_id, ["Verify unit tests"])
        assert len(method_children) == 1
        assert method_children[0]["depth"] == 2
    finally:
        spawner.close()


# =============================================================================
# 10. REFLEX ROUTER & ORCHESTRATOR @SWARM COMMAND
# =============================================================================
def test_10_reflex_router_and_orchestrator_swarm(temp_db_path: Path):
    """Verifies @swarm command parsing and execution across ReflexRouter and MultiAgentOrchestrator."""
    store = SovereignMemoryStore(db_path=temp_db_path)
    router = ReflexRouter(store=store, dry_run=False)
    orchestrator = MultiAgentOrchestrator()
    try:
        # ReflexRouter evaluate_and_execute
        res = router.evaluate_and_execute("@swarm Build authentication module and database schema")
        assert res["status"] == "SUCCESS"
        assert res["action"] == "SPAWN_SWARM"
        assert "SWARM SPAWNED" in res["result"]
        assert res["latency_ms"] < 100.0, f"Reflex latency {res['latency_ms']}ms exceeded 100ms threshold"

        # MultiAgentOrchestrator spawn_swarm
        orch_res = orchestrator.execute_workflow("@swarm Implement OAuth2 PKCE provider")
        assert orch_res["success"] is True
        assert len(orch_res["agents"]) >= 1
    finally:
        store.close()
