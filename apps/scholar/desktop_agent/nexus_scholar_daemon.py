#!/usr/bin/env python3
"""
Nexus Scholar - Local Accessible Student Studio Daemon
=============================================================================
100% Free Tier: Zero Cloud Tokens for Execution.
Features:
1. Socratic Voice Tutor local synthesis via Microsoft Edge-TTS (No GPU, 0 cost).
2. Spaced Repetition Audio Quizzer (speaks Leitner front, pauses, speaks answer).
3. Diagram & Formula Audio Walkthrough Reader.
4. Direct interface to Cloudflare D1 Nexus Scholar API.
=============================================================================
"""

import os
import sys
import time
import json
import asyncio
import requests
from typing import Dict, Any, List

try:
    import edge_tts
    import pygame
    pygame.mixer.init()
except ImportError:
    edge_tts = None
    pygame = None

DEFAULT_SCHOLAR_API = os.getenv("NEXUS_SCHOLAR_API", "http://localhost:8793/api").rstrip("/")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


class NexusScholarAgent:
    def __init__(self, api_base: str = DEFAULT_SCHOLAR_API):
        self.api_base = api_base
        self.voice = "en-US-ChristopherNeural"  # Clear, encouraging Socratic professor voice

    async def speak(self, text: str):
        """Synthesize natural voice using free edge-tts."""
        print(f"\n[Nexus Scholar Tutor]: {text}")
        if not edge_tts:
            print("[Info] edge-tts not installed; text-only output.")
            return

        temp_audio = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_scholar_speech.mp3")
        try:
            communicate = edge_tts.Communicate(text, self.voice, rate="+2%")
            await communicate.save(temp_audio)

            if pygame:
                pygame.mixer.music.load(temp_audio)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    await asyncio.sleep(0.1)
                pygame.mixer.music.unload()
        except Exception as e:
            print(f"[TTS Error] {e}")

    def fetch_due_flashcards(self) -> List[Dict[str, Any]]:
        """Fetch Leitner cards due for review from Cloudflare D1 / local API."""
        url = f"{self.api_base}/flashcards"
        try:
            r = requests.get(url, timeout=5)
            if r.ok:
                return r.json().get("cards", [])
        except Exception as e:
            print(f"[API Error] Could not reach {url}: {e}")
        return []

    async def run_audio_study_session(self):
        """Conducts a hands-free audio study quiz session."""
        await self.speak("Welcome to your Nexus Scholar accessible study session.")
        cards = self.fetch_due_flashcards()
        if not cards:
            await self.speak("All flashcards are reviewed and up to date.")
            return

        await self.speak(f"You have {len(cards)} flashcards ready for Leitner spaced repetition. Let's begin.")
        for idx, card in enumerate(cards[:3], 1):
            q = card.get("question") or card.get("front") or "Review question"
            a = card.get("answer") or card.get("back") or "Answer"
            await self.speak(f"Card {idx}: {q}")
            print("--- Pondering time (4 seconds) ---")
            await asyncio.sleep(4)
            await self.speak(f"Answer: {a}")
            await asyncio.sleep(1)

        await self.speak("Review session completed. Outstanding focus!")


def main():
    print("=" * 70)
    print("  Nexus Scholar — Local Socratic Study Daemon")
    print(f"  Connected API: {DEFAULT_SCHOLAR_API}")
    print("=" * 70)
    agent = NexusScholarAgent()
    asyncio.run(agent.speak("Nexus Scholar local studio active. Ready for accessible learning."))
    asyncio.run(agent.run_audio_study_session())


if __name__ == "__main__":
    main()
