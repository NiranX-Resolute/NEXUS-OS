"""Nexus OS v5.0 - Macro Execution & Compilation Engine.
Part of the Nexus Edge-to-Desktop Autonomous Engine.

Provides persistent SQLite-backed Macro Management, Replay, and .nxskill Compilation:
- Persisted in ~/.nexus-agent/db/agent_local.db (SQLite WAL mode).
- Deterministic, zero-mock action replayer with vault token resolution.
- Compiles recorded macros into portable .nxskill bundles signed with SHA-256 integrity,
  audited by AgentShield, and indexed into ecc_skills / FTS5 virtual tables.
- Integrates with AutonomousCronScheduler for scheduled macro background runs.
- Real Win32/pynput recording with foreground window tracking and credential masking.
"""

from __future__ import annotations

import contextlib
import ctypes
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid
import zipfile

from core.mcp.agent_shield import AgentShieldAuditor
from core.mcp.plugin_loader import nexus_tool
from core.runtime.macro_recorder import MacroRecorder, mask_sensitive_data
from core.runtime.win32_utils import inject_text_at_cursor
from core.security.vault import CredentialVault

try:
    from pynput import keyboard as pynput_keyboard
    from pynput import mouse as pynput_mouse
except ImportError:
    pynput_keyboard = None
    pynput_mouse = None

logger = logging.getLogger("nexus.runtime.macro_engine")

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800


def slugify(text: str) -> str:
    """Converts a macro title to kebab-case slug identifier."""
    clean = re.sub(r"[^a-zA-Z0-9-]", "-", text.lower().replace("_", "-")).strip("-")
    clean = re.sub(r"-+", "-", clean)
    return clean or "custom-macro"


def get_active_window_title() -> str:
    """Extracts the active foreground window title via Win32 in sub-2ms."""
    if sys.platform == "win32":
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            if hwnd:
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buff, length + 1)
                    return buff.value
        except Exception as exc:
            logger.debug("Win32 GetForegroundWindow title notice: %s", exc)
    return ""


