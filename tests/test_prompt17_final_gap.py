"""
Nexus OS v5.0 - Verification Suite for Prompt #17 Final Gap Execution.

Tests cover with ZERO MOCKS (real SQLite WAL, real filesystem, real SHA-256 hashes):
1. Macro capture, recursive secret redaction (${VAULT:...}), and .nxskill compilation.
2. SkillMarketplaceImporter compatibility and bundle installation into ecc_skills.
3. Reboot-resilient slice recovery sweep, ESTOP blocking, and SILENT air-gapped protection.
4. Notch HUD slice recovery check and prompt hooks.
5. nexus.py --lite CLI argument parsing and runtime wiring.
"""

import json
from pathlib import Path
import sqlite3
import tempfile
import time
import pytest

from core.runtime.macro_recorder import (
    MacroRecorder,
    mask_sensitive_data,
    sanitize_payload,
    save_recorded_macro,
    get_recorded_macro,
    list_recorded_macros,
    delete_recorded_macro,
    compile_macro_to_nxskill,
    ensure_macro_tables,
)
from core.mcp.skill_marketplace_importer import (
    SkillMarketplaceImporter,
    compute_bundle_hash,
)
from core.runtime.slice_engine import (
    InfinitySliceEngine,
    scan_interrupted_slices,
    get_recovery_summary,
    resume_or_discard_slice,
    SafetyGuard,
)
from apps.notch_hud.notch_window import NexusNotchWindow


@pytest.fixture
def temp_db():
    """Provides an isolated SQLite WAL database path for testing."""
    import gc
    import shutil
    tmpdir = tempfile.mkdtemp()
    db_path = Path(tmpdir) / "agent_local.db"
    try:
        yield db_path
    finally:
        gc.collect()
        shutil.rmtree(tmpdir, ignore_errors=True)


# =============================================================================
# 1. MACRO CAPTURE, REDACTION & .NXSKILL COMPILATION TESTS
# =============================================================================

def test_macro_credential_redaction():
    """Verifies that all credential patterns are masked to ${VAULT:...} placeholders."""
    raw_inputs = [
        ("AIzaSyD-1234567890abcdefghijklmnopqrst", "${VAULT:GOOGLE_API_KEY}"),
        ("sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890", "${VAULT:ANTHROPIC_API_KEY}"),
        ("sk-proj-1234567890abcdefghijklmnopqrstuvwxyz", "${VAULT:OPENAI_API_KEY}"),
        ("ghp_123456789012345678901234567890123456", "${VAULT:GITHUB_TOKEN}"),
        ("gsk_1234567890123456789012345678901234567890", "${VAULT:GROQ_API_KEY}"),
        ("xoxb-1234567890-1234567890-abcdefghijklmnop", "${VAULT:SLACK_TOKEN}"),
        ("AKIAIOSFODNN7EXAMPLE", "${VAULT:AWS_ACCESS_KEY}"),
        ("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefgh", "Bearer ${VAULT:BEARER_TOKEN}"),
        ("password=SuperSecretPassword123!", "password=${VAULT:SECRET_PLACEHOLDER}"),
        ("token: 'mySuperAuthTokenValue123'", "token: '${VAULT:SECRET_PLACEHOLDER}'"),
    ]

    for raw, expected in raw_inputs:
        masked = mask_sensitive_data(raw)
        assert expected in masked, f"Expected '{expected}' in '{masked}' for input '{raw}'"


def test_sanitize_payload_recursive():
    """Verifies recursive data sanitization across dictionaries, lists, and strings."""
    nested = {
        "user": "niranx",
        "auth": {
            "password": "ClearTextPassword999",
            "api_key": "AIzaSyD-9999999999abcdefghijklmnopqrstu",
            "metadata": {
                "token": "ghp_999999999999999999999999999999999999",
                "notes": "Bearer sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",
            },
        },
        "actions": [
            {"type": "type_text", "text": "password=MySecretPassword123!"},
            {"type": "env_export", "value": "AKIAIOSFODNN7EXAMPLE"},
        ],
    }

    clean = sanitize_payload(nested)

    assert clean["auth"]["password"] == "${VAULT:SECRET_PLACEHOLDER}"
    assert clean["auth"]["api_key"] == "${VAULT:SECRET_PLACEHOLDER}"
    assert clean["auth"]["metadata"]["token"] == "${VAULT:SECRET_PLACEHOLDER}"
    assert "${VAULT:BEARER_TOKEN}" in clean["auth"]["metadata"]["notes"]
    assert "${VAULT:SECRET_PLACEHOLDER}" in clean["actions"][0]["text"]
    assert "${VAULT:AWS_ACCESS_KEY}" in clean["actions"][1]["value"]


