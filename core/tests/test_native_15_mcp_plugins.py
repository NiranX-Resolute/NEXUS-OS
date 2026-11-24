"""Nexus OS v5.0 - Integration & Unit Test Suite for All 15 Native MCP Extension Modules.

Tests and validates:
1. video_screen_summarizer
2. desktop_tidier
3. bill_to_reminder_scan
4. subscription_radar
5. fridge_dinner_planner
6. excel_expense_writer
7. disk_map_analyzer
8. live_subtitle_stream
9. smart_light_control
10. printer_3d_status
11. game_steam_updater
12. web_grounded_brief
13. calendar_manage
14. ui_hologram_control
15. android_adb_control
"""

import os
from pathlib import Path
import pytest
import time

from core.mcp.plugins.video_screen_summarizer import video_screen_summarizer
from core.mcp.plugins.desktop_tidier import desktop_tidier
from core.mcp.plugins.bill_to_reminder_scan import bill_to_reminder_scan
from core.mcp.plugins.subscription_radar import subscription_radar
from core.mcp.plugins.fridge_dinner_planner import fridge_dinner_planner
from core.mcp.plugins.excel_expense_writer import excel_expense_writer
from core.mcp.plugins.disk_map_analyzer import disk_map_analyzer
from core.mcp.plugins.live_subtitle_stream import live_subtitle_stream
from core.mcp.plugins.smart_light_control import smart_light_control
from core.mcp.plugins.printer_3d_status import printer_3d_status
from core.mcp.plugins.game_steam_updater import game_steam_updater
from core.mcp.plugins.web_grounded_brief import web_grounded_brief
from core.mcp.plugins.calendar_manage import calendar_manage
from core.mcp.plugins.ui_hologram_control import ui_hologram_control
from core.mcp.plugins.android_adb_control import android_adb_control


def test_01_video_screen_summarizer(tmp_path):
    # Test with history action first
    res = video_screen_summarizer(video_path="", action="history")
    assert res["success"] is True
    assert "summaries" in res

    # Create dummy video container
    fake_vid = tmp_path / "test_demo_recording.mp4"
    fake_vid.write_bytes(b"\x00" * 1024 * 50)
    res2 = video_screen_summarizer(video_path=str(fake_vid), action="summarize")
    assert res2["success"] is True
    assert res2["frames_analyzed"] > 0
    assert "summary" in res2


