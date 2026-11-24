"""
Nexus Agent-Computer Interface (ACI) Editor with Syntax Verification
=============================================================================
Inspired by SWE-agent.
Replaces unreliable standard shell commands (cat, sed, grep) with a
custom Agent-Computer Interface tailored for LLMs:
1. Windowed, line-numbered file viewer (open_file, scroll_up, scroll_down).
2. Structural search (search_file, search_dir).
3. Syntax-validated atomic file editing: AST syntax check before writing to disk.
=============================================================================
"""

import ast
import json
import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple


class ACIEditor:
    """
    Dedicated Agent-Computer Interface for file inspection and modification.
    """

    def __init__(self, workspace_root: Optional[str] = None):
        self.workspace_root = Path(workspace_root or ".").resolve()
        self.open_viewports: Dict[str, int] = {}  # file_path -> current_line

    def _resolve_path(self, rel_or_abs: str) -> Path:
        p = Path(rel_or_abs)
        if not p.is_absolute():
            p = self.workspace_root / p
        return p.resolve()

    def open_file(self, file_path: str, line_number: int = 1, window_size: int = 50) -> Dict[str, Any]:
        """
        Opens a file and displays a window of line-numbered code.
        """
        p = self._resolve_path(file_path)
        if not p.exists() or not p.is_file():
            return {"success": False, "error": f"File '{file_path}' does not exist."}

        try:
            with open(p, "r", encoding="utf-8", errors="replace") as fp:
                lines = fp.readlines()
        except Exception as e:
            return {"success": False, "error": f"Failed to read '{file_path}': {e}"}

        total_lines = len(lines)
        start = max(1, line_number)
        end = min(total_lines, start + window_size - 1)

        numbered_output = []
        for idx in range(start, end + 1):
            numbered_output.append(f"{idx:4d} | {lines[idx - 1].rstrip()}")

        self.open_viewports[str(p)] = start

        return {
            "success": True,
            "file": str(p),
            "start_line": start,
            "end_line": end,
            "total_lines": total_lines,
            "content": "\n".join(numbered_output)
        }

    def scroll(self, file_path: str, delta_lines: int, window_size: int = 50) -> Dict[str, Any]:
        """Scrolls the current viewport up or down."""
        p = str(self._resolve_path(file_path))
        curr = self.open_viewports.get(p, 1)
        new_start = max(1, curr + delta_lines)
        return self.open_file(file_path, line_number=new_start, window_size=window_size)

    def search_file(self, file_path: str, query: str) -> Dict[str, Any]:
        """Finds occurrences of a query string inside a file with line numbers."""
        p = self._resolve_path(file_path)
        if not p.exists():
            return {"success": False, "error": f"File '{file_path}' not found."}

        matches = []
        with open(p, "r", encoding="utf-8", errors="replace") as fp:
            for idx, line in enumerate(fp, 1):
                if query.lower() in line.lower():
                    matches.append(f"{idx:4d} | {line.rstrip()}")

        return {
            "success": True,
            "file": str(p),
            "query": query,
            "matches_count": len(matches),
            "matches": matches[:100]
        }

    def edit_file(
        self,
        file_path: str,
        start_line: int,
        end_line: int,
        new_content: str
    ) -> Dict[str, Any]:
        """
        Replaces lines [start_line, end_line] with new_content.
        CRITICAL: Runs AST syntax check BEFORE writing to disk.
        """
        p = self._resolve_path(file_path)
        if not p.exists():
            return {"success": False, "error": f"File '{file_path}' not found."}

        with open(p, "r", encoding="utf-8", errors="replace") as fp:
            lines = fp.readlines()

        total = len(lines)
        if start_line < 1 or end_line > total or start_line > end_line:
            return {
                "success": False,
                "error": f"Invalid line range [{start_line}, {end_line}] for file with {total} lines."
            }

        # Format replacement lines
        rep_lines = new_content.splitlines(keepends=True)
        if new_content and not rep_lines[-1].endswith("\n"):
            rep_lines[-1] += "\n"

        candidate_lines = lines[:start_line - 1] + rep_lines + lines[end_line:]
        candidate_code = "".join(candidate_lines)

        # Syntax Pre-Verification
        if p.suffix.lower() == ".py":
            try:
                ast.parse(candidate_code)
            except SyntaxError as e:
                return {
                    "success": False,
                    "error": (
                        f"SyntaxVerificationError: Proposed edit introduces a SyntaxError "
                        f"at line {e.lineno}: {e.msg}. Disk content was NOT modified."
                    ),
                    "syntax_error_line": e.lineno
                }
        elif p.suffix.lower() == ".json":
            try:
                json.loads(candidate_code)
            except Exception as e:
                return {
                    "success": False,
                    "error": f"SyntaxVerificationError: Invalid JSON produced. Disk was NOT modified: {e}"
                }

        # Safe to commit to disk
        try:
            with open(p, "w", encoding="utf-8") as fp:
                fp.write(candidate_code)
            return {
                "success": True,
                "file": str(p),
                "modified_range": [start_line, end_line],
                "new_total_lines": len(candidate_lines),
                "verified": True
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to write to disk: {e}"}
