import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  HardDrive,
  Lock,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { CommandDispatchResult, NavTabId, TaskItem, WorkspaceMode } from '@/types';

export interface CockpitViewProps {
  onNavigate?: (tab: NavTabId) => void;
}

interface StockQuotePayload {
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

interface AwayStatusPayload {
  success?: boolean;
  is_away?: boolean;
  is_locked?: boolean;
  is_monitoring?: boolean;
  double_clap_count?: number;
  total_frames_processed?: number;
  last_rms?: number;
  pending_digest_count?: number;
  auto_wake?: boolean;
  error?: string;
}

interface CreateTaskPayload {
  success?: boolean;
  task?: TaskItem;
  error?: string;
}

const ACTIVE_TASK_STATUSES = new Set(['QUEUED', 'RUNNING', 'IN_PROGRESS', 'PENDING']);

function getModeAccent(mode: WorkspaceMode, securityState: string): {
  primary: string;
  glow: string;
  ringOpacity: string;
  label: string;
} {
  if (securityState === 'LOCKED') {
    return {
      primary: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.28)',
      ringOpacity: '0.45',
      label: 'ESTOP LOCKED',
    };
  }
  if (securityState === 'ELEVATED') {
    return {
      primary: '#f59e0b',
      glow: 'rgba(245, 158, 11, 0.25)',
      ringOpacity: '0.42',
      label: 'ELEVATED GUARD',
    };
  }
  switch (mode) {
    case 'STUDY':
      return {
        primary: '#f59e0b',
        glow: 'rgba(245, 158, 11, 0.22)',
        ringOpacity: '0.38',
        label: 'STUDY FOCUS',
      };
    case 'STUDIO':
      return {
        primary: '#34d399',
        glow: 'rgba(52, 211, 153, 0.28)',
        ringOpacity: '0.48',
        label: 'STUDIO HARMONIC',
      };
    case 'SILENT':
      return {
        primary: '#64748b',
        glow: 'rgba(100, 116, 139, 0.22)',
        ringOpacity: '0.32',
        label: 'AIR-GAPPED SILENT',
      };
    case 'DEV':
    default:
      return {
        primary: '#10b981',
        glow: 'rgba(16, 185, 129, 0.28)',
        ringOpacity: '0.45',
        label: 'SOVEREIGN NOMINAL',
      };
  }
}

function formatStatusBadge(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED' || upper === 'SUCCESS') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (upper === 'RUNNING' || upper === 'IN_PROGRESS' || upper === 'QUEUED') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  }
  if (upper === 'FAILED') {
    return 'border-red-500/30 bg-red-500/10 text-red-300';
  }
  return 'border-slate-500/25 bg-slate-500/10 text-slate-400';
}

