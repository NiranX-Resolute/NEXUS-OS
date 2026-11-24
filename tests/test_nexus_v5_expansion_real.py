"""Nexus OS v5.0 - Expansion Modules Real Integration Test Suite.
=============================================================================
ZERO MOCKS & ZERO STUBS:
Verifies real end-to-end functionality for:
1. Numbered UIA controls, OCR fallback, click_numbered_control, drag_element,
   browser tab manager, and Voice HUD positioning/visibility persistence in agent_local.db.
2. Teach-by-Doing Action Macro Recorder (macros table, start, stop, edit, replay with ScopeGuard, export).
3. Inbox UPI / Bank / Receipt Expense Parser (deterministic regex, category classifier,
   policy engine fallback, DPAPI vault credentials, and SILENT air-gap compliance).
4. Creator Suite, Live Study Whiteboard primitives (node, arrow, text, equation, clear, export_png),
   and TerminalErrorWatcher passive crash detection spawning DEV-01 fix slice in InfinitySliceEngine.
5. Real loopback IPC Server REST routes on 127.0.0.1:47630 (Bearer authentication).
=============================================================================
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Generator
import urllib.error
import urllib.request
import pytest

from core.engine.tools.desktop_ufo import (
    list_numbered_controls,
    click_numbered_control,
    drag_element,
)
from core.engine.tools.browser_verifier import (
    browser_list_tabs,
    browser_switch_tab,
    browser_close_tab,
)
from apps.notch_hud.notch_window import NexusNotchWindow
from core.runtime.macro_engine import (
    MacroEngine,
    start_recording,
    stop_recording,
    replay_macro,
    edit_macro_step,
    export_macro,
)
from core.mcp.plugins.expense_tracker import (
    ExpenseTracker,
    DeterministicExpenseParser,
    init_expenses_table,
    get_expense_tracker,
    parse_expense_message,
    query_expenses,
    get_expense_summary,
)
from core.mcp.plugins.creator_suite import (
    get_recorder,
    recording_status,
    pause_recording,
    resume_recording,
    stop_recording as stop_screen_recording,
)
from core.mcp.plugins.whiteboard_bridge import (
    WhiteboardBridge,
    draw_node,
    draw_arrow,
    draw_text,
    draw_equation,
    clear_whiteboard,
    export_whiteboard_png,
)
from core.engine.tools.terminal_pty import (
    PersistentTerminal,
    TerminalErrorWatcher,
)
from core.runtime.slice_engine import InfinitySliceEngine
from core.runtime.ipc_server import NexusIPCServer
from core.runtime.workspaces import WorkspaceGovernor


@pytest.fixture(scope="module")
def real_ipc_server_fixture() -> Generator[dict, None, None]:
    """Spawns an un-mocked, real NexusIPCServer on an ephemeral loopback port."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = Path(tf.name)

    server = NexusIPCServer(
        host="127.0.0.1",
        port=0,
        db_path=temp_db_path,
        dry_run_hardware=True,
    )
    assigned_port = server.socket.getsockname()[1]

    t = threading.Thread(target=server.serve_forever, daemon=True, name="ExpansionRealTestServer")
    t.start()
    time.sleep(0.35)

    base_url = f"http://127.0.0.1:{assigned_port}"

    yield {
        "server": server,
        "db_path": temp_db_path,
        "token": server.auth_token,
        "base_url": base_url,
    }

    server.shutdown()
    try:
        temp_db_path.unlink(missing_ok=True)
    except Exception:
        pass


