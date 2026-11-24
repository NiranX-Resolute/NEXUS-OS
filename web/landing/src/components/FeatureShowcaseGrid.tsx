import React, { useState } from 'react';
import { 
  Laptop, 
  Cpu, 
  CloudLightning, 
  Globe2, 
  Mic2, 
  ShieldCheck, 
  CheckCircle2, 
  Sliders, 
  Terminal, 
  Zap, 
  Lock, 
  FileCode, 
  Layers, 
  Sparkles, 
  Database, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  Power 
} from 'lucide-react';

interface PillarTab {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badge: string;
}

const PILLARS: PillarTab[] = [
  {
    id: 'notch',
    name: 'Dynamic Stealth Notch HUD',
    subtitle: 'Win32 HWND Ambient Pill',
    icon: Laptop,
    accentColor: '#00F5D4',
    badge: 'WIN32 UIA REFLEX',
  },
  {
    id: 'swarm',
    name: 'Self-Multiplying Ephemeral Swarm',
    subtitle: '0 MB Idle RAM Stackless Slices',
    icon: Cpu,
    accentColor: '#10B981',
    badge: '0 MB IDLE RAM',
  },
  {
    id: 'mesh',
    name: 'Federated Free-Tier GPU Mesh',
    subtitle: 'Kaggle 2x T4 + Haru-4B',
    icon: CloudLightning,
    accentColor: '#38BDF8',
    badge: 'ZERO-SUBSCRIPTION',
  },
  {
    id: 'obscura',
    name: 'Dual-Engine Obscura Browser',
    subtitle: 'Rust CDP + Persistent Profiles',
    icon: Globe2,
    accentColor: '#A855F7',
    badge: 'STEALTH CDP',
  },
  {
    id: 'tars',
    name: 'TARS Duplex Voice Pipeline',
    subtitle: '<15ms Barge-In + WASAPI Loopback',
    icon: Mic2,
    accentColor: '#F59E0B',
    badge: '<15MS BARGE-IN',
  },
  {
    id: 'security',
    name: 'Windows DPAPI + GRAVITAS Enclave',
    subtitle: '6 Invariants + Hardware Vault',
    icon: ShieldCheck,
    accentColor: '#EF4444',
    badge: 'DPAPI TPM VAULT',
  },
];