function formatTaskTime(raw: string): string {
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface SovereignReactorProps {
  securityState: 'NOMINAL' | 'LOCKED' | 'ELEVATED';
  workspaceMode: WorkspaceMode;
  cpuPercent: number;
  ramPercent: number;
  airGapped: boolean;
  isOnline: boolean;
}

function SovereignCoreReactor({
  securityState,
  workspaceMode,
  cpuPercent,
  ramPercent,
  airGapped,
  isOnline,
}: SovereignReactorProps) {
  const palette = getModeAccent(workspaceMode, securityState);
  const clampedCpu = Math.max(4, Math.min(100, cpuPercent || 0));
  const clampedRam = Math.max(4, Math.min(100, ramPercent || 0));

  const outerCircumference = 2 * Math.PI * 124;
  const innerCircumference = 2 * Math.PI * 94;
  const cpuStrokeOffset = outerCircumference * (1 - clampedCpu / 100);
  const ramStrokeOffset = innerCircumference * (1 - clampedRam / 100);

  return (
    <div className="relative flex items-center justify-center py-2">
      <svg
        viewBox="0 0 320 320"
        className="w-64 h-64 select-none"
        role="img"
        aria-label={`Obsidian Sovereign Core Reactor (${workspaceMode} / ${securityState})`}
      >
        <defs>
          <radialGradient id="obsidianCoreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={palette.primary} stopOpacity="0.24" />
            <stop offset="55%" stopColor={palette.primary} stopOpacity="0.06" />
            <stop offset="100%" stopColor="#07090d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="obsidianFacet" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#16202c" />
            <stop offset="50%" stopColor="#0b1017" />
            <stop offset="100%" stopColor="#05070a" />
          </linearGradient>
        </defs>

        {/* Ambient radial core field */}
        <circle cx="160" cy="160" r="146" fill="url(#obsidianCoreGlow)" />

        {/* Architectural hairline reference rings */}
        <circle
          cx="160"
          cy="160"
          r="142"
          fill="none"
          stroke="rgba(148, 163, 184, 0.12)"
          strokeWidth="1"
          strokeDasharray={airGapped ? '4 6' : undefined}
        />
        <circle
          cx="160"
          cy="160"
          r="124"
          fill="none"
          stroke="rgba(148, 163, 184, 0.09)"
          strokeWidth="3"
        />
        <circle
          cx="160"
          cy="160"
          r="94"
          fill="none"
          stroke="rgba(148, 163, 184, 0.08)"
          strokeWidth="2.5"
        />

        {/* Degree tick marks at 30-degree intervals */}
        {Array.from({ length: 12 }).map((_, idx) => {
          const angle = (idx * 30 * Math.PI) / 180;
          const x1 = 160 + Math.cos(angle) * 136;
          const y1 = 160 + Math.sin(angle) * 136;
          const x2 = 160 + Math.cos(angle) * 144;
          const y2 = 160 + Math.sin(angle) * 144;
          return (
            <line
              key={idx}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={idx % 3 === 0 ? palette.primary : 'rgba(148, 163, 184, 0.22)'}
              strokeWidth={idx % 3 === 0 ? '1.5' : '1'}
              strokeOpacity={idx % 3 === 0 ? '0.7' : '0.4'}
            />
          );
        })}

        {/* CPU load telemetry arc */}
        <circle
          cx="160"
          cy="160"
          r="124"
          fill="none"
          stroke={palette.primary}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={outerCircumference}
          strokeDashoffset={cpuStrokeOffset}
          transform="rotate(-90 160 160)"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1), stroke 350ms ease' }}
        />

        {/* RAM allocation telemetry arc */}
        <circle
          cx="160"
          cy="160"
          r="94"
          fill="none"
          stroke={palette.primary}
          strokeOpacity="0.65"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={innerCircumference}
          strokeDashoffset={ramStrokeOffset}
          transform="rotate(90 160 160)"
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1), stroke 350ms ease' }}
        />

        {/* Rotating architectural vector lattice */}
        <g>
          {securityState !== 'LOCKED' && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 160 160"
              to="360 160 160"
              dur={workspaceMode === 'SILENT' ? '42s' : '24s'}
              repeatCount="indefinite"
            />
          )}
          <polygon
            points="160,82 227,121 227,199 160,238 93,199 93,121"
            fill="none"
            stroke={palette.primary}
            strokeOpacity={palette.ringOpacity}
            strokeWidth="1"
          />
          <circle cx="160" cy="82" r="2.5" fill={palette.primary} />
          <circle cx="227" cy="199" r="2.5" fill={palette.primary} />
          <circle cx="93" cy="199" r="2.5" fill={palette.primary} />
        </g>

        {/* Faceted Obsidian Sovereign Monolith Core */}
        <polygon
          points="160,108 205,134 205,186 160,212 115,186 115,134"
          fill="url(#obsidianFacet)"
          stroke={palette.primary}
          strokeOpacity="0.55"
          strokeWidth="1.25"
          style={{ transition: 'stroke 350ms ease' }}
        />
        <polygon
          points="160,122 192,141 192,179 160,198 128,179 128,141"
          fill="none"
          stroke="rgba(230, 237, 243, 0.14)"
          strokeWidth="1"
        />

        {/* Center Status Telemetry Readout */}
        <circle
          cx="160"
          cy="144"
          r="3.5"
          fill={isOnline ? palette.primary : '#64748b'}
        />
        <text
          x="160"
          y="163"
          textAnchor="middle"
          fill="#e6edf3"
          fontSize="13"
          fontWeight="600"
          letterSpacing="0.16em"
          fontFamily="var(--font-mono)"
        >
          {workspaceMode}
        </text>
        <text
          x="160"
          y="181"
          textAnchor="middle"
          fill={palette.primary}
          fontSize="9.5"
          fontWeight="500"
          letterSpacing="0.12em"
          fontFamily="var(--font-mono)"
        >
          {securityState}
        </text>
      </svg>
    </div>
  );
}

