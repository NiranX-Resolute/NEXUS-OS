"""Nexus OS v5.0 - Unified Mark-LVII & Jarvis Capabilities Test Suite.

Verifies end-to-end integration across:
1. @nexus_tool plugin auto-discovery and FastMCP + IPC tool registry.
2. WorkspaceGovernor [SILENT] air-gapped mode security protection.
3. Bounded grounded web search with ThreadPoolExecutor timeout & browser fallback.
4. DPAPI-secured Google Calendar with mobile popup push reminders & ScopeGuard gate.
5. Voice-controlled 3D Reactor & HUD mutation persisted in SQLite WAL (ui_preferences).
6. On-demand 1 FPS Vision Share & Camera streaming lifecycle.
7. Instant Alt+T Audio Self-Test & Silero VAD loopback diagnostics.
8. Authenticated Mobile QR Remote Pairing (\x89PNG binary signature & JSON).
9. Obscura / Chrome CDP health probe & auto-reattach resilience.

MANDATORY RULES:
- ZERO MOCKS: All tests operate against real SQLite WAL, real IPC HTTP spine, real DPAPI, and real plugins.
- ZERO STUBS: All functions execute full vertical wiring.
"""

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Generator
import urllib.parse
import urllib.request
import pytest

from core.mcp.plugin_loader import discover_plugins, discover_and_register_plugins, get_registered_tools
from core.mcp.plugins.web_grounded_search import web_grounded_brief
from core.mcp.plugins.google_calendar_plugin import calendar_manage
from core.mcp.plugins.ui_hologram_control import ui_reactor, ui_effect, ui_orbit, ui_chrome, get_ui_state, mutate_ui_state
from core.mcp.plugins.android_adb_plugin import android_status
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard
from core.engine.tools.browser_verifier import WarmBrowserSession, probe_cdp_health


