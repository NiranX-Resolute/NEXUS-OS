"""
Nexus execution engines — thin adapters that delegate to battle-tested open-source tools.

    shell   -> SHELL (built-in subprocess) / INTERPRETER (Open Interpreter, optional)
    ui      -> UI_INSPECT / UI_CLICK / UI_TYPE (Windows UI Automation tree via `uiautomation`)
               UFO_TASK (delegates to your Microsoft UFO checkout via a command template)
    browser -> BROWSER_TASK (Browser-Use, optional)
    android -> ADB_* (Android Debug Bridge: WSABuilds, emulator or USB phone)

Every engine is opt-in via config.user.json -> "engines". The daemon refuses any step whose
engine is disabled on THIS machine, regardless of what the cloud planner sent.
Missing libraries never crash the daemon; the step returns an install hint instead.
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import subprocess
import time
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

try:
    from .ai_client import DEFAULT_MODELS, ENGINE_FOR_ACTION
    from .skyvern_engine import run_skyvern_task, ui_visual_click
    from .device_manager import (
        BluetoothManager, VolumeController, WifiManager, DeviceInventory, BackgroundTaskManager,
        BrightnessController, SystemPerformanceMonitor, WindowManager, ClipboardManager
    )
    from .vision_engine import WindowsOCREngine, CameraManager, VisionAnalysisEngine, OnlineOCREngine, UniversalMediaReader
    from .file_manager import NexusFileManager
    from .communication import NexusCommunicationManager
    from .productivity import NexusProductivityManager
    from .site_generator import NexusSiteGenerator
except (ImportError, ValueError):
    from ai_client import DEFAULT_MODELS, ENGINE_FOR_ACTION
    from skyvern_engine import run_skyvern_task, ui_visual_click
    from device_manager import (
        BluetoothManager, VolumeController, WifiManager, DeviceInventory, BackgroundTaskManager,
        BrightnessController, SystemPerformanceMonitor, WindowManager, ClipboardManager
    )
    from vision_engine import WindowsOCREngine, CameraManager, VisionAnalysisEngine, OnlineOCREngine, UniversalMediaReader
    from file_manager import NexusFileManager
    from communication import NexusCommunicationManager
    from productivity import NexusProductivityManager
    from site_generator import NexusSiteGenerator

logger = logging.getLogger("NexusEngines")


class EngineDisabled(Exception):
    pass


def _fail(msg: str, **extra) -> Dict[str, Any]:
    return {"success": False, "error": msg, **extra}


def _tail(text: str, limit: int = 4000) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else "…" + text[-limit:]


# ------------------------------------------------------------------------------
# shell: Open Interpreter
# ------------------------------------------------------------------------------
def _litellm_model(ai: Dict[str, Any]) -> Dict[str, Any]:
    """Maps Nexus provider settings to LiteLLM-style settings used by Open Interpreter."""
    provider = (ai.get("provider") or "gemini").lower()
    model = ai.get("model") or DEFAULT_MODELS.get(provider, DEFAULT_MODELS["custom"])["model"]
    if provider == "gemini":
        return {"model": f"gemini/{model}", "api_key": ai.get("api_key")}
    if provider == "groq":
        return {"model": f"groq/{model}", "api_key": ai.get("api_key")}
    if provider == "openai":
        return {"model": model, "api_key": ai.get("api_key")}
    return {"model": f"openai/{model}", "api_key": ai.get("api_key") or "local", "api_base": ai.get("base_url")}


def run_interpreter(task: str, user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from interpreter import interpreter  # type: ignore
    except ImportError:
        return _fail("Open Interpreter is not installed.", hint="pip install open-interpreter")

    opts = user_cfg.get("engine_options", {})
    ai = user_cfg.get("ai", {})
    if not user_cfg.get("developer_mode") or not (ai.get("api_key") or ai.get("provider") == "custom"):
        return _fail("Open Interpreter needs its own LLM. Enable Developer Mode and set a provider/key "
                     "(or a local OpenAI-compatible server) with: python nexus_settings.py")
    if not opts.get("open_interpreter_auto_run"):
        return _fail("Open Interpreter auto_run is OFF, so it cannot execute code unattended. "
                     "Enable 'open_interpreter_auto_run' in nexus_settings.py if you accept that risk.")

    llm = _litellm_model(ai)
    interpreter.reset()
    interpreter.auto_run = True
    interpreter.llm.model = llm["model"]
    interpreter.llm.api_key = llm.get("api_key")
    if llm.get("api_base"):
        interpreter.llm.api_base = llm["api_base"]
        interpreter.offline = True
    logger.info(f"🧠 [Open Interpreter] {task[:80]}")
    messages = interpreter.chat(task, display=False, stream=False) or []
    final = [m.get("content", "") for m in messages if m.get("role") == "assistant" and m.get("type") == "message"]
    outputs = [m.get("content", "") for m in messages if m.get("type") == "console" and m.get("format") == "output"]
    return {"success": True, "message": _tail(final[-1] if final else ""), "console": _tail("\n".join(outputs), 2000)}


# ------------------------------------------------------------------------------
# ui: Windows UI Automation (the same accessibility tree Microsoft UFO reads)
# ------------------------------------------------------------------------------
def _uia():
    try:
        import uiautomation as auto  # type: ignore
        return auto
    except ImportError:
        return None


def _foreground_window(auto):
    ctrl = auto.GetForegroundControl()
    return ctrl.GetTopLevelControl() if ctrl else None


def ui_inspect(max_items: int = 150) -> Dict[str, Any]:
    auto = _uia()
    if not auto:
        return _fail("uiautomation is not installed.", hint="pip install uiautomation")
    win = _foreground_window(auto)
    if not win:
        return _fail("No foreground window")
    items = []

    def walk(ctrl, depth):
        if len(items) >= max_items or depth > 8:
            return
        for child in ctrl.GetChildren():
            if child.Name or child.AutomationId:
                items.append({"name": child.Name, "type": child.ControlTypeName, "automation_id": child.AutomationId})
            walk(child, depth + 1)

    walk(win, 0)
    return {"success": True, "window": win.Name, "controls": items, "truncated": len(items) >= max_items}


def _find_control(auto, win, name: str, control_type: Optional[str]):
    finder = getattr(win, f"{control_type}Control", None) if control_type else None
    finder = finder or win.Control
    for kwargs in ({"Name": name}, {"SubName": name}):
        ctrl = finder(searchDepth=12, **kwargs)
        if ctrl.Exists(2, 0.25):
            return ctrl
    return None


def ui_click(name: str, control_type: Optional[str] = None) -> Dict[str, Any]:
    auto = _uia()
    if not auto:
        return _fail("uiautomation is not installed.", hint="pip install uiautomation")
    win = _foreground_window(auto)
    ctrl = _find_control(auto, win, name, control_type) if win else None
    if not ctrl:
        return _fail(f"Control '{name}' not found in '{win.Name if win else '?'}'. Try UI_INSPECT first.")
    try:
        pattern = ctrl.GetInvokePattern()
        if pattern:
            pattern.Invoke()
        else:
            ctrl.Click(simulateMove=False)
    except Exception:
        ctrl.Click(simulateMove=False)
    return {"success": True, "message": f"Clicked {ctrl.ControlTypeName} '{ctrl.Name}'"}


def ui_type(name: str, text: str) -> Dict[str, Any]:
    auto = _uia()
    if not auto:
        return _fail("uiautomation is not installed.", hint="pip install uiautomation")
    win = _foreground_window(auto)
    ctrl = _find_control(auto, win, name, "Edit") or (_find_control(auto, win, name, None) if win else None)
    if not ctrl:
        return _fail(f"Edit control '{name}' not found")
    ctrl.SetFocus()
    try:
        ctrl.GetValuePattern().SetValue(text)
    except Exception:
        ctrl.SendKeys(text.replace("{", "{{}").replace("}", "{}}"), interval=0.01)
    return {"success": True, "message": f"Typed {len(text)} chars into '{ctrl.Name}'"}


def run_ufo(task: str, task_id: str, user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    opts = user_cfg.get("engine_options", {})
    template = (opts.get("ufo_command") or "").strip()
    if not template:
        return _fail("Microsoft UFO is not configured. Set 'ufo_command' and 'ufo_workdir' with: python nexus_settings.py",
                     hint="Clone https://github.com/microsoft/UFO, configure its config.yaml, then use the CLI form your version documents.")
    cmd = template.replace("{task_id}", f"nexus_{task_id[:8]}").replace("{request}", task.replace('"', "'"))
    logger.info(f"🪟 [UFO] {cmd}")
    try:
        proc = subprocess.run(cmd, shell=True, cwd=opts.get("ufo_workdir") or None,
                              capture_output=True, text=True, timeout=900)
        return {"success": proc.returncode == 0, "returncode": proc.returncode,
                "stdout": _tail(proc.stdout), "stderr": _tail(proc.stderr, 1500)}
    except subprocess.TimeoutExpired:
        return _fail("UFO task timed out after 15 minutes")


# ------------------------------------------------------------------------------
# browser: Browser-Use
# ------------------------------------------------------------------------------
def _browser_use_llm(ai: Dict[str, Any]):
    provider = (ai.get("provider") or "gemini").lower()
    model = ai.get("model") or DEFAULT_MODELS.get(provider, DEFAULT_MODELS["custom"])["model"]
    import browser_use  # type: ignore
    if provider == "gemini":
        return browser_use.ChatGoogle(model=model, api_key=ai.get("api_key"))
    if provider == "groq" and hasattr(browser_use, "ChatGroq"):
        return browser_use.ChatGroq(model=model, api_key=ai.get("api_key"))
    base = ai.get("base_url") or DEFAULT_MODELS.get(provider, DEFAULT_MODELS["custom"]).get("base_url")
    return browser_use.ChatOpenAI(model=model, api_key=ai.get("api_key") or "local", base_url=base)


def run_browser_task(task: str, user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    try:
        import browser_use  # type: ignore  # noqa: F401
    except ImportError:
        return _fail("Browser-Use is not installed.", hint="pip install browser-use && playwright install chromium")
    ai = user_cfg.get("ai", {})
    if not user_cfg.get("developer_mode") or not (ai.get("api_key") or ai.get("provider") == "custom"):
        return _fail("Browser-Use needs its own LLM. Enable Developer Mode and set a provider/key with: python nexus_settings.py")

    headless = bool(user_cfg.get("engine_options", {}).get("browser_headless"))

    async def _run():
        from browser_use import Agent  # type: ignore
        llm = _browser_use_llm(ai)
        kwargs: Dict[str, Any] = {"task": task, "llm": llm}
        try:
            from browser_use import BrowserProfile  # type: ignore
            kwargs["browser_profile"] = BrowserProfile(headless=headless)
        except ImportError:
            pass
        history = await Agent(**kwargs).run(max_steps=25)
        return history.final_result() if hasattr(history, "final_result") else str(history)

    logger.info(f"🌐 [Browser-Use] {task[:80]}")
    try:
        result = asyncio.run(_run())
        return {"success": True, "message": _tail(str(result or ""))}
    except Exception as e:  # noqa: BLE001
        return _fail(f"Browser-Use failed: {e}")


# ------------------------------------------------------------------------------
# android: ADB (WSABuilds / emulator / USB device)
# ------------------------------------------------------------------------------
_ADB_TEXT_SPECIAL = set("()<>|;&*\\~\"'$`")
_ADB_KEYS = {"HOME": 3, "BACK": 4, "ENTER": 66, "MENU": 82, "APP_SWITCH": 187, "POWER": 26, "VOLUME_UP": 24, "VOLUME_DOWN": 25}


def _adb(args, opts) -> Dict[str, Any]:
    adb = opts.get("adb_path") or "adb"
    if not (shutil.which(adb) or os.path.exists(adb)):
        return _fail("adb not found.", hint="Install Android platform-tools and add it to PATH, or set adb_path.")
    cmd = [adb] + (["-s", opts["adb_serial"]] if opts.get("adb_serial") else []) + [str(a) for a in args]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {"success": proc.returncode == 0, "returncode": proc.returncode,
                "stdout": _tail(proc.stdout, 2000), "stderr": _tail(proc.stderr, 1000)}
    except subprocess.TimeoutExpired:
        return _fail("adb command timed out")


def run_adb(action: str, step: Dict[str, Any], opts: Dict[str, Any]) -> Dict[str, Any]:
    if action == "ADB_TAP":
        return _adb(["shell", "input", "tap", int(step.get("x", 0)), int(step.get("y", 0))], opts)
    if action == "ADB_TEXT":
        text = "".join("\\" + c if c in _ADB_TEXT_SPECIAL else c for c in str(step.get("text", ""))).replace(" ", "%s")
        return _adb(["shell", "input", "text", text], opts)
    if action == "ADB_LAUNCH":
        pkg = str(step.get("package", "")).strip()
        if not pkg:
            return _fail("ADB_LAUNCH needs 'package'")
        if "/" in pkg:
            return _adb(["shell", "am", "start", "-n", pkg], opts)
        return _adb(["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"], opts)
    if action == "ADB_KEY":
        key = str(step.get("key", "HOME")).upper().replace("KEYCODE_", "")
        code = key if key.isdigit() else _ADB_KEYS.get(key, f"KEYCODE_{key}")
        return _adb(["shell", "input", "keyevent", code], opts)
    if action == "ADB_SHELL":
        return _adb(["shell", str(step.get("cmd", ""))], opts)
    return _fail(f"Unknown ADB action {action}")


# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# docs, media, devices, and headless execution definitions
# ------------------------------------------------------------------------------
DOC_ACTIONS = ("DOC_GENERATE", "DOC_EDIT", "PDF_GENERATE", "PDF_EDIT", "SHEET_GENERATE", "SLIDES_GENERATE", "WEBSITE_GENERATE", "WEBSITE_PREVIEW", "WEBSITE_EXPORT")
MEDIA_ACTIONS = ("MUSIC_GENERATE", "AUDIO_GENERATE", "VIDEO_GENERATE", "AUDIO_COMMAND", "IMAGE_GENERATE")
DEVICE_ACTIONS = (
    "BLUETOOTH_INFO", "BLUETOOTH_DEVICES", "BLUETOOTH_BATTERY",
    "VOLUME_GET", "VOLUME_SET", "VOLUME_MUTE", "VOLUME_UNMUTE",
    "VOLUME_STEP_UP", "VOLUME_STEP_DOWN",
    "WIFI_INFO", "WIFI_NETWORKS",
    "DEVICES_LIST", "DEVICE_INVENTORY", "BATTERY_INFO",
    "BRIGHTNESS_GET", "BRIGHTNESS_SET", "BRIGHTNESS_STEP_UP", "BRIGHTNESS_STEP_DOWN",
    "SYSTEM_PERFORMANCE", "SYSTEM_METRICS", "PROCESS_LIST", "PROCESS_KILL",
    "WINDOW_LIST", "WINDOW_ACTIVE", "WINDOW_FOCUS", "WINDOW_MINIMIZE", "WINDOW_MAXIMIZE", "WINDOW_CLOSE",
    "CLIPBOARD_GET", "CLIPBOARD_SET", "CLIPBOARD_CLEAR", "CLIPBOARD_HISTORY"
)
VISION_ACTIONS = (
    "OCR_SCREEN", "OCR_IMAGE", "SCREEN_READ",
    "ONLINE_OCR", "OCR_ONLINE", "OCR_URL",
    "MEDIA_READ", "READ_MEDIA", "PDF_READ", "PDF_OCR",
    "CAMERA_CAPTURE", "CAMERA_LIST", "VISION_ANALYZE", "VISION_QA", "SCREEN_ANALYZE"
)
FILE_ACTIONS = (
    "FILE_CREATE", "FILE_DELETE", "FILE_RENAME", "FILE_MOVE", "FILE_COPY",
    "FOLDER_ORGANIZE", "FILE_SEARCH", "FILE_ANALYZE"
)
COMMUNICATION_ACTIONS = (
    "WHATSAPP_SEND", "WHATSAPP_DRAFT",
    "CONTACT_ADD", "CONTACT_LIST", "CONTACT_GET", "CONTACT_DELETE"
)
PRODUCTIVITY_ACTIONS = (
    "NEWS_SEARCH", "NEWS_HEADLINES", "WEB_RESEARCH",
    "NOTE_CREATE", "NOTE_LIST", "NOTE_GET", "NOTE_DELETE",
    "TODO_ADD", "TODO_LIST", "TODO_TOGGLE", "TODO_DELETE", "REMINDER_SET"
)
HEADLESS_ACTIONS = (
    "BACKGROUND_TASK", "SILENT_EXEC", "HEADLESS_EXEC",
    "JOB_STATUS", "JOB_KILL", "JOB_LIST"
)

def run_device_action(action: str, step: Dict[str, Any]) -> Dict[str, Any]:
    """Handles deep hardware inspection: Bluetooth, volume, Wi-Fi, brightness, windows, system metrics, and clipboard."""
    if action in ("BLUETOOTH_INFO", "BLUETOOTH_DEVICES"):
        return BluetoothManager.get_all_devices()
    if action == "BLUETOOTH_BATTERY":
        return BluetoothManager.get_battery_details()
    if action == "VOLUME_GET":
        return VolumeController.get_volume()
    if action == "VOLUME_SET":
        val = step.get("level", step.get("volume", step.get("value", 50)))
        return VolumeController.set_volume(float(val))
    if action == "VOLUME_MUTE":
        return VolumeController.set_mute(True)
    if action == "VOLUME_UNMUTE":
        return VolumeController.set_mute(False)
    if action == "VOLUME_STEP_UP":
        return VolumeController.step_volume("up")
    if action == "VOLUME_STEP_DOWN":
        return VolumeController.step_volume("down")
    if action == "WIFI_INFO":
        return WifiManager.get_connected_wifi_info()
    if action == "WIFI_NETWORKS":
        return WifiManager.get_available_networks()
    if action in ("DEVICES_LIST", "DEVICE_INVENTORY", "BATTERY_INFO"):
        return DeviceInventory.get_all_devices_summary()
    if action == "BRIGHTNESS_GET":
        return BrightnessController.get_brightness()
    if action == "BRIGHTNESS_SET":
        val = step.get("level", step.get("brightness", step.get("value", 70)))
        return BrightnessController.set_brightness(float(val))
    if action == "BRIGHTNESS_STEP_UP":
        return BrightnessController.step_brightness("up")
    if action == "BRIGHTNESS_STEP_DOWN":
        return BrightnessController.step_brightness("down")
    if action in ("SYSTEM_PERFORMANCE", "SYSTEM_METRICS"):
        return SystemPerformanceMonitor.get_performance_metrics()
    if action == "PROCESS_LIST":
        limit = int(step.get("limit", 10))
        sort_by = str(step.get("sort_by", "cpu"))
        return SystemPerformanceMonitor.get_top_processes(limit=limit, sort_by=sort_by)
    if action == "PROCESS_KILL":
        target = step.get("target") or step.get("pid") or step.get("name")
        return SystemPerformanceMonitor.kill_process(target)
    if action == "WINDOW_LIST":
        return WindowManager.list_windows()
    if action == "WINDOW_ACTIVE":
        return WindowManager.get_active_window()
    if action == "WINDOW_FOCUS":
        title = str(step.get("title") or step.get("name") or step.get("window", ""))
        return WindowManager.focus_window(title)
    if action == "WINDOW_MINIMIZE":
        title = str(step.get("title") or step.get("name") or step.get("window", ""))
        return WindowManager.set_window_state(title, "minimize")
    if action == "WINDOW_MAXIMIZE":
        title = str(step.get("title") or step.get("name") or step.get("window", ""))
        return WindowManager.set_window_state(title, "maximize")
    if action == "WINDOW_CLOSE":
        title = str(step.get("title") or step.get("name") or step.get("window", ""))
        return WindowManager.set_window_state(title, "close")
    if action == "CLIPBOARD_GET":
        return ClipboardManager.get_clipboard()
    if action == "CLIPBOARD_SET":
        text = str(step.get("text") or step.get("content") or "")
        return ClipboardManager.set_clipboard(text)
    if action == "CLIPBOARD_CLEAR":
        return ClipboardManager.clear_clipboard()
    if action == "CLIPBOARD_HISTORY":
        limit = int(step.get("limit", 15))
        return ClipboardManager.get_history(limit=limit)
    return _fail(f"Unknown device action {action}")

def run_vision_action(action: str, step: Dict[str, Any], user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Handles OCR, camera capture, and multimodal vision analysis."""
    if action in ("OCR_SCREEN", "SCREEN_READ"):
        region = step.get("region")
        return WindowsOCREngine.ocr_screen(region=region)
    if action == "OCR_IMAGE":
        img_path = str(step.get("path") or step.get("image") or step.get("file", ""))
        return WindowsOCREngine.ocr_image_file(img_path)
    if action == "CAMERA_LIST":
        return CameraManager.list_cameras()
    if action == "CAMERA_CAPTURE":
        idx = int(step.get("index", 0))
        out_p = step.get("output_path")
        return CameraManager.capture_snapshot(camera_index=idx, output_path=out_p)
    if action in ("VISION_ANALYZE", "VISION_QA"):
        img_path = str(step.get("path") or step.get("image") or "")
        prompt = str(step.get("prompt") or step.get("question") or "Describe what you see in this image in detail.")
        return VisionAnalysisEngine.analyze_image(img_path, prompt=prompt, ai_cfg=user_cfg.get("ai"))
    if action == "SCREEN_ANALYZE":
        prompt = str(step.get("prompt") or step.get("question") or "Analyze active screen contents.")
        return VisionAnalysisEngine.analyze_active_screen(prompt=prompt)
    if action in ("ONLINE_OCR", "OCR_ONLINE"):
        target = str(step.get("path") or step.get("url") or step.get("image") or step.get("file", ""))
        prompt = step.get("prompt")
        return OnlineOCREngine.ocr_image_online(target, prompt=prompt, ai_cfg=user_cfg.get("ai"))
    if action == "OCR_URL":
        url = str(step.get("url") or step.get("path") or "")
        return OnlineOCREngine.ocr_url(url, ai_cfg=user_cfg.get("ai"))
    if action in ("MEDIA_READ", "READ_MEDIA"):
        target = str(step.get("target") or step.get("path") or step.get("file") or step.get("url", ""))
        prompt = str(step.get("prompt") or "")
        m_type = step.get("media_type")
        return UniversalMediaReader.read_media(target, prompt=prompt, media_type=m_type, ai_cfg=user_cfg.get("ai"))
    if action in ("PDF_READ", "PDF_OCR"):
        target = str(step.get("path") or step.get("file") or step.get("url", ""))
        prompt = str(step.get("prompt") or "")
        return UniversalMediaReader.read_pdf(target, prompt=prompt, ai_cfg=user_cfg.get("ai"))
    return _fail(f"Unknown vision action {action}")

def run_file_action(action: str, step: Dict[str, Any]) -> Dict[str, Any]:
    """Handles file CRUD, folder organization, smart search, and file telemetry."""
    if action == "FILE_CREATE":
        path = str(step.get("path") or step.get("file", ""))
        content = str(step.get("content", ""))
        return NexusFileManager.create_file(path, content)
    if action == "FILE_DELETE":
        path = str(step.get("path") or step.get("file", ""))
        safe = bool(step.get("safe", True))
        return NexusFileManager.delete_file(path, safe=safe)
    if action == "FILE_RENAME":
        path = str(step.get("path") or step.get("file", ""))
        new_name = str(step.get("new_name") or step.get("name", ""))
        return NexusFileManager.rename_file(path, new_name)
    if action == "FILE_MOVE":
        src = str(step.get("source") or step.get("src", ""))
        dst = str(step.get("destination") or step.get("dst", ""))
        return NexusFileManager.move_file(src, dst)
    if action == "FILE_COPY":
        src = str(step.get("source") or step.get("src", ""))
        dst = str(step.get("destination") or step.get("dst", ""))
        return NexusFileManager.copy_file(src, dst)
    if action == "FOLDER_ORGANIZE":
        dir_path = str(step.get("directory") or step.get("path") or step.get("folder", ""))
        dry_run = bool(step.get("dry_run", False))
        return NexusFileManager.organize_folder(dir_path, dry_run=dry_run)
    if action == "FILE_SEARCH":
        dir_path = str(step.get("directory") or step.get("path") or ".")
        query = str(step.get("query") or "*")
        ext = step.get("extension")
        limit = int(step.get("limit", 50))
        return NexusFileManager.search_files(dir_path, query=query, extension=ext, max_results=limit)
    if action == "FILE_ANALYZE":
        path = str(step.get("path") or step.get("file", ""))
        return NexusFileManager.analyze_file(path)
    return _fail(f"Unknown file action {action}")

