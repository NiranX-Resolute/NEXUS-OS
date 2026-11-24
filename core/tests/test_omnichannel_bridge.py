"""Unit tests for Omnichannel Edge & Cloud Mesh Bridge (core.edge.omnichannel_bridge)."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from core.edge.omnichannel_bridge import OmnichannelBridge, get_tailscale_ip
from core.runtime.slice_engine import SafetyGuard


class TestOmnichannelBridge(unittest.TestCase):
    """Test suite for OmnichannelBridge and edge mesh utilities."""

    def setUp(self):
        SafetyGuard.reset_estop()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_bridge.db"
        self.telegram_token = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
        self.chat_id = "987654321"
        self.bridge = OmnichannelBridge(
            telegram_token=self.telegram_token,
            telegram_chat_id=self.chat_id,
            discord_webhook_url="https://discord.com/api/webhooks/test/123",
            db_path=self.db_path,
            earbud_mode=False,
        )

    def tearDown(self):
        self.bridge.stop_background_service()
        self.bridge.reset_estop()
        SafetyGuard.reset_estop()
        self.temp_dir.cleanup()

    def test_initialization(self):
        """Verifies proper initialization of bridge and attributes."""
        self.assertEqual(self.bridge.telegram_token, self.telegram_token)
        self.assertEqual(self.bridge.telegram_chat_id, self.chat_id)
        self.assertFalse(self.bridge.estop_active)
        self.assertIsNotNone(self.bridge.desktop_engine_url)
        self.assertIsNotNone(self.bridge.cloudflare_worker_url)

    def test_tailscale_ip_detection(self):
        """Tests Tailscale IP detection logic."""
        with patch("subprocess.run") as mock_run:
            mock_proc = MagicMock()
            mock_proc.returncode = 0
            mock_proc.stdout = "100.84.192.45\n"
            mock_run.return_value = mock_proc

            ip = get_tailscale_ip()
            self.assertEqual(ip, "100.84.192.45")

    @patch("urllib.request.urlopen")
    def test_send_remote_alert_telegram(self, mock_urlopen):
        """Tests sending remote alerts via Telegram Bot API."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        # 1. INFO alert
        success = self.bridge.send_remote_alert("Perimeter nominal.", priority="INFO")
        self.assertTrue(success)

        # Inspect Telegram call (first call in list)
        tg_call = mock_urlopen.call_args_list[0][0][0]
        self.assertIn("https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/sendMessage", tg_call.full_url)
        body = json.loads(tg_call.data.decode("utf-8"))
        self.assertEqual(body["chat_id"], self.chat_id)
        self.assertIn("Perimeter nominal.", body["text"])
        self.assertIn("[INFO]", body["text"])

        # 2. CRITICAL alert
        mock_urlopen.reset_mock()
        success_crit = self.bridge.send_remote_alert("Intrusion detected!", priority="CRITICAL")
        self.assertTrue(success_crit)
        tg_call_crit = mock_urlopen.call_args_list[0][0][0]
        body_crit = json.loads(tg_call_crit.data.decode("utf-8"))
        self.assertIn("[CRITICAL]", body_crit["text"])

    @patch("urllib.request.urlopen")
    def test_send_remote_alert_fallback(self, mock_urlopen):
        """Tests fallback from Markdown to plain text if Markdown syntax fails."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp

        # First call fails on Markdown, retry succeeds, then Discord succeeds
        mock_urlopen.side_effect = [Exception("Bad Request: can't parse entities"), mock_resp, mock_resp]

        success = self.bridge.send_remote_alert("Unmatched [markdown *syntax", priority="WARNING")
        self.assertTrue(success)
        self.assertGreaterEqual(mock_urlopen.call_count, 2)

    def test_handle_status_command(self):
        """Tests /status command output."""
        res = self.bridge.handle_command("/status")
        self.assertTrue(res["success"])
        self.assertIn("ONLINE", res["response"])
        self.assertIn("Workspace", res["response"])

        # Switch to earbud mode
        self.bridge.earbud_mode = True
        earbud_res = self.bridge.handle_command("/status")
        self.assertTrue(earbud_res["success"])
        self.assertIn("ONLINE", earbud_res["response"])

    def test_handle_earbud_toggle(self):
        """Tests /earbud mode toggle."""
        res = self.bridge.handle_command("/earbud off")
        self.assertFalse(self.bridge.earbud_mode)

        res = self.bridge.handle_command("/earbud on")
        self.assertTrue(self.bridge.earbud_mode)

        res = self.bridge.handle_command("/earbud")
        self.assertFalse(self.bridge.earbud_mode)

    def test_handle_run_command(self):
        """Tests /run goal execution."""
        res = self.bridge.handle_command("/run audit local storage")
        self.assertTrue(res["success"])
        self.assertEqual(res["command"], "/run")
        self.assertIn("Task Initiated", res["response"])
        self.assertIn("slice_id", res)

    def test_handle_estop_command(self):
        """Tests /estop emergency stop activation."""
        with patch.object(self.bridge, "send_remote_alert") as mock_alert:
            res = self.bridge.handle_command("/estop Manual override from earbud")
            self.assertTrue(res["success"])
            self.assertTrue(self.bridge.estop_active)
            self.assertIn("EMERGENCY STOP", res["response"])
            mock_alert.assert_called()

            # Verify system rejects subsequent /run while in estop
            blocked_run = self.bridge.handle_command("/run try again")
            self.assertFalse(blocked_run["success"])
            self.assertIn("ESTOP ACTIVE", blocked_run["response"])

    def test_legacy_handle_incoming_command(self):
        """Tests legacy compatibility wrapper."""
        legacy_bridge = OmnichannelBridge(
            orchestrator_callback=lambda goal: f"Executed: {goal}",
            db_path=self.db_path,
        )
        res = legacy_bridge.handle_incoming_command("/status")
        self.assertIn("ONLINE", res["response"])

        run_res = legacy_bridge.handle_incoming_command("/run build app")
        self.assertIn("Executed: build app", run_res["response"])

    @patch("urllib.request.urlopen")
    def test_sync_d1_heartbeat(self, mock_urlopen):
        """Tests syncing heartbeat to Cloudflare D1 serverless mesh."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        ok = self.bridge.sync_d1_heartbeat()
        self.assertTrue(ok)

        call_args = mock_urlopen.call_args[0]
        req = call_args[0]
        self.assertIn("/api/heartbeat", req.full_url)
        payload = json.loads(req.data.decode("utf-8"))
        self.assertEqual(payload["device_type"], "DESKTOP")
        self.assertEqual(payload["status"], "ONLINE")

    @patch("urllib.request.urlopen")
    def test_poll_mesh_tasks(self, mock_urlopen):
        """Tests polling and executing tasks from Cloudflare D1 mesh queue."""
        self.bridge.reset_estop()

        def mock_urlopen_fn(req, *args, **kwargs):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            resp = MagicMock()
            resp.status = 200
            resp.__enter__.return_value = resp
            if "/api/queue/poll" in url:
                resp.read.return_value = json.dumps({
                    "success": True,
                    "task": {
                        "id": "task_12345",
                        "command_type": "STATUS_CHECK",
                        "prompt_raw": "/status",
                    }
                }).encode("utf-8")
            elif "/api/queue/update" in url:
                resp.read.return_value = b'{"success": true}'
            else:
                resp.read.return_value = b'{"status": "ok"}'
            return resp

        mock_urlopen.side_effect = mock_urlopen_fn

        tasks = self.bridge.poll_mesh_tasks()
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["id"], "task_12345")

    @patch("urllib.request.urlopen")
    def test_sync_r2_artifact(self, mock_urlopen):
        """Tests synchronizing artifacts to Cloudflare R2 mesh."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        ok = self.bridge.sync_r2_artifact("test_artifact.json", b"{\"audit\": true}")
        self.assertTrue(ok)

    @patch("urllib.request.urlopen")
    def test_background_service_lifecycle(self, mock_urlopen):
        """Tests starting and stopping background polling and mesh sync threads."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        self.bridge.start_background_service()
        self.assertTrue(self.bridge._running)
        self.assertIsNotNone(self.bridge._poll_thread)
        self.assertIsNotNone(self.bridge._sync_thread)

        self.bridge.stop_background_service()
        self.assertFalse(self.bridge._running)


if __name__ == "__main__":
    unittest.main()
