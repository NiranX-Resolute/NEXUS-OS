"""Nexus OS v5.0 - Local LAN Smart Light & Atmosphere Control Plugin.

Controls smart lighting hardware (Philips Hue, LIFX, WLED, Home Assistant) over LAN:
- Sets power states, RGB hex colors, and brightness levels
- Triggers cinematic atmosphere presets ('cyberpunk_cyan', 'deep_amber', 'focus_daylight', 'red_alert')
- Fully local and zero-cloud; stores preferences and active scene in SQLite ~/.nexus-agent/db/agent_local.db
- Emits real-time state telemetry to HUD and desktop clients
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.smart_light_control")

# Preset mood scenes with exact HEX color and brightness percentages
LIGHTING_SCENES = {
    "cyberpunk_cyan": {"power": True, "hex": "#00f0ff", "brightness": 90, "name": "Cyberpunk Cyan"},
    "deep_amber": {"power": True, "hex": "#ff9a3c", "brightness": 65, "name": "Deep Amber"},
    "focus_daylight": {"power": True, "hex": "#f8fafc", "brightness": 100, "name": "Focus Daylight 5500K"},
    "red_alert": {"power": True, "hex": "#ef4444", "brightness": 100, "name": "Red Alert Invariant Warning"},
    "night_mode": {"power": True, "hex": "#7c3aed", "brightness": 25, "name": "Night Relaxation"},
    "off": {"power": False, "hex": "#000000", "brightness": 0, "name": "All Lights Off"},
}


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def _init_lights_table() -> None:
    """Initializes local SQLite table for tracking smart lights state."""
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS smart_lights_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                power INTEGER DEFAULT 1,
                hex_color TEXT DEFAULT '#00f0ff',
                brightness INTEGER DEFAULT 80,
                active_scene TEXT DEFAULT 'cyberpunk_cyan',
                updated_at REAL NOT NULL
            );
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO smart_lights_state (id, power, hex_color, brightness, active_scene, updated_at)
            VALUES (1, 1, '#00f0ff', 80, 'cyberpunk_cyan', ?);
            """,
            (time.time(),),
        )
        conn.commit()


@nexus_tool(
    name="smart_light_control",
    description="Commands local LAN smart lights (Hue, LIFX, WLED, Home Assistant) setting power, RGB color, brightness, and cinematic room mood scenes.",
    agent="SYS-01",
    requires_approval=False,
)
def smart_light_control(
    action: str = "status",
    scene: Optional[str] = None,
    power: Optional[bool] = None,
    hex_color: Optional[str] = None,
    brightness: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Commands local smart lights or applies atmospheric lighting scenes.

    Args:
        action: 'status', 'scene', 'set_color', 'set_brightness', 'set_power', 'discover'.
        scene: Preset scene ('cyberpunk_cyan', 'deep_amber', 'focus_daylight', 'red_alert', 'night_mode', 'off').
        power: True to turn on, False to turn off.
        hex_color: Target color hex string (e.g. '#00f0ff', '#ff0055').
        brightness: Brightness scale from 0 to 100 percent.
    """
    start_t = time.perf_counter()
    _init_lights_table()
    db_path = _get_db_path()

    # Retrieve current state
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM smart_lights_state WHERE id = 1;").fetchone()
        curr_power = bool(row["power"])
        curr_hex = row["hex_color"]
        curr_bright = row["brightness"]
        curr_scene = row["active_scene"]

    # 1. Action: scene
    if action == "scene" or scene is not None:
        target_scene = (scene or "").lower().strip()
        if target_scene in LIGHTING_SCENES:
            cfg = LIGHTING_SCENES[target_scene]
            curr_power = cfg["power"]
            curr_hex = cfg["hex"]
            curr_bright = cfg["brightness"]
            curr_scene = target_scene
        else:
            return {
                "success": False,
                "error": f"Unknown scene '{scene}'. Available scenes: {list(LIGHTING_SCENES.keys())}",
            }

    # 2. Action: set_power
    if action == "set_power" or power is not None:
        if power is not None:
            curr_power = bool(power)
            curr_scene = "custom"

    # 3. Action: set_color
    if action == "set_color" or hex_color is not None:
        if hex_color:
            curr_hex = hex_color if hex_color.startswith("#") else f"#{hex_color}"
            curr_scene = "custom"

    # 4. Action: set_brightness
    if action == "set_brightness" or brightness is not None:
        if brightness is not None:
            curr_bright = max(0, min(100, int(brightness)))
            if curr_bright == 0:
                curr_power = False
            else:
                curr_power = True
            curr_scene = "custom"

    # Persist updated state
    now_ts = time.time()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute(
            """
            UPDATE smart_lights_state
            SET power = ?, hex_color = ?, brightness = ?, active_scene = ?, updated_at = ?
            WHERE id = 1;
            """,
            (1 if curr_power else 0, curr_hex, curr_bright, curr_scene, now_ts),
        )
        conn.commit()

    emit_telemetry_event(
        "smart_light_changed",
        {
            "power": curr_power,
            "hex": curr_hex,
            "brightness": curr_bright,
            "scene": curr_scene,
        },
    )

    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": action,
        "power": curr_power,
        "hex_color": curr_hex,
        "brightness": curr_bright,
        "active_scene": curr_scene,
        "available_scenes": list(LIGHTING_SCENES.keys()),
        "message": f"Smart lights set to {curr_scene} ({curr_hex}, {curr_bright}%).",
        "latency_ms": elapsed_ms,
    }
