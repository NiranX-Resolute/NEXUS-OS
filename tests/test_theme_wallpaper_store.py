"""Tests for SovereignMemoryStore theme and wallpaper tables and CRUD lifecycle.

Validates:
1. Creation of user_themes and user_wallpapers tables upon initialization.
2. Seeding of the 6 Cyberpunk presets and 5 WebGL shader wallpapers.
3. Complete Theme CRUD: list, get, get_active, save, activate, delete, import, export.
4. Complete Wallpaper CRUD: list, get, get_active, save, activate, update_config, delete, import, export.
5. Invariants: Builtin protection against deletion and fallback activation.
"""

from __future__ import annotations

import json
from pathlib import Path
import tempfile
from typing import Generator

import pytest

from core.memory.sovereign_store import SovereignMemoryStore


@pytest.fixture
def temp_store() -> Generator[SovereignMemoryStore, None, None]:
    with tempfile.TemporaryDirectory() as temp_dir:
        db_path = Path(temp_dir) / "test_agent_local.db"
        store = SovereignMemoryStore(db_path=db_path)
        yield store
        store.close()


def test_tables_exist_and_seeded(temp_store: SovereignMemoryStore) -> None:
    # 1. Verify 6 Cyberpunk theme presets exist
    themes = temp_store.list_themes()
    theme_ids = {t["id"] for t in themes}
    expected_theme_ids = {
        "obsidian_cyber",
        "atlas_bio_plasma",
        "nebula_vortex",
        "tactical_ember",
        "monochrome_optics",
        "biometric_matrix",
    }
    assert expected_theme_ids.issubset(theme_ids)
    for t in themes:
        if t["id"] in expected_theme_ids:
            assert t["is_builtin"] is True
            assert isinstance(t["tokens"], dict)
            assert "accent_primary" in t["tokens"]

    # Verify default active theme
    active_theme = temp_store.get_active_theme()
    assert active_theme["id"] == "obsidian_cyber"
    assert active_theme["is_active"] is True

    # 2. Verify 5 WebGL shader wallpapers exist
    wallpapers = temp_store.list_wallpapers()
    wallpaper_ids = {w["id"] for w in wallpapers}
    expected_wallpaper_ids = {
        "nebula_vortex_shader",
        "plasma_waves_shader",
        "cyber_grid_shader",
        "constellation_starfield",
        "pure_void",
    }
    assert expected_wallpaper_ids.issubset(wallpaper_ids)
    for w in wallpapers:
        if w["id"] in expected_wallpaper_ids:
            assert w["kind"] == "shader"
            assert isinstance(w["config"], dict)

    # Verify default active wallpaper
    active_wallpaper = temp_store.get_active_wallpaper("GLOBAL")
    assert active_wallpaper is not None
    assert active_wallpaper["id"] == "nebula_vortex_shader"
    assert active_wallpaper["is_active"] is True


def test_theme_crud_lifecycle(temp_store: SovereignMemoryStore) -> None:
    # 1. Get existing theme
    obsidian = temp_store.get_theme("obsidian_cyber")
    assert obsidian is not None
    assert obsidian["name"] == "Obsidian Cyber"

    # Non-existent theme
    assert temp_store.get_theme("non_existent_theme") is None

    # 2. Save a new custom theme
    custom_theme = {
        "id": "neon_synthwave",
        "name": "Neon Synthwave",
        "tokens": {
            "void_bg": "#0a0017",
            "accent_primary": "#ff007f",
            "accent_secondary": "#00f0ff",
        },
        "is_active": False,
    }
    saved = temp_store.save_theme(custom_theme)
    assert saved is True

    retrieved = temp_store.get_theme("neon_synthwave")
    assert retrieved is not None
    assert retrieved["name"] == "Neon Synthwave"
    assert retrieved["is_builtin"] is False
    assert retrieved["tokens"]["accent_primary"] == "#ff007f"

    # 3. Activate theme
    activated = temp_store.activate_theme("neon_synthwave")
    assert activated is True
    active = temp_store.get_active_theme()
    assert active["id"] == "neon_synthwave"

    # Previous active theme should now be inactive
    obsidian_after = temp_store.get_theme("obsidian_cyber")
    assert obsidian_after is not None
    assert obsidian_after["is_active"] is False

    # Activating invalid ID fails
    assert temp_store.activate_theme("invalid_theme_xyz") is False

    # 4. Builtin theme cannot be deleted
    assert temp_store.delete_theme("obsidian_cyber") is False

    # 5. Export theme
    exported_bundle = temp_store.export_theme("neon_synthwave")
    assert exported_bundle is not None
    assert exported_bundle["nxtheme_version"] == "1.0"
    assert exported_bundle["format"] == "nexus_theme_bundle"
    assert exported_bundle["theme"]["id"] == "neon_synthwave"

    # Export invalid theme returns None
    assert temp_store.export_theme("invalid_theme_xyz") is None

    # 6. Delete active custom theme -> falls back to obsidian_cyber
    deleted = temp_store.delete_theme("neon_synthwave")
    assert deleted is True
    assert temp_store.get_theme("neon_synthwave") is None
    fallback_active = temp_store.get_active_theme()
    assert fallback_active["id"] == "obsidian_cyber"

    # 7. Import theme from dictionary bundle
    imported_dict = temp_store.import_theme(exported_bundle)
    assert imported_dict["id"] == "neon_synthwave"
    assert temp_store.get_theme("neon_synthwave") is not None

    # Import theme from JSON string bundle
    bundle_str = json.dumps(exported_bundle)
    temp_store.delete_theme("neon_synthwave")
    imported_str = temp_store.import_theme(bundle_str)
    assert imported_str["id"] == "neon_synthwave"


