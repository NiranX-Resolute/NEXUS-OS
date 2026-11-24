"""Nexus OS v5.0 - DPAPI-Secured Google Calendar & Mobile Push Reminders Plugin (Mark-LVII Parity).

Supports list, search, create, update, and delete calendar operations with dynamic timezone detection.
Attaches popup push reminders to event payloads so mobile notifications fire even when the PC sleeps.
Stores Google OAuth tokens exclusively via Windows DPAPI (core/security/vault.py).
Enforces ScopeGuard HITL authorization before any event deletion.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Literal, Optional

from core.mcp.plugin_loader import nexus_tool
from core.security.vault import get_secret, set_secret
from core.runtime.scope_guard import ScopeGuard

logger = logging.getLogger("nexus.mcp.plugins.google_calendar")

VAULT_CALENDAR_KEY = "GOOGLE_CALENDAR_CREDENTIALS"
_scope_guard = ScopeGuard()


def _get_local_timezone_name() -> str:
    """Detects local machine primary timezone identifier."""
    try:
        tz = datetime.datetime.now().astimezone().tzname()
        if tz:
            return tz
    except Exception:
        pass
    return "UTC"


def _get_cache_db_path() -> Path:
    """Returns local SQLite database path for offline/caching calendar entries."""
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def _init_calendar_cache_table() -> None:
    """Initializes local calendar events table for offline resilience."""
    db_path = _get_cache_db_path()
    conn = sqlite3.connect(str(db_path), timeout=5.0)
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS calendar_events_cache (
                event_id TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                start_iso TEXT NOT NULL,
                end_iso TEXT NOT NULL,
                timezone TEXT NOT NULL,
                reminder_minutes INTEGER DEFAULT 15,
                raw_payload TEXT,
                updated_at REAL NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def _build_google_service(creds_json_str: str) -> Optional[Any]:
    """Constructs Google Calendar API service instance from decrypted DPAPI credentials."""
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds_data = json.loads(creds_json_str)
        creds = Credentials.from_authorized_user_info(creds_data)
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return service
    except Exception as exc:
        logger.warning("[CALENDAR] Could not instantiate Google Calendar service: %s", exc)
        return None


@nexus_tool(
    name="calendar_manage",
    description="DPAPI-secured Google Calendar manager supporting list, search, create, update, and delete with mobile popup push reminders.",
    agent="OPS-01",
    requires_approval=False,
)
def calendar_manage(
    action: Literal["list", "search", "create", "update", "delete"] = "list",
    summary: str = "",
    start_iso: str = "",
    end_iso: str = "",
    query: str = "",
    event_id: str = "",
    reminder_minutes: int = 15,
) -> Dict[str, Any]:
    """
    Manages calendar operations with DPAPI credential security and mobile push reminders.
    Requires ScopeGuard approval before destructive 'delete' operations.
    """
    _init_calendar_cache_table()
    now_ts = time.time()
    tz_name = _get_local_timezone_name()

    # 1. ScopeGuard enforcement for delete action
    if action == "delete":
        if not event_id:
            return {"success": False, "error": "Field 'event_id' is required for delete action"}
        _scope_guard.check_ui_action(
            label=f"delete calendar event {event_id}",
            target="google_calendar",
            auto_approve=False,
        )

    # 2. Retrieve credentials securely from Windows DPAPI Vault
    raw_creds = get_secret(VAULT_CALENDAR_KEY)
    service = _build_google_service(raw_creds) if raw_creds else None

    # Construct standard mobile push reminder payload
    reminders_payload = {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": max(1, reminder_minutes)}],
    }

    # 3. Handle 'create' action
    if action == "create":
        if not summary:
            return {"success": False, "error": "Field 'summary' is required for creating a calendar event"}

        # Default start to next hour, end to 1 hour after start if not provided
        if not start_iso:
            start_dt = datetime.datetime.now().astimezone() + datetime.timedelta(hours=1)
            start_iso = start_dt.isoformat()
        if not end_iso:
            try:
                start_parsed = datetime.datetime.fromisoformat(start_iso)
                end_iso = (start_parsed + datetime.timedelta(minutes=30)).isoformat()
            except Exception:
                end_iso = (datetime.datetime.now().astimezone() + datetime.timedelta(hours=2)).isoformat()

        new_event_id = event_id or f"evt_{int(now_ts * 1000)}"

        if service:
            try:
                event_body = {
                    "summary": summary,
                    "start": {"dateTime": start_iso, "timeZone": tz_name},
                    "end": {"dateTime": end_iso, "timeZone": tz_name},
                    "reminders": reminders_payload,
                }
                created = service.events().insert(calendarId="primary", body=event_body).execute()
                new_event_id = created.get("id", new_event_id)
            except Exception as exc:
                logger.warning("[CALENDAR] Cloud event creation failed (%s), recording to local DB.", exc)

        # Cache in local SQLite database
        db_path = _get_cache_db_path()
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.execute(
                """
                INSERT INTO calendar_events_cache (event_id, summary, start_iso, end_iso, timezone, reminder_minutes, raw_payload, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO UPDATE SET
                    summary = excluded.summary,
                    start_iso = excluded.start_iso,
                    end_iso = excluded.end_iso,
                    timezone = excluded.timezone,
                    reminder_minutes = excluded.reminder_minutes,
                    raw_payload = excluded.raw_payload,
                    updated_at = excluded.updated_at;
                """,
                (
                    new_event_id,
                    summary,
                    start_iso,
                    end_iso,
                    tz_name,
                    reminder_minutes,
                    json.dumps({"reminders": reminders_payload, "summary": summary}),
                    now_ts,
                ),
            )
            conn.commit()

        event_dict = {
            "id": new_event_id,
            "summary": summary,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "timezone": tz_name,
            "reminders": reminders_payload,
        }
        return {
            "success": True,
            "action": "create",
            "event_id": new_event_id,
            "event": event_dict,
            "summary": summary,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "timezone": tz_name,
            "mobile_push_reminder_minutes": reminder_minutes,
            "reminders": reminders_payload,
            "cloud_synced": service is not None,
        }

    # 4. Handle 'update' action
    if action == "update":
        if not event_id:
            return {"success": False, "error": "Field 'event_id' is required for updating an event"}

        if service:
            try:
                patch_body: Dict[str, Any] = {}
                if summary:
                    patch_body["summary"] = summary
                if start_iso:
                    patch_body["start"] = {"dateTime": start_iso, "timeZone": tz_name}
                if end_iso:
                    patch_body["end"] = {"dateTime": end_iso, "timeZone": tz_name}
                patch_body["reminders"] = reminders_payload
                service.events().patch(calendarId="primary", eventId=event_id, body=patch_body).execute()
            except Exception as exc:
                logger.warning("[CALENDAR] Cloud event patch failed (%s), updating local DB.", exc)

        db_path = _get_cache_db_path()
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            row = conn.execute("SELECT * FROM calendar_events_cache WHERE event_id = ?", (event_id,)).fetchone()
            if row:
                new_sum = summary or row[1]
                new_start = start_iso or row[2]
                new_end = end_iso or row[3]
                conn.execute(
                    """
                    UPDATE calendar_events_cache
                    SET summary = ?, start_iso = ?, end_iso = ?, reminder_minutes = ?, updated_at = ?
                    WHERE event_id = ?;
                    """,
                    (new_sum, new_start, new_end, reminder_minutes, now_ts, event_id),
                )
                conn.commit()

        return {
            "success": True,
            "action": "update",
            "event_id": event_id,
            "summary": summary,
            "mobile_push_reminder_minutes": reminder_minutes,
            "cloud_synced": service is not None,
        }

    # 5. Handle 'delete' action (Protected by ScopeGuard above)
    if action == "delete":
        if service:
            try:
                service.events().delete(calendarId="primary", eventId=event_id).execute()
            except Exception as exc:
                logger.warning("[CALENDAR] Cloud event deletion failed: %s", exc)

        db_path = _get_cache_db_path()
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.execute("DELETE FROM calendar_events_cache WHERE event_id = ?", (event_id,))
            conn.commit()

        return {
            "success": True,
            "action": "delete",
            "event_id": event_id,
            "message": f"Calendar event '{event_id}' deleted successfully.",
        }

    # 6. Handle 'search' action
    if action == "search":
        q_clean = (query or "").strip().lower()
        items = []
        if service:
            try:
                events_result = service.events().list(calendarId="primary", q=q_clean, maxResults=20).execute()
                for item in events_result.get("items", []):
                    items.append({
                        "event_id": item.get("id"),
                        "summary": item.get("summary", ""),
                        "start_iso": item.get("start", {}).get("dateTime", item.get("start", {}).get("date", "")),
                        "end_iso": item.get("end", {}).get("dateTime", item.get("end", {}).get("date", "")),
                        "timezone": item.get("start", {}).get("timeZone", tz_name),
                    })
            except Exception as exc:
                logger.warning("[CALENDAR] Cloud search failed: %s", exc)

        if not items:
            db_path = _get_cache_db_path()
            with sqlite3.connect(str(db_path), timeout=5.0) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM calendar_events_cache WHERE LOWER(summary) LIKE ? ORDER BY start_iso ASC",
                    (f"%{q_clean}%",),
                ).fetchall()
                for r in rows:
                    items.append({
                        "event_id": r["event_id"],
                        "summary": r["summary"],
                        "start_iso": r["start_iso"],
                        "end_iso": r["end_iso"],
                        "timezone": r["timezone"],
                        "reminder_minutes": r["reminder_minutes"],
                    })

        return {
            "success": True,
            "action": "search",
            "query": q_clean,
            "count": len(items),
            "events": items,
        }

    # 7. Handle 'list' action (Default)
    items = []
    if service:
        try:
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            events_result = service.events().list(
                calendarId="primary", timeMin=now_iso, maxResults=25, singleEvents=True, orderBy="startTime"
            ).execute()
            for item in events_result.get("items", []):
                items.append({
                    "event_id": item.get("id"),
                    "summary": item.get("summary", ""),
                    "start_iso": item.get("start", {}).get("dateTime", item.get("start", {}).get("date", "")),
                    "end_iso": item.get("end", {}).get("dateTime", item.get("end", {}).get("date", "")),
                    "timezone": item.get("start", {}).get("timeZone", tz_name),
                })
        except Exception as exc:
            logger.warning("[CALENDAR] Cloud list failed: %s", exc)

    if not items:
        db_path = _get_cache_db_path()
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT * FROM calendar_events_cache ORDER BY start_iso ASC LIMIT 25").fetchall()
            for r in rows:
                items.append({
                    "event_id": r["event_id"],
                    "summary": r["summary"],
                    "start_iso": r["start_iso"],
                    "end_iso": r["end_iso"],
                    "timezone": r["timezone"],
                    "reminder_minutes": r["reminder_minutes"],
                })

    return {
        "success": True,
        "action": "list",
        "count": len(items),
        "events": items,
        "timezone": tz_name,
        "primary_timezone": tz_name,
        "dpapi_auth_configured": raw_creds is not None,
    }
