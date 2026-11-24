#!/usr/bin/env python3
"""Nexus OS v5.0 - Stonic / Torvis Binary Asset Extractor.

Scans local system (~/Downloads, ~/Desktop, workspace) for installer binaries:
- Stonic-AI-Setup*.exe
- Torvis-setup*.exe
- Any NSIS / 7-Zip / Electron installer archives

Capabilities:
1. Extraction: Unpacks NSIS/7z archives and Electron app.asar containers using
   system 7z, npx @electron/asar, or built-in pure-Python ASAR/zip decoders.
2. Indexing: Detects audio cues (.wav, .mp3, .ogg, .flac) and script definitions (.js, .py, .json, .sh).
3. Hash Verification: Computes cryptographic SHA-256 hashes for all discovered files.
4. Manifest Compilation: Outputs ~/.nexus-agent/imported_assets/import_manifest.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import zipfile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ASSET-EXTRACTOR] %(message)s",
)
logger = logging.getLogger("nexus.assets.importer")

AUDIO_EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a"}
SCRIPT_EXTENSIONS = {".js", ".mjs", ".ts", ".py", ".json", ".sh", ".ps1", ".bat"}


class ExternalAppImporter:
    """Extracts, indexes, and verifies binary assets from third-party desktop apps."""

    DEFAULT_OUTPUT_DIR = Path.home() / ".nexus-agent" / "imported_assets"

    def __init__(self, output_dir: Optional[Union[str, Path]] = None) -> None:
        if output_dir is None:
            self.output_dir = self.DEFAULT_OUTPUT_DIR
        else:
            self.output_dir = Path(output_dir)

        self.output_dir.mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------------------
    # Cryptographic Hash Helper
    # -------------------------------------------------------------------------
    @staticmethod
    def compute_sha256(file_path: Union[str, Path]) -> str:
        """Computes SHA-256 digest of a target file in 64KB blocks."""
        p = Path(file_path)
        if not p.is_file():
            return ""
        hasher = hashlib.sha256()
        with open(p, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()

    # -------------------------------------------------------------------------
    # Installer Search
    # -------------------------------------------------------------------------
    def find_installers(
        self, search_dirs: Optional[List[Union[str, Path]]] = None
    ) -> List[Path]:
        """
        Scans specified directories for Stonic and Torvis setup executables.
        Defaults to ~/Downloads, ~/Desktop, and the active workspace directory.
        """
        if search_dirs is None:
            dirs = [
                Path.home() / "Downloads",
                Path.home() / "Desktop",
                Path.cwd(),
            ]
        else:
            dirs = [Path(d) for d in search_dirs]

        patterns = [
            "*Stonic*Setup*.exe",
            "*Stonic-AI*.exe",
            "*Stonic*.exe",
            "*Torvis*setup*.exe",
            "*Torvis*.exe",
            "*Setup*.exe",
            "*setup*.exe",
        ]

        found_paths: List[Path] = []
        for d in dirs:
            if not d.exists() or not d.is_dir():
                continue
            for pat in patterns:
                for match in d.glob(pat):
                    if match.is_file() and match not in found_paths:
                        found_paths.append(match)

        def _sort_key(p: Path) -> Tuple[int, str]:
            low = p.name.lower()
            if "stonic" in low:
                pri = 0
            elif "torvis" in low:
                pri = 1
            else:
                pri = 2
            return (pri, low)

        found_paths.sort(key=_sort_key)
        return found_paths

    # -------------------------------------------------------------------------
    # Pure-Python Chromium ASAR Archive Unpacker
    # -------------------------------------------------------------------------
    def unpack_asar(
        self, asar_path: Union[str, Path], dest_dir: Union[str, Path]
    ) -> int:
        """
        Unpacks an Electron app.asar archive directly into dest_dir.
        Uses pure-Python binary parsing of the Chromium ASAR header format:
        [u32 size_header][u32 header_size+8][u32 header_size+4][u32 json_len][JSON string][file payloads]
        """
        asar_p = Path(asar_path)
        dest_p = Path(dest_dir)
        dest_p.mkdir(parents=True, exist_ok=True)

        if not asar_p.is_file():
            return 0

        # Try system npx @electron/asar first if available
        if shutil.which("npx"):
            try:
                proc = subprocess.run(
                    ["npx", "--yes", "@electron/asar", "extract", str(asar_p), str(dest_p)],
                    capture_output=True,
                    text=True,
                    timeout=30.0,
                )
                if proc.returncode == 0:
                    logger.info("Unpacked ASAR via npx @electron/asar.")
                    return sum(1 for _ in dest_p.rglob("*") if _.is_file())
            except Exception as exc:
                logger.debug("npx asar notice (%s); using built-in Python decoder", exc)

        # Built-in Pure-Python ASAR Binary Decoder
        unpacked_count = 0
        try:
            with open(asar_p, "rb") as f:
                header_prefix = f.read(16)
                if len(header_prefix) < 16:
                    return 0

                u1, u2, u3, json_len = struct.unpack("<IIII", header_prefix)
                header_json_bytes = f.read(json_len)
                header_data = json.loads(header_json_bytes.decode("utf-8"))

                base_offset = u2 + 8

                def _extract_tree(node: Dict[str, Any], current_path: Path) -> None:
                    nonlocal unpacked_count
                    current_path.mkdir(parents=True, exist_ok=True)
                    files_dict = node.get("files", {})
                    for name, meta in files_dict.items():
                        child_target = current_path / name
                        if "files" in meta:
                            _extract_tree(meta, child_target)
                        elif "size" in meta and "offset" in meta:
                            offset_val = int(meta["offset"])
                            size_val = int(meta["size"])
                            f.seek(base_offset + offset_val)
                            file_bytes = f.read(size_val)
                            child_target.parent.mkdir(parents=True, exist_ok=True)
                            with open(child_target, "wb") as out_f:
                                out_f.write(file_bytes)
                            unpacked_count += 1

                _extract_tree(header_data, dest_p)
                logger.info("Built-in decoder unpacked %d files from ASAR: %s", unpacked_count, asar_p.name)
        except Exception as exc:
            logger.warning("Pure-Python ASAR unpack exception on '%s': %s", asar_p.name, exc)

        return unpacked_count

    # -------------------------------------------------------------------------
    # Installer Archive Extraction
    # -------------------------------------------------------------------------
    def extract_installer(
        self,
        installer_path: Union[str, Path],
        dest_dir: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """
        Unpacks an installer (.exe / .zip / .7z) into the destination directory.
        Detects 7-Zip, zipfile, and unpacks nested app.asar archives.
        """
        src = Path(installer_path)
        if not src.is_file():
            return {"success": False, "error": f"File not found: {installer_path}"}

        target_dir = Path(dest_dir) if dest_dir else (self.output_dir / src.stem)
        target_dir.mkdir(parents=True, exist_ok=True)

        extraction_tool = "unknown"
        extracted_ok = False

        # 1. Try 7-Zip CLI if available
        seven_zip = shutil.which("7z") or shutil.which("7za")
        if seven_zip:
            try:
                cmd = [seven_zip, "x", "-y", f"-o{target_dir}", str(src)]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60.0)
                if proc.returncode == 0:
                    extraction_tool = "7z"
                    extracted_ok = True
                    logger.info("Extracted '%s' using 7-Zip.", src.name)
            except Exception as exc:
                logger.debug("7z execution notice: %s", exc)

        # 2. Try Python zipfile fallback
        if not extracted_ok:
            try:
                if zipfile.is_zipfile(src):
                    with zipfile.ZipFile(src, "r") as zf:
                        zf.extractall(target_dir)
                    extraction_tool = "zipfile"
                    extracted_ok = True
                    logger.info("Extracted '%s' using Python zipfile.", src.name)
            except Exception as exc:
                logger.debug("zipfile extraction notice: %s", exc)

        # 3. Search and extract nested app.asar archives
        asar_files = list(target_dir.rglob("*.asar"))
        for asar in asar_files:
            unpacked_sub = asar.parent / f"{asar.stem}_unpacked"
            self.unpack_asar(asar, unpacked_sub)

        sha256_map: Dict[str, str] = {}
        for p in target_dir.rglob("*"):
            if p.is_file():
                rel = str(p.relative_to(target_dir)).replace("\\", "/")
                sha256_map[rel] = self.compute_sha256(p)

        total_files = len(sha256_map)
        return {
            "success": extracted_ok or total_files > 0,
            "installer_path": str(src),
            "extracted_dir": str(target_dir),
            "tool_used": extraction_tool,
            "total_files": total_files,
            "extracted_files_count": total_files,
            "sha256_map": sha256_map,
            "asar_archives_unpacked": len(asar_files),
        }

    # -------------------------------------------------------------------------
    # Asset Indexing & Hash Generation
    # -------------------------------------------------------------------------
    def index_extracted_assets(
        self, extracted_root: Union[str, Path]
    ) -> Dict[str, Any]:
        """
        Walks extracted directory, indexing audio cues and scripts with SHA-256 hashes.
        """
        root_p = Path(extracted_root)
        if not root_p.exists() or not root_p.is_dir():
            return {
                "audio_cues": [],
                "scripts": [],
                "total_audio": 0,
                "total_scripts": 0,
                "total_bytes": 0,
            }

        audio_cues: List[Dict[str, Any]] = []
        scripts: List[Dict[str, Any]] = []
        total_bytes = 0

        for file_p in root_p.rglob("*"):
            if not file_p.is_file():
                continue

            ext = file_p.suffix.lower()
            size = file_p.stat().st_size
            rel = str(file_p.relative_to(root_p)).replace("\\", "/")

            if ext in AUDIO_EXTENSIONS:
                sha = self.compute_sha256(file_p)
                audio_cues.append({
                    "name": file_p.name,
                    "rel_path": rel,
                    "full_path": str(file_p),
                    "extension": ext,
                    "size_bytes": size,
                    "sha256": sha,
                    "category": "audio",
                })
                total_bytes += size

            elif ext in SCRIPT_EXTENSIONS:
                sha = self.compute_sha256(file_p)
                scripts.append({
                    "name": file_p.name,
                    "rel_path": rel,
                    "full_path": str(file_p),
                    "extension": ext,
                    "size_bytes": size,
                    "sha256": sha,
                    "category": "script",
                })
                total_bytes += size

        return {
            "audio_cues": audio_cues,
            "scripts": scripts,
            "total_audio": len(audio_cues),
            "total_scripts": len(scripts),
            "total_audio_count": len(audio_cues),
            "total_scripts_count": len(scripts),
            "total_bytes": total_bytes,
        }

    # -------------------------------------------------------------------------
    # Manifest Generation
    # -------------------------------------------------------------------------
    def generate_manifest(
        self,
        installer_path: Optional[Union[str, Path]],
        extracted_root: Union[str, Path],
        output_manifest_path: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """
        Compiles import_manifest.json indexing discovered audio cues and scripts.
        """
        extracted_p = Path(extracted_root)
        indexed = self.index_extracted_assets(extracted_p)

        installer_sha = ""
        if installer_path and Path(installer_path).is_file():
            installer_sha = self.compute_sha256(installer_path)

        manifest = {
            "version": "1.0",
            "extracted_at": time.time(),
            "source_installer": str(Path(installer_path).resolve()) if installer_path else "manual",
            "installer_sha256": installer_sha,
            "extracted_root": str(extracted_p),
            "audio_cues": indexed["audio_cues"],
            "scripts": indexed["scripts"],
            "total_audio_count": indexed["total_audio_count"],
            "total_scripts_count": indexed["total_scripts_count"],
            "total_bytes": indexed["total_bytes"],
        }

        # Write manifest file to disk
        out_path = Path(output_manifest_path) if output_manifest_path else (extracted_p / "import_manifest.json")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        # Also replicate to master output directory if different
        master_manifest = self.output_dir / "import_manifest.json"
        if master_manifest != out_path:
            with open(master_manifest, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)

        logger.info(
            "Compiled manifest: %d audio cues, %d scripts (%d total bytes) -> %s",
            indexed["total_audio"],
            indexed["total_scripts"],
            indexed["total_bytes"],
            out_path,
        )
        return manifest

    # -------------------------------------------------------------------------
    # High-Level Import Pipeline
    # -------------------------------------------------------------------------
    def run_import(
        self,
        search_dirs: Optional[List[Union[str, Path]]] = None,
        target_installer: Optional[Union[str, Path]] = None,
        specific_file: Optional[Union[str, Path]] = None,
    ) -> Dict[str, Any]:
        """
        Discovers installer, extracts contents, indexes assets, and writes manifest.
        """
        chosen = specific_file or target_installer
        chosen_installer = Path(chosen) if chosen else None
        if chosen_installer is None:
            found = self.find_installers(search_dirs=search_dirs)
            if found:
                chosen_installer = found[0]

        if chosen_installer is None or not chosen_installer.is_file():
            # Generate clean standby manifest
            standby_manifest = {
                "version": "1.0",
                "extracted_at": time.time(),
                "status": "NO_INSTALLERS_FOUND",
                "searched_dirs": [str(d) for d in (search_dirs or [Path.home() / "Downloads"])],
                "audio_cues": [],
                "scripts": [],
                "total_audio_count": 0,
                "total_scripts_count": 0,
                "total_bytes": 0,
            }
            manifest_file = self.output_dir / "import_manifest.json"
            manifest_file.parent.mkdir(parents=True, exist_ok=True)
            with open(manifest_file, "w", encoding="utf-8") as f:
                json.dump(standby_manifest, f, indent=2)
            logger.info("No installers found; standby manifest written to %s", manifest_file)
            return standby_manifest

        dest = self.output_dir / chosen_installer.stem
        extract_res = self.extract_installer(chosen_installer, dest_dir=dest)
        manifest = self.generate_manifest(chosen_installer, dest)
        return {
            "status": "SUCCESS",
            "installers_processed": 1,
            "primary_manifest": manifest,
            "extraction": extract_res,
            "manifest": manifest,
        }


# Canonical alias for external callers
BinaryAssetExtractor = ExternalAppImporter


def compute_sha256(file_path: Union[str, Path]) -> str:
    """Computes SHA-256 digest of a target file."""
    return ExternalAppImporter.compute_sha256(file_path)


def find_7z_binary() -> Optional[Path]:
    """Finds 7-Zip executable on PATH or common Windows install locations."""
    found = shutil.which("7z") or shutil.which("7za")
    if found:
        return Path(found)
    candidates = [
        Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "7-Zip" / "7z.exe",
        Path(os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")) / "7-Zip" / "7z.exe",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def extract_asar_pure_python(asar_path: Union[str, Path], dest_dir: Union[str, Path]) -> Dict[str, Any]:
    """Unpacks a Chromium ASAR archive using pure-Python binary stream parsing."""
    importer = ExternalAppImporter(output_dir=dest_dir)
    count = importer.unpack_asar(asar_path, dest_dir)
    dest_p = Path(dest_dir)
    return {
        "success": count > 0 or (dest_p.exists() and dest_p.is_dir()),
        "file_count": count,
        "dest_dir": str(dest_p),
    }


def unpack_asar_archive(asar_path: Union[str, Path], dest_dir: Union[str, Path]) -> Dict[str, Any]:
    """Unpacks ASAR archive into dest_dir, falling back to pure-Python decoder."""
    return extract_asar_pure_python(asar_path, dest_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Nexus OS - Stonic/Torvis Binary Asset Extractor")
    parser.add_argument("--search-dir", action="append", help="Directory to scan for installer executables")
    parser.add_argument("--output-dir", help="Directory where assets and manifest are saved")
    parser.add_argument("--file", help="Specific installer executable file to extract directly")
    args = parser.parse_args()

    importer = ExternalAppImporter(output_dir=args.output_dir)
    result = importer.run_import(search_dirs=args.search_dir, target_installer=args.file)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
