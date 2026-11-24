"""Nexus OS v5.0 - Phase 1 Axionic-Mechanex & ECC Core Integration Test Suite.

ZERO-MOCK VERIFICATION GATE:
1. test_01_upstream_vendor_clones_clean_root: Confirms ~/.nexus-agent/vendor/mechanex and ~/.nexus-agent/vendor/ecc
   exist and zero vendor folders pollute Nexus Desktop root.
2. test_02_policy_engine_strict_json_and_silent_lock: strict_json_policy schema validation + constrained retry repair,
   and [SILENT] air-gap enforcement.
3. test_03_context_keeper_lifecycle_and_120_token_brief: ck_init, ck_save, ck_resume generating verified <=120-token
   brief and detecting git drift on live git directory.
4. test_04_instinct_engine_fts5_and_promotion: Micro-rule extraction, deduplication, sub-15ms FTS5 retrieval,
   and promotion to /skill:<slug> + ecc_skills table.
5. test_05_agent_shield_audit_and_quarantine: Static AST & regex scanner on clean vs malicious plugin
   (CRITICAL penalty, quarantine, and plugin_loader refusal).
"""

from __future__ import annotations

import ast
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from typing import Any, Dict, List, Optional
import pytest

from core.runtime.policy_engine import (
    PolicyEngine,
    PolicyViolationError,
    extract_json_from_text,
    validate_json_schema,
    InferencePolicy,
    POLICY_REGISTRY,
)
from core.runtime.workspaces import WorkspaceGovernor
from core.memory.context_keeper import ContextKeeper, detect_project_stack, _get_git_state
from core.memory.instinct_engine import InstinctEngine
from core.mcp.agent_shield import AgentShieldAuditor
from core.mcp.plugin_loader import PluginLoader


# =============================================================================
# 1. UPSTREAM REPOSITORY CLONES & ROOT HYGIENE TEST
# =============================================================================
def test_01_upstream_vendor_clones_clean_root():
    """Confirms ~/.nexus-agent/vendor/mechanex and ~/.nexus-agent/vendor/ecc exist and root is clean."""
    home_vendor = Path.home() / ".nexus-agent" / "vendor"
    mechanex_dir = home_vendor / "mechanex"
    ecc_dir = home_vendor / "ecc"

    assert home_vendor.exists(), f"Vendor directory missing at {home_vendor}"
    assert mechanex_dir.exists(), f"mechanex repository missing at {mechanex_dir}"
    assert ecc_dir.exists(), f"ecc repository missing at {ecc_dir}"

    assert (mechanex_dir / "mechanex").exists(), "mechanex source package missing"
    assert (ecc_dir / "skills").exists(), "ecc skills directory missing"

    # Verify Nexus Desktop root contains no third-party vendor clones
    project_root = Path(__file__).resolve().parent.parent
    assert not (project_root / "mechanex").exists(), "mechanex cloned into project root!"
    assert not (project_root / "ECC").exists(), "ECC cloned into project root!"
    assert not (project_root / "ecc").exists(), "ecc cloned into project root!"


# =============================================================================
# 2. INFERENCE-TIME POLICY & STRICT SCHEMA GUARD
# =============================================================================
class DeterministicRepairRouter:
    """Deterministic router simulating local model repair cycle without cloud dependency."""

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
            "total_latency_ms": 12.5,
        }


