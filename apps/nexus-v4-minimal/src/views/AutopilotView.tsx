import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CircleDot,
  Coffee,
  Eye,
  Film,
  Loader2,
  Mic,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { RoutineItem } from '../types';

type AutopilotTab = 'routines' | 'macros' | 'guardrails' | 'expenses';

interface RoutinePlayReceipt {
  routineName: string;
  latencyMs?: number;
  actions: string[];
  results: Array<{
    action?: string;
    type?: string;
    success?: boolean;
    result?: unknown;
    latency_ms?: number;
  }>;
  executedAt: string;
}

interface MacroActionItem {
  action_type?: string;
  type?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
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
  actions?: MacroActionItem[];
}

interface PurgeReport {
  dry_run: boolean;
  removed_files: number;
  reclaimed_mb: number;
  checkedAt: string;
}

interface ExpenseSummary {
  success?: boolean;
  period: string;
  total_spend: number;
  currency: string;
  transaction_count: number;
  by_category: Record<string, number>;
  top_merchants: Array<{ merchant: string; total: number; count: number }>;
  recent_expenses: Array<{
    id: string;
    amount: number;
    currency?: string;
    merchant: string;
    category: string;
    payment_method?: string;
    txn_date?: string;
  }>;
  air_gapped?: boolean;
}

