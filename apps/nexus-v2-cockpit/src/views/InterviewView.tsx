import { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  Code2,
  Server,
  MessageSquare,
  Eye,
  EyeOff,
  Send,
  RefreshCw,
  Copy,
  Check,
  Database,
  Trash2,
  Clock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

export type InterviewMode = 'Coding' | 'System Design' | 'Behavioral';

interface VisionStatusResponse {
  active?: boolean;
  source?: string;
  frames_processed?: number;
  last_analysis?: string | null;
  last_frame_ts?: number | null;
}

interface AiChatRawResponse {
  response?: unknown;
  text?: unknown;
  provider?: string;
  model?: string;
}

interface InterviewAnswerRecord {
  id: string;
  mode: InterviewMode;
  question: string;
  constraints: string;
  answer: string;
  provider?: string;
  model?: string;
  latencyMs: number;
  createdAt: number;
}

const HISTORY_STORAGE_KEY = 'nexus_v2_interview_sessions';

const MODE_META: Record<
  InterviewMode,
  {
    label: string;
    subtitle: string;
    structurePrompt: string;
    promptHint: string;
  }
> = {
  Coding: {
    label: 'Coding',
    subtitle: 'Algorithmic intuition, invariants, complexity bounds, and clean production code.',
    structurePrompt:
      'Respond using clearly headed markdown sections:\n## 1. Core Intuition & Invariants\n## 2. Edge Cases & Constraints\n## 3. Complexity Analysis (Time & Space)\n## 4. Production Implementation\n(Include a clean fenced code block with well-typed code.)',
    promptHint:
      'Paste a coding problem or algorithmic prompt (e.g., Design a thread-safe rate limiter or solve a graph traversal problem)...',
  },
  'System Design': {
    label: 'System Design',
    subtitle: 'Requirements, scale estimates, architecture topology, data flow, and failure modes.',
    structurePrompt:
      'Respond using clearly headed markdown sections:\n## 1. Functional & Non-Functional Requirements\n## 2. High-Level Architecture & Data Flow\n## 3. Storage, Partitioning & Consistency\n## 4. Bottlenecks, Failure Modes & Trade-offs',
    promptHint:
      'Describe the distributed system or architecture prompt (e.g., Multi-region event ingestion pipeline with idempotent delivery)...',
  },
  Behavioral: {
    label: 'Behavioral',
    subtitle: 'Structured STAR narrative: Situation, Task, High-Agency Actions, Quantified Impact.',
    structurePrompt:
      'Respond using clearly headed STAR markdown sections:\n## 1. Situation & Context\n## 2. Task & Ownership\n## 3. Concrete Technical & Leadership Actions\n## 4. Measurable Outcome & Key Takeaway',
    promptHint:
      'Enter the behavioral or leadership question and any personal project context you want woven into a STAR outline...',
  },
};

function loadHistory(): InterviewAnswerRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InterviewAnswerRecord[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: InterviewAnswerRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records.slice(0, 25)));
  } catch {
    // Ignore storage quota errors
  }
}

function extractAiText(raw: AiChatRawResponse): { text: string; provider?: string; model?: string; error?: string } {
  const candidate = raw.response ?? raw.text;
  if (typeof candidate === 'string') {
    return { text: candidate, provider: raw.provider, model: raw.model };
  }
  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;
    const nestedText =
      (typeof obj.text === 'string' && obj.text) ||
      (typeof obj.response === 'string' && obj.response) ||
      (typeof obj.content === 'string' && obj.content) ||
      '';
    const nestedErr = typeof obj.error === 'string' ? obj.error : undefined;
    return {
      text: nestedText,
      provider: (typeof obj.provider === 'string' ? obj.provider : raw.provider),
      model: (typeof obj.model === 'string' ? obj.model : raw.model),
      error: nestedErr,
    };
  }
  return { text: '', provider: raw.provider, model: raw.model };
}

