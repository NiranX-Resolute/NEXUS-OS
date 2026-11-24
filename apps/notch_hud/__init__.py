"""Nexus Notch HUD - Dynamic Island Desktop Surface for Nexus OS v5.0."""

from .win32_utils import (
    QUERY_USER_NOTIFICATION_STATE,
    is_fullscreen_app_active,
    set_click_through,
    set_stealth_affinity,
    inject_text_at_cursor,
)
from .fullscreen_guard import (
    FullscreenGuard,
    set_window_stealth_affinity,
    is_fullscreen_game_active,
    is_presentation_active,
    is_meeting_active,
    should_suppress_hud,
    WDA_EXCLUDEFROMCAPTURE,
)
from .file_shelf import FileShelfStaging, IngestedFile
from .notch_window import NexusNotchWindow
from .drag_shelf import NexusDragShelf
from .media_bar import NexusMediaBar

__all__ = [
    "QUERY_USER_NOTIFICATION_STATE",
    "is_fullscreen_app_active",
    "is_fullscreen_game_active",
    "is_presentation_active",
    "is_meeting_active",
    "should_suppress_hud",
    "set_click_through",
    "set_stealth_affinity",
    "set_window_stealth_affinity",
    "WDA_EXCLUDEFROMCAPTURE",
    "inject_text_at_cursor",
    "FullscreenGuard",
    "FileShelfStaging",
    "IngestedFile",
    "NexusNotchWindow",
    "NexusDragShelf",
    "NexusMediaBar",
]