function formatEpochOrIso(raw?: number | string | null): string {
  if (!raw) return '—';
  const num = typeof raw === 'number' ? raw : Number(raw);
  const d =
    Number.isFinite(num) && num > 0
      ? new Date(num > 1e12 ? num : num * 1000)
      : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number, currency = 'INR'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

export function AutopilotView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<AutopilotTab>('routines');

  // Voice Routines state
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [triggerInput, setTriggerInput] = useState('');
  const [actionsInput, setActionsInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [playingRoutineId, setPlayingRoutineId] = useState<string | null>(null);
  const [deletingRoutineId, setDeletingRoutineId] = useState<string | null>(null);
  const [togglingRoutineId, setTogglingRoutineId] = useState<string | null>(null);
  const [lastPlayReceipt, setLastPlayReceipt] = useState<RoutinePlayReceipt | null>(null);

  // Macro Recorder state
  const [macros, setMacros] = useState<MacroSummary[]>([]);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recorderBusy, setRecorderBusy] = useState(false);
  const [macroNameDraft, setMacroNameDraft] = useState('');
  const [macroDescDraft, setMacroDescDraft] = useState('');
  const [selectedMacro, setSelectedMacro] = useState<MacroSummary | null>(null);
  const [inspectingMacro, setInspectingMacro] = useState(false);
  const [replayingMacroId, setReplayingMacroId] = useState<string | null>(null);
  const [deletingMacroId, setDeletingMacroId] = useState<string | null>(null);
  const [replaySpeed, setReplaySpeed] = useState(1.0);
  const [replayDryRun, setReplayDryRun] = useState(false);
  const [lastReplayMessage, setLastReplayMessage] = useState<string | null>(null);

  // Guardrails state (Keep-Awake + Purge)
  const [keepAwake, setKeepAwake] = useState(false);
  const [keepAwakeLoading, setKeepAwakeLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeReport, setPurgeReport] = useState<PurgeReport | null>(null);

  // Expenses Summary state
  const [expensePeriod, setExpensePeriod] = useState<'week' | 'month' | 'all'>('month');
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary | null>(null);
  const [expensesLoading, setExpensesLoading] = useState(false);

  const loadRoutines = useCallback(async () => {
    setRoutinesLoading(true);
    try {
      const res = await ipcJson<{ routines?: RoutineItem[] }>('/api/routines');
      if (res.success === false) {
        pushToast(res.error || 'Failed to load voice routines', 'error');
        return;
      }
      setRoutines(Array.isArray(res.routines) ? res.routines : []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routines endpoint unavailable', 'error');
    } finally {
      setRoutinesLoading(false);
    }
  }, [pushToast]);

  const loadMacros = useCallback(async () => {
    setMacrosLoading(true);
    try {
      const res = await ipcJson<{ macros?: MacroSummary[] }>('/api/macros');
      if (res.success === false) {
        pushToast(res.error || 'Failed to load macros', 'error');
        return;
      }
      setMacros(Array.isArray(res.macros) ? res.macros : []);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro endpoint unavailable', 'error');
    } finally {
      setMacrosLoading(false);
    }
  }, [pushToast]);

  const loadKeepAwake = useCallback(async () => {
    setKeepAwakeLoading(true);
    try {
      const res = await ipcJson<{ keep_awake?: boolean; enabled?: boolean }>(
        '/api/system/keep-awake'
      );
      if (res.success !== false) {
        setKeepAwake(Boolean(res.keep_awake ?? res.enabled));
      }
    } catch {
      // Keep prior state when offline
    } finally {
      setKeepAwakeLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(
    async (period: 'week' | 'month' | 'all') => {
      setExpensesLoading(true);
      try {
        const res = await ipcJson<ExpenseSummary>(
          `/api/expenses/summary?period=${encodeURIComponent(period)}`
        );
        if (res.success === false) {
          pushToast(res.error || 'Failed to load expenses summary', 'error');
          return;
        }
        setExpenseSummary(res);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Expenses endpoint unavailable', 'error');
      } finally {
        setExpensesLoading(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    void Promise.allSettled([loadRoutines(), loadKeepAwake()]);
  }, [loadRoutines, loadKeepAwake]);

  useEffect(() => {
    if (activeTab === 'macros' && macros.length === 0) {
      void loadMacros();
    } else if (activeTab === 'expenses') {
      void loadExpenses(expensePeriod);
    }
  }, [activeTab, expensePeriod, loadExpenses, loadMacros, macros.length]);

  const handleRefreshCurrent = () => {
    if (activeTab === 'routines') {
      void loadRoutines();
    } else if (activeTab === 'macros') {
      void loadMacros();
    } else if (activeTab === 'guardrails') {
      void loadKeepAwake();
    } else {
      void loadExpenses(expensePeriod);
    }
  };

  // Routine Actions
  const handleCreateRoutine = async (e: FormEvent) => {
    e.preventDefault();
    const trigger_phrase = triggerInput.trim();
    const action_sequence = actionsInput.trim();
    if (!trigger_phrase || !action_sequence) {
      pushToast('Trigger phrase and action sequence are required', 'warn');
      return;
    }

    setSavingRoutine(true);
    try {
      const res = await ipcJson<{ id?: string; routine?: RoutineItem; message?: string }>(
        '/api/routines',
        {
          method: 'POST',
          body: JSON.stringify({
            trigger_phrase,
            action_sequence,
            description: descriptionInput.trim(),
            enabled: true,
          }),
        }
      );
      if (res.success === false) {
        pushToast(res.error || 'Failed to save routine', 'error');
        return;
      }
      setTriggerInput('');
      setActionsInput('');
      setDescriptionInput('');
      pushToast(res.message || `Registered routine "${trigger_phrase}"`, 'success');
      await loadRoutines();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine save failed', 'error');
    } finally {
      setSavingRoutine(false);
    }
  };

  const handlePlayRoutine = async (routine: RoutineItem) => {
    const key = routine.name || routine.id;
    if (playingRoutineId) return;
    setPlayingRoutineId(key);
    try {
      const res = await ipcJson<{
        actions?: string[];
        results?: RoutinePlayReceipt['results'];
        latency_ms?: number;
      }>('/api/routines/play', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.name || routine.id,
          trigger_phrase: routine.trigger_phrase,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || `Failed to play "${routine.trigger_phrase}"`, 'error');
        return;
      }
      setLastPlayReceipt({
        routineName: routine.trigger_phrase || routine.name,
        latencyMs: res.latency_ms,
        actions: Array.isArray(res.actions) ? res.actions : [],
        results: Array.isArray(res.results) ? res.results : [],
        executedAt: new Date().toISOString(),
      });
      pushToast(
        typeof res.latency_ms === 'number'
          ? `Executed "${routine.trigger_phrase}" (${res.latency_ms.toFixed(1)} ms)`
          : `Executed "${routine.trigger_phrase}"`,
        'success'
      );
      void loadRoutines();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine play failed', 'error');
    } finally {
      setPlayingRoutineId(null);
    }
  };

  const handleToggleRoutine = async (routine: RoutineItem) => {
    const key = routine.name || routine.id;
    if (togglingRoutineId) return;
    setTogglingRoutineId(key);
    try {
      const nextEnabled = !routine.enabled;
      const res = await ipcJson('/api/routines/toggle', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.name || routine.id,
          trigger: routine.trigger_phrase,
          enabled: nextEnabled,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Toggle failed', 'error');
        return;
      }
      setRoutines((prev) =>
        prev.map((item) =>
          (item.name || item.id) === key ? { ...item, enabled: nextEnabled } : item
        )
      );
      pushToast(
        `Routine "${routine.trigger_phrase}" ${nextEnabled ? 'enabled' : 'paused'}`,
        'info'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine toggle failed', 'error');
    } finally {
      setTogglingRoutineId(null);
    }
  };

  const handleDeleteRoutine = async (routine: RoutineItem) => {
    const key = routine.name || routine.id;
    if (deletingRoutineId) return;
    setDeletingRoutineId(key);
    try {
      const res = await ipcJson('/api/routines/delete', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.name || routine.id,
          name: routine.name,
          trigger_phrase: routine.trigger_phrase,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Could not delete routine', 'error');
        return;
      }
      setRoutines((prev) => prev.filter((item) => (item.name || item.id) !== key));
      pushToast(`Deleted routine "${routine.trigger_phrase}"`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Routine delete failed', 'error');
    } finally {
      setDeletingRoutineId(null);
    }
  };

  // Macro Recorder Actions
  const handleStartMacroRecording = async () => {
    if (recorderBusy) return;
    setRecorderBusy(true);
    try {
      const res = await ipcJson<{ is_recording?: boolean; recorder_id?: string }>(
        '/api/macros/start',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      if (res.success === false) {
        pushToast(res.error || 'Failed to start macro recording', 'error');
        return;
      }
      setIsRecording(true);
      pushToast('Macro recording active — capture actions then Stop & Save', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro start failed', 'error');
    } finally {
      setRecorderBusy(false);
    }
  };

  const handleStopMacroRecording = async () => {
    if (recorderBusy) return;
    setRecorderBusy(true);
    const saveName = macroNameDraft.trim() || `macro-${Date.now().toString().slice(-6)}`;
    try {
      const res = await ipcJson<{
        is_recording?: boolean;
        action_count?: number;
        actions?: MacroActionItem[];
        saved?: MacroSummary;
      }>('/api/macros/stop', {
        method: 'POST',
        body: JSON.stringify({
          name: saveName,
          description: macroDescDraft.trim(),
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to stop macro recording', 'error');
        return;
      }
      setIsRecording(false);
      setMacroNameDraft('');
      setMacroDescDraft('');
      const count = typeof res.action_count === 'number' ? res.action_count : 0;
      pushToast(`Saved macro "${saveName}" (${count} actions)`, 'success');
      if (res.saved) {
        setSelectedMacro({
          ...res.saved,
          actions: Array.isArray(res.actions) ? res.actions : res.saved.actions,
        });
      }
      await loadMacros();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro stop failed', 'error');
    } finally {
      setRecorderBusy(false);
    }
  };

  const handleInspectMacro = async (macro: MacroSummary) => {
    setInspectingMacro(true);
    try {
      const res = await ipcJson<{ macro?: MacroSummary }>(
        `/api/macros/${encodeURIComponent(macro.name)}`
      );
      if (res.success === false || !res.macro) {
        pushToast(res.error || `Macro "${macro.name}" not found`, 'warn');
        return;
      }
      setSelectedMacro(res.macro);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro inspection failed', 'error');
    } finally {
      setInspectingMacro(false);
    }
  };

  const handleReplayMacro = async (macro: MacroSummary) => {
    if (replayingMacroId) return;
    setReplayingMacroId(macro.macro_id);
    setLastReplayMessage(null);
    try {
      const res = await ipcJson<{
        executed_steps?: number;
        steps_executed?: number;
        message?: string;
        dry_run?: boolean;
      }>('/api/macros/replay', {
        method: 'POST',
        body: JSON.stringify({
          name: macro.name,
          macro_id: macro.macro_id,
          speed_multiplier: replaySpeed,
          dry_run: replayDryRun,
          auto_approve: true,
        }),
      });
      if (res.success === false) {
        const msg = res.error || `Replay failed for "${macro.name}"`;
        setLastReplayMessage(msg);
        pushToast(msg, 'error');
        return;
      }
      const steps = res.executed_steps ?? res.steps_executed ?? macro.action_count;
      const summary =
        res.message ||
        `${replayDryRun ? 'Dry-run validated' : 'Replayed'} "${macro.name}" (${steps} steps @ ${replaySpeed}x)`;
      setLastReplayMessage(summary);
      pushToast(summary, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro replay failed', 'error');
    } finally {
      setReplayingMacroId(null);
    }
  };

  const handleDeleteMacro = async (macro: MacroSummary) => {
    if (deletingMacroId) return;
    setDeletingMacroId(macro.macro_id);
    try {
      const res = await ipcJson('/api/macros/delete', {
        method: 'POST',
        body: JSON.stringify({
          name: macro.name,
          macro_id: macro.macro_id,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to delete macro', 'error');
        return;
      }
      setMacros((prev) => prev.filter((m) => m.macro_id !== macro.macro_id));
      if (selectedMacro?.macro_id === macro.macro_id) {
        setSelectedMacro(null);
      }
      pushToast(`Deleted macro "${macro.name}"`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Macro delete failed', 'error');
    } finally {
      setDeletingMacroId(null);
    }
  };

  // System Guardrails Actions
  const handleToggleKeepAwake = async () => {
    if (keepAwakeLoading) return;
    const nextEnabled = !keepAwake;
    setKeepAwakeLoading(true);
    try {
      const res = await ipcJson<{ keep_awake?: boolean; enabled?: boolean }>(
        '/api/system/keep-awake',
        {
          method: 'POST',
          body: JSON.stringify({ enabled: nextEnabled }),
        }
      );
      if (res.success === false) {
        pushToast(res.error || 'Failed to toggle keep-awake', 'error');
        return;
      }
      const confirmed = Boolean(res.keep_awake ?? res.enabled ?? nextEnabled);
      setKeepAwake(confirmed);
      pushToast(
        confirmed ? 'Workstation wake lock enabled' : 'Workstation wake lock released',
        confirmed ? 'success' : 'info'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Keep-awake toggle failed', 'error');
    } finally {
      setKeepAwakeLoading(false);
    }
  };

  const handlePurgeTemp = async (dryRun: boolean) => {
    if (purging) return;
    setPurging(true);
    try {
      const res = await ipcJson<{
        dry_run?: boolean;
        removed_files?: number;
        reclaimed_mb?: number;
      }>('/api/system/purge', {
        method: 'POST',
        body: JSON.stringify({ dry_run: dryRun }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Cache purge failed', 'error');
        return;
      }
      const report: PurgeReport = {
        dry_run: Boolean(res.dry_run ?? dryRun),
        removed_files: typeof res.removed_files === 'number' ? res.removed_files : 0,
        reclaimed_mb: typeof res.reclaimed_mb === 'number' ? res.reclaimed_mb : 0,
        checkedAt: new Date().toISOString(),
      };
      setPurgeReport(report);
      pushToast(
        report.dry_run
          ? `Dry run: ${report.removed_files} stale log files (${report.reclaimed_mb} MB)`
          : `Purged ${report.removed_files} stale log files (${report.reclaimed_mb} MB reclaimed)`,
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'System purge request failed', 'error');
    } finally {
      setPurging(false);
    }
  };

  const categoryEntries = useMemo(() => {
    if (!expenseSummary?.by_category) return [];
    const entries = Object.entries(expenseSummary.by_category);
    const maxVal = entries.reduce((acc, [, val]) => Math.max(acc, val), 0);
    return entries.map(([category, amount]) => ({
      category,
      amount,
      pct: maxVal > 0 ? Math.max(4, Math.round((amount / maxVal) * 100)) : 0,
    }));
  }, [expenseSummary]);

  const tabs: Array<{ id: AutopilotTab; label: string }> = [
    { id: 'routines', label: 'Voice Routines' },
    { id: 'macros', label: 'Macro Recorder' },
    { id: 'guardrails', label: 'Guardrails' },
    { id: 'expenses', label: 'Expenses' },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#090a0c] text-zinc-100">
      {/* Single-Row Monograph Header */}
      <header className="monograph-hairline-b flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 text-emerald-400" />
          <h1 className="text-[14px] font-medium tracking-[-0.01em] text-zinc-100">
            OS Autopilot
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              keepAwake
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.08] bg-[#0e1014] text-zinc-400'
            }`}
          >
            <Coffee className="h-3 w-3" />
            {keepAwake ? 'Awake Locked' : 'Sleep Normal'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav
            aria-label="Autopilot sections"
            className="inline-flex rounded-md border border-white/[0.08] bg-[#0e1014] p-0.5"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={handleRefreshCurrent}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0e1014] text-zinc-400 transition hover:text-zinc-200"
            title="Refresh active section"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                routinesLoading || macrosLoading || keepAwakeLoading || expensesLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* TAB 1: VOICE ROUTINES */}
        {activeTab === 'routines' && (
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="flex flex-col gap-4 lg:col-span-7">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  <Mic className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Deterministic Reflex Routines</span>
                </div>
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                  {routines.length} registered
                </span>
              </div>

              {routinesLoading && routines.length === 0 ? (
                <div className="monograph-surface flex items-center gap-2.5 rounded-lg p-6 font-mono text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  Loading SQLite WAL voice routines…
                </div>
              ) : routines.length === 0 ? (
                <div className="monograph-surface rounded-lg p-8 text-center">
                  <p className="text-sm font-medium text-zinc-300">No voice routines registered</p>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Bind a natural-language trigger phrase to a semicolon-delimited sequence of OS actions.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {routines.map((routine) => {
                    const key = routine.name || routine.id;
                    const busyPlay = playingRoutineId === key;
                    const busyToggle = togglingRoutineId === key;
                    const busyDelete = deletingRoutineId === key;
                    return (
                      <article
                        key={key}
                        className="monograph-surface rounded-lg p-4 transition hover:border-white/[0.14]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-[13.5px] font-medium text-zinc-100">
                                {routine.trigger_phrase || routine.name}
                              </h3>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                                  routine.enabled
                                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                    : 'border-white/[0.08] bg-[#090a0c] text-zinc-500'
                                }`}
                              >
                                {routine.enabled ? 'Active' : 'Paused'}
                              </span>
                            </div>
                            <p className="mt-1.5 font-mono text-xs text-zinc-400">
                              {routine.action_sequence || routine.actions_json}
                            </p>
                            {routine.description && (
                              <p className="mt-1 text-xs text-zinc-500">{routine.description}</p>
                            )}
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handlePlayRoutine(routine)}
                              disabled={busyPlay}
                              className="inline-flex h-7 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 font-mono text-[11px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                              title="Play routine now"
                            >
                              {busyPlay ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              Play
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleToggleRoutine(routine)}
                              disabled={busyToggle}
                              className="h-7 rounded border border-white/[0.08] bg-[#090a0c] px-2 font-mono text-[11px] text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
                            >
                              {routine.enabled ? 'Pause' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRoutine(routine)}
                              disabled={busyDelete}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#090a0c] text-zinc-500 transition hover:border-red-500/30 hover:text-red-300 disabled:opacity-40"
                              title="Delete routine"
                            >
                              {busyDelete ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2 font-mono text-[10.5px] text-zinc-500 tabular-nums">
                          <span>Runs: {routine.execution_count ?? 0}</span>
                          <span>Last triggered: {formatEpochOrIso(routine.last_triggered)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Right: Register Routine + Execution Receipt */}
            <section className="flex flex-col gap-6 lg:col-span-5">
              <form
                onSubmit={handleCreateRoutine}
                className="monograph-surface flex flex-col gap-4 rounded-lg p-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-medium text-zinc-100">
                    Register Voice Routine
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Reflex Engine
                  </span>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    Trigger Phrase
                  </span>
                  <input
                    type="text"
                    value={triggerInput}
                    onChange={(e) => setTriggerInput(e.target.value)}
                    placeholder="e.g. start deep focus"
                    className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    Action Sequence (; delimited)
                  </span>
                  <textarea
                    rows={3}
                    value={actionsInput}
                    onChange={(e) => setActionsInput(e.target.value)}
                    placeholder="mute audio; set workspace study; enable keep awake"
                    className="resize-y rounded-md border border-white/[0.08] bg-[#090a0c] p-3 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    Description (optional)
                  </span>
                  <input
                    type="text"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Silences notifications and locks display sleep"
                    className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingRoutine || !triggerInput.trim() || !actionsInput.trim()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {savingRoutine ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {savingRoutine ? 'Saving…' : 'Save Routine'}
                </button>
              </form>

              {lastPlayReceipt && (
                <div className="monograph-surface rounded-lg p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-300">
                      Last Routine Execution
                    </span>
                    {typeof lastPlayReceipt.latencyMs === 'number' && (
                      <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                        {lastPlayReceipt.latencyMs.toFixed(1)} ms
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-zinc-200">
                    {lastPlayReceipt.routineName}
                  </p>
                  <div className="mt-3 space-y-2">
                    {lastPlayReceipt.results.map((step, idx) => (
                      <div
                        key={`step-${idx}`}
                        className="flex items-center justify-between rounded border border-white/[0.06] bg-[#090a0c] px-3 py-2 font-mono text-[11px]"
                      >
                        <span className="truncate text-zinc-300">
                          {step.action || lastPlayReceipt.actions[idx] || `Step ${idx + 1}`}
                        </span>
                        <span
                          className={
                            step.success === false ? 'text-red-400' : 'text-emerald-400'
                          }
                        >
                          {step.success === false ? 'FAILED' : 'OK'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: MACRO RECORDER */}
        {activeTab === 'macros' && (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {/* Live Recorder Strip */}
            <section className="monograph-surface flex flex-wrap items-center justify-between gap-4 rounded-lg p-5">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    isRecording ? 'animate-pulse bg-amber-400' : 'bg-zinc-600'
                  }`}
                />
                <div>
                  <h2 className="text-[13.5px] font-medium text-zinc-100">
                    {isRecording ? 'Macro Capture Active' : 'Desktop Action Recorder'}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {isRecording
                      ? 'Provide a macro name and stop capture to persist sanitized steps into SQLite WAL.'
                      : 'Record deterministic desktop sequences for zero-drift replay.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {isRecording && (
                  <>
                    <input
                      type="text"
                      value={macroNameDraft}
                      onChange={(e) => setMacroNameDraft(e.target.value)}
                      placeholder="Macro name…"
                      className="h-8 w-44 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-amber-500/40 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={macroDescDraft}
                      onChange={(e) => setMacroDescDraft(e.target.value)}
                      placeholder="Description (optional)"
                      className="h-8 w-52 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-amber-500/40 focus:outline-none"
                    />
                  </>
                )}

                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => void handleStartMacroRecording()}
                    disabled={recorderBusy}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {recorderBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CircleDot className="h-3.5 w-3.5" />
                    )}
                    Start Recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStopMacroRecording()}
                    disabled={recorderBusy}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {recorderBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    Stop &amp; Save
                  </button>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Saved Macros */}
              <section className="flex flex-col gap-4 lg:col-span-7">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    <Film className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Recorded Macros</span>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                    {macros.length} saved
                  </span>
                </div>

                {macrosLoading && macros.length === 0 ? (
                  <div className="monograph-surface flex items-center gap-2.5 rounded-lg p-6 font-mono text-xs text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    Loading recorded macros…
                  </div>
                ) : macros.length === 0 ? (
                  <div className="monograph-surface rounded-lg p-8 text-center">
                    <p className="text-sm font-medium text-zinc-300">No recorded macros yet</p>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Use Start Recording above to capture and persist desktop automation flows.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {macros.map((macro) => {
                      const replaying = replayingMacroId === macro.macro_id;
                      const deleting = deletingMacroId === macro.macro_id;
                      const isSelected = selectedMacro?.macro_id === macro.macro_id;
                      return (
                        <article
                          key={macro.macro_id}
                          className={`monograph-surface rounded-lg p-4 transition ${
                            isSelected ? 'border-emerald-500/35' : 'hover:border-white/[0.14]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-[13.5px] font-medium text-zinc-100">
                                  {macro.name}
                                </h3>
                                <span className="rounded border border-white/[0.08] bg-[#090a0c] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 tabular-nums">
                                  {macro.action_count} steps
                                </span>
                                {typeof macro.duration_ms === 'number' && macro.duration_ms > 0 && (
                                  <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">
                                    {(macro.duration_ms / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                              {macro.description && (
                                <p className="mt-1 text-xs text-zinc-400">{macro.description}</p>
                              )}
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void handleInspectMacro(macro)}
                                className="inline-flex h-7 items-center gap-1 rounded border border-white/[0.08] bg-[#090a0c] px-2 font-mono text-[11px] text-zinc-300 transition hover:text-zinc-100"
                              >
                                <Eye className="h-3 w-3" />
                                Inspect
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReplayMacro(macro)}
                                disabled={replaying}
                                className="inline-flex h-7 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 font-mono text-[11px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                {replaying ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                Replay
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMacro(macro)}
                                disabled={deleting}
                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/[0.08] bg-[#090a0c] text-zinc-500 transition hover:border-red-500/30 hover:text-red-300 disabled:opacity-40"
                                title="Delete macro"
                              >
                                {deleting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2 font-mono text-[10.5px] text-zinc-500 tabular-nums">
                            <span>{macro.macro_id}</span>
                            <span>Updated {formatEpochOrIso(macro.updated_at)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Replay Settings & Step Inspector */}
              <section className="flex flex-col gap-6 lg:col-span-5">
                <div className="monograph-surface flex flex-col gap-4 rounded-lg p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-medium text-zinc-100">Replay Parameters</h2>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      Macro Engine
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-zinc-400">Speed Multiplier</span>
                    <div className="inline-flex rounded border border-white/[0.08] bg-[#090a0c] p-0.5 font-mono text-xs tabular-nums">
                      {[0.5, 1, 2].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setReplaySpeed(spd)}
                          className={`rounded px-2.5 py-1 transition ${
                            replaySpeed === spd
                              ? 'bg-white/[0.1] text-zinc-100'
                              : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded border border-white/[0.06] bg-[#090a0c] px-3 py-2.5">
                    <div>
                      <span className="block text-xs font-medium text-zinc-200">Dry-Run Validation</span>
                      <span className="block text-[11px] text-zinc-500">
                        Verify steps without dispatching OS input
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={replayDryRun}
                      onChange={(e) => setReplayDryRun(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>

                  {lastReplayMessage && (
                    <div className="rounded border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 font-mono text-xs text-emerald-300">
                      {lastReplayMessage}
                    </div>
                  )}
                </div>

                <div className="monograph-surface flex flex-col gap-3 rounded-lg p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-medium text-zinc-100">
                      {selectedMacro ? `Steps: ${selectedMacro.name}` : 'Macro Inspector'}
                    </h2>
                    {inspectingMacro && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />}
                  </div>

                  {!selectedMacro ? (
                    <p className="py-6 text-center text-xs text-zinc-500">
                      Select Inspect on any macro to view its recorded step trace.
                    </p>
                  ) : !selectedMacro.actions || selectedMacro.actions.length === 0 ? (
                    <p className="py-6 text-center text-xs text-zinc-500">
                      0 recorded steps stored in this macro.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {selectedMacro.actions.map((act, idx) => (
                        <div
                          key={`act-${idx}`}
                          className="rounded border border-white/[0.06] bg-[#090a0c] p-2.5 font-mono text-[11px]"
                        >
                          <div className="flex items-center justify-between text-zinc-300">
                            <span className="tabular-nums text-emerald-400">
                              #{idx + 1} · {act.action_type || act.type || 'action'}
                            </span>
                            {typeof act.timestamp === 'number' && (
                              <span className="text-zinc-600 tabular-nums">
                                {formatEpochOrIso(act.timestamp)}
                              </span>
                            )}
                          </div>
                          {act.data && Object.keys(act.data).length > 0 && (
                            <pre className="mt-1 overflow-x-auto text-[10.5px] text-zinc-500">
                              {JSON.stringify(act.data)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 3: SYSTEM GUARDRAILS */}
        {activeTab === 'guardrails' && (
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Keep-Awake Power Guardrail */}
            <section className="monograph-surface flex flex-col justify-between gap-6 rounded-lg p-6">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coffee className="h-4 w-4 text-amber-400" />
                    <h2 className="text-[14px] font-medium text-zinc-100">
                      Workstation Wake Lock
                    </h2>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                      keepAwake
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                        : 'border-white/[0.08] bg-[#090a0c] text-zinc-400'
                    }`}
                  >
                    {keepAwake ? 'Locked Awake' : 'Standard Power'}
                  </span>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-400">
                  Prevents Windows idle sleep and display blanking during long autonomous agent runs, local inference batches, or live recordings.
                </p>

                <dl className="mt-5 space-y-2 border-t border-white/[0.06] pt-4 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-zinc-500">Workspace Mode</dt>
                    <dd className="text-zinc-200">{telemetry.workspaceMode}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-zinc-500">ScopeGuard State</dt>
                    <dd
                      className={
                        telemetry.estopActive
                          ? 'text-red-400'
                          : telemetry.securityState === 'ELEVATED'
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }
                    >
                      {telemetry.estopActive ? 'E-STOP LOCKED' : telemetry.securityState}
                    </dd>
                  </div>
                </dl>
              </div>

              <button
                type="button"
                onClick={() => void handleToggleKeepAwake()}
                disabled={keepAwakeLoading}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-4 text-xs font-medium transition disabled:opacity-50 ${
                  keepAwake
                    ? 'border-amber-500/35 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                {keepAwakeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Coffee className="h-3.5 w-3.5" />
                )}
                {keepAwake ? 'Release Keep-Awake Lock' : 'Enable Keep-Awake Lock'}
              </button>
            </section>

            {/* Stale Log & Temp Purge */}
            <section className="monograph-surface flex flex-col justify-between gap-6 rounded-lg p-6">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <h2 className="text-[14px] font-medium text-zinc-100">
                      Sovereign Cache &amp; Log Purge
                    </h2>
                  </div>
                  <span className="rounded border border-white/[0.08] bg-[#090a0c] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                    7-Day Retention
                  </span>
                </div>
                <p className="mt-2.5 text-[13px] leading-relaxed text-zinc-400">
                  Audits and prunes expired runtime logs under <code className="font-mono text-zinc-300">~/.nexus-agent/logs</code> older than 7 days while preserving SQLite WAL state.
                </p>

                {purgeReport && (
                  <div className="mt-5 rounded-md border border-white/[0.08] bg-[#090a0c] p-4 font-mono text-xs tabular-nums">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Mode</span>
                      <span className={purgeReport.dry_run ? 'text-amber-300' : 'text-emerald-300'}>
                        {purgeReport.dry_run ? 'DRY RUN PREVIEW' : 'PURGE COMPLETED'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-zinc-500">Files Matched</span>
                      <span className="text-zinc-100">{purgeReport.removed_files}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-zinc-500">Space Reclaimed</span>
                      <span className="text-zinc-100">{purgeReport.reclaimed_mb} MB</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handlePurgeTemp(true)}
                  disabled={purging}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-white/[0.08] bg-[#090a0c] px-4 text-xs font-medium text-zinc-200 transition hover:border-white/[0.16] disabled:opacity-50"
                >
                  {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                  Preview Purge
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurgeTemp(false)}
                  disabled={purging}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Execute Purge
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: EXPENSES SUMMARY */}
        {activeTab === 'expenses' && (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                <span>Sovereign SQLite Expenses Ledger</span>
              </div>

              <div className="inline-flex rounded-md border border-white/[0.08] bg-[#0e1014] p-0.5 font-mono text-xs">
                {(['week', 'month', 'all'] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setExpensePeriod(period)}
                    className={`rounded px-3 py-1 capitalize transition ${
                      expensePeriod === period
                        ? 'bg-white/[0.08] text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {period === 'all' ? 'All Time' : period}
                  </button>
                ))}
              </div>
            </div>

            {expensesLoading && !expenseSummary ? (
              <div className="monograph-surface flex items-center gap-2.5 rounded-lg p-6 font-mono text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                Aggregating expense ledger…
              </div>
            ) : !expenseSummary ? (
              <div className="monograph-surface rounded-lg p-8 text-center">
                <p className="text-sm font-medium text-zinc-300">Expenses ledger unavailable</p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Ensure the IPC gateway is online and retry loading the ledger.
                </p>
              </div>
            ) : (
              <>
                {/* Top KPI Strip */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="monograph-surface rounded-lg p-5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Total Expenditure
                    </span>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
                      {formatCurrency(expenseSummary.total_spend, expenseSummary.currency)}
                    </p>
                  </div>
                  <div className="monograph-surface rounded-lg p-5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Recorded Transactions
                    </span>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 tabular-nums">
                      {expenseSummary.transaction_count}
                    </p>
                  </div>
                  <div className="monograph-surface rounded-lg p-5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Sync Posture
                    </span>
                    <p
                      className={`mt-2 font-mono text-sm font-medium ${
                        expenseSummary.air_gapped ? 'text-amber-300' : 'text-emerald-300'
                      }`}
                    >
                      {expenseSummary.air_gapped ? 'SILENT Air-Gap Active' : 'Local SQLite WAL'}
                    </p>
                  </div>
                </div>

                {/* Breakdown + Recent Ledger */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <section className="monograph-surface flex flex-col gap-5 rounded-lg p-5 lg:col-span-5">
                    <div>
                      <h2 className="text-[13px] font-medium text-zinc-100">By Category</h2>
                      {categoryEntries.length === 0 ? (
                        <p className="mt-3 text-xs text-zinc-500">No category entries recorded.</p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {categoryEntries.map((item) => (
                            <div key={item.category} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-300">{item.category}</span>
                                <span className="font-mono text-zinc-200 tabular-nums">
                                  {formatCurrency(item.amount, expenseSummary.currency)}
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
                                <div
                                  className="h-full rounded-full bg-emerald-400/80"
                                  style={{ width: `${item.pct}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                      <h2 className="text-[13px] font-medium text-zinc-100">Top Merchants</h2>
                      {expenseSummary.top_merchants.length === 0 ? (
                        <p className="mt-3 text-xs text-zinc-500">No merchant records yet.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {expenseSummary.top_merchants.map((m) => (
                            <div
                              key={m.merchant}
                              className="flex items-center justify-between rounded border border-white/[0.06] bg-[#090a0c] px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="block truncate font-medium text-zinc-200">
                                  {m.merchant}
                                </span>
                                <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                                  {m.count} txns
                                </span>
                              </div>
                              <span className="font-mono text-zinc-100 tabular-nums">
                                {formatCurrency(m.total, expenseSummary.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="monograph-surface rounded-lg p-5 lg:col-span-7">
                    <h2 className="text-[13px] font-medium text-zinc-100">Recent Transactions</h2>
                    {expenseSummary.recent_expenses.length === 0 ? (
                      <p className="py-12 text-center text-xs text-zinc-500">
                        No transactions stored in SQLite WAL expenses table.
                      </p>
                    ) : (
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/[0.08] font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
                              <th className="pb-2.5 pr-3 font-medium">Date</th>
                              <th className="pb-2.5 pr-3 font-medium">Merchant</th>
                              <th className="pb-2.5 pr-3 font-medium">Category</th>
                              <th className="pb-2.5 pr-3 font-medium">Method</th>
                              <th className="pb-2.5 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.05]">
                            {expenseSummary.recent_expenses.map((txn) => (
                              <tr key={txn.id} className="text-zinc-300">
                                <td className="py-2.5 pr-3 font-mono text-[11px] text-zinc-500 tabular-nums">
                                  {txn.txn_date || '—'}
                                </td>
                                <td className="py-2.5 pr-3 font-medium text-zinc-100">
                                  {txn.merchant}
                                </td>
                                <td className="py-2.5 pr-3 text-zinc-400">{txn.category}</td>
                                <td className="py-2.5 pr-3 font-mono text-[11px] text-zinc-500">
                                  {txn.payment_method || '—'}
                                </td>
                                <td className="py-2.5 text-right font-mono text-zinc-100 tabular-nums">
                                  {formatCurrency(
                                    txn.amount,
                                    txn.currency || expenseSummary.currency
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AutopilotView;
