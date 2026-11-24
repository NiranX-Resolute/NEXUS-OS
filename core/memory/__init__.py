"""Nexus OS v5.0 - Core Memory Package.

Provides local-first data sovereignty store (WAL mode, FTS5, sqlite-vec)
and DSPy MIPROv2 prompt optimization.
"""

from .sovereign_store import SovereignMemoryStore
from .dspy_optimizer import DSPyMIPROv2Optimizer
from .cloud_sync import CloudMemorySyncAdapter

__all__ = [
    "SovereignMemoryStore",
    "DSPyMIPROv2Optimizer",
    "CloudMemorySyncAdapter",
]
