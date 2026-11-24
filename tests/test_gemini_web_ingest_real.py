"""Nexus OS v5.0 - Gemini Web Passive Ingest Bridge & TARS Commentary Real Test Suite.

ZERO MOCKS & ZERO STUBS:
Verifies real end-to-end integration between:
1. Manifest V3 Chrome Extension bundle (apps/browser_bridge/)
2. Local IPC Server (POST & GET /api/bridge/web-ingest on 127.0.0.1)
3. Bearer Token loopback authentication guard
4. WorkspaceGovernor [SILENT] air-gap lock (HTTP 403)
5. SQLite WAL persistence in web_ingest_events table
6. Sovereign Store FTS5 + Hybrid RRF Memory indexing
7. Real-time telemetry pulses (MEMORY circuit_pulse & SCOUT-01 agent_slice)
8. TARS neural TTS speech hygiene sanitization (sanitize_for_tts)
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

from core.bridge.persona_engine import sanitize_for_tts
from core.memory.sovereign_store import SovereignMemoryStore, SovereignStore
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture(scope="module")
def real_ipc_fixture() -> Generator[dict, None, None]:
    """Spawns an un-mocked, real NexusIPCServer on an ephemeral loopback port."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    # Initialize real server with real SQLite WAL store
    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="GeminiWebIngestTestServer")
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
        raw = he.read().decode("utf-8")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"raw": raw}
        return he.code, parsed