function StructuredAnswerBody({ content }: { content: string }) {
  const [copiedBlockIndex, setCopiedBlockIndex] = useState<number | null>(null);

  const segments = content.split(/(```[\s\S]*?```)/g);

  const copyCode = async (code: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedBlockIndex(idx);
      setTimeout(() => setCopiedBlockIndex(null), 1600);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm text-slate-200 leading-relaxed">
      {segments.map((segment, idx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const lines = segment.slice(3, -3).split('\n');
          const lang = lines[0]?.trim() || 'code';
          const codeBody = (lines.length > 1 ? lines.slice(1).join('\n') : lines[0] || '').trim();
          return (
            <div
              key={idx}
              className="rounded-xl overflow-hidden border border-cyan-400/25 bg-[#030710]"
            >
              <div className="px-3.5 py-2 bg-[#091322] border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-cyan-300">
                <span>{lang}</span>
                <button
                  type="button"
                  onClick={() => void copyCode(codeBody, idx)}
                  className="text-slate-300 hover:text-cyan-200 flex items-center gap-1"
                >
                  {copiedBlockIndex === idx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono text-slate-100 overflow-x-auto leading-relaxed">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }

        const lines = segment.split('\n');
        return (
          <div key={idx} className="flex flex-col gap-1.5">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mt-2">
                    {trimmed.slice(4)}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
                const text = trimmed.replace(/^#{1,3}\s+/, '');
                return (
                  <h3 key={lineIdx} className="text-sm font-semibold text-cyan-300 mt-2.5 border-b border-cyan-400/15 pb-1">
                    {text}
                  </h3>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2 pl-2 text-xs text-slate-200">
                    <span className="text-cyan-400 mt-0.5">•</span>
                    <span>{trimmed.slice(2)}</span>
                  </div>
                );
              }
              return (
                <p key={lineIdx} className="text-xs text-slate-200 leading-relaxed">
                  {trimmed}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function InterviewView() {
  const pushToast = useNexusStore((s) => s.pushToast);
  const workspaceMode = useNexusStore((s) => s.telemetry.workspaceMode);

  const [mode, setMode] = useState<InterviewMode>('Coding');
  const [stealthFocus, setStealthFocus] = useState(false);

  // Vision status telemetry
  const [visionStatus, setVisionStatus] = useState<VisionStatusResponse | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [includeVisionContext, setIncludeVisionContext] = useState(false);

  // Question & AI generation
  const [question, setQuestion] = useState('');
  const [constraints, setConstraints] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Session History (real responses only)
  const [history, setHistory] = useState<InterviewAnswerRecord[]>(() => loadHistory());
  const [activeRecordId, setActiveRecordId] = useState<string | null>(() => {
    const initial = loadHistory();
    return initial[0]?.id ?? null;
  });
  const [copiedFull, setCopiedFull] = useState(false);
  const [savingToMemory, setSavingToMemory] = useState(false);

  const activeRecord = history.find((item) => item.id === activeRecordId) ?? null;

  const fetchVisionStatus = useCallback(async () => {
    setVisionLoading(true);
    setVisionError(null);
    try {
      const res = await ipcJson<VisionStatusResponse>('/api/vision/status');
      if (res.success === false) {
        setVisionError(res.error || 'Vision status unavailable');
        return;
      }
      setVisionStatus(res);
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : 'Vision IPC unreachable');
    } finally {
      setVisionLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchVisionStatus();
  }, [fetchVisionStatus]);

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      pushToast('Enter an interview question or architecture prompt first', 'warn');
      return;
    }

    setGenerating(true);
    setGenError(null);
    const started = performance.now();

    const meta = MODE_META[mode];
    const visionSnippet =
      includeVisionContext && visionStatus?.last_analysis
        ? `\n\nObserved Screen/Vision Telemetry:\n${visionStatus.last_analysis}`
        : '';
    const constraintSnippet = constraints.trim()
      ? `\n\nTarget Stack / Constraints:\n${constraints.trim()}`
      : '';

    const fullPrompt =
      `You are the Nexus Stealth Interview & Architecture Copilot operating in ${mode} mode.\n` +
      `${meta.structurePrompt}\n\n` +
      `Question / Prompt:\n${cleanQuestion}${constraintSnippet}${visionSnippet}`;

    try {
      const res = await ipcJson<AiChatRawResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: fullPrompt,
          messages: [{ role: 'user', content: fullPrompt }],
          max_tokens: 1500,
        }),
      });

      const latencyMs = Math.round(performance.now() - started);
      const extracted = extractAiText(res);

      if (res.success === false || extracted.error || !extracted.text.trim()) {
        const errMsg =
          extracted.error ||
          res.error ||
          'AI backend returned an empty response. Verify local LLM or provider keys in Settings.';
        setGenError(errMsg);
        pushToast(errMsg, 'error');
        return;
      }

      const record: InterviewAnswerRecord = {
        id: `iv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mode,
        question: cleanQuestion,
        constraints: constraints.trim(),
        answer: extracted.text.trim(),
        provider: extracted.provider,
        model: extracted.model,
        latencyMs,
        createdAt: Date.now(),
      };

      setHistory((prev) => {
        const next = [record, ...prev].slice(0, 25);
        saveHistory(next);
        return next;
      });
      setActiveRecordId(record.id);
      pushToast(`Structured ${mode} answer generated (${latencyMs}ms)`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI generation request failed';
      setGenError(message);
      pushToast(message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyFull = async () => {
    if (!activeRecord?.answer) return;
    try {
      await navigator.clipboard.writeText(activeRecord.answer);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 1800);
    } catch {
      pushToast('Clipboard access unavailable', 'warn');
    }
  };

  const handleSaveToMemory = async () => {
    if (!activeRecord) return;
    setSavingToMemory(true);
    try {
      const res = await ipcJson('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: `[${activeRecord.mode}] ${activeRecord.question.slice(0, 80)}`,
          namespace: 'STUDY',
          content: `Question:\n${activeRecord.question}\n\nStructured Answer:\n${activeRecord.answer}`,
          metadata: {
            source: 'interview_copilot',
            mode: activeRecord.mode,
            provider: activeRecord.provider,
            model: activeRecord.model,
          },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed saving answer to STUDY memory', 'error');
        return;
      }
      pushToast('Saved structured answer to STUDY FTS5 memory', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory save failed', 'error');
    } finally {
      setSavingToMemory(false);
    }
  };

  const handleDeleteRecord = (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveHistory(next);
      if (activeRecordId === id) {
        setActiveRecordId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const activeModeMeta = MODE_META[mode];

  return (
    <div
      className={`h-full overflow-y-auto p-6 flex flex-col gap-6 transition-opacity duration-200 ${
        stealthFocus ? 'opacity-90' : 'opacity-100'
      }`}
    >
      {/* Top Bar: Identity, Mode Selector, Vision Telemetry */}
      <div className="aether-glass rounded-2xl p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 aether-glow-cyan">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                Stealth Interview &amp; Architecture Copilot
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                {workspaceMode}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{activeModeMeta.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-[#050a14]/85 p-1.5 rounded-xl border border-slate-700/40">
            {(['Coding', 'System Design', 'Behavioral'] as const).map((item) => {
              const Icon =
                item === 'Coding' ? Code2 : item === 'System Design' ? Server : MessageSquare;
              const selected = mode === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                    selected
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/45'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item}
                </button>
              );
            })}
          </div>

          {/* Stealth Display Toggle */}
          <button
            type="button"
            onClick={() => setStealthFocus((v) => !v)}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-medium border flex items-center gap-2 transition-colors ${
              stealthFocus
                ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/40'
                : 'bg-[#050a14]/80 text-slate-300 border-slate-700/60 hover:border-cyan-400/40'
            }`}
          >
            {stealthFocus ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {stealthFocus ? 'Stealth Focus On' : 'Stealth Focus'}
          </button>
        </div>
      </div>

      {/* Vision Status Telemetry Strip */}
      <div className="aether-panel rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              visionStatus?.active
                ? 'bg-emerald-400 aether-pulse'
                : 'bg-slate-500'
            }`}
          />
          <span className="text-xs font-medium text-slate-200">Vision Stream Sensor</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#050a14] border border-slate-800 text-cyan-300">
            {visionStatus?.active ? 'STREAM ACTIVE' : 'STANDBY'}
          </span>
          {visionStatus?.source && (
            <span className="text-[11px] font-mono text-slate-400">
              source: {visionStatus.source}
            </span>
          )}
          {typeof visionStatus?.frames_processed === 'number' && (
            <span className="text-[11px] font-mono text-slate-400">
              frames: {visionStatus.frames_processed}
            </span>
          )}
          {visionError && <span className="text-[11px] text-amber-300">{visionError}</span>}
        </div>

        <div className="flex items-center gap-3">
          {visionStatus?.last_analysis && (
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVisionContext}
                onChange={(e) => setIncludeVisionContext(e.target.checked)}
                className="accent-cyan-400 w-3.5 h-3.5"
              />
              <span>Inject Vision context</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => void fetchVisionStatus()}
            disabled={visionLoading}
            className="px-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${visionLoading ? 'animate-spin' : ''}`} />
            Probe Vision
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-0">
        {/* Left: Prompt Input + Session History */}
        <div
          className={`lg:col-span-5 flex flex-col gap-6 ${
            stealthFocus ? 'opacity-75 hover:opacity-100 transition-opacity' : ''
          }`}
        >
          <form
            onSubmit={(e) => void handleGenerate(e)}
            className="aether-bracket-card rounded-2xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                {mode} Prompt Input
              </h2>
              <span className="text-[11px] font-mono text-slate-500">Ctrl+Enter to run</span>
            </div>

            <textarea
              rows={6}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
              placeholder={activeModeMeta.promptHint}
              className="w-full px-3.5 py-3 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 resize-y leading-relaxed"
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-300">
                Stack / Constraints (optional)
              </label>
              <input
                type="text"
                value={constraints}
                onChange={(e) => setConstraints(e.target.value)}
                placeholder={
                  mode === 'Coding'
                    ? 'e.g., TypeScript or Python, O(log n) target'
                    : mode === 'System Design'
                      ? 'e.g., 100k RPS, <50ms p99, single-region failover'
                      : 'e.g., Staff Systems Engineer, incident mitigation story'
                }
                className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            {visionStatus?.last_analysis && includeVisionContext && (
              <div className="rounded-xl p-3 bg-cyan-500/10 border border-cyan-400/25 text-[11px] text-cyan-200 line-clamp-3">
                <span className="font-mono uppercase text-cyan-300 mr-1.5">Vision Attached:</span>
                {visionStatus.last_analysis}
              </div>
            )}

            {genError && (
              <div className="rounded-xl p-3 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{genError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={generating}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-cyan-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Synthesizing Structured Answer...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Generate {mode} Answer
                </>
              )}
            </button>
          </form>

          {/* Session History */}
          <div className="aether-glass rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Session Answers ({history.length})
              </h3>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Answers generated via <code className="text-cyan-300 font-mono">/api/ai/chat</code>{' '}
                appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                {history.map((item) => {
                  const selected = item.id === activeRecordId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setActiveRecordId(item.id)}
                      className={`rounded-xl p-3 border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        selected
                          ? 'bg-cyan-500/12 border-cyan-400/45'
                          : 'bg-[#050a14]/75 border-slate-800/80 hover:border-cyan-400/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300">
                            {item.mode}
                          </span>
                          <span className="text-[10px] font-mono text-emerald-300">
                            {item.latencyMs}ms
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 truncate mt-1">{item.question}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-slate-500">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRecord(item.id);
                        }}
                        aria-label="Remove answer from session history"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Structured AI Answer Output */}
        <div className="lg:col-span-7 aether-glass rounded-2xl p-6 flex flex-col gap-4 min-h-[460px]">
          {activeRecord ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                      {activeRecord.mode}
                    </span>
                    {activeRecord.provider && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                        {activeRecord.provider}
                        {activeRecord.model ? ` • ${activeRecord.model}` : ''}
                      </span>
                    )}
                    <span className="text-[11px] font-mono text-slate-400">
                      {activeRecord.latencyMs}ms
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-slate-100 mt-1.5 leading-snug">
                    {activeRecord.question}
                  </h3>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleSaveToMemory()}
                    disabled={savingToMemory}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Database className="w-3.5 h-3.5" />
                    {savingToMemory ? 'Saving...' : 'Save to STUDY'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyFull()}
                    className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5"
                  >
                    {copiedFull ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[600px] pr-1">
                <StructuredAnswerBody content={activeRecord.answer} />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-cyan-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                Ready for Live {mode} Synthesis
              </h3>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                Submit a real prompt on the left to stream structured guidance directly from your
                configured Nexus AI router via <code className="text-cyan-300 font-mono">POST /api/ai/chat</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InterviewView;
