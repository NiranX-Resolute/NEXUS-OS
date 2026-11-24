"""
Modal Labs Cloud GPU AI Engine for Nexus AI Agent
App: nexus-whisper-t4
Hardware: NVIDIA T4 Cloud GPU (CUDA)
Credits: 100% Free Tier ($30/mo recurring credit, 1 TiB persistent storage)

Features:
- OpenAI Whisper GPU STT (faster-whisper large-v3-turbo, compute_type="float16")
- Scales to zero after 180s idle (auto-scales to $0/idle)
- Secured FastAPI/web endpoint POST /transcribe with Bearer token authentication
- Intelligent Action Decomposer (Translates intent into DESKTOP vs MOBILE action steps)
"""

import base64
import hmac
import io
import json
import os
import re
import tempfile
import traceback
from typing import Any, Dict, List, Optional

import modal

# ------------------------------------------------------------------------------
# 1. Container Image Definition (Debian + FFmpeg + CUDA + Whisper + PyTorch)
# ------------------------------------------------------------------------------
app = modal.App("nexus-whisper-t4")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "faster-whisper>=1.0.0",
        "fastapi[standard]>=0.115.0",
        "pydantic>=2.7.0",
        "python-multipart>=0.0.9",
        "torch>=2.0.0",
    )
)

try:
    secrets = [modal.Secret.from_name("nexus-secrets")]
except Exception:
    secrets = []

