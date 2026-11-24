"""
Nexus Autonomous Engine - Isolated Workspace & Git Worktree Manager
=============================================================================
Prevents the autonomous agent from directly modifying the user's active,
uncommitted working tree or main branch.
All execution, code edits, tool runs, and test evaluations occur in dedicated,
ephemeral Git worktrees stored under ~/.nexus-agent/worktrees/.
=============================================================================
"""

import os
import re
import sys
import stat
import uuid
import shutil
import logging
import subprocess
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Generator, Union
from contextlib import contextmanager

from .config import WORKTREES_DIR, ensure_runtime_directories

logger = logging.getLogger("nexus.workspace")


@dataclass
class WorktreeContext:
    """Represents an active ephemeral worktree sandbox."""
    task_id: str
    worktree_path: str
    branch_name: str
    base_branch: str
    is_active: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "worktree_path": self.worktree_path,
            "branch_name": self.branch_name,
            "base_branch": self.base_branch,
            "is_active": self.is_active
        }


def _force_remove_readonly(func, path, exc_info):
    """Clear the readonly bit and reattempt file removal on Windows."""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass


class WorktreeManager:
    """
    Manages isolated Git worktree lifecycles for safe agent sandboxing.
    Guarantees user working tree safety by routing all mutations to ephemeral worktrees.
    """

    def __init__(self, repo_root: Union[Path, str]):
        self.repo_root = Path(repo_root).resolve()
        self._validate_git_repo()
        ensure_runtime_directories()

    def _validate_git_repo(self) -> None:
        """Validates that repo_root is an initialized Git repository."""
        dot_git = self.repo_root / ".git"
        if dot_git.exists():
            return

        # Check if repo_root is inside a work tree
        try:
            res = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                cwd=str(self.repo_root),
                capture_output=True,
                text=True,
                check=False
            )
            if res.returncode == 0 and res.stdout.strip() == "true":
                # Resolve top-level repo path
                top_level = subprocess.run(
                    ["git", "rev-parse", "--show-toplevel"],
                    cwd=str(self.repo_root),
                    capture_output=True,
                    text=True,
                    check=True
                ).stdout.strip()
                self.repo_root = Path(top_level).resolve()
                return
        except Exception as e:
            raise ValueError(f"Directory {self.repo_root} is not an initialized Git repository: {e}")

        raise ValueError(f"Directory {self.repo_root} is not an initialized Git repository")

    def _run_git(self, args: List[str], cwd: Optional[Path] = None, check: bool = True) -> subprocess.CompletedProcess:
        """Executes a git command with UTF-8 encoding and error inspection."""
        target_cwd = cwd or self.repo_root
        res = subprocess.run(
            ["git"] + args,
            cwd=str(target_cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        if check and res.returncode != 0:
            raise RuntimeError(
                f"Git command failed: git {' '.join(args)}\n"
                f"Exit code: {res.returncode}\nStderr: {res.stderr}\nStdout: {res.stdout}"
            )
        return res

    def get_current_branch(self) -> str:
        """Returns active branch name or HEAD reference."""
        res = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"], check=False)
        branch = res.stdout.strip()
        if res.returncode == 0 and branch and branch != "HEAD":
            return branch
        # Fallback to commit hash
        hash_res = self._run_git(["rev-parse", "--short", "HEAD"], check=False)
        return hash_res.stdout.strip() if hash_res.returncode == 0 else "main"

    def _resolve_sandbox_path(self, task_id: str) -> Path:
        """Resolves target directory under NEXUS_HOME/worktrees/<task_id>."""
        sanitized_id = re.sub(r'[^a-zA-Z0-9_\-\.]', '-', str(task_id))
        return WORKTREES_DIR / sanitized_id

    def create_sandbox(self, task_id: str) -> Path:
        """
        Creates an isolated Git worktree sandbox:
        1. Branch name: agent/task-{task_id}
        2. Worktree directory: ~/.nexus-agent/worktrees/{task_id}
        3. Verifies the worktree path exists and is an independent working directory.
        """
        branch_name = f"agent/task-{task_id}"
        worktree_path = self._resolve_sandbox_path(task_id)

        # 1. Clean up any existing branch or leftover worktree entry
        self._run_git(["worktree", "remove", "--force", str(worktree_path)], check=False)
        self._run_git(["worktree", "prune"], check=False)
        self._run_git(["branch", "-D", branch_name], check=False)

        if worktree_path.exists():
            shutil.rmtree(worktree_path, onerror=_force_remove_readonly)

        # 2. Add git worktree
        cmd = ["worktree", "add", str(worktree_path), "-b", branch_name]
        self._run_git(cmd)

        # 3. Verify directory and git worktree integrity
        if not worktree_path.exists() or not (worktree_path / ".git").exists():
            raise RuntimeError(f"Worktree creation failed; path {worktree_path} does not exist or lacks .git link")

        return worktree_path

    def compute_diff(self, task_id: str) -> Dict[str, Any]:
        """
        Executes git diff --unified=3 and git status --porcelain inside the sandbox directory.
        Returns parsed structured metrics:
        {"diff_text": str, "additions": int, "deletions": int, "modified_files": list[str], "untracked_files": list[str]}
        """
        worktree_path = self._resolve_sandbox_path(task_id)
        if not worktree_path.exists():
            raise FileNotFoundError(f"Sandbox directory for task '{task_id}' does not exist: {worktree_path}")

        # Git diff (unstaged + staged)
        diff_res = self._run_git(["diff", "--unified=3", "HEAD"], cwd=worktree_path, check=False)
        diff_text = diff_res.stdout

        additions = 0
        deletions = 0
        modified_files: set[str] = set()

        for line in diff_text.splitlines():
            if line.startswith("+++ b/"):
                modified_files.add(line[6:].strip())
            elif line.startswith("+") and not line.startswith("+++"):
                additions += 1
            elif line.startswith("-") and not line.startswith("---"):
                deletions += 1

        # Git status --porcelain for untracked and modified files
        status_res = self._run_git(["status", "--porcelain"], cwd=worktree_path, check=False)
        untracked_files: List[str] = []

        for line in status_res.stdout.splitlines():
            line_str = line.strip()
            if line_str.startswith("?? "):
                untracked_files.append(line_str[3:].strip())
            elif len(line_str) > 3 and line_str[:2] in (" M", "M ", "MM", "A ", "AM", " D"):
                modified_files.add(line_str[3:].strip())

        return {
            "diff_text": diff_text,
            "additions": additions,
            "deletions": deletions,
            "modified_files": sorted(list(modified_files)),
            "untracked_files": untracked_files
        }

    def merge_and_cleanup(self, task_id: str, target_branch: str = "main", squash: bool = True) -> bool:
        """
        Switches to target branch in main repo, merges the agent branch, and deletes
        the worktree via git worktree remove --force and git branch -D.
        """
        branch_name = f"agent/task-{task_id}"
        worktree_path = self._resolve_sandbox_path(task_id)

        try:
            # 1. Switch to target branch in repository root
            self._run_git(["checkout", target_branch], cwd=self.repo_root)

            # 2. Perform merge
            if squash:
                self._run_git(["merge", "--squash", branch_name], cwd=self.repo_root)
                self._run_git(
                    ["commit", "-m", f"feat(nexus): merge sandboxed task {task_id}"],
                    cwd=self.repo_root,
                    check=False
                )
            else:
                self._run_git(
                    ["merge", "--no-ff", "-m", f"feat(nexus): merge sandboxed task {task_id}", branch_name],
                    cwd=self.repo_root
                )

            # 3. Clean up worktree and task branch
            self.discard_sandbox(task_id)
            return True
        except Exception as e:
            logger.error("Failed to merge and cleanup task %s into %s: %s", task_id, target_branch, e)
            return False

    def discard_sandbox(self, task_id: str) -> bool:
        """
        Safely removes the worktree and deletes the temporary task branch
        without touching the user's active branch or repository uncommitted changes.
        """
        branch_name = f"agent/task-{task_id}"
        worktree_path = self._resolve_sandbox_path(task_id)

        # 1. Instruct git to remove worktree
        if worktree_path.exists():
            self._run_git(["worktree", "remove", "--force", str(worktree_path)], cwd=self.repo_root, check=False)
            self._run_git(["worktree", "prune"], cwd=self.repo_root, check=False)

        # 2. Hard cleanup of directory if locks remained
        if worktree_path.exists():
            shutil.rmtree(worktree_path, onerror=_force_remove_readonly)

        # 3. Delete branch
        self._run_git(["branch", "-D", branch_name], cwd=self.repo_root, check=False)
        return True


class WorkspaceManager(WorktreeManager):
    """
    Backwards-compatible WorkspaceManager supporting existing orchestrator workflows.
    """

    def __init__(self, repo_root: Optional[Union[Path, str]] = None):
        target_root = repo_root or os.getcwd()
        super().__init__(repo_root=target_root)

    def create_worktree(self, task_id: Optional[str] = None, base_ref: Optional[str] = None) -> WorktreeContext:
        """Creates an isolated Git worktree and returns a WorktreeContext object."""
        uid = (task_id or str(uuid.uuid4())[:8]).replace("/", "-").replace(" ", "-")
        branch_name = f"agent/task-{uid}"
        base = base_ref or self.get_current_branch()

        worktree_path = self.create_sandbox(uid)

        return WorktreeContext(
            task_id=uid,
            worktree_path=str(worktree_path),
            branch_name=branch_name,
            base_branch=base,
            is_active=True
        )

    def get_diff(self, context: WorktreeContext, staged_only: bool = False) -> Dict[str, Any]:
        """Captures unified diff and status information."""
        metrics = self.compute_diff(context.task_id)
        return {
            "diff": metrics["diff_text"],
            "additions": metrics["additions"],
            "deletions": metrics["deletions"],
            "files_modified": metrics["modified_files"],
            "untracked_files": metrics["untracked_files"],
            "has_changes": bool(metrics["diff_text"].strip() or metrics["untracked_files"])
        }

    def commit_changes(self, context: WorktreeContext, message: str) -> str:
        """Stages all changes and creates an atomic commit."""
        worktree_path = Path(context.worktree_path)
        self._run_git(["add", "-A"], cwd=worktree_path)
        commit_res = self._run_git(["commit", "-m", message], cwd=worktree_path, check=False)
        if commit_res.returncode == 0:
            rev_res = self._run_git(["rev-parse", "--short", "HEAD"], cwd=worktree_path)
            return rev_res.stdout.strip()
        return ""

    def merge_worktree(self, context: WorktreeContext, target_branch: Optional[str] = None) -> bool:
        """Merges worktree branch back into target base branch."""
        target = target_branch or context.base_branch
        return self.merge_and_cleanup(context.task_id, target_branch=target, squash=False)

    def remove_worktree(self, context: WorktreeContext, delete_branch: bool = True) -> None:
        """Cleanly removes git worktree and deletes ephemeral task branch."""
        if delete_branch:
            self.discard_sandbox(context.task_id)
        else:
            worktree_path = Path(context.worktree_path)
            self._run_git(["worktree", "remove", "--force", str(worktree_path)], cwd=self.repo_root, check=False)
            self._run_git(["worktree", "prune"], cwd=self.repo_root, check=False)
            if worktree_path.exists():
                shutil.rmtree(worktree_path, onerror=_force_remove_readonly)
        context.is_active = False

    @contextmanager
    def isolated_worktree(
        self,
        task_id: Optional[str] = None,
        auto_merge: bool = False
    ) -> Generator[WorktreeContext, None, None]:
        """Context manager for safe ephemeral execution."""
        ctx = self.create_worktree(task_id=task_id)
        try:
            yield ctx
            if auto_merge:
                self.commit_changes(ctx, f"feat(agent): complete task {ctx.task_id}")
                self.merge_worktree(ctx)
        finally:
            self.remove_worktree(ctx, delete_branch=not auto_merge)
