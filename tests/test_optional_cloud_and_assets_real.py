"""Nexus OS v5.0 - Optional Cloud Memory Sync, Kaggle VoxCPM2, Tailscale Burst & Asset Extractor Real Test Suite.

Verifies the 4 optional expansion modules with ZERO MOCKS:
1. Cloud Memory Replication: Stays dormant in STANDBY when unconfigured, strictly blocks
   egress in [SILENT] air-gap mode, enforces ESTOP, and integrates with SovereignMemoryStore.
2. Kaggle VoxCPM2 Server: Syntax/AST compilation and end-to-end VoxCPM2Client payload compatibility.
3. Tailscale Burst Routing: Timeout handling on offline endpoints, live node discovery, and
   SILENT air-gap containment.
4. Binary Asset Extractor: Indexing, SHA-256 calculation, ASAR binary unpacking, and manifest generation.
"""

from __future__ import annotations

import ast
import http.server
import io
import json
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import tempfile
import threading
import time
from typing import Any, Dict
import urllib.request
import wave

import pytest

from core.security.vault import CredentialVault
from core.runtime.workspaces import WorkspaceGovernor
from core.memory.cloud_sync import CloudMemorySyncAdapter
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.compute_pool import FederatedComputePool
from core.bridge.voxcpm_client import VoxCPM2Client
from scripts.kaggle_voxcpm2_server import SYNTHESIZER, app as voxcpm_app
from scripts.import_stonic_torvis_assets import ExternalAppImporter, BinaryAssetExtractor


# =============================================================================
# Test Fixtures (Zero Mocks: Isolated Real Temporary Environments)
# =============================================================================
@pytest.fixture
def temp_cloud_env():
    """Provisions isolated temp SQLite database, vault, and workspace manifest."""
    tmp_dir = tempfile.mkdtemp(prefix="nexus_cloud_test_")
    tmp_path = Path(tmp_dir)
    db_path = tmp_path / "agent_local_test.db"
    vault_db_path = tmp_path / "vault_test.db"
    manifest_path = tmp_path / "manifest_test.yaml"

    manifest_content = """
version: "5.0.0"
workspaces:
  DEV:
    allowed_paths: []
    mcp_servers: []
    allowed_mcp_tools: []
    security_level: "STANDARD"
  SILENT:
    allowed_paths: []
    mcp_servers: []
    allowed_mcp_tools: []
    security_level: "AIR_GAPPED"
runtime_defaults:
  active_mode: "DEV"
"""
    manifest_path.write_text(manifest_content.strip(), encoding="utf-8")

    WorkspaceGovernor._active_mode = "DEV"
    vault = CredentialVault(db_path=vault_db_path)
    governor = WorkspaceGovernor(manifest_path=str(manifest_path))
    adapter = CloudMemorySyncAdapter(vault=vault, governor=governor, db_path=db_path)

    yield {
        "tmp_path": tmp_path,
        "db_path": db_path,
        "vault": vault,
        "governor": governor,
        "adapter": adapter,
    }

    WorkspaceGovernor._active_mode = "DEV"
    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception:
        pass


@pytest.fixture(scope="module")
def live_voxcpm_server():
    """Spawns an actual Uvicorn server hosting kaggle_voxcpm2_server on a loopback port."""
    import asyncio
    import uvicorn

    test_port = 47647
    config = uvicorn.Config(app=voxcpm_app, host="127.0.0.1", port=test_port, log_level="error")
    server = uvicorn.Server(config=config)

    def _run_server():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(server.serve())

    thread = threading.Thread(target=_run_server, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{test_port}"

    # Wait up to 5 seconds for server to be responsive
    deadline = time.time() + 5.0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=0.5) as resp:
                if resp.status == 200:
                    break
        except Exception:
            time.sleep(0.1)

    yield base_url

    server.should_exit = True
    thread.join(timeout=2.0)


