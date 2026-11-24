#!/usr/bin/env python3
"""Nexus OS v5.0 - Master CLI Control & Orchestration Runner.

Unified command-line interface and supervisor for the Nexus sovereign desktop agent:
  python nexus.py                   # Boots Unified Nexus OS (Notch HUD + Command Center + IPC Spine)
  python nexus.py --install-startup # Registers silent Windows login task (pythonw.exe)
  python nexus.py --remove-startup  # Unregisters Windows login auto-start task
  python nexus.py --notch           # Launch Nexus Notch HUD Dynamic Island alone
  python nexus.py --command-center  # Start Command Center Vite UI (bun run dev)
  python nexus.py --slice-daemon    # Execute Infinity Bounded Slice Runtime Engine
  python nexus.py --obscura-mcp     # Run Obscura Anti-Detect Browser MCP Server
  python nexus.py --train-wakeword  # Trigger Custom Wake-Word Synthetic Generation
  python nexus.py --optimize-traces # Execute Weekly DSPy MIPROv2 Prompt Optimization
  python nexus.py --test-all        # Run System Verification Suite (pytest tests/)
"""

from __future__ import annotations

import argparse
import ctypes
import logging
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import threading
import time

# -----------------------------------------------------------------------------
# 1. Windowless pythonw.exe stdio redirection & logging
# -----------------------------------------------------------------------------
LOG_DIR = Path.home() / ".nexus-agent" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
BOOT_LOG_FILE = LOG_DIR / "nexus_boot.log"

if sys.stdout is None or sys.stderr is None:
    _log_f = open(BOOT_LOG_FILE, "a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = _log_f
    if sys.stderr is None:
        sys.stderr = _log_f

class FlushingFileHandler(logging.FileHandler):
    def emit(self, record: logging.LogRecord) -> None:
        super().emit(record)
        self.flush()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [NEXUS-CLI] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        FlushingFileHandler(str(BOOT_LOG_FILE), encoding="utf-8"),
    ],
)
logger = logging.getLogger("nexus.cli")

REPO_ROOT = Path(__file__).resolve().parent


# -----------------------------------------------------------------------------
# 2. Win32 Single-Instance Mutex & Window Focusing
# -----------------------------------------------------------------------------
def acquire_single_instance_mutex() -> Any:
    """Acquires named Win32 mutex. If already running, focuses windows and exits."""
    if sys.platform != "win32":
        return None
    kernel32 = ctypes.windll.kernel32
    ERROR_ALREADY_EXISTS = 183
    mutex = kernel32.CreateMutexW(None, False, "Global\\NexusOS_Master_Mutex")
    last_err = kernel32.GetLastError()
    if last_err == ERROR_ALREADY_EXISTS:
        focus_nexus_windows()
        logger.info("Nexus OS instance is already active. Brought windows to front.")
        sys.exit(0)
    return mutex


def focus_nexus_windows() -> None:
    """Finds and restores active Nexus Workstation and Notch HUD windows on WinSta0\\Default."""
    if sys.platform != "win32":
        return
    user32 = ctypes.windll.user32

    def enum_cb(hwnd: int, lparam: int) -> bool:
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value
            title_lower = title.lower()
            if any(k in title_lower for k in ["nexus", "notch", "sovereign", "command center"]):
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SwitchToThisWindow(hwnd, True)
                user32.BringWindowToTop(hwnd)
                user32.SetForegroundWindow(hwnd)
        return True

    WNDENUM = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(WNDENUM(enum_cb), 0)


# -----------------------------------------------------------------------------
# 3. Subprocess Spawning Helpers (Zero-Flash on WinSta0\\Default)
# -----------------------------------------------------------------------------
def spawn_silent(cmd: list[str], cwd: str | Path | None = None, is_gui: bool = False) -> subprocess.Popen:
    """Spawns child processes on WinSta0\\Default with zero console terminal flashes."""
    kwargs: dict = {
        "cwd": str(cwd) if cwd else str(REPO_ROOT),
        "stdout": sys.stdout,
        "stderr": sys.stderr,
    }
    if sys.platform == "win32":
        si = subprocess.STARTUPINFO()
        si.lpDesktop = "WinSta0\\Default"
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 5 if is_gui else subprocess.SW_HIDE
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        kwargs["startupinfo"] = si
    return subprocess.Popen(cmd, **kwargs)


