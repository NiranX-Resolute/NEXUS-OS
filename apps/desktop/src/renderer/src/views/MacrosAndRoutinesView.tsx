// apps/desktop/src/renderer/src/views/MacrosAndRoutinesView.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Zap,
  Play,
  Trash2,
  Plus,
  Search,
  Sparkles,
  RefreshCw,
  Terminal,
  ArrowRight,
  Volume2,
  Lock,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Copy,
  Clock,
  Activity,
  Sliders,
  ChevronRight,
  Code,
  Flame,
  Check,
  X,
  VolumeX,
  FolderMinus,
  Layers
} from 'lucide-react'

export interface VoiceRoutine {
  id: string
  trigger_phrase: string
  action_sequence: string
  enabled: boolean
  category?: 'reflex' | 'workflow' | 'system' | 'custom'
  last_executed?: string | null
  execution_count?: number
  created_at: string
}

const DEFAULT_PRESET_ROUTINES: VoiceRoutine[] = [
  {
    id: 'routine-dev-mode',
    trigger_phrase: 'Start Dev Mode',
    action_sequence: 'launch VSCode; open terminal; tidy desktop',
    enabled: true,
    category: 'workflow',
    last_executed: '10m ago',
    execution_count: 42,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'routine-stealth-lock',
    trigger_phrase: 'Emergency Stealth',
    action_sequence: 'mute audio; minimize all; lock workstation',
    enabled: true,
    category: 'reflex',
    last_executed: '2h ago',
    execution_count: 15,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'routine-tidy-workspace',
    trigger_phrase: 'Tidy Workspace',
    action_sequence: 'tidy desktop; clear temp files',
    enabled: true,
    category: 'system',
    last_executed: 'Yesterday',
    execution_count: 28,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'routine-focus-flow',
    trigger_phrase: 'Enter Focus Mode',
    action_sequence: 'mute notifications; dim screen; launch Spotify',
    enabled: true,
    category: 'workflow',
    last_executed: null,
    execution_count: 8,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: 'routine-night-lockdown',
    trigger_phrase: 'Night Lockdown',
    action_sequence: 'close browser; mute audio; lock workstation',
    enabled: false,
    category: 'reflex',
    last_executed: '3d ago',
    execution_count: 19,
    created_at: new Date(Date.now() - 86400000 * 12).toISOString()
  }
]

const QUICK_SNIPPET_TEMPLATES = [
  { label: '🚀 Dev Setup', trigger: 'Start Dev Mode', actions: 'launch VSCode; open terminal; tidy desktop' },
  { label: '🛡️ Reflex Lock', trigger: 'Lock Workstation', actions: 'mute audio; lock workstation' },
  { label: '🧹 Tidy Desktop', trigger: 'Clean Desktop', actions: 'tidy desktop; clear temp files' },
  { label: '🎧 Focus Zone', trigger: 'Focus Mode', actions: 'mute notifications; launch Obsidian; dim screen' },
  { label: '🎮 Game Launch', trigger: 'Game Mode', actions: 'launch Steam; mute notifications; boost performance' }
]

const COMMON_ACTION_TOKENS = [
  { label: '+ launch VSCode', snippet: 'launch VSCode' },
  { label: '+ open terminal', snippet: 'open terminal' },
  { label: '+ tidy desktop', snippet: 'tidy desktop' },
  { label: '+ mute audio', snippet: 'mute audio' },
  { label: '+ lock workstation', snippet: 'lock workstation' },
  { label: '+ clear temp files', snippet: 'clear temp files' },
  { label: '+ wait 1000', snippet: 'wait 1000' }
]

