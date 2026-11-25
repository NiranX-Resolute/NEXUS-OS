import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Download,
  Eraser,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  WifiOff,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

type VaultSubTab = 'security' | 'whiteboard' | 'telemetry';
type DrawTool = 'pen' | 'node' | 'text' | 'eraser';

interface VaultTestResponse {
  success?: boolean;
  vault?: string;
  status?: string;
  provider_id?: string;
  latency_ms?: number;
  error?: string;
}

interface ShieldFinding {
  severity?: string;
  category?: string;
  message?: string;
  line?: number;
  invariant?: string;
}

interface ShieldStatusResponse {
  success?: boolean;
  has_audit?: boolean;
  audit_id?: string;
  scanned_at?: string;
  score?: number;
  status?: string;
  target_path?: string;
  findings_count?: number;
  quarantined_plugins?: string[];
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  scanned_files?: number;
  findings?: ShieldFinding[];
  error?: string;
}

interface AuditRunResponse {
  success?: boolean;
  audit_passed?: boolean;
  shield?: ShieldStatusResponse;
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

interface TimersResponse {
  success?: boolean;
  timers?: TimerItem[];
  count?: number;
  error?: string;
}

interface WhiteboardDrawResponse {
  success?: boolean;
  action?: string;
  file_path?: string;
  file_size_bytes?: number;
  elements_count?: number;
  node?: { id: string; x: number; y: number; label: string };
  text?: { id: string; x: number; y: number; content: string };
  error?: string;
}

const VAULT_PRESET_KEYS = ['HF_TOKEN', 'GEMINI_API_KEY', 'GITHUB_TOKEN', 'NEXUS_TOKEN'];
const STOCK_WATCHLIST = ['NVDA', 'AAPL', 'MSFT', 'AMD', 'GOOGL', 'TSLA'];
const BOARD_COLORS = ['#10b981', '#22d3ee', '#f59e0b', '#ef4444', '#ecfdf5'];
const TIMER_PRESETS = [
  { label: '5m Sprint', sec: 300 },
  { label: '15m Focus', sec: 900 },
  { label: '25m Pomodoro', sec: 1500 },
  { label: '45m Deep Work', sec: 2700 },
];

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function VaultView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<VaultSubTab>('security');

  // DPAPI Vault state
  const [vaultStatus, setVaultStatus] = useState<VaultTestResponse | null>(null);
  const [testingVault, setTestingVault] = useState(false);
  const [probeProvider, setProbeProvider] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [lastStoredKey, setLastStoredKey] = useState<string | null>(null);

