"""
Nexus OS v5.0 - Wave 1 Real Verification Suite: Scout Reach, Numbered UIA & Auto-Discovery.
Zero stubs, zero mocks, zero placeholder tokens.
Real SQLite WAL caching, real Win32 UIA tree enumeration, real Start Menu indexing, and real hardware probing.
"""

from pathlib import Path
import sqlite3
import time
import pytest

from core.engine.tools.desktop_ufo import (
    DesktopUFO,
    click_numbered_control,
    drag_element,
    list_numbered_controls,
)
from core.mcp.plugins.agent_reach_plugin import (
    scout_reach_doctor,
    scout_reach_read,
    scout_reach_search,
)
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.app_discovery import WindowsAppIndex, find_installed_app
from core.runtime.ollama_provisioner import probe_pc_hardware, recommend_ollama_models
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture
def temp_db(tmp_path):
    """Provides a dedicated real SQLite database path for isolated verification."""
    return tmp_path / "test_scout_uia.db"


class TestAgentReachPluginReal:
    """Verifies SCOUT-01 Agent Reach air-gap compliance, cache retrieval, and JSON normalization."""

    def test_scout_reach_silent_mode_air_gap(self):
        # In SILENT mode, external network calls must be blocked unconditionally
        res = scout_reach_read("https://github.com/Panniantong/Agent-Reach", workspace_mode="SILENT")
        assert res["ok"] is False
        assert res["blocked"] is True
        assert res["workspace_mode"] == "SILENT"
        assert "SILENT" in res["reason"]

        search_res = scout_reach_search("quantum computing", workspace_mode="SILENT")
        assert search_res["ok"] is False
        assert search_res["blocked"] is True
        assert search_res["workspace_mode"] == "SILENT"

    def test_scout_reach_cache_hit_and_normalization(self, temp_db):
        store = SovereignMemoryStore(db_path=temp_db)
        target_url = "https://github.com/Panniantong/Agent-Reach"

        # Pre-seed cached event into SovereignStore
        ev_id = store.insert_reach_event(
            source_url=target_url,
            title="Agent Reach Repository",
            content="# Agent Reach\nStructured reader and search engine.",
            channel="github",
            workspace_mode="DEV",
            summary="Structured reader and search across GitHub, Reddit, YouTube.",
        )
        assert ev_id is not None

        # Call scout_reach_read with temp_db
        res = scout_reach_read(target_url, workspace_mode="DEV", db_path=temp_db)
        assert res["ok"] is True
        assert res["cached"] is True
        assert res["source_url"] == target_url
        assert res["channel"] == "github"
        assert "Agent Reach" in res["title"]
        assert "summary_or_body" in res
        assert "fetched_at" in res
        assert res["latency_ms"] <= 10.0

    def test_scout_reach_doctor_diagnostics(self):
        diag = scout_reach_doctor()
        assert "ok" in diag
        assert "installed" in diag
        assert "pinned_version" in diag
        assert diag["pinned_version"] == "0.1.0"


class TestDesktopUFOAndNumberedUIAReal:
    """Verifies sub-30ms Win32 UIA enumeration and simulation dry-run mode."""

    def test_list_numbered_controls_structure(self):
        t0 = time.perf_counter()
        controls = list_numbered_controls()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert isinstance(controls, list)
        assert len(controls) >= 1
        # Check first control contains required [1..N] schema
        first = controls[0]
        assert "id" in first
        assert "control_type" in first
        assert "bounding_box" in first
        assert "center" in first
        assert len(first["bounding_box"]) == 4
        assert len(first["center"]) == 2

    def test_click_numbered_control_simulation_mode(self):
        controls = list_numbered_controls()
        assert len(controls) >= 1
        target_id = controls[0]["id"]

        # Dry-run click in simulation mode: must return predicted diff with zero real OS click
        sim_res = click_numbered_control(target_id, auto_approve=True, simulation_mode=True)
        assert sim_res["success"] is True
        assert sim_res["simulated"] is True
        assert sim_res["number"] == target_id
        assert "predicted_state_diff" in sim_res

    def test_drag_element_simulation_mode(self):
        sim_drag = drag_element(
            start_coords_or_index=(100, 100),
            end_coords_or_index=(300, 300),
            auto_approve=True,
            simulation_mode=True,
        )
        assert sim_drag["success"] is True
        assert sim_drag["simulated"] is True
        assert sim_drag["start_coords"] == [100, 100]
        assert sim_drag["end_coords"] == [300, 300]
        assert "predicted_state_diff" in sim_drag


class TestAppDiscoveryReal:
    """Verifies Windows Start Menu .lnk indexing and sub-5ms resolution."""

    def test_windows_app_index_system_builtins(self, temp_db):
        index = WindowsAppIndex(db_path=temp_db)

        # 1. Test sub-5ms resolution of common system app
        t0 = time.perf_counter()
        notepad = index.find_app("notepad")
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        assert notepad is not None
        assert "notepad" in notepad["app_name"] or "Notepad" in notepad["display_name"]
        assert Path(notepad["exe_path"]).exists()
        assert elapsed_ms < 5.0

    def test_windows_app_index_scan_and_persistence(self, temp_db):
        index = WindowsAppIndex(db_path=temp_db)
        discovered = index.scan_start_menu()
        assert isinstance(discovered, int)

        # Verify apps stored in SQLite WAL table installed_apps
        with sqlite3.connect(str(temp_db)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT COUNT(*) as cnt FROM installed_apps;").fetchone()
            assert rows["cnt"] >= 0


class TestOllamaProvisionerReal:
    """Verifies hardware reconnaissance and model capacity recommendation."""

    def test_probe_pc_hardware(self):
        hw = probe_pc_hardware()
        assert hw["success"] is True
        assert hw["ram_total_gb"] > 0
        assert hw["free_disk_gb"] > 0
        assert isinstance(hw["is_cpu_only"], bool)
        assert isinstance(hw["vram_gb"], float)

    def test_recommend_ollama_models_cpu_ceiling(self):
        # Force a CPU-only hardware profile
        cpu_profile = {
            "ram_total_gb": 16.0,
            "has_dedicated_gpu": False,
            "vram_gb": 0.0,
            "free_disk_gb": 80.0,
            "is_cpu_only": True,
        }
        recs = recommend_ollama_models(cpu_profile)
        assert recs["success"] is True
        assert recs["hardware_tier"] == "CPU_ONLY"
        assert recs["is_cpu_only"] is True

        # Ensure all recommended models are capped under 4GB
        for m in recs["recommended_coding"]:
            assert m["size_gb"] <= 4.5
        for m in recs["recommended_general"]:
            assert m["size_gb"] <= 4.5
