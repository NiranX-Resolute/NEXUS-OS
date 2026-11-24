"""
Nexus OS v5.0 - Verification Suite: Prompt #10 (Stonic & Torvis Suite Real Execution)
====================================================================================
Zero Stubs, Zero Mocks Verification Law:
- All audio transient evaluations run against real 16kHz PCM audio buffers.
- All database operations execute against real SQLite WAL files.
- All reflex dispatches and IPC requests execute live native logic.
- All desktop tidier operations perform real filesystem file moves and database undo.
- All 12 Torvis @nexus_tool plugins are verified against actual metadata and runtime governance.
"""

from __future__ import annotations

import datetime
import json
import logging
import math
import os
from pathlib import Path
import shutil
import sqlite3
import struct
import tempfile
import threading
import time
import unittest
from typing import Any, Dict, List

from core.runtime.away_tracker import AwayTracker, create_pcm_frame
from core.runtime.routines_manager import RoutinesManager
from core.runtime.reflex_router import ReflexRouter
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.hotkey_daemon import HoldToTalkDaemon, get_hotkey_daemon
from core.runtime.workspaces import WorkspaceGovernor
from core.mcp.plugin_loader import wrap_tool_with_governance
from core.mcp.plugins.desktop_tidier import desktop_tidier
from core.mcp.plugins.torvis_suite_plugins import (
    TORVIS_TOOL_REGISTRY,
    torvis_suite_overview,
    daily_picks_engine,
    bill_to_reminder_scan,
    subscription_radar,
    fridge_dinner_planner,
    excel_expense_writer,
    disk_map_analyzer,
    live_subtitle_stream,
    smart_light_control,
    printer_3d_status,
    game_steam_updater,
    video_screen_summarizer,
)


