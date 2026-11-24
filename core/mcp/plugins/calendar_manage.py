"""Nexus OS v5.0 - Local & Google Calendar Management Plugin.

Re-exports calendar_manage from core.mcp.plugins.google_calendar_plugin for 1:1 module parity.
"""

from __future__ import annotations

from core.mcp.plugins.google_calendar_plugin import calendar_manage

__all__ = ["calendar_manage"]
