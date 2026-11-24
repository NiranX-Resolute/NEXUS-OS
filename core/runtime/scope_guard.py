"""Nexus OS v5.0 - ScopeGuard & Security Middleware.

Enforces the 6 Sovereign Invariants of NEXUS OS v5.0:
1. NO_SYSTEM32_MODIFICATION: Protection of Windows System32, kernel binaries, and root filesystem.
2. NO_RAW_CREDENTIAL_EXPOSURE: Protection against exfiltration of SSH keys, SAM, LSASS, or plaintext secrets.
3. NO_UNAUTHORIZED_NETWORK_LISTENERS: Prohibition of arbitrary listening ports, reverse shells, and external tunnels.
4. NO_DESTRUCTIVE_FORCE_REBOOT: Prevention of forced reboot, shutdown, or fork bombs.
5. NO_DPAPI_VAULT_DUMP: Protection of Windows DPAPI credential vault masterkeys against unauthorized extraction.
6. REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS: Mandatory Human-In-The-Loop gate via Dynamic Notch HUD for payments.

Also maintains RedCell target scope allowlist verification and GRAVITAS Invariants:
- Read-Before-Write Verification
- Fresh Post-Mutation Evidence Assertion
- Anti-Retry Loop Suppression
- Epistemic Uncertainty Assertion
- SEC-01 Sentinel Toolchain Authorization
"""

from __future__ import annotations

from collections import defaultdict
import hashlib
import ipaddress
import json
import logging
import os
from pathlib import Path
import re
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from .gravitas_guard import (
    AntiRetryViolationError,
    EpistemicUncertaintyError,
    GatedCompletionError,
    GravitasInvariantException,
    ReadBeforeWriteViolationError,
    ScopeViolationError,
    StaleEvidenceError,
)

logger = logging.getLogger("nexus.runtime.scope_guard")


# =============================================================================
# The 6 Sovereign Invariants of NEXUS OS v5.0
# =============================================================================
NO_SYSTEM32_MODIFICATION: str = "NO_SYSTEM32_MODIFICATION"
NO_RAW_CREDENTIAL_EXPOSURE: str = "NO_RAW_CREDENTIAL_EXPOSURE"
NO_UNAUTHORIZED_NETWORK_LISTENERS: str = "NO_UNAUTHORIZED_NETWORK_LISTENERS"
NO_DESTRUCTIVE_FORCE_REBOOT: str = "NO_DESTRUCTIVE_FORCE_REBOOT"
NO_DPAPI_VAULT_DUMP: str = "NO_DPAPI_VAULT_DUMP"
REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS: str = "REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS"

SOVEREIGN_INVARIANTS: List[str] = [
    NO_SYSTEM32_MODIFICATION,
    NO_RAW_CREDENTIAL_EXPOSURE,
    NO_UNAUTHORIZED_NETWORK_LISTENERS,
    NO_DESTRUCTIVE_FORCE_REBOOT,
    NO_DPAPI_VAULT_DUMP,
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
]

INVARIANT_DESCRIPTIONS: Dict[str, str] = {
    NO_SYSTEM32_MODIFICATION: (
        "Guards Windows System32, kernel files, registry hives, and root directories against modification, deletion, or format."
    ),
    NO_RAW_CREDENTIAL_EXPOSURE: (
        "Blocks raw reading or exfiltration of SSH private keys, SAM database, LSASS memory dumps, and plaintext secrets."
    ),
    NO_UNAUTHORIZED_NETWORK_LISTENERS: (
        "Prohibits unauthorized listening sockets (nc, ncat, socat), reverse shell connections, and arbitrary tunneling."
    ),
    NO_DESTRUCTIVE_FORCE_REBOOT: (
        "Prevents unprompted system shutdown, force reboot, halt, or resource exhaustion fork bombs."
    ),
    NO_DPAPI_VAULT_DUMP: (
        "Guards the Windows DPAPI masterkeys and encrypted credential vault against memory dumping and bulk extraction."
    ),
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS: (
        "Enforces interactive Human-In-The-Loop confirmation on the Dynamic Notch HUD before dispatching financial payments."
    ),
}


