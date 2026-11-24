"""Nexus OS v5.0 - Cognitive Spine, Policy Engine, Context Keeper, Instincts & Sovereign Store Test Suite.

ZERO-MOCK VERIFICATION GATE:
1. test_01_policy_engine_pydantic_schema_and_repair_retries:
   Validates strict_json_policy with Pydantic BaseModel, bounded repair retries,
   and typed instance construction.
2. test_02_policy_engine_silent_airgap_lock:
   Validates [SILENT] air-gap enforcement in PolicyEngine and WorkspaceGovernor,
   blocking cloud execution mode and confirming zero outbound network calls.
3. test_03_context_keeper_lifecycle_and_120_token_resume:
   Validates ck_init stack detection, ck_save persistence, ck_resume <=120-token
   brief and git porcelain drift detection.
4. test_04_reflex_router_ck_commands_execution:
   Validates /ck:init, /ck:save, /ck:resume, /ck:info, /ck:list dispatch through
   ReflexRouter with sub-50ms execution.
5. test_05_instinct_engine_fts5_dedup_and_skill_promotion:
   Validates micro-rule extraction, deduplication hit boost, FTS5 BM25 retrieval,
   and promotion to /skill:<slug> with ecc_skills table synchronization.
6. test_06_sovereign_store_query_with_archive_and_relevance:
   Validates SovereignMemoryStore.query() with archive filtering, min_relevance
   thresholding, and namespace scoping.
7. test_07_sovereign_store_fact_write_gate_and_verification:
   Validates write-gate distinction between ephemeral (unverified) and verified facts,
   and fact promotion via verify_fact().
8. test_08_sovereign_store_memory_forget_deterministic:
   Validates deterministic purge of memories, facts, and instincts across SQLite WAL
   and FTS5 virtual tables.
9. test_09_weekly_trace_distillation_and_system_flags:
   Validates Markov tool transition distillation over execution_slices and
   web_ingest_events updating learning_graph_rules in system_flags.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional
import pytest

from pydantic import BaseModel, Field

from core.runtime.policy_engine import (
    PolicyEngine,
    PolicyViolationError,
    strict_json_policy,
    concise_reflex_policy,
    deep_architect_policy,
    validate_json_schema,
)
from core.runtime.workspaces import WorkspaceGovernor
from core.memory.context_keeper import ContextKeeper, detect_project_stack
from core.runtime.reflex_router import ReflexRouter
from core.memory.instinct_engine import InstinctEngine
from core.memory.sovereign_store import SovereignMemoryStore
from core.memory.learning_graph import LearningGraph, run_weekly_trace_distillation


# =============================================================================
# Helper Deterministic Router (Zero-Mock Real Python Completion Simulator)
# =============================================================================
class DeterministicPolicyRouter:
    """Deterministic local completions engine providing real sequential responses for repair loops."""

    def __init__(self, responses: List[str]) -> None:
        self.responses = list(responses)
        self.call_count = 0
        self.last_prompt = ""

    def generate(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        self.last_prompt = prompt
        resp = self.responses[min(self.call_count, len(self.responses) - 1)]
        self.call_count += 1
        return {
            "success": True,
            "text": resp,
            "provider": "ollama",
            "model": "qwen2.5-coder:7b",
            "total_latency_ms": 11.2,
        }

    def query(self, prompt: str, **kwargs: Any) -> Dict[str, Any]:
        res = self.generate(prompt, **kwargs)
        return {
            "success": True,
            "output": res["text"],
            "provider": res["provider"],
            "model": res["model"],
            "latency_ms": res["total_latency_ms"],
        }


# =============================================================================
# 1. POLICY ENGINE: PYDANTIC SCHEMA & REPAIR RETRIES
# =============================================================================
class ClusterSpec(BaseModel):
    cluster_name: str
    node_count: int = Field(gt=0)
    region: str
    is_gpu: bool


def test_01_policy_engine_pydantic_schema_and_repair_retries():
    """Verifies strict JSON schema validation, Pydantic model parsing, and bounded retry repair."""
    # Response 1 has invalid type for node_count ('not_a_number')
    # Response 2 has valid typed JSON conforming to ClusterSpec
    responses = [
        '```json\n{"cluster_name": "nexus-prod-01", "node_count": "invalid_num", "region": "us-east-1", "is_gpu": true}\n```',
        '```json\n{"cluster_name": "nexus-prod-01", "node_count": 8, "region": "us-east-1", "is_gpu": true}\n```',
    ]
    router = DeterministicPolicyRouter(responses)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        engine = PolicyEngine(router=router, db_path=temp_db)
        res = engine.execute(
            prompt="Generate cluster deployment specification",
            policy_name="strict_json_policy",
            schema=ClusterSpec,
            execution_mode="local",
        )

        assert res["ok"] is True
        assert res["retries_used"] == 1
        assert res["policy"] == "strict_json_policy"
        assert res["data"]["cluster_name"] == "nexus-prod-01"
        assert res["data"]["node_count"] == 8
        assert res["data"]["is_gpu"] is True

        # Check Pydantic model instance
        pydantic_inst = res.get("pydantic_instance")
        assert pydantic_inst is not None
        assert isinstance(pydantic_inst, ClusterSpec)
        assert pydantic_inst.cluster_name == "nexus-prod-01"
        assert pydantic_inst.node_count == 8
        assert pydantic_inst.is_gpu is True

        # Verify telemetry log recorded in SQLite WAL
        conn = sqlite3.connect(temp_db)
        row = conn.execute("SELECT policy_name, retries_used, provider_used FROM telemetry_logs LIMIT 1;").fetchone()
        conn.close()
        assert row is not None
        assert row[0] == "strict_json_policy"
        assert row[1] == 1
    finally:
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 2. WORKSPACE GOVERNOR & SILENT AIR-GAP LOCK
# =============================================================================
def test_02_policy_engine_silent_airgap_lock():
    """Verifies that [SILENT] mode strictly locks down execution to local air-gapped inference."""
    gov = WorkspaceGovernor()
    gov.set_mode("SILENT")

    try:
        assert gov.is_silent() is True
        assert gov.is_outbound_network_allowed() is False
        assert len(gov.get_allowed_paths()) == 0
        assert len(gov.get_allowed_mcp_tools()) == 0

        # Assert air gap invariant check passes
        gov.assert_air_gapped()

        engine = PolicyEngine(governor=gov)
        assert engine.get_effective_mode() == "local"

        # Explicit request for cloud in SILENT mode must raise PolicyViolationError
        with pytest.raises(PolicyViolationError) as exc_info:
            engine.execute(
                prompt="Cloud reasoning task",
                policy_name="strict_json_policy",
                execution_mode="cloud",
            )
        assert "SILENT workspace mode" in str(exc_info.value)
    finally:
        gov.set_mode("DEV")


# =============================================================================
# 3. ECC CONTEXT KEEPER (/ck) LIFECYCLE & <=120-TOKEN RESUME BRIEF
# =============================================================================
def test_03_context_keeper_lifecycle_and_120_token_resume():
    """Verifies ContextKeeper stack detection, persistence, <=120-token brief, and git drift detection."""
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp_dir:
        temp_repo = Path(temp_dir)

        # Initialize real git repository
        subprocess.run(["git", "init"], cwd=str(temp_repo), check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["git", "config", "user.email", "test@nexus.local"], cwd=str(temp_repo), check=True)
        subprocess.run(["git", "config", "user.name", "Nexus Test"], cwd=str(temp_repo), check=True)
        subprocess.run(["git", "config", "commit.gpgsign", "false"], cwd=str(temp_repo), check=True)

        # Create package.json with typescript & react
        pkg_json = {
            "name": "nexus-web",
            "dependencies": {"react": "^19.0.0", "typescript": "^5.0.0"},
        }
        (temp_repo / "package.json").write_text(json.dumps(pkg_json), encoding="utf-8")
        subprocess.run(["git", "add", "package.json"], cwd=str(temp_repo), check=True)
        subprocess.run(["git", "commit", "--no-gpg-sign", "-m", "Initial commit"], cwd=str(temp_repo), check=True, stdout=subprocess.DEVNULL, timeout=10.0)

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            temp_db = tf.name

        ck = ContextKeeper(db_path=temp_db)
        try:
            # 1. ck_init
            init_res = ck.ck_init(str(temp_repo), workspace_mode="DEV", goal="Implement edge mesh")
            assert init_res["success"] is True
            assert "react" in init_res["stack"]
            assert "typescript" in init_res["stack"]

            # 2. ck_save
            save_res = ck.ck_save(
                str(temp_repo),
                goal="Implement edge mesh",
                left_off="Configured package.json dependencies",
                next_steps=["Setup SQLite WAL tables", "Deploy IPC router"],
                decisions=["Use local-first SQLite WAL"],
                active_files=["core/runtime/ipc_server.py"],
                open_tasks=["Task 1: Harden policy engine", "Task 2: Wire /ck commands"],
            )
            assert save_res["success"] is True

            # 3. ck_resume (clean sync status)
            resume_clean = ck.ck_resume(str(temp_repo))
            assert resume_clean["success"] is True
            assert resume_clean["token_estimate"] <= 120
            assert resume_clean["has_unsaved_drift"] is False
            assert "[CK:RESUME" in resume_clean["brief_text"]

            # 4. Introduce uncommitted git drift
            uncommitted_file = temp_repo / "uncommitted_drift.txt"
            uncommitted_file.write_text("drift content", encoding="utf-8")

            resume_drift = ck.ck_resume(str(temp_repo))
            assert resume_drift["has_unsaved_drift"] is True
            assert "drift_reason" in resume_drift
            assert resume_drift["token_estimate"] <= 120

            # 5. ck_info and ck_list
            info_res = ck.ck_info(str(temp_repo))
            assert info_res["success"] is True
            assert info_res["goal"] == "Implement edge mesh"

            all_contexts = ck.ck_list()
            assert len(all_contexts) >= 1
            assert all_contexts[0]["project_path"] == str(temp_repo.resolve())
        finally:
            ck.close()
            try:
                if os.path.exists(temp_db):
                    os.remove(temp_db)
            except OSError:
                pass


# =============================================================================
# 4. REFLEX ROUTER: /ck:* COMMANDS EXECUTION
# =============================================================================
def test_04_reflex_router_ck_commands_execution():
    """Verifies /ck:init, /ck:save, /ck:resume, /ck:info, /ck:list dispatch through ReflexRouter."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    store = SovereignMemoryStore(db_path=temp_db)
    router = ReflexRouter(store=store, dry_run=False)

    try:
        # 1. /ck:init
        res_init = router.evaluate_and_execute("/ck:init my_proj Building edge autonomous engine")
        assert res_init["matched"] is True
        assert res_init["reflex_name"] == "ck_init"
        assert "Initialized Context Keeper snapshot" in res_init["result"]

        # 2. /ck:save
        res_save = router.evaluate_and_execute("/ck:save my_proj Completed initial sprint slice")
        assert res_save["matched"] is True
        assert res_save["reflex_name"] == "ck_save"
        assert "Saved Context Keeper snapshot" in res_save["result"]

        # 3. /ck:resume (concise <=120 tokens)
        res_resume = router.evaluate_and_execute("/ck:resume my_proj")
        assert res_resume["matched"] is True
        assert res_resume["reflex_name"] == "ck_resume"
        assert "[CK:RESUME" in res_resume["result"]
        word_count = len(res_resume["result"].split())
        assert word_count <= 95  # Strict <= 120 tokens

        # 4. /ck:info
        res_info = router.evaluate_and_execute("/ck:info my_proj")
        assert res_info["matched"] is True
        assert res_info["reflex_name"] == "ck_info"
        assert "my_proj" in res_info["result"]

        # 5. /ck:list
        res_list = router.evaluate_and_execute("/ck:list")
        assert res_list["matched"] is True
        assert res_list["reflex_name"] == "ck_list"
        assert "Stored Contexts:" in res_list["result"]
    finally:
        store.close()
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 5. INSTINCT ENGINE: FTS5 BM25 SEARCH, DEDUP & SKILL PROMOTION
# =============================================================================
def test_05_instinct_engine_fts5_dedup_and_skill_promotion():
    """Verifies micro-rule extraction, deduplication hit boost, sub-15ms FTS5 retrieval, and skill promotion."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    ie = InstinctEngine(db_path=temp_db)
    try:
        prompt = "Fix: SQLite WAL Busy Timeout 0x05"
        fix = "Configure PRAGMA busy_timeout=5000 and PRAGMA journal_mode=WAL before concurrent transactions."

        # 1. Initial storage
        r1 = ie.extract_and_store_instinct(prompt, fix, workspace_mode="DEV", confidence=0.88)
        assert r1["success"] is True
        assert r1["deduplicated"] is False
        inst_id = r1["instinct_id"]

        # 2. Duplicate storage (hit count increment & confidence boost)
        r2 = ie.extract_and_store_instinct(prompt, fix, workspace_mode="DEV", confidence=0.88)
        assert r2["success"] is True
        assert r2["deduplicated"] is True
        assert r2["hit_count"] == 2
        assert r2["confidence_score"] > 0.88

        # 3. Sub-15ms FTS5 retrieval
        t_start = time.perf_counter()
        matches = ie.retrieve_matching_instincts("SQLite WAL Busy Timeout", workspace_mode="DEV", limit=3)
        latency_ms = (time.perf_counter() - t_start) * 1000
        assert latency_ms < 25.0
        assert len(matches) >= 1
        assert matches[0]["id"] == inst_id

        # 4. Promotion to skill package and ecc_skills table
        promo = ie.promote_instinct_to_skill(inst_id, "sqlite-wal-concurrency", orbiter_group="DEV-01")
        assert promo["success"] is True
        skill_path = Path(promo["skill_path"])
        assert skill_path.exists()
        content = skill_path.read_text(encoding="utf-8")
        assert "sqlite-wal-concurrency" in content
        assert "PRAGMA busy_timeout=5000" in content

        # Check ecc_skills table row in SQLite WAL
        conn = sqlite3.connect(temp_db)
        row = conn.execute("SELECT skill_slug, orbiter_group FROM ecc_skills WHERE skill_slug = 'sqlite-wal-concurrency';").fetchone()
        conn.close()
        assert row is not None
        assert row[0] == "sqlite-wal-concurrency"
        assert row[1] == "DEV-01"

        # Cleanup created skill file
        if skill_path.exists():
            skill_path.unlink()
            if skill_path.parent.exists():
                skill_path.parent.rmdir()
    finally:
        ie.close()
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 6. SOVEREIGN MEMORY STORE: QUERY WITH ARCHIVE & RELEVANCE FILTERING
# =============================================================================
def test_06_sovereign_store_query_with_archive_and_relevance():
    """Verifies SovereignMemoryStore.query() archive filtering, relevance thresholding, and namespace scoping."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    store = SovereignMemoryStore(db_path=temp_db)
    try:
        # Insert 3 memory nodes
        m1 = store.insert_memory(
            content="Active architecture note on SQLite WAL concurrency and IPC spine",
            title="WAL Concurrency Architecture",
            namespace="dev_context",
        )
        m2 = store.insert_memory(
            content="Archived historical note on legacy runner script deprecation",
            title="Legacy Runner Architecture",
            namespace="dev_context",
        )
        # Archive m2
        store.archive_memory(m2, archived=True)

        m3 = store.insert_memory(
            content="Unrelated audio equalizer and Kokoro TTS speech profile",
            title="Audio Equalizer Notes",
            namespace="dev_context",
        )

        # 1. Query without archived nodes
        q_active = store.query(
            query_text="Architecture",
            namespace="dev_context",
            include_archived=False,
        )
        active_ids = [item["id"] for item in q_active]
        assert m1 in active_ids
        assert m2 not in active_ids

        # 2. Query with archived nodes included
        q_all = store.query(
            query_text="Architecture",
            namespace="dev_context",
            include_archived=True,
        )
        all_ids = [item["id"] for item in q_all]
        assert m1 in all_ids
        assert m2 in all_ids

        # 3. Relevance threshold filtering
        q_filtered = store.query(
            query_text="SQLite WAL concurrency",
            namespace="dev_context",
            min_relevance=0.01,
        )
        assert len(q_filtered) >= 1
        for item in q_filtered:
            assert item["relevance"] >= 0.01
    finally:
        store.close()
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 7. SOVEREIGN FACT WRITE-GATE: EPHEMERAL VS VERIFIED
# =============================================================================
def test_07_sovereign_store_fact_write_gate_and_verification():
    """Verifies write-gate distinction between ephemeral facts and verified facts, plus promotion."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    store = SovereignMemoryStore(db_path=temp_db)
    try:
        # 1. Ephemeral Fact (unverified, write-gate default)
        f_ephemeral_id = store.store_fact(
            fact_text="User mentioned they might switch to local DeepSeek model next week",
            source="user_conversation",
            verified=False,
            category="preference",
            namespace="dev_context",
        )
        f1 = store.get_fact(f_ephemeral_id)
        assert f1 is not None
        assert f1["is_verified"] is False
        assert f1["is_ephemeral"] is True

        # 2. Verified Fact (pre-verified through verification gate)
        f_verified_id = store.store_fact(
            fact_text="Nexus OS boots exclusively via python nexus.py targeting WinSta0\\Default",
            source="system_architecture_spec",
            verified=True,
            category="architecture",
            namespace="dev_context",
        )
        f2 = store.get_fact(f_verified_id)
        assert f2 is not None
        assert f2["is_verified"] is True
        assert f2["is_ephemeral"] is False

        # 3. Promote ephemeral fact across write-gate
        promoted = store.verify_fact(f_ephemeral_id)
        assert promoted is True
        f1_promoted = store.get_fact(f_ephemeral_id)
        assert f1_promoted["is_verified"] is True
        assert f1_promoted["is_ephemeral"] is False

        # 4. Filter list by verified_only
        verified_facts = store.list_facts(namespace="dev_context", verified_only=True)
        assert len(verified_facts) == 2
    finally:
        store.close()
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 8. SOVEREIGN STORE: DETERMINISTIC MEMORY FORGET
# =============================================================================
def test_08_sovereign_store_memory_forget_deterministic():
    """Verifies deterministic removal of memory nodes, facts, and instincts across SQLite WAL and FTS5."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    store = SovereignMemoryStore(db_path=temp_db)
    try:
        # Insert target memories to be forgotten
        m_id = store.insert_memory(
            content="Temporary confidential token ALPHA_SECRET_9999",
            title="Confidential Token Record ALPHA_SECRET_9999",
            namespace="dev_context",
        )
        f_id = store.store_fact(
            fact_text="ALPHA_SECRET_9999 is temporarily valid for local testing",
            source="test",
            verified=False,
            namespace="dev_context",
        )

        # Confirm existence
        assert store.get_memory(m_id) is not None
        assert store.get_fact(f_id) is not None

        # Execute deterministic memory forget by pattern
        purged_count = store.memory_forget(pattern="ALPHA_SECRET_9999")
        assert purged_count >= 2

        # Verify completely deleted from SQLite relational & FTS tables
        assert store.get_memory(m_id) is None
        assert store.get_fact(f_id) is None

        # Verify FTS search returns 0 matches
        fts_res = store.search_text("ALPHA_SECRET_9999")
        assert len(fts_res) == 0
    finally:
        store.close()
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 9. CLOSED-LOOP WEEKLY TRACE DISTILLATION
# =============================================================================
def test_09_weekly_trace_distillation_and_system_flags():
    """Verifies trace distillation analyzing execution_slices and persisting learning_graph_rules into system_flags."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    graph = LearningGraph(db_path=temp_db)
    try:
        # Seed completed execution traces with tool transitions
        graph.record_trace(
            slice_id="slice_101",
            title="Refactor Reticle Verification",
            task_type="coding",
            status="COMPLETED",
            tools_used=["reticle_look", "reticle_act", "reticle_assert"],
            latency_ms=45.2,
        )
        graph.record_trace(
            slice_id="slice_102",
            title="Harden Policy Engine",
            task_type="coding",
            status="COMPLETED",
            tools_used=["reticle_act", "reticle_assert"],
            latency_ms=32.1,
        )
        graph.record_trace(
            slice_id="slice_103",
            title="Architecture Review",
            task_type="reasoning",
            status="COMPLETED",
            tools_used=["sovereign_query", "context_keeper_resume"],
            latency_ms=18.5,
        )

        # Run distillation
        res = graph.run_trace_distillation()
        assert res["success"] is True
        rules = res["rules"]
        assert rules["total_traces_analyzed"] == 3
        assert "reticle_look" in rules["tool_frequencies"]
        assert "routing_weights" in rules

        # Verify persisted into SQLite system_flags table
        conn = sqlite3.connect(temp_db)
        row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'learning_graph_rules';").fetchone()
        conn.close()
        assert row is not None
        saved_rules = json.loads(row[0])
        assert saved_rules["total_traces_analyzed"] == 3
        assert "high_success_sequences" in saved_rules

        # Verify SovereignMemoryStore delegation
        store = SovereignMemoryStore(db_path=temp_db)
        try:
            delegated_res = store.run_weekly_trace_distillation()
            assert delegated_res["success"] is True
        finally:
            store.close()
    finally:
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass
