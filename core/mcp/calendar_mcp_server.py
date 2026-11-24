"""Nexus OS v5.0 - DPAPI-Secured Google Calendar FastMCP Server.

Exposes calendar read, search, create, update, and delete tools over FastMCP.
- Google OAuth credentials stored exclusively in Windows DPAPI vault (core/security/vault.py)
- Event deletion strictly enforces ScopeGuard Human-In-The-Loop confirmation on Notch HUD
- WorkspaceGovernor air-gap verification (blocks external access in [SILENT] mode)
- Dual-layer storage: Google Calendar API with SQLite WAL local-cache resilience
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import sys
import time
from typing import Any, Dict, List, Optional

# Ensure core and repo root are in pythonpath
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from core.security.vault import (
    get_secret,
    set_secret,
    store_oauth_tokens,
    load_oauth_tokens,
    delete_oauth_tokens,
    list_keys,
)
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError
from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.slice_engine import InfinitySliceEngine

logger = logging.getLogger("nexus.mcp.calendar_server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [CALENDAR_MCP] %(message)s")

# Import FastMCP or resilient fallback shim
try:
    from mcp.server.fastmcp import FastMCP
    HAS_FASTMCP = True
except ImportError:
    HAS_FASTMCP = False

    class FastMCP:  # type: ignore
        def __init__(self, name: str):
            self.name = name
            self._tools: Dict[str, Any] = {}

        def tool(self):
            def decorator(fn):
                self._tools[fn.__name__] = fn
                return fn
            return decorator

        def run(self):
            logger.info("[%s] FastMCP server running with tools: %s", self.name, list(self._tools.keys()))


mcp = FastMCP("NexusGoogleCalendarMCP")

VAULT_CALENDAR_KEY = "GOOGLE_CALENDAR_CREDENTIALS"
SERVICE_NAME = "google_calendar"

_scope_guard = ScopeGuard()
_governor = WorkspaceGovernor()
_slice_engine = InfinitySliceEngine()


def _get_local_timezone() -> str:
    """Detects local machine primary timezone identifier."""
    try:
        tz = datetime.datetime.now().astimezone().tzname()
        if tz:
            return tz
    except Exception:
        pass
    return "UTC"


def _get_cache_db() -> sqlite3.Connection:
    """Connects to local SQLite database in WAL mode for resilient calendar caching."""
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_dir / "agent_local.db"), timeout=5.0)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calendar_events_cache (
            event_id TEXT PRIMARY KEY,
            summary TEXT NOT NULL,
            start_iso TEXT NOT NULL,
            end_iso TEXT NOT NULL,
            timezone TEXT NOT NULL,
            description TEXT,
            location TEXT,
            reminder_minutes INTEGER DEFAULT 15,
            raw_payload TEXT,
            updated_at REAL NOT NULL
        );
        """
    )
    try:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(calendar_events_cache);").fetchall()}
        if "description" not in cols:
            conn.execute("ALTER TABLE calendar_events_cache ADD COLUMN description TEXT;")
        if "location" not in cols:
            conn.execute("ALTER TABLE calendar_events_cache ADD COLUMN location TEXT;")
        conn.commit()
    except Exception as m_err:
        logger.debug("calendar_events_cache migration note: %s", m_err)
    conn.row_factory = sqlite3.Row
    return conn


def _build_service(creds_json_str: Optional[str] = None) -> Optional[Any]:
    """Builds authorized Google Calendar API service from DPAPI credentials."""
    json_str = creds_json_str or get_secret(VAULT_CALENDAR_KEY)
    if not json_str:
        oauth_data = load_oauth_tokens(SERVICE_NAME)
        if oauth_data:
            json_str = json.dumps(oauth_data)

    if not json_str:
        return None

    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds_data = json.loads(json_str) if isinstance(json_str, str) else json_str
        creds = Credentials.from_authorized_user_info(creds_data)
        return build("calendar", "v3", credentials=creds, cache_discovery=False)
    except Exception as exc:
        logger.warning("[CALENDAR_MCP] Could not instantiate Google Calendar service: %s", exc)
        return None


# -----------------------------------------------------------------------------
# MCP Tools
# -----------------------------------------------------------------------------

@mcp.tool()
def store_calendar_credentials(credentials_json: str) -> Dict[str, Any]:
    """
    Stores Google OAuth credentials securely inside Windows DPAPI vault.
    Validates token structure and synchronizes both legacy and structured vault keys.
    """
    if not credentials_json or not isinstance(credentials_json, str):
        return {"success": False, "error": "Parameter 'credentials_json' must be a valid JSON string"}

    try:
        data = json.loads(credentials_json)
        if not isinstance(data, dict):
            return {"success": False, "error": "Credentials payload must be a JSON object"}
    except Exception as exc:
        return {"success": False, "error": f"Failed to parse credentials JSON: {exc}"}

    # Store in Windows DPAPI Vault
    set_secret(VAULT_CALENDAR_KEY, credentials_json)
    store_oauth_tokens(SERVICE_NAME, data)

    logger.info("[CALENDAR_MCP] Stored Google Calendar credentials in Windows DPAPI vault.")
    return {
        "success": True,
        "message": "Google Calendar credentials stored securely in Windows DPAPI vault",
        "keys": [VAULT_CALENDAR_KEY, f"OAUTH_{SERVICE_NAME.upper()}_TOKENS"],
        "stored_at": time.time(),
    }


@mcp.tool()
def calendar_vault_status() -> Dict[str, Any]:
    """Queries Windows DPAPI vault status for Google Calendar OAuth tokens."""
    has_legacy = get_secret(VAULT_CALENDAR_KEY) is not None
    structured = load_oauth_tokens(SERVICE_NAME)
    has_structured = structured is not None

    all_keys = list_keys()
    oauth_keys = [k for k in all_keys if "CALENDAR" in k or "GOOGLE" in k or "OAUTH" in k]

    return {
        "success": True,
        "credentials_configured": has_legacy or has_structured,
        "vault_keys": oauth_keys,
        "service_name": SERVICE_NAME,
        "local_timezone": _get_local_timezone(),
    }


@mcp.tool()
def calendar_list(
    max_results: int = 20,
    time_min_iso: str = "",
    calendar_id: str = "primary",
) -> Dict[str, Any]:
    """
    Lists upcoming calendar events with dual-layer resolution:
    Queries Google Calendar API when DPAPI credentials are present, falling back to local SQLite cache.
    """
    mode = _governor.get_mode().upper()
    if mode == "SILENT":
        logger.info("[CALENDAR_MCP] SILENT mode active; reading strictly from local offline SQLite cache.")
        service = None
    else:
        service = _build_service()

    events_list: List[Dict[str, Any]] = []
    source = "local_cache"

    if service:
        try:
            t_min = time_min_iso if time_min_iso else datetime.datetime.now(datetime.timezone.utc).isoformat()
            res = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    maxResults=max(1, min(100, max_results)),
                    singleEvents=True,
                    orderBy="startTime",
                    timeMin=t_min,
                )
                .execute()
            )
            items = res.get("items", [])
            for item in items:
                start = item.get("start", {}).get("dateTime") or item.get("start", {}).get("date", "")
                end = item.get("end", {}).get("dateTime") or item.get("end", {}).get("date", "")
                events_list.append({
                    "id": item.get("id"),
                    "summary": item.get("summary", "(No title)"),
                    "start_iso": start,
                    "end_iso": end,
                    "location": item.get("location", ""),
                    "description": item.get("description", ""),
                    "html_link": item.get("htmlLink", ""),
                })
            source = "google_api"
        except Exception as exc:
            logger.warning("[CALENDAR_MCP] Google API list failed (%s); falling back to local cache.", exc)

    if not events_list:
        with _get_cache_db() as conn:
            rows = conn.execute(
                "SELECT event_id, summary, start_iso, end_iso, timezone, description, location FROM calendar_events_cache ORDER BY start_iso ASC LIMIT ?;",
                (max(1, min(100, max_results)),),
            ).fetchall()
            for r in rows:
                events_list.append({
                    "id": r["event_id"],
                    "summary": r["summary"],
                    "start_iso": r["start_iso"],
                    "end_iso": r["end_iso"],
                    "timezone": r["timezone"],
                    "description": r["description"] or "",
                    "location": r["location"] or "",
                })

    return {
        "success": True,
        "source": source,
        "calendar_id": calendar_id,
        "count": len(events_list),
        "events": events_list,
    }


