"""Test suite for Nexus Notch HUD surface components.

Verifies:
1. notch_window.py: Dynamic Notch HUD dimensions (collapsed 280x36, expanded 540x140),
   rounded rect (radius 18), dark theme (#090d16), cyan status (#00f0ff),
   trigger_approval_gate Slot with QPropertyAnimation morphing.
2. fullscreen_guard.py: SHQueryUserNotificationState check for DX/OpenGL fullscreen games,
   presentation, and meeting detection. set_window_stealth_affinity with
   WDA_EXCLUDEFROMCAPTURE (0x00000011).
3. file_shelf.py: FileShelfStaging in ~/.nexus-agent/shelf with stage_files and clear_shelf.
"""

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

# Ensure root is in sys.path
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from apps.notch_hud.fullscreen_guard import (
    QUERY_USER_NOTIFICATION_STATE,
    WDA_EXCLUDEFROMCAPTURE,
    WDA_MONITOR,
    WDA_NONE,
    FullscreenGuard,
    get_user_notification_state,
    is_fullscreen_app_active,
    is_fullscreen_game_active,
    is_meeting_active,
    is_presentation_active,
    set_window_stealth_affinity,
    should_suppress_hud,
)
from apps.notch_hud.file_shelf import FileShelfStaging, IngestedFile
from apps.notch_hud.notch_window import NexusNotchWindow


class TestFullscreenGuard(unittest.TestCase):
    """Verifies Win32 notification state query and OBS stealth capture exclusion."""

    def test_win32_constants(self):
        self.assertEqual(WDA_NONE, 0x00000000)
        self.assertEqual(WDA_MONITOR, 0x00000001)
        self.assertEqual(WDA_EXCLUDEFROMCAPTURE, 0x00000011)

    def test_query_user_notification_state_enum(self):
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_NOT_PRESENT, 1)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY, 2)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN, 3)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE, 4)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS, 5)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_QUIET_TIME, 6)
        self.assertEqual(QUERY_USER_NOTIFICATION_STATE.QUNS_APP, 7)

    def test_set_window_stealth_affinity_invalid_hwnd(self):
        # 0 HWND should safely return False without crashing
        self.assertFalse(set_window_stealth_affinity(0))

    def test_set_window_stealth_affinity_capture_override(self):
        # With NEXUS_NOTCH_CAPTURE=1, should bypass exclusion
        with patch.dict(os.environ, {"NEXUS_NOTCH_CAPTURE": "1"}):
            self.assertTrue(set_window_stealth_affinity(12345))

    @patch("apps.notch_hud.fullscreen_guard.get_user_notification_state")
    def test_dx_opengl_fullscreen_game_detection(self, mock_state):
        mock_state.return_value = QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN
        self.assertTrue(is_fullscreen_game_active())
        self.assertTrue(is_fullscreen_app_active())
        self.assertTrue(should_suppress_hud())

    @patch("apps.notch_hud.fullscreen_guard.get_user_notification_state")
    def test_presentation_detection(self, mock_state):
        mock_state.return_value = QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE
        self.assertTrue(is_presentation_active())
        self.assertTrue(is_fullscreen_app_active())
        self.assertTrue(should_suppress_hud())

    @patch("apps.notch_hud.fullscreen_guard.get_user_notification_state")
    def test_meeting_detection_busy_state(self, mock_state):
        mock_state.return_value = QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY
        self.assertTrue(is_meeting_active())
        self.assertTrue(is_fullscreen_app_active())
        self.assertTrue(should_suppress_hud())

    @patch("apps.notch_hud.fullscreen_guard.get_user_notification_state")
    def test_not_suppressed_when_accepts_notifications(self, mock_state):
        mock_state.return_value = QUERY_USER_NOTIFICATION_STATE.QUNS_ACCEPTS_NOTIFICATIONS
        self.assertFalse(is_fullscreen_game_active())
        self.assertFalse(is_presentation_active())
        self.assertFalse(is_fullscreen_app_active())
        self.assertFalse(should_suppress_hud())

    @patch("apps.notch_hud.fullscreen_guard.should_suppress_hud")
    def test_fullscreen_guard_manager_callbacks(self, mock_suppress):
        suppress_calls = []
        restore_calls = []

        guard = FullscreenGuard(
            on_suppress=lambda: suppress_calls.append(True),
            on_restore=lambda: restore_calls.append(True),
        )

        # 1. Transition to suppressed
        mock_suppress.return_value = True
        state = guard.poll_guard()
        self.assertTrue(state)
        self.assertTrue(guard.is_suppressed)
        self.assertEqual(len(suppress_calls), 1)
        self.assertEqual(len(restore_calls), 0)

        # 2. Polling again while still suppressed should not re-trigger callback
        guard.poll_guard()
        self.assertEqual(len(suppress_calls), 1)

        # 3. Transition to restored
        mock_suppress.return_value = False
        state = guard.poll_guard()
        self.assertFalse(state)
        self.assertFalse(guard.is_suppressed)
        self.assertEqual(len(restore_calls), 1)


