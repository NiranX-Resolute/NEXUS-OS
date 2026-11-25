import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { MemoryNode, TaskItem, WorkspaceMode } from '@/types';

type DrawerFilterTab = 'all' | 'shield' | 'memory' | 'tasks' | 'logs' | 'skills';

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
  error?: string;
}

interface AuditRunResponse {
  success?: boolean;
  audit_passed?: boolean;
  shield?: ShieldStatusResponse;
  timestamp?: number;
  error?: string;
}

interface MemorySearchResponse {
  success?: boolean;
  query?: string;
  results?: MemoryNode[];
  memories?: MemoryNode[];
  count?: number;
  error?: string;
}

interface MemoryCreateResponse {
  success?: boolean;
  id?: string;
  error?: string;
}

interface SkillRecord {
  slug: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
}

interface McpToolRecord {
  name: string;
  description?: string;
  agent?: string;
}

interface SkillsResponse {
  success?: boolean;
  skills?: SkillRecord[];
  tools?: McpToolRecord[];
  error?: string;
}

function formatMem(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatTime(raw: string): string {
  if (!raw) return '—';
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw.slice(0, 19);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isTaskCancellable(task: TaskItem): boolean {
  const s = String(task.status || '').toUpperCase();
  return s === 'QUEUED' || s === 'IN_PROGRESS' || s === 'RUNNING';
}

export function CircuitDrawer() {
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen);
  const telemetry = useNexusStore((s) => s.telemetry);
  const isOnline = useNexusStore((s) => s.isOnline);
  const tasks = useNexusStore((s) => s.tasks);
  const logs = useNexusStore((s) => s.logs);
  const cancelTask = useNexusStore((s) => s.cancelTask);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeFilter, setActiveFilter] = useState<DrawerFilterTab>('all');

  // Workspace Shield state
  const [shield, setShield] = useState<ShieldStatusResponse | null>(null);
  const [loadingShield, setLoadingShield] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);

  // Memory FTS5 Quick Query + Ingest state
  const [memQuery, setMemQuery] = useState('');
  const memQueryRef = useRef('');
  memQueryRef.current = memQuery;
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [loadingMem, setLoadingMem] = useState(false);
  const [showMemCompose, setShowMemCompose] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newNamespace, setNewNamespace] = useState<WorkspaceMode>('DEV');
  const [savingMem, setSavingMem] = useState(false);

  // Skills & MCP Tools state
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  // Task cancellation tracker
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadShield = useCallback(async () => {
    setLoadingShield(true);
    try {
      const res = await ipcJson<ShieldStatusResponse>('/api/security/shield-status');
      setShield(res);
    } finally {
      setLoadingShield(false);
    }
  }, []);

  const loadMemory = useCallback(async (queryText: string) => {
    setLoadingMem(true);
    try {
      const trimmed = queryText.trim();
      if (trimmed) {
        const res = await ipcJson<MemorySearchResponse>(
          `/api/memory/search?q=${encodeURIComponent(trimmed)}&limit=20`
        );
        if (res.success) {
          setMemories(Array.isArray(res.results) ? res.results : []);
        }
      } else {
        const res = await ipcJson<MemorySearchResponse>('/api/memory?limit=15');
        if (res.success && Array.isArray(res.memories)) {
          setMemories(res.memories);
        } else {
          const fallback = await ipcJson<MemorySearchResponse>('/api/memory/search?q=&limit=15');
          if (fallback.success) {
            setMemories(Array.isArray(fallback.results) ? fallback.results : []);
          }
        }
      }
    } finally {
      setLoadingMem(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const res = await ipcJson<SkillsResponse>('/api/skills');
      if (res.success) {
        setSkills(Array.isArray(res.skills) ? res.skills : []);
        setTools(Array.isArray(res.tools) ? res.tools : []);
        return;
      }
      const fallback = await ipcJson<SkillsResponse>('/api/skills/installed');
      if (fallback.success) {
        setSkills(Array.isArray(fallback.skills) ? fallback.skills : []);
      }
    } finally {
      setLoadingSkills(false);
    }
  }, []);

  const refreshDrawer = useCallback(() => {
    void refreshAll();
    void loadShield();
    void loadMemory(memQuery);
    void loadSkills();
  }, [loadMemory, loadShield, loadSkills, memQuery, refreshAll]);

  useEffect(() => {
    if (!drawerOpen) return;
    setNewNamespace(useNexusStore.getState().telemetry.workspaceMode);
    void loadShield();
    void loadMemory(memQueryRef.current);
    void loadSkills();
    void refreshAll();
  }, [drawerOpen, loadMemory, loadShield, loadSkills, refreshAll]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !commandPaletteOpen) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, drawerOpen, setDrawerOpen]);

  const handleRunAudit = useCallback(async () => {
    setRunningAudit(true);
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.shield) {
        setShield(res.shield);
      } else {
        void loadShield();
      }
      if (res.success) {
        const score = res.shield?.score ?? 100;
        pushToast(`Security Audit passed (${score}/100)`, 'success');
        void refreshAll();
      } else {
        pushToast(res.error || 'Security audit failed', 'error');
      }
    } finally {
      setRunningAudit(false);
    }
  }, [loadShield, pushToast, refreshAll]);

  const handleMemorySearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void loadMemory(memQuery);
    },
    [loadMemory, memQuery]
  );

  const handleStoreMemory = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const title = newTitle.trim();
      const content = newContent.trim();
      if (!title || !content) {
        pushToast('Memory title and content are required', 'warn');
        return;
      }
      setSavingMem(true);
      try {
        const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
          method: 'POST',
          body: JSON.stringify({
            title,
            content,
            namespace: newNamespace,
            metadata: { source: 'circuit_drawer_v5' },
          }),
        });
        if (res.success) {
          pushToast('Memory node indexed in FTS5', 'success');
          setNewTitle('');
          setNewContent('');
          setShowMemCompose(false);
          void loadMemory(memQuery);
        } else {
          pushToast(res.error || 'Failed to store memory node', 'error');
        }
      } finally {
        setSavingMem(false);
      }
    },
    [loadMemory, memQuery, newContent, newNamespace, newTitle, pushToast]
  );

  const handleCancelTask = useCallback(
    async (taskId: string) => {
      setCancellingId(taskId);
      try {
        await cancelTask(taskId);
      } finally {
        setCancellingId(null);
      }
    },
    [cancelTask]
  );

  if (!drawerOpen) {
    return null;
  }

  const shieldScore = shield?.score ?? 100;
  const shieldStatus = (shield?.status || (shieldScore >= 85 ? 'NOMINAL' : 'REVIEW')).toUpperCase();
  const shieldHealthy = shieldStatus === 'NOMINAL' || shieldStatus === 'PASS' || shieldStatus === 'CLEAN' || shieldScore >= 85;
  const quarantinedCount = Array.isArray(shield?.quarantined_plugins)
    ? shield.quarantined_plugins.length
    : 0;

  const showSection = (section: Exclude<DrawerFilterTab, 'all'>) =>
    activeFilter === 'all' || activeFilter === section;

  const filterTabs: Array<{ id: DrawerFilterTab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'shield', label: 'Shield' },
    { id: 'memory', label: 'Memory' },
    { id: 'tasks', label: `Tasks (${tasks.length})` },
    { id: 'logs', label: 'Logs' },
    { id: 'skills', label: `Skills (${skills.length})` },
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#030508]/65 backdrop-blur-xs"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over Circuit Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Cyber Telemetry and Circuit Inspector"
        className="relative z-10 w-full max-w-[460px] h-full bg-[#070c12]/96 backdrop-blur-xl border-l border-emerald-500/25 shadow-[-16px_0_48px_rgba(0,0,0,0.75)] flex flex-col animate-matrix-in"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 bg-[#05080b]/85">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                telemetry.estopActive
                  ? 'bg-red-500 shadow-[0_0_10px_#ef4444]'
                  : isOnline
                    ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                    : 'bg-slate-500'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-mono uppercase tracking-[0.18em] text-emerald-300 truncate">
                Circuit Inspector
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {telemetry.estopActive
                  ? 'E-STOP LOCKED'
                  : isOnline
                    ? `ONLINE · ${telemetry.pingMs}ms · ${telemetry.wsConnected ? 'WS LIVE' : 'HTTP'}`
                    : 'GATEWAY OFFLINE'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={refreshDrawer}
              title="Refresh circuit telemetry"
              aria-label="Refresh circuit telemetry"
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-cyan-200 hover:border-cyan-400/35 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              title="Close drawer"
              aria-label="Close circuit drawer"
              className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-emerald-200 hover:border-emerald-500/35 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Telemetry Strip */}
        <div className="px-4 py-2.5 border-b border-white/8 bg-[#05080b]/55 grid grid-cols-3 gap-2 text-[11px] font-mono">
          <div className="rounded-lg border border-white/8 bg-[#090f16]/80 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">CPU</div>
            <div className="text-cyan-200 tabular-nums font-medium">
              {telemetry.cpuUsagePct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-[#090f16]/80 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">RAM</div>
            <div className="text-emerald-200 tabular-nums font-medium truncate">
              {formatMem(telemetry.ramMb)}
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-[#090f16]/80 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">Slices</div>
            <div className="text-emerald-200 tabular-nums font-medium">
              {telemetry.activeSlices} active
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {filterTabs.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono whitespace-nowrap border transition-colors ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                    : 'bg-transparent border-white/8 text-slate-400 hover:text-slate-200 hover:border-white/15'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Inspector Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 1. Workspace Shield */}
          {showSection('shield') && (
            <section className="rounded-2xl matrix-panel p-4 space-y-3 border border-emerald-500/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {shieldHealthy && !telemetry.estopActive ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  )}
                  <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-emerald-200">
                    Workspace Shield
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleRunAudit}
                  disabled={runningAudit}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/22 text-emerald-200 text-[11px] font-mono transition-colors disabled:opacity-50"
                >
                  {runningAudit ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3 h-3" />
                  )}
                  Run Audit
                </button>
              </div>

              {loadingShield && !shield ? (
                <div className="text-xs font-mono text-slate-400 flex items-center gap-2 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                  Loading ScopeGuard + AgentShield posture...
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Score</div>
                    <div className="text-sm font-semibold text-emerald-300 tabular-nums mt-0.5">
                      {shieldScore}/100
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Findings</div>
                    <div className="text-sm font-semibold text-cyan-200 tabular-nums mt-0.5">
                      {shield?.findings_count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#05080b]/75 border border-white/8 p-2.5">
                    <div className="text-[10px] text-slate-500 uppercase">Quarantined</div>
                    <div className="text-sm font-semibold text-slate-200 tabular-nums mt-0.5">
                      {quarantinedCount}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                <span>
                  Posture: <span className="text-emerald-300">{shieldStatus}</span>
                </span>
                <span className="tabular-nums">
                  {shield?.scanned_at ? formatTime(shield.scanned_at) : 'Ready'}
                </span>
              </div>
            </section>
          )}

          {/* 2. Memory FTS5 Quick Query & Store */}
          {showSection('memory') && (
            <section className="rounded-2xl matrix-panel p-4 space-y-3 border border-cyan-400/20">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-cyan-200">
                    Memory FTS5
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMemCompose((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-[11px] font-mono transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {showMemCompose ? 'Close' : 'Store Node'}
                </button>
              </div>

              <form onSubmit={handleMemorySearchSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={memQuery}
                    onChange={(e) => setMemQuery(e.target.value)}
                    placeholder="Query FTS5 nodes..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#05080b]/85 border border-white/10 focus:border-cyan-400/45 focus:outline-none text-xs text-emerald-50 placeholder:text-slate-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loadingMem}
                  className="px-3 py-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/12 hover:bg-cyan-500/22 text-cyan-200 text-xs font-mono transition-colors disabled:opacity-50"
                >
                  {loadingMem ? '...' : 'Search'}
                </button>
              </form>

              {showMemCompose && (
                <form
                  onSubmit={handleStoreMemory}
                  className="rounded-xl bg-[#05080b]/80 border border-cyan-400/25 p-3 space-y-2.5"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Node title"
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#090f16] border border-white/10 focus:border-emerald-500/45 focus:outline-none text-xs text-emerald-50 placeholder:text-slate-500"
                    />
                    <select
                      value={newNamespace}
                      onChange={(e) => setNewNamespace(e.target.value as WorkspaceMode)}
                      aria-label="Memory namespace"
                      className="px-2 py-1.5 rounded-lg bg-[#090f16] border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none"
                    >
                      <option value="DEV">DEV</option>
                      <option value="STUDY">STUDY</option>
                      <option value="STUDIO">STUDIO</option>
                      <option value="SILENT">SILENT</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Memory content to index in SQLite FTS5..."
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#090f16] border border-white/10 focus:border-emerald-500/45 focus:outline-none text-xs text-emerald-50 placeholder:text-slate-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingMem}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      {savingMem && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save to FTS5
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                {loadingMem ? (
                  <div className="text-xs font-mono text-slate-400 py-3 text-center">
                    Querying SQLite WAL FTS5 index...
                  </div>
                ) : memories.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500 py-3 text-center rounded-xl bg-[#05080b]/60 border border-white/8">
                    No matching memory nodes.
                  </div>
                ) : (
                  memories.slice(0, activeFilter === 'memory' ? 20 : 5).map((node) => (
                    <div
                      key={node.id}
                      className="rounded-xl bg-[#05080b]/75 border border-white/8 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-emerald-100 truncate">
                          {node.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/25 text-[10px] font-mono text-cyan-300 shrink-0">
                          {node.namespace}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                        {node.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* 3. Task Queue */}
          {showSection('tasks') && (
            <section className="rounded-2xl matrix-panel p-4 space-y-3 border border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-emerald-200">
                    Task Queue
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {tasks.length} tracked
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 py-3 text-center rounded-xl bg-[#05080b]/60 border border-white/8">
                  No tasks queued.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                  {tasks.slice(0, activeFilter === 'tasks' ? 30 : 6).map((task) => {
                    const cancellable = isTaskCancellable(task);
                    const statusUpper = String(task.status || '').toUpperCase();
                    const statusTone =
                      statusUpper === 'COMPLETED'
                        ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                        : statusUpper === 'FAILED'
                          ? 'border-red-500/35 bg-red-500/12 text-red-300'
                          : statusUpper === 'CANCELLED'
                            ? 'border-slate-500/35 bg-slate-500/12 text-slate-400'
                            : 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200';

                    return (
                      <div
                        key={task.id}
                        className="rounded-xl bg-[#05080b]/75 border border-white/8 px-3 py-2.5 flex items-start justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${statusTone}`}
                            >
                              {statusUpper}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 truncate">
                              {task.command_type}
                            </span>
                          </div>
                          <div className="text-xs text-slate-200 mt-1 break-words line-clamp-2">
                            {task.prompt_raw}
                          </div>
                        </div>
                        {cancellable && (
                          <button
                            type="button"
                            onClick={() => handleCancelTask(task.id)}
                            disabled={cancellingId === task.id}
                            title="Cancel task"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-[11px] font-mono shrink-0 transition-colors disabled:opacity-50"
                          >
                            {cancellingId === task.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            Cancel
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 4. Live Telemetry Logs */}
          {showSection('logs') && (
            <section className="rounded-2xl matrix-panel p-4 space-y-3 border border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-300" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-cyan-200">
                    Live Telemetry Logs
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {logs.length} events
                </span>
              </div>

              {logs.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 py-3 text-center rounded-xl bg-[#05080b]/60 border border-white/8">
                  Telemetry stream idle.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5 font-mono text-[11px]">
                  {logs.slice(0, activeFilter === 'logs' ? 25 : 8).map((entry) => {
                    const lvl = String(entry.level || 'INFO').toUpperCase();
                    const lvlClass =
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
                        className="rounded-lg bg-[#05080b]/75 border border-white/8 px-2.5 py-2 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <Activity className={`w-3 h-3 shrink-0 ${lvlClass}`} />
                            <span className={lvlClass}>{lvl}</span>
                            <span className="text-slate-500 truncate">[{entry.source}]</span>
                          </div>
                          <div className="text-slate-200 break-words mt-0.5">{entry.message}</div>
                        </div>
                        <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                          {entry.latency_ms}ms
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* 5. Installed Skills & MCP Tools */}
          {showSection('skills') && (
            <section className="rounded-2xl matrix-panel p-4 space-y-3 border border-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono uppercase tracking-[0.16em] text-emerald-200">
                    Skills & MCP Tools
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {skills.length} skills · {tools.length} tools
                </span>
              </div>

              {loadingSkills ? (
                <div className="text-xs font-mono text-slate-400 py-3 text-center">
                  Loading registered skills &amp; MCP tools...
                </div>
              ) : skills.length === 0 && tools.length === 0 ? (
                <div className="text-xs font-mono text-slate-500 py-3 text-center rounded-xl bg-[#05080b]/60 border border-white/8">
                  No installed skills registered yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                  {skills.slice(0, activeFilter === 'skills' ? 40 : 6).map((skill) => (
                    <div
                      key={skill.slug}
                      className="rounded-xl bg-[#05080b]/75 border border-white/8 px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-emerald-100 truncate">
                          {skill.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {skill.description || skill.slug}
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-300 shrink-0">
                        {skill.version ? `v${skill.version}` : skill.category || 'SKILL'}
                      </span>
                    </div>
                  ))}
                  {activeFilter === 'skills' &&
                    tools.slice(0, 20).map((tool) => (
                      <div
                        key={tool.name}
                        className="rounded-xl bg-[#05080b]/60 border border-cyan-400/15 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-cyan-200 truncate">
                            {tool.name}
                          </div>
                          {tool.description && (
                            <div className="text-[11px] text-slate-400 truncate">
                              {tool.description}
                            </div>
                          )}
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-400/25 text-[10px] font-mono text-cyan-300 shrink-0">
                          MCP
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export default CircuitDrawer;