def test_wallpaper_crud_lifecycle(temp_store: SovereignMemoryStore) -> None:
    # 1. Get existing wallpaper
    vortex = temp_store.get_wallpaper("nebula_vortex_shader")
    assert vortex is not None
    assert vortex["name"] == "Nebula Vortex WebGL"

    # Non-existent wallpaper
    assert temp_store.get_wallpaper("non_existent_wallpaper") is None

    # 2. Save a new custom wallpaper
    custom_wallpaper = {
        "id": "matrix_rain_custom",
        "name": "Matrix Rain Custom",
        "kind": "shader",
        "source_path": "shader://matrix_rain",
        "mode_binding": "DEV",
        "config": {"speed": 1.5, "density": 0.8},
        "is_active": True,
    }
    saved = temp_store.save_wallpaper(custom_wallpaper)
    assert saved is True

    retrieved = temp_store.get_wallpaper("matrix_rain_custom")
    assert retrieved is not None
    assert retrieved["name"] == "Matrix Rain Custom"
    assert retrieved["mode_binding"] == "DEV"
    assert retrieved["config"]["speed"] == 1.5
    assert retrieved["is_active"] is True

    # Check active wallpaper for DEV mode
    active_dev = temp_store.get_active_wallpaper("DEV")
    assert active_dev is not None
    assert active_dev["id"] == "matrix_rain_custom"

    # 3. Update wallpaper config
    updated_cfg = temp_store.update_wallpaper_config("matrix_rain_custom", {"blur": 5, "speed": 2.0})
    assert updated_cfg is True
    retrieved_after_cfg = temp_store.get_wallpaper("matrix_rain_custom")
    assert retrieved_after_cfg is not None
    assert retrieved_after_cfg["config"]["blur"] == 5
    assert retrieved_after_cfg["config"]["speed"] == 2.0
    assert retrieved_after_cfg["config"]["density"] == 0.8

    # 4. Activate wallpaper
    activated = temp_store.activate_wallpaper("plasma_waves_shader", "DEV")
    assert activated is True
    active_dev_after = temp_store.get_active_wallpaper("DEV")
    assert active_dev_after is not None
    assert active_dev_after["id"] == "plasma_waves_shader"

    # Invalid activation fails
    assert temp_store.activate_wallpaper("invalid_wallpaper_xyz") is False

    # 5. Builtin WebGL shaders cannot be deleted
    assert temp_store.delete_wallpaper("nebula_vortex_shader") is False
    assert temp_store.delete_wallpaper("plasma_waves_shader") is False

    # 6. Export wallpaper
    exported_bundle = temp_store.export_wallpaper("matrix_rain_custom")
    assert exported_bundle is not None
    assert exported_bundle["nxwallpaper_version"] == "1.0"
    assert exported_bundle["format"] == "nexus_wallpaper_bundle"
    assert exported_bundle["wallpaper"]["id"] == "matrix_rain_custom"

    # Export invalid returns None
    assert temp_store.export_wallpaper("invalid_wallpaper_xyz") is None

    # 7. Delete custom wallpaper
    deleted = temp_store.delete_wallpaper("matrix_rain_custom")
    assert deleted is True
    assert temp_store.get_wallpaper("matrix_rain_custom") is None

    # 8. Import wallpaper from dictionary bundle
    imported_dict = temp_store.import_wallpaper(exported_bundle)
    assert imported_dict["id"] == "matrix_rain_custom"
    assert temp_store.get_wallpaper("matrix_rain_custom") is not None

    # Import wallpaper from JSON string bundle
    bundle_str = json.dumps(exported_bundle)
    temp_store.delete_wallpaper("matrix_rain_custom")
    imported_str = temp_store.import_wallpaper(bundle_str)
    assert imported_str["id"] == "matrix_rain_custom"
