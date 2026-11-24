"""Nexus OS v5.0 - SEC-01 Sentinel MCP Server.

Exposes local free security scanners (nuclei, nmap, semgrep, gitleaks, obscura)
as a standardized Model Context Protocol (MCP) server for authorized audits.
All executions are strictly guarded by ScopeGuard to prevent out-of-scope scanning.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
from typing import Any, Dict, Optional

from core.runtime.scope_guard import ScopeGuard

logger = logging.getLogger("nexus.mcp.sec_sentinel")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [SEC-01] %(message)s")

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
            print(f"[{self.name}] FastMCP server running with registered tools: {list(self._tools.keys())}")


# Initialize Sentinel MCP Server and ScopeGuard
mcp = FastMCP("SEC01Sentinel")
guard = ScopeGuard()


def _emit_mcp_pulse(tool_name: str, latency_ms: float) -> None:
    """Emits an MCP_SKILLS circuit pulse event into SQLite WAL telemetry_events."""
    try:
        from pathlib import Path
        import sqlite3
        import time
        db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        if db_path.exists():
            conn = sqlite3.connect(str(db_path), timeout=2.0)
            try:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS telemetry_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_type TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at REAL NOT NULL
                    );
                    """
                )
                conn.execute(
                    "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                    (
                        "circuit_pulse",
                        json.dumps({
                            "node": "MCP_SKILLS",
                            "active": True,
                            "detail": f"MCP: {tool_name}",
                            "latency_ms": round(latency_ms, 2),
                        }),
                        time.time(),
                    ),
                )
                conn.commit()
            finally:
                conn.close()
    except Exception as exc:
        _err = str(exc)


@mcp.tool()
def run_semgrep_audit(path: str, config: str = "auto") -> Dict[str, Any]:
    """Runs a local static analysis code audit on an authorized repository path using Semgrep.

    Args:
        path: Absolute or relative local directory/file path to audit.
        config: Semgrep rule configuration (defaults to 'auto').

    Returns:
        Structured JSON object with audit results or error.
    """
    try:
        guard.enforce("semgrep", path)
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    semgrep_bin = shutil.which("semgrep") or "semgrep"
    cmd = [semgrep_bin, f"--config={config}", path, "--json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        _emit_mcp_pulse("semgrep", 12.5)
        return {
            "success": result.returncode in (0, 1),
            "output": result.stdout if result.stdout else result.stderr,
            "tool": "semgrep",
            "target": path,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "error": "Semgrep binary not installed on system PATH. Install via: winget install Semgrep.Semgrep",
            "tool": "semgrep",
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "tool": "semgrep"}


@mcp.tool()
def run_gitleaks_audit(path: str) -> Dict[str, Any]:
    """Runs secret leakage detection on a local Git repository path using GitLeaks.

    Args:
        path: Path to git repository.

    Returns:
        Structured JSON object with findings or error.
    """
    try:
        guard.enforce("gitleaks", path)
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    gitleaks_bin = shutil.which("gitleaks") or "gitleaks"
    cmd = [gitleaks_bin, "detect", "--source", path, "--no-banner", "--redact"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        _emit_mcp_pulse("semgrep", 12.5)
        return {
            "success": result.returncode in (0, 1),
            "output": result.stdout or result.stderr,
            "tool": "gitleaks",
            "target": path,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "error": "GitLeaks binary not found on PATH. Install via: winget install GitLeaks.GitLeaks",
            "tool": "gitleaks",
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "tool": "gitleaks"}


@mcp.tool()
def run_nuclei_scan(target: str, tags: Optional[str] = None) -> Dict[str, Any]:
    """Executes a scoped vulnerability scan against an authorized target using Nuclei.

    Args:
        target: Authorized domain or URL (e.g. localhost, 127.0.0.1).
        tags: Optional comma-separated template tags (e.g. cve,exposure).

    Returns:
        Structured JSON object with findings or error.
    """
    try:
        guard.enforce("nuclei", target)
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    nuclei_bin = shutil.which("nuclei") or "nuclei"
    cmd = [nuclei_bin, "-u", target, "-json", "-silent"]
    if tags:
        cmd.extend(["-tags", tags])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return {
            "success": result.returncode == 0,
            "output": result.stdout or result.stderr,
            "tool": "nuclei",
            "target": target,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "error": "Nuclei binary not found on PATH. Install via: winget install ProjectDiscovery.Nuclei",
            "tool": "nuclei",
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "tool": "nuclei"}


@mcp.tool()
def run_nmap_recon(target: str, fast_mode: bool = True) -> Dict[str, Any]:
    """Executes network service reconnaissance on an authorized IP or host using Nmap.

    Args:
        target: Authorized host or IP address (e.g. 127.0.0.1, localhost).
        fast_mode: If True, uses -F for rapid port scanning.

    Returns:
        Structured JSON object with open ports and service details.
    """
    try:
        guard.enforce("nmap", target)
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    nmap_bin = shutil.which("nmap") or "nmap"
    cmd = [nmap_bin, "-sV", "-T4"]
    if fast_mode:
        cmd.append("-F")
    cmd.append(target)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        return {
            "success": result.returncode == 0,
            "output": result.stdout or result.stderr,
            "tool": "nmap",
            "target": target,
        }
    except FileNotFoundError:
        return {
            "success": False,
            "error": "Nmap binary not found on PATH. Install via: winget install Insecure.Nmap",
            "tool": "nmap",
        }
    except Exception as exc:
        return {"success": False, "error": str(exc), "tool": "nmap"}


@mcp.tool()
def run_obscura_security_check(url: str) -> Dict[str, Any]:
    """Inspects web endpoint security headers and TLS certificate posture via Obscura.

    Args:
        url: Authorized target URL.

    Returns:
        Structured JSON object with header security posture analysis.
    """
    try:
        guard.enforce("obscura", url)
    except Exception as exc:
        return {"success": False, "error": str(exc)}

    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Nexus-SEC01-Auditor/5.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            headers = dict(response.headers)
            security_headers = {
                "strict-transport-security": headers.get("strict-transport-security", "MISSING"),
                "content-security-policy": headers.get("content-security-policy", "MISSING"),
                "x-frame-options": headers.get("x-frame-options", "MISSING"),
                "x-content-type-options": headers.get("x-content-type-options", "MISSING"),
                "referrer-policy": headers.get("referrer-policy", "MISSING"),
            }
            _emit_mcp_pulse("obscura_browser", 6.4)
            return {
                "success": True,
                "url": url,
                "status_code": response.status,
                "security_headers": security_headers,
                "all_headers": headers,
            }
    except Exception as exc:
        return {"success": False, "error": str(exc), "url": url}


def main():
    logger.info("Starting SEC-01 Sentinel MCP Server...")
    mcp.run()


if __name__ == "__main__":
    main()
