import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Code2,
  Command,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Lock,
  MessageSquare,
  MessageSquareQuote,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { NavTabId, WorkspaceMode } from '@/types'

type ActionCategory = 'Navigation' | 'Workspace Mode' | 'System & Security' | 'Inspector' | 'Dispatch'

interface PaletteAction {
  id: string
  category: ActionCategory
  title: string
  subtitle: string
  keywords: string
  badge?: string
  active?: boolean
  tone?: 'default' | 'emerald' | 'amber' | 'danger'
  icon: React.ComponentType<{ className?: string }>
  run: () => Promise<void> | void
}

interface ReleaseGpuResponse {
  success?: boolean
  count?: number
  released_nodes?: string[]
  error?: string
}

interface WalCheckpointResponse {
  success?: boolean
  checkpoint?: number[]
  db_path?: string
  error?: string
}

interface AuditRunResponse {
  success?: boolean
  audit_passed?: boolean
  shield?: {
    score?: number
    status?: string
    findings_count?: number
  }
  error?: string
}

const MODULE_ITEMS: Array<{
  id: NavTabId
  title: string
  subtitle: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  {
    id: 'core',
    title: 'Core Cockpit',
    subtitle: 'Orbital hardware telemetry, active tasks & quick command bar',
    keywords: 'core cockpit home dashboard telemetry cpu ram gpu',
    icon: Cpu,
  },
  {
    id: 'chat',
    title: 'Neural Chat',
    subtitle: 'Multi-provider AI chat, persona matrix & voice synthesis',
    keywords: 'chat ai llm conversation voice persona models',
    icon: MessageSquare,
  },
  {
    id: 'studio',
    title: 'NexKoder Studio',
    subtitle: 'Workspace explorer, code editor, git diff & ScopeGuard sandbox',
    keywords: 'studio code editor nexkoder files git terminal',
    icon: Code2,
  },
  {
    id: 'scholar',
    title: 'Scholar & Memory',
    subtitle: 'FTS5 sovereign memory search, ArXiv synthesis & study notes',
    keywords: 'scholar memory fts5 research arxiv papers notes',
    icon: BookOpen,
  },
  {
    id: 'autopilot',
    title: 'Autopilot',
    subtitle: 'Voice routines, input macros, keep-awake & expense tracking',
    keywords: 'autopilot routines macros automation keep-awake expenses',
    icon: Zap,
  },
  {
    id: 'interview',
    title: 'Interview Copilot',
    subtitle: 'Stealth coding, system design & live vision copilot',
    keywords: 'interview coding system design behavioral stealth vision',
    icon: MessageSquareQuote,
  },
  {
    id: 'world',
    title: 'World & Scout',
    subtitle: 'Multi-channel web scout, ingests & Obscura DOM inspector',
    keywords: 'world scout web search browser dom ingest',
    icon: Globe,
  },
  {
    id: 'vault',
    title: 'Vault & Shield',
    subtitle: 'DPAPI secrets vault, AgentShield audits, timers & whiteboard',
    keywords: 'vault security dpapi secrets shield timers whiteboard market',
    icon: Lock,
  },
  {
    id: 'settings',
    title: 'Settings & Mesh',
    subtitle: 'API providers, GPU compute, themes, QR pairing & MCP skills',
    keywords: 'settings providers keys themes wallpapers qr skills mcp',
    icon: Settings,
  },
]

const MODE_DESCRIPTIONS: Record<WorkspaceMode, string> = {
  DEV: 'Full local & cloud execution with ScopeGuard invariants',
  STUDY: 'Focused research cadence with Scholar memory priority',
  STUDIO: 'High-throughput coding & creative workbench profile',
  SILENT: 'Air-gapped sovereign isolation — cloud egress halted',
}

