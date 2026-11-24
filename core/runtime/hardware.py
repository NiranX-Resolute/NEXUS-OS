"""
Nexus OS v5.0 - Hardware Telemetry & Dynamic VRAM Detector
Provides real-time GPU/VRAM telemetry, CPU load, and RAM metrics
for hardware-aware zero-cost LLM model routing.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

import ctypes
from ctypes import wintypes
from dataclasses import asdict, dataclass, field
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class GpuDevice:
    index: int
    name: str
    vram_total_mb: float
    vram_free_mb: float
    vram_used_mb: float
    driver_version: Optional[str] = None
    temperature_c: Optional[float] = None


@dataclass
class HardwareTelemetry:
    timestamp: float
    platform: str
    cpu_cores_logical: int
    cpu_cores_physical: int
    cpu_percent: float
    ram_total_mb: float
    ram_free_mb: float
    ram_used_mb: float
    ram_percent: float
    gpus: List[Dict[str, Any]]
    primary_gpu_name: str
    primary_vram_total_mb: float
    primary_vram_free_mb: float
    recommended_profile: str
    local_llm_capable: bool
    recommended_local_model: Optional[str]
    gpu_temperature_c: Optional[float] = None
    cpu_temperature_c: Optional[float] = None
    thermal_zones: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class _Win32MemoryStatusEx(ctypes.Structure):
    _fields_ = [
        ("dwLength", wintypes.DWORD),
        ("dwMemoryLoad", wintypes.DWORD),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
    ]


class HardwareInspector:
    """
    Direct hardware telemetry inspector supporting Win32 native APIs,
    NVML DLL bindings, nvidia-smi subprocesses, and psutil fallbacks.
    """

    def __init__(self):
        self._nvml_handle = None
        self._init_nvml()

    def _init_nvml(self):
        """Attempts to load and initialize NVIDIA Management Library (NVML)."""
        if sys.platform != "win32":
            return

        nvml_candidates = [
            r"C:\Windows\System32\nvml.dll",
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvml.dll",
        ]
        if shutil.which("nvidia-smi"):
            nvml_candidates.append("nvml.dll")

        for candidate in nvml_candidates:
            if os.path.isabs(candidate) and not os.path.exists(candidate):
                continue
            try:
                handle = ctypes.CDLL(candidate)
                if handle:
                    # Initialize NVML
                    ret = handle.nvmlInit_v2() if hasattr(handle, "nvmlInit_v2") else handle.nvmlInit()
                    if ret == 0:
                        self._nvml_handle = handle
                        break
            except Exception:
                continue

    def get_system_ram(self) -> Tuple[float, float, float, float]:
        """
        Returns (total_mb, free_mb, used_mb, percent_used) for system physical memory.
        Uses native Win32 GlobalMemoryStatusEx for zero-dependency high speed execution.
        """
        # Try psutil first if present
        try:
            import psutil
            vm = psutil.virtual_memory()
            total_mb = round(vm.total / (1024 * 1024), 2)
            free_mb = round(vm.available / (1024 * 1024), 2)
            used_mb = round((vm.total - vm.available) / (1024 * 1024), 2)
            percent = vm.percent
            return (total_mb, free_mb, used_mb, percent)
        except ImportError:
            pass

        # Native Win32 API fallback
        if sys.platform == "win32":
            try:
                stat = _Win32MemoryStatusEx()
                stat.dwLength = ctypes.sizeof(_Win32MemoryStatusEx)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                    total_mb = round(stat.ullTotalPhys / (1024 * 1024), 2)
                    free_mb = round(stat.ullAvailPhys / (1024 * 1024), 2)
                    used_mb = round((stat.ullTotalPhys - stat.ullAvailPhys) / (1024 * 1024), 2)
                    percent = float(stat.dwMemoryLoad)
                    return (total_mb, free_mb, used_mb, percent)
            except Exception:
                pass

        # Standard baseline fallback
        return (16384.0, 8192.0, 8192.0, 50.0)

    def get_cpu_telemetry(self) -> Tuple[int, int, float]:
        """
        Returns (logical_cores, physical_cores, cpu_percent).
        """
        logical = os.cpu_count() or 4
        physical = max(1, logical // 2)
        usage = 0.0

        try:
            import psutil
            logical = psutil.cpu_count(logical=True) or logical
            physical = psutil.cpu_count(logical=False) or physical
            usage = psutil.cpu_percent(interval=None)
        except Exception:
            pass

        return (logical, physical, usage)

    def get_nvidia_gpus(self) -> List[GpuDevice]:
        """
        Queries all available GPUs and their VRAM stats via NVML or nvidia-smi.
        """
        devices: List[GpuDevice] = []

        # Strategy 1: Native NVML DLL handle
        if self._nvml_handle:
            try:
                device_count = ctypes.c_uint()
                if self._nvml_handle.nvmlDeviceGetCount_v2(ctypes.byref(device_count)) == 0:
                    for i in range(device_count.value):
                        dev_handle = ctypes.c_void_p()
                        if self._nvml_handle.nvmlDeviceGetHandleByIndex_v2(i, ctypes.byref(dev_handle)) == 0:
                            # Name
                            name_buf = ctypes.create_string_buffer(64)
                            self._nvml_handle.nvmlDeviceGetName(dev_handle, name_buf, 64)
                            name = name_buf.value.decode("utf-8", errors="ignore")

                            # Memory
                            class _NvmlMemory(ctypes.Structure):
                                _fields_ = [
                                    ("total", ctypes.c_ulonglong),
                                    ("free", ctypes.c_ulonglong),
                                    ("used", ctypes.c_ulonglong),
                                ]

                            mem = _NvmlMemory()
                            if self._nvml_handle.nvmlDeviceGetMemoryInfo(dev_handle, ctypes.byref(mem)) == 0:
                                total_mb = round(mem.total / (1024 * 1024), 2)
                                free_mb = round(mem.free / (1024 * 1024), 2)
                                used_mb = round(mem.used / (1024 * 1024), 2)
                                gpu_temp = self.get_nvml_gpu_temperature(i)
                                devices.append(
                                    GpuDevice(
                                        index=i,
                                        name=name,
                                        vram_total_mb=total_mb,
                                        vram_free_mb=free_mb,
                                        vram_used_mb=used_mb,
                                        temperature_c=gpu_temp,
                                    )
                                )
                    if devices:
                        return devices
            except Exception:
                pass

        # Strategy 2: nvidia-smi command-line execution
        if shutil.which("nvidia-smi"):
            try:
                cmd = [
                    "nvidia-smi",
                    "--query-gpu=index,name,memory.total,memory.free,memory.used,driver_version",
                    "--format=csv,noheader,nounits",
                ]
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=2.0,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    for line in proc.stdout.strip().splitlines():
                        parts = [p.strip() for p in line.split(",")]
                        if len(parts) >= 5:
                            idx = int(parts[0])
                            name = parts[1]
                            tot = float(parts[2])
                            free = float(parts[3])
                            used = float(parts[4])
                            drv = parts[5] if len(parts) > 5 else None
                            gpu_temp = self.get_nvml_gpu_temperature(idx)
                            devices.append(
                                GpuDevice(
                                    index=idx,
                                    name=name,
                                    vram_total_mb=tot,
                                    vram_free_mb=free,
                                    vram_used_mb=used,
                                    driver_version=drv,
                                    temperature_c=gpu_temp,
                                )
                            )
                    if devices:
                        return devices
            except Exception:
                pass

        # Strategy 3: Windows WMI fallback for GPU name identification
        if sys.platform == "win32" and not devices and shutil.which("wmic"):
            try:
                cmd = ["wmic", "path", "win32_VideoController", "get", "AdapterRAM,Name", "/format:csv"]
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=2.0,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
                    idx = 0
                    for line in lines[1:]:  # Skip header
                        cols = [c.strip() for c in line.split(",") if c.strip()]
                        if len(cols) >= 2:
                            # cols[0] is Node, cols[1] is AdapterRAM, cols[2] is Name
                            ram_str = cols[1] if cols[1].isdigit() else "0"
                            name_str = cols[2] if len(cols) > 2 else cols[1]
                            ram_bytes = int(ram_str) if ram_str.isdigit() else 0
                            ram_mb = round(ram_bytes / (1024 * 1024), 2)
                            devices.append(
                                GpuDevice(
                                    index=idx,
                                    name=name_str,
                                    vram_total_mb=ram_mb,
                                    vram_free_mb=ram_mb,
                                    vram_used_mb=0.0,
                                )
                            )
                            idx += 1
                    if devices:
                        return devices
            except Exception:
                pass

        # Strategy 4: Fallback generic graphics device
        return [
            GpuDevice(
                index=0,
                name="System Integrated Graphics / Shared Host GPU",
                vram_total_mb=0.0,
                vram_free_mb=0.0,
                vram_used_mb=0.0,
            )
        ]

    def get_nvml_gpu_temperature(self, device_index: int = 0) -> Optional[float]:
        """
        Polls GPU temperature via NVML (pynvml or native DLL handle) with safe fallback to nvidia-smi.
        Returns temperature in degrees Celsius, or None / 0.0 if unavailable.
        """
        # Strategy A: Try pynvml if installed
        try:
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(device_index)
            temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            return float(temp)
        except Exception:
            pass

        # Strategy B: Native ctypes NVML DLL handle
        if self._nvml_handle:
            try:
                dev_handle = ctypes.c_void_p()
                if self._nvml_handle.nvmlDeviceGetHandleByIndex_v2(device_index, ctypes.byref(dev_handle)) == 0:
                    temp = ctypes.c_uint()
                    # Sensor type 0 corresponds to NVML_TEMPERATURE_GPU
                    if self._nvml_handle.nvmlDeviceGetTemperature(dev_handle, 0, ctypes.byref(temp)) == 0:
                        return float(temp.value)
            except Exception:
                pass

        # Strategy C: nvidia-smi CLI execution
        if shutil.which("nvidia-smi"):
            try:
                cmd = [
                    "nvidia-smi",
                    f"--query-gpu=temperature.gpu",
                    "--format=csv,noheader,nounits",
                    f"-i={device_index}",
                ]
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=1.5,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    val = proc.stdout.strip().splitlines()[0]
                    return float(val)
            except Exception:
                pass

        return None

    def get_thermal_zones(self) -> List[Dict[str, Any]]:
        """
        Queries WMI ACPI thermal zones from root\\wmi:MSAcpi_ThermalZoneTemperature.
        Converts tenths of Kelvin to Celsius: C = (T / 10.0) - 273.15.
        Falls back safely to empty list [] if not supported or unprivileged.
        """
        zones: List[Dict[str, Any]] = []
        if sys.platform != "win32":
            return zones

        # Attempt 1: wmic command line
        if shutil.which("wmic"):
            try:
                cmd = [
                    "wmic",
                    r"/namespace:\\root\wmi",
                    "path",
                    "MSAcpi_ThermalZoneTemperature",
                    "get",
                    "CurrentTemperature,InstanceName",
                    "/format:csv",
                ]
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=2.0,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
                    for line in lines[1:]:  # Skip header
                        cols = [c.strip() for c in line.split(",") if c.strip()]
                        if len(cols) >= 2:
                            raw_temp = cols[1] if cols[1].isdigit() else (cols[0] if cols[0].isdigit() else "")
                            name_str = cols[2] if len(cols) > 2 else cols[0]
                            if raw_temp and raw_temp.isdigit():
                                kelvin_tenths = float(raw_temp)
                                celsius = round((kelvin_tenths / 10.0) - 273.15, 1)
                                zones.append({
                                    "zone": name_str,
                                    "temperature_c": celsius,
                                    "raw_tenths_kelvin": kelvin_tenths,
                                })
                    if zones:
                        return zones
            except Exception:
                pass

        # Attempt 2: PowerShell Get-CimInstance
        if shutil.which("powershell"):
            try:
                ps_cmd = (
                    "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature "
                    "-ErrorAction SilentlyContinue | Select-Object InstanceName, CurrentTemperature | ConvertTo-Json -Compress"
                )
                proc = subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                    capture_output=True,
                    text=True,
                    timeout=2.5,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    raw_data = json.loads(proc.stdout.strip())
                    items = raw_data if isinstance(raw_data, list) else [raw_data]
                    for item in items:
                        raw_k = item.get("CurrentTemperature")
                        name_str = item.get("InstanceName", "ACPI_ThermalZone")
                        if raw_k is not None:
                            kelvin_tenths = float(raw_k)
                            celsius = round((kelvin_tenths / 10.0) - 273.15, 1)
                            zones.append({
                                "zone": name_str,
                                "temperature_c": celsius,
                                "raw_tenths_kelvin": kelvin_tenths,
                            })
                    if zones:
                        return zones
            except Exception:
                pass

        return zones

    def inspect(self, ttl: float = 60.0) -> HardwareTelemetry:
        """
        Compiles complete hardware telemetry snapshot and computes
        optimal model execution routing profiles.
        """
        now = time.time()
        if hasattr(self, "_cached_telemetry") and hasattr(self, "_cached_time"):
            if now - self._cached_time < ttl:
                return self._cached_telemetry

        logical_cores, physical_cores, cpu_usage = self.get_cpu_telemetry()
        ram_total, ram_free, ram_used, ram_pct = self.get_system_ram()
        gpus = self.get_nvidia_gpus()

        primary_gpu = gpus[0] if gpus else GpuDevice(0, "None", 0.0, 0.0, 0.0)
        vram_total = primary_gpu.vram_total_mb
        vram_free = primary_gpu.vram_free_mb

        # Calculate routing profile & local LLM capability
        if vram_free >= 12000.0:
            recommended_profile = "LOCAL_MAX_14B_32B"
            local_capable = True
            local_model = "qwen2.5-coder:14b"
        elif vram_free >= 6500.0:
            recommended_profile = "LOCAL_OPTIMAL_7B_8B"
            local_capable = True
            local_model = "qwen2.5-coder:7b"
        elif vram_free >= 3500.0:
            recommended_profile = "LOCAL_LIGHTWEIGHT_3B"
            local_capable = True
            local_model = "llama3.2:3b"
        elif ram_free >= 16000.0 and logical_cores >= 8:
            recommended_profile = "LOCAL_CPU_OFFLOAD_7B"
            local_capable = True
            local_model = "qwen2.5-coder:7b"
        else:
            recommended_profile = "CLOUD_ROUTING_FREE_TIER"
            local_capable = False
            local_model = None

        # Query GPU temperature and ACPI thermal zones
        gpu_temp = primary_gpu.temperature_c if hasattr(primary_gpu, "temperature_c") and primary_gpu.temperature_c is not None else self.get_nvml_gpu_temperature(0)
        thermal_zones = self.get_thermal_zones()
        cpu_temp: Optional[float] = None
        if thermal_zones:
            valid_readings = [z["temperature_c"] for z in thermal_zones if isinstance(z.get("temperature_c"), (int, float)) and 0 < z["temperature_c"] < 150]
            if valid_readings:
                cpu_temp = round(sum(valid_readings) / len(valid_readings), 1)

        result = HardwareTelemetry(
            timestamp=time.time(),
            platform=f"{platform.system()} {platform.release()} ({platform.machine()})",
            cpu_cores_logical=logical_cores,
            cpu_cores_physical=physical_cores,
            cpu_percent=cpu_usage,
            ram_total_mb=ram_total,
            ram_free_mb=ram_free,
            ram_used_mb=ram_used,
            ram_percent=ram_pct,
            gpus=[asdict(g) for g in gpus],
            primary_gpu_name=primary_gpu.name,
            primary_vram_total_mb=vram_total,
            primary_vram_free_mb=vram_free,
            recommended_profile=recommended_profile,
            local_llm_capable=local_capable,
            recommended_local_model=local_model,
            gpu_temperature_c=gpu_temp,
            cpu_temperature_c=cpu_temp,
            thermal_zones=thermal_zones,
        )
        self._cached_telemetry = result
        self._cached_time = now
        return result


_inspector = HardwareInspector()


def get_hardware_telemetry() -> HardwareTelemetry:
    """Returns real-time hardware telemetry and compute profile recommendation."""
    return _inspector.inspect()