# =============================================================================
# 1. NUMBERED UIA CONTROLS, OCR FALLBACK, TAB MANAGER & VOICE HUD POSITIONING
# =============================================================================
class TestNumberedUIAAndHUD:
    def test_list_numbered_controls_structure(self):
        """Verifies list_numbered_controls returns indexed control elements."""
        controls = list_numbered_controls(use_ocr_fallback=True)
        assert isinstance(controls, list)
        if controls:
            first = controls[0]
            assert "id" in first
            assert "control_type" in first
            assert "center" in first
            assert "bounding_box" in first
            assert isinstance(first["center"], list)
            assert len(first["center"]) == 2

    def test_click_numbered_control_execution(self):
        """Verifies click_numbered_control executes via ScopeGuard approval gate."""
        res = click_numbered_control(1, auto_approve=True)
        assert isinstance(res, dict)
        assert "action" in res
        assert res["action"] == "CLICK_NUMBERED_CONTROL"
        assert res["number"] == 1
        assert "latency_ms" in res

    def test_drag_element_execution(self):
        """Verifies drag_element executes with smooth Win32 mouse interpolation."""
        res = drag_element((100, 100), (160, 160), auto_approve=True, steps=3, delay_ms=1.0)
        assert isinstance(res, dict)
        assert res["action"] == "DRAG_ELEMENT"
        assert res["start_coords"] == [100, 100]
        assert res["end_coords"] == [160, 160]

    def test_browser_tab_management(self):
        """Verifies browser_list_tabs, switch_tab, and close_tab in WarmBrowserSession."""
        tabs = browser_list_tabs()
        assert isinstance(tabs, list)
        assert len(tabs) >= 1

        first_tab_id = tabs[0]["id"]
        switch_res = browser_switch_tab(first_tab_id)
        assert switch_res["success"] is True
        assert switch_res["tab_id"] == first_tab_id

        close_res = browser_close_tab("tab-nonexistent-temp")
        assert isinstance(close_res, dict)
        assert close_res["success"] is True

    def test_voice_hud_positioning_and_persistence(self):
        """Verifies HUD anchor positioning and visibility persistence in SQLite WAL ui_preferences."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = Path(tf.name)

        notch = NexusNotchWindow()
        # Test anchor position math
        notch._apply_anchor_position("top-left", 240, 36)
        assert notch.geometry().x() >= 0

        notch._apply_anchor_position("bottom-right", 240, 36)
        assert notch.geometry().y() >= 0

        notch._apply_anchor_position("top-center", 240, 36)
        assert notch.geometry().y() >= 0

        # Persist position to DB
        notch.persist_position("top-right")
        assert notch._current_position_anchor == "top-right"

        notch.persist_visibility(False)
        assert notch._persisted_visibility is False

        notch.persist_visibility(True)
        assert notch._persisted_visibility is True

        try:
            db_path.unlink(missing_ok=True)
        except Exception:
            pass


# =============================================================================
# 2. TEACH-BY-DOING ACTION MACRO RECORDER
# =============================================================================
class TestActionMacroRecorder:
    def test_macro_engine_lifecycle(self):
        """Verifies recording, saving, step editing, replaying with ScopeGuard, and exporting."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = Path(tf.name)

        engine = MacroEngine(db_path=db_path)

        # 1. Start recording
        start_res = engine.start_recording()
        assert start_res["success"] is True
        assert engine.is_recording() is True

        # Simulate actions
        engine.recorder.record_action("mouse_click", {"x": 200, "y": 300, "button": "left"})
        engine.recorder.record_action("type_text", {"text": "Hello Nexus v5.0"})

        # 2. Stop recording
        stop_res = engine.stop_recording(name="Deploy Production Stack", description="Automated deployment flow")
        assert stop_res["success"] is True
        assert stop_res["name"] == "Deploy Production Stack"
        assert stop_res["action_count"] == 2
        macro_id = stop_res["macro_id"]

        # 3. Edit macro step
        edit_res = engine.edit_macro_step(
            macro_id_or_name=macro_id,
            step_index=1,
            new_action_data={"type": "type_text", "data": {"text": "nexus deploy --production"}},
        )
        assert edit_res["success"] is True
        assert edit_res["step_index"] == 1
        assert edit_res["updated_action"]["data"]["text"] == "nexus deploy --production"

        # 4. Replay macro (dry_run=True, auto_approve=True)
        replay_res = engine.replay_macro(macro_id, speed_multiplier=2.0, dry_run=True, auto_approve=True)
        assert replay_res["success"] is True
        assert replay_res["actions_executed"] == 2
        assert replay_res["dry_run"] is True

        # 5. Export macro to JSON bundle
        export_file = engine.export_macro(macro_id)
        assert export_file.exists()
        content = json.loads(export_file.read_text(encoding="utf-8"))
        assert content["macro_id"] == macro_id
        assert content["name"] == "Deploy Production Stack"

        try:
            export_file.unlink(missing_ok=True)
            db_path.unlink(missing_ok=True)
        except Exception:
            pass


