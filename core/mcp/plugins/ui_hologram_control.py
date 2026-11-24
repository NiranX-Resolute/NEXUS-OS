"""Nexus OS v5.0 - Holographic 3D Reactor & HUD Control Plugin (adewaskar/jarvis Parity).

Controls and mutates the 3D Dyson Reactor geometry, color, spin speed, particle intensity,
transient shader/visual effects (pulse, scan, glitch, shockwave), orbiting media cards,
and focus HUD chrome rails live via voice and sub-agent commands.
Persists all visual state into SQLite WAL table ui_preferences in ~/.nexus-agent/db/agent_local.db.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Literal, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.ui_hologram_control")


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def init_ui_preferences_table() -> None:
    """Ensures ui_preferences table exists with sensible defaults."""
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ui_preferences (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                reactor_color TEXT DEFAULT '#38bdf8',
                reactor_shape TEXT DEFAULT 'dyson',
                spin_speed REAL DEFAULT 1.0,
                intensity REAL DEFAULT 1.0,
                active_effect TEXT DEFAULT 'none',
                orbit_cards_json TEXT DEFAULT '[]',
                show_rails INTEGER DEFAULT 1,
                show_transcript INTEGER DEFAULT 1,
                updated_at REAL NOT NULL
            );
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO ui_preferences (
                id, reactor_color, reactor_shape, spin_speed, intensity, active_effect, orbit_cards_json, show_rails, show_transcript, updated_at
            ) VALUES (1, '#38bdf8', 'dyson', 1.0, 1.0, 'none', '[]', 1, 1, ?);
            """,
            (time.time(),),
        )
        conn.commit()


def get_ui_state() -> Dict[str, Any]:
    """Retrieves the current 3D reactor and HUD visual state."""
    init_ui_preferences_table()
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM ui_preferences WHERE id = 1 LIMIT 1;").fetchone()
        if not row:
            return {
                "reactor_color": "#38bdf8",
                "primary_color": "#38bdf8",
                "reactor_shape": "dyson",
                "shape": "dyson",
                "spin_speed": 1.0,
                "intensity": 1.0,
                "active_effect": "none",
                "orbit_cards": [],
                "show_rails": True,
                "show_transcript": True,
                "updated_at": time.time(),
            }
        data = dict(row)
        orbit_cards = []
        try:
            orbit_cards = json.loads(data.get("orbit_cards_json") or "[]")
        except Exception:
            pass
        shape = data.get("reactor_shape", "dyson")
        color = data.get("reactor_color", "#38bdf8")
        return {
            "reactor_color": color,
            "primary_color": color,
            "reactor_shape": shape,
            "shape": shape,
            "spin_speed": float(data.get("spin_speed", 1.0)),
            "intensity": float(data.get("intensity", 1.0)),
            "active_effect": data.get("active_effect", "none"),
            "orbit_cards": orbit_cards,
            "show_rails": bool(data.get("show_rails", 1)),
            "show_transcript": bool(data.get("show_transcript", 1)),
            "updated_at": float(data.get("updated_at", time.time())),
        }