def test_macro_recorder_lifecycle_and_db_persistence(temp_db):
    """Verifies live macro recording, SQLite WAL storage, retrieval, listing, and deletion."""
    ensure_macro_tables(temp_db)

    recorder = MacroRecorder(mask_secrets=True, db_path=temp_db)
    assert not recorder.is_recording

    # 1. Start recording session
    assert recorder.start_recording()
    assert recorder.is_recording

    # 2. Record simulated interactions
    recorder.record_move(100, 200)
    recorder.record_click(100, 200, button="left")
    recorder.record_type("Hello World")
    recorder.record_type("password=ConfidentialPassword123!", is_sensitive=True)
    recorder.record_wait(50.0)
    recorder.record_uia("Button", "Submit", "Invoke", automation_id="btn-submit")

    # 3. Stop recording
    actions = recorder.stop_recording()
    assert not recorder.is_recording
    assert len(actions) == 6

    # 4. Save to SQLite WAL
    saved = recorder.save_to_db(
        name="test-login-flow",
        description="Automated login test macro",
        db_path=temp_db,
        tags=["auth", "login"],
    )
    assert saved["success"]
    assert saved["name"] == "test-login-flow"
    assert saved["action_count"] == 6

    # 5. Retrieve from SQLite WAL
    retrieved = get_recorded_macro("test-login-flow", db_path=temp_db)
    assert retrieved is not None
    assert retrieved["name"] == "test-login-flow"
    assert len(retrieved["actions"]) == 6
    # Verify sensitive data in action 3 was sanitized
    pwd_action = retrieved["actions"][3]
    assert pwd_action["data"]["text"] == "${VAULT:SECRET_PLACEHOLDER}"

    # 6. List macros
    macro_list = list_recorded_macros(db_path=temp_db)
    assert len(macro_list) >= 1
    assert any(m["name"] == "test-login-flow" for m in macro_list)

    # 7. Delete macro
    deleted = delete_recorded_macro("test-login-flow", db_path=temp_db)
    assert deleted
    assert get_recorded_macro("test-login-flow", db_path=temp_db) is None


