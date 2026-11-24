"""Nexus OS v5.0 - Local Sovereignty Memory Store.

Implements absolute local-first data sovereignty:
- Zero cloud leakage: all reasoning traces, memory graphs, and code diffs reside locally
  under ~/.nexus-agent/db/agent_local.db
- High-performance SQLite engine configured with WAL journal mode, NORMAL synchronous,
  and 64MB memory caching
- Full-Text Search (FTS5) with automated synchronization triggers
- Native vector search using sqlite-vec (with cosine similarity fallback)
- Namespace scoping ([DEV], [STUDY], [STUDIO], [SILENT])
- Integrated DPAPI / AES-256 encryption for sensitive memory items
"""

from __future__ import annotations

import datetime
import json
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
import struct
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from core.bridge.persona_engine import (
    PERSONA_PRESETS,
    PersonaTelemetry,
    clamp_pct,
    notify_persona_listeners,
    resolve_voice_engine,
)

logger = logging.getLogger("nexus.memory.sovereign_store")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [SOVEREIGN_STORE] %(message)s")

# -----------------------------------------------------------------------------
# Telemetry Secret Scrubber (Regex Pattern Redacting Sensitive Tokens)
# -----------------------------------------------------------------------------
_SECRET_PATTERNS = [
    (re.compile(r"(?:api[_-]?key|apikey|secret|password|passwd|token|auth[_-]?token|bearer)\s*[:=]\s*['\"]?([a-zA-Z0-9_\-\.]{8,})['\"]?", re.IGNORECASE), r"\1"),
    (re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----"), "[REDACTED_PRIVATE_KEY]"),
    (re.compile(r"\b(?:sk|pk)_(?:live|test)_[0-9a-zA-Z]{20,}\b"), "[REDACTED_KEY]"),
    (re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"), "[REDACTED_GOOGLE_KEY]"),
    (re.compile(r"\bgh[pousr]_[0-9a-zA-Z]{36}\b"), "[REDACTED_GITHUB_TOKEN]"),
    (re.compile(r"\bBearer\s+[a-zA-Z0-9_\-\.]{16,}\b", re.IGNORECASE), "Bearer [REDACTED_TOKEN]"),
]


def scrub_secrets(text: str) -> str:
    """Redacts API keys, credentials, tokens, private keys, and passwords from log and telemetry text."""
    if not text or not isinstance(text, str):
        return text
    scrubbed = text
    for pattern, replacement in _SECRET_PATTERNS:
        if replacement == r"\1":
            def _sub_val(m):
                full_str = m.group(0)
                secret_val = m.group(1)
                return full_str.replace(secret_val, "[REDACTED]")
            scrubbed = pattern.sub(_sub_val, scrubbed)
        else:
            scrubbed = pattern.sub(replacement, scrubbed)
    return scrubbed

# Attempt sqlite-vec extension import
try:
    import sqlite_vec
    HAS_SQLITE_VEC = True
except ImportError:
    sqlite_vec = None
    HAS_SQLITE_VEC = False
    logger.info("sqlite-vec module not detected; standard cosine vector index will be used.")

# Attempt vault encryption import
try:
    from core.security.vault import decrypt_secret, encrypt_secret
    HAS_VAULT = True
except ImportError:
    HAS_VAULT = False

# Attempt cloud sync adapter import
try:
    from core.memory.cloud_sync import CloudMemorySyncAdapter
    HAS_CLOUD_SYNC = True
except ImportError:
    CloudMemorySyncAdapter = None  # type: ignore
    HAS_CLOUD_SYNC = False

from dataclasses import dataclass

@dataclass
class IngestedFile:
    """Metadata representation of an ingested file or directory."""
    name: str
    path: str
    size_bytes: int
    is_dir: bool
    extension: str
    sha256: str
    timestamp: float

    def format_size(self) -> str:
        """Returns human-readable size string."""
        if self.is_dir:
            return "Folder"
        size = float(self.size_bytes)
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024.0 or unit == "GB":
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} GB"



class SovereignMemoryStore:
    """Production local sovereignty store with WAL mode, FTS5, and vector search."""

    DEFAULT_DB_PATH = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    VECTOR_DIM = 384  # Default embedding dimension (e.g. all-MiniLM-L6-v2)

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        vector_dim: int = 384,
    ) -> None:
        if db_path is None:
            self.db_path = self.DEFAULT_DB_PATH
        else:
            self.db_path = Path(db_path)

        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self.vector_dim = vector_dim
        self._vec_extension_loaded = False
        self._init_database()

    def _get_connection(self) -> sqlite3.Connection:
        """Creates connection tuned for WAL performance and loads sqlite-vec if available."""
        if not hasattr(self, "_local"):
            self._local = threading.local()
        cached = getattr(self._local, "conn", None)
        if cached is not None:
            try:
                cached.total_changes
                return cached
            except Exception as conn_err:
                logger.debug("Cached DB connection expired: %s", conn_err)

        if str(self.db_path) == ":memory:":
            conn = sqlite3.connect(":memory:")
        else:
            conn = sqlite3.connect(str(self.db_path), timeout=15.0)
            try:
                conn.execute("PRAGMA busy_timeout = 15000;")
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("PRAGMA synchronous = NORMAL;")
                conn.execute("PRAGMA temp_store = MEMORY;")
                conn.execute("PRAGMA mmap_size = 268435456;")  # 256MB memory map
                conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache
            except sqlite3.OperationalError as exc:
                logger.warning("SQLite PRAGMA tuning fallback: %s", exc)

        conn.row_factory = sqlite3.Row

        # Try to load sqlite-vec extension
        if HAS_SQLITE_VEC and sqlite_vec is not None:
            try:
                conn.enable_load_extension(True)
                sqlite_vec.load(conn)
                self._vec_extension_loaded = True
            except Exception as exc:
                logger.debug("Could not load sqlite-vec extension on connection: %s", exc)

        self._local.conn = conn
        return conn

    def close(self) -> None:
        """Closes cached thread-local SQLite connection."""
        if hasattr(self, "_local"):
            cached = getattr(self._local, "conn", None)
            if cached is not None:
                try:
                    cached.close()
                except Exception as close_err:
                    logger.debug("Closing cached thread-local connection notice: %s", close_err)
                self._local.conn = None

    def _init_database(self) -> None:
        """Initializes tables, FTS5 virtual table, triggers, and vec0 if available."""
        conn = self._get_connection()
        try:
            # 1. Base Memory Nodes Table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_nodes (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata_json TEXT,
                    embedding_blob BLOB,
                    is_encrypted INTEGER NOT NULL DEFAULT 0,
                    is_archived INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            try:
                conn.execute("ALTER TABLE memory_nodes ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;")
            except Exception as col_err:
                logger.debug("Column is_archived may already exist: %s", col_err)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_namespace ON memory_nodes(namespace);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_updated ON memory_nodes(updated_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_archived ON memory_nodes(is_archived);")

            # 1b. Facts Table with Write-Gate Distinction (Ephemeral vs Verified)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS facts (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    is_verified INTEGER NOT NULL DEFAULT 0,
                    is_ephemeral INTEGER NOT NULL DEFAULT 1,
                    category TEXT NOT NULL DEFAULT 'general',
                    namespace TEXT NOT NULL DEFAULT 'default',
                    metadata_json TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_facts_verified ON facts(is_verified);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_facts_namespace ON facts(namespace);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);")

            # 2. FTS5 Virtual Table for BM25 Keyword Search
            conn.execute(
                """
                CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
                    id UNINDEXED,
                    namespace,
                    title,
                    content,
                    tokenize = 'porter unicode61'
                );
                """
            )

            # 3. Automated Triggers for FTS Sync
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_memory_nodes_ai AFTER INSERT ON memory_nodes
                BEGIN
                    INSERT INTO memory_fts(id, namespace, title, content)
                    VALUES (new.id, new.namespace, new.title, new.content);
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_memory_nodes_ad AFTER DELETE ON memory_nodes
                BEGIN
                    DELETE FROM memory_fts WHERE id = old.id;
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_memory_nodes_au AFTER UPDATE ON memory_nodes
                BEGIN
                    DELETE FROM memory_fts WHERE id = old.id;
                    INSERT INTO memory_fts(id, namespace, title, content)
                    VALUES (new.id, new.namespace, new.title, new.content);
                END;
                """
            )

            # 4. Initialize sqlite-vec virtual table if extension active
            if self._vec_extension_loaded:
                try:
                    conn.execute(
                        f"""
                        CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory USING vec0(
                            id TEXT PRIMARY KEY,
                            embedding float[{self.vector_dim}]
                        );
                        """
                    )
                except Exception as exc:
                    logger.debug("vec0 table creation skipped: %s", exc)

            # 5. Persona Settings Table (WAL Mode)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS persona_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    empathy_pct INTEGER DEFAULT 80,
                    humor_pct INTEGER DEFAULT 45,
                    candor_pct INTEGER DEFAULT 85,
                    verbosity_pct INTEGER DEFAULT 45,
                    voice_id TEXT DEFAULT 'af_heart',
                    voice_engine TEXT DEFAULT 'kokoro',
                    active_preset TEXT DEFAULT 'CARING_COMPANION',
                    updated_at TEXT
                );
                """
            )
            try:
                conn.execute("ALTER TABLE persona_settings ADD COLUMN voice_engine TEXT DEFAULT 'kokoro';")
            except Exception as exc:
                logger.debug("voice_engine column already exists in persona_settings: %s", exc)

            conn.execute(
                """
                INSERT OR IGNORE INTO persona_settings (
                    id, empathy_pct, humor_pct, candor_pct, verbosity_pct, voice_id, voice_engine, active_preset, updated_at
                ) VALUES (1, 80, 45, 85, 45, 'af_heart', 'kokoro', 'CARING_COMPANION', datetime('now'));
                """
            )

            # 6. Telemetry Logs Table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source TEXT NOT NULL,
                    level TEXT NOT NULL DEFAULT 'INFO',
                    message TEXT NOT NULL,
                    latency_ms REAL DEFAULT 0,
                    metadata TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

            # 7. Telemetry Events Table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS telemetry_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                """
            )

            # 8. Web Ingest Events Table (Shadow-DOM & AI Chat Captures)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS web_ingest_events (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL DEFAULT 'gemini_web',
                    url TEXT,
                    title TEXT DEFAULT '',
                    prompt TEXT,
                    response TEXT,
                    response_text TEXT,
                    elements_json TEXT,
                    commentary TEXT,
                    tars_commentary TEXT,
                    workspace_mode TEXT NOT NULL DEFAULT 'DEV',
                    created_at TEXT NOT NULL
                );
                """
            )
            # Automatic schema migration for existing databases
            try:
                existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(web_ingest_events);").fetchall()}
                if "source" not in existing_cols:
                    conn.execute("ALTER TABLE web_ingest_events ADD COLUMN source TEXT NOT NULL DEFAULT 'gemini_web';")
                if "response" not in existing_cols:
                    conn.execute("ALTER TABLE web_ingest_events ADD COLUMN response TEXT;")
                if "commentary" not in existing_cols:
                    conn.execute("ALTER TABLE web_ingest_events ADD COLUMN commentary TEXT;")
                if "workspace_mode" not in existing_cols:
                    conn.execute("ALTER TABLE web_ingest_events ADD COLUMN workspace_mode TEXT NOT NULL DEFAULT 'DEV';")
            except Exception as exc:
                logger.debug("web_ingest_events migration notice: %s", exc)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_web_ingest_created ON web_ingest_events(created_at);")

            # 8b. Agent Reach Events Table (SCOUT-01 Fast Channel Reads & Searches)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS reach_events (
                    id TEXT PRIMARY KEY,
                    source_url TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'web',
                    title TEXT NOT NULL DEFAULT '',
                    content TEXT NOT NULL,
                    summary TEXT DEFAULT '',
                    workspace_mode TEXT NOT NULL DEFAULT 'DEV',
                    metadata_json TEXT DEFAULT '{}',
                    created_at REAL NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_reach_created ON reach_events(created_at);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_reach_workspace ON reach_events(workspace_mode);")

            # 8. Persistent Timers Table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS timers (
                    id TEXT PRIMARY KEY,
                    label TEXT,
                    duration_sec INTEGER NOT NULL,
                    remaining_sec INTEGER NOT NULL,
                    timer_type TEXT DEFAULT 'countdown',
                    status TEXT DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    metadata TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_timers_status ON timers(status);")

            # 9. ECC Context Keeper & Learned Instincts Tables
            # Check if project_contexts needs migration to project_path PRIMARY KEY
            try:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(project_contexts);").fetchall()]
                if cols and "project_path" not in cols:
                    conn.execute("DROP TABLE IF EXISTS project_contexts;")
            except Exception as ctx_mig_err:
                logger.debug("Project contexts migration notice: %s", ctx_mig_err)

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS project_contexts (
                    project_path TEXT PRIMARY KEY,
                    workspace_mode TEXT NOT NULL,
                    stack_json TEXT NOT NULL,
                    goal TEXT,
                    left_off TEXT,
                    next_steps_json TEXT,
                    decisions_json TEXT,
                    blockers_json TEXT,
                    git_head TEXT,
                    updated_at TEXT NOT NULL
                );
                """
            )

            # Check if learned_instincts needs migration to instinct_rule schema
            try:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(learned_instincts);").fetchall()]
                if cols and "instinct_rule" not in cols:
                    conn.execute("DROP TRIGGER IF EXISTS trg_learned_instincts_ai;")
                    conn.execute("DROP TRIGGER IF EXISTS trg_learned_instincts_ad;")
                    conn.execute("DROP TRIGGER IF EXISTS trg_learned_instincts_au;")
                    conn.execute("DROP TABLE IF EXISTS learned_instincts_fts;")
                    conn.execute("DROP TABLE IF EXISTS learned_instincts;")
            except Exception as inst_mig_err:
                logger.debug("Learned instincts migration notice: %s", inst_mig_err)

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learned_instincts (
                    id TEXT PRIMARY KEY,
                    trigger_pattern TEXT NOT NULL,
                    instinct_rule TEXT NOT NULL,
                    confidence_score REAL NOT NULL DEFAULT 0.85,
                    workspace_mode TEXT NOT NULL,
                    hit_count INTEGER DEFAULT 0,
                    source_slice_id TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_instinct_mode ON learned_instincts(workspace_mode);")

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

            # 10. AgentShield Security Audits Table
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS security_audits (
                    id TEXT PRIMARY KEY,
                    scanned_at TEXT NOT NULL,
                    target_path TEXT NOT NULL,
                    target_type TEXT NOT NULL DEFAULT 'plugin',
                    score INTEGER NOT NULL,
                    quarantined INTEGER NOT NULL DEFAULT 0,
                    findings_json TEXT NOT NULL DEFAULT '[]',
                    quarantined_plugins_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'CLEAN'
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_security_audits_time ON security_audits(scanned_at);")

            # 11. Ephemeral Swarm Agents Table (Phase 2 Self-Multiplying Mitosis Engine)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ephemeral_agents (
                    agent_id TEXT PRIMARY KEY,
                    swarm_id TEXT NOT NULL,
                    parent_id TEXT NOT NULL DEFAULT 'NEXUS-CORE',
                    anchor_orbiter TEXT NOT NULL DEFAULT 'DEV-01',
                    role_title TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    system_prompt TEXT NOT NULL,
                    allowed_tools_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'SPAWNED',
                    depth INTEGER NOT NULL DEFAULT 1,
                    token_budget INTEGER NOT NULL DEFAULT 2048,
                    result_summary TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    completed_at TEXT NOT NULL DEFAULT ''
                );
                """
            )
            try:
                cursor = conn.execute("PRAGMA table_info(ephemeral_agents);")
                cols = [row[1] for row in cursor.fetchall()]
                if "swarm_id" not in cols:
                    conn.execute("ALTER TABLE ephemeral_agents ADD COLUMN swarm_id TEXT NOT NULL DEFAULT 'SWARM-CORE';")
            except Exception as e_col_err:
                logger.debug("ephemeral_agents column check notice: %s", e_col_err)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_ephemeral_swarm_status ON ephemeral_agents(swarm_id, status);")

            # 12. ECC Agent Archetypes Table & FTS5 Index (71 Specialist Archetypes)
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
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_ecc_archetypes_ai AFTER INSERT ON ecc_agent_archetypes
                BEGIN
                    INSERT INTO ecc_agent_archetypes_fts(slug, name, description, anchor_orbiter)
                    VALUES (new.slug, new.name, new.description, new.anchor_orbiter);
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_ecc_archetypes_ad AFTER DELETE ON ecc_agent_archetypes
                BEGIN
                    DELETE FROM ecc_agent_archetypes_fts WHERE slug = old.slug;
                END;
                """
            )
            conn.execute(
                """
                CREATE TRIGGER IF NOT EXISTS trg_ecc_archetypes_au AFTER UPDATE ON ecc_agent_archetypes
                BEGIN
                    DELETE FROM ecc_agent_archetypes_fts WHERE slug = old.slug;
                    INSERT INTO ecc_agent_archetypes_fts(slug, name, description, anchor_orbiter)
                    VALUES (new.slug, new.name, new.description, new.anchor_orbiter);
                END;
                """
            )

            # 12b. ECC Agents Table & FTS5 Index (71 Specialist Agents)
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
            except Exception as e_mig_err:
                logger.debug("ecc_agents migration notice: %s", e_mig_err)

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

            # 12c. ECC Skills Table & FTS5 Index (314+ Skill Playbooks)
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
                    if "skill_slug" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN skill_slug TEXT DEFAULT '';")
                        if "slug" in skill_cols:
                            conn.execute("UPDATE ecc_skills SET skill_slug = slug WHERE skill_slug = '';")
                    if "orbiter_group" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN orbiter_group TEXT DEFAULT 'DEV-01';")
                        if "anchor_orbiter" in skill_cols:
                            conn.execute("UPDATE ecc_skills SET orbiter_group = anchor_orbiter WHERE orbiter_group = 'DEV-01';")
                    if "instinct_id" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN instinct_id TEXT DEFAULT '';")
                    if "content" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN content TEXT DEFAULT '';")
                    if "promoted_at" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN promoted_at TEXT DEFAULT '';")
                    if "updated_at" not in skill_cols:
                        conn.execute("ALTER TABLE ecc_skills ADD COLUMN updated_at TEXT DEFAULT '';")
            except Exception as s_mig_err:
                logger.debug("ecc_skills migration notice: %s", s_mig_err)

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

            # 13. Voiceprints Table (Speaker Biometrics & Enrolled Embeddings)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS voiceprints (
                    id TEXT PRIMARY KEY,
                    speaker_id TEXT NOT NULL,
                    voiceprint_hash TEXT,
                    embedding_blob BLOB,
                    status TEXT DEFAULT 'enrolled',
                    metadata_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_voiceprints_speaker ON voiceprints(speaker_id);")

            # 14. Voice Security Logs Table (Biometric Verification Audit Trail)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS voice_security_logs (
                    id TEXT PRIMARY KEY,
                    speaker_id TEXT,
                    action TEXT NOT NULL,
                    speaker_role TEXT NOT NULL DEFAULT 'GUEST',
                    confidence REAL DEFAULT 0.0,
                    status TEXT NOT NULL,
                    details TEXT,
                    timestamp TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_voice_sec_time ON voice_security_logs(timestamp);")

            # 15. Macros Table (Desktop Workflow Automation Sequences)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS macros (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    steps_json TEXT NOT NULL,
                    trigger_phrase TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_macros_name ON macros(name);")

            # 16. Expenses Table (Financial Tracking & Autonomous Ledger)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS expenses (
                    id TEXT PRIMARY KEY,
                    amount REAL NOT NULL,
                    currency TEXT DEFAULT 'USD',
                    category TEXT NOT NULL,
                    description TEXT,
                    date TEXT NOT NULL,
                    status TEXT DEFAULT 'logged',
                    metadata_json TEXT,
                    created_at TEXT NOT NULL
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);")

            # 17. UI Preferences Table (HUD coordinates & Device IDs)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ui_preferences (
                    pref_key TEXT PRIMARY KEY,
                    pref_value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

            # 18. Provider Configurations Table (All 45+ API Providers & Inference Gateways)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_configs (
                    provider_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    protocol TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    key_console_url TEXT NOT NULL,
                    auth_header TEXT DEFAULT 'Authorization',
                    auth_prefix TEXT DEFAULT 'Bearer ',
                    selected_model TEXT NOT NULL,
                    extra_config_json TEXT DEFAULT '{}',
                    free_tier_badge TEXT DEFAULT '',
                    priority_order INTEGER DEFAULT 100,
                    enabled INTEGER DEFAULT 0,
                    has_key INTEGER DEFAULT 0,
                    last_latency_ms REAL,
                    last_status TEXT DEFAULT 'UNCONFIGURED',
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_provider_category ON provider_configs(category);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_provider_priority ON provider_configs(priority_order);")

            # 19. Unified Model Catalog (Original + Verified Abliterated + Voice Models)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS model_catalog (
                    model_uid TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    creator TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    api_or_hf_id TEXT NOT NULL,
                    runtime_target TEXT NOT NULL,
                    modality TEXT NOT NULL,
                    is_abliterated INTEGER DEFAULT 0,
                    abliteration_source TEXT DEFAULT '',
                    voice_compatible INTEGER DEFAULT 0,
                    voice_role TEXT DEFAULT '',
                    vram_gb REAL DEFAULT 0,
                    ram_gb REAL DEFAULT 0,
                    quant_tag TEXT DEFAULT '',
                    intelligence_index REAL,
                    cost_per_task_usd REAL,
                    time_per_task_min REAL,
                    ttft_sec REAL,
                    error_rate_pct REAL,
                    context_window TEXT,
                    license TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_provider ON model_catalog(provider_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_target ON model_catalog(runtime_target);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_voice ON model_catalog(voice_compatible);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_model_abliterated ON model_catalog(is_abliterated);")

            # 20. Saved Cloud Worker Profiles (Kaggle & Hugging Face)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cloud_worker_profiles (
                    profile_id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    accelerator TEXT NOT NULL,
                    primary_model_tag TEXT NOT NULL,
                    is_abliterated INTEGER DEFAULT 0,
                    voice_sidecar TEXT DEFAULT 'none',
                    idle_timeout_sec INTEGER DEFAULT 600,
                    endpoint_url TEXT DEFAULT '',
                    status TEXT DEFAULT 'OFFLINE',
                    last_heartbeat TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_cloud_worker_platform ON cloud_worker_profiles(platform);")

            # 21. Failover & Latency Audit Trail
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS provider_failover_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_provider TEXT NOT NULL,
                    to_provider TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    latency_ms REAL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_failover_created ON provider_failover_logs(created_at);")

            # 22. Role-Based Routing Slots
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS role_assignments (
                    role_id TEXT PRIMARY KEY,
                    provider_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

            # 23. Routing Guardrails & Spend Caps
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS routing_guardrails (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    free_tier_only INTEGER DEFAULT 1,
                    allow_paid_failover INTEGER DEFAULT 0,
                    daily_budget_usd REAL DEFAULT 5.0,
                    daily_spend_usd REAL DEFAULT 0.0,
                    budget_date TEXT
                );
                """
            )
            conn.execute(
                """
                INSERT OR IGNORE INTO routing_guardrails (id, free_tier_only, allow_paid_failover, daily_budget_usd, daily_spend_usd, budget_date)
                VALUES (1, 1, 0, 5.0, 0.0, date('now'));
                """
            )

            # 24. Custom Theme Forge Table (v5.0)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_themes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    is_builtin INTEGER DEFAULT 0,
                    tokens_json TEXT NOT NULL,
                    is_active INTEGER DEFAULT 0,
                    updated_at TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_themes_active ON user_themes(is_active);")

            # 25. Custom Agent Wallpaper Table (v5.0)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_wallpapers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    source_path TEXT NOT NULL,
                    mode_binding TEXT DEFAULT 'GLOBAL',
                    config_json TEXT NOT NULL,
                    is_active INTEGER DEFAULT 0,
                    updated_at TEXT
                );
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_wallpapers_active ON user_wallpapers(is_active);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_wallpapers_mode ON user_wallpapers(mode_binding);")

            # Seed 6 Built-in Themes
            builtin_themes = [
                (
                    "obsidian_cyber",
                    "Obsidian Cyber",
                    1,
                    json.dumps({
                        "void_bg": "#030711",
                        "accent_primary": "#00F5D4",
                        "accent_secondary": "#38BDF8",
                        "accent_danger": "#EF4444",
                        "surface_tint": "#061325",
                        "text_primary": "#F8FAFC",
                        "text_muted": "#64748B",
                        "glass_opacity": 0.85,
                        "glass_blur_px": 20,
                        "border_glow_intensity": 0.65,
                        "corner_brackets": True,
                        "scanline_opacity": 0.08,
                        "film_grain_opacity": 0.04,
                        "kinetic_cipher_speed": "normal",
                        "typography_pair": "Space Grotesk + JetBrains Mono",
                        "core_morphology": "dyson",
                        "orbiter_colors": {
                            "DEV-01": "#00F5D4",
                            "SYS-01": "#38BDF8",
                            "SCOUT-01": "#F59E0B",
                            "SEC-01": "#10B981",
                            "OPS-01": "#8B5CF6"
                        }
                    }),
                    1,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "atlas_bio_plasma",
                    "Atlas Bio-Plasma",
                    1,
                    json.dumps({
                        "void_bg": "#040812",
                        "accent_primary": "#22D3EE",
                        "accent_secondary": "#F472B6",
                        "accent_danger": "#EF4444",
                        "surface_tint": "#081326",
                        "text_primary": "#F0FDF4",
                        "text_muted": "#64748B",
                        "glass_opacity": 0.82,
                        "glass_blur_px": 22,
                        "border_glow_intensity": 0.75,
                        "corner_brackets": True,
                        "scanline_opacity": 0.06,
                        "film_grain_opacity": 0.03,
                        "kinetic_cipher_speed": "normal",
                        "typography_pair": "Space Grotesk + JetBrains Mono",
                        "core_morphology": "atlas",
                        "orbiter_colors": {
                            "DEV-01": "#22D3EE",
                            "SYS-01": "#38BDF8",
                            "SCOUT-01": "#F472B6",
                            "SEC-01": "#34D399",
                            "OPS-01": "#A78BFA"
                        }
                    }),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "nebula_vortex",
                    "Nebula Vortex",
                    1,
                    json.dumps({
                        "void_bg": "#070514",
                        "accent_primary": "#A855F7",
                        "accent_secondary": "#F59E0B",
                        "accent_danger": "#EF4444",
                        "surface_tint": "#120B28",
                        "text_primary": "#FAF5FF",
                        "text_muted": "#71717A",
                        "glass_opacity": 0.85,
                        "glass_blur_px": 24,
                        "border_glow_intensity": 0.70,
                        "corner_brackets": True,
                        "scanline_opacity": 0.07,
                        "film_grain_opacity": 0.05,
                        "kinetic_cipher_speed": "normal",
                        "typography_pair": "Space Grotesk + JetBrains Mono",
                        "core_morphology": "vortex",
                        "orbiter_colors": {
                            "DEV-01": "#A855F7",
                            "SYS-01": "#EC4899",
                            "SCOUT-01": "#F59E0B",
                            "SEC-01": "#06B6D4",
                            "OPS-01": "#8B5CF6"
                        }
                    }),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "tactical_ember",
                    "Tactical Ember",
                    1,
                    json.dumps({
                        "void_bg": "#050505",
                        "accent_primary": "#FF5500",
                        "accent_secondary": "#F4F4F5",
                        "accent_danger": "#DC2626",
                        "surface_tint": "#170D08",
                        "text_primary": "#FAFAFA",
                        "text_muted": "#71717A",
                        "glass_opacity": 0.88,
                        "glass_blur_px": 18,
                        "border_glow_intensity": 0.80,
                        "corner_brackets": True,
                        "scanline_opacity": 0.10,
                        "film_grain_opacity": 0.06,
                        "kinetic_cipher_speed": "fast",
                        "typography_pair": "Orbitron + Fira Code",
                        "core_morphology": "helix",
                        "orbiter_colors": {
                            "DEV-01": "#FF5500",
                            "SYS-01": "#F97316",
                            "SCOUT-01": "#EAB308",
                            "SEC-01": "#EF4444",
                            "OPS-01": "#71717A"
                        }
                    }),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "monochrome_optics",
                    "Monochrome Optics",
                    1,
                    json.dumps({
                        "void_bg": "#020202",
                        "accent_primary": "#E5E7EB",
                        "accent_secondary": "#EF4444",
                        "accent_danger": "#DC2626",
                        "surface_tint": "#111111",
                        "text_primary": "#FFFFFF",
                        "text_muted": "#52525B",
                        "glass_opacity": 0.90,
                        "glass_blur_px": 16,
                        "border_glow_intensity": 0.50,
                        "corner_brackets": True,
                        "scanline_opacity": 0.05,
                        "film_grain_opacity": 0.02,
                        "kinetic_cipher_speed": "fast",
                        "typography_pair": "Rajdhani + IBM Plex Mono",
                        "core_morphology": "dyson",
                        "orbiter_colors": {
                            "DEV-01": "#E5E7EB",
                            "SYS-01": "#D1D5DB",
                            "SCOUT-01": "#EF4444",
                            "SEC-01": "#9CA3AF",
                            "OPS-01": "#6B7280"
                        }
                    }),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "biometric_matrix",
                    "Biometric Matrix",
                    1,
                    json.dumps({
                        "void_bg": "#020B08",
                        "accent_primary": "#10B981",
                        "accent_secondary": "#84CC16",
                        "accent_danger": "#EF4444",
                        "surface_tint": "#041C14",
                        "text_primary": "#ECFDF5",
                        "text_muted": "#6EE7B7",
                        "glass_opacity": 0.85,
                        "glass_blur_px": 20,
                        "border_glow_intensity": 0.70,
                        "corner_brackets": True,
                        "scanline_opacity": 0.12,
                        "film_grain_opacity": 0.04,
                        "kinetic_cipher_speed": "normal",
                        "typography_pair": "Geist + JetBrains Mono",
                        "core_morphology": "dyson",
                        "orbiter_colors": {
                            "DEV-01": "#10B981",
                            "SYS-01": "#84CC16",
                            "SCOUT-01": "#06B6D4",
                            "SEC-01": "#059669",
                            "OPS-01": "#10B981"
                        }
                    }),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                )
            ]
            for t_id, t_name, t_builtin, t_tok, t_act, t_upd in builtin_themes:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO user_themes (id, name, is_builtin, tokens_json, is_active, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (t_id, t_name, t_builtin, t_tok, t_act, t_upd),
                )

            # Ensure at least one theme is active
            cur = conn.cursor()
            cur.execute("SELECT id FROM user_themes WHERE is_active = 1 LIMIT 1;")
            if not cur.fetchone():
                conn.execute("UPDATE user_themes SET is_active = 1 WHERE id = 'obsidian_cyber';")

            # Seed 5 Built-in WebGL Shader Wallpapers
            builtin_wallpapers = [
                (
                    "nebula_vortex_shader",
                    "Nebula Vortex WebGL",
                    "shader",
                    "shader://nebula_vortex",
                    "GLOBAL",
                    json.dumps({"opacity": 0.9, "blur": 0, "vignette": 0.4, "parallax": 12, "audio_reactive": True, "blend_mode": "screen"}),
                    1,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "plasma_waves_shader",
                    "Plasma Waves WebGL",
                    "shader",
                    "shader://plasma_waves",
                    "GLOBAL",
                    json.dumps({"opacity": 0.85, "blur": 0, "vignette": 0.3, "parallax": 10, "audio_reactive": True, "blend_mode": "screen"}),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "cyber_grid_shader",
                    "Cyber Horizon Grid",
                    "shader",
                    "shader://cyber_grid",
                    "GLOBAL",
                    json.dumps({"opacity": 0.8, "blur": 0, "vignette": 0.5, "parallax": 15, "audio_reactive": False, "blend_mode": "normal"}),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "constellation_starfield",
                    "Constellation Starfield",
                    "shader",
                    "shader://constellation_starfield",
                    "GLOBAL",
                    json.dumps({"opacity": 0.75, "blur": 0, "vignette": 0.2, "parallax": 8, "audio_reactive": False, "blend_mode": "screen"}),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                ),
                (
                    "pure_void",
                    "Pure Obsidian Void",
                    "shader",
                    "shader://pure_void",
                    "GLOBAL",
                    json.dumps({"opacity": 1.0, "blur": 0, "vignette": 0.0, "parallax": 0, "audio_reactive": False, "blend_mode": "normal"}),
                    0,
                    datetime.datetime.now(datetime.timezone.utc).isoformat(),
                )
            ]
            for w_id, w_name, w_kind, w_src, w_bind, w_cfg, w_act, w_upd in builtin_wallpapers:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO user_wallpapers (id, name, kind, source_path, mode_binding, config_json, is_active, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (w_id, w_name, w_kind, w_src, w_bind, w_cfg, w_act, w_upd),
                )

            # Ensure at least one wallpaper is active for GLOBAL
            cur.execute("SELECT id FROM user_wallpapers WHERE is_active = 1 AND mode_binding = 'GLOBAL' LIMIT 1;")
            if not cur.fetchone():
                conn.execute("UPDATE user_wallpapers SET is_active = 1 WHERE id = 'nebula_vortex_shader';")

            conn.commit()
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Vector Serialization Helpers
    # -------------------------------------------------------------------------
    @staticmethod
    def _pack_vector(vector: List[float]) -> bytes:
        """Packs float vector into compact binary format."""
        return struct.pack(f"{len(vector)}f", *vector)

    @staticmethod
    def _unpack_vector(blob: bytes) -> List[float]:
        """Unpacks binary float vector."""
        count = len(blob) // 4
        return list(struct.unpack(f"{count}f", blob))

    @staticmethod
    def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """Calculates cosine similarity between two float vectors."""
        if not v1 or not v2 or len(v1) != len(v2):
            return 0.0
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        if norm1 == 0.0 or norm2 == 0.0:
            return 0.0
        return dot / (norm1 * norm2)

    # -------------------------------------------------------------------------
    # Core CRUD Operations
    # -------------------------------------------------------------------------
    def insert_memory(
        self,
        content: str,
        title: Optional[str] = None,
        node_type: str = "CONTEXT",
        namespace: str = "default",
        importance: float = 0.5,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        embedding: Optional[List[float]] = None,
        encrypt: bool = False,
    ) -> str:
        """Stores a memory node into SQLite WAL with metadata, emitting a circuit pulse."""
        mem_title = title or (content[:50] + "..." if len(content) > 50 else content)
        meta = dict(metadata or {})
        meta["node_type"] = node_type
        meta["importance"] = importance
        if tags:
            meta["tags"] = tags
        return self.store_memory(
            title=mem_title,
            content=content,
            namespace=namespace,
            metadata=meta,
            embedding=embedding,
            encrypt=encrypt,
        )

    def store_memory(
        self,
        title: str,
        content: str,
        namespace: str = "default",
        node_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        embedding: Optional[List[float]] = None,
        encrypt: bool = False,
        is_archived: bool = False,
    ) -> str:
        """Stores or updates a memory node with full-text and vector embeddings."""
        active_id = node_id or f"mem_{uuid.uuid4().hex[:16]}"
        now = time.time()
        meta_str = json.dumps(metadata or {}, default=str)
        is_encrypted = 1 if encrypt else 0
        arch_val = 1 if (is_archived or (metadata and (metadata.get("is_archived") or metadata.get("archived")))) else 0

        stored_content = content
        if encrypt and HAS_VAULT:
            try:
                stored_content = encrypt_secret(content)
            except Exception as exc:
                logger.warning("Encryption failed, falling back to plaintext: %s", exc)
                is_encrypted = 0

        emb_blob = self._pack_vector(embedding) if embedding else None

        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO memory_nodes (id, namespace, title, content, metadata_json, embedding_blob, is_encrypted, is_archived, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    namespace = excluded.namespace,
                    title = excluded.title,
                    content = excluded.content,
                    metadata_json = excluded.metadata_json,
                    embedding_blob = excluded.embedding_blob,
                    is_encrypted = excluded.is_encrypted,
                    is_archived = excluded.is_archived,
                    updated_at = excluded.updated_at;
                """,
                (active_id, namespace.lower(), title, stored_content, meta_str, emb_blob, is_encrypted, arch_val, now, now),
            )

            # Sync sqlite-vec table if active
            if self._vec_extension_loaded and embedding and len(embedding) == self.vector_dim:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO vec_memory (id, embedding) VALUES (?, ?);",
                        (active_id, emb_blob),
                    )
                except Exception as exc:
                    logger.debug("vec_memory insert error: %s", exc)

            conn.commit()
            self._emit_pulse(f"Inserted: {title[:30]}", 2.1)
            return active_id
        finally:
            conn.close()

    def get_memory(self, node_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single memory node by ID."""
        conn = self._get_connection()
        try:
            row = conn.execute(
                "SELECT * FROM memory_nodes WHERE id = ? LIMIT 1;",
                (node_id,),
            ).fetchone()
            if not row:
                return None

            content = row["content"]
            if row["is_encrypted"] and HAS_VAULT:
                try:
                    content = decrypt_secret(content)
                except Exception as exc:
                    logger.warning("Decryption failed for node %s: %s", node_id, exc)

            embedding = self._unpack_vector(row["embedding_blob"]) if row["embedding_blob"] else None
            metadata = json.loads(row["metadata_json"]) if row["metadata_json"] else {}
            is_arch = False
            try:
                is_arch = bool(row["is_archived"])
            except Exception:
                is_arch = False

            return {
                "id": row["id"],
                "namespace": row["namespace"],
                "title": row["title"],
                "content": content,
                "metadata": metadata,
                "embedding": embedding,
                "is_encrypted": bool(row["is_encrypted"]),
                "is_archived": is_arch,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    def delete_memory(self, node_id: str) -> bool:
        """Deletes a memory node and cascades to FTS and vector indices."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("DELETE FROM memory_nodes WHERE id = ?;", (node_id,))
            if self._vec_extension_loaded:
                try:
                    conn.execute("DELETE FROM vec_memory WHERE id = ?;", (node_id,))
                except Exception as exc:
                    logger.debug("vec_memory delete suppressed: %s", exc)
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def _emit_pulse(self, detail: str = "Memory Pulse", latency_ms: float = 1.0, node: str = "MEMORY") -> None:
        """Records a circuit_pulse event into telemetry_events table for Electron UI."""
        try:
            conn = self._get_connection()
            try:
                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (
                        "circuit_pulse",
                        json.dumps({
                            "node": node,
                            "active": True,
                            "detail": detail,
                            "latency_ms": round(latency_ms, 2),
                        }),
                        time.time(),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Memory circuit pulse recording bypassed: %s", exc)

    def list_namespaces(self) -> List[str]:
        """Lists all active memory namespaces."""
        conn = self._get_connection()
        try:
            rows = conn.execute("SELECT DISTINCT namespace FROM memory_nodes ORDER BY namespace;").fetchall()
            return [r["namespace"] for r in rows]
        finally:
            conn.close()

    def list_memories(
        self,
        namespace: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Returns memory nodes ordered by updated_at descending, handling vault decryption."""
        conn = self._get_connection()
        try:
            if namespace:
                cur = conn.execute(
                    "SELECT id, namespace, title, content, metadata_json, is_encrypted, is_archived, updated_at FROM memory_nodes WHERE namespace = ? ORDER BY updated_at DESC LIMIT ?;",
                    (namespace.lower(), limit),
                )
            else:
                cur = conn.execute(
                    "SELECT id, namespace, title, content, metadata_json, is_encrypted, is_archived, updated_at FROM memory_nodes ORDER BY updated_at DESC LIMIT ?;",
                    (limit,),
                )
            rows = cur.fetchall()
            results: List[Dict[str, Any]] = []
            for r in rows:
                content = r["content"]
                if r["is_encrypted"] and HAS_VAULT:
                    try:
                        content = decrypt_secret(content)
                    except Exception as exc:
                        logger.debug("Decryption error during list: %s", exc)
                is_arch = False
                try:
                    is_arch = bool(r["is_archived"])
                except Exception:
                    is_arch = False
                results.append({
                    "id": r["id"],
                    "namespace": r["namespace"],
                    "title": r["title"],
                    "content": content,
                    "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] else {},
                    "is_archived": is_arch,
                    "updated_at": r["updated_at"],
                })
            return results
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Search Capabilities (FTS5 BM25, Vector, and Hybrid)
    # -------------------------------------------------------------------------
    @staticmethod
    def _sanitize_fts_query(query: str) -> str:
        """Sanitizes text query into safe FTS5 match syntax, escaping dots, hyphens, and punctuation."""
        clean = (query or "").strip()
        if not clean:
            return '""'
        if clean.startswith('"') and clean.endswith('"') and len(clean) >= 2:
            return clean
        tokens = re.findall(r'[\w\.-]+', clean)
        if tokens:
            return " ".join(f'"{t}"' for t in tokens)
        escaped = clean.replace('"', '""')
        return f'"{escaped}"'

    def search_text(
        self,
        query: str,
        namespace: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Executes full-text keyword search using FTS5 BM25 ranking."""
        if not query or not query.strip():
            return []

        clean_query = self._sanitize_fts_query(query)
        conn = self._get_connection()
        try:
            if namespace:
                sql = """
                    SELECT m.id, m.namespace, m.title, m.content, m.metadata_json, m.is_encrypted, m.is_archived, m.updated_at,
                           bm25(memory_fts) as rank
                    FROM memory_fts f
                    JOIN memory_nodes m ON f.id = m.id
                    WHERE memory_fts MATCH ? AND m.namespace = ?
                    ORDER BY rank ASC
                    LIMIT ?;
                """
                try:
                    rows = conn.execute(sql, (clean_query, namespace.lower(), limit)).fetchall()
                except sqlite3.OperationalError:
                    escaped_raw = query.replace('"', '""').strip()
                    rows = conn.execute(sql, (f'"{escaped_raw}"', namespace.lower(), limit)).fetchall()
            else:
                sql = """
                    SELECT m.id, m.namespace, m.title, m.content, m.metadata_json, m.is_encrypted, m.is_archived, m.updated_at,
                           bm25(memory_fts) as rank
                    FROM memory_fts f
                    JOIN memory_nodes m ON f.id = m.id
                    WHERE memory_fts MATCH ?
                    ORDER BY rank ASC
                    LIMIT ?;
                """
                try:
                    rows = conn.execute(sql, (clean_query, limit)).fetchall()
                except sqlite3.OperationalError:
                    escaped_raw = query.replace('"', '""').strip()
                    rows = conn.execute(sql, (f'"{escaped_raw}"', limit)).fetchall()

            results: List[Dict[str, Any]] = []
            for r in rows:
                content = r["content"]
                if r["is_encrypted"] and HAS_VAULT:
                    try:
                        content = decrypt_secret(content)
                    except Exception as exc:
                        logger.debug("Decryption error during search: %s", exc)
                is_arch = False
                try:
                    is_arch = bool(r["is_archived"])
                except Exception:
                    is_arch = False
                results.append({
                    "id": r["id"],
                    "namespace": r["namespace"],
                    "title": r["title"],
                    "content": content,
                    "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] else {},
                    "score": float(r["rank"]),
                    "is_archived": is_arch,
                    "match_type": "fts5_bm25",
                })
            self._emit_pulse(f"FTS5 Query: {query[:30]}", 1.2)
            return results
        finally:
            conn.close()

    def search_semantic(
        self,
        query_embedding: List[float],
        namespace: Optional[str] = None,
        top_k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Executes semantic similarity search using cosine similarity or sqlite-vec."""
        if not query_embedding:
            return []

        conn = self._get_connection()
        try:
            # 1. Try sqlite-vec vec0 search if loaded
            if self._vec_extension_loaded and len(query_embedding) == self.vector_dim:
                try:
                    q_blob = self._pack_vector(query_embedding)
                    sql = """
                        SELECT m.id, m.namespace, m.title, m.content, m.metadata_json, m.is_encrypted, m.is_archived,
                               v.distance
                        FROM vec_memory v
                        JOIN memory_nodes m ON v.id = m.id
                        WHERE v.embedding MATCH ? AND k = ?
                    """
                    params: List[Any] = [q_blob, top_k]
                    if namespace:
                        sql += " AND m.namespace = ?"
                        params.append(namespace.lower())
                    rows = conn.execute(sql, params).fetchall()
                    if rows:
                        results = []
                        for r in rows:
                            content = r["content"]
                            if r["is_encrypted"] and HAS_VAULT:
                                try:
                                    content = decrypt_secret(content)
                                except Exception as exc:
                                    logger.debug("Vec search decryption error: %s", exc)
                            is_arch = False
                            try:
                                is_arch = bool(r["is_archived"])
                            except Exception:
                                is_arch = False
                            results.append({
                                "id": r["id"],
                                "namespace": r["namespace"],
                                "title": r["title"],
                                "content": content,
                                "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] else {},
                                "is_archived": is_arch,
                                "similarity": 1.0 - float(r["distance"]),
                                "match_type": "sqlite_vec",
                            })
                        self._emit_pulse("sqlite-vec search", 1.8)
                        return results
                except Exception as exc:
                    logger.debug("vec0 query fallback: %s", exc)

            # 2. Resilient Python cosine similarity fallback across memory nodes
            sql = "SELECT id, namespace, title, content, metadata_json, embedding_blob, is_encrypted, is_archived FROM memory_nodes WHERE embedding_blob IS NOT NULL"
            params = []
            if namespace:
                sql += " AND namespace = ?"
                params.append(namespace.lower())
            rows = conn.execute(sql, params).fetchall()

            scored: List[Tuple[float, Any]] = []
            for r in rows:
                vec = self._unpack_vector(r["embedding_blob"])
                sim = self._cosine_similarity(query_embedding, vec)
                scored.append((sim, r))

            scored.sort(key=lambda x: x[0], reverse=True)
            results = []
            for sim, r in scored[:top_k]:
                content = r["content"]
                if r["is_encrypted"] and HAS_VAULT:
                    try:
                        content = decrypt_secret(content)
                    except Exception as exc:
                        logger.debug("Cosine search decryption error: %s", exc)
                is_arch = False
                try:
                    is_arch = bool(r["is_archived"])
                except Exception:
                    is_arch = False
                results.append({
                    "id": r["id"],
                    "namespace": r["namespace"],
                    "title": r["title"],
                    "content": content,
                    "metadata": json.loads(r["metadata_json"]) if r["metadata_json"] else {},
                    "is_archived": is_arch,
                    "similarity": round(sim, 4),
                    "match_type": "cosine_similarity",
                })
            self._emit_pulse("Cosine semantic search", 2.4)
            return results
        finally:
            conn.close()

    def search_hybrid(
        self,
        query_text: str,
        query_embedding: Optional[List[float]] = None,
        namespace: Optional[str] = None,
        limit: int = 10,
        rrf_k: int = 60,
    ) -> List[Dict[str, Any]]:
        """Combines FTS5 BM25 keyword matching and vector similarity via Reciprocal Rank Fusion (RRF)."""
        text_results = self.search_text(query_text, namespace=namespace, limit=limit * 2)
        semantic_results = (
            self.search_semantic(query_embedding, namespace=namespace, top_k=limit * 2)
            if query_embedding
            else []
        )

        rrf_scores: Dict[str, float] = {}
        items_map: Dict[str, Dict[str, Any]] = {}

        for rank, item in enumerate(text_results):
            nid = item["id"]
            items_map[nid] = item
            rrf_scores[nid] = rrf_scores.get(nid, 0.0) + (1.0 / (rrf_k + rank + 1))

        for rank, item in enumerate(semantic_results):
            nid = item["id"]
            if nid not in items_map:
                items_map[nid] = item
            rrf_scores[nid] = rrf_scores.get(nid, 0.0) + (1.0 / (rrf_k + rank + 1))

        sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)

        final_results = []
        for nid in sorted_ids[:limit]:
            entry = items_map[nid]
            entry["rrf_score"] = round(rrf_scores[nid], 5)
            entry["match_type"] = "hybrid_rrf"
            final_results.append(entry)

        return final_results

    # -------------------------------------------------------------------------
    # Hardened Query Engine with Archive & Relevance Filtering
    # -------------------------------------------------------------------------
    def query(
        self,
        query_text: str = "",
        namespace: Optional[str] = None,
        include_archived: bool = False,
        min_relevance: float = 0.0,
        limit: int = 10,
        mode: str = "hybrid",
        query_embedding: Optional[List[float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Hardened unified memory query with archive and relevance filtering.
        Supports hybrid, fts, or semantic retrieval modes.
        """
        q = (query_text or "").strip()
        norm_mode = (mode or "hybrid").strip().lower()

        raw_results: List[Dict[str, Any]] = []
        if not q and not query_embedding:
            # Fallback to recent memory nodes listing
            mem_items = self.list_memories(namespace=namespace, limit=limit * 3)
            for m in mem_items:
                raw_results.append({
                    "id": m["id"],
                    "namespace": m["namespace"],
                    "title": m["title"],
                    "content": m["content"],
                    "metadata": m.get("metadata", {}),
                    "score": 1.0,
                    "relevance": 1.0,
                    "is_archived": bool(m.get("is_archived", False)),
                    "match_type": "recency_list",
                })
        elif norm_mode == "fts":
            raw_results = self.search_text(q, namespace=namespace, limit=limit * 3)
        elif norm_mode == "semantic":
            if query_embedding:
                raw_results = self.search_semantic(query_embedding, namespace=namespace, top_k=limit * 3)
            else:
                raw_results = self.search_text(q, namespace=namespace, limit=limit * 3)
        else:  # hybrid
            raw_results = self.search_hybrid(
                query_text=q,
                query_embedding=query_embedding,
                namespace=namespace,
                limit=limit * 3,
            )

        # Apply archive filtering and relevance calculation
        filtered: List[Dict[str, Any]] = []
        for r in raw_results:
            meta = r.get("metadata", {})
            is_arch = bool(r.get("is_archived", False) or meta.get("is_archived", False) or meta.get("archived", False))
            if not include_archived and is_arch:
                continue

            # Compute standardized relevance in [0.0, 1.0]
            if "similarity" in r:
                relevance = max(0.0, min(1.0, float(r["similarity"])))
            elif "rrf_score" in r:
                # RRF scores are in [0.01, 0.1], scale appropriately
                relevance = max(0.0, min(1.0, float(r["rrf_score"]) * 20.0))
            elif "score" in r:
                # BM25 rank score is negative or lower is better; normalize safely
                s = float(r["score"])
                relevance = max(0.0, min(1.0, 1.0 / (1.0 + max(0.0, s))))
            else:
                relevance = 1.0

            if relevance < min_relevance:
                continue

            r_copy = dict(r)
            r_copy["relevance"] = round(relevance, 4)
            r_copy["is_archived"] = is_arch
            filtered.append(r_copy)

        filtered.sort(key=lambda x: x.get("relevance", 0.0), reverse=True)
        return filtered[:limit]

    def archive_memory(self, node_id: str, archived: bool = True) -> bool:
        """Sets the archived status for a memory node."""
        conn = self._get_connection()
        try:
            val = 1 if archived else 0
            cur = conn.execute(
                "UPDATE memory_nodes SET is_archived = ?, updated_at = ? WHERE id = ?;",
                (val, time.time(), node_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Sovereign Fact Write-Gate & Memory Forget Engine
    # -------------------------------------------------------------------------
    def store_fact(
        self,
        fact_text: str,
        source: str,
        verified: bool = False,
        category: str = "general",
        namespace: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        fact_id: Optional[str] = None,
    ) -> str:
        """
        Stores a fact into the facts table with write-gate distinction between
        ephemeral (unverified, is_verified=0, is_ephemeral=1) and verified
        (verified=True, is_verified=1, is_ephemeral=0).
        """
        clean_text = (fact_text or "").strip()
        if not clean_text:
            raise ValueError("Fact content cannot be empty")

        fid = fact_id or f"fact_{uuid.uuid4().hex[:12]}"
        now = time.time()
        is_verified = 1 if verified else 0
        is_ephemeral = 0 if verified else 1
        meta_json = json.dumps(metadata or {}, default=str)

        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO facts (id, content, source, is_verified, is_ephemeral, category, namespace, metadata_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    content = excluded.content,
                    source = excluded.source,
                    is_verified = excluded.is_verified,
                    is_ephemeral = excluded.is_ephemeral,
                    category = excluded.category,
                    namespace = excluded.namespace,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at;
                """,
                (fid, clean_text, source.strip(), is_verified, is_ephemeral, category.strip().lower(), namespace.strip().lower(), meta_json, now, now),
            )
            conn.commit()
            self._emit_pulse(f"Fact Stored: {clean_text[:25]} (verified={verified})", 1.0)
            return fid
        finally:
            conn.close()

    def verify_fact(self, fact_id: str) -> bool:
        """
        Promotes an ephemeral fact across the write-gate to verified status
        (is_verified=1, is_ephemeral=0).
        """
        conn = self._get_connection()
        try:
            now = time.time()
            cur = conn.execute(
                """
                UPDATE facts
                SET is_verified = 1, is_ephemeral = 0, updated_at = ?
                WHERE id = ?;
                """,
                (now, fact_id),
            )
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    def get_fact(self, fact_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single fact by ID."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM facts WHERE id = ? LIMIT 1;", (fact_id,)).fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "content": row["content"],
                "source": row["source"],
                "is_verified": bool(row["is_verified"]),
                "is_ephemeral": bool(row["is_ephemeral"]),
                "category": row["category"],
                "namespace": row["namespace"],
                "metadata": json.loads(row["metadata_json"] or "{}"),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    def list_facts(
        self,
        namespace: Optional[str] = None,
        verified_only: bool = False,
        ephemeral_only: bool = False,
        category: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Lists facts from SQLite WAL with flexible filtering."""
        conn = self._get_connection()
        try:
            query = "SELECT * FROM facts WHERE 1=1"
            params: List[Any] = []
            if namespace:
                query += " AND namespace = ?"
                params.append(namespace.strip().lower())
            if verified_only:
                query += " AND is_verified = 1"
            elif ephemeral_only:
                query += " AND is_ephemeral = 1"
            if category:
                query += " AND category = ?"
                params.append(category.strip().lower())
            query += " ORDER BY updated_at DESC LIMIT ?"
            params.append(limit)

            rows = conn.execute(query, params).fetchall()
            return [
                {
                    "id": r["id"],
                    "content": r["content"],
                    "source": r["source"],
                    "is_verified": bool(r["is_verified"]),
                    "is_ephemeral": bool(r["is_ephemeral"]),
                    "category": r["category"],
                    "namespace": r["namespace"],
                    "metadata": json.loads(r["metadata_json"] or "{}"),
                    "created_at": r["created_at"],
                    "updated_at": r["updated_at"],
                }
                for r in rows
            ]
        finally:
            conn.close()

    def memory_forget(
        self,
        target_id: Optional[str] = None,
        pattern: Optional[str] = None,
        namespace: Optional[str] = None,
    ) -> int:
        """
        Deterministically deletes memories, facts, and instincts matching target ID,
        pattern, or namespace from both relational tables and FTS virtual tables.
        Returns the exact count of forgotten records.
        """
        if not target_id and not pattern and not namespace:
            raise ValueError("memory_forget requires at least one of target_id, pattern, or namespace")

        deleted_total = 0
        conn = self._get_connection()
        try:
            if target_id:
                # 1. Delete from memory_nodes (trg_memory_nodes_ad automatically removes from memory_fts)
                c1 = conn.execute("DELETE FROM memory_nodes WHERE id = ?;", (target_id,))
                deleted_total += c1.rowcount

                # 2. Delete from facts
                c2 = conn.execute("DELETE FROM facts WHERE id = ?;", (target_id,))
                deleted_total += c2.rowcount

                # 3. Delete from learned_instincts (trigger automatically removes from learned_instincts_fts)
                try:
                    c3 = conn.execute("DELETE FROM learned_instincts WHERE id = ?;", (target_id,))
                    deleted_total += c3.rowcount
                except Exception as del_instinct_err:
                    logger.debug("Learned instinct deletion note: %s", del_instinct_err)

            elif pattern:
                like_expr = f"%{pattern.strip()}%"
                c1 = conn.execute(
                    "DELETE FROM memory_nodes WHERE title LIKE ? OR content LIKE ?;",
                    (like_expr, like_expr),
                )
                deleted_total += c1.rowcount

                c2 = conn.execute("DELETE FROM facts WHERE content LIKE ?;", (like_expr,))
                deleted_total += c2.rowcount

                try:
                    c3 = conn.execute(
                        "DELETE FROM learned_instincts WHERE trigger_pattern LIKE ? OR instinct_rule LIKE ?;",
                        (like_expr, like_expr),
                    )
                    deleted_total += c3.rowcount
                except Exception as pat_instinct_err:
                    logger.debug("Learned instinct pattern deletion note: %s", pat_instinct_err)

            elif namespace:
                ns = namespace.strip().lower()
                c1 = conn.execute("DELETE FROM memory_nodes WHERE namespace = ?;", (ns,))
                deleted_total += c1.rowcount

                c2 = conn.execute("DELETE FROM facts WHERE namespace = ?;", (ns,))
                deleted_total += c2.rowcount

            conn.commit()
            self._emit_pulse(f"Memory Forget: {deleted_total} records purged", 1.5)
            return deleted_total
        finally:
            conn.close()

    def run_weekly_trace_distillation(self) -> Dict[str, Any]:
        """Runs weekly trace distillation over completed execution slices and web ingest events."""
        from core.memory.learning_graph import LearningGraph
        graph = LearningGraph(db_path=self.db_path)
        return graph.run_trace_distillation()

    # -------------------------------------------------------------------------
    # Persona Settings & Emotional Telemetry Persistence
    # -------------------------------------------------------------------------
    def get_persona_settings(self) -> Dict[str, Any]:
        """Retrieves active persona telemetry settings from SQLite WAL."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()
            if not row:
                now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
                conn.execute(
                    """
                    INSERT INTO persona_settings (
                        id, empathy_pct, humor_pct, candor_pct, verbosity_pct, voice_id, active_preset, updated_at
                    ) VALUES (1, 80, 45, 85, 45, 'af_heart', 'CARING_COMPANION', ?);
                    """,
                    (now_str,),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()

            data = dict(row)
            voice_engine = str(data.get("voice_engine") or "")
            if not voice_engine:
                from core.bridge.persona_engine import resolve_voice_engine
                voice_engine = resolve_voice_engine(str(data.get("voice_id", "af_heart")))

            return {
                "id": data["id"],
                "empathy_pct": int(data["empathy_pct"]),
                "humor_pct": int(data["humor_pct"]),
                "candor_pct": int(data["candor_pct"]),
                "verbosity_pct": int(data["verbosity_pct"]),
                "voice_id": str(data["voice_id"]),
                "voice_engine": voice_engine,
                "active_preset": str(data["active_preset"]),
                "updated_at": str(data["updated_at"] or ""),
            }
        except Exception:
            raise

    def update_persona_settings(self, **kwargs) -> Dict[str, Any]:
        """Atomically updates persona telemetry in SQLite WAL, clamping percentages strictly to [0, 100]."""
        start_t = time.perf_counter()
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()

        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()
            if not row:
                conn.execute(
                    """
                    INSERT INTO persona_settings (
                        id, empathy_pct, humor_pct, candor_pct, verbosity_pct, voice_id, active_preset, updated_at
                    ) VALUES (1, 80, 45, 85, 45, 'af_heart', 'CARING_COMPANION', ?);
                    """,
                    (now_str,),
                )
                conn.commit()
                row = conn.execute("SELECT * FROM persona_settings WHERE id = 1 LIMIT 1;").fetchone()

            current = dict(row)

            # If a preset is requested, load preset percentages
            preset = kwargs.get("active_preset") or kwargs.get("preset")
            if preset and preset in PERSONA_PRESETS:
                current["active_preset"] = preset
                for k, v in PERSONA_PRESETS[preset].items():
                    current[k] = v

            if "empathy_pct" in kwargs and kwargs["empathy_pct"] is not None:
                current["empathy_pct"] = clamp_pct(kwargs["empathy_pct"])
            if "humor_pct" in kwargs and kwargs["humor_pct"] is not None:
                current["humor_pct"] = clamp_pct(kwargs["humor_pct"])
            if "candor_pct" in kwargs and kwargs["candor_pct"] is not None:
                current["candor_pct"] = clamp_pct(kwargs["candor_pct"])
            if "verbosity_pct" in kwargs and kwargs["verbosity_pct"] is not None:
                current["verbosity_pct"] = clamp_pct(kwargs["verbosity_pct"])
            if "voice_id" in kwargs and kwargs["voice_id"]:
                current["voice_id"] = str(kwargs["voice_id"])
            if "voice_engine" in kwargs and kwargs["voice_engine"]:
                current["voice_engine"] = str(kwargs["voice_engine"])
            elif "voice_id" in kwargs and kwargs["voice_id"]:
                current["voice_engine"] = resolve_voice_engine(str(kwargs["voice_id"]))
            elif "voice_engine" not in current or not current["voice_engine"]:
                current["voice_engine"] = resolve_voice_engine(str(current.get("voice_id", "af_heart")))

            if "active_preset" in kwargs and kwargs["active_preset"]:
                current["active_preset"] = str(kwargs["active_preset"])

            current["updated_at"] = now_str

            conn.execute(
                """
                UPDATE persona_settings
                SET empathy_pct = ?,
                    humor_pct = ?,
                    candor_pct = ?,
                    verbosity_pct = ?,
                    voice_id = ?,
                    voice_engine = ?,
                    active_preset = ?,
                    updated_at = ?
                WHERE id = 1;
                """,
                (
                    current["empathy_pct"],
                    current["humor_pct"],
                    current["candor_pct"],
                    current["verbosity_pct"],
                    current["voice_id"],
                    current["voice_engine"],
                    current["active_preset"],
                    now_str,
                ),
            )

            latency_ms = round((time.perf_counter() - start_t) * 1000, 2)
            log_msg = (
                f"Persona calibrated: Empathy={current['empathy_pct']}%, Humor={current['humor_pct']}%, "
                f"Candor={current['candor_pct']}%, Verbosity={current['verbosity_pct']}%, "
                f"Preset={current['active_preset']}, Voice={current['voice_id']}"
            )
            conn.execute(
                "INSERT INTO telemetry_logs (source, level, message, latency_ms, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?);",
                ("PERSONA", "INFO", log_msg, latency_ms, json.dumps(current), now_str),
            )
            conn.execute(
                "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                (
                    "circuit_pulse",
                    json.dumps({
                        "node": "MEMORY",
                        "active": True,
                        "detail": f"Persona: {current['active_preset']}",
                        "latency_ms": latency_ms,
                    }),
                    time.time(),
                ),
            )
            conn.commit()
        except Exception:
            raise

        # Notify persona listeners
        telemetry_obj = PersonaTelemetry(
            empathy_pct=current["empathy_pct"],
            humor_pct=current["humor_pct"],
            candor_pct=current["candor_pct"],
            verbosity_pct=current["verbosity_pct"],
            voice_id=current["voice_id"],
            active_preset=current["active_preset"],
        )
        notify_persona_listeners(telemetry_obj)

        return current

    # -------------------------------------------------------------------------
    # Persistent Timers & Countdown Engine (SQLite WAL)
    # -------------------------------------------------------------------------
    def create_timer(
        self,
        label: str,
        duration_sec: int,
        timer_type: str = "countdown",
        metadata: Optional[Dict[str, Any]] = None,
        timer_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Creates and persists a countdown or pomodoro timer in agent_local.db."""
        tid = timer_id or f"timer_{uuid.uuid4().hex[:10]}"
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + datetime.timedelta(seconds=duration_sec)
        now_iso = now.isoformat()
        expires_iso = expires_at.isoformat()
        meta_json = json.dumps(metadata or {})

        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO timers (
                    id, label, duration_sec, remaining_sec, timer_type, status, created_at, expires_at, metadata
                ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?);
                """,
                (tid, label, duration_sec, duration_sec, timer_type, now_iso, expires_iso, meta_json),
            )
            conn.commit()
        finally:
            conn.close()

        timer_dict = {
            "id": tid,
            "label": label,
            "duration_sec": duration_sec,
            "remaining_sec": duration_sec,
            "timer_type": timer_type,
            "status": "active",
            "created_at": now_iso,
            "expires_at": expires_iso,
            "metadata": metadata or {},
        }
        self._emit_pulse(f"Timer Created: {label} ({duration_sec}s)", 1.0)
        return timer_dict

    def list_timers(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists stored timers, dynamically calculating remaining seconds from expires_at."""
        now = datetime.datetime.now(datetime.timezone.utc)
        conn = self._get_connection()
        try:
            if status:
                cursor = conn.execute(
                    "SELECT * FROM timers WHERE status = ? ORDER BY created_at DESC;",
                    (status,),
                )
            else:
                cursor = conn.execute("SELECT * FROM timers ORDER BY created_at DESC;")
            rows = cursor.fetchall()

            results: List[Dict[str, Any]] = []
            for r in rows:
                item = dict(r)
                try:
                    exp_dt = datetime.datetime.fromisoformat(item["expires_at"])
                    rem = int((exp_dt - now).total_seconds())
                    item["remaining_sec"] = max(0, rem)
                    if item["status"] == "active" and rem <= 0:
                        item["status"] = "completed"
                        conn.execute("UPDATE timers SET status = 'completed', remaining_sec = 0 WHERE id = ?;", (item["id"],))
                except Exception as parse_err:
                    logger.debug("Timer expiration calculation error: %s", parse_err)
                try:
                    item["metadata"] = json.loads(item.get("metadata") or "{}")
                except Exception:
                    item["metadata"] = {}
                results.append(item)
            conn.commit()
            return results
        finally:
            conn.close()

    def get_timer(self, timer_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single timer by ID with fresh remaining seconds."""
        now = datetime.datetime.now(datetime.timezone.utc)
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM timers WHERE id = ? LIMIT 1;", (timer_id,)).fetchone()
            if not row:
                return None
            item = dict(row)
            try:
                exp_dt = datetime.datetime.fromisoformat(item["expires_at"])
                rem = int((exp_dt - now).total_seconds())
                item["remaining_sec"] = max(0, rem)
                if item["status"] == "active" and rem <= 0:
                    item["status"] = "completed"
                    conn.execute("UPDATE timers SET status = 'completed', remaining_sec = 0 WHERE id = ?;", (timer_id,))
                    conn.commit()
            except Exception as parse_err:
                logger.debug("Timer expiration calculation error: %s", parse_err)
            try:
                item["metadata"] = json.loads(item.get("metadata") or "{}")
            except Exception:
                item["metadata"] = {}
            return item
        finally:
            conn.close()

    def update_timer_status(self, timer_id: str, status: str) -> bool:
        """Updates the status of a timer (active, completed, cancelled, paused)."""
        conn = self._get_connection()
        try:
            cursor = conn.execute("UPDATE timers SET status = ? WHERE id = ?;", (status, timer_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def insert_web_ingest(
        self,
        event_id: str,
        source: str,
        url: str,
        prompt: str,
        response: str,
        commentary: str,
        workspace_mode: str,
        created_at: str,
        title: str = "",
        elements_json: str = "",
    ) -> str:
        """Persists a web ingestion event directly into web_ingest_events table."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO web_ingest_events (
                    id, source, url, title, prompt, response, response_text,
                    elements_json, commentary, tars_commentary, workspace_mode, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    event_id,
                    source,
                    url,
                    title,
                    prompt,
                    response,
                    response,
                    elements_json,
                    commentary,
                    commentary,
                    workspace_mode,
                    created_at,
                ),
            )
            conn.commit()
            return event_id
        finally:
            conn.close()

    def list_web_ingests(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Lists recent web ingestion events ordered by rowid/created_at descending."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT * FROM web_ingest_events ORDER BY rowid DESC LIMIT ?;",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def insert_reach_event(
        self,
        source_url: str,
        title: str,
        content: str,
        channel: str = "web",
        workspace_mode: str = "DEV",
        summary: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        event_id: Optional[str] = None,
    ) -> str:
        """Persists an agent-reach structured read/search result to reach_events and memory_nodes."""
        ev_id = event_id or f"reach_{uuid.uuid4().hex[:12]}"
        now = time.time()
        meta = dict(metadata or {})
        meta["channel"] = channel
        meta["source_url"] = source_url
        meta["workspace_mode"] = workspace_mode
        meta["summary"] = summary

        # 1. Insert into reach_events table
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO reach_events (
                    id, source_url, channel, title, content, summary, workspace_mode, metadata_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    ev_id,
                    source_url,
                    channel,
                    title,
                    content,
                    summary,
                    workspace_mode,
                    json.dumps(meta, default=str),
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()

        # 2. Index into memory_nodes (FTS5 BM25 search)
        try:
            self.insert_memory(
                content=content,
                title=title or (source_url[:60] if source_url else "Agent Reach Item"),
                node_type="RESEARCH",
                namespace=f"{workspace_mode.lower()}_context",
                tags=["agent-reach", "scout-01", channel],
                metadata=meta,
            )
        except Exception as exc:
            logger.debug("Memory node indexing note for reach event: %s", exc)

        return ev_id

    def list_recent_reach_events(self, limit: int = 20, workspace_mode: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists recent agent-reach events ordered by created_at descending."""
        conn = self._get_connection()
        try:
            if workspace_mode:
                cur = conn.execute(
                    "SELECT * FROM reach_events WHERE workspace_mode = ? ORDER BY created_at DESC LIMIT ?;",
                    (workspace_mode.upper(), limit),
                )
            else:
                cur = conn.execute(
                    "SELECT * FROM reach_events ORDER BY created_at DESC LIMIT ?;",
                    (limit,),
                )
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                if "metadata_json" in r and isinstance(r["metadata_json"], str):
                    try:
                        r["metadata"] = json.loads(r["metadata_json"])
                    except Exception:
                        r["metadata"] = {}
            return rows
        finally:
            conn.close()

    def find_recent_scout_cache(
        self,
        target: str,
        max_age_seconds: float = 3600.0,
    ) -> Optional[Dict[str, Any]]:
        """
        Searches recent reach_events, web_ingest_events, and FTS5 memory_fts
        for cached content matching target URL or query within max_age_seconds.
        Returns structured cache hit dict or None.
        """
        clean = (target or "").strip()
        if not clean:
            return None

        clean_norm = clean.rstrip("/")
        candidates = [clean, clean_norm]
        if clean_norm.startswith("https://"):
            candidates.append(clean_norm[8:])
            candidates.append("http://" + clean_norm[8:])
        elif clean_norm.startswith("http://"):
            candidates.append(clean_norm[7:])
            candidates.append("https://" + clean_norm[7:])
        else:
            candidates.append(f"https://{clean_norm}")
            candidates.append(f"http://{clean_norm}")

        # Remove duplicates while preserving order
        unique_candidates: List[str] = []
        for c in candidates:
            if c not in unique_candidates:
                unique_candidates.append(c)

        now = time.time()
        cutoff = now - max(1.0, float(max_age_seconds))

        conn = self._get_connection()
        try:
            # 1. Search reach_events table for recent matching source_url
            placeholders = ",".join("?" for _ in unique_candidates)
            cur = conn.execute(
                f"""
                SELECT id, source_url, channel, title, content, summary, workspace_mode, metadata_json, created_at
                FROM reach_events
                WHERE source_url IN ({placeholders}) AND created_at >= ?
                ORDER BY created_at DESC
                LIMIT 1;
                """,
                (*unique_candidates, cutoff),
            )
            row = cur.fetchone()
            if row:
                r = dict(row)
                meta = {}
                if r.get("metadata_json"):
                    try:
                        meta = json.loads(r["metadata_json"])
                    except Exception:
                        meta = {}
                return {
                    "ok": True,
                    "cached": True,
                    "tier": "cache",
                    "channel": r.get("channel", "web"),
                    "fallback_chain": ["cache"],
                    "target": r.get("source_url") or clean,
                    "title": r.get("title") or clean,
                    "summary": r.get("summary") or (r.get("content", "")[:350]),
                    "content": r.get("content", ""),
                    "event_id": r.get("id"),
                    "workspace_mode": r.get("workspace_mode", "DEV"),
                    "created_at": r.get("created_at", now),
                    "metadata": meta,
                    "latency_ms": 1.2,
                }

            # 2. Search web_ingest_events table
            cur = conn.execute(
                f"""
                SELECT id, source, url, title, prompt, response, response_text, commentary, workspace_mode, created_at
                FROM web_ingest_events
                WHERE (url IN ({placeholders}) OR prompt = ?)
                ORDER BY rowid DESC
                LIMIT 1;
                """,
                (*unique_candidates, clean),
            )
            wrow = cur.fetchone()
            if wrow:
                wr = dict(wrow)
                content = wr.get("response_text") or wr.get("response") or ""
                w_created = wr.get("created_at")
                w_time = now
                if isinstance(w_created, (int, float)):
                    w_time = float(w_created)
                elif isinstance(w_created, str):
                    try:
                        w_time = datetime.datetime.fromisoformat(w_created.replace("Z", "+00:00")).timestamp()
                    except Exception:
                        w_time = now

                if w_time >= cutoff:
                    return {
                        "ok": True,
                        "cached": True,
                        "tier": "cache",
                        "channel": wr.get("source", "gemini_web"),
                        "fallback_chain": ["cache"],
                        "target": wr.get("url") or clean,
                        "title": wr.get("title") or clean,
                        "summary": wr.get("commentary") or content[:350],
                        "content": content,
                        "event_id": wr.get("id"),
                        "workspace_mode": wr.get("workspace_mode", "DEV"),
                        "created_at": w_time,
                        "latency_ms": 1.5,
                    }

            # 3. FTS5 Search for Query Keywords if target is a search query
            if "://" not in clean and len(clean) >= 3:
                fts_results = self.search_text(clean, limit=1)
                if fts_results:
                    top = fts_results[0]
                    node_id = top.get("id")
                    cur = conn.execute("SELECT created_at FROM memory_nodes WHERE id = ?;", (node_id,))
                    node_row = cur.fetchone()
                    node_created = node_row["created_at"] if node_row else now
                    if (now - node_created) <= max_age_seconds:
                        return {
                            "ok": True,
                            "cached": True,
                            "tier": "cache",
                            "channel": "fts5_memory",
                            "fallback_chain": ["cache"],
                            "target": clean,
                            "title": top.get("title") or clean,
                            "summary": top.get("content", "")[:350],
                            "content": top.get("content", ""),
                            "event_id": node_id,
                            "workspace_mode": top.get("namespace", "dev").replace("_context", "").upper(),
                            "created_at": node_created,
                            "score": top.get("score", 0.0),
                            "latency_ms": 2.0,
                        }

            return None
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Provider & Model Catalog Hub Store Methods
    # -------------------------------------------------------------------------
    def list_providers(self, enabled_only: bool = False, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists configured LLM API providers and inference gateways."""
        conn = self._get_connection()
        try:
            query = "SELECT * FROM provider_configs"
            params: List[Any] = []
            clauses: List[str] = []
            if enabled_only:
                clauses.append("enabled = 1")
            if category:
                clauses.append("category = ?")
                params.append(category)
            if clauses:
                query += " WHERE " + " AND ".join(clauses)
            query += " ORDER BY priority_order ASC, provider_id ASC;"
            rows = [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]
            for r in rows:
                if "extra_config_json" in r and isinstance(r["extra_config_json"], str):
                    try:
                        r["extra_config"] = json.loads(r["extra_config_json"])
                    except Exception:
                        r["extra_config"] = {}
                else:
                    r["extra_config"] = {}
            return rows
        except Exception as exc:
            logger.debug("list_providers notice: %s", exc)
            return []

    def get_provider(self, provider_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single provider configuration by ID."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM provider_configs WHERE provider_id = ? LIMIT 1;", (provider_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["extra_config"] = json.loads(res.get("extra_config_json") or "{}")
            except Exception:
                res["extra_config"] = {}
            return res
        except Exception as exc:
            logger.debug("get_provider notice for %s: %s", provider_id, exc)
            return None

    def save_provider(self, provider: Dict[str, Any]) -> bool:
        """Upserts a provider configuration into SQLite WAL."""
        conn = self._get_connection()
        try:
            extra = provider.get("extra_config_json")
            if extra is None and "extra_config" in provider:
                extra = json.dumps(provider["extra_config"])
            if extra is None:
                extra = "{}"

            conn.execute(
                """
                INSERT INTO provider_configs (
                    provider_id, display_name, category, protocol, base_url, key_console_url,
                    auth_header, auth_prefix, selected_model, extra_config_json, free_tier_badge,
                    priority_order, enabled, has_key, last_latency_ms, last_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(provider_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    category = excluded.category,
                    protocol = excluded.protocol,
                    base_url = excluded.base_url,
                    key_console_url = excluded.key_console_url,
                    auth_header = excluded.auth_header,
                    auth_prefix = excluded.auth_prefix,
                    selected_model = excluded.selected_model,
                    extra_config_json = excluded.extra_config_json,
                    free_tier_badge = excluded.free_tier_badge,
                    priority_order = excluded.priority_order,
                    enabled = excluded.enabled,
                    has_key = excluded.has_key,
                    last_latency_ms = coalesce(excluded.last_latency_ms, provider_configs.last_latency_ms),
                    last_status = coalesce(excluded.last_status, provider_configs.last_status),
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (
                    provider["provider_id"],
                    provider["display_name"],
                    provider["category"],
                    provider["protocol"],
                    provider["base_url"],
                    provider.get("key_console_url", ""),
                    provider.get("auth_header", "Authorization"),
                    provider.get("auth_prefix", "Bearer "),
                    provider["selected_model"],
                    extra,
                    provider.get("free_tier_badge", ""),
                    int(provider.get("priority_order", 100)),
                    1 if provider.get("enabled", False) else 0,
                    1 if provider.get("has_key", False) else 0,
                    provider.get("last_latency_ms"),
                    provider.get("last_status", "UNCONFIGURED"),
                ),
            )
            conn.commit()
            return True
        except Exception as exc:
            logger.debug("save_provider notice for %s: %s", provider.get("provider_id"), exc)
            return False

    def delete_provider(self, provider_id: str) -> bool:
        """Deletes a provider configuration by ID."""
        conn = self._get_connection()
        try:
            cur = conn.execute("DELETE FROM provider_configs WHERE provider_id = ?;", (provider_id,))
            conn.commit()
            return cur.rowcount > 0
        except Exception as exc:
            logger.debug("delete_provider notice for %s: %s", provider_id, exc)
            return False

    def update_provider_status(
        self,
        provider_id: str,
        status: str,
        latency_ms: Optional[float] = None,
        has_key: Optional[bool] = None,
    ) -> bool:
        """Updates runtime status, latency telemetry, and key status for a provider."""
        conn = self._get_connection()
        try:
            updates = ["last_status = ?", "updated_at = CURRENT_TIMESTAMP"]
            params: List[Any] = [status]
            if latency_ms is not None:
                updates.append("last_latency_ms = ?")
                params.append(latency_ms)
            if has_key is not None:
                updates.append("has_key = ?")
                params.append(1 if has_key else 0)
            params.append(provider_id)
            cur = conn.execute(
                f"UPDATE provider_configs SET {', '.join(updates)} WHERE provider_id = ?;",
                tuple(params),
            )
            conn.commit()
            return cur.rowcount > 0
        except Exception as exc:
            logger.debug("update_provider_status notice for %s: %s", provider_id, exc)
            return False

    def reorder_providers(self, order_map: Dict[str, int]) -> bool:
        """Reorders priority of providers given a dict of {provider_id: priority_order}."""
        conn = self._get_connection()
        try:
            for pid, order in order_map.items():
                conn.execute(
                    "UPDATE provider_configs SET priority_order = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_id = ?;",
                    (order, pid),
                )
            conn.commit()
            return True
        except Exception as exc:
            logger.debug("reorder_providers notice: %s", exc)
            return False

    def list_models(
        self,
        runtime_target: Optional[str] = None,
        modality: Optional[str] = None,
        voice_compatible: Optional[bool] = None,
        is_abliterated: Optional[bool] = None,
        provider_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Lists models from model_catalog matching criteria."""
        conn = self._get_connection()
        try:
            query = "SELECT * FROM model_catalog"
            clauses: List[str] = []
            params: List[Any] = []
            if runtime_target:
                clauses.append("runtime_target = ?")
                params.append(runtime_target)
            if modality:
                clauses.append("modality = ?")
                params.append(modality)
            if voice_compatible is not None:
                clauses.append("voice_compatible = ?")
                params.append(1 if voice_compatible else 0)
            if is_abliterated is not None:
                clauses.append("is_abliterated = ?")
                params.append(1 if is_abliterated else 0)
            if provider_id:
                clauses.append("provider_id = ?")
                params.append(provider_id)
            if clauses:
                query += " WHERE " + " AND ".join(clauses)
            query += " ORDER BY intelligence_index DESC, display_name ASC;"
            rows = [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]
            return rows
        except Exception as exc:
            logger.debug("list_models notice: %s", exc)
            return []

    def get_model(self, model_uid: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single model by UID."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM model_catalog WHERE model_uid = ? LIMIT 1;", (model_uid,)).fetchone()
            return dict(row) if row else None
        except Exception as exc:
            logger.debug("get_model notice for %s: %s", model_uid, exc)
            return None

    def save_model(self, model: Dict[str, Any]) -> bool:
        """Upserts a model entry into model_catalog."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO model_catalog (
                    model_uid, display_name, creator, provider_id, api_or_hf_id,
                    runtime_target, modality, is_abliterated, abliteration_source,
                    voice_compatible, voice_role, vram_gb, ram_gb, quant_tag,
                    intelligence_index, cost_per_task_usd, time_per_task_min,
                    ttft_sec, error_rate_pct, context_window, license
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(model_uid) DO UPDATE SET
                    display_name = excluded.display_name,
                    creator = excluded.creator,
                    provider_id = excluded.provider_id,
                    api_or_hf_id = excluded.api_or_hf_id,
                    runtime_target = excluded.runtime_target,
                    modality = excluded.modality,
                    is_abliterated = excluded.is_abliterated,
                    abliteration_source = excluded.abliteration_source,
                    voice_compatible = excluded.voice_compatible,
                    voice_role = excluded.voice_role,
                    vram_gb = excluded.vram_gb,
                    ram_gb = excluded.ram_gb,
                    quant_tag = excluded.quant_tag,
                    intelligence_index = excluded.intelligence_index,
                    cost_per_task_usd = excluded.cost_per_task_usd,
                    time_per_task_min = excluded.time_per_task_min,
                    ttft_sec = excluded.ttft_sec,
                    error_rate_pct = excluded.error_rate_pct,
                    context_window = excluded.context_window,
                    license = excluded.license;
                """,
                (
                    model["model_uid"],
                    model["display_name"],
                    model["creator"],
                    model["provider_id"],
                    model["api_or_hf_id"],
                    model.get("runtime_target", "api"),
                    model.get("modality", "text"),
                    1 if model.get("is_abliterated", False) else 0,
                    model.get("abliteration_source", ""),
                    1 if model.get("voice_compatible", False) else 0,
                    model.get("voice_role", ""),
                    float(model.get("vram_gb", 0)),
                    float(model.get("ram_gb", 0)),
                    model.get("quant_tag", ""),
                    model.get("intelligence_index"),
                    model.get("cost_per_task_usd"),
                    model.get("time_per_task_min"),
                    model.get("ttft_sec"),
                    model.get("error_rate_pct"),
                    model.get("context_window", "131k"),
                    model.get("license", "Open"),
                ),
            )
            conn.commit()
            return True
        except Exception as exc:
            logger.debug("save_model notice for %s: %s", model.get("model_uid"), exc)
            return False

    def log_provider_failover(
        self,
        from_provider: str,
        to_provider: str,
        reason: str,
        latency_ms: Optional[float] = None,
    ) -> int:
        """Logs a provider failover occurrence into provider_failover_logs."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                """
                INSERT INTO provider_failover_logs (from_provider, to_provider, reason, latency_ms)
                VALUES (?, ?, ?, ?);
                """,
                (from_provider, to_provider, reason, latency_ms),
            )
            conn.commit()
            return int(cur.lastrowid or 0)
        finally:
            conn.close()

    def get_failover_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves recent failover audit logs."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT * FROM provider_failover_logs ORDER BY id DESC LIMIT ?;",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def log_voice_security_event(
        self,
        action: str,
        speaker_role: str = "GUEST",
        confidence: float = 0.0,
        status: str = "LOGGED",
        details: str = "",
        speaker_id: str = "",
    ) -> str:
        """Logs an acoustic security audit event into voice_security_logs."""
        event_id = f"vsec_{int(time.time() * 1000)}_{os.urandom(4).hex()}"
        iso_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO voice_security_logs (
                    id, speaker_id, action, speaker_role, confidence, status, details, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    event_id,
                    speaker_id or ("OPERATOR" if speaker_role == "OPERATOR" else "GUEST"),
                    action,
                    speaker_role,
                    float(confidence),
                    status,
                    details,
                    iso_time,
                ),
            )
            conn.commit()
            return event_id
        finally:
            conn.close()

    def get_voice_security_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieves recent voice biometric security audit events."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                """
                SELECT id, speaker_id, action, speaker_role, confidence, status, details, timestamp
                FROM voice_security_logs
                ORDER BY timestamp DESC, id DESC
                LIMIT ?;
                """,
                (max(1, int(limit)),),
            )
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def list_cloud_worker_profiles(self, platform: Optional[str] = None) -> List[Dict[str, Any]]:
        """Lists cloud worker profiles."""
        conn = self._get_connection()
        try:
            if platform:
                cur = conn.execute("SELECT * FROM cloud_worker_profiles WHERE platform = ? ORDER BY profile_id ASC;", (platform,))
            else:
                cur = conn.execute("SELECT * FROM cloud_worker_profiles ORDER BY platform ASC, profile_id ASC;")
            return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def save_cloud_worker_profile(self, profile: Dict[str, Any]) -> bool:
        """Upserts a cloud worker profile."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO cloud_worker_profiles (
                    profile_id, platform, accelerator, primary_model_tag,
                    is_abliterated, voice_sidecar, idle_timeout_sec,
                    endpoint_url, status, last_heartbeat
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(profile_id) DO UPDATE SET
                    platform = excluded.platform,
                    accelerator = excluded.accelerator,
                    primary_model_tag = excluded.primary_model_tag,
                    is_abliterated = excluded.is_abliterated,
                    voice_sidecar = excluded.voice_sidecar,
                    idle_timeout_sec = excluded.idle_timeout_sec,
                    endpoint_url = excluded.endpoint_url,
                    status = excluded.status,
                    last_heartbeat = datetime('now');
                """,
                (
                    profile["profile_id"],
                    profile["platform"],
                    profile["accelerator"],
                    profile["primary_model_tag"],
                    1 if profile.get("is_abliterated", False) else 0,
                    profile.get("voice_sidecar", "none"),
                    int(profile.get("idle_timeout_sec", 600)),
                    profile.get("endpoint_url", ""),
                    profile.get("status", "OFFLINE"),
                ),
            )
            conn.commit()
            return True
        finally:
            conn.close()

    def get_cloud_worker_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single cloud worker profile."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM cloud_worker_profiles WHERE profile_id = ? LIMIT 1;", (profile_id,)).fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    # -------------------------------------------------------------------------
    # Role-Based Routing Slots & Guardrails
    # -------------------------------------------------------------------------
    def get_role_assignments(self) -> Dict[str, Dict[str, str]]:
        """Returns all role assignments mapping role_id -> {provider_id, model_id, updated_at}."""
        conn = self._get_connection()
        try:
            cur = conn.execute("SELECT * FROM role_assignments ORDER BY role_id ASC;")
            rows = [dict(r) for r in cur.fetchall()]
            if not rows:
                # Seed defaults
                defaults = [
                    ("voice_brain", "ollama_local", "lfm3-2b-omni-abliterated"),
                    ("heavy_coder", "cerebras", "llama-3.3-70b"),
                    ("security_auditor", "groq", "llama-3.3-70b-versatile"),
                    ("vision_scout", "gemini", "gemini-4-neon"),
                    ("general_default", "openrouter", "auto"),
                ]
                for r_id, p_id, m_id in defaults:
                    conn.execute(
                        "INSERT OR IGNORE INTO role_assignments (role_id, provider_id, model_id) VALUES (?, ?, ?);",
                        (r_id, p_id, m_id),
                    )
                conn.commit()
                cur = conn.execute("SELECT * FROM role_assignments ORDER BY role_id ASC;")
                rows = [dict(r) for r in cur.fetchall()]
            return {r["role_id"]: r for r in rows}
        finally:
            conn.close()

    def set_role_assignment(self, role_id: str, provider_id: str, model_id: str) -> bool:
        """Assigns a provider and model to a specific operational role."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO role_assignments (role_id, provider_id, model_id, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(role_id) DO UPDATE SET
                    provider_id = excluded.provider_id,
                    model_id = excluded.model_id,
                    updated_at = CURRENT_TIMESTAMP;
                """,
                (role_id.strip(), provider_id.strip(), model_id.strip()),
            )
            conn.commit()
            return True
        finally:
            conn.close()

    def get_routing_guardrails(self) -> Dict[str, Any]:
        """Returns routing guardrails and resets daily spend if new calendar day."""
        conn = self._get_connection()
        try:
            row = conn.execute("SELECT * FROM routing_guardrails WHERE id = 1 LIMIT 1;").fetchone()
            if not row:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO routing_guardrails (id, free_tier_only, allow_paid_failover, daily_budget_usd, daily_spend_usd, budget_date)
                    VALUES (1, 1, 0, 5.0, 0.0, date('now'));
                    """
                )
                conn.commit()
                row = conn.execute("SELECT * FROM routing_guardrails WHERE id = 1 LIMIT 1;").fetchone()
            res = dict(row)
            # Reset daily spend on new day
            today_str = datetime.date.today().isoformat()
            if res.get("budget_date") != today_str:
                conn.execute(
                    "UPDATE routing_guardrails SET daily_spend_usd = 0.0, budget_date = ? WHERE id = 1;",
                    (today_str,),
                )
                conn.commit()
                res["daily_spend_usd"] = 0.0
                res["budget_date"] = today_str
            return res
        finally:
            conn.close()

    def update_routing_guardrails(
        self,
        free_tier_only: Optional[int] = None,
        allow_paid_failover: Optional[int] = None,
        daily_budget_usd: Optional[float] = None,
        add_spend_usd: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Updates routing guardrails (Free-Tier-Only lock, budget caps, recorded spend)."""
        conn = self._get_connection()
        try:
            updates: List[str] = []
            params: List[Any] = []
            if free_tier_only is not None:
                updates.append("free_tier_only = ?")
                params.append(1 if free_tier_only else 0)
            if allow_paid_failover is not None:
                updates.append("allow_paid_failover = ?")
                params.append(1 if allow_paid_failover else 0)
            if daily_budget_usd is not None:
                updates.append("daily_budget_usd = ?")
                params.append(float(daily_budget_usd))
            if add_spend_usd is not None:
                updates.append("daily_spend_usd = daily_spend_usd + ?")
                params.append(float(add_spend_usd))
            if updates:
                conn.execute(f"UPDATE routing_guardrails SET {', '.join(updates)} WHERE id = 1;", tuple(params))
                conn.commit()
            return self.get_routing_guardrails()
        finally:
            conn.close()

    def get_recurring_interests(self, limit: int = 5) -> List[str]:
        """
        Retrieves recurring user interests from episodic memory (memory_nodes where
        namespace in ('user_profile', 'interests', 'episodic', 'conversations', 'default')
        or metadata_json containing interest tags).
        Falls back cleanly to core sovereign architecture themes if fewer records exist.
        """
        conn = self._get_connection()
        interests: List[str] = []
        try:
            cur = conn.execute(
                """
                SELECT title, content, metadata_json
                FROM memory_nodes
                WHERE namespace IN ('user_profile', 'interests', 'episodic', 'conversations', 'default')
                   OR title LIKE '%interest%' OR title LIKE '%preference%'
                ORDER BY updated_at DESC
                LIMIT 25;
                """
            )
            rows = cur.fetchall()
            for r in rows:
                t = (r["title"] or "").strip()
                if t and t not in interests:
                    interests.append(t)
                meta_raw = r["metadata_json"]
                if meta_raw:
                    try:
                        meta = json.loads(meta_raw)
                        if isinstance(meta, dict):
                            tags = meta.get("tags") or meta.get("interests") or []
                            if isinstance(tags, list):
                                for tag in tags:
                                    tag_s = str(tag).strip()
                                    if tag_s and tag_s not in interests:
                                        interests.append(tag_s)
                    except Exception:
                        continue
        except Exception as exc:
            logger.debug("Recurring interests retrieval notice: %s", exc)

        # Fallback defaults if episodic memory is nascent or empty
        defaults = [
            "Edge-to-Desktop Autonomous Engine",
            "Sovereign AI & Local Privacy",
            "Zero-Subscription Micro-Frontends",
            "16kHz Local Acoustic Neural Processing",
            "Win32 System Actuation & Low-Latency IPC",
        ]
        for d in defaults:
            if d not in interests:
                interests.append(d)

        return interests[:limit]

    # -------------------------------------------------------------------------
    # ECC 71 Agents & 314 Skills Ingestion & FTS5 Query Engine
    # -------------------------------------------------------------------------
    def get_ecc_agent(self, slug: str) -> Optional[Dict[str, Any]]:
        """Retrieves an ECC agent definition by slug."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT slug, name, description, anchor_orbiter, default_tools_json, system_prompt, file_path, updated_at "
                "FROM ecc_agents WHERE slug = ? LIMIT 1;",
                (slug,),
            )
            row = cur.fetchone()
            if not row:
                return None
            tools = []
            try:
                tools = json.loads(row["default_tools_json"])
            except Exception:
                tools = []
            return {
                "slug": row["slug"],
                "name": row["name"],
                "description": row["description"],
                "anchor_orbiter": row["anchor_orbiter"],
                "default_tools": tools,
                "system_prompt": row["system_prompt"],
                "file_path": row["file_path"],
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    def get_ecc_skill(self, slug: str) -> Optional[Dict[str, Any]]:
        """Retrieves an ECC skill definition by slug."""
        conn = self._get_connection()
        try:
            cur = conn.execute(
                "SELECT slug, name, description, category, anchor_orbiter, allowed_tools_json, instructions, file_path, updated_at "
                "FROM ecc_skills WHERE slug = ? LIMIT 1;",
                (slug,),
            )
            row = cur.fetchone()
            if not row:
                return None
            tools = []
            try:
                tools = json.loads(row["allowed_tools_json"])
            except Exception:
                tools = []
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

    def search_ecc_agents(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Searches ECC agents using FTS5 (with LIKE fallback)."""
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
                    tools = []
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

    def search_ecc_skills(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Searches ECC skills using FTS5 (with LIKE fallback)."""
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
                    tools = []
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

    def upsert_ecc_agent(
        self,
        slug: str,
        name: str,
        description: str,
        anchor_orbiter: str,
        default_tools: List[str],
        system_prompt: str,
        file_path: str = "",
    ) -> None:
        """Upserts an ECC agent into ecc_agents (and ecc_agent_archetypes)."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        tools_json = json.dumps(default_tools)
        conn = self._get_connection()
        try:
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
                (slug, name, description, anchor_orbiter, tools_json, system_prompt, file_path, now_iso),
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
                (slug, name, description, anchor_orbiter, tools_json, system_prompt, now_iso),
            )
            conn.commit()
        finally:
            conn.close()

    def upsert_ecc_skill(
        self,
        slug: str,
        name: str,
        description: str,
        category: str,
        anchor_orbiter: str,
        allowed_tools: List[str],
        instructions: str,
        file_path: str = "",
    ) -> None:
        """Upserts an ECC skill playbook into ecc_skills."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        tools_json = json.dumps(allowed_tools)
        conn = self._get_connection()
        try:
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
                (slug, name, description, category, anchor_orbiter, tools_json, instructions, file_path, now_iso),
            )
            conn.commit()
        finally:
            conn.close()

    def get_cloud_sync_adapter(self) -> Any:
        """Returns or lazily initializes the CloudMemorySyncAdapter instance."""
        if not hasattr(self, "_cloud_sync_adapter") or self._cloud_sync_adapter is None:
            if CloudMemorySyncAdapter is not None:
                self._cloud_sync_adapter = CloudMemorySyncAdapter(db_path=self.db_path)
            else:
                from core.memory.cloud_sync import CloudMemorySyncAdapter as _CMSA
                self._cloud_sync_adapter = _CMSA(db_path=self.db_path)
        return self._cloud_sync_adapter

    @property
    def cloud_sync_adapter(self) -> Any:
        """Property accessor for the CloudMemorySyncAdapter instance."""
        return self.get_cloud_sync_adapter()

    def sync_to_cloud(self, force: bool = False) -> Dict[str, Any]:
        """Delegates incremental cloud replication to the CloudMemorySyncAdapter."""
        adapter = self.get_cloud_sync_adapter()
        return adapter.sync_incremental(force=force)

    # -------------------------------------------------------------------------
    # Theme Management (v5.0 Custom Theme Forge)
    # -------------------------------------------------------------------------
    def list_themes(self) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, is_builtin, tokens_json, is_active, updated_at FROM user_themes ORDER BY is_builtin DESC, name ASC;")
        rows = cur.fetchall()
        result = []
        for r in rows:
            tokens = {}
            try:
                tokens = json.loads(r["tokens_json"])
            except Exception:
                tokens = {}
            result.append({
                "id": r["id"],
                "name": r["name"],
                "is_builtin": bool(r["is_builtin"]),
                "tokens": tokens,
                "is_active": bool(r["is_active"]),
                "updated_at": r["updated_at"],
            })
        return result

    def get_theme(self, theme_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, is_builtin, tokens_json, is_active, updated_at FROM user_themes WHERE id = ?;", (theme_id,))
        r = cur.fetchone()
        if not r:
            return None
        tokens = {}
        try:
            tokens = json.loads(r["tokens_json"])
        except Exception:
            tokens = {}
        return {
            "id": r["id"],
            "name": r["name"],
            "is_builtin": bool(r["is_builtin"]),
            "tokens": tokens,
            "is_active": bool(r["is_active"]),
            "updated_at": r["updated_at"],
        }

    def get_active_theme(self) -> Dict[str, Any]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, is_builtin, tokens_json, is_active, updated_at FROM user_themes WHERE is_active = 1 LIMIT 1;")
        r = cur.fetchone()
        if not r:
            cur.execute("SELECT id, name, is_builtin, tokens_json, is_active, updated_at FROM user_themes WHERE id = 'obsidian_cyber' LIMIT 1;")
            r = cur.fetchone()
        if r:
            tokens = {}
            try:
                tokens = json.loads(r["tokens_json"])
            except Exception:
                tokens = {}
            return {
                "id": r["id"],
                "name": r["name"],
                "is_builtin": bool(r["is_builtin"]),
                "tokens": tokens,
                "is_active": True,
                "updated_at": r["updated_at"],
            }
        return {
            "id": "obsidian_cyber",
            "name": "Obsidian Cyber",
            "is_builtin": True,
            "tokens": {},
            "is_active": True,
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    def save_theme(self, theme: Dict[str, Any]) -> bool:
        theme_id = str(theme.get("id", "")).strip() or str(uuid.uuid4())
        name = str(theme.get("name", "Custom Theme")).strip()
        tokens = theme.get("tokens") or {}
        tokens_json = json.dumps(tokens) if isinstance(tokens, dict) else str(tokens)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        is_active = 1 if theme.get("is_active") else 0
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT is_builtin FROM user_themes WHERE id = ?;", (theme_id,))
        existing = cur.fetchone()
        if existing and existing["is_builtin"]:
            cur.execute(
                "UPDATE user_themes SET tokens_json = ?, updated_at = ? WHERE id = ?;",
                (tokens_json, now, theme_id),
            )
        else:
            cur.execute(
                """
                INSERT INTO user_themes (id, name, is_builtin, tokens_json, is_active, updated_at)
                VALUES (?, ?, 0, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    tokens_json = excluded.tokens_json,
                    updated_at = excluded.updated_at;
                """,
                (theme_id, name, tokens_json, is_active, now),
            )
        conn.commit()
        if is_active:
            self.activate_theme(theme_id)
        return True

    def activate_theme(self, theme_id: str) -> bool:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id FROM user_themes WHERE id = ?;", (theme_id,))
        if not cur.fetchone():
            return False
        cur.execute("UPDATE user_themes SET is_active = 0;")
        cur.execute("UPDATE user_themes SET is_active = 1, updated_at = datetime('now') WHERE id = ?;", (theme_id,))
        conn.commit()
        return True

    def delete_theme(self, theme_id: str) -> bool:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT is_builtin, is_active FROM user_themes WHERE id = ?;", (theme_id,))
        r = cur.fetchone()
        if not r or r["is_builtin"]:
            return False
        was_active = bool(r["is_active"])
        cur.execute("DELETE FROM user_themes WHERE id = ?;", (theme_id,))
        if was_active:
            cur.execute("UPDATE user_themes SET is_active = 1 WHERE id = 'obsidian_cyber';")
        conn.commit()
        return True

    def import_theme(self, theme_data: Union[Dict[str, Any], str]) -> Dict[str, Any]:
        """Imports theme bundle (.nxtheme) or raw theme dictionary."""
        if isinstance(theme_data, str):
            try:
                theme_data = json.loads(theme_data)
            except Exception as exc:
                raise ValueError(f"Invalid JSON string for .nxtheme: {exc}")
        raw = theme_data.get("theme") if isinstance(theme_data, dict) and "theme" in theme_data else theme_data
        if not isinstance(raw, dict):
            raise ValueError("Invalid .nxtheme format: dictionary required")
        name = raw.get("name")
        tokens = raw.get("tokens") or {}
        if not name or not isinstance(tokens, dict):
            raise ValueError("Invalid .nxtheme format: 'name' and 'tokens' dictionary required")
        theme_id = str(raw.get("id") or str(uuid.uuid4())).strip()
        self.save_theme({"id": theme_id, "name": name, "tokens": tokens, "is_active": raw.get("is_active", False)})
        saved = self.get_theme(theme_id)
        if not saved:
            raise RuntimeError(f"Failed to retrieve imported theme '{theme_id}'")
        return saved

    def export_theme(self, theme_id: str) -> Optional[Dict[str, Any]]:
        theme = self.get_theme(theme_id)
        if not theme:
            return None
        return {
            "nxtheme_version": "1.0",
            "format": "nexus_theme_bundle",
            "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "theme": theme,
        }

    # -------------------------------------------------------------------------
    # Wallpaper Management (v5.0 Custom Agent Wallpaper Engine)
    # -------------------------------------------------------------------------
    def list_wallpapers(self, mode: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cur = conn.cursor()
        if mode:
            cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers WHERE mode_binding = ? OR mode_binding = 'GLOBAL' ORDER BY is_active DESC, updated_at DESC;", (mode.upper(),))
        else:
            cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers ORDER BY is_active DESC, updated_at DESC;")
        rows = cur.fetchall()
        result = []
        for r in rows:
            cfg = {}
            try:
                cfg = json.loads(r["config_json"])
            except Exception:
                cfg = {}
            result.append({
                "id": r["id"],
                "name": r["name"],
                "kind": r["kind"],
                "source_path": r["source_path"],
                "mode_binding": r["mode_binding"],
                "config": cfg,
                "is_active": bool(r["is_active"]),
                "updated_at": r["updated_at"],
            })
        return result

    def get_wallpaper(self, wallpaper_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers WHERE id = ?;", (wallpaper_id,))
        r = cur.fetchone()
        if not r:
            return None
        cfg = {}
        try:
            cfg = json.loads(r["config_json"])
        except Exception:
            cfg = {}
        return {
            "id": r["id"],
            "name": r["name"],
            "kind": r["kind"],
            "source_path": r["source_path"],
            "mode_binding": r["mode_binding"],
            "config": cfg,
            "is_active": bool(r["is_active"]),
            "updated_at": r["updated_at"],
        }

    def get_active_wallpaper(self, mode: str = "GLOBAL") -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cur = conn.cursor()
        mode_upper = mode.upper()
        cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers WHERE mode_binding = ? AND is_active = 1 LIMIT 1;", (mode_upper,))
        r = cur.fetchone()
        if not r and mode_upper != "GLOBAL":
            cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers WHERE mode_binding = 'GLOBAL' AND is_active = 1 LIMIT 1;")
            r = cur.fetchone()
        if not r:
            cur.execute("SELECT id, name, kind, source_path, mode_binding, config_json, is_active, updated_at FROM user_wallpapers WHERE id = 'nebula_vortex_shader' LIMIT 1;")
            r = cur.fetchone()
        if not r:
            return None
        cfg = {}
        try:
            cfg = json.loads(r["config_json"])
        except Exception:
            cfg = {}
        return {
            "id": r["id"],
            "name": r["name"],
            "kind": r["kind"],
            "source_path": r["source_path"],
            "mode_binding": r["mode_binding"],
            "config": cfg,
            "is_active": True,
            "updated_at": r["updated_at"],
        }

    def save_wallpaper(self, wallpaper: Dict[str, Any]) -> bool:
        wall_id = str(wallpaper.get("id", "")).strip() or str(uuid.uuid4())
        name = str(wallpaper.get("name", "Custom Wallpaper")).strip()
        kind = str(wallpaper.get("kind", "image")).lower().strip()
        source_path = str(wallpaper.get("source_path", "")).strip()
        mode_binding = str(wallpaper.get("mode_binding", "GLOBAL")).upper().strip()
        cfg = wallpaper.get("config") or {}
        cfg_json = json.dumps(cfg) if isinstance(cfg, dict) else str(cfg)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        is_active = 1 if wallpaper.get("is_active") else 0
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO user_wallpapers (id, name, kind, source_path, mode_binding, config_json, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                kind = excluded.kind,
                source_path = excluded.source_path,
                mode_binding = excluded.mode_binding,
                config_json = excluded.config_json,
                updated_at = excluded.updated_at;
            """,
            (wall_id, name, kind, source_path, mode_binding, cfg_json, is_active, now),
        )
        conn.commit()
        if is_active:
            self.activate_wallpaper(wall_id, mode_binding)
        return True

    def activate_wallpaper(self, wallpaper_id: str, mode_binding: Optional[str] = None) -> bool:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT id, mode_binding FROM user_wallpapers WHERE id = ?;", (wallpaper_id,))
        r = cur.fetchone()
        if not r:
            return False
        target_mode = (mode_binding or r["mode_binding"] or "GLOBAL").upper()
        cur.execute("UPDATE user_wallpapers SET is_active = 0 WHERE mode_binding = ?;", (target_mode,))
        cur.execute("UPDATE user_wallpapers SET is_active = 1, mode_binding = ?, updated_at = datetime('now') WHERE id = ?;", (target_mode, wallpaper_id))
        conn.commit()
        return True

    def update_wallpaper_config(self, wallpaper_id: str, config: Dict[str, Any]) -> bool:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT config_json FROM user_wallpapers WHERE id = ?;", (wallpaper_id,))
        r = cur.fetchone()
        if not r:
            return False
        existing_cfg = {}
        try:
            existing_cfg = json.loads(r["config_json"])
        except Exception:
            existing_cfg = {}
        existing_cfg.update(config)
        cur.execute(
            "UPDATE user_wallpapers SET config_json = ?, updated_at = datetime('now') WHERE id = ?;",
            (json.dumps(existing_cfg), wallpaper_id),
        )
        conn.commit()
        return True

    def delete_wallpaper(self, wallpaper_id: str) -> bool:
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT kind, source_path, is_active, mode_binding FROM user_wallpapers WHERE id = ?;", (wallpaper_id,))
        r = cur.fetchone()
        if not r:
            return False
        builtin_wallpaper_ids = {
            "nebula_vortex_shader",
            "plasma_waves_shader",
            "cyber_grid_shader",
            "constellation_starfield",
            "pure_void",
        }
        if wallpaper_id in builtin_wallpaper_ids:
            return False
        was_active = bool(r["is_active"])
        source_path = r["source_path"]
        cur.execute("DELETE FROM user_wallpapers WHERE id = ?;", (wallpaper_id,))
        if was_active:
            cur.execute("UPDATE user_wallpapers SET is_active = 1 WHERE id = 'nebula_vortex_shader';")
        conn.commit()
        try:
            p = Path(source_path)
            wallpapers_dir = Path.home() / ".nexus-agent" / "wallpapers"
            if p.is_file() and (wallpapers_dir in p.parents or str(p).startswith(str(wallpapers_dir))):
                p.unlink(missing_ok=True)
        except Exception as exc:
            logger.debug("Wallpaper file unlink notice: %s", exc)
        return True

    def import_wallpaper(self, wallpaper_data: Union[Dict[str, Any], str]) -> Dict[str, Any]:
        """Imports wallpaper bundle (.nxwallpaper) or raw wallpaper dictionary."""
        if isinstance(wallpaper_data, str):
            try:
                wallpaper_data = json.loads(wallpaper_data)
            except Exception as exc:
                raise ValueError(f"Invalid JSON string for .nxwallpaper: {exc}")
        raw = wallpaper_data.get("wallpaper") if isinstance(wallpaper_data, dict) and "wallpaper" in wallpaper_data else wallpaper_data
        if not isinstance(raw, dict):
            raise ValueError("Invalid .nxwallpaper format: dictionary required")
        name = raw.get("name")
        kind = raw.get("kind", "image")
        source_path = raw.get("source_path", "")
        if not name:
            raise ValueError("Invalid .nxwallpaper format: 'name' required")
        wall_id = str(raw.get("id") or str(uuid.uuid4())).strip()
        config = raw.get("config") if isinstance(raw.get("config"), dict) else {}
        mode_binding = str(raw.get("mode_binding", "GLOBAL")).upper().strip()
        is_active = bool(raw.get("is_active", False))
        self.save_wallpaper({
            "id": wall_id,
            "name": name,
            "kind": kind,
            "source_path": source_path,
            "mode_binding": mode_binding,
            "config": config,
            "is_active": is_active,
        })
        saved = self.get_wallpaper(wall_id)
        if not saved:
            raise RuntimeError(f"Failed to retrieve imported wallpaper '{wall_id}'")
        return saved

    def export_wallpaper(self, wallpaper_id: str) -> Optional[Dict[str, Any]]:
        """Exports wallpaper bundle format (.nxwallpaper)."""
        wallpaper = self.get_wallpaper(wallpaper_id)
        if not wallpaper:
            return None
        return {
            "nxwallpaper_version": "1.0",
            "format": "nexus_wallpaper_bundle",
            "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "wallpaper": wallpaper,
        }


# Canonical alias for SovereignStore
SovereignStore = SovereignMemoryStore

__all__ = [
    "SovereignMemoryStore",
    "SovereignStore",
    "IngestedFile",
    "HAS_SQLITE_VEC",
    "CloudMemorySyncAdapter",
]


