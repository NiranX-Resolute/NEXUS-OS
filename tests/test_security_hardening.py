"""Nexus OS v5.0 - Security Hardening & Zero-Trust Verification Suite.

Validates the 4 core pillars of Prompt #7:
1. DPAPI Vault envelope encryption, SQLite persistence, and cryptographic integrity.
2. Localhost IPC server loopback binding, strict Bearer auth enforcement, and 401 rejection.
3. CSRF origin enforcement and 403 rejection on state-mutating requests from untrusted origins.
4. SILENT air-gap enforcement in WorkspaceGovernor and web-ingest endpoints.
5. Workspace root directory hygiene and GEMINI.md governance lock invariants.

ZERO MOCK LAW: Uses real SQLite databases, real sockets, real Windows DPAPI / cryptography, and live HTTP requests.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import pytest

from core.security.vault import CredentialVault, set_secret, get_secret
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor


# =============================================================================
# 1. DPAPI VAULT ENCRYPTION & INTEGRITY TESTS
# =============================================================================
def test_dpapi_vault_stores_and_retrieves_credentials():
    """Verifies that CredentialVault securely stores, encrypts, and decrypts secrets."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_vault_db = Path(tf.name)

    try:
        vault = CredentialVault(db_path=temp_vault_db)
        secret_key = "NEXUS_TEST_API_KEY"
        secret_val = "sk-nexus-live-test-token-7790"

        # 1. Set secret
        saved = vault.set_secret(secret_key, secret_val)
        assert saved is True

        # 2. Get secret
        retrieved = vault.get_secret(secret_key)
        assert retrieved == secret_val

        # 3. Verify SQLite DB row exists and is encrypted (not plaintext)
        with sqlite3.connect(str(temp_vault_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT key_name, encrypted_blob FROM vault_entries WHERE key_name = ?", (secret_key,)).fetchone()
            assert row is not None
            assert row["key_name"] == secret_key
            blob: bytes = row["encrypted_blob"]
            assert blob.startswith(b"NXDP")
            assert secret_val.encode("utf-8") not in blob

        # 4. Verify list_keys
        keys = vault.list_keys()
        assert secret_key in keys

        # 5. Verify delete_secret
        deleted = vault.delete_secret(secret_key)
        assert deleted is True
        assert vault.get_secret(secret_key) is None
        assert secret_key not in vault.list_keys()
    finally:
        if temp_vault_db.exists():
            try:
                os.remove(temp_vault_db)
            except OSError:
                pass


def test_dpapi_vault_cryptographic_tamper_rejection():
    """Verifies that tampering with ciphertext in the vault causes decryption to fail safely."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_vault_db = Path(tf.name)

    try:
        vault = CredentialVault(db_path=temp_vault_db)
        key = "TAMPER_CHECK_KEY"
        val = "super-sensitive-signing-key-content"
        vault.set_secret(key, val)

        # Mutate the encrypted blob in SQLite directly
        with sqlite3.connect(str(temp_vault_db)) as conn:
            row = conn.execute("SELECT encrypted_blob FROM vault_entries WHERE key_name = ?", (key,)).fetchone()
            blob = bytearray(row[0])
            # Flip bits in the ciphertext portion
            blob[-5] ^= 0xFF
            conn.execute("UPDATE vault_entries SET encrypted_blob = ? WHERE key_name = ?", (bytes(blob), key))
            conn.commit()

        # Decryption of tampered ciphertext must safely fail and return None
        tampered_result = vault.get_secret(key)
        assert tampered_result is None
    finally:
        if temp_vault_db.exists():
            try:
                os.remove(temp_vault_db)
            except OSError:
                pass


# =============================================================================
# 2. LOCALHOST IPC SERVER AUTHENTICATION & REJECTION (401)
# =============================================================================
@pytest.fixture(scope="module")
def strict_auth_ipc_server():
    """Starts a live NexusIPCServer with strict authentication enforced."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    test_port = 47642
    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=temp_db,
        dry_run_hardware=True,
        strict_auth=True,
    )

    thread = threading.Thread(target=server.serve_forever, daemon=True, name="StrictAuthServerThread")
    thread.start()
    time.sleep(0.35)

    yield {
        "url": f"http://127.0.0.1:{test_port}",
        "server": server,
        "token": server.auth_token,
        "db_path": temp_db,
    }

    server.shutdown()
    server.server_close()
    if temp_db.exists():
        try:
            os.remove(temp_db)
        except OSError:
            pass


def test_unauthenticated_request_rejected_with_401(strict_auth_ipc_server):
    """Verifies unauthenticated calls to protected routes return HTTP 401."""
    base_url = strict_auth_ipc_server["url"]

    # 1. GET without Authorization header to protected endpoint
    req = urllib.request.Request(f"{base_url}/api/bridge/web-ingest/recent")
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req, timeout=4.0)
    assert exc_info.value.code == 401

    # 2. GET with invalid Bearer token
    req_bad = urllib.request.Request(
        f"{base_url}/api/bridge/web-ingest/recent",
        headers={"Authorization": "Bearer completely-wrong-invalid-token"},
    )
    with pytest.raises(urllib.error.HTTPError) as exc_info_bad:
        urllib.request.urlopen(req_bad, timeout=4.0)
    assert exc_info_bad.value.code == 401

    # 3. GET with correct Bearer token succeeds
    req_ok = urllib.request.Request(
        f"{base_url}/api/bridge/web-ingest/recent",
        headers={"Authorization": f"Bearer {strict_auth_ipc_server['token']}"},
    )
    with urllib.request.urlopen(req_ok, timeout=4.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True


def test_public_health_check_exempt_from_auth(strict_auth_ipc_server):
    """Verifies that public health check endpoints do not require auth."""
    base_url = strict_auth_ipc_server["url"]
    req = urllib.request.Request(f"{base_url}/api/health")
    with urllib.request.urlopen(req, timeout=4.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("status") in ("healthy", "ok", "HEALTHY", "ONLINE")


# =============================================================================
# 3. CSRF & ORIGIN HARDENING (403 FORBIDDEN ON CROSS-ORIGIN MUTATIONS)
# =============================================================================
def test_csrf_state_mutating_request_rejected_from_untrusted_origin(strict_auth_ipc_server):
    """Verifies that POST/PUT/DELETE from untrusted origins are rejected with 403 Forbidden."""
    base_url = strict_auth_ipc_server["url"]
    token = strict_auth_ipc_server["token"]

    post_payload = json.dumps({"key": "TEST_KEY", "value": "TEST_VAL"}).encode("utf-8")

    # Untrusted attacker origin
    untrusted_origin = "http://malicious-phishing-site.com"
    req_untrusted = urllib.request.Request(
        f"{base_url}/api/vault/set",
        data=post_payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Origin": untrusted_origin,
        },
        method="POST",
    )

    with pytest.raises(urllib.error.HTTPError) as exc_info:
        urllib.request.urlopen(req_untrusted, timeout=4.0)

    assert exc_info.value.code == 403
    err_body = json.loads(exc_info.value.read().decode("utf-8"))
    assert "Cross-Origin" in err_body.get("error", "") or "Forbidden" in err_body.get("error", "")


def test_csrf_state_mutating_request_allowed_from_trusted_origins(strict_auth_ipc_server):
    """Verifies that POST with trusted localhost or Electron origins succeeds."""
    base_url = strict_auth_ipc_server["url"]
    token = strict_auth_ipc_server["token"]

    payload = json.dumps({"prompt": "Check CSRF allowed", "command_type": "AUDIT"}).encode("utf-8")

    # Allowed Electron sandbox origin 'null'
    req_allowed = urllib.request.Request(
        f"{base_url}/api/tasks",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Origin": "null",
        },
        method="POST",
    )

    with urllib.request.urlopen(req_allowed, timeout=4.0) as resp:
        assert resp.status in (200, 201)
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True


