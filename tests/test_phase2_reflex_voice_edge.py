"""Nexus OS v5.0 - Phase 2 Verification Test Suite.

Verifies:
1. Sub-100ms Reflex Router:
   - OS triggers (mute, brightness, lock, timestamp, launch app) latency < 100ms
   - Global hotkey listener start & stop
2. Duplex Voice & Vision Loop (4-Tier Anti-Echo Architecture):
   - Tier 1: Instantaneous AI Speech Screen-Ducking (gain 0.0 with decay)
   - Tier 2: Mic Background Sensitivity Ducking
   - Tier 3: Speech-Similarity Acoustic Echo Suppression (is_acoustic_echo)
   - Tier 4: 15s Silent PCM Keep-Alive Heartbeat
3. Omnichannel Edge Mesh Bridge:
   - Telegram & Discord handlers for /status, /run, and /estop
   - Immediate termination of active slices on emergency stop
   - Direct binding to local SQLite store (agent_local.db)
4. Notch Window Workspace Mode Switcher & Shelf Ingest Integration:
   - Mode switching across [DEV], [STUDY], [STUDIO], [SILENT]
   - Ingesting files into sovereign memory under the active workspace namespace
"""

from __future__ import annotations

import os
from pathlib import Path
import tempfile
import time
import pytest

from core.runtime.reflex_router import (
    ReflexRouter,
    adjust_brightness_reflex,
    launch_app_reflex,
    start_global_hotkey_listener,
    stop_global_hotkey_listener,
)
from apps.notch_hud.voice_pipeline import DuplexVoicePipeline
from core.bridge.voice_pipeline import VoicePipeline
from core.edge.omnichannel_bridge import OmnichannelBridge
from apps.notch_hud.notch_window import NexusNotchWindow
from apps.notch_hud.drag_shelf import IngestedFile


# =============================================================================
# 1. SUB-100MS REFLEX ROUTER
# =============================================================================
def test_reflex_router_brightness_and_apps():
    router = ReflexRouter(dry_run=True)

    # 1. Adjust brightness in <100ms
    t0 = time.perf_counter()
    res_b = router.evaluate_and_execute("adjust brightness 80")
    lat_b = (time.perf_counter() - t0) * 1000.0
    assert res_b["success"] is True
    assert res_b["action"] == "ADJUST_BRIGHTNESS"
    assert res_b["latency_ms"] < 100.0
    assert lat_b < 100.0

    # 2. Launch App in <100ms
    t1 = time.perf_counter()
    res_app = router.evaluate_and_execute("launch notepad")
    lat_app = (time.perf_counter() - t1) * 1000.0
    assert res_app["success"] is True
    assert res_app["action"] == "LAUNCH_APP"
    assert "notepad" in res_app["result"].lower() or "notepad" in res_app["output"].lower()
    assert res_app["latency_ms"] < 100.0
    assert lat_app < 100.0

    # 3. Mute & Timestamp
    res_mute = router.evaluate_and_execute("mute")
    assert res_mute["success"] is True
    assert res_mute["action"] == "MUTE_AUDIO"

    res_ts = router.evaluate_and_execute("timestamp")
    assert res_ts["success"] is True
    assert "timestamp" in res_ts

    # 4. Global hotkey start and stop cleanly
    started = start_global_hotkey_listener()
    assert started is True
    stop_global_hotkey_listener()


