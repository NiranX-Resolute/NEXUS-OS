import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  Database,
  Layers,
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
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { MemoryNode } from '../types';

type DrawerSection = 'all' | 'logs' | 'tasks' | 'memory' | 'skills' | 'shield';
type LogLevelFilter = 'ALL' | 'WARN' | 'ERROR';

interface MemoryListResponse {
  success?: boolean;
  memories?: MemoryNode[];
  error?: string;
}

interface MemorySearchResponse {
  success?: boolean;
  query?: string;
  results?: MemoryNode[];
  count?: number;
  error?: string;
}

interface MemoryCreateResponse {
  success?: boolean;
  id?: string;
  error?: string;
}

interface InstalledSkillItem {
  slug: string;
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
  orbiter_group?: string;
  permission_scope?: string[];
}

interface RegisteredToolItem {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
}

interface SkillsStatusResponse {
  success?: boolean;
  skills?: InstalledSkillItem[];
  tools?: RegisteredToolItem[];
  error?: string;
}

interface ShieldFinding {
  severity?: string;
  category?: string;
  message?: string;
  line?: number;
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
  shield?: ShieldStatusResponse;
  error?: string;
}

function isCancellableTaskStatus(status: string): boolean {
  const normalized = status.toUpperCase();
  return (
    normalized === 'PENDING' ||
    normalized === 'QUEUED' ||
    normalized === 'RUNNING' ||
    normalized === 'IN_PROGRESS'
  );
}

function logBadgeClass(level: string): string {
  const upper = level.toUpperCase();
  if (upper === 'ERROR' || upper === 'CRITICAL') {
    return 'border-rose-400/35 bg-rose-500/15 text-rose-300';
  }
  if (upper === 'WARN' || upper === 'WARNING') {
    return 'border-amber-400/35 bg-amber-500/15 text-amber-300';
  }
  if (upper === 'SUCCESS') {
    return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300';
  }
  return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300';
}

function taskBadgeClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED' || upper === 'DONE' || upper === 'SUCCESS') {
    return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300';
  }
  if (upper === 'RUNNING' || upper === 'IN_PROGRESS') {
    return 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200';
  }
  if (upper === 'PENDING' || upper === 'QUEUED') {
    return 'border-amber-400/35 bg-amber-500/15 text-amber-300';
  }
  if (upper === 'CANCELLED' || upper === 'FAILED' || upper === 'ERROR') {
    return 'border-rose-400/35 bg-rose-500/15 text-rose-300';
  }
  return 'border-slate-600/40 bg-slate-800/40 text-slate-300';
}