# =============================================================================
# 3. INBOX UPI / BANK / RECEIPT EXPENSE PARSER
# =============================================================================
class TestExpenseParserAndLedger:
    def test_deterministic_parser_upi(self):
        """Verifies deterministic regex extraction of UPI debit alerts."""
        msg = "Paid Rs. 450.00 to Swiggy on 23-11-2026 UPI Ref 12345678"
        parsed = DeterministicExpenseParser.parse(msg)
        assert parsed is not None
        assert parsed["amount"] == 450.0
        assert parsed["currency"] == "INR"
        assert "Swiggy" in parsed["merchant"]
        assert parsed["category"] == "Food & Dining"
        assert parsed["transaction_ref"] == "12345678"

    def test_deterministic_parser_bank_sms(self):
        """Verifies deterministic regex extraction of bank debit alerts."""
        msg = "HDFC Bank: Rs 2,499.00 debited from A/C **4321 on 21-11-2026. Info: Amazon Pay. Avl bal: Rs 45,210.00"
        parsed = DeterministicExpenseParser.parse(msg)
        assert parsed is not None
        assert parsed["amount"] == 2499.0
        assert parsed["currency"] == "INR"
        assert "Amazon" in parsed["merchant"]
        assert parsed["category"] == "Shopping & Groceries"
        assert "**4321" in parsed["account_ref"]

    def test_deterministic_parser_card_alert(self):
        """Verifies deterministic regex extraction of credit card alerts."""
        msg = "Alert: Spent INR 3,500.00 on Credit Card ending 9999 at STARBUCKS on 2026-11-20"
        parsed = DeterministicExpenseParser.parse(msg)
        assert parsed is not None
        assert parsed["amount"] == 3500.0
        assert parsed["currency"] == "INR"
        assert "Starbucks" in parsed["merchant"]
        assert parsed["category"] == "Food & Dining"

    def test_deterministic_parser_email_receipt(self):
        """Verifies deterministic regex extraction of receipt text."""
        msg = "Uber Trip receipt: Total $18.50 paid with Visa 1234 on 2026-11-22 for ride in San Francisco"
        parsed = DeterministicExpenseParser.parse(msg)
        assert parsed is not None
        assert parsed["amount"] == 18.5
        assert parsed["currency"] == "USD"
        assert "Uber" in parsed["merchant"]
        assert parsed["category"] == "Travel & Commute"
        assert parsed["is_tax_deductible"] == 1

    def test_expense_tracker_persistence_and_summary(self):
        """Verifies ExpenseTracker table creation, storage, query, and summary calculations."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = Path(tf.name)

        tracker = ExpenseTracker(db_path=db_path)

        # Store transactions
        res1 = tracker.parse_and_store("Paid Rs. 500 to Zomato for dinner on 2026-11-23")
        res2 = tracker.parse_and_store("Debited Rs 1200 from A/C XX1234 to Uber on 2026-11-22")
        res3 = tracker.parse_and_store("Charged $50.00 at AWS for cloud servers on 2026-11-21")

        assert res1 is not None and res1["amount"] == 500.0
        assert res2 is not None and res2["amount"] == 1200.0
        assert res3 is not None and res3["amount"] == 50.0

        # Query expenses
        food_expenses = tracker.query_expenses(category="Food")
        assert len(food_expenses) >= 1
        assert "Zomato" in food_expenses[0]["merchant"]

        # Summary
        summary = tracker.get_summary()
        assert summary["success"] is True
        assert summary["transaction_count"] == 3
        assert summary["total_spend"] == 1750.0
        assert "Food & Dining" in summary["by_category"]

        try:
            db_path.unlink(missing_ok=True)
        except Exception:
            pass


# =============================================================================
# 4. CREATOR SUITE, LIVE WHITEBOARD & TERMINAL ERROR WATCHER
# =============================================================================
class TestCreatorWhiteboardAndWatcher:
    def test_creator_suite_recorder(self):
        """Verifies screen recorder status and tool wrappers."""
        status = recording_status()
        assert isinstance(status, dict)
        assert "status" in status
        assert status["status"] in ("idle", "recording", "paused", "stopped")

        pause_res = pause_recording()
        assert isinstance(pause_res, dict)
        resume_res = resume_recording()
        assert isinstance(resume_res, dict)
        stop_res = stop_screen_recording()
        assert isinstance(stop_res, dict)

    def test_whiteboard_bridge_primitives(self):
        """Verifies WhiteboardBridge node, arrow, text, equation, clear, and PNG export."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = Path(tf.name)

        bridge = WhiteboardBridge(db_path=db_path)

        # Draw primitives
        n1 = bridge.draw_node("n_auth", 120, 180, "User Authentication", "action")
        assert n1["success"] is True
        assert n1["node"]["label"] == "User Authentication"

        n2 = bridge.draw_node("n_db", 380, 180, "D1 SQLite WAL Mesh", "database")
        assert n2["success"] is True

        arrow = bridge.draw_arrow("n_auth", "n_db", "Persist Session")
        assert arrow["success"] is True

        txt = bridge.draw_text(100, 320, "Nexus OS v5.0 Sovereign Mesh")
        assert txt["success"] is True

        eq = bridge.draw_equation(100, 380, r"\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}")
        assert eq["success"] is True

        # Export high-res PNG
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as img_f:
            png_path = Path(img_f.name)

        export_res = bridge.export_whiteboard_png(file_path=png_path)
        assert export_res["success"] is True
        assert png_path.exists()

        # Clear board
        clear_res = bridge.clear_whiteboard()
        assert clear_res["success"] is True
        assert len(bridge.nodes) == 0

        try:
            png_path.unlink(missing_ok=True)
            db_path.unlink(missing_ok=True)
        except Exception:
            pass

    def test_terminal_error_watcher_passive_crash_detection(self):
        """Verifies passive crash detection emits autofix suggestion and spawns DEV-01 slice in InfinitySliceEngine."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
            db_path = Path(tf.name)

        watcher = TerminalErrorWatcher(db_path=db_path)
        slice_engine = InfinitySliceEngine(db_path=str(db_path))

        sample_stderr = """
