"""
Unit & Integration Tests for Nexus Desktop:
1. Agent Cognition Modes (Normal, Reasoning, Study)
2. Online Cloud OCR & Universal Media Reader
3. Security Boundaries (Shell Sanitization, System Path Protection, SSRF Guard)
"""

import os
import unittest
from unittest.mock import patch, MagicMock

from desktop_agent.ai_client import (
    AgentMode,
    GeminiAdapter,
    FallbackChain,
    DedicatedTaskRouter,
    DEFAULT_MODELS,
    AIError
)
from desktop_agent.vision_engine import (
    OnlineOCREngine,
    UniversalMediaReader,
    _is_private_or_loopback,
    safe_fetch_media_url
)
from desktop_agent.file_manager import NexusFileManager
from desktop_agent.nexus_fast_agent import NexusFastAgent
from engine.router import IntentRouter


class TestAgentModes(unittest.TestCase):
    def test_agent_mode_constants(self):
        self.assertEqual(AgentMode.NORMAL, "normal")
        self.assertEqual(AgentMode.REASONING, "reasoning")
        self.assertEqual(AgentMode.STUDY, "study")
        self.assertIn("reasoning", AgentMode.ALL)
        self.assertIn("study", AgentMode.ALL)

    def test_gemini_adapter_modes(self):
        adapter = GeminiAdapter(api_key="fake_key_123", mode=AgentMode.NORMAL)
        self.assertEqual(adapter.mode, "normal")

        # Switch to reasoning mode
        adapter.set_mode(AgentMode.REASONING)
        self.assertEqual(adapter.mode, "reasoning")
        self.assertEqual(adapter.thinking_budget, 4096)

        # Switch to study mode
        adapter.set_mode(AgentMode.STUDY)
        self.assertEqual(adapter.mode, "study")

    @patch("desktop_agent.ai_client._http")
    def test_gemini_reasoning_mode_payload(self, mock_http):
        mock_http.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "<thought>Step 1 analysis</thought>Final Answer"}]}
            }]
        }
        adapter = GeminiAdapter(api_key="fake_key_123", mode=AgentMode.REASONING)
        res = adapter._generate_content("gemini-2.5-flash", "Solve problem")
        self.assertIn("<thought>", res)

        # Verify call payload contained thinkingConfig
        call_args = mock_http.call_args[0]
        payload = call_args[2]  # body bytes
        import json
        body = json.loads(payload.decode("utf-8"))
        self.assertIn("thinkingConfig", body["generationConfig"])
        self.assertEqual(body["generationConfig"]["thinkingConfig"]["thinkingBudget"], 4096)
        self.assertIn("[MODE: REASONING]", body["systemInstruction"]["parts"][0]["text"])

    @patch("desktop_agent.ai_client._http")
    def test_gemini_study_mode_payload(self, mock_http):
        mock_http.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "1. Core Concept\n2. Breakdown\n3. Analogy\n4. Quiz\n5. Flashcard"}]}
            }]
        }
        adapter = GeminiAdapter(api_key="fake_key_123", mode=AgentMode.STUDY)
        res = adapter._generate_content("gemini-2.5-flash", "Explain recursion")
        self.assertIn("Core Concept", res)

        call_args = mock_http.call_args[0]
        import json
        body = json.loads(call_args[2].decode("utf-8"))
        self.assertIn("[MODE: STUDY TUTOR]", body["systemInstruction"]["parts"][0]["text"])

    def test_fallback_chain_and_router_set_mode(self):
        adapter = GeminiAdapter(api_key="fake_key_123", mode=AgentMode.NORMAL)
        chain = FallbackChain([adapter], mode=AgentMode.NORMAL)
        router = DedicatedTaskRouter(gemini=adapter, fallback_chain=chain)
        chain.router = router

        self.assertEqual(chain.get_mode(), "normal")
        chain.set_mode(AgentMode.REASONING)
        self.assertEqual(chain.get_mode(), "reasoning")
        self.assertEqual(adapter.mode, "reasoning")

    def test_intent_router_modes(self):
        router = IntentRouter(mode="reasoning")
        self.assertEqual(router.mode, "reasoning")
        router.set_mode("study")
        self.assertEqual(router.mode, "study")


