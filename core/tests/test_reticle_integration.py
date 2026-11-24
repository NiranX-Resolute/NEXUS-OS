"""Nexus OS v5.0 - Reticle MCP Integration & Verification Gate Tests.

Validates:
1. Reticle stdio MCP server registration in nexus_manifest.yaml
2. WorkspaceGovernor loopback containment for [DEV] and [SILENT] modes
3. ScopeGuard loopback isolation (127.0.0.1 / localhost only)
4. AgentShield compliance auditing (VERIFIED_LOOPBACK_MCP)
5. reticle-verify-ui skill record in agent_local.db and SKILL.md
6. Deterministic Reticle flows under .reticle/flows/
"""

import json
import os
from pathlib import Path
import sqlite3
import pytest
import yaml

from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard
from core.mcp.agent_shield import AgentShieldAuditor

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def test_nexus_manifest_reticle_registration():
    """Verifies that nexus_manifest.yaml registers Reticle stdio MCP server cleanly."""
    manifest_path = REPO_ROOT / "nexus_manifest.yaml"
    assert manifest_path.exists(), "nexus_manifest.yaml must exist"

    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    assert "mcp_server_definitions" in data, "mcp_server_definitions missing from manifest"
    assert "reticle" in data["mcp_server_definitions"], "reticle server missing from definitions"

    reticle_def = data["mcp_server_definitions"]["reticle"]
    assert reticle_def["command"] == "npx"
    assert "@reticlehq/server" in reticle_def["args"]
    assert reticle_def["transport"] == "stdio"
    assert reticle_def["host"] == "127.0.0.1"

    scope = reticle_def.get("scope", {})
    assert "DEV-01" in scope.get("agents", [])
    assert "SEC-01" in scope.get("agents", [])
    assert "127.0.0.1" in scope.get("allowed_hosts", [])
    assert "localhost" in scope.get("allowed_hosts", [])

    # Check DEV workspace
    dev_ws = data["workspaces"]["DEV"]
    assert "reticle" in dev_ws["mcp_servers"]
    assert "reticle_act_and_wait" in dev_ws["allowed_mcp_tools"]
    assert "reticle_assert" in dev_ws["allowed_mcp_tools"]

    # Check SILENT workspace permits Reticle loopback verification
    silent_ws = data["workspaces"]["SILENT"]
    assert "reticle" in silent_ws["mcp_servers"]
    assert "reticle_act_and_wait" in silent_ws["allowed_mcp_tools"]


def test_workspace_governor_reticle():
    """Verifies WorkspaceGovernor permits loopback Reticle verification in DEV & SILENT."""
    gov = WorkspaceGovernor()

    # DEV mode
    gov.set_mode("DEV")
    assert gov.is_tool_permitted("reticle")
    assert gov.is_tool_permitted("reticle_act_and_wait")
    assert gov.is_tool_permitted("reticle_assert")
    assert gov.is_reticle_target_allowed("127.0.0.1")
    assert gov.is_reticle_target_allowed("http://localhost:5173")
    assert not gov.is_reticle_target_allowed("https://api.external.com")

    # SILENT mode
    gov.set_mode("SILENT")
    assert gov.is_tool_permitted("reticle")
    assert gov.is_tool_permitted("reticle_assert")
    assert gov.is_reticle_target_allowed("127.0.0.1")
    assert gov.is_reticle_target_allowed("localhost")
    assert not gov.is_reticle_target_allowed("https://api.external.com")

    # Reset back to DEV
    gov.set_mode("DEV")


def test_scope_guard_reticle_loopback_isolation():
    """Verifies ScopeGuard strictly restricts Reticle to 127.0.0.1 / localhost."""
    guard = ScopeGuard()

    # Valid loopback targets
    assert guard.validate_reticle_target("127.0.0.1")
    assert guard.validate_reticle_target("localhost")
    assert guard.validate_reticle_target("http://127.0.0.1:4400")
    assert guard.validate_reticle_target("http://localhost:5173")

    # Invalid external targets
    assert not guard.validate_reticle_target("google.com")
    assert not guard.validate_reticle_target("192.168.1.100")
    assert not guard.validate_reticle_target("https://remote-api.com")

    # Enforce checks
    guard.enforce("reticle", "http://127.0.0.1:4400")
    guard.enforce("reticle_act_and_wait", "localhost")

    with pytest.raises(PermissionError):
        guard.enforce("reticle", "https://external-host.com")

    with pytest.raises(PermissionError):
        guard.enforce("reticle_assert", "https://unauthorized.dev")


def test_agent_shield_verifies_reticle():
    """Verifies AgentShield audits loopback-scoped Reticle server as safe and verified."""
    auditor = AgentShieldAuditor()

    valid_reticle_def = {
        "command": "npx",
        "args": ["-y", "@reticlehq/server", "mcp"],
        "transport": "stdio",
        "host": "127.0.0.1",
        "port": 4400,
        "scope": {
            "agents": ["DEV-01", "SEC-01"],
            "allowed_hosts": ["127.0.0.1", "localhost"],
        },
    }

    res = auditor.verify_mcp_server("reticle", valid_reticle_def)
    assert res["verified"] is True
    assert res["status"] == "VERIFIED_LOOPBACK_MCP"
    assert res["score"] == 100
    assert res["quarantined"] is False

    invalid_reticle_def = {
        "command": "npx",
        "args": ["-y", "@reticlehq/server", "mcp"],
        "transport": "network",
        "host": "cloud.external-dashboard.com",
        "scope": {
            "allowed_hosts": ["cloud.external-dashboard.com"],
        },
    }

    bad_res = auditor.verify_mcp_server("reticle", invalid_reticle_def)
    assert bad_res["verified"] is False
    assert bad_res["quarantined"] is True


def test_reticle_skill_and_flows():
    """Verifies reticle-verify-ui skill record in DB and deterministic flows on disk."""
    # 1. Check Skill in SQLite WAL
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    assert db_path.exists(), "agent_local.db must exist"

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    cursor.execute("SELECT slug, category, orbiter_group, verified FROM ecc_skills WHERE slug = 'reticle-verify-ui'")
    row = cursor.fetchone()
    assert row is not None, "reticle-verify-ui must be registered in ecc_skills"
    assert row[0] == "reticle-verify-ui"
    assert row[1] == "verification"
    assert row[2] == "DEV-01"
    assert row[3] == 1
    conn.close()

    # 2. Check SKILL.md
    skill_md = Path.home() / ".nexus-agent" / "skills" / "reticle-verify-ui" / "SKILL.md"
    assert skill_md.exists(), "reticle-verify-ui SKILL.md must exist"
    content = skill_md.read_text(encoding="utf-8")
    assert "reticle_act_and_wait" in content
    assert 'verified: "yes"' in content

    # 3. Check Flows
    flows_dir = REPO_ROOT / ".reticle" / "flows"
    assert flows_dir.exists(), ".reticle/flows/ must exist"

    mode_switch = json.loads((flows_dir / "workspace-mode-switch.json").read_text(encoding="utf-8"))
    assert mode_switch["name"] == "workspace-mode-switch"
    assert len(mode_switch["steps"]) == 3

    estop = json.loads((flows_dir / "estop-roundtrip.json").read_text(encoding="utf-8"))
    assert estop["name"] == "estop-roundtrip"
    assert len(estop["steps"]) == 3

    tree = json.loads((flows_dir / "nexkoder-live-tree.json").read_text(encoding="utf-8"))
    assert tree["name"] == "nexkoder-live-tree"
    assert len(tree["steps"]) == 2
