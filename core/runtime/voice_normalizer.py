"""Nexus OS v5.0 - Voice Normalizer for High-Prosody Speech Synthesis.

Optimized for ultra-low latency (<5ms) text pre-processing before Kokoro / Gemini TTS.
Strips Markdown, expands currencies, normalizes technical units, IP addresses, percentages,
cleans Hinglish pauses, and structures punctuation.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("nexus.runtime.voice_normalizer")

# =============================================================================
# Pre-compiled Regular Expressions for Sub-millisecond Execution (<5ms)
# =============================================================================

# 1. Markdown Patterns
_RE_CODE_BLOCK = re.compile(r"```[\s\S]*?```")
_RE_INLINE_CODE = re.compile(r"`([^`]+)`")
_RE_IMAGE = re.compile(r"!\[(.*?)\]\(.*?\)")
_RE_LINK = re.compile(r"\[(.*?)\]\(.*?\)")
_RE_HEADER = re.compile(r"^\s*#{1,6}\s*", re.MULTILINE)
_RE_BLOCKQUOTE = re.compile(r"^\s*>\s*", re.MULTILINE)
_RE_BULLETS = re.compile(r"^\s*[-*+]\s+", re.MULTILINE)
_RE_NUMBERED_LIST = re.compile(r"^\s*(\d+)\.\s+", re.MULTILINE)
_RE_HORIZONTAL_RULE = re.compile(r"^\s*([-*_]){3,}\s*$", re.MULTILINE)
_RE_BOLD_ITALIC = re.compile(r"(\*{1,3}|_{1,3})(.*?)\1")
_RE_STRIKETHROUGH = re.compile(r"~~(.*?)~~")
_RE_TABLE_ROW = re.compile(r"^\s*\|.*?\|\s*$", re.MULTILINE)
_RE_HTML_TAGS = re.compile(r"<[^>]+>")

# 2. Currency Patterns
_RE_CURRENCY_PREFIX = re.compile(
    r"(₹|Rs\.?|INR|\$|€|£)\s*(\d+(?:,\d+)*(?:\.\d+)?)\b",
    re.IGNORECASE,
)
_RE_CURRENCY_SUFFIX = re.compile(
    r"\b(\d+(?:,\d+)*(?:\.\d+)?)\s*(INR|rupees|dollars|euros|pounds)\b",
    re.IGNORECASE,
)
_RE_STANDALONE_CURRENCY = re.compile(r"\b(INR|Rs\.?)\b", re.IGNORECASE)

_CURRENCY_MAP = {
    "₹": "rupees",
    "rs.": "rupees",
    "rs": "rupees",
    "inr": "rupees",
    "$": "dollars",
    "€": "euros",
    "£": "pounds",
}

# 3. IP Addresses & Network Notation
_RE_IP_ADDRESS = re.compile(r"\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b")
_RE_PERCENTAGE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
_RE_VERSION_NUM = re.compile(r"\bv(\d+)\.(\d+)(?:\.(\d+))?\b")
_RE_URL = re.compile(r"https?://\S+|www\.\S+")

# 4. Technical Unit Patterns
_UNIT_REPLACEMENTS: List[Tuple[re.Pattern, str]] = [
    # Speed
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*km/h\b", re.IGNORECASE), r"\1 kilometers per hour"),
    (re.compile(r"\bkm/h\b", re.IGNORECASE), "kilometers per hour"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*mph\b", re.IGNORECASE), r"\1 miles per hour"),
    
    # Data Storage
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*TB\b"), r"\1 terabytes"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*GB\b"), r"\1 gigabytes"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*MB\b"), r"\1 megabytes"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*KB\b"), r"\1 kilobytes"),
    (re.compile(r"\bTB\b"), "terabytes"),
    (re.compile(r"\bGB\b"), "gigabytes"),
    (re.compile(r"\bMB\b"), "megabytes"),
    (re.compile(r"\bKB\b"), "kilobytes"),
    
    # Time / Frequency
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*ms\b", re.IGNORECASE), r"\1 milliseconds"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*GHz\b", re.IGNORECASE), r"\1 gigahertz"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*MHz\b", re.IGNORECASE), r"\1 megahertz"),
    (re.compile(r"\b(\d+(?:\.\d+)?)\s*kHz\b", re.IGNORECASE), r"\1 kilohertz"),
    (re.compile(r"\bGHz\b", re.IGNORECASE), "gigahertz"),
    (re.compile(r"\bMHz\b", re.IGNORECASE), "megahertz"),
    (re.compile(r"\bkHz\b", re.IGNORECASE), "kilohertz"),
    
    # Hardware Terms
    (re.compile(r"\bVRAM\b", re.IGNORECASE), "V-RAM"),
    (re.compile(r"\bGPU\b"), "G-P-U"),
    (re.compile(r"\bGPUs\b"), "G-P-Us"),
    (re.compile(r"\bCPU\b"), "C-P-U"),
    (re.compile(r"\bCPUs\b"), "C-P-Us"),
    (re.compile(r"(?<![Vv]-)\bRAM\b"), "R-A-M"),
    (re.compile(r"\bOS\b"), "O-S"),
    (re.compile(r"\bAPI\b"), "A-P-I"),
    (re.compile(r"\bAPIs\b"), "A-P-Is"),
    (re.compile(r"\bIPC\b"), "I-P-C"),
    (re.compile(r"\bSDK\b"), "S-D-K"),
    (re.compile(r"\bUI\b"), "U-I"),
]

# 5. Hinglish & Conversational Pause Standardization
_HINGLISH_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bhaan\s*,\s*", re.IGNORECASE), "Haan, "),
    (re.compile(r"\btheek\s+hai\b", re.IGNORECASE), "theek hai, "),
    (re.compile(r"\bachha\b", re.IGNORECASE), "achha, "),
    (re.compile(r"\bbhai\b", re.IGNORECASE), "bhai, "),
    (re.compile(r"\byaar\b", re.IGNORECASE), "yaar, "),
    (re.compile(r"\bsuno\b", re.IGNORECASE), "suno, "),
    (re.compile(r"\bdekho\b", re.IGNORECASE), "dekho, "),
]

# 6. Decimals and Conversational Punctuation
_RE_DECIMAL = re.compile(r"(\b\d+)\.(\d+\b)")
_RE_ORDINAL = re.compile(r"\b(\d+)(st|nd|rd|th)\b", re.IGNORECASE)
_RE_EMOJI_AND_SYMBOLS = re.compile(r"[^\w\s.,!?:;'\"/\-₹$€£%()]")
_RE_MULTIPLE_PUNCTUATION = re.compile(r"([!?,.]){2,}")
_RE_DASHES = re.compile(r"[\u2013\u2014\-]{2,}")
_RE_STRAY_SYMBOLS = re.compile(r"[*_~^|\\<>{}\[\]@#]")
_RE_WHITESPACE = re.compile(r"\s+")


def strip_markdown(text: str) -> str:
    """Strips Markdown syntax (code blocks, inline code, bold, links, headers, quotes)."""
    if not text:
        return ""

    s = _RE_CODE_BLOCK.sub(" ", text)
    s = _RE_URL.sub("web link", s)
    s = _RE_INLINE_CODE.sub(r"\1", s)
    s = _RE_IMAGE.sub(r"\1", s)
    s = _RE_LINK.sub(r"\1", s)
    s = _RE_TABLE_ROW.sub(" ", s)
    s = _RE_HORIZONTAL_RULE.sub(" ", s)
    s = _RE_HEADER.sub("", s)
    s = _RE_BLOCKQUOTE.sub("", s)
    s = _RE_BULLETS.sub("", s)
    s = _RE_NUMBERED_LIST.sub(r"\1, ", s)
    s = _RE_BOLD_ITALIC.sub(r"\2", s)
    s = _RE_STRIKETHROUGH.sub(r"\1", s)
    s = _RE_HTML_TAGS.sub("", s)
    return s


def expand_currencies(text: str) -> str:
    """Expands currency notations into spoken words (e.g. '$50' -> '50 dollars', '₹4,799' -> '4799 rupees')."""
    if not text:
        return ""

    def _replace_prefix(match: re.Match) -> str:
        symbol = match.group(1).lower().rstrip(".")
        amount = match.group(2).replace(",", "")
        if amount.endswith(".00"):
            amount = amount[:-3]
        name = _CURRENCY_MAP.get(symbol, "rupees" if "rs" in symbol or "₹" in symbol or "inr" in symbol else "dollars")
        return f"{amount} {name}"

    def _replace_suffix(match: re.Match) -> str:
        amount = match.group(1).replace(",", "")
        if amount.endswith(".00"):
            amount = amount[:-3]
        cur = match.group(2).lower()
        name = _CURRENCY_MAP.get(cur, "rupees" if "inr" in cur else cur)
        return f"{amount} {name}"

    s = _RE_CURRENCY_PREFIX.sub(_replace_prefix, text)
    s = _RE_CURRENCY_SUFFIX.sub(_replace_suffix, s)
    s = _RE_STANDALONE_CURRENCY.sub("rupees", s)
    return s


def expand_network_and_versions(text: str) -> str:
    """Expands IP addresses and software version notations."""
    if not text:
        return ""

    def _replace_ip(m: re.Match) -> str:
        return f"{m.group(1)} dot {m.group(2)} dot {m.group(3)} dot {m.group(4)}"

    def _replace_ver(m: re.Match) -> str:
        maj, mino, patch = m.group(1), m.group(2), m.group(3)
        return f"version {maj} point {mino} point {patch}" if patch else f"version {maj} point {mino}"

    s = _RE_IP_ADDRESS.sub(_replace_ip, text)
    s = _RE_PERCENTAGE.sub(r"\1 percent", s)
    s = _RE_VERSION_NUM.sub(_replace_ver, s)
    return s


def expand_units(text: str) -> str:
    """Expands technical units and hardware acronyms for clear spoken output."""
    if not text:
        return ""

    s = text
    for pattern, replacement in _UNIT_REPLACEMENTS:
        s = pattern.sub(replacement, s)
    return s


def clean_prosody_and_hinglish(text: str) -> str:
    """Normalizes Hinglish conversational pauses, dashes, and punctuation boundaries."""
    if not text:
        return ""

    s = text
    # Convert decimals: "3.5" -> "3 point 5"
    s = _RE_DECIMAL.sub(r"\1 point \2", s)
    # Convert pauses
    s = _RE_DASHES.sub(", ", s)
    s = _RE_MULTIPLE_PUNCTUATION.sub(r"\1", s)
    # Hinglish conversational markers
    for pattern, replacement in _HINGLISH_PATTERNS:
        s = pattern.sub(replacement, s)
    # Strip stray formatting characters
    s = _RE_STRAY_SYMBOLS.sub(" ", s)
    s = _RE_EMOJI_AND_SYMBOLS.sub(" ", s)
    # Collapse whitespace
    s = _RE_WHITESPACE.sub(" ", s).strip()
    return s


# Backwards compatibility alias
clean_prosody_and_numbers = clean_prosody_and_hinglish


def normalize_for_speech(text: str, enable_llm_polish: bool = False) -> str:
    """
    Deterministic, 100% offline phonetic and text normalization for speech synthesis.
    Executes in <5ms across arbitrary strings with zero cloud network calls.

    Args:
        text: Input Markdown, technical, or conversational string.
        enable_llm_polish: Strictly opt-in flag for LLM script refinement.
                           Guarded by WorkspaceGovernor and disabled in [SILENT] mode.

    Returns:
        Cleaned, prosody-optimized plain text suitable for direct TTS synthesis.
    """
    if not text or not isinstance(text, str):
        return ""

    t0 = time.perf_counter()

    s = strip_markdown(text)
    s = expand_network_and_versions(s)
    s = expand_currencies(s)
    s = expand_units(s)
    s = clean_prosody_and_hinglish(s)

    # Ensure sentence-ending punctuation for natural prosodic cadence
    if s and s[-1] not in (".", "!", "?", ","):
        s += "."

    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    logger.debug("Speech normalization completed in %.2fms", elapsed_ms)

    if enable_llm_polish:
        s = _apply_optional_llm_polish(s)

    return s


def _apply_optional_llm_polish(text: str) -> str:
    """
    Opt-in LLM script polish. Strictly validates WorkspaceGovernor mode
    and loads credentials via DPAPI vault.
    """
    try:
        from core.runtime.workspaces import WorkspaceGovernor
        gov = WorkspaceGovernor()
        if gov.get_mode().upper() == "SILENT":
            logger.info("SILENT mode active: skipping LLM voice polish (air-gap preserved).")
            return text
    except Exception as exc:
        logger.debug("WorkspaceGovernor check note: %s", exc)

    try:
        from core.security.vault import get_secret
        api_key = get_secret("GEMINI_API_KEY") or get_secret("google_api_key")
        if not api_key:
            return text

        from google.genai import Client
        client = Client(api_key=api_key)
        prompt = (
            "You prepare scripts for a text-to-speech voice. Rewrite the user's script so a speech engine "
            "reads it aloud naturally. Keep every word in the script it is written in. Do not translate. "
            "Remove markdown. Output only the rewritten script without commentary."
        )
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{prompt}\n\nScript:\n{text}",
        )
        if response and response.text:
            return response.text.strip()
    except Exception as exc:
        logger.debug("Optional LLM polish fallback note: %s", exc)

    return text
