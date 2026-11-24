import React, { useState, useEffect } from 'react';
import {
  Users,
  Zap,
  Split,
  Trash2,
  RefreshCw,
  PlusCircle,
  AlertTriangle,
  Layers,
  Sparkles,
  ShieldAlert,
  CornerDownRight,
  Send,
  X,
} from 'lucide-react';

export interface EphemeralAgent {
  agent_id: string;
  swarm_id: string;
  parent_id: string;
  anchor_orbiter: 'DEV-01' | 'SYS-01' | 'SCOUT-01' | 'SEC-01' | 'OPS-01' | string;
  role_title: string;
  objective: string;
  system_prompt?: string;
  allowed_tools: string[];
  status: 'SPAWNED' | 'ACTIVE' | 'WORKING' | 'DISSOLVED' | 'ABORTED' | string;
  depth: number;
  token_budget?: number;
  result_summary?: string;
  created_at: string;
  completed_at?: string;
}

export interface SwarmGroup {
  swarm_id: string;
  agents: EphemeralAgent[];
}

const ORBITER_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  'DEV-01':   { bg: 'bg-[#00f5d4]/10', text: 'text-[#00f5d4]', border: 'border-[#00f5d4]/30', hex: '#00f5d4' },
  'SYS-01':   { bg: 'bg-[#a855f7]/10', text: 'text-[#a855f7]', border: 'border-[#a855f7]/30', hex: '#a855f7' },
  'SCOUT-01': { bg: 'bg-[#f59e0b]/10', text: 'text-[#f59e0b]', border: 'border-[#f59e0b]/30', hex: '#f59e0b' },
  'SEC-01':   { bg: 'bg-[#10b981]/10', text: 'text-[#10b981]', border: 'border-[#10b981]/30', hex: '#10b981' },
  'OPS-01':   { bg: 'bg-[#f43f5e]/10', text: 'text-[#f43f5e]', border: 'border-[#f43f5e]/30', hex: '#f43f5e' },
};

