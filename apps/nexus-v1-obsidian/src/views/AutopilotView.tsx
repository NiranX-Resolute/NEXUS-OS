import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Circle,
  Coffee,
  CreditCard,
  Disc,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { RoutineItem } from '@/types';

type AutopilotTab = 'routines' | 'macros' | 'system' | 'expenses';

interface RoutinesListResponse {
  success?: boolean;
  routines?: RoutineItem[];
  count?: number;
  error?: string;
}

interface RoutinePlayResponse {
  success?: boolean;
  routine?: RoutineItem;
  actions?: string[];
  results?: Array<Record<string, unknown>>;
  latency_ms?: number;
  error?: string;
}

interface MacroSummary {
  macro_id: string;
  name: string;
  description?: string;
  action_count: number;
  duration_ms?: number;
  tags?: string[];
  created_at?: number;
  updated_at?: number;
}

interface MacroActionItem {
  id?: string;
  action_type?: string;
  type?: string;
  data?: Record<string, unknown>;
  delta_ms?: number;
}

interface MacroDetail extends MacroSummary {
  actions?: MacroActionItem[];
}

interface MacrosListResponse {
  success?: boolean;
  macros?: MacroSummary[];
  count?: number;
  error?: string;
}

interface MacroStartResponse {
  success?: boolean;
  is_recording?: boolean;
  recorder_id?: string;
  error?: string;
}

interface MacroStopResponse {
  success?: boolean;
  is_recording?: boolean;
  action_count?: number;
  actions?: MacroActionItem[];
  saved?: MacroSummary;
  error?: string;
}

interface MacroReplayResponse {
  success?: boolean;
  macro_name?: string;
  actions_executed?: number;
  duration_ms?: number;
  dry_run?: boolean;
  details?: string[];
  error?: string;
}

interface KeepAwakeResponse {
  success?: boolean;
  keep_awake?: boolean;
  enabled?: boolean;
  error?: string;
}

interface PurgeResponse {
  success?: boolean;
  dry_run?: boolean;
  removed_files?: number;
  reclaimed_mb?: number;
  error?: string;
}

interface ExpenseMerchant {
  merchant: string;
  total: number;
  count: number;
}

interface ExpenseItem {
  id: string | number;
  amount: number;
  currency?: string;
  merchant: string;
  category: string;
  payment_method?: string;
  txn_date?: string;
}

interface ExpensesSummaryResponse {
  success?: boolean;
  period?: string;
  total_spend?: number;
  currency?: string;
  transaction_count?: number;
  by_category?: Record<string, number>;
  top_merchants?: ExpenseMerchant[];
  recent_expenses?: ExpenseItem[];
  air_gapped?: boolean;
  error?: string;
}

function formatEpoch(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return 'Never';
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) {
    const ms = num < 1e12 ? num * 1000 : num;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const parsed = Date.parse(String(raw));
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(raw);
}

