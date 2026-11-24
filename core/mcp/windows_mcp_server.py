"""
Nexus OS v5.0 - Windows UI & Browser Actuation FastMCP Server
=============================================================================
Exposes native Windows UIA tree walking, SendInput motor actuation, offline
screen comprehension, and warm DOM-distilled browser control over FastMCP.
Serves SYS-01 (Desktop System Actuator) and SCOUT-01 (Web Scout Actuator)
with strict WorkspaceGovernor and ScopeGuard HITL gating.
=============================================================================
"""

import datetime
import json
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional, Union

# Ensure core and repo root are on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.engine.tools.desktop_ufo import (
    inspect_active_window,
    click_ui_element,
    type_ui_element,
    analyze_screen,
)
from core.engine.tools.browser_verifier import (
    web_visit,
    web_click,
    web_type,
    web_scroll,
    web_extract_markdown,
    get_distilled_elements,
)
from core.runtime.reflex_router import (
    press_key_shortcut,
    switch_to_app_reflex,
    close_app_reflex,
    launch_app_reflex,
    wait_for_window_focus,
    execute_action_batch,
    emit_telemetry_event,
)
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard
from core.mcp.plugin_loader import discover_and_register_plugins, get_registered_tools

logger = logging.getLogger("WindowsActuationServer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [WINDOWS_MCP] %(message)s")

# Import FastMCP or resilient fallback shim
try:
    from mcp.server.fastmcp import FastMCP
    HAS_FASTMCP = True
except ImportError:
    HAS_FASTMCP = False

    class FastMCP:  # type: ignore
        def __init__(self, name: str):
            self.name = name
            self._tools: Dict[str, Any] = {}

        def tool(self):
            def decorator(fn):
                self._tools[fn.__name__] = fn
                return fn
            return decorator

        def run(self):
            print(f"[{self.name}] FastMCP server running with tools: {list(self._tools.keys())}")


mcp = FastMCP("WindowsActuationServer")

# Shared runtime governor & security gate
_governor = WorkspaceGovernor()
_scope_guard = ScopeGuard()


def _assert_actuation_permitted(agent_id: str, action_name: str, target_desc: str = "") -> None:
    """Validates workspace mode and records telemetry pulse."""
    mode = _governor.get_mode().upper()
    if mode == "SILENT":
        raise PermissionError(
            f"[WORKSPACE GOVERNOR] Tool '{action_name}' is strictly blocked in SILENT air-gapped mode."
        )
    if mode == "STUDIO" and agent_id == "SYS-01":
        # Block arbitrary OS commands outside media
        if action_name in ("close_window", "launch_app"):
            raise PermissionError(
                f"[WORKSPACE GOVERNOR] Tool '{action_name}' is blocked in STUDIO mode."
            )

    emit_telemetry_event(
        "circuit_pulse",
        {
            "node": "MCP_SKILLS",
            "active": True,
            "detail": f"{agent_id}::{action_name}",
            "latency_ms": 1.0,
        },
    )


# -----------------------------------------------------------------------------
# SYS-01 Desktop UI Automation Tools
# -----------------------------------------------------------------------------
@mcp.tool()
def uia_inspect_active_window() -> List[Dict[str, Any]]:
    """
    Extracts foreground window title, process name, and numbered interactive UIA controls
    ([1..N] id, name, control_type, value, rect, center) in <30ms without taking screenshots.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "inspect_active_window")
    return inspect_active_window()


@mcp.tool()
def uia_click_element(element_id: int, label: str = "") -> Dict[str, Any]:
    """
    Invokes native UIA InvokePattern or SendInput center click on target UI element.
    Checks ScopeGuard HITL rules for sensitive keywords (send, delete, remove, pay, confirm).
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "click_ui_element", label)
    if label:
        _scope_guard.check_ui_action(label, target="active_window")
    return click_ui_element(element_id)


