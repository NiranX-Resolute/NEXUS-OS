"""Nexus OS v5.0 - DPAPI & AES-256-GCM Vault Test Suite."""

from __future__ import annotations

import tempfile
from pathlib import Path
import pytest

from core.security.vault import CredentialVault


@pytest.fixture
def temp_vault_db() -> Path:
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        db_path = Path(tf.name)
    yield db_path
    if db_path.exists():
        try:
            db_path.unlink()
        except Exception:
            pass


@pytest.fixture
def vault(temp_vault_db: Path) -> CredentialVault:
    return CredentialVault(db_path=temp_vault_db)


def test_vault_set_and_get_secret(vault: CredentialVault) -> None:
    """Verifies that secrets are encrypted and decrypted correctly."""
    key = "OPENAI_API_KEY"
    val = "sk-nexus-live-test-key-1234567890"

    assert vault.set_secret(key, val) is True
    retrieved = vault.get_secret(key)
    assert retrieved == val


def test_vault_get_missing_secret(vault: CredentialVault) -> None:
    """Verifies that non-existent keys return None."""
    assert vault.get_secret("NON_EXISTENT_KEY") is None


def test_vault_delete_secret(vault: CredentialVault) -> None:
    """Verifies that secret deletion works and removes the entry."""
    key = "TEMP_TOKEN"
    val = "token_xyz_987"

    vault.set_secret(key, val)
    assert vault.get_secret(key) == val

    assert vault.delete_secret(key) is True
    assert vault.get_secret(key) is None
    assert vault.delete_secret(key) is False
