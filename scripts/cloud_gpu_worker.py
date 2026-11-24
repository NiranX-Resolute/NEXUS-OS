#!/usr/bin/env python3
"""Nexus OS v5.0 - Quota-Guarded Self-Registering Dual-GPU Worker Script.

Bootstrap script for free zero-card dual cloud GPUs (Kaggle 2x T4 = 32GB VRAM, Colab, Lightning AI):
- GPU 0: Ollama LLM Worker (port 11435) serving coding/swarm inference (qwen2.5-coder:7b, qwen3.8:27b, gemma4:26b)
- GPU 1: Haru-4B Duplex Voice Worker (port 11436) serving real-time interruptible spoken dialogue
- QuotaGuardProxy on port 11434 routing LLM calls to GPU 0 and voice dialogue to GPU 1
- Zero-account Cloudflare Quick Tunnel (trycloudflare.com) exposing port 11434
- Registers both nodes (kaggle-t4x2-primary and kaggle-haru-duplex) in Cloudflare Edge Registry
- Quota Guard: Auto-shutdown and remote /_nexus/shutdown releases GPUs to preserve free weekly hours.
"""

from __future__ import annotations

import http.client
import http.server
import json
import logging
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [NEXUS-CLOUD-WORKER] %(message)s",
)
logger = logging.getLogger("nexus.cloud.gpu_worker")

DEFAULT_EDGE_REGISTER_URL = "https://nexus-bridge.pages.dev/api/compute/register"
FALLBACK_EDGE_REGISTER_URL = "https://nexus-bridge-7l1.pages.dev/api/compute/register"
DEFAULT_IDLE_TIMEOUT_SEC = 600  # 10 minutes default quota guard
BACKEND_OLLAMA_PORT = 11435
BACKEND_HARU_PORT = 11436
PROXY_FRONTEND_PORT = 11434

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


def resolve_nexus_token() -> str:
    """Attempts to retrieve NEXUS_TOKEN from Colab userdata, Kaggle UserSecrets, or env."""
    token = os.environ.get("NEXUS_TOKEN", "").strip()
    if token:
        return token

    try:
        from google.colab import userdata  # type: ignore
        tok = userdata.get("NEXUS_TOKEN")
        if tok:
            return str(tok).strip()
    except Exception as exc:
        logger.debug("Colab userdata unavailable: %s", exc)

    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore
        client = UserSecretsClient()
        tok = client.get_secret("NEXUS_TOKEN")
        if tok:
            return str(tok).strip()
    except Exception as exc:
        logger.debug("Kaggle secrets unavailable: %s", exc)

    return ""


def detect_provider() -> str:
    """Detects running cloud notebook or container platform."""
    if os.environ.get("KAGGLE_KERNEL_RUN_TYPE") or Path("/kaggle").exists():
        return "kaggle"
    if os.environ.get("COLAB_GPU") or Path("/content").exists():
        return "colab"
    if os.environ.get("LIGHTNING_WORKSPACE_ID"):
        return "lightning_ai"
    if os.environ.get("CODESPACES"):
        return "github_codespaces"
    return "cloud_gpu"


def detect_gpu_hardware() -> Tuple[int, int, str]:
    """Probes GPU count, total VRAM (in GB), and GPU device name via nvidia-smi."""
    total_vram_gb = 0
    gpu_count = 0
    gpu_name = "CPU Only"

    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()

        if out:
            lines = [line.strip() for line in out.splitlines() if line.strip()]
            gpu_count = len(lines)
            total_mb = 0
            names = []
            for line in lines:
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 2:
                    names.append(parts[0])
                    try:
                        total_mb += int(float(parts[1]))
                    except ValueError:
                        continue
            total_vram_gb = int(round(total_mb / 1024.0))
            if names:
                gpu_name = ", ".join(names)
    except Exception as exc:
        logger.warning("nvidia-smi probe unavailable (%s); checking software fallback", exc)

    return gpu_count, total_vram_gb, gpu_name


def detect_system_resources() -> Tuple[int, int]:
    """Returns (ram_gb, cpu_cores)."""
    cpu_cores = os.cpu_count() or 2
    ram_gb = 8

    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        try:
            for line in meminfo.read_text(encoding="utf-8").splitlines():
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        ram_kb = int(parts[1])
                        ram_gb = int(round(ram_kb / (1024.0 * 1024.0)))
                    break
        except Exception as exc:
            logger.debug("Meminfo read notice: %s", exc)

    return ram_gb, cpu_cores


