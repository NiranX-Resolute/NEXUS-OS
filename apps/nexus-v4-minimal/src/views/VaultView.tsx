import { type FormEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Download,
  Eraser,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PenTool,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

type VaultTab = 'security' | 'focus' | 'whiteboard';
type BoardTool = 'draw' | 'node' | 'text';
type NodeKind = 'default' | 'action' | 'state' | 'decision' | 'service' | 'database';

interface VaultTestPayload {
  success?: boolean;
  vault?: string;
  status?: string;
  provider_id?: string;
  latency_ms?: number;
  error?: string;
}

interface ShieldStatusPayload {
  success?: boolean;
  has_audit?: boolean;
  audit_id?: string;
  scanned_at?: number | string;
  score?: number;
  status?: string;
  target_path?: string;
  findings_count?: number;
  quarantined_plugins?: string[];
  error?: string;
}

interface AuditRunPayload {
  success?: boolean;
  audit_passed?: boolean;
  shield?: ShieldStatusPayload;
  timestamp?: number;
  error?: string;
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

interface FocusTimerItem {
  id: string;
  label: string;
  duration_sec: number;
  remaining_sec: number;
  timer_type?: string;
  status: string;
  created_at?: string;
  expires_at?: string;
}

interface TimersListPayload {
  success?: boolean;
  timers?: FocusTimerItem[];
  count?: number;
  error?: string;
}

interface WhiteboardDrawPayload {
  success?: boolean;
  action?: string;
  file_path?: string;
  file_size_bytes?: number;
  elements_count?: number;
  error?: string;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 480;

const STROKE_COLORS = [
  { label: 'Chalk', value: '#f4f4f5' },
  { label: 'Mint', value: '#10b981' },
  { label: 'Amber', value: '#f59e0b' },
  { label: 'Cyan', value: '#38bdf8' },
  { label: 'Red', value: '#ef4444' },
] as const;

const QUICK_TICKERS = ['NVDA', 'AAPL', 'MSFT', 'SPY'] as const;
const TIMER_PRESETS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
] as const;

function formatTimerClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
  }
  return [mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatEpoch(raw?: number | string | null): string {
  if (!raw) return '—';
  const num = typeof raw === 'number' ? raw : Number(raw);
  const d =
    Number.isFinite(num) && num > 0
      ? new Date(num > 1e12 ? num : num * 1000)
      : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function paintCanvasBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#090a0c';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let gx = 24; gx < CANVAS_WIDTH; gx += 32) {
    for (let gy = 24; gy < CANVAS_HEIGHT; gy += 32) {
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
  }
}

export function VaultView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<VaultTab>('security');
  const [refreshing, setRefreshing] = useState(false);

  // DPAPI Vault
  const [vaultStatus, setVaultStatus] = useState<VaultTestPayload | null>(null);
  const [probeProviderInput, setProbeProviderInput] = useState('');
  const [probeLoading, setProbeLoading] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showSecretValue, setShowSecretValue] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [lastSavedReceipt, setLastSavedReceipt] = useState<{ key: string; at: string } | null>(null);

  // AgentShield Posture & Audit
  const [shieldStatus, setShieldStatus] = useState<ShieldStatusPayload | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [lastAuditReceipt, setLastAuditReceipt] = useState<AuditRunPayload | null>(null);

  // Live Market Ticker
  const [tickerSymbol, setTickerSymbol] = useState('NVDA');
  const [tickerDraft, setTickerDraft] = useState('NVDA');
  const [stockQuote, setStockQuote] = useState<StockQuotePayload | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Focus Timers
  const [timers, setTimers] = useState<FocusTimerItem[]>([]);
  const [timerLabel, setTimerLabel] = useState('Deep Work Slice');
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerType, setTimerType] = useState<'countdown' | 'pomodoro'>('pomodoro');
  const [timerBusy, setTimerBusy] = useState(false);
  const [deletingTimerId, setDeletingTimerId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // HTML5 Canvas Whiteboard
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasInitializedRef = useRef(false);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [boardTool, setBoardTool] = useState<BoardTool>('draw');
  const [strokeColor, setStrokeColor] = useState<string>('#10b981');
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [boardLabel, setBoardLabel] = useState('ScopeGuard Node');
  const [boardNodeType, setBoardNodeType] = useState<NodeKind>('state');
  const [boardSyncBusy, setBoardSyncBusy] = useState(false);
  const [lastExportMeta, setLastExportMeta] = useState<{ path?: string; bytes?: number; at: string } | null>(null);

  const isSilent = telemetry.workspaceMode === 'SILENT' || Boolean(telemetry.airGapped);

  const loadMarketTicker = useCallback(
    async (symbol: string) => {
      const clean = symbol.trim().toUpperCase() || 'NVDA';
      if (isSilent) {
        setStockQuote({
          success: false,
          symbol: clean,
          error: 'Network disabled in SILENT Air-Gap mode',
        });
        return;
      }
      setStockLoading(true);
      try {
        const res = await ipcFetch(`/api/widgets/stock?symbol=${encodeURIComponent(clean)}`);
        const data = (await res.json()) as StockQuotePayload;
        setStockQuote(data);
      } catch (err) {
        setStockQuote({
          success: false,
          symbol: clean,
          error: err instanceof Error ? err.message : 'Market fetch failed',
        });
      } finally {
        setStockLoading(false);
      }
    },
    [isSilent]
  );

  const loadVaultAndTimers = useCallback(async () => {
    setRefreshing(true);
    try {
      const [vaultRes, shieldRes, timersRes] = await Promise.allSettled([
        ipcJson<VaultTestPayload>('/api/vault/test'),
        ipcJson<ShieldStatusPayload>('/api/security/shield-status'),
        ipcJson<TimersListPayload>('/api/timers'),
      ]);

      if (vaultRes.status === 'fulfilled') {
        setVaultStatus(vaultRes.value);
      }
      if (shieldRes.status === 'fulfilled') {
        setShieldStatus(shieldRes.value);
      }
      if (timersRes.status === 'fulfilled' && Array.isArray(timersRes.value.timers)) {
        setTimers(timersRes.value.timers);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadVaultAndTimers();
  }, [loadVaultAndTimers]);

  useEffect(() => {
    void loadMarketTicker(tickerSymbol);
  }, [loadMarketTicker, tickerSymbol]);

  // 1-second wall-clock tick for live Focus Timers
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Initialize Canvas once when whiteboard tab becomes active
  useEffect(() => {
    if (activeTab !== 'whiteboard') return;
    const canvas = canvasRef.current;
    if (!canvas || canvasInitializedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintCanvasBackground(ctx);
    canvasInitializedRef.current = true;
  }, [activeTab]);

  const handleProbeProvider = async (e: FormEvent) => {
    e.preventDefault();
    const provider = probeProviderInput.trim();
    setProbeLoading(true);
    try {
      const path = provider
        ? `/api/vault/test?provider=${encodeURIComponent(provider)}`
        : '/api/vault/test';
      const res = await ipcJson<VaultTestPayload>(path);
      setVaultStatus(res);
      if (res.success) {
        pushToast(provider ? `Provider ${provider} probe passed` : 'DPAPI Vault operational', 'success');
      } else {
        pushToast(res.error || 'Vault probe failed', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Vault probe failed', 'error');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleSaveSecret = async (e: FormEvent) => {
    e.preventDefault();
    const key = secretKey.trim();
    const val = secretValue;
    if (!key) {
      pushToast('Secret key name is required', 'warn');
      return;
    }
    if (!val) {
      pushToast('Secret value cannot be empty', 'warn');
      return;
    }

    setSavingSecret(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/vault/set', {
        method: 'POST',
        body: JSON.stringify({ key, value: val }),
      });
      if (res.success) {
        setSecretValue('');
        setShowSecretValue(false);
        setLastSavedReceipt({
          key,
          at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        });
        pushToast(`Encrypted secret '${key}' stored in Windows DPAPI Vault`, 'success');
      } else {
        pushToast(res.error || 'Failed to store secret in DPAPI Vault', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Vault write failed', 'error');
    } finally {
      setSavingSecret(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await ipcJson<AuditRunPayload>('/api/audit/run', { method: 'POST' });
      setLastAuditReceipt(res);
      if (res.shield) {
        setShieldStatus(res.shield);
      }
      if (res.success) {
        pushToast('ScopeGuard + AgentShield audit completed', 'success');
      } else {
        pushToast(res.error || 'Security audit failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Audit execution failed', 'error');
    } finally {
      setAuditRunning(false);
    }
  };

  const handleCreateTimer = async (e: FormEvent) => {
    e.preventDefault();
    const mins = Number(timerMinutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      pushToast('Duration must be at least 1 minute', 'warn');
      return;
    }
    const cleanLabel = timerLabel.trim() || 'Focus Timer';
    setTimerBusy(true);
    try {
      const res = await ipcJson<{ success?: boolean; timer?: FocusTimerItem; error?: string }>(
        '/api/timers',
        {
          method: 'POST',
          body: JSON.stringify({
            label: cleanLabel,
            duration_sec: Math.round(mins * 60),
            timer_type: timerType,
          }),
        }
      );
      if (res.success && res.timer) {
        setTimers((prev) => [res.timer!, ...prev]);
        pushToast(`Timer '${cleanLabel}' started (${mins}m)`, 'success');
      } else {
        pushToast(res.error || 'Failed to create timer', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Timer creation failed', 'error');
    } finally {
      setTimerBusy(false);
    }
  };

  const handleDeleteTimer = async (timerId: string) => {
    setDeletingTimerId(timerId);
    try {
      const res = await ipcJson<{ success?: boolean; id?: string; error?: string }>(
        `/api/timers/${encodeURIComponent(timerId)}`,
        { method: 'DELETE' }
      );
      if (res.success) {
        setTimers((prev) => prev.filter((t) => t.id !== timerId));
        pushToast('Timer removed', 'info');
      } else {
        pushToast(res.error || 'Could not remove timer', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete timer failed', 'error');
    } finally {
      setDeletingTimerId(null);
    }
  };

  const handleTickerSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = tickerDraft.trim().toUpperCase();
    if (!next) return;
    if (next === tickerSymbol) {
      void loadMarketTicker(next);
    } else {
      setTickerSymbol(next);
    }
  };

  const getCanvasPoint = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const drawNodeOnCanvas = (ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string) => {
    const width = Math.max(140, Math.min(240, label.length * 8 + 36));
    const height = 46;
    const rx = Math.max(8, Math.min(CANVAS_WIDTH - width - 8, x - width / 2));
    const ry = Math.max(8, Math.min(CANVAS_HEIGHT - height - 8, y - height / 2));

    ctx.fillStyle = '#13161c';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(rx, ry, width, height, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f4f4f5';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 26), rx + 14, ry + height / 2);
  };

  const handleCanvasPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const pt = getCanvasPoint(e);

    if (boardTool === 'draw') {
      canvas.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = pt;
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(1, strokeWidth / 2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (boardTool === 'node') {
      const label = boardLabel.trim() || 'Node';
      drawNodeOnCanvas(ctx, pt.x, pt.y, label, strokeColor);
      setBoardSyncBusy(true);
      void ipcJson<WhiteboardDrawPayload>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({
          action: 'node',
          x: pt.x,
          y: pt.y,
          label,
          node_type: boardNodeType,
        }),
      })
        .then((res) => {
          if (!res.success) {
            pushToast(res.error || 'Failed syncing node to whiteboard bridge', 'warn');
          }
        })
        .catch(() => {
          pushToast('Node drawn locally; bridge unreachable', 'warn');
        })
        .finally(() => setBoardSyncBusy(false));
      return;
    }

    if (boardTool === 'text') {
      const content = boardLabel.trim() || 'Annotation';
      ctx.fillStyle = strokeColor;
      ctx.font = '500 14px "Inter", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(content, pt.x, pt.y);
      setBoardSyncBusy(true);
      void ipcJson<WhiteboardDrawPayload>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({
          action: 'text',
          x: pt.x,
          y: pt.y,
          content,
          font_size: 14,
        }),
      })
        .then((res) => {
          if (!res.success) {
            pushToast(res.error || 'Failed syncing text to whiteboard bridge', 'warn');
          }
        })
        .catch(() => {
          pushToast('Text drawn locally; bridge unreachable', 'warn');
        })
        .finally(() => setBoardSyncBusy(false));
    }
  };

  const handleCanvasPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || boardTool !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const prev = lastPointRef.current;
    if (!canvas || !ctx || !prev) return;

    const next = getCanvasPoint(e);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPointRef.current = next;
  };

  const handleCanvasPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture already released
    }
  };

  const handleClearWhiteboard = async () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      paintCanvasBackground(ctx);
    }
    setBoardSyncBusy(true);
    try {
      const res = await ipcJson<WhiteboardDrawPayload>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.success) {
        pushToast('Whiteboard cleared locally and in SovereignStore', 'info');
      }
    } catch {
      pushToast('Canvas cleared locally', 'info');
    } finally {
      setBoardSyncBusy(false);
    }
  };

  const handleExportWhiteboardPng = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `nexus-whiteboard-${Date.now()}.png`;
      link.click();
    }

    setBoardSyncBusy(true);
    try {
      const res = await ipcJson<WhiteboardDrawPayload>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'export_png' }),
      });
      if (res.success) {
        setLastExportMeta({
          path: res.file_path,
          bytes: res.file_size_bytes,
          at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        pushToast('Whiteboard PNG exported', 'success');
      } else {
        pushToast(res.error || 'Canvas PNG downloaded; bridge export skipped', 'warn');
      }
    } catch {
      pushToast('Canvas PNG downloaded locally', 'info');
    } finally {
      setBoardSyncBusy(false);
    }
  };

  const computedTimers = useMemo(() => {
    return timers.map((t) => {
      let remaining = t.remaining_sec ?? 0;
      if (t.expires_at && t.status === 'active') {
        const expMs = Date.parse(t.expires_at);
        if (!Number.isNaN(expMs)) {
          remaining = Math.max(0, Math.ceil((expMs - nowMs) / 1000));
        }
      }
      const effectiveStatus = remaining <= 0 ? 'completed' : t.status;
      const pct =
        t.duration_sec > 0
          ? Math.max(0, Math.min(100, Math.round((remaining / t.duration_sec) * 100)))
          : 0;
      return { ...t, liveRemaining: remaining, effectiveStatus, pct };
    });
  }, [nowMs, timers]);

  const activeTimersCount = useMemo(
    () => computedTimers.filter((t) => t.effectiveStatus === 'active' && t.liveRemaining > 0).length,
    [computedTimers]
  );

  const stockDeltaPositive = (stockQuote?.change ?? 0) >= 0;

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto bg-[#090a0c] p-6 text-zinc-100">
      {/* Header Strip */}
      <header className="monograph-surface rounded-lg p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-emerald-400" />
              <h1 className="text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                Vault, Shield &amp; Sovereign Utility
              </h1>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] tracking-wider ${
                  vaultStatus?.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                {vaultStatus?.vault || (vaultStatus?.success ? 'DPAPI READY' : 'CHECKING')}
              </span>
              <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-300 tabular-nums">
                SHIELD {typeof shieldStatus?.score === 'number' ? `${shieldStatus.score}/100` : '—'}
              </span>
              <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                TIMERS {activeTimersCount}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Windows DPAPI encrypted credential vault, AgentShield posture auditing, live market telemetry, focus timers, and whiteboard bridge.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              aria-label="Vault view sections"
              className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5"
            >
              {(
                [
                  { id: 'security', label: 'Vault & Shield' },
                  { id: 'focus', label: 'Focus & Market' },
                  { id: 'whiteboard', label: 'Whiteboard' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-white/[0.08] text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={() => {
                void loadVaultAndTimers();
                void loadMarketTicker(tickerSymbol);
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>
      </header>

      {/* Sub-tab 1: Vault & Shield */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* DPAPI Vault Secret Store */}
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-[13px] font-medium text-zinc-100">Windows DPAPI Credential Vault</h2>
                <p className="text-xs text-zinc-400">
                  Write-only encrypted local secret storage under user Windows Data Protection API.
                </p>
              </div>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                  vaultStatus?.success
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                {vaultStatus?.vault || vaultStatus?.status || 'UNVERIFIED'}
              </span>
            </div>

            <form onSubmit={handleProbeProvider} className="flex flex-col gap-2 rounded-md border border-white/[0.06] bg-[#090a0c] p-4 sm:flex-row sm:items-center">
              <input
                type="text"
                value={probeProviderInput}
                onChange={(e) => setProbeProviderInput(e.target.value)}
                placeholder="Optional provider ID to probe (e.g. groq, openrouter)..."
                className="min-w-0 flex-1 rounded border border-white/[0.08] bg-[#0e1014] px-3 py-1.5 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={probeLoading}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
              >
                {probeLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Test Vault
              </button>
            </form>

            {vaultStatus && (vaultStatus.provider_id || vaultStatus.error) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-[#090a0c] px-3.5 py-2.5 font-mono text-[11px] tabular-nums">
                <span className={vaultStatus.success ? 'text-emerald-300' : 'text-amber-300'}>
                  {vaultStatus.error || `${vaultStatus.provider_id} · ${vaultStatus.status || 'OPERATIONAL'}`}
                </span>
                {typeof vaultStatus.latency_ms === 'number' && (
                  <span className="text-zinc-400">{vaultStatus.latency_ms.toFixed(1)} ms</span>
                )}
              </div>
            )}

            <form onSubmit={handleSaveSecret} className="space-y-4 border-t border-white/[0.08] pt-5">
              <div className="space-y-1.5">
                <label htmlFor="vault-key-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                  Secret Key Identifier
                </label>
                <input
                  id="vault-key-input"
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="e.g. GROQ_API_KEY or CUSTOM_ENDPOINT_TOKEN"
                  className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3.5 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="vault-val-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                  Secret Value (Write-Only)
                </label>
                <div className="relative flex items-center">
                  <input
                    id="vault-val-input"
                    type={showSecretValue ? 'text' : 'password'}
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Paste token or API credential..."
                    className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] py-2 pl-3.5 pr-10 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretValue((v) => !v)}
                    aria-label={showSecretValue ? 'Hide secret value' : 'Show secret value'}
                    className="absolute right-2.5 text-zinc-500 transition hover:text-zinc-300"
                  >
                    {showSecretValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={savingSecret}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {savingSecret ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  Store Secret
                </button>
                {lastSavedReceipt && (
                  <span className="font-mono text-[11px] text-emerald-400 tabular-nums">
                    Saved {lastSavedReceipt.key} at {lastSavedReceipt.at}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* AgentShield Posture & Audit */}
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-[13px] font-medium text-zinc-100">AgentShield Posture &amp; Audit</h2>
                <p className="text-xs text-zinc-400">
                  Static plugin scanner, quarantine registry, and ScopeGuard invariant verification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunAudit()}
                disabled={auditRunning}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {auditRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Run Audit
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Posture Score
                </span>
                <span className="mt-1.5 block font-mono text-2xl font-medium text-emerald-300 tabular-nums">
                  {typeof shieldStatus?.score === 'number' ? `${shieldStatus.score}` : '—'}
                </span>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Findings
                </span>
                <span
                  className={`mt-1.5 block font-mono text-2xl font-medium tabular-nums ${
                    (shieldStatus?.findings_count ?? 0) > 0 ? 'text-amber-300' : 'text-zinc-100'
                  }`}
                >
                  {shieldStatus?.findings_count ?? 0}
                </span>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
                <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Quarantined
                </span>
                <span className="mt-1.5 block font-mono text-2xl font-medium text-zinc-100 tabular-nums">
                  {shieldStatus?.quarantined_plugins?.length ?? 0}
                </span>
              </div>
            </div>

            <div className="space-y-2.5 rounded-md border border-white/[0.06] bg-[#090a0c] p-4 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-zinc-400">Audit Status</span>
                <span
                  className={
                    shieldStatus?.status === 'SECURE' || shieldStatus?.status === 'PASS'
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }
                >
                  {shieldStatus?.status || 'PENDING'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-zinc-400">Audit ID</span>
                <span className="text-zinc-200">{shieldStatus?.audit_id || '—'}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                <span className="text-zinc-400">Last Scanned</span>
                <span className="text-zinc-300 tabular-nums">{formatEpoch(shieldStatus?.scanned_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Target Path</span>
                <span className="max-w-[260px] truncate text-zinc-400" title={shieldStatus?.target_path}>
                  {shieldStatus?.target_path || 'core/mcp/plugins'}
                </span>
              </div>
            </div>

            {lastAuditReceipt && (
              <div className="flex items-center justify-between rounded-md border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-2.5 font-mono text-[11px] text-emerald-300 tabular-nums">
                <span>
                  Audit verdict: {lastAuditReceipt.audit_passed ? 'PASSED' : 'REVIEW REQUIRED'}
                </span>
                <span>{formatEpoch(lastAuditReceipt.timestamp)}</span>
              </div>
            )}

            {Array.isArray(shieldStatus?.quarantined_plugins) && shieldStatus.quarantined_plugins.length > 0 && (
              <div className="space-y-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-amber-300">
                  Quarantined Plugins
                </span>
                <div className="flex flex-wrap gap-2">
                  {shieldStatus.quarantined_plugins.map((slug) => (
                    <span
                      key={slug}
                      className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[11px] text-amber-200"
                    >
                      {slug}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-tab 2: Focus Timers & Live Market Ticker */}
      {activeTab === 'focus' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Focus Timers */}
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-emerald-400" />
                <h2 className="text-[13px] font-medium text-zinc-100">Persistent Focus Timers</h2>
              </div>
              <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                {computedTimers.length} total · {activeTimersCount} active
              </span>
            </div>

            <form onSubmit={handleCreateTimer} className="space-y-3 rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <input
                  type="text"
                  value={timerLabel}
                  onChange={(e) => setTimerLabel(e.target.value)}
                  placeholder="Session label..."
                  className="rounded border border-white/[0.08] bg-[#0e1014] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none sm:col-span-5"
                />
                <div className="flex items-center gap-1.5 sm:col-span-3">
                  <input
                    type="number"
                    min={1}
                    max={480}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Number(e.target.value) || 1)}
                    aria-label="Duration in minutes"
                    className="w-full rounded border border-white/[0.08] bg-[#0e1014] px-3 py-2 font-mono text-xs text-zinc-100 tabular-nums focus:border-emerald-500/50 focus:outline-none"
                  />
                  <span className="font-mono text-[11px] text-zinc-500">min</span>
                </div>
                <select
                  value={timerType}
                  onChange={(e) => setTimerType(e.target.value as 'countdown' | 'pomodoro')}
                  aria-label="Timer type"
                  className="rounded border border-white/[0.08] bg-[#0e1014] px-2.5 py-2 font-mono text-xs text-zinc-200 focus:border-emerald-500/50 focus:outline-none sm:col-span-2"
                >
                  <option value="pomodoro">pomodoro</option>
                  <option value="countdown">countdown</option>
                </select>
                <button
                  type="submit"
                  disabled={timerBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50 sm:col-span-2"
                >
                  {timerBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Start
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Presets</span>
                {TIMER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setTimerMinutes(p.minutes)}
                    className={`rounded border px-2.5 py-0.5 font-mono text-[11px] transition tabular-nums ${
                      timerMinutes === p.minutes
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </form>

            {computedTimers.length > 0 ? (
              <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08] bg-[#090a0c]">
                {computedTimers.map((t) => (
                  <div key={t.id} className="space-y-2.5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-zinc-100">{t.label}</span>
                          <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
                              t.effectiveStatus === 'active'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/[0.08] text-zinc-400'
                            }`}
                          >
                            {t.effectiveStatus}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-zinc-500">
                          {t.timer_type || 'countdown'} · {Math.round(t.duration_sec / 60)}m target
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-lg font-medium text-zinc-100 tabular-nums">
                          {formatTimerClock(t.liveRemaining)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTimer(t.id)}
                          disabled={deletingTimerId === t.id}
                          aria-label={`Delete timer ${t.label}`}
                          className="rounded border border-white/[0.08] p-1.5 text-zinc-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        >
                          {deletingTimerId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full transition-all ${
                          t.effectiveStatus === 'active' ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                No SQLite WAL focus timers active. Start a countdown or Pomodoro session above.
              </div>
            )}
          </section>

          {/* Live Market Ticker */}
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-[13px] font-medium text-zinc-100">Live Market Ticker</h2>
                <p className="font-mono text-[11px] text-zinc-500">GET /api/widgets/stock</p>
              </div>
              {stockLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
            </div>

            <form onSubmit={handleTickerSubmit} className="flex gap-2">
              <input
                type="text"
                value={tickerDraft}
                onChange={(e) => setTickerDraft(e.target.value.toUpperCase())}
                placeholder="Ticker (e.g. NVDA)"
                className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs uppercase text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={stockLoading}
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
              >
                Lookup
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {QUICK_TICKERS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => {
                    setTickerDraft(sym);
                    if (sym === tickerSymbol) {
                      void loadMarketTicker(sym);
                    } else {
                      setTickerSymbol(sym);
                    }
                  }}
                  className={`rounded border px-2.5 py-1 font-mono text-[11px] transition ${
                    tickerSymbol === sym
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/[0.08] bg-[#090a0c] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {isSilent ? (
              <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/[0.07] p-4 text-xs text-amber-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>Market quote telemetry is blocked while SILENT Air-Gap mode is active.</span>
              </div>
            ) : stockQuote?.success ? (
              <div className="space-y-4 rounded-md border border-white/[0.08] bg-[#090a0c] p-5">
                <div className="flex items-baseline justify-between">
                  <div>
                    <span className="font-mono text-xs text-zinc-400">
                      {stockQuote.symbol || tickerSymbol}
                    </span>
                    <div className="mt-1 font-mono text-3xl font-medium tracking-tight text-zinc-100 tabular-nums">
                      {typeof stockQuote.price === 'number' ? stockQuote.price.toFixed(2) : '—'}
                      <span className="ml-1.5 text-xs font-normal text-zinc-500">
                        {stockQuote.currency || 'USD'}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-xs tabular-nums ${
                      stockDeltaPositive
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {stockDeltaPositive ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {stockDeltaPositive ? '+' : ''}
                    {typeof stockQuote.change === 'number' ? stockQuote.change.toFixed(2) : '0.00'} (
                    {stockDeltaPositive ? '+' : ''}
                    {typeof stockQuote.change_percent === 'number'
                      ? stockQuote.change_percent.toFixed(2)
                      : '0.00'}
                    %)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 font-mono text-xs tabular-nums">
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Prev Close</span>
                    <span className="mt-0.5 block text-zinc-200">
                      {typeof stockQuote.previous_close === 'number'
                        ? stockQuote.previous_close.toFixed(2)
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Volume</span>
                    <span className="mt-0.5 block text-zinc-200">
                      {typeof stockQuote.volume === 'number'
                        ? stockQuote.volume.toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Day High</span>
                    <span className="mt-0.5 block text-zinc-200">
                      {typeof stockQuote.high === 'number' ? stockQuote.high.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Day Low</span>
                    <span className="mt-0.5 block text-zinc-200">
                      {typeof stockQuote.low === 'number' ? stockQuote.low.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-white/[0.08] bg-[#090a0c] p-4 text-xs text-zinc-400">
                {stockQuote?.error || 'Fetching market telemetry...'}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-tab 3: Interactive HTML5 Canvas Whiteboard */}
      {activeTab === 'whiteboard' && (
        <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5">
                {(
                  [
                    { id: 'draw', label: 'Freehand', icon: PenTool },
                    { id: 'node', label: 'Node', icon: Square },
                    { id: 'text', label: 'Text', icon: Type },
                  ] as const
                ).map((tool) => {
                  const Icon = tool.icon;
                  const active = boardTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setBoardTool(tool.id)}
                      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? 'bg-white/[0.08] text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tool.label}
                    </button>
                  );
                })}
              </div>

              {/* Color Swatches */}
              <div className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 py-1.5">
                {STROKE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={`Color ${c.label}`}
                    onClick={() => setStrokeColor(c.value)}
                    className={`h-4 w-4 rounded-full border transition ${
                      strokeColor === c.value
                        ? 'scale-110 border-white ring-1 ring-white/40'
                        : 'border-white/20 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>

              {/* Stroke Width */}
              <div className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5 font-mono text-[11px]">
                {[2, 4, 6].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setStrokeWidth(w)}
                    className={`rounded px-2 py-1 transition tabular-nums ${
                      strokeWidth === w
                        ? 'bg-white/[0.08] text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {boardSyncBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />}
              <button
                type="button"
                onClick={() => void handleClearWhiteboard()}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleExportWhiteboardPng()}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25"
              >
                <Download className="h-3.5 w-3.5" />
                Export PNG
              </button>
            </div>
          </div>

          {boardTool !== 'draw' && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-white/[0.06] bg-[#090a0c] px-4 py-3 text-xs">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                Click canvas to place {boardTool}:
              </span>
              <input
                type="text"
                value={boardLabel}
                onChange={(e) => setBoardLabel(e.target.value)}
                placeholder={boardTool === 'node' ? 'Node label...' : 'Annotation text...'}
                className="min-w-[200px] flex-1 rounded border border-white/[0.08] bg-[#0e1014] px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
              />
              {boardTool === 'node' && (
                <select
                  value={boardNodeType}
                  onChange={(e) => setBoardNodeType(e.target.value as NodeKind)}
                  className="rounded border border-white/[0.08] bg-[#0e1014] px-2.5 py-1.5 font-mono text-xs text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
                >
                  <option value="default">default</option>
                  <option value="action">action</option>
                  <option value="state">state</option>
                  <option value="decision">decision</option>
                  <option value="service">service</option>
                  <option value="database">database</option>
                </select>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-white/[0.08] bg-[#090a0c]">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className={`block h-auto w-full touch-none ${
                boardTool === 'draw' ? 'cursor-crosshair' : 'cursor-cell'
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-zinc-500">
            <span>
              Canvas synced with <code className="text-zinc-300">POST /api/whiteboard/draw</code> ({CANVAS_WIDTH}×{CANVAS_HEIGHT})
            </span>
            {lastExportMeta && (
              <span className="text-emerald-400 tabular-nums">
                Exported {lastExportMeta.path || 'whiteboard.png'}
                {typeof lastExportMeta.bytes === 'number' ? ` (${lastExportMeta.bytes} B)` : ''} at {lastExportMeta.at}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default VaultView;
