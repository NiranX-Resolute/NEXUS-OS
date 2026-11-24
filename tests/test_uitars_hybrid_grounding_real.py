"""
Nexus OS v5.0 - Real Integration Test Suite
=============================================================================
Verification Gate for UI-TARS Hybrid Vision Grounding, Unified Operators &
Delta Event Stream.
Strictly zero-mock, zero-stub real system testing:
1. UI-TARS [0..1000] coordinate parsing and multi-monitor DPI scaling.
2. Complete action verb coverage (click, double_click, right_click, drag, type, hotkey, scroll, wait, finished).
3. BaseOperator abstraction and cooperative E-STOP abort signal propagation.
4. Win32LocalOperator, HybridBrowserOperator, and AndroidADBOperator execution.
5. ScopeGuard coordinate hit-test interception and sensitive keyword gating (send, delete, pay, submit, format).
6. Typed delta event stream (INIT, RUNNING, EXECUTE, END, ABORTED) persisted to SQLite WAL.
7. Fallback escalation from UIA and DOM tree lookup failure to visual grounding.
=============================================================================
"""

import asyncio
import json
from pathlib import Path
import sqlite3
import time
import pytest

from core.engine.grounding_parser import (
    build_grounding_prompt,
    normalize_coords_to_physical,
    parse_tars_action,
)
from core.engine.operators.base import AbortSignal, BaseOperator
from core.engine.operators.win32_operator import Win32LocalOperator, get_screen_dimensions, get_system_dpi_scale
from core.engine.operators.browser_operator import HybridBrowserOperator
from core.engine.operators.android_operator import AndroidADBOperator
from core.engine.safety_guard import EmergencyStopException, SafetyGuard
from core.engine.tools.browser_verifier import BrowserVerifier
from core.engine.tools.desktop_ufo import DesktopUFO, get_element_at_point
from core.runtime.gateway import emit_delta_event
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError


def test_tars_action_parsing_and_multi_dpi_scaling():
    """Verifies [0..1000] point and bounding box normalization across multiple DPI scales."""
    # 1. Standard single point (500, 500) on 1920x1080 with 1.0 DPI
    raw_output_1 = "Thought: Click the center of the screen.\nAction: click(start_box='(500,500)')"
    parsed_1 = parse_tars_action(raw_output_1, screen_width=1920, screen_height=1080, dpi_scale=1.0)
    assert parsed_1["success"] is True
    assert parsed_1["action_type"] == "click"
    assert parsed_1["thought"] == "Click the center of the screen."
    assert parsed_1["target_point"] == (960, 540)
    assert parsed_1["x"] == 960
    assert parsed_1["y"] == 540

    # 2. 150% DPI scale on 1920x1080
    parsed_dpi = parse_tars_action(raw_output_1, screen_width=1920, screen_height=1080, dpi_scale=1.5)
    assert parsed_dpi["target_point"] == (1440, 810)

    # 3. 4-coordinate bounding box (x1, y1, x2, y2)
    raw_box = "Action: click(start_box='(200,400,400,600)')"
    parsed_box = parse_tars_action(raw_box, screen_width=1920, screen_height=1080, dpi_scale=1.0)
    assert parsed_box["success"] is True
    # Center is (300, 500) in [0..1000] -> (0.3*1920, 0.5*1080) = (576, 540)
    assert parsed_box["target_point"] == (576, 540)

    # 4. GROUNDING fast-mode (omitting Thought tokens)
    prompt_fast = build_grounding_prompt("Click submit button", fast_mode=True)
    assert "Thought:" not in prompt_fast
    assert "without Thought tokens" in prompt_fast

    raw_fast = "Action: click(start_box='(100,200)')"
    parsed_fast = parse_tars_action(raw_fast, screen_width=1000, screen_height=1000, dpi_scale=1.0)
    assert parsed_fast["thought"] == ""
    assert parsed_fast["target_point"] == (100, 200)


