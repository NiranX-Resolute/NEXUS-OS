"""
Tests for core.runtime.hotkey_daemon.
Validates:
1. WH_KEYBOARD_LL constants and KBDLLHOOKSTRUCT ctypes structure.
2. Virtual Key code resolution and string parsing.
3. HotkeyDaemon background thread lifecycle and Win32 message pump start/stop.
4. Push-to-talk callback dispatch on press and release.
5. Autorepeat suppression logic during sustained key hold.
6. Context manager lifecycle and synthetic test simulation.
"""

import ctypes
import time
import pytest

from core.runtime.hotkey_daemon import (
    WH_KEYBOARD_LL,
    WM_KEYDOWN,
    WM_KEYUP,
    VK_BACKQUOTE,
    VK_SPACE,
    KBDLLHOOKSTRUCT,
    HotkeyDaemon,
    resolve_vk_code,
    create_ptt_daemon,
)


def test_constants_and_structures():
    """Verify Win32 constants and structure sizes."""
    assert WH_KEYBOARD_LL == 13
    assert WM_KEYDOWN == 0x0100
    assert WM_KEYUP == 0x0101
    assert VK_BACKQUOTE == 0xC0

    # Ensure KBDLLHOOKSTRUCT contains expected fields
    fields = [name for name, _ in KBDLLHOOKSTRUCT._fields_]
    assert "vkCode" in fields
    assert "scanCode" in fields
    assert "flags" in fields
    assert "time" in fields
    assert "dwExtraInfo" in fields

    # Validate memory size on 64-bit Windows (24 bytes)
    if ctypes.sizeof(ctypes.c_void_p) == 8:
        assert ctypes.sizeof(KBDLLHOOKSTRUCT) == 24


def test_resolve_vk_code():
    """Verify virtual-key code resolution from strings and integers."""
    assert resolve_vk_code("`") == 0xC0
    assert resolve_vk_code("~") == 0xC0
    assert resolve_vk_code("backquote") == 0xC0
    assert resolve_vk_code("vk_backquote") == 0xC0
    assert resolve_vk_code("space") == VK_SPACE
    assert resolve_vk_code("f1") == 0x70
    assert resolve_vk_code("f12") == 0x7B
    assert resolve_vk_code("enter") == 0x0D
    assert resolve_vk_code("esc") == 0x1B
    assert resolve_vk_code("a") == 0x41
    assert resolve_vk_code("Z") == 0x5A
    assert resolve_vk_code(0xC0) == 0xC0
    assert resolve_vk_code("0xC0") == 0xC0


def test_hotkey_daemon_lifecycle():
    """Verify start, hook initialization, and clean termination."""
    presses = []
    releases = []

    def on_press(vk):
        presses.append(vk)

    def on_release(vk):
        releases.append(vk)

    daemon = HotkeyDaemon(
        target_key="`",
        on_press_callback=on_press,
        on_release_callback=on_release,
        async_dispatch=False,
    )

    started = daemon.start(timeout=2.0)
    assert started is True
    assert daemon.is_running is True

    # Test synthetic press & release
    daemon.simulate_press()
    assert daemon.is_pressed is True
    assert len(presses) == 1
    assert presses[0] == 0xC0

    # Sustained press should be ignored by PTT debounce
    daemon.simulate_press()
    assert len(presses) == 1

    daemon.simulate_release()
    assert daemon.is_pressed is False
    assert len(releases) == 1
    assert releases[0] == 0xC0

    # Stop daemon
    daemon.stop()
    assert daemon.is_running is False


def test_hotkey_daemon_context_manager():
    """Verify context manager pattern."""
    presses = []
    with create_ptt_daemon(on_press=lambda: presses.append(1)) as daemon:
        assert daemon.is_running is True
        daemon.simulate_press()
        daemon.simulate_release()

    assert len(presses) == 1
    assert daemon.is_running is False


def test_hotkey_daemon_stats():
    """Verify telemetry and diagnostics."""
    daemon = HotkeyDaemon(target_key="space", async_dispatch=False)
    daemon.simulate_press()
    daemon.simulate_release()

    stats = daemon.get_stats()
    assert stats["press_count"] == 1
    assert stats["release_count"] == 1
    assert stats["last_press_time"] > 0
    assert stats["last_release_time"] > 0
    assert stats["errors"] == 0


def test_hold_to_talk_multi_hotkeys_and_injection():
    """Verify HoldToTalkDaemon with Backquote, Ctrl+Space, and Insert."""
    from core.runtime.hotkey_daemon import HoldToTalkDaemon, get_hotkey_daemon

    injected = []

    def clean_transcriber(pcm_data: bytes) -> str:
        return "transcribed voice command"

    daemon = HoldToTalkDaemon(
        hotkeys=["`", "ctrl+space", "insert"],
        on_transcription_injected=lambda t: injected.append(t),
        transcriber=clean_transcriber,
    )

    assert daemon.target_keys == ["`", "ctrl+space", "insert"]
    assert daemon._has_ctrl_space is True

    # Test simulate_hold_to_talk with Backquote
    pcm_test = b"\x00\x00" * 160  # 160 samples of 16-bit 16kHz audio
    res1 = daemon.simulate_hold_to_talk(key="`", pcm_bytes=pcm_test, text="Status Report")
    assert res1["success"] is True
    assert res1["injected_text"] == "Status Report"

    # Test simulate_hold_to_talk with Insert
    res2 = daemon.simulate_hold_to_talk(key="insert", text="Insert Mode Activated")
    assert res2["success"] is True
    assert res2["injected_text"] == "Insert Mode Activated"

    # Verify singleton
    singleton = get_hotkey_daemon()
    assert isinstance(singleton, HoldToTalkDaemon)

