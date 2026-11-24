import React, { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { 
  Plus, 
  X, 
  Download, 
  Shield, 
  Terminal, 
  Cloud, 
  Cpu, 
  Database, 
  ArrowUpRight, 
  Sparkles,
  Zap,
  Lock,
  Layers,
  Radio,
  ExternalLink
} from 'lucide-react';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

// ==========================================
// Peeking Quantum Sphere on the Horizon
// ==========================================
const HorizonPeekingSphere: React.FC = () => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    meshRef.current.rotation.y = t * 0.15;
    meshRef.current.rotation.x = Math.sin(t * 0.1) * 0.1;
  });

  return (
    <group ref={meshRef} position={[0, -2.6, 0]}>
      {/* Outer Cyan Wireframe */}
      <mesh>
        <sphereGeometry args={[3.2, 32, 32]} />
        <meshBasicMaterial 
          wireframe 
          color="#00F5D4" 
          transparent 
          opacity={0.35} 
        />
      </mesh>

      {/* Inner Emerald Plasma Core */}
      <mesh>
        <sphereGeometry args={[2.8, 24, 24]} />
        <meshBasicMaterial 
          wireframe 
          color="#10B981" 
          transparent 
          opacity={0.25} 
        />
      </mesh>

      {/* Dyson Gyro Ring */}
      <mesh rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[3.8, 0.02, 16, 64]} />
        <meshBasicMaterial color="#00F5D4" transparent opacity={0.6} />
      </mesh>
    </group>
  );
};

// ==========================================
// Exact Architecture & Core Accordion FAQ Items
// Covering: Zero-Subscription Architecture, [SILENT] Air-Gap Mode,
// .nxskill Portability, and Local-First SQLite WAL Privacy
// ==========================================
interface FAQItem {
  id: string;
  category: string;
  q: string;
  a: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'zero-sub',
    category: 'INFRASTRUCTURE',
    q: 'How does the Zero-Subscription Architecture deliver enterprise power without monthly costs?',
    a: 'NEXUS OS is architected specifically around sovereign local compute and permanent free-tier edge services. Local OS actuation and AST parsing run 100% on your host CPU. For cross-device sync, we leverage Cloudflare’s permanent free tier: 5,000,000 D1 SQL reads/day, 100,000 writes/day, 10 GB R2 binary storage, and unlimited global bandwidth on Cloudflare Pages. For heavy AI synthesis, NEXUS coordinates federated Kaggle dual-T4 GPUs (30 free hours/week) and Modal Labs $30/month permanent free credits with zero credit cards required.',
  },
  {
    id: 'silent-airgap',
    category: 'RUNTIME MODE',
    q: 'What is the [SILENT] Air-Gap Mode and how does it guarantee 0 MB idle RAM?',
    a: 'In [SILENT] Air-Gap mode, NEXUS terminates all background workers and unbinds execution threads from host memory immediately after an atomic tool turn. The entire agent state is durably flushed to the local SQLite WAL file (~/.nexus-agent/db/agent_local.db), dropping resident RAM usage to true 0.00 MB. In this state, zero outbound network telemetry occurs, and all cloud sync is suspended. The agent remains in deep quiescence until woken in sub-15ms by a native Windows Win32 hotkey, file drop, or local hardware event.',
  },
  {
    id: 'nxskill-portability',
    category: 'EXTENSIBILITY',
    q: 'How does .nxskill portability work across Windows, Linux, and Cloudflare Pages?',
    a: 'An .nxskill is a self-contained, reproducible skill archive comprising a declarative YAML manifest, deterministic tool schemas, and sandboxed Python/TypeScript execution slices. Because skills communicate via standard JSON contracts, they are hot-swappable across environments with zero re-compilation. A skill author can package Win32 accessibility hooks, Kaggle GPU bridges, or custom MCP servers into a single .nxskill bundle that installs locally in 1 second via "nexus skill install <name>".',
  },
  {
    id: 'sqlite-wal-privacy',
    category: 'DATA SOVEREIGNTY',
    q: 'How does Local-First SQLite WAL Privacy safeguard codebases and sensitive data?',
    a: 'NEXUS treats your host machine as an unbreachable fortress. All conversation logs, AST syntax trees, vector embeddings, and tool transcripts are committed locally in SQLite WAL mode with immediate zero-fsync locking. Screen understanding is handled offline by native Windows WinRT OCR without cloud frame transmission. All API credentials and session cookies are encrypted using Windows DPAPI backed by your machine’s physical TPM chip. Data sovereignty is enforced at runtime by ScopeGuard under 6 strict GRAVITAS invariants.',
  },
  {
    id: 'desktop-integration',
    category: 'SYSTEM INTEGRATION',
    q: 'What are the hardware and system requirements for NEXUS OS v5.0?',
    a: 'NEXUS OS v5.0 runs on Windows 10/11 x64, with companion support for Linux (standalone AppImage) and Android (telemetry APK). Minimum requirements are 4 GB host RAM and 250 MB free disk space. No dedicated local GPU is required for core operation. Dedicated accelerators (NVIDIA RTX or local Ollama) can be plugged in instantly for local LLM inference.',
  },
];

