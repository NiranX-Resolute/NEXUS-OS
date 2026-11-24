"""
Nexus OS v5.0 - Unified MCP Bus
=============================================================================
FastMCP bus coordinating:
1. Filesystem Tools: Safe, sandboxed read/write/list operations.
2. Git Tools: Branch status, diffs, commits, and log history.
3. Obscura Browser: Stealth CDP navigation and text extraction.
4. Dynamic Synthesized Tools: Runtime tool compilation and invocation.
=============================================================================
"""

import os
import sys
import json
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional

# Ensure core package is on sys.path
CURRENT_DIR = Path(__file__).parent.resolve()
CORE_DIR = CURRENT_DIR.parent.resolve()
WORKSPACE_ROOT = CORE_DIR.parent.resolve()
if str(CORE_DIR) not in sys.path:
    sys.path.insert(0, str(CORE_DIR))
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from core.mcp.obscura_mcp_server import stealth_navigate, ensure_obscura_running
from core.mcp.tool_synthesizer import ToolSynthesizer

logger = logging.getLogger("NexusMCPBus")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Import FastMCP or fallback shim
try:
    from mcp.server.fastmcp import FastMCP
    HAS_FASTMCP = True
except ImportError:
    HAS_FASTMCP = False

    class FastMCP:  # type: ignore
        def __init__(self, name: str):
            self.name = name
            self._tools: Dict[str, Any] = {}

        def tool(self):
            def decorator(fn):
                self._tools[fn.__name__] = fn
                return fn
            return decorator

        def run(self):
            print(f"[{self.name}] FastMCP bus running with tools: {list(self._tools.keys())}")


# FastMCP Server Instance
mcp = FastMCP("NexusMCPBus")
_synthesizer = ToolSynthesizer()


# ---------------------------------------------------------------------------
# Security Guardrails for Filesystem Access
# ---------------------------------------------------------------------------
FORBIDDEN_PATH_PREFIXES = [
    r"C:\Windows",
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/var/run"
]


def _is_path_safe(target_path: str) -> bool:
    """Verifies that the target path does not violate OS system boundary protections."""
    try:
        normalized_raw = target_path.replace("\\", "/").lower()
        resolved_normalized = str(Path(target_path).resolve()).replace("\\", "/").lower()
        for forbidden in FORBIDDEN_PATH_PREFIXES:
            norm_forbidden = forbidden.replace("\\", "/").lower()
            # Check against raw path
            if normalized_raw.startswith(norm_forbidden) or normalized_raw.startswith("/" + norm_forbidden.lstrip("/")):
                return False
            # Check against resolved path
            if resolved_normalized.startswith(norm_forbidden):
                return False
            # On Windows, check drive-prefixed paths e.g. C:/Windows or C:/etc
            if ":" in resolved_normalized:
                drive_stripped = resolved_normalized.split(":", 1)[1]
                if drive_stripped.startswith(norm_forbidden) or drive_stripped.startswith("/" + norm_forbidden.lstrip("/")):
                    return False
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 1. Filesystem Tools
# ---------------------------------------------------------------------------
@mcp.tool()
def fs_read_file(path: str, max_bytes: int = 100000) -> str:
    """
    Reads the content of a file within allowed filesystem boundaries.
    """
    if not _is_path_safe(path):
        return f"Error: Path access denied by security guardrail: '{path}'"

    p = Path(path)
    if not p.exists():
        return f"Error: File '{path}' does not exist."
    if not p.is_file():
        return f"Error: Path '{path}' is not a regular file."

    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_bytes)
        return content
    except Exception as e:
        return f"Error reading file '{path}': {str(e)}"


@mcp.tool()
def fs_write_file(path: str, content: str) -> str:
    """
    Safely writes text content to a destination file.
    """
    if not _is_path_safe(path):
        return f"Error: Write operation denied by security guardrail: '{path}'"

    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Success: Wrote {len(content)} characters to '{path}'"
    except Exception as e:
        return f"Error writing file '{path}': {str(e)}"


@mcp.tool()
def fs_list_dir(path: str = ".") -> str:
    """
    Lists directory entries with details.
    """
    if not _is_path_safe(path):
        return f"Error: Directory listing denied by security guardrail: '{path}'"

    p = Path(path)
    if not p.exists():
        return f"Error: Path '{path}' does not exist."
    if not p.is_dir():
        return f"Error: Path '{path}' is not a directory."

    try:
        items = []
        for entry in p.iterdir():
            t = "DIR" if entry.is_dir() else "FILE"
            size = entry.stat().st_size if entry.is_file() else 0
            items.append(f"[{t}] {entry.name} ({size} bytes)")
        return "\n".join(sorted(items)) if items else "(Empty directory)"
    except Exception as e:
        return f"Error listing directory '{path}': {str(e)}"


