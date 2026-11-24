"""
Nexus Autonomous Engine - Local-Only Storage Engine & SQLite Connection Pool
=============================================================================
Enforces strict 100% local-first data sovereignty. All user prompts,
reasoning traces (<think>), tool invocations, bash/PTY execution logs,
code diffs, and episodic memories reside exclusively on the host filesystem
at ~/.nexus-agent/db/agent_local.db.

No raw conversation logs or prompt context are ever transmitted to remote
cloud instances. Features a thread-safe SQLite connection pool, WAL mode,
foreign key cascades, and atomic transaction guarantees.
=============================================================================
"""

import os
import json
import uuid
import time
import queue
import sqlite3
import threading
import logging
from pathlib import Path
from contextlib import contextmanager
from typing import Dict, Any, List, Optional, Generator

from .config import DB_PATH, ensure_runtime_directories

logger = logging.getLogger("nexus.local_store")


class SQLiteConnectionPool:
    """
    Thread-safe connection pool for SQLite databases.
    Maintains a pool of open connections configured with WAL mode and foreign key enforcement.
    """

    def __init__(self, db_path: Path, max_connections: int = 10, timeout: float = 30.0):
        self.db_path = Path(db_path)
        self.max_connections = max_connections
        self.timeout = timeout
        self._pool: queue.Queue[sqlite3.Connection] = queue.Queue(maxsize=max_connections)
        self._allocated = 0
        self._lock = threading.Lock()
        self._closed = False

    def _create_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=self.timeout,
            check_same_thread=False
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    @contextmanager
    def acquire(self) -> Generator[sqlite3.Connection, None, None]:
        """Acquires a connection from the pool, yielding it in a transactional context."""
        if self._closed:
            raise RuntimeError("Cannot acquire connection from a closed pool")

        conn: Optional[sqlite3.Connection] = None
        try:
            conn = self._pool.get_nowait()
        except queue.Empty:
            with self._lock:
                if self._allocated < self.max_connections:
                    conn = self._create_connection()
                    self._allocated += 1

            if conn is None:
                # Pool is saturated; wait up to timeout
                try:
                    conn = self._pool.get(timeout=self.timeout)
                except queue.Empty:
                    raise TimeoutError("Timed out waiting for available database connection from pool")

        try:
            yield conn
        finally:
            if conn is not None and not self._closed:
                try:
                    self._pool.put_nowait(conn)
                except queue.Full:
                    conn.close()

    def close(self) -> None:
        """Closes all connections in the pool."""
        with self._lock:
            self._closed = True
            while not self._pool.empty():
                try:
                    conn = self._pool.get_nowait()
                    conn.close()
                except queue.Empty:
                    break


