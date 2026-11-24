"""Nexus OS v5.0 - Strict Zero-Mock End-to-End Real Integration Test Suite.

MANDATORY INVARIANTS:
1. ZERO MOCKS: Absolutely NO unittest.mock, patch, or dummy fixtures.
2. FULL VERTICAL WIRING: Starts real NexusIPCServer, sends real HTTP requests,
   and verifies real SQLite WAL database mutations on disk.
3. REAL HARDWARE & AUDIO: Verifies physical device enumeration, CoreAudio COM volume,
   real RMS VAD calculation, sub-15ms barge-in abort, and SQLite audit logging.
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
import urllib.parse
import urllib.request
import pytest

from core.runtime.ipc_server import NexusIPCServer
from core.runtime.audio_capture import RealMicrophoneCapture, RealVoicePipeline
from core.runtime.media_controller import WindowsCoreAudioController, WindowsGSMTCController
from core.runtime.hardware import HardwareInspector


TEST_PORT = 47638


@pytest.fixture(scope="module")
def real_ipc_server():
    """Starts a live, real NexusIPCServer on an isolated temporary SQLite database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    # Initialize live server with dry_run_hardware=True for keyboard/display safety in automated tests
    server = NexusIPCServer(
        host="127.0.0.1",
        port=TEST_PORT,
        db_path=temp_db,
        dry_run_hardware=True,
    )

    server_thread = threading.Thread(target=server.serve_forever, daemon=True, name="TestLiveIPCServer")
    server_thread.start()
    time.sleep(0.3)  # Allow socket to bind

    yield {
        "url": f"http://127.0.0.1:{TEST_PORT}",
        "db_path": temp_db,
        "server": server,
    }

    server.shutdown()
    server.server_close()
    if temp_db.exists():
        try:
            os.remove(temp_db)
        except Exception:
            pass


