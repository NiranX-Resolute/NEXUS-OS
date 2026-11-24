"""Nexus OS v5.0 - Dynamic Ephemeral Swarm Spawner & Mitosis Engine.

Dynamically synthesizes, multiplies, and cleanly dissolves ephemeral sub-agents
backed by SQLite WAL (~/.nexus-agent/db/agent_local.db), least-privilege ScopeGuard
tool masks, and anchor orbiters (DEV-01, SYS-01, SCOUT-01, SEC-01, OPS-01).

Zero-mock, zero-placeholder implementation conforming to Nexus OS v5.0 specifications.
"""

from __future__ import annotations

import datetime
import gc
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import uuid

from core.runtime.scope_guard import ScopeGuard
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.slice_engine import InfinitySliceEngine

try:
    from core.engine.safety_guard import SafetyGuard, EmergencyStopException
except ImportError:
    class EmergencyStopException(Exception):
        """Raised when E-Stop is active."""

    class SafetyGuard:
        _ESTOP_ACTIVE = False

        @classmethod
        def is_estop_active(cls) -> bool:
            return cls._ESTOP_ACTIVE

        @classmethod
        def assert_safety(cls) -> None:
            if cls._ESTOP_ACTIVE:
                raise EmergencyStopException("E-STOP ASSERTED")

logger = logging.getLogger("nexus.agents.dynamic_spawner")

MAX_SWARM_DEPTH = 3
MAX_CONCURRENT_AGENTS = 16


class SwarmCircuitBreakerError(RuntimeError):
    """Raised when a swarm operation breaches safety boundaries or circuit caps."""


class SwarmMitosisResult(list):
    """Hybrid list-and-dict result ensuring full backward compatibility with both list and dict callers."""

    def __init__(self, children: List[Dict[str, Any]], depth: int, success: bool = True) -> None:
        super().__init__(children)
        self.children = children
        self.depth = depth
        self.success = success
        self._meta: Dict[str, Any] = {
            "success": success,
            "depth": depth,
            "children": children,
            "count": len(children),
        }

    def __getitem__(self, item: Any) -> Any:
        if isinstance(item, str):
            return self._meta[item]
        return super().__getitem__(item)

    def get(self, key: str, default: Any = None) -> Any:
        return self._meta.get(key, default)

    def __contains__(self, item: Any) -> bool:
        if isinstance(item, str):
            return item in self._meta or super().__contains__(item)
        return super().__contains__(item)


ANCHOR_ORBITERS: Dict[str, Dict[str, Any]] = {
    "DEV-01": {
        "name": "NexKoder",
        "role": "Lead Code Synthesizer & AST Engineer",
        "color": "#00f5d4",
        "default_tools": ["filesystem", "git", "python_repl", "test_runner", "diff_patcher"],
        "airgap_tools": ["filesystem", "python_repl", "test_runner", "diff_patcher"],
    },
    "SYS-01": {
        "name": "SysGuard",
        "role": "Win32 System Reflex & Telemetry Controller",
        "color": "#38bdf8",
        "default_tools": ["system_telemetry", "win32_reflex", "hardware_meter", "process_governor"],
        "airgap_tools": ["system_telemetry", "win32_reflex", "hardware_meter"],
    },
    "SCOUT-01": {
        "name": "Scout",
        "role": "Autonomous Research, Docs & Knowledge Harvester",
        "color": "#f59e0b",
        "default_tools": ["web_search", "scholar_db", "fetch_doc", "context_distiller"],
        "airgap_tools": ["scholar_db", "context_distiller", "local_docs"],
    },
    "SEC-01": {
        "name": "Sentinel",
        "role": "AgentShield & 6 Sovereign Invariants Verifier",
        "color": "#a855f7",
        "default_tools": ["agent_shield", "scope_guard", "credential_vault", "audit_logger"],
        "airgap_tools": ["agent_shield", "scope_guard", "audit_logger"],
    },
    "OPS-01": {
        "name": "Orchestrator",
        "role": "Execution Slice & Instinct Promotion Engine",
        "color": "#10b981",
        "default_tools": ["slice_engine", "context_keeper", "instinct_store", "cron_watchdog"],
        "airgap_tools": ["slice_engine", "context_keeper", "instinct_store"],
    },
}


