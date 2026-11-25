import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  Send,
  Shield,
  Trash2,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

type InterviewMode = 'Coding' | 'System Design' | 'Behavioral';

interface VisionStatusPayload {
  success?: boolean;
  active?: boolean;
  source?: string;
  frames_processed?: number;
  last_analysis?: string | null;
  last_frame_ts?: number | null;
  error?: string;
}

interface InterviewSessionItem {
  id: string;
  mode: InterviewMode;
  prompt: string;
  context: string;
  solution: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  createdAt: string;
}

const SESSION_STORAGE_KEY = 'nexus_v4_interview_sessions';

const MODE_METADATA: Record<
  InterviewMode,
  {
    subtitle: string;
    promptPlaceholder: string;
    structureGuide: string[];
    systemInstruction: string;
  }
> = {
  Coding: {
    subtitle: 'Algorithms, data structures, invariants, and optimal code.',
    promptPlaceholder: 'Paste the problem statement, function signature, or constraints…',
    structureGuide: [
      '1. Core Invariant & Optimal Approach',
      '2. Clean Production Implementation',
      '3. Time & Space Complexity',
      '4. Edge Cases & Verification',
    ],
    systemInstruction:
      'You are a Principal Algorithms & Systems Engineer in Stealth Interview Copilot mode (Coding). Respond ONLY with a crisp, structured Markdown solution using exact sections: ## Approach & Invariants, ## Optimal Implementation (fenced code block), ## Complexity Analysis, and ## Edge Cases.',
  },
  'System Design': {
    subtitle: 'Distributed architecture, SLAs, storage topologies, and trade-offs.',
    promptPlaceholder: 'Describe the target system, scale targets, or bottleneck constraint…',
    structureGuide: [
      '1. Functional & Scale Requirements',
      '2. High-Level Architecture & Data Flow',
      '3. Storage, Partitioning & Bottlenecks',
      '4. Failure Modes & Trade-offs',
    ],
    systemInstruction:
      'You are a Distinguished Distributed Systems Architect in Stealth Interview Copilot mode (System Design). Respond ONLY with a crisp, structured Markdown architecture brief using sections: ## Requirements & Scale Targets, ## High-Level Architecture, ## Data Model & Bottlenecks, and ## Failure Modes & Trade-offs.',
  },
  Behavioral: {
    subtitle: 'STAR-structured leadership, ownership, and conflict resolution.',
    promptPlaceholder: 'Enter the behavioral prompt or leadership scenario…',
    structureGuide: [
      '1. Situation & Stakes',
      '2. Ownership & Concrete Actions',
      '3. Quantified Outcome',
      '4. Likely Follow-up Probes',
    ],
    systemInstruction:
      'You are an Executive Engineering Mentor in Stealth Interview Copilot mode (Behavioral). Respond ONLY with a concise, authentic STAR outline using sections: ## Situation & Task, ## Action & Technical Ownership, ## Quantified Impact, and ## Follow-up Probes.',
  },
};

function loadStoredSessions(): InterviewSessionItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage?.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InterviewSessionItem[]) : [];
  } catch {
    return [];
  }
}

