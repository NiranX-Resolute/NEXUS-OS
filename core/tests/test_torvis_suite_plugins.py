"""
Nexus OS v5.0 - Torvis Suite Utility Plugins Verification Test Suite.
Verifies real execution of clean_dictation_transcript, desktop_tidier,
transform_staged_file, and set_keep_awake with ZERO MOCKS and ZERO STUBS.
"""

import os
from pathlib import Path
import sqlite3
import tempfile
import time
from typing import Any, Dict

import pytest
from PIL import Image

from core.mcp.plugin_loader import nexus_tool
from core.mcp.plugins.torvis_suite_plugins import (
    clean_dictation_transcript,
    desktop_tidier,
    set_keep_awake,
    transform_staged_file,
)


class TestTorvisSuitePlugins:
    """Rigorous verification suite for Torvis Suite Utility plugins."""

    def test_clean_dictation_transcript_fillers_and_punctuation(self):
        """Tests removing filler words, converting punctuation commands, and capitalizing."""
        raw_text = "um hello world comma this is like totally working period new line you know next sentence"
        result = clean_dictation_transcript(raw_text)

        assert isinstance(result, dict)
        assert result.get("success") is True
        cleaned = result.get("cleaned_text", "")

        # Punctuation converted
        assert "," in cleaned
        assert "." in cleaned
        assert "\n" in cleaned
        # Fillers removed
        assert "um" not in cleaned.lower().split()
        assert "like" not in cleaned.lower().split()
        assert "you know" not in cleaned.lower()
        # Capitalization
        assert cleaned[0].isupper()

    def test_clean_dictation_transcript_edge_cases(self):
        """Tests empty, whitespace, and clean input."""
        res_empty = clean_dictation_transcript("")
        assert res_empty["success"] is True
        assert res_empty["cleaned_text"] == ""

        res_clean = clean_dictation_transcript("Nexus OS is running smoothly.")
        assert res_clean["success"] is True
        assert res_clean["cleaned_text"] == "Nexus OS is running smoothly."

    def test_desktop_tidier_lifecycle(self, tmp_path):
        """Tests desktop tidier scan, categorization, atomic move, and undo history."""
        # Setup temporary clutter folder
        test_dir = tmp_path / "cluttered_desktop"
        test_dir.mkdir(parents=True, exist_ok=True)

        (test_dir / "notes.txt").write_text("Meeting notes", encoding="utf-8")
        (test_dir / "invoice.pdf").write_bytes(b"%PDF-1.4 test")
        (test_dir / "script.py").write_text("print('hello')", encoding="utf-8")
        (test_dir / "app_shortcut.lnk").write_text("shortcut", encoding="utf-8")  # Protected

        # 1. Action: scan
        scan_res = desktop_tidier(action="scan", target_dir=str(test_dir))
        assert scan_res.get("success") is True
        assert scan_res.get("action") == "scan"
        assert scan_res.get("clutter_count") == 3  # shortcut is protected, not counted as clutter
        assert "Documents" in scan_res.get("categories_breakdown", {})
        assert "Code" in scan_res.get("categories_breakdown", {})

        # 2. Action: tidy
        tidy_res = desktop_tidier(action="tidy", target_dir=str(test_dir))
        assert tidy_res.get("success") is True
        assert tidy_res.get("moved_count") == 3
        batch_id = tidy_res.get("batch_id")
        assert batch_id is not None

        # Verify files moved into Organized/
        organized_dir = test_dir / "Organized"
        assert organized_dir.exists()
        assert not (test_dir / "notes.txt").exists()
        assert (test_dir / "app_shortcut.lnk").exists()  # Protected file remains

        # 3. Action: undo
        undo_res = desktop_tidier(action="undo", target_dir=str(test_dir), batch_id=batch_id)
        assert undo_res.get("success") is True
        assert undo_res.get("reverted_count") == 3
        # Verify files restored
        assert (test_dir / "notes.txt").exists()
        assert (test_dir / "invoice.pdf").exists()
        assert (test_dir / "script.py").exists()

    def test_transform_staged_file_image_conversions(self, tmp_path):
        """Tests image conversion to webp, png, and resize operations."""
        img_path = tmp_path / "sample_source.png"
        img = Image.new("RGB", (200, 200), color=(255, 0, 0))
        img.save(str(img_path), "PNG")

        # 1. Convert to WEBP
        conv_res = transform_staged_file(file_path=str(img_path), command="convert to webp")
        assert conv_res.get("success") is True
        out_webp = Path(conv_res.get("output_path"))
        assert out_webp.exists()
        assert out_webp.suffix.lower() == ".webp"

        # 2. Resize 50%
        resize_res = transform_staged_file(file_path=str(img_path), command="resize 50%")
        assert resize_res.get("success") is True
        out_resized = Path(resize_res.get("output_path"))
        assert out_resized.exists()
        with Image.open(out_resized) as r_img:
            assert r_img.size == (100, 100)

        # 3. Compress under 100kb
        comp_res = transform_staged_file(file_path=str(img_path), command="compress under 100kb")
        assert comp_res.get("success") is True
        out_comp = Path(comp_res.get("output_path"))
        assert out_comp.exists()
        assert out_comp.stat().st_size <= 100 * 1024

    def test_set_keep_awake(self):
        """Tests setting and releasing keep-awake state via SetThreadExecutionState."""
        res_enable = set_keep_awake(enabled=True, display_required=True)
        assert isinstance(res_enable, dict)
        assert res_enable.get("success") is True
        assert res_enable.get("enabled") is True

        res_disable = set_keep_awake(enabled=False)
        assert isinstance(res_disable, dict)
        assert res_disable.get("success") is True
        assert res_disable.get("enabled") is False

    def test_mcp_tool_decorators(self):
        """Verifies that all 4 tools have nexus_tool metadata registered."""
        assert hasattr(clean_dictation_transcript, "_nexus_tool")
        assert clean_dictation_transcript._nexus_tool["name"] == "clean_dictation_transcript"

        assert hasattr(desktop_tidier, "_nexus_tool")
        assert desktop_tidier._nexus_tool["name"] == "desktop_tidier"

        assert hasattr(transform_staged_file, "_nexus_tool")
        assert transform_staged_file._nexus_tool["name"] == "transform_staged_file"

        assert hasattr(set_keep_awake, "_nexus_tool")
        assert set_keep_awake._nexus_tool["name"] == "set_keep_awake"
