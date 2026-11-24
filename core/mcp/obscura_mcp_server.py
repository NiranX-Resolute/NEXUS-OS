"""
Nexus OS v5.0 - Obscura Stealth Browser MCP Server
=============================================================================
Provides a dedicated FastMCP interface to the Obscura stealth browser engine
via Chrome DevTools Protocol (CDP).

Specifications:
- FastMCP Server Name: "ObscuraStealthBrowser"
- Obscura Binary: C:\\Nexus-OS\\bin\\obscura.exe or local bin/obscura.exe
- Default CDP Endpoint: http://127.0.0.1:9222
- Capabilities:
    * ensure_obscura_running(): Verifies port 9222 availability or spawns
      obscura.exe with flags: --port 9222 --headless --allow-private-network
    * stealth_navigate(url: str) -> str: Connects via Playwright CDP,
      navigates with networkidle wait, extracts body innerText truncated
      to 10,000 characters for LLM prompt safety, and safely cleans up.
=============================================================================
"""

import os
import sys
import time
import socket
import logging
import urllib.request
import subprocess
from typing import Optional, Dict, Any

# Configure structured logging
logger = logging.getLogger("ObscuraStealthBrowser")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Default configuration constants
DEFAULT_BINARY_PATH_SYSTEM = r"C:\Nexus-OS\bin\obscura.exe"
DEFAULT_CDP_URL = "http://127.0.0.1:9222"
CDP_PORT = 9222
CDP_HOST = "127.0.0.1"
MAX_LLM_TEXT_LENGTH = 10000

# MCP Server Import with resilient fallback shim
try:
    from mcp.server.fastmcp import FastMCP
    HAS_FASTMCP = True
except ImportError:
    HAS_FASTMCP = False
    logger.warning("mcp.server.fastmcp is not installed. Utilizing internal FastMCP bridge shim.")

    class FastMCP:  # type: ignore
        def __init__(self, name: str):
            self.name = name
            self._tools: Dict[str, Any] = {}

        def tool(self):
            def decorator(fn):
                self._tools[fn.__name__] = fn
                return fn
            return decorator

        def run(self):
            print(f"[{self.name}] FastMCP server running with registered tools: {list(self._tools.keys())}")


# Initialize the FastMCP instance
mcp = FastMCP("ObscuraStealthBrowser")


def resolve_obscura_binary() -> Optional[str]:
    """
    Resolves the Obscura executable path across system, environment, and workspace locations.
    """
    # 1. Explicit environment override
    env_bin = os.environ.get("OBSCURA_BIN_PATH")
    if env_bin and os.path.exists(env_bin):
        return os.path.abspath(env_bin)

    # 2. System path C:\Nexus-OS\bin\obscura.exe
    if os.path.exists(DEFAULT_BINARY_PATH_SYSTEM):
        return DEFAULT_BINARY_PATH_SYSTEM

    # 3. Local workspace bin/obscura.exe
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    local_bin = os.path.join(workspace_root, "bin", "obscura.exe")
    if os.path.exists(local_bin):
        return local_bin

    # 4. Workspace pre-packaged folder obscura-x86_64-windows (1)
    packaged_bin = os.path.join(workspace_root, "obscura-x86_64-windows (1)", "obscura.exe")
    if os.path.exists(packaged_bin):
        return packaged_bin

    # 5. PATH lookup
    import shutil
    which_obscura = shutil.which("obscura.exe") or shutil.which("obscura")
    if which_obscura:
        return which_obscura

    return None