def mutate_ui_state(**kwargs: Any) -> Dict[str, Any]:
    """Updates one or more visual state fields in SQLite WAL and emits telemetry event."""
    init_ui_preferences_table()
    current = get_ui_state()
    now_ts = time.time()

    if "reactor_color" in kwargs and kwargs["reactor_color"]:
        current["reactor_color"] = str(kwargs["reactor_color"]).strip()
    if "primary_color" in kwargs and kwargs["primary_color"]:
        current["reactor_color"] = str(kwargs["primary_color"]).strip()
    if "color" in kwargs and kwargs["color"]:
        current["reactor_color"] = str(kwargs["color"]).strip()

    if "reactor_shape" in kwargs and kwargs["reactor_shape"]:
        shape = str(kwargs["reactor_shape"]).lower().strip()
        if shape in ("dyson", "ring", "sphere", "wire"):
            current["reactor_shape"] = shape
    if "shape" in kwargs and kwargs["shape"]:
        shape = str(kwargs["shape"]).lower().strip()
        if shape in ("dyson", "ring", "sphere", "wire"):
            current["reactor_shape"] = shape

    if "spin_speed" in kwargs and kwargs["spin_speed"] is not None:
        try:
            current["spin_speed"] = max(0.1, min(10.0, float(kwargs["spin_speed"])))
        except (ValueError, TypeError):
            pass

    if "intensity" in kwargs and kwargs["intensity"] is not None:
        try:
            current["intensity"] = max(0.1, min(5.0, float(kwargs["intensity"])))
        except (ValueError, TypeError):
            pass

    if "active_effect" in kwargs and kwargs["active_effect"]:
        eff = str(kwargs["active_effect"]).lower().strip()
        if eff in ("pulse", "scan", "glitch", "shockwave", "none"):
            current["active_effect"] = eff
    if "effect" in kwargs and kwargs["effect"]:
        eff = str(kwargs["effect"]).lower().strip()
        if eff in ("pulse", "scan", "glitch", "shockwave", "none"):
            current["active_effect"] = eff

    if "orbit_cards" in kwargs and isinstance(kwargs["orbit_cards"], list):
        current["orbit_cards"] = kwargs["orbit_cards"]

    if "show_rails" in kwargs and kwargs["show_rails"] is not None:
        current["show_rails"] = bool(kwargs["show_rails"])

    if "show_transcript" in kwargs and kwargs["show_transcript"] is not None:
        current["show_transcript"] = bool(kwargs["show_transcript"])

    orbit_json = json.dumps(current["orbit_cards"])
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute(
            """
            UPDATE ui_preferences
            SET reactor_color = ?,
                reactor_shape = ?,
                spin_speed = ?,
                intensity = ?,
                active_effect = ?,
                orbit_cards_json = ?,
                show_rails = ?,
                show_transcript = ?,
                updated_at = ?
            WHERE id = 1;
            """,
            (
                current["reactor_color"],
                current["reactor_shape"],
                current["spin_speed"],
                current["intensity"],
                current["active_effect"],
                orbit_json,
                1 if current["show_rails"] else 0,
                1 if current["show_transcript"] else 0,
                now_ts,
            ),
        )
        conn.commit()

    emit_telemetry_event(
        "ui_mutation",
        {
            "reactor_color": current["reactor_color"],
            "reactor_shape": current["reactor_shape"],
            "active_effect": current["active_effect"],
            "spin_speed": current["spin_speed"],
            "orbit_count": len(current["orbit_cards"]),
            "timestamp": now_ts,
        },
    )

    current["updated_at"] = now_ts
    current["shape"] = current["reactor_shape"]
    current["primary_color"] = current["reactor_color"]
    return {"success": True, "ui_state": current, "state": current}


@nexus_tool(
    name="ui_reactor",
    description="Mutates 3D Quantum Dyson Core shape (dyson, ring, sphere, wire), hex color, spin speed, and particle intensity.",
    agent="SYS-01",
    requires_approval=False,
)
def ui_reactor(
    color: Optional[str] = None,
    shape: Optional[Literal["dyson", "ring", "sphere", "wire"]] = None,
    spin_speed: Optional[float] = None,
    intensity: Optional[float] = None,
) -> Dict[str, Any]:
    """Mutates 3D reactor geometry, color, and dynamic rotation parameters."""
    res = mutate_ui_state(
        color=color,
        shape=shape,
        spin_speed=spin_speed,
        intensity=intensity,
    )
    return {
        "success": True,
        "message": f"Reactor mutated: shape={res['ui_state']['reactor_shape']}, color={res['ui_state']['reactor_color']}",
        "ui_state": res["ui_state"],
        "state": res["ui_state"],
    }


