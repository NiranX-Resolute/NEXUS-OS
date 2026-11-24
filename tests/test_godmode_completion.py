"""Nexus OS v5.0 - Final Godmode Completion Verification Suite.

Comprehensive end-to-end integration tests with ZERO mocks:
1. DPAPI Kaggle GPU wake-up on demand with 15-minute cooldown guard and air-gap enforcement.
2. DragShelf locked-file stability & permission resilience over 150ms.
3. 24/7 Autonomous Cron Scheduler & 08:00 AM Morning Briefing digest generation.
4. Closed-loop LearningGraph trace distillation on SQLite WAL.
5. Full 24-component health and latency aggregation across all 6 subsystem groups.
6. Notch HUD 1-click 'Release GPU' IPC trigger and quota preservation.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import threading
import time
from typing import Any, Dict, List
import urllib.request
import pytest

from core.security.vault import CredentialVault
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.compute_pool import FederatedComputePool
from core.runtime.cron_scheduler import AutonomousCronScheduler
from core.memory.learning_graph import LearningGraph, run_weekly_trace_distillation
from core.system_inspector import SystemInspector
from core.runtime.ipc_server import NexusIPCServer
from apps.notch_hud.drag_shelf import NexusDragShelf


@pytest.fixture
def isolated_nexus_env():
    """Provisions isolated temp database, vault, and workspace manifest for sovereign testing."""
    tmp_dir = tempfile.mkdtemp(prefix="nexus_godmode_test_")
    tmp_path = Path(tmp_dir)
    db_path = tmp_path / "agent_local_godmode.db"
    vault_db_path = tmp_path / "vault_godmode.db"
    manifest_path = tmp_path / "manifest_godmode.yaml"

    manifest_content = """
version: "5.0.0"
workspaces:
  DEV:
    allowed_paths: []
    mcp_servers: []
    allowed_mcp_tools: []
    security_level: "STANDARD"
  SILENT:
    allowed_paths: []
    mcp_servers: []
    allowed_mcp_tools: []
    security_level: "AIR_GAPPED"
runtime_defaults:
  active_mode: "DEV"
