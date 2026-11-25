import { FormEvent, PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
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
  Shield,
  ShieldCheck,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

type VaultSubTab = 'security' | 'whiteboard' | 'timers';
type BoardTool = 'pen' | 'node';

interface VaultTestResponse {
  success?: boolean;
  vault?: string;
  status?: string;
  error?: string;
}

interface ShieldFinding {
  severity?: string;
  category?: string;
  message?: string;
  line?: number;
}

interface ShieldStatusData {
  success?: boolean;
  has_audit?: boolean;
  audit_id?: string;
  scanned_at?: string;
  score?: number;
  status?: string;
  target_path?: string;
  findings_count?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  findings?: ShieldFinding[];
  quarantined_plugins?: string[];
  error?: string;
}

interface AuditRunResponse {
  success?: boolean;
  audit_passed?: boolean;
  shield?: ShieldStatusData;
  timestamp?: number;
  error?: string;
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

interface TimerItem {
  id: string;
  label: string;
  duration_sec: number;
  remaining_sec: number;
  timer_type: string;
  status: string;
  created_at: string;
  expires_at: string;
}

interface TimersListResponse {
  success?: boolean;
  timers?: TimerItem[];
  count?: number;
  error?: string;
}

interface WhiteboardDrawResponse {
  success?: boolean;
  action?: string;
  file_path?: string;
  error?: string;
}

const BOARD_COLORS = [
  { label: 'Cyan', hex: '#22d3ee' },
  { label: 'Emerald', hex: '#34d399' },
  { label: 'Starlight', hex: '#f8fafc' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Plasma', hex: '#f472b6' },
  { label: 'Alert', hex: '#ef4444' },
] as const;

const STOCK_PRESETS = ['NVDA', 'AMD', 'MSFT', 'AAPL'] as const;

const TIMER_PRESETS = [
  { label: '5m Sprint', sec: 300, type: 'countdown' },
  { label: '15m Focus', sec: 900, type: 'countdown' },
  { label: '25m Pomodoro', sec: 1500, type: 'pomodoro' },
  { label: '45m Deep Work', sec: 2700, type: 'pomodoro' },
] as const;

function formatClock(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function VaultView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<VaultSubTab>('security');
  const isSilent = telemetry.workspaceMode === 'SILENT';

  // DPAPI Vault state
  const [vaultStatus, setVaultStatus] = useState<string>('Checking...');
  const [vaultHealthy, setVaultHealthy] = useState<boolean | null>(null);
  const [vaultKey, setVaultKey] = useState('');
  const [vaultValue, setVaultValue] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

  // AgentShield state
  const [shield, setShield] = useState<ShieldStatusData | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);

  // Market Ticker state
  const [stockSymbol, setStockSymbol] = useState('NVDA');
  const [stockInput, setStockInput] = useState('NVDA');
  const [stockQuote, setStockQuote] = useState<StockQuoteResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Whiteboard Canvas state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [boardTool, setBoardTool] = useState<BoardTool>('pen');
  const [boardColor, setBoardColor] = useState<string>(BOARD_COLORS[0].hex);
  const [brushSize, setBrushSize] = useState<number>(3);
  const [nodeLabel, setNodeLabel] = useState('Telemetry Node');
  const [boardSyncStatus, setBoardSyncStatus] = useState<string>('Canvas Ready');

  // Focus Timers state
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [timersLoading, setTimersLoading] = useState(false);
  const [timerLabel, setTimerLabel] = useState('Deep Work Session');
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerType, setTimerType] = useState<'pomodoro' | 'countdown'>('pomodoro');
  const [creatingTimer, setCreatingTimer] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadVaultStatus = useCallback(async () => {
    try {
      const res = await ipcJson<VaultTestResponse>('/api/vault/test');
      if (res.success) {
        setVaultHealthy(true);
        setVaultStatus(res.vault || res.status || 'DPAPI_READY');
      } else {
        setVaultHealthy(false);
        setVaultStatus(res.error || 'UNAVAILABLE');
      }
    } catch (err) {
      setVaultHealthy(false);
      setVaultStatus(err instanceof Error ? err.message : 'OFFLINE');
    }
  }, []);

  const loadShieldStatus = useCallback(async () => {
    try {
      const res = await ipcJson<ShieldStatusData>('/api/security/shield-status');
      setShield(res);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading AgentShield posture', 'error');
    }
  }, [pushToast]);

  const loadStockQuote = useCallback(
    async (symbol: string) => {
      const clean = symbol.trim().toUpperCase() || 'NVDA';
      setStockSymbol(clean);
      setStockInput(clean);
      setStockLoading(true);
      try {
        const resp = await ipcFetch(`/api/widgets/stock?symbol=${encodeURIComponent(clean)}`);
        const data = (await resp.json()) as StockQuoteResponse;
        setStockQuote(data);
        if (resp.status === 403) {
          setStockQuote({
            success: false,
            symbol: clean,
            error: data.error || 'Blocked by WorkspaceGovernor in SILENT air-gap mode',
          });
        }
      } catch (err) {
        setStockQuote({
          success: false,
          symbol: clean,
          error: err instanceof Error ? err.message : 'Market telemetry unreachable',
        });
      } finally {
        setStockLoading(false);
      }
    },
    []
  );

  const loadTimers = useCallback(async () => {
    setTimersLoading(true);
    try {
      const res = await ipcJson<TimersListResponse>('/api/timers');
      if (Array.isArray(res.timers)) {
        setTimers(res.timers);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading timers', 'error');
    } finally {
      setTimersLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadVaultStatus();
    void loadShieldStatus();
    void loadStockQuote('NVDA');
    void loadTimers();
  }, [loadVaultStatus, loadShieldStatus, loadStockQuote, loadTimers]);

  // 1s wall-clock ticker for active timers derived from server expires_at
  useEffect(() => {
    const hasActive = timers.some((t) => t.status === 'active');
    if (!hasActive) return undefined;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [timers]);

  const paintCanvasGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
    for (let x = 24; x < width; x += 32) {
      for (let y = 24; y < height; y += 32) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }, []);

  useEffect(() => {
    if (subTab !== 'whiteboard') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paintCanvasGrid(ctx, canvas.width, canvas.height);
  }, [subTab, paintCanvasGrid]);

  const handleSaveSecret = async (e: FormEvent) => {
    e.preventDefault();
    const key = vaultKey.trim();
    const value = vaultValue;
    if (!key || !value) {
      pushToast('Both secret key name and value are required', 'warn');
      return;
    }
    setSavingSecret(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/vault/set', {
        method: 'POST',
        body: JSON.stringify({ key, value }),
      });
      if (res.success) {
        setLastSavedKey(key);
        setVaultValue('');
        pushToast(`Encrypted "${key}" into Windows DPAPI vault`, 'success');
      } else {
        pushToast(res.error || 'Failed storing secret in DPAPI vault', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Vault store request failed', 'error');
    } finally {
      setSavingSecret(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success) {
        if (res.shield) {
          setShield(res.shield);
        } else {
          await loadShieldStatus();
        }
        pushToast('AgentShield & ScopeGuard audit completed', 'success');
      } else {
        pushToast(res.error || 'Security audit failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Security audit request failed', 'error');
    } finally {
      setAuditRunning(false);
    }
  };

  const handleStockSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadStockQuote(stockInput);
  };

  const getCanvasPoint = (e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const handleCanvasPointerDown = async (e: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);

    if (boardTool === 'node') {
      const label = nodeLabel.trim() || 'Node';
      const boxW = 160;
      const boxH = 54;
      const bx = Math.max(8, Math.min(canvas.width - boxW - 8, pt.x - boxW / 2));
      const by = Math.max(8, Math.min(canvas.height - boxH - 8, pt.y - boxH / 2));

      ctx.fillStyle = 'rgba(9, 19, 34, 0.92)';
      ctx.strokeStyle = boardColor;
      ctx.lineWidth = 2;
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 13px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 20), bx + boxW / 2, by + boxH / 2);

      try {
        const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
          method: 'POST',
          body: JSON.stringify({
            action: 'node',
            x: Math.round(bx),
            y: Math.round(by),
            label,
            node_type: 'default',
          }),
        });
        if (res.success !== false) {
          setBoardSyncStatus(`Synced node "${label}"`);
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Whiteboard sync error', 'warn');
      }
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = pt;
  };

  const handleCanvasPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || boardTool !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prev = lastPointRef.current;
    const curr = getCanvasPoint(e);
    if (prev) {
      ctx.beginPath();
      ctx.strokeStyle = boardColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    lastPointRef.current = curr;
  };

  const handleCanvasPointerUp = () => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClearBoard = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        paintCanvasGrid(ctx, canvas.width, canvas.height);
      }
    }
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' }),
      });
      setBoardSyncStatus(res.success !== false ? 'Cleared Canvas & WAL' : 'Canvas Cleared');
      pushToast('Whiteboard cleared', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed clearing remote whiteboard', 'warn');
    }
  };

  const handleExportPng = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `nexus-whiteboard-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'export_png' }),
      });
      if (res.success !== false) {
        setBoardSyncStatus(res.file_path ? `Exported: ${res.file_path}` : 'Exported PNG');
        pushToast('Whiteboard PNG exported', 'success');
      } else {
        pushToast('Browser PNG downloaded (server Pillow export unavailable)', 'info');
      }
    } catch {
      pushToast('Browser PNG downloaded', 'success');
    }
  };

  const createNewTimer = async (label: string, durationSec: number, kind: string) => {
    setCreatingTimer(true);
    try {
      const res = await ipcJson<{ success?: boolean; timer?: TimerItem; error?: string }>('/api/timers', {
        method: 'POST',
        body: JSON.stringify({
          label: label.trim() || 'Focus Timer',
          duration_sec: Math.max(10, Math.round(durationSec)),
          timer_type: kind,
        }),
      });
      if (res.success) {
        pushToast(`Timer started: ${label}`, 'success');
        await loadTimers();
      } else {
        pushToast(res.error || 'Could not create timer', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Timer creation failed', 'error');
    } finally {
      setCreatingTimer(false);
    }
  };

  const handleTimerSubmit = (e: FormEvent) => {
    e.preventDefault();
    void createNewTimer(timerLabel, Math.max(1, timerMinutes) * 60, timerType);
  };

  const handleDeleteTimer = async (timerId: string) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/timers/${encodeURIComponent(timerId)}`,
        { method: 'DELETE' }
      );
      if (res.success) {
        setTimers((prev) => prev.filter((t) => t.id !== timerId));
        pushToast('Timer removed', 'info');
      } else {
        pushToast(res.error || 'Failed removing timer', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete timer request failed', 'error');
    }
  };

  const shieldScore = typeof shield?.score === 'number' ? shield.score : 100;
  const shieldStatusLabel = shield?.status || 'UNKNOWN';
  const isShieldHealthy = shieldStatusLabel === 'SECURE' || shieldStatusLabel === 'CLEAN';

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Segmented Switcher */}
      <div className="aether-glass rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">
              Sovereign Vault, Shield &amp; Canvas
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                vaultHealthy
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                  : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
              }`}
            >
              {vaultStatus}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Windows DPAPI secret enclave, AgentShield AST audit posture, market ticker, interactive whiteboard, and persistent timers.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Vault view sections"
          className="inline-flex items-center p-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/20 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'security'}
            onClick={() => setSubTab('security')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'security'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Security &amp; Market
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'whiteboard'}
            onClick={() => setSubTab('whiteboard')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'whiteboard'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Whiteboard
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'timers'}
            onClick={() => setSubTab('timers')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'timers'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Focus Timers ({timers.filter((t) => t.status === 'active').length})
          </button>
        </div>
      </div>

      {/* TAB 1: DPAPI VAULT + AGENTSHIELD + LIVE MARKET TICKER */}
      {subTab === 'security' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* DPAPI Vault Store */}
            <div className="lg:col-span-5 aether-bracket-card rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-slate-100">Windows DPAPI Enclave</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void loadVaultStatus()}
                  aria-label="Test DPAPI Vault"
                  className="px-2.5 py-1.5 rounded-lg bg-[#050a14] hover:bg-cyan-500/15 text-[11px] font-mono text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Probe
                </button>
              </div>

              <form onSubmit={handleSaveSecret} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="dpapi-key-input" className="text-xs font-medium text-slate-300">
                    Secret Identifier
                  </label>
                  <input
                    id="dpapi-key-input"
                    type="text"
                    value={vaultKey}
                    onChange={(e) => setVaultKey(e.target.value)}
                    placeholder="e.g. CLOUDFLARE_API_TOKEN"
                    className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="dpapi-val-input" className="text-xs font-medium text-slate-300">
                    Secret Value (Write-Only)
                  </label>
                  <div className="relative">
                    <input
                      id="dpapi-val-input"
                      type={showSecret ? 'text' : 'password'}
                      value={vaultValue}
                      onChange={(e) => setVaultValue(e.target.value)}
                      placeholder="Enter credential to seal with DPAPI"
                      className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 pl-3.5 pr-10 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((v) => !v)}
                      aria-label={showSecret ? 'Hide secret' : 'Reveal secret'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    {lastSavedKey ? `Sealed: ${lastSavedKey}` : 'Encrypted locally at rest'}
                  </span>
                  <button
                    type="submit"
                    disabled={savingSecret}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold transition-colors shrink-0"
                  >
                    {savingSecret ? 'Encrypting...' : 'Seal to Vault'}
                  </button>
                </div>
              </form>
            </div>

            {/* AgentShield Posture & Audit */}
            <div className="lg:col-span-7 aether-glass rounded-2xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-slate-100">AgentShield Posture &amp; Audit</h2>
                </div>

                <button
                  type="button"
                  disabled={auditRunning}
                  onClick={() => void handleRunAudit()}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/40 text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${auditRunning ? 'animate-spin' : ''}`} />
                  {auditRunning ? 'Auditing...' : 'Run Security Audit'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="aether-panel rounded-xl p-4 space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400">SHIELD SCORE</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono text-cyan-300">{shieldScore}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        shieldScore >= 90 ? 'bg-emerald-400' : shieldScore >= 60 ? 'bg-amber-400' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, shieldScore))}%` }}
                    />
                  </div>
                </div>

                <div className="aether-panel rounded-xl p-4 space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400">POSTURE</div>
                  <div
                    className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-mono border ${
                      isShieldHealthy
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                    }`}
                  >
                    {shieldStatusLabel}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Findings: {shield?.findings_count ?? shield?.findings?.length ?? 0}
                  </div>
                </div>

                <div className="aether-panel rounded-xl p-4 space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400">QUARANTINED PLUGINS</div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {shield?.quarantined_plugins?.length ?? 0}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {shield?.audit_id ? `Audit: ${shield.audit_id}` : 'Awaiting scan'}
                  </div>
                </div>
              </div>

              {shield?.quarantined_plugins && shield.quarantined_plugins.length > 0 && (
                <div className="rounded-xl bg-rose-950/30 border border-rose-500/35 p-3.5 text-xs text-rose-200 space-y-1">
                  <div className="font-mono text-[11px] uppercase text-rose-300">Quarantined Modules</div>
                  <div className="flex flex-wrap gap-2">
                    {shield.quarantined_plugins.map((plug) => (
                      <span
                        key={plug}
                        className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-400/30 font-mono text-[11px]"
                      >
                        {plug}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {shield?.target_path && (
                <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                  <span className="truncate">Scope: {shield.target_path}</span>
                  {shield.scanned_at && <span>Last scan: {shield.scanned_at}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Live Market Telemetry Ticker */}
          <div className="aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">Live Market Telemetry Ticker</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {STOCK_PRESETS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    disabled={isSilent || stockLoading}
                    onClick={() => void loadStockQuote(sym)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                      stockSymbol === sym
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                        : 'bg-[#050a14] text-slate-400 hover:text-slate-200 border-slate-800'
                    }`}
                  >
                    {sym}
                  </button>
                ))}
                <form onSubmit={handleStockSearch} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value.toUpperCase())}
                    placeholder="TICKER"
                    aria-label="Stock ticker symbol"
                    className="w-24 rounded-lg bg-[#050a14] border border-cyan-500/25 px-2.5 py-1.5 text-xs font-mono text-slate-100 uppercase focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={isSilent || stockLoading}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/35 text-xs font-medium"
                  >
                    {stockLoading ? '...' : 'Fetch'}
                  </button>
                </form>
              </div>
            </div>

            {stockQuote?.success ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="aether-panel rounded-xl p-4 col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-mono text-slate-400">{stockQuote.symbol || stockSymbol}</div>
                  <div className="text-xl font-bold font-mono text-slate-100 mt-1">
                    {typeof stockQuote.price === 'number' ? stockQuote.price.toFixed(2) : '--'}{' '}
                    <span className="text-xs font-normal text-slate-400">{stockQuote.currency || 'USD'}</span>
                  </div>
                </div>
                <div className="aether-panel rounded-xl p-4">
                  <div className="text-[11px] font-mono text-slate-400">DELTA</div>
                  <div
                    className={`flex items-center gap-1.5 text-sm font-mono font-semibold mt-1 ${
                      (stockQuote.change ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {(stockQuote.change ?? 0) >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>
                      {(stockQuote.change ?? 0) >= 0 ? '+' : ''}
                      {stockQuote.change ?? 0} ({stockQuote.change_percent ?? 0}%)
                    </span>
                  </div>
                </div>
                <div className="aether-panel rounded-xl p-4">
                  <div className="text-[11px] font-mono text-slate-400">DAY HIGH</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">
                    {typeof stockQuote.high === 'number' ? stockQuote.high.toFixed(2) : '--'}
                  </div>
                </div>
                <div className="aether-panel rounded-xl p-4">
                  <div className="text-[11px] font-mono text-slate-400">DAY LOW</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">
                    {typeof stockQuote.low === 'number' ? stockQuote.low.toFixed(2) : '--'}
                  </div>
                </div>
                <div className="aether-panel rounded-xl p-4">
                  <div className="text-[11px] font-mono text-slate-400">VOLUME</div>
                  <div className="text-sm font-mono text-slate-200 mt-1">
                    {typeof stockQuote.volume === 'number' ? stockQuote.volume.toLocaleString() : '--'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="aether-panel rounded-xl p-4 text-xs text-amber-300">
                {stockQuote?.error || 'Quote telemetry unavailable.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE HTML5 CANVAS WHITEBOARD */}
      {subTab === 'whiteboard' && (
        <div className="aether-bracket-card rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex p-1 rounded-xl bg-[#050a14] border border-slate-700/60 gap-1">
                <button
                  type="button"
                  onClick={() => setBoardTool('pen')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    boardTool === 'pen'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Freehand Pen
                </button>
                <button
                  type="button"
                  onClick={() => setBoardTool('node')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    boardTool === 'node'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Square className="w-3.5 h-3.5" />
                  Node Stamp
                </button>
              </div>

              {/* Color Swatches */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#050a14] border border-slate-800">
                {BOARD_COLORS.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    aria-label={`Select color ${swatch.label}`}
                    onClick={() => setBoardColor(swatch.hex)}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      boardColor === swatch.hex ? 'ring-2 ring-white scale-110' : 'opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                ))}
              </div>

              {boardTool === 'pen' ? (
                <select
                  aria-label="Brush stroke size"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="rounded-xl bg-[#050a14] border border-slate-700/70 px-3 py-1.5 text-xs font-mono text-slate-200"
                >
                  <option value={2}>2px Fine</option>
                  <option value={4}>4px Medium</option>
                  <option value={7}>7px Bold</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={nodeLabel}
                  onChange={(e) => setNodeLabel(e.target.value)}
                  placeholder="Node label (click canvas to place)"
                  className="rounded-xl bg-[#050a14] border border-emerald-500/30 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">{boardSyncStatus}</span>
              <button
                type="button"
                onClick={() => void handleClearBoard()}
                className="px-3.5 py-2 rounded-xl bg-[#050a14] hover:bg-rose-500/15 text-slate-300 hover:text-rose-200 border border-slate-700/70 hover:border-rose-400/40 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleExportPng()}
                className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export PNG
              </button>
            </div>
          </div>

          <div className="rounded-2xl overflow-hidden border border-cyan-500/25 bg-[#050a14]">
            <canvas
              ref={canvasRef}
              width={960}
              height={460}
              onPointerDown={(e) => void handleCanvasPointerDown(e)}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="w-full h-auto block cursor-crosshair touch-none"
            />
          </div>
        </div>
      )}

      {/* TAB 3: FOCUS TIMERS */}
      {subTab === 'timers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 aether-bracket-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-100">Create Persistent Focus Timer</h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={creatingTimer}
                  onClick={() => void createNewTimer(preset.label, preset.sec, preset.type)}
                  className="rounded-xl bg-[#050a14]/85 hover:bg-cyan-500/15 border border-slate-800 hover:border-cyan-400/35 px-3 py-2.5 text-left transition-colors"
                >
                  <div className="text-xs font-medium text-slate-100">{preset.label}</div>
                  <div className="text-[11px] font-mono text-cyan-300">{preset.type}</div>
                </button>
              ))}
            </div>

            <form onSubmit={handleTimerSubmit} className="space-y-4 pt-2 border-t border-slate-800/80">
              <div className="space-y-1.5">
                <label htmlFor="timer-label-input" className="text-xs font-medium text-slate-300">
                  Session Label
                </label>
                <input
                  id="timer-label-input"
                  type="text"
                  value={timerLabel}
                  onChange={(e) => setTimerLabel(e.target.value)}
                  placeholder="Architecture review"
                  className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="timer-mins-input" className="text-xs font-medium text-slate-300">
                    Minutes
                  </label>
                  <input
                    id="timer-mins-input"
                    type="number"
                    min={1}
                    max={480}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="timer-type-select" className="text-xs font-medium text-slate-300">
                    Type
                  </label>
                  <select
                    id="timer-type-select"
                    value={timerType}
                    onChange={(e) => setTimerType(e.target.value as 'pomodoro' | 'countdown')}
                    className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3 py-2.5 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="pomodoro">pomodoro</option>
                    <option value="countdown">countdown</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={creatingTimer}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {creatingTimer ? 'Starting...' : 'Start Persistent Timer'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Active &amp; Completed Timers</h2>
              <button
                type="button"
                onClick={() => void loadTimers()}
                disabled={timersLoading}
                className="px-3 py-1.5 rounded-xl bg-[#050a14] hover:bg-cyan-500/15 text-xs text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${timersLoading ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>

            {timers.length === 0 ? (
              <div className="aether-panel rounded-xl p-8 text-center text-xs text-slate-400">
                No persistent timers scheduled in SQLite WAL. Launch a preset or custom session on the left.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[480px] overflow-y-auto pr-1">
                {timers.map((t) => {
                  const expMs = Date.parse(t.expires_at);
                  const liveRemaining =
                    t.status === 'active' && Number.isFinite(expMs)
                      ? Math.max(0, Math.floor((expMs - nowMs) / 1000))
                      : t.remaining_sec;
                  const pct =
                    t.duration_sec > 0
                      ? Math.max(0, Math.min(100, Math.round((liveRemaining / t.duration_sec) * 100)))
                      : 0;
                  const done = t.status !== 'active' || liveRemaining <= 0;

                  return (
                    <div key={t.id} className="aether-panel rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">{t.label}</div>
                          <div className="text-[11px] font-mono text-slate-400 uppercase">{t.timer_type}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTimer(t.id)}
                          aria-label={`Delete timer ${t.label}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className={`text-xl font-bold font-mono ${done ? 'text-emerald-300' : 'text-cyan-300'}`}>
                          {formatClock(liveRemaining)}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            done
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
                          }`}
                        >
                          {done ? 'COMPLETED' : 'ACTIVE'}
                        </span>
                      </div>

                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            done ? 'bg-emerald-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VaultView;