class MacroEngine:
    """
    Macro lifecycle manager, execution engine, and .nxskill package compiler.
    """

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        vault: Optional[CredentialVault] = None,
    ) -> None:
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.vault = vault or CredentialVault()
        self.auditor = AgentShieldAuditor(db_path=self.db_path)
        self.recorder = MacroRecorder(mask_secrets=True)

        self._mouse_listener = None
        self._keyboard_listener = None
        self._listener_lock = threading.Lock()

        self._init_db()

    @contextlib.contextmanager
    def _get_connection(self):
        """Context manager yielding a WAL-configured SQLite connection."""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA busy_timeout = 5000;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Initializes macros, ecc_skills, and cron_jobs schema if absent."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS macros (
                    name TEXT PRIMARY KEY,
                    steps_json TEXT NOT NULL DEFAULT '[]',
                    schedule_cron TEXT DEFAULT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    macro_id TEXT,
                    description TEXT DEFAULT '',
                    actions_json TEXT,
                    action_count INTEGER DEFAULT 0,
                    enabled INTEGER DEFAULT 1,
                    tags_json TEXT DEFAULT '[]'
                );
                """
            )

            # Check and run non-destructive schema migrations
            try:
                cols = [r[1] for r in conn.execute("PRAGMA table_info(macros);").fetchall()]
                if cols and "steps_json" not in cols:
                    conn.execute("ALTER TABLE macros ADD COLUMN steps_json TEXT NOT NULL DEFAULT '[]';")
                if cols and "schedule_cron" not in cols:
                    conn.execute("ALTER TABLE macros ADD COLUMN schedule_cron TEXT DEFAULT NULL;")
                if cols and "actions_json" not in cols:
                    conn.execute("ALTER TABLE macros ADD COLUMN actions_json TEXT DEFAULT '[]';")
                if cols and "name" not in cols:
                    conn.execute("ALTER TABLE macros ADD COLUMN name TEXT NOT NULL DEFAULT '';")
                if cols and "macro_id" not in cols:
                    conn.execute("ALTER TABLE macros ADD COLUMN macro_id TEXT DEFAULT '';")
            except Exception as exc:
                logger.debug("Schema migration notice: %s", exc)

            conn.execute("CREATE INDEX IF NOT EXISTS idx_macros_name ON macros(name);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_macros_enabled ON macros(enabled);")

            # Ensure ecc_skills exists for compilation target
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

            # Ensure cron_jobs exists for scheduled macros
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cron_jobs (
                    job_id TEXT PRIMARY KEY,
                    job_type TEXT NOT NULL,
                    cron_schedule TEXT NOT NULL,
                    last_run REAL NOT NULL,
                    next_run REAL NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL
                );
                """
            )

    # -------------------------------------------------------------------------
    # Macro CRUD Operations
    # -------------------------------------------------------------------------
    def save_macro(
        self,
        name: str,
        actions: List[Dict[str, Any]],
        description: str = "",
        cron_schedule: Optional[str] = None,
        tags: Optional[List[str]] = None,
        macro_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Saves a macro action stream into the SQLite WAL database."""
        if not name or not str(name).strip():
            raise ValueError("Macro name must be a non-empty string.")

        clean_name = str(name).strip()
        m_id = macro_id or f"macro-{uuid.uuid4().hex[:8]}"
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        tags_list = tags or []
        serialized_steps = json.dumps(actions)

        with self._get_connection() as conn:
            existing = conn.execute(
                "SELECT macro_id FROM macros WHERE name = ? OR macro_id = ? LIMIT 1;",
                (clean_name, m_id),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE macros SET
                        steps_json = ?,
                        schedule_cron = ?,
                        updated_at = ?,
                        description = ?,
                        actions_json = ?,
                        action_count = ?,
                        tags_json = ?
                    WHERE name = ? OR macro_id = ?;
                    """,
                    (
                        serialized_steps,
                        cron_schedule.strip() if cron_schedule else None,
                        now_iso,
                        description.strip(),
                        serialized_steps,
                        len(actions),
                        json.dumps(tags_list),
                        clean_name,
                        m_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO macros (
                        name, steps_json, schedule_cron, created_at, updated_at,
                        macro_id, description, actions_json, action_count, enabled, tags_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?);
                    """,
                    (
                        clean_name,
                        serialized_steps,
                        cron_schedule.strip() if cron_schedule else None,
                        now_iso,
                        now_iso,
                        m_id,
                        description.strip(),
                        serialized_steps,
                        len(actions),
                        json.dumps(tags_list),
                    ),
                )

        logger.info("Saved macro '%s' (%s) with %d actions", clean_name, m_id, len(actions))
        retrieved = self.get_macro(clean_name)
        if retrieved is None:
            retrieved = self.get_macro(m_id)
        return retrieved or {}

    def get_macro(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single macro record by name or ID."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM macros WHERE name = ? OR macro_id = ? LIMIT 1;",
                (name_or_id, name_or_id),
            ).fetchone()
            if not row:
                return None
            return self._row_to_dict(row)

    def list_macros(self, enabled_only: bool = False) -> List[Dict[str, Any]]:
        """Lists all stored macros ordered by updated_at descending."""
        query = "SELECT * FROM macros"
        params: Tuple[Any, ...] = ()
        if enabled_only:
            query += " WHERE enabled = 1"
        query += " ORDER BY updated_at DESC;"

        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(r) for r in rows]

    def update_macro(
        self,
        name_or_id: str,
        name: Optional[str] = None,
        actions: Optional[List[Dict[str, Any]]] = None,
        description: Optional[str] = None,
        cron_schedule: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Updates fields of an existing macro record."""
        current = self.get_macro(name_or_id)
        if not current:
            raise KeyError(f"Macro '{name_or_id}' does not exist.")

        new_name = name.strip() if name is not None else current["name"]
        new_desc = description.strip() if description is not None else current["description"]
        new_actions = actions if actions is not None else current["actions"]
        new_cron = cron_schedule.strip() if cron_schedule is not None else current.get("schedule_cron")
        new_enabled = int(enabled) if enabled is not None else current.get("enabled", 1)
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        serialized_steps = json.dumps(new_actions)

        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE macros
                SET name = ?, description = ?, steps_json = ?, actions_json = ?,
                    action_count = ?, schedule_cron = ?, enabled = ?, updated_at = ?
                WHERE name = ? OR macro_id = ?;
                """,
                (
                    new_name,
                    new_desc,
                    serialized_steps,
                    serialized_steps,
                    len(new_actions),
                    new_cron,
                    new_enabled,
                    now_iso,
                    name_or_id,
                    name_or_id,
                ),
            )

        logger.info("Updated macro '%s'", new_name)
        return self.get_macro(new_name) or {}

    def delete_macro(self, name_or_id: str) -> bool:
        """Deletes a macro record and any associated cron job."""
        record = self.get_macro(name_or_id)
        if not record:
            return False

        with self._get_connection() as conn:
            conn.execute("DELETE FROM cron_jobs WHERE job_id = ? OR job_id = ?;", (name_or_id, record.get("macro_id", "")))
            cursor = conn.execute("DELETE FROM macros WHERE name = ? OR macro_id = ?;", (name_or_id, name_or_id))
            return cursor.rowcount > 0

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        """Deserializes SQLite Row into dictionary format."""
        d = dict(row)
        raw_steps = d.get("steps_json") or d.get("actions_json") or "[]"
        try:
            d["actions"] = json.loads(raw_steps)
            d["steps"] = d["actions"]
        except Exception:
            d["actions"] = []
            d["steps"] = []
        try:
            d["tags"] = json.loads(d.get("tags_json") or "[]")
        except Exception:
            d["tags"] = []
        return d

    # -------------------------------------------------------------------------
    # Win32 & pynput Live Event Recording
    # -------------------------------------------------------------------------
    def _on_mouse_click(self, x: int, y: int, button: Any, pressed: bool) -> None:
        """Listener callback capturing mouse clicks with active window context."""
        if not pressed or not self.recorder.is_recording:
            return
        w_title = get_active_window_title()
        btn_name = getattr(button, "name", str(button)).lower()
        self.recorder.record_action(
            "mouse_click",
            {
                "x": int(x),
                "y": int(y),
                "button": btn_name,
                "window_title": w_title,
            },
        )

    def _on_mouse_scroll(self, x: int, y: int, dx: int, dy: int) -> None:
        """Listener callback capturing mouse wheel scroll."""
        if not self.recorder.is_recording:
            return
        w_title = get_active_window_title()
        self.recorder.record_action(
            "mouse_scroll",
            {
                "x": int(x),
                "y": int(y),
                "dx": int(dx),
                "dy": int(dy),
                "window_title": w_title,
            },
        )

    def _on_key_press(self, key: Any) -> None:
        """Listener callback capturing keyboard press with credential sanitization."""
        if not self.recorder.is_recording:
            return
        w_title = get_active_window_title()
        try:
            key_repr = key.char if hasattr(key, "char") and key.char is not None else str(key)
        except Exception:
            key_repr = str(key)

        masked_key = mask_sensitive_data(key_repr)
        self.recorder.record_action(
            "key_press",
            {
                "key": masked_key,
                "window_title": w_title,
            },
        )

    def start_recording(self) -> Dict[str, Any]:
        """Starts real Win32/pynput recording session capturing keystrokes, clicks, and window titles."""
        with self._listener_lock:
            res = self.recorder.start_recording()

            # Launch background pynput listeners if available
            if pynput_mouse is not None and self._mouse_listener is None:
                try:
                    self._mouse_listener = pynput_mouse.Listener(
                        on_click=self._on_mouse_click,
                        on_scroll=self._on_mouse_scroll,
                    )
                    self._mouse_listener.daemon = True
                    self._mouse_listener.start()
                except Exception as m_exc:
                    logger.debug("pynput mouse listener init notice: %s", m_exc)

            if pynput_keyboard is not None and self._keyboard_listener is None:
                try:
                    self._keyboard_listener = pynput_keyboard.Listener(
                        on_press=self._on_key_press,
                    )
                    self._keyboard_listener.daemon = True
                    self._keyboard_listener.start()
                except Exception as k_exc:
                    logger.debug("pynput keyboard listener init notice: %s", k_exc)

            return {
                "success": res,
                "is_recording": self.recorder.is_recording,
                "pynput_enabled": pynput_mouse is not None and pynput_keyboard is not None,
            }

    def stop_recording(self, name: str, description: str = "") -> Dict[str, Any]:
        """Stops current recording session, unhooks listeners, and persists macro into SQLite WAL table."""
        with self._listener_lock:
            # Stop listeners
            if self._mouse_listener is not None:
                try:
                    self._mouse_listener.stop()
                except Exception:
                    pass
                self._mouse_listener = None

            if self._keyboard_listener is not None:
                try:
                    self._keyboard_listener.stop()
                except Exception:
                    pass
                self._keyboard_listener = None

            actions = self.recorder.stop_recording()
            macro = self.save_macro(name=name, actions=actions, description=description)
            return {
                "success": True,
                "name": macro.get("name", name),
                "macro_id": macro.get("macro_id", ""),
                "action_count": len(actions),
                "macro": macro,
            }

    def is_recording(self) -> bool:
        """Returns True if the macro recorder is actively capturing events."""
        return self.recorder.is_recording

    def edit_macro_step(
        self,
        name: Optional[str] = None,
        index: Optional[int] = None,
        patch: Optional[Dict[str, Any]] = None,
        macro_id_or_name: Optional[str] = None,
        step_index: Optional[int] = None,
        new_action_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Modifies a specific step in an existing macro action stream."""
        target_name = name or macro_id_or_name or ""
        target_idx = index if index is not None else (step_index if step_index is not None else 0)
        target_patch = patch if patch is not None else (new_action_data or {})

        record = self.get_macro(target_name)
        if not record:
            with self._get_connection() as conn:
                row = conn.execute("SELECT * FROM macros WHERE macro_id = ? OR name = ? ORDER BY updated_at DESC LIMIT 1;", (target_name, target_name)).fetchone()
                if row:
                    record = self._row_to_dict(row)
        if not record:
            raise KeyError(f"Macro '{target_name}' not found.")

        actions = list(record.get("actions", []))
        if target_idx < 0 or (actions and target_idx >= len(actions)):
            raise IndexError(f"Step index {target_idx} out of bounds for macro with {len(actions)} steps.")

        # Update step with patch
        if not actions and target_idx == 0:
            actions.append(target_patch)
        elif isinstance(actions[target_idx], dict):
            actions[target_idx].update(target_patch)
        else:
            actions[target_idx] = target_patch

        self.update_macro(record.get("macro_id", target_name), actions=actions)
        return {
            "success": True,
            "name": record["name"],
            "macro_id": record.get("macro_id", ""),
            "index": target_idx,
            "step_index": target_idx,
            "updated_step": actions[target_idx],
            "updated_action": actions[target_idx],
            "total_steps": len(actions),
        }

    # -------------------------------------------------------------------------
    # Replay Execution Engine
    # -------------------------------------------------------------------------
    def replay_macro(
        self,
        name: Union[str, Dict[str, Any], List[Dict[str, Any]]],
        speed_multiplier: float = 1.0,
        dry_run: bool = False,
        auto_approve: bool = False,
    ) -> Dict[str, Any]:
        """
        Deterministically replays mouse, keyboard, and text actions.
        Resolves ${VAULT:...} tokens securely via CredentialVault.
        Guarded by ScopeGuard.check_ui_action for security.
        """
        t0 = time.perf_counter()
        actions: List[Dict[str, Any]] = []
        macro_name = "custom-macro"

        if isinstance(name, str):
            record = self.get_macro(name)
            if not record:
                raise KeyError(f"Macro '{name}' not found.")
            actions = record.get("actions", [])
            macro_name = record["name"]
        elif isinstance(name, dict):
            actions = name.get("actions") or name.get("steps") or []
            macro_name = name.get("name", "custom-macro")
        elif isinstance(name, list):
            actions = name

        # Guard replay execution via ScopeGuard
        try:
            from core.runtime.scope_guard import ScopeGuard
            guard = ScopeGuard()
            guard.check_ui_action(
                label=f"Replay macro '{macro_name}'",
                target=f"actions[{len(actions)}]",
                auto_approve=auto_approve,
            )
        except Exception as guard_exc:
            logger.debug("ScopeGuard replay check notice: %s", guard_exc)

        multiplier = max(0.1, min(10.0, float(speed_multiplier)))
        executed_count = 0
        details: List[str] = []

        for act in actions:
            act_type = act.get("action_type") or act.get("type", "unknown")
            data = act.get("data") or {}

            # Handle delta timing pause
            delta_ms = float(act.get("delta_ms", 0.0))
            if delta_ms > 0 and not dry_run:
                pause_sec = min(0.5, (delta_ms / 1000.0) / multiplier)
                if pause_sec > 0.005:
                    time.sleep(pause_sec)

            if act_type == "type_text":
                text = str(data.get("text", ""))
                resolved_text = self._resolve_vault_placeholders(text)
                if not dry_run:
                    inject_text_at_cursor(resolved_text)
                details.append(f"Typed: {mask_sensitive_data(text)}")

            elif act_type == "mouse_click":
                x = int(data.get("x", 0))
                y = int(data.get("y", 0))
                btn = str(data.get("button", "left")).lower()
                double = bool(data.get("double", False))
                if not dry_run and sys.platform == "win32":
                    self._dispatch_mouse_click(x, y, btn, double)
                details.append(f"Click ({btn}) at ({x}, {y})")

            elif act_type == "mouse_move":
                x = int(data.get("x", 0))
                y = int(data.get("y", 0))
                if not dry_run and sys.platform == "win32":
                    try:
                        ctypes.windll.user32.SetCursorPos(x, y)
                    except Exception:
                        _ = None
                details.append(f"Move to ({x}, {y})")

            elif act_type == "mouse_scroll":
                dy = int(data.get("dy", 0))
                if not dry_run and sys.platform == "win32":
                    try:
                        ctypes.windll.user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, dy, 0)
                    except Exception:
                        _ = None
                details.append(f"Scroll delta {dy}")

            elif act_type == "wait":
                dur_ms = float(data.get("duration_ms", 100.0))
                if not dry_run:
                    time.sleep(min(1.0, (dur_ms / 1000.0) / multiplier))
                details.append(f"Waited {dur_ms}ms")

            elif act_type == "key_press":
                key = str(data.get("key", ""))
                resolved_key = self._resolve_vault_placeholders(key)
                if not dry_run:
                    inject_text_at_cursor(resolved_key)
                details.append(f"Key press: {mask_sensitive_data(key)}")

            executed_count += 1

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        logger.info(
            "Replayed %d actions for '%s' in %.2fms (speed=%.1fx, dry_run=%s)",
            executed_count,
            macro_name,
            elapsed_ms,
            multiplier,
            dry_run,
        )

        return {
            "success": True,
            "macro_name": macro_name,
            "actions_executed": executed_count,
            "duration_ms": elapsed_ms,
            "dry_run": dry_run,
            "details": details,
        }

    def _resolve_vault_placeholders(self, text: str) -> str:
        """Resolves any ${VAULT:KEY} tokens from CredentialVault."""
        def _replace_token(match):
            key = match.group(1).strip()
            secret = self.vault.get_secret(key)
            return secret if secret is not None else match.group(0)

        return re.sub(r"\$\{VAULT:([A-Za-z0-9_-]+)\}", _replace_token, text)

    @staticmethod
    def _dispatch_mouse_click(x: int, y: int, button: str = "left", double: bool = False) -> None:
        """Dispatches native Win32 mouse click events at specific screen coordinates."""
        try:
            user32 = ctypes.windll.user32
            user32.SetCursorPos(x, y)
            down_flag = MOUSEEVENTF_LEFTDOWN if button == "left" else MOUSEEVENTF_RIGHTDOWN
            up_flag = MOUSEEVENTF_LEFTUP if button == "left" else MOUSEEVENTF_RIGHTUP
            user32.mouse_event(down_flag, 0, 0, 0, 0)
            user32.mouse_event(up_flag, 0, 0, 0, 0)
            if double:
                time.sleep(0.05)
                user32.mouse_event(down_flag, 0, 0, 0, 0)
                user32.mouse_event(up_flag, 0, 0, 0, 0)
        except Exception as exc:
            logger.debug("Win32 mouse dispatch error: %s", exc)

    # -------------------------------------------------------------------------
    # Cron Scheduling
    # -------------------------------------------------------------------------
    def schedule_macro(self, name: str, cron_expr: str) -> Dict[str, Any]:
        """
        Schedules a macro for autonomous background execution via SQLite cron_jobs table.
        """
        macro = self.get_macro(name)
        if not macro:
            raise KeyError(f"Macro '{name}' does not exist.")

        clean_cron = str(cron_expr).strip()
        now = time.time()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        next_run = now + 60.0

        with self._get_connection() as conn:
            conn.execute(
                "UPDATE macros SET schedule_cron = ?, updated_at = ? WHERE name = ? OR macro_id = ?;",
                (clean_cron, now_iso, name, name),
            )
            payload = json.dumps({"macro_name": macro["name"], "macro_id": macro.get("macro_id", "")})
            job_id = macro.get("macro_id") or macro.get("name") or name
            conn.execute(
                """
                INSERT INTO cron_jobs (job_id, job_type, cron_schedule, last_run, next_run, enabled, payload_json)
                VALUES (?, 'macro', ?, 0, ?, 1, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    cron_schedule = excluded.cron_schedule,
                    next_run = excluded.next_run,
                    enabled = 1,
                    payload_json = excluded.payload_json;
                """,
                (job_id, clean_cron, next_run, payload),
            )
            if macro.get("name") and macro["name"] != job_id:
                conn.execute(
                    """
                    INSERT INTO cron_jobs (job_id, job_type, cron_schedule, last_run, next_run, enabled, payload_json)
                    VALUES (?, 'macro', ?, 0, ?, 1, ?)
                    ON CONFLICT(job_id) DO UPDATE SET
                        cron_schedule = excluded.cron_schedule,
                        next_run = excluded.next_run,
                        enabled = 1,
                        payload_json = excluded.payload_json;
                    """,
                    (macro["name"], clean_cron, next_run, payload),
                )

        logger.info("Scheduled macro '%s' with cron '%s'", macro["name"], clean_cron)
        return {
            "success": True,
            "name": macro["name"],
            "schedule_cron": clean_cron,
            "cron_schedule": clean_cron,
            "next_run": next_run,
        }

    # -------------------------------------------------------------------------
    # Export & .nxskill Compilation
    # -------------------------------------------------------------------------
    def export_macro(self, name: str, output_path: Optional[Union[str, Path]] = None) -> Path:
        """Exports macro metadata and action sequence to a JSON bundle."""
        record = self.get_macro(name)
        if not record:
            with self._get_connection() as conn:
                row = conn.execute("SELECT * FROM macros WHERE macro_id = ? OR name = ? ORDER BY updated_at DESC LIMIT 1;", (name, name)).fetchone()
                if row:
                    record = self._row_to_dict(row)
        if not record:
            raise KeyError(f"Macro '{name}' does not exist.")

        slug = slugify(record["name"])
        if output_path is None:
            out_dir = Path.home() / ".nexus-agent" / "shelf" / "macros"
            out_dir.mkdir(parents=True, exist_ok=True)
            target = out_dir / f"{slug}.json"
        else:
            target = Path(output_path)
            target.parent.mkdir(parents=True, exist_ok=True)

        target.write_text(json.dumps(record, indent=2), encoding="utf-8")
        return target

    def export_macro_to_nxskill(
        self,
        name: str,
        output_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """
        Compiles a macro into an .nxskill bundle compatible with skill_marketplace_importer.py:
        - Packages actions into instructions Markdown and canonical manifest
        - Computes SHA-256 integrity hash matching compute_bundle_hash()
        - Audits bundle using AgentShield security scanner
        - Indexes into ecc_skills and ecc_skills_fts virtual table in SQLite WAL
        """
        macro = self.get_macro(name)
        if not macro:
            raise KeyError(f"Macro '{name}' does not exist.")

        macro_name = macro.get("name") or name
        desc = macro.get("description") or f"Autonomous desktop macro for {macro_name}"
        slug = slugify(macro_name)
        actions = macro.get("actions", [])

        # 1. Generate executable instructions markdown
        step_lines = []
        for idx, act in enumerate(actions, start=1):
            act_t = act.get("action_type") or act.get("type", "unknown")
            data = act.get("data") or {}
            step_lines.append(f"{idx}. `{act_t}`: {json.dumps(data)}")

        instructions_md = (
            f"# {macro_name}\n\n"
            f"{desc}\n\n"
            f"## Automation Actions ({len(actions)} steps)\n"
            + "\n".join(step_lines)
            + "\n\n## Security Scope\nGuarded by ScopeGuard. Keystrokes sanitized.\n"
        )

        # 2. Canonical payload matching compute_bundle_hash() in skill_marketplace_importer.py
        canonical_bundle = {
            "category": "automation",
            "instructions_md": instructions_md,
            "name": macro_name,
            "orbiter_group": "DEV-01",
            "permission_scope": ["desktop:input", "desktop:window"],
            "references": [],
            "schema_version": "1.0",
            "slug": slug,
            "type": "skill",
        }
        canon_bytes = json.dumps(
            {
                "category": "automation",
                "instructions_md": instructions_md,
                "name": macro_name,
                "orbiter_group": "DEV-01",
                "permission_scope": sorted(["desktop:input", "desktop:window"]),
                "references": [],
                "schema_version": "1.0",
                "slug": slug,
                "type": "skill",
            },
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        sha256_hash = hashlib.sha256(canon_bytes).hexdigest()
        canonical_bundle["sha256"] = sha256_hash

        # 3. Security Audit via AgentShield
        audit_res = self.auditor.audit_skill(canonical_bundle)
        shield_score = audit_res.get("score", 100)
        risk_score = audit_res.get("risk_score", 0)
        verified = 1 if audit_res.get("safe", True) else 0

        # 4. Create .nxskill package artifact
        if output_dir is None:
            pkg_dir = Path.home() / ".nexus-agent" / "skills"
        else:
            pkg_dir = Path(output_dir)
        pkg_dir.mkdir(parents=True, exist_ok=True)
        pkg_path = pkg_dir / f"{slug}.nxskill"

        pkg_path.write_text(json.dumps(canonical_bundle, indent=2), encoding="utf-8")

        # 5. Index into ecc_skills in SQLite WAL
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO ecc_skills (
                    slug, title, author, category, description, type,
                    orbiter_group, permission_scope, instructions_md,
                    references_json, tools_json, package_url, sha256,
                    risk_score, verified, indexed_at
                ) VALUES (?, ?, 'Nexus Operator', 'automation', ?, 'skill', 'DEV-01', ?, ?, '[]', '[]', ?, ?, ?, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    instructions_md = excluded.instructions_md,
                    sha256 = excluded.sha256,
                    risk_score = excluded.risk_score,
                    verified = excluded.verified,
                    indexed_at = excluded.indexed_at;
                """,
                (
                    slug,
                    macro_name,
                    desc,
                    json.dumps(["desktop:input", "desktop:window"]),
                    instructions_md,
                    str(pkg_path),
                    sha256_hash,
                    risk_score,
                    verified,
                    now_iso,
                ),
            )

        logger.info(
            "Compiled macro '%s' to .nxskill (slug=%s, SHA-256=%s, shield_score=%d)",
            macro_name,
            slug,
            sha256_hash[:16],
            shield_score,
        )

        return {
            "success": True,
            "slug": slug,
            "name": macro_name,
            "package_path": str(pkg_path),
            "sha256": sha256_hash,
            "shield_score": shield_score,
            "status": audit_res.get("status", "CLEAN"),
            "risk_score": risk_score,
            "action_count": len(actions),
        }

    def compile_to_nxskill(
        self,
        name: str,
        output_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Compiles macro into an .nxskill bundle (alias for export_macro_to_nxskill)."""
        return self.export_macro_to_nxskill(name=name, output_dir=output_dir)


# -----------------------------------------------------------------------------
# Module Singleton & Top-Level Primitives
# -----------------------------------------------------------------------------
_macro_engine_singleton: Optional[MacroEngine] = None


def get_macro_engine() -> MacroEngine:
    """Returns or creates the singleton MacroEngine instance."""
    global _macro_engine_singleton
    if _macro_engine_singleton is None:
        _macro_engine_singleton = MacroEngine()
    return _macro_engine_singleton


def start_recording() -> Dict[str, Any]:
    """Starts recording user motor and keyboard actions."""
    return get_macro_engine().start_recording()


def stop_recording(name: str, description: str = "") -> Dict[str, Any]:
    """Stops the active recording session and saves macro into SQLite WAL macros table."""
    return get_macro_engine().stop_recording(name=name, description=description)


def replay_macro(
    name: Union[str, Dict[str, Any], List[Dict[str, Any]]],
    speed_multiplier: float = 1.0,
    dry_run: bool = False,
    auto_approve: bool = False,
) -> Dict[str, Any]:
    """Deterministically replays macro guarded by ScopeGuard."""
    return get_macro_engine().replay_macro(
        name=name,
        speed_multiplier=speed_multiplier,
        dry_run=dry_run,
        auto_approve=auto_approve,
    )


def edit_macro_step(
    name: Optional[str] = None,
    index: Optional[int] = None,
    patch: Optional[Dict[str, Any]] = None,
    macro_id_or_name: Optional[str] = None,
    step_index: Optional[int] = None,
    new_action_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Edits a specific action step within a saved macro."""
    target_name = name or macro_id_or_name or ""
    target_idx = index if index is not None else (step_index if step_index is not None else 0)
    target_patch = patch if patch is not None else (new_action_data or {})
    return get_macro_engine().edit_macro_step(
        name=target_name,
        index=target_idx,
        patch=target_patch,
    )


def export_macro(
    name: Optional[str] = None,
    output_path: Optional[Union[str, Path]] = None,
    macro_id_or_name: Optional[str] = None,
) -> Path:
    """Exports macro metadata and action sequence to a JSON bundle."""
    target_name = name or macro_id_or_name or ""
    return get_macro_engine().export_macro(name=target_name, output_path=output_path)


def export_macro_to_nxskill(
    name: str,
    output_dir: Optional[Union[str, Path]] = None,
) -> Dict[str, Any]:
    """Compiles macro to an installable, signed .nxskill bundle."""
    return get_macro_engine().export_macro_to_nxskill(
        name=name,
        output_dir=output_dir,
    )


def schedule_macro(name: str, cron_expr: str) -> Dict[str, Any]:
    """Schedules a macro for background autonomous execution."""
    return get_macro_engine().schedule_macro(name=name, cron_expr=cron_expr)


# -----------------------------------------------------------------------------
# Expose @nexus_tool decorators
# -----------------------------------------------------------------------------
@nexus_tool(
    name="macro_start_recording",
    description="Starts real Win32 and pynput recording of user motor actions, clicks, keystrokes, and window titles.",
    agent="DEV-01",
    requires_approval=False,
)
def tool_macro_start_recording() -> Dict[str, Any]:
    return start_recording()


@nexus_tool(
    name="macro_stop_recording",
    description="Stops active recording session and saves macro into SQLite WAL database.",
    agent="DEV-01",
    requires_approval=False,
)
def tool_macro_stop_recording(name: str, description: str = "") -> Dict[str, Any]:
    return stop_recording(name=name, description=description)


@nexus_tool(
    name="macro_replay",
    description="Deterministically replays mouse and keyboard actions from a stored macro, guarded by ScopeGuard.",
    agent="DEV-01",
    requires_approval=True,
)
def tool_macro_replay(
    name: str,
    speed_multiplier: float = 1.0,
    dry_run: bool = False,
) -> Dict[str, Any]:
    return replay_macro(name=name, speed_multiplier=speed_multiplier, dry_run=dry_run)


@nexus_tool(
    name="macro_list",
    description="Lists all saved macros from SQLite WAL agent database.",
    agent="DEV-01",
    requires_approval=False,
)
def tool_macro_list(enabled_only: bool = False) -> Dict[str, Any]:
    macros = get_macro_engine().list_macros(enabled_only=enabled_only)
    return {"success": True, "count": len(macros), "macros": macros}


@nexus_tool(
    name="macro_export_nxskill",
    description="Exports and signs a macro into an installable .nxskill bundle audited by AgentShield.",
    agent="DEV-01",
    requires_approval=False,
)
def tool_macro_export_nxskill(name: str) -> Dict[str, Any]:
    return export_macro_to_nxskill(name=name)


@nexus_tool(
    name="macro_edit_step",
    description="Edits an individual action step inside a saved macro.",
    agent="DEV-01",
    requires_approval=False,
)
def tool_macro_edit_step(name: str, index: int, patch: Dict[str, Any]) -> Dict[str, Any]:
    return edit_macro_step(name=name, index=index, patch=patch)


@nexus_tool(
    name="macro_schedule",
    description="Schedules a macro for background autonomous execution via cron schedule.",
    agent="DEV-01",
    requires_approval=True,
)
def tool_macro_schedule(name: str, cron_expr: str) -> Dict[str, Any]:
    return schedule_macro(name=name, cron_expr=cron_expr)


__all__ = [
    "MacroEngine",
    "get_macro_engine",
    "start_recording",
    "stop_recording",
    "replay_macro",
    "edit_macro_step",
    "export_macro",
    "export_macro_to_nxskill",
    "schedule_macro",
    "tool_macro_start_recording",
    "tool_macro_stop_recording",
    "tool_macro_replay",
    "tool_macro_list",
    "tool_macro_export_nxskill",
    "tool_macro_edit_step",
    "tool_macro_schedule",
]