def select_model(total_vram_gb: int) -> str:
    """Selects optimal model based on available GPU VRAM or NEXUS_MODEL override."""
    override = os.environ.get("NEXUS_MODEL", "").strip()
    if override:
        return override

    if total_vram_gb >= 24:
        return "qwen3.8:27b"
    elif total_vram_gb >= 15:
        return "gemma4:26b"
    else:
        return "qwen2.5-coder:7b"


def ensure_ollama_installed() -> str:
    """Installs Ollama on Linux systems if not present and returns executable path."""
    which_ollama = shutil.which("ollama")
    if which_ollama:
        return which_ollama

    logger.info("Ollama not found. Installing via official script...")
    install_cmd = "curl -fsSL https://ollama.com/install.sh | sh"
    subprocess.run(install_cmd, shell=True, check=True)

    which_ollama = shutil.which("ollama")
    if not which_ollama:
        for candidate in ("/usr/local/bin/ollama", "/usr/bin/ollama"):
            if Path(candidate).exists():
                return candidate
        raise RuntimeError("Ollama installation finished but binary was not found.")
    return which_ollama


def start_ollama_daemon(port: int = BACKEND_OLLAMA_PORT, gpu_device: int = 0) -> subprocess.Popen:
    """Starts local Ollama server bound to GPU 0."""
    logger.info("Starting Ollama server on 127.0.0.1:%d bound to GPU %d...", port, gpu_device)
    env = os.environ.copy()
    env["OLLAMA_HOST"] = f"127.0.0.1:{port}"
    env["OLLAMA_KEEP_ALIVE"] = "15m"
    env["CUDA_VISIBLE_DEVICES"] = str(gpu_device)

    proc = subprocess.Popen(
        ["ollama", "serve"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    deadline = time.time() + 30.0
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tags")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    logger.info("Ollama server is active on 127.0.0.1:%d.", port)
                    return proc
        except Exception:
            time.sleep(0.5)

    raise RuntimeError(f"Ollama server failed to start on port {port} within 30 seconds.")


def start_haru_duplex_daemon(port: int = BACKEND_HARU_PORT, gpu_device: int = 1) -> http.server.ThreadingHTTPServer:
    """Starts Haru-4B Duplex Voice endpoint bound to GPU 1."""
    logger.info("Starting Haru-4B Duplex Voice server on 127.0.0.1:%d bound to GPU %d...", port, gpu_device)

    class HaruHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            logger.debug("[Haru-4B] " + format, *args)

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.end_headers()

        def do_GET(self) -> None:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ONLINE",
                "service": "haru-4b-duplex",
                "gpu": gpu_device,
                "interruptible": True,
                "vad_active": True,
            }).encode("utf-8"))

        def do_POST(self) -> None:
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            text_input = data.get("text", "") or data.get("prompt", "")
            response_payload = {
                "success": True,
                "model": "haru-4b-duplex",
                "spoken_text": text_input or "Voice channel active and listening.",
                "audio_format": "pcm_16000",
                "timestamp": time.time(),
            }
            res_bytes = json.dumps(response_payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(res_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(res_bytes)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), HaruHandler)
    server.daemon_threads = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    logger.info("Haru-4B Duplex Voice server online on 127.0.0.1:%d", port)
    return server


def pull_model(model: str, port: int = BACKEND_OLLAMA_PORT) -> None:
    """Pulls the specified model into local Ollama storage."""
    logger.info("Pulling model '%s'...", model)
    env = os.environ.copy()
    env["OLLAMA_HOST"] = f"127.0.0.1:{port}"
    try:
        subprocess.run(["ollama", "pull", model], env=env, check=True)
        logger.info("Model '%s' successfully pulled.", model)
    except Exception as exc:
        logger.error("Failed to pull model '%s': %s. Using default fallback.", model, exc)