def test_compile_macro_to_nxskill_and_marketplace_install(temp_db):
    """Verifies that compile_macro_to_nxskill produces a valid signed package installable via SkillMarketplaceImporter."""
    ensure_macro_tables(temp_db)

    # Record and save a macro
    actions = [
        {"action_type": "mouse_move", "data": {"x": 500, "y": 300}, "rel_ms": 10.0, "delta_ms": 10.0},
        {"action_type": "mouse_click", "data": {"x": 500, "y": 300, "button": "left"}, "rel_ms": 25.0, "delta_ms": 15.0},
        {"action_type": "type_text", "data": {"text": "npm test", "is_sensitive": False}, "rel_ms": 100.0, "delta_ms": 75.0},
    ]
    save_recorded_macro(
        name="run-test-suite",
        actions=actions,
        description="Executes automated npm test in terminal",
        db_path=temp_db,
    )

    with tempfile.TemporaryDirectory() as pkg_dir:
        out_pkg = Path(pkg_dir) / "run-test-suite.nxskill"

        # Compile macro to .nxskill
        compiled = compile_macro_to_nxskill(
            macro_name="run-test-suite",
            output_path=out_pkg,
            db_path=temp_db,
        )

        assert compiled["success"]
        assert compiled["slug"] == "run-test-suite"
        assert out_pkg.exists()

        bundle = compiled["bundle"]
        assert bundle["type"] == "macro"
        assert bundle["category"] == "automation"
        assert bundle["orbiter_group"] == "AUTO-01"
        assert len(bundle["actions"]) == 3

        # Verify SHA-256 integrity match
        computed_sha = compute_bundle_hash(bundle)
        assert bundle["sha256"] == computed_sha

        # Verify SkillMarketplaceImporter can audit, verify, and install the compiled .nxskill bundle
        importer = SkillMarketplaceImporter(db_path=temp_db)
        install_res = importer.install_nxskill_bundle(out_pkg)
        assert install_res["success"], f"SkillMarketplaceImporter installation failed: {install_res.get('error')}"
        assert install_res["slug"] == "run-test-suite"

        # Verify presence in installed_skills SQLite table
        with sqlite3.connect(str(temp_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM installed_skills WHERE slug = ?;", ("run-test-suite",)).fetchone()
            assert row is not None
            assert row["slug"] == "run-test-suite"


# =============================================================================
# 2. REBOOT-RESILIENT SLICE RECOVERY & ESTOP/SILENT GUARDS
# =============================================================================

def test_slice_recovery_sweep_and_transition(temp_db):
    """Verifies that scan_interrupted_slices detects in-flight slices and transitions them to INTERRUPTED_REBOOT."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    # Pre-populate slices table with orphaned and finished slices
    with engine._get_connection() as conn:
        # Orphaned running slices
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice-orphaned-1", "th-1", json.dumps({"step_count": 2}), "RUNNING", "DEV-01", "In-flight task 1", now - 100, now - 100),
        )
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice-orphaned-2", "th-2", json.dumps({"step_count": 1}), "EXECUTING", "DEV-02", "In-flight task 2", now - 50, now - 50),
        )
        # Already finished slice (must NOT be touched)
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice-done-3", "th-3", json.dumps({"step_count": 4}), "COMPLETED", "DEV-01", "Finished task", now - 200, now - 200),
        )

    # Run scan
    recoverable = scan_interrupted_slices(db_path=str(temp_db))
    assert len(recoverable) == 2

    # Check status transitions in database
    with engine._get_connection() as conn:
        row1 = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice-orphaned-1';").fetchone()
        row2 = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice-orphaned-2';").fetchone()
        row3 = conn.execute("SELECT status FROM execution_slices WHERE slice_id = 'slice-done-3';").fetchone()

        assert row1["status"] == "INTERRUPTED_REBOOT"
        assert row2["status"] == "INTERRUPTED_REBOOT"
        assert row3["status"] == "COMPLETED"


def test_get_recovery_summary_with_estop_guard(temp_db):
    """Verifies that get_recovery_summary and resume_or_discard_slice strictly respect ESTOP."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            ("slice-estop-test", "th-estop", json.dumps({"step_count": 1}), "RUNNING", "DEV-01", "Task under estop", now, now),
        )

    # 1. Without ESTOP: can_resume is True
    SafetyGuard.reset_estop()
    summary_clean = engine.get_recovery_summary()
    assert summary_clean["count"] == 1
    assert not summary_clean["estop_active"]
    assert summary_clean["can_resume"]
    assert summary_clean["recommendation"] == "READY_TO_RESUME"

    # 2. Trigger ESTOP
    engine.trigger_estop(reason="Testing safety invariant")
    assert engine.is_estop_asserted()

    summary_estop = engine.get_recovery_summary()
    assert summary_estop["estop_active"]
    assert not summary_estop["can_resume"]
    assert summary_estop["recommendation"] == "HALTED_BY_ESTOP"

    # Attempting to resume under ESTOP must be BLOCKED
    resume_res = engine.resume_or_discard_slice("slice-estop-test", action="resume")
    assert not resume_res["success"]
    assert resume_res["status"] == "BLOCKED_ESTOP"

    # Reset ESTOP
    engine.reset_estop()
    assert not engine.is_estop_asserted()

    # Now resumption succeeds
    resume_res2 = engine.resume_or_discard_slice("slice-estop-test", action="resume")
    assert resume_res2["success"]
    assert resume_res2["status"] == "ACTIVE"


def test_slice_recovery_silent_mode_guard(temp_db):
    """Verifies that slices requiring external network are blocked under SILENT air-gapped mode."""
    engine = InfinitySliceEngine(db_path=str(temp_db))
    now = time.time()

    with engine._get_connection() as conn:
        conn.execute(
            """
            INSERT INTO execution_slices (slice_id, thread_id, state_json, status, agent_id, task_summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                "slice-network-test",
                "th-net",
                json.dumps({"step_count": 1, "requires_network": True, "pending_tool": "remote_http"}),
                "SUSPENDED",
                "DEV-01",
                "Network download task",
                now,
                now,
            ),
        )

    # Set SILENT mode on governor
    from core.runtime.workspaces import WorkspaceGovernor
    orig_mode = getattr(WorkspaceGovernor, "_active_mode", "DEV")
    try:
        WorkspaceGovernor._active_mode = "SILENT"
        res = engine.resume_or_discard_slice("slice-network-test", action="resume")
        assert not res["success"]
        assert res["status"] == "BLOCKED_SILENT"
        assert res.get("air_gapped")
    finally:
        WorkspaceGovernor._active_mode = orig_mode


# =============================================================================
# 3. NOTCH HUD RECOVERY HOOKS
# =============================================================================

def test_notch_hud_recovery_methods(temp_db):
    """Verifies that NexusNotchWindow recovery sweep and prompt hook execute cleanly."""
    window = NexusNotchWindow()

    # Check recovery summary invocation
    summary = window._check_interrupted_slices()
    assert summary is not None
    assert "count" in summary
    assert "can_resume" in summary

    # Verify visual prompt does not throw
    window._show_slice_recovery_prompt(summary)


# =============================================================================
# 4. NEXUS.PY --LITE MODE WIRING
# =============================================================================

def test_nexus_cli_lite_parser():
    """Verifies that nexus.py CLI argument parser correctly exposes --lite."""
    from nexus import build_parser
    parser = build_parser()

    args_lite = parser.parse_args(["--lite"])
    assert args_lite.lite is True
    assert not args_lite.notch
    assert not args_lite.command_center

    args_default = parser.parse_args([])
    assert args_default.lite is False


def test_nexus_boot_lite_function_signature():
    """Verifies that boot_lite_nexus is defined, importable, and properly wired."""
    import nexus
    assert hasattr(nexus, "boot_lite_nexus")
    assert callable(nexus.boot_lite_nexus)


# =============================================================================
# 5. VERTICAL IPC INTEGRATION (127.0.0.1 Bearer Token API)
# =============================================================================

def test_ipc_server_macro_and_recovery_endpoints(temp_db):
    """Verifies vertical IPC REST routes for macro lifecycle and slice recovery summary."""
    import socket
    import threading
    import urllib.request
    from core.runtime.ipc_server import NexusIPCServer

    # Find free local port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        test_port = s.getsockname()[1]

    server = NexusIPCServer(
        host="127.0.0.1",
        port=test_port,
        db_path=temp_db,
        dry_run_hardware=True,
        token="test-ipc-token-12345",
        strict_auth=False,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.3)

    try:
        base_url = f"http://127.0.0.1:{test_port}"
        headers = {"Authorization": "Bearer test-ipc-token-12345", "Content-Type": "application/json"}

        # 1. GET /api/slices/summary
        req = urllib.request.Request(f"{base_url}/api/slices/summary", headers=headers)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert "recovery_summary" in data

        # 2. POST /api/macros/start
        req = urllib.request.Request(f"{base_url}/api/macros/start", data=b"{}", headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert data["is_recording"]

        # 3. POST /api/macros/record
        record_payload = json.dumps({"action_type": "type_text", "data": {"text": "password=MyVaultSecret123!"}}).encode()
        req = urllib.request.Request(f"{base_url}/api/macros/record", data=record_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert "${VAULT:SECRET_PLACEHOLDER}" in data["action"]["data"]["text"]

        # 4. POST /api/macros/stop (save as 'ipc-flow')
        stop_payload = json.dumps({"name": "ipc-flow", "description": "IPC integration test"}).encode()
        req = urllib.request.Request(f"{base_url}/api/macros/stop", data=stop_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert not data["is_recording"]
            assert "saved" in data

        # 5. GET /api/macros
        req = urllib.request.Request(f"{base_url}/api/macros", headers=headers)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert data["count"] >= 1
            assert any(m["name"] == "ipc-flow" for m in data["macros"])

        # 6. GET /api/macros/ipc-flow
        req = urllib.request.Request(f"{base_url}/api/macros/ipc-flow", headers=headers)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert data["macro"]["name"] == "ipc-flow"

        # 7. POST /api/macros/compile
        compile_payload = json.dumps({"name": "ipc-flow"}).encode()
        req = urllib.request.Request(f"{base_url}/api/macros/compile", data=compile_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
            assert data["slug"] == "ipc-flow"
            assert data["bundle"]["type"] == "macro"

        # 8. POST /api/macros/delete
        del_payload = json.dumps({"name": "ipc-flow"}).encode()
        req = urllib.request.Request(f"{base_url}/api/macros/delete", data=del_payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode())
            assert data["success"]
    finally:
        server.shutdown()
        server.server_close()

