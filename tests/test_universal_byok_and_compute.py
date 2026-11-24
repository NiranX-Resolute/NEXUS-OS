"""Nexus OS v5.0 - Universal BYOK, Model Catalog & Sovereign Compute Test Suite.

Verifies:
1. Provider Catalog & Model Catalog seeding into SQLite WAL (~/.nexus-agent/db/agent_local.db).
2. Windows DPAPI credential vault round-trip encryption, decryption, and key deletion.
3. Live NexusIPCServer HTTP endpoints (GET/POST /api/providers, DELETE key, POST test, POST reorder, GET /api/models/catalog).
4. Real-time provider failover logging to SQLite WAL (provider_failover_logs).
5. Strict [SILENT] air-gap mode: blocks external cloud endpoints and routes solely to local Ollama.
6. FederatedComputePool Kaggle worker script generator (Ollama/HF GGUF tags, Haru-4B sidecar, QuotaGuard auto-idle).
7. Hugging Face Manager Space deployment bundle generator (app.py + requirements.txt with NEXUS_TOKEN).

Strictly adheres to the Zero-Mock Law: 0 unittest.mock, 0 stubs, 100% production code verification.
"""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
from typing import Any, Dict, Generator
import urllib.error
import urllib.request

import pytest

from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.provider_catalog import (
    PROVIDER_MAP,
    get_all_provider_definitions,
    get_dpapi_vault_key,
    seed_default_providers,
)
from core.runtime.model_catalog import (
    MODEL_CATALOG_DEFINITIONS,
    get_all_catalog_models,
    is_model_abliterated,
    seed_default_models,
)
from core.security.vault import CredentialVault, VaultManager
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.compute_pool import FederatedComputePool
from core.runtime.llm_router import LLMRouter, LLMProviderError
from core.runtime.hf_manager import HuggingFaceManager


@pytest.fixture
def temp_sovereign_store() -> Generator[SovereignMemoryStore, None, None]:
    """Provides an isolated SQLite WAL SovereignMemoryStore."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    store = SovereignMemoryStore(db_path=temp_db)
    yield store

    try:
        if temp_db.exists():
            temp_db.unlink(missing_ok=True)
        for ext in ["-wal", "-shm"]:
            p = temp_db.with_name(temp_db.name + ext)
            if p.exists():
                p.unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture
def temp_vault() -> Generator[CredentialVault, None, None]:
    """Provides an isolated CredentialVault backed by a temporary database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_vault_db = Path(tf.name)

    vault = CredentialVault(db_path=temp_vault_db)
    yield vault

    try:
        if temp_vault_db.exists():
            temp_vault_db.unlink(missing_ok=True)
    except Exception:
        pass


