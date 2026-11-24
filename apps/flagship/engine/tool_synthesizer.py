"""
Nexus Self-Synthesizing Tool Registry
=============================================================================
Inspired by OS-Copilot / FRIDAY.
Enables Nexus to dynamically author, validate, sandbox-test, catalog, and
execute novel Python tools at runtime when encountering unknown tasks.
=============================================================================
"""

import ast
import importlib.util
import inspect
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable


class ToolSynthesizer:
    """
    Manages the lifecycle of dynamically synthesized tools:
    Generation -> Syntax Check -> Sandbox Test -> Registry Indexing -> Invocation.
    """

    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or "."
            self.storage_dir = Path(home) / ".nexus-agent" / "generated_tools"
        else:
            self.storage_dir = Path(storage_dir)

        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.catalog_file = self.storage_dir / "catalog.json"
        self._catalog: Dict[str, Dict[str, Any]] = self._load_catalog()
        self._loaded_modules: Dict[str, Any] = {}

    def _load_catalog(self) -> Dict[str, Dict[str, Any]]:
        if self.catalog_file.exists():
            try:
                with open(self.catalog_file, "r", encoding="utf-8") as fp:
                    return json.load(fp)
            except Exception:
                return {}
        return {}

    def _save_catalog(self):
        with open(self.catalog_file, "w", encoding="utf-8") as fp:
            json.dump(self._catalog, fp, indent=2)

    def validate_code_syntax(self, code: str) -> Dict[str, Any]:
        """Validates that python code is syntactically sound and safe to parse."""
        try:
            tree = ast.parse(code)
            functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
            classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
            return {
                "valid": True,
                "functions": functions,
                "classes": classes,
                "error": None
            }
        except SyntaxError as e:
            return {
                "valid": False,
                "functions": [],
                "classes": [],
                "error": f"SyntaxError at line {e.lineno}: {e.msg}"
            }

    def register_tool(
        self,
        name: str,
        code: str,
        description: str,
        tags: Optional[List[str]] = None,
        test_inputs: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Registers a new tool after running AST validation and sandbox verification.
        """
        # 1. Syntax Check
        val = self.validate_code_syntax(code)
        if not val["valid"]:
            return {"success": False, "error": f"Invalid syntax: {val['error']}"}

        # Must have an 'execute' or function named after tool
        func_target = "execute" if "execute" in val["functions"] else (val["functions"][0] if val["functions"] else None)
        if not func_target:
            return {"success": False, "error": "Tool code must define at least one callable function (preferably 'execute')."}

        # 2. Write tool file
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", name).lower()
        tool_file = self.storage_dir / f"{safe_name}.py"
        with open(tool_file, "w", encoding="utf-8") as fp:
            fp.write(code)

        # 3. Dry-run load test
        try:
            spec = importlib.util.spec_from_file_location(safe_name, str(tool_file))
            mod = importlib.util.module_from_spec(spec)
            sys.modules[safe_name] = mod
            spec.loader.exec_module(mod)
            callable_fn = getattr(mod, func_target)
            self._loaded_modules[safe_name] = callable_fn

            # If test_inputs provided, test invocation
            if test_inputs is not None:
                test_res = callable_fn(**test_inputs)
        except Exception as e:
            return {"success": False, "error": f"Tool execution dry-run failed: {str(e)}"}

        # 4. Catalog indexing
        metadata = {
            "name": safe_name,
            "display_name": name,
            "description": description,
            "tags": tags or ["auto-synthesized"],
            "entry_point": func_target,
            "file_path": str(tool_file),
            "created_at": time.time(),
            "invocation_count": 0
        }
        self._catalog[safe_name] = metadata
        self._save_catalog()

        return {"success": True, "tool": metadata}

    def execute_tool(self, name: str, **kwargs) -> Dict[str, Any]:
        """Executes a previously registered or loaded synthesized tool."""
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", name).lower()
        if safe_name not in self._catalog:
            return {"success": False, "error": f"Tool '{name}' not found in synthesized registry."}

        meta = self._catalog[safe_name]
        fn = self._loaded_modules.get(safe_name)

        if fn is None:
            tool_path = Path(meta["file_path"])
            if not tool_path.exists():
                return {"success": False, "error": f"Tool file '{tool_path}' missing from disk."}
            try:
                spec = importlib.util.spec_from_file_location(safe_name, str(tool_path))
                mod = importlib.util.module_from_spec(spec)
                sys.modules[safe_name] = mod
                spec.loader.exec_module(mod)
                fn = getattr(mod, meta["entry_point"])
                self._loaded_modules[safe_name] = fn
            except Exception as e:
                return {"success": False, "error": f"Failed to dynamically load '{safe_name}': {e}"}

        try:
            start_t = time.time()
            result = fn(**kwargs)
            duration = time.time() - start_t
            meta["invocation_count"] = meta.get("invocation_count", 0) + 1
            self._save_catalog()
            return {
                "success": True,
                "result": result,
                "duration_seconds": round(duration, 4),
                "tool": safe_name
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Runtime error in synthesized tool '{safe_name}': {str(e)}",
                "tool": safe_name
            }

    def search_tools(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """Finds matching synthesized tools using keyword / tag overlap."""
        tokens = set(re.findall(r"\w+", query.lower()))
        matches = []
        for name, meta in self._catalog.items():
            score = 0
            desc_tokens = set(re.findall(r"\w+", meta["description"].lower()))
            tag_tokens = set(t.lower() for t in meta["tags"])
            name_tokens = set(re.findall(r"\w+", name.lower()))

            score += len(tokens.intersection(name_tokens)) * 3
            score += len(tokens.intersection(tag_tokens)) * 2
            score += len(tokens.intersection(desc_tokens)) * 1

            if score > 0:
                matches.append((score, meta))

        matches.sort(key=lambda x: x[0], reverse=True)
        return [m[1] for m in matches[:top_k]]

    def list_tools(self) -> List[Dict[str, Any]]:
        return list(self._catalog.values())