  // AgentShield state
  const [shield, setShield] = useState<ShieldStatusResponse | null>(null);
  const [loadingShield, setLoadingShield] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);

  // Market Ticker state
  const [stockSymbol, setStockSymbol] = useState('NVDA');
  const [stockQuote, setStockQuote] = useState<StockQuoteResponse | null>(null);
  const [loadingStock, setLoadingStock] = useState(false);

  // Focus Timers state
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [loadingTimers, setLoadingTimers] = useState(false);
  const [timerLabel, setTimerLabel] = useState('Deep Focus Block');
  const [timerMinutes, setTimerMinutes] = useState('25');
  const [timerType, setTimerType] = useState<'countdown' | 'pomodoro'>('pomodoro');
  const [creatingTimer, setCreatingTimer] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // HTML5 Canvas Whiteboard state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [drawTool, setDrawTool] = useState<DrawTool>('pen');
  const [strokeColor, setStrokeColor] = useState('#10b981');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [nodeLabelInput, setNodeLabelInput] = useState('Sovereign Node');
  const [whiteboardStatus, setWhiteboardStatus] = useState<string>('Canvas initialized');
  const [syncingBoard, setSyncingBoard] = useState(false);
  const [boardOpsCount, setBoardOpsCount] = useState(0);

  const isAirGapped = telemetry.workspaceMode === 'SILENT';

  const testVault = useCallback(
    async (providerOverride?: string) => {
      setTestingVault(true);
      try {
        const target = (providerOverride ?? probeProvider).trim();
        const url = target
          ? `/api/vault/test?provider=${encodeURIComponent(target)}`
          : '/api/vault/test';
        const res = await ipcJson<VaultTestResponse>(url);
        setVaultStatus(res);
        if (!res.success && target) {
          pushToast(res.error || `Provider probe for ${target} failed`, 'warn');
        }
      } finally {
        setTestingVault(false);
      }
    },
    [probeProvider, pushToast]
  );

  const fetchShieldStatus = useCallback(async () => {
    setLoadingShield(true);
    try {
      const res = await ipcJson<ShieldStatusResponse>('/api/security/shield-status');
      setShield(res);
    } finally {
      setLoadingShield(false);
    }
  }, []);

  const fetchStock = useCallback(
    async (symbolOverride?: string) => {
      const sym = (symbolOverride ?? stockSymbol).trim().toUpperCase() || 'NVDA';
      setStockSymbol(sym);
      setLoadingStock(true);
      try {
        const res = await ipcJson<StockQuoteResponse>(
          `/api/widgets/stock?symbol=${encodeURIComponent(sym)}`
        );
        setStockQuote(res);
      } finally {
        setLoadingStock(false);
      }
    },
    [stockSymbol]
  );

  const fetchTimers = useCallback(async () => {
    setLoadingTimers(true);
    try {
      const res = await ipcJson<TimersResponse>('/api/timers');
      if (res.success && Array.isArray(res.timers)) {
        setTimers(res.timers);
      }
    } finally {
      setLoadingTimers(false);
    }
  }, []);

  useEffect(() => {
    void testVault('');
    void fetchShieldStatus();
    void fetchTimers();
    if (!isAirGapped) {
      void fetchStock('NVDA');
    }
  }, [testVault, fetchShieldStatus, fetchTimers, fetchStock, isAirGapped]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Paint cyber matrix backdrop onto HTML5 whiteboard canvas when Whiteboard tab mounts
  const initCanvasSurface = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= canvas.width; gx += 32) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, canvas.height);
      ctx.stroke();
    }
    for (let gy = 0; gy <= canvas.height; gy += 32) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(canvas.width, gy);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (subTab === 'whiteboard') {
      initCanvasSurface();
    }
  }, [subTab, initCanvasSurface]);

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = secretKey.trim();
    if (!k || !secretValue) {
      pushToast('Provide both a secret key name and value', 'warn');
      return;
    }
    setSavingSecret(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/vault/set', {
        method: 'POST',
        body: JSON.stringify({ key: k, value: secretValue }),
      });
      if (!res.success) {
        pushToast(res.error || 'Failed storing DPAPI secret', 'error');
      } else {
        setLastStoredKey(k);
        setSecretValue('');
        pushToast(`Encrypted and sealed '${k}' in Windows DPAPI Vault`, 'success');
      }
    } finally {
      setSavingSecret(false);
    }
  };

  const handleRunAudit = async () => {
    setRunningAudit(true);
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.shield) {
        setShield(res.shield);
      } else {
        void fetchShieldStatus();
      }
      if (res.success) {
        pushToast('ScopeGuard + AgentShield security audit completed', 'success');
      } else {
        pushToast(res.error || 'Security audit failed', 'error');
      }
    } finally {
      setRunningAudit(false);
    }
  };

  const handleCreateTimer = async (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Number(timerMinutes);
    const durationSec = Math.max(10, Math.round((Number.isFinite(mins) ? mins : 25) * 60));
    setCreatingTimer(true);
    try {
      const res = await ipcJson<{ success?: boolean; timer?: TimerItem; error?: string }>(
        '/api/timers',
        {
          method: 'POST',
          body: JSON.stringify({
            label: timerLabel.trim() || 'Focus Timer',
            duration_sec: durationSec,
            timer_type: timerType,
          }),
        }
      );
      if (res.success) {
        pushToast(`Timer '${timerLabel.trim() || 'Focus Timer'}' armed`, 'success');
        void fetchTimers();
      } else {
        pushToast(res.error || 'Failed to create timer', 'error');
      }
    } finally {
      setCreatingTimer(false);
    }
  };

  const handleDeleteTimer = async (timerId: string) => {
    const res = await ipcJson<{ success?: boolean; error?: string }>(
      `/api/timers/${encodeURIComponent(timerId)}`,
      { method: 'DELETE' }
    );
    if (res.success) {
      setTimers((prev) => prev.filter((t) => t.id !== timerId));
      pushToast('Timer deleted', 'info');
    } else {
      pushToast(res.error || 'Failed deleting timer', 'error');
    }
  };

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
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

  const syncWhiteboardOp = async (payload: Record<string, unknown>) => {
    setSyncingBoard(true);
    try {
      const res = await ipcJson<WhiteboardDrawResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.success) {
        setBoardOpsCount((n) => n + 1);
      }
      return res;
    } finally {
      setSyncingBoard(false);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);

    if (drawTool === 'node') {
      const label = nodeLabelInput.trim() || 'Node';
      const w = Math.max(130, label.length * 9 + 28);
      const h = 48;
      ctx.fillStyle = '#090f16';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pt.x - w / 2, pt.y - h / 2, w, h, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ecfdf5';
      ctx.font = '13px JetBrains Mono, monospace';
      ctx.fillText(label, pt.x - w / 2 + 12, pt.y + 4);
      setWhiteboardStatus(`Stamped node '${label}' at (${pt.x}, ${pt.y})`);
      void syncWhiteboardOp({
        action: 'node',
        x: Math.max(0, pt.x - Math.round(w / 2)),
        y: Math.max(0, pt.y - Math.round(h / 2)),
        label,
        node_type: 'default',
      });
      return;
    }

    if (drawTool === 'text') {
      const text = nodeLabelInput.trim() || 'Annotation';
      ctx.fillStyle = strokeColor;
      ctx.font = '15px Space Grotesk, sans-serif';
      ctx.fillText(text, pt.x, pt.y);
      setWhiteboardStatus(`Placed text '${text}' at (${pt.x}, ${pt.y})`);
      void syncWhiteboardOp({
        action: 'text',
        x: pt.x,
        y: pt.y,
        content: text,
        font_size: 15,
      });
      return;
    }

    drawingRef.current = true;
    lastPosRef.current = pt;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPosRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    ctx.strokeStyle = drawTool === 'eraser' ? '#05080b' : strokeColor;
    ctx.lineWidth = drawTool === 'eraser' ? strokeWidth * 4 : strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPosRef.current = pt;
  };

  const handleCanvasPointerUp = () => {
    drawingRef.current = false;
    lastPosRef.current = null;
  };

  const handleClearCanvas = async () => {
    initCanvasSurface();
    const res = await syncWhiteboardOp({ action: 'clear' });
    setWhiteboardStatus(
      res.success ? 'Canvas & SQLite WAL board cleared' : res.error || 'Local canvas cleared'
    );
    pushToast('Whiteboard cleared', 'info');
  };

  const handleExportCanvasPng = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `nexus-v5-whiteboard-${Date.now()}.png`;
      link.href = url;
      link.click();
    }

    const res = await syncWhiteboardOp({ action: 'export_png' });
    if (res.success && res.file_path) {
      setWhiteboardStatus(`PNG exported (${res.file_size_bytes ?? 0} B): ${res.file_path}`);
      pushToast('Whiteboard PNG exported & persisted', 'success');
    } else {
      setWhiteboardStatus('Downloaded local canvas PNG snapshot');
      pushToast('Canvas PNG downloaded', 'success');
    }
  };

  const shieldScore = typeof shield?.score === 'number' ? Math.max(0, Math.min(100, shield.score)) : 100;
  const shieldColor =
    shieldScore >= 90 ? '#10b981' : shieldScore >= 70 ? '#f59e0b' : '#ef4444';
  const shieldRingCircumference = 2 * Math.PI * 42;
  const shieldStrokeOffset =
    shieldRingCircumference - (shieldScore / 100) * shieldRingCircumference;

  const activeTimersCount = useMemo(
    () => timers.filter((t) => t.status === 'active').length,
    [timers]
  );

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-500/15 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>SEC-01 // SOVEREIGN VAULT &amp; CANVAS</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-50">
            DPAPI Vault, Shield &amp; Telemetry Canvas
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-200">
            <KeyRound className="w-3 h-3 text-emerald-400" />
            {vaultStatus?.vault || (vaultStatus?.success ? 'DPAPI_READY' : 'Checking Vault')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-200">
            <ShieldCheck className="w-3 h-3 text-cyan-300" />
            Shield {shieldScore}/100
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#090e14] px-3 py-1 text-xs font-mono text-slate-300">
            <Timer className="w-3 h-3 text-emerald-400" />
            {activeTimersCount} active timers
          </span>
        </div>
      </div>

      {/* Sub-Tab Switcher */}
      <div className="inline-flex rounded-xl border border-white/10 bg-[#090e14]/90 p-1 gap-1">
        {(
          [
            { id: 'security', label: 'DPAPI Vault & AgentShield', icon: ShieldCheck },
            { id: 'whiteboard', label: 'Interactive Whiteboard', icon: PenTool },
            { id: 'telemetry', label: 'Market Ticker & Focus Timers', icon: Activity },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition ${
                active
                  ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/35 matrix-glow'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: DPAPI VAULT & AGENTSHIELD */}
      {subTab === 'security' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Windows DPAPI Vault */}
          <div className="xl:col-span-6 matrix-panel holo-ring rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  Windows DPAPI Secret Enclave
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Write-only OS-encrypted credential storage (`CryptProtectData`). Plaintext is never echoed back.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void testVault()}
                disabled={testingVault}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-mono text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {testingVault ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Test Vault
              </button>
            </div>

            {/* Probe status strip */}
            <div className="rounded-lg border border-white/8 bg-[#05080b] p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-[11px] font-mono uppercase text-slate-400">Enclave Status</div>
                <div className="text-xs font-mono text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {vaultStatus?.vault || vaultStatus?.status || (vaultStatus?.success ? 'DPAPI_READY' : 'UNVERIFIED')}
                    {typeof vaultStatus?.latency_ms === 'number' ? ` · ${vaultStatus.latency_ms}ms` : ''}
                  </span>
                </div>
                {vaultStatus?.error && (
                  <div className="text-[11px] font-mono text-amber-300">{vaultStatus.error}</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={probeProvider}
                  onChange={(e) => setProbeProvider(e.target.value)}
                  placeholder="Optional provider (e.g. gemini)"
                  className="w-44 rounded-lg border border-white/10 bg-[#090e14] px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void testVault(probeProvider)}
                  disabled={testingVault}
                  className="rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-mono text-emerald-200 hover:bg-emerald-500/25"
                >
                  Probe
                </button>
              </div>
            </div>

            {/* Write-only Secret Store Form */}
            <form onSubmit={handleSaveSecret} className="space-y-3.5">
              <div className="flex flex-wrap gap-1.5">
                {VAULT_PRESET_KEYS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSecretKey(preset)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-mono transition ${
                      secretKey === preset
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                        : 'border-white/10 bg-[#05080b] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Secret Key Identifier
                </label>
                <input
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="e.g. PROVIDER_KEY_GEMINI or HF_TOKEN"
                  className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Secret Value (Write-Only)
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Enter secret token to seal into DPAPI"
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 pr-10 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-cyan-400/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300"
                    title={showSecret ? 'Hide value' : 'Reveal value'}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[11px] font-mono text-emerald-300/90">
                  {lastStoredKey ? `Last sealed: ${lastStoredKey}` : 'POST /api/vault/set'}
                </div>
                <button
                  type="submit"
                  disabled={savingSecret}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 transition disabled:opacity-50"
                >
                  {savingSecret ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5" />
                  )}
                  Encrypt &amp; Store
                </button>
              </div>
            </form>
          </div>

          {/* AgentShield Posture & Audit */}
          <div className="xl:col-span-6 matrix-panel holo-ring rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  AgentShield Posture &amp; Audit
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  AST &amp; 6-Invariant ScopeGuard scanner across MCP plugins and workspace policies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRunAudit()}
                disabled={runningAudit || loadingShield}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 transition disabled:opacity-50"
              >
                {runningAudit ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run Full Audit
              </button>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#05080b] p-4 flex flex-wrap items-center gap-6">
              {/* SVG Circular Posture Ring */}
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="7"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke={shieldColor}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={shieldRingCircumference}
                    strokeDashoffset={shieldStrokeOffset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold font-mono text-emerald-50">{shieldScore}</span>
                  <span className="text-[10px] font-mono text-slate-400">POSTURE</span>
                </div>
              </div>

              <div className="flex-1 min-w-[200px] grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-[11px] font-mono text-slate-500">STATUS</div>
                  <div className="font-mono font-semibold text-emerald-300">
                    {shield?.status || (loadingShield ? 'SCANNING' : 'SECURE')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-slate-500">AUDIT ID</div>
                  <div className="font-mono text-cyan-300 truncate">{shield?.audit_id || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-slate-500">FINDINGS</div>
                  <div className="font-mono text-slate-200">
                    {shield?.findings_count ?? shield?.findings?.length ?? 0} total
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-slate-500">QUARANTINED</div>
                  <div className="font-mono text-slate-200">
                    {shield?.quarantined_plugins?.length ?? 0} plugins
                  </div>
                </div>
              </div>
            </div>

            {shield?.quarantined_plugins && shield.quarantined_plugins.length > 0 && (
              <div className="rounded-lg border border-red-500/35 bg-red-950/25 p-3 space-y-1">
                <div className="text-xs font-semibold text-red-200 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Quarantined Plugins
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {shield.quarantined_plugins.map((qp) => (
                    <span
                      key={qp}
                      className="rounded border border-red-400/35 bg-red-500/15 px-2 py-0.5 text-[11px] font-mono text-red-200"
                    >
                      {qp}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>TARGET: {shield?.target_path || 'core/mcp/plugins'}</span>
                <span>{shield?.scanned_at ? new Date(shield.scanned_at).toLocaleString() : ''}</span>
              </div>

              {shield?.findings && shield.findings.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {shield.findings.map((f, idx) => (
                    <div
                      key={`${f.category}-${f.line}-${idx}`}
                      className="rounded-lg border border-white/8 bg-[#05080b] p-2.5 text-xs space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-amber-300">
                          [{f.severity || 'WARN'}] {f.category || 'POLICY'}
                        </span>
                        {typeof f.line === 'number' && (
                          <span className="text-slate-500">L{f.line}</span>
                        )}
                      </div>
                      <div className="text-slate-300">{f.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Zero critical or unguarded invariant breaches detected.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE HTML5 CANVAS WHITEBOARD */}
      {subTab === 'whiteboard' && (
        <div className="matrix-panel holo-ring rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Tool & Swatch Row */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/10 bg-[#05080b] p-1 gap-1">
                {(
                  [
                    { id: 'pen', label: 'Pen', icon: PenTool },
                    { id: 'node', label: 'Node Stamp', icon: Square },
                    { id: 'text', label: 'Text', icon: Type },
                    { id: 'eraser', label: 'Eraser', icon: Eraser },
                  ] as const
                ).map((tool) => {
                  const Icon = tool.icon;
                  const active = drawTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => setDrawTool(tool.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tool.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 px-2">
                {BOARD_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setStrokeColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={`w-5 h-5 rounded-full border transition ${
                      strokeColor === hex
                        ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#05080b] border-white'
                        : 'border-white/25 opacity-80 hover:opacity-100'
                    }`}
                    title={`Color ${hex}`}
                  />
                ))}
              </div>

              <select
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-[#05080b] px-2.5 py-1.5 text-xs font-mono text-slate-200"
              >
                <option value={2}>2px</option>
                <option value={3}>3px</option>
                <option value={5}>5px</option>
                <option value={8}>8px</option>
              </select>

              {(drawTool === 'node' || drawTool === 'text') && (
                <input
                  type="text"
                  value={nodeLabelInput}
                  onChange={(e) => setNodeLabelInput(e.target.value)}
                  placeholder="Label for stamp/text"
                  className="w-40 rounded-lg border border-white/10 bg-[#05080b] px-2.5 py-1.5 text-xs font-mono text-emerald-100 focus:border-cyan-400/60 focus:outline-none"
                />
              )}
            </div>

            {/* Clear & Export Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleClearCanvas()}
                disabled={syncingBoard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>

              <button
                type="button"
                onClick={() => void handleExportCanvasPng()}
                disabled={syncingBoard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {syncingBoard ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Export PNG
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-[#05080b] overflow-hidden">
            <canvas
              ref={canvasRef}
              width={1120}
              height={460}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="w-full h-[420px] block cursor-crosshair touch-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
            <span>{whiteboardStatus}</span>
            <span>
              POST /api/whiteboard/draw · {boardOpsCount} synced WAL operations
            </span>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE MARKET TICKER & FOCUS TIMERS */}
      {subTab === 'telemetry' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Live Market Ticker */}
          <div className="xl:col-span-5 matrix-panel holo-ring rounded-xl p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Live Market Ticker
              </h2>
              <span className="text-[11px] font-mono text-slate-400">GET /api/widgets/stock</span>
            </div>

            {isAirGapped && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3 text-xs text-amber-200 flex items-center gap-2">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>Market feed paused while SILENT mode air-gap is active.</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={stockSymbol}
                onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
                placeholder="NVDA"
                className="flex-1 rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono uppercase text-emerald-50 focus:border-cyan-400/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={loadingStock || isAirGapped}
                onClick={() => void fetchStock()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {loadingStock ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Quote
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STOCK_WATCHLIST.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  disabled={loadingStock || isAirGapped}
                  onClick={() => void fetchStock(sym)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-mono transition ${
                    stockSymbol === sym
                      ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                      : 'border-white/10 bg-[#05080b] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {stockQuote && stockQuote.success ? (
              <div className="rounded-xl border border-white/10 bg-[#05080b] p-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">
                      {stockQuote.symbol} · {stockQuote.currency || 'USD'}
                    </div>
                    <div className="text-3xl font-bold font-mono text-emerald-50 mt-0.5">
                      ${typeof stockQuote.price === 'number' ? stockQuote.price.toFixed(2) : '—'}
                    </div>
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-mono ${
                      (stockQuote.change ?? 0) >= 0
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/35 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {(stockQuote.change ?? 0) >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {(stockQuote.change ?? 0) >= 0 ? '+' : ''}
                      {stockQuote.change?.toFixed(2) ?? '0.00'} ({stockQuote.change_percent?.toFixed(2) ?? '0.00'}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-white/8 pt-3 text-xs font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500">HIGH</div>
                    <div className="text-slate-200">${stockQuote.high?.toFixed(2) ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">LOW</div>
                    <div className="text-slate-200">${stockQuote.low?.toFixed(2) ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">PREV CLOSE</div>
                    <div className="text-slate-200">${stockQuote.previous_close?.toFixed(2) ?? '—'}</div>
                  </div>
                </div>
              </div>
            ) : stockQuote?.error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">
                {stockQuote.error}
              </div>
            ) : null}
          </div>

          {/* Focus Timers */}
          <div className="xl:col-span-7 matrix-panel holo-ring rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-cyan-400" />
                  Persistent Focus Timers
                </h2>
                <p className="text-xs text-slate-400">
                  SQLite WAL-backed timers synced with voice completion alerts (`/api/timers`).
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchTimers()}
                disabled={loadingTimers}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#05080b] px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-cyan-200"
              >
                {loadingTimers ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Sync
              </button>
            </div>

            <form onSubmit={handleCreateTimer} className="rounded-xl border border-white/8 bg-[#05080b] p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {TIMER_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setTimerLabel(p.label);
                      setTimerMinutes(String(Math.round(p.sec / 60)));
                    }}
                    className="rounded-md border border-white/10 bg-[#090e14] px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <input
                  type="text"
                  value={timerLabel}
                  onChange={(e) => setTimerLabel(e.target.value)}
                  placeholder="Timer label"
                  className="sm:col-span-5 rounded-lg border border-white/10 bg-[#090e14] px-3 py-2 text-xs text-emerald-50 focus:border-emerald-400/60 focus:outline-none"
                />
                <input
                  type="number"
                  min={1}
                  max={480}
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(e.target.value)}
                  placeholder="Mins"
                  className="sm:col-span-2 rounded-lg border border-white/10 bg-[#090e14] px-3 py-2 text-xs font-mono text-emerald-50 focus:border-cyan-400/60 focus:outline-none"
                />
                <select
                  value={timerType}
                  onChange={(e) => setTimerType(e.target.value as 'countdown' | 'pomodoro')}
                  className="sm:col-span-2 rounded-lg border border-white/10 bg-[#090e14] px-2.5 py-2 text-xs font-mono text-slate-200"
                >
                  <option value="pomodoro">Pomodoro</option>
                  <option value="countdown">Countdown</option>
                </select>
                <button
                  type="submit"
                  disabled={creatingTimer}
                  className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {creatingTimer ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Arm Timer
                </button>
              </div>
            </form>

            {timers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-8 text-center text-xs text-slate-400">
                No timers armed in SQLite WAL. Create a focus timer above.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {timers.map((t) => {
                  const expMs = new Date(t.expires_at).getTime();
                  const liveRemaining = Number.isFinite(expMs)
                    ? Math.max(0, Math.round((expMs - nowMs) / 1000))
                    : t.remaining_sec;
                  const completed = t.status !== 'active' || liveRemaining <= 0;
                  const pct =
                    t.duration_sec > 0
                      ? Math.max(0, Math.min(100, (liveRemaining / t.duration_sec) * 100))
                      : 0;

                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border border-white/10 bg-[#05080b] p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-emerald-50 truncate">{t.label}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {t.timer_type} · {Math.round(t.duration_sec / 60)}m · {completed ? 'completed' : 'active'}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-lg font-mono font-semibold ${
                              completed ? 'text-slate-500' : 'text-cyan-300'
                            }`}
                          >
                            {formatCountdown(liveRemaining)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTimer(t.id)}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:bg-red-500/20"
                            title="Delete timer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            completed ? 'bg-slate-600' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'
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
