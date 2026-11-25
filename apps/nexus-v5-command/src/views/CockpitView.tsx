import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Loader2,
  Lock,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type {
  CommandDispatchResult,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
} from '@/types';

export interface CockpitViewProps {
  onNavigate?: (tab: NavTabId) => void;
}

interface StockQuoteResponse {
  success?: boolean;
  symbol?: string;
  price?: number;
  previous_close?: number;
  change?: number;
  change_percent?: number;
  currency?: string;
  high?: number;
  low?: number;
  volume?: number;
  timestamp?: number;
  error?: string;
}

interface AwayStatusResponse {
  success?: boolean;
  is_locked?: boolean;
  is_away?: boolean;
  is_monitoring?: boolean;
  double_clap_count?: number;
  pending_digest_count?: number;
  last_rms?: number;
  auto_wake?: boolean;
  error?: string;
}

function formatMemory(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

function formatUptime(totalSecs: number): string {
  const secs = Math.max(0, Math.floor(totalSecs));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${mins}m ${String(rem).padStart(2, '0')}s`;
  return `${rem}s`;
}

function formatTimestamp(raw: string): string {
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(11, 19) || raw;
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getReactorTheme(telemetry: TelemetrySnapshot) {
  if (telemetry.estopActive || telemetry.securityState === 'LOCKED') {
    return {
      primary: '#ef4444',
      secondary: '#f59e0b',
      glow: 'rgba(239, 68, 68, 0.36)',
      badgeBg: 'bg-red-500/15 border-red-500/40 text-red-300',
      label: 'E-STOP LOCKED',
      pulseSpeed: 1.9,
    };
  }
  if (telemetry.securityState === 'ELEVATED') {
    return {
      primary: '#f59e0b',
      secondary: '#22d3ee',
      glow: 'rgba(245, 158, 11, 0.32)',
      badgeBg: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
      label: 'ELEVATED GUARD',
      pulseSpeed: 1.4,
    };
  }
  if (telemetry.workspaceMode === 'SILENT') {
    return {
      primary: '#22d3ee',
      secondary: '#94a3b8',
      glow: 'rgba(34, 211, 238, 0.28)',
      badgeBg: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200',
      label: 'AIR-GAP NOMINAL',
      pulseSpeed: 0.75,
    };
  }
  if (telemetry.workspaceMode === 'STUDIO') {
    return {
      primary: '#22d3ee',
      secondary: '#10b981',
      glow: 'rgba(34, 211, 238, 0.32)',
      badgeBg: 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200',
      label: 'STUDIO HARMONIC',
      pulseSpeed: 1.2,
    };
  }
  if (telemetry.workspaceMode === 'STUDY') {
    return {
      primary: '#34d399',
      secondary: '#10b981',
      glow: 'rgba(52, 211, 153, 0.28)',
      badgeBg: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
      label: 'DEEP FOCUS',
      pulseSpeed: 0.85,
    };
  }
  return {
    primary: '#10b981',
    secondary: '#22d3ee',
    glow: 'rgba(16, 185, 129, 0.34)',
    badgeBg: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
    label: 'CORE NOMINAL',
    pulseSpeed: 1.0,
  };
}

interface NeuralReactorProps {
  telemetry: TelemetrySnapshot;
  isOnline: boolean;
  onNavigate?: (tab: NavTabId) => void;
}

function NeuralCoreReactor({ telemetry, isOnline, onNavigate }: NeuralReactorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const theme = useMemo(() => getReactorTheme(telemetry), [telemetry]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let phase = 0;

    const nodes = Array.from({ length: 18 }, (_, idx) => ({
      angle: (idx / 18) * Math.PI * 2,
      radiusScale: 0.62 + (idx % 3) * 0.14,
      speed: (idx % 2 === 0 ? 1 : -1) * (0.004 + (idx % 4) * 0.0018),
      size: idx % 3 === 0 ? 2.4 : 1.5,
    }));

    const drawFrame = () => {
      const size = 240;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const loadFactor = Math.min(1, Math.max(0.15, telemetry.cpuUsagePct / 100));
      const pulse = 1 + Math.sin(phase * 2.2) * (0.035 + loadFactor * 0.03);

      // Core ambient halo
      const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, 98);
      halo.addColorStop(0, `${theme.primary}55`);
      halo.addColorStop(0.55, `${theme.secondary}1f`);
      halo.addColorStop(1, 'rgba(5, 8, 11, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, 98, 0, Math.PI * 2);
      ctx.fill();

      // Synaptic lattice connections
      const coords = nodes.map((n) => {
        const a = n.angle + phase * n.speed * 60 * theme.pulseSpeed;
        const r = 74 * n.radiusScale * pulse;
        return {
          x: cx + Math.cos(a) * r,
          y: cy + Math.sin(a) * r,
          size: n.size,
        };
      });

      ctx.lineWidth = 0.8;
      for (let i = 0; i < coords.length; i += 1) {
        const curr = coords[i];
        const next = coords[(i + 1) % coords.length];
        const opp = coords[(i + 6) % coords.length];
        ctx.strokeStyle = `${theme.secondary}2e`;
        ctx.beginPath();
        ctx.moveTo(curr.x, curr.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();

        if (i % 3 === 0) {
          ctx.strokeStyle = `${theme.primary}26`;
          ctx.beginPath();
          ctx.moveTo(curr.x, curr.y);
          ctx.lineTo(opp.x, opp.y);
          ctx.stroke();
        }
      }

      // Neural orbital nodes
      for (let i = 0; i < coords.length; i += 1) {
        const pt = coords[i];
        ctx.fillStyle = i % 2 === 0 ? theme.primary : theme.secondary;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Inner reactor plasma core
      const coreRadius = 26 * pulse;
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreRadius);
      coreGrad.addColorStop(0, '#ecfdf5');
      coreGrad.addColorStop(0.45, theme.primary);
      coreGrad.addColorStop(1, `${theme.secondary}18`);
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      if (!prefersReduced) {
        phase += 0.016 * theme.pulseSpeed;
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame();
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [telemetry.cpuUsagePct, theme]);

  return (
    <section className="matrix-panel holo-ring rounded-2xl p-6 flex flex-col justify-between gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300/80">
            Nexus Core // Neural Reactor
          </div>
          <h2 className="text-lg font-semibold text-emerald-50 mt-1">
            Sovereign Execution Matrix
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono ${theme.badgeBg}`}
        >
          {telemetry.estopActive || telemetry.securityState === 'LOCKED' ? (
            <Lock className="w-3.5 h-3.5" />
          ) : telemetry.securityState === 'ELEVATED' ? (
            <ShieldAlert className="w-3.5 h-3.5" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5" />
          )}
          {theme.label}
        </span>
      </div>

      {/* Reactor Orb Visual */}
      <div className="relative flex items-center justify-center py-2">
        <div
          className="relative w-60 h-60 flex items-center justify-center rounded-full"
          style={{ boxShadow: `0 0 42px -12px ${theme.glow}` }}
        >
          {/* SVG Precision Orbital Reticle */}
          <svg
            viewBox="0 0 240 240"
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            <g className="origin-center animate-matrix-orbit">
              <circle
                cx="120"
                cy="120"
                r="110"
                fill="none"
                stroke={theme.primary}
                strokeOpacity="0.28"
                strokeWidth="1"
                strokeDasharray="10 6 3 6"
              />
              <circle
                cx="120"
                cy="10"
                r="3"
                fill={theme.secondary}
              />
            </g>
            <g className="origin-center animate-matrix-orbit-reverse">
              <circle
                cx="120"
                cy="120"
                r="92"
                fill="none"
                stroke={theme.secondary}
                strokeOpacity="0.34"
                strokeWidth="1.25"
                strokeDasharray="36 14 8 14"
              />
            </g>
            <circle
              cx="120"
              cy="120"
              r="52"
              fill="none"
              stroke={theme.primary}
              strokeOpacity="0.45"
              strokeWidth="1"
            />
          </svg>

          <canvas
            ref={canvasRef}
            className="w-60 h-60 rounded-full"
            aria-label="Neural Core Reactor visualization"
          />

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-100/80">
              {telemetry.workspaceMode}
            </span>
            <span className="text-sm font-mono font-bold text-white mt-0.5 matrix-text-glow">
              {isOnline ? 'ONLINE' : 'STANDBY'}
            </span>
          </div>
        </div>
      </div>

      {/* Hardware & Runtime Summary */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-xs">
        <div className="rounded-xl bg-[#05080b]/70 border border-white/8 px-3.5 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Compute Node
          </div>
          <div className="text-emerald-100 font-medium truncate mt-0.5" title={telemetry.primaryGpuName}>
            {telemetry.primaryGpuName || 'CPU Sovereign'}
          </div>
        </div>
        <div className="rounded-xl bg-[#05080b]/70 border border-white/8 px-3.5 py-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Session Uptime
          </div>
          <div className="text-cyan-200 font-mono font-medium mt-0.5 tabular-nums">
            {formatUptime(telemetry.uptimeSecs)} · {telemetry.recommendedProfile}
          </div>
        </div>
      </div>

      {onNavigate && (
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 text-xs font-medium transition-colors"
          >
            Neural Chat
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-xs font-medium transition-colors"
          >
            NexKoder IDE
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}

function getTaskStatusBadge(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED') {
    return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
  }
  if (upper === 'FAILED') {
    return 'bg-red-500/15 border-red-500/35 text-red-300';
  }
  if (upper === 'CANCELLED') {
    return 'bg-slate-500/15 border-slate-500/35 text-slate-300';
  }
  if (upper === 'IN_PROGRESS' || upper === 'RUNNING') {
    return 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200';
  }
  return 'bg-amber-500/15 border-amber-400/35 text-amber-200';
}

function isTaskCancellable(task: TaskItem): boolean {
  const upper = String(task.status || '').toUpperCase();
  return upper === 'QUEUED' || upper === 'IN_PROGRESS' || upper === 'RUNNING';
}

export function CockpitView({ onNavigate }: CockpitViewProps = {}) {
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const logs = useNexusStore((s) => s.logs);
  const isOnline = useNexusStore((s) => s.isOnline);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand);
  const cancelTask = useNexusStore((s) => s.cancelTask);

  const navigateTarget = onNavigate ?? setActiveTab;

  const [commandInput, setCommandInput] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<CommandDispatchResult | null>(null);

  const [stockSymbol, setStockSymbol] = useState('NVDA');
  const stockSymbolRef = useRef('NVDA');
  const isMountedRef = useRef(true);
  const [stockQuote, setStockQuote] = useState<StockQuoteResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [awayStatus, setAwayStatus] = useState<AwayStatusResponse | null>(null);
  const [awayLoading, setAwayLoading] = useState(false);

  const [streamTab, setStreamTab] = useState<'tasks' | 'logs'>('tasks');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const activeTaskCount = useMemo(() => {
    const queuedOrRunning = tasks.filter((t) => isTaskCancellable(t)).length;
    return Math.max(queuedOrRunning, telemetry.activeSlices);
  }, [tasks, telemetry.activeSlices]);

  const fetchMarketAndAway = useCallback(async (symbolToLoad: string) => {
    const cleanSym = symbolToLoad.trim().toUpperCase() || 'NVDA';
    stockSymbolRef.current = cleanSym;
    setStockLoading(true);
    setAwayLoading(true);

    const [stockRes, awayRes] = await Promise.all([
      ipcJson<StockQuoteResponse>(`/api/widgets/stock?symbol=${encodeURIComponent(cleanSym)}`),
      ipcJson<AwayStatusResponse>('/api/away/status'),
    ]);

    if (!isMountedRef.current) return;
    setStockQuote(stockRes);
    setStockLoading(false);
    setAwayStatus(awayRes);
    setAwayLoading(false);
  }, []);

  useEffect(() => {
    void fetchMarketAndAway(stockSymbolRef.current);
  }, [fetchMarketAndAway, telemetry.workspaceMode]);

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed || dispatching) return;
    setDispatching(true);
    try {
      const res = await dispatchCommand(trimmed);
      setLastDispatch(res);
      if (res.success) {
        setCommandInput('');
      }
    } finally {
      setDispatching(false);
    }
  };

  const handleStockSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchMarketAndAway(stockSymbol);
  };

  const handleCancelTask = async (taskId: string) => {
    setCancellingId(taskId);
    try {
      await cancelTask(taskId);
    } finally {
      setCancellingId(null);
    }
  };

  const changePositive = (stockQuote?.change ?? 0) >= 0;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Row 1: 4 Holographic Telemetry Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="matrix-panel rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="uppercase tracking-wider">RAM Memory</span>
            <HardDrive className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-mono tabular-nums">
              {formatMemory(telemetry.ramMb)}
            </span>
            <span className="text-xs font-mono text-emerald-300 tabular-nums">
              {telemetry.ramPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.ramPercent))}%` }}
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums">
            Capacity: {formatMemory(telemetry.ramTotalMb)}
          </div>
        </div>

        <div className="matrix-panel rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="uppercase tracking-wider">CPU Load</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-mono tabular-nums">
              {telemetry.cpuUsagePct.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-cyan-300 tabular-nums">
              {telemetry.cpuTempC !== null ? `${Math.round(telemetry.cpuTempC)}°C` : `${telemetry.fps} FPS`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.cpuUsagePct))}%` }}
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums">
            {telemetry.cpuCoresPhysical || '—'} cores / {telemetry.cpuCoresLogical || '—'} threads
          </div>
        </div>

        <div className="matrix-panel rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="uppercase tracking-wider">WAL Latency</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-mono tabular-nums">
              {telemetry.pingMs > 0 ? `${telemetry.pingMs} ms` : '—'}
            </span>
            <span
              className={`text-xs font-mono ${
                telemetry.wsConnected ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {telemetry.wsConnected ? 'WS LIVE' : 'HTTP'}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400/85 transition-all duration-300"
              style={{
                width: `${
                  telemetry.pingMs > 0
                    ? Math.max(15, Math.min(100, 100 - telemetry.pingMs * 1.5))
                    : 10
                }%`,
              }}
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            SQLite WAL · 127.0.0.1:47630
          </div>
        </div>

        <div className="matrix-panel rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="uppercase tracking-wider">Active Tasks</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold text-white font-mono tabular-nums">
              {activeTaskCount}
            </span>
            <span className="text-xs font-mono text-cyan-300 tabular-nums">
              {tasks.length} logged
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${Math.min(100, activeTaskCount * 16 + (tasks.length > 0 ? 12 : 0))}%` }}
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Security: {telemetry.securityState}
          </div>
        </div>
      </div>

      {/* Row 2: Neural Reactor + Command Dispatch & Concise Market/Away Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5">
          <NeuralCoreReactor
            telemetry={telemetry}
            isOnline={isOnline}
            onNavigate={navigateTarget}
          />
        </div>

        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Command Dispatch */}
          <section className="matrix-panel rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400/85">
                  Reflex & Sovereign Router
                </div>
                <h2 className="text-base font-semibold text-white mt-0.5">
                  Command Dispatch
                </h2>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                MODE: {telemetry.workspaceMode}
              </span>
            </div>

            <form onSubmit={handleDispatchSubmit} className="flex items-center gap-3">
              <div className="relative flex-1">
                <Terminal className="w-4 h-4 text-cyan-400/80 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  disabled={dispatching || telemetry.estopActive}
                  placeholder={
                    telemetry.estopActive
                      ? 'E-STOP active — reset emergency stop before dispatching commands'
                      : 'Dispatch command, reflex trigger, or agent directive...'
                  }
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#05080b]/85 border border-white/12 focus:border-emerald-400/60 focus:outline-none text-sm text-emerald-50 placeholder-slate-500 font-mono transition-colors disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={dispatching || !commandInput.trim() || telemetry.estopActive}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-100 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dispatching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Dispatch
              </button>
            </form>

            {lastDispatch && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-mono space-y-1 ${
                  lastDispatch.success
                    ? 'bg-emerald-500/8 border-emerald-500/30 text-emerald-100'
                    : 'bg-red-500/10 border-red-500/35 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] opacity-80">
                  <span>
                    {lastDispatch.success
                      ? lastDispatch.reflex
                        ? `REFLEX · ${lastDispatch.handled_by || 'LOCAL'}`
                        : `DISPATCHED · ${lastDispatch.handled_by || 'ROUTER'}`
                      : lastDispatch.blocked
                        ? `SCOPEGUARD BLOCKED (${lastDispatch.invariant || 'INVARIANT'})`
                        : 'DISPATCH ERROR'}
                  </span>
                  {typeof lastDispatch.latency_ms === 'number' && (
                    <span className="tabular-nums">{lastDispatch.latency_ms} ms</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {lastDispatch.output ||
                    lastDispatch.response ||
                    lastDispatch.message ||
                    lastDispatch.error ||
                    'Executed'}
                </p>
              </div>
            )}
          </section>

          {/* Concise Market & Away Telemetry Card */}
          <section className="matrix-panel rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Market Ticker */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-cyan-300/85">
                  Market Telemetry
                </span>
                <form onSubmit={handleStockSearch} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={stockSymbol}
                    onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
                    maxLength={10}
                    aria-label="Stock ticker symbol"
                    className="w-20 px-2 py-1 rounded-lg bg-[#05080b]/85 border border-white/12 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-100 uppercase"
                  />
                  <button
                    type="submit"
                    disabled={stockLoading}
                    title="Refresh stock quote"
                    className="p-1.5 rounded-lg border border-white/10 hover:border-cyan-400/40 bg-white/5 text-slate-300 hover:text-cyan-200 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${stockLoading ? 'animate-spin' : ''}`} />
                  </button>
                </form>
              </div>

              {stockQuote?.success ? (
                <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-4 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-mono font-bold text-white">
                      {stockQuote.symbol || stockSymbol}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-mono tabular-nums ${
                        changePositive ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {changePositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      {changePositive ? '+' : ''}
                      {(stockQuote.change ?? 0).toFixed(2)} (
                      {changePositive ? '+' : ''}
                      {(stockQuote.change_percent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="text-2xl font-mono font-semibold text-cyan-100 tabular-nums">
                    ${Number(stockQuote.price ?? 0).toFixed(2)}{' '}
                    <span className="text-xs text-slate-400 font-normal">
                      {stockQuote.currency || 'USD'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>H: ${Number(stockQuote.high ?? 0).toFixed(2)}</span>
                    <span>L: ${Number(stockQuote.low ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-4 text-xs font-mono text-slate-400">
                  {stockLoading
                    ? 'Fetching live market quote...'
                    : stockQuote?.error || 'Market feed offline'}
                </div>
              )}
            </div>

            {/* Away & Presence Status */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300/85">
                  Away & Acoustic Guard
                </span>
                <button
                  type="button"
                  onClick={() => void fetchMarketAndAway(stockSymbol)}
                  disabled={awayLoading}
                  title="Refresh presence state"
                  className="p-1.5 rounded-lg border border-white/10 hover:border-emerald-400/40 bg-white/5 text-slate-300 hover:text-emerald-200 transition-colors"
                >
                  <Radio className={`w-3.5 h-3.5 ${awayLoading ? 'animate-pulse' : ''}`} />
                </button>
              </div>

              <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">Operator Presence</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                      awayStatus?.is_away || awayStatus?.is_locked
                        ? 'bg-amber-500/15 border-amber-400/35 text-amber-200'
                        : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                    }`}
                  >
                    {awayStatus?.is_locked
                      ? 'LOCKED'
                      : awayStatus?.is_away
                        ? 'AWAY'
                        : 'PRESENT'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <div className="rounded-lg bg-white/4 px-2.5 py-1.5">
                    <div className="text-slate-400">Claps</div>
                    <div className="text-emerald-200 tabular-nums mt-0.5">
                      {awayStatus?.double_clap_count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/4 px-2.5 py-1.5">
                    <div className="text-slate-400">Digest</div>
                    <div className="text-cyan-200 tabular-nums mt-0.5">
                      {awayStatus?.pending_digest_count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/4 px-2.5 py-1.5">
                    <div className="text-slate-400">RMS</div>
                    <div className="text-slate-200 tabular-nums mt-0.5">
                      {(awayStatus?.last_rms ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Monitor: {awayStatus?.is_monitoring ? 'ACTIVE' : 'IDLE'} · Auto-Wake:{' '}
                  {awayStatus?.auto_wake ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Row 3: Live Task Queue & Telemetry Stream */}
      <section className="matrix-panel rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-300/85">
              Execution Ledger
            </div>
            <h2 className="text-base font-semibold text-white mt-0.5">
              Live Task Queue & Telemetry Stream
            </h2>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-[#05080b]/80 border border-white/10 gap-1">
            <button
              type="button"
              onClick={() => setStreamTab('tasks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                streamTab === 'tasks'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Tasks ({tasks.length})
            </button>
            <button
              type="button"
              onClick={() => setStreamTab('logs')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                streamTab === 'logs'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Telemetry Logs ({logs.length})
            </button>
          </div>
        </div>

        {streamTab === 'tasks' ? (
          tasks.length === 0 ? (
            <div className="rounded-xl bg-[#05080b]/70 border border-white/8 p-6 text-center text-xs font-mono text-slate-400">
              No queued or historical tasks in SQLite WAL yet. Dispatch a directive above to begin.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {tasks.map((task) => {
                const cancellable = isTaskCancellable(task);
                return (
                  <div
                    key={task.id}
                    className="rounded-xl bg-[#05080b]/75 border border-white/8 px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span
                          className={`px-2 py-0.5 rounded-md border ${getTaskStatusBadge(task.status)}`}
                        >
                          {task.status}
                        </span>
                        <span className="text-cyan-300/90">{task.command_type}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400">{task.source_device}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-500 tabular-nums">
                          {formatTimestamp(task.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-emerald-50 truncate">{task.prompt_raw}</p>
                      {task.result_output && (
                        <p className="text-xs font-mono text-slate-400 line-clamp-2">
                          {task.result_output}
                        </p>
                      )}
                    </div>

                    {cancellable && (
                      <button
                        type="button"
                        onClick={() => void handleCancelTask(task.id)}
                        disabled={cancellingId === task.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-xs font-mono transition-colors disabled:opacity-50 shrink-0"
                      >
                        {cancellingId === task.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : logs.length === 0 ? (
          <div className="rounded-xl bg-[#05080b]/70 border border-white/8 p-6 text-center text-xs font-mono text-slate-400">
            Telemetry event stream idle.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-xs">
            {logs.map((entry) => {
              const lvl = String(entry.level || 'INFO').toUpperCase();
              const levelClass =
                lvl === 'ERROR' || lvl === 'CRITICAL'
                  ? 'text-red-300'
                  : lvl === 'WARN' || lvl === 'WARNING'
                    ? 'text-amber-300'
                    : lvl === 'SUCCESS'
                      ? 'text-emerald-300'
                      : 'text-cyan-300';

              return (
                <div
                  key={entry.id}
                  className="rounded-xl bg-[#05080b]/75 border border-white/8 px-3.5 py-2.5 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 flex items-start gap-2.5">
                    <Activity className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${levelClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={levelClass}>{lvl}</span>
                        <span className="text-slate-400">[{entry.source}]</span>
                        <span className="text-slate-500 tabular-nums">
                          {formatTimestamp(entry.created_at)}
                        </span>
                      </div>
                      <p className="text-slate-200 break-words mt-0.5">{entry.message}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                    {entry.latency_ms}ms
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default CockpitView;
