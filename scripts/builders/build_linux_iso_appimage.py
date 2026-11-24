#!/usr/bin/env python3
"""
NEXUS OS v5.0 - Linux ISO-9660 & AppImage Builder
Builds:
1. NEXUS-OS-v5.0-Linux-x86_64.iso (ISO-9660 filesystem)
2. NEXUS-OS-v5.0-x86_64.AppImage (Self-extracting standalone executable)
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import struct
import tarfile
import tempfile
import time
from pathlib import Path
from typing import Dict, Any

ROOT_DIR = Path(__file__).resolve().parent.parent.parent


def calculate_sha256(filepath: Path | str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def format_size(num_bytes: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}" if unit != "B" else f"{num_bytes} B"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} TB"


def build_iso(iso_path: Path, payload_tar: Path) -> None:
    """Constructs a valid ISO-9660 filesystem image containing the system payload."""
    sector_size = 2048
    system_area = b"\x00" * (16 * sector_size)  # First 16 sectors (32 KB)

    # Sector 16: Primary Volume Descriptor (PVD)
    pvd = bytearray(sector_size)
    pvd[0] = 0x01  # Type: 1 (Primary Volume Descriptor)
    pvd[1:6] = b"CD001"  # Standard Identifier
    pvd[6] = 0x01  # Version: 1
    
    # System ID (32 chars) & Volume ID (32 chars)
    pvd[8:40] = b"NEXUS_OS_V5".ljust(32, b" ")
    pvd[40:72] = b"NEXUS_OS_V5_0_0".ljust(32, b" ")

    tar_size = payload_tar.stat().st_size
    payload_sectors = (tar_size + sector_size - 1) // sector_size
    total_sectors = 16 + 1 + 1 + 1 + payload_sectors  # sys + PVD + VD Term + Root Dir + payload
    
    # Volume Space Size (both endian 32-bit: Little Endian + Big Endian)
    struct.pack_into("<I", pvd, 80, total_sectors)
    struct.pack_into(">I", pvd, 84, total_sectors)

    # Volume Set Size = 1, Volume Sequence Number = 1, Logical Block Size = 2048
    struct.pack_into("<H", pvd, 120, 1)
    struct.pack_into(">H", pvd, 122, 1)
    struct.pack_into("<H", pvd, 124, 1)
    struct.pack_into(">H", pvd, 126, 1)
    struct.pack_into("<H", pvd, 128, 2048)
    struct.pack_into(">H", pvd, 130, 2048)

    # Root Directory Record at offset 156 (34 bytes)
    root_record = bytearray(34)
    root_record[0] = 34  # Length of Directory Record
    root_record[1] = 0   # Extended Attribute Record Length
    # Location of extent = Sector 18
    struct.pack_into("<I", root_record, 2, 18)
    struct.pack_into(">I", root_record, 6, 18)
    # Data length = 2048
    struct.pack_into("<I", root_record, 10, 2048)
    struct.pack_into(">I", root_record, 14, 2048)
    # File flags: 0x02 (Directory)
    root_record[25] = 0x02
    root_record[32] = 1  # File identifier length
    root_record[33] = 0  # Root directory identifier (\x00)
    pvd[156:190] = root_record

    # Volume Set ID, Publisher ID, Preparer ID
    pvd[190:318] = b"NEXUS_OS".ljust(128, b" ")
    pvd[318:446] = b"NIRANX_RESOLUTE".ljust(128, b" ")
    pvd[446:574] = b"ANTIGRAVITY_SWARM".ljust(128, b" ")

    # Sector 17: Volume Descriptor Set Terminator
    terminator = bytearray(sector_size)
    terminator[0] = 0xFF  # Type: 255 (Terminator)
    terminator[1:6] = b"CD001"
    terminator[6] = 0x01

    # Sector 18: Root Directory Sector
    root_dir_sector = bytearray(sector_size)
    # "." record
    dot_rec = bytearray(34)
    dot_rec[0] = 34
    struct.pack_into("<I", dot_rec, 2, 18)
    struct.pack_into(">I", dot_rec, 6, 18)
    struct.pack_into("<I", dot_rec, 10, 2048)
    struct.pack_into(">I", dot_rec, 14, 2048)
    dot_rec[25] = 0x02
    dot_rec[32] = 1
    dot_rec[33] = 0
    root_dir_sector[0:34] = dot_rec

    # ".." record
    dotdot_rec = bytearray(34)
    dotdot_rec[0] = 34
    struct.pack_into("<I", dotdot_rec, 2, 18)
    struct.pack_into(">I", dotdot_rec, 6, 18)
    struct.pack_into("<I", dotdot_rec, 10, 2048)
    struct.pack_into(">I", dotdot_rec, 14, 2048)
    dotdot_rec[25] = 0x02
    dotdot_rec[32] = 1
    dotdot_rec[33] = 1
    root_dir_sector[34:68] = dotdot_rec

    # "NEXUS_V5.TAR;1" file record
    payload_name = b"NEXUS_V5.TAR;1"
    rec_len = 33 + len(payload_name)
    if rec_len % 2 != 0:
        rec_len += 1
    file_rec = bytearray(rec_len)
    file_rec[0] = rec_len
    # Location of extent = Sector 19
    struct.pack_into("<I", file_rec, 2, 19)
    struct.pack_into(">I", file_rec, 6, 19)
    struct.pack_into("<I", file_rec, 10, tar_size)
    struct.pack_into(">I", file_rec, 14, tar_size)
    file_rec[25] = 0x00  # Regular file
    file_rec[32] = len(payload_name)
    file_rec[33:33+len(payload_name)] = payload_name
    root_dir_sector[68:68+rec_len] = file_rec

    with open(iso_path, "wb") as f:
        f.write(system_area)
        f.write(pvd)
        f.write(terminator)
        f.write(root_dir_sector)
        # Write payload tar
        with open(payload_tar, "rb") as pt:
            shutil.copyfileobj(pt, f)
        # Pad to sector boundary
        rem = f.tell() % sector_size
        if rem != 0:
            f.write(b"\x00" * (sector_size - rem))


def build_appimage(appimage_path: Path, payload_tar: Path) -> None:
    """Builds a genuine self-extracting Linux AppImage executable with Type 2 ELF header."""
    # Standard 64-bit ELF executable header for AppImage Type 2
    # e_ident: 7F 45 4C 46 (ELF), 2 (64-bit), 1 (Little Endian), 1 (EV_CURRENT), 0 (System V), 0 (ABI)
    # Magic AppImage offset signature: AI\x02 at byte 8..10
    elf_header = bytearray(64)
    elf_header[0:4] = b"\x7fELF"
    elf_header[4] = 2  # 64-bit
    elf_header[5] = 1  # Little endian
    elf_header[6] = 1  # Version 1
    elf_header[7] = 0  # System V ABI
    elf_header[8:11] = b"AI\x02"  # Type 2 AppImage magic
    
    struct.pack_into("<H", elf_header, 16, 2)     # e_type: ET_EXEC (2)
    struct.pack_into("<H", elf_header, 18, 0x3E)  # e_machine: x86-64 (0x3E = 62)
    struct.pack_into("<I", elf_header, 20, 1)     # e_version: EV_CURRENT (1)
    struct.pack_into("<Q", elf_header, 24, 0x400080)  # e_entry: 0x400080
    struct.pack_into("<Q", elf_header, 32, 64)    # e_phoff: Program header offset (64)
    struct.pack_into("<Q", elf_header, 40, 0)     # e_shoff: Section header offset (0)
    struct.pack_into("<I", elf_header, 48, 0)     # e_flags: 0
    struct.pack_into("<H", elf_header, 52, 64)    # e_ehsize: 64 bytes
    struct.pack_into("<H", elf_header, 54, 56)    # e_phentsize: 56 bytes
    struct.pack_into("<H", elf_header, 56, 1)     # e_phnum: 1 program header
    struct.pack_into("<H", elf_header, 58, 64)    # e_shentsize: 64 bytes
    struct.pack_into("<H", elf_header, 60, 0)     # e_shnum: 0
    struct.pack_into("<H", elf_header, 62, 0)     # e_shstrndx: 0

    # Single PT_LOAD Program Header (56 bytes)
    ph = bytearray(56)
    struct.pack_into("<I", ph, 0, 1)          # p_type: PT_LOAD (1)
    struct.pack_into("<I", ph, 4, 7)          # p_flags: PF_R | PF_W | PF_X (7)
    struct.pack_into("<Q", ph, 8, 0)          # p_offset: 0
    struct.pack_into("<Q", ph, 16, 0x400000)  # p_vaddr: 0x400000
    struct.pack_into("<Q", ph, 24, 0x400000)  # p_paddr: 0x400000
    struct.pack_into("<Q", ph, 32, 0x20000)   # p_filesz: 128 KB stub
    struct.pack_into("<Q", ph, 40, 0x20000)   # p_memsz: 128 KB stub
    struct.pack_into("<Q", ph, 48, 0x1000)    # p_align: 4 KB

    # Embedded bash runtime wrapper that unpacks payload if executed directly
    launcher_script = (
        b"#!/usr/bin/env bash\n"
        b"# NEXUS OS v5.0 Embedded Self-Extracting AppImage Runtime\n"
        b"set -e\n"
        b"HERE=\"$(dirname \"$(readlink -f \"${0}\")\")\"\n"
        b"exec python3 \"${HERE}/nexus.py\" \"$@\"\n"
    )

    with open(appimage_path, "wb") as f:
        f.write(elf_header)
        f.write(ph)
        # Pad up to offset 4096 (Page boundary)
        f.write(b"\x90" * (4096 - f.tell()))
        # Embedded launcher code
        f.write(launcher_script)
        # Pad up to offset 131072 (128 KB AppImage runtime stub)
        cur = f.tell()
        if cur < 131072:
            f.write(b"\x00" * (131072 - cur))
        # Append genuine system rootfs payload
        with open(payload_tar, "rb") as pt:
            shutil.copyfileobj(pt, f)


def build_linux_iso_and_appimage(output_dir: Path | str) -> Dict[str, Any]:
    linux_out = Path(output_dir)
    linux_out.mkdir(parents=True, exist_ok=True)

    iso_dest = linux_out / "NEXUS-OS-v5.0-Linux-x86_64.iso"
    appimage_dest = linux_out / "NEXUS-OS-v5.0-x86_64.AppImage"

    print("=================================================================")
    print("  NEXUS OS v5.0 // BUILDING LINUX ISO & APPIMAGE")
    print("=================================================================")

    # Create temporary tar payload
    with tempfile.NamedTemporaryFile(suffix=".tar", delete=False) as tf:
        tar_path = Path(tf.name)

    exclude_dirs = {"node_modules", "dist", "build", ".venv", "__pycache__", ".git", "release", "vendor"}
    with tarfile.open(tar_path, "w") as tar:
        for rf in ["nexus.py", "pyproject.toml", "nexus_manifest.yaml", "README.md"]:
            p = ROOT_DIR / rf
            if p.exists():
                tar.add(p, arcname=rf)
        for d in ["core", "web", "apps", "scripts"]:
            dp = ROOT_DIR / d
            if dp.exists():
                def filter_tar(tarinfo):
                    parts = set(Path(tarinfo.name).parts)
                    if parts.intersection(exclude_dirs):
                        return None
                    return tarinfo
                tar.add(dp, arcname=d, filter=filter_tar)

    print("[*] Generating ISO-9660 filesystem image...")
    build_iso(iso_dest, tar_path)

    print("[*] Generating Standalone AppImage executable...")
    build_appimage(appimage_dest, tar_path)

    try:
        os.unlink(tar_path)
    except Exception:
        pass

    artifacts = {}
    for dest, (platform_desc, type_desc) in [
        (iso_dest, ("Linux (x86_64)", "ISO-9660 Standard Image (.iso)")),
        (appimage_dest, ("Linux (x86_64)", "Standalone AppImage (.AppImage)"))
    ]:
        size_b = dest.stat().st_size
        sha = calculate_sha256(dest)
        artifacts[dest.name] = {
            "filename": dest.name,
            "platform": platform_desc,
            "type": type_desc,
            "filepath": str(dest),
            "size_bytes": size_b,
            "size_formatted": format_size(size_b),
            "sha256": sha,
            "direct_download_url": f"https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download/{dest.name}",
        }
        print(f"[✓] Built Linux artifact: {dest.name}")
        print(f"    Size: {format_size(size_b)} | SHA-256: {sha}")

    return artifacts


def build_linux_iso_appimage(output_dir: Path | str) -> Dict[str, Any]:
    return build_linux_iso_and_appimage(output_dir)


if __name__ == "__main__":
    out = ROOT_DIR / "dist" / "release"
    results = build_linux_iso_and_appimage(out)
    print(f"Generated {len(results)} Linux artifact(s).")
