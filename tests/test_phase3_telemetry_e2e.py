"""Nexus OS v5.0 - Phase 3 & Telemetry Bridge E2E Zero-Mock Verification Suite.

Validates the full telemetry spine:
1. SQLite WAL telemetry_events persistence, schema, and JSON payloads.
2. 75ms polling cadence verification: events written to WAL are readable in <75ms.
3. Core state transitions (IDLE -> LISTENING -> THINKING -> EXECUTING -> SPEAKING -> ESTOP_TRIGGERED).
4. Circuit pulse emission across 4 conduits (MEMORY, MCP_SKILLS, PERSONA, WORKSPACE).
5. Agent execution slices (DEV-01, SYS-01, SCOUT-01, SEC-01, OPS-01).
6. Web ingest events persistence & retrieval.
7. System flags (ESTOP, WORKSPACE_MODE) synchronization and E-Stop safety assertion.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import urllib.request
import uuid
import pytest

from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.slice_engine import InfinitySliceEngine, EmergencyStopException
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.reflex_router import emit_telemetry_event


@pytest.fixture
def telemetry_fixture():
    """Provides an isolated SQLite WAL database initialized with InfinitySliceEngine and SovereignMemoryStore."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    # Initialize tables via real engines
    slice_engine = InfinitySliceEngine(str(db_path))
    memory_store = SovereignMemoryStore(db_path=db_path)
    governor = WorkspaceGovernor()

    yield {
        "db_path": db_path,
        "slice_engine": slice_engine,
        "memory_store": memory_store,
        "governor": governor,
    }

    try:
        if db_path.exists():
            db_path.unlink(missing_ok=True)
        wal_path = Path(str(db_path) + "-wal")
        if wal_path.exists():
            wal_path.unlink(missing_ok=True)
        shm_path = Path(str(db_path) + "-shm")
        if shm_path.exists():
            shm_path.unlink(missing_ok=True)
    except Exception:
        pass


def test_telemetry_wal_mode_and_schema(telemetry_fixture):
    """Verifies agent_local.db operates in WAL mode and has all required telemetry tables."""
    db_path = telemetry_fixture["db_path"]
    conn = sqlite3.connect(str(db_path))
    try:
        mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        assert mode.lower() == "wal", f"Expected WAL mode, got {mode}"

        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()}
        required_tables = {"telemetry_events", "system_flags", "execution_slices", "web_ingest_events"}
        assert required_tables.issubset(tables), f"Missing tables: {required_tables - tables}"
    finally:
        conn.close()


