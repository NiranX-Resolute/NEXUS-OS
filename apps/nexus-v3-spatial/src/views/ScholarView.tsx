import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { MemoryNode } from '@/types'

type ScholarTab = 'memory' | 'scholar' | 'notes'

interface ScholarPaper {
  id: string
  title: string
  authors: string[]
  year: number | string
  abstract: string
  venue: string
  link: string
  citations?: number
  isLocal?: boolean
}

interface SovereignNote {
  id: string
  title: string
  namespace: string
  content: string
  updatedAt: string
  memoryId?: string
}

interface MemorySearchApiResponse {
  success?: boolean
  results?: MemoryNode[]
  memories?: MemoryNode[]
  error?: string
}

interface MemoryCreateApiResponse {
  success?: boolean
  id?: string
  error?: string
}

interface MemorySyncApiResponse {
  success?: boolean
  synced_nodes?: number
  target?: string
  timestamp?: number
  error?: string
}

interface ScholarSearchApiResponse {
  success?: boolean
  papers?: Array<Record<string, unknown>>
  results?: Array<Record<string, unknown>>
  error?: string
}

interface ScholarSynthesizeApiResponse {
  success?: boolean
  synthesis?: string
  provider?: string
  model?: string
  latency_ms?: number
  error?: string
}

const NOTES_STORAGE_KEY = 'nexus_v3_sovereign_notes'
const MEMORY_NAMESPACES = ['DEV', 'STUDY', 'scholar_context', 'architecture', 'SOVEREIGN']
const QUICK_SCHOLAR_TOPICS = [
  'Agentic AI Systems',
  'State Space Models',
  'Local RAG & FTS5',
  'Autonomous Multi-Agent Swarms',
]

function loadLocalNotes(): SovereignNote[] {
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is SovereignNote =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.content === 'string',
    )
  } catch {
    return []
  }
}

function saveLocalNotes(notes: SovereignNote[]): void {
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function normalizePaper(raw: Record<string, unknown>, idx: number): ScholarPaper {
  const rawAuthors = raw.authors
  const authors = Array.isArray(rawAuthors)
    ? rawAuthors.map((a) => String(a)).filter(Boolean)
    : typeof rawAuthors === 'string' && rawAuthors.trim()
      ? [rawAuthors.trim()]
      : ['Nexus Scholar']

  const rawId = String(raw.id || `paper-${idx}`)
  const explicitLink = typeof raw.link === 'string' ? raw.link.trim() : ''
  const link = explicitLink || (rawId.startsWith('http') ? rawId : '')

  return {
    id: rawId,
    title: String(raw.title || 'Untitled Research Entry'),
    authors,
    year: typeof raw.year === 'number' || typeof raw.year === 'string' ? raw.year : '',
    abstract: String(raw.abstract || raw.summary || ''),
    venue: String(raw.venue || raw.category || 'arXiv'),
    link,
    citations: typeof raw.citations === 'number' ? raw.citations : undefined,
    isLocal: Boolean(raw.is_local),
  }
}

function formatUpdatedTime(val: string | number | undefined): string {
  if (val === undefined || val === null || val === '') return 'Recent'
  if (typeof val === 'number') {
    const ms = val > 1e12 ? val : val * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleString()
  }
  const d = new Date(val)
  return Number.isNaN(d.getTime()) ? val : d.toLocaleString()
}

function StructuredBrief({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-200">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={index} className="h-1.5" />
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={index} className="pt-2 text-sm font-semibold text-emerald-300">
              {trimmed.slice(4)}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={index} className="pt-3 text-base font-semibold text-slate-100">
              {trimmed.slice(3)}
            </h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={index} className="pt-1 text-lg font-semibold text-emerald-200">
              {trimmed.slice(2)}
            </h2>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={index} className="flex items-start gap-2.5 pl-1 text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
              <span>{trimmed.slice(2)}</span>
            </div>
          )
        }
        return (
          <p key={index} className="text-slate-300">
            {trimmed}
          </p>
        )
      })}
    </div>
  )
}

