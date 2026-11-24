import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Float } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Mic, 
  Monitor, 
  Code2, 
  EyeOff, 
  Bot, 
  BookOpen, 
  ShieldAlert, 
  Layers, 
  Check, 
  AlertCircle, 
  Terminal, 
  Activity, 
  Lock, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

// ==========================================
// 8 Subsystems Specification
// ==========================================
interface StageInfo {
  index: string;
  title: string;
  tagline: string;
  badge: string;
  accent: string;
}

const STAGES: StageInfo[] = [
  {
    index: '01',
    title: 'Quantum Dyson Core & Duplex Voice',
    tagline: '4,000-particle audio-FFT sphere with <15ms barge-in and 4-tier anti-echo protection.',
    badge: 'VOICE & FFT SPECTRAL CORE',
    accent: '#00F5D4',
  },
  {
    index: '02',
    title: 'Fullscreen-Safe Dynamic Notch (NX READY)',
    tagline: 'Top-edge ambient pill with SHQueryUserNotificationState game auto-hide and cancel-safe file shelf.',
    badge: 'WIN32 NOTCH HUD',
    accent: '#38BDF8',
  },
  {
    index: '03',
    title: 'NexKoder Sovereign Coding Studio (DEV-01)',
    tagline: 'Tree-sitter + PageRank repo map, Git worktree isolation, and AST-verified diff patching.',
    badge: 'DEV-01 AUTONOMOUS ENGINE',
    accent: '#A855F7',
  },
  {
    index: '04',
    title: 'Stealth Interview Copilot',
    tagline: 'WDA_EXCLUDEFROMCAPTURE screen-share invisibility, WASAPI loopback audio, and sub-500ms STAR coding synthesis.',
    badge: 'STEALTH COPILOT',
    accent: '#10B981',
  },
  {
    index: '05',
    title: 'Agent Town Pixel Office',
    tagline: '60 FPS A* pathfinding floorplan visualizing DEV-01, SYS-01, SCOUT-01, SEC-01, OPS-01 live from SQLite WAL.',
    badge: 'MULTI-AGENT WAL RUNTIME',
    accent: '#F59E0B',
  },
  {
    index: '06',
    title: 'Scholar & Hybrid FTS5 Memory Bank',
    tagline: 'Local sqlite-vec + BM25 knowledge graph, arXiv synthesis, and offline KaTeX study vault.',
    badge: 'VECTOR + BM25 MEMORY',
    accent: '#00F5D4',
  },
  {
    index: '07',
    title: 'ScopeGuard & RedCell Sentinel (SEC-01)',
    tagline: 'Scope-locked nuclei, semgrep, gitleaks, and obscura auditing with physical hardware E-STOP.',
    badge: 'REDCELL SENTINEL',
    accent: '#EF4444',
  },
  {
    index: '08',
    title: 'Holographic Fan-Out Arc',
    tagline: 'All 7 subsystems fanning out into a 3D panoramic command arc. Every surface. One sovereign core.',
    badge: 'UNIFIED ARCHITECTURE',
    accent: '#38BDF8',
  },
];

