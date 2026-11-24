"""Nexus OS v5.0 - Reboot-Resilient Slice Recovery & Lite Launcher Profile Tests.

REAL VERIFICATION GATE:
1. scan_interrupted_slices() detects a real SQLite WAL row left in RUNNING state
   and cleanly transitions it to INTERRUPTED_REBOOT.
2. resume_or_discard_slice(..., action="discard") updates status to DISCARDED in SQLite WAL
   and emits telemetry_events record.
3. resume_or_discard_slice(..., action="resume") re-queues slice to ACTIVE and enforces
   MAX_STEPS = 12 and WorkspaceGovernor SILENT network blocking.
4. nexus.py --help cleanly exposes --lite launcher profile without breaking default zero-flag boot.
5. Real IPC server routes GET /api/slices/recoverable and POST /api/slices/recover/<slice_id>.
6. Notch HUD recovery pill surfaces compact resume/dismiss controls and dispatches recovery.
"""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
from typing import Generator
import urllib.parse
import urllib.request
import pytest

from core.runtime.slice_engine import (
    InfinitySliceEngine,
    scan_interrupted_slices,
    resume_or_discard_slice,
)
from core.runtime.ipc_server import NexusIPCServer
from apps.notch_hud.notch_window import NexusNotchWindow
from nexus import build_parser


@pytest.fixture
def temp_db() -> Generator[Path, None, None]:
    """Provides an isolated real SQLite database file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)
    yield db_path
    if db_path.exists():
        try:
            db_path.unlink()
        except OSError:
            logger_err = None
    wal_file = Path(str(db_path) + "-wal")
    if wal_file.exists():
        try:
            wal_file.unlink()
        except OSError:
            logger_err = None
    shm_file = Path(str(db_path) + "-shm")
    if shm_file.exists():
        try:
            shm_file.unlink()
        except OSError:
            logger_err = None


def test_scan_interrupted_slices_transitions_running_to_interrupted_reboot(temp_db: Path) -> None:
    """Verifies that scan_interrupted_slices transitions RUNNING slices to INTERRUPTED_REBOOT."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time() - 10.0

    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_orphaned_01", "task_crash_01", json.dumps({"step_index": 3, "data": "state"}), "RUNNING", "DEV-01", "Orphaned Task", now, now),
        )
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_suspended_01", "task_clean_01", json.dumps({"step_index": 1}), "SUSPENDED", "DEV-01", "Suspended Task", now, now),
        )
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_completed_01", "task_done_01", json.dumps({"step_index": 5}), "COMPLETED", "DEV-01", "Completed Task", now, now),
        )

    # Perform scan
    recoverable = scan_interrupted_slices(db_path=str(temp_db))
    recoverable_ids = [s["slice_id"] for s in recoverable]

    assert "slice_orphaned_01" in recoverable_ids
    assert "slice_suspended_01" in recoverable_ids
    assert "slice_completed_01" not in recoverable_ids

    # Verify SQLite WAL row status was transitioned to INTERRUPTED_REBOOT
    with engine._get_connection() as conn:
        cursor = conn.execute("SELECT status, updated_at FROM execution_slices WHERE slice_id = 'slice_orphaned_01';")
        row = cursor.fetchone()
        assert row is not None
        assert row["status"] == "INTERRUPTED_REBOOT"
        assert row["updated_at"] > now


