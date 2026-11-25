import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Clock,
  Cpu,
  HardDrive,
  ListChecks,
  Lock,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  WifiOff,
  X,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore, type CommandDispatchResult } from '../store/useNexusStore';
import type { NavTabId, TaskItem } from '../types';

export interface CockpitViewProps {
  onNavigate?: (tab: NavTabId) => void;
}

interface StockQuote {
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

interface AwayStatus {
  success?: boolean;
  is_locked?: boolean;
  is_away?: boolean;
  is_monitoring?: boolean;
  double_clap_count?: number;
  pending_digest_count?: number;
  auto_wake?: boolean;
  last_presence_time?: number;
  last_away_time?: number;
  last_wake_time?: number;
  error?: string;
}

const ACTIVE_TASK_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'RUNNING']);

function formatRamValue(memoryUsage: number, memoryTotal?: number): { primary: string; secondary: string } {
  if (!Number.isFinite(memoryUsage) || memoryUsage <= 0) {
    return { primary: '0.0 GB', secondary: 'Telemetry pending' };
  }

  // /api/telemetry emits bytes; WebSocket frames emit MiB
  const usedBytes = memoryUsage > 1024 * 1024 ? memoryUsage : memoryUsage * 1024 * 1024;
  const usedGb = usedBytes / (1024 * 1024 * 1024);

  if (memoryTotal && memoryTotal > 0) {
    const totalBytes = memoryTotal > 1024 * 1024 ? memoryTotal : memoryTotal * 1024 * 1024;
    const totalGb = totalBytes / (1024 * 1024 * 1024);
    return {
      primary: `${usedGb.toFixed(1)} GB`,
      secondary: `of ${totalGb.toFixed(0)} GB total`,
    };
  }

  return {
    primary: usedGb >= 1 ? `${usedGb.toFixed(1)} GB` : `${Math.round(usedBytes / (1024 * 1024))} MB`,
    secondary: 'Physical allocation',
  };
}