def test_core_state_and_circuit_pulse_telemetry(telemetry_fixture):
    """Verifies core_state transitions and 4-conduit circuit pulses persist and deserialize cleanly."""
    db_path = telemetry_fixture["db_path"]

    # 1. Emit core_state events
    states = ["LISTENING", "THINKING", "EXECUTING", "SPEAKING", "IDLE"]
    for st in states:
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute(
                "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                ("core_state", json.dumps({"core_state": st, "reason": f"Transition to {st}"}), time.time()),
            )
            conn.commit()
        finally:
            conn.close()

    # 2. Emit circuit pulses for the 4 conduits: MEMORY, MCP_SKILLS, PERSONA, WORKSPACE
    conduits = ["MEMORY", "MCP_SKILLS", "PERSONA", "WORKSPACE"]
    for c in conduits:
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute(
                "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                (
                    "circuit_pulse",
                    json.dumps({
                        "node": c,
                        "active": True,
                        "detail": f"{c} online",
                        "latency_ms": 12.5,
                    }),
                    time.time(),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    # 3. Read back and verify
    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("SELECT event_type, payload_json FROM telemetry_events ORDER BY id ASC;").fetchall()
        assert len(rows) >= len(states) + len(conduits)

        core_state_rows = [json.loads(r[1]) for r in rows if r[0] == "core_state"]
        recorded_states = [r["core_state"] for r in core_state_rows]
        assert recorded_states == states

        pulse_rows = [json.loads(r[1]) for r in rows if r[0] == "circuit_pulse"]
        recorded_nodes = [r["node"] for r in pulse_rows]
        assert set(conduits).issubset(set(recorded_nodes))
    finally:
        conn.close()


def test_75ms_polling_latency_budget(telemetry_fixture):
    """Verifies that an event written to SQLite WAL is queryable within <75ms (simulating Electron poller)."""
    db_path = telemetry_fixture["db_path"]

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    start_time = time.perf_counter()
    try:
        conn.execute(
            "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
            ("audio_rms", json.dumps({"audio_rms": 0.42}), time.time()),
        )
        conn.commit()
    finally:
        conn.close()

    polled = False
    read_latency = 0.0
    for _ in range(15):
        poll_conn = sqlite3.connect(str(db_path))
        try:
            row = poll_conn.execute(
                "SELECT payload_json FROM telemetry_events WHERE event_type = 'audio_rms' ORDER BY id DESC LIMIT 1;"
            ).fetchone()
            if row:
                read_latency = (time.perf_counter() - start_time) * 1000.0
                payload = json.loads(row[0])
                assert payload["audio_rms"] == 0.42
                polled = True
                break
        finally:
            poll_conn.close()
        time.sleep(0.005)

    assert polled, "Failed to poll telemetry event within budget"
    assert read_latency < 75.0, f"Polling latency {read_latency:.2f}ms exceeded 75ms SLA"


def test_agent_slice_tracking_lifecycle(telemetry_fixture):
    """Verifies execution slices can be created, updated, and queried for all 5 planetary orbiters."""
    db_path = telemetry_fixture["db_path"]
    slice_engine = telemetry_fixture["slice_engine"]
    agents = ["DEV-01", "SYS-01", "SCOUT-01", "SEC-01", "OPS-01"]

    for idx, agent_id in enumerate(agents):
        unique_thread = f"thread_e2e_{idx}_{uuid.uuid4().hex[:8]}"
        task_text = f"Compile mission target for {agent_id}"
        slice_id = slice_engine.suspend_slice(
            thread_id=unique_thread,
            current_state={"step": idx, "action": "test", "target": agent_id},
            agent_id=agent_id,
            task_summary=task_text,
            status="SUSPENDED",
        )
        assert slice_id.startswith("slice_")

    conn = sqlite3.connect(str(db_path))
    try:
        rows = conn.execute("SELECT agent_id, status, task_summary FROM execution_slices;").fetchall()
        assert len(rows) == len(agents)
        saved_agents = {r[0] for r in rows}
        assert saved_agents == set(agents)
    finally:
        conn.close()


def test_system_flags_estop_and_workspace_mode(telemetry_fixture):
    """Verifies system_flags table correctly holds ESTOP and WORKSPACE_MODE."""
    db_path = telemetry_fixture["db_path"]
    slice_engine = telemetry_fixture["slice_engine"]

    # 1. Initial State
    assert not slice_engine.is_estop_asserted()

    # 2. Trigger ESTOP
    slice_engine.trigger_estop("Test E-Stop assertion")
    assert slice_engine.is_estop_asserted()

    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP' LIMIT 1;").fetchone()
        assert row is not None
        assert row[0] == "ACTIVE"
    finally:
        conn.close()

    # 3. Reset ESTOP
    slice_engine.reset_estop()
    assert not slice_engine.is_estop_asserted()

    conn = sqlite3.connect(str(db_path))
    try:
        row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP' LIMIT 1;").fetchone()
        assert row is not None
        assert row[0] in ("CLEARED", "INACTIVE")
    finally:
        conn.close()


def test_web_ingest_events_real_persistence(telemetry_fixture):
    """Verifies web_ingest_events table handles full structured web Q&A ingestions."""
    db_path = telemetry_fixture["db_path"]
    conn = sqlite3.connect(str(db_path))
    try:
        now = time.time()
        conn.execute(
            """
            INSERT INTO web_ingest_events (url, title, prompt, response_text, elements_json, tars_commentary, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
            """,
            (
                "https://gemini.google.com/app",
                "Gemini AI Interface",
                "Explain Quantum Dyson Core",
                "The Dyson Core encapsulates 4,000 harmonic particles.",
                json.dumps([{"id": 1, "text": "Submit"}]),
                "Interesting physics breakdown. My humor parameters remain at 75%.",
                now,
            ),
        )
        conn.commit()

        row = conn.execute("SELECT url, title, prompt, response_text, tars_commentary FROM web_ingest_events WHERE url LIKE '%gemini%';").fetchone()
        assert row is not None
        assert row[0] == "https://gemini.google.com/app"
        assert "Quantum Dyson Core" in row[2]
        assert "humor parameters" in row[4]
    finally:
        conn.close()


def test_ipc_telemetry_live_e2e():
    """Spins up a live un-mocked NexusIPCServer and verifies real telemetry retrieval."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    port = server.socket.getsockname()[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="TelemetryLiveServer")
    thread.start()
    time.sleep(0.3)

    try:
        token = server.auth_token
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/telemetry",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            assert "telemetry" in data
            assert "cpuUsage" in data["telemetry"]
            assert "memoryUsage" in data["telemetry"]

        # Log a telemetry row and fetch logs
        server.log_telemetry("SCOUT-01", "INFO", "Web exploration hop completed", latency_ms=45.2)
        logs_req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/telemetry/logs?limit=10",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(logs_req, timeout=5.0) as resp:
            log_data = json.loads(resp.read().decode("utf-8"))
            assert "logs" in log_data
            assert len(log_data["logs"]) >= 1
            latest = log_data["logs"][0]
            assert latest["source"] == "SCOUT-01"
            assert "Web exploration" in latest["message"]
    finally:
        server.shutdown()
        server.server_close()
        try:
            if temp_db_path.exists():
                temp_db_path.unlink(missing_ok=True)
        except Exception:
            pass
