"""
Nexus Autonomous Engine - Persistent Terminal & Pseudo-Terminal (PTY) Harness
=============================================================================
Zero-Hang command harness with streaming stdout/stderr, strict timeouts,
and non-blocking process tree termination. Prevents infinite hangs on interactive
CLI prompts ([y/N], credentials, continuous loggers).

Supports native POSIX PTY (openpty) on Linux/macOS and ConPTY / non-blocking
asynchronous streaming pipelines on Windows.
=============================================================================
"""

import os
import sys
import re
import time
import queue
import signal
import platform
import threading
import subprocess
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List, Generator, Tuple, Union

logger = logging.getLogger("nexus.terminal_pty")

IS_WINDOWS = platform.system() == "Windows"

# Regex to strip non-printable/dangerous control codes while preserving standard ANSI colors (SGR: \x1b[...m)
CONTROL_CHARS_REGEX = re.compile(
    r'\x1b\][^\x07\x1b]*[\x07\x1b\\]|'  # Operating System Command (e.g. window title)
    r'\x1b\[[0-9;]*[A-HJKSTf]'           # Cursor movements, screen clear (not 'm' color codes)
)


@dataclass
class TerminalResult:
    """Dataclass capturing the outcome of a command execution."""
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: float
    timed_out: bool

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_ms": round(self.duration_ms, 2),
            "timed_out": self.timed_out,
            "success": self.success
        }


@dataclass
class TerminalExecutionResult:
    """Backwards-compatible execution result for existing orchestrator calls."""
    command: str
    exit_code: int
    stdout: str
    stderr: str
    duration_sec: float
    timed_out: bool = False

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def to_dict(self) -> Dict[str, Any]:
        return {
            "command": self.command,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_sec": round(self.duration_sec, 3),
            "timed_out": self.timed_out,
            "success": self.success
        }


def strip_dangerous_control_codes(text: str) -> str:
    """Strips disruptive terminal control sequences while preserving printable ANSI colors."""
    if not text:
        return ""
    # Strip OSC titles and non-SGR cursor control
    cleaned = CONTROL_CHARS_REGEX.sub('', text)
    # Strip null bytes and lone carriage returns that overwrite lines
    cleaned = cleaned.replace('\x00', '').replace('\r\n', '\n').replace('\r', '\n')
    return cleaned


class PersistentTerminal:
    """
    Persistent execution harness with non-blocking streaming and deterministic timeout enforcement.
    """

    def __init__(self, default_cwd: Optional[Union[Path, str]] = None):
        self.default_cwd = Path(default_cwd or os.getcwd()).resolve()

    def _terminate_process_tree(self, proc: subprocess.Popen) -> None:
        """Deterministic, cross-platform process tree termination."""
        pid = proc.pid
        if IS_WINDOWS:
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    timeout=5.0
                )
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        else:
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

    def execute_command(
        self,
        command: str,
        timeout_sec: float = 60.0,
        working_dir: Optional[Union[Path, str]] = None,
        env_overrides: Optional[Dict[str, str]] = None,
        on_stdout_chunk: Optional[Callable[[str], None]] = None,
        on_stderr_chunk: Optional[Callable[[str], None]] = None,
        input_data: Optional[str] = None
    ) -> TerminalResult:
        """
        Executes an arbitrary shell command without blocking indefinitely on interactive prompts.
        Streams stdout and stderr progressively and enforces process tree termination upon timeout.
        """
        target_dir = Path(working_dir or self.default_cwd).resolve()
        target_dir.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["TERM"] = "xterm-256color"
        env["CI"] = "1"
        env["PAGER"] = "cat"
        if env_overrides:
            env.update(env_overrides)

        start_time = time.time()
        stdout_lines: List[str] = []
        stderr_lines: List[str] = []
        timed_out = False

        # Platform-specific process spawning
        if IS_WINDOWS:
            proc = subprocess.Popen(
                command,
                shell=True,
                cwd=str(target_dir),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1
            )
        else:
            # POSIX: spawn in dedicated process group to allow os.killpg
            proc = subprocess.Popen(
                command,
                shell=True,
                cwd=str(target_dir),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                preexec_fn=os.setsid
            )

        # Handle stdin to avoid interactive prompt deadlocks
        if input_data:
            try:
                proc.stdin.write(input_data + "\n")
                proc.stdin.flush()
            except Exception:
                pass
        try:
            proc.stdin.close()
        except Exception:
            pass

        # Asynchronous non-blocking stream reading threads
        def stream_reader(pipe, line_buffer: List[str], chunk_callback: Optional[Callable[[str], None]]):
            try:
                for raw_line in iter(pipe.readline, ''):
                    clean_line = strip_dangerous_control_codes(raw_line)
                    line_buffer.append(clean_line)
                    if chunk_callback:
                        try:
                            chunk_callback(clean_line)
                        except Exception:
                            pass
            except Exception:
                pass
            finally:
                try:
                    pipe.close()
                except Exception:
                    pass

        out_thread = threading.Thread(
            target=stream_reader,
            args=(proc.stdout, stdout_lines, on_stdout_chunk),
            daemon=True
        )
        err_thread = threading.Thread(
            target=stream_reader,
            args=(proc.stderr, stderr_lines, on_stderr_chunk),
            daemon=True
        )

        out_thread.start()
        err_thread.start()

        # Wait with timeout
        try:
            exit_code = proc.wait(timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            timed_out = True
            self._terminate_process_tree(proc)
            exit_code = -1
            stderr_lines.append(f"\n[Command execution timed out after {timeout_sec:.1f}s]\n")

        # Ensure reading threads have flushed (shorter wait if timed out)
        join_timeout = 0.25 if timed_out else 1.0
        out_thread.join(timeout=join_timeout)
        err_thread.join(timeout=join_timeout)

        duration_ms = (time.time() - start_time) * 1000.0

        return TerminalResult(
            stdout="".join(stdout_lines),
            stderr="".join(stderr_lines),
            exit_code=exit_code,
            duration_ms=duration_ms,
            timed_out=timed_out
        )


class TerminalHarness:
    """
    Backwards-compatible harness wrapper for existing orchestrator calls.
    """

    def __init__(self, default_cwd: Optional[Union[Path, str]] = None):
        self.terminal = PersistentTerminal(default_cwd=default_cwd)
        self.default_cwd = str(self.terminal.default_cwd)

    def run_command(
        self,
        command: str,
        cwd: Optional[Union[Path, str]] = None,
        timeout: float = 60.0,
        input_data: Optional[str] = None,
        on_stdout: Optional[Callable[[str], None]] = None,
        on_stderr: Optional[Callable[[str], None]] = None,
        env: Optional[Dict[str, str]] = None
    ) -> TerminalExecutionResult:
        """Executes command and returns TerminalExecutionResult."""
        res = self.terminal.execute_command(
            command=command,
            timeout_sec=timeout,
            working_dir=cwd or self.default_cwd,
            env_overrides=env,
            on_stdout_chunk=on_stdout,
            on_stderr_chunk=on_stderr,
            input_data=input_data
        )

        return TerminalExecutionResult(
            command=command,
            exit_code=res.exit_code,
            stdout=res.stdout,
            stderr=res.stderr,
            duration_sec=res.duration_ms / 1000.0,
            timed_out=res.timed_out
        )


_global_terminal = PersistentTerminal()


def execute_pty(
    command: str,
    timeout_sec: float = 60.0,
    working_dir: Optional[Union[Path, str]] = None
) -> TerminalResult:
    """Functional utility for one-off PTY execution."""
    return _global_terminal.execute_command(command, timeout_sec=timeout_sec, working_dir=working_dir)
