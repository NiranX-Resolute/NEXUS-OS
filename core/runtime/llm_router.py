"""Nexus OS v5.0 - Zero-Cost Multi-Provider LLM Router with Federated Compute Pool.

Routes inference requests across 100% free-tier zero-card engines:
1. Priority 1: Live Cloud GPUs (Kaggle 2x T4 32GB VRAM, Google Colab 16GB, Lightning AI)
2. Priority 2: Always-On 16GB RAM Cloud CPU Workers (Hugging Face Spaces, Tailscale burst)
3. Priority 3: Free Serverless API Cascade (Google Gemini -> OpenRouter :free -> Groq)
4. Priority 4: Local Sovereign Fallback (Local Ollama daemon)

Fully integrated with FederatedComputePool, DPAPI CredentialVault, and WorkspaceGovernor.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request
import socket

from .hardware import HardwareTelemetry, get_hardware_telemetry
from .gemini_quota_manager import GeminiQuotaManager, GEMINI_MODELS_CATALOG
from .compute_pool import FederatedComputePool
from .workspaces import WorkspaceGovernor
from core.memory.sovereign_store import SovereignMemoryStore
from core.runtime.provider_catalog import (
    PROVIDER_MAP,
    get_all_provider_definitions,
    get_provider_definition,
    get_dpapi_vault_key,
    seed_default_providers,
)
from core.runtime.model_catalog import (
    is_model_abliterated,
    seed_default_models,
)

logger = logging.getLogger("nexus.runtime.llm_router")


class LLMProviderError(Exception):
    """Raised when an LLM provider fails and triggers automatic route failover."""

    def __init__(self, message: str, provider: Optional[str] = None) -> None:
        super().__init__(message)
        self.message = message
        self.provider = provider


class LLMRouter:
    """Zero-Cost Model Routing & Federated Dispatch Engine."""

    OLLAMA_DEFAULT_HOST = "http://localhost:11434"
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models"
    OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
    GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

    MODELS = {
        "ollama": {
            "default": "qwen2.5-coder:7b",
            "coding": "qwen2.5-coder:7b",
            "lightweight": "llama3.2:3b",
        },
        "cloud_gpu": {
            "default": "qwen3.8:27b",
            "large": "qwen3.8:27b",
            "medium": "gemma4:26b",
            "compact": "gemma4:12b",
        },
        "openrouter": {
            "default": "deepseek/deepseek-chat:free",
            "reasoning": "deepseek/deepseek-r1:free",
            "coding": "deepseek/deepseek-chat:free",
            "general": "meta-llama/llama-3.3-70b-instruct:free",
        },
        "gemini": {
            "default": "gemini-3.8-flash",
            "fast": "gemini-3.8-flash",
            "reasoning": "gemini-3.8-flash",
        },
        "groq": {
            "default": "llama-3.3-70b-versatile",
            "fast": "llama-3.1-8b-instant",
        },
    }

    def __init__(
        self,
        gemini_api_key: Optional[str] = None,
        openrouter_api_key: Optional[str] = None,
        groq_api_key: Optional[str] = None,
        ollama_host: Optional[str] = None,
        compute_pool: Optional[FederatedComputePool] = None,
        governor: Optional[WorkspaceGovernor] = None,
        sovereign_store: Optional[Any] = None,
    ) -> None:
        self.governor = governor or WorkspaceGovernor()
        self.compute_pool = compute_pool or FederatedComputePool(governor=self.governor)
        self.store = sovereign_store or SovereignMemoryStore()

        # Seed catalog idempotently
        try:
            seed_default_providers(self.store)
            seed_default_models(self.store)
        except Exception as seed_err:
            logger.debug("Catalog seeding notice: %s", seed_err)

        self.gemini_api_key = (
            gemini_api_key
            or self.compute_pool.get_secret("GEMINI_API_KEY")
            or self.compute_pool.get_secret("GOOGLE_API_KEY")
            or self.compute_pool.get_secret("PROVIDER_KEY_GEMINI")
            or ""
        )
        self.openrouter_api_key = (
            openrouter_api_key
            or self.compute_pool.get_secret("OPENROUTER_API_KEY")
            or self.compute_pool.get_secret("PROVIDER_KEY_OPENROUTER")
            or ""
        )
        self.groq_api_key = (
            groq_api_key
            or self.compute_pool.get_secret("GROQ_API_KEY")
            or self.compute_pool.get_secret("PROVIDER_KEY_GROQ")
            or ""
        )
        self.ollama_host = ollama_host or os.getenv("OLLAMA_HOST", self.OLLAMA_DEFAULT_HOST)
        self.quota_manager = GeminiQuotaManager()

    def check_ollama_alive(self) -> bool:
        """Checks if local Ollama daemon is responsive in <600ms."""
        try:
            req = urllib.request.Request(
                f"{self.ollama_host}/api/tags",
                headers={"User-Agent": "Nexus-LLM-Router/5.0"},
            )
            with urllib.request.urlopen(req, timeout=0.6) as response:
                return response.status == 200
        except Exception:
            return False

    def get_available_providers(self) -> List[str]:
        """Returns list of currently configured and available providers."""
        providers: List[str] = []
        if self.check_ollama_alive():
            providers.append("ollama")

        # Check cloud GPUs in compute pool
        routes = self.compute_pool.get_candidate_routes()
        has_gpu = any(r.get("priority") == 1 and r.get("available") for r in routes)
        if has_gpu:
            providers.append("cloud_gpu")

        if self.gemini_api_key:
            providers.append("gemini")
        if self.openrouter_api_key:
            providers.append("openrouter")
        if self.groq_api_key:
            providers.append("groq")
        return providers

    def select_route(
        self,
        task_type: str = "general",
        preferred_provider: Optional[str] = None,
        telemetry: Optional[HardwareTelemetry] = None,
    ) -> List[Tuple[str, str]]:
        """Determines the priority fallback order of (provider, model) pairs."""
        hw = telemetry or get_hardware_telemetry()
        task = (task_type or "general").lower()
        ollama_alive = self.check_ollama_alive()

        candidates: List[Tuple[str, str]] = []

        if preferred_provider:
            pref = preferred_provider.lower()
            if pref == "ollama" and ollama_alive:
                model = hw.recommended_local_model or self.MODELS["ollama"]["default"]
                candidates.append(("ollama", model))
            elif pref == "gemini" and self.gemini_api_key:
                active_gem, _ = self.quota_manager.select_active_model(task)
                candidates.append(("gemini", active_gem))
            elif pref == "openrouter" and self.openrouter_api_key:
                candidates.append(("openrouter", self.MODELS["openrouter"].get(task, "deepseek/deepseek-chat:free")))
            elif pref == "groq" and self.groq_api_key:
                candidates.append(("groq", self.MODELS["groq"]["default"]))

        # Live cloud GPUs from compute pool
        cloud_routes = self.compute_pool.get_candidate_routes()
        for r in cloud_routes:
            if r.get("priority") == 1 and r.get("available"):
                candidates.append(("cloud_gpu", r.get("model", "qwen3.8:27b")))

        # If coding task and local hardware is capable
        if hw.local_llm_capable and ollama_alive:
            local_model = hw.recommended_local_model or self.MODELS["ollama"]["coding"]
            if ("ollama", local_model) not in candidates:
                candidates.append(("ollama", local_model))

        # Free tier cloud routing with adaptive quota cascade
        if self.gemini_api_key:
            active_gem_model, _ = self.quota_manager.select_active_model(task)
            if ("gemini", active_gem_model) not in candidates:
                candidates.append(("gemini", active_gem_model))

        if self.openrouter_api_key:
            or_model = self.MODELS["openrouter"].get(task, "deepseek/deepseek-chat:free")
            if task == "reasoning":
                or_model = self.MODELS["openrouter"]["reasoning"]
            if ("openrouter", or_model) not in candidates:
                candidates.append(("openrouter", or_model))

        if self.groq_api_key:
            groq_model = self.MODELS["groq"]["default"]
            if ("groq", groq_model) not in candidates:
                candidates.append(("groq", groq_model))

        if ollama_alive:
            fallback_local = self.MODELS["ollama"]["default"]
            if not any(p == "ollama" for p, _ in candidates):
                candidates.append(("ollama", fallback_local))

        if not candidates:
            active_gem, _ = self.quota_manager.select_active_model(task)
            candidates = [
                ("gemini", active_gem),
                ("openrouter", "deepseek/deepseek-chat:free"),
                ("ollama", "qwen2.5-coder:7b"),
            ]

        return candidates

    def _call_cloud_gpu(self, base_url: str, model: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Executes inference on a remote federated Cloud GPU node (Kaggle / Colab via Cloudflare tunnel)."""
        url = f"{base_url.rstrip('/')}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "system": system_prompt or "",
            "stream": False,
            "options": {"temperature": 0.2},
        }

        data = json.dumps(payload).encode("utf-8")
        token = self.compute_pool.get_secret("NEXUS_TOKEN")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-LLM-Router/5.0",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=60.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                response_text = result.get("response", "")
                if response_text:
                    return response_text
                raise LLMProviderError("Empty response returned from Cloud GPU node.", provider="cloud_gpu")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"Cloud GPU HTTP {exc.code}: {err_msg}", provider="cloud_gpu")
        except Exception as exc:
            raise LLMProviderError(f"Cloud GPU connection error: {str(exc)}", provider="cloud_gpu")

    def _call_gemini(self, model: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Executes zero-cost inference via Google Gemini API with automatic quota safety shift."""
        key = self.gemini_api_key or self.compute_pool.get_secret("GEMINI_API_KEY")
        if not key:
            raise LLMProviderError("Gemini API key is not configured.", provider="gemini")

        if not self.quota_manager.can_dispatch(model):
            shifted_model, reason = self.quota_manager.select_active_model()
            logger.info("⚡ [GEMINI-CASCADE] Pre-flight ceiling tripped on '%s'. Auto-shifting to '%s' (%s)", model, shifted_model, reason)
            model = shifted_model

        url = f"{self.GEMINI_API_URL}/{model}:generateContent?key={key}"

        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTIONS:\n{system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood. I will follow these instructions."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
            },
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    self.quota_manager.record_request(model)
                    return "".join(part.get("text", "") for part in parts)
                raise LLMProviderError("No response candidates returned by Gemini.", provider="gemini")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            if exc.code == 429:
                self.quota_manager.record_rate_limit(model, cooldown_sec=65.0)
                self.compute_pool.record_rate_limit("serverless:gemini", cooldown_sec=65.0)
                next_model, reason = self.quota_manager.select_active_model()
                logger.warning("🚨 [GEMINI-CASCADE] HTTP 429 on '%s'! Instantly auto-shifting to '%s' (%s)", model, next_model, reason)
                if next_model != model:
                    return self._call_gemini(next_model, prompt, system_prompt)
            raise LLMProviderError(f"Gemini HTTP {exc.code}: {err_msg}", provider="gemini")
        except Exception as exc:
            raise LLMProviderError(f"Gemini connection error: {str(exc)}", provider="gemini")

    def _call_openrouter(self, model: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Executes zero-cost inference via OpenRouter Free Tier."""
        key = self.openrouter_api_key or self.compute_pool.get_secret("OPENROUTER_API_KEY")
        if not key:
            raise LLMProviderError("OpenRouter API key is not configured.", provider="openrouter")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.OPENROUTER_API_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "HTTP-Referer": "https://nexus-desktop.local",
                "X-Title": "Nexus OS v5.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=45.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                raise LLMProviderError("No response choices returned by OpenRouter.", provider="openrouter")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            if exc.code == 429:
                self.compute_pool.record_rate_limit("serverless:openrouter", cooldown_sec=65.0)
            raise LLMProviderError(f"OpenRouter HTTP {exc.code}: {err_msg}", provider="openrouter")
        except Exception as exc:
            raise LLMProviderError(f"OpenRouter connection error: {str(exc)}", provider="openrouter")

    def _call_groq(self, model: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Executes zero-cost inference via Groq Free API."""
        key = self.groq_api_key or self.compute_pool.get_secret("GROQ_API_KEY")
        if not key:
            raise LLMProviderError("Groq API key is not configured.", provider="groq")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model or self.MODELS["groq"]["default"],
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 4096,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.GROQ_API_URL,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {key}",
                "User-Agent": "Nexus-LLM-Router/5.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                raise LLMProviderError("No response choices returned by Groq.", provider="groq")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            if exc.code == 429:
                self.compute_pool.record_rate_limit("serverless:groq", cooldown_sec=65.0)
            raise LLMProviderError(f"Groq HTTP {exc.code}: {err_msg}", provider="groq")
        except Exception as exc:
            raise LLMProviderError(f"Groq connection error: {str(exc)}", provider="groq")

    def _call_openai_compat(
        self,
        base_url: str,
        model: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        api_key: str = "",
        auth_header: str = "Authorization",
        auth_prefix: str = "Bearer ",
        extra_config: Optional[Dict[str, Any]] = None,
        max_tokens: int = 4096,
        timeout: float = 30.0,
    ) -> str:
        """Executes inference against any OpenAI-compatible API endpoint."""
        url = base_url.rstrip("/")
        if not url.endswith("/chat/completions"):
            url = f"{url}/chat/completions"

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        if extra_config:
            for k, v in extra_config.items():
                if k not in payload and v:
                    payload[k] = v

        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-LLM-Router/5.0",
        }
        if api_key:
            headers[auth_header] = f"{auth_prefix}{api_key}"

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                choices = result.get("choices", [])
                if choices:
                    return choices[0].get("message", {}).get("content", "")
                raise LLMProviderError(f"No response choices from {url}", provider="openai_compat")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"OpenAI-compat HTTP {exc.code}: {err_msg}", provider="openai_compat")
        except Exception as exc:
            raise LLMProviderError(f"OpenAI-compat connection error: {str(exc)}", provider="openai_compat")

    def _call_google_genai(
        self,
        model: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        api_key: str = "",
        base_url: str = "https://generativelanguage.googleapis.com",
        max_tokens: int = 8192,
        timeout: float = 30.0,
    ) -> str:
        """Executes inference against Google Generative AI API."""
        key = api_key or self.gemini_api_key or self.compute_pool.get_secret("GEMINI_API_KEY")
        if not key:
            raise LLMProviderError("Google GenAI API key is not configured.", provider="google_genai")

        b_url = (base_url or "https://generativelanguage.googleapis.com").rstrip("/")
        url = f"{b_url}/v1beta/models/{model}:generateContent?key={key}"

        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"SYSTEM INSTRUCTIONS:\n{system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": max_tokens,
            },
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    return "".join(part.get("text", "") for part in parts)
                raise LLMProviderError("No response candidates returned by Google GenAI.", provider="google_genai")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"Google GenAI HTTP {exc.code}: {err_msg}", provider="google_genai")
        except Exception as exc:
            raise LLMProviderError(f"Google GenAI connection error: {str(exc)}", provider="google_genai")

    def _call_anthropic_messages(
        self,
        model: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        api_key: str = "",
        base_url: str = "https://api.anthropic.com",
        max_tokens: int = 4096,
        timeout: float = 35.0,
    ) -> str:
        """Executes inference against Anthropic Messages API."""
        key = api_key or self.compute_pool.get_secret("PROVIDER_KEY_ANTHROPIC") or self.compute_pool.get_secret("ANTHROPIC_API_KEY")
        if not key:
            raise LLMProviderError("Anthropic API key is not configured.", provider="anthropic")

        url = f"{base_url.rstrip('/')}/v1/messages"
        payload: Dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            payload["system"] = system_prompt

        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "User-Agent": "Nexus-LLM-Router/5.0",
        }
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                content = result.get("content", [])
                text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
                if text_parts:
                    return "".join(text_parts)
                raise LLMProviderError("No text content returned from Anthropic Messages API.", provider="anthropic")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"Anthropic HTTP {exc.code}: {err_msg}", provider="anthropic")
        except Exception as exc:
            raise LLMProviderError(f"Anthropic connection error: {str(exc)}", provider="anthropic")

    def _call_bedrock_converse(
        self,
        model: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        api_key: str = "",
        base_url: str = "",
        extra_config: Optional[Dict[str, Any]] = None,
        max_tokens: int = 4096,
        timeout: float = 35.0,
    ) -> str:
        """Executes inference via Bedrock Converse protocol."""
        region = (extra_config or {}).get("region", "us-east-1")
        b_url = base_url or f"https://bedrock-runtime.{region}.amazonaws.com"
        url = f"{b_url.rstrip('/')}/model/{urllib.parse.quote(model)}/converse"
        payload: Dict[str, Any] = {
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": 0.2},
        }
        if system_prompt:
            payload["system"] = [{"text": system_prompt}]

        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Nexus-LLM-Router/5.0",
        }
        if api_key:
            headers["Authorization"] = api_key if " " in api_key else f"Bearer {api_key}"

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                output = result.get("output", {}).get("message", {}).get("content", [])
                parts = [p.get("text", "") for p in output if "text" in p]
                if parts:
                    return "".join(parts)
                raise LLMProviderError("No message output from Bedrock Converse.", provider="bedrock")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"Bedrock HTTP {exc.code}: {err_msg}", provider="bedrock")
        except Exception as exc:
            raise LLMProviderError(f"Bedrock connection error: {str(exc)}", provider="bedrock")

    def probe_provider(
        self,
        provider_id: str,
        timeout: float = 3.5,
    ) -> Dict[str, Any]:
        """Directly probes a single provider endpoint with a fast ping without trigger cascade."""
        p_id = provider_id.lower().strip()
        p_record = self.store.get_provider(p_id) or get_provider_definition(p_id) or {}
        if not p_record:
            return {"success": False, "status": "UNKNOWN_PROVIDER", "error": f"Provider {provider_id} not found", "latency_ms": 0.0}

        protocol = p_record.get("protocol", "openai_compat")
        base_url = p_record.get("base_url", "")
        selected_model = p_record.get("selected_model", "default")
        extra_config = p_record.get("extra_config") or {}
        if isinstance(extra_config, str):
            try:
                extra_config = json.loads(extra_config)
            except Exception:
                extra_config = {}

        api_key = (
            self.compute_pool.get_secret(f"PROVIDER_KEY_{p_id.upper()}")
            or self.compute_pool.get_secret(f"{p_id.upper()}_API_KEY")
            or ""
        )

        t0 = time.perf_counter()
        try:
            if protocol == "openai_compat":
                self._call_openai_compat(
                    base_url=base_url,
                    model=selected_model,
                    prompt="ping",
                    api_key=api_key,
                    max_tokens=8,
                    timeout=timeout,
                )
            elif protocol == "google_genai":
                self._call_google_genai(
                    model=selected_model,
                    prompt="ping",
                    api_key=api_key,
                    base_url=base_url,
                    max_tokens=8,
                    timeout=timeout,
                )
            elif protocol == "anthropic_messages":
                self._call_anthropic_messages(
                    model=selected_model,
                    prompt="ping",
                    api_key=api_key,
                    base_url=base_url,
                    max_tokens=8,
                    timeout=timeout,
                )
            elif protocol == "bedrock_converse":
                self._call_bedrock_converse(
                    model=selected_model,
                    prompt="ping",
                    api_key=api_key,
                    base_url=base_url,
                    extra_config=extra_config,
                    max_tokens=8,
                    timeout=timeout,
                )
            latency = round((time.perf_counter() - t0) * 1000, 2)
            self.store.update_provider_status(p_id, "OPERATIONAL", latency_ms=latency, has_key=bool(api_key))
            return {"success": True, "status": "OPERATIONAL", "latency_ms": latency, "provider_id": p_id}
        except LLMProviderError as err:
            latency = round((time.perf_counter() - t0) * 1000, 2)
            err_msg = str(err)
            status_flag = "AUTH_ERROR" if ("401" in err_msg or "403" in err_msg) else "OFFLINE"
            self.store.update_provider_status(p_id, status_flag, latency_ms=latency, has_key=bool(api_key))
            return {"success": False, "status": status_flag, "error": err_msg, "latency_ms": latency, "provider_id": p_id}
        except Exception as exc:
            latency = round((time.perf_counter() - t0) * 1000, 2)
            self.store.update_provider_status(p_id, "OFFLINE", latency_ms=latency, has_key=bool(api_key))
            return {"success": False, "status": "OFFLINE", "error": str(exc), "latency_ms": latency, "provider_id": p_id}

    def _call_ollama(self, model: str, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Executes local offline zero-cost inference via Ollama."""
        if not self.check_ollama_alive():
            raise LLMProviderError("Local Ollama daemon is offline or unreachable at " + self.ollama_host, provider="ollama")

        url = f"{self.ollama_host}/api/generate"
        payload = {
            "model": model,
            "prompt": prompt,
            "system": system_prompt or "",
            "stream": False,
            "options": {"temperature": 0.2},
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=15.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                response_text = result.get("response", "")
                if response_text:
                    return response_text
                raise LLMProviderError("Empty response returned from Ollama.", provider="ollama")
        except urllib.error.HTTPError as exc:
            err_msg = exc.read().decode("utf-8", errors="ignore")
            raise LLMProviderError(f"Ollama HTTP {exc.code}: {err_msg}", provider="ollama")
        except Exception as exc:
            raise LLMProviderError(f"Ollama connection error: {str(exc)}", provider="ollama")

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        task_type: str = "general",
        preferred_provider: Optional[str] = None,
        max_tokens: int = 8192,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Executes multi-provider LLM generation with automatic fallback across the Federated Compute Pool.

        Priority Order:
        1. Live Cloud GPUs (Kaggle / Colab trycloudflare.com)
        2. Configured and Enabled Providers (from provider_configs table)
        3. Free Serverless API Cascade (Gemini -> OpenRouter -> Groq)
        4. Local Sovereign Fallback (Ollama)

        Enforces WorkspaceGovernor SILENT air-gap mode (<5ms failover to local Ollama only).
        """
        start_time = time.perf_counter()
        fallback_history: List[Dict[str, str]] = []

        is_silent = (
            self.governor.get_mode() == "SILENT"
            or getattr(self.governor, "estop_active", False)
            or self.compute_pool.is_air_gapped()
        )

        # 1. Resolve Role-Based Slot (if task_type provided and no explicit preferred_provider)
        role_preferred_model: Optional[str] = None
        if not preferred_provider and task_type:
            try:
                role_assignments = self.store.get_role_assignments()
                if task_type in role_assignments:
                    assigned = role_assignments[task_type]
                    preferred_provider = assigned.get("provider_id")
                    role_preferred_model = assigned.get("model_id")
            except Exception as role_err:
                logger.debug("Notice reading role assignments: %s", role_err)

        # 2. Check Guardrails (Free-Tier-Only Lock & Daily Budget Cap)
        guardrails = {}
        try:
            guardrails = self.store.get_routing_guardrails()
        except Exception as g_err:
            logger.debug("Notice reading routing guardrails: %s", g_err)

        free_tier_only = bool(guardrails.get("free_tier_only", 1))
        allow_paid = bool(guardrails.get("allow_paid_failover", 0))
        daily_budget = float(guardrails.get("daily_budget_usd", 5.0))
        daily_spend = float(guardrails.get("daily_spend_usd", 0.0))
        enforce_free_only = free_tier_only or (not allow_paid and daily_spend >= daily_budget)

        if is_silent:
            if preferred_provider and preferred_provider.lower().strip() not in ("ollama", "ollama_local", "llama_cpp_local"):
                self.store.log_provider_failover(
                    from_provider=preferred_provider,
                    to_provider="ollama_local",
                    reason="SILENT_MODE",
                    latency_ms=0.0,
                )
            candidate_routes = [
                {
                    "provider": "ollama",
                    "model": self.MODELS["ollama"]["default"],
                    "priority": 4,
                    "tier": "LOCAL_SOVEREIGN",
                    "route_key": "ollama:local",
                }
            ]
        else:
            candidate_routes = self.compute_pool.get_candidate_routes()

            # Merge enabled providers from SQLite provider_configs if configured
            try:
                db_providers = self.store.list_providers(enabled_only=True)
                for db_p in db_providers:
                    p_id = db_p["provider_id"]
                    if not any(r.get("provider") == p_id for r in candidate_routes):
                        p_key = self.compute_pool.get_secret(f"PROVIDER_KEY_{p_id.upper()}") or self.compute_pool.get_secret(f"{p_id.upper()}_API_KEY") or ""
                        candidate_routes.append({
                            "provider": p_id,
                            "model": db_p["selected_model"],
                            "priority": db_p.get("priority_order", 100),
                            "tier": db_p.get("category", "EXTERNAL").upper(),
                            "route_key": f"provider:{p_id}",
                            "base_url": db_p.get("base_url", ""),
                            "protocol": db_p.get("protocol", "openai_compat"),
                            "auth_header": db_p.get("auth_header", "Authorization"),
                            "auth_prefix": db_p.get("auth_prefix", "Bearer "),
                            "extra_config": db_p.get("extra_config", {}),
                            "api_key": p_key,
                            "free_tier_badge": db_p.get("free_tier_badge", ""),
                            "available": True,
                        })
            except Exception as db_err:
                logger.debug("Failed querying db providers in llm_router: %s", db_err)

            # Filter out paid-only providers when Free-Tier-Only lock is active
            if enforce_free_only:
                free_routes = []
                for r in candidate_routes:
                    p = r.get("provider", "").lower()
                    cat = r.get("tier", "").lower()
                    badge = r.get("free_tier_badge", "")
                    # Whitelist known free providers and sovereign local compute
                    is_free = (
                        p in ("ollama", "ollama_local", "llama_cpp_local", "puter_js", "gemini_web_bridge", "kaggle_custom", "hf_space")
                        or p in ("groq", "cerebras", "sambanova", "gemini", "openrouter", "cloudflare_ai")
                        or "free" in badge.lower()
                        or "sovereign" in cat
                    )
                    if is_free:
                        free_routes.append(r)
                    else:
                        if preferred_provider == p:
                            self.store.log_provider_failover(
                                from_provider=p,
                                to_provider="groq",
                                reason="FREE_TIER_LOCK" if free_tier_only else "BUDGET_CAP_EXCEEDED",
                                latency_ms=0.0,
                            )
                if free_routes:
                    candidate_routes = free_routes

            if preferred_provider:
                pref = preferred_provider.lower().strip()
                matching = [r for r in candidate_routes if r.get("provider") == pref]
                others = [r for r in candidate_routes if r.get("provider") != pref]
                if matching and role_preferred_model:
                    matching[0]["model"] = role_preferred_model
                candidate_routes = matching + others

        for idx, route in enumerate(candidate_routes):
            provider = route.get("provider", "unknown")
            route_key = route.get("route_key", f"{provider}:route")
            model = route.get("model", "default")
            priority = route.get("priority", 4)
            protocol = route.get("protocol")

            # Skip routes that are under rate-limit cooldown
            if not self.compute_pool.is_route_available(route_key):
                fallback_history.append({
                    "provider": provider,
                    "model": model,
                    "skipped": "In rate-limit cooldown",
                })
                continue

            provider_start = time.perf_counter()
            try:
                output = ""
                if priority == 1 and route.get("base_url"):
                    output = self._call_cloud_gpu(route["base_url"], model, prompt, system_prompt)
                elif provider == "gemini":
                    output = self._call_gemini(model, prompt, system_prompt)
                elif provider == "openrouter":
                    output = self._call_openrouter(model, prompt, system_prompt)
                elif provider == "groq":
                    output = self._call_groq(model, prompt, system_prompt)
                elif provider in ("ollama", "ollama_local"):
                    output = self._call_ollama(model, prompt, system_prompt)
                elif protocol == "anthropic_messages":
                    output = self._call_anthropic_messages(
                        model=model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        api_key=route.get("api_key", ""),
                        base_url=route.get("base_url", "https://api.anthropic.com"),
                        max_tokens=max_tokens,
                    )
                elif protocol == "google_genai":
                    output = self._call_google_genai(
                        model=model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        api_key=route.get("api_key", ""),
                        base_url=route.get("base_url", "https://generativelanguage.googleapis.com"),
                        max_tokens=max_tokens,
                    )
                elif protocol == "bedrock_converse":
                    output = self._call_bedrock_converse(
                        model=model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        api_key=route.get("api_key", ""),
                        base_url=route.get("base_url", ""),
                        extra_config=route.get("extra_config"),
                        max_tokens=max_tokens,
                    )
                else:
                    output = self._call_openai_compat(
                        base_url=route.get("base_url", "https://api.openai.com/v1"),
                        model=model,
                        prompt=prompt,
                        system_prompt=system_prompt,
                        api_key=route.get("api_key", ""),
                        auth_header=route.get("auth_header", "Authorization"),
                        auth_prefix=route.get("auth_prefix", "Bearer "),
                        extra_config=route.get("extra_config"),
                        max_tokens=max_tokens,
                    )

                total_latency = round((time.perf_counter() - start_time) * 1000, 2)
                provider_latency = round((time.perf_counter() - provider_start) * 1000, 2)

                return {
                    "success": True,
                    "text": output,
                    "provider": provider,
                    "model": model,
                    "priority": priority,
                    "tier": route.get("tier", "UNKNOWN"),
                    "provider_latency_ms": provider_latency,
                    "total_latency_ms": total_latency,
                    "cost": "$0.00 (Zero-Cost Free Tier)",
                    "fallback_history": fallback_history,
                }
            except Exception as exc:
                provider_latency = round((time.perf_counter() - provider_start) * 1000, 2)
                err_str = str(exc)
                logger.warning("Routing failover: provider '%s' failed (%s); trying next tier", provider, err_str)

                # Determine failover reason & target
                reason = "TIMEOUT" if (isinstance(exc, (TimeoutError, socket.timeout)) or "timeout" in err_str.lower()) else "ERROR"
                if "429" in err_str:
                    reason = "HTTP_429"
                    self.compute_pool.record_rate_limit(route_key, cooldown_sec=65.0)
                elif "502" in err_str:
                    reason = "HTTP_502"
                elif "503" in err_str:
                    reason = "HTTP_503"

                next_p = candidate_routes[idx + 1].get("provider", "ollama") if idx + 1 < len(candidate_routes) else "none"
                try:
                    self.store.log_provider_failover(
                        from_provider=provider,
                        to_provider=next_p,
                        reason=reason,
                        latency_ms=provider_latency,
                    )
                except Exception as log_err:
                    logger.debug("Failover log persistence notice: %s", log_err)

                fallback_history.append({
                    "provider": provider,
                    "model": model,
                    "error": err_str,
                    "attempt_duration_ms": str(provider_latency),
                })
                continue

        total_latency = round((time.perf_counter() - start_time) * 1000, 2)
        return {
            "success": False,
            "text": "",
            "error": "All zero-cost LLM routing providers exhausted without successful response.",
            "total_latency_ms": total_latency,
            "cost": "$0.00 (Zero-Cost Free Tier)",
            "fallback_history": fallback_history,
        }
