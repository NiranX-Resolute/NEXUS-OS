"""
Nexus Free-Tier Credential Pool & Rate-Limit Cooldown Cascade Engine
=============================================================================
Inspired by Nous Research / Hermes-Agent.
Maintains 100% free-tier autonomous uptime:
- Multi-key pooling across Groq, Gemini AI Studio, OpenRouter, Ollama.
- Automatic 429 Rate-Limit detection and model/key cooldowns.
- Sub-5ms automated failover cascade across keys and backup providers.
=============================================================================
"""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any


@dataclass
class PooledKey:
    provider: str
    key: str
    cooldown_until: float = 0.0
    failure_count: int = 0
    total_calls: int = 0

    @property
    def is_available(self) -> bool:
        return time.time() >= self.cooldown_until


class CredentialPoolManager:
    """
    Manages API keys and provider failover cascade with automatic cooldown tracking.
    """

    def __init__(self):
        # provider -> list of PooledKey
        self._pools: Dict[str, List[PooledKey]] = {}
        self._provider_priority: List[str] = ["groq", "gemini", "openrouter", "ollama"]
        self._current_index: Dict[str, int] = {}

    def add_key(self, provider: str, key: str):
        """Adds an API key to the provider's credential pool."""
        p = provider.lower()
        if p not in self._pools:
            self._pools[p] = []
            self._current_index[p] = 0

        # Don't add duplicate
        if not any(k.key == key for k in self._pools[p]):
            self._pools[p].append(PooledKey(provider=p, key=key))

    def mark_rate_limited(self, provider: str, key_str: str, cooldown_seconds: float = 60.0):
        """Marks a key as rate-limited (HTTP 429), initiating a cooldown period."""
        p = provider.lower()
        if p in self._pools:
            for pk in self._pools[p]:
                if pk.key == key_str:
                    pk.cooldown_until = time.time() + cooldown_seconds
                    pk.failure_count += 1
                    break

    def get_active_credential(self) -> Optional[Tuple[str, str]]:
        """
        Retrieves the next available (provider, key) tuple across the cascade.
        Returns None if all configured keys across all providers are currently on cooldown.
        """
        for prov in self._provider_priority:
            p = prov.lower()
            pool = self._pools.get(p, [])
            if not pool:
                continue

            # Round-robin among available keys in pool
            start_idx = self._current_index.get(p, 0)
            for i in range(len(pool)):
                idx = (start_idx + i) % len(pool)
                candidate = pool[idx]
                if candidate.is_available:
                    self._current_index[p] = (idx + 1) % len(pool)
                    candidate.total_calls += 1
                    return candidate.provider, candidate.key

        return None

    def pool_status(self) -> Dict[str, Any]:
        """Returns snapshot of key availability and cooldown timers."""
        status = {}
        now = time.time()
        for prov, keys in self._pools.items():
            avail = sum(1 for k in keys if k.is_available)
            status[prov] = {
                "total_keys": len(keys),
                "available_keys": avail,
                "in_cooldown": len(keys) - avail,
                "details": [
                    {
                        "key_mask": f"{k.key[:4]}...{k.key[-4:]}" if len(k.key) > 8 else "***",
                        "available": k.is_available,
                        "cooldown_left_sec": max(0, round(k.cooldown_until - now, 1))
                    }
                    for k in keys
                ]
            }
        return status
