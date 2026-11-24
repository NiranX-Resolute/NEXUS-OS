"""Nexus Notch HUD - Drag & Drop File Shelf Component.

Provides a multi-file drag-and-drop drop zone directly integrated into the
dynamic island notch for immediate agent ingestion, indexing, and MCP sharing.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import os
from pathlib import Path
import threading
import time
from typing import Dict, List, Optional, Sequence, Tuple, Union
import urllib.request

from apps.notch_hud.file_shelf import wait_for_file_stability

try:
    from PySide6.QtCore import QMimeData, QPoint, Qt, QUrl, Signal, QTimer
    from PySide6.QtGui import QColor, QDragEnterEvent, QDragLeaveEvent, QDropEvent, QIcon, QPainter
    from PySide6.QtWidgets import (
        QFrame,
        QHBoxLayout,
        QLabel,
        QListWidget,
        QListWidgetItem,
        QPushButton,
        QScrollArea,
        QVBoxLayout,
        QWidget,
    )
    HAS_PYSIDE = True
except ImportError:
    HAS_PYSIDE = False

    class QWidget:  # type: ignore
        def __init__(self, parent=None, *args, **kwargs):
            self.parent = parent
            self._accept_drops = False
            self._visible = True
            self._style = ""
            self._layout = None

        def setAcceptDrops(self, val):
            self._accept_drops = bool(val)

        def setVisible(self, val):
            self._visible = bool(val)

        def isVisible(self):
            return self._visible

        def isHidden(self):
            return not self._visible

        def show(self):
            self._visible = True

        def hide(self):
            self._visible = False

        def setStyleSheet(self, style):
            self._style = str(style)

        def styleSheet(self):
            return self._style

        def setLayout(self, layout):
            self._layout = layout

        def layout(self):
            return self._layout

        def setObjectName(self, name):
            self._object_name = str(name)

        def objectName(self):
            return getattr(self, "_object_name", "")

        def setFixedHeight(self, *args): return None
        def setFixedWidth(self, *args): return None
        def setFixedSize(self, *args): return None

    class QFrame(QWidget):
        def setFrameShape(self, *args): return None

    class QLabel(QWidget):
        def __init__(self, text="", parent=None, *args, **kwargs):
            super().__init__(parent=parent, *args, **kwargs)
            self._text = str(text)

        def setText(self, text):
            self._text = str(text)

        def text(self):
            return self._text

        def setAlignment(self, *args): return None
        def setWordWrap(self, *args): return None

    class QPushButton(QWidget):
        def __init__(self, text="", parent=None, *args, **kwargs):
            super().__init__(parent=parent, *args, **kwargs)
            self._text = str(text)
            self.clicked = Signal()

        def setText(self, text):
            self._text = str(text)

        def text(self):
            return self._text

        def setCursor(self, *args): return None

    class QScrollArea(QWidget):
        def __init__(self, parent=None, *args, **kwargs):
            super().__init__(parent=parent, *args, **kwargs)
            self._widget = None

        def setWidgetResizable(self, *args): return None
        def setWidget(self, w): self._widget = w
        def widget(self): return self._widget

    class QListWidgetItem:
        def __init__(self, *args, **kwargs):
            self._text = args[0] if args else ""

    class QListWidget(QWidget):
        def __init__(self, parent=None, *args, **kwargs):
            super().__init__(parent=parent, *args, **kwargs)
            self._items = []

        def addItem(self, item):
            self._items.append(item)

        def clear(self):
            self._items.clear()

        def count(self):
            return len(self._items)

    class _HeadlessLayout:
        def __init__(self, parent=None, *args, **kwargs):
            self._widgets = []
            if parent and hasattr(parent, "setLayout"):
                parent.setLayout(self)

        def setContentsMargins(self, *args): return None
        def setSpacing(self, *args): return None
        def addWidget(self, w, *args, **kwargs): self._widgets.append(w)
        def addLayout(self, *args, **kwargs): return None
        def addStretch(self, *args): return None
        def count(self): return len(self._widgets)

    class QVBoxLayout(_HeadlessLayout):
        def __init__(self, parent=None, *args, **kwargs):
            super().__init__(parent, *args, **kwargs)

    class QHBoxLayout(_HeadlessLayout):
        def __init__(self, parent=None, *args, **kwargs):
            super().__init__(parent, *args, **kwargs)

    class Qt:
        AlignCenter = 0x0004
        PointingHandCursor = 0x000D

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

logger = logging.getLogger("nexus.notch_hud.shelf")

try:
    from file_shelf import FileShelfStaging, IngestedFile, wait_for_file_stability
except (ImportError, ValueError):
    try:
        from apps.notch_hud.file_shelf import FileShelfStaging, IngestedFile, wait_for_file_stability
    except ImportError:
        from .file_shelf import FileShelfStaging, IngestedFile, wait_for_file_stability


class NexusDragShelf(QWidget):
    """Multi-file drag-and-drop shelf embedded in the Nexus Dynamic Notch HUD."""

    # Signals for agent and MCP integration
    files_dropped = Signal(list)  # list of file paths (str)
    ingest_requested = Signal(list)  # list of IngestedFile objects
    mcp_share_requested = Signal(list)  # list of IngestedFile objects
    shelf_warning = Signal(str)  # Non-blocking shelf warning
    file_batch_ready = Signal(list)  # list of processed IngestedFile objects

    SHELF_STORAGE_DIR = Path.home() / ".nexus-agent" / "shelf"

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        if HAS_PYSIDE:
            from PySide6.QtWidgets import QApplication
            if QApplication.instance() is None:
                QApplication(["nexus", "-platform", "offscreen"])
        super().__init__(parent)
        self.setAcceptDrops(True)
        self._ensure_storage_dir()
        self._staging = FileShelfStaging(self.SHELF_STORAGE_DIR)
        self._staged_files: List[IngestedFile] = self._staging.staged_files
        self._warning_timer: Optional[Any] = None

        self.shelf_warning.connect(self.show_shelf_warning)
        self.file_batch_ready.connect(self._on_file_batch_ready)
        self._setup_ui()

    def _ensure_storage_dir(self) -> None:
        """Ensures ~/.nexus-agent/shelf exists for persistent indexing."""
        try:
            self.SHELF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.warning("Could not create shelf storage directory: %s", exc)

    def _setup_ui(self) -> None:
        """Initializes the drop zone and staged files list UI."""
        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(6, 6, 6, 6)
        self.layout.setSpacing(6)

        # Drop Zone Frame
        self.drop_frame = QFrame(self)
        self.drop_frame.setObjectName("dropFrame")
        self.drop_frame_layout = QVBoxLayout(self.drop_frame)
        self.drop_frame_layout.setContentsMargins(8, 8, 8, 8)
        self.drop_frame_layout.setSpacing(4)

        self.drop_icon_label = QLabel("📥", self.drop_frame)
        self.drop_icon_label.setAlignment(Qt.AlignCenter)
        self.drop_icon_label.setStyleSheet("font-size: 16px; color: #38BDF8;")
        self.drop_frame_layout.addWidget(self.drop_icon_label)

        self.drop_text_label = QLabel(
            "Drop files to ingest into Nexus Agent or share via MCP",
            self.drop_frame,
        )
        self.drop_text_label.setAlignment(Qt.AlignCenter)
        self.drop_text_label.setWordWrap(True)
        self.drop_text_label.setStyleSheet("color: #94A3B8; font-size: 11px;")
        self.drop_frame_layout.addWidget(self.drop_text_label)

        self._set_normal_drop_style()
        self.layout.addWidget(self.drop_frame)

        # Staged Files List (Initially hidden until files are dropped)
        self.file_list_widget = QListWidget(self)
        self.file_list_widget.setFixedHeight(64)
        self.file_list_widget.setStyleSheet("""
            QListWidget {
                background-color: rgba(15, 23, 42, 0.85);
                border: 1px solid rgba(56, 189, 248, 0.25);
                border-radius: 6px;
                color: #E2E8F0;
                font-size: 11px;
                padding: 2px;
            }
            QListWidget::item {
                padding: 3px 6px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            QListWidget::item:hover {
                background-color: rgba(56, 189, 248, 0.15);
                color: #38BDF8;
            }
        """)
        self.file_list_widget.setVisible(False)
        self.layout.addWidget(self.file_list_widget)

        # Action Button Row (Ingest, Share MCP, Clear)
        self.actions_row = QWidget(self)
        self.actions_layout = QHBoxLayout(self.actions_row)
        self.actions_layout.setContentsMargins(0, 0, 0, 0)
        self.actions_layout.setSpacing(6)

        self.btn_ingest = QPushButton("⚡ Ingest Agent", self.actions_row)
        self.btn_ingest.setStyleSheet("""
            QPushButton {
                background-color: #0284C7;
                color: #FFFFFF;
                font-weight: 600;
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #0369A1;
            }
        """)
        self.btn_ingest.clicked.connect(self._handle_ingest_click)
        self.actions_layout.addWidget(self.btn_ingest)

        self.btn_mcp_share = QPushButton("🌐 MCP Share", self.actions_row)
        self.btn_mcp_share.setStyleSheet("""
            QPushButton {
                background-color: rgba(56, 189, 248, 0.15);
                color: #38BDF8;
                border: 1px solid rgba(56, 189, 248, 0.35);
                font-weight: 600;
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: rgba(56, 189, 248, 0.3);
            }
        """)
        self.btn_mcp_share.clicked.connect(self._handle_mcp_share_click)
        self.actions_layout.addWidget(self.btn_mcp_share)

        self.btn_clear = QPushButton("Clear", self.actions_row)
        self.btn_clear.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #64748B;
                font-size: 10px;
                padding: 4px 6px;
                border-radius: 4px;
            }
            QPushButton:hover {
                color: #EF4444;
                background-color: rgba(239, 68, 68, 0.1);
            }
        """)
        self.btn_clear.clicked.connect(self.clear_shelf)
        self.actions_layout.addWidget(self.btn_clear)

        self.actions_row.setVisible(False)
        self.layout.addWidget(self.actions_row)

    def _set_normal_drop_style(self) -> None:
        """Applies default styling to the drop frame."""
        if not HAS_PYSIDE:
            return
        self.drop_frame.setStyleSheet("""
            #dropFrame {
                background-color: rgba(15, 23, 42, 0.6);
                border: 1px dashed rgba(56, 189, 248, 0.4);
                border-radius: 8px;
            }
        """)
        self.drop_text_label.setText("Drop files to ingest into Nexus Agent or share via MCP")

    def _set_active_drop_style(self) -> None:
        """Applies glowing cyan highlight while dragging over."""
        if not HAS_PYSIDE:
            return
        self.drop_frame.setStyleSheet("""
            #dropFrame {
                background-color: rgba(56, 189, 248, 0.15);
                border: 2px dashed #38BDF8;
                border-radius: 8px;
            }
        """)
        self.drop_text_label.setText("Release to stage files into Nexus Shelf")

    # -------------------------------------------------------------------------
    # Drag and Drop Event Overrides
    # -------------------------------------------------------------------------
    def dragEnterEvent(self, event: QDragEnterEvent) -> None:
        """Accepts drags containing file URLs."""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
            self._set_active_drop_style()
        else:
            event.ignore()

    def dragMoveEvent(self, event) -> None:
        """Maintains proposed action acceptance during drag move."""
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragLeaveEvent(self, event: QDragLeaveEvent) -> None:
        """Restores normal drop styling when drag leaves."""
        self._set_normal_drop_style()
        event.accept()

    def dropEvent(self, event: QDropEvent) -> None:
        """Extracts files, computes metadata and stages them into the shelf."""
        self._set_normal_drop_style()
        urls = event.mimeData().urls()
        if not urls:
            event.ignore()
            return

        dropped_paths: List[str] = []
        for url in urls:
            local_path = url.toLocalFile()
            if local_path and os.path.exists(local_path):
                dropped_paths.append(local_path)

        if dropped_paths:
            self.add_files(dropped_paths, async_mode=True)
            event.acceptProposedAction()
        else:
            event.ignore()

    @staticmethod
    def wait_for_file_stability(
        path: Union[str, Path],
        interval_ms: int = 150,
        max_attempts: int = 10,
    ) -> bool:
        """Verifies that a file's size is stable and has non-exclusive read access."""
        return wait_for_file_stability(path, interval_ms, max_attempts)

    @staticmethod
    def wait_for_file_stability_and_hash(path: str, stability_window_sec: float = 0.15) -> Tuple[int, str]:
        """
        Polls file size stability over stability_window_sec (150ms default) and reads SHA-256 hash
        with PermissionError retry protection against partially copied or locked files.
        """
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path):
            return 0, ""
        if os.path.isdir(abs_path):
            return 0, "directory"

        # 1. Size stability polling over stability window (150ms default)
        check_interval = max(0.02, stability_window_sec / 3.0)
        last_size = -1
        for _ in range(4):
            try:
                current_size = os.path.getsize(abs_path)
                if current_size == last_size and last_size >= 0:
                    break
                last_size = current_size
            except Exception as exc:
                logger.debug("File size check notice: %s", exc)
            time.sleep(check_interval)

        final_size = last_size if last_size >= 0 else (os.path.getsize(abs_path) if os.path.exists(abs_path) else 0)

        # 2. Resilient file open with lock retry
        file_hash = ""
        h = hashlib.sha256()
        for attempt in range(4):
            try:
                with open(abs_path, "rb") as fp:
                    chunk = fp.read(10 * 1024 * 1024)
                    h.update(chunk)
                file_hash = h.hexdigest()
                break
            except PermissionError:
                if attempt < 3:
                    time.sleep(0.05)
                else:
                    logger.warning("PermissionError accessing file %s after retries", abs_path)
            except Exception as exc:
                logger.warning("Error reading file %s: %s", abs_path, exc)
                break

        return final_size, file_hash

    # -------------------------------------------------------------------------
    # File Processing & Ledger Sync
    # -------------------------------------------------------------------------
    def add_files(self, paths: List[str], async_mode: bool = False) -> None:
        """Processes and stages files into the shelf.

        When async_mode is True and PySide6 is active, stability checks and SHA-256
        computations run off the main UI thread to prevent paint/rendering freezes.
        """
        if async_mode and HAS_PYSIDE:
            worker = threading.Thread(
                target=self._process_dropped_files_worker,
                args=(paths,),
                daemon=True,
                name="NexusDragShelfWorker",
            )
            worker.start()
        else:
            self._process_dropped_files_worker(paths)

    def _process_dropped_files_worker(self, paths: List[str]) -> None:
        """Worker executing off the main UI thread to verify file stability and compute hashes."""
        new_items: List[IngestedFile] = []
        has_locked_file = False

        for p in paths:
            abs_path = os.path.abspath(p)
            if any(f.path == abs_path for f in self._staged_files):
                continue

            is_dir = os.path.isdir(abs_path)
            size = 0
            file_hash = ""

            try:
                if not is_dir:
                    # Before computing SHA-256 or staging, verify file stability
                    stable = wait_for_file_stability(abs_path, interval_ms=150, max_attempts=10)
                    if not stable:
                        has_locked_file = True
                        logger.warning(
                            "File %s still locked/downloading after max attempts. Warning: File still downloading — retry drop",
                            abs_path,
                        )
                        continue

                    size, file_hash = self.wait_for_file_stability_and_hash(abs_path)
                else:
                    file_hash = "directory"
            except Exception as exc:
                logger.warning("Error inspecting file %s: %s", abs_path, exc)
                continue

            item = IngestedFile(
                name=os.path.basename(abs_path),
                path=abs_path,
                size_bytes=size,
                is_dir=is_dir,
                extension=os.path.splitext(abs_path)[1].lower(),
                sha256=file_hash,
                timestamp=time.time(),
            )
            new_items.append(item)

        if has_locked_file:
            if HAS_PYSIDE and hasattr(self, "shelf_warning"):
                self.shelf_warning.emit("File still downloading — retry drop")
            else:
                self.show_shelf_warning("File still downloading — retry drop")

        if HAS_PYSIDE and hasattr(self, "file_batch_ready") and threading.current_thread() != threading.main_thread():
            self.file_batch_ready.emit(new_items)
        else:
            self._on_file_batch_ready(new_items)

    def _on_file_batch_ready(self, new_items: List[IngestedFile]) -> None:
        """Receives processed items on the main GUI thread and updates UI and ledger."""
        for item in new_items:
            if not any(f.path == item.path for f in self._staged_files):
                self._staged_files.append(item)

        self._refresh_list_view()
        self._persist_shelf_ledger()

        if new_items:
            raw_paths = [item.path for item in new_items]
            self.files_dropped.emit(raw_paths)
            logger.info("Staged %d file(s) into Nexus Drag Shelf", len(new_items))

    def show_shelf_warning(self, message: str = "File still downloading — retry drop", duration_ms: int = 3000) -> None:
        """Displays a clean non-blocking shelf warning or toast without crashing."""
        logger.warning("[SHELF WARNING] %s", message)
        if hasattr(self, "drop_frame") and self.drop_frame:
            self.drop_frame.setVisible(True)
        is_mcp = "mcp" in message.lower() or "staged" in message.lower() or "shared" in message.lower()
        if hasattr(self, "drop_icon_label") and self.drop_icon_label:
            self.drop_icon_label.setText("🌐" if is_mcp else "⚠️")
        if hasattr(self, "drop_text_label") and self.drop_text_label:
            self.drop_text_label.setText(message)
            color = "#38BDF8" if is_mcp else "#F59E0B"
            self.drop_text_label.setStyleSheet(f"color: {color}; font-size: 11px; font-weight: 600;")

        if HAS_PYSIDE:
            if not hasattr(self, "_warning_timer") or self._warning_timer is None:
                self._warning_timer = QTimer(self)
                self._warning_timer.setSingleShot(True)
                self._warning_timer.timeout.connect(self._reset_drop_label)
            self._warning_timer.start(duration_ms)

    def _reset_drop_label(self) -> None:
        """Resets drop label to normal styling after warning expires."""
        if not HAS_PYSIDE:
            return
        if hasattr(self, "drop_icon_label") and self.drop_icon_label:
            self.drop_icon_label.setText("📥")
        if hasattr(self, "drop_text_label") and self.drop_text_label:
            self.drop_text_label.setStyleSheet("color: #94A3B8; font-size: 11px;")
        self._set_normal_drop_style()

    def _refresh_list_view(self) -> None:
        """Updates QListWidget and visibility of controls based on staged files."""
        if not HAS_PYSIDE:
            return
        self.file_list_widget.clear()

        if not self._staged_files:
            self.file_list_widget.setVisible(False)
            self.actions_row.setVisible(False)
            self.drop_frame.setVisible(True)
            return

        self.drop_frame.setVisible(False)
        self.file_list_widget.setVisible(True)
        self.actions_row.setVisible(True)

        for item in self._staged_files:
            icon_str = "📁" if item.is_dir else "📄"
            label = f"{icon_str} {item.name} ({item.format_size()})"
            list_item = QListWidgetItem(label)
            list_item.setToolTip(item.path)
            self.file_list_widget.addItem(list_item)

    def _persist_shelf_ledger(self) -> None:
        """Writes current shelf ledger to ~/.nexus-agent/shelf/index.json for external tools."""
        ledger_path = self.SHELF_STORAGE_DIR / "index.json"
        try:
            data = [asdict(f) for f in self._staged_files]
            with open(ledger_path, "w", encoding="utf-8") as fp:
                json.dump(data, fp, indent=2)
        except Exception as exc:
            logger.warning("Failed to persist shelf ledger to %s: %s", ledger_path, exc)

    def _handle_ingest_click(self) -> None:
        """Emits ingest signal for active agent conversation or workspace memory."""
        if self._staged_files:
            logger.info("Triggering Ingest for %d files", len(self._staged_files))
            self.ingest_requested.emit(list(self._staged_files))

    def _handle_mcp_share_click(self) -> None:
        """Emits MCP share signal to export files to active MCP server instances."""
        if self._staged_files:
            logger.info("Triggering MCP share for %d files", len(self._staged_files))
            staged_list = list(self._staged_files)
            self.mcp_share_requested.emit(staged_list)
            self._post_mcp_share_files(staged_list)

    def _post_mcp_share_files(self, staged_files: List[IngestedFile]) -> None:
        """Posts staged files with SHA-256 to /api/mcp/share-files and displays 3-second toast."""
        def _worker() -> None:
            count = len(staged_files)
            try:
                token = os.environ.get("NEXUS_IPC_TOKEN", "")
                payload = {
                    "files": [
                        {
                            "name": f.name,
                            "path": f.path,
                            "sha256": f.sha256,
                            "size": f.format_size(),
                            "is_dir": f.is_dir,
                        }
                        for f in staged_files
                    ],
                    "namespace": "dev_context",
                }
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    "http://127.0.0.1:47630/api/mcp/share-files",
                    data=data,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {token}",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    logger.info("Shared %d file(s) to MCP bus via POST /api/mcp/share-files: %s", count, resp_data)
            except Exception as exc:
                logger.debug("POST /api/mcp/share-files error: %s. Using local SovereignMemoryStore fallback.", exc)
                try:
                    from core.memory.sovereign_store import SovereignMemoryStore
                    store = SovereignMemoryStore()
                    for f in staged_files:
                        store.store_memory(
                            title=f"MCP Shared Resource: {f.name}",
                            content=f"Resource Path: {f.path}\nSHA256: {f.sha256}\nSize: {f.format_size()}",
                            namespace="dev_context",
                            metadata={"name": f.name, "path": f.path, "sha256": f.sha256, "shared_via": "MCP_DRAG_SHELF"},
                        )
                except Exception as db_exc:
                    logger.debug("Local store MCP share fallback error: %s", db_exc)

            # Display 3-second toast on GUI thread
            msg = f"Shared {count} file(s) via MCP & SQLite"
            if HAS_PYSIDE:
                QTimer.singleShot(0, lambda: self.show_shelf_warning(msg, duration_ms=3000))
            else:
                self.show_shelf_warning(msg, duration_ms=3000)

        t = threading.Thread(target=_worker, daemon=True, name="MCPShareShelfWorker")
        t.start()

    def share_to_mcp(self, base_url: str = "http://127.0.0.1:47630") -> dict:
        """Dispatches staged files directly to POST http://127.0.0.1:47630/api/mcp/share-files and emits signal."""
        if not self._staged_files:
            return {"success": False, "count": 0, "error": "No staged files"}

        import json
        import urllib.request
        files_data = []
        for f in self._staged_files:
            files_data.append({
                "name": f.name,
                "path": f.path,
                "sha256": f.sha256,
                "size": f.format_size(),
            })

        payload = {"files": files_data, "namespace": "dev_context"}
        res = {"success": True, "count": len(files_data), "files": files_data}
        try:
            req = urllib.request.Request(
                f"{base_url}/api/mcp/share-files",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            logger.debug("Direct MCP share POST notice: %s", exc)

        self.mcp_share_requested.emit(list(self._staged_files))
        return res

    def clear_shelf(self) -> None:
        """Clears all staged files from shelf."""
        if hasattr(self, "_staging") and self._staging:
            self._staging.clear_shelf()
        self._staged_files.clear()
        self._refresh_list_view()
        self._persist_shelf_ledger()
        self._set_normal_drop_style()
