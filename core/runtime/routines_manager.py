"""
Nexus OS v5.0 - Voice Routines & Macro Sequence Execution Engine.
Part of the Nexus Edge-to-Desktop Autonomous Engine.

Provides persistent SQLite-backed voice routine and deterministic macro management:
- Backed by ~/.nexus-agent/db/agent_local.db (SQLite WAL mode).
- Sub-50ms deterministic command sequence execution without LLM latency.
- Direct reflex dispatch for semicolon-delimited compound action sequences.
- Dynamic routine registration, removal, listing, and state toggling.
"""

from __future__ import annotations

import contextlib
import datetime
import json
import logging
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Union

from core.runtime.reflex_router import ReflexRouter, evaluate_and_execute

logger = logging.getLogger("nexus.runtime.routines_manager")


def tidy_desktop_reflex(dry_run: bool = False) -> str:
    """
    Organizes loose non-shortcut files on the Windows Desktop into
    ~/.nexus-agent/shelf/desktop_tidy to ensure an uncluttered workspace.
    """
    desktop_path = Path.home() / "Desktop"
    if not desktop_path.exists():
        return "Desktop path does not exist (simulated tidy)"

    shelf_tidy_dir = Path.home() / ".nexus-agent" / "shelf" / "desktop_tidy"
    try:
        shelf_tidy_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        return f"Could not create tidy staging shelf: {exc}"

    moved_count = 0
    try:
        for item in desktop_path.iterdir():
            # Skip folders, desktop.ini, and desktop application shortcuts (.lnk, .url)
            if not item.is_file():
                continue
            name_lower = item.name.lower()
            if name_lower in ("desktop.ini", "thumbs.db") or name_lower.endswith((".lnk", ".url")):
                continue

            target_path = shelf_tidy_dir / item.name
            if target_path.exists():
                stem = item.stem
                suffix = item.suffix
                target_path = shelf_tidy_dir / f"{stem}_{int(time.time())}{suffix}"

            if not dry_run:
                try:
                    shutil.move(str(item), str(target_path))
                    moved_count += 1
                except Exception as m_err:
                    logger.debug("Failed to move %s: %s", item.name, m_err)
            else:
                moved_count += 1

        return f"Desktop tidied: {moved_count} items staged to shelf"
    except Exception as exc:
        return f"Desktop tidy completed with notice: {exc}"