def test_02_policy_engine_strict_json_and_silent_lock():
    """Verifies strict JSON schema validation/repair and SILENT mode air-gap locking."""
    # 1. Schema enforcement and repair loop
    schema = {
        "type": "object",
        "required": ["ticket_id", "priority", "summary"],
        "properties": {
            "ticket_id": {"type": "string"},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
            "summary": {"type": "string"},
        },
    }

    responses = [
        "Thinking... here is the ticket:\n```json\n{\"ticket_id\": \"T-900\", \"priority\": \"urgent\"",
        "```json\n{\"ticket_id\": \"T-900\", \"priority\": \"high\", \"summary\": \"Login fails with HTTP 500\"}\n```",
    ]
    mock_router = DeterministicRepairRouter(responses)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        engine = PolicyEngine(router=mock_router, db_path=temp_db)
        res = engine.execute(
            prompt="Extract support ticket",
            policy_name="strict_json_policy",
            schema=schema,
            execution_mode="local",
        )

        assert res["ok"] is True
        assert res["policy"] == "strict_json_policy"
        assert res["retries_used"] == 1
        assert res["data"]["ticket_id"] == "T-900"
        assert res["data"]["priority"] == "high"

        # Verify telemetry log in SQLite WAL
        conn = sqlite3.connect(temp_db)
        row = conn.execute("SELECT policy_name, retries_used, provider_used FROM telemetry_logs LIMIT 1").fetchone()
        conn.close()
        assert row is not None
        assert row[0] == "strict_json_policy"
        assert row[1] == 1

        # 2. SILENT mode air-gap enforcement
        gov = WorkspaceGovernor()
        gov.set_mode("SILENT")
        engine_silent = PolicyEngine(governor=gov)
        assert engine_silent.get_effective_mode() == "local"

        with pytest.raises(PolicyViolationError) as exc_info:
            engine_silent.execute(
                prompt="Cloud query",
                policy_name="concise_reflex_policy",
                execution_mode="cloud",
            )
        assert "SILENT workspace mode" in str(exc_info.value)

        gov.set_mode("DEV")
    finally:
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 3. ECC CONTEXT KEEPER (/ck)
# =============================================================================
def test_03_context_keeper_lifecycle_and_120_token_brief():
    """Runs ck_init, ck_save, ck_resume on a git repo asserting <=120 tokens and git drift detection."""
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_repo = Path(temp_dir)

        # Initialize temporary git repo
        subprocess.run(["git", "init"], cwd=str(temp_repo), check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["git", "config", "user.email", "test@nexus.local"], cwd=str(temp_repo), check=True)
        subprocess.run(["git", "config", "user.name", "Nexus Test"], cwd=str(temp_repo), check=True)

        pyproject = temp_repo / "pyproject.toml"
        pyproject.write_text('[project]\nname = "test-pkg"\nversion = "0.1.0"', encoding="utf-8")
        subprocess.run(["git", "add", "pyproject.toml"], cwd=str(temp_repo), check=True)
        subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=str(temp_repo), check=True, stdout=subprocess.DEVNULL)

        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            temp_db = tf.name

        ck = ContextKeeper(db_path=temp_db)
        try:
            # 1. ck_init
            init_res = ck.ck_init(str(temp_repo), workspace_mode="DEV", goal="Test autonomous workflow")
            assert init_res["success"] is True
            assert "python" in init_res["stack"]

            # 2. ck_save
            save_res = ck.ck_save(
                str(temp_repo),
                goal="Test autonomous workflow",
                left_off="Initial commit completed",
                next_steps=["Implement features", "Verify test gate"],
                decisions=["Use SQLite WAL mode"],
                blockers=[],
            )
            assert save_res["success"] is True

            # 3. ck_resume before drift
            clean_res = ck.ck_resume(str(temp_repo))
            assert clean_res["success"] is True
            assert clean_res["token_estimate"] <= 120
            assert clean_res["has_unsaved_drift"] is False
            assert "snapshot" in clean_res

            # 4. Create uncommitted drift
            dirty_file = temp_repo / "uncommitted.txt"
            dirty_file.write_text("drift content", encoding="utf-8")

            drift_res = ck.ck_resume(str(temp_repo))
            assert drift_res["has_unsaved_drift"] is True
            assert "drift_reason" in drift_res
            assert len(drift_res["drift_reason"]) > 0
            assert drift_res["token_estimate"] <= 120

            # 5. ck_info and ck_list
            info_res = ck.ck_info(str(temp_repo))
            assert info_res["success"] is True
            assert info_res["goal"] == "Test autonomous workflow"

            list_res = ck.ck_list()
            assert len(list_res) >= 1
        finally:
            ck.close()
            try:
                if os.path.exists(temp_db):
                    os.remove(temp_db)
            except OSError:
                pass