class LocalStore:
    """
    Local-first audit and state store guaranteeing zero-cloud data leakage.
    Provides session management, chat histories, execution traces, and tasks.
    """

    def __init__(self, db_path: Optional[Path] = None, max_connections: int = 10):
        if db_path is None:
            ensure_runtime_directories()
            self.db_path = DB_PATH
        else:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._pool = SQLiteConnectionPool(self.db_path, max_connections=max_connections)
        self.init_db()

    @contextmanager
    def connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Provides a managed connection from the pool."""
        with self._pool.acquire() as conn:
            yield conn

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Cursor, None, None]:
        """
        Executes database operations inside an explicit transaction block.
        Rolls back changes automatically upon exception and commits on clean return.
        """
        with self._pool.acquire() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("BEGIN IMMEDIATE;")
                yield cursor
                conn.commit()
            except Exception:
                conn.rollback()
                raise

    def init_db(self) -> None:
        """Initializes all local database schema tables idempotently."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()

            # -------------------------------------------------------------
            # Core Session & Execution Schema (Specification Standard)
            # -------------------------------------------------------------
            cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                created_at REAL NOT NULL,
                title TEXT,
                metadata_json TEXT
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
                content TEXT NOT NULL,
                thought_trace TEXT,
                timestamp REAL NOT NULL
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS execution_traces (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                step_number INTEGER NOT NULL,
                tool_name TEXT NOT NULL,
                command_or_path TEXT,
                input_payload TEXT,
                output_payload TEXT,
                exit_code INTEGER,
                duration_ms REAL,
                status TEXT CHECK(status IN ('RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT')),
                created_at REAL NOT NULL
            );
            """)

            # -------------------------------------------------------------
            # Task & Memory Schema (Orchestrator Backwards Compatibility)
            # -------------------------------------------------------------
            cur.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                intent_type TEXT NOT NULL DEFAULT 'AUTONOMOUS_EXEC',
                status TEXT NOT NULL DEFAULT 'QUEUED',
                duration_sec REAL DEFAULT 0.0,
                summary TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS thought_traces (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                step_id TEXT,
                thought_text TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS tool_executions (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                command_or_args TEXT,
                output TEXT,
                exit_code INTEGER DEFAULT 0,
                success INTEGER DEFAULT 1,
                duration_sec REAL DEFAULT 0.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS code_diffs (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                diff_content TEXT NOT NULL,
                additions INTEGER DEFAULT 0,
                deletions INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
            );
            """)

            cur.execute("""
            CREATE TABLE IF NOT EXISTS episodic_memories (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                memory_key TEXT NOT NULL,
                memory_value TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, memory_key)
            );
            """)

            # Create indexing for rapid time-series querying
            cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_history(session_id, timestamp);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_traces_session ON execution_traces(session_id, step_number);")

            conn.commit()

    # =========================================================================
    # Session & Chat Methods (Specification)
    # =========================================================================

    def create_session(self, title: str = "New Session", metadata: Optional[Dict[str, Any]] = None) -> str:
        """Creates a new session and returns its unique UUID4 identifier."""
        session_id = str(uuid.uuid4())
        created_at = time.time()
        metadata_json = json.dumps(metadata or {})

        with self.transaction() as cur:
            cur.execute("""
            INSERT INTO sessions (session_id, created_at, title, metadata_json)
            VALUES (?, ?, ?, ?);
            """, (session_id, created_at, title, metadata_json))

        return session_id

    def delete_session(self, session_id: str) -> bool:
        """Deletes a session and cascades deletion to chat_history and execution_traces."""
        with self.transaction() as cur:
            cur.execute("DELETE FROM sessions WHERE session_id = ?;", (session_id,))
            return cur.rowcount > 0

    def log_message(
        self,
        session_id: str,
        role: str,
        content: str,
        thought_trace: Optional[str] = None
    ) -> int:
        """
        Appends a conversational or tool turn into the session chat history.
        Enforces foreign key reference to valid sessions.
        """
        valid_roles = ('user', 'assistant', 'system', 'tool')
        if role not in valid_roles:
            raise ValueError(f"Invalid role '{role}'. Role must be one of {valid_roles}")

        timestamp = time.time()
        with self.transaction() as cur:
            cur.execute("""
            INSERT INTO chat_history (session_id, role, content, thought_trace, timestamp)
            VALUES (?, ?, ?, ?, ?);
            """, (session_id, role, content, thought_trace, timestamp))
            return cur.lastrowid or 0

    def log_trace(self, session_id: str, trace_data: Dict[str, Any]) -> str:
        """
        Logs a granular tool execution trace for auditability and replay.
        """
        trace_id = trace_data.get("id") or str(uuid.uuid4())
        step_number = int(trace_data.get("step_number", 0))
        tool_name = str(trace_data.get("tool_name", "unknown"))
        command_or_path = trace_data.get("command_or_path")
        input_payload = trace_data.get("input_payload")
        output_payload = trace_data.get("output_payload")
        exit_code = trace_data.get("exit_code")
        duration_ms = float(trace_data.get("duration_ms", 0.0))
        status = trace_data.get("status", "SUCCESS")
        created_at = float(trace_data.get("created_at", time.time()))

        # Convert complex structures to JSON strings if necessary
        if isinstance(input_payload, (dict, list)):
            input_payload = json.dumps(input_payload)
        if isinstance(output_payload, (dict, list)):
            output_payload = json.dumps(output_payload)

        with self.transaction() as cur:
            cur.execute("""
            INSERT INTO execution_traces (
                id, session_id, step_number, tool_name, command_or_path,
                input_payload, output_payload, exit_code, duration_ms, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                trace_id, session_id, step_number, tool_name, command_or_path,
                input_payload, output_payload, exit_code, duration_ms, status, created_at
            ))

        return trace_id

    def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """Returns all messages belonging to a given session ordered chronologically."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            cur.execute("""
            SELECT id, session_id, role, content, thought_trace, timestamp
            FROM chat_history
            WHERE session_id = ?
            ORDER BY timestamp ASC, id ASC;
            """, (session_id,))
            return [dict(row) for row in cur.fetchall()]

    def get_session_traces(self, session_id: str) -> List[Dict[str, Any]]:
        """Returns all execution traces belonging to a given session ordered by step number."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            cur.execute("""
            SELECT id, session_id, step_number, tool_name, command_or_path,
                   input_payload, output_payload, exit_code, duration_ms, status, created_at
            FROM execution_traces
            WHERE session_id = ?
            ORDER BY step_number ASC, created_at ASC;
            """, (session_id,))
            return [dict(row) for row in cur.fetchall()]

    def list_sessions(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Lists recorded sessions sorted by creation time descending."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            cur.execute("""
            SELECT session_id, created_at, title, metadata_json
            FROM sessions
            ORDER BY created_at DESC
            LIMIT ?;
            """, (limit,))
            return [dict(row) for row in cur.fetchall()]

    # =========================================================================
    # Task & Memory Methods (Backwards Compatibility)
    # =========================================================================

    def log_task_start(self, task_id: str, prompt: str, intent_type: str = "AUTONOMOUS_EXEC") -> None:
        """Records task creation locally."""
        with self.transaction() as cur:
            cur.execute("""
            INSERT OR REPLACE INTO tasks (task_id, prompt, intent_type, status)
            VALUES (?, ?, ?, 'RUNNING');
            """, (task_id, prompt, intent_type))

    def update_task_status(
        self,
        task_id: str,
        status: str,
        duration_sec: float = 0.0,
        summary: Optional[str] = None
    ) -> None:
        """Updates task completion state locally."""
        with self.transaction() as cur:
            cur.execute("""
            UPDATE tasks
            SET status = ?, duration_sec = ?, summary = ?
            WHERE task_id = ?;
            """, (status, duration_sec, summary, task_id))

    def log_thought(self, task_id: str, step_id: str, thought_text: str) -> str:
        """Stores internal thought reasoning chain locally."""
        tid = str(uuid.uuid4())[:8]
        with self.transaction() as cur:
            cur.execute("""
            INSERT OR IGNORE INTO tasks (task_id, prompt, status)
            VALUES (?, 'Autonomous Step', 'RUNNING');
            """, (task_id,))
            cur.execute("""
            INSERT INTO thought_traces (id, task_id, step_id, thought_text)
            VALUES (?, ?, ?, ?);
            """, (tid, task_id, step_id, thought_text))
        return tid

    def log_tool_execution(
        self,
        task_id: str,
        tool_name: str,
        command_or_args: str,
        output: str,
        exit_code: int = 0,
        success: bool = True,
        duration_sec: float = 0.0
    ) -> str:
        """Stores tool execution outcome locally."""
        eid = str(uuid.uuid4())[:8]
        with self.transaction() as cur:
            cur.execute("""
            INSERT OR IGNORE INTO tasks (task_id, prompt, status)
            VALUES (?, 'Autonomous Step', 'RUNNING');
            """, (task_id,))
            cur.execute("""
            INSERT INTO tool_executions (id, task_id, tool_name, command_or_args, output, exit_code, success, duration_sec)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (eid, task_id, tool_name, command_or_args, output, exit_code, 1 if success else 0, duration_sec))
        return eid

    def log_diff(
        self,
        task_id: str,
        file_path: str,
        diff_content: str,
        additions: int = 0,
        deletions: int = 0
    ) -> str:
        """Stores file modifications and unified diffs locally."""
        did = str(uuid.uuid4())[:8]
        with self.transaction() as cur:
            cur.execute("""
            INSERT INTO code_diffs (id, task_id, file_path, diff_content, additions, deletions)
            VALUES (?, ?, ?, ?, ?, ?);
            """, (did, task_id, file_path, diff_content, additions, deletions))
        return did

    def save_episodic_memory(
        self,
        category: str,
        key: str,
        value: str,
        confidence: float = 1.0
    ) -> str:
        """Stores or updates learned episodic memory locally."""
        mid = str(uuid.uuid4())[:8]
        with self.transaction() as cur:
            cur.execute("""
            INSERT INTO episodic_memories (id, category, memory_key, memory_value, confidence, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(category, memory_key) DO UPDATE SET
                memory_value = excluded.memory_value,
                confidence = excluded.confidence,
                updated_at = CURRENT_TIMESTAMP;
            """, (mid, category, key, value, confidence))
        return mid

    def get_memories(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieves stored episodic memories."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            if category:
                cur.execute("SELECT * FROM episodic_memories WHERE category = ? ORDER BY updated_at DESC;", (category,))
            else:
                cur.execute("SELECT * FROM episodic_memories ORDER BY updated_at DESC;")
            return [dict(r) for r in cur.fetchall()]

    def get_task_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves historical tasks."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?;", (limit,))
            return [dict(r) for r in cur.fetchall()]

    def get_task_full_traces(self, task_id: str) -> Dict[str, Any]:
        """Retrieves complete local trace dossier for a given task."""
        with self._pool.acquire() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM tasks WHERE task_id = ?;", (task_id,))
            task_row = cur.fetchone()
            task_dict = dict(task_row) if task_row else {}

            cur.execute("SELECT * FROM thought_traces WHERE task_id = ? ORDER BY created_at ASC;", (task_id,))
            thoughts = [dict(r) for r in cur.fetchall()]

            cur.execute("SELECT * FROM tool_executions WHERE task_id = ? ORDER BY created_at ASC;", (task_id,))
            tools = [dict(r) for r in cur.fetchall()]

            cur.execute("SELECT * FROM code_diffs WHERE task_id = ? ORDER BY created_at ASC;", (task_id,))
            diffs = [dict(r) for r in cur.fetchall()]

            return {
                "task": task_dict,
                "thoughts": thoughts,
                "tools": tools,
                "diffs": diffs
            }

    def close(self) -> None:
        """Closes pool resources."""
        self._pool.close()


# Alias for backwards compatibility
LocalAgentStore = LocalStore
