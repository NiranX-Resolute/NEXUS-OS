import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Cpu,
  Database,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
  X,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { CommandDispatchResult, NavTabId, TaskItem } from '@/types'

export interface CockpitViewProps {
  onNavigate?: (tab: NavTabId) => void
}

interface StockQuoteResponse {
  success?: boolean
  symbol?: string
  price?: number
  previous_close?: number
  change?: number
  change_percent?: number
  currency?: string
  high?: number
  low?: number
  volume?: number
  timestamp?: number
  error?: string
}

interface AwayStatusResponse {
  success?: boolean
  is_locked?: boolean
  is_away?: boolean
  is_monitoring?: boolean
  double_clap_count?: number
  total_frames_processed?: number
  last_rms?: number
  pending_digest_count?: number
  last_presence_time?: number
  error?: string
}

interface WalCheckpointResponse {
  success?: boolean
  checkpoint?: number[]
  db_path?: string
  error?: string
}

function formatRamGb(mb: number): string {
  if (!mb || mb <= 0) return '0.0 GB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

function formatVolume(vol?: number): string {
  if (!vol || vol <= 0) return '—'
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`
  return String(vol)
}

function isActiveTaskStatus(status: string): boolean {
  const upper = status.toUpperCase()
  return upper === 'QUEUED' || upper === 'RUNNING' || upper === 'IN_PROGRESS'
}

export const CockpitView: React.FC<CockpitViewProps> = ({ onNavigate }) => {
  const telemetry = useNexusStore((s) => s.telemetry)
  const tasks = useNexusStore((s) => s.tasks)
  const isOnline = useNexusStore((s) => s.isOnline)
  const setActiveTab = useNexusStore((s) => s.setActiveTab)
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand)
  const cancelTask = useNexusStore((s) => s.cancelTask)
  const refreshAll = useNexusStore((s) => s.refreshAll)
  const pushToast = useNexusStore((s) => s.pushToast)

  const navigate = useCallback(
    (tab: NavTabId) => {
      if (onNavigate) {
        onNavigate(tab)
      } else {
        setActiveTab(tab)
      }
    },
    [onNavigate, setActiveTab],
  )

  const [commandInput, setCommandInput] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [lastResult, setLastResult] = useState<CommandDispatchResult | null>(null)

  const [symbolInput, setSymbolInput] = useState('NVDA')
  const [activeSymbol, setActiveSymbol] = useState('NVDA')
  const [stockData, setStockData] = useState<StockQuoteResponse | null>(null)
  const [stockLoading, setStockLoading] = useState(false)

  const [awayData, setAwayData] = useState<AwayStatusResponse | null>(null)
  const [awayLoading, setAwayLoading] = useState(false)

  const [walMeasuredMs, setWalMeasuredMs] = useState<number | null>(null)
  const [walChecking, setWalChecking] = useState(false)

  const fetchMarket = useCallback(
    async (symbol: string) => {
      const clean = symbol.trim().toUpperCase() || 'NVDA'
      setActiveSymbol(clean)
      if (telemetry.workspaceMode === 'SILENT' || telemetry.airGapped) {
        setStockData({
          success: false,
          symbol: clean,
          error: 'Air-gapped in SILENT mode — external market telemetry paused',
        })
        return
      }
      setStockLoading(true)
      try {
        const res = await ipcJson<StockQuoteResponse>(
          `/api/widgets/stock?symbol=${encodeURIComponent(clean)}`,
        )
        setStockData(res)
      } catch (err) {
        setStockData({
          success: false,
          symbol: clean,
          error: err instanceof Error ? err.message : 'Unable to reach market endpoint',
        })
      } finally {
        setStockLoading(false)
      }
    },
    [telemetry.airGapped, telemetry.workspaceMode],
  )

  const fetchAway = useCallback(async () => {
    setAwayLoading(true)
    try {
      const res = await ipcJson<AwayStatusResponse>('/api/away/status')
      setAwayData(res)
    } catch (err) {
      setAwayData({
        success: false,
        error: err instanceof Error ? err.message : 'Away telemetry offline',
      })
    } finally {
      setAwayLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAway()
  }, [fetchAway])

  useEffect(() => {
    void fetchMarket(activeSymbol)
  }, [fetchMarket, activeSymbol])

  const handleWalCheckpoint = useCallback(async () => {
    setWalChecking(true)
    const start = performance.now()
    try {
      const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
        method: 'POST',
      })
      const elapsed = Math.max(0.2, Number((performance.now() - start).toFixed(1)))
      setWalMeasuredMs(elapsed)
      if (res.success) {
        pushToast(`SQLite WAL checkpoint complete (${elapsed} ms)`, 'success')
      } else {
        pushToast(res.error || 'WAL checkpoint reported an error', 'warning')
      }
      await refreshAll()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WAL checkpoint failed', 'error')
    } finally {
      setWalChecking(false)
    }
  }, [pushToast, refreshAll])

  const handleCommandSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const clean = commandInput.trim()
      if (!clean || dispatching) return
      setDispatching(true)
      try {
        const res = await dispatchCommand(clean)
        setLastResult(res)
        if (res.success) {
          setCommandInput('')
        }
      } finally {
        setDispatching(false)
      }
    },
    [commandInput, dispatching, dispatchCommand],
  )

  const activeTasks = useMemo(
    () => tasks.filter((t: TaskItem) => isActiveTaskStatus(t.status)),
    [tasks],
  )

  const orbTheme = useMemo(() => {
    if (telemetry.estopActive || telemetry.securityState === 'LOCKED') {
      return {
        label: 'LOCKED',
        ringColor: 'rgba(244, 63, 94, 0.55)',
        coreGlow: 'rgba(244, 63, 94, 0.28)',
        accentHex: '#fb7185',
        badgeClass: 'border-rose-400/30 bg-rose-500/15 text-rose-200',
        Icon: Lock,
      }
    }
    if (telemetry.securityState === 'ELEVATED' || telemetry.workspaceMode === 'SILENT') {
      return {
        label: telemetry.workspaceMode === 'SILENT' ? 'SILENT AIR-GAP' : 'ELEVATED',
        ringColor: 'rgba(245, 158, 11, 0.52)',
        coreGlow: 'rgba(245, 158, 11, 0.22)',
        accentHex: '#fbbf24',
        badgeClass: 'border-amber-400/30 bg-amber-500/15 text-amber-200',
        Icon: ShieldAlert,
      }
    }
    return {
      label: 'NOMINAL',
      ringColor: 'rgba(52, 211, 153, 0.55)',
      coreGlow: 'rgba(52, 211, 153, 0.24)',
      accentHex: '#34d399',
      badgeClass: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
      Icon: ShieldCheck,
    }
  }, [telemetry.estopActive, telemetry.securityState, telemetry.workspaceMode])

  const cpuPct = Math.min(100, Math.max(0, Math.round(telemetry.cpuPercent || 0)))
  const ramPct = Math.min(100, Math.max(0, Math.round(telemetry.ramPercent || 0)))
  const walLatencyValue =
    walMeasuredMs !== null ? walMeasuredMs : telemetry.pingMs > 0 ? telemetry.pingMs : null
  const orbPulseScale = 1 + Math.min(0.08, (telemetry.micRms || 0) * 0.2 + (cpuPct / 100) * 0.04)

  const changePositive = (stockData?.change ?? 0) >= 0

  return (
    <div className="h-full w-full overflow-y-auto p-6 animate-spatial-enter">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* Hero Row: Orbital Spatial Core + 4 Spacious Translucent Metric Cards */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Frosted-Glass Orbital Spatial Core */}
          <section className="spatial-panel relative flex flex-col justify-between overflow-hidden rounded-3xl p-6 lg:col-span-5">
            <div
              className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full blur-3xl transition-colors duration-500"
              style={{ background: orbTheme.coreGlow }}
            />

            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${orbTheme.badgeClass}`}
                >
                  <orbTheme.Icon className="h-3.5 w-3.5" />
                  {orbTheme.label}
                </span>
                <span className="spatial-pill rounded-full px-3 py-1 text-xs font-medium text-slate-300">
                  {telemetry.workspaceMode}
                </span>
              </div>

              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Radio
                  className={`h-3.5 w-3.5 ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}
                />
                {telemetry.wsConnected ? 'Live Stream' : isOnline ? 'IPC Sync' : 'Standby'}
              </span>
            </div>

            {/* Orbital Spatial Core Orb */}
            <div className="relative z-10 my-6 flex items-center justify-center">
              <div
                className="relative flex h-52 w-52 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-2xl transition-transform duration-500"
                style={{
                  transform: `scale(${orbPulseScale})`,
                  boxShadow: `0 0 60px -12px ${orbTheme.coreGlow}, inset 0 1px 1px rgba(255,255,255,0.14)`,
                }}
              >
                <svg
                  viewBox="0 0 220 220"
                  className="absolute inset-0 h-full w-full"
                  aria-hidden="true"
                >
                  <defs>
                    <radialGradient id="spatialOrbCore" cx="50%" cy="42%" r="55%">
                      <stop offset="0%" stopColor={orbTheme.accentHex} stopOpacity="0.34" />
                      <stop offset="65%" stopColor={orbTheme.accentHex} stopOpacity="0.08" />
                      <stop offset="100%" stopColor="#0b1016" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  <circle cx="110" cy="110" r="88" fill="url(#spatialOrbCore)" />
                  <ellipse
                    cx="110"
                    cy="110"
                    rx="96"
                    ry="38"
                    fill="none"
                    stroke={orbTheme.ringColor}
                    strokeWidth="1.2"
                    strokeDasharray="6 6"
                    transform="rotate(-24 110 110)"
                  />
                  <ellipse
                    cx="110"
                    cy="110"
                    rx="92"
                    ry="34"
                    fill="none"
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth="1"
                    transform="rotate(32 110 110)"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r="62"
                    fill="none"
                    stroke={orbTheme.ringColor}
                    strokeWidth="1.5"
                    strokeDasharray={`${Math.max(12, Math.round((cpuPct / 100) * 389))} 390`}
                    strokeLinecap="round"
                    transform="rotate(-90 110 110)"
                  />
                </svg>

                <div className="relative z-10 flex flex-col items-center text-center">
                  <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-400">
                    Spatial Core
                  </span>
                  <span className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
                    {telemetry.gpuName
                      ? telemetry.gpuName.split(' ').slice(0, 2).join(' ')
                      : telemetry.recommendedProfile}
                  </span>
                  <span className="mt-1.5 font-mono text-xs text-emerald-300/90">
                    {telemetry.activeAgents} agents · {telemetry.activeSlices} slices
                  </span>
                </div>
              </div>
            </div>

            {/* Calm Quick Navigation Pills */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="text-xs text-slate-400">
                Uptime{' '}
                <span className="font-mono text-slate-200">
                  {Math.floor(telemetry.uptimeSecs / 60)}m
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('chat')}
                  className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Chat
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('studio')}
                  className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  Studio
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
                </button>
              </div>
            </div>
          </section>

          {/* 4 Spacious Translucent Metric Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:col-span-7">
            {/* RAM Card */}
            <div className="spatial-panel spatial-panel-interactive flex flex-col justify-between rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  Memory Footprint
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-emerald-300">
                  <Activity className="h-4 w-4" />
                </div>
              </div>
              <div className="my-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-100">
                    {formatRamGb(telemetry.ramUsedMb)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {formatRamGb(telemetry.ramTotalMb)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${ramPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Utilization</span>
                <span className="font-mono text-emerald-300">{ramPct}%</span>
              </div>
            </div>

            {/* CPU Card */}
            <div className="spatial-panel spatial-panel-interactive flex flex-col justify-between rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  Processor Load
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-emerald-300">
                  <Cpu className="h-4 w-4" />
                </div>
              </div>
              <div className="my-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-100">
                    {cpuPct}%
                  </span>
                  <span className="text-xs text-slate-400">
                    {telemetry.cpuCoresPhysical || 0}P · {telemetry.cpuCoresLogical || 0}L
                  </span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{ width: `${cpuPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Thermal</span>
                <span className="font-mono text-slate-300">
                  {telemetry.cpuTempC !== null ? `${telemetry.cpuTempC}°C` : 'Nominal'}
                </span>
              </div>
            </div>

            {/* WAL ms Card */}
            <div className="spatial-panel spatial-panel-interactive flex flex-col justify-between rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  SQLite WAL Latency
                </span>
                <button
                  type="button"
                  onClick={() => void handleWalCheckpoint()}
                  disabled={walChecking}
                  title="Run PRAGMA wal_checkpoint(TRUNCATE)"
                  className="spatial-pill flex h-9 w-9 items-center justify-center rounded-2xl text-emerald-300 cursor-pointer disabled:opacity-50"
                >
                  <Database className={`h-4 w-4 ${walChecking ? 'animate-pulse' : ''}`} />
                </button>
              </div>
              <div className="my-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-100">
                    {walLatencyValue !== null ? `${walLatencyValue}` : '—'}
                  </span>
                  <span className="text-xs text-slate-400">ms</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Local WAL journal on <span className="font-mono text-slate-300">127.0.0.1</span>
                </p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Mode</span>
                <span className="font-mono text-emerald-300">WAL · TRUNCATE</span>
              </div>
            </div>

            {/* Active Tasks Card */}
            <div className="spatial-panel spatial-panel-interactive flex flex-col justify-between rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  Active Tasks
                </span>
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-emerald-300">
                  <Layers className="h-4 w-4" />
                </div>
              </div>
              <div className="my-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight text-slate-100">
                    {activeTasks.length}
                  </span>
                  <span className="text-xs text-slate-400">
                    running · {tasks.length} total
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {telemetry.activeSlices} active slices queued
                </p>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Engine</span>
                <span className="font-mono text-slate-300">v{telemetry.version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Second Row: Command Dispatch + Task Queue (Left 7 cols) | Market + Away (Right 5 cols) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            {/* Command Dispatch */}
            <section className="spatial-panel rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                    Command Dispatch
                  </h2>
                </div>
                <span className="text-xs text-slate-400">
                  Reflex Router → ScopeGuard → Swarm
                </span>
              </div>

              <form onSubmit={(e) => void handleCommandSubmit(e)} className="flex items-center gap-3">
                <input
                  type="text"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  placeholder="Issue reflex action, /scout target, or autonomous directive..."
                  className="flex-1 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={dispatching || !commandInput.trim()}
                  className="spatial-pill-active inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-medium transition-opacity cursor-pointer disabled:opacity-45"
                >
                  <Send className="h-4 w-4" />
                  {dispatching ? 'Routing' : 'Dispatch'}
                </button>
              </form>

              {lastResult && (
                <div
                  className={`mt-4 rounded-2xl border p-4 text-xs leading-relaxed ${
                    lastResult.blocked
                      ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                      : lastResult.success
                        ? 'border-emerald-400/25 bg-emerald-500/10 text-slate-100'
                        : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono uppercase tracking-wider text-emerald-300">
                      {lastResult.handledBy || 'Nexus'}
                    </span>
                    {typeof lastResult.latencyMs === 'number' && (
                      <span className="font-mono">{lastResult.latencyMs} ms</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap font-mono text-xs">
                    {lastResult.output || lastResult.error || 'Completed'}
                  </p>
                </div>
              )}
            </section>

            {/* Live Task Queue */}
            <section className="spatial-panel flex-1 rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                    Live Task Queue
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Persisted in SQLite WAL · {tasks.length} recorded
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshAll()}
                  className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-slate-300 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-slate-500">
                  Queue is calm — no pending tasks dispatched.
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {tasks.slice(0, 10).map((task) => {
                    const active = isActiveTaskStatus(task.status)
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${
                                active
                                  ? 'bg-emerald-400 animate-pulse'
                                  : task.status === 'FAILED'
                                    ? 'bg-rose-400'
                                    : task.status === 'CANCELLED'
                                      ? 'bg-slate-500'
                                      : 'bg-emerald-400/60'
                              }`}
                            />
                            <span className="truncate text-sm font-medium text-slate-100">
                              {task.prompt_raw}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="font-mono uppercase">{task.command_type}</span>
                            <span>·</span>
                            <span className="font-mono">{task.status}</span>
                          </div>
                        </div>

                        {active && (
                          <button
                            type="button"
                            onClick={() => void cancelTask(task.id)}
                            className="spatial-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-rose-300 hover:border-rose-400/40 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Market & Away Cards */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            {/* Market Widget */}
            <section className="spatial-panel rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    Market Pulse
                  </span>
                  <h2 className="mt-0.5 text-base font-semibold text-slate-100">
                    {stockData?.symbol || activeSymbol}
                  </h2>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void fetchMarket(symbolInput)
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={symbolInput}
                    onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                    maxLength={10}
                    aria-label="Stock ticker symbol"
                    className="w-20 rounded-xl border border-white/10 bg-black/25 px-2.5 py-1.5 text-center font-mono text-xs text-slate-100 focus:border-emerald-400/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={stockLoading}
                    aria-label="Refresh quote"
                    className="spatial-pill rounded-xl p-2 text-slate-300 cursor-pointer disabled:opacity-45"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${stockLoading ? 'animate-spin' : ''}`} />
                  </button>
                </form>
              </div>

              {stockData?.success ? (
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-3xl font-semibold tracking-tight text-slate-100">
                      ${Number(stockData.price ?? 0).toFixed(2)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-medium ${
                        changePositive
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {changePositive ? (
                        <TrendingUp className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5" />
                      )}
                      {changePositive ? '+' : ''}
                      {Number(stockData.change ?? 0).toFixed(2)} (
                      {Number(stockData.change_percent ?? 0).toFixed(2)}%)
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-xs">
                    <div>
                      <span className="text-slate-400">Day High</span>
                      <p className="mt-1 font-mono text-slate-200">
                        ${Number(stockData.high ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Day Low</span>
                      <p className="mt-1 font-mono text-slate-200">
                        ${Number(stockData.low ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Volume</span>
                      <p className="mt-1 font-mono text-slate-200">
                        {formatVolume(stockData.volume)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
                  {stockLoading
                    ? `Fetching live quote for ${activeSymbol}...`
                    : stockData?.error || 'Market telemetry unavailable'}
                </div>
              )}
            </section>

            {/* Away & Presence Status Card */}
            <section className="spatial-panel flex-1 rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {awayData?.is_away || awayData?.is_locked ? (
                    <UserX className="h-4 w-4 text-amber-300" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-emerald-400" />
                  )}
                  <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                    Presence & Away Digest
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchAway()}
                  disabled={awayLoading}
                  aria-label="Refresh away status"
                  className="spatial-pill rounded-xl p-2 text-slate-300 cursor-pointer disabled:opacity-45"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${awayLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {awayData?.error ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
                  {awayData.error}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div>
                      <span className="text-xs text-slate-400">Operator State</span>
                      <p className="mt-0.5 text-sm font-medium text-slate-100">
                        {awayData?.is_locked
                          ? 'Workstation Locked'
                          : awayData?.is_away
                            ? 'Away Mode Active'
                            : 'Present & Interactive'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 font-mono text-xs ${
                        awayData?.is_away || awayData?.is_locked
                          ? 'bg-amber-500/15 text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {awayData?.is_monitoring ? 'MONITORING' : 'STANDBY'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <span className="text-slate-400">Pending Digest</span>
                      <p className="mt-1 font-mono text-base font-semibold text-slate-100">
                        {awayData?.pending_digest_count ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <span className="text-slate-400">Double-Claps</span>
                      <p className="mt-1 font-mono text-base font-semibold text-slate-100">
                        {awayData?.double_clap_count ?? 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <span className="text-slate-400">Acoustic RMS</span>
                      <p className="mt-1 font-mono text-base font-semibold text-slate-100">
                        {typeof awayData?.last_rms === 'number'
                          ? awayData.last_rms.toFixed(3)
                          : '0.000'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CockpitView