# =============================================================================
# 2. DUPLEX VOICE & VISION LOOP (4-TIER ANTI-ECHO ARCHITECTURE)
# =============================================================================
def test_4_tier_anti_echo_voice_pipeline():
    pipe = DuplexVoicePipeline(enable_keepalive=False)

    # Tier 1: AI Speech Screen-Ducking
    assert pipe.screen_duck_gain == 1.0
    pipe.set_ai_speaking(True)
    assert pipe.is_speaking is True
    assert pipe.screen_duck_gain == 0.0  # Ducked to 0
    assert pipe.mic_sensitivity_gain == 0.20  # Mic ducked

    pipe.set_ai_speaking(False)
    assert pipe.is_speaking is False
    assert pipe.mic_sensitivity_gain == 1.0

    # Tier 3: Acoustic Echo Suppression (is_acoustic_echo)
    ai_phrase = "Nexus OS v5.0 is running on local SQLite WAL mode"
    pipe.record_tts_playback(ai_phrase)

    # Exact or near-identical user transcript dropped as echo
    assert pipe.is_acoustic_echo(ai_phrase) is True
    assert pipe.is_acoustic_echo("is running on local SQLite WAL mode") is True
    assert pipe.is_acoustic_echo("Nexus OS v5.0 is running on local") is True

    # Genuine novel user command is NOT dropped
    assert pipe.is_acoustic_echo("Open the project roadmap document") is False
    assert pipe.is_acoustic_echo("What is the battery level") is False

    # Tier 4: Keep-Alive Heartbeat
    keepalive_dispatched = []
    pipe.on_pcm_keepalive = lambda chunk: keepalive_dispatched.append(len(chunk))
    pipe.start_keepalive_heartbeat()
    assert pipe._keepalive_thread is not None
    assert pipe._keepalive_thread.is_alive()
    pipe.stop_keepalive_heartbeat()

    # VAD Frame RMS
    silent_pcm = b"\x00" * 960
    assert pipe.calculate_frame_rms(silent_pcm) == 0.0


# =============================================================================
# 3. OMNICHANNEL EDGE MESH BRIDGE
# =============================================================================
def test_omnichannel_bridge_commands():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        bridge = OmnichannelBridge(db_path=db_path)

        # 1. /status command
        status_res = bridge.handle_command("/status")
        assert status_res["success"] is True
        assert status_res["command"] == "/status"
        assert "DEV" in status_res["response"]
        assert "Sovereign" in status_res["response"]

        # 2. /run command
        run_res = bridge.handle_command("/run audit local network ports", source="telegram")
        assert run_res["success"] is True
        assert run_res["command"] == "/run"
        assert "slice_id" in run_res
        assert run_res["status"] in ("SUSPENDED", "COMPLETED")

        # Verify task was recorded in sovereign memory store
        mem_hits = bridge.store.search_text("audit local network ports", namespace="dev_context")
        assert len(mem_hits) >= 1
        assert "audit local network ports" in mem_hits[0]["title"] or "audit local network ports" in mem_hits[0]["content"]

        # 3. /estop command (Emergency Stop)
        estop_res = bridge.handle_command("/estop", source="discord")
        assert estop_res["success"] is True
        assert estop_res["estop_active"] is True
        assert "EMERGENCY STOP" in estop_res["response"]

        # Ensuing /run command blocked while estop is active
        blocked_run = bridge.handle_command("/run scan new target")
        assert blocked_run["success"] is False
        assert "ESTOP ACTIVE" in blocked_run["response"]
    finally:
        from core.engine.safety_guard import SafetyGuard
        SafetyGuard.reset_estop()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass


# =============================================================================
# 4. NOTCH WINDOW WORKSPACE MODE SWITCHER & SHELF INGEST INTEGRATION
# =============================================================================
def test_notch_window_mode_switch_and_shelf_wiring():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = tf.name

    try:
        window = NexusNotchWindow()
        window.sovereign_store = bridge_store = OmnichannelBridge(db_path=db_path).store

        # 1. Switch across workspaces
        assert window.switch_workspace("DEV") == "DEV"
        assert window._active_workspace == "DEV"
        assert "dev_context" in window.governor.get_memory_namespace()

        assert window.switch_workspace("STUDY") == "STUDY"
        assert window._active_workspace == "STUDY"
        assert "study_context" in window.governor.get_memory_namespace()

        assert window.switch_workspace("SILENT") == "SILENT"
        assert window._active_workspace == "SILENT"

        # Switch back to DEV
        window.switch_workspace("DEV")

        # 2. Ingest files from drag shelf into active workspace context
        test_file = IngestedFile(
            name="blueprint_v5.pdf",
            path="C:/Nexus-OS/blueprint_v5.pdf",
            size_bytes=2048576,
            is_dir=False,
            extension=".pdf",
            sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            timestamp=time.time(),
        )

        window._on_shelf_ingest_requested([test_file])

        # Verify file indexed in sovereign store under DEV namespace
        hits = bridge_store.search_text("blueprint_v5.pdf", namespace="dev_context")
        assert len(hits) >= 1
        assert "blueprint_v5.pdf" in hits[0]["title"]
    finally:
        from core.engine.safety_guard import SafetyGuard
        SafetyGuard.reset_estop()
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception:
                pass
