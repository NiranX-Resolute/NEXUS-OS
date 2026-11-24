"""Nexus OS v5.0 - Live Whiteboard Bridge Plugin.
=============================================================================
Provides structured drawing primitives for dynamic system diagrams, state machines,
and mathematical equations. Broadcasts all canvas operations in real-time to
IPC / WebSocket channel 'nexus:whiteboard-ops' and persists elements into SQLite WAL.
Supports high-resolution PNG rendering and canvas export via Pillow.
=============================================================================
"""

from __future__ import annotations

import json
import logging
import math
import os
from pathlib import Path
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.whiteboard_bridge")

# Canvas Color Palette (Slate Dark Theme)
BG_COLOR = (24, 24, 37)         # #181825
TEXT_COLOR = (205, 214, 244)     # #cdd6f4
GRID_COLOR = (49, 50, 68)        # #313244
BORDER_COLOR = (88, 91, 112)     # #585b70
ARROW_COLOR = (137, 180, 250)    # #89b4fa
EQUATION_BG = (49, 50, 68)       # #313244
EQUATION_BORDER = (245, 194, 231)# #f5c2e7

NODE_COLORS: Dict[str, Tuple[Tuple[int, int, int], Tuple[int, int, int]]] = {
    "default": ((49, 50, 68), (137, 180, 250)),       # bg, border (sapphire)
    "action": ((69, 71, 90), (250, 179, 135)),        # peach
    "state": ((49, 50, 68), (166, 227, 161)),         # green
    "decision": ((69, 71, 90), (203, 166, 247)),      # mauve
    "error": ((69, 71, 90), (243, 139, 168)),         # red
    "database": ((49, 50, 68), (148, 226, 213)),      # teal
    "service": ((49, 50, 68), (249, 226, 175)),       # yellow
}


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


