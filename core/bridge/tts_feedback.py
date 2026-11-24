"""
Nexus Bridge - Local Edge-TTS & Voice Feedback Engine
=============================================================================
Zero-Cost Spoken Voice Status Synthesizer.
Uses Microsoft Edge-TTS neural models without consuming paid cloud API tokens.
Gracefully falls back to Windows PresentationCore / SAPI or system players.
Completely eliminates wmplayer GUI popups and PlaySync MP3 errors.
=============================================================================
"""

import os
import sys
import time
import asyncio
import platform
import subprocess
import threading
from typing import Optional

IS_WINDOWS = platform.system() == "Windows"


class VoiceFeedbackEngine:
    def __init__(self, voice_name: str = "en-US-AriaNeural"):
        self.voice_name = voice_name
        self.temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache")
        os.makedirs(self.temp_dir, exist_ok=True)
        self._current_proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()

    def cancel(self):
        """Halts active audio playback immediately."""
        with self._lock:
            if self._current_proc and self._current_proc.poll() is None:
                try:
                    self._current_proc.terminate()
                except Exception:
                    pass
            self._current_proc = None

    def speak(self, text: str, block: bool = False) -> bool:
        """Speaks text using edge-tts with Windows SAPI / MediaPlayer fallback."""
        clean_text = text.strip()
        if not clean_text:
            return True

        # Stop prior playback
        self.cancel()

        # 1. Try edge-tts with Windows PresentationCore MediaPlayer
        try:
            import edge_tts
            out_file = os.path.join(self.temp_dir, f"speech_{int(time.time() * 1000)}.mp3")

            async def _synthesize():
                comm = edge_tts.Communicate(clean_text, self.voice_name)
                await comm.save(out_file)

            asyncio.run(_synthesize())

            if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                if IS_WINDOWS:
                    norm_path = os.path.abspath(out_file).replace("'", "''")
                    play_cmd = (
                        "powershell -NoProfile -NonInteractive -Command "
                        "\"Add-Type -AssemblyName presentationCore; "
                        f"$p = New-Object System.Windows.Media.MediaPlayer; "
                        f"$p.Open([System.Uri]'{norm_path}'); $p.Play(); "
                        "Start-Sleep -Milliseconds 400; "
                        "$w = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $w -lt 40) { Start-Sleep -Milliseconds 50; $w++ }; "
                        "if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Seconds ($p.NaturalDuration.TimeSpan.TotalSeconds + 0.3) }; "
                        "$p.Stop(); $p.Close();\""
                    )
                    timeout = max(30.0, len(clean_text) * 0.3)
                    if block:
                        subprocess.run(play_cmd, shell=True, capture_output=True, timeout=timeout)
                    else:
                        proc = subprocess.Popen(play_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        with self._lock:
                            self._current_proc = proc
                else:
                    cmd = ["ffplay", "-nodisp", "-autoexit", out_file]
                    if block:
                        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    else:
                        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        with self._lock:
                            self._current_proc = proc
                return True
        except Exception:
            pass

        # 2. Windows System SAPI fallback (clean, direct speech synthesis)
        if IS_WINDOWS:
            try:
                escaped = clean_text.replace('"', '`"').replace("'", "’")
                ps_sapi = (
                    "Add-Type -AssemblyName System.Speech; "
                    f"$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                    f"$synth.Rate = 1; "
                    f"$synth.Speak('{escaped}');"
                )
                cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_sapi]
                timeout = max(30.0, len(clean_text) * 0.3)
                if block:
                    subprocess.run(cmd, capture_output=True, timeout=timeout)
                else:
                    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    with self._lock:
                        self._current_proc = proc
                return True
            except Exception:
                pass

        # 3. Print fallback if audio output disabled
        print(f"[VOICE STATUS]: {clean_text}", flush=True)
        return True


_global_voice = VoiceFeedbackEngine()

def speak_feedback(text: str, block: bool = False) -> bool:
    return _global_voice.speak(text, block=block)

def cancel_feedback():
    _global_voice.cancel()
