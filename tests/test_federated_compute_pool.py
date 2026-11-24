"""Nexus OS v5.0 - Federated Compute Pool & Dynamic Router Test Suite.

Verifies end-to-end functionality with ZERO mocks:
1. DPAPI secret lookup & SILENT workspace air-gap enforcement (blocking external cloud nodes).
2. Dynamic node sorting, TTL expiration filtering, and sub-5ms 429 failover across Priority 1 -> Priority 4.
3. GET /api/compute/pool endpoint on 127.0.0.1:47630 with Bearer token validation.
"""

from __future__ import annotations

import http.server
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Any, Dict, List
import urllib.error
import urllib.request
import pytest

from core.security.vault import CredentialVault
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.compute_pool import FederatedComputePool
from core.runtime.llm_router import LLMRouter
from core.runtime.ipc_server import NexusIPCServer, DEFAULT_IPC_PORT


@pytest.fixture
def temp_environment():
    """Provisions isolated temporary database and vault storage for sovereign testing."""
    tmp_dir = tempfile.mkdtemp(prefix="nexus_pool_test_")
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

    vault = CredentialVault(db_path=vault_db_path)
    governor = WorkspaceGovernor(manifest_path=str(manifest_path))
    pool = FederatedComputePool(
        governor=governor,
        edge_nodes_url="https://nexus-bridge.pages.dev/api/compute/nodes",
        db_path=db_path,
        vault=vault,
    )
    pool._last_refresh_time = time.time()

    yield {
        "tmp_path": tmp_path,
        "db_path": db_path,
        "vault": vault,
        "governor": governor,
        "pool": pool,
    }

    import shutil
    try:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    except Exception as exc:
        print(f"Teardown note: {exc}")


def test_dpapi_secret_lookup_and_silent_airgap(temp_environment):
    """
    Criterion 1: Verifies DPAPI secret resolution and strict SILENT mode air-gap enforcement.
    When SILENT mode is active, all external cloud nodes and serverless APIs MUST be blocked.
    """
    vault: CredentialVault = temp_environment["vault"]
    governor: WorkspaceGovernor = temp_environment["governor"]
    pool: FederatedComputePool = temp_environment["pool"]

    # 1. DPAPI Secret storage and retrieval
    master_token = "NXS-NODE-TEST-SECURE-TOKEN-12345"
    gemini_key = "AIzaSyTestGeminiKeySecure"
    assert vault.set_secret("NEXUS_TOKEN", master_token) is True
    assert vault.set_secret("GEMINI_API_KEY", gemini_key) is True

    assert pool.get_secret("NEXUS_TOKEN") == master_token
    assert pool.get_secret("GEMINI_API_KEY") == gemini_key

    # 2. In DEV mode, external routes are permitted
    governor.set_mode("DEV")
    assert pool.is_air_gapped() is False
    dev_routes = pool.get_candidate_routes()
    dev_providers = [r["provider"] for r in dev_routes]
    assert "gemini" in dev_providers
    assert "ollama" in dev_providers

    # 3. Switch to SILENT mode -> Strict Sovereign Air-Gap
    governor.set_mode("SILENT")
    assert pool.is_air_gapped() is True

    silent_routes = pool.get_candidate_routes()
    assert len(silent_routes) == 1
    assert silent_routes[0]["priority"] == 4
    assert silent_routes[0]["tier"] == "LOCAL_SOVEREIGN"
    assert silent_routes[0]["provider"] == "ollama"
    assert silent_routes[0]["endpoint"] == "http://127.0.0.1:11434/v1"

    # Ensure zero external cloud endpoints leak into silent candidate routes
    assert not any(r["priority"] in (1, 2, 3) for r in silent_routes)

    # Restore DEV mode
    governor.set_mode("DEV")


