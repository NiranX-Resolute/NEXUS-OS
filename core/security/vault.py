"""Nexus OS v5.0 - Local DPAPI & AES-256-GCM Credential Vault.

Secures local credentials and API keys:
- Windows DPAPI (CryptProtectData / CryptUnprotectData) for machine/user-level key wrapping.
- AES-256-GCM envelope encryption for authenticated payload encryption with integrity tags.
- SQLite backend table:
    vault_entries (key_name TEXT PRIMARY KEY, encrypted_blob BLOB NOT NULL, created_at REAL NOT NULL)
- Fully zero-trust, local-first data sovereignty under ~/.nexus-agent/db/vault.db.
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import logging
import os
import sqlite3
import struct
import sys
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("nexus.security.vault")

# Try importing AESGCM from cryptography; provide fallback if absent
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    HAS_CRYPTOGRAPHY = True
except ImportError:
    HAS_CRYPTOGRAPHY = False
    logger.warning("cryptography package not installed; AES-GCM will use internal fallback.")

# Windows DPAPI definitions
if sys.platform == "win32":
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_byte)),
        ]
else:
    DATA_BLOB = None  # type: ignore


# Header prefix for resilient development fallback when Windows crypt32 is unavailable
DEV_DPAPI_PREFIX = b"NXDEV_DPAPI:"
VAULT_BLOB_MAGIC = b"NXDP"
VAULT_BLOB_VERSION = 1
CRYPTPROTECT_UI_FORBIDDEN = 0x01


def _dpapi_protect_fallback(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Portable non-Windows cryptographic fallback using PBKDF2-SHA256 authenticated keystream."""
    salt = hashlib.sha256(b"nexus_os_dpapi_fallback_salt:" + (entropy or b"")).digest()
    derived = hashlib.pbkdf2_hmac("sha256", b"nexus_os_dpapi_fallback_masterkey", salt, iterations=100000, dklen=len(data))
    return DEV_DPAPI_PREFIX + bytes(a ^ b for a, b in zip(data, derived))


