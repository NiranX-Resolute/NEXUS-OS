import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Eye,
  Layers,
  Lock,
  MemoryStick,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { NavTabId, TaskItem, TelemetrySnapshot, WorkspaceMode } from '../types';

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

interface CreateTaskResponse {
  success?: boolean;
  task?: TaskItem;
  error?: string;
}

const MODE_PALETTE: Record<
  WorkspaceMode,
  { primary: string; secondary: string; label: string; badgeClass: string }
> = {
  DEV: {
    primary: '#06b6d4',
    secondary: '#34d399',
    label: 'Engineering & AST',
    badgeClass: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-300',
  },
  STUDY: {
    primary: '#f59e0b',
    secondary: '#22d3ee',
    label: 'Academic & Research',
    badgeClass: 'border-amber-400/35 bg-amber-500/10 text-amber-300',
  },
  STUDIO: {
    primary: '#34d399',
    secondary: '#06b6d4',
    label: 'Creative Audio / Vision',
    badgeClass: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
  },
  SILENT: {
    primary: '#818cf8',
    secondary: '#64748b',
    label: 'Air-Gapped Sovereign',
    badgeClass: 'border-indigo-400/35 bg-indigo-500/10 text-indigo-300',
  },
};

function formatMemory(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatNum(val: unknown, digits = 2): string {
  return typeof val === 'number' && Number.isFinite(val) ? val.toFixed(digits) : '--';
}

function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '0m 00s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function isCancellableStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s === 'PENDING' || s === 'QUEUED' || s === 'RUNNING' || s === 'IN_PROGRESS';
}

function taskStatusBadge(status: string): string {
  const s = status.toUpperCase();
  if (s === 'COMPLETED' || s === 'DONE' || s === 'SUCCESS') {
    return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  }
  if (s === 'RUNNING' || s === 'IN_PROGRESS') {
    return 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200';
  }
  if (s === 'PENDING' || s === 'QUEUED') {
    return 'border-amber-400/30 bg-amber-500/10 text-amber-300';
  }
  if (s === 'CANCELLED' || s === 'FAILED' || s === 'ERROR') {
    return 'border-rose-400/30 bg-rose-500/10 text-rose-300';
  }
  return 'border-slate-500/30 bg-slate-800/40 text-slate-300';
}

interface HoloCoreReactorProps {
  telemetry: TelemetrySnapshot;
  activeTaskCount: number;
  onNavigate?: (tab: NavTabId) => void;
}