def run_communication_action(action: str, step: Dict[str, Any]) -> Dict[str, Any]:
    """Handles address book and messaging actions."""
    if action == "WHATSAPP_SEND":
        rec = str(step.get("recipient") or step.get("phone") or step.get("contact", ""))
        msg = str(step.get("message") or step.get("text", ""))
        auto_open = bool(step.get("auto_open", True))
        return NexusCommunicationManager.send_whatsapp(rec, msg, auto_open=auto_open)
    if action == "WHATSAPP_DRAFT":
        topic = str(step.get("topic") or step.get("context", "project update"))
        tone = str(step.get("tone", "professional"))
        return NexusCommunicationManager.draft_smart_reply(topic, tone=tone)
    if action == "CONTACT_ADD":
        name = str(step.get("name", ""))
        phone = str(step.get("phone", ""))
        email = step.get("email")
        notes = step.get("notes")
        tags = step.get("tags")
        return NexusCommunicationManager.add_contact(name, phone, email, notes, tags)
    if action == "CONTACT_LIST":
        q = step.get("query")
        return NexusCommunicationManager.list_contacts(query=q)
    if action == "CONTACT_GET":
        target = str(step.get("name") or step.get("phone") or "")
        res = NexusCommunicationManager.get_contact(target)
        return {"success": True, "contact": res} if res else {"success": False, "error": f"Contact '{target}' not found"}
    if action == "CONTACT_DELETE":
        target = str(step.get("name") or step.get("phone") or "")
        return NexusCommunicationManager.delete_contact(target)
    return _fail(f"Unknown communication action {action}")

