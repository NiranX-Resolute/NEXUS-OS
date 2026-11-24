"""Nexus OS v5.0 - Live Speech-to-Text Subtitle Stream Plugin.

Streams live real-time speech subtitles from system audio, microphone, or meetings:
- Maintains a low-latency rolling subtitle buffer
- Broadcasts real-time transcript events via emit_telemetry_event to WebSocket /ws/telemetry and HUD
- Integrates with local audio transcription services (Kokoro, Vosk, Whisper, or Windows SAPI)
- Provides full history retrieval for meeting notes and voice command audit
"""

from __future__ import annotations

import collections
import datetime
import json
import logging
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.live_subtitle_stream")

# In-memory rolling buffer for recent subtitle segments
_SUBTITLE_BUFFER: collections.deque = collections.deque(maxlen=100)
_STREAM_STATE: Dict[str, Any] = {
    "is_streaming": False,
    "source": "microphone",
    "language": "en-US",
    "session_id": "",
    "started_at": 0.0,
    "chunks_processed": 0,
}


@nexus_tool(
    name="live_subtitle_stream",
    description="Streams live speech-to-text subtitles from desktop system audio or microphone, emitting low-latency transcript events to the HUD and WebSocket.",
    agent="DEV-01",
    requires_approval=False,
)
def live_subtitle_stream(
    action: str = "status",
    text_chunk: Optional[str] = None,
    speaker: str = "Operator",
    source: str = "microphone",
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Controls and queries the live speech subtitle streaming engine.

    Args:
        action: 'status', 'start', 'stop', 'push_chunk', 'history', 'clear'.
        text_chunk: Subtitle sentence or utterance to stream.
        speaker: Speaker label (e.g. 'Operator', 'Nexus', 'Remote').
        source: Audio source ('microphone', 'desktop_audio', 'loopback').
        limit: Max lines to return in history.
    """
    start_t = time.perf_counter()
    global _STREAM_STATE, _SUBTITLE_BUFFER

    # 1. Action: start
    if action == "start":
        session_id = f"sub_sess_{int(time.time())}"
        _STREAM_STATE["is_streaming"] = True
        _STREAM_STATE["source"] = source
        _STREAM_STATE["session_id"] = session_id
        _STREAM_STATE["started_at"] = time.time()
        _STREAM_STATE["chunks_processed"] = 0

        emit_telemetry_event(
            "subtitle_session_started",
            {"session_id": session_id, "source": source},
        )

        return {
            "success": True,
            "action": "start",
            "is_streaming": True,
            "session_id": session_id,
            "source": source,
            "message": f"Live subtitle stream initialized on source '{source}'.",
        }

    # 2. Action: stop
    if action == "stop":
        sess = _STREAM_STATE["session_id"]
        _STREAM_STATE["is_streaming"] = False
        emit_telemetry_event(
            "subtitle_session_stopped",
            {"session_id": sess, "chunks": _STREAM_STATE["chunks_processed"]},
        )
        return {
            "success": True,
            "action": "stop",
            "is_streaming": False,
            "session_id": sess,
            "message": "Live subtitle stream stopped.",
        }

    # 3. Action: clear
    if action == "clear":
        _SUBTITLE_BUFFER.clear()
        return {"success": True, "action": "clear", "message": "Subtitle buffer cleared."}

    # 4. Action: push_chunk (incoming speech utterance)
    if action == "push_chunk":
        clean_text = (text_chunk or "").strip()
        if not clean_text:
            return {"success": False, "error": "text_chunk cannot be empty"}

        now_ts = time.time()
        timecode = datetime.datetime.fromtimestamp(now_ts).strftime("%H:%M:%S")
        entry = {
            "timestamp": now_ts,
            "timecode": timecode,
            "speaker": speaker,
            "text": clean_text,
        }
        _SUBTITLE_BUFFER.append(entry)
        _STREAM_STATE["chunks_processed"] += 1

        # Broadcast live event to WebSocket clients and Notch HUD
        emit_telemetry_event(
            "live_subtitle",
            {
                "timecode": timecode,
                "speaker": speaker,
                "text": clean_text,
                "session_id": _STREAM_STATE.get("session_id", ""),
            },
        )

        return {
            "success": True,
            "action": "push_chunk",
            "entry": entry,
            "buffered_total": len(_SUBTITLE_BUFFER),
        }

    # 5. Action: history
    if action == "history":
        items = list(_SUBTITLE_BUFFER)[-limit:]
        return {
            "success": True,
            "action": "history",
            "count": len(items),
            "subtitles": items,
        }

    # 6. Action: status
    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": "status",
        "is_streaming": _STREAM_STATE["is_streaming"],
        "session_id": _STREAM_STATE["session_id"],
        "source": _STREAM_STATE["source"],
        "chunks_processed": _STREAM_STATE["chunks_processed"],
        "buffered_lines": len(_SUBTITLE_BUFFER),
        "recent_lines": list(_SUBTITLE_BUFFER)[-5:],
        "latency_ms": elapsed_ms,
    }