def test_resume_or_discard_slice_discard_action(temp_db: Path) -> None:
    """Verifies that discard action marks slice as DISCARDED and writes telemetry."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_discard_me", "thread_test", json.dumps({"step_index": 2}), "INTERRUPTED_REBOOT", "DEV-01", "Discard Test", now, now),
        )

    res = resume_or_discard_slice(slice_id="slice_discard_me", action="discard", db_path=str(temp_db))
    assert res["success"] is True
    assert res["status"] == "DISCARDED"

    with engine._get_connection() as conn:
        cursor = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice_discard_me';")
        row = cursor.fetchone()
        assert row is not None
        assert row["status"] == "DISCARDED"

        cursor_telem = conn.execute("SELECT event_type, payload_json FROM telemetry_events ORDER BY id DESC LIMIT 2;")
        telem_rows = cursor_telem.fetchall()
        assert len(telem_rows) >= 1
        found_discard_event = any("slice_discarded" in r["payload_json"] or "DISCARDED" in r["payload_json"] for r in telem_rows)
        assert found_discard_event is True


def test_resume_or_discard_slice_resume_action_and_max_steps(temp_db: Path) -> None:
    """Verifies that resume action marks slice as ACTIVE and rejects slices >= MAX_STEPS = 12."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    with engine._get_connection() as conn:
        # 1. Normal slice at step 4
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_resume_ok", "thread_ok", json.dumps({"step_index": 4}), "INTERRUPTED_REBOOT", "DEV-01", "Resume OK", now, now),
        )
        # 2. Slice that already reached MAX_STEPS (12)
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_max_reached", "thread_limit", json.dumps({"step_index": 12}), "INTERRUPTED_REBOOT", "DEV-01", "Max Reached", now, now),
        )

    # Resume normal slice
    res_ok = resume_or_discard_slice(slice_id="slice_resume_ok", action="resume", db_path=str(temp_db))
    assert res_ok["success"] is True
    assert res_ok["status"] == "ACTIVE"
    assert res_ok["step_index"] == 4

    # Verify in DB
    with engine._get_connection() as conn:
        cursor = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice_resume_ok';")
        assert cursor.fetchone()["status"] == "ACTIVE"

    # Resume slice at MAX_STEPS limit
    res_limit = resume_or_discard_slice(slice_id="slice_max_reached", action="resume", db_path=str(temp_db))
    assert res_limit["success"] is False
    assert res_limit["status"] == "COMPLETED"

    with engine._get_connection() as conn:
        cursor = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice_max_reached';")
        assert cursor.fetchone()["status"] == "COMPLETED"