def run_productivity_action(action: str, step: Dict[str, Any]) -> Dict[str, Any]:
    """Handles free RSS news, web research, notes, todos, and reminders."""
    if action == "NEWS_HEADLINES":
        cat = str(step.get("category", "technology"))
        limit = int(step.get("limit", 10))
        return NexusProductivityManager.get_news(category=cat, limit=limit)
    if action == "NEWS_SEARCH":
        q = str(step.get("query") or step.get("topic", ""))
        limit = int(step.get("limit", 10))
        return NexusProductivityManager.search_news(q, limit=limit)
    if action == "WEB_RESEARCH":
        q = str(step.get("query") or step.get("topic", ""))
        return NexusProductivityManager.quick_search(q)
    if action == "NOTE_CREATE":
        title = str(step.get("title") or "Nexus Note")
        content = str(step.get("content") or step.get("text", ""))
        tags = step.get("tags")
        return NexusProductivityManager.create_note(title, content, tags)
    if action == "NOTE_LIST":
        return NexusProductivityManager.list_notes()
    if action == "NOTE_GET":
        title = str(step.get("title", ""))
        return NexusProductivityManager.get_note(title)
    if action == "NOTE_DELETE":
        title = str(step.get("title", ""))
        return NexusProductivityManager.delete_note(title)
    if action == "TODO_ADD":
        task = str(step.get("task") or step.get("title", ""))
        pri = str(step.get("priority", "normal"))
        due = step.get("due_date")
        return NexusProductivityManager.add_todo(task, priority=pri, due_date=due)
    if action == "TODO_LIST":
        status = str(step.get("status", "all"))
        return NexusProductivityManager.list_todos(status=status)
    if action == "TODO_TOGGLE":
        tid = str(step.get("id") or step.get("task", ""))
        return NexusProductivityManager.toggle_todo(tid)
    if action == "TODO_DELETE":
        tid = str(step.get("id") or step.get("task", ""))
        return NexusProductivityManager.delete_todo(tid)
    if action == "REMINDER_SET":
        msg = str(step.get("message") or step.get("reminder") or "Task Reminder")
        mins = float(step.get("in_minutes", step.get("minutes", 1.0)))
        speak = bool(step.get("speak", True))
        return NexusProductivityManager.set_reminder(msg, in_minutes=mins, speak=speak)
    return _fail(f"Unknown productivity action {action}")

