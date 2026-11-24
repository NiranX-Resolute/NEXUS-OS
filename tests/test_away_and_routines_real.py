"""
Real Integration and Unit Test Suite for Nexus OS v5.0
Double-Clap Wake, Away Catch-Up, and Voice Routines Engine.

Zero Stubs, Zero Mocks Law:
- All audio transient evaluations run against real 16kHz PCM audio buffers.
- All database operations execute against real SQLite WAL files.
- All reflex dispatches and IPC requests execute live native logic.
"""

from __future__ import annotations

import datetime
import json
import logging
import math
from pathlib import Path
import sqlite3
import struct
import tempfile
import threading
import time
import urllib.request
import urllib.parse
import unittest
from typing import List

from core.runtime.away_tracker import AwayTracker, create_pcm_frame
from core.runtime.routines_manager import RoutinesManager
from core.runtime.reflex_router import ReflexRouter
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.ipc_server import NexusIPCServer


class TestAwayAndRoutinesReal(unittest.TestCase):
    """Real verification suite for double-clap wake, away tracking, and voice routines."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self.temp_dir.name) / "agent_test_real.db"
        self.active_trackers: List[AwayTracker] = []

    def tearDown(self):
        for tracker in self.active_trackers:
            try:
                tracker.stop()
            except Exception as exc:
                logging.debug("Tracker stop notice: %s", exc)
        self.active_trackers.clear()
        self.temp_dir.cleanup()

    def _create_tracker(self, **kwargs) -> AwayTracker:
        """Helper to create and track AwayTracker instances for deterministic teardown."""
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

    def test_double_clap_transient_detection_and_temporal_window(self):
        """Verifies dual transient energy spike detection spaced 110ms-420ms apart."""
        callback_events = []

        def on_wake(payload=None):
            callback_events.append(payload or {})

        tracker = self._create_tracker(on_double_clap=on_wake)

        silence = create_pcm_frame(amplitude=0.0, duration_ms=20.0)
        clap_spike = create_pcm_frame(amplitude=0.85, duration_ms=20.0)

        # 1. Single clap does not trigger double-clap wake
        t0 = 1000.0
        det1 = tracker.process_audio_chunk(clap_spike, timestamp=t0)
        self.assertFalse(det1)
        self.assertGreaterEqual(AwayTracker.calculate_rms(clap_spike), 0.45)
        self.assertEqual(len(callback_events), 0)

        # 2. Spacing too short (< 110ms) rejected as reverberation
        det_too_fast = tracker.process_audio_chunk(clap_spike, timestamp=t0 + 0.04)
        self.assertFalse(det_too_fast)
        self.assertEqual(len(callback_events), 0)

        # 3. Valid double clap within 110ms - 420ms window triggers wake (220ms interval)
        t1 = 2000.0
        tracker_valid = self._create_tracker(on_double_clap=on_wake)
        det_first = tracker_valid.process_audio_chunk(clap_spike, timestamp=t1)
        self.assertFalse(det_first)
        tracker_valid.process_audio_chunk(silence, timestamp=t1 + 0.05)
        det_second = tracker_valid.process_audio_chunk(clap_spike, timestamp=t1 + 0.22)
        self.assertTrue(det_second)
        time.sleep(0.05)
        self.assertEqual(len(callback_events), 1)

        # 4. Spacing too long (> 420ms) rejected as separate transient
        t2 = 3000.0
        tracker_long = self._create_tracker()
        tracker_long.process_audio_chunk(clap_spike, timestamp=t2)
        det_late = tracker_long.process_audio_chunk(clap_spike, timestamp=t2 + 0.55)
        self.assertFalse(det_late)

        # 5. Continuous elevated noise rejection (no transient onset edge)
        tracker_noise = self._create_tracker()
        continuous_noise = create_pcm_frame(amplitude=0.6, duration_ms=20.0)
        for i in range(8):
            res_noise = tracker_noise.process_audio_chunk(continuous_noise, timestamp=4000.0 + (i * 0.02))
            self.assertFalse(res_noise)

    def test_away_state_tracking_and_digest_queue_persistence(self):
        """Verifies away state toggles and alert queue persistence in SQLite WAL."""
        tracker = self._create_tracker()

        # Initial state: active
        status = tracker.get_status()
        self.assertFalse(status["is_away"])
        self.assertEqual(status["pending_digest_count"], 0)

        # Engage away state
        away_state = tracker.set_away(True, reason="workstation_locked")
        self.assertTrue(away_state)
        self.assertTrue(tracker.is_away)

        # Queue alerts while away
        alert1_id = tracker.queue_alert(
            title="PR #108 Approved",
            content="Architecture review passed with zero findings",
            source="github",
            event_type="git_pr",
        )
        self.assertIsNotNone(alert1_id)

        alert2_id = tracker.queue_alert(
            title="Nexus Desktop v5.0 Built",
            content="All Electron and PySide6 assets compiled successfully",
            source="pipeline",
            event_type="build",
        )
        self.assertIsNotNone(alert2_id)

        alert3_id = tracker.queue_alert(
            title="High Memory Consumption Alert",
            content="Renderer PID 4120 reached 85% RAM threshold",
            source="telemetry",
            event_type="system_metric",
        )
        self.assertIsNotNone(alert3_id)

        # Verify pending count in status
        status_away = tracker.get_status()
        self.assertTrue(status_away["is_away"])
        self.assertEqual(status_away["pending_digest_count"], 3)

        # Verify SQLite WAL table directly
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.cursor()
            rows = cursor.execute("SELECT * FROM away_digest_queue ORDER BY timestamp ASC;").fetchall()
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0]["event_type"], "git_pr")
            self.assertEqual(rows[0]["title"], "PR #108 Approved")
            self.assertEqual(rows[0]["processed"], 0)
            self.assertEqual(rows[1]["event_type"], "build")
            self.assertEqual(rows[2]["event_type"], "system_metric")
        finally:
            conn.close()

    def test_catchup_summary_generation_and_marking_processed(self):
        """Verifies generating catch-up summary on wake and marking digested items processed."""
        tracker = self._create_tracker()
        tracker.set_away(True, reason="lunch_break")

        tracker.queue_alert(title="Urgent Message", content="Client server maintenance scheduled", source="telegram", event_type="message")
        tracker.queue_alert(title="Port Scan Detected", content="IP 192.168.1.55 attempted SMB access", source="sentinel", event_type="security")

        pending = tracker.get_pending_digest_events()
        self.assertEqual(len(pending), 2)

        # Generate catch-up summary
        summary = tracker.generate_catchup_summary(mark_processed=True)
        self.assertEqual(summary["count"], 2)
        self.assertIn("Client server maintenance scheduled", summary["summary"])
        self.assertIn("Port Scan Detected", summary["summary"])

        # Subsequent check verifies queue is marked processed
        pending_after = tracker.get_pending_digest_events()
        self.assertEqual(len(pending_after), 0)

        # Marking returned restores active state
        return_summary = tracker.mark_returned(reason="double_clap")
        self.assertFalse(tracker.is_away)
        self.assertIsNotNone(return_summary)

    def test_voice_routines_sqlite_wal_crud(self):
        """Verifies creating, listing, updating, deleting voice routines in SQLite WAL."""
        routines = RoutinesManager(db_path=self.db_path, dry_run=True)

        # Verify canonical table schema exists with name TEXT PRIMARY KEY
        conn = sqlite3.connect(str(self.db_path))
        try:
            cols = {r[1]: r[2] for r in conn.execute("PRAGMA table_info(voice_routines);").fetchall()}
            self.assertIn("name", cols)
            self.assertIn("trigger_phrase", cols)
            self.assertIn("actions_json", cols)
            self.assertIn("created_at", cols)
        finally:
            conn.close()

        # 1. Create Routine
        created = routines.create_routine(
            name="deep_work_focus",
            trigger_phrase="engage deep work",
            actions_json=["mute audio", "keep awake"],
            description="Silences notifications and locks PC display keep-awake",
        )
        self.assertEqual(created["name"], "deep_work_focus")
        self.assertEqual(created["trigger_phrase"], "engage deep work")
        self.assertEqual(json.loads(created["actions_json"]), ["mute audio", "keep awake"])
        self.assertTrue(created["enabled"])

        # 2. Retrieve Routine by name and by trigger_phrase
        by_name = routines.get_routine("deep_work_focus")
        self.assertIsNotNone(by_name)
        self.assertEqual(by_name["name"], "deep_work_focus")

        by_phrase = routines.get_routine("engage deep work")
        self.assertIsNotNone(by_phrase)
        self.assertEqual(by_phrase["name"], "deep_work_focus")

        # 3. List Routines
        all_routines = routines.list_routines()
        names = [r["name"] for r in all_routines]
        self.assertIn("deep_work_focus", names)

        # 4. Direct Execution
        exec_res = routines.execute_routine("deep_work_focus")
        self.assertTrue(exec_res["success"])
        self.assertEqual(len(exec_res["results"]), 2)
        for r in exec_res["results"]:
            self.assertTrue(r["success"])

        # Execution counter incremented
        updated = routines.get_routine("deep_work_focus")
        self.assertEqual(updated["execution_count"], 1)

        # 5. Delete Routine
        deleted = routines.delete_routine("deep_work_focus")
        self.assertTrue(deleted)
        self.assertIsNone(routines.get_routine("deep_work_focus"))

    def test_sub_50ms_reflex_router_voice_routine_execution(self):
        """Verifies sub-50ms deterministic voice routine match and execution via ReflexRouter."""
        store = SovereignMemoryStore(db_path=self.db_path)
        router = ReflexRouter(store=store, dry_run=True)
        routines = RoutinesManager(db_path=self.db_path, reflex_router=router, dry_run=True)

        routines.create_routine(
            name="podcast_prep",
            trigger_phrase="prepare podcast recording",
            actions_json=["mute audio", "keep awake"],
            description="Mutes audio feedback and engages keep-awake lock",
        )

        # Warm up reflex router
        router.evaluate_and_execute("unmatched warm-up check")

        res = router.evaluate_and_execute("prepare podcast recording")

        self.assertEqual(res["status"], "SUCCESS")
        self.assertTrue(res["success"])
        self.assertEqual(res["reflex"], "voice_routine")
        self.assertEqual(res["routine"]["name"], "podcast_prep")
        self.assertLess(res["latency_ms"], 50.0)

        # Verify dispatch module-level shortcut
        dispatch_res = router.dispatch("prepare podcast recording")
        self.assertEqual(dispatch_res, "REFLEX EXECUTED DIRECTLY")

    def test_ipc_server_away_and_routines_endpoints(self):
        """Verifies live HTTP endpoints for away tracking and routines on local IPC port."""
        port = 47651  # Dedicated test port to avoid conflict
        token = "test_bearer_token_secret_hex"
        server = NexusIPCServer(
            host="127.0.0.1",
            port=port,
            db_path=self.db_path,
            dry_run_hardware=True,
            token=token,
        )

        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        time.sleep(0.3)  # Allow socket to bind

        base_url = f"http://127.0.0.1:{port}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            # 1. POST /api/routines (Create routine)
            create_payload = json.dumps({
                "name": "ipc_night_mode",
                "trigger_phrase": "engage night mode",
                "actions_json": ["adjust brightness 30", "mute audio"],
                "description": "Dim display and silence audio for night work",
            }).encode("utf-8")

            req = urllib.request.Request(f"{base_url}/api/routines", data=create_payload, headers=headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 201)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["success"])
                self.assertEqual(body["routine"]["name"], "ipc_night_mode")

            # 2. GET /api/routines (List routines)
            req = urllib.request.Request(f"{base_url}/api/routines", headers=headers, method="GET")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["success"])
                routine_names = [r["name"] for r in body["routines"]]
                self.assertIn("ipc_night_mode", routine_names)

            # 3. POST /api/away/toggle (Engage away)
            toggle_payload = json.dumps({"away": True, "reason": "ipc_test"}).encode("utf-8")
            req = urllib.request.Request(f"{base_url}/api/away/toggle", data=toggle_payload, headers=headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["success"])
                self.assertTrue(body["is_away"])

            # 4. POST /api/away/queue (Queue notification while away)
            queue_payload = json.dumps({
                "event_type": "security_alert",
                "source": "firewall",
                "title": "Blocked Connection",
                "content": "Inbound probe on port 8080 dropped",
            }).encode("utf-8")
            req = urllib.request.Request(f"{base_url}/api/away/queue", data=queue_payload, headers=headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 201)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["queued"])

            # 5. GET /api/away/digest (Check pending events)
            req = urllib.request.Request(f"{base_url}/api/away/digest", headers=headers, method="GET")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["success"])
                self.assertGreaterEqual(body["count"], 1)

            # 6. POST /api/away/catchup (Generate catch-up summary)
            catchup_payload = json.dumps({"mark_processed": True}).encode("utf-8")
            req = urllib.request.Request(f"{base_url}/api/away/catchup", data=catchup_payload, headers=headers, method="POST")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertIn("Blocked Connection", body["summary"])

            # 7. DELETE /api/routines/ipc_night_mode (Delete routine)
            req = urllib.request.Request(f"{base_url}/api/routines/ipc_night_mode", headers=headers, method="DELETE")
            with urllib.request.urlopen(req) as resp:
                self.assertEqual(resp.status, 200)
                body = json.loads(resp.read().decode("utf-8"))
                self.assertTrue(body["success"])

        finally:
            if hasattr(server, "away_tracker"):
                try:
                    server.away_tracker.stop()
                except Exception as s_exc:
                    logging.debug("Server away tracker stop notice: %s", s_exc)
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
