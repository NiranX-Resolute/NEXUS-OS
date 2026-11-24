"""Nexus OS v5.0 - Haru-4B Full-Duplex Bridge Real Runtime Verification Gate.

STRICT ZERO-STUB ZERO-SIMULATION LAW:
1. test_01_haru_status_and_persona_persistence: Verifies POST /api/voice/haru/toggle persists
   voice_engine = "haru_4b" in SQLite WAL and GET /api/voice/haru/status returns accurate live telemetry.
2. test_02_haru_live_endpoint_roundtrip: Points HaruDuplexClient at a real local HTTP server,
   sends a 133ms 16kHz PCM frame + persona card, and verifies response framing and latency.
3. test_03_haru_offline_fallback_under_50ms: Points HaruDuplexClient at a closed port,
   triggers voice_pipeline routing, and asserts fallback completes in <50ms with haru_fallback_local logged in SQLite WAL.
4. test_04_silent_mode_blocks_haru_network: Sets WorkspaceGovernor to SILENT and verifies
   HaruDuplexClient makes zero outbound network calls even when a live local server is running.
"""

from __future__ import annotations

import asyncio
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import queue
import socket
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional
import urllib.request

import pytest

from core.bridge.haru_client import (
    HARU_FRAME_BYTES,
    HaruDuplexClient,
    HaruUnavailableError,
)
from core.bridge.persona_engine import PersonaEngine, get_persona_engine
from core.bridge.voice_pipeline import VoicePipeline
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor


