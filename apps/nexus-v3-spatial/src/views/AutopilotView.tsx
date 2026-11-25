import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Coffee,
  Cpu,
  Flame,
  Mic,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { RoutineItem } from '@/types'

type AutopilotTab = 'routines' | 'macros' | 'system' | 'expenses'

interface MacroRecord {
  macro_id: string
  name: string
  description: string
  action_count: number
  duration_ms: number
  tags?: string[]
  created_at?: string
  updated_at?: string
}

interface RoutinesApiResponse {
  success?: boolean
  routines?: RoutineItem[]
  error?: string
}

interface RoutinePlayApiResponse {
  success?: boolean
  actions?: string[]
  results?: Array<Record<string, unknown>>
  latency_ms?: number
  error?: string
}

interface MacrosApiResponse {
  success?: boolean
  macros?: MacroRecord[]
  error?: string
}

interface MacroStartApiResponse {
  success?: boolean
  is_recording?: boolean
  recorder_id?: string
  error?: string
}

interface MacroStopApiResponse {
  success?: boolean
  is_recording?: boolean
  action_count?: number
  actions?: Array<Record<string, unknown>>
  saved?: Record<string, unknown>
  error?: string
}

interface MacroReplayApiResponse {
  success?: boolean
  executed_steps?: number
  steps_executed?: number
  duration_ms?: number
  latency_ms?: number
  dry_run?: boolean
  message?: string
  error?: string
}

interface KeepAwakeApiResponse {
  success?: boolean
  keep_awake?: boolean
  enabled?: boolean
  error?: string
}

interface PurgeApiResponse {
  success?: boolean
  dry_run?: boolean
  removed_files?: number
  reclaimed_mb?: number
  error?: string
}

interface ExpenseMerchant {
  merchant: string
  total: number
  count: number
}

interface ExpenseEntry {
  id: string
  amount: number
  currency: string
  merchant: string
  category: string
  payment_method?: string
  txn_date?: string
}

interface ExpensesSummaryApiResponse {
  success?: boolean
  period?: string
  total_spend?: number
  currency?: string
  transaction_count?: number
  by_category?: Record<string, number>
  top_merchants?: ExpenseMerchant[]
  recent_expenses?: ExpenseEntry[]
  air_gapped?: boolean
  error?: string
}