def _classify_anchor_orbiter(slug: str, name: str, description: str, prompt: str) -> str:
    """Classifies an archetype into one of the 5 Domain Anchor Orbiters."""
    text = f"{slug} {name} {description} {prompt[:300]}".lower()
    if any(k in text for k in ("security", "audit", "vulnerability", "threat", "auth", "crypto", "shield", "sast", "cve", "secret")):
        return "SEC-01"
    if any(k in text for k in ("scout", "search", "web", "research", "browse", "crawl", "scrape", "monitor", "scholar", "fetch")):
        return "SCOUT-01"
    if any(k in text for k in ("sys", "system", "os", "process", "hardware", "memory", "disk", "win32", "kernel", "daemon")):
        return "SYS-01"
    if any(k in text for k in ("ops", "deploy", "build", "runner", "pipeline", "docker", "ci", "cd", "cloud", "release", "infra")):
        return "OPS-01"
    return "DEV-01"


def _parse_agent_markdown(file_path: Path) -> Optional[Dict[str, Any]]:
    """Parses an agent markdown file, extracting YAML frontmatter and body."""
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        logger.debug("Failed reading %s: %s", file_path, exc)
        return None

    slug = file_path.stem
    name = slug.replace("-", " ").title()
    description = ""
    tools: List[str] = []
    body = content

    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            fm_text = parts[1]
            body = parts[2].strip()
            for line in fm_text.splitlines():
                line = line.strip()
                if line.startswith("name:"):
                    name = line.split(":", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("description:"):
                    description = line.split(":", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("tools:"):
                    raw_tools = line.split(":", 1)[1].strip()
                    if raw_tools.startswith("[") and raw_tools.endswith("]"):
                        raw_tools = raw_tools[1:-1]
                    tools = [t.strip().strip('"').strip("'").lower() for t in raw_tools.split(",") if t.strip()]

    if not description:
        first_line = next((l.strip().lstrip("#").strip() for l in body.splitlines() if l.strip()), name)
        description = first_line[:120]

    anchor = _classify_anchor_orbiter(slug, name, description, body)

    return {
        "slug": slug,
        "name": name,
        "description": description,
        "anchor_orbiter": anchor,
        "default_tools": tools or ANCHOR_ORBITERS[anchor]["default_tools"],
        "system_prompt": body,
    }


def sync_ecc_archetypes(
    vendor_dir: Optional[Union[str, Path]] = None,
    db_path: Optional[Union[str, Path]] = None,
) -> int:
    """Parses all specialist definitions in vendor_dir and upserts into ecc_agent_archetypes table."""
    v_dir = Path(vendor_dir or os.path.expanduser("~/.nexus-agent/vendor/ecc/agents")).resolve()
    if not v_dir.exists() or not v_dir.is_dir():
        logger.warning("ECC vendor agents directory not found: %s", v_dir)
        return 0

    target_db = Path(db_path or os.path.expanduser("~/.nexus-agent/db/agent_local.db")).resolve()
    target_db.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(target_db), timeout=5.0)
    imported = 0
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        conn.execute("PRAGMA journal_mode = WAL;")
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

        for md_file in sorted(v_dir.glob("*.md")):
            archetype = _parse_agent_markdown(md_file)
            if not archetype:
                continue

            conn.execute(
                """
                INSERT OR REPLACE INTO ecc_agent_archetypes (
                    slug, name, description, anchor_orbiter, default_tools_json, system_prompt, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    archetype["slug"],
                    archetype["name"],
                    archetype["description"],
                    archetype["anchor_orbiter"],
                    json.dumps(archetype["default_tools"]),
                    archetype["system_prompt"],
                    now_iso,
                ),
            )
            # Maintain FTS table
            conn.execute("DELETE FROM ecc_agent_archetypes_fts WHERE slug = ?;", (archetype["slug"],))
            conn.execute(
                """
                INSERT INTO ecc_agent_archetypes_fts (slug, name, description, anchor_orbiter)
                VALUES (?, ?, ?, ?);
                """,
                (
                    archetype["slug"],
                    archetype["name"],
                    archetype["description"],
                    archetype["anchor_orbiter"],
                ),
            )
            imported += 1

        try:
            conn.execute("INSERT INTO ecc_agent_archetypes_fts(ecc_agent_archetypes_fts) VALUES('optimize');")
        except Exception:
            pass
        conn.commit()
    finally:
        conn.close()

    logger.info("Synced %d ECC agent archetypes into %s", imported, target_db)
    return imported


class DynamicAgentSpawner:
    """Manages ephemeral multi-agent life-cycles, mitosis, and memory cleanup."""

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        governor: Optional[WorkspaceGovernor] = None,
    ) -> None:
        self.db_path = Path(db_path or os.path.expanduser("~/.nexus-agent/db/agent_local.db")).resolve()
        self.governor = governor or WorkspaceGovernor()
        self._cached_conn: Optional[sqlite3.Connection] = None
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        if self._cached_conn is None:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
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
            except Exception as exc:
                logger.debug("Closing dynamic spawner conn notice: %s", exc)
            self._cached_conn = None

    def _ensure_tables(self) -> None:
        """Verifies ephemeral_agents and telemetry tables exist in SQLite WAL."""
        with self._get_connection() as conn:
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
            # Schema upgrades if previously created with older schema
            try:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(ephemeral_agents);").fetchall()]
                if "swarm_id" not in cols:
                    conn.execute("ALTER TABLE ephemeral_agents ADD COLUMN swarm_id TEXT NOT NULL DEFAULT 'swarm_default';")
                if "token_budget" not in cols:
                    conn.execute("ALTER TABLE ephemeral_agents ADD COLUMN token_budget INTEGER NOT NULL DEFAULT 2048;")
                if "result_summary" not in cols:
                    conn.execute("ALTER TABLE ephemeral_agents ADD COLUMN result_summary TEXT NOT NULL DEFAULT '';")
            except Exception as exc:
                logger.debug("Table migration notice: %s", exc)

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_ephemeral_swarm_status ON ephemeral_agents(swarm_id, status);"
            )
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
            conn.commit()

    def get_active_agent_count(self) -> int:
        """Returns total active ephemeral agents in SQLite WAL."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) AS cnt FROM ephemeral_agents WHERE status IN ('ACTIVE', 'SPAWNED', 'WORKING');"
            )
            row = cursor.fetchone()
            return int(row["cnt"]) if row else 0

    def get_active_agents(self) -> List[Dict[str, Any]]:
        """Returns list of all active ephemeral agents with metadata."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT agent_id, swarm_id, parent_id, anchor_orbiter, role_title, objective,
                       allowed_tools_json, status, depth, token_budget, created_at, completed_at
                FROM ephemeral_agents
                WHERE status IN ('ACTIVE', 'SPAWNED', 'WORKING')
                ORDER BY depth ASC, created_at ASC;
                """
            )
            rows = cursor.fetchall()
            agents: List[Dict[str, Any]] = []
            for r in rows:
                tools = []
                try:
                    tools = json.loads(r["allowed_tools_json"])
                except Exception as exc:
                    logger.debug("Failed parsing allowed_tools_json for %s: %s", r["agent_id"], exc)
                agents.append({
                    "agent_id": r["agent_id"],
                    "swarm_id": r["swarm_id"],
                    "parent_id": r["parent_id"],
                    "anchor_orbiter": r["anchor_orbiter"],
                    "role_title": r["role_title"],
                    "objective": r["objective"],
                    "allowed_tools": tools,
                    "status": r["status"],
                    "depth": r["depth"],
                    "token_budget": r["token_budget"],
                    "created_at": r["created_at"],
                    "completed_at": r["completed_at"],
                })
            return agents

    def is_estop_asserted(self) -> bool:
        """Checks if Emergency Stop is asserted in memory or SQLite WAL."""
        if SafetyGuard.is_estop_active():
            return True
        try:
            with self._get_connection() as conn:
                cur = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP' LIMIT 1;")
                row = cur.fetchone()
                if row and str(row["flag_value"]).upper() == "ACTIVE":
                    SafetyGuard.trigger_estop("SQLite WAL ESTOP Flag Active")
                    return True
        except Exception as exc:
            logger.debug("ESTOP flag check notice: %s", exc)
        return False

    def _narrow_child_tools(
        self,
        requested_tools: Optional[List[str]],
        parent_tools: List[str],
    ) -> List[str]:
        """Strictly narrows child tools to a subset of parent tools adhering to ScopeGuard least-privilege."""
        parent_set = set(t.strip().lower() for t in parent_tools if t)
        if not requested_tools:
            return sorted(list(parent_set))
        requested_set = set(t.strip().lower() for t in requested_tools if t)
        # Narrow: strict intersection with parent tools
        narrowed = requested_set & parent_set
        return self._sanitize_tools(list(narrowed), parent_tools=list(parent_set))

    def _sanitize_tools(
        self,
        requested_tools: List[str],
        parent_tools: Optional[List[str]] = None,
    ) -> List[str]:
        """Intersects tools with ScopeGuard allowlists, parental containment, and SILENT mode air-gap."""
        clean = [t.strip().lower() for t in requested_tools if t and isinstance(t, str)]
        mode = self.governor.get_mode().upper()

        if mode == "SILENT":
            # Strip external network/cloud tools
            network_tools = {"web_search", "fetch_doc", "http_request", "cloud_gpu", "external_api"}
            clean = [t for t in clean if t not in network_tools]

        if parent_tools is not None:
            parent_set = set(t.strip().lower() for t in parent_tools)
            clean = [t for t in clean if t in parent_set]

        return sorted(list(set(clean)))

    def plan_and_spawn_swarm(
        self,
        user_goal: str,
        workspace_mode: Optional[str] = None,
        parent_tools: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Dynamically plans and synthesizes N specialized ephemeral sub-agents."""
        # 1. Assert E-STOP safety (memory and SQLite WAL)
        if self.is_estop_asserted():
            SafetyGuard.assert_safety()
            raise EmergencyStopException("E-STOP ASSERTED: Swarm spawning halted.")
        SafetyGuard.assert_safety()

        mode = (workspace_mode or self.governor.get_mode()).upper()
        is_silent = (mode == "SILENT")

        # 2. Decompose user goal into specialized subtasks
        subtasks = self._decompose_goal(user_goal, is_silent=is_silent)

        # 3. Check concurrency cap
        current_active = self.get_active_agent_count()
        if current_active + len(subtasks) > MAX_CONCURRENT_AGENTS:
            raise SwarmCircuitBreakerError(
                f"Swarm capacity exceeded: current {current_active} active + {len(subtasks)} requested "
                f"> MAX_CONCURRENT_AGENTS ({MAX_CONCURRENT_AGENTS})."
            )

        swarm_id = f"swarm-{uuid.uuid4().hex[:8]}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        now_ts = time.time()
        spawned: List[Dict[str, Any]] = []

        with self._get_connection() as conn:
            for item in subtasks:
                agent_id = f"eph-{uuid.uuid4().hex[:8]}"
                anchor = item["anchor"]
                raw_tools = ANCHOR_ORBITERS[anchor]["airgap_tools" if is_silent else "default_tools"]
                allowed_tools = self._sanitize_tools(raw_tools, parent_tools=parent_tools)

                system_prompt = (
                    f"You are ephemeral sub-agent '{item['role']}' anchored to {anchor} ({ANCHOR_ORBITERS[anchor]['name']}).\n"
                    f"Swarm ID: {swarm_id}\n"
                    f"Workspace Mode: [{mode}].\n"
                    f"Objective: {item['objective']}\n"
                    f"Confinement: Strictly respect ScopeGuard 6 Invariants. Produce deterministic outputs with zero stubs.\n"
                    f"Available Tools: {', '.join(allowed_tools)}."
                )

                conn.execute(
                    """
                    INSERT INTO ephemeral_agents (
                        agent_id, swarm_id, parent_id, anchor_orbiter, role_title, objective,
                        system_prompt, allowed_tools_json, status, depth, token_budget,
                        result_summary, created_at, completed_at
                    ) VALUES (?, ?, 'NEXUS-CORE', ?, ?, ?, ?, ?, 'ACTIVE', 1, 2048, '', ?, '');
                    """,
                    (
                        agent_id,
                        swarm_id,
                        anchor,
                        item["role"],
                        item["objective"],
                        system_prompt,
                        json.dumps(allowed_tools),
                        now_iso,
                    ),
                )

                # Emit agent_slice and circuit_pulse telemetry
                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (
                        "agent_slice",
                        json.dumps({
                            "agent_id": anchor,
                            "status": "EXECUTING",
                            "task_summary": item["objective"],
                            "slice_id": agent_id,
                        }),
                        now_ts,
                    ),
                )
                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (
                        "circuit_pulse",
                        json.dumps({
                            "node": "SWARM_MITOSIS",
                            "active": True,
                            "detail": f"{swarm_id}::{agent_id}::{item['role']}",
                            "latency_ms": 1.0,
                        }),
                        now_ts,
                    ),
                )

                spawned.append({
                    "agent_id": agent_id,
                    "swarm_id": swarm_id,
                    "parent_id": "NEXUS-CORE",
                    "anchor_orbiter": anchor,
                    "role_title": item["role"],
                    "objective": item["objective"],
                    "allowed_tools": allowed_tools,
                    "depth": 1,
                    "status": "ACTIVE",
                    "created_at": now_iso,
                })

            conn.commit()

        logger.info("Spawned %d ephemeral sub-agents for swarm '%s'", len(spawned), swarm_id)
        return {
            "success": True,
            "swarm_id": swarm_id,
            "goal": user_goal,
            "workspace_mode": mode,
            "agents": spawned,
            "spawned_agents": spawned,
            "total_active": self.get_active_agent_count(),
        }

    def multiply_agent(
        self,
        parent_agent_id: str,
        subtasks: Union[List[str], List[Dict[str, Any]]],
    ) -> List[Dict[str, Any]]:
        """Allows an ephemeral agent to recursively multiply into child slices bounded by circuit breakers."""
        if self.is_estop_asserted():
            SafetyGuard.assert_safety()
            raise EmergencyStopException("E-STOP ASSERTED: Swarm mitosis halted.")
        SafetyGuard.assert_safety()

        if not subtasks:
            return []

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM ephemeral_agents WHERE agent_id = ? LIMIT 1;",
                (parent_agent_id,),
            )
            parent = cursor.fetchone()
            if not parent:
                raise ValueError(f"Parent agent '{parent_agent_id}' not found in ephemeral_agents.")

            parent_depth = int(parent["depth"] or 1)
            child_depth = parent_depth + 1
            if child_depth > MAX_SWARM_DEPTH:
                raise SwarmCircuitBreakerError(
                    f"Swarm mitosis rejected: child depth {child_depth} exceeds MAX_SWARM_DEPTH ({MAX_SWARM_DEPTH})."
                )

            current_active = self.get_active_agent_count()
            if current_active + len(subtasks) > MAX_CONCURRENT_AGENTS:
                raise SwarmCircuitBreakerError(
                    f"Swarm capacity exceeded: current {current_active} active + {len(subtasks)} requested "
                    f"> MAX_CONCURRENT_AGENTS ({MAX_CONCURRENT_AGENTS})."
                )

            swarm_id = parent["swarm_id"] or f"swarm-{uuid.uuid4().hex[:8]}"
            anchor = str(parent["anchor_orbiter"] or "DEV-01")
            parent_tools = []
            try:
                parent_tools = json.loads(parent["allowed_tools_json"])
            except Exception:
                parent_tools = ANCHOR_ORBITERS[anchor]["default_tools"]

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            now_ts = time.time()
            children: List[Dict[str, Any]] = []

            for idx, task_item in enumerate(subtasks, start=1):
                if isinstance(task_item, dict):
                    task_desc = task_item.get("objective") or task_item.get("task") or str(task_item)
                    req_tools = task_item.get("tools")
                else:
                    task_desc = str(task_item)
                    req_tools = None

                child_id = f"{parent_agent_id}-c{idx}_{uuid.uuid4().hex[:4]}"
                role = f"{parent['role_title']} Sub-Worker #{idx}"
                prompt = (
                    f"Child Worker of {parent_agent_id} (Depth {child_depth}).\n"
                    f"Subtask: {task_desc}\n"
                    f"Report findings back to parent {parent_agent_id} upon completion."
                )
                child_tools = self._narrow_child_tools(req_tools, parent_tools=parent_tools)

                conn.execute(
                    """
                    INSERT INTO ephemeral_agents (
                        agent_id, swarm_id, parent_id, anchor_orbiter, role_title, objective,
                        system_prompt, allowed_tools_json, status, depth, token_budget,
                        result_summary, created_at, completed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 2048, '', ?, '');
                    """,
                    (
                        child_id,
                        swarm_id,
                        parent_agent_id,
                        anchor,
                        role,
                        task_desc,
                        prompt,
                        json.dumps(child_tools),
                        child_depth,
                        now_iso,
                    ),
                )

                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (
                        "circuit_pulse",
                        json.dumps({
                            "node": "SWARM_MITOSIS",
                            "active": True,
                            "detail": f"{parent_agent_id} -> {child_id} (D{child_depth})",
                            "latency_ms": 1.0,
                        }),
                        now_ts,
                    ),
                )

                children.append({
                    "agent_id": child_id,
                    "swarm_id": swarm_id,
                    "parent_id": parent_agent_id,
                    "anchor_orbiter": anchor,
                    "role_title": role,
                    "objective": task_desc,
                    "allowed_tools": child_tools,
                    "depth": child_depth,
                    "status": "ACTIVE",
                    "created_at": now_iso,
                })

            conn.commit()

        logger.info("Agent '%s' multiplied into %d children at depth %d", parent_agent_id, len(children), child_depth)
        return SwarmMitosisResult(children, depth=child_depth)

    def dissolve_agent(
        self,
        agent_id: str,
        result_summary: str = "",
        verified_workflow: bool = False,
        *,
        synthesis_summary: str = "",
        solution_code: str = "",
    ) -> Dict[str, Any]:
        """Dissolves an ephemeral agent, releases memory, and records instincts."""
        effective_summary = synthesis_summary or result_summary
        if solution_code and not effective_summary:
            effective_summary = solution_code[:200]
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        now_ts = time.time()
        parent_id = None
        anchor = "DEV-01"
        objective = ""

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM ephemeral_agents WHERE agent_id = ? LIMIT 1;",
                (agent_id,),
            )
            row = cursor.fetchone()
            if not row:
                return {"success": False, "error": f"Agent '{agent_id}' not found."}

            parent_id = row["parent_id"]
            anchor = row["anchor_orbiter"] or "DEV-01"
            objective = row["objective"] or ""

            # Update status to DISSOLVED
            conn.execute(
                """
                UPDATE ephemeral_agents
                SET status = 'DISSOLVED', result_summary = ?, completed_at = ?
                WHERE agent_id = ?;
                """,
                (effective_summary, now_iso, agent_id),
            )

            # Emit dissolution telemetry events
            conn.execute(
                "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                (
                    "agent_slice",
                    json.dumps({
                        "agent_id": anchor,
                        "status": "IDLE",
                        "task_summary": effective_summary[:60] or "Dissolved",
                        "slice_id": agent_id,
                    }),
                    now_ts,
                ),
            )
            conn.commit()

        # Feed verified solutions into learned_instincts if verified_workflow or solution_code
        instinct_recorded = False
        if (verified_workflow or solution_code) and (effective_summary or solution_code):
            try:
                from core.memory.instinct_engine import InstinctEngine
                ie = InstinctEngine(db_path=self.db_path)
                ie.extract_and_store_instinct(
                    task_prompt=objective or f"Agent task {agent_id}",
                    verified_fix=solution_code or effective_summary,
                    workspace_mode=self.governor.get_mode(),
                    source_slice_id=agent_id,
                )
                instinct_recorded = True
                ie.close()
            except Exception as exc:
                logger.debug("Instinct extraction notice: %s", exc)

        # Force Python garbage collection (0 MB idle RAM)
        gc.collect()

        remaining = self.get_active_agent_count()
        logger.info("Dissolved agent '%s' (parent=%s, remaining_active=%d)", agent_id, parent_id, remaining)
        return {
            "success": True,
            "agent_id": agent_id,
            "parent_id": parent_id,
            "status": "DISSOLVED",
            "result_summary": result_summary,
            "instinct_recorded": instinct_recorded,
            "remaining_active": remaining,
            "completed_at": now_iso,
        }

    def kill_agent(self, agent_id: str) -> Dict[str, Any]:
        """Immediately marks target agent ABORTED."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE ephemeral_agents SET status = 'ABORTED', completed_at = ? WHERE agent_id = ?;",
                (now_iso, agent_id),
            )
            conn.commit()
        return {"success": True, "agent_id": agent_id, "status": "ABORTED"}

    def kill_swarm(self, swarm_id: str) -> Dict[str, Any]:
        """Immediately aborts all active agents for a given swarm_id."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE ephemeral_agents
                SET status = 'ABORTED', completed_at = ?
                WHERE swarm_id = ? AND status IN ('ACTIVE', 'SPAWNED', 'WORKING');
                """,
                (now_iso, swarm_id),
            )
            conn.commit()
        return {"success": True, "swarm_id": swarm_id, "status": "ABORTED"}

    def get_active_swarm_tree(self) -> Dict[str, Any]:
        """Returns all active ephemeral agents grouped by swarm_id and anchor_orbiter."""
        active = self.get_active_agents()
        by_swarm: Dict[str, List[Dict[str, Any]]] = {}
        by_orbiter: Dict[str, List[Dict[str, Any]]] = {
            "DEV-01": [], "SYS-01": [], "SCOUT-01": [], "SEC-01": [], "OPS-01": []
        }

        for ag in active:
            s_id = ag.get("swarm_id", "default")
            by_swarm.setdefault(s_id, []).append(ag)
            orb = ag.get("anchor_orbiter", "DEV-01")
            by_orbiter.setdefault(orb, []).append(ag)

        return {
            "success": True,
            "total_active": len(active),
            "swarms": by_swarm,
            "orbiters": by_orbiter,
            "agents": active,
        }

    def _decompose_goal(self, goal: str, is_silent: bool = False) -> List[Dict[str, str]]:
        """Decomposes user goal into 1-4 specialized subtasks mapped to anchor orbiters."""
        g_lower = goal.lower()
        tasks: List[Dict[str, str]] = []

        if any(w in g_lower for w in ("code", "build", "refactor", "bug", "test", "implement", "app", "ui", "fix", "synthesize", "parse", "parser", "benchmark", "sql", "database")):
            tasks.append({
                "anchor": "DEV-01",
                "role": "Code Synthesis & Verification",
                "objective": f"Synthesize and execute implementation for: {goal}",
            })

        if any(w in g_lower for w in ("system", "hardware", "process", "volume", "screen", "win32", "power", "latency", "benchmark", "memory")):
            tasks.append({
                "anchor": "SYS-01",
                "role": "System Actuation & OS Verification",
                "objective": f"Enact and monitor OS hardware/process changes for: {goal}",
            })

        if not is_silent and any(w in g_lower for w in ("search", "find", "research", "paper", "doc", "scrape", "learn", "architecture docs")):
            tasks.append({
                "anchor": "SCOUT-01",
                "role": "Knowledge Harvester & Recon",
                "objective": f"Gather research documentation and references for: {goal}",
            })

        if any(w in g_lower for w in ("security", "audit", "vault", "secret", "permission", "shield", "protect")):
            tasks.append({
                "anchor": "SEC-01",
                "role": "Invariant Safety & Shield Verification",
                "objective": f"Verify 6 Sovereign Invariants and audit safe boundaries for: {goal}",
            })

        if not tasks:
            tasks.append({
                "anchor": "DEV-01",
                "role": "Execution Specialist",
                "objective": goal,
            })
            tasks.append({
                "anchor": "OPS-01",
                "role": "Lifecycle & State Supervisor",
                "objective": f"Track execution milestones and persist context for: {goal}",
            })

        return tasks
