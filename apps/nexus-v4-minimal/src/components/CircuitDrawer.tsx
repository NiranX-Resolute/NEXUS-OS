import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { MemoryNode } from '../types';

type InspectorTab = 'shield' | 'memory' | 'tasks' | 'logs' | 'skills';

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

interface SkillEntry {
  slug: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
  orbiter_group?: string;
  permission_scope?: string[];
}

interface McpToolEntry {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
}

interface SkillsPayload {
  success?: boolean;
  skills?: SkillEntry[];
  tools?: McpToolEntry[];
  error?: string;
}

const ACTIVE_TASK_STATUSES = new Set(['QUEUED', 'IN_PROGRESS', 'RUNNING']);

function formatTimestamp(raw?: number | string | null): string {
  if (!raw) return '—';
  const num = typeof raw === 'number' ? raw : Number(raw);
  const d =
    Number.isFinite(num) && num > 0
      ? new Date(num > 1e12 ? num : num * 1000)
      : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatUptime(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function CircuitDrawer() {
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen);
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const logs = useNexusStore((s) => s.logs);
  const isOnline = useNexusStore((s) => s.isOnline);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const cancelTask = useNexusStore((s) => s.cancelTask);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<InspectorTab>('shield');
  const [refreshing, setRefreshing] = useState(false);

  // Workspace Shield
  const [shield, setShield] = useState<ShieldStatusPayload | null>(null);
  const [shieldLoading, setShieldLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);

  // Memory FTS5 Quick Lookup & Capture
  const [memoryQuery, setMemoryQuery] = useState('');
  const [activeMemoryTerm, setActiveMemoryTerm] = useState('');
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNamespace, setNewNamespace] = useState('DEV');
  const [newContent, setNewContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  // Tasks & Logs filters
  const [taskFilter, setTaskFilter] = useState<'all' | 'active'>('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'WARN+' | 'ERROR'>('ALL');

  // Skills & MCP tools
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState('');

  const loadShieldStatus = useCallback(async () => {
    setShieldLoading(true);
    try {
      const res = await ipcJson<ShieldStatusPayload>('/api/security/shield-status');
      setShield(res);
    } catch {
      // Handled via offline banner / status display
    } finally {
      setShieldLoading(false);
    }
  }, []);

  const loadMemories = useCallback(async (queryTerm?: string) => {
    const clean = (queryTerm !== undefined ? queryTerm : activeMemoryTerm).trim();
    setMemoryLoading(true);
    try {
      if (clean) {
        const res = await ipcJson<{ results?: MemoryNode[] }>(
          `/api/memory/search?q=${encodeURIComponent(clean)}&limit=20`
        );
        setMemories(Array.isArray(res.results) ? res.results : []);
      } else {
        const res = await ipcJson<{ memories?: MemoryNode[] }>('/api/memory?limit=15');
        setMemories(Array.isArray(res.memories) ? res.memories : []);
      }
    } catch {
      setMemories([]);
    } finally {
      setMemoryLoading(false);
    }
  }, [activeMemoryTerm]);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await ipcJson<SkillsPayload>('/api/skills');
      if (Array.isArray(res.skills)) setSkills(res.skills);
      if (Array.isArray(res.tools)) setMcpTools(res.tools);
    } catch {
      // Preserve prior list if offline
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const refreshInspector = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        refreshAll(),
        loadShieldStatus(),
        loadMemories(),
        loadSkills(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadMemories, loadShieldStatus, loadSkills, refreshAll]);

  useEffect(() => {
    if (!drawerOpen) return;
    void refreshInspector();
  }, [drawerOpen, refreshInspector]);

  useEffect(() => {
    if (!drawerOpen || commandPaletteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, drawerOpen, setDrawerOpen]);

  const handleRunAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await ipcJson<AuditRunPayload>('/api/audit/run', { method: 'POST' });
      if (res.shield) {
        setShield(res.shield);
      }
      if (res.success) {
        const scorePart =
          typeof res.shield?.score === 'number' ? ` (${res.shield.score}/100)` : '';
        pushToast(`ScopeGuard + AgentShield audit passed${scorePart}`, 'success');
        void refreshAll();
      } else {
        pushToast(res.error || 'Security audit failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Audit request failed', 'error');
    } finally {
      setAuditRunning(false);
    }
  };

  const handleSearchMemory = async (e: FormEvent) => {
    e.preventDefault();
    const clean = memoryQuery.trim();
    setActiveMemoryTerm(clean);
    await loadMemories(clean);
  };

  const handleStoreMemory = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const content = newContent.trim();
    const namespace = newNamespace.trim() || 'DEV';
    if (!title || !content) {
      pushToast('Memory title and content are required', 'warn');
      return;
    }

    setSavingMemory(true);
    try {
      const res = await ipcJson<{ id?: string }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ title, content, namespace }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to store memory node', 'error');
        return;
      }
      setNewTitle('');
      setNewContent('');
      setCaptureOpen(false);
      pushToast(`Stored memory node "${title}"`, 'success');
      await loadMemories();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory write failed', 'error');
    } finally {
      setSavingMemory(false);
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

  const activeTasksCount = useMemo(
    () => tasks.filter((t) => ACTIVE_TASK_STATUSES.has(t.status)).length,
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    if (taskFilter === 'active') {
      return tasks.filter((t) => ACTIVE_TASK_STATUSES.has(t.status));
    }
    return tasks;
  }, [taskFilter, tasks]);

  const visibleLogs = useMemo(() => {
    if (logLevelFilter === 'ALL') return logs;
    if (logLevelFilter === 'ERROR') {
      return logs.filter((entry) => {
        const lvl = entry.level.toUpperCase();
        return lvl === 'ERROR' || lvl === 'CRITICAL';
      });
    }
    return logs.filter((entry) => {
      const lvl = entry.level.toUpperCase();
      return lvl === 'WARN' || lvl === 'WARNING' || lvl === 'ERROR' || lvl === 'CRITICAL';
    });
  }, [logLevelFilter, logs]);

  const filteredSkills = useMemo(() => {
    const q = skillsQuery.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.slug, s.category, s.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [skills, skillsQuery]);

  const filteredTools = useMemo(() => {
    const q = skillsQuery.trim().toLowerCase();
    if (!q) return mcpTools;
    return mcpTools.filter((t) =>
      [t.name, t.agent, t.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [mcpTools, skillsQuery]);

  if (!drawerOpen) {
    return null;
  }

  const tabs: Array<{ id: InspectorTab; label: string; count?: number }> = [
    { id: 'shield', label: 'Shield' },
    { id: 'memory', label: 'Memory' },
    { id: 'tasks', label: 'Tasks', count: activeTasksCount || tasks.length },
    { id: 'logs', label: 'Logs', count: logs.length },
    { id: 'skills', label: 'Skills', count: skills.length },
  ];

  const shieldScore = typeof shield?.score === 'number' ? shield.score : null;
  const shieldHealthy =
    !telemetry.estopActive &&
    telemetry.securityState === 'NOMINAL' &&
    (shieldScore === null || shieldScore >= 80);

  return (
    <div
      className="electron-no-drag fixed inset-0 z-40 flex justify-end bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setDrawerOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Circuit Inspector Drawer"
    >
      <aside className="flex h-full w-[440px] max-w-[94vw] flex-col border-l border-white/[0.08] bg-[#0e1014] text-zinc-100 shadow-2xl">
        {/* Drawer Header */}
        <header className="monograph-hairline-b flex h-[48px] shrink-0 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-[13.5px] font-medium tracking-[-0.01em] text-zinc-100">
              Circuit Inspector
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider tabular-nums ${
                telemetry.wsConnected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
            >
              {telemetry.wsConnected ? 'WS LIVE' : isOnline ? 'HTTP' : 'OFFLINE'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refreshInspector()}
              disabled={refreshing}
              title="Refresh Inspector"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#090a0c] text-zinc-400 transition hover:text-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              title="Close Inspector (Esc)"
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#090a0c] text-zinc-400 transition hover:text-zinc-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Minimal Sub-Navigation Tabs */}
        <nav className="monograph-hairline-b flex shrink-0 items-center gap-1 px-3 py-2">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  active
                    ? 'border border-white/[0.1] bg-[#13161c] text-zinc-100'
                    : 'border border-transparent text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab Viewport */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeTab === 'shield' && (
            <div className="space-y-4">
              <section className="rounded-lg border border-white/[0.08] bg-[#090a0c] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {shieldHealthy ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                    )}
                    <div>
                      <div className="text-[13px] font-medium text-zinc-100">
                        Workspace Shield
                      </div>
                      <div className="text-[11.5px] text-zinc-500">
                        ScopeGuard + AgentShield posture
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunAudit()}
                    disabled={auditRunning}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {auditRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3 w-3" />
                    )}
                    <span>Run Audit</span>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-md border border-white/[0.06] bg-[#0e1014] p-2.5">
                    <div className="text-[10.5px] text-zinc-500">Shield Score</div>
                    <div className="mt-0.5 font-mono text-sm font-medium text-zinc-100 tabular-nums">
                      {shieldLoading ? '…' : shieldScore !== null ? `${shieldScore} / 100` : '—'}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/[0.06] bg-[#0e1014] p-2.5">
                    <div className="text-[10.5px] text-zinc-500">Posture</div>
                    <div className="mt-0.5 font-mono text-sm font-medium text-zinc-100">
                      {shield?.status || telemetry.securityState}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/[0.06] bg-[#0e1014] p-2.5">
                    <div className="text-[10.5px] text-zinc-500">Findings</div>
                    <div className="mt-0.5 font-mono text-sm font-medium text-zinc-100 tabular-nums">
                      {typeof shield?.findings_count === 'number' ? shield.findings_count : 0}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/[0.06] bg-[#0e1014] p-2.5">
                    <div className="text-[10.5px] text-zinc-500">Last Scan</div>
                    <div className="mt-0.5 font-mono text-[11.5px] text-zinc-300 tabular-nums">
                      {formatTimestamp(shield?.scanned_at)}
                    </div>
                  </div>
                </div>

                {Array.isArray(shield?.quarantined_plugins) &&
                shield.quarantined_plugins.length > 0 ? (
                  <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/5 p-2.5">
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300">
                      Quarantined Plugins ({shield.quarantined_plugins.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {shield.quarantined_plugins.map((plugin) => (
                        <span
                          key={plugin}
                          className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-200"
                        >
                          {plugin}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-[11.5px] text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>Zero quarantined plugins detected</span>
                  </div>
                )}
              </section>

              {/* Live Telemetry Strip */}
              <section className="rounded-lg border border-white/[0.08] bg-[#090a0c] p-4">
                <div className="mb-3 font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
                  Runtime Telemetry
                </div>
                <div className="space-y-2 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Workspace Mode</span>
                    <span className="font-mono text-zinc-100">{telemetry.workspaceMode}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">CPU Utilization</span>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {telemetry.cpuUsage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">RAM Utilization</span>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {typeof telemetry.ramPercent === 'number'
                        ? `${telemetry.ramPercent.toFixed(1)}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Active Agents / Slices</span>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {telemetry.activeAgents} / {telemetry.activeSlices ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Gateway Uptime</span>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {formatUptime(telemetry.uptimeSecs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">IPC Latency</span>
                    <span className="font-mono text-zinc-100 tabular-nums">
                      {telemetry.latencyMs ? `${telemetry.latencyMs} ms` : '—'}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-3">
              {/* FTS5 Search Bar */}
              <form onSubmit={handleSearchMemory} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={memoryQuery}
                    onChange={(e) => setMemoryQuery(e.target.value)}
                    placeholder="FTS5 semantic lookup…"
                    className="h-8 w-full rounded-md border border-white/[0.08] bg-[#090a0c] pl-8 pr-3 text-[12.5px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="h-8 rounded-md border border-white/[0.08] bg-[#13161c] px-2.5 text-[12px] font-medium text-zinc-200 transition hover:bg-white/[0.08]"
                >
                  Find
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureOpen((prev) => !prev)}
                  title="Store Memory Node"
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                    captureOpen
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/[0.08] bg-[#090a0c] text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>

              {captureOpen && (
                <form
                  onSubmit={handleStoreMemory}
                  className="space-y-2.5 rounded-lg border border-white/[0.08] bg-[#090a0c] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                      Store Memory Node
                    </span>
                    <select
                      value={newNamespace}
                      onChange={(e) => setNewNamespace(e.target.value)}
                      className="rounded border border-white/[0.08] bg-[#0e1014] px-2 py-0.5 font-mono text-[11px] text-zinc-300 focus:outline-none"
                    >
                      <option value="DEV">DEV</option>
                      <option value="STUDY">STUDY</option>
                      <option value="STUDIO">STUDIO</option>
                      <option value="RESEARCH">RESEARCH</option>
                      <option value="SYSTEM">SYSTEM</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Node title…"
                    className="h-8 w-full rounded border border-white/[0.08] bg-[#0e1014] px-2.5 text-[12.5px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/40 focus:outline-none"
                  />
                  <textarea
                    rows={3}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Fact, architecture note, or decision…"
                    className="w-full resize-none rounded border border-white/[0.08] bg-[#0e1014] p-2.5 text-[12px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/40 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCaptureOpen(false)}
                      className="rounded border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingMemory}
                      className="inline-flex items-center gap-1.5 rounded border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-[11.5px] font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {savingMemory && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>Commit</span>
                    </button>
                  </div>
                </form>
              )}

              {activeMemoryTerm && (
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>
                    FTS5 matches for <span className="font-mono text-zinc-300">{activeMemoryTerm}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMemoryQuery('');
                      setActiveMemoryTerm('');
                      void loadMemories('');
                    }}
                    className="text-emerald-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}

              {memoryLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Querying FTS5 index…</span>
                </div>
              ) : memories.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0c] p-6 text-center text-xs text-zinc-500">
                  <BookOpen className="mx-auto mb-2 h-4 w-4 text-zinc-600" />
                  No memory nodes matched.
                </div>
              ) : (
                <div className="space-y-2">
                  {memories.map((node) => (
                    <article
                      key={node.id}
                      className="rounded-lg border border-white/[0.08] bg-[#090a0c] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-[12.5px] font-medium text-zinc-100">
                          {node.title}
                        </h3>
                        <span className="shrink-0 rounded border border-white/[0.08] bg-[#0e1014] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                          {node.namespace}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-zinc-400">
                        {node.content}
                      </p>
                      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-zinc-500 tabular-nums">
                        <span>{formatTimestamp(node.updated_at)}</span>
                        {typeof node.score === 'number' && (
                          <span className="text-emerald-400">score {node.score.toFixed(2)}</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {(['all', 'active'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTaskFilter(mode)}
                      className={`rounded px-2 py-1 font-mono text-[11px] uppercase transition ${
                        taskFilter === mode
                          ? 'border border-white/[0.1] bg-[#13161c] text-zinc-100'
                          : 'border border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {mode === 'all' ? `All (${tasks.length})` : `Active (${activeTasksCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {visibleTasks.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0c] p-6 text-center text-xs text-zinc-500">
                  <ListChecks className="mx-auto mb-2 h-4 w-4 text-zinc-600" />
                  Task queue is clear.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleTasks.map((task) => {
                    const isActive = ACTIVE_TASK_STATUSES.has(task.status);
                    const isCancelling = cancellingId === task.id;
                    return (
                      <div
                        key={task.id}
                        className="rounded-lg border border-white/[0.08] bg-[#090a0c] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-400">
                            {task.command_type}
                          </span>
                          <span
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                              isActive
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                : task.status === 'FAILED'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : 'border-white/[0.08] bg-[#0e1014] text-zinc-400'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[12px] text-zinc-200">
                          {task.prompt_raw}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                            {formatTimestamp(task.created_at)}
                          </span>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => void handleCancelTask(task.id)}
                              disabled={isCancelling}
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                            >
                              {isCancelling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                              <span>Cancel</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                {(['ALL', 'WARN+', 'ERROR'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLogLevelFilter(lvl)}
                    className={`rounded px-2 py-1 font-mono text-[11px] transition ${
                      logLevelFilter === lvl
                        ? 'border border-white/[0.1] bg-[#13161c] text-zinc-100'
                        : 'border border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              {visibleLogs.length === 0 ? (
                <div className="rounded-lg border border-white/[0.06] bg-[#090a0c] p-6 text-center text-xs text-zinc-500">
                  <Terminal className="mx-auto mb-2 h-4 w-4 text-zinc-600" />
                  No telemetry log entries matching filter.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {visibleLogs.map((entry) => {
                    const level = entry.level.toUpperCase();
                    const levelColor =
                      level === 'ERROR' || level === 'CRITICAL'
                        ? 'text-red-400'
                        : level === 'WARN' || level === 'WARNING'
                        ? 'text-amber-400'
                        : level === 'SUCCESS'
                        ? 'text-emerald-400'
                        : 'text-zinc-400';

                    return (
                      <div
                        key={entry.id}
                        className="rounded border border-white/[0.06] bg-[#090a0c] px-2.5 py-2 font-mono text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <span className={levelColor}>{level}</span>
                            <span className="truncate text-zinc-400">{entry.source}</span>
                          </div>
                          <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                            {typeof entry.latency_ms === 'number'
                              ? `${entry.latency_ms}ms · `
                              : ''}
                            {formatTimestamp(entry.created_at)}
                          </span>
                        </div>
                        <div className="mt-1 break-words text-[11.5px] leading-snug text-zinc-200">
                          {entry.message}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'skills' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={skillsQuery}
                  onChange={(e) => setSkillsQuery(e.target.value)}
                  placeholder="Filter installed skills & MCP tools…"
                  className="h-8 w-full rounded-md border border-white/[0.08] bg-[#090a0c] pl-8 pr-3 text-[12.5px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>

              {skillsLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading skills registry…</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <section>
                    <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
                      <span>Installed Skills ({filteredSkills.length})</span>
                    </div>
                    {filteredSkills.length === 0 ? (
                      <div className="rounded-lg border border-white/[0.06] bg-[#090a0c] p-4 text-center text-xs text-zinc-500">
                        No installed skills found.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredSkills.map((skill) => (
                          <div
                            key={skill.slug}
                            className="rounded-lg border border-white/[0.08] bg-[#090a0c] p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[12.5px] font-medium text-zinc-100">
                                {skill.name}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] text-emerald-400">
                                {skill.version ? `v${skill.version}` : skill.category || 'skill'}
                              </span>
                            </div>
                            {skill.description && (
                              <p className="mt-1 line-clamp-2 text-[11.5px] text-zinc-400">
                                {skill.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
                      <span>MCP Tools ({filteredTools.length})</span>
                    </div>
                    {filteredTools.length === 0 ? (
                      <div className="rounded-lg border border-white/[0.06] bg-[#090a0c] p-4 text-center text-xs text-zinc-500">
                        <Wrench className="mx-auto mb-1.5 h-3.5 w-3.5 text-zinc-600" />
                        No MCP tools registered.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {filteredTools.map((tool) => (
                          <div
                            key={tool.name}
                            className="rounded border border-white/[0.06] bg-[#090a0c] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-[11.5px] text-zinc-200">
                                {tool.name}
                              </span>
                              {tool.requires_approval && (
                                <span className="shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] text-amber-300">
                                  APPROVAL
                                </span>
                              )}
                            </div>
                            {tool.description && (
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                                {tool.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default CircuitDrawer;
