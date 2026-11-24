"""
Nexus OS v5.0 - Real Integration Test Suite for Circuit Drawers & System Tray.
=============================================================================
Zero-Stub, Zero-Simulation Law Enforcement:
Verifies real operational readiness of the 4 Living Core Circuit Drawers
and Unified Electron System Tray Menu:
1. Circuit 01: Memory Store (FTS5 search, web ingests, store & forget deletion).
2. Circuit 02: MCP Skills & ECC (AgentShield audit, .nxskill packaging, instincts).
3. Circuit 03: Soul & TARS Persona Matrix (sliders, presets, 4 voice engines).
4. Circuit 04: Enclave & ScopeGuard (Invariants, path jails, DPAPI presence, Governor).
5. Unified System Tray: String and architectural validation of the single Electron "N" menu.
=============================================================================
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import sys
import time
import pytest

# Ensure offline test execution for plugin dependency installations
os.environ["NEXUS_SKIP_DEP_INSTALL"] = "1"

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard, ScopeGuardException, SOVEREIGN_INVARIANTS
from core.mcp.agent_shield import AgentShieldAuditor
from core.mcp.skill_marketplace_importer import SkillMarketplaceImporter
from core.bridge.persona_engine import PersonaTelemetry, compute_tts_prosody, PERSONA_PRESETS


def test_circuit_01_memory_fts5_crud_and_search() -> None:
    """Verifies Circuit 01 FTS5 search, live SQLite WAL storage, and 1-click forget deletion."""
    test_db = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    store = SovereignMemoryStore(db_path=test_db)

    # 1. Store a test memory item
    test_title = f"Test CircuitDrawer FTS5 Note {int(time.time())}"
    test_content = "Sovereign memory node for living core circuit drawer 01 with FTS5 tokenization."
    node_id = store.store_memory(
        title=test_title,
        content=test_content,
        namespace="dev",
        metadata={"pinned": False, "source": "test_circuit_drawers"}
    )
    assert node_id is not None
    assert len(node_id) > 0

    # 2. Retrieve and verify content
    retrieved = store.get_memory(node_id)
    assert retrieved is not None
    assert retrieved["title"] == test_title
    assert "FTS5 tokenization" in retrieved["content"]

    # 3. Perform FTS5 search
    search_results = store.search_text(query="FTS5 tokenization", limit=5)
    assert len(search_results) > 0
    matched_ids = [r["id"] for r in search_results]
    assert node_id in matched_ids

    # 4. 1-click Forget (DELETE /api/memory/<id>)
    deleted = store.delete_memory(node_id)
    assert deleted is True

    # 5. Confirm deletion from database
    post_delete = store.get_memory(node_id)
    assert post_delete is None


def test_circuit_01_web_ingests_table_integrity() -> None:
    """Verifies that web_ingest_events table exists and handles records cleanly in SQLite WAL."""
    test_db = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    conn = sqlite3.connect(str(test_db), timeout=5.0)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='web_ingest_events';")
        row = cur.fetchone()
        assert row is not None, "Table 'web_ingest_events' must exist in SQLite WAL"

        # Verify insert and read
        evt_id = f"test-ingest-{int(time.time())}"
        cur.execute(
            """
            INSERT INTO web_ingest_events (id, url, title, prompt, response_text, elements_json, tars_commentary, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (evt_id, "https://nexus-os.local", "Test Page", "Summarize core", "Core operational", "[]", "TARS OK", time.time())
        )
        conn.commit()

        cur.execute("SELECT title, tars_commentary FROM web_ingest_events WHERE id = ?;", (evt_id,))
        ingest_row = cur.fetchone()
        assert ingest_row is not None
        assert ingest_row[0] == "Test Page"
        assert ingest_row[1] == "TARS OK"

        # Clean up
        cur.execute("DELETE FROM web_ingest_events WHERE id = ?;", (evt_id,))
        conn.commit()
    finally:
        conn.close()


def test_circuit_02_skills_and_agentshield_audit() -> None:
    """Verifies Circuit 02 AgentShield auditor risk score evaluation and .nxskill importer."""
    test_db = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    importer = SkillMarketplaceImporter(db_path=str(test_db))
    auditor = AgentShieldAuditor(db_path=str(test_db))

    # 1. Audit clean code
    clean_code = "def add(a: int, b: int) -> int:\n    return a + b\n"
    audit_res = auditor.audit_code(clean_code, source_name="test_tool.py")
    assert audit_res["safe"] is True
    assert audit_res["score"] == 100
    assert audit_res["status"] == "CLEAN"

    # 2. Audit malicious code (must flag high risk or quarantined)
    malicious_code = r"import os\nos.system('rm -rf C:\Windows\System32')\n"
    bad_res = auditor.audit_code(malicious_code, source_name="malicious_tool.py")
    assert bad_res["safe"] is False
    assert bad_res["score"] < 90 or bad_res.get("quarantined") is True

    # 3. Installed skills list
    installed = importer.get_installed_skills()
    assert isinstance(installed, list)


