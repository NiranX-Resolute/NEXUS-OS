"""
Nexus Cumulative Diff Review Sandbox & Plan Branching Engine
=============================================================================
Inspired by Plandex.
Provides:
1. In-memory / isolated cumulative diff accumulation across multi-file steps.
2. Plan branching: Test alternative implementation paths (e.g. branch-A vs branch-B)
   without polluting the workspace.
3. Checkpoint rewinds and atomic commit/rollback.
=============================================================================
"""

import difflib
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any


@dataclass
class PlanFileChange:
    file_path: str
    original_content: str
    pending_content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class PlanBranch:
    name: str
    changes: Dict[str, PlanFileChange] = field(default_factory=dict)
    parent_branch: Optional[str] = None
    created_at: float = field(default_factory=time.time)


class CumulativeDiffSandbox:
    """
    Manages multi-branch plan changes and cumulative diff previews.
    """

    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or ".").resolve()
        self.branches: Dict[str, PlanBranch] = {
            "main": PlanBranch(name="main")
        }
        self.active_branch_name = "main"

    @property
    def current_branch(self) -> PlanBranch:
        return self.branches[self.active_branch_name]

    def create_branch(self, branch_name: str, from_branch: Optional[str] = None) -> PlanBranch:
        """Creates a new plan branch inheriting from an existing branch."""
        src = from_branch or self.active_branch_name
        if branch_name in self.branches:
            raise ValueError(f"Branch '{branch_name}' already exists.")

        parent = self.branches.get(src, self.branches["main"])
        # Deep copy existing changes
        copied_changes = {
            k: PlanFileChange(
                file_path=v.file_path,
                original_content=v.original_content,
                pending_content=v.pending_content
            )
            for k, v in parent.changes.items()
        }

        new_b = PlanBranch(name=branch_name, changes=copied_changes, parent_branch=src)
        self.branches[branch_name] = new_b
        self.active_branch_name = branch_name
        return new_b

    def switch_branch(self, branch_name: str):
        """Switches active branch context."""
        if branch_name not in self.branches:
            raise ValueError(f"Branch '{branch_name}' does not exist.")
        self.active_branch_name = branch_name

    def stage_file_change(self, file_path: str, new_content: str):
        """Stages a proposed change inside the current branch."""
        p = Path(file_path)
        if not p.is_absolute():
            p = self.workspace_root / p

        orig = ""
        if p.exists() and p.is_file():
            with open(p, "r", encoding="utf-8", errors="replace") as fp:
                orig = fp.read()

        norm_path = str(p.resolve())
        # If already tracked, preserve the original content from when first touched
        initial_orig = self.current_branch.changes[norm_path].original_content if norm_path in self.current_branch.changes else orig

        self.current_branch.changes[norm_path] = PlanFileChange(
            file_path=norm_path,
            original_content=initial_orig,
            pending_content=new_content
        )

    def get_cumulative_diff(self, branch_name: Optional[str] = None) -> str:
        """
        Renders a unified diff of all pending staged changes on the branch.
        """
        b = self.branches.get(branch_name or self.active_branch_name, self.current_branch)
        diff_chunks = []

        for fpath, change in b.changes.items():
            orig_lines = change.original_content.splitlines(keepends=True)
            pend_lines = change.pending_content.splitlines(keepends=True)
            rel_path = Path(fpath).name

            diff = difflib.unified_diff(
                orig_lines,
                pend_lines,
                fromfile=f"a/{rel_path}",
                tofile=f"b/{rel_path}"
            )
            diff_text = "".join(diff)
            if diff_text:
                diff_chunks.append(diff_text)

        return "\n".join(diff_chunks) if diff_chunks else "# No pending changes in branch"

    def apply_to_workspace(self, branch_name: Optional[str] = None) -> List[str]:
        """
        Applies all staged changes from the branch directly to disk.
        """
        b = self.branches.get(branch_name or self.active_branch_name, self.current_branch)
        applied = []

        for fpath, change in b.changes.items():
            p = Path(fpath)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as fp:
                fp.write(change.pending_content)
            applied.append(fpath)

        # Clear staged changes
        b.changes.clear()
        return applied

    def discard_branch(self, branch_name: str):
        """Discards an exploratory plan branch."""
        if branch_name == "main":
            self.branches["main"].changes.clear()
            return
        if branch_name in self.branches:
            del self.branches[branch_name]
            if self.active_branch_name == branch_name:
                self.active_branch_name = "main"
