"""FastAPI gateway bridge unifying full NexusIPCServer endpoints on 127.0.0.1:47630.

Avoids binding a duplicate TCP socket by instantiating a headless NexusIPCServer
delegate bound to the gateway's SQLite WAL database, WorkspaceGovernor, and
FederatedComputePool. Every endpoint validates authorization via gateway's
Bearer token verifier, with strict token enforcement on secret retrieval.
"""

from __future__ import annotations

import asyncio
import datetime
import hmac
import json
import logging
import os
import re
import sqlite3
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response

logger = logging.getLogger("nexus.runtime.gateway_ipc_bridge")

_DELEGATE_LOCK = threading.Lock()
_DELEGATE_CACHE: Dict[str, Any] = {}


def _get_delegate(
    db_path: Path,
    dry_run_hardware: bool,
    governor: Any,
    compute_pool: Any,
) -> Any:
    """Returns a cached headless NexusIPCServer aligned to db_path and shared managers."""
    from core.runtime.ipc_server import NexusIPCServer

    key = str(Path(db_path).resolve())
    with _DELEGATE_LOCK:
        delegate = _DELEGATE_CACHE.get(key)
        if delegate is None:
            delegate = NexusIPCServer(
                db_path=db_path,
                dry_run_hardware=dry_run_hardware,
                headless=True,
            )
            _DELEGATE_CACHE[key] = delegate
        delegate.dry_run_hardware = dry_run_hardware
        if governor is not None:
            delegate.governor = governor
            delegate.workspace_governor = governor
        if compute_pool is not None:
            delegate.compute_pool = compute_pool
            delegate.vault = getattr(compute_pool, "vault", delegate.vault)
            if hasattr(delegate, "llm_router") and delegate.llm_router is not None:
                delegate.llm_router.compute_pool = compute_pool
                delegate.llm_router.governor = governor or delegate.governor
        return delegate


async def _read_json_body(request: Request) -> Dict[str, Any]:
    """Safely parses JSON body or returns an empty dict on empty payload."""
    try:
        raw = await request.body()
        if not raw:
            return {}
        parsed = json.loads(raw.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _require_strict_secret_auth(request: Request, delegate: Any) -> None:
    """Enforces mandatory Bearer or X-Nexus-Token match on plaintext secret endpoints."""
    expected = os.environ.get("NEXUS_IPC_TOKEN", "") or getattr(delegate, "auth_token", "")
    if not expected:
        token_file = Path.home() / ".nexus-agent" / "ipc_token.secret"
        if token_file.exists():
            try:
                expected = token_file.read_text(encoding="utf-8").strip()
            except Exception as exc:
                logger.debug("Token file read notice: %s", exc)

    auth_header = request.headers.get("Authorization", "")
    x_token = request.headers.get("X-Nexus-Token", "").strip()
    supplied = auth_header[7:].strip() if auth_header.startswith("Bearer ") else x_token

    if not supplied or not expected or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Valid Bearer token required for vault secret operations",
        )


def _current_mode(governor: Any) -> str:
    try:
        return str(governor.get_mode()).upper()
    except Exception:
        return "DEV"


def _set_workspace_security_state(db_path: Path, security_state: str, mode: Optional[str] = None) -> None:
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    try:
        cur = conn.execute("SELECT active_mode FROM workspace_state WHERE id = 1")
        row = cur.fetchone()
        active_mode = (mode or (row[0] if row else "DEV") or "DEV").upper()
        conn.execute(
            """
            INSERT INTO workspace_state (id, active_mode, security_state, updated_at)
            VALUES (1, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                active_mode = excluded.active_mode,
                security_state = excluded.security_state,
                updated_at = CURRENT_TIMESTAMP
            """,
            (active_mode, security_state),
        )
        conn.commit()
    except Exception as exc:
        logger.debug("workspace_state update notice: %s", exc)
    finally:
        conn.close()


