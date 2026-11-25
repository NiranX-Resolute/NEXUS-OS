import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Play,
  Square,
  Trash2,
  Plus,
  RefreshCw,
  CircleDot,
  Coffee,
  Flame,
  Receipt,
  Repeat,
  ShieldCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { RoutineItem } from '../types';

type AutopilotTab = 'routines' | 'macros' | 'system' | 'expenses';

interface RecordedMacro {
  macro_id: string;
  name: string;
  description?: string;
  action_count: number;
  duration_ms: number;
  tags?: string[];
  created_at?: number;
  updated_at?: number;
}

interface RoutinesResponse {
  routines?: RoutineItem[];
  count?: number;
}

interface MacrosListResponse {
  macros?: RecordedMacro[];
  count?: number;
}

interface MacroStartResponse {
  is_recording?: boolean;
  recorder_id?: string;
}

interface MacroStopResponse {
  is_recording?: boolean;
  action_count?: number;
  actions?: unknown[];
}

interface MacroReplayResponse {
  executed?: number;
  steps_executed?: number;
  message?: string;
  dry_run?: boolean;
}

interface KeepAwakeResponse {
  keep_awake?: boolean;
  enabled?: boolean;
}

interface PurgeResponse {
  dry_run?: boolean;
  removed_files?: number;
  reclaimed_mb?: number;
}

interface ExpenseMerchant {
  merchant: string;
  total: number;
  count: number;
}

interface ExpenseEntry {
  id: string | number;
  amount: number;
  currency?: string;
  merchant: string;
  category: string;
  payment_method?: string;
  txn_date?: string;
}

interface ExpenseSummaryResponse {
  period?: string;
  total_spend?: number;
  currency?: string;
  transaction_count?: number;
  by_category?: Record<string, number>;
  top_merchants?: ExpenseMerchant[];
  recent_expenses?: ExpenseEntry[];
  air_gapped?: boolean;
}

