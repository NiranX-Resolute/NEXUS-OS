"""Nexus OS v5.0 - Web Grounded Intelligence Brief Plugin.

Re-exports web_grounded_brief from core.mcp.plugins.web_grounded_search for 1:1 module parity.
"""

from __future__ import annotations

from core.mcp.plugins.web_grounded_search import web_grounded_brief

__all__ = ["web_grounded_brief"]
