"""Nexus OS v5.0 - Hugging Face Space Always-On 16GB CPU Worker API.

Provides offloaded stateless compute and Scout web scraping for Nexus OS:
1. GET /health - Telemetry and resource monitoring.
2. POST /v1/scout/fetch - Async web scraping & parsing without consuming laptop RAM.
3. POST /v1/slice/execute - Stateless InfinitySliceEngine compute execution.
Secured with NEXUS_TOKEN Bearer authentication.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import io
import json
import logging
import os
import re
import sys
import time
import traceback
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

try:
    import spaces
    HAS_SPACES = True
except ImportError:
    HAS_SPACES = False

    class spaces:
        @staticmethod
        def GPU(func=None, duration=60):
            if callable(func):
                return func
            def decorator(f):
                return f
            return decorator

try:
    import torch
    HAS_TORCH = True
except ImportError:
    torch = None
    HAS_TORCH = False

from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, HTTPException, Request, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
import psutil
from pydantic import BaseModel, Field

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [HF-WORKER] %(message)s",
)
logger = logging.getLogger("nexus.worker.hf")

START_TIME = time.time()
security_scheme = HTTPBearer(auto_error=False)


def verify_nexus_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
) -> str:
    """Verifies the Bearer token against NEXUS_TOKEN environment secret."""
    expected_token = os.environ.get("NEXUS_TOKEN", "").strip()
    if not expected_token:
        # In development without token configured, log warning
        logger.warning("NEXUS_TOKEN is not configured in worker environment.")
        return "unsecured-dev"

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or invalid.",
        )

    if credentials.credentials.strip() != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid NEXUS_TOKEN Bearer credential.",
        )

    return credentials.credentials


def notify_zerogpu_startup() -> bool:
    """Notifies Hugging Face ZeroGPU supervisor that GPU worker is ready."""
    reported = False
    try:
        import spaces.zero as zero_mod
        if hasattr(zero_mod, "startup"):
            zero_mod.startup()
            logger.info("[ZeroGPU] Successfully called spaces.zero.startup()")
            reported = True
    except Exception as e:
        logger.debug("[ZeroGPU] spaces.zero.startup() notice: %s", e)

    if not reported:
        try:
            import spaces.zero.client as zero_client
            zero_client.startup_report()
            logger.info("[ZeroGPU] Successfully called zero_client.startup_report()")
            reported = True
        except Exception as e:
            logger.debug("[ZeroGPU] zero_client.startup_report() notice: %s", e)

    return reported


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Optional background registration with Cloudflare Edge Registry."""
    notify_zerogpu_startup()
    edge_url = os.environ.get("NEXUS_EDGE_URL", "https://nexus-bridge-7l1.pages.dev/api/compute/register")
    nexus_token = os.environ.get("NEXUS_TOKEN", "").strip()
    space_host = os.environ.get("SPACE_HOST") or os.environ.get("HF_SPACE_URL")

    node_id = f"cpu-hf-{os.environ.get('SPACE_ID', 'default').replace('/', '-')[:20]}"
    stop_event = asyncio.Event()

    async def heartbeat_task():
        if not nexus_token or not space_host:
            logger.info("Auto-registration skipped (NEXUS_TOKEN or SPACE_HOST not provided).")
            return

        worker_url = f"https://{space_host}" if not space_host.startswith("http") else space_host
        mem = psutil.virtual_memory()
        ram_gb = round(mem.total / (1024**3), 1)
        cpu_cores = os.cpu_count() or 2

        payload = {
            "node_id": node_id,
            "url": worker_url,
            "type": "cpu",
            "model": "scout-slice-worker",
            "vram_gb": 0,
            "ram_gb": ram_gb,
            "cpu_cores": cpu_cores,
            "provider": "huggingface_spaces",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            while not stop_event.is_set():
                try:
                    resp = await client.post(
                        edge_url,
                        json=payload,
                        headers={"Authorization": f"Bearer {nexus_token}"},
                    )
                    if resp.status_code in (200, 201):
                        logger.info("Heartbeat registered with edge registry: %s", resp.status_code)
                    else:
                        logger.warning("Heartbeat response status: %d", resp.status_code)
                except Exception as exc:
                    logger.warning("Heartbeat error: %s", exc)

                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=300.0)
                except asyncio.TimeoutError:
                    logger.debug("Heartbeat periodic interval cycle triggered.")

    task = asyncio.create_task(heartbeat_task())
    try:
        yield
    finally:
        stop_event.set()
        task.cancel()


