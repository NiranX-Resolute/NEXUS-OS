"""
Nexus Persistent Learning Graph & Mutating Lessons Engine
=============================================================================
Inspired by Nous Research / Hermes-Agent.
Enables Nexus to learn from every mistake and self-healing iteration:
- Logs structural Lesson Nodes on task failures and successful recoveries.
- Mutates lessons over time (strengthening high-utility fixes, pruning stale ones).
- Dynamically injects learned lessons into the system prompt for matching tasks.
=============================================================================
"""

import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, List, Optional


@dataclass
class LessonNode:
    category: str
    trigger_keywords: List[str]
    mistake_description: str
    fix_strategy: str
    confidence: float = 1.0
    times_applied: int = 0
    created_at: float = 0.0
    id: Optional[int] = None


class PersistentLearningGraph:
    """
    Self-improving memory graph storing learned lessons and operational quirks.
    """

    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or "."
            self.db_path = Path(home) / ".nexus-agent" / "db" / "learning_graph.db"
        else:
            self.db_path = Path(db_path)

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS learning_lessons (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    trigger_keywords TEXT NOT NULL,
                    mistake_description TEXT NOT NULL,
                    fix_strategy TEXT NOT NULL,
                    confidence REAL DEFAULT 1.0,
                    times_applied INTEGER DEFAULT 0,
                    created_at REAL NOT NULL
                )
            """)
            conn.commit()

    def record_lesson(
        self,
        category: str,
        mistake: str,
        fix: str,
        trigger_keywords: Optional[List[str]] = None,
        confidence: float = 1.0
    ) -> int:
        """Records a newly learned operational lesson."""
        if not trigger_keywords:
            # Auto-extract meaningful keywords
            words = set(re.findall(r"\w{4,}", (mistake + " " + fix).lower()))
            trigger_keywords = list(words)[:10]

        created_t = time.time()
        kw_json = json.dumps([k.lower() for k in trigger_keywords])

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO learning_lessons 
                (category, trigger_keywords, mistake_description, fix_strategy, confidence, times_applied, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
            """, (category.upper(), kw_json, mistake, fix, confidence, created_t))
            conn.commit()
            return cursor.lastrowid

    def query_lessons(self, query: str, top_k: int = 3) -> List[LessonNode]:
        """Queries the graph for lessons matching tokens in the query string."""
        tokens = set(re.findall(r"\w+", query.lower()))
        results: List[Tuple[float, LessonNode]] = []

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM learning_lessons ORDER BY times_applied DESC").fetchall()

            for r in rows:
                try:
                    kws = set(json.loads(r["trigger_keywords"]))
                except Exception:
                    kws = set()

                overlap = len(tokens.intersection(kws))
                if overlap > 0 or any(t in r["mistake_description"].lower() for t in tokens):
                    score = overlap * r["confidence"]
                    node = LessonNode(
                        id=r["id"],
                        category=r["category"],
                        trigger_keywords=list(kws),
                        mistake_description=r["mistake_description"],
                        fix_strategy=r["fix_strategy"],
                        confidence=r["confidence"],
                        times_applied=r["times_applied"],
                        created_at=r["created_at"]
                    )
                    results.append((score, node))

        results.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in results[:top_k]]

    def mark_applied(self, lesson_id: int):
        """Increments application count for a lesson."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("UPDATE learning_lessons SET times_applied = times_applied + 1 WHERE id = ?", (lesson_id,))
            conn.commit()

    def format_prompt_guidance(self, query: str) -> str:
        """Formats matched lessons as a concise prompt injection."""
        matched = self.query_lessons(query, top_k=3)
        if not matched:
            return ""

        lines = ["\n[PREVIOUS LESSONS & LEARNED PITFALLS FOR THIS TASK]:"]
        for node in matched:
            lines.append(f"- [{node.category}] Avoid: {node.mistake_description} -> Fix: {node.fix_strategy}")
            if node.id:
                self.mark_applied(node.id)

        return "\n".join(lines)
