import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

type VaultSubTab = 'security' | 'timers-market' | 'whiteboard';
type CanvasTool = 'pen' | 'node' | 'text';

interface VaultTestResponse {
  success?: boolean;
  vault?: string;
  ok?: boolean;
  provider?: string;
  latency_ms?: number;
  status?: string;
  message?: string;
  error?: string;
}

interface ShieldFindingItem {
  severity?: string;
  category?: string;
  message?: string;
  file?: string;
  line?: number;
  snippet?: string;
}

interface ShieldStatusPayload {
  success?: boolean;
  has_audit?: boolean;
  audit_id?: string;
  scanned_at?: string;
  score?: number;
  risk_score?: number;
  status?: string;
  target_path?: string;
  scanned_files?: number;
  findings_count?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  findings?: ShieldFindingItem[];
  quarantined_plugins?: string[];
  error?: string;
}

interface AuditRunResponse {
  success?: boolean;
  audit_passed?: boolean;
  shield?: ShieldStatusPayload;
  score?: number;
  status?: string;
  findings_count?: number;
  findings?: ShieldFindingItem[];
  quarantined_plugins?: string[];
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

interface TimerCreateResponse {
  success?: boolean;
  timer?: TimerItem;
  error?: string;
}

interface WhiteboardNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  node_type?: string;
  center?: [number, number];
}

interface WhiteboardArrow {
  from_id: string;
  to_id: string;
  label?: string;
}

interface WhiteboardText {
  x: number;
  y: number;
  content: string;
  font_size?: number;
}

interface WhiteboardState {
  nodes: WhiteboardNode[];
  arrows: WhiteboardArrow[];
  texts: WhiteboardText[];
  equations: Array<{ x: number; y: number; latex: string }>;
  total_elements: number;
}

interface WhiteboardStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
}

interface WhiteboardResponse {
  success?: boolean;
  action?: string;
  state?: WhiteboardState;
  node?: WhiteboardNode;
  text?: WhiteboardText;
  file_path?: string;
  file_size_bytes?: number;
  elements_count?: number;
  error?: string;
}

const VAULT_PRESET_KEYS = [
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'HF_TOKEN',
] as const;

const STOCK_WATCHLIST = ['NVDA', 'AAPL', 'MSFT', 'AMD', 'GOOGL', 'SPY'] as const;

const TIMER_PRESETS = [
  { label: 'Pomodoro Focus', sec: 1500, type: 'pomodoro' },
  { label: 'Deep Sprint', sec: 3000, type: 'countdown' },
  { label: '10m Check-in', sec: 600, type: 'countdown' },
  { label: '5m Reset', sec: 300, type: 'countdown' },
] as const;

const CANVAS_COLORS = [
  { id: 'emerald', label: 'Emerald', hex: '#10b981' },
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'crimson', label: 'Crimson', hex: '#ef4444' },
  { id: 'slate', label: 'Ivory', hex: '#e6edf3' },
  { id: 'violet', label: 'Violet', hex: '#a78bfa' },
] as const;

