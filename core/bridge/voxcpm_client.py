"""
Nexus OS v5.0 - Remote VoxCPM2 Voice Cloning & Design Bridge
Ultra-high quality zero-shot voice cloning and text-prompted voice generation via Kaggle 2x T4 GPU tunnel.
Gracefully cascades to local Kokoro-82M / Edge-TTS when Kaggle tunnel is offline.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any, Dict, Optional
import requests

logger = logging.getLogger("nexus.bridge.voxcpm_client")

DEFAULT_CONNECT_TIMEOUT = 5.0


class VoxCPM2Client:
    """Client for remote VoxCPM2 neural voice synthesis hosted on Kaggle 2x T4 GPUs."""

    def __init__(self, endpoint_url: Optional[str] = None, timeout: float = DEFAULT_CONNECT_TIMEOUT):
        env_url = os.environ.get("NEXUS_VOXCPM_URL", "") or os.environ.get("KAGGLE_VOXCPM_URL", "")
        self.endpoint_url = (endpoint_url or env_url).rstrip("/")
        self.timeout = timeout

    def is_configured(self) -> bool:
        """Checks if a remote Kaggle tunnel URL has been configured."""
        return bool(self.endpoint_url and self.endpoint_url.startswith(("http://", "https://")))

    def check_health(self) -> bool:
        """
        Pings remote Kaggle worker health endpoint with strict 2.0s timeout.
        Returns True if online, False otherwise. Zero exceptions raised.
        """
        if not self.is_configured():
            return False
        try:
            health_url = f"{self.endpoint_url}/health"
            resp = requests.get(health_url, timeout=2.0)
            return resp.status_code == 200
        except Exception as exc:
            logger.debug("VoxCPM2 remote health check failed: %s", exc)
            return False

    def synthesize(
        self,
        text: str,
        voice_prompt: Optional[str] = None,
        reference_audio_b64: Optional[str] = None,
        output_format: str = "wav",
    ) -> Optional[bytes]:
        """
        Synthesizes speech via remote VoxCPM2 endpoint.
        Supports zero-shot voice cloning (via reference_audio_b64) and text-prompted voice design (via voice_prompt).

        Args:
            text: Text to synthesize.
            voice_prompt: Spoken persona description (e.g., 'calm, warm, articulate female voice').
            reference_audio_b64: Base64-encoded 3-5s sample WAV for zero-shot cloning.
            output_format: Target audio container ('wav' or 'mp3').

        Returns:
            Raw audio bytes if successful, None if offline/unreachable (triggering local fallback).
        """
        if not self.is_configured() or not text or not text.strip():
            return None

        payload: Dict[str, Any] = {
            "text": text.strip(),
            "voice_prompt": voice_prompt or "Calm, natural, articulate spoken tone",
            "format": output_format,
        }
        if reference_audio_b64:
            payload["reference_audio_b64"] = reference_audio_b64

        url = f"{self.endpoint_url}/synthesize"
        try:
            resp = requests.post(url, json=payload, timeout=self.timeout)
            if resp.status_code != 200:
                logger.warning("VoxCPM2 remote synthesis returned status %s: %s", resp.status_code, resp.text[:200])
                return None

            content_type = resp.headers.get("Content-Type", "")
            if "audio/" in content_type:
                return resp.content

            data = resp.json()
            if "audio_b64" in data and data["audio_b64"]:
                return base64.b64decode(data["audio_b64"])
            elif "audio" in data and data["audio"]:
                return base64.b64decode(data["audio"])

            logger.warning("VoxCPM2 response did not contain expected audio payload")
            return None
        except requests.exceptions.Timeout:
            logger.warning("VoxCPM2 remote synthesis timed out after %ss; cascading to local engine", self.timeout)
            return None
        except Exception as exc:
            logger.warning("VoxCPM2 remote synthesis connection error: %s; cascading to local engine", exc)
            return None

    def synthesize_to_file(
        self,
        text: str,
        output_path: str,
        voice_prompt: Optional[str] = None,
        reference_audio_b64: Optional[str] = None,
    ) -> bool:
        """Synthesizes speech and writes the resulting audio file to disk."""
        audio_bytes = self.synthesize(
            text=text,
            voice_prompt=voice_prompt,
            reference_audio_b64=reference_audio_b64,
        )
        if not audio_bytes:
            return False
        try:
            with open(output_path, "wb") as f:
                f.write(audio_bytes)
            return True
        except Exception as exc:
            logger.error("Failed to write VoxCPM2 synthesized audio: %s", exc)
            return False
