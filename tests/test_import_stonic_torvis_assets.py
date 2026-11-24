"""System-wide verification tests for Stonic & Torvis Binary Asset Extractor.

Verifies:
- 7-Zip binary detection
- SHA-256 file fingerprinting
- Pure-Python ASAR archive unpacking (Chromium pickle header + JSON index + binary slicing)
- Installer discovery with glob pattern matching and priority sorting
- Asset indexing for audio cues and script files
- Manifest generation and serialization
- Complete run_import flow (both clean baseline on no installers and successful asset extraction)
- Class alias BinaryAssetExtractor == ExternalAppImporter
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys
from typing import Dict
import zipfile

from scripts.import_stonic_torvis_assets import (
    BinaryAssetExtractor,
    ExternalAppImporter,
    compute_sha256,
    extract_asar_pure_python,
    find_7z_binary,
    unpack_asar_archive,
)


def _build_test_asar(dest_path: Path, files_map: Dict[str, bytes]) -> Path:
    """Helper that packages files_map into a valid Chromium ASAR binary archive."""
    vfs_tree: Dict[str, dict] = {"files": {}}
    concatenated_data = bytearray()
    current_offset = 0

    for relative_path, file_data in files_map.items():
        parts = relative_path.replace("\\", "/").split("/")
        node = vfs_tree
        for dir_part in parts[:-1]:
            if "files" not in node:
                node["files"] = {}
            if dir_part not in node["files"]:
                node["files"][dir_part] = {"files": {}}
            node = node["files"][dir_part]

        file_name = parts[-1]
        file_len = len(file_data)
        if "files" not in node:
            node["files"] = {}
        node["files"][file_name] = {
            "size": file_len,
            "offset": str(current_offset),
        }
        concatenated_data.extend(file_data)
        current_offset += file_len

    json_bytes = json.dumps(vfs_tree).encode("utf-8")
    json_len = len(json_bytes)
    padding_len = (4 - (json_len % 4)) % 4

    # Chromium pickle: inner payload is 4-byte string length + json_bytes + padding
    inner_payload_size = 4 + json_len + padding_len
    # Header size is the full buffer size of the header pickle (4-byte payload size prefix + inner payload)
    header_size = 4 + inner_payload_size

    header_16 = struct.pack("<IIII", 4, header_size, inner_payload_size, json_len)
    header_block = header_16 + json_bytes + (b"\x00" * padding_len)

    dest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(header_block)
        f.write(concatenated_data)

    return dest_path


def test_find_7z_binary():
    """Verifies 7-Zip discovery returns a valid path or None without raising exceptions."""
    bin_path = find_7z_binary()
    if bin_path is not None:
        assert isinstance(bin_path, Path)
        assert bin_path.is_file()


def test_compute_sha256(tmp_path: Path):
    """Verifies SHA-256 calculation matches hashlib standard output."""
    sample_file = tmp_path / "payload.bin"
    sample_content = b"Nexus OS v5.0 Sovereign Audio Fingerprint"
    sample_file.write_bytes(sample_content)

    expected_hash = hashlib.sha256(sample_content).hexdigest()
    actual_hash = compute_sha256(sample_file)
    assert actual_hash == expected_hash

    missing_hash = compute_sha256(tmp_path / "non_existent.bin")
    assert missing_hash == ""


def test_extract_asar_pure_python(tmp_path: Path):
    """Verifies pure-Python ASAR unpacker decodes directory hierarchy and file contents."""
    asar_file = tmp_path / "test_app.asar"
    out_dir = tmp_path / "unpacked_asar"

    test_assets = {
        "audio/cue_start.wav": b"RIFF_AUDIO_WAV_001",
        "audio/cue_stop.mp3": b"ID3_AUDIO_MP3_002",
        "scripts/main.js": b"console.log('Nexus Stonic Kernel');",
        "config.json": b'{"name": "test-app", "version": "1.0.0"}',
    }

    _build_test_asar(asar_file, test_assets)
    assert asar_file.is_file()

    result = extract_asar_pure_python(asar_file, out_dir)
    assert result["success"] is True
    assert result["file_count"] == 4

    for rel_path, expected_bytes in test_assets.items():
        extracted_file = out_dir / rel_path
        assert extracted_file.is_file()
        assert extracted_file.read_bytes() == expected_bytes


def test_unpack_asar_archive_fallback(tmp_path: Path):
    """Verifies unpack_asar_archive handles extraction and returns proper structure."""
    asar_file = tmp_path / "archive.asar"
    out_dir = tmp_path / "unpacked"

    test_assets = {
        "sounds/ping.ogg": b"OGG_HEADER_PAYLOAD",
        "worker.py": b"print('worker running')",
    }
    _build_test_asar(asar_file, test_assets)

    res = unpack_asar_archive(asar_file, out_dir)
    assert res["success"] is True
    assert (out_dir / "sounds" / "ping.ogg").is_file()
    assert (out_dir / "worker.py").is_file()


def test_find_installers(tmp_path: Path):
    """Verifies installer discovery matches glob patterns and sorts by priority."""
    search_dir = tmp_path / "downloads"
    search_dir.mkdir(parents=True, exist_ok=True)

    f_generic = search_dir / "mysetup.exe"
    f_stonic = search_dir / "Stonic_Setup_v1.0.exe"
    f_torvis = search_dir / "Torvis_setup_v2.1.exe"
    f_unrelated = search_dir / "notes.txt"

    f_generic.write_bytes(b"generic")
    f_stonic.write_bytes(b"stonic")
    f_torvis.write_bytes(b"torvis")
    f_unrelated.write_bytes(b"text")

    importer = ExternalAppImporter(output_dir=tmp_path / "imported")
    found = importer.find_installers([search_dir])

    assert len(found) == 3
    # Check priority: Stonic first, Torvis second, generic third
    names = [p.name for p in found]
    assert names[0] == "Stonic_Setup_v1.0.exe"
    assert names[1] == "Torvis_setup_v2.1.exe"
    assert names[2] == "mysetup.exe"


def test_extract_installer_zip_and_nested_asar(tmp_path: Path):
    """Verifies extraction of zip installer containing nested ASAR archives."""
    installer_exe = tmp_path / "Torvis_setup_bundle.exe"
    output_base = tmp_path / "imported_assets"

    # Create a nested asar archive
    nested_asar = tmp_path / "app.asar"
    _build_test_asar(nested_asar, {
        "sound/notify.wav": b"NOTIFY_WAV",
        "electron/index.js": b"// electron main script",
    })

    # Wrap nested asar and extra files in a zipfile pretending to be an installer .exe
    with zipfile.ZipFile(installer_exe, "w") as zf:
        zf.writestr("resources/app.asar", nested_asar.read_bytes())
        zf.writestr("resources/standalone_audio.mp3", b"ID3_STANDALONE")

    importer = ExternalAppImporter(output_dir=output_base)
    dest_dir = output_base / "torvis_extracted"
    extract_res = importer.extract_installer(installer_exe, dest_dir)

    assert extract_res["success"] is True
    assert extract_res["extracted_files_count"] >= 2
    assert "resources/standalone_audio.mp3" in extract_res["sha256_map"]
    # Check that nested ASAR was detected and unpacked
    assert extract_res["asar_archives_unpacked"] >= 1
    unpacked_audio = dest_dir / "resources" / "app_unpacked" / "sound" / "notify.wav"
    assert unpacked_audio.is_file()
    assert unpacked_audio.read_bytes() == b"NOTIFY_WAV"


def test_index_extracted_assets(tmp_path: Path):
    """Verifies audio cues and scripts are indexed with hashes and byte sizes."""
    extracted_root = tmp_path / "extracted_tree"
    extracted_root.mkdir(parents=True, exist_ok=True)

    (extracted_root / "audio").mkdir()
    (extracted_root / "audio" / "intro.wav").write_bytes(b"WAVE_INTRO_AUDIO")
    (extracted_root / "audio" / "chime.flac").write_bytes(b"FLAC_CHIME_AUDIO")

    (extracted_root / "scripts").mkdir()
    (extracted_root / "scripts" / "bundle.js").write_text("console.log('bundle');", encoding="utf-8")
    (extracted_root / "scripts" / "init.py").write_text("print('init')", encoding="utf-8")
    (extracted_root / "scripts" / "meta.json").write_text('{"key": "value"}', encoding="utf-8")

    # Unindexed asset
    (extracted_root / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    importer = ExternalAppImporter()
    indexed = importer.index_extracted_assets(extracted_root)

    assert indexed["total_audio_count"] == 2
    assert indexed["total_scripts_count"] == 3
    assert indexed["total_bytes"] > 0

    audio_exts = {a["extension"] for a in indexed["audio_cues"]}
    assert audio_exts == {".wav", ".flac"}

    script_exts = {s["extension"] for s in indexed["scripts"]}
    assert script_exts == {".js", ".py", ".json"}


def test_generate_manifest(tmp_path: Path):
    """Verifies import_manifest.json structure conforms to required specification."""
    extracted_root = tmp_path / "extracted"
    extracted_root.mkdir(parents=True, exist_ok=True)
    (extracted_root / "beep.wav").write_bytes(b"RIFF_BEEP")
    (extracted_root / "action.ts").write_text("export const x = 1;", encoding="utf-8")

    fake_installer = tmp_path / "Stonic_Setup.exe"
    fake_installer.write_bytes(b"EXE_PAYLOAD")

    importer = ExternalAppImporter(output_dir=tmp_path / "out")
    manifest = importer.generate_manifest(fake_installer, extracted_root)

    assert manifest["version"] == "1.0"
    assert manifest["source_installer"] == str(fake_installer.resolve())
    assert manifest["installer_sha256"] == compute_sha256(fake_installer)
    assert manifest["total_audio_count"] == 1
    assert manifest["total_scripts_count"] == 1
    assert manifest["total_bytes"] > 0

    # Verify JSON file exists on disk
    manifest_file = extracted_root / "import_manifest.json"
    assert manifest_file.is_file()
    disk_data = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert disk_data["version"] == "1.0"


def test_run_import_no_installers_baseline(tmp_path: Path):
    """Verifies run_import generates clean baseline manifest when no installers are found."""
    empty_search = tmp_path / "empty_dir"
    empty_search.mkdir(parents=True, exist_ok=True)
    out_dir = tmp_path / "imported"

    importer = ExternalAppImporter(output_dir=out_dir)
    res = importer.run_import(search_dirs=[empty_search])

    assert res["status"] == "NO_INSTALLERS_FOUND"
    assert res["total_audio_count"] == 0
    assert res["total_scripts_count"] == 0

    manifest_on_disk = out_dir / "import_manifest.json"
    assert manifest_on_disk.is_file()
    disk_json = json.loads(manifest_on_disk.read_text(encoding="utf-8"))
    assert disk_json["status"] == "NO_INSTALLERS_FOUND"


def test_run_import_with_specific_file(tmp_path: Path):
    """Verifies run_import processes a direct installer file path."""
    out_dir = tmp_path / "imported"
    installer = tmp_path / "Stonic-AI-Setup.exe"

    with zipfile.ZipFile(installer, "w") as zf:
        zf.writestr("cue.mp3", b"ID3_CUE")
        zf.writestr("run.ps1", b"Write-Host 'running'")

    importer = ExternalAppImporter(output_dir=out_dir)
    res = importer.run_import(specific_file=installer)

    assert res["status"] == "SUCCESS"
    assert res["installers_processed"] == 1
    assert res["primary_manifest"]["total_audio_count"] == 1
    assert res["primary_manifest"]["total_scripts_count"] == 1

    manifest_on_disk = out_dir / "import_manifest.json"
    assert manifest_on_disk.is_file()


def test_binary_asset_extractor_alias():
    """Verifies BinaryAssetExtractor is an exact alias for ExternalAppImporter."""
    assert BinaryAssetExtractor is ExternalAppImporter