@mcp.tool()
def fs_file_exists(path: str) -> bool:
    """Checks whether a file or directory exists."""
    return Path(path).exists()


# ---------------------------------------------------------------------------
# 2. Git Tools
# ---------------------------------------------------------------------------
def _run_git(args: List[str], cwd: Optional[str] = None) -> str:
    working_dir = cwd or str(WORKSPACE_ROOT)
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=working_dir,
            capture_output=True,
            text=True,
            timeout=20
        )
        out = (res.stdout or "").strip()
        err = (res.stderr or "").strip()
        if res.returncode != 0:
            return f"[Git Error {res.returncode}]: {err or out}"
        return out if out else "(No output / clean)"
    except Exception as e:
        return f"[Git Exception]: {str(e)}"


@mcp.tool()
def git_status() -> str:
    """Returns the current git repository status."""
    return _run_git(["status", "--short", "--branch"])


@mcp.tool()
def git_diff(staged: bool = False) -> str:
    """Returns git diff (unstaged by default, or staged if staged=True)."""
    args = ["diff", "--cached"] if staged else ["diff"]
    return _run_git(args)


@mcp.tool()
def git_commit(message: str) -> str:
    """Commits staged changes with a commit message."""
    if not message.strip():
        return "Error: Commit message cannot be empty."
    return _run_git(["commit", "-m", message])


@mcp.tool()
def git_log(limit: int = 5) -> str:
    """Returns recent commit history log."""
    return _run_git(["log", f"-n{max(1, limit)}", "--oneline", "--decorate"])


# ---------------------------------------------------------------------------
# 3. Obscura Stealth Browser Tool
# ---------------------------------------------------------------------------
@mcp.tool()
async def browser_stealth_navigate(url: str) -> str:
    """
    Performs stealth browser navigation via Obscura CDP, extracting
    safe text content truncated to 10,000 characters.
    """
    return await stealth_navigate(url)


# ---------------------------------------------------------------------------
# 4. Dynamic Tool Synthesizer Tools
# ---------------------------------------------------------------------------
@mcp.tool()
def synthesize_custom_tool(name: str, python_code: str) -> str:
    """
    Synthesizes and dynamically registers a new tool:
    1. Validates AST syntax.
    2. Persists to core/mcp/dynamic_tools/{name}.py.
    3. Loads and tests module execution.
    """
    success = _synthesizer.synthesize_and_register(name, python_code)
    if success:
        return f"Success: Dynamic tool '{name}' successfully compiled, validated, and registered."
    return f"Error: Failed to synthesize and register dynamic tool '{name}'. Check syntax and module requirements."


@mcp.tool()
def execute_custom_tool(tool_name: str, arguments_json: str = "{}") -> str:
    """
    Executes a previously synthesized dynamic tool with provided JSON arguments.
    """
    try:
        kwargs = json.loads(arguments_json) if arguments_json else {}
    except Exception as e:
        return f"Error parsing arguments JSON: {e}"

    try:
        result = _synthesizer.execute_tool(tool_name, **kwargs)
        return json.dumps({"success": True, "output": result}, default=str)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})


@mcp.tool()
def list_custom_tools() -> str:
    """
    Lists all dynamically registered synthesized tools.
    """
    tools = _synthesizer.list_tools()
    if not tools:
        return "No dynamic tools registered."
    return json.dumps(tools, indent=2)


# ---------------------------------------------------------------------------
# Programmatic Bus Wrapper
# ---------------------------------------------------------------------------
class NexusMCPBus:
    """
    Programmatic interface for the Nexus MCP bus.
    Can be used directly inside agents or spawned as an MCP server.
    """

    def __init__(self):
        self.mcp = mcp
        self.synthesizer = _synthesizer

    def ensure_obscura(self) -> bool:
        return ensure_obscura_running()

    async def navigate(self, url: str) -> str:
        return await stealth_navigate(url)

    def synthesize(self, name: str, code: str) -> bool:
        return self.synthesizer.synthesize_and_register(name, code)

    def execute(self, tool_name: str, **kwargs) -> Any:
        return self.synthesizer.execute_tool(tool_name, **kwargs)

    def run_server(self):
        """Starts the FastMCP server event loop."""
        self.mcp.run()


def create_mcp_bus() -> NexusMCPBus:
    """Factory function returning a configured NexusMCPBus instance."""
    return NexusMCPBus()


if __name__ == "__main__":
    logger.info("Initializing Nexus Unified MCP Bus...")
    mcp.run()
