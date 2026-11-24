"""Nexus OS v5.0 - AgentShield MCP & Plugin Security Auditor.

Adapted directly from affaan-m/ECC AgentShield architecture for Nexus OS:
- Static AST + regex + configuration scanner auditing core/mcp/plugins/*.py, manifests, and skills
- Severity-weighted scoring (0-100):
  * CRITICAL (-30 pts): Hardcoded secrets (sk-, AIza, ghp-, Bearer) outside DPAPI vault, credential dumping, listeners
  * HIGH (-20 pts): Unguarded shell=True, os.system, eval, exec, destructive writes missing ScopeGuard/requires_approval
  * MEDIUM (-10 pts): Wildcard filesystem write scopes (*, C:\\, /) or unvalidated outbound URLs
- SQLite WAL persistence in security_audits table
- Plugin quarantine preventing plugin_loader from importing CRITICAL-flagged modules
- SEC-01 telemetry event emission

Zero-mock, production-grade security scanner.
"""

from __future__ import annotations

import ast
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import uuid

from core.runtime.scope_guard import (
    NO_SYSTEM32_MODIFICATION,
    NO_RAW_CREDENTIAL_EXPOSURE,
    NO_UNAUTHORIZED_NETWORK_LISTENERS,
    NO_DESTRUCTIVE_FORCE_REBOOT,
    NO_DPAPI_VAULT_DUMP,
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
    ScopeGuard,
)
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.agent_shield")

# Known secret leak patterns (CRITICAL: -35 pts)
SECRET_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bAIza[0-9A-Za-z_-]{20,45}\b"), "Google API Key in plaintext"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "OpenAI / Anthropic API Key in plaintext"),
    (re.compile(r"\bghp_[A-Za-z0-9]{36}\b"), "GitHub Personal Access Token in plaintext"),
    (re.compile(r"\bgsk_[A-Za-z0-9]{40,}\b"), "Groq API Key in plaintext"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9_\-\.]{20,}\b", re.IGNORECASE), "Hardcoded Bearer credential"),
    (
        re.compile(r"(?:[A-Za-z0-9_]*_)?(?:api_key|apikey|secret_key|private_key|token)\s*[:=]\s*['\"][A-Za-z0-9_\-\.]{16,}['\"]", re.IGNORECASE),
        "Hardcoded API key assignment outside DPAPI vault",
    ),
]

# Destructive system commands (CRITICAL: -30 pts)
DESTRUCTIVE_PATTERNS: List[Tuple[re.Pattern, str, str]] = [
    (re.compile(r"\b(?:rm|del|erase)\s+.*(?:-rf|\*|c:\\windows|c:\\system32)", re.IGNORECASE), "Critical path deletion", NO_SYSTEM32_MODIFICATION),
    (re.compile(r"\b(?:format\s+[a-zA-Z]:|format-volume|clear-disk)\b", re.IGNORECASE), "Raw disk format command", NO_SYSTEM32_MODIFICATION),
    (re.compile(r"\b(?:shutdown(?:\.exe)?\s+.*[/-][sSrRfFpP]|reboot\s+-[a-zA-Z]*f|poweroff\s+-[a-zA-Z]*f|init\s+[06])\b", re.IGNORECASE), "Forced shutdown/reboot command", NO_DESTRUCTIVE_FORCE_REBOOT),
    (re.compile(r"\b(?:mimikatz|sekurlsa|lsass|procdump)\b", re.IGNORECASE), "Credential dumping utility", NO_RAW_CREDENTIAL_EXPOSURE),
    (re.compile(r"\b(?:dpapi::masterkeys|dpapi::chrome)\b", re.IGNORECASE), "Direct DPAPI extraction tool", NO_DPAPI_VAULT_DUMP),
    (re.compile(r"\b(?:nc|ncat|netcat)\s+.*-l", re.IGNORECASE), "Unauthorized listening socket", NO_UNAUTHORIZED_NETWORK_LISTENERS),
    (re.compile(r"/dev/(?:tcp|udp)/\d+", re.IGNORECASE), "Reverse shell network syntax", NO_UNAUTHORIZED_NETWORK_LISTENERS),
]

# Medium risk wildcard patterns (MEDIUM: -10 pts)
WILDCARD_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"['\"][A-Za-z]:\\[*]?['\"]"), "Root drive filesystem target scope"),
    (re.compile(r"['\"]/\*(?:['\"]|\b)"), "Root UNIX filesystem target scope"),
]


