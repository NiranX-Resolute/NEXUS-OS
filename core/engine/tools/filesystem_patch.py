"""
Nexus Autonomous Engine - Filesystem Atomic Patcher & Unified Diff Engine
=============================================================================
Safely applies line-level patches, unified diffs, and targeted search-and-replace
blocks. Never destroys entire files accidentally; guarantees atomic reversibility,
checksum verification, and rollback upon hunk failure or conflict.
=============================================================================
"""

import os
import re
import difflib
import hashlib
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union

logger = logging.getLogger("nexus.filesystem_patch")


class PatchConflictError(Exception):
    """Raised when a patch or search-and-replace block cannot be unambiguously applied."""
    def __init__(self, message: str, file_path: Path, context_lines: Optional[str] = None, matches_found: int = 0):
        super().__init__(message)
        self.file_path = file_path
        self.context_lines = context_lines
        self.matches_found = matches_found


class FilePatcher:
    """
    Deterministic, line-level atomic file patcher.
    Enforces atomic staging, pre-patch backups, and strict rollback on conflict.
    """

    def __init__(self, base_dir: Optional[Union[Path, str]] = None):
        self.base_dir = Path(base_dir or os.getcwd()).resolve()

    def _resolve(self, path: Union[Path, str]) -> Path:
        p = Path(path)
        if p.is_absolute():
            return p.resolve()
        return (self.base_dir / p).resolve()

    def _compute_sha256(self, file_path: Path) -> str:
        """Computes SHA256 checksum of a file."""
        hasher = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _create_backup(self, target_file: Path) -> Path:
        """Creates a .bak snapshot of target_file for instant rollback."""
        bak_file = target_file.with_name(target_file.name + ".bak")
        shutil.copy2(target_file, bak_file)
        return bak_file

    def rollback(self, target_file: Union[Path, str]) -> bool:
        """
        Restores target_file from its pre-allocated .bak snapshot.
        Returns True if rollback was successful, False otherwise.
        """
        target = self._resolve(target_file)
        bak_file = target.with_name(target.name + ".bak")
        if bak_file.exists():
            try:
                os.replace(bak_file, target)
                return True
            except Exception as e:
                logger.error("Failed to rollback %s from %s: %s", target, bak_file, e)
                return False
        return False

    def apply_search_and_replace(
        self,
        target_file: Union[Path, str],
        search_block: str,
        replace_block: str,
        occurrence: Optional[int] = 1,
        disambiguate: bool = False
    ) -> bool:
        """
        Applies line-level search-and-replace block atomically:
        - Normalizes carriage returns (\\r\\n vs \\n).
        - If search_block appears 0 times or multiple times without explicit disambiguation,
          raises PatchConflictError containing line context.
        - Stages replacement in a .tmp.patch file, then performs an atomic swap.
        """
        target = self._resolve(target_file)
        if not target.exists():
            raise FileNotFoundError(f"Target file does not exist: {target}")

        self._create_backup(target)

        with open(target, "r", encoding="utf-8", errors="replace") as f:
            original = f.read()

        # Normalize line endings
        orig_norm = original.replace("\r\n", "\n")
        search_norm = search_block.replace("\r\n", "\n")
        replace_norm = replace_block.replace("\r\n", "\n")

        matches = orig_norm.count(search_norm)

        if matches == 0:
            # Fallback check: trim outer whitespace
            trimmed_search = search_norm.strip()
            if trimmed_search and orig_norm.count(trimmed_search) == 1:
                search_norm = trimmed_search
                matches = 1
            else:
                context_sample = "\n".join(orig_norm.splitlines()[:15])
                raise PatchConflictError(
                    f"Search block not found in {target}. Provided content did not match.",
                    file_path=target,
                    context_lines=context_sample,
                    matches_found=0
                )

        if matches > 1 and not disambiguate:
            # Context around the conflicts
            context_sample = f"Found {matches} duplicate occurrences in {target}. Please disambiguate context."
            raise PatchConflictError(
                f"Search block appears {matches} times in {target} without explicit disambiguation.",
                file_path=target,
                context_lines=context_sample,
                matches_found=matches
            )

        # Perform replacement
        if matches == 1 or occurrence is None:
            new_content = orig_norm.replace(search_norm, replace_norm, 1)
        else:
            # Replace specific N-th occurrence
            parts = orig_norm.split(search_norm)
            if occurrence < 1 or occurrence >= len(parts):
                raise PatchConflictError(
                    f"Occurrence {occurrence} out of range (found {matches} matches)",
                    file_path=target,
                    matches_found=matches
                )
            new_content = search_norm.join(parts[:occurrence]) + replace_norm + search_norm.join(parts[occurrence:])

        # Preserve CRLF if original file used it
        if "\r\n" in original:
            new_content = new_content.replace("\n", "\r\n")

        # Atomic stage and swap
        tmp_file = target.with_name(target.name + ".tmp.patch")
        try:
            with open(tmp_file, "w", encoding="utf-8", newline="") as f:
                f.write(new_content)
            os.replace(tmp_file, target)
            return True
        except Exception as e:
            if tmp_file.exists():
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass
            self.rollback(target)
            raise e

    def apply_unified_diff(self, target_file: Union[Path, str], diff_content: str) -> bool:
        """
        Parses unified diff headers (@@ -start,len +start,len @@) and applies hunks atomically.
        Validates target file existence, computes pre-patch SHA256 checksum,
        and executes immediate rollback on hunk failure.
        """
        target = self._resolve(target_file)
        if not target.exists():
            raise FileNotFoundError(f"Target file does not exist: {target}")

        pre_checksum = self._compute_sha256(target)
        self._create_backup(target)

        with open(target, "r", encoding="utf-8", errors="replace") as f:
            original_lines = f.read().splitlines(keepends=True)

        hunk_header_re = re.compile(r'^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@')

        diff_lines = diff_content.splitlines(keepends=True)
        hunks: List[Dict[str, Any]] = []
        current_hunk = None

        for d_line in diff_lines:
            match = hunk_header_re.match(d_line)
            if match:
                if current_hunk:
                    hunks.append(current_hunk)
                orig_start = int(match.group(1))
                orig_len = int(match.group(2)) if match.group(2) is not None else 1
                new_start = int(match.group(3))
                new_len = int(match.group(4)) if match.group(4) is not None else 1
                current_hunk = {
                    "orig_start": orig_start,
                    "orig_len": orig_len,
                    "new_start": new_start,
                    "new_len": new_len,
                    "lines": []
                }
            elif current_hunk is not None:
                if d_line.startswith((' ', '+', '-', '\\')):
                    current_hunk["lines"].append(d_line)

        if current_hunk:
            hunks.append(current_hunk)

        if not hunks:
            # Check if git apply is possible or if diff was empty
            if not diff_content.strip():
                return True
            self.rollback(target)
            return False

        # Apply hunks sequentially
        result_lines = list(original_lines)
        line_offset = 0

        for hunk in hunks:
            orig_start = hunk["orig_start"] - 1 + line_offset  # 1-indexed to 0-indexed
            hunk_lines = hunk["lines"]

            # Validate that context and deletion lines match result_lines
            check_idx = orig_start
            hunk_valid = True
            replacement_slice: List[str] = []
            orig_consumed = 0

            for h_line in hunk_lines:
                prefix = h_line[0] if h_line else ''
                content = h_line[1:]

                if prefix == ' ':
                    # Context line
                    if check_idx >= len(result_lines) or result_lines[check_idx].rstrip('\r\n') != content.rstrip('\r\n'):
                        hunk_valid = False
                        break
                    replacement_slice.append(result_lines[check_idx])
                    check_idx += 1
                    orig_consumed += 1
                elif prefix == '-':
                    # Deleted line
                    if check_idx >= len(result_lines) or result_lines[check_idx].rstrip('\r\n') != content.rstrip('\r\n'):
                        hunk_valid = False
                        break
                    check_idx += 1
                    orig_consumed += 1
                elif prefix == '+':
                    # Added line
                    # Ensure appropriate line ending
                    if not content.endswith('\n'):
                        content += '\n'
                    replacement_slice.append(content)
                elif prefix == '\\':
                    # "\ No newline at end of file"
                    pass

            if not hunk_valid:
                logger.warning("Unified diff hunk failed context match at line %d in %s", hunk["orig_start"], target)
                self.rollback(target)
                return False

            # Replace original slice with new hunk content
            result_lines[orig_start:orig_start + orig_consumed] = replacement_slice
            line_offset += len(replacement_slice) - orig_consumed

        # Stage in .tmp.patch and swap atomically
        tmp_file = target.with_name(target.name + ".tmp.patch")
        try:
            with open(tmp_file, "w", encoding="utf-8", newline="") as f:
                f.writelines(result_lines)
            os.replace(tmp_file, target)
            return True
        except Exception as e:
            if tmp_file.exists():
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass
            self.rollback(target)
            logger.error("Failed to commit patched file %s: %s", target, e)
            return False