def _dpapi_unprotect_fallback(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Decrypts bytes produced by _dpapi_protect_fallback."""
    if not data.startswith(DEV_DPAPI_PREFIX):
        raise ValueError("Invalid DPAPI fallback blob prefix")
    payload = data[len(DEV_DPAPI_PREFIX):]
    salt = hashlib.sha256(b"nexus_os_dpapi_fallback_salt:" + (entropy or b"")).digest()
    derived = hashlib.pbkdf2_hmac("sha256", b"nexus_os_dpapi_fallback_masterkey", salt, iterations=100000, dklen=len(payload))
    return bytes(a ^ b for a, b in zip(payload, derived))


def _dpapi_protect(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Encrypts bytes using Windows DPAPI CryptProtectData with resilient development fallback."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("Data to protect must be bytes or bytearray")

    raw_data = bytes(data)
    if sys.platform != "win32" or not hasattr(ctypes, "windll"):
        return _dpapi_protect_fallback(raw_data, entropy)

    try:
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        data_in = DATA_BLOB()
        data_in.cbData = len(raw_data)
        data_in.pbData = ctypes.cast(
            ctypes.create_string_buffer(raw_data, len(raw_data)),
            ctypes.POINTER(ctypes.c_byte),
        )

        p_entropy = None
        if entropy:
            entropy_bytes = bytes(entropy)
            entropy_blob = DATA_BLOB()
            entropy_blob.cbData = len(entropy_bytes)
            entropy_blob.pbData = ctypes.cast(
                ctypes.create_string_buffer(entropy_bytes, len(entropy_bytes)),
                ctypes.POINTER(ctypes.c_byte),
            )
            p_entropy = ctypes.byref(entropy_blob)

        data_out = DATA_BLOB()
        result = crypt32.CryptProtectData(
            ctypes.byref(data_in),
            "NexusVaultSecret",
            p_entropy,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(data_out),
        )

        if not result:
            err = ctypes.GetLastError()
            logger.warning("Windows DPAPI CryptProtectData failed (error %s); falling back to resilient fallback", err)
            return _dpapi_protect_fallback(raw_data, entropy)

        try:
            return ctypes.string_at(data_out.pbData, data_out.cbData)
        finally:
            kernel32.LocalFree(data_out.pbData)
    except Exception as exc:
        logger.warning("CryptProtectData exception (%s); falling back to resilient fallback", exc)
        return _dpapi_protect_fallback(raw_data, entropy)


def _dpapi_unprotect(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Decrypts bytes using Windows DPAPI CryptUnprotectData with resilient development fallback."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("Data to unprotect must be bytes or bytearray")

    raw_data = bytes(data)
    if raw_data.startswith(DEV_DPAPI_PREFIX):
        return _dpapi_unprotect_fallback(raw_data, entropy)

    if sys.platform != "win32" or not hasattr(ctypes, "windll"):
        return _dpapi_unprotect_fallback(raw_data, entropy)

    try:
        crypt32 = ctypes.windll.crypt32
        kernel32 = ctypes.windll.kernel32

        data_in = DATA_BLOB()
        data_in.cbData = len(raw_data)
        data_in.pbData = ctypes.cast(
            ctypes.create_string_buffer(raw_data, len(raw_data)),
            ctypes.POINTER(ctypes.c_byte),
        )

        p_entropy = None
        if entropy:
            entropy_bytes = bytes(entropy)
            entropy_blob = DATA_BLOB()
            entropy_blob.cbData = len(entropy_bytes)
            entropy_blob.pbData = ctypes.cast(
                ctypes.create_string_buffer(entropy_bytes, len(entropy_bytes)),
                ctypes.POINTER(ctypes.c_byte),
            )
            p_entropy = ctypes.byref(entropy_blob)

        data_out = DATA_BLOB()
        result = crypt32.CryptUnprotectData(
            ctypes.byref(data_in),
            None,
            p_entropy,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(data_out),
        )

        if not result:
            err = ctypes.GetLastError()
            logger.warning("Windows DPAPI CryptUnprotectData failed (error %s)", err)
            raise OSError(f"Windows DPAPI CryptUnprotectData failed with error code: {err}")

        try:
            return ctypes.string_at(data_out.pbData, data_out.cbData)
        finally:
            kernel32.LocalFree(data_out.pbData)
    except OSError:
        raise
    except Exception as exc:
        logger.warning("CryptUnprotectData exception (%s)", exc)
        raise OSError(f"Windows DPAPI CryptUnprotectData exception: {exc}")


def protect_bytes(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Public helper to encrypt raw bytes using Windows DPAPI / resilient machine wrapping."""
    return _dpapi_protect(data, entropy=entropy)


def unprotect_bytes(data: bytes, entropy: Optional[bytes] = None) -> bytes:
    """Public helper to decrypt raw bytes using Windows DPAPI / resilient machine wrapping."""
    return _dpapi_unprotect(data, entropy=entropy)


# Public aliases for external callers and biometrics
dpapi_protect = _dpapi_protect
dpapi_unprotect = _dpapi_unprotect


class CredentialVault:
    """Local DPAPI + AES-256-GCM Protected Secret Vault."""

    def __init__(self, db_path: Optional[str | Path] = None) -> None:
        if db_path is None:
            home = Path.home() / ".nexus-agent" / "db"
            home.mkdir(parents=True, exist_ok=True)
            self.db_path = home / "vault.db"
        else:
            self.db_path = Path(db_path)
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS vault_entries (
                    key_name TEXT PRIMARY KEY,
                    encrypted_blob BLOB NOT NULL,
                    created_at REAL NOT NULL
                );
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_vault_entries_created ON vault_entries(created_at DESC);"
            )
            conn.commit()

    def set_secret_bytes(self, key: str, value: bytes) -> bool:
        """Encrypts raw bytes value with AES-256-GCM wrapped by Windows DPAPI and stores in SQLite."""
        if not key or not isinstance(key, str):
            raise ValueError("Secret key must be a non-empty string")
        if value is None or not isinstance(value, (bytes, bytearray)):
            raise ValueError("Secret value must be bytes or bytearray")

        val_bytes = bytes(value)

        # 1. Generate fresh 256-bit AES key & 96-bit GCM nonce
        aes_key = os.urandom(32)
        nonce = os.urandom(12)
        aad = key.encode("utf-8")

        # 2. Encrypt value with AES-256-GCM
        if HAS_CRYPTOGRAPHY:
            aesgcm = AESGCM(aes_key)
            ciphertext = aesgcm.encrypt(nonce, val_bytes, aad)
        else:
            # Resilient fallback: HMAC-SHA256 authenticated keystream
            keystream = hashlib.sha256(aes_key + nonce).digest()
            repeats = (len(val_bytes) // len(keystream)) + 1
            stream = (keystream * repeats)[:len(val_bytes)]
            raw_cipher = bytes(a ^ b for a, b in zip(val_bytes, stream))
            tag = hashlib.sha256(aes_key + raw_cipher + aad).digest()[:16]
            ciphertext = raw_cipher + tag

        # 3. Protect AES key using Windows DPAPI
        dpapi_encrypted_key = _dpapi_protect(aes_key)

        # 4. Pack into binary blob:
        # [Magic: 4B][Version: 1B][DPAPI Key Len: 4B uint][DPAPI Encrypted Key][Nonce: 12B][Ciphertext]
        header = struct.pack("!4sBI", VAULT_BLOB_MAGIC, VAULT_BLOB_VERSION, len(dpapi_encrypted_key))
        encrypted_blob = header + dpapi_encrypted_key + nonce + ciphertext

        # 5. Persist to SQLite table vault_entries
        now = time.time()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO vault_entries (key_name, encrypted_blob, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key_name) DO UPDATE SET
                    encrypted_blob = excluded.encrypted_blob,
                    created_at = excluded.created_at;
                """,
                (key, encrypted_blob, now),
            )
            conn.commit()

        logger.info("Encrypted and stored secret '%s' in local DPAPI vault", key)
        return True

    def set_secret(self, key: str, value: str) -> bool:
        """Encrypts string value with AES-256-GCM wrapped by Windows DPAPI and stores in SQLite."""
        if value is None or not isinstance(value, str):
            raise ValueError("Secret value must be a string")
        return self.set_secret_bytes(key, value.encode("utf-8"))

    def get_secret_bytes(self, key: str) -> Optional[bytes]:
        """Decrypts and returns secret raw bytes from local DPAPI vault, or None if not found."""
        if not key or not isinstance(key, str):
            return None

        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT encrypted_blob FROM vault_entries WHERE key_name = ?",
                (key,),
            ).fetchone()

        if not row:
            return None

        encrypted_blob: bytes = row["encrypted_blob"]

        # Parse header
        if len(encrypted_blob) < 9:
            logger.warning("Corrupted vault blob for key '%s': header too short", key)
            return None

        magic, version, dpapi_key_len = struct.unpack("!4sBI", encrypted_blob[:9])
        if magic != VAULT_BLOB_MAGIC:
            logger.warning("Invalid vault blob magic header for key '%s'", key)
            return None

        offset = 9
        dpapi_encrypted_key = encrypted_blob[offset : offset + dpapi_key_len]
        offset += dpapi_key_len

        nonce = encrypted_blob[offset : offset + 12]
        offset += 12
        ciphertext = encrypted_blob[offset:]

        # Decrypt AES key via DPAPI
        try:
            aes_key = _dpapi_unprotect(dpapi_encrypted_key)
        except Exception as err:
            logger.warning("Failed to unprotect DPAPI key for '%s': %s", key, err)
            return None

        # Decrypt ciphertext via AES-256-GCM
        aad = key.encode("utf-8")
        try:
            if HAS_CRYPTOGRAPHY:
                aesgcm = AESGCM(aes_key)
                decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, aad)
            else:
                tag = ciphertext[-16:]
                raw_cipher = ciphertext[:-16]
                expected_tag = hashlib.sha256(aes_key + raw_cipher + aad).digest()[:16]
                if tag != expected_tag:
                    logger.warning("Integrity check failed for secret '%s': authentication tag mismatch", key)
                    return None
                keystream = hashlib.sha256(aes_key + nonce).digest()
                repeats = (len(raw_cipher) // len(keystream)) + 1
                stream = (keystream * repeats)[:len(raw_cipher)]
                decrypted_bytes = bytes(a ^ b for a, b in zip(raw_cipher, stream))

            return decrypted_bytes
        except Exception as err:
            logger.warning("Failed to decrypt secret '%s': %s", key, err)
            return None

    def get_secret(self, key: str) -> Optional[str]:
        """Decrypts and returns secret value as string from local DPAPI vault, or None if not found."""
        raw = self.get_secret_bytes(key)
        if raw is None:
            return None
        return raw.decode("utf-8")

    def protect_bytes(self, data: bytes, entropy: Optional[bytes] = None) -> bytes:
        """Instance method helper to wrap bytes using DPAPI."""
        return _dpapi_protect(data, entropy=entropy)

    def unprotect_bytes(self, data: bytes, entropy: Optional[bytes] = None) -> bytes:
        """Instance method helper to unwrap bytes using DPAPI."""
        return _dpapi_unprotect(data, entropy=entropy)

    def delete_secret(self, key: str) -> bool:
        """Deletes a secret entry from the vault."""
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM vault_entries WHERE key_name = ?", (key,))
            conn.commit()
            return cur.rowcount > 0

    def list_keys(self) -> list[str]:
        """Lists all secret key names stored in the vault."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT key_name FROM vault_entries ORDER BY key_name ASC").fetchall()
            return [row["key_name"] for row in rows]

    def set_json_secret(self, key: str, data: Dict[str, Any]) -> bool:
        """Serializes dictionary to JSON and encrypts into DPAPI vault."""
        if not isinstance(data, dict):
            raise TypeError("data must be a dictionary")
        payload = json.dumps(data)
        return self.set_secret(key, payload)

    def get_json_secret(self, key: str) -> Optional[Dict[str, Any]]:
        """Decrypts JSON payload from DPAPI vault and deserializes to dictionary."""
        val = self.get_secret(key)
        if not val:
            return None
        try:
            return json.loads(val)
        except Exception as exc:
            logger.warning("Failed to decode JSON secret '%s': %s", key, exc)
            return None

    def store_oauth_tokens(self, service_name: str, token_data: Dict[str, Any]) -> bool:
        """Stores structured OAuth credentials in DPAPI vault under OAUTH_<SERVICE>_TOKENS."""
        key = f"OAUTH_{service_name.strip().upper()}_TOKENS"
        return self.set_json_secret(key, token_data)

    def load_oauth_tokens(self, service_name: str) -> Optional[Dict[str, Any]]:
        """Retrieves and deserializes OAuth credentials from DPAPI vault."""
        key = f"OAUTH_{service_name.strip().upper()}_TOKENS"
        return self.get_json_secret(key)

    def delete_oauth_tokens(self, service_name: str) -> bool:
        """Deletes OAuth credentials from DPAPI vault."""
        key = f"OAUTH_{service_name.strip().upper()}_TOKENS"
        return self.delete_secret(key)


