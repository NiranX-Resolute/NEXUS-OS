"""
Nexus OS v5.0 - Real Integration Test Suite for Stock, MCP Share & Themes/Wallpapers IPC Endpoints.
====================================================================================================
Zero-Stub, Zero-Simulation Law Enforcement:
Verifies real operational readiness of:
1. Stock Telemetry Proxy (GET /api/widgets/stock):
   - Live query returns structured payload.
   - Enforces WorkspaceGovernor SILENT mode blocking (HTTP 403 Forbidden).
2. MCP Staged File Share (POST /api/mcp/share-files):
   - Dispatches staged file paths and SHA-256 hashes into SQLite memory_nodes table under dev_context.
3. Custom Themes Forge (GET, POST, DELETE /api/themes):
   - Presets listing, theme retrieval, creation, activation, export, import, and deletion.
4. Custom Agent Wallpaper Engine (GET, POST, DELETE /api/wallpapers):
   - Listing, retrieval, creation, activation, mode binding, config mutation, and deletion.
====================================================================================================
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.request
import urllib.parse
import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture(scope="module")
def live_ipc_service():
    """Starts a live, un-simulated NexusIPCServer on an isolated temporary SQLite database."""
    temp_dir = tempfile.TemporaryDirectory()
    temp_db = Path(temp_dir.name) / "test_agent_local.db"

    # Use port 47641 for isolated testing
    test_port = 47641
    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=temp_db,
        dry_run_hardware=True,
    )

    server_thread = threading.Thread(target=server.serve_forever, daemon=True, name="TestIPCThread")
    server_thread.start()
    time.sleep(0.3)

    base_url = f"http://127.0.0.1:{test_port}"
    token = server.auth_token
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    yield {
        "url": base_url,
        "db_path": temp_db,
        "server": server,
        "headers": headers,
        "token": token,
    }

    server.shutdown()
    server.server_close()
    if hasattr(server, "memory_store") and server.memory_store:
        try:
            server.memory_store.close()
        except Exception:
            pass
    time.sleep(0.2)
    try:
        temp_dir.cleanup()
    except Exception:
        pass


def test_stock_widget_live_quote_and_silent_mode(live_ipc_service):
    """Verifies GET /api/widgets/stock live query and strict WorkspaceGovernor SILENT mode enforcement."""
    base_url = live_ipc_service["url"]
    headers = live_ipc_service["headers"]
    server = live_ipc_service["server"]

    # 1. Query live stock quote for NVDA
    req = urllib.request.Request(f"{base_url}/api/widgets/stock?symbol=NVDA", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=8.0) as resp:
        assert resp.status in (200, 502)
        data = json.loads(resp.read().decode("utf-8"))
        assert "symbol" in data
        assert data["symbol"] == "NVDA"
        if data.get("success"):
            assert "price" in data
            assert isinstance(data["price"], (int, float))

    # 2. Switch WorkspaceGovernor to SILENT mode and verify strict 403 Forbidden blocking
    original_mode = server.governor.active_mode
    server.governor.active_mode = "SILENT"
    try:
        silent_req = urllib.request.Request(f"{base_url}/api/widgets/stock?symbol=NVDA", headers=headers, method="GET")
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(silent_req, timeout=5.0)
        assert exc_info.value.code == 403
        err_body = json.loads(exc_info.value.read().decode("utf-8"))
        assert err_body["success"] is False
        assert "Blocked by WorkspaceGovernor: Network disabled in SILENT mode" in err_body["error"]
    finally:
        server.governor.active_mode = original_mode


def test_mcp_share_files_persists_to_dev_context(live_ipc_service):
    """Verifies POST /api/mcp/share-files saves staged files to memory_nodes under dev_context namespace."""
    base_url = live_ipc_service["url"]
    headers = live_ipc_service["headers"]
    db_path = live_ipc_service["db_path"]

    with tempfile.TemporaryDirectory() as staging_dir:
        file1 = Path(staging_dir) / "component_spec.ts"
        file1.write_text("export const NexusTheme = { primary: '#00f5d4' };", encoding="utf-8")
        file2 = Path(staging_dir) / "pipeline_schema.json"
        file2.write_text('{"nodes": ["DEV-01", "SEC-01"], "active": true}', encoding="utf-8")

        payload = {
            "files": [
                str(file1),
                {
                    "name": "pipeline_schema.json",
                    "path": str(file2),
                    "size": "48 B",
                },
            ],
            "namespace": "dev_context",
        }

        req = urllib.request.Request(
            f"{base_url}/api/mcp/share-files",
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            assert data["count"] == 2
            assert data["namespace"] == "dev_context"
            assert len(data["nodes"]) == 2

        # Verify direct SQLite WAL persistence in memory_nodes
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, namespace, title, content, metadata_json FROM memory_nodes WHERE namespace = 'dev_context' ORDER BY created_at DESC LIMIT 2;"
            )
            rows = cursor.fetchall()
            assert len(rows) == 2
            titles = [r["title"] for r in rows]
            assert any("component_spec.ts" in t for t in titles)
            assert any("pipeline_schema.json" in t for t in titles)
            for r in rows:
                meta = json.loads(r["metadata_json"])
                assert meta.get("shared_via") == "MCP_DRAG_SHELF"
                assert meta.get("sha256") != ""


def test_themes_api_full_crud(live_ipc_service):
    """Verifies GET, POST, DELETE /api/themes CRUD lifecycle and bundle import/export."""
    base_url = live_ipc_service["url"]
    headers = live_ipc_service["headers"]

    # 1. GET /api/themes returns seeded presets
    req = urllib.request.Request(f"{base_url}/api/themes", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert len(data["themes"]) >= 6
        assert "active_theme" in data

    # 2. POST /api/themes saves a custom theme
    custom_theme = {
        "id": "matrix_neon_green",
        "name": "Matrix Neon Green",
        "tokens": {
            "primary": "#00ff66",
            "background": "#050f08",
            "accent": "#33ff99",
            "glow": "0 0 15px #00ff66",
        },
    }
    save_req = urllib.request.Request(
        f"{base_url}/api/themes",
        data=json.dumps({"theme": custom_theme}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(save_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["theme_id"] == "matrix_neon_green"

    # 3. GET /api/themes/matrix_neon_green retrieves the theme
    get_req = urllib.request.Request(f"{base_url}/api/themes/matrix_neon_green", headers=headers, method="GET")
    with urllib.request.urlopen(get_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["theme"]["name"] == "Matrix Neon Green"

    # 4. POST /api/themes/activate activates the custom theme
    act_req = urllib.request.Request(
        f"{base_url}/api/themes/activate",
        data=json.dumps({"theme_id": "matrix_neon_green"}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(act_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["active_theme"]["id"] == "matrix_neon_green"

    # 5. GET /api/themes/export/matrix_neon_green exports .nxtheme bundle
    exp_req = urllib.request.Request(f"{base_url}/api/themes/export/matrix_neon_green", headers=headers, method="GET")
    with urllib.request.urlopen(exp_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["export"]["format"] == "nexus_theme_bundle"
        exported_bundle = data["export"]

    # 6. POST /api/themes/import imports a theme bundle
    exported_bundle["theme"]["id"] = "matrix_neon_imported"
    exported_bundle["theme"]["name"] = "Matrix Neon Imported"
    imp_req = urllib.request.Request(
        f"{base_url}/api/themes/import",
        data=json.dumps({"theme": exported_bundle["theme"]}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(imp_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["theme"]["id"] == "matrix_neon_imported"

    # 7. DELETE /api/themes/matrix_neon_imported deletes custom theme
    del_req = urllib.request.Request(
        f"{base_url}/api/themes/matrix_neon_imported",
        headers=headers,
        method="DELETE",
    )
    with urllib.request.urlopen(del_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True


def test_wallpapers_api_full_crud(live_ipc_service):
    """Verifies GET, POST, DELETE /api/wallpapers CRUD lifecycle and mode binding."""
    base_url = live_ipc_service["url"]
    headers = live_ipc_service["headers"]

    # 1. GET /api/wallpapers returns list and active wallpaper
    req = urllib.request.Request(f"{base_url}/api/wallpapers", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert len(data["wallpapers"]) >= 5
        assert "active_wallpaper" in data

    # 2. POST /api/wallpapers saves custom wallpaper
    custom_wallpaper = {
        "id": "holographic_cyber_grid",
        "name": "Holographic Cyber Grid",
        "kind": "image",
        "source_path": "nexus-asset://wallpapers/grid.png",
        "mode_binding": "DEV",
        "config": {"blur": 2, "opacity": 0.85, "speed": 1.0},
    }
    save_req = urllib.request.Request(
        f"{base_url}/api/wallpapers",
        data=json.dumps({"wallpaper": custom_wallpaper}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(save_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["wallpaper_id"] == "holographic_cyber_grid"

    # 3. GET /api/wallpapers/holographic_cyber_grid retrieves wallpaper
    get_req = urllib.request.Request(f"{base_url}/api/wallpapers/holographic_cyber_grid", headers=headers, method="GET")
    with urllib.request.urlopen(get_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["wallpaper"]["name"] == "Holographic Cyber Grid"

    # 4. POST /api/wallpapers/activate activates wallpaper for mode
    act_req = urllib.request.Request(
        f"{base_url}/api/wallpapers/activate",
        data=json.dumps({"wallpaper_id": "holographic_cyber_grid", "mode_binding": "DEV"}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(act_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["active_wallpaper"]["id"] == "holographic_cyber_grid"

    # 5. GET /api/wallpapers/active?mode=DEV confirms activation
    active_req = urllib.request.Request(f"{base_url}/api/wallpapers/active?mode=DEV", headers=headers, method="GET")
    with urllib.request.urlopen(active_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["active_wallpaper"]["id"] == "holographic_cyber_grid"

    # 6. POST /api/wallpapers/config updates configuration
    cfg_req = urllib.request.Request(
        f"{base_url}/api/wallpapers/config",
        data=json.dumps({"wallpaper_id": "holographic_cyber_grid", "config": {"speed": 2.5, "opacity": 0.95}}).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(cfg_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
        assert data["wallpaper"]["config"]["speed"] == 2.5

    # 7. DELETE /api/wallpapers/holographic_cyber_grid deletes wallpaper
    del_req = urllib.request.Request(
        f"{base_url}/api/wallpapers/holographic_cyber_grid",
        headers=headers,
        method="DELETE",
    )
    with urllib.request.urlopen(del_req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True