// ==========================================
// 3D Workstation Bezel with Pitch/Yaw
// ==========================================
const WorkstationBezel3D: React.FC<{ 
  stageIndex: number;
  stageProgress: number; 
  onStageSelect: (i: number) => void;
}> = ({ stageIndex, stageProgress, onStageSelect }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const pointer = state.pointer;

    // Is it stage 8 (fan-out)?
    const isFanOut = stageIndex === 7;

    if (isFanOut) {
      // Fan out orientation
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, pointer.y * 0.1, 0.05);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, pointer.x * 0.2, 0.05);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, 0, 0.05);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, -0.5, 0.05);
    } else {
      // Gentle 3D perspective pitch & yaw
      const targetRotX = Math.sin(stageIndex * 1.2) * 0.08 + pointer.y * 0.15;
      const targetRotY = Math.cos(stageIndex * 1.2) * 0.12 + pointer.x * 0.2;
      const targetRotZ = (pointer.x * -0.04);

      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.05);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.05);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, targetRotZ, 0.05);
      groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, 0, 0.05);
    }
  });

  const stage = STAGES[stageIndex];

  return (
    <group ref={groupRef}>
      {/* If Stage 8: 3D Holographic Arc Fan-Out View */}
      {stageIndex === 7 ? (
        <group>
          {STAGES.slice(0, 7).map((s, idx) => {
            const angle = (idx - 3) * 0.32; // Fan out arc
            const posX = Math.sin(angle) * 7.0;
            const posZ = (Math.cos(angle) - 1) * 3.5;
            const rotY = -angle * 0.85;

            return (
              <group key={s.index} position={[posX, 0, posZ]} rotation={[0, rotY, 0]}>
                <Html center transform distanceFactor={9}>
                  <div 
                    onClick={() => onStageSelect(idx)}
                    className="w-[280px] h-[340px] rounded-2xl bg-[#060c18]/90 border border-cyan-500/30 p-5 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col justify-between hover:border-cyan-400 hover:scale-105 transition-all cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center justify-between font-mono text-[11px] mb-3">
                        <span className="text-cyan-400 font-bold">{s.index} / 08</span>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 text-[9px]">
                          {s.badge}
                        </span>
                      </div>
                      <h4 className="font-space font-bold text-white text-base mb-2 group-hover:text-cyan-300 transition-colors">
                        {s.title}
                      </h4>
                      <p className="text-slate-400 text-xs leading-relaxed line-clamp-3">
                        {s.tagline}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between font-mono text-[10px] text-cyan-400">
                      <span>INSPECT SUBSYSTEM</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Html>
              </group>
            );
          })}

          {/* Central Fan-Out Title */}
          <Html center transform position={[0, -2.8, 0]} distanceFactor={8}>
            <div className="text-center pointer-events-none select-none">
              <h3 className="font-editorial italic text-3xl md:text-5xl text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-sky-300 drop-shadow-[0_0_30px_rgba(0,245,212,0.5)]">
                every surface. one sovereign core.
              </h3>
            </div>
          </Html>
        </group>
      ) : (
        /* Stages 01 to 07: Single Centered High-Fidelity Interactive Screen Bezel */
        <group>
          {/* Bezel frame geometry backing */}
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[9.4, 5.8, 0.1]} />
            <meshStandardMaterial 
              color="#040914" 
              roughness={0.2} 
              metalness={0.8}
            />
          </mesh>

          {/* Glowing Bezel Outer Border */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(9.45, 5.85, 0.12)]} />
            <lineBasicMaterial color={stage.accent} transparent opacity={0.6} />
          </lineSegments>

          {/* Screen Projection Content via HTML */}
          <Html center transform distanceFactor={6.8}>
            <div className="w-[820px] h-[500px] rounded-2xl bg-[#060c18]/95 border border-cyan-500/30 shadow-[0_0_60px_rgba(0,0,0,0.9)] p-6 flex flex-col justify-between backdrop-blur-2xl select-none">
              {/* Window Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="font-mono text-xs text-slate-400 ml-2">
                    nexus-{stage.index}-view.sys
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span 
                    className="font-mono text-[10px] px-2.5 py-0.5 rounded font-bold"
                    style={{ color: stage.accent, backgroundColor: `${stage.accent}15`, border: `1px solid ${stage.accent}40` }}
                  >
                    {stage.badge}
                  </span>
                </div>
              </div>

              {/* Subsystem Specific Dynamic Body View */}
              <div className="flex-1 my-4 flex flex-col justify-center">
                {stageIndex === 0 && <Stage01VoiceCore />}
                {stageIndex === 1 && <Stage02DynamicNotch />}
                {stageIndex === 2 && <Stage03NexKoder />}
                {stageIndex === 3 && <Stage04StealthCopilot />}
                {stageIndex === 4 && <Stage05AgentTown />}
                {stageIndex === 5 && <Stage06ScholarVault />}
                {stageIndex === 6 && <Stage07ScopeGuard />}
              </div>

              {/* Window Footer Telemetry */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between font-mono text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.accent }} />
                  <span className="text-slate-300 font-semibold">{stage.title}</span>
                </div>
                <div className="flex items-center gap-4 text-[11px]">
                  <span>LATENCY: &lt;14MS</span>
                  <span className="text-emerald-400">RAM: 0 MB IDLE</span>
                </div>
              </div>
            </div>
          </Html>
        </group>
      )}
    </group>
  );
};

// ==========================================
// Subsystem Screen Components (01 - 07)
// ==========================================

