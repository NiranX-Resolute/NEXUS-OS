"""
Nexus Autonomous Engine - Persistent User Memory & Personal Notes Engine
=============================================================================
Enables ChatGPT-style persistent long-term memory across sessions:
1. About User: Tracks identity, profession, projects, and personal context.
2. Sentiments & Feelings: Remembers emotional context, passions, stress triggers, and mood.
3. Preferences & Style: Stores coding preferences, communication tone, and tool defaults.
4. Important Notes Log: Timestamped memory notes captured explicitly or conversationally.
5. Auto-Extraction & Prompt Injection: Dynamically extracts user insights and injects
   a compiled memory context block into model system instructions.
=============================================================================
"""

import os
import re
import json
import uuid
import time
import sqlite3
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

from .config import DB_PATH, MEMORIES_DIR, ensure_runtime_directories

logger = logging.getLogger("nexus.user_memory")


class UserMemoryManager:
    """
    Manages persistent user memories, feelings, preferences, and personal notes.
    Stores entries in local SQLite and continuously syncs a human-readable notes file.
    """

    CATEGORIES = ("about_user", "feelings", "preferences", "notes")

    def __init__(self, db_path: Optional[Path] = None, notes_dir: Optional[Path] = None):
        ensure_runtime_directories()
        self.db_path = Path(db_path or DB_PATH)
        self.notes_dir = Path(notes_dir or MEMORIES_DIR)
        self.notes_dir.mkdir(parents=True, exist_ok=True)
        self.markdown_path = self.notes_dir / "user_notes_page.md"

        self._init_db()
        # Seed default profile if empty
        if not self.get_all_memories():
            self._seed_initial_profile()

    def _init_db(self) -> None:
        """Initializes the user memory table."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS user_notes_memory (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL CHECK(category IN ('about_user', 'feelings', 'preferences', 'notes')),
                memory_key TEXT NOT NULL,
                memory_value TEXT NOT NULL,
                sentiment TEXT,
                confidence REAL DEFAULT 1.0,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                UNIQUE(category, memory_key)
            );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_mem_cat ON user_notes_memory(category);")
            conn.commit()

    def _seed_initial_profile(self) -> None:
        """Seeds initial user memory notes for NiranX."""
        now = time.time()
        initial = [
            ("about_user", "identity", "NiranX (Niranjan Barhate). Software Architect and creator of Nexus OS.", "positive"),
            ("about_user", "vision", "Building 100% free-tier, zero-subscription, sovereign edge-to-desktop computing platforms.", "inspirational"),
            ("about_user", "core_projects", "Nexus Desktop, Nexus OS, Cloudflare Edge Bridge, Puter AI Hub.", "neutral"),
            ("feelings", "memory_desire", "Deeply values an AI that remembers his feelings, personal context, and thoughts across chats like ChatGPT.", "deep"),
            ("feelings", "passions", "Passionate about autonomous systems, fast clean execution, zero cloud fees, and frictionless workflows.", "excited"),
            ("feelings", "frustrations", "Dislikes AI memory loss, repetitive explanations, sluggish tools, and corporate subscription lock-in.", "frustrated"),
            ("preferences", "coding_style", "Production-grade, modular, complete code without placeholders; strong type hints.", "neutral"),
            ("preferences", "cloudflare_cli", "Use cf CLI unless project contains a Wrangler configuration file.", "neutral"),
            ("preferences", "tone", "Empathetic, direct, sharp, proactive, and technically rigorous.", "positive"),
            ("notes", "system_init", "Enabled global persistent memory saving for all user feelings and notes.", "milestone"),
        ]
        with sqlite3.connect(str(self.db_path)) as conn:
            for cat, key, val, sent in initial:
                mid = str(uuid.uuid4())[:8]
                conn.execute("""
                INSERT OR IGNORE INTO user_notes_memory (id, category, memory_key, memory_value, sentiment, confidence, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1.0, ?, ?);
                """, (mid, cat, key, val, sent, now, now))
            conn.commit()
        self.export_markdown()

    def remember(
        self,
        category: str,
        key: str,
        value: str,
        sentiment: Optional[str] = None,
        confidence: float = 1.0
    ) -> Dict[str, Any]:
        """
        Saves or updates a memory entry in the user's notes.
        Returns the saved entry metadata.
        """
        if category not in self.CATEGORIES:
            category = "notes"

        key = key.strip().lower().replace(" ", "_")
        now = time.time()
        mid = str(uuid.uuid4())[:8]

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
            INSERT INTO user_notes_memory (id, category, memory_key, memory_value, sentiment, confidence, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(category, memory_key) DO UPDATE SET
                memory_value = excluded.memory_value,
                sentiment = COALESCE(excluded.sentiment, user_notes_memory.sentiment),
                confidence = excluded.confidence,
                updated_at = excluded.updated_at;
            """, (mid, category, key, value.strip(), sentiment, confidence, now, now))
            conn.commit()

        self.export_markdown()
        logger.info(f"🧠 [Memory Saved] [{category}] {key}: {value}")
        return {
            "id": mid,
            "category": category,
            "key": key,
            "value": value,
            "sentiment": sentiment,
            "updated_at": now
        }

    def forget(self, key_or_pattern: str) -> int:
        """Removes memory matching a key or pattern."""
        clean = key_or_pattern.strip().lower().replace(" ", "_")
        with sqlite3.connect(str(self.db_path)) as conn:
            cur = conn.cursor()
            cur.execute("""
            DELETE FROM user_notes_memory
            WHERE memory_key = ? OR memory_key LIKE ?;
            """, (clean, f"%{clean}%"))
            conn.commit()
            deleted = cur.rowcount

        self.export_markdown()
        return deleted

    def get_all_memories(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns all memory records."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            if category:
                cur.execute("SELECT * FROM user_notes_memory WHERE category = ? ORDER BY updated_at DESC;", (category,))
            else:
                cur.execute("SELECT * FROM user_notes_memory ORDER BY category, updated_at DESC;")
            return [dict(r) for r in cur.fetchall()]

    def build_system_prompt_block(self) -> str:
        """
        Constructs the markdown injection block for the LLM system prompt,
        ensuring the AI always stays grounded in the user's memories, feelings, and preferences.
        """
        records = self.get_all_memories()
        if not records:
            return ""

        grouped: Dict[str, List[Dict[str, Any]]] = {c: [] for c in self.CATEGORIES}
        for r in records:
            cat = r.get("category", "notes")
            if cat in grouped:
                grouped[cat].append(r)

        lines = [
            "## 🧠 User Personal Memory & Notes (Always Keep in Mind)",
            "The following are persistent notes, feelings, and preferences about the user:",
            ""
        ]

        if grouped["about_user"]:
            lines.append("### 👤 About the User")
            for r in grouped["about_user"]:
                lines.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}")
            lines.append("")

        if grouped["feelings"]:
            lines.append("### 💭 User Feelings & Sentiments")
            for r in grouped["feelings"]:
                sent = f" *(Feeling: {r['sentiment']})*" if r.get("sentiment") else ""
                lines.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}{sent}")
            lines.append("")

        if grouped["preferences"]:
            lines.append("### ⚙️ Working Preferences")
            for r in grouped["preferences"]:
                lines.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}")
            lines.append("")

        if grouped["notes"]:
            lines.append("### 📝 Important Notes")
            for r in grouped["notes"][:5]:  # Top 5 recent notes
                lines.append(f"- {r['memory_value']}")
            lines.append("")

        return "\n".join(lines)

    def extract_and_remember(self, text: str) -> List[Dict[str, Any]]:
        """
        Heuristic conversational extraction: automatically extracts facts, feelings,
        and instructions to remember, just like ChatGPT's automatic memory.
        """
        extracted = []
        text_lower = text.lower()

        # 1. Explicit remember trigger: "remember that...", "keep in mind that..."
        remember_match = re.search(r"(?:remember\s+(?:that|to)?|keep in mind\s+(?:that)?|don't forget\s+(?:that)?)\s+([^.!?\n]+)", text, re.IGNORECASE)
        if remember_match:
            val = remember_match.group(1).strip()
            item = self.remember("notes", f"user_note_{int(time.time())}", val, sentiment="instruction")
            extracted.append(item)

        # 2. Feelings trigger: "I feel...", "I'm feeling...", "I really hate...", "I love..."
        feelings_match = re.search(r"(?:i\s+feel|i'm\s+feeling|i\s+hate|i\s+love|i\s+dislike|i\s+really\s+enjoy)\s+([^.!?\n]+)", text, re.IGNORECASE)
        if feelings_match:
            val = feelings_match.group(0).strip()
            item = self.remember("feelings", f"sentiment_{int(time.time())}", val, sentiment="emotion")
            extracted.append(item)

        # 3. Preference trigger: "I prefer...", "always use...", "never use..."
        pref_match = re.search(r"(?:i\s+prefer|always\s+use|never\s+use|my\s+favorite)\s+([^.!?\n]+)", text, re.IGNORECASE)
        if pref_match:
            val = pref_match.group(0).strip()
            item = self.remember("preferences", f"pref_{int(time.time())}", val, sentiment="preference")
            extracted.append(item)

        return extracted

    def export_markdown(self, target_path: Optional[Path] = None) -> Path:
        """Exports memories to a human-readable Notes Page markdown file."""
        out_path = Path(target_path or self.markdown_path)
        records = self.get_all_memories()

        grouped: Dict[str, List[Dict[str, Any]]] = {c: [] for c in self.CATEGORIES}
        for r in records:
            cat = r.get("category", "notes")
            if cat in grouped:
                grouped[cat].append(r)

        content = [
            "# 🧠 Nexus OS — User Memory & Notes Page",
            "",
            "> *Autonomous long-term personal memory for the user. Saved locally with 100% data sovereignty.*",
            f"> *Last Synced: {time.strftime('%Y-%m-%d %H:%M:%S')}*",
            "",
            "---",
            "",
            "## 👤 About User",
        ]
        for r in grouped["about_user"]:
            content.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}")

        content.extend([
            "",
            "---",
            "",
            "## 💭 Feelings & Sentiments",
        ])
        for r in grouped["feelings"]:
            sent = f" *({r['sentiment']})*" if r.get("sentiment") else ""
            content.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}{sent}")

        content.extend([
            "",
            "---",
            "",
            "## ⚙️ Preferences & Style",
        ])
        for r in grouped["preferences"]:
            content.append(f"- **{r['memory_key'].replace('_', ' ').title()}:** {r['memory_value']}")

        content.extend([
            "",
            "---",
            "",
            "## 📝 Important Notes Log",
        ])
        for r in grouped["notes"]:
            date_str = time.strftime('%Y-%m-%d', time.localtime(r.get('updated_at', time.time())))
            content.append(f"- **[{date_str}]** {r['memory_value']}")

        content.append("")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("\n".join(content), encoding="utf-8")
        return out_path
