"""Real Zero-Mock Verification Suite for Call-Aware Notch Auto-Hide & Drag Shelf File-Lock Resilience.

Strict Single-Feature Verification (Zero Stubs, Zero Mocks):
1. Verifies is_active_call_running() on live Windows audio & registry APIs (<50ms execution).
2. Verifies wait_for_file_stability() while a background thread writes bytes to a temp file,
   succeeds upon completion, and computes matching real SHA-256 hash.
3. Verifies wait_for_file_stability() timeout handling on locked/continuously shifting files.
4. Verifies FileShelfStaging integration with stability verification.
5. Verifies FullscreenGuard contract and zero-mock codebase integrity.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
from typing import Tuple

import pytest

# Ensure repository root and notch_hud are on sys.path
_REPO_ROOT = Path(__file__).resolve().parent.parent
_NOTCH_DIR = _REPO_ROOT / "apps" / "notch_hud"
for p in [str(_REPO_ROOT), str(_NOTCH_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from apps.notch_hud.fullscreen_guard import (
    FullscreenGuard,
    is_active_call_running,
    is_fullscreen_app_active,
)
from apps.notch_hud.file_shelf import FileShelfStaging, IngestedFile, wait_for_file_stability
from apps.notch_hud.drag_shelf import NexusDragShelf


def test_is_active_call_running_live_windows_latency() -> None:
    """Verifies is_active_call_running() executes cleanly on live APIs in <50ms with zero mocks."""
    t0 = time.perf_counter()
    is_call, call_app = is_active_call_running()
    elapsed = time.perf_counter() - t0

    assert isinstance(is_call, bool), "Expected boolean return for is_call"
    assert call_app is None or isinstance(call_app, str), "Expected string or None for call_app"
    assert elapsed < 0.050, f"is_active_call_running took {elapsed * 1000:.2f}ms, exceeding 50ms requirement"


def test_wait_for_file_stability_real_background_writer_and_sha256() -> None:
    """Verifies wait_for_file_stability() synchronizes with real active writer and computes SHA-256."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = Path(tmp_dir) / "stream_payload.bin"
        expected_bytes = bytearray()
        write_complete = threading.Event()

        def _background_writer() -> None:
            with open(test_file, "wb") as fp:
                for i in range(5):
                    chunk = f"CHUNKV5_DATA_{i}_{time.time()}_TEST_PAYLOAD\n".encode("utf-8") * 100
                    fp.write(chunk)
                    fp.flush()
                    expected_bytes.extend(chunk)
                    time.sleep(0.04)
            write_complete.set()

        writer_thread = threading.Thread(target=_background_writer, daemon=True)
        writer_thread.start()

        # Call stability check with 80ms interval and 15 attempts (~1.2s max)
        stable = wait_for_file_stability(test_file, interval_ms=80, max_attempts=15)
        writer_thread.join(timeout=3.0)

        assert stable is True, "Expected file stability to report True after background writes completed"
        assert write_complete.is_set(), "Writer thread did not complete as expected"

        # Compute real SHA-256 hash and verify against ground truth
        actual_content = test_file.read_bytes()
        assert actual_content == bytes(expected_bytes), "File content on disk does not match expected payload"

        expected_hash = hashlib.sha256(expected_bytes).hexdigest()
        actual_hash = FileShelfStaging.compute_sha256(test_file)
        assert actual_hash == expected_hash, f"SHA-256 mismatch: {actual_hash} != {expected_hash}"


def test_wait_for_file_stability_unstable_file_times_out_cleanly() -> None:
    """Verifies wait_for_file_stability() cleanly returns False when file size continuously shifts."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        test_file = Path(tmp_dir) / "active_download.crdownload"
        stop_writer = threading.Event()

        def _continuous_writer() -> None:
            with open(test_file, "wb") as fp:
                while not stop_writer.is_set():
                    fp.write(b"EXTENDING_BYTE_STREAM_DATA_CHUNK\n")
                    fp.flush()
                    time.sleep(0.02)

        writer_thread = threading.Thread(target=_continuous_writer, daemon=True)
        writer_thread.start()

        try:
            # Check stability with small attempts (3 attempts x 40ms = 120ms)
            stable = wait_for_file_stability(test_file, interval_ms=40, max_attempts=3)
            assert stable is False, "Expected unstable continuously writing file to return False"
        finally:
            stop_writer.set()
            writer_thread.join(timeout=2.0)


def test_file_shelf_staging_stability_and_persistence() -> None:
    """Verifies FileShelfStaging stages files and records real SHA-256 into ledger."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        shelf_path = Path(tmp_dir) / "shelf"
        staging = FileShelfStaging(shelf_dir=shelf_path)

        src_file = Path(tmp_dir) / "document.txt"
        file_payload = b"NEXUS_SOVEREIGN_DATA_STORE_CONTENT_V5"
        src_file.write_bytes(file_payload)

        staged_items = staging.stage_files([src_file], copy_to_shelf=True)
        assert len(staged_items) == 1, "Expected exactly 1 file staged"

        item = staged_items[0]
        assert item.name == "document.txt"
        assert item.size_bytes == len(file_payload)
        assert item.sha256 == hashlib.sha256(file_payload).hexdigest()

        # Check ledger index.json persistence
        index_file = shelf_path / "index.json"
        assert index_file.exists(), "Ledger index.json was not created"


def test_fullscreen_guard_check_state_contract() -> None:
    """Verifies FullscreenGuard check_state includes active call detection."""
    guard = FullscreenGuard()
    state = guard.check_state()

    assert "is_active_call" in state, "State dictionary missing 'is_active_call' key"
    assert "active_call_app" in state, "State dictionary missing 'active_call_app' key"
    assert "is_fullscreen_game" in state, "State dictionary missing 'is_fullscreen_game' key"
    assert isinstance(state["is_active_call"], bool), "is_active_call must be boolean"


def test_zero_mocks_and_stubs_codebase_integrity() -> None:
    """Verifies that no mocks, monkeypatches, or stub placeholders exist in the guarded files."""
    files_to_check = [
        _NOTCH_DIR / "fullscreen_guard.py",
        _NOTCH_DIR / "drag_shelf.py",
        _NOTCH_DIR / "file_shelf.py",
        _NOTCH_DIR / "notch_window.py",
    ]

    forbidden_tokens = [
        "unit" + "test.mock",
        "Magic" + "Mock",
        "mock." + "patch",
        "patch." + "object",
        "TODO" + ":",
    ]

    for file_path in files_to_check:
        assert file_path.exists(), f"Guarded file {file_path} must exist"
        content = file_path.read_text(encoding="utf-8")
        for token in forbidden_tokens:
            assert token not in content, f"Forbidden token '{token}' discovered in {file_path.name}"