class WhiteboardBridge:
    """
    In-memory and SQLite-backed Whiteboard state coordinator.
    Dispatches drawing primitives to 'nexus:whiteboard-ops' telemetry channel
    and renders diagrams to PNG files.
    """

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or _get_db_path()
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self.arrows: List[Dict[str, Any]] = []
        self.texts: List[Dict[str, Any]] = []
        self.equations: List[Dict[str, Any]] = []
        self._init_db()

    def _init_db(self) -> None:
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS whiteboard_elements (
                        id TEXT PRIMARY KEY,
                        element_type TEXT NOT NULL,
                        x INTEGER NOT NULL,
                        y INTEGER NOT NULL,
                        width INTEGER NOT NULL,
                        height INTEGER NOT NULL,
                        label TEXT,
                        payload_json TEXT NOT NULL,
                        created_at REAL NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS whiteboard_operations (
                        op_id TEXT PRIMARY KEY,
                        op_type TEXT NOT NULL,
                        payload_json TEXT NOT NULL,
                        created_at REAL NOT NULL
                    );
                    """
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Failed to init whiteboard tables: %s", exc)

    def _broadcast_op(self, op_type: str, payload: Dict[str, Any]) -> None:
        """Broadcasts whiteboard operation to IPC / websocket channel and SQLite WAL."""
        now = time.time()
        op_id = f"wop_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
        event_data = {
            "op_id": op_id,
            "op": op_type,
            "payload": payload,
            "timestamp": now,
        }

        # 1. Telemetry broadcast
        try:
            emit_telemetry_event("nexus:whiteboard-ops", event_data)
        except Exception as exc:
            logger.debug("Telemetry broadcast skipped: %s", exc)

        # 2. SQLite WAL persistence
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute(
                    "INSERT INTO whiteboard_operations (op_id, op_type, payload_json, created_at) VALUES (?, ?, ?, ?);",
                    (op_id, op_type, json.dumps(payload), now),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Operation persistence skipped: %s", exc)

    def draw_node(
        self,
        id: str,
        x: int,
        y: int,
        label: str,
        node_type: str = "default",
        width: int = 160,
        height: int = 60,
    ) -> Dict[str, Any]:
        """Creates or updates a structured node on the whiteboard."""
        node_id = str(id).strip()
        data = {
            "id": node_id,
            "element_type": "node",
            "x": int(x),
            "y": int(y),
            "width": int(width),
            "height": int(height),
            "label": str(label),
            "node_type": str(node_type).lower(),
            "center": [int(x + width // 2), int(y + height // 2)],
        }
        self.nodes[node_id] = data

        now = time.time()
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute(
                    """
                    INSERT INTO whiteboard_elements (id, element_type, x, y, width, height, label, payload_json, created_at)
                    VALUES (?, 'node', ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        x = excluded.x,
                        y = excluded.y,
                        width = excluded.width,
                        height = excluded.height,
                        label = excluded.label,
                        payload_json = excluded.payload_json,
                        created_at = excluded.created_at;
                    """,
                    (node_id, data["x"], data["y"], data["width"], data["height"], data["label"], json.dumps(data), now),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Node persistence error: %s", exc)

        self._broadcast_op("draw_node", data)
        return {"success": True, "action": "draw_node", "node": data}

    def draw_arrow(self, from_id: str, to_id: str, label: str = "") -> Dict[str, Any]:
        """Connects two nodes with a directed labeled arrow."""
        arrow_id = f"arrow_{from_id}_{to_id}_{uuid.uuid4().hex[:4]}"
        data = {
            "id": arrow_id,
            "element_type": "arrow",
            "from_id": str(from_id),
            "to_id": str(to_id),
            "label": str(label),
        }
        self.arrows.append(data)

        now = time.time()
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute(
                    """
                    INSERT INTO whiteboard_elements (id, element_type, x, y, width, height, label, payload_json, created_at)
                    VALUES (?, 'arrow', 0, 0, 0, 0, ?, ?, ?);
                    """,
                    (arrow_id, str(label), json.dumps(data), now),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Arrow persistence error: %s", exc)

        self._broadcast_op("draw_arrow", data)
        return {"success": True, "action": "draw_arrow", "arrow": data}

    def draw_text(self, x: int, y: int, content: str, font_size: int = 14) -> Dict[str, Any]:
        """Draws freeform formatted text on the whiteboard at (x, y)."""
        text_id = f"txt_{int(time.time() * 1000)}_{uuid.uuid4().hex[:4]}"
        data = {
            "id": text_id,
            "element_type": "text",
            "x": int(x),
            "y": int(y),
            "content": str(content),
            "font_size": int(font_size),
        }
        self.texts.append(data)

        now = time.time()
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute(
                    """
                    INSERT INTO whiteboard_elements (id, element_type, x, y, width, height, label, payload_json, created_at)
                    VALUES (?, 'text', ?, ?, 0, 0, ?, ?, ?);
                    """,
                    (text_id, int(x), int(y), str(content), json.dumps(data), now),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Text persistence error: %s", exc)

        self._broadcast_op("draw_text", data)
        return {"success": True, "action": "draw_text", "text": data}

    def draw_equation(self, x: int, y: int, latex: str) -> Dict[str, Any]:
        """Draws a mathematical LaTeX equation badge on the whiteboard at (x, y)."""
        eq_id = f"eq_{int(time.time() * 1000)}_{uuid.uuid4().hex[:4]}"
        data = {
            "id": eq_id,
            "element_type": "equation",
            "x": int(x),
            "y": int(y),
            "latex": str(latex),
        }
        self.equations.append(data)

        now = time.time()
        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute(
                    """
                    INSERT INTO whiteboard_elements (id, element_type, x, y, width, height, label, payload_json, created_at)
                    VALUES (?, 'equation', ?, ?, 0, 0, ?, ?, ?);
                    """,
                    (eq_id, int(x), int(y), str(latex), json.dumps(data), now),
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Equation persistence error: %s", exc)

        self._broadcast_op("draw_equation", data)
        return {"success": True, "action": "draw_equation", "equation": data}

    def clear_whiteboard(self) -> Dict[str, Any]:
        """Clears all whiteboard elements and broadcasts clear operation."""
        self.nodes.clear()
        self.arrows.clear()
        self.texts.clear()
        self.equations.clear()

        try:
            with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                conn.execute("DELETE FROM whiteboard_elements;")
                conn.commit()
        except Exception as exc:
            logger.debug("Clear whiteboard DB error: %s", exc)

        self._broadcast_op("clear_whiteboard", {"cleared": True})
        return {"success": True, "action": "clear_whiteboard"}

    def get_state(self) -> Dict[str, Any]:
        """Returns the current canvas element hierarchy."""
        return {
            "nodes": list(self.nodes.values()),
            "arrows": list(self.arrows),
            "texts": list(self.texts),
            "equations": list(self.equations),
            "total_elements": len(self.nodes) + len(self.arrows) + len(self.texts) + len(self.equations),
        }

    def export_whiteboard_png(
        self,
        file_path: Union[str, Path],
        width: int = 1280,
        height: int = 720,
    ) -> Dict[str, Any]:
        """
        Renders the active whiteboard elements onto a raster PNG image canvas.
        Draws nodes, arrows with arrowheads, freeform text, and equation badges.
        """
        out_path = Path(file_path).expanduser().resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)

        if not HAS_PILLOW:
            # Fallback pure-python minimal PNG generator if pillow is somehow absent
            return {
                "success": False,
                "error": "Pillow is required for PNG rendering",
                "file_path": str(out_path),
            }

        img = Image.new("RGB", (width, height), BG_COLOR)
        draw = ImageDraw.Draw(img)

        # Draw subtle grid dots
        for gx in range(0, width, 40):
            for gy in range(0, height, 40):
                draw.point((gx, gy), fill=GRID_COLOR)

        # 1. Draw Arrows (connecting from_node center to to_node center)
        for arrow in self.arrows:
            from_node = self.nodes.get(arrow["from_id"])
            to_node = self.nodes.get(arrow["to_id"])
            if from_node and to_node:
                x1, y1 = from_node["center"]
                x2, y2 = to_node["center"]
                draw.line([(x1, y1), (x2, y2)], fill=ARROW_COLOR, width=2)

                # Draw arrowhead
                angle = math.atan2(y2 - y1, x2 - x1)
                arrow_len = 12
                p1 = (x2 - arrow_len * math.cos(angle - math.pi / 6), y2 - arrow_len * math.sin(angle - math.pi / 6))
                p2 = (x2 - arrow_len * math.cos(angle + math.pi / 6), y2 - arrow_len * math.sin(angle + math.pi / 6))
                draw.polygon([(x2, y2), p1, p2], fill=ARROW_COLOR)

                # Label at midpoint
                if arrow.get("label"):
                    mx = (x1 + x2) // 2
                    my = (y1 + y2) // 2 - 12
                    draw.text((mx, my), arrow["label"], fill=TEXT_COLOR)

        # 2. Draw Nodes
        for node in self.nodes.values():
            nx = node["x"]
            ny = node["y"]
            nw = node["width"]
            nh = node["height"]
            ntype = node.get("node_type", "default")
            fill_color, border_color = NODE_COLORS.get(ntype, NODE_COLORS["default"])

            # Rounded rectangle
            draw.rounded_rectangle([(nx, ny), (nx + nw, ny + nh)], radius=8, fill=fill_color, outline=border_color, width=2)

            # Node label
            lbl = node["label"]
            draw.text((nx + 14, ny + nh // 2 - 8), lbl, fill=TEXT_COLOR)

        # 3. Draw Texts
        for t in self.texts:
            tx = t["x"]
            ty = t["y"]
            content = t["content"]
            draw.text((tx, ty), content, fill=TEXT_COLOR)

        # 4. Draw Equations
        for eq in self.equations:
            ex = eq["x"]
            ey = eq["y"]
            latex = eq["latex"]
            badge_text = f"[LaTeX] {latex}"
            badge_w = max(140, len(badge_text) * 8 + 20)
            badge_h = 36
            draw.rounded_rectangle([(ex, ey), (ex + badge_w, ey + badge_h)], radius=6, fill=EQUATION_BG, outline=EQUATION_BORDER, width=2)
            draw.text((ex + 10, ey + 10), badge_text, fill=EQUATION_BORDER)

        img.save(str(out_path), "PNG")
        file_size = out_path.stat().st_size

        return {
            "success": True,
            "action": "export_whiteboard_png",
            "file_path": str(out_path),
            "file_size_bytes": file_size,
            "width": width,
            "height": height,
            "elements_count": len(self.nodes) + len(self.arrows) + len(self.texts) + len(self.equations),
        }


# Global Whiteboard Singleton
_whiteboard = WhiteboardBridge()


# Module-level Primitives
def draw_node(id: str, x: int, y: int, label: str, node_type: str = "default") -> Dict[str, Any]:
    return _whiteboard.draw_node(id=id, x=x, y=y, label=label, node_type=node_type)


def draw_arrow(from_id: str, to_id: str, label: str = "") -> Dict[str, Any]:
    return _whiteboard.draw_arrow(from_id=from_id, to_id=to_id, label=label)


def draw_text(x: int, y: int, content: str, font_size: int = 14) -> Dict[str, Any]:
    return _whiteboard.draw_text(x=x, y=y, content=content, font_size=font_size)


def draw_equation(x: int, y: int, latex: str) -> Dict[str, Any]:
    return _whiteboard.draw_equation(x=x, y=y, latex=latex)


def clear_whiteboard() -> Dict[str, Any]:
    return _whiteboard.clear_whiteboard()


def export_whiteboard_png(file_path: Union[str, Path], width: int = 1280, height: int = 720) -> Dict[str, Any]:
    return _whiteboard.export_whiteboard_png(file_path=file_path, width=width, height=height)


@nexus_tool(
    name="whiteboard_bridge",
    description="Live whiteboard canvas bridge: draws nodes, arrows, text, and LaTeX equations, broadcasts to nexus:whiteboard-ops, and exports high-res PNG.",
    agent="STUDIO-01",
    requires_approval=False,
)
def whiteboard_bridge_tool(
    action: str = "state",
    node_id: Optional[str] = None,
    x: int = 100,
    y: int = 100,
    label: str = "",
    node_type: str = "default",
    from_id: Optional[str] = None,
    to_id: Optional[str] = None,
    content: Optional[str] = None,
    latex: Optional[str] = None,
    file_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Unified @nexus_tool interface for Whiteboard operations."""
    act = action.lower()
    if act == "draw_node":
        return draw_node(id=node_id or f"node_{int(time.time()*1000)}", x=x, y=y, label=label, node_type=node_type)
    elif act == "draw_arrow":
        return draw_arrow(from_id=from_id or "", to_id=to_id or "", label=label)
    elif act == "draw_text":
        return draw_text(x=x, y=y, content=content or label)
    elif act == "draw_equation":
        return draw_equation(x=x, y=y, latex=latex or label)
    elif act == "clear":
        return clear_whiteboard()
    elif act == "export":
        target = file_path or str(Path.home() / ".nexus-agent" / "whiteboard.png")
        return export_whiteboard_png(file_path=target)
    return {"success": True, "state": _whiteboard.get_state()}


__all__ = [
    "WhiteboardBridge",
    "draw_node",
    "draw_arrow",
    "draw_text",
    "draw_equation",
    "clear_whiteboard",
    "export_whiteboard_png",
    "whiteboard_bridge_tool",
    "_whiteboard",
]
