"""Nexus OS v5.0 - Sprint 1 End-to-End Real Vertical Wiring Test Suite.

MANDATORY SPECIFICATIONS:
1. ZERO MOCKS: Strictly NO unittest.mock, patch, or dummy stubs.
2. FULL VERTICAL WIRING: Tests real NexusIPCServer, real SQLite WAL persistence,
   real Win32/subprocesses, real Git status, ScopeGuard containment,
   and Notch HUD drag-shelf MCP signal sharing.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from typing import Generator
import urllib.parse
import urllib.request
import pytest

from core.runtime.ipc_server import NexusIPCServer
from core.memory.sovereign_store import SovereignMemoryStore
from apps.notch_hud.drag_shelf import IngestedFile, NexusDragShelf
from apps.notch_hud.notch_window import NexusNotchWindow


def make_live_sprint1_server() -> Generator[dict, None, None]:
    """Spins up a real, un-mocked NexusIPCServer on an isolated test SQLite WAL database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="Sprint1LiveServer")
    t.start()
    time.sleep(0.3)

    yield {
        "server": server,
        "db_path": temp_db_path,
        "base_url": f"http://127.0.0.1:{assigned_port}",
    }

    server.shutdown()
    server.server_close()
    try:
        if temp_db_path.exists():
            temp_db_path.unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture(scope="module")
def live_sprint1_server() -> Generator[dict, None, None]:
    yield from make_live_sprint1_server()


