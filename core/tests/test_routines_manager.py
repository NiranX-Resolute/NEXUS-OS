"""
Unit and Integration Test Suite for Nexus OS v5.0 RoutinesManager.
Tests SQLite-backed persistence, compound action sequence parsing,
deterministic reflex dispatch, and life-cycle operations.
"""

from pathlib import Path
import tempfile
import threading
import time
import unittest

from core.runtime.routines_manager import RoutinesManager, tidy_desktop_reflex


class TestRoutinesManager(unittest.TestCase):
    """Test suite for RoutinesManager core methods and SQLite WAL persistence."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self.temp_dir.name) / "test_agent_local.db"
        self.manager = RoutinesManager(db_path=self.db_path, dry_run=True)

    def tearDown(self):
        import gc
        if hasattr(self, "manager"):
            del self.manager
        gc.collect()
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_init_and_default_seeding(self):
        """Verifies database initialization and default routine seeding."""
        routines = self.manager.list_routines()
        self.assertGreaterEqual(len(routines), 4)

        triggers = [r["trigger_phrase"].lower() for r in routines]
        self.assertIn("start dev mode", triggers)
        self.assertIn("focus mode", triggers)
        self.assertIn("tidy workstation", triggers)
        self.assertIn("end of day", triggers)

    def test_register_routine(self):
        """Verifies registering a new voice routine with validation."""
        routine = self.manager.register_routine(
            trigger_phrase="Deploy Production",
            action_sequence="mute audio; lock workstation",
            enabled=True,
            description="Mutes audio and locks terminal on deployment",
        )
        self.assertIsNotNone(routine["id"])
        self.assertEqual(routine["trigger_phrase"], "Deploy Production")
        self.assertEqual(routine["action_sequence"], "mute audio; lock workstation")
        self.assertTrue(routine["enabled"])
        self.assertEqual(routine["execution_count"], 0)

        # Retrieve and verify persistence
        fetched = self.manager.get_routine(routine["id"])
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["trigger_phrase"], "Deploy Production")

        # Conflict update test
        updated = self.manager.register_routine(
            trigger_phrase="Deploy Production",
            action_sequence="adjust brightness 80; mute audio",
        )
        self.assertEqual(updated["id"], routine["id"])
        self.assertEqual(updated["action_sequence"], "adjust brightness 80; mute audio")

    def test_register_routine_validation(self):
        """Verifies input validation on routine registration."""
        with self.assertRaises(ValueError):
            self.manager.register_routine("", "mute audio")

        with self.assertRaises(ValueError):
            self.manager.register_routine("Valid Phrase", "")

    def test_evaluate_exact_and_variations(self):
        """Verifies evaluate(phrase) -> bool for exact matches and voice wake prefixes."""
        self.manager.register_routine("Start Cyber Deck", "mute audio; keep awake")

        # 1. Exact match
        self.assertTrue(self.manager.evaluate("Start Cyber Deck"))
        self.assertTrue(self.manager.evaluate("start cyber deck"))

        # 2. Wake-word prefixes
        self.assertTrue(self.manager.evaluate("Hey Nexus, start cyber deck"))
        self.assertTrue(self.manager.evaluate("nexus: start cyber deck"))
        self.assertTrue(self.manager.evaluate("ok nexus start cyber deck"))

        # 3. Punctuation variance
        self.assertTrue(self.manager.evaluate("start cyber deck!"))
        self.assertTrue(self.manager.evaluate("start cyber deck."))

        # 4. Non-matching query
        self.assertFalse(self.manager.evaluate("unregistered voice command"))
        self.assertFalse(self.manager.evaluate(""))

    def test_action_sequence_execution_and_counters(self):
        """Verifies splitting on ';' and executing each reflex action with counters."""
        self.manager.register_routine(
            "Quick Sequence",
            "mute audio; adjust brightness 70; sleep 10ms",
        )

        r_before = self.manager.get_routine("Quick Sequence")
        self.assertEqual(r_before["execution_count"], 0)

        detailed = self.manager.evaluate_detailed("Quick Sequence")
        self.assertTrue(detailed["matched"])
        self.assertEqual(len(detailed["actions"]), 3)
        self.assertEqual(detailed["actions"][0], "mute audio")
        self.assertEqual(detailed["actions"][1], "adjust brightness 70")
        self.assertEqual(detailed["actions"][2], "sleep 10ms")

        # Verify results
        self.assertEqual(len(detailed["results"]), 3)
        for res in detailed["results"]:
            self.assertTrue(res["success"])

        # Verify stats updated
        r_after = self.manager.get_routine("Quick Sequence")
        self.assertEqual(r_after["execution_count"], 1)
        self.assertIsNotNone(r_after["last_triggered"])

    def test_disabled_routine_behavior(self):
        """Verifies disabled routines do not trigger during evaluate."""
        routine = self.manager.register_routine("Ghost Macro", "mute audio", enabled=False)
        self.assertFalse(self.manager.evaluate("Ghost Macro"))

        # Toggle enabled
        self.manager.toggle_routine(routine["id"], enabled=True)
        self.assertTrue(self.manager.evaluate("Ghost Macro"))

        # Toggle back to disabled
        self.manager.toggle_routine(routine["id"])
        self.assertFalse(self.manager.evaluate("Ghost Macro"))

    def test_remove_routine(self):
        """Verifies removing routines by ID and by trigger phrase."""
        r1 = self.manager.register_routine("Temporary Macro 1", "mute audio")
        r2 = self.manager.register_routine("Temporary Macro 2", "volume up")

        # Remove by ID
        self.assertTrue(self.manager.remove_routine(r1["id"]))
        self.assertIsNone(self.manager.get_routine(r1["id"]))

        # Remove by phrase
        self.assertTrue(self.manager.remove_routine("Temporary Macro 2"))
        self.assertIsNone(self.manager.get_routine("Temporary Macro 2"))

        # Remove non-existent returns False
        self.assertFalse(self.manager.remove_routine(999999))

    def test_direct_execute_routine(self):
        """Verifies execute_routine directly triggers actions without matching (UI Play button)."""
        r = self.manager.register_routine("Direct Run", "mute audio; keep awake")
        res = self.manager.execute_routine(r["id"])

        self.assertTrue(res["success"])
        self.assertEqual(len(res["actions"]), 2)
        self.assertTrue(res["results"][0]["success"])
        self.assertTrue(res["results"][1]["success"])

    def test_tidy_desktop_reflex(self):
        """Verifies tidy desktop reflex handles invocation gracefully."""
        res = tidy_desktop_reflex(dry_run=True)
        self.assertIsInstance(res, str)

        action_res = self.manager.execute_action("tidy desktop")
        self.assertTrue(action_res["success"])
        self.assertEqual(action_res["type"], "TIDY_DESKTOP")

    def test_concurrent_access_thread_safety(self):
        """Verifies multi-threaded concurrent evaluate and register calls under SQLite WAL."""
        errors = []

        def worker(thread_idx: int):
            try:
                for i in range(10):
                    phrase = f"Thread Routine {thread_idx}_{i}"
                    self.manager.register_routine(phrase, "mute audio; sleep 1ms")
                    matched = self.manager.evaluate(phrase)
                    if not matched:
                        errors.append(f"Failed to match {phrase}")
            except Exception as e:
                errors.append(str(e))

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