class ScopeGuardException(GravitasInvariantException):
    """Raised when an operation, shell command, or policy violates one of the 6 Sovereign Invariants."""

    def __init__(
        self,
        message: str,
        invariant: Optional[str] = None,
        command: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.invariant = invariant
        self.command = command


class HashMismatchError(ScopeGuardException):
    """Raised when an HITL approved payload has been mutated or tampered with prior to execution."""

    def __init__(self, message: str = "Payload hash mismatch detected") -> None:
        super().__init__(message)


class SpeakerTierViolationError(ScopeGuardException, ScopeViolationError):
    """Raised when an unprivileged speaker tier (e.g. GUEST) attempts privileged operations."""

    def __init__(self, message: str = "Privileged operation denied for speaker tier") -> None:
        super().__init__(message)


# =============================================================================
# Forbidden Command Patterns Catalog
# =============================================================================

# Invariant 1: System32 Modification & Root Destruction
_FORBIDDEN_DESTRUCTIVE_PATTERNS = [
    # Format volume/drive: e.g. format c:, format d:, Format-Volume
    (re.compile(r"\bformat(\.com)?\s+[a-zA-Z]:", re.IGNORECASE), "Disk format command"),
    (re.compile(r"\b(format-volume|clear-disk|initialize-disk)\b", re.IGNORECASE), "PowerShell disk format/clear cmdlet"),
    # rm -rf root or critical system directories
    (
        re.compile(
            r"\brm\s+.*(-[a-zA-Z]*r[a-zA-Z]*\s+.*-[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*\s+.*-[a-zA-Z]*r|-[a-zA-Z]*[rf]{2,}).*(^|\s+)(/|/\*|/etc|/usr|/bin|/sbin|/boot|/var|/root|([a-zA-Z]:)?/windows|[a-zA-Z]:[/\\]?)(\s+|$)",
            re.IGNORECASE,
        ),
        "Recursive force deletion of root or system root directory",
    ),
    (
        re.compile(
            r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(/|/\*|/etc|/usr|/bin|/sbin|/boot|/var|/root|([a-zA-Z]:)?/windows|[a-zA-Z]:[/\\]?)(\s+|$)",
            re.IGNORECASE,
        ),
        "Recursive force deletion of root or system root directory",
    ),
    (
        re.compile(
            r"\brm\s+.*--no-preserve-root",
            re.IGNORECASE,
        ),
        "rm invocation with --no-preserve-root flag",
    ),
    # Windows deletions targeting Windows or System32
    (
        re.compile(
            r"\b(del|erase|rd|rmdir)\b.*(\b[a-zA-Z]:[/\\].*windows|[/\\].*windows|%windir%|%systemroot%|system32)",
            re.IGNORECASE,
        ),
        "Deletion targeting Windows or System32 directory",
    ),
    (
        re.compile(
            r"\b(remove-item|ri)\b.*(\b[a-zA-Z]:[/\\].*windows|[/\\].*windows|system32)",
            re.IGNORECASE,
        ),
        "PowerShell deletion targeting Windows or System32 directory",
    ),
    # Raw disk overwrite via dd or mkfs
    (
        re.compile(r"\bdd\s+.*of=/dev/(sd[a-z]|hd[a-z]|nvme\d+n\d+|null|zero)\b", re.IGNORECASE),
        "Low-level device overwrite via dd",
    ),
    (re.compile(r"\bmkfs(\.[a-z0-9]+)?\s+", re.IGNORECASE), "Filesystem recreation via mkfs"),
]

# Invariant 5: DPAPI Vault Dump (Checked before general credential pattern)
_FORBIDDEN_DPAPI_PATTERNS = [
    (re.compile(r"\b(sekurlsa|dpapi)::(masterkeys|chrome|cred|dpapi)\b", re.IGNORECASE), "DPAPI masterkey dump request"),
    (re.compile(r"\bmimikatz\b.*dpapi", re.IGNORECASE), "Mimikatz DPAPI vault dump invocation"),
    (re.compile(r"\bdpapi::", re.IGNORECASE), "Direct DPAPI extraction prefix"),
]

# Invariant 2: Raw Credential Exposure
_FORBIDDEN_CREDENTIAL_PATTERNS = [
    (
        re.compile(
            r"\b(cat|type|get-content|more|head|tail)\b.*(\.ssh[/\\].*(id_rsa|id_ed25519|id_ecdsa|id_dsa)|id_rsa|id_ed25519)",
            re.IGNORECASE,
        ),
        "Attempted exposure of raw SSH private key",
    ),
    (re.compile(r"\b(mimikatz|sekurlsa|lazagne)\b", re.IGNORECASE), "Known credential harvesting utility invocation"),
    (re.compile(r"\bprocdump(\.exe)?\s+.*lsass", re.IGNORECASE), "Memory dump of Local Security Authority (lsass.exe)"),
    (re.compile(r"\bcomsvcs(\.dll)?\s*,\s*minidump\b.*lsass", re.IGNORECASE), "comsvcs minidump export of lsass"),
    (re.compile(r"\breg(\.exe)?\s+save\s+hklm[/\\].*(sam|system|security)\b", re.IGNORECASE), "SAM registry hive export"),
    (re.compile(r"\bvaultcmd(\.exe)?\s+/list", re.IGNORECASE), "Windows credential vault unauthenticated enumeration"),
]

# Invariant 3: Unauthorized Network Listeners & Reverse Shells
_FORBIDDEN_NETWORK_PATTERNS = [
    (re.compile(r"\b(nc|ncat|netcat)(\.exe)?\s+.*-[a-zA-Z]*l", re.IGNORECASE), "Unauthorized listening port via netcat"),
    (re.compile(r"\bsocat\b.*(tcp-listen|udp-listen)", re.IGNORECASE), "Unauthorized socket listener via socat"),
    (re.compile(r"\b(bash|sh|zsh)\s+-i\s+>&?\s*/dev/(tcp|udp)/", re.IGNORECASE), "Bash interactive reverse shell syntax"),
    (re.compile(r"\bpython(\d+)?(\.exe)?\s+.*socket.*dup2", re.IGNORECASE), "Python programmatic reverse shell invocation"),
    (
        re.compile(r"\bpowershell(\.exe)?\s+.*-[eE](nc(odedcommand)?)?\s+[A-Za-z0-9+/=]{40,}", re.IGNORECASE),
        "PowerShell encoded command payload execution",
    ),
]

# Invariant 4: Destructive Force Reboot & Host Halting
_FORBIDDEN_REBOOT_PATTERNS = [
    (
        re.compile(
            r"\bshutdown(\.exe)?\s+.*([/-][sSrR]\s+[/-][fF]|[/-]s\s+[/-]t\s+0|[/-]r\s+[/-]t\s+0|[/-]p)",
            re.IGNORECASE,
        ),
        "Forced machine shutdown or reboot",
    ),
    (re.compile(r"\b(reboot|halt|poweroff)\b\s+-[a-zA-Z]*f", re.IGNORECASE), "Forced system shutdown or halt"),
    (re.compile(r"\b(init|telinit)\b\s+[06]\b", re.IGNORECASE), "System runlevel transition to halt or reboot"),
    (re.compile(r":\(\)\s*\{\s*:\|:&\s*\};:", re.IGNORECASE), "POSIX bash fork bomb"),
    (re.compile(r"%\s*0\s*\|\s*%\s*0", re.IGNORECASE), "Windows batch fork bomb"),
]

# Invariant 6: Payment Dispatch Requiring Human Approval
_FORBIDDEN_PAYMENT_PATTERNS = [
    (re.compile(r"\bstripe\s+(charges|payment_intents|payouts)\s+create", re.IGNORECASE), "Stripe financial disbursement"),
    (re.compile(r"\bbitcoin-cli\s+sendtoaddress", re.IGNORECASE), "Bitcoin transaction broadcast without approval"),
    (re.compile(r"\bsolana\s+transfer\b", re.IGNORECASE), "Solana token transfer without approval"),
    (re.compile(r"\bcast\s+send\b", re.IGNORECASE), "EVM smart contract value transfer without approval"),
    (re.compile(r"\bpaypal\s+payouts\s+create", re.IGNORECASE), "PayPal payout creation without approval"),
]


def assert_safe_command(command: str) -> None:
    """
    Validates a command string against the 6 Sovereign Invariants of NEXUS OS v5.0.

    Detects and blocks destructive commands such as:
    - 'rm -rf /', 'format c:', 'del /f /s /q c:\\windows'
    - Raw SSH private key exfiltration, SAM/LSASS memory dumps
    - Unauthorized listening sockets and reverse shells
    - Forced shutdowns, reboots, and fork bombs
    - DPAPI masterkey dumping
    - Automated financial disbursements requiring human approval

    Raises:
        ScopeGuardException: If the command violates any of the 6 Sovereign Invariants.
    """
    if not command or not isinstance(command, str):
        return

    clean_cmd = command.strip()
    norm_cmd = clean_cmd.replace("\\", "/")

    # 1. Check Invariant 1: System32 & Critical OS Destruction
    for pattern, reason in _FORBIDDEN_DESTRUCTIVE_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {NO_SYSTEM32_MODIFICATION}] "
                f"Forbidden destructive command: '{command}'. Reason: {reason}",
                invariant=NO_SYSTEM32_MODIFICATION,
                command=command,
            )

    # 2. Check Invariant 5: DPAPI Vault Dump (Prioritized before general credential checks)
    for pattern, reason in _FORBIDDEN_DPAPI_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {NO_DPAPI_VAULT_DUMP}] "
                f"Forbidden DPAPI vault dump command: '{command}'. Reason: {reason}",
                invariant=NO_DPAPI_VAULT_DUMP,
                command=command,
            )

    # 3. Check Invariant 2: Raw Credential Exposure
    for pattern, reason in _FORBIDDEN_CREDENTIAL_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {NO_RAW_CREDENTIAL_EXPOSURE}] "
                f"Forbidden credential exposure command: '{command}'. Reason: {reason}",
                invariant=NO_RAW_CREDENTIAL_EXPOSURE,
                command=command,
            )

    # 4. Check Invariant 3: Unauthorized Network Listeners
    for pattern, reason in _FORBIDDEN_NETWORK_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {NO_UNAUTHORIZED_NETWORK_LISTENERS}] "
                f"Forbidden network listener command: '{command}'. Reason: {reason}",
                invariant=NO_UNAUTHORIZED_NETWORK_LISTENERS,
                command=command,
            )

    # 5. Check Invariant 4: Destructive Force Reboot
    for pattern, reason in _FORBIDDEN_REBOOT_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {NO_DESTRUCTIVE_FORCE_REBOOT}] "
                f"Forbidden reboot command: '{command}'. Reason: {reason}",
                invariant=NO_DESTRUCTIVE_FORCE_REBOOT,
                command=command,
            )

    # 6. Check Invariant 6: Payment Approval Gate
    for pattern, reason in _FORBIDDEN_PAYMENT_PATTERNS:
        if pattern.search(clean_cmd) or pattern.search(norm_cmd):
            raise ScopeGuardException(
                f"[SOVEREIGN INVARIANT VIOLATION: {REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS}] "
                f"Payment disbursement '{command}' requires interactive human approval via Notch HUD.",
                invariant=REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
                command=command,
            )

    logger.debug("[SCOPE-GUARD] Command asserted safe against 6 Sovereign Invariants: %s", command)


