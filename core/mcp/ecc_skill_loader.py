"""Nexus OS v5.0 - ECC Skill & Agent Loader.

Resolves and dynamic-loads ECC specialist agents and skill playbooks:
- Fast SQLite WAL & FTS5 resolution for /skill:<slug> and @ecc:<agent>
- Sub-5ms retrieval and prompt injection formatting
- Orbiter group classification (DEV-01, SYS-01, SCOUT-01, SEC-01, OPS-01)
- Seamless integration with MCP tool pipelines and DynamicAgentSpawner

Zero-mock, production-grade implementation conforming to Nexus OS v5.0 specifications.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("nexus.mcp.ecc_skill_loader")

DEFAULT_DB_PATH = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
DEFAULT_VENDOR_DIR = Path.home() / ".nexus-agent" / "vendor" / "ecc"


class ECCSkillLoader:
    """High-speed resolver and loader for ECC 71 specialist agents & 314 skill playbooks."""

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        vendor_dir: Optional[Union[str, Path]] = None,
    ) -> None:
        self.db_path = Path(db_path or DEFAULT_DB_PATH).resolve()
        self.vendor_dir = Path(vendor_dir or DEFAULT_VENDOR_DIR).resolve()
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
        else:
            conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_tables(self) -> None:
        """Ensures ECC tables and FTS5 indices exist, applying migrations if needed."""
        conn = self._get_connection()
        try:
            agent_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_agents);").fetchall()}
            if agent_cols and "slug" not in agent_cols:
                conn.execute("ALTER TABLE ecc_agents ADD COLUMN slug TEXT;")
                conn.execute("UPDATE ecc_agents SET slug = id WHERE slug IS NULL OR slug = '';")
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ecc_agents_slug ON ecc_agents(slug);")
            if agent_cols:
                if "anchor_orbiter" not in agent_cols:
                    conn.execute("ALTER TABLE ecc_agents ADD COLUMN anchor_orbiter TEXT DEFAULT 'DEV-01';")
                    if "anchor" in agent_cols:
                        conn.execute("UPDATE ecc_agents SET anchor_orbiter = anchor WHERE anchor_orbiter = 'DEV-01';")
                if "default_tools_json" not in agent_cols:
                    conn.execute("ALTER TABLE ecc_agents ADD COLUMN default_tools_json TEXT DEFAULT '[]';")
                if "system_prompt" not in agent_cols:
                    conn.execute("ALTER TABLE ecc_agents ADD COLUMN system_prompt TEXT DEFAULT '';")
                if "file_path" not in agent_cols:
                    conn.execute("ALTER TABLE ecc_agents ADD COLUMN file_path TEXT DEFAULT '';")
                if "updated_at" not in agent_cols:
                    conn.execute("ALTER TABLE ecc_agents ADD COLUMN updated_at TEXT DEFAULT '';")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ecc_agents (
                    slug TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
                    default_tools_json TEXT NOT NULL DEFAULT '[]',
                    system_prompt TEXT NOT NULL,
                    file_path TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS ecc_agents_fts USING fts5(
                    slug UNINDEXED,
                    name,
                    description,
                    anchor_orbiter,
                    system_prompt,
                    tokenize = 'porter unicode61'
                );
                """
            )

            skill_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_skills);").fetchall()}
            if skill_cols:
                if "name" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN name TEXT DEFAULT '';")
                    if "title" in skill_cols:
                        conn.execute("UPDATE ecc_skills SET name = title WHERE name = '';")
                if "anchor_orbiter" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN anchor_orbiter TEXT DEFAULT 'DEV-01';")
                    if "orbiter_group" in skill_cols:
                        conn.execute("UPDATE ecc_skills SET anchor_orbiter = orbiter_group WHERE anchor_orbiter = 'DEV-01';")
                if "allowed_tools_json" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN allowed_tools_json TEXT DEFAULT '[]';")
                    if "tools_json" in skill_cols:
                        conn.execute("UPDATE ecc_skills SET allowed_tools_json = tools_json WHERE allowed_tools_json = '[]';")
                if "instructions" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN instructions TEXT DEFAULT '';")
                    if "instructions_md" in skill_cols:
                        conn.execute("UPDATE ecc_skills SET instructions = instructions_md WHERE instructions = '';")
                if "file_path" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN file_path TEXT DEFAULT '';")
                if "updated_at" not in skill_cols:
                    conn.execute("ALTER TABLE ecc_skills ADD COLUMN updated_at TEXT DEFAULT '';")

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ecc_skills (
                    slug TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'general',
                    anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
                    allowed_tools_json TEXT NOT NULL DEFAULT '[]',
                    instructions TEXT NOT NULL,
                    file_path TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS ecc_skills_fts USING fts5(
                    slug UNINDEXED,
                    name,
                    description,
                    category,
                    anchor_orbiter,
                    instructions,
                    tokenize = 'porter unicode61'
                );
                """
            )
            conn.commit()
        finally:
            conn.close()

    def clean_skill_slug(self, identifier: str) -> str:
        """Normalizes skill slug from /skill:<slug>, skill:<slug>, or bare slug."""
        raw = (identifier or "").strip()
        if raw.startswith("/skill:"):
            raw = raw[7:]
        elif raw.startswith("skill:"):
            raw = raw[6:]
        return raw.strip().lower()

    def clean_agent_slug(self, identifier: str) -> str:
        """Normalizes agent slug from @ecc:<agent>, ecc:<agent>, @<agent>, or bare slug."""
        raw = (identifier or "").strip()
        if raw.startswith("@ecc:"):
            raw = raw[5:]
        elif raw.startswith("ecc:"):
            raw = raw[4:]
        elif raw.startswith("@"):
            raw = raw[1:]
        return raw.strip().lower()

    def resolve_skill(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Resolves an ECC skill playbook by /skill:<slug> or slug identifier."""
        slug = self.clean_skill_slug(identifier)
        if not slug:
            return None

        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at "
                "FROM ecc_skills WHERE slug = ? LIMIT 1;",
                (slug,),
            )
            row = cur.fetchone()
            if not row:
                # Fallback to search if exact slug not found
                matches = self.search_skills(slug, limit=1)
                return matches[0] if matches else None

            tools = []
            try:
                tools = json.loads(row["allowed_tools_json"])
            except Exception:
                pass

            return {
                "slug": row["slug"],
                "name": row["name"],
                "description": row["description"],
                "category": row["category"],
                "anchor_orbiter": row["anchor_orbiter"],
                "allowed_tools": tools,
                "instructions": row["instructions"],
                "file_path": row["file_path"],
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    def resolve_agent(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Resolves an ECC agent by @ecc:<agent> or slug identifier."""
        slug = self.clean_agent_slug(identifier)
        if not slug:
            return None

        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at "
                "FROM ecc_agents WHERE slug = ? LIMIT 1;",
                (slug,),
            )
            row = cur.fetchone()
            if not row:
                # Try ecc_agent_archetypes if ecc_agents missing row
                try:
                    cur = conn.execute(
                        "SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, updated_at "
                        "FROM ecc_agent_archetypes WHERE slug = ? LIMIT 1;",
                        (slug,),
                    )
                    row = cur.fetchone()
                except Exception:
                    pass

            if not row:
                matches = self.search_agents(slug, limit=1)
                return matches[0] if matches else None

            tools = []
            try:
                tools = json.loads(row["default_tools_json"])
            except Exception:
                pass

            return {
                "slug": row["slug"],
                "name": row["name"],
                "description": row["description"],
                "anchor_orbiter": row["anchor_orbiter"],
                "default_tools": tools,
                "system_prompt": row["system_prompt"],
                "file_path": row["file_path"] if "file_path" in row.keys() else "",
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    def search_skills(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Searches ECC skill playbooks using FTS5 (with LIKE fallback)."""
        clean_q = (query or "").strip()
        if not clean_q:
            return []

        conn = self._get_connection()
        try:
            rows = []
            try:
                fts_query = " OR ".join(f'"{re.sub(r"[^a-zA-Z0-9_-]", "", term)}"*' for term in clean_q.split() if term)
                if not fts_query:
                    fts_query = f'"{clean_q}"'
                cur = conn.execute(
                    """
                    SELECT s.slug, s.name, s.description, s.category, s.anchor_orbiter, s.allowed_tools_json, s.instructions, s.file_path, s.updated_at
                    FROM ecc_skills s
                    JOIN ecc_skills_fts fts ON s.slug = fts.slug
                    WHERE ecc_skills_fts MATCH ?
                    LIMIT ?;
                    """,
                    (fts_query, limit),
                )
                rows = cur.fetchall()
            except sqlite3.OperationalError:
                rows = []

            if not rows:
                like_term = f"%{clean_q}%"
                cur = conn.execute(
                    """
                    SELECT slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at
                    FROM ecc_skills
                    WHERE slug LIKE ? OR name LIKE ? OR description LIKE ? OR category LIKE ?
                    LIMIT ?;
                    """,
                    (like_term, like_term, like_term, like_term, limit),
                )
                rows = cur.fetchall()

            res: List[Dict[str, Any]] = []
            for r in rows:
                tools = []
                try:
                    tools = json.loads(r["allowed_tools_json"])
                except Exception:
                    pass
                res.append({
                    "slug": r["slug"],
                    "name": r["name"],
                    "description": r["description"],
                    "category": r["category"],
                    "anchor_orbiter": r["anchor_orbiter"],
                    "allowed_tools": tools,
                    "instructions": r["instructions"],
                    "file_path": r["file_path"],
                    "updated_at": r["updated_at"],
                })
            return res
        finally:
            conn.close()

    def search_agents(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Searches ECC specialist agents using FTS5 (with LIKE fallback)."""
        clean_q = (query or "").strip()
        if not clean_q:
            return []

        conn = self._get_connection()
        try:
            rows = []
            try:
                fts_query = " OR ".join(f'"{re.sub(r"[^a-zA-Z0-9_-]", "", term)}"*' for term in clean_q.split() if term)
                if not fts_query:
                    fts_query = f'"{clean_q}"'
                cur = conn.execute(
                    """
                    SELECT a.slug, a.name, a.description, a.anchor_orbiter, a.default_tools_json, a.system_prompt, a.file_path, a.updated_at
                    FROM ecc_agents a
                    JOIN ecc_agents_fts fts ON a.slug = fts.slug
                    WHERE ecc_agents_fts MATCH ?
                    LIMIT ?;
                    """,
                    (fts_query, limit),
                )
                rows = cur.fetchall()
            except sqlite3.OperationalError:
                rows = []

            if not rows:
                like_term = f"%{clean_q}%"
                cur = conn.execute(
                    """
                    SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at
                    FROM ecc_agents
                    WHERE slug LIKE ? OR name LIKE ? OR description LIKE ?
                    LIMIT ?;
                    """,
                    (like_term, like_term, like_term, limit),
                )
                rows = cur.fetchall()

            res: List[Dict[str, Any]] = []
            for r in rows:
                tools = []
                try:
                    tools = json.loads(r["default_tools_json"])
                except Exception:
                    pass
                res.append({
                    "slug": r["slug"],
                    "name": r["name"],
                    "description": r["description"],
                    "anchor_orbiter": r["anchor_orbiter"],
                    "default_tools": tools,
                    "system_prompt": r["system_prompt"],
                    "file_path": r["file_path"],
                    "updated_at": r["updated_at"],
                })
            return res
        finally:
            conn.close()

    def get_skill_prompt_injection(self, slug: str) -> str:
        """Returns skill instructions wrapped in system injection tags for prompts."""
        skill = self.resolve_skill(slug)
        if not skill:
            return f"[ECC Skill: '{slug}' not found]"

        tools_str = ", ".join(skill.get("allowed_tools", []))
        return (
            f"=== ECC SKILL PLAYBOOK: {skill['name']} ({skill['slug']}) ===\n"
            f"Category: {skill['category']} | Anchor Orbiter: {skill['anchor_orbiter']}\n"
            f"Description: {skill['description']}\n"
            f"Recommended Tools: {tools_str or 'standard'}\n\n"
            f"INSTRUCTIONS:\n{skill['instructions']}\n"
            f"=== END ECC SKILL PLAYBOOK ==="
        )

    def get_agent_system_prompt(self, slug: str, swarm_id: Optional[str] = None) -> str:
        """Returns the full system prompt for an ECC agent archetype."""
        agent = self.resolve_agent(slug)
        if not agent:
            return f"You are a specialized AI assistant. Target archetype '{slug}' was not found."

        anchor = agent.get("anchor_orbiter", "DEV-01")
        tools_str = ", ".join(agent.get("default_tools", []))
        swarm_str = f"Swarm: {swarm_id}\n" if swarm_id else ""

        return (
            f"You are '{agent['name']}' ({agent['slug']}), anchored to {anchor}.\n"
            f"{swarm_str}"
            f"Role: {agent['description']}\n"
            f"Allowed Tools: {tools_str}\n\n"
            f"{agent['system_prompt']}"
        )

    def list_skills(self, category: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Lists skills optionally filtered by category."""
        conn = self._get_connection()
        try:
            if category:
                cur = conn.execute(
                    "SELECT slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at "
                    "FROM ecc_skills WHERE category = ? ORDER BY slug ASC LIMIT ?;",
                    (category, limit),
                )
            else:
                cur = conn.execute(
                    "SELECT slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at "
                    "FROM ecc_skills ORDER BY slug ASC LIMIT ?;",
                    (limit,),
                )
            rows = cur.fetchall()
            res = []
            for r in rows:
                tools = []
                try:
                    tools = json.loads(r["allowed_tools_json"])
                except Exception:
                    pass
                res.append({
                    "slug": r["slug"],
                    "name": r["name"],
                    "description": r["description"],
                    "category": r["category"],
                    "anchor_orbiter": r["anchor_orbiter"],
                    "allowed_tools": tools,
                    "instructions": r["instructions"],
                    "file_path": r["file_path"],
                    "updated_at": r["updated_at"],
                })
            return res
        finally:
            conn.close()

    def list_agents(self, anchor_orbiter: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Lists agents optionally filtered by anchor orbiter."""
        conn = self._get_connection()
        try:
            if anchor_orbiter:
                cur = conn.execute(
                    "SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at "
                    "FROM ecc_agents WHERE anchor_orbiter = ? ORDER BY slug ASC LIMIT ?;",
                    (anchor_orbiter, limit),
                )
            else:
                cur = conn.execute(
                    "SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at "
                    "FROM ecc_agents ORDER BY slug ASC LIMIT ?;",
                    (limit,),
                )
            rows = cur.fetchall()
            res = []
            for r in rows:
                tools = []
                try:
                    tools = json.loads(r["default_tools_json"])
                except Exception:
                    pass
                res.append({
                    "slug": r["slug"],
                    "name": r["name"],
                    "description": r["description"],
                    "anchor_orbiter": r["anchor_orbiter"],
                    "default_tools": tools,
                    "system_prompt": r["system_prompt"],
                    "file_path": r["file_path"],
                    "updated_at": r["updated_at"],
                })
            return res
        finally:
            conn.close()


_loader_instance: Optional[ECCSkillLoader] = None


def get_ecc_skill_loader(db_path: Optional[Union[str, Path]] = None) -> ECCSkillLoader:
    """Returns singleton ECCSkillLoader instance."""
    global _loader_instance
    if _loader_instance is None or db_path is not None:
        _loader_instance = ECCSkillLoader(db_path=db_path)
    return _loader_instance
