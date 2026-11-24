"""
Nexus OS v5.0 - Autonomous Developer Agent (DEV-01)
=============================================================================
Specialized engineering persona for codebase modification, AST-validated code
synthesis, symbol architecture mapping, and test verification.

Core Invariants:
1. Every code edit must pass AST syntax parsing (ast.parse) before writing to disk.
   Syntax errors immediately raise ValueError.
2. Symbol maps walk .py files via ast.walk and are bounded to avoid LLM context
   exhaustion.
3. Strict workspace boundaries preventing modifications outside the repository root.
=============================================================================
"""

import ast
import difflib
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

logger = logging.getLogger("DeveloperAgent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Excluded directories during symbol discovery
DEFAULT_EXCLUDES: Set[str] = {
    ".git",
    ".github",
    ".venv",
    "venv",
    "env",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    ".pytest_cache",
    ".mypy_cache",
    ".wrangler",
    ".cloudflare",
    "screenshots",
    "Nexus Interview copilot"
}


class DeveloperAgent:
    """
    Autonomous Developer Agent responsible for code editing, AST verification,
    symbol mapping, and test execution.
    """

    def __init__(self, repo_path: Optional[str] = None, max_symbol_chars: int = 15000):
        if repo_path:
            self.repo_path = Path(repo_path).resolve()
        else:
            # Fall back to root of Nexus Desktop workspace
            self.repo_path = Path(__file__).parent.parent.parent.resolve()

        self.max_symbol_chars = max_symbol_chars
        logger.info(f"DeveloperAgent initialized for repository: {self.repo_path}")

    def _is_path_in_repo(self, path: Path) -> bool:
        """Ensures that a path is strictly inside the repository root."""
        try:
            resolved = path.resolve()
            return self.repo_path in resolved.parents or resolved == self.repo_path
        except Exception:
            return False

    def generate_symbol_map(self, max_chars: Optional[int] = None) -> str:
        """
        Walks .py files across the repository using ast.walk, extracts ClassDef
        and FunctionDef signatures with argument lists and docstrings, and returns
        a bounded symbol list formatted for LLM context injection.
        """
        limit = max_chars or self.max_symbol_chars
        lines: List[str] = []
        current_len = 0

        lines.append(f"# Nexus Repository Symbol Map: {self.repo_path.name}")
        lines.append("# Bounded architectural signature index\n")
        current_len = sum(len(l) + 1 for l in lines)

        # Walk all python files
        for root, dirs, files in os.walk(self.repo_path):
            # Prune excluded directories in-place
            dirs[:] = [d for d in dirs if d not in DEFAULT_EXCLUDES and not d.startswith(".")]

            py_files = sorted([f for f in files if f.endswith(".py")])
            for py_file in py_files:
                file_full = Path(root) / py_file
                try:
                    rel_path = file_full.relative_to(self.repo_path)
                except ValueError:
                    rel_path = file_full

                try:
                    with open(file_full, "r", encoding="utf-8", errors="replace") as fp:
                        source_code = fp.read()
                    tree = ast.parse(source_code, filename=str(rel_path))
                except Exception as e:
                    logger.debug(f"Skipping unparseable file {rel_path}: {e}")
                    continue

                file_header = f"File: {rel_path.as_posix()}"
                file_symbols: List[str] = []

                # Extract top-level and method definitions
                for node in tree.body:
                    if isinstance(node, ast.ClassDef):
                        bases = [self._format_node_expr(b) for b in node.bases]
                        bases_str = f"({', '.join(bases)})" if bases else ""
                        file_symbols.append(f"  class {node.name}{bases_str} [Line {node.lineno}]")

                        # Extract methods inside class
                        for item in node.body:
                            if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                                prefix = "async def" if isinstance(item, ast.AsyncFunctionDef) else "def"
                                args_str = self._format_arguments(item.args)
                                file_symbols.append(f"    {prefix} {item.name}({args_str}) [Line {item.lineno}]")

                    elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
                        args_str = self._format_arguments(node.args)
                        file_symbols.append(f"  {prefix} {node.name}({args_str}) [Line {node.lineno}]")

                if file_symbols:
                    block = [file_header] + file_symbols + [""]
                    block_text = "\n".join(block)

                    if current_len + len(block_text) > limit:
                        remaining = limit - current_len
                        if remaining > 100:
                            lines.append(block_text[:remaining])
                        lines.append(f"\n... [SYMBOL MAP BOUNDED AT {limit} CHARACTERS]")
                        return "\n".join(lines)

                    lines.extend(block)
                    current_len += len(block_text) + 1

        return "\n".join(lines)

    def _format_arguments(self, args: ast.arguments) -> str:
        """Formats ast.arguments into a clean signature parameter string."""
        parts: List[str] = []
        for arg in args.posonlyargs:
            parts.append(arg.arg)
        for arg in args.args:
            parts.append(arg.arg)
        if args.vararg:
            parts.append(f"*{args.vararg.arg}")
        for arg in args.kwonlyargs:
            parts.append(arg.arg)
        if args.kwarg:
            parts.append(f"**{args.kwarg.arg}")
        return ", ".join(parts)

    def _format_node_expr(self, node: ast.AST) -> str:
        """Formats an AST expression node into readable text."""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._format_node_expr(node.value)}.{node.attr}"
        elif isinstance(node, ast.Constant):
            return str(node.value)
        return "..."

    def apply_ast_validated_edit(self, file_relative_path: str, new_code: str) -> bool:
        """
        Validates Python syntax using ast.parse before saving any code mutations.
        Throws ValueError on syntax errors to safeguard the codebase from corruptions.
        """
        # 1. AST Validation
        try:
            ast.parse(new_code, filename=file_relative_path)
        except SyntaxError as e:
            err_msg = (
                f"AST Syntax Validation Error in '{file_relative_path}' "
                f"at line {e.lineno}, offset {e.offset}: {e.msg}\n"
                f"Failing line: {e.text}"
            )
            logger.error(err_msg)
            raise ValueError(err_msg) from e

        # 2. Target Path Resolution & Sandbox Boundary Check
        target_file = (self.repo_path / file_relative_path).resolve()
        if not self._is_path_in_repo(target_file):
            raise PermissionError(f"Target path '{target_file}' is outside repository root '{self.repo_path}'.")

        # 3. Create parent directories if missing
        target_file.parent.mkdir(parents=True, exist_ok=True)

        # 4. Atomic file write
        tmp_file = target_file.with_suffix(target_file.suffix + ".tmp")
        try:
            with open(tmp_file, "w", encoding="utf-8") as fp:
                fp.write(new_code)
            # Replace atomically
            tmp_file.replace(target_file)
            logger.info(f"Successfully applied AST-validated edit to: {target_file}")
            return True
        except Exception as e:
            if tmp_file.exists():
                try:
                    tmp_file.unlink()
                except Exception:
                    pass
            logger.error(f"Failed writing validated code to '{target_file}': {e}")
            raise e

    def get_diff(self, file_relative_path: str, new_code: str) -> str:
        """Generates a unified diff comparing current file content against new_code."""
        target_file = (self.repo_path / file_relative_path).resolve()
        old_lines = []
        if target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                    old_lines = f.readlines()
            except Exception:
                old_lines = []

        new_lines = [line + "\n" for line in new_code.splitlines()]
        diff = difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile=f"a/{file_relative_path}",
            tofile=f"b/{file_relative_path}"
        )
        return "".join(diff)

    def run_tests(self, test_target: Optional[str] = None, timeout: int = 60) -> Dict[str, Any]:
        """
        Executes pytest suite in the repository and returns structured results.
        """
        target = test_target or "core/tests"
        cmd = [sys.executable, "-m", "pytest", target, "-v"]
        try:
            res = subprocess.run(
                cmd,
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return {
                "success": res.returncode == 0,
                "exit_code": res.returncode,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "exit_code": -1,
                "error": f"Test suite timed out after {timeout} seconds."
            }
        except Exception as e:
            return {
                "success": False,
                "exit_code": -1,
                "error": str(e)
            }
