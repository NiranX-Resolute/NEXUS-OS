import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Cpu,
  Database,
  Layers,
  ListTodo,
  Lock,
  Plug,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  X,
  XCircle,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { LogEntry, MemoryNode, TaskItem } from '@/types'

type InspectorFocus = 'all' | 'logs' | 'tasks' | 'memory'

interface ShieldStatusResponse {
  success?: boolean
  has_audit?: boolean
  audit_id?: string
  scanned_at?: string | number
  score?: number
  status?: string
  target_path?: string
  findings_count?: number
  findings?: unknown[]
  quarantined_plugins?: string[]
  error?: string
}

interface AuditRunResponse {
  success?: boolean
  audit_passed?: boolean
  shield?: ShieldStatusResponse
  error?: string
}

interface SkillsApiResponse {
  success?: boolean
  count?: number
  skills?: Array<{ slug?: string; name?: string }>
  tools?: Array<{ name?: string }>
  error?: string
}

interface MemoryQueryResponse {
  success?: boolean
  query?: string
  results?: MemoryNode[]
  memories?: MemoryNode[]
  error?: string
}

function formatLogTime(raw: string): string {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 19)
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function isActiveTask(status: string): boolean {
  const upper = status.toUpperCase()
  return upper === 'QUEUED' || upper === 'RUNNING' || upper === 'IN_PROGRESS'
}

function getLogToneClass(level: string): string {
  const upper = level.toUpperCase()
  if (upper === 'ERROR' || upper === 'CRITICAL') {
    return 'border-rose-400/30 bg-rose-500/15 text-rose-200'
  }
  if (upper === 'WARN' || upper === 'WARNING') {
    return 'border-amber-400/30 bg-amber-500/15 text-amber-200'
  }
  if (upper === 'SUCCESS') {
    return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
  }
  return 'border-white/10 bg-white/[0.05] text-slate-300'
}

function getTaskToneClass(status: string): string {
  const upper = status.toUpperCase()
  if (upper === 'COMPLETED' || upper === 'SUCCESS') {
    return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-200'
  }
  if (upper === 'FAILED' || upper === 'CANCELLED') {
    return 'border-rose-400/30 bg-rose-500/15 text-rose-200'
  }
  if (isActiveTask(upper)) {
    return 'border-amber-400/35 bg-amber-400/15 text-amber-200'
  }
  return 'border-white/10 bg-white/[0.05] text-slate-300'
}