def run_headless_action(action: str, step: Dict[str, Any]) -> Dict[str, Any]:
    """Handles background & silent headless execution without interrupting the user."""
    cmd = str(step.get("command") or step.get("cmd") or step.get("task", "")).strip()
    if action == "BACKGROUND_TASK":
        name = str(step.get("name") or "nexus_bg_job").strip()
        cwd = step.get("cwd")
        return BackgroundTaskManager.start_background_job(name, cmd, cwd=cwd)
    if action in ("SILENT_EXEC", "HEADLESS_EXEC"):
        cwd = step.get("cwd")
        timeout = float(step.get("timeout", 60.0))
        return BackgroundTaskManager.execute_silent_task(cmd, cwd=cwd, timeout=timeout)
    if action == "JOB_STATUS":
        return BackgroundTaskManager.get_job_status(str(step.get("job_id", "")))
    if action == "JOB_KILL":
        return BackgroundTaskManager.kill_job(str(step.get("job_id", "")))
    if action == "JOB_LIST":
        return BackgroundTaskManager.list_jobs()
    return _fail(f"Unknown headless action {action}")

def _get_ai_adapter(user_cfg: Dict[str, Any]):
    from ai_client import GeminiAdapter, GLOBAL_GEMINI_API_KEY
    ai = user_cfg.get("ai", {})
    key = ai.get("api_key") or GLOBAL_GEMINI_API_KEY
    return GeminiAdapter(api_key=key, model=ai.get("model") or "gemini-3.8-flash")


