import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  Eraser,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PenTool,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'

type VaultTab = 'security' | 'focus' | 'whiteboard'

interface VaultTestResponse {
  success?: boolean
  vault?: string
  status?: string
  provider_id?: string
  latency_ms?: number
  error?: string
}

interface ShieldStatusData {
  success?: boolean
  has_audit?: boolean
  audit_id?: string
  scanned_at?: number | string
  score?: number
  status?: string
  target_path?: string
  findings_count?: number
  quarantined_plugins?: string[]
  error?: string
}

interface AuditRunResponse {
  success?: boolean
  audit_passed?: boolean
  shield?: ShieldStatusData
  timestamp?: number
  error?: string
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

interface TimerRecord {
  id: string
  label: string
  duration_sec: number
  remaining_sec: number
  timer_type: string
  status: string
  created_at: string
  expires_at: string
}

interface TimersListResponse {
  success?: boolean
  timers?: TimerRecord[]
  count?: number
  error?: string
}

interface WhiteboardDrawResponse {
  success?: boolean
  action?: string
  file_path?: string
  file_size_bytes?: number
  elements_count?: number
  error?: string
}

const VAULT_KEY_PRESETS = [
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'HF_TOKEN',
  'GITHUB_TOKEN',
]

const PROBE_PROVIDERS = ['gemini', 'groq', 'openrouter', 'openai', 'anthropic', 'huggingface']

const STOCK_QUICK_SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'AMD', 'TSLA']

const TIMER_PRESETS = [
  { label: 'Short Break', minutes: 5, type: 'countdown' },
  { label: 'Focus Sprint', minutes: 15, type: 'countdown' },
  { label: 'Pomodoro', minutes: 25, type: 'pomodoro' },
  { label: 'Deep Architecture', minutes: 45, type: 'countdown' },
]

const BOARD_COLORS = [
  { label: 'Mint Emerald', hex: '#34d399' },
  { label: 'Sky', hex: '#38bdf8' },
  { label: 'Amber', hex: '#fbbf24' },
  { label: 'Rose', hex: '#fb7185' },
  { label: 'Violet', hex: '#a78bfa' },
  { label: 'Frost White', hex: '#f1f5f9' },
]

