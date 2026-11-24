"""Nexus OS v5.0 - ECC Context Keeper (/ck).

Directly adapted from affaan-m/ECC Context Keeper architecture:
- ck_init: Detects project stack markers (pyproject.toml, package.json, Cargo.toml, go.mod, git rev-parse HEAD)
- ck_save: Persists goals, left_off, next steps, decisions, blockers, active_files, and git_head
- ck_resume: Generates deterministic <=120-token startup brief and detects git drift via status --porcelain
- ck_info & ck_list: Querying and context management
- record_instinct & promote_instinct: Verified solution capture and promotion to /skill:<slug>

Backed by SQLite WAL (~/.nexus-agent/db/agent_local.db).
Zero mocks, production-grade implementation.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from core.memory.sovereign_store import SovereignMemoryStore

logger = logging.getLogger("nexus.memory.context_keeper")


def _run_git_cmd(args: List[str], cwd: Path) -> str:
    """Executes a git command safely and returns stripped stdout, or empty on failure."""
    try:
        res = subprocess.run(
            ["git", "--no-optional-locks", "-C", str(cwd)] + args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5.0,
            encoding="utf-8",
            errors="replace",
        )
        if res.returncode == 0:
            return res.stdout.strip()
        logger.debug("Git command failed [%s]: %s", res.returncode, res.stderr)
    except Exception as exc:
        logger.debug("Git command exception: %s", exc)
    return ""


def _get_git_state(project_path: Union[str, Path]) -> Tuple[str, bool]:
    """Runs git rev-parse --short HEAD and git status --porcelain, returning (head, has_uncommitted)."""
    p = Path(project_path).resolve()
    head = _run_git_cmd(["rev-parse", "--short", "HEAD"], p) or _run_git_cmd(["rev-parse", "HEAD"], p)
    status = _run_git_cmd(["status", "--porcelain"], p)
    return head, bool(status.strip())


def detect_project_stack(project_path: Union[str, Path]) -> List[str]:
    """Detects technologies and frameworks present in project directory."""
    p = Path(project_path).resolve()
    stack: List[str] = []
    if not p.exists() or not p.is_dir():
        return ["generic"]

    if (p / "pyproject.toml").exists() or (p / "requirements.txt").exists():
        stack.append("python")
    if (p / "package.json").exists():
        stack.append("node")
        try:
            with open(p / "package.json", "r", encoding="utf-8") as f:
                pj = json.load(f)
                deps = {**pj.get("dependencies", {}), **pj.get("devDependencies", {})}
                if "typescript" in deps or (p / "tsconfig.json").exists():
                    stack.append("typescript")
                if "react" in deps:
                    stack.append("react")
                if "next" in deps:
                    stack.append("nextjs")
                if "electron" in deps or "electron-vite" in deps:
                    stack.append("electron")
        except Exception:
            pass

    if (p / "Cargo.toml").exists():
        stack.append("rust")
    if (p / "go.mod").exists():
        stack.append("go")
    if (p / "wrangler.toml").exists():
        stack.append("cloudflare")
    if (p / "pom.xml").exists() or (p / "build.gradle").exists() or (p / "build.gradle.kts").exists():
        stack.append("jvm")

    if not stack:
        stack.append("generic")

    return sorted(list(set(stack)))


class ContextKeeper:
    """ECC-compatible Context Keeper engine for project session continuity and <=120-token briefs."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None) -> None:
        if db_path is None:
            self.store = SovereignMemoryStore()
            self.db_path = self.store.db_path
        else:
            self.store = SovereignMemoryStore(db_path=db_path)
            self.db_path = Path(db_path)

        self.skills_dir = (
            self.db_path.parent.parent / "skills"
            if str(self.db_path) != ":memory:"
            else (Path.cwd() / "skills")
        )
        self._cached_conn: Optional[sqlite3.Connection] = None
        self._ensure_tables()

    def _get_connection(self) -> sqlite3.Connection:
        if self._cached_conn is None:
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
            except Exception:
                pass
            self._cached_conn = None

    def _ensure_tables(self) -> None:
        """Verifies project_contexts and learned_instincts table structures."""
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS project_contexts (
                    project_path TEXT PRIMARY KEY,
                    project_name TEXT,
                    workspace_mode TEXT NOT NULL,
                    stack_json TEXT NOT NULL,
                    goal TEXT,
                    left_off TEXT,
                    next_steps_json TEXT,
                    decisions_json TEXT,
                    blockers_json TEXT,
                    git_head TEXT,
                    branch TEXT,
                    summary TEXT,
                    active_files_json TEXT,
                    open_tasks_json TEXT,
                    updated_at TEXT NOT NULL
                );
                """
            )
            # Safe schema upgrades for older schema migrations
            for col, col_def in [
                ("project_name", "TEXT"),
                ("branch", "TEXT"),
                ("summary", "TEXT"),
                ("active_files_json", "TEXT"),
                ("open_tasks_json", "TEXT"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE project_contexts ADD COLUMN {col} {col_def};")
                except Exception:
                    pass

            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learned_instincts (
                    id TEXT PRIMARY KEY,
                    skill_slug TEXT,
                    title TEXT,
                    trigger_pattern TEXT NOT NULL,
                    description TEXT,
                    code_snippet TEXT,
                    language TEXT DEFAULT 'python',
                    tags_json TEXT,
                    confidence_score REAL NOT NULL DEFAULT 0.85,
                    verified_success INTEGER DEFAULT 1,
                    workspace_mode TEXT NOT NULL DEFAULT 'DEV',
                    hit_count INTEGER NOT NULL DEFAULT 1,
                    source_slice_id TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT ''
                );
                """
            )
            for col, col_def in [
                ("skill_slug", "TEXT"),
                ("title", "TEXT"),
                ("instinct_rule", "TEXT DEFAULT ''"),
                ("description", "TEXT"),
                ("code_snippet", "TEXT"),
                ("language", "TEXT DEFAULT 'python'"),
                ("tags_json", "TEXT"),
                ("verified_success", "INTEGER DEFAULT 1"),
                ("updated_at", "TEXT NOT NULL DEFAULT ''"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE learned_instincts ADD COLUMN {col} {col_def};")
                except Exception:
                    pass

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
                    VALUES (new.id, new.trigger_pattern, COALESCE(new.instinct_rule, new.description, new.title, ''), new.workspace_mode);
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
                    VALUES (new.id, new.trigger_pattern, COALESCE(new.instinct_rule, new.description, new.title, ''), new.workspace_mode);
                END;
                """
            )

            conn.commit()

    def ck_init(
        self,
        project_path: Optional[str] = None,
        workspace_mode: str = "DEV",
        goal: str = "",
        *,
        project_name: Optional[str] = None,
        project_root: Optional[str] = None,
        summary: str = "",
        branch: str = "",
    ) -> Dict[str, Any]:
        """Initializes or updates a project context with detected stack, optional goal, and git status."""
        target_path = project_path or project_root or project_name or str(Path.cwd())
        p = Path(target_path).resolve()
        p_str = str(p)
        proj_name = project_name or p.name
        mode = (workspace_mode or "DEV").strip().upper()

        stack = detect_project_stack(p)
        git_head = _run_git_cmd(["rev-parse", "HEAD"], p)
        git_branch = branch or _run_git_cmd(["rev-parse", "--abbrev-ref", "HEAD"], p) or "main"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO project_contexts (
                    project_path, project_name, workspace_mode, stack_json, goal, left_off,
                    next_steps_json, decisions_json, blockers_json, git_head, branch, summary,
                    active_files_json, open_tasks_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_path) DO UPDATE SET
                    project_name = excluded.project_name,
                    workspace_mode = excluded.workspace_mode,
                    stack_json = excluded.stack_json,
                    goal = COALESCE(NULLIF(excluded.goal, ''), project_contexts.goal),
                    git_head = excluded.git_head,
                    branch = COALESCE(NULLIF(excluded.branch, ''), project_contexts.branch),
                    summary = COALESCE(NULLIF(excluded.summary, ''), project_contexts.summary),
                    updated_at = excluded.updated_at;
                """,
                (
                    p_str,
                    proj_name,
                    mode,
                    json.dumps(stack),
                    goal or summary or f"Active development on {proj_name}",
                    "Initialized Context Keeper",
                    json.dumps(["Verify stack and run initial baseline test"]),
                    json.dumps([]),
                    json.dumps([]),
                    git_head,
                    git_branch,
                    summary,
                    json.dumps([]),
                    json.dumps([]),
                    now_iso,
                ),
            )
            conn.commit()

        return {
            "success": True,
            "project_name": proj_name,
            "project_path": p_str,
            "workspace_mode": mode,
            "stack": stack,
            "git_head": git_head,
            "branch": git_branch,
            "summary": summary,
            "updated_at": now_iso,
        }

    def ck_save(
        self,
        project_path: Optional[str] = None,
        goal: str = "",
        left_off: str = "",
        next_steps: Optional[List[str]] = None,
        decisions: Optional[List[str]] = None,
        blockers: Optional[List[str]] = None,
        *,
        project_name: Optional[str] = None,
        active_files: Optional[List[str]] = None,
        open_tasks: Optional[List[str]] = None,
        summary: str = "",
    ) -> Dict[str, Any]:
        """Saves session progress, decisions, blockers, active files, open tasks, and git head."""
        target_path = project_path
        proj_name = project_name

        with self._get_connection() as conn:
            if not target_path and proj_name:
                row = conn.execute(
                    "SELECT project_path FROM project_contexts WHERE project_name = ? LIMIT 1;",
                    (proj_name,),
                ).fetchone()
                if row:
                    target_path = row["project_path"]
                else:
                    target_path = str(Path.cwd() / proj_name)

            p = Path(target_path or str(Path.cwd())).resolve()
            p_str = str(p)
            if not proj_name:
                proj_name = p.name

            git_head = _run_git_cmd(["rev-parse", "HEAD"], p)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            row = conn.execute(
                "SELECT * FROM project_contexts WHERE project_path = ? OR project_name = ?",
                (p_str, proj_name),
            ).fetchone()

            if not row:
                stack = detect_project_stack(p)
                conn.execute(
                    """
                    INSERT INTO project_contexts (
                        project_path, project_name, workspace_mode, stack_json, goal, left_off,
                        next_steps_json, decisions_json, blockers_json, git_head, branch, summary,
                        active_files_json, open_tasks_json, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        p_str,
                        proj_name,
                        "DEV",
                        json.dumps(stack),
                        goal or summary or f"Work on {proj_name}",
                        left_off or "Saved checkpoint",
                        json.dumps(next_steps or open_tasks or []),
                        json.dumps(decisions or []),
                        json.dumps(blockers or []),
                        git_head,
                        "main",
                        summary,
                        json.dumps(active_files or []),
                        json.dumps(open_tasks or []),
                        now_iso,
                    ),
                )
            else:
                updated_goal = goal if goal else (row["goal"] or summary or "")
                updated_left_off = left_off if left_off else (row["left_off"] or "")
                updated_steps = next_steps if next_steps is not None else json.loads(row["next_steps_json"] or "[]")
                updated_decisions = decisions if decisions is not None else json.loads(row["decisions_json"] or "[]")
                updated_blockers = blockers if blockers is not None else json.loads(row["blockers_json"] or "[]")
                cur_active = active_files if active_files is not None else json.loads(row["active_files_json"] or "[]")
                cur_tasks = open_tasks if open_tasks is not None else json.loads(row["open_tasks_json"] or "[]")

                conn.execute(
                    """
                    UPDATE project_contexts
                    SET project_name = ?, goal = ?, left_off = ?, next_steps_json = ?,
                        decisions_json = ?, blockers_json = ?, git_head = ?, summary = ?,
                        active_files_json = ?, open_tasks_json = ?, updated_at = ?
                    WHERE project_path = ?;
                    """,
                    (
                        proj_name,
                        updated_goal,
                        updated_left_off,
                        json.dumps(updated_steps),
                        json.dumps(updated_decisions),
                        json.dumps(updated_blockers),
                        git_head or row["git_head"],
                        summary or row["summary"] or "",
                        json.dumps(cur_active),
                        json.dumps(cur_tasks),
                        now_iso,
                        row["project_path"],
                    ),
                )
            conn.commit()

        af_count = len(active_files or [])
        ot_count = len(open_tasks or [])
        return {
            "success": True,
            "project_name": proj_name,
            "project_path": p_str,
            "active_files_count": af_count,
            "open_tasks_count": ot_count,
            "active_files": active_files or [],
            "open_tasks": open_tasks or [],
            "git_head": git_head,
            "updated_at": now_iso,
        }

    def ck_resume(
        self,
        project_path: Optional[str] = None,
        *,
        project_name: Optional[str] = None,
        check_drift: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Generates deterministic <=120-token startup brief and checks for git drift."""
        target_path = project_path
        proj_name = project_name

        with self._get_connection() as conn:
            if not target_path and proj_name:
                row = conn.execute(
                    "SELECT * FROM project_contexts WHERE project_name = ? LIMIT 1;",
                    (proj_name,),
                ).fetchone()
            elif target_path:
                p_cand = str(Path(target_path).resolve())
                row = conn.execute(
                    "SELECT * FROM project_contexts WHERE project_path = ? OR project_name = ? LIMIT 1;",
                    (p_cand, target_path),
                ).fetchone()
            else:
                row = conn.execute("SELECT * FROM project_contexts ORDER BY updated_at DESC LIMIT 1;").fetchone()

        if not row:
            if target_path:
                self.ck_init(target_path, project_name=proj_name)
                return self.ck_resume(target_path, project_name=proj_name, check_drift=check_drift)
            return {"success": False, "found": False, "error": "No project context recorded"}

        row_dict = dict(row)
        p_str = row_dict["project_path"]
        p = Path(p_str)
        proj_name = row_dict.get("project_name") or p.name
        mode = row_dict.get("workspace_mode", "DEV")
        branch = row_dict.get("branch") or "main"
        summary = row_dict.get("summary") or ""

        stack = json.loads(row_dict.get("stack_json") or "[]")
        next_steps = json.loads(row_dict.get("next_steps_json") or "[]")
        decisions = json.loads(row_dict.get("decisions_json") or "[]")
        blockers = json.loads(row_dict.get("blockers_json") or "[]")
        active_files = json.loads(row_dict.get("active_files_json") or "[]")
        open_tasks = json.loads(row_dict.get("open_tasks_json") or "[]")
        saved_head = row_dict.get("git_head") or ""

        # Drift detection: run git checks if explicitly requested or when a specific project_path is inspected
        do_drift = bool(project_path) if check_drift is None else bool(check_drift)
        if do_drift:
            current_head = _run_git_cmd(["rev-parse", "HEAD"], p) or saved_head
            porcelain_status = _run_git_cmd(["status", "--porcelain"], p)
            has_unsaved_drift = bool(
                (saved_head and current_head and saved_head != current_head) or porcelain_status.strip()
            )
            drift_reason = ""
            if saved_head and current_head and saved_head != current_head:
                drift_reason = f"Git HEAD changed from {saved_head[:7]} to {current_head[:7]}"
            elif porcelain_status.strip():
                drift_reason = "Uncommitted working tree changes detected"
        else:
            current_head = saved_head
            porcelain_status = ""
            has_unsaved_drift = False
            drift_reason = ""

        # Assemble compact <=120-token brief matching ECC format
        stack_str = "+".join(stack[:3])
        goal = (row_dict.get("goal") or "Development")[:50]
        left_off = (row_dict.get("left_off") or "None")[:50]
        drift_badge = "[DRIFT: Uncommitted]" if has_unsaved_drift else "[SYNC: Clean]"

        brief_lines = [
            f"[CK:RESUME | {proj_name} | {mode} | {stack_str}] {drift_badge}",
            f"Branch: {branch} | Head: {current_head[:7] if current_head else 'none'}",
            f"Goal: {goal}",
            f"Left off: {left_off}",
        ]
        if active_files:
            brief_lines.append(f"Active: {', '.join(active_files[:3])}")
        if open_tasks:
            brief_lines.append(f"Tasks: {', '.join(open_tasks[:2])}")
        elif next_steps:
            brief_lines.append(f"Next: {'; '.join(next_steps[:2])}")

        brief_text = "\n".join(brief_lines)
        words = brief_text.split()
        if len(words) > 85:
            brief_text = " ".join(words[:85]) + "..."
            words = brief_text.split()

        token_estimate = int(len(words) * 1.3)

        return {
            "success": True,
            "found": True,
            "project_name": proj_name,
            "project_path": p_str,
            "brief": brief_text,
            "brief_text": brief_text,
            "token_estimate": min(120, token_estimate),
            "has_unsaved_drift": has_unsaved_drift,
            "drift_reason": drift_reason,
            "git_head": current_head,
            "branch": branch,
            "snapshot": row_dict,
            "context": {
                "project_name": proj_name,
                "project_path": p_str,
                "workspace_mode": mode,
                "stack": stack,
                "goal": row_dict.get("goal", ""),
                "left_off": row_dict.get("left_off", ""),
                "next_steps": next_steps,
                "decisions": decisions,
                "blockers": blockers,
                "active_files": active_files,
                "open_tasks": open_tasks,
                "git_head": current_head,
                "branch": branch,
                "updated_at": row_dict.get("updated_at", ""),
            },
        }

    def ck_info(self, project_path: str) -> Dict[str, Any]:
        """Returns full tracked context metadata for a project path or name."""
        target = str(project_path)
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM project_contexts WHERE project_path = ? OR project_name = ? LIMIT 1;",
                (str(Path(target).resolve()) if Path(target).exists() else target, target),
            ).fetchone()

        if not row:
            return {"success": False, "error": f"Project not tracked in Context Keeper: {target}"}

        d = dict(row)
        d["stack"] = json.loads(d.get("stack_json") or "[]")
        d["next_steps"] = json.loads(d.get("next_steps_json") or "[]")
        d["decisions"] = json.loads(d.get("decisions_json") or "[]")
        d["blockers"] = json.loads(d.get("blockers_json") or "[]")
        d["active_files"] = json.loads(d.get("active_files_json") or "[]")
        d["open_tasks"] = json.loads(d.get("open_tasks_json") or "[]")
        d["branch"] = d.get("branch") or "main"
        d["project_name"] = d.get("project_name") or Path(d["project_path"]).name
        d["success"] = True
        return d

    def ck_list(self) -> List[Dict[str, Any]]:
        """Returns all tracked project contexts ordered by updated_at desc."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM project_contexts ORDER BY updated_at DESC;",
            ).fetchall()

        results: List[Dict[str, Any]] = []
        for r in rows:
            item = dict(r)
            item["stack"] = json.loads(item.get("stack_json") or "[]")
            item["next_steps"] = json.loads(item.get("next_steps_json") or "[]")
            item["decisions"] = json.loads(item.get("decisions_json") or "[]")
            item["blockers"] = json.loads(item.get("blockers_json") or "[]")
            item["active_files"] = json.loads(item.get("active_files_json") or "[]")
            item["open_tasks"] = json.loads(item.get("open_tasks_json") or "[]")
            item["branch"] = item.get("branch") or "main"
            item["project_name"] = item.get("project_name") or Path(item["project_path"]).name
            results.append(item)

        return results

    def record_instinct(
        self,
        skill_slug: str,
        title: str,
        trigger_pattern: str,
        description: str,
        code_snippet: str,
        language: str = "python",
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Records a verified workflow or reflex snippet into learned_instincts table in SQLite WAL."""
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        clean_slug = re.sub(r"[^\w\-]+", "-", skill_slug.lower()).strip("-")
        instinct_id = f"inst_{clean_slug}_{uuid.uuid4().hex[:6]}"
        instinct_rule = description or title or f"Rule for {trigger_pattern}"

        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO learned_instincts (
                    id, skill_slug, title, trigger_pattern, instinct_rule, description, code_snippet,
                    language, tags_json, confidence_score, verified_success, workspace_mode,
                    hit_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0.95, 1, 'DEV', 1, ?, ?);
                """,
                (
                    instinct_id,
                    clean_slug,
                    title,
                    trigger_pattern,
                    instinct_rule,
                    description,
                    code_snippet,
                    language,
                    json.dumps(tags or []),
                    now_iso,
                    now_iso,
                ),
            )
            conn.commit()

        return {
            "success": True,
            "instinct_id": instinct_id,
            "skill_slug": clean_slug,
        }

    def get_instincts(self) -> List[Dict[str, Any]]:
        """Retrieves all recorded instincts from SQLite WAL."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM learned_instincts ORDER BY created_at DESC;").fetchall()
        return [dict(r) for r in rows]

    def promote_instinct(
        self,
        instinct_id_or_slug: str,
        target_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """Promotes a recorded instinct into a reusable /skill:<slug> package with SKILL.md and main.py."""
        target = str(instinct_id_or_slug).strip()
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM learned_instincts WHERE id = ? OR skill_slug = ? OR trigger_pattern = ? LIMIT 1;",
                (target, target, target),
            ).fetchone()

        if not row:
            return {"success": False, "error": f"Instinct not found: {target}"}

        inst = dict(row)
        slug = inst.get("skill_slug") or re.sub(r"[^\w\-]+", "-", inst["trigger_pattern"].lower()).strip("-")
        title = inst.get("title") or slug.replace("-", " ").title()
        desc = inst.get("description") or f"Promoted skill for {slug}"
        code = inst.get("code_snippet") or ""

        base_dir = Path(target_dir) if target_dir else self.skills_dir
        skill_dir = base_dir / slug
        skill_dir.mkdir(parents=True, exist_ok=True)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        skill_md = (
            f"---\n"
            f"name: {slug}\n"
            f"title: {title}\n"
            f"description: {desc}\n"
            f"trigger_pattern: {inst['trigger_pattern']}\n"
            f"promoted_at: {now_iso}\n"
            f"---\n\n"
            f"# {title}\n\n"
            f"{desc}\n\n"
            f"## Usage\n"
            f"Trigger pattern: `{inst['trigger_pattern']}`\n"
        )
        (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")
        (skill_dir / "main.py").write_text(code, encoding="utf-8")

        manifest_data = {
            "slug": slug,
            "title": title,
            "description": desc,
            "trigger_pattern": inst["trigger_pattern"],
            "promoted_at": now_iso,
        }
        (skill_dir / "manifest.json").write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")

        return {
            "success": True,
            "promoted_slug": slug,
            "skill_path": str(skill_dir),
        }