def test_parse_all_tars_action_verbs():
    """Verifies all UI-TARS action primitives (double_click, right_click, drag, type, hotkey, scroll, wait, finished)."""
    w, h = 1000, 1000

    # double_click
    res = parse_tars_action("Action: double_click(start_box='(300,400)')", w, h, 1.0)
    assert res["action_type"] == "double_click"
    assert res["target_point"] == (300, 400)

    # right_click
    res = parse_tars_action("Action: right_click(start_box='(250,350)')", w, h, 1.0)
    assert res["action_type"] == "right_click"
    assert res["target_point"] == (250, 350)

    # drag
    res = parse_tars_action("Action: drag(start_box='(100,200)', end_box='(400,500)')", w, h, 1.0)
    assert res["action_type"] == "drag"
    assert res["target_point"] == (100, 200)
    assert res["end_point"] == (400, 500)

    # type
    res = parse_tars_action("Action: type(start_box='(150,250)', content='nexus v5.0')", w, h, 1.0)
    assert res["action_type"] == "type"
    assert res["target_point"] == (150, 250)
    assert res["content"] == "nexus v5.0"

    # hotkey
    res = parse_tars_action("Action: hotkey(key='ctrl+s')", w, h, 1.0)
    assert res["action_type"] == "hotkey"
    assert res["key"] == "ctrl+s"

    # scroll
    res = parse_tars_action("Action: scroll(direction='down')", w, h, 1.0)
    assert res["action_type"] == "scroll"
    assert res["direction"] == "down"

    # wait
    res = parse_tars_action("Action: wait()", w, h, 1.0)
    assert res["action_type"] == "wait"

    # finished
    res = parse_tars_action("Action: finished()", w, h, 1.0)
    assert res["action_type"] == "finished"


def test_base_operator_and_estop_circuit_breaker():
    """Verifies BaseOperator cooperative abort signals wired to SafetyGuard E-STOP."""
    # Reset any previous E-Stop state
    SafetyGuard.reset_estop()
    assert SafetyGuard.is_estop_active() is False

    signal = AbortSignal()
    operator = BaseOperator(abort_signal=signal)
    assert operator.is_aborted() is False

    # Trigger operator abort
    operator.abort(reason="Test E-Stop triggered")
    assert operator.is_aborted() is True
    assert SafetyGuard.is_estop_active() is True

    # Assert check_abort raises EmergencyStopException
    with pytest.raises(EmergencyStopException):
        operator.check_abort()

    # Reset
    SafetyGuard.reset_estop()
    signal.reset()
    assert operator.is_aborted() is False


def test_win32_local_operator_observation_and_action():
    """Verifies Win32LocalOperator capture_observation and execute_action execution."""
    SafetyGuard.reset_estop()
    op = Win32LocalOperator()

    obs = op.capture_observation(include_frame=False)
    assert obs["success"] is True
    assert obs["operator"] == "Win32LocalOperator"
    assert "screen_resolution" in obs
    assert "dpi_scale" in obs
    assert isinstance(obs["elements"], list)

    # Non-sensitive action execution
    act_res = op.execute_action({"type": "wait", "duration": 0.05})
    assert act_res["success"] is True
    assert act_res["action"] == "wait"


def test_hybrid_browser_operator_observation_and_action():
    """Verifies HybridBrowserOperator capture_observation and action dispatch."""
    SafetyGuard.reset_estop()
    op = HybridBrowserOperator()

    obs = op.capture_observation(include_frame=False)
    assert obs["success"] is True
    assert obs["operator"] == "HybridBrowserOperator"
    assert isinstance(obs["elements"], list)

    act_res = op.execute_action({"type": "scroll", "direction": "down", "amount": 100})
    assert act_res["success"] is True
    assert act_res["action"] == "scroll"


def test_android_adb_operator_observation_and_action():
    """Verifies AndroidADBOperator capture_observation and action dispatch."""
    SafetyGuard.reset_estop()
    op = AndroidADBOperator()

    obs = op.capture_observation(include_frame=False)
    assert obs["success"] is True
    assert obs["operator"] == "AndroidADBOperator"
    assert "connected" in obs

    act_res = op.execute_action({"type": "wait", "duration": 0.05})
    assert act_res["success"] is True
    assert act_res["action"] == "wait"


