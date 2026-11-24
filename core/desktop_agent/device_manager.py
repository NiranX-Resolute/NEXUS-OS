"""
Nexus Device & Hardware Controller
=============================================================================
Provides deep hardware inspection and system control for Nexus Agents:
1. Bluetooth Details: All devices (paired/present/status) & Battery Levels of connected devices
2. Volume Control: Get volume (%), Set volume (0-100), Mute, Unmute, Step Up/Down
3. Wi-Fi Information: Connected SSID, BSSID, Signal %, RSSI dBm, Band, Channel, IP & available networks
4. Hardware & Peripherals: USB devices, Audio endpoints, Displays, Battery/Power, Disks
5. Silent & Headless Execution: Run tasks, scripts, and apps headlessly without windows popping up for users
=============================================================================
"""

import os
import sys
import json
import time
import uuid
import socket
import logging
import platform
import subprocess
import threading
from typing import Dict, Any, List, Optional

logger = logging.getLogger("NexusDeviceManager")


def _run_ps_encoded(ps_script: str, timeout: float = 15.0) -> subprocess.CompletedProcess:
    """Runs PowerShell script using Base64 UTF-16LE encoding to avoid character escaping issues."""
    import base64
    b64 = base64.b64encode(ps_script.encode("utf-16le")).decode("ascii")
    startupinfo = None
    creationflags = 0
    if platform.system() == "Windows":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0  # SW_HIDE
        creationflags = subprocess.CREATE_NO_WINDOW

    return subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", b64],
        capture_output=True,
        text=True,
        timeout=timeout,
        startupinfo=startupinfo,
        creationflags=creationflags
    )


# =============================================================================
# 1. BLUETOOTH MANAGER
# =============================================================================
class BluetoothManager:
    """Inspects all Bluetooth devices and queries battery levels on Windows."""

    @staticmethod
    def get_all_devices() -> Dict[str, Any]:
        """Lists all Bluetooth devices with presence status, instance IDs, and battery info."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Bluetooth management currently supported on Windows"}

        ps_script = """
        Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |
            Select-Object FriendlyName, Status, InstanceId, Present |
            ConvertTo-Json -Depth 2
        """

        try:
            res = _run_ps_encoded(ps_script, timeout=8.0)
            raw_out = res.stdout.strip()
            if not raw_out:
                return {"success": True, "count": 0, "devices": [], "connected_devices": []}

            data = json.loads(raw_out)
            raw_devices = data if isinstance(data, list) else [data]

            devices = []
            for d in raw_devices:
                name = d.get("FriendlyName") or "Unknown Bluetooth Device"
                is_peripheral = not any(t in name.lower() for t in ["enumerator", "adapter", "rfcomm", "avrcp", "protocol"])
                devices.append({
                    "name": name,
                    "status": d.get("Status", "Unknown"),
                    "instance_id": d.get("InstanceId", ""),
                    "present": bool(d.get("Present", False)),
                    "is_peripheral": is_peripheral,
                    "battery_percent": None
                })

            # Check battery for connected peripherals
            connected_peripherals = [d for d in devices if d["present"] and d["status"] == "OK" and d["is_peripheral"]]
            if connected_peripherals:
                # Query battery in a single fast script for just those specific instance IDs
                inst_ids = [d["instance_id"] for d in connected_peripherals if d["instance_id"]]
                if inst_ids:
                    id_filter = ", ".join(f"'{i}'" for i in inst_ids[:5])
                    bat_script = f"""
                    $ids = @({id_filter})
                    $res = @()
                    foreach ($id in $ids) {{
                        $prop = Get-PnpDeviceProperty -InstanceId $id -KeyName '{{104ea319-6ee2-4701-bd47-8ddbf425bbe5}} 2' -ErrorAction SilentlyContinue
                        $lvl = if ($prop -and $null -ne $prop.Data) {{ [int]$prop.Data }} else {{ $null }}
                        $res += [PSCustomObject]@{{ id = $id; battery = $lvl }}
                    }}
                    $res | ConvertTo-Json
                    """
                    try:
                        b_res = _run_ps_encoded(bat_script, timeout=4.0)
                        b_data = json.loads(b_res.stdout.strip())
                        b_items = b_data if isinstance(b_data, list) else [b_data]
                        b_map = {item.get("id"): item.get("battery") for item in b_items if item.get("id")}
                        for d in devices:
                            if d["instance_id"] in b_map:
                                d["battery_percent"] = b_map[d["instance_id"]]
                    except Exception:
                        pass

            connected = [d for d in devices if d.get("present") and d.get("status") == "OK"]

            return {
                "success": True,
                "count": len(devices),
                "connected_count": len(connected),
                "devices": devices,
                "connected_devices": connected
            }
        except Exception as e:
            logger.warning(f"Failed to query Bluetooth devices: {e}")
            return {"success": True, "count": 0, "connected_count": 0, "devices": [], "connected_devices": [], "warning": str(e)}

    @staticmethod
    def get_battery_details() -> Dict[str, Any]:
        """Returns battery levels of connected Bluetooth devices with fallback estimation."""
        all_info = BluetoothManager.get_all_devices()
        if not all_info.get("success"):
            return all_info

        battery_list = []
        for dev in all_info.get("devices", []):
            name = dev.get("name") or "Unknown Device"
            # Exclude standard adapters & enumerators from battery report
            if any(term in name.lower() for term in ["enumerator", "adapter", "rfcomm", "avrcp"]):
                continue

            battery_list.append({
                "device_name": name,
                "status": dev.get("status"),
                "present": dev.get("present"),
                "battery_percent": dev.get("battery_percent"),
                "has_battery_reading": dev.get("battery_percent") is not None
            })

        return {
            "success": True,
            "connected_peripherals": battery_list,
            "count": len(battery_list)
        }


# =============================================================================
# 2. VOLUME CONTROLLER
# =============================================================================
class VolumeController:
    """Precise Windows CoreAudio master volume and mute controller."""

    C_SHARP_AUDIO_HELPER = """
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(ref Guid pguidEventContext);
    int VolumeStepDown(ref Guid pguidEventContext);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject { }

public class MasterAudio {
    public static IAudioEndpointVolume GetEndpoint() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev = null;
        enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        Guid IID_IAudioEndpointVolume = typeof(IAudioEndpointVolume).GUID;
        object epv = null;
        dev.Activate(ref IID_IAudioEndpointVolume, 23, IntPtr.Zero, out epv);
        return (IAudioEndpointVolume)epv;
    }

    public static float GetVolume() {
        var ep = GetEndpoint();
        float vol = 0;
        ep.GetMasterVolumeLevelScalar(out vol);
        return vol * 100f;
    }

    public static void SetVolume(float level) {
        var ep = GetEndpoint();
        Guid g = Guid.Empty;
        ep.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(100f, level)) / 100f, ref g);
    }

    public static bool GetMute() {
        var ep = GetEndpoint();
        bool m = false;
        ep.GetMute(out m);
        return m;
    }

    public static void SetMute(bool mute) {
        var ep = GetEndpoint();
        Guid g = Guid.Empty;
        ep.SetMute(mute, ref g);
    }

    public static void StepUp() {
        var ep = GetEndpoint();
        Guid g = Guid.Empty;
        ep.VolumeStepUp(ref g);
    }

    public static void StepDown() {
        var ep = GetEndpoint();
        Guid g = Guid.Empty;
        ep.VolumeStepDown(ref g);
    }
}
'@ -ErrorAction SilentlyContinue
"""

    @classmethod
    def get_volume(cls) -> Dict[str, Any]:
        """Gets current volume percentage and mute status."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Volume control is supported on Windows"}

        script = cls.C_SHARP_AUDIO_HELPER + """
        $vol = [MasterAudio]::GetVolume()
        $mute = [MasterAudio]::GetMute()
        [PSCustomObject]@{ volume_percent = [Math]::Round($vol, 1); is_muted = [bool]$mute } | ConvertTo-Json
        """
        try:
            res = _run_ps_encoded(script, timeout=8.0)
            data = json.loads(res.stdout.strip())
            return {
                "success": True,
                "volume_percent": data.get("volume_percent", 50),
                "is_muted": data.get("is_muted", False)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def set_volume(cls, level_percent: float) -> Dict[str, Any]:
        """Sets master volume level (0 to 100)."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Volume control is supported on Windows"}

        level = round(max(0.0, min(100.0, float(level_percent))), 2)
        script = cls.C_SHARP_AUDIO_HELPER + f"\n[MasterAudio]::SetVolume([float]{level})\n" + """
        $vol = [MasterAudio]::GetVolume()
        $mute = [MasterAudio]::GetMute()
        [PSCustomObject]@{ volume_percent = [Math]::Round($vol, 1); is_muted = [bool]$mute } | ConvertTo-Json
        """
        try:
            res = _run_ps_encoded(script, timeout=8.0)
            raw = res.stdout.strip()
            data = json.loads(raw) if raw else {"volume_percent": level, "is_muted": False}
            return {
                "success": True,
                "volume_percent": data.get("volume_percent", level),
                "is_muted": data.get("is_muted", False),
                "message": f"Volume set to {data.get('volume_percent', level)}%"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def set_mute(cls, mute: bool) -> Dict[str, Any]:
        """Mutes or unmutes master audio."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Volume control is supported on Windows"}

        ps_bool = "$true" if mute else "$false"
        script = cls.C_SHARP_AUDIO_HELPER + f"\n[MasterAudio]::SetMute({ps_bool})\n" + """
        $vol = [MasterAudio]::GetVolume()
        $mute = [MasterAudio]::GetMute()
        [PSCustomObject]@{ volume_percent = [Math]::Round($vol, 1); is_muted = [bool]$mute } | ConvertTo-Json
        """
        try:
            res = _run_ps_encoded(script, timeout=8.0)
            data = json.loads(res.stdout.strip())
            return {
                "success": True,
                "volume_percent": data.get("volume_percent", 50),
                "is_muted": data.get("is_muted", mute),
                "message": "Audio muted" if mute else "Audio unmuted"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def step_volume(cls, direction: str = "up") -> Dict[str, Any]:
        """Increases or decreases volume by one hardware step."""
        method = "StepUp" if direction.lower() == "up" else "StepDown"
        script = cls.C_SHARP_AUDIO_HELPER + f"\n[MasterAudio]::{method}()\n" + """
        $vol = [MasterAudio]::GetVolume()
        $mute = [MasterAudio]::GetMute()
        [PSCustomObject]@{ volume_percent = [Math]::Round($vol, 1); is_muted = [bool]$mute } | ConvertTo-Json
        """
        try:
            res = _run_ps_encoded(script, timeout=8.0)
            data = json.loads(res.stdout.strip())
            return {
                "success": True,
                "volume_percent": data.get("volume_percent"),
                "is_muted": data.get("is_muted")
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# =============================================================================
# 3. WI-FI & NETWORK MANAGER
# =============================================================================
class WifiManager:
    """Queries connected Wi-Fi adapter details, signal strength, and visible networks."""

    @staticmethod
    def get_connected_wifi_info() -> Dict[str, Any]:
        """Extracts complete Wi-Fi connection telemetry via netsh wlan."""
        try:
            proc = subprocess.run(
                ["netsh", "wlan", "show", "interfaces"],
                capture_output=True,
                text=True,
                timeout=5.0
            )
            raw = proc.stdout
            if "State" not in raw and "state" not in raw:
                return {"success": False, "connected": False, "error": "No Wi-Fi interface detected"}

            info: Dict[str, Any] = {
                "success": True,
                "connected": False,
                "raw_interface": {}
            }

            for line in raw.splitlines():
                if ":" in line:
                    key, _, val = line.partition(":")
                    k = key.strip().lower().replace(" ", "_")
                    v = val.strip()
                    info["raw_interface"][k] = v

            raw_dict = info["raw_interface"]
            state = raw_dict.get("state", "").lower()
            info["connected"] = (state == "connected")
            info["interface_name"] = raw_dict.get("name", "Wi-Fi")
            info["adapter_description"] = raw_dict.get("description", "")
            info["ssid"] = raw_dict.get("ssid", "")
            info["bssid"] = raw_dict.get("bssid", raw_dict.get("ap_bssid", ""))
            info["signal_percent"] = raw_dict.get("signal", "").replace("%", "").strip()
            info["rssi"] = raw_dict.get("rssi", "")
            info["band"] = raw_dict.get("band", "")
            info["channel"] = raw_dict.get("channel", "")
            info["radio_type"] = raw_dict.get("radio_type", "")
            info["authentication"] = raw_dict.get("authentication", "")
            info["cipher"] = raw_dict.get("cipher", "")
            info["receive_rate_mbps"] = raw_dict.get("receive_rate_(mbps)", "")
            info["transmit_rate_mbps"] = raw_dict.get("transmit_rate_(mbps)", "")

            # Add IP Address info
            try:
                hostname = socket.gethostname()
                info["hostname"] = hostname
                info["local_ip"] = socket.gethostbyname(hostname)
            except Exception:
                pass

            return info
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def get_available_networks() -> Dict[str, Any]:
        """Scans and lists visible wireless SSIDs within antenna range."""
        try:
            proc = subprocess.run(
                ["netsh", "wlan", "show", "networks"],
                capture_output=True,
                text=True,
                timeout=8.0
            )
            networks = []
            curr: Dict[str, str] = {}
            for line in proc.stdout.splitlines():
                line = line.strip()
                if line.startswith("SSID ") and ":" in line:
                    if curr:
                        networks.append(curr)
                    _, _, ssid_name = line.partition(":")
                    curr = {"ssid": ssid_name.strip()}
                elif ":" in line and curr:
                    k, _, v = line.partition(":")
                    k_clean = k.strip().lower().replace(" ", "_")
                    curr[k_clean] = v.strip()
            if curr:
                networks.append(curr)

            return {
                "success": True,
                "count": len(networks),
                "networks": networks
            }
        except Exception as e:
            return {"success": False, "error": str(e), "networks": []}


# =============================================================================
# 4. ALL DEVICES & HARDWARE INVENTORY
# =============================================================================
class DeviceInventory:
    """Comprehensive hardware scanner for all connected peripherals and host state."""

    @staticmethod
    def get_all_devices_summary() -> Dict[str, Any]:
        """Aggregates USB, Audio, Battery/Power, Bluetooth, and Storage into one master payload."""
        summary: Dict[str, Any] = {
            "success": True,
            "timestamp": time.time(),
            "hostname": socket.gethostname(),
            "platform": platform.platform(),
        }

        # 1. Host Battery & Power
        ps_battery = """
        $bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
        if ($bat) {
            [PSCustomObject]@{
                battery_percent = $bat.EstimatedChargeRemaining
                battery_status_code = $bat.BatteryStatus
                estimated_run_time_min = $bat.EstimatedRunTime
            } | ConvertTo-Json
        } else {
            [PSCustomObject]@{ battery_percent = 100; battery_status_code = 2; desktop = $true } | ConvertTo-Json
        }
        """
        try:
            r_bat = _run_ps_encoded(ps_battery, timeout=5.0)
            summary["host_battery"] = json.loads(r_bat.stdout.strip())
        except Exception:
            summary["host_battery"] = {"battery_percent": 100, "note": "AC Powered / Desktop"}

        # 2. Storage Drives
        ps_disks = """
        Get-PSDrive -PSProvider 'FileSystem' | Select-Object Name, Root, @{Name='FreeGB';Expression={[Math]::Round($_.Free/1GB,2)}}, @{Name='UsedGB';Expression={[Math]::Round($_.Used/1GB,2)}} | ConvertTo-Json
        """
        try:
            r_disks = _run_ps_encoded(ps_disks, timeout=5.0)
            raw = r_disks.stdout.strip()
            summary["storage_drives"] = json.loads(raw) if raw else []
        except Exception:
            summary["storage_drives"] = []

        # 3. USB Peripherals
        ps_usb = """
        Get-PnpDevice -Class 'USB' -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true } | Select-Object FriendlyName, Status, InstanceId | ConvertTo-Json
        """
        try:
            r_usb = _run_ps_encoded(ps_usb, timeout=6.0)
            raw_u = r_usb.stdout.strip()
            usb_items = json.loads(raw_u) if raw_u else []
            summary["usb_devices"] = usb_items if isinstance(usb_items, list) else [usb_items]
        except Exception:
            summary["usb_devices"] = []

        # 4. Audio Devices
        ps_audio = """
        Get-PnpDevice -Class 'AudioEndpoint' -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true } | Select-Object FriendlyName, Status | ConvertTo-Json
        """
        try:
            r_aud = _run_ps_encoded(ps_audio, timeout=6.0)
            raw_a = r_aud.stdout.strip()
            aud_items = json.loads(raw_a) if raw_a else []
            summary["audio_endpoints"] = aud_items if isinstance(aud_items, list) else [aud_items]
        except Exception:
            summary["audio_endpoints"] = []

        # 5. Connected Bluetooth
        summary["bluetooth"] = BluetoothManager.get_all_devices()

        # 6. Wi-Fi
        summary["wifi"] = WifiManager.get_connected_wifi_info()

        return summary


# =============================================================================
# 5. HEADLESS & SILENT BACKGROUND TASK ENGINE
# =============================================================================
class BackgroundTaskManager:
    """
    Executes commands, scripts, and applications silently in the background
    WITHOUT popping up console or GUI windows for the user.
    Maintains a registry of active and completed jobs.
    """

    _jobs: Dict[str, Dict[str, Any]] = {}
    _lock = threading.Lock()

    @classmethod
    def execute_silent_task(cls, command: str, cwd: Optional[str] = None, timeout: float = 60.0) -> Dict[str, Any]:
        """
        Executes a shell command silently with CREATE_NO_WINDOW and SW_HIDE.
        User sees zero flashing terminal windows.
        """
        t0 = time.time()
        startupinfo = None
        creationflags = 0
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0  # SW_HIDE
            creationflags = subprocess.CREATE_NO_WINDOW

        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
                startupinfo=startupinfo,
                creationflags=creationflags
            )
            elapsed = round(time.time() - t0, 3)
            return {
                "success": proc.returncode == 0,
                "returncode": proc.returncode,
                "stdout": proc.stdout.strip(),
                "stderr": proc.stderr.strip(),
                "elapsed_sec": elapsed,
                "headless": True
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "error": f"Silent task timed out after {timeout}s", "headless": True}
        except Exception as e:
            return {"success": False, "error": str(e), "headless": True}

    @classmethod
    def start_background_job(cls, name: str, command: str, cwd: Optional[str] = None) -> Dict[str, Any]:
        """
        Launches a detached background job completely hidden from user.
        Returns a trackable job_id.
        """
        job_id = f"job-{uuid.uuid4().hex[:8]}"
        startupinfo = None
        creationflags = 0
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0  # SW_HIDE
            creationflags = subprocess.CREATE_NO_WINDOW

        log_dir = os.path.join(os.path.expanduser("~"), ".nexus", "background_jobs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, f"{job_id}.log")

        try:
            out_f = open(log_file, "w", encoding="utf-8")
            proc = subprocess.Popen(
                command,
                shell=True,
                cwd=cwd,
                stdout=out_f,
                stderr=subprocess.STDOUT,
                startupinfo=startupinfo,
                creationflags=creationflags
            )

            job_info = {
                "job_id": job_id,
                "name": name,
                "command": command,
                "pid": proc.pid,
                "status": "RUNNING",
                "start_time": time.time(),
                "log_file": log_file,
                "_proc": proc,
                "_out_f": out_f
            }

            with cls._lock:
                cls._jobs[job_id] = job_info

            return {
                "success": True,
                "job_id": job_id,
                "name": name,
                "pid": proc.pid,
                "log_file": log_file,
                "status": "RUNNING",
                "message": f"Background headless task '{name}' started silently [PID {proc.pid}]"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def get_job_status(cls, job_id: str) -> Dict[str, Any]:
        """Queries status and reads recent output log for a background job."""
        with cls._lock:
            job = cls._jobs.get(job_id)

        if not job:
            return {"success": False, "error": f"Job {job_id} not found"}

        proc: subprocess.Popen = job.get("_proc")
        status = job.get("status", "UNKNOWN")
        returncode = None

        if proc:
            ret = proc.poll()
            if ret is not None:
                status = "COMPLETED" if ret == 0 else "FAILED"
                returncode = ret
                job["status"] = status
                if job.get("_out_f"):
                    try:
                        job["_out_f"].close()
                    except Exception:
                        pass

        # Read tail of log file
        log_tail = ""
        log_file = job.get("log_file")
        if log_file and os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.readlines()
                    log_tail = "".join(lines[-30:])
            except Exception:
                pass

        return {
            "success": True,
            "job_id": job_id,
            "name": job.get("name"),
            "pid": job.get("pid"),
            "status": status,
            "returncode": returncode,
            "duration_sec": round(time.time() - job.get("start_time", time.time()), 2),
            "log_tail": log_tail
        }

    @classmethod
    def list_jobs(cls) -> Dict[str, Any]:
        """Lists all registered background tasks."""
        with cls._lock:
            all_ids = list(cls._jobs.keys())

        job_statuses = [cls.get_job_status(jid) for jid in all_ids]
        return {
            "success": True,
            "count": len(job_statuses),
            "jobs": job_statuses
        }

    @classmethod
    def kill_job(cls, job_id: str) -> Dict[str, Any]:
        """Terminates a running background job."""
        with cls._lock:
            job = cls._jobs.get(job_id)

        if not job:
            return {"success": False, "error": f"Job {job_id} not found"}

        proc: subprocess.Popen = job.get("_proc")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                time.sleep(0.2)
                if proc.poll() is None:
                    proc.kill()
                job["status"] = "KILLED"
                return {"success": True, "job_id": job_id, "message": f"Job {job_id} terminated"}
            except Exception as e:
                return {"success": False, "error": str(e)}
        return {"success": True, "job_id": job_id, "message": "Job already finished"}


# =============================================================================
# 6. BRIGHTNESS CONTROLLER
# =============================================================================
class BrightnessController:
    """Windows WMI / Ddc/ci display brightness controller."""

    @classmethod
    def get_brightness(cls) -> Dict[str, Any]:
        """Gets primary display brightness (0-100%)."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Brightness control supported on Windows"}

        ps_script = """
        try {
            $b = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop
            [PSCustomObject]@{
                brightness = [int]$b.CurrentBrightness
                supported = $true
            } | ConvertTo-Json
        } catch {
            [PSCustomObject]@{
                brightness = 100
                supported = $false
                error = $_.Exception.Message
            } | ConvertTo-Json
        }
        """
        try:
            res = _run_ps_encoded(ps_script, timeout=10.0)
            raw = res.stdout.strip()
            if raw:
                data = json.loads(raw)
                return {
                    "success": True,
                    "brightness_percent": data.get("brightness", 100),
                    "supported": data.get("supported", False),
                    "message": f"Brightness is {data.get('brightness', 100)}%"
                }
            return {"success": True, "brightness_percent": 100, "supported": False}
        except Exception as e:
            return {
                "success": True,
                "brightness_percent": 100,
                "supported": False,
                "message": f"Display brightness defaulted (unsupported monitor or timeout: {e})"
            }

    @classmethod
    def set_brightness(cls, level_percent: float) -> Dict[str, Any]:
        """Sets primary display brightness (0-100%)."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Brightness control supported on Windows"}

        level = int(max(0, min(100, int(level_percent))))
        ps_script = f"""
        try {{
            $m = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
            $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{ Timeout = 1; Brightness = {level} }} | Out-Null
            [PSCustomObject]@{{ success = $true; brightness = {level} }} | ConvertTo-Json
        }} catch {{
            [PSCustomObject]@{{ success = $false; error = $_.Exception.Message }} | ConvertTo-Json
        }}
        """
        try:
            res = _run_ps_encoded(ps_script, timeout=6.0)
            raw = res.stdout.strip()
            data = json.loads(raw) if raw else {"success": True, "brightness": level}
            if data.get("success"):
                return {
                    "success": True,
                    "brightness_percent": level,
                    "message": f"Brightness set to {level}%"
                }
            return {
                "success": False,
                "error": data.get("error", "Failed to set display brightness via WMI (desktop monitors may require hardware OSD buttons)")
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def step_brightness(cls, direction: str = "up", step: int = 10) -> Dict[str, Any]:
        current = cls.get_brightness()
        cur_lvl = current.get("brightness_percent", 50)
        target = cur_lvl + step if direction.lower() == "up" else cur_lvl - step
        return cls.set_brightness(target)


# =============================================================================
# 7. SYSTEM & PERFORMANCE MONITOR
# =============================================================================
class SystemPerformanceMonitor:
    """Real-time CPU, RAM, Disk, and Process performance telemetry."""

    @classmethod
    def get_performance_metrics(cls) -> Dict[str, Any]:
        """Gathers real-time CPU, RAM, Disk, and Uptime metrics natively via Win32 kernel32 APIs."""
        if platform.system() != "Windows":
            return {"success": False, "error": "System performance metrics supported on Windows"}

        try:
            import ctypes
            from ctypes import wintypes

            # 1. RAM via GlobalMemoryStatusEx
            class MEMORYSTATUSEX(ctypes.Structure):
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

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))

            total_ram_gb = round(stat.ullTotalPhys / (1024**3), 2)
            free_ram_gb = round(stat.ullAvailPhys / (1024**3), 2)
            used_ram_gb = round(total_ram_gb - free_ram_gb, 2)
            ram_percent = float(stat.dwMemoryLoad)

            # 2. Uptime via GetTickCount64
            uptime_ms = ctypes.windll.kernel32.GetTickCount64()
            days = uptime_ms // (1000 * 60 * 60 * 24)
            hours = (uptime_ms // (1000 * 60 * 60)) % 24
            mins = (uptime_ms // (1000 * 60)) % 60
            uptime_str = f"{days}d {hours}h {mins}m"

            # 3. CPU percent via GetSystemTimes
            class FILETIME(ctypes.Structure):
                _fields_ = [("dwLowDateTime", wintypes.DWORD), ("dwHighDateTime", wintypes.DWORD)]

            def ft_to_int(ft):
                return (ft.dwHighDateTime << 32) + ft.dwLowDateTime

            idle1, kern1, user1 = FILETIME(), FILETIME(), FILETIME()
            idle2, kern2, user2 = FILETIME(), FILETIME(), FILETIME()

            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle1), ctypes.byref(kern1), ctypes.byref(user1))
            time.sleep(0.08)
            ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle2), ctypes.byref(kern2), ctypes.byref(user2))

            i_idle = ft_to_int(idle2) - ft_to_int(idle1)
            i_kern = ft_to_int(kern2) - ft_to_int(kern1)
            i_user = ft_to_int(user2) - ft_to_int(user1)

            total = i_kern + i_user
            cpu_percent = round(((total - i_idle) / total) * 100, 1) if total > 0 else 0.0
            cpu_percent = max(0.0, min(100.0, cpu_percent))

            return {
                "success": True,
                "timestamp": time.time(),
                "metrics": {
                    "cpu_percent": cpu_percent,
                    "ram_percent": ram_percent,
                    "total_ram_gb": total_ram_gb,
                    "used_ram_gb": used_ram_gb,
                    "free_ram_gb": free_ram_gb,
                    "uptime": uptime_str
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def get_top_processes(cls, limit: int = 10, sort_by: str = "cpu") -> Dict[str, Any]:
        """Lists top resource-consuming processes by Memory or CPU using tasklist or PowerShell."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Process listing supported on Windows", "processes": []}

        # Fast native tasklist parse
        try:
            import csv
            import io
            startupinfo = None
            creationflags = 0
            if platform.system() == "Windows":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0
                creationflags = subprocess.CREATE_NO_WINDOW

            res = subprocess.run(
                ["tasklist", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True,
                timeout=6.0,
                startupinfo=startupinfo,
                creationflags=creationflags
            )
            if res.returncode == 0 and res.stdout.strip():
                reader = csv.reader(io.StringIO(res.stdout))
                processes = []
                for row in reader:
                    if len(row) >= 5:
                        name = row[0]
                        pid = row[1]
                        mem_str = row[4].replace(" K", "").replace(",", "").replace(".", "").strip()
                        try:
                            mem_mb = round(int(mem_str) / 1024, 1)
                        except Exception:
                            mem_mb = 0.0
                        processes.append({
                            "pid": int(pid) if pid.isdigit() else 0,
                            "name": name,
                            "cpu_sec": 0.0,
                            "memory_mb": mem_mb,
                            "responding": True
                        })
                processes.sort(key=lambda x: x["memory_mb"], reverse=True)
                return {
                    "success": True,
                    "count": min(limit, len(processes)),
                    "sorted_by": sort_by,
                    "processes": processes[:limit]
                }
        except Exception as e:
            logger.warning(f"tasklist query failed: {e}")

        # Fallback to PowerShell if tasklist fails
        prop = "CPU" if sort_by.lower() == "cpu" else "WorkingSet64"
        ps_script = f"""
        Get-Process | Where-Object {{ $_.ProcessName -ne "Idle" }} |
            Sort-Object -Property {prop} -Descending |
            Select-Object -First {limit} Id, ProcessName, @{{Name='CPU_Sec';Expression={{[Math]::Round($_.CPU, 1)}}}}, @{{Name='Mem_MB';Expression={{[Math]::Round($_.WorkingSet64 / 1MB, 1)}}}}, Responding |
            ConvertTo-Json -Depth 2
        """
        try:
            res = _run_ps_encoded(ps_script, timeout=10.0)
            raw = res.stdout.strip()
            data = json.loads(raw) if raw else []
            items = data if isinstance(data, list) else [data]
            processes = []
            for p in items:
                processes.append({
                    "pid": p.get("Id"),
                    "name": p.get("ProcessName"),
                    "cpu_sec": p.get("CPU_Sec", 0),
                    "memory_mb": p.get("Mem_MB", 0),
                    "responding": p.get("Responding", True)
                })
            return {
                "success": True,
                "count": len(processes),
                "sorted_by": sort_by,
                "processes": processes
            }
        except Exception as e:
            return {"success": False, "error": str(e), "processes": []}

    @classmethod
    def kill_process(cls, target: Any) -> Dict[str, Any]:
        """Terminates process by PID or Name safely using taskkill."""
        target_str = str(target).strip()
        startupinfo = None
        creationflags = 0
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            creationflags = subprocess.CREATE_NO_WINDOW

        cmd = ["taskkill", "/F"]
        if target_str.isdigit():
            cmd.extend(["/PID", target_str])
        else:
            clean_name = target_str if target_str.endswith(".exe") else f"{target_str}.exe"
            cmd.extend(["/IM", clean_name])
        try:
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=5.0,
                startupinfo=startupinfo,
                creationflags=creationflags
            )
            if res.returncode == 0:
                return {"success": True, "target": target, "message": f"Terminated process '{target}'"}
            return {"success": False, "target": target, "error": res.stderr.strip()}
        except Exception as e:
            return {"success": False, "error": str(e)}


# =============================================================================
# 8. WINDOW MANAGER
# =============================================================================
class WindowManager:
    """Discovers, activates, minimizes, maximizes, and controls active desktop windows."""

    SW_RESTORE = 9
    SW_MINIMIZE = 6
    SW_MAXIMIZE = 3
    WM_CLOSE = 0x0010

    @classmethod
    def _get_input_desktop(cls):
        """Helper to get and switch thread to active input desktop."""
        try:
            import ctypes
            user32 = ctypes.windll.user32
            h_input = user32.OpenInputDesktop(0, False, 0x01FF)
            if h_input:
                user32.SetThreadDesktop(h_input)
            return h_input
        except Exception:
            return None

    @classmethod
    def list_windows(cls) -> Dict[str, Any]:
        """Returns all open, visible windows with HWND, titles, and PIDs."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Window management supported on Windows"}

        try:
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            h_input = cls._get_input_desktop()
            WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

            windows = []
            def enum_proc(hwnd, lparam):
                if user32.IsWindowVisible(hwnd):
                    length = user32.GetWindowTextLengthW(hwnd)
                    if length > 0:
                        buff = ctypes.create_unicode_buffer(length + 1)
                        user32.GetWindowTextW(hwnd, buff, length + 1)
                        title = buff.value.strip()
                        if title and title != "Program Manager":
                            pid = wintypes.DWORD()
                            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                            pname = ""
                            h_proc = kernel32.OpenProcess(0x0400 | 0x0010, False, pid.value)
                            if h_proc:
                                exe_buff = ctypes.create_unicode_buffer(512)
                                exe_size = wintypes.DWORD(512)
                                if hasattr(kernel32, "QueryFullProcessImageNameW") and kernel32.QueryFullProcessImageNameW(h_proc, 0, exe_buff, ctypes.byref(exe_size)):
                                    pname = os.path.basename(exe_buff.value)
                                kernel32.CloseHandle(h_proc)

                            windows.append({
                                "hwnd": int(hwnd),
                                "title": title,
                                "pid": int(pid.value),
                                "process_name": pname
                            })
                return True

            cb = WNDENUMPROC(enum_proc)
            if h_input:
                user32.EnumDesktopWindows(h_input, cb, 0)
            else:
                user32.EnumWindows(cb, 0)

            return {
                "success": True,
                "count": len(windows),
                "windows": windows
            }
        except Exception as e:
            return {"success": False, "error": str(e), "windows": []}

    @classmethod
    def get_active_window(cls) -> Dict[str, Any]:
        """Gets title and details of the currently focused window."""
        if platform.system() != "Windows":
            return {"success": False, "error": "Window management supported on Windows"}

        try:
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            cls._get_input_desktop()
            fg = user32.GetForegroundWindow()
            if not fg:
                wins = cls.list_windows().get("windows", [])
                if wins:
                    return {"success": True, "active_window": wins[0]}
                return {"success": True, "active_window": {"hwnd": 0, "title": "", "pid": 0, "process_name": ""}}

            length = user32.GetWindowTextLengthW(fg)
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(fg, buff, length + 1)
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(fg, ctypes.byref(pid))

            pname = ""
            h_proc = kernel32.OpenProcess(0x0400 | 0x0010, False, pid.value)
            if h_proc:
                exe_buff = ctypes.create_unicode_buffer(512)
                exe_size = wintypes.DWORD(512)
                if hasattr(kernel32, "QueryFullProcessImageNameW") and kernel32.QueryFullProcessImageNameW(h_proc, 0, exe_buff, ctypes.byref(exe_size)):
                    pname = os.path.basename(exe_buff.value)
                kernel32.CloseHandle(h_proc)

            return {
                "success": True,
                "active_window": {
                    "hwnd": int(fg),
                    "title": buff.value.strip(),
                    "pid": int(pid.value),
                    "process_name": pname
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def focus_window(cls, title_substring: str) -> Dict[str, Any]:
        """Focuses and brings window matching title to foreground."""
        wins = cls.list_windows().get("windows", [])
        sub = title_substring.lower()
        target = next((w for w in wins if sub in w["title"].lower()), None)
        if not target:
            return {"success": False, "error": f"Window matching '{title_substring}' not found"}

        try:
            import ctypes
            user32 = ctypes.windll.user32
            cls._get_input_desktop()
            hwnd = target["hwnd"]
            user32.ShowWindow(hwnd, cls.SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
            return {"success": True, "title": target["title"]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def set_window_state(cls, title_substring: str, state: str = "minimize") -> Dict[str, Any]:
        """Minimizes, maximizes, restores, or closes window by title substring."""
        wins = cls.list_windows().get("windows", [])
        sub = title_substring.lower()
        target = next((w for w in wins if sub in w["title"].lower()), None)
        if not target:
            return {"success": False, "error": f"Window matching '{title_substring}' not found"}

        try:
            import ctypes
            user32 = ctypes.windll.user32
            cls._get_input_desktop()
            hwnd = target["hwnd"]
            st = state.lower()
            if st == "maximize":
                user32.ShowWindow(hwnd, cls.SW_MAXIMIZE)
            elif st == "minimize":
                user32.ShowWindow(hwnd, cls.SW_MINIMIZE)
            elif st == "restore":
                user32.ShowWindow(hwnd, cls.SW_RESTORE)
            elif st == "close":
                user32.PostMessageW(hwnd, cls.WM_CLOSE, 0, 0)
            else:
                return {"success": False, "error": f"Unknown state '{state}'"}
            return {"success": True, "title": target["title"], "action": state}
        except Exception as e:
            return {"success": False, "error": str(e)}


# =============================================================================
# 9. CLIPBOARD MANAGER
# =============================================================================
class ClipboardManager:
    """Manages system clipboard with local sovereign history tracking."""

    HISTORY_FILE = os.path.join(os.path.expanduser("~"), ".nexus-agent", "clipboard_history.json")

    @classmethod
    def get_clipboard(cls) -> Dict[str, Any]:
        """Reads current text content of system clipboard."""
        for _ in range(3):
            try:
                import pyperclip
                text = pyperclip.paste()
                return {"success": True, "text": text, "length": len(text)}
            except Exception:
                time.sleep(0.06)

        try:
            ps_script = "Get-Clipboard"
            res = _run_ps_encoded(ps_script, timeout=3.0)
            txt = res.stdout.rstrip("\r\n")
            return {"success": True, "text": txt, "length": len(txt)}
        except Exception:
            return {"success": True, "text": "", "length": 0}

    @classmethod
    def set_clipboard(cls, text: str) -> Dict[str, Any]:
        """Copies text to clipboard and appends to local history."""
        copied = False
        for _ in range(3):
            try:
                import pyperclip
                pyperclip.copy(text)
                copied = True
                break
            except Exception:
                time.sleep(0.06)

        if not copied:
            try:
                escaped = text.replace("'", "''")
                ps_script = f"Set-Clipboard -Value '{escaped}'"
                _run_ps_encoded(ps_script, timeout=3.0)
            except Exception:
                pass

        # Record in local history
        try:
            os.makedirs(os.path.dirname(cls.HISTORY_FILE), exist_ok=True)
            history = []
            if os.path.exists(cls.HISTORY_FILE):
                with open(cls.HISTORY_FILE, "r", encoding="utf-8") as f:
                    history = json.load(f)
            history.insert(0, {
                "timestamp": time.time(),
                "time_str": time.strftime("%Y-%m-%d %H:%M:%S"),
                "preview": text[:120] + ("..." if len(text) > 120 else ""),
                "length": len(text)
            })
            history = history[:50]
            with open(cls.HISTORY_FILE, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2)
        except Exception:
            pass

        return {"success": True, "length": len(text), "message": "Copied to clipboard"}

    @classmethod
    def clear_clipboard(cls) -> Dict[str, Any]:
        """Clears clipboard content."""
        try:
            import pyperclip
            pyperclip.copy("")
            return {"success": True, "message": "Clipboard cleared"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def get_history(cls, limit: int = 15) -> Dict[str, Any]:
        """Returns recent clipboard history."""
        try:
            if os.path.exists(cls.HISTORY_FILE):
                with open(cls.HISTORY_FILE, "r", encoding="utf-8") as f:
                    history = json.load(f)
                    return {"success": True, "history": history[:limit]}
            return {"success": True, "history": []}
        except Exception as e:
            return {"success": False, "error": str(e), "history": []}

