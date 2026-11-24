"""Nexus OS v5.0 - Security Vault & DPAPI Subsystem.

Provides local-first DPAPI credential protection combined with AES-256-GCM.
"""

from .vault import CredentialVault, get_secret, set_secret

__all__ = [
    "CredentialVault",
    "get_secret",
    "set_secret",
]