function formatEpochOrIso(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return 'Never';
  if (typeof value === 'number') {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const num = Number(value);
  if (!Number.isNaN(num) && num > 0) {
    const ms = num > 1_000_000_000_000 ? num : num * 1000;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(value);
}

export function AutopilotView() {
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<AutopilotTab>('routines');

  // --- Voice Routines ---
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [routinesError, setRoutinesError] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState('');
  const [routineTrigger, setRoutineTrigger] = useState('');
  const [routineActions, setRoutineActions] = useState('');
  const [routineDesc, setRoutineDesc] = useState('');
  const [creatingRoutine, setCreatingRoutine] = useState(false);
  const [busyRoutineKey, setBusyRoutineKey] = useState<string | null>(null);
  const [lastRoutineLog, setLastRoutineLog] = useState<string | null>(null);

  // --- Macro Recorder ---
  const [macros, setMacros] = useState<RecordedMacro[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [macrosError, setMacrosError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderId, setRecorderId] = useState<string | null>(null);
  const [macroNameInput, setMacroNameInput] = useState('');
  const [macroDescInput, setMacroDescInput] = useState('');
  const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
  const [replayDryRun, setReplayDryRun] = useState<boolean>(true);
  const [replayingName, setReplayingName] = useState<string | null>(null);
  const [lastMacroReport, setLastMacroReport] = useState<string | null>(null);

  // --- System Guards (Keep-Awake + Purge) ---
  const [keepAwake, setKeepAwake] = useState<boolean>(false);
  const [keepAwakeLoading, setKeepAwakeLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    dryRun: boolean;
    removedFiles: number;
    reclaimedMb: number;
    timestamp: string;
  } | null>(null);

  // --- Expenses Ledger ---
  const [expensePeriod, setExpensePeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummaryResponse | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);

  const loadRoutines = useCallback(async () => {
    setRoutinesLoading(true);
    setRoutinesError(null);
    try {
      const res = await ipcJson<RoutinesResponse>('/api/routines');
      if (res.success === false) {
        setRoutinesError(res.error || 'Failed loading voice routines');
        return;
      }
      setRoutines(Array.isArray(res.routines) ? res.routines : []);
    } catch (err) {
      setRoutinesError(err instanceof Error ? err.message : 'Routines IPC unreachable');
    } finally {
      setRoutinesLoading(false);
    }
  }, []);

  const loadMacros = useCallback(async () => {
    setMacrosLoading(true);
    setMacrosError(null);
    try {
      const res = await ipcJson<MacrosListResponse>('/api/macros');
      if (res.success === false) {
        setMacrosError(res.error || 'Failed loading recorded macros');
        return;
      }
      setMacros(Array.isArray(res.macros) ? res.macros : []);
    } catch (err) {
      setMacrosError(err instanceof Error ? err.message : 'Macros IPC unreachable');
    } finally {
      setMacrosLoading(false);
    }
  }, []);

  const loadKeepAwake = useCallback(async () => {
    try {
      const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake');
      if (res.success !== false) {
        setKeepAwake(Boolean(res.keep_awake ?? res.enabled));
      }
    } catch {
      // Non-fatal telemetry probe
    }
  }, []);

  const loadExpenses = useCallback(async (period: string) => {
    setExpensesLoading(true);
    setExpensesError(null);
    try {
      const res = await ipcJson<ExpenseSummaryResponse>(
        `/api/expenses/summary?period=${encodeURIComponent(period)}`
      );
      if (res.success === false) {
        setExpensesError(res.error || 'Failed querying expenses ledger');
        return;
      }
      setExpenseSummary(res);
    } catch (err) {
      setExpensesError(err instanceof Error ? err.message : 'Expenses IPC unreachable');
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.allSettled([loadRoutines(), loadMacros(), loadKeepAwake(), loadExpenses(expensePeriod)]);
  }, [loadRoutines, loadMacros, loadKeepAwake, loadExpenses, expensePeriod]);

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    const trigger = routineTrigger.trim();
    const sequence = routineActions.trim();
    if (!trigger || !sequence) {
      pushToast('Trigger phrase and semicolon-separated action sequence are required', 'warn');
      return;
    }

    setCreatingRoutine(true);
    try {
      const res = await ipcJson('/api/routines', {
        method: 'POST',
        body: JSON.stringify({
          name: routineName.trim() || trigger,
          trigger_phrase: trigger,
          action_sequence: sequence,
          description: routineDesc.trim(),
          enabled: true,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed registering routine', 'error');
        return;
      }
      pushToast(`Registered voice routine "${trigger}"`, 'success');
      setRoutineName('');
      setRoutineTrigger('');
      setRoutineActions('');
      setRoutineDesc('');
      await loadRoutines();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine creation failed', 'error');
    } finally {
      setCreatingRoutine(false);
    }
  };

  const handlePlayRoutine = async (routine: RoutineItem) => {
    const key = String(routine.id || routine.name || routine.trigger_phrase);
    setBusyRoutineKey(key);
    try {
      const res = await ipcJson<{ results?: unknown[]; latency_ms?: number }>(
        '/api/routines/play',
        {
          method: 'POST',
          body: JSON.stringify({
            id: routine.id ?? routine.name,
            name: routine.name,
            trigger_phrase: routine.trigger_phrase,
          }),
        }
      );
      if (res.success === false) {
        pushToast(res.error || `Routine "${routine.name}" failed`, 'error');
        return;
      }
      const latency = typeof res.latency_ms === 'number' ? ` in ${res.latency_ms}ms` : '';
      setLastRoutineLog(`Executed "${routine.trigger_phrase}"${latency}`);
      pushToast(`Executed routine "${routine.name}"${latency}`, 'success');
      await loadRoutines();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine execution failed', 'error');
    } finally {
      setBusyRoutineKey(null);
    }
  };

  const handleDeleteRoutine = async (routine: RoutineItem) => {
    const key = String(routine.id || routine.name || routine.trigger_phrase);
    setBusyRoutineKey(key);
    try {
      const res = await ipcJson('/api/routines/delete', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id ?? routine.name,
          name: routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed deleting routine', 'error');
        return;
      }
      setRoutines((prev) =>
        prev.filter(
          (item) =>
            String(item.id || item.name) !== String(routine.id || routine.name)
        )
      );
      pushToast(`Deleted routine "${routine.name}"`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete routine failed', 'error');
    } finally {
      setBusyRoutineKey(null);
    }
  };

  const handleStartMacro = async () => {
    try {
      const res = await ipcJson<MacroStartResponse>('/api/macros/start', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast(res.error || 'Unable to start macro recording', 'error');
        return;
      }
      setIsRecording(true);
      setRecorderId(res.recorder_id ?? null);
      setLastMacroReport(null);
      pushToast('Macro recorder armed — capturing action stream', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro start failed', 'error');
    }
  };

  const handleStopMacro = async () => {
    const saveName = macroNameInput.trim() || `macro-${Date.now()}`;
    try {
      const res = await ipcJson<MacroStopResponse>('/api/macros/stop', {
        method: 'POST',
        body: JSON.stringify({
          name: saveName,
          description: macroDescInput.trim(),
        }),
      });
      setIsRecording(false);
      setRecorderId(null);
      if (res.success === false) {
        pushToast(res.error || 'Failed stopping macro recording', 'error');
        return;
      }
      const count = res.action_count ?? (Array.isArray(res.actions) ? res.actions.length : 0);
      setLastMacroReport(`Saved "${saveName}" (${count} captured actions)`);
      setMacroNameInput('');
      setMacroDescInput('');
      pushToast(`Macro "${saveName}" saved (${count} actions)`, 'success');
      await loadMacros();
    } catch (err) {
      setIsRecording(false);
      pushToast(err instanceof Error ? err.message : 'Macro stop failed', 'error');
    }
  };

  const handleReplayMacro = async (macro: RecordedMacro) => {
    setReplayingName(macro.name);
    try {
      const res = await ipcJson<MacroReplayResponse>('/api/macros/replay', {
        method: 'POST',
        body: JSON.stringify({
          name: macro.name,
          macro_id: macro.macro_id,
          speed_multiplier: replaySpeed,
          dry_run: replayDryRun,
          auto_approve: !replayDryRun,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || `Replay failed for "${macro.name}"`, 'error');
        setLastMacroReport(`Replay error (${macro.name}): ${res.error || 'Failed'}`);
        return;
      }
      const steps = res.steps_executed ?? res.executed ?? macro.action_count;
      const modeTag = replayDryRun ? ' [DRY RUN]' : '';
      setLastMacroReport(`Replayed "${macro.name}" (${steps} steps @ ${replaySpeed}x)${modeTag}`);
      pushToast(`Replayed "${macro.name}"${modeTag}`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro replay failed', 'error');
    } finally {
      setReplayingName(null);
    }
  };

  const handleToggleKeepAwake = async () => {
    const nextState = !keepAwake;
    setKeepAwakeLoading(true);
    try {
      const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake', {
        method: 'POST',
        body: JSON.stringify({ enabled: nextState }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed toggling Keep-Awake', 'error');
        return;
      }
      const resolved = Boolean(res.keep_awake ?? res.enabled ?? nextState);
      setKeepAwake(resolved);
      pushToast(
        resolved ? 'Keep-Awake ENGAGED — sleep suppressed' : 'Keep-Awake STANDBY — OS power policy restored',
        resolved ? 'success' : 'info'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Keep-Awake request failed', 'error');
    } finally {
      setKeepAwakeLoading(false);
    }
  };

  const handleSystemPurge = async (dryRun: boolean) => {
    setPurging(true);
    try {
      const res = await ipcJson<PurgeResponse>('/api/system/purge', {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      });
      if (res.success === false) {
        pushToast(res.error || 'System purge failed', 'error');
        return;
      }
      const removedFiles = res.removed_files ?? 0;
      const reclaimedMb = res.reclaimed_mb ?? 0;
      setPurgeResult({
        dryRun,
        removedFiles,
        reclaimedMb,
        timestamp: new Date().toLocaleTimeString(),
      });
      pushToast(
        dryRun
          ? `Dry-run scan: ${removedFiles} stale logs (${reclaimedMb} MB)`
          : `Purged ${removedFiles} stale files (${reclaimedMb} MB reclaimed)`,
        dryRun ? 'info' : 'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Purge request failed', 'error');
    } finally {
      setPurging(false);
    }
  };

  const categoryEntries = Object.entries(expenseSummary?.by_category ?? {});
  const topMerchants = expenseSummary?.top_merchants ?? [];
  const recentExpenses = expenseSummary?.recent_expenses ?? [];
  const currency = expenseSummary?.currency || 'INR';

  return (
    <div className="h-full overflow-y-auto p-6 flex flex-col gap-6">
      {/* Header Bar */}
      <div className="aether-glass rounded-2xl p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300 aether-glow-emerald">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                Autopilot &amp; OS Automation
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                  keepAwake
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                    : 'bg-slate-800/70 text-slate-400 border-slate-700/60'
                }`}
              >
                {keepAwake ? 'AWAKE LOCK ON' : 'POWER NOMINAL'}
              </span>
              {isRecording && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-rose-500/15 text-rose-300 border border-rose-400/35 animate-pulse">
                  RECORDING MACRO
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Deterministic voice routines, UI macro recording, OS hygiene guards, and sovereign expense ledger.
            </p>
          </div>
        </div>

        {/* Clean Tab Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-[#050a14]/80 p-1.5 rounded-xl border border-slate-700/40 self-start xl:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('routines')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'routines'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Voice Routines
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('macros')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'macros'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            Macro Recorder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'system'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            System Guards
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('expenses')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'expenses'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Expenses Ledger
          </button>
        </div>
      </div>

      {/* TAB 1: VOICE ROUTINES */}
      {activeTab === 'routines' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 aether-glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Registered Voice Routines</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sub-50ms deterministic reflex pipelines backed by SQLite WAL.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadRoutines()}
                disabled={routinesLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${routinesLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {lastRoutineLog && (
              <div className="rounded-xl px-3.5 py-2.5 bg-emerald-500/10 border border-emerald-400/30 text-emerald-200 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{lastRoutineLog}</span>
              </div>
            )}

            {routinesError && (
              <div className="rounded-xl p-3.5 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{routinesError}</span>
              </div>
            )}

            {routines.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400">
                {routinesLoading
                  ? 'Loading routines from SQLite WAL...'
                  : 'No voice routines registered yet. Create one using the form on the right.'}
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
                {routines.map((routine) => {
                  const key = String(routine.id || routine.name || routine.trigger_phrase);
                  const isBusy = busyRoutineKey === key;
                  return (
                    <div
                      key={key}
                      className="rounded-xl p-4 bg-[#050a14]/75 border border-slate-800/85 hover:border-cyan-400/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-100">
                            {routine.name || routine.trigger_phrase}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">
                            &ldquo;{routine.trigger_phrase}&rdquo;
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              routine.enabled
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {routine.enabled ? 'ACTIVE' : 'PAUSED'}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-300 mt-1.5 break-all">
                          {routine.action_sequence || routine.actions_json}
                        </p>
                        {routine.description && (
                          <p className="text-xs text-slate-400 mt-1">{routine.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[11px] font-mono text-slate-500">
                          <span>Runs: {routine.execution_count ?? 0}</span>
                          <span>• Last: {formatEpochOrIso(routine.last_triggered)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handlePlayRoutine(routine)}
                          disabled={isBusy}
                          className="px-3.5 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Run
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRoutine(routine)}
                          disabled={isBusy}
                          aria-label={`Delete routine ${routine.name}`}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-400/30 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Register Routine Form */}
          <form
            onSubmit={(e) => void handleCreateRoutine(e)}
            className="lg:col-span-5 aether-bracket-card rounded-2xl p-5 flex flex-col gap-4"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Register Voice Routine</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Bind a natural language trigger phrase to deterministic actions.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Routine Name (optional)</label>
              <input
                type="text"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="e.g., Morning Focus Setup"
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Trigger Phrase</label>
              <input
                type="text"
                value={routineTrigger}
                onChange={(e) => setRoutineTrigger(e.target.value)}
                placeholder="e.g., start deep work"
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">
                Action Sequence (semicolon-delimited)
              </label>
              <textarea
                rows={4}
                value={routineActions}
                onChange={(e) => setRoutineActions(e.target.value)}
                placeholder="e.g., keep awake on; wait 500ms; open terminal"
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 resize-y"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Description</label>
              <input
                type="text"
                value={routineDesc}
                onChange={(e) => setRoutineDesc(e.target.value)}
                placeholder="Optional notes on what this sequence automates..."
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <button
              type="submit"
              disabled={creatingRoutine}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-cyan-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {creatingRoutine ? 'Registering...' : 'Save Voice Routine'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: MACRO RECORDER */}
      {activeTab === 'macros' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Capture Console */}
          <div className="lg:col-span-5 aether-bracket-card rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">UI Action Macro Recorder</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Captures interaction streams with automatic credential redaction into SQLite WAL.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Macro Name</label>
              <input
                type="text"
                value={macroNameInput}
                onChange={(e) => setMacroNameInput(e.target.value)}
                placeholder="e.g., build-and-verify-flow"
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">Description</label>
              <input
                type="text"
                value={macroDescInput}
                onChange={(e) => setMacroDescInput(e.target.value)}
                placeholder="Optional description saved on stop..."
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={() => void handleStartMacro()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/45 text-rose-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <CircleDot className="w-4 h-4" />
                  Start Recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStopMacro()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Square className="w-4 h-4" />
                  Stop &amp; Persist Macro
                </button>
              )}
            </div>

            {recorderId && (
              <div className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-400/25 rounded-lg px-3 py-2">
                Active recorder session: {recorderId}
              </div>
            )}

            {lastMacroReport && (
              <div className="text-xs font-mono text-emerald-200 bg-emerald-500/10 border border-emerald-400/25 rounded-xl px-3.5 py-2.5">
                {lastMacroReport}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-3">
              <span className="text-xs font-semibold text-slate-300">Replay Configuration</span>
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs text-slate-400">Speed Multiplier</label>
                <div className="flex items-center gap-1.5">
                  {[0.5, 1.0, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setReplaySpeed(spd)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border ${
                        replaySpeed === spd
                          ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/45'
                          : 'bg-[#050a14]/80 text-slate-400 border-slate-800'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                <span>Dry-run simulation (safe preview)</span>
                <input
                  type="checkbox"
                  checked={replayDryRun}
                  onChange={(e) => setReplayDryRun(e.target.checked)}
                  className="accent-cyan-400 w-4 h-4"
                />
              </label>
            </div>
          </div>

          {/* Stored Macros List */}
          <div className="lg:col-span-7 aether-glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Recorded Macros</h2>
              <button
                type="button"
                onClick={() => void loadMacros()}
                disabled={macrosLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${macrosLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {macrosError && (
              <div className="rounded-xl p-3.5 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{macrosError}</span>
              </div>
            )}

            {macros.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400">
                {macrosLoading
                  ? 'Loading recorded macros...'
                  : 'No recorded macros found in SQLite WAL. Start recording on the left.'}
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
                {macros.map((macro) => (
                  <div
                    key={macro.macro_id || macro.name}
                    className="rounded-xl p-4 bg-[#050a14]/75 border border-slate-800/85 hover:border-cyan-400/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-100">{macro.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">
                          {macro.action_count} actions
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {Math.round(macro.duration_ms || 0)}ms
                        </span>
                      </div>
                      {macro.description && (
                        <p className="text-xs text-slate-400 mt-1">{macro.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-slate-500">
                        <Clock className="w-3 h-3" />
                        <span>Updated {formatEpochOrIso(macro.updated_at)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleReplayMacro(macro)}
                      disabled={replayingName === macro.name}
                      className="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {replayingName === macro.name ? 'Replaying...' : 'Replay'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM GUARDS (KEEP-AWAKE + TEMP CACHE PURGE) */}
      {activeTab === 'system' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Keep-Awake Panel */}
          <div className="aether-bracket-card rounded-2xl p-6 flex flex-col justify-between gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center border ${
                    keepAwake
                      ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                      : 'bg-slate-800/70 border-slate-700/70 text-slate-400'
                  }`}
                >
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Win32 Keep-Awake</h2>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Calls Win32 <code className="text-cyan-300 font-mono">SetThreadExecutionState</code>{' '}
                    to prevent system sleep and display dimming during long builds or research sweeps.
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono shrink-0 border ${
                  keepAwake
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700'
                }`}
              >
                {keepAwake ? 'ACTIVE' : 'STANDBY'}
              </span>
            </div>

            <div className="rounded-xl bg-[#050a14]/80 border border-slate-800 p-4 text-xs text-slate-300 flex items-center justify-between">
              <span>Current Power State</span>
              <span className="font-mono text-cyan-300">
                {keepAwake ? 'ES_CONTINUOUS | ES_DISPLAY_REQUIRED' : 'Default OS Policy'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void handleToggleKeepAwake()}
              disabled={keepAwakeLoading}
              className={`w-full py-3 px-4 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-50 ${
                keepAwake
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-400/40 text-amber-200'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/45 text-emerald-100'
              }`}
            >
              {keepAwakeLoading
                ? 'Updating Power Lock...'
                : keepAwake
                  ? 'Release Keep-Awake Lock'
                  : 'Engage Keep-Awake Lock'}
            </button>
          </div>

          {/* Temp Cache & Log Purge Panel */}
          <div className="aether-glass rounded-2xl p-6 flex flex-col justify-between gap-6">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-400/35 text-cyan-300 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100">Temp Cache &amp; Log Purge</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Scans and prunes stale telemetry artifacts older than 7 days inside{' '}
                  <code className="text-cyan-300 font-mono">~/.nexus-agent/logs</code> without
                  touching SQLite WAL state.
                </p>
              </div>
            </div>

            {purgeResult ? (
              <div className="rounded-xl bg-[#050a14]/85 border border-cyan-400/25 p-4 flex flex-col gap-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Mode</span>
                  <span className={purgeResult.dryRun ? 'text-cyan-300' : 'text-emerald-300'}>
                    {purgeResult.dryRun ? 'DRY RUN PREVIEW' : 'EXECUTED PURGE'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Files Eligible / Removed</span>
                  <span className="text-slate-100">{purgeResult.removedFiles}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Reclaimed Space</span>
                  <span className="text-emerald-300">{purgeResult.reclaimedMb} MB</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Checked At</span>
                  <span>{purgeResult.timestamp}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#050a14]/70 border border-dashed border-slate-700/70 p-4 text-xs text-slate-400 text-center">
                Run a dry-run preview first to inspect reclaimable log cache before deleting files.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => void handleSystemPurge(true)}
                disabled={purging}
                className="flex-1 py-3 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-100 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {purging ? 'Scanning...' : 'Dry-Run Scan'}
              </button>
              <button
                type="button"
                onClick={() => void handleSystemPurge(false)}
                disabled={purging}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-100 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {purging ? 'Purging...' : 'Purge Stale Cache'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EXPENSES LEDGER */}
      {activeTab === 'expenses' && (
        <div className="flex flex-col gap-6">
          <div className="aether-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-300">Ledger Period:</span>
              <div className="flex items-center gap-1.5 bg-[#050a14]/90 p-1 rounded-xl border border-slate-800">
                {(['week', 'month', 'year', 'all'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setExpensePeriod(period)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono uppercase transition-colors ${
                      expensePeriod === period
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {expenseSummary?.air_gapped && (
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-amber-500/15 text-amber-300 border border-amber-400/30">
                  SILENT AIR-GAP (LOCAL LEDGER ONLY)
                </span>
              )}
              <button
                type="button"
                onClick={() => void loadExpenses(expensePeriod)}
                disabled={expensesLoading}
                className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-xs font-medium flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${expensesLoading ? 'animate-spin' : ''}`} />
                Refresh Ledger
              </button>
            </div>
          </div>

          {expensesError && (
            <div className="rounded-xl p-4 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{expensesError}</span>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="aether-bracket-card rounded-2xl p-5">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Total Tracked Spend
              </div>
              <div className="text-2xl font-semibold text-cyan-300 mt-2 font-mono">
                {currency} {(expenseSummary?.total_spend ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="aether-glass rounded-2xl p-5">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Recorded Transactions
              </div>
              <div className="text-2xl font-semibold text-emerald-300 mt-2 font-mono">
                {expenseSummary?.transaction_count ?? 0}
              </div>
            </div>
            <div className="aether-glass rounded-2xl p-5">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Active Categories
              </div>
              <div className="text-2xl font-semibold text-slate-100 mt-2 font-mono">
                {categoryEntries.length}
              </div>
            </div>
          </div>

          {/* Breakdown & Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 aether-glass rounded-2xl p-5 flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 mb-3">Spend by Category</h3>
                {categoryEntries.length === 0 ? (
                  <p className="text-xs text-slate-400">No category entries recorded yet.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {categoryEntries.map(([category, total]) => (
                      <div
                        key={category}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#050a14]/75 border border-slate-800/80 text-xs"
                      >
                        <span className="text-slate-200 capitalize">{category}</span>
                        <span className="font-mono text-cyan-300">
                          {currency} {Number(total).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800/80">
                <h3 className="text-sm font-semibold text-slate-100 mb-3">Top Merchants</h3>
                {topMerchants.length === 0 ? (
                  <p className="text-xs text-slate-400">No merchant ledger data yet.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {topMerchants.map((m) => (
                      <div
                        key={m.merchant}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#050a14]/75 border border-slate-800/80 text-xs"
                      >
                        <div>
                          <span className="text-slate-200">{m.merchant}</span>
                          <span className="ml-2 text-[11px] font-mono text-slate-500">
                            ({m.count}x)
                          </span>
                        </div>
                        <span className="font-mono text-emerald-300">
                          {currency} {Number(m.total).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 aether-glass rounded-2xl p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-slate-100">Recent SQLite Ledger Entries</h3>
              {recentExpenses.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400">
                  No expenses logged in SQLite WAL for this workspace yet.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {recentExpenses.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl p-3.5 bg-[#050a14]/75 border border-slate-800/85 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100 truncate">
                          {item.merchant}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-400">
                          <span className="text-cyan-300/90">{item.category}</span>
                          {item.payment_method && <span>• {item.payment_method}</span>}
                          {item.txn_date && <span>• {item.txn_date}</span>}
                        </div>
                      </div>
                      <div className="text-sm font-mono font-semibold text-emerald-300 shrink-0">
                        {item.currency || currency} {Number(item.amount).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AutopilotView;
