"""
Nexus Bridge Package
"""
import sys
from pathlib import Path

_core_dir = str(Path(__file__).resolve().parent.parent)
if _core_dir not in sys.path:
    sys.path.insert(0, _core_dir)

try:
    from .cloudflare_listener import CloudflareBridgeListener
except Exception:
    CloudflareBridgeListener = None

try:
    from .tts_feedback import VoiceFeedbackEngine, speak_feedback
except Exception:
    VoiceFeedbackEngine = None
    speak_feedback = None

__all__ = [
    "CloudflareBridgeListener",
    "VoiceFeedbackEngine",
    "speak_feedback",
]
