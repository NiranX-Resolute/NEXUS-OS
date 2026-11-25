import React, { useCallback, useEffect, useState } from 'react'
import {
  Check,
  Code2,
  Copy,
  Eye,
  EyeOff,
  History,
  MessageSquareQuote,
  Network,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'

export type InterviewMode = 'Coding' | 'System Design' | 'Behavioral'

interface VisionStatusResponse {
  success?: boolean
  active?: boolean
  source?: string
  frames_processed?: number
  last_analysis?: string | null
  last_frame_ts?: number | null
  error?: string
}

interface AiChatApiResponse {
  success?: boolean
  response?: unknown
  text?: unknown
  provider?: string
  model?: string
  error?: string
}

interface InterviewSessionItem {
  id: string
  mode: InterviewMode
  question: string
  answer: string
  provider?: string
  model?: string
  createdAt: string
}

const MODE_META: Record<
  InterviewMode,
  {
    icon: React.ComponentType<{ className?: string }>
    subtitle: string
    starters: string[]
  }
> = {
  Coding: {
    icon: Code2,
    subtitle: 'Algorithmic intuition, invariants, complexity & clean implementation',
    starters: [
      'Design an O(1) LRU Cache with thread-safe eviction semantics',
      'Implement a rate limiter supporting sliding window counters',
      'Merge K sorted streams and analyze heap memory bounds',
    ],
  },
  'System Design': {
    icon: Network,
    subtitle: 'Scale envelope, data flow, consistency trade-offs & failure recovery',
    starters: [
      'Architect a local-first AI desktop IPC spine with zero-trust sandboxing',
      'Design a distributed real-time telemetry ingestion & alerting pipeline',
      'Design a multi-region collaborative workspace sync engine',
    ],
  },
  Behavioral: {
    icon: MessageSquareQuote,
    subtitle: 'STAR narrative structure, ownership signals & architectural trade-offs',
    starters: [
      'Tell me about a time you resolved a high-severity production latency regression',
      'Describe an architectural disagreement and how you aligned the team',
      'Explain how you shipped a complex system under tight resource constraints',
    ],
  },
}

function buildStructuredPrompt(
  mode: InterviewMode,
  question: string,
  stackContext: string,
  visionContext: string | null,
): string {
  const stackLine = stackContext.trim() ? `Target language / context: ${stackContext.trim()}` : ''
  const visionLine = visionContext
    ? `\nLive screen vision context observed:\n${visionContext}\n`
    : ''

  if (mode === 'Coding') {
    return [
      'You are a Principal Algorithms & Systems Interview Copilot.',
      stackLine,
      visionLine,
      `Problem:\n${question}`,
      'Respond concisely with these exact markdown sections:',
      '## 1. Core Approach & Invariant',
      '## 2. Complexity Analysis (Time & Space)',
      '## 3. Production Implementation (fenced code block)',
      '## 4. Edge Cases & Verification',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  if (mode === 'System Design') {
    return [
      'You are a Staff Distributed Systems Architect Interview Copilot.',
      stackLine,
      visionLine,
      `Architecture Prompt:\n${question}`,
      'Respond concisely with these exact markdown sections:',
      '## 1. Requirements & Scale Envelope',
      '## 2. High-Level Architecture & Data Flow',
      '## 3. Storage, Consistency & Latency Trade-offs',
      '## 4. Failure Modes, Security & Observability',
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  return [
    'You are an Engineering Leadership Behavioral Interview Copilot.',
    stackLine,
    visionLine,
    `Behavioral Prompt:\n${question}`,
    'Structure a sharp, authentic STAR response framework using these sections:',
    '## 1. Situation & Context',
    '## 2. Task & Ownership Scope',
    '## 3. Action & Technical Decisions',
    '## 4. Measurable Result & Follow-up Defense',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function extractAiChatReply(res: AiChatApiResponse): {
  text: string
  provider?: string
  model?: string
  error?: string
} {
  const pickFromUnknown = (
    val: unknown,
  ): { text: string; provider?: string; model?: string; error?: string } => {
    if (typeof val === 'string' && val.trim()) {
      return { text: val }
    }
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>
      const innerText =
        typeof obj.text === 'string'
          ? obj.text
          : typeof obj.response === 'string'
            ? obj.response
            : ''
      if (innerText.trim()) {
        return {
          text: innerText,
          provider: typeof obj.provider === 'string' ? obj.provider : undefined,
          model: typeof obj.model === 'string' ? obj.model : undefined,
        }
      }
      if (typeof obj.error === 'string' && obj.error.trim()) {
        return { text: '', error: obj.error }
      }
    }
    return { text: '' }
  }

  const fromText = pickFromUnknown(res.text)
  if (fromText.text) {
    return {
      text: fromText.text,
      provider: res.provider || fromText.provider,
      model: res.model || fromText.model,
    }
  }
  const fromResponse = pickFromUnknown(res.response)
  if (fromResponse.text) {
    return {
      text: fromResponse.text,
      provider: res.provider || fromResponse.provider,
      model: res.model || fromResponse.model,
    }
  }
  return {
    text: '',
    error: res.error || fromText.error || fromResponse.error,
  }
}

interface ParsedSegment {
  type: 'text' | 'code'
  language?: string
  content: string
}

function parseMarkdownSegments(markdown: string): ParsedSegment[] {
  const segments: ParsedSegment[] = []
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: markdown.slice(lastIndex, match.index),
      })
    }
    segments.push({
      type: 'code',
      language: match[1] || 'code',
      content: match[2].trimEnd(),
    })
    lastIndex = fenceRegex.lastIndex
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: 'text',
      content: markdown.slice(lastIndex),
    })
  }

  return segments
}