# =============================================================================
# 4. SILENT AIR-GAP WORKSPACE GOVERNANCE
# =============================================================================
def test_silent_air_gap_governance_mode(strict_auth_ipc_server):
    """Verifies that SILENT mode enforces air-gap status in web ingest and governor."""
    server: NexusIPCServer = strict_auth_ipc_server["server"]
    base_url = strict_auth_ipc_server["url"]
    token = strict_auth_ipc_server["token"]

    # Set governor to SILENT mode
    server.governor.switch_mode("SILENT")
    assert server.governor.active_mode == "SILENT"

    req = urllib.request.Request(
        f"{base_url}/api/bridge/web-ingest/recent",
        headers={"Authorization": f"Bearer {token}"},
    )

    with urllib.request.urlopen(req, timeout=4.0) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True
        assert data.get("air_gapped") is True
        assert data.get("workspace_mode") == "SILENT"
        assert "Air-Gap" in data.get("status", "")

    # Reset mode back to DEV for hygiene
    server.governor.switch_mode("DEV")


# =============================================================================
# 5. REPO HYGIENE & GEMINI.MD GOVERNANCE LOCK
# =============================================================================
def test_workspace_root_repo_hygiene():
    """Verifies workspace root preserves clean layout and contains no rogue vendor packages."""
    workspace_root = Path.cwd().resolve()
    allowed_dirs = {
        ".git", ".github", ".pytest_cache", ".reticle", ".venv", ".wrangler", ".agents",
        "apps", "web", "core", "agents", "scripts", "docs", "tests", "functions", "bin", "dist",
        "supporting_files", "nexus_desktop.egg-info", "__pycache__"
    }

    subdirs = [p.name for p in workspace_root.iterdir() if p.is_dir()]
    for d in subdirs:
        assert d in allowed_dirs, f"Unregistered or rogue directory found in workspace root: {d}"

    # Verify GEMINI.md exists and contains locked invariants
    gemini_md = workspace_root / "GEMINI.md"
    assert gemini_md.exists(), "GEMINI.md must exist in workspace root"
    content = gemini_md.read_text(encoding="utf-8")

    assert "python nexus.py" in content, "GEMINI.md must lock single entrypoint python nexus.py"
    assert "agent_local.db" in content, "GEMINI.md must lock ~/.nexus-agent/db/agent_local.db"
    assert "127.0.0.1:47630" in content, "GEMINI.md must lock IPC spine 127.0.0.1:47630"
    assert "ScopeGuard" in content, "GEMINI.md must lock ScopeGuard"
    assert "WorkspaceGovernor" in content, "GEMINI.md must lock WorkspaceGovernor"
    assert "Zero-Stub / Zero-Mock Law" in content, "GEMINI.md must lock Zero-Stub / Zero-Mock Law"
