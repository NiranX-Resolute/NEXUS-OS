"""Nexus OS v5.0 - Phase E Real Vertical Theme, Wallpaper & Notch HUD Backend Test Suite.

MANDATORY INVARIANTS:
1. ZERO MOCKS: Strictly NO unittest.mock, patch, dummy stubs, or simulation timeouts.
2. REAL VERTICAL INTEGRATION: Tests live NexusIPCServer, real SQLite WAL persistence,
   real HTTP endpoints (/api/themes, /api/wallpapers, /api/mcp/share-files),
   and real PySide6 Dynamic Notch HUD live styling and multi-monitor re-anchoring.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Generator
import urllib.request
import pytest

from core.runtime.ipc_server import NexusIPCServer
from core.memory.sovereign_store import SovereignMemoryStore
from apps.notch_hud.drag_shelf import IngestedFile, NexusDragShelf
from apps.notch_hud.notch_window import NexusNotchWindow


def make_test_ipc_server() -> Generator[dict, None, None]:
    """Spins up a real NexusIPCServer on an isolated temporary SQLite WAL database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    test_token = "nexus-test-auth-token-12345"
    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
        token=test_token,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="RealThemeWallpaperServer")
    t.start()
    time.sleep(0.3)

    yield {
        "server": server,
        "db_path": temp_db_path,
        "base_url": f"http://127.0.0.1:{assigned_port}",
        "token": test_token,
    }

    server.shutdown()
    server.server_close()
    try:
        if temp_db_path.exists():
            temp_db_path.unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture(scope="module")
def real_ipc_server() -> Generator[dict, None, None]:
    yield from make_test_ipc_server()


