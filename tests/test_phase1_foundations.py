"""Nexus OS v5.0 - Phase 1 Foundational Architecture Test Suite.

Verifies all 5 Phase 1 Core Deliverables:
1. Unified Neural Workspaces & Manifest ([DEV], [STUDY], [STUDIO], [SILENT])
2. Tier-1 Ambient Notch HUD & Win32 Integration (Stealth affinity, Fullscreen guard, Shelf, SendInput)
3. Infinity Execution-Slice Engine (Stackless runner, single LLM step, tool dispatch, 0 MB idle RAM)
4. Gravitas 6-Invariant & ScopeGuard Security Middleware (Scope allowlist, path traversal block, SEC-01)
5. Local Sovereignty Store (SQLite WAL mode, FTS5 BM25, sqlite-vec / cosine semantic search)
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import time
import pytest

from core.runtime import (
    GravitasInvariantException,
    InfinitySliceEngine,
    ReadBeforeWriteViolationError,
    ScopeGuard,
    ScopeViolationError,
    WorkspaceGovernor,
)
from core.memory.sovereign_store import SovereignMemoryStore
from core.mcp.sec_mcp_server import (
    run_gitleaks_audit,
    run_nmap_recon,
    run_nuclei_scan,
    run_obscura_security_check,
    run_semgrep_audit,
)
from apps.notch_hud.win32_utils import (
    WDA_EXCLUDEFROMCAPTURE,
    inject_text_at_cursor,
    is_fullscreen_app_active,
    set_stealth_affinity,
)
from apps.notch_hud.drag_shelf import IngestedFile, NexusDragShelf


# =============================================================================
# 1. WORKSPACE & CONFIG SETUP (nexus_manifest.yaml)
# =============================================================================
def test_neural_workspaces_manifest():
    gov = WorkspaceGovernor("nexus_manifest.yaml")
    
    # DEV Workspace
    gov.set_mode("DEV")
    assert gov.get_mode() == "DEV"
    assert "dev_context" in gov.get_memory_namespace()
    assert "sec_sentinel" in gov.get_mcp_servers()
    assert gov.is_tool_permitted("filesystem")
    assert gov.is_tool_permitted("semgrep")
    assert gov.is_tool_permitted("nuclei")
    assert gov.is_vector_indexing_enabled() is True
    assert gov.get_resource_profile() == "HIGH_PERFORMANCE"

    # STUDY Workspace
    gov.set_mode("STUDY")
    assert gov.get_mode() == "STUDY"
    assert "study_context" in gov.get_memory_namespace()
    assert "scholar_db" in gov.get_mcp_servers()
    assert gov.is_tool_permitted("sqlite")
    assert not gov.is_tool_permitted("nuclei")
    assert gov.get_security_level() == "STRICT"

    # STUDIO Workspace
    gov.set_mode("STUDIO")
    assert gov.get_mode() == "STUDIO"
    assert "studio_context" in gov.get_memory_namespace()
    assert "media_canvas" in gov.get_mcp_servers()
    assert gov.is_tool_permitted("audio")
    assert gov.is_tool_permitted("canvas")

    # SILENT Workspace (Zero-Idle RAM Sandbox)
    gov.set_mode("SILENT")
    assert gov.get_mode() == "SILENT"
    assert "silent_sandbox" in gov.get_memory_namespace()
    assert len(gov.get_allowed_paths()) == 0
    assert len(gov.get_mcp_servers()) == 0
    assert not gov.is_tool_permitted("filesystem")
    assert gov.get_resource_profile() == "ZERO_IDLE"
    assert gov.get_security_level() == "AIR_GAPPED"

    # Restore default DEV mode
    gov.set_mode("DEV")


# =============================================================================
# 2. TIER-1 FAST REFLEX & AMBIENT NOTCH (apps/notch_hud/)
# =============================================================================
def test_notch_hud_and_win32():
    # Constant assertions
    assert WDA_EXCLUDEFROMCAPTURE == 0x00000011

    # Safety checks without crashing on 0 HWND
    assert set_stealth_affinity(0) is False

    # Fullscreen detector executes without raising exceptions
    fullscreen_state = is_fullscreen_app_active()
    assert isinstance(fullscreen_state, bool)

    # Ingested file metadata calculation
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
        tf.write(b"Nexus OS v5.0 Fast Reflex Test")
        temp_path = tf.name

    try:
        shelf = NexusDragShelf()
        shelf.add_files([temp_path])
        assert len(shelf._staged_files) == 1
        staged = shelf._staged_files[0]
        assert staged.name == os.path.basename(temp_path)
        assert len(staged.sha256) == 64
        assert staged.format_size().endswith("B")

        # Cancel-safe clear
        shelf.clear_shelf()
        assert len(shelf._staged_files) == 0
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    # SendInput text injection safely callable
    dispatched = inject_text_at_cursor("")
    assert dispatched == 0


# =============================================================================
# 3. INFINITY EXECUTION-SLICE ENGINE (core/runtime/slice_engine.py)
# =============================================================================
def test_infinity_execution_slice_stackless_runner():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        engine = InfinitySliceEngine(db_path=db_path)
        thread_id = "thread_slice_001"
        slice_id = "slice_test_runner"

        initial_state = {
            "task": "Perform code audit",
            "step_count": 0,
            "messages": [],
        }

        # Suspend slice into SQLite WAL
        engine.suspend_slice(thread_id=thread_id, current_state=initial_state, slice_id=slice_id)

        # Mock LLM completer requesting a tool call
        def mock_llm_completer(messages):
            return {
                "text": "Auditing local perimeter",
                "tool_call": {
                    "name": "semgrep",
                    "arguments": {"path": "."},
                },
                "finish_reason": "tool_calls",
            }

        # Mock tool dispatcher
        mock_tool_called = []
        def mock_tool_dispatcher(tool_name, args):
            mock_tool_called.append((tool_name, args))
            return "Audit clean, 0 findings"

        # Execute single execution slice step
        report = engine.execute_slice_step(
            slice_id=slice_id,
            injected_event={"prompt": "Begin audit"},
            llm_completer=mock_llm_completer,
            tool_dispatcher=mock_tool_dispatcher,
        )

        assert report["slice_id"] == slice_id
        assert report["status"] == "SUSPENDED"
        assert report["idle_ram_released"] is True
        assert len(mock_tool_called) == 1
        assert mock_tool_called[0][0] == "semgrep"

        # Verify state was persisted to SQLite WAL
        record = engine.get_slice(slice_id)
        assert record is not None
        assert record["state"]["step_count"] == 1
        assert len(record["state"]["messages"]) == 3  # user, assistant, tool

        # Step 2: Final completion step
        def mock_final_completer(messages):
            return {
                "text": "Audit complete. No vulnerabilities detected.",
                "tool_call": None,
                "finish_reason": "stop",
            }

        report_step2 = engine.execute_slice_step(
            slice_id=slice_id,
            llm_completer=mock_final_completer,
        )
        assert report_step2["status"] == "COMPLETED"
        assert report_step2["tool_execution"] is None
        assert report_step2["idle_ram_released"] is True
    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass


# =============================================================================
# 4. GRAVITAS 6-INVARIANT & SCOPEGUARD (core/runtime/scope_guard.py)
# =============================================================================
def test_scope_guard_and_sec01_sentinel():
    guard = ScopeGuard("engagement_scope.json")

    # 1. Target scope validation
    assert guard.validate_target("localhost") is True
    assert guard.validate_target("127.0.0.1") is True
    assert guard.validate_target("http://127.0.0.1:8080/api") is True
    assert guard.validate_target("service.local.nexus") is True
    assert guard.validate_target("malicious-external-target.com") is False
    assert guard.validate_target("198.51.100.1") is False

    # 2. Path Traversal Prevention
    assert guard.validate_path("core/runtime/scope_guard.py") is True
    assert guard.validate_path("../../etc/passwd") is False
    assert guard.validate_path("..\\..\\Windows\\System32\\cmd.exe") is False

    # 3. Enforcement of allowlist and unauthorized target block
    guard.enforce("nuclei", "http://localhost:8080")
    with pytest.raises(PermissionError) as exc_info:
        guard.enforce("nuclei", "https://unauthorized-bank.com")
    assert "outside the authorized engagement scope" in str(exc_info.value)

    # 4. Unauthorized tool rejection
    with pytest.raises(PermissionError) as exc_info_tool:
        guard.enforce("unauthorized_exploit_tool", "localhost")
    assert "not in the authorized SEC-01 toolchain" in str(exc_info_tool.value)

    # 5. SEC-01 Sentinel MCP tool handlers reject out-of-scope targets
    res_bad = run_nuclei_scan("https://unauthorized-target.org")
    assert res_bad["success"] is False
    assert "outside the authorized engagement scope" in res_bad["error"]

    res_bad_nmap = run_nmap_recon("8.8.8.8")
    assert res_bad_nmap["success"] is False
    assert "outside the authorized engagement scope" in res_bad_nmap["error"]


# =============================================================================
# 5. LOCAL SOVEREIGNTY STORE (core/memory/sovereign_store.py)
# =============================================================================
def test_sovereign_memory_store():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        store = SovereignMemoryStore(db_path=db_path, vector_dim=4)

        # Store memories in namespaces
        v1 = [1.0, 0.0, 0.0, 0.0]
        v2 = [0.0, 1.0, 0.0, 0.0]
        v3 = [0.95, 0.05, 0.0, 0.0]

        id1 = store.store_memory(
            title="Kernel Architecture",
            content="Nexus OS v5.0 stackless coroutine execution slices and zero idle RAM",
            namespace="dev_context",
            embedding=v1,
        )

        id2 = store.store_memory(
            title="Quantum Physics Notes",
            content="Schrodinger wave function and Hilbert space operators for quantum mechanics",
            namespace="study_context",
            embedding=v2,
        )

        id3 = store.store_memory(
            title="Kernel Memory Engine",
            content="Low latency SQLite WAL sovereign memory engine with FTS5 and sqlite-vec",
            namespace="dev_context",
            embedding=v3,
        )

        # Verify namespaces
        namespaces = store.list_namespaces()
        assert "dev_context" in namespaces
        assert "study_context" in namespaces

        # 1. Full-Text Search (FTS5 BM25)
        text_hits = store.search_text("coroutine", namespace="dev_context")
        assert len(text_hits) >= 1
        assert text_hits[0]["id"] == id1
        assert "coroutine" in text_hits[0]["content"]

        # 2. Semantic Vector Search
        query_v = [1.0, 0.0, 0.0, 0.0]
        semantic_hits = store.search_semantic(query_v, namespace="dev_context", top_k=2)
        assert len(semantic_hits) >= 1
        assert semantic_hits[0]["id"] == id1
        assert semantic_hits[0]["similarity"] > 0.99

        # 3. Hybrid Search (RRF)
        hybrid_hits = store.search_hybrid("WAL", query_embedding=v3, namespace="dev_context")
        assert len(hybrid_hits) >= 1
        assert hybrid_hits[0]["id"] == id3

        # 4. Deletion
        assert store.delete_memory(id1) is True
        assert store.get_memory(id1) is None
    finally:
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
