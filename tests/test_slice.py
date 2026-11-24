"""Nexus OS v5.0 - Infinity Bounded Slice Engine Test Suite.

Verifies:
1. suspend_slice inserts slice state into SQLite with status SUSPENDED.
2. wake_slice hydrates the state in <2ms with injected event.
"""

from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path
import pytest

from core.slice.engine import InfinitySliceEngine


@pytest.fixture
def temp_db() -> Path:
    """Creates a temporary SQLite database path for isolation."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_file = Path(tf.name)
    yield db_file
    if db_file.exists():
        try:
            db_file.unlink()
        except Exception:
            pass


@pytest.fixture
def slice_engine(temp_db: Path) -> InfinitySliceEngine:
    """Returns an InfinitySliceEngine backed by temp SQLite database."""
    return InfinitySliceEngine(db_path=temp_db)


def test_suspend_slice_inserts_to_sqlite(slice_engine: InfinitySliceEngine, temp_db: Path) -> None:
    """Verifies suspend_slice serializes and inserts state to SQLite."""
    slice_id = "slice_calc_99"
    state_payload = {
        "execution_step": 4,
        "variables": {"x": 42, "y": 100},
        "completed_milestones": ["M1_INIT", "M2_PARSE"],
    }

    success = slice_engine.suspend_slice(slice_id, state_payload)
    assert success is True

    # Directly verify SQLite row persistence
    conn = sqlite3.connect(str(temp_db))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM slices WHERE slice_id = ?", (slice_id,)).fetchone()
    conn.close()

    assert row is not None
    assert row["slice_id"] == slice_id
    assert row["status"] == "SUSPENDED"
    assert '"x":42' in row["state_blob"] or '"x": 42' in row["state_blob"]
    assert row["updated_at"] > 0


def test_wake_slice_hydrates_under_2ms_with_injected_event(slice_engine: InfinitySliceEngine) -> None:
    """Verifies that wake_slice hydrates slice state in < 2ms with an injected event."""
    slice_id = "slice_realtime_01"
    initial_state = {
        "phase": "EXECUTION",
        "agent_id": "nexus-primary",
        "accumulator": 128,
    }

    # Suspend first
    slice_engine.suspend_slice(slice_id, initial_state)

    # Wake with injected event and measure latency
    injected_event = {
        "event_id": "evt_override_77",
        "type": "USER_INTERRUPT",
        "priority": "HIGH",
    }

    t0 = time.perf_counter()
    result = slice_engine.wake_slice(slice_id, injected_event=injected_event)
    total_elapsed_ms = (time.perf_counter() - t0) * 1000.0

    assert result["slice_id"] == slice_id
    assert result["status"] == "ACTIVE"
    assert result["state"]["phase"] == "EXECUTION"
    assert result["state"]["accumulator"] == 128
    assert result["state"]["last_injected_event"] == injected_event
    assert injected_event in result["state"]["events"]

    # Strict performance assertion: engine recorded latency must be < 2.0ms
    assert result["hydration_latency_ms"] < 2.0
    # Overall roundtrip elapsed time guard
    assert total_elapsed_ms < 10.0


def test_wake_nonexistent_slice_raises_key_error(slice_engine: InfinitySliceEngine) -> None:
    """Verifies that waking an unknown slice raises KeyError."""
    with pytest.raises(KeyError):
        slice_engine.wake_slice("nonexistent_slice_uuid")


if __name__ == "__main__":
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)
    try:
        engine = InfinitySliceEngine(db_path=db_path)
        test_suspend_slice_inserts_to_sqlite(engine, db_path)
        test_wake_slice_hydrates_under_2ms_with_injected_event(engine)
        test_wake_nonexistent_slice_raises_key_error(engine)
        print("ALL INFINITY SLICE TESTS PASSED IN <2ms")
    finally:
        if db_path.exists():
            db_path.unlink()

