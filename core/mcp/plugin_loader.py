"""Nexus OS v5.0 - Dynamic @nexus_tool Plugin Auto-Discovery & Security Loader.

Discovers, validates, registers, and manages drop-in MCP plugins from core/mcp/plugins/*.py:
- Auto-discovers functions decorated with @nexus_tool(name, description, dependencies, agent, requires_approval)
- Dynamically checks dependencies; if missing, invokes subprocess with uv/pip install to fetch them at runtime
- Enforces WorkspaceGovernor (strictly blocks external network/device execution in [SILENT] air-gapped mode)
- Enforces ScopeGuard (Notch HUD Allow/Deny HITL check if requires_approval=True or sensitive action)
- Dynamically attaches tools to FastMCP server and exports metadata for GET /api/mcp/tools
"""

from __future__ import annotations

import functools
import importlib
import importlib.metadata
import importlib.util
import inspect
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Set, Union

from core.runtime.workspaces import WorkspaceGovernor
from core.runtime.scope_guard import ScopeGuard, ScopeViolationError
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugin_loader")

# Global registry of loaded @nexus_tool plugins
REGISTERED_TOOLS: Dict[str, Dict[str, Any]] = {}
# Backwards-compatibility alias
REGISTERED_NEXUS_TOOLS: Dict[str, Dict[str, Any]] = REGISTERED_TOOLS

_governor = WorkspaceGovernor()
_scope_guard = ScopeGuard()

# External network / device tools blocked in SILENT air-gapped mode
EXTERNAL_NETWORK_DEVICE_TOOLS: Set[str] = {
    "smart_light_control",
    "printer_3d_status",
    "live_subtitle_stream",
    "web_grounded_brief",
    "web_grounded_search",
    "google_calendar_plugin",
    "android_adb_plugin",
    "android_adb_control",
    "agent_reach_plugin",
}


def is_external_network_or_device_tool(tool_name: str, meta: Dict[str, Any]) -> bool:
    """Returns True if the tool communicates with external network endpoints or hardware devices."""
    if (
        meta.get("external")
        or meta.get("network")
        or meta.get("device")
        or meta.get("is_network")
        or meta.get("is_hardware")
        or meta.get("is_device")
    ):
        return True
    return tool_name.strip().lower() in EXTERNAL_NETWORK_DEVICE_TOOLS

# Known package distribution name to python module import name mappings
PACKAGE_MODULE_MAPPINGS: Dict[str, str] = {
    "pillow": "PIL",
    "pyyaml": "yaml",
    "google-api-python-client": "googleapiclient",
    "google-auth": "google.auth",
    "google-auth-oauthlib": "google_auth_oauthlib",
    "opencv-python": "cv2",
    "scikit-learn": "sklearn",
    "beautifulsoup4": "bs4",
    "pydantic-core": "pydantic_core",
}


def parse_package_name(spec: str) -> str:
    """Extracts raw package name from requirement specifier (e.g. 'requests>=2.28' -> 'requests')."""
    clean = spec.strip()
    match = re.match(r"^([a-zA-Z0-9_\-\.]+)", clean)
    if match:
        return match.group(1)
    return clean


def is_package_installed(package_spec: str) -> bool:
    """
    Checks whether a Python package dependency is installed in the current environment.
    Tries importlib.metadata distribution lookup, module find_spec, and known package aliases.
    """
    pkg_name = parse_package_name(package_spec)
    norm_name = pkg_name.lower().replace("-", "_")

    # 1. Check via importlib.metadata distribution
    try:
        importlib.metadata.version(pkg_name)
        return True
    except (importlib.metadata.PackageNotFoundError, Exception):
        pass

    try:
        importlib.metadata.version(norm_name)
        return True
    except (importlib.metadata.PackageNotFoundError, Exception):
        pass

    # 2. Check known module mapping
    mapped_module = PACKAGE_MODULE_MAPPINGS.get(pkg_name.lower())
    if mapped_module:
        try:
            if importlib.util.find_spec(mapped_module) is not None:
                return True
        except Exception:
            pass

    # 3. Check direct module find_spec
    for candidate in (pkg_name, norm_name):
        try:
            if importlib.util.find_spec(candidate) is not None:
                return True
        except Exception:
            pass

    return False