export function SwarmStreamPanel() {
  const [agents, setAgents] = useState<EphemeralAgent[]>([]);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Modal states for spawn / multiply / dissolve
  const [showSpawnModal, setShowSpawnModal] = useState<boolean>(false);
  const [spawnGoal, setSpawnGoal] = useState<string>('');
  const [spawnMode, setSpawnMode] = useState<string>('DEV');
  const [isSpawning, setIsSpawning] = useState<boolean>(false);

  const [multiplyTarget, setMultiplyTarget] = useState<EphemeralAgent | null>(null);
  const [multiplySubtask, setMultiplySubtask] = useState<string>('');
  const [isMultiplying, setIsMultiplying] = useState<boolean>(false);

  const [dissolveTarget, setDissolveTarget] = useState<EphemeralAgent | null>(null);
  const [dissolveSummary, setDissolveSummary] = useState<string>('');
  const [isDissolving, setIsDissolving] = useState<boolean>(false);

  // Fetch active swarm tree from IPC server (:47630)
  const fetchSwarmState = async () => {
    try {
      const res = await fetch('http://127.0.0.1:47630/api/swarm/active');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        setActiveCount(data.active_count || (data.agents ? data.agents.length : 0));
        setErrorMsg('');
      } else {
        setErrorMsg(`IPC error ${res.status}`);
      }
    } catch (err: any) {
      setErrorMsg('Failed to connect to IPC :47630');
    }
  };

  useEffect(() => {
    fetchSwarmState();
    const interval = setInterval(fetchSwarmState, 2500);
    return () => clearInterval(interval);
  }, []);

  // Spawn Swarm Handler
  const handleSpawnSwarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spawnGoal.trim() || isSpawning) return;
    setIsSpawning(true);
    try {
      const res = await fetch('http://127.0.0.1:47630/api/swarm/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: spawnGoal.trim(), workspace_mode: spawnMode }),
      });
      const data = await res.json();
      if (data.success) {
        setSpawnGoal('');
        setShowSpawnModal(false);
        await fetchSwarmState();
      } else {
        setErrorMsg(data.error || 'Failed to spawn swarm');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error');
    } finally {
      setIsSpawning(false);
    }
  };

  // Multiply Agent (Mitosis) Handler
  const handleMultiply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiplyTarget || !multiplySubtask.trim() || isMultiplying) return;
    setIsMultiplying(true);
    try {
      const res = await fetch('http://127.0.0.1:47630/api/swarm/multiply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_agent_id: multiplyTarget.agent_id,
          subtasks: [multiplySubtask.trim()],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMultiplyTarget(null);
        setMultiplySubtask('');
        await fetchSwarmState();
      } else {
        setErrorMsg(data.error || 'Failed mitosis');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Mitosis network error');
    } finally {
      setIsMultiplying(false);
    }
  };

  // Dissolve Agent Handler (Extracts Instincts)
  const handleDissolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dissolveTarget || isDissolving) return;
    setIsDissolving(true);
    try {
      const res = await fetch('http://127.0.0.1:47630/api/swarm/dissolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: dissolveTarget.agent_id,
          result_summary: dissolveSummary.trim() || 'Task completed successfully.',
          verified_workflow: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDissolveTarget(null);
        setDissolveSummary('');
        await fetchSwarmState();
      } else {
        setErrorMsg(data.error || 'Failed dissolution');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Dissolution network error');
    } finally {
      setIsDissolving(false);
    }
  };

  // Kill Agent Handler
  const handleKillAgent = async (agent_id: string) => {
    try {
      await fetch('http://127.0.0.1:47630/api/swarm/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id }),
      });
      await fetchSwarmState();
    } catch (err: any) {
      setErrorMsg(err.message || 'Kill request failed');
    }
  };

  // Kill Swarm Handler
  const handleKillSwarm = async (swarm_id: string) => {
    try {
      await fetch('http://127.0.0.1:47630/api/swarm/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarm_id }),
      });
      await fetchSwarmState();
    } catch (err: any) {
      setErrorMsg(err.message || 'Kill swarm failed');
    }
  };

  // Group active agents by swarm_id
  const swarmsMap = agents.reduce<Record<string, EphemeralAgent[]>>((acc, ag) => {
    acc[ag.swarm_id] = acc[ag.swarm_id] || [];
    acc[ag.swarm_id].push(ag);
    return acc;
  }, {});

  const swarmIds = Object.keys(swarmsMap);

  return (
    <div className="p-5 h-full flex flex-col font-mono text-xs overflow-hidden bg-[#090D16]">
      {/* 1. Header & Circuit Breaker Telemetry */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg">
            <Users className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Ephemeral Swarm Stream // Mitosis Engine
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded">
                v5.0 ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Self-multiplying sub-agent lifecycle with ScopeGuard tool masks & zero idle RAM
            </p>
          </div>
        </div>

        {/* Circuit Breakers & Action Buttons */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-[11px] bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="text-slate-400">Max Depth: <strong className="text-sky-400">3</strong></span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Active: <strong className="text-emerald-400">{activeCount}/16</strong></span>
          </div>

          <button
            onClick={() => setShowSpawnModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Spawn Swarm</span>
          </button>

          <button
            onClick={fetchSwarmState}
            className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
            title="Refresh Swarm State"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="mb-3 px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-rose-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Swarm Stream Tree Listing */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {swarmIds.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-xl space-y-3">
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-400 font-medium">No active ephemeral swarms running.</p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              Click &quot;Spawn Swarm&quot; to plan and initialize an autonomous multi-agent task hierarchy with automatic mitosis.
            </p>
            <button
              onClick={() => setShowSpawnModal(true)}
              className="mt-2 inline-flex items-center space-x-1.5 px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 rounded-lg font-bold transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Initialize First Swarm</span>
            </button>
          </div>
        ) : (
          swarmIds.map((swarmId) => {
            const swarmAgents = swarmsMap[swarmId] || [];
            return (
              <div key={swarmId} className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-4 space-y-3 shadow-lg">
                {/* Swarm Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-200">SWARM // {swarmId}</span>
                    <span className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-300 rounded font-mono">
                      {swarmAgents.length} Agents
                    </span>
                  </div>

                  <button
                    onClick={() => handleKillSwarm(swarmId)}
                    className="flex items-center space-x-1 px-2.5 py-1 text-[11px] text-rose-400 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded transition-colors cursor-pointer"
                    title="Terminate all agents in this swarm"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Kill Swarm</span>
                  </button>
                </div>

                {/* Agents in Swarm */}
                <div className="space-y-2">
                  {swarmAgents.map((ag) => {
                    const orbiterConfig = ORBITER_COLORS[ag.anchor_orbiter] || ORBITER_COLORS['DEV-01'];
                    const isChild = ag.depth > 1;

                    return (
                      <div
                        key={ag.agent_id}
                        className={`p-3 rounded-lg border transition-all ${
                          isChild
                            ? 'ml-6 bg-slate-900/60 border-slate-800/80 relative before:content-[""] before:absolute before:-left-4 before:top-4 before:w-3 before:h-px before:bg-slate-700'
                            : 'bg-slate-900/90 border-slate-800 shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {isChild && <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                            {/* Anchor Orbiter Tag */}
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border ${orbiterConfig.bg} ${orbiterConfig.text} ${orbiterConfig.border}`}
                            >
                              {ag.anchor_orbiter}
                            </span>
                            <span className="font-bold text-slate-200 text-xs">{ag.role_title}</span>
                            <span className="text-[10px] text-slate-500 font-mono">ID: {ag.agent_id}</span>
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* Depth Badge */}
                            <span className="px-1.5 py-0.5 text-[10px] bg-slate-800/80 text-sky-400 border border-slate-700 rounded font-mono">
                              Depth {ag.depth}
                            </span>
                            {/* Status Badge */}
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                ag.status === 'ACTIVE' || ag.status === 'WORKING'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : ag.status === 'DISSOLVED'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {ag.status}
                            </span>
                          </div>
                        </div>

                        {/* Objective */}
                        <p className="text-xs text-slate-300 mt-2 bg-slate-950/60 p-2 rounded border border-slate-800/40">
                          {ag.objective}
                        </p>

                        {/* Tools & Mitosis Controls */}
                        <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-800/60">
                          <div className="flex items-center space-x-1.5 overflow-x-auto max-w-[55%]">
                            <span className="text-[10px] text-slate-500 uppercase">Mask:</span>
                            {ag.allowed_tools && ag.allowed_tools.length > 0 ? (
                              ag.allowed_tools.slice(0, 3).map((tool) => (
                                <span
                                  key={tool}
                                  className="text-[9px] px-1.5 py-0.5 bg-slate-800/70 text-slate-400 rounded border border-slate-700"
                                >
                                  {tool}
                                </span>
                              ))
                            ) : (
                              <span className="text-[9px] text-slate-600">inherit</span>
                            )}
                            {ag.allowed_tools && ag.allowed_tools.length > 3 && (
                              <span className="text-[9px] text-slate-500 font-mono">
                                +{ag.allowed_tools.length - 3}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            {ag.depth < 3 && ag.status === 'ACTIVE' && (
                              <button
                                onClick={() => {
                                  setMultiplyTarget(ag);
                                  setMultiplySubtask('');
                                }}
                                className="flex items-center space-x-1 px-2 py-1 text-[10px] font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded transition-colors cursor-pointer"
                                title="Divide this agent into a child slice (Mitosis)"
                              >
                                <Split className="w-3 h-3 text-sky-400" />
                                <span>Mitosis</span>
                              </button>
                            )}

                            {ag.status === 'ACTIVE' && (
                              <button
                                onClick={() => {
                                  setDissolveTarget(ag);
                                  setDissolveSummary('');
                                }}
                                className="flex items-center space-x-1 px-2 py-1 text-[10px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded transition-colors cursor-pointer"
                                title="Dissolve and distill verified instinct into Sovereign WAL"
                              >
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                <span>Dissolve</span>
                              </button>
                            )}

                            {ag.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleKillAgent(ag.agent_id)}
                                className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                                title="Terminate Agent"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: Spawn Swarm */}
      {showSpawnModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-teal-400" />
                <h4 className="text-sm font-bold text-slate-100">Initialize Autonomous Swarm</h4>
              </div>
              <button
                onClick={() => setShowSpawnModal(false)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSpawnSwarm} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  High-Level Swarm Goal:
                </label>
                <textarea
                  value={spawnGoal}
                  onChange={(e) => setSpawnGoal(e.target.value)}
                  placeholder="e.g., Audit security vulnerabilities, run pytest verification, and index arXiv quantum papers..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 font-mono resize-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Workspace Mode Constraint:
                </label>
                <select
                  value={spawnMode}
                  onChange={(e) => setSpawnMode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-teal-500/50"
                >
                  <option value="DEV">DEV (Full Dev Toolchain)</option>
                  <option value="STUDY">STUDY (Scholar & Literature)</option>
                  <option value="STUDIO">STUDIO (Creative & Design)</option>
                  <option value="SILENT">SILENT (Strict Air-Gapped Loopback)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSpawnModal(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSpawning || !spawnGoal.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSpawning ? 'Spawning...' : 'Deploy Swarm'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Mitosis Multiplication */}
      {multiplyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Split className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-bold text-slate-100">Mitosis: Spawn Child Slice</h4>
              </div>
              <button
                onClick={() => setMultiplyTarget(null)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Parent: <strong className="text-slate-200">{multiplyTarget.role_title}</strong> (Depth {multiplyTarget.depth} &rarr; Child Depth {multiplyTarget.depth + 1})
            </p>

            <form onSubmit={handleMultiply} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Child Sub-Objective:
                </label>
                <textarea
                  value={multiplySubtask}
                  onChange={(e) => setMultiplySubtask(e.target.value)}
                  placeholder="e.g., Deep dive into unit tests for AST parser..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500/50 font-mono resize-none"
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMultiplyTarget(null)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMultiplying || !multiplySubtask.trim()}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Split className="w-3.5 h-3.5" />
                  <span>{isMultiplying ? 'Multiplying...' : 'Execute Mitosis'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Dissolve & Instinct Extract */}
      {dissolveTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-slate-100">Dissolve & Extract Instinct</h4>
              </div>
              <button
                onClick={() => setDissolveTarget(null)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Agent: <strong className="text-slate-200">{dissolveTarget.role_title}</strong> ({dissolveTarget.agent_id})
            </p>

            <form onSubmit={handleDissolve} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Verified Result Summary (Instinct):
                </label>
                <textarea
                  value={dissolveSummary}
                  onChange={(e) => setDissolveSummary(e.target.value)}
                  placeholder="Summarize the verified resolution or pattern to commit to learned_instincts..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono resize-none"
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDissolveTarget(null)}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDissolving}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isDissolving ? 'Dissolving...' : 'Commit & Dissolve'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SwarmStreamPanel;
