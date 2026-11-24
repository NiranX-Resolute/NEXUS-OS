"""Nexus OS v5.0 - Agent Reach Real Integration Verification Suite.

ZERO MOCKS & ZERO STUBS:
Verifies real end-to-end integration for Agent Reach (agentreach.cfd / Panniantong/Agent-Reach):
1. WorkspaceGovernor [SILENT] mode air-gap enforcement (blocks external network calls)
2. ScopeGuard SEC-01 allowlist and target URL containment
3. scout_reach_doctor, scout_reach_read, and scout_reach_search tool execution
4. Real SQLite WAL persistence in reach_events and SovereignStore FTS5 indexing
5. Loopback IPC endpoints (GET /api/scout/reach/status, POST /api/scout/reach/read, POST /api/scout/reach/search) with Bearer token authentication
6. Automatic seeding and verification of /skill:agent-reach in ecc_skills
"""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Generator
import urllib.error
import urllib.request
import pytest

from core.mcp.plugins.agent_reach_plugin import (
    AGENT_REACH_DOCS,
    AGENT_REACH_PINNED_VERSION,
    scout_reach_doctor,
    scout_reach_read,
    scout_reach_search,
    seed_agent_reach_skill,
)
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.scope_guard import ScopeGuard
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture(scope="module")
def real_ipc_reach_fixture() -> Generator[dict, None, None]:
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

    t = threading.Thread(target=server.serve_forever, daemon=True, name="AgentReachTestServer")
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
    """Helper to execute synchronous HTTP requests against the real loopback IPC server."""
    data_bytes = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data_bytes, method=method)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body is not None:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            status = resp.status
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return status, data
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        data = json.loads(raw) if raw else {}
        return err.code, data