def get_python_command(gui: bool = False) -> list[str]:
    """Returns command prefix to run python in the virtual environment."""
    venv_dir = REPO_ROOT / ".venv" / "Scripts"
    py = venv_dir / ("pythonw.exe" if gui else "python.exe")
    if py.exists():
        return [str(py)]
    uv_bin = shutil.which("uv")
    if uv_bin:
        venv_path = str(REPO_ROOT / ".venv")
        return [uv_bin, "run", "--python", venv_path, "pythonw" if gui else "python"]
    return [str(sys.executable)]


def get_python_executables() -> tuple[str, str]:
    """Returns (python_console_exe, python_gui_exe)."""
    venv_dir = REPO_ROOT / ".venv" / "Scripts"
    py = venv_dir / "python.exe"
    pyw = venv_dir / "pythonw.exe"

    python_exe = str(py if py.exists() else sys.executable)
    sys_pyw = Path(sys.executable).with_name("pythonw.exe")
    pythonw_exe = str(pyw if pyw.exists() else sys_pyw if sys_pyw.exists() else sys.executable)
    return python_exe, pythonw_exe


# -----------------------------------------------------------------------------
# 4. Individual Subsystem Launchers (Opt-in or Supervisor targets)
# -----------------------------------------------------------------------------
def launch_notch_hud() -> int:
    """Launches the Nexus Notch HUD desktop dynamic island surface."""
    notch_main = REPO_ROOT / "apps" / "notch_hud" / "main.py"
    if not notch_main.exists():
        notch_main = REPO_ROOT / "apps" / "notch_hud" / "notch_window.py"

    if not notch_main.exists():
        logger.error("Notch HUD entry point not found at %s", notch_main)
        return 1

    py_gui_cmd = get_python_command(gui=True)
    logger.info("Launching Nexus Notch HUD Surface: %s", notch_main)
    return subprocess.run([*py_gui_cmd, str(notch_main)]).returncode


def launch_command_center() -> int:
    """Starts the Command Center UI development server in apps/command_center."""
    cc_dir = REPO_ROOT / "apps" / "command_center"
    if not cc_dir.exists():
        logger.error("Command Center directory not found at %s", cc_dir)
        return 1

    bun_bin = shutil.which("bun")
    if bun_bin:
        cmd = [bun_bin, "run", "dev"]
    else:
        npm_bin = shutil.which("npm") or "npm.cmd"
        cmd = [npm_bin, "run", "dev"]

    logger.info("Starting Command Center Development Server in %s with %s", cc_dir, " ".join(cmd))
    return subprocess.run(cmd, cwd=str(cc_dir), shell=(sys.platform == "win32")).returncode


def launch_slice_daemon() -> int:
    """Executes the Infinity Bounded Slice Runtime Engine."""
    logger.info("Initializing Infinity Bounded Slice Runtime Engine...")
    try:
        from core.slice.engine import InfinitySliceEngine
        engine = InfinitySliceEngine()
        engine.run_daemon()
        return 0
    except Exception as e:
        logger.error("Failed to run Infinity Slice daemon: %s", e)
        return 1


def launch_obscura_mcp() -> int:
    """Runs the Obscura Anti-Detect Browser FastMCP Server."""
    mcp_script = REPO_ROOT / "core" / "mcp" / "obscura_mcp_server.py"
    if not mcp_script.exists():
        logger.error("Obscura MCP script not found at %s", mcp_script)
        return 1

    logger.info("Starting Obscura Stealth Browser FastMCP Server: %s", mcp_script)
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(mcp_script)]).returncode


def launch_sec_mcp() -> int:
    """Runs the SEC-01 Sentinel Security Audit FastMCP Server."""
    mcp_script = REPO_ROOT / "core" / "mcp" / "sec_mcp_server.py"
    if not mcp_script.exists():
        logger.error("SEC-01 MCP script not found at %s", mcp_script)
        return 1

    logger.info("Starting SEC-01 Sentinel FastMCP Server: %s", mcp_script)
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(mcp_script)]).returncode


def launch_windows_mcp() -> int:
    """Runs the Windows UIA Actuation & Screen Comprehension FastMCP Server."""
    mcp_script = REPO_ROOT / "core" / "mcp" / "windows_mcp_server.py"
    if not mcp_script.exists():
        logger.error("Windows MCP script not found at %s", mcp_script)
        return 1

    logger.info("Starting Windows Actuation FastMCP Server: %s", mcp_script)
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(mcp_script)]).returncode