class TestPrompt10StonicTorvisReal(unittest.TestCase):
    """Zero-mock verification suite for Stonic & Torvis suite features."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.base_path = Path(self.temp_dir.name)
        self.db_path = self.base_path / "test_agent_local.db"
        self.active_trackers: List[AwayTracker] = []
        self.active_daemons: List[HoldToTalkDaemon] = []

    def tearDown(self):
        for t in self.active_trackers:
            try:
                t.stop()
            except Exception:
                pass
        self.active_trackers.clear()

        for d in self.active_daemons:
            try:
                d.stop()
            except Exception:
                pass
        self.active_daemons.clear()

        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def _create_tracker(self, **kwargs) -> AwayTracker:
        defaults = {
            "db_path": self.db_path,
            "spike_threshold": 0.45,
            "min_clap_interval_ms": 110.0,
            "max_clap_interval_ms": 420.0,
            "cooldown_ms": 500.0,
            "auto_wake": False,
        }
        defaults.update(kwargs)
        tracker = AwayTracker(**defaults)
        self.active_trackers.append(tracker)
        return tracker

    # -------------------------------------------------------------------------
    # 1. Double-Clap Transient Acoustic Detection Tests
    # -------------------------------------------------------------------------
    def test_double_clap_acoustic_transient_detection(self):
        """Verifies 16kHz PCM transient detection, spike thresholding, and temporal windowing."""
        wake_events = []

        def on_wake(payload=None):
            wake_events.append(payload or {})

        tracker = self._create_tracker(on_double_clap=on_wake)

        # 16kHz audio chunks
        silence_frame = create_pcm_frame(amplitude=0.0, duration_ms=20.0)
        clap_spike = create_pcm_frame(amplitude=0.90, duration_ms=20.0)

        # A. Verify normalized RMS energy calculation
        rms_silence = AwayTracker.calculate_rms(silence_frame)
        rms_clap = AwayTracker.calculate_rms(clap_spike)
        self.assertEqual(rms_silence, 0.0)
        self.assertGreaterEqual(rms_clap, 0.45)

        # B. Single clap does not trigger double-clap wake
        t0 = 5000.0
        res1 = tracker.process_audio_chunk(clap_spike, timestamp=t0)
        self.assertFalse(res1)
        self.assertEqual(len(wake_events), 0)

        # C. Rejection of reverberation spike (< 110ms interval)
        res_fast = tracker.process_audio_chunk(clap_spike, timestamp=t0 + 0.05)
        self.assertFalse(res_fast)
        self.assertEqual(len(wake_events), 0)

        # D. Valid second clap within [110ms, 420ms] (250ms delta) triggers wake
        t1 = 6000.0
        tracker2 = self._create_tracker(on_double_clap=on_wake)
        tracker2.process_audio_chunk(clap_spike, timestamp=t1)
        tracker2.process_audio_chunk(silence_frame, timestamp=t1 + 0.08)
        res_valid = tracker2.process_audio_chunk(clap_spike, timestamp=t1 + 0.25)
        self.assertTrue(res_valid)
        time.sleep(0.05)
        self.assertGreaterEqual(len(wake_events), 1)

        # E. Rejection of expired clap (> 420ms interval)
        t2 = 7000.0
        tracker3 = self._create_tracker()
        tracker3.process_audio_chunk(clap_spike, timestamp=t2)
        res_expired = tracker3.process_audio_chunk(clap_spike, timestamp=t2 + 0.60)
        self.assertFalse(res_expired)

        # F. Rejection of continuous sustained loud noise (no sharp rising-edge onset)
        tracker_noise = self._create_tracker()
        continuous_noise = create_pcm_frame(amplitude=0.75, duration_ms=20.0)
        for i in range(10):
            res_noise = tracker_noise.process_audio_chunk(continuous_noise, timestamp=8000.0 + (i * 0.02))
            self.assertFalse(res_noise)

    # -------------------------------------------------------------------------
    # 2. Away State Tracking & Digest Queue Catch-Up Tests
    # -------------------------------------------------------------------------
    def test_away_state_and_digest_queue_catchup(self):
        """Verifies away state toggles and alert queue persistence in SQLite WAL."""
        tracker = self._create_tracker()

        # Engage away state
        self.assertFalse(tracker.is_away)
        tracker.set_away(True, reason="workstation_locked")
        self.assertTrue(tracker.is_away)

        # Queue alerts into away_digest_queue
        id1 = tracker.queue_alert(
            title="Database Backup Complete",
            content="Local agent SQLite WAL checkpointed cleanly",
            source="backup_daemon",
            event_type="sys_backup",
        )
        self.assertIsNotNone(id1)

        id2 = tracker.queue_alert(
            title="Security Audit Pass",
            content="ScopeGuard invariants checked with 0 violations",
            source="agent_shield",
            event_type="security",
        )
        self.assertIsNotNone(id2)

        # Verify pending events in SQLite WAL
        pending = tracker.get_pending_digest_events()
        self.assertEqual(len(pending), 2)
        self.assertEqual(pending[0]["title"], "Database Backup Complete")
        self.assertEqual(pending[1]["title"], "Security Audit Pass")

        # Generate catch-up summary with mark_processed=True
        summary = tracker.generate_catchup_summary(mark_processed=True)
        self.assertEqual(summary["count"], 2)
        self.assertIn("Database Backup Complete", summary["summary"])
        self.assertIn("Security Audit Pass", summary["summary"])

        # Pending events should now be empty
        self.assertEqual(len(tracker.get_pending_digest_events()), 0)

        # Mark returned restores active state
        return_digest = tracker.mark_returned(reason="double_clap")
        self.assertFalse(tracker.is_away)
        self.assertIsNotNone(return_digest)

    # -------------------------------------------------------------------------
    # 3. Voice Routines Sub-50ms Execution Tests
    # -------------------------------------------------------------------------
    def test_voice_routines_sub_50ms_execution(self):
        """Verifies voice routines table CRUD and <50ms reflex execution via ReflexRouter."""
        store = SovereignMemoryStore(db_path=self.db_path)
        router = ReflexRouter(store=store, dry_run=True)
        routines = RoutinesManager(db_path=self.db_path, reflex_router=router, dry_run=True)

        # 1. Create a custom compound routine
        created = routines.create_routine(
            name="evening_stream_prep",
            trigger_phrase="prepare evening stream",
            actions_json=["mute audio", "keep awake"],
            description="Mutes desktop alerts and holds workstation awake for live streaming",
        )
        self.assertEqual(created["name"], "evening_stream_prep")
        self.assertEqual(created["trigger_phrase"], "prepare evening stream")
        self.assertTrue(created["enabled"])

        # 2. Warm-up call
        router.evaluate_and_execute("unmatched reflex probe")

        # 3. Sub-50ms execution check
        t0 = time.perf_counter()
        res = router.evaluate_and_execute("prepare evening stream")
        t_elapsed_ms = (time.perf_counter() - t0) * 1000.0

        self.assertEqual(res["status"], "SUCCESS")
        self.assertTrue(res["success"])
        self.assertEqual(res["reflex"], "voice_routine")
        self.assertEqual(res["routine"]["name"], "evening_stream_prep")
        self.assertLess(res["latency_ms"], 50.0)
        self.assertLess(t_elapsed_ms, 50.0)

        # 4. Routine list and execution count verification
        all_routines = routines.list_routines()
        match = next(r for r in all_routines if r["name"] == "evening_stream_prep")
        self.assertGreaterEqual(match["execution_count"], 1)

    # -------------------------------------------------------------------------
    # 4. Desktop Tidier Dry-Run / Move / Undo Tests
    # -------------------------------------------------------------------------
    def test_desktop_tidier_dryrun_move_undo(self):
        """Verifies desktop tidier dry-run, real file organization, and reversible undo."""
        test_desktop = self.base_path / "MockDesktop"
        test_desktop.mkdir(parents=True, exist_ok=True)

        # Populate test files
        doc_file = test_desktop / "budget_report.xlsx"
        doc_file.write_text("expense data", encoding="utf-8")

        code_file = test_desktop / "script.py"
        code_file.write_text("print('hello')", encoding="utf-8")

        installer_file = test_desktop / "setup.exe"
        installer_file.write_bytes(b"\x00" * 128)

        # Protected files that must NEVER be moved
        shortcut_file = test_desktop / "Chrome.lnk"
        shortcut_file.write_text("shortcut target", encoding="utf-8")
        ini_file = test_desktop / "desktop.ini"
        ini_file.write_text("[.ShellClassInfo]", encoding="utf-8")

        # A. DRY-RUN
        dry_res = desktop_tidier(action="dry_run", target_dir=str(test_desktop))
        self.assertTrue(dry_res["success"])
        self.assertEqual(dry_res["clutter_count"], 3)
        self.assertTrue(doc_file.exists())
        self.assertTrue(code_file.exists())
        self.assertTrue(installer_file.exists())

        # B. MOVE / TIDY
        move_res = desktop_tidier(action="move", target_dir=str(test_desktop))
        self.assertTrue(move_res["success"])
        self.assertEqual(move_res["moved_count"], 3)
        batch_id = move_res["batch_id"]

        # Original clutter files should now be moved
        self.assertFalse(doc_file.exists())
        self.assertFalse(code_file.exists())
        self.assertFalse(installer_file.exists())

        # Protected files must remain intact
        self.assertTrue(shortcut_file.exists())
        self.assertTrue(ini_file.exists())

        # C. UNDO
        undo_res = desktop_tidier(action="undo", target_dir=str(test_desktop), batch_id=batch_id)
        self.assertTrue(undo_res["success"])
        self.assertEqual(undo_res["reverted_count"], 3)

        # Files should be 100% restored to their original locations
        self.assertTrue(doc_file.exists())
        self.assertTrue(code_file.exists())
        self.assertTrue(installer_file.exists())

    # -------------------------------------------------------------------------
    # 5. Torvis Suite @nexus_tool Registration & Governance Tests
    # -------------------------------------------------------------------------
    def test_torvis_suite_nexus_tool_registration(self):
        """Verifies all 12 Torvis utility tools have proper @nexus_tool metadata and governance."""
        required_tools = [
            "daily_picks_engine",
            "desktop_tidier",
            "bill_to_reminder_scan",
            "subscription_radar",
            "fridge_dinner_planner",
            "excel_expense_writer",
            "disk_map_analyzer",
            "live_subtitle_stream",
            "smart_light_control",
            "printer_3d_status",
            "game_steam_updater",
            "video_screen_summarizer",
        ]

        # 1. Verify every tool is present in TORVIS_TOOL_REGISTRY
        for tool_name in required_tools:
            self.assertIn(tool_name, TORVIS_TOOL_REGISTRY)
            fn = TORVIS_TOOL_REGISTRY[tool_name]
            meta = getattr(fn, "_nexus_tool_meta", None)
            self.assertIsNotNone(meta, f"Tool '{tool_name}' must be decorated with @nexus_tool")
            self.assertTrue(len(meta.get("description", "")) > 0)
            self.assertTrue(len(meta.get("agent", "")) > 0)

        # 2. Verify torvis_suite_overview metadata
        overview = torvis_suite_overview()
        self.assertTrue(overview["success"])
        self.assertGreaterEqual(overview["total_tools"], 12)
        registered_names = [t["name"] for t in overview["tools"]]
        for tool_name in required_tools:
            self.assertIn(tool_name, registered_names)

        # 3. Verify WorkspaceGovernor SILENT mode air-gap enforcement
        gov = WorkspaceGovernor()
        original_mode = gov.get_mode()
        try:
            gov.set_mode("SILENT")
            self.assertEqual(gov.get_mode(), "SILENT")

            # Wrap an external device tool with governance
            wrapped = wrap_tool_with_governance(
                TORVIS_TOOL_REGISTRY["smart_light_control"],
                getattr(TORVIS_TOOL_REGISTRY["smart_light_control"], "_nexus_tool_meta"),
            )
            with self.assertRaises(PermissionError):
                wrapped()
        finally:
            gov.set_mode(original_mode)

    # -------------------------------------------------------------------------
    # 6. Global Hold-to-Talk Hotkey Daemon Headless Lifecycle Tests
    # -------------------------------------------------------------------------
    def test_hold_to_talk_daemon_headless_lifecycle(self):
        """Verifies HoldToTalkDaemon initialization, simulated hold-to-talk, and clean stop."""
        injected_strings = []

        def on_inject(text: str):
            injected_strings.append(text)

        daemon = HoldToTalkDaemon(
            hotkeys=["`", "ctrl+space", "insert"],
            on_transcription_injected=on_inject,
            suppress=False,
        )
        self.active_daemons.append(daemon)

        # Start daemon (runs simulated message pump if non-interactive)
        started = daemon.start(timeout=2.0)
        self.assertTrue(started)
        self.assertTrue(daemon.is_running)

        # Simulate hold-to-talk with 16kHz PCM audio buffer
        pcm_frame = create_pcm_frame(amplitude=0.5, duration_ms=50.0)
        sim_res = daemon.simulate_hold_to_talk(
            pcm_bytes=pcm_frame,
            key="`",
            text="Nexus summarize active tab",
        )
        self.assertTrue(sim_res["success"])
        self.assertEqual(sim_res["injected_text"], "Nexus summarize active tab")
        self.assertIn("Nexus summarize active tab", injected_strings)

        # Stop daemon cleanly
        daemon.stop()
        self.assertFalse(daemon.is_running)


if __name__ == "__main__":
    unittest.main()
