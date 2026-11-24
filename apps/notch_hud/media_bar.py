"""Nexus Notch HUD - Media Transport Control Bar Component.

Hooks Windows Global System Media Transport Controls (GSMTC) and native
virtual media key events to provide play/pause, next, previous, and volume
controls directly within the dynamic notch island.
"""

from __future__ import annotations

import asyncio
import ctypes
from ctypes import wintypes
import logging
import sys
from typing import Any, Optional, Tuple

try:
    from PySide6.QtCore import QSize, Qt, QTimer, Signal
    from PySide6.QtGui import QColor, QFont, QPainter, QPen
    from PySide6.QtWidgets import (
        QFrame,
        QHBoxLayout,
        QLabel,
        QPushButton,
        QSlider,
        QVBoxLayout,
        QWidget,
    )
    HAS_PYSIDE = True
except ImportError:
    HAS_PYSIDE = False

    class Qt:
        NoPen = 0
        Horizontal = 1
        Vertical = 2

    class QSize:
        def __init__(self, w=0, h=0):
            self._w = w
            self._h = h
        def width(self):
            return self._w
        def height(self):
            return self._h

    class QColor:
        def __init__(self, *args):
            self.color = args[0] if args else "#000000"
        def name(self):
            return str(self.color)

    class QFont:
        def __init__(self, *args):
            return None

    class QPainter:
        Antialiasing = 1
        def __init__(self, *args):
            return None
        def setRenderHint(self, *args):
            return None
        def setBrush(self, *args):
            return None
        def setPen(self, *args):
            return None
        def drawRoundedRect(self, *args):
            return None

    class QPen:
        def __init__(self, *args):
            return None

    def Signal(*args, **kwargs):  # type: ignore
        class _HeadlessSignal:
            def __init__(self):
                self._callbacks = []
            def connect(self, fn):
                self._callbacks.append(fn)
                return None
            def emit(self, *a, **kw):
                for fn in self._callbacks:
                    fn(*a, **kw)
                return None
        return _HeadlessSignal()

    class QWidget:  # type: ignore
        def __init__(self, parent=None, *args, **kwargs):
            self.parent = parent or kwargs.get("parent", None)
            self._visible = True
            self._width = 100
            self._height = 30
        def setVisible(self, v):
            self._visible = bool(v)
            return None
        def isVisible(self):
            return self._visible
        def setHidden(self, h):
            self._visible = not bool(h)
            return None
        def setStyleSheet(self, s):
            return None
        def setFixedSize(self, *args):
            return None
        def setToolTip(self, *args):
            return None
        def width(self):
            return self._width
        def height(self):
            return self._height
        def update(self):
            return None
        def setLayout(self, layout):
            self._layout = layout
            return None
        def layout(self):
            return getattr(self, "_layout", None)

    class QFrame(QWidget):
        def setFrameShape(self, *args):
            return None

    class _HeadlessLayout:
        def __init__(self, parent=None):
            self.parent = parent
            self._items = []
        def addWidget(self, widget, *args, **kwargs):
            self._items.append(widget)
            return None
        def addLayout(self, layout, *args, **kwargs):
            self._items.append(layout)
            return None
        def addStretch(self, *args):
            return None
        def setContentsMargins(self, *args):
            return None
        def setSpacing(self, *args):
            return None
        def count(self):
            return len(self._items)

    class QHBoxLayout(_HeadlessLayout):
        def __init__(self, parent=None):
            super().__init__(parent)

    class QVBoxLayout(_HeadlessLayout):
        def __init__(self, parent=None):
            super().__init__(parent)

    class QLabel(QWidget):
        def __init__(self, text="", parent=None):
            super().__init__(parent)
            self._text = str(text)
        def setText(self, text):
            self._text = str(text)
            return None
        def text(self):
            return self._text

    class QPushButton(QWidget):
        def __init__(self, text="", parent=None):
            super().__init__(parent)
            self._text = str(text)
            self.clicked = Signal()
        def setText(self, text):
            self._text = str(text)
            return None
        def text(self):
            return self._text

    class QSlider(QWidget):
        def __init__(self, *args, **kwargs):
            parent = args[1] if len(args) > 1 else (args[0] if len(args) > 0 and isinstance(args[0], QWidget) else None)
            super().__init__(parent)
            self._val = 0
            self.valueChanged = Signal()
        def setValue(self, v):
            self._val = v
            self.valueChanged.emit(v)
            return None
        def value(self):
            return self._val
        def setRange(self, *args):
            return None

    class QTimer:
        def __init__(self, parent=None):
            self.parent = parent
            self.timeout = Signal()
            self._interval = 0
            self._active = False
        def setInterval(self, ms):
            self._interval = ms
            return None
        def start(self, *args):
            self._active = True
            return None
        def stop(self):
            self._active = False
            return None
        def isActive(self):
            return self._active

