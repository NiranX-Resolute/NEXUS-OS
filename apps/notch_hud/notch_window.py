"""Nexus Notch HUD - Dynamic Island Desktop Surface Window.

Implements the top-notch dynamic island window for Nexus OS v5.0:
- PySide6 frameless QMainWindow pinned to top-center of primary display
- Auto-stealth affinity to exclude from OBS/Discord/streaming captures
- SHQueryUserNotificationState fullscreen guard to suppress HUD during gaming/presentations
- OutCubic geometry morphing animation for status alerts, media controls, and drag shelf
- Sleek cyber dark aesthetic (#0F172A background, 14px bottom radii, neon cyan #38BDF8 accents)
"""

from __future__ import annotations

import logging
from typing import Optional

try:
    from PySide6.QtCore import (
        QEasingCurve,
        QPoint,
        QPropertyAnimation,
        QRect,
        QSize,
        Qt,
        QTimer,
        Signal,
    )
    from PySide6.QtGui import (
        QColor,
        QFont,
        QGuiApplication,
        QIcon,
        QMouseEvent,
        QPainter,
        QPainterPath,
        QPen,
        QPixmap,
    )
    from PySide6.QtWidgets import (
        QApplication,
        QComboBox,
        QDialog,
        QFrame,
        QGraphicsDropShadowEffect,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QMainWindow,
        QPushButton,
        QSlider,
        QStackedWidget,
        QVBoxLayout,
        QWidget,
    )
    HAS_PYSIDE = True
except ImportError:
    HAS_PYSIDE = False

    def Signal(*args, **kwargs):  # type: ignore
        class _HeadlessSignal:
            def __init__(self):
                self._slots = []
                self._instance_signals = {}
            def __get__(self, instance, owner):
                if instance is None:
                    return self
                inst_id = id(instance)
                if inst_id not in self._instance_signals:
                    bound = _HeadlessSignal()
                    self._instance_signals[inst_id] = bound
                return self._instance_signals[inst_id]
            def connect(self, fn):
                if fn not in self._slots:
                    self._slots.append(fn)
                return None
            def emit(self, *sig_args):
                for fn in list(self._slots):
                    try:
                        fn(*sig_args)
                    except TypeError:
                        try:
                            fn()
                        except Exception as e:
                            logger.debug("Headless slot error: %s", e)
                    except Exception as exc:
                        logger.debug("Signal dispatch notice: %s", exc)
                return None
        return _HeadlessSignal()

    class _HeadlessRect:
        def __init__(self, x=0, y=0, w=280, h=36):
            self._x = x
            self._y = y
            self._w = w
            self._h = h
        def x(self): return self._x
        def y(self): return self._y
        def width(self): return self._w
        def height(self): return self._h
        def w(self): return self._w
        def h(self): return self._h

    class QRect(_HeadlessRect):
        """Headless QRect."""

    class QSize:
        def __init__(self, w=0, h=0):
            self._w = w
            self._h = h
        def width(self): return self._w
        def height(self): return self._h

    class QPoint:
        def __init__(self, x=0, y=0):
            self._x = x
            self._y = y
        def x(self): return self._x
        def y(self): return self._y

    class QColor:  # type: ignore
        def __init__(self, *args, **kwargs):
            self.args = args

    class QLabel:  # type: ignore
        def __init__(self, text="", parent=None, *args, **kwargs):
            self._text = str(text)
            self._visible = True
            self._style = ""
            self._width = 0
            self._parent = parent
        def setText(self, text):
            self._text = str(text)
        def text(self):
            return self._text
        def setStyleSheet(self, style):
            self._style = str(style)
        def styleSheet(self):
            return self._style
        def setVisible(self, v):
            self._visible = bool(v)
        def setHidden(self, h):
            self._visible = not bool(h)
        def isVisible(self):
            return self._visible
        def isHidden(self):
            return not self._visible
        def setFixedWidth(self, w):
            self._width = w
        def setAlignment(self, *args): return None
        def setWordWrap(self, *args): return None
        def setToolTip(self, *args): return None
        def setFixedSize(self, *args): return None

    class QPushButton:  # type: ignore
        def __init__(self, text="", parent=None, *args, **kwargs):
            self._text = str(text)
            self._visible = True
            self._style = ""
            self._width = 0
            self._parent = parent
            self.clicked = Signal()
        def setText(self, text):
            self._text = str(text)
        def text(self):
            return self._text
        def setStyleSheet(self, style):
            self._style = str(style)
        def styleSheet(self):
            return self._style
        def setVisible(self, v):
            self._visible = bool(v)
        def setHidden(self, h):
            self._visible = not bool(h)
        def isVisible(self):
            return self._visible
        def isHidden(self):
            return not self._visible
        def setFixedWidth(self, w):
            self._width = w
        def setFixedSize(self, *args): return None
        def setToolTip(self, *args): return None

    class QLineEdit:  # type: ignore
        def __init__(self, *args, **kwargs):
            self.returnPressed = Signal()
            self._text = ""
            self._style = ""
        def setText(self, t): self._text = str(t)
        def text(self): return self._text
        def setPlaceholderText(self, *args): return None
        def setStyleSheet(self, s): self._style = str(s)
        def styleSheet(self): return self._style

    class QWidget:  # type: ignore
        def __init__(self, parent=None, *args, **kwargs):
            self._parent = parent
            self._layout = None
            self._style = ""
            self._visible = True
            self._effect = None
        def setLayout(self, layout):
            self._layout = layout
        def layout(self):
            return self._layout
        def setStyleSheet(self, style):
            self._style = str(style)
        def styleSheet(self):
            return self._style
        def setVisible(self, v):
            self._visible = bool(v)
        def setHidden(self, h):
            self._visible = not bool(h)
        def isVisible(self):
            return self._visible
        def isHidden(self):
            return not self._visible
        def setFixedSize(self, *args): return None
        def setFixedWidth(self, *args): return None
        def setFixedHeight(self, *args): return None
        def winId(self): return 0
        def setGraphicsEffect(self, eff): self._effect = eff
        def graphicsEffect(self): return self._effect

    class QFrame(QWidget):  # type: ignore
        def __init__(self, parent=None, *args, **kwargs):
            super().__init__(parent, *args, **kwargs)
            self._obj_name = ""
        def setObjectName(self, name):
            self._obj_name = str(name)
        def objectName(self):
            return self._obj_name

    class QMainWindow(QWidget):  # type: ignore
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._geo = _HeadlessRect(0, 0, 280, 36)
            self._central = None
        def setCentralWidget(self, widget):
            self._central = widget
        def centralWidget(self):
            return self._central
        def setWindowFlags(self, *args, **kwargs): return None
        def setAttribute(self, *args, **kwargs): return None
        def setWindowTitle(self, *args, **kwargs): return None
        def resize(self, w, h):
            self._geo = _HeadlessRect(self._geo.x(), self._geo.y(), w, h)
        def move(self, x, y):
            self._geo = _HeadlessRect(x, y, self._geo.width(), self._geo.height())
        def show(self, *args, **kwargs):
            self._visible = True
        def hide(self, *args, **kwargs):
            self._visible = False
        def isVisible(self):
            return self._visible
        def isHidden(self):
            return not self._visible
        def setGeometry(self, *args):
            if len(args) == 4:
                self._geo = _HeadlessRect(*args)
            elif len(args) == 1:
                self._geo = args[0]
        def geometry(self):
            return getattr(self, "_geo", _HeadlessRect(0, 0, 280, 36))
        def close(self):
            self._visible = False

    class _HeadlessLayout:
        def __init__(self, parent=None, *args, **kwargs):
            self._widgets = []
            if parent and hasattr(parent, "setLayout"):
                parent.setLayout(self)
        def setContentsMargins(self, *args): return None
        def setSpacing(self, *args): return None
        def addWidget(self, w, *args, **kwargs):
            self._widgets.append(w)
        def count(self):
            return len(self._widgets)

    class QVBoxLayout(_HeadlessLayout):
        """Headless vertical layout."""

    class QHBoxLayout(_HeadlessLayout):
        """Headless horizontal layout."""

    class QStackedWidget(QWidget):  # type: ignore
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._current = None
            self._widgets = []
        def addWidget(self, w):
            self._widgets.append(w)
            if self._current is None:
                self._current = w
        def setCurrentWidget(self, w):
            self._current = w
        def currentWidget(self):
            return self._current

    class QGraphicsDropShadowEffect:  # type: ignore
        def __init__(self, *args, **kwargs):
            self._blur = 22
            self._color = None
        def setBlurRadius(self, r): self._blur = r
        def blurRadius(self): return self._blur
        def setColor(self, c): self._color = c
        def color(self): return self._color
        def setOffset(self, *args): return None

    class QSlider:  # type: ignore
        def __init__(self, *args, **kwargs):
            self.valueChanged = Signal()
            self._val = 50
        def setOrientation(self, *args): return None
        def setRange(self, *args): return None
        def setValue(self, val):
            self._val = val
            self.valueChanged.emit(val)
        def value(self): return self._val
        def setStyleSheet(self, *args): return None

    class QComboBox:  # type: ignore
        def __init__(self, *args, **kwargs):
            self.currentIndexChanged = Signal()
            self._items = []
            self._idx = 0
        def addItem(self, item): self._items.append(str(item))
        def currentText(self): return self._items[self._idx] if self._items else ""
        def currentIndex(self): return self._idx
        def setCurrentText(self, t):
            if t in self._items:
                self._idx = self._items.index(t)
                self.currentIndexChanged.emit(self._idx)
        def setStyleSheet(self, *args): return None

    class QTimer:  # type: ignore
        def __init__(self, *args, **kwargs):
            self.timeout = Signal()
            self._single_shot = False
            self._interval = 0
        def setSingleShot(self, val): self._single_shot = bool(val)
        def setInterval(self, val): self._interval = int(val)
        def start(self, *args):
            if args: self._interval = args[0]
        def stop(self): return None

    class Qt:  # type: ignore
        FramelessWindowHint = 0
        WindowStaysOnTopHint = 0
        Tool = 0
        WA_TranslucentBackground = 0
        WA_ShowWithoutActivating = 0
        AlignCenter = 0
        Horizontal = 0
        NoPen = 0

    class QEasingCurve:  # type: ignore
        OutCubic = 0

    class QPropertyAnimation:  # type: ignore
        def __init__(self, target=None, prop_name=b"", parent=None):
            self._target = target
            self._prop = prop_name
            self._start_value = _HeadlessRect(0, 0, 280, 36)
            self._end_value = _HeadlessRect(0, 0, 280, 36)
        def setDuration(self, *args): return None
        def setEasingCurve(self, *args): return None
        def setStartValue(self, val):
            self._start_value = val
        def setEndValue(self, val):
            self._end_value = val
        def endValue(self):
            return self._end_value
        def startValue(self):
            return self._start_value
        def start(self, *args):
            if self._target and hasattr(self._target, "setGeometry") and self._end_value:
                self._target.setGeometry(self._end_value)
        def stop(self, *args): return None

    class _HeadlessScreen:
        def __init__(self):
            self.geometryChanged = Signal()
            self.availableGeometryChanged = Signal()
        def geometry(self):
            return _HeadlessRect(0, 0, 1920, 1080)

    class QApplication:  # type: ignore
        _instance = None
        _primary_screen = _HeadlessScreen()
        def __init__(self, *args, **kwargs):
            self.screenAdded = Signal()
            self.screenRemoved = Signal()
            QApplication._instance = self
        @classmethod
        def instance(cls):
            if cls._instance is None:
                cls._instance = QApplication([])
            return cls._instance
        @classmethod
        def primaryScreen(cls):
            return cls._primary_screen
        @classmethod
        def screens(cls):
            return [cls._primary_screen]