class TestFileShelfStaging(unittest.TestCase):
    """Verifies FileShelfStaging file ingestion, hashing, ledger persistence, and clearing."""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="nexus_test_shelf_")
        self.shelf = FileShelfStaging(shelf_dir=self.test_dir)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_initialization(self):
        self.assertTrue(self.shelf.get_shelf_dir().exists())
        self.assertEqual(len(self.shelf.get_staged_files()), 0)

    def test_stage_files_single_and_multiple(self):
        # Create temp source files
        src1 = Path(self.test_dir) / "source1.txt"
        src1.write_text("Hello Nexus Notch HUD", encoding="utf-8")

        src2 = Path(self.test_dir) / "source2.json"
        src2.write_text('{"key": "value"}', encoding="utf-8")

        # Stage files
        staged = self.shelf.stage_files([src1, src2], copy_to_shelf=False)
        self.assertEqual(len(staged), 2)
        self.assertEqual(staged[0].name, "source1.txt")
        self.assertEqual(staged[1].name, "source2.json")
        self.assertTrue(len(staged[0].sha256) > 0)
        self.assertEqual(staged[0].extension, ".txt")

        # Verify ledger persistence on disk
        index_file = self.shelf.get_shelf_dir() / "index.json"
        self.assertTrue(index_file.exists())
        data = json.loads(index_file.read_text(encoding="utf-8"))
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "source1.txt")

    def test_format_size(self):
        f_b = IngestedFile("f.b", "/f.b", 500, False, ".b", "hash", time.time())
        self.assertEqual(f_b.format_size(), "500.0 B")

        f_kb = IngestedFile("f.kb", "/f.kb", 2048, False, ".kb", "hash", time.time())
        self.assertEqual(f_kb.format_size(), "2.0 KB")

        f_dir = IngestedFile("dir", "/dir", 0, True, "", "directory", time.time())
        self.assertEqual(f_dir.format_size(), "Folder")

    def test_remove_file(self):
        src = Path(self.test_dir) / "removable.txt"
        src.write_text("Remove me", encoding="utf-8")
        staged = self.shelf.stage_files(src, copy_to_shelf=False)
        self.assertEqual(len(self.shelf.get_staged_files()), 1)

        success = self.shelf.remove_file("removable.txt")
        self.assertTrue(success)
        self.assertEqual(len(self.shelf.get_staged_files()), 0)

    def test_clear_shelf(self):
        # Create a file inside shelf
        f1 = Path(self.test_dir) / "temp1.bin"
        f1.write_bytes(b"\x00\x01\x02\x03")
        self.shelf.stage_files(f1, copy_to_shelf=True)

        self.assertGreaterEqual(len(self.shelf.get_staged_files()), 1)
        removed_count = self.shelf.clear_shelf()
        self.assertGreaterEqual(removed_count, 1)
        self.assertEqual(len(self.shelf.get_staged_files()), 0)

        # Ledger index should be empty array
        index_file = self.shelf.get_shelf_dir() / "index.json"
        data = json.loads(index_file.read_text(encoding="utf-8"))
        self.assertEqual(data, [])


