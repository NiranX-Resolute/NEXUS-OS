"""
Nexus OS v5.0 - Torvis & Stonic Utility Suite & Auto-Plugin Loader Verification Suite
=============================================================================
Tests:
1. Auto-discovery of @nexus_tool plugins from core/mcp/plugins/*.py and registration.
2. WorkspaceGovernor [SILENT] air-gap enforcement blocking external/device tools while
   permitting local offline tools.
3. ScopeGuard enforcement on destructive operations and approval-required tools.
4. Real execution & output (zero mocks, real SQLite WAL ~/.nexus-agent/db/agent_local.db):
   - excel_expense_writer (.xlsx / .csv generation with category totals)
   - disk_map_analyzer (real directory tree & large file analysis with ScopeGuard check)
   - subscription_radar (real subscription tracking & monthly/annual burn audit)
   - bill_to_reminder_scan (real OCR text parsing, entity extraction, calendar cache sync)
   - fridge_dinner_planner (real recipe planning from local pantry stock)
   - video_screen_summarizer (real executive summary and quiz mode generation)
=============================================================================
"""

import os
import sys

# Inhibit background pip attempts during test execution
os.environ["NEXUS_SKIP_DEP_INSTALL"] = "1"

import json
from pathlib import Path
import sqlite3
import pytest

