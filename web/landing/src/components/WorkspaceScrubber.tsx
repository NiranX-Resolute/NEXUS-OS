import React, { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { 
  Sliders, 
  Cpu, 
  HardDrive, 
  Shield, 
  Terminal, 
  FolderLock, 
  Zap, 
  Bot, 
  CheckCircle2, 
  Clock, 
  Globe, 
  ChevronRight, 
  ChevronLeft 
} from 'lucide-react';

// ==========================================
// Mode Definitions
// ==========================================
interface WorkspaceMode {
  id: string;
  name: string;
  color: string;
  turbulence: number;
  ramUsage: string;
  cpuOverhead: string;
  allowedPaths: string[];
  description: string;
  status: string;
}

const MODES: WorkspaceMode[] = [
  {
    id: 'silent',
    name: 'SILENT [0 MB]',
    color: '#00F5D4',
    turbulence: 0.1,
    ramUsage: '0.00 MB (Stackless)',
    cpuOverhead: '0.00%',
    allowedPaths: ['~/.nexus-agent/db/agent_local.db (Read-Only)'],
    description: 'Complete host quiescence. Agent unloads from RAM between turns, awaiting OS event wakeups.',
    status: 'QUIESCENT SLEEP',
  },
  {
    id: 'study',
    name: 'STUDY',
    color: '#38BDF8',
    turbulence: 0.35,
    ramUsage: '12.4 MB (FTS5 + Vec)',
    cpuOverhead: '0.12%',
    allowedPaths: ['~/.nexus-agent/knowledge/', '~/Documents/Research/'],
    description: 'Offline arXiv synthesis, hybrid BM25 + sqlite-vec semantic search, KaTeX mathematics study vault.',
    status: 'KNOWLEDGE INDEXING',
  },
  {
    id: 'dev',
    name: 'DEV',
    color: '#A855F7',
    turbulence: 0.7,
    ramUsage: '24.8 MB (Tree-sitter)',
    cpuOverhead: '0.45%',
    allowedPaths: ['c:/Users/NiranX/Documents/.../git_worktrees/'],
    description: 'Isolated Git worktrees, AST-verified diff patching, automated unit test verification before commit.',
    status: 'ISOLATED WORKTREE',
  },
  {
    id: 'studio',
    name: 'STUDIO',
    color: '#F59E0B',
    turbulence: 1.1,
    ramUsage: '38.2 MB (Full Duplex)',
    cpuOverhead: '0.78%',
    allowedPaths: ['All ScopeGuard-whitelisted project roots'],
    description: 'Duplex WASAPI voice actuation, sub-100ms Win32 clicking, 5-orbiter swarm coordination.',
    status: 'FULL-SCALE ACTUATION',
  },
];

// ==========================================
// Embedded 3D Morphing Quantum Sphere
// ==========================================
const MorphingSphere: React.FC<{ mode: WorkspaceMode }> = ({ mode }) => {
  const meshRef = useRef<THREE.Points>(null);
  const targetColor = useRef(new THREE.Color(mode.color));

  targetColor.current.set(mode.color);

  const [geo] = useState(() => {
    const count = 1200;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * 0.3 + 1.2;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  });

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    meshRef.current.rotation.y = t * 0.2 * mode.turbulence;
    meshRef.current.rotation.x = Math.sin(t * 0.15) * 0.2;

    const scale = 1.0 + Math.sin(t * (1 + mode.turbulence * 2)) * (0.04 * mode.turbulence);
    meshRef.current.scale.set(scale, scale, scale);
  });

  return (
    <group>
      <points ref={meshRef} geometry={geo}>
        <pointsMaterial
          size={0.045}
          color={mode.color}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh>
        <sphereGeometry args={[0.9, 16, 16]} />
        <meshBasicMaterial 
          wireframe 
          color={mode.color} 
          transparent 
          opacity={0.25} 
        />
      </mesh>
    </group>
  );
};

// ==========================================
// 5 Orbiters Specification
// ==========================================
interface OrbiterCard {
  id: string;
  name: string;
  role: string;
  color: string;
  latency: string;
  stack: string;
  capabilities: string[];
}