export function ScholarView() {
  const pushToast = useNexusStore((s) => s.pushToast)
  const workspaceMode = useNexusStore((s) => s.telemetry.workspaceMode)
  const airGapped = useNexusStore((s) => s.telemetry.airGapped)

  const [activeTab, setActiveTab] = useState<ScholarTab>('memory')

  // Semantic FTS5 Memory state
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memories, setMemories] = useState<MemoryNode[]>([])
  const [loadingMemories, setLoadingMemories] = useState(false)
  const [syncingMemory, setSyncingMemory] = useState(false)
  const [lastSyncInfo, setLastSyncInfo] = useState<string>('')
  const [newMemTitle, setNewMemTitle] = useState('')
  const [newMemNamespace, setNewMemNamespace] = useState('DEV')
  const [newMemContent, setNewMemContent] = useState('')
  const [savingMemory, setSavingMemory] = useState(false)

  // Scholar search & synthesis state
  const [scholarQuery, setScholarQuery] = useState('autonomous multi-agent systems')
  const [papers, setPapers] = useState<ScholarPaper[]>([])
  const [loadingPapers, setLoadingPapers] = useState(false)
  const [synthTopic, setSynthTopic] = useState('')
  const [synthNotes, setSynthNotes] = useState('')
  const [synthResult, setSynthResult] = useState('')
  const [synthMeta, setSynthMeta] = useState<{ provider?: string; model?: string; latencyMs?: number } | null>(null)
  const [synthesizing, setSynthesizing] = useState(false)
  const [copiedSynthesis, setCopiedSynthesis] = useState(false)

  // Sovereign Notes state
  const [notes, setNotes] = useState<SovereignNote[]>(() => loadLocalNotes())
  const [activeNoteId, setActiveNoteId] = useState<string>(() => loadLocalNotes()[0]?.id || '')
  const [committingNote, setCommittingNote] = useState(false)

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) || null,
    [notes, activeNoteId],
  )

  const fetchMemories = useCallback(
    async (queryText: string) => {
      setLoadingMemories(true)
      try {
        const trimmed = queryText.trim()
        const endpoint = trimmed
          ? `/api/memory/search?q=${encodeURIComponent(trimmed)}&limit=24`
          : '/api/memory?limit=24'
        const res = await ipcJson<MemorySearchApiResponse>(endpoint)
        if (res.success === false) {
          pushToast(res.error || 'Failed querying FTS5 memory store', 'error')
          return
        }
        const items = Array.isArray(res.results)
          ? res.results
          : Array.isArray(res.memories)
            ? res.memories
            : []
        setMemories(items)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Memory query error', 'error')
      } finally {
        setLoadingMemories(false)
      }
    },
    [pushToast],
  )

  useEffect(() => {
    void fetchMemories('')
  }, [fetchMemories])

  const handleStoreMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = newMemTitle.trim()
    const content = newMemContent.trim()
    if (!title || !content) {
      pushToast('Title and content are required to store memory', 'warning')
      return
    }
    setSavingMemory(true)
    try {
      const res = await ipcJson<MemoryCreateApiResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: newMemNamespace,
          metadata: { source: 'nexus-v3-spatial' },
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed saving memory node', 'error')
        return
      }
      setNewMemTitle('')
      setNewMemContent('')
      pushToast('Committed node to FTS5 memory store', 'success')
      await fetchMemories(memoryQuery)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed saving memory', 'error')
    } finally {
      setSavingMemory(false)
    }
  }

  const handleDeleteMemory = async (nodeId: string) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/memory/${encodeURIComponent(nodeId)}`,
        { method: 'DELETE' },
      )
      if (res.success === false) {
        pushToast(res.error || 'Could not remove memory node', 'error')
        return
      }
      setMemories((prev) => prev.filter((item) => item.id !== nodeId))
      pushToast('Memory node removed', 'info')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory deletion failed', 'error')
    }
  }

  const handleSyncMemory = async () => {
    setSyncingMemory(true)
    try {
      const res = await ipcJson<MemorySyncApiResponse>('/api/memory/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (res.success === false) {
        pushToast(res.error || 'Memory WAL sync blocked', 'warning')
        return
      }
      const count = typeof res.synced_nodes === 'number' ? res.synced_nodes : memories.length
      setLastSyncInfo(`${count} nodes checkpointed`)
      pushToast(`WAL synced (${count} memory nodes)`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory sync request failed', 'error')
    } finally {
      setSyncingMemory(false)
    }
  }

  const handleSearchScholar = useCallback(
    async (queryOverride?: string) => {
      const q = (queryOverride ?? scholarQuery).trim()
      if (!q) {
        pushToast('Enter a research topic to search', 'warning')
        return
      }
      if (queryOverride !== undefined) {
        setScholarQuery(queryOverride)
      }
      setLoadingPapers(true)
      try {
        const res = await ipcJson<ScholarSearchApiResponse>(
          `/api/scholar/search?query=${encodeURIComponent(q)}&q=${encodeURIComponent(q)}&limit=10`,
        )
        if (res.success === false) {
          pushToast(res.error || 'Scholar search failed', 'error')
          return
        }
        const rawList = Array.isArray(res.papers)
          ? res.papers
          : Array.isArray(res.results)
            ? res.results
            : []
        setPapers(rawList.map(normalizePaper))
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Scholar search error', 'error')
      } finally {
        setLoadingPapers(false)
      }
    },
    [pushToast, scholarQuery],
  )

  const handleSynthesize = useCallback(
    async (topicOverride?: string, notesOverride?: string) => {
      const topic = (topicOverride ?? synthTopic).trim()
      const notesBody = (notesOverride ?? synthNotes).trim()
      if (!topic) {
        pushToast('Provide a synthesis topic first', 'warning')
        return
      }
      if (topicOverride !== undefined) setSynthTopic(topicOverride)
      if (notesOverride !== undefined) setSynthNotes(notesOverride)

      setSynthesizing(true)
      setCopiedSynthesis(false)
      try {
        const res = await ipcJson<ScholarSynthesizeApiResponse>('/api/scholar/synthesize', {
          method: 'POST',
          body: JSON.stringify({ topic, notes: notesBody }),
        })
        if (res.success === false) {
          pushToast(res.error || 'Synthesis request failed', 'error')
          return
        }
        setSynthResult(res.synthesis || '')
        setSynthMeta({
          provider: res.provider,
          model: res.model,
          latencyMs: res.latency_ms,
        })
        pushToast('Research brief synthesized', 'success')
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Synthesis request error', 'error')
      } finally {
        setSynthesizing(false)
      }
    },
    [pushToast, synthNotes, synthTopic],
  )

  const handleSavePaperToMemory = async (paper: ScholarPaper) => {
    try {
      const res = await ipcJson<MemoryCreateApiResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: paper.title,
          content: `${paper.authors.join(', ')} (${paper.year || 'n/d'}) — ${paper.abstract}`,
          namespace: 'scholar_context',
          metadata: { venue: paper.venue, link: paper.link },
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed saving paper to memory', 'error')
        return
      }
      pushToast('Paper saved to scholar_context memory', 'success')
      await fetchMemories(memoryQuery)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error saving paper', 'error')
    }
  }

  const handleCopySynthesis = async () => {
    if (!synthResult) return
    try {
      await navigator.clipboard.writeText(synthResult)
      setCopiedSynthesis(true)
      pushToast('Synthesis copied to clipboard', 'success')
    } catch {
      pushToast('Clipboard permission unavailable', 'warning')
    }
  }

  const createNote = () => {
    const newNote: SovereignNote = {
      id: `note-${Date.now().toString(36)}`,
      title: 'Untitled Sovereign Note',
      namespace: 'STUDY',
      content: '',
      updatedAt: new Date().toISOString(),
    }
    const next = [newNote, ...notes]
    setNotes(next)
    setActiveNoteId(newNote.id)
    saveLocalNotes(next)
  }

  const updateActiveNote = (patch: Partial<SovereignNote>) => {
    if (!activeNote) return
    const next = notes.map((note) =>
      note.id === activeNote.id
        ? { ...note, ...patch, updatedAt: new Date().toISOString() }
        : note,
    )
    setNotes(next)
    saveLocalNotes(next)
  }

  const deleteNote = (noteId: string) => {
    const next = notes.filter((note) => note.id !== noteId)
    setNotes(next)
    saveLocalNotes(next)
    if (activeNoteId === noteId) {
      setActiveNoteId(next[0]?.id || '')
    }
  }

  const commitNoteToMemory = async () => {
    if (!activeNote) return
    const title = activeNote.title.trim()
    const content = activeNote.content.trim()
    if (!title || !content) {
      pushToast('Note needs both a title and body before committing to memory', 'warning')
      return
    }
    setCommittingNote(true)
    try {
      const res = await ipcJson<MemoryCreateApiResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: activeNote.namespace || 'STUDY',
          metadata: { source: 'sovereign_note', note_id: activeNote.id },
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Failed storing note in FTS5 memory', 'error')
        return
      }
      updateActiveNote({ memoryId: res.id || 'committed' })
      pushToast('Sovereign note saved locally & indexed in FTS5', 'success')
      await fetchMemories(memoryQuery)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory commit error', 'error')
    } finally {
      setCommittingNote(false)
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter">
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              Scholar &amp; Sovereign Memory
            </h1>
            <p className="text-xs text-slate-400">
              FTS5 semantic vault, arXiv synthesis &amp; local-first notes
              {lastSyncInfo ? ` • ${lastSyncInfo}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { id: 'memory', label: 'FTS5 Memory', icon: Database },
                { id: 'scholar', label: 'Scholar & Synthesis', icon: Sparkles },
                { id: 'notes', label: 'Sovereign Notes', icon: FileText },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? 'spatial-pill-active text-emerald-200'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={handleSyncMemory}
            disabled={syncingMemory}
            title={
              airGapped || workspaceMode === 'SILENT'
                ? 'Blocked in SILENT Air-Gap mode'
                : 'Checkpoint SQLite WAL memory nodes'
            }
            className="spatial-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-300 ${syncingMemory ? 'animate-spin' : ''}`} />
            <span>{syncingMemory ? 'Syncing…' : 'Sync WAL'}</span>
          </button>
        </div>
      </header>

      {/* TAB 1: SEMANTIC FTS5 MEMORY */}
      {activeTab === 'memory' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleStoreMemory}
            className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 lg:col-span-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Store Memory Node</h2>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                SQLite FTS5
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Title</label>
              <input
                type="text"
                value={newMemTitle}
                onChange={(e) => setNewMemTitle(e.target.value)}
                placeholder="e.g. IPC Bearer Auth Invariant"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Namespace</label>
              <select
                value={newMemNamespace}
                onChange={(e) => setNewMemNamespace(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0d141d] px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-emerald-400/50"
              >
                {MEMORY_NAMESPACES.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-1 flex-col space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Knowledge Content</label>
              <textarea
                value={newMemContent}
                onChange={(e) => setNewMemContent(e.target.value)}
                rows={7}
                placeholder="Write architectural context, findings, or facts to index..."
                className="min-h-[160px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
              />
            </div>

            <button
              type="submit"
              disabled={savingMemory}
              className="spatial-pill-active flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>{savingMemory ? 'Indexing…' : 'Commit to Memory'}</span>
            </button>
          </form>

          <section className="spatial-panel flex min-h-0 flex-col gap-5 rounded-3xl p-6 lg:col-span-8">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void fetchMemories(memoryQuery)
              }}
              className="flex items-center gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Query FTS5 semantic memory (leave empty to browse recent nodes)..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
                />
              </div>
              <button
                type="submit"
                disabled={loadingMemories}
                className="spatial-pill rounded-xl px-4 py-2.5 text-sm font-medium text-slate-100"
              >
                {loadingMemories ? 'Searching…' : 'Search'}
              </button>
            </form>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {memoryQuery.trim()
                  ? `FTS5 BM25 matches for "${memoryQuery.trim()}"`
                  : 'Recent Sovereign Memory Nodes'}
              </span>
              <span className="font-mono text-slate-300">{memories.length} nodes</span>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {memories.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center">
                  <Layers className="mb-2.5 h-6 w-6 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">
                    {loadingMemories ? 'Querying FTS5 index…' : 'No matching memory nodes'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Add a memory node on the left or try another search term.
                  </p>
                </div>
              ) : (
                memories.map((node) => (
                  <article
                    key={node.id}
                    className="spatial-panel-interactive group rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-100">
                            {node.title}
                          </h3>
                          <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                            {node.namespace || 'DEV'}
                          </span>
                          {typeof node.score === 'number' && (
                            <span className="font-mono text-[11px] text-slate-400">
                              score {Math.abs(node.score).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                          {node.content}
                        </p>
                        <p className="mt-2.5 font-mono text-[11px] text-slate-500">
                          {node.id} • {formatUpdatedTime(node.updated_at)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(node.id)}
                        title="Delete memory node"
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: SCHOLAR ARXIV SEARCH & KNOWLEDGE SYNTHESIS */}
      {activeTab === 'scholar' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="spatial-panel flex min-h-0 flex-col gap-5 rounded-3xl p-6 lg:col-span-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Scholar &amp; arXiv Search</h2>
              <span className="text-xs text-slate-400">{papers.length} papers</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSearchScholar()
              }}
              className="flex items-center gap-3"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={scholarQuery}
                  onChange={(e) => setScholarQuery(e.target.value)}
                  placeholder="Search arXiv & local scholar context..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
                />
              </div>
              <button
                type="submit"
                disabled={loadingPapers}
                className="spatial-pill-active rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                {loadingPapers ? 'Searching…' : 'Search'}
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {QUICK_SCHOLAR_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleSearchScholar(topic)}
                  className="spatial-pill rounded-full px-3 py-1 text-xs text-slate-300"
                >
                  {topic}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {papers.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center">
                  <BookOpen className="mb-2.5 h-6 w-6 text-slate-500" />
                  <p className="text-sm font-medium text-slate-300">
                    {loadingPapers ? 'Querying arXiv & FTS5 scholar_context…' : 'Search literature'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Run a search above to inspect abstracts, save papers, or synthesize insights.
                  </p>
                </div>
              ) : (
                papers.map((paper) => (
                  <article
                    key={paper.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold leading-snug text-slate-100">
                        {paper.title}
                      </h3>
                      {paper.link && (
                        <a
                          href={paper.link}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-emerald-300"
                          title="Open source link"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {paper.authors.slice(0, 3).join(', ')}
                      {paper.authors.length > 3 ? ' et al.' : ''}
                      {paper.year ? ` • ${paper.year}` : ''}
                      {paper.venue ? ` • ${paper.venue}` : ''}
                    </p>

                    {paper.abstract && (
                      <p className="mt-2.5 line-clamp-4 text-xs leading-relaxed text-slate-300">
                        {paper.abstract}
                      </p>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSynthesize(paper.title, paper.abstract)}
                        className="spatial-pill flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-300"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Synthesize</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePaperToMemory(paper)}
                        className="spatial-pill flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                      >
                        <Database className="h-3 w-3" />
                        <span>Save Node</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-6 lg:col-span-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Knowledge Synthesis</h2>
                <p className="text-xs text-slate-400">
                  Distill executive summary, trade-offs &amp; next verification steps
                </p>
              </div>
              {synthResult && (
                <button
                  type="button"
                  onClick={handleCopySynthesis}
                  className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                >
                  {copiedSynthesis ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedSynthesis ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={synthTopic}
                onChange={(e) => setSynthTopic(e.target.value)}
                placeholder="Synthesis topic (or click Synthesize on any paper)..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
              />
              <textarea
                value={synthNotes}
                onChange={(e) => setSynthNotes(e.target.value)}
                rows={4}
                placeholder="Optional reference notes or abstract excerpt..."
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void handleSynthesize()}
                  disabled={synthesizing}
                  className="spatial-pill-active flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{synthesizing ? 'Synthesizing…' : 'Synthesize Brief'}</span>
                </button>

                {synthMeta && (synthMeta.provider || synthMeta.model) && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {[synthMeta.provider, synthMeta.model, synthMeta.latencyMs ? `${synthMeta.latencyMs}ms` : '']
                      .filter(Boolean)
                      .join(' • ')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              {synthResult ? (
                <StructuredBrief content={synthResult} />
              ) : (
                <div className="flex h-full min-h-[160px] flex-col items-center justify-center text-center">
                  <Sparkles className="mb-2 h-5 w-5 text-slate-500" />
                  <p className="text-sm text-slate-400">
                    Structured synthesis brief will appear here.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: SOVEREIGN NOTES */}
      {activeTab === 'notes' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-5 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Sovereign Notes</h2>
              <button
                type="button"
                onClick={createNote}
                className="spatial-pill-active flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Note</span>
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
              {notes.length === 0 ? (
                <div className="flex h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-5 text-center">
                  <FileText className="mb-2 h-5 w-5 text-slate-500" />
                  <p className="text-xs text-slate-400">
                    Create a note to persist locally and index into FTS5 memory.
                  </p>
                </div>
              ) : (
                notes.map((note) => {
                  const selected = note.id === activeNote?.id
                  return (
                    <div
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      className={`group cursor-pointer rounded-2xl border p-3.5 transition ${
                        selected
                          ? 'border-emerald-400/35 bg-emerald-400/10'
                          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {note.title || 'Untitled Note'}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="font-mono text-emerald-300/90">{note.namespace}</span>
                            {note.memoryId && <span>• Indexed</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteNote(note.id)
                          }}
                          className="rounded-lg p-1 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
                          title="Delete local note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </aside>

          <section className="spatial-panel flex min-h-0 flex-col gap-4 rounded-3xl p-6 lg:col-span-8">
            {activeNote ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="text"
                    value={activeNote.title}
                    onChange={(e) => updateActiveNote({ title: e.target.value })}
                    placeholder="Note title..."
                    className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-base font-semibold text-slate-100 outline-none focus:border-emerald-400/50"
                  />

                  <div className="flex items-center gap-2.5">
                    <select
                      value={activeNote.namespace}
                      onChange={(e) => updateActiveNote({ namespace: e.target.value })}
                      className="rounded-xl border border-white/10 bg-[#0d141d] px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400/50"
                    >
                      {MEMORY_NAMESPACES.map((ns) => (
                        <option key={ns} value={ns}>
                          {ns}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={commitNoteToMemory}
                      disabled={committingNote}
                      className="spatial-pill-active flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium disabled:opacity-50"
                    >
                      <Database className="h-3.5 w-3.5" />
                      <span>{committingNote ? 'Indexing…' : 'Save to FTS5'}</span>
                    </button>
                  </div>
                </div>

                <textarea
                  value={activeNote.content}
                  onChange={(e) => updateActiveNote({ content: e.target.value })}
                  placeholder="Write sovereign research notes, design sketches, or citations..."
                  className="min-h-[300px] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-4 font-mono text-sm leading-relaxed text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    Persisted in localStorage • Updated {formatUpdatedTime(activeNote.updatedAt)}
                  </span>
                  {activeNote.memoryId && (
                    <span className="font-mono text-emerald-300">
                      FTS5 ID: {activeNote.memoryId}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center">
                <FileText className="mb-3 h-7 w-7 text-slate-500" />
                <p className="text-sm font-medium text-slate-200">No note selected</p>
                <p className="mt-1 text-xs text-slate-400">
                  Create a Sovereign Note to draft locally and commit directly into FTS5 memory.
                </p>
                <button
                  type="button"
                  onClick={createNote}
                  className="spatial-pill-active mt-4 flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create First Note</span>
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default ScholarView