def test_dynamic_node_sorting_ttl_expiration_and_sub_5ms_failover(temp_environment):
    """
    Criterion 2: Verifies dynamic node sorting, TTL expiration filtering,
    and sub-5ms instant 429 rate-limit failover across priority tiers.
    """
    pool: FederatedComputePool = temp_environment["pool"]
    now_ms = time.time() * 1000.0

    raw_nodes = [
        {
            "node_id": "gpu-t4-single",
            "url": "https://single-t4.trycloudflare.com",
            "type": "gpu",
            "model": "gemma4:12b",
            "vram_gb": 16,
            "ram_gb": 16,
            "cpu_cores": 4,
            "provider": "colab",
            "last_heartbeat": now_ms - 60000,
        },
        {
            "node_id": "gpu-t4-dual-32gb",
            "url": "https://dual-t4.trycloudflare.com",
            "type": "gpu",
            "model": "qwen3.8:27b",
            "vram_gb": 32,
            "ram_gb": 32,
            "cpu_cores": 8,
            "provider": "kaggle",
            "last_heartbeat": now_ms - 30000,
        },
        {
            "node_id": "cpu-hf-16gb",
            "url": "https://hf-space-worker.hf.space",
            "type": "cpu",
            "model": "scout-slice-worker",
            "vram_gb": 0,
            "ram_gb": 16,
            "cpu_cores": 2,
            "provider": "huggingface_spaces",
            "last_heartbeat": now_ms - 10000,
        },
        {
            "node_id": "dead-node-expired",
            "url": "https://dead-notebook.trycloudflare.com",
            "type": "gpu",
            "model": "qwen3.8:27b",
            "vram_gb": 32,
            "ram_gb": 32,
            "cpu_cores": 4,
            "provider": "kaggle",
            "last_heartbeat": now_ms - (700 * 1000),
        },
    ]

    filtered_nodes = pool._filter_active_nodes(raw_nodes)

    # 1. Verification of TTL expiration filtering (dead node pruned)
    active_ids = [n["node_id"] for n in filtered_nodes]
    assert "dead-node-expired" not in active_ids
    assert "gpu-t4-dual-32gb" in active_ids
    assert "gpu-t4-single" in active_ids
    assert "cpu-hf-16gb" in active_ids

    # 2. Verification of sorting: Dual T4 (32GB) precedes Single T4 (16GB), and GPUs precede CPUs
    assert filtered_nodes[0]["node_id"] == "gpu-t4-dual-32gb"
    assert filtered_nodes[1]["node_id"] == "gpu-t4-single"
    assert filtered_nodes[2]["node_id"] == "cpu-hf-16gb"

    # Inject active nodes into pool cache
    pool._nodes_cache = filtered_nodes
    pool._last_refresh_time = time.time()

    # 3. Sub-5ms 429 Failover Timing Assertion
    best_before = pool.select_best_route()
    assert best_before is not None
    assert best_before["priority"] == 1
    assert best_before["node_id"] == "gpu-t4-dual-32gb"

    route_to_trip = best_before["route_key"]

    # Record 429 rate limit
    pool.record_rate_limit(route_to_trip, cooldown_sec=45.0)

    # Measure failover execution latency
    t_start = time.perf_counter()
    best_after = pool.select_best_route()
    failover_latency_ms = (time.perf_counter() - t_start) * 1000.0

    # Ensure instantaneous failover: strictly under 5.0 milliseconds
    assert failover_latency_ms < 5.0
    assert best_after is not None
    assert best_after["node_id"] == "gpu-t4-single"
    assert best_after["route_key"] != route_to_trip