def test_circuit_03_persona_telemetry_and_presets() -> None:
    """Verifies Circuit 03 TARS sliders, presets, and 4 voice engines."""
    test_db = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    store = SovereignMemoryStore(db_path=test_db)

    # 1. Update sliders across all 4 parameters
    updated = store.update_persona_settings(
        empathy_pct=75,
        humor_pct=85,
        candor_pct=90,
        verbosity_pct=30,
        voice_engine="kokoro",
        voice_id="af_heart",
        active_preset="TARS_PRIME"
    )
    assert updated["empathy_pct"] == 75
    assert updated["humor_pct"] == 85
    assert updated["candor_pct"] == 90
    assert updated["verbosity_pct"] == 30
    assert updated["voice_engine"] == "kokoro"

    # 2. Verify all 4 required voice engines are supported
    for engine in ["kokoro", "edge_tts", "voxcpm2", "haru_4b"]:
        e_updated = store.update_persona_settings(voice_engine=engine)
        assert e_updated["voice_engine"] == engine

    # 3. Compute prosody from telemetry
    telemetry = PersonaTelemetry(
        empathy_pct=75,
        humor_pct=85,
        candor_pct=90,
        verbosity_pct=30,
        voice_id="af_heart",
        voice_engine="kokoro",
        active_preset="TARS_PRIME"
    )
    prosody = compute_tts_prosody(telemetry)
    assert "kokoro_speed" in prosody or "edge_rate" in prosody
    assert "edge_pitch" in prosody
    assert "warmth_prosody" in prosody


def test_circuit_04_enclave_scopeguard_and_governor() -> None:
    """Verifies Circuit 04 ScopeGuard 6/6 Invariants and WorkspaceGovernor modes."""
    guard = ScopeGuard()

    # 1. 6 Sovereign Invariants check
    assert len(SOVEREIGN_INVARIANTS) == 6
    invariants = [inv if isinstance(inv, str) else inv.name for inv in SOVEREIGN_INVARIANTS]
    assert "NO_SYSTEM32_MODIFICATION" in invariants
    assert "NO_RAW_CREDENTIAL_EXPOSURE" in invariants
    assert "NO_UNAUTHORIZED_NETWORK_LISTENERS" in invariants
    assert "NO_DESTRUCTIVE_FORCE_REBOOT" in invariants
    assert "NO_DPAPI_VAULT_DUMP" in invariants
    assert "REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS" in invariants

    # 2. Path Jail Assertion
    assert guard.validate_path(str(REPO_ROOT), [str(REPO_ROOT)]) is True
    # Denied system path must be rejected
    assert guard.validate_path(r"C:\Windows\System32\cmd.exe", [str(REPO_ROOT)]) is False

    # 3. WorkspaceGovernor modes
    governor = WorkspaceGovernor()
    for mode in ["DEV", "STUDY", "STUDIO", "SILENT"]:
        governor.set_mode(mode)
        assert governor.get_mode() == mode


def test_system_tray_menu_specification_in_electron_main() -> None:
    """Verifies that apps/desktop/src/main/index.ts has the upgraded system tray menu specification."""
    main_index_file = REPO_ROOT / "apps" / "desktop" / "src" / "main" / "index.ts"
    assert main_index_file.exists(), "Electron main entry point not found"
    content = main_index_file.read_text(encoding="utf-8")

    # 1. E-STOP with POST /api/estop
    assert "🛑 TRIGGER E-STOP (Halt All Slices)" in content
    assert "/api/estop" in content

    # 2. Neural Workspace Mode with radio submenu and POST /api/workspace/mode
    assert "⚡ Neural Workspace Mode" in content
    assert "/api/workspace/mode" in content
    assert "'[DEV]'" in content or "\"[DEV]\"" in content or "`[${mode}]`" in content

    # 3. Open Workstation and Toggle Notch HUD (with --no-tray)
    assert "🛸 Open Nexus Workstation" in content
    assert "📌 Toggle Notch HUD" in content
    assert "--no-tray" in content

    # 4. Open Boot & Telemetry Logs
    assert "📋 Open Boot & Telemetry Logs" in content

    # 5. Restart Nexus OS & Quit Nexus OS
    assert "🔄 Restart Nexus OS" in content
    assert "Quit Nexus OS" in content


def test_circuit_drawers_component_architecture() -> None:
    """Verifies that CircuitDrawers.tsx and App.tsx have the 4 living core circuit drawer connections."""
    drawers_file = REPO_ROOT / "apps" / "desktop" / "src" / "renderer" / "src" / "components" / "CircuitDrawers.tsx"
    assert drawers_file.exists(), "CircuitDrawers.tsx not found"
    drawers_content = drawers_file.read_text(encoding="utf-8")

    # Verify all 4 circuits are wired in CircuitDrawers.tsx
    assert "01 // MEMORY FTS5" in drawers_content
    assert "02 // MCP SKILLS & ECC" in drawers_content
    assert "03 // SOUL & PERSONA" in drawers_content
    assert "04 // ENCLAVE & GUARD" in drawers_content

    # Verify real endpoints in CircuitDrawers.tsx
    assert "/api/memory/search" in drawers_content
    assert "/api/memory" in drawers_content
    assert "/api/skills" in drawers_content
    assert "/api/persona" in drawers_content
    assert "/api/security/shield-scan" in drawers_content
    assert "/api/vault/status" in drawers_content
    assert "/api/workspace/mode" in drawers_content

    # Verify App.tsx wires the 4 Bezier conduits to CircuitDrawers
    app_file = REPO_ROOT / "apps" / "desktop" / "src" / "renderer" / "src" / "App.tsx"
    assert app_file.exists(), "App.tsx not found"
    app_content = app_file.read_text(encoding="utf-8")

    assert "CircuitDrawers" in app_content
    assert "CONDUITS" in app_content
    assert "conduit-grad-01" in app_content
    assert "conduit-grad-04" in app_content
    assert "setActiveCircuit" in app_content
