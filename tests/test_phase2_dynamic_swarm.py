"""Nexus OS v5.0 - Phase 2 Self-Multiplying Ephemeral Swarm & Mitosis Verification Suite.

ZERO-MOCK VERIFICATION GATE:
1. test_01_sync_ecc_archetypes_fts5:
   Syncs ~/.nexus-agent/vendor/ecc/agents, asserts >= 50 specialist archetypes imported into ecc_agent_archetypes,
   and verifies sub-15ms FTS5 search.
2. test_02_plan_and_spawn_swarm_and_tool_narrowing:
   Calls plan_and_spawn_swarm("Audit database SQL queries, benchmark API latency, and update architecture docs"),
   verifies >= 3 distinct ephemeral agents spawned with narrowed ScopeGuard tool masks in SQLite WAL.
3. test_03_recursive_mitosis_and_circuit_breakers:
   Calls multiply_agent creating depth=2 and depth=3 child agents, verifies child tools are strict subsets of
   parent tools, and confirms depth=4 or >16 concurrent agents raises SwarmCircuitBreakerError.
4. test_04_silent_mode_and_estop_containment:
   Verifies [SILENT] mode strips external network tools from tool masks, and asserting SafetyGuard.trigger_estop()
   blocks new spawns with EmergencyStopException.
5. test_05_dissolve_agent_instinct_and_ipc_endpoints:
   Tests POST /api/swarm/spawn, GET /api/swarm/active, POST /api/swarm/dissolve (verifying status == "DISSOLVED"
   and instinct extraction), and POST /api/swarm/kill on real IPC server.
"""

from __future__ import annotations

import gc
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Any, Dict, List
import urllib.request
import pytest

from core.agents.dynamic_spawner import (
    DynamicAgentSpawner,
    SwarmCircuitBreakerError,
    sync_ecc_archetypes,
    MAX_SWARM_DEPTH,
    MAX_CONCURRENT_AGENTS,
)
from core.runtime.workspaces import WorkspaceGovernor
from core.engine.safety_guard import SafetyGuard, EmergencyStopException
from core.runtime.ipc_server import NexusIPCServer


def _cleanup_temp_db(db_path: Path):
    """Safely cleans up temporary SQLite files handling Windows file lock delays."""
    gc.collect()
    time.sleep(0.05)
    for ext in ("", "-wal", "-shm"):
        f = Path(str(db_path) + ext)
        if f.exists():
            try:
                f.unlink(missing_ok=True)
            except Exception:
                time.sleep(0.01)


# =============================================================================
# 1. SYNC ECC ARCHETYPES & FTS5 RETRIEVAL TEST
# =============================================================================
def test_01_sync_ecc_archetypes_fts5():
    """Syncs ~/.nexus-agent/vendor/ecc/agents, asserts >= 50 archetypes imported, verifies <15ms FTS5 search."""
    vendor_ecc = Path.home() / ".nexus-agent" / "vendor" / "ecc" / "agents"
    assert vendor_ecc.exists(), f"ECC agents vendor dir missing: {vendor_ecc}"

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        # Sync archetypes into temp DB
        imported = sync_ecc_archetypes(vendor_dir=vendor_ecc, db_path=temp_db)
        assert imported >= 50, f"Expected >= 50 imported archetypes, got {imported}"

        # Connect and verify SQLite FTS5 table
        conn = sqlite3.connect(str(temp_db))
        conn.row_factory = sqlite3.Row
        try:
            # Verify count
            count_row = conn.execute("SELECT COUNT(*) AS c FROM ecc_agent_archetypes;").fetchone()
            assert count_row["c"] == imported

            # Measure FTS5 search latency
            t0 = time.perf_counter()
            cur = conn.execute(
                """
                SELECT a.slug, a.name, a.anchor_orbiter
                FROM ecc_agent_archetypes a
                JOIN ecc_agent_archetypes_fts fts ON a.slug = fts.slug
                WHERE ecc_agent_archetypes_fts MATCH 'security OR audit'
                LIMIT 10;
                """
            )
            rows = cur.fetchall()
            duration_ms = (time.perf_counter() - t0) * 1000.0

            assert len(rows) > 0, "Expected FTS5 query to find archetypes matching 'security OR audit'"
            assert duration_ms < 15.0, f"FTS5 query took {duration_ms:.2f}ms (expected < 15ms)"
            for r in rows:
                assert r["slug"]
                assert r["name"]
        finally:
            conn.close()
    finally:
        _cleanup_temp_db(temp_db)


