"""Unit tests for core/mcp/plugins/daily_picks_engine.py."""

import gc
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest

from core.mcp.plugins.daily_picks_engine import (
    generate_daily_picks,
    generate_daily_three_picks,
    populate_daily_picks,
    fetch_daily_picks,
    init_daily_picks_table,
    get_daily_picks_db_path,
)
from core.mcp.plugin_loader import (
    wrap_tool_with_governance,
    REGISTERED_TOOLS,
)


class TestDailyPicksEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.db_path = Path(self.temp_dir.name) / "test_agent_local.db"

    def tearDown(self):
        gc.collect()
        try:
            self.temp_dir.cleanup()
        except Exception:
            pass

    def test_nexus_tool_decorator_metadata(self):
        """Assert function has proper @nexus_tool metadata attached."""
        self.assertTrue(hasattr(generate_daily_picks, "_nexus_tool_meta"))
        meta = getattr(generate_daily_picks, "_nexus_tool_meta")
        self.assertEqual(meta["name"], "generate_daily_picks")
        self.assertEqual(meta["description"], "Generates 3 personalized daily cards and audio brief.")
        self.assertEqual(meta["agent"], "SCOUT-01")

    def test_sqlite_wal_and_table_init(self):
        """Assert database initializes with WAL mode and creates daily_picks table."""
        conn = init_daily_picks_table(self.db_path)
        try:
            cur = conn.execute("PRAGMA journal_mode;")
            mode = cur.fetchone()[0]
            self.assertEqual(mode.lower(), "wal")

            cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_picks';")
            self.assertIsNotNone(cur.fetchone())
        finally:
            conn.close()

    def test_generate_daily_picks_execution_and_persistence(self):
        """Assert generate_daily_picks generates 3 picks (DEV, SEC, SYS) and populates SQLite."""
        raw_json = generate_daily_picks(db_path=str(self.db_path))
        self.assertIsInstance(raw_json, str)

        payload = json.loads(raw_json)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["count"], 3)
        self.assertIn("audio_brief", payload)
        self.assertIsInstance(payload["audio_brief"], str)
        self.assertTrue(len(payload["audio_brief"]) > 10)

        picks = payload["picks"]
        self.assertEqual(len(picks), 3)

        categories = {p["category"] for p in picks}
        self.assertEqual(categories, {"DEV", "SEC", "SYS"})

        for p in picks:
            self.assertIn("id", p)
            self.assertIn("title", p)
            self.assertIn("summary", p)
            self.assertIn("audio_brief", p)
            self.assertIn("action_item", p)
            self.assertIn("priority", p)
            self.assertIn("metadata", p)

        # Verify persistence in SQLite
        db_picks = fetch_daily_picks(self.db_path)
        self.assertEqual(len(db_picks), 3)
        db_categories = {p["category"] for p in db_picks}
        self.assertEqual(db_categories, {"DEV", "SEC", "SYS"})

    def test_clearing_stale_entries_on_update(self):
        """Assert previous stale entries are cleared on fresh generation."""
        conn = init_daily_picks_table(self.db_path)
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO daily_picks (
                        id, category, title, summary, description, audio_brief,
                        action_item, priority, metadata_json, created_at, updated_at
                    ) VALUES ('OLD-1', 'LEGACY', 'Old Title', 'Old Summary', 'Old Desc', 'Old Audio', 'Action', 'LOW', '{}', 1.0, 1.0)
                    """
                )
        finally:
            conn.close()

        # Generate fresh picks
        generate_daily_picks(db_path=str(self.db_path), force_refresh=True)

        db_picks = fetch_daily_picks(self.db_path)
        self.assertEqual(len(db_picks), 3)
        self.assertFalse(any(p["category"] == "LEGACY" for p in db_picks))

    def test_generate_daily_picks_as_list(self):
        """Assert as_list=True returns valid JSON string of list."""
        raw_json = generate_daily_picks(db_path=str(self.db_path), as_list=True)
        self.assertIsInstance(raw_json, str)
        data = json.loads(raw_json)
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 3)

    def test_plugin_governance_and_registration(self):
        """Assert plugin wraps with governance and integrates cleanly with REGISTERED_TOOLS."""
        meta = getattr(generate_daily_picks, "_nexus_tool_meta")
        secured_fn = wrap_tool_with_governance(generate_daily_picks, meta)
        REGISTERED_TOOLS["generate_daily_picks"] = {
            "name": meta["name"],
            "description": meta["description"],
            "agent": meta["agent"],
            "requires_approval": meta["requires_approval"],
            "plugin_file": "daily_picks_engine.py",
            "func_name": "generate_daily_picks",
            "secured_callable": secured_fn,
        }
        self.assertIn("generate_daily_picks", REGISTERED_TOOLS)
        tool_entry = REGISTERED_TOOLS["generate_daily_picks"]
        self.assertEqual(tool_entry["name"], "generate_daily_picks")
        self.assertEqual(tool_entry["description"], "Generates 3 personalized daily cards and audio brief.")
        # Execute secured tool call
        result_json = tool_entry["secured_callable"](db_path=str(self.db_path))
        self.assertIn("picks", result_json)

    def test_generate_daily_three_picks_metadata_and_execution(self):
        """Assert generate_daily_three_picks is registered as @nexus_tool and generates 3 cards."""
        self.assertTrue(hasattr(generate_daily_three_picks, "_nexus_tool_meta"))
        meta = getattr(generate_daily_three_picks, "_nexus_tool_meta")
        self.assertEqual(meta["name"], "generate_daily_three_picks")
        self.assertEqual(meta["agent"], "SCOUT-01")

        # Execute with silent_mode=True
        raw_json = generate_daily_three_picks(db_path=str(self.db_path), silent_mode=True)
        self.assertIsInstance(raw_json, str)
        payload = json.loads(raw_json)
        self.assertTrue(payload["success"])
        self.assertEqual(payload["count"], 3)
        self.assertTrue(payload["silent_mode"])
        self.assertEqual(payload["audio_brief"], "")  # Silent mode silences audio brief

        # Verify picks categories
        categories = {p["category"] for p in payload["picks"]}
        self.assertEqual(categories, {"DEV", "SEC", "INTEL"})

        # Verify SQLite persistence
        db_picks = fetch_daily_picks(self.db_path)
        self.assertEqual(len(db_picks), 3)
        db_categories = {p["category"] for p in db_picks}
        self.assertEqual(db_categories, {"DEV", "SEC", "INTEL"})

    def test_generate_daily_three_picks_with_spoken_summary(self):
        """Assert generate_daily_three_picks synthesizes spoken audio brief when not silent."""
        raw_json = generate_daily_three_picks(db_path=str(self.db_path), silent_mode=False)
        payload = json.loads(raw_json)
        self.assertTrue(payload["success"])
        self.assertFalse(payload["silent_mode"])
        self.assertTrue(len(payload["audio_brief"]) > 20)
        self.assertIn("NiranX", payload["audio_brief"])



if __name__ == "__main__":
    unittest.main()
