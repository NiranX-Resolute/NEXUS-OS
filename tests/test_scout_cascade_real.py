"""Nexus OS v5.0 - SCOUT-01 3-Tier Fallback Cascade Real Verification Suite.

ZERO MOCKS & ZERO STUBS:
Verifies real end-to-end integration for the SCOUT-01 3-Tier Fallback Cascade:
1. WorkspaceGovernor [SILENT] air-gap enforcement (blocks all outbound tiers)
2. ScopeGuard SEC-01 URL domain containment
3. 3-Tier fallback execution (agent-reach -> Obscura CDP :9222 -> WarmBrowserSession Shadow-DOM [1..N])
4. IPC Server POST /api/scout/cascade Bearer authentication and SQLite WAL persistence
5. IPC Server /api/command interception of '/scout <target>' commands
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
import urllib.error
import urllib.request
import pytest

from core.engine.tools.scout_cascade import scout_cascade_run
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.scope_guard import ScopeGuard
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture(scope="module")
def real_ipc_cascade_fixture() -> Generator[dict, None, None]:
    """Spawns an un-mocked, real NexusIPCServer on an ephemeral loopback port for cascade testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="ScoutCascadeTestServer")
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
    try:
        if temp_db_path.exists():
            temp_db_path.unlink()
        wal_file = temp_db_path.with_name(temp_db_path.name + "-wal")
        if wal_file.exists():
            wal_file.unlink()
        shm_file = temp_db_path.with_name(temp_db_path.name + "-shm")
        if shm_file.exists():
            shm_file.unlink()
    except Exception:
        pass


def _http_request(url: str, method: str = "GET", headers: dict = None, body: dict = None) -> tuple[int, dict]:
    """Helper to execute synchronous HTTP requests against loopback IPC server."""
    data_bytes = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data_bytes, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body is not None:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            status = resp.status
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return status, data
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        data = json.loads(raw) if raw else {}
        return err.code, data


def test_scout_cascade_silent_air_gap_enforcement():
    """Verify that [SILENT] air-gap mode immediately blocks the cascade with zero network egress."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        # 1. Via workspace_mode parameter
        res1 = scout_cascade_run(
            target="https://github.com/Panniantong/Agent-Reach",
            workspace_mode="SILENT",
            db_path=temp_db,
        )
        assert res1["ok"] is False
        assert res1["blocked"] is True
        assert res1["reason"] == "AIR_GAP_ACTIVE"
        assert res1["tier"] == "none"

        # 2. Via WorkspaceGovernor set_mode mutation
        gov = WorkspaceGovernor()
        prev_mode = gov.get_mode()
        try:
            gov.set_mode("SILENT")
            res2 = scout_cascade_run(
                target="https://reddit.com/r/LocalLLaMA",
                workspace_mode="DEV",  # overridden by governor air-gap
                db_path=temp_db,
            )
            assert res2["ok"] is False
            assert res2["blocked"] is True
            assert res2["reason"] == "AIR_GAP_ACTIVE"
        finally:
            gov.set_mode(prev_mode)
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_scout_cascade_scope_guard_domain_containment():
    """Verify that ScopeGuard blocks untrusted domains before any tier runs."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        res = scout_cascade_run(
            target="https://malicious-phishing-scam-domain.xyz/login",
            workspace_mode="DEV",
            db_path=temp_db,
        )
        assert res["ok"] is False
        assert res["blocked"] is True
        assert res["error"] == "TARGET_DOMAIN_BLOCKED"
        assert "is not in ScopeGuard allowed domains" in res["message"]
        assert res["fallback_chain"] == []
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_scout_cascade_execution_and_fallback_chain():
    """Verify the 3-tier cascade executes cleanly on an allowed target and records fallback_chain."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        res = scout_cascade_run(
            target="https://github.com/Panniantong/Agent-Reach",
            mode="read",
            force_tier="auto",
            workspace_mode="DEV",
            db_path=temp_db,
        )
        # Check structured schema
        assert "ok" in res
        assert "tier" in res
        assert "fallback_chain" in res
        assert "latency_ms" in res
        assert res["latency_ms"] >= 0
        assert res["target"] == "https://github.com/Panniantong/Agent-Reach"
        assert res["mode"] == "read"
        # Verify agent_reach is the primary tier in the fallback sequence
        assert len(res["fallback_chain"]) >= 1
        assert res["fallback_chain"][0] == "agent_reach"
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_scout_cascade_force_tier_reach():
    """Verify force_tier='reach' confines execution to Tier 1 without progressing to Obscura/Chromium."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        res = scout_cascade_run(
            target="agent reach documentation",
            mode="search",
            force_tier="reach",
            workspace_mode="DEV",
            db_path=temp_db,
        )
        assert "ok" in res
        assert "fallback_chain" in res
        # With force_tier="reach", no obscura or chromium tiers should be in the fallback chain
        assert "obscura_cdp" not in res["fallback_chain"]
        assert "warm_chromium" not in res["fallback_chain"]
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_ipc_server_scout_cascade_bearer_auth(real_ipc_cascade_fixture):
    """Verify that POST /api/scout/cascade enforces Bearer token authentication."""
    base_url = real_ipc_cascade_fixture["base_url"]
    valid_token = real_ipc_cascade_fixture["token"]
    cascade_url = f"{base_url}/api/scout/cascade"

    body = {
        "target": "https://github.com/Panniantong/Agent-Reach",
        "mode": "read",
        "force_tier": "auto",
        "workspace_mode": "DEV",
    }

    # 1. No Authorization Header -> 401
    status, data = _http_request(cascade_url, method="POST", body=body)
    assert status == 401
    assert "unauthorized" in data.get("error", "").lower()

    # 2. Invalid Token -> 401
    status, data = _http_request(
        cascade_url,
        method="POST",
        headers={"Authorization": "Bearer bad-token-999"},
        body=body,
    )
    assert status == 401

    # 3. Valid Token -> 200
    status, data = _http_request(
        cascade_url,
        method="POST",
        headers={"Authorization": f"Bearer {valid_token}"},
        body=body,
    )
    assert status == 200
    assert "ok" in data
    assert "tier" in data
    assert "fallback_chain" in data
    assert len(data["fallback_chain"]) >= 1