function formatVisionTime(ts?: number | null): string {
  if (!ts || ts <= 0) return '—';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface ContentBlock {
  kind: 'text' | 'code';
  lang?: string;
  body: string;
}

function splitMarkdownBlocks(raw: string): ContentBlock[] {
  const lines = raw.split('\n');
  const blocks: ContentBlock[] = [];
  let textAcc: string[] = [];
  let codeAcc: string[] = [];
  let inCode = false;
  let codeLang = '';

  const flushText = () => {
    if (textAcc.length > 0) {
      blocks.push({ kind: 'text', body: textAcc.join('\n') });
      textAcc = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inCode && trimmed.startsWith('```')) {
      flushText();
      inCode = true;
      codeLang = trimmed.slice(3).trim();
      codeAcc = [];
    } else if (inCode && trimmed.startsWith('```')) {
      blocks.push({ kind: 'code', lang: codeLang, body: codeAcc.join('\n') });
      inCode = false;
      codeLang = '';
      codeAcc = [];
    } else if (inCode) {
      codeAcc.push(line);
    } else {
      textAcc.push(line);
    }
  }

  if (inCode && codeAcc.length > 0) {
    blocks.push({ kind: 'code', lang: codeLang, body: codeAcc.join('\n') });
  } else {
    flushText();
  }

  return blocks;
}

export function InterviewView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [mode, setMode] = useState<InterviewMode>('Coding');
  const [stealthDimmed, setStealthDimmed] = useState(false);

  const [visionStatus, setVisionStatus] = useState<VisionStatusPayload | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);

  const [contextInput, setContextInput] = useState('');
  const [promptInput, setPromptInput] = useState('');
  const [generating, setGenerating] = useState(false);

  const [sessions, setSessions] = useState<InterviewSessionItem[]>(() => loadStoredSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => loadStoredSessions()[0]?.id || ''
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions.slice(0, 25)));
    } catch {
      // Ignore storage quota restrictions
    }
  }, [sessions]);

  const loadVisionStatus = useCallback(async () => {
    setVisionLoading(true);
    try {
      const res = await ipcJson<VisionStatusPayload>('/api/vision/status');
      if (res.success === false) {
        pushToast(res.error || 'Vision telemetry unavailable', 'warn');
        return;
      }
      setVisionStatus(res);
    } catch {
      // Keep prior vision telemetry when offline
    } finally {
      setVisionLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadVisionStatus();
  }, [loadVisionStatus]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  const handleInjectVision = () => {
    const analysis = (visionStatus?.last_analysis || '').trim();
    if (!analysis) {
      pushToast('No captured vision frame analysis available yet', 'info');
      return;
    }
    setPromptInput((prev) =>
      prev.trim()
        ? `${prev.trim()}\n\n[Screen Context]\n${analysis}`
        : `[Screen Context]\n${analysis}`
    );
    pushToast('Injected latest vision context into prompt', 'success');
  };

  const generateSolution = async () => {
    const cleanPrompt = promptInput.trim();
    if (!cleanPrompt || generating) {
      if (!cleanPrompt) pushToast('Enter an interview question or scenario first', 'warn');
      return;
    }

    const meta = MODE_METADATA[mode];
    const contextText = contextInput.trim();
    const composedPrompt = [
      meta.systemInstruction,
      `Mode: ${mode}`,
      contextText ? `Role / Stack / Constraints: ${contextText}` : '',
      `Question / Prompt:\n${cleanPrompt}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    setGenerating(true);
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await ipcJson<{
        response?: string;
        text?: string;
        provider?: string;
        model?: string;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: composedPrompt,
          messages: [
            { role: 'system', content: meta.systemInstruction },
            {
              role: 'user',
              content: contextText
                ? `[Mode: ${mode}] [Constraints: ${contextText}]\n\n${cleanPrompt}`
                : `[Mode: ${mode}]\n\n${cleanPrompt}`,
            },
          ],
          max_tokens: 1800,
        }),
      });

      const elapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
      );

      if (res.success === false) {
        pushToast(res.error || 'AI router failed to generate solution', 'error');
        return;
      }

      const solutionText = (res.response || res.text || '').trim();
      if (!solutionText) {
        pushToast('AI router returned an empty response', 'warn');
        return;
      }

      const entry: InterviewSessionItem = {
        id: `int-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mode,
        prompt: cleanPrompt,
        context: contextText,
        solution: solutionText,
        provider: res.provider,
        model: res.model,
        latencyMs: elapsed,
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) => [entry, ...prev].slice(0, 25));
      setActiveSessionId(entry.id);
      pushToast(`Generated ${mode} brief (${elapsed} ms)`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Copilot inference failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void generateSolution();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void generateSolution();
    }
  };

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[0]?.id || '');
      }
      return next;
    });
  };

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      pushToast('Copied to clipboard', 'info');
    } catch {
      pushToast('Clipboard unavailable', 'warn');
    }
  };

  const renderedBlocks = useMemo(
    () => (activeSession ? splitMarkdownBlocks(activeSession.solution) : []),
    [activeSession]
  );

  const visionActive = Boolean(visionStatus?.active);
  const modeInfo = MODE_METADATA[mode];

  return (
    <div
      className={`flex h-full w-full flex-col bg-[#090a0c] transition-opacity ${
        stealthDimmed ? 'text-zinc-300 opacity-90' : 'text-zinc-100'
      }`}
    >
      {/* Single-Row Monograph Header */}
      <header className="monograph-hairline-b flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield className="h-4 w-4 text-emerald-400" />
          <h1 className="text-[14px] font-medium tracking-[-0.01em] text-zinc-100">
            Stealth Interview Copilot
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider tabular-nums ${
              visionActive
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/[0.08] bg-[#0e1014] text-zinc-400'
            }`}
          >
            <Eye className="h-3 w-3" />
            {visionActive
              ? `Vision ${visionStatus?.source || 'Active'} · ${visionStatus?.frames_processed ?? 0}`
              : 'Vision Standby'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <nav
            aria-label="Interview copilot mode"
            className="inline-flex rounded-md border border-white/[0.08] bg-[#0e1014] p-0.5"
          >
            {(['Coding', 'System Design', 'Behavioral'] as const).map((item) => {
              const active = mode === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item === 'Coding' && <Code2 className="h-3.5 w-3.5 text-emerald-400" />}
                  {item === 'System Design' && <Network className="h-3.5 w-3.5 text-amber-400" />}
                  {item === 'Behavioral' && (
                    <MessageSquareText className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>{item}</span>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => setStealthDimmed((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs transition ${
              stealthDimmed
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.08] bg-[#0e1014] text-zinc-400 hover:text-zinc-200'
            }`}
            title="Toggle low-glare stealth contrast"
          >
            {stealthDimmed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>Stealth</span>
          </button>

          <button
            type="button"
            onClick={() => void loadVisionStatus()}
            disabled={visionLoading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0e1014] text-zinc-400 transition hover:text-zinc-200"
            title="Refresh vision stream status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${visionLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Vision Status + Prompt Composer + Session History */}
          <section className="flex flex-col gap-6 lg:col-span-5">
            {/* Live Vision Stream Card */}
            <div className="monograph-surface rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      visionActive ? 'animate-pulse bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                  <span>Vision Telemetry</span>
                </div>
                <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">
                  {visionStatus?.frames_processed ?? 0} frames ·{' '}
                  {formatVisionTime(visionStatus?.last_frame_ts)}
                </span>
              </div>

              {visionStatus?.last_analysis ? (
                <div className="mt-3 flex flex-col gap-2.5">
                  <p className="line-clamp-3 rounded border border-white/[0.06] bg-[#090a0c] p-2.5 font-mono text-[11px] leading-relaxed text-zinc-300">
                    {visionStatus.last_analysis}
                  </p>
                  <button
                    type="button"
                    onClick={handleInjectVision}
                    className="self-start rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    Inject Vision Context
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">
                  Source: <span className="font-mono text-zinc-300">{visionStatus?.source || 'screen'}</span>
                  {' · '}Mode: <span className="font-mono text-zinc-300">{telemetry.workspaceMode}</span>
                  {' · '}No active frame analysis captured yet.
                </p>
              )}
            </div>

            {/* Prompt Composer */}
            <form
              onSubmit={handleSubmit}
              className="monograph-surface flex flex-col gap-4 rounded-lg p-5"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-[13.5px] font-medium text-zinc-100">{mode} Brief</h2>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    POST /api/ai/chat
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{modeInfo.subtitle}</p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Stack / Constraints (optional)
                </span>
                <input
                  type="text"
                  value={contextInput}
                  onChange={(e) => setContextInput(e.target.value)}
                  placeholder="e.g. Python 3.11, O(N log N) budget, 50k RPS SLA"
                  className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Prompt / Question
                </span>
                <textarea
                  rows={7}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={modeInfo.promptPlaceholder}
                  disabled={generating}
                  className="resize-y rounded-md border border-white/[0.08] bg-[#090a0c] p-3 text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none disabled:opacity-60"
                />
              </label>

              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-zinc-500">
                  <span className="monograph-kbd mr-1">Ctrl+Enter</span> Generate
                </span>

                <button
                  type="submit"
                  disabled={generating || !promptInput.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {generating ? 'Synthesizing…' : 'Generate Solution'}
                </button>
              </div>
            </form>

            {/* Session History */}
            <div className="monograph-surface flex flex-col gap-3 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Session History ({sessions.length})
                </span>
                {sessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSessions([]);
                      setActiveSessionId('');
                    }}
                    className="font-mono text-[11px] text-zinc-500 transition hover:text-red-300"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-500">
                  Generated answers will appear here for instant recall.
                </p>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {sessions.map((item) => {
                    const active = item.id === activeSession?.id;
                    return (
                      <div
                        key={item.id}
                        className={`flex items-start justify-between gap-2 rounded border p-2.5 transition ${
                          active
                            ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                            : 'border-white/[0.06] bg-[#090a0c] hover:border-white/[0.12]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveSessionId(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            <span className="text-emerald-300">{item.mode}</span>
                            {typeof item.latencyMs === 'number' && (
                              <span className="text-zinc-500 tabular-nums">
                                · {item.latencyMs} ms
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-200">{item.prompt}</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSession(item.id)}
                          className="rounded p-1 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300"
                          title="Remove session entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Structured AI Solution Reader */}
          <section className="monograph-surface flex flex-col rounded-lg p-6 lg:col-span-7">
            {generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 font-mono text-xs text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                <span>Generating structured {mode} solution via sovereign LLM router…</span>
              </div>
            ) : !activeSession ? (
              <div className="flex flex-1 flex-col justify-center py-12">
                <div className="mx-auto max-w-md">
                  <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-400">
                    <Compass className="h-3.5 w-3.5" />
                    <span>{mode} Structure</span>
                  </div>
                  <h2 className="text-base font-medium tracking-tight text-zinc-100">
                    Distraction-Free Answer Blueprint
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                    Every prompt routes directly to the live AI engine (<code className="font-mono text-zinc-300">/api/ai/chat</code>) and formats the response for fast scanning:
                  </p>
                  <ul className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 font-mono text-xs text-zinc-300">
                    {modeInfo.structureGuide.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Solution Header */}
                <div className="monograph-hairline-b flex flex-wrap items-center justify-between gap-3 pb-3">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                    <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                      {activeSession.mode}
                    </span>
                    <span className="text-zinc-300">
                      {activeSession.model || 'LLM Router'}
                    </span>
                    {activeSession.provider && (
                      <span className="text-zinc-500">· {activeSession.provider}</span>
                    )}
                    {typeof activeSession.latencyMs === 'number' && (
                      <span className="text-zinc-500 tabular-nums">
                        · {activeSession.latencyMs} ms
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopy(`sol-${activeSession.id}`, activeSession.solution)}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-[11px] text-zinc-300 transition hover:text-zinc-100"
                  >
                    {copiedId === `sol-${activeSession.id}` ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy Brief
                  </button>
                </div>

                {/* Question Recap */}
                <div className="rounded-md border border-white/[0.06] bg-[#090a0c] px-4 py-3">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Prompt
                  </span>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                    {activeSession.prompt}
                  </p>
                </div>

                {/* Structured Markdown + Code Blocks */}
                <div className="space-y-4">
                  {renderedBlocks.map((block, bIdx) => {
                    if (block.kind === 'code') {
                      const blockKey = `code-${activeSession.id}-${bIdx}`;
                      return (
                        <div
                          key={blockKey}
                          className="overflow-hidden rounded-md border border-white/[0.08] bg-[#090a0c]"
                        >
                          <div className="monograph-hairline-b flex items-center justify-between px-3 py-1.5 font-mono text-[10.5px] text-zinc-500">
                            <span>{block.lang || 'code'}</span>
                            <button
                              type="button"
                              onClick={() => void handleCopy(blockKey, block.body)}
                              className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-100"
                            >
                              {copiedId === blockKey ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              Copy
                            </button>
                          </div>
                          <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-zinc-200">
                            <code>{block.body}</code>
                          </pre>
                        </div>
                      );
                    }

                    return (
                      <div key={`txt-${bIdx}`} className="space-y-2 text-[13.5px] leading-relaxed">
                        {block.body.split('\n').map((line, lIdx) => {
                          const trimmed = line.trim();
                          if (!trimmed) return <div key={`sp-${lIdx}`} className="h-1" />;
                          if (trimmed.startsWith('### ')) {
                            return (
                              <h4
                                key={`h3-${lIdx}`}
                                className="pt-1 font-mono text-xs font-semibold uppercase tracking-wider text-amber-300"
                              >
                                {trimmed.slice(4)}
                              </h4>
                            );
                          }
                          if (trimmed.startsWith('## ')) {
                            return (
                              <h3
                                key={`h2-${lIdx}`}
                                className="border-b border-white/[0.06] pb-1 pt-2 text-sm font-medium text-emerald-300"
                              >
                                {trimmed.slice(3)}
                              </h3>
                            );
                          }
                          if (trimmed.startsWith('# ')) {
                            return (
                              <h2
                                key={`h1-${lIdx}`}
                                className="text-base font-semibold tracking-tight text-zinc-100"
                              >
                                {trimmed.slice(2)}
                              </h2>
                            );
                          }
                          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                            return (
                              <div key={`li-${lIdx}`} className="flex items-start gap-2.5 pl-1">
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                                <span className="text-zinc-200">{trimmed.slice(2)}</span>
                              </div>
                            );
                          }
                          return (
                            <p key={`p-${lIdx}`} className="text-zinc-200">
                              {trimmed}
                            </p>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default InterviewView;