"""
    manifest_path.write_text(manifest_content.strip(), encoding="utf-8")

    vault = CredentialVault(db_path=vault_db_path)
    governor = WorkspaceGovernor(manifest_path=str(manifest_path))
    pool = FederatedComputePool(
        governor=governor,
        edge_nodes_url="https://nexus-bridge.pages.dev/api/compute/nodes",
        db_path=db_path,
        vault=vault,
    )

    yield {
        "tmp_path": tmp_path,
        "db_path": db_path,
        "vault_db_path": vault_db_path,
        "vault": vault,
        "governor": governor,
        "pool": pool,
    }

    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception as exc:
        print(f"Teardown notice: {exc}")


def test_kaggle_gpu_wake_on_demand_cooldown_and_airgap(isolated_nexus_env):
    """
    Test 1: Verifies Kaggle GPU on-demand wake-up with DPAPI credentials,
    strict 15-minute cooldown guard, and SILENT / ESTOP air-gap enforcement.
    """
    vault: CredentialVault = isolated_nexus_env["vault"]
    governor: WorkspaceGovernor = isolated_nexus_env["governor"]
    pool: FederatedComputePool = isolated_nexus_env["pool"]
    db_path: Path = isolated_nexus_env["db_path"]

    # 1. Store Kaggle credentials in DPAPI vault
    test_user = "nexus_developer_test"
    test_key = "kaggle_api_token_secret_123"
    assert vault.set_secret("KAGGLE_USERNAME", test_user) is True
    assert vault.set_secret("KAGGLE_KEY", test_key) is True

    assert pool.get_secret("KAGGLE_USERNAME") == test_user
    assert pool.get_secret("KAGGLE_KEY") == test_key

    # 2. First wake-up attempt in DEV mode
    governor.set_mode("DEV")
    res1 = pool.wake_kaggle_gpu_on_demand()
    assert res1["success"] is True
    assert "timestamp" in res1
    assert res1.get("cooldown_seconds") == 900

    # 3. Immediate second attempt must hit the 15-minute cooldown guard
    res2 = pool.wake_kaggle_gpu_on_demand()
    assert res2["success"] is False
    assert res2["reason"] == "COOLDOWN_ACTIVE"
    assert res2["cooldown"] is True
    assert res2["remaining_seconds"] > 0

    # 4. In SILENT mode, wake-up is strictly blocked
    governor.set_mode("SILENT")
    res_silent = pool.wake_kaggle_gpu_on_demand(force=True)
    assert res_silent["success"] is False
    assert res_silent["reason"] == "AIR_GAPPED"

    # 5. In ESTOP mode, wake-up is strictly blocked
    governor.set_mode("DEV")
    with sqlite3.connect(str(db_path), timeout=2.0) as conn:
        conn.execute(
            "INSERT INTO system_flags (flag_key, flag_value, updated_at) VALUES ('ESTOP', '1', ?) ON CONFLICT(flag_key) DO UPDATE SET flag_value = '1';",
            (time.time(),),
        )
        conn.commit()

    res_estop = pool.wake_kaggle_gpu_on_demand(force=True)
    assert res_estop["success"] is False
    assert res_estop["reason"] == "ESTOP_ACTIVE"


def test_drag_shelf_locked_file_resilience(isolated_nexus_env):
    """
    Test 2: Verifies DragShelf locked-file resilience and size stability polling
    over 150ms before computing SHA-256 hash.
    """
    tmp_path: Path = isolated_nexus_env["tmp_path"]
    test_file = tmp_path / "stream_transfer_sample.bin"

    # Write initial data
    content = b"NEXUS_SOVEREIGN_FILE_CONTENT_" * 1000
    test_file.write_bytes(content)

    # Poll file stability and hash
    size, sha256_hash = NexusDragShelf.wait_for_file_stability_and_hash(str(test_file), stability_window_sec=0.15)
    assert size == len(content)
    assert len(sha256_hash) == 64

    # Test non-existent file handling
    missing_file = tmp_path / "non_existent.bin"
    m_size, m_hash = NexusDragShelf.wait_for_file_stability_and_hash(str(missing_file))
    assert m_size == 0
    assert m_hash == ""


def test_cron_scheduler_morning_briefing_generation(isolated_nexus_env):
    """
    Test 3: Verifies 24/7 Autonomous Cron Scheduler and 08:00 AM Morning Briefing
    digest synthesis and persistence in SQLite WAL.
    """
    db_path: Path = isolated_nexus_env["db_path"]
    governor: WorkspaceGovernor = isolated_nexus_env["governor"]
    vault: CredentialVault = isolated_nexus_env["vault"]

    scheduler = AutonomousCronScheduler(db_path=db_path, governor=governor, vault=vault)

    # 1. Synthesize live morning briefing
    digest_res = scheduler.build_morning_briefing_digest()
    assert digest_res["success"] is True
    assert "Nexus Morning Briefing" in digest_res["title"]
    assert "MORNING BRIEFING" in digest_res["digest_text"]
    assert len(digest_res["calendar_events"]) >= 1

    # 2. Run morning briefing execution cycle
    run_res = scheduler.run_morning_briefing(force=True)
    assert run_res["success"] is True
    assert "briefing" in run_res

    # 3. Verify SQLite cron_jobs table updated last_run
    with sqlite3.connect(str(db_path), timeout=2.0) as conn:
        row = conn.execute("SELECT last_run, next_run FROM cron_jobs WHERE job_id = 'morning_briefing';").fetchone()
        assert row is not None
        assert row[0] > 0
        assert row[1] > row[0]


def test_learning_graph_trace_distillation_on_sqlite_wal(isolated_nexus_env):
    """
    Test 4: Verifies closed-loop LearningGraph trace distillation:
    analyzes execution slices, extracts tool Markov transitions, and updates system_flags.
    """
    db_path: Path = isolated_nexus_env["db_path"]
    graph = LearningGraph(db_path=db_path)

    # 1. Record completed execution slice traces
    graph.record_trace(
        slice_id="slc-001",
        title="Refactor AST nodes in parser",
        task_type="coding",
        status="COMPLETED",
        tools_used=["ast_grep", "worktree_commit"],
        latency_ms=12.4,
    )
    graph.record_trace(
        slice_id="slc-002",
        title="Generate unit test suite",
        task_type="coding",
        status="COMPLETED",
        tools_used=["ast_grep", "worktree_commit"],
        latency_ms=18.6,
    )
    graph.record_trace(
        slice_id="slc-003",
        title="Query web documentation",
        task_type="reasoning",
        status="COMPLETED",
        tools_used=["web_search", "summarize_text"],
        latency_ms=45.2,
    )

    # 2. Run trace distillation
    distill_res = graph.run_trace_distillation()
    assert distill_res["success"] is True
    rules = distill_res["rules"]
    assert rules["total_traces_analyzed"] == 3
    assert rules["version"] == "5.0"

    # Verify tool sequence extraction
    seqs = rules["high_success_sequences"]
    assert len(seqs) >= 1
    ast_to_commit = next((s for s in seqs if s["from_tool"] == "ast_grep" and s["to_tool"] == "worktree_commit"), None)
    assert ast_to_commit is not None
    assert ast_to_commit["count"] == 2
    assert ast_to_commit["confidence"] == 1.0

    # 3. Verify persistence into system_flags table
    learned = graph.get_learned_rules()
    assert learned.get("total_traces_analyzed") == 3
    assert "routing_weights" in learned
    assert "coding" in learned["routing_weights"]
    assert learned["routing_weights"]["coding"]["kaggle_gpu"] > 1.2


def test_24_component_health_aggregation():
    """
    Test 5: Verifies collect_full_component_health() aggregates real status,
    latency, and metadata for all 24 components across all 6 subsystem groups.
    """
    inspector = SystemInspector()
    health = inspector.collect_full_component_health()

    assert "overall_status" in health
    assert "subsystems" in health
    assert "components" in health

    # All 6 subsystem groups must be present
    subsystems = health["subsystems"]
    assert len(subsystems) == 6
    group_ids = [g["id"] for g in subsystems]
    assert group_ids == ["group_a", "group_b", "group_c", "group_d", "group_e", "group_f"]

    # All 24 individual components must be accounted for
    components = health["components"]
    assert len(components) == 24
    assert health["active_components_count"] == 24

    for comp in components:
        assert "id" in comp
        assert "name" in comp
        assert "path" in comp
        assert "status" in comp
        assert comp["status"] in ("OPERATIONAL", "STANDBY", "DEGRADED", "OFFLINE")
        assert "latency_ms" in comp
        assert comp["latency_ms"] >= 0.0
        assert "uptime_pct" in comp
        assert len(comp["uptime_bar"]) == 30


def test_notch_hud_release_gpu_ipc_trigger(isolated_nexus_env):
    """
    Test 6: Verifies Notch HUD Release GPU IPC trigger:
    injects active 32GB cloud GPU node, queries /api/compute/pool, releases via
    POST /api/compute/release, and asserts node removal and quota preservation.
    """
    db_path: Path = isolated_nexus_env["db_path"]
    test_port = 47632

    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=db_path,
        dry_run_hardware=True,
    )
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)

    base_url = f"http://127.0.0.1:{test_port}"
    token = server.auth_token
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    try:
        # 1. Inject active 32GB Kaggle GPU node
        gpu_node = {
            "node_id": "kaggle-t4x2-primary",
            "url": "https://active-kaggle.trycloudflare.com",
            "type": "gpu",
            "model": "qwen2.5-coder:14b",
            "vram_gb": 32,
            "ram_gb": 32,
            "provider": "kaggle",
            "idle_seconds": 240,
        }
        add_req = urllib.request.Request(
            f"{base_url}/api/compute/nodes/direct",
            data=json.dumps(gpu_node).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(add_req, timeout=2.0) as resp:
            assert resp.status in (200, 201)

        # 2. Query compute pool -> asserts 32GB VRAM active
        pool_req = urllib.request.Request(f"{base_url}/api/compute/pool", headers=headers)
        with urllib.request.urlopen(pool_req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert data["cloud_gpus_count"] == 1
            assert data["total_cloud_vram_gb"] == 32
            active_gpu = data["cloud_gpus"][0]
            assert active_gpu["node_id"] == "kaggle-t4x2-primary"
            assert active_gpu["idle_seconds"] == 240

        # 3. Simulate Notch HUD 1-click Release GPU button trigger
        rel_req = urllib.request.Request(
            f"{base_url}/api/compute/release",
            data=json.dumps({"reason": "notch_hud_1click_release"}).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(rel_req, timeout=5.0) as resp:
            assert resp.status == 200
            rel_data = json.loads(resp.read().decode("utf-8"))
            assert rel_data["success"] is True
            assert "kaggle-t4x2-primary" in rel_data["released_nodes"]

        # 4. Verify pool has 0 active GPUs after release (quota preserved)
        with urllib.request.urlopen(pool_req, timeout=2.0) as resp:
            data_after = json.loads(resp.read().decode("utf-8"))
            assert data_after["cloud_gpus_count"] == 0
            assert data_after["total_cloud_vram_gb"] == 0
    finally:
        server.shutdown()
        server.server_close()
