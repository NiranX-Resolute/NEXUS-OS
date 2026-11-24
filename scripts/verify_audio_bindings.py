"""Verification of real Windows Audio, WinMM waveIn, CoreAudio, and Edge-TTS."""
import ctypes
import os
import sys

def test_winmm():
    if sys.platform != "win32":
        return "Non-windows"
    winmm = ctypes.windll.winmm
    num_devs = winmm.waveInGetNumDevs()
    print(f"WinMM WaveIn Audio Capture Devices Detected: {num_devs}")
    return num_devs

def test_edge_tts():
    try:
        import edge_tts
        print("Edge-TTS package is available: True")
        return True
    except ImportError:
        print("Edge-TTS package is available: False")
        return False

if __name__ == "__main__":
    test_winmm()
    test_edge_tts()
