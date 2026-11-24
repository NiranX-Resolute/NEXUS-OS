"""
Tests for Modal Labs T4 Whisper STT & Resilient Voice Fallback
Zero-Mock & Zero-Stub Verification:
1. Real ThreadingHTTPServer simulating Modal T4 GPU endpoint with Bearer auth.
2. Verified routing for long/Hinglish audio.
3. Verified fallback to local faster-whisper on unreachable endpoint with SQLite telemetry logging.
4. Verified SILENT workspace mode and ESTOP=1 complete air-gap isolation.
5. Verified IPC GET /api/voice/stt/status Bearer authentication and telemetry payload.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
from typing import Any, Dict, List
import urllib.request
import uuid

import pytest

from core.bridge.voice_pipeline import (
    transcribe_with_modal_fallback,
    transcribe_pcm_audio,
)
from core.runtime.workspaces import WorkspaceGovernor
from core.security.vault import VaultManager, get_default_vault
from core.runtime.ipc_server import NexusIPCServer


class MockModalT4Handler(BaseHTTPRequestHandler):
    """Real HTTP handler simulating Modal Labs T4 Whisper endpoint."""

    server_requests: List[Dict[str, Any]] = []
    expected_token = "test-nexus-token-42"

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def _send_json(self, status_code: int, data: Dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in ("/health", "/health/"):
            self._send_json(200, {"status": "ok", "gpu": "T4"})
            return
        self._send_json(404, {"error": "Not Found"})

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""

        auth_header = self.headers.get("Authorization", "")
        self.__class__.server_requests.append({
            "path": self.path,
            "auth": auth_header,
            "body_len": len(body_bytes),
            "headers": dict(self.headers),
        })

        if self.path in ("/transcribe", "/transcribe/"):
            if auth_header != f"Bearer {self.__class__.expected_token}":
                self._send_json(401, {"detail": "Unauthorized: Invalid or missing Bearer token"})
                return

            self._send_json(200, {
                "text": "Modal T4 GPU audio transcribed successfully",
                "language": "hi",
                "duration_sec": 10.0,
                "segments": [
                    {"start": 0.0, "end": 10.0, "text": "Modal T4 GPU audio transcribed successfully"}
                ],
                "engine": "modal_t4_whisper",
            })
            return

        self._send_json(404, {"error": "Not Found"})


@pytest.fixture
def mock_modal_server():
    """Spins up a real ThreadingHTTPServer simulating Modal T4."""
    MockModalT4Handler.server_requests.clear()
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockModalT4Handler)
    host, port = server.server_address
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    endpoint = f"http://{host}:{port}"
    yield endpoint, server

    server.shutdown()
    server.server_close()


@pytest.fixture
def clean_governor():
    """Ensures WorkspaceGovernor and secrets are cleanly managed for tests."""
    original_mode = getattr(WorkspaceGovernor, "_active_mode", "DEV")
    WorkspaceGovernor._active_mode = "DEV"
    yield
    WorkspaceGovernor._active_mode = original_mode
    os.environ.pop("ESTOP", None)
    os.environ.pop("MODAL_AI_ENDPOINT", None)
    os.environ.pop("NEXUS_TOKEN", None)
    try:
        vault = VaultManager()
        vault.delete_secret("MODAL_AI_ENDPOINT")
        vault.delete_secret("NEXUS_TOKEN")
    except Exception:
        pass


def generate_pcm_audio(duration_sec: float = 10.0, sample_rate: int = 16000) -> bytes:
    """Generates synthetic 16kHz 16-bit mono PCM audio bytes."""
    total_samples = int(duration_sec * sample_rate)
    return b"\x00\x00" * total_samples


def test_modal_stt_long_hinglish_routes_to_endpoint(mock_modal_server, clean_governor):
    """
    Verifies that audio meeting criteria (long duration or hint_hinglish)
    routes to configured Modal endpoint with Bearer auth and parses transcript JSON.
    """
    endpoint_url, server = mock_modal_server
    expected_token = MockModalT4Handler.expected_token

    # Populate both DPAPI vault and os.environ fallback
    try:
        vault = VaultManager()
        vault.set_secret("MODAL_AI_ENDPOINT", endpoint_url)
        vault.set_secret("NEXUS_TOKEN", expected_token)
    except Exception:
        pass

    os.environ["MODAL_AI_ENDPOINT"] = endpoint_url
    os.environ["NEXUS_TOKEN"] = expected_token
    WorkspaceGovernor._active_mode = "DEV"

    pcm_bytes = generate_pcm_audio(duration_sec=10.0)

    result = transcribe_with_modal_fallback(
        audio_pcm_bytes=pcm_bytes,
        duration_sec=10.0,
        snr_db=10.0,
        hint_hinglish=True,
    )

    assert result["engine"] == "modal_t4_whisper"
    assert result["fallback_local"] is False
    assert result["text"] == "Modal T4 GPU audio transcribed successfully"
    assert result["language"] == "hi"

    assert len(MockModalT4Handler.server_requests) >= 1
    last_req = MockModalT4Handler.server_requests[-1]
    assert last_req["auth"] == f"Bearer {expected_token}"
    assert "/transcribe" in last_req["path"]


def test_modal_stt_unreachable_port_falls_back_and_logs_telemetry(clean_governor):
    """
    Verifies that an unreachable port falls back cleanly to local STT
    without exceptions and logs 'modal_stt_fallback_local' to SQLite WAL.
    """
    unreachable_url = "http://127.0.0.1:59991"
    os.environ["MODAL_AI_ENDPOINT"] = unreachable_url
    os.environ["NEXUS_TOKEN"] = "any-token"
    WorkspaceGovernor._active_mode = "DEV"

    pcm_bytes = generate_pcm_audio(duration_sec=9.0)

    result = transcribe_with_modal_fallback(
        audio_pcm_bytes=pcm_bytes,
        duration_sec=9.0,
        hint_hinglish=False,
    )

    assert result["engine"] == "local_faster_whisper"
    assert result["fallback_local"] is True
    assert result["fallback_reason"] is not None

    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    assert db_path.exists()

    with sqlite3.connect(str(db_path), timeout=2.0) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.execute(
            """
            SELECT * FROM telemetry_events
            WHERE event_type = 'modal_stt_fallback_local'
            ORDER BY id DESC LIMIT 1;
            """
        )
        row = cur.fetchone()
        assert row is not None
        payload = json.loads(row["payload_json"])
        assert "reason" in payload
        assert payload["duration_sec"] == 9.0


def test_silent_airgap_blocks_external_http_calls(mock_modal_server, clean_governor):
    """
    Verifies that SILENT workspace mode or ESTOP=1 completely blocks external HTTP calls
    and transcribes locally.
    """
    endpoint_url, server = mock_modal_server
    os.environ["MODAL_AI_ENDPOINT"] = endpoint_url
    os.environ["NEXUS_TOKEN"] = MockModalT4Handler.expected_token

    # 1. Test SILENT workspace mode
    WorkspaceGovernor._active_mode = "SILENT"
    MockModalT4Handler.server_requests.clear()

    pcm_bytes = generate_pcm_audio(duration_sec=12.0)
    result_silent = transcribe_with_modal_fallback(
        audio_pcm_bytes=pcm_bytes,
        duration_sec=12.0,
        hint_hinglish=True,
    )

    assert len(MockModalT4Handler.server_requests) == 0
    assert result_silent["engine"] == "local_faster_whisper"

    # 2. Test ESTOP=1 air-gap override
    WorkspaceGovernor._active_mode = "DEV"
    os.environ["ESTOP"] = "1"
    MockModalT4Handler.server_requests.clear()

    result_estop = transcribe_with_modal_fallback(
        audio_pcm_bytes=pcm_bytes,
        duration_sec=12.0,
        hint_hinglish=True,
    )

    assert len(MockModalT4Handler.server_requests) == 0
    assert result_estop["engine"] == "local_faster_whisper"

    os.environ.pop("ESTOP", None)


def test_ipc_stt_status_endpoint_auth_and_payload(clean_governor):
    """
    Verifies that GET /api/voice/stt/status on 127.0.0.1:47630 enforces Bearer authentication
    and returns { local_engine, modal_configured, modal_endpoint_host, silent_airgap_active }.
    """
    os.environ["MODAL_AI_ENDPOINT"] = "https://nexus-whisper-t4.modal.run"
    WorkspaceGovernor._active_mode = "DEV"

    ipc_server = NexusIPCServer(host="127.0.0.1", port=47632)
    auth_token = getattr(ipc_server, "auth_token", "default_test_token")
    ipc_thread = threading.Thread(target=ipc_server.serve_forever, daemon=True)
    ipc_thread.start()

    try:
        url = "http://127.0.0.1:47632/api/voice/stt/status"

        # 1. Request with valid Bearer token -> 200 OK
        req_auth = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {auth_token}"},
            method="GET",
        )
        with urllib.request.urlopen(req_auth, timeout=3.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            assert data["local_engine"] == "faster-whisper"
            assert data["modal_configured"] is True
            assert data["modal_endpoint_host"] == "nexus-whisper-t4.modal.run"
            assert data["silent_airgap_active"] is False

        # 2. Request without Bearer token -> 401 Unauthorized
        req_no_auth = urllib.request.Request(url, method="GET")
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req_no_auth, timeout=3.0)
        assert exc_info.value.code == 401

    finally:
        ipc_server.shutdown()
        ipc_server.server_close()