class TestOnlineOCRAndMediaReader(unittest.TestCase):
    def test_media_type_detection(self):
        self.assertEqual(UniversalMediaReader.detect_media_type("photo.png"), "image")
        self.assertEqual(UniversalMediaReader.detect_media_type("paper.pdf"), "pdf")
        self.assertEqual(UniversalMediaReader.detect_media_type("voice.mp3"), "audio")
        self.assertEqual(UniversalMediaReader.detect_media_type("clip.mp4"), "video")
        self.assertEqual(UniversalMediaReader.detect_media_type("notes.md"), "document")

    @patch("os.path.exists", return_value=True)
    @patch("desktop_agent.vision_engine.OnlineOCREngine.ocr_image_online")
    def test_universal_media_reader_routes_image(self, mock_ocr, mock_exists):
        mock_ocr.return_value = {
            "success": True,
            "text": "Extracted Sample Text",
            "provider": "gemini_cloud_ocr"
        }
        res = UniversalMediaReader.read_media("test_image.png", media_type="image")
        self.assertTrue(res.get("success"))
        self.assertEqual(res.get("media_type"), "image")

    def test_ssrf_host_filter(self):
        self.assertTrue(_is_private_or_loopback("127.0.0.1"))
        self.assertTrue(_is_private_or_loopback("localhost"))
        self.assertTrue(_is_private_or_loopback("10.0.0.1"))
        self.assertTrue(_is_private_or_loopback("192.168.1.1"))
        self.assertTrue(_is_private_or_loopback("172.16.0.1"))
        self.assertTrue(_is_private_or_loopback("169.254.169.254"))
        self.assertFalse(_is_private_or_loopback("8.8.8.8"))
        self.assertFalse(_is_private_or_loopback("cloudflare.com"))

    def test_safe_fetch_media_url_blocks_ssrf(self):
        res = safe_fetch_media_url("http://127.0.0.1:8080/secret.txt")
        self.assertFalse(res.get("success"))
        self.assertIn("SSRF", res.get("error", ""))


class TestSecurityGuardrails(unittest.TestCase):
    def test_file_manager_blocks_system_roots(self):
        safe, err = NexusFileManager.validate_safe_path(r"C:\Windows\System32\cmd.exe")
        self.assertFalse(safe)
        self.assertIn("Security Violation", err)

        safe, err = NexusFileManager.validate_safe_path(r"C:\Program Files\App\config.json")
        self.assertFalse(safe)
        self.assertIn("Security Violation", err)

        # Root drive mutation blocked
        safe, err = NexusFileManager.validate_safe_path(r"C:")
        self.assertFalse(safe)

        # Normal safe paths allowed
        safe, err = NexusFileManager.validate_safe_path(r"~/.nexus-agent/data.json")
        self.assertTrue(safe)

    def test_shell_destructive_command_filter(self):
        agent = NexusFastAgent()
        res = agent.execute_shell("rmdir /s /q C:\\")
        self.assertFalse(res.get("success"))
        self.assertIn("Security Guardrail", res.get("error", ""))

        res2 = agent.execute_shell("del /s /q C:\\*")
        self.assertFalse(res2.get("success"))
        self.assertIn("Security Guardrail", res2.get("error", ""))

    def test_file_manager_create_file_enforces_safety(self):
        res = NexusFileManager.create_file(r"C:\Windows\hacked.txt", "evil")
        self.assertFalse(res.get("success"))
        self.assertIn("Security Violation", res.get("error", ""))


if __name__ == "__main__":
    unittest.main()