export function AutopilotView() {
  const pushToast = useNexusStore((s) => s.pushToast)
  const [activeTab, setActiveTab] = useState<AutopilotTab>('routines')

  // Routines state
  const [routines, setRoutines] = useState<RoutineItem[]>([])
  const [loadingRoutines, setLoadingRoutines] = useState(false)
  const [triggerPhrase, setTriggerPhrase] = useState('')
  const [actionSequence, setActionSequence] = useState('')
  const [routineDesc, setRoutineDesc] = useState('')
  const [savingRoutine, setSavingRoutine] = useState(false)
  const [lastRoutineRun, setLastRoutineRun] = useState<{
    name: string
    actions: number
    latencyMs?: number
  } | null>(null)

  // Macro Recorder state
  const [macros, setMacros] = useState<MacroRecord[]>([])
  const [loadingMacros, setLoadingMacros] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recorderId, setRecorderId] = useState('')
  const [macroName, setMacroName] = useState('')
  const [macroDesc, setMacroDesc] = useState('')
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1)
  const [dryRunReplay, setDryRunReplay] = useState<boolean>(true)
  const [lastMacroAction, setLastMacroAction] = useState<string>('')

  // System Keep-Awake & Purge state
  const [keepAwake, setKeepAwake] = useState<boolean>(false)
  const [togglingAwake, setTogglingAwake] = useState(false)
  const [purging, setPurging] = useState(false)
  const [lastPurgeReport, setLastPurgeReport] = useState<{
    dryRun: boolean
    removedFiles: number
    reclaimedMb: number
  } | null>(null)

  // Expenses Summary state
  const [expensePeriod, setExpensePeriod] = useState<'week' | 'month' | 'year'>('month')
  const [expenses, setExpenses] = useState<ExpensesSummaryApiResponse | null>(null)
  const [loadingExpenses, setLoadingExpenses] = useState(false)

  const fetchRoutines = useCallback(async () => {
    setLoadingRoutines(true)
    try {
      const res = await ipcJson<RoutinesApiResponse>('/api/routines')
      if (res.success === false) {
        pushToast(res.error || 'Failed loading voice routines', 'error')
        return
      }
      setRoutines(Array.isArray(res.routines) ? res.routines : [])
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routines fetch failed', 'error')
    } finally {
      setLoadingRoutines(false)
    }
  }, [pushToast])

  const fetchMacros = useCallback(async () => {
    setLoadingMacros(true)
    try {
      const res = await ipcJson<MacrosApiResponse>('/api/macros')
      if (res.success === false) {
        pushToast(res.error || 'Failed loading recorded macros', 'error')
        return
      }
      setMacros(Array.isArray(res.macros) ? res.macros : [])
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macros fetch failed', 'error')
    } finally {
      setLoadingMacros(false)
    }
  }, [pushToast])

  const fetchKeepAwake = useCallback(async () => {
    try {
      const res = await ipcJson<KeepAwakeApiResponse>('/api/system/keep-awake')
      if (res.success !== false) {
        setKeepAwake(Boolean(res.keep_awake ?? res.enabled))
      }
    } catch {
      // Keep-awake telemetry read ignored when daemon is offline
    }
  }, [])

  const fetchExpenses = useCallback(
    async (period: 'week' | 'month' | 'year') => {
      setLoadingExpenses(true)
      try {
        const res = await ipcJson<ExpensesSummaryApiResponse>(
          `/api/expenses/summary?period=${encodeURIComponent(period)}`,
        )
        if (res.success === false) {
          pushToast(res.error || 'Failed reading expenses ledger', 'error')
          return
        }
        setExpenses(res)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Expenses summary error', 'error')
      } finally {
        setLoadingExpenses(false)
      }
    },
    [pushToast],
  )

  useEffect(() => {
    void fetchRoutines()
    void fetchMacros()
    void fetchKeepAwake()
  }, [fetchRoutines, fetchMacros, fetchKeepAwake])

  useEffect(() => {
    if (activeTab === 'expenses') {
      void fetchExpenses(expensePeriod)
    }
  }, [activeTab, expensePeriod, fetchExpenses])

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault()
    const trigger = triggerPhrase.trim()
    const actions = actionSequence.trim()
    if (!trigger || !actions) {
      pushToast('Trigger phrase and action sequence are required', 'warning')
      return
    }
    setSavingRoutine(true)
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/routines', {
        method: 'POST',
        body: JSON.stringify({
          name: trigger,
          trigger_phrase: trigger,
          action_sequence: actions,
          description: routineDesc.trim(),
          enabled: true,
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed registering routine', 'error')
        return
      }
      setTriggerPhrase('')
      setActionSequence('')
      setRoutineDesc('')
      pushToast(`Routine "${trigger}" registered`, 'success')
      await fetchRoutines()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine save failed', 'error')
    } finally {
      setSavingRoutine(false)
    }
  }

  const handlePlayRoutine = async (routine: RoutineItem) => {
    try {
      const res = await ipcJson<RoutinePlayApiResponse>('/api/routines/play', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id ?? routine.name,
          routine_id: routine.name,
          name: routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Routine execution failed', 'error')
        return
      }
      const actionCount = Array.isArray(res.actions) ? res.actions.length : 1
      setLastRoutineRun({
        name: routine.trigger_phrase || routine.name,
        actions: actionCount,
        latencyMs: res.latency_ms,
      })
      pushToast(`Executed "${routine.trigger_phrase}" (${actionCount} steps)`, 'success')
      await fetchRoutines()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine play error', 'error')
    }
  }

  const handleDeleteRoutine = async (routine: RoutineItem) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/routines/delete', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id ?? routine.name,
          routine_id: routine.name,
          name: routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Unable to delete routine', 'error')
        return
      }
      setRoutines((prev) => prev.filter((item) => item.name !== routine.name))
      pushToast(`Removed routine "${routine.trigger_phrase}"`, 'info')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine delete failed', 'error')
    }
  }

  const handleStartRecording = async () => {
    try {
      const res = await ipcJson<MacroStartApiResponse>('/api/macros/start', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed starting macro recorder', 'error')
        return
      }
      setIsRecording(true)
      setRecorderId(res.recorder_id || '')
      setLastMacroAction('Recording live motor & UIA events…')
      pushToast('Macro recording started', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro start failed', 'error')
    }
  }

  const handleStopRecording = async () => {
    const chosenName =
      macroName.trim() || `spatial-macro-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`
    try {
      const res = await ipcJson<MacroStopApiResponse>('/api/macros/stop', {
        method: 'POST',
        body: JSON.stringify({
          name: chosenName,
          description: macroDesc.trim(),
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed stopping macro recorder', 'error')
        return
      }
      setIsRecording(false)
      setRecorderId('')
      setMacroName('')
      setMacroDesc('')
      const count = typeof res.action_count === 'number' ? res.action_count : 0
      setLastMacroAction(`Saved "${chosenName}" (${count} captured events)`)
      pushToast(`Macro "${chosenName}" saved (${count} events)`, 'success')
      await fetchMacros()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro stop failed', 'error')
    }
  }

  const handleReplayMacro = async (macro: MacroRecord) => {
    try {
      const res = await ipcJson<MacroReplayApiResponse>('/api/macros/replay', {
        method: 'POST',
        body: JSON.stringify({
          name: macro.name,
          macro_id: macro.macro_id,
          speed_multiplier: speedMultiplier,
          dry_run: dryRunReplay,
          auto_approve: false,
        }),
      })
      if (res.success === false) {
        pushToast(res.error || `Replay failed for "${macro.name}"`, 'error')
        return
      }
      const modeLabel = dryRunReplay ? 'Dry-run verified' : 'Replayed'
      setLastMacroAction(`${modeLabel} "${macro.name}" at ${speedMultiplier}x`)
      pushToast(`${modeLabel} "${macro.name}"`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro replay failed', 'error')
    }
  }

  const handleToggleKeepAwake = async () => {
    setTogglingAwake(true)
    try {
      const next = !keepAwake
      const res = await ipcJson<KeepAwakeApiResponse>('/api/system/keep-awake', {
        method: 'POST',
        body: JSON.stringify({ enabled: next }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed updating Keep-Awake state', 'error')
        return
      }
      const actual = Boolean(res.keep_awake ?? res.enabled ?? next)
      setKeepAwake(actual)
      pushToast(
        actual ? 'Win32 Keep-Awake asserted (sleep prevented)' : 'Keep-Awake released',
        actual ? 'success' : 'info',
      )
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Keep-Awake request error', 'error')
    } finally {
      setTogglingAwake(false)
    }
  }

  const handlePurgeTemp = async (dryRun: boolean) => {
    setPurging(true)
    try {
      const res = await ipcJson<PurgeApiResponse>('/api/system/purge', {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      })
      if (res.success === false) {
        pushToast(res.error || 'System purge request failed', 'error')
        return
      }
      const removed = res.removed_files ?? 0
      const reclaimed = res.reclaimed_mb ?? 0
      setLastPurgeReport({
        dryRun: Boolean(res.dry_run ?? dryRun),
        removedFiles: removed,
        reclaimedMb: reclaimed,
      })
      pushToast(
        dryRun
          ? `Dry-run scan: ${removed} stale logs (${reclaimed} MB reclaimable)`
          : `Purged ${removed} stale logs (${reclaimed} MB freed)`,
        'success',
      )
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Purge error', 'error')
    } finally {
      setPurging(false)
    }
  }

  const categoryEntries = useMemo(() => {
    const map = expenses?.by_category || {}
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const maxCategoryAmount = useMemo(
    () => (categoryEntries.length > 0 ? Math.max(...categoryEntries.map(([, v]) => v), 1) : 1),
    [categoryEntries],
  )

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter">
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              Autopilot Automation Studio
            </h1>
            <p className="text-xs text-slate-400">
              Voice routines, UIA macro recorder, system guardrails &amp; ledger
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                keepAwake ? 'bg-emerald-400 animate-mint-breathe' : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300">
              {keepAwake ? 'Awake Active' : 'Normal Power'}
            </span>
          </div>

          <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { id: 'routines', label: 'Routines', icon: Mic },
                { id: 'macros', label: 'Macros', icon: CircleDot },
                { id: 'system', label: 'System', icon: Cpu },
                { id: 'expenses', label: 'Expenses', icon: Wallet },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'spatial-pill-active text-emerald-200'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      {/* TAB 1: VOICE ROUTINES */}
      {activeTab === 'routines' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleCreateRoutine}
            className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 lg:col-span-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Register Voice Routine</h2>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                Sub-50ms Reflex
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Trigger Phrase</label>
              <input
                type="text"
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder="e.g. start deep work"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                Action Sequence (semicolon-delimited)
              </label>
              <textarea
                value={actionSequence}
                onChange={(e) => setActionSequence(e.target.value)}
                rows={4}
                placeholder="keep awake; switch mode study; open terminal"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3.5 font-mono text-xs leading-relaxed text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Description (optional)</label>
              <input
                type="text"
                value={routineDesc}
                onChange={(e) => setRoutineDesc(e.target.value)}
                placeholder="Prevent sleep and prep research layout"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
              />
            </div>

            <button
              type="submit"
              disabled={savingRoutine}
              className="spatial-pill-active mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{savingRoutine ? 'Saving…' : 'Register Routine'}</span>
            </button>
          </form>

          <section className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-6 lg:col-span-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Voice Routines Library</h2>
                <p className="text-xs text-slate-400">
                  {routines.length} routines stored in SQLite WAL
                </p>
              </div>
              <button
                type="button"
                onClick={fetchRoutines}
                disabled={loadingRoutines}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingRoutines ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {lastRoutineRun && (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>
                    Last run: <strong>{lastRoutineRun.name}</strong> ({lastRoutineRun.actions} actions)
                  </span>
                </div>
                {typeof lastRoutineRun.latencyMs === 'number' && (
                  <span className="font-mono">{lastRoutineRun.latencyMs}ms</span>
                )}
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {routines.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                  <Mic className="mb-2 h-6 w-6 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">
                    {loadingRoutines ? 'Loading voice routines…' : 'No voice routines registered'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Register a trigger phrase and command chain on the left.
                  </p>
                </div>
              ) : (
                routines.map((routine) => (
                  <article
                    key={String(routine.id || routine.name)}
                    className="spatial-panel-interactive flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">
                          “{routine.trigger_phrase || routine.name}”
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            routine.enabled
                              ? 'border border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                              : 'border border-white/10 bg-white/5 text-slate-400'
                          }`}
                        >
                          {routine.enabled ? 'ACTIVE' : 'PAUSED'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {routine.execution_count ?? 0} runs
                        </span>
                      </div>
                      <p className="truncate font-mono text-xs text-slate-300">
                        {routine.action_sequence || routine.actions_json}
                      </p>
                      {routine.description && (
                        <p className="text-xs text-slate-400">{routine.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePlayRoutine(routine)}
                        className="spatial-pill-active flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium"
                      >
                        <Play className="h-3.5 w-3.5" />
                        <span>Play</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRoutine(routine)}
                        title="Delete routine"
                        className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:border-rose-400/30 hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: MACRO RECORDER */}
      {activeTab === 'macros' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Motor &amp; UIA Macro Recorder</h2>
              <span
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  isRecording
                    ? 'border border-rose-400/35 bg-rose-500/15 text-rose-300'
                    : 'border border-white/10 bg-white/[0.04] text-slate-400'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRecording ? 'animate-pulse bg-rose-400' : 'bg-slate-500'
                  }`}
                />
                {isRecording ? 'RECORDING' : 'STANDBY'}
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Macro Name</label>
                <input
                  type="text"
                  value={macroName}
                  onChange={(e) => setMacroName(e.target.value)}
                  placeholder="e.g. deploy-dashboard-check"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Notes (optional)</label>
                <input
                  type="text"
                  value={macroDesc}
                  onChange={(e) => setMacroDesc(e.target.value)}
                  placeholder="Describe the automation sequence..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
              </div>
            </div>

            {!isRecording ? (
              <button
                type="button"
                onClick={handleStartRecording}
                className="spatial-pill-active flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium"
              >
                <CircleDot className="h-4 w-4" />
                <span>Start Macro Capture</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopRecording}
                className="flex items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-3 text-sm font-medium text-rose-100 transition hover:bg-rose-500/30"
              >
                <Square className="h-4 w-4 fill-current" />
                <span>Stop &amp; Save Macro</span>
              </button>
            )}

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Replay Speed</span>
                <div className="flex items-center gap-1.5">
                  {[0.5, 1, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeedMultiplier(spd)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs transition ${
                        speedMultiplier === spd
                          ? 'spatial-pill-active text-emerald-200'
                          : 'bg-white/[0.04] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between text-xs text-slate-300">
                <span>Safe Dry-Run Replay Mode</span>
                <input
                  type="checkbox"
                  checked={dryRunReplay}
                  onChange={(e) => setDryRunReplay(e.target.checked)}
                  className="h-4 w-4 accent-emerald-400"
                />
              </label>

              {(recorderId || lastMacroAction) && (
                <p className="border-t border-white/10 pt-2.5 font-mono text-[11px] text-emerald-300/90">
                  {recorderId ? `Session ${recorderId} • ` : ''}
                  {lastMacroAction}
                </p>
              )}
            </div>
          </section>

          <section className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-6 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Recorded Macros</h2>
                <p className="text-xs text-slate-400">{macros.length} saved in SQLite WAL</p>
              </div>
              <button
                type="button"
                onClick={fetchMacros}
                disabled={loadingMacros}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMacros ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {macros.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center">
                  <Activity className="mb-2 h-6 w-6 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">
                    {loadingMacros ? 'Loading recorded macros…' : 'No recorded macros yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Start capture on the left to record and save repeatable desktop flows.
                  </p>
                </div>
              ) : (
                macros.map((macro) => (
                  <article
                    key={macro.macro_id || macro.name}
                    className="spatial-panel-interactive flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-100">
                          {macro.name}
                        </h3>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                          {macro.action_count} steps
                        </span>
                        {macro.duration_ms > 0 && (
                          <span className="font-mono text-[11px] text-slate-400">
                            {Math.round(macro.duration_ms)}ms
                          </span>
                        )}
                      </div>
                      {macro.description && (
                        <p className="truncate text-xs text-slate-400">{macro.description}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleReplayMacro(macro)}
                      className="spatial-pill flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-emerald-300"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>{dryRunReplay ? 'Dry Replay' : 'Replay'}</span>
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: SYSTEM GUARDRAILS (KEEP-AWAKE + TEMP PURGE) */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section className="spatial-panel flex flex-col justify-between gap-6 rounded-3xl p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <Coffee className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    keepAwake
                      ? 'border border-emerald-400/30 bg-emerald-400/15 text-emerald-200 animate-mint-breathe'
                      : 'border border-white/10 bg-white/[0.04] text-slate-400'
                  }`}
                >
                  {keepAwake ? 'EXECUTION LOCK ACTIVE' : 'OS POWER POLICY'}
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-slate-100">Win32 Keep-Awake</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Prevents workstation display sleep and idle suspension during long-running agent
                  swarms, builds, or downloads.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleKeepAwake}
              disabled={togglingAwake}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
                keepAwake
                  ? 'border border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : 'spatial-pill-active hover:brightness-110'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>
                {togglingAwake
                  ? 'Updating Power State…'
                  : keepAwake
                    ? 'Release Keep-Awake'
                    : 'Engage Keep-Awake'}
              </span>
            </button>
          </section>

          <section className="spatial-panel flex flex-col justify-between gap-6 rounded-3xl p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
                  <Flame className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-slate-400">
                  &gt; 7 DAYS RETENTION
                </span>
              </div>

              <div>
                <h2 className="text-base font-semibold text-slate-100">Temp &amp; Log Purge</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">
                  Safely sweeps expired diagnostic logs under <code className="text-slate-200">~/.nexus-agent/logs</code>{' '}
                  older than seven days.
                </p>
              </div>

              {lastPurgeReport && (
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
                  {lastPurgeReport.dryRun ? 'Dry-Run Scan' : 'Purge Completed'}:{' '}
                  <span className="font-mono font-semibold">
                    {lastPurgeReport.removedFiles} files
                  </span>{' '}
                  ({lastPurgeReport.reclaimedMb} MB)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handlePurgeTemp(true)}
                disabled={purging}
                className="spatial-pill rounded-xl px-4 py-3 text-sm font-medium text-slate-200 disabled:opacity-50"
              >
                Dry-Run Scan
              </button>
              <button
                type="button"
                onClick={() => handlePurgeTemp(false)}
                disabled={purging}
                className="spatial-pill-active rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-50"
              >
                {purging ? 'Sweeping…' : 'Purge Stale Logs'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: EXPENSES SUMMARY */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {(['week', 'month', 'year'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setExpensePeriod(period)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-medium capitalize transition ${
                    expensePeriod === period
                      ? 'spatial-pill-active text-emerald-200'
                      : 'spatial-pill text-slate-300'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchExpenses(expensePeriod)}
              disabled={loadingExpenses}
              className="spatial-pill flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs text-slate-200"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingExpenses ? 'animate-spin' : ''}`} />
              <span>Refresh Ledger</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="spatial-panel rounded-3xl p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Total Spend ({expenses?.period || expensePeriod})
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-emerald-300">
                {expenses?.currency || 'INR'}{' '}
                {typeof expenses?.total_spend === 'number'
                  ? expenses.total_spend.toLocaleString()
                  : '0'}
              </p>
            </div>

            <div className="spatial-panel rounded-3xl p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Recorded Transactions
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-100">
                {expenses?.transaction_count ?? 0}
              </p>
            </div>

            <div className="spatial-panel rounded-3xl p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Ledger Privacy
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-100">
                {expenses?.air_gapped ? 'SILENT Air-Gapped' : 'Local SQLite WAL'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="spatial-panel rounded-3xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-100">Category Breakdown</h2>
              {categoryEntries.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No category spend entries recorded for this period.
                </p>
              ) : (
                <div className="space-y-3">
                  {categoryEntries.map(([category, amount]) => {
                    const widthPct = Math.max(6, Math.round((amount / maxCategoryAmount) * 100))
                    return (
                      <div key={category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-200">{category}</span>
                          <span className="font-mono text-emerald-300">
                            {expenses?.currency || 'INR'} {amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full bg-emerald-400/80"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {(expenses?.top_merchants?.length || 0) > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Top Merchants
                  </h3>
                  <div className="space-y-2">
                    {expenses?.top_merchants?.slice(0, 5).map((m) => (
                      <div
                        key={m.merchant}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
                      >
                        <span className="text-slate-200">
                          {m.merchant}{' '}
                          <span className="text-slate-500">({m.count}x)</span>
                        </span>
                        <span className="font-mono text-slate-100">
                          {expenses?.currency || 'INR'} {m.total.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="spatial-panel rounded-3xl p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-100">Recent Expenses</h2>
              {!expenses?.recent_expenses || expenses.recent_expenses.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No recent transactions recorded in SQLite WAL.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {expenses.recent_expenses.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">
                          {item.merchant}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.category}
                          {item.payment_method ? ` • ${item.payment_method}` : ''}
                          {item.txn_date ? ` • ${item.txn_date}` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-emerald-300">
                        {item.currency || expenses.currency || 'INR'} {item.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

export default AutopilotView
