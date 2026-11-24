"""Nexus OS v5.0 - Hugging Face Space Cloud Worker Application.

Universal entrypoint:
- Serves interactive Gradio Dashboard at `/` for browser visitors.
- Mounts FastAPI REST API endpoints at `/health`, `/v1/scout/fetch`, and `/v1/slice/execute`.
"""

from __future__ import annotations

import io
import json
import logging
import os
import sys
import time
import traceback
from typing import Any, Dict

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

from bs4 import BeautifulSoup
try:
    import gradio as gr
    HAS_GRADIO = True
except ImportError:
    gr = None
    HAS_GRADIO = False
import httpx
import psutil

from worker_api import START_TIME, app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [HF-SPACE-APP] %(message)s",
)
logger = logging.getLogger("nexus.worker.app")


def get_telemetry() -> Dict[str, Any]:
    """Generates snapshot of CPU, RAM, and uptime telemetry for Gradio dashboard."""
    mem = psutil.virtual_memory()
    return {
        "status": "ONLINE & FEDERATED",
        "worker_type": "Hugging Face Space 16GB CPU Node",
        "cpu_usage": f"{psutil.cpu_percent(interval=None)}%",
        "cpu_cores": os.cpu_count() or 2,
        "ram_total": f"{round(mem.total / (1024**3), 2)} GB",
        "ram_used": f"{round(mem.used / (1024**3), 2)} GB",
        "ram_available": f"{round(mem.available / (1024**3), 2)} GB",
        "ram_percent": f"{mem.percent}%",
        "uptime": f"{round(time.time() - START_TIME, 1)} seconds",
    }


