"""
Nexus OS v5.0 - Gemini Multimodal Live Bidirectional Duplex Bridge.
Provides bidirectional WebSocket streaming for voice/audio (16kHz PCM in / 24kHz PCM out)
and real-time visual perception (JPEG media push), with code 1008 reconnection loops,
DPAPI vault credential loading, and strict WorkspaceGovernor [SILENT] air-gap enforcement.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Union

from core.runtime.workspaces import WorkspaceGovernor
from core.security.vault import get_secret

logger = logging.getLogger("nexus.runtime.gemini_live_duplex")

# Standard Google GenAI Multimodal Live WebSocket Endpoint
GEMINI_LIVE_WS_ENDPOINT = (
    "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
)
DEFAULT_MODEL = "models/gemini-2.0-flash-exp"
DEFAULT_VOICE = "Aoede"


def get_gemini_api_key(vault_path: Optional[str] = None) -> Optional[str]:
    """
    Retrieves Gemini API key with sovereign precedence:
    1. Local Windows DPAPI / AES-256 vault (GEMINI_API_KEY)
    2. Process environment variable (GEMINI_API_KEY)
    """
    key = None
    try:
        key = get_secret("GEMINI_API_KEY", db_path=vault_path)
    except Exception as exc:
        logger.debug("Vault credential check notice: %s", exc)

    if not key:
        key = os.environ.get("GEMINI_API_KEY")

    return key


def build_setup_payload(
    model: str = DEFAULT_MODEL,
    voice_name: str = DEFAULT_VOICE,
    system_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    """Constructs the initial WebSocket setup handshake message."""
    setup_dict: Dict[str, Any] = {
        "model": model,
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name,
                    }
                }
            },
        },
    }

    if system_instruction:
        setup_dict["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    return {"setup": setup_dict}


def build_realtime_audio_chunk(pcm_bytes: bytes, rate: int = 16000) -> Dict[str, Any]:
    """Encodes 16kHz PCM audio bytes into a real-time media chunk payload."""
    b64_data = base64.b64encode(pcm_bytes).decode("ascii")
    return {
        "realtimeInput": {
            "mediaChunks": [
                {
                    "mimeType": f"audio/pcm;rate={rate}",
                    "data": b64_data,
                }
            ]
        }
    }


def build_realtime_image_chunk(image_bytes: bytes) -> Dict[str, Any]:
    """Encodes JPEG visual frame bytes into a real-time media chunk payload."""
    b64_data = base64.b64encode(image_bytes).decode("ascii")
    return {
        "realtimeInput": {
            "mediaChunks": [
                {
                    "mimeType": "image/jpeg",
                    "data": b64_data,
                }
            ]
        }
    }


def build_client_content_turn(text: str, turn_complete: bool = True) -> Dict[str, Any]:
    """Encodes text prompt or user turn content."""
    return {
        "clientContent": {
            "turns": [
                {
                    "role": "user",
                    "parts": [{"text": text}],
                }
            ],
            "turnComplete": turn_complete,
        }
    }


def parse_server_message(data: Union[str, bytes, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Parses incoming WebSocket message from Gemini Multimodal Live API.
    Extracts 24kHz PCM audio, response transcripts, turn status, and server events.
    Supports dictionary, JSON string, or raw UTF-8 bytes.
    """
    if isinstance(data, dict):
        msg = data
    elif isinstance(data, bytes):
        raw_text = data.decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw_text)
        except Exception:
            return {"type": "raw", "data": raw_text}
    elif isinstance(data, str):
        try:
            msg = json.loads(data)
        except Exception:
            return {"type": "raw", "data": data}
    else:
        return {"type": "raw", "data": str(data)}

    result: Dict[str, Any] = {
        "type": "server_content",
        "audio_chunks": [],
        "text_parts": [],
        "turn_complete": False,
        "interrupted": False,
        "raw": msg,
    }

    server_content = msg.get("serverContent")
    if not server_content:
        if "setupComplete" in msg:
            result["type"] = "setup_complete"
        return result

    result["interrupted"] = bool(server_content.get("interrupted", False))
    result["turn_complete"] = bool(server_content.get("turnComplete", False))

    model_turn = server_content.get("modelTurn")
    if model_turn:
        parts = model_turn.get("parts", [])
        for part in parts:
            # Check for inline audio data (24kHz PCM)
            inline_data = part.get("inlineData")
            if inline_data:
                mime = inline_data.get("mimeType", "")
                b64_payload = inline_data.get("data", "")
                if b64_payload:
                    try:
                        raw_pcm = base64.b64decode(b64_payload)
                        result["audio_chunks"].append({
                            "mimeType": mime,
                            "pcm_bytes": raw_pcm,
                        })
                    except Exception as err:
                        logger.debug("Error decoding inline audio chunk: %s", err)

            # Check for text response
            text_val = part.get("text")
            if text_val:
                result["text_parts"].append(text_val)

    return result


