import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  ListChecks,
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
import type { LogEntry, MemoryNode, TaskItem } from '@/types';

type InspectorTab = 'shield' | 'memory' | 'tasks' | 'logs' | 'skills';

interface ShieldFindingItem {
  severity?: string;
  category?: string;
  message?: string;
  file?: string;
  line?: number;
}

interface ShieldStatusPayload {
  success?: boolean;
  has_audit?: boolean;
  audit_id?: string;
  scanned_at?: string;
  score?: number;
  status?: string;
  target_path?: string;
  findings_count?: number;
  quarantined_plugins?: string[];
  findings?: ShieldFindingItem[];
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
  error?: string;
}

interface MemorySearchResponse {
  success?: boolean;
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

interface InstalledSkillItem {
  slug: string;
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  permission_scope?: string[];
}

interface McpToolItem {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
}

interface SkillsResponse {
  success?: boolean;
  skills?: InstalledSkillItem[];
  tools?: McpToolItem[];
  error?: string;
}

const ACTIVE_TASK_STATUSES = new Set(['QUEUED', 'RUNNING', 'IN_PROGRESS', 'PENDING']);

function formatCompactTime(raw: string | undefined | null): string {
  if (!raw) return '—';
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function logBadgeClass(level: string): string {
  const upper = level.toUpperCase();
  if (upper === 'ERROR' || upper === 'CRITICAL') {
    return 'border-red-500/40 bg-red-500/12 text-red-300';
  }
  if (upper === 'WARN' || upper === 'WARNING') {
    return 'border-amber-500/40 bg-amber-500/12 text-amber-300';
  }
  if (upper === 'SUCCESS') {
    return 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300';
  }
  return 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]';
}

function taskStatusClass(status: string): string {
  const upper = status.toUpperCase();
  if (upper === 'COMPLETED') return 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300';
  if (upper === 'FAILED') return 'border-red-500/40 bg-red-500/12 text-red-300';
  if (upper === 'CANCELLED') return 'border-slate-500/40 bg-slate-500/12 text-slate-300';
  return 'border-amber-500/40 bg-amber-500/12 text-amber-300';
}

export function CircuitDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    commandPaletteOpen,
    telemetry,
    tasks,
    logs,
    isOnline,
    refreshAll,
    cancelTask,
    pushToast,
  } = useNexusStore();

  const [activeTab, setActiveTab] = useState<InspectorTab>('shield');

  // Workspace Shield state
  const [shield, setShield] = useState<ShieldStatusPayload | null>(null);
  const [shieldLoading, setShieldLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);

  // Memory FTS5 Quick Lookup state
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryNodes, setMemoryNodes] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [expandedMemoryId, setExpandedMemoryId] = useState<string | null>(null);
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNamespace, setNewNamespace] = useState('DEV');
  const [newContent, setNewContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  // Task & Log Filters
  const [taskFilter, setTaskFilter] = useState<'all' | 'active'>('all');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Skills state
  const [skills, setSkills] = useState<InstalledSkillItem[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState('');
  const [skillsView, setSkillsView] = useState<'skills' | 'tools'>('skills');

  const loadShieldStatus = useCallback(async () => {
    setShieldLoading(true);
    try {
      const res = await ipcJson<ShieldStatusPayload>('/api/security/shield-status');
      setShield(res);
    } catch (err) {
      setShield({
        success: false,
        error: err instanceof Error ? err.message : 'Unable to reach /api/security/shield-status',
      });
    } finally {
      setShieldLoading(false);
    }
  }, []);

  const searchMemory = useCallback(async (queryText: string) => {
    const clean = queryText.trim();
    setMemoryLoading(true);
    try {
      if (clean) {
        const res = await ipcJson<MemorySearchResponse>(
          `/api/memory/search?q=${encodeURIComponent(clean)}&limit=20`
        );
        setMemoryNodes(Array.isArray(res.results) ? res.results : []);
      } else {
        const res = await ipcJson<MemorySearchResponse>('/api/memory?limit=15');
        setMemoryNodes(Array.isArray(res.memories) ? res.memories : []);
      }
    } catch {
      setMemoryNodes([]);
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await ipcJson<SkillsResponse>('/api/skills');
      setSkills(Array.isArray(res.skills) ? res.skills : []);
      setMcpTools(Array.isArray(res.tools) ? res.tools : []);
    } catch {
      setSkills([]);
      setMcpTools([]);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const syncAllDrawerData = useCallback(async () => {
    await Promise.allSettled([
      refreshAll(),
      loadShieldStatus(),
      searchMemory(memoryQuery),
      loadSkills(),
    ]);
  }, [loadShieldStatus, loadSkills, memoryQuery, refreshAll, searchMemory]);

  useEffect(() => {
    if (!drawerOpen) return;
    void loadShieldStatus();
    void searchMemory(memoryQuery);
    void loadSkills();
    // Refresh telemetry snapshot whenever drawer opens
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || commandPaletteOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, drawerOpen, setDrawerOpen]);

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
      const score = res.shield?.score ?? res.score ?? 100;
      pushToast({
        title: res.success === false ? 'Security Audit Alert' : 'AgentShield Audit Passed',
        message: res.error ?? `Score: ${score}/100`,
        tone: res.success === false ? 'warning' : 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Audit Request Failed',
        message: err instanceof Error ? err.message : 'Unable to reach /api/audit/run',
        tone: 'error',
      });
    } finally {
      setAuditRunning(false);
    }
  };

  const handleMemorySearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void searchMemory(memoryQuery);
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    const content = newContent.trim();
    const namespace = newNamespace.trim() || telemetry.workspaceMode || 'DEV';
    if (!title || !content || savingMemory) return;

    setSavingMemory(true);
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace,
          metadata: { source: 'circuit_drawer' },
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Memory Store Rejected',
          message: res.error ?? 'Unable to persist memory node.',
          tone: 'error',
        });
        return;
      }
      setNewTitle('');
      setNewContent('');
      setShowMemoryForm(false);
      pushToast({
        title: 'Memory Node Stored',
        message: `${title} indexed in FTS5 (${namespace}).`,
        tone: 'success',
      });
      await searchMemory(memoryQuery);
    } catch (err) {
      pushToast({
        title: 'Memory Write Failed',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setSavingMemory(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    if (cancellingId) return;
    setCancellingId(taskId);
    try {
      await cancelTask(taskId);
    } finally {
      setCancellingId(null);
    }
  };

  const activeTaskCount = useMemo(
    () => tasks.filter((t) => ACTIVE_TASK_STATUSES.has(String(t.status).toUpperCase())).length,
    [tasks]
  );

  const visibleTasks = useMemo<TaskItem[]>(() => {
    if (taskFilter === 'active') {
      return tasks.filter((t) => ACTIVE_TASK_STATUSES.has(String(t.status).toUpperCase()));
    }
    return tasks;
  }, [taskFilter, tasks]);

  const visibleLogs = useMemo<LogEntry[]>(() => {
    if (logLevelFilter === 'ALL') return logs;
    return logs.filter((entry) => {
      const lvl = String(entry.level).toUpperCase();
      if (logLevelFilter === 'WARN') return lvl === 'WARN' || lvl === 'WARNING';
      if (logLevelFilter === 'ERROR') return lvl === 'ERROR' || lvl === 'CRITICAL';
      return lvl === logLevelFilter;
    });
  }, [logLevelFilter, logs]);

  const filteredSkills = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      `${s.name ?? ''} ${s.slug} ${s.category ?? ''} ${s.description ?? ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [skills, skillsFilter]);

  const filteredTools = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return mcpTools;
    return mcpTools.filter((t) =>
      `${t.name} ${t.agent ?? ''} ${t.description ?? ''}`.toLowerCase().includes(q)
    );
  }, [mcpTools, skillsFilter]);

  if (!drawerOpen) {
    return null;
  }

  const shieldScore = shield?.score ?? 100;
  const shieldStatus = (shield?.status ?? 'SECURE').toUpperCase();
  const shieldHealthy = shieldStatus === 'SECURE' && shield?.success !== false;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setDrawerOpen(false);
        }
      }}
    >
      <aside
        aria-label="Circuit Inspector Drawer"
        className="w-full max-w-[440px] h-full bg-[#0d1218] border-l border-[var(--border)] flex flex-col shadow-[-24px_0_64px_rgba(0,0,0,0.65)] animate-obsidian-fade"
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline
                    ? telemetry.wsConnected
                      ? 'bg-emerald-400 animate-obsidian-pulse'
                      : 'bg-emerald-400'
                    : 'bg-slate-500'
                }`}
              />
              <h2 className="text-xs font-mono font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
                Circuit Inspector
              </h2>
            </div>
            <p className="mt-1 text-[11px] font-mono text-[var(--text-muted)]">
              {isOnline ? `127.0.0.1:47630 · ${telemetry.pingMs}ms` : 'Gateway Offline'} ·{' '}
              {telemetry.wsConnected ? 'WS Live' : 'WS Polling'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void syncAllDrawerData()}
              className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
              title="Refresh inspector data"
              aria-label="Refresh inspector data"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  shieldLoading || memoryLoading || skillsLoading ? 'animate-spin' : ''
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
              title="Close inspector drawer"
              aria-label="Close inspector drawer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Compact Telemetry Strip */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] bg-[#090d12] grid grid-cols-3 gap-2 shrink-0">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel)] px-2.5 py-2">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">CPU / RAM</div>
            <div className="mt-0.5 text-xs font-mono text-[var(--text)]">
              {telemetry.cpuPercent.toFixed(0)}% · {telemetry.ramPercent.toFixed(0)}%
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel)] px-2.5 py-2">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">VRAM</div>
            <div className="mt-0.5 text-xs font-mono text-[var(--text)] truncate">
              {telemetry.vramTotalMb > 0
                ? `${telemetry.vramUsedMb}/${telemetry.vramTotalMb}M`
                : telemetry.recommendedProfile}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel)] px-2.5 py-2">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)]">Guard</div>
            <div
              className={`mt-0.5 text-xs font-mono ${
                telemetry.securityState === 'LOCKED'
                  ? 'text-red-400'
                  : telemetry.securityState === 'ELEVATED'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
              }`}
            >
              {telemetry.securityState}
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <nav
          aria-label="Inspector sections"
          className="px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto shrink-0"
        >
          {(
            [
              { id: 'shield', label: 'Shield', icon: ShieldCheck },
              { id: 'memory', label: 'Memory', icon: Database },
              {
                id: 'tasks',
                label: activeTaskCount > 0 ? `Tasks (${activeTaskCount})` : 'Tasks',
                icon: ListChecks,
              },
              { id: 'logs', label: `Logs (${logs.length})`, icon: Terminal },
              { id: 'skills', label: `Skills (${skills.length})`, icon: Wrench },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 shrink-0 transition-colors ${
                  active
                    ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300'
                    : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--panel-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {activeTab === 'shield' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      Workspace Shield
                    </span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-mono font-semibold text-[var(--text)]">
                        {shield?.success === false ? '—' : shieldScore}
                      </span>
                      <span className="text-xs font-mono text-[var(--text-muted)]">/ 100</span>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md border text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 ${
                      shield?.success === false
                        ? 'border-red-500/40 bg-red-500/10 text-red-300'
                        : shieldHealthy
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {shieldHealthy ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    {shield?.success === false ? 'OFFLINE' : shieldStatus}
                  </span>
                </div>

                {shield?.error ? (
                  <p className="text-xs font-mono text-red-300">{shield.error}</p>
                ) : (
                  <div className="space-y-1.5 text-[11px] font-mono text-[var(--text-secondary)]">
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--text-muted)]">Audit ID</span>
                      <span className="truncate">{shield?.audit_id ?? 'Latest live scan'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--text-muted)]">Findings</span>
                      <span>{shield?.findings_count ?? shield?.findings?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-[var(--text-muted)]">Quarantined</span>
                      <span>{shield?.quarantined_plugins?.length ?? 0}</span>
                    </div>
                    {shield?.target_path && (
                      <div className="pt-1 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] truncate">
                        Target: {shield.target_path}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRunAudit()}
                    disabled={auditRunning}
                    className="flex-1 py-2 px-3 rounded-lg border border-emerald-500/40 bg-emerald-500/14 hover:bg-emerald-500/22 disabled:opacity-50 text-xs font-mono text-emerald-300 transition-colors flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className={`w-3.5 h-3.5 ${auditRunning ? 'animate-spin' : ''}`} />
                    {auditRunning ? 'Auditing...' : 'Run Audit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadShieldStatus()}
                    disabled={shieldLoading}
                    className="py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] hover:border-emerald-500/40 text-xs font-mono text-[var(--text-secondary)] transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {Array.isArray(shield?.quarantined_plugins) &&
                shield.quarantined_plugins.length > 0 && (
                  <div className="rounded-xl border border-red-500/35 bg-red-500/8 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Quarantined Modules</span>
                    </div>
                    <ul className="space-y-1 text-[11px] font-mono text-red-200/90">
                      {shield.quarantined_plugins.map((item) => (
                        <li key={item} className="truncate">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              {Array.isArray(shield?.findings) && shield.findings.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    Findings ({shield.findings.length})
                  </div>
                  {shield.findings.slice(0, 8).map((finding, idx) => (
                    <div
                      key={`${finding.file ?? 'finding'}-${idx}`}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-300">
                          {finding.severity ?? 'INFO'}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                          {finding.category ?? finding.file ?? ''}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{finding.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="space-y-4">
              <form onSubmit={handleMemorySearchSubmit} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memoryQuery}
                    onChange={(e) => setMemoryQuery(e.target.value)}
                    placeholder="FTS5 memory lookup..."
                    className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg pl-8 pr-3 py-2 text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/45 text-xs font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
                >
                  Find
                </button>
                <button
                  type="button"
                  onClick={() => setShowMemoryForm((prev) => !prev)}
                  className={`p-2 rounded-lg border transition-colors ${
                    showMemoryForm
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                      : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:border-emerald-500/40'
                  }`}
                  title="Store new FTS5 memory node"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>

              {showMemoryForm && (
                <form
                  onSubmit={(e) => void handleCreateMemory(e)}
                  className="rounded-xl border border-emerald-500/30 bg-[var(--panel-muted)] p-3.5 space-y-2.5"
                >
                  <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-emerald-300">
                    Commit Memory Node
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Title"
                      required
                      className="col-span-2 bg-[var(--panel)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] outline-none"
                    />
                    <input
                      type="text"
                      value={newNamespace}
                      onChange={(e) => setNewNamespace(e.target.value)}
                      placeholder="Namespace"
                      className="bg-[var(--panel)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--text)] outline-none"
                    />
                  </div>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={3}
                    placeholder="Fact, architectural invariant, or context..."
                    required
                    className="w-full bg-[var(--panel)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text)] outline-none resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMemoryForm(false)}
                      className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingMemory || !newTitle.trim() || !newContent.trim()}
                      className="px-3 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-45 text-[11px] font-mono text-emerald-300"
                    >
                      {savingMemory ? 'Saving...' : 'Commit FTS5'}
                    </button>
                  </div>
                </form>
              )}

              {memoryLoading ? (
                <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  Querying SQLite FTS5 index...
                </div>
              ) : memoryNodes.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                  No matching memory nodes found.
                </div>
              ) : (
                <div className="space-y-2">
                  {memoryNodes.map((node) => {
                    const expanded = expandedMemoryId === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setExpandedMemoryId(expanded ? null : node.id)}
                        className="w-full text-left rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border)] bg-[var(--panel-muted)] p-3 space-y-1.5 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {node.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono text-emerald-300 shrink-0">
                            {node.namespace}
                          </span>
                        </div>
                        <p
                          className={`text-[11px] text-[var(--text-secondary)] ${
                            expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'
                          }`}
                        >
                          {node.content}
                        </p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                          <span>{formatCompactTime(node.updated_at)}</span>
                          {typeof node.score === 'number' && (
                            <span>score {node.score.toFixed(2)}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(['all', 'active'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setTaskFilter(f)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-mono uppercase transition-colors ${
                        taskFilter === f
                          ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-muted)]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  {visibleTasks.length} queued
                </span>
              </div>

              {visibleTasks.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                  Task queue is clear.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleTasks.map((task) => {
                    const isActive = ACTIVE_TASK_STATUSES.has(String(task.status).toUpperCase());
                    return (
                      <div
                        key={task.id}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-[var(--text)] truncate">
                            {task.command_type || 'TASK'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase shrink-0 ${taskStatusClass(
                              String(task.status)
                            )}`}
                          >
                            {task.status}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {task.prompt_raw}
                        </p>
                        {task.result_output && (
                          <p className="text-[11px] font-mono text-[var(--text-muted)] line-clamp-2 border-t border-[var(--border-subtle)] pt-1.5">
                            {task.result_output}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {formatCompactTime(task.created_at)}
                          </span>
                          {isActive && (
                            <button
                              type="button"
                              onClick={() => void handleCancelTask(task.id)}
                              disabled={cancellingId === task.id}
                              className="px-2 py-0.5 rounded border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-[10px] font-mono text-red-300 flex items-center gap-1 transition-colors"
                            >
                              <XCircle className="w-3 h-3" />
                              {cancellingId === task.id ? 'Cancelling...' : 'Cancel'}
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLogLevelFilter(lvl)}
                      className={`px-2 py-1 rounded-md border text-[10px] font-mono transition-colors ${
                        logLevelFilter === lvl
                          ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-muted)]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] font-mono text-[var(--text-muted)] flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  {visibleLogs.length} events
                </span>
              </div>

              {visibleLogs.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                  No telemetry log entries recorded.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {visibleLogs.map((entry) => (
                    <div
                      key={String(entry.id)}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase ${logBadgeClass(
                              String(entry.level)
                            )}`}
                          >
                            {entry.level}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text)] truncate">
                            {entry.source}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                          {entry.latency_ms > 0 ? `${Math.round(entry.latency_ms)}ms · ` : ''}
                          {formatCompactTime(entry.created_at)}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[var(--text-secondary)] break-words">
                        {entry.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'skills' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={skillsFilter}
                    onChange={(e) => setSkillsFilter(e.target.value)}
                    placeholder="Filter skills or MCP tools..."
                    className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                  />
                </div>
                <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setSkillsView('skills')}
                    className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                      skillsView === 'skills'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Skills ({filteredSkills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillsView('tools')}
                    className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                      skillsView === 'tools'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    Tools ({filteredTools.length})
                  </button>
                </div>
              </div>

              {skillsLoading ? (
                <div className="py-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  Loading /api/skills registry...
                </div>
              ) : skillsView === 'skills' ? (
                filteredSkills.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                    No installed skills matched.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSkills.map((skill) => (
                      <div
                        key={skill.slug}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {skill.name || skill.slug}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                            {skill.version ? `v${skill.version}` : skill.category || 'SKILL'}
                          </span>
                        </div>
                        {skill.description && (
                          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                            {skill.description}
                          </p>
                        )}
                        {Array.isArray(skill.permission_scope) &&
                          skill.permission_scope.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {skill.permission_scope.slice(0, 4).map((scope) => (
                                <span
                                  key={scope}
                                  className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--panel)] text-[9px] font-mono text-[var(--text-muted)]"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                )
              ) : filteredTools.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-center text-xs font-mono text-[var(--text-muted)]">
                  No MCP tools matched.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTools.map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-[var(--text)] truncate">
                          {tool.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[9px] font-mono shrink-0 ${
                            tool.requires_approval
                              ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          }`}
                        >
                          {tool.requires_approval ? 'APPROVAL' : tool.agent || 'MCP'}
                        </span>
                      </div>
                      {tool.description && (
                        <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2">
                          {tool.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-2.5 border-t border-[var(--border-subtle)] bg-[#090d12] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] shrink-0">
          <span className="flex items-center gap-1.5 truncate">
            <Cpu className="w-3 h-3 text-emerald-400" />
            {telemetry.primaryGpuName !== 'N/A'
              ? telemetry.primaryGpuName
              : telemetry.recommendedProfile}
          </span>
          <span>ESC to close</span>
        </footer>
      </aside>
    </div>
  );
}

export default CircuitDrawer;
