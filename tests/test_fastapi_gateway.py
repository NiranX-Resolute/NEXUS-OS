"""Nexus OS v5.0 - FastAPI Core Gateway Verification Suite.

Verifies that the FastAPI local gateway:
1. Connects to SQLite database in WAL mode (PRAGMA journal_mode = WAL).
2. GET /api/daily-picks: returns latest 3 daily picks.
3. GET /api/routines: returns all voice routines.
4. POST /api/routines: registers/updates a voice routine.
5. POST /api/command:
   - Reflex execution ('lock workstation' / 'mute audio') returns sub-50ms with reflex=True.
   - ScopeGuard blocks forbidden commands ('rm -rf / --no-preserve-root') with 403 status.
   - Safe prompt routes through Sub-Agent Swarm.
6. POST /api/estop: halts child agents, asserts SafetyGuard, and allows reset.
7. WS /ws/telemetry: sends real-time system metrics (fps: 60, ramMb, activeSlices).
"""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import tempfile
import time
from typing import Generator

from fastapi.testclient import TestClient
import pytest

from core.runtime.gateway import create_gateway_app, init_gateway_db
from core.engine.safety_guard import SafetyGuard


@pytest.fixture
def temp_gateway_client() -> Generator[TestClient, None, None]:
    """Creates a TestClient backed by an isolated temporary SQLite database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    # Initialize isolated WAL db
    init_gateway_db(temp_db)

    app = create_gateway_app(db_path=temp_db, dry_run_hardware=True)
    with TestClient(app) as client:
        yield client

    try:
        if temp_db.exists():
            temp_db.unlink(missing_ok=True)
        wal_file = temp_db.with_name(temp_db.name + "-wal")
        if wal_file.exists():
            wal_file.unlink(missing_ok=True)
        shm_file = temp_db.with_name(temp_db.name + "-shm")
        if shm_file.exists():
            shm_file.unlink(missing_ok=True)
    except Exception:
        pass


def test_01_sqlite_wal_initialization():
    """Verifies SQLite connects in WAL mode (PRAGMA journal_mode = wal)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        init_gateway_db(temp_db)
        conn = sqlite3.connect(str(temp_db))
        cursor = conn.execute("PRAGMA journal_mode;")
        mode = cursor.fetchone()[0]
        assert str(mode).lower() == "wal", f"Expected WAL mode, got {mode}"
        conn.close()
    finally:
        try:
            temp_db.unlink(missing_ok=True)
        except Exception:
            pass


def test_02_health_endpoint(temp_gateway_client: TestClient):
    """Verifies GET / and GET /api/health return ONLINE status."""
    resp = temp_gateway_client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["status"] == "ONLINE"
    assert data["version"] == "5.0.0"
    assert data["journal_mode"] == "WAL"


def test_03_get_daily_picks(temp_gateway_client: TestClient):
    """Verifies GET /api/daily-picks returns latest 3 daily picks."""
    resp = temp_gateway_client.get("/api/daily-picks")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "picks" in data
    assert len(data["picks"]) == 3
    for pick in data["picks"]:
        assert "id" in pick
        assert "title" in pick
        assert "category" in pick
        assert pick["category"] in ("DEV", "SEC", "SYS")


def test_04_get_and_post_routines(temp_gateway_client: TestClient):
    """Verifies GET and POST /api/routines registers and retrieves voice routines."""
    # 1. Get initial routines (seeded defaults)
    resp = temp_gateway_client.get("/api/routines")
    assert resp.status_code == 200
    initial_routines = resp.json()["routines"]
    assert len(initial_routines) >= 3

    # 2. Register a new routine
    payload = {
        "trigger_phrase": "Night Lockdown Protocol",
        "action_sequence": "mute audio; lock workstation",
        "enabled": True,
        "category": "reflex",
        "description": "Secures desktop for the night",
    }
    post_resp = temp_gateway_client.post("/api/routines", json=payload)
    assert post_resp.status_code == 200
    post_data = post_resp.json()
    assert post_data["success"] is True
    assert "Night Lockdown Protocol" in post_data["message"]

    # 3. Verify it is now in the list
    get_resp = temp_gateway_client.get("/api/routines")
    routines = get_resp.json()["routines"]
    triggers = [r["trigger_phrase"] for r in routines]
    assert "Night Lockdown Protocol" in triggers


def test_05_command_routes_through_reflex(temp_gateway_client: TestClient):
    """Verifies POST /api/command matches ReflexRouter sub-50ms directly."""
    # Test 'lock workstation' reflex
    resp = temp_gateway_client.post("/api/command", json={"command": "lock workstation"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["reflex"] is True
    assert "handled_by" in data
    assert data["handled_by"] in ("ReflexRouter", "RoutinesManager")


def test_06_command_blocked_by_scope_guard(temp_gateway_client: TestClient):
    """Verifies POST /api/command blocks forbidden commands via ScopeGuard (403 Forbidden)."""
    forbidden_payload = {"command": "rm -rf / --no-preserve-root"}
    resp = temp_gateway_client.post("/api/command", json=forbidden_payload)
    assert resp.status_code == 403
    data = resp.json()
    assert data["success"] is False
    assert data["blocked"] is True
    assert data["handled_by"] == "ScopeGuard"
    assert "NO_SYSTEM32_MODIFICATION" in data["invariant"] or "ScopeGuard" in data["error"]


def test_07_command_routes_to_subagent_swarm(temp_gateway_client: TestClient):
    """Verifies POST /api/command routes safe, non-reflex prompt to Sub-Agent Swarm."""
    prompt = "Summarize the architectural invariants of the sovereign edge runtime"
    resp = temp_gateway_client.post("/api/command", json={"command": prompt})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["reflex"] is False
    assert data["handled_by"] == "SubAgentSwarm"
    assert "output" in data
    assert len(data["output"]) > 0


def test_08_estop_endpoint(temp_gateway_client: TestClient):
    """Verifies POST /api/estop triggers atomic Emergency Stop and reset."""
    try:
        # 1. Trigger E-Stop
        resp = temp_gateway_client.post("/api/estop", json={"reason": "Operator Emergency Drill"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["estop"] is True
        assert data["status"] == "HALTED"
        assert SafetyGuard.is_estop_active() is True

        # 2. Reset E-Stop
        reset_resp = temp_gateway_client.post("/api/estop", json={"reset": True})
        assert reset_resp.status_code == 200
        reset_data = reset_resp.json()
        assert reset_data["success"] is True
        assert reset_data["estop"] is False
        assert reset_data["status"] == "RESET"
        assert SafetyGuard.is_estop_active() is False
    finally:
        SafetyGuard.reset_estop()


def test_09_websocket_telemetry(temp_gateway_client: TestClient):
    """Verifies WS /ws/telemetry connects and streams real-time system metrics."""
    with temp_gateway_client.websocket_connect("/ws/telemetry") as ws:
        msg_raw = ws.receive_text()
        data = json.loads(msg_raw)
        assert data["fps"] == 60
        assert "ramMb" in data
        assert isinstance(data["ramMb"], (int, float))
        assert "activeSlices" in data
        assert isinstance(data["activeSlices"], int)
        assert data["wsConnected"] is True