@mcp.tool()
def uia_type_element(element_id: int, text: str, submit: bool = False) -> Dict[str, Any]:
    """
    Types text into target UI element via native ValuePattern or SendInput cursor injection.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "type_ui_element")
    return type_ui_element(element_id, text, submit=submit)


@mcp.tool()
def uia_analyze_screen(question: str, include_vision: bool = False) -> Dict[str, Any]:
    """
    Performs fast screen comprehension via WinRT offline OCR + UIA text extraction in <50ms.
    Captures visual VLM frame only when include_vision=True or visual comprehension is required.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "analyze_screen")
    return analyze_screen(question, include_vision=include_vision)


@mcp.tool()
def uia_press_shortcut(chord: str) -> Dict[str, Any]:
    """
    Dispatches native Win32 keyboard chord shortcut (e.g. 'ctrl+s', 'alt+f4', 'enter') via SendInput.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "press_shortcut", chord)
    success = press_key_shortcut(chord)
    return {
        "success": success,
        "chord": chord,
        "action": "PRESS_SHORTCUT",
    }


@mcp.tool()
def uia_focus_window(target: str) -> Dict[str, Any]:
    """
    Brings target application window to foreground in <50ms.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "focus_window", target)
    res = switch_to_app_reflex(target)
    return {"success": True, "result": res}


@mcp.tool()
def uia_close_window(target: str) -> Dict[str, Any]:
    """
    Sends WM_CLOSE (0x0010) to close target window.
    Exposed for SYS-01.
    """
    _assert_actuation_permitted("SYS-01", "close_window", target)
    res = close_app_reflex(target)
    return {"success": True, "result": res}


@mcp.tool()
def uia_execute_action_batch(actions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Executes a multi-step action array ([launch, wait_focus, type, shortcut, click_uia, etc.])
    in one continuous Python pass at native Win32 speed.
    Exposed for SYS-01 and SCOUT-01.
    """
    return execute_action_batch(actions, workspace_gov=_governor, scope_guard=_scope_guard)


# -----------------------------------------------------------------------------
# SCOUT-01 Warm Web Actuation Tools
# -----------------------------------------------------------------------------
@mcp.tool()
def scout_web_visit(url: str, timeout_ms: int = 10000) -> Dict[str, Any]:
    """
    Navigates warm browser context to URL, distills visible interactive controls with
    numbered IDs [1..N], and returns element map in <100ms without cold starts.
    Exposed for SCOUT-01.
    """
    _assert_actuation_permitted("SCOUT-01", "web_visit", url)
    return web_visit(url, timeout_ms=timeout_ms)


@mcp.tool()
def scout_web_click(element_id: int, label: str = "") -> Dict[str, Any]:
    """
    Clicks distilled interactive web element by numeric ID in <50ms.
    Checks ScopeGuard HITL rules for sensitive keywords (delete, pay, submit, buy).
    Exposed for SCOUT-01.
    """
    _assert_actuation_permitted("SCOUT-01", "web_click", label)
    if label:
        _scope_guard.check_ui_action(label, target="browser")
    return web_click(element_id)


@mcp.tool()
def scout_web_type(element_id: int, text: str, submit: bool = False) -> Dict[str, Any]:
    """
    Types text into distilled interactive web input by numeric ID in <50ms.
    Exposed for SCOUT-01.
    """
    _assert_actuation_permitted("SCOUT-01", "web_type")
    return web_type(element_id, text, submit=submit)


@mcp.tool()
def scout_web_scroll(direction: str = "down", amount: int = 500) -> Dict[str, Any]:
    """
    Scrolls active page and refreshes visible interactive element map.
    Exposed for SCOUT-01.
    """
    _assert_actuation_permitted("SCOUT-01", "web_scroll")
    return web_scroll(direction=direction, amount=amount)


@mcp.tool()
def scout_web_extract_markdown() -> Dict[str, Any]:
    """
    Extracts clean Markdown text of the currently active page.
    Exposed for SCOUT-01.
    """
    _assert_actuation_permitted("SCOUT-01", "web_extract_markdown")
    md = web_extract_markdown()
    return {"success": True, "markdown": md}


# Auto-discover and register all @nexus_tool plugins from core/mcp/plugins/*.py
discover_and_register_plugins(mcp)


if __name__ == "__main__":
    mcp.run()