class TestGeminiWebIngestReal:
    """Zero-mock integration tests for Gemini Web Ingest and TARS commentary bridge."""

    def test_extension_bundle_integrity(self):
        """Verifies Manifest V3 extension structure and required configurations."""
        ext_dir = Path("apps/browser_bridge")
        assert ext_dir.exists(), "apps/browser_bridge directory must exist"

        manifest_file = ext_dir / "manifest.json"
        content_file = ext_dir / "content.js"
        bg_file = ext_dir / "background.js"
        popup_html = ext_dir / "popup.html"
        popup_js = ext_dir / "popup.js"

        assert manifest_file.exists(), "manifest.json must exist"
        assert content_file.exists(), "content.js must exist"
        assert bg_file.exists(), "background.js must exist"
        assert popup_html.exists(), "popup.html must exist"
        assert popup_js.exists(), "popup.js must exist"

        # Validate Manifest V3 JSON schema
        manifest_data = json.loads(manifest_file.read_text(encoding="utf-8"))
        assert manifest_data.get("manifest_version") == 3
        assert "storage" in manifest_data.get("permissions", [])
        assert "http://127.0.0.1:47630/*" in manifest_data.get("host_permissions", [])

        # Validate content script matches
        scripts = manifest_data.get("content_scripts", [])
        assert len(scripts) > 0
        assert "https://gemini.google.com/*" in scripts[0].get("matches", [])
        assert "content.js" in scripts[0].get("js", [])

        # Validate background worker & action popup
        assert manifest_data.get("background", {}).get("service_worker") == "background.js"
        assert manifest_data.get("action", {}).get("default_popup") == "popup.html"

        # Validate content.js quiet-window debounce
        content_text = content_file.read_text(encoding="utf-8")
        assert "450" in content_text, "content.js must implement 450ms quiet-window debounce"
        assert "shadowRoot" in content_text, "content.js must recursively walk shadowRoot trees"
        assert "MutationObserver" in content_text

        # Validate background.js relay logic
        bg_text = bg_file.read_text(encoding="utf-8")
        assert "http://127.0.0.1:47630/api/bridge/web-ingest" in bg_text
        assert "nexus_bearer_token" in bg_text
        assert "speak_commentary" in bg_text

    def test_unauthorized_post_blocked_401(self, real_ipc_fixture):
        """Verifies POST /api/bridge/web-ingest strictly requires valid Bearer token."""
        base_url = real_ipc_fixture["base_url"]
        url = f"{base_url}/api/bridge/web-ingest"

        # 1. No Authorization header
        status, res = _http_request(url, method="POST", body={"prompt": "test", "response": "test"})
        assert status == 401, f"Expected 401 Unauthorized without token, got {status}"
        assert res.get("success") is False

        # 2. Invalid Bearer token
        status, res = _http_request(
            url,
            method="POST",
            headers={"Authorization": "Bearer bad_secret_token_12345"},
            body={"prompt": "test", "response": "test"},
        )
        assert status == 401, f"Expected 401 Unauthorized with invalid token, got {status}"
        assert res.get("success") is False

    def test_authenticated_web_ingest_and_persistence(self, real_ipc_fixture):
        """Verifies authenticated ingestion, SQLite WAL persistence, FTS5 indexing, and telemetry."""
        base_url = real_ipc_fixture["base_url"]
        token = real_ipc_fixture["token"]
        db_path = real_ipc_fixture["db_path"]
        server: NexusIPCServer = real_ipc_fixture["server"]

        # Ensure DEV workspace mode
        server.workspace_governor.set_mode("DEV")

        ingest_payload = {
            "source": "gemini_web",
            "url": "https://gemini.google.com/app/c84bf8e901a",
            "prompt": "How does SQLite WAL mode prevent reader-writer lock contention?",
            "response": "SQLite Write-Ahead Logging writes transactions to a separate WAL file while readers snapshot memory-mapped indices.",
            "speak_commentary": False,
        }

        status, res = _http_request(
            f"{base_url}/api/bridge/web-ingest",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            body=ingest_payload,
        )

        assert status == 201, f"Expected 201 Created, got {status}: {res}"
        assert res.get("success") is True
        assert res.get("source") == "gemini_web"
        assert res.get("workspace_mode") == "DEV"
        assert "id" in res and (res["id"].startswith("ingest_") or res["id"].startswith("ingest-"))
        assert "commentary" in res and len(res["commentary"]) > 0

        event_id = res["id"]

        # 1. Verify exact database row in web_ingest_events table
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            row = conn.execute("SELECT * FROM web_ingest_events WHERE id = ? LIMIT 1;", (event_id,)).fetchone()
            assert row is not None, f"Event {event_id} was not persisted in web_ingest_events"
            assert row["source"] == "gemini_web"
            assert row["url"] == ingest_payload["url"]
            assert row["prompt"] == ingest_payload["prompt"]
            assert row["response"] == ingest_payload["response"]
            assert row["workspace_mode"] == "DEV"
            assert row["commentary"] == res["commentary"]
            assert row["created_at"] is not None

            # 2. Verify Sovereign Memory indexing via FTS5
            search_hits = server.memory_store.search_text("reader-writer lock contention", namespace="dev")
            assert len(search_hits) >= 1, "Ingested event was not indexed in SovereignStore FTS5"
            assert "SQLite Write-Ahead Logging" in search_hits[0]["content"]

            # 3. Verify Telemetry circuit_pulse (MEMORY) and agent_slice (SCOUT-01)
            telemetry_events = conn.execute(
                "SELECT * FROM telemetry_events ORDER BY id DESC LIMIT 20;"
            ).fetchall()
            event_types = [r["event_type"] for r in telemetry_events]
            assert "circuit_pulse" in event_types, "MEMORY circuit pulse must be emitted"
            assert "agent_slice" in event_types, "SCOUT-01 agent_slice must be emitted"

            # Check circuit_pulse payload has node="MEMORY"
            pulse_payloads = [
                json.loads(r["payload_json"])
                for r in telemetry_events
                if r["event_type"] == "circuit_pulse"
            ]
            memory_pulses = [p for p in pulse_payloads if p.get("node") == "MEMORY"]
            assert len(memory_pulses) > 0, "Telemetry must contain node='MEMORY' pulse"
        finally:
            conn.close()

    def test_get_web_ingest_status_and_recent_events(self, real_ipc_fixture):
        """Verifies GET /api/bridge/web-ingest returns connection status and list of events."""
        base_url = real_ipc_fixture["base_url"]
        token = real_ipc_fixture["token"]

        status, res = _http_request(
            f"{base_url}/api/bridge/web-ingest",
            method="GET",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert status == 200, f"Expected 200 OK, got {status}: {res}"
        assert res.get("success") is True
        assert res.get("status") == "Connected"
        assert res.get("workspace_mode") == "DEV"
        assert res.get("air_gapped") is False
        assert isinstance(res.get("events"), list)
        assert len(res["events"]) >= 1

    def test_silent_workspace_mode_air_gap_block_403(self, real_ipc_fixture):
        """Verifies WorkspaceGovernor.active_mode == 'SILENT' blocks ingest with HTTP 403."""
        base_url = real_ipc_fixture["base_url"]
        token = real_ipc_fixture["token"]
        server: NexusIPCServer = real_ipc_fixture["server"]

        # Activate SILENT air-gapped workspace mode
        server.workspace_governor.set_mode("SILENT")
        assert server.workspace_governor.get_mode() == "SILENT"

        payload = {
            "source": "gemini_web",
            "url": "https://gemini.google.com/app/blocked_session",
            "prompt": "Air-gap security test prompt",
            "response": "This response should be rejected with HTTP 403.",
            "speak_commentary": False,
        }

        # Ingestion must be blocked with HTTP 403
        status, res = _http_request(
            f"{base_url}/api/bridge/web-ingest",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            body=payload,
        )

        assert status == 403, f"Expected 403 Forbidden in SILENT mode, got {status}: {res}"
        assert res.get("success") is False
        assert res.get("air_gapped") is True
        assert res.get("workspace_mode") == "SILENT"

        # GET status must report SILENT Air-Gap
        get_status, get_res = _http_request(
            f"{base_url}/api/bridge/web-ingest",
            method="GET",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert get_status == 200
        assert get_res.get("status") == "SILENT Air-Gap"
        assert get_res.get("air_gapped") is True

        # Revert back to DEV mode
        server.workspace_governor.set_mode("DEV")
        assert server.workspace_governor.get_mode() == "DEV"

    def test_tars_commentary_and_speech_sanitization(self, real_ipc_fixture):
        """Verifies TARS commentary route with sanitize_for_tts strips all markdown clutter."""
        base_url = real_ipc_fixture["base_url"]
        token = real_ipc_fixture["token"]
        server: NexusIPCServer = real_ipc_fixture["server"]
        server.workspace_governor.set_mode("DEV")

        # 1. Direct verify of sanitize_for_tts
        markdown_sample = """
        Here is the solution in Python:
        ```python
        def compute():
            return 42
        ```
        Check [Documentation](https://nexus-os.org) and use `sqlite3` *carefully*!
        """
        clean_speech = sanitize_for_tts(markdown_sample)
        assert "```" not in clean_speech
        assert "def compute" not in clean_speech
        assert "https://" not in clean_speech
        assert "`" not in clean_speech
        assert "*" not in clean_speech
        assert "Documentation" in clean_speech

        # 2. Ingest with speak_commentary=True
        payload = {
            "source": "gemini_web",
            "url": "https://gemini.google.com/app/tars_voice_test",
            "prompt": "Evaluate the architectural elegance of Nexus OS v5.0.",
            "response": "Nexus OS v5.0 achieves complete local-first sovereignty with zero cloud lock-in.",
            "speak_commentary": True,
        }

        status, res = _http_request(
            f"{base_url}/api/bridge/web-ingest",
            method="POST",
            headers={"Authorization": f"Bearer {token}"},
            body=payload,
        )

        assert status == 201
        assert res.get("success") is True
        assert len(res.get("commentary", "")) > 0
        # Verify commentary contains no markdown symbols
        commentary = res["commentary"]
        for forbidden in ["```", "*", "#", "http://", "https://", "`"]:
            assert forbidden not in commentary, f"Forbidden symbol '{forbidden}' found in TTS commentary"
