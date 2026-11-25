import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Layers,
  MessageSquareText,
  RefreshCw,
  Send,
  Shield,
  Trash2,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

export type InterviewMode = 'Coding' | 'System Design' | 'Behavioral';

interface VisionStatusResponse {
  success?: boolean;
  active?: boolean;
  source?: string;
  frames_processed?: number;
  last_analysis?: string | null;
  last_frame_ts?: number | null;
  error?: string;
}

interface AiChatResponse {
  success?: boolean;
  response?: string | { text?: string };
  text?: string;
  provider?: string;
  model?: string;
  error?: string;
}

interface CopilotExchange {
  id: string;
  mode: InterviewMode;
  question: string;
  stackContext: string;
  usedVision: boolean;
  answer: string;
  provider?: string;
  model?: string;
  latencyMs: number;
  createdAt: string;
  error?: string;
}

const MODE_META: Record<
  InterviewMode,
  {
    icon: React.ComponentType<{ className?: string }>;
    tagline: string;
    promptHint: string;
    structureDirectives: string;
  }
> = {
  Coding: {
    icon: Code2,
    tagline: 'Algorithms, invariants & optimal complexity',
    promptHint: 'Paste coding prompt, constraints, or data structure problem...',
    structureDirectives:
      'Structure the answer strictly with these sections:\n' +
      '1. Core Intuition & Invariant\n' +
      '2. Optimal Algorithm & Clean Code\n' +
      '3. Time & Space Complexity\n' +
      '4. Edge Cases & Dry-Run Walkthrough',
  },
  'System Design': {
    icon: Layers,
    tagline: 'Distributed scale, contracts & trade-offs',
    promptHint: 'Describe target system, QPS/latency constraints, or architecture question...',
    structureDirectives:
      'Structure the answer strictly with these sections:\n' +
      '1. Functional & Scale Requirements\n' +
      '2. High-Level Architecture & Data Flow\n' +
      '3. Storage Schema & API Contracts\n' +
      '4. Bottlenecks, Failure Modes & Trade-offs',
  },
  Behavioral: {
    icon: MessageSquareText,
    tagline: 'STAR narrative & senior ownership signals',
    promptHint: 'Enter leadership, conflict, architecture decision, or incident prompt...',
    structureDirectives:
      'Structure the answer strictly with these sections:\n' +
      '1. STAR Framework (Situation, Task, Action, Result)\n' +
      '2. Key Technical & Ownership Signals\n' +
      '3. Concise Follow-up Talking Points',
  },
};