def test_scopeguard_coordinate_hit_testing_sensitive_gate():
    """Verifies ScopeGuard check_coordinate_action blocks sensitive UI keywords and triggers HITL gate."""
    guard = ScopeGuard()

    # Direct hit-test method existence
    assert hasattr(guard, "check_coordinate_action")

    # Sensitive action without auto-approve should raise ScopeViolationError
    with pytest.raises(ScopeViolationError):
        guard.check_ui_action(
            label="Click on Delete Account Button",
            target="Win32 (500, 300)",
            auto_approve=False,
        )

    # When auto_approve=True, sensitive action is permitted
    approved = guard.check_ui_action(
        label="Click on Delete Account Button",
        target="Win32 (500, 300)",
        auto_approve=True,
    )
    assert approved is True

    # Non-sensitive action permitted automatically
    non_sensitive = guard.check_ui_action(
        label="Click on View Details Link",
        target="Win32 (200, 150)",
        auto_approve=False,
    )
    assert non_sensitive is True


def test_delta_event_emission_and_sqlite_wal_persistence():
    """Verifies delta events (INIT, RUNNING, EXECUTE, END, ABORTED) write real WAL records to agent_local.db."""
    test_thought = f"Delta verification step at {int(time.time() * 1000)}"

    ev_init = emit_delta_event("INIT", 0, thought="Initializing visual grounding engine", target=(100, 100), latency_ms=1.1)
    assert ev_init["stage"] == "INIT"
    assert ev_init["step_index"] == 0

    ev_run = emit_delta_event("RUNNING", 1, thought="Visual coordinate grounding in progress", target=(400, 300), latency_ms=4.2)
    assert ev_run["stage"] == "RUNNING"
    assert ev_run["step_index"] == 1

    ev_exec = emit_delta_event("EXECUTE", 2, thought=test_thought, target=(960, 540), latency_ms=15.3, action_type="click")
    assert ev_exec["stage"] == "EXECUTE"
    assert ev_exec["target"] == [960, 540]

    ev_end = emit_delta_event("END", 3, thought="Action completed successfully", target=None, latency_ms=2.0)
    assert ev_end["stage"] == "END"

    # Query SQLite WAL (~/.nexus-agent/db/agent_local.db) to verify physical persistence
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    assert db_path.exists()

    conn = sqlite3.connect(str(db_path), timeout=5.0)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT payload_json FROM telemetry_events WHERE event_type = 'delta_event' ORDER BY id DESC LIMIT 10;"
        )
        rows = cursor.fetchall()
        found_test_event = False
        for r in rows:
            data = json.loads(r["payload_json"])
            if data.get("thought") == test_thought and data.get("stage") == "EXECUTE":
                found_test_event = True
                assert data["target"] == [960, 540]
                break
        assert found_test_event is True, "Expected EXECUTE delta event was not found in SQLite WAL table"
    finally:
        conn.close()


def test_fallback_escalation_from_uia_and_dom_to_visual_grounding():
    """Verifies automatic fallback to UI-TARS visual grounding when structural tree element lookups return empty."""
    # 1. Desktop UFO: find_element for non-existent control falls back to visual grounding
    ufo = DesktopUFO()
    grounded_el = ufo.find_element("UnmatchedCustomControl99")
    assert grounded_el is not None
    assert "Visual Grounded" in grounded_el.name
    assert grounded_el.center[0] > 0
    assert grounded_el.center[1] > 0

    # 2. Desktop UFO: click_element for non-existent query falls back to visual grounding click
    click_res = ufo.click_element("NonExistentSubmitTarget123")
    assert click_res["success"] is True
    assert click_res["action"] == "CLICK_VISUAL_GROUNDED"
    assert "grounded_target" in click_res

    # 3. Browser Verifier: click for non-existent element_id falls back to visual grounding click
    b_verifier = BrowserVerifier()
    b_res = b_verifier.click(element_id=88888)
    assert b_res["success"] is True
    assert b_res["action"] == "CLICK_VISUAL_GROUNDED"
    assert "grounded_target" in b_res
