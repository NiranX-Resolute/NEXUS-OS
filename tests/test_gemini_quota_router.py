"""Nexus OS v5.0 - Strict Zero-Mock Gemini Quota & Multi-Tier Cascade Test Suite.

MANDATORY INVARIANTS:
1. ZERO MOCKS: Strictly NO unittest.mock, MagicMock, patch, or dummy fixtures.
2. REAL QUOTA ENGINE: Verifies Google AI Studio catalog limits, mathematical infinity
   for Unlimited Live models, sliding-window RPM checks, and strict pre-flight ceilings.
3. REAL FAILOVER & AUTO-SHIFTING: Verifies that when a 5 RPM / 20 RPD model reaches its
   safe ceiling (4/5 RPM or 18/20 RPD), the engine refuses dispatch and automatically shifts
   to Tier-1 Unlimited or Tier-2 High-Capacity models, never sending requests over the limit.
4. REAL IPC ENDPOINT: Performs a live HTTP GET to /api/gemini/quotas on NexusIPCServer and
   verifies real JSON telemetry and active model cascade status.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import urllib.request
import pytest

from core.runtime.gemini_quota_manager import (
    GEMINI_MODELS_CATALOG,
    GeminiModelSpec,
    GeminiQuotaManager,
)
from core.runtime.llm_router import LLMRouter
from core.runtime.ipc_server import NexusIPCServer


TEST_QUOTA_IPC_PORT = 47642


def test_catalog_tiers_and_unlimited_models():
    """Verifies that all models from NiranX's Google AI Studio dashboard are cataloged with exact quotas."""
    # 1. Tier 1: Unlimited Live models
    unlimited_models = [
        "gemini-3.8-live",
        "gemini-3.8-live-extended-thinking",
        "gemini-3-flash-live",
        "gemini-2.5-flash-native-audio-dialog",
    ]
    for model_id in unlimited_models:
        assert model_id in GEMINI_MODELS_CATALOG, f"Missing Unlimited model: {model_id}"
        spec = GEMINI_MODELS_CATALOG[model_id]
        assert spec.tier == 1
        assert spec.rpm_limit == math.inf, f"{model_id} RPM should be Unlimited"
        assert spec.rpd_limit == math.inf, f"{model_id} RPD should be Unlimited"
        assert spec.category == "live"

    # 2. Tier 2: High-Capacity models
    high_capacity_models = {
        "gemini-3.5-flash-lite": (15.0, 500.0),
        "gemini-3.1-flash-lite": (15.0, 500.0),
        "gemma-4-31b": (30.0, 14_400.0),
        "gemma-4-26b": (30.0, 14_400.0),
        "gemini-decision-1": (200.0, 10_000.0),
        "antigravity": (80.0, 100.0),
    }
    for model_id, (expected_rpm, expected_rpd) in high_capacity_models.items():
        assert model_id in GEMINI_MODELS_CATALOG, f"Missing High-Capacity model: {model_id}"
        spec = GEMINI_MODELS_CATALOG[model_id]
        assert spec.tier == 2
        assert spec.rpm_limit == expected_rpm
        assert spec.rpd_limit == expected_rpd

    # 3. Tier 3: Restricted standard models (5 RPM / 20 RPD)
    restricted_models = [
        "gemini-3.8-flash",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gemini-4-hydrogen",
        "gemini-3.6-flash",
    ]
    for model_id in restricted_models:
        assert model_id in GEMINI_MODELS_CATALOG, f"Missing Restricted model: {model_id}"
        spec = GEMINI_MODELS_CATALOG[model_id]
        assert spec.tier == 3
        assert spec.rpm_limit == 5.0
        assert spec.rpd_limit == 20.0
        assert spec.rpm_safety_margin >= 1


def test_preflight_ceiling_trips_before_limit_and_auto_shifts():
    """Verifies that pre-flight check blocks requests when approaching limit and auto-shifts."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    # Initialize a schema table for telemetry logs in temp db
    conn = sqlite3.connect(str(db_path))
    conn.execute("""
    CREATE TABLE IF NOT EXISTS telemetry_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()
    conn.close()

    try:
        manager = GeminiQuotaManager(db_path=db_path)
        # Clear default cooldown on 3.6 for clean testing of standard 5 RPM model
        test_model = "gemini-3.8-flash"  # Limit: 5 RPM, safety ceiling: 4 RPM

        assert manager.can_dispatch(test_model) is True

        # Send 3 requests
        for _ in range(3):
            manager.record_request(test_model)

        status = manager.get_model_status(test_model)
        assert status["rpm_used"] == 3
        assert status["rpm_safe_ceiling"] == 4
        assert manager.can_dispatch(test_model) is True

        # 4th request reaches the safe ceiling (4/5)
        manager.record_request(test_model)
        status_after_4 = manager.get_model_status(test_model)
        assert status_after_4["rpm_used"] == 4
        # At 4/5, can_dispatch MUST trip to False to never send a 5th/6th request over limit!
        assert manager.can_dispatch(test_model) is False

        # When test_model is saturated, select_active_model() must automatically shift to Tier 1 or Tier 2
        active_model, reason = manager.select_active_model()
        assert active_model != test_model, "Engine must shift away from saturated model"
        # Must shift to an Unlimited Live model or high-capacity model
        assert active_model in [
            "gemini-3.8-live",
            "gemini-3.8-live-extended-thinking",
            "gemini-3-flash-live",
            "gemini-2.5-flash-native-audio-dialog",
            "gemini-3.5-flash-lite",
        ]
        assert "Selected" in reason
    finally:
        if db_path.exists():
            db_path.unlink()


