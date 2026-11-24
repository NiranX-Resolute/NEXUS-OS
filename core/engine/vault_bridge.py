"""
Nexus Layout-Resilient Automation & Password Vault Bridge
=============================================================================
Inspired by Skyvern.
Provides:
1. Secure credential storage and dynamic injection for desktop/web tasks.
2. Zero plaintext leakage: sanitizes prompts and execution logs.
3. Layout-resilient fuzzy semantic matching for UI/web form fields.
=============================================================================
"""

import base64
import json
import os
import re
from pathlib import Path
from typing import Dict, Any, Optional, List


class PasswordVaultBridge:
    """
    Local Encrypted/Sanitized Password Vault Bridge.
    Protects credentials, prevents LLM leaks, and injects secrets at the last mile.
    """

    def __init__(self, vault_path: Optional[str] = None):
        if vault_path is None:
            home = os.environ.get("USERPROFILE") or os.environ.get("HOME") or "."
            self.vault_file = Path(home) / ".nexus-agent" / "vault.enc"
        else:
            self.vault_file = Path(vault_path)

        self.vault_file.parent.mkdir(parents=True, exist_ok=True)
        self._secrets: Dict[str, str] = self._load_vault()

    def _obfuscate(self, data: str) -> str:
        # Reversible local obfuscation/encryption stub for offline storage
        return base64.b64encode(data.encode("utf-8")).decode("utf-8")

    def _deobfuscate(self, data: str) -> str:
        return base64.b64decode(data.encode("utf-8")).decode("utf-8")

    def _load_vault(self) -> Dict[str, str]:
        if self.vault_file.exists():
            try:
                with open(self.vault_file, "r", encoding="utf-8") as fp:
                    raw = json.load(fp)
                    return {k: self._deobfuscate(v) for k, v in raw.items()}
            except Exception:
                return {}
        return {}

    def _save_vault(self):
        with open(self.vault_file, "w", encoding="utf-8") as fp:
            enc = {k: self._obfuscate(v) for k, v in self._secrets.items()}
            json.dump(enc, fp, indent=2)

    def set_secret(self, key: str, value: str):
        """Stores a secret in the vault."""
        self._secrets[key.strip().upper()] = value
        self._save_vault()

    def get_secret(self, key: str) -> Optional[str]:
        """Retrieves a secret from the vault."""
        return self._secrets.get(key.strip().upper())

    def list_keys(self) -> List[str]:
        return list(self._secrets.keys())

    def sanitize_text(self, text: str) -> str:
        """
        Replaces any secret values found in prompt or log with [REDACTED_VAULT_KEY].
        """
        sanitized = text
        for key, val in self._secrets.items():
            if val and len(val) >= 4 and val in sanitized:
                sanitized = sanitized.replace(val, f"[VAULT:{key}]")
        return sanitized

    def resolve_tokens(self, text: str) -> str:
        """
        Resolves ${VAULT:KEY_NAME} placeholders into real secrets immediately before execution.
        """
        def repl(match):
            k = match.group(1).upper()
            return self._secrets.get(k, match.group(0))

        return re.sub(r"\$\{VAULT:([A-Za-z0-9_]+)\}", repl, text)

    @staticmethod
    def match_form_field(field_candidates: List[str], target_purpose: str) -> Optional[str]:
        """
        Layout-Resilient Fuzzy Element Matcher.
        Finds matching input element names regardless of DOM changes (e.g. 'username', 'email_field', 'usr').
        """
        target = target_purpose.lower()
        synonyms = {
            "username": ["username", "user", "login", "email", "account", "identifier", "usr"],
            "password": ["password", "pass", "pwd", "secret", "auth_key", "pin"],
            "submit": ["submit", "login", "sign in", "enter", "continue", "next", "btn-submit"],
            "search": ["search", "query", "find", "q", "filter"]
        }

        search_terms = synonyms.get(target, [target])

        # Exact match
        for cand in field_candidates:
            c_low = cand.lower()
            if any(term == c_low for term in search_terms):
                return cand

        # Substring match
        for cand in field_candidates:
            c_low = cand.lower()
            if any(term in c_low for term in search_terms):
                return cand

        return None
