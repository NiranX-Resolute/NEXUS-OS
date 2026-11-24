import os
import io
import unittest
from unittest.mock import patch, MagicMock
from desktop_agent.ai_client import (
    PuterAdapter,
    GeminiAdapter,
    DedicatedTaskRouter,
    FallbackChain,
    build_user_adapter,
    build_client,
    AIError,
    DEFAULT_MODELS
)


class TestPuterAdapter(unittest.TestCase):
    def test_unauthenticated_raises(self):
        adapter = PuterAdapter(auth_token="")
        with self.assertRaises(AIError) as ctx:
            adapter.chat_completion([{"role": "user", "content": "Hello"}])
        self.assertIn("Puter auth token missing", str(ctx.exception))

    @patch("desktop_agent.ai_client._http")
    def test_chat_completion_success(self, mock_http):
        mock_http.return_value = {"text": "Response from Puter GPT-4o"}
        adapter = PuterAdapter(auth_token="puter_secret_token_123")
        res = adapter.chat_completion([{"role": "user", "content": "Hello Puter"}])
        self.assertEqual(res["provider"], "puter")
        self.assertEqual(res["text"], "Response from Puter GPT-4o")


class TestDedicatedTaskRouter(unittest.TestCase):
    def setUp(self):
        self.mock_gemini = MagicMock()
        self.mock_puter = MagicMock()
        self.mock_chain = MagicMock()

        self.router = DedicatedTaskRouter(
            gemini=self.mock_gemini,
            puter=self.mock_puter,
            fallback_chain=self.mock_chain
        )

    def test_route_plan_to_gemini(self):
        self.mock_gemini.plan_action.return_value = {"target": "DESKTOP", "steps": []}
        res = self.router.execute_dedicated("PLAN", prompt="Check bluetooth battery")
        self.mock_gemini.plan_action.assert_called_once_with(prompt="Check bluetooth battery")
        self.assertEqual(res["target"], "DESKTOP")

    def test_route_frontier_chat_to_puter(self):
        self.mock_puter.chat_completion.return_value = {"text": "Frontier reply"}
        res = self.router.execute_dedicated("PUTER_CHAT", messages=[{"role": "user", "content": "Hi"}])
        self.mock_puter.chat_completion.assert_called_once()
        self.assertEqual(res["text"], "Frontier reply")

    def test_fallback_to_chain(self):
        self.mock_chain.chat_completion.return_value = {"text": "Fallback reply"}
        res = self.router.execute_dedicated("CHAT", messages=[{"role": "user", "content": "Hi"}])
        self.assertEqual(res["text"], "Fallback reply")


class TestBuildAdapters(unittest.TestCase):
    def test_build_user_adapter_puter(self):
        adapter = build_user_adapter({"provider": "puter", "api_key": "dummy_token"})
        self.assertIsInstance(adapter, PuterAdapter)
        self.assertEqual(adapter.auth_token, "dummy_token")

    def test_build_client_wires_router(self):
        user_cfg = {
            "developer_mode": True,
            "ai": {"provider": "gemini", "api_key": "dummy_gemini"}
        }
        client = build_client(user_cfg, bridge_url="http://localhost:8787")
        self.assertIsInstance(client, FallbackChain)
        self.assertIsNotNone(client.router)
        self.assertIsInstance(client.router, DedicatedTaskRouter)


if __name__ == "__main__":
    unittest.main()