@nexus_tool(
    name="ui_effect",
    description="Triggers transient visual shader or burst effects (pulse, scan, glitch, shockwave) on the 3D core.",
    agent="SYS-01",
    requires_approval=False,
)
def ui_effect(effect: Literal["pulse", "scan", "glitch", "shockwave"] = "pulse") -> Dict[str, Any]:
    """Triggers an instantaneous visual pulse, scan line, glitch, or shockwave wave."""
    res = mutate_ui_state(effect=effect)
    return {
        "success": True,
        "effect": effect,
        "message": f"Triggered visual effect: {effect}",
        "ui_state": res["ui_state"],
    }


@nexus_tool(
    name="ui_orbit",
    description="Places an image, screenshot, or media card in holographic orbit around the 3D Dyson Core.",
    agent="SYS-01",
    requires_approval=False,
)
def ui_orbit(media_url_or_path: str, label: str = "") -> Dict[str, Any]:
    """Adds a floating media card orbiting the 3D Dyson sphere."""
    if not media_url_or_path:
        return {"success": False, "error": "media_url_or_path is required"}

    state = get_ui_state()
    orbit_cards: List[Dict[str, Any]] = state.get("orbit_cards", [])

    card_id = f"card_{int(time.time() * 1000)}"
    new_card = {
        "id": card_id,
        "media": media_url_or_path,
        "label": label or Path(media_url_or_path).name,
        "added_at": time.time(),
        "radius": 2.5 + (len(orbit_cards) % 3) * 0.4,
    }
    # Keep up to 6 orbiting cards
    updated_cards = [new_card] + orbit_cards[:5]
    res = mutate_ui_state(orbit_cards=updated_cards)

    return {
        "success": True,
        "card": new_card,
        "total_in_orbit": len(updated_cards),
        "message": f"Placed '{new_card['label']}' in holographic core orbit.",
    }


@nexus_tool(
    name="ui_chrome",
    description="Toggles HUD chrome elements (side rails, transcript drawer) for focused or expanded workstation mode.",
    agent="SYS-01",
    requires_approval=False,
)
def ui_chrome(
    show_rails: Optional[bool] = None,
    show_transcript: Optional[bool] = None,
) -> Dict[str, Any]:
    """Toggles workstation chrome elements for focus mode."""
    res = mutate_ui_state(
        show_rails=show_rails,
        show_transcript=show_transcript,
    )
    return {
        "success": True,
        "show_rails": res["ui_state"]["show_rails"],
        "show_transcript": res["ui_state"]["show_transcript"],
        "message": "HUD chrome layout updated.",
    }


@nexus_tool(
    name="ui_hologram_control",
    description="Unified controller for 3D Quantum Dyson Core shape, color, spin speed, particle effects, and orbiting HUD cards.",
    agent="SYS-01",
    requires_approval=False,
)
def ui_hologram_control(
    action: str = "status",
    color: Optional[str] = None,
    shape: Optional[Literal["dyson", "ring", "sphere", "wire"]] = None,
    spin_speed: Optional[float] = None,
    intensity: Optional[float] = None,
    effect: Optional[Literal["pulse", "scan", "glitch", "shockwave", "none"]] = None,
    orbit_media: Optional[str] = None,
    orbit_label: str = "",
    show_rails: Optional[bool] = None,
    show_transcript: Optional[bool] = None,
) -> Dict[str, Any]:
    """Unified master tool for controlling all 3D holographic Dyson Core and HUD layout parameters."""
    if action == "status":
        st = get_ui_state()
        return {"success": True, "action": "status", "ui_state": st}

    if orbit_media:
        return ui_orbit(media_url_or_path=orbit_media, label=orbit_label)

    if effect and effect != "none":
        return ui_effect(effect=effect)  # type: ignore

    res = mutate_ui_state(
        color=color,
        shape=shape,
        spin_speed=spin_speed,
        intensity=intensity,
        effect=effect,
        show_rails=show_rails,
        show_transcript=show_transcript,
    )
    return {
        "success": True,
        "action": action,
        "ui_state": res["ui_state"],
        "message": f"Hologram Core updated: shape={res['ui_state']['reactor_shape']}, color={res['ui_state']['reactor_color']}",
    }

