"""Nexus OS v5.0 - Local Steam Library & Game Launcher Plugin.

Inspects local Steam installations on Windows, tracks disk footprints of installed games,
detects installed game manifests, and triggers clean game launches via steam:// protocol.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.game_steam_updater")

STANDARD_STEAM_PATHS = [
    Path("C:/Program Files (x86)/Steam"),
    Path("C:/Program Files/Steam"),
    Path("D:/Steam"),
    Path("D:/SteamLibrary"),
    Path("E:/SteamLibrary"),
]


def _find_steam_dir() -> Optional[Path]:
    """Locates the primary Steam installation directory."""
    for p in STANDARD_STEAM_PATHS:
        if p.exists() and (p / "steam.exe").exists():
            return p
    for p in STANDARD_STEAM_PATHS:
        if p.exists():
            return p
    return None


def _parse_steam_library_folders(steam_dir: Path) -> List[Path]:
    """Finds all Steam library paths from libraryfolders.vdf."""
    libraries = [steam_dir]
    vdf_path = steam_dir / "steamapps" / "libraryfolders.vdf"
    if vdf_path.exists():
        try:
            content = vdf_path.read_text(encoding="utf-8", errors="ignore")
            # Extract "path" "\t\t" "D:\\SteamLibrary"
            matches = re.findall(r'"path"\s+"([^"]+)"', content)
            for m in matches:
                p = Path(m.replace("\\\\", "/"))
                if p.exists() and p not in libraries:
                    libraries.append(p)
        except Exception as exc:
            logger.debug("Failed parsing libraryfolders.vdf: %s", exc)
    return libraries


def _get_installed_games() -> List[Dict[str, Any]]:
    """Scans for installed games via appmanifest_*.acf files."""
    steam_dir = _find_steam_dir()
    if not steam_dir:
        return []

    libraries = _parse_steam_library_folders(steam_dir)
    games: List[Dict[str, Any]] = []

    for lib in libraries:
        steamapps = lib / "steamapps"
        if not steamapps.exists():
            continue

        for acf in steamapps.glob("appmanifest_*.acf"):
            try:
                text = acf.read_text(encoding="utf-8", errors="ignore")
                appid_m = re.search(r'"appid"\s+"(\d+)"', text)
                name_m = re.search(r'"name"\s+"([^"]+)"', text)
                size_m = re.search(r'"BytesToDownload"\s+"(\d+)"', text) or re.search(r'"SizeOnDisk"\s+"(\d+)"', text)

                appid = appid_m.group(1) if appid_m else "0"
                name = name_m.group(1) if name_m else acf.stem
                size_bytes = int(size_m.group(1)) if size_m else 0

                # Skip Steamworks Common Redistributables
                if "steamworks" in name.lower():
                    continue

                games.append({
                    "appid": appid,
                    "name": name,
                    "size_gb": round(size_bytes / (1024 ** 3), 2) if size_bytes > 0 else 0.0,
                    "install_dir": str(steamapps / "common" / name),
                    "manifest": acf.name,
                })
            except Exception as exc:
                logger.debug("Error parsing %s: %s", acf.name, exc)

    return games


@nexus_tool(
    name="game_steam_updater",
    description="Inspects local Steam library installations, tracking disk footprints, installed game states, and orchestrating updates and launches.",
    agent="SYS-01",
    requires_approval=True,
)
def game_steam_updater(
    action: str = "list_installed",
    appid: Optional[str] = None,
    game_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Inspects installed Steam games, calculates storage consumption, or triggers game launch.

    Args:
        action: 'list_installed', 'library_summary', 'launch_game'.
        appid: Steam AppID for launching.
        game_name: Title of game to search or launch.
    """
    start_t = time.perf_counter()
    steam_dir = _find_steam_dir()
    steam_installed = steam_dir is not None

    games = _get_installed_games()
    total_gb = sum(g["size_gb"] for g in games)

    # 1. Action: launch_game
    if action == "launch_game":
        target_appid = appid
        if not target_appid and game_name:
            for g in games:
                if game_name.lower() in g["name"].lower():
                    target_appid = g["appid"]
                    break

        if not target_appid:
            return {
                "success": False,
                "error": f"Could not determine AppID for target: appid={appid}, game_name={game_name}",
            }

        launch_url = f"steam://run/{target_appid}"
        try:
            # Safe Windows protocol launch
            os.startfile(launch_url)
            emit_telemetry_event(
                "game_launched",
                {"appid": target_appid, "url": launch_url},
            )
            return {
                "success": True,
                "action": "launch_game",
                "appid": target_appid,
                "launch_url": launch_url,
                "message": f"Dispatched Steam run protocol for AppID {target_appid}.",
            }
        except Exception as exc:
            return {"success": False, "error": f"Failed launching Steam game: {exc}"}

    # 2. Action: library_summary / list_installed
    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": action,
        "steam_installed": steam_installed,
        "steam_root": str(steam_dir) if steam_dir else "",
        "games_count": len(games),
        "total_disk_gb": round(total_gb, 2),
        "games": games,
        "message": f"Found {len(games)} installed Steam game(s) consuming {total_gb:.1f} GB of disk space." if steam_installed else "Steam installation not found on default paths.",
        "latency_ms": elapsed_ms,
    }
