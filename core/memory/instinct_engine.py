"""Nexus OS v5.0 - ECC Continuous Learning & Instinct Engine.

Ported directly from affaan-m/ECC Continuous Learning v2 architecture:
- extract_and_store_instinct: Deduplicating micro-rule extraction from verified runs with hit_count and confidence boost
- retrieve_matching_instincts: Sub-10ms BM25 Full-Text Search via SQLite FTS5 (learned_instincts_fts)
- promote_instinct_to_skill: 1-click promotion to reusable /skill:<slug> package

Backed by SQLite WAL (~/.nexus-agent/db/agent_local.db).
Zero-mock, production-grade implementation.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from core.memory.sovereign_store import SovereignMemoryStore

logger = logging.getLogger("nexus.memory.instinct_engine")


def _sanitize_slug(text: str) -> str:
    """Produces clean URL-safe and filesystem-safe slug."""
    s = re.sub(r"[^a-zA-Z0-9_\-\.]+", "-", text.strip().lower())
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "custom-skill"


class InstinctEngine:
    """Continuous learning and instinct synthesis engine with SQLite WAL FTS5 indexing."""

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        skills_dir: Optional[Union[str, Path]] = None,
    ) -> None:
        if db_path is None:
            self.store = SovereignMemoryStore()
            self.db_path = self.store.db_path
        else:
            self.store = SovereignMemoryStore(db_path=db_path)
            self.db_path = Path(db_path)

        if skills_dir is not None:
            self.skills_dir = Path(skills_dir)
        elif db_path is not None:
            self.skills_dir = self.db_path.parent / "skills"
        else:
            self.skills_dir = Path.home() / ".nexus-agent" / "skills"
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        self._cached_conn: Optional[sqlite3.Connection] = None
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        if self._cached_conn is None:
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.row_factory = sqlite3.Row
            self._cached_conn = conn
        return self._cached_conn

    def close(self) -> None:
        """Closes cached SQLite connection."""
        if self._cached_conn is not None:
            try:
                self._cached_conn.close()
            except Exception:
                pass
            self._cached_conn = None

    def _ensure_tables(self) -> None:
        """Ensures learned_instincts and learned_instincts_fts tables with sync triggers."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learned_instincts (
                    id TEXT PRIMARY KEY,
                    trigger_pattern TEXT NOT NULL,
                    instinct_rule TEXT NOT NULL,
                    confidence_score REAL NOT NULL DEFAULT 0.85,
                    workspace_mode TEXT NOT NULL DEFAULT 'DEV',
                    hit_count INTEGER NOT NULL DEFAULT 1,
                    source_slice_id TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                """
            )
            for col_sql in [
                "ALTER TABLE learned_instincts ADD COLUMN skill_slug TEXT DEFAULT '';",
                "ALTER TABLE learned_instincts ADD COLUMN title TEXT DEFAULT '';",
                "ALTER TABLE learned_instincts ADD COLUMN description TEXT DEFAULT '';",
                "ALTER TABLE learned_instincts ADD COLUMN code_snippet TEXT DEFAULT '';",
                "ALTER TABLE learned_instincts ADD COLUMN language TEXT DEFAULT 'python';",
                "ALTER TABLE learned_instincts ADD COLUMN tags_json TEXT DEFAULT '[]';",
                "ALTER TABLE learned_instincts ADD COLUMN verified_success INTEGER DEFAULT 1;",
                "ALTER TABLE learned_instincts ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';",
            ]:
                try:
                    conn.execute(col_sql)
                except Exception:
                    pass
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS learned_instincts_fts USING fts5(
                    id UNINDEXED,
                    trigger_pattern,
                    instinct_rule,
                    workspace_mode,
                    tokenize = 'porter unicode61'
                );
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_learned_instincts_ai AFTER INSERT ON learned_instincts
                BEGIN
                    INSERT INTO learned_instincts_fts(id, trigger_pattern, instinct_rule, workspace_mode)
                    VALUES (new.id, new.trigger_pattern, new.instinct_rule, new.workspace_mode);
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_learned_instincts_ad AFTER DELETE ON learned_instincts
                BEGIN
                    DELETE FROM learned_instincts_fts WHERE id = old.id;
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_learned_instincts_au AFTER UPDATE ON learned_instincts
                BEGIN
                    DELETE FROM learned_instincts_fts WHERE id = old.id;
                    INSERT INTO learned_instincts_fts(id, trigger_pattern, instinct_rule, workspace_mode)
                    VALUES (new.id, new.trigger_pattern, new.instinct_rule, new.workspace_mode);
                END;
                """
            )

    def extract_and_store_instinct(
        self,
        task_prompt: str,
        verified_fix: str,
        workspace_mode: str = "DEV",
        source_slice_id: str = "",
        confidence: float = 0.85,
    ) -> Dict[str, Any]:
        """Extracts and stores an instinct rule, deduplicating matching triggers and boosting score."""
        clean_prompt = task_prompt.strip()
        clean_fix = verified_fix.strip()
        mode = (workspace_mode or "DEV").strip().upper()

        # Distill trigger pattern
        first_line = clean_prompt.splitlines()[0] if clean_prompt else "general task"
        trigger = re.sub(r"^(?:Fix|Implement|Update|Add|Repair|Bug|Issue):\s*", "", first_line, flags=re.IGNORECASE).strip()
        if len(trigger) > 80:
            trigger = trigger[:77] + "..."

        # Format concise instinct rule
        rule = clean_fix
        if not rule:
            rule = f"When encountering: {clean_prompt}, apply verified fix pattern."

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        with self._get_connection() as conn:
            # Check for existing matching trigger_pattern
            cursor = conn.execute(
                "SELECT id, confidence_score, hit_count FROM learned_instincts WHERE trigger_pattern = ? AND workspace_mode = ?",
                (trigger, mode),
            )
            match = cursor.fetchone()

            if match:
                instinct_id = match["id"]
                new_hit_count = (match["hit_count"] or 0) + 1
                boosted_conf = min(0.99, float(match["confidence_score"] or confidence) + 0.04)

                conn.execute(
                    """
                    UPDATE learned_instincts
                    SET hit_count = ?, confidence_score = ?, instinct_rule = ?, source_slice_id = ?, updated_at = ?
                    WHERE id = ?;
                    """,
                    (new_hit_count, boosted_conf, rule, source_slice_id or "", now_iso, instinct_id),
                )
                conn.commit()

                return {
                    "success": True,
                    "deduplicated": True,
                    "instinct_id": instinct_id,
                    "trigger_pattern": trigger,
                    "confidence_score": boosted_conf,
                    "hit_count": new_hit_count,
                    "workspace_mode": mode,
                }
            else:
                instinct_id = f"inst_{uuid.uuid4().hex[:8]}"
                initial_confidence = max(0.1, min(1.0, confidence))

                conn.execute(
                    """
                    INSERT INTO learned_instincts (
                        id, trigger_pattern, instinct_rule, confidence_score,
                        workspace_mode, hit_count, source_slice_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?);
                    """,
                    (instinct_id, trigger, rule, initial_confidence, mode, source_slice_id or "", now_iso, now_iso),
                )
                conn.commit()

                return {
                    "success": True,
                    "deduplicated": False,
                    "instinct_id": instinct_id,
                    "trigger_pattern": trigger,
                    "confidence_score": initial_confidence,
                    "hit_count": 1,
                    "workspace_mode": mode,
                }

    def retrieve_matching_instincts(
        self,
        query: str,
        workspace_mode: str = "DEV",
        limit: int = 3,
    ) -> List[Dict[str, Any]]:
        """Queries learned_instincts_fts using FTS5 BM25 ranking in <10ms."""
        start_t = time.perf_counter()
        mode = (workspace_mode or "DEV").strip().upper()
        clean_q = re.sub(r"[^\w\s]+", " ", query).strip()

        results: List[Dict[str, Any]] = []

        with self._get_connection() as conn:
            # 1. Try FTS5 BM25 search
            if clean_q:
                terms = clean_q.split()
                # Formulate safe MATCH expression with OR prefixes
                fts_query = " OR ".join([f'"{t}"*' for t in terms[:6]])
                try:
                    cursor = conn.execute(
                        """
                        SELECT i.id, i.trigger_pattern, i.instinct_rule, i.confidence_score,
                               i.workspace_mode, i.hit_count, i.source_slice_id, i.created_at
                        FROM learned_instincts i
                        JOIN learned_instincts_fts f ON i.id = f.id
                        WHERE f MATCH ?
                          AND (i.workspace_mode = ? OR i.workspace_mode = 'DEV')
                        ORDER BY f.rank, i.confidence_score DESC
                        LIMIT ?;
                        """,
                        (fts_query, mode, limit),
                    )
                    rows = cursor.fetchall()
                    for r in rows:
                        results.append(dict(r))
                except Exception as exc:
                    logger.debug("FTS5 match fallback: %s", exc)

            # 2. Fallback to LIKE keyword search if FTS yielded 0 rows
            if not results:
                like_term = f"%{clean_q[:30]}%" if clean_q else "%"
                cursor = conn.execute(
                    """
                    SELECT id, trigger_pattern, instinct_rule, confidence_score,
                           workspace_mode, hit_count, source_slice_id, created_at
                    FROM learned_instincts
                    WHERE (trigger_pattern LIKE ? OR instinct_rule LIKE ?)
                      AND (workspace_mode = ? OR workspace_mode = 'DEV')
                    ORDER BY confidence_score DESC, hit_count DESC
                    LIMIT ?;
                    """,
                    (like_term, like_term, mode, limit),
                )
                for r in cursor.fetchall():
                    results.append(dict(r))

        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
        logger.debug("Instinct query '%s' completed in %.2fms", query, elapsed_ms)
        return results

    def record_instinct(
        self,
        skill_slug: str,
        title: str,
        trigger_pattern: str,
        description: str,
        code_snippet: str,
        language: str = "python",
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Records a verified workflow or reflex snippet into learned_instincts table in SQLite WAL."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        clean_slug = re.sub(r"[^\w\-]+", "-", skill_slug.lower()).strip("-")
        instinct_id = f"inst_{clean_slug}_{uuid.uuid4().hex[:6]}"
        instinct_rule = description or title or f"Rule for {trigger_pattern}"

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO learned_instincts (
                    id, skill_slug, title, trigger_pattern, instinct_rule, description, code_snippet,
                    language, tags_json, confidence_score, verified_success, workspace_mode,
                    hit_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.95, 1, 'DEV', 1, ?, ?);
                """,
                (
                    instinct_id,
                    clean_slug,
                    title,
                    trigger_pattern,
                    instinct_rule,
                    description,
                    code_snippet,
                    language,
                    json.dumps(tags or []),
                    now_iso,
                    now_iso,
                ),
            )
            conn.commit()

        return {
            "success": True,
            "instinct_id": instinct_id,
            "skill_slug": clean_slug,
        }

    def get_instincts(self) -> List[Dict[str, Any]]:
        """Retrieves all recorded instincts from SQLite WAL."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM learned_instincts ORDER BY created_at DESC;").fetchall()
        return [dict(r) for r in rows]

    def promote_instinct(
        self,
        instinct_id_or_slug: str,
        target_skills_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Promotes an instinct to a full /skill:<slug> bundle."""
        return self.promote_instinct_to_skill(
            instinct_id=instinct_id_or_slug,
            target_skills_dir=target_skills_dir,
        )

    def promote_instinct_to_skill(
        self,
        instinct_id: str,
        skill_slug: Optional[str] = None,
        orbiter_group: str = "DEV-01",
        target_skills_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Promotes a high-confidence instinct into a reusable /skill:<slug> package and ecc_skills table."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM learned_instincts WHERE id = ? OR skill_slug = ?;",
                (instinct_id, instinct_id),
            ).fetchone()

        if not row:
            return {"success": False, "error": f"Instinct not found: {instinct_id}"}

        instinct = dict(row)
        resolved_slug = skill_slug or instinct.get("skill_slug") or instinct.get("title") or instinct_id
        clean_slug = _sanitize_slug(resolved_slug)
        base_dir = Path(target_skills_dir) if target_skills_dir else self.skills_dir
        skill_folder = base_dir / clean_slug
        skill_folder.mkdir(parents=True, exist_ok=True)
        skill_path = skill_folder / "SKILL.md"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        content = (
            f"---\n"
            f"name: {clean_slug}\n"
            f"description: Promoted from learned instinct {instinct_id} ({instinct['trigger_pattern']})\n"
            f"trigger_pattern: {_sanitize_slug(instinct['trigger_pattern'])}\n"
            f"confidence_score: {instinct['confidence_score']}\n"
            f"workspace_mode: {instinct['workspace_mode']}\n"
            f"source_slice_id: {instinct.get('source_slice_id', '')}\n"
            f"orbiter_group: {orbiter_group}\n"
            f"---\n\n"
            f"# Skill: {clean_slug}\n\n"
            f"## Trigger Pattern\n"
            f"> `{instinct['trigger_pattern']}`\n\n"
            f"## Distilled Autonomous Rule\n"
            f"```text\n"
            f"{instinct['instinct_rule']}\n"
            f"```\n\n"
            f"## Metadata\n"
            f"- **Confidence Score:** {instinct['confidence_score']}\n"
            f"- **Hit Count:** {instinct['hit_count']}\n"
            f"- **Orbiter Group:** {orbiter_group}\n"
            f"- **Promoted At:** {now_iso}\n"
        )

        with open(skill_path, "w", encoding="utf-8") as f:
            f.write(content)

        # Upsert into ecc_skills table in SQLite
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ecc_skills (
                    slug TEXT PRIMARY KEY,
                    skill_slug TEXT,
                    name TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL DEFAULT 'general',
                    anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
                    orbiter_group TEXT NOT NULL DEFAULT 'DEV-01',
                    allowed_tools_json TEXT NOT NULL DEFAULT '[]',
                    instructions TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL DEFAULT '',
                    file_path TEXT NOT NULL DEFAULT '',
                    instinct_id TEXT NOT NULL DEFAULT '',
                    promoted_at TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                """
            )
            existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_skills);").fetchall()}
            for col_name, col_def in [
                ("skill_slug", "TEXT DEFAULT ''"),
                ("slug", "TEXT DEFAULT ''"),
                ("name", "TEXT DEFAULT ''"),
                ("description", "TEXT DEFAULT ''"),
                ("category", "TEXT DEFAULT 'general'"),
                ("anchor_orbiter", "TEXT DEFAULT 'DEV-01'"),
                ("orbiter_group", "TEXT DEFAULT 'DEV-01'"),
                ("allowed_tools_json", "TEXT DEFAULT '[]'"),
                ("instructions", "TEXT DEFAULT ''"),
                ("content", "TEXT DEFAULT ''"),
                ("file_path", "TEXT DEFAULT ''"),
                ("instinct_id", "TEXT DEFAULT ''"),
                ("promoted_at", "TEXT DEFAULT ''"),
                ("updated_at", "TEXT DEFAULT ''"),
            ]:
                if col_name not in existing_cols:
                    try:
                        conn.execute(f"ALTER TABLE ecc_skills ADD COLUMN {col_name} {col_def};")
                    except Exception as col_err:
                        logger.debug("Column %s add notice: %s", col_name, col_err)

            updated_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_skills);").fetchall()}
            insert_data = {
                "slug": clean_slug,
                "skill_slug": clean_slug,
                "name": clean_slug,
                "description": f"Promoted from learned instinct {instinct_id}",
                "category": "learned-instinct",
                "anchor_orbiter": orbiter_group,
                "orbiter_group": orbiter_group,
                "allowed_tools_json": "[]",
                "instructions": instinct.get("instinct_rule", ""),
                "content": content,
                "file_path": str(skill_path),
                "instinct_id": instinct_id,
                "promoted_at": now_iso,
                "updated_at": now_iso,
            }
            valid_fields = [k for k in insert_data.keys() if k in updated_cols]
            placeholders = ", ".join(["?"] * len(valid_fields))
            col_names = ", ".join(valid_fields)
            values = tuple(insert_data[k] for k in valid_fields)

            conn.execute(
                f"INSERT OR REPLACE INTO ecc_skills ({col_names}) VALUES ({placeholders});",
                values,
            )
            conn.commit()

        if instinct.get("code_snippet"):
            main_py = skill_folder / "main.py"
            with open(main_py, "w", encoding="utf-8") as f:
                f.write(instinct["code_snippet"])

        return {
            "success": True,
            "instinct_id": instinct_id,
            "skill_slug": clean_slug,
            "promoted_slug": clean_slug,
            "skill_path": str(skill_path),
            "skill_dir": str(skill_folder),
            "skill_folder": str(skill_folder),
            "confidence_score": instinct.get("confidence_score", 0.95),
            "orbiter_group": orbiter_group,
        }


# Backward-compatibility alias
LearnedInstinctEngine = InstinctEngine