def _generate_pure_pdf(pdf_path: str, title: str, summary: str, content_text: str):
    """
    Pure Python standard-library PDF-1.4 writer.
    Generates a 100% valid, self-contained PDF without reportlab, pypdf, or external tools.
    """
    import re
    # Clean text to ASCII printable
    def clean(s):
        return re.sub(r"[^\x20-\x7E\n]", " ", str(s or ""))

    clean_title = clean(title)[:80]
    clean_summary = clean(summary)[:200]
    lines = [clean(l) for l in content_text.splitlines() if l.strip()][:60]

    # Build PDF stream
    stream_lines = [
        "BT",
        "/F1 20 Tf",
        "50 750 Td",
        f"({clean_title}) Tj",
        "/F1 10 Tf",
        "0 -25 Td",
        f"(Generated by Nexus AI Autonomous Document Architect) Tj",
        "0 -20 Td",
        f"(Summary: {clean_summary}) Tj",
        "0 -15 Td",
        "-------------------------------------------------------------------------------- Tj",
        "/F1 11 Tf",
        "0 -25 Td",
    ]
    for line in lines:
        safe_line = line.replace("(", "\\(").replace(")", "\\)")[:90]
        stream_lines.append(f"({safe_line}) Tj")
        stream_lines.append("0 -16 Td")
    stream_lines.append("ET")
    stream_data = "\n".join(stream_lines).encode("latin-1", errors="replace")

    objects = []
    # 1: Catalog
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    # 2: Pages
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    # 3: Page
    objects.append(b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>")
    # 4: Font
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    # 5: Stream
    objects.append(f"<< /Length {len(stream_data)} >>\nstream\n".encode() + stream_data + b"\nendstream")

    with open(pdf_path, "wb") as f:
        f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, obj in enumerate(objects, 1):
            offsets.append(f.tell())
            f.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
        xref_pos = f.tell()
        f.write(b"xref\n")
        f.write(f"0 {len(objects) + 1}\n".encode())
        f.write(b"0000000000 65535 f \n")
        for off in offsets:
            f.write(f"{off:010d} 00000 n \n".encode())
        f.write(b"trailer\n")
        f.write(f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n".encode())
        f.write(b"startxref\n")
        f.write(f"{xref_pos}\n%%EOF\n".encode())


def _synthesize_wav(wav_path: str, melody: List[Dict[str, Any]], tempo: int = 120):
    """
    Pure Python standard-library WAV synthesizer.
    Generates musical melodies and chords directly to a playable .wav audio file.
    """
    import math, wave, struct
    sample_rate = 44100
    total_duration = max(3.0, sum(float(n.get("duration", 0.4)) for n in melody) + 0.5)
    total_samples = int(sample_rate * min(total_duration, 30.0))
    buffer = [0.0] * total_samples

    current_sample = 0
    beat_sec = 60.0 / max(40, min(tempo, 240))

    for note in melody:
        freq = float(note.get("freq", 440.0))
        dur_sec = float(note.get("duration", beat_sec * 0.8))
        note_samples = int(sample_rate * dur_sec)

        for s in range(note_samples):
            idx = current_sample + s
            if idx >= total_samples:
                break
            t = s / sample_rate
            # Add harmonic overtones & envelope decay
            envelope = math.exp(-2.5 * (s / note_samples))
            sample_val = (
                0.7 * math.sin(2.0 * math.pi * freq * t) +
                0.25 * math.sin(4.0 * math.pi * freq * t) +
                0.1 * math.sin(6.0 * math.pi * freq * t)
            ) * envelope
            buffer[idx] += sample_val * 0.4
        current_sample += int(sample_rate * (dur_sec + 0.05))

    # Write WAV file
    with wave.open(wav_path, "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for sample in buffer:
            clamped = max(-1.0, min(1.0, sample))
            val = int(clamped * 32767.0)
            frames.extend(struct.pack("<h", val))
        wav.writeframes(frames)


def run_doc_action(action: str, step: Dict[str, Any], user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    import re
    if action == "WEBSITE_GENERATE":
        prompt = str(step.get("prompt") or step.get("task") or step.get("text") or "Modern responsive landing page").strip()
        title = step.get("title")
        style = str(step.get("style", "futuristic"))
        out_dir = step.get("output_dir")
        return NexusSiteGenerator.generate_website(prompt, title=title, style=style, output_dir=out_dir)
    if action == "WEBSITE_PREVIEW":
        p_dir = str(step.get("project_dir") or step.get("path") or ".")
        port = int(step.get("port", 8780))
        return NexusSiteGenerator.preview_website(p_dir, port=port)
    if action == "WEBSITE_EXPORT":
        p_dir = str(step.get("project_dir") or step.get("path") or ".")
        return NexusSiteGenerator.export_archive(p_dir)

    adapter = _get_ai_adapter(user_cfg)
    doc_type = "pdf"
    if action == "PDF_GENERATE": doc_type = "pdf"
    elif action == "SHEET_GENERATE": doc_type = "sheet"
    elif action == "SLIDES_GENERATE": doc_type = "presentation"
    else: doc_type = str(step.get("type") or "pdf").lower()

    title = str(step.get("title") or step.get("name") or "Nexus Document").strip()
    prompt = str(step.get("prompt") or step.get("task") or step.get("content") or step.get("text") or "Generate comprehensive document").strip()
    template = str(step.get("template") or "standard").strip()

    docs_dir = os.path.join(os.path.expanduser("~"), "Documents", "Nexus_Docs")
    os.makedirs(docs_dir, exist_ok=True)
    slug = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "_")[:50] or "doc"

    try:
        if action in ("DOC_EDIT", "PDF_EDIT"):
            instructions = str(step.get("instructions") or prompt).strip()
            content_in = str(step.get("content") or "").strip()
            doc = adapter.edit_document(doc_type=doc_type, instructions=instructions, content=content_in)
        else:
            doc = adapter.generate_document(doc_type=doc_type, title=title, prompt=prompt, template=template)
    except Exception as e:
        return _fail(f"Gemini document generation failed: {e}")

    saved_files = []
    html_content = doc.get("html") or f"<h1>{title}</h1><p>{doc.get('summary', '')}</p>"
    md_content = doc.get("markdown") or f"# {title}\n\n{doc.get('summary', '')}"

    # Always save HTML and Markdown
    html_path = os.path.join(docs_dir, f"{slug}.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)
    saved_files.append(html_path)

    md_path = os.path.join(docs_dir, f"{slug}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
    saved_files.append(md_path)

    primary_path = html_path

    # If sheet, generate CSV and Excel HTML format
    if doc_type in ("sheet", "table", "csv", "xlsx") or "columns" in (doc.get("data") or {}):
        data_obj = doc.get("data") or {}
        cols = data_obj.get("columns") or ["Item", "Description", "Value"]
        rows = data_obj.get("rows") or []
        csv_path = os.path.join(docs_dir, f"{slug}.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(",".join(f'"{c}"' for c in cols) + "\n")
            for r in rows:
                if isinstance(r, list):
                    f.write(",".join(f'"{c}"' for c in r) + "\n")
        saved_files.append(csv_path)
        primary_path = csv_path

    # If PDF, generate real standalone PDF
    if doc_type in ("pdf", "doc", "invoice", "report"):
        pdf_path = os.path.join(docs_dir, f"{slug}.pdf")
        try:
            _generate_pure_pdf(pdf_path, title, doc.get("summary", ""), md_content)
            saved_files.append(pdf_path)
            primary_path = pdf_path
        except Exception as pdf_err:
            logger.warning(f"Native PDF creation notice: {pdf_err}")

    # Launch file in default Windows viewer
    try:
        if os.name == "nt":
            os.startfile(primary_path)
    except Exception:
        pass

    return {
        "success": True,
        "action": action,
        "title": title,
        "type": doc_type,
        "primary_file": primary_path,
        "saved_files": saved_files,
        "summary": doc.get("summary", ""),
        "html_preview": html_content[:2000]
    }


def run_media_action(action: str, step: Dict[str, Any], user_cfg: Dict[str, Any]) -> Dict[str, Any]:
    import re
    adapter = _get_ai_adapter(user_cfg)
    media_dir = os.path.join(os.path.expanduser("~"), "Documents", "Nexus_Docs", "Media")
    os.makedirs(media_dir, exist_ok=True)

    if action in ("MUSIC_GENERATE", "AUDIO_GENERATE"):
        prompt = str(step.get("prompt") or step.get("task") or "Uplifting synth melody").strip()
        mood = str(step.get("mood") or "energetic").strip()
        genre = str(step.get("genre") or "synthwave").strip()
        tempo = int(step.get("tempo") or 120)

        try:
            music_data = adapter.generate_music(prompt=prompt, mood=mood, genre=genre, tempo=tempo)
        except Exception as e:
            return _fail(f"Gemini music generation failed: {e}")

        title = str(music_data.get("title") or "Nexus Track").strip()
        slug = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "_")[:50] or "track"
        wav_path = os.path.join(media_dir, f"{slug}.wav")
        json_path = os.path.join(media_dir, f"{slug}_score.json")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(music_data, f, indent=2)

        melody = music_data.get("melody") or [
            {"note": "C4", "freq": 261.63, "duration": 0.4},
            {"note": "E4", "freq": 329.63, "duration": 0.4},
            {"note": "G4", "freq": 392.00, "duration": 0.4},
            {"note": "B4", "freq": 493.88, "duration": 0.4},
            {"note": "C5", "freq": 523.25, "duration": 0.8},
        ]
        try:
            _synthesize_wav(wav_path, melody, tempo=tempo)
            if os.name == "nt":
                os.startfile(wav_path)
        except Exception as synth_err:
            logger.warning(f"WAV synthesis notice: {synth_err}")

        return {
            "success": True,
            "action": action,
            "title": title,
            "genre": genre,
            "tempo": tempo,
            "wav_file": wav_path,
            "score_file": json_path,
            "notes_count": len(melody)
        }

    elif action == "VIDEO_GENERATE":
        prompt = str(step.get("prompt") or step.get("task") or "Autonomous AI Agent Concept").strip()
        aspect = str(step.get("aspect_ratio") or "16:9").strip()
        style = str(step.get("style") or "cinematic").strip()

        try:
            vid = adapter.generate_video(prompt=prompt, aspect_ratio=aspect, style=style)
        except Exception as e:
            return _fail(f"Gemini video generation failed: {e}")

        title = str(vid.get("title") or "Nexus Video Concept").strip()
        slug = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "_")[:50] or "video"
        json_path = os.path.join(media_dir, f"{slug}_storyboard.json")
        html_player = os.path.join(media_dir, f"{slug}_player.html")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(vid, f, indent=2)

        # Generate animated player HTML
        player_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{title}</title>
<style>
body {{ margin:0; background:#020617; color:#fff; font-family:system-ui,sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }}
.card {{ background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px; max-width:800px; width:90%; }}
h1 {{ color:#38bdf8; margin-top:0; }}
.scene {{ background:#1e293b; border-radius:8px; padding:12px; margin-bottom:12px; border-left:4px solid #10b981; }}
.narration {{ font-style:italic; color:#94a3b8; }}
</style></head><body>
<div class="card">
  <h1>🎬 {title}</h1>
  <p><strong>Style:</strong> {style} | <strong>Aspect Ratio:</strong> {aspect}</p>
  <p>{vid.get('synopsis', '')}</p>
  <h2>Storyboard Scenes</h2>
  {"".join(f'<div class="scene"><h3>Scene {s.get("scene_num")}: {s.get("title")} ({s.get("duration_sec", 4)}s)</h3><p><strong>Visual:</strong> {s.get("visual_prompt")}</p><p class="narration">🗣️ Narration: "{s.get("narration")}"</p></div>' for s in vid.get("scenes", []))}
</div></body></html>"""

        with open(html_player, "w", encoding="utf-8") as f:
            f.write(player_html)

        if os.name == "nt":
            try: os.startfile(html_player)
            except Exception: pass

        return {
            "success": True,
            "action": action,
            "title": title,
            "storyboard_file": json_path,
            "player_file": html_player,
            "scenes_count": len(vid.get("scenes", []))
        }

    elif action == "IMAGE_GENERATE":
        prompt = str(step.get("prompt") or step.get("task") or step.get("text") or "Cyberpunk autonomous AI agent").strip()
        width = int(step.get("width", 1024))
        height = int(step.get("height", 1024))
        try:
            from ai_client import build_user_adapter
            adapter = build_user_adapter(user_cfg)
            if hasattr(adapter, "generate_image"):
                img_res = adapter.generate_image(prompt=prompt, width=width, height=height)
                if img_res.get("file_path") and os.name == "nt":
                    try:
                        os.startfile(img_res["file_path"])
                    except Exception:
                        pass
                return img_res
            return _fail("Configured AI provider does not support image generation")
        except Exception as e:
            return _fail(f"Image generation error: {e}")

    return _fail(f"Unknown media action {action}")


# Router
# ------------------------------------------------------------------------------
def is_engine_action(action: str) -> bool:
    return action in ENGINE_FOR_ACTION and action != "SHELL"


def run_engine_action(action: str, step: Dict[str, Any], user_cfg: Dict[str, Any], task_id: str = "") -> Dict[str, Any]:
    engine = ENGINE_FOR_ACTION.get(action)
    # Docs, Media, Device, Vision, File, Communication, and Productivity are enabled by default for autonomous operation
    if engine and engine not in ("docs", "media", "device", "vision", "file", "communication", "productivity") and not (user_cfg.get("engines") or {}).get(engine):
        raise EngineDisabled(f"Engine '{engine}' is disabled on this PC (enable it with: python nexus_settings.py)")

    if action in DEVICE_ACTIONS:
        return run_device_action(action, step)
    if action in VISION_ACTIONS:
        return run_vision_action(action, step, user_cfg)
    if action in FILE_ACTIONS:
        return run_file_action(action, step)
    if action in COMMUNICATION_ACTIONS:
        return run_communication_action(action, step)
    if action in PRODUCTIVITY_ACTIONS:
        return run_productivity_action(action, step)
    if action in HEADLESS_ACTIONS:
        return run_headless_action(action, step)
    if action in DOC_ACTIONS:
        return run_doc_action(action, step, user_cfg)
    if action in MEDIA_ACTIONS:
        return run_media_action(action, step, user_cfg)
    if action == "PUTER_CHAT":
        from ai_client import PuterAdapter
        prompt = str(step.get("prompt") or step.get("text") or "")
        return PuterAdapter().chat_completion([{"role": "user", "content": prompt}])
    if action == "INTERPRETER":
        return run_interpreter(str(step.get("task") or step.get("text") or ""), user_cfg)
    if action == "UI_INSPECT":
        return ui_inspect()
    if action == "UI_CLICK":
        return ui_click(str(step.get("name", "")), step.get("control_type"))
    if action == "UI_TYPE":
        return ui_type(str(step.get("name", "")), str(step.get("text", "")))
    if action == "UFO_TASK":
        return run_ufo(str(step.get("task", "")), task_id, user_cfg)
    if action == "BROWSER_TASK":
        return run_browser_task(str(step.get("task", "")), user_cfg)
    if action in ("SCREEN_USE", "SCREEN_TASK"):
        return run_skyvern_task(str(step.get("task") or step.get("goal") or step.get("text") or ""), user_cfg, step.get("url"))
    if action == "VISUAL_CLICK":
        return ui_visual_click(str(step.get("target") or step.get("name") or step.get("description") or step.get("text") or ""), user_cfg)
    if action.startswith("ADB_"):
        return run_adb(action, step, user_cfg.get("engine_options", {}))
    return _fail(f"No engine handles {action}")