app = FastAPI(
    title="Nexus OS Always-On 16GB CPU Worker",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """Returns worker system health, memory, and CPU metrics without auth."""
    mem = psutil.virtual_memory()
    total_ram_gb = round(mem.total / (1024**3), 2)
    used_ram_gb = round(mem.used / (1024**3), 2)
    free_ram_gb = round(mem.available / (1024**3), 2)
    cpu_percent = psutil.cpu_percent(interval=None)

    return {
        "status": "HEALTHY",
        "worker_type": "hf_space_16gb_cpu",
        "uptime_sec": round(time.time() - START_TIME, 2),
        "cpu_percent": cpu_percent,
        "cpu_cores": os.cpu_count() or 2,
        "ram_total_gb": total_ram_gb,
        "ram_used_gb": used_ram_gb,
        "ram_free_gb": free_ram_gb,
        "ram_percent": mem.percent,
        "timestamp": time.time(),
    }


class ScoutFetchRequest(BaseModel):
    url: str = Field(..., description="Target webpage URL to extract")
    selector: Optional[str] = Field(None, description="Optional CSS selector for targeted extraction")
    extract_links: bool = Field(True, description="Whether to extract hyperlinks from the page")
    headers: Optional[Dict[str, str]] = Field(None, description="Custom HTTP headers")
    timeout_sec: float = Field(20.0, description="HTTP request timeout in seconds")


@app.post("/v1/scout/fetch")
async def scout_fetch(
    req: ScoutFetchRequest,
    _token: str = Depends(verify_nexus_token),
) -> Dict[str, Any]:
    """Offloaded async web scraper and HTML parser for SCOUT-01."""
    start_t = time.perf_counter()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if req.headers:
        headers.update(req.headers)

    try:
        async with httpx.AsyncClient(timeout=req.timeout_sec, follow_redirects=True) as client:
            resp = await client.get(req.url, headers=headers)
            resp.raise_for_status()
            html_text = resp.text
            status_code = resp.status_code
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch upstream target: {str(exc)}",
        )

    # Parse with BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")

    # Remove non-content elements
    for el in soup(["script", "style", "noscript", "svg"]):
        el.extract()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    selected_data = []
    if req.selector:
        elements = soup.select(req.selector)
        for el in elements:
            selected_data.append(el.get_text(separator=" ", strip=True))

    links: List[Dict[str, str]] = []
    if req.extract_links:
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            anchor_text = a.get_text(strip=True)
            if href and not href.startswith(("javascript:", "mailto:", "#")):
                full_url = urljoin(req.url, href)
                links.append({"text": anchor_text, "url": full_url})
                if len(links) >= 100:
                    break

    main_text = soup.get_text(separator="\n", strip=True)
    # Truncate clean text to reasonable size if very large
    if len(main_text) > 150000:
        main_text = main_text[:150000] + "\n...[truncated by Scout worker]"

    duration_ms = round((time.perf_counter() - start_t) * 1000, 2)

    return {
        "success": True,
        "url": req.url,
        "status_code": status_code,
        "title": title,
        "content": main_text,
        "selected_elements": selected_data,
        "links": links,
        "duration_ms": duration_ms,
    }


class SliceExecuteRequest(BaseModel):
    code: str = Field(..., description="Python source code snippet to execute")
    task_id: Optional[str] = Field(None, description="Task tracking identifier")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Variables injected into scope")


@app.post("/v1/slice/execute")
async def slice_execute(
    req: SliceExecuteRequest,
    _token: str = Depends(verify_nexus_token),
) -> Dict[str, Any]:
    """Executes stateless InfinitySliceEngine compute tasks."""
    start_t = time.perf_counter()

    # Capture stdout and stderr
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_output = io.StringIO()
    redirected_error = io.StringIO()

    exec_globals: Dict[str, Any] = {
        "__builtins__": __builtins__,
        "json": json,
        "time": time,
        "asyncio": asyncio,
        "re": re,
    }
    exec_locals: Dict[str, Any] = dict(req.context or {})

    success = False
    result_val: Any = None
    error_message: Optional[str] = None

    try:
        sys.stdout = redirected_output
        sys.stderr = redirected_error

        exec(req.code, exec_globals, exec_locals)

        success = True
        result_val = exec_locals.get("result", exec_locals.get("output", None))
    except Exception:
        error_message = traceback.format_exc()
        success = False
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    duration_ms = round((time.perf_counter() - start_t) * 1000, 2)

    return {
        "success": success,
        "task_id": req.task_id,
        "result": result_val,
        "stdout": redirected_output.getvalue(),
        "stderr": redirected_error.getvalue(),
        "error": error_message,
        "duration_ms": duration_ms,
    }


@spaces.GPU(duration=120)
def execute_on_gpu(code: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Executes Python/PyTorch code on NVIDIA A10G (24GB VRAM) via Hugging Face ZeroGPU."""
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    redirected_output = io.StringIO()
    redirected_error = io.StringIO()

    exec_globals: Dict[str, Any] = {
        "__builtins__": __builtins__,
        "json": json,
        "time": time,
        "re": re,
    }
    if torch is not None:
        exec_globals["torch"] = torch

    exec_locals: Dict[str, Any] = dict(context or {})

    try:
        sys.stdout = redirected_output
        sys.stderr = redirected_error

        exec(code, exec_globals, exec_locals)
        result_val = exec_locals.get("result", exec_locals.get("output", None))
        cuda_device = torch.cuda.get_device_name(0) if (torch and torch.cuda.is_available()) else "cpu"
        return {
            "success": True,
            "device": cuda_device,
            "result": result_val,
            "stdout": redirected_output.getvalue(),
            "stderr": redirected_error.getvalue(),
            "error": None,
        }
    except Exception:
        return {
            "success": False,
            "device": "unknown",
            "result": None,
            "stdout": redirected_output.getvalue(),
            "stderr": redirected_error.getvalue(),
            "error": traceback.format_exc(),
        }
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


class GpuExecuteRequest(BaseModel):
    code: str = Field(..., description="Python/PyTorch source code to execute on GPU")
    task_id: Optional[str] = Field(None, description="Task tracking identifier")
    context: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Variables injected into scope")


@app.post("/v1/gpu/execute")
async def gpu_execute(
    req: GpuExecuteRequest,
    _token: str = Depends(verify_nexus_token),
) -> Dict[str, Any]:
    """Executes GPU accelerated tasks on NVIDIA A10G (24GB VRAM) ZeroGPU."""
    start_t = time.perf_counter()
    res = await asyncio.to_thread(execute_on_gpu, req.code, req.context)
    res["task_id"] = req.task_id
    res["duration_ms"] = round((time.perf_counter() - start_t) * 1000, 2)
    return res