def launch_edge_bridge() -> int:
    """Launches the Omnichannel Edge Mesh Bridge (Telegram & Discord Webhooks)."""
    bridge_script = REPO_ROOT / "core" / "edge" / "omnichannel_bridge.py"
    if not bridge_script.exists():
        logger.error("Omnichannel bridge script not found at %s", bridge_script)
        return 1

    logger.info("Starting Omnichannel Edge Mesh Bridge: %s", bridge_script)
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(bridge_script)]).returncode


def launch_voice_duplex() -> int:
    """Launches the Full-Duplex Voice & Vision Loop daemon."""
    voice_script = REPO_ROOT / "apps" / "notch_hud" / "voice_pipeline.py"
    if not voice_script.exists():
        logger.error("Voice pipeline script not found at %s", voice_script)
        return 1

    logger.info("Starting Duplex Voice & Vision Pipeline: %s", voice_script)
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(voice_script)]).returncode


def launch_train_wakeword() -> int:
    """Triggers Custom Wake-Word Synthetic Generation."""
    script_path = REPO_ROOT / "scripts" / "train_wakeword.py"
    if not script_path.exists():
        logger.error("Wake-word trainer script not found at %s", script_path)
        return 1

    logger.info("Triggering Custom Wake-Word Synthetic Generation...")
    python_exe, _ = get_python_executables()
    return subprocess.run([python_exe, str(script_path)]).returncode


def launch_optimize_traces() -> int:
    """Executes Weekly Trace Distillation & Prompt Optimization."""
    from core.memory.learning_graph import run_weekly_trace_distillation
    logger.info("Executing Weekly Trace Distillation & Learning Graph Optimization...")
    res = run_weekly_trace_distillation()
    logger.info("Trace distillation complete: %s (analyzed %d traces)", res.get("success"), res.get("rules", {}).get("total_traces_analyzed", 0))
    return 0 if res.get("success") else 1


def launch_cron_scheduler() -> int:
    """Runs 24/7 Autonomous Cron Scheduler Daemon."""
    from core.runtime.cron_scheduler import AutonomousCronScheduler
    logger.info("Starting Autonomous Cron Scheduler daemon...")
    scheduler = AutonomousCronScheduler()
    scheduler.start_daemon(poll_interval_sec=15.0)
    try:
        while True:
            time.sleep(1.0)
    except KeyboardInterrupt:
        scheduler.stop_daemon()
    return 0


def launch_ipc_server(port: int = 47630) -> int:
    """Starts the Nexus FastAPI Local Gateway for Command Center and Notch HUD."""
    logger.info("Starting Nexus FastAPI Gateway on port %d...", port)
    try:
        from core.runtime.gateway import run_gateway
        return run_gateway(host="127.0.0.1", port=port)
    except Exception as exc:
        logger.warning("FastAPI Gateway notice: %s. Falling back to NexusIPCServer...", exc)
        from core.runtime.ipc_server import NexusIPCServer
        server = NexusIPCServer(port=port)
        try:
            logger.info("Nexus IPC Server active at http://127.0.0.1:%d/ (Press Ctrl+C to stop)", port)
            server.serve_forever()
            return 0
        except KeyboardInterrupt:
            logger.info("Nexus IPC Server shutting down...")
            server.shutdown()
            return 0
        except Exception as exc2:
            logger.error("IPC server error: %s", exc2)
            return 1


def launch_hotkey_daemon() -> int:
    """Runs the Global Hold-to-Talk Hotkey Daemon in the foreground."""
    logger.info("Starting Global Hold-to-Talk Hotkey Daemon (WH_KEYBOARD_LL: `, Ctrl+Space, Insert)...")
    from core.runtime.hotkey_daemon import get_hotkey_daemon
    daemon = get_hotkey_daemon()
    try:
        daemon.start(block=True)
        return 0
    except KeyboardInterrupt:
        logger.info("Hotkey Daemon shutting down...")
        daemon.stop()
        return 0
    except Exception as exc:
        logger.error("Hotkey Daemon error: %s", exc)
        return 1


def run_test_suite() -> int:
    """Runs the full system verification test suite using pytest."""
    tests_dir = REPO_ROOT / "tests"
    if not tests_dir.exists():
        logger.error("Tests directory not found at %s", tests_dir)
        return 1

    logger.info("Executing System Verification Suite: pytest tests/ ...")
    python_exe, _ = get_python_executables()
    cmd = [python_exe, "-m", "pytest", str(tests_dir), "-v"]
    return subprocess.run(cmd, cwd=str(REPO_ROOT)).returncode