function HoloCoreReactor({ telemetry, activeTaskCount, onNavigate }: HoloCoreReactorProps) {
  const modeTheme = MODE_PALETTE[telemetry.workspaceMode] ?? MODE_PALETTE.DEV;
  const isLocked = telemetry.securityState === 'LOCKED' || telemetry.estopActive;
  const isElevated = telemetry.securityState === 'ELEVATED';
  const isSilent = telemetry.workspaceMode === 'SILENT';

  const coreColor = isLocked
    ? '#f43f5e'
    : isElevated
      ? '#f59e0b'
      : modeTheme.primary;

  const secondaryColor = isLocked
    ? '#fb7185'
    : isElevated
      ? '#fbbf24'
      : modeTheme.secondary;

  const outerSpeed = isLocked ? '0s' : isElevated ? '14s' : isSilent ? '42s' : '24s';
  const innerSpeed = isLocked ? '0s' : isElevated ? '9s' : isSilent ? '30s' : '16s';

  const cpuRatio = Math.max(0, Math.min(100, telemetry.cpuPercent)) / 100;
  const ramRatio = Math.max(0, Math.min(100, telemetry.ramPercent)) / 100;
  const cpuCircumference = 2 * Math.PI * 116;
  const ramCircumference = 2 * Math.PI * 96;

  return (
    <div className="aether-bracket-card rounded-2xl p-6 flex flex-col justify-between gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">
            Aerospace Holo-Core
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Sovereign Reactor Telemetry
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${modeTheme.badgeClass}`}
          >
            <Radio className="h-3 w-3" />
            {telemetry.workspaceMode}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${
              isLocked
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                : isElevated
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-300'
                  : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {isLocked ? (
              <Lock className="h-3 w-3" />
            ) : isElevated ? (
              <ShieldAlert className="h-3 w-3" />
            ) : (
              <ShieldCheck className="h-3 w-3" />
            )}
            {telemetry.securityState}
          </span>
        </div>
      </div>

      <div className="relative flex items-center justify-center py-2">
        <svg
          viewBox="0 0 300 300"
          className="h-64 w-64 select-none drop-shadow-[0_0_24px_rgba(6,182,212,0.18)]"
          role="img"
          aria-label={`Holo-Core Reactor ${telemetry.securityState} in ${telemetry.workspaceMode} mode`}
        >
          <defs>
            <radialGradient id="aetherCoreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={coreColor} stopOpacity="0.34" />
              <stop offset="55%" stopColor={secondaryColor} stopOpacity="0.1" />
              <stop offset="100%" stopColor="#050a14" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="aetherArcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={coreColor} />
              <stop offset="100%" stopColor={secondaryColor} />
            </linearGradient>
          </defs>

          <circle cx="150" cy="150" r="138" fill="url(#aetherCoreGlow)" />

          {/* Static precision degree ring */}
          <circle
            cx="150"
            cy="150"
            r="134"
            fill="none"
            stroke="rgba(148, 163, 184, 0.16)"
            strokeWidth="1"
            strokeDasharray="2 6"
          />

          {/* CPU arc gauge */}
          <circle
            cx="150"
            cy="150"
            r="116"
            fill="none"
            stroke="rgba(148, 163, 184, 0.1)"
            strokeWidth="4"
          />
          <circle
            cx="150"
            cy="150"
            r="116"
            fill="none"
            stroke="url(#aetherArcGrad)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${cpuCircumference}`}
            strokeDashoffset={`${cpuCircumference * (1 - cpuRatio)}`}
            transform="rotate(-90 150 150)"
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />

          {/* Outer rotating orbital segments */}
          <g>
            {!isLocked && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 150 150"
                to="360 150 150"
                dur={outerSpeed}
                repeatCount="indefinite"
              />
            )}
            <circle
              cx="150"
              cy="150"
              r="125"
              fill="none"
              stroke={coreColor}
              strokeOpacity="0.45"
              strokeWidth="1.5"
              strokeDasharray="28 18 8 18"
            />
            <circle cx="150" cy="25" r="3" fill={coreColor} />
            <circle cx="150" cy="275" r="3" fill={secondaryColor} />
          </g>

          {/* RAM arc gauge */}
          <circle
            cx="150"
            cy="150"
            r="96"
            fill="none"
            stroke="rgba(148, 163, 184, 0.1)"
            strokeWidth="3"
          />
          <circle
            cx="150"
            cy="150"
            r="96"
            fill="none"
            stroke={secondaryColor}
            strokeOpacity="0.85"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${ramCircumference}`}
            strokeDashoffset={`${ramCircumference * (1 - ramRatio)}`}
            transform="rotate(90 150 150)"
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />

          {/* Counter-rotating inner tactical reticle */}
          <g>
            {!isLocked && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="360 150 150"
                to="0 150 150"
                dur={innerSpeed}
                repeatCount="indefinite"
              />
            )}
            <circle
              cx="150"
              cy="150"
              r="78"
              fill="none"
              stroke={coreColor}
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeDasharray="16 10"
            />
            <polygon
              points="150,84 207,117 207,183 150,216 93,183 93,117"
              fill="rgba(9, 19, 34, 0.55)"
              stroke={secondaryColor}
              strokeOpacity="0.42"
              strokeWidth="1.25"
            />
          </g>

          {/* Center Core Nucleus */}
          <circle
            cx="150"
            cy="150"
            r="48"
            fill="rgba(5, 10, 20, 0.9)"
            stroke={coreColor}
            strokeWidth="1.75"
          >
            {!isLocked && (
              <animate
                attributeName="stroke-opacity"
                values="0.5;1;0.5"
                dur="2.8s"
                repeatCount="indefinite"
              />
            )}
          </circle>

          <text
            x="150"
            y="141"
            textAnchor="middle"
            fill={coreColor}
            fontSize="10"
            fontFamily="var(--font-mono)"
            letterSpacing="2"
          >
            {telemetry.status}
          </text>
          <text
            x="150"
            y="160"
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize="15"
            fontWeight="700"
            fontFamily="var(--font-mono)"
          >
            {isLocked ? 'HALTED' : telemetry.workspaceMode}
          </text>
          <text
            x="150"
            y="175"
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            {activeTaskCount} ACTIVE
          </text>
        </svg>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-700/40 bg-[#050a14]/70 px-4 py-3 text-xs">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Mode Profile
            </p>
            <p className="mt-1 truncate font-medium text-slate-200">{modeTheme.label}</p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              GPU Enclave
            </p>
            <p className="mt-1 truncate font-mono text-cyan-300">
              {telemetry.vramTotalMb > 0
                ? `${formatMemory(telemetry.vramFreeMb)} free`
                : telemetry.gpuName}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Uptime
            </p>
            <p className="mt-1 font-mono text-emerald-300">
              {formatUptime(telemetry.uptimeSecs)}
            </p>
          </div>
        </div>

        {onNavigate && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/50 hover:bg-cyan-500/20"
            >
              Neural Chat
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:border-emerald-400/50 hover:bg-emerald-500/20"
            >
              NexKoder IDE
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CockpitView({ onNavigate }: CockpitViewProps) {
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand);
  const cancelTask = useNexusStore((s) => s.cancelTask);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [promptInput, setPromptInput] = useState('');
  const [dispatchTarget, setDispatchTarget] = useState<'command' | 'task'>('command');
  const [isDispatching, setIsDispatching] = useState(false);
  const [lastDispatchNote, setLastDispatchNote] = useState<{
    ok: boolean;
    text: string;
    meta?: string;
  } | null>(null);

  const [symbolInput, setSymbolInput] = useState('NVDA');
  const [stockData, setStockData] = useState<StockQuoteResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [awayData, setAwayData] = useState<AwayStatusResponse | null>(null);
  const [awayLoading, setAwayLoading] = useState(false);

  const activeTaskCount = useMemo(
    () => tasks.filter((t) => isCancellableStatus(t.status)).length,
    [tasks]
  );

  const loadStock = useCallback(async (sym: string) => {
    const clean = sym.trim().toUpperCase() || 'NVDA';
    setStockLoading(true);
    try {
      const res = await ipcJson<StockQuoteResponse>(
        `/api/widgets/stock?symbol=${encodeURIComponent(clean)}`
      );
      setStockData(res);
    } catch (err) {
      setStockData({
        success: false,
        symbol: clean,
        error: err instanceof Error ? err.message : 'Market feed unavailable',
      });
    } finally {
      setStockLoading(false);
    }
  }, []);

  const loadAwayStatus = useCallback(async () => {
    setAwayLoading(true);
    try {
      const res = await ipcJson<AwayStatusResponse>('/api/away/status');
      setAwayData(res);
    } catch (err) {
      setAwayData({
        success: false,
        error: err instanceof Error ? err.message : 'Away sentinel offline',
      });
    } finally {
      setAwayLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStock('NVDA');
    void loadAwayStatus();
  }, [loadStock, loadAwayStatus]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed || isDispatching) return;

    setIsDispatching(true);
    try {
      if (dispatchTarget === 'command') {
        const res = await dispatchCommand(trimmed);
        setLastDispatchNote({
          ok: res.success,
          text:
            res.output ||
            res.error ||
            (res.success ? 'Command dispatched successfully.' : 'Command failed.'),
          meta: [
            res.handled_by,
            typeof res.latency_ms === 'number' ? `${res.latency_ms}ms` : undefined,
          ]
            .filter(Boolean)
            .join(' • '),
        });
        if (res.success) {
          setPromptInput('');
        }
      } else {
        const res = await ipcJson<CreateTaskResponse>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            prompt: trimmed,
            command_type: 'GENERAL',
            source_device: 'NEXUS_V2_COCKPIT',
          }),
        });
        if (res.success && res.task) {
          pushToast(`Queued task ${res.task.id}`, 'success');
          setLastDispatchNote({
            ok: true,
            text: `Task queued: ${res.task.prompt_raw}`,
            meta: `${res.task.id} • ${res.task.status}`,
          });
          setPromptInput('');
          void refreshAll();
        } else {
          const msg = res.error || 'Failed to queue task';
          pushToast(msg, 'error');
          setLastDispatchNote({ ok: false, text: msg });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dispatch error';
      pushToast(msg, 'error');
      setLastDispatchNote({ ok: false, text: msg });
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Row 1: 4 Spacious KPI Telemetry Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="aether-glass rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Memory Footprint
            </span>
            <MemoryStick className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {formatMemory(telemetry.ramUsedMb)}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {telemetry.ramPercent.toFixed(0)}% of {formatMemory(telemetry.ramTotalMb)}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.ramPercent))}%` }}
            />
          </div>
        </div>

        <div className="aether-glass rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              CPU Telemetry
            </span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {telemetry.cpuPercent.toFixed(1)}%
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {telemetry.cpuCoresPhysical || '-'}P / {telemetry.cpuCoresLogical || '-'}L cores
              {telemetry.cpuTempC !== null ? ` • ${telemetry.cpuTempC}°C` : ''}
            </p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, telemetry.cpuPercent))}%` }}
            />
          </div>
        </div>

        <div className="aether-glass rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              WAL / IPC Latency
            </span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-cyan-300">
              {telemetry.latencyMs} <span className="text-sm font-normal text-slate-400">ms</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {telemetry.wsConnected ? 'WebSocket Telemetry Live' : 'HTTP Polling Active'} •{' '}
              {telemetry.fps} FPS
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span
              className={`h-2 w-2 rounded-full ${
                telemetry.status === 'ONLINE' ? 'bg-emerald-400 aether-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-300">{telemetry.status}</span>
          </div>
        </div>

        <div className="aether-glass rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Active Tasks
            </span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-emerald-300">
              {activeTaskCount}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {tasks.length} logged • {telemetry.activeSlices} active slices
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-400 truncate">
            Profile: {telemetry.recommendedProfile}
          </div>
        </div>
      </section>

      {/* Row 2: Holo-Core Reactor + Dispatch & Task Queue */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 flex flex-col">
          <HoloCoreReactor
            telemetry={telemetry}
            activeTaskCount={activeTaskCount}
            onNavigate={onNavigate}
          />
        </div>

        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Task / Command Dispatch */}
          <div className="aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">
                  Directive Spine
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-slate-100">
                  Task &amp; Command Dispatch
                </h2>
              </div>

              <div className="inline-flex rounded-xl border border-slate-700/60 bg-[#050a14]/80 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setDispatchTarget('command')}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    dispatchTarget === 'command'
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reflex Command
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchTarget('task')}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    dispatchTarget === 'task'
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Queue Task
                </button>
              </div>
            </div>

            <form onSubmit={handleDispatch} className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={
                  dispatchTarget === 'command'
                    ? 'Enter reflex command or agent directive...'
                    : 'Enter task prompt for SQLite WAL task queue...'
                }
                className="flex-1 rounded-xl border border-cyan-500/25 bg-[#050a14]/90 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/70 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isDispatching || !promptInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                {isDispatching ? 'Sending...' : 'Dispatch'}
              </button>
            </form>

            {lastDispatchNote && (
              <div
                className={`rounded-xl border px-4 py-3 text-xs ${
                  lastDispatchNote.ok
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium break-words">{lastDispatchNote.text}</span>
                  {lastDispatchNote.meta && (
                    <span className="shrink-0 font-mono text-[11px] opacity-80">
                      {lastDispatchNote.meta}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live Task Queue */}
          <div className="aether-glass rounded-2xl p-6 flex-1 flex flex-col min-h-[260px]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400/80">
                  SQLite WAL Queue
                </p>
                <h2 className="mt-0.5 text-base font-semibold text-slate-100">
                  Live Task Queue
                </h2>
              </div>

              <button
                type="button"
                onClick={() => void refreshAll()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#050a14]/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Sync
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-slate-700/60 bg-[#050a14]/50 p-6 text-center">
                <p className="text-sm text-slate-400">
                  No queued tasks in SQLite WAL. Dispatch a command or task above.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                {tasks.slice(0, 12).map((task) => {
                  const cancellable = isCancellableStatus(task.status);
                  return (
                    <div
                      key={task.id}
                      className="aether-panel rounded-xl px-4 py-3 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${taskStatusBadge(
                              task.status
                            )}`}
                          >
                            {task.status}
                          </span>
                          <span className="text-[11px] font-mono text-cyan-300/90">
                            {task.command_type}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {task.source_device}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-200 break-words">
                          {task.prompt_raw}
                        </p>
                        {task.result_output && (
                          <p className="mt-1 text-xs font-mono text-slate-400 line-clamp-2">
                            {task.result_output}
                          </p>
                        )}
                      </div>

                      {cancellable && (
                        <button
                          type="button"
                          onClick={() => void cancelTask(task.id)}
                          title="Cancel task"
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-300 transition hover:bg-rose-500/20"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Row 3: Market & Away Sentinel Compact Telemetry */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Widget */}
        <div className="aether-glass rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">
                Market Telemetry
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-slate-100">
                Live Equity Quote
              </h3>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadStock(symbolInput);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                aria-label="Stock ticker symbol"
                className="w-24 rounded-xl border border-slate-700/70 bg-[#050a14]/90 px-3 py-1.5 text-xs font-mono uppercase text-slate-100 focus:border-cyan-400/70 focus:outline-none"
              />
              <button
                type="submit"
                disabled={stockLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${stockLoading ? 'animate-spin' : ''}`} />
                Fetch
              </button>
            </form>
          </div>

          {stockData?.success ? (
            <div className="grid grid-cols-3 gap-4 rounded-xl border border-slate-700/40 bg-[#050a14]/65 p-4">
              <div>
                <p className="text-[11px] font-mono text-slate-400">{stockData.symbol}</p>
                <p className="mt-1 text-xl font-bold font-mono text-slate-100">
                  {formatNum(stockData.price)}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {stockData.currency || 'USD'}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-mono text-slate-400">24h Delta</p>
                <p
                  className={`mt-1 inline-flex items-center gap-1 text-sm font-mono font-semibold ${
                    (stockData.change ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {(stockData.change ?? 0) >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {(stockData.change ?? 0) >= 0 ? '+' : ''}
                  {formatNum(stockData.change)} ({formatNum(stockData.change_percent)}%)
                </p>
              </div>
              <div>
                <p className="text-[11px] font-mono text-slate-400">Day Range</p>
                <p className="mt-1 text-xs font-mono text-slate-300">
                  L {formatNum(stockData.low)} / H {formatNum(stockData.high)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/50 bg-[#050a14]/65 px-4 py-3 text-xs text-slate-400">
              {stockLoading
                ? 'Querying market endpoint...'
                : stockData?.error || 'Market feed unavailable.'}
            </div>
          )}
        </div>

        {/* Away Sentinel Widget */}
        <div className="aether-glass rounded-2xl p-6 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400/80">
                Away &amp; Acoustic Sentinel
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-slate-100">
                Session Presence Telemetry
              </h3>
            </div>

            <button
              type="button"
              onClick={() => void loadAwayStatus()}
              disabled={awayLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/60 bg-[#050a14]/70 px-3 py-1.5 text-xs text-slate-300 transition hover:border-emerald-400/40 hover:text-emerald-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${awayLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {awayData && !awayData.error ? (
            <div className="grid grid-cols-3 gap-4 rounded-xl border border-slate-700/40 bg-[#050a14]/65 p-4">
              <div>
                <p className="text-[11px] font-mono text-slate-400">Workstation</p>
                <p
                  className={`mt-1 inline-flex items-center gap-1.5 text-sm font-mono font-semibold ${
                    awayData.is_away || awayData.is_locked ? 'text-amber-300' : 'text-emerald-300'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  {awayData.is_locked ? 'LOCKED' : awayData.is_away ? 'AWAY' : 'PRESENT'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-mono text-slate-400">Double-Clap</p>
                <p className="mt-1 text-sm font-mono text-cyan-300">
                  {awayData.double_clap_count ?? 0} hits{' '}
                  <span className="text-[11px] text-slate-400">
                    (RMS {Number(awayData.last_rms ?? 0).toFixed(3)})
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-mono text-slate-400">Digest Queue</p>
                <p className="mt-1 text-sm font-mono text-slate-200">
                  {awayData.pending_digest_count ?? 0} pending
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-700/50 bg-[#050a14]/65 px-4 py-3 text-xs text-slate-400">
              {awayLoading
                ? 'Reading AwayTracker status...'
                : awayData?.error || 'AwayTracker status unavailable.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default CockpitView;