export function CommandPalette() {
  const open = useNexusStore((s) => s.commandPaletteOpen)
  const setOpen = useNexusStore((s) => s.setCommandPaletteOpen)
  const activeTab = useNexusStore((s) => s.activeTab)
  const setActiveTab = useNexusStore((s) => s.setActiveTab)
  const telemetry = useNexusStore((s) => s.telemetry)
  const drawerOpen = useNexusStore((s) => s.drawerOpen)
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen)
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode)
  const toggleEstop = useNexusStore((s) => s.toggleEstop)
  const refreshAll = useNexusStore((s) => s.refreshAll)
  const pushToast = useNexusStore((s) => s.pushToast)
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const closePalette = useCallback(() => {
    setOpen(false)
  }, [setOpen])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setBusyActionId(null)
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [open])

  const handleReleaseGpu = useCallback(async () => {
    const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res.success === false) {
      pushToast(res.error || 'GPU release returned an error', 'error')
      return
    }
    pushToast(`Released ${res.count ?? 0} idle GPU/compute node(s)`, 'success')
    await refreshAll()
  }, [pushToast, refreshAll])

  const handleWalCheckpoint = useCallback(async () => {
    const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res.success === false) {
      pushToast(res.error || 'SQLite WAL checkpoint failed', 'error')
      return
    }
    pushToast('SQLite WAL checkpoint truncated cleanly', 'success')
    await refreshAll()
  }, [pushToast, refreshAll])

  const handleSecurityAudit = useCallback(async () => {
    const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res.success === false) {
      pushToast(res.error || 'Security audit returned warnings', 'warning')
      return
    }
    const score = res.shield?.score
    const findings = res.shield?.findings_count ?? 0
    pushToast(
      `AgentShield audit complete${typeof score === 'number' ? ` (${score}/100, ${findings} findings)` : ''}`,
      'success',
    )
    await refreshAll()
  }, [pushToast, refreshAll])

  const baseActions = useMemo<PaletteAction[]>(() => {
    const navActions: PaletteAction[] = MODULE_ITEMS.map((item) => ({
      id: `nav:${item.id}`,
      category: 'Navigation',
      title: item.title,
      subtitle: item.subtitle,
      keywords: `${item.id} ${item.keywords}`,
      badge: activeTab === item.id ? 'ACTIVE' : item.id.toUpperCase(),
      active: activeTab === item.id,
      tone: activeTab === item.id ? 'emerald' : 'default',
      icon: item.icon,
      run: () => {
        setActiveTab(item.id)
      },
    }))

    const modeActions: PaletteAction[] = (['DEV', 'STUDY', 'STUDIO', 'SILENT'] as WorkspaceMode[]).map(
      (mode) => {
        const isCurrent = telemetry.workspaceMode === mode
        return {
          id: `mode:${mode}`,
          category: 'Workspace Mode',
          title: `Switch Workspace to ${mode}`,
          subtitle: MODE_DESCRIPTIONS[mode],
          keywords: `workspace mode ${mode.toLowerCase()} ${mode === 'SILENT' ? 'airgap offline' : ''}`,
          badge: isCurrent ? 'CURRENT' : mode,
          active: isCurrent,
          tone: mode === 'SILENT' ? 'amber' : isCurrent ? 'emerald' : 'default',
          icon: mode === 'SILENT' ? Lock : Sparkles,
          run: async () => {
            await switchWorkspaceMode(mode)
          },
        }
      },
    )

    const systemActions: PaletteAction[] = [
      {
        id: 'sys:estop',
        category: 'System & Security',
        title: telemetry.estopActive ? 'Reset Emergency Stop (Clear E-Stop)' : 'Trigger Emergency Stop (E-Stop)',
        subtitle: telemetry.estopActive
          ? 'Restore nominal agent execution and unlock tool pipelines'
          : 'Immediately halt child agents, macros & active tool execution',
        keywords: 'estop emergency stop halt kill reset lock safety',
        badge: telemetry.estopActive ? 'LOCKED' : 'GUARDED',
        tone: 'danger',
        icon: ShieldAlert,
        run: async () => {
          await toggleEstop(
            telemetry.estopActive
              ? 'Command Palette E-Stop Reset'
              : 'Command Palette Emergency Stop',
          )
        },
      },
      {
        id: 'sys:release-gpu',
        category: 'System & Security',
        title: 'Release Idle GPU & Compute Nodes',
        subtitle: 'POST /api/system/release-gpu — Reclaim idle VRAM & cloud workers',
        keywords: 'gpu vram release compute unload nodes cuda',
        badge: 'GPU',
        tone: 'default',
        icon: HardDrive,
        run: handleReleaseGpu,
      },
      {
        id: 'sys:wal-checkpoint',
        category: 'System & Security',
        title: 'Run SQLite WAL Checkpoint',
        subtitle: 'POST /api/system/wal-checkpoint — Truncate & flush local WAL journal',
        keywords: 'sqlite wal checkpoint database flush truncate memory',
        badge: 'SQLITE',
        tone: 'default',
        icon: Database,
        run: handleWalCheckpoint,
      },
      {
        id: 'sys:audit-run',
        category: 'System & Security',
        title: 'Run AgentShield Security Audit',
        subtitle: 'POST /api/audit/run — Scan plugins, tools & ScopeGuard posture',
        keywords: 'security audit agentshield scan scopeguard posture',
        badge: 'SHIELD',
        tone: 'emerald',
        icon: ShieldCheck,
        run: handleSecurityAudit,
      },
      {
        id: 'sys:refresh-telemetry',
        category: 'System & Security',
        title: 'Refresh Telemetry & Task Snapshot',
        subtitle: 'Sync hardware sensors, tasks, logs & IPC state immediately',
        keywords: 'refresh telemetry sync status hardware logs tasks',
        badge: 'SYNC',
        tone: 'default',
        icon: RefreshCw,
        run: async () => {
          await refreshAll()
          pushToast('Telemetry snapshot synchronized', 'info')
        },
      },
      {
        id: 'inspector:drawer',
        category: 'Inspector',
        title: drawerOpen ? 'Close Circuit Inspector Drawer' : 'Open Circuit Inspector Drawer',
        subtitle: 'Slide-over telemetry logs, task queue, FTS5 memory, skills & shield',
        keywords: 'drawer circuit inspector telemetry logs tasks memory skills shield',
        badge: drawerOpen ? 'OPEN' : 'HIDDEN',
        active: drawerOpen,
        tone: drawerOpen ? 'emerald' : 'default',
        icon: PanelRight,
        run: () => {
          setDrawerOpen(!drawerOpen)
        },
      },
    ]

    return [...navActions, ...modeActions, ...systemActions]
  }, [
    activeTab,
    drawerOpen,
    handleReleaseGpu,
    handleSecurityAudit,
    handleWalCheckpoint,
    pushToast,
    refreshAll,
    setActiveTab,
    setDrawerOpen,
    switchWorkspaceMode,
    telemetry.estopActive,
    telemetry.workspaceMode,
    toggleEstop,
  ])

  const filteredActions = useMemo<PaletteAction[]>(() => {
    const raw = query.trim()
    const clean = raw.startsWith('>') ? raw.slice(1).trim() : raw
    const lowered = clean.toLowerCase()

    const matched = !lowered
      ? baseActions
      : baseActions.filter((item) => {
          const haystack = `${item.title} ${item.subtitle} ${item.category} ${item.keywords}`.toLowerCase()
          return haystack.includes(lowered)
        })

    if (clean.length > 0) {
      return [
        ...matched,
        {
          id: `dispatch:${clean}`,
          category: 'Dispatch',
          title: `Execute Nexus Command: "${clean}"`,
          subtitle: 'Dispatch directly to IPC autonomous router (/api/command)',
          keywords: clean,
          badge: 'DISPATCH',
          tone: 'emerald',
          icon: Terminal,
          run: async () => {
            await dispatchCommand(clean)
          },
        },
      ]
    }

    return matched
  }, [baseActions, dispatchCommand, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (selectedIndex >= filteredActions.length && filteredActions.length > 0) {
      setSelectedIndex(filteredActions.length - 1)
    }
  }, [filteredActions.length, selectedIndex])

  useEffect(() => {
    if (!open || !listRef.current) return
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`)
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex])

  const executeAction = useCallback(
    async (action: PaletteAction | undefined) => {
      if (!action || busyActionId) return
      setBusyActionId(action.id)
      try {
        await action.run()
        closePalette()
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Command execution failed', 'error')
      } finally {
        setBusyActionId(null)
      }
    },
    [busyActionId, closePalette, pushToast],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closePalette()
      return
    }
    if (filteredActions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filteredActions.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setSelectedIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setSelectedIndex(filteredActions.length - 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void executeAction(filteredActions[selectedIndex])
    }
  }

  if (!open) return null

  let lastCategory: ActionCategory | null = null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nexus Spatial Command Palette"
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          closePalette()
        }
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[13vh] backdrop-blur-md animate-spatial-enter"
    >
      <div className="spatial-panel relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 backdrop-blur-2xl shadow-[0_32px_90px_-16px_rgba(0,0,0,0.9)]">
        {/* Subtle Mint Emerald Spatial Rim */}
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

        {/* Spotlight Search Input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Search className="h-4 w-4" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to module, switch mode, audit shield, or run >command..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-400">
              Ctrl+K
            </kbd>
            <button
              type="button"
              onClick={closePalette}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              ESC
            </button>
          </div>
        </div>

        {/* Action List */}
        <div ref={listRef} className="max-h-[54vh] overflow-y-auto px-3 py-3">
          {filteredActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Command className="h-6 w-6 text-slate-500" />
              <p className="text-sm text-slate-300">No matching spatial action found</p>
              <p className="text-xs text-slate-500">
                Type any command to dispatch directly to Nexus IPC
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredActions.map((action, idx) => {
                const Icon = action.icon
                const isSelected = idx === selectedIndex
                const isBusy = busyActionId === action.id
                const showHeader = action.category !== lastCategory
                lastCategory = action.category

                const badgeToneClass =
                  action.tone === 'danger'
                    ? 'border-rose-400/35 bg-rose-500/15 text-rose-200'
                    : action.tone === 'amber'
                      ? 'border-amber-400/35 bg-amber-400/15 text-amber-200'
                      : action.tone === 'emerald'
                        ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-200'
                        : 'border-white/10 bg-white/[0.05] text-slate-400'

                return (
                  <React.Fragment key={action.id}>
                    {showHeader && (
                      <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:pt-1">
                        {action.category}
                      </div>
                    )}
                    <button
                      type="button"
                      data-cmd-index={idx}
                      disabled={Boolean(busyActionId)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => void executeAction(action)}
                      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-emerald-400/35 bg-emerald-400/10 shadow-[0_0_24px_-8px_rgba(52,211,153,0.45)]'
                          : 'border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                            action.tone === 'danger'
                              ? 'border-rose-400/30 bg-rose-500/10 text-rose-300'
                              : isSelected || action.active
                                ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-300'
                                : 'border-white/10 bg-white/[0.04] text-slate-300'
                          }`}
                        >
                          {isBusy ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-slate-100">
                              {action.title}
                            </span>
                            {action.active && (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-400">{action.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {action.badge && (
                          <span
                            className={`rounded-lg border px-2 py-0.5 font-mono text-[10px] font-medium ${badgeToneClass}`}
                          >
                            {action.badge}
                          </span>
                        )}
                        <ArrowRight
                          className={`h-3.5 w-3.5 transition ${
                            isSelected
                              ? 'translate-x-0.5 text-emerald-300 opacity-100'
                              : 'text-slate-500 opacity-0 group-hover:opacity-70'
                          }`}
                        />
                      </div>
                    </button>
                  </React.Fragment>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer Hints */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-5 py-2.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Mode:</span>
              <span className="font-mono text-slate-200">{telemetry.workspaceMode}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span>
              E-Stop:{' '}
              <span
                className={`font-mono ${
                  telemetry.estopActive ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {telemetry.estopActive ? 'ENGAGED' : 'NOMINAL'}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CommandPalette
