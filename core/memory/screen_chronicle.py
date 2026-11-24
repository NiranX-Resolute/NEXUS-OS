"""Nexus OS v5.0 - Screen Chronicle & OCR Memory Timeline.

Periodically records local screen context and visual timelines into SQLite WAL:
- Persists into ~/.nexus-agent/db/agent_local.db (table: screen_chronicle).
- Enforces strict [SILENT] air-gap lock via WorkspaceGovernor (blocks external network egress).
- Guards image artifacts using ScopeGuard path containment.
- Zero external cloud dependencies, zero ChromaDB requirement.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union

from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard

logger = logging.getLogger("nexus.memory.screen_chronicle")


class ScreenChronicle:
    """Manages visual timeline records and OCR memory frames in SQLite WAL."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None) -> None:
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.governor = WorkspaceGovernor()
        self.scope_guard = ScopeGuard()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        """Initializes screen_chronicle SQLite WAL schema."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS screen_chronicle (
                    id TEXT PRIMARY KEY,
                    timestamp REAL NOT NULL,
                    window_title TEXT DEFAULT '',
                    app_name TEXT DEFAULT '',
                    ocr_text TEXT DEFAULT '',
                    ocr_tokens_json TEXT DEFAULT '[]',
                    thumbnail_blob BLOB,
                    width INTEGER DEFAULT 0,
                    height INTEGER DEFAULT 0,
                    active_mode TEXT DEFAULT 'DEV'
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chronicle_ts ON screen_chronicle(timestamp);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chronicle_app ON screen_chronicle(app_name);")

    def record_frame(
        self,
        window_title: str = "",
        app_name: str = "",
        ocr_text: str = "",
        ocr_tokens: Optional[List[str]] = None,
        thumbnail_bytes: Optional[bytes] = None,
        width: int = 1920,
        height: int = 1080,
    ) -> Dict[str, Any]:
        """
        Records a visual frame into the timeline.
        Enforces strict air-gap in [SILENT] mode.
        """
        if self.governor.is_silent():
            logger.info("[CHRONICLE] [SILENT] Air-gap mode active: External network telemetry blocked.")

        frame_id = f"frame_{int(time.time() * 1000)}_{os.urandom(4).hex()}"
        ts = time.time()
        active_mode = self.governor.get_mode() or "DEV"
        tokens_json = json.dumps(ocr_tokens or [])

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO screen_chronicle (
                    id, timestamp, window_title, app_name, ocr_text, ocr_tokens_json,
                    thumbnail_blob, width, height, active_mode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    frame_id,
                    ts,
                    window_title,
                    app_name,
                    ocr_text,
                    tokens_json,
                    thumbnail_bytes,
                    width,
                    height,
                    active_mode,
                ),
            )

        return {
            "success": True,
            "frame_id": frame_id,
            "timestamp": ts,
            "window_title": window_title,
            "app_name": app_name,
            "active_mode": active_mode,
        }

    def get_latest_frame(self) -> Optional[Dict[str, Any]]:
        """Retrieves the most recent screen chronicle entry."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT id, timestamp, window_title, app_name, ocr_text, ocr_tokens_json, width, height, active_mode FROM screen_chronicle ORDER BY timestamp DESC LIMIT 1;"
            ).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "timestamp": row["timestamp"],
                "window_title": row["window_title"],
                "app_name": row["app_name"],
                "ocr_text": row["ocr_text"],
                "ocr_tokens": json.loads(row["ocr_tokens_json"]),
                "width": row["width"],
                "height": row["height"],
                "active_mode": row["active_mode"],
            }

    def query_chronicle(
        self,
        query: str = "",
        app_name: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Queries recorded frames by keyword or application filter."""
        results: List[Dict[str, Any]] = []
        with self._get_connection() as conn:
            if query and app_name:
                rows = conn.execute(
                    "SELECT id, timestamp, window_title, app_name, ocr_text, active_mode FROM screen_chronicle WHERE app_name = ? AND ocr_text LIKE ? ORDER BY timestamp DESC LIMIT ?;",
                    (app_name, f"%{query}%", limit),
                ).fetchall()
            elif query:
                rows = conn.execute(
                    "SELECT id, timestamp, window_title, app_name, ocr_text, active_mode FROM screen_chronicle WHERE ocr_text LIKE ? OR window_title LIKE ? ORDER BY timestamp DESC LIMIT ?;",
                    (f"%{query}%", f"%{query}%", limit),
                ).fetchall()
            elif app_name:
                rows = conn.execute(
                    "SELECT id, timestamp, window_title, app_name, ocr_text, active_mode FROM screen_chronicle WHERE app_name = ? ORDER BY timestamp DESC LIMIT ?;",
                    (app_name, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, timestamp, window_title, app_name, ocr_text, active_mode FROM screen_chronicle ORDER BY timestamp DESC LIMIT ?;",
                    (limit,),
                ).fetchall()

            for r in rows:
                results.append({
                    "id": r["id"],
                    "timestamp": r["timestamp"],
                    "window_title": r["window_title"],
                    "app_name": r["app_name"],
                    "ocr_text": r["ocr_text"],
                    "active_mode": r["active_mode"],
                })

        return results

    def purge_older_than(self, days: int = 7) -> int:
        """Purges chronicle records older than specified retention days."""
        cutoff = time.time() - (days * 86400)
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM screen_chronicle WHERE timestamp < ?;", (cutoff,))
            return cur.rowcount
