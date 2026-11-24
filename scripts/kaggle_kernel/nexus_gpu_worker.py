#!/usr/bin/env python3
"""Nexus OS v5.0 - Kaggle Dedicated 2x T4 Quota-Guarded GPU Worker.

Automatically provisions and runs on Kaggle Notebooks (2x Nvidia T4 16GB = 32GB VRAM):
- Installs and runs Ollama on localhost:11435 with OLLAMA_KEEP_ALIVE=15m.
- Runs QuotaGuardProxy on localhost:11434 with IDLE_TIMEOUT_SEC = 600 (10 min auto-shutdown).
- Binds a zero-account Cloudflare Quick Tunnel (trycloudflare.com).
- Registers node in Cloudflare KV edge registry with 3-minute auto-expiration.
- Supports instant remote shutdown via POST /_nexus/shutdown to conserve weekly quota.
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
from typing import Dict, List, Optional, Tuple
import urllib.error
import urllib.parse
import urllib.request
import uuid

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [KAGGLE-WORKER] %(message)s",
)
logger = logging.getLogger("nexus.kaggle.gpu_worker")

DEFAULT_EDGE_REGISTER_URL = "https://nexus-bridge.pages.dev/api/compute/register"
FALLBACK_EDGE_REGISTER_URL = "https://nexus-bridge-7l1.pages.dev/api/compute/register"
DEFAULT_IDLE_TIMEOUT_SEC = 600
BACKEND_OLLAMA_PORT = 11435
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
    """Attempts to retrieve NEXUS_TOKEN from Kaggle UserSecrets or environment."""
    token = os.environ.get("NEXUS_TOKEN", "").strip()
    if token:
        return token

    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore
        client = UserSecretsClient()
        tok = client.get_secret("NEXUS_TOKEN")
        if tok:
            return str(tok).strip()
    except Exception as exc:
        logger.debug("Kaggle secrets lookup notice: %s", exc)

    return ""


def detect_gpu_hardware() -> Tuple[int, int, str]:
    """Probes GPU count, total VRAM (GB), and name via nvidia-smi."""
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
        logger.warning("nvidia-smi probe unavailable (%s)", exc)

    return gpu_count, total_vram_gb, gpu_name


class QuotaGuardProxy(http.server.ThreadingHTTPServer):
    """Reverse proxy fronting Ollama on :11434 with idle watchdog and remote shutdown."""
    allow_reuse_address = True
    daemon_threads = True

    def __init__(
        self,
        server_address: Tuple[str, int],
        RequestHandlerClass,
        backend_port: int = BACKEND_OLLAMA_PORT,
        idle_timeout_sec: int = DEFAULT_IDLE_TIMEOUT_SEC,
        node_id: Optional[str] = None,
        edge_register_url: str = DEFAULT_EDGE_REGISTER_URL,
        auth_token: str = "",
    ):
        super().__init__(server_address, RequestHandlerClass)
        self.backend_port = backend_port
        self.idle_timeout_sec = idle_timeout_sec
        self.node_id = node_id or f"kaggle-t4x2-{uuid.uuid4().hex[:8]}"
        self.edge_register_url = edge_register_url
        self.auth_token = auth_token

        self.last_activity_time = time.time()
        self.active_requests_count = 0
        self.lock = threading.Lock()
        self.shutdown_requested = threading.Event()
        self.shutdown_reason = "normal"
        self.tunnel_url: Optional[str] = None

    def record_activity(self) -> None:
        with self.lock:
            self.last_activity_time = time.time()

    def get_idle_seconds(self) -> int:
        with self.lock:
            return int(time.time() - self.last_activity_time)


class QuotaGuardProxyHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        logger.debug("[PROXY] " + format % args)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        self._handle_proxy_request("GET")

    def do_POST(self) -> None:
        if self.path == "/_nexus/shutdown":
            self._handle_remote_shutdown()
            return
        self._handle_proxy_request("POST")

    def do_DELETE(self) -> None:
        self._handle_proxy_request("DELETE")

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def _handle_remote_shutdown(self) -> None:
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        reason = "remote_nexus_shutdown_call"
        try:
            parsed = json.loads(body.decode("utf-8"))
            if isinstance(parsed, dict) and parsed.get("reason"):
                reason = str(parsed["reason"])
        except Exception as exc:
            logger.debug("Shutdown payload parse notice: %s", exc)

        server: QuotaGuardProxy = self.server  # type: ignore
        logger.info("Remote shutdown invoked via /_nexus/shutdown (Reason: %s)", reason)
        server.shutdown_reason = reason
        server.shutdown_requested.set()

        resp_payload = json.dumps({
            "success": True,
            "message": "Shutdown signal accepted. Quota preserved.",
            "node_id": server.node_id,
            "reason": reason,
        }).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._send_cors_headers()
        self.send_header("Content-Length", str(len(resp_payload)))
        self.end_headers()
        self.wfile.write(resp_payload)

    def _handle_proxy_request(self, method: str) -> None:
        server: QuotaGuardProxy = self.server  # type: ignore
        server.record_activity()

        content_length = int(self.headers.get("Content-Length", 0))
        req_body = self.rfile.read(content_length) if content_length > 0 else None

        req_headers: Dict[str, str] = {}
        for k, v in self.headers.items():
            if k.lower() not in HOP_BY_HOP_HEADERS:
                req_headers[k] = v

        try:
            conn = http.client.HTTPConnection("127.0.0.1", server.backend_port, timeout=120.0)
            conn.request(method, self.path, body=req_body, headers=req_headers)
            backend_resp = conn.getresponse()

            self.send_response(backend_resp.status)
            for k, v in backend_resp.getheaders():
                if k.lower() not in HOP_BY_HOP_HEADERS:
                    self.send_header(k, v)
            self._send_cors_headers()
            self.end_headers()

            while True:
                chunk = backend_resp.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
            conn.close()
        except Exception as exc:
            logger.error("Proxy error forwarding to Ollama :%d: %s", server.backend_port, exc)
            err_json = json.dumps({"error": f"Backend Ollama error: {str(exc)}"}).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.send_header("Content-Length", str(len(err_json)))
            self.end_headers()
            self.wfile.write(err_json)


def deregister_from_edge(register_url: str, node_id: str, token: str) -> None:
    """Sends DELETE /api/compute/nodes/<node_id> to Cloudflare KV edge registry."""
    try:
        parsed = urllib.parse.urlparse(register_url)
        base_path = re.sub(r"/register/?$", "", parsed.path)
        delete_url = urllib.parse.urlunparse((
            parsed.scheme,
            parsed.netloc,
            f"{base_path}/nodes/{node_id}",
            "",
            "",
            "",
        ))
        headers = {"User-Agent": "Nexus-Kaggle-Worker/5.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(delete_url, headers=headers, method="DELETE")
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            logger.info("Successfully deregistered node '%s' from edge (Status: %d)", node_id, resp.status)
    except Exception as exc:
        logger.warning("Edge deregistration notice for '%s': %s", node_id, exc)


def register_with_edge(
    register_url: str,
    node_id: str,
    tunnel_url: str,
    vram_gb: int,
    model: str,
    token: str,
    idle_sec: int,
) -> bool:
    """Posts heartbeat and metadata to Cloudflare KV edge registry with 180s TTL."""
    payload = {
        "node_id": node_id,
        "url": tunnel_url,
        "type": "gpu",
        "model": model,
        "vram_gb": vram_gb,
        "ram_gb": 32,
        "cpu_cores": 4,
        "provider": "kaggle",
        "idle_seconds": idle_sec,
        "expiration_ttl": 180,
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Nexus-Kaggle-Worker/5.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        req = urllib.request.Request(
            register_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            return resp.status in (200, 201)
    except Exception as exc:
        logger.warning("Heartbeat registration to %s failed: %s", register_url, exc)
        return False


def main() -> None:
    token = resolve_nexus_token()
    gpu_count, total_vram, gpu_name = detect_gpu_hardware()
    node_id = f"kaggle-t4x2-primary-{uuid.uuid4().hex[:6]}"
    selected_model = "qwen2.5-coder:7b" if total_vram < 20 else "qwen2.5-coder:14b"

    logger.info("=================================================================")
    logger.info("Nexus OS v5.0 - Kaggle Dedicated 2x T4 GPU Worker Starting")
    logger.info("Hardware: %s (%d GPUs, %d GB VRAM)", gpu_name, gpu_count, total_vram)
    logger.info("Target Model: %s (OLLAMA_KEEP_ALIVE=15m)", selected_model)
    logger.info("Node ID: %s | Idle Timeout: %ds", node_id, DEFAULT_IDLE_TIMEOUT_SEC)
    logger.info("=================================================================")

    # 1. Start Ollama Backend on :11435
    env_ollama = os.environ.copy()
    env_ollama["OLLAMA_HOST"] = f"127.0.0.1:{BACKEND_OLLAMA_PORT}"
    env_ollama["OLLAMA_KEEP_ALIVE"] = "15m"

    ollama_proc = None
    ollama_bin = shutil.which("ollama")
    if ollama_bin:
        logger.info("Starting Ollama daemon on 127.0.0.1:%d...", BACKEND_OLLAMA_PORT)
        ollama_proc = subprocess.Popen([ollama_bin, "serve"], env=env_ollama)
        time.sleep(2.0)
        # Pull model in background
        subprocess.Popen([ollama_bin, "pull", selected_model], env=env_ollama)

    # 2. Start QuotaGuardProxy on :11434
    proxy_server = QuotaGuardProxy(
        ("0.0.0.0", PROXY_FRONTEND_PORT),
        QuotaGuardProxyHandler,
        backend_port=BACKEND_OLLAMA_PORT,
        idle_timeout_sec=DEFAULT_IDLE_TIMEOUT_SEC,
        node_id=node_id,
        edge_register_url=DEFAULT_EDGE_REGISTER_URL,
        auth_token=token,
    )
    proxy_thread = threading.Thread(target=proxy_server.serve_forever, daemon=True)
    proxy_thread.start()
    logger.info("QuotaGuardProxy listening on 0.0.0.0:%d", PROXY_FRONTEND_PORT)

    # 3. Start Cloudflare Tunnel
    cloudflared_proc = None
    tunnel_url = None
    cloudflared_bin = shutil.which("cloudflared")
    if cloudflared_bin:
        logger.info("Spawning Cloudflare Quick Tunnel for port %d...", PROXY_FRONTEND_PORT)
        cloudflared_proc = subprocess.Popen(
            [cloudflared_bin, "tunnel", "--url", f"http://127.0.0.1:{PROXY_FRONTEND_PORT}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        start_t = time.time()
        while time.time() - start_t < 30.0 and cloudflared_proc.poll() is None:
            line = cloudflared_proc.stdout.readline() if cloudflared_proc.stdout else ""
            if not line:
                time.sleep(0.1)
                continue
            m = url_pattern.search(line)
            if m:
                tunnel_url = m.group(0)
                logger.info("Cloudflare Quick Tunnel ACTIVE: %s", tunnel_url)
                proxy_server.tunnel_url = tunnel_url
                break

    # 4. Supervision Loop: Heartbeat & Idle Watchdog
    try:
        while not proxy_server.shutdown_requested.is_set():
            idle = proxy_server.get_idle_seconds()
            if idle >= DEFAULT_IDLE_TIMEOUT_SEC:
                logger.warning("Idle timeout threshold reached (%ds >= %ds). Conserving GPU quota.", idle, DEFAULT_IDLE_TIMEOUT_SEC)
                proxy_server.shutdown_reason = "idle_timeout_quota_guard"
                break

            if tunnel_url:
                register_with_edge(
                    DEFAULT_EDGE_REGISTER_URL,
                    node_id,
                    tunnel_url,
                    total_vram,
                    selected_model,
                    token,
                    idle,
                )

            time.sleep(30.0)
    except KeyboardInterrupt:
        logger.info("Interrupted by user.")
    finally:
        logger.info("Shutting down Kaggle worker. Reason: %s", proxy_server.shutdown_reason)
        deregister_from_edge(DEFAULT_EDGE_REGISTER_URL, node_id, token)

        if cloudflared_proc:
            try:
                cloudflared_proc.terminate()
            except Exception as exc:
                logger.debug("Cloudflared terminate notice: %s", exc)
        if ollama_proc:
            try:
                ollama_proc.terminate()
            except Exception as exc:
                logger.debug("Ollama terminate notice: %s", exc)
        proxy_server.shutdown()
        logger.info("Kaggle GPU quota released successfully.")


if __name__ == "__main__":
    main()