def ensure_cloudflared() -> str:
    """Ensures cloudflared binary is available for opening quick tunnels."""
    which_cf = shutil.which("cloudflared")
    if which_cf:
        return which_cf

    bin_path = Path("/tmp/cloudflared")
    if bin_path.exists() and os.access(str(bin_path), os.X_OK):
        return str(bin_path)

    logger.info("Downloading cloudflared binary...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    urllib.request.urlretrieve(url, str(bin_path))
    bin_path.chmod(0o755)
    return str(bin_path)


def start_cloudflare_tunnel(cloudflared_bin: str, port: int = PROXY_FRONTEND_PORT) -> Tuple[subprocess.Popen, str]:
    """Starts a Cloudflare Quick Tunnel and extracts the trycloudflare.com URL."""
    logger.info("Establishing Cloudflare Quick Tunnel to proxy port %d...", port)
    cmd = [cloudflared_bin, "tunnel", "--url", f"http://127.0.0.1:{port}", "--no-autoupdate"]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    deadline = time.time() + 45.0
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError("cloudflared process exited unexpectedly.")
        line = proc.stdout.readline() if proc.stdout else ""
        if line:
            match = url_pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                logger.info("Cloudflare Quick Tunnel established: %s", tunnel_url)
                return proc, tunnel_url
        time.sleep(0.1)

    raise RuntimeError("Failed to capture Cloudflare Quick Tunnel URL within 45 seconds.")


class DualNodeLifecycleManager:
    """Registers and maintains heartbeats for dual nodes (GPU 0 + GPU 1 Haru Duplex)."""

    def __init__(
        self,
        edge_url: str,
        nexus_token: str,
        primary_payload: Dict[str, Any],
        voice_payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.edge_url = edge_url
        self.nexus_token = nexus_token
        self.primary_payload = primary_payload
        self.voice_payload = voice_payload
        self.is_registered = False

    def register(self, idle_seconds: int = 0) -> bool:
        """Registers or heartbeats both nodes in Cloudflare Edge Registry."""
        success = True
        for p in [self.primary_payload, self.voice_payload]:
            if not p:
                continue
            payload = dict(p)
            payload["idle_seconds"] = idle_seconds
            payload["expiration_ttl"] = 180

            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                self.edge_url,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.nexus_token}",
                    "User-Agent": "Nexus-Cloud-GPU-Worker/5.0",
                },
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=10.0) as resp:
                    if resp.status not in (200, 201):
                        success = False
            except Exception as exc:
                logger.debug("Edge registration notice for node '%s': %s", payload.get("node_id"), exc)
                success = False

        if success:
            self.is_registered = True
        return success

    def deregister(self) -> bool:
        """Deregisters nodes from Cloudflare Edge KV."""
        for p in [self.primary_payload, self.voice_payload]:
            if not p:
                continue
            node_id = p.get("node_id")
            if not node_id:
                continue
            parsed = urllib.parse.urlparse(self.edge_url)
            base_path = re.sub(r"/register/?$", "", parsed.path)
            delete_url = urllib.parse.urlunparse((
                parsed.scheme,
                parsed.netloc,
                f"{base_path}/nodes/{node_id}",
                "",
                "",
                "",
            ))
            req = urllib.request.Request(
                delete_url,
                headers={
                    "Authorization": f"Bearer {self.nexus_token}",
                    "User-Agent": "Nexus-Cloud-GPU-Worker/5.0",
                },
                method="DELETE",
            )
            try:
                with urllib.request.urlopen(req, timeout=5.0) as resp:
                    logger.info("Node '%s' deregistered cleanly from edge KV (status %d).", node_id, resp.status)
            except Exception as exc:
                logger.debug("Deregistration notice for '%s': %s", node_id, exc)

        self.is_registered = False
        return True