export function CockpitView({ onNavigate }: CockpitViewProps) {
  const {
    telemetry,
    tasks,
    isOnline,
    dispatchCommand,
    cancelTask,
    refreshAll,
    pushToast,
    setActiveTab,
    switchWorkspaceMode,
    toggleEstop,
  } = useNexusStore();

  const navigate = useCallback(
    (tab: NavTabId) => {
      if (onNavigate) {
        onNavigate(tab);
      } else {
        setActiveTab(tab);
      }
    },
    [onNavigate, setActiveTab]
  );

  // Command & Task Dispatch state
  const [commandInput, setCommandInput] = useState('');
  const [dispatchMode, setDispatchMode] = useState<'command' | 'task'>('command');
  const [isDispatching, setIsDispatching] = useState(false);
  const [lastDispatch, setLastDispatch] = useState<CommandDispatchResult | null>(null);

  // Task queue filter
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'done'>('all');

  // Stock & Away telemetry state
  const [stockSymbol, setStockSymbol] = useState('NVDA');
  const [stockInput, setStockInput] = useState('NVDA');
  const [stockQuote, setStockQuote] = useState<StockQuotePayload | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [awayStatus, setAwayStatus] = useState<AwayStatusPayload | null>(null);
  const [awayLoading, setAwayLoading] = useState(false);

  const fetchStock = useCallback(async (symbolToFetch: string) => {
    const clean = symbolToFetch.trim().toUpperCase() || 'NVDA';
    setStockLoading(true);
    try {
      const res = await ipcJson<StockQuotePayload>(
        `/api/widgets/stock?symbol=${encodeURIComponent(clean)}`
      );
      setStockQuote(res);
    } catch (err) {
      setStockQuote({
        success: false,
        symbol: clean,
        error: err instanceof Error ? err.message : 'Unable to reach stock telemetry',
      });
    } finally {
      setStockLoading(false);
    }
  }, []);

  const fetchAwayStatus = useCallback(async () => {
    setAwayLoading(true);
    try {
      const res = await ipcJson<AwayStatusPayload>('/api/away/status');
      setAwayStatus(res);
    } catch (err) {
      setAwayStatus({
        success: false,
        error: err instanceof Error ? err.message : 'Away tracker offline',
      });
    } finally {
      setAwayLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStock(stockSymbol);
    void fetchAwayStatus();
  }, [fetchStock, fetchAwayStatus, stockSymbol, telemetry.workspaceMode]);

  const activeTaskCount = useMemo(
    () => tasks.filter((t) => ACTIVE_TASK_STATUSES.has(String(t.status).toUpperCase())).length,
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'active') {
      return tasks.filter((t) => ACTIVE_TASK_STATUSES.has(String(t.status).toUpperCase()));
    }
    if (taskFilter === 'done') {
      return tasks.filter((t) => !ACTIVE_TASK_STATUSES.has(String(t.status).toUpperCase()));
    }
    return tasks;
  }, [tasks, taskFilter]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commandInput.trim();
    if (!trimmed || isDispatching) return;

    setIsDispatching(true);
    try {
      if (dispatchMode === 'command') {
        const result = await dispatchCommand(trimmed);
        setLastDispatch(result);
        if (result.success) {
          setCommandInput('');
        }
      } else {
        const res = await ipcJson<CreateTaskPayload>('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            prompt: trimmed,
            command_type: 'GENERAL',
            source_device: 'OBSIDIAN_COCKPIT',
          }),
        });
        if (res.success && res.task) {
          setLastDispatch({
            success: true,
            output: `Queued task ${res.task.id}: ${res.task.prompt_raw}`,
            handledBy: 'TASK_QUEUE',
          });
          setCommandInput('');
          pushToast({
            title: 'Task Queued',
            message: res.task.id,
            tone: 'success',
          });
          await refreshAll();
        } else {
          const errMsg = res.error ?? 'Failed to queue task.';
          setLastDispatch({ success: false, output: '', error: errMsg });
          pushToast({ title: 'Task Queue Rejected', message: errMsg, tone: 'error' });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dispatch failed';
      setLastDispatch({ success: false, output: '', error: msg });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleStockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = stockInput.trim().toUpperCase();
    if (!next) return;
    if (next === stockSymbol) {
      void fetchStock(next);
    } else {
      setStockSymbol(next);
    }
  };

  const modePalette = getModeAccent(telemetry.workspaceMode, telemetry.securityState);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-obsidian-fade">
      {/* Row 1: Sovereign Core Reactor + Telemetry KPIs & Command Dispatch */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Visual Group 1: Architectural Obsidian Sovereign Core Reactor */}
        <section className="xl:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Obsidian Sovereign Core
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)]">
                {modePalette.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void toggleEstop()}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 ${
                telemetry.estopActive
                  ? 'border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                  : 'border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-[var(--text)]'
              }`}
              title={telemetry.estopActive ? 'Reset Emergency Stop' : 'Trigger Emergency Stop'}
            >
              {telemetry.estopActive ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  RESET E-STOP
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  GUARD ARMED
                </>
              )}
            </button>
          </div>

          <SovereignCoreReactor
            securityState={telemetry.securityState}
            workspaceMode={telemetry.workspaceMode}
            cpuPercent={telemetry.cpuPercent}
            ramPercent={telemetry.ramPercent}
            airGapped={telemetry.airGapped}
            isOnline={isOnline}
          />

          <div className="space-y-4 pt-2 border-t border-[var(--border-subtle)]">
            {/* Workspace mode selector */}
            <div className="grid grid-cols-4 gap-2">
              {(['DEV', 'STUDY', 'STUDIO', 'SILENT'] as const).map((mode) => {
                const active = telemetry.workspaceMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void switchWorkspaceMode(mode)}
                    className={`py-1.5 px-2 rounded-lg border text-[11px] font-mono tracking-wider transition-all ${
                      active
                        ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300'
                        : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--border)]'
                    }`}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            {/* Hardware & Quick Navigation Footer */}
            <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline ? 'bg-emerald-400 animate-obsidian-pulse' : 'bg-slate-500'
                  }`}
                />
                <span className="truncate font-mono text-[11px]">
                  {telemetry.primaryGpuName !== 'N/A'
                    ? `${telemetry.primaryGpuName}${telemetry.gpuTempC != null ? ` · ${telemetry.gpuTempC}°C` : ''}`
                    : `Profile: ${telemetry.recommendedProfile}`}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('chat')}
                  className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] hover:border-emerald-500/40 text-[11px] font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  Chat <ArrowUpRight className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('studio')}
                  className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] hover:border-emerald-500/40 text-[11px] font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  Studio <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Visual Group 2: 4 KPI Tiles + Command Dispatch */}
        <div className="xl:col-span-7 flex flex-col gap-6">
          {/* Strictly max 4 crisp KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="obsidian-panel rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span className="text-[11px] font-mono uppercase tracking-wider">RAM</span>
                <HardDrive className="w-4 h-4 text-emerald-400/80" />
              </div>
              <div className="text-2xl font-semibold font-mono tracking-tight text-[var(--text)]">
                {telemetry.ramUsedMb > 0 ? `${telemetry.ramUsedMb}` : '0'}
                <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">MB</span>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                {telemetry.ramPercent.toFixed(0)}% ·{' '}
                {telemetry.ramTotalMb > 0
                  ? `${(telemetry.ramTotalMb / 1024).toFixed(1)} GB`
                  : 'Awaiting telemetry'}
              </p>
            </div>

            <div className="obsidian-panel rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span className="text-[11px] font-mono uppercase tracking-wider">CPU</span>
                <Cpu className="w-4 h-4 text-emerald-400/80" />
              </div>
              <div className="text-2xl font-semibold font-mono tracking-tight text-[var(--text)]">
                {telemetry.cpuPercent.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-[var(--text-muted)]">%</span>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                {telemetry.cpuCoresPhysical || telemetry.cpuCoresLogical || '—'} cores
                {telemetry.cpuTempC != null ? ` · ${telemetry.cpuTempC.toFixed(0)}°C` : ''}
              </p>
            </div>

            <div className="obsidian-panel rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span className="text-[11px] font-mono uppercase tracking-wider">WAL Ping</span>
                {telemetry.wsConnected ? (
                  <Wifi className="w-4 h-4 text-emerald-400/80" />
                ) : (
                  <WifiOff className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div className="text-2xl font-semibold font-mono tracking-tight text-[var(--text)]">
                {telemetry.pingMs}
                <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">ms</span>
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                {telemetry.wsConnected ? 'WS Live' : 'HTTP Poll'} · {telemetry.fps || 60} FPS
              </p>
            </div>

            <div className="obsidian-panel rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span className="text-[11px] font-mono uppercase tracking-wider">Active Tasks</span>
                <Activity className="w-4 h-4 text-emerald-400/80" />
              </div>
              <div className="text-2xl font-semibold font-mono tracking-tight text-[var(--text)]">
                {activeTaskCount}
              </div>
              <p className="text-[11px] font-mono text-[var(--text-secondary)] truncate">
                {tasks.length} queued · {telemetry.activeSlices} slices
              </p>
            </div>
          </div>

          {/* Command Dispatch Card */}
          <section className="obsidian-panel rounded-xl p-6 flex-1 flex flex-col justify-between gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Sovereign Execution Spine
                </p>
                <h3 className="mt-0.5 text-base font-medium text-[var(--text)]">
                  Command &amp; Task Dispatch
                </h3>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-0.5">
                <button
                  type="button"
                  onClick={() => setDispatchMode('command')}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    dispatchMode === 'command'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Reflex Command
                </button>
                <button
                  type="button"
                  onClick={() => setDispatchMode('task')}
                  className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                    dispatchMode === 'task'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  Queue Task
                </button>
              </div>
            </div>

            <form onSubmit={handleDispatch} className="flex items-center gap-3">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={
                  dispatchMode === 'command'
                    ? 'Dispatch direct reflex or agent command (e.g. status, open notepad, summarize workspace)...'
                    : 'Enqueue persistent SQLite WAL task prompt...'
                }
                disabled={isDispatching}
                className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none transition-colors font-mono"
              />
              <button
                type="submit"
                disabled={isDispatching || !commandInput.trim()}
                className="px-5 py-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
              >
                <Send className="w-4 h-4" />
                {isDispatching ? 'Sending...' : 'Dispatch'}
              </button>
            </form>

            {lastDispatch ? (
              <div
                className={`rounded-lg border p-4 text-xs font-mono space-y-1.5 ${
                  lastDispatch.blocked
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                    : lastDispatch.success
                      ? 'border-emerald-500/30 bg-emerald-500/8 text-[var(--text)]'
                      : 'border-red-500/35 bg-red-500/10 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5">
                    {lastDispatch.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {lastDispatch.handledBy ?? (lastDispatch.success ? 'GATEWAY' : 'REJECTED')}
                    {lastDispatch.reflex ? ' · REFLEX' : ''}
                  </span>
                  {typeof lastDispatch.latencyMs === 'number' && (
                    <span>{lastDispatch.latencyMs.toFixed(1)} ms</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {lastDispatch.error || lastDispatch.output || 'Dispatched cleanly.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
                <span>ScopeGuard 6/6 invariants active · Loopback 127.0.0.1:47630</span>
                <span>{telemetry.airGapped ? 'AIR-GAPPED' : 'MESH READY'}</span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Row 2: Live Task Queue + Stock & Away Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Visual Group 1: Live Task Queue */}
        <section className="xl:col-span-7 obsidian-panel rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
                SQLite WAL Queue
              </p>
              <h3 className="mt-0.5 text-base font-medium text-[var(--text)]">Live Task Queue</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-0.5">
                {(['all', 'active', 'done'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setTaskFilter(filterKey)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono uppercase transition-colors ${
                      taskFilter === filterKey
                        ? 'bg-[var(--panel-elevated)] text-emerald-300 border border-emerald-500/30'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void refreshAll()}
                className="p-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
                title="Refresh telemetry & tasks"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredTasks.length === 0 ? (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center space-y-2">
              <p className="text-sm text-[var(--text-secondary)]">No tasks in this view.</p>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                Use Command &amp; Task Dispatch above to queue work onto SQLite WAL.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {filteredTasks.slice(0, 12).map((task) => {
                const upperStatus = String(task.status).toUpperCase();
                const canCancel = ACTIVE_TASK_STATUSES.has(upperStatus);
                return (
                  <div
                    key={task.id}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex items-start justify-between gap-4 hover:border-[var(--border)] transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider ${formatStatusBadge(
                            upperStatus
                          )}`}
                        >
                          {upperStatus}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                          {task.command_type} · {task.source_device}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                          {formatTaskTime(task.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text)] break-words">{task.prompt_raw}</p>
                      {task.result_output && (
                        <p className="text-xs font-mono text-[var(--text-secondary)] line-clamp-2">
                          {task.result_output}
                        </p>
                      )}
                    </div>
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => void cancelTask(task.id)}
                        className="px-2.5 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-mono transition-colors flex items-center gap-1 shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Visual Group 2: Stock Telemetry + Away Presence */}
        <section className="xl:col-span-5 obsidian-panel rounded-xl p-6 space-y-6">
          {/* Stock Telemetry Block */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Market Telemetry
                </p>
                <h3 className="mt-0.5 text-base font-medium text-[var(--text)]">Equities Feed</h3>
              </div>
              <form onSubmit={handleStockSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value.toUpperCase())}
                  maxLength={10}
                  aria-label="Stock ticker symbol"
                  className="w-20 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-xs font-mono uppercase text-[var(--text)] outline-none"
                />
                <button
                  type="submit"
                  disabled={stockLoading}
                  className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
                  title="Fetch live stock quote"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${stockLoading ? 'animate-spin' : ''}`} />
                </button>
              </form>
            </div>

            {stockQuote?.success ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-lg font-semibold font-mono text-[var(--text)]">
                      {stockQuote.symbol ?? stockSymbol}
                    </span>
                    <span className="text-xs font-mono text-[var(--text-muted)]">
                      {stockQuote.currency ?? 'USD'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-semibold font-mono text-[var(--text)]">
                      {typeof stockQuote.price === 'number' ? stockQuote.price.toFixed(2) : '—'}
                    </span>
                    {typeof stockQuote.change_percent === 'number' && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded border ${
                          stockQuote.change_percent >= 0
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-red-500/30 bg-red-500/10 text-red-300'
                        }`}
                      >
                        {stockQuote.change_percent >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {stockQuote.change_percent >= 0 ? '+' : ''}
                        {stockQuote.change_percent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                  <div>
                    <span className="text-[var(--text-muted)] block">DAY HIGH</span>
                    {typeof stockQuote.high === 'number' ? stockQuote.high.toFixed(2) : '—'}
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">DAY LOW</span>
                    {typeof stockQuote.low === 'number' ? stockQuote.low.toFixed(2) : '—'}
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">VOLUME</span>
                    {typeof stockQuote.volume === 'number'
                      ? stockQuote.volume.toLocaleString()
                      : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs font-mono text-[var(--text-secondary)]">
                {stockLoading
                  ? `Fetching ${stockSymbol} market feed...`
                  : stockQuote?.error ?? `Market telemetry unavailable for ${stockSymbol}.`}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)]" />

          {/* Away / Acoustic Sentinel Telemetry Block */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Presence &amp; Acoustic Sentinel
                </p>
                <h3 className="mt-0.5 text-base font-medium text-[var(--text)]">Away Telemetry</h3>
              </div>
              <button
                type="button"
                onClick={() => void fetchAwayStatus()}
                disabled={awayLoading}
                className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
                title="Refresh away tracker status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${awayLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {awayStatus && awayStatus.success !== false ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-2 text-[var(--text)]">
                    {awayStatus.is_locked ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {awayStatus.is_locked
                      ? 'Workstation Locked'
                      : awayStatus.is_away
                        ? 'Away Digest Mode'
                        : 'Operator Present'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] uppercase ${
                      awayStatus.is_monitoring
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-slate-500/25 bg-slate-500/10 text-slate-400'
                    }`}
                  >
                    {awayStatus.is_monitoring ? 'Monitoring' : 'Standby'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                  <div>
                    <span className="text-[var(--text-muted)] block">PENDING DIGEST</span>
                    {awayStatus.pending_digest_count ?? 0} events
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">DOUBLE CLAP</span>
                    {awayStatus.double_clap_count ?? 0} triggers
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)] block">AUDIO RMS</span>
                    {typeof awayStatus.last_rms === 'number'
                      ? awayStatus.last_rms.toFixed(4)
                      : '0.0000'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs font-mono text-[var(--text-secondary)]">
                {awayLoading
                  ? 'Querying AwayTracker...'
                  : awayStatus?.error ?? 'AwayTracker status unavailable.'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CockpitView;
