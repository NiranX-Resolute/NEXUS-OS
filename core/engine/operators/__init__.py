"""
Nexus OS v5.0 - Unified Operators Package
=============================================================================
Exports BaseOperator and concrete adapters:
- Win32LocalOperator
- HybridBrowserOperator
- AndroidADBOperator
=============================================================================
"""

from .base import AbortSignal, BaseOperator
from .win32_operator import Win32LocalOperator, get_screen_dimensions, get_system_dpi_scale
from .browser_operator import HybridBrowserOperator
from .android_operator import AndroidADBOperator

__all__ = [
    "AbortSignal",
    "BaseOperator",
    "Win32LocalOperator",
    "HybridBrowserOperator",
    "AndroidADBOperator",
    "get_screen_dimensions",
    "get_system_dpi_scale",
]
