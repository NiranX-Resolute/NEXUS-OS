"""Nexus OS v5.0 - Prompt #19 Verification Test Suite (Zero Mocks).

Targeted real tests verifying:
1. Opuscar Bridge (@nexus_tool wrappers, styles, storyboard, InfinitySliceEngine, air-gap)
2. Mobile QR Handshake over Tailscale/Cloudflare (short-lived scoped Bearer token bound to 127.0.0.1:47630)
3. Google Calendar FastMCP & DPAPI Vault (read, search, create, update, delete with ScopeGuard HITL confirmation)
"""

import json
import time
import pytest
from pathlib import Path

from core.mcp.plugins.opuscar_bridge import (
    opuscar_list_styles,
    opuscar_generate_storyboard,
    opuscar_create_film,
    opuscar_status,
)
from core.runtime.slice_engine import InfinitySliceEngine
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeViolationError
from core.runtime.ipc_server import NexusIPCServer, DEFAULT_IPC_PORT
from core.security.vault import (
    store_oauth_tokens,
    load_oauth_tokens,
    delete_oauth_tokens,
    set_json_secret,
    get_json_secret,
)
from core.mcp.calendar_mcp_server import (
    store_calendar_credentials,
    calendar_vault_status,
    calendar_create,
    calendar_list,
    calendar_search,
    calendar_update,
    calendar_delete,
)


# =============================================================================
# 1. OPUSCAR BRIDGE & SLICE ENGINE TESTS
# =============================================================================

def test_opuscar_list_styles_catalog():
    res = opuscar_list_styles()
    assert res["success"] is True
    assert res["count"] >= 8
    styles = res["styles"]
    style_ids = [s["style_id"] for s in styles]
    assert "documentary" in style_ids
    assert "blueprint_sketch" in style_ids
    assert "data_map" in style_ids
    assert "cyberpunk_hud" in style_ids


def test_opuscar_generate_storyboard():
    res = opuscar_generate_storyboard(topic="Distributed Edge Mesh", style="blueprint_sketch", scene_count=4)
    assert res["success"] is True
    assert res["scene_count"] == 4
    assert res["total_duration_sec"] > 0
    scenes = res["scenes"]
    assert len(scenes) == 4
    for sc in scenes:
        assert "narration" in sc
        assert "visual_prompt" in sc
        assert "canvas_directive" in sc


def test_opuscar_create_film_and_slice_tracking():
    # Verify async slice registration in SQLite WAL
    topic = "Autonomous System Reflexes"
    res = opuscar_create_film(topic=topic, style="documentary", output_name="test_reflex_film")
    assert res["success"] is True
    assert "slice_id" in res
    slice_id = res["slice_id"]
    assert slice_id.startswith("slice_")

    # Give worker a brief moment to register
    time.sleep(0.3)
    status_res = opuscar_status(slice_id=slice_id)
    assert status_res["success"] is True
    slice_rec = status_res["slice"]
    assert slice_rec["slice_id"] == slice_id
    assert slice_rec["status"] in ("ACTIVE", "COMPLETED", "QUEUED")


def test_opuscar_air_gap_governor_enforcement():
    gov = WorkspaceGovernor()
    orig_mode = gov.get_mode()
    try:
        gov.set_mode("SILENT")
        with pytest.raises(PermissionError) as exc_info:
            opuscar_create_film(topic="Blocked In Air Gap")
        assert "SILENT air-gapped mode" in str(exc_info.value)
    finally:
        gov.set_mode(orig_mode)


# =============================================================================
# 2. MOBILE QR HANDSHAKE OVER TAILSCALE / CLOUDFLARE
# =============================================================================

def test_mobile_qr_generation_and_token_binding():
    server = NexusIPCServer(port=0, dry_run_hardware=True, token="test_master_token_123")
    try:
        png_bytes, mime, info = server.generate_qr_pairing(ttl_seconds=300.0)

        assert mime == "image/png"
        assert len(png_bytes) > 100
        assert info["success"] is True
        assert "token" in info
        assert info["bound_to"] == f"127.0.0.1:{DEFAULT_IPC_PORT}"
        assert info["expires_in_seconds"] == 300
        assert info["qr_base64"].startswith("data:image/png;base64,")
        assert "pairing_url" in info
        assert "token=" in info["pairing_url"]
        assert "bind=127.0.0.1" in info["pairing_url"]
    finally:
        server.server_close()


def test_mobile_qr_token_validation_and_expiry():
    server = NexusIPCServer(port=0, dry_run_hardware=True, token="test_master_token_123")
    try:
        token = "test_scoped_bearer_xyz987"
        
        # Register token with 2-second TTL
        server.register_qr_token(token=token, ttl_seconds=2.0)
        assert server.validate_qr_token(token) is True
        assert server.validate_qr_token("non_existent_token") is False

        # Wait for token expiration
        time.sleep(2.1)
        assert server.validate_qr_token(token) is False
    finally:
        server.server_close()


# =============================================================================
# 3. DPAPI GOOGLE CALENDAR MCP & SCOPEGUARD HITL CONFIRMATION
# =============================================================================

def test_dpapi_vault_token_storage():
    service = "google_calendar_test"
    sample_tokens = {
        "access_token": "ya29.test_oauth_token_val",
        "refresh_token": "1//test_refresh_token_val",
        "token_type": "Bearer",
        "expires_in": 3600,
    }

    # Store structured OAuth tokens
    assert store_oauth_tokens(service, sample_tokens) is True

    # Retrieve and verify round-trip DPAPI decryption
    loaded = load_oauth_tokens(service)
    assert loaded is not None
    assert loaded["access_token"] == sample_tokens["access_token"]
    assert loaded["refresh_token"] == sample_tokens["refresh_token"]

    # Delete
    assert delete_oauth_tokens(service) is True
    assert load_oauth_tokens(service) is None


def test_calendar_mcp_crud_and_scopeguard_gate():
    # 1. Vault status
    st = calendar_vault_status()
    assert st["success"] is True
    assert "credentials_configured" in st
    assert "local_timezone" in st

    # 2. Create Event (stored in local SQLite cache)
    summary = f"Prompt 19 Integration Review {int(time.time())}"
    c_res = calendar_create(
        summary=summary,
        description="Verifying zero-mock calendar MCP tools under DPAPI",
        location="Nexus Command Center",
        reminder_minutes=15,
    )
    assert c_res["success"] is True
    assert "event_id" in c_res
    event_id = c_res["event_id"]

    # 3. Search Event
    s_res = calendar_search(query=summary)
    assert s_res["success"] is True
    assert any(e["id"] == event_id for e in s_res["events"])

    # 4. List Events
    l_res = calendar_list(max_results=50)
    assert l_res["success"] is True
    assert any(e["id"] == event_id for e in l_res["events"])

    # 5. Update Event
    u_res = calendar_update(event_id=event_id, summary=f"{summary} - Updated")
    assert u_res["success"] is True
    assert "summary" in u_res["updated_fields"]

    # 6. Delete Event WITHOUT HITL Confirmation -> ScopeViolationError
    with pytest.raises(ScopeViolationError) as exc_info:
        calendar_delete(event_id=event_id, hitl_confirmed=False)
    assert "requires interactive Allow / Deny approval on Nexus Notch HUD" in str(exc_info.value)

    # 7. Delete Event WITH HITL Confirmation -> Success
    d_res = calendar_delete(event_id=event_id, hitl_confirmed=True)
    assert d_res["success"] is True
    assert d_res["deleted"] is True

    # Verify purged from cache
    after_search = calendar_search(query=summary)
    assert not any(e["id"] == event_id for e in after_search["events"])
