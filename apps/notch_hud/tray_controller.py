import os
import sys
import sqlite3
import subprocess
from pathlib import Path
from typing import Optional

try:
    from PySide6.QtWidgets import QSystemTrayIcon, QMenu, QApplication
    from PySide6.QtGui import QIcon, QPixmap, QPainter, QColor, QAction, QActionGroup
    from PySide6.QtCore import Qt, QObject, Signal
    HAS_PYSIDE = True
except ImportError:
    HAS_PYSIDE = False
    class QObject:  # type: ignore
        def __init__(self, parent=None): pass
    def Signal(*args, **kwargs):  # type: ignore
        class _DummySignal:
            def connect(self, fn): pass
            def emit(self, *args): pass
        return _DummySignal()


class NexusTrayController(QObject):
    """Persistent Windows System Tray controller for Nexus OS v5.0."""

    mode_change_requested = Signal(str)
    estop_requested = Signal()
    open_workstation_requested = Signal()

    def __init__(self, notch_window=None, parent=None):
        super().__init__(parent)
        self.notch_window = notch_window
        self.db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
        self.log_dir = Path.home() / ".nexus-agent" / "logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)

        if HAS_PYSIDE and QApplication.instance():
            self.tray = QSystemTrayIcon(self._build_status_icon("#00f5d4"), self)
            self.tray.setToolTip("Nexus OS v5.0 — Sovereign Runtime [DEV]")
            self._build_context_menu()
            self.tray.activated.connect(self._on_tray_activated)
            self.tray.show()
        else:
            self.tray = None

    def _build_status_icon(self, hex_color: str) -> Optional[Any]:
        """Generates a crisp 64x64 anti-aliased orbital core tray icon in memory."""
        if not HAS_PYSIDE:
            return None
        pixmap = QPixmap(64, 64)
        pixmap.fill(Qt.GlobalColor.transparent)

        painter = QPainter(pixmap)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Outer orbital ring
        pen_color = QColor(hex_color)
        pen_color.setAlpha(180)
        painter.setPen(pen_color)
        painter.setBrush(Qt.BrushStyle.NoBrush)
        painter.drawEllipse(6, 6, 52, 52)

        # Inner glowing core
        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QColor(hex_color))
        painter.drawEllipse(18, 18, 28, 28)
        painter.end()

        return QIcon(pixmap)

    def _build_context_menu(self) -> None:
        if not HAS_PYSIDE:
            return
        self.menu = QMenu()
        self.menu.setStyleSheet("""
            QMenu {
                background-color: #090A0F;
                color: #E2E8F0;
                border: 1px solid #1E293B;
                padding: 6px;
                font-family: 'Segoe UI', sans-serif;
                font-size: 12px;
            }
            QMenu::item {
                padding: 6px 24px 6px 12px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background-color: #1E293B;
                color: #00F5D4;
            }
            QMenu::separator {
                height: 1px;
                background: #1E293B;
                margin: 4px 0px;
            }
        """)

        # 1. Emergency Stop (E-STOP) at the very top for instant access
        self.estop_action = QAction("🛑 TRIGGER E-STOP (Halt All Agents)", self)
        self.estop_action.triggered.connect(self.trigger_estop)
        self.menu.addAction(self.estop_action)
        self.menu.addSeparator()

        # 2. Show / Hide Notch & Open Command Center
        self.open_cc_action = QAction("🌐 Open Nexus Command Center", self)
        self.open_cc_action.triggered.connect(self.open_workstation_requested.emit)
        self.menu.addAction(self.open_cc_action)

        self.toggle_notch_action = QAction("👁️ Toggle Top Notch HUD", self)
        self.toggle_notch_action.triggered.connect(self.toggle_notch_visibility)
        self.menu.addAction(self.toggle_notch_action)
        self.menu.addSeparator()

        # 3. Neural Workspace Mode Switcher Submenu
        self.mode_menu = self.menu.addMenu("⚡ Neural Workspace Mode")
        self.mode_group = QActionGroup(self)
        self.mode_actions = {}
        for mode in ["DEV", "STUDY", "STUDIO", "SILENT"]:
            action = QAction(f"[{mode}] Mode", self, checkable=True)
            if mode == "DEV":
                action.setChecked(True)
            action.triggered.connect(lambda checked, m=mode: self.set_workspace_mode(m))
            self.mode_group.addAction(action)
            self.mode_menu.addAction(action)
            self.mode_actions[mode] = action

        self.menu.addSeparator()

        # 4. Logs & Diagnostics
        self.logs_action = QAction("📋 Open Boot & Telemetry Logs", self)
        self.logs_action.triggered.connect(self.open_logs)
        self.menu.addAction(self.logs_action)

        # 5. One-Click Restart & Clean Exit
        self.restart_action = QAction("🔄 Restart Unified Nexus OS", self)
        self.restart_action.triggered.connect(self.restart_nexus)
        self.menu.addAction(self.restart_action)

        self.quit_action = QAction("⏻ Quit Nexus OS", self)
        self.quit_action.triggered.connect(self.quit_nexus)
        self.menu.addAction(self.quit_action)

        if self.tray:
            self.tray.setContextMenu(self.menu)

    def _on_tray_activated(self, reason: Any) -> None:
        if not HAS_PYSIDE:
            return
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self.toggle_notch_visibility()
        elif reason == QSystemTrayIcon.ActivationReason.DoubleClick:
            self.open_workstation_requested.emit()

    def toggle_notch_visibility(self) -> None:
        if self.notch_window:
            if self.notch_window.isVisible():
                self.notch_window.hide()
            else:
                self.notch_window.show()
                self.notch_window.raise_()

    def set_workspace_mode(self, mode: str) -> None:
        if HAS_PYSIDE and mode in self.mode_actions:
            self.mode_actions[mode].setChecked(True)
        if self.tray and HAS_PYSIDE:
            self.tray.setToolTip(f"Nexus OS v5.0 — Sovereign Runtime [{mode}]")
            color_map = {
                "DEV": "#00f5d4",
                "STUDY": "#f59e0b",
                "STUDIO": "#a855f7",
                "SILENT": "#64748b",
            }
            icon = self._build_status_icon(color_map.get(mode, "#00f5d4"))
            if icon:
                self.tray.setIcon(icon)

        # Write to SQLite WAL
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self.db_path, timeout=5.0) as conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS system_flags (
                        flag_key TEXT PRIMARY KEY,
                        flag_value TEXT,
                        updated_at REAL NOT NULL
                    )
                """)
                conn.execute("""
                    INSERT INTO system_flags (flag_key, flag_value, updated_at)
                    VALUES ('active_mode', ?, strftime('%s', 'now'))
                    ON CONFLICT(flag_key) DO UPDATE SET flag_value=?, updated_at=strftime('%s', 'now')
                """, (mode, mode))
                conn.commit()
        except Exception as exc:
            print(f"[Tray Workspace SQLite Error]: {exc}", file=sys.stderr)

        self.mode_change_requested.emit(mode)

    def trigger_estop(self) -> None:
        """Atomically writes ESTOP = 1 to SQLite WAL and halts active slices."""
        if self.tray and HAS_PYSIDE:
            icon = self._build_status_icon("#f43f5e")
            if icon:
                self.tray.setIcon(icon)
            self.tray.setToolTip("Nexus OS v5.0 — 🛑 E-STOP TRIGGERED (All Slices Halted)")
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(self.db_path, timeout=5.0) as conn:
                conn.execute("PRAGMA journal_mode = WAL;")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS system_flags (
                        flag_key TEXT PRIMARY KEY,
                        flag_value TEXT,
                        updated_at REAL NOT NULL
                    )
                """)
                conn.execute("""
                    INSERT INTO system_flags (flag_key, flag_value, updated_at)
                    VALUES ('ESTOP', '1', strftime('%s', 'now'))
                    ON CONFLICT(flag_key) DO UPDATE SET flag_value='1', updated_at=strftime('%s', 'now')
                """)
                conn.commit()
        except Exception as exc:
            print(f"[Tray E-Stop SQLite Error]: {exc}", file=sys.stderr)

        self.estop_requested.emit()
        if self.tray and HAS_PYSIDE:
            self.tray.showMessage(
                "Nexus OS — Emergency Stop Triggered",
                "All execution slices, UIA clicks, and TTS streams have been halted.",
                QSystemTrayIcon.MessageIcon.Critical,
                3000,
            )

    def open_logs(self) -> None:
        """Opens ~/.nexus-agent/logs/nexus_boot.log in default editor."""
        boot_log = self.log_dir / "nexus_boot.log"
        if not boot_log.exists():
            boot_log.write_text("Nexus OS v5.0 Boot Log Initialized.\n", encoding="utf-8")
        if sys.platform == "win32":
            os.startfile(str(boot_log))

    def restart_nexus(self) -> None:
        """Spawns fresh windowless Nexus supervisor on WinSta0\\Default and exits."""
        workspace_root = Path(__file__).resolve().parents[2]
        nexus_entry = workspace_root / "nexus.py"
        pythonw_exe = Path(sys.executable).with_name("pythonw.exe")
        runner = str(pythonw_exe if pythonw_exe.exists() else sys.executable)

        si = subprocess.STARTUPINFO()
        si.lpDesktop = "WinSta0\\Default"
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = subprocess.SW_HIDE

        subprocess.Popen(
            [runner, str(nexus_entry)],
            cwd=str(workspace_root),
            startupinfo=si,
            creationflags=subprocess.CREATE_NO_WINDOW | 0x00000008,
        )
        self.quit_nexus()

    def quit_nexus(self) -> None:
        if self.tray and HAS_PYSIDE:
            self.tray.hide()
        if HAS_PYSIDE and QApplication.instance():
            QApplication.quit()