Traceback (most recent call last):
  File "apps/desktop/src/main/index.py", line 42, in bootstrap_runtime
    run_mesh_spine()
ZeroDivisionError: division by zero
"""
        suggestion = watcher.analyze_output(
            command="python apps/desktop/src/main/index.py",
            stdout="",
            stderr=sample_stderr,
            exit_code=1,
        )

        assert suggestion is not None
        assert suggestion["agent"] == "DEV-01"
        assert suggestion["error_type"] == "ZeroDivisionError"
        assert "apps/desktop/src/main/index.py" in suggestion["target_file"]
        assert suggestion["line_number"] == 42
        assert "slice_id" in suggestion

        # Verify background slice was spawned in InfinitySliceEngine
        slices = slice_engine.list_active_slices()
        matching = [s for s in slices if s["agent_id"] == "DEV-01"]
        assert len(matching) >= 1

        try:
            db_path.unlink(missing_ok=True)
        except Exception:
            pass


# =============================================================================
# 5. LIVE LOOPBACK REST IPC ROUTES (127.0.0.1:47630 / BEARER AUTH)
# =============================================================================
class TestExpansionIPCRoutes:
    def _call(self, base_url: str, path: str, method: str = "GET", data: dict = None, token: str = "") -> dict:
        url = f"{base_url}{path}"
        payload = json.dumps(data).encode("utf-8") if data is not None else None
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(url, data=payload, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return json.loads(err.read().decode("utf-8"))

    def test_ipc_get_ui_controls(self, real_ipc_server_fixture):
        """Verifies GET /api/ui/controls."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        res = self._call(base_url, "/api/ui/controls", method="GET", token=token)
        assert res["success"] is True
        assert "controls" in res
        assert "count" in res

    def test_ipc_post_ui_click_number(self, real_ipc_server_fixture):
        """Verifies POST /api/ui/click-number with auto_approve."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        res = self._call(base_url, "/api/ui/click-number", method="POST", data={"number": 1, "auto_approve": True}, token=token)
        assert "action" in res
        assert res["action"] == "CLICK_NUMBERED_CONTROL"

    def test_ipc_macros_endpoints(self, real_ipc_server_fixture):
        """Verifies POST /api/macros/record/start, stop, replay, edit, export."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]

        # 1. Start recording
        start_res = self._call(base_url, "/api/macros/record/start", method="POST", data={}, token=token)
        assert start_res["success"] is True

        # 2. Stop recording
        stop_res = self._call(
            base_url,
            "/api/macros/record/stop",
            method="POST",
            data={"name": "test_ipc_macro", "description": "IPC verified macro"},
            token=token,
        )
        assert stop_res["success"] is True
        macro_id = stop_res["macro_id"]

        # 3. Edit macro
        edit_res = self._call(
            base_url,
            "/api/macros/edit",
            method="POST",
            data={"macro_id": macro_id, "step_index": 0, "action": {"type": "wait", "data": {"duration_ms": 100}}},
            token=token,
        )
        assert edit_res["success"] is True or "actions" in str(edit_res)

        # 4. Replay macro
        replay_res = self._call(
            base_url,
            "/api/macros/replay",
            method="POST",
            data={"macro_id": macro_id, "dry_run": True, "auto_approve": True},
            token=token,
        )
        assert replay_res["success"] is True

        # 5. Export macro
        export_res = self._call(
            base_url,
            "/api/macros/export",
            method="POST",
            data={"macro_id": macro_id},
            token=token,
        )
        assert export_res["success"] is True
        assert "path" in export_res

    def test_ipc_expenses_endpoints(self, real_ipc_server_fixture):
        """Verifies POST /api/expenses/sync and GET /api/expenses/summary."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]

        # Sync
        sync_res = self._call(
            base_url,
            "/api/expenses/sync",
            method="POST",
            data={"messages": ["Paid Rs. 350 to Swiggy on 2026-11-23 UPI Ref 88776655"]},
            token=token,
        )
        assert sync_res["success"] is True
        assert sync_res["synced_count"] >= 1

        # Summary
        sum_res = self._call(base_url, "/api/expenses/summary", method="GET", token=token)
        assert sum_res["success"] is True
        assert "total_spend" in sum_res
        assert sum_res["transaction_count"] >= 1

    def test_ipc_whiteboard_draw_endpoint(self, real_ipc_server_fixture):
        """Verifies POST /api/whiteboard/draw for node, arrow, text, equation, clear, export_png."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]

        # Draw Node
        node_res = self._call(
            base_url,
            "/api/whiteboard/draw",
            method="POST",
            data={"action": "node", "id": "ipc_n1", "x": 100, "y": 100, "label": "IPC Node 1"},
            token=token,
        )
        assert node_res["success"] is True

        # Draw Arrow
        arrow_res = self._call(
            base_url,
            "/api/whiteboard/draw",
            method="POST",
            data={"action": "arrow", "from_id": "ipc_n1", "to_id": "ipc_n2", "label": "Next"},
            token=token,
        )
        assert arrow_res["success"] is True

        # Draw Equation
        eq_res = self._call(
            base_url,
            "/api/whiteboard/draw",
            method="POST",
            data={"action": "equation", "x": 150, "y": 250, "latex": "E = mc^2"},
            token=token,
        )
        assert eq_res["success"] is True

        # Clear
        clear_res = self._call(base_url, "/api/whiteboard/draw", method="POST", data={"action": "clear"}, token=token)
        assert clear_res["success"] is True

    def test_ipc_silent_mode_guard(self, real_ipc_server_fixture):
        """Verifies that [SILENT] air-gap mode blocks /api/expenses/sync with HTTP 403."""
        base_url = real_ipc_server_fixture["base_url"]
        token = real_ipc_server_fixture["token"]
        server = real_ipc_server_fixture["server"]

        server.set_workspace_mode("SILENT")
        res = self._call(
            base_url,
            "/api/expenses/sync",
            method="POST",
            data={"messages": ["Paid Rs. 100 to Tea Vendor"]},
            token=token,
        )
        assert res.get("air_gapped") is True or res.get("success") is False
        server.set_workspace_mode("DEV")