# -----------------------------------------------------------------------------
# 5. Windows Auto-Start Task Registration (--install-startup / --remove-startup)
# -----------------------------------------------------------------------------
def install_startup_task() -> int:
    """Registers NexusOS_Unified_Startup Windows Scheduled Task pointing directly to pythonw.exe nexus.py."""
    logger.info("Registering NexusOS_Unified_Startup in Windows Task Scheduler...")
    _, pythonw_exe = get_python_executables()
    workspace = str(REPO_ROOT)
    nexus_script = str(REPO_ROOT / "nexus.py")

    ps_script = f"""
$User = "$($env:USERDOMAIN)\\$($env:USERNAME)"
$Action = New-ScheduledTaskAction -Execute '{pythonw_exe}' -Argument '"{nexus_script}"' -WorkingDirectory '{workspace}'
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'NexusOS_Unified_Startup' -Action $Action -Trigger $Trigger -Settings $Settings -Description 'Boots Unified Nexus OS v5.0 (Notch HUD + Command Center + IPC Spine) silently on login' -Force
"""
    res = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script], capture_output=True, text=True)
    if res.returncode == 0:
        logger.info("Successfully registered 'NexusOS_Unified_Startup' Scheduled Task!")
        return 0
    else:
        logger.warning("Scheduled Task registration notice: %s. Setting HKCU Run registry key fallback...", res.stderr.strip())
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "NexusOS_Unified_Startup", 0, winreg.REG_SZ, f'"{pythonw_exe}" "{nexus_script}"')
            winreg.CloseKey(key)
            logger.info("Successfully registered in HKCU Run key fallback!")
            return 0
        except Exception as exc:
            logger.error("Failed to register startup: %s", exc)
            return 1


def remove_startup_task() -> int:
    """Unregisters NexusOS_Unified_Startup Scheduled Task and HKCU Run key."""
    logger.info("Unregistering NexusOS_Unified_Startup...")
    ps_script = "Unregister-ScheduledTask -TaskName 'NexusOS_Unified_Startup' -Confirm:$false -ErrorAction SilentlyContinue"
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script], capture_output=True)
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        winreg.DeleteValue(key, "NexusOS_Unified_Startup")
        winreg.CloseKey(key)
    except Exception as e:
        logger.debug("Registry startup key cleanup suppressed: %s", e)
    logger.info("Cleanly unregistered NexusOS_Unified_Startup.")
    return 0


