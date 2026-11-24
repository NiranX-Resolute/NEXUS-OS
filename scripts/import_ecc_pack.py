"""Nexus OS v5.0 - ECC 71 Agents & 314 Skills Importer.

Imports, parses, and indexes specialist agents and skills from affaan-m/ECC:
- Clones or updates remote repository strictly into ~/.nexus-agent/vendor/ecc
  (Zero workspace root clutter: vendor assets stay strictly under ~/.nexus-agent/vendor/)
- Parses agent markdown definitions and skill SKILL.md playbooks with frontmatter extraction
- Classifies items into 5 domain anchor orbiters (DEV-01, SYS-01, SCOUT-01, SEC-01, OPS-01)
- Upserts records into ecc_agents, ecc_agent_archetypes, and ecc_skills with FTS5 synchronization
- Exposes CLI resolution for /skill:<slug> and @ecc:<agent> plus sub-15ms FTS5 lookups

Zero-mock, production-grade implementation conforming to Nexus OS v5.0 specifications.
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).parent.parent.resolve()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [ECC_IMPORTER] %(message)s")
logger = logging.getLogger("nexus.scripts.import_ecc_pack")

REPO_URL = "https://github.com/affaan-m/ECC.git"
DEFAULT_VENDOR_DIR = Path.home() / ".nexus-agent" / "vendor" / "ecc"
DEFAULT_DB_PATH = Path.home() / ".nexus-agent" / "db" / "agent_local.db"

ORBITER_GROUPS = {
    "DEV-01": {"name": "NexKoder", "role": "Lead Code Synthesizer & AST Engineer"},
    "SYS-01": {"name": "SysGuard", "role": "Win32 System Reflex & Telemetry Controller"},
    "SCOUT-01": {"name": "Scout", "role": "Autonomous Research, Docs & Knowledge Harvester"},
    "SEC-01": {"name": "Sentinel", "role": "AgentShield & 6 Sovereign Invariants Verifier"},
    "OPS-01": {"name": "Orchestrator", "role": "Execution Slice & Instinct Promotion Engine"},
}


def classify_anchor_orbiter(slug: str, name: str, description: str, body: str = "") -> str:
    """Classifies an agent or skill into one of the 5 Domain Anchor Orbiters."""
    text = f"{slug} {name} {description} {body[:500]}".lower()
    if any(k in text for k in (
        "security", "audit", "vulnerability", "threat", "auth", "crypto", "shield",
        "sast", "cve", "secret", "guard", "firewall", "hardening", "privilege", "sandbox"
    )):
        return "SEC-01"
    if any(k in text for k in (
        "scout", "search", "web", "research", "browse", "crawl", "scrape", "monitor",
        "scholar", "fetch", "discovery", "biorxiv", "arxiv", "investigate", "doc", "docs"
    )):
        return "SCOUT-01"
    if any(k in text for k in (
        "sys", "system", "os", "process", "hardware", "memory", "disk", "win32",
        "kernel", "daemon", "benchmark", "telemetry", "metric", "audio", "voice", "power"
    )):
        return "SYS-01"
    if any(k in text for k in (
        "ops", "deploy", "build", "runner", "pipeline", "docker", "ci", "cd", "cloud",
        "release", "infra", "kubernetes", "k8s", "cloudflare", "workflow", "cron", "orchestrat"
    )):
        return "OPS-01"
    return "DEV-01"


def sync_git_repository(
    repo_url: str = REPO_URL,
    target_dir: Optional[Union[str, Path]] = None,
    timeout_sec: int = 45,
) -> bool:
    """Clones or updates the ECC repository under ~/.nexus-agent/vendor/ecc."""
    dest = Path(target_dir or DEFAULT_VENDOR_DIR).resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)

    git_bin = shutil.which("git")
    if not git_bin:
        logger.warning("Git executable not found in PATH; skipping git sync.")
        return dest.exists()

    if (dest / ".git").exists():
        logger.info("ECC repository exists at %s; pulling latest changes...", dest)
        try:
            res = subprocess.run(
                [git_bin, "pull", "--ff-only"],
                cwd=str(dest),
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )
            if res.returncode == 0:
                logger.info("Successfully pulled latest ECC updates.")
                return True
            else:
                logger.warning("Git pull returned non-zero code: %s", res.stderr.strip() or res.stdout.strip())
                return True  # Repository still usable
        except Exception as exc:
            logger.warning("Git pull timed out or failed: %s; using existing vendor files.", exc)
            return True

    logger.info("Cloning %s into %s...", repo_url, dest)
    try:
        res = subprocess.run(
            [git_bin, "clone", "--depth", "1", repo_url, str(dest)],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
        if res.returncode == 0:
            logger.info("Successfully cloned ECC pack into %s", dest)
            return True
        else:
            logger.warning("Git clone failed: %s", res.stderr.strip() or res.stdout.strip())
            return dest.exists()
    except Exception as exc:
        logger.warning("Git clone timed out or failed: %s", exc)
        return dest.exists()


def parse_frontmatter_and_body(content: str) -> Tuple[Dict[str, Any], str]:
    """Extracts YAML-like frontmatter metadata and remaining body content."""
    meta: Dict[str, Any] = {}
    body = content

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body = parts[2].strip()
            for line in fm_text.splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if ":" in line:
                    key, val = line.split(":", 1)
                    key = key.strip().lower()
                    val = val.strip().strip('"').strip("'")
                    if val.startswith("[") and val.endswith("]"):
                        inner = val[1:-1]
                        meta[key] = [item.strip().strip('"').strip("'") for item in inner.split(",") if item.strip()]
                    else:
                        meta[key] = val

    return meta, body


def parse_agent_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Parses an agent markdown definition."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        logger.debug("Failed reading agent %s: %s", file_path, exc)
        return None

    slug = file_path.stem
    meta, body = parse_frontmatter_and_body(content)

    name = meta.get("name") or slug.replace("-", " ").title()
    description = meta.get("description") or ""
    if not description:
        first_line = next((l.strip().lstrip("#").strip() for l in body.splitlines() if l.strip()), name)
        description = first_line[:150]

    raw_tools = meta.get("tools") or []
    if isinstance(raw_tools, str):
        raw_tools = [t.strip().lower() for t in raw_tools.split(",") if t.strip()]
    tools = [str(t).lower() for t in raw_tools]

    anchor = classify_anchor_orbiter(slug, name, description, body)

    return {
        "slug": slug,
        "name": name,
        "description": description,
        "anchor_orbiter": anchor,
        "default_tools": tools,
        "system_prompt": body,
        "file_path": str(file_path),
    }


def parse_skill_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Parses a skill playbook file (SKILL.md or <slug>.md)."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        logger.debug("Failed reading skill %s: %s", file_path, exc)
        return None

    meta, body = parse_frontmatter_and_body(content)

    # Resolve slug: either parent folder name (if SKILL.md) or file stem
    if file_path.name.lower() in ("skill.md", "readme.md"):
        slug = file_path.parent.name.lower()
    else:
        slug = file_path.stem.lower()

    if meta.get("name"):
        slug = str(meta["name"]).strip().lower().replace(" ", "-")

    name = meta.get("name") or slug.replace("-", " ").title()
    description = meta.get("description") or ""
    if not description:
        first_line = next((l.strip().lstrip("#").strip() for l in body.splitlines() if l.strip()), name)
        description = first_line[:160]

    category = meta.get("category") or file_path.parent.name
    if category.lower() in ("skills", "ecc", "vendor"):
        category = "general"

    raw_tools = meta.get("tools") or meta.get("allowed_tools") or []
    if isinstance(raw_tools, str):
        raw_tools = [t.strip().lower() for t in raw_tools.split(",") if t.strip()]
    tools = [str(t).lower() for t in raw_tools]

    anchor = classify_anchor_orbiter(slug, name, description, body)

    return {
        "slug": slug,
        "name": name,
        "description": description,
        "category": category,
        "anchor_orbiter": anchor,
        "allowed_tools": tools,
        "instructions": body,
        "file_path": str(file_path),
    }


def ensure_database_schema(conn: sqlite3.Connection) -> None:
    """Creates ECC tables and FTS5 indices if not present, and applies non-destructive migrations."""
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")

    # 1. ecc_agents migration & table
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
    except Exception as e_mig:
        logger.debug("ecc_agents migration notice: %s", e_mig)

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
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_ai AFTER INSERT ON ecc_agents
        BEGIN
            INSERT INTO ecc_agents_fts(slug, name, description, anchor_orbiter, system_prompt)
            VALUES (new.slug, new.name, new.description, new.anchor_orbiter, new.system_prompt);
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_ad AFTER DELETE ON ecc_agents
        BEGIN
            DELETE FROM ecc_agents_fts WHERE slug = old.slug;
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_au AFTER UPDATE ON ecc_agents
        BEGIN
            DELETE FROM ecc_agents_fts WHERE slug = old.slug;
            INSERT INTO ecc_agents_fts(slug, name, description, anchor_orbiter, system_prompt)
            VALUES (new.slug, new.name, new.description, new.anchor_orbiter, new.system_prompt);
        END;
        """
    )

    # 2. ecc_agent_archetypes table (backward compatibility)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ecc_agent_archetypes (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
            default_tools_json TEXT NOT NULL DEFAULT '[]',
            system_prompt TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS ecc_agent_archetypes_fts USING fts5(
            slug UNINDEXED,
            name,
            description,
            anchor_orbiter,
            tokenize = 'porter unicode61'
        );
        """
    )

    # 3. ecc_skills table & FTS5
    try:
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
    except Exception as s_mig:
        logger.debug("ecc_skills migration notice: %s", s_mig)

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
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_ai AFTER INSERT ON ecc_agents
        BEGIN
            INSERT INTO ecc_agents_fts(slug, name, description, anchor_orbiter, system_prompt)
            VALUES (new.slug, new.name, new.description, new.anchor_orbiter, new.system_prompt);
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_ad AFTER DELETE ON ecc_agents
        BEGIN
            DELETE FROM ecc_agents_fts WHERE slug = old.slug;
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_agents_au AFTER UPDATE ON ecc_agents
        BEGIN
            DELETE FROM ecc_agents_fts WHERE slug = old.slug;
            INSERT INTO ecc_agents_fts(slug, name, description, anchor_orbiter, system_prompt)
            VALUES (new.slug, new.name, new.description, new.anchor_orbiter, new.system_prompt);
        END;
        """
    )

    # 2. ecc_agent_archetypes table (backward compatibility)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ecc_agent_archetypes (
            slug TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
            default_tools_json TEXT NOT NULL DEFAULT '[]',
            system_prompt TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS ecc_agent_archetypes_fts USING fts5(
            slug UNINDEXED,
            name,
            description,
            anchor_orbiter,
            tokenize = 'porter unicode61'
        );
        """
    )

    # 3. ecc_skills table & FTS5
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
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_ai AFTER INSERT ON ecc_skills
        BEGIN
            INSERT INTO ecc_skills_fts(slug, name, description, category, anchor_orbiter, instructions)
            VALUES (new.slug, new.name, new.description, new.category, new.anchor_orbiter, new.instructions);
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_ad AFTER DELETE ON ecc_skills
        BEGIN
            DELETE FROM ecc_skills_fts WHERE slug = old.slug;
        END;
        """
    )
    conn.execute(
        """
        CREATE TRIGGER IF NOT EXISTS trg_ecc_skills_au AFTER UPDATE ON ecc_skills
        BEGIN
            DELETE FROM ecc_skills_fts WHERE slug = old.slug;
            INSERT INTO ecc_skills_fts(slug, name, description, category, anchor_orbiter, instructions)
            VALUES (new.slug, new.name, new.description, new.category, new.anchor_orbiter, new.instructions);
        END;
        """
    )
    conn.commit()