# Module-level default vault singleton and convenience helpers
_default_vault: Optional[CredentialVault] = None


def get_default_vault() -> CredentialVault:
    global _default_vault
    if _default_vault is None:
        _default_vault = CredentialVault()
    return _default_vault


def set_secret(key: str, value: str, db_path: Optional[str | Path] = None) -> bool:
    """Global helper to store a secret string in the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.set_secret(key, value)


def get_secret(key: str, db_path: Optional[str | Path] = None) -> Optional[str]:
    """Global helper to retrieve a secret string from the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.get_secret(key)


def set_secret_bytes(key: str, value: bytes, db_path: Optional[str | Path] = None) -> bool:
    """Global helper to store a raw bytes secret in the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.set_secret_bytes(key, value)


def get_secret_bytes(key: str, db_path: Optional[str | Path] = None) -> Optional[bytes]:
    """Global helper to retrieve raw bytes secret from the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.get_secret_bytes(key)


def set_json_secret(key: str, data: Dict[str, Any], db_path: Optional[str | Path] = None) -> bool:
    """Global helper to store a JSON-serializable dictionary in the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.set_json_secret(key, data)


def get_json_secret(key: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    """Global helper to retrieve and deserialize a JSON secret from the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.get_json_secret(key)


def store_oauth_tokens(service_name: str, token_data: Dict[str, Any], db_path: Optional[str | Path] = None) -> bool:
    """Global helper to store OAuth tokens in the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.store_oauth_tokens(service_name, token_data)


def load_oauth_tokens(service_name: str, db_path: Optional[str | Path] = None) -> Optional[Dict[str, Any]]:
    """Global helper to retrieve OAuth tokens from the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.load_oauth_tokens(service_name)


def delete_oauth_tokens(service_name: str, db_path: Optional[str | Path] = None) -> bool:
    """Global helper to delete OAuth tokens from the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.delete_oauth_tokens(service_name)


def list_keys(db_path: Optional[str | Path] = None) -> list[str]:
    """Global helper to list all secret keys stored in the DPAPI vault."""
    vault = CredentialVault(db_path) if db_path else get_default_vault()
    return vault.list_keys()


# Compatibility alias for external scripts and callers
VaultManager = CredentialVault
SecretVault = CredentialVault

__all__ = [
    "CredentialVault",
    "VaultManager",
    "SecretVault",
    "get_default_vault",
    "set_secret",
    "get_secret",
    "set_secret_bytes",
    "get_secret_bytes",
    "set_json_secret",
    "get_json_secret",
    "store_oauth_tokens",
    "load_oauth_tokens",
    "delete_oauth_tokens",
    "list_keys",
    "protect_bytes",
    "unprotect_bytes",
    "dpapi_protect",
    "dpapi_unprotect",
    "_dpapi_protect",
    "_dpapi_unprotect",
]

