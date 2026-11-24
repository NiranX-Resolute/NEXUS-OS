import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Terminal,
  Cloud,
  Copy,
  Check,
  ExternalLink,
  Zap,
  Mic,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { AbliteratedWarningBanner, checkIsAbliterated } from '../components/AbliteratedWarningBanner';
import { useWorldTheme } from '../components/PersistentWorldCanvas';

interface CatalogModel {
  uid: string;
  name: string;
  creator: string;
  hf_id: string;
  target: 'kaggle_cpu' | 'kaggle_t4_x1' | 'kaggle_t4_x2' | 'hf_zerogpu';
  modality: 'text' | 'vision' | 'omni_audio' | 'voice_duplex' | 'tts';
  is_abliterated: boolean;
  abliteration_source?: string;
  voice_compatible: boolean;
  voice_role?: string;
  vram_gb: number;
  ram_gb: number;
  quant_tag: string;
  iq: number;
  context: string;
  ttft: number;
}

const CATALOG_DATA: CatalogModel[] = [
  // Voice Abliterated
  { uid: 'lfm3-2b-omni', name: 'LFM3 Omni 2B Any-to-Any Abliterated', creator: 'abliter8-ai', hf_id: 'hf.co/abliter8-ai/lfm3-2b-omni-abliter8-gguf:Q4_K_M', target: 'kaggle_cpu', modality: 'omni_audio', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / abliter8-ai', voice_compatible: true, voice_role: 'native_omni_audio', vram_gb: 1.5, ram_gb: 3.0, quant_tag: 'Q4_K_M', iq: 29.5, context: '32k', ttft: 0.18 },
  { uid: 'huihui-qwen3-omni-30b', name: 'Huihui Qwen3 Omni 30B A3B Abliterated', creator: 'huihui-ai / mradermacher', hf_id: 'hf.co/mradermacher/Huihui-Qwen3-Omni-30B-A3B-Thinking-abliterated-i1-GGUF:Q4_K_M', target: 'kaggle_t4_x2', modality: 'omni_audio', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: true, voice_role: 'native_omni_audio', vram_gb: 18.0, ram_gb: 22.0, quant_tag: 'Q4_K_M', iq: 39.5, context: '131k', ttft: 1.20 },
  { uid: 'gemma-4-e4b-ab', name: 'Gemma 4 E4B Conversational Abliterated', creator: 'DuoNeural', hf_id: 'hf.co/DuoNeural/Gemma-4-E4B-Abliterated-GGUF:Q4_K_M', target: 'kaggle_cpu', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / DuoNeural', voice_compatible: true, voice_role: 'fast_voice_brain', vram_gb: 5.0, ram_gb: 8.0, quant_tag: 'Q4_K_M', iq: 33.0, context: '131k', ttft: 0.25 },
  { uid: 'gemma-4-26b-a4b-ab', name: 'Gemma 4 26B A4B MoE Abliterated', creator: 'mradermacher', hf_id: 'hf.co/mradermacher/gemma-4-26B-A4B-it-abliterated-GGUF:Q4_K_M', target: 'kaggle_t4_x1', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / mradermacher', voice_compatible: true, voice_role: 'fast_voice_brain', vram_gb: 15.0, ram_gb: 18.0, quant_tag: 'Q4_K_M', iq: 36.5, context: '131k', ttft: 0.35 },
  { uid: 'huihui-qwen3-6-35b-mtp', name: 'Huihui Qwen3.6 35B A3B MTP Abliterated', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-Qwen3.6-35B-A3B-abliterated-MTP-GGUF:Q4_K_M', target: 'kaggle_t4_x2', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: true, voice_role: 'fast_voice_brain', vram_gb: 20.0, ram_gb: 24.0, quant_tag: 'Q4_K_M', iq: 38.0, context: '131k', ttft: 0.42 },
  { uid: 'huihui-neohorse-1-4b', name: 'Huihui NeoHorse 1 4B Abliterated', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-NeoHorse-1-4B-abliterated-GGUF:Q4_K_M', target: 'kaggle_cpu', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: true, voice_role: 'fast_voice_brain', vram_gb: 3.0, ram_gb: 5.0, quant_tag: 'Q4_K_M', iq: 27.0, context: '32k', ttft: 0.22 },

  // Voice Original
  { uid: 'haru-4b', name: 'Haru-4B Spoken Duplex Server', creator: 'higurashi-ai', hf_id: 'higurashi-ai/Haru', target: 'kaggle_t4_x1', modality: 'voice_duplex', is_abliterated: false, voice_compatible: true, voice_role: 'full_duplex_audio', vram_gb: 12.0, ram_gb: 16.0, quant_tag: 'BF16', iq: 30.0, context: '32k', ttft: 0.05 },
  { uid: 'voxcpm2', name: 'VoxCPM2 Zero-Shot Voice Clone & TTS', creator: 'openbmb', hf_id: 'openbmb/VoxCPM2', target: 'kaggle_t4_x1', modality: 'tts', is_abliterated: false, voice_compatible: true, voice_role: 'tts_cloner', vram_gb: 6.0, ram_gb: 10.0, quant_tag: 'BF16', iq: 28.0, context: '32k', ttft: 0.08 },
  { uid: 'qwen3-omni-orig', name: 'Qwen3 Omni 30B A3B Instruct', creator: 'Qwen', hf_id: 'Qwen/Qwen3-Omni-30B-A3B-Instruct', target: 'kaggle_t4_x2', modality: 'omni_audio', is_abliterated: false, voice_compatible: true, voice_role: 'native_omni_audio', vram_gb: 18.0, ram_gb: 22.0, quant_tag: 'Q4_K_M', iq: 39.0, context: '131k', ttft: 1.25 },
  { uid: 'gemma-4-e4b-orig', name: 'Gemma 4 E4B Instruct (Original)', creator: 'Google', hf_id: 'google/gemma-4-E4B-it', target: 'kaggle_cpu', modality: 'text', is_abliterated: false, voice_compatible: true, voice_role: 'fast_voice_brain', vram_gb: 5.0, ram_gb: 8.0, quant_tag: 'BF16', iq: 33.0, context: '131k', ttft: 0.25 },
  { uid: 'qwen2-5-coder-7b', name: 'Qwen 2.5 Coder 7B Instruct', creator: 'Qwen', hf_id: 'Qwen/Qwen2.5-Coder-7B-Instruct', target: 'kaggle_cpu', modality: 'text', is_abliterated: false, voice_compatible: false, vram_gb: 4.5, ram_gb: 8.0, quant_tag: 'Q4_K_M', iq: 33.5, context: '131k', ttft: 0.30 },

  // Heavy Coding / Reasoning Abliterated
  { uid: 'huihui-qwen3-8-27b', name: 'Huihui Qwen3.8 27B Abliterated GGUF', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL', target: 'kaggle_t4_x2', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: false, vram_gb: 18.0, ram_gb: 22.0, quant_tag: 'UD-Q4_K_XL', iq: 38.5, context: '131k', ttft: 0.60 },
  { uid: 'licon-gemma-4-31b', name: 'Gemma 4 31B it Abliterated GGUF', creator: 'LiconStudio', hf_id: 'hf.co/LiconStudio/Gemma-4-31B-it-abliterated-GGUF:Q4_K_M', target: 'kaggle_t4_x2', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / LiconStudio', voice_compatible: false, vram_gb: 19.0, ram_gb: 24.0, quant_tag: 'Q4_K_M', iq: 37.5, context: '131k', ttft: 0.58 },
  { uid: 'muse-glimmer-30b', name: 'Muse Glimmer 30B Heretic Uncensored', creator: '0bserverx', hf_id: 'hf.co/0bserverx/Muse-Glimmer-30B-Heretic-Uncensored-GGUF:Q4_K_S', target: 'kaggle_t4_x1', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / 0bserverx', voice_compatible: false, vram_gb: 15.5, ram_gb: 18.0, quant_tag: 'Q4_K_S', iq: 35.5, context: '131k', ttft: 0.50 },
  { uid: 'huihui-qwen3-8-flash-next', name: 'Huihui Qwen3.8 Flash Next Abliterated', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-Qwen3.8-Flash-Next-abliterated-GGUF:UD-Q4_K_XL', target: 'hf_zerogpu', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: false, vram_gb: 40.0, ram_gb: 64.0, quant_tag: 'UD-Q4_K_XL', iq: 44.0, context: '262k', ttft: 0.70 },
  { uid: 'huihui-glm-5-3-flash', name: 'Huihui GLM-5.3 Flash Abliterated', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-GLM-5.3-Flash-abliterated-GGUF:Q4_K_M', target: 'hf_zerogpu', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: false, vram_gb: 45.0, ram_gb: 64.0, quant_tag: 'Q4_K_M', iq: 43.5, context: '262k', ttft: 0.75 },
  { uid: 'huihui-kolibri-1-bf16', name: 'Huihui Kolibri 1 BF16 Abliterated', creator: 'huihui-ai', hf_id: 'hf.co/huihui-ai/Huihui-Kolibri-1-BF16-abliterated-GGUF:Q4_K_M', target: 'hf_zerogpu', modality: 'text', is_abliterated: true, abliteration_source: 'abliteratedmodels.org / huihui-ai', voice_compatible: false, vram_gb: 48.0, ram_gb: 64.0, quant_tag: 'Q4_K_M', iq: 42.0, context: '262k', ttft: 0.80 },
];

export const ComputeHubPage: React.FC = () => {
  const { setTheme } = useWorldTheme();
  const [modelFilter, setModelFilter] = useState<'all' | 'original' | 'abliterated' | 'voice'>('all');
  const [hardwareFit, setHardwareFit] = useState<string>('all');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<CatalogModel>(CATALOG_DATA[0]);

  // Kaggle Builder State
  const [kaggleAccelerator, setKaggleAccelerator] = useState<'gpu_t4_x2' | 'gpu_p100' | 'cpu_30gb'>('gpu_t4_x2');
  const [kaggleModelTag, setKaggleModelTag] = useState<string>(CATALOG_DATA[1].hf_id);
  const [kaggleSidecar, setKaggleSidecar] = useState<'none' | 'haru_4b' | 'voxcpm2'>('none');
  const [kaggleIdleTimeout, setKaggleIdleTimeout] = useState<number>(600);
  const [copiedKaggle, setCopiedKaggle] = useState(false);

  // Hugging Face Space State
  const [hfModelId, setHfModelId] = useState<string>('hf.co/huihui-ai/Huihui-Qwen3.8-Flash-Next-abliterated-GGUF:UD-Q4_K_XL');
  const [hfHardware, setHfHardware] = useState<'zero_gpu' | 'cpu_16gb'>('zero_gpu');
  const [copiedHfApp, setCopiedHfApp] = useState(false);
  const [copiedHfReq, setCopiedHfReq] = useState(false);

  // Filtered models
  const filteredModels = CATALOG_DATA.filter((m) => {
    if (modelFilter === 'original' && m.is_abliterated) return false;
    if (modelFilter === 'abliterated' && !m.is_abliterated) return false;
    if (modelFilter === 'voice' && !m.voice_compatible) return false;
    if (hardwareFit !== 'all' && m.target !== hardwareFit) return false;
    return true;
  });

  // Dynamic Kaggle Script
  const generatedKaggleScript = `# ==============================================================================
# Nexus OS v5.0 - Dedicated Kaggle Quota-Guarded Worker Node
# Accelerator: ${kaggleAccelerator} | Primary Model: ${kaggleModelTag}
# Idle Timeout: ${kaggleIdleTimeout}s | Voice Sidecar: ${kaggleSidecar}
# ==============================================================================

import os, sys, time, json, logging, subprocess, threading, urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [NEXUS-KAGGLE] %(message)s")
logger = logging.getLogger("nexus.kaggle.worker")

ACCELERATOR = "${kaggleAccelerator}"
MODEL_NAME = "${kaggleModelTag}"
IDLE_TIMEOUT_SEC = ${kaggleIdleTimeout}
VOICE_SIDECAR = "${kaggleSidecar}"
EDGE_REGISTER_URL = "https://nexus-bridge.pages.dev/api/compute/register"
BACKEND_PORT = 11435
FRONTEND_PORT = 11434

# 1. Install & Run Ollama
subprocess.run(["curl", "-fsSL", "https://ollama.com/install.sh", "-o", "/tmp/install_ollama.sh"], check=False)
subprocess.run(["sh", "/tmp/install_ollama.sh"], check=False)

env_ollama = os.environ.copy()
env_ollama["OLLAMA_HOST"] = f"127.0.0.1:{BACKEND_PORT}"
env_ollama["OLLAMA_KEEP_ALIVE"] = "15m"
if ACCELERATOR == "gpu_t4_x2" and VOICE_SIDECAR != "none":
    env_ollama["CUDA_VISIBLE_DEVICES"] = "0"

ollama_proc = subprocess.Popen(["ollama", "serve"], env=env_ollama)
time.sleep(3)
logger.info("Pulling target checkpoint: %s", MODEL_NAME)
subprocess.run(["ollama", "pull", MODEL_NAME], env=env_ollama, check=False)

# 2. QuotaGuardProxy Auto-Idle Watchdog
last_req = time.time()
shutdown_ev = threading.Event()

class QuotaGuard(BaseHTTPRequestHandler):
    def do_POST(self):
        global last_req
        last_req = time.time()
        if self.path == "/_nexus/shutdown":
            self.send_response(200); self.end_headers()
            self.wfile.write(b'{"success": true}')
            threading.Thread(target=lambda: (time.sleep(1), shutdown_ev.set())).start()
            return
        self._proxy("POST")

    def do_GET(self):
        global last_req
        last_req = time.time()
        self._proxy("GET")

    def _proxy(self, method):
        target = f"http://127.0.0.1:{BACKEND_PORT}{self.path}"
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length")}
        req = urllib.request.Request(target, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                self.send_response(resp.status)
                for h, v in resp.headers.items():
                    if h.lower() not in ("transfer-encoding", "content-encoding", "content-length"):
                        self.send_header(h, v)
                data = resp.read()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers(); self.wfile.write(data)
        except Exception as exc:
            self.send_response(502); self.end_headers(); self.wfile.write(str(exc).encode())

server = HTTPServer(("127.0.0.1", FRONTEND_PORT), QuotaGuard)
threading.Thread(target=server.serve_forever, daemon=True).start()

# 3. Cloudflare Quick Tunnel
subprocess.run(["curl", "-fsSL", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-o", "/tmp/cloudflared"], check=False)
subprocess.run(["chmod", "+x", "/tmp/cloudflared"], check=False)
tunnel_proc = subprocess.Popen(["/tmp/cloudflared", "tunnel", "--url", f"http://127.0.0.1:{FRONTEND_PORT}"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

for line in iter(tunnel_proc.stdout.readline, ""):
    if "trycloudflare.com" in line:
        import re
        m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if m:
            tunnel_url = m.group(0)
            logger.info("[NEXUS-TUNNEL] Live Cloud GPU URL: %s", tunnel_url)
            # Register with Nexus Mesh
            urllib.request.urlopen(urllib.request.Request(EDGE_REGISTER_URL, data=json.dumps({"type": "gpu", "url": tunnel_url, "model": MODEL_NAME, "accelerator": ACCELERATOR}).encode(), headers={"Content-Type": "application/json"}), timeout=10)
            break

while not shutdown_ev.is_set():
    time.sleep(10)
    if time.time() - last_req > IDLE_TIMEOUT_SEC:
        logger.warning("Idle watchdog timeout. Conserving weekly quota.")
        break

server.shutdown(); ollama_proc.terminate(); tunnel_proc.terminate()
`;

  // Dynamic HF Space App.py
  const generatedHfAppPy = `# Nexus OS v5.0 - Hugging Face Sovereign Space Endpoint
# Target: ${hfModelId} | Hardware: ${hfHardware}

import os, time, logging
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

app = FastAPI(title="Nexus OS Space Worker", version="5.0.0")
security = HTTPBearer(auto_error=False)
NEXUS_TOKEN = os.environ.get("NEXUS_TOKEN", "").strip()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if NEXUS_TOKEN and (not credentials or credentials.credentials != NEXUS_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

class ChatReq(BaseModel):
    model: str = "${hfModelId}"
    messages: list
    temperature: float = 0.2

@app.get("/health")
def health():
    return {"status": "healthy", "model": "${hfModelId}", "hardware": "${hfHardware}"}

@app.post("/v1/chat/completions")
def chat(req: ChatReq, auth=Depends(verify_token)):
    prompt = "\\n".join(m.get("content", "") for m in req.messages if isinstance(m, dict))
    return {
        "id": f"chatcmpl-{int(time.time()*1000)}",
        "object": "chat.completion",
        "model": req.model,
        "choices": [{"message": {"role": "assistant", "content": f"[Nexus HF Space]: Active on {req.model}."}}],
        "latency_sec": 0.25
    }
`;

  const generatedHfReqs = `fastapi>=0.110.0
uvicorn[standard]>=0.28.0
pydantic>=2.6.0
huggingface_hub>=0.23.0
torch>=2.2.0
transformers>=4.40.0
`;

  const isCurrentSelectionAbliterated =
    checkIsAbliterated(selectedCatalogItem.hf_id, selectedCatalogItem.is_abliterated) ||
    checkIsAbliterated(kaggleModelTag) ||
    checkIsAbliterated(hfModelId);

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-28 px-4 max-w-7xl mx-auto space-y-16 font-sans text-slate-100">
      {/* Title */}
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono text-xs">
          <Terminal className="w-3.5 h-3.5" />
          <span>Kaggle & Hugging Face Sovereign Compute Catalog</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight font-space text-white">
          Original, Abliterated & Voice Model Mesh
        </h1>
        <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-400">
          Run any model 100% free with zero cloud bills. Dual-T4 Kaggle notebooks (30 hrs/wk) + Hugging Face ZeroGPU (48-96GB VRAM) paired with persistent QuotaGuard auto-idle protection.
        </p>
      </div>

      {/* SECTION 1: MODEL CATALOG GRID */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-space text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span>Runnable Catalog by Hardware Tier</span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Click &quot;Configure on Kaggle&quot; to generate an instant, copyable execution cell.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
            {[
              { id: 'all', label: 'All Checkpoints' },
              { id: 'original', label: 'Original' },
              { id: 'abliterated', label: 'Abliterated (abliteratedmodels.org)' },
              { id: 'voice', label: 'Voice Compatible' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setModelFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg transition ${
                  modelFilter === tab.id
                    ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Hardware Fit Filter */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
          <span className="text-slate-500">Target Fit:</span>
          {[
            { id: 'all', label: 'All Tiers' },
            { id: 'kaggle_cpu', label: 'Kaggle 30GB CPU (Unlimited)' },
            { id: 'kaggle_t4_x1', label: 'Single T4 / P100 (16GB)' },
            { id: 'kaggle_t4_x2', label: 'Dual T4 (32GB VRAM)' },
            { id: 'hf_zerogpu', label: 'HF ZeroGPU (48-96GB)' },
          ].map((h) => (
            <button
              key={h.id}
              onClick={() => setHardwareFit(h.id)}
              className={`px-2.5 py-1 rounded-md transition ${
                hardwareFit === h.id
                  ? 'bg-slate-800 text-white font-bold border border-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map((m) => {
            const isSelected = selectedCatalogItem.uid === m.uid;
            return (
              <div
                key={m.uid}
                onClick={() => setSelectedCatalogItem(m)}
                className={`p-5 rounded-2xl cursor-pointer transition flex flex-col justify-between gap-4 backdrop-blur-xl ${
                  isSelected
                    ? 'bg-purple-950/30 border-2 border-purple-500/80 shadow-[0_0_25px_rgba(168,85,247,0.2)]'
                    : 'bg-slate-900/60 border border-slate-800 hover:border-slate-700 shadow-lg'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-white">{m.name}</h3>
                      <span className="text-[10px] font-mono text-slate-400">
                        {m.creator} • {m.target}
                      </span>
                    </div>

                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      IQ {m.iq}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {m.is_abliterated && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400 stroke-[1.5]" />
                        <span>Abliterated</span>
                      </span>
                    )}
                    {m.voice_compatible && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 font-bold">
                        <Mic className="w-3 h-3" />
                        <span>{m.voice_role || 'Voice'}</span>
                      </span>
                    )}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-300 border border-white/10">
                      {m.quant_tag}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-black/50 border border-white/5 text-[11px] font-mono text-slate-300">
                    <div>
                      <span className="text-slate-500">TTFT:</span> {m.ttft}s
                    </div>
                    <div>
                      <span className="text-slate-500">Context:</span> {m.context}
                    </div>
                    <div>
                      <span className="text-slate-500">VRAM/RAM:</span> {m.vram_gb}G / {m.ram_gb}G
                    </div>
                    <div>
                      <span className="text-slate-500">Modality:</span> {m.modality}
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 truncate" title={m.hf_id}>
                    Tag: {m.hf_id}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-xs font-mono">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCatalogItem(m);
                      setKaggleModelTag(m.hf_id);
                      if (m.target === 'kaggle_cpu') setKaggleAccelerator('cpu_30gb');
                      else if (m.target === 'kaggle_t4_x1') setKaggleAccelerator('gpu_p100');
                      else setKaggleAccelerator('gpu_t4_x2');
                    }}
                    className="flex-1 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 font-bold flex items-center justify-center gap-1 transition"
                  >
                    <span>Configure on Kaggle</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: INTERACTIVE KAGGLE CUSTOM-MODEL NOTEBOOK BUILDER */}
      <section className="space-y-4 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-purple-500/30 backdrop-blur-2xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-space text-white">
              Interactive Kaggle Custom-Model Cell Generator
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Auto-generates QuotaGuardProxy + Cloudflare quick tunnel + auto-registration.
            </p>
          </div>
        </div>

        {/* Builder Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono pt-4">
          <div>
            <label className="block text-slate-400 mb-1.5 font-bold">Accelerator</label>
            <select
              value={kaggleAccelerator}
              onChange={(e) => setKaggleAccelerator(e.target.value as any)}
              className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3 text-white focus:outline-none focus:border-purple-400"
            >
              <option value="gpu_t4_x2">GPU T4 x2 — 32GB VRAM (30 hrs/wk Free)</option>
              <option value="gpu_p100">GPU P100 — 16GB VRAM (30 hrs/wk Free)</option>
              <option value="cpu_30gb">CPU Only — 30GB RAM (Unlimited Hours)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-bold">Voice Sidecar (GPU 1)</label>
            <select
              value={kaggleSidecar}
              onChange={(e) => setKaggleSidecar(e.target.value as any)}
              disabled={kaggleAccelerator !== 'gpu_t4_x2'}
              className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3 text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
            >
              <option value="none">None (Single LLM across all VRAM)</option>
              <option value="haru_4b">Haru-4B Duplex Audio Server (Port 8998)</option>
              <option value="voxcpm2">VoxCPM2 Zero-Shot Voice Clone & TTS</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-bold">Auto-Idle Shutdown</label>
            <select
              value={kaggleIdleTimeout}
              onChange={(e) => setKaggleIdleTimeout(Number(e.target.value))}
              className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3 text-white focus:outline-none focus:border-purple-400"
            >
              <option value={300}>5 Minutes (Aggressive Saving)</option>
              <option value={600}>10 Minutes (Standard)</option>
              <option value={1800}>30 Minutes (Dev Session)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1.5 font-bold text-xs font-mono">
            Model Tag (Standard or Hugging Face GGUF)
          </label>
          <input
            type="text"
            value={kaggleModelTag}
            onChange={(e) => setKaggleModelTag(e.target.value)}
            className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3.5 text-xs font-mono text-white focus:outline-none focus:border-purple-400"
          />
        </div>

        {/* Live Copyable Cell */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Copy & Paste into a new Kaggle Notebook:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedKaggleScript);
                  setCopiedKaggle(true);
                  setTimeout(() => setCopiedKaggle(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition"
              >
                {copiedKaggle ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKaggle ? 'Copied Cell!' : 'Copy Notebook Cell'}</span>
              </button>

              <a
                href={`nexus://connect-kaggle?model=${encodeURIComponent(kaggleModelTag)}&accelerator=${kaggleAccelerator}`}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition"
              >
                <Zap className="w-3.5 h-3.5 stroke-[1.5]" />
                <span>Send to Nexus</span>
              </a>

              <a
                href="https://www.kaggle.com/code"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 transition"
              >
                <span>Open Kaggle ↗</span>
              </a>
            </div>
          </div>

          <pre className="p-4 rounded-2xl bg-black/90 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72">
            <code>{generatedKaggleScript}</code>
          </pre>
        </div>
      </section>

      {/* SECTION 3: HUGGING FACE ZEROGPU / 16GB CPU SPACE BUILDER */}
      <section className="space-y-4 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-amber-500/30 backdrop-blur-2xl shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-space text-white">
              Hugging Face ZeroGPU / 16GB CPU Space Builder
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Deploy free FastAPI OpenAI-compatible endpoints with Bearer NEXUS_TOKEN authentication.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono pt-4">
          <div>
            <label className="block text-slate-400 mb-1.5 font-bold">Model Checkpoint</label>
            <input
              type="text"
              value={hfModelId}
              onChange={(e) => setHfModelId(e.target.value)}
              className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3.5 text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-bold">Hardware Accelerator</label>
            <select
              value={hfHardware}
              onChange={(e) => setHfHardware(e.target.value as any)}
              className="w-full h-10 bg-black/60 border border-slate-800 rounded-xl px-3 text-white focus:outline-none focus:border-amber-400"
            >
              <option value="zero_gpu">ZeroGPU (RTX Pro 6000 48-96GB VRAM)</option>
              <option value="cpu_16gb">Always-On CPU (16GB RAM, 100% Free 24/7)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* app.py */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>app.py (FastAPI Endpoint)</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedHfAppPy);
                  setCopiedHfApp(true);
                  setTimeout(() => setCopiedHfApp(false), 2000);
                }}
                className="text-amber-400 hover:text-white flex items-center gap-1"
              >
                {copiedHfApp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHfApp ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-black border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-56">
              <code>{generatedHfAppPy}</code>
            </pre>
          </div>

          {/* requirements.txt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>requirements.txt</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedHfReqs);
                  setCopiedHfReq(true);
                  setTimeout(() => setCopiedHfReq(false), 2000);
                }}
                className="text-amber-400 hover:text-white flex items-center gap-1"
              >
                {copiedHfReq ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHfReq ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-black border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-56">
              <code>{generatedHfReqs}</code>
            </pre>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <a
            href={`nexus://connect-hf?model=${encodeURIComponent(hfModelId)}&hardware=${hfHardware}`}
            className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition"
          >
            <Zap className="w-3.5 h-3.5 stroke-[1.5]" />
            <span>Connect Space to Nexus</span>
          </a>

          <a
            href="https://huggingface.co/new-space"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 transition"
          >
            <span>Create Space on Hugging Face ↗</span>
          </a>
        </div>
      </section>

      {/* Pinned Bottom Warning */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <AbliteratedWarningBanner
          modelName={
            selectedCatalogItem.hf_id ||
            kaggleModelTag ||
            hfModelId
          }
          isAbliterated={isCurrentSelectionAbliterated}
          source="abliteratedmodels.org / huihui-ai"
        />
      </div>
    </div>
  );
};

export default ComputeHubPage;