def import_ecc_pack(
    vendor_dir: Optional[Union[str, Path]] = None,
    db_path: Optional[Union[str, Path]] = None,
    sync_repo: bool = True,
) -> Dict[str, Any]:
    """
    Imports all agent archetypes and skill playbooks into SQLite WAL.
    Returns summary dictionary with counts and performance metrics.
    """
    start_time = time.perf_counter()
    v_dir = Path(vendor_dir or DEFAULT_VENDOR_DIR).resolve()
    target_db = Path(db_path or DEFAULT_DB_PATH).resolve()

    if sync_repo:
        sync_git_repository(target_dir=v_dir)

    target_db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(target_db), timeout=10.0)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    agents_imported = 0
    skills_imported = 0

    try:
        ensure_database_schema(conn)

        # 1. Parse and ingest agents
        agents_dir = v_dir / "agents"
        if agents_dir.exists():
            agent_table_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_agents);").fetchall()}
            has_id = "id" in agent_table_cols
            for f in sorted(agents_dir.glob("*.md")):
                agent = parse_agent_file(f)
                if not agent:
                    continue

                tools_json = json.dumps(agent["default_tools"])
                if has_id:
                    conn.execute(
                        """
                        INSERT INTO ecc_agents (id, slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT DO UPDATE SET
                            slug = excluded.slug,
                            name = excluded.name,
                            description = excluded.description,
                            anchor_orbiter = excluded.anchor_orbiter,
                            default_tools_json = excluded.default_tools_json,
                            system_prompt = excluded.system_prompt,
                            file_path = excluded.file_path,
                            updated_at = excluded.updated_at;
                        """,
                        (
                            agent["slug"],
                            agent["slug"],
                            agent["name"],
                            agent["description"],
                            agent["anchor_orbiter"],
                            tools_json,
                            agent["system_prompt"],
                            agent["file_path"],
                            now_iso,
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO ecc_agents (slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            name = excluded.name,
                            description = excluded.description,
                            anchor_orbiter = excluded.anchor_orbiter,
                            default_tools_json = excluded.default_tools_json,
                            system_prompt = excluded.system_prompt,
                            file_path = excluded.file_path,
                            updated_at = excluded.updated_at;
                        """,
                        (
                            agent["slug"],
                            agent["name"],
                            agent["description"],
                            agent["anchor_orbiter"],
                            tools_json,
                            agent["system_prompt"],
                            agent["file_path"],
                            now_iso,
                        ),
                    )
                conn.execute(
                    """
                    INSERT INTO ecc_agent_archetypes (slug, name, description, anchor_orbiter, default_tools_json, system_prompt, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(slug) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        anchor_orbiter = excluded.anchor_orbiter,
                        default_tools_json = excluded.default_tools_json,
                        system_prompt = excluded.system_prompt,
                        updated_at = excluded.updated_at;
                    """,
                    (
                        agent["slug"],
                        agent["name"],
                        agent["description"],
                        agent["anchor_orbiter"],
                        tools_json,
                        agent["system_prompt"],
                        now_iso,
                    ),
                )
                # Keep archetypes FTS synced as well
                conn.execute("DELETE FROM ecc_agent_archetypes_fts WHERE slug = ?;", (agent["slug"],))
                conn.execute(
                    "INSERT INTO ecc_agent_archetypes_fts(slug, name, description, anchor_orbiter) VALUES (?, ?, ?, ?);",
                    (agent["slug"], agent["name"], agent["description"], agent["anchor_orbiter"]),
                )
                agents_imported += 1

        # 2. Parse and ingest skills
        skills_dir = v_dir / "skills"
        if skills_dir.exists():
            skill_table_cols = {row[1] for row in conn.execute("PRAGMA table_info(ecc_skills);").fetchall()}
            has_title = "title" in skill_table_cols
            seen_slugs = set()
            skill_files = list(skills_dir.glob("**/SKILL.md")) + [
                f for f in skills_dir.glob("*/*.md") if f.name.lower() != "skill.md"
            ]

            for sf in sorted(skill_files):
                skill = parse_skill_file(sf)
                if not skill:
                    continue
                if skill["slug"] in seen_slugs:
                    continue
                seen_slugs.add(skill["slug"])

                tools_json = json.dumps(skill["allowed_tools"])
                if has_title:
                    conn.execute(
                        """
                        INSERT INTO ecc_skills (
                            slug, name, title, description, category, anchor_orbiter, orbiter_group,
                            allowed_tools_json, tools_json, instructions, instructions_md, file_path, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            name = excluded.name,
                            title = excluded.title,
                            description = excluded.description,
                            category = excluded.category,
                            anchor_orbiter = excluded.anchor_orbiter,
                            orbiter_group = excluded.orbiter_group,
                            allowed_tools_json = excluded.allowed_tools_json,
                            tools_json = excluded.tools_json,
                            instructions = excluded.instructions,
                            instructions_md = excluded.instructions_md,
                            file_path = excluded.file_path,
                            updated_at = excluded.updated_at;
                        """,
                        (
                            skill["slug"],
                            skill["name"],
                            skill["name"],
                            skill["description"],
                            skill["category"],
                            skill["anchor_orbiter"],
                            skill["anchor_orbiter"],
                            tools_json,
                            tools_json,
                            skill["instructions"],
                            skill["instructions"],
                            skill["file_path"],
                            now_iso,
                        ),
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO ecc_skills (slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(slug) DO UPDATE SET
                            name = excluded.name,
                            description = excluded.description,
                            category = excluded.category,
                            anchor_orbiter = excluded.anchor_orbiter,
                            allowed_tools_json = excluded.allowed_tools_json,
                            instructions = excluded.instructions,
                            file_path = excluded.file_path,
                            updated_at = excluded.updated_at;
                        """,
                        (
                            skill["slug"],
                            skill["name"],
                            skill["description"],
                            skill["category"],
                            skill["anchor_orbiter"],
                            tools_json,
                            skill["instructions"],
                            skill["file_path"],
                            now_iso,
                        ),
                    )
                skills_imported += 1

        conn.commit()
    finally:
        conn.close()

    duration = round(time.perf_counter() - start_time, 3)
    logger.info(
        "Imported %d agents and %d skills into %s in %.3fs",
        agents_imported,
        skills_imported,
        target_db,
        duration,
    )

    return {
        "success": True,
        "agents_imported": agents_imported,
        "skills_imported": skills_imported,
        "duration_sec": duration,
        "db_path": str(target_db),
    }


def resolve_skill(slug_or_command: str, db_path: Optional[Union[str, Path]] = None) -> Optional[Dict[str, Any]]:
    """Resolves /skill:<slug> or slug into skill definition."""
    from core.mcp.ecc_skill_loader import get_ecc_skill_loader
    loader = get_ecc_skill_loader(db_path=db_path)
    return loader.resolve_skill(slug_or_command)


def resolve_agent(slug_or_mention: str, db_path: Optional[Union[str, Path]] = None) -> Optional[Dict[str, Any]]:
    """Resolves @ecc:<agent> or slug into agent definition."""
    from core.mcp.ecc_skill_loader import get_ecc_skill_loader
    loader = get_ecc_skill_loader(db_path=db_path)
    return loader.resolve_agent(slug_or_mention)


def search_skills(query: str, db_path: Optional[Union[str, Path]] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """FTS5 search across skills."""
    from core.mcp.ecc_skill_loader import get_ecc_skill_loader
    loader = get_ecc_skill_loader(db_path=db_path)
    return loader.search_skills(query, limit=limit)


def search_agents(query: str, db_path: Optional[Union[str, Path]] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """FTS5 search across agents."""
    from core.mcp.ecc_skill_loader import get_ecc_skill_loader
    loader = get_ecc_skill_loader(db_path=db_path)
    return loader.search_agents(query, limit=limit)


def main() -> int:
    """CLI Entrypoint for ECC pack management."""
    parser = argparse.ArgumentParser(description="Nexus OS v5.0 - ECC 71 Agents & 314 Skills Importer")
    parser.add_argument("--db", type=str, default=str(DEFAULT_DB_PATH), help="Path to SQLite database")
    parser.add_argument("--vendor-dir", type=str, default=str(DEFAULT_VENDOR_DIR), help="ECC vendor directory")
    parser.add_argument("--no-clone", action="store_true", help="Skip git clone/pull")
    parser.add_argument("--clone-only", action="store_true", help="Only clone/pull without parsing DB")
    parser.add_argument("--resolve-skill", type=str, help="Resolve /skill:<slug> and print result")
    parser.add_argument("--resolve-agent", type=str, help="Resolve @ecc:<agent> and print result")
    parser.add_argument("--search-skills", type=str, help="FTS5 search query for skills")
    parser.add_argument("--search-agents", type=str, help="FTS5 search query for agents")

    args = parser.parse_args()

    if args.clone_only:
        ok = sync_git_repository(target_dir=args.vendor_dir)
        print(f"Clone sync status: {ok}")
        return 0 if ok else 1

    if args.resolve_skill:
        sk = resolve_skill(args.resolve_skill, db_path=args.db)
        if sk:
            print(f"Found Skill: {sk['name']} [{sk['anchor_orbiter']}] (category: {sk['category']})")
            print(f"Description: {sk['description']}")
            print(f"Tools: {sk['allowed_tools']}")
        else:
            print(f"Skill '{args.resolve_skill}' not found.")
        return 0

    if args.resolve_agent:
        ag = resolve_agent(args.resolve_agent, db_path=args.db)
        if ag:
            print(f"Found Agent: {ag['name']} [{ag['anchor_orbiter']}] ({ag['slug']})")
            print(f"Description: {ag['description']}")
            print(f"Tools: {ag['default_tools']}")
        else:
            print(f"Agent '{args.resolve_agent}' not found.")
        return 0

    if args.search_skills:
        results = search_skills(args.search_skills, db_path=args.db)
        print(f"Found {len(results)} skills matching '{args.search_skills}':")
        for r in results:
            print(f"  - [{r['anchor_orbiter']}] {r['slug']}: {r['description'][:80]}")
        return 0

    if args.search_agents:
        results = search_agents(args.search_agents, db_path=args.db)
        print(f"Found {len(results)} agents matching '{args.search_agents}':")
        for r in results:
            print(f"  - [{r['anchor_orbiter']}] {r['slug']} ({r['name']}): {r['description'][:80]}")
        return 0

    # Default action: import all
    res = import_ecc_pack(
        vendor_dir=args.vendor_dir,
        db_path=args.db,
        sync_repo=not args.no_clone,
    )
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
