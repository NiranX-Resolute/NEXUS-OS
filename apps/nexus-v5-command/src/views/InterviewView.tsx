import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Briefcase,
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  History,
  Layers,
  Loader2,
  Network,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

type InterviewMode = 'Coding' | 'System Design' | 'Behavioral';

interface VisionStatusResponse {
  success?: boolean;
  active?: boolean;
  source?: string;
  frames_processed?: number;
  last_analysis?: string | null;
  last_frame_ts?: number | null;
  error?: string;
}

interface AiChatRawResponse {
  success?: boolean;
  response?: string | { text?: string; response?: string; provider?: string; model?: string };
  text?: string | { text?: string; response?: string; provider?: string; model?: string };
  provider?: string;
  model?: string;
  error?: string;
}

interface CopilotTurn {
  id: string;
  mode: InterviewMode;
  question: string;
  constraints: string;
  answer: string;
  provider: string;
  model: string;
  createdAt: string;
}

interface ParsedBlock {
  kind: 'text' | 'code';
  lang?: string;
  content: string;
}

const INTERVIEW_HISTORY_KEY = 'nexus_v5_interview_turns';

function loadSessionHistory(): CopilotTurn[] {
  try {
    const raw = window.localStorage.getItem(INTERVIEW_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CopilotTurn =>
        Boolean(t) &&
        typeof t.id === 'string' &&
        typeof t.question === 'string' &&
        typeof t.answer === 'string'
    );
  } catch {
    return [];
  }
}

function saveSessionHistory(turns: CopilotTurn[]): void {
  try {
    window.localStorage.setItem(INTERVIEW_HISTORY_KEY, JSON.stringify(turns.slice(0, 25)));
  } catch {
    // Ignore storage access limitations
  }
}

function extractChatReply(res: AiChatRawResponse): {
  text: string;
  provider: string;
  model: string;
} {
  const candidate = res.response ?? res.text;
  if (candidate && typeof candidate === 'object') {
    const nested = candidate as {
      text?: string;
      response?: string;
      provider?: string;
      model?: string;
    };
    return {
      text: String(nested.text ?? nested.response ?? '').trim(),
      provider: nested.provider || res.provider || 'local',
      model: nested.model || res.model || '',
    };
  }
  return {
    text: typeof candidate === 'string' ? candidate.trim() : '',
    provider: res.provider || 'local',
    model: res.model || '',
  };
}