logger = logging.getLogger("nexus.notch_hud.media")

# -------------------------------------------------------------------------
# Windows Virtual Key Codes for Media & Volume Transport
# -------------------------------------------------------------------------
VK_VOLUME_MUTE = 0xAD
VK_VOLUME_DOWN = 0xAE
VK_VOLUME_UP = 0xAF
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_STOP = 0xB2
VK_MEDIA_PLAY_PAUSE = 0xB3

KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002


def _send_virtual_media_key(vk_code: int) -> bool:
    """Dispatches a native Windows media transport virtual key event."""
    if sys.platform != "win32":
        logger.debug("Virtual media key skipped on non-Windows platform")
        return False

    try:
        user32 = ctypes.windll.user32
        # Key down
        user32.keybd_event(vk_code, 0, KEYEVENTF_EXTENDEDKEY, 0)
        # Key up
        user32.keybd_event(vk_code, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)
        return True
    except Exception as exc:
        logger.error("Failed to dispatch media key 0x%X: %s", vk_code, exc)
        return False


class CyberVisualizerWidget(QWidget):
    """Pulsing cyan equalizer audio visualizer bars."""

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setFixedSize(36, 18)
        self._bars = [4, 8, 12, 6, 10]
        self._is_playing = True
        self._waveform_color = QColor(56, 189, 248) if HAS_PYSIDE else "#38BDF8"

        self._anim_timer = QTimer(self)
        self._anim_timer.setInterval(120)
        self._anim_timer.timeout.connect(self._tick)
        self._anim_timer.start()

    def set_waveform_color(self, color: Any) -> None:
        """Sets the active waveform / visualizer bar color dynamically."""
        if HAS_PYSIDE:
            self._waveform_color = QColor(color) if isinstance(color, str) else color
        else:
            self._waveform_color = color
        if hasattr(self, "update"):
            self.update()

    def get_waveform_color(self) -> Any:
        """Returns the active waveform / visualizer color."""
        return self._waveform_color

    def set_playing(self, playing: bool) -> None:
        """Sets active playback state."""
        self._is_playing = playing
        self.update()

    def _tick(self) -> None:
        """Updates equalizer bars using real CoreAudio output peak levels."""
        if not self._is_playing:
            self._bars = [3, 3, 3, 3, 3]
            self.update()
            return

        try:
            from core.runtime.media_controller import WindowsCoreAudioController
            if not hasattr(self, "_core_audio"):
                self._core_audio = WindowsCoreAudioController()
            self._bars = self._core_audio.get_visualizer_bars(num_bars=5, max_height=15)
        except Exception:
            self._bars = [4, 8, 12, 8, 4]
        self.update()

    def paintEvent(self, event) -> None:
        """Renders the dynamic waveform / audio bars."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        color = self._waveform_color if self._is_playing else QColor(100, 116, 139)
        painter.setBrush(color)
        painter.setPen(Qt.NoPen)

        spacing = 3
        bar_width = 4
        base_y = self.height()

        for i, bar_height in enumerate(self._bars):
            x = i * (bar_width + spacing)
            y = max(0, base_y - bar_height)
            painter.drawRoundedRect(x, y, bar_width, bar_height, 2, 2)


class NexusMediaBar(QWidget):
    """Compact media bar component with playback and volume controls."""

    track_changed = Signal(str, str)  # (title, artist)
    playback_state_changed = Signal(bool)  # is_playing

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)

        self._is_playing = False
        self._title = "System Audio"
        self._artist = "Global Transport"
        self._is_muted = False

        self._setup_ui()

        # Timer to query Windows GSMTC session metadata if winrt is available
        self._poll_timer = QTimer(self)
        self._poll_timer.setInterval(2000)
        self._poll_timer.timeout.connect(self._poll_system_media_session)
        self._poll_timer.start()

    def set_waveform_color(self, color: Any) -> None:
        """Sets the active waveform / visualizer color on the embedded visualizer."""
        if hasattr(self, "visualizer") and hasattr(self.visualizer, "set_waveform_color"):
            self.visualizer.set_waveform_color(color)
        return None

    def get_waveform_color(self) -> Any:
        """Returns the active waveform / visualizer color."""
        if hasattr(self, "visualizer") and hasattr(self.visualizer, "get_waveform_color"):
            return self.visualizer.get_waveform_color()
        return None

    def _setup_ui(self) -> None:
        """Initializes the media transport controls layout and styling."""
        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(4, 2, 4, 2)
        self.layout.setSpacing(6)

        # Equalizer Visualizer
        self.visualizer = CyberVisualizerWidget(self)
        self.layout.addWidget(self.visualizer)

        # Track Info (Title and Artist)
        self.info_widget = QWidget(self)
        self.info_layout = QVBoxLayout(self.info_widget)
        self.info_layout.setContentsMargins(0, 0, 0, 0)
        self.info_layout.setSpacing(1)

        self.lbl_title = QLabel(self._title, self.info_widget)
        self.lbl_title.setStyleSheet("color: #F8FAFC; font-weight: 600; font-size: 11px;")
        self.info_layout.addWidget(self.lbl_title)

        self.lbl_artist = QLabel(self._artist, self.info_widget)
        self.lbl_artist.setStyleSheet("color: #94A3B8; font-size: 10px;")
        self.info_layout.addWidget(self.lbl_artist)

        self.layout.addWidget(self.info_widget, 1)

        # Control Buttons Container
        self.controls_widget = QWidget(self)
        self.controls_layout = QHBoxLayout(self.controls_widget)
        self.controls_layout.setContentsMargins(0, 0, 0, 0)
        self.controls_layout.setSpacing(4)

        # Previous Track Button
        self.btn_prev = QPushButton("⏮", self.controls_widget)
        self.btn_prev.setToolTip("Previous Track")
        self.btn_prev.setFixedSize(26, 26)
        self.btn_prev.clicked.connect(self.previous_track)
        self._apply_button_style(self.btn_prev)
        self.controls_layout.addWidget(self.btn_prev)

        # Play / Pause Toggle Button
        self.btn_play_pause = QPushButton("▶", self.controls_widget)
        self.btn_play_pause.setToolTip("Play / Pause")
        self.btn_play_pause.setFixedSize(30, 26)
        self.btn_play_pause.setStyleSheet("""
            QPushButton {
                background-color: #0284C7;
                color: #FFFFFF;
                border-radius: 6px;
                font-size: 12px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #0369A1;
            }
            QPushButton:pressed {
                background-color: #075985;
            }
        """)
        self.btn_play_pause.clicked.connect(self.toggle_play_pause)
        self.controls_layout.addWidget(self.btn_play_pause)

        # Next Track Button
        self.btn_next = QPushButton("⏭", self.controls_widget)
        self.btn_next.setToolTip("Next Track")
        self.btn_next.setFixedSize(26, 26)
        self.btn_next.clicked.connect(self.next_track)
        self._apply_button_style(self.btn_next)
        self.controls_layout.addWidget(self.btn_next)

        # Volume Mute Button
        self.btn_mute = QPushButton("🔊", self.controls_widget)
        self.btn_mute.setToolTip("Mute / Unmute")
        self.btn_mute.setFixedSize(26, 26)
        self.btn_mute.clicked.connect(self.toggle_mute)
        self._apply_button_style(self.btn_mute)
        self.controls_layout.addWidget(self.btn_mute)

        self.layout.addWidget(self.controls_widget)

    def _apply_button_style(self, button: QPushButton) -> None:
        """Applies consistent styling to transport buttons."""
        button.setStyleSheet("""
            QPushButton {
                background-color: rgba(30, 41, 59, 0.7);
                color: #38BDF8;
                border: 1px solid rgba(56, 189, 248, 0.25);
                border-radius: 6px;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: rgba(56, 189, 248, 0.2);
                border: 1px solid #38BDF8;
            }
            QPushButton:pressed {
                background-color: rgba(2, 132, 199, 0.4);
            }
        """)

    # -------------------------------------------------------------------------
    # Transport Controls
    # -------------------------------------------------------------------------
    def toggle_play_pause(self) -> None:
        """Toggles system media playback via VK_MEDIA_PLAY_PAUSE."""
        _send_virtual_media_key(VK_MEDIA_PLAY_PAUSE)
        self._is_playing = not self._is_playing
        self.btn_play_pause.setText("⏸" if self._is_playing else "▶")
        self.visualizer.set_playing(self._is_playing)
        self.playback_state_changed.emit(self._is_playing)
        logger.info("Media Play/Pause toggled (Playing: %s)", self._is_playing)

    def next_track(self) -> None:
        """Advances to next track via VK_MEDIA_NEXT_TRACK."""
        _send_virtual_media_key(VK_MEDIA_NEXT_TRACK)
        logger.info("Media Next Track requested")

    def previous_track(self) -> None:
        """Rewinds to previous track via VK_MEDIA_PREV_TRACK."""
        _send_virtual_media_key(VK_MEDIA_PREV_TRACK)
        logger.info("Media Previous Track requested")

    def toggle_mute(self) -> None:
        """Toggles system master mute via VK_VOLUME_MUTE."""
        _send_virtual_media_key(VK_VOLUME_MUTE)
        self._is_muted = not self._is_muted
        self.btn_mute.setText("🔇" if self._is_muted else "🔊")
        logger.info("System Volume Mute toggled (Muted: %s)", self._is_muted)

    def update_track_info(self, title: str, artist: str) -> None:
        """Updates displayed track title and artist name."""
        self._title = title or "System Audio"
        self._artist = artist or "Active Session"
        self.lbl_title.setText(self._title)
        self.lbl_artist.setText(self._artist)
        self.track_changed.emit(self._title, self._artist)

    # -------------------------------------------------------------------------
    # GSMTC Session Polling
    # -------------------------------------------------------------------------
    def _poll_system_media_session(self) -> None:
        """Attempts to query active Windows GSMTC session metadata if winrt is available."""
        if sys.platform != "win32":
            return

        try:
            # Check if winrt / winsdk media control is available
            import winsdk.windows.media.control as wmc  # type: ignore

            async def _get_media_info():
                mgr = await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
                session = mgr.get_current_session()
                if session:
                    info = await session.try_get_media_properties_async()
                    if info:
                        return info.title, info.artist
                return None, None

            loop = asyncio.new_event_loop()
            title, artist = loop.run_until_complete(_get_media_info())
            loop.close()

            if title:
                self.update_track_info(title, artist)
        except (ImportError, Exception):
            # Fallback: Query active media process window titles via CoreAudio / Win32
            try:
                from core.runtime.media_controller import WindowsGSMTCController
                title, artist = WindowsGSMTCController.get_active_media_title()
                if title and title != "System Audio":
                    self.update_track_info(title, artist)
            except Exception as exc:
                logger.debug("Active media title query note: %s", exc)