class GeminiLiveDuplexBridge:
    """
    Asynchronous and synchronous bidirectional duplex WebSocket bridge
    for the Gemini Multimodal Live API.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        voice_name: str = DEFAULT_VOICE,
        governor: Optional[WorkspaceGovernor] = None,
        max_reconnect_attempts: int = 3,
        reconnect_delay_sec: float = 1.0,
        system_instruction: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or get_gemini_api_key()
        self.model = model
        self.voice_name = voice_name
        self.governor = governor or WorkspaceGovernor()
        self.max_reconnect_attempts = max_reconnect_attempts
        self.reconnect_delay_sec = reconnect_delay_sec
        self.system_instruction = system_instruction

        self.ws: Any = None
        self.is_connected: bool = False
        self._manual_close: bool = False
        self._reconnect_count: int = 0
        self.last_error: Optional[Exception] = None

        # Callbacks
        self._audio_callbacks: List[Callable[[bytes], None]] = []
        self._text_callbacks: List[Callable[[str], None]] = []
        self._turn_complete_callbacks: List[Callable[[], None]] = []
        self._error_callbacks: List[Callable[[Exception], None]] = []
        self._reconnect_callbacks: List[Callable[[int, int], None]] = []

    def on_audio_data(self, callback: Callable[[bytes], None]) -> None:
        """Registers a callback receiving 24kHz PCM output audio from Gemini."""
        self._audio_callbacks.append(callback)

    def on_text_data(self, callback: Callable[[str], None]) -> None:
        """Registers a callback receiving response transcripts."""
        self._text_callbacks.append(callback)

    def on_turn_complete(self, callback: Callable[[], None]) -> None:
        """Registers a callback triggered on turn completion."""
        self._turn_complete_callbacks.append(callback)

    def on_error(self, callback: Callable[[Exception], None]) -> None:
        """Registers a callback triggered on socket/protocol errors."""
        self._error_callbacks.append(callback)

    def on_reconnect(self, callback: Callable[[int, int], None]) -> None:
        """Registers a callback triggered during reconnection attempts (attempt, max_attempts)."""
        self._reconnect_callbacks.append(callback)

    def _assert_airgap_permission(self) -> None:
        """Verifies that WorkspaceGovernor is NOT in [SILENT] air-gapped mode."""
        if self.governor.is_silent() or self.governor.get_mode().upper() == "SILENT":
            if self.is_connected:
                # Force close active socket immediately
                self.disconnect()
            raise PermissionError(
                "[WORKSPACE GOVERNOR] Gemini Live Duplex connection is strictly blocked in [SILENT] air-gapped mode."
            )

    async def connect_async(self) -> bool:
        """
        Asynchronously establishes the WebSocket duplex connection to Gemini.
        Raises PermissionError if WorkspaceGovernor is in SILENT mode.
        """
        self._assert_airgap_permission()

        if not self.api_key:
            self.api_key = get_gemini_api_key()
            if not self.api_key:
                raise ValueError("No Gemini API key found in Windows DPAPI vault or environment.")

        try:
            import websockets
        except ImportError:
            raise ImportError("The 'websockets' package is required for Gemini Live Duplex.")

        url = f"{GEMINI_LIVE_WS_ENDPOINT}?key={self.api_key}"
        self._manual_close = False

        try:
            logger.info("Connecting to Gemini Live Duplex WebSocket (%s)...", self.model)
            self.ws = await websockets.connect(
                url,
                ping_interval=20,
                ping_timeout=20,
                close_timeout=5,
            )
            self.is_connected = True
            self._reconnect_count = 0

            # Dispatch setup handshake message
            setup_payload = build_setup_payload(
                model=self.model,
                voice_name=self.voice_name,
                system_instruction=self.system_instruction,
            )
            await self.ws.send(json.dumps(setup_payload))
            logger.info("Sent Gemini Live setup handshake.")
            return True
        except Exception as exc:
            self.last_error = exc
            self.is_connected = False
            for cb in self._error_callbacks:
                cb(exc)
            raise

    async def push_audio_pcm_async(self, pcm_bytes: bytes, rate: int = 16000) -> None:
        """Asynchronously streams 16kHz PCM audio bytes into Gemini Live session."""
        self._assert_airgap_permission()
        if not self.is_connected or not self.ws:
            raise RuntimeError("Gemini Live Duplex WebSocket is not connected.")

        payload = build_realtime_audio_chunk(pcm_bytes, rate=rate)
        await self.ws.send(json.dumps(payload))

    async def push_media_jpeg_async(self, image_bytes: bytes) -> None:
        """Asynchronously streams a JPEG camera frame or screen capture to Gemini Live session."""
        self._assert_airgap_permission()
        if not self.is_connected or not self.ws:
            raise RuntimeError("Gemini Live Duplex WebSocket is not connected.")

        payload = build_realtime_image_chunk(image_bytes)
        await self.ws.send(json.dumps(payload))

    async def send_text_prompt_async(self, text: str) -> None:
        """Asynchronously sends a textual prompt or command into Gemini Live session."""
        self._assert_airgap_permission()
        if not self.is_connected or not self.ws:
            raise RuntimeError("Gemini Live Duplex WebSocket is not connected.")

        payload = build_client_content_turn(text)
        await self.ws.send(json.dumps(payload))

    async def listen_loop_async(self) -> None:
        """
        Asynchronously receives incoming server messages and dispatches audio/text callbacks.
        Handles policy code 1008 and socket drops via automatic exponential backoff reconnection.
        """
        while not self._manual_close:
            self._assert_airgap_permission()
            try:
                if not self.is_connected or not self.ws:
                    await self.connect_async()

                async for message in self.ws:
                    self._assert_airgap_permission()
                    parsed = parse_server_message(message)

                    # Dispatch audio callbacks (24kHz PCM)
                    for chunk in parsed.get("audio_chunks", []):
                        pcm = chunk.get("pcm_bytes")
                        if pcm:
                            for cb in self._audio_callbacks:
                                try:
                                    cb(pcm)
                                except Exception as exc:
                                    logger.error("Audio callback error: %s", exc)

                    # Dispatch text transcripts
                    for txt in parsed.get("text_parts", []):
                        for cb in self._text_callbacks:
                            try:
                                cb(txt)
                            except Exception as exc:
                                logger.error("Text callback error: %s", exc)

                    # Dispatch turn complete
                    if parsed.get("turn_complete"):
                        for cb in self._turn_complete_callbacks:
                            try:
                                cb()
                            except Exception as exc:
                                logger.error("Turn complete callback error: %s", exc)

            except Exception as exc:
                self.is_connected = False
                self.last_error = exc
                if self._manual_close:
                    break

                # Inspect close code 1008 (Policy Violation) or general network drops
                close_code = getattr(exc, "code", None)
                is_policy_violation = (close_code == 1008)

                logger.warning(
                    "Gemini Live Duplex socket disconnected (code=%s): %s",
                    close_code,
                    exc,
                )

                if self._reconnect_count < self.max_reconnect_attempts:
                    self._reconnect_count += 1
                    backoff = self.reconnect_delay_sec * (2 ** (self._reconnect_count - 1))
                    logger.info(
                        "Initiating reconnection attempt %d/%d in %.1fs (code 1008=%s)...",
                        self._reconnect_count,
                        self.max_reconnect_attempts,
                        backoff,
                        is_policy_violation,
                    )
                    for cb in self._reconnect_callbacks:
                        try:
                            cb(self._reconnect_count, self.max_reconnect_attempts)
                        except Exception:
                            pass

                    # Refresh API key from vault in case updated
                    self.api_key = get_gemini_api_key()
                    await asyncio.sleep(backoff)
                else:
                    logger.error("Maximum reconnection attempts exhausted (%d).", self.max_reconnect_attempts)
                    for cb in self._error_callbacks:
                        cb(exc)
                    break

    async def disconnect_async(self) -> None:
        """Asynchronously disconnects and closes the active WebSocket session."""
        self._manual_close = True
        self.is_connected = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
            self.ws = None

    # -------------------------------------------------------------------------
    # Synchronous Convenience Interface (Worker Thread Execution)
    # -------------------------------------------------------------------------
    def push_audio_pcm(self, pcm_bytes: bytes, rate: int = 16000) -> None:
        """Synchronously streams 16kHz PCM audio bytes."""
        self._assert_airgap_permission()
        asyncio.run(self.push_audio_pcm_async(pcm_bytes, rate=rate))

    def push_media_jpeg(self, image_bytes: bytes) -> None:
        """Synchronously streams JPEG image bytes."""
        self._assert_airgap_permission()
        asyncio.run(self.push_media_jpeg_async(image_bytes))

    def send_text_prompt(self, text: str) -> None:
        """Synchronously dispatches a text prompt."""
        self._assert_airgap_permission()
        asyncio.run(self.send_text_prompt_async(text))

    def disconnect(self) -> None:
        """Synchronously closes the session."""
        self._manual_close = True
        self.is_connected = False
        if self.ws:
            try:
                asyncio.run(self.disconnect_async())
            except Exception:
                pass

    def route_voice_to_local_fallback(self) -> Dict[str, Any]:
        """Routes voice session back to local Silero VAD + Kokoro-82M upon SILENT mode or cloud failure."""
        try:
            from core.bridge.voice_pipeline import VoicePipeline
            vp = VoicePipeline()
            logger.info("Routed voice to local Silero VAD + Kokoro-82M fallback.")
            return {
                "success": True,
                "engine": "local_silero_kokoro",
                "local_fallback_active": True,
                "vad": "silero_vad",
                "tts": "kokoro_82m",
                "pipeline": vp,
            }
        except Exception as exc:
            logger.warning("Local voice fallback initialization note: %s", exc)
            return {
                "success": False,
                "error": str(exc),
                "engine": "local_silero_kokoro",
                "local_fallback_active": True,
                "vad": "silero_vad",
                "tts": "kokoro_82m",
            }