# =============================================================================
# 2. PLAN AND SPAWN SWARM & TOOL NARROWING TEST
# =============================================================================
def test_02_plan_and_spawn_swarm_and_tool_narrowing():
    """Calls plan_and_spawn_swarm, verifies >= 3 distinct ephemeral agents spawned with narrowed ScopeGuard tool masks."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    spawner = DynamicAgentSpawner(db_path=temp_db)
    try:
        user_goal = "Audit database SQL queries, benchmark API latency, and update architecture docs"
        res = spawner.plan_and_spawn_swarm(user_goal=user_goal, workspace_mode="DEV")

        assert res["success"] is True
        agents = res["spawned_agents"]
        assert len(agents) >= 3, f"Expected >= 3 agents spawned, got {len(agents)}"

        # Verify distinct anchor orbiters
        anchors = set(a["anchor_orbiter"] for a in agents)
        assert len(anchors) >= 3, f"Expected >= 3 distinct anchors, got {anchors}"

        # Verify tool masks match ScopeGuard domain allowlists
        for a in agents:
            assert len(a["allowed_tools"]) > 0
            if a["anchor_orbiter"] == "SEC-01":
                assert any(t in a["allowed_tools"] for t in ("agent_shield", "scope_guard", "audit_logger"))
            elif a["anchor_orbiter"] == "SYS-01":
                assert any(t in a["allowed_tools"] for t in ("system_telemetry", "win32_reflex", "hardware_meter"))
            elif a["anchor_orbiter"] == "DEV-01":
                assert any(t in a["allowed_tools"] for t in ("filesystem", "git", "python_repl", "test_runner"))

        # Verify persisted rows in SQLite WAL
        conn = sqlite3.connect(str(temp_db))
        conn.row_factory = sqlite3.Row
        try:
            cur = conn.execute("SELECT agent_id, anchor_orbiter, depth, status FROM ephemeral_agents;")
            db_agents = cur.fetchall()
            assert len(db_agents) == len(agents)
            for dba in db_agents:
                assert dba["status"] == "ACTIVE"
                assert dba["depth"] == 1
        finally:
            conn.close()
    finally:
        spawner.close()
        _cleanup_temp_db(temp_db)


# =============================================================================
# 3. RECURSIVE MITOSIS & CIRCUIT BREAKERS TEST
# =============================================================================
def test_03_recursive_mitosis_and_circuit_breakers():
    """Calls multiply_agent creating depth=2 and depth=3 child agents, verifies tool subsetting, and circuit breaker caps."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    spawner = DynamicAgentSpawner(db_path=temp_db)
    try:
        res = spawner.plan_and_spawn_swarm("Build high-performance database indexing module", workspace_mode="DEV")
        assert res["success"] is True
        parent_agent = res["spawned_agents"][0]
        parent_id = parent_agent["agent_id"]
        parent_tools = set(parent_agent["allowed_tools"])

        # Mitosis Step 1: Depth 1 -> Depth 2
        children_d2 = spawner.multiply_agent(parent_id, ["Generate B-tree indexing kernel", "Add unit tests"])
        assert len(children_d2) == 2
        for child in children_d2:
            assert child["depth"] == 2
            assert child["parent_id"] == parent_id
            # Child tools must be strict subset of parent tools
            assert set(child["allowed_tools"]).issubset(parent_tools)

        # Mitosis Step 2: Depth 2 -> Depth 3
        child_d2_id = children_d2[0]["agent_id"]
        children_d3 = spawner.multiply_agent(child_d2_id, ["Subtask A", "Subtask B"])
        assert len(children_d3) == 2
        for child in children_d3:
            assert child["depth"] == 3
            assert child["parent_id"] == child_d2_id

        # Mitosis Step 3: Depth 3 -> Depth 4 MUST raise SwarmCircuitBreakerError
        child_d3_id = children_d3[0]["agent_id"]
        with pytest.raises(SwarmCircuitBreakerError) as exc_info:
            spawner.multiply_agent(child_d3_id, ["Attempting depth 4"])
        assert "exceeds MAX_SWARM_DEPTH" in str(exc_info.value)

        # Concurrency Cap Breaker: Spawning more than 16 concurrent agents MUST raise SwarmCircuitBreakerError
        excess_tasks = [f"Excess subtask #{i}" for i in range(MAX_CONCURRENT_AGENTS + 1)]
        with pytest.raises(SwarmCircuitBreakerError) as exc_concurrency:
            spawner.multiply_agent(parent_id, excess_tasks)
        assert "MAX_CONCURRENT_AGENTS" in str(exc_concurrency.value)
    finally:
        spawner.close()
        _cleanup_temp_db(temp_db)


