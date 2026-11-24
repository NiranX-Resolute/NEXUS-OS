import unittest
import time
import sys
import os

# Add desktop_agent to path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "desktop_agent"))

from device_manager import (
    BrightnessController,
    SystemPerformanceMonitor,
    WindowManager,
    ClipboardManager
)
from file_manager import NexusFileManager
from communication import NexusCommunicationManager
from productivity import NexusProductivityManager
from site_generator import NexusSiteGenerator


class TestMyraNexusParity(unittest.TestCase):

    def test_brightness_controller(self):
        res = BrightnessController.get_brightness()
        self.assertTrue(res.get("success"))
        self.assertIn("brightness_percent", res)

    def test_system_performance_metrics(self):
        res = SystemPerformanceMonitor.get_performance_metrics()
        self.assertTrue(res.get("success"))
        self.assertIn("metrics", res)
        metrics = res["metrics"]
        self.assertIn("cpu_percent", metrics)
        self.assertIn("ram_percent", metrics)
        self.assertIn("total_ram_gb", metrics)

    def test_top_processes(self):
        res = SystemPerformanceMonitor.get_top_processes(limit=3, sort_by="cpu")
        self.assertTrue(res.get("success"))
        self.assertIn("processes", res)
        self.assertIsInstance(res["processes"], list)
        self.assertTrue(len(res["processes"]) > 0)

    def test_window_manager(self):
        res = WindowManager.list_windows()
        self.assertTrue(res.get("success"))
        self.assertIn("windows", res)
        self.assertIsInstance(res["windows"], list)

        active = WindowManager.get_active_window()
        self.assertTrue(active.get("success"))
        self.assertIn("active_window", active)

    def test_clipboard_manager(self):
        test_val = f"NexusClipboardTest_{int(time.time())}"
        set_res = ClipboardManager.set_clipboard(test_val)
        self.assertTrue(set_res.get("success"))

        get_res = ClipboardManager.get_clipboard()
        self.assertTrue(get_res.get("success"))
        self.assertEqual(get_res.get("text"), test_val)

        hist_res = ClipboardManager.get_history(limit=5)
        self.assertTrue(hist_res.get("success"))
        self.assertIn("history", hist_res)

    def test_file_manager_crud_and_analysis(self):
        temp_dir = os.path.join(os.path.expanduser("~"), ".nexus-agent", "temp_tests")
        os.makedirs(temp_dir, exist_ok=True)
        test_file = os.path.join(temp_dir, "parity_test.txt")

        # Create
        create_res = NexusFileManager.create_file(test_file, "Hello from Nexus Parity Engine\nLine 2\n")
        self.assertTrue(create_res.get("success"))
        self.assertTrue(os.path.exists(test_file))

        # Analyze
        analyze_res = NexusFileManager.analyze_file(test_file)
        self.assertTrue(analyze_res.get("success"))
        self.assertEqual(analyze_res.get("line_count"), 2)
        self.assertTrue(analyze_res.get("is_text"))
        self.assertIn("sha256", analyze_res)

        # Search
        search_res = NexusFileManager.search_files(temp_dir, query="parity*", recursive=False)
        self.assertTrue(search_res.get("success"))
        self.assertTrue(search_res.get("count") >= 1)

        # Safe Delete
        del_res = NexusFileManager.delete_file(test_file, safe=True)
        self.assertTrue(del_res.get("success"))
        self.assertFalse(os.path.exists(test_file))

    def test_communication_contacts_and_whatsapp(self):
        # Contact Add
        add_res = NexusCommunicationManager.add_contact(
            name="Test Contact",
            phone="+1234567890",
            email="test@nexus.local",
            notes="Automated test contact"
        )
        self.assertTrue(add_res.get("success"))

        # Contact List
        list_res = NexusCommunicationManager.list_contacts(query="Test Contact")
        self.assertTrue(list_res.get("success"))
        self.assertTrue(list_res.get("count") >= 1)

        # WhatsApp preparation (without popping browser/app window)
        wa_res = NexusCommunicationManager.send_whatsapp("Test Contact", "Hello from Nexus unit test", auto_open=False)
        self.assertTrue(wa_res.get("success"))
        self.assertIn("web_url", wa_res)
        self.assertIn("app_url", wa_res)

        # Contact Delete
        del_res = NexusCommunicationManager.delete_contact("Test Contact")
        self.assertTrue(del_res.get("success"))

    def test_productivity_suite(self):
        # 1. Notes
        note_res = NexusProductivityManager.create_note("Test Parity Note", "Sample content for parity test", tags=["test", "nexus"])
        self.assertTrue(note_res.get("success"))
        notes_list = NexusProductivityManager.list_notes()
        self.assertTrue(notes_list.get("success"))
        NexusProductivityManager.delete_note("Test Parity Note")

        # 2. Todos
        todo_res = NexusProductivityManager.add_todo("Test Parity Todo Task", priority="high")
        self.assertTrue(todo_res.get("success"))
        tid = todo_res["todo"]["id"]
        toggle_res = NexusProductivityManager.toggle_todo(tid)
        self.assertTrue(toggle_res.get("success"))
        self.assertTrue(toggle_res["todo"]["completed"])
        NexusProductivityManager.delete_todo(tid)

        # 3. Live News RSS (Google News)
        news_res = NexusProductivityManager.get_news("technology", limit=3)
        self.assertTrue(news_res.get("success"))
        self.assertTrue(isinstance(news_res.get("articles"), list))

    def test_site_generator(self):
        temp_site_dir = os.path.join(os.path.expanduser("~"), ".nexus-agent", "temp_tests", "site_test")
        gen_res = NexusSiteGenerator.generate_website(
            prompt="Build a decentralized AI dashboard",
            title="Nexus AI Dashboard",
            output_dir=temp_site_dir
        )
        self.assertTrue(gen_res.get("success"))
        self.assertTrue(os.path.exists(os.path.join(temp_site_dir, "index.html")))
        self.assertTrue(os.path.exists(os.path.join(temp_site_dir, "style.css")))
        self.assertTrue(os.path.exists(os.path.join(temp_site_dir, "app.js")))
        self.assertTrue(os.path.exists(os.path.join(temp_site_dir, "wrangler.toml")))

        # Export archive
        export_res = NexusSiteGenerator.export_archive(temp_site_dir)
        self.assertTrue(export_res.get("success"))
        self.assertTrue(os.path.exists(export_res["zip_path"]))

        # Cleanup
        try:
            import shutil
            shutil.rmtree(temp_site_dir, ignore_errors=True)
            if os.path.exists(export_res["zip_path"]):
                os.remove(export_res["zip_path"])
        except Exception:
            pass


if __name__ == "__main__":
    unittest.main()