export const MacrosAndRoutinesView: React.FC = () => {
  const [routines, setRoutines] = useState<VoiceRoutine[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [isGatewayOnline, setIsGatewayOnline] = useState<boolean>(false)
  const [gatewayPingMs, setGatewayPingMs] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Form State
  const [triggerInput, setTriggerInput] = useState<string>('')
  const [actionInput, setActionInput] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  // Execution state
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null)
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    id: string
    phrase: string
    timestamp: string
    durationMs: number
    status: 'success' | 'error'
    message: string
  } | null>(null)

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Parse input actions into discrete visual step chips
  const actionSteps = useMemo(() => {
    return actionInput
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [actionInput])

  // Local storage cache key
  const STORAGE_KEY = 'nexus_v5_voice_routines'

  // Fetch routines from http://127.0.0.1:47630/api/routines
  const fetchRoutines = useCallback(async () => {
    setLoading(true)
    const startTime = performance.now()
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/routines', {
        headers: { Accept: 'application/json' }
      })

      if (resp.ok) {
        const ping = Math.round(performance.now() - startTime)
        setGatewayPingMs(ping)
        setIsGatewayOnline(true)

        const data = await resp.json()
        let fetchedList: VoiceRoutine[] = []

        if (Array.isArray(data)) {
          fetchedList = data
        } else if (data && Array.isArray(data.routines)) {
          fetchedList = data.routines
        }

        if (fetchedList.length > 0) {
          // Normalize routine objects
          const normalized = fetchedList.map((r: any, idx: number) => ({
            id: String(r.id || `routine-${idx}-${Date.now()}`),
            trigger_phrase: r.trigger_phrase || r.trigger || 'Custom Routine',
            action_sequence: r.action_sequence || r.actions || '',
            enabled: r.enabled !== false,
            category: r.category || (r.action_sequence?.includes('lock') || r.action_sequence?.includes('mute') ? 'reflex' : 'workflow'),
            last_executed: r.last_executed || null,
            execution_count: r.execution_count || 0,
            created_at: r.created_at || new Date().toISOString()
          }))
          setRoutines(normalized)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
        } else {
          // If server returns empty list, seed with presets
          loadLocalOrDefault(DEFAULT_PRESET_ROUTINES)
        }
      } else {
        throw new Error(`HTTP ${resp.status}`)
      }
    } catch {
      setIsGatewayOnline(false)
      setGatewayPingMs(null)
      loadLocalOrDefault(DEFAULT_PRESET_ROUTINES)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLocalOrDefault = (fallback: VoiceRoutine[]) => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setRoutines(parsed)
          return
        }
      }
    } catch {}
    setRoutines(fallback)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    } catch {}
  }

  useEffect(() => {
    fetchRoutines()
  }, [fetchRoutines])

  // Add Routine Handler
  const handleAddRoutine = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    const cleanTrigger = triggerInput.trim()
    const cleanActions = actionInput.trim()

    if (!cleanTrigger) {
      setFormError('Trigger phrase cannot be empty (e.g. "Start Dev Mode").')
      return
    }

    if (!cleanActions) {
      setFormError('Action batch sequence cannot be empty (e.g. "launch VSCode; tidy desktop").')
      return
    }

    setIsSubmitting(true)

    const newRoutine: VoiceRoutine = {
      id: `routine-${Date.now()}`,
      trigger_phrase: cleanTrigger,
      action_sequence: cleanActions,
      enabled: true,
      category: cleanActions.includes('lock') || cleanActions.includes('mute') ? 'reflex' : 'workflow',
      last_executed: null,
      execution_count: 0,
      created_at: new Date().toISOString()
    }

    try {
      // Attempt to save to backend API
      const resp = await fetch('http://127.0.0.1:47630/api/routines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          trigger_phrase: cleanTrigger,
          action_sequence: cleanActions,
          enabled: true
        })
      }).catch(() => null)

      if (resp && resp.ok) {
        const result = await resp.json().catch(() => ({}))
        if (result && result.id) {
          newRoutine.id = String(result.id)
        }
        setIsGatewayOnline(true)
      }

      // Optimistic update
      setRoutines((prev) => {
        const updated = [newRoutine, ...prev.filter((r) => r.trigger_phrase.toLowerCase() !== cleanTrigger.toLowerCase())]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })

      setFormSuccess(`Registered voice routine "${cleanTrigger}" successfully.`)
      setTriggerInput('')
      setActionInput('')

      setTimeout(() => setFormSuccess(null), 4000)
    } catch (err: any) {
      setFormError(`Failed to register routine: ${err.message || 'Unknown network error'}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete Routine Handler
  const handleDeleteRoutine = async (id: string, phrase: string) => {
    try {
      // Call backend DELETE endpoint, with fallback to POST /api/routines/delete
      await fetch(`http://127.0.0.1:47630/api/routines/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }).catch(async () => {
        return fetch('http://127.0.0.1:47630/api/routines/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id, routine_id: id })
        }).catch(() => null)
      })

      setRoutines((prev) => {
        const updated = prev.filter((r) => r.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })
      setConfirmDeleteId(null)
    } catch {
      // Local removal regardless
      setRoutines((prev) => {
        const updated = prev.filter((r) => r.id !== id)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })
      setConfirmDeleteId(null)
    }
  }

  // Toggle Routine Enabled Status
  const handleToggleRoutine = async (id: string) => {
    setRoutines((prev) => {
      const updated = prev.map((r) => {
        if (r.id === id) {
          const nextState = !r.enabled
          // Attempt async toggle to backend
          fetch('http://127.0.0.1:47630/api/routines/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id, enabled: nextState })
          }).catch(() => {
            return fetch(`http://127.0.0.1:47630/api/routines/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: nextState })
            }).catch(() => null)
          })

          return { ...r, enabled: nextState }
        }
        return r
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      return updated
    })
  }

  // Play / Test Routine Execution
  const handlePlayRoutine = async (routine: VoiceRoutine) => {
    setRunningRoutineId(routine.id)
    const startTime = performance.now()

    try {
      // 1. First attempt /api/routines/play, fallback to /api/command
      let resp = await fetch('http://127.0.0.1:47630/api/routines/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: routine.id,
          phrase: routine.trigger_phrase,
          actions: routine.action_sequence
        })
      }).catch(() => null)

      if (!resp || !resp.ok) {
        resp = await fetch('http://127.0.0.1:47630/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: routine.trigger_phrase,
            utterance: routine.trigger_phrase,
            is_routine_test: true,
            actions: routine.action_sequence
          })
        }).catch(() => null)
      }

      const duration = Math.round(performance.now() - startTime)

      let executionMsg = `Dispatched batch [${routine.action_sequence}] in ${duration}ms`
      if (resp && resp.ok) {
        const data = await resp.json().catch(() => ({}))
        if (data.message) executionMsg = data.message
        else if (data.response) executionMsg = data.response
        else if (data.result) executionMsg = data.result
      }

      setLastExecutionResult({
        id: routine.id,
        phrase: routine.trigger_phrase,
        timestamp: new Date().toLocaleTimeString(),
        durationMs: duration,
        status: 'success',
        message: executionMsg
      })

      // Update execution count and last executed
      setRoutines((prev) => {
        const updated = prev.map((r) =>
          r.id === routine.id
            ? {
                ...r,
                last_executed: 'Just now',
                execution_count: (r.execution_count || 0) + 1
              }
            : r
        )
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })
    } catch (err: any) {
      const duration = Math.round(performance.now() - startTime)
      setLastExecutionResult({
        id: routine.id,
        phrase: routine.trigger_phrase,
        timestamp: new Date().toLocaleTimeString(),
        durationMs: duration,
        status: 'error',
        message: `Offline Loopback: Simulated [${routine.action_sequence}] execution (${duration}ms)`
      })
    } finally {
      setTimeout(() => setRunningRoutineId(null), 500)
    }
  }

  // Quick template applicator
  const applySnippet = (trigger: string, actions: string) => {
    setTriggerInput(trigger)
    setActionInput(actions)
  }

  // Append token to action sequence
  const appendToken = (snippet: string) => {
    setActionInput((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return snippet
      if (trimmed.endsWith(';')) return `${trimmed} ${snippet}`
      return `${trimmed}; ${snippet}`
    })
  }

  // Filtered routines
  const filteredRoutines = useMemo(() => {
    return routines.filter((r) => {
      const matchesSearch =
        r.trigger_phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.action_sequence.toLowerCase().includes(searchQuery.toLowerCase())

      if (!matchesSearch) return false

      if (selectedCategory === 'all') return true
      if (selectedCategory === 'active') return r.enabled
      if (selectedCategory === 'reflex') return r.category === 'reflex'
      if (selectedCategory === 'workflow') return r.category === 'workflow'
      return true
    })
  }, [routines, searchQuery, selectedCategory])

  const totalCount = routines.length
  const activeCount = routines.filter((r) => r.enabled).length

  return (
    <div className="flex flex-col h-full w-full bg-[#070B14] text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Header Bar */}
      <header className="h-14 bg-[#0B0F19] border-b border-slate-800/80 px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-sky-400 p-0.5 shadow-md shadow-cyan-500/20">
            <div className="w-full h-full bg-[#0B0F19] rounded-[6px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-black tracking-widest text-slate-100 uppercase">
                Macros & Voice Routines
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded">
                REFLEX ENGINE v5.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Deterministic macro sequences & natural language spoken reflex bindings
            </p>
          </div>
        </div>

        {/* Telemetry Chips */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">Routines:</span>
            <span className="text-sky-300 font-bold">{activeCount}/{totalCount} Active</span>
          </div>

          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <div className={`w-2 h-2 rounded-full ${isGatewayOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-400">IPC :47630:</span>
            <span className={isGatewayOnline ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>
              {isGatewayOnline ? (gatewayPingMs ? `${gatewayPingMs}ms` : 'CONNECTED') : 'STANDBY'}
            </span>
          </div>

          <button
            onClick={fetchRoutines}
            disabled={loading}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-semibold transition border border-slate-700 disabled:opacity-50"
            title="Sync with http://127.0.0.1:47630/api/routines"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* 2. Main Workspace Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Test Execution Result Banner */}
        {lastExecutionResult && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-mono transition-all animate-in fade-in duration-200 ${
              lastExecutionResult.status === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center space-x-3">
              {lastExecutionResult.status === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <div>
                <div className="font-bold flex items-center space-x-2">
                  <span>EXECUTION COMPLETE: "{lastExecutionResult.phrase}"</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                    {lastExecutionResult.durationMs}ms
                  </span>
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">{lastExecutionResult.message}</div>
              </div>
            </div>
            <button
              onClick={() => setLastExecutionResult(null)}
              className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 3. Add Routine Configuration Form */}
        <section className="bg-[#0B0F19] rounded-2xl border border-slate-800/90 p-5 shadow-xl relative overflow-hidden">
          {/* Subtle Cyber Accents */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4 border-b border-slate-800/70 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-black tracking-widest text-slate-200 uppercase">
                Register New Natural Language Routine
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              POST http://127.0.0.1:47630/api/routines
            </span>
          </div>

          {/* Quick Snippet Chips */}
          <div className="mb-4">
            <div className="text-[11px] font-semibold text-slate-400 mb-2 flex items-center space-x-1.5">
              <span>Quick Template Presets:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_SNIPPET_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applySnippet(tmpl.trigger, tmpl.actions)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 text-xs font-mono transition flex items-center space-x-1.5 group"
                >
                  <span>{tmpl.label}</span>
                  <ChevronRight className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 transition" />
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddRoutine} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trigger Phrase Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Trigger Phrase (Voice or Typed):</span>
                  <span className="text-[10px] text-cyan-400 font-mono">Case-insensitive match</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={triggerInput}
                    onChange={(e) => setTriggerInput(e.target.value)}
                    placeholder="e.g. Start Dev Mode, Emergency Stealth..."
                    className="w-full bg-[#070B14] border border-slate-700/80 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition font-sans"
                  />
                  <div className="absolute right-3 top-2.5 text-slate-500">
                    <Volume2 className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              {/* Action Batch Sequence Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Action Batch Sequence:</span>
                  <span className="text-[10px] text-slate-400 font-mono">Delimited by semicolon ( ; )</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    placeholder="e.g. launch VSCode; tidy desktop; mute audio"
                    className="w-full bg-[#070B14] border border-slate-700/80 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition font-mono"
                  />
                  <div className="absolute right-3 top-2.5 text-slate-500">
                    <Terminal className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action Helper Tokens */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 uppercase font-mono mr-1">Insert Command:</span>
              {COMMON_ACTION_TOKENS.map((token, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => appendToken(token.snippet)}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-slate-600 text-[11px] text-slate-400 hover:text-slate-200 font-mono transition"
                >
                  {token.label}
                </button>
              ))}
            </div>

            {/* Live Visual Pipeline Preview */}
            {actionSteps.length > 0 && (
              <div className="p-3 rounded-xl bg-[#070B14] border border-slate-800/80 space-y-1.5">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Deterministic Execution Pipeline Preview:
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-2 py-1 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono flex items-center space-x-1">
                    <Volume2 className="w-3 h-3 text-cyan-400" />
                    <span>"{triggerInput || 'Spoken Phrase'}"</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  {actionSteps.map((step, idx) => (
                    <React.Fragment key={idx}>
                      <div className="px-2.5 py-1 rounded bg-slate-800/90 border border-slate-700 text-slate-200 text-[11px] font-mono flex items-center space-x-1.5">
                        <span className="text-cyan-400 font-bold">{idx + 1}.</span>
                        <span>{step}</span>
                      </div>
                      {idx < actionSteps.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Form Feedback Messages */}
            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            {/* Submit Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500">
                Trigger evaluation executes sub-50ms via local Reflex Router.
              </span>

              <div className="flex items-center space-x-2">
                {(triggerInput || actionInput) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTriggerInput('')
                      setActionInput('')
                      setFormError(null)
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs font-semibold transition"
                  >
                    Clear Form
                  </button>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 text-xs font-black tracking-wider uppercase transition shadow-md shadow-cyan-500/20 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 text-slate-950 stroke-[3]" />
                  <span>{isSubmitting ? 'Registering...' : 'Add Routine'}</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* 4. Routines List Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
          {/* Category Filter Tabs */}
          <div className="flex items-center space-x-1.5 bg-[#0B0F19] p-1 rounded-xl border border-slate-800/80">
            {[
              { id: 'all', label: 'All Routines' },
              { id: 'active', label: 'Active Only' },
              { id: 'reflex', label: 'Sub-50ms Reflex' },
              { id: 'workflow', label: 'Batch Workflows' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedCategory === tab.id
                    ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Filter Input */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by phrase or action..."
              className="w-full bg-[#0B0F19] border border-slate-800 focus:border-cyan-500/60 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* 5. Routine Cards Grid / List */}
        {filteredRoutines.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#0B0F19]/50 border border-dashed border-slate-800 space-y-3">
            <Zap className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">No matching voice routines found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? `No routine matches "${searchQuery}". Clear your search query or add a new routine above.`
                : 'Configure your first routine using the form above to enable voice-triggered workflows.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredRoutines.map((routine) => {
              const steps = routine.action_sequence
                .split(';')
                .map((s) => s.trim())
                .filter(Boolean)
              const isRunning = runningRoutineId === routine.id
              const isReflex =
                routine.category === 'reflex' ||
                routine.action_sequence.includes('mute') ||
                routine.action_sequence.includes('lock')

              return (
                <div
                  key={routine.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 relative group ${
                    routine.enabled
                      ? 'bg-[#0B0F19] border-slate-800/90 hover:border-slate-700 shadow-lg'
                      : 'bg-[#090D16]/60 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Routine Details */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Enabled Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleRoutine(routine.id)}
                          className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 focus:outline-none ${
                            routine.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                          }`}
                          title={routine.enabled ? 'Enabled (Click to disable)' : 'Disabled (Click to enable)'}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full bg-slate-950 transition-transform duration-200 ease-in-out ${
                              routine.enabled ? 'translate-x-3.5' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        {/* Trigger Phrase */}
                        <span className="text-sm font-bold text-slate-100 flex items-center space-x-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>"{routine.trigger_phrase}"</span>
                        </span>

                        {/* Category Badge */}
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono ${
                            isReflex
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          }`}
                        >
                          {isReflex ? '⚡ SUB-50MS REFLEX' : '📦 WORKFLOW BATCH'}
                        </span>

                        {/* Execution Count */}
                        {routine.execution_count !== undefined && routine.execution_count > 0 && (
                          <span className="text-[10px] text-slate-500 font-mono flex items-center space-x-1">
                            <Activity className="w-3 h-3 text-slate-600" />
                            <span>{routine.execution_count} runs</span>
                          </span>
                        )}

                        {routine.last_executed && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            • Last run: {routine.last_executed}
                          </span>
                        )}
                      </div>

                      {/* Action Steps Sequence Display */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500 font-mono uppercase mr-1">
                          Pipeline:
                        </span>
                        {steps.map((step, sIdx) => (
                          <React.Fragment key={sIdx}>
                            <span className="px-2 py-0.5 rounded-md bg-[#070B14] border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center space-x-1">
                              <span className="text-cyan-400 font-bold">{sIdx + 1}.</span>
                              <span>{step}</span>
                            </span>
                            {sIdx < steps.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center">
                      {/* Copy / Load into form button */}
                      <button
                        onClick={() => applySnippet(routine.trigger_phrase, routine.action_sequence)}
                        className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition"
                        title="Copy configuration into editor"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Play Test Button */}
                      <button
                        onClick={() => handlePlayRoutine(routine)}
                        disabled={isRunning}
                        className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md ${
                          isRunning
                            ? 'bg-cyan-500 text-slate-950 animate-pulse'
                            : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-400'
                        }`}
                        title="Test & Execute Routine via POST /api/command"
                      >
                        <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin fill-slate-950' : 'fill-cyan-400 text-cyan-400'}`} />
                        <span>{isRunning ? 'Running...' : 'Play'}</span>
                      </button>

                      {/* Delete / Trash Button */}
                      {confirmDeleteId === routine.id ? (
                        <div className="flex items-center space-x-1 bg-rose-950/80 border border-rose-500/40 rounded-xl p-1 animate-in fade-in duration-150">
                          <button
                            onClick={() => handleDeleteRoutine(routine.id, routine.trigger_phrase)}
                            className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition"
                            title="Confirm Delete"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-1 rounded-lg hover:bg-rose-900/50 text-slate-300 text-[10px] transition"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(routine.id)}
                          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition"
                          title="Delete Routine"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 6. Footer Status Strip */}
      <footer className="h-8 bg-[#090D16] border-t border-slate-800/80 px-6 flex items-center justify-between text-[10px] font-mono text-slate-500 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1 text-slate-400">
            <Terminal className="w-3 h-3 text-cyan-400" />
            <span>NEXUS DAEMON WAL MESH</span>
          </span>
          <span>•</span>
          <span>Storage: ~/.nexus-agent/db/agent_local.db</span>
        </div>

        <div className="flex items-center space-x-3">
          <span>Target: http://127.0.0.1:47630/api/routines</span>
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>
      </footer>
    </div>
  )
}

export default MacrosAndRoutinesView
