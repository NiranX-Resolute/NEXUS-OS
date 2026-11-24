import ctypes
from ctypes import wintypes
import sys
import os

class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ('cb', wintypes.DWORD),
        ('lpReserved', wintypes.LPWSTR),
        ('lpDesktop', wintypes.LPWSTR),
        ('lpTitle', wintypes.LPWSTR),
        ('dwX', wintypes.DWORD),
        ('dwY', wintypes.DWORD),
        ('dwXSize', wintypes.DWORD),
        ('dwYSize', wintypes.DWORD),
        ('dwXCountChars', wintypes.DWORD),
        ('dwYCountChars', wintypes.DWORD),
        ('dwFillAttribute', wintypes.DWORD),
        ('dwFlags', wintypes.DWORD),
        ('wShowWindow', wintypes.WORD),
        ('cbReserved2', wintypes.WORD),
        ('lpReserved2', ctypes.POINTER(ctypes.c_byte)),
        ('hStdInput', wintypes.HANDLE),
        ('hStdOutput', wintypes.HANDLE),
        ('hStdError', wintypes.HANDLE),
    ]

class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('hProcess', wintypes.HANDLE),
        ('hThread', wintypes.HANDLE),
        ('dwProcessId', wintypes.DWORD),
        ('dwThreadId', wintypes.DWORD),
    ]

def launch_on_default_desktop(cmd_line, cwd=None):
    si = STARTUPINFOW()
    si.cb = ctypes.sizeof(STARTUPINFOW)
    si.lpDesktop = "WinSta0\\Default"
    
    pi = PROCESS_INFORMATION()
    
    kernel32 = ctypes.windll.kernel32
    success = kernel32.CreateProcessW(
        None,
        cmd_line,
        None,
        None,
        False,
        0,
        None,
        cwd,
        ctypes.byref(si),
        ctypes.byref(pi)
    )
    if not success:
        err = kernel32.GetLastError()
        print(f"Failed to CreateProcess: error code {err}")
        return None
    print(f"Successfully launched PID {pi.dwProcessId} on WinSta0\\Default!")
    kernel32.CloseHandle(pi.hProcess)
    kernel32.CloseHandle(pi.hThread)
    return pi.dwProcessId

if __name__ == "__main__":
    base_dir = r"C:\Users\NiranX\Documents\antigravity\Nexus Desktop"
    electron_exe = os.path.join(base_dir, "apps", "desktop", "node_modules", "electron", "dist", "electron.exe")
    app_dir = os.path.join(base_dir, "apps", "desktop")
    
    cmd = f'"{electron_exe}" "{app_dir}"'
    if len(sys.argv) > 1:
        cmd = " ".join(sys.argv[1:])
    
    print(f"Executing: {cmd} in {app_dir}")
    launch_on_default_desktop(cmd, cwd=app_dir)