def test_sliding_window_expiration():
    """Verifies that expired timestamps (older than 60s) drop out of the sliding window."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    try:
        manager = GeminiQuotaManager(db_path=db_path)
        test_model = "gemini-3-flash"

        now = time.time()
        # Simulate 4 requests placed 70 seconds ago
        with manager._lock:
            for _ in range(4):
                manager._rpm_windows[test_model].append(now - 70.0)

        # Before cleaning, raw deque has 4 items
        assert len(manager._rpm_windows[test_model]) == 4

        # Calling can_dispatch triggers _clean_window
        assert manager.can_dispatch(test_model) is True
        # Window must now be empty
        assert len(manager._rpm_windows[test_model]) == 0
    finally:
        if db_path.exists():
            db_path.unlink()


def test_http_429_cooldown_and_instant_cascade():
    """Verifies that an HTTP 429 triggers an immediate cooldown and failover cascade."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)

    conn = sqlite3.connect(str(db_path))
    conn.execute("""
    CREATE TABLE IF NOT EXISTS telemetry_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'INFO',
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()
    conn.close()

    try:
        manager = GeminiQuotaManager(db_path=db_path)
        target_model = "gemini-3.8-live"

        # Record a 429 rate limit hit
        manager.record_rate_limit(target_model, cooldown_sec=15.0)

        status = manager.get_model_status(target_model)
        assert status["in_cooldown"] is True
        assert status["available"] is False
        assert status["cooldown_remaining_sec"] > 0

        # Model must be blocked from dispatch
        assert manager.can_dispatch(target_model) is False

        # Cascade must route to the next available candidate (e.g. extended thinking or flash live)
        next_model, _ = manager.select_active_model()
        assert next_model != target_model

        # Verify real SQLite database row was written
        conn = sqlite3.connect(str(db_path))
        cur = conn.execute("SELECT * FROM telemetry_logs WHERE source = 'GEMINI_QUOTA';")
        rows = cur.fetchall()
        conn.close()
        assert len(rows) >= 1
        assert "RATE_LIMIT_HIT" in rows[0][3]
    finally:
        if db_path.exists():
            db_path.unlink()


def test_llm_router_quota_integration():
    """Verifies that LLMRouter uses GeminiQuotaManager to route dynamically to active tier models."""
    router = LLMRouter(gemini_api_key="fake-test-key-for-routing-evaluation")
    candidates = router.select_route(task_type="general")

    # Ensure gemini candidate is present
    gemini_candidates = [m for p, m in candidates if p == "gemini"]
    assert len(gemini_candidates) >= 1
    # Active Gemini model should be selected from the quota manager
    active_model = gemini_candidates[0]
    assert active_model in GEMINI_MODELS_CATALOG


def test_ipc_server_gemini_quotas_endpoint():
    """Starts a real NexusIPCServer and verifies the /api/gemini/quotas REST endpoint."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=TEST_QUOTA_IPC_PORT,
        db_path=temp_db,
        dry_run_hardware=True,
    )
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.3)

    try:
        url = f"http://127.0.0.1:{TEST_QUOTA_IPC_PORT}/api/gemini/quotas"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))

            assert data["success"] is True
            assert "active_model" in data
            assert data["catalog_count"] >= 15
            assert "models" in data

            # Verify presence of Unlimited live model
            live_model = data["models"].get("gemini-3.8-live")
            assert live_model is not None
            assert live_model["rpm_limit"] == "Unlimited"
            assert live_model["rpd_limit"] == "Unlimited"
            assert live_model["tier"] == 1

            # Verify presence of high-capacity model
            lite_model = data["models"].get("gemini-3.5-flash-lite")
            assert lite_model is not None
            assert lite_model["rpm_limit"] == 15
            assert lite_model["rpd_limit"] == 500
            assert lite_model["tier"] == 2
    finally:
        server.shutdown()
        server.server_close()
        if hasattr(server, "store") and hasattr(server.store, "close"):
            server.store.close()
        import gc
        gc.collect()
        time.sleep(0.1)
        if temp_db.exists():
            try:
                temp_db.unlink()
            except Exception:
                pass