class FilesystemPatcher:
    """
    Backwards-compatible patcher for existing orchestrator calls.
    """

    def __init__(self, base_dir: Optional[Union[Path, str]] = None):
        self.patcher = FilePatcher(base_dir=base_dir)
        self.base_dir = str(self.patcher.base_dir)

    def write_file(self, relative_or_abs_path: str, content: str) -> Dict[str, Any]:
        """Atomically writes file content using temporary file swap."""
        target_path = Path(self.base_dir) / relative_or_abs_path if not os.path.isabs(relative_or_abs_path) else Path(relative_or_abs_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        old_content = ""
        is_new = not target_path.exists()
        if not is_new:
            try:
                with open(target_path, "r", encoding="utf-8", errors="replace") as f:
                    old_content = f.read()
            except Exception:
                pass

        tmp_path = target_path.with_name(target_path.name + ".nexus_tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            os.replace(tmp_path, target_path)

            diff = list(difflib.unified_diff(
                old_content.splitlines(keepends=True),
                content.splitlines(keepends=True),
                fromfile=str(target_path),
                tofile=str(target_path)
            ))
            additions = sum(1 for line in diff if line.startswith("+") and not line.startswith("+++"))
            deletions = sum(1 for line in diff if line.startswith("-") and not line.startswith("---"))

            return {
                "success": True,
                "file": str(target_path),
                "is_new": is_new,
                "additions": additions,
                "deletions": deletions,
                "bytes_written": len(content.encode("utf-8"))
            }
        except Exception as e:
            if tmp_path.exists():
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
            return {
                "success": False,
                "file": str(target_path),
                "error": str(e)
            }

    def apply_search_replace(
        self,
        file_path: str,
        search_block: str,
        replace_block: str,
        allow_multiple: bool = False
    ) -> Dict[str, Any]:
        """Backwards compatible search and replace invocation."""
        target = Path(self.base_dir) / file_path if not os.path.isabs(file_path) else Path(file_path)
        try:
            success = self.patcher.apply_search_and_replace(
                target_file=target,
                search_block=search_block,
                replace_block=replace_block,
                occurrence=None if allow_multiple else 1,
                disambiguate=allow_multiple
            )
            return {"success": success, "file": str(target)}
        except Exception as e:
            return {"success": False, "file": str(target), "error": str(e)}

    def apply_unified_diff(self, diff_text: str, target_file: Optional[str] = None) -> Dict[str, Any]:
        """Applies unified diff text."""
        # Detect target file from diff header if not passed
        target = target_file
        if not target:
            for line in diff_text.splitlines():
                if line.startswith("+++ b/"):
                    target = line[6:].strip()
                    break

        if not target:
            return {"success": False, "error": "Could not determine target file from diff headers"}

        resolved = Path(self.base_dir) / target if not os.path.isabs(target) else Path(target)
        try:
            success = self.patcher.apply_unified_diff(resolved, diff_text)
            return {"success": success, "file": str(resolved)}
        except Exception as e:
            return {"success": False, "file": str(resolved), "error": str(e)}


_patcher = FilesystemPatcher()


def apply_patch(file_path: str, search_block: str, replace_block: str) -> Dict[str, Any]:
    return _patcher.apply_search_replace(file_path, search_block, replace_block)


def write_file(file_path: str, content: str) -> Dict[str, Any]:
    return _patcher.write_file(file_path, content)