def test_01_tasks_and_telemetry_live_sqlite(live_sprint1_server):
    """Verifies that real tasks and telemetry logs are written to SQLite WAL and retrieved via IPC."""
    base_url = live_sprint1_server["base_url"]
    db_path = live_sprint1_server["db_path"]

    # 1. Post a new real task
    task_payload = json.dumps({
        "prompt": "Verify zero-mock Three.js and PySide6 integration",
        "command_type": "CORE",
        "source_device": "COMMAND_CENTER",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/api/tasks",
        data=task_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 201
        res = json.loads(resp.read().decode("utf-8"))
        assert res.get("success") is True
        task_id = res["task"]["id"]
        assert task_id.startswith("task-")

    # Verify task directly in SQLite WAL file on disk
    conn = sqlite3.connect(str(db_path))
    cur = conn.execute("SELECT prompt_raw, status, command_type FROM tasks WHERE id = ?;", (task_id,))
    row = cur.fetchone()
    conn.close()
    assert row is not None
    assert row[0] == "Verify zero-mock Three.js and PySide6 integration"
    assert row[1] == "QUEUED"
    assert row[2] == "CORE"

    # 2. Query /api/tasks via HTTP GET
    with urllib.request.urlopen(f"{base_url}/api/tasks?limit=10", timeout=5.0) as resp:
        assert resp.status == 200
        get_res = json.loads(resp.read().decode("utf-8"))
        tasks = get_res.get("tasks", [])
        assert any(t["id"] == task_id for t in tasks)

    # 3. Trigger an action to generate telemetry log in SQLite
    action_payload = json.dumps({"action": "MUTE_AUDIO", "payload": {}}).encode("utf-8")
    req_act = urllib.request.Request(
        f"{base_url}/api/action",
        data=action_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_act, timeout=5.0) as resp:
        assert resp.status == 200

    # 4. Query /api/telemetry/logs via HTTP GET
    with urllib.request.urlopen(f"{base_url}/api/telemetry/logs?limit=10", timeout=5.0) as resp:
        assert resp.status == 200
        log_res = json.loads(resp.read().decode("utf-8"))
        logs = log_res.get("logs", [])
        assert len(logs) > 0
        assert any("Executed action MUTE_AUDIO" in l.get("message", "") for l in logs)


def test_02_filesystem_and_git_status(live_sprint1_server):
    """Verifies ScopeGuard protected workspace tree, read/write, and live Git status."""
    base_url = live_sprint1_server["base_url"]

    # 1. Test live Git Status
    with urllib.request.urlopen(f"{base_url}/api/git/status", timeout=45.0) as resp:
        assert resp.status == 200
        git_data = json.loads(resp.read().decode("utf-8"))
        assert git_data.get("success") is True
        assert isinstance(git_data.get("branch"), str)
        assert isinstance(git_data.get("staged_count"), int)
        assert isinstance(git_data.get("total_changes"), int)

    # 2. Test live Filesystem Tree
    with urllib.request.urlopen(f"{base_url}/api/fs/tree", timeout=15.0) as resp:
        assert resp.status == 200
        fs_data = json.loads(resp.read().decode("utf-8"))
        assert fs_data.get("success") is True
        files = fs_data.get("files", [])
        assert len(files) > 0
        file_paths = [f["path"] for f in files]
        # Should contain top-level repo files like README or package.json
        assert any("package.json" in p or "README" in p or "AGENTS.md" in p for p in file_paths)

    # 3. Test Filesystem Read
    test_read_path = "package.json" if any("package.json" in p for p in file_paths) else file_paths[0]
    with urllib.request.urlopen(f"{base_url}/api/fs/read?path={urllib.parse.quote(test_read_path)}", timeout=15.0) as resp:
        assert resp.status == 200
        read_res = json.loads(resp.read().decode("utf-8"))
        assert read_res.get("success") is True
        assert len(read_res.get("content", "")) > 0


def test_03_real_exec_verify(live_sprint1_server):
    """Verifies that /api/exec/verify runs authentic subprocess verification without mocks."""
    base_url = live_sprint1_server["base_url"]

    # Execute git --version as an authentic verified subprocess check
    payload = json.dumps({"command": "git --version"}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/exec/verify",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10.0) as resp:
        assert resp.status == 200
        res = json.loads(resp.read().decode("utf-8"))
        assert res.get("success") is True
        assert res.get("exit_code") == 0
        assert "git version" in res.get("stdout", "").lower()
        assert res.get("duration_ms") > 0


def test_04_scholar_search_synthesis_and_persistence(live_sprint1_server):
    """Verifies Scholar live search, LLM synthesis router, and SQLite WAL research notes."""
    base_url = live_sprint1_server["base_url"]
    db_path = live_sprint1_server["db_path"]

    # 1. Live scholar search
    with urllib.request.urlopen(f"{base_url}/api/scholar/search?q=agents&limit=5", timeout=25.0) as resp:
        assert resp.status == 200
        search_res = json.loads(resp.read().decode("utf-8"))
        assert search_res.get("success") is True
        results = search_res.get("results", [])
        assert len(results) > 0
        assert "title" in results[0]
        assert "authors" in results[0]

    # 2. Scholar LLM synthesis endpoint
    synth_payload = json.dumps({
        "topic": "Autonomous Zero-Cost LLM Cascades",
        "notes": "Testing multi-tier fallback with zero mock boundaries.",
    }).encode("utf-8")
    req_synth = urllib.request.Request(
        f"{base_url}/api/scholar/synthesize",
        data=synth_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_synth, timeout=25.0) as resp:
        assert resp.status == 200
        synth_res = json.loads(resp.read().decode("utf-8"))
        assert synth_res.get("success") is True
        assert len(synth_res.get("synthesis", "")) > 20
        assert "Executive Summary" in synth_res.get("synthesis", "")

    # 3. Persistent Research Notes in SQLite WAL
    note_payload = json.dumps({
        "title": "Autonomous Research Notes - Verified",
        "content": "Sprint 1 research notes successfully verified against real SQLite WAL.",
        "namespace": "scholar_context",
    }).encode("utf-8")
    req_mem = urllib.request.Request(
        f"{base_url}/api/memory",
        data=note_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req_mem, timeout=5.0) as resp:
        assert resp.status == 201

    # Verify retrieval from /api/memory?namespace=scholar_context
    with urllib.request.urlopen(f"{base_url}/api/memory?namespace=scholar_context&limit=10", timeout=5.0) as resp:
        assert resp.status == 200
        mem_res = json.loads(resp.read().decode("utf-8"))
        memories = mem_res.get("memories", [])
        assert len(memories) > 0
        assert any("Autonomous Research Notes" in m.get("title", "") for m in memories)


def test_05_notch_hud_mcp_share_to_sovereign_store(live_sprint1_server):
    """Verifies that NexusDragShelf.mcp_share_requested stores SHA-256 metadata in SovereignMemoryStore."""
    db_path = live_sprint1_server["db_path"]

    # Create temporary real test file to ingest
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
        tf.write(b"Production MCP payload sharing test - Nexus OS v5.0")
        test_file_path = tf.name

    try:
        content_bytes = Path(test_file_path).read_bytes()
        expected_sha = hashlib.sha256(content_bytes).hexdigest()

        # Instantiate Notch Window backed by test database
        notch_win = NexusNotchWindow()
        notch_win.sovereign_store = SovereignMemoryStore(db_path=db_path)

        staged_file = IngestedFile(
            name=Path(test_file_path).name,
            path=test_file_path,
            size_bytes=len(content_bytes),
            is_dir=False,
            extension=".txt",
            sha256=expected_sha,
            timestamp=time.time(),
        )

        # Trigger slot handler directly or via signal
        notch_win._on_shelf_mcp_share_requested([staged_file])

        # Assert memory was written to SQLite WAL in dev_context namespace
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
    finally:
        try:
            os.remove(test_file_path)
        except Exception:
            pass