export const FeatureShowcaseGrid: React.FC = () => {
  const [activePillar, setActivePillar] = useState<string>('notch');

  // Pillar 1 State: Notch
  const [notchExpanded, setNotchExpanded] = useState(false);
  const [hitlApproval, setHitlApproval] = useState<'PENDING' | 'ALLOWED' | 'DENIED'>('PENDING');
  const [gameModeActive, setGameModeActive] = useState(false);

  // Pillar 2 State: Swarm
  const [activeWorkers, setActiveWorkers] = useState<number>(1);
  const [isQuiescent, setIsQuiescent] = useState(true);

  // Pillar 3 State: Mesh
  const [gpuTarget, setGpuTarget] = useState<'KAGGLE' | 'MODAL' | 'LOCAL'>('KAGGLE');

  // Pillar 4 State: Obscura
  const [browserMode, setBrowserMode] = useState<'RUST_CDP' | 'PERSISTENT_PROFILE'>('RUST_CDP');

  // Pillar 5 State: TARS Voice
  const [candorLevel, setCandorLevel] = useState(92);
  const [humorLevel, setHumorLevel] = useState(65);
  const [isVoiceActive, setIsVoiceActive] = useState(true);

  // Pillar 6 State: Security
  const [eStopTriggered, setEStopTriggered] = useState(false);
  const [keyRotated, setKeyRotated] = useState(false);

  const currentTab = PILLARS.find((p) => p.id === activePillar) || PILLARS[0];

  return (
    <section id="features" className="relative w-full py-28 px-4 sm:px-8 bg-[#030711] overflow-hidden border-t border-slate-900">
      {/* Dynamic ambient radial lighting */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[720px] h-[360px] blur-[150px] pointer-events-none rounded-full transition-colors duration-700 opacity-20"
        style={{ backgroundColor: currentTab.accentColor }}
      />

      <div className="max-w-6xl mx-auto space-y-16 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 font-mono text-xs mb-4">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>THE 6 ARCHITECTURAL PILLARS</span>
          </div>
          <h2 className="font-space font-black text-3xl sm:text-5xl text-white tracking-tight mb-4">
            Sovereign OS Intelligence Grid
          </h2>
          <p className="text-slate-400 text-sm sm:text-base font-light leading-relaxed">
            Zero third-party subscriptions. Zero cloud telemetry. Click through the 6 core pillars that run directly on your hardware and edge mesh.
          </p>
        </div>

        {/* 6-Pillar Tab Selector */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            const isSelected = activePillar === pillar.id;
            return (
              <button
                key={pillar.id}
                onClick={() => setActivePillar(pillar.id)}
                className={`p-4 rounded-2xl text-left transition-all duration-300 cursor-pointer flex flex-col justify-between relative overflow-hidden group ${
                  isSelected
                    ? 'bg-slate-900/90 border shadow-lg scale-[1.02]'
                    : 'bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40'
                }`}
                style={{
                  borderColor: isSelected ? pillar.accentColor : undefined,
                  boxShadow: isSelected ? `0 0 25px -5px ${pillar.accentColor}35` : undefined,
                }}
              >
                {/* Active tab top glow line */}
                {isSelected && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: pillar.accentColor }}
                  />
                )}

                <div className="flex items-center justify-between mb-3">
                  <div 
                    className="p-2.5 rounded-xl transition-colors"
                    style={{
                      backgroundColor: `${pillar.accentColor}18`,
                      color: pillar.accentColor,
                    }}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: isSelected ? pillar.accentColor : '#334155',
                      boxShadow: isSelected ? `0 0 8px ${pillar.accentColor}` : undefined,
                    }}
                  />
                </div>

                <div>
                  <h3 className="font-space font-bold text-xs sm:text-sm text-white line-clamp-2 mb-1 group-hover:text-cyan-300 transition-colors">
                    {pillar.name}
                  </h3>
                  <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider block">
                    {pillar.badge}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Interactive Deep-Dive Viewport */}
        <div className="spatial-glass rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
          {/* Subtle grid backdrop */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#081b2e_1px,transparent_1px),linear-gradient(to_bottom,#081b2e_1px,transparent_1px)] bg-[size:24px_24px] opacity-20 pointer-events-none" />

          {/* ================================================================= */}
          {/* PILLAR 1: Dynamic Stealth Notch HUD */}
          {/* ================================================================= */}
          {activePillar === 'notch' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono text-[10px] mb-2">
                    <Laptop className="w-3 h-3 text-cyan-400" />
                    <span>NATIVE WIN32 TOP-EDGE AMBIENT HUD</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    Dynamic Stealth Notch HUD
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    An ambient top-screen pill providing instant spatial telemetry, cancel-safe file staging, and 1-tap Human-In-The-Loop execution approvals.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">RENDER OVERHEAD</span>
                    <span className="text-cyan-300 font-bold">0 FPS DROP</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">GAME AUTO-HIDE</span>
                    <span className="text-emerald-400 font-bold">SHQuery Safe</span>
                  </div>
                </div>
              </div>

              {/* Interactive Simulation Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                {/* Left: Interactive Simulated Notch Screen Bezel */}
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-between min-h-[340px] relative overflow-hidden">
                  {/* Top Screen Bezel with Notch */}
                  <div className="w-full flex justify-center relative">
                    {/* The Dynamic Notch Pill */}
                    <div 
                      onClick={() => setNotchExpanded(!notchExpanded)}
                      className={`cursor-pointer transition-all duration-300 rounded-b-2xl bg-[#081220] border-x border-b border-cyan-400/50 shadow-[0_0_25px_rgba(0,245,212,0.25)] flex flex-col items-center justify-center p-3 select-none ${
                        notchExpanded ? 'w-[90%] max-w-md h-40' : 'w-48 h-8'
                      }`}
                    >
                      {!notchExpanded ? (
                        <div className="flex items-center gap-2 font-mono text-xs text-cyan-300">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          <span className="font-bold">NX READY</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-[10px] text-slate-400">0 MB IDLE</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col justify-between text-xs font-mono">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                            <span className="text-cyan-300 font-semibold">HUMAN APPROVAL GATE</span>
                            <span className="text-amber-400">MUTATION PENDING</span>
                          </div>
                          <div className="text-[11px] text-slate-300 py-1">
                            Script requesting write to <code className="text-cyan-300">C:/Users/Repo/build.py</code>
                          </div>
                          <div className="flex items-center gap-2 mt-auto">
                            <button
                              onClick={(e) => { e.stopPropagation(); setHitlApproval('ALLOWED'); }}
                              className="flex-1 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] uppercase shadow cursor-pointer"
                            >
                              Allow (1-Tap)
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setHitlApproval('DENIED'); }}
                              className="flex-1 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase shadow cursor-pointer"
                            >
                              Deny
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle Workstation Canvas Prompt */}
                  <div className="my-6 text-center text-xs font-mono text-slate-500">
                    {notchExpanded ? 'Click notch pill to collapse.' : 'Click the top notch to expand approval shelf.'}
                  </div>

                  {/* Bottom Controls */}
                  <div className="w-full flex items-center justify-between pt-4 border-t border-slate-900 font-mono text-xs">
                    <button
                      onClick={() => setGameModeActive(!gameModeActive)}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer ${
                        gameModeActive
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      Fullscreen Game Sim: {gameModeActive ? 'SUPPRESSED (Hidden)' : 'DESKTOP (Visible)'}
                    </button>

                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <span>Last Action: </span>
                      <span className={`font-bold ${
                        hitlApproval === 'ALLOWED' ? 'text-emerald-400' :
                        hitlApproval === 'DENIED' ? 'text-red-400' : 'text-slate-400'
                      }`}>
                        {hitlApproval}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Technical Features List */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Fullscreen Game Auto-Hide
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Hooks into <code className="text-cyan-300 font-mono">SHQueryUserNotificationState</code> to instantly yield screen priority when playing DirectX/Vulkan games or presenting full-screen slides.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Cancel-Safe File Shelf
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Drag code files, audio recordings, or PDFs straight to the notch. Staged in memory-safe local tempwork without triggering external cloud uploads.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Zero-Stall Win32 HWND
                    </h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Isolated layered Win32 window process with <code className="text-cyan-300 font-mono">WS_EX_TOPMOST</code> and mouse-through click transparent bounds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* PILLAR 2: Self-Multiplying Ephemeral Swarm */}
          {/* ================================================================= */}
          {activePillar === 'swarm' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] mb-2">
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    <span>STACKLESS EXECUTION SLICES & LOCAL WAL</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    Self-Multiplying Ephemeral Swarm
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    Sub-agents spawn dynamically on demand, execute atomic tool actions against local SQLite WAL, and completely free host RAM between turns.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">IDLE HOST MEMORY</span>
                    <span className="text-emerald-400 font-bold">0.00 MB RAM</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">STATE ENGINE</span>
                    <span className="text-cyan-300 font-bold">SQLite WAL</span>
                  </div>
                </div>
              </div>

              {/* Swarm Interactive Sandbox */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 space-y-6">
                  {/* Active Workers Control */}
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-300">Active Orbiters in Swarm:</span>
                    <div className="flex items-center gap-2">
                      {[1, 3, 5].map((num) => (
                        <button
                          key={num}
                          onClick={() => { setActiveWorkers(num); setIsQuiescent(false); }}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            activeWorkers === num && !isQuiescent
                              ? 'bg-emerald-500 text-slate-950 font-bold'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          {num} Worker{num > 1 ? 's' : ''}
                        </button>
                      ))}
                      <button
                        onClick={() => setIsQuiescent(true)}
                        className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                          isQuiescent
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Idle Sleep (0 MB)
                      </button>
                    </div>
                  </div>

                  {/* Worker Cards Visualization */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {['DEV-01 (AST Engine)', 'SCOUT-01 (Rust CDP)', 'SEC-01 (Sentinel)'].slice(0, isQuiescent ? 1 : activeWorkers).map((worker, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 font-mono text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-bold">{worker.split(' ')[0]}</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        </div>
                        <span className="text-[10px] text-slate-400 block">{worker.split(' ')[1]}</span>
                        <div className="mt-3 pt-2 border-t border-slate-800 text-[9px] text-emerald-400">
                          {isQuiescent ? 'QUIESCENT SLEEP (0 MB)' : 'ACTIVE TURN EXECUTION'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Live SQLite WAL Stream simulation */}
                  <div className="p-4 rounded-xl bg-black/80 border border-slate-800/80 font-mono text-[11px] space-y-1.5">
                    <div className="text-slate-500">// ~/.nexus-agent/db/agent_local.db-wal</div>
                    <div className="text-cyan-300">
                      {isQuiescent ? '&gt; [STATE DUMPED TO WAL]: Threads detached. 0 MB active memory.' : `&gt; [TICK ACTIVE]: ${activeWorkers} orbiters dispatched across worktree.`}
                    </div>
                    <div className="text-slate-400">
                      &gt; SQLite WAL checkpoint: PASS (0 uncommitted transactions)
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 font-sans text-xs text-slate-300">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Stackless Thread Reaping
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Instead of keeping heavyweight Node or Python daemons awake eating 500 MB of RAM, the runtime unbinds memory structures after each turn and yields cycles back to the OS.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Instant &lt;15ms Wakeup
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Native Windows Event Handles and global keyboard hooks trigger rapid memory map restoration directly from the local SQLite write-ahead log.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* PILLAR 3: Federated Free-Tier GPU Mesh */}
          {/* ================================================================= */}
          {activePillar === 'mesh' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-950/60 border border-sky-500/30 text-sky-400 font-mono text-[10px] mb-2">
                    <CloudLightning className="w-3 h-3 text-sky-400" />
                    <span>ZERO-SUBSCRIPTION FEDERATED COMPUTE</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    Federated Free-Tier GPU Mesh
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    Harness dual Kaggle 2x T4 GPUs and Haru-4B edge distillation combined with Modal Labs $30/month permanent credits for $0/mo model synthesis.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">CARD REQUIRED</span>
                    <span className="text-emerald-400 font-bold">$0.00 / NO CARD</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">KAGGLE GPU QUOTA</span>
                    <span className="text-sky-300 font-bold">30 HRS / WK</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 space-y-6">
                  {/* Compute Node Selector */}
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-300">Route Execution Target:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setGpuTarget('KAGGLE')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          gpuTarget === 'KAGGLE'
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Kaggle 2x T4
                      </button>
                      <button
                        onClick={() => setGpuTarget('MODAL')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          gpuTarget === 'MODAL'
                            ? 'bg-purple-500 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Modal Labs ($30 Free)
                      </button>
                      <button
                        onClick={() => setGpuTarget('LOCAL')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          gpuTarget === 'LOCAL'
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Local Haru-4B
                      </button>
                    </div>
                  </div>

                  {/* Node Spec Card */}
                  <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>ACCELERATOR SPEC:</span>
                      <span className="text-sky-300 font-bold">
                        {gpuTarget === 'KAGGLE' && '2x NVIDIA Tesla T4 (32 GB VRAM)'}
                        {gpuTarget === 'MODAL' && 'NVIDIA A10G / L4 Ephemeral Container'}
                        {gpuTarget === 'LOCAL' && 'Haru-4B INT4 CPU/NPU Quantized'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>COST PER MONTH:</span>
                      <span className="text-emerald-400 font-bold">$0.00 (Permanent Free Tier)</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span>ROUNDTRIP LATENCY:</span>
                      <span className="text-cyan-300 font-bold">
                        {gpuTarget === 'KAGGLE' && '~180ms'}
                        {gpuTarget === 'MODAL' && '~95ms'}
                        {gpuTarget === 'LOCAL' && '< 40ms'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/60 border border-slate-800 font-mono text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Autonomous Failover Mesh Routing:</span>
                    <span className="text-emerald-400 font-bold">ONLINE</span>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 text-xs font-sans text-slate-300">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Kaggle Dual-T4 Swarm
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Executes heavy batch AST refactoring, deep research embedding pipelines, and synthesis completely on Kaggle&apos;s generous free 30-hour weekly allowance.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Haru-4B On-Device Distillation
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      When completely severed from the internet, NEXUS falls back to an ultra-compact quantized Haru-4B model running 100% locally on your CPU threads.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* PILLAR 4: Dual-Engine Obscura Stealth Browser */}
          {/* ================================================================= */}
          {activePillar === 'obscura' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-400 font-mono text-[10px] mb-2">
                    <Globe2 className="w-3 h-3 text-purple-400" />
                    <span>RUST HEADLESS CDP & PERSISTENT SESSION PROFILES</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    Dual-Engine Obscura Stealth Browser
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    Stealth browser automation that uses your real Chrome profiles or headless Rust CDP without bot challenge triggers or credential leaks.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">CLOUDFLARE TURNSTILE</span>
                    <span className="text-emerald-400 font-bold">100% BYPASS</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">SESSION PROFILE</span>
                    <span className="text-purple-300 font-bold">DPAPI COOKIES</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 space-y-6">
                  {/* Mode Switcher */}
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-slate-300">Obscura Engine Mode:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBrowserMode('RUST_CDP')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          browserMode === 'RUST_CDP'
                            ? 'bg-purple-500 text-white font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Headless Rust CDP
                      </button>
                      <button
                        onClick={() => setBrowserMode('PERSISTENT_PROFILE')}
                        className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                          browserMode === 'PERSISTENT_PROFILE'
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 border border-slate-800'
                        }`}
                      >
                        Persistent Chrome Session
                      </button>
                    </div>
                  </div>

                  {/* DOM Distillation Console */}
                  <div className="p-4 rounded-xl bg-black/80 border border-slate-800 font-mono text-[11px] space-y-2">
                    <div className="flex items-center justify-between text-slate-500 border-b border-slate-800 pb-1.5">
                      <span>obscura-engine.sys // TARGET: developer.mozilla.org</span>
                      <span className="text-emerald-400">STATUS 200 OK</span>
                    </div>
                    <div className="text-purple-300">
                      {browserMode === 'RUST_CDP'
                        ? '&gt; Injected Rust CDP hooks: WebGL Noise Masked • Navigator.webdriver = undefined'
                        : '&gt; Mounted local Chrome User Profile: Preserved session cookies (0 MFA prompts)'}
                    </div>
                    <div className="text-slate-400">
                      &gt; Distilled 4,210 DOM nodes into 180 clean markdown tokens in 64ms.
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-500 block text-[10px] mb-0.5">FINGERPRINT MASK</span>
                      <span className="text-emerald-400 font-bold">100% Canvas Spoofed</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                      <span className="text-slate-500 block text-[10px] mb-0.5">EXTRACTION SPEED</span>
                      <span className="text-purple-300 font-bold">&lt; 85ms Per Page</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 text-xs font-sans text-slate-300">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Zero-Proxy Direct Scrapes
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Reuses your authenticated browser credentials securely on local disk so you never have to enter passwords into third-party cloud browser scrapers.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      DOM Markdown Token Compression
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Strips telemetry scripts, ads, and bloated styles in memory before passing content to agent reasoning loops, reducing context consumption by 92%.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* PILLAR 5: TARS Duplex Voice Pipeline */}
          {/* ================================================================= */}
          {activePillar === 'tars' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-950/60 border border-amber-500/30 text-amber-400 font-mono text-[10px] mb-2">
                    <Mic2 className="w-3 h-3 text-amber-400" />
                    <span>WASAPI LOOPBACK AUDIO & 4-TIER ANTI-ECHO</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    TARS Duplex Voice Pipeline
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    Real-time bidirectional duplex speech with sub-15ms barge-in interruption and calibrated personality parameters.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">BARGE-IN LATENCY</span>
                    <span className="text-amber-400 font-bold">&lt; 15 ms</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">ECHO CANCELLATION</span>
                    <span className="text-emerald-400 font-bold">4-Tier WASAPI</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 space-y-6">
                  {/* Visualizer & Mic State */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-full border ${isVoiceActive ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                        <Mic2 className={`w-5 h-5 ${isVoiceActive ? 'animate-pulse' : ''}`} />
                      </div>
                      <div>
                        <div className="font-mono text-xs text-white font-bold">WASAPI Capture Channel</div>
                        <span className="font-mono text-[10px] text-emerald-400">48,000 Hz • 16-Bit PCM Float</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsVoiceActive(!isVoiceActive)}
                      className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold cursor-pointer ${
                        isVoiceActive ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isVoiceActive ? 'Live Audio ON' : 'Muted'}
                    </button>
                  </div>

                  {/* Spectral Audio Bar Visualizer */}
                  <div className="flex items-end justify-center gap-1.5 h-16 py-1">
                    {[35, 60, 85, 45, 95, 75, 90, 55, 40, 88, 70, 98, 65, 80, 50, 40].map((h, i) => (
                      <div
                        key={i}
                        className={`w-2.5 rounded-t transition-all duration-150 ${
                          isVoiceActive
                            ? 'bg-gradient-to-t from-amber-500 to-amber-300'
                            : 'bg-slate-800'
                        }`}
                        style={{ height: isVoiceActive ? `${h}%` : '15%' }}
                      />
                    ))}
                  </div>

                  {/* Candor & Humor Sliders */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between font-mono text-xs text-slate-300 mb-1">
                        <span>Candor Parameter</span>
                        <span className="text-amber-400 font-bold">{candorLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        value={candorLevel}
                        onChange={(e) => setCandorLevel(Number(e.target.value))}
                        className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-mono text-xs text-slate-300 mb-1">
                        <span>Humor Parameter</span>
                        <span className="text-cyan-400 font-bold">{humorLevel}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={humorLevel}
                        onChange={(e) => setHumorLevel(Number(e.target.value))}
                        className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 text-xs font-sans text-slate-300">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      True Barge-In Interruption
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Speak over TARS at any millisecond. The duplex audio buffer instantly halts synthesis output and redirects attention to your incoming utterance in under 15ms.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      WASAPI Loopback Capture
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      Captures system sound directly from the Windows audio driver without virtual audio cable drivers or physical mic bleed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* PILLAR 6: Windows DPAPI + GRAVITAS Security Enclave */}
          {/* ================================================================= */}
          {activePillar === 'security' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-950/60 border border-red-500/30 text-red-400 font-mono text-[10px] mb-2">
                    <ShieldCheck className="w-3 h-3 text-red-400" />
                    <span>HARDWARE-DERIVED AES-256 ENCLAVE</span>
                  </div>
                  <h3 className="font-space font-bold text-2xl sm:text-3xl text-white">
                    Windows DPAPI + GRAVITAS Security Enclave
                  </h3>
                  <p className="text-slate-400 text-sm mt-1 max-w-2xl font-light">
                    Every API credential and token is encrypted with hardware TPM keys via Windows DPAPI. 6 GRAVITAS invariants guarantee zero path breakout.
                  </p>
                </div>

                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 shrink-0">
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">ENCRYPTION CIPHER</span>
                    <span className="text-emerald-400 font-bold">AES-256-GCM</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/50 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-500 block">SECURITY INVARIANTS</span>
                    <span className="text-red-400 font-bold">6 LOCKED</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 bg-[#02050c] rounded-2xl border border-slate-800 p-6 space-y-6">
                  {/* Invariant Status List */}
                  <div className="space-y-2 font-mono text-xs">
                    {[
                      { num: 'INV-1', desc: 'Read target & tests before mutating' },
                      { num: 'INV-2', desc: 'Deny writes outside declared scope bounds' },
                      { num: 'INV-3', desc: 'Verify changes with Gravitas validator' },
                      { num: 'INV-4', desc: 'Ban byte-identical retry of failures' },
                      { num: 'INV-5', desc: 'Contract acceptance criteria gate completion' },
                      { num: 'INV-6', desc: 'Explicit uncertainty marking (zero hallucinations)' },
                    ].map((inv) => (
                      <div key={inv.num} className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-slate-300">{inv.desc}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{inv.num}</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions: Key Rotation & Emergency E-STOP */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => { setKeyRotated(true); setTimeout(() => setKeyRotated(false), 2000); }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${keyRotated ? 'animate-spin' : ''}`} />
                      <span>{keyRotated ? 'Keys Rotated in DPAPI' : 'Rotate TPM Keys'}</span>
                    </button>

                    <button
                      onClick={() => setEStopTriggered(!eStopTriggered)}
                      className={`px-5 py-2 rounded-xl font-mono text-xs font-bold uppercase transition-all cursor-pointer flex items-center gap-2 ${
                        eStopTriggered
                          ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.7)]'
                          : 'bg-red-950/50 text-red-400 border border-red-500/40 hover:bg-red-900/50'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{eStopTriggered ? 'E-STOP ACTIVE (KILLED)' : 'Physical E-STOP'}</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 text-xs font-sans text-slate-300">
                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Windows DPAPI Hardware Master Key
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      API tokens are never written in plaintext. Keys are protected with CryptProtectData backed by your machine&apos;s physical TPM chip and local user session.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/80">
                    <h4 className="font-space font-bold text-white text-sm mb-1">
                      Emergency Hardware E-STOP
                    </h4>
                    <p className="text-slate-400 leading-relaxed">
                      A dedicated physical hotkey (Win+Escape) immediately drops all socket connections, terminates worker threads, and releases OS hooks in 8ms.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