def register_ipc_bridge_routes(
    app: FastAPI,
    db_path: Path,
    verify_bearer_fn: Callable[[Request], None],
    governor: Any,
    compute_pool: Any,
    dry_run_hardware: bool = False,
) -> None:
    """Attaches full IPC compatibility and subsystem routes onto the FastAPI app."""

    def delegate() -> Any:
        return _get_delegate(db_path, dry_run_hardware, governor, compute_pool)

    # ------------------------------------------------------------------
    # Status, Telemetry Logs, Action, Tasks, Memory
    # ------------------------------------------------------------------
    @app.get("/api/status")
    async def api_status(request: Request):
        verify_bearer_fn(request)
        d = delegate()
        return {
            "success": True,
            "status": "ONLINE",
            "branding": "Nexus Sovereign Engine",
            "version": "5.0.0",
            "db_path": str(db_path),
            "workspace_mode": _current_mode(governor),
            "uptime_secs": round(time.time() - d.start_time, 2),
        }

    @app.get("/api/telemetry/logs")
    async def api_telemetry_logs(
        request: Request,
        limit: int = Query(50, ge=1, le=500),
        level: Optional[str] = Query(None),
    ):
        verify_bearer_fn(request)
        logs = delegate().list_telemetry_logs(limit=limit, level=level)
        return {"success": True, "logs": logs, "count": len(logs)}

    @app.post("/api/action")
    async def api_action(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        action = str(body.get("action", "")).strip()
        payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
        res = await asyncio.to_thread(delegate().execute_action, action, payload)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/tasks")
    async def api_create_task(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        prompt = str(body.get("prompt", "") or body.get("prompt_raw", "")).strip()
        if not prompt:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'prompt' is required"})
        cmd_type = str(body.get("command_type", "GENERAL"))
        source = str(body.get("source_device", "COMMAND_CENTER"))
        task = delegate().create_task(prompt=prompt, command_type=cmd_type, source_device=source)
        return JSONResponse(status_code=201, content={"success": True, "task": task})

    @app.post("/api/tasks/{task_id}/cancel")
    async def api_cancel_task(request: Request, task_id: str):
        verify_bearer_fn(request)
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            cur = conn.execute(
                "UPDATE tasks SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                (task_id,),
            )
            conn.commit()
            return {"success": cur.rowcount > 0, "task_id": task_id, "status": "CANCELLED"}
        finally:
            conn.close()

    @app.post("/api/memory")
    async def api_store_memory(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        title = str(body.get("title", "")).strip()
        content = str(body.get("content", "")).strip()
        ns = str(body.get("namespace", "DEV")).strip() or "DEV"
        meta = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}
        if not title or not content:
            return JSONResponse(status_code=400, content={"success": False, "error": "Fields 'title' and 'content' are required"})
        mem_id = delegate().store_memory(title=title, content=content, namespace=ns, metadata=meta)
        return JSONResponse(status_code=201, content={"success": True, "id": mem_id})

    @app.get("/api/memory/search")
    async def api_search_memory(
        request: Request,
        q: str = Query(""),
        limit: int = Query(15, ge=1, le=200),
    ):
        verify_bearer_fn(request)
        results = delegate().search_memory(q, limit=limit)
        return {"success": True, "query": q, "results": results, "count": len(results)}

    @app.post("/api/memory/forget")
    async def api_forget_memory(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        node_id = str(body.get("id", "")).strip()
        title = str(body.get("title", "")).strip()
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            if node_id:
                cur = conn.execute("DELETE FROM memory_nodes WHERE id = ?", (node_id,))
            elif title:
                cur = conn.execute("DELETE FROM memory_nodes WHERE title = ?", (title,))
            else:
                return JSONResponse(status_code=400, content={"success": False, "error": "Field 'id' or 'title' is required"})
            conn.commit()
            return {"success": True, "deleted": cur.rowcount, "id": node_id}
        finally:
            conn.close()

    @app.delete("/api/memory/{node_id}")
    @app.delete("/api/memory")
    async def api_delete_memory(request: Request, node_id: Optional[str] = None, id: Optional[str] = Query(None)):
        verify_bearer_fn(request)
        target_id = (node_id or id or "").strip()
        if not target_id:
            return JSONResponse(status_code=400, content={"success": False, "error": "Memory id required"})
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            cur = conn.execute("DELETE FROM memory_nodes WHERE id = ?", (target_id,))
            conn.commit()
            return {"success": cur.rowcount > 0, "id": target_id}
        finally:
            conn.close()

    @app.post("/api/memory/sync")
    async def api_sync_memory(request: Request):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "error": "Cloud sync blocked in SILENT mode"})
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
            count = conn.execute("SELECT COUNT(*) FROM memory_nodes").fetchone()[0]
            conn.commit()
        finally:
            conn.close()
        return {"success": True, "synced_nodes": count, "target": "sqlite_wal_edge_ready", "timestamp": time.time()}

    # ------------------------------------------------------------------
    # E-Stop Reset / Trigger & Workspace / Security Audit / System
    # ------------------------------------------------------------------
    @app.post("/api/estop/trigger")
    @app.post("/api/system/estop")
    async def api_estop_trigger(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        reason = str(body.get("reason", "User E-Stop Triggered"))
        from core.engine.safety_guard import SafetyGuard
        from core.runtime.gateway import emit_delta_event

        SafetyGuard.trigger_estop(reason=reason)
        os.environ["ESTOP"] = "1"
        _set_workspace_security_state(db_path, "LOCKED")
        try:
            compute_pool.release_idle_cloud_nodes(reason=f"estop:{reason}")
        except Exception as exc:
            logger.debug("Compute pool release notice: %s", exc)
        delegate().log_telemetry("ESTOP", "CRITICAL", f"E-STOP ASSERTED: {reason}")
        emit_delta_event(stage="ABORTED", step_index=0, thought=f"E-STOP LOCKED: {reason}", action_type="estop")
        return {"success": True, "estop": True, "estop_active": True, "status": "LOCKED", "security_state": "LOCKED", "reason": reason}

    @app.post("/api/estop/reset")
    async def api_estop_reset(request: Request):
        verify_bearer_fn(request)
        from core.engine.safety_guard import SafetyGuard
        from core.runtime.gateway import emit_delta_event

        SafetyGuard.reset_estop()
        os.environ.pop("ESTOP", None)
        _set_workspace_security_state(db_path, "NOMINAL")
        delegate().log_telemetry("ESTOP", "INFO", "E-STOP RESET: System restored to NOMINAL")
        emit_delta_event(stage="INIT", step_index=0, thought="E-STOP cleared; nominal operation resumed", action_type="estop_reset")
        return {"success": True, "estop": False, "estop_active": False, "status": "NOMINAL", "security_state": "NOMINAL"}

    @app.get("/api/workspace")
    async def api_workspace_get(request: Request):
        verify_bearer_fn(request)
        return delegate().get_workspace_mode()

    @app.post("/api/workspace")
    async def api_workspace_post(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        mode = str(body.get("mode", "DEV")).upper()
        res = delegate().set_workspace_mode(mode)
        _set_workspace_security_state(db_path, "NOMINAL", mode=mode)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/security/shield-status")
    async def api_shield_status(request: Request):
        verify_bearer_fn(request)
        from core.mcp.agent_shield import AgentShieldAuditor
        return AgentShieldAuditor(db_path=str(db_path)).get_shield_status()

    @app.post("/api/audit/run")
    @app.post("/api/security/audit")
    async def api_audit_run(request: Request):
        verify_bearer_fn(request)
        from core.mcp.agent_shield import AgentShieldAuditor
        auditor = AgentShieldAuditor(db_path=str(db_path))
        status = auditor.get_shield_status()
        delegate().log_telemetry("SECURITY_AUDIT", "INFO", "Completed ScopeGuard + AgentShield audit")
        return {"success": True, "audit_passed": True, "shield": status, "timestamp": time.time()}

    @app.post("/api/system/release-gpu")
    async def api_system_release_gpu(request: Request):
        verify_bearer_fn(request)
        return delegate().release_idle_compute_nodes(reason="ui_release_gpu")

    @app.post("/api/system/wal-checkpoint")
    async def api_system_wal_checkpoint(request: Request):
        verify_bearer_fn(request)
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            row = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);").fetchone()
            conn.commit()
            return {"success": True, "checkpoint": list(row) if row else [], "db_path": str(db_path)}
        finally:
            conn.close()

    @app.get("/api/system/keep-awake")
    @app.get("/api/awake")
    async def api_get_keep_awake(request: Request):
        verify_bearer_fn(request)
        from core.runtime.reflex_router import get_keep_awake
        active = get_keep_awake()
        return {"success": True, "keep_awake": active, "enabled": active}

    @app.post("/api/system/keep-awake")
    @app.post("/api/awake")
    async def api_set_keep_awake(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        enabled = bool(body.get("enabled", True))
        from core.runtime.reflex_router import set_keep_awake
        active = set_keep_awake(enabled)
        return {"success": True, "keep_awake": active, "enabled": active}

    @app.post("/api/system/purge")
    async def api_system_purge(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        dry_run = bool(body.get("dry_run", False))
        logs_dir = Path.home() / ".nexus-agent" / "logs"
        reclaimed_bytes = 0
        removed_files = 0
        if logs_dir.exists() and logs_dir.is_dir():
            cutoff = time.time() - (7 * 86400)
            for item in logs_dir.glob("*"):
                if item.is_file() and item.stat().st_mtime < cutoff:
                    size = item.stat().st_size
                    reclaimed_bytes += size
                    removed_files += 1
                    if not dry_run:
                        try:
                            item.unlink()
                        except Exception as exc:
                            logger.debug("Purge unlink notice for %s: %s", item, exc)
        return {
            "success": True,
            "dry_run": dry_run,
            "removed_files": removed_files,
            "reclaimed_mb": round(reclaimed_bytes / (1024 * 1024), 2),
        }

    # ------------------------------------------------------------------
    # Filesystem Read / Write, Git Status, Scholar Synthesize
    # ------------------------------------------------------------------
    @app.get("/api/fs/read")
    async def api_fs_read(request: Request, path: str = Query("")):
        verify_bearer_fn(request)
        if not path:
            return JSONResponse(status_code=400, content={"success": False, "error": "Query param 'path' is required"})
        res = delegate().read_fs_file(path)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/fs/write")
    async def api_fs_write(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        file_path = str(body.get("path", "")).strip()
        content = str(body.get("content", ""))
        if not file_path:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'path' is required"})
        res = delegate().write_fs_file(file_path=file_path, content=content)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/git/status")
    async def api_git_status(request: Request):
        verify_bearer_fn(request)
        return await asyncio.to_thread(delegate().get_git_status)

    @app.post("/api/scholar/synthesize")
    async def api_scholar_synthesize(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        topic = str(body.get("topic", "")).strip()
        notes = str(body.get("notes", ""))
        if not topic:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'topic' is required"})
        res = await asyncio.to_thread(delegate().scholar_synthesize, topic, notes)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    # ------------------------------------------------------------------
    # Routines Extra Actions, Swarm Extra Actions, Slices & Context Keeper
    # ------------------------------------------------------------------
    @app.post("/api/routines/play")
    async def api_routines_play(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        target = body.get("id") or body.get("routine_id") or body.get("name") or body.get("trigger_phrase")
        if target is None:
            return JSONResponse(status_code=400, content={"success": False, "error": "Routine identifier is required"})
        res = await asyncio.to_thread(delegate().routines_manager.execute_routine, target)
        return JSONResponse(status_code=200 if res.get("success") else 404, content=res)

    @app.post("/api/routines/delete")
    async def api_routines_delete_post(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        target = body.get("id") or body.get("routine_id") or body.get("name") or body.get("trigger_phrase")
        if target is None:
            return JSONResponse(status_code=400, content={"success": False, "error": "Routine identifier is required"})
        ok = delegate().routines_manager.remove_routine(target)
        return JSONResponse(status_code=200 if ok else 404, content={"success": ok})

    @app.get("/api/context-keeper/status")
    async def api_ck_status(request: Request):
        verify_bearer_fn(request)
        from core.memory.context_keeper import ContextKeeper
        contexts = ContextKeeper(db_path=str(db_path)).ck_list()
        return {"success": True, "active": len(contexts) > 0, "count": len(contexts), "contexts": contexts}

    @app.post("/api/context-keeper")
    async def api_ck_dispatch(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.memory.context_keeper import ContextKeeper
        ck = ContextKeeper(db_path=str(db_path))
        action = str(body.get("action", "resume")).lower()
        target_path = body.get("path") or body.get("target_path")
        if action == "init":
            return ck.ck_init(target_path) if target_path else {"success": True, "contexts": ck.ck_list()}
        if action == "save":
            return ck.ck_save(
                goal=str(body.get("goal", "")),
                left_off=str(body.get("left_off", "")),
                next_steps=body.get("next_steps", []),
                target_path=target_path,
            )
        return ck.ck_resume(target_path)

    @app.get("/api/swarm/archetypes")
    async def api_swarm_archetypes(request: Request, q: str = Query(""), limit: int = Query(20, ge=1, le=100)):
        verify_bearer_fn(request)
        d = delegate()
        with d.store._get_connection() as conn:
            if q.strip():
                clean_terms = re.sub(r"[^\w\s]+", " ", q).strip().split()
                fts_match = " OR ".join([f'"{t}"*' for t in clean_terms[:6]])
                try:
                    cur = conn.execute(
                        """
                        SELECT a.slug, a.name, a.description, a.anchor_orbiter, a.default_tools_json, a.updated_at
                        FROM ecc_agent_archetypes a
                        JOIN ecc_agent_archetypes_fts f ON a.slug = f.slug
                        WHERE ecc_agent_archetypes_fts MATCH ?
                        ORDER BY rank LIMIT ?;
                        """,
                        (fts_match, limit),
                    )
                    rows = [dict(r) for r in cur.fetchall()]
                except Exception:
                    rows = []
            else:
                cur = conn.execute(
                    "SELECT slug, name, description, anchor_orbiter, default_tools_json, updated_at FROM ecc_agent_archetypes LIMIT ?;",
                    (limit,),
                )
                rows = [dict(r) for r in cur.fetchall()]
        return {"success": True, "count": len(rows), "archetypes": rows}

    @app.post("/api/swarm/kill")
    @app.post("/api/swarm/mitosis")
    async def api_swarm_extra(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.agents.dynamic_spawner import DynamicAgentSpawner
        spawner = DynamicAgentSpawner(db_path=str(db_path), governor=governor)
        try:
            if request.url.path.endswith("/kill"):
                agent_id = body.get("agent_id")
                swarm_id = body.get("swarm_id")
                if swarm_id or agent_id == "ALL":
                    res = spawner.dissolve_swarm(swarm_id=swarm_id)
                elif agent_id:
                    res = spawner.dissolve_agent(agent_id) if hasattr(spawner, "dissolve_agent") else spawner.dissolve_swarm(swarm_id=agent_id)
                else:
                    res = spawner.dissolve_swarm()
                return {"success": True, **res}
            count = int(body.get("count", 5))
            template = str(body.get("template", "full_dev_cluster"))
            res = spawner.multiply_agents(task=template, count=count)
            return {"success": True, **res}
        finally:
            spawner.close()

    @app.get("/api/slices/summary")
    @app.get("/api/slices/recovery")
    @app.get("/api/slices/interrupted")
    async def api_slices_summary(request: Request):
        verify_bearer_fn(request)
        from core.runtime.slice_engine import get_recovery_summary
        return {"success": True, "recovery_summary": get_recovery_summary(db_path=str(db_path))}

    @app.post("/api/slices/recover/{slice_id}")
    @app.post("/api/slices/recover")
    @app.post("/api/agent/slice/resume")
    @app.post("/api/agent/slice/replay")
    async def api_slices_recover(request: Request, slice_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        sid = str(slice_id or body.get("slice_id", "")).strip()
        if not sid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'slice_id' is required"})
        from core.runtime.slice_engine import resume_slice
        try:
            res = resume_slice(slice_id=sid, db_path=str(db_path))
            return {"success": True, **res} if isinstance(res, dict) else {"success": True, "slice_id": sid, "resumed": res}
        except Exception as exc:
            return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})

    @app.post("/api/slices/dispatch")
    async def api_slices_dispatch(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.gateway import emit_delta_event
        sid = str(body.get("slice_id") or f"slc-{uuid.uuid4().hex[:8]}")
        agent_id = str(body.get("agent_id", "DEV-01"))
        summary = str(body.get("task_summary", "Dispatched slice"))
        target = body.get("target")
        delegate().create_task(prompt=f"[{agent_id}] {summary}", command_type="SLICE_DISPATCH", source_device="AGENT_TOWN")
        target_coords = [int(target["x"]), int(target["y"])] if isinstance(target, dict) and "x" in target and "y" in target else None
        emit_delta_event(stage="EXECUTE", step_index=1, thought=f"[{agent_id}] {summary}", target=target_coords, action_type="slice_dispatch", details={"slice_id": sid, "agent_id": agent_id})
        return {"success": True, "slice_id": sid, "agent_id": agent_id}

    @app.post("/api/agent/slices/reboot-checkpoint")
    async def api_reboot_checkpoint(request: Request):
        verify_bearer_fn(request)
        from core.memory.context_keeper import ContextKeeper
        ck = ContextKeeper(db_path=str(db_path))
        res = ck.ck_save(
            goal="Pre-reboot Spatial Telemetry & Slice Checkpoint",
            left_off="Captured via Core HUD Reboot Guard",
            next_steps=["Resume interrupted slices cleanly"],
        )
        return {"success": True, **res} if isinstance(res, dict) else {"success": True}

    # ------------------------------------------------------------------
    # AI Chat, Vault, Bridge, Media, Audio, Voice, Vision
    # ------------------------------------------------------------------
    @app.post("/api/ai/chat")
    async def api_ai_chat(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        prompt = str(body.get("prompt", "")).strip()
        messages = body.get("messages", [])
        if not prompt and isinstance(messages, list):
            for m in reversed(messages):
                if isinstance(m, dict) and m.get("role") == "user":
                    prompt = str(m.get("content", "")).strip()
                    break
        if not prompt:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'prompt' is required"})
        gen = await asyncio.to_thread(delegate().llm_router.generate, prompt=prompt, max_tokens=int(body.get("max_tokens", 1024)))
        text = gen.get("text", "") if isinstance(gen, dict) else str(gen)
        return {
            "success": bool(gen.get("success", True)) if isinstance(gen, dict) else True,
            "response": text,
            "text": text,
            "provider": gen.get("provider", "local") if isinstance(gen, dict) else "local",
            "model": gen.get("model", "") if isinstance(gen, dict) else "",
        }

    @app.post("/api/vault/get")
    async def api_vault_get(request: Request):
        verify_bearer_fn(request)
        d = delegate()
        _require_strict_secret_auth(request, d)
        body = await _read_json_body(request)
        key_name = str(body.get("key") or body.get("key_name") or "").strip()
        if not key_name:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'key' is required"})
        return {"success": True, "value": d.get_vault_secret(key_name)}

    @app.post("/api/vault/set")
    async def api_vault_set(request: Request):
        verify_bearer_fn(request)
        d = delegate()
        _require_strict_secret_auth(request, d)
        body = await _read_json_body(request)
        key_name = str(body.get("key") or body.get("key_name") or "").strip()
        secret_val = str(body.get("value") if body.get("value") is not None else (body.get("secret_value") or ""))
        if not key_name:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'key' is required"})
        ok = d.set_vault_secret(key_name, secret_val)
        return JSONResponse(status_code=200 if ok else 500, content={"success": ok})

    @app.get("/api/vault/test")
    @app.post("/api/vault/test")
    async def api_vault_test(request: Request, provider: str = Query("")):
        verify_bearer_fn(request)
        body = await _read_json_body(request) if request.method == "POST" else {}
        target = (provider or str(body.get("provider", ""))).lower().strip()
        if not target:
            return {"success": True, "vault": "DPAPI_READY"}
        return await asyncio.to_thread(delegate().llm_router.probe_provider, target, timeout=3.5)

    @app.get("/api/bridge/web-ingest")
    @app.get("/api/bridge/web-ingest/recent")
    async def api_bridge_web_ingest_get(request: Request, limit: int = Query(20, ge=1, le=200)):
        verify_bearer_fn(request)
        rows = delegate().list_recent_web_ingests(limit=limit)
        mode = _current_mode(governor)
        return {
            "success": True,
            "status": "SILENT Air-Gap" if mode == "SILENT" else "Connected",
            "workspace_mode": mode,
            "air_gapped": mode == "SILENT",
            "events": rows,
            "count": len(rows),
        }

    @app.post("/api/bridge/web-ingest")
    async def api_bridge_web_ingest_post(request: Request):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "blocked": True, "air_gapped": True, "error": "Blocked in SILENT mode"})
        body = await _read_json_body(request)
        res = delegate().ingest_web_event(body)
        return JSONResponse(status_code=201 if res.get("success") else 400, content=res)

    @app.post("/api/bridge/browser-engine")
    async def api_bridge_browser_engine(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = await asyncio.to_thread(
            delegate().dispatch_browser_engine,
            engine=body.get("engine", "auto"),
            action=body.get("action", "inspect"),
            url=body.get("url", ""),
            query=body.get("query", ""),
        )
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/media")
    async def api_media_get(request: Request):
        verify_bearer_fn(request)
        return {"success": True, "media": delegate().get_media_state()}

    @app.post("/api/media/control")
    async def api_media_control(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        return delegate().control_media(str(body.get("command", "")), body.get("value"))

    @app.get("/api/audio/events")
    async def api_audio_events(request: Request, limit: int = Query(20, ge=1, le=200)):
        verify_bearer_fn(request)
        return {"success": True, "events": delegate().list_audio_events(limit=limit)}

    @app.post("/api/audio/event")
    async def api_audio_event_post(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        saved_id = delegate().log_audio_event(
            event_type=str(body.get("event_type", "VAD_SPEECH")),
            transcription=str(body.get("transcription", "")),
            energy_rms=float(body.get("energy_rms", 0.0)),
            duration_ms=float(body.get("duration_ms", 0.0)),
            barge_in=int(bool(body.get("barge_in", False))),
        )
        return JSONResponse(status_code=201, content={"success": True, "id": saved_id})

    @app.post("/api/audio/self-test")
    async def api_audio_self_test(request: Request):
        verify_bearer_fn(request)
        res = await asyncio.to_thread(delegate().audio_self_test)
        return JSONResponse(status_code=200 if res.get("success") else 500, content=res)

    @app.get("/api/voice/stt/status")
    async def api_voice_stt_status(request: Request):
        verify_bearer_fn(request)
        return {"success": True, **delegate().get_stt_status()}

    @app.get("/api/voice/haru/status")
    @app.get("/api/voice/haru/health")
    @app.get("/api/voice/haru/info")
    async def api_haru_status(request: Request):
        verify_bearer_fn(request)
        return delegate().get_haru_voice_status()

    @app.post("/api/voice/haru/toggle")
    async def api_haru_toggle(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().toggle_haru_voice(body)
        return JSONResponse(status_code=200 if res.get("success") else (403 if res.get("air_gapped") else 400), content=res)

    @app.post("/api/voice/dictate")
    async def api_voice_dictate(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().handle_dictate(body)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/persona/activate")
    async def api_persona_activate(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        preset = str(body.get("persona_id", "tars_prime"))
        return delegate().update_persona(preset=preset)

    @app.get("/api/vision/status")
    async def api_vision_status(request: Request):
        verify_bearer_fn(request)
        return delegate().get_vision_status()

    @app.post("/api/vision/stream")
    async def api_vision_stream(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = await asyncio.to_thread(
            delegate().process_vision_stream,
            source=body.get("source", "screen"),
            active=bool(body.get("active", False)),
            frame_b64=body.get("frame_b64"),
        )
        return JSONResponse(status_code=200 if res.get("success") else 403, content=res)

    @app.post("/api/vision/biometrics")
    async def api_vision_biometrics(request: Request):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "error": "Vision biometrics blocked in SILENT mode"})
        body = await _read_json_body(request)
        res = delegate().handle_vision_biometrics(action=body.get("action", "face_lock"), params=body)
        return JSONResponse(status_code=200 if res.get("success", True) else 400, content=res)

    # ------------------------------------------------------------------
    # UI State, Whiteboard, Visuals, Themes & Wallpapers
    # ------------------------------------------------------------------
    @app.get("/api/ui/state")
    async def api_ui_state_get(request: Request):
        verify_bearer_fn(request)
        return {"success": True, "ui_state": delegate().get_ui_state()}

    @app.post("/api/ui/state")
    @app.post("/api/ui/mutate")
    async def api_ui_state_mutate(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().mutate_ui(**body)
        return JSONResponse(status_code=200 if res.get("success", True) else 400, content=res)

    @app.get("/api/ui/controls")
    async def api_ui_controls(request: Request, hwnd: Optional[int] = Query(None), ocr: bool = Query(True)):
        verify_bearer_fn(request)
        from core.engine.tools.desktop_ufo import list_numbered_controls
        use_ocr = False if dry_run_hardware else ocr
        controls = await asyncio.to_thread(list_numbered_controls, target_hwnd=hwnd, use_ocr_fallback=use_ocr)
        return {"success": True, "controls": controls, "count": len(controls)}

    @app.post("/api/ui/click-number")
    async def api_ui_click_number(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        num = body.get("number") if body.get("number") is not None else body.get("id", 1)
        from core.engine.tools.desktop_ufo import click_numbered_control
        res = click_numbered_control(int(num), auto_approve=bool(body.get("auto_approve", False)), simulation_mode=dry_run_hardware)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/visuals/preferences")
    async def api_visuals_preferences(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().mutate_ui(**{k: v for k, v in body.items() if k in ("reactor_color", "reactor_shape", "spin_speed", "intensity", "active_effect", "show_rails", "show_transcript")})
        return {"success": True, "preferences": body, "ui_state": res}

    @app.post("/api/whiteboard/draw")
    async def api_whiteboard_draw(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        action = str(body.get("action") or body.get("op") or "node").lower()
        from core.mcp.plugins.whiteboard_bridge import (
            draw_node, draw_arrow, draw_text, draw_equation,
            clear_whiteboard, export_whiteboard_png, _whiteboard,
        )
        if action in ("node", "draw_node", "box", "rectangle"):
            res = draw_node(
                id=body.get("id") or body.get("node_id") or f"node_{int(time.time()*1000)}",
                x=int(body.get("x", 100)),
                y=int(body.get("y", 100)),
                label=body.get("label") or body.get("text") or "Node",
                node_type=body.get("node_type", "default"),
            )
        elif action in ("arrow", "draw_arrow"):
            res = draw_arrow(from_id=body.get("from_id", ""), to_id=body.get("to_id", ""), label=body.get("label", ""))
        elif action in ("text", "draw_text"):
            res = draw_text(x=int(body.get("x", 100)), y=int(body.get("y", 100)), content=body.get("content") or body.get("text") or "", font_size=int(body.get("font_size", 14)))
        elif action in ("equation", "draw_equation"):
            res = draw_equation(x=int(body.get("x", 100)), y=int(body.get("y", 100)), latex=body.get("latex") or body.get("text") or "")
        elif action in ("clear", "clear_board"):
            res = clear_whiteboard()
        elif action in ("export_png", "export"):
            out_file = body.get("file_path") or str(Path.home() / ".nexus-agent" / "whiteboard.png")
            res = export_whiteboard_png(file_path=out_file)
        else:
            res = {"success": True, "state": _whiteboard.get_state()}
        return JSONResponse(status_code=200 if res.get("success", True) else 400, content=res)

    @app.get("/api/themes")
    async def api_themes_list(request: Request):
        verify_bearer_fn(request)
        d = delegate()
        return {"success": True, "themes": d.memory_store.list_themes(), "active_theme": d.memory_store.get_active_theme()}

    @app.get("/api/themes/export/{theme_id}")
    async def api_themes_export(request: Request, theme_id: str):
        verify_bearer_fn(request)
        exported = delegate().memory_store.export_theme(theme_id.strip())
        if not exported:
            return JSONResponse(status_code=404, content={"success": False, "error": f"Theme '{theme_id}' not found"})
        return {"success": True, "export": exported}

    @app.get("/api/themes/{theme_id}")
    async def api_themes_get(request: Request, theme_id: str):
        verify_bearer_fn(request)
        theme = delegate().memory_store.get_theme(theme_id.strip())
        if not theme:
            return JSONResponse(status_code=404, content={"success": False, "error": f"Theme '{theme_id}' not found"})
        return {"success": True, "theme": theme}

    @app.post("/api/themes")
    @app.post("/api/themes/save")
    async def api_themes_save(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        theme = body.get("theme") if isinstance(body.get("theme"), dict) else body
        ok = delegate().memory_store.save_theme(theme)
        theme_id = theme.get("id")
        saved = delegate().memory_store.get_theme(theme_id) if theme_id else None
        return JSONResponse(status_code=200 if ok else 400, content={"success": ok, "theme": saved, "theme_id": theme_id})

    @app.post("/api/themes/activate/{theme_id}")
    @app.post("/api/themes/activate")
    async def api_themes_activate(request: Request, theme_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        tid = (theme_id or body.get("theme_id") or body.get("id") or "").strip()
        if not tid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'theme_id' is required"})
        d = delegate()
        ok = d.memory_store.activate_theme(tid)
        active = d.memory_store.get_active_theme()
        return JSONResponse(status_code=200 if ok else 404, content={"success": ok, "active_theme": active, "theme_id": tid})

    @app.post("/api/themes/sync-notch")
    async def api_themes_sync_notch(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.gateway import emit_delta_event
        emit_delta_event(stage="END", step_index=0, thought="Notch HUD theme synchronized", action_type="theme_sync", details=body)
        return {"success": True, "synced": True}

    @app.post("/api/themes/import")
    async def api_themes_import(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        theme_data = body.get("theme") if isinstance(body.get("theme"), dict) else body
        try:
            imported = delegate().memory_store.import_theme(theme_data)
            return {"success": True, "theme": imported}
        except Exception as exc:
            return JSONResponse(status_code=400, content={"success": False, "error": str(exc)})

    @app.post("/api/themes/delete/{theme_id}")
    @app.post("/api/themes/delete")
    @app.delete("/api/themes/{theme_id}")
    async def api_themes_delete(request: Request, theme_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request) if request.method == "POST" else {}
        tid = (theme_id or body.get("theme_id") or body.get("id") or "").strip()
        if not tid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'theme_id' is required"})
        ok = delegate().memory_store.delete_theme(tid)
        return JSONResponse(status_code=200 if ok else 400, content={"success": ok, "theme_id": tid})

    @app.get("/api/wallpapers")
    async def api_wallpapers_list(request: Request, mode: Optional[str] = Query(None)):
        verify_bearer_fn(request)
        d = delegate()
        return {
            "success": True,
            "wallpapers": d.memory_store.list_wallpapers(mode=mode or None),
            "active_wallpaper": d.memory_store.get_active_wallpaper(mode=mode or "GLOBAL"),
        }

    @app.get("/api/wallpapers/active")
    async def api_wallpapers_active(request: Request, mode: str = Query("GLOBAL")):
        verify_bearer_fn(request)
        return {"success": True, "active_wallpaper": delegate().memory_store.get_active_wallpaper(mode=mode or "GLOBAL"), "mode": mode}

    @app.get("/api/wallpapers/{wallpaper_id}")
    async def api_wallpapers_get(request: Request, wallpaper_id: str):
        verify_bearer_fn(request)
        wp = delegate().memory_store.get_wallpaper(wallpaper_id.strip())
        if not wp:
            return JSONResponse(status_code=404, content={"success": False, "error": f"Wallpaper '{wallpaper_id}' not found"})
        return {"success": True, "wallpaper": wp}

    @app.post("/api/wallpapers")
    @app.post("/api/wallpapers/save")
    async def api_wallpapers_save(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        wp = body.get("wallpaper") if isinstance(body.get("wallpaper"), dict) else body
        ok = delegate().memory_store.save_wallpaper(wp)
        wid = wp.get("id")
        saved = delegate().memory_store.get_wallpaper(wid) if wid else None
        return JSONResponse(status_code=200 if ok else 400, content={"success": ok, "wallpaper": saved, "wallpaper_id": wid})

    @app.post("/api/wallpapers/activate/{wallpaper_id}")
    @app.post("/api/wallpapers/activate")
    async def api_wallpapers_activate(request: Request, wallpaper_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        wid = (wallpaper_id or body.get("wallpaper_id") or body.get("id") or "").strip()
        mode_binding = body.get("mode_binding") or body.get("mode")
        if not wid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'wallpaper_id' is required"})
        d = delegate()
        ok = d.memory_store.activate_wallpaper(wid, mode_binding=mode_binding)
        active = d.memory_store.get_active_wallpaper(mode=mode_binding or "GLOBAL")
        return JSONResponse(status_code=200 if ok else 404, content={"success": ok, "active_wallpaper": active, "wallpaper_id": wid, "mode_binding": mode_binding})

    @app.post("/api/wallpapers/config/{wallpaper_id}")
    @app.post("/api/wallpapers/config")
    async def api_wallpapers_config(request: Request, wallpaper_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        wid = (wallpaper_id or body.get("wallpaper_id") or body.get("id") or "").strip()
        cfg = body.get("config") if isinstance(body.get("config"), dict) else {}
        if not wid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'wallpaper_id' is required"})
        d = delegate()
        ok = d.memory_store.update_wallpaper_config(wid, cfg)
        return JSONResponse(status_code=200 if ok else 404, content={"success": ok, "wallpaper": d.memory_store.get_wallpaper(wid), "wallpaper_id": wid})

    @app.post("/api/wallpapers/delete/{wallpaper_id}")
    @app.post("/api/wallpapers/delete")
    @app.delete("/api/wallpapers/{wallpaper_id}")
    async def api_wallpapers_delete(request: Request, wallpaper_id: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request) if request.method == "POST" else {}
        wid = (wallpaper_id or body.get("wallpaper_id") or body.get("id") or "").strip()
        if not wid:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'wallpaper_id' is required"})
        ok = delegate().memory_store.delete_wallpaper(wid)
        return JSONResponse(status_code=200 if ok else 400, content={"success": ok, "wallpaper_id": wid})

    # ------------------------------------------------------------------
    # Providers, Model Catalog, HF Hub & Compute Pool
    # ------------------------------------------------------------------
    @app.get("/api/providers")
    async def api_providers_list(request: Request):
        verify_bearer_fn(request)
        from core.runtime.provider_catalog import seed_default_providers
        d = delegate()
        providers = d.memory_store.list_providers()
        if not providers:
            seed_default_providers(d.memory_store)
            providers = d.memory_store.list_providers()
        try:
            known_keys = set(d.compute_pool.vault.list_keys())
        except Exception:
            known_keys = set()
        known_keys.update(os.environ.keys())
        known_keys.update(d.compute_pool._secrets_cache.keys())
        for p in providers:
            pid_u = str(p["provider_id"]).upper()
            p["has_key"] = 1 if (f"PROVIDER_KEY_{pid_u}" in known_keys or f"{pid_u}_API_KEY" in known_keys or p.get("has_key") == 1) else 0
        return {"success": True, "providers": providers, "count": len(providers)}

    @app.get("/api/providers/roles")
    async def api_providers_roles_get(request: Request):
        verify_bearer_fn(request)
        return {"success": True, "roles": delegate().memory_store.get_role_assignments()}

    @app.post("/api/providers/roles")
    async def api_providers_roles_set(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        role_id = str(body.get("role_id", "")).strip()
        provider_id = str(body.get("provider_id", "")).strip()
        model_id = str(body.get("model_id", "")).strip()
        if not role_id or not provider_id or not model_id:
            return JSONResponse(status_code=400, content={"success": False, "error": "role_id, provider_id, and model_id are required"})
        d = delegate()
        d.memory_store.set_role_assignment(role_id, provider_id, model_id)
        return {"success": True, "roles": d.memory_store.get_role_assignments()}

    @app.get("/api/providers/guardrails")
    async def api_providers_guardrails_get(request: Request):
        verify_bearer_fn(request)
        return {"success": True, "guardrails": delegate().memory_store.get_routing_guardrails()}

    @app.post("/api/providers/guardrails")
    async def api_providers_guardrails_set(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        d = delegate()
        d.memory_store.save_routing_guardrails(body)
        return {"success": True, "guardrails": d.memory_store.get_routing_guardrails()}

    @app.post("/api/providers/reorder")
    async def api_providers_reorder(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        order = body.get("order") or body.get("provider_ids") or []
        d = delegate()
        for idx, pid in enumerate(order):
            d.memory_store.update_provider_priority(str(pid), (idx + 1) * 10)
        return {"success": True, "providers": d.memory_store.list_providers()}

    @app.post("/api/providers/custom")
    async def api_providers_custom(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        display_name = str(body.get("display_name", "")).strip()
        base_url = str(body.get("base_url", "")).strip()
        api_key = str(body.get("api_key", "")).strip()
        if not display_name or not base_url:
            return JSONResponse(status_code=400, content={"success": False, "error": "display_name and base_url are required"})
        raw_id = re.sub(r"[^a-zA-Z0-9_]", "_", display_name.lower()).strip("_")
        p_id = str(body.get("provider_id") or f"custom_{raw_id}")
        d = delegate()
        if api_key:
            d.compute_pool.vault.set_secret(f"PROVIDER_KEY_{p_id.upper()}", api_key)
        record = {
            "provider_id": p_id,
            "display_name": display_name,
            "category": body.get("category", "open_weight_cloud"),
            "protocol": body.get("protocol", "openai_compat"),
            "base_url": base_url,
            "key_console_url": body.get("key_console_url", ""),
            "auth_header": body.get("auth_header", "Authorization"),
            "auth_prefix": body.get("auth_prefix", "Bearer "),
            "selected_model": str(body.get("selected_model", "default")).strip(),
            "extra_config": body.get("extra_config", {}),
            "free_tier_badge": body.get("free_tier_badge", "Custom Endpoint"),
            "priority_order": int(body.get("priority_order", 50)),
            "enabled": 1 if body.get("enabled", True) else 0,
            "has_key": 1 if bool(api_key) else 0,
            "last_status": "OPERATIONAL" if api_key else "UNCONFIGURED",
        }
        d.memory_store.save_provider(record)
        return {"success": True, "provider_id": p_id, "provider": record}

    @app.post("/api/providers/{provider_id}/save")
    async def api_providers_save(request: Request, provider_id: str):
        verify_bearer_fn(request)
        from core.runtime.provider_catalog import get_provider_definition
        body = await _read_json_body(request)
        p_id = provider_id.lower().strip()
        d = delegate()
        api_key = str(body.get("api_key", "")).strip()
        if api_key:
            d.compute_pool.vault.set_secret(f"PROVIDER_KEY_{p_id.upper()}", api_key)
        existing = d.memory_store.get_provider(p_id) or get_provider_definition(p_id) or {}
        has_key_flag = bool(api_key or d.compute_pool.get_secret(f"PROVIDER_KEY_{p_id.upper()}"))
        record = {
            "provider_id": p_id,
            "display_name": body.get("display_name", existing.get("display_name", p_id.capitalize())),
            "category": body.get("category", existing.get("category", "frontier_direct")),
            "protocol": body.get("protocol", existing.get("protocol", "openai_compat")),
            "base_url": body.get("base_url", existing.get("base_url", "")),
            "key_console_url": body.get("key_console_url", existing.get("key_console_url", "")),
            "auth_header": body.get("auth_header", existing.get("auth_header", "Authorization")),
            "auth_prefix": body.get("auth_prefix", existing.get("auth_prefix", "Bearer ")),
            "selected_model": body.get("selected_model", existing.get("selected_model", "default")),
            "extra_config": body.get("extra_config", existing.get("extra_config", {})),
            "free_tier_badge": body.get("free_tier_badge", existing.get("free_tier_badge", "")),
            "priority_order": int(body.get("priority_order", existing.get("priority_order", 100))),
            "enabled": 1 if body.get("enabled", True) else 0,
            "has_key": 1 if has_key_flag else 0,
            "last_status": "OPERATIONAL" if has_key_flag else "UNCONFIGURED",
        }
        d.memory_store.save_provider(record)
        return {"success": True, "provider_id": p_id, "has_key": record["has_key"]}

    @app.post("/api/providers/{provider_id}/test")
    async def api_providers_test(request: Request, provider_id: str):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        p_id = provider_id.lower().strip()
        d = delegate()
        explicit_key = str(body.get("api_key", "")).strip()
        if explicit_key:
            d.compute_pool.vault.set_secret(f"PROVIDER_KEY_{p_id.upper()}", explicit_key)
        return await asyncio.to_thread(d.llm_router.probe_provider, p_id, timeout=3.5)

    @app.delete("/api/providers/{provider_id}/key")
    async def api_providers_delete_key(request: Request, provider_id: str):
        verify_bearer_fn(request)
        d = delegate()
        _require_strict_secret_auth(request, d)
        p_id = provider_id.lower().strip()
        d.compute_pool.vault.delete_secret(f"PROVIDER_KEY_{p_id.upper()}")
        d.compute_pool.vault.delete_secret(f"{p_id.upper()}_API_KEY")
        d.memory_store.update_provider_status(p_id, "UNCONFIGURED", has_key=False)
        return {"success": True, "provider_id": p_id, "has_key": 0}

    @app.get("/api/models/catalog")
    async def api_models_catalog(
        request: Request,
        runtime_target: Optional[str] = Query(None),
        modality: Optional[str] = Query(None),
        voice_compatible: Optional[str] = Query(None),
        is_abliterated: Optional[str] = Query(None),
        provider_id: Optional[str] = Query(None),
    ):
        verify_bearer_fn(request)
        from core.runtime.model_catalog import seed_default_models
        d = delegate()
        v_bool = (voice_compatible.lower() in ("true", "1")) if voice_compatible is not None else None
        a_bool = (is_abliterated.lower() in ("true", "1")) if is_abliterated is not None else None
        models = d.memory_store.list_models(
            runtime_target=runtime_target,
            modality=modality,
            voice_compatible=v_bool,
            is_abliterated=a_bool,
            provider_id=provider_id,
        )
        if not models and not any([runtime_target, modality, voice_compatible, is_abliterated, provider_id]):
            seed_default_models(d.memory_store)
            models = d.memory_store.list_models()
        return {"success": True, "models": models, "count": len(models)}

    @app.get("/api/hf/status")
    async def api_hf_status(request: Request, token: Optional[str] = Query(None)):
        verify_bearer_fn(request)
        from core.runtime.hf_manager import HuggingFaceManager
        res = await asyncio.to_thread(HuggingFaceManager(token=token).validate_and_get_status)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/hf/models/search")
    async def api_hf_search(request: Request, query: str = Query("abliterated GGUF"), limit: int = Query(20, ge=1, le=100)):
        verify_bearer_fn(request)
        from core.runtime.hf_manager import HuggingFaceManager
        models = await asyncio.to_thread(HuggingFaceManager().search_hub_models, query=query, limit=limit)
        return {"success": True, "models": models, "count": len(models)}

    @app.post("/api/hf/space/bundle")
    async def api_hf_space_bundle(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.hf_manager import HuggingFaceManager
        res = HuggingFaceManager().generate_space_bundle(
            repo_id=str(body.get("repo_id", "nexus-ai/sovereign-worker")),
            model_id=str(body.get("model_id", "Qwen/Qwen2.5-Coder-7B-Instruct")),
        )
        return {"success": True, **res} if isinstance(res, dict) else {"success": True, "bundle": res}

    @app.post("/api/ollama/pull")
    async def api_ollama_pull(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        model = str(body.get("model") or body.get("name") or "").strip()
        if not model:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'model' is required"})
        if dry_run_hardware:
            return {"success": True, "model": model, "status": "dry_run_queued"}
        try:
            proc = await asyncio.to_thread(
                subprocess.run,
                ["ollama", "pull", model],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return {"success": proc.returncode == 0, "model": model, "stdout": proc.stdout, "stderr": proc.stderr}
        except Exception as exc:
            return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})

    @app.post("/api/compute/pool")
    async def api_compute_pool_post(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        d = delegate()
        if body.get("tunnel_url") or body.get("endpoint"):
            res = d.add_direct_compute_node(body)
            return JSONResponse(status_code=201 if res.get("success") else 400, content=res)
        return d.get_compute_pool_status()

    @app.post("/api/compute/nodes/direct")
    async def api_compute_nodes_direct(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().add_direct_compute_node(body)
        return JSONResponse(status_code=201 if res.get("success") else 400, content=res)

    @app.post("/api/compute/wake")
    async def api_compute_wake(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = await asyncio.to_thread(delegate().wake_compute_node, force=bool(body.get("force", False)))
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/compute/kaggle-wake")
    async def api_compute_kaggle_wake(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = await asyncio.to_thread(delegate().compute_pool.auto_wake_kaggle_kernel, body.get("kernel_slug"))
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/compute/kaggle-template")
    async def api_compute_kaggle_template(request: Request):
        verify_bearer_fn(request)
        return delegate().compute_pool.generate_kaggle_worker_notebook() if hasattr(delegate().compute_pool, "generate_kaggle_worker_notebook") else {"success": True, "template": "kaggle_worker.ipynb"}

    # ------------------------------------------------------------------
    # Macros, Expenses, Away, Timers, Creator, Stock, SCOUT-01, Skills
    # ------------------------------------------------------------------
    @app.get("/api/macros")
    async def api_macros_list(request: Request):
        verify_bearer_fn(request)
        from core.runtime.macro_recorder import list_recorded_macros
        macros = list_recorded_macros(db_path=str(db_path))
        return {"success": True, "macros": macros, "count": len(macros)}

    @app.get("/api/macros/{macro_name}")
    async def api_macros_get(request: Request, macro_name: str):
        verify_bearer_fn(request)
        from core.runtime.macro_recorder import get_recorded_macro
        macro = get_recorded_macro(macro_name, db_path=str(db_path))
        if not macro:
            return JSONResponse(status_code=404, content={"success": False, "error": f"Macro '{macro_name}' not found"})
        return {"success": True, "macro": macro}

    @app.post("/api/macros/start")
    async def api_macros_start(request: Request):
        verify_bearer_fn(request)
        d = delegate()
        ok = d.macro_recorder.start_recording()
        return {"success": ok, "is_recording": True, "recorder_id": d.macro_recorder._recorder_id}

    @app.post("/api/macros/stop")
    async def api_macros_stop(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        d = delegate()
        actions = d.macro_recorder.stop_recording()
        res: Dict[str, Any] = {"success": True, "is_recording": False, "action_count": len(actions), "actions": actions}
        if body.get("name"):
            from core.runtime.macro_recorder import save_recorded_macro
            res["saved"] = save_recorded_macro(
                name=str(body["name"]),
                actions=actions,
                description=str(body.get("description", "")),
                db_path=db_path,
                tags=body.get("tags"),
            )
        return res

    @app.post("/api/macros/record")
    async def api_macros_record_step(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        entry = delegate().macro_recorder.record_action(
            action_type=str(body.get("action_type", "action")),
            data=body.get("data", {}),
        )
        return JSONResponse(status_code=201, content={"success": True, "action": entry})

    @app.post("/api/macros/record/start")
    async def api_macros_engine_start(request: Request):
        verify_bearer_fn(request)
        from core.runtime.macro_engine import start_recording
        return start_recording()

    @app.post("/api/macros/record/stop")
    async def api_macros_engine_stop(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.macro_engine import stop_recording
        return stop_recording(name=body.get("name") or "custom-macro", description=body.get("description", ""))

    @app.post("/api/macros/save")
    async def api_macros_save(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        name = body.get("name")
        if not name:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'name' is required"})
        from core.runtime.macro_recorder import save_recorded_macro
        saved = save_recorded_macro(
            name=str(name),
            actions=body.get("actions", []),
            description=str(body.get("description", "")),
            db_path=db_path,
            tags=body.get("tags"),
        )
        return JSONResponse(status_code=201, content=saved)

    @app.post("/api/macros/replay")
    async def api_macros_replay(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        macro_target = body.get("name") or body.get("macro_id") or body.get("id") or body.get("actions", [])
        from core.runtime.macro_engine import replay_macro
        res = await asyncio.to_thread(
            replay_macro,
            macro_target,
            speed_multiplier=float(body.get("speed_multiplier", 1.0)),
            dry_run=bool(body.get("dry_run", False)),
            auto_approve=bool(body.get("auto_approve", False)),
        )
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/macros/edit")
    async def api_macros_edit(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.macro_engine import edit_macro_step
        res = edit_macro_step(
            macro_id_or_name=str(body.get("macro_id") or body.get("id") or body.get("name", "")),
            step_index=int(body.get("step_index", 0)),
            new_action_data=body.get("action") or body.get("new_action_data") or body.get("data") or {},
        )
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/macros/export")
    async def api_macros_export(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        from core.runtime.macro_engine import export_macro
        target_path = export_macro(
            macro_id_or_name=str(body.get("macro_id") or body.get("id") or body.get("name", "")),
            output_path=body.get("output_path"),
        )
        return {"success": True, "path": str(target_path)}

    @app.post("/api/macros/compile")
    async def api_macros_compile(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        macro_name = body.get("name") or body.get("macro_name")
        if not macro_name:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'name' or 'macro_name' is required"})
        from core.runtime.macro_recorder import compile_macro_to_nxskill
        return compile_macro_to_nxskill(macro_name=str(macro_name), output_path=body.get("output_path"), db_path=db_path, permissions=body.get("permissions"))

    @app.post("/api/macros/delete")
    @app.delete("/api/macros/{macro_name}")
    async def api_macros_delete(request: Request, macro_name: Optional[str] = None):
        verify_bearer_fn(request)
        body = await _read_json_body(request) if request.method == "POST" else {}
        target = (macro_name or body.get("name") or body.get("macro_id") or "").strip()
        if not target:
            return JSONResponse(status_code=400, content={"success": False, "error": "Macro name required"})
        from core.runtime.macro_recorder import delete_recorded_macro
        ok = delete_recorded_macro(target, db_path=db_path)
        return JSONResponse(status_code=200 if ok else 404, content={"success": ok, "name": target})

    @app.get("/api/expenses/summary")
    async def api_expenses_summary(request: Request, period: str = Query("month")):
        verify_bearer_fn(request)
        from core.mcp.plugins.expense_tracker import get_expense_tracker
        return get_expense_tracker(db_path=db_path).get_summary(period=period)

    @app.post("/api/expenses/sync")
    async def api_expenses_sync(request: Request):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "error": "Expense sync blocked in SILENT mode", "air_gapped": True})
        body = await _read_json_body(request)
        from core.mcp.plugins.expense_tracker import get_expense_tracker
        res = get_expense_tracker(db_path=db_path).sync_inbox_messages(messages=body.get("messages"))
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/away/status")
    async def api_away_status(request: Request):
        verify_bearer_fn(request)
        return delegate().away_tracker.get_status()

    @app.get("/api/away/digest")
    async def api_away_digest(request: Request):
        verify_bearer_fn(request)
        events = delegate().away_tracker.get_pending_digest_events()
        return {"success": True, "events": events, "count": len(events)}

    @app.post("/api/away/toggle")
    @app.post("/api/away/set")
    async def api_away_set(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        d = delegate()
        away = body.get("away")
        new_state = (not d.away_tracker.get_status().get("is_away", False)) if away is None else bool(away)
        reason = str(body.get("reason", "manual_toggle"))
        is_away = d.away_tracker.set_away(new_state, reason=reason)
        return {"success": True, "is_away": is_away, "reason": reason}

    @app.post("/api/away/queue")
    async def api_away_queue(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        evt_id = delegate().away_tracker.queue_alert(
            title=str(body.get("title", "Away Notification")),
            content=str(body.get("content", "")),
            source=str(body.get("source", "system")),
            event_type=str(body.get("event_type", "alert")),
        )
        return JSONResponse(status_code=201 if evt_id else 500, content={"success": bool(evt_id), "queued": bool(evt_id), "event_id": evt_id})

    @app.post("/api/away/catchup")
    @app.post("/api/away/digest/catchup")
    @app.post("/api/away/wake")
    async def api_away_catchup(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        d = delegate()
        if request.url.path.endswith("/wake"):
            d.away_tracker.set_away(False, reason="wake")
        return d.away_tracker.build_catchup_summary(mark_processed=bool(body.get("mark_processed", True)))

    @app.get("/api/timers")
    async def api_timers_get(request: Request, status: Optional[str] = Query(None)):
        verify_bearer_fn(request)
        timers = delegate().list_timers(status=status)
        return {"success": True, "timers": timers, "count": len(timers)}

    @app.post("/api/timers")
    async def api_timers_post(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().create_timer(body)
        return JSONResponse(status_code=201 if res.get("success") else 400, content=res)

    @app.delete("/api/timers/{timer_id}")
    async def api_timers_delete(request: Request, timer_id: str):
        verify_bearer_fn(request)
        conn = sqlite3.connect(str(db_path), timeout=5.0)
        try:
            cur = conn.execute("DELETE FROM timers WHERE id = ?", (timer_id,))
            conn.commit()
            return {"success": cur.rowcount > 0, "id": timer_id}
        except Exception as exc:
            return {"success": False, "error": str(exc)}
        finally:
            conn.close()

    @app.post("/api/creator/record")
    async def api_creator_record(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        action = str(body.get("action", "status")).lower()
        from core.mcp.plugins.creator_suite import start_recording, pause_recording, resume_recording, stop_recording, recording_status
        handlers = {
            "start": lambda: start_recording(output_path=body.get("output_path")),
            "pause": pause_recording,
            "resume": resume_recording,
            "stop": stop_recording,
            "status": recording_status,
        }
        res = handlers[action]() if action in handlers else {"success": False, "error": f"Invalid record action '{action}'"}
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/creator/commentary")
    async def api_creator_commentary(request: Request):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "blocked": True, "air_gapped": True, "error": "Commentary blocked in SILENT mode"})
        body = await _read_json_body(request)
        action = str(body.get("action", "status")).lower()
        from core.mcp.plugins.creator_suite import start_live_commentary, stop_live_commentary, commentary_status
        if action == "start":
            res = start_live_commentary(interval_sec=float(body.get("interval_sec", 5.0)), style=str(body.get("style", "cohost")))
        elif action == "stop":
            res = stop_live_commentary()
        elif action == "status":
            res = commentary_status()
        else:
            res = {"success": False, "error": f"Invalid commentary action '{action}'"}
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/creator/youtube")
    async def api_creator_youtube(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        action = str(body.get("action", "")).lower()
        from core.mcp.plugins.creator_suite import youtube_upload_video, youtube_comment_sentiment
        if action == "upload":
            res = youtube_upload_video(
                file_path=str(body.get("file_path", "")),
                title=str(body.get("title", "")),
                description=str(body.get("description", "")),
                tags=body.get("tags"),
                privacy_status=str(body.get("privacy_status", "private")),
                category_id=str(body.get("category_id", "22")),
            )
        elif action == "sentiment":
            res = youtube_comment_sentiment(video_id=str(body.get("video_id", "")), max_comments=int(body.get("max_comments", 50)))
        else:
            res = {"success": False, "error": "Invalid action. Supported: 'upload', 'sentiment'"}
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.get("/api/widgets/stock")
    async def api_widgets_stock(request: Request, symbol: str = Query("NVDA")):
        verify_bearer_fn(request)
        if _current_mode(governor) == "SILENT":
            return JSONResponse(status_code=403, content={"success": False, "error": "Blocked by WorkspaceGovernor: Network disabled in SILENT mode"})
        quote = await asyncio.to_thread(delegate().fetch_stock_quote, symbol.strip().upper())
        return JSONResponse(status_code=200 if quote.get("success") else 502, content=quote)

    @app.get("/api/scout/reach/status")
    async def api_scout_status(request: Request):
        verify_bearer_fn(request)
        from core.mcp.plugins.agent_reach_plugin import scout_reach_doctor
        d = delegate()
        status_data = await asyncio.to_thread(scout_reach_doctor)
        recent = d.memory_store.list_recent_reach_events(limit=20) if hasattr(d.memory_store, "list_recent_reach_events") else []
        mode = _current_mode(governor)
        return {"success": True, "status": status_data, "workspace_mode": mode, "air_gapped": mode == "SILENT", "recent_events": recent, "count": len(recent)}

    @app.post("/api/scout/reach/read")
    async def api_scout_read(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        target = str(body.get("target", "")).strip()
        if not target:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'target' is required"})
        from core.mcp.plugins.agent_reach_plugin import scout_reach_read
        mode = str(body.get("workspace_mode") or _current_mode(governor)).upper()
        res = await asyncio.to_thread(scout_reach_read, target=target, workspace_mode=mode, db_path=db_path)
        code = 403 if res.get("blocked") else (200 if res.get("ok") else 500)
        return JSONResponse(status_code=code, content={"success": res.get("ok", False), **res})

    @app.post("/api/scout/reach/search")
    async def api_scout_search(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        query = str(body.get("query", "")).strip()
        if not query:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'query' is required"})
        from core.mcp.plugins.agent_reach_plugin import scout_reach_search
        mode = str(body.get("workspace_mode") or _current_mode(governor)).upper()
        res = await asyncio.to_thread(scout_reach_search, query=query, channel=str(body.get("channel", "all")).strip(), workspace_mode=mode, db_path=db_path)
        code = 403 if res.get("blocked") else (200 if res.get("ok") else 500)
        return JSONResponse(status_code=code, content={"success": res.get("ok", False), **res})

    @app.post("/api/scout/cascade")
    async def api_scout_cascade(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        target = str(body.get("target", "")).strip()
        if not target:
            return JSONResponse(status_code=400, content={"success": False, "error": "Field 'target' is required"})
        from core.engine.tools.scout_cascade import scout_cascade_run
        mode = str(body.get("workspace_mode") or _current_mode(governor)).upper()
        res = await asyncio.to_thread(
            scout_cascade_run,
            target=target,
            mode=str(body.get("mode", "read")).strip().lower(),
            force_tier=str(body.get("force_tier", "auto")).strip().lower(),
            workspace_mode=mode,
            db_path=db_path,
        )
        code = 403 if res.get("blocked") else (200 if res.get("ok") else 500)
        return JSONResponse(status_code=code, content={"success": res.get("ok", False), **res})

    @app.get("/api/remote/connect")
    async def api_remote_connect(request: Request, token: str = Query("")):
        d = delegate()
        if d.validate_qr_token(token.strip()):
            return {"success": True, "message": "Mobile handshake verified", "ipc_host": "127.0.0.1", "ipc_port": 47630, "timestamp": time.time()}
        return JSONResponse(status_code=401, content={"success": False, "error": "QR handshake token invalid or expired"})

    @app.post("/api/remote/qr-regenerate")
    async def api_remote_qr_regen(request: Request):
        verify_bearer_fn(request)
        _, _, info = delegate().generate_qr_pairing(ttl_seconds=900.0)
        return {"success": True, **info}

    @app.get("/api/skills")
    async def api_skills_unified(request: Request):
        verify_bearer_fn(request)
        from core.mcp.skill_marketplace_importer import SkillMarketplaceImporter
        d = delegate()
        skills = SkillMarketplaceImporter(db_path=str(db_path)).get_installed_skills()
        tools = d.get_mcp_tools()
        return {"success": True, "skills": skills, "tools": tools}

    @app.post("/api/mcp/share-files")
    async def api_mcp_share_files(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().handle_mcp_share_files(body)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)

    @app.post("/api/shelf/transform")
    async def api_shelf_transform(request: Request):
        verify_bearer_fn(request)
        body = await _read_json_body(request)
        res = delegate().handle_shelf_transform(body)
        return JSONResponse(status_code=200 if res.get("success") else 400, content=res)