class RoutinesManager:
    """
    SQLite-backed Voice Routines and Deterministic Macro Engine for Nexus OS v5.0.

    Evaluates spoken utterances or text prompts against registered voice routines.
    On a match, executes semicolon-separated direct reflex action sequences
    with sub-50ms deterministic latency, bypassing LLM inference entirely.
    """

    def __init__(
        self,
        db_path: Optional[Union[str, Path]] = None,
        dry_run: bool = False,
        reflex_router: Optional[ReflexRouter] = None,
    ) -> None:
        self.dry_run = dry_run
        if db_path is None:
            self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        else:
            self.db_path = Path(db_path)

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.reflex_router = reflex_router or ReflexRouter(dry_run=self.dry_run)
        try:
            self.reflex_router._routines_manager = self
        except Exception:
            pass
        self._lock = threading.RLock()
        self._routines_cache: Dict[str, Dict[str, Any]] = {}

        self._init_db()
        self.seed_default_routines(force=False)
        self._refresh_cache()

    @contextlib.contextmanager
    def _get_connection(self):
        """Context manager yielding a configured SQLite connection with WAL mode."""
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
        """Initializes the voice_routines table and indexing structures."""
        with self._lock, self._get_connection() as conn:
            cols_info = conn.execute("PRAGMA table_info(voice_routines);").fetchall()
            if cols_info:
                pk_is_name = False
                for r in cols_info:
                    if r["name"] == "name" and r["pk"] == 1:
                        pk_is_name = True
                        break
                if not pk_is_name:
                    # Migrate existing table to canonical name TEXT PRIMARY KEY schema
                    conn.execute(
                        """
                        CREATE TABLE IF NOT EXISTS voice_routines_v2 (
                            name TEXT PRIMARY KEY,
                            trigger_phrase TEXT NOT NULL UNIQUE COLLATE NOCASE,
                            actions_json TEXT NOT NULL,
                            created_at TEXT NOT NULL,
                            enabled INTEGER NOT NULL DEFAULT 1,
                            action_sequence TEXT DEFAULT '',
                            last_triggered REAL DEFAULT NULL,
                            execution_count INTEGER NOT NULL DEFAULT 0,
                            description TEXT DEFAULT ''
                        );
                        """
                    )
                    legacy_rows = conn.execute("SELECT * FROM voice_routines;").fetchall()
                    for lrow in legacy_rows:
                        lkeys = lrow.keys()
                        lname = str(lrow["name"]) if "name" in lkeys and lrow["name"] else str(lrow["trigger_phrase"])
                        ltrigger = str(lrow["trigger_phrase"])
                        lseq = str(lrow["action_sequence"]) if "action_sequence" in lkeys else ""
                        if "actions_json" in lkeys and lrow["actions_json"]:
                            ljson = str(lrow["actions_json"])
                        else:
                            actions_list = [a.strip() for a in lseq.split(";") if a.strip()]
                            ljson = json.dumps(actions_list)
                        lcreated = str(lrow["created_at"]) if "created_at" in lkeys else datetime.datetime.now(datetime.timezone.utc).isoformat()
                        lenabled = int(lrow["enabled"]) if "enabled" in lkeys else 1
                        llast = lrow["last_triggered"] if "last_triggered" in lkeys else None
                        lcount = int(lrow["execution_count"]) if "execution_count" in lkeys else 0
                        ldesc = str(lrow["description"]) if "description" in lkeys else ""
                        conn.execute(
                            """
                            INSERT OR REPLACE INTO voice_routines_v2
                            (name, trigger_phrase, actions_json, created_at, enabled, action_sequence, last_triggered, execution_count, description)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                            """,
                            (lname, ltrigger, ljson, lcreated, lenabled, lseq, llast, lcount, ldesc),
                        )
                    conn.execute("DROP TABLE voice_routines;")
                    conn.execute("ALTER TABLE voice_routines_v2 RENAME TO voice_routines;")
            else:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS voice_routines (
                        name TEXT PRIMARY KEY,
                        trigger_phrase TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        actions_json TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        enabled INTEGER NOT NULL DEFAULT 1,
                        action_sequence TEXT DEFAULT '',
                        last_triggered REAL DEFAULT NULL,
                        execution_count INTEGER NOT NULL DEFAULT 0,
                        description TEXT DEFAULT ''
                    );
                    """
                )

            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_voice_routines_trigger
                ON voice_routines(trigger_phrase);
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_voice_routines_enabled
                ON voice_routines(enabled);
                """
            )

    def _refresh_cache(self) -> None:
        """Loads all enabled routines into fast in-memory cache for sub-millisecond evaluation."""
        try:
            with self._lock, self._get_connection() as conn:
                rows = conn.execute(
                    "SELECT * FROM voice_routines WHERE enabled = 1 ORDER BY rowid ASC;"
                ).fetchall()
                new_cache: Dict[str, Dict[str, Any]] = {}
                for row in rows:
                    r_dict = self._row_to_dict(row)
                    trigger = (r_dict.get("trigger_phrase") or "").strip().lower()
                    name = (r_dict.get("name") or "").strip().lower()
                    new_cache[trigger] = r_dict
                    if name != trigger:
                        new_cache[name] = r_dict
                self._routines_cache = new_cache
        except Exception as exc:
            logger.debug("Routines cache refresh notice: %s", exc)

    def seed_default_routines(self, force: bool = False) -> int:
        """
        Seeds standard out-of-the-box routines if none currently exist,
        enabling immediate macro execution on clean installations.
        """
        default_routines = [
            ("Start Dev Mode", "Start Dev Mode", ["launch VSCode", "adjust brightness 85"], "Launches VSCode and raises display brightness for development"),
            ("Focus Mode", "Focus Mode", ["mute audio", "keep awake"], "Mutes system audio and engages Win32 power keep-awake lock"),
            ("Tidy Workstation", "Tidy Workstation", ["tidy desktop", "mute audio"], "Cleans loose desktop clutter to staging shelf and silences audio"),
            ("End of Day", "End of Day", ["allow sleep", "lock workstation"], "Restores normal sleep power states and locks workstation session"),
            ("Late Night Focus", "Late Night Focus", ["adjust brightness 40", "mute audio"], "Dimmest brightness and mutes master volume for nighttime work"),
            ("Good Morning", "Good Morning", ["adjust brightness 80", "unmute audio"], "Restores daytime brightness and enables workstation audio"),
            ("Wrap up my day", "Wrap up my day", ["tidy desktop", "allow sleep", "lock workstation"], "Tidies desktop files and locks workstation for the evening"),
            ("Lockdown", "Lockdown", ["mute audio", "lock workstation"], "Instantly silences audio and locks workstation session"),
        ]

        count = 0
        with self._lock, self._get_connection() as conn:
            if not force:
                row = conn.execute("SELECT COUNT(*) AS cnt FROM voice_routines;").fetchone()
                if row and row["cnt"] > 0:
                    return 0

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            for name, trigger, actions, desc in default_routines:
                actions_str = json.dumps(actions) if isinstance(actions, list) else str(actions)
                seq_str = "; ".join(actions) if isinstance(actions, list) else str(actions)
                try:
                    cursor = conn.execute(
                        """
                        INSERT INTO voice_routines (name, trigger_phrase, actions_json, created_at, enabled, action_sequence, execution_count, description)
                        VALUES (?, ?, ?, ?, 1, ?, 0, ?)
                        ON CONFLICT(name) DO NOTHING;
                        """,
                        (name.strip(), trigger.strip(), actions_str, now_iso, seq_str, desc.strip()),
                    )
                    if cursor.rowcount > 0:
                        count += 1
                except Exception as exc:
                    logger.debug("Routine seed notice (%s): %s", trigger, exc)
        return count

    def create_routine(
        self,
        name: str,
        trigger_phrase: str,
        actions_json: Union[str, List[Any]],
        created_at: Optional[str] = None,
        enabled: bool = True,
        description: str = "",
    ) -> Dict[str, Any]:
        """
        Creates or updates a voice routine in the database.

        Args:
            name: Unique canonical routine identifier / primary key.
            trigger_phrase: Natural language phrase or wake command (e.g. 'Deploy Production').
            actions_json: JSON string or list of action definitions/strings.
            created_at: Optional ISO timestamp string (defaults to UTC now).
            enabled: Initial enabled state (default True).
            description: Optional human-readable purpose description.

        Returns:
            Dictionary representing the stored routine.
        """
        if not name or not str(name).strip():
            raise ValueError("name must be a non-empty string.")
        if not trigger_phrase or not str(trigger_phrase).strip():
            raise ValueError("trigger_phrase must be a non-empty string.")
        if actions_json is None or (isinstance(actions_json, str) and not str(actions_json).strip()):
            raise ValueError("actions_json must not be empty.")

        clean_name = str(name).strip()
        clean_trigger = str(trigger_phrase).strip()
        clean_desc = str(description).strip() if description else ""
        enabled_val = 1 if enabled else 0
        now_iso = created_at or datetime.datetime.now(datetime.timezone.utc).isoformat()

        if isinstance(actions_json, list):
            actions_str = json.dumps(actions_json)
            seq_str = "; ".join(str(a) for a in actions_json)
        else:
            raw_s = str(actions_json).strip()
            if raw_s.startswith("["):
                try:
                    parsed = json.loads(raw_s)
                    actions_str = json.dumps(parsed)
                    seq_str = "; ".join(str(a) for a in parsed)
                except Exception:
                    actions_str = json.dumps([raw_s])
                    seq_str = raw_s
            elif ";" in raw_s:
                items = [a.strip() for a in raw_s.split(";") if a.strip()]
                actions_str = json.dumps(items)
                seq_str = raw_s
            else:
                actions_str = json.dumps([raw_s])
                seq_str = raw_s

        with self._lock, self._get_connection() as conn:
            # Check if routine with this trigger_phrase already exists under another name
            existing = conn.execute(
                "SELECT name FROM voice_routines WHERE trigger_phrase = ? COLLATE NOCASE;",
                (clean_trigger,),
            ).fetchone()
            target_pk = existing["name"] if existing and existing["name"] != clean_name and not name.strip() else clean_name

            conn.execute(
                """
                INSERT INTO voice_routines (name, trigger_phrase, actions_json, created_at, enabled, action_sequence, execution_count, description)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(name) DO UPDATE SET
                    trigger_phrase = excluded.trigger_phrase,
                    actions_json = excluded.actions_json,
                    enabled = excluded.enabled,
                    action_sequence = excluded.action_sequence,
                    description = CASE WHEN excluded.description != '' THEN excluded.description ELSE voice_routines.description END;
                """,
                (target_pk, clean_trigger, actions_str, now_iso, enabled_val, seq_str, clean_desc),
            )
            row = conn.execute(
                "SELECT * FROM voice_routines WHERE name = ?;",
                (target_pk,),
            ).fetchone()

            if not row:
                raise RuntimeError(f"Failed to retrieve registered routine '{target_pk}'")

            result_dict = self._row_to_dict(row)

        self._refresh_cache()
        return result_dict

    def register_routine(
        self,
        trigger_phrase: str,
        action_sequence: Optional[str] = None,
        enabled: bool = True,
        description: str = "",
        name: Optional[str] = None,
        actions_json: Optional[Union[str, List[Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Registers or updates a voice routine in the database.

        Args:
            trigger_phrase: Natural language phrase or wake command (e.g. 'Start Dev Mode').
            action_sequence: Semicolon-delimited sequence of reflex actions (e.g. 'launch VSCode; tidy desktop').
            enabled: Initial enabled state (default True).
            description: Optional human-readable purpose description.
            name: Optional explicit routine name (defaults to trigger_phrase).
            actions_json: Optional JSON string or list of reflex actions.

        Returns:
            Dictionary representing the stored routine.
        """
        if not trigger_phrase or not str(trigger_phrase).strip():
            raise ValueError("trigger_phrase must be a non-empty string.")

        target_actions = actions_json if actions_json is not None else action_sequence
        if target_actions is None or (isinstance(target_actions, str) and not str(target_actions).strip()):
            raise ValueError("action_sequence or actions_json must be a non-empty string.")

        routine_name = str(name).strip() if name and str(name).strip() else str(trigger_phrase).strip()
        return self.create_routine(
            name=routine_name,
            trigger_phrase=str(trigger_phrase).strip(),
            actions_json=target_actions,
            enabled=enabled,
            description=description,
        )

    def evaluate(self, phrase: str) -> bool:
        """
        Queries voice_routines for trigger_phrase; splits action_sequence on ';'
        and executes direct reflex actions. Returns True on match, False otherwise.

        Args:
            phrase: Spoken input string or user text command.

        Returns:
            bool: True if a routine matched and was executed; False otherwise.
        """
        res = self.evaluate_detailed(phrase)
        return res["matched"]

    def evaluate_detailed(self, phrase: str) -> Dict[str, Any]:
        """
        Full diagnostic evaluation of an input phrase against registered routines.
        Executes matched reflex actions and returns full structured telemetry.
        """
        start_time = time.perf_counter()
        if not phrase or not isinstance(phrase, str):
            return {
                "matched": False,
                "routine": None,
                "actions": [],
                "results": [],
                "latency_ms": 0.0,
                "error": "Empty phrase provided",
            }

        clean_input = phrase.strip().lower()
        if not clean_input:
            return {
                "matched": False,
                "routine": None,
                "actions": [],
                "results": [],
                "latency_ms": 0.0,
            }

        # Wake word prefix stripping for natural voice input
        stripped_prefix = re.sub(
            r"^(?:hey\s+nexus|nexus|ok\s+nexus|computer)[,\s:]+",
            "",
            clean_input,
        ).strip()
        stripped_punct = clean_input.strip(".!?,")

        matched_routine: Optional[Dict[str, Any]] = None

        # 1. Fast in-memory cache lookup (<0.2ms)
        for trigger, r_dict in list(self._routines_cache.items()):
            trigger_punct = trigger.strip(".!?,")
            if (
                clean_input == trigger
                or (stripped_prefix and stripped_prefix == trigger)
                or (stripped_punct and stripped_punct == trigger_punct)
            ):
                matched_routine = dict(r_dict)
                break

        # 2. Cache miss fallback: refresh cache from DB once and re-check
        if not matched_routine:
            self._refresh_cache()
            for trigger, r_dict in list(self._routines_cache.items()):
                trigger_punct = trigger.strip(".!?,")
                if (
                    clean_input == trigger
                    or (stripped_prefix and stripped_prefix == trigger)
                    or (stripped_punct and stripped_punct == trigger_punct)
                ):
                    matched_routine = dict(r_dict)
                    break

        if not matched_routine:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
            return {
                "matched": False,
                "routine": None,
                "actions": [],
                "results": [],
                "latency_ms": latency_ms,
            }

        # Update in-memory stats immediately
        new_count = matched_routine.get("execution_count", 0) + 1
        now_ts = time.time()
        matched_routine["execution_count"] = new_count
        matched_routine["last_triggered"] = now_ts
        for k in (matched_routine.get("trigger_phrase", "").lower(), matched_routine.get("name", "").lower()):
            if k in self._routines_cache:
                self._routines_cache[k]["execution_count"] = new_count
                self._routines_cache[k]["last_triggered"] = now_ts

        # Asynchronously persist stats to SQLite WAL so disk commit does NOT block <50ms reflex SLA
        def _async_update(r_name: str, ts: float):
            try:
                with self._lock, self._get_connection() as conn:
                    conn.execute(
                        """
                        UPDATE voice_routines
                        SET last_triggered = ?, execution_count = execution_count + 1
                        WHERE name = ?;
                        """,
                        (ts, r_name),
                    )
            except Exception as e:
                logger.debug("Async routine stats persistence notice: %s", e)

        threading.Thread(target=_async_update, args=(matched_routine["name"], now_ts), daemon=True).start()

        # Compound reflex batch execution from actions_json or action_sequence
        actions: List[str] = []
        if matched_routine.get("actions_json"):
            try:
                parsed = json.loads(matched_routine["actions_json"])
                if isinstance(parsed, list):
                    actions = [str(a).strip() for a in parsed if str(a).strip()]
            except Exception:
                logger.debug("Failed parsing actions_json in evaluate_detailed")
        if not actions and matched_routine.get("action_sequence"):
            actions = [a.strip() for a in matched_routine["action_sequence"].split(";") if a.strip()]

        action_results: List[Dict[str, Any]] = []
        for action in actions:
            res = self.execute_action(action)
            action_results.append(res)

        latency_ms = round((time.perf_counter() - start_time) * 1000, 3)
        return {
            "matched": True,
            "routine": matched_routine,
            "actions": actions,
            "results": action_results,
            "latency_ms": latency_ms,
        }

    def execute_action(self, action: str) -> Dict[str, Any]:
        """
        Executes an individual reflex action within a routine sequence.
        Supports delays ('sleep 1', 'wait 500ms'), desktop tidying ('tidy desktop'),
        application launches, and Win32 hardware reflexes via ReflexRouter.
        """
        t0 = time.perf_counter()
        act_clean = action.strip()
        act_lower = act_clean.lower()

        # 1. Delay / Sleep primitive
        sleep_match = re.match(r"^(?:sleep|wait|pause)\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds|ms|milli|millis|milliseconds)?$", act_lower)
        if sleep_match:
            val = float(sleep_match.group(1))
            unit = sleep_match.group(2) or "s"
            duration_sec = val / 1000.0 if unit.startswith("m") else val
            duration_sec = max(0.01, min(duration_sec, 5.0))  # Guardrail: max 5s per step
            if not self.dry_run:
                time.sleep(duration_sec)
            lat = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "action": act_clean,
                "type": "PAUSE",
                "success": True,
                "result": f"Paused for {duration_sec}s",
                "latency_ms": lat,
            }

        # 2. Tidy Desktop Reflex
        if act_lower in ("tidy desktop", "tidy the desktop", "clean desktop", "clean the desktop"):
            msg = tidy_desktop_reflex(dry_run=self.dry_run)
            lat = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "action": act_clean,
                "type": "TIDY_DESKTOP",
                "success": True,
                "result": msg,
                "latency_ms": lat,
            }

        # 3. Normalized app launch alias for VS Code
        if re.match(r"^(?:launch|open)\s+(?:vscode|vs\s*code)$", act_lower):
            act_clean = "launch code"

        # 4. Win32 Reflex Router Dispatch
        res = self.reflex_router.evaluate_and_execute(act_clean)
        lat = round((time.perf_counter() - t0) * 1000, 2)
        success = res.get("status") == "SUCCESS" or bool(res.get("success", False))

        return {
            "action": act_clean,
            "type": res.get("action") or "REFLEX_DISPATCH",
            "success": success,
            "result": res.get("result") or res.get("output") or res.get("error", "Executed"),
            "latency_ms": lat,
        }

    def execute_routine(self, routine_id: Union[int, str]) -> Dict[str, Any]:
        """
        Directly executes all actions in a routine without requiring voice prompt evaluation.
        Used for UI test/play buttons.
        """
        routine = self.get_routine(routine_id)
        if not routine:
            return {
                "success": False,
                "error": f"Routine not found: {routine_id}",
            }

        actions: List[str] = []
        if routine.get("actions_json"):
            try:
                parsed = json.loads(routine["actions_json"])
                if isinstance(parsed, list):
                    actions = [str(a).strip() for a in parsed if str(a).strip()]
            except Exception:
                logger.debug("Failed parsing actions_json in execute_routine")
        if not actions and routine.get("action_sequence"):
            actions = [a.strip() for a in routine["action_sequence"].split(";") if a.strip()]

        results: List[Dict[str, Any]] = []
        t0 = time.perf_counter()

        for action in actions:
            results.append(self.execute_action(action))

        # Update last triggered & execution count
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                UPDATE voice_routines
                SET last_triggered = ?, execution_count = execution_count + 1
                WHERE name = ?;
                """,
                (time.time(), routine["name"]),
            )

        latency_ms = round((time.perf_counter() - t0) * 1000, 3)
        return {
            "success": True,
            "routine": routine,
            "actions": actions,
            "results": results,
            "latency_ms": latency_ms,
        }

    def list_routines(self, enabled_only: bool = False) -> List[Dict[str, Any]]:
        """
        Lists all registered routines from the database.

        Args:
            enabled_only: If True, returns only routines currently enabled.

        Returns:
            List of dictionary routine records.
        """
        query = "SELECT * FROM voice_routines"
        if enabled_only:
            query += " WHERE enabled = 1"
        query += " ORDER BY rowid ASC;"

        with self._lock, self._get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_routine(self, routine_id: Union[int, str]) -> Optional[Dict[str, Any]]:
        """Retrieves a single routine by its name, trigger phrase, or ID."""
        target = str(routine_id).strip()
        with self._lock, self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM voice_routines WHERE name = ? OR trigger_phrase = ? COLLATE NOCASE;",
                (target, target),
            ).fetchone()
            return self._row_to_dict(row) if row else None

    def toggle_routine(self, routine_id: Union[int, str], enabled: Optional[bool] = None) -> bool:
        """
        Toggles or explicitly sets the enabled status of a voice routine.

        Args:
            routine_id: Routine name, trigger phrase, or ID.
            enabled: If provided, explicitly sets state; if None, inverts current state.

        Returns:
            bool: True if updated, False if routine was not found.
        """
        existing = self.get_routine(routine_id)
        if not existing:
            return False

        current_val = 1 if existing["enabled"] else 0
        new_val = (1 if enabled else 0) if enabled is not None else (0 if current_val == 1 else 1)

        with self._lock, self._get_connection() as conn:
            res = conn.execute(
                "UPDATE voice_routines SET enabled = ? WHERE name = ?;",
                (new_val, existing["name"]),
            )
            updated = res.rowcount > 0

        if updated:
            self._refresh_cache()
        return updated

    def toggle_enabled(self, routine_id: Union[int, str], enabled: Optional[bool] = None) -> bool:
        """Convenience alias for toggle_routine."""
        return self.toggle_routine(routine_id, enabled=enabled)

    def remove_routine(self, routine_id: Union[int, str]) -> bool:
        """
        Removes a voice routine from the database.

        Args:
            routine_id: Routine name, trigger phrase, or ID.

        Returns:
            bool: True if deleted, False if routine was not found.
        """
        target = str(routine_id).strip()
        with self._lock, self._get_connection() as conn:
            res = conn.execute(
                "DELETE FROM voice_routines WHERE name = ? OR trigger_phrase = ? COLLATE NOCASE;",
                (target, target),
            )
            deleted = res.rowcount > 0

        if deleted:
            self._refresh_cache()
        return deleted

    def delete_routine(self, routine_id: Union[int, str]) -> bool:
        """Convenience alias for remove_routine."""
        return self.remove_routine(routine_id)

    def clear_all_routines(self) -> int:
        """Deletes all routines from the database. Returns count of deleted routines."""
        with self._lock, self._get_connection() as conn:
            res = conn.execute("DELETE FROM voice_routines;")
            count = res.rowcount
        self._refresh_cache()
        return count

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        """Converts an SQLite row to a standardized dictionary."""
        name = str(row["name"]) if "name" in row.keys() else str(row["id"])
        trigger = str(row["trigger_phrase"]) if "trigger_phrase" in row.keys() else ""
        actions_json = str(row["actions_json"]) if "actions_json" in row.keys() else "[]"
        action_seq = str(row["action_sequence"]) if "action_sequence" in row.keys() else ""
        if not action_seq and actions_json:
            try:
                parsed = json.loads(actions_json)
                if isinstance(parsed, list):
                    action_seq = "; ".join(str(p) for p in parsed)
            except Exception:
                action_seq = actions_json
        return {
            "name": name,
            "id": name,
            "trigger_phrase": trigger,
            "actions_json": actions_json,
            "action_sequence": action_seq,
            "enabled": bool(row["enabled"]) if "enabled" in row.keys() else True,
            "created_at": str(row["created_at"]) if "created_at" in row.keys() else "",
            "last_triggered": row["last_triggered"] if "last_triggered" in row.keys() else None,
            "execution_count": int(row["execution_count"]) if "execution_count" in row.keys() else 0,
            "description": str(row["description"]) if "description" in row.keys() else "",
        }
