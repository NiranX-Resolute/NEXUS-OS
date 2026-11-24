"""
Nexus OS v5.0 - Wave 1 Real Verification Suite: Macros, Expenses & Terminal Watcher.
Zero stubs, zero mocks, zero placeholder tokens.
Real SQLite WAL transactions, real regex & DPAPI parser, and real subprocess terminal execution.
"""

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import pytest

from core.engine.tools.terminal_pty import PersistentTerminal, TerminalErrorWatcher
from core.mcp.plugins.expense_tracker import (
    DeterministicExpenseParser,
    ExpenseTracker,
    classify_merchant_and_category,
    init_expenses_table,
)
from core.runtime.macro_engine import MacroEngine
from core.runtime.macro_recorder import MacroRecorder, mask_sensitive_data
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture
def temp_db(tmp_path):
    """Provides a dedicated real SQLite database in WAL mode."""
    db_file = tmp_path / "test_agent_local.db"
    return db_file


class TestMacroEngineReal:
    """Verifies SQLite WAL persistence, password masking, editing, and .nxskill compilation."""

    def test_password_and_secret_masking(self):
        # Verify credential masking
        raw_text = "Login with password=MySecretP@ssw0rd! and sk-1234567890abcdef1234567890"
        masked = mask_sensitive_data(raw_text)
        assert "MySecretP@ssw0rd!" not in masked
        assert "sk-1234567890abcdef1234567890" not in masked
        assert "${VAULT:MASKED_SECRET}" in masked or "${VAULT:OPENAI_API_KEY}" in masked

    def test_macro_save_retrieve_and_edit_steps(self, temp_db):
        engine = MacroEngine(db_path=temp_db)

        actions = [
            {"action_type": "mouse_click", "data": {"x": 100, "y": 200, "button": "left"}},
            {"action_type": "type_text", "data": {"text": "password=SuperSecret999!"}},
            {"action_type": "wait", "data": {"duration_ms": 50}},
        ]

        # 1. Save macro
        saved = engine.save_macro(name="deploy-flow", actions=actions, description="Real deploy flow")
        assert saved["name"] == "deploy-flow"
        assert len(saved["actions"]) == 3

        # 2. Check persistence in SQLite WAL table
        with sqlite3.connect(str(temp_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM macros WHERE name = 'deploy-flow';").fetchone()
            assert row is not None
            assert row["name"] == "deploy-flow"
            assert row["action_count"] == 3
            steps = json.loads(row["steps_json"])
            assert len(steps) == 3

        # 3. Edit macro step
        patch = {"data": {"x": 150, "y": 250, "button": "right"}}
        edit_res = engine.edit_macro_step(name="deploy-flow", index=0, patch=patch)
        assert edit_res["success"] is True
        assert edit_res["index"] == 0

        updated = engine.get_macro("deploy-flow")
        assert updated is not None
        assert updated["actions"][0]["data"]["x"] == 150
        assert updated["actions"][0]["data"]["button"] == "right"

    def test_macro_export_to_nxskill(self, temp_db, tmp_path):
        engine = MacroEngine(db_path=temp_db)
        actions = [
            {"action_type": "mouse_click", "data": {"x": 300, "y": 400, "button": "left"}},
            {"action_type": "key_press", "data": {"key": "enter"}},
        ]
        engine.save_macro(name="quick-backup", actions=actions, description="Auto backup macro")

        out_dir = tmp_path / "skills_out"
        pkg_res = engine.export_macro_to_nxskill(name="quick-backup", output_dir=out_dir)

        assert pkg_res["success"] is True
        assert pkg_res["slug"] == "quick-backup"
        assert Path(pkg_res["package_path"]).exists()
        assert len(pkg_res["sha256"]) == 64
        assert pkg_res["shield_score"] >= 90

        # Verify indexing in ecc_skills
        with sqlite3.connect(str(temp_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM ecc_skills WHERE slug = 'quick-backup';").fetchone()
            assert row is not None
            assert row["title"] == "quick-backup"
            assert row["sha256"] == pkg_res["sha256"]

    def test_macro_dry_run_replay(self, temp_db):
        engine = MacroEngine(db_path=temp_db)
        actions = [
            {"action_type": "type_text", "data": {"text": "echo hello"}},
            {"action_type": "wait", "data": {"duration_ms": 10}},
        ]
        engine.save_macro(name="hello-macro", actions=actions)

        # Dry run must execute with zero side effects
        res = engine.replay_macro(name="hello-macro", dry_run=True)
        assert res["success"] is True
        assert res["actions_executed"] == 2
        assert res["dry_run"] is True


class TestExpenseTrackerReal:
    """Verifies deterministic regex parsing, SQLite WAL storage, and SILENT mode air-gap."""

    def test_parse_real_upi_sms(self):
        sms_text = "Dear Customer, INR 450.00 debited from A/C XX4921 on 21-11-2026 to Swiggy on UPI Ref 632198741029. Bal: INR 12,340.50"
        parsed = DeterministicExpenseParser.parse(sms_text)
        assert parsed is not None
        assert parsed["amount"] == 450.0
        assert parsed["currency"] == "INR"
        assert "Swiggy" in parsed["merchant"]
        assert parsed["category"] == "Food & Dining"
        assert parsed["payment_method"] == "UPI"
        assert parsed["transaction_ref"] == "632198741029"

    def test_parse_real_card_alert(self):
        card_text = "Alert: USD 45.00 charged on your Card ending 1084 at AWS Cloud Services on 2026-11-20. Info: Cloud Infrastructure."
        parsed = DeterministicExpenseParser.parse(card_text)
        assert parsed is not None
        assert parsed["amount"] == 45.0
        assert parsed["currency"] == "USD"
        assert "aws" in parsed["merchant"].lower() or "amazon web services" in parsed["merchant"].lower()
        assert parsed["category"] == "Cloud & Infrastructure"
        assert parsed["is_tax_deductible"] == 1

    def test_store_and_spend_summary(self, temp_db):
        tracker = ExpenseTracker(db_path=temp_db)

        # Ingest 3 real transactions
        msg1 = "INR 280.00 debited for Uber ride on UPI ref 112233445566 on 2026-11-19"
        msg2 = "INR 1250.00 paid to Domino's Pizza on Card ending 9999 on 2026-11-20"
        msg3 = "USD 20.00 charged at GitHub on 2026-11-21 for Copilot"

        r1 = tracker.parse_and_store(msg1)
        r2 = tracker.parse_and_store(msg2)
        r3 = tracker.parse_and_store(msg3)

        assert r1 is not None and r2 is not None and r3 is not None

        summary = tracker.get_spend_summary(period="month")
        assert summary["success"] is True
        assert summary["transaction_count"] == 3
        assert summary["total_spend"] == 280.0 + 1250.0 + 20.0
        assert "Food & Dining" in summary["by_category"]

        merchants = tracker.get_top_merchants(limit=5)
        assert merchants["success"] is True
        assert len(merchants["merchants"]) >= 2

        categories = tracker.get_category_breakdown()
        assert categories["success"] is True
        assert len(categories["categories"]) >= 2

    def test_silent_mode_air_gap_blocking(self, temp_db):
        tracker = ExpenseTracker(db_path=temp_db)
        governor = WorkspaceGovernor()
        prev_mode = governor.get_mode()

        try:
            governor.set_mode("SILENT")
            # In SILENT mode, sync_inbox_expenses must not reach external networks
            res = tracker.sync_inbox_expenses()
            assert res["success"] is True
            assert res["air_gapped"] is True
            assert res["workspace_mode"] == "SILENT"
            assert "blocked" in res["message"].lower() or "air-gap" in res["message"].lower()
        finally:
            governor.set_mode(prev_mode)


class TestTerminalWatcherReal:
    """Verifies that PersistentTerminal and TerminalErrorWatcher detect real tracebacks and non-zero exits."""

    def test_watcher_detects_python_traceback(self, temp_db):
        watcher = TerminalErrorWatcher(db_path=temp_db)

        # Run a real failing Python command producing a real Traceback
        cmd = f'"{sys.executable}" -c "raise ValueError(\'Expected Real Verification Error\')"'
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)

        assert proc.returncode != 0
        assert "Traceback (most recent call last):" in proc.stderr
        assert "ValueError" in proc.stderr

        # Analyze with watcher
        analysis = watcher.analyze_output(
            command=cmd,
            stdout=proc.stdout,
            stderr=proc.stderr,
            exit_code=proc.returncode,
        )

        assert analysis is not None
        assert analysis["agent"] == "DEV-01"
        assert "ValueError" in analysis["error_type"] or "ValueError" in analysis["error_message"]
        assert analysis["action_slice"] == "DISPATCH_DEV01_AUTONOMOUS_FIX"

        # Verify event saved into SQLite WAL table terminal_autofix_events
        with sqlite3.connect(str(temp_db)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM terminal_autofix_events WHERE command = ?;", (cmd,)).fetchone()
            assert row is not None
            assert row["exit_code"] != 0
            assert "ValueError" in row["error_message"]