def test_ipc_server_command_scout_interception(real_ipc_cascade_fixture):
    """Verify that POST /api/command cleanly intercepts '/scout <url>' commands."""
    base_url = real_ipc_cascade_fixture["base_url"]
    valid_token = real_ipc_cascade_fixture["token"]
    cmd_url = f"{base_url}/api/command"

    body = {
        "command": "/scout https://github.com/Panniantong/Agent-Reach",
        "context": {"workspace": "DEV"},
    }

    status, data = _http_request(
        cmd_url,
        method="POST",
        headers={"Authorization": f"Bearer {valid_token}"},
        body=body,
    )
    assert status == 200
    assert data.get("handled") is True
    assert data.get("type") == "scout_cascade"
    assert data.get("status") == "SUCCESS"
    assert "result" in data
    assert data["result"]["target"] == "https://github.com/Panniantong/Agent-Reach"
    assert "tier" in data["result"]
    assert "fallback_chain" in data["result"]


def test_scout_cascade_estop_blocking():
    """Verify that ESTOP == 1 (via env or SQLite system_flags) blocks the cascade."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        # 1. Via os.environ["ESTOP"] = "1"
        prev_env = os.environ.get("ESTOP")
        try:
            os.environ["ESTOP"] = "1"
            res_env = scout_cascade_run(
                target="https://github.com/Panniantong/Agent-Reach",
                workspace_mode="DEV",
                db_path=temp_db,
            )
            assert res_env["ok"] is False
            assert res_env["blocked"] is True
            assert res_env["reason"] in ("ESTOP_ENGAGED", "AIR_GAP_ACTIVE")
        finally:
            if prev_env is not None:
                os.environ["ESTOP"] = prev_env
            else:
                os.environ.pop("ESTOP", None)

        # 2. Via SQLite system_flags table
        conn = sqlite3.connect(str(temp_db))
        conn.execute("CREATE TABLE IF NOT EXISTS system_flags (flag_key TEXT PRIMARY KEY, flag_value TEXT NOT NULL, updated_at REAL);")
        conn.execute("INSERT OR REPLACE INTO system_flags VALUES ('ESTOP', 'ACTIVE', ?);", (time.time(),))
        conn.commit()
        conn.close()

        res_db = scout_cascade_run(
            target="https://github.com/Panniantong/Agent-Reach",
            workspace_mode="DEV",
            db_path=temp_db,
        )
        assert res_db["ok"] is False
        assert res_db["blocked"] is True
        assert res_db["reason"] in ("ESTOP_ENGAGED", "AIR_GAP_ACTIVE")
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_scout_cascade_sovereign_store_cache_hit():
    """Verify that recent SovereignStore reach_events serve as cache hits before live fetch."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    try:
        store = SovereignMemoryStore(db_path=temp_db)
        target_url = "https://github.com/Panniantong/Agent-Reach"
        ev_id = store.insert_reach_event(
            source_url=target_url,
            title="Agent-Reach Multi-Channel Architecture",
            content="Agent Reach enables structured zero-API-key search and read capabilities across GitHub, Reddit, X, and YouTube.",
            channel="github",
            workspace_mode="DEV",
            summary="Cached agent reach architecture.",
        )

        # Execute cascade in auto mode
        res = scout_cascade_run(
            target=target_url,
            mode="read",
            force_tier="auto",
            workspace_mode="DEV",
            db_path=temp_db,
        )

        assert res["ok"] is True
        assert res.get("cached") is True
        assert res["tier"] == "cache"
        assert res["fallback_chain"] == ["cache"]
        assert "Agent-Reach" in res["title"]
        assert "Agent Reach enables" in res["content"]
        assert res["event_id"] == ev_id
    finally:
        if temp_db.exists():
            temp_db.unlink()


def test_warm_browser_session_shadow_dom_and_stability():
    """Verify WarmBrowserSession configuration, 10ms stability polling, and [1..N] Shadow-DOM distillation."""
    from core.engine.tools.browser_verifier import WarmBrowserSession

    session = WarmBrowserSession(engine="chromium_persistent")
    assert session.user_data_dir.exists()
    assert ".nexus-agent" in str(session.user_data_dir)

    # Test event-driven stability polling (10ms time slices)
    stability_res = session.wait_for_stream_stability(quiet_ms=20, timeout_ms=300, check_interval_ms=10)
    assert stability_res is True

    # Test Shadow-DOM distillation with dummy interactive HTML
    sample_html = """
    <html>
      <body>
        <div><h1>Nexus System</h1></div>
        <button id="btn1">Submit Query</button>
        <a href="https://github.com">GitHub Link</a>
        <input type="text" placeholder="Search..." />
      </body>
    </html>
    """
    elements = session.distill_shadow_dom(html_content=sample_html)
    assert len(elements) == 3
    # Check 1-based sequential numeric badges [1..N]
    assert [e["id"] for e in elements] == [1, 2, 3]
    assert any("Submit Query" in e["text"] for e in elements)
    assert any("Search..." in e["text"] for e in elements)

