"""Nexus OS v5.0 - Creator Suite Real Integration Test Suite.

ZERO MOCKS & ZERO STUBS:
Verifies real end-to-end functionality for:
1. ScreenRecorder lifecycle states (idle -> recording -> paused -> recording -> stopped) using ffmpeg
2. ScreenRecorder error handling when ffmpeg binary is absent
3. LiveCommentaryController start/stop and strict [SILENT] air-gap mode blocking (HTTP 403)
4. DPAPI-backed YouTube tools validation (upload input checks and comment sentiment analysis)
5. Real loopback IPC Server routes (POST /api/creator/record, /api/creator/commentary, /api/creator/youtube)
   with strict Bearer token authentication and [SILENT] mode guards.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Generator
import urllib.error
import urllib.request
import pytest

from core.mcp.plugins.creator_suite import (
    ScreenRecorder,
    LiveCommentaryController,
    analyze_comments_sentiment,
    youtube_upload_video,
    youtube_comment_sentiment,
    start_recording,
    pause_recording,
    resume_recording,
    stop_recording,
    recording_status,
)
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor
from core.security.vault import VaultManager


@pytest.fixture(scope="module")
def real_ipc_server_fixture() -> Generator[dict, None, None]:
    """Spawns an un-mocked, real NexusIPCServer on an ephemeral loopback port."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="CreatorSuiteRealTestServer")
    t.start()
    time.sleep(0.35)

    base_url = f"http://127.0.0.1:{assigned_port}"

    yield {
        "server": server,
        "db_path": temp_db_path,
        "token": server.auth_token,
        "base_url": base_url,
    }

    server.shutdown()
    server.server_close()
    if hasattr(server, "store") and hasattr(server.store, "close"):
        server.store.close()

    try:
        if temp_db_path.exists():
            temp_db_path.unlink()
        wal = temp_db_path.with_name(temp_db_path.name + "-wal")
        if wal.exists():
            wal.unlink()
        shm = temp_db_path.with_name(temp_db_path.name + "-shm")
        if shm.exists():
            shm.unlink()
    except Exception as cleanup_err:
        import logging
        logging.getLogger("nexus.test_creator_suite").debug("Teardown unlink notice: %s", cleanup_err)


def _send_ipc_post(url: str, headers: dict = None, body: dict = None) -> tuple[int, dict]:
    """Executes real synchronous HTTP POST request against local loopback IPC server."""
    payload_bytes = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=payload_bytes, method="POST")
    req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)

    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            status = resp.status
            raw = resp.read().decode("utf-8")
            return status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as he:
        raw_err = he.read().decode("utf-8")
        try:
            parsed = json.loads(raw_err)
        except Exception:
            parsed = {"raw": raw_err}
        return he.code, parsed