import sys
from pathlib import Path
_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent
for _p in [str(_REPO_ROOT), str(_HERE)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from win32_utils import is_fullscreen_app_active, set_stealth_affinity
    from drag_shelf import NexusDragShelf
    from media_bar import NexusMediaBar
except (ImportError, ValueError):
    from .win32_utils import is_fullscreen_app_active, set_stealth_affinity
    from .drag_shelf import NexusDragShelf
    from .media_bar import NexusMediaBar

from core.runtime.workspaces import WorkspaceGovernor
from core.memory.sovereign_store import SovereignMemoryStore
from core.bridge.persona_engine import (
    AVAILABLE_VOICES,
    PERSONA_PRESETS,
    PersonaTelemetry,
    register_persona_listener,
)

logger = logging.getLogger("nexus.notch_hud.window")


class NexusNotchWindow(QMainWindow):
    """Production top-notch Dynamic Island HUD window for Nexus OS v5.0."""

    COLLAPSED_WIDTH = 280
    COLLAPSED_HEIGHT = 36
    EXPANDED_WIDTH = 540
    EXPANDED_HEIGHT = 140
    EXPANDED_HEIGHT_APPROVAL = 140
    EXPANDED_HEIGHT_STATUS = 36
    EXPANDED_HEIGHT_MEDIA = 84
    EXPANDED_HEIGHT_SHELF = 200
    EXPANDED_HEIGHT_PERSONA = 220

    # Custom signals for HUD events
    notch_expanded = Signal(str)
    notch_collapsed = Signal()
    mode_changed = Signal(str)

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        if HAS_PYSIDE:
            app = QApplication.instance()
            if app is None:
                self._headless_app = QApplication(sys.argv if hasattr(sys, "argv") and sys.argv else ["nexus_notch"])
        super().__init__(parent)

        # Sovereign workspace governor & local store integration
        self.governor = WorkspaceGovernor()
        self.sovereign_store = SovereignMemoryStore()
        self._active_workspace = self.governor.get_mode()

        self._is_expanded = False
        self._current_mode = "status"  # "status", "media", "shelf", "persona", "approval"
        self._fullscreen_hidden = False
        self._auto_collapse_timer = QTimer(self)
        self._approval_callback = None
        self._connected_screens = set()

        # Subscribe to live persona telemetry updates
        register_persona_listener(self._on_persona_updated)

        self._current_position_anchor: str = "top-center"
        self._persisted_visibility: bool = True
        self._macro_recording: bool = False
        self._guest_sandbox: bool = False
        self.macro_badge: Optional[QLabel] = None

        self._auto_collapse_timer.setSingleShot(True)
        self._auto_collapse_timer.timeout.connect(self.collapse_notch)

        # 1. Setup Window Flags & Attributes
        self.setWindowFlags(
            Qt.FramelessWindowHint
            | Qt.WindowStaysOnTopHint
            | Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_ShowWithoutActivating, True)
        self.setWindowTitle("Nexus Dynamic Notch HUD")

        # 2. Build UI Hierarchy
        self._setup_ui()

        # 3. Position Window at Screen Anchor (Load persisted preferences)
        self._apply_anchor_position(self._current_position_anchor, self.COLLAPSED_WIDTH, self.COLLAPSED_HEIGHT)
        self.load_persisted_preferences()

        # 4. Setup Morphing Animation
        self._anim = QPropertyAnimation(self, b"geometry")
        self._anim.setDuration(250)
        self._anim.setEasingCurve(QEasingCurve.OutCubic)

        # 5. Fullscreen Guard Timer (Checks every 1000ms)
        self._guard_timer = QTimer(self)
        self._guard_timer.setInterval(1000)
        self._guard_timer.timeout.connect(self._check_fullscreen_guard)
        self._guard_timer.start()

        # 6. Multi-monitor dynamic re-anchoring on screenAdded/screenRemoved/geometryChanged
        self._setup_screen_listeners()

        # 7. Dynamically sync QSS border glow and waveform to active theme from GET /api/themes
        if HAS_PYSIDE:
            QTimer.singleShot(1000, self.fetch_and_sync_active_theme)
            # 8. Check for interrupted slices on boot and notify user
            QTimer.singleShot(2000, self._check_interrupted_slices)

    def _setup_ui(self) -> None:
        """Constructs the sleek dark cyber UI elements and stacked panels."""
        self.central_container = QFrame(self)
        self.central_container.setObjectName("notchContainer")
        self.setCentralWidget(self.central_container)

        # Container styling: #090d16 background, 18px bottom radii, neon cyan #00f0ff border
        self.central_container.setStyleSheet("""
            #notchContainer {
                background-color: #090d16;
                border: 1px solid rgba(0, 240, 255, 0.45);
                border-top: none;
                border-bottom-left-radius: 18px;
                border-bottom-right-radius: 18px;
            }
            QLabel {
                color: #00f0ff;
                font-family: 'Segoe UI', 'Inter', -apple-system, sans-serif;
                font-size: 12px;
                font-weight: 600;
            }
            QPushButton {
                background-color: transparent;
                color: #94A3B8;
                border: none;
                border-radius: 6px;
                padding: 2px 6px;
                font-size: 11px;
                font-weight: 600;
            }
            QPushButton:hover {
                color: #00f0ff;
                background-color: rgba(0, 240, 255, 0.12);
            }
            QPushButton:pressed {
                color: #0284C7;
                background-color: rgba(0, 240, 255, 0.25);
            }
        """)

        # Drop shadow for high-contrast visibility on any desktop wallpaper
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(22)
        shadow.setColor(QColor(0, 0, 0, 180))
        shadow.setOffset(0, 4)
        self.central_container.setGraphicsEffect(shadow)

        # Main layout
        self.main_layout = QVBoxLayout(self.central_container)
        self.main_layout.setContentsMargins(10, 2, 10, 6)
        self.main_layout.setSpacing(4)

        # Header Bar (Always visible in both collapsed and expanded states)
        self.header_bar = QWidget(self.central_container)
        self.header_layout = QHBoxLayout(self.header_bar)
        self.header_layout.setContentsMargins(2, 0, 2, 0)
        self.header_layout.setSpacing(6)

        # Pulsing Cyan Status Indicator Dot
        self.indicator_dot = QLabel("●", self.header_bar)
        self.indicator_dot.setStyleSheet("color: #00f0ff; font-size: 10px;")
        self.indicator_dot.setFixedWidth(14)
        self.header_layout.addWidget(self.indicator_dot)

        # Dynamic Status / Brand Title Label
        self.status_label = QLabel("NEXUS OS", self.header_bar)
        self.status_label.setStyleSheet("color: #00f0ff; font-weight: 700; letter-spacing: 0.5px;")
        self.header_layout.addWidget(self.status_label, 1)

        # GUEST SANDBOX live amber pill badge (Voice Guardian speaker downgrade)
        self.guest_badge = QLabel("GUEST SANDBOX", self.header_bar)
        self.guest_badge.setStyleSheet("""
            QLabel {
                color: #F59E0B;
                background-color: rgba(245, 158, 11, 0.16);
                border: 1px solid rgba(245, 158, 11, 0.5);
                border-radius: 4px;
                font-size: 9px;
                font-weight: 700;
                padding: 1px 5px;
            }
        """)
        self.guest_badge.setVisible(False)
        self.header_layout.addWidget(self.guest_badge)

        # SCOUT-01 Active Cascade Tier Pill Badge ([REACH] / [OBSCURA] / [CHROMIUM])
        self.scout_pill = QLabel("", self.header_bar)
        self.scout_pill.setStyleSheet("""
            QLabel {
                color: #00f0ff;
                background-color: rgba(0, 240, 255, 0.16);
                border: 1px solid rgba(0, 240, 255, 0.45);
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                padding: 1px 6px;
            }
        """)
        self.scout_pill.setVisible(False)
        self.header_layout.addWidget(self.scout_pill)

        # Active Custom / Abliterated Model GPU Badge
        self.gpu_badge = QLabel("", self.header_bar)
        self.gpu_badge.setStyleSheet("""
            QLabel {
                color: #38bdf8;
                background-color: rgba(15, 23, 42, 0.8);
                border: 1px solid rgba(56, 189, 248, 0.4);
                border-radius: 4px;
                font-size: 9px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-weight: 700;
                padding: 1px 5px;
            }
        """)
        self.gpu_badge.setVisible(False)
        self.header_layout.addWidget(self.gpu_badge)

        # Macro Recording Badge
        self.macro_badge = QLabel("", self.header_bar)
        self.macro_badge.setStyleSheet("""
            QLabel {
                color: #ef4444;
                background-color: rgba(239, 68, 68, 0.16);
                border: 1px solid rgba(239, 68, 68, 0.45);
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                padding: 1px 6px;
            }
        """)
        self.macro_badge.setVisible(False)
        self.header_layout.addWidget(self.macro_badge)

        # 1-Click Release GPU Quota Button
        self.btn_release_gpu = QPushButton("⚡ Release", self.header_bar)
        self.btn_release_gpu.setToolTip("Release remote Kaggle GPU worker to conserve quota")
        self.btn_release_gpu.setStyleSheet("""
            QPushButton {
                background-color: rgba(239, 68, 68, 0.15);
                color: #f87171;
                border: 1px solid rgba(239, 68, 68, 0.4);
                border-radius: 4px;
                padding: 1px 5px;
                font-size: 9px;
                font-weight: 700;
            }
            QPushButton:hover {
                background-color: rgba(239, 68, 68, 0.3);
                color: #fca5a5;
            }
        """)
        self.btn_release_gpu.setVisible(False)
        self.btn_release_gpu.clicked.connect(self._on_release_gpu_clicked)
        self.header_layout.addWidget(self.btn_release_gpu)

        # Slice Recovery Pill Buttons (Resume / Dismiss)
        self._recoverable_slices = []
        self.btn_resume_slice = QPushButton("↻ Resume Slice", self.header_bar)
        self.btn_resume_slice.setToolTip("Resume interrupted execution slice")
        self.btn_resume_slice.setStyleSheet('''
            QPushButton {
                background-color: rgba(34, 197, 94, 0.15);
                color: #4ade80;
                border: 1px solid rgba(34, 197, 94, 0.4);
                border-radius: 4px;
                padding: 1px 5px;
                font-size: 9px;
                font-weight: 700;
            }
            QPushButton:hover {
                background-color: rgba(34, 197, 94, 0.3);
                color: #86efac;
            }
        ''')
        self.btn_resume_slice.setVisible(False)
        self.btn_resume_slice.clicked.connect(lambda: self.handle_slice_recovery("resume"))
        self.header_layout.addWidget(self.btn_resume_slice)

        self.btn_dismiss_slice = QPushButton("✕ Dismiss", self.header_bar)
        self.btn_dismiss_slice.setToolTip("Discard interrupted execution slice")
        self.btn_dismiss_slice.setStyleSheet('''
            QPushButton {
                background-color: rgba(239, 68, 68, 0.15);
                color: #f87171;
                border: 1px solid rgba(239, 68, 68, 0.4);
                border-radius: 4px;
                padding: 1px 5px;
                font-size: 9px;
                font-weight: 700;
            }
            QPushButton:hover {
                background-color: rgba(239, 68, 68, 0.3);
                color: #fca5a5;
            }
        ''')
        self.btn_dismiss_slice.setVisible(False)
        self.btn_dismiss_slice.clicked.connect(lambda: self.handle_slice_recovery("discard"))
        self.header_layout.addWidget(self.btn_dismiss_slice)

        # Quick-Mode Icons (Shelf, REC, Media, Workstation, Cycle Theme, Expand) visibly accessible in header
        self.btn_shelf = QPushButton("📁", self.header_bar)
        self.btn_shelf.setToolTip("Nexus Drag Shelf (Ingest / Share Files)")
        self.btn_shelf.setFixedWidth(22)
        self.btn_shelf.clicked.connect(self._toggle_shelf_mode)
        self.btn_shelf.setVisible(True)
        self.header_layout.addWidget(self.btn_shelf)

        self.btn_rec = QPushButton("⏺", self.header_bar)
        self.btn_rec.setToolTip("Toggle Macro Recording / Capture")
        self.btn_rec.setFixedWidth(22)
        self.btn_rec.clicked.connect(self._toggle_macro_recording)
        self.btn_rec.setVisible(True)
        self.header_layout.addWidget(self.btn_rec)

        self.btn_media = QPushButton("🎵", self.header_bar)
        self.btn_media.setToolTip("Nexus Media Bar")
        self.btn_media.setFixedWidth(22)
        self.btn_media.clicked.connect(self._toggle_media_mode)
        self.btn_media.setVisible(True)
        self.header_layout.addWidget(self.btn_media)

        self.btn_workstation = QPushButton("🌐", self.header_bar)
        self.btn_workstation.setToolTip("Open Nexus Command Center Workstation")
        self.btn_workstation.setFixedWidth(22)
        self.btn_workstation.clicked.connect(self.open_workstation)
        self.btn_workstation.setVisible(True)
        self.header_layout.addWidget(self.btn_workstation)

        self.btn_cycle_theme = QPushButton("🎨", self.header_bar)
        self.btn_cycle_theme.setToolTip("Cycle Active Theme & Border Glow")
        self.btn_cycle_theme.setFixedWidth(22)
        self.btn_cycle_theme.clicked.connect(self.cycle_active_theme)
        self.btn_cycle_theme.setVisible(True)
        self.header_layout.addWidget(self.btn_cycle_theme)

        self.btn_mobile_qr = QPushButton("📱", self.header_bar)
        self.btn_mobile_qr.setToolTip("Mobile Handshake (Tailscale / Cloudflare QR)")
        self.btn_mobile_qr.setFixedWidth(22)
        self.btn_mobile_qr.clicked.connect(self._show_mobile_qr_dialog)
        self.btn_mobile_qr.setVisible(False)
        self.header_layout.addWidget(self.btn_mobile_qr)

        self.btn_persona = QPushButton("🎭", self.header_bar)
        self.btn_persona.setToolTip("Nexus Voice & Persona Matrix")
        self.btn_persona.setFixedWidth(22)
        self.btn_persona.clicked.connect(self._toggle_persona_mode)
        self.btn_persona.setVisible(False)
        self.header_layout.addWidget(self.btn_persona)

        self.btn_toggle = QPushButton("▾", self.header_bar)
        self.btn_toggle.setToolTip("Expand / Collapse HUD")
        self.btn_toggle.setFixedWidth(22)
        self.btn_toggle.clicked.connect(self.toggle_notch)
        self.btn_toggle.setVisible(True)
        self.header_layout.addWidget(self.btn_toggle)

        self.main_layout.addWidget(self.header_bar)

        # Stacked Widget for Expanded Components (Media Bar, Drag Shelf)
        self.stacked_panels = QStackedWidget(self.central_container)
        self.stacked_panels.setVisible(False)

        # 1. Media Bar Component
        self.media_bar = NexusMediaBar(self.stacked_panels)
        self.stacked_panels.addWidget(self.media_bar)

        # 2. Drag Shelf Component
        self.drag_shelf = NexusDragShelf(self.stacked_panels)
        if hasattr(self.drag_shelf, "ingest_requested") and hasattr(self.drag_shelf.ingest_requested, "connect"):
            self.drag_shelf.ingest_requested.connect(self._on_shelf_ingest_requested)
        if hasattr(self.drag_shelf, "mcp_share_requested") and hasattr(self.drag_shelf.mcp_share_requested, "connect"):
            self.drag_shelf.mcp_share_requested.connect(self._on_shelf_mcp_share_requested)
        self.stacked_panels.addWidget(self.drag_shelf)

        # 3. Persona Matrix Component
        self.persona_panel = self._build_persona_panel(self.stacked_panels)
        self.stacked_panels.addWidget(self.persona_panel)

        # 3. Workspace Mode Switcher Row
        self.mode_row = QWidget(self.central_container)
        self.mode_layout = QHBoxLayout(self.mode_row)
        self.mode_layout.setContentsMargins(4, 2, 4, 2)
        self.mode_layout.setSpacing(6)

        for mode_name, color in [("DEV", "#38BDF8"), ("STUDY", "#10B981"), ("STUDIO", "#A855F7"), ("SILENT", "#64748B")]:
            btn = QPushButton(f"[{mode_name}]", self.mode_row)
            btn.setStyleSheet(f"""
                QPushButton {{
                    color: {color};
                    background-color: rgba(15, 23, 42, 0.7);
                    border: 1px solid rgba(56, 189, 248, 0.2);
                    border-radius: 4px;
                    font-size: 10px;
                    padding: 2px 6px;
                }}
                QPushButton:hover {{
                    background-color: rgba(56, 189, 248, 0.2);
                    border-color: {color};
                }}
            """)
            btn.clicked.connect(lambda _, m=mode_name: self.switch_workspace(m))
            self.mode_layout.addWidget(btn)

        # Scout Command Input Row (Supports /scout <target_or_query>)
        self.scout_cmd_row = QWidget(self.central_container)
        self.scout_cmd_layout = QHBoxLayout(self.scout_cmd_row)
        self.scout_cmd_layout.setContentsMargins(4, 2, 4, 2)
        self.scout_cmd_layout.setSpacing(6)

        self.scout_cmd_input = QLineEdit(self.scout_cmd_row)
        self.scout_cmd_input.setPlaceholderText("/scout <url or query> [AUTO]")
        self.scout_cmd_input.setStyleSheet("""
            QLineEdit {
                color: #E2E8F0;
                background-color: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(0, 240, 255, 0.35);
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 11px;
                font-family: 'Segoe UI', monospace;
            }
            QLineEdit:focus {
                border-color: #00f0ff;
                background-color: rgba(15, 23, 42, 0.95);
            }
        """)
        self.scout_cmd_input.returnPressed.connect(self._on_scout_cmd_submitted)
        self.scout_cmd_layout.addWidget(self.scout_cmd_input, 1)

        self.btn_run_scout = QPushButton("⚡ Scout", self.scout_cmd_row)
        self.btn_run_scout.setToolTip("Run SCOUT-01 3-Tier Fallback Cascade")
        self.btn_run_scout.setStyleSheet("""
            QPushButton {
                color: #00f0ff;
                background-color: rgba(0, 240, 255, 0.15);
                border: 1px solid rgba(0, 240, 255, 0.45);
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                padding: 2px 8px;
            }
            QPushButton:hover {
                background-color: rgba(0, 240, 255, 0.35);
                color: #FFFFFF;
            }
        """)
        self.btn_run_scout.clicked.connect(self._on_scout_cmd_submitted)
        self.scout_cmd_layout.addWidget(self.btn_run_scout)

        self.scout_cmd_row.setVisible(False)
        self.main_layout.addWidget(self.scout_cmd_row)

        self.mode_row.setVisible(False)
        self.main_layout.addWidget(self.mode_row)
        self.main_layout.addWidget(self.stacked_panels, 1)

    def switch_workspace(self, mode: str) -> str:
        """Switches active neural workspace mode and updates HUD styling."""
        try:
            self.governor.set_mode(mode)
            self._active_workspace = mode
            color_map = {
                "DEV": "#38BDF8",      # Cyan
                "STUDY": "#10B981",    # Emerald
                "STUDIO": "#A855F7",   # Violet
                "SILENT": "#64748B",   # Muted Slate
            }
            color = color_map.get(mode, "#38BDF8")
            if hasattr(self, "indicator_dot") and self.indicator_dot:
                self.indicator_dot.setStyleSheet(f"color: {color}; font-size: 10px;")
            if hasattr(self, "status_label") and self.status_label:
                self.status_label.setText(f"NEXUS [{mode}]")
            if hasattr(self, "mode_changed"):
                self.mode_changed.emit(mode)
            logger.info("Workspace mode switched to: %s (Namespace: %s)", mode, self.governor.get_memory_namespace())
            return mode
        except Exception as exc:
            logger.warning("Error switching workspace mode: %s", exc)
            return self._active_workspace

    def _on_shelf_ingest_requested(self, files: Any) -> None:
        """Stores ingested drag-shelf files into SovereignMemoryStore under active workspace namespace."""
        active_ns = self.governor.get_memory_namespace()
        count = 0
        for f in (files or []):
            name = getattr(f, "name", "file")
            path = getattr(f, "path", "")
            size = getattr(f, "format_size", lambda: "Unknown")()
            sha = getattr(f, "sha256", "")
            self.sovereign_store.store_memory(
                title=f"Ingested File: {name}",
                content=f"Path: {path}\nSize: {size}\nSHA256: {sha}\nWorkspace: {self._active_workspace}",
                namespace=active_ns,
                metadata={"name": name, "path": path, "sha256": sha, "workspace": self._active_workspace},
            )
            count += 1
        logger.info("Indexed %d files into sovereign memory namespace '%s'", count, active_ns)
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setText(f"INGESTED {count} FILES [{self._active_workspace}]")

    def _show_recovery_pill(self, slices: List[Dict[str, Any]]) -> None:
        """Surfaces recovery pill buttons for recoverable slices."""
        self._recoverable_slices = list(slices)
        if self._recoverable_slices:
            if hasattr(self, "btn_resume_slice") and self.btn_resume_slice:
                self.btn_resume_slice.setHidden(False)
                self.btn_resume_slice.setVisible(True)
            if hasattr(self, "btn_dismiss_slice") and self.btn_dismiss_slice:
                self.btn_dismiss_slice.setHidden(False)
                self.btn_dismiss_slice.setVisible(True)

    def handle_slice_recovery(self, action: str = "resume", slice_id: Optional[str] = None) -> Dict[str, Any]:
        """Resumes or discards recoverable slices and updates HUD state."""
        from core.runtime.slice_engine import resume_or_discard_slice

        target_id = slice_id
        if not target_id and self._recoverable_slices:
            target_id = self._recoverable_slices[0].get("slice_id")
        if not target_id:
            return {"success": False, "error": "No recoverable slice found"}

        target_db = str(self.sovereign_store.db_path) if hasattr(self, "sovereign_store") and hasattr(self.sovereign_store, "db_path") else None
        res = resume_or_discard_slice(slice_id=target_id, action=action, db_path=target_db)

        self._recoverable_slices = []
        if hasattr(self, "btn_resume_slice") and self.btn_resume_slice:
            self.btn_resume_slice.setHidden(True)
            self.btn_resume_slice.setVisible(False)
        if hasattr(self, "btn_dismiss_slice") and self.btn_dismiss_slice:
            self.btn_dismiss_slice.setHidden(True)
            self.btn_dismiss_slice.setVisible(False)

        return res

    def _on_shelf_files_dropped(self, paths: List[str]) -> None:
        """Handles dropped files on the drag shelf, supporting .nxskill, .md, and arbitrary payloads."""
        if not paths:
            return
        for p in paths:
            p_obj = Path(p)
            if p_obj.suffix.lower() == ".nxskill" or p_obj.name.lower() == "skill.md":
                try:
                    from core.mcp.skill_marketplace_importer import SkillMarketplaceImporter
                    db_path = str(self.sovereign_store.db_path) if hasattr(self, "sovereign_store") and hasattr(self.sovereign_store, "db_path") else None
                    importer = SkillMarketplaceImporter(db_path=db_path)
                    importer.import_skill_bundle(str(p_obj), auto_elevate=True)
                except Exception as exc:
                    logger.debug("Failed shelf drop skill import: %s", exc)
        if hasattr(self, "_on_shelf_ingest_requested"):
            self._on_shelf_ingest_requested(paths)

    def _toggle_macro_recording(self) -> None:
        """Toggles macro recording state and updates btn_rec styling."""
        new_state = not self._macro_recording
        self.set_macro_status(new_state)
        if hasattr(self, "btn_rec") and self.btn_rec:
            if new_state:
                self.btn_rec.setText("⏹")
                self.btn_rec.setStyleSheet("color: #EF4444; background-color: rgba(239, 68, 68, 0.2); border-radius: 4px; padding: 2px 4px; font-weight: 700;")
            else:
                self.btn_rec.setText("⏺")
                self.btn_rec.setStyleSheet("color: #94A3B8; background-color: transparent; border-radius: 4px; padding: 2px 4px; font-weight: 600;")

    def _setup_screen_listeners(self) -> None:
        """Connects screenAdded, screenRemoved, and geometryChanged on all screens."""
        app = QApplication.instance()
        if not app:
            return
        if hasattr(app, "screenAdded") and hasattr(app.screenAdded, "connect"):
            try:
                app.screenAdded.connect(self._center_at_top)
            except Exception as e:
                logger.debug("screenAdded connect notice: %s", e)
        if hasattr(app, "screenRemoved") and hasattr(app.screenRemoved, "connect"):
            try:
                app.screenRemoved.connect(self._center_at_top)
            except Exception as e:
                logger.debug("screenRemoved connect notice: %s", e)
        primary = QApplication.primaryScreen()
        if primary and hasattr(primary, "geometryChanged") and hasattr(primary.geometryChanged, "connect"):
            try:
                primary.geometryChanged.connect(self._center_at_top)
            except Exception as e:
                logger.debug("primaryScreen geometryChanged connect notice: %s", e)
        self._connected_screens = getattr(self, "_connected_screens", set())
        self._bind_all_screen_geometries()

    def _bind_all_screen_geometries(self) -> None:
        """Binds geometryChanged on primary and all available screens."""
        app = QApplication.instance()
        if not app:
            return
        screens = app.screens() if hasattr(app, "screens") else []
        if not screens and hasattr(QApplication, "primaryScreen"):
            primary = QApplication.primaryScreen()
            if primary:
                screens = [primary]

        for screen in screens:
            if screen not in self._connected_screens:
                if hasattr(screen, "geometryChanged") and hasattr(screen.geometryChanged, "connect"):
                    try:
                        screen.geometryChanged.connect(self._center_at_top)
                    except Exception as g_err:
                        logger.debug("geometryChanged bind notice: %s", g_err)
                if hasattr(screen, "availableGeometryChanged") and hasattr(screen.availableGeometryChanged, "connect"):
                    try:
                        screen.availableGeometryChanged.connect(self._center_at_top)
                    except Exception as a_err:
                        logger.debug("availableGeometryChanged bind notice: %s", a_err)
                self._connected_screens.add(screen)

    def _on_screen_added(self, screen=None) -> None:
        logger.info("Display screen added: %s; re-anchoring HUD", screen)
        self._bind_all_screen_geometries()
        self._center_at_top()

    def _on_screen_removed(self, screen=None) -> None:
        logger.info("Display screen removed: %s; re-anchoring HUD", screen)
        self._bind_all_screen_geometries()
        self._center_at_top()

    def _on_geometry_changed(self, geom=None) -> None:
        logger.info("Display screen geometry changed; re-anchoring HUD")
        self._center_at_top()

    def reanchor(self) -> None:
        """Public alias for dynamic screen re-anchoring."""
        self._center_at_top()

    def _on_shelf_mcp_share_requested(self, files: Any) -> None:
        """Dispatches staged file paths to POST http://127.0.0.1:47630/api/mcp/share-files and SovereignMemoryStore."""
        import json
        import os
        import threading
        import urllib.request

        file_items = list(files) if files else []
        count = len(file_items)
        active_ns = "dev_context"

        payload_files = []
        for f in file_items:
            if isinstance(f, str):
                name = os.path.basename(f)
                path = f
                sha = ""
                size = "Unknown"
            elif isinstance(f, dict):
                name = str(f.get("name") or "file")
                path = str(f.get("path") or "")
                sha = str(f.get("sha256") or "")
                size = str(f.get("size") or "Unknown")
            else:
                name = getattr(f, "name", "file")
                path = getattr(f, "path", "")
                sha = getattr(f, "sha256", "")
                size = getattr(f, "format_size", lambda: "Unknown")()

            try:
                self.sovereign_store.store_memory(
                    title=f"MCP Shared Resource: {name}",
                    content=f"Resource Path: {path}\nSHA256: {sha}\nSize: {size}",
                    namespace=active_ns,
                    metadata={"name": name, "path": path, "sha256": sha, "shared_via": "MCP_DRAG_SHELF"},
                )
            except Exception as exc:
                logger.debug("Memory store indexing notice: %s", exc)

            payload_files.append({
                "name": name,
                "path": path,
                "sha256": sha,
                "size": size,
            })

        def _post_share_files():
            try:
                token = os.environ.get("NEXUS_IPC_TOKEN", "")
                headers = {"Content-Type": "application/json"}
                if token:
                    headers["Authorization"] = f"Bearer {token}"
                data = json.dumps({"files": payload_files, "namespace": active_ns}).encode("utf-8")
                req = urllib.request.Request(
                    "http://127.0.0.1:47630/api/mcp/share-files",
                    data=data,
                    headers=headers,
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=2.5) as resp:
                    resp_json = json.loads(resp.read().decode("utf-8"))
                    logger.info("POST /api/mcp/share-files response: %s", resp_json)
            except Exception as exc:
                logger.debug("POST /api/mcp/share-files warning: %s", exc)

        t = threading.Thread(target=_post_share_files, daemon=True, name="MCPShareFilesWorker")
        t.start()

        logger.info("Shared %d staged files with MCP bus under namespace '%s'", count, active_ns)
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setText(f"MCP SHARED {count} FILES")
            if not hasattr(self, "_mcp_toast_timer") or self._mcp_toast_timer is None:
                self._mcp_toast_timer = QTimer(self)
                self._mcp_toast_timer.setSingleShot(True)
                self._mcp_toast_timer.timeout.connect(lambda: self.status_label.setText(f"NEXUS [{self._active_workspace}]" if self._active_workspace else "NEXUS OS"))
            self._mcp_toast_timer.start(3000)

    def post_mcp_share_files(self, files: Any, endpoint: str = "http://127.0.0.1:47630/api/mcp/share-files") -> dict:
        """Directly dispatches POST request to /api/mcp/share-files and returns parsed response."""
        import json
        import os
        import urllib.request
        file_items = list(files) if files else []
        payload_files = []
        for f in file_items:
            if isinstance(f, str):
                payload_files.append({"name": os.path.basename(f), "path": f, "sha256": "", "size": "Unknown"})
            elif isinstance(f, dict):
                payload_files.append(f)
            else:
                payload_files.append({
                    "name": getattr(f, "name", "file"),
                    "path": getattr(f, "path", ""),
                    "sha256": getattr(f, "sha256", ""),
                    "size": getattr(f, "format_size", lambda: "Unknown")(),
                })
        body = json.dumps({"files": payload_files, "namespace": "dev_context"}).encode("utf-8")
        token = os.environ.get("NEXUS_IPC_TOKEN", "")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def fetch_and_sync_active_theme(self, base_url: str = "http://127.0.0.1:47630") -> dict:
        """Fetches active theme from GET /api/themes and dynamically syncs QSS border glow and waveform."""
        import json
        import os
        import urllib.request
        theme_resp = {}
        try:
            token = os.environ.get("NEXUS_IPC_TOKEN", "")
            headers = {"Accept": "application/json"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(f"{base_url}/api/themes", headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                theme_resp = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            logger.debug("HTTP GET /api/themes notice: %s; using SovereignMemoryStore", exc)
            if hasattr(self, "sovereign_store") and hasattr(self.sovereign_store, "get_active_theme"):
                active = self.sovereign_store.get_active_theme()
                theme_resp = {"success": True, "active_theme": active}

        if theme_resp and (theme_resp.get("active_theme") or theme_resp.get("theme")):
            self.apply_theme(theme_resp)
        return theme_resp

    def apply_theme(self, theme_data: dict) -> None:
        """Dynamically syncs QSS border glow, background, status colors, and waveform to active theme."""
        if not theme_data:
            return

        active = theme_data.get("active_theme") or theme_data.get("theme") or theme_data
        tokens = active.get("tokens") or {}
        colors = active.get("colors") or {}

        primary_accent = (
            tokens.get("accent_primary")
            or colors.get("primary")
            or active.get("accent_primary")
            or "#00f0ff"
        )
        bg_color = (
            tokens.get("void_bg")
            or tokens.get("surface_tint")
            or colors.get("background")
            or "#090d16"
        )
        glow_intensity = float(tokens.get("border_glow_intensity", 0.65) if isinstance(tokens, dict) else 0.65)

        self._active_accent_color = primary_accent
        self._active_bg_color = bg_color
        self._active_glow_intensity = glow_intensity

        border_rgba = self._hex_to_rgba(primary_accent, max(0.2, min(1.0, glow_intensity)))

        qss = f"""
            #notchContainer {{
                background-color: {bg_color}; /* base: #090d16 */
                border: 1px solid {border_rgba};
                border-top: none;
                border-bottom-left-radius: 18px;
                border-bottom-right-radius: 18px;
            }}
            QLabel {{
                /* cyan: #00f0ff */
                color: {primary_accent};
                font-family: 'Segoe UI', 'Inter', -apple-system, sans-serif;
                font-size: 12px;
                font-weight: 600;
            }}
            QPushButton {{
                background-color: transparent;
                color: #94A3B8;
                border: none;
                border-radius: 6px;
                padding: 2px 6px;
                font-size: 11px;
                font-weight: 600;
            }}
            QPushButton:hover {{
                color: {primary_accent};
                background-color: {self._hex_to_rgba(primary_accent, 0.15)};
            }}
            QPushButton:pressed {{
                color: #0284C7;
                background-color: {self._hex_to_rgba(primary_accent, 0.25)};
            }}
        """
        if hasattr(self, "central_container") and self.central_container:
            self.central_container.setStyleSheet(qss)

        # Drop shadow border glow
        if hasattr(self, "central_container") and hasattr(self.central_container, "graphicsEffect"):
            effect = self.central_container.graphicsEffect()
            if effect and hasattr(effect, "setColor"):
                if HAS_PYSIDE:
                    r, g, b, _ = self._hex_to_rgba_tuple(primary_accent)
                    effect.setColor(QColor(r, g, b, int(255 * glow_intensity)))
                    if hasattr(effect, "setBlurRadius"):
                        effect.setBlurRadius(int(20 + 10 * glow_intensity))

        # Status indicator dot and label
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setStyleSheet(f"color: {primary_accent}; /* default: #00f0ff */ font-weight: 700; letter-spacing: 0.5px;")
        if hasattr(self, "indicator_dot") and self.indicator_dot:
            self.indicator_dot.setStyleSheet(f"color: {primary_accent}; /* default: #00f0ff */ font-size: 10px;")

        # Dynamic sync waveform color in media_bar
        if hasattr(self, "media_bar") and self.media_bar:
            if hasattr(self.media_bar, "set_waveform_color"):
                self.media_bar.set_waveform_color(primary_accent)
            elif hasattr(self.media_bar, "visualizer") and hasattr(self.media_bar.visualizer, "set_waveform_color"):
                self.media_bar.visualizer.set_waveform_color(primary_accent)

        # Update HITL Allow / Deny pill accents
        if hasattr(self, "btn_allow_action") and self.btn_allow_action:
            self.btn_allow_action.setStyleSheet(f"""
                QPushButton {{
                    background-color: {self._hex_to_rgba(primary_accent, 0.25)};
                    color: {primary_accent};
                    border: 1px solid {self._hex_to_rgba(primary_accent, 0.6)};
                    border-radius: 6px;
                    padding: 4px 12px;
                    font-weight: 700;
                    font-size: 11px;
                }}
                QPushButton:hover {{
                    background-color: {self._hex_to_rgba(primary_accent, 0.45)};
                    color: #FFFFFF;
                }}
            """)
        if hasattr(self, "btn_deny_action") and self.btn_deny_action:
            self.btn_deny_action.setStyleSheet("""
                QPushButton {
                    background-color: rgba(239, 68, 68, 0.25);
                    color: #f87171;
                    border: 1px solid rgba(239, 68, 68, 0.6);
                    border-radius: 6px;
                    padding: 4px 12px;
                    font-weight: 700;
                    font-size: 11px;
                }
                QPushButton:hover {
                    background-color: rgba(239, 68, 68, 0.45);
                    color: #FFFFFF;
                }
            """)

        logger.info("Applied active theme '%s' with accent '%s', glow %.2f", active.get("name", "Custom"), primary_accent, glow_intensity)

    def cycle_active_theme(self, base_url: str = "http://127.0.0.1:47630") -> dict:
        """Cycles to next available theme from /api/themes (or memory store) and updates border glow and waveform."""
        import json
        import os
        import urllib.request
        themes_list = []
        cur_id = ""
        token = os.environ.get("NEXUS_IPC_TOKEN", "")
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        try:
            req = urllib.request.Request(f"{base_url}/api/themes", headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                themes_list = data.get("themes", [])
                active_t = data.get("active_theme", {})
                cur_id = active_t.get("id", "")
        except Exception:
            if hasattr(self, "sovereign_store"):
                themes_list = self.sovereign_store.list_themes()
                active_t = self.sovereign_store.get_active_theme()
                cur_id = active_t.get("id", "") if active_t else ""

        if not themes_list:
            return {"success": False, "error": "No themes available"}

        idx = 0
        for i, t in enumerate(themes_list):
            if t.get("id") == cur_id:
                idx = (i + 1) % len(themes_list)
                break
        else:
            idx = 0

        next_theme = themes_list[idx]
        theme_id = next_theme.get("id")

        try:
            post_headers = {"Content-Type": "application/json"}
            if token:
                post_headers["Authorization"] = f"Bearer {token}"
            req = urllib.request.Request(
                f"{base_url}/api/themes/activate",
                data=json.dumps({"theme_id": theme_id}).encode("utf-8"),
                headers=post_headers,
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                _ = resp.read()
        except Exception:
            if hasattr(self, "sovereign_store"):
                self.sovereign_store.activate_theme(theme_id)

        self.apply_theme(next_theme)
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setText(f"THEME: {next_theme.get('name', theme_id).upper()}")
        return {"success": True, "active_theme": next_theme}

    @staticmethod
    def _hex_to_rgba(hex_code: str, alpha: float = 1.0) -> str:
        h = str(hex_code).lstrip("#")
        if len(h) == 6:
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            return f"rgba({r}, {g}, {b}, {alpha:.2f})"
        return f"rgba(0, 240, 255, {alpha:.2f})"

    @staticmethod
    def _hex_to_rgba_tuple(hex_code: str, alpha: float = 1.0) -> tuple:
        h = str(hex_code).lstrip("#")
        if len(h) == 6:
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            return (r, g, b, int(alpha * 255))
        return (0, 240, 255, int(alpha * 255))

    def trigger_approval_gate(
        self,
        action_label: str,
        target_desc: str = "",
        callback: Optional[Any] = None,
    ) -> bool:
        """Triggers HITL approval gate with morphing animation to 540x140."""
        self._approval_callback = callback
        self._current_mode = "approval"
        self.expand_notch(f"CONFIRM: {action_label.upper()}?", mode="approval")
        if hasattr(self, "indicator_dot") and self.indicator_dot:
            self.indicator_dot.setStyleSheet("color: #F59E0B; font-size: 10px;")
        return True

    def _on_approval_decision(self, granted: bool) -> None:
        """Handles user decision on HITL approval gate."""
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setText("APPROVED" if granted else "DENIED")
        if hasattr(self, "_approval_callback") and callable(self._approval_callback):
            self._approval_callback(granted)

    def _reanchor_to_screen(self) -> None:
        """Dynamically re-anchors the notch HUD when monitor geometry or position changes."""
        w = self.EXPANDED_WIDTH if self._is_expanded else self.COLLAPSED_WIDTH
        h = self.COLLAPSED_HEIGHT if not self._is_expanded else (
            self.EXPANDED_HEIGHT_MEDIA if self._current_mode == "media" else
            self.EXPANDED_HEIGHT_SHELF if self._current_mode == "shelf" else
            self.EXPANDED_HEIGHT_PERSONA if self._current_mode == "persona" else
            self.EXPANDED_HEIGHT_APPROVAL if self._current_mode == "approval" else
            self.EXPANDED_HEIGHT_STATUS
        )
        self._apply_anchor_position(getattr(self, "_current_position_anchor", "top-center"), w, h)

    def _apply_anchor_position(self, pos: str, width: int, height: int) -> None:
        """Positions the notch HUD window at target screen anchor."""
        clean_pos = (pos or "top-center").strip().lower()
        self._current_position_anchor = clean_pos
        screen = QApplication.primaryScreen() if QApplication.instance() else None
        if screen:
            geo = screen.geometry()
            sx, sy, sw, sh = geo.x(), geo.y(), geo.width(), geo.height()
        else:
            sx, sy, sw, sh = 0, 0, 1920, 1080

        if "left" in clean_pos and "top" in clean_pos:
            x = sx + 20
            y = sy
        elif "right" in clean_pos and "top" in clean_pos:
            x = sx + max(0, sw - width - 20)
            y = sy
        elif "bottom" in clean_pos and "left" in clean_pos:
            x = sx + 20
            y = sy + max(0, sh - height - 20)
        elif "bottom" in clean_pos and "right" in clean_pos:
            x = sx + max(0, sw - width - 20)
            y = sy + max(0, sh - height - 20)
        elif "bottom" in clean_pos:
            x = sx + (sw - width) // 2
            y = sy + max(0, sh - height - 20)
        else:  # default top-center / docked-top
            x = sx + (sw - width) // 2
            y = sy

        self.setGeometry(x, y, width, height)

    def _center_at_top(self, width: Optional[int] = None, height: Optional[int] = None, *args: Any, **kwargs: Any) -> None:
        """Centers the notch along top edge (delegates to _apply_anchor_position)."""
        w = width if width is not None else (self.EXPANDED_WIDTH if self._is_expanded else self.COLLAPSED_WIDTH)
        h = height if height is not None else (
            self.EXPANDED_HEIGHT_MEDIA if self._current_mode == "media" else
            self.EXPANDED_HEIGHT_SHELF if self._current_mode == "shelf" else
            self.EXPANDED_HEIGHT_PERSONA if self._current_mode == "persona" else
            self.EXPANDED_HEIGHT_APPROVAL if self._current_mode == "approval" else
            self.EXPANDED_HEIGHT_STATUS if self._is_expanded else self.COLLAPSED_HEIGHT
        )
        self._apply_anchor_position(getattr(self, "_current_position_anchor", "top-center"), w, h)

    def load_persisted_preferences(self) -> None:
        """Loads notch HUD anchor position and visibility from agent_local.db ui_preferences table."""
        try:
            import json
            import sqlite3
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            if db_path.exists():
                with sqlite3.connect(str(db_path), timeout=0.5) as conn:
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    cursor.execute(
                        "CREATE TABLE IF NOT EXISTS ui_preferences (pref_key TEXT PRIMARY KEY, pref_value TEXT NOT NULL, updated_at TEXT NOT NULL);"
                    )
                    rows = cursor.execute(
                        "SELECT pref_key, pref_value FROM ui_preferences WHERE pref_key IN ('notch_position', 'notch_visibility');"
                    ).fetchall()
                    prefs = {r["pref_key"]: r["pref_value"] for r in rows}

                    if "notch_position" in prefs:
                        data = json.loads(prefs["notch_position"])
                        pos = data.get("position")
                        if pos and pos != getattr(self, "_current_position_anchor", None):
                            self._current_position_anchor = pos
                            self._reanchor_to_screen()

                    if "notch_visibility" in prefs:
                        vis_data = json.loads(prefs["notch_visibility"])
                        is_vis = bool(vis_data.get("visible", True))
                        self._persisted_visibility = is_vis
                        if not is_vis and self.isVisible():
                            self.hide()
                        elif is_vis and not self.isVisible() and not self._fullscreen_hidden:
                            self.show()
        except Exception as exc:
            logger.debug("Failed loading persisted HUD preferences: %s", exc)

    def persist_position(self, position: str) -> None:
        """Persists HUD position anchor to SQLite WAL ui_preferences and repositions window."""
        self._current_position_anchor = position.strip().lower()
        self._reanchor_to_screen()
        try:
            import json
            import sqlite3
            import time
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            with sqlite3.connect(str(db_path), timeout=2.0) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS ui_preferences (
                        pref_key TEXT PRIMARY KEY,
                        pref_value TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    INSERT INTO ui_preferences (pref_key, pref_value, updated_at)
                    VALUES ('notch_position', ?, ?)
                    ON CONFLICT(pref_key) DO UPDATE SET
                        pref_value = excluded.pref_value,
                        updated_at = excluded.updated_at;
                    """,
                    (json.dumps({"position": self._current_position_anchor}), now_iso)
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Failed persisting notch position: %s", exc)

    def persist_visibility(self, visible: bool) -> None:
        """Persists HUD visibility state to SQLite WAL ui_preferences and applies visibility."""
        self._persisted_visibility = bool(visible)
        if not visible:
            self.hide()
        elif not self._fullscreen_hidden:
            self.show()
        try:
            import json
            import sqlite3
            import time
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            db_path.parent.mkdir(parents=True, exist_ok=True)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            with sqlite3.connect(str(db_path), timeout=2.0) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS ui_preferences (
                        pref_key TEXT PRIMARY KEY,
                        pref_value TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    """
                )
                conn.execute(
                    """
                    INSERT INTO ui_preferences (pref_key, pref_value, updated_at)
                    VALUES ('notch_visibility', ?, ?)
                    ON CONFLICT(pref_key) DO UPDATE SET
                        pref_value = excluded.pref_value,
                        updated_at = excluded.updated_at;
                    """,
                    (json.dumps({"visible": self._persisted_visibility}), now_iso)
                )
                conn.commit()
        except Exception as exc:
            logger.debug("Failed persisting notch visibility: %s", exc)

    VALID_ANCHOR_CORNERS = {"TOP_LEFT", "TOP_CENTER", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_CENTER", "BOTTOM_RIGHT", "DOCK_TOP"}

    def get_anchor_corner(self) -> str:
        """Returns the currently active Notch HUD corner anchor."""
        return getattr(self, "_active_anchor_corner", "TOP_CENTER")

    def set_anchor_corner(self, corner: str, persist: bool = True, animate: bool = False) -> str:
        """Sets and persists the Notch HUD corner anchor (e.g. TOP_CENTER, BOTTOM_LEFT, DOCK_TOP)."""
        clean = (corner or "").strip().upper()
        if clean not in self.VALID_ANCHOR_CORNERS:
            clean = "TOP_CENTER"
        self._active_anchor_corner = clean

        anchor_map = {
            "TOP_LEFT": "top-left",
            "TOP_CENTER": "top-center",
            "TOP_RIGHT": "top-right",
            "BOTTOM_LEFT": "bottom-left",
            "BOTTOM_CENTER": "bottom-center",
            "BOTTOM_RIGHT": "bottom-right",
            "DOCK_TOP": "top-center",
        }
        pos = anchor_map.get(clean, "top-center")
        self._current_position_anchor = pos
        w = self.EXPANDED_WIDTH if self._is_expanded else self.COLLAPSED_WIDTH
        h = self.COLLAPSED_HEIGHT if not self._is_expanded else self.EXPANDED_HEIGHT_STATUS
        self._apply_anchor_position(pos, w, h)

        if persist:
            try:
                import sqlite3
                import time
                db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
                db_path.parent.mkdir(parents=True, exist_ok=True)
                now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                with sqlite3.connect(str(db_path), timeout=2.0) as conn:
                    conn.execute(
                        "CREATE TABLE IF NOT EXISTS system_flags (flag_key TEXT PRIMARY KEY, flag_value TEXT NOT NULL, updated_at TEXT NOT NULL);"
                    )
                    conn.execute(
                        "CREATE TABLE IF NOT EXISTS user_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);"
                    )
                    conn.execute(
                        "INSERT INTO system_flags (flag_key, flag_value, updated_at) VALUES ('notch_anchor_corner', ?, ?) "
                        "ON CONFLICT(flag_key) DO UPDATE SET flag_value = excluded.flag_value, updated_at = excluded.updated_at;",
                        (clean, now_iso),
                    )
                    conn.execute(
                        "INSERT INTO user_preferences (key, value, updated_at) VALUES ('notch_anchor_corner', ?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;",
                        (clean, now_iso),
                    )
                    conn.commit()
            except Exception as exc:
                logger.warning("Failed persisting notch anchor corner to DB: %s", exc)

        return clean

    def handle_geometry_ipc(self, payload: dict) -> dict:
        """Handles geometry and positioning IPC commands from WebSocket or HTTP bus."""
        try:
            if not isinstance(payload, dict):
                return {"success": False, "error": "Invalid payload format"}

            animate = bool(payload.get("animate", False))
            if "anchor" in payload:
                anchor = str(payload["anchor"])
                applied_anchor = self.set_anchor_corner(anchor, persist=True, animate=animate)
                geo = self.geometry() if hasattr(self, "geometry") else None
                gx = geo.x() if (geo and hasattr(geo, "x")) else 0
                gy = geo.y() if (geo and hasattr(geo, "y")) else 0
                gw = geo.width() if (geo and hasattr(geo, "width")) else (self.EXPANDED_WIDTH if self._is_expanded else self.COLLAPSED_WIDTH)
                gh = geo.height() if (geo and hasattr(geo, "height")) else self.COLLAPSED_HEIGHT
                return {
                    "success": True,
                    "anchor": applied_anchor,
                    "geometry": {"x": gx, "y": gy, "width": gw, "height": gh}
                }
            elif any(k in payload for k in ("x", "y", "width", "height")):
                geo = self.geometry() if hasattr(self, "geometry") else None
                cur_x = geo.x() if (geo and hasattr(geo, "x")) else 0
                cur_y = geo.y() if (geo and hasattr(geo, "y")) else 0
                cur_w = geo.width() if (geo and hasattr(geo, "width")) else self.COLLAPSED_WIDTH
                cur_h = geo.height() if (geo and hasattr(geo, "height")) else self.COLLAPSED_HEIGHT

                x = int(payload.get("x", cur_x))
                y = int(payload.get("y", cur_y))
                w = int(payload.get("width", cur_w))
                h = int(payload.get("height", cur_h))

                self.setGeometry(x, y, w, h)
                return {
                    "success": True,
                    "geometry": {"x": x, "y": y, "width": w, "height": h}
                }
            return {"success": False, "error": "No anchor or coordinate parameters provided"}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    def set_macro_status(self, recording: bool, label: Optional[str] = None) -> None:
        """Updates macro recording state and updates HUD recording badge text and visibility."""
        self._macro_recording = bool(recording)
        if not hasattr(self, "macro_badge") or self.macro_badge is None:
            self.macro_badge = QLabel("", getattr(self, "header_bar", None))
        if label is not None:
            self.macro_badge.setText(label)
            self.macro_badge.setVisible(True)
        elif self._macro_recording:
            self.macro_badge.setText("● REC")
            self.macro_badge.setVisible(True)
        else:
            self.macro_badge.setText("")
            self.macro_badge.setVisible(False)

    def set_guest_sandbox(self, active: bool) -> None:
        """Toggles guest sandbox mode state flag and surfaces amber pill badge."""
        self._guest_sandbox = bool(active)
        if hasattr(self, "guest_badge") and self.guest_badge:
            self.guest_badge.setVisible(self._guest_sandbox)

    def showEvent(self, event) -> None:
        """Handles show event and applies stealth display affinity to hide from OBS/Discord."""
        super().showEvent(event)
        try:
            hwnd = int(self.winId())
            success = set_stealth_affinity(hwnd)
            logger.info("Stealth affinity initialization: %s (HWND: 0x%X)", success, hwnd)
        except Exception as exc:
            logger.warning("Failed to apply stealth affinity in showEvent: %s", exc)

    def open_workstation(self) -> None:
        """Restores and focuses the main Nexus Workstation / Command Center window on WinSta0\\Default."""
        if sys.platform == "win32":
            import ctypes
            user32 = ctypes.windll.user32
            def enum_cb(hwnd, lparam):
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buff, length + 1)
                    title = buff.value
                    if "Nexus AI" in title or "Nexus Command Center" in title:
                        user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                        user32.SetForegroundWindow(hwnd)
                return True
            WNDENUM = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
            user32.EnumWindows(WNDENUM(enum_cb), 0)

    def _show_mobile_qr_dialog(self) -> None:
        """Displays mobile handshake QR dialog or updates status label."""
        logger.info("Mobile handshake QR dialog requested on Notch HUD.")
        if hasattr(self, "status_label") and self.status_label:
            self.status_label.setText("MOBILE QR READY")

    def _check_fullscreen_guard(self) -> None:
        """Periodic guard to hide notch during gaming and sync mode/ESTOP from SQLite WAL."""
        if is_fullscreen_app_active():
            if self.isVisible() and not self._fullscreen_hidden:
                logger.info("DirectX/OpenGL fullscreen app detected. Suppressing Notch HUD.")
                self._fullscreen_hidden = True
                self.hide()
        else:
            if self._fullscreen_hidden:
                logger.info("Fullscreen app exited. Restoring Notch HUD.")
                self._fullscreen_hidden = False
                self.show()

        # Bidirectional sync: Check SQLite WAL flags for mode / ESTOP sync
        try:
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            if db_path.exists():
                import sqlite3
                with sqlite3.connect(str(db_path), timeout=0.5) as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT flag_key, flag_value FROM system_flags WHERE flag_key IN ('active_mode', 'ESTOP');")
                    flags = dict(cursor.fetchall())
                    if flags.get("ESTOP") == "1":
                        if hasattr(self, "indicator_dot") and self.indicator_dot:
                            self.indicator_dot.setStyleSheet("color: #F43F5E; font-size: 10px;")
                        if hasattr(self, "status_label") and self.status_label:
                            self.status_label.setText("🛑 E-STOP")
                    else:
                        db_mode = flags.get("active_mode")
                        if db_mode and db_mode != self._active_workspace:
                            self.switch_workspace(db_mode)
            self.load_persisted_preferences()
        except Exception as e:
            logger.debug("[NOTCH] Workspace check suppressed: %s", e)

    def expand_notch(
        self,
        text: str = "",
        mode: str = "status",
        auto_collapse_ms: int = 0,
    ) -> None:
        """Smoothly morphs the notch from collapsed pill to expanded state using QEasingCurve.OutCubic.

        Args:
            text: Status or notification text to display in header.
            mode: Visual mode ("status", "media", "shelf").
            auto_collapse_ms: Optional milliseconds before automatically collapsing back.
        """
        if text:
            self.status_label.setText(text)

        self._current_mode = mode
        target_width = self.EXPANDED_WIDTH

        if mode == "media":
            target_height = self.EXPANDED_HEIGHT_MEDIA
            self.stacked_panels.setCurrentWidget(self.media_bar)
            self.stacked_panels.setVisible(True)
        elif mode == "shelf":
            target_height = self.EXPANDED_HEIGHT_SHELF
            self.stacked_panels.setCurrentWidget(self.drag_shelf)
            self.stacked_panels.setVisible(True)
        elif mode == "persona":
            target_height = self.EXPANDED_HEIGHT_PERSONA
            self._refresh_persona_ui()
            self.stacked_panels.setCurrentWidget(self.persona_panel)
            self.stacked_panels.setVisible(True)
        elif mode == "approval":
            target_height = self.EXPANDED_HEIGHT_APPROVAL
            self.stacked_panels.setVisible(False)
        else:
            target_height = self.EXPANDED_HEIGHT_STATUS
            self.stacked_panels.setVisible(False)

        # Keep compact quick-mode icons visibly accessible in header
        for btn in (self.btn_shelf, self.btn_rec, self.btn_media, self.btn_workstation, self.btn_cycle_theme, self.btn_toggle):
            if btn is not None and hasattr(btn, "setVisible"):
                btn.setVisible(True)

        if hasattr(self, "btn_persona") and self.btn_persona:
            self.btn_persona.setVisible(True)
        if hasattr(self, "mode_row") and self.mode_row:
            self.mode_row.setVisible(True)
        if hasattr(self, "scout_cmd_row") and self.scout_cmd_row:
            self.scout_cmd_row.setVisible(True)
        self.btn_toggle.setText("▴")

        screen = QApplication.primaryScreen() if QApplication.instance() else None
        screen_geo = screen.geometry() if screen else QRect(0, 0, 1920, 1080)
        target_x = screen_geo.x() + (screen_geo.width() - target_width) // 2
        target_y = screen_geo.y()
        target_rect = QRect(target_x, target_y, target_width, target_height)

        self._anim.stop()
        self._anim.setStartValue(self.geometry())
        self._anim.setEndValue(target_rect)
        self._anim.start()

        self._is_expanded = True
        self.notch_expanded.emit(text)

        if auto_collapse_ms > 0:
            self._auto_collapse_timer.start(auto_collapse_ms)
        else:
            self._auto_collapse_timer.stop()

    def collapse_notch(self) -> None:
        """Smoothly collapses the notch back to the compact top-edge pill."""
        self._auto_collapse_timer.stop()
        self.stacked_panels.setVisible(False)

        # Keep compact quick-mode icons visibly accessible in header
        for btn in (self.btn_shelf, self.btn_rec, self.btn_media, self.btn_workstation, self.btn_cycle_theme, self.btn_toggle):
            if btn is not None and hasattr(btn, "setVisible"):
                btn.setVisible(True)

        if hasattr(self, "btn_persona") and self.btn_persona:
            self.btn_persona.setVisible(False)
        if hasattr(self, "mode_row") and self.mode_row:
            self.mode_row.setVisible(False)
        if hasattr(self, "scout_cmd_row") and self.scout_cmd_row:
            self.scout_cmd_row.setVisible(False)
        self.btn_toggle.setText("▾")
        self.status_label.setText("NEXUS OS")

        screen = QApplication.primaryScreen() if QApplication.instance() else None
        screen_geo = screen.geometry() if screen else QRect(0, 0, 1920, 1080)
        target_x = screen_geo.x() + (screen_geo.width() - self.COLLAPSED_WIDTH) // 2
        target_y = screen_geo.y()
        target_rect = QRect(target_x, target_y, self.COLLAPSED_WIDTH, self.COLLAPSED_HEIGHT)

        self._anim.stop()
        self._anim.setStartValue(self.geometry())
        self._anim.setEndValue(target_rect)
        self._anim.start()

        self._is_expanded = False
        self.notch_collapsed.emit()

    def toggle_notch(self) -> None:
        """Toggles between expanded and collapsed states."""
        if self._is_expanded:
            self.collapse_notch()
        else:
            self.expand_notch("NEXUS AGENT ACTIVE", mode="status")

    def _check_interrupted_slices(self) -> Optional[Dict[str, Any]]:
        """
        Boot-time recovery sweep to detect interrupted/in-flight slices in SQLite WAL.
        Inspects ESTOP and SILENT mode, and triggers Notch HUD recovery prompt if needed.
        """
        try:
            from core.runtime.slice_engine import get_recovery_summary
            summary = get_recovery_summary()
            count = summary.get("count", 0)
            if count > 0:
                self._show_slice_recovery_prompt(summary)
            return summary
        except Exception as exc:
            logger.debug("[NOTCH_HUD] Slice recovery check notice: %s", exc)
            return None

    def _show_slice_recovery_prompt(self, summary: Dict[str, Any]) -> None:
        """
        Displays a recovery prompt or warning banner on the Notch HUD for interrupted slices,
        respecting ESTOP (Emergency Stop) and SILENT (Air-Gapped) workspace state.
        """
        count = summary.get("count", 0)
        estop = summary.get("estop_active", False)
        silent = summary.get("silent_mode", False)

        if estop:
            msg = f"ESTOP: {count} SLICES HALTED"
            self.expand_notch(msg, mode="status", auto_collapse_ms=8000)
            if hasattr(self, "indicator_dot") and self.indicator_dot:
                self.indicator_dot.setStyleSheet("color: #EF4444; font-size: 10px;")
        elif silent:
            msg = f"[SILENT] {count} SLICES (AIR-GAPPED)"
            self.expand_notch(msg, mode="status", auto_collapse_ms=7000)
            if hasattr(self, "indicator_dot") and self.indicator_dot:
                self.indicator_dot.setStyleSheet("color: #F59E0B; font-size: 10px;")
        else:
            msg = f"RECOVERY: {count} SLICES IN-FLIGHT"
            self.expand_notch(msg, mode="status", auto_collapse_ms=6000)
            if hasattr(self, "indicator_dot") and self.indicator_dot:
                self.indicator_dot.setStyleSheet("color: #38BDF8; font-size: 10px;")

        # Log/persist event in SQLite WAL telemetry
        try:
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            if db_path.exists():
                import sqlite3
                with sqlite3.connect(str(db_path), timeout=1.0) as conn:
                    conn.execute(
                        "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                        ("slice_recovery_prompt", json.dumps(summary, default=str), time.time()),
                    )
                    conn.commit()
        except Exception as t_err:
            logger.debug("[NOTCH_HUD] Telemetry event notice: %s", t_err)

    def resume_interrupted_slice(self, slice_id: str) -> Dict[str, Any]:
        """Resumes an interrupted slice from the Notch HUD."""
        from core.runtime.slice_engine import resume_or_discard_slice
        res = resume_or_discard_slice(slice_id=slice_id, action="resume")
        if res.get("success"):
            self.expand_notch(f"RESUMED: {slice_id[:8]}", mode="status", auto_collapse_ms=3000)
        else:
            err = res.get("error", "Failed")
            self.expand_notch(f"RESUME BLOCKED: {err[:20]}", mode="status", auto_collapse_ms=5000)
        return res

    def discard_interrupted_slice(self, slice_id: str) -> Dict[str, Any]:
        """Discards an interrupted slice from the Notch HUD."""
        from core.runtime.slice_engine import resume_or_discard_slice
        res = resume_or_discard_slice(slice_id=slice_id, action="discard")
        self.expand_notch(f"DISCARDED: {slice_id[:8]}", mode="status", auto_collapse_ms=3000)
        return res

    def _toggle_shelf_mode(self) -> None:
        """Switches directly to the multi-file drag & drop shelf."""
        if self._is_expanded and self._current_mode == "shelf":
            self.collapse_notch()
        else:
            self.expand_notch("NEXUS FILE SHELF", mode="shelf")

    def _toggle_media_mode(self) -> None:
        """Switches directly to the media transport controls."""
        if self._is_expanded and self._current_mode == "media":
            self.collapse_notch()
        else:
            self.expand_notch("MEDIA TRANSPORT", mode="media")

    def _toggle_persona_mode(self) -> None:
        """Switches directly to the Voice Persona & Emotional Matrix drawer."""
        if self._is_expanded and self._current_mode == "persona":
            self.collapse_notch()
        else:
            self.expand_notch("VOICE & PERSONA MATRIX", mode="persona")

    def enterEvent(self, event) -> None:
        """Reveals drawer toggle buttons on hover if needed."""
        super().enterEvent(event)
        if hasattr(self, "btn_persona") and self.btn_persona:
            self.btn_persona.setVisible(True)

    def leaveEvent(self, event) -> None:
        """Restores collapsed state controls when leaving."""
        super().leaveEvent(event)
        if not self._is_expanded and hasattr(self, "btn_persona") and self.btn_persona:
            self.btn_persona.setVisible(False)

    def _build_persona_panel(self, parent: QWidget) -> QWidget:
        """Constructs the compact quick-adjust drawer for persona telemetry and presets."""
        panel = QWidget(parent)
        layout = QVBoxLayout(panel)
        layout.setContentsMargins(8, 4, 8, 4)
        layout.setSpacing(4)

        # 1. Preset Buttons Row
        preset_row = QWidget(panel)
        p_layout = QHBoxLayout(preset_row)
        p_layout.setContentsMargins(0, 0, 0, 0)
        p_layout.setSpacing(4)

        presets = [
            ("Caring", "CARING_COMPANION", "#38BDF8"),
            ("TARS", "TARS_TACTICAL", "#F59E0B"),
            ("Late-Night", "LATE_NIGHT_CARE", "#818CF8"),
            ("Surgeon", "DEBUG_SURGEON", "#F43F5E"),
        ]
        for label, p_key, color in presets:
            b = QPushButton(label, preset_row)
            b.setStyleSheet(f"""
                QPushButton {{
                    color: {color};
                    background: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(56, 189, 248, 0.25);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 10px;
                    font-weight: 700;
                }}
                QPushButton:hover {{
                    background: rgba(56, 189, 248, 0.2);
                    border-color: {color};
                }}
            """)
            b.clicked.connect(lambda _, k=p_key: self._on_notch_preset_selected(k))
            p_layout.addWidget(b)
        layout.addWidget(preset_row)

        # 2. Sliders Grid
        self.persona_sliders: Dict[str, Any] = {}
        self.persona_val_labels: Dict[str, Any] = {}

        for key, name, color in [
            ("empathy_pct", "Empathy", "#F43F5E"),
            ("humor_pct", "Humor", "#F59E0B"),
            ("candor_pct", "Candor", "#38BDF8"),
            ("verbosity_pct", "Verbosity", "#10B981"),
        ]:
            row = QWidget(panel)
            r_lay = QHBoxLayout(row)
            r_lay.setContentsMargins(0, 0, 0, 0)
            r_lay.setSpacing(6)

            lbl = QLabel(f"{name}:", row)
            lbl.setStyleSheet(f"color: {color}; font-size: 10px; font-weight: 600; min-width: 55px;")
            r_lay.addWidget(lbl)

            slider = QSlider(Qt.Horizontal, row)
            slider.setRange(0, 100)
            slider.setValue(50)
            slider.setStyleSheet(f"""
                QSlider::groove:horizontal {{
                    height: 4px;
                    background: #1E293B;
                    border-radius: 2px;
                }}
                QSlider::sub-page:horizontal {{
                    background: {color};
                    border-radius: 2px;
                }}
                QSlider::handle:horizontal {{
                    background: #F8FAFC;
                    width: 10px;
                    margin-top: -3px;
                    margin-bottom: -3px;
                    border-radius: 5px;
                }}
            """)
            slider.valueChanged.connect(lambda val, k=key: self._on_notch_slider_changed(k, val))
            r_lay.addWidget(slider, 1)

            val_lbl = QLabel("50%", row)
            val_lbl.setStyleSheet("color: #E2E8F0; font-size: 10px; min-width: 30px;")
            r_lay.addWidget(val_lbl)

            self.persona_sliders[key] = slider
            self.persona_val_labels[key] = val_lbl
            layout.addWidget(row)

        # 3. Bottom Row: Voice Selector & Test Button
        bottom_row = QWidget(panel)
        b_lay = QHBoxLayout(bottom_row)
        b_lay.setContentsMargins(0, 0, 0, 0)
        b_lay.setSpacing(6)

        self.voice_combo = QComboBox(bottom_row)
        for v in AVAILABLE_VOICES:
            self.voice_combo.addItem(f"{v['name']} ({v['engine']})")
        self.voice_combo.setStyleSheet("""
            QComboBox {
                background: #1E293B;
                color: #E2E8F0;
                border: 1px solid rgba(56, 189, 248, 0.3);
                border-radius: 4px;
                font-size: 10px;
                padding: 1px 4px;
            }
        """)
        self.voice_combo.currentIndexChanged.connect(self._on_notch_voice_changed)
        b_lay.addWidget(self.voice_combo, 1)

        btn_test = QPushButton("▶ Test Voice", bottom_row)
        btn_test.setStyleSheet("""
            QPushButton {
                color: #0F172A;
                background: #38BDF8;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 700;
                padding: 2px 8px;
            }
            QPushButton:hover {
                background: #7DD3FC;
            }
        """)
        btn_test.clicked.connect(self._on_notch_test_voice)
        b_lay.addWidget(btn_test)

        layout.addWidget(bottom_row)
        return panel

    def _on_persona_updated(self, telemetry: PersonaTelemetry) -> None:
        """Invoked when voice command or IPC updates persona settings."""
        try:
            if hasattr(self, "persona_sliders"):
                for k, v in [
                    ("empathy_pct", telemetry.empathy_pct),
                    ("humor_pct", telemetry.humor_pct),
                    ("candor_pct", telemetry.candor_pct),
                    ("verbosity_pct", telemetry.verbosity_pct),
                ]:
                    if k in self.persona_sliders:
                        slider = self.persona_sliders[k]
                        if slider.value() != v:
                            slider.setValue(v)
                    if k in self.persona_val_labels:
                        self.persona_val_labels[k].setText(f"{v}%")
            if hasattr(self, "status_label") and self._current_mode == "persona":
                self.status_label.setText(f"PERSONA [{telemetry.active_preset.replace('_', ' ')}]")
        except Exception as exc:
            logger.debug("HUD persona sync error: %s", exc)

    def _refresh_persona_ui(self) -> None:
        """Loads SQLite settings into Notch HUD controls."""
        try:
            s = self.sovereign_store.get_persona_settings()
            for k, val in s.items():
                if hasattr(self, "persona_sliders") and k in self.persona_sliders:
                    self.persona_sliders[k].setValue(int(val))
                if hasattr(self, "persona_val_labels") and k in self.persona_val_labels:
                    self.persona_val_labels[k].setText(f"{val}%")
        except Exception as exc:
            logger.debug("Refresh persona UI error: %s", exc)

    def _on_notch_preset_selected(self, preset_key: str) -> None:
        self.sovereign_store.update_persona_settings(active_preset=preset_key)
        self._refresh_persona_ui()
        if hasattr(self, "status_label"):
            self.status_label.setText(f"PRESET: {preset_key.replace('_', ' ')}")

    def _on_notch_slider_changed(self, param: str, val: int) -> None:
        if hasattr(self, "persona_val_labels") and param in self.persona_val_labels:
            self.persona_val_labels[param].setText(f"{val}%")
        self.sovereign_store.update_persona_settings(**{param: val})

    def _on_notch_voice_changed(self) -> None:
        if hasattr(self, "voice_combo"):
            idx = self.voice_combo.currentIndex()
            if 0 <= idx < len(AVAILABLE_VOICES):
                v_id = AVAILABLE_VOICES[idx]["id"]
                self.sovereign_store.update_persona_settings(voice_id=v_id)

    def _on_notch_test_voice(self) -> None:
        try:
            import urllib.request
            req = urllib.request.Request(
                "http://127.0.0.1:47630/api/persona/preview",
                data=b"{}",
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=2.0)
        except Exception as exc:
            logger.debug("Test voice trigger: %s", exc)

    def update_gpu_status(
        self,
        model_tag: str,
        is_abliterated: bool = False,
        idle_minutes: int = 0,
        vram_gb: float = 32.0,
    ) -> None:
        """Updates the Notch HUD GPU telemetry badge and release quota button."""
        if not hasattr(self, "gpu_badge"):
            return
        if not model_tag:
            self.gpu_badge.setVisible(False)
            if hasattr(self, "btn_release_gpu"):
                self.btn_release_gpu.setVisible(False)
            return

        amber_dot = "🟠 " if is_abliterated else ""
        badge_text = f"{amber_dot}GPU: {int(vram_gb)}G • Idle {idle_minutes}m"
        self.gpu_badge.setText(badge_text)

        if is_abliterated:
            self.gpu_badge.setStyleSheet("""
                QLabel {
                    color: #fbbf24;
                    background-color: rgba(245, 158, 11, 0.15);
                    border: 1px solid rgba(245, 158, 11, 0.45);
                    border-radius: 4px;
                    font-size: 9px;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-weight: 700;
                    padding: 1px 5px;
                }
            """)
        else:
            self.gpu_badge.setStyleSheet("""
                QLabel {
                    color: #38bdf8;
                    background-color: rgba(15, 23, 42, 0.8);
                    border: 1px solid rgba(56, 189, 248, 0.4);
                    border-radius: 4px;
                    font-size: 9px;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-weight: 700;
                    padding: 1px 5px;
                }
            """)
        self.gpu_badge.setVisible(True)
        if hasattr(self, "btn_release_gpu"):
            self.btn_release_gpu.setVisible(True)

    def _on_release_gpu_clicked(self) -> None:
        """Dispatches GPU release signal to IPC server to conserve quota."""
        try:
            import urllib.request
            token = os.environ.get("NEXUS_IPC_TOKEN", "")
            req = urllib.request.Request(
                "http://127.0.0.1:47630/api/compute/release",
                data=b"{}",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=3.0)
            if hasattr(self, "status_label"):
                self.status_label.setText("GPU QUOTA RELEASED")
            if hasattr(self, "gpu_badge"):
                self.gpu_badge.setVisible(False)
            if hasattr(self, "btn_release_gpu"):
                self.btn_release_gpu.setVisible(False)
        except Exception as exc:
            logger.debug("Release GPU error: %s", exc)

    def request_hitl_approval(
        self,
        action_label: str,
        target_desc: str = "",
        callback: Optional[Callable[[bool], None]] = None,
    ) -> bool:
        """
        Displays an interactive 1-tap Allow / Deny confirmation pill on the Notch HUD
        for high-risk actuation actions (Send, Delete, Pay, Confirm).
        """
        logger.warning("[NOTCH_HUD] HITL Approval Requested: '%s' on '%s'", action_label, target_desc)
        try:
            db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
            if db_path.exists():
                import sqlite3
                conn = sqlite3.connect(str(db_path), timeout=0.5)
                try:
                    conn.execute(
                        "INSERT INTO telemetry_events (event_type, payload_json, created_at) VALUES (?, ?, ?);",
                        ("hitl_approval_requested", json.dumps({"action": action_label, "target": target_desc, "time": time.time()}), time.time()),
                    )
                    conn.commit()
                finally:
                    conn.close()
        except Exception as e:
            logger.debug("[NOTCH] Workspace check suppressed: %s", e)

        return self.trigger_approval_gate(action_label=action_label, target_desc=target_desc, callback=callback)

    def check_coordinate_action_gate(
        self,
        x: int,
        y: int,
        action_type: str = "click",
        auto_approve: bool = False,
    ) -> bool:
        """
        Runs Win32 WindowFromPoint + UIA hit-testing at (x, y) through ScopeGuard.
        If a sensitive control (send, delete, pay, submit, format) is targeted,
        triggers the interactive Allow / Deny gate on the Notch HUD.
        """
        scope_guard = ScopeGuard()
        try:
            scope_guard.check_coordinate_action(x=x, y=y, action_type=action_type, auto_approve=auto_approve)
            return True
        except Exception as exc:
            logger.warning("[NOTCH_HUD] Sensitive coordinate action gated at (%d, %d): %s", x, y, exc)
            self.request_hitl_approval(
                action_label=f"{action_type.upper()}_COORDINATE",
                target_desc=f"Point ({x}, {y})",
            )
            return auto_approve

    def _on_scout_cmd_submitted(self) -> None:
        """Handles enter key or submit button in the Scout command input."""
        cmd_text = self.scout_cmd_input.text().strip() if hasattr(self, "scout_cmd_input") else ""
        if cmd_text:
            self.execute_scout_cascade(cmd_text)

    def execute_scout_cascade(self, command: str) -> None:
        """Executes the SCOUT-01 3-tier cascade in a background worker, updating HUD tier badge."""
        clean = (command or "").strip()
        if not clean:
            return

        target = clean[6:].strip() if clean.lower().startswith("/scout") else clean

        # ScopeGuard & High-Stakes Action Validation
        scope_guard = ScopeGuard()
        lower_t = target.lower()
        is_high_stakes = any(kw in lower_t for kw in ["delete", "pay", "order", "transfer", "destroy", "reboot", "shutdown", "format"])
        try:
            scope_guard.assert_safe_command(target)
        except Exception:
            is_high_stakes = True

        if is_high_stakes:
            approved = self.request_hitl_approval("SCOUT_HIGH_STAKES", target)
            if not approved:
                if hasattr(self, "status_label"):
                    self.status_label.setText("ACTION CANCELLED BY USER")
                if hasattr(self, "scout_pill"):
                    self.scout_pill.setText("[BLOCKED]")
                return

        # Set HUD status pill to searching
        if hasattr(self, "scout_pill"):
            self.scout_pill.setText("[SCOUTING...]")
            self.scout_pill.setStyleSheet("""
                QLabel {
                    color: #38BDF8;
                    background-color: rgba(56, 189, 248, 0.16);
                    border: 1px solid rgba(56, 189, 248, 0.5);
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 1px 6px;
                }
            """)
            self.scout_pill.setVisible(True)

        if hasattr(self, "status_label"):
            self.status_label.setText(f"SCOUT: {target[:25]}...")

        ws_mode = getattr(self, "_active_workspace", "DEV")

        def _worker():
            try:
                from core.engine.tools.scout_cascade import scout_cascade_run
                mode = "read" if ("://" in target or "." in target.split("/")[0]) else "search"
                res = scout_cascade_run(target=target, mode=mode, workspace_mode=ws_mode)
                tier = res.get("tier", "none").upper()

                if tier in ("AGENT_REACH", "AGENT-REACH", "REACH"):
                    badge_tier = "AGENT-REACH"
                    color_border = "rgba(0, 240, 255, 0.6)"
                    color_text = "#00f0ff"
                elif tier == "OBSCURA":
                    badge_tier = "OBSCURA"
                    color_border = "rgba(16, 185, 129, 0.6)"
                    color_text = "#10B981"
                elif tier in ("CHROMIUM_PERSISTENT", "CHROMIUM"):
                    badge_tier = "CHROMIUM"
                    color_border = "rgba(245, 158, 11, 0.6)"
                    color_text = "#F59E0B"
                elif tier == "CACHE":
                    badge_tier = "CACHE"
                    color_border = "rgba(168, 85, 247, 0.6)"
                    color_text = "#C084FC"
                else:
                    badge_tier = "BLOCKED" if res.get("blocked") else "FAIL"
                    color_border = "rgba(239, 68, 68, 0.6)"
                    color_text = "#EF4444"

                def _update_ui():
                    if hasattr(self, "scout_pill"):
                        self.scout_pill.setText(f"[{badge_tier}]")
                        self.scout_pill.setStyleSheet(f"""
                            QLabel {{
                                color: {color_text};
                                background-color: rgba(9, 13, 22, 0.9);
                                border: 1px solid {color_border};
                                border-radius: 4px;
                                font-size: 10px;
                                font-weight: 700;
                                padding: 1px 6px;
                            }}
                        """)
                    if hasattr(self, "status_label"):
                        title = res.get("title") or res.get("reason") or target
                        self.status_label.setText(title[:35])

                if HAS_PYSIDE:
                    QTimer.singleShot(0, _update_ui)
            except Exception as exc:
                logger.error("Scout cascade worker exception: %s", exc)

        t = threading.Thread(target=_worker, daemon=True, name="NotchScoutCascadeWorker")
        t.start()

    def _show_mobile_qr_dialog(self) -> None:
        """Opens a dark-themed dialog displaying the scannable QR code for Mobile Handshake."""
        if not HAS_PYSIDE:
            return

        import json
        import urllib.request
        import base64

        try:
            req = urllib.request.Request("http://127.0.0.1:47630/api/remote/qr-pairing?format=json")
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            logger.warning("[NOTCH_HUD] QR fetch failed: %s", exc)
            data = {"success": False, "error": str(exc)}

        dlg = QDialog(self)
        dlg.setWindowTitle("Nexus Mobile Handshake")
        dlg.setFixedSize(320, 420)
        dlg.setStyleSheet("""
            QDialog {
                background-color: #0F172A;
                border: 2px solid #38BDF8;
                border-radius: 12px;
            }
            QLabel {
                color: #F8FAFC;
                font-family: system-ui, -apple-system, sans-serif;
            }
            QPushButton {
                background-color: #1E293B;
                color: #38BDF8;
                border: 1px solid #38BDF8;
                border-radius: 6px;
                padding: 6px 14px;
                font-weight: 600;
            }
            QPushButton:hover {
                background-color: #38BDF8;
                color: #0F172A;
            }
        """)

        d_layout = QVBoxLayout(dlg)
        d_layout.setContentsMargins(16, 16, 16, 16)
        d_layout.setSpacing(10)

        title = QLabel("📱 Mobile Handshake", dlg)
        title.setStyleSheet("font-size: 16px; font-weight: 700; color: #38BDF8;")
        title.setAlignment(Qt.AlignCenter)
        d_layout.addWidget(title)

        sub = QLabel("Scan to connect your phone over Tailscale / Cloudflare tunnel", dlg)
        sub.setStyleSheet("font-size: 11px; color: #94A3B8;")
        sub.setAlignment(Qt.AlignCenter)
        sub.setWordWrap(True)
        d_layout.addWidget(sub)

        qr_label = QLabel(dlg)
        qr_label.setAlignment(Qt.AlignCenter)
        qr_label.setFixedSize(220, 220)
        qr_label.setStyleSheet("background-color: #FFFFFF; border-radius: 8px;")

        if data.get("success") and data.get("qr_base64"):
            b64_data = data["qr_base64"].split(",", 1)[-1]
            raw_bytes = base64.b64decode(b64_data)
            pixmap = QPixmap()
            pixmap.loadFromData(raw_bytes)
            qr_label.setPixmap(pixmap.scaled(200, 200, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        else:
            qr_label.setText("Failed to load QR code\nEnsure IPC server is running")
            qr_label.setStyleSheet("color: #EF4444; background-color: #1E293B; border-radius: 8px;")

        d_layout.addWidget(qr_label, 0, Qt.AlignCenter)

        tunnel_type = data.get("tunnel_type", "tailscale").upper()
        expires_sec = data.get("expires_in_seconds", 900)
        info_lbl = QLabel(f"🔒 Bound: 127.0.0.1:47630\nGateway: {tunnel_type} | Expires: {expires_sec // 60}m", dlg)
        info_lbl.setStyleSheet("font-size: 10px; color: #64748B; font-family: monospace;")
        info_lbl.setAlignment(Qt.AlignCenter)
        d_layout.addWidget(info_lbl)

        btn_close = QPushButton("Done", dlg)
        btn_close.clicked.connect(dlg.accept)
        d_layout.addWidget(btn_close)

        dlg.exec()