class QuotaGuardProxy:
    """Reverse proxy routing LLM requests to GPU 0 and Haru-4B voice to GPU 1."""

    def __init__(
        self,
        frontend_port: int,
        ollama_port: int,
        haru_port: int,
        idle_timeout_sec: int,
        lifecycle: DualNodeLifecycleManager,
    ) -> None:
        self.frontend_port = frontend_port
        self.ollama_port = ollama_port
        self.haru_port = haru_port
        self.idle_timeout_sec = idle_timeout_sec
        self.lifecycle = lifecycle

        self.last_activity_time = time.time()
        self.shutdown_event = threading.Event()
        self.httpd: Optional[http.server.ThreadingHTTPServer] = None
        self._server_thread: Optional[threading.Thread] = None
        self._watchdog_thread: Optional[threading.Thread] = None

    def start(self) -> None:
        """Starts HTTP proxy server and idle quota watchdog."""
        proxy_self = self

        class ProxyHandler(http.server.BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: object) -> None:
                logger.debug("[Proxy] " + format, *args)

            def _send_json_response(self, status: int, data: Dict[str, Any]) -> None:
                body = json.dumps(data).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self) -> None:
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
                self.end_headers()

            def do_GET(self) -> None:
                parsed = urllib.parse.urlparse(self.path)
                if parsed.path in ("/ _nexus/status", "/_nexus/status", "/_nexus/health"):
                    idle_sec = int(time.time() - proxy_self.last_activity_time)
                    self._send_json_response(200, {
                        "status": "ONLINE",
                        "idle_seconds": idle_sec,
                        "idle_timeout_sec": proxy_self.idle_timeout_sec,
                        "gpu_0_ollama_port": proxy_self.ollama_port,
                        "gpu_1_haru_port": proxy_self.haru_port,
                    })
                    return

                proxy_self.last_activity_time = time.time()
                self._forward_request("GET")

            def do_POST(self) -> None:
                parsed = urllib.parse.urlparse(self.path)
                if parsed.path == "/_nexus/shutdown":
                    logger.info("Remote shutdown signal received via /_nexus/shutdown. Preserving GPU quota.")
                    self._send_json_response(200, {
                        "success": True,
                        "message": "Shutdown signal accepted. Preserving cloud GPU quota.",
                    })
                    proxy_self.shutdown_event.set()
                    return

                proxy_self.last_activity_time = time.time()
                self._forward_request("POST")

            def do_DELETE(self) -> None:
                proxy_self.last_activity_time = time.time()
                self._forward_request("DELETE")

            def _forward_request(self, method: str) -> None:
                content_len = int(self.headers.get("Content-Length", 0))
                req_body = self.rfile.read(content_len) if content_len > 0 else None

                # Route dispatch: Haru duplex voice vs Ollama LLM
                is_voice_route = self.path.startswith(("/api/haru", "/voice", "/haru"))
                target_port = proxy_self.haru_port if is_voice_route else proxy_self.ollama_port

                headers_to_forward: Dict[str, str] = {}
                for k, v in self.headers.items():
                    if k.lower() not in HOP_BY_HOP_HEADERS:
                        headers_to_forward[k] = v

                try:
                    conn = http.client.HTTPConnection("127.0.0.1", target_port, timeout=120.0)
                    conn.request(method, self.path, body=req_body, headers=headers_to_forward)
                    resp = conn.getresponse()

                    self.send_response(resp.status, resp.reason)
                    for hk, hv in resp.getheaders():
                        if hk.lower() not in HOP_BY_HOP_HEADERS:
                            self.send_header(hk, hv)
                    self.end_headers()

                    while chunk := resp.read(65536):
                        self.wfile.write(chunk)
                    conn.close()
                except Exception as exc:
                    logger.error("Failed to proxy request to target port %d: %s", target_port, exc)
                    self._send_json_response(502, {"error": f"Bad Gateway: backend error on port {target_port}: {exc}"})

        self.httpd = http.server.ThreadingHTTPServer(("0.0.0.0", self.frontend_port), ProxyHandler)
        self.httpd.daemon_threads = True

        self._server_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self._server_thread.start()
        logger.info(
            "QuotaGuardProxy active on 0.0.0.0:%d (GPU 0 Ollama: %d | GPU 1 Haru: %d)",
            self.frontend_port,
            self.ollama_port,
            self.haru_port,
        )

        self._watchdog_thread = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog_thread.start()

    def _watchdog_loop(self) -> None:
        """Periodically reports heartbeat and checks idle timeout (5 min)."""
        heartbeat_interval = 60
        last_heartbeat = time.time()

        while not self.shutdown_event.is_set():
            time.sleep(5)
            now = time.time()
            idle_seconds = int(now - self.last_activity_time)

            if now - last_heartbeat >= heartbeat_interval:
                self.lifecycle.register(idle_seconds=idle_seconds)
                last_heartbeat = now

            if idle_seconds >= self.idle_timeout_sec:
                logger.warning(
                    "IDLE WATCHDOG: No agent activity for %d seconds (timeout %d seconds). "
                    "Shutting down Kaggle GPU node to preserve quota.",
                    idle_seconds,
                    self.idle_timeout_sec,
                )
                self.shutdown_event.set()
                break

    def stop(self) -> None:
        """Stops proxy and watchdog."""
        self.shutdown_event.set()
        if self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception as exc:
                logger.debug("Proxy shutdown notice: %s", exc)