export function AutopilotView() {
  const { telemetry, pushToast } = useNexusStore();
  const [activeTab, setActiveTab] = useState<AutopilotTab>('routines');

  // Voice Routines state
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [actionSequence, setActionSequence] = useState('');
  const [routineDescription, setRoutineDescription] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [playingRoutineId, setPlayingRoutineId] = useState<string | null>(null);
  const [deletingRoutineId, setDeletingRoutineId] = useState<string | null>(null);
  const [lastRoutineRun, setLastRoutineRun] = useState<{
    name: string;
    actions: string[];
    latencyMs: number;
  } | null>(null);

  // Macro Recorder state
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderId, setRecorderId] = useState<string | null>(null);
  const [macroNameInput, setMacroNameInput] = useState('');
  const [macroDescInput, setMacroDescInput] = useState('');
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
  const [replayDryRun, setReplayDryRun] = useState<boolean>(true);
  const [replayingMacro, setReplayingMacro] = useState<string | null>(null);
  const [lastMacroReplay, setLastMacroReplay] = useState<MacroReplayResponse | null>(null);
  const [selectedMacroDetail, setSelectedMacroDetail] = useState<MacroDetail | null>(null);

  // System Guard state (Keep-Awake & Temp Purge)
  const [keepAwake, setKeepAwake] = useState(false);
  const [keepAwakeLoading, setKeepAwakeLoading] = useState(false);
  const [togglingAwake, setTogglingAwake] = useState(false);
  const [purging, setPurging] = useState(false);
  const [lastPurgeResult, setLastPurgeResult] = useState<PurgeResponse | null>(null);

  // Expenses Summary state
  const [expensePeriod, setExpensePeriod] = useState<'week' | 'month' | 'year'>('month');
  const [expenseSummary, setExpenseSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);

  const loadRoutines = useCallback(async () => {
    setRoutinesLoading(true);
    try {
      const res = await ipcJson<RoutinesListResponse>('/api/routines');
      if (res.success === false) {
        pushToast({
          title: 'Routines Fetch Failed',
          message: res.error ?? 'Unable to load voice routines.',
          tone: 'error',
        });
        return;
      }
      setRoutines(Array.isArray(res.routines) ? res.routines : []);
    } catch (err) {
      pushToast({
        title: 'Routines Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/routines',
        tone: 'error',
      });
    } finally {
      setRoutinesLoading(false);
    }
  }, [pushToast]);

  const loadMacros = useCallback(async () => {
    setMacrosLoading(true);
    try {
      const res = await ipcJson<MacrosListResponse>('/api/macros');
      if (res.success === false) {
        pushToast({
          title: 'Macros Fetch Failed',
          message: res.error ?? 'Unable to list recorded macros.',
          tone: 'error',
        });
        return;
      }
      setMacros(Array.isArray(res.macros) ? res.macros : []);
    } catch (err) {
      pushToast({
        title: 'Macros Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/macros',
        tone: 'error',
      });
    } finally {
      setMacrosLoading(false);
    }
  }, [pushToast]);

  const loadKeepAwake = useCallback(async () => {
    setKeepAwakeLoading(true);
    try {
      const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake');
      if (res.success !== false) {
        setKeepAwake(Boolean(res.keep_awake ?? res.enabled));
      }
    } catch {
      // Gateway offline; keep existing toggle state
    } finally {
      setKeepAwakeLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(
    async (period: 'week' | 'month' | 'year' = expensePeriod) => {
      setExpensesLoading(true);
      try {
        const res = await ipcJson<ExpensesSummaryResponse>(
          `/api/expenses/summary?period=${encodeURIComponent(period)}`
        );
        if (res.success === false) {
          pushToast({
            title: 'Expenses Fetch Failed',
            message: res.error ?? 'Unable to summarize local ledger.',
            tone: 'error',
          });
          return;
        }
        setExpenseSummary(res);
      } catch (err) {
        pushToast({
          title: 'Expenses Offline',
          message: err instanceof Error ? err.message : 'Unable to reach /api/expenses/summary',
          tone: 'error',
        });
      } finally {
        setExpensesLoading(false);
      }
    },
    [expensePeriod, pushToast]
  );

  useEffect(() => {
    void loadRoutines();
    void loadMacros();
    void loadKeepAwake();
    void loadExpenses('month');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice Routine Handlers
  const handleRegisterRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = triggerPhrase.trim();
    const sequence = actionSequence.trim();
    if (!trigger || !sequence || savingRoutine) return;

    setSavingRoutine(true);
    try {
      const res = await ipcJson<{ success?: boolean; routine?: RoutineItem; error?: string }>(
        '/api/routines',
        {
          method: 'POST',
          body: JSON.stringify({
            trigger_phrase: trigger,
            action_sequence: sequence,
            enabled: true,
            description: routineDescription.trim(),
          }),
        }
      );
      if (res.success === false) {
        pushToast({
          title: 'Routine Save Rejected',
          message: res.error ?? 'Unable to register routine.',
          tone: 'error',
        });
        return;
      }
      setTriggerPhrase('');
      setActionSequence('');
      setRoutineDescription('');
      pushToast({
        title: 'Voice Routine Registered',
        message: trigger,
        tone: 'success',
      });
      await loadRoutines();
    } catch (err) {
      pushToast({
        title: 'Routine Save Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/routines',
        tone: 'error',
      });
    } finally {
      setSavingRoutine(false);
    }
  };

  const handlePlayRoutine = async (routine: RoutineItem) => {
    const key = routine.id || routine.name || routine.trigger_phrase;
    if (!key || playingRoutineId) return;
    setPlayingRoutineId(key);
    try {
      const res = await ipcJson<RoutinePlayResponse>('/api/routines/play', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id || routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Routine Execution Failed',
          message: res.error ?? `Unable to run '${routine.trigger_phrase}'`,
          tone: 'error',
        });
        return;
      }
      const actions = Array.isArray(res.actions) ? res.actions : [];
      const latencyMs = typeof res.latency_ms === 'number' ? res.latency_ms : 0;
      setLastRoutineRun({
        name: routine.trigger_phrase || routine.name,
        actions,
        latencyMs,
      });
      pushToast({
        title: `Routine Executed (${Math.round(latencyMs)} ms)`,
        message: `${routine.trigger_phrase} · ${actions.length} step(s)`,
        tone: 'success',
      });
      void loadRoutines();
    } catch (err) {
      pushToast({
        title: 'Routine Play Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/routines/play',
        tone: 'error',
      });
    } finally {
      setPlayingRoutineId(null);
    }
  };

  const handleDeleteRoutine = async (routine: RoutineItem) => {
    const key = routine.id || routine.name || routine.trigger_phrase;
    if (!key || deletingRoutineId) return;
    setDeletingRoutineId(key);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>('/api/routines/delete', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id || routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Routine Delete Failed',
          message: res.error ?? 'Could not remove routine.',
          tone: 'error',
        });
        return;
      }
      setRoutines((prev) =>
        prev.filter((r) => (r.id || r.name) !== (routine.id || routine.name))
      );
      pushToast({
        title: 'Routine Deleted',
        message: routine.trigger_phrase || routine.name,
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Delete Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/routines/delete',
        tone: 'error',
      });
    } finally {
      setDeletingRoutineId(null);
    }
  };

  // Macro Recorder Handlers
  const handleStartMacroRecording = async () => {
    if (recordingBusy || isRecording) return;
    setRecordingBusy(true);
    try {
      const res = await ipcJson<MacroStartResponse>('/api/macros/start', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast({
          title: 'Recorder Start Failed',
          message: res.error ?? 'Unable to initialize macro session.',
          tone: 'error',
        });
        return;
      }
      setIsRecording(true);
      setRecorderId(res.recorder_id ?? null);
      pushToast({
        title: 'Macro Recording Active',
        message: res.recorder_id ? `Session ${res.recorder_id}` : 'Capturing motor actions',
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Recorder Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/macros/start',
        tone: 'error',
      });
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleStopMacroRecording = async () => {
    if (recordingBusy || !isRecording) return;
    setRecordingBusy(true);
    const saveName = macroNameInput.trim() || `macro-${Date.now()}`;
    try {
      const res = await ipcJson<MacroStopResponse>('/api/macros/stop', {
        method: 'POST',
        body: JSON.stringify({
          name: saveName,
          description: macroDescInput.trim(),
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Recorder Stop Failed',
          message: res.error ?? 'Unable to finalize macro recording.',
          tone: 'error',
        });
        return;
      }
      setIsRecording(false);
      setRecorderId(null);
      setMacroNameInput('');
      setMacroDescInput('');
      pushToast({
        title: 'Macro Saved',
        message: `${saveName} (${res.action_count ?? 0} actions)`,
        tone: 'success',
      });
      await loadMacros();
    } catch (err) {
      pushToast({
        title: 'Recorder Stop Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/macros/stop',
        tone: 'error',
      });
    } finally {
      setRecordingBusy(false);
    }
  };

  const handleInspectMacro = async (macro: MacroSummary) => {
    try {
      const res = await ipcJson<{ success?: boolean; macro?: MacroDetail; error?: string }>(
        `/api/macros/${encodeURIComponent(macro.name)}`
      );
      if (res.success !== false && res.macro) {
        setSelectedMacroDetail(res.macro);
      } else {
        setSelectedMacroDetail(macro);
      }
    } catch {
      setSelectedMacroDetail(macro);
    }
  };

  const handleReplayMacro = async (macro: MacroSummary) => {
    if (replayingMacro) return;
    setReplayingMacro(macro.name);
    try {
      let res = await ipcJson<MacroReplayResponse>('/api/macros/replay', {
        method: 'POST',
        body: JSON.stringify({
          name: macro.name,
          speed_multiplier: replaySpeed,
          dry_run: replayDryRun,
          auto_approve: true,
        }),
      });

      // If macro exists only in recorded_macros table, hydrate actions and replay directly
      if (res.success === false) {
        const detail = await ipcJson<{ success?: boolean; macro?: MacroDetail }>(
          `/api/macros/${encodeURIComponent(macro.name)}`
        );
        if (detail.success !== false && Array.isArray(detail.macro?.actions)) {
          res = await ipcJson<MacroReplayResponse>('/api/macros/replay', {
            method: 'POST',
            body: JSON.stringify({
              actions: detail.macro.actions,
              speed_multiplier: replaySpeed,
              dry_run: replayDryRun,
              auto_approve: true,
            }),
          });
        }
      }

      if (res.success === false) {
        pushToast({
          title: 'Macro Replay Rejected',
          message: res.error ?? `Unable to replay ${macro.name}`,
          tone: 'error',
        });
        return;
      }

      setLastMacroReplay(res);
      pushToast({
        title: replayDryRun ? 'Macro Dry-Run Verified' : 'Macro Replayed',
        message: `${macro.name} · ${res.actions_executed ?? 0} actions (${res.duration_ms ?? 0} ms)`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Macro Replay Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/macros/replay',
        tone: 'error',
      });
    } finally {
      setReplayingMacro(null);
    }
  };

  // System Guard Handlers
  const handleToggleKeepAwake = async () => {
    if (togglingAwake) return;
    setTogglingAwake(true);
    const nextEnabled = !keepAwake;
    try {
      const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake', {
        method: 'POST',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Keep-Awake Failed',
          message: res.error ?? 'Unable to update Win32 execution state.',
          tone: 'error',
        });
        return;
      }
      const resolved = Boolean(res.keep_awake ?? res.enabled ?? nextEnabled);
      setKeepAwake(resolved);
      pushToast({
        title: resolved ? 'Keep-Awake Active' : 'Keep-Awake Released',
        message: resolved
          ? 'System sleep & display idle suppressed.'
          : 'Normal OS power management restored.',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Keep-Awake Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/system/keep-awake',
        tone: 'error',
      });
    } finally {
      setTogglingAwake(false);
    }
  };

  const handlePurgeTemp = async (dryRun: boolean) => {
    if (purging) return;
    setPurging(true);
    try {
      const res = await ipcJson<PurgeResponse>('/api/system/purge', {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Temp Purge Failed',
          message: res.error ?? 'Unable to scan ~/.nexus-agent/logs.',
          tone: 'error',
        });
        return;
      }
      setLastPurgeResult(res);
      pushToast({
        title: dryRun ? 'Purge Preview Complete' : 'Temp Logs Purged',
        message: `${res.removed_files ?? 0} file(s) · ${res.reclaimed_mb ?? 0} MB ${
          dryRun ? 'eligible' : 'reclaimed'
        }`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Temp Purge Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/system/purge',
        tone: 'error',
      });
    } finally {
      setPurging(false);
    }
  };

  const categoryEntries = Object.entries(expenseSummary?.by_category ?? {});
  const maxCategoryAmount = categoryEntries.reduce(
    (max, [, amount]) => (amount > max ? amount : max),
    1
  );

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-obsidian-fade overflow-hidden">
      {/* Header & Clean Tabbed Hub Switcher */}
      <header className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-6 shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autonomous Reflex &amp; Maintenance</span>
            {telemetry.estopActive && (
              <span className="px-2 py-0.5 rounded border border-red-500/40 bg-red-500/10 text-red-300">
                ESTOP LOCKED
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Autopilot Automation Hub
          </h1>
        </div>

        <nav
          aria-label="Autopilot sections"
          className="inline-flex flex-wrap items-center rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-1 gap-1"
        >
          {(
            [
              { id: 'routines', label: 'Voice Routines', icon: Volume2 },
              { id: 'macros', label: 'Macro Recorder', icon: Disc },
              { id: 'system', label: 'System Guard', icon: ShieldCheck },
              { id: 'expenses', label: 'Expenses', icon: CreditCard },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* TAB 1: Voice Routines */}
      {activeTab === 'routines' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
          <section className="lg:col-span-7 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-4 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Registered Voice Routines ({routines.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Deterministic sub-50ms reflex sequences stored in SQLite WAL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadRoutines()}
                disabled={routinesLoading}
                className="px-3 py-2 rounded-lg border border-[var(--border)] hover:border-emerald-500/45 bg-[var(--panel-muted)] text-xs font-medium text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${routinesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {lastRoutineRun && (
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/5 px-4 py-3 text-xs font-mono text-emerald-300 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span>
                  Executed &ldquo;{lastRoutineRun.name}&rdquo; · {lastRoutineRun.actions.length}{' '}
                  action(s)
                </span>
                <span className="text-[var(--text-muted)]">
                  {Math.round(lastRoutineRun.latencyMs)} ms
                </span>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {routines.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  {routinesLoading
                    ? 'Loading voice routines...'
                    : 'No voice routines registered yet. Add one on the right.'}
                </div>
              ) : (
                routines.map((routine) => {
                  const key = routine.id || routine.name;
                  const playing = playingRoutineId === key;
                  const deleting = deletingRoutineId === key;
                  return (
                    <article
                      key={key}
                      className="rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border)] bg-[var(--panel-muted)] p-4 flex items-start justify-between gap-4 transition-colors"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium text-[var(--text)]">
                            &ldquo;{routine.trigger_phrase || routine.name}&rdquo;
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${
                              routine.enabled
                                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                                : 'border-[var(--border)] text-[var(--text-muted)]'
                            }`}
                          >
                            {routine.enabled ? 'Active' : 'Paused'}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--text-muted)]">
                            {routine.execution_count ?? 0} runs
                          </span>
                        </div>

                        <p className="text-xs font-mono text-[var(--text-secondary)] break-words">
                          {routine.action_sequence || routine.actions_json}
                        </p>

                        {routine.description && (
                          <p className="text-xs text-[var(--text-muted)]">{routine.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handlePlayRoutine(routine)}
                          disabled={Boolean(playingRoutineId)}
                          className="px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3" />
                          {playing ? 'Running...' : 'Play'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRoutine(routine)}
                          disabled={deleting}
                          title="Delete routine"
                          className="p-2 rounded-lg border border-[var(--border-subtle)] hover:border-red-500/40 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="lg:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Create Voice Routine</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Bind a natural utterance to semicolon-separated reflex commands.
              </p>
            </div>

            <form onSubmit={handleRegisterRoutine} className="flex flex-col gap-4 flex-1">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Trigger Phrase
                </label>
                <input
                  type="text"
                  required
                  value={triggerPhrase}
                  onChange={(e) => setTriggerPhrase(e.target.value)}
                  placeholder="e.g., Start Dev Mode"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Action Sequence (Semicolon-Delimited)
                </label>
                <textarea
                  required
                  rows={4}
                  value={actionSequence}
                  onChange={(e) => setActionSequence(e.target.value)}
                  placeholder="e.g., keep awake on; mute system audio; clear temp logs"
                  className="w-full resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-3 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={routineDescription}
                  onChange={(e) => setRoutineDescription(e.target.value)}
                  placeholder="Prepares quiet deep-focus workstation state"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingRoutine || !triggerPhrase.trim() || !actionSequence.trim()}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-auto"
              >
                <Plus className="w-4 h-4" />
                {savingRoutine ? 'Saving Routine...' : 'Register Voice Routine'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 2: Macro Recorder */}
      {activeTab === 'macros' && (
        <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Calm Recorder Control Strip */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
              <div className="flex items-center gap-2.5">
                <Circle
                  className={`w-3 h-3 ${
                    isRecording ? 'text-red-400 fill-red-400 animate-pulse' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                  {isRecording ? `Recording (${recorderId ?? 'active'})` : 'Recorder Ready'}
                </span>
              </div>

              {isRecording && (
                <>
                  <input
                    type="text"
                    value={macroNameInput}
                    onChange={(e) => setMacroNameInput(e.target.value)}
                    placeholder="Macro name..."
                    className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none w-48"
                  />
                  <input
                    type="text"
                    value={macroDescInput}
                    onChange={(e) => setMacroDescInput(e.target.value)}
                    placeholder="Optional note..."
                    className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] outline-none flex-1 min-w-[160px]"
                  />
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replayDryRun}
                  onChange={(e) => setReplayDryRun(e.target.checked)}
                  className="accent-emerald-500"
                />
                Dry-Run Replay
              </label>

              <select
                value={replaySpeed}
                onChange={(e) => setReplaySpeed(Number(e.target.value))}
                aria-label="Replay speed multiplier"
                className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--text)] outline-none"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1.0x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => void handleStartMacroRecording()}
                  disabled={recordingBusy}
                  className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <Disc className="w-3.5 h-3.5" />
                  Start Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStopMacroRecording()}
                  disabled={recordingBusy}
                  className="px-4 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/45 text-red-300 text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop &amp; Save
                </button>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Macro List */}
            <section className="lg:col-span-7 obsidian-panel rounded-xl p-6 flex flex-col gap-4 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between gap-4 shrink-0">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Saved Macros ({macros.length})
                </h2>
                <button
                  type="button"
                  onClick={() => void loadMacros()}
                  disabled={macrosLoading}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-emerald-500/40 text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${macrosLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                {macros.length === 0 ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                    {macrosLoading
                      ? 'Loading recorded_macros...'
                      : 'No macros recorded yet. Start a recording session above.'}
                  </div>
                ) : (
                  macros.map((macro) => {
                    const replaying = replayingMacro === macro.name;
                    const selected = selectedMacroDetail?.name === macro.name;
                    return (
                      <article
                        key={macro.macro_id || macro.name}
                        className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-colors ${
                          selected
                            ? 'border-emerald-500/45 bg-emerald-500/5'
                            : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => void handleInspectMacro(macro)}
                          className="text-left min-w-0 flex-1 space-y-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-medium text-[var(--text)] truncate">
                              {macro.name}
                            </h3>
                            <span className="px-2 py-0.5 rounded border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)]">
                              {macro.action_count} steps
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {macro.description || `Updated ${formatEpoch(macro.updated_at)}`}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleReplayMacro(macro)}
                          disabled={Boolean(replayingMacro)}
                          className="px-3.5 py-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {replaying ? 'Running...' : replayDryRun ? 'Dry-Run' : 'Replay'}
                        </button>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            {/* Macro Inspector & Replay Log */}
            <section className="lg:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  {selectedMacroDetail ? `Macro: ${selectedMacroDetail.name}` : 'Execution & Steps'}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  ScopeGuard sanitized steps (`${'{VAULT:...}'}` masking) and replay output.
                </p>
              </div>

              {lastMacroReplay && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono text-emerald-300">
                    <span>
                      {lastMacroReplay.dry_run ? 'DRY-RUN VERIFIED' : 'REPLAY EXECUTED'} ·{' '}
                      {lastMacroReplay.actions_executed ?? 0} actions
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {lastMacroReplay.duration_ms ?? 0} ms
                    </span>
                  </div>
                  {Array.isArray(lastMacroReplay.details) && lastMacroReplay.details.length > 0 && (
                    <ul className="space-y-1 text-xs font-mono text-[var(--text-secondary)]">
                      {lastMacroReplay.details.slice(0, 8).map((item, idx) => (
                        <li key={idx} className="truncate">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {selectedMacroDetail?.actions && selectedMacroDetail.actions.length > 0 ? (
                <div className="space-y-2">
                  {selectedMacroDetail.actions.map((step, idx) => (
                    <div
                      key={step.id || idx}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-3.5 py-2.5 text-xs font-mono flex items-center justify-between gap-3"
                    >
                      <span className="text-emerald-300 shrink-0">
                        #{idx + 1} {step.action_type ?? step.type ?? 'action'}
                      </span>
                      <span className="text-[var(--text-secondary)] truncate">
                        {JSON.stringify(step.data ?? {})}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-6 text-xs font-mono text-[var(--text-muted)]">
                  Select a saved macro from the left panel to inspect its recorded steps, or press{' '}
                  {replayDryRun ? 'Dry-Run' : 'Replay'} to execute.
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 3: System Guard (Keep-Awake + Temp Purge) */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-y-auto">
          {/* Keep-Awake Card */}
          <section className="obsidian-panel rounded-xl p-6 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Coffee className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-base font-semibold text-[var(--text)]">
                    Sovereign Keep-Awake
                  </h2>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-md border text-[11px] font-mono uppercase tracking-wider ${
                    keepAwake
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                      : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-muted)]'
                  }`}
                >
                  {keepAwakeLoading ? 'Checking...' : keepAwake ? 'Active' : 'Standby'}
                </span>
              </div>

              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Asserts native Win32 <code className="font-mono text-xs">ES_CONTINUOUS</code>{' '}
                execution state so long autonomous builds, local inference, or downloads never
                suspend mid-flight.
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex items-center justify-between gap-4">
              <div className="text-xs font-mono text-[var(--text-secondary)]">
                Endpoint: <span className="text-[var(--text)]">/api/system/keep-awake</span>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleKeepAwake()}
                disabled={togglingAwake}
                className={`px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  keepAwake
                    ? 'border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
                    : 'border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                }`}
              >
                {togglingAwake
                  ? 'Updating...'
                  : keepAwake
                    ? 'Disable Keep-Awake'
                    : 'Enable Keep-Awake'}
              </button>
            </div>
          </section>

          {/* Temp Log Purge Card */}
          <section className="obsidian-panel rounded-xl p-6 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-base font-semibold text-[var(--text)]">
                    Log &amp; Temp Hygiene Purge
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  ~/.nexus-agent/logs (&gt;7d)
                </span>
              </div>

              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Scans and removes rotated runtime logs older than 7 days inside{' '}
                <code className="font-mono text-xs">~/.nexus-agent/logs</code> without touching
                active SQLite WAL state.
              </p>

              {lastPurgeResult && (
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-4 text-xs font-mono text-emerald-300 flex items-center justify-between gap-4">
                  <span>
                    {lastPurgeResult.dry_run ? 'DRY-RUN PREVIEW' : 'PURGE COMPLETED'} ·{' '}
                    {lastPurgeResult.removed_files ?? 0} file(s)
                  </span>
                  <span>{lastPurgeResult.reclaimed_mb ?? 0} MB</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void handlePurgeTemp(true)}
                disabled={purging}
                className="px-4 py-2 rounded-lg border border-[var(--border)] hover:border-emerald-500/40 bg-[var(--panel-muted)] text-xs font-medium text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
              >
                {purging ? 'Scanning...' : 'Dry-Run Scan'}
              </button>
              <button
                type="button"
                onClick={() => void handlePurgeTemp(false)}
                disabled={purging}
                className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors"
              >
                {purging ? 'Purging...' : 'Purge Stale Logs'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: Expenses Summary */}
      {activeTab === 'expenses' && (
        <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-hidden">
          <section className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shrink-0">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Total Spend ({expenseSummary?.period ?? expensePeriod})
                </span>
                <span className="text-2xl font-semibold font-mono text-emerald-300">
                  {expenseSummary?.currency ?? 'INR'}{' '}
                  {(expenseSummary?.total_spend ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="h-8 w-px bg-[var(--border-subtle)] hidden sm:block" />

              <div>
                <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Transactions
                </span>
                <span className="text-xl font-semibold font-mono text-[var(--text)]">
                  {expenseSummary?.transaction_count ?? 0}
                </span>
              </div>

              {expenseSummary?.air_gapped && (
                <span className="px-2.5 py-1 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] font-mono text-amber-300">
                  LOCAL LEDGER ONLY (SILENT)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <select
                value={expensePeriod}
                onChange={(e) => {
                  const next = e.target.value as 'week' | 'month' | 'year';
                  setExpensePeriod(next);
                  void loadExpenses(next);
                }}
                aria-label="Expense summary period"
                className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
              </select>

              <button
                type="button"
                onClick={() => void loadExpenses(expensePeriod)}
                disabled={expensesLoading}
                className="px-3 py-2 rounded-lg border border-[var(--border)] hover:border-emerald-500/40 bg-[var(--panel-muted)] text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${expensesLoading ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Categories & Top Merchants */}
            <section className="lg:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Category Breakdown</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Aggregated from SQLite WAL expenses ledger.
                </p>
              </div>

              {categoryEntries.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 text-xs font-mono text-[var(--text-muted)]">
                  {expensesLoading ? 'Reading expense ledger...' : 'No categorized expenses found.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {categoryEntries.map(([category, amount]) => {
                    const pct = Math.max(4, Math.min(100, (amount / maxCategoryAmount) * 100));
                    return (
                      <div key={category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-[var(--text)]">{category}</span>
                          <span className="text-emerald-300">
                            {expenseSummary?.currency ?? 'INR'} {amount.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--panel-muted)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(expenseSummary?.top_merchants?.length ?? 0) > 0 && (
                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Top Merchants
                  </h3>
                  <div className="space-y-2">
                    {expenseSummary?.top_merchants?.map((m) => (
                      <div
                        key={m.merchant}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-3.5 py-2 flex items-center justify-between text-xs font-mono"
                      >
                        <span className="text-[var(--text)] truncate">
                          {m.merchant} ({m.count})
                        </span>
                        <span className="text-emerald-300 shrink-0">
                          {expenseSummary?.currency ?? 'INR'} {m.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Recent Ledger Transactions */}
            <section className="lg:col-span-7 obsidian-panel rounded-xl p-6 flex flex-col gap-4 min-h-0 overflow-hidden">
              <h2 className="text-sm font-semibold text-[var(--text)] shrink-0">
                Recent Transactions
              </h2>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
                {(expenseSummary?.recent_expenses?.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                    {expensesLoading
                      ? 'Querying recent transactions...'
                      : 'No transactions recorded in ~/.nexus-agent/db/agent_local.db.'}
                  </div>
                ) : (
                  expenseSummary?.recent_expenses?.map((txn) => (
                    <div
                      key={txn.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text)] truncate">
                            {txn.merchant}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-[var(--border)] text-[10px] font-mono text-[var(--text-secondary)]">
                            {txn.category}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                          {txn.txn_date ?? 'Recent'}
                          {txn.payment_method ? ` · ${txn.payment_method}` : ''}
                        </div>
                      </div>
                      <span className="text-sm font-mono font-semibold text-emerald-300 shrink-0">
                        {txn.currency || expenseSummary?.currency || 'INR'}{' '}
                        {Number(txn.amount).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

export default AutopilotView;