# =============================================================================
# 4. SILENT MODE & E-STOP CONTAINMENT TEST
# =============================================================================
def test_04_silent_mode_and_estop_containment():
    """Verifies [SILENT] mode strips external network tools, and SafetyGuard.trigger_estop() blocks new spawns."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    gov = WorkspaceGovernor()
    gov.set_mode("SILENT")
    spawner = DynamicAgentSpawner(db_path=temp_db, governor=gov)

    try:
        # Spawn in SILENT mode
        res = spawner.plan_and_spawn_swarm("Scout research papers and benchmark latency", workspace_mode="SILENT")
        assert res["success"] is True

        forbidden_network_tools = {"web_search", "fetch_doc", "http_request", "cloud_gpu", "external_api"}
        for ag in res["spawned_agents"]:
            for tool in ag["allowed_tools"]:
                assert tool not in forbidden_network_tools, f"Forbidden tool '{tool}' found in SILENT mode agent!"

        # Trigger E-STOP
        SafetyGuard.trigger_estop("Test Swarm Emergency Stop")
        assert SafetyGuard.is_estop_active() is True

        # Assert spawn raises EmergencyStopException
        with pytest.raises(EmergencyStopException):
            spawner.plan_and_spawn_swarm("Attempted spawn during E-STOP")

        # Assert multiply raises EmergencyStopException
        with pytest.raises(EmergencyStopException):
            spawner.multiply_agent(res["spawned_agents"][0]["agent_id"], ["Subtask under E-STOP"])

        # Reset E-STOP
        SafetyGuard.reset_estop()
        assert SafetyGuard.is_estop_active() is False

        # Spawning works again after reset
        res_post = spawner.plan_and_spawn_swarm("Resume safe operations", workspace_mode="SILENT")
        assert res_post["success"] is True
    finally:
        spawner.close()
        gov.set_mode("DEV")
        SafetyGuard.reset_estop()
        _cleanup_temp_db(temp_db)


# =============================================================================
# 5. DISSOLVE AGENT, INSTINCT EXTRACTION & IPC ENDPOINTS TEST
# =============================================================================
def test_05_dissolve_agent_instinct_and_ipc_endpoints():
    """Tests dissolve_agent, instinct extraction, and IPC /api/swarm/* REST endpoints on live server."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    # 1. Test dissolve_agent and instinct extraction
    spawner = DynamicAgentSpawner(db_path=temp_db)
    try:
        res = spawner.plan_and_spawn_swarm("Fix database deadlock under high concurrency", workspace_mode="DEV")
        agent_id = res["spawned_agents"][0]["agent_id"]

        dissolve_res = spawner.dissolve_agent(
            agent_id=agent_id,
            result_summary="Resolved deadlock by acquiring row locks in canonical primary key order.",
            verified_workflow=True,
        )
        assert dissolve_res["success"] is True
        assert dissolve_res["status"] == "DISSOLVED"

        # Verify DB status
        conn = sqlite3.connect(str(temp_db))
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute("SELECT status, result_summary FROM ephemeral_agents WHERE agent_id = ?;", (agent_id,)).fetchone()
            assert row["status"] == "DISSOLVED"
            assert "canonical primary key order" in row["result_summary"]

            # Verify instinct stored in learned_instincts
            instinct_row = conn.execute(
                "SELECT instinct_rule, trigger_pattern FROM learned_instincts WHERE source_slice_id = ?;",
                (agent_id,)
            ).fetchone()
            assert instinct_row is not None
            assert "canonical primary key order" in instinct_row["instinct_rule"]
        finally:
            conn.close()
    finally:
        spawner.close()

    # 2. Test live IPC endpoints on ephemeral port
    ipc_server = NexusIPCServer(host="127.0.0.1", port=0, db_path=temp_db, dry_run_hardware=True)
    server_port = ipc_server.server_address[1]
    server_thread = threading.Thread(target=ipc_server.serve_forever, daemon=True)
    server_thread.start()

    auth_token = ipc_server.auth_token
    base_url = f"http://127.0.0.1:{server_port}"
    headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    try:
        # POST /api/swarm/spawn
        spawn_payload = json.dumps({"goal": "Audit application security and win32 processes", "workspace_mode": "DEV"}).encode("utf-8")
        req = urllib.request.Request(f"{base_url}/api/swarm/spawn", data=spawn_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            spawn_data = json.loads(resp.read().decode("utf-8"))
            assert spawn_data["success"] is True
            assert len(spawn_data["agents"]) >= 2
            target_agent = spawn_data["agents"][0]
            target_agent_id = target_agent["agent_id"]

        # GET /api/swarm/active
        req_active = urllib.request.Request(f"{base_url}/api/swarm/active", headers=headers, method="GET")
        with urllib.request.urlopen(req_active, timeout=5.0) as resp:
            assert resp.status == 200
            active_data = json.loads(resp.read().decode("utf-8"))
            assert active_data["success"] is True
            assert active_data["active_count"] >= 2
            agent_ids = [a["agent_id"] for a in active_data["agents"]]
            assert target_agent_id in agent_ids

        # POST /api/swarm/dissolve
        dissolve_payload = json.dumps({
            "agent_id": target_agent_id,
            "result_summary": "Security boundaries audited cleanly",
            "verified_workflow": True
        }).encode("utf-8")
        req_dissolve = urllib.request.Request(f"{base_url}/api/swarm/dissolve", data=dissolve_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req_dissolve, timeout=5.0) as resp:
            assert resp.status == 200
            dissolve_data = json.loads(resp.read().decode("utf-8"))
            assert dissolve_data["success"] is True
            assert dissolve_data["status"] == "DISSOLVED"

        # POST /api/swarm/kill (Kill remaining agent)
        remaining_id = spawn_data["agents"][1]["agent_id"]
        kill_payload = json.dumps({"agent_id": remaining_id}).encode("utf-8")
        req_kill = urllib.request.Request(f"{base_url}/api/swarm/kill", data=kill_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req_kill, timeout=5.0) as resp:
            assert resp.status == 200
            kill_data = json.loads(resp.read().decode("utf-8"))
            assert kill_data["success"] is True
            assert kill_data["status"] == "ABORTED"
    finally:
        ipc_server.shutdown()
        ipc_server.server_close()
        _cleanup_temp_db(temp_db)
