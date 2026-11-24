"""Nexus OS v5.0 - SCOUT-01 Automatic 3-Tier Fallback Cascade.

Implements the deterministic 3-tier cascade for SCOUT-01:
1. Tier 1: Agent Reach (agentreach.cfd / Panniantong/Agent-Reach) structured platform reads & searches
2. Tier 2: Obscura CDP (:9222) lightweight headless browser extraction
3. Tier 3: WarmBrowserSession (~/.nexus-agent/browser_profile) persistent Chromium with
   recursive [1..N] data-nexus-id Shadow-DOM distillation and wait_for_stream_stability()

Governance & Security:
- WorkspaceGovernor: strictly blocks all external tiers in [SILENT] air-gapped mode
- ScopeGuard: validates all target URLs and domains against engagement_scope.json
- SovereignStore: persists all captured content into ~/.nexus-agent/db/agent_local.db (reach_events + FTS5)
- Telemetry: emits real-time agent_slice (SCOUT-01) and circuit_pulse (MCP_SKILLS / MEMORY)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional, Union
from urllib.parse import urlparse

from core.engine.tools.browser_verifier import DEFAULT_CDP_URL, WarmBrowserSession
from core.mcp.plugins.agent_reach_plugin import scout_reach_read, scout_reach_search
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.reflex_router import emit_telemetry_event
from core.runtime.scope_guard import ScopeGuard
from core.runtime.workspaces import WorkspaceGovernor

logger = logging.getLogger("nexus.engine.tools.scout_cascade")


def _is_estop_engaged(db_path: Optional[Union[str, Path]] = None) -> bool:
    """Checks if Emergency Stop (ESTOP) is active in env or SQLite system_flags."""
    if os.environ.get("ESTOP") in ("1", "true", "True"):
        return True
    try:
        from core.engine.safety_guard import SafetyGuard
        if SafetyGuard.is_estop_active():
            return True
    except Exception:
        pass
    target_db = Path(db_path) if db_path else (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
    if target_db.exists():
        try:
            conn = sqlite3.connect(str(target_db), timeout=0.2)
            try:
                row = conn.execute("SELECT flag_value FROM system_flags WHERE flag_key = 'ESTOP' LIMIT 1;").fetchone()
                if row and str(row[0]).strip().upper() in ("1", "ACTIVE", "TRIGGERED", "TRUE"):
                    return True
            finally:
                conn.close()
        except Exception:
            pass
    return False


def scout_cascade_run(
    target: str,
    mode: str = "read",
    force_tier: str = "auto",
    workspace_mode: str = "DEV",
    db_path: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """
    Executes the 3-tier automatic fallback cascade for SCOUT-01.

    Args:
        target: Target URL, repository, or search query.
        mode: Operation mode ('read' or 'search').
        force_tier: 'auto' (default cascade), 'reach', 'obscura', or 'chromium'.
        workspace_mode: Active workspace mode ('DEV', 'STUDY', 'STUDIO', 'SILENT').
        db_path: Optional SQLite database path override for isolated test fixtures.

    Returns:
        Structured response with winning tier, fallback chain, extracted content, and event metadata.
    """
    clean_target = (target or "").strip()
    clean_mode = (mode or "read").strip().lower()
    tier_choice = (force_tier or "auto").strip().lower()

    if not clean_target:
        return {
            "ok": False,
            "error": "Target or query cannot be empty",
            "tier": "none",
            "fallback_chain": [],
        }

    # 1. WorkspaceGovernor Air-Gap Check & ESTOP Validation
    governor = WorkspaceGovernor()
    gov_mode = (getattr(WorkspaceGovernor, "active_mode", None) or getattr(WorkspaceGovernor, "_active_mode", None) or governor.get_mode() or "DEV").upper()
    active_mode = (workspace_mode or gov_mode).upper()
    is_silent = (active_mode == "SILENT" or gov_mode == "SILENT" or governor.is_silent())
    estop_active = _is_estop_engaged(db_path)

    if is_silent or estop_active:
        return {
            "ok": False,
            "blocked": True,
            "reason": "AIR_GAP_ACTIVE" if is_silent else "ESTOP_ENGAGED",
            "error": "SILENT mode or ESTOP=1 blocks external network calls",
            "message": "SILENT mode blocks external network calls" if is_silent else "ESTOP=1 emergency stop blocks external network calls",
            "target": clean_target,
            "mode": clean_mode,
            "workspace_mode": "SILENT" if is_silent else active_mode,
            "tier": "none",
            "fallback_chain": [],
        }

    # 2. ScopeGuard Target & Domain Verification
    is_url = "://" in clean_target or clean_target.startswith("www.") or "." in clean_target.split("/")[0]
    if is_url or clean_mode == "read":
        scope_guard = ScopeGuard()
        if not scope_guard.validate_target(clean_target):
            return {
                "ok": False,
                "blocked": True,
                "reason": "TARGET_DOMAIN_BLOCKED",
                "error": "TARGET_DOMAIN_BLOCKED",
                "message": f"Target '{clean_target}' is not in ScopeGuard allowed domains",
                "target": clean_target,
                "mode": clean_mode,
                "workspace_mode": active_mode,
                "tier": "none",
                "fallback_chain": [],
            }

    # 3. Check Recent SovereignStore Cache (reach_events / web_ingest_events + FTS5)
    if tier_choice == "auto":
        store = SovereignMemoryStore(db_path=Path(db_path) if db_path else None)
        cached = store.find_recent_scout_cache(clean_target, max_age_seconds=3600.0)
        if cached:
            emit_telemetry_event(
                "agent_slice",
                {
                    "agent": "SCOUT-01",
                    "action": "cascade_cache_hit",
                    "target": clean_target,
                    "tier": "cache",
                    "status": "COMPLETED",
                    "latency_ms": cached.get("latency_ms", 1.2),
                },
            )
            emit_telemetry_event(
                "circuit_pulse",
                {
                    "node": "MEMORY",
                    "active": True,
                    "detail": f"SCOUT-01 cache hit: {clean_target[:40]}",
                    "latency_ms": cached.get("latency_ms", 1.2),
                },
            )
            return cached

    fallback_chain: List[str] = []

    # =========================================================================
    # Tier 1: Agent Reach (Fast Structured Reader / Search)
    # =========================================================================
    if tier_choice in ("auto", "reach"):
        fallback_chain.append("agent_reach")
        if clean_mode == "search":
            reach_res = scout_reach_search(
                query=clean_target,
                channel="all",
                workspace_mode=active_mode,
                db_path=Path(db_path) if db_path else None,
            )
        else:
            reach_res = scout_reach_read(
                target=clean_target,
                workspace_mode=active_mode,
                db_path=Path(db_path) if db_path else None,
            )

        content_body = reach_res.get("content", "") or ""
        lower_body = content_body.lower()
        is_spa_empty = any(
            marker in lower_body
            for marker in [
                "javascript is required",
                "enable javascript",
                "javascript not enabled",
                "turn on javascript",
                '<div id="root"></div>',
                '<div id="app"></div>',
                "please enable js",
            ]
        )

        # Check if Tier 1 completed successfully with substantial content (>50 chars) and not SPA-empty
        if reach_res.get("ok") and len(content_body.strip()) > 50 and not is_spa_empty:
            return {
                "ok": True,
                "tier": "agent_reach",
                "fallback_chain": fallback_chain,
                "target": clean_target,
                "mode": clean_mode,
                "title": reach_res.get("title") or clean_target,
                "summary": reach_res.get("summary") or content_body[:350],
                "content": content_body,
                "event_id": reach_res.get("event_id"),
                "workspace_mode": active_mode,
                "latency_ms": reach_res.get("latency_ms", 0),
            }

        if tier_choice == "reach":
            return {
                "ok": False,
                "tier": "agent_reach",
                "fallback_chain": fallback_chain,
                "error": reach_res.get("error", "Agent Reach returned thin, SPA-empty, or unavailable content"),
                "target": clean_target,
                "mode": clean_mode,
                "workspace_mode": active_mode,
            }

    # =========================================================================
    # Tier 2: Obscura CDP (:9222 Headless Verification)
    # =========================================================================
    if tier_choice in ("auto", "obscura"):
        fallback_chain.append("obscura")
        t_start = time.time()
        try:
            from core.mcp.obscura_mcp_server import ensure_obscura_running
            ensure_obscura_running(cdp_url=DEFAULT_CDP_URL)
        except Exception as obs_err:
            logger.debug("Obscura CDP ensure_running note: %s", obs_err)

        session = WarmBrowserSession(cdp_url=DEFAULT_CDP_URL, engine="obscura")
        visit_res = session.visit(clean_target)
        markdown = session.extract_markdown()
        elements = session.get_elements()
        elapsed_ms = round((time.time() - t_start) * 1000.0, 2)

        # Check for authentication walls, session logins, or nested shadow-DOM interactions
        lower_md = markdown.lower()
        is_auth_walled = any(
            phrase in lower_md
            for phrase in [
                "login required",
                "please sign in",
                "sign-in required",
                "session expired",
                "authentication required",
                "sso login",
                "cloudflare turnstile",
                "turnstile verification",
                "captcha",
                "challenge-running",
            ]
        )
        is_shadow_interaction_needed = (
            any("shadow" in str(el).lower() for el in elements)
            or "<#shadow-root" in lower_md
            or "<custom-" in lower_md
            or (len(elements) == 0 and len(markdown.strip()) > 80 and ("<" in markdown or "slot" in lower_md))
        )

        if len(markdown.strip()) > 80 and not is_auth_walled and not is_shadow_interaction_needed:
            page_title = visit_res.get("page_title") or clean_target
            store = SovereignMemoryStore(db_path=Path(db_path) if db_path else None)
            ev_id = store.insert_reach_event(
                source_url=clean_target,
                title=page_title,
                content=markdown,
                channel="obscura_cdp",
                workspace_mode=active_mode,
                summary=markdown[:350],
                metadata={
                    "agent": "SCOUT-01",
                    "tier": "obscura",
                    "elements_count": len(elements),
                    "latency_ms": elapsed_ms,
                },
            )
            emit_telemetry_event(
                "agent_slice",
                {
                    "agent": "SCOUT-01",
                    "action": "cascade_obscura",
                    "target": clean_target,
                    "tier": "obscura",
                    "status": "COMPLETED",
                    "latency_ms": elapsed_ms,
                },
            )
            emit_telemetry_event(
                "circuit_pulse",
                {
                    "node": "MCP_SKILLS",
                    "active": True,
                    "detail": f"SCOUT-01 obscura: {clean_target[:40]}",
                    "latency_ms": elapsed_ms,
                },
            )
            return {
                "ok": True,
                "tier": "obscura",
                "fallback_chain": fallback_chain,
                "event_id": ev_id,
                "target": clean_target,
                "mode": clean_mode,
                "title": page_title,
                "summary": markdown[:350],
                "content": markdown,
                "elements": elements,
                "count": len(elements),
                "workspace_mode": active_mode,
                "latency_ms": elapsed_ms,
            }

        if tier_choice == "obscura":
            fail_reason = (
                "session auth required"
                if is_auth_walled
                else "nested Shadow-DOM interaction needed"
                if is_shadow_interaction_needed
                else "thin or empty content"
            )
            return {
                "ok": False,
                "tier": "obscura",
                "fallback_chain": fallback_chain,
                "error": f"Obscura CDP extraction halted ({fail_reason}); escalate to Tier 3 Chromium",
                "target": clean_target,
                "mode": clean_mode,
                "workspace_mode": active_mode,
            }

    # =========================================================================
    # Tier 3: Warm Persistent Chromium (Shadow-DOM [1..N] Distillation)
    # =========================================================================
    fallback_chain.append("chromium_persistent")
    t_start = time.time()
    session = WarmBrowserSession(cdp_url=DEFAULT_CDP_URL, engine="chromium_persistent")
    visit_res = session.visit(clean_target)

    # Event-driven DOM stability polling (10ms time slices, zero fixed sleeps)
    session.wait_for_stream_stability(quiet_ms=450, timeout_ms=30000, check_interval_ms=10)

    distilled_elements = session.distill_shadow_dom()
    markdown = session.extract_markdown()
    elapsed_ms = round((time.time() - t_start) * 1000.0, 2)

    page_title = visit_res.get("page_title") or clean_target
    content_body = (
        markdown
        if markdown.strip()
        else f"Persistent Chromium session visited {clean_target} with {len(distilled_elements)} interactive elements tagged [1..N]."
    )
    summary_body = (
        markdown[:350]
        if markdown.strip()
        else f"Shadow-DOM Distillation: {len(distilled_elements)} interactive controls mapped with data-nexus-id."
    )

    store = SovereignMemoryStore(db_path=Path(db_path) if db_path else None)
    ev_id = store.insert_reach_event(
        source_url=clean_target,
        title=page_title,
        content=content_body,
        channel="chromium_persistent",
        workspace_mode=active_mode,
        summary=summary_body,
        metadata={
            "agent": "SCOUT-01",
            "tier": "chromium_persistent",
            "distilled_elements": len(distilled_elements),
            "latency_ms": elapsed_ms,
        },
    )

    emit_telemetry_event(
        "agent_slice",
        {
            "agent": "SCOUT-01",
            "action": "cascade_chromium",
            "target": clean_target,
            "tier": "chromium_persistent",
            "elements_count": len(distilled_elements),
            "status": "COMPLETED",
            "latency_ms": elapsed_ms,
        },
    )
    emit_telemetry_event(
        "circuit_pulse",
        {
            "node": "MEMORY",
            "active": True,
            "detail": f"SCOUT-01 chromium: {clean_target[:40]}",
            "latency_ms": elapsed_ms,
        },
    )

    return {
        "ok": True,
        "tier": "chromium_persistent",
        "fallback_chain": fallback_chain,
        "event_id": ev_id,
        "target": clean_target,
        "mode": clean_mode,
        "title": page_title,
        "summary": summary_body,
        "content": content_body,
        "elements": distilled_elements,
        "count": len(distilled_elements),
        "workspace_mode": active_mode,
        "latency_ms": elapsed_ms,
    }
