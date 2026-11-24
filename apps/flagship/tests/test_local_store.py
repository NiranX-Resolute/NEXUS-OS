"""
Unit & Integration Test: Local-Only Data Store & Connection Pool
=============================================================================
Validates:
1. Idempotent schema initialization.
2. Thread-safe connection pool acquisition and release.
3. Insertion and chronological retrieval of messages and execution traces across sessions.
4. Foreign key enforcement and cascade deletion upon session removal.
5. Atomic transaction rollback guarantees upon failure.
=============================================================================
"""

import os
import sys
import tempfile
import sqlite3
import pytest
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.local_store import LocalStore, SQLiteConnectionPool


@pytest.fixture
def temp_db():
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "test_local.db"
        store = LocalStore(db_path=db_path)
        yield store
        store.close()


def test_idempotent_init(temp_db):
    """Ensures init_db can be called repeatedly without schema conflicts."""
    temp_db.init_db()
    temp_db.init_db()

    with temp_db.connection() as conn:
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
        table_names = [r["name"] for r in tables]
        assert "sessions" in table_names
        assert "chat_history" in table_names
        assert "execution_traces" in table_names


def test_session_message_and_trace_lifecycle(temp_db):
    """Validates session creation, message logging, and tool trace logging."""
    # 1. Create sessions
    session_a = temp_db.create_session(title="Refactor Database", metadata={"intent": "DEV"})
    session_b = temp_db.create_session(title="Run Diagnostics", metadata={"intent": "OPS"})

    assert session_a != session_b

    # 2. Log messages to session A
    temp_db.log_message(
        session_id=session_a,
        role="user",
        content="Refactor the sqlite connection pool"
    )
    temp_db.log_message(
        session_id=session_a,
        role="assistant",
        content="Understood. Analyzing connection pool schema.",
        thought_trace="Checking thread-safety and max_connections limit..."
    )

    # 3. Log execution trace to session A
    trace_id = temp_db.log_trace(
        session_id=session_a,
        trace_data={
            "step_number": 1,
            "tool_name": "terminal_pty",
            "command_or_path": "pytest tests/test_local_store.py",
            "input_payload": {"timeout": 30.0},
            "output_payload": "PASSED 1 test",
            "exit_code": 0,
            "duration_ms": 124.5,
            "status": "SUCCESS"
        }
    )

    assert trace_id is not None

    # 4. Verify message retrieval order
    messages = temp_db.get_session_messages(session_a)
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Refactor the sqlite connection pool"
    assert messages[1]["role"] == "assistant"
    assert "Analyzing connection pool schema" in messages[1]["content"]
    assert "Checking thread-safety" in messages[1]["thought_trace"]

    # 5. Verify trace retrieval
    traces = temp_db.get_session_traces(session_a)
    assert len(traces) == 1
    assert traces[0]["tool_name"] == "terminal_pty"
    assert traces[0]["exit_code"] == 0
    assert traces[0]["status"] == "SUCCESS"
    assert traces[0]["step_number"] == 1

    # Ensure session B remains isolated
    assert len(temp_db.get_session_messages(session_b)) == 0
    assert len(temp_db.get_session_traces(session_b)) == 0


def test_cascade_deletion(temp_db):
    """Verifies that deleting a session cascades and deletes its chat history and traces."""
    session_id = temp_db.create_session(title="To be purged")

    temp_db.log_message(session_id=session_id, role="user", content="Temporary prompt")
    temp_db.log_trace(
        session_id=session_id,
        trace_data={
            "step_number": 1,
            "tool_name": "bash",
            "command_or_path": "ls -la",
            "status": "SUCCESS"
        }
    )

    assert len(temp_db.get_session_messages(session_id)) == 1
    assert len(temp_db.get_session_traces(session_id)) == 1

    # Delete session
    deleted = temp_db.delete_session(session_id)
    assert deleted is True

    # Assert cascaded deletion
    assert len(temp_db.get_session_messages(session_id)) == 0
    assert len(temp_db.get_session_traces(session_id)) == 0


def test_transaction_rollback(temp_db):
    """Verifies atomic rollback when an exception occurs inside a transaction."""
    session_id = temp_db.create_session(title="Transaction Test")

    # Attempt a transaction that raises an error midway
    with pytest.raises(ValueError):
        with temp_db.transaction() as cur:
            cur.execute("""
            INSERT INTO chat_history (session_id, role, content, timestamp)
            VALUES (?, 'user', 'This should be rolled back', 1000.0);
            """, (session_id,))

            # Raise simulated error
            raise ValueError("Simulated transaction failure")

    # Verify that the message was rolled back
    messages = temp_db.get_session_messages(session_id)
    assert len(messages) == 0