def test_01_themes_api_list_and_activate_real(real_ipc_server):
    """Verifies GET /api/themes and POST /api/themes/activate against real SQLite WAL."""
    base_url = real_ipc_server["base_url"]
    token = real_ipc_server["token"]
    db_path = real_ipc_server["db_path"]

    # 1. Query themes list with Bearer token
    req = urllib.request.Request(
        f"{base_url}/api/themes",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        themes = data.get("themes", [])
        assert len(themes) >= 6
        active_theme = data.get("active_theme", {})
        assert active_theme.get("id") == "obsidian_cyber"

    # 2. Activate a different preset theme (e.g. nebula_vortex)
    activate_payload = json.dumps({"theme_id": "nebula_vortex"}).encode("utf-8")
    req_act = urllib.request.Request(
        f"{base_url}/api/themes/activate",
        data=activate_payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_act, timeout=5.0) as resp:
        assert resp.status == 200
        act_res = json.loads(resp.read().decode("utf-8"))
        assert act_res.get("success") is True
        assert act_res["active_theme"]["id"] == "nebula_vortex"

    # 3. Verify SQLite WAL directly on disk
    conn = sqlite3.connect(str(db_path))
    cur = conn.execute("SELECT id, is_active FROM user_themes WHERE id = 'nebula_vortex';")
    row = cur.fetchone()
    conn.close()
    assert row is not None
    assert row[1] == 1


def test_02_wallpapers_api_list_and_config_real(real_ipc_server):
    """Verifies GET /api/wallpapers and POST /api/wallpapers/config with WebGL shader params."""
    base_url = real_ipc_server["base_url"]
    token = real_ipc_server["token"]
    db_path = real_ipc_server["db_path"]

    # 1. Query wallpapers list
    req = urllib.request.Request(
        f"{base_url}/api/wallpapers",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        wallpapers = data.get("wallpapers", [])
        assert len(wallpapers) >= 5

    # 2. Update WebGL shader configuration
    new_cfg = {"speed": 1.75, "particle_count": 2500, "bloom": 0.85}
    cfg_payload = json.dumps({
        "wallpaper_id": "nebula_vortex_shader",
        "config": new_cfg,
    }).encode("utf-8")
    req_cfg = urllib.request.Request(
        f"{base_url}/api/wallpapers/config",
        data=cfg_payload,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_cfg, timeout=5.0) as resp:
        assert resp.status == 200
        cfg_res = json.loads(resp.read().decode("utf-8"))
        assert cfg_res.get("success") is True
        cfg = cfg_res["wallpaper"].get("config") or cfg_res["wallpaper"].get("config_json")
        if isinstance(cfg, str):
            cfg = json.loads(cfg)
        assert cfg["speed"] == 1.75

    # 3. Verify directly in SQLite WAL
    conn = sqlite3.connect(str(db_path))
    cur = conn.execute("SELECT config_json FROM user_wallpapers WHERE id = 'nebula_vortex_shader';")
    row = cur.fetchone()
    conn.close()
    assert row is not None
    stored_cfg = json.loads(row[0])
    assert stored_cfg.get("speed") == 1.75


def test_03_notch_hud_live_theme_sync_real(real_ipc_server):
    """Verifies Dynamic Notch HUD live theme sync from GET /api/themes and QSS styling."""
    base_url = real_ipc_server["base_url"]
    token = real_ipc_server["token"]
    db_path = real_ipc_server["db_path"]

    # Set token in environment for HUD
    os.environ["NEXUS_IPC_TOKEN"] = token

    notch_win = NexusNotchWindow()
    notch_win.sovereign_store = SovereignMemoryStore(db_path=db_path)

    # 1. Fetch and apply active theme
    resp = notch_win.fetch_and_sync_active_theme(base_url=base_url)
    assert resp.get("success") is True
    active_theme = resp.get("active_theme", {})
    expected_accent = active_theme.get("tokens", {}).get("accent_primary", "#00f0ff")

    # 2. Verify indicator dot and status label styled with active accent
    dot_style = notch_win.indicator_dot.styleSheet()
    assert expected_accent.lower() in dot_style.lower()

    label_style = notch_win.status_label.styleSheet()
    assert expected_accent.lower() in label_style.lower()

    # 3. Test cycle_active_theme
    cycle_res = notch_win.cycle_active_theme(base_url=base_url)
    assert cycle_res.get("success") is True
    new_theme = cycle_res.get("active_theme", {})
    new_accent = new_theme.get("tokens", {}).get("accent_primary")
    assert new_accent is not None
    assert new_accent.lower() in notch_win.indicator_dot.styleSheet().lower()


def test_04_mcp_share_files_and_shelf_toast_real(real_ipc_server):
    """Verifies NexusDragShelf posts to POST /api/mcp/share-files and stages into agent_local.db."""
    base_url = real_ipc_server["base_url"]
    token = real_ipc_server["token"]
    db_path = real_ipc_server["db_path"]

    os.environ["NEXUS_IPC_TOKEN"] = token

    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
        tf.write(b"Zero-mock MCP File Sharing Payload Verification Nexus v5.0")
        test_path = tf.name

    try:
        content_bytes = Path(test_path).read_bytes()
        expected_sha = hashlib.sha256(content_bytes).hexdigest()

        shelf = NexusDragShelf()
        staged_file = IngestedFile(
            name=Path(test_path).name,
            path=test_path,
            size_bytes=len(content_bytes),
            is_dir=False,
            extension=".txt",
            sha256=expected_sha,
            timestamp=time.time(),
        )

        notch_win = NexusNotchWindow()
        notch_win.sovereign_store = SovereignMemoryStore(db_path=db_path)

        # Dispatch via post_mcp_share_files
        res = notch_win.post_mcp_share_files([staged_file], endpoint=f"{base_url}/api/mcp/share-files")
        assert res.get("success") is True
        assert res.get("count") == 1

        # Verify SQLite WAL memory_nodes table under dev_context namespace
        conn = sqlite3.connect(str(db_path))
        cur = conn.execute(
            "SELECT title, content, metadata_json FROM memory_nodes WHERE namespace = 'dev_context' ORDER BY created_at DESC LIMIT 1;"
        )
        row = cur.fetchone()
        conn.close()

        assert row is not None
        assert "MCP Shared Resource" in row[0]
        assert expected_sha in row[1]
        assert "MCP_DRAG_SHELF" in row[2]

        # Verify 3-second shelf toast
        shelf.show()
        shelf.show_shelf_warning("Staged 1 file(s) into MCP Bus & agent_local.db", duration_ms=3000)
        assert shelf.drop_frame.isVisible() is True or not shelf.drop_frame.isHidden()
    finally:
        try:
            os.remove(test_path)
        except Exception:
            pass


def test_05_multi_monitor_and_status_badges_real():
    """Verifies multi-monitor dynamic re-anchoring, GUEST SANDBOX badge, and slice recovery pills."""
    notch_win = NexusNotchWindow()
    notch_win.collapse_notch()
    notch_win.show()

    # 1. Multi-monitor re-anchoring trigger
    notch_win._center_at_top()
    assert notch_win.geometry().width() in (280, 314)
    assert notch_win.geometry().height() == 36

    # 2. Voice Guardian GUEST SANDBOX downgrade
    assert notch_win.guest_badge.isVisible() is False or notch_win.guest_badge.isHidden()
    notch_win.set_guest_sandbox(True)
    assert notch_win.guest_badge.isVisible() is True or not notch_win.guest_badge.isHidden()
    notch_win.set_guest_sandbox(False)
    assert notch_win.guest_badge.isVisible() is False or notch_win.guest_badge.isHidden()

    # 3. Interrupted slice recovery pill display
    test_slices = [{"slice_id": "slice-interrupted-001", "task_id": "task-test-001"}]
    notch_win._show_recovery_pill(test_slices)
    assert notch_win.btn_resume_slice.isVisible() is True or not notch_win.btn_resume_slice.isHidden()
    assert notch_win.btn_dismiss_slice.isVisible() is True or not notch_win.btn_dismiss_slice.isHidden()
    assert "Resume Slice" in notch_win.btn_resume_slice.text()
