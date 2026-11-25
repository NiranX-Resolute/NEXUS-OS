"""Integration tests for FastAPI <-> NexusIPCServer gateway bridge routes.

Verifies real SQLite WAL mutations, ScopeGuard containment on filesystem routes,
E-Stop trigger/reset roundtrip, provider/model catalog hydration, themes,
macros/routines, and mandatory strict Bearer auth on secret vault endpoints.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient

from core.engine.safety_guard import SafetyGuard
from core.runtime.gateway import create_gateway_app


def test_gateway_ipc_bridge_core_routes_and_vault_auth(tmp_path: Path, monkeypatch) -> None:
    """Exercises bridged FastAPI routes against an isolated SQLite WAL database."""
    token = "test-bridge-token-99"
    monkeypatch.setenv("NEXUS_IPC_TOKEN", token)
    monkeypatch.setenv("NEXUS_STRICT_AUTH", "1")
    monkeypatch.delenv("ESTOP", raising=False)
    SafetyGuard.reset_estop()

    db_file = tmp_path / "gateway_bridge_test.db"
    app = create_gateway_app(db_path=db_file, dry_run_hardware=True)
    active_token = os.environ.get("NEXUS_IPC_TOKEN", token)
    headers = {"Authorization": f"Bearer {active_token}", "Origin": "http://localhost:5173"}

    try:
        with TestClient(app) as client:
            # 1. Core status & telemetry logs
            resp = client.get("/api/status", headers=headers)
            assert resp.status_code == 200
            status_data = resp.json()
            assert status_data["success"] is True
            assert status_data["status"] == "ONLINE"

            resp = client.get("/api/telemetry/logs?limit=10", headers=headers)
            assert resp.status_code == 200
            assert "logs" in resp.json()

            # 2. Filesystem tree + read + ScopeGuard containment
            resp = client.get("/api/fs/tree", headers=headers)
            assert resp.status_code == 200
            tree_data = resp.json()
            assert "items" in tree_data and "files" in tree_data

            resp = client.get("/api/fs/read?path=nexus.py", headers=headers)
            assert resp.status_code == 200
            read_data = resp.json()
            assert read_data.get("success") is True
            assert "nexus" in read_data.get("content", "").lower()

            resp = client.get("/api/fs/read?path=C:/Windows/System32/drivers/etc/hosts", headers=headers)
            assert resp.status_code == 400

            # 3. Git status
            resp = client.get("/api/git/status", headers=headers)
            assert resp.status_code == 200
            assert "branch" in resp.json()

            # 4. Themes, wallpapers, providers, models catalog, macros
            resp = client.get("/api/themes", headers=headers)
            assert resp.status_code == 200
            assert "themes" in resp.json()

            resp = client.get("/api/wallpapers", headers=headers)
            assert resp.status_code == 200
            assert "wallpapers" in resp.json()

            resp = client.get("/api/providers", headers=headers)
            assert resp.status_code == 200
            prov_data = resp.json()
            assert prov_data["success"] is True
            assert len(prov_data["providers"]) >= 1

            resp = client.get("/api/models/catalog", headers=headers)
            assert resp.status_code == 200
            assert len(resp.json().get("models", [])) >= 1

            resp = client.get("/api/macros", headers=headers)
            assert resp.status_code == 200
            assert resp.json()["success"] is True

            # 5. E-Stop trigger & reset roundtrip
            resp = client.post("/api/estop/trigger", json={"reason": "Bridge Test"}, headers=headers)
            assert resp.status_code == 200
            assert resp.json()["security_state"] == "LOCKED"
            assert os.environ.get("ESTOP") == "1"

            resp = client.post("/api/estop/reset", headers=headers)
            assert resp.status_code == 200
            assert resp.json()["security_state"] == "NOMINAL"
            assert "ESTOP" not in os.environ

            # 6. Strict secret auth even when global NEXUS_STRICT_AUTH=0
            monkeypatch.setenv("NEXUS_STRICT_AUTH", "0")
            unauth_vault = client.post("/api/vault/get", json={"key": "TEST_SECRET"})
            assert unauth_vault.status_code == 401

            unauth_del = client.delete("/api/providers/gemini/key")
            assert unauth_del.status_code == 401

            set_resp = client.post(
                "/api/vault/set",
                json={"key": "BRIDGE_TEST_KEY", "value": "val-123"},
                headers=headers,
            )
            assert set_resp.status_code == 200
            assert set_resp.json()["success"] is True
    finally:
        os.environ.pop("ESTOP", None)
        SafetyGuard.reset_estop()