const ORBITER_CARDS: OrbiterCard[] = [
  {
    id: 'DEV-01',
    name: 'Autonomous Coding Studio',
    role: 'AST Refactoring & Worktree Engine',
    color: '#A855F7',
    latency: '< 140ms',
    stack: 'Tree-sitter • PageRank • Git Worktree',
    capabilities: ['Isolated Worktree Cloning', 'AST-Verified Diff Application', 'Zero Broken Exports Gate'],
  },
  {
    id: 'SYS-01',
    name: 'Native Win32 Orchestrator',
    role: 'OS UI & Background Actuation',
    color: '#38BDF8',
    latency: '< 78ms',
    stack: 'pywin32 • WinRT • UI Automation (UIA)',
    capabilities: ['Accessibility Tree Direct Clicking', 'Offline WinRT Screen OCR', 'Top-Level Window Sub-100ms Focus'],
  },
  {
    id: 'SCOUT-01',
    name: 'Obscura Headless Radar',
    role: 'Web Distillation & Token Harvesting',
    color: '#00F5D4',
    latency: '< 92ms',
    stack: 'Rust Obscura • CDP • Headless Chromium',
    capabilities: ['Persistent Cookie Profile Reuse', 'DOM Markdown Distillation', 'Zero-Proxy Direct Scrapes'],
  },
  {
    id: 'SEC-01',
    name: 'ScopeGuard Sentinel',
    role: '6-Invariant Jail & Credential Vault',
    color: '#10B981',
    latency: '< 12ms',
    stack: 'Windows DPAPI • Semgrep • ScopeGuard',
    capabilities: ['Path Containment Jail', 'DPAPI Hardware AES-256 Vault', 'Dynamic Notch 1-Tap Approvals'],
  },
  {
    id: 'OPS-01',
    name: 'Serverless Fleet Mesh',
    role: 'Cloudflare D1 & Modal GPU Bridge',
    color: '#F59E0B',
    latency: '< 35ms',
    stack: 'Cloudflare D1 • SQLite Mesh • Modal Labs',
    capabilities: ['Zero-Card D1 Cross-Device Sync', 'Modal Ephemeral GPU Offload', 'Automated Health Heartbeats'],
  },
];