def find_free_port() -> int:
    """Allocates an ephemeral free TCP port for loopback test servers."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class SimulatedHaruEndpointHandler(BaseHTTPRequestHandler):
    """Real HTTP request handler simulating the remote Haru-4B Kaggle GPU endpoint."""

    def log_message(self, format_str: str, *args: Any) -> None:
        """Suppress standard access logs during test execution."""
        _ = (format_str, args)

    def do_GET(self) -> None:
        server: SimulatedHaruServer = self.server  # type: ignore
        server.request_log.append(("GET", self.path))
        if self.path in ("/health", "/"):
            resp = json.dumps({"status": "healthy", "model": "higurashi-ai/Haru-4B"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self) -> None:
        server: SimulatedHaruServer = self.server  # type: ignore
        server.request_log.append(("POST", self.path))

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b"{}"

        if self.path == "/_nexus/activity":
            resp = json.dumps({"status": "acknowledged", "last_activity": time.time()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            return

        if self.path == "/api/haru/duplex":
            req_json = json.loads(body.decode("utf-8")) if body else {}
            server.received_frames.append(req_json)

            # Produce 133ms of synthesized response PCM (2128 samples mono = 4256 bytes)
            out_pcm = b"\x05\x00" * 2128
            out_b64 = base64.b64encode(out_pcm).decode("ascii")

            resp_data = {
                "status": "ok",
                "spoken_text": "Haru full-duplex voice bridge verified.",
                "audio_response": out_b64,
                "latency_ms": 14.2,
                "persona_received": req_json.get("persona_card", {}).get("name", "Unknown"),
            }
            resp_bytes = json.dumps(resp_data).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp_bytes)))
            self.end_headers()
            self.wfile.write(resp_bytes)
            return

        self.send_response(404)
        self.end_headers()


class SimulatedHaruServer(ThreadingHTTPServer):
    """Threaded HTTP server maintaining request telemetry for verification."""
    allow_reuse_address = True

    def __init__(self, host: str, port: int) -> None:
        super().__init__((host, port), SimulatedHaruEndpointHandler)
        self.request_log: List[tuple[str, str]] = []
        self.received_frames: List[Dict[str, Any]] = []


# =============================================================================
# TEST 1: HARU STATUS AND PERSONA PERSISTENCE (IPC SERVER ROUNDTRIP)
# =============================================================================
def test_01_haru_status_and_persona_persistence(tmp_path: Path) -> None:
    """Verifies POST /api/voice/haru/toggle persists voice_engine = 'haru_4b' in SQLite WAL.

    Ensures GET /api/voice/haru/status returns accurate live telemetry and GET /api/persona
    reflects the updated voice engine.
    """
    db_file = tmp_path / "test_agent_local.db"
    store = SovereignMemoryStore(db_path=db_file)
    governor = WorkspaceGovernor()
    governor.set_mode("DEV")

    ipc_server = NexusIPCServer(host="127.0.0.1", port=0, db_path=db_file)
    ipc_port = ipc_server.server_address[1]
    ipc_thread = threading.Thread(target=ipc_server.serve_forever, daemon=True)
    ipc_thread.start()
    time.sleep(0.1)

    base_url = f"http://127.0.0.1:{ipc_port}"
    token = ipc_server.auth_token
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        # 1. Enable Haru voice via POST /api/voice/haru/toggle
        toggle_req = urllib.request.Request(
            f"{base_url}/api/voice/haru/toggle",
            data=json.dumps({"enabled": True}).encode("utf-8"),
            headers=auth_headers,
            method="POST",
        )
        with urllib.request.urlopen(toggle_req, timeout=10.0) as toggle_resp:
            assert toggle_resp.status == 200
            toggle_data = json.loads(toggle_resp.read().decode("utf-8"))
            assert toggle_data["success"] is True
            assert toggle_data["status"]["enabled"] is True

        # 2. Verify persistence directly in SQLite WAL database
        with store._get_connection() as conn:
            row = conn.execute("SELECT voice_engine FROM persona_settings WHERE id = 1;").fetchone()
            assert row is not None
            assert row["voice_engine"] == "haru_4b"

        # 3. Query GET /api/voice/haru/status
        status_req = urllib.request.Request(
            f"{base_url}/api/voice/haru/status",
            headers=auth_headers,
            method="GET",
        )
        with urllib.request.urlopen(status_req, timeout=10.0) as status_resp:
            assert status_resp.status == 200
            status_data = json.loads(status_resp.read().decode("utf-8"))
            assert status_data["success"] is True
            assert status_data["enabled"] is True
            assert status_data["active_mode"] == "DEV"
            assert status_data["air_gapped"] is False
            assert "available" in status_data
            assert "latency_ms" in status_data
            assert "reference_clip_present" in status_data

        # 4. Verify GET /api/persona returns active voice_engine
        persona_req = urllib.request.Request(
            f"{base_url}/api/persona",
            headers=auth_headers,
            method="GET",
        )
        with urllib.request.urlopen(persona_req, timeout=10.0) as persona_resp:
            assert persona_resp.status == 200
            p_data = json.loads(persona_resp.read().decode("utf-8"))
            assert p_data["success"] is True
            assert p_data["voice_engine"] == "haru_4b"
            assert "haru_node_reachable" in p_data

        # 5. Disable Haru voice via POST /api/voice/haru/toggle
        disable_req = urllib.request.Request(
            f"{base_url}/api/voice/haru/toggle",
            data=json.dumps({"enabled": False}).encode("utf-8"),
            headers=auth_headers,
            method="POST",
        )
        with urllib.request.urlopen(disable_req, timeout=10.0) as dis_resp:
            assert dis_resp.status == 200
            dis_data = json.loads(dis_resp.read().decode("utf-8"))
            assert dis_data["status"]["enabled"] is False

        # Verify reverted persistence in SQLite WAL
        with store._get_connection() as conn:
            row2 = conn.execute("SELECT voice_engine FROM persona_settings WHERE id = 1;").fetchone()
            assert row2["voice_engine"] == "kokoro"

    finally:
        ipc_server.shutdown()
        ipc_server.server_close()


# =============================================================================
# TEST 2: HARU LIVE ENDPOINT ROUNDTRIP (133ms PCM FRAME + PERSONA CARD)
# =============================================================================
def test_02_haru_live_endpoint_roundtrip(tmp_path: Path) -> None:
    """Points HaruDuplexClient at a real local HTTP server.

    Sends a 133ms 16kHz PCM audio frame + persona card, and verifies response framing,
    barge-in framing, and roundtrip latency.
    """
    db_file = tmp_path / "test_roundtrip.db"
    store = SovereignMemoryStore(db_path=db_file)
    store.update_persona_settings(
        empathy_pct=92,
        humor_pct=60,
        candor_pct=88,
        verbosity_pct=35,
        voice_engine="haru_4b",
        active_preset="CARING_COMPANION",
    )

    haru_server = SimulatedHaruServer("127.0.0.1", 0)
    port = haru_server.server_address[1]
    server_thread = threading.Thread(target=haru_server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.1)

    node_url = f"http://127.0.0.1:{port}"
    governor = WorkspaceGovernor()
    governor.set_mode("DEV")

    client = HaruDuplexClient(
        governor=governor,
        db_path=db_file,
        override_url=node_url,
    )

    try:
        # 1. Health check verification
        is_healthy, latency = client.check_health(force=True)
        assert is_healthy is True
        assert latency >= 0.0
        assert client.is_available() is True

        # 2. Build and verify character persona card
        card = client.build_persona_card()
        assert card["name"] == "Haru"
        assert card["preset"] == "CARING_COMPANION"
        assert card["empathy_pct"] == 92
        assert "higurashi-ai/Haru-4B" in card["model"]

        # 3. Create real 133ms 16kHz 16-bit mono PCM frame (4256 bytes)
        raw_pcm_frame = b"\x01\x00" * 2128
        assert len(raw_pcm_frame) == HARU_FRAME_BYTES

        # 4. Dispatch live frame to simulated Haru endpoint
        result = client.send_duplex_frame(raw_pcm_frame, persona_card=card)

        assert result["status"] == "ok"
        assert "Haru full-duplex voice bridge verified" in result["spoken_text"]
        assert len(result["audio_frame"]) == HARU_FRAME_BYTES
        assert result["latency_ms"] < 2500.0

        # Verify server received the frame
        assert len(haru_server.received_frames) == 1
        rec = haru_server.received_frames[0]
        assert rec["frame_bytes"] == HARU_FRAME_BYTES
        assert rec["persona_card"]["preset"] == "CARING_COMPANION"

        # 5. Test asynchronous duplex queue session
        audio_in: queue.Queue = queue.Queue()
        audio_out: queue.Queue = queue.Queue()
        stop_evt = threading.Event()

        audio_in.put(raw_pcm_frame)

        async def run_short_session() -> None:
            task = asyncio.create_task(client.stream_duplex_session(audio_in, audio_out, stop_evt))
            # Wait for frame processing
            for _ in range(50):
                if not audio_out.empty():
                    break
                await asyncio.sleep(0.02)
            stop_evt.set()
            await task

        asyncio.run(run_short_session())

        assert not audio_out.empty()
        streamed_frame = audio_out.get_nowait()
        assert streamed_frame["status"] == "ok"
        assert len(streamed_frame["audio_frame"]) == HARU_FRAME_BYTES

    finally:
        haru_server.shutdown()
        haru_server.server_close()


# =============================================================================
# TEST 3: HARU OFFLINE FALLBACK UNDER 50MS WITH SQLITE LOGGING
# =============================================================================
def test_03_haru_offline_fallback_under_50ms(tmp_path: Path) -> None:
    """Points HaruDuplexClient at an unreachable closed localhost port.

    Triggers voice_pipeline routing, and asserts fallback to local pipeline completes
    in <50ms with haru_fallback_local logged in SQLite WAL telemetry_events.
    """
    db_file = tmp_path / "test_fallback.db"
    store = SovereignMemoryStore(db_path=db_file)
    store.update_persona_settings(
        empathy_pct=80,
        humor_pct=50,
        candor_pct=80,
        verbosity_pct=40,
        voice_engine="haru_4b",
        active_preset="DEBUG_SURGEON",
    )

    governor = WorkspaceGovernor()
    governor.set_mode("DEV")

    # Allocate an unused port and immediately close it
    unreachable_port = find_free_port()
    closed_url = f"http://127.0.0.1:{unreachable_port}"

    pipeline = VoicePipeline(tts_backend="edge_tts", store=store)

    # Verify Haru client recognizes port is offline
    client = HaruDuplexClient(governor=governor, db_path=db_file, override_url=closed_url)
    assert client.is_available(force=True) is False

    # Execute voice pipeline duplex routing with simulated input chunk
    in_queue: queue.Queue = queue.Queue()
    out_queue: queue.Queue = queue.Queue()
    stop_evt = threading.Event()
    in_chunk = b"\x00\x02" * 2128
    in_queue.put(in_chunk)

    t0 = time.perf_counter()
    res = asyncio.run(pipeline.route_duplex_session(in_queue, out_queue, stop_evt, haru_client=client))
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Strict sub-50ms fallback assertion
    assert elapsed_ms < 50.0
    assert res["success"] is True
    assert res["engine"] == "local_whisper_tts"
    assert res["routed_remote"] is False
    assert res["setup_latency_ms"] < 50.0

    # Verify out_queue received local synthesized response
    assert not out_queue.empty()
    out_item = out_queue.get_nowait()
    assert out_item["status"] == "fallback_local"
    assert out_item["engine"] == "local_whisper_tts"

    # Verify haru_fallback_local logged in SQLite WAL telemetry_events table
    row = None
    for _ in range(25):
        with store._get_connection() as conn:
            row = conn.execute(
                "SELECT event_type, payload_json FROM telemetry_events WHERE event_type = 'haru_fallback_local' ORDER BY id DESC LIMIT 1;"
            ).fetchone()
            if row is not None:
                break
        time.sleep(0.02)
    assert row is not None
    assert row["event_type"] == "haru_fallback_local"
    payload = json.loads(row["payload_json"])
    assert payload["fallback_target"] == "local_whisper_tts"


# =============================================================================
# TEST 4: SILENT MODE BLOCKS HARU NETWORK (ZERO OUTBOUND CALLS)
# =============================================================================
def test_04_silent_mode_blocks_haru_network(tmp_path: Path) -> None:
    """Sets WorkspaceGovernor to SILENT and verifies HaruDuplexClient makes zero outbound network calls.

    Even when a live local test server is actively listening.
    """
    db_file = tmp_path / "test_silent.db"
    store = SovereignMemoryStore(db_path=db_file)
    store.update_persona_settings(voice_engine="haru_4b")

    haru_server = SimulatedHaruServer("127.0.0.1", 0)
    port = haru_server.server_address[1]
    server_thread = threading.Thread(target=haru_server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.1)

    node_url = f"http://127.0.0.1:{port}"
    governor = WorkspaceGovernor()
    governor.set_mode("SILENT")

    client = HaruDuplexClient(
        governor=governor,
        db_path=db_file,
        override_url=node_url,
    )

    try:
        # 1. Assert governor and client air-gap states
        assert governor.get_mode() == "SILENT"
        assert client.is_air_gapped() is True
        assert client.get_node_url() is None
        assert client.is_available() is False

        # 2. Attempt health check in SILENT mode - MUST return (False, 0.0) without network hit
        healthy, lat = client.check_health(force=True)
        assert healthy is False
        assert lat == 0.0
        assert len(haru_server.request_log) == 0

        # 3. Attempt send_duplex_frame - MUST raise HaruUnavailableError immediately without network hit
        with pytest.raises(HaruUnavailableError) as exc_info:
            client.send_duplex_frame(b"\x00" * HARU_FRAME_BYTES)
        assert "SILENT" in str(exc_info.value) or "denied" in str(exc_info.value)
        assert len(haru_server.request_log) == 0

        # 4. Attempt stream_duplex_session - MUST raise HaruUnavailableError immediately
        q_in: queue.Queue = queue.Queue()
        q_out: queue.Queue = queue.Queue()
        stop_evt = threading.Event()
        with pytest.raises(HaruUnavailableError) as stream_exc_info:
            asyncio.run(client.stream_duplex_session(q_in, q_out, stop_evt))
        assert "SILENT" in str(stream_exc_info.value) or "prohibited" in str(stream_exc_info.value)
        assert len(haru_server.request_log) == 0

        # 5. Attempt POST /api/voice/haru/toggle to enable in SILENT mode via IPC Server
        ipc_server = NexusIPCServer(host="127.0.0.1", port=0, db_path=db_file)
        ipc_server.governor.set_mode("SILENT")

        toggle_res = ipc_server.toggle_haru_voice({"enabled": True})
        assert toggle_res["success"] is False
        assert toggle_res["air_gapped"] is True
        assert toggle_res["active_mode"] == "SILENT"
        assert len(haru_server.request_log) == 0

    finally:
        haru_server.shutdown()
        haru_server.server_close()
        governor.set_mode("DEV")