function formatDuration(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function computeRemainingSeconds(timer: TimerItem, nowMs: number): number {
  if (timer.status === 'completed') return 0;
  const parsedExp = Date.parse(timer.expires_at);
  if (!Number.isNaN(parsedExp)) {
    return Math.max(0, Math.floor((parsedExp - nowMs) / 1000));
  }
  return Math.max(0, timer.remaining_sec);
}

export function VaultView() {
  const { telemetry, pushToast } = useNexusStore();
  const isSilentMode = telemetry.workspaceMode === 'SILENT' || telemetry.airGapped;

  const [subTab, setSubTab] = useState<VaultSubTab>('security');

  // DPAPI Vault state
  const [vaultStatus, setVaultStatus] = useState<VaultTestResponse | null>(null);
  const [vaultProbing, setVaultProbing] = useState(false);
  const [probeProvider, setProbeProvider] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [showSecretValue, setShowSecretValue] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [storedKeysHistory, setStoredKeysHistory] = useState<string[]>([]);

  // AgentShield state
  const [shield, setShield] = useState<ShieldStatusPayload | null>(null);
  const [shieldLoading, setShieldLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [lastAuditTime, setLastAuditTime] = useState<number | null>(null);

  // Market Ticker state
  const [stockSymbol, setStockSymbol] = useState('NVDA');
  const [stockQuote, setStockQuote] = useState<StockQuoteResponse | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // Focus Timers state
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [timersLoading, setTimersLoading] = useState(false);
  const [timerLabel, setTimerLabel] = useState('');
  const [timerMinutes, setTimerMinutes] = useState('25');
  const [timerCreating, setTimerCreating] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Whiteboard state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null);
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [boardState, setBoardState] = useState<WhiteboardState>({
    nodes: [],
    arrows: [],
    texts: [],
    equations: [],
    total_elements: 0,
  });
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('pen');
  const [strokeColor, setStrokeColor] = useState<string>(CANVAS_COLORS[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [stampLabel, setStampLabel] = useState('Obsidian Node');
  const [boardBusy, setBoardBusy] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string>('');

  const probeVault = useCallback(
    async (providerOverride?: string) => {
      setVaultProbing(true);
      try {
        const cleanProv = (providerOverride ?? probeProvider).trim();
        const endpoint = cleanProv
          ? `/api/vault/test?provider=${encodeURIComponent(cleanProv)}`
          : '/api/vault/test';
        const res = await ipcJson<VaultTestResponse>(endpoint);
        setVaultStatus(res);
      } catch (err) {
        pushToast({
          title: 'Vault Probe Error',
          message: err instanceof Error ? err.message : 'Unable to probe /api/vault/test',
          tone: 'error',
        });
      } finally {
        setVaultProbing(false);
      }
    },
    [probeProvider, pushToast]
  );

  const loadShieldStatus = useCallback(async () => {
    setShieldLoading(true);
    try {
      const res = await ipcJson<ShieldStatusPayload>('/api/security/shield-status');
      setShield(res);
    } catch (err) {
      pushToast({
        title: 'AgentShield Unavailable',
        message: err instanceof Error ? err.message : 'Unable to query /api/security/shield-status',
        tone: 'error',
      });
    } finally {
      setShieldLoading(false);
    }
  }, [pushToast]);

  const fetchStock = useCallback(
    async (symArg?: string) => {
      const sym = (symArg ?? stockSymbol).trim().toUpperCase();
      if (!sym) return;
      setStockSymbol(sym);
      setStockLoading(true);
      try {
        const res = await ipcJson<StockQuoteResponse>(
          `/api/widgets/stock?symbol=${encodeURIComponent(sym)}`
        );
        setStockQuote(res);
        if (res.success === false && res.error) {
          pushToast({
            title: `Ticker ${sym} Blocked`,
            message: res.error,
            tone: 'warning',
          });
        }
      } catch (err) {
        pushToast({
          title: 'Market Feed Error',
          message: err instanceof Error ? err.message : 'Unable to fetch /api/widgets/stock',
          tone: 'error',
        });
      } finally {
        setStockLoading(false);
      }
    },
    [pushToast, stockSymbol]
  );

  const loadTimers = useCallback(async () => {
    setTimersLoading(true);
    try {
      const res = await ipcJson<TimersListResponse>('/api/timers');
      if (Array.isArray(res.timers)) {
        setTimers(res.timers);
      }
    } catch (err) {
      pushToast({
        title: 'Timers Load Error',
        message: err instanceof Error ? err.message : 'Unable to fetch /api/timers',
        tone: 'error',
      });
    } finally {
      setTimersLoading(false);
    }
  }, [pushToast]);

  const syncWhiteboardState = useCallback(async () => {
    try {
      const res = await ipcJson<WhiteboardResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'state' }),
      });
      if (res.state) {
        setBoardState(res.state);
      }
    } catch {
      // Whiteboard bridge sync is best-effort on load
    }
  }, []);

  useEffect(() => {
    void probeVault('');
    void loadShieldStatus();
    void loadTimers();
    void syncWhiteboardState();
    if (!isSilentMode) {
      void fetchStock('NVDA');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live 1-second wall-clock tick for countdown timers
  useEffect(() => {
    const hasActiveTimer = timers.some((t) => t.status === 'active');
    if (!hasActiveTimer) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [timers]);

  const handleStoreSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = secretKey.trim();
    if (!cleanKey || !secretValue || savingSecret) return;

    setSavingSecret(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/vault/set', {
        method: 'POST',
        body: JSON.stringify({ key: cleanKey, value: secretValue }),
      });
      if (res.success === false) {
        pushToast({
          title: 'DPAPI Write Failed',
          message: res.error ?? 'Vault rejected secret write.',
          tone: 'error',
        });
        return;
      }
      setStoredKeysHistory((prev) =>
        [cleanKey, ...prev.filter((k) => k !== cleanKey)].slice(0, 8)
      );
      setSecretValue('');
      pushToast({
        title: 'Secret Encrypted in DPAPI',
        message: `${cleanKey} committed to local Windows DPAPI enclave.`,
        tone: 'success',
      });
      void probeVault('');
    } catch (err) {
      pushToast({
        title: 'Vault Write Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/vault/set',
        tone: 'error',
      });
    } finally {
      setSavingSecret(false);
    }
  };

  const handleRunAudit = async () => {
    if (auditRunning) return;
    setAuditRunning(true);
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.shield) {
        setShield(res.shield);
      } else if (typeof res.score === 'number' || res.status) {
        setShield({
          success: res.success,
          score: res.score,
          status: res.status,
          findings_count: res.findings_count ?? res.findings?.length ?? 0,
          findings: res.findings,
          quarantined_plugins: res.quarantined_plugins,
        });
      }
      if (typeof res.timestamp === 'number') {
        setLastAuditTime(res.timestamp);
      } else {
        setLastAuditTime(Date.now() / 1000);
      }
      if (res.success === false) {
        pushToast({
          title: 'Security Audit Alert',
          message: res.error ?? 'Audit reported findings.',
          tone: 'warning',
        });
      } else {
        pushToast({
          title: 'AgentShield Audit Passed',
          message: `Score: ${res.shield?.score ?? res.score ?? 100}/100`,
          tone: 'success',
        });
      }
    } catch (err) {
      pushToast({
        title: 'Audit Failed',
        message: err instanceof Error ? err.message : 'Unable to reach /api/audit/run',
        tone: 'error',
      });
    } finally {
      setAuditRunning(false);
    }
  };

  const createTimer = async (label: string, durationSec: number, timerType: string) => {
    if (timerCreating || durationSec <= 0) return;
    setTimerCreating(true);
    try {
      const res = await ipcJson<TimerCreateResponse>('/api/timers', {
        method: 'POST',
        body: JSON.stringify({
          label: label.trim() || 'Focus Timer',
          duration_sec: Math.round(durationSec),
          timer_type: timerType,
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Timer Creation Failed',
          message: res.error ?? 'Unable to save timer.',
          tone: 'error',
        });
        return;
      }
      setTimerLabel('');
      await loadTimers();
      pushToast({
        title: 'Timer Started',
        message: `${label.trim() || 'Focus Timer'} (${formatDuration(durationSec)})`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Timer Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/timers',
        tone: 'error',
      });
    } finally {
      setTimerCreating(false);
    }
  };

  const handleCreateCustomTimer = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Number(timerMinutes);
    if (!Number.isFinite(mins) || mins <= 0) {
      pushToast({
        title: 'Invalid Duration',
        message: 'Enter a positive duration in minutes.',
        tone: 'warning',
      });
      return;
    }
    void createTimer(timerLabel || `${mins}m Focus`, Math.round(mins * 60), 'countdown');
  };

  const handleDeleteTimer = async (timerId: string) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/timers/${encodeURIComponent(timerId)}`,
        { method: 'DELETE' }
      );
      if (res.success === false) {
        pushToast({
          title: 'Delete Failed',
          message: res.error ?? 'Could not remove timer.',
          tone: 'error',
        });
        return;
      }
      setTimers((prev) => prev.filter((t) => t.id !== timerId));
    } catch (err) {
      pushToast({
        title: 'Delete Timer Error',
        message: err instanceof Error ? err.message : 'Unable to delete timer.',
        tone: 'error',
      });
    }
  };

  // Redraw HTML5 Canvas whenever strokes or bridge boardState change
  const renderCanvas = useCallback(
    (extraStroke?: WhiteboardStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Obsidian backdrop
      ctx.fillStyle = '#07090d';
      ctx.fillRect(0, 0, w, h);

      // Subtle architectural dot grid
      ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      for (let gx = 24; gx < w; gx += 28) {
        for (let gy = 24; gy < h; gy += 28) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }

      // Draw bridge arrows
      const nodeMap = new Map(boardState.nodes.map((n) => [n.id, n]));
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
      ctx.lineWidth = 2;
      for (const arrow of boardState.arrows) {
        const from = nodeMap.get(arrow.from_id);
        const to = nodeMap.get(arrow.to_id);
        if (!from || !to) continue;
        const x1 = from.x + (from.width || 160) / 2;
        const y1 = from.y + (from.height || 52) / 2;
        const x2 = to.x + (to.width || 160) / 2;
        const y2 = to.y + (to.height || 52) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Draw bridge nodes
      for (const node of boardState.nodes) {
        const nw = node.width || 156;
        const nh = node.height || 52;
        ctx.fillStyle = '#0d1218';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(node.x, node.y, nw, nh, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e6edf3';
        ctx.font = '12px "JetBrains Mono", monospace';
        ctx.fillText(node.label.slice(0, 20), node.x + 12, node.y + nh / 2 + 4);
      }

      // Draw bridge texts
      for (const txt of boardState.texts) {
        ctx.fillStyle = '#34d399';
        ctx.font = `${txt.font_size ?? 14}px "Inter", sans-serif`;
        ctx.fillText(txt.content, txt.x, txt.y);
      }

      // Draw freehand strokes
      const allStrokes = extraStroke ? [...strokes, extraStroke] : strokes;
      for (const s of allStrokes) {
        if (s.points.length === 0) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(s.points[0].x, s.points[0].y);
        for (let i = 1; i < s.points.length; i += 1) {
          ctx.lineTo(s.points[i].x, s.points[i].y);
        }
        if (s.points.length === 1) {
          ctx.lineTo(s.points[0].x + 0.5, s.points[0].y + 0.5);
        }
        ctx.stroke();
      }
    },
    [boardState, strokes]
  );

  useEffect(() => {
    if (subTab === 'whiteboard') {
      renderCanvas();
    }
  }, [subTab, renderCanvas]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const handleCanvasPointerDown = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getCanvasPoint(e);
    if (canvasTool === 'pen') {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const stroke: WhiteboardStroke = {
        color: strokeColor,
        width: strokeWidth,
        points: [pt],
      };
      activeStrokeRef.current = stroke;
      renderCanvas(stroke);
      return;
    }

    const label = stampLabel.trim() || (canvasTool === 'node' ? 'Node' : 'Note');
    setBoardBusy(true);
    try {
      if (canvasTool === 'node') {
        const res = await ipcJson<WhiteboardResponse>('/api/whiteboard/draw', {
          method: 'POST',
          body: JSON.stringify({
            action: 'node',
            x: pt.x,
            y: pt.y,
            label,
            node_type: 'state',
          }),
        });
        if (res.node) {
          const addedNode = res.node;
          setBoardState((prev) => ({
            ...prev,
            nodes: [...prev.nodes, addedNode],
            total_elements: prev.total_elements + 1,
          }));
        } else {
          await syncWhiteboardState();
        }
      } else {
        const res = await ipcJson<WhiteboardResponse>('/api/whiteboard/draw', {
          method: 'POST',
          body: JSON.stringify({
            action: 'text',
            x: pt.x,
            y: pt.y,
            content: label,
            font_size: 14,
          }),
        });
        if (res.text) {
          const addedText = res.text;
          setBoardState((prev) => ({
            ...prev,
            texts: [...prev.texts, addedText],
            total_elements: prev.total_elements + 1,
          }));
        } else {
          await syncWhiteboardState();
        }
      }
    } catch (err) {
      pushToast({
        title: 'Whiteboard Bridge Error',
        message: err instanceof Error ? err.message : 'Unable to send /api/whiteboard/draw',
        tone: 'error',
      });
    } finally {
      setBoardBusy(false);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    const pt = getCanvasPoint(e);
    activeStrokeRef.current.points.push(pt);
    renderCanvas(activeStrokeRef.current);
  };

  const handleCanvasPointerUp = () => {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    const finished = activeStrokeRef.current;
    isDrawingRef.current = false;
    activeStrokeRef.current = null;
    setStrokes((prev) => [...prev, finished]);
  };

  const handleClearWhiteboard = async () => {
    setStrokes([]);
    setBoardBusy(true);
    try {
      await ipcJson<WhiteboardResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'clear' }),
      });
      setBoardState({
        nodes: [],
        arrows: [],
        texts: [],
        equations: [],
        total_elements: 0,
      });
      pushToast({ title: 'Whiteboard Cleared', tone: 'info' });
    } catch (err) {
      pushToast({
        title: 'Clear Whiteboard Error',
        message: err instanceof Error ? err.message : 'Failed clearing whiteboard bridge.',
        tone: 'error',
      });
    } finally {
      setBoardBusy(false);
    }
  };

  const handleExportWhiteboardPng = async () => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `nexus-whiteboard-${Date.now()}.png`;
        link.click();
      } catch {
        // Ignore browser download failure and still run server export
      }
    }

    setBoardBusy(true);
    try {
      const res = await ipcJson<WhiteboardResponse>('/api/whiteboard/draw', {
        method: 'POST',
        body: JSON.stringify({ action: 'export_png' }),
      });
      if (res.file_path) {
        setLastExportPath(res.file_path);
      }
      pushToast({
        title: 'Whiteboard PNG Exported',
        message: res.file_path
          ? `Saved to ${res.file_path}`
          : 'Canvas downloaded as PNG.',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Bridge PNG Export Notice',
        message: err instanceof Error ? err.message : 'Local browser PNG downloaded.',
        tone: 'warning',
      });
    } finally {
      setBoardBusy(false);
    }
  };

  const shieldScore = useMemo(() => {
    if (typeof shield?.score === 'number') return shield.score;
    return null;
  }, [shield]);

  const findingsCount = useMemo(() => {
    if (typeof shield?.findings_count === 'number') return shield.findings_count;
    if (Array.isArray(shield?.findings)) return shield.findings.length;
    return 0;
  }, [shield]);

  const stockPositive = (stockQuote?.change ?? 0) >= 0;

  return (
    <div className="h-full flex flex-col p-6 gap-6 overflow-y-auto animate-obsidian-fade">
      {/* Header & Sub-Tab Switcher */}
      <header className="obsidian-panel rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide text-[var(--text)]">
              Vault & Security Console
            </h1>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              Windows DPAPI enclave, AgentShield posture, live market telemetry, focus timers & canvas
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1.5 bg-[var(--panel-muted)] p-1 rounded-lg border border-[var(--border-subtle)]">
          {(
            [
              { id: 'security', label: 'Vault & Shield', icon: Lock },
              { id: 'timers-market', label: 'Market & Timers', icon: Clock },
              { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-md border text-[11px] font-mono ${
              vaultStatus?.success
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)]'
            }`}
          >
            {vaultStatus?.vault ?? (vaultProbing ? 'PROBING...' : 'DPAPI')}
          </span>
          {shieldScore !== null && (
            <span className="px-2.5 py-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-[11px] font-mono text-emerald-300">
              SHIELD {shieldScore}/100
            </span>
          )}
        </div>
      </header>

      {/* TAB 1: DPAPI VAULT & AGENTSHIELD */}
      {subTab === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* DPAPI Vault Card */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                <span>Windows DPAPI Secret Enclave</span>
              </div>
              <button
                type="button"
                disabled={vaultProbing}
                onClick={() => void probeVault()}
                className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[11px] font-mono text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${vaultProbing ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Test Enclave</span>
              </button>
            </div>

            {/* Probe Status + Optional Provider Probe */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Enclave Status</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                    vaultStatus?.success
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {vaultStatus?.vault || vaultStatus?.status || (vaultStatus?.success ? 'READY' : 'UNVERIFIED')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={probeProvider}
                  onChange={(e) => setProbeProvider(e.target.value)}
                  placeholder="Optional provider id to probe (e.g. groq, gemini)"
                  className="flex-1 bg-[#07090d] border border-[var(--border-subtle)] focus:border-emerald-500/60 rounded-md px-3 py-1.5 text-xs font-mono text-[var(--text)] outline-none"
                />
                <button
                  type="button"
                  disabled={vaultProbing}
                  onClick={() => void probeVault(probeProvider)}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[#0d1218] hover:border-emerald-500/40 text-xs text-[var(--text)]"
                >
                  Probe
                </button>
              </div>
              {vaultStatus?.message && (
                <p className="text-[11px] font-mono text-[var(--text-muted)]">{vaultStatus.message}</p>
              )}
              {vaultStatus?.error && (
                <p className="text-[11px] font-mono text-amber-300">{vaultStatus.error}</p>
              )}
            </div>

            {/* Store Secret Form */}
            <form onSubmit={handleStoreSecret} className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {VAULT_PRESET_KEYS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSecretKey(preset)}
                    className={`px-2 py-1 rounded border text-[10px] font-mono transition-colors ${
                      secretKey === preset
                        ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                        : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Secret Identifier
                </label>
                <input
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="KEY_NAME (e.g. GEMINI_API_KEY)"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Secret Value (Write-Only Encrypted)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showSecretValue ? 'text' : 'password'}
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder="Paste token or credential..."
                    className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretValue((prev) => !prev)}
                    aria-label={showSecretValue ? 'Hide secret' : 'Show secret'}
                    className="p-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]"
                  >
                    {showSecretValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!secretKey.trim() || !secretValue || savingSecret}
                className="px-4 py-2.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-45"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{savingSecret ? 'Encrypting...' : 'Store in DPAPI Vault'}</span>
              </button>
            </form>

            {storedKeysHistory.length > 0 && (
              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Session Writes:
                </span>
                {storedKeysHistory.map((k) => (
                  <span
                    key={k}
                    className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* AgentShield Posture & Audit Card */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>AgentShield Posture & Audit</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={shieldLoading}
                  onClick={() => void loadShieldStatus()}
                  className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                  title="Refresh Shield Status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${shieldLoading ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
                <button
                  type="button"
                  disabled={auditRunning}
                  onClick={() => void handleRunAudit()}
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{auditRunning ? 'Auditing...' : 'Run Security Audit'}</span>
                </button>
              </div>
            </div>

            {/* Posture Summary Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Trust Score
                </div>
                <div className="text-2xl font-mono font-semibold text-emerald-300 mt-1 tabular-nums">
                  {shieldScore !== null ? `${shieldScore}` : '—'}
                  <span className="text-xs text-[var(--text-muted)]">/100</span>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Findings
                </div>
                <div
                  className={`text-2xl font-mono font-semibold mt-1 tabular-nums ${
                    findingsCount > 0 ? 'text-amber-300' : 'text-[var(--text)]'
                  }`}
                >
                  {findingsCount}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Posture
                </div>
                <div className="text-xs font-mono font-semibold text-emerald-300 mt-2.5 truncate">
                  {shield?.status ?? (shieldLoading ? 'SCANNING' : 'NOMINAL')}
                </div>
              </div>
            </div>

            {/* Metadata Details */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-muted)] font-mono">Target Scope</span>
                <span className="font-mono text-[var(--text-secondary)] truncate max-w-xs">
                  {shield?.target_path || 'Core Runtime & Skill Enclave'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-muted)] font-mono">Last Scan</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {lastAuditTime
                    ? new Date(lastAuditTime * 1000).toLocaleTimeString()
                    : shield?.scanned_at || 'On Demand'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-muted)] font-mono">Quarantined</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {shield?.quarantined_plugins?.length ?? 0} plugins
                </span>
              </div>
            </div>

            {/* Findings / Quarantined List */}
            {Array.isArray(shield?.findings) && shield.findings.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                {shield.findings.map((f, idx) => (
                  <div
                    key={`${f.category || 'finding'}-${idx}`}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-amber-300 font-semibold">
                        {f.severity ?? 'WARN'} · {f.category ?? 'Rule'}
                      </span>
                      {f.file && (
                        <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                          {f.file}
                          {f.line ? `:${f.line}` : ''}
                        </span>
                      )}
                    </div>
                    {f.message && (
                      <p className="text-[var(--text-secondary)] mt-1">{f.message}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4 flex items-center gap-3 text-xs text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  ScopeGuard & AgentShield verified zero active violations across audited modules.
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: MARKET TICKER & FOCUS TIMERS */}
      {subTab === 'timers-market' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Live Market Ticker */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Market Ticker</span>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                /api/widgets/stock
              </span>
            </div>

            {isSilentMode && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex items-center gap-2.5 text-xs text-amber-200">
                <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Market feed paused while SILENT air-gap mode is active.</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void fetchStock();
              }}
              className="flex items-center gap-2.5"
            >
              <input
                type="text"
                value={stockSymbol}
                onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
                placeholder="Ticker (e.g. NVDA)"
                className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] uppercase outline-none"
              />
              <button
                type="submit"
                disabled={stockLoading || !stockSymbol.trim() || isSilentMode}
                className="px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium transition-colors disabled:opacity-45"
              >
                {stockLoading ? 'Fetching...' : 'Fetch Quote'}
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-1.5">
              {STOCK_WATCHLIST.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  disabled={stockLoading || isSilentMode}
                  onClick={() => void fetchStock(sym)}
                  className={`px-2.5 py-1 rounded border text-[11px] font-mono transition-colors ${
                    stockSymbol === sym
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                      : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                  } disabled:opacity-45`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {stockQuote && stockQuote.success !== false && typeof stockQuote.price === 'number' ? (
              <div className="rounded-xl border border-[var(--border)] bg-[#07090d] p-5 flex flex-col gap-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="text-xs font-mono text-[var(--text-muted)]">
                      {stockQuote.symbol} · {stockQuote.currency ?? 'USD'}
                    </div>
                    <div className="text-3xl font-mono font-semibold text-[var(--text)] mt-1 tabular-nums">
                      ${stockQuote.price.toFixed(2)}
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 tabular-nums ${
                      stockPositive
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/35 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {stockPositive ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {stockPositive ? '+' : ''}
                      {(stockQuote.change ?? 0).toFixed(2)} (
                      {(stockQuote.change_percent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--border-subtle)] text-xs font-mono">
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)]">PREV CLOSE</span>
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {typeof stockQuote.previous_close === 'number'
                        ? `$${stockQuote.previous_close.toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)]">DAY RANGE</span>
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {typeof stockQuote.low === 'number' && typeof stockQuote.high === 'number'
                        ? `${stockQuote.low.toFixed(1)}–${stockQuote.high.toFixed(1)}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)]">VOLUME</span>
                    <span className="text-[var(--text-secondary)] tabular-nums">
                      {typeof stockQuote.volume === 'number'
                        ? stockQuote.volume.toLocaleString()
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs font-mono text-[var(--text-secondary)] flex items-center gap-2">
                {stockQuote?.error ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                    <span>{stockQuote.error}</span>
                  </>
                ) : (
                  <span>
                    {stockLoading
                      ? 'Querying live market quote...'
                      : 'Select a ticker symbol to inspect live price telemetry.'}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Focus Timers Card */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sovereign Focus Timers ({timers.length})</span>
              </div>
              <button
                type="button"
                disabled={timersLoading}
                onClick={() => void loadTimers()}
                className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                title="Refresh Timers"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${timersLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIMER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={timerCreating}
                  onClick={() => void createTimer(p.label, p.sec, p.type)}
                  className="px-2.5 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-left transition-colors disabled:opacity-45"
                >
                  <div className="text-[11px] font-medium text-[var(--text)] truncate">
                    {p.label}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-300 mt-0.5">
                    {Math.round(p.sec / 60)}m
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Timer Form */}
            <form onSubmit={handleCreateCustomTimer} className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={timerLabel}
                onChange={(e) => setTimerLabel(e.target.value)}
                placeholder="Timer label (e.g. Architecture Review)"
                className="flex-1 min-w-[160px] bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs text-[var(--text)] outline-none"
              />
              <input
                type="number"
                min={1}
                max={480}
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(e.target.value)}
                aria-label="Minutes"
                className="w-20 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
              />
              <span className="text-xs font-mono text-[var(--text-muted)]">min</span>
              <button
                type="submit"
                disabled={timerCreating}
                className="px-3.5 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start</span>
              </button>
            </form>

            {/* Active & Completed Timers List */}
            {timers.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                No SQLite WAL timers active. Start a Pomodoro preset or custom countdown above.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
                {timers.map((timer) => {
                  const rem = computeRemainingSeconds(timer, nowMs);
                  const isDone = timer.status === 'completed' || rem <= 0;
                  const pct =
                    timer.duration_sec > 0
                      ? Math.max(0, Math.min(100, Math.round((rem / timer.duration_sec) * 100)))
                      : 0;
                  return (
                    <div
                      key={timer.id}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] p-3.5 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[var(--text)] truncate">
                            {timer.label}
                          </div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">
                            {timer.timer_type} · {isDone ? 'COMPLETED' : 'ACTIVE'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`text-sm font-mono font-semibold tabular-nums ${
                              isDone ? 'text-[var(--text-muted)]' : 'text-emerald-300'
                            }`}
                          >
                            {formatDuration(rem)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTimer(timer.id)}
                            aria-label={`Delete timer ${timer.label}`}
                            className="p-1.5 rounded border border-[var(--border-subtle)] hover:border-red-500/40 text-[var(--text-muted)] hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="h-1 rounded-full bg-[var(--panel-muted)] overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: INTERACTIVE HTML5 CANVAS WHITEBOARD */}
      {subTab === 'whiteboard' && (
        <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4 flex-1 min-h-[500px]">
          {/* Whiteboard Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'pen', label: 'Freehand', icon: PenTool },
                  { id: 'node', label: 'Node Box', icon: Square },
                  { id: 'text', label: 'Label', icon: Type },
                ] as const
              ).map((tool) => {
                const Icon = tool.icon;
                const active = canvasTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => setCanvasTool(tool.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      active
                        ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                        : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tool.label}</span>
                  </button>
                );
              })}

              {canvasTool !== 'pen' && (
                <input
                  type="text"
                  value={stampLabel}
                  onChange={(e) => setStampLabel(e.target.value)}
                  placeholder="Label for click placement..."
                  className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-1.5 text-xs text-[var(--text)] outline-none w-44"
                />
              )}
            </div>

            {/* Color & Width Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                {CANVAS_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setStrokeColor(c.hex)}
                    title={c.label}
                    aria-label={`Color ${c.label}`}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      strokeColor === c.hex
                        ? 'scale-110 border-white ring-2 ring-emerald-500/40'
                        : 'border-white/20'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1 bg-[var(--panel-muted)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                {[2, 3, 6].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setStrokeWidth(w)}
                    className={`px-2 py-1 rounded text-[11px] font-mono ${
                      strokeWidth === w
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>

            {/* Clear & Export PNG */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={boardBusy}
                onClick={() => void handleClearWhiteboard()}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-red-500/40 text-xs text-[var(--text-secondary)] hover:text-red-300 flex items-center gap-1.5 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="button"
                disabled={boardBusy}
                onClick={() => void handleExportWhiteboardPng()}
                className="px-3.5 py-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export PNG</span>
              </button>
            </div>
          </div>

          {/* Interactive HTML5 Canvas */}
          <div className="relative flex-1 rounded-xl border border-[var(--border)] bg-[#07090d] overflow-hidden min-h-[380px]">
            <canvas
              ref={canvasRef}
              width={1120}
              height={540}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerUp}
              className="w-full h-full block cursor-crosshair touch-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-muted)]">
            <span>
              Bridge Elements: {boardState.nodes.length} nodes · {boardState.texts.length} labels ·{' '}
              {strokes.length} freehand strokes
            </span>
            {lastExportPath && (
              <span className="text-emerald-300 truncate max-w-md">
                Server PNG: {lastExportPath}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default VaultView;