# -----------------------------------------------------------------------------
# 6. UNIFIED MASTER BOOT (Default = Full Nexus OS Suite)
# -----------------------------------------------------------------------------
def boot_unified_nexus() -> int:
    """Boots the entire unified Nexus OS stack as one coordinated organism on WinSta0\\Default."""
    logger.info("=" * 75)
    logger.info("       N E X U S   O S   v 5 . 0   —   U N I F I E D   B O O T")
    logger.info("             S O V E R E I G N   E C O S Y S T E M   O N L I N E")
    logger.info("=" * 75)

    # 1. Acquire named Win32 single-instance mutex
    _mutex = acquire_single_instance_mutex()

    python_exe, pythonw_exe = get_python_executables()
    children: list[subprocess.Popen] = []

    # 2. Start Backend FastAPI Gateway on port 47630 in background thread
    logger.info("[1/3] Initializing Core Backend FastAPI Gateway on port 47630...")
    try:
        from core.runtime.gateway import start_gateway_background
        gateway_instance = start_gateway_background(host="127.0.0.1", port=47630)
        logger.info("      -> Core FastAPI Gateway online at http://127.0.0.1:47630")
    except Exception as exc:
        logger.warning("Core Gateway inline startup notice: %s. Falling back to IPC server...", exc)
        try:
            from core.runtime.ipc_server import NexusIPCServer
            ipc_server = NexusIPCServer(host="127.0.0.1", port=47630)
            os.environ["NEXUS_IPC_TOKEN"] = getattr(ipc_server, "auth_token", "")
            ipc_thread = threading.Thread(target=ipc_server.serve_forever, daemon=True)
            ipc_thread.start()
            logger.info("      -> Core IPC Server online at http://127.0.0.1:47630")
        except Exception as exc2:
            logger.warning("Core IPC Server inline startup notice: %s. Spawning daemon...", exc2)
            ipc_proc = spawn_silent([python_exe, str(REPO_ROOT / "nexus.py"), "--ipc-server"])
            children.append(ipc_proc)

    # 3b. Start Global Hold-to-Talk Hotkey Daemon (Lite Profile)
    try:
        from core.runtime.hotkey_daemon import get_hotkey_daemon
        hotkey_daemon = get_hotkey_daemon()
        hotkey_daemon.start()
        logger.info("      -> Global Hold-to-Talk Hotkey Daemon active (WH_KEYBOARD_LL)")
    except Exception as exc:
        logger.debug("Hotkey daemon startup notice: %s", exc)

    # 2a. Reboot-resilient slice recovery scan
    try:
        from core.runtime.slice_engine import scan_interrupted_slices
        recovered_slices = scan_interrupted_slices()
        logger.info("      -> Slice recovery scan: %d recoverable slice(s) detected", len(recovered_slices))
    except Exception as exc:
        logger.debug("Slice recovery scan notice: %s", exc)

    # 2b. Start Infinity Slice Daemon in background thread
    try:
        from core.slice.engine import InfinitySliceEngine
        slice_engine = InfinitySliceEngine()
        slice_thread = threading.Thread(target=slice_engine.run_daemon, daemon=True)
        slice_thread.start()
        logger.info("      -> Infinity Bounded Slice Engine active in WAL background thread")
    except Exception as exc:
        logger.debug("Slice engine thread: %s", exc)

    # 2c. Start Autonomous 24/7 Cron Scheduler & Morning Briefing Daemon
    try:
        from core.runtime.cron_scheduler import AutonomousCronScheduler
        cron_sched = AutonomousCronScheduler()
        cron_sched.start_daemon(poll_interval_sec=30.0)
        logger.info("      -> Autonomous Cron Scheduler & Morning Briefing daemon active")
    except Exception as exc:
        logger.debug("Cron scheduler thread: %s", exc)

    # 2d. Start Global Hold-to-Talk Hotkey Daemon (WH_KEYBOARD_LL)
    try:
        from core.runtime.hotkey_daemon import get_hotkey_daemon
        hotkey_daemon = get_hotkey_daemon()
        hotkey_daemon.start()
        logger.info("      -> Global Hold-to-Talk Hotkey Daemon active (WH_KEYBOARD_LL: `, Ctrl+Space, Insert)")
    except Exception as exc:
        logger.debug("Hotkey daemon startup notice: %s", exc)

    # 3. Launch Top-edge Dynamic Island (apps/notch_hud) anchored to primary monitor on WinSta0\Default
    logger.info("[2/3] Pinning Nexus Notch HUD Dynamic Island to WinSta0\\Default...")
    os.environ.setdefault("NEXUS_NOTCH_CAPTURE", "0")
    notch_script = REPO_ROOT / "apps" / "notch_hud" / "main.py"
    child_specs: list[dict[str, Any]] = []

    if notch_script.exists():
        py_gui_cmd = get_python_command(gui=True)
        child_specs.append({
            "name": "Notch HUD",
            "cmd": [*py_gui_cmd, str(notch_script), "--no-tray"],
            "cwd": str(REPO_ROOT),
            "is_gui": True,
            "restarts": 0,
        })

    # 4. Launch Unified Main Workstation Window (Command Center / Desktop) on WinSta0\Default
    logger.info("[3/3] Launching Unified Nexus Main Workstation Window...")
    desktop_dir = REPO_ROOT / "apps" / "desktop"
    out_main = desktop_dir / "out" / "main" / "index.js"
    electron_node_exe = desktop_dir / "node_modules" / "electron" / "dist" / "electron.exe"
    unpacked_exe = desktop_dir / "release" / "win-unpacked" / "nexus-ai.exe"

    if electron_node_exe.exists() and out_main.exists():
        logger.info("      -> Launching live Electron workstation from out/: %s", electron_node_exe)
        child_specs.append({
            "name": "Workstation",
            "cmd": [str(electron_node_exe), "."],
            "cwd": str(desktop_dir),
            "is_gui": True,
            "restarts": 0,
        })
    elif unpacked_exe.exists():
        logger.info("      -> Launching unpacked binary: %s", unpacked_exe)
        child_specs.append({
            "name": "Workstation",
            "cmd": [str(unpacked_exe)],
            "cwd": str(desktop_dir),
            "is_gui": True,
            "restarts": 0,
        })
    elif electron_node_exe.exists():
        logger.info("      -> Launching Electron runtime: %s", electron_node_exe)
        child_specs.append({
            "name": "Workstation",
            "cmd": [str(electron_node_exe), "."],
            "cwd": str(desktop_dir),
            "is_gui": True,
            "restarts": 0,
        })
    else:
        npm_bin = shutil.which("npm") or "npm.cmd"
        child_specs.append({
            "name": "Workstation",
            "cmd": [npm_bin, "run", "dev"],
            "cwd": str(desktop_dir),
            "is_gui": True,
            "restarts": 0,
        })

    running_children: dict[subprocess.Popen, dict[str, Any]] = {}
    for spec in child_specs:
        proc = spawn_silent(spec["cmd"], cwd=spec["cwd"], is_gui=spec["is_gui"])
        running_children[proc] = spec
        logger.info("      -> %s online (PID: %s)", spec["name"], proc.pid)

    logger.info("[SUCCESS] Unified Nexus OS v5.0 Organism Active! Supervisor monitoring...")

    # 5. Clean supervision loop with auto-restart on unexpected crashes
    is_shutting_down = False

    def shutdown_all(*_):
        nonlocal is_shutting_down
        is_shutting_down = True
        logger.info("Nexus OS supervisor shutting down. Terminating child processes...")
        for p in list(running_children.keys()):
            try:
                p.terminate()
            except Exception as e:
                logger.debug("Child termination suppressed: %s", e)
        time.sleep(0.4)
        for p in list(running_children.keys()):
            try:
                p.kill()
            except Exception as e:
                logger.debug("Child kill suppressed: %s", e)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_all)
    signal.signal(signal.SIGTERM, shutdown_all)

    try:
        while not is_shutting_down:
            time.sleep(1.0)
            for p in list(running_children.keys()):
                ret = p.poll()
                if ret is not None:
                    spec = running_children.pop(p)
                    logger.warning("%s (PID %s) exited with code %s", spec["name"], p.pid, ret)
                    # Auto-restart crashed daemon if non-zero exit and limit not exceeded
                    if ret != 0 and spec["restarts"] < 3 and not is_shutting_down:
                        spec["restarts"] += 1
                        logger.info("Auto-restarting %s (attempt %d/3)...", spec["name"], spec["restarts"])
                        new_p = spawn_silent(spec["cmd"], cwd=spec["cwd"], is_gui=spec["is_gui"])
                        running_children[new_p] = spec
            if not running_children and threading.active_count() <= 1:
                break
    except KeyboardInterrupt:
        shutdown_all()

    return 0