class TestNotchWindowHUD(unittest.TestCase):
    """Verifies NexusNotchWindow specifications: dimensions, theme, rounded rect, and approval gate."""

    @classmethod
    def setUpClass(cls):
        # Ensure QApplication is initialized offscreen (PySide6 or headless mock)
        try:
            from PySide6.QtWidgets import QApplication
            if QApplication.instance() is None:
                cls._app = QApplication(["nexus_test", "-platform", "offscreen"])
            else:
                cls._app = QApplication.instance()
        except ImportError:
            from apps.notch_hud.notch_window import QApplication
            cls._app = QApplication.instance()

    def setUp(self):
        self.window = NexusNotchWindow()

    def tearDown(self):
        if hasattr(self.window, "close"):
            self.window.close()

    def test_dynamic_notch_dimensions_specification(self):
        """Verifies collapsed 280x36 and expanded 540x140 specifications."""
        self.assertEqual(self.window.COLLAPSED_WIDTH, 280)
        self.assertEqual(self.window.COLLAPSED_HEIGHT, 36)
        self.assertEqual(self.window.EXPANDED_WIDTH, 540)
        self.assertEqual(self.window.EXPANDED_HEIGHT, 140)
        self.assertEqual(self.window.EXPANDED_HEIGHT_APPROVAL, 140)

    def test_theme_and_rounded_rect_styling(self):
        """Verifies dark theme (#090d16), cyan status (#00f0ff), and radius 18."""
        style = self.window.central_container.styleSheet()
        self.assertIn("#090d16", style)
        self.assertIn("#00f0ff", style)
        self.assertIn("border-bottom-left-radius: 18px", style)
        self.assertIn("border-bottom-right-radius: 18px", style)

        # Status label and dot styling (allows default cyan #00f0ff or synced theme accent #00f5d4)
        status_qss = self.window.status_label.styleSheet().lower()
        dot_qss = self.window.indicator_dot.styleSheet().lower()
        self.assertTrue("#00f0ff" in status_qss or "#00f5d4" in status_qss, f"Unexpected status style: {status_qss}")
        self.assertTrue("#00f0ff" in dot_qss or "#00f5d4" in dot_qss, f"Unexpected dot style: {dot_qss}")

    def test_trigger_approval_gate_morphing(self):
        """Verifies trigger_approval_gate Slot, animation target geometry, and Allow decision."""
        decision_record = []

        def on_decision(granted: bool):
            decision_record.append(granted)

        # Trigger approval gate
        result = self.window.trigger_approval_gate(
            action_label="DEPLOY_SMART_CONTRACT",
            target_desc="Gas limit: 50,000 | Destination: 0xDEADBEEF",
            callback=on_decision,
        )
        self.assertTrue(result)
        self.assertTrue(self.window._is_expanded)
        self.assertEqual(self.window._current_mode, "approval")

        # Verify animation target width is 540 and height is 140
        end_rect = self.window._anim.endValue()
        self.assertEqual(end_rect.width(), 540)
        self.assertEqual(end_rect.height(), 140)

        # Simulate user clicking Allow Action
        self.window._on_approval_decision(True)
        self.assertEqual(decision_record, [True])
        self.assertIn("APPROVED", self.window.status_label.text())

    def test_trigger_approval_gate_deny_decision(self):
        """Verifies Deny decision callback and status text."""
        decision_record = []

        self.window.trigger_approval_gate(
            action_label="TERMINATE_POD",
            target_desc="Pod: worker-replica-99",
            callback=lambda granted: decision_record.append(granted),
        )

        # Simulate user clicking Deny
        self.window._on_approval_decision(False)
        self.assertEqual(decision_record, [False])
        self.assertIn("DENIED", self.window.status_label.text())

    def test_collapse_notch_restores_collapsed_geometry(self):
        """Verifies collapse_notch targets 280x36 geometry."""
        self.window.expand_notch("TEST EXPAND", mode="status")
        self.assertTrue(self.window._is_expanded)

        self.window.collapse_notch()
        self.assertFalse(self.window._is_expanded)
        end_rect = self.window._anim.endValue()
        self.assertEqual(end_rect.width(), 280)
        self.assertEqual(end_rect.height(), 36)


