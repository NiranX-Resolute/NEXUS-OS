"""
Tests for DesktopUFO Sub-30ms UI Automation Engine
"""
import sys
import time
import pytest
from core.engine.tools.desktop_ufo import (
    DesktopUFO,
    DesktopUFOInspector,
    UIControlElement,
    get_element_at_cursor,
    walk_window_children,
    click_at,
    send_keystrokes,
    inspect_active_window,
    get_foreground_window_info,
)


def test_desktop_ufo_class_instantiation():
    ufo = DesktopUFO()
    assert ufo is not None
    assert issubclass(DesktopUFOInspector, DesktopUFO) or DesktopUFOInspector is DesktopUFO


def test_get_element_at_cursor_speed():
    t0 = time.perf_counter()
    res = get_element_at_cursor()
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert isinstance(res, dict)
    assert "cursor" in res
    assert "hwnd" in res
    assert "control_type" in res
    assert "latency_ms" in res
    # Ensure sub-30ms execution path
    assert elapsed_ms < 30.0, f"Execution took {elapsed_ms}ms, expected < 30ms"


def test_walk_window_children():
    fg = get_foreground_window_info()
    hwnd = fg.get("hwnd", 0)
    if hwnd:
        t0 = time.perf_counter()
        elements = walk_window_children(hwnd)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        assert isinstance(elements, list)
        assert elapsed_ms < 30.0, f"walk_window_children took {elapsed_ms}ms, expected < 30ms"
        if elements:
            assert isinstance(elements[0], UIControlElement)
            d = elements[0].to_dict()
            assert "bounding_box" in d
            assert "center" in d


def test_send_keystrokes():
    t0 = time.perf_counter()
    # Test typing empty / space / special keystrokes
    res = send_keystrokes("")
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert res["success"] is True
    assert elapsed_ms < 30.0


def test_click_at():
    t0 = time.perf_counter()
    cursor = get_element_at_cursor().get("cursor", [100, 100])
    # Click at current cursor to avoid moving focus unexpectedly
    res = click_at(cursor[0], cursor[1], button="left", clicks=1)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert res["success"] is True
    assert res["x"] == cursor[0]
    assert res["y"] == cursor[1]
    assert elapsed_ms < 30.0


def test_desktop_ufo_object_methods():
    ufo = DesktopUFO()
    cur = ufo.get_element_at_cursor()
    assert cur["success"] is True

    keys_res = ufo.send_keys("")
    assert keys_res["success"] is True

    elements = ufo.get_ui_elements()
    assert isinstance(elements, list)