async def ui_scout_fetch(url: str, selector: str, extract_links: bool) -> str:
    """Interactive scout scraping demonstration within Gradio interface."""
    if not url or not url.strip():
        return "Error: Please enter a target URL."

    clean_url = url.strip()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Nexus-OS-Scout/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(clean_url, headers=headers)
            resp.raise_for_status()
            html_content = resp.text
    except Exception as exc:
        return f"Fetch error: {exc}"

    soup = BeautifulSoup(html_content, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.extract()

    title = soup.title.string.strip() if soup.title and soup.title.string else "No Title Found"
    main_text = soup.get_text(separator="\n", strip=True)

    links_summary = []
    if extract_links:
        for a in soup.find_all("a", href=True)[:15]:
            href = a["href"].strip()
            anchor = a.get_text(strip=True) or "[Link]"
            links_summary.append(f"- {anchor}: {href}")

    preview_text = main_text[:2500] + ("\n...[Preview truncated]" if len(main_text) > 2500 else "")
    links_block = "\n".join(links_summary) if links_summary else "No links extracted"

    return f"PAGE TITLE: {title}\n\nCONTENT EXTRACT:\n{preview_text}\n\nFOUND HYPERLINKS:\n{links_block}"


def ui_slice_execute(code_str: str) -> str:
    """Interactive slice code runner for testing execution."""
    if not code_str or not code_str.strip():
        return "Error: Please supply python code."

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    buf_out = io.StringIO()
    buf_err = io.StringIO()

    exec_locals: Dict[str, Any] = {}
    try:
        sys.stdout = buf_out
        sys.stderr = buf_err
        exec(code_str, {"__builtins__": __builtins__, "json": json, "time": time}, exec_locals)
        output = buf_out.getvalue()
        err_out = buf_err.getvalue()
        result = exec_locals.get("result", exec_locals.get("output", "Completed without result variable."))
        return f"EXECUTION RESULT:\n{result}\n\nSTDOUT:\n{output}\nSTDERR:\n{err_out}"
    except Exception:
        return f"Execution Exception:\n{traceback.format_exc()}"
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


@spaces.GPU(duration=120)
def ui_gpu_benchmark(tensor_size: int = 4096) -> str:
    """ZeroGPU benchmark running on NVIDIA A10G Tensor Core."""
    try:
        import torch
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"

        t0 = time.perf_counter()
        x = torch.randn(tensor_size, tensor_size, device=device)
        y = torch.matmul(x, x)
        if torch.cuda.is_available():
            torch.cuda.synchronize()
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        vram_alloc = round(torch.cuda.memory_allocated() / (1024**2), 2) if torch.cuda.is_available() else 0

        return (
            f"DEVICE: {device_name} ({device})\n"
            f"TENSOR SHAPE: [{tensor_size}, {tensor_size}]\n"
            f"MATRIX MULTIPLICATION TIME: {elapsed_ms} ms\n"
            f"VRAM ALLOCATED: {vram_alloc} MB"
        )
    except Exception as e:
        return f"ZeroGPU Execution Note: {e}"


# Build Gradio UI if gradio is available
demo = None
if HAS_GRADIO and gr is not None:
    with gr.Blocks(title="Nexus OS Cloud Worker", theme=gr.themes.Base()) as demo:
        gr.Markdown("# ⚡ Nexus OS v5.0 — Federated Cloud Worker")
        gr.Markdown("Always-On 16GB RAM CPU & Offloaded Compute Infrastructure for Nexus OS.")

        with gr.Tab("System Telemetry"):
            telemetry_display = gr.JSON(value=get_telemetry)
            refresh_button = gr.Button("🔄 Refresh Telemetry")
            refresh_button.click(fn=get_telemetry, outputs=telemetry_display)

        with gr.Tab("⚡ ZeroGPU (NVIDIA A10G)"):
            gr.Markdown("### 🚀 Free On-Demand NVIDIA A10G (24GB VRAM) ZeroGPU Allocation")
            tensor_input = gr.Slider(minimum=1024, maximum=8192, value=4096, step=1024, label="Matrix Size (N x N)")
            gpu_bench_btn = gr.Button("⚡ Run ZeroGPU Benchmark", variant="primary")
            gpu_bench_out = gr.Textbox(label="ZeroGPU Output", lines=6)
            gpu_bench_btn.click(fn=ui_gpu_benchmark, inputs=[tensor_input], outputs=gpu_bench_out)

        with gr.Tab("SCOUT-01 Web Extraction"):
            url_input = gr.Textbox(label="Target URL", value="https://example.com")
            selector_input = gr.Textbox(label="CSS Selector (Optional)", value="")
            extract_links_check = gr.Checkbox(label="Extract Links", value=True)
            fetch_button = gr.Button("Scout Extract")
            fetch_output = gr.Textbox(label="Extraction Result", lines=12)
            fetch_button.click(
                fn=ui_scout_fetch,
                inputs=[url_input, selector_input, extract_links_check],
                outputs=fetch_output,
            )

        with gr.Tab("InfinitySliceEngine Compute"):
            code_input = gr.Textbox(
                label="Python Slice Code",
                value="result = sum(i**2 for i in range(10000))\nprint('Computed square sum successfully!')",
                lines=5,
            )
            run_button = gr.Button("Execute Compute Task")
            run_output = gr.Textbox(label="Compute Output", lines=8)
            run_button.click(fn=ui_slice_execute, inputs=[code_input], outputs=run_output)

        with gr.Tab("API Endpoints & Documentation"):
            gr.Markdown(
                """
                ### Available REST API Endpoints:
                - **`GET /health`** - System resource status & CPU/RAM metrics
                - **`POST /v1/scout/fetch`** - Asynchronous web scraping & DOM parsing (SCOUT-01)
                - **`POST /v1/slice/execute`** - Stateless InfinitySliceEngine task execution
                - **`POST /v1/gpu/execute`** - Stateless NVIDIA A10G ZeroGPU compute execution

                ### Authentication:
                All POST endpoints require `Authorization: Bearer <NEXUS_TOKEN>`.
                """
            )

    # Enable Gradio queue (required for ZeroGPU dynamic allocation)
    demo.queue()
    # Mount Gradio dashboard directly on FastAPI root
    app = gr.mount_gradio_app(app, demo, path="/", ssr_mode=False)
else:
    logger.info("Running in headless REST mode (Gradio not installed).")

if __name__ == "__main__":
    from worker_api import notify_zerogpu_startup
    notify_zerogpu_startup()
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