# =============================================================================
# ScopeGuard Security & Middleware Enforcer
# =============================================================================
class ScopeGuard:
    """Unified Gravitas 6-Invariant & Sovereign Invariant Security Middleware."""

    # Expose Sovereign Invariant constants on class
    NO_SYSTEM32_MODIFICATION = NO_SYSTEM32_MODIFICATION
    NO_RAW_CREDENTIAL_EXPOSURE = NO_RAW_CREDENTIAL_EXPOSURE
    NO_UNAUTHORIZED_NETWORK_LISTENERS = NO_UNAUTHORIZED_NETWORK_LISTENERS
    NO_DESTRUCTIVE_FORCE_REBOOT = NO_DESTRUCTIVE_FORCE_REBOOT
    NO_DPAPI_VAULT_DUMP = NO_DPAPI_VAULT_DUMP
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS = REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS
    SOVEREIGN_INVARIANTS = SOVEREIGN_INVARIANTS

    DEFAULT_SCOPE_FILES = [
        "engagement_scope.json",
        "c:/Users/NiranX/Documents/antigravity/Nexus Desktop/engagement_scope.json",
        "c:\\Users\\NiranX\\Documents\\antigravity\\Nexus Desktop\\engagement_scope.json",
    ]

    ALLOWED_SEC_TOOLS = {
        "nuclei",
        "nmap",
        "semgrep",
        "gitleaks",
        "obscura",
        "obscura_browser",
        "reticle",
        "reticle_session",
        "reticle_look",
        "reticle_act",
        "reticle_act_and_wait",
        "reticle_assert",
        "agent_reach",
        "agent-reach",
        "scout_reach",
        "scout_reach_read",
        "scout_reach_search",
    }

    WRITE_TOOLS = {
        "write_file",
        "edit_file",
        "apply_diff",
        "patch_file",
        "append_file",
    }

    READ_TOOLS = {
        "read_file",
        "view_symbol",
        "read_resource",
        "inspect_file",
        "grep_search",
    }

    def __init__(
        self,
        scope_file: Optional[str] = None,
        max_retries: int = 3,
    ) -> None:
        self.scope_file = self._resolve_scope_file(scope_file)
        self.max_retries = max_retries
        self.allowed_targets: Dict[str, Any] = self._load_scope()

        # Gravitas state tracking registers
        self.file_read_history: Set[str] = set()
        self.tool_call_counts: Dict[str, int] = defaultdict(int)
        self.mutation_timestamps: Dict[str, float] = {}
        self.validator_evidence: Dict[str, Tuple[bool, float]] = {}
        self.action_history: List[Dict[str, Any]] = []

    # -------------------------------------------------------------------------
    # Invariant Status Telemetry
    # -------------------------------------------------------------------------
    def get_invariants_status(self) -> Dict[str, Dict[str, Any]]:
        """Returns the status and enforcement posture for all 6 Sovereign Invariants (6/6 SECURE)."""
        return {
            inv: {
                "name": inv,
                "status": "SECURE",
                "enforced": True,
                "description": INVARIANT_DESCRIPTIONS.get(inv, ""),
            }
            for inv in self.SOVEREIGN_INVARIANTS
        }

    # Static and instance method for command validation
    assert_safe_command = staticmethod(assert_safe_command)

    def evaluate_command(self, command: str) -> bool:
        """Evaluates command safety against 6 Sovereign Invariants. Returns True or raises ScopeGuardException."""
        self.assert_safe_command(command)
        return True

    def _resolve_scope_file(self, scope_file: Optional[str]) -> str:
        if scope_file and os.path.exists(scope_file):
            return os.path.abspath(scope_file)
        for candidate in self.DEFAULT_SCOPE_FILES:
            if os.path.exists(candidate):
                return os.path.abspath(candidate)
        return scope_file or self.DEFAULT_SCOPE_FILES[0]

    def _load_scope(self) -> Dict[str, Any]:
        """Loads engagement scope allowlist with local loopback fallback."""
        if not os.path.exists(self.scope_file):
            logger.warning("Scope file '%s' not found. Reverting to loopback default.", self.scope_file)
            return {
                "domains": ["localhost", "127.0.0.1", "*.local.nexus"],
                "ips": ["127.0.0.1"],
                "cidrs": ["127.0.0.0/8", "192.168.1.0/24"],
                "allowed_tools": list(self.ALLOWED_SEC_TOOLS),
            }
        try:
            with open(self.scope_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "allowed_tools" not in data:
                    data["allowed_tools"] = list(self.ALLOWED_SEC_TOOLS)
                return data
        except Exception as exc:
            logger.error("Failed to parse scope file '%s': %s", self.scope_file, exc)
            return {
                "domains": ["localhost", "127.0.0.1"],
                "ips": ["127.0.0.1"],
                "cidrs": ["127.0.0.0/8"],
                "allowed_tools": list(self.ALLOWED_SEC_TOOLS),
            }

    def _normalize_path(self, target_path: str) -> str:
        """Resolves real paths for cross-platform matching."""
        try:
            return str(Path(os.path.abspath(os.path.normpath(target_path))).resolve()).lower()
        except Exception:
            return os.path.normpath(target_path).lower()

    # -------------------------------------------------------------------------
    # Network Scope Verification (RedCell / SEC-01 Allowlist)
    # -------------------------------------------------------------------------
    def validate_target(self, target: str) -> bool:
        """Validates that a target URL, IP, or domain falls strictly within authorized scope."""
        if not target or not isinstance(target, str):
            return False

        clean_target = target.strip()
        parsed = urlparse(clean_target if "://" in clean_target else f"http://{clean_target}")
        hostname = (parsed.hostname or clean_target).lower()

        # 1. Check Domain Match (Direct and wildcard)
        for dom in self.allowed_targets.get("domains", []):
            dom_norm = dom.lower()
            if dom_norm.startswith("*."):
                suffix = dom_norm[2:]
                if hostname.endswith(suffix) or hostname == suffix:
                    return True
            elif hostname == dom_norm:
                return True

        # 2. Check IP / CIDR Match
        try:
            target_ip = ipaddress.ip_address(hostname)
            for cidr in self.allowed_targets.get("cidrs", []):
                if target_ip in ipaddress.ip_network(cidr, strict=False):
                    return True
            for ip_str in self.allowed_targets.get("ips", []):
                if target_ip == ipaddress.ip_address(ip_str):
                    return True
        except ValueError:
            logger.debug("Target '%s' is not a valid IP string", hostname)

        return False

    def is_sec_tool_allowed(self, tool_name: str) -> bool:
        """Checks if a security scanner tool is authorized in the engagement scope."""
        norm_tool = (tool_name or "").strip().lower()
        allowed = {t.lower() for t in self.allowed_targets.get("allowed_tools", [])} | {
            t.lower() for t in self.ALLOWED_SEC_TOOLS
        }
        return norm_tool in allowed

    def validate_reticle_target(self, target: str) -> bool:
        """Restricts Reticle MCP targets strictly to 127.0.0.1 / localhost."""
        if not target or not isinstance(target, str):
            return False
        clean = target.strip().lower()
        if "://" in clean:
            parsed = urlparse(clean)
            hostname = parsed.hostname or clean
        else:
            hostname = clean.split(":")[0]
        return hostname in ("127.0.0.1", "localhost", "::1")

    def enforce(self, tool_name: str, target: str) -> None:
        """
        Enforces target authorization and tool allowlist.

        Raises:
            PermissionError: If target or tool is outside engagement scope.
        """
        norm_tool = (tool_name or "").strip().lower()
        if not self.is_sec_tool_allowed(norm_tool):
            raise PermissionError(
                f"[GRAVITAS SECURITY ALERT] Tool '{tool_name}' is not in the authorized SEC-01 toolchain."
            )

        # Reticle tools are strictly restricted to local loopback (127.0.0.1 / localhost)
        if norm_tool.startswith("reticle"):
            if not self.validate_reticle_target(target):
                raise PermissionError(
                    f"[GRAVITAS SECURITY ALERT] Reticle target '{target}' violates loopback isolation. Only 127.0.0.1 and localhost are permitted."
                )

        # Distinguish filesystem path vs network/URL target
        is_path = os.path.isabs(target) or "/" in target or "\\" in target
        if is_path and os.path.exists(target):
            # Local path scan (e.g. semgrep, gitleaks)
            if not self.validate_path(target):
                raise PermissionError(
                    f"[GRAVITAS SECURITY ALERT] Local path '{target}' violates path containment for tool '{tool_name}'."
                )
        else:
            # Network target (e.g. nuclei, nmap, obscura, reticle)
            if not self.validate_target(target):
                raise PermissionError(
                    f"[GRAVITAS SECURITY ALERT] Target '{target}' is outside the authorized engagement scope for tool '{tool_name}'."
                )

        logger.info("[SCOPE-GUARD] Target '%s' approved for tool '%s'.", target, tool_name)

    # -------------------------------------------------------------------------
    # Path Traversal & Filesystem Perimeter Verification
    # -------------------------------------------------------------------------
    def validate_path(
        self,
        target_path: str,
        allowed_paths: Optional[List[str]] = None,
    ) -> bool:
        """
        Verifies that target_path does not escape sandbox perimeter via traversal or symlinks.
        """
        if not target_path:
            return False

        # Reject obvious path traversal signatures
        raw_norm = os.path.normpath(target_path)
        if ".." in raw_norm.split(os.sep):
            return False

        try:
            resolved_target = Path(os.path.realpath(target_path)).resolve()
        except Exception:
            return False

        # If allowed_paths given, enforce containment within at least one root
        if allowed_paths:
            for allowed in allowed_paths:
                try:
                    resolved_allowed = Path(os.path.realpath(allowed)).resolve()
                    if resolved_target == resolved_allowed:
                        return True
                    try:
                        resolved_target.relative_to(resolved_allowed)
                        return True
                    except ValueError:
                        continue
                except Exception:
                    continue
            return False

        return True

    def validate_path_access(self, target_path: str, allowed_paths: Optional[List[str]] = None) -> bool:
        """Verifies path containment and safe access. Compatible alias for validate_path."""
        return self.validate_path(target_path, allowed_paths=allowed_paths)

    # -------------------------------------------------------------------------
    # Gravitas 6 Invariants
    # -------------------------------------------------------------------------
    def record_read(self, target_path: str) -> str:
        """Invariant 2 Helper: Records that a file was read."""
        norm = self._normalize_path(target_path)
        self.file_read_history.add(norm)
        return norm

    def assert_read_before_write(self, target_path: str, allow_new_file: bool = False) -> None:
        """Invariant 2: Target must have been read in session before mutation."""
        norm = self._normalize_path(target_path)
        if not os.path.exists(target_path) and allow_new_file:
            return
        if norm not in self.file_read_history:
            if os.path.exists(target_path):
                raise ReadBeforeWriteViolationError(
                    f"[GRAVITAS Invariant 2 Violation] File '{target_path}' has not been read in this session."
                )

    def assert_anti_retry(self, tool_name: str, params: Dict[str, Any]) -> None:
        """Invariant 3: Blocks repeated byte-identical invocations."""
        try:
            serialized = json.dumps(params, sort_keys=True, default=str)
        except Exception:
            serialized = str(params)

        call_sig = hashlib.sha256(f"{tool_name.lower()}:{serialized}".encode("utf-8")).hexdigest()
        count = self.tool_call_counts[call_sig]
        if count >= self.max_retries:
            raise AntiRetryViolationError(
                f"[GRAVITAS Invariant 3 Violation] Tool '{tool_name}' called {count} times with identical arguments."
            )
        self.tool_call_counts[call_sig] = count + 1

    def record_mutation(self, target_path: str) -> None:
        """Invariant 4 Helper: Records file modification timestamp."""
        norm = self._normalize_path(target_path)
        self.mutation_timestamps[norm] = time.time()

    def record_validator_result(self, criterion_id: str, passed: bool) -> None:
        """Invariant 4 Helper: Records validator evidence with timestamp."""
        self.validator_evidence[criterion_id] = (passed, time.time())

    def assert_fresh_evidence(self, criterion_id: str, target_path: Optional[str] = None) -> None:
        """Invariant 4: Validator evidence must be recorded AFTER the latest mutation."""
        evidence = self.validator_evidence.get(criterion_id)
        if not evidence:
            raise StaleEvidenceError(f"No evidence for criterion '{criterion_id}'.")
        passed, val_time = evidence
        if not passed:
            raise StaleEvidenceError(f"Validator evidence for '{criterion_id}' failed.")
        if target_path:
            norm = self._normalize_path(target_path)
            mut_time = self.mutation_timestamps.get(norm, 0.0)
            if val_time <= mut_time:
                raise StaleEvidenceError(f"Evidence for '{criterion_id}' is stale.")

    def assert_gated_completion(self, required_criteria: List[str], completed_criteria: Set[str]) -> None:
        """Invariant 5: All required criteria must be completed before declaring done."""
        missing = [c for c in required_criteria if c not in completed_criteria]
        if missing:
            raise GatedCompletionError(f"Completion blocked. Missing criteria: {missing}")

    def assert_epistemic_honesty(self, claim: str, confidence: float, is_verified: bool) -> None:
        """Invariant 6: Mark uncertain claims explicitly instead of fabricating certainty."""
        if confidence > 0.85 and not is_verified:
            raise EpistemicUncertaintyError(
                f"High confidence ({confidence}) asserted on unverified claim '{claim}'."
            )

    # -------------------------------------------------------------------------
    # UI Actuation & Motor Action Gate (HITL Approval)
    # -------------------------------------------------------------------------
    SENSITIVE_UI_KEYWORDS: Set[str] = {
        "send",
        "delete",
        "remove",
        "pay",
        "buy",
        "confirm",
        "submit",
        "format",
        "wipe",
        "destroy",
        "purge",
        "drop",
        "kill",
        "shutdown",
    }

    def check_ui_action(
        self,
        label: str,
        target: str = "",
        auto_approve: bool = False,
    ) -> bool:
        """
        Validates UI clicks and motor actions against high-risk action policies.
        Sensitive keywords (send, delete, remove, pay, buy, confirm, submit, format)
        require explicit Human-In-The-Loop (HITL) approval via the notch HUD.

        Args:
            label: Text label or button description (e.g. "Delete Account", "Send Email").
            target: Target window or UI element identifier.
            auto_approve: If True, bypasses interactive prompt (for tests or authorized sessions).

        Returns:
            True if action is approved; raises ScopeViolationError if blocked/denied.
        """
        start_t = time.perf_counter()
        combined_text = f"{label} {target}".lower().strip()
        words = re.findall(r"\b[a-z]+\b", combined_text)

        is_sensitive = any(w in self.SENSITIVE_UI_KEYWORDS for w in words)
        if not is_sensitive:
            elapsed_ms = (time.perf_counter() - start_t) * 1000
            logger.debug("[SCOPE-GUARD] UI action '%s' on '%s' permitted in %.3fms", label, target, elapsed_ms)
            return True

        # Sensitive action triggered -> record event to local SQLite telemetry
        logger.warning(
            "[SCOPE-GUARD ALERT] High-risk UI action detected: '%s' on target '%s'",
            label,
            target,
        )

        try:
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            if db_path.exists():
                import sqlite3
                conn = sqlite3.connect(str(db_path), timeout=1.0)
                try:
                    payload = json.dumps({
                        "label": label,
                        "target": target,
                        "status": "APPROVED" if auto_approve else "PENDING_APPROVAL",
                        "timestamp": time.time(),
                    })
                    conn.execute(
                        "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                        ("ui_action_hitl", payload, time.time()),
                    )
                    conn.commit()
                finally:
                    conn.close()
        except Exception as exc:
            logger.debug("Telemetry logging skipped: %s", exc)

        if auto_approve:
            logger.info("[SCOPE-GUARD] High-risk action '%s' explicitly approved.", label)
            return True

        raise ScopeViolationError(
            f"[SCOPE-GUARD HITL BLOCKED] High-risk UI action '{label}' on '{target}' "
            "requires interactive Allow / Deny approval on Nexus Notch HUD."
        )

    def check_coordinate_action(
        self,
        x: int,
        y: int,
        action_type: str = "click",
        auto_approve: bool = False,
    ) -> bool:
        """
        Runs Win32 WindowFromPoint + hit-testing at physical coordinates (x, y)
        before executing visual clicks. Inspects the underlying control name, window title,
        and control type for sensitive keywords (send, delete, pay, submit, format, etc.).
        If sensitive, gates execution and triggers the Allow / Deny approval flow.
        """
        from core.engine.tools.desktop_ufo import get_element_at_point

        hit = get_element_at_point(x, y)
        el_name = hit.get("title") or hit.get("name") or ""
        class_name = hit.get("class_name") or ""
        control_type = hit.get("control_type") or ""

        target_desc = f"{control_type} '{el_name}' ({class_name}) at ({x}, {y})"
        label = f"{action_type.capitalize()} on {el_name or control_type}"

        # Combine text to inspect for sensitive keywords
        combined = f"{label} {target_desc} {el_name}".lower()
        words = re.findall(r"\b[a-z]+\b", combined)
        is_sensitive = any(w in self.SENSITIVE_UI_KEYWORDS for w in words)

        if is_sensitive:
            logger.warning("[SCOPE-GUARD] Sensitive UI control detected under coordinate (%d, %d): %s", x, y, target_desc)
            return self.check_ui_action(
                label=label,
                target=target_desc,
                auto_approve=auto_approve,
            )

        return True

    # -------------------------------------------------------------------------
    # Exact-Payload SHA-256 HITL Approval Hash Binding
    # -------------------------------------------------------------------------
    _hitl_approvals: Dict[str, str] = {}
    _hitl_lock: threading.Lock = threading.Lock()

    @classmethod
    def bind_hitl_approval(cls, action_id: str, payload: Any) -> str:
        """Calculates deterministic SHA-256 of payload and binds it to action_id."""
        return bind_hitl_approval(action_id, payload)

    @classmethod
    def verify_hitl_execution(cls, action_id: str, current_payload: Any) -> bool:
        """Verifies current_payload matches exact SHA-256 hash bound during HITL approval."""
        return verify_hitl_execution(action_id, current_payload)

    # -------------------------------------------------------------------------
    # Speaker Biometrics Tier Enforcement (Voice Guardian Sandbox)
    # -------------------------------------------------------------------------
    @classmethod
    def enforce_speaker_tier(
        cls,
        speaker_tier: str = "GUEST",
        tool_name: str = "",
        target: str = "",
        **kwargs: Any,
    ) -> None:
        """Enforces speaker biometric authorization tiers.

        When speaker_tier == 'GUEST':
        Blocks:
        - Terminal / PowerShell commands ('run_command', 'exec', 'terminal', 'powershell', etc.)
        - File writes and deletes ('write_file', 'edit_file', 'delete_file', etc.)
        - DPAPI vault reads and writes ('get_secret', 'vault_get', etc.)
        - Private memory recall ('recall_private', 'private_memory', etc.)
        - Destructive UI clicks ('click', 'ui_action' with sensitive keywords)

        Allows safe read-only and Q&A tools:
        - 'read_file', 'search_web', 'ask_question', 'chat', 'get_status', etc.

        Raises:
            SpeakerTierViolationError: If a GUEST attempts to invoke privileged tools.
        """
        # Accept kwargs aliases speaker_role and action_type
        role = (kwargs.get("speaker_role") or speaker_tier or "GUEST").strip().upper()
        if role == "OPERATOR":
            return

        act = (kwargs.get("action_type") or tool_name or "").strip().lower()
        targ = (kwargs.get("target") or target or "").strip().lower()

        # 1. Terminal execution
        terminal_tools = {
            "run_command",
            "execute_command",
            "terminal",
            "shell",
            "exec",
            "powershell",
            "bash",
            "cmd",
            "run_script",
            "start_process",
        }
        if act in terminal_tools or "terminal" in act or "command" in act or "shell" in act or "powershell" in act:
            raise SpeakerTierViolationError(
                f"[SCOPE-GUARD GUEST SANDBOX VIOLATION] Speaker tier 'GUEST' is blocked from terminal execution tool '{act}'. Privileged operations require OPERATOR biometrics."
            )

        # 2. File writes and deletes
        write_prefixes = ("write", "edit", "delete", "remove", "patch", "append", "truncate", "unlink", "rmdir")
        if act in cls.WRITE_TOOLS or any(wp in act for wp in write_prefixes):
            raise SpeakerTierViolationError(
                f"[SCOPE-GUARD GUEST SANDBOX VIOLATION] Speaker tier 'GUEST' is blocked from mutating filesystem with tool '{act}' on target '{targ}'. Privileged operations require OPERATOR biometrics."
            )

        # 3. DPAPI vault reads and writes
        vault_tools = {"get_secret", "set_secret", "vault_get", "vault_set", "read_vault", "list_keys"}
        if act in vault_tools or "vault" in act or "secret" in act:
            raise SpeakerTierViolationError(
                f"[SCOPE-GUARD GUEST SANDBOX VIOLATION] Speaker tier 'GUEST' is blocked from accessing DPAPI vault with tool '{act}'. Privileged operations require OPERATOR biometrics."
            )

        # 4. Private memory recall
        memory_private_tools = {"recall_private", "search_private_memory", "get_private_memory", "private_memory", "store_private_memory"}
        if act in memory_private_tools or "private" in act or "private" in targ:
            raise SpeakerTierViolationError(
                f"[SCOPE-GUARD GUEST SANDBOX VIOLATION] Speaker tier 'GUEST' is blocked from accessing private memory with tool '{act}' on target '{targ}'. Privileged operations require OPERATOR biometrics."
            )

        # 5. Destructive UI clicks
        ui_click_tools = {
            "ui_action",
            "click",
            "reticle_act",
            "reticle_act_and_wait",
            "reticle_click",
            "desktop_click",
            "desktop_double_click",
            "desktop_right_click",
        }
        if act in ui_click_tools:
            words = set(re.findall(r"\b[a-z]+\b", f"{act} {targ}"))
            if any(w in cls.SENSITIVE_UI_KEYWORDS for w in words):
                raise SpeakerTierViolationError(
                    f"[SCOPE-GUARD GUEST SANDBOX VIOLATION] Speaker tier 'GUEST' is blocked from high-risk UI actuation tool '{act}' on target '{targ}'. Privileged operations require OPERATOR biometrics."
                )

        # Safe read-only and Q&A tools proceed
        logger.debug("[SCOPE-GUARD] Tool '%s' permitted for speaker tier '%s'", act, role)


# -----------------------------------------------------------------------------
# Module-level Exact-Payload SHA-256 HITL Approval Registry
# -----------------------------------------------------------------------------
_hitl_approvals: Dict[str, str] = {}
_hitl_lock = threading.Lock()


def compute_payload_hash(payload: Any) -> str:
    """Computes deterministic SHA-256 hex digest of payload."""
    if isinstance(payload, bytes):
        raw = payload
    elif isinstance(payload, str):
        raw = payload.encode("utf-8")
    else:
        raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def bind_hitl_approval(action_id: str, payload: Any) -> str:
    """Calculates SHA-256 hash of payload and binds it to action_id."""
    h = compute_payload_hash(payload)
    with _hitl_lock:
        _hitl_approvals[action_id] = h
    logger.info("[SCOPE-GUARD] Bound HITL approval for '%s' to SHA-256: %s", action_id, h[:16])
    return h


def verify_hitl_execution(action_id: str, current_payload: Any) -> bool:
    """
    Verifies that current_payload matches exact SHA-256 hash bound during HITL approval.
    Raises HashMismatchError if payload was mutated or missing.
    """
    with _hitl_lock:
        expected_hash = _hitl_approvals.get(action_id)
    if not expected_hash:
        raise HashMismatchError(f"[SCOPE-GUARD] No approved HITL binding found for action '{action_id}'.")

    current_hash = compute_payload_hash(current_payload)
    if expected_hash != current_hash:
        raise HashMismatchError(
            f"[SCOPE-GUARD TAMPERING DETECTED] Payload mutated for action '{action_id}'. "
            f"Expected SHA-256 {expected_hash}, calculated {current_hash}."
        )
    return True


def enforce_speaker_tier(speaker_role: str = "GUEST", action_type: str = "", target: str = "", **kwargs: Any) -> None:
    """Standalone helper function enforcing speaker tier authorization (OPERATOR vs GUEST)."""
    role = kwargs.get("speaker_tier", speaker_role)
    act = kwargs.get("tool_name", action_type)
    targ = kwargs.get("target", target)
    ScopeGuard.enforce_speaker_tier(speaker_tier=role, tool_name=act, target=targ, **kwargs)


__all__ = [
    "NO_SYSTEM32_MODIFICATION",
    "NO_RAW_CREDENTIAL_EXPOSURE",
    "NO_UNAUTHORIZED_NETWORK_LISTENERS",
    "NO_DESTRUCTIVE_FORCE_REBOOT",
    "NO_DPAPI_VAULT_DUMP",
    "REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS",
    "SOVEREIGN_INVARIANTS",
    "INVARIANT_DESCRIPTIONS",
    "ScopeGuardException",
    "HashMismatchError",
    "SpeakerTierViolationError",
    "assert_safe_command",
    "ScopeGuard",
    "enforce_speaker_tier",
    "compute_payload_hash",
    "bind_hitl_approval",
    "verify_hitl_execution",
]