function parseMarkdownBlocks(raw: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = fenceRegex.exec(raw);

  while (match !== null) {
    if (match.index > lastIndex) {
      const prose = raw.slice(lastIndex, match.index).trim();
      if (prose) blocks.push({ kind: 'text', content: prose });
    }
    blocks.push({
      kind: 'code',
      lang: match[1] || 'code',
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = fenceRegex.lastIndex;
    match = fenceRegex.exec(raw);
  }

  if (lastIndex < raw.length) {
    const tail = raw.slice(lastIndex).trim();
    if (tail) blocks.push({ kind: 'text', content: tail });
  }

  return blocks.length > 0 ? blocks : [{ kind: 'text', content: raw }];
}

function buildStructuredInterviewPrompt(params: {
  mode: InterviewMode;
  question: string;
  language: string;
  constraints: string;
  visionContext?: string | null;
}): string {
  const { mode, question, language, constraints, visionContext } = params;
  const visionBlock = visionContext ? `\n\nLive Screen Vision Context:\n${visionContext}` : '';
  const constraintBlock = constraints.trim() ? `\nConstraints / Focus: ${constraints.trim()}` : '';

  if (mode === 'Coding') {
    return (
      `You are a Principal Algorithms & Systems Engineer acting as a real-time Interview Copilot.\n` +
      `Mode: Coding (${language})${constraintBlock}\n\n` +
      `Problem Statement:\n${question}${visionBlock}\n\n` +
      `Respond with crisp, interview-ready sections:\n` +
      `## 1. Intuition & Optimal Approach\n` +
      `## 2. Production ${language} Implementation (fenced code block)\n` +
      `## 3. Time & Space Complexity\n` +
      `## 4. Edge Cases & Follow-Up Questions`
    );
  }

  if (mode === 'System Design') {
    return (
      `You are a Staff Distributed Systems Architect acting as a real-time Architecture Copilot.\n` +
      `Mode: System Design${constraintBlock}\n\n` +
      `Design Prompt:\n${question}${visionBlock}\n\n` +
      `Respond with crisp, structured architectural sections:\n` +
      `## 1. Functional & Non-Functional Requirements (Scale, SLA, Consistency)\n` +
      `## 2. High-Level Architecture & Data Flow\n` +
      `## 3. Storage, Partitioning & Bottleneck Mitigation\n` +
      `## 4. Failure Modes, Backpressure & Trade-offs`
    );
  }

  return (
    `You are an Engineering Leadership Interview Copilot.\n` +
    `Mode: Behavioral${constraintBlock}\n\n` +
    `Prompt:\n${question}${visionBlock}\n\n` +
    `Structure an authentic, concrete response framework:\n` +
    `## 1. STAR Outline (Situation, Task, Action, Result)\n` +
    `## 2. Technical Ownership & Metrics to Highlight\n` +
    `## 3. Anticipated Follow-up Probes & Direct Answers`
  );
}

export function InterviewView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [mode, setMode] = useState<InterviewMode>('Coding');
  const [stealthDimmed, setStealthDimmed] = useState(false);

  // Vision Status
  const [visionStatus, setVisionStatus] = useState<VisionStatusResponse | null>(null);
  const [loadingVision, setLoadingVision] = useState(false);
  const [includeVisionContext, setIncludeVisionContext] = useState(false);

  // Copilot Inputs
  const [language, setLanguage] = useState('TypeScript');
  const [constraints, setConstraints] = useState('');
  const [question, setQuestion] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Copilot Output & Session History
  const [turns, setTurns] = useState<CopilotTurn[]>(() => loadSessionHistory());
  const [activeTurnId, setActiveTurnId] = useState<string | null>(() => {
    const existing = loadSessionHistory();
    return existing[0]?.id ?? null;
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    saveSessionHistory(turns);
  }, [turns]);

  const fetchVisionStatus = useCallback(async () => {
    setLoadingVision(true);
    const res = await ipcJson<VisionStatusResponse>('/api/vision/status');
    setVisionStatus(res);
    setLoadingVision(false);
  }, []);

  useEffect(() => {
    void fetchVisionStatus();
  }, [fetchVisionStatus]);

  const activeTurn = useMemo(
    () => turns.find((t) => t.id === activeTurnId) ?? turns[0] ?? null,
    [turns, activeTurnId]
  );

  const parsedBlocks = useMemo(
    () => (activeTurn ? parseMarkdownBlocks(activeTurn.answer) : []),
    [activeTurn]
  );

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedQ = question.trim();
    if (!trimmedQ) {
      pushToast('Enter an interview question or system prompt first', 'warn');
      return;
    }

    setGenerating(true);
    setGenerationError(null);
    setCopiedKey(null);

    const prompt = buildStructuredInterviewPrompt({
      mode,
      question: trimmedQ,
      language,
      constraints,
      visionContext: includeVisionContext ? visionStatus?.last_analysis : null,
    });

    const res = await ipcJson<AiChatRawResponse>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        max_tokens: 1400,
      }),
    });

    setGenerating(false);

    if (!res.success) {
      const msg = res.error || 'AI Copilot request failed';
      setGenerationError(msg);
      pushToast(msg, 'error');
      return;
    }

    const reply = extractChatReply(res);
    if (!reply.text) {
      const msg = 'AI provider returned an empty response payload';
      setGenerationError(msg);
      pushToast(msg, 'error');
      return;
    }

    const turn: CopilotTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      mode,
      question: trimmedQ,
      constraints: constraints.trim(),
      answer: reply.text,
      provider: reply.provider,
      model: reply.model,
      createdAt: new Date().toISOString(),
    };

    setTurns((prev) => [turn, ...prev]);
    setActiveTurnId(turn.id);
    pushToast(`Generated ${mode} brief via ${reply.provider}`, 'success');
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      pushToast('Copied to clipboard', 'info');
    } catch {
      pushToast('Clipboard access unavailable', 'warn');
    }
  };

  const handleDeleteTurn = (id: string) => {
    setTurns((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTurnId === id) {
        setActiveTurnId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const visionActive = Boolean(visionStatus?.active);

  return (
    <div
      className={`h-full overflow-y-auto p-6 space-y-6 animate-matrix-in transition-opacity ${
        stealthDimmed ? 'opacity-85' : 'opacity-100'
      }`}
    >
      {/* Top Bar */}
      <div className="matrix-panel matrix-border rounded-2xl p-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-cyan-500/12 border border-cyan-400/30 flex items-center justify-center shrink-0 matrix-glow-cyan">
            <Shield className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-emerald-50">
              Stealth Interview &amp; Architecture Copilot
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live LLM Structured Briefs · Screen Vision Telemetry · Zero Static Samples
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Selector */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#05080b] border border-white/10 gap-1">
            {(
              [
                { id: 'Coding', icon: Code2 },
                { id: 'System Design', icon: Network },
                { id: 'Behavioral', icon: Briefcase },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const selected = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    selected
                      ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${selected ? 'text-emerald-400' : 'text-slate-500'}`} />
                  {item.id}
                </button>
              );
            })}
          </div>

          {/* Vision Status Pill */}
          <button
            type="button"
            onClick={() => void fetchVisionStatus()}
            title="Refresh Vision Telemetry (GET /api/vision/status)"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono border transition cursor-pointer ${
              visionActive
                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
                : 'bg-black/40 border-white/10 text-slate-300 hover:border-cyan-400/35'
            }`}
          >
            <Eye className={`h-3.5 w-3.5 ${visionActive ? 'text-emerald-400' : 'text-cyan-400'}`} />
            <span>
              Vision: {visionActive ? 'ACTIVE' : 'STANDBY'} ·{' '}
              {visionStatus?.frames_processed ?? 0}f
            </span>
            <RefreshCw className={`h-3 w-3 ${loadingVision ? 'animate-spin' : ''}`} />
          </button>

          {/* Stealth Visual Dim Toggle */}
          <button
            type="button"
            onClick={() => setStealthDimmed((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition cursor-pointer ${
              stealthDimmed
                ? 'bg-cyan-500/18 border-cyan-400/40 text-cyan-200'
                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {stealthDimmed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {stealthDimmed ? 'Stealth Dim' : 'Normal HUD'}
          </button>
        </div>
      </div>

      {/* Main 12-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Prompt Deck + Vision Card + Session History */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={(e) => void handleGenerate(e)}
            className="matrix-panel matrix-border rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-emerald-50">{mode} Prompt</h2>
              </div>
              <span className="text-[11px] font-mono text-cyan-300/80">POST /api/ai/chat</span>
            </div>

            {mode === 'Coding' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-xs font-mono text-emerald-100"
                  >
                    <option value="TypeScript">TypeScript</option>
                    <option value="Python">Python</option>
                    <option value="Go">Go</option>
                    <option value="Rust">Rust</option>
                    <option value="C++">C++</option>
                    <option value="Java">Java</option>
                    <option value="SQL">SQL</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Target Constraints</label>
                  <input
                    type="text"
                    value={constraints}
                    onChange={(e) => setConstraints(e.target.value)}
                    placeholder="e.g. O(N log N) time, O(1) space"
                    className="w-full px-3 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              </div>
            )}

            {mode === 'System Design' && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">
                  Scale, Latency &amp; Consistency Targets
                </label>
                <input
                  type="text"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder="e.g. 100k QPS, p99 < 50ms, multi-region active-active"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            {mode === 'Behavioral' && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">
                  Competency / Leadership Lens
                </label>
                <input
                  type="text"
                  value={constraints}
                  onChange={(e) => setConstraints(e.target.value)}
                  placeholder="e.g. Cross-team ambiguity, incident postmortem, staff ownership"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">
                Question / Problem Statement
              </label>
              <textarea
                rows={6}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Paste or type the live interview prompt..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-600 resize-y"
              />
            </div>

            {visionStatus?.last_analysis && (
              <label className="flex items-center gap-2 text-xs text-cyan-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeVisionContext}
                  onChange={(e) => setIncludeVisionContext(e.target.checked)}
                  className="accent-cyan-400"
                />
                Inject latest Vision stream analysis into prompt
              </label>
            )}

            <button
              type="submit"
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-100 transition disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-emerald-400" />
              )}
              {generating ? 'Synthesizing Structured Brief...' : 'Generate Structured Answer'}
            </button>

            {telemetry.workspaceMode === 'SILENT' && (
              <p className="text-[11px] font-mono text-amber-300/90">
                SILENT mode active: /api/ai/chat routes strictly to local inference providers.
              </p>
            )}
          </form>

          {/* Vision Telemetry Card */}
          <div className="matrix-panel rounded-2xl p-4 border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
                <Eye className="h-4 w-4 text-cyan-400" />
                Vision Stream Telemetry
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Source: {visionStatus?.source || 'screen'}
              </span>
            </div>

            {visionStatus?.last_analysis ? (
              <p className="text-xs text-slate-300 bg-[#05080b] border border-white/8 rounded-xl p-3 max-h-28 overflow-y-auto whitespace-pre-wrap">
                {visionStatus.last_analysis}
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                {visionActive
                  ? 'Vision pipeline active; awaiting first frame analysis.'
                  : 'Vision stream is in standby (0 background capture overhead).'}
              </p>
            )}
          </div>

          {/* Session History */}
          {turns.length > 0 && (
            <div className="matrix-panel rounded-2xl p-4 border border-white/10 space-y-3">
              <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-50">
                  <History className="h-4 w-4 text-emerald-400" />
                  Session Briefs ({turns.length})
                </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {turns.map((turn) => {
                  const selected = activeTurn?.id === turn.id;
                  return (
                    <div
                      key={turn.id}
                      onClick={() => setActiveTurnId(turn.id)}
                      className={`rounded-xl p-2.5 border transition cursor-pointer flex items-start justify-between gap-2 ${
                        selected
                          ? 'bg-emerald-500/12 border-emerald-500/40'
                          : 'bg-[#05080b]/70 border-white/8 hover:border-white/20'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-cyan-300">{turn.mode}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(turn.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-xs text-slate-200 truncate mt-0.5">
                          {turn.question}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTurn(turn.id);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-red-300 cursor-pointer"
                        title="Remove brief from history"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Structured Answer Output */}
        <div className="lg:col-span-7 space-y-4">
          {generationError && (
            <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">AI Generation Failed</div>
                  <div className="text-red-300/90 mt-0.5">{generationError}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 cursor-pointer shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!activeTurn ? (
            <div className="matrix-panel rounded-2xl p-12 text-center border border-white/10 space-y-3">
              <Layers className="h-9 w-9 text-cyan-400/50 mx-auto" />
              <h3 className="text-sm font-semibold text-emerald-50">
                Copilot Standby — Ready for Live Prompt
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Select <strong className="text-emerald-300">Coding</strong>,{' '}
                <strong className="text-cyan-300">System Design</strong>, or{' '}
                <strong className="text-emerald-300">Behavioral</strong> mode and submit an
                interview question. Structured solutions are generated live via{' '}
                <code className="text-cyan-300 font-mono">/api/ai/chat</code>.
              </p>
            </div>
          ) : (
            <div className="matrix-panel matrix-border rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
                      {activeTurn.mode}
                    </span>
                    <span className="text-[11px] font-mono text-cyan-300">
                      {activeTurn.provider}
                      {activeTurn.model ? ` · ${activeTurn.model}` : ''}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-emerald-50">{activeTurn.question}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyText(activeTurn.answer, activeTurn.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition cursor-pointer"
                >
                  {copiedKey === activeTurn.id ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedKey === activeTurn.id ? 'Copied' : 'Copy Full Brief'}
                </button>
              </div>

              <div className="space-y-4">
                {parsedBlocks.map((block, idx) =>
                  block.kind === 'code' ? (
                    <div
                      key={`${activeTurn.id}-code-${idx}`}
                      className="rounded-xl overflow-hidden border border-cyan-400/25 bg-[#04070a]"
                    >
                      <div className="flex items-center justify-between px-3.5 py-2 bg-white/[0.03] border-b border-white/8">
                        <span className="text-[11px] font-mono uppercase text-cyan-300">
                          {block.lang || 'code'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopyText(block.content, `${activeTurn.id}-code-${idx}`)
                          }
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-emerald-300 cursor-pointer"
                        >
                          {copiedKey === `${activeTurn.id}-code-${idx}` ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copy Code
                        </button>
                      </div>
                      <pre className="p-4 text-xs font-mono text-emerald-100 overflow-x-auto leading-relaxed">
                        <code>{block.content}</code>
                      </pre>
                    </div>
                  ) : (
                    <div
                      key={`${activeTurn.id}-text-${idx}`}
                      className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap"
                    >
                      {block.content}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InterviewView;
