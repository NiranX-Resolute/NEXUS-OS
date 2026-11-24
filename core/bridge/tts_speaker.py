"""
Nexus Bridge - Local TTS Speaker Runner (Zero-Cost Audio Feedback)
=============================================================================
Provides asynchronous and synchronous speech synthesis without cloud GPU fees:
- Primary: Microsoft Edge-TTS neural models (edge_tts)
- Secondary: Windows PresentationCore MediaPlayer / SAPI
- Disturbance Rejection: Background noise does not halt speech.
- Interruption Handling: Halts speech only when user commands ("wait", "listen me", "stop").
=============================================================================
"""

import sys
import os
from typing import Optional, Dict, Any

# Add project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from bridge.tts_feedback import VoiceFeedbackEngine, speak_feedback, cancel_feedback
try:
    from bridge.voice_pipeline import VoicePipeline
    HAS_VOICE_PIPELINE = True
except ImportError:
    VoicePipeline = None
    HAS_VOICE_PIPELINE = False


class TTSSpeaker:
    """Wrapper class providing speech feedback methods for orchestrator & tools."""
    def __init__(self, default_voice: str = "en-US-AriaNeural"):
        self.engine = VoiceFeedbackEngine(voice_name=default_voice)
        self.pipeline = (
            VoicePipeline(voice=default_voice, require_keyword_interruption=True)
            if HAS_VOICE_PIPELINE and VoicePipeline
            else None
        )

    def speak(self, text: str, block: bool = False) -> bool:
        return self.engine.speak(text, block=block)

    def cancel(self):
        """Immediately stops speaking."""
        self.engine.cancel()
        if self.pipeline:
            self.pipeline.cancel_speech()

    def announce_task_start(self, goal: str) -> None:
        short_goal = goal[:40] if len(goal) > 40 else goal
        self.speak(f"Starting task: {short_goal}", block=False)

    def announce_task_complete(self, success: bool = True) -> None:
        status = "Task completed successfully." if success else "Task finished with warnings."
        self.speak(status, block=False)

    def respond_to_user(self, prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
        """Generates conversational AI response and speaks it smoothly."""
        if self.pipeline:
            return self.pipeline.speak_response_to_query(prompt, system_prompt=system_prompt)
        # Fallback
        reply = f"Understood: {prompt[:60]}."
        self.speak(reply, block=False)
        return {"success": True, "ai_response": reply, "interrupted": False}


_speaker_instance = TTSSpeaker()


def speak(text: str, block: bool = False) -> bool:
    return _speaker_instance.speak(text, block=block)

def cancel_speech():
    _speaker_instance.cancel()

def respond_and_speak(prompt: str, system_prompt: Optional[str] = None) -> Dict[str, Any]:
    return _speaker_instance.respond_to_user(prompt, system_prompt=system_prompt)


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Nexus AI Agent voice engine online."
    speak(msg, block=True)
