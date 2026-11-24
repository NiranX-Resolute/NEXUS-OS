"""Nexus OS v5.0 - Agent Reach SCOUT-01 Research & Recon Plugin.

Wraps Agent Reach (Panniantong/Agent-Reach / https://agentreach.cfd) for fast,
structured, API-keyless read and search access across GitHub, Reddit, X/Twitter,
YouTube transcripts, Bilibili, and web reader extraction.

Architectural Integration:
- Positioned in Tier 1 of the NEXUS OS v5.0 execution stack, ahead of full browser automation
- Enforces WorkspaceGovernor ([SILENT] mode air-gaps all external network requests)
- Enforces ScopeGuard (target URL and domain allowlist validation)
- Persists all fetched items into SovereignStore (~/.nexus-agent/db/agent_local.db, SQLite WAL, FTS5)
- Emits real-time telemetry (agent_slice SCOUT-01 & circuit_pulse MCP_SKILLS/MEMORY)
- Registered via @nexus_tool decorator for auto-discovery and MCP exposure
- Bounded execution with explicit 30s timeouts, zero stubs, zero mocks
"""

from __future__ import annotations

import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from core.mcp.plugin_loader import nexus_tool
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.reflex_router import emit_telemetry_event
from core.runtime.scope_guard import ScopeGuard
from core.runtime.workspaces import WorkspaceGovernor

logger = logging.getLogger("nexus.mcp.plugins.agent_reach")

# Pinned reference metadata for Agent Reach
AGENT_REACH_UPSTREAM = "https://github.com/Panniantong/Agent-Reach"
AGENT_REACH_DOCS = "https://agentreach.cfd"
AGENT_REACH_PINNED_VERSION = "0.1.0"


def _detect_channel_from_url(url: str) -> str:
    """Infers the platform channel from a given target URL."""
    if not url:
        return "web"
    clean = url.strip().lower()
    if "github.com" in clean:
        return "github"
    if "reddit.com" in clean or "redd.it" in clean:
        return "reddit"
    if "youtube.com" in clean or "youtu.be" in clean:
        return "youtube"
    if "twitter.com" in clean or "x.com" in clean:
        return "twitter"
    if "bilibili.com" in clean:
        return "bilibili"
    return "web"


def _resolve_agent_reach_binary() -> Optional[str]:
    """Finds the agent-reach CLI executable in PATH or standard user directories."""
    found = shutil.which("agent-reach")
    if found:
        return found

    candidates = [
        Path.home() / ".local" / "bin" / "agent-reach.exe",
        Path.home() / ".local" / "bin" / "agent-reach",
        Path.home() / ".cargo" / "bin" / "agent-reach.exe",
        Path.home() / ".cargo" / "bin" / "agent-reach",
        Path.home() / ".agent-reach" / "bin" / "agent-reach.exe",
        Path.home() / "AppData" / "Roaming" / "Python" / "Scripts" / "agent-reach.exe",
    ]
    for candidate in candidates:
        if candidate.exists() and os.access(str(candidate), os.X_OK if hasattr(os, "X_OK") else os.R_OK):
            return str(candidate)
    return None