class TestAgentReachScoutReal:
    """Zero-mock, production-grade test suite for Agent Reach in SCOUT-01."""

    def test_scout_reach_doctor_diagnostic_readiness(self) -> None:
        """Verifies doctor diagnostic check returns structured status without crashing."""
        res = scout_reach_doctor()
        assert isinstance(res, dict)
        assert "installed" in res
        assert res.get("pinned_version") == AGENT_REACH_PINNED_VERSION
        assert res.get("install_cmd") == "uv tool install agent-reach"
        assert res.get("docs") == AGENT_REACH_DOCS

    def test_workspace_governor_silent_mode_air_gap_block(self) -> None:
        """Verifies [SILENT] air-gap strictly blocks outbound agent-reach read and search."""
        governor = WorkspaceGovernor()
        original_mode = governor.get_mode()
        try:
            governor.set_mode("SILENT")
            assert governor.is_silent() is True

            read_res = scout_reach_read(
                target="https://github.com/Panniantong/Agent-Reach",
                workspace_mode="SILENT",
            )
            assert read_res["ok"] is False
            assert read_res["blocked"] is True
            assert "SILENT mode blocks external network calls" in read_res["reason"]

            search_res = scout_reach_search(
                query="open source scrapers",
                channel="github",
                workspace_mode="SILENT",
            )
            assert search_res["ok"] is False
            assert search_res["blocked"] is True
            assert "SILENT mode blocks external network calls" in search_res["reason"]
        finally:
            governor.set_mode(original_mode)

    def test_scope_guard_blocks_out_of_scope_target(self) -> None:
        """Verifies ScopeGuard blocks disallowed/out-of-scope targets cleanly."""
        unauthorized_target = "https://malicious-external-payload.xyz/leak"
        res = scout_reach_read(target=unauthorized_target, workspace_mode="DEV")
        assert res["ok"] is False
        assert res["blocked"] is True
        assert "out of authorized scope" in res["reason"]

    def test_agent_reach_read_and_search_handle_cleanly(self) -> None:
        """Verifies structured error/result handling with zero unhandled exceptions."""
        valid_in_scope_target = "https://github.com/Panniantong/Agent-Reach"
        res = scout_reach_read(target=valid_in_scope_target, workspace_mode="DEV")
        assert isinstance(res, dict)
        # Either installed (ok=True) or structured installation notice (ok=False, installed=False)
        if not res.get("ok"):
            assert res.get("installed") is False or "error" in res
            if res.get("installed") is False:
                assert "agent-reach CLI not found" in res.get("error", "")
        else:
            assert "title" in res
            assert res.get("channel") == "github"

        search_res = scout_reach_search(query="agent reach", channel="all", workspace_mode="DEV")
        assert isinstance(search_res, dict)
        if not search_res.get("ok"):
            assert search_res.get("installed") is False or "error" in search_res
        else:
            assert "results" in search_res

    def test_sovereign_store_persistence_and_fts_roundtrip(self) -> None:
        """Verifies real SQLite WAL persistence and FTS5 retrieval in SovereignStore."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            temp_db = Path(tf.name)

        try:
            store = SovereignMemoryStore(db_path=temp_db)
            ev_id = store.insert_reach_event(
                source_url="https://github.com/Panniantong/Agent-Reach",
                title="Agent Reach Upstream Repository",
                content="Panniantong Agent Reach enables AI agents to read and search platforms like GitHub, Reddit, and YouTube without paid API keys.",
                channel="github",
                workspace_mode="DEV",
                summary="Agent Reach structured reader toolset.",
                metadata={"test_run": True, "agent": "SCOUT-01"},
            )
            assert ev_id.startswith("reach_")

            # 1. Verify reach_events table retrieval
            events = store.list_recent_reach_events(limit=10, workspace_mode="DEV")
            assert len(events) >= 1
            matched = next((e for e in events if e["id"] == ev_id), None)
            assert matched is not None
            assert matched["channel"] == "github"
            assert matched["title"] == "Agent Reach Upstream Repository"
            assert matched["metadata"]["test_run"] is True

            # 2. Verify FTS5 keyword search in memory_nodes
            search_results = store.search_text(query="Agent Reach", namespace="dev_context")
            assert len(search_results) >= 1
            assert any("Agent Reach" in r.get("title", "") for r in search_results)
        finally:
            if temp_db.exists():
                temp_db.unlink()
            wal = temp_db.with_name(temp_db.name + "-wal")
            if wal.exists():
                wal.unlink()
            shm = temp_db.with_name(temp_db.name + "-shm")
            if shm.exists():
                shm.unlink()

    def test_ipc_server_reach_endpoints_and_bearer_auth(self, real_ipc_reach_fixture: dict) -> None:
        """Verifies loopback REST/IPC endpoints for Agent Reach with Bearer token protection."""
        base_url = real_ipc_reach_fixture["base_url"]
        token = real_ipc_reach_fixture["token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 1. Unauthorized GET request is blocked (HTTP 401)
        status, unauth_data = _http_request(f"{base_url}/api/scout/reach/status", method="GET")
        assert status == 401
        assert unauth_data.get("success") is False

        # 2. Authorized GET request succeeds (HTTP 200)
        status, status_data = _http_request(
            f"{base_url}/api/scout/reach/status",
            method="GET",
            headers=auth_headers,
        )
        assert status == 200
        assert status_data.get("success") is True
        assert "status" in status_data
        assert "workspace_mode" in status_data

        # 3. Authorized POST out-of-scope URL is blocked (HTTP 403)
        status, blocked_data = _http_request(
            f"{base_url}/api/scout/reach/read",
            method="POST",
            headers=auth_headers,
            body={"target": "https://unauthorized-leak-target.xyz/data", "workspace_mode": "DEV"},
        )
        assert status == 403
        assert blocked_data.get("blocked") is True

        # 4. Authorized POST in SILENT mode is air-gap blocked (HTTP 403)
        status, silent_data = _http_request(
            f"{base_url}/api/scout/reach/read",
            method="POST",
            headers=auth_headers,
            body={"target": "https://github.com/Panniantong/Agent-Reach", "workspace_mode": "SILENT"},
        )
        assert status == 403
        assert silent_data.get("blocked") is True

        # 5. Authorized POST search in SILENT mode is air-gap blocked (HTTP 403)
        status, silent_search = _http_request(
            f"{base_url}/api/scout/reach/search",
            method="POST",
            headers=auth_headers,
            body={"query": "test query", "workspace_mode": "SILENT"},
        )
        assert status == 403
        assert silent_search.get("blocked") is True

    def test_ecc_skills_playbook_seeded(self) -> None:
        """Verifies /skill:agent-reach playbook seeds correctly into ecc_skills."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            temp_db = Path(tf.name)

        try:
            ok = seed_agent_reach_skill(db_path=temp_db)
            assert ok is True

            conn = sqlite3.connect(str(temp_db))
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM ecc_skills WHERE slug = 'agent-reach';").fetchone()
            assert row is not None
            assert row["orbiter_group"] == "SCOUT-01"
            assert row["package_url"] == "https://agentreach.cfd"
            assert row["verified"] == 1
            tools = json.loads(row["tools_json"])
            assert "scout_reach_read" in tools
            assert "scout_reach_search" in tools
            assert "scout_reach_doctor" in tools
            conn.close()
        finally:
            if temp_db.exists():
                temp_db.unlink()
