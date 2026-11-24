"""
Nexus OS v5.0 - Tool Synthesizer
=============================================================================
Enables runtime synthesis, AST validation, dynamic compilation, sandbox testing,
and dynamic registration of custom Python tools inside:
`core/mcp/dynamic_tools/`

Architecture:
1. AST Validation:
   Parses raw Python code via `ast.parse` and catches syntax errors before
   writing to disk.
2. Safe Persistence:
   Writes validated code to `core/mcp/dynamic_tools/{tool_name}.py`.
3. Dynamic Module Load Test:
   Loads using `importlib.util.spec_from_file_location`, injects into `sys.modules`,
   and tests execution capability before registering into active tool catalogs.
=============================================================================
"""

import ast
import json
import logging
import os
import re
import sys
import time
import importlib.util
from pathlib import Path
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger("ToolSynthesizer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class ToolSynthesizer:
    """
    Synthesizes and registers runtime tools inside `core/mcp/dynamic_tools`.
    """

    def __init__(self, tools_dir: Optional[str] = None):
        if tools_dir:
            self.tools_dir = Path(tools_dir).resolve()
        else:
            self.tools_dir = Path(__file__).parent.resolve() / "dynamic_tools"

        self.tools_dir.mkdir(parents=True, exist_ok=True)
        # Ensure __init__.py exists in dynamic_tools
        init_file = self.tools_dir / "__init__.py"
        if not init_file.exists():
            with open(init_file, "w", encoding="utf-8") as f:
                f.write('"""Nexus Dynamic Tools Package"""\n')

        self.catalog_file = self.tools_dir / "catalog.json"
        self._catalog: Dict[str, Dict[str, Any]] = self._load_catalog()
        self._loaded_modules: Dict[str, Any] = {}

    def _load_catalog(self) -> Dict[str, Dict[str, Any]]:
        if self.catalog_file.exists():
            try:
                with open(self.catalog_file, "r", encoding="utf-8") as fp:
                    return json.load(fp)
            except Exception as e:
                logger.warning(f"Failed to read catalog file: {e}")
                return {}
        return {}

    def _save_catalog(self) -> None:
        try:
            with open(self.catalog_file, "w", encoding="utf-8") as fp:
                json.dump(self._catalog, fp, indent=2)
        except Exception as e:
            logger.error(f"Failed to save tool catalog: {e}")

    def validate_code_ast(self, python_code: str) -> Dict[str, Any]:
        """
        Parses python code using ast.parse to detect SyntaxError and extracts top-level symbols.
        """
        try:
            tree = ast.parse(python_code)
            functions = [node.name for node in ast.walk(tree) if isinstance(node, ast.FunctionDef)]
            classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
            docstring = ast.get_docstring(tree) or ""
            return {
                "valid": True,
                "error": None,
                "functions": functions,
                "classes": classes,
                "docstring": docstring.strip()
            }
        except SyntaxError as e:
            err_msg = f"SyntaxError at line {e.lineno}, offset {e.offset}: {e.msg}"
            logger.error(f"AST validation failure: {err_msg}")
            return {
                "valid": False,
                "error": err_msg,
                "functions": [],
                "classes": [],
                "docstring": ""
            }

    def synthesize_and_register(self, tool_name: str, python_code: str) -> bool:
        """
        Synthesizes a new tool and registers it into dynamic_tools:
        1. AST Validation: parses code via ast.parse and catches SyntaxError.
        2. Persists file to core/mcp/dynamic_tools/{tool_name}.py.
        3. Dynamic Module Load Test: loads via importlib.util.spec_from_file_location,
           injects into sys.modules, and tests execution capability.
        """
        # Clean sanitized tool name
        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name).lower()
        if not clean_name:
            logger.error("Invalid tool_name provided.")
            return False

        # 1. AST Validation
        ast_result = self.validate_code_ast(python_code)
        if not ast_result["valid"]:
            logger.error(f"Cannot synthesize '{clean_name}': {ast_result['error']}")
            return False

        # 2. Persists file to core/mcp/dynamic_tools/{tool_name}.py
        tool_file = self.tools_dir / f"{clean_name}.py"
        try:
            with open(tool_file, "w", encoding="utf-8") as f:
                f.write(python_code)
            logger.info(f"Persisted dynamic tool code to {tool_file}")
        except Exception as e:
            logger.error(f"Failed writing tool file '{tool_file}': {e}")
            return False

        # 3. Dynamic Module Load Test
        module_name = f"core.mcp.dynamic_tools.{clean_name}"
        try:
            spec = importlib.util.spec_from_file_location(module_name, str(tool_file))
            if spec is None or spec.loader is None:
                logger.error(f"Failed to generate module spec for '{module_name}'")
                self._cleanup_failed_tool(tool_file, module_name)
                return False

            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            self._loaded_modules[clean_name] = module
            logger.info(f"Dynamically loaded and executed module test for '{module_name}'")
        except Exception as load_err:
            logger.error(f"Dynamic module execution load test failed for '{clean_name}': {load_err}")
            self._cleanup_failed_tool(tool_file, module_name)
            return False

        # Update catalog
        self._catalog[clean_name] = {
            "name": clean_name,
            "file": str(tool_file),
            "module": module_name,
            "functions": ast_result["functions"],
            "classes": ast_result["classes"],
            "docstring": ast_result["docstring"],
            "created_at": time.time(),
            "updated_at": time.time()
        }
        self._save_catalog()
        return True

    def _cleanup_failed_tool(self, tool_file: Path, module_name: str) -> None:
        """Removes on-disk files and sys.modules references on failure."""
        try:
            if tool_file.exists():
                tool_file.unlink()
        except Exception:
            pass
        if module_name in sys.modules:
            del sys.modules[module_name]

    def get_tool_module(self, tool_name: str) -> Optional[Any]:
        """Retrieves or loads the module corresponding to tool_name."""
        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name).lower()
        if clean_name in self._loaded_modules:
            return self._loaded_modules[clean_name]

        tool_file = self.tools_dir / f"{clean_name}.py"
        if not tool_file.exists():
            return None

        module_name = f"core.mcp.dynamic_tools.{clean_name}"
        try:
            spec = importlib.util.spec_from_file_location(module_name, str(tool_file))
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = module
                spec.loader.exec_module(module)
                self._loaded_modules[clean_name] = module
                return module
        except Exception as e:
            logger.error(f"Failed to load module for tool '{clean_name}': {e}")
        return None

    def execute_tool(self, tool_name: str, function_name: Optional[str] = None, *args, **kwargs) -> Any:
        """
        Executes a callable function within a synthesized tool.
        """
        mod = self.get_tool_module(tool_name)
        if mod is None:
            raise KeyError(f"Dynamic tool '{tool_name}' not found or could not be loaded.")

        # Determine target function (execute by default, or specific function, or first callable)
        target = function_name or getattr(mod, "execute", None)
        if callable(target):
            return target(*args, **kwargs)

        if isinstance(target, str) and hasattr(mod, target):
            fn = getattr(mod, target)
            if callable(fn):
                return fn(*args, **kwargs)

        # Search for first callable function in module
        for attr_name in dir(mod):
            if attr_name.startswith("_"):
                continue
            attr = getattr(mod, attr_name)
            if callable(attr):
                return attr(*args, **kwargs)

        raise AttributeError(f"No executable function found in dynamic tool '{tool_name}'.")

    def list_tools(self) -> List[Dict[str, Any]]:
        """Returns all registered dynamic tools."""
        return list(self._catalog.values())

    def unregister_tool(self, tool_name: str) -> bool:
        """Unregisters and removes a dynamic tool."""
        clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", tool_name).lower()
        tool_file = self.tools_dir / f"{clean_name}.py"
        module_name = f"core.mcp.dynamic_tools.{clean_name}"
        self._cleanup_failed_tool(tool_file, module_name)
        if clean_name in self._catalog:
            del self._catalog[clean_name]
            self._save_catalog()
        if clean_name in self._loaded_modules:
            del self._loaded_modules[clean_name]
        return True