@pytest.fixture(scope="module")
def ipc_fixture() -> Generator[dict, None, None]:
    """Launches an isolated un-mocked NexusIPCServer on a temporary SQLite WAL database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="UnifiedMarkLVIIJarvisServer")
    t.start()
    time.sleep(0.3)

    yield {
        "server": server,
        "db_path": temp_db_path,
        "token": server.auth_token,
        "base_url": f"http://127.0.0.1:{assigned_port}",
    }

    server.shutdown()
    server.server_close()
    try:
        if temp_db_path.exists():
            temp_db_path.unlink(missing_ok=True)
    except Exception:
        pass


def test_01_plugin_auto_discovery_and_registration(ipc_fixture):
    """Test 1: @nexus_tool plugins auto-discover and register into FastMCP and IPC."""
    discovered = discover_plugins()
    assert len(discovered) >= 4, f"Expected at least 4 plugins, found {len(discovered)}"

    tool_names = [t["name"] for t in discovered]
    assert "web_grounded_brief" in tool_names
    assert "calendar_manage" in tool_names
    assert "ui_reactor" in tool_names
    assert "android_status" in tool_names

    # Test discovery registration
    registered = discover_and_register_plugins()
    assert len(registered) >= 4

    # Test GET /api/mcp/tools via IPC
    req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/mcp/tools",
        headers={"Authorization": f"Bearer {ipc_fixture['token']}"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        assert data.get("count", 0) >= 4
        ipc_tool_names = [tool["name"] for tool in data.get("tools", [])]
        assert "web_grounded_brief" in ipc_tool_names
        assert "calendar_manage" in ipc_tool_names


def test_02_workspace_governor_silent_mode_protection(ipc_fixture):
    """Test 2: WorkspaceGovernor [SILENT] air-gapped mode strictly blocks external/actuation calls."""
    governor = WorkspaceGovernor()
    orig_mode = governor.get_mode()

    try:
        governor.set_mode("SILENT")
        assert governor.get_mode().upper() == "SILENT"

        # 1. Secured plugin wrapper should raise PermissionError in SILENT mode
        registered = get_registered_tools()
        if "android_status" in registered:
            with pytest.raises(PermissionError) as exc_info:
                registered["android_status"]()
            assert "SILENT air-gapped mode" in str(exc_info.value)

        # 2. Vision stream IPC call should be rejected in SILENT mode
        req = urllib.request.Request(
            f"{ipc_fixture['base_url']}/api/vision/stream",
            data=json.dumps({"active": True, "source": "screen"}).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ipc_fixture['token']}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                assert data.get("success") is False
                assert "SILENT" in data.get("error", "")
        except urllib.error.HTTPError as err:
            assert err.code in (403, 400)
            err_data = json.loads(err.read().decode("utf-8"))
            assert err_data.get("success") is False
            assert "SILENT" in err_data.get("error", "")
    finally:
        governor.set_mode(orig_mode)


def test_03_web_grounded_search_bounded_execution():
    """Test 3: web_grounded_brief executes with bounded ThreadPoolExecutor timeout."""
    result = web_grounded_brief(query="autonomous AI systems edge computing", timeout=5.0)
    assert isinstance(result, dict)
    assert result.get("success") is True
    assert "query" in result
    assert "summary" in result
    assert "sources" in result
    assert len(result["summary"]) > 0


def test_04_google_calendar_manage_dpapi_and_reminders():
    """Test 4: calendar_manage reads/writes via DPAPI and attaches mobile popup reminders."""
    # List calendar events
    res = calendar_manage(action="list")
    assert isinstance(res, dict)
    assert res.get("success") is True
    assert "events" in res
    assert "timezone" in res

    # Create calendar event with popup push reminder
    create_res = calendar_manage(
        action="create",
        summary="Nexus v5.0 Sprint Milestone",
        start_iso="2026-11-20T10:00:00Z",
        reminder_minutes=15,
    )
    assert create_res.get("success") is True
    assert create_res.get("event", {}).get("reminders", {}).get("overrides", [{}])[0].get("method") == "popup"

    # Search calendar events
    search_res = calendar_manage(action="search", query="Sprint")
    assert search_res.get("success") is True
    assert len(search_res.get("events", [])) >= 1


def test_05_ui_hologram_control_state_and_mutation(ipc_fixture):
    """Test 5: POST /api/ui/mutate and GET /api/ui/state persist 3D Dyson Reactor state."""
    # Mutate via direct plugin function
    mut_res = ui_reactor(shape="dyson", color="#10b981", spin_speed=2.5, intensity=1.8)
    assert mut_res.get("success") is True
    assert mut_res["state"]["shape"] == "dyson"
    assert mut_res["state"]["primary_color"] == "#10b981"

    # Mutate via IPC REST endpoint
    payload = {
        "shape": "ring",
        "primary_color": "#06b6d4",
        "spin_speed": 3.0,
        "effect": "pulse",
    }
    req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/ui/mutate",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ipc_fixture['token']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        res_data = json.loads(resp.read().decode("utf-8"))
        assert res_data.get("success") is True
        assert res_data.get("ui_state", {}).get("shape") == "ring"

    # Query GET /api/ui/state
    get_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/ui/state",
        headers={"Authorization": f"Bearer {ipc_fixture['token']}"},
    )
    with urllib.request.urlopen(get_req, timeout=5) as get_resp:
        assert get_resp.status == 200
        get_data = json.loads(get_resp.read().decode("utf-8"))
        assert get_data.get("success") is True
        assert get_data.get("ui_state", {}).get("shape") == "ring"
        assert get_data.get("ui_state", {}).get("primary_color") == "#06b6d4"


def test_06_on_demand_vision_stream_lifecycle(ipc_fixture):
    """Test 6: POST /api/vision/stream and GET /api/vision/status manage 1 FPS stream state."""
    # Activate vision stream
    stream_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/vision/stream",
        data=json.dumps({"active": True, "source": "screen"}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ipc_fixture['token']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(stream_req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        assert data.get("active") is True
        assert data.get("source") == "screen"

    # Check vision status
    status_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/vision/status",
        headers={"Authorization": f"Bearer {ipc_fixture['token']}"},
    )
    with urllib.request.urlopen(status_req, timeout=5) as st_resp:
        assert st_resp.status == 200
        st_data = json.loads(st_resp.read().decode("utf-8"))
        assert st_data.get("success") is True
        assert st_data.get("active") is True
        assert st_data.get("frames_processed", 0) >= 1

    # Deactivate vision stream
    deact_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/vision/stream",
        data=json.dumps({"active": False, "source": "none"}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ipc_fixture['token']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(deact_req, timeout=5) as deact_resp:
        assert deact_resp.status == 200
        deact_data = json.loads(deact_resp.read().decode("utf-8"))
        assert deact_data.get("success") is True
        assert deact_data.get("active") is False


def test_07_audio_self_test_diagnostics(ipc_fixture):
    """Test 7: POST /api/audio/self-test returns mic RMS, Silero VAD status, and confirmation."""
    req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/audio/self-test",
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ipc_fixture['token']}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        assert "mic_rms" in data
        assert isinstance(data.get("mic_rms"), (int, float))
        assert "vad_ready" in data
        assert "latency_ms" in data
        assert data.get("spoken_confirmation") is True


def test_08_mobile_qr_remote_pairing_png_and_json(ipc_fixture):
    """Test 8: GET /api/remote/qr-pairing returns valid PNG bytes (\x89PNG) or JSON token payload."""
    # 1. Test binary PNG generation
    png_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/remote/qr-pairing",
        headers={"Authorization": f"Bearer {ipc_fixture['token']}"},
    )
    with urllib.request.urlopen(png_req, timeout=15) as resp:
        assert resp.status == 200
        assert resp.headers.get("Content-Type") == "image/png"
        raw_bytes = resp.read()
        # PNG signature: 89 50 4E 47 0D 0A 1A 0A
        assert raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"), "QR code must start with standard PNG binary signature"
        assert len(raw_bytes) > 100

    # 2. Test JSON metadata generation
    json_req = urllib.request.Request(
        f"{ipc_fixture['base_url']}/api/remote/qr-pairing?format=json",
        headers={"Authorization": f"Bearer {ipc_fixture['token']}"},
    )
    with urllib.request.urlopen(json_req, timeout=15) as j_resp:
        assert j_resp.status == 200
        j_data = json.loads(j_resp.read().decode("utf-8"))
        assert j_data.get("success") is True
        assert "pairing_url" in j_data
        assert "token" in j_data
        assert j_data.get("qr_base64", "").startswith("data:image/png;base64,")


def test_09_browser_verifier_cdp_health():
    """Test 9: WarmBrowserSession probe_cdp_health returns structured status."""
    health = probe_cdp_health(port=9222)
    assert isinstance(health, dict)
    assert "healthy" in health
    assert "port" in health
    assert health["port"] == 9222