def _find_uv_binary() -> Optional[str]:
    """Locates uv executable if present in PATH or standard user directories."""
    which_uv = shutil.which("uv")
    if which_uv:
        return which_uv

    candidates = [
        Path.home() / ".local" / "bin" / "uv.exe",
        Path.home() / ".cargo" / "bin" / "uv.exe",
        Path("C:/Users/NiranX/.local/bin/uv.exe"),
        Path(sys.prefix) / "Scripts" / "uv.exe",
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def install_dependency(package_spec: str, timeout: float = 15.0) -> bool:
    """
    Dynamically installs a missing dependency at runtime using uv pip install or fallback pip install.
    """
    if os.environ.get("NEXUS_SKIP_DEP_INSTALL") == "1":
        logger.info("[MCP_PLUGIN_LOADER] NEXUS_SKIP_DEP_INSTALL active; skipping '%s'.", package_spec)
        return False

    logger.info("[MCP_PLUGIN_LOADER] Installing missing dependency '%s' at runtime...", package_spec)

    # Attempt 1: Try uv pip install
    uv_path = _find_uv_binary()
    if uv_path:
        try:
            cmd = [uv_path, "pip", "install", "--python", sys.executable, package_spec]
            logger.info("[MCP_PLUGIN_LOADER] Executing: %s", " ".join(cmd))
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if proc.returncode == 0:
                logger.info("[MCP_PLUGIN_LOADER] Successfully installed '%s' via uv.", package_spec)
                importlib.invalidate_caches()
                return True
            else:
                logger.warning(
                    "[MCP_PLUGIN_LOADER] uv pip install failed (code %d): %s. Falling back to pip.",
                    proc.returncode,
                    proc.stderr.strip() or proc.stdout.strip(),
                )
        except Exception as exc:
            logger.warning("[MCP_PLUGIN_LOADER] uv execution failed: %s. Falling back to pip.", exc)

    # Attempt 2: Standard pip install via sys.executable
    try:
        cmd = [sys.executable, "-m", "pip", "install", package_spec]
        logger.info("[MCP_PLUGIN_LOADER] Executing fallback: %s", " ".join(cmd))
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if proc.returncode == 0:
            logger.info("[MCP_PLUGIN_LOADER] Successfully installed '%s' via pip.", package_spec)
            importlib.invalidate_caches()
            return True
        else:
            logger.error(
                "[MCP_PLUGIN_LOADER] pip install failed (code %d): %s",
                proc.returncode,
                proc.stderr.strip() or proc.stdout.strip(),
            )
            return False
    except Exception as exc:
        logger.error("[MCP_PLUGIN_LOADER] Subprocess pip execution exception: %s", exc)
        return False


def ensure_dependencies(dependencies: Optional[List[str]]) -> Dict[str, bool]:
    """
    Checks each dependency; if missing, invokes uv/pip install to fetch it at runtime.
    Returns status map {dep: is_satisfied}.
    """
    results: Dict[str, bool] = {}
    if not dependencies:
        return results

    for dep in dependencies:
        dep_str = str(dep).strip()
        if not dep_str:
            continue
        if is_package_installed(dep_str):
            results[dep_str] = True
        else:
            success = install_dependency(dep_str)
            results[dep_str] = success
    return results


def nexus_tool(
    name: str,
    description: str,
    dependencies: Optional[List[str]] = None,
    agent: str = "SCOUT-01",
    requires_approval: bool = False,
    **kwargs: Any,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """
    Decorator designating a Python function as a drop-in Nexus MCP tool plugin.

    Args:
        name: Unique tool identifier (e.g. 'web_grounded_brief', 'calendar_manage').
        description: Functional description provided to LLM planner and MCP clients.
        dependencies: Optional list of package dependencies required by this tool (e.g. ['pillow', 'winocr']).
        agent: Primary agent affinity (e.g. 'SCOUT-01', 'OPS-01', 'SYS-01', 'DEV-01').
        requires_approval: If True, forces ScopeGuard Notch HUD HITL Allow/Deny confirmation.
    """
    dep_list = list(dependencies) if dependencies else []

    # Check and dynamically install missing dependencies at decoration/registration time
    if dep_list:
        try:
            ensure_dependencies(dep_list)
        except Exception as exc:
            logger.warning("[MCP_PLUGIN_LOADER] Error ensuring dependencies for '%s': %s", name, exc)

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        try:
            from core.mcp.schema_generator import function_to_genai_declaration
            genai_decl = function_to_genai_declaration(fn, name_override=name, description_override=description)
        except Exception as exc:
            logger.debug("GenAI declaration generation bypassed for '%s': %s", name, exc)
            genai_decl = None

        meta = {
            "name": name,
            "description": description,
            "dependencies": dep_list,
            "agent": agent,
            "requires_approval": requires_approval,
            "func_name": fn.__name__,
            "module": fn.__module__,
            "genai_declaration": genai_decl,
            **kwargs,
        }
        setattr(fn, "_nexus_tool_meta", meta)
        setattr(fn, "_nexus_tool", meta)
        setattr(fn, "genai_declaration", genai_decl)
        return fn

    return decorator


def wrap_tool_with_governance(fn: Callable[..., Any], meta: Dict[str, Any]) -> Callable[..., Any]:
    """
    Wraps plugin execution with WorkspaceGovernor air-gap enforcement,
    ScopeGuard HITL policy checks, dynamic dependency verification, and telemetry pulse recording.
    """
    tool_name = meta["name"]
    agent_id = meta.get("agent", "SCOUT-01")
    requires_approval = meta.get("requires_approval", False)
    deps = meta.get("dependencies", [])

    @functools.wraps(fn)
    def secured_plugin_wrapper(*args: Any, **kwargs: Any) -> Any:
        start_t = time.perf_counter()

        # 0. Dynamic dependency verification at invocation
        if deps:
            missing = [d for d in deps if not is_package_installed(d)]
            if missing:
                install_res = ensure_dependencies(missing)
                failed = [d for d, ok in install_res.items() if not ok]
                if failed:
                    raise ImportError(
                        f"[MCP_PLUGIN_LOADER] Missing required dependencies for tool '{tool_name}': {failed}"
                    )

        active_mode = _governor.get_mode().upper()

        # 1. WorkspaceGovernor Air-Gap Check (SILENT mode blocks external/network tools)
        if active_mode == "SILENT" and is_external_network_or_device_tool(tool_name, meta):
            raise PermissionError(
                f"[WORKSPACE GOVERNOR] Tool '{tool_name}' execution is blocked in SILENT air-gapped mode."
            )

        # 2. ScopeGuard HITL Approval Check
        action_desc = kwargs.get("action", "") or (args[0] if args and isinstance(args[0], str) else "")
        target_desc = f"{tool_name}::{action_desc}" if action_desc else tool_name

        if requires_approval or (action_desc and str(action_desc).lower() in ("delete", "remove", "drop", "wipe", "purge")):
            action_label = f"confirm:{tool_name}:{action_desc}" if requires_approval else (f"{tool_name}:{action_desc}" if action_desc else tool_name)
            try:
                _scope_guard.check_ui_action(
                    label=action_label,
                    target=target_desc,
                    auto_approve=False,
                )
            except ScopeViolationError:
                raise
            except Exception:
                pass
            raise ScopeViolationError(
                f"[SCOPE-GUARD HITL BLOCKED] High-risk UI action '{action_label}' on '{target_desc}' "
                "requires interactive Allow / Deny approval on Nexus Notch HUD."
            )

        # 3. Emit circuit pulse telemetry
        emit_telemetry_event(
            "circuit_pulse",
            {
                "node": "MCP_SKILLS",
                "active": True,
                "detail": f"{agent_id}::{tool_name}",
                "latency_ms": 1.0,
            },
        )

        try:
            result = fn(*args, **kwargs)
            elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
            logger.info("[MCP_PLUGIN] Executed '%s' in %.2fms", tool_name, elapsed_ms)
            return result
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
            logger.error("[MCP_PLUGIN_ERROR] Tool '%s' failed after %.2fms: %s", tool_name, elapsed_ms, exc)
            raise

    # Preserve signature and metadata for FastMCP inspection
    secured_plugin_wrapper.__signature__ = inspect.signature(fn)  # type: ignore
    setattr(secured_plugin_wrapper, "_nexus_tool_meta", meta)
    setattr(secured_plugin_wrapper, "__name__", fn.__name__)
    setattr(secured_plugin_wrapper, "__doc__", meta.get("description", fn.__doc__))
    return secured_plugin_wrapper


def load_all_plugins(
    directory: Optional[Union[str, Path]] = None,
    mcp_server: Any = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Automatically scans and imports all plugin modules inside core/mcp/plugins/
    (or custom directory), wraps them with security governance and dynamic dependencies,
    and updates the global REGISTERED_TOOLS dictionary.

    Args:
        directory: Directory path to scan (defaults to core/mcp/plugins).
        mcp_server: Optional FastMCP server instance to register tools into.

    Returns:
        The global REGISTERED_TOOLS dictionary mapping tool_name -> tool_record.
    """
    if directory is None or (isinstance(directory, str) and not directory.strip()):
        plugin_dir = Path(__file__).resolve().parent / "plugins"
    else:
        plugin_dir = Path(directory).resolve()

    if not plugin_dir.exists() or not plugin_dir.is_dir():
        logger.warning("Plugin directory '%s' does not exist.", plugin_dir)
        return REGISTERED_TOOLS

    try:
        from core.mcp.agent_shield import AgentShieldAuditor
        auditor = AgentShieldAuditor()
    except Exception:
        auditor = None

    for py_file in sorted(plugin_dir.glob("*.py")):
        if py_file.name.startswith("__"):
            continue

        # AgentShield Quarantine Check
        if auditor and (auditor.is_quarantined(py_file.name) or auditor.is_quarantined(str(py_file))):
            logger.warning("[AGENT_SHIELD] Plugin '%s' is QUARANTINED due to critical security findings. Skipping.", py_file.name)
            continue

        mod_name = f"core.mcp.plugins.{py_file.stem}"
        try:
            spec = importlib.util.spec_from_file_location(mod_name, py_file)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            sys.modules[mod_name] = module
            spec.loader.exec_module(module)

            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if callable(attr) and hasattr(attr, "_nexus_tool_meta"):
                    meta = getattr(attr, "_nexus_tool_meta")
                    tool_name = meta["name"]
                    secured_fn = wrap_tool_with_governance(attr, meta)

                    # Attach to FastMCP server if provided
                    if mcp_server is not None:
                        try:
                            if hasattr(mcp_server, "tool"):
                                mcp_decorator = mcp_server.tool(name=tool_name, description=meta["description"])
                                mcp_decorator(secured_fn)
                            elif hasattr(mcp_server, "_tools") and isinstance(mcp_server._tools, dict):
                                mcp_server._tools[tool_name] = secured_fn
                        except Exception as exc:
                            logger.warning("Could not register '%s' into MCP server instance: %s", tool_name, exc)

                    # Automatically register tool into sub-50ms reflex router
                    try:
                        from core.runtime.reflex_router import register_tool_as_reflex
                        register_tool_as_reflex(tool_name, secured_fn, description=meta.get("description", ""))
                    except Exception as exc:
                        logger.debug("Could not register '%s' into reflex router: %s", tool_name, exc)

                    genai_decl = meta.get("genai_declaration")
                    if not genai_decl:
                        try:
                            from core.mcp.schema_generator import function_to_genai_declaration
                            genai_decl = function_to_genai_declaration(attr, name_override=tool_name, description_override=meta.get("description"))
                        except Exception:
                            genai_decl = None

                    tool_record = {
                        "name": tool_name,
                        "description": meta["description"],
                        "dependencies": meta.get("dependencies", []),
                        "agent": meta.get("agent", "SCOUT-01"),
                        "requires_approval": meta.get("requires_approval", False),
                        "plugin_file": py_file.name,
                        "file_path": str(py_file),
                        "func_name": meta.get("func_name", attr.__name__),
                        "callable": attr,
                        "secured_callable": secured_fn,
                        "genai_declaration": genai_decl,
                    }
                    REGISTERED_TOOLS[tool_name] = tool_record
                    logger.info("Loaded & registered @nexus_tool: %s (%s) from %s", tool_name, tool_record["agent"], py_file.name)
        except Exception as exc:
            logger.error("Failed to load plugin module '%s': %s", py_file.name, exc)

    return REGISTERED_TOOLS


def discover_plugins(plugin_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    """
    Scans the plugins directory and imports all modules containing @nexus_tool decorated functions.
    Preserved for backwards-compatibility.
    """
    if plugin_dir is None:
        plugin_dir = Path(__file__).resolve().parent / "plugins"

    tools_dict = load_all_plugins(directory=plugin_dir)
    return list(tools_dict.values())


def discover_and_register_plugins(mcp_server: Any = None) -> List[Dict[str, Any]]:
    """
    Discovers all plugins in core/mcp/plugins/, wraps them with security governance,
    registers them into the provided MCP server, and updates the global tools registry.
    Preserved for backwards-compatibility.
    """
    tools_dict = load_all_plugins(mcp_server=mcp_server)
    return list(tools_dict.values())


def get_registered_tools() -> List[Dict[str, Any]]:
    """Returns metadata for all registered @nexus_tool plugins for REST/IPC exposure."""
    return [
        {
            "name": data["name"],
            "description": data["description"],
            "dependencies": data.get("dependencies", []),
            "agent": data["agent"],
            "requires_approval": data["requires_approval"],
            "plugin_file": data.get("plugin_file", ""),
            "func_name": data["func_name"],
            "genai_declaration": data.get("genai_declaration"),
        }
        for data in REGISTERED_TOOLS.values()
    ]


def get_genai_tool_declarations() -> List[Dict[str, Any]]:
    """Returns all exportable Google GenAI FunctionDeclarations for loaded @nexus_tool plugins."""
    declarations: List[Dict[str, Any]] = []
    for data in REGISTERED_TOOLS.values():
        decl = data.get("genai_declaration")
        if decl:
            declarations.append(decl)
    return declarations


class PluginLoader:
    """Plugin Loader orchestrator wrapping plugin auto-discovery and AgentShield governance."""

    def __init__(
        self,
        plugins_dir: Optional[Union[str, Path]] = None,
        shield_auditor: Optional[Any] = None,
    ) -> None:
        self.plugins_dir = Path(plugins_dir) if plugins_dir else (Path(__file__).parent / "plugins")
        self.shield_auditor = shield_auditor

    def load_all_plugins(self, mcp_server: Any = None) -> Dict[str, Dict[str, Any]]:
        """Loads and governance-wraps all plugins from configured directory."""
        return load_all_plugins(directory=self.plugins_dir, mcp_server=mcp_server)