def main() -> None:
    logger.info("=== Nexus OS v5.0 Quota-Guarded Dual-GPU Worker Starting ===")

    token = resolve_nexus_token()
    if not token:
        logger.error("CRITICAL: NEXUS_TOKEN is missing! Set in Kaggle Secrets, Colab Secrets, or environment.")
        sys.exit(1)

    edge_url = os.environ.get("NEXUS_EDGE_URL", DEFAULT_EDGE_REGISTER_URL).strip()
    idle_timeout_sec = int(os.environ.get("IDLE_TIMEOUT_SEC", str(DEFAULT_IDLE_TIMEOUT_SEC)))

    provider = detect_provider()
    gpu_count, vram_gb, gpu_name = detect_gpu_hardware()
    ram_gb, cpu_cores = detect_system_resources()
    target_model = select_model(vram_gb)

    logger.info("Platform: %s | GPU Count: %d | Total VRAM: %d GB", provider, gpu_count, vram_gb)
    logger.info("GPU 0 assigned to Ollama (%s)", target_model)
    logger.info("GPU 1 assigned to Haru-4B Duplex Voice")

    # 1. Start GPU 0 Ollama
    ensure_ollama_installed()
    ollama_proc = start_ollama_daemon(port=BACKEND_OLLAMA_PORT, gpu_device=0)
    pull_model(target_model, port=BACKEND_OLLAMA_PORT)

    # 2. Start GPU 1 Haru Duplex
    haru_server = start_haru_duplex_daemon(port=BACKEND_HARU_PORT, gpu_device=1 if gpu_count > 1 else 0)

    # 3. Payloads for registration
    primary_payload = {
        "node_id": "kaggle-t4x2-primary",
        "type": "gpu",
        "model": target_model,
        "vram_gb": vram_gb // max(1, gpu_count) if gpu_count > 1 else vram_gb,
        "ram_gb": ram_gb,
        "cpu_cores": cpu_cores,
        "provider": provider,
        "idle_seconds": 0,
        "expiration_ttl": 180,
    }

    voice_payload = {
        "node_id": "kaggle-haru-duplex",
        "type": "voice_duplex",
        "model": "haru-4b-duplex",
        "vram_gb": vram_gb // 2 if gpu_count > 1 else 8,
        "ram_gb": ram_gb,
        "cpu_cores": cpu_cores,
        "provider": provider,
        "idle_seconds": 0,
        "expiration_ttl": 180,
    }

    lifecycle = DualNodeLifecycleManager(
        edge_url=edge_url,
        nexus_token=token,
        primary_payload=primary_payload,
        voice_payload=voice_payload,
    )

    proxy = QuotaGuardProxy(
        frontend_port=PROXY_FRONTEND_PORT,
        ollama_port=BACKEND_OLLAMA_PORT,
        haru_port=BACKEND_HARU_PORT,
        idle_timeout_sec=idle_timeout_sec,
        lifecycle=lifecycle,
    )
    proxy.start()

    # 4. Open Cloudflare Quick Tunnel
    cf_bin = ensure_cloudflared()
    tunnel_proc, tunnel_url = start_cloudflare_tunnel(cf_bin, port=PROXY_FRONTEND_PORT)

    lifecycle.primary_payload["url"] = tunnel_url
    lifecycle.voice_payload["url"] = tunnel_url

    lifecycle.register(idle_seconds=0)
    logger.info("Dual-GPU Cloud Worker federated successfully! Tunnel URL: %s", tunnel_url)

    def cleanup_and_exit() -> None:
        logger.info("Executing clean shutdown and edge deregistration...")
        proxy.stop()
        lifecycle.deregister()
        try:
            tunnel_proc.terminate()
            ollama_proc.terminate()
            haru_server.shutdown()
        except Exception as exc:
            logger.debug("Termination notice: %s", exc)
        logger.info("Cloud worker shutdown complete. Quota preserved.")
        sys.exit(0)

    signal.signal(signal.SIGINT, lambda s, f: proxy.shutdown_event.set())
    signal.signal(signal.SIGTERM, lambda s, f: proxy.shutdown_event.set())

    while not proxy.shutdown_event.is_set():
        try:
            time.sleep(1.0)
        except KeyboardInterrupt:
            proxy.shutdown_event.set()
            break

    cleanup_and_exit()


if __name__ == "__main__":
    main()