def is_cdp_port_open(host: str = CDP_HOST, port: int = CDP_PORT, timeout: float = 1.0) -> bool:
    """
    Checks if the CDP socket port is open and accepting TCP connections.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        result = sock.connect_ex((host, port))
        return result == 0
    except Exception:
        return False
    finally:
        sock.close()


def is_cdp_endpoint_ready(cdp_url: str = DEFAULT_CDP_URL, timeout: float = 1.5) -> bool:
    """
    Queries the Chromium /json/version endpoint to verify CDP readiness.
    """
    version_url = f"{cdp_url.rstrip('/')}/json/version"
    try:
        req = urllib.request.Request(version_url, headers={"User-Agent": "Nexus-MCP/5.0"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status == 200
    except Exception:
        return False


def ensure_obscura_running(
    binary_path: Optional[str] = None,
    cdp_url: str = DEFAULT_CDP_URL,
    max_wait_seconds: float = 8.0
) -> bool:
    """
    Ensures that the Obscura stealth browser is actively running and responding on CDP.
    Spawns the process with `--port 9222 --headless --allow-private-network` if not already running.
    """
    # Check if already active and responding
    if is_cdp_port_open(CDP_HOST, CDP_PORT) or is_cdp_endpoint_ready(cdp_url):
        logger.info(f"Obscura browser CDP instance is already responding at {cdp_url}")
        return True

    # Resolve binary
    target_bin = binary_path or resolve_obscura_binary()
    if not target_bin:
        logger.warning(
            f"Obscura binary not found at system path '{DEFAULT_BINARY_PATH_SYSTEM}' or local 'bin/obscura.exe'. "
            "Attempting system Chrome/Chromium fallback with CDP flags."
        )
        import shutil
        target_bin = (
            shutil.which("chrome") or
            shutil.which("chromium") or
            shutil.which("msedge") or
            r"C:\Program Files\Google\Chrome\Application\chrome.exe" or
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        )
        if not target_bin or not os.path.exists(str(target_bin)):
            logger.error("No compatible browser binary found to launch CDP server.")
            return False

    # Check if target is native Obscura binary
    if "obscura" in os.path.basename(target_bin).lower():
        cmd = [
            target_bin,
            "serve",
            "-p", str(CDP_PORT),
            "--stealth",
            "--allow-private-network"
        ]
    else:
        cmd = [
            target_bin,
            f"--remote-debugging-port={CDP_PORT}",
            "--remote-allow-origins=*",
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check"
        ]

    logger.info(f"Spawning Obscura process: {' '.join(cmd)}")
    try:
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0x08000000

        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags
        )
    except Exception as e:
        logger.error(f"Failed to spawn Obscura process: {e}")
        return False

    # Wait for the CDP port to initialize
    start_time = time.time()
    while time.time() - start_time < max_wait_seconds:
        if is_cdp_port_open(CDP_HOST, CDP_PORT) or is_cdp_endpoint_ready(cdp_url):
            logger.info("Obscura CDP initialized successfully.")
            return True
        time.sleep(0.4)

    logger.warning("Obscura spawned but CDP endpoint did not respond within timeout.")
    return False


class ObscuraStealthBrowser:
    """
    Python programmatic wrapper around the Obscura FastMCP server.
    """

    def __init__(self, binary_path: Optional[str] = None, cdp_url: str = DEFAULT_CDP_URL):
        self.binary_path = binary_path or resolve_obscura_binary()
        self.cdp_url = cdp_url

    def ensure_running(self) -> bool:
        return ensure_obscura_running(self.binary_path, self.cdp_url)

    async def navigate_and_extract(self, url: str) -> str:
        return await stealth_navigate(url)


@mcp.tool()
async def stealth_navigate(url: str) -> str:
    """
    Connects to Obscura stealth browser over CDP (http://127.0.0.1:9222), navigates to the
    specified URL, waits for network idle, extracts innerText (truncated to 10,000 characters
    for LLM safety), and cleans up page context.
    """
    # 1. Ensure the browser is actively serving CDP
    running = ensure_obscura_running()
    if not running:
        # Fallback to direct HTTP text retrieval if CDP is unavailable
        logger.warning(f"Obscura CDP not available; falling back to direct HTTP fetch for {url}")
        return _fetch_http_fallback(url)

    # 2. Connect via Playwright CDP
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright is not installed. Performing HTTP fallback extraction.")
        return _fetch_http_fallback(url)

    try:
        async with async_playwright() as p:
            browser = await p.chromium.connect_over_cdp(DEFAULT_CDP_URL)
            context = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = await context.new_page()
            try:
                # Navigate and wait for network idle
                await page.goto(url, wait_until="networkidle", timeout=30000)
                # Extract innerText from body
                body_elem = await page.query_selector("body")
                if body_elem:
                    raw_text = await body_elem.inner_text()
                else:
                    raw_text = await page.content()

                # Clean whitespace and truncate to 10,000 characters
                cleaned_text = " ".join(raw_text.split())
                if len(cleaned_text) > MAX_LLM_TEXT_LENGTH:
                    truncated = cleaned_text[:MAX_LLM_TEXT_LENGTH] + "\n...[TRUNCATED FOR LLM SAFETY]"
                else:
                    truncated = cleaned_text

                return truncated
            finally:
                await page.close()
                await browser.close()
    except Exception as e:
        logger.error(f"Playwright CDP error during stealth navigation: {e}")
        return f"[Obscura Stealth Navigation Error]: {str(e)}\n\nFallback content:\n{_fetch_http_fallback(url)}"


def _fetch_http_fallback(url: str) -> str:
    """
    Resilient fallback that retrieves text content via HTTP when CDP is unavailable.
    """
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw_html = resp.read().decode("utf-8", errors="replace")
            # Strip tags using regex
            import re
            text = re.sub(r"<script[^>]*>.*?</script>", "", raw_html, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<[^>]+>", " ", text)
            cleaned = " ".join(text.split())
            if len(cleaned) > MAX_LLM_TEXT_LENGTH:
                return cleaned[:MAX_LLM_TEXT_LENGTH] + "\n...[TRUNCATED FOR LLM SAFETY]"
            return cleaned
    except Exception as err:
        return f"[HTTP Fallback Error for {url}]: {str(err)}"


if __name__ == "__main__":
    logger.info("Starting Obscura Stealth Browser MCP Server...")
    mcp.run()