def seed_agent_reach_skill(db_path: Optional[Path] = None) -> bool:
    """Seeds or updates the /skill:agent-reach playbook in ecc_skills in agent_local.db."""
    target_db = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
    if not target_db.parent.exists():
        try:
            target_db.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            return False

    try:
        conn = sqlite3.connect(str(target_db), timeout=5.0)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ecc_skills (
                slug TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                author TEXT,
                category TEXT,
                description TEXT,
                type TEXT DEFAULT 'skill',
                orbiter_group TEXT DEFAULT 'DEV-01',
                permission_scope TEXT DEFAULT '[]',
                instructions_md TEXT,
                references_json TEXT DEFAULT '[]',
                tools_json TEXT DEFAULT '[]',
                package_url TEXT,
                sha256 TEXT,
                risk_score INTEGER DEFAULT 0,
                verified INTEGER DEFAULT 1,
                indexed_at TEXT
            );
            """
        )
        instructions = (
            "# /skill:agent-reach - Structured Multi-Channel Reader & Search\n\n"
            "## Overview\n"
            "Agent Reach (agentreach.cfd / Panniantong/Agent-Reach) provides fast, structured read and search access "
            "across GitHub, Reddit, X/Twitter, YouTube, Bilibili, and web articles with zero paid API keys.\n\n"
            "## Tier 1 Escalation Order in SCOUT-01\n"
            "1. Check SovereignStore (~/.nexus-agent/db/agent_local.db) for cached findings.\n"
            "2. Enforce WorkspaceGovernor ([SILENT] mode air-gaps all external calls) and ScopeGuard URL validation.\n"
            "3. Call scout_reach_read or scout_reach_search.\n"
            "4. If the page requires complex JavaScript rendering or Shadow-DOM interaction, escalate to Tier 2 (Obscura CDP / WarmBrowserSession).\n\n"
            "## Tool Commands\n"
            "- scout_reach_doctor(): Verifies CLI installation and platform backends.\n"
            "- scout_reach_read(target, workspace_mode): Reads clean structured transcripts, issues, or article bodies.\n"
            "- scout_reach_search(query, channel, workspace_mode): Searches across public channels.\n"
        )
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO ecc_skills (
                slug, title, author, category, description, type,
                orbiter_group, permission_scope, instructions_md,
                references_json, tools_json, package_url,
                sha256, risk_score, verified, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                instructions_md = excluded.instructions_md,
                tools_json = excluded.tools_json,
                package_url = excluded.package_url,
                verified = excluded.verified,
                indexed_at = excluded.indexed_at;
            """,
            (
                "agent-reach",
                "Agent Reach - Structured Multi-Channel Reader & Search",
                "Panniantong/Agent-Reach",
                "Research & Recon",
                "Open-source structured read and search access across GitHub, Reddit, X/Twitter, YouTube, Bilibili, and web articles with zero API fees.",
                "skill",
                "SCOUT-01",
                json.dumps(["network:read", "fs:read"]),
                instructions,
                json.dumps(["https://agentreach.cfd", AGENT_REACH_UPSTREAM]),
                json.dumps(["scout_reach_read", "scout_reach_search", "scout_reach_doctor"]),
                AGENT_REACH_DOCS,
                hashlib.sha256(instructions.encode("utf-8")).hexdigest(),
                0,
                1,
                now_iso,
            ),
        )
        conn.commit()
        conn.close()
        return True
    except Exception as exc:
        logger.debug("Failed seeding agent-reach skill: %s", exc)
        return False


# Attempt initial playbook seeding
try:
    seed_agent_reach_skill()
except Exception:
    pass


