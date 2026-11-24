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
  Wifi,
  Sparkles,
  Server,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Filter,
  Sliders,
  MessageSquare,
  FileText,
  Image,
  Globe,
  Settings,
  Phone,
  Paperclip
} from 'lucide-react';
import { useAgentStore, agentStore } from '../store/agentStore';
import { NexusCoreOrb } from '../components/NexusCoreOrb';
import { AgentTownCanvas } from '../components/AgentTownCanvas';
import { NexKoderEditor } from '../components/command_center/NexKoderEditor';
import { ScholarWorkbench } from '../components/command_center/ScholarWorkbench';
import { VoicePersonaMatrix } from '../components/command_center/VoicePersonaMatrix';

type ActiveTab = 'overview' | 'agent_town' | 'nexkoder' | 'scholar' | 'persona' | 'telemetry_logs';

interface CommandCenterViewProps {
  onNavigateTab?: (tabId: string) => void;
}

export function CommandCenterView({ onNavigateTab }: CommandCenterViewProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const { agents, tasks, logs, telemetry } = useAgentStore();
  const [logFilter, setLogFilter] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    agentStore.syncWithBackend();
    const interval = setInterval(() => {
      agentStore.syncWithBackend();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'all') return true;
    return log.level === logFilter;
  });

  return (
    <div className="flex flex-col h-full w-full bg-[#070B14] text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Global Navigation Header */}
      <header className="h-13 bg-[#0B0F19] border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center space-x-3 overflow-x-auto scrollbar-none">
          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-emerald-400 p-0.5 shadow-md shadow-sky-500/20">
              <div className="w-full h-full bg-[#0B0F19] rounded-[5px] flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="text-xs font-black tracking-widest text-slate-100 uppercase">
                  Nexus Command Center
                </h1>
                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">
                  v5.0
                </span>
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden md:block shrink-0" />

          {/* Main Navigation Tabs */}
          <nav className="flex items-center space-x-1 shrink-0">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Core Orb</span>
            </button>

            <button
              onClick={() => setActiveTab('agent_town')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'agent_town'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Agent Town</span>
            </button>

            <button
              onClick={() => setActiveTab('nexkoder')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'nexkoder'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm shadow-purple-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>NexKoder</span>
            </button>

            <button
              onClick={() => setActiveTab('scholar')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'scholar'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Scholar</span>
            </button>

            <button
              onClick={() => setActiveTab('persona')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'persona'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Persona Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry_logs')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'telemetry_logs'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Telemetry</span>
            </button>
          </nav>
        </div>

        {/* Right Status Badge Indicator & Quick Widget Bar */}
        <div className="flex items-center space-x-2 shrink-0">
          {onNavigateTab && (
            <div className="hidden xl:flex items-center space-x-1 bg-black/40 border border-slate-800 rounded-lg p-1">
              <button
                onClick={() => onNavigateTab('DASHBOARD')}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                title="Voice & Agent Workstation"
              >
                Voice Agent
              </button>
              <button
                onClick={() => onNavigateTab('AI CHAT')}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/10"
                title="AI Chat Interface"
              >
                AI Chat
              </button>
              <button
                onClick={() => onNavigateTab('WHITEBOARD')}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-purple-300 hover:bg-purple-500/10"
                title="Whiteboard Studio"
              >
                Whiteboard
              </button>
              <button
                onClick={() => onNavigateTab('NOTES')}
                className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-amber-300 hover:bg-amber-500/10"
                title="Sovereign Notes"
              >
                Notes
              </button>
            </div>
          )}

          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-emerald-400">EDGE SOVEREIGN</span>
          </div>

          <div className="text-right text-[10px] font-mono text-slate-400 hidden sm:block">
            <span>{currentTime}</span>
          </div>
        </div>
      </header>

      {/* 2. Main Content Workspace */}
      <main className="flex-1 p-3 overflow-hidden flex flex-col">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-12 gap-3 h-full">
            {/* Left 8 Cols: 3D WebGL Particle Sphere */}
            <div className="col-span-12 lg:col-span-8 h-full flex flex-col">
              <NexusCoreOrb />
            </div>

            {/* Right 4 Cols: Quick Telemetry, Tasks & Agents */}
            <div className="col-span-12 lg:col-span-4 h-full flex flex-col space-y-3 overflow-hidden">
              {/* Telemetry Metric Cards */}
              <div className="grid grid-cols-2 gap-2.5 shrink-0">
                <div className="bg-[#0B0F19] border border-slate-800 p-3 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-xs font-medium">CPU Load</span>
                    <Activity className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-sky-400">
                    {telemetry.cpuUsage}%
                  </div>
                  <div className="w-full bg-slate-800 h-1 rounded-full mt-2">
                    <div
                      className="bg-sky-400 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${telemetry.cpuUsage * 2}%` }}
                    />
                  </div>
                </div>

                <div className="bg-[#0B0F19] border border-slate-800 p-3 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-xs font-medium">Memory (WAL)</span>
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {telemetry.memoryUsage} MB
                  </div>
                  <div className="w-full bg-slate-800 h-1 rounded-full mt-2">
                    <div
                      className="bg-emerald-400 h-1 rounded-full transition-all duration-300"
                      style={{ width: `${(telemetry.memoryUsage / 1024) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Active Tasks Feed */}
              <div className="bg-[#0B0F19] border border-slate-800 p-3.5 rounded-xl flex-1 flex flex-col overflow-hidden shadow-lg">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Active Tasks Queue ({tasks.length})
                  </h3>
                  <span className="text-[10px] text-sky-400 font-mono">100% Free-Tier</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {tasks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500">
                      No active task slices currently running.
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              task.priority === 'critical'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : task.priority === 'high'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {task.priority}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {task.createdAt}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-200 line-clamp-2">
                          {task.title}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agent_town' && (
          <div className="h-full w-full flex flex-col">
            <AgentTownCanvas />
          </div>
        )}

        {activeTab === 'nexkoder' && (
          <div className="h-full w-full flex flex-col">
            <NexKoderEditor />
          </div>
        )}

        {activeTab === 'scholar' && (
          <div className="h-full w-full flex flex-col">
            <ScholarWorkbench />
          </div>
        )}

        {activeTab === 'persona' && (
          <div className="h-full w-full flex flex-col">
            <VoicePersonaMatrix />
          </div>
        )}

        {activeTab === 'telemetry_logs' && (
          <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-4 h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Real-Time Telemetry & IPC Stream
                </h2>
              </div>

              <div className="flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-md px-2 py-1 focus:outline-none"
                >
                  <option value="all">All Levels</option>
                  <option value="info">Info</option>
                  <option value="warn">Warnings</option>
                  <option value="error">Errors</option>
                  <option value="success">Success</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1.5 pr-1">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  No telemetry logs matching filter.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-slate-900/40 border border-slate-800/60 flex items-start space-x-2.5 leading-relaxed"
                  >
                    <span className="text-slate-500 shrink-0 text-[11px]">{log.timestamp}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                        log.level === 'error'
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : log.level === 'warn'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : log.level === 'success'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-400 font-semibold shrink-0">[{log.source}]</span>
                    <span className="text-slate-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default CommandCenterView;