const BOARD_WIDTH = 960
const BOARD_HEIGHT = 440

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hrs = Math.floor(safe / 3600)
  const mins = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatVolume(vol?: number): string {
  if (!vol || vol <= 0) return '—'
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`
  return String(vol)
}

function formatTimeValue(val?: number | string): string {
  if (val === undefined || val === null || val === '') return 'Never'
  if (typeof val === 'number') {
    const ms = val > 1e12 ? val : val * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString()
  }
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? val : d.toLocaleString()
}

function paintCanvasBackdrop(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#0b1016'
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)'
  for (let gx = 24; gx < BOARD_WIDTH; gx += 32) {
    for (let gy = 24; gy < BOARD_HEIGHT; gy += 32) {
      ctx.fillRect(gx, gy, 1.5, 1.5)
    }
  }
}

export function VaultView() {
  const telemetry = useNexusStore((s) => s.telemetry)
  const pushToast = useNexusStore((s) => s.pushToast)
  const isSilent = telemetry.workspaceMode === 'SILENT' || telemetry.airGapped

  const [activeTab, setActiveTab] = useState<VaultTab>('security')

  // DPAPI Vault state
  const [vaultHealth, setVaultHealth] = useState<VaultTestResponse | null>(null)
  const [vaultTesting, setVaultTesting] = useState(false)
  const [probeProvider, setProbeProvider] = useState('gemini')
  const [probeResult, setProbeResult] = useState<VaultTestResponse | null>(null)
  const [probingProvider, setProbingProvider] = useState(false)

  const [secretKey, setSecretKey] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [savingSecret, setSavingSecret] = useState(false)

  // AgentShield state
  const [shield, setShield] = useState<ShieldStatusData | null>(null)
  const [shieldLoading, setShieldLoading] = useState(false)
  const [auditRunning, setAuditRunning] = useState(false)
  const [lastAuditPassed, setLastAuditPassed] = useState<boolean | null>(null)

  // Market Ticker state
  const [symbolInput, setSymbolInput] = useState('NVDA')
  const [activeSymbol, setActiveSymbol] = useState('NVDA')
  const [stockData, setStockData] = useState<StockQuoteResponse | null>(null)
  const [stockLoading, setStockLoading] = useState(false)

  // Focus Timers state
  const [timers, setTimers] = useState<TimerRecord[]>([])
  const [timersLoading, setTimersLoading] = useState(false)
  const [timerLabel, setTimerLabel] = useState('Deep Focus')
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [timerType, setTimerType] = useState<'countdown' | 'pomodoro'>('pomodoro')
  const [creatingTimer, setCreatingTimer] = useState(false)
  const [clockNowMs, setClockNowMs] = useState(() => Date.now())

  // Interactive HTML5 Whiteboard state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasInitializedRef = useRef(false)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  const [brushColor, setBrushColor] = useState('#34d399')
  const [brushWidth, setBrushWidth] = useState(3)
  const [nodeLabel, setNodeLabel] = useState('')
  const [nodeCount, setNodeCount] = useState(0)
  const [syncingBoard, setSyncingBoard] = useState(false)
  const [lastExportPath, setLastExportPath] = useState('')

  const testVaultReady = useCallback(async () => {
    setVaultTesting(true)
    try {
      const res = await ipcJson<VaultTestResponse>('/api/vault/test')
      setVaultHealth(res)
    } catch (err) {
      setVaultHealth({
        success: false,
        error: err instanceof Error ? err.message : 'DPAPI vault check failed',
      })
    } finally {
      setVaultTesting(false)
    }
  }, [])

  const fetchShieldStatus = useCallback(async () => {
    setShieldLoading(true)
    try {
      const res = await ipcJson<ShieldStatusData>('/api/security/shield-status')
      setShield(res)
    } catch (err) {
      setShield({
        success: false,
        error: err instanceof Error ? err.message : 'Unable to fetch AgentShield posture',
      })
    } finally {
      setShieldLoading(false)
    }
  }, [])

  const fetchTimers = useCallback(async () => {
    setTimersLoading(true)
    try {
      const res = await ipcJson<TimersListResponse>('/api/timers')
      if (Array.isArray(res.timers)) {
        setTimers(res.timers)
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to fetch timers', 'error')
    } finally {
      setTimersLoading(false)
    }
  }, [pushToast])

  const fetchStock = useCallback(
    async (sym: string) => {
      const clean = sym.trim().toUpperCase() || 'NVDA'
      setActiveSymbol(clean)
      if (isSilent) {
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
          error: err instanceof Error ? err.message : 'Market endpoint unreachable',
        })
      } finally {
        setStockLoading(false)
      }
    },
    [isSilent],
  )

  useEffect(() => {
    void testVaultReady()
    void fetchShieldStatus()
    void fetchTimers()
    void fetchStock('NVDA')
  }, [testVaultReady, fetchShieldStatus, fetchTimers, fetchStock])

  // Real-time 1-second wall-clock tick for SQLite WAL timers
  useEffect(() => {
    const id = window.setInterval(() => {
      setClockNowMs(Date.now())
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Initialize HTML5 canvas backdrop when Whiteboard tab becomes visible
  useEffect(() => {
    if (activeTab !== 'whiteboard') return
    const canvas = canvasRef.current
    if (!canvas || canvasInitializedRef.current) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    paintCanvasBackdrop(ctx)
    canvasInitializedRef.current = true
  }, [activeTab])

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanKey = secretKey.trim()
    if (!cleanKey || !secretValue.trim()) {
      pushToast('Provide both a secret key name and value', 'warning')
      return
    }
    setSavingSecret(true)
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/vault/set', {
        method: 'POST',
        body: JSON.stringify({
          key: cleanKey,
          value: secretValue.trim(),
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed storing secret in DPAPI vault', 'error')
        return
      }
      setSecretValue('')
      pushToast(`Encrypted & stored "${cleanKey}" in Windows DPAPI vault`, 'success')
      void testVaultReady()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'DPAPI vault write error', 'error')
    } finally {
      setSavingSecret(false)
    }
  }

  const handleProbeProvider = async () => {
    setProbingProvider(true)
    try {
      const res = await ipcJson<VaultTestResponse>(
        `/api/vault/test?provider=${encodeURIComponent(probeProvider)}`,
      )
      setProbeResult(res)
      if (res.success) {
        pushToast(
          `${probeProvider.toUpperCase()} vault route operational (${res.latency_ms ?? 0}ms)`,
          'success',
        )
      } else {
        pushToast(res.error || `${probeProvider.toUpperCase()} probe returned ${res.status}`, 'warning')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Provider vault probe failed', 'error')
    } finally {
      setProbingProvider(false)
    }
  }

  const handleRunAudit = async () => {
    setAuditRunning(true)
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.shield) {
        setShield(res.shield)
      }
      setLastAuditPassed(Boolean(res.audit_passed ?? res.success))
      if (res.success === false) {
        pushToast(res.error || 'Security audit returned warnings', 'warning')
      } else {
        pushToast(
          `AgentShield posture audit complete (Score ${res.shield?.score ?? '—'}/100)`,
          'success',
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Audit request failed', 'error')
    } finally {
      setAuditRunning(false)
    }
  }

  const createTimer = async (label: string, minutes: number, type: 'countdown' | 'pomodoro') => {
    const cleanLabel = label.trim() || 'Focus Timer'
    const durationSec = Math.max(10, Math.round(minutes * 60))
    setCreatingTimer(true)
    try {
      const res = await ipcJson<{ success?: boolean; timer?: TimerRecord; error?: string }>(
        '/api/timers',
        {
          method: 'POST',
          body: JSON.stringify({
            label: cleanLabel,
            duration_sec: durationSec,
            timer_type: type,
          }),
        },
      )
      if (res.success === false) {
        pushToast(res.error || 'Unable to create timer', 'error')
        return
      }
      pushToast(`Started ${cleanLabel} (${minutes}m)`, 'success')
      await fetchTimers()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Timer creation error', 'error')
    } finally {
      setCreatingTimer(false)
    }
  }

  const handleDeleteTimer = async (timerId: string) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/timers/${encodeURIComponent(timerId)}`,
        { method: 'DELETE' },
      )
      if (res.success === false) {
        pushToast(res.error || 'Failed deleting timer', 'error')
        return
      }
      setTimers((prev) => prev.filter((t) => t.id !== timerId))
      pushToast('Timer removed', 'info')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Timer delete error', 'error')
    }
  }

  // Whiteboard drawing helpers
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scaleX = BOARD_WIDTH / Math.max(1, rect.width)
    const scaleY = BOARD_HEIGHT / Math.max(1, rect.height)
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const pt = getCanvasPoint(e)
    lastPointRef.current = pt

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = brushColor
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, brushWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pt = getCanvasPoint(e)
    const prev = lastPointRef.current || pt

    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()

    lastPointRef.current = pt
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false
    lastPointRef.current = null
    const canvas = canvasRef.current
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId)
    }
  }

  const handleAddBoardNode = async (e: React.FormEvent) => {
    e.preventDefault()
    const label = nodeLabel.trim()
    if (!label) {
      pushToast('Enter a node label to stamp on whiteboard', 'warning')
      return
    }
    const idx = nodeCount
    const col = idx % 4
    const row = Math.floor(idx / 4) % 3
    const nx = 48 + col * 215
    const ny = 48 + row * 120

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.save()
      ctx.fillStyle = 'rgba(17, 24, 34, 0.92)'
      ctx.strokeStyle = brushColor
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(nx, ny, 180, 64, 12)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#f1f5f9'
      ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif'
      ctx.fillText(label.slice(0, 22), nx + 16, ny + 37)
      ctx.restore()
    }

    setNodeCount((c) => c + 1)
    setNodeLabel('')
    setSyncingBoard(true)
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({
          action: 'node',
          label,
          x: nx,
          y: ny,
          node_type: 'state',
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed persisting whiteboard node', 'error')
      } else {
        pushToast(`Node "${label}" persisted to WhiteboardBridge`, 'success')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Whiteboard sync error', 'error')
    } finally {
      setSyncingBoard(false)
    }
  }

  const handleClearBoard = async () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      paintCanvasBackdrop(ctx)
    }
    setNodeCount(0)
    setSyncingBoard(true)
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Server board clear returned error', 'warning')
      } else {
        pushToast('Whiteboard canvas & SQLite state cleared', 'info')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Clear board request failed', 'error')
    } finally {
      setSyncingBoard(false)
    }
  }

  const handleExportBoardPng = async () => {
    const canvas = canvasRef.current
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `nexus-whiteboard-${Date.now()}.png`
      link.click()
    }

    setSyncingBoard(true)
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'export_png' }),
      })
      if (res.file_path) {
        setLastExportPath(res.file_path)
      }
      if (res.success === false) {
        pushToast(res.error || 'Downloaded browser PNG (server export unavailable)', 'info')
      } else {
        pushToast('Exported PNG locally & via WhiteboardBridge', 'success')
      }
    } catch {
      pushToast('Downloaded canvas PNG locally', 'success')
    } finally {
      setSyncingBoard(false)
    }
  }

  const activeTimersCount = useMemo(
    () => timers.filter((t) => t.status === 'active').length,
    [timers],
  )

  const shieldScore = typeof shield?.score === 'number' ? shield.score : 0
  const shieldUpper = String(shield?.status || 'UNKNOWN').toUpperCase()
  const stockUp = (stockData?.change ?? 0) >= 0

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter">
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              Sovereign Vault &amp; Focus Deck
            </h1>
            <p className="text-xs text-slate-400">
              DPAPI secrets, AgentShield posture, live ticker, timers &amp; spatial whiteboard
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                vaultHealth?.success ? 'bg-emerald-400 animate-mint-breathe' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-slate-200">
              {vaultHealth?.vault || (vaultTesting ? 'Checking...' : 'DPAPI Offline')}
            </span>
          </div>

          <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { id: 'security', label: 'Vault & Shield', icon: ShieldCheck },
                { id: 'focus', label: 'Timers & Market', icon: Clock },
                { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'spatial-pill-active text-emerald-200'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {tab.id === 'focus' && activeTimersCount > 0 && (
                    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.2 font-mono text-[10px] text-emerald-200">
                      {activeTimersCount}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* TAB 1: DPAPI VAULT & AGENTSHIELD POSTURE */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* DPAPI Vault Card */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Windows DPAPI Secret Store</h2>
                  <p className="text-xs text-slate-400">
                    Local hardware-bound encryption via CryptProtectData
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void testVaultReady()}
                disabled={vaultTesting}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${vaultTesting ? 'animate-spin' : ''}`} />
                <span>Test Vault</span>
              </button>
            </div>

            <form onSubmit={handleSaveSecret} className="flex flex-col gap-3.5">
              <div className="flex flex-wrap gap-1.5">
                {VAULT_KEY_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSecretKey(preset)}
                    className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                      secretKey === preset
                        ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="Secret Key Name (e.g. GEMINI_API_KEY)"
                className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
              />

              <div className="relative flex items-center">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="Secret token or credential value"
                  className="w-full rounded-xl border border-white/10 bg-[#070b10]/70 py-2.5 pl-3.5 pr-10 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-3 text-slate-400 hover:text-slate-200"
                  aria-label="Toggle secret visibility"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={savingSecret}
                className="spatial-pill-active self-start rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
              >
                {savingSecret ? 'Encrypting...' : 'Store in DPAPI Vault'}
              </button>
            </form>

            {/* Provider Key Route Probe */}
            <div className="mt-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200">
                  Live Provider Key Probe
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={probeProvider}
                    onChange={(e) => setProbeProvider(e.target.value)}
                    className="rounded-xl border border-white/10 bg-[#070b10]/85 px-3 py-1.5 text-xs text-slate-200 outline-none"
                  >
                    {PROBE_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleProbeProvider()}
                    disabled={probingProvider || isSilent}
                    className="spatial-pill rounded-xl px-3 py-1.5 text-xs font-medium text-emerald-300 disabled:opacity-50"
                  >
                    {probingProvider ? 'Probing...' : 'Probe Route'}
                  </button>
                </div>
              </div>
              {probeResult && (
                <div className="flex items-center justify-between text-xs">
                  <span className={probeResult.success ? 'text-emerald-300' : 'text-amber-300'}>
                    {probeResult.status || (probeResult.success ? 'OPERATIONAL' : 'UNAVAILABLE')}
                    {probeResult.error ? ` — ${probeResult.error}` : ''}
                  </span>
                  {typeof probeResult.latency_ms === 'number' && (
                    <span className="font-mono text-slate-400">{probeResult.latency_ms}ms</span>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* AgentShield Security Posture & Audit Card */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  {shieldUpper === 'CRITICAL' ? (
                    <ShieldAlert className="h-4 w-4 text-rose-300" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    AgentShield Posture &amp; Audit
                  </h2>
                  <p className="text-xs text-slate-400">
                    Static invariant checks, quarantine ledger &amp; ScopeGuard posture
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchShieldStatus()}
                  disabled={shieldLoading}
                  className="spatial-pill rounded-xl px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunAudit()}
                  disabled={auditRunning}
                  className="spatial-pill-active rounded-xl px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {auditRunning ? 'Auditing...' : 'Run Audit'}
                </button>
              </div>
            </div>

            {/* Posture Score Block */}
            <div className="rounded-2xl border border-white/10 bg-[#070b10]/65 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400">
                    Security Posture Score
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold text-slate-100">
                      {shieldScore}
                    </span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    shieldUpper === 'SAFE' || lastAuditPassed
                      ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200'
                      : shieldUpper === 'WARN'
                        ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
                        : 'border-rose-400/35 bg-rose-400/15 text-rose-200'
                  }`}
                >
                  {shieldUpper}
                </span>
              </div>

              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, shieldScore))}%` }}
                />
              </div>
            </div>

            {/* Posture Breakdown Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5">
                <span className="text-[11px] text-slate-400">Findings</span>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100">
                  {shield?.findings_count ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5">
                <span className="text-[11px] text-slate-400">Quarantined Plugins</span>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100">
                  {shield?.quarantined_plugins?.length ?? 0}
                </p>
              </div>
              <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 sm:col-span-1">
                <span className="text-[11px] text-slate-400">Audit Check</span>
                <p className="mt-1 font-mono text-sm font-semibold text-emerald-300">
                  {lastAuditPassed === null
                    ? shield?.has_audit
                      ? 'Verified'
                      : 'Pending'
                    : lastAuditPassed
                      ? 'PASSED'
                      : 'WARNING'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-xs text-slate-400">
              <div className="flex justify-between gap-4">
                <span>Last Scan</span>
                <span className="font-mono text-slate-200">
                  {formatTimeValue(shield?.scanned_at)}
                </span>
              </div>
              {shield?.target_path && (
                <div className="flex justify-between gap-4">
                  <span>Scope Target</span>
                  <span className="truncate font-mono text-slate-300">{shield.target_path}</span>
                </div>
              )}
              {shield?.error && (
                <p className="mt-1 text-amber-300">{shield.error}</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: FOCUS TIMERS & LIVE MARKET TICKER */}
      {activeTab === 'focus' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Focus Timers (SQLite WAL) */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Focus &amp; Pomodoro Timers
                </h2>
                <p className="text-xs text-slate-400">
                  Persisted in SQLite WAL with live countdown sync
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchTimers()}
                disabled={timersLoading}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${timersLoading ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>

            {/* Quick Timer Presets */}
            <div className="flex flex-wrap gap-2">
              {TIMER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={creatingTimer}
                  onClick={() =>
                    void createTimer(p.label, p.minutes, p.type as 'countdown' | 'pomodoro')
                  }
                  className="spatial-pill rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  + {p.label} ({p.minutes}m)
                </button>
              ))}
            </div>

            {/* Custom Timer Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void createTimer(timerLabel, timerMinutes, timerType)
              }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-12"
            >
              <input
                type="text"
                value={timerLabel}
                onChange={(e) => setTimerLabel(e.target.value)}
                placeholder="Session label"
                className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50 sm:col-span-5"
              />
              <input
                type="number"
                min={1}
                max={480}
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-emerald-400/50 sm:col-span-2"
              />
              <select
                value={timerType}
                onChange={(e) => setTimerType(e.target.value as 'countdown' | 'pomodoro')}
                className="rounded-xl border border-white/10 bg-[#070b10]/85 px-3 py-2.5 text-xs text-slate-200 outline-none sm:col-span-3"
              >
                <option value="pomodoro">Pomodoro</option>
                <option value="countdown">Countdown</option>
              </select>
              <button
                type="submit"
                disabled={creatingTimer}
                className="spatial-pill-active flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold sm:col-span-2 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Start</span>
              </button>
            </form>

            {/* Timers List */}
            <div className="flex max-h-[340px] flex-col gap-3 overflow-y-auto pr-1">
              {timers.length > 0 ? (
                timers.map((t) => {
                  const expMs = Date.parse(t.expires_at)
                  const computedRem = Number.isNaN(expMs)
                    ? t.remaining_sec
                    : Math.max(0, Math.floor((expMs - clockNowMs) / 1000))
                  const completed = t.status === 'completed' || computedRem <= 0
                  const pct =
                    t.duration_sec > 0
                      ? Math.min(100, Math.max(0, ((t.duration_sec - computedRem) / t.duration_sec) * 100))
                      : 100

                  return (
                    <div
                      key={t.id}
                      className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.025] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-100">
                              {t.label}
                            </span>
                            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase text-slate-400">
                              {t.timer_type}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {completed ? 'Completed' : 'Active'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`font-mono text-lg font-semibold ${
                              completed ? 'text-slate-400' : 'text-emerald-300'
                            }`}
                          >
                            {formatCountdown(computedRem)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTimer(t.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                            title="Delete timer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all ${
                            completed ? 'bg-slate-500' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-xs text-slate-400">
                  No focus timers active. Launch a quick sprint or custom Pomodoro above.
                </div>
              )}
            </div>
          </section>

          {/* Live Market Ticker */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4 text-emerald-300" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Live Market Ticker</h2>
                  <p className="text-xs text-slate-400">Real-time quote telemetry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void fetchStock(activeSymbol)}
                disabled={stockLoading}
                className="spatial-pill rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                {stockLoading ? 'Updating...' : 'Refresh'}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void fetchStock(symbolInput)
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                placeholder="Ticker (e.g. NVDA)"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2 font-mono text-xs uppercase text-slate-100 outline-none focus:border-emerald-400/50"
              />
              <button
                type="submit"
                disabled={stockLoading || isSilent}
                className="spatial-pill-active rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                Load
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5">
              {STOCK_QUICK_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    setSymbolInput(sym)
                    void fetchStock(sym)
                  }}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] transition ${
                    activeSymbol === sym
                      ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {isSilent ? (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-xs text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Market feed suspended while SILENT Air-Gap mode is active.</span>
              </div>
            ) : stockData?.success && typeof stockData.price === 'number' ? (
              <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#070b10]/65 p-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-xs uppercase tracking-wider text-slate-400">
                      {stockData.symbol || activeSymbol}
                    </span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-bold text-slate-100">
                        {stockData.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400">
                        {stockData.currency || 'USD'}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1 rounded-xl border px-2.5 py-1 font-mono text-xs font-medium ${
                      stockUp
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
                    }`}
                  >
                    {stockUp ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {stockUp ? '+' : ''}
                      {(stockData.change ?? 0).toFixed(2)} (
                      {(stockData.change_percent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs">
                  <div>
                    <span className="text-slate-400">Prev Close</span>
                    <p className="mt-0.5 font-mono text-slate-200">
                      {typeof stockData.previous_close === 'number'
                        ? stockData.previous_close.toFixed(2)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Volume</span>
                    <p className="mt-0.5 font-mono text-slate-200">
                      {formatVolume(stockData.volume)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Day High</span>
                    <p className="mt-0.5 font-mono text-slate-200">
                      {typeof stockData.high === 'number' ? stockData.high.toFixed(2) : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Day Low</span>
                    <p className="mt-0.5 font-mono text-slate-200">
                      {typeof stockData.low === 'number' ? stockData.low.toFixed(2) : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-xs text-slate-400">
                {stockData?.error || 'Fetch a symbol quote to inspect live market telemetry.'}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: INTERACTIVE HTML5 CANVAS WHITEBOARD */}
      {activeTab === 'whiteboard' && (
        <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Spatial Canvas Whiteboard
              </h2>
              <p className="text-xs text-slate-400">
                Sketch diagrams locally and synchronize nodes or PNG exports via WhiteboardBridge
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Color Swatches */}
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                {BOARD_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setBrushColor(c.hex)}
                    title={c.label}
                    className={`h-5 w-5 rounded-full border transition ${
                      brushColor === c.hex
                        ? 'scale-110 border-white ring-2 ring-emerald-400/40'
                        : 'border-white/20 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>

              {/* Stroke Width */}
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {[2, 4, 7].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setBrushWidth(w)}
                    className={`rounded-lg px-2.5 py-1 font-mono text-[11px] transition ${
                      brushWidth === w
                        ? 'spatial-pill-active text-emerald-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleClearBoard()}
                disabled={syncingBoard}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <Eraser className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportBoardPng()}
                disabled={syncingBoard}
                className="spatial-pill-active flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export PNG</span>
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1016]">
            <canvas
              ref={canvasRef}
              width={BOARD_WIDTH}
              height={BOARD_HEIGHT}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="block aspect-[960/440] w-full cursor-crosshair touch-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={handleAddBoardNode} className="flex flex-1 flex-wrap items-center gap-2">
              <input
                type="text"
                value={nodeLabel}
                onChange={(e) => setNodeLabel(e.target.value)}
                placeholder="Stamp architecture node onto canvas & SQLite (e.g. IPC Spine)"
                className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
              />
              <button
                type="submit"
                disabled={syncingBoard}
                className="spatial-pill rounded-xl px-3.5 py-2 text-xs font-medium text-emerald-300 disabled:opacity-50"
              >
                + Stamp Node
              </button>
            </form>

            {lastExportPath && (
              <span className="truncate font-mono text-[11px] text-slate-400">
                Server PNG: {lastExportPath}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default VaultView