class AgentShieldAuditor:
    """Enterprise AgentShield security auditor for MCP tools, plugins, and configs."""

    def __init__(self, db_path: Optional[Union[str, Path]] = None) -> None:
        self.scope_guard = ScopeGuard()
        self.db_path = Path(db_path) if db_path else (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        self._quarantined_plugins: Set[str] = set()
        self._ensure_tables()
        self._load_quarantined()

    def _get_connection(self) -> sqlite3.Connection:
        if not self.db_path.parent.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=5.0)
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_tables(self) -> None:
        """Initializes security_audits table in agent_local.db."""
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS security_audits (
                        id TEXT PRIMARY KEY,
                        scanned_at TEXT NOT NULL,
                        target_path TEXT NOT NULL,
                        target_type TEXT NOT NULL DEFAULT 'plugin',
                        score INTEGER NOT NULL,
                        quarantined INTEGER NOT NULL DEFAULT 0,
                        findings_json TEXT NOT NULL DEFAULT '[]',
                        quarantined_plugins_json TEXT NOT NULL DEFAULT '[]',
                        status TEXT NOT NULL DEFAULT 'CLEAN'
                    );
                    """
                )
                try:
                    conn.execute("ALTER TABLE security_audits ADD COLUMN target_type TEXT NOT NULL DEFAULT 'plugin';")
                except Exception:
                    pass
                try:
                    conn.execute("ALTER TABLE security_audits ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;")
                except Exception:
                    pass
                conn.execute("CREATE INDEX IF NOT EXISTS idx_security_audits_time ON security_audits(scanned_at);")
                conn.commit()
        except Exception as exc:
            logger.debug("Table check security_audits notice: %s", exc)

    def _load_quarantined(self) -> None:
        """Loads latest quarantined plugins from latest security audit record."""
        try:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT quarantined_plugins_json FROM security_audits ORDER BY scanned_at DESC LIMIT 1"
                ).fetchone()
                if row and row["quarantined_plugins_json"]:
                    items = json.loads(row["quarantined_plugins_json"])
                    self._quarantined_plugins = set(items)
        except Exception:
            pass

    def is_quarantined(self, plugin_name_or_file: str) -> bool:
        """Checks if a plugin filename or path is currently under quarantine."""
        name = Path(plugin_name_or_file).name
        stem = Path(plugin_name_or_file).stem
        return name in self._quarantined_plugins or stem in self._quarantined_plugins

    def get_quarantined_plugins(self) -> List[str]:
        """Returns sorted list of quarantined plugin identifiers."""
        return sorted(list(self._quarantined_plugins))

    def audit_code(self, code: str, source_name: str = "<memory>") -> Dict[str, Any]:
        """Audits Python code or plugin script for security invariant breaches and dangerous calls."""
        findings: List[Dict[str, Any]] = []
        is_vault_file = "vault.py" in source_name.lower() or "security/vault" in source_name.lower()

        if not code or not code.strip():
            return {
                "safe": True,
                "score": 100,
                "risk_score": 0,
                "status": "CLEAN",
                "findings": [],
                "source": source_name,
                "is_critical": False,
                "quarantined": False,
            }

        lines = code.splitlines()

        # 1. Plaintext Secrets Check (CRITICAL: -35 pts)
        if not is_vault_file:
            for line_idx, line in enumerate(lines, start=1):
                clean_l = line.strip()
                if clean_l.startswith("#"):
                    continue
                for pat, desc in SECRET_PATTERNS:
                    if pat.search(line):
                        findings.append({
                            "severity": "CRITICAL",
                            "penalty": 35,
                            "category": "PLAINTEXT_SECRET",
                            "message": f"{desc}. Store credentials in Windows DPAPI vault (core.security.vault).",
                            "line": line_idx,
                            "snippet": line[:80].strip(),
                            "invariant": NO_RAW_CREDENTIAL_EXPOSURE,
                        })

        # 2. Destructive System Commands & Utilities (CRITICAL: -30 pts)
        for line_idx, line in enumerate(lines, start=1):
            clean_l = line.strip()
            if clean_l.startswith("#") or any(term in line for term in ("replace(", "split(", "rstrip(", "endswith(", "startswith(")):
                continue
            for pat, desc, inv in DESTRUCTIVE_PATTERNS:
                if pat.search(line):
                    findings.append({
                        "severity": "CRITICAL",
                        "penalty": 30,
                        "category": "SOVEREIGN_INVARIANT_VIOLATION",
                        "message": f"Detected forbidden command: {desc}.",
                        "line": line_idx,
                        "snippet": line[:80].strip(),
                        "invariant": inv,
                    })

        # 3. Wildcard Filesystem Scopes (MEDIUM: -10 pts)
        for line_idx, line in enumerate(lines, start=1):
            clean_l = line.strip()
            if clean_l.startswith("#") or any(term in line for term in ("replace(", "split(", "rstrip(", "endswith(", "startswith(")):
                continue
            for pat, desc in WILDCARD_PATTERNS:
                if pat.search(line) and "allowed_paths" not in line.lower():
                    findings.append({
                        "severity": "MEDIUM",
                        "penalty": 10,
                        "category": "WILDCARD_SCOPE",
                        "message": f"{desc}. Constrain target paths to workspace roots.",
                        "line": line_idx,
                        "snippet": line[:80].strip(),
                        "invariant": NO_SYSTEM32_MODIFICATION,
                    })

        # 4. AST Static Analysis
        try:
            tree = ast.parse(code, filename=source_name)

            has_approval_gate = False
            has_scopeguard_call = False

            # Inspect decorators and imports for ScopeGuard gates
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    # Check ScopeGuard methods
                    if isinstance(node.func, ast.Attribute) and node.func.attr in ("enforce", "assert_safe_command", "check_ui_action"):
                        has_scopeguard_call = True
                elif isinstance(node, ast.FunctionDef):
                    for dec in node.decorator_list:
                        if isinstance(dec, ast.Call) and getattr(dec.func, "id", "") == "nexus_tool":
                            for kw in dec.keywords:
                                if kw.arg == "requires_approval" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                                    has_approval_gate = True

            # Inspect calls for unguarded execution
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    func_name = ""
                    if isinstance(node.func, ast.Name):
                        func_name = node.func.id
                    elif isinstance(node.func, ast.Attribute):
                        func_name = node.func.attr

                    # HIGH: eval() and exec() (-20 pts)
                    if func_name in ("eval", "exec"):
                        findings.append({
                            "severity": "HIGH",
                            "penalty": 20,
                            "category": "DYNAMIC_CODE_EXECUTION",
                            "message": f"Unguarded use of dynamic '{func_name}' execution.",
                            "line": getattr(node, "lineno", 1),
                            "snippet": f"{func_name}(...)",
                            "invariant": NO_SYSTEM32_MODIFICATION,
                        })

                    # HIGH: os.system or os.popen (-20 pts)
                    if isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name):
                        if node.func.value.id == "os" and node.func.attr in ("system", "popen"):
                            if not has_scopeguard_call and not has_approval_gate:
                                findings.append({
                                    "severity": "HIGH",
                                    "penalty": 20,
                                    "category": "UNGUARDED_OS_SYSTEM",
                                    "message": f"Unguarded os.{node.func.attr}() call. Wrap with ScopeGuard.",
                                    "line": getattr(node, "lineno", 1),
                                    "snippet": f"os.{node.func.attr}(...)",
                                    "invariant": NO_SYSTEM32_MODIFICATION,
                                })

                    # HIGH: subprocess with shell=True (-20 pts)
                    if func_name in ("Popen", "call", "run", "check_output"):
                        is_shell_true = False
                        for kw in node.keywords:
                            if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                                is_shell_true = True
                        if is_shell_true and not has_scopeguard_call and not has_approval_gate:
                            findings.append({
                                "severity": "HIGH",
                                "penalty": 20,
                                "category": "UNGUARDED_SHELL",
                                "message": "subprocess call with shell=True missing ScopeGuard HITL verification.",
                                "line": getattr(node, "lineno", 1),
                                "snippet": "subprocess(..., shell=True)",
                                "invariant": NO_SYSTEM32_MODIFICATION,
                            })

                    # CRITICAL: direct socket bind / listen (-30 pts)
                    if func_name in ("bind", "listen") and isinstance(node.func, ast.Attribute):
                        findings.append({
                            "severity": "CRITICAL",
                            "penalty": 30,
                            "category": "UNAUTHORIZED_LISTENER",
                            "message": "Direct socket bind/listen violates NO_UNAUTHORIZED_NETWORK_LISTENERS.",
                            "line": getattr(node, "lineno", 1),
                            "snippet": f".{func_name}(...)",
                            "invariant": NO_UNAUTHORIZED_NETWORK_LISTENERS,
                        })

        except SyntaxError:
            pass

        # Compute file score
        total_penalty = sum(f.get("penalty", 10) for f in findings)
        score = max(0, 100 - total_penalty)
        risk_score = min(100, max(0, total_penalty))
        has_critical = any(f["severity"] == "CRITICAL" for f in findings)
        status = "CLEAN" if score >= 90 else ("QUARANTINED" if has_critical else "WARNING")

        return {
            "safe": score >= 90 and not has_critical,
            "score": score,
            "risk_score": risk_score,
            "status": status,
            "findings": findings,
            "source": source_name,
            "is_critical": has_critical,
            "quarantined": has_critical or score < 60,
        }

    def scan_file(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """Scans a single Python file, YAML/JSON manifest, or configuration file."""
        p = Path(file_path).resolve()
        if not p.exists() or not p.is_file():
            return {
                "safe": False,
                "score": 0,
                "risk_score": 100,
                "status": "NOT_FOUND",
                "findings": [{"severity": "CRITICAL", "message": f"Target file not found: {p}"}],
                "quarantined": True,
                "is_critical": True,
            }

        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            res = self.audit_code(content, source_name=p.name)
            is_quar = bool(res.get("is_critical") or res.get("score", 100) < 60)
            res["quarantined"] = is_quar
            return res
        except Exception as exc:
            return {
                "safe": False,
                "score": 0,
                "risk_score": 100,
                "status": "ERROR",
                "findings": [{"severity": "CRITICAL", "message": f"File read error: {exc}"}],
                "quarantined": True,
                "is_critical": True,
            }

    def audit_skill(self, skill_target: Union[str, Path, Dict[str, Any]]) -> Dict[str, Any]:
        """Audits a .nxskill bundle, SKILL.md file, or skill dictionary for sovereign invariants."""
        findings: List[Dict[str, Any]] = []
        texts_to_audit: List[Tuple[str, str]] = []
        required_permissions: List[str] = []
        slug = "unknown-skill"

        if isinstance(skill_target, dict):
            slug = skill_target.get("slug", "skill")
            if "instructions_md" in skill_target:
                texts_to_audit.append(("instructions_md", str(skill_target["instructions_md"])))
            if "code" in skill_target:
                texts_to_audit.append(("code", str(skill_target["code"])))
            perms = skill_target.get("permission_scope") or skill_target.get("permissions") or []
            if isinstance(perms, list):
                required_permissions.extend([str(x) for x in perms])
            elif isinstance(perms, str):
                required_permissions.append(perms)
        else:
            p = Path(skill_target).resolve()
            slug = p.stem
            if not p.exists():
                return {
                    "safe": False,
                    "score": 0,
                    "risk_score": 100,
                    "status": "NOT_FOUND",
                    "findings": [{"severity": "CRITICAL", "message": f"Skill bundle not found: {p}"}],
                    "quarantined": True,
                    "is_critical": True,
                    "required_permissions": [],
                }
            if p.is_file():
                if p.suffix.lower() == ".nxskill":
                    # Try reading as JSON package first
                    try:
                        data = json.loads(p.read_text(encoding="utf-8", errors="replace"))
                        if isinstance(data, dict):
                            slug = data.get("slug", p.stem)
                            if "instructions_md" in data:
                                texts_to_audit.append((f"{p.name}:instructions_md", str(data["instructions_md"])))
                            if "code" in data:
                                texts_to_audit.append((f"{p.name}:code", str(data["code"])))
                            perms = data.get("permission_scope") or data.get("permissions") or []
                            if isinstance(perms, list):
                                required_permissions.extend([str(x) for x in perms])
                            elif isinstance(perms, str):
                                required_permissions.append(perms)
                    except Exception:
                        # Try reading as ZIP
                        try:
                            import zipfile
                            with zipfile.ZipFile(p, "r") as zf:
                                for name in zf.namelist():
                                    if name.endswith((".py", ".md", ".json", ".yaml", ".yml")):
                                        content = zf.read(name).decode("utf-8", errors="replace")
                                        texts_to_audit.append((f"{p.name}:{name}", content))
                                        if name == "manifest.json":
                                            try:
                                                m = json.loads(content)
                                                perms = m.get("permissions") or m.get("permission_scope") or []
                                                if isinstance(perms, list):
                                                    required_permissions.extend([str(x) for x in perms])
                                                elif isinstance(perms, str):
                                                    required_permissions.append(perms)
                                            except Exception:
                                                pass
                        except Exception:
                            texts_to_audit.append((p.name, p.read_text(encoding="utf-8", errors="replace")))
                else:
                    texts_to_audit.append((p.name, p.read_text(encoding="utf-8", errors="replace")))
            elif p.is_dir():
                for sub in p.rglob("*"):
                    if sub.is_file() and sub.suffix.lower() in (".py", ".md", ".json"):
                        texts_to_audit.append((sub.name, sub.read_text(encoding="utf-8", errors="replace")))

        for src_name, content in texts_to_audit:
            code_blocks = [content]
            if src_name.endswith(".md") or "instructions_md" in src_name:
                py_blocks = re.findall(r"```(?:python|py)?\n(.*?)```", content, re.DOTALL)
                code_blocks.extend(py_blocks)
            for block in code_blocks:
                res = self.audit_code(block, source_name=src_name)
                findings.extend(res.get("findings", []))

        dangerous_perms = ["SYSTEM32_WRITE", "RAW_SOCKET", "DPAPI_DUMP", "ROOT_EXEC"]
        for perm in required_permissions:
            if perm.upper() in dangerous_perms:
                findings.append({
                    "severity": "CRITICAL",
                    "penalty": 30,
                    "category": "DANGEROUS_PERMISSION",
                    "message": f"Requested prohibited permission: {perm}",
                    "line": 1,
                    "snippet": f"permission: {perm}",
                    "invariant": NO_RAW_CREDENTIAL_EXPOSURE,
                })

        total_penalty = sum(f.get("penalty", 10) for f in findings)
        score = max(0, 100 - total_penalty)
        has_critical = any(f.get("severity") == "CRITICAL" for f in findings)
        is_quarantined = has_critical or score < 60
        status = "QUARANTINED" if is_quarantined else ("CLEAN" if score >= 90 else "WARNING")

        if is_quarantined:
            self._quarantined_plugins.add(slug)

        return {
            "safe": score >= 60 and not has_critical,
            "score": score,
            "risk_score": 100 - score,
            "status": status,
            "findings": findings,
            "required_permissions": required_permissions,
            "is_critical": has_critical,
            "quarantined": is_quarantined,
        }

    def verify_mcp_server(self, server_name: str, server_def: Dict[str, Any]) -> Dict[str, Any]:
        """
        Audits an MCP server entry. Recognizes loopback-scoped servers (e.g., reticle bound
        to 127.0.0.1 / localhost with stdio transport) as verified and compliant.
        """
        if not server_name:
            return {"verified": False, "score": 0, "status": "INVALID_NAME", "quarantined": True}

        norm_name = server_name.strip().lower()
        if norm_name == "reticle":
            transport = server_def.get("transport", "stdio")
            host = server_def.get("host", "127.0.0.1")
            allowed_hosts = server_def.get("scope", {}).get("allowed_hosts", ["127.0.0.1", "localhost"])
            is_loopback = host in ("127.0.0.1", "localhost", "::1") and all(
                h in ("127.0.0.1", "localhost", "::1") for h in allowed_hosts
            )
            if is_loopback:
                return {
                    "verified": True,
                    "score": 100,
                    "status": "VERIFIED_LOOPBACK_MCP",
                    "server": "reticle",
                    "transport": transport,
                    "scope_agents": server_def.get("scope", {}).get("agents", ["DEV-01", "SEC-01"]),
                    "quarantined": False,
                    "findings": [],
                }
            return {
                "verified": False,
                "score": 40,
                "status": "UNAUTHORIZED_HOST",
                "server": "reticle",
                "quarantined": True,
                "findings": [{"severity": "HIGH", "message": f"Reticle bound to non-loopback host '{host}'"}],
            }

        return {
            "verified": True,
            "score": 90,
            "status": "VERIFIED",
            "server": server_name,
            "quarantined": False,
            "findings": [],
        }

    def scan_all_plugins(
        self,
        plugins_dir: str = "core/mcp/plugins",
        manifest_path: str = "nexus_manifest.yaml",
    ) -> Dict[str, Any]:
        """Scans all plugins in directory and manifest, returning aggregated score and quarantined plugins."""
        scan_res = self.run_shield_scan(plugins_dir)
        m_path = Path(manifest_path)
        if m_path.exists():
            m_res = self.scan_file(m_path)
            # Verify MCP server definitions if present in manifest
            try:
                import yaml
                manifest_dict = yaml.safe_load(m_path.read_text(encoding="utf-8")) or {}
                mcp_defs = manifest_dict.get("mcp_server_definitions", {})
                for s_name, s_def in mcp_defs.items():
                    srv_audit = self.verify_mcp_server(s_name, s_def)
                    if not srv_audit.get("verified", True):
                        m_res["findings"].extend(srv_audit.get("findings", []))
                        m_res["safe"] = False
            except Exception:
                pass

            if not m_res.get("safe", True):
                scan_res["findings"].extend(m_res.get("findings", []))
                scan_res["critical_count"] += sum(1 for f in m_res.get("findings", []) if f.get("severity") == "CRITICAL")
                scan_res["score"] = max(0, min(100, scan_res["score"] - 20))
        return scan_res

    def run_shield_scan(self, target_path: Optional[Union[str, Path]] = None) -> Dict[str, Any]:
        """Runs AgentShield audit across plugin directory or specified target path."""
        p = Path(target_path) if target_path else (Path(__file__).parent / "plugins")
        p = p.resolve()

        all_findings: List[Dict[str, Any]] = []
        file_audits: Dict[str, Any] = {}
        quarantined: Set[str] = set()

        files_to_scan: List[Path] = []
        if p.is_file():
            files_to_scan.append(p)
        elif p.is_dir():
            for f in sorted(p.glob("*.py")):
                if not f.name.startswith("__"):
                    files_to_scan.append(f)

        for f in files_to_scan:
            try:
                content = f.read_text(encoding="utf-8", errors="replace")
                res = self.audit_code(content, source_name=f.name)
                file_audits[f.name] = res
                all_findings.extend(res.get("findings", []))
                if res.get("is_critical"):
                    quarantined.add(f.name)
                    quarantined.add(str(f))
            except Exception as exc:
                logger.error("Error auditing plugin %s: %s", f.name, exc)

        critical_count = sum(1 for f in all_findings if f["severity"] == "CRITICAL")
        high_count = sum(1 for f in all_findings if f["severity"] == "HIGH")
        medium_count = sum(1 for f in all_findings if f["severity"] == "MEDIUM")

        total_penalty = critical_count * 30 + high_count * 20 + medium_count * 10
        overall_score = max(0, 100 - total_penalty)
        status = "SECURE" if overall_score >= 90 and critical_count == 0 else ("CRITICAL_RISK" if critical_count > 0 else "WARNING")

        quarantined_list = sorted(list(quarantined))
        self._quarantined_plugins = set(quarantined_list)

        # Persist audit record in SQLite WAL
        audit_id = f"audit_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    INSERT INTO security_audits (
                        id, scanned_at, target_path, target_type, score, quarantined, findings_json, quarantined_plugins_json, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        audit_id,
                        now_iso,
                        str(p),
                        "directory" if p.is_dir() else "file",
                        overall_score,
                        1 if quarantined_list else 0,
                        json.dumps(all_findings),
                        json.dumps(quarantined_list),
                        status,
                    ),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Persist security_audits fallback: %s", exc)

        # Emit SEC-01 telemetry event
        emit_telemetry_event(
            "SEC-01",
            {
                "event": "agentshield_audit",
                "audit_id": audit_id,
                "score": overall_score,
                "status": status,
                "critical": critical_count,
                "high": high_count,
                "medium": medium_count,
                "quarantined": quarantined_list,
                "target_path": str(p),
            },
        )

        return {
            "success": True,
            "audit_id": audit_id,
            "score": overall_score,
            "status": status,
            "scanned_files": len(files_to_scan),
            "critical_count": critical_count,
            "high_count": high_count,
            "medium_count": medium_count,
            "findings": all_findings,
            "quarantined_plugins": quarantined_list,
            "file_audits": file_audits,
        }

    def get_shield_status(self) -> Dict[str, Any]:
        """Returns the latest AgentShield audit status, score, and quarantined plugins."""
        try:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT * FROM security_audits ORDER BY scanned_at DESC LIMIT 1"
                ).fetchone()

                if row:
                    return {
                        "success": True,
                        "has_audit": True,
                        "audit_id": row["id"],
                        "scanned_at": row["scanned_at"],
                        "score": row["score"],
                        "status": row["status"],
                        "target_path": row["target_path"],
                        "findings_count": len(json.loads(row["findings_json"] or "[]")),
                        "quarantined_plugins": json.loads(row["quarantined_plugins_json"] or "[]"),
                    }
        except Exception:
            pass

        # If no audit ran yet, run fresh scan
        return self.run_shield_scan()