def test_ipc_server_compute_pool_endpoint_bearer_auth(temp_environment):
    """
    Criterion 3: Verifies GET /api/compute/pool on 127.0.0.1 with strict Bearer token authentication.
    """
    tmp_path: Path = temp_environment["tmp_path"]
    db_path: Path = temp_environment["db_path"]

    # Use an available high port for testing
    test_port = 47631

    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=db_path,
        dry_run_hardware=True,
    )

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # Give server brief moment to bind socket
    time.sleep(0.3)

    base_url = f"http://127.0.0.1:{test_port}/api/compute/pool"
    valid_token = server.auth_token

    try:
        # 1. Unauthenticated request -> Must return HTTP 401
        req_unauth = urllib.request.Request(base_url)
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req_unauth, timeout=3.0)
        assert exc_info.value.code == 401

        # 2. Invalid Bearer token request -> Must return HTTP 401
        req_bad = urllib.request.Request(
            base_url,
            headers={"Authorization": "Bearer invalid_secret_token_12345"},
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info2:
            urllib.request.urlopen(req_bad, timeout=3.0)
        assert exc_info2.value.code == 401

        # 3. Valid Bearer token request -> Must return HTTP 200 with pool status payload
        req_valid = urllib.request.Request(
            base_url,
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        with urllib.request.urlopen(req_valid, timeout=3.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            assert "cloud_gpus_count" in data
            assert "cpu_workers_count" in data
            assert "total_cloud_vram_gb" in data
            assert "routes" in data
            assert isinstance(data["routes"], list)
    finally:
        server.shutdown()
        server.server_close()


def test_priority_routing_cascade_live_gpu_to_local_ollama(temp_environment):
    """
    Criterion 4: Verifies end-to-end priority routing cascade from
    Live Cloud GPU -> HF Space -> Free Serverless API -> Local Ollama,
    and air-gap blocking when switching to SILENT mode.
    """
    vault: CredentialVault = temp_environment["vault"]
    governor: WorkspaceGovernor = temp_environment["governor"]
    pool: FederatedComputePool = temp_environment["pool"]

    # Configure secrets in vault
    vault.set_secret("GEMINI_API_KEY", "test_gemini_key_123")
    vault.set_secret("OPENROUTER_API_KEY", "test_openrouter_key_123")
    vault.set_secret("GROQ_API_KEY", "test_groq_key_123")
    vault.set_secret("HF_SPACE_URL", "https://test-space.hf.space")

    # Inject a live cloud GPU node (Priority 1)
    pool.add_direct_node({
        "node_id": "gpu-kaggle-2xt4",
        "url": "https://active-kaggle.trycloudflare.com",
        "type": "gpu",
        "model": "qwen3.8:27b",
        "vram_gb": 32,
        "ram_gb": 32,
        "provider": "kaggle",
    })

    governor.set_mode("DEV")

    # Step 1: All available -> Live Cloud GPU (Priority 1) is selected
    route_1 = pool.select_best_route()
    assert route_1 is not None
    assert route_1["priority"] == 1
    assert route_1["provider"] == "kaggle"
    assert route_1["model"] == "qwen3.8:27b"

    # Step 2: Trip Priority 1 into cooldown -> HF Space (Priority 2) is selected
    pool.record_rate_limit(route_1["route_key"], cooldown_sec=60.0)
    route_2 = pool.select_best_route()
    assert route_2 is not None
    assert route_2["priority"] == 2
    assert "hf.space" in route_2["endpoint"]

    # Step 3: Trip Priority 2 into cooldown -> Gemini Serverless API (Priority 3) is selected
    pool.record_rate_limit(route_2["route_key"], cooldown_sec=60.0)
    route_3 = pool.select_best_route()
    assert route_3 is not None
    assert route_3["priority"] == 3
    assert route_3["provider"] == "gemini"

    # Step 4: Trip all serverless APIs into cooldown -> Local Ollama (Priority 4) is selected
    pool.record_rate_limit("serverless:gemini", cooldown_sec=60.0)
    pool.record_rate_limit("serverless:openrouter", cooldown_sec=60.0)
    pool.record_rate_limit("serverless:groq", cooldown_sec=60.0)
    route_4 = pool.select_best_route()
    assert route_4 is not None
    assert route_4["priority"] == 4
    assert route_4["provider"] == "ollama"
    assert route_4["endpoint"] == "http://127.0.0.1:11434/v1"

    # Step 5: SILENT mode enforcement -> strictly Priority 4 Local Ollama
    governor.set_mode("SILENT")
    silent_route = pool.select_best_route()
    assert silent_route is not None
    assert silent_route["priority"] == 4
    assert silent_route["tier"] == "LOCAL_SOVEREIGN"
    assert silent_route["provider"] == "ollama"

    # Reset mode to DEV
    governor.set_mode("DEV")


def test_release_idle_cloud_nodes_remote_shutdown_and_deregister(temp_environment):
    """
    Criterion 5: Verifies that release_idle_cloud_nodes() sends POST /_nexus/shutdown
    to active cloud GPU nodes (e.g. Kaggle QuotaGuardProxy), triggers edge deregistration,
    and removes the nodes from local cache to conserve GPU quota.
    """
    pool: FederatedComputePool = temp_environment["pool"]
    shutdown_received = threading.Event()
    received_payload: Dict[str, Any] = {}

    # Spin up a real local test server simulating Kaggle QuotaGuardProxy
    class MockKaggleWorkerHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            pass

        def do_POST(self) -> None:
            if self.path == "/_nexus/shutdown":
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
                try:
                    data = json.loads(body)
                    received_payload.update(data)
                except Exception:
                    pass
                shutdown_received.set()

                res_body = json.dumps({"success": True, "message": "Kaggle GPU session shutting down cleanly."}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(res_body)))
                self.end_headers()
                self.wfile.write(res_body)
                return

            self.send_response(404)
            self.end_headers()

    test_port = 47642
    test_httpd = http.server.ThreadingHTTPServer(("127.0.0.1", test_port), MockKaggleWorkerHandler)
    server_thread = threading.Thread(target=test_httpd.serve_forever, daemon=True)
    server_thread.start()

    time.sleep(0.2)

    try:
        # Register the mock worker into compute pool
        target_node_id = "gpu-kaggle-test-shutdown"
        inject_res = pool.add_direct_node({
            "node_id": target_node_id,
            "url": f"http://127.0.0.1:{test_port}",
            "type": "gpu",
            "model": "qwen3.8:27b",
            "vram_gb": 32,
            "ram_gb": 32,
            "provider": "kaggle",
        })
        assert inject_res["success"] is True

        # Verify node is present in compute pool cache
        active_ids_before = [n["node_id"] for n in pool._nodes_cache]
        assert target_node_id in active_ids_before

        # Execute quota preservation release
        release_res = pool.release_idle_cloud_nodes(reason="idle_timeout_5m")
        assert release_res["success"] is True
        assert target_node_id in release_res["released_nodes"]

        # Wait for shutdown signal to arrive at worker
        assert shutdown_received.wait(timeout=3.0) is True
        assert received_payload.get("reason") == "idle_timeout_5m"
        assert received_payload.get("node_id") == target_node_id

        # Verify node is completely pruned from local pool cache
        active_ids_after = [n["node_id"] for n in pool._nodes_cache]
        assert target_node_id not in active_ids_after
    finally:
        test_httpd.shutdown()
        test_httpd.server_close()


def test_ipc_server_compute_release_and_direct_node_injection(temp_environment):
    """
    Criterion 6: Verifies POST /api/compute/nodes/direct and POST /api/compute/release
    on the live NexusIPCServer with strict Bearer token authentication.
    """
    db_path: Path = temp_environment["db_path"]
    test_port = 47643

    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=db_path,
        dry_run_hardware=True,
    )

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)

    valid_token = server.auth_token

    try:
        # 1. Direct Node Injection: POST /api/compute/nodes/direct
        direct_url = f"http://127.0.0.1:{test_port}/api/compute/nodes/direct"
        node_payload = json.dumps({
            "node_id": "gpu-direct-ipc-test",
            "url": "https://direct-ipc.trycloudflare.com",
            "type": "gpu",
            "model": "qwen3.8:27b",
            "vram_gb": 32,
            "provider": "kaggle",
        }).encode("utf-8")

        req_inject = urllib.request.Request(
            direct_url,
            data=node_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {valid_token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req_inject, timeout=3.0) as resp:
            assert resp.status == 201
            data = json.loads(resp.read().decode("utf-8"))
            assert data["success"] is True
            assert data["node"]["node_id"] == "gpu-direct-ipc-test"

        # 2. Quota Release: POST /api/compute/release
        release_url = f"http://127.0.0.1:{test_port}/api/compute/release"
        release_payload = json.dumps({"reason": "cockpit_1click_release"}).encode("utf-8")

        req_release = urllib.request.Request(
            release_url,
            data=release_payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {valid_token}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req_release, timeout=3.0) as resp2:
            assert resp2.status == 200
            rel_data = json.loads(resp2.read().decode("utf-8"))
            assert rel_data["success"] is True
            assert rel_data["reason"] == "cockpit_1click_release"
    finally:
        server.shutdown()
        server.server_close()