@mcp.tool()
def calendar_search(
    query: str,
    max_results: int = 10,
    calendar_id: str = "primary",
) -> Dict[str, Any]:
    """
    Searches calendar events by title, description, or keyword with fallback to local SQLite cache.
    """
    if not query or not query.strip():
        return {"success": False, "error": "Parameter 'query' is required"}

    mode = _governor.get_mode().upper()
    service = None if mode == "SILENT" else _build_service()
    results: List[Dict[str, Any]] = []
    source = "local_cache"

    if service:
        try:
            res = (
                service.events()
                .list(
                    calendarId=calendar_id,
                    q=query.strip(),
                    maxResults=max(1, min(50, max_results)),
                    singleEvents=True,
                )
                .execute()
            )
            for item in res.get("items", []):
                start = item.get("start", {}).get("dateTime") or item.get("start", {}).get("date", "")
                end = item.get("end", {}).get("dateTime") or item.get("end", {}).get("date", "")
                results.append({
                    "id": item.get("id"),
                    "summary": item.get("summary", "(No title)"),
                    "start_iso": start,
                    "end_iso": end,
                    "location": item.get("location", ""),
                    "description": item.get("description", ""),
                })
            source = "google_api"
        except Exception as exc:
            logger.warning("[CALENDAR_MCP] Search API error (%s); checking cache.", exc)

    if not results:
        with _get_cache_db() as conn:
            pattern = f"%{query.strip()}%"
            rows = conn.execute(
                """
                SELECT event_id, summary, start_iso, end_iso, timezone, description, location
                FROM calendar_events_cache
                WHERE summary LIKE ? OR description LIKE ? OR location LIKE ?
                ORDER BY start_iso ASC LIMIT ?;
                """,
                (pattern, pattern, pattern, max_results),
            ).fetchall()
            for r in rows:
                results.append({
                    "id": r["event_id"],
                    "summary": r["summary"],
                    "start_iso": r["start_iso"],
                    "end_iso": r["end_iso"],
                    "timezone": r["timezone"],
                    "description": r["description"] or "",
                    "location": r["location"] or "",
                })

    return {
        "success": True,
        "query": query.strip(),
        "source": source,
        "count": len(results),
        "events": results,
    }


@mcp.tool()
def calendar_create(
    summary: str,
    start_iso: str = "",
    end_iso: str = "",
    description: str = "",
    location: str = "",
    reminder_minutes: int = 15,
    timezone: str = "",
) -> Dict[str, Any]:
    """
    Creates a new calendar event with mobile popup push reminders and caches it locally.
    """
    if not summary or not summary.strip():
        return {"success": False, "error": "Parameter 'summary' is required"}

    tz = timezone.strip() if timezone.strip() else _get_local_timezone()

    # Default times if omitted
    now = datetime.datetime.now().astimezone()
    if not start_iso:
        start_iso = (now + datetime.timedelta(hours=1)).isoformat()
    if not end_iso:
        try:
            start_dt = datetime.datetime.fromisoformat(start_iso)
            end_iso = (start_dt + datetime.timedelta(minutes=45)).isoformat()
        except Exception:
            end_iso = (now + datetime.timedelta(hours=2)).isoformat()

    event_id = f"evt_{int(time.time() * 1000)}"
    source = "local_only"

    mode = _governor.get_mode().upper()
    service = None if mode == "SILENT" else _build_service()

    if service:
        try:
            event_body = {
                "summary": summary.strip(),
                "description": description.strip(),
                "location": location.strip(),
                "start": {"dateTime": start_iso, "timeZone": tz},
                "end": {"dateTime": end_iso, "timeZone": tz},
                "reminders": {
                    "useDefault": False,
                    "overrides": [{"method": "popup", "minutes": max(1, reminder_minutes)}],
                },
            }
            created = service.events().insert(calendarId="primary", body=event_body).execute()
            event_id = created.get("id", event_id)
            source = "google_api"
        except Exception as exc:
            logger.warning("[CALENDAR_MCP] Cloud event creation failed (%s); storing in local cache.", exc)

    # Persist in local SQLite cache
    now_ts = time.time()
    with _get_cache_db() as conn:
        conn.execute(
            """
            INSERT INTO calendar_events_cache (event_id, summary, start_iso, end_iso, timezone, description, location, reminder_minutes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(event_id) DO UPDATE SET
                summary = excluded.summary,
                start_iso = excluded.start_iso,
                end_iso = excluded.end_iso,
                timezone = excluded.timezone,
                description = excluded.description,
                location = excluded.location,
                reminder_minutes = excluded.reminder_minutes,
                updated_at = excluded.updated_at;
            """,
            (event_id, summary.strip(), start_iso, end_iso, tz, description.strip(), location.strip(), reminder_minutes, now_ts),
        )
        conn.commit()

    return {
        "success": True,
        "event_id": event_id,
        "summary": summary.strip(),
        "start_iso": start_iso,
        "end_iso": end_iso,
        "timezone": tz,
        "source": source,
    }


