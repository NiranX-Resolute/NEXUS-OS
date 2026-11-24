"""
Nexus Autonomous Engine - Configuration & Storage Primitives
=============================================================================
Defines the local-first filesystem hierarchy under ~/.nexus-agent/,
hardware detection capabilities, security permissions, and core constants.
Guarantees 100% data sovereignty by keeping all local agent state on the host.
=============================================================================
"""

import os
import sys
import platform
import shutil
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger("nexus.config")

# =============================================================================
# Core Storage Path Constants
# =============================================================================
NEXUS_HOME: Path = Path.home() / ".nexus-agent"
DB_DIR: Path = NEXUS_HOME / "db"
WORKTREES_DIR: Path = NEXUS_HOME / "worktrees"
MEMORIES_DIR: Path = NEXUS_HOME / "memories"
EXPORTS_DIR: Path = NEXUS_HOME / "exports"
DB_PATH: Path = DB_DIR / "agent_local.db"

# POSIX restricted permissions (read/write/execute by owner only)
SECURE_DIR_PERMS: int = 0o700
SECURE_FILE_PERMS: int = 0o600

# Engine execution defaults
DEFAULT_COMMAND_TIMEOUT_SEC: float = 60.0
MAX_AGENT_EXECUTION_STEPS: int = 12
DEFAULT_GIT_BRANCH_PREFIX: str = "agent/task-"


@dataclass
class HardwareSpecs:
    """Hardware resource snapshot for local model and runtime scheduling."""
    os_name: str
    os_version: str
    architecture: str
    cpu_count: int
    ram_total_gb: float
    ram_available_gb: float
    gpu_available: bool
    gpu_name: Optional[str]
    python_version: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def ensure_runtime_directories() -> Dict[str, Path]:
    """
    Deterministically creates all required local-first runtime directories
    under ~/.nexus-agent/ and restricts access permissions to owner-only (0o700 on POSIX).
    Returns a dictionary mapping directory identifiers to their Path objects.
    """
    directories = {
        "home": NEXUS_HOME,
        "db": DB_DIR,
        "worktrees": WORKTREES_DIR,
        "memories": MEMORIES_DIR,
        "exports": EXPORTS_DIR,
    }

    is_posix = os.name == "posix"

    for key, directory in directories.items():
        directory.mkdir(parents=True, exist_ok=True)
        if is_posix:
            try:
                os.chmod(directory, SECURE_DIR_PERMS)
            except Exception as e:
                logger.warning("Could not set 0o700 permissions on %s: %s", directory, e)

    return directories


def detect_hardware_specs() -> HardwareSpecs:
    """
    Detects local CPU, RAM, OS, and GPU capabilities deterministically without
    relying on external network services.
    """
    os_name = platform.system()
    os_version = platform.release()
    architecture = platform.machine()
    cpu_count = os.cpu_count() or 1

    ram_total_gb = 0.0
    ram_available_gb = 0.0

    # 1. RAM Detection via psutil or native platform APIs
    try:
        import psutil
        mem = psutil.virtual_memory()
        ram_total_gb = round(mem.total / (1024 ** 3), 2)
        ram_available_gb = round(mem.available / (1024 ** 3), 2)
    except Exception:
        # Fallback RAM inspection for Windows
        if os_name == "Windows":
            try:
                import ctypes
                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]
                stat = MEMORYSTATUSEX()
                stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                    ram_total_gb = round(stat.ullTotalPhys / (1024 ** 3), 2)
                    ram_available_gb = round(stat.ullAvailPhys / (1024 ** 3), 2)
            except Exception:
                ram_total_gb = 8.0
                ram_available_gb = 4.0
        else:
            # Fallback for Linux /sys/class or macOS
            try:
                if hasattr(os, "sysconf"):
                    pages = os.sysconf("SC_PHYS_PAGES")
                    page_size = os.sysconf("SC_PAGE_SIZE")
                    ram_total_gb = round((pages * page_size) / (1024 ** 3), 2)
                    ram_available_gb = round(ram_total_gb * 0.5, 2)
            except Exception:
                ram_total_gb = 8.0
                ram_available_gb = 4.0

    # 2. GPU Detection
    gpu_available = False
    gpu_name = None

    try:
        import torch
        if torch.cuda.is_available():
            gpu_available = True
            gpu_name = torch.cuda.get_device_name(0)
    except Exception:
        # Inspect via nvidia-smi if torch not present
        if shutil.which("nvidia-smi"):
            try:
                import subprocess
                out = subprocess.check_output(
                    ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                    text=True,
                    timeout=3.0,
                    stderr=subprocess.DEVNULL
                )
                if out.strip():
                    gpu_available = True
                    gpu_name = out.strip().splitlines()[0]
            except Exception:
                pass

    return HardwareSpecs(
        os_name=os_name,
        os_version=os_version,
        architecture=architecture,
        cpu_count=cpu_count,
        ram_total_gb=ram_total_gb,
        ram_available_gb=ram_available_gb,
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        python_version=sys.version.split()[0]
    )
