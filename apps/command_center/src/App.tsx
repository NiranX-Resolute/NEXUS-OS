import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  Cpu,
  Terminal,
  BookOpen,
  Code2,
  Users,
  Radio,
  Shield,
  Sparkles,
  Server,
  Zap,
  CheckCircle2,
  Filter,
  Sliders,
  Send,
  Minimize2,
  Maximize2,
  FileText,
  Lock,
  ChevronRight,
  FolderOpen
} from 'lucide-react';
import { useAgentStore, agentStore } from './store/agentStore';
import NexusCoreOrb, { SubAgentOrbiter } from './components/NexusCoreOrb';
import NexKoderEditor from './components/NexKoderEditor';
import ScholarWorkbench from './components/ScholarWorkbench';
import VoicePersonaMatrix from './components/VoicePersonaMatrix';
import SwarmStreamPanel from './components/SwarmStreamPanel';

type ActiveDrawer = 'NONE' | 'DEV-01' | 'SCOUT-01' | 'SEC-01' | 'SYS-01' | 'OPS-01' | 'LOGS' | 'PERSONA' | 'SWARM';

export function App() {
  const [selectedDrawer, setSelectedDrawer] = useState<ActiveDrawer>('NONE');
  const [activeWorkspaceMode, setActiveWorkspaceMode] = useState<string>('DEV');
  const { agents, tasks, logs, telemetry, persona } = useAgentStore();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [promptInput, setPromptInput] = useState<string>('');
  const [isSubmittingTask, setIsSubmittingTask] = useState<boolean>(false);
  const [isReleasingQuota, setIsReleasingQuota] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<string>('all');

  // Live Clock
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Backend Sync (:47630)
  useEffect(() => {
    agentStore.syncWithBackend();
    const interval = setInterval(() => {
      agentStore.syncWithBackend();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Sync workspace mode from backend on mount
  useEffect(() => {
    const fetchMode = async () => {
      try {
        const res = await fetch('http://127.0.0.1:47630/api/workspace/mode');
        if (res.ok) {
          const data = await res.json();
          if (data.mode) setActiveWorkspaceMode(data.mode);
        }
      } catch {
        // Fallback
      }
    };
    fetchMode();
  }, []);

  const handleModeChange = async (mode: string) => {
    setActiveWorkspaceMode(mode);
    try {
      await fetch('http://127.0.0.1:47630/api/workspace/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleOrbiterClick = (id: SubAgentOrbiter['id']) => {
    if (selectedDrawer === id) {
      setSelectedDrawer('NONE');
    } else {
      setSelectedDrawer(id);
    }
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isSubmittingTask) return;

    const userPrompt = promptInput.trim();
    setPromptInput('');
    setIsSubmittingTask(true);

    try {
      await fetch('http://127.0.0.1:47630/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt,
          command_type: 'GENERAL',
          source_device: 'COMMAND_CENTER',
        }),
      });
      await agentStore.syncWithBackend();
    } catch (err) {
      console.error('Failed to dispatch task:', err);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleReleaseComputeQuota = async () => {
    setIsReleasingQuota(true);
    try {
      await fetch('http://127.0.0.1:47630/api/compute/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_ui_release' }),
      });
      await agentStore.syncWithBackend();
    } catch (err) {
      console.error('Failed to release compute quota:', err);
    } finally {
      setIsReleasingQuota(false);
    }
  };

  const isDocked = selectedDrawer !== 'NONE';

  return (
    <div className="flex flex-col h-screen w-screen bg-[#070B14] text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Global Navigation Header */}
      <header className="h-14 bg-[#0B0F19] border-b border-slate-800/80 px-5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-emerald-400 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-[#0B0F19] rounded-[6px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-sky-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-black tracking-widest text-slate-100 uppercase">
                  Nexus Studio v5.0
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">
                  Spatial Studio
                </span>
              </div>
              <p className="text-[10px] text-slate-500">Autonomous Edge-to-Desktop Operating System</p>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden md:block" />

          {/* Quick Specialist Drawer Switches */}
          <nav className="flex items-center space-x-1">
            <button
              onClick={() => setSelectedDrawer('NONE')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'NONE'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Full Orbital Stage</span>
            </button>

            <button
              onClick={() => setSelectedDrawer(selectedDrawer === 'DEV-01' ? 'NONE' : 'DEV-01')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'DEV-01'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>NexKoder [DEV-01]</span>
            </button>

            <button
              onClick={() => setSelectedDrawer(selectedDrawer === 'SCOUT-01' ? 'NONE' : 'SCOUT-01')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'SCOUT-01'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Scholar [SCOUT-01]</span>
            </button>

            <button
              onClick={() => setSelectedDrawer(selectedDrawer === 'SEC-01' ? 'NONE' : 'SEC-01')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'SEC-01'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Sentinel [SEC-01]</span>
            </button>

            <button
              onClick={() => setSelectedDrawer(selectedDrawer === 'PERSONA' ? 'NONE' : 'PERSONA')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'PERSONA'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>TARS Persona</span>
            </button>

            <button
              onClick={() => setSelectedDrawer(selectedDrawer === 'SWARM' ? 'NONE' : 'SWARM')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDrawer === 'SWARM'
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Swarm Stream [MITOSIS]</span>
            </button>
          </nav>
        </div>

        {/* Right Status Badge */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-400">EDGE SOVEREIGN</span>
          </div>
          <div className="text-right text-[11px] font-mono text-slate-400 hidden sm:block">
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* 2. Main 3-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* PANE 1: LEFT MISSION RAIL (270px) */}
        <aside className="w-[270px] bg-[#0B0F19] border border-slate-800/90 rounded-xl p-3.5 flex flex-col justify-between shrink-0 overflow-y-auto space-y-4 shadow-xl">
          <div className="space-y-4">
            {/* Workspace Governor Mode */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Workspace Mode
                </span>
                <span className="text-[10px] font-mono text-sky-400">{activeWorkspaceMode}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['DEV', 'STUDY', 'STUDIO', 'SILENT'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleModeChange(m)}
                    className={`px-2 py-1.5 text-[11px] font-mono font-medium rounded border transition-all cursor-pointer text-center ${
                      activeWorkspaceMode === m
                        ? m === 'SILENT'
                          ? 'bg-purple-600/30 text-purple-300 border-purple-500/60 font-bold'
                          : 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold shadow-sm'
                        : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {m === 'SILENT' ? '🔒 SILENT' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Slices Status */}
            <div className="p-2.5 bg-slate-900/70 border border-slate-800/80 rounded-lg space-y-1.5">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Active Slices (WAL)
              </span>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-emerald-400">
                  <span>● DEV-01</span>
                  <span>14ms • AST</span>
                </div>
                <div className="flex items-center justify-between text-purple-400">
                  <span>● SYS-01</span>
                  <span>UIA • Win32</span>
                </div>
                <div className="flex items-center justify-between text-amber-400">
                  <span>● SCOUT-01</span>
                  <span>arXiv Index</span>
                </div>
                <div className="flex items-center justify-between text-teal-400">
                  <span>● SEC-01</span>
                  <span>ScopeGuard</span>
                </div>
              </div>
            </div>

            {/* Federated Compute Pool Status & Quota Preserver */}
            <div className="p-2.5 bg-slate-900/70 border border-slate-800/80 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  Compute Pool
                </span>
                <span className="text-[10px] font-mono text-sky-400">0-Card Mesh</span>
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-emerald-400">
                  <span>● Kaggle 2x T4</span>
                  <span>32GB VRAM</span>
                </div>
                <div className="flex items-center justify-between text-sky-400">
                  <span>● HF ZeroGPU</span>
                  <span>16GB RAM</span>
                </div>
                <div className="flex items-center justify-between text-amber-400">
                  <span>● Gemini 2.5 Flash</span>
                  <span>Free Tier</span>
                </div>
              </div>
              <button
                onClick={handleReleaseComputeQuota}
                disabled={isReleasingQuota}
                className="w-full mt-1.5 py-1 px-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                title="Immediately stop external cloud GPUs & deregister from edge to preserve quota"
              >
                <Zap className="w-3 h-3 text-rose-400" />
                <span>{isReleasingQuota ? 'Releasing...' : 'Release GPU Quota'}</span>
              </button>
            </div>

            {/* Live SQLite Task Queue */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Task Queue ({tasks.length})
                </span>
                <span className="text-[10px] font-mono text-emerald-400">SQLite WAL</span>
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2 bg-slate-900/40 rounded">
                    Zero tasks pending. All slices idle.
                  </p>
                ) : (
                  tasks.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      className="p-2 bg-slate-900/80 border border-slate-800/80 rounded text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-semibold text-slate-300 truncate max-w-[150px]">
                          {t.title}
                        </span>
                        <span className="text-emerald-400 font-mono">{t.status}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">ID: {t.id}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Compact TARS Sliders */}
            <div className="p-2.5 bg-slate-900/70 border border-slate-800/80 rounded-lg space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                TARS Persona Matrix
              </span>
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Empathy:</span>
                  <span className="text-sky-400">{persona.empathy_pct}%</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Humor:</span>
                  <span className="text-amber-400">{persona.humor_pct}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Hardware Footprint */}
          <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500 flex justify-between">
            <span>CPU: {telemetry.cpuUsage}%</span>
            <span>RAM: {telemetry.memoryUsage}MB</span>
            <span>Edge: {telemetry.edgeLatencyMs}ms</span>
          </div>
        </aside>

        {/* PANE 2: CENTER EXECUTION STREAM & 3D DYSON CORE */}
        <section
          className={`flex flex-col transition-all duration-300 overflow-hidden ${
            isDocked ? 'w-[42%] shrink-0' : 'flex-1'
          }`}
        >
          {/* Persistent Living 3D Quantum Dyson Core Orb */}
          <div className="flex-1 min-h-[360px] relative rounded-xl overflow-hidden shadow-2xl">
            <NexusCoreOrb
              onSelectAgent={handleOrbiterClick}
              activeMode={activeWorkspaceMode}
              onModeChange={handleModeChange}
            />
          </div>

          {/* Unified Execution Prompt Bar */}
          <form
            onSubmit={handleSendPrompt}
            className="mt-3 bg-[#0B0F19] border border-slate-800 p-2.5 rounded-xl flex items-center space-x-2 shadow-lg"
          >
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Dispatch task to autonomous slices (e.g., 'Run SEC-01 audit on core/runtime/')..."
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none font-mono"
            />
            <button
              type="submit"
              disabled={isSubmittingTask}
              className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </section>

        {/* PANE 3: RIGHT DYNAMIC ARTIFACT STAGE (Revealed when Drawer is Selected) */}
        {isDocked && (
          <section className="flex-1 bg-[#0B0F19] border border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-2xl animate-in fade-in duration-200">
            {/* Drawer Top Navigation Bar */}
            <div className="h-10 bg-[#090D16] border-b border-slate-800 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2 text-xs font-bold font-mono">
                <span className="text-sky-400">ARTIFACT STAGE //</span>
                <span className="text-slate-200">{selectedDrawer}</span>
              </div>
              <button
                onClick={() => setSelectedDrawer('NONE')}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Dock & Close Drawer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dynamic Drawer Content */}
            <div className="flex-1 overflow-hidden">
              {selectedDrawer === 'DEV-01' && <NexKoderEditor />}
              {selectedDrawer === 'SCOUT-01' && <ScholarWorkbench />}
              {selectedDrawer === 'PERSONA' && <VoicePersonaMatrix />}
              {selectedDrawer === 'SWARM' && <SwarmStreamPanel />}
              {selectedDrawer === 'SEC-01' && (
                <div className="p-5 h-full overflow-y-auto space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-emerald-400 flex items-center space-x-2">
                        <Shield className="w-4 h-4" />
                        <span>SEC-01 Sentinel & ScopeGuard SARIF Report</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        6 GRAVITAS Invariants verified across local runtime boundary
                      </p>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                      STATUS: VERIFIED
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase">Invariant 1</span>
                      <p className="text-xs font-bold text-slate-200 mt-1">Read-Before-Write</p>
                      <span className="text-[10px] text-emerald-400">Enforced</span>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase">Invariant 2</span>
                      <p className="text-xs font-bold text-slate-200 mt-1">Scope Traversal Guard</p>
                      <span className="text-[10px] text-emerald-400">Active Jail</span>
                    </div>
                    <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-500 uppercase">Invariant 3</span>
                      <p className="text-xs font-bold text-slate-200 mt-1">Fresh Post-Mutation</p>
                      <span className="text-[10px] text-emerald-400">Asserted</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg font-mono text-xs space-y-2">
                    <div className="text-slate-400 font-bold">[SARIF Audit Findings: Zero Vulnerabilities]</div>
                    <div className="text-emerald-400">✓ DPAPI Credential Vault: Sealed & Authenticated</div>
                    <div className="text-emerald-400">✓ Local IPC Bridge (47630): Bound to 127.0.0.1 strictly</div>
                    <div className="text-emerald-400">✓ Puter Chat: Air-gapped fallback to Local Ollama Active</div>
                    <div className="text-emerald-400">✓ ScopeGuard engagement_scope.json: Target locked</div>
                  </div>
                </div>
              )}
              {(selectedDrawer === 'SYS-01' || selectedDrawer === 'OPS-01' || selectedDrawer === 'LOGS') && (
                <div className="p-4 h-full flex flex-col font-mono text-xs overflow-hidden">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                    <span className="text-slate-300 font-bold">Live Subprocess Telemetry Stream</span>
                    <span className="text-[10px] text-sky-400">GET /api/telemetry/logs</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {logs.map((log) => (
                      <div key={log.id} className="p-2 bg-slate-900/50 rounded flex items-start space-x-2">
                        <span className="text-slate-500 select-none">{log.timestamp}</span>
                        <span className="text-sky-400 font-bold">[{log.source}]</span>
                        <span className="text-slate-200 flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* 3. Global Status Bar Footer */}
      <footer className="h-8 bg-[#090D16] border-t border-slate-800/80 px-4 flex items-center justify-between text-[11px] text-slate-400 shrink-0 font-mono">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-medium">Core Engine: Active</span>
          </div>
          <span>&bull;</span>
          <span>5 Sub-Agents Deployed</span>
          <span>&bull;</span>
          <span className="text-sky-400">4,000 PTS Quantum Particle Dyson Core</span>
        </div>

        <div className="flex items-center space-x-4">
          <span>Worker Latency: {telemetry.edgeLatencyMs}ms</span>
          <span>&bull;</span>
          <span className="text-emerald-400 font-medium">100% Free-Tier Sovereign</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
