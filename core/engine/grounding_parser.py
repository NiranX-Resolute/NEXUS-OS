"""
Nexus OS v5.0 - UI-TARS [0..1000] Visual Grounding Parser & Multi-DPI Scaler
=============================================================================
Parses UI-TARS-1.5 multimodal action tokens and scales normalized [0..1000]
coordinates accurately to physical desktop/viewport pixels across multi-monitor
DPI setups.
Supports:
- Actions: click, double_click, right_click, drag, type, hotkey, scroll, wait, finished
- Coordinate formats: start_box='(x,y)' and start_box='(x1,y1,x2,y2)'
- FAST / GROUNDING prompt mode (omitting Thought tokens for sub-100ms latency)
- Full Thought + Action reasoning mode
=============================================================================
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("nexus.engine.grounding_parser")


def _extract_box_coordinates(box_str: str) -> Optional[List[float]]:
    """Extracts numeric coordinates from '(x, y)' or '(x1, y1, x2, y2)'."""
    if not box_str:
        return None
    nums = re.findall(r"[-+]?\d*\.\d+|\d+", box_str)
    if not nums:
        return None
    coords = [float(n) for n in nums]
    return coords if len(coords) in (2, 4) else None


def normalize_coords_to_physical(
    coords: List[float],
    screen_width: int,
    screen_height: int,
    dpi_scale: float = 1.0,
) -> Tuple[int, int, Tuple[float, float]]:
    """
    Converts [0..1000] normalized coordinates (or 4-tuple bounding box) into:
    (physical_x, physical_y, (norm_x_ratio, norm_y_ratio)).
    """
    if len(coords) == 4:
        # Bounding box (x1, y1, x2, y2) -> calculate center point
        x1, y1, x2, y2 = coords
        nx = (x1 + x2) / 2.0
        ny = (y1 + y2) / 2.0
    elif len(coords) == 2:
        nx, ny = coords[0], coords[1]
    else:
        nx, ny = 500.0, 500.0

    # Ensure range in [0, 1000]; if model emitted [0.0, 1.0] ratios, scale up
    if 0.0 <= nx <= 1.0 and 0.0 <= ny <= 1.0 and (nx < 1.0 or ny < 1.0):
        norm_x_ratio = nx
        norm_y_ratio = ny
    else:
        norm_x_ratio = max(0.0, min(1.0, nx / 1000.0))
        norm_y_ratio = max(0.0, min(1.0, ny / 1000.0))

    effective_dpi = float(dpi_scale) if dpi_scale and dpi_scale > 0 else 1.0
    physical_x = int(round(norm_x_ratio * screen_width * effective_dpi))
    physical_y = int(round(norm_y_ratio * screen_height * effective_dpi))

    return physical_x, physical_y, (round(norm_x_ratio, 4), round(norm_y_ratio, 4))


def parse_tars_action(
    raw_output: str,
    screen_width: int = 1920,
    screen_height: int = 1080,
    dpi_scale: float = 1.0,
) -> Dict[str, Any]:
    """
    Parses UI-TARS action syntax and converts normalized [0..1000] coordinates
    to physical screen pixels.

    Args:
        raw_output: Raw LLM/VLM generation string.
        screen_width: Desktop or viewport width in pixels.
        screen_height: Desktop or viewport height in pixels.
        dpi_scale: Windows Display Scaling multiplier (e.g. 1.0, 1.25, 1.5).

    Returns:
        Structured action dictionary with thought, action_type, physical coordinates, and latency.
    """
    t_start = time.perf_counter()
    clean_text = (raw_output or "").strip()

    # 1. Parse Thought if present (omitted in GROUNDING fast-mode)
    thought = ""
    m_thought = re.search(r"Thought:\s*(.*?)(?=\nAction:|\Z)", clean_text, re.DOTALL | re.IGNORECASE)
    if m_thought:
        thought = m_thought.group(1).strip()

    # 2. Extract Action call
    action_type = "unknown"
    args_str = ""
    m_action = re.search(r"Action:\s*([a-zA-Z_]+)\s*\((.*)\)", clean_text, re.DOTALL | re.IGNORECASE)
    if m_action:
        action_type = m_action.group(1).lower().strip()
        args_str = m_action.group(2).strip()
    else:
        # Bare action call fallback without 'Action:' prefix
        m_bare = re.search(
            r"\b(click|double_click|right_click|drag|type|hotkey|scroll|wait|finished)\s*\((.*)\)",
            clean_text,
            re.DOTALL | re.IGNORECASE,
        )
        if m_bare:
            action_type = m_bare.group(1).lower().strip()
            args_str = m_bare.group(2).strip()

    # 3. Parse arguments: start_box, end_box, content, key, direction
    start_box_match = re.search(r"start_box\s*=\s*['\"]?(\([^'\"]+\)|\[[^'\"]+\]|[^,'\"\)\s]+)['\"]?", args_str, re.IGNORECASE)
    if not start_box_match:
        # Fallback without keyword name: e.g. '(500,500)' or '[500, 500]'
        start_box_match = re.search(r"['\"]?(\([^\)]+\)|\[[^\]]+\])['\"]?", args_str)

    end_box_match = re.search(r"end_box\s*=\s*['\"]?(\([^'\"]+\)|\[[^'\"]+\]|[^,'\"\)\s]+)['\"]?", args_str, re.IGNORECASE)
    content_match = re.search(r"(?:content|text)\s*=\s*['\"]([^'\"]*)['\"]", args_str, re.IGNORECASE)
    key_match = re.search(r"(?:key|keys|hotkey)\s*=\s*['\"]([^'\"]*)['\"]", args_str, re.IGNORECASE)
    direction_match = re.search(r"direction\s*=\s*['\"]([^'\"]*)['\"]", args_str, re.IGNORECASE)

    raw_start_box = start_box_match.group(1).strip() if start_box_match else ""
    raw_end_box = end_box_match.group(1).strip() if end_box_match else ""
    content = content_match.group(1) if content_match else ""
    key = key_match.group(1) if key_match else ""
    direction = direction_match.group(1).lower() if direction_match else "down"

    # 4. Resolve physical coordinates for start_box
    target_point: Optional[Tuple[int, int]] = None
    normalized_coords: Optional[Tuple[float, float]] = None
    start_raw_coords = _extract_box_coordinates(raw_start_box)
    if not start_raw_coords and action_type in ("click", "double_click", "right_click", "drag", "type"):
        # Fallback: extract any 2 or 4 numbers present in args_str
        start_raw_coords = _extract_box_coordinates(args_str)

    if start_raw_coords:
        px_x, px_y, norm_tuple = normalize_coords_to_physical(
            start_raw_coords, screen_width, screen_height, dpi_scale
        )
        target_point = (px_x, px_y)
        normalized_coords = norm_tuple

    # 5. Resolve physical coordinates for end_box (drag action)
    end_point: Optional[Tuple[int, int]] = None
    end_raw_coords = _extract_box_coordinates(raw_end_box)
    if end_raw_coords:
        end_x, end_y, _ = normalize_coords_to_physical(
            end_raw_coords, screen_width, screen_height, dpi_scale
        )
        end_point = (end_x, end_y)

    elapsed_ms = round((time.perf_counter() - t_start) * 1000, 3)

    return {
        "success": action_type != "unknown",
        "thought": thought,
        "action_type": action_type,
        "action": action_type,
        "raw_args": args_str,
        "raw_start_box": raw_start_box,
        "raw_end_box": raw_end_box,
        "target_point": target_point,
        "x": target_point[0] if target_point else None,
        "y": target_point[1] if target_point else None,
        "end_point": end_point,
        "end_x": end_point[0] if end_point else None,
        "end_y": end_point[1] if end_point else None,
        "normalized_coords": normalized_coords,
        "content": content,
        "key": key,
        "direction": direction,
        "screen_dimensions": [screen_width, screen_height],
        "dpi_scale": dpi_scale,
        "latency_ms": elapsed_ms,
    }


def build_grounding_prompt(query: str, fast_mode: bool = True) -> str:
    """
    Generates UI-TARS 1.5 prompt.
    When fast_mode=True (GROUNDING fast-prompt mode), strictly enforces zero Thought tokens
    for immediate sub-50ms coordinate generation.
    """
    if fast_mode:
        return (
            f"Instruction: {query}\n"
            "Format: Output strictly the Action call with normalized coordinates in [0..1000] "
            "without Thought tokens.\n"
            "Action:"
        )
    return (
        f"Instruction: {query}\n"
        "Format:\n"
        "Thought: <step-by-step reasoning>\n"
        "Action: <action_type>(start_box='(x,y)')"
    )