@nexus_tool(
    name="scout_reach_doctor",
    description="Checks Agent Reach CLI installation status, platform channel backends, and diagnostic health.",
    agent="SCOUT-01",
    requires_approval=False,
)
def scout_reach_doctor() -> Dict[str, Any]:
    """Checks agent-reach CLI binary, channel readiness, and diagnostic recommendations."""
    bin_path = _resolve_agent_reach_binary()
    if not bin_path:
        return {
            "ok": False,
            "installed": False,
            "executable": None,
            "pinned_version": AGENT_REACH_PINNED_VERSION,
            "message": "agent-reach CLI not found in PATH or standard tool dirs. Install via 'uv tool install agent-reach' or see https://agentreach.cfd",
            "channels": {
                "github": "unverified",
                "reddit": "unverified",
                "youtube": "unverified",
                "twitter": "unverified",
                "bilibili": "unverified",
                "web": "unverified",
            },
            "install_cmd": "uv tool install agent-reach",
            "docs": AGENT_REACH_DOCS,
        }

    try:
        proc = subprocess.run(
            [bin_path, "doctor"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        stdout_txt = proc.stdout.strip()
        stderr_txt = proc.stderr.strip()
        is_ok = proc.returncode == 0
        return {
            "ok": is_ok,
            "installed": True,
            "executable": bin_path,
            "pinned_version": AGENT_REACH_PINNED_VERSION,
            "stdout": stdout_txt,
            "stderr": stderr_txt if not is_ok else "",
            "install_cmd": "uv tool install agent-reach",
            "docs": AGENT_REACH_DOCS,
        }
    except Exception as exc:
        return {
            "ok": False,
            "installed": True,
            "executable": bin_path,
            "pinned_version": AGENT_REACH_PINNED_VERSION,
            "error": str(exc),
            "install_cmd": "uv tool install agent-reach",
            "docs": AGENT_REACH_DOCS,
        }


@nexus_tool(
    name="scout_reach_read",
    description="Reads structured content, articles, or transcripts from URLs across GitHub, Reddit, YouTube, X/Twitter, or web readers via agent-reach.",
    agent="SCOUT-01",
    requires_approval=False,
)
def scout_reach_read(
    target: str,
    workspace_mode: str = "DEV",
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Reads structured public content from target URL using agent-reach CLI.
    Enforces WorkspaceGovernor [SILENT] air-gap and ScopeGuard scope validation,
    persisting results into SovereignStore.
    """
    clean_target = (target or "").strip()
    if not clean_target:
        return {
            "ok": False,
            "error": "Target URL cannot be empty",
            "target": "",
        }

    # 1. WorkspaceGovernor Air-Gap Check: Block all external execution when in SILENT mode
    governor = WorkspaceGovernor()
    active_mode = (workspace_mode or governor.get_mode() or "DEV").upper()
    if active_mode == "SILENT" or governor.is_silent():
        return {
            "ok": False,
            "blocked": True,
            "reason": "SILENT mode blocks external network calls",
            "target": clean_target,
            "workspace_mode": "SILENT",
        }

    # 2. Check SovereignStore cache first
    store = SovereignMemoryStore(db_path=db_path)
    try:
        conn = store._get_connection()
        row = conn.execute(
            "SELECT * FROM reach_events WHERE source_url = ? ORDER BY created_at DESC LIMIT 1;",
            (clean_target,),
        ).fetchone()
        conn.close()
        if row:
            r_dict = dict(row)
            return {
                "ok": True,
                "cached": True,
                "event_id": r_dict.get("id"),
                "target": clean_target,
                "source_url": clean_target,
                "channel": r_dict.get("channel", "web"),
                "title": r_dict.get("title", ""),
                "summary": r_dict.get("summary", ""),
                "summary_or_body": r_dict.get("summary") or r_dict.get("content", ""),
                "content": r_dict.get("content", ""),
                "fetched_at": r_dict.get("created_at", ""),
                "workspace_mode": active_mode,
                "latency_ms": 1.0,
            }
    except Exception as cache_exc:
        logger.debug("SovereignStore reach cache check notice: %s", cache_exc)

    # 3. ScopeGuard Validation: Enforce domain containment & SEC-01 allowlist
    scope_guard = ScopeGuard()
    if not scope_guard.validate_target(clean_target):
        return {
            "ok": False,
            "blocked": True,
            "reason": f"Target '{clean_target}' is out of authorized scope",
            "target": clean_target,
            "workspace_mode": active_mode,
        }

    # 4. Locate CLI binary
    bin_path = _resolve_agent_reach_binary()
    if not bin_path:
        return {
            "ok": False,
            "installed": False,
            "error": "agent-reach CLI not found. Install via 'uv tool install agent-reach' or run 'agent-reach doctor'.",
            "target": clean_target,
            "install_cmd": "uv tool install agent-reach",
        }

    channel = _detect_channel_from_url(clean_target)
    start_time = time.time()

    # 4. Bounded Subprocess Execution
    try:
        proc = subprocess.run(
            [bin_path, "read", clean_target],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "installed": False,
            "error": "agent-reach CLI not found. Install via 'uv tool install agent-reach' or run 'agent-reach doctor'.",
            "target": clean_target,
            "install_cmd": "uv tool install agent-reach",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "agent-reach read execution timed out after 30 seconds",
            "target": clean_target,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"agent-reach invocation failed: {exc}",
            "target": clean_target,
        }

    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    if proc.returncode != 0:
        err_msg = proc.stderr.strip() or f"Process exited with status {proc.returncode}"
        return {
            "ok": False,
            "error": err_msg,
            "target": clean_target,
            "channel": channel,
            "latency_ms": elapsed_ms,
        }

    raw_output = proc.stdout.strip()
    parsed_json: Optional[Dict[str, Any]] = None
    try:
        if raw_output.startswith("{") and raw_output.endswith("}"):
            parsed_json = json.loads(raw_output)
    except Exception:
        parsed_json = None

    if parsed_json and isinstance(parsed_json, dict):
        title = parsed_json.get("title") or clean_target
        content = parsed_json.get("content") or parsed_json.get("body") or raw_output
        summary = parsed_json.get("summary") or content[:350]
    else:
        lines = [line.strip() for line in raw_output.splitlines() if line.strip()]
        title = lines[0] if lines else clean_target
        content = raw_output
        summary = content[:350]

    # 5. Persist into SovereignStore
    store = SovereignMemoryStore(db_path=db_path)
    ev_id = store.insert_reach_event(
        source_url=clean_target,
        title=title,
        content=content,
        channel=channel,
        workspace_mode=active_mode,
        summary=summary,
        metadata={
            "agent": "SCOUT-01",
            "engine": "agent-reach",
            "latency_ms": elapsed_ms,
            "target": clean_target,
        },
    )

    # 6. Emit Real Telemetry Events
    emit_telemetry_event(
        "agent_slice",
        {
            "agent": "SCOUT-01",
            "action": "reach_read",
            "target": clean_target,
            "channel": channel,
            "workspace_mode": active_mode,
            "status": "COMPLETED",
            "latency_ms": elapsed_ms,
        },
    )
    emit_telemetry_event(
        "circuit_pulse",
        {
            "node": "MCP_SKILLS",
            "active": True,
            "detail": f"SCOUT-01 reach_read: {clean_target[:40]}",
            "latency_ms": elapsed_ms,
        },
    )

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {
        "ok": True,
        "event_id": ev_id,
        "target": clean_target,
        "source_url": clean_target,
        "channel": channel,
        "title": title,
        "summary": summary,
        "summary_or_body": summary,
        "content": content,
        "fetched_at": now_iso,
        "workspace_mode": active_mode,
        "latency_ms": elapsed_ms,
    }


@nexus_tool(
    name="scout_reach_search",
    description="Searches across public channels (GitHub, Reddit, YouTube, X/Twitter, web) via agent-reach.",
    agent="SCOUT-01",
    requires_approval=False,
)
def scout_reach_search(
    query: str,
    channel: str = "all",
    workspace_mode: str = "DEV",
    db_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Executes fast multi-channel search using agent-reach CLI.
    Enforces WorkspaceGovernor [SILENT] air-gap and persists findings to SovereignStore.
    """
    clean_query = (query or "").strip()
    if not clean_query:
        return {
            "ok": False,
            "error": "Search query cannot be empty",
            "query": "",
        }

    # 1. WorkspaceGovernor Air-Gap Check
    governor = WorkspaceGovernor()
    active_mode = (workspace_mode or governor.get_mode() or "DEV").upper()
    if active_mode == "SILENT" or governor.is_silent():
        return {
            "ok": False,
            "blocked": True,
            "reason": "SILENT mode blocks external network calls",
            "query": clean_query,
            "workspace_mode": "SILENT",
        }

    # 2. Check SovereignStore cache first
    store = SovereignMemoryStore(db_path=db_path)
    clean_channel = (channel or "all").strip().lower()
    search_url = f"search://{clean_channel}?q={clean_query}"
    try:
        conn = store._get_connection()
        row = conn.execute(
            "SELECT * FROM reach_events WHERE source_url = ? ORDER BY created_at DESC LIMIT 1;",
            (search_url,),
        ).fetchone()
        conn.close()
        if row:
            r_dict = dict(row)
            cached_results = []
            try:
                cached_results = json.loads(r_dict.get("content", "[]"))
            except Exception:
                cached_results = [{"title": r_dict.get("title", ""), "snippet": r_dict.get("summary", ""), "channel": clean_channel}]
            return {
                "ok": True,
                "cached": True,
                "event_id": r_dict.get("id"),
                "query": clean_query,
                "source_url": search_url,
                "channel": clean_channel,
                "results": cached_results,
                "count": len(cached_results),
                "summary": r_dict.get("summary", ""),
                "summary_or_body": r_dict.get("summary", ""),
                "fetched_at": r_dict.get("created_at", ""),
                "workspace_mode": active_mode,
                "latency_ms": 1.0,
            }
    except Exception as cache_exc:
        logger.debug("SovereignStore search cache notice: %s", cache_exc)

    # 3. Locate CLI binary
    bin_path = _resolve_agent_reach_binary()
    if not bin_path:
        return {
            "ok": False,
            "installed": False,
            "error": "agent-reach CLI not found. Install via 'uv tool install agent-reach' or run 'agent-reach doctor'.",
            "query": clean_query,
            "install_cmd": "uv tool install agent-reach",
        }

    cmd = [bin_path, "search", clean_query]
    clean_channel = (channel or "all").strip().lower()
    if clean_channel and clean_channel != "all":
        cmd.extend(["--channel", clean_channel])

    start_time = time.time()

    # 3. Bounded Subprocess Execution
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except FileNotFoundError:
        return {
            "ok": False,
            "installed": False,
            "error": "agent-reach CLI not found. Install via 'uv tool install agent-reach' or run 'agent-reach doctor'.",
            "query": clean_query,
            "install_cmd": "uv tool install agent-reach",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "error": "agent-reach search execution timed out after 30 seconds",
            "query": clean_query,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": f"agent-reach search invocation failed: {exc}",
            "query": clean_query,
        }

    elapsed_ms = round((time.time() - start_time) * 1000.0, 2)

    if proc.returncode != 0:
        err_msg = proc.stderr.strip() or f"Process exited with status {proc.returncode}"
        return {
            "ok": False,
            "error": err_msg,
            "query": clean_query,
            "channel": clean_channel,
            "latency_ms": elapsed_ms,
        }

    raw_output = proc.stdout.strip()
    parsed_json: Optional[Any] = None
    try:
        if (raw_output.startswith("{") and raw_output.endswith("}")) or (raw_output.startswith("[") and raw_output.endswith("]")):
            parsed_json = json.loads(raw_output)
    except Exception:
        parsed_json = None

    results: List[Dict[str, Any]] = []
    if parsed_json and isinstance(parsed_json, list):
        results = parsed_json
    elif parsed_json and isinstance(parsed_json, dict):
        results = parsed_json.get("results") or [parsed_json]
    else:
        for line in raw_output.splitlines():
            line_str = line.strip()
            if line_str:
                results.append({"title": line_str, "snippet": line_str, "channel": clean_channel})

    summary_text = f"Agent Reach search for '{clean_query}' yielded {len(results)} items across {clean_channel}."

    # 4. Persist into SovereignStore
    store = SovereignMemoryStore(db_path=db_path)
    ev_id = store.insert_reach_event(
        source_url=f"search://{clean_channel}?q={clean_query}",
        title=f"Search: {clean_query}",
        content=raw_output,
        channel=clean_channel,
        workspace_mode=active_mode,
        summary=summary_text,
        metadata={
            "agent": "SCOUT-01",
            "engine": "agent-reach",
            "query": clean_query,
            "results_count": len(results),
            "latency_ms": elapsed_ms,
        },
    )

    # 5. Emit Telemetry
    emit_telemetry_event(
        "agent_slice",
        {
            "agent": "SCOUT-01",
            "action": "reach_search",
            "query": clean_query,
            "channel": clean_channel,
            "count": len(results),
            "workspace_mode": active_mode,
            "status": "COMPLETED",
            "latency_ms": elapsed_ms,
        },
    )
    emit_telemetry_event(
        "circuit_pulse",
        {
            "node": "MCP_SKILLS",
            "active": True,
            "detail": f"SCOUT-01 reach_search: '{clean_query[:30]}'",
            "latency_ms": elapsed_ms,
        },
    )

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    return {
        "ok": True,
        "event_id": ev_id,
        "query": clean_query,
        "source_url": search_url,
        "channel": clean_channel,
        "results": results,
        "count": len(results),
        "summary": summary_text,
        "summary_or_body": summary_text,
        "fetched_at": now_iso,
        "workspace_mode": active_mode,
        "latency_ms": elapsed_ms,
    }
