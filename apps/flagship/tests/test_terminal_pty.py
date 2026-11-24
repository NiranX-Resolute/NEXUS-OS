"""
Unit & Integration Test: Persistent Pseudo-Terminal (PTY) Command Harness
=============================================================================
Validates:
1. Standard command execution with exact exit code retrieval (echo, python exit 42).
2. Non-blocking stdout/stderr streaming capture.
3. Timeout enforcement with process tree termination (simulated sleep).
4. Terminal control code sanitation while preserving ANSI colors.
=============================================================================
"""

import os
import sys
import time
import pytest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from engine.tools.terminal_pty import (
    PersistentTerminal,
    TerminalResult,
    TerminalHarness,
    strip_dangerous_control_codes
)


@pytest.fixture
def terminal():
    return PersistentTerminal()


def test_standard_commands_and_exit_codes(terminal):
    """Runs echo and python exit codes, asserting stdout and exact exit code."""
    # 1. Echo command
    res_echo = terminal.execute_command('python -c "print(\'HELLO\')"', timeout_sec=5.0)
    assert res_echo.exit_code == 0
    assert "HELLO" in res_echo.stdout
    assert not res_echo.timed_out
    assert res_echo.duration_ms > 0

    # 2. Non-zero exit code
    res_exit = terminal.execute_command('python -c "import sys; sys.exit(42)"', timeout_sec=5.0)
    assert res_exit.exit_code == 42
    assert not res_exit.timed_out


def test_non_blocking_stdout_streaming(terminal):
    """Validates real-time streaming chunks via callback."""
    chunks = []

    def on_chunk(chunk: str):
        chunks.append(chunk)

    cmd = 'python -c "import time; print(\'Line 1\', flush=True); print(\'Line 2\', flush=True)"'
    res = terminal.execute_command(cmd, timeout_sec=5.0, on_stdout_chunk=on_chunk)

    assert res.exit_code == 0
    assert "Line 1" in res.stdout
    assert "Line 2" in res.stdout
    assert len(chunks) >= 2


def test_timeout_enforcement(terminal):
    """Enforces timeout on long-running process, ensuring zero hang and process termination."""
    start = time.time()
    res = terminal.execute_command(
        'python -c "import time; time.sleep(10)"',
        timeout_sec=1.0
    )
    duration = time.time() - start

    assert res.timed_out is True
    assert res.exit_code != 0
    assert duration < 8.0, f"Command hung for {duration}s instead of terminating at 1.0s timeout"
    assert "timed out" in res.stderr.lower()


def test_strip_dangerous_control_codes():
    """Validates that disruptive terminal controls are stripped while ANSI colors remain."""
    raw_output = "\x1b]0;Terminal Title\x07\x1b[32mSuccess Green\x1b[0m\x1b[2J"
    cleaned = strip_dangerous_control_codes(raw_output)

    # OSC title and screen clear (\x1b[2J) should be removed
    assert "Terminal Title" not in cleaned
    assert "\x1b[2J" not in cleaned
    # Green ANSI color should be preserved
    assert "\x1b[32m" in cleaned
    assert "Success Green" in cleaned


def test_harness_backwards_compatibility():
    """Validates backwards compatibility with TerminalHarness."""
    harness = TerminalHarness()
    res = harness.run_command('python -c "print(\'Harness OK\')"', timeout=5.0)
    assert res.exit_code == 0
    assert "Harness OK" in res.stdout
    assert res.success is True