@pytest.fixture
def live_ipc_server() -> Generator[Dict[str, Any], None, None]:
    """Spawns a real, un-mocked NexusIPCServer on an ephemeral loopback port."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db,
        dry_run_hardware=True,
    )
    port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="BYOKTestServer")
    t.start()
    time.sleep(0.35)

    base_url = f"http://127.0.0.1:{port}"
    token = server.auth_token

    yield {
        "server": server,
        "base_url": base_url,
        "token": token,
        "store": server.memory_store,
        "db_path": temp_db,
    }

    server.shutdown()
    server.server_close()
    try:
        if temp_db.exists():
            temp_db.unlink(missing_ok=True)
        for ext in ["-wal", "-shm"]:
            p = temp_db.with_name(temp_db.name + ext)
            if p.exists():
                p.unlink(missing_ok=True)
    except Exception:
        pass


# ------------------------------------------------------------------------------
# Test 1: Provider Catalog & Model Catalog Seeding into SQLite WAL
# ------------------------------------------------------------------------------
def test_01_seed_and_list_providers_and_models(temp_sovereign_store: SovereignMemoryStore):
    """Verifies seeding and listing of 45+ providers and benchmark/Kaggle models."""
    seed_default_providers(temp_sovereign_store)
    seed_default_models(temp_sovereign_store)

    providers = temp_sovereign_store.list_providers()
    assert len(providers) >= 45, f"Expected at least 45 providers, got {len(providers)}"

    provider_ids = {p["provider_id"] for p in providers}
    # Check Tier A Frontier
    assert "anthropic" in provider_ids
    assert "openai" in provider_ids
    assert "gemini" in provider_ids
    assert "grok" in provider_ids
    assert "deepseek" in provider_ids
    assert "kimi" in provider_ids
    assert "alibaba" in provider_ids
    # Check Tier B Enterprise
    assert "bedrock" in provider_ids
    assert "azure" in provider_ids
    # Check Tier C LPUs & Open-Weight
    assert "groq" in provider_ids
    assert "cerebras" in provider_ids
    assert "sambanova" in provider_ids
    assert "together" in provider_ids
    # Check Tier D Sovereign
    assert "kaggle_custom" in provider_ids
    assert "ollama_local" in provider_ids

    # Verify model catalog
    models = temp_sovereign_store.list_models()
    assert len(models) >= 15, f"Expected at least 15 models, got {len(models)}"

    model_uids = {m["model_uid"] for m in models}
    assert "claude-fable-5-2-max" in model_uids
    assert "huihui-qwen3-omni-30b-abliterated" in model_uids
    assert "haru-4b-spoken-duplex" in model_uids
    assert "voxcpm2-voice-cloner" in model_uids

    # Verify abliterated detection regex
    assert is_model_abliterated("Huihui-Qwen3.8-27B-abliterated-GGUF") is True
    assert is_model_abliterated("lfm3-2b-omni-abliter8-gguf") is True
    assert is_model_abliterated("heretic-qwen-7b") is True
    assert is_model_abliterated("uncensored-llama-3") is True
    assert is_model_abliterated("claude-sonnet-5.5") is False
    assert is_model_abliterated("gpt-4o") is False


# ------------------------------------------------------------------------------
# Test 2: Windows DPAPI Vault Round-Trip Encryption and Deletion
# ------------------------------------------------------------------------------
def test_02_dpapi_vault_roundtrip(temp_vault: CredentialVault):
    """Verifies DPAPI AES-256-GCM secret storage, retrieval, and key deletion."""
    test_key_name = get_dpapi_vault_key("cerebras")
    test_secret = "csk-test-production-key-998877"

    # Save secret into vault
    save_ok = temp_vault.set_secret(test_key_name, test_secret)
    assert save_ok is True

    # Retrieve secret
    retrieved = temp_vault.get_secret(test_key_name)
    assert retrieved == test_secret

    # Verify listed keys
    all_keys = temp_vault.list_keys()
    assert test_key_name in all_keys

    # Delete secret
    del_ok = temp_vault.delete_secret(test_key_name)
    assert del_ok is True

    # Confirm key no longer exists
    assert temp_vault.get_secret(test_key_name) is None


# ------------------------------------------------------------------------------
# Test 3: Live IPC Provider & Catalog HTTP Endpoints
# ------------------------------------------------------------------------------
def test_03_live_ipc_provider_routes(live_ipc_server: Dict[str, Any]):
    """Verifies live REST endpoints on NexusIPCServer for BYOK & Model Catalog."""
    base_url = live_ipc_server["base_url"]
    token = live_ipc_server["token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # 1. GET /api/providers
    req = urllib.request.Request(f"{base_url}/api/providers", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        providers = payload.get("providers", [])
        assert len(providers) >= 45

    # 2. POST /api/providers/cerebras/save
    save_payload = json.dumps({
        "api_key": "csk-live-test-key-5544",
        "selected_model": "llama-3.3-70b",
        "enabled": 1,
    }).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/providers/cerebras/save", data=save_payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        assert payload.get("provider_id") == "cerebras"

    # Verify provider has_key is now true in database
    cerebras_provider = live_ipc_server["store"].get_provider("cerebras")
    assert cerebras_provider is not None
    assert cerebras_provider["has_key"] == 1
    assert cerebras_provider["enabled"] == 1

    # 3. POST /api/providers/cerebras/test (live latency / status check)
    req = urllib.request.Request(f"{base_url}/api/providers/cerebras/test", headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("status") in ("OPERATIONAL", "AUTH_ERROR", "OFFLINE")
        assert "latency_ms" in payload

    # 4. DELETE /api/providers/cerebras/key
    req = urllib.request.Request(f"{base_url}/api/providers/cerebras/key", headers=headers, method="DELETE")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True

    # Confirm key was cleared
    cerebras_updated = live_ipc_server["store"].get_provider("cerebras")
    assert cerebras_updated["has_key"] == 0

    # 5. POST /api/providers/reorder
    reorder_payload = json.dumps({
        "provider_ids": ["groq", "cerebras", "deepseek", "anthropic"],
    }).encode("utf-8")
    req = urllib.request.Request(f"{base_url}/api/providers/reorder", data=reorder_payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True

    # 6. GET /api/models/catalog
    req = urllib.request.Request(f"{base_url}/api/models/catalog", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        models = payload.get("models", [])
        assert len(models) >= 15
        assert any(m.get("is_abliterated") == 1 for m in models)
        assert any(m.get("voice_compatible") == 1 for m in models)


# ------------------------------------------------------------------------------
# Test 4: Provider Failover Logging to SQLite WAL
# ------------------------------------------------------------------------------
def test_04_provider_failover_logging(temp_sovereign_store: SovereignMemoryStore):
    """Verifies recording and retrieval of failover events in provider_failover_logs."""
    temp_sovereign_store.log_provider_failover(
        from_provider="cerebras",
        to_provider="groq",
        reason="HTTP_429",
        latency_ms=14.2,
    )
    temp_sovereign_store.log_provider_failover(
        from_provider="groq",
        to_provider="ollama_local",
        reason="TIMEOUT",
        latency_ms=5002.1,
    )

    logs = temp_sovereign_store.get_failover_logs(limit=10)
    assert len(logs) == 2
    assert logs[0]["from_provider"] == "groq"
    assert logs[0]["to_provider"] == "ollama_local"
    assert logs[0]["reason"] == "TIMEOUT"
    assert logs[1]["from_provider"] == "cerebras"
    assert logs[1]["to_provider"] == "groq"
    assert logs[1]["reason"] == "HTTP_429"


# ------------------------------------------------------------------------------
# Test 5: [SILENT] Air-Gap Mode Enforcement & Failover
# ------------------------------------------------------------------------------
def test_05_silent_air_gap_mode_enforcement(temp_sovereign_store: SovereignMemoryStore):
    """Verifies that [SILENT] mode blocks external network calls and audits failover."""
    governor = WorkspaceGovernor()
    router = LLMRouter(governor=governor, sovereign_store=temp_sovereign_store)

    # Force SILENT air-gap mode
    governor.set_mode("SILENT")
    assert governor.get_mode() == "SILENT"

    # Attempt generation requesting external cloud provider
    try:
        router.generate(
            prompt="Compute offline SHA-256 integrity hash",
            preferred_provider="anthropic",
        )
    except LLMProviderError as exc:
        # Expected if local Ollama daemon is offline in headless test runner
        assert "ollama" in str(exc).lower()

    # Verify that failover audit trail recorded the SILENT_MODE redirection
    logs = temp_sovereign_store.get_failover_logs(limit=5)
    assert len(logs) >= 1
    silent_logs = [l for l in logs if l["reason"] == "SILENT_MODE"]
    assert len(silent_logs) >= 1
    assert silent_logs[0]["from_provider"] == "anthropic"
    assert silent_logs[0]["to_provider"] == "ollama_local"

    # Cleanly restore DEV mode
    governor.set_mode("DEV")
    assert governor.get_mode() == "DEV"


# ------------------------------------------------------------------------------
# Test 6: Kaggle Worker Script Generation Validation
# ------------------------------------------------------------------------------
def test_06_generate_kaggle_worker_script():
    """Verifies generate_kaggle_worker_script output for GGUF tags, sidecars & QuotaGuard."""
    pool = FederatedComputePool()
    script = pool.generate_kaggle_worker_script(
        accelerator="gpu_t4_x2",
        model_name="hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL",
        idle_timeout_sec=900,
        voice_sidecar="haru_4b",
    )

    # Assert model tag is present
    assert "hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL" in script

    # Assert QuotaGuard watchdog and idle shutdown
    assert "QuotaGuardProxy" in script
    assert "IDLE_TIMEOUT_SEC = 900" in script
    assert "/_nexus/shutdown" in script

    # Assert Cloudflare tunnel auto-registration
    assert "cloudflared" in script
    assert "trycloudflare.com" in script

    # Assert Haru-4B voice sidecar on GPU 1
    assert "haru_4b" in script
    assert "SIDECAR_PORT = 8998" in script


# ------------------------------------------------------------------------------
# Test 7: Hugging Face Space Bundle Generation Validation
# ------------------------------------------------------------------------------
def test_07_generate_hf_space_bundle():
    """Verifies Hugging Face Space bundle generation (app.py + requirements.txt)."""
    hf_mgr = HuggingFaceManager()
    bundle = hf_mgr.generate_hf_space_bundle(
        model_id="Qwen/Qwen2.5-Coder-7B-Instruct",
        hardware="hf_zerogpu",
        is_abliterated=False,
        voice_sidecar="none",
        token="test-secret-nexus-bearer-token",
    )

    assert "app.py" in bundle
    assert "requirements.txt" in bundle

    app_py = bundle["app.py"]
    reqs_txt = bundle["requirements.txt"]

    # Check FastAPI, auth and completions route in app.py
    assert "FastAPI" in app_py
    assert "NEXUS_TOKEN" in app_py
    assert "/v1/chat/completions" in app_py
    assert "verify_token" in app_py
    assert "Qwen/Qwen2.5-Coder-7B-Instruct" in app_py

    # Check dependencies in requirements.txt
    assert "fastapi" in reqs_txt
    assert "uvicorn" in reqs_txt
    assert "transformers" in reqs_txt
    assert "torch" in reqs_txt


# ------------------------------------------------------------------------------
# Test 8: Roles, Guardrails, Custom Provider & Strict Bearer Authentication
# ------------------------------------------------------------------------------
def test_08_roles_guardrails_custom_provider_and_auth(live_ipc_server: Dict[str, Any]):
    """Verifies strict 401 Bearer auth, custom provider creation, role slots, and guardrails."""
    base_url = live_ipc_server["base_url"]
    valid_token = live_ipc_server["token"]
    store: SovereignMemoryStore = live_ipc_server["store"]

    auth_headers = {
        "Authorization": f"Bearer {valid_token}",
        "Content-Type": "application/json",
    }
    unauth_headers = {
        "Content-Type": "application/json",
    }

    # 1. Verify strict 401 Unauthorized without Bearer token
    for protected_path in ["/api/providers", "/api/models/catalog", "/api/hf/status", "/api/providers/roles", "/api/providers/guardrails"]:
        req = urllib.request.Request(f"{base_url}{protected_path}", headers=unauth_headers, method="GET")
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req, timeout=3.0)
        assert exc_info.value.code == 401, f"Expected 401 on {protected_path}, got {exc_info.value.code}"

    # 2. POST /api/providers/custom (Add Custom OpenAI-Compatible Provider)
    custom_payload = json.dumps({
        "provider_id": "test_custom_cluster",
        "display_name": "Local Enterprise vLLM",
        "base_url": "http://192.168.1.150:8000/v1",
        "selected_model": "Qwen/Qwen2.5-Coder-32B",
        "api_key": "vllm-secret-token-8877",
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{base_url}/api/providers/custom",
        data=custom_payload,
        headers=auth_headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        assert payload.get("provider_id") == "test_custom_cluster"

    # Verify custom provider saved in SQLite WAL
    saved_custom = store.get_provider("test_custom_cluster")
    assert saved_custom is not None
    assert saved_custom["display_name"] == "Local Enterprise vLLM"
    assert saved_custom["base_url"] == "http://192.168.1.150:8000/v1"
    assert saved_custom["has_key"] == 1
    assert saved_custom["enabled"] == 1

    # Verify API key in DPAPI vault
    vault = CredentialVault()
    secret = vault.get_secret("PROVIDER_KEY_TEST_CUSTOM_CLUSTER")
    assert secret == "vllm-secret-token-8877"

    # 3. Role-Based Routing Slots (GET / POST /api/providers/roles)
    req = urllib.request.Request(f"{base_url}/api/providers/roles", headers=auth_headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        roles_obj = payload.get("roles", {})
        assert len(roles_obj) == 5
        role_ids = set(roles_obj.keys()) if isinstance(roles_obj, dict) else {r["role_id"] for r in roles_obj}
        assert "voice_brain" in role_ids
        assert "heavy_coder" in role_ids
        assert "security_auditor" in role_ids
        assert "vision_scout" in role_ids
        assert "general_default" in role_ids

    # Update heavy_coder role
    update_role_payload = json.dumps({
        "role_id": "heavy_coder",
        "provider_id": "cerebras",
        "model_id": "llama3.3-70b",
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/providers/roles",
        data=update_role_payload,
        headers=auth_headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True

    # Confirm role update persisted in SQLite WAL
    current_roles = store.get_role_assignments()
    assert current_roles.get("heavy_coder", {}).get("provider_id") == "cerebras"
    assert current_roles.get("heavy_coder", {}).get("model_id") == "llama3.3-70b"

    # 4. Spend Guardrails (GET / POST /api/providers/guardrails)
    req = urllib.request.Request(f"{base_url}/api/providers/guardrails", headers=auth_headers, method="GET")
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        g = payload.get("guardrails", {})
        assert g.get("free_tier_only") in (0, 1)

    # Update guardrails
    update_guardrails_payload = json.dumps({
        "free_tier_only": 1,
        "allow_paid_failover": 0,
        "daily_budget_usd": 15.0,
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/providers/guardrails",
        data=update_guardrails_payload,
        headers=auth_headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        assert resp.status == 200
        payload = json.loads(resp.read().decode("utf-8"))
        assert payload.get("success") is True
        updated_g = payload.get("guardrails", {})
        assert updated_g.get("daily_budget_usd") == 15.0
        assert updated_g.get("free_tier_only") == 1

    # 5. POST /api/compute/kaggle-wake & /api/compute/release
    wake_payload = json.dumps({"slug": "test-byok-wake"}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/compute/kaggle-wake",
        data=wake_payload,
        headers=auth_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            assert "success" in payload
    except urllib.error.HTTPError as exc:
        assert exc.code in (200, 400)
        payload = json.loads(exc.read().decode("utf-8"))
        assert "success" in payload

    release_payload = json.dumps({"endpoint_url": "http://127.0.0.1:9999"}).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url}/api/compute/release",
        data=release_payload,
        headers=auth_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            assert "success" in payload
    except urllib.error.HTTPError as exc:
        assert exc.code in (200, 400)
        payload = json.loads(exc.read().decode("utf-8"))
        assert "success" in payload