from core.mcp.plugin_loader import (
    load_all_plugins,
    REGISTERED_TOOLS,
    wrap_tool_with_governance,
)
from core.mcp.plugins.torvis_suite_plugins import (
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
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError
from core.runtime.reflex_router import get_reflex_router, execute_reflex


@pytest.fixture(autouse=True)
def ensure_clean_governor_mode():
    """Ensure governor is always reset to DEV after every test."""
    gov = WorkspaceGovernor()
    gov.set_mode("DEV")
    yield
    gov.set_mode("DEV")


def test_01_plugin_loader_autodiscovery():
    """Verify load_all_plugins discovers all tools from torvis_suite_plugins and core plugins."""
    tools = load_all_plugins()
    assert isinstance(tools, dict)
    assert len(tools) >= 10

    expected_tools = [
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
    for tool_name in expected_tools:
        assert tool_name in tools, f"Expected tool '{tool_name}' not found in REGISTERED_TOOLS."
        record = tools[tool_name]
        assert record["name"] == tool_name
        assert "description" in record and len(record["description"]) > 0
        assert callable(record["callable"])
        assert callable(record["secured_callable"])

    # Verify tools registered in sub-50ms reflex router
    router = get_reflex_router()
    registered_names = [name for _, name, _, _ in router._reflex_registry]
    for tool_name in ["excel_expense_writer", "disk_map_analyzer", "subscription_radar"]:
        assert tool_name in registered_names, f"Tool '{tool_name}' missing from reflex router registry."


def test_02_silent_mode_blocking_external_and_device_tools():
    """Verify WorkspaceGovernor [SILENT] air-gap blocks external/device tools but allows local tools."""
    tools = load_all_plugins()
    gov = WorkspaceGovernor()

    # Switch to air-gapped SILENT mode
    gov.set_mode("SILENT")
    assert gov.get_mode().upper() == "SILENT"

    # 1. External Network & Device Tools MUST raise PermissionError
    external_tools = ["smart_light_control", "printer_3d_status", "live_subtitle_stream"]
    for ext_name in external_tools:
        secured_fn = tools[ext_name]["secured_callable"]
        with pytest.raises(PermissionError) as exc_info:
            secured_fn()
        assert "SILENT air-gapped mode" in str(exc_info.value)

    # 2. Local offline tools MUST execute cleanly in SILENT mode
    local_expense_fn = tools["excel_expense_writer"]["secured_callable"]
    res_local = local_expense_fn(action="summary")
    assert res_local["success"] is True

    local_disk_fn = tools["disk_map_analyzer"]["secured_callable"]
    res_disk = local_disk_fn(action="analyze_drive", root_path="C:\\")
    assert res_disk["success"] is True

    # Restore DEV mode
    gov.set_mode("DEV")
    assert gov.get_mode().upper() == "DEV"


def test_03_scope_guard_hitl_and_approval_checks():
    """Verify ScopeGuard enforcement on approval-required tools and destructive operations."""
    tools = load_all_plugins()

    # 1. game_steam_updater has requires_approval=True
    steam_tool = tools["game_steam_updater"]
    assert steam_tool["requires_approval"] is True

    # Calling secured_callable on approval-required tool raises ScopeViolationError under HITL policy
    secured_steam = steam_tool["secured_callable"]
    with pytest.raises(ScopeViolationError) as exc_info:
        secured_steam(action="update")
    assert "HITL BLOCKED" in str(exc_info.value) or "requires interactive Allow / Deny" in str(exc_info.value)

    # Calling raw underlying callable directly executes inspection safely
    raw_steam = steam_tool["callable"]
    res = raw_steam(action="check")
    assert res["success"] is True


def test_04_excel_expense_writer_real_execution(tmp_path):
    """Verify real .csv/.xlsx expense writer execution with rows_json and category totals."""
    out_csv = tmp_path / "monthly_expenses.csv"
    sample_rows = json.dumps([
        {"date_iso": "2026-11-20", "vendor": "Cloudflare", "amount": 20.00, "category": "Infrastructure"},
        {"date_iso": "2026-11-21", "vendor": "Google Cloud", "amount": 45.50, "category": "Infrastructure"},
        {"date_iso": "2026-11-22", "vendor": "GitHub Copilot", "amount": 19.00, "category": "DevTools"},
        {"date_iso": "2026-11-23", "vendor": "Whole Foods", "amount": 32.10, "category": "Groceries"},
    ])

    res = excel_expense_writer(
        output_path=str(out_csv),
        rows_json=sample_rows,
        action="record_expense",
    )

    assert res["success"] is True
    assert out_csv.exists()
    assert res["total_records"] >= 4
    assert res["total_spend"] >= 116.60

    # Verify category totals in result envelope
    cat_totals = res["category_totals"]
    assert "Infrastructure" in cat_totals
    assert cat_totals["Infrastructure"] >= 65.50
    assert "DevTools" in cat_totals
    assert cat_totals["DevTools"] >= 19.00

    # Verify physical file contents
    content = out_csv.read_text(encoding="utf-8")
    assert "ID,Date,Vendor,Category,Description,Amount,Currency,Tax Deductible" in content
    assert "Cloudflare" in content
    assert "CATEGORYTotals" in content or "CATEGORY" in content
    assert "GRAND TOTAL" in content

    # Verify SQLite WAL persistence
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    assert db_path.exists()
    with sqlite3.connect(str(db_path)) as conn:
        row = conn.execute("SELECT COUNT(*) FROM expense_ledger WHERE vendor = 'Cloudflare';").fetchone()
        assert row[0] >= 1


def test_05_disk_map_analyzer_real_execution(tmp_path):
    """Verify real directory tree size analysis and large file listing with ScopeGuard path check."""
    # Create test dummy files
    sub_dir = tmp_path / "nexus_sample_dir"
    sub_dir.mkdir()
    (sub_dir / "small_text.txt").write_text("Nexus OS", encoding="utf-8")
    large_bin = sub_dir / "large_payload.bin"
    # Write 2MB payload
    large_bin.write_bytes(b"\x00" * (1024 * 1024 * 2))

    res = disk_map_analyzer(
        root_path=str(sub_dir),
        action="analyze_drive",
        min_size_mb=1.0,
        max_results=5,
    )

    assert res["success"] is True
    assert res["root_path"] == str(sub_dir.resolve())
    assert res["total_gb"] >= 0
    assert "percent_used" in res
    assert isinstance(res["large_files"], list)
    assert len(res["large_files"]) >= 1
    assert res["large_files"][0]["name"] == "large_payload.bin"
    assert res["large_files"][0]["size_mb"] >= 1.9
    assert isinstance(res["reclaimable_caches"], list)


def test_06_subscription_radar_real_execution():
    """Verify real SaaS subscription detection and monthly/annual burn calculation in SQLite WAL."""
    res_add = subscription_radar(
        action="add",
        name="Nexus Edge Cloudflare Workers",
        cost=5.00,
        currency="USD",
        billing_cycle="monthly",
        category="Infrastructure",
        renewal_day=1,
    )
    assert res_add["success"] is True
    assert res_add["cost"] == 5.00

    res_audit = subscription_radar(action="audit")
    assert res_audit["success"] is True
    assert res_audit["active_subscriptions_count"] >= 1
    assert res_audit["monthly_burn"] >= 5.00
    assert res_audit["annual_burn"] >= 60.00
    assert any(s["name"] == "Nexus Edge Cloudflare Workers" for s in res_audit["subscriptions"])

    # Verify SQLite WAL table
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    with sqlite3.connect(str(db_path)) as conn:
        row = conn.execute("SELECT cost, billing_cycle FROM subscription_radar WHERE name = 'Nexus Edge Cloudflare Workers';").fetchone()
        assert row is not None
        assert row[0] == 5.00
        assert row[1] == "monthly"


def test_07_bill_to_reminder_scan_real_execution():
    """Verify real OCR text extraction of vendor, amount, due date and reminder creation."""
    raw_statement = """
    PACIFIC GAS & ELECTRIC
    Account #: 4429-8812-01
    Statement Date: 2026-11-10
    Payment Due Date: 2026-12-18
    Total Amount Due: $150.00
    Please pay before due date to avoid late penalty.
    """

    res = bill_to_reminder_scan(
        raw_text=raw_statement,
        action="scan",
    )

    assert res["success"] is True
    assert res["amount"] == 150.00
    assert res["due_date_iso"] == "2026-12-18"
    assert res["calendar_reminder_set"] is True
    assert "PACIFIC GAS & ELECTRIC" in res["vendor"]
    assert "cal_event_id" in res or "calendar_event_id" in res

    # Verify reminder saved in bills_reminders and calendar_events_cache SQLite WAL tables
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    with sqlite3.connect(str(db_path)) as conn:
        bill_row = conn.execute("SELECT amount, due_date_iso, status FROM bills_reminders WHERE bill_id = ?;", (res["bill_id"],)).fetchone()
        assert bill_row is not None
        assert bill_row[0] == 150.00
        assert bill_row[1] == "2026-12-18"
        assert bill_row[2] == "PENDING"

        cal_row = conn.execute("SELECT summary, start_iso FROM calendar_events_cache WHERE event_id = ?;", (res["calendar_event_id"],)).fetchone()
        assert cal_row is not None
        assert "150.00" in cal_row[0]


def test_08_fridge_dinner_planner_real_execution():
    """Verify real recipe generation from local pantry stock."""
    # Add pantry items
    res_add = fridge_dinner_planner(
        action="add_ingredients",
        ingredients=["chicken", "jasmine rice", "garlic", "soy sauce"],
    )
    assert res_add["success"] is True
    assert res_add["count"] == 4

    # Generate plan
    res_plan = fridge_dinner_planner(action="generate_plan")
    assert res_plan["success"] is True
    assert res_plan["available_ingredients_count"] >= 4
    assert len(res_plan["recommended_recipes"]) > 0

    top_recipe = res_plan["recommended_recipes"][0]
    assert top_recipe["match_score"] > 0
    assert len(top_recipe["instructions"]) >= 3


def test_09_video_screen_summarizer_real_execution():
    """Verify real video screen summarizer in summary and quiz modes."""
    # 1. Summary mode
    res_sum = video_screen_summarizer(
        url_or_path="nexus_demo_recording.mp4",
        mode="summary",
    )
    assert res_sum["success"] is True
    assert res_sum["mode"] == "summary"
    assert len(res_sum["summary"]) > 0
    assert len(res_sum["topics"]) >= 2
    assert len(res_sum["key_events"]) >= 2

    # 2. Quiz mode
    res_quiz = video_screen_summarizer(
        url_or_path="nexus_demo_recording.mp4",
        mode="quiz",
    )
    assert res_quiz["success"] is True
    assert res_quiz["mode"] == "quiz"
    assert len(res_quiz["quiz_questions"]) == 2
    for q in res_quiz["quiz_questions"]:
        assert "question" in q
        assert "options" in q and len(q["options"]) == 4
        assert "correct_option" in q
