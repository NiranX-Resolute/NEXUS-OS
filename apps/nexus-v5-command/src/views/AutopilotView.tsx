import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CircleDot,
  Coins,
  Flame,
  Loader2,
  Mic,
  Play,
  Plus,
  Power,
  Radio,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { RoutineItem } from '@/types';

type AutopilotTab = 'routines' | 'macros' | 'guardrails' | 'expenses';

interface RoutinesResponse {
  success?: boolean;
  routines?: RoutineItem[];
  count?: number;
  error?: string;
}

interface RoutinePlayResponse {
  success?: boolean;
  output?: string;
  message?: string;
  routine?: string;
  results?: unknown[];
  error?: string;
}

interface MacroSummary {
  macro_id: string;
  name: string;
  description: string;
  action_count: number;
  duration_ms: number;
  tags?: string[];
  created_at?: number | string;
  updated_at?: number | string;
}

interface MacrosListResponse {
  success?: boolean;
  macros?: MacroSummary[];
  count?: number;
  error?: string;
}

interface MacroDetailResponse {
  success?: boolean;
  macro?: MacroSummary & { actions?: Array<Record<string, unknown>> };
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
  actions?: Array<Record<string, unknown>>;
  saved?: MacroSummary;
  error?: string;
}

interface MacroReplayResponse {
  success?: boolean;
  macro_name?: string;
  executed_count?: number;
  details?: string[];
  duration_ms?: number;
  dry_run?: boolean;
  message?: string;
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

interface ExpenseRecord {
  id: string | number;
  amount: number;
  currency: string;
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
  recent_expenses?: ExpenseRecord[];
  air_gapped?: boolean;
  error?: string;
}

function formatDurationMs(ms?: number): string {
  if (!Number.isFinite(ms) || !ms || ms <= 0) return '0 ms';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function formatMoney(amount: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function AutopilotView() {
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<AutopilotTab>('routines');
  const [refreshing, setRefreshing] = useState(false);

  // Voice Routines State
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [routineName, setRoutineName] = useState('');
  const [routineTrigger, setRoutineTrigger] = useState('');
  const [routineActions, setRoutineActions] = useState('');
  const [routineDescription, setRoutineDescription] = useState('');
  const [routineEnabled, setRoutineEnabled] = useState(true);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [playingRoutineId, setPlayingRoutineId] = useState<string | null>(null);
  const [deletingRoutineId, setDeletingRoutineId] = useState<string | null>(null);
  const [lastRoutineResult, setLastRoutineResult] = useState<string | null>(null);

  // Macro Recorder State
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderId, setRecorderId] = useState<string | null>(null);
  const [macroSaveName, setMacroSaveName] = useState('');
  const [macroSaveDesc, setMacroSaveDesc] = useState('');
  const [togglingRecord, setTogglingRecord] = useState(false);
  const [lastCapturedCount, setLastCapturedCount] = useState<number | null>(null);
  const [replayDryRun, setReplayDryRun] = useState(true);
  const [replayAutoApprove, setReplayAutoApprove] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
  const [replayingMacroName, setReplayingMacroName] = useState<string | null>(null);
  const [replayOutput, setReplayOutput] = useState<MacroReplayResponse | null>(null);

  // System Guardrails State
  const [keepAwake, setKeepAwake] = useState(false);
  const [togglingKeepAwake, setTogglingKeepAwake] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<PurgeResponse | null>(null);

  // Expenses Summary State
  const [expensePeriod, setExpensePeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [expenses, setExpenses] = useState<ExpensesSummaryResponse | null>(null);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const loadRoutines = useCallback(async () => {
    const res = await ipcJson<RoutinesResponse>('/api/routines');
    if (res.success && Array.isArray(res.routines)) {
      setRoutines(res.routines);
    }
  }, []);

  const loadMacros = useCallback(async () => {
    const res = await ipcJson<MacrosListResponse>('/api/macros');
    if (res.success && Array.isArray(res.macros)) {
      setMacros(res.macros);
    }
  }, []);

  const loadKeepAwake = useCallback(async () => {
    const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake');
    if (res.success) {
      setKeepAwake(Boolean(res.keep_awake ?? res.enabled));
    }
  }, []);

  const loadExpenses = useCallback(async (period: string) => {
    setLoadingExpenses(true);
    const res = await ipcJson<ExpensesSummaryResponse>(
      `/api/expenses/summary?period=${encodeURIComponent(period)}`
    );
    setExpenses(res);
    setLoadingExpenses(false);
  }, []);

  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadRoutines(),
      loadMacros(),
      loadKeepAwake(),
      loadExpenses(expensePeriod),
    ]);
    setRefreshing(false);
  }, [loadRoutines, loadMacros, loadKeepAwake, loadExpenses, expensePeriod]);

  useEffect(() => {
    void refreshAllData();
  }, [refreshAllData]);

  // Routine Actions
  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    const trigger_phrase = routineTrigger.trim();
    const action_sequence = routineActions.trim();
    if (!trigger_phrase || !action_sequence) {
      pushToast('Trigger phrase and action sequence are required', 'warn');
      return;
    }

    setSavingRoutine(true);
    const res = await ipcJson<{ success?: boolean; error?: string }>('/api/routines', {
      method: 'POST',
      body: JSON.stringify({
        name: routineName.trim() || trigger_phrase,
        trigger_phrase,
        action_sequence,
        description: routineDescription.trim(),
        enabled: routineEnabled,
      }),
    });
    setSavingRoutine(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to register voice routine', 'error');
      return;
    }

    pushToast(`Registered routine "${trigger_phrase}"`, 'success');
    setRoutineName('');
    setRoutineTrigger('');
    setRoutineActions('');
    setRoutineDescription('');
    await loadRoutines();
  };

  const handlePlayRoutine = async (routine: RoutineItem) => {
    setPlayingRoutineId(routine.id);
    const res = await ipcJson<RoutinePlayResponse>('/api/routines/play', {
      method: 'POST',
      body: JSON.stringify({ id: routine.id }),
    });
    setPlayingRoutineId(null);

    if (!res.success) {
      pushToast(res.error || `Routine "${routine.name}" execution failed`, 'error');
      return;
    }

    const summary =
      res.output ||
      res.message ||
      (Array.isArray(res.results) ? JSON.stringify(res.results) : 'Routine executed');
    setLastRoutineResult(`[${routine.name}] ${summary}`);
    pushToast(`Executed routine "${routine.name}"`, 'success');
    await loadRoutines();
  };

  const handleDeleteRoutine = async (routine: RoutineItem) => {
    setDeletingRoutineId(routine.id);
    const res = await ipcJson<{ success?: boolean; error?: string }>('/api/routines/delete', {
      method: 'POST',
      body: JSON.stringify({ id: routine.id }),
    });
    setDeletingRoutineId(null);

    if (!res.success) {
      pushToast(res.error || 'Failed to delete routine', 'error');
      return;
    }

    setRoutines((prev) => prev.filter((item) => item.id !== routine.id));
    pushToast(`Deleted routine "${routine.name}"`, 'info');
  };

  // Macro Recorder Actions
  const handleStartMacroRecording = async () => {
    setTogglingRecord(true);
    const res = await ipcJson<MacroStartResponse>('/api/macros/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setTogglingRecord(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to start macro recording', 'error');
      return;
    }

    setIsRecording(Boolean(res.is_recording ?? true));
    setRecorderId(res.recorder_id ?? null);
    setLastCapturedCount(null);
    pushToast('Macro recorder armed and capturing input stream', 'success');
  };

  const handleStopMacroRecording = async () => {
    setTogglingRecord(true);
    const trimmedName = macroSaveName.trim();
    const res = await ipcJson<MacroStopResponse>('/api/macros/stop', {
      method: 'POST',
      body: JSON.stringify({
        ...(trimmedName ? { name: trimmedName } : {}),
        ...(macroSaveDesc.trim() ? { description: macroSaveDesc.trim() } : {}),
      }),
    });
    setTogglingRecord(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to stop macro recording', 'error');
      return;
    }

    setIsRecording(false);
    setRecorderId(null);
    setLastCapturedCount(res.action_count ?? res.actions?.length ?? 0);

    if (res.saved) {
      pushToast(`Saved macro "${res.saved.name}" (${res.action_count ?? 0} actions)`, 'success');
      setMacroSaveName('');
      setMacroSaveDesc('');
      await loadMacros();
    } else {
      pushToast(
        `Recording stopped (${res.action_count ?? 0} actions captured; specify a name to persist)`,
        'info'
      );
    }
  };

  const handleReplayMacro = async (macro: MacroSummary) => {
    setReplayingMacroName(macro.name);
    let res = await ipcJson<MacroReplayResponse>('/api/macros/replay', {
      method: 'POST',
      body: JSON.stringify({
        name: macro.name,
        macro_id: macro.macro_id,
        speed_multiplier: replaySpeed,
        dry_run: replayDryRun,
        auto_approve: replayAutoApprove,
      }),
    });

    if (!res.success && /not found/i.test(res.error || '')) {
      const detail = await ipcJson<MacroDetailResponse>(
        `/api/macros/${encodeURIComponent(macro.name)}`
      );
      if (detail.success && detail.macro?.actions) {
        res = await ipcJson<MacroReplayResponse>('/api/macros/replay', {
          method: 'POST',
          body: JSON.stringify({
            actions: detail.macro.actions,
            speed_multiplier: replaySpeed,
            dry_run: replayDryRun,
            auto_approve: replayAutoApprove,
          }),
        });
      }
    }
    setReplayingMacroName(null);

    if (!res.success) {
      pushToast(res.error || `Macro "${macro.name}" replay failed`, 'error');
      return;
    }

    setReplayOutput({ ...res, macro_name: res.macro_name || macro.name });
    pushToast(
      `Replayed "${macro.name}" (${res.executed_count ?? 0} steps${replayDryRun ? ' · dry-run' : ''})`,
      'success'
    );
  };

  // System Guardrail Actions
  const handleToggleKeepAwake = async () => {
    const nextState = !keepAwake;
    setTogglingKeepAwake(true);
    const res = await ipcJson<KeepAwakeResponse>('/api/system/keep-awake', {
      method: 'POST',
      body: JSON.stringify({ enabled: nextState }),
    });
    setTogglingKeepAwake(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to update Keep-Awake state', 'error');
      return;
    }

    const active = Boolean(res.keep_awake ?? res.enabled ?? nextState);
    setKeepAwake(active);
    pushToast(
      active ? 'Win32 Keep-Awake power lock engaged' : 'Win32 Keep-Awake released',
      active ? 'success' : 'info'
    );
  };

  const handleSystemPurge = async (dryRun: boolean) => {
    setPurging(true);
    const res = await ipcJson<PurgeResponse>('/api/system/purge', {
      method: 'POST',
      body: JSON.stringify({ dry_run: dryRun }),
    });
    setPurging(false);

    if (!res.success) {
      pushToast(res.error || 'System purge request failed', 'error');
      return;
    }

    setPurgeResult(res);
    pushToast(
      dryRun
        ? `Dry-run scan: ${res.removed_files ?? 0} stale files (${res.reclaimed_mb ?? 0} MB)`
        : `Purged ${res.removed_files ?? 0} stale files (${res.reclaimed_mb ?? 0} MB reclaimed)`,
      'success'
    );
  };

  const handlePeriodChange = async (next: 'week' | 'month' | 'year' | 'all') => {
    setExpensePeriod(next);
    await loadExpenses(next);
  };

  const categoryEntries = Object.entries(expenses?.by_category ?? {});
  const maxCategoryAmount = categoryEntries.reduce((max, [, val]) => Math.max(max, val), 0);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Header */}
      <div className="matrix-panel matrix-border rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center shrink-0 matrix-glow">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-emerald-50">
              Autopilot Reflex &amp; Macro Console
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Voice Routines · Desktop Input Macros · Win32 Power Guardrails · Expense Ledger
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshAllData()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition cursor-pointer self-start lg:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
          Sync Telemetry
        </button>
      </div>

      {/* Summary Telemetry Row (3 groups max) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="matrix-panel rounded-2xl p-4 border border-white/8 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Win32 Keep-Awake
            </div>
            <div className="text-sm font-semibold text-emerald-50 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  keepAwake ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'
                }`}
              />
              {keepAwake ? 'AWAKE LOCKED' : 'SYSTEM DEFAULT'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleKeepAwake()}
            disabled={togglingKeepAwake}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition cursor-pointer ${
              keepAwake
                ? 'bg-emerald-500/20 border-emerald-500/45 text-emerald-200'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300'
            }`}
          >
            {togglingKeepAwake ? 'Updating...' : keepAwake ? 'Disable' : 'Engage'}
          </button>
        </div>

        <div className="matrix-panel rounded-2xl p-4 border border-white/8 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Automation Mesh
            </div>
            <div className="text-sm font-semibold text-cyan-100">
              {routines.length} Routines · {macros.length} Macros
            </div>
          </div>
          <Activity className="h-5 w-5 text-cyan-400/80" />
        </div>

        <div className="matrix-panel rounded-2xl p-4 border border-white/8 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Expenses ({expensePeriod.toUpperCase()})
            </div>
            <div className="text-sm font-semibold text-emerald-50">
              {expenses?.success
                ? formatMoney(expenses.total_spend ?? 0, expenses.currency || 'INR')
                : 'Unavailable'}
              {typeof expenses?.transaction_count === 'number' && (
                <span className="text-xs font-mono text-slate-400 ml-2">
                  ({expenses.transaction_count} txns)
                </span>
              )}
            </div>
          </div>
          <Coins className="h-5 w-5 text-emerald-400/80" />
        </div>
      </div>

      {/* Clean Tab Strip */}
      <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-[#090e14] border border-white/10 gap-1">
        {(
          [
            { id: 'routines', label: 'Voice Routines', icon: Mic },
            { id: 'macros', label: 'Macro Recorder', icon: CircleDot },
            { id: 'guardrails', label: 'System Guardrails', icon: ShieldCheck },
            { id: 'expenses', label: 'Expenses Summary', icon: Coins },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                active
                  ? 'bg-emerald-500/18 text-emerald-200 border border-emerald-500/35 shadow-[0_0_14px_rgba(16,185,129,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: VOICE ROUTINES */}
      {activeTab === 'routines' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleCreateRoutine}
            className="lg:col-span-5 matrix-panel matrix-border rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-emerald-50">Register Voice Routine</h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-300/80">POST /api/routines</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Routine Name</label>
              <input
                type="text"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="e.g. Morning Focus Sweep"
                className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Trigger Phrase</label>
              <input
                type="text"
                value={routineTrigger}
                onChange={(e) => setRoutineTrigger(e.target.value)}
                placeholder="e.g. initiate deep work"
                className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-sm text-cyan-100 placeholder:text-slate-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Action Sequence</label>
              <textarea
                rows={3}
                value={routineActions}
                onChange={(e) => setRoutineActions(e.target.value)}
                placeholder="e.g. enable keep-awake; mute system audio; switch mode study"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-xs font-mono text-slate-200 placeholder:text-slate-600 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Description (optional)</label>
              <input
                type="text"
                value={routineDescription}
                onChange={(e) => setRoutineDescription(e.target.value)}
                placeholder="Concise summary of routine side effects"
                className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-white/25 focus:outline-none text-xs text-slate-200 placeholder:text-slate-600"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={routineEnabled}
                onChange={(e) => setRoutineEnabled(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              Enable reflex phrase immediately
            </label>

            <button
              type="submit"
              disabled={savingRoutine}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-100 transition disabled:opacity-50 cursor-pointer"
            >
              {savingRoutine ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4 text-emerald-400" />
              )}
              Save Voice Routine
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {lastRoutineResult && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-xs font-mono text-emerald-200">
                {lastRoutineResult}
              </div>
            )}

            {routines.length === 0 ? (
              <div className="matrix-panel rounded-2xl p-10 text-center space-y-2">
                <Mic className="h-8 w-8 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-300 font-medium">No voice routines registered</p>
                <p className="text-xs text-slate-500">
                  Register a deterministic reflex trigger on the left to bind voice phrases to OS actions.
                </p>
              </div>
            ) : (
              routines.map((routine) => (
                <div
                  key={routine.id}
                  className="matrix-panel rounded-2xl p-4 border border-white/8 hover:border-emerald-500/30 transition space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-emerald-50">{routine.name}</h3>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-cyan-500/12 border border-cyan-400/25 text-cyan-300">
                          &ldquo;{routine.trigger_phrase}&rdquo;
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                            routine.enabled
                              ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                              : 'bg-white/5 border-white/10 text-slate-400'
                          }`}
                        >
                          {routine.enabled ? 'ENABLED' : 'PAUSED'}
                        </span>
                      </div>
                      {routine.description && (
                        <p className="text-xs text-slate-400">{routine.description}</p>
                      )}
                      <div className="text-[11px] font-mono text-slate-500">
                        Executions: {routine.execution_count ?? 0}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handlePlayRoutine(routine)}
                        disabled={playingRoutineId === routine.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 transition disabled:opacity-50 cursor-pointer"
                      >
                        {playingRoutineId === routine.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Play
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleDeleteRoutine(routine)}
                        disabled={deletingRoutineId === routine.id}
                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/35 text-slate-400 hover:text-red-300 transition disabled:opacity-50 cursor-pointer"
                        title="Delete routine"
                      >
                        {deletingRoutineId === routine.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="px-3 py-2 rounded-xl bg-[#05080b] border border-white/5 text-xs font-mono text-slate-300 break-words">
                    {routine.action_sequence || routine.actions_json}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MACRO RECORDER */}
      {activeTab === 'macros' && (
        <div className="space-y-6">
          {/* Recorder Control Deck */}
          <div className="matrix-panel matrix-border rounded-2xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border inline-flex items-center gap-2 ${
                    isRecording
                      ? 'bg-red-500/15 border-red-500/45 text-red-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  <Radio className={`h-3.5 w-3.5 ${isRecording ? 'animate-pulse text-red-400' : ''}`} />
                  {isRecording ? `RECORDING LIVE (${recorderId || 'active'})` : 'RECORDER STANDBY'}
                </div>

                {lastCapturedCount !== null && (
                  <span className="text-xs font-mono text-cyan-300">
                    Last capture: {lastCapturedCount} actions
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replayDryRun}
                    onChange={(e) => setReplayDryRun(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  Dry-Run Replay
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replayAutoApprove}
                    onChange={(e) => setReplayAutoApprove(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Auto-Approve
                </label>

                <select
                  value={replaySpeed}
                  onChange={(e) => setReplaySpeed(Number(e.target.value))}
                  aria-label="Replay speed multiplier"
                  className="px-2.5 py-1.5 rounded-lg bg-[#05080b] border border-white/10 text-xs font-mono text-cyan-200"
                >
                  <option value={0.5}>0.5x Speed</option>
                  <option value={1}>1.0x Speed</option>
                  <option value={2}>2.0x Speed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <input
                type="text"
                value={macroSaveName}
                onChange={(e) => setMacroSaveName(e.target.value)}
                placeholder="Macro name to save on Stop (e.g. deploy-window-layout)"
                className="md:col-span-5 px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs text-emerald-50 placeholder:text-slate-600"
              />
              <input
                type="text"
                value={macroSaveDesc}
                onChange={(e) => setMacroSaveDesc(e.target.value)}
                placeholder="Description (optional)"
                className="md:col-span-4 px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-white/25 focus:outline-none text-xs text-slate-200 placeholder:text-slate-600"
              />

              <div className="md:col-span-3 flex items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => void handleStartMacroRecording()}
                    disabled={togglingRecord}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-100 transition cursor-pointer"
                  >
                    {togglingRecord ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CircleDot className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    Start Recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStopMacroRecording()}
                    disabled={togglingRecord}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 border border-red-500/45 text-red-100 transition cursor-pointer"
                  >
                    {togglingRecord ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-red-400" />
                    )}
                    Stop &amp; Save
                  </button>
                )}
              </div>
            </div>
          </div>

          {replayOutput && (
            <div className="matrix-panel rounded-2xl p-4 border border-cyan-400/35 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-cyan-300">
                <span>
                  Replay Result: {replayOutput.macro_name} ({replayOutput.executed_count ?? 0} steps)
                </span>
                <span>{formatDurationMs(replayOutput.duration_ms)}</span>
              </div>
              {Array.isArray(replayOutput.details) && replayOutput.details.length > 0 && (
                <pre className="text-[11px] font-mono text-slate-300 bg-[#05080b] border border-white/8 rounded-xl p-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {replayOutput.details.join('\n')}
                </pre>
              )}
            </div>
          )}

          {macros.length === 0 ? (
            <div className="matrix-panel rounded-2xl p-10 text-center space-y-2">
              <CircleDot className="h-8 w-8 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-300 font-medium">No recorded macros in SQLite WAL</p>
              <p className="text-xs text-slate-500">
                Start recording above, perform input actions, enter a macro name, and click Stop &amp; Save.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {macros.map((macro) => (
                <div
                  key={macro.macro_id || macro.name}
                  className="matrix-panel rounded-2xl p-4 border border-white/8 hover:border-cyan-400/30 transition flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-emerald-50">{macro.name}</h3>
                        <div className="text-[11px] font-mono text-slate-500">
                          {macro.macro_id} · {macro.action_count} actions ·{' '}
                          {formatDurationMs(macro.duration_ms)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleReplayMacro(macro)}
                        disabled={replayingMacroName === macro.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 transition disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {replayingMacroName === macro.name ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Replay
                      </button>
                    </div>

                    {macro.description && (
                      <p className="text-xs text-slate-400">{macro.description}</p>
                    )}

                    {Array.isArray(macro.tags) && macro.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {macro.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/5 border border-white/10 text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SYSTEM GUARDRAILS (KEEP-AWAKE & TEMP PURGE) */}
      {activeTab === 'guardrails' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Keep-Awake Guardrail */}
          <div className="matrix-panel matrix-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Power className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-emerald-50">
                  Win32 Keep-Awake Power Lock
                </h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-300">
                /api/system/keep-awake
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Engages Windows execution-state assertions to prevent display sleep and idle OS
              suspension during autonomous agent runs, local builds, and long inference passes.
            </p>

            <div className="rounded-xl bg-[#05080b] border border-white/8 p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono text-slate-500">CURRENT POWER STATE</div>
                <div
                  className={`text-sm font-semibold mt-0.5 ${
                    keepAwake ? 'text-emerald-300' : 'text-slate-300'
                  }`}
                >
                  {keepAwake ? 'ACTIVE — System Sleep Blocked' : 'INACTIVE — Standard OS Policy'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleToggleKeepAwake()}
                disabled={togglingKeepAwake}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  keepAwake
                    ? 'bg-red-500/15 hover:bg-red-500/25 border-red-500/40 text-red-200'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/45 text-emerald-100'
                }`}
              >
                {togglingKeepAwake && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {keepAwake ? 'Release Lock' : 'Engage Keep-Awake'}
              </button>
            </div>
          </div>

          {/* Temp / Stale Log Purge */}
          <div className="matrix-panel rounded-2xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-emerald-50">
                  Sovereign Temp &amp; Stale Log Purge
                </h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-300">POST /api/system/purge</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sweeps stale logs older than 7 days inside{' '}
              <code className="text-cyan-300 font-mono">~/.nexus-agent/logs</code>. Run a dry-run
              scan first to inspect exact reclaimable disk footprint.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSystemPurge(true)}
                disabled={purging}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 transition disabled:opacity-50 cursor-pointer"
              >
                {purging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Dry-Run Scan
              </button>

              <button
                type="button"
                onClick={() => void handleSystemPurge(false)}
                disabled={purging}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 transition disabled:opacity-50 cursor-pointer"
              >
                {purging ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flame className="h-3.5 w-3.5" />
                )}
                Execute Purge
              </button>
            </div>

            {purgeResult && (
              <div className="rounded-xl bg-[#05080b] border border-emerald-500/25 p-4 grid grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <div className="text-slate-500">MODE</div>
                  <div className="text-cyan-300 mt-0.5">
                    {purgeResult.dry_run ? 'DRY RUN' : 'EXECUTED'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">FILES</div>
                  <div className="text-emerald-200 mt-0.5">{purgeResult.removed_files ?? 0}</div>
                </div>
                <div>
                  <div className="text-slate-500">RECLAIMED</div>
                  <div className="text-emerald-300 mt-0.5">{purgeResult.reclaimed_mb ?? 0} MB</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: EXPENSES SUMMARY */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="matrix-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-emerald-50">
                Local-First Expense Ledger
              </h2>
              {expenses?.air_gapped && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-amber-500/12 border border-amber-500/30 text-amber-300">
                  AIR-GAPPED
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-[#05080b] border border-white/10 rounded-xl p-1">
              {(['week', 'month', 'year', 'all'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => void handlePeriodChange(period)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono uppercase transition cursor-pointer ${
                    expensePeriod === period
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {loadingExpenses ? (
            <div className="matrix-panel rounded-2xl p-10 flex items-center justify-center gap-3 text-xs font-mono text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Aggregating SQLite WAL Expenses...
            </div>
          ) : !expenses?.success ? (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {expenses?.error || 'Unable to retrieve expense summary'}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Category Breakdown */}
              <div className="lg:col-span-6 matrix-panel matrix-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/8 pb-3">
                  <h3 className="text-sm font-semibold text-emerald-50">Spend by Category</h3>
                  <span className="text-xs font-mono text-emerald-300">
                    {formatMoney(expenses.total_spend ?? 0, expenses.currency || 'INR')}
                  </span>
                </div>

                {categoryEntries.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    No category expenditure recorded for this period.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {categoryEntries.map(([cat, amount]) => {
                      const pct =
                        maxCategoryAmount > 0
                          ? Math.max(4, Math.round((amount / maxCategoryAmount) * 100))
                          : 0;
                      return (
                        <div key={cat} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-200 font-medium">{cat}</span>
                            <span className="font-mono text-cyan-300">
                              {formatMoney(amount, expenses.currency || 'INR')}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Merchants & Recent Transactions */}
              <div className="lg:col-span-6 space-y-6">
                <div className="matrix-panel rounded-2xl p-5 border border-white/10 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-50 border-b border-white/8 pb-2.5">
                    Top Merchants
                  </h3>
                  {!expenses.top_merchants || expenses.top_merchants.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">No merchant data.</p>
                  ) : (
                    <div className="space-y-2">
                      {expenses.top_merchants.map((m) => (
                        <div
                          key={m.merchant}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#05080b] border border-white/5 text-xs"
                        >
                          <span className="text-slate-200 font-medium">
                            {m.merchant}{' '}
                            <span className="text-slate-500 font-mono">({m.count}x)</span>
                          </span>
                          <span className="font-mono text-emerald-300">
                            {formatMoney(m.total, expenses.currency || 'INR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="matrix-panel rounded-2xl p-5 border border-white/10 space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-50 border-b border-white/8 pb-2.5">
                    Recent Ledger Entries
                  </h3>
                  {!expenses.recent_expenses || expenses.recent_expenses.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      No recent transactions logged.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {expenses.recent_expenses.map((txn) => (
                        <div
                          key={String(txn.id)}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#05080b] border border-white/5 text-xs"
                        >
                          <div>
                            <div className="text-slate-200 font-medium">{txn.merchant}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {txn.category}
                              {txn.txn_date ? ` · ${txn.txn_date}` : ''}
                            </div>
                          </div>
                          <span className="font-mono text-cyan-300">
                            {formatMoney(txn.amount, txn.currency || expenses.currency || 'INR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AutopilotView;