function StructuredAnswerRenderer({
  content,
  onCopyCode,
}: {
  content: string
  onCopyCode: (code: string) => void
}) {
  const segments = parseMarkdownSegments(content)

  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-200">
      {segments.map((segment, segIdx) => {
        if (segment.type === 'code') {
          return (
            <div
              key={segIdx}
              className="overflow-hidden rounded-2xl border border-white/10 bg-[#070b10]"
            >
              <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-3.5 py-2 text-[11px] text-slate-400">
                <span className="font-mono uppercase tracking-wider text-emerald-300">
                  {segment.language}
                </span>
                <button
                  type="button"
                  onClick={() => onCopyCode(segment.content)}
                  className="flex items-center gap-1 text-slate-400 transition hover:text-slate-100"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
                <code>{segment.content}</code>
              </pre>
            </div>
          )
        }

        const lines = segment.content.split('\n')
        return (
          <div key={segIdx} className="space-y-2">
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim()
              if (!trimmed) return <div key={lineIdx} className="h-1" />
              if (trimmed.startsWith('### ')) {
                return (
                  <h4 key={lineIdx} className="pt-2 text-sm font-semibold text-emerald-300">
                    {trimmed.slice(4)}
                  </h4>
                )
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3 key={lineIdx} className="pt-2.5 text-base font-semibold text-slate-100">
                    {trimmed.slice(3)}
                  </h3>
                )
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h2 key={lineIdx} className="pt-1 text-lg font-semibold text-emerald-200">
                    {trimmed.slice(2)}
                  </h2>
                )
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lineIdx} className="flex items-start gap-2.5 pl-1 text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
                    <span>{trimmed.slice(2)}</span>
                  </div>
                )
              }
              return (
                <p key={lineIdx} className="text-slate-300">
                  {trimmed}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

export function InterviewView() {
  const pushToast = useNexusStore((s) => s.pushToast)
  const workspaceMode = useNexusStore((s) => s.telemetry.workspaceMode)

  const [mode, setMode] = useState<InterviewMode>('Coding')
  const [stealthMask, setStealthMask] = useState(false)
  const [question, setQuestion] = useState('')
  const [stackContext, setStackContext] = useState('TypeScript / Distributed Systems')
  const [includeVisionContext, setIncludeVisionContext] = useState(false)

  const [visionStatus, setVisionStatus] = useState<VisionStatusResponse | null>(null)
  const [loadingVision, setLoadingVision] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [sessions, setSessions] = useState<InterviewSessionItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [copiedId, setCopiedId] = useState<string>('')

  const activeSession =
    sessions.find((item) => item.id === activeSessionId) || sessions[0] || null

  const refreshVisionStatus = useCallback(async () => {
    setLoadingVision(true)
    try {
      const res = await ipcJson<VisionStatusResponse>('/api/vision/status')
      if (res.success !== false) {
        setVisionStatus(res)
      }
    } catch {
      // Vision telemetry stays gracefully offline if daemon unreachable
    } finally {
      setLoadingVision(false)
    }
  }, [])

  useEffect(() => {
    void refreshVisionStatus()
  }, [refreshVisionStatus])

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanQuestion = question.trim()
    if (!cleanQuestion) {
      pushToast('Enter a coding, architecture, or behavioral prompt first', 'warning')
      return
    }

    setGenerating(true)
    setCopiedId('')
    try {
      const visionSnippet =
        includeVisionContext && visionStatus?.last_analysis
          ? visionStatus.last_analysis
          : null
      const structuredPrompt = buildStructuredPrompt(
        mode,
        cleanQuestion,
        stackContext,
        visionSnippet,
      )

      const res = await ipcJson<AiChatApiResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: structuredPrompt,
          messages: [{ role: 'user', content: structuredPrompt }],
          max_tokens: 1600,
        }),
      })

      const parsed = extractAiChatReply(res)
      if (res.success === false || !parsed.text) {
        pushToast(
          parsed.error || 'AI router returned an empty response — verify provider/local LLM',
          'error',
        )
        return
      }

      const entry: InterviewSessionItem = {
        id: `ans-${Date.now().toString(36)}`,
        mode,
        question: cleanQuestion,
        answer: parsed.text,
        provider: parsed.provider,
        model: parsed.model,
        createdAt: new Date().toLocaleTimeString(),
      }

      setSessions((prev) => [entry, ...prev].slice(0, 12))
      setActiveSessionId(entry.id)
      pushToast(`Structured ${mode} answer generated`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Copilot chat request failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const copyText = async (text: string, marker: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(marker)
      pushToast('Copied to clipboard', 'success')
    } catch {
      pushToast('Clipboard unavailable', 'warning')
    }
  }

  const modeInfo = MODE_META[mode]

  return (
    <div
      className={`flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter ${
        stealthMask ? 'opacity-90' : ''
      }`}
    >
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              {stealthMask ? 'Workspace Notes' : 'Stealth Interview & Architecture Copilot'}
            </h1>
            <p className="text-xs text-slate-400">
              {stealthMask ? `Mode: ${mode}` : modeInfo.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(['Coding', 'System Design', 'Behavioral'] as const).map((itemMode) => {
              const Icon = MODE_META[itemMode].icon
              const active = mode === itemMode
              return (
                <button
                  key={itemMode}
                  type="button"
                  onClick={() => setMode(itemMode)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'spatial-pill-active text-emerald-200'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{itemMode}</span>
                </button>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={refreshVisionStatus}
            disabled={loadingVision}
            className="spatial-pill flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-200"
            title="Refresh live vision stream telemetry"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                visionStatus?.active ? 'bg-emerald-400 animate-mint-breathe' : 'bg-slate-500'
              }`}
            />
            <span>
              Vision: {visionStatus?.active ? `Active (${visionStatus.source || 'screen'})` : 'Standby'}
            </span>
            <RefreshCw className={`h-3 w-3 text-slate-400 ${loadingVision ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setStealthMask((prev) => !prev)}
            className={`spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium ${
              stealthMask ? 'spatial-pill-active text-emerald-200' : 'text-slate-300'
            }`}
            title="Toggle discreet stealth surface labels"
          >
            {stealthMask ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{stealthMask ? 'Stealth On' : 'Stealth'}</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Prompt & Vision Context Dock */}
        <form
          onSubmit={handleGenerate}
          className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 lg:col-span-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Prompt &amp; Constraints</h2>
            <span className="font-mono text-[11px] text-slate-400">
              {workspaceMode} ROUTE
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">
              Question or Architecture Scenario
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={6}
              placeholder={`Paste a ${mode.toLowerCase()} prompt to generate a structured answer via live AI...`}
              className="min-h-[150px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Prompt Starters
            </p>
            <div className="flex flex-col gap-1.5">
              {modeInfo.starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => setQuestion(starter)}
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-left text-xs text-slate-300 transition hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-emerald-100"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Target Stack / Role</label>
            <input
              type="text"
              value={stackContext}
              onChange={(e) => setStackContext(e.target.value)}
              placeholder="e.g. Python / TypeScript / Principal Systems"
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 text-xs text-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-200">Vision Stream Telemetry</span>
              <span className="font-mono text-[11px] text-slate-400">
                {visionStatus?.frames_processed ?? 0} frames
              </span>
            </div>
            {visionStatus?.last_analysis ? (
              <label className="flex cursor-pointer items-start gap-2.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={includeVisionContext}
                  onChange={(e) => setIncludeVisionContext(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-emerald-400"
                />
                <span className="line-clamp-2 text-[11px] text-slate-400">
                  Include last vision analysis: {visionStatus.last_analysis}
                </span>
              </label>
            ) : (
              <p className="text-[11px] text-slate-500">
                {visionStatus?.active
                  ? `Streaming ${visionStatus.source || 'screen'} — awaiting next frame analysis.`
                  : 'Vision stream is currently on standby.'}
              </p>
            )}
          </div>

          <div className="mt-auto flex items-center gap-3">
            <button
              type="submit"
              disabled={generating}
              className="spatial-pill-active flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>{generating ? 'Synthesizing Live Answer…' : 'Generate Structured Answer'}</span>
            </button>
            <button
              type="button"
              onClick={() => setQuestion('')}
              className="spatial-pill rounded-xl p-3 text-slate-400 hover:text-slate-100"
              title="Clear prompt"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </form>

        {/* Right: Structured Copilot Output + Session History */}
        <section className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-6 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-semibold text-slate-100">
                {activeSession ? `${activeSession.mode} Brief` : 'Structured Copilot Output'}
              </h2>
              {activeSession && (activeSession.provider || activeSession.model) && (
                <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                  {[activeSession.provider, activeSession.model].filter(Boolean).join(' • ')}
                </span>
              )}
            </div>

            {activeSession && (
              <button
                type="button"
                onClick={() => copyText(activeSession.answer, activeSession.id)}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200"
              >
                {copiedId === activeSession.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedId === activeSession.id ? 'Copied' : 'Copy Full Brief'}</span>
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeSession ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Prompt • {activeSession.createdAt}
                  </p>
                  <p className="mt-1 text-sm text-slate-100">{activeSession.question}</p>
                </div>

                <StructuredAnswerRenderer
                  content={activeSession.answer}
                  onCopyCode={(code) => void copyText(code, `code-${activeSession.id}`)}
                />
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center">
                <Sparkles className="mb-3 h-7 w-7 text-emerald-400/70" />
                <p className="text-sm font-medium text-slate-200">
                  Ready for live AI interview synthesis
                </p>
                <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
                  Select Coding, System Design, or Behavioral, enter your scenario on the left,
                  and dispatch directly to <code className="text-slate-200">/api/ai/chat</code>.
                </p>
              </div>
            )}
          </div>

          {sessions.length > 1 && (
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <History className="h-3.5 w-3.5" />
                <span>Session Briefs ({sessions.length})</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sessions.map((item) => {
                  const selected = item.id === activeSession?.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSessionId(item.id)}
                      className={`max-w-[210px] shrink-0 rounded-xl border px-3 py-1.5 text-left text-xs transition ${
                        selected
                          ? 'spatial-pill-active text-emerald-200'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="block truncate font-medium">{item.question}</span>
                      <span className="text-[10px] opacity-75">
                        {item.mode} • {item.createdAt}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default InterviewView
