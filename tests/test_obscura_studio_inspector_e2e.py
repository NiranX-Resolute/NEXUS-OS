"""Nexus OS v5.0 - Obscura Dual-Engine Web Ingest & Studio Inspector E2E Test Suite.

MANDATORY RULES:
1. ZERO MOCKS: No unittest.mock, patch, or dummy stubs.
2. REAL PERSISTENCE: Verifies real NexusIPCServer, real SQLite WAL persistence in
   web_ingest_events, real SovereignStore FTS5 indexing, real WarmBrowserSession
   dual-engine routing, and 10ms event-driven stream stability.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Generator
import urllib.parse
import urllib.request
import pytest

from core.runtime.ipc_server import NexusIPCServer
from core.memory.sovereign_store import SovereignMemoryStore
from core.engine.tools.browser_verifier import WarmBrowserSession, JS_DOM_DISTILLER


def make_test_ipc_server() -> Generator[dict, None, None]:
    """Spins up a real un-mocked NexusIPCServer on an isolated test SQLite WAL database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="ObscuraTestServer")
    t.start()
    time.sleep(0.3)

    yield {
        "server": server,
        "db_path": temp_db_path,
        "token": server.auth_token,
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
def ipc_env() -> Generator[dict, None, None]:
    yield from make_test_ipc_server()


def test_01_obscura_browser_session_dual_engine():
    """Verifies that WarmBrowserSession routes between Obscura, Chromium, and Auto."""
    session = WarmBrowserSession(engine="auto")
    assert session.active_engine == "auto"

    switched = session.switch_engine("obscura")
    assert switched == "obscura"
    assert session.active_engine == "obscura"

    switched_chrom = session.switch_engine("chromium_persistent")
    assert switched_chrom == "chromium_persistent"
    assert session.active_engine == "chromium_persistent"

    # Test Shadow-DOM traversal script compilation
    assert "traverse(root, items, idCounter)" in JS_DOM_DISTILLER
    assert "el.shadowRoot" in JS_DOM_DISTILLER
    assert "data-nexus-id" in JS_DOM_DISTILLER


def test_02_stream_stability_event_driven():
    """Verifies that wait_for_stream_stability completes without fixed sleep."""
    session = WarmBrowserSession()
    t_start = time.perf_counter()
    stable = session.wait_for_stream_stability(quiet_ms=30, timeout_ms=300)
    elapsed_ms = (time.perf_counter() - t_start) * 1000
    assert stable is True
    # Should resolve quickly since DOM is static
    assert elapsed_ms < 250


def test_03_web_ingest_pipeline_real_sqlite_wal(ipc_env):
    """Posts a Gemini Q&A payload to /api/bridge/web-ingest and verifies WAL + FTS5 persistence."""
    base_url = ipc_env["base_url"]
    token = ipc_env["token"]
    db_path = ipc_env["db_path"]

    payload = {
        "url": "https://gemini.google.com/app",
        "title": "Quantum Error Correction Synthesis",
        "prompt": "Explain surface code stabilizer measurements and fault-tolerant thresholds.",
        "response": (
            "Surface code quantum error correction relies on arranging qubits in a 2D square lattice "
            "where data qubits store superpositions and syndrome qubits measure X and Z parity stabilizers. "
            "The fault-tolerant threshold is approximately 1% per gate under depolarizing noise."
        ),
        "elements": [
            {"id": 1, "tag": "button", "text": "Copy Answer", "rect": [100, 200, 80, 30]},
            {"id": 2, "tag": "a", "text": "Source Citations", "rect": [190, 200, 100, 30]},
        ],
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/bridge/web-ingest",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 201
        res = json.loads(resp.read().decode("utf-8"))
        assert res.get("success") is True
        event_id = res.get("id")
        assert event_id is not None
        assert event_id.startswith("ingest-") or event_id.startswith("ingest_")
        tars_comment = res.get("tars_commentary", "")
        assert len(tars_comment) > 0

    # 1. Verify directly in SQLite WAL database
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT id, url, title, prompt, response_text, tars_commentary FROM web_ingest_events WHERE id = ?;",
        (event_id,),
    )
    row = cur.fetchone()
    conn.close()

    assert row is not None
    assert row["url"] == "https://gemini.google.com/app"
    assert "surface code" in row["response_text"].lower()
    assert row["tars_commentary"] == tars_comment

    # 2. Verify recent events GET endpoint
    req_get = urllib.request.Request(
        f"{base_url}/api/bridge/web-ingest/recent?limit=10",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req_get, timeout=5.0) as resp:
        assert resp.status == 200
        get_res = json.loads(resp.read().decode("utf-8"))
        assert get_res.get("success") is True
        events = get_res.get("events", [])
        assert any(e["id"] == event_id for e in events)

    # 3. Verify Sovereign Memory Store FTS5 indexing
    store = SovereignMemoryStore(db_path=db_path)
    search_res = store.search_text(query="stabilizer measurements", limit=5)
    assert len(search_res) > 0
    assert any("stabilizer" in r.get("content", "").lower() for r in search_res)


def test_04_browser_engine_dispatch_via_ipc(ipc_env):
    """Verifies that /api/bridge/browser-engine handles engine dispatching."""
    base_url = ipc_env["base_url"]
    token = ipc_env["token"]

    req_data = json.dumps({
        "engine": "obscura",
        "action": "inspect",
        "url": "https://gemini.google.com",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/api/bridge/browser-engine",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        res = json.loads(resp.read().decode("utf-8"))
        assert res.get("success") is True
        assert res.get("engine") == "obscura"
        assert "dom" in res


def test_05_vault_secret_retrieval_via_ipc(ipc_env):
    """Verifies /api/vault/get endpoint returns structured response."""
    base_url = ipc_env["base_url"]
    token = ipc_env["token"]

    req_data = json.dumps({"key": "NEXUS_TEST_KEY"}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/vault/get",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        res = json.loads(resp.read().decode("utf-8"))
        assert res.get("success") is True
        assert "value" in res