class TestCreatorSuiteReal:
    """Comprehensive test suite verifying real ScreenRecorder, LiveCommentary, and YouTube tools."""

    def test_recorder_full_lifecycle_and_transitions(self, tmp_path):
        """Verifies state machine transitions: idle -> recording -> paused -> recording -> stopped."""
        output_file = tmp_path / "test_lifecycle_rec.mp4"
        recorder = ScreenRecorder(db_path=tmp_path / "agent_local.db")

        # Initial state verification
        init_st = recorder.recording_status()
        assert init_st["status"] == "idle"
        assert init_st["output_path"] is None

        # 1. Start recording
        start_res = recorder.start_recording(output_path=str(output_file))
        assert start_res["success"] is True
        assert start_res["status"] == "recording"
        assert start_res["pid"] is not None
        assert Path(start_res["output_path"]).resolve() == output_file.resolve()

        # Check status while recording
        rec_st = recorder.recording_status()
        assert rec_st["status"] == "recording"
        assert rec_st["pid"] == start_res["pid"]

        # Duplicate start must be rejected cleanly
        dup_start = recorder.start_recording(output_path=str(tmp_path / "dup.mp4"))
        assert dup_start["success"] is False
        assert dup_start["status"] == "recording"

        # 2. Pause recording
        time.sleep(0.5)
        pause_res = recorder.pause_recording()
        assert pause_res["success"] is True
        assert pause_res["status"] == "paused"

        paused_st = recorder.recording_status()
        assert paused_st["status"] == "paused"

        # Duplicate pause must be rejected
        dup_pause = recorder.pause_recording()
        assert dup_pause["success"] is False
        assert dup_pause["status"] == "paused"

        # 3. Resume recording
        time.sleep(0.3)
        resume_res = recorder.resume_recording()
        assert resume_res["success"] is True
        assert resume_res["status"] == "recording"

        resumed_st = recorder.recording_status()
        assert resumed_st["status"] == "recording"

        # Duplicate resume must be rejected
        dup_resume = recorder.resume_recording()
        assert dup_resume["success"] is False
        assert dup_resume["status"] == "recording"

        # 4. Stop recording
        time.sleep(0.5)
        stop_res = recorder.stop_recording()
        assert stop_res["success"] is True
        assert stop_res["status"] == "stopped"
        assert stop_res["output_path"] == str(output_file.resolve())
        assert stop_res["duration_sec"] > 0.0

        stopped_st = recorder.recording_status()
        assert stopped_st["status"] == "stopped"

        # Stop when already stopped must fail cleanly
        dup_stop = recorder.stop_recording()
        assert dup_stop["success"] is False
        assert dup_stop["status"] == "stopped"

        # Pause or resume when stopped must fail cleanly
        assert recorder.pause_recording()["success"] is False
        assert recorder.resume_recording()["success"] is False

    def test_recorder_error_handling_when_ffmpeg_absent(self, tmp_path):
        """Verifies clean error handling and state tracking when ffmpeg executable is absent."""
        fake_bin_path = str(tmp_path / "bin" / "non_existent_ffmpeg_bin.exe")
        recorder = ScreenRecorder(ffmpeg_bin=fake_bin_path, db_path=tmp_path / "agent_local.db")

        # Initial state
        assert recorder.recording_status()["status"] == "idle"

        # Attempt to start recording without valid ffmpeg
        res = recorder.start_recording(output_path=str(tmp_path / "err_test.mp4"))
        assert res["success"] is False
        assert res["status"] == "error"
        assert "not found" in res["error"].lower()

        # Status must accurately reflect error state
        st = recorder.recording_status()
        assert st["status"] == "error"

        # Clean lifecycle rejection from error state
        assert recorder.pause_recording()["success"] is False
        assert recorder.resume_recording()["success"] is False
        assert recorder.stop_recording()["success"] is False

    def test_live_commentary_lifecycle_and_silent_mode_blocking(self, tmp_path):
        """Verifies live commentary lifecycle and strict [SILENT] mode air-gap blocking."""
        governor = WorkspaceGovernor()
        governor.set_mode("DEV")

        commentary = LiveCommentaryController(governor=governor, db_path=tmp_path / "agent_local.db")

        # 1. Start commentary in DEV mode
        start_res = commentary.start_live_commentary(interval_sec=1.0, style="cohost")
        assert start_res["success"] is True
        assert start_res["active"] is True
        assert start_res["style"] == "cohost"

        # Status check
        st = commentary.commentary_status()
        assert st["active"] is True
        assert st["style"] == "cohost"

        # 2. Stop commentary
        stop_res = commentary.stop_live_commentary()
        assert stop_res["success"] is True
        assert stop_res["active"] is False

        st_stopped = commentary.commentary_status()
        assert st_stopped["active"] is False

        # 3. SILENT Mode Air-Gap Invariant Enforcement
        governor.set_mode("SILENT")
        silent_res = commentary.start_live_commentary(interval_sec=1.0, style="cohost")
        assert silent_res["success"] is False
        assert silent_res.get("blocked") is True
        assert silent_res.get("workspace_mode") == "SILENT"
        assert "SILENT air-gapped mode" in silent_res.get("error", "")

        # Reset back to DEV
        governor.set_mode("DEV")

    def test_sentiment_lexicon_scoring_engine(self):
        """Verifies deterministic sentiment analysis scoring breakdown without mocks."""
        sample_comments = [
            {"text": "This screen recording feature is amazing, clean, and wonderful! Best update.", "author": "Alice", "likes": 12},
            {"text": "Terrible and awful experience, completely broken and useless garbage.", "author": "Bob", "likes": 0},
            {"text": "Desktop video capture tool demonstration.", "author": "Charlie", "likes": 3},
        ]

        result = analyze_comments_sentiment(sample_comments)
        assert result["total_analyzed"] == 3
        assert result["breakdown"]["positive"] == 1
        assert result["breakdown"]["negative"] == 1
        assert result["breakdown"]["neutral"] == 1
        assert len(result["scored_comments"]) == 3
        assert result["scored_comments"][0]["sentiment"] == "positive"
        assert result["scored_comments"][0]["score"] > 0.0
        assert result["scored_comments"][1]["sentiment"] == "negative"
        assert result["scored_comments"][1]["score"] < 0.0
        assert result["scored_comments"][2]["sentiment"] == "neutral"
        assert result["scored_comments"][2]["score"] == 0.0

    def test_youtube_tools_input_validation_and_dpapi_vault(self, tmp_path):
        """Verifies input validation and DPAPI vault credential checks for YouTube tools."""
        # Non-existent file path check
        non_existent_file = str(tmp_path / "does_not_exist_video.mp4")
        res_nofile = youtube_upload_video(file_path=non_existent_file, title="Test Video")
        assert res_nofile["success"] is False
        assert "not found" in res_nofile["error"].lower()

        # Empty title check
        real_file = tmp_path / "valid_dummy.mp4"
        real_file.write_bytes(b"\x00" * 64)
        res_notitle = youtube_upload_video(file_path=str(real_file), title="   ")
        assert res_notitle["success"] is False
        assert "title" in res_notitle["error"].lower()

        # Empty video ID check for sentiment analysis
        res_novid = youtube_comment_sentiment(video_id="")
        assert res_novid["success"] is False
        assert "video_id" in res_novid["error"].lower()

        # VaultManager integration check: verify DPAPI vault encryption and retrieval
        vault = VaultManager()
        test_key = "TEST_YOUTUBE_CHECK_KEY"
        test_val = "ai_test_secret_token_val_9988"
        vault.set_secret(test_key, test_val)
        retrieved = vault.get_secret(test_key)
        assert retrieved == test_val
        vault.delete_secret(test_key)

    def test_ipc_unauthorized_requests_rejected_401(self, real_ipc_server_fixture):
        """Verifies that unauthenticated calls to all /api/creator/* routes strictly return 401."""
        base_url = real_ipc_server_fixture["base_url"]

        endpoints = [
            f"{base_url}/api/creator/record",
            f"{base_url}/api/creator/commentary",
            f"{base_url}/api/creator/youtube",
        ]

        for url in endpoints:
            # 1. No auth header
            code, resp = _send_ipc_post(url, body={"action": "status"})
            assert code == 401, f"Expected 401 Unauthorized for {url}, got {code}: {resp}"
            assert resp.get("success") is False

            # 2. Invalid Bearer token
            code, resp = _send_ipc_post(
                url,
                headers={"Authorization": "Bearer totally_invalid_secret_token_55"},
                body={"action": "status"},
            )
            assert code == 401, f"Expected 401 Unauthorized for {url} with bad token, got {code}"
            assert resp.get("success") is False

    def test_ipc_creator_record_route_authenticated(self, real_ipc_server_fixture):
        """Verifies authenticated POST /api/creator/record route operations."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Action: status
        code, resp = _send_ipc_post(
            f"{base_url}/api/creator/record",
            headers=headers,
            body={"action": "status"},
        )
        assert code == 200, f"Expected 200 OK, got {code}: {resp}"
        assert resp.get("success") is True
        assert "status" in resp

        # Invalid action check
        code_inv, resp_inv = _send_ipc_post(
            f"{base_url}/api/creator/record",
            headers=headers,
            body={"action": "invalid_command_xyz"},
        )
        assert code_inv == 400
        assert resp_inv.get("success") is False

    def test_ipc_creator_commentary_route_and_silent_blocking(self, real_ipc_server_fixture):
        """Verifies authenticated POST /api/creator/commentary and [SILENT] mode 403 blocking."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        server: NexusIPCServer = real_ipc_server_fixture["server"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Status action in DEV mode
        server.governor.set_mode("DEV")
        code, resp = _send_ipc_post(
            f"{base_url}/api/creator/commentary",
            headers=headers,
            body={"action": "status"},
        )
        assert code == 200, f"Expected 200 OK, got {code}: {resp}"
        assert resp.get("success") is True
        assert "active" in resp

        # 2. Switch to SILENT mode -> verify HTTP 403 Forbidden
        server.governor.set_mode("SILENT")
        code_silent, resp_silent = _send_ipc_post(
            f"{base_url}/api/creator/commentary",
            headers=headers,
            body={"action": "start", "interval_sec": 2.0, "style": "cohost"},
        )
        assert code_silent == 403, f"Expected 403 Forbidden in SILENT mode, got {code_silent}: {resp_silent}"
        assert resp_silent.get("blocked") is True
        assert resp_silent.get("workspace_mode") == "SILENT"

        # Restore DEV mode
        server.governor.set_mode("DEV")

    def test_ipc_creator_youtube_route_authenticated(self, real_ipc_server_fixture):
        """Verifies authenticated POST /api/creator/youtube route parameter checking."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Invalid action returns 400
        code, resp = _send_ipc_post(
            f"{base_url}/api/creator/youtube",
            headers=headers,
            body={"action": "unknown_action"},
        )
        assert code == 400
        assert resp.get("success") is False
        assert "Invalid action" in resp.get("error", "")

        # Action sentiment with missing ID returns 400
        code_sent, resp_sent = _send_ipc_post(
            f"{base_url}/api/creator/youtube",
            headers=headers,
            body={"action": "sentiment", "video_id": ""},
        )
        assert code_sent == 400
        assert resp_sent.get("success") is False
