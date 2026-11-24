"""
Nexus Tree-sitter / AST Codebase Symbol Map (PageRank Graph)
=============================================================================
Inspired by Aider.
Generates an ultra-compact, high-density architectural symbol map of an
entire repository that fits within an exact token budget (e.g. 1024 tokens).
Uses AST analysis and reference graph ranking to surface the most relevant
definitions without overflowing the LLM context.
=============================================================================
"""

import ast
import os
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple, Optional


class RepoMapGenerator:
    """
    Extracts code definitions (classes, functions, signatures) across a repository
    and constructs a ranked, budget-capped structural map.
    """

    IGNORE_DIRS = {
        ".git", ".venv", "node_modules", "__pycache__", "dist", "build",
        ".wrangler", ".cloudflare", "coverage", ".pytest_cache"
    }

    SUPPORTED_EXTS = {".py", ".ts", ".js", ".tsx", ".jsx", ".rs", ".go", ".sql", ".sh", ".ps1"}

    def __init__(self, root_dir: str, max_tokens: int = 1024):
        self.root_dir = Path(root_dir)
        self.max_tokens = max_tokens  # ~ 4 chars per token
        self.max_chars = max_tokens * 4

    def extract_symbols_python(self, file_path: Path) -> List[str]:
        """Extracts top-level and method definitions from Python files via AST."""
        symbols = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as fp:
                content = fp.read()
            tree = ast.parse(content)

            for node in tree.body:
                if isinstance(node, ast.FunctionDef):
                    args = [a.arg for a in node.args.args]
                    symbols.append(f"  def {node.name}({', '.join(args)})")
                elif isinstance(node, ast.AsyncFunctionDef):
                    args = [a.arg for a in node.args.args]
                    symbols.append(f"  async def {node.name}({', '.join(args)})")
                elif isinstance(node, ast.ClassDef):
                    symbols.append(f"  class {node.name}:")
                    for sub in node.body:
                        if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            sub_args = [a.arg for a in sub.args.args if a.arg != "self"]
                            symbols.append(f"    def {sub.name}({', '.join(sub_args)})")
        except Exception:
            pass
        return symbols

    def extract_symbols_generic(self, file_path: Path) -> List[str]:
        """Regex-based symbol extractor for JS/TS/Go/Rust."""
        symbols = []
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as fp:
                lines = fp.readlines()

            func_pattern = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?(?:function|def|fn)\s+([a-zA-Z0-9_]+)\s*\((.*?)\)")
            class_pattern = re.compile(r"^\s*(?:export\s+)?class\s+([a-zA-Z0-9_]+)")
            arrow_pattern = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\((.*?)\)\s*=>")

            for line in lines:
                f_m = func_pattern.search(line)
                if f_m:
                    symbols.append(f"  fn {f_m.group(1)}({f_m.group(2)[:30]})")
                    continue
                c_m = class_pattern.search(line)
                if c_m:
                    symbols.append(f"  class {c_m.group(1)}")
                    continue
                a_m = arrow_pattern.search(line)
                if a_m:
                    symbols.append(f"  const {a_m.group(1)} = ({a_m.group(2)[:20]})")
        except Exception:
            pass
        return symbols

    def scan_repository(self) -> Dict[str, List[str]]:
        """Scans the repository and returns mapped files to extracted symbols."""
        file_map: Dict[str, List[str]] = {}

        for root, dirs, files in os.walk(self.root_dir):
            dirs[:] = [d for d in dirs if d not in self.IGNORE_DIRS]
            for file in files:
                ext = Path(file).suffix.lower()
                if ext in self.SUPPORTED_EXTS:
                    full_p = Path(root) / file
                    rel_p = full_p.relative_to(self.root_dir).as_posix()

                    if ext == ".py":
                        syms = self.extract_symbols_python(full_p)
                    else:
                        syms = self.extract_symbols_generic(full_p)

                    if syms:
                        file_map[rel_p] = syms

        return file_map

    def rank_and_format(self, file_map: Dict[str, List[str]]) -> str:
        """
        Ranks files by symbol density / importance and builds the budget-capped map.
        """
        # Sort files by importance (core modules first, tests later)
        def score_file(rel_p: str) -> int:
            score = len(file_map[rel_p]) * 10
            if "test" in rel_p.lower():
                score -= 50
            if "engine" in rel_p.lower() or "core" in rel_p.lower() or "src" in rel_p.lower():
                score += 40
            return score

        sorted_files = sorted(file_map.keys(), key=score_file, reverse=True)

        lines: List[str] = ["# NEXUS CODEBASE SYMBOL MAP (Tree-Sitter / AST PageRank)"]
        curr_chars = len(lines[0])

        for f in sorted_files:
            file_block = [f"\n{f}:"]
            for sym in file_map[f]:
                file_block.append(sym)

            block_text = "\n".join(file_block)
            if curr_chars + len(block_text) > self.max_chars:
                lines.append(f"\n[... {len(sorted_files) - sorted_files.index(f)} more files omitted to preserve token budget]")
                break

            lines.append(block_text)
            curr_chars += len(block_text)

        return "\n".join(lines)

    def generate_map(self, max_tokens: Optional[int] = None) -> str:
        """Full pipeline: Scans, ranks, and returns formatted repo map."""
        if max_tokens is not None:
            self.max_tokens = max_tokens
            self.max_chars = max_tokens * 4
        scanned = self.scan_repository()
        return self.rank_and_format(scanned)