def test_02_desktop_tidier(tmp_path):
    # Create mock clutter files
    (tmp_path / "report.pdf").write_text("dummy pdf", encoding="utf-8")
    (tmp_path / "screenshot_2026.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (tmp_path / "setup.exe").write_bytes(b"MZ\x90")

    # Scan
    res_scan = desktop_tidier(action="scan", target_dir=str(tmp_path))
    assert res_scan["success"] is True
    assert res_scan["clutter_count"] >= 3

    # Categories
    res_cats = desktop_tidier(action="categories")
    assert res_cats["success"] is True
    assert "Documents" in res_cats["categories"]


def test_03_bill_to_reminder_scan():
    raw_bill = """
    ACME Electric Utility
    Account #: 98124-771
    Invoice Date: 2026-11-15
    Payment Due Date: 2026-12-05
    Total Amount Due: $142.50
    """
    res = bill_to_reminder_scan(action="scan", raw_text=raw_bill)
    assert res["success"] is True
    assert res["amount"] == 142.50
    assert res["due_date_iso"] == "2026-12-05"
    assert res["calendar_reminder_set"] is True

    # List bills
    res_list = bill_to_reminder_scan(action="list")
    assert res_list["success"] is True
    assert res_list["count"] >= 1


def test_04_subscription_radar():
    res_add = subscription_radar(
        action="add",
        name="Test SaaS Service",
        cost=19.99,
        currency="USD",
        billing_cycle="monthly",
        category="DevTools",
        renewal_day=15,
    )
    assert res_add["success"] is True

    res_audit = subscription_radar(action="audit")
    assert res_audit["success"] is True
    assert res_audit["monthly_burn"] >= 19.99
    assert res_audit["annual_burn"] >= 19.99 * 12


def test_05_fridge_dinner_planner():
    # Add ingredients
    res_add = fridge_dinner_planner(
        action="add_ingredients",
        ingredients=["chicken", "jasmine rice", "soy sauce", "garlic"],
    )
    assert res_add["success"] is True

    # Generate plan
    res_plan = fridge_dinner_planner(action="generate_plan")
    assert res_plan["success"] is True
    assert len(res_plan["recommended_recipes"]) > 0
    top_recipe = res_plan["recommended_recipes"][0]
    assert "chicken" in top_recipe["title"].lower() or top_recipe["match_score"] > 0


def test_06_excel_expense_writer():
    res_rec = excel_expense_writer(
        action="record_expense",
        vendor="Cloudflare DNS",
        amount=20.00,
        category="Infrastructure",
        description="Workers Paid plan",
        is_tax_deductible=True,
    )
    assert res_rec["success"] is True
    assert res_rec["amount"] == 20.00
    assert Path(res_rec["ledger_path"]).exists()

    res_sum = excel_expense_writer(action="summary")
    assert res_sum["success"] is True
    assert res_sum["total_spend"] >= 20.00


def test_07_disk_map_analyzer():
    res = disk_map_analyzer(action="analyze_drive", target_path="C:\\")
    assert res["success"] is True
    assert res["capacity_gb"] > 0
    assert "percent_used" in res

    res_cache = disk_map_analyzer(action="cache_audit")
    assert res_cache["success"] is True
    assert "reclaimable_targets" in res_cache


def test_08_live_subtitle_stream():
    res_start = live_subtitle_stream(action="start", source="microphone")
    assert res_start["success"] is True
    assert res_start["is_streaming"] is True

    res_push = live_subtitle_stream(
        action="push_chunk",
        text_chunk="Nexus OS system architecture initialized cleanly.",
        speaker="NiranX",
    )
    assert res_push["success"] is True

    res_hist = live_subtitle_stream(action="history")
    assert res_hist["success"] is True
    assert any("Nexus OS" in item["text"] for item in res_hist["subtitles"])

    res_stop = live_subtitle_stream(action="stop")
    assert res_stop["success"] is True
    assert res_stop["is_streaming"] is False


def test_09_smart_light_control():
    res_scene = smart_light_control(action="scene", scene="cyberpunk_cyan")
    assert res_scene["success"] is True
    assert res_scene["hex_color"] == "#00f0ff"
    assert res_scene["brightness"] == 90

    res_custom = smart_light_control(action="set_brightness", brightness=75)
    assert res_custom["success"] is True
    assert res_custom["brightness"] == 75


def test_10_printer_3d_status():
    res = printer_3d_status(action="status")
    assert res["success"] is True
    assert "printer_state" in res
    assert "nozzle_temp_c" in res
    assert "bed_temp_c" in res


def test_11_game_steam_updater():
    res = game_steam_updater(action="list_installed")
    assert res["success"] is True
    assert "games_count" in res
    assert "total_disk_gb" in res


def test_12_web_grounded_brief():
    # Test empty query error handling
    res = web_grounded_brief(query="")
    assert res["success"] is False


def test_13_calendar_manage():
    res = calendar_manage(action="list")
    assert res["success"] is True
    assert "events" in res


def test_14_ui_hologram_control():
    res = ui_hologram_control(action="status")
    assert res["success"] is True
    assert "ui_state" in res
    assert "reactor_shape" in res["ui_state"]

    res_mutate = ui_hologram_control(action="mutate", color="#00f0ff", shape="dyson")
    assert res_mutate["success"] is True
    assert res_mutate["ui_state"]["reactor_color"] == "#00f0ff"


def test_15_android_adb_control():
    res = android_adb_control(action="status")
    assert res["success"] is True
    assert "connected" in res
    assert "devices" in res
