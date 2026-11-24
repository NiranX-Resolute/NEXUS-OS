"""Nexus OS v5.0 - Android ADB Device Control Plugin (adewaskar/jarvis Parity).

Enables voice and sub-agent control of connected Android devices over local USB or Tailscale ADB (100.x.y.z:5555).
Exposes android_status(), android_screenshot(), and android_tap(x, y).
Guarded by WorkspaceGovernor (SILENT mode blocks external hardware actuation) and ScopeGuard.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import shutil
import subprocess
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool

logger = logging.getLogger("nexus.mcp.plugins.android_adb")


def _find_adb_executable() -> str:
    """Finds the adb binary from PATH or standard Windows SDK install locations."""
    which_adb = shutil.which("adb")
    if which_adb:
        return which_adb

    candidates = [
        Path.home() / "AppData" / "Local" / "Android" / "Sdk" / "platform-tools" / "adb.exe",
        Path("C:/Android/platform-tools/adb.exe"),
        Path("C:/Program Files/Android/platform-tools/adb.exe"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)
    return "adb"


def _run_adb_cmd(args: List[str], timeout: float = 10.0, check_binary: bool = False) -> subprocess.CompletedProcess:
    """Executes an adb command with graceful error containment."""
    adb_path = _find_adb_executable()
    cmd = [adb_path] + args
    return subprocess.run(
        cmd,
        capture_output=True,
        text=not check_binary,
        timeout=timeout,
    )


@nexus_tool(
    name="android_status",
    description="Inspects connected Android devices over USB or Tailscale ADB, returning battery, model, and connectivity telemetry.",
    agent="SYS-01",
    requires_approval=False,
)
def android_status() -> Dict[str, Any]:
    """Probes ADB daemon for attached USB or remote Tailscale devices."""
    start_t = time.perf_counter()
    try:
        proc = _run_adb_cmd(["devices", "-l"], timeout=6.0)
        output = proc.stdout if isinstance(proc.stdout, str) else proc.stdout.decode("utf-8", errors="ignore")
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        return {
            "success": True,
            "connected": False,
            "devices": [],
            "message": f"ADB executable not available on PATH or SDK ({exc}). Connect phone via USB or Tailscale.",
            "latency_ms": round((time.perf_counter() - start_t) * 1000, 2),
        }

    lines = [line.strip() for line in output.splitlines() if line.strip()]
    devices: List[Dict[str, str]] = []

    for line in lines[1:]:  # Skip "List of devices attached"
        parts = line.split()
        if len(parts) >= 2:
            dev_id = parts[0]
            dev_state = parts[1]
            extra_info = " ".join(parts[2:]) if len(parts) > 2 else ""
            devices.append({
                "id": dev_id,
                "state": dev_state,
                "details": extra_info,
                "transport": "tailscale" if ":" in dev_id or dev_id.startswith("100.") else "usb",
            })

    connected = len(devices) > 0 and any(d["state"] == "device" for d in devices)
    model_name = ""
    battery_level = ""

    if connected:
        try:
            p_model = _run_adb_cmd(["shell", "getprop", "ro.product.model"], timeout=3.0)
            model_name = p_model.stdout.strip() if p_model.returncode == 0 else ""
        except Exception:
            pass

        try:
            p_batt = _run_adb_cmd(["shell", "dumpsys", "battery"], timeout=3.0)
            if p_batt.returncode == 0:
                for b_line in p_batt.stdout.splitlines():
                    if "level:" in b_line:
                        battery_level = b_line.split(":", 1)[1].strip() + "%"
                        break
        except Exception:
            pass

    msg = (
        f"Connected to Android device '{model_name or devices[0]['id']}' (Battery: {battery_level or 'OK'})"
        if connected
        else "No Android device currently attached via USB or Tailscale (100.x.y.z:5555)."
    )

    return {
        "success": True,
        "connected": connected,
        "model": model_name,
        "battery": battery_level,
        "devices": devices,
        "message": msg,
        "latency_ms": round((time.perf_counter() - start_t) * 1000, 2),
    }


@nexus_tool(
    name="android_screenshot",
    description="Captures a lossless PNG screenshot from connected Android phone screen over ADB.",
    agent="SYS-01",
    requires_approval=False,
)
def android_screenshot(save_path: str = "") -> Dict[str, Any]:
    """Captures and stores active screen frame from connected Android device."""
    st = android_status()
    if not st.get("connected"):
        return {
            "success": False,
            "error": "No Android device attached to capture screenshot. Attach via USB or connect over Tailscale.",
            "status": st,
        }

    out_path = Path(save_path) if save_path else (
        Path.home() / ".nexus-agent" / "screenshots" / f"android_screen_{int(time.time() * 1000)}.png"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        proc = _run_adb_cmd(["exec-out", "screencap", "-p"], timeout=10.0, check_binary=True)
        raw_bytes = proc.stdout if isinstance(proc.stdout, bytes) else bytes(proc.stdout)
        if len(raw_bytes) < 100:
            return {
                "success": False,
                "error": f"Screencap returned empty or invalid data ({len(raw_bytes)} bytes)",
            }

        out_path.write_bytes(raw_bytes)
        return {
            "success": True,
            "saved_path": str(out_path),
            "size_bytes": len(raw_bytes),
            "message": f"Android screenshot captured successfully to {out_path.name}",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Failed capturing Android screenshot: {exc}",
        }


@nexus_tool(
    name="android_tap",
    description="Dispatches a precision touch tap (x, y) event to the connected Android device screen.",
    agent="SYS-01",
    requires_approval=False,
)
def android_tap(x: int, y: int) -> Dict[str, Any]:
    """Dispatches input tap event via adb shell input tap."""
    st = android_status()
    if not st.get("connected"):
        return {
            "success": False,
            "error": f"Cannot tap ({x}, {y}): No Android device attached.",
            "status": st,
        }

    try:
        proc = _run_adb_cmd(["shell", "input", "tap", str(int(x)), str(int(y))], timeout=5.0)
        if proc.returncode != 0:
            return {
                "success": False,
                "error": f"ADB input tap returned non-zero code ({proc.returncode}): {proc.stderr}",
            }
        return {
            "success": True,
            "action": "tap",
            "x": int(x),
            "y": int(y),
            "message": f"Tapped coordinate ({x}, {y}) on Android display.",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"ADB input tap failed: {exc}",
        }


@nexus_tool(
    name="android_adb_control",
    description="Unified Android ADB device controller for status telemetry, screenshots, and precision touchscreen taps over USB or Tailscale ADB.",
    agent="SYS-01",
    requires_approval=False,
)
def android_adb_control(
    action: str = "status",
    x: Optional[int] = None,
    y: Optional[int] = None,
    save_path: str = "",
) -> Dict[str, Any]:
    """Unified master tool for Android device status, screenshot capture, and touch events."""
    if action == "status":
        return android_status()
    elif action == "screenshot":
        return android_screenshot(save_path=save_path)
    elif action == "tap":
        if x is None or y is None:
            return {"success": False, "error": "Coordinates 'x' and 'y' are required for action='tap'"}
        return android_tap(x=x, y=y)
    else:
        return {"success": False, "error": f"Unknown action '{action}'. Valid actions: status, screenshot, tap"}