function formatShortTime(ts: string | number | undefined): string {
  if (ts === undefined || ts === null || ts === '') return '--:--';
  const parsed =
    typeof ts === 'number'
      ? new Date(ts > 1_000_000_000_000 ? ts : ts * 1000)
      : new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    return String(ts).slice(0, 16);
  }
  return parsed.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CircuitDrawer() {
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen);
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const logs = useNexusStore((s) => s.logs);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const cancelTask = useNexusStore((s) => s.cancelTask);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [section, setSection] = useState<DrawerSection>('all');
  const [logLevelFilter, setLogLevelFilter] = useState<LogLevelFilter>('ALL');

  const [memoryQuery, setMemoryQuery] = useState('');
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [skills, setSkills] = useState<InstalledSkillItem[]>([]);
  const [tools, setTools] = useState<RegisteredToolItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  const [shield, setShield] = useState<ShieldStatusResponse | null>(null);
  const [shieldLoading, setShieldLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);

  const loadMemories = useCallback(async (q: string) => {
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const trimmed = q.trim();
      if (trimmed) {
        const res = await ipcJson<MemorySearchResponse>(
          `/api/memory/search?q=${encodeURIComponent(trimmed)}&limit=8`
        );
        if (res.success === false) {
          setMemoryError(res.error || 'Memory FTS5 query failed');
          return;
        }
        setMemories(Array.isArray(res.results) ? res.results : []);
      } else {
        const res = await ipcJson<MemoryListResponse>('/api/memory?limit=6');
        if (res.success === false) {
          setMemoryError(res.error || 'Failed reading memory nodes');
          return;
        }
        setMemories(Array.isArray(res.memories) ? res.memories : []);
      }
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Memory endpoint unreachable');
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await ipcJson<SkillsStatusResponse>('/api/skills');
      if (Array.isArray(res.skills)) setSkills(res.skills);
      if (Array.isArray(res.tools)) setTools(res.tools);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading skills status', 'error');
    } finally {
      setSkillsLoading(false);
    }
  }, [pushToast]);

  const loadShield = useCallback(async () => {
    setShieldLoading(true);
    try {
      const res = await ipcJson<ShieldStatusResponse>('/api/security/shield-status');
      setShield(res);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading Workspace Shield', 'error');
    } finally {
      setShieldLoading(false);
    }
  }, [pushToast]);

  const syncDrawerData = useCallback(async () => {
    await Promise.allSettled([
      refreshAll(),
      loadMemories(memoryQuery),
      loadSkills(),
      loadShield(),
    ]);
  }, [loadMemories, loadShield, loadSkills, memoryQuery, refreshAll]);

  useEffect(() => {
    if (!drawerOpen) return;
    void syncDrawerData();
  }, [drawerOpen, syncDrawerData]);

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

  const handleMemorySearch = (e: FormEvent) => {
    e.preventDefault();
    void loadMemories(memoryQuery);
  };

  const handleSaveQuickMemory = async (e: FormEvent) => {
    e.preventDefault();
    const title = noteTitle.trim();
    const content = noteContent.trim();
    if (!title || !content) {
      pushToast('Title and content are required to store memory', 'warn');
      return;
    }
    setSavingNote(true);
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: telemetry.workspaceMode || 'DEV',
          metadata: { source: 'nexus-v2-cockpit', origin: 'circuit-drawer' },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed saving memory node', 'error');
        return;
      }
      setNoteTitle('');
      setNoteContent('');
      setQuickNoteOpen(false);
      pushToast(`Stored "${title}" in SQLite FTS5 memory`, 'success');
      void loadMemories(memoryQuery);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory write failed', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast(res.error || 'Security audit failed', 'error');
        return;
      }
      if (res.shield) {
        setShield(res.shield);
      } else {
        await loadShield();
      }
      pushToast('Workspace Shield audit completed', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Audit endpoint unreachable', 'error');
    } finally {
      setAuditRunning(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (logLevelFilter === 'ALL') return logs;
    return logs.filter((entry) => {
      const lvl = entry.level.toUpperCase();
      if (logLevelFilter === 'ERROR') {
        return lvl === 'ERROR' || lvl === 'CRITICAL';
      }
      return lvl === 'WARN' || lvl === 'WARNING' || lvl === 'ERROR' || lvl === 'CRITICAL';
    });
  }, [logLevelFilter, logs]);

  if (!drawerOpen) {
    return null;
  }

  const showSection = (target: Exclude<DrawerSection, 'all'>) =>
    section === 'all' || section === target;

  const shieldScore = typeof shield?.score === 'number' ? shield.score : null;
  const shieldHealthy =
    shield?.status?.toUpperCase() === 'PASS' ||
    shield?.status?.toUpperCase() === 'SECURE' ||
    shield?.status?.toUpperCase() === 'NOMINAL' ||
    (shieldScore !== null && shieldScore >= 80);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Subtle Backdrop */}
      <div
        className="fixed inset-0 bg-[#030710]/60 backdrop-blur-[2px]"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over Right Inspector */}
      <aside
        className="relative z-10 h-full w-full max-w-[470px] aether-glass border-l border-cyan-400/30 bg-[#07101f]/95 flex flex-col shadow-[-20px_0_60px_rgba(2,6,16,0.8)]"
        role="complementary"
        aria-label="Circuit & Telemetry Inspector"
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-cyan-500/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl border border-cyan-400/35 bg-cyan-500/15 flex items-center justify-center text-cyan-300">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                Circuit &amp; Telemetry Inspector
              </h2>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {telemetry.wsConnected ? 'WS LIVE' : 'HTTP POLL'} • {telemetry.workspaceMode} •{' '}
                {telemetry.latencyMs}ms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void syncDrawerData()}
              title="Refresh Inspector"
              className="p-2 rounded-lg border border-slate-700/70 bg-[#050a14]/75 text-slate-300 hover:border-cyan-400/45 hover:text-cyan-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              title="Close Inspector (Esc)"
              className="p-2 rounded-lg border border-slate-700/70 bg-[#050a14]/75 text-slate-300 hover:border-rose-400/45 hover:text-rose-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Section Filter Strip */}
        <div className="px-5 py-2.5 border-b border-cyan-500/15 bg-[#050a14]/65 flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'shield', label: 'Shield' },
              { id: 'memory', label: 'Memory' },
              { id: 'tasks', label: `Tasks (${tasks.length})` },
              { id: 'logs', label: `Logs (${logs.length})` },
              { id: 'skills', label: `Skills (${skills.length})` },
            ] as const
          ).map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors border ${
                  active
                    ? 'border-cyan-400/45 bg-cyan-500/20 text-cyan-200'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Inspector Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Workspace Shield */}
          {showSection('shield') && (
            <section className="aether-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {shieldHealthy ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  )}
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Workspace Shield
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={auditRunning}
                  onClick={() => void handleRunAudit()}
                  className="px-2.5 py-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 text-[11px] font-mono text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {auditRunning ? 'Auditing...' : 'Run Audit'}
                </button>
              </div>

              {shieldLoading && !shield ? (
                <p className="text-xs text-slate-400 font-mono">Reading AgentShield status...</p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="rounded-lg bg-[#050a14]/80 border border-slate-800/90 px-2.5 py-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Score</div>
                    <div
                      className={`text-sm font-bold font-mono mt-0.5 ${
                        shieldHealthy ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {shieldScore !== null ? `${shieldScore}/100` : '--'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#050a14]/80 border border-slate-800/90 px-2.5 py-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Posture</div>
                    <div className="text-xs font-semibold font-mono text-slate-100 mt-1 truncate">
                      {shield?.status || telemetry.securityState}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#050a14]/80 border border-slate-800/90 px-2.5 py-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase">Findings</div>
                    <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
                      {shield?.findings_count ?? 0}
                    </div>
                  </div>
                </div>
              )}

              {Array.isArray(shield?.quarantined_plugins) && shield.quarantined_plugins.length > 0 && (
                <div className="text-[11px] font-mono text-amber-300 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-1.5">
                  Quarantined plugins: {shield.quarantined_plugins.join(', ')}
                </div>
              )}
            </section>
          )}

          {/* 2. Memory FTS5 Quick Query */}
          {showSection('memory') && (
            <section className="aether-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Memory FTS5 Quick Query
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickNoteOpen((v) => !v)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {quickNoteOpen ? 'Cancel' : 'Store'}
                </button>
              </div>

              <form onSubmit={handleMemorySearch} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={memoryQuery}
                    onChange={(e) => setMemoryQuery(e.target.value)}
                    placeholder="Query SQLite FTS5 memory..."
                    aria-label="Memory FTS5 search query"
                    className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#050a14]/85 border border-slate-700/70 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={memoryLoading}
                  className="px-3 py-2 rounded-lg border border-cyan-400/35 bg-cyan-500/15 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors"
                >
                  {memoryLoading ? '...' : 'Query'}
                </button>
              </form>

              {quickNoteOpen && (
                <form
                  onSubmit={handleSaveQuickMemory}
                  className="rounded-lg bg-[#050a14]/80 border border-cyan-500/25 p-3 space-y-2"
                >
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Memory title..."
                    className="w-full px-2.5 py-1.5 rounded-md bg-[#091322] border border-slate-700/70 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
                  />
                  <textarea
                    rows={2}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Fact, decision, or telemetry note..."
                    className="w-full px-2.5 py-1.5 rounded-md bg-[#091322] border border-slate-700/70 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNote}
                      className="px-3 py-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {savingNote ? 'Saving...' : 'Commit to WAL'}
                    </button>
                  </div>
                </form>
              )}

              {memoryError ? (
                <p className="text-xs text-rose-300 font-mono">{memoryError}</p>
              ) : memories.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">
                  {memoryLoading ? 'Searching FTS5 index...' : 'No memory nodes matched.'}
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {memories.map((node) => (
                    <div
                      key={node.id}
                      className="rounded-lg bg-[#050a14]/75 border border-slate-800/90 px-3 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-100 truncate">
                          {node.title || 'Untitled node'}
                        </span>
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
                          {node.namespace || 'DEV'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{node.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Task Queue */}
          {showSection('tasks') && (
            <section className="aether-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Task Queue
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {tasks.length} tracked
                </span>
              </div>

              {tasks.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">No tasks queued in WAL.</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {tasks.slice(0, 12).map((task) => {
                    const cancellable = isCancellableTaskStatus(task.status);
                    return (
                      <div
                        key={task.id}
                        className="rounded-lg bg-[#050a14]/75 border border-slate-800/90 px-3 py-2 flex items-start justify-between gap-2.5"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${taskBadgeClass(
                                task.status
                              )}`}
                            >
                              {task.status}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {task.source_device || 'cockpit'} • {formatShortTime(task.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-200 truncate" title={task.prompt_raw}>
                            {task.prompt_raw}
                          </p>
                        </div>

                        {cancellable && (
                          <button
                            type="button"
                            onClick={() => void cancelTask(task.id)}
                            title="Cancel Task"
                            className="shrink-0 p-1 rounded-md text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/15 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
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
            <section className="aether-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Live Telemetry Logs
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  {(['ALL', 'WARN', 'ERROR'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLogLevelFilter(lvl)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                        logLevelFilter === lvl
                          ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">No matching telemetry logs.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 font-mono">
                  {filteredLogs.slice(0, 25).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg bg-[#050a14]/85 border border-slate-800/80 px-2.5 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded border uppercase ${logBadgeClass(
                              entry.level
                            )}`}
                          >
                            {entry.level}
                          </span>
                          <span className="text-cyan-300/90 truncate">{entry.source}</span>
                        </div>
                        <span className="text-slate-500 shrink-0">
                          {formatShortTime(entry.created_at)}
                          {typeof entry.latency_ms === 'number' ? ` • ${entry.latency_ms}ms` : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 break-words leading-snug">
                        {entry.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 5. Skills Status */}
          {showSection('skills') && (
            <section className="aether-panel rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                    Skills &amp; MCP Tools
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {skills.length} skills • {tools.length} tools
                </span>
              </div>

              {skillsLoading && skills.length === 0 && tools.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">Loading skill registry...</p>
              ) : skills.length === 0 && tools.length === 0 ? (
                <p className="text-xs text-slate-500 font-mono">
                  No skills or MCP tools currently registered.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {skills.map((skill) => (
                    <div
                      key={skill.slug}
                      className="rounded-lg bg-[#050a14]/75 border border-slate-800/90 px-3 py-2 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-100 truncate">
                          {skill.name || skill.slug}
                        </div>
                        {skill.description && (
                          <p className="text-[11px] text-slate-400 truncate">{skill.description}</p>
                        )}
                      </div>
                      <span className="shrink-0 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                        {skill.version ? `v${skill.version}` : skill.category || 'ACTIVE'}
                      </span>
                    </div>
                  ))}

                  {skills.length === 0 &&
                    tools.slice(0, 8).map((tool) => (
                      <div
                        key={tool.name}
                        className="rounded-lg bg-[#050a14]/75 border border-slate-800/90 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-slate-100 truncate">
                            {tool.name}
                          </div>
                          {tool.description && (
                            <p className="text-[11px] text-slate-400 truncate">{tool.description}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300">
                          {tool.agent || 'MCP'}
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