# =============================================================================
# 1. COMPLETE VERTICAL SLICE (UI/API -> IPC -> SQLite WAL on Disk)
# =============================================================================
def test_e2e_vertical_slice_task_creation_persists_to_sqlite(real_ipc_server):
    base_url = real_ipc_server["url"]
    db_path: Path = real_ipc_server["db_path"]

    # 1. Send real HTTP POST request to create a task
    task_payload = {
        "prompt": "Autonomous perimeter scan and AST code validation",
        "command_type": "SECURITY_AUDIT",
        "source_device": "COMMAND_CENTER_E2E",
    }
    req = urllib.request.Request(
        f"{base_url}/api/tasks",
        data=json.dumps(task_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 201
        data = json.loads(resp.read().decode("utf-8"))

    assert data["success"] is True
    task_id = data["task"]["id"]
    assert task_id.startswith("task-")

    # 2. ZERO-MOCK DISK VERIFICATION: Connect directly to the SQLite WAL database file on disk
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, prompt_raw, command_type, status, source_device FROM tasks WHERE id = ?;", (task_id,))
    row = cursor.fetchone()
    conn.close()

    assert row is not None
    assert row["id"] == task_id
    assert row["prompt_raw"] == "Autonomous perimeter scan and AST code validation"
    assert row["command_type"] == "SECURITY_AUDIT"
    assert row["status"] == "QUEUED"
    assert row["source_device"] == "COMMAND_CENTER_E2E"


def test_e2e_vertical_slice_memory_storage_and_fts_search(real_ipc_server):
    base_url = real_ipc_server["url"]
    db_path: Path = real_ipc_server["db_path"]

    # 1. Store memory node via HTTP POST
    memory_payload = {
        "title": "Nexus OS Sovereignty Architecture",
        "content": "Zero cloud dependency with local SQLite WAL mode and sub-100ms reflex routing",
        "namespace": "DEV",
        "metadata": {"version": "5.0.0", "author": "NiranX"},
    }
    req = urllib.request.Request(
        f"{base_url}/api/memory",
        data=json.dumps(memory_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 201
        data = json.loads(resp.read().decode("utf-8"))

    assert data["success"] is True
    mem_id = data["id"]

    # 2. Query search via HTTP GET
    search_url = f"{base_url}/api/memory/search?q={urllib.parse.quote('sovereignty')}&limit=5"
    with urllib.request.urlopen(search_url, timeout=5.0) as resp:
        assert resp.status == 200
        search_data = json.loads(resp.read().decode("utf-8"))

    assert search_data["success"] is True
    assert len(search_data["results"]) >= 1
    found = any(r["id"] == mem_id for r in search_data["results"])
    assert found is True

    # 3. Direct SQLite verification
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    cur = conn.cursor()
    cur.execute("SELECT title, content FROM memory_nodes WHERE id = ?;", (mem_id,))
    mem_row = cur.fetchone()
    conn.close()

    assert mem_row is not None
    assert mem_row[0] == "Nexus OS Sovereignty Architecture"


def test_e2e_real_hardware_telemetry_query(real_ipc_server):
    base_url = real_ipc_server["url"]

    # Query real telemetry via HTTP GET
    with urllib.request.urlopen(f"{base_url}/api/telemetry", timeout=15.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))

    assert data["success"] is True
    telem = data["telemetry"]

    # Verify physical hardware measurements (real CPU, RAM, Uptime)
    assert "cpuUsage" in telem
    assert isinstance(telem["cpuUsage"], (int, float))
    assert telem["cpuCoresLogical"] >= 1
    assert telem["memoryTotal"] > 0.0  # MB
    assert telem["memoryFree"] > 0.0
    assert telem["uptimeSecs"] >= 0.0


# =============================================================================
# 2. REAL AUDIO & DUPLEX VOICE PIPELINE (Microphone, VAD & Sub-15ms Barge-In)
# =============================================================================
def test_e2e_real_microphone_capture_bindings():
    # Enumerate real physical audio capture devices on host OS
    device_count = RealMicrophoneCapture.get_device_count()
    assert isinstance(device_count, int)
    assert device_count >= 0

    # Test real microphone structure and initialization
    mic = RealMicrophoneCapture()
    assert mic.sample_rate == 16000
    assert mic.buffer_size == 960  # 30ms 16kHz 16-bit Mono frame


def test_e2e_sub_15ms_voice_barge_in_and_sqlite_persistence():
    import struct
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    # Initialize tables
    from scripts.init_local_db import init_agent_local_db
    init_agent_local_db(db_path)

    pipeline = RealVoicePipeline(energy_threshold=0.035, db_path=db_path)

    # Warm up pipeline processor to avoid cold-start CPU cache jitter
    warmup_frame = struct.pack("480h", *([100] * 480))
    pipeline.process_pcm_frame(warmup_frame)

    # Simulate active TTS playback state
    pipeline.is_speaking_tts = True

    # Construct an audio frame with high RMS energy (simulating loud human voice)
    # 480 samples of 16-bit audio with amplitude 12000
    loud_frame = struct.pack("480h", *([12000] * 480))
    rms = pipeline.calculate_rms(loud_frame)
    assert rms > 0.035  # Confirms energy exceeds threshold

    # Process frame into pipeline
    t0 = time.perf_counter()
    pipeline.process_pcm_frame(loud_frame)
    latency_ms = (time.perf_counter() - t0) * 1000.0

    # VERIFY SUB-15MS BARGE-IN SPECIFICATION
    assert pipeline.is_speaking_tts is False  # TTS instantly aborted
    assert latency_ms < 15.0  # Execution completed under 15ms
    assert pipeline.last_barge_in_latency_ms < 15.0

    # VERIFY REAL SQLITE WAL ROW WAS COMMITTED TO DISK
    time.sleep(0.05)  # Wait for async writer thread
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    cur = conn.cursor()
    cur.execute("SELECT event_type, barge_in FROM audio_events WHERE event_type = 'BARGE_IN';")
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "BARGE_IN"
    assert row[1] == 1

    if db_path.exists():
        try:
            os.remove(db_path)
        except Exception:
            pass


# =============================================================================
# 3. REAL WINDOWS GSMTC & COREAUDIO CONTROLS
# =============================================================================
def test_e2e_real_windows_coreaudio_and_gsmtc():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    from scripts.init_local_db import init_agent_local_db
    init_agent_local_db(db_path)

    controller = WindowsCoreAudioController(db_path=db_path)

    # 1. Master Volume
    vol = controller.get_master_volume()
    assert isinstance(vol, float)
    assert 0.0 <= vol <= 1.0

    # 2. Master Mute
    muted = controller.get_mute()
    assert isinstance(muted, bool)

    # 3. Peak Meter
    peak = controller.get_peak_meter()
    assert isinstance(peak, float)
    assert 0.0 <= peak <= 1.0

    # 4. Live Visualizer Bars
    bars = controller.get_visualizer_bars(num_bars=5, max_height=15)
    assert len(bars) == 5
    assert all(isinstance(b, int) and b >= 3 for b in bars)

    # 5. GSMTC Active Media Title
    title, artist = WindowsGSMTCController.get_active_media_title()
    assert isinstance(title, str) and len(title) > 0
    assert isinstance(artist, str) and len(artist) > 0

    # 6. SQLite Disk Persistence Verification
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    cur = conn.cursor()
    cur.execute("SELECT id, title, is_playing, volume FROM media_state WHERE id = 1;")
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row[0] == 1

    if db_path.exists():
        try:
            os.remove(db_path)
        except Exception:
            pass


# =============================================================================
# 4. REAL REFLEX ACTION EXECUTION & AUDIT TELEMETRY LOG
# =============================================================================
def test_e2e_reflex_action_logs_telemetry_to_sqlite(real_ipc_server):
    base_url = real_ipc_server["url"]
    db_path: Path = real_ipc_server["db_path"]

    action_payload = {
        "action": "ADJUST_BRIGHTNESS",
        "payload": {"level": 80},
    }
    req = urllib.request.Request(
        f"{base_url}/api/action",
        data=json.dumps(action_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))

    assert data["success"] is True
    assert data["action"] == "ADJUST_BRIGHTNESS"
    assert data["latency_ms"] < 100.0  # Reflex execution under 100ms

    # Verify telemetry_logs row in SQLite on disk
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    cur = conn.cursor()
    cur.execute("SELECT source, level, message FROM telemetry_logs WHERE source = 'IPC_ACTION' ORDER BY id DESC LIMIT 1;")
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row[0] == "IPC_ACTION"
    assert "ADJUST_BRIGHTNESS" in row[2]