// Stage 01: Duplex Voice & FFT
const Stage01VoiceCore = () => (
  <div className="flex flex-col items-center justify-center p-6 space-y-6">
    <div className="w-20 h-20 rounded-full bg-cyan-950/60 border-2 border-cyan-400/50 flex items-center justify-center relative shadow-[0_0_35px_rgba(0,245,212,0.35)]">
      <Mic className="w-8 h-8 text-cyan-300 animate-pulse" />
      <div className="absolute inset-0 rounded-full border border-cyan-400/30 animate-ping" />
    </div>

    {/* Spectral Audio Bar Visualizer */}
    <div className="w-full max-w-md flex items-end justify-center gap-1.5 h-16">
      {[40, 65, 80, 50, 95, 70, 85, 60, 45, 90, 75, 100, 60, 85, 70, 50, 40].map((h, i) => (
        <div
          key={i}
          className="w-2.5 rounded-t bg-gradient-to-t from-cyan-500 to-sky-300 transition-all duration-150"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>

    <div className="grid grid-cols-3 gap-4 w-full max-w-lg font-mono text-xs">
      <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 text-center">
        <span className="text-slate-400 block text-[10px]">BARGE-IN LATENCY</span>
        <span className="text-cyan-300 font-bold">&lt; 15 ms</span>
      </div>
      <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 text-center">
        <span className="text-slate-400 block text-[10px]">ECHO CANCELLATION</span>
        <span className="text-emerald-400 font-bold">4-Tier WASAPI</span>
      </div>
      <div className="p-2.5 rounded-lg bg-black/50 border border-slate-800 text-center">
        <span className="text-slate-400 block text-[10px]">SPECTRAL DENSITY</span>
        <span className="text-sky-300 font-bold">4,000 Pts FFT</span>
      </div>
    </div>
  </div>
);

// Stage 02: Dynamic Notch
const Stage02DynamicNotch = () => (
  <div className="flex flex-col items-center justify-center p-6 space-y-6">
    {/* Floating Notch Representation */}
    <div className="w-full max-w-md p-3 rounded-2xl bg-black/90 border border-sky-400/50 shadow-[0_0_30px_rgba(56,189,248,0.25)] flex items-center justify-between font-mono">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
        <span className="text-xs text-sky-300 font-bold">NX READY</span>
      </div>
      <span className="text-[11px] text-slate-300">SHQueryUserNotificationState = BUSY</span>
      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        AUTO-HIDE
      </span>
    </div>

    <div className="w-full max-w-lg p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-700/80 text-center">
      <p className="text-xs font-mono text-slate-300 mb-2">Cancel-Safe Drag & Drop Shelf</p>
      <p className="text-[11px] text-slate-500 font-sans">
        Drop scripts, PDF research, or Git repos directly onto the screen notch to stage in isolated sandboxes.
      </p>
    </div>

    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
      <span>• Fullscreen-Game Safe</span>
      <span>• Zero FPS Degradation</span>
      <span>• Windows Native HWND</span>
    </div>
  </div>
);

// Stage 03: NexKoder (DEV-01)
const Stage03NexKoder = () => (
  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 font-mono text-xs space-y-3">
    <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
      <div className="flex items-center gap-2">
        <Code2 className="w-4 h-4 text-purple-400" />
        <span className="text-purple-300 font-bold">DEV-01 // Isolated Git Worktree</span>
      </div>
      <span className="text-emerald-400 text-[10px]">Tree-sitter AST Verified</span>
    </div>

    <div className="space-y-1 text-[11px]">
      <p className="text-slate-500">// Building PageRank graph for 240 symbols...</p>
      <p className="text-purple-300">git worktree add -B dev01-patch .nexus/worktrees/patch-91</p>
      <p className="text-emerald-400">+ AST validator confirmed: 0 broken exports</p>
      <p className="text-cyan-300">&gt; Automated unit test suite: 18 passed in 142ms</p>
    </div>

    <div className="p-2.5 rounded bg-purple-950/20 border border-purple-500/25 flex items-center justify-between text-[11px]">
      <span className="text-purple-200">Execution Sandbox: Isolated Worktree</span>
      <span className="text-purple-400 font-bold">100% Host Guarded</span>
    </div>
  </div>
);

// Stage 04: Stealth Interview Copilot
const Stage04StealthCopilot = () => (
  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 space-y-4">
    <div className="flex items-center justify-between font-mono text-xs border-b border-slate-800 pb-2">
      <div className="flex items-center gap-2 text-emerald-400 font-bold">
        <EyeOff className="w-4 h-4" />
        <span>WDA_EXCLUDEFROMCAPTURE: ACTIVE</span>
      </div>
      <span className="text-slate-400 text-[10px]">Invisible to Zoom & Teams</span>
    </div>

    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 font-mono text-xs">
      <div className="text-emerald-400 font-bold mb-1">&gt; Audio Stream (WASAPI Loopback):</div>
      <p className="text-slate-300 text-[11px] leading-relaxed">
        &ldquo;Explain how you design low-latency zero-copy memory architectures in distributed systems.&rdquo;
      </p>
    </div>

    <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 font-mono text-xs">
      <div className="text-cyan-300 font-bold mb-1">&gt; STAR Synthesis (&lt; 420ms):</div>
      <p className="text-slate-400 text-[11px] leading-relaxed">
        Situation: High IO overhead in legacy pipelines. Action: Swapped IPC sockets for shared memory rings with atomic flag fences. Result: 94% latency reduction.
      </p>
    </div>
  </div>
);

// Stage 05: Agent Town Pixel Office
const Stage05AgentTown = () => (
  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 space-y-3 font-mono text-xs">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-amber-300">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4" />
        <span className="font-bold">AGENT TOWN // 60 FPS A* PATHFINDING</span>
      </div>
      <span className="text-slate-400 text-[10px]">SQLite WAL Shared Mesh</span>
    </div>

    <div className="grid grid-cols-5 gap-2 text-center py-2">
      {[
        { id: 'DEV-01', role: 'Coding Desk', color: '#A855F7', state: 'REFACTORING' },
        { id: 'SYS-01', role: 'Win32 Hub', color: '#38BDF8', state: 'HOOKING UIA' },
        { id: 'SCOUT-01', role: 'Web Radar', color: '#00F5D4', state: 'SCRAPING' },
        { id: 'SEC-01', role: 'Vault Gate', color: '#10B981', state: 'AUDITING' },
        { id: 'OPS-01', role: 'D1 Mesh', color: '#F59E0B', state: 'SYNCING' },
      ].map((agent) => (
        <div key={agent.id} className="p-2 rounded bg-black/40 border border-slate-800/80">
          <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: agent.color }} />
          <div className="text-slate-200 font-bold text-[10px]">{agent.id}</div>
          <div className="text-slate-500 text-[8px]">{agent.role}</div>
          <div className="text-cyan-400 text-[8px] mt-1 font-semibold">{agent.state}</div>
        </div>
      ))}
    </div>

    <div className="p-2 rounded bg-amber-950/20 border border-amber-500/25 text-[11px] text-amber-200 text-center">
      Autonomous sprite coordinate synchronization directly via Local SQLite WAL.
    </div>
  </div>
);

// Stage 06: Scholar & Hybrid FTS5
const Stage06ScholarVault = () => (
  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 space-y-3 font-mono text-xs">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-cyan-300">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4" />
        <span className="font-bold">HYBRID FTS5 + SQLITE-VEC SEARCH</span>
      </div>
      <span className="text-slate-400 text-[10px]">Local Knowledge Graph</span>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 rounded bg-black/50 border border-slate-800">
        <span className="text-slate-400 block text-[10px] mb-1">BM25 FULL TEXT SEARCH</span>
        <p className="text-slate-300 text-[11px]">Exact keyword indexing with FTS5 token porter stemmer.</p>
      </div>
      <div className="p-3 rounded bg-black/50 border border-slate-800">
        <span className="text-slate-400 block text-[10px] mb-1">SQLITE-VEC COSINE SIMILARITY</span>
        <p className="text-slate-300 text-[11px]">Sub-5ms semantic nearest-neighbor retrieval on local disk.</p>
      </div>
    </div>

    <div className="p-2.5 rounded bg-cyan-950/30 border border-cyan-500/25 text-[11px] text-cyan-300 flex items-center justify-between">
      <span>Offline arXiv synthesis + KaTeX study vaults</span>
      <span className="text-slate-400">0 Cloud Leakage</span>
    </div>
  </div>
);

// Stage 07: ScopeGuard & RedCell Sentinel
const Stage07ScopeGuard = () => (
  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 space-y-3 font-mono text-xs">
    <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-red-400">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        <span className="font-bold">SCOPEGUARD & REDCELL SENTINEL (SEC-01)</span>
      </div>
      <span className="px-2 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-500/40 text-[9px] font-bold">
        6 INVARIANTS LOCKED
      </span>
    </div>

    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-slate-800">
        <span className="text-slate-300">Semgrep AST Security Audit</span>
        <span className="text-emerald-400 font-bold">PASS (0 Leaks)</span>
      </div>
      <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-slate-800">
        <span className="text-slate-300">Path-Jail Bounds Guard</span>
        <span className="text-emerald-400 font-bold">ACTIVE (~/.nexus-agent)</span>
      </div>
      <div className="flex items-center justify-between p-2 rounded bg-black/40 border border-slate-800">
        <span className="text-slate-300">Windows DPAPI Hardware Vault</span>
        <span className="text-cyan-400 font-bold">AES-256-GCM ENCRYPTED</span>
      </div>
    </div>

    <div className="p-2.5 rounded bg-red-950/30 border border-red-500/30 flex items-center justify-between">
      <span className="text-red-300 text-[11px]">Emergency Hardware Kill Switch</span>
      <span className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase shadow-lg cursor-pointer">
        E-STOP READY
      </span>
    </div>
  </div>
);

// ==========================================
// Main Carousel Component
// ==========================================
export const StageCarousel3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        pin: true,
        onUpdate: (self) => {
          setStageProgress(self.progress);
          const idx = Math.min(7, Math.floor(self.progress * 8));
          setCurrentStage(idx);
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  const activeStage = STAGES[currentStage];

  return (
    <div id="tour" ref={containerRef} className="relative w-full h-[600vh] bg-[#030711]">
      {/* Sticky 100vh Fullscreen Stage */}
      <div className="sticky top-0 left-0 w-full h-screen overflow-hidden flex flex-col justify-between py-8 px-4 sm:px-8">
        {/* Giant Low-Opacity Background Index Numeral */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
          <span className="font-mono text-[28vw] font-black text-cyan-500/[0.03] transition-all duration-300">
            {activeStage.index}
          </span>
        </div>

        {/* Top Header HUD */}
        <div className="relative z-10 max-w-6xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-400">SUBSYSTEM SHOWCASE</span>
            <span className="text-slate-600">/</span>
            <div className="px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span>{activeStage.index} / 08</span>
            </div>
          </div>

          {/* Quick Clickable Dots */}
          <div className="hidden md:flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-full">
            {STAGES.map((s, i) => (
              <button
                key={s.index}
                onClick={() => setCurrentStage(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  currentStage === i
                    ? 'w-6 bg-cyan-400 shadow-[0_0_10px_rgba(0,245,212,0.8)]'
                    : 'bg-slate-700 hover:bg-slate-500'
                }`}
                title={`Jump to ${s.title}`}
              />
            ))}
          </div>
        </div>

        {/* Central 3D Canvas Stage */}
        <div className="relative z-10 flex-1 w-full max-w-6xl mx-auto h-[60vh] sm:h-[65vh]">
          <Canvas
            camera={{ position: [0, 0, 7.5], fov: 50 }}
            gl={{ antialias: true, alpha: true }}
            className="w-full h-full"
          >
            <ambientLight intensity={0.7} />
            <pointLight position={[10, 10, 10]} intensity={1.0} color="#00F5D4" />
            <pointLight position={[-10, -10, 10]} intensity={0.8} color="#38BDF8" />

            <WorkstationBezel3D 
              stageIndex={currentStage} 
              stageProgress={stageProgress}
              onStageSelect={(i) => setCurrentStage(i)}
            />
          </Canvas>
        </div>

        {/* Bottom Stage Progress Track */}
        <div className="relative z-10 max-w-6xl mx-auto w-full pt-4">
          <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-200"
              style={{ width: `${((currentStage + 1) / 8) * 100}%` }}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-slate-400 gap-2">
            <div>
              <span className="text-white font-bold mr-2">{activeStage.title}</span>
              <span className="hidden sm:inline text-slate-400">{activeStage.tagline}</span>
            </div>
            <div className="text-right text-cyan-400 font-semibold whitespace-nowrap">
              SCROLL SCRUB: {Math.round(stageProgress * 100)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