# -----------------------------------------------------------------------------
# 6b. LITE LAUNCHER PROFILE (IPC Server :47630 + Notch HUD, skips Electron)
# -----------------------------------------------------------------------------
def boot_lite_nexus() -> int:
    """Boots the lightweight Nexus profile: IPC Server (:47630) + Dynamic Notch HUD without Electron workstation."""
    logger.info("=" * 75)
    logger.info("       N E X U S   O S   v 5 . 0   —   L I T E   P R O F I L E")
    logger.info("           I P C   S P I N E   +   D Y N A M I C   N O T C H")
    logger.info("=" * 75)

    # 1. Acquire named Win32 single-instance mutex
    _mutex = acquire_single_instance_mutex()

    python_exe, pythonw_exe = get_python_executables()
    children: list[subprocess.Popen] = []

    # 2. Boot-time interrupted/suspended slice recovery sweep & summary
    try:
        from core.runtime.slice_engine import get_recovery_summary
        rec_summary = get_recovery_summary()
        logger.info(
            "[1/3] Slice recovery sweep: %d recoverable slice(s) detected (ESTOP=%s, SILENT=%s)",
            rec_summary.get("count", 0),
            rec_summary.get("estop_active", False),
            rec_summary.get("silent_mode", False),
        )
    except Exception as exc:
        logger.debug("Slice recovery scan notice: %s", exc)

    # 3. Start Backend FastAPI Gateway / IPC server on port 47630 in background thread
    logger.info("[1/2] Initializing Core Backend Gateway on port 47630...")
    try:
        from core.runtime.gateway import start_gateway_background
        gateway_instance = start_gateway_background(host="127.0.0.1", port=47630)
        logger.info("      -> Core FastAPI Gateway online at http://127.0.0.1:47630")
    except Exception as exc:
        logger.warning("Core Gateway inline startup notice: %s. Falling back to IPC server...", exc)
        try:
            from core.runtime.ipc_server import NexusIPCServer
            ipc_server = NexusIPCServer(host="127.0.0.1", port=47630)
            os.environ["NEXUS_IPC_TOKEN"] = getattr(ipc_server, "auth_token", "")
            ipc_thread = threading.Thread(target=ipc_server.serve_forever, daemon=True)
            ipc_thread.start()
            logger.info("      -> Core IPC Server online at http://127.0.0.1:47630")
        except Exception as exc2:
            logger.warning("Core IPC Server inline startup notice: %s. Spawning daemon...", exc2)
            ipc_proc = spawn_silent([python_exe, str(REPO_ROOT / "nexus.py"), "--ipc-server"])
            children.append(ipc_proc)

    # 3b. Start Global Hold-to-Talk Hotkey Daemon (Lite Profile)
    try:
        from core.runtime.hotkey_daemon import get_hotkey_daemon
        hotkey_daemon = get_hotkey_daemon()
        hotkey_daemon.start()
        logger.info("      -> Global Hold-to-Talk Hotkey Daemon active (WH_KEYBOARD_LL)")
    except Exception as exc:
        logger.debug("Hotkey daemon startup notice: %s", exc)

    # 4. Launch Top-edge Dynamic Island (apps/notch_hud) with --no-tray on WinSta0\Default
    logger.info("[2/2] Pinning Nexus Notch HUD Dynamic Island to WinSta0\\Default (Lite mode)...")
    os.environ.setdefault("NEXUS_NOTCH_CAPTURE", "0")
    notch_script = REPO_ROOT / "apps" / "notch_hud" / "main.py"
    if not notch_script.exists():
        notch_script = REPO_ROOT / "apps" / "notch_hud" / "notch_window.py"

    child_specs: list[dict[str, Any]] = []
    if notch_script.exists():
        py_gui_cmd = get_python_command(gui=True)
        child_specs.append({
            "name": "Notch HUD",
            "cmd": [*py_gui_cmd, str(notch_script), "--no-tray"],
            "cwd": str(REPO_ROOT),
            "is_gui": True,
            "restarts": 0,
        })

    running_children: dict[subprocess.Popen, dict[str, Any]] = {}
    for spec in child_specs:
        proc = spawn_silent(spec["cmd"], cwd=spec["cwd"], is_gui=spec["is_gui"])
        running_children[proc] = spec
        logger.info("      -> %s online (PID: %s)", spec["name"], proc.pid)

    logger.info("[SUCCESS] Nexus Lite Profile Active! (Electron workstation skipped). Supervisor monitoring...")

    # 5. Clean supervision loop
    is_shutting_down = False

    def shutdown_all(*_):
        nonlocal is_shutting_down
        is_shutting_down = True
        logger.info("Nexus Lite supervisor shutting down. Terminating child processes...")
        for p in list(running_children.keys()):
            try:
                p.terminate()
            except Exception as e:
                logger.debug("Child termination suppressed: %s", e)
        time.sleep(0.4)
        for p in list(running_children.keys()):
            try:
                p.kill()
            except Exception as e:
                logger.debug("Child kill suppressed: %s", e)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_all)
    signal.signal(signal.SIGTERM, shutdown_all)

    try:
        while not is_shutting_down:
            time.sleep(1.0)
            for p in list(running_children.keys()):
                ret = p.poll()
                if ret is not None:
                    spec = running_children.pop(p)
                    logger.warning("%s (PID %s) exited with code %s", spec["name"], p.pid, ret)
                    if ret != 0 and spec["restarts"] < 3 and not is_shutting_down:
                        spec["restarts"] += 1
                        logger.info("Auto-restarting %s (attempt %d/3)...", spec["name"], spec["restarts"])
                        new_p = spawn_silent(spec["cmd"], cwd=spec["cwd"], is_gui=spec["is_gui"])
                        running_children[new_p] = spec
            if not running_children and threading.active_count() <= 1:
                break
    except KeyboardInterrupt:
        shutdown_all()

    return 0


