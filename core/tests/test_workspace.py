"""
Unit & Integration Test: Git Worktree Manager & Sandbox Isolation
=============================================================================
Validates:
1. Dynamic sandbox creation via WorktreeManager.create_sandbox()
2. Modification and commit inside sandbox
3. compute_diff() structured metric extraction (+additions, -deletions, files)
4. Active repository branch remains pristine and untouched during execution
5. Clean teardown and worktree removal (discard_sandbox and merge_and_cleanup)
=============================================================================
"""

import os
import sys
import shutil
import tempfile
import subprocess
import pytest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.workspace import WorktreeManager, WorkspaceManager, WorktreeContext


@pytest.fixture
def temp_git_repo():
    """Initializes a clean, dedicated temporary Git repository with an initial commit."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        repo_dir = Path(tmp_dir) / "test_repo"
        repo_dir.mkdir()

        # Initialize git repository
        subprocess.run(["git", "init"], cwd=str(repo_dir), check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "Nexus Test"], cwd=str(repo_dir), check=True)
        subprocess.run(["git", "config", "user.email", "test@nexus.local"], cwd=str(repo_dir), check=True)

        # Create baseline initial commit
        readme = repo_dir / "README.md"
        readme.write_text("# Test Repo\nBaseline content.\n", encoding="utf-8")
        subprocess.run(["git", "add", "README.md"], cwd=str(repo_dir), check=True)
        subprocess.run(["git", "commit", "-m", "chore: initial baseline"], cwd=str(repo_dir), check=True)

        yield repo_dir


def test_worktree_sandbox_isolation_and_diff(temp_git_repo):
    """
    Validates worktree creation, diff calculation, main branch safety, and discard.
    """
    mgr = WorktreeManager(repo_root=temp_git_repo)
    task_id = "task-sandbox-01"

    # 1. Provision sandbox worktree
    worktree_path = mgr.create_sandbox(task_id)
    assert worktree_path.exists()
    assert (worktree_path / ".git").exists()

    # 2. Modify files inside worktree
    new_file = worktree_path / "module.py"
    new_file.write_text("def hello():\n    return 'nexus'\n", encoding="utf-8")

    # Modify existing file in worktree
    readme = worktree_path / "README.md"
    readme.write_text("# Test Repo\nBaseline content.\nNew feature added.\n", encoding="utf-8")

    # 3. Compute diff metrics
    diff_metrics = mgr.compute_diff(task_id)
    assert diff_metrics["additions"] >= 1
    assert "README.md" in diff_metrics["modified_files"]
    assert "module.py" in diff_metrics["untracked_files"]
    assert "New feature added" in diff_metrics["diff_text"]

    # 4. Verify main repository remains clean and untouched
    main_status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(temp_git_repo),
        capture_output=True,
        text=True,
        check=True
    )
    assert main_status.stdout.strip() == "", "Main repository must have zero uncommitted changes"

    main_readme = (temp_git_repo / "README.md").read_text(encoding="utf-8")
    assert "New feature added" not in main_readme, "Main branch content must not be modified by sandbox"

    # 5. Commit changes inside worktree
    subprocess.run(["git", "add", "-A"], cwd=str(worktree_path), check=True)
    subprocess.run(["git", "commit", "-m", "feat: sandbox implementation"], cwd=str(worktree_path), check=True)

    # 6. Discard sandbox cleanly
    mgr.discard_sandbox(task_id)
    assert not worktree_path.exists(), "Worktree directory must be removed on discard"

    # Verify task branch is deleted
    branches = subprocess.run(
        ["git", "branch", "--list", f"agent/task-{task_id}"],
        cwd=str(temp_git_repo),
        capture_output=True,
        text=True
    ).stdout
    assert f"agent/task-{task_id}" not in branches


def test_worktree_merge_and_cleanup(temp_git_repo):
    """
    Validates merging sandboxed task branch back into main repo cleanly.
    """
    mgr = WorktreeManager(repo_root=temp_git_repo)
    task_id = "task-merge-02"

    worktree_path = mgr.create_sandbox(task_id)

    # Add feature inside sandbox
    feature_file = worktree_path / "feature.txt"
    feature_file.write_text("Autonomous agent feature code\n", encoding="utf-8")

    subprocess.run(["git", "add", "feature.txt"], cwd=str(worktree_path), check=True)
    subprocess.run(["git", "commit", "-m", "feat: add feature file"], cwd=str(worktree_path), check=True)

    # Determine current branch of main repo
    branch_res = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=str(temp_git_repo),
        capture_output=True,
        text=True
    )
    target_branch = branch_res.stdout.strip()

    # Merge and cleanup
    success = mgr.merge_and_cleanup(task_id, target_branch=target_branch, squash=False)
    assert success is True

    # Assert merged file now exists in main repo
    merged_file = temp_git_repo / "feature.txt"
    assert merged_file.exists()
    assert "Autonomous agent feature code" in merged_file.read_text(encoding="utf-8")

    # Assert worktree directory is removed
    assert not worktree_path.exists()


def test_workspace_manager_context_manager(temp_git_repo):
    """
    Validates backwards-compatible WorkspaceManager context manager lifecycle.
    """
    mgr = WorkspaceManager(repo_root=temp_git_repo)
    task_id = "test-ctx-03"

    with mgr.isolated_worktree(task_id) as ctx:
        assert Path(ctx.worktree_path).exists()
        temp_file = Path(ctx.worktree_path) / "test.txt"
        temp_file.write_text("context manager payload", encoding="utf-8")

    # After exit, worktree directory should be cleanly removed
    assert not Path(ctx.worktree_path).exists()
