"""Nexus Notch HUD - Application Entry Point & Bootstrap.

Launches the top-notch dynamic island desktop surface for Nexus OS v5.0:
- PySide6 QApplication lifecycle management
- High-DPI screen support and dark cyber styling
- System tray integration with quick mode toggles
- Graceful POSIX/Windows signal handling (SIGINT/SIGTERM)
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
from pathlib import Path

# Ensure repo root and apps/notch_hud directory are in sys.path
_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent
for _p in [str(_REPO_ROOT), str(_HERE)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from PySide6.QtCore import QCoreApplication, Qt, QTimer
from PySide6.QtGui import QAction, QColor, QFont, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

try:
    from notch_window import NexusNotchWindow
except (ImportError, ValueError):
    try:
        from apps.notch_hud.notch_window import NexusNotchWindow
    except ImportError:
        from .notch_window import NexusNotchWindow


def _create_fallback_tray_icon() -> QIcon:
    """Generates an in-memory 32x32 cyber cyan tray icon."""
    pixmap = QPixmap(32, 32)
    pixmap.fill(Qt.transparent)

    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing)

    # Dark slate circular background
    painter.setBrush(QColor("#0F172A"))
    painter.setPen(QColor("#38BDF8"))
    painter.drawEllipse(2, 2, 28, 28)

    # Cyan center dot
    painter.setBrush(QColor("#38BDF8"))
    painter.setPen(Qt.NoPen)
    painter.drawEllipse(11, 11, 10, 10)
    painter.end()

    return QIcon(pixmap)


def setup_system_tray(app: QApplication, window: NexusNotchWindow) -> QSystemTrayIcon:
    """Configures system tray icon with context menu actions."""
    tray_icon = QSystemTrayIcon(_create_fallback_tray_icon(), app)
    tray_icon.setToolTip("Nexus Notch HUD v5.0")

    tray_menu = QMenu()
    tray_menu.setStyleSheet("""
        QMenu {
            background-color: #0F172A;
            color: #E2E8F0;
            border: 1px solid rgba(56, 189, 248, 0.3);
            border-radius: 6px;
            padding: 4px;
        }
        QMenu::item {
            padding: 6px 18px;
            border-radius: 4px;
        }
        QMenu::item:selected {
            background-color: rgba(56, 189, 248, 0.2);
            color: #38BDF8;
        }
    """)

    # Menu items
    act_toggle = QAction("Toggle Dynamic Notch", tray_menu)
    act_toggle.triggered.connect(window.toggle_notch)
    tray_menu.addAction(act_toggle)

    act_shelf = QAction("Open Drag & Drop Shelf", tray_menu)
    act_shelf.triggered.connect(lambda: window.expand_notch("FILE SHELF", mode="shelf"))
    tray_menu.addAction(act_shelf)

    act_media = QAction("Open Media Controls", tray_menu)
    act_media.triggered.connect(lambda: window.expand_notch("MEDIA TRANSPORT", mode="media"))
    tray_menu.addAction(act_media)

    tray_menu.addSeparator()

    act_exit = QAction("Exit Nexus Notch", tray_menu)
    act_exit.triggered.connect(app.quit)
    tray_menu.addAction(act_exit)

    tray_icon.setContextMenu(tray_menu)
    tray_icon.activated.connect(
        lambda reason: window.toggle_notch() if reason == QSystemTrayIcon.Trigger else None
    )
    tray_icon.show()

    return tray_icon


def main() -> int:
    """Main application bootstrap."""
    parser = argparse.ArgumentParser(description="Nexus OS v5.0 Notch HUD Desktop Surface")
    parser.add_argument("--debug", action="store_true", help="Enable verbose debug logging")
    parser.add_argument("--expanded", action="store_true", help="Start notch in expanded state")
    parser.add_argument("--no-tray", action="store_true", help="Do not spawn duplicate tray icon when running in unified suite")
    parser.add_argument(
        "--mode",
        choices=["status", "media", "shelf"],
        default="status",
        help="Initial mode if starting expanded",
    )
    args = parser.parse_args()

    # Logging setup
    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger = logging.getLogger("nexus.notch_hud")
    logger.info("Initializing Nexus Notch HUD v5.0 Dynamic Island Surface")

    # High-DPI support attributes
    if hasattr(Qt, "AA_EnableHighDpiScaling"):
        QCoreApplication.setAttribute(Qt.AA_EnableHighDpiScaling, True)
    if hasattr(Qt, "AA_UseHighDpiPixmaps"):
        QCoreApplication.setAttribute(Qt.AA_UseHighDpiPixmaps, True)

    app = QApplication(sys.argv)
    app.setApplicationName("NexusNotchHUD")
    app.setOrganizationName("NexusOS")
    app.setQuitOnLastWindowClosed(False)

    # Instantiate top-notch Dynamic Island window
    window = NexusNotchWindow()
    window.show()

    if args.expanded:
        window.expand_notch("NEXUS SYSTEM ACTIVE", mode=args.mode)

    # Initialize system tray icon unless suppressed for unified suite
    tray = None
    if not args.no_tray:
        tray = setup_system_tray(app, window)

    # Enable responsive Ctrl+C handling in terminal
    signal.signal(signal.SIGINT, lambda *_: app.quit())
    sig_timer = QTimer()
    sig_timer.setInterval(500)
    sig_timer.timeout.connect(lambda: None)
    sig_timer.start()

    logger.info("Nexus Notch HUD successfully started and event loop active")
    if hasattr(app, "exec_") and callable(app.exec_):
        return app.exec_()
    elif hasattr(app, "exec") and callable(app.exec):
        return app.exec()
    return 0


if __name__ == "__main__":
    sys.exit(main())
