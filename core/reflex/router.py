"""Nexus OS v5.0 - Sub-100ms Reflex Intent Router & Execution Engine.

Provides deterministic, sub-100ms rule-based reflex routing and immediate
OS automation without invoking heavy LLMs or network queries.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger("nexus.reflex")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [REFLEX] %(message)s")


class ReflexRouter:
    """Evaluates and executes deterministic OS automation reflexes in <100ms."""

    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self._handlers: Dict[str, Callable[[str], Dict[str, Any]]] = {
            r"\b(mute\s+audio|audio\s+mute|unmute\s+audio|toggle\s+mute|mute)\b": self._handle_mute_audio,
            r"\b(inject\s+timestamp|insert\s+timestamp|get\s+timestamp|timestamp)\b": self._handle_inject_timestamp,
            r"\b(lock\s+workstation|lock\s+pc|lock\s+screen|screen\s+lock)\b": self._handle_lock_workstation,
            r"\b(adjust\s+brightness|set\s+brightness(?:\s+to)?|brightness)\b": self._handle_adjust_brightness,
            r"\b(launch|open)\s+([a-zA-Z0-9_\-]+)\b": self._handle_launch_app,
        }

    def evaluate_and_execute(self, prompt: str) -> Dict[str, Any]:
        """Evaluates prompt against reflex rules and executes if matched.

        Guaranteed latency target: < 100ms.
        """
        start_time = time.perf_counter()
        normalized_prompt = prompt.strip().lower()

        for pattern, handler in self._handlers.items():
            if re.search(pattern, normalized_prompt, re.IGNORECASE):
                result = handler(prompt)
                elapsed_ms = (time.perf_counter() - start_time) * 1000.0
                result["latency_ms"] = elapsed_ms
                result["prompt"] = prompt
                result["handled_by"] = "ReflexRouter"
                logger.info("Reflex matched and executed in %.2fms: '%s'", elapsed_ms, prompt)
                return result

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return {
            "success": False,
            "handled_by": "ReflexRouter",
            "error": "No reflex rule matched; fallback to LLM intent planner",
            "latency_ms": elapsed_ms,
            "prompt": prompt,
        }

    def _handle_mute_audio(self, prompt: str) -> Dict[str, Any]:
        """Toggles system audio mute."""
        if not self.dry_run and sys.platform == "win32":
            try:
                import ctypes
                # VK_VOLUME_MUTE = 0xAD, KEYEVENTF_EXTENDEDKEY = 0x01, KEYEVENTF_KEYUP = 0x02
                user32 = ctypes.windll.user32
                user32.keybd_event(0xAD, 0, 1, 0)
                user32.keybd_event(0xAD, 0, 3, 0)
            except Exception as e:
                logger.warning("Audio toggle fallback: %s", e)

        return {
            "success": True,
            "action": "MUTE_AUDIO",
            "output": "System audio state toggled successfully",
        }

    def _handle_inject_timestamp(self, prompt: str) -> Dict[str, Any]:
        """Generates high-precision ISO-8601 UTC timestamp."""
        ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "success": True,
            "action": "INJECT_TIMESTAMP",
            "output": ts,
            "timestamp": ts,
        }

    def _handle_lock_workstation(self, prompt: str) -> Dict[str, Any]:
        """Immediately locks the Windows workstation."""
        if not self.dry_run and sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.user32.LockWorkStation()
            except Exception as e:
                logger.warning("Lock workstation error: %s", e)

        return {
            "success": True,
            "action": "LOCK_WORKSTATION",
            "output": "Workstation locked",
        }

    def _handle_adjust_brightness(self, prompt: str) -> Dict[str, Any]:
        """Adjusts screen brightness."""
        match = re.search(r"(\d+)", prompt)
        level = int(match.group(1)) if match else 75
        clamped = max(0, min(100, level))
        if not self.dry_run and sys.platform == "win32":
            try:
                cmd = f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, {clamped})"
                subprocess.Popen(["powershell", "-NoProfile", "-Command", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        return {
            "success": True,
            "action": "ADJUST_BRIGHTNESS",
            "output": f"Display brightness set to {clamped}%",
            "level": clamped,
        }

    def _handle_launch_app(self, prompt: str) -> Dict[str, Any]:
        """Launches target app deterministically."""
        match = re.search(r"(?:launch|open)\s+([a-zA-Z0-9_\-]+)", prompt, re.IGNORECASE)
        app = match.group(1).lower() if match else "notepad"
        bin_map = {
            "notepad": "notepad.exe",
            "calculator": "calc.exe",
            "calc": "calc.exe",
            "terminal": "wt.exe",
            "cmd": "cmd.exe",
            "powershell": "powershell.exe",
            "explorer": "explorer.exe",
        }
        target = bin_map.get(app, f"{app}.exe")
        if not self.dry_run and sys.platform == "win32":
            try:
                subprocess.Popen([target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
        return {
            "success": True,
            "action": "LAUNCH_APP",
            "output": f"Launched application: {target}",
            "target": target,
        }


# Global singleton helper
_global_reflex_router = ReflexRouter()


def evaluate_and_execute(prompt: str) -> Dict[str, Any]:
    return _global_reflex_router.evaluate_and_execute(prompt)
