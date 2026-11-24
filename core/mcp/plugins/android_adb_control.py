"""Nexus OS v5.0 - Android ADB Device Control Plugin.

Re-exports android_adb_control from core.mcp.plugins.android_adb_plugin for 1:1 module parity.
"""

from __future__ import annotations

from core.mcp.plugins.android_adb_plugin import android_adb_control

__all__ = ["android_adb_control"]
