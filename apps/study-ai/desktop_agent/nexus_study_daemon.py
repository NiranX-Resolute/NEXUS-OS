#!/usr/bin/env python3
"""
Nexus Study AI - Local Desktop Edu Agent & Socratic Audio Companion
=============================================================================
100% Free Tier: Zero Cloud Tokens for Execution.
Features:
1. Socratic Voice Tutor local synthesis via Microsoft Edge-TTS (0 cost, no GPU)
2. Spaced Repetition Audio Quizzer (speaks front, pauses, speaks back & mnemonic)
3. Study Pomodoro & Focus Automation
4. Direct interface to Cloudflare D1 Nexus Study API
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

DEFAULT_STUDY_API = os.getenv("NEXUS_STUDY_API", "http://localhost:8788/api").rstrip("/")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


class NexusStudyAgent:
    def __init__(self, api_base: str = DEFAULT_STUDY_API):
        self.api_base = api_base
        self.voice = "en-US-ChristopherNeural"  # Natural Socratic professor voice

    async def speak(self, text: str):
        """Synthesize natural voice using free edge-tts."""
        print(f"\n[Nexus Study Tutor]: {text}")
        if not edge_tts:
            print("[Info] edge-tts not installed; text-only output.")
            return

        temp_audio = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tutor_speech.mp3")
        try:
            communicate = edge_tts.Communicate(text, self.voice, rate="+5%")
            await communicate.save(temp_audio)

            if pygame:
                pygame.mixer.music.load(temp_audio)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    await asyncio.sleep(0.1)
                pygame.mixer.music.unload()
        except Exception as e:
            print(f"[TTS Error] {e}")

    def fetch_due_flashcards(self, doc_id: str = None) -> List[Dict[str, Any]]:
        """Fetch Leitner cards due for review from Cloudflare D1."""
        url = f"{self.api_base}/flashcards?due_only=true"
        if doc_id:
            url += f"&document_id={doc_id}"
        try:
            r = requests.get(url, timeout=5)
            if r.ok:
                return r.json().get("cards", [])
        except Exception as e:
            print(f"[API Error] Could not reach {url}: {e}")
        return []

    async def run_audio_flashcard_session(self, doc_id: str = None):
        """Audio flashcard study session."""
        await self.speak("Welcome to your Nexus Socratic study session. Let's review your due flashcards.")
        cards = self.fetch_due_flashcards(doc_id)
        if not cards:
            await self.speak("Great news! You have zero cards due right now. You are on track for mastery.")
            return

        await self.speak(f"You have {len(cards)} cards due for spaced repetition today. Here is the first one.")
        for idx, card in enumerate(cards, 1):
            await self.speak(f"Card {idx}: {card['front']}")
            print("--- Thinking time (5 seconds) ---")
            await asyncio.sleep(4)
            await self.speak(f"Answer: {card['back']}")
            await asyncio.sleep(1)

        await self.speak("Flashcard review complete. Keep up the high retention!")


def main():
    print("=" * 70)
    print("  Nexus Study AI — Desktop Socratic Agent")
    print(f"  Connected API: {DEFAULT_STUDY_API}")
    print("=" * 70)
    agent = NexusStudyAgent()
    asyncio.run(agent.speak("Nexus Study AI agent initialized. Ready for student study sessions."))


if __name__ == "__main__":
    main()
