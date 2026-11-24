import unittest
import time
import sys
import os

# Add desktop_agent to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "desktop_agent"))
from device_manager import (
    BluetoothManager,
    VolumeController,
    WifiManager,
    DeviceInventory,
    BackgroundTaskManager
)


class TestDeviceManager(unittest.TestCase):

    def test_bluetooth_all_devices(self):
        res = BluetoothManager.get_all_devices()
        self.assertTrue(res.get("success"))
        self.assertIn("devices", res)
        self.assertIn("count", res)
        self.assertIsInstance(res["devices"], list)

    def test_bluetooth_battery_details(self):
        res = BluetoothManager.get_battery_details()
        self.assertTrue(res.get("success"))
        self.assertIn("connected_peripherals", res)
        self.assertIsInstance(res["connected_peripherals"], list)

    def test_volume_get_and_set(self):
        # 1. Get volume
        get_res = VolumeController.get_volume()
        self.assertTrue(get_res.get("success"))
        self.assertIn("volume_percent", get_res)
        self.assertIn("is_muted", get_res)
        current_vol = get_res["volume_percent"]

        # 2. Set volume to current volume (safe test, doesn't shock user's ears)
        set_res = VolumeController.set_volume(current_vol)
        self.assertTrue(set_res.get("success"))
        self.assertEqual(round(set_res["volume_percent"]), round(current_vol))

    def test_wifi_info(self):
        res = WifiManager.get_connected_wifi_info()
        self.assertTrue(res.get("success"))
        # Must report connection state
        self.assertIn("connected", res)
        if res.get("connected"):
            self.assertIn("ssid", res)
            self.assertTrue(len(res["ssid"]) > 0)
            self.assertIn("signal_percent", res)

    def test_wifi_available_networks(self):
        res = WifiManager.get_available_networks()
        self.assertTrue(res.get("success"))
        self.assertIn("networks", res)
        self.assertIsInstance(res["networks"], list)

    def test_all_devices_summary(self):
        summary = DeviceInventory.get_all_devices_summary()
        self.assertTrue(summary.get("success"))
        self.assertIn("host_battery", summary)
        self.assertIn("storage_drives", summary)
        self.assertIn("bluetooth", summary)
        self.assertIn("wifi", summary)

    def test_silent_task_execution(self):
        res = BackgroundTaskManager.execute_silent_task("echo SilentTaskCompleted")
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("returncode"), 0)
        self.assertIn("SilentTaskCompleted", res.get("stdout", ""))
        self.assertTrue(res.get("headless"))

    def test_background_job_lifecycle(self):
        # Start background job with fast command
        job = BackgroundTaskManager.start_background_job(
            name="test_worker_job",
            command="echo Background worker finished successfully"
        )
        self.assertTrue(job.get("success"))
        job_id = job["job_id"]
        self.assertIn("pid", job)

        # Poll for completion
        completed = False
        status = {}
        for _ in range(30):
            time.sleep(0.1)
            status = BackgroundTaskManager.get_job_status(job_id)
            if status.get("status") in ("COMPLETED", "FAILED"):
                completed = True
                break

        self.assertTrue(completed)
        self.assertEqual(status.get("status"), "COMPLETED")
        self.assertIn("Background worker finished successfully", status.get("log_tail", ""))

        # List jobs contains it
        job_list = BackgroundTaskManager.list_jobs()
        self.assertTrue(job_list.get("success"))
        self.assertGreaterEqual(job_list.get("count", 0), 1)


if __name__ == "__main__":
    unittest.main()