# ------------------------------------------------------------------------------
# 2. Nexus Whisper T4 GPU Engine Class
# ------------------------------------------------------------------------------
@app.cls(
    image=image,
    gpu="T4",
    scaledown_window=180,  # Auto-scales to $0/idle after 3 minutes
    timeout=300,
    secrets=secrets,
)
class NexusWhisperT4:
    @modal.enter()
    def initialize(self):
        """Pre-load faster-whisper model (large-v3-turbo) on NVIDIA T4 GPU."""
        from faster_whisper import WhisperModel
        import torch

        device = "cuda" if (hasattr(torch, "cuda") and torch.cuda.is_available()) else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        print(f"[Nexus Whisper T4] Loading faster-whisper (large-v3-turbo) on {device} ({compute_type})...")
        self.whisper_model = WhisperModel(
            "large-v3-turbo",
            device=device,
            compute_type=compute_type,
            cpu_threads=4,
        )
        print("[Nexus Whisper T4] Model ready for accelerated GPU inference.")

    def transcribe_audio_file(self, file_path: str, language: Optional[str] = None) -> dict:
        """Runs faster-whisper transcription on GPU."""
        lang_param = None if (not language or language == "auto") else language
        segments, info = self.whisper_model.transcribe(
            file_path,
            beam_size=5,
            language=lang_param,
        )
        seg_list = []
        text_parts = []
        for s in segments:
            t = s.text.strip()
            if t:
                text_parts.append(t)
                seg_list.append({
                    "start": round(s.start, 2),
                    "end": round(s.end, 2),
                    "text": t,
                })
        full_text = " ".join(text_parts).strip()
        duration_sec = round(info.duration, 2) if (info and hasattr(info, "duration")) else 0.0
        detected_lang = info.language if (info and hasattr(info, "language")) else (language or "en")
        return {
            "text": full_text,
            "language": detected_lang,
            "duration_sec": duration_sec,
            "segments": seg_list,
            "engine": "modal_t4_whisper",
        }

    def decompose_action(self, prompt: str, context: Optional[dict] = None) -> dict:
        """
        Decomposes natural language instructions into structured multi-device steps.
        Automatically classifies target as DESKTOP or MOBILE based on intent.
        """
        prompt_clean = prompt.strip()
        lower = prompt_clean.lower()
        context = context or {}
        requested_target = (context.get("target_device") or "").upper()

        steps: List[Dict[str, Any]] = []
        target = "DESKTOP"

        # A. Detect Mobile Intent (Termux / Phone automation)
        is_mobile_intent = any(kw in lower for kw in [
            "phone", "mobile", "vibrate", "battery status", "battery level",
            "clipboard on phone", "termux", "android", "sms", "torch", "flashlight"
        ])

        if is_mobile_intent or requested_target == "MOBILE":
            target = "MOBILE"
            if "vibrate" in lower:
                steps.append({"action": "VIBRATE", "duration_ms": 500})
                steps.append({"action": "TOAST", "text": "Nexus Vibrate Triggered"})
            elif "battery" in lower:
                steps.append({"action": "BATTERY_CHECK"})
            elif "clipboard" in lower:
                steps.append({"action": "CLIPBOARD_GET"})
            elif "notify" in lower or "notification" in lower:
                title = "Nexus Mobile Alert"
                content = re.sub(r".*(notify|notification)\s*(with|about)?\s*", "", prompt_clean, flags=re.IGNORECASE).strip() or "Task notification"
                steps.append({"action": "NOTIFICATION", "title": title, "content": content})
            elif "torch" in lower or "flashlight" in lower:
                state = "off" if "off" in lower else "on"
                steps.append({"action": "TORCH", "state": state})
            else:
                steps.append({"action": "SHELL", "cmd": f"termux-toast '{prompt_clean}'"})
                steps.append({"action": "NOTIFICATION", "title": "Nexus Mobile", "content": prompt_clean})

        # B. Detect Desktop Intent (PC / OS automation)
        else:
            target = "DESKTOP"
            if "code" in lower or "vs code" in lower or "vscode" in lower:
                steps.append({"action": "SHELL", "cmd": "code ."})
                steps.append({"action": "KEYPRESS", "keys": ["ctrl", "shift", "p"]})
                steps.append({"action": "SPEAK", "text": "VS Code launched and ready"})
            elif "git" in lower:
                cmd = "git status"
                if "pull" in lower: cmd = "git pull"
                elif "push" in lower: cmd = "git push"
                elif "log" in lower: cmd = "git log -n 5 --oneline"
                elif "branch" in lower: cmd = "git branch"
                steps.append({"action": "SHELL", "cmd": cmd})
                steps.append({"action": "SPEAK", "text": f"Ran {cmd}"})
            elif lower.startswith("run ") or lower.startswith("exec ") or "terminal" in lower:
                cmd = re.sub(r"^(run|exec|execute|terminal command)\s+", "", prompt_clean, flags=re.IGNORECASE).strip()
                steps.append({"action": "SHELL", "cmd": cmd})
                steps.append({"action": "SPEAK", "text": f"Executed command: {cmd[:25]}"})
            elif "press " in lower or "hotkey" in lower or "shortcut" in lower or "ctrl" in lower or "alt" in lower:
                if "ctrl" in lower and "shift" in lower and "p" in lower:
                    keys = ["ctrl", "shift", "p"]
                elif "ctrl" in lower and "c" in lower:
                    keys = ["ctrl", "c"]
                elif "ctrl" in lower and "v" in lower:
                    keys = ["ctrl", "v"]
                elif "alt" in lower and "tab" in lower:
                    keys = ["alt", "tab"]
                elif "win" in lower and "r" in lower:
                    keys = ["win", "r"]
                else:
                    keys = re.findall(r"\b(ctrl|alt|shift|win|enter|tab|esc|space|[a-z0-9])\b", lower) or ["enter"]
                steps.append({"action": "KEYPRESS", "keys": keys})
                steps.append({"action": "SPEAK", "text": f"Triggered {'+'.join(keys)}"})
            elif "screenshot" in lower or "capture screen" in lower:
                steps.append({"action": "SCREENSHOT", "filename": "desktop_screen.png"})
                steps.append({"action": "SPEAK", "text": "Captured desktop screenshot"})
            else:
                steps.append({"action": "SHELL", "cmd": f"echo '{prompt_clean}'"})
                steps.append({"action": "SPEAK", "text": f"Processed: {prompt_clean[:30]}"})

        return {
            "target": target,
            "prompt": prompt_clean,
            "steps": steps,
            "metadata": {
                "planner": "NexusWhisperT4",
                "steps_count": len(steps),
                "device_target": target,
            }
        }

    # --------------------------------------------------------------------------
    # 3. FastAPI Web Application Definition (@modal.asgi_app)
    # --------------------------------------------------------------------------
    @modal.asgi_app()
    def fastapi_app(self):
        from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel

        web_app = FastAPI(
            title="Nexus Whisper T4 Microservice",
            description="GPU-Accelerated Whisper STT & Action Decomposer",
            version="3.0.0",
        )

        web_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        class DecomposeRequest(BaseModel):
            prompt: str
            context: Optional[Dict[str, Any]] = None

        @web_app.get("/health")
        def health():
            return {
                "status": "ok",
                "gpu": "T4",
            }

        @web_app.post("/transcribe")
        async def transcribe_endpoint(
            request: Request,
            file: Optional[UploadFile] = File(None),
            language: Optional[str] = Form(None),
        ):
            """Accepts multipart audio or JSON with base64 audio and runs Whisper on T4 GPU."""
            auth_header = request.headers.get("authorization", "")
            token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
            expected_token = os.environ.get("NEXUS_TOKEN", "")
            if expected_token:
                if not token or not hmac.compare_digest(token, expected_token):
                    raise HTTPException(status_code=401, detail="Unauthorized: Invalid Bearer token")

            content_type = request.headers.get("content-type", "")
            temp_file = None
            target_lang = language

            try:
                if file is not None:
                    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                    content = await file.read()
                    temp_file.write(content)
                    temp_file.flush()
                    temp_file.close()

                elif "application/json" in content_type:
                    body_bytes = await request.body()
                    json_data = json.loads(body_bytes.decode("utf-8"))
                    audio_b64 = json_data.get("audio_base64", "")
                    if not audio_b64:
                        raise HTTPException(status_code=400, detail="Missing audio_base64 in JSON body")
                    if "," in audio_b64:
                        audio_b64 = audio_b64.split(",", 1)[1]
                    raw_audio = base64.b64decode(audio_b64)
                    fmt = json_data.get("format", "wav")
                    if not target_lang:
                        target_lang = json_data.get("language")
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{fmt}")
                    temp_file.write(raw_audio)
                    temp_file.flush()
                    temp_file.close()

                elif "audio/" in content_type or "application/octet-stream" in content_type:
                    body_bytes = await request.body()
                    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
                    temp_file.write(body_bytes)
                    temp_file.flush()
                    temp_file.close()

                else:
                    raise HTTPException(
                        status_code=400,
                        detail="Unsupported Content-Type. Expected multipart/form-data or application/json",
                    )

                result = self.transcribe_audio_file(temp_file.name, language=target_lang)
                return result

            except HTTPException:
                raise
            except Exception as e:
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")
            finally:
                if temp_file and os.path.exists(temp_file.name):
                    try:
                        os.remove(temp_file.name)
                    except Exception:
                        pass

        @web_app.post("/decompose_action")
        async def decompose_endpoint(req: DecomposeRequest):
            """Translates natural language prompt into target device steps (DESKTOP vs MOBILE)."""
            if not req.prompt.strip():
                raise HTTPException(status_code=400, detail="Prompt cannot be empty")

            try:
                plan = self.decompose_action(req.prompt, req.context)
                return plan
            except Exception as e:
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"Decomposition error: {str(e)}")

        return web_app

# Backward-compatibility alias
NexusAiCore = NexusWhisperT4

# ------------------------------------------------------------------------------
# 4. CLI Verification Entrypoint
# ------------------------------------------------------------------------------
@app.local_entrypoint()
def main():
    print("Nexus Whisper T4 App defined. Deploy with: modal deploy core/backend/modal_ai.py")