function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatTimestamp(raw?: string | number | null): string {
  if (!raw) return '—';
  if (typeof raw === 'number') {
    if (raw <= 0) return '—';
    const d = new Date(raw > 1e12 ? raw : raw * 1000);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return String(raw);
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getTaskTone(status: TaskItem['status']): { dot: string; label: string } {
  const norm = String(status || '').toUpperCase();
  if (norm === 'COMPLETED') {
    return { dot: 'bg-emerald-400', label: 'text-emerald-400' };
  }
  if (ACTIVE_TASK_STATUSES.has(norm)) {
    return { dot: 'bg-amber-400 animate-pulse', label: 'text-amber-400' };
  }
  if (norm === 'FAILED') {
    return { dot: 'bg-red-400', label: 'text-red-400' };
  }
  return { dot: 'bg-zinc-500', label: 'text-zinc-500' };
}

export function CockpitView({ onNavigate }: CockpitViewProps = {}) {
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const isOnline = useNexusStore((s) => s.isOnline);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand);
  const cancelTask = useNexusStore((s) => s.cancelTask);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [commandInput, setCommandInput] = useState('');
  const [dispatchMode, setDispatchMode] = useState<'command' | 'task'>('command');
  const [dispatching, setDispatching] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<CommandDispatchResult | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [symbol, setSymbol] = useState('NVDA');
  const [symbolDraft, setSymbolDraft] = useState('NVDA');
  const [stock, setStock] = useState<StockQuote | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [awayStatus, setAwayStatus] = useState<AwayStatus | null>(null);
  const [awayLoading, setAwayLoading] = useState(false);

  const fetchMarketAndAway = useCallback(async (ticker: string) => {
    const cleanTicker = ticker.trim().toUpperCase() || 'NVDA';
    setStockLoading(true);
    setAwayLoading(true);

    try {
      const [stockRes, awayRes] = await Promise.allSettled([
        ipcFetch(`/api/widgets/stock?symbol=${encodeURIComponent(cleanTicker)}`),
        ipcJson<AwayStatus>('/api/away/status'),
      ]);

      if (stockRes.status === 'fulfilled') {
        try {
          const payload = (await stockRes.value.json()) as StockQuote;
          setStock(payload);
        } catch {
          setStock({
            success: false,
            symbol: cleanTicker,
            error: `HTTP ${stockRes.value.status}`,
          });
        }
      } else {
        setStock({
          success: false,
          symbol: cleanTicker,
          error: 'Market bridge unreachable',
        });
      }

      if (awayRes.status === 'fulfilled') {
        setAwayStatus(awayRes.value);
      } else {
        setAwayStatus({ success: false, error: 'Away tracker unavailable' });
      }
    } finally {
      setStockLoading(false);
      setAwayLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMarketAndAway(symbol);
  }, [fetchMarketAndAway, symbol]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => ACTIVE_TASK_STATUSES.has(String(t.status || '').toUpperCase())),
    [tasks]
  );

  const reactorAppearance = useMemo(() => {
    if (telemetry.estopActive || telemetry.securityState === 'LOCKED') {
      return {
        stroke: '#ef4444',
        ringOpacity: '0.45',
        pulseClass: '',
        textClass: 'text-red-400',
        badgeClass: 'border-red-500/30 bg-red-500/10 text-red-300',
        label: telemetry.estopActive ? 'E-STOP LOCKED' : 'LOCKED',
      };
    }
    if (telemetry.securityState === 'ELEVATED' || telemetry.workspaceMode === 'SILENT') {
      return {
        stroke: '#f59e0b',
        ringOpacity: '0.35',
        pulseClass: 'animate-pulse',
        textClass: 'text-amber-400',
        badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        label: telemetry.workspaceMode === 'SILENT' ? 'AIR-GAPPED' : 'ELEVATED',
      };
    }
    return {
      stroke: '#10b981',
      ringOpacity: '0.32',
      pulseClass: 'animate-pulse',
      textClass: 'text-emerald-400',
      badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
      label: 'NOMINAL',
    };
  }, [telemetry.estopActive, telemetry.securityState, telemetry.workspaceMode]);

  const ramDisplay = useMemo(
    () => formatRamValue(telemetry.memoryUsage, telemetry.memoryTotal),
    [telemetry.memoryUsage, telemetry.memoryTotal]
  );

  const handleDispatchSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = commandInput.trim();
    if (!clean || dispatching) return;

    setDispatching(true);
    try {
      if (dispatchMode === 'command') {
        const res = await dispatchCommand(clean);
        setLastDispatch(res);
        if (res.success) {
          setCommandInput('');
        }
      } else {
        const res = await ipcJson<{ task?: TaskItem }>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            prompt: clean,
            command_type: 'GENERAL',
            source_device: 'NEXUS_V4',
          }),
        });
        if (res.success) {
          pushToast('Task queued to sovereign ledger', 'success');
          setLastDispatch({
            success: true,
            handled_by: 'TaskQueue',
            output: res.task?.id ? `Queued task ${res.task.id}` : 'Task queued',
          });
          setCommandInput('');
          await refreshAll();
        } else {
          const errMsg = res.error || 'Failed to queue task';
          pushToast(errMsg, 'error');
          setLastDispatch({ success: false, error: errMsg });
        }
      }
    } finally {
      setDispatching(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    setCancellingId(taskId);
    try {
      await cancelTask(taskId);
    } finally {
      setCancellingId(null);
    }
  };

  const handleTickerSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = symbolDraft.trim().toUpperCase();
    if (!next) return;
    if (next === symbol) {
      void fetchMarketAndAway(next);
    } else {
      setSymbol(next);
    }
  };

  const modeAngle = useMemo(() => {
    switch (telemetry.workspaceMode) {
      case 'STUDY':
        return 90;
      case 'STUDIO':
        return 180;
      case 'SILENT':
        return 270;
      default:
        return 0;
    }
  }, [telemetry.workspaceMode]);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto bg-[#090a0c] p-6 text-zinc-100">
      {/* Header + Minimal SVG Core Reactor Strip */}
      <section className="monograph-surface rounded-lg p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            {/* Geometric SVG Core Reactor */}
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
              <svg
                viewBox="0 0 96 96"
                className="h-20 w-20"
                aria-label={`Core reactor ${reactorAppearance.label} in ${telemetry.workspaceMode} mode`}
              >
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="33"
                  fill="none"
                  stroke={reactorAppearance.stroke}
                  strokeOpacity={reactorAppearance.ringOpacity}
                  strokeWidth="1"
                  strokeDasharray="3 5"
                />
                <g transform={`rotate(${modeAngle} 48 48)`}>
                  <circle
                    cx="48"
                    cy="48"
                    r="23"
                    fill="none"
                    stroke={reactorAppearance.stroke}
                    strokeOpacity="0.65"
                    strokeWidth="1.25"
                    strokeDasharray="36 108"
                  />
                  <line
                    x1="48"
                    y1="10"
                    x2="48"
                    y2="17"
                    stroke={reactorAppearance.stroke}
                    strokeWidth="1.5"
                  />
                </g>
                <polygon
                  points="48,34 60,48 48,62 36,48"
                  fill="none"
                  stroke="rgba(255,255,255,0.16)"
                  strokeWidth="1"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="5"
                  fill={reactorAppearance.stroke}
                  className={reactorAppearance.pulseClass}
                />
              </svg>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                  Sovereign Core Cockpit
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${reactorAppearance.badgeClass}`}
                >
                  {telemetry.estopActive || telemetry.securityState === 'LOCKED' ? (
                    <ShieldAlert className="h-3 w-3" />
                  ) : (
                    <ShieldCheck className="h-3 w-3" />
                  )}
                  {reactorAppearance.label}
                </span>
                <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                  MODE · {telemetry.workspaceMode}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-zinc-400 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Radio className={`h-3.5 w-3.5 ${isOnline ? 'text-emerald-400' : 'text-zinc-500'}`} />
                  {isOnline ? 'IPC 127.0.0.1:47630' : 'IPC Disconnected'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-zinc-500" />
                  UP {formatUptime(telemetry.uptimeSecs)}
                </span>
                <span>
                  AGENTS {telemetry.activeAgents}
                  {typeof telemetry.activeSlices === 'number' ? ` · SLICES ${telemetry.activeSlices}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onNavigate && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('chat')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-zinc-100"
                >
                  Chat
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('studio')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-zinc-100"
                >
                  Studio
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                void refreshAll();
                void fetchMarketAndAway(symbol);
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.05] hover:text-zinc-100"
              title="Refresh telemetry, tasks, and widgets"
            >
              <RefreshCw className="h-3.5 w-3.5 text-zinc-400" />
              Sync
            </button>
          </div>
        </div>
      </section>

      {/* Max 4 Crisp Monograph KPI Tiles */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="monograph-surface rounded-lg p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">RAM</span>
            <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-medium tracking-tight text-zinc-100 tabular-nums">
              {ramDisplay.primary}
            </span>
            {typeof telemetry.ramPercent === 'number' && telemetry.ramPercent > 0 && (
              <span className="font-mono text-xs text-emerald-400 tabular-nums">
                {telemetry.ramPercent.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{ramDisplay.secondary}</p>
        </div>

        <div className="monograph-surface rounded-lg p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">CPU</span>
            <Cpu className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-medium tracking-tight text-zinc-100 tabular-nums">
              {telemetry.cpuUsage.toFixed(1)}%
            </span>
            {typeof telemetry.cpuTempC === 'number' && (
              <span className="font-mono text-xs text-amber-400 tabular-nums">
                {telemetry.cpuTempC.toFixed(0)}°C
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
            {telemetry.cpuCoresLogical ? `${telemetry.cpuCoresLogical} logical cores` : 'Host compute load'}
          </p>
        </div>

        <div className="monograph-surface rounded-lg p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Latency</span>
            <Activity className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-medium tracking-tight text-zinc-100 tabular-nums">
              {telemetry.latencyMs ?? 0} ms
            </span>
            <span
              className={`font-mono text-xs ${
                telemetry.wsConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {telemetry.wsConnected ? 'WS Live' : isOnline ? 'HTTP' : 'Offline'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">Loopback IPC round-trip</p>
        </div>

        <div className="monograph-surface rounded-lg p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-zinc-400">
            <span className="font-mono uppercase tracking-wider">Active Tasks</span>
            <ListChecks className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-medium tracking-tight text-zinc-100 tabular-nums">
              {activeTasks.length}
            </span>
            <span className="font-mono text-xs text-zinc-400 tabular-nums">
              {tasks.length} logged
            </span>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">Queued &amp; running slices</p>
        </div>
      </section>

      {/* Command Dispatch Bar */}
      <section className="monograph-surface rounded-lg p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
              Command Dispatch
            </span>
            <span className="monograph-kbd">Enter</span>
          </div>
          <div className="inline-flex rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDispatchMode('command')}
              className={`rounded px-2.5 py-1 transition ${
                dispatchMode === 'command'
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Execute
            </button>
            <button
              type="button"
              onClick={() => setDispatchMode('task')}
              className={`rounded px-2.5 py-1 transition ${
                dispatchMode === 'task'
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Queue Task
            </button>
          </div>
        </div>

        <form onSubmit={handleDispatchSubmit} className="flex items-center gap-3">
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            placeholder={
              dispatchMode === 'command'
                ? 'Dispatch sovereign command to Nexus runtime…'
                : 'Queue autonomous task into SQLite WAL ledger…'
            }
            disabled={dispatching}
            className="h-10 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3.5 font-mono text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={dispatching || !commandInput.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="h-3.5 w-3.5" />
            {dispatching ? 'Dispatching…' : dispatchMode === 'command' ? 'Run' : 'Queue'}
          </button>
        </form>

        {lastDispatch && (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-white/[0.08] bg-[#090a0c] px-3.5 py-2.5 font-mono text-xs">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    lastDispatch.success
                      ? 'text-emerald-400'
                      : lastDispatch.blocked
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }
                >
                  {lastDispatch.success
                    ? 'OK'
                    : lastDispatch.blocked
                    ? 'BLOCKED'
                    : 'ERROR'}
                </span>
                {lastDispatch.handled_by && (
                  <span className="text-zinc-500">via {lastDispatch.handled_by}</span>
                )}
                {typeof lastDispatch.latency_ms === 'number' && (
                  <span className="text-zinc-500 tabular-nums">{lastDispatch.latency_ms} ms</span>
                )}
              </div>
              <p className="break-words text-zinc-300">
                {lastDispatch.output || lastDispatch.error || 'Completed'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLastDispatch(null)}
              className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
              aria-label="Dismiss command output"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Main Split: Live Task List (2/3) + Market & Away Summary (1/3) */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Live Task List */}
        <div className="monograph-surface flex flex-col rounded-lg xl:col-span-2">
          <div className="monograph-hairline-b flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                Live Task Stream
              </span>
              <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                {tasks.length}
              </span>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">
              {activeTasks.length > 0 ? `${activeTasks.length} active` : 'Idle'}
            </span>
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-xs text-zinc-400">No tasks recorded in the local SQLite ledger.</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-600">
                Use Command Dispatch above to execute or queue a task.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {tasks.slice(0, 12).map((task) => {
                const tone = getTaskTone(task.status);
                const canCancel = ACTIVE_TASK_STATUSES.has(String(task.status || '').toUpperCase());
                return (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-4 px-5 py-3.5 transition hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                        <span className={`font-mono text-[11px] uppercase ${tone.label}`}>
                          {task.status}
                        </span>
                        <span className="rounded border border-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {task.command_type || 'GENERAL'}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-600 tabular-nums">
                          {formatTimestamp(task.created_at)}
                        </span>
                      </div>
                      <p className="truncate text-[13px] text-zinc-200">{task.prompt_raw}</p>
                      {task.result_output && (
                        <p className="truncate font-mono text-[11px] text-zinc-500">
                          {task.result_output}
                        </p>
                      )}
                    </div>

                    {canCancel && (
                      <button
                        type="button"
                        disabled={cancellingId === task.id}
                        onClick={() => void handleCancelTask(task.id)}
                        className="shrink-0 rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-zinc-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                      >
                        {cancellingId === task.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Market Quote + Away Summary */}
        <div className="flex flex-col gap-6">
          {/* Market Quote */}
          <div className="monograph-surface rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                Market Telemetry
              </span>
              <form onSubmit={handleTickerSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={symbolDraft}
                  onChange={(e) => setSymbolDraft(e.target.value.toUpperCase())}
                  maxLength={10}
                  aria-label="Stock ticker symbol"
                  className="w-16 rounded border border-white/[0.08] bg-[#090a0c] px-2 py-1 text-center font-mono text-[11px] uppercase text-zinc-200 focus:border-emerald-500/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={stockLoading}
                  className="rounded border border-white/[0.08] bg-white/[0.02] p-1.5 text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
                  title="Fetch live stock quote"
                >
                  <RefreshCw className={`h-3 w-3 ${stockLoading ? 'animate-spin' : ''}`} />
                </button>
              </form>
            </div>

            {telemetry.airGapped || telemetry.workspaceMode === 'SILENT' ? (
              <div className="flex items-center gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-xs text-amber-300">
                <WifiOff className="h-4 w-4 shrink-0" />
                <span>External market feeds blocked in SILENT air-gapped mode.</span>
              </div>
            ) : stock?.success && typeof stock.price === 'number' ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="font-mono text-xs text-zinc-500">{stock.symbol || symbol}</div>
                    <div className="font-mono text-2xl font-medium text-zinc-100 tabular-nums">
                      {stock.price.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-zinc-500">
                        {stock.currency || 'USD'}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-xs tabular-nums ${
                      (stock.change ?? 0) >= 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {(stock.change ?? 0) >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {(stock.change ?? 0) >= 0 ? '+' : ''}
                    {(stock.change ?? 0).toFixed(2)} ({(stock.change_percent ?? 0).toFixed(2)}%)
                  </div>
                </div>

                <div className="monograph-hairline-t grid grid-cols-2 gap-3 pt-3 font-mono text-[11px] text-zinc-400 tabular-nums">
                  <div>
                    <span className="text-zinc-600">DAY LOW </span>
                    {typeof stock.low === 'number' ? stock.low.toFixed(2) : '—'}
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-600">DAY HIGH </span>
                    {typeof stock.high === 'number' ? stock.high.toFixed(2) : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-3 font-mono text-xs text-zinc-400">
                {stockLoading
                  ? `Loading ${symbol} quote…`
                  : stock?.error || `No market telemetry available for ${symbol}`}
              </div>
            )}
          </div>

          {/* Away & Presence Summary */}
          <div className="monograph-surface rounded-lg p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">
                Presence &amp; Away Guard
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
                  awayStatus?.is_away || awayStatus?.is_locked
                    ? 'text-amber-400'
                    : awayStatus
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                {awayStatus?.is_locked && <Lock className="h-3 w-3" />}
                {awayLoading
                  ? 'Checking…'
                  : awayStatus?.is_locked
                  ? 'WORKSTATION LOCKED'
                  : awayStatus?.is_away
                  ? 'AWAY'
                  : awayStatus?.error
                  ? 'OFFLINE'
                  : 'PRESENT'}
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs tabular-nums">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Acoustic Monitor</span>
                <span className={awayStatus?.is_monitoring ? 'text-emerald-400' : 'text-zinc-400'}>
                  {awayStatus?.is_monitoring ? 'Armed' : 'Standby'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Pending Digest</span>
                <span className="text-zinc-200">{awayStatus?.pending_digest_count ?? 0} events</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Double-Clap Triggers</span>
                <span className="text-zinc-200">{awayStatus?.double_clap_count ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Last Presence</span>
                <span className="text-zinc-400">
                  {formatTimestamp(awayStatus?.last_presence_time)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CockpitView;