class TestDynamicNotchHUDSync(unittest.TestCase):
    """Verifies Dynamic Notch HUD fixes:
    1. NexusDragShelf.mcp_share_requested connected to POST /api/mcp/share-files.
    2. Compact quick-mode icons (Shelf, REC, Media, Workstation, Cycle Theme, Expand) visibly accessible in header.
    3. Re-anchor on screenAdded/screenRemoved/geometryChanged.
    4. Dynamically sync QSS border glow and waveform to active theme from GET /api/themes.
    """

    @classmethod
    def setUpClass(cls):
        try:
            from PySide6.QtWidgets import QApplication
            if QApplication.instance() is None:
                cls._app = QApplication(["nexus_test", "-platform", "offscreen"])
            else:
                cls._app = QApplication.instance()
        except ImportError:
            from apps.notch_hud.notch_window import QApplication
            cls._app = QApplication.instance()

    def setUp(self):
        self.window = NexusNotchWindow()

    def tearDown(self):
        if hasattr(self.window, "close"):
            self.window.close()

    def test_mcp_share_requested_signal_connection_and_payload(self):
        """1. Verifies NexusDragShelf.mcp_share_requested is connected and dispatches MCP share."""
        self.assertTrue(hasattr(self.window.drag_shelf, "mcp_share_requested"))

        test_file = IngestedFile(
            name="test_contract.py",
            path="C:/tmp/test_contract.py",
            size_bytes=1024,
            is_dir=False,
            extension=".py",
            sha256="abc123def456",
            timestamp=time.time(),
        )

        self.window.drag_shelf.mcp_share_requested.emit([test_file])
        self.assertIn("MCP SHARED 1 FILES", self.window.status_label.text())

    @patch("urllib.request.urlopen")
    def test_post_mcp_share_files_http_dispatch(self, mock_urlopen):
        """1b. Verifies HTTP POST to http://127.0.0.1:47630/api/mcp/share-files."""
        mock_resp = MagicMock()
        mock_resp.read.return_value = json.dumps({"success": True, "count": 1, "namespace": "dev_context"}).encode("utf-8")
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        res = self.window.post_mcp_share_files(["C:/tmp/test_agent.py"])
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("count"), 1)
        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.full_url, "http://127.0.0.1:47630/api/mcp/share-files")
        self.assertEqual(req.get_method(), "POST")

    def test_quick_mode_icons_visibly_accessible_in_header(self):
        """2. Verifies compact quick-mode icons (Shelf, REC, Media, Workstation, Cycle Theme, Expand) visibly accessible in header."""
        self.window.show()
        self.assertIsNotNone(self.window.btn_shelf)
        self.assertIsNotNone(self.window.btn_rec)
        self.assertIsNotNone(self.window.btn_media)
        self.assertIsNotNone(self.window.btn_workstation)
        self.assertIsNotNone(self.window.btn_cycle_theme)
        self.assertIsNotNone(self.window.btn_toggle)

        for btn in (self.window.btn_shelf, self.window.btn_rec, self.window.btn_media,
                    self.window.btn_workstation, self.window.btn_cycle_theme, self.window.btn_toggle):
            self.assertTrue(btn.isVisible() or not btn.isHidden(), f"Button {btn.text()} should be visible in collapsed header")

        self.window.expand_notch("AGENT EXPANDED", mode="media")
        for btn in (self.window.btn_shelf, self.window.btn_rec, self.window.btn_media,
                    self.window.btn_workstation, self.window.btn_cycle_theme, self.window.btn_toggle):
            self.assertTrue(btn.isVisible() or not btn.isHidden(), f"Button {btn.text()} should be visible in expanded header")

        self.window.collapse_notch()
        for btn in (self.window.btn_shelf, self.window.btn_rec, self.window.btn_media,
                    self.window.btn_workstation, self.window.btn_cycle_theme, self.window.btn_toggle):
            self.assertTrue(btn.isVisible() or not btn.isHidden(), f"Button {btn.text()} should stay visible in collapsed header")

    def test_reanchor_on_screen_events(self):
        """3. Verifies re-anchor on screenAdded, screenRemoved, and geometryChanged."""
        geo_init = self.window.geometry()
        self.assertGreater(geo_init.width(), 0)

        self.window._on_screen_added(None)
        self.assertEqual(self.window.geometry().width(), self.window.COLLAPSED_WIDTH)

        self.window._on_geometry_changed(None)
        self.assertEqual(self.window.geometry().width(), self.window.COLLAPSED_WIDTH)

        self.window._on_screen_removed(None)
        self.assertEqual(self.window.geometry().width(), self.window.COLLAPSED_WIDTH)

        self.window.reanchor()
        self.assertEqual(self.window.geometry().width(), self.window.COLLAPSED_WIDTH)

    def test_dynamic_sync_border_glow_and_waveform_to_active_theme(self):
        """4. Verifies dynamic sync of QSS border glow and waveform to active theme from GET /api/themes."""
        cyber_theme = {
            "id": "emerald_cyber",
            "name": "Emerald Cyber",
            "tokens": {
                "accent_primary": "#10B981",
                "void_bg": "#022c22",
                "border_glow_intensity": 0.85,
                "text_primary": "#ECFDF5",
            }
        }

        self.window.apply_theme(cyber_theme)

        qss = self.window.central_container.styleSheet()
        self.assertIn("#022c22", qss)
        self.assertIn("#10B981", qss)
        self.assertIn("border: 1px solid rgba(16, 185, 129, 0.85)", qss)

        self.assertIn("#10B981", self.window.status_label.styleSheet())
        self.assertIn("#10B981", self.window.indicator_dot.styleSheet())

        waveform_color = self.window.media_bar.get_waveform_color()
        if hasattr(waveform_color, "name"):
            self.assertEqual(waveform_color.name().upper(), "#10B981")
        else:
            self.assertEqual(str(waveform_color).upper(), "#10B981")


if __name__ == "__main__":
    unittest.main()