// ==========================================
// Main FooterHorizon Component
// ==========================================
interface FooterHorizonProps {
  onOpenDownload?: () => void;
  onOpenMarketplace?: () => void;
}

export const FooterHorizon: React.FC<FooterHorizonProps> = ({ onOpenDownload, onOpenMarketplace }) => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <footer className="relative w-full bg-[#030711] pt-28 overflow-hidden border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 space-y-28 relative z-10">
        {/* ========================================================= */}
        {/* PART 1: 100% Free-Tier Sovereign Stack Strip */}
        {/* ========================================================= */}
        <div>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-500/25 text-emerald-400 font-mono text-xs mb-3">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>ZERO SUBSCRIPTION RUNTIME</span>
            </div>
            <h2 className="font-space font-extrabold text-3xl sm:text-4xl text-white tracking-tight mb-4">
              100% Free-Tier Sovereign Stack
            </h2>
            <p className="text-slate-400 text-sm sm:text-base font-light leading-relaxed">
              Eliminate recurring software rents. High-performance edge compute, local hardware security, and zero-card serverless acceleration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Tier 1: Local Host Compute */}
            <div className="spatial-glass rounded-2xl p-6 border-slate-800 hover:border-cyan-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="font-space font-bold text-white text-base mb-1">
                  Local Host Compute
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  Native Win32 UIA, stackless SQLite WAL, and 0 MB idle execution slices.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-500">Host Memory</span>
                <span className="text-cyan-400 font-bold">$0.00 / mo</span>
              </div>
            </div>

            {/* Tier 2: Cloudflare Edge Mesh */}
            <div className="spatial-glass rounded-2xl p-6 border-slate-800 hover:border-sky-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4">
                  <Cloud className="w-5 h-5" />
                </div>
                <h3 className="font-space font-bold text-white text-base mb-1">
                  Cloudflare Edge Mesh
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  Pages CDN, D1 SQLite edge database, R2 binary distribution, and KV state.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-500">Free Tier</span>
                <span className="text-sky-400 font-bold">$0.00 / mo</span>
              </div>
            </div>

            {/* Tier 3: Kaggle & Modal Free GPU */}
            <div className="spatial-glass rounded-2xl p-6 border-slate-800 hover:border-emerald-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="font-space font-bold text-white text-base mb-1">
                  Kaggle 2x T4 + Modal
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  30 hrs/wk free Kaggle dual-T4 GPUs plus $30/mo free Modal compute credits.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-500">GPU Credits</span>
                <span className="text-emerald-400 font-bold">$0.00 / mo</span>
              </div>
            </div>

            {/* Tier 4: Hardware Vault */}
            <div className="spatial-glass rounded-2xl p-6 border-slate-800 hover:border-purple-500/30 transition-all flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="font-space font-bold text-white text-base mb-1">
                  DPAPI Hardware Vault
                </h3>
                <p className="text-slate-400 text-xs leading-relaxed mb-4">
                  Windows TPM hardware-backed key derivation. Zero cloud key leaks.
                </p>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-500">TPM Enclave</span>
                <span className="text-purple-400 font-bold">$0.00 / mo</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* PART 2: Interactive Architecture & FAQ Accordion */}
        {/* ========================================================= */}
        <div id="faq" className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 font-mono text-xs mb-3">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>CORE ARCHITECTURE & TELEMETRY</span>
            </div>
            <h2 className="font-space font-extrabold text-3xl sm:text-4xl text-white tracking-tight mb-3">
              Architecture & Invariants FAQ
            </h2>
            <p className="text-slate-400 text-sm font-light">
              Clear technical explanations of zero-subscription topology, air-gap execution, and cryptographic containment.
            </p>
          </div>

          <div className="space-y-4">
            {FAQS.map((faq, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div
                  key={faq.id}
                  className={`rounded-2xl transition-all duration-300 ${
                    isOpen
                      ? 'spatial-glass-cyan border-cyan-500/40 shadow-[0_0_25px_rgba(0,245,212,0.12)]'
                      : 'spatial-glass border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
                  >
                    <div className="space-y-1">
                      <span className="font-mono text-[10px] text-cyan-400 uppercase tracking-widest block">
                        {faq.category}
                      </span>
                      <h3 className="font-space font-semibold text-base sm:text-lg text-white">
                        {faq.q}
                      </h3>
                    </div>
                    <div className={`p-2 rounded-xl transition-all shrink-0 ${isOpen ? 'bg-cyan-500/20 text-cyan-400 rotate-45' : 'bg-slate-900 text-slate-400'}`}>
                      <Plus className="w-4 h-4 transition-transform duration-300" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 sm:px-6 pb-6 pt-0 text-slate-300 text-sm leading-relaxed font-sans border-t border-slate-800/60 mt-2">
                      <p className="pt-3">{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PART 3: Radial Cyan-Horizon Footer & Peeking 3D Sphere */}
      {/* ========================================================= */}
      <div className="relative mt-32 pt-24 pb-12 w-full overflow-hidden border-t border-cyan-500/20">
        {/* Horizon Glow Arc */}
        <div className="absolute inset-0 cyan-horizon-glow pointer-events-none" />

        {/* 3D Peeking Quantum Sphere Canvas */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[360px] pointer-events-none opacity-40">
          <Canvas camera={{ position: [0, 0, 5], fov: 50 }} gl={{ alpha: true }}>
            <ambientLight intensity={0.5} />
            <pointLight position={[5, 5, 5]} intensity={1} color="#00F5D4" />
            <pointLight position={[-5, -5, 5]} intensity={0.8} color="#10B981" />
            <HorizonPeekingSphere />
          </Canvas>
        </div>

        {/* Foreground Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono text-xs mb-4">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>SOVEREIGN COMPUTING REDEFINED</span>
          </div>

          <h2 className="font-space font-extrabold text-3xl sm:text-5xl lg:text-6xl text-white tracking-tight mb-6 max-w-3xl mx-auto">
            Take Command of Your Operating System.
          </h2>

          <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto mb-10 font-light">
            Zero telemetry. Zero subscriptions. 0 MB idle execution slices. Deploy today on Windows, Linux, and Cloudflare Pages.
          </p>

          {/* Magnetic CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-20">
            <a
              href="/download"
              onClick={(e) => {
                if (window.location.pathname !== '/download') {
                  e.preventDefault();
                  window.history.pushState({}, '', '/download');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                if (onOpenDownload) onOpenDownload();
              }}
              className="group px-8 py-4 rounded-2xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-space font-bold text-sm tracking-wide uppercase transition-all duration-300 shadow-[0_0_35px_rgba(0,245,212,0.45)] hover:shadow-[0_0_50px_rgba(0,245,212,0.7)] flex items-center gap-3 cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
              <span>Download NEXUS OS v5.0</span>
            </a>

            <button
              onClick={onOpenMarketplace}
              className="px-8 py-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 font-space font-medium text-sm transition-all duration-300 backdrop-blur-md flex items-center gap-2.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Explore .nxskill Marketplace</span>
            </button>

            <a
              href="https://github.com/NiranX-Resolute/NEXUS-OS"
              target="_blank"
              rel="noreferrer"
              className="px-8 py-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/40 text-slate-200 font-space font-medium text-sm transition-all duration-300 backdrop-blur-md flex items-center gap-2.5"
            >
              <GithubIcon className="w-4 h-4 text-cyan-400" />
              <span>Source Repository</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
          </div>

          {/* Bottom Copyright & Telemetry Metadata */}
          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-400 gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="text-slate-300 font-semibold">NEXUS OS v5.0</span>
              <span className="text-slate-600">•</span>
              <span>Sovereign Edge-to-Desktop Runtime</span>
            </div>

            <div className="text-slate-400">
              Architected & Built by{' '}
              <a 
                href="https://github.com/NiranX-Resolute" 
                target="_blank" 
                rel="noreferrer" 
                className="text-cyan-400 hover:underline font-semibold"
              >
                NiranX-Resolute
              </a>
              {' '}(<a href="https://github.com/NiranX-Resolute/NEXUS-OS" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-cyan-300">NEXUS-OS</a>)
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="text-emerald-400">0 MB IDLE RAM</span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400">CLOUDFLARE PAGES EDGE</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
