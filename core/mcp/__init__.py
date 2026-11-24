"""
Nexus OS v5.0 - Production-Ready MCP Bus & Ecosystem
=============================================================================
Model Context Protocol (MCP) tooling and dynamic tool synthesis infrastructure:
- ObscuraStealthBrowser: Stealth Chromium CDP scraper and headless web explorer.
- ToolSynthesizer: Dynamic runtime tool compiler and AST validation engine.
- NexusMCPBus: Unified FastMCP bus connecting filesystem, git, and custom tools.
=============================================================================
"""

from .obscura_mcp_server import ObscuraStealthBrowser, ensure_obscura_running
from .tool_synthesizer import ToolSynthesizer
from .mcp_bus import NexusMCPBus, create_mcp_bus

__all__ = [
    "ObscuraStealthBrowser",
    "ensure_obscura_running",
    "ToolSynthesizer",
    "NexusMCPBus",
    "create_mcp_bus",
]