# -----------------------------------------------------------------------------
# 7. CLI Argument Parser & Entry Point
# -----------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nexus",
        description="Nexus OS v5.0 - Master CLI Control & Orchestration Runner",
    )
    parser.add_argument(
        "--unified",
        action="store_true",
        help="Boot the full Unified Nexus OS Suite (Default behavior when no flag is passed)",
    )
    parser.add_argument(
        "--lite",
        action="store_true",
        help="Boot Lite Profile: IPC Server (:47630) + Dynamic Notch HUD without Electron workstation",
    )
    parser.add_argument(
        "--install-startup",
        action="store_true",
        help="Register NexusOS_Unified_Startup Windows Scheduled Task (silent boot on login)",
    )
    parser.add_argument(
        "--remove-startup",
        action="store_true",
        help="Unregister NexusOS_Unified_Startup Windows Scheduled Task",
    )
    parser.add_argument(
        "--notch",
        action="store_true",
        help="Launch the Nexus Notch HUD Surface (apps/notch_hud)",
    )
    parser.add_argument(
        "--command-center",
        action="store_true",
        help="Start Command Center Development Server (bun run dev in apps/command_center)",
    )
    parser.add_argument(
        "--slice-daemon",
        action="store_true",
        help="Execute the Infinity Bounded Slice Runtime Engine",
    )
    parser.add_argument(
        "--obscura-mcp",
        action="store_true",
        help="Run the Obscura Anti-Detect Browser FastMCP Server (core/mcp/obscura_mcp_server.py)",
    )
    parser.add_argument(
        "--sec-mcp",
        action="store_true",
        help="Run the SEC-01 Sentinel Security FastMCP Server (core/mcp/sec_mcp_server.py)",
    )
    parser.add_argument(
        "--windows-mcp",
        action="store_true",
        help="Run the Windows UIA Actuation & Screen FastMCP Server (core/mcp/windows_mcp_server.py)",
    )
    parser.add_argument(
        "--edge-bridge",
        action="store_true",
        help="Launch the Omnichannel Edge Mesh Bridge for Telegram/Discord (core/edge/omnichannel_bridge.py)",
    )
    parser.add_argument(
        "--voice-duplex",
        action="store_true",
        help="Run Full-Duplex Voice & Vision Loop daemon (apps/notch_hud/voice_pipeline.py)",
    )
    parser.add_argument(
        "--train-wakeword",
        action="store_true",
        help="Trigger Custom Wake-Word Synthetic Generation (scripts/train_wakeword.py)",
    )
    parser.add_argument(
        "--optimize-traces",
        action="store_true",
        help="Execute Weekly DSPy MIPROv2 Prompt Optimization (core/memory/dspy_optimizer.py)",
    )
    parser.add_argument(
        "--ipc-server",
        action="store_true",
        help="Start the Nexus IPC & REST server for Command Center & Notch HUD (:47630)",
    )
    parser.add_argument(
        "--gateway",
        action="store_true",
        help="Start the Nexus FastAPI Local Core Gateway (:47630)",
    )
    parser.add_argument(
        "--cron-scheduler",
        action="store_true",
        help="Run 24/7 Autonomous Cron Scheduler & Morning Briefing Daemon",
    )
    parser.add_argument(
        "--hotkey-daemon",
        action="store_true",
        help="Run Global Hold-to-Talk Hotkey Daemon (WH_KEYBOARD_LL: `, Ctrl+Space, Insert)",
    )
    parser.add_argument(
        "--test-all",
        action="store_true",
        help="Run System Verification Suite (pytest tests/)",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Default to unified boot when zero flags are given
    has_flags = any(getattr(args, k) for k in vars(args))
    if not has_flags or args.unified:
        sys.exit(boot_unified_nexus())

    exit_code = 0
    if args.lite:
        exit_code = boot_lite_nexus()
    elif args.install_startup:
        exit_code = install_startup_task()
    elif args.remove_startup:
        exit_code = remove_startup_task()
    elif args.notch:
        exit_code = launch_notch_hud()
    elif args.command_center:
        exit_code = launch_command_center()
    elif args.slice_daemon:
        exit_code = launch_slice_daemon()
    elif args.obscura_mcp:
        exit_code = launch_obscura_mcp()
    elif args.sec_mcp:
        exit_code = launch_sec_mcp()
    elif args.windows_mcp:
        exit_code = launch_windows_mcp()
    elif args.edge_bridge:
        exit_code = launch_edge_bridge()
    elif args.voice_duplex:
        exit_code = launch_voice_duplex()
    elif args.train_wakeword:
        exit_code = launch_train_wakeword()
    elif args.optimize_traces:
        exit_code = launch_optimize_traces()
    elif args.ipc_server or getattr(args, "gateway", False):
        exit_code = launch_ipc_server()
    elif args.cron_scheduler:
        exit_code = launch_cron_scheduler()
    elif getattr(args, "hotkey_daemon", False):
        exit_code = launch_hotkey_daemon()
    elif args.test_all:
        exit_code = run_test_suite()
    else:
        exit_code = boot_unified_nexus()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