// ==========================================
// Main Component
// ==========================================
export const WorkspaceScrubber: React.FC = () => {
  const [selectedModeIndex, setSelectedModeIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const activeMode = MODES[selectedModeIndex];

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const delta = direction === 'left' ? -340 : 340;
    scrollContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <section id="sub-agents" className="relative w-full py-28 px-4 sm:px-8 bg-[#030711] overflow-hidden">
      {/* Background radial glow */}
      <div 
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[300px] blur-[150px] pointer-events-none rounded-full transition-colors duration-700"
        style={{ backgroundColor: `${activeMode.color}15` }}
      />

      <div className="max-w-6xl mx-auto space-y-24">
        {/* ========================================================= */}
        {/* PART 1: Interactive Workspace Calibration Scrubber */}
        {/* ========================================================= */}
        <div>
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 font-mono text-xs mb-3">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>DYNAMIC CALIBRATION</span>
            </div>
            <h2 className="font-space font-extrabold text-3xl sm:text-4xl text-white tracking-tight mb-4">
              Calibrate Your Neural Workspaces
            </h2>
            <p className="text-slate-400 text-sm sm:text-base font-light">
              Slide across runtime operational tiers. From zero-idle quiescence to full duplex voice and multi-agent coordination.
            </p>
          </div>

          {/* Interactive Mode Scrubber Bar */}
          <div className="spatial-glass rounded-3xl p-6 sm:p-8 border-cyan-500/25 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            {/* Scrubber Nodes Navigation */}
            <div className="relative mb-10">
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${(selectedModeIndex / (MODES.length - 1)) * 100}%`,
                    backgroundColor: activeMode.color,
                    boxShadow: `0 0 15px ${activeMode.color}`,
                  }}
                />
              </div>

              {/* Node Buttons */}
              <div className="flex justify-between -mt-3.5">
                {MODES.map((m, idx) => {
                  const isSelected = selectedModeIndex === idx;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModeIndex(idx)}
                      className={`flex flex-col items-center group cursor-pointer focus:outline-none transition-all ${
                        isSelected ? 'scale-105' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-[#030711] shadow-lg'
                            : 'bg-slate-900 border-slate-700 group-hover:border-slate-500'
                        }`}
                        style={{
                          borderColor: isSelected ? m.color : undefined,
                          boxShadow: isSelected ? `0 0 15px ${m.color}` : undefined,
                        }}
                      >
                        {isSelected && (
                          <div
                            className="w-2 h-2 rounded-full animate-ping"
                            style={{ backgroundColor: m.color }}
                          />
                        )}
                      </div>
                      <span
                        className={`font-mono text-xs sm:text-sm mt-3 font-bold tracking-wider transition-colors ${
                          isSelected ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                        }`}
                        style={{ color: isSelected ? m.color : undefined }}
                      >
                        {m.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Split Details: 3D Morphing Sphere + Telemetry Specs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-4 border-t border-slate-800/80">
              {/* Left: Embedded 3D Canvas with Morphing Sphere */}
              <div className="lg:col-span-5 h-[280px] rounded-2xl bg-[#040814]/80 border border-slate-800/80 overflow-hidden relative flex items-center justify-center">
                <Canvas camera={{ position: [0, 0, 3.2], fov: 45 }}>
                  <ambientLight intensity={0.6} />
                  <pointLight position={[5, 5, 5]} intensity={1} color={activeMode.color} />
                  <MorphingSphere mode={activeMode} />
                </Canvas>

                {/* Status Badge Overlay */}
                <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-black/80 border border-slate-800 font-mono text-[10px] text-slate-300 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeMode.color }} />
                  <span>{activeMode.status}</span>
                </div>
              </div>

              {/* Right: Telemetry & Path Jail Readout */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-space font-bold text-xl sm:text-2xl text-white">
                    {activeMode.name}
                  </h3>
                  <span 
                    className="font-mono text-xs px-3 py-1 rounded-full font-bold"
                    style={{ 
                      color: activeMode.color, 
                      backgroundColor: `${activeMode.color}15`, 
                      border: `1px solid ${activeMode.color}35` 
                    }}
                  >
                    RAM: {activeMode.ramUsage}
                  </span>
                </div>

                <p className="text-slate-300 text-sm leading-relaxed font-sans">
                  {activeMode.description}
                </p>

                {/* Telemetry Metrics */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-black/40 border border-slate-800 font-mono text-xs">
                    <span className="text-slate-500 block text-[10px] mb-1">RAM FOOTPRINT</span>
                    <span className="text-emerald-400 font-bold">{activeMode.ramUsage}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-black/40 border border-slate-800 font-mono text-xs">
                    <span className="text-slate-500 block text-[10px] mb-1">CPU OVERHEAD</span>
                    <span className="text-cyan-300 font-bold">{activeMode.cpuOverhead}</span>
                  </div>
                </div>

                {/* Whitelisted Scope Paths */}
                <div className="p-3.5 rounded-xl bg-black/50 border border-slate-800 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                    <FolderLock className="w-3.5 h-3.5 text-amber-400" />
                    <span>ALLOWED FILESYSTEM SCOPE</span>
                  </div>
                  {activeMode.allowedPaths.map((p, i) => (
                    <div key={i} className="text-slate-200 text-[11px] truncate">
                      &gt; {p}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* PART 2: Horizontal 5-Orbiter Carousel */}
        {/* ========================================================= */}
        <div>
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 font-mono text-xs mb-3">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>AUTONOMOUS SWARM</span>
              </div>
              <h2 className="font-space font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
                5 Planetary Sub-Agent Orbiters
              </h2>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel('left')}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40 transition-all cursor-pointer"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollCarousel('right')}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40 transition-all cursor-pointer"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Draggable / Scrollable Cards Strip */}
          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-6 overflow-x-auto pb-6 no-scrollbar snap-x snap-mandatory"
          >
            {ORBITER_CARDS.map((orb) => (
              <div
                key={orb.id}
                className="min-w-[300px] sm:min-w-[340px] max-w-[360px] snap-center spatial-glass rounded-2xl p-6 border-slate-800/80 hover:border-cyan-500/40 transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  {/* Top Badge & Identifier */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: orb.color, boxShadow: `0 0 10px ${orb.color}` }}
                      />
                      <span className="font-mono font-bold text-sm text-white">{orb.id}</span>
                    </div>
                    <span
                      className="font-mono text-[10px] px-2 py-0.5 rounded font-semibold"
                      style={{
                        color: orb.color,
                        backgroundColor: `${orb.color}15`,
                        border: `1px solid ${orb.color}35`,
                      }}
                    >
                      {orb.latency}
                    </span>
                  </div>

                  <h3 className="font-space font-bold text-lg text-white mb-1 group-hover:text-cyan-300 transition-colors">
                    {orb.name}
                  </h3>
                  <p className="font-mono text-xs text-slate-400 mb-4">{orb.role}</p>

                  {/* Capabilities List */}
                  <div className="space-y-2 mb-6">
                    {orb.capabilities.map((cap, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{cap}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stack footer */}
                <div className="pt-4 border-t border-slate-800/80 font-mono text-[11px] text-slate-500">
                  <span className="text-slate-400 block mb-0.5">Stack:</span>
                  <span className="text-slate-300">{orb.stack}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