@mcp.tool()
def calendar_update(
    event_id: str,
    summary: str = "",
    start_iso: str = "",
    end_iso: str = "",
    description: str = "",
    location: str = "",
) -> Dict[str, Any]:
    """
    Updates an existing calendar event in Google Calendar and local cache.
    """
    if not event_id or not event_id.strip():
        return {"success": False, "error": "Parameter 'event_id' is required"}

    eid = event_id.strip()
    mode = _governor.get_mode().upper()
    service = None if mode == "SILENT" else _build_service()
    updated_fields: List[str] = []

    if summary:
        updated_fields.append("summary")
    if description:
        updated_fields.append("description")
    if location:
        updated_fields.append("location")
    if start_iso:
        updated_fields.append("start_iso")
    if end_iso:
        updated_fields.append("end_iso")

    if service:
        try:
            patch_body: Dict[str, Any] = {}
            if summary:
                patch_body["summary"] = summary.strip()
            if description:
                patch_body["description"] = description.strip()
            if location:
                patch_body["location"] = location.strip()
            if start_iso:
                patch_body["start"] = {"dateTime": start_iso}
            if end_iso:
                patch_body["end"] = {"dateTime": end_iso}

            if patch_body:
                service.events().patch(calendarId="primary", eventId=eid, body=patch_body).execute()
        except Exception as exc:
            logger.warning("[CALENDAR_MCP] Cloud event update failed (%s); updating local cache.", exc)

    # Update local SQLite cache
    with _get_cache_db() as conn:
        updates = []
        params = []
        if summary:
            updates.append("summary = ?")
            params.append(summary.strip())
        if description:
            updates.append("description = ?")
            params.append(description.strip())
        if location:
            updates.append("location = ?")
            params.append(location.strip())
        if start_iso:
            updates.append("start_iso = ?")
            params.append(start_iso)
        if end_iso:
            updates.append("end_iso = ?")
            params.append(end_iso)

        if updates:
            updates.append("updated_at = ?")
            params.append(time.time())
            params.append(eid)
            sql = f"UPDATE calendar_events_cache SET {', '.join(updates)} WHERE event_id = ?;"
            conn.execute(sql, params)
            conn.commit()

    return {
        "success": True,
        "event_id": eid,
        "updated_fields": updated_fields,
    }


@mcp.tool()
def calendar_delete(
    event_id: str,
    calendar_id: str = "primary",
    hitl_confirmed: bool = False,
) -> Dict[str, Any]:
    """
    Deletes a calendar event.
    MANDATORY SECURITY GATE: Requires ScopeGuard Human-In-The-Loop confirmation on Notch HUD.
    If hitl_confirmed is False, raises ScopeViolationError to enforce interactive user approval.
    """
    if not event_id or not event_id.strip():
        return {"success": False, "error": "Parameter 'event_id' is required"}

    eid = event_id.strip()

    # ScopeGuard HITL Security Gate: Destructive Event Deletion
    # auto_approve=hitl_confirmed: will raise ScopeViolationError if hitl_confirmed is False
    _scope_guard.check_ui_action(
        label=f"delete calendar event {eid}",
        target="google_calendar_mcp",
        auto_approve=hitl_confirmed,
    )

    mode = _governor.get_mode().upper()
    service = None if mode == "SILENT" else _build_service()

    if service:
        try:
            service.events().delete(calendarId=calendar_id, eventId=eid).execute()
        except Exception as exc:
            logger.warning("[CALENDAR_MCP] Cloud event deletion warning (%s)", exc)

    # Purge from local SQLite cache
    with _get_cache_db() as conn:
        conn.execute("DELETE FROM calendar_events_cache WHERE event_id = ?;", (eid,))
        conn.commit()

    # Emit telemetry event
    _slice_engine.emit_telemetry_event(
        "calendar_event_deleted",
        {"event_id": eid, "deleted_at": time.time(), "confirmed": hitl_confirmed},
    )

    return {
        "success": True,
        "event_id": eid,
        "deleted": True,
        "hitl_confirmed": hitl_confirmed,
    }


if __name__ == "__main__":
    mcp.run()
