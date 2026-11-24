#!/usr/bin/env bash
# ==============================================================================
# Nexus OS v5.0 - Tailscale Ephemeral Burst Worker Bootstrap Script
# Target: GitHub Codespaces, InstaBox, Google Cloud Shell, Debian/Ubuntu VMs
# Hostname: nexus-burst-worker | Port: 8000
# ==============================================================================

set -euo pipefail

BURST_HOSTNAME="${TAILSCALE_HOSTNAME:-nexus-burst-worker}"
BURST_PORT="${BURST_PORT:-8000}"
IDLE_TIMEOUT_SEC="${BURST_IDLE_TIMEOUT_SEC:-1800}" # 30 minutes
LOG_FILE="/tmp/nexus_burst_worker.log"

echo "================================================================="
echo "   NEXUS OS v5.0 - TAILSCALE BURST WORKER BOOTSTRAP"
echo "   Node: ${BURST_HOSTNAME} | Port: ${BURST_PORT}"
echo "================================================================="

# 1. Verify / Install Tailscale
if ! command -v tailscale &> /dev/null; then
    echo "[1/4] Installing Tailscale mesh client..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    echo "[1/4] Tailscale client already installed."
fi

# 2. Start tailscaled daemon if not running
if ! pgrep -x "tailscaled" > /dev/null; then
    echo "[2/4] Starting tailscaled daemon..."
    if command -v systemctl &> /dev/null && systemctl is-active --quiet dbus; then
        sudo systemctl start tailscaled || true
    else
        # Container / userspace networking fallback
        sudo tailscaled --tun=userspace-networking --state=/tmp/tailscaled.state &
        sleep 2
    fi
fi

# 3. Authenticate with Tailscale network
echo "[3/4] Registering node as ${BURST_HOSTNAME}..."
if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    sudo tailscale up --authkey="${TAILSCALE_AUTHKEY}" --hostname="${BURST_HOSTNAME}" --accept-routes --ssh || true
else
    echo "Notice: TAILSCALE_AUTHKEY not set in environment. Running standard tailscale up..."
    sudo tailscale up --hostname="${BURST_HOSTNAME}" --accept-routes --ssh || true
fi

# Print registered Tailscale IP
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "127.0.0.1")
echo "Tailscale node online at IP: ${TAILSCALE_IP}"

# 4. Launch Lightweight Python Burst Server
echo "[4/4] Starting Nexus Burst Compute Daemon on port ${BURST_PORT}..."

cat << 'EOF' > /tmp/nexus_burst_daemon.py
import json
import logging
import os
import subprocess
import sys
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [BURST-DAEMON] %(message)s")
logger = logging.getLogger("nexus.burst.daemon")

PORT = int(os.environ.get("BURST_PORT", 8000))
IDLE_TIMEOUT = int(os.environ.get("BURST_IDLE_TIMEOUT_SEC", 1800))
HOSTNAME = os.environ.get("TAILSCALE_HOSTNAME", "nexus-burst-worker")
START_TIME = time.time()
last_activity = time.time()
shutdown_event = threading.Event()

def get_system_specs():
    cores = os.cpu_count() or 4
    ram_gb = 16
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    ram_kb = int(line.split()[1])
                    ram_gb = int(round(ram_kb / (1024.0 * 1024.0)))
                    break
    except Exception:
        pass
    return cores, ram_gb

class BurstHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        global last_activity
        last_activity = time.time()

        if self.path in ("/health", "/v1/health", "/status"):
            cores, ram_gb = get_system_specs()
            payload = {
                "status": "healthy",
                "node_id": "tailscale-burst-worker",
                "node_type": "tailscale_burst_worker",
                "hostname": HOSTNAME,
                "provider": "tailscale_burst",
                "cpu_cores": cores,
                "ram_gb": ram_gb,
                "uptime_sec": round(time.time() - START_TIME, 2),
                "idle_sec": round(time.time() - last_activity, 2),
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        global last_activity
        last_activity = time.time()

        if self.path == "/_nexus/shutdown":
            logger.info("Remote shutdown requested.")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            resp = b'{"status":"shutting_down"}'
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
            shutdown_event.set()
            return

        if self.path in ("/v1/execute", "/execute"):
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            cmd = data.get("command", "")
            if not cmd:
                self.send_response(400)
                self.end_headers()
                return

            try:
                proc = subprocess.run(
                    cmd, shell=True, capture_output=True, text=True, timeout=data.get("timeout", 60)
                )
                res = {
                    "success": proc.returncode == 0,
                    "returncode": proc.returncode,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr,
                }
            except Exception as err:
                res = {"success": False, "error": str(err)}

            body = json.dumps(res).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_response(404)
        self.end_headers()

def watchdog():
    logger.info("Watchdog started with %ds timeout.", IDLE_TIMEOUT)
    while not shutdown_event.is_set():
        time.sleep(10)
        if time.time() - last_activity > IDLE_TIMEOUT:
            logger.warning("Idle timeout exceeded. Terminating burst worker.")
            shutdown_event.set()
            os._exit(0)

threading.Thread(target=watchdog, daemon=True).start()

server = HTTPServer(("0.0.0.0", PORT), BurstHandler)
logger.info("Burst worker listening on 0.0.0.0:%d", PORT)
try:
    while not shutdown_event.is_set():
        server.handle_request()
finally:
    server.server_close()
EOF

python3 /tmp/nexus_burst_daemon.py >> "${LOG_FILE}" 2>&1 &
BURST_PID=$!
echo "Burst worker started (PID: ${BURST_PID}). Log: ${LOG_FILE}"
echo "================================================================="
echo "   NEXUS TAILSCALE BURST WORKER READY: http://${TAILSCALE_IP}:${BURST_PORT}"
echo "================================================================="
