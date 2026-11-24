"""
Unit & Integration Test: Line-Level Unified AST/Diff File Patcher
=============================================================================
Validates:
1. Multi-line search-and-replace block application.
2. Conflict detection (PatchConflictError) on missing or ambiguous blocks.
3. Unified diff hunk application with additions and deletions.
4. Atomic rollback upon malformed hunk context failure.
5. Manual snapshot rollback from .bak files.
=============================================================================
"""

import os
import sys
import tempfile
import pytest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.tools.filesystem_patch import FilePatcher, PatchConflictError, FilesystemPatcher


@pytest.fixture
def temp_workspace():
    with tempfile.TemporaryDirectory() as tmp_dir:
        base_path = Path(tmp_dir)
        yield base_path


def test_search_and_replace_success(temp_workspace):
    """Validates multi-line search and replace block application."""
    patcher = FilePatcher(base_dir=temp_workspace)
    sample_file = temp_workspace / "sample.py"
    sample_file.write_text(
        "def calculate(a, b):\n"
        "    # OLD IMPLEMENTATION\n"
        "    return a + b\n"
        "\n"
        "def display():\n"
        "    print('Done')\n",
        encoding="utf-8"
    )

    search_block = (
        "    # OLD IMPLEMENTATION\n"
        "    return a + b"
    )
    replace_block = (
        "    # OPTIMIZED VECTORIZED\n"
        "    return (a + b) * 2"
    )

    success = patcher.apply_search_and_replace(sample_file, search_block, replace_block)
    assert success is True

    updated_content = sample_file.read_text(encoding="utf-8")
    assert "OPTIMIZED VECTORIZED" in updated_content
    assert "return (a + b) * 2" in updated_content
    assert "OLD IMPLEMENTATION" not in updated_content


def test_search_and_replace_conflict_errors(temp_workspace):
    """Validates PatchConflictError on 0 matches and ambiguous duplicates."""
    patcher = FilePatcher(base_dir=temp_workspace)
    sample_file = temp_workspace / "conflict.txt"
    sample_file.write_text(
        "item = 10\n"
        "target = 20\n"
        "target = 20\n"
        "item = 30\n",
        encoding="utf-8"
    )

    # 1. Zero matches
    with pytest.raises(PatchConflictError) as exc_info:
        patcher.apply_search_and_replace(sample_file, "non_existent_key = 99", "new_key = 1")
    assert exc_info.value.matches_found == 0

    # 2. Ambiguous duplicate matches without disambiguation
    with pytest.raises(PatchConflictError) as exc_info:
        patcher.apply_search_and_replace(sample_file, "target = 20", "target = 50", disambiguate=False)
    assert exc_info.value.matches_found == 2

    # 3. Disambiguated occurrence replacement
    success = patcher.apply_search_and_replace(
        sample_file,
        "target = 20",
        "target = 50",
        occurrence=2,
        disambiguate=True
    )
    assert success is True
    content = sample_file.read_text(encoding="utf-8")
    assert "target = 20\ntarget = 50\n" in content


def test_unified_diff_application(temp_workspace):
    """Validates applying standard unified diff hunks."""
    patcher = FilePatcher(base_dir=temp_workspace)
    source_file = temp_workspace / "module.py"
    source_file.write_text(
        "line 1: start\n"
        "line 2: to be replaced\n"
        "line 3: end\n",
        encoding="utf-8"
    )

    diff = (
        "--- a/module.py\n"
        "+++ b/module.py\n"
        "@@ -1,3 +1,3 @@\n"
        " line 1: start\n"
        "-line 2: to be replaced\n"
        "+line 2: patched cleanly\n"
        " line 3: end\n"
    )

    success = patcher.apply_unified_diff(source_file, diff)
    assert success is True

    result_content = source_file.read_text(encoding="utf-8")
    assert "line 2: patched cleanly" in result_content
    assert "line 2: to be replaced" not in result_content


def test_atomic_rollback_on_malformed_hunk(temp_workspace):
    """Validates automatic rollback when a hunk fails context line verification."""
    patcher = FilePatcher(base_dir=temp_workspace)
    source_file = temp_workspace / "fragile.py"
    initial_content = (
        "def run():\n"
        "    step_1()\n"
        "    step_2()\n"
        "    return True\n"
    )
    source_file.write_text(initial_content, encoding="utf-8")

    # Diff with conflicting context line
    malformed_diff = (
        "--- a/fragile.py\n"
        "+++ b/fragile.py\n"
        "@@ -1,4 +1,4 @@\n"
        " def run():\n"
        "-    NON_EXISTENT_STEP()\n"
        "+    new_step()\n"
        "    return True\n"
    )

    success = patcher.apply_unified_diff(source_file, malformed_diff)
    assert success is False

    # Verify that file was rolled back to its exact pre-patch state
    restored_content = source_file.read_text(encoding="utf-8")
    assert restored_content == initial_content

    # Ensure no lingering staging files remain
    staging_file = source_file.with_name(source_file.name + ".tmp.patch")
    assert not staging_file.exists()


def test_manual_rollback_from_backup(temp_workspace):
    """Validates explicit rollback() restored from .bak snapshot."""
    patcher = FilePatcher(base_dir=temp_workspace)
    file_path = temp_workspace / "manual_bak.txt"
    file_path.write_text("Original State", encoding="utf-8")

    # Apply search replace, which creates .bak
    patcher.apply_search_and_replace(file_path, "Original State", "Modified State")
    assert file_path.read_text(encoding="utf-8") == "Modified State"

    # Execute manual rollback
    rb_success = patcher.rollback(file_path)
    assert rb_success is True
    assert file_path.read_text(encoding="utf-8") == "Original State"