@pytest.fixture(scope="module")
def live_tailscale_burst_node():
    """Spawns a mock-free lightweight HTTP server mimicking a live Tailscale burst worker."""
    test_port = 47649

    class BurstTestHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            if self.path == "/health":
                payload = {
                    "status": "healthy",
                    "node_id": "tailscale-burst-worker",
                    "hostname": "nexus-burst-worker",
                    "cpu_cores": 8,
                    "ram_gb": 32.0,
                    "uptime_sec": 120.0,
                }
                body = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(404)
            self.end_headers()

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", test_port), BurstTestHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{test_port}"
    yield base_url

    httpd.shutdown()
    httpd.server_close()


# =============================================================================
# 1. OPTIONAL CLOUD MEMORY SYNC TESTS
# =============================================================================
class TestOptionalCloudMemorySync:
    """Verifies CloudMemorySyncAdapter behavior under unconfigured, SILENT, and ESTOP conditions."""

    def test_unconfigured_standby_status(self, temp_cloud_env):
        """Verifies adapter stays dormant and returns STANDBY when no cloud credentials exist."""
        adapter: CloudMemorySyncAdapter = temp_cloud_env["adapter"]
        status = adapter.get_sync_status()

        assert status["status"] == "STANDBY"
        assert status["turso_configured"] is False
        assert status["qdrant_configured"] is False
        assert status["neo4j_configured"] is False
        assert status["is_silent"] is False
        assert status["estop_active"] is False

        # Attempt incremental sync: must stay in STANDBY with 0 network calls
        res = adapter.sync_incremental()
        assert res["success"] is True
        assert res["status"] == "STANDBY"
        assert res["reason"] == "NO_CREDENTIALS_CONFIGURED"
        assert res["synced"] == 0

    def test_silent_workspace_air_gap_blocks_sync(self, temp_cloud_env):
        """Verifies SILENT mode immediately aborts sync without egress."""
        adapter: CloudMemorySyncAdapter = temp_cloud_env["adapter"]
        governor: WorkspaceGovernor = temp_cloud_env["governor"]
        vault: CredentialVault = temp_cloud_env["vault"]

        # Even if credentials are configured in DPAPI vault:
        vault.set_secret("TURSO_DATABASE_URL", "libsql://mock-cloud-db.turso.io")

        try:
            governor.set_mode("SILENT")
            assert adapter.is_air_gapped() is True

            status = adapter.get_sync_status()
            assert status["status"] == "DORMANT"
            assert status["is_silent"] is True

            # Sync attempt must return AIR_GAPPED_SILENT_MODE
            res = adapter.sync_incremental()
            assert res["success"] is False
            assert res["status"] == "STANDBY"
            assert res["reason"] == "AIR_GAPPED_SILENT_MODE"
            assert res["synced"] == 0
        finally:
            governor.set_mode("DEV")
            WorkspaceGovernor._active_mode = "DEV"

    def test_estop_active_blocks_sync(self, temp_cloud_env):
        """Verifies ESTOP flag in SQLite halts cloud sync."""
        adapter: CloudMemorySyncAdapter = temp_cloud_env["adapter"]
        db_path: Path = temp_cloud_env["db_path"]

        # Seed ESTOP flag into SQLite system_flags
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS system_flags (
                    flag_key TEXT PRIMARY KEY,
                    flag_value TEXT NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            conn.execute(
                "INSERT OR REPLACE INTO system_flags (flag_key, flag_value, updated_at) VALUES ('ESTOP', '1', ?);",
                (time.time(),),
            )
            conn.commit()

        assert adapter.is_estop_active() is True
        res = adapter.sync_incremental()
        assert res["success"] is False
        assert res["status"] == "STANDBY"
        assert res["reason"] == "ESTOP_ACTIVE"
        assert res["synced"] == 0

    def test_sovereign_store_integration(self, temp_cloud_env):
        """Verifies SovereignMemoryStore integrates CloudMemorySyncAdapter."""
        db_path: Path = temp_cloud_env["db_path"]
        store = SovereignMemoryStore(db_path=db_path)

        adapter = store.get_cloud_sync_adapter()
        assert isinstance(adapter, CloudMemorySyncAdapter)
        assert store.cloud_sync_adapter is adapter

        sync_result = store.sync_to_cloud()
        assert sync_result["status"] == "STANDBY"
        assert sync_result["synced"] == 0


# =============================================================================
# 2. KAGGLE VOXCPM2 SERVER TESTS
# =============================================================================
class TestKaggleVoxCPM2Server:
    """Verifies AST validity, waveform synthesizer, and VoxCPM2Client pairing."""

    def test_script_syntax_and_ast(self):
        """Verifies scripts/kaggle_voxcpm2_server.py parses without syntax errors."""
        script_path = Path(__file__).resolve().parent.parent / "scripts" / "kaggle_voxcpm2_server.py"
        assert script_path.is_file(), f"Script missing at {script_path}"

        code = script_path.read_text(encoding="utf-8")
        parsed_ast = ast.parse(code, filename=str(script_path))
        assert parsed_ast is not None

        # Verify key classes and functions exist in AST
        func_names = [node.name for node in ast.walk(parsed_ast) if isinstance(node, ast.FunctionDef)]
        assert "start_cloudflare_tunnel" in func_names
        assert "run_idle_watchdog" in func_names
        assert "synthesize_speech" in func_names
        assert "health_check" in func_names

    def test_deterministic_pcm_synthesizer(self):
        """Verifies fallback waveform synthesizer produces standard valid 24kHz PCM WAV bytes."""
        wav_bytes = SYNTHESIZER.generate_waveform_wav(
            text="Hello Nexus Desktop, testing neural speech synthesis.",
            cfg_value=2.0,
            inference_timesteps=10,
            seed=42,
            voice_prompt="Calm, natural female voice",
        )

        assert wav_bytes.startswith(b"RIFF")
        assert b"WAVE" in wav_bytes[:12]

        # Validate with Python wave module
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 24000
            assert wf.getnframes() > 1000

    def test_voxcpm2_client_compatibility(self, live_voxcpm_server):
        """Verifies core/bridge/voxcpm_client.py pairs seamlessly with kaggle_voxcpm2_server."""
        base_url = live_voxcpm_server
        client = VoxCPM2Client(endpoint_url=base_url, timeout=3.0)

        assert client.is_configured() is True
        assert client.check_health() is True

        # Synthesize real speech bytes through VoxCPM2Client
        synth_bytes = client.synthesize(
            text="Nexus systems online. All security parameters normal.",
            voice_prompt="Clear articulation",
        )
        assert synth_bytes is not None
        assert synth_bytes.startswith(b"RIFF")
        assert b"WAVE" in synth_bytes[:12]

        # Test zero-shot cloning parameter passthrough
        ref_sample = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
        import base64
        b64_ref = base64.b64encode(ref_sample).decode("utf-8")

        cloned_bytes = client.synthesize(
            text="Zero shot clone test",
            reference_audio_b64=b64_ref,
        )
        assert cloned_bytes is not None
        assert cloned_bytes.startswith(b"RIFF")


# =============================================================================
# 3. TAILSCALE BURST VM ROUTING TESTS
# =============================================================================
class TestTailscaleBurstRouting:
    """Verifies FederatedComputePool discovery timeout, live discovery, and air-gap rules."""

    def test_offline_burst_node_timeout_and_fallback(self, temp_cloud_env):
        """Verifies unreachable Tailscale burst endpoint times out in 2.0s without throwing."""
        vault = temp_cloud_env["vault"]
        governor = temp_cloud_env["governor"]
        db_path = temp_cloud_env["db_path"]

        pool = FederatedComputePool(
            governor=governor,
            vault=vault,
            db_path=db_path,
        )

        # Unreachable local port
        t0 = time.time()
        node = pool.probe_tailscale_burst(endpoint="http://127.0.0.1:59993", timeout=1.0)
        elapsed = time.time() - t0

        assert node is None
        assert elapsed < 1.5, "Probe should respect strict timeout"

    def test_live_burst_node_discovery(self, temp_cloud_env, live_tailscale_burst_node):
        """Verifies probe_tailscale_burst detects active node and returns active node dict."""
        vault = temp_cloud_env["vault"]
        governor = temp_cloud_env["governor"]
        db_path = temp_cloud_env["db_path"]
        burst_url = live_tailscale_burst_node

        pool = FederatedComputePool(
            governor=governor,
            vault=vault,
            db_path=db_path,
        )

        node = pool.probe_tailscale_burst(endpoint=burst_url, timeout=2.0)
        assert node is not None
        assert node["node_id"] == "tailscale-burst-worker"
        assert node["provider"] == "tailscale_burst"
        assert node["status"] == "ACTIVE"
        assert node["cpu_cores"] == 8
        assert node["ram_gb"] == 32.0

        # Method get_tailscale_burst_node alias test
        alias_node = pool.get_tailscale_burst_node(endpoint=burst_url)
        assert alias_node is not None
        assert alias_node["node_id"] == node["node_id"]
        assert alias_node["provider"] == node["provider"]
        assert alias_node["url"] == node["url"]
        assert alias_node["status"] == node["status"]

    def test_burst_node_selection_and_silent_airgap(self, temp_cloud_env, live_tailscale_burst_node):
        """Verifies heavy task routing to burst node in DEV mode and air-gap block in SILENT mode."""
        vault = temp_cloud_env["vault"]
        governor = temp_cloud_env["governor"]
        db_path = temp_cloud_env["db_path"]
        burst_url = live_tailscale_burst_node

        # Inject burst endpoint into vault
        vault.set_secret("TAILSCALE_BURST_ENDPOINT", burst_url)

        pool = FederatedComputePool(
            governor=governor,
            vault=vault,
            db_path=db_path,
        )

        # In DEV mode: select_best_route for heavy_cpu selects burst node
        best_heavy = pool.select_best_route(task_type="heavy_cpu")
        assert best_heavy is not None
        assert best_heavy.get("provider") == "tailscale_burst"
        assert best_heavy.get("tier") == "TAILSCALE_BURST_CPU"

        # Switch to SILENT mode: air-gap must block all external probing
        try:
            governor.set_mode("SILENT")
            assert pool.is_air_gapped() is True
            assert pool.probe_tailscale_burst(endpoint=burst_url) is None

            # Candidate routes must contain strictly Priority 4 Local Sovereign Ollama
            routes = pool.get_candidate_routes()
            assert len(routes) == 1
            assert routes[0]["priority"] == 4
            assert routes[0]["tier"] == "LOCAL_SOVEREIGN"
        finally:
            governor.set_mode("DEV")
            WorkspaceGovernor._active_mode = "DEV"


# =============================================================================
# 4. BINARY ASSET EXTRACTOR TESTS
# =============================================================================
class TestExternalAppImporter:
    """Verifies scanning, SHA-256 calculation, ASAR binary unpacking, and manifest generation."""

    def test_index_and_manifest_generation_real_files(self):
        """Verifies real audio cues and script files are indexed into import_manifest.json."""
        tmp_dir = tempfile.mkdtemp(prefix="nexus_asset_test_")
        tmp_p = Path(tmp_dir)

        try:
            # Create sample audio cues
            audio_dir = tmp_p / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)
            wav_file = audio_dir / "notification_chime.wav"
            wav_file.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00")
            mp3_file = audio_dir / "alert_buzz.mp3"
            mp3_file.write_bytes(b"ID3\x03\x00\x00\x00\x00\x00#TSSE\x00\x00\x00\x0f\x00\x00\x00Lavf58.29.100")

            # Create sample script files
            script_dir = tmp_p / "scripts"
            script_dir.mkdir(parents=True, exist_ok=True)
            js_file = script_dir / "worker_task.js"
            js_file.write_text("console.log('Nexus Stonic Task');", encoding="utf-8")
            py_file = script_dir / "automation.py"
            py_file.write_text("import sys\nprint('Nexus Autonomous');", encoding="utf-8")

            out_dir = tmp_p / "imported"
            importer = ExternalAppImporter(output_dir=out_dir)

            # Generate manifest
            manifest = importer.generate_manifest(installer_path=None, extracted_root=tmp_p)

            assert manifest["version"] == "1.0"
            assert manifest["total_audio_count"] == 2
            assert manifest["total_scripts_count"] == 2
            assert manifest["total_bytes"] > 0

            audio_names = [a["name"] for a in manifest["audio_cues"]]
            assert "notification_chime.wav" in audio_names
            assert "alert_buzz.mp3" in audio_names

            script_names = [s["name"] for s in manifest["scripts"]]
            assert "worker_task.js" in script_names
            assert "automation.py" in script_names

            # Verify manifest on disk
            manifest_on_disk = out_dir / "import_manifest.json"
            assert manifest_on_disk.is_file()
            disk_data = json.loads(manifest_on_disk.read_text(encoding="utf-8"))
            assert disk_data["total_audio_count"] == 2
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_pure_python_asar_binary_unpacker(self):
        """Verifies pure-Python ASAR binary decoder unpacks Chromium Electron archives."""
        tmp_dir = tempfile.mkdtemp(prefix="nexus_asar_test_")
        tmp_p = Path(tmp_dir)

        try:
            # Construct a real valid ASAR binary
            # File 1: "core.js", content: "console.log('nexus');", size: 21, offset: 0
            # File 2: "sound.wav", content: "WAVE_BYTES", size: 10, offset: 21
            f1_bytes = b"console.log('nexus');"
            f2_bytes = b"WAVE_BYTES"

            header_dict = {
                "files": {
                    "core.js": {"size": len(f1_bytes), "offset": "0"},
                    "sound.wav": {"size": len(f2_bytes), "offset": str(len(f1_bytes))},
                }
            }
            json_bytes = json.dumps(header_dict).encode("utf-8")
            json_len = len(json_bytes)

            # Header structure:
            # uint32: 4
            # uint32: json_len + 8
            # uint32: json_len + 4
            # uint32: json_len
            prefix = struct.pack("<IIII", 4, json_len + 8, json_len + 4, json_len)
            asar_data = prefix + json_bytes + f1_bytes + f2_bytes

            asar_file = tmp_p / "app.asar"
            asar_file.write_bytes(asar_data)

            dest_extract = tmp_p / "unpacked"
            importer = ExternalAppImporter(output_dir=tmp_p / "output")

            unpacked_count = importer.unpack_asar(asar_file, dest_extract)
            assert unpacked_count == 2

            extracted_f1 = dest_extract / "core.js"
            extracted_f2 = dest_extract / "sound.wav"

            assert extracted_f1.is_file()
            assert extracted_f1.read_bytes() == f1_bytes
            assert extracted_f2.is_file()
            assert extracted_f2.read_bytes() == f2_bytes

        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def test_standby_manifest_when_no_installers(self):
        """Verifies run_import generates clean standby manifest when no installers are found."""
        tmp_dir = tempfile.mkdtemp(prefix="nexus_empty_test_")
        tmp_p = Path(tmp_dir)

        try:
            empty_search = tmp_p / "empty_downloads"
            empty_search.mkdir(parents=True, exist_ok=True)

            out_dir = tmp_p / "imported"
            importer = ExternalAppImporter(output_dir=out_dir)

            res = importer.run_import(search_dirs=[empty_search])
            assert res["status"] == "NO_INSTALLERS_FOUND"
            assert res["total_audio_count"] == 0
            assert res["total_scripts_count"] == 0

            manifest_file = out_dir / "import_manifest.json"
            assert manifest_file.is_file()
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