export function CircuitDrawer() {
  const drawerOpen = useNexusStore((s) => s.drawerOpen)
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen)
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen)
  const telemetry = useNexusStore((s) => s.telemetry)
  const tasks = useNexusStore((s) => s.tasks)
  const logs = useNexusStore((s) => s.logs)
  const isOnline = useNexusStore((s) => s.isOnline)
  const refreshAll = useNexusStore((s) => s.refreshAll)
  const cancelTask = useNexusStore((s) => s.cancelTask)
  const setActiveTab = useNexusStore((s) => s.setActiveTab)
  const pushToast = useNexusStore((s) => s.pushToast)

  const [focus, setFocus] = useState<InspectorFocus>('all')
  const [refreshing, setRefreshing] = useState(false)

  // Workspace Shield state (GET /api/security/shield-status)
  const [shield, setShield] = useState<ShieldStatusResponse | null>(null)
  const [shieldLoading, setShieldLoading] = useState(false)
  const [auditing, setAuditing] = useState(false)

  // Skills Count state (GET /api/skills)
  const [skillsCount, setSkillsCount] = useState<number | null>(null)
  const [toolsCount, setToolsCount] = useState<number | null>(null)
  const [skillsLoading, setSkillsLoading] = useState(false)

  // Memory FTS5 Quick Lookup state (/api/memory/search & /api/memory)
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memories, setMemories] = useState<MemoryNode[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState<string | null>(null)

  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null)

  const fetchShieldStatus = useCallback(async () => {
    setShieldLoading(true)
    try {
      const res = await ipcJson<ShieldStatusResponse>('/api/security/shield-status')
      setShield(res)
    } catch (err) {
      setShield({
        success: false,
        error: err instanceof Error ? err.message : 'Unable to reach AgentShield',
      })
    } finally {
      setShieldLoading(false)
    }
  }, [])

  const fetchSkillsSummary = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const primary = await ipcJson<SkillsApiResponse>('/api/skills')
      if (primary.success !== false && (Array.isArray(primary.skills) || Array.isArray(primary.tools))) {
        setSkillsCount(Array.isArray(primary.skills) ? primary.skills.length : primary.count ?? 0)
        setToolsCount(Array.isArray(primary.tools) ? primary.tools.length : 0)
        return
      }
      const fallback = await ipcJson<SkillsApiResponse>('/api/skills/installed')
      if (Array.isArray(fallback.skills)) {
        setSkillsCount(fallback.skills.length)
      } else if (typeof fallback.count === 'number') {
        setSkillsCount(fallback.count)
      }
    } catch {
      // Preserve previous counts if IPC is temporarily offline
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const fetchMemories = useCallback(async (rawQuery: string) => {
    const clean = rawQuery.trim()
    setMemoryLoading(true)
    setMemoryError(null)
    try {
      const endpoint = clean
        ? `/api/memory/search?q=${encodeURIComponent(clean)}&limit=10`
        : '/api/memory?limit=8'
      const res = await ipcJson<MemoryQueryResponse>(endpoint)
      if (res.success === false) {
        setMemoryError(res.error || 'Memory lookup returned an error')
        setMemories([])
        return
      }
      const rows = Array.isArray(res.results)
        ? res.results
        : Array.isArray(res.memories)
          ? res.memories
          : []
      setMemories(rows)
    } catch (err) {
      setMemoryError(err instanceof Error ? err.message : 'Failed querying memory store')
    } finally {
      setMemoryLoading(false)
    }
  }, [])

  const syncAllDrawerData = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.allSettled([
        refreshAll(),
        fetchShieldStatus(),
        fetchSkillsSummary(),
        fetchMemories(memoryQuery),
      ])
    } finally {
      setRefreshing(false)
    }
  }, [fetchMemories, fetchShieldStatus, fetchSkillsSummary, memoryQuery, refreshAll])

  useEffect(() => {
    if (!drawerOpen) return
    void syncAllDrawerData()
  }, [drawerOpen, syncAllDrawerData])

  // Escape closes drawer when Command Palette is not open
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !commandPaletteOpen) {
        e.preventDefault()
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandPaletteOpen, drawerOpen, setDrawerOpen])

  const handleRunQuickAudit = async () => {
    setAuditing(true)
    try {
      const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.shield) {
        setShield(res.shield)
      } else {
        await fetchShieldStatus()
      }
      if (res.success === false) {
        pushToast(res.error || 'AgentShield audit surfaced warnings', 'warning')
      } else {
        pushToast(
          `Workspace Shield verified (${res.shield?.score ?? 100}/100)`,
          'success',
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Security audit failed', 'error')
    } finally {
      setAuditing(false)
    }
  }

  const handleMemorySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchMemories(memoryQuery)
  }

  const handleCancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId)
    try {
      await cancelTask(taskId)
    } finally {
      setCancellingTaskId(null)
    }
  }

  const activeTaskCount = useMemo(
    () => tasks.filter((t) => isActiveTask(t.status)).length,
    [tasks],
  )

  const shieldScore = shield?.score ?? null
  const shieldFindings =
    shield?.findings_count ?? (Array.isArray(shield?.findings) ? shield.findings.length : 0)
  const shieldHealthy =
    !telemetry.estopActive &&
    (shield?.status === 'SECURE' || shield?.status === 'CLEAN' || (shieldScore ?? 100) >= 85)

  return (
    <aside
      aria-label="Circuit Telemetry Inspector"
      aria-hidden={!drawerOpen}
      className={`fixed bottom-20 right-4 top-16 z-40 flex w-[410px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-3xl border border-white/10 spatial-panel backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        drawerOpen
          ? 'visible translate-x-0 opacity-100 pointer-events-auto'
          : 'invisible translate-x-8 opacity-0 pointer-events-none'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-100">
              Circuit Inspector
            </h2>
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  telemetry.wsConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : isOnline
                      ? 'bg-amber-400'
                      : 'bg-slate-500'
                }`}
              />
              {telemetry.wsConnected ? 'WS STREAM LIVE' : isOnline ? 'IPC READY' : 'OFFLINE'}
              {telemetry.pingMs > 0 ? ` · ${telemetry.pingMs}ms` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void syncAllDrawerData()}
            disabled={refreshing}
            title="Refresh circuit telemetry"
            className="spatial-pill flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            title="Close inspector (Esc)"
            className="spatial-pill flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Section Filter Pills */}
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'logs', label: `Logs (${logs.length})` },
            { id: 'tasks', label: `Tasks (${activeTaskCount}/${tasks.length})` },
            { id: 'memory', label: 'Memory FTS5' },
          ] as const
        ).map((tab) => {
          const active = focus === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFocus(tab.id)}
              className={`rounded-xl px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? 'spatial-pill-active text-emerald-200'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Workspace Shield + Skills Summary Strip */}
        <div className="grid grid-cols-2 gap-3">
          {/* Workspace Shield */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                {shieldHealthy ? (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                )}
                Workspace Shield
              </span>
              <button
                type="button"
                onClick={() => void handleRunQuickAudit()}
                disabled={auditing || shieldLoading}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-emerald-300 transition hover:border-emerald-400/35 disabled:opacity-50"
              >
                {auditing ? '...' : 'AUDIT'}
              </button>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                className={`font-mono text-base font-semibold ${
                  shieldHealthy ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                {shieldLoading && shieldScore === null
                  ? '—'
                  : shieldScore !== null
                    ? `${shieldScore}/100`
                    : telemetry.securityState}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {telemetry.airGapped ? 'AIR-GAP' : shield?.status || telemetry.securityState}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-400">
              {shield?.error
                ? shield.error
                : `${shieldFindings} finding${shieldFindings === 1 ? '' : 's'} · ${telemetry.workspaceMode}`}
            </p>
          </div>

          {/* Skills Count */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-300">
                <Plug className="h-3.5 w-3.5 text-emerald-400" />
                Skills &amp; Tools
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings')
                  setDrawerOpen(false)
                }}
                className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-300 transition hover:border-emerald-400/35 hover:text-emerald-200"
              >
                Open
                <ArrowUpRight className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-base font-semibold text-slate-100">
                {skillsLoading && skillsCount === null ? '—' : skillsCount ?? 0}
              </span>
              <span className="font-mono text-[10px] text-emerald-300">
                {toolsCount !== null ? `${toolsCount} MCP` : 'LOADED'}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-400">
              Active slices: {telemetry.activeSlices} · Agents: {telemetry.activeAgents}
            </p>
          </div>
        </div>

        {/* Live Hardware Micro-Bar */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-2 font-mono text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-emerald-400" />
            CPU {Math.round(telemetry.cpuPercent)}%
          </span>
          <span className="text-slate-600">·</span>
          <span>
            RAM {Math.round(telemetry.ramPercent)}%
          </span>
          <span className="text-slate-600">·</span>
          <span>
            {telemetry.vramTotalMb > 0
              ? `VRAM ${(telemetry.vramUsedMb / 1024).toFixed(1)}G`
              : `${telemetry.fps} FPS`}
          </span>
          {telemetry.airGapped && (
            <span className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
              <Lock className="h-2.5 w-2.5" />
              SILENT
            </span>
          )}
        </div>

        {/* Memory FTS5 Quick Lookup */}
        {(focus === 'all' || focus === 'memory') && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-emerald-400" />
                <h3 className="text-xs font-semibold text-slate-100">Memory FTS5 Quick Lookup</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('scholar')
                  setDrawerOpen(false)
                }}
                className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-300 hover:text-emerald-200"
              >
                Scholar
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>

            <form onSubmit={handleMemorySubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Search FTS5 nodes..."
                  className="w-full rounded-xl border border-white/10 bg-black/25 py-1.5 pl-8 pr-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-400/40 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={memoryLoading}
                className="spatial-pill rounded-xl px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 disabled:opacity-50"
              >
                {memoryLoading ? '...' : 'Query'}
              </button>
            </form>

            {memoryError ? (
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{memoryError}</span>
              </p>
            ) : memories.length === 0 ? (
              <p className="mt-2.5 text-[11px] text-slate-500">
                {memoryLoading
                  ? 'Querying FTS5 semantic index...'
                  : memoryQuery.trim()
                    ? 'No matching memory nodes found.'
                    : 'No memory nodes stored yet.'}
              </p>
            ) : (
              <div className="mt-2.5 max-h-44 space-y-2 overflow-y-auto pr-1">
                {memories.map((node) => (
                  <div
                    key={node.id}
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition hover:border-emerald-400/25"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-slate-100">
                        {node.title || node.id}
                      </span>
                      <span className="shrink-0 rounded-md border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                        {node.namespace || 'CORE'}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                      {node.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Task Queue */}
        {(focus === 'all' || focus === 'tasks') && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListTodo className="h-3.5 w-3.5 text-emerald-400" />
                <h3 className="text-xs font-semibold text-slate-100">Task Queue</h3>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {activeTaskCount} active · {tasks.length} total
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                <Layers className="h-4 w-4 text-slate-500" />
                <span>Task queue is idle</span>
              </div>
            ) : (
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {tasks.slice(0, focus === 'tasks' ? 25 : 8).map((task: TaskItem, taskIdx: number) => {
                  const active = isActiveTask(task.status)
                  const safeId = String(task.id ?? (task as { task_id?: unknown }).task_id ?? `task-${taskIdx}`)
                  return (
                    <div
                      key={safeId}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[10px] text-slate-400">
                          {task.command_type || 'COMMAND'} · {safeId.slice(0, 8)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-medium ${getTaskToneClass(task.status)}`}
                          >
                            {task.status}
                          </span>
                          {active && (
                            <button
                              type="button"
                              onClick={() => void handleCancelTask(safeId)}
                              disabled={cancellingTaskId === safeId}
                              title="Cancel task"
                              className="rounded-md p-0.5 text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-200">
                        {task.prompt_raw}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Live Telemetry Logs */}
        {(focus === 'all' || focus === 'logs') && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <h3 className="text-xs font-semibold text-slate-100">Live Telemetry Logs</h3>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {logs.length} event{logs.length === 1 ? '' : 's'}
              </span>
            </div>

            {logs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                Waiting for telemetry log stream...
              </p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {logs.slice(0, focus === 'logs' ? 25 : 10).map((entry: LogEntry, idx) => (
                  <div
                    key={`${entry.id}-${idx}`}
                    className="rounded-xl border border-white/10 bg-black/25 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-medium ${getLogToneClass(entry.level)}`}
                        >
                          {entry.level}
                        </span>
                        <span className="truncate font-mono text-[10px] text-emerald-300/90">
                          {entry.source}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {formatLogTime(entry.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 break-words font-mono text-[11px] leading-relaxed text-slate-300">
                      {entry.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  )
}

export default CircuitDrawer
