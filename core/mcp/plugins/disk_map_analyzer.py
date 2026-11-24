"""Nexus OS v5.0 - Storage & Disk Map Space Analyzer Plugin.

Analyzes drive storage distribution, locates high-capacity storage hogs,
and audits safe reclaimable caches (Temp, npm, pip, crash dumps) without destructive side-effects:
- Inspects drive partition geometry and usage percentages
- Fast shallow tree scanner identifying files >100MB
- Audits developer caches and temporary directories for reclaimable space
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
import shutil
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.disk_map_analyzer")


def _get_drive_stats(path_str: str = "C:\\") -> Dict[str, Any]:
    """Retrieves disk capacity metrics for a given mount path."""
    try:
        total, used, free = shutil.disk_usage(path_str)
        pct = (used / total) * 100.0 if total > 0 else 0.0
        return {
            "path": path_str,
            "total_gb": round(total / (1024 ** 3), 2),
            "used_gb": round(used / (1024 ** 3), 2),
            "free_gb": round(free / (1024 ** 3), 2),
            "percent_used": round(pct, 1),
        }
    except Exception as exc:
        return {"path": path_str, "error": str(exc), "total_gb": 0, "free_gb": 0, "percent_used": 0}


def _audit_reclaimable_caches() -> List[Dict[str, Any]]:
    """Inspects common Windows and developer temporary folders for reclaimable space."""
    candidates = [
        {"name": "Local AppData Temp", "path": Path.home() / "AppData" / "Local" / "Temp"},
        {"name": "pip Cache", "path": Path.home() / "AppData" / "Local" / "pip" / "cache"},
        {"name": "npm Cache", "path": Path.home() / "AppData" / "Local" / "npm-cache"},
        {"name": "Crash Dumps", "path": Path.home() / "AppData" / "Local" / "CrashDumps"},
    ]

    results: List[Dict[str, Any]] = []
    for cand in candidates:
        p = cand["path"]
        if p.exists() and p.is_dir():
            try:
                # Fast shallow sample size calculation (sub-10ms)
                total_bytes = 0
                item_count = 0
                with os.scandir(str(p)) as it:
                    for entry in it:
                        try:
                            if entry.is_file(follow_symlinks=False):
                                total_bytes += entry.stat().st_size
                                item_count += 1
                        except (OSError, PermissionError):
                            continue
                        if item_count >= 200:
                            break

                mb = round(total_bytes / (1024 * 1024), 2)
                results.append({
                    "name": cand["name"],
                    "path": str(p),
                    "estimated_mb": mb,
                    "item_count": item_count,
                    "safe_to_clean": True,
                })
            except Exception as exc:
                logger.debug("Failed checking cache dir %s: %s", p, exc)
    return results


@nexus_tool(
    name="disk_map_analyzer",
    description="Analyzes drive storage distribution, locates high-capacity storage hogs, and identifies safe reclaimable developer caches and temporary files.",
    agent="SYS-01",
    requires_approval=False,
)
def disk_map_analyzer(
    action: str = "analyze_drive",
    target_path: Optional[str] = None,
    min_size_mb: float = 50.0,
    max_results: int = 15,
) -> Dict[str, Any]:
    """
    Analyzes drive storage distribution, locates storage hogs, and audits developer caches.

    Args:
        action: 'analyze_drive', 'find_large_files', 'cache_audit', 'summary'.
        target_path: Drive letter or root directory to evaluate (e.g. 'C:\\', 'D:\\', or user home).
        min_size_mb: Minimum file threshold in MB for large file discovery.
        max_results: Maximum count of files returned in large file discovery.
    """
    start_t = time.perf_counter()
    drive_root = target_path if target_path else "C:\\"

    # 1. Action: cache_audit
    if action == "cache_audit":
        caches = _audit_reclaimable_caches()
        total_rec_mb = sum(c["estimated_mb"] for c in caches)
        return {
            "success": True,
            "action": "cache_audit",
            "caches_detected": len(caches),
            "total_reclaimable_mb": round(total_rec_mb, 2),
            "reclaimable_targets": caches,
            "message": f"Found {len(caches)} reclaimable cache targets totaling ~{total_rec_mb:.1f} MB.",
        }

    # 2. Action: find_large_files
    if action == "find_large_files":
        scan_dir = Path(target_path) if target_path else Path.home()
        min_bytes = int(min_size_mb * 1024 * 1024)
        large_files: List[Dict[str, Any]] = []

        if scan_dir.exists() and scan_dir.is_dir():
            for root, dirs, files in os.walk(str(scan_dir)):
                # Skip heavy system/node_modules/git directories
                dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "AppData", "$Recycle.Bin", "Windows")]
                for f in files:
                    fp = Path(root) / f
                    try:
                        sz = fp.stat().st_size
                        if sz >= min_bytes:
                            large_files.append({
                                "name": f,
                                "path": str(fp),
                                "size_mb": round(sz / (1024 * 1024), 2),
                                "extension": fp.suffix.lower(),
                            })
                    except (OSError, PermissionError):
                        continue
                    if len(large_files) >= max_results * 2:
                        break
                if len(large_files) >= max_results * 2:
                    break

        large_files.sort(key=lambda x: x["size_mb"], reverse=True)
        trimmed = large_files[:max_results]

        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
        return {
            "success": True,
            "action": "find_large_files",
            "scan_dir": str(scan_dir),
            "min_size_mb": min_size_mb,
            "count": len(trimmed),
            "large_files": trimmed,
            "latency_ms": elapsed_ms,
        }

    # 3. Action: analyze_drive / summary
    stats = _get_drive_stats(drive_root)
    reclaimable = _audit_reclaimable_caches()
    rec_mb = sum(c["estimated_mb"] for c in reclaimable)

    emit_telemetry_event(
        "disk_analyzed",
        {"drive": drive_root, "percent_used": stats.get("percent_used", 0)},
    )

    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": action,
        "drive": drive_root,
        "capacity_gb": stats.get("total_gb", 0),
        "used_gb": stats.get("used_gb", 0),
        "free_gb": stats.get("free_gb", 0),
        "percent_used": stats.get("percent_used", 0),
        "estimated_reclaimable_mb": round(rec_mb, 2),
        "reclaimable_caches": reclaimable,
        "message": f"Drive {drive_root} has {stats.get('free_gb', 0)} GB free ({100 - stats.get('percent_used', 0):.1f}% available). ~{rec_mb:.1f} MB in safe caches.",
        "latency_ms": elapsed_ms,
    }
