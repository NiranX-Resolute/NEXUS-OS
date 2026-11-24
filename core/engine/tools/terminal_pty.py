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

import collections
import json
import logging
import os
import platform
import queue
import re
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional, Tuple, Union

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
    autofix_suggestion: Optional[Dict[str, Any]] = None

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "duration_ms": round(self.duration_ms, 2),
            "timed_out": self.timed_out,
            "success": self.success
        }
        if self.autofix_suggestion:
            res["autofix_suggestion"] = self.autofix_suggestion
        return res


@dataclass
class TerminalExecutionResult:
    """Backwards-compatible execution result for existing orchestrator calls."""
    command: str
    exit_code: int
    stdout: str
    stderr: str
    duration_sec: float
    timed_out: bool = False
    autofix_suggestion: Optional[Dict[str, Any]] = None

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "command": self.command,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_sec": round(self.duration_sec, 3),
            "timed_out": self.timed_out,
            "success": self.success
        }
        if self.autofix_suggestion:
            res["autofix_suggestion"] = self.autofix_suggestion
        return res


class TerminalErrorWatcher:
    """
    Opt-in ring-buffer stdout/stderr watcher.
    Monitors streaming command output in real-time, detects tracebacks, SyntaxError,
    TypeScript errors (TSXXXX), test failures, and non-zero exit codes.
    Generates structured DEV-01 fix slice suggestions and broadcasts 'nexus:terminal-autofix'.
    """

    def __init__(self, buffer_size: int = 500, db_path: Optional[Path] = None):
        self.buffer_size = buffer_size
        self.stdout_ring: collections.deque[str] = collections.deque(maxlen=buffer_size)
        self.stderr_ring: collections.deque[str] = collections.deque(maxlen=buffer_size)
        self.db_path = db_path or (Path.home() / ".nexus-agent" / "db" / "agent_local.db")
        self._db_initialized = False
        self._ensure_db()

    def _ensure_db(self) -> None:
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(str(self.db_path), timeout=15.0) as conn:
                conn.execute("PRAGMA busy_timeout = 15000;")
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS terminal_autofix_events (
                        id TEXT PRIMARY KEY,
                        command TEXT NOT NULL,
                        exit_code INTEGER NOT NULL,
                        error_type TEXT NOT NULL,
                        error_message TEXT NOT NULL,
                        target_file TEXT,
                        line_number INTEGER,
                        suggested_fix TEXT,
                        created_at REAL NOT NULL
                    );
                    """
                )
                conn.commit()
            self._db_initialized = True
        except Exception as exc:
            logger.debug("Failed to init terminal_autofix_events table: %s", exc)

    def _init_db(self) -> None:
        self._ensure_db()

    def record_chunk(self, stream: str, text: str) -> None:
        lines = text.splitlines(keepends=True)
        target = self.stdout_ring if stream == "stdout" else self.stderr_ring
        for line in lines:
            target.append(line)

    def analyze_output(
        self,
        command: str,
        stdout: str,
        stderr: str,
        exit_code: int,
    ) -> Optional[Dict[str, Any]]:
        """
        Analyzes execution output for error patterns and returns DEV-01 fix slice suggestion if detected.
        """
        combined = (stderr + "\n" + stdout).strip()
        if not combined and exit_code == 0:
            return None

        error_type: Optional[str] = None
        error_message: str = ""
        target_file: Optional[str] = None
        line_number: Optional[int] = None
        suggested_fix: str = ""

        # 1. Check Python SyntaxError
        syntax_match = re.search(r'File "([^"]+)", line (\d+).*?\n\s*(.*?)\n\s*SyntaxError:\s*(.*)', combined, re.DOTALL)
        if syntax_match:
            error_type = "SyntaxError"
            target_file = syntax_match.group(1)
            line_number = int(syntax_match.group(2))
            code_line = syntax_match.group(3).strip()
            detail = syntax_match.group(4).strip()
            error_message = f"SyntaxError in {target_file}:{line_number} - {detail}"
            suggested_fix = f"Inspect {target_file} at line {line_number} around '{code_line}'. Correct syntax error: {detail}."

        # 2. Check general Python Traceback
        if not error_type and "Traceback (most recent call last):" in combined:
            tb_match = re.search(r'File "([^"]+)", line (\d+), in (.*?)\n\s*(.*?)\n\s*([A-Za-z0-9_]+Error.*)', combined)
            if tb_match:
                target_file = tb_match.group(1)
                line_number = int(tb_match.group(2))
                fn = tb_match.group(3)
                code_snippet = tb_match.group(4).strip()
                err_line = tb_match.group(5).strip()
                error_type = err_line.split(":")[0] if ":" in err_line else "PythonTraceback"
                error_message = err_line
                suggested_fix = f"Review exception '{err_line}' in {target_file} line {line_number} (function {fn}). Patch logic handling '{code_snippet}'."
            else:
                last_line = [l.strip() for l in combined.splitlines() if l.strip()][-1]
                error_type = "PythonTraceback"
                error_message = last_line
                suggested_fix = f"Investigate traceback ending in '{last_line}'."

        # 3. Check TypeScript / ESLint error (error TSxxxx)
        if not error_type:
            ts_match = re.search(r'([^\s:(]+)(?:\((\d+),(\d+)\)|:(\d+):(\d+))?:\s*error\s+(TS\d+):\s*(.*)', combined)
            if ts_match:
                target_file = ts_match.group(1)
                line_number = int(ts_match.group(2) or ts_match.group(4) or 0)
                code = ts_match.group(6)
                msg = ts_match.group(7).strip()
                error_type = f"error {code}"
                error_message = msg
                suggested_fix = f"Fix TypeScript error {code} in {target_file}:{line_number}: {msg}."

        # 4. Check FAILED in tests
        if not error_type and ("FAILED" in combined or "AssertionError" in combined):
            failed_test_match = re.search(r'FAILED\s+([^\s:]+)', combined)
            test_target = failed_test_match.group(1) if failed_test_match else "Test Assertion"
            error_type = "FAILED"
            error_message = f"Test failure detected in {test_target}"
            suggested_fix = f"Investigate test regression in {test_target}. Verify assertion and state changes."

        # 5. Non-zero exit code without matching specific patterns
        if not error_type and exit_code != 0:
            lines = [l.strip() for l in combined.splitlines() if l.strip()]
            last_err = lines[-1] if lines else f"Process exited with non-zero code {exit_code}"
            error_type = f"ExitCode_{exit_code}"
            error_message = last_err
            suggested_fix = f"Command failed with exit code {exit_code}. Review stderr/stdout logs: '{last_err}'."

        if not error_type:
            return None

        event_id = f"autofix_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
        suggestion = {
            "id": event_id,
            "agent": "DEV-01",
            "command": command,
            "exit_code": exit_code,
            "error_type": error_type,
            "error_message": error_message,
            "target_file": target_file,
            "line_number": line_number,
            "suggested_fix": suggested_fix,
            "action_slice": "DISPATCH_DEV01_AUTONOMOUS_FIX",
            "timestamp": time.time(),
        }

        # Query learned_instincts for matching remediation patterns
        matched_instincts: List[Dict[str, Any]] = []
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    "SELECT id, trigger_pattern, instinct_rule, confidence_score, workspace_mode FROM learned_instincts WHERE trigger_pattern LIKE ? OR ? LIKE ('%' || trigger_pattern || '%');",
                    (f"%{error_type}%", error_message),
                )
                matched_instincts = [dict(r) for r in cur.fetchall()]
        except Exception as inst_exc:
            logger.debug("Learned instincts query notice: %s", inst_exc)

        suggestion["learned_instincts"] = matched_instincts
        if matched_instincts:
            best = matched_instincts[0]
            suggested_fix = f"{suggested_fix} Applied instinct [{best.get('trigger_pattern')}]: {best.get('instinct_rule')}"
            suggestion["suggested_fix"] = suggested_fix

        # Spawn background DEV-01 fix slice via InfinitySliceEngine
        try:
            from core.runtime.slice_engine import InfinitySliceEngine
            slice_engine = InfinitySliceEngine(db_path=str(self.db_path))
            slice_id = slice_engine.suspend_slice(
                thread_id=event_id,
                current_state={
                    "event_id": event_id,
                    "command": command,
                    "exit_code": exit_code,
                    "error_type": error_type,
                    "error_message": error_message,
                    "target_file": target_file,
                    "line_number": line_number,
                    "suggested_fix": suggested_fix,
                    "status": "QUEUED_AUTONOMOUS_FIX",
                },
                agent_id="DEV-01",
                task_summary=f"Autofix {error_type}: {error_message[:80]}",
                status="ACTIVE",
            )
            suggestion["slice_id"] = slice_id
        except Exception as slice_exc:
            logger.debug("Failed spawning DEV-01 fix slice in InfinitySliceEngine: %s", slice_exc)

        # Broadcast via telemetry event
        try:
            from core.runtime.reflex_router import emit_telemetry_event
            emit_telemetry_event("nexus:terminal-autofix", suggestion)
        except Exception as exc:
            logger.debug("Failed to emit terminal-autofix telemetry event: %s", exc)

        # Persist to SQLite table terminal_autofix_events
        self._ensure_db()
        try:
            with sqlite3.connect(str(self.db_path), timeout=15.0) as conn:
                conn.execute("PRAGMA busy_timeout = 15000;")
                conn.execute(
                    """
                    INSERT INTO terminal_autofix_events
                    (id, command, exit_code, error_type, error_message, target_file, line_number, suggested_fix, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        event_id,
                        command,
                        exit_code,
                        error_type,
                        error_message,
                        target_file,
                        line_number,
                        suggested_fix,
                        time.time(),
                    ),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Failed to persist autofix event: %s", exc)

        return suggestion


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
    Equipped with an opt-in ring-buffer stdout/stderr watcher that detects tracebacks, SyntaxError,
    TypeScript errors, test failures, and non-zero exit codes to trigger DEV-01 autofix suggestions.
    """

    def __init__(
        self,
        default_cwd: Optional[Union[Path, str]] = None,
        enable_watcher: bool = False,
        watcher_buffer_size: int = 500,
        db_path: Optional[Path] = None,
    ):
        self.default_cwd = Path(default_cwd or os.getcwd()).resolve()
        self.enable_watcher = enable_watcher
        self.watcher = TerminalErrorWatcher(buffer_size=watcher_buffer_size, db_path=db_path)

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
                    _ = None
        else:
            try:
                os.killpg(os.getpgid(pid), signal.SIGKILL)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    _ = None

    def execute_command(
        self,
        command: str,
        timeout_sec: float = 60.0,
        working_dir: Optional[Union[Path, str]] = None,
        env_overrides: Optional[Dict[str, str]] = None,
        on_stdout_chunk: Optional[Callable[[str], None]] = None,
        on_stderr_chunk: Optional[Callable[[str], None]] = None,
        input_data: Optional[str] = None,
        enable_error_watcher: Optional[bool] = None,
    ) -> TerminalResult:
        """
        Executes an arbitrary shell command without blocking indefinitely on interactive prompts.
        Streams stdout and stderr progressively and enforces process tree termination upon timeout.
        When error watcher is active, inspects output for errors and dispatches DEV-01 suggestions.
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
        watch_active = enable_error_watcher if enable_error_watcher is not None else self.enable_watcher

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
                _ = None
        try:
            proc.stdin.close()
        except Exception:
            _ = None

        # Asynchronous non-blocking stream reading threads
        def stream_reader(pipe, line_buffer: List[str], chunk_callback: Optional[Callable[[str], None]], stream_name: str):
            try:
                for raw_line in iter(pipe.readline, ''):
                    clean_line = strip_dangerous_control_codes(raw_line)
                    line_buffer.append(clean_line)
                    if watch_active:
                        self.watcher.record_chunk(stream_name, clean_line)
                    if chunk_callback:
                        try:
                            chunk_callback(clean_line)
                        except Exception:
                            _ = None
            except Exception:
                _ = None
            finally:
                try:
                    pipe.close()
                except Exception:
                    _ = None

        out_thread = threading.Thread(
            target=stream_reader,
            args=(proc.stdout, stdout_lines, on_stdout_chunk, "stdout"),
            daemon=True
        )
        err_thread = threading.Thread(
            target=stream_reader,
            args=(proc.stderr, stderr_lines, on_stderr_chunk, "stderr"),
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
        full_stdout = "".join(stdout_lines)
        full_stderr = "".join(stderr_lines)

        autofix = None
        if watch_active or exit_code != 0 or "Traceback" in full_stderr or "SyntaxError" in full_stderr or "TS" in full_stderr:
            autofix = self.watcher.analyze_output(
                command=command,
                stdout=full_stdout,
                stderr=full_stderr,
                exit_code=exit_code,
            )

        return TerminalResult(
            stdout=full_stdout,
            stderr=full_stderr,
            exit_code=exit_code,
            duration_ms=duration_ms,
            timed_out=timed_out,
            autofix_suggestion=autofix,
        )


class TerminalHarness:
    """
    Backwards-compatible harness wrapper for existing orchestrator calls.
    """

    def __init__(
        self,
        default_cwd: Optional[Union[Path, str]] = None,
        enable_watcher: bool = False,
    ):
        self.terminal = PersistentTerminal(default_cwd=default_cwd, enable_watcher=enable_watcher)
        self.default_cwd = str(self.terminal.default_cwd)

    def run_command(
        self,
        command: str,
        cwd: Optional[Union[Path, str]] = None,
        timeout: float = 60.0,
        input_data: Optional[str] = None,
        on_stdout: Optional[Callable[[str], None]] = None,
        on_stderr: Optional[Callable[[str], None]] = None,
        env: Optional[Dict[str, str]] = None,
        enable_error_watcher: Optional[bool] = None,
    ) -> TerminalExecutionResult:
        """Executes command and returns TerminalExecutionResult."""
        res = self.terminal.execute_command(
            command=command,
            timeout_sec=timeout,
            working_dir=cwd or self.default_cwd,
            env_overrides=env,
            on_stdout_chunk=on_stdout,
            on_stderr_chunk=on_stderr,
            input_data=input_data,
            enable_error_watcher=enable_error_watcher,
        )

        return TerminalExecutionResult(
            command=command,
            exit_code=res.exit_code,
            stdout=res.stdout,
            stderr=res.stderr,
            duration_sec=res.duration_ms / 1000.0,
            timed_out=res.timed_out,
            autofix_suggestion=res.autofix_suggestion,
        )


_global_terminal: Optional[PersistentTerminal] = None


def get_global_terminal() -> PersistentTerminal:
    global _global_terminal
    if _global_terminal is None:
        _global_terminal = PersistentTerminal()
    return _global_terminal


def execute_pty(
    command: str,
    timeout_sec: float = 60.0,
    working_dir: Optional[Union[Path, str]] = None
) -> TerminalResult:
    """Functional utility for one-off PTY execution."""
    return get_global_terminal().execute_command(command, timeout_sec=timeout_sec, working_dir=working_dir)


__all__ = [
    "PersistentTerminal",
    "TerminalHarness",
    "TerminalResult",
    "TerminalExecutionResult",
    "TerminalErrorWatcher",
    "execute_pty",
    "strip_dangerous_control_codes",
]