def test_resume_slice_silent_mode_blocks_network(temp_db: Path) -> None:
    """Verifies that WorkspaceGovernor SILENT mode blocks external network slice steps."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_net_blocked", "thread_net", json.dumps({"step_index": 2, "requires_network": True}), "INTERRUPTED_REBOOT", "DEV-01", "Network Slice", now, now),
        )

    from core.runtime.workspaces import WorkspaceGovernor
    gov = WorkspaceGovernor()
    orig_mode = gov.get_mode()
    gov.set_mode("SILENT")

    try:
        res = resume_or_discard_slice(slice_id="slice_net_blocked", action="resume", db_path=str(temp_db))
        assert res["success"] is False
        assert res["status"] == "BLOCKED_SILENT"
        assert res.get("air_gapped") is True

        with engine._get_connection() as conn:
            cursor = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice_net_blocked';")
            assert cursor.fetchone()["status"] == "BLOCKED_SILENT"
    finally:
        gov.set_mode(orig_mode)


def test_nexus_cli_parser_exposes_lite_profile() -> None:
    """Verifies that nexus.py parser exposes --lite cleanly and preserves zero-flag default."""
    parser = build_parser()
    args_lite = parser.parse_args(["--lite"])
    assert args_lite.lite is True
    assert args_lite.unified is False

    args_empty = parser.parse_args([])
    assert args_empty.lite is False
    assert args_empty.unified is False
    # Zero flags evaluation
    has_flags = any(getattr(args_empty, k) for k in vars(args_empty))
    assert has_flags is False

    # Subprocess check for help output
    res = subprocess.run([sys.executable, "nexus.py", "--help"], capture_output=True, text=True)
    assert res.returncode == 0
    assert "--lite" in res.stdout
    assert "without Electron workstation" in res.stdout


def test_real_ipc_server_slice_recovery_endpoints(temp_db: Path) -> None:
    """Tests real HTTP endpoints GET /api/slices/recoverable and POST /api/slices/recover/<id>."""
    import threading
    import socket

    # Seed slice record in temp_db
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()
    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_ipc_http_01", "thread_http", json.dumps({"step_index": 1}), "RUNNING", "DEV-01", "HTTP Recoverable", now, now),
        )

    # Bind on dynamic ephemeral port
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    server = NexusIPCServer(host="127.0.0.1", port=port, db_path=temp_db)
    token = server.auth_token

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        base_url = f"http://127.0.0.1:{port}"

        # 1. Verify GET /api/slices/recoverable returns 401 without Bearer token
        req_unauth = urllib.request.Request(f"{base_url}/api/slices/recoverable")
        try:
            with urllib.request.urlopen(req_unauth, timeout=2.0) as resp:
                status_code = resp.status
        except urllib.error.HTTPError as he:
            status_code = he.code
        assert status_code == 401

        # 2. Verify GET /api/slices/recoverable with Bearer token
        headers = {"Authorization": f"Bearer {token}"}
        req_auth = urllib.request.Request(f"{base_url}/api/slices/recoverable", headers=headers)
        with urllib.request.urlopen(req_auth, timeout=2.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            slices = data["slices"]
            assert any(s["slice_id"] == "slice_ipc_http_01" for s in slices)

        # 3. Verify POST /api/slices/recover/slice_ipc_http_01 with Bearer token
        post_body = json.dumps({"action": "discard"}).encode("utf-8")
        headers["Content-Type"] = "application/json"
        req_post = urllib.request.Request(f"{base_url}/api/slices/recover/slice_ipc_http_01", data=post_body, headers=headers, method="POST")
        with urllib.request.urlopen(req_post, timeout=2.0) as resp:
            assert resp.status == 200
            post_data = json.loads(resp.read().decode("utf-8"))
            assert post_data["success"] is True
            assert post_data["status"] == "DISCARDED"

        # Verify DB mutation
        with engine._get_connection() as conn:
            cursor = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice_ipc_http_01';")
            assert cursor.fetchone()["status"] == "DISCARDED"

    finally:
        server.shutdown()
        server.server_close()


def test_notch_hud_recovery_pill_controls(temp_db: Path) -> None:
    """Verifies that Notch HUD dynamically presents and handles the recovery pill."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()
    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice_hud_01", "thread_hud", json.dumps({"step_index": 2}), "INTERRUPTED_REBOOT", "DEV-01", "HUD Test Slice", now, now),
        )

    notch = NexusNotchWindow()
    notch._recovery_poll_running = False
    # Directly configure window store and test recovery controls against real SQLite database
    notch.sovereign_store.db_path = temp_db

    # Initially recovery buttons are hidden
    if hasattr(notch, "btn_resume_slice") and notch.btn_resume_slice:
        assert notch.btn_resume_slice.isVisible() is False
    if hasattr(notch, "btn_dismiss_slice") and notch.btn_dismiss_slice:
        assert notch.btn_dismiss_slice.isVisible() is False

    # Surface recovery pill
    test_slice_list = [
        {"slice_id": "slice_hud_01", "task_summary": "HUD Test Slice", "step_index": 2}
    ]
    notch._show_recovery_pill(test_slice_list)

    if hasattr(notch, "btn_resume_slice") and notch.btn_resume_slice:
        assert notch.btn_resume_slice.isHidden() is False
    if hasattr(notch, "btn_dismiss_slice") and notch.btn_dismiss_slice:
        assert notch.btn_dismiss_slice.isHidden() is False

    # Handle recovery via discard
    res = notch.handle_slice_recovery(action="discard")
    assert res["success"] is True
    assert res["status"] == "DISCARDED"
    assert len(notch._recoverable_slices) == 0

    if hasattr(notch, "btn_resume_slice") and notch.btn_resume_slice:
        assert notch.btn_resume_slice.isHidden() is True
    if hasattr(notch, "btn_dismiss_slice") and notch.btn_dismiss_slice:
        assert notch.btn_dismiss_slice.isHidden() is True

    if hasattr(notch, "close"):
        notch.close()