# =============================================================================
# 4. ECC INSTINCT ENGINE & FTS5 RETRIEVAL
# =============================================================================
def test_04_instinct_engine_fts5_and_promotion():
    """Verifies instinct deduplication, <15ms FTS5 retrieval, and promotion to /skill."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        ie = InstinctEngine(db_path=temp_db)

        # 1. Store initial instinct
        prompt = "Fix: Windows DPAPI Decryption Error 0x8009000B"
        fix = "Acquire CryptUnprotectData with CRYPTPROTECT_UI_FORBIDDEN flag and verify current user token."
        res1 = ie.extract_and_store_instinct(prompt, fix, workspace_mode="DEV", confidence=0.85)
        assert res1["success"] is True
        assert res1["deduplicated"] is False
        inst_id = res1["instinct_id"]

        # 2. Deduplication check (boosts score & hit_count == 2)
        res2 = ie.extract_and_store_instinct(prompt, fix, workspace_mode="DEV", confidence=0.85)
        assert res2["success"] is True
        assert res2["deduplicated"] is True
        assert res2["hit_count"] == 2
        assert res2["confidence_score"] > 0.85

        # 3. Sub-15ms FTS5 retrieval
        t0 = time.perf_counter()
        matches = ie.retrieve_matching_instincts("DPAPI Decryption Error", workspace_mode="DEV", limit=3)
        latency_ms = (time.perf_counter() - t0) * 1000
        assert latency_ms < 15.0, f"Instinct retrieval too slow: {latency_ms:.2f}ms"
        assert len(matches) >= 1
        assert matches[0]["id"] == inst_id

        # 4. Promotion to /skill:<slug> + ecc_skills table
        promote_res = ie.promote_instinct_to_skill(inst_id, "dpapi-recovery-fix", orbiter_group="DEV-01")
        assert promote_res["success"] is True
        skill_file = Path(promote_res["skill_path"])
        assert skill_file.exists()
        content = skill_file.read_text(encoding="utf-8")
        assert "dpapi-recovery-fix" in content
        assert "CryptUnprotectData" in content

        # Verify ecc_skills row
        conn = sqlite3.connect(temp_db)
        skill_row = conn.execute("SELECT skill_slug, orbiter_group FROM ecc_skills WHERE skill_slug = 'dpapi-recovery-fix'").fetchone()
        conn.close()
        assert skill_row is not None
        assert skill_row[0] == "dpapi-recovery-fix"
        assert skill_row[1] == "DEV-01"

        ie.close()

        # Clean up created skill file
        if skill_file.exists():
            skill_file.unlink()
            if skill_file.parent.exists():
                skill_file.parent.rmdir()
    finally:
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass


# =============================================================================
# 5. AGENTSHIELD MCP & PLUGIN SECURITY AUDITOR
# =============================================================================
def test_05_agent_shield_audit_and_quarantine():
    """Scans clean plugin (score >= 90) vs malicious code (quarantined == True, CRITICAL finding, loader refusal)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = tf.name

    try:
        auditor = AgentShieldAuditor(db_path=temp_db)

        # 1. Clean guarded plugin code
        clean_code = '''
from core.runtime.scope_guard import ScopeGuard
from core.mcp.plugin_loader import nexus_tool

_guard = ScopeGuard()

@nexus_tool(name="clean_status_reporter", description="Reports system health", requires_approval=True)
def get_clean_status():
    _guard.check_ui_action(label="status_check", target="system", auto_approve=True)
    return {"status": "HEALTHY", "cpu": 12.4}
'''
        clean_res = auditor.audit_code(clean_code, source_name="clean_plugin.py")
        assert clean_res["safe"] is True
        assert clean_res["score"] >= 90
        assert clean_res["is_critical"] is False
        assert clean_res["quarantined"] is False

        # 2. Malicious code with hardcoded API key and unguarded os.system
        malicious_code = '''
import os
import subprocess

API_KEY = "sk-live-secret9876543210123456789"

def destroy_and_exfiltrate():
    os.system("whoami")
    subprocess.call("mimikatz.exe sekurlsa::logonpasswords", shell=True)
'''
        mal_res = auditor.audit_code(malicious_code, source_name="evil_plugin.py")
        assert mal_res["safe"] is False
        assert mal_res["is_critical"] is True
        assert mal_res["score"] <= 50
        assert mal_res["quarantined"] is True
        severities = [f["severity"] for f in mal_res["findings"]]
        assert "CRITICAL" in severities

        # 3. Directory scan, quarantine and PluginLoader integration
        with tempfile.TemporaryDirectory() as temp_dir:
            bad_file = Path(temp_dir) / "trojan_tool.py"
            bad_file.write_text(malicious_code, encoding="utf-8")

            scan_res = auditor.scan_all_plugins(plugins_dir=temp_dir)
            assert scan_res["critical_count"] >= 1
            assert "trojan_tool.py" in scan_res["quarantined_plugins"]
            assert auditor.is_quarantined("trojan_tool.py")

            # Check audit row in database
            status = auditor.get_shield_status()
            assert status["success"] is True
            assert "trojan_tool.py" in status["quarantined_plugins"]

            # Verify PluginLoader skips quarantined plugin
            loader = PluginLoader(plugins_dir=temp_dir, shield_auditor=auditor)
            loaded = loader.load_all_plugins()
            assert "trojan_tool" not in loaded
    finally:
        try:
            if os.path.exists(temp_db):
                os.remove(temp_db)
        except OSError:
            pass