function formatVisionTimestamp(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return 'No frames yet';
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildStructuredPrompt(
  mode: InterviewMode,
  question: string,
  stackContext: string,
  visionAnalysis: string | null
): string {
  const directives = MODE_META[mode].structureDirectives;
  const parts: string[] = [
    `You are a concise, senior principal engineer acting as a stealth ${mode} interview copilot.`,
    directives,
    'Be direct, crisp, and actionable with zero filler.',
  ];

  if (stackContext.trim()) {
    parts.push(`Target Role / Stack Constraints:\n${stackContext.trim()}`);
  }

  if (visionAnalysis && visionAnalysis.trim()) {
    parts.push(`Live Screen Vision Context:\n${visionAnalysis.trim()}`);
  }

  parts.push(`Prompt / Question:\n${question.trim()}`);
  return parts.join('\n\n');
}

export function InterviewView() {
  const { telemetry, isOnline, pushToast } = useNexusStore();

  const [mode, setMode] = useState<InterviewMode>('System Design');
  const [stealthDim, setStealthDim] = useState(false);

  // Vision status state
  const [visionStatus, setVisionStatus] = useState<VisionStatusResponse | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [includeVision, setIncludeVision] = useState(true);

  // Copilot prompt & exchange state
  const [question, setQuestion] = useState('');
  const [stackContext, setStackContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [exchanges, setExchanges] = useState<CopilotExchange[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadVisionStatus = useCallback(async () => {
    setVisionLoading(true);
    try {
      const res = await ipcJson<VisionStatusResponse>('/api/vision/status');
      if (res.success !== false) {
        setVisionStatus(res);
      } else {
        setVisionStatus({
          success: false,
          active: false,
          error: res.error ?? 'Vision status unavailable.',
        });
      }
    } catch (err) {
      setVisionStatus({
        success: false,
        active: false,
        error: err instanceof Error ? err.message : 'Unable to reach /api/vision/status',
      });
    } finally {
      setVisionLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVisionStatus();
  }, [loadVisionStatus]);

  const activeExchange =
    exchanges.find((item) => item.id === selectedId) ?? exchanges[0] ?? null;

  const hasVisionAnalysis = Boolean(visionStatus?.last_analysis?.trim());

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || generating) return;

    const useVisionContext =
      includeVision && hasVisionAnalysis ? visionStatus?.last_analysis ?? null : null;

    const structuredPrompt = buildStructuredPrompt(
      mode,
      cleanQuestion,
      stackContext,
      useVisionContext
    );

    setGenerating(true);
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    try {
      const res = await ipcJson<AiChatResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: structuredPrompt,
          max_tokens: 1536,
          messages: [{ role: 'user', content: structuredPrompt }],
        }),
      });

      const elapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );

      const rawResponse =
        typeof res.response === 'string'
          ? res.response
          : typeof res.response === 'object' && res.response !== null
            ? res.response.text ?? ''
            : res.text ?? '';

      const answerText = rawResponse.trim();

      if (res.success === false || !answerText) {
        const errMsg =
          res.error ??
          'AI router returned an empty response. Verify provider keys in Vault or local Ollama.';
        const failedEntry: CopilotExchange = {
          id: `copilot-${Date.now()}`,
          mode,
          question: cleanQuestion,
          stackContext: stackContext.trim(),
          usedVision: Boolean(useVisionContext),
          answer: '',
          latencyMs: elapsed,
          createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          error: errMsg,
        };
        setExchanges((prev) => [failedEntry, ...prev]);
        setSelectedId(failedEntry.id);
        pushToast({
          title: 'Copilot Generation Failed',
          message: errMsg,
          tone: 'error',
        });
        return;
      }

      const entry: CopilotExchange = {
        id: `copilot-${Date.now()}`,
        mode,
        question: cleanQuestion,
        stackContext: stackContext.trim(),
        usedVision: Boolean(useVisionContext),
        answer: answerText,
        provider: res.provider || 'local',
        model: res.model || 'Sovereign Router',
        latencyMs: elapsed,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setExchanges((prev) => [entry, ...prev]);
      setSelectedId(entry.id);
      setQuestion('');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach /api/ai/chat';
      const failedEntry: CopilotExchange = {
        id: `copilot-${Date.now()}`,
        mode,
        question: cleanQuestion,
        stackContext: stackContext.trim(),
        usedVision: Boolean(useVisionContext),
        answer: '',
        latencyMs: 0,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        error: errMsg,
      };
      setExchanges((prev) => [failedEntry, ...prev]);
      setSelectedId(failedEntry.id);
      pushToast({
        title: 'AI Gateway Offline',
        message: errMsg,
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleGenerate();
    }
  };

  const handleCopyAnswer = async (entry: CopilotExchange) => {
    if (!entry.answer) return;
    try {
      await navigator.clipboard.writeText(entry.answer);
      setCopiedId(entry.id);
    } catch {
      pushToast({ title: 'Clipboard Unavailable', tone: 'warning' });
    }
  };

  const handleClearSession = () => {
    setExchanges([]);
    setSelectedId(null);
    setCopiedId(null);
  };

  return (
    <div
      className={`h-full flex flex-col p-6 gap-6 animate-obsidian-fade overflow-hidden transition-opacity ${
        stealthDim ? 'opacity-80' : 'opacity-100'
      }`}
    >
      {/* Top Control Header */}
      <header className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-6 shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Stealth Copilot</span>
            <span
              className={`px-2 py-0.5 rounded border text-[10px] ${
                visionStatus?.active
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)]'
              }`}
            >
              VISION: {visionStatus?.active ? 'ACTIVE' : 'STANDBY'} ·{' '}
              {visionStatus?.frames_processed ?? 0} frames
            </span>
            {telemetry.workspaceMode === 'SILENT' && (
              <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px]">
                AIR-GAPPED
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Interview &amp; Architecture Copilot
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav
            aria-label="Interview mode selector"
            className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-1 gap-1"
          >
            {(['Coding', 'System Design', 'Behavioral'] as const).map((m) => {
              const Icon = MODE_META[m].icon;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text)] border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m}
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setStealthDim((v) => !v)}
            title="Toggle low-glare stealth contrast"
            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
              stealthDim
                ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {stealthDim ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            Stealth
          </button>
        </div>
      </header>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left: Prompt Composer, Vision Status & Session History */}
        <section className="lg:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
          <form onSubmit={handleGenerate} className="flex flex-col gap-4 shrink-0">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--text)]">{mode} Brief</h2>
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Ctrl+Enter to send
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {MODE_META[mode].tagline}
              </p>
            </div>

            <textarea
              rows={5}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder={MODE_META[mode].promptHint}
              className="w-full resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-xl p-4 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none leading-relaxed"
            />

            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Role / Language Context (Optional)
              </label>
              <input
                type="text"
                value={stackContext}
                onChange={(e) => setStackContext(e.target.value)}
                placeholder="e.g., Staff Systems · Python / Rust / Low-Latency"
                className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={generating || !question.trim()}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {generating ? 'Synthesizing Answer...' : `Generate ${mode} Answer`}
            </button>
          </form>

          {/* Vision Status & Screen Context Card */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-[var(--text)]">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vision Telemetry</span>
              </div>
              <button
                type="button"
                onClick={() => void loadVisionStatus()}
                disabled={visionLoading}
                className="text-[11px] font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${visionLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[var(--text-secondary)]">
              <div>
                <span className="text-[var(--text-muted)] block">SOURCE</span>
                {visionStatus?.source ?? 'screen'}
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">LAST FRAME</span>
                {formatVisionTimestamp(visionStatus?.last_frame_ts)}
              </div>
            </div>

            {hasVisionAnalysis ? (
              <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
                <label className="flex items-center gap-2 text-xs text-emerald-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeVision}
                    onChange={(e) => setIncludeVision(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  Attach screen analysis to prompt
                </label>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                  {visionStatus?.last_analysis}
                </p>
              </div>
            ) : (
              <p className="text-[11px] font-mono text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                {visionStatus?.error ??
                  'No screen analysis frame cached yet. Stream a frame or paste problem text above.'}
              </p>
            )}
          </div>

          {/* Session History */}
          {exchanges.length > 0 && (
            <div className="flex flex-col gap-2.5 min-h-0">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                <span>Session Prompts ({exchanges.length})</span>
                <button
                  type="button"
                  onClick={handleClearSession}
                  className="hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              </div>

              <div className="space-y-2">
                {exchanges.map((item) => {
                  const active = activeExchange?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left rounded-lg border px-3.5 py-2.5 transition-colors flex flex-col gap-1 ${
                        active
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                        <span className={item.error ? 'text-red-300' : 'text-emerald-300'}>
                          {item.mode}
                        </span>
                        <span>{item.createdAt}</span>
                      </div>
                      <span className="text-xs text-[var(--text)] truncate">{item.question}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right: Structured AI Output */}
        <section className="lg:col-span-7 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
          {!isOnline && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-xs font-mono text-amber-300 flex items-center gap-2 shrink-0">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Gateway status is currently OFFLINE — /api/ai/chat requires local gateway at
                127.0.0.1:47630.
              </span>
            </div>
          )}

          {activeExchange ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)] shrink-0">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                    <span className="px-2 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-emerald-300 uppercase">
                      {activeExchange.mode}
                    </span>
                    {activeExchange.usedVision && (
                      <span className="px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)]">
                        +VISION
                      </span>
                    )}
                    {activeExchange.provider && <span>· {activeExchange.provider}</span>}
                    {activeExchange.model && <span>· {activeExchange.model}</span>}
                    {activeExchange.latencyMs > 0 && <span>· {activeExchange.latencyMs} ms</span>}
                  </div>
                  <h2 className="text-sm font-medium text-[var(--text)] line-clamp-2">
                    {activeExchange.question}
                  </h2>
                </div>

                {activeExchange.answer && (
                  <button
                    type="button"
                    onClick={() => void handleCopyAnswer(activeExchange)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-emerald-500/40 bg-[var(--panel-muted)] text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {copiedId === activeExchange.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Answer
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {activeExchange.error ? (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-sm text-red-200 space-y-2">
                    <div className="font-mono text-xs uppercase tracking-wider text-red-300">
                      Inference Router Error
                    </div>
                    <p>{activeExchange.error}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
                    {activeExchange.answer}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <div className="w-12 h-12 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-base font-medium text-[var(--text)]">
                Stealth Architecture Copilot Ready
              </h2>
              <p className="text-xs text-[var(--text-muted)] max-w-md leading-relaxed">
                Select <span className="text-[var(--text-secondary)]">Coding</span>,{' '}
                <span className="text-[var(--text-secondary)]">System Design</span>, or{' '}
                <span className="text-[var(--text-secondary)]">Behavioral</span> and submit a
                prompt to receive a structured response from <code className="font-mono">/api/ai/chat</code>.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default InterviewView;
