import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CloudUpload,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { MemoryNode } from '../types';

type ScholarTab = 'memory' | 'arxiv' | 'synthesis' | 'notes';

interface ScholarPaper {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  abstract?: string;
  summary?: string;
  venue?: string;
  category?: string;
  link?: string;
  citations?: number;
  is_local?: boolean;
}

interface SynthesisOutput {
  topic: string;
  synthesis: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  generatedAt: string;
}

interface SovereignNote {
  id: string;
  title: string;
  namespace: string;
  content: string;
  updatedAt: string;
  syncedNodeId?: string;
  syncedAt?: string;
}

const NOTES_STORAGE_KEY = 'nexus_v4_sovereign_notes';
const DEFAULT_NAMESPACES = ['DEV', 'STUDY', 'scholar_context', 'notes'];
const ARXIV_TOPICS = ['Agentic Memory', 'Speculative Decoding', 'SQLite Vector Search'];

function loadStoredNotes(): SovereignNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage?.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SovereignNote[]) : [];
  } catch {
    return [];
  }
}

function formatTimestamp(raw?: number | string | null): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const num = typeof raw === 'number' ? raw : Number(raw);
  const date = Number.isFinite(num) && num > 0
    ? new Date(num > 1e12 ? num : num * 1000)
    : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderMonographProse(markdown: string) {
  const lines = markdown.split('\n');
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-zinc-200">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`sp-${index}`} className="h-1.5" />;
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4
              key={`h3-${index}`}
              className="pt-2 text-xs font-semibold uppercase tracking-wider text-amber-300"
            >
              {trimmed.slice(4)}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3
              key={`h2-${index}`}
              className="border-b border-white/[0.06] pb-1 pt-3 text-sm font-medium text-emerald-300"
            >
              {trimmed.slice(3)}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2
              key={`h1-${index}`}
              className="text-base font-semibold tracking-tight text-zinc-100"
            >
              {trimmed.slice(2)}
            </h2>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={`li-${index}`} className="flex items-start gap-2.5 pl-1">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
              <span className="text-zinc-300">{trimmed.slice(2)}</span>
            </div>
          );
        }
        return (
          <p key={`p-${index}`} className="text-zinc-300">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

export function ScholarView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<ScholarTab>('memory');

  // Semantic FTS5 Memory state
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('ALL');
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [syncingMemory, setSyncingMemory] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<string | null>(null);

  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemNs, setNewMemNs] = useState('DEV');
  const [newMemContent, setNewMemContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  // ArXiv Literature Search state
  const [arxivQuery, setArxivQuery] = useState('');
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [arxivLoading, setArxivLoading] = useState(false);
  const [lastArxivQuery, setLastArxivQuery] = useState('');
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);

  // Knowledge Synthesis state
  const [synthTopic, setSynthTopic] = useState('');
  const [synthNotes, setSynthNotes] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisOutput, setSynthesisOutput] = useState<SynthesisOutput | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [committingSynth, setCommittingSynth] = useState(false);

  // Sovereign Notes state (localStorage + POST /api/memory)
  const [notes, setNotes] = useState<SovereignNote[]>(() => loadStoredNotes());
  const [selectedNoteId, setSelectedNoteId] = useState<string>(() => loadStoredNotes()[0]?.id || '');
  const [noteFilter, setNoteFilter] = useState('');
  const [committingNoteId, setCommittingNoteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage?.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Ignore storage quota restrictions
    }
  }, [notes]);

  const loadMemories = useCallback(
    async (queryOverride?: string) => {
      const term = (queryOverride !== undefined ? queryOverride : activeSearchTerm).trim();
      setMemoryLoading(true);
      try {
        if (term) {
          const res = await ipcJson<{ results?: MemoryNode[] }>(
            `/api/memory/search?q=${encodeURIComponent(term)}&limit=30`
          );
          if (res.success === false) {
            pushToast(res.error || 'Memory FTS5 search failed', 'error');
            return;
          }
          setMemories(Array.isArray(res.results) ? res.results : []);
        } else {
          const res = await ipcJson<{ memories?: MemoryNode[] }>('/api/memory?limit=60');
          if (res.success === false) {
            pushToast(res.error || 'Failed to load memories', 'error');
            return;
          }
          setMemories(Array.isArray(res.memories) ? res.memories : []);
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Memory store unavailable', 'error');
      } finally {
        setMemoryLoading(false);
      }
    },
    [activeSearchTerm, pushToast]
  );

  useEffect(() => {
    void loadMemories('');
  }, [loadMemories]);

  const availableNamespaces = useMemo(() => {
    const set = new Set<string>(DEFAULT_NAMESPACES);
    for (const m of memories) {
      if (m.namespace) set.add(m.namespace);
    }
    return Array.from(set);
  }, [memories]);

  const filteredMemories = useMemo(() => {
    if (namespaceFilter === 'ALL') return memories;
    return memories.filter(
      (m) => m.namespace?.toLowerCase() === namespaceFilter.toLowerCase()
    );
  }, [memories, namespaceFilter]);

  const handleSearchMemories = async (e: FormEvent) => {
    e.preventDefault();
    const clean = memoryQuery.trim();
    setActiveSearchTerm(clean);
    await loadMemories(clean);
  };

  const handleClearMemorySearch = async () => {
    setMemoryQuery('');
    setActiveSearchTerm('');
    await loadMemories('');
  };

  const handleCreateMemory = async (e: FormEvent) => {
    e.preventDefault();
    const title = newMemTitle.trim();
    const content = newMemContent.trim();
    const namespace = newMemNs.trim() || 'DEV';

    if (!title || !content) {
      pushToast('Memory title and content are required', 'warn');
      return;
    }

    setSavingMemory(true);
    try {
      const res = await ipcJson<{ id?: string }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({ title, content, namespace }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to save memory node', 'error');
        return;
      }
      setNewMemTitle('');
      setNewMemContent('');
      pushToast(`Stored memory node ${res.id || title}`, 'success');
      await loadMemories();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory store request failed', 'error');
    } finally {
      setSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!id || deletingMemoryId) return;
    setDeletingMemoryId(id);
    try {
      const res = await ipcJson<{ id?: string }>(`/api/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to delete memory node', 'error');
        return;
      }
      setMemories((prev) => prev.filter((item) => item.id !== id));
      pushToast('Memory node removed', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete request failed', 'error');
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const handleSyncMemory = async () => {
    if (syncingMemory) return;
    setSyncingMemory(true);
    try {
      const res = await ipcJson<{ synced_nodes?: number; target?: string }>('/api/memory/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast(res.error || 'WAL sync blocked or failed', 'warn');
        return;
      }
      const count = typeof res.synced_nodes === 'number' ? res.synced_nodes : memories.length;
      setLastSyncInfo(`${count} nodes checkpointed`);
      pushToast(`SQLite WAL synchronized (${count} nodes)`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Sync request failed', 'error');
    } finally {
      setSyncingMemory(false);
    }
  };

  const runArxivSearch = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) {
      pushToast('Enter a topic to query arXiv and scholar memory', 'warn');
      return;
    }
    setArxivQuery(clean);
    setArxivLoading(true);
    setLastArxivQuery(clean);
    try {
      const res = await ipcJson<{ papers?: ScholarPaper[]; results?: ScholarPaper[] }>(
        `/api/scholar/search?query=${encodeURIComponent(clean)}&limit=12`
      );
      if (res.success === false) {
        pushToast(res.error || 'Scholar search failed', 'error');
        return;
      }
      const list = Array.isArray(res.papers)
        ? res.papers
        : Array.isArray(res.results)
        ? res.results
        : [];
      setPapers(list);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Scholar search unavailable', 'error');
    } finally {
      setArxivLoading(false);
    }
  };

  const handleArxivSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await runArxivSearch(arxivQuery);
  };

  const handleSavePaperToMemory = async (paper: ScholarPaper) => {
    if (savingPaperId) return;
    setSavingPaperId(paper.id);
    try {
      const summary = (paper.abstract || paper.summary || '').trim();
      const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : '';
      const content = [
        authors ? `Authors: ${authors}` : '',
        paper.venue ? `Venue: ${paper.venue}${paper.year ? ` (${paper.year})` : ''}` : '',
        paper.link ? `Link: ${paper.link}` : '',
        '',
        summary,
      ]
        .filter(Boolean)
        .join('\n');

      const res = await ipcJson<{ id?: string }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: paper.title,
          namespace: 'scholar_context',
          content: content || paper.title,
          metadata: {
            source: paper.is_local ? 'local_scholar' : 'arxiv',
            paper_id: paper.id,
            year: paper.year,
          },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Could not save paper to memory', 'error');
        return;
      }
      pushToast('Paper saved to scholar_context memory', 'success');
      void loadMemories();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSavingPaperId(null);
    }
  };

  const handleSendPaperToSynthesis = (paper: ScholarPaper) => {
    const abstract = (paper.abstract || paper.summary || '').trim();
    const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : '';
    const snippet = [
      `Paper: ${paper.title}${paper.year ? ` (${paper.year})` : ''}`,
      authors ? `Authors: ${authors}` : '',
      abstract,
    ]
      .filter(Boolean)
      .join('\n');

    setSynthTopic((prev) => prev.trim() || paper.title);
    setSynthNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    setActiveTab('synthesis');
    pushToast('Loaded paper context into Synthesis', 'info');
  };

  const handleSynthesize = async (e: FormEvent) => {
    e.preventDefault();
    const topic = synthTopic.trim();
    if (!topic || synthesizing) {
      if (!topic) pushToast('Synthesis topic is required', 'warn');
      return;
    }

    setSynthesizing(true);
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await ipcJson<{
        synthesis?: string;
        provider?: string;
        model?: string;
        latency_ms?: number;
      }>('/api/scholar/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          notes: synthNotes.trim(),
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Knowledge synthesis failed', 'error');
        return;
      }
      const elapsed =
        typeof res.latency_ms === 'number'
          ? Math.round(res.latency_ms)
          : Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      setSynthesisOutput({
        topic,
        synthesis: res.synthesis || '',
        provider: res.provider,
        model: res.model,
        latencyMs: elapsed,
        generatedAt: new Date().toISOString(),
      });
      pushToast('Research brief synthesized', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Synthesis request failed', 'error');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleCommitSynthesis = async () => {
    if (!synthesisOutput || committingSynth) return;
    setCommittingSynth(true);
    try {
      const res = await ipcJson<{ id?: string }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: `Synthesis: ${synthesisOutput.topic}`,
          namespace: 'scholar_context',
          content: synthesisOutput.synthesis,
          metadata: {
            provider: synthesisOutput.provider,
            model: synthesisOutput.model,
          },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to commit synthesis', 'error');
        return;
      }
      pushToast('Synthesis committed to scholar_context', 'success');
      void loadMemories();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Commit failed', 'error');
    } finally {
      setCommittingSynth(false);
    }
  };

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) || null,
    [notes, selectedNoteId]
  );

  const visibleNotes = useMemo(() => {
    const q = noteFilter.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.namespace.toLowerCase().includes(q)
    );
  }, [notes, noteFilter]);

  const handleCreateNote = () => {
    const now = new Date().toISOString();
    const created: SovereignNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'Untitled Sovereign Note',
      namespace: 'notes',
      content: '',
      updatedAt: now,
    };
    setNotes((prev) => [created, ...prev]);
    setSelectedNoteId(created.id);
  };

  const handleUpdateSelectedNote = (patch: Partial<SovereignNote>) => {
    if (!selectedNote) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => (n.id === selectedNote.id ? { ...n, ...patch, updatedAt: now } : n))
    );
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      if (selectedNoteId === id) {
        setSelectedNoteId(next[0]?.id || '');
      }
      return next;
    });
    pushToast('Note deleted from local storage', 'info');
  };

  const handleCommitNoteToMemory = async (note: SovereignNote) => {
    const title = note.title.trim();
    const content = note.content.trim();
    if (!title || !content) {
      pushToast('Note title and body are required before committing to memory', 'warn');
      return;
    }
    setCommittingNoteId(note.id);
    try {
      const res = await ipcJson<{ id?: string }>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: note.namespace.trim() || 'notes',
          metadata: { source: 'sovereign_notes', note_id: note.id },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed to commit note', 'error');
        return;
      }
      const syncedAt = new Date().toISOString();
      setNotes((prev) =>
        prev.map((n) =>
          n.id === note.id
            ? { ...n, syncedNodeId: res.id || 'synced', syncedAt }
            : n
        )
      );
      pushToast(`Committed note to FTS5 memory (${res.id || 'WAL'})`, 'success');
      void loadMemories();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory commit failed', 'error');
    } finally {
      setCommittingNoteId(null);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      pushToast('Copied to clipboard', 'info');
    } catch {
      pushToast('Clipboard unavailable', 'warn');
    }
  };

  const tabs: Array<{ id: ScholarTab; label: string }> = [
    { id: 'memory', label: 'Semantic Memory' },
    { id: 'arxiv', label: 'ArXiv Search' },
    { id: 'synthesis', label: 'Synthesis' },
    { id: 'notes', label: 'Sovereign Notes' },
  ];

  return (
    <div className="flex h-full w-full flex-col bg-[#090a0c] text-zinc-100">
      {/* Single-Row Monograph Header */}
      <header className="monograph-hairline-b flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          <h1 className="text-[14px] font-medium tracking-[-0.01em] text-zinc-100">
            Scholar &amp; Memory
          </h1>
          <span className="rounded border border-white/[0.08] bg-[#0e1014] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
            FTS5 · {telemetry.workspaceMode}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <nav
            aria-label="Scholar workspace sections"
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

          {activeTab === 'memory' && (
            <button
              type="button"
              onClick={() => void handleSyncMemory()}
              disabled={syncingMemory}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0e1014] px-3 font-mono text-xs text-zinc-300 transition hover:border-emerald-500/30 hover:text-emerald-300 disabled:opacity-50"
              title="Checkpoint SQLite WAL memory graph"
            >
              {syncingMemory ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              ) : (
                <CloudUpload className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>Sync WAL</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'memory' && (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {/* Search & Namespace Filter Strip */}
            <form
              onSubmit={handleSearchMemories}
              className="monograph-surface flex flex-wrap items-center gap-3 rounded-lg p-3"
            >
              <div className="relative flex min-w-[220px] flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Query SQLite FTS5 memory graph (BM25 ranked)…"
                  className="h-8 w-full rounded-md border border-white/[0.08] bg-[#090a0c] pl-9 pr-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>

              <select
                value={namespaceFilter}
                onChange={(e) => setNamespaceFilter(e.target.value)}
                aria-label="Filter memory namespace"
                className="h-8 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-xs text-zinc-300 focus:border-emerald-500/40 focus:outline-none"
              >
                <option value="ALL">All Namespaces</option>
                {availableNamespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={memoryLoading}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {memoryLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Search
              </button>

              {activeSearchTerm && (
                <button
                  type="button"
                  onClick={() => void handleClearMemorySearch()}
                  className="h-8 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-xs text-zinc-400 transition hover:text-zinc-200"
                >
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={() => void loadMemories()}
                disabled={memoryLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#090a0c] text-zinc-400 transition hover:text-zinc-200"
                title="Reload memory nodes"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${memoryLoading ? 'animate-spin' : ''}`} />
              </button>
            </form>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Memory Results */}
              <section className="flex flex-col gap-4 lg:col-span-7">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      {activeSearchTerm
                        ? `FTS5 Matches for "${activeSearchTerm}"`
                        : 'Recent Sovereign Nodes'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] text-zinc-500 tabular-nums">
                    {lastSyncInfo && <span className="text-emerald-400">{lastSyncInfo}</span>}
                    <span>{filteredMemories.length} nodes</span>
                  </div>
                </div>

                {memoryLoading && filteredMemories.length === 0 ? (
                  <div className="monograph-surface flex items-center gap-2.5 rounded-lg p-6 font-mono text-xs text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                    Querying SQLite WAL store…
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="monograph-surface rounded-lg p-8 text-center">
                    <p className="text-sm font-medium text-zinc-300">No memory nodes found</p>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      {activeSearchTerm
                        ? 'Try broader FTS5 terms or clear the query filter.'
                        : 'Add a node using the composer to persist knowledge into SQLite WAL.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredMemories.map((node) => (
                      <article
                        key={node.id}
                        className="monograph-surface rounded-lg p-4 transition hover:border-white/[0.14]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-[13.5px] font-medium text-zinc-100">
                                {node.title}
                              </h3>
                              <span className="rounded border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                                {node.namespace}
                              </span>
                              {typeof node.score === 'number' && (
                                <span className="rounded border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-amber-300 tabular-nums">
                                  BM25 {node.score.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-zinc-400">
                              {node.content}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleCopy(`mem-${node.id}`, node.content)}
                              className="rounded p-1.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                              title="Copy content"
                            >
                              {copiedKey === `mem-${node.id}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteMemory(node.id)}
                              disabled={deletingMemoryId === node.id}
                              className="rounded p-1.5 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                              title="Delete memory node"
                            >
                              {deletingMemoryId === node.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2 font-mono text-[10.5px] text-zinc-600 tabular-nums">
                          <span className="truncate">{node.id}</span>
                          <span>{formatTimestamp(node.updated_at)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* Store New Memory Form */}
              <section className="lg:col-span-5">
                <form
                  onSubmit={handleCreateMemory}
                  className="monograph-surface sticky top-0 flex flex-col gap-4 rounded-lg p-5"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-medium text-zinc-100">
                      Ingest Sovereign Node
                    </h2>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      SQLite WAL + FTS5
                    </span>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Title
                    </span>
                    <input
                      type="text"
                      value={newMemTitle}
                      onChange={(e) => setNewMemTitle(e.target.value)}
                      placeholder="Architecture invariant or note title"
                      className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Namespace
                    </span>
                    <input
                      type="text"
                      list="nexus-v4-namespaces"
                      value={newMemNs}
                      onChange={(e) => setNewMemNs(e.target.value)}
                      placeholder="DEV"
                      className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 font-mono text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                    />
                    <datalist id="nexus-v4-namespaces">
                      {DEFAULT_NAMESPACES.map((ns) => (
                        <option key={ns} value={ns} />
                      ))}
                    </datalist>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                      Knowledge Payload
                    </span>
                    <textarea
                      rows={6}
                      value={newMemContent}
                      onChange={(e) => setNewMemContent(e.target.value)}
                      placeholder="Indexed automatically into FTS5 BM25 search…"
                      className="resize-y rounded-md border border-white/[0.08] bg-[#090a0c] p-3 text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={savingMemory || !newMemTitle.trim() || !newMemContent.trim()}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {savingMemory ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {savingMemory ? 'Committing…' : 'Store Memory Node'}
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}

        {activeTab === 'arxiv' && (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <form
              onSubmit={handleArxivSubmit}
              className="monograph-surface flex flex-col gap-3 rounded-lg p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex min-w-[240px] flex-1 items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    type="text"
                    value={arxivQuery}
                    onChange={(e) => setArxivQuery(e.target.value)}
                    placeholder="Search live arXiv preprints & scholar_context FTS5…"
                    className="h-9 w-full rounded-md border border-white/[0.08] bg-[#090a0c] pl-9 pr-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={arxivLoading || !arxivQuery.trim()}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-45"
                >
                  {arxivLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  Query Papers
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-500">
                <span>Quick topics:</span>
                {ARXIV_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => void runArxivSearch(topic)}
                    className="rounded border border-white/[0.08] bg-[#090a0c] px-2.5 py-0.5 text-zinc-400 transition hover:border-emerald-500/30 hover:text-emerald-300"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </form>

            {arxivLoading ? (
              <div className="monograph-surface flex items-center gap-2.5 rounded-lg p-6 font-mono text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                Querying local scholar_context and arXiv Atom feed…
              </div>
            ) : papers.length === 0 ? (
              <div className="monograph-surface rounded-lg p-8 text-center">
                <p className="text-sm font-medium text-zinc-200">
                  {lastArxivQuery ? `No literature returned for "${lastArxivQuery}"` : 'Scholar Literature Explorer'}
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Submit a research query above to search local scholar memory alongside live arXiv preprints.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1 font-mono text-[11px] text-zinc-500 tabular-nums">
                  <span>Results for &ldquo;{lastArxivQuery}&rdquo;</span>
                  <span>{papers.length} entries</span>
                </div>

                {papers.map((paper) => {
                  const summary = (paper.abstract || paper.summary || '').trim();
                  const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : '';
                  const externalHref =
                    paper.link && paper.link.startsWith('http')
                      ? paper.link
                      : paper.id.startsWith('http')
                      ? paper.id
                      : '';
                  return (
                    <article
                      key={paper.id}
                      className="monograph-surface rounded-lg p-5 transition hover:border-white/[0.14]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                                paper.is_local
                                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                                  : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                              }`}
                            >
                              {paper.is_local ? 'Local Memory' : paper.category || 'arXiv'}
                            </span>
                            {paper.venue && (
                              <span className="font-mono text-[11px] text-zinc-500">
                                {paper.venue}
                              </span>
                            )}
                            {paper.year && (
                              <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                                · {paper.year}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-2 text-[14.5px] font-medium leading-snug text-zinc-100">
                            {paper.title}
                          </h3>
                          {authors && (
                            <p className="mt-1 text-xs text-zinc-400">{authors}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {externalHref && (
                            <a
                              href={externalHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-[11px] text-zinc-300 transition hover:text-zinc-100"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Link
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSendPaperToSynthesis(paper)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 text-xs text-zinc-300 transition hover:border-amber-500/30 hover:text-amber-300"
                          >
                            <Sparkles className="h-3 w-3" />
                            Synthesize
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSavePaperToMemory(paper)}
                            disabled={savingPaperId === paper.id}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {savingPaperId === paper.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Database className="h-3 w-3" />
                            )}
                            Save
                          </button>
                        </div>
                      </div>

                      {summary && (
                        <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">
                          {summary}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'synthesis' && (
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
            <form
              onSubmit={handleSynthesize}
              className="monograph-surface flex flex-col gap-4 rounded-lg p-5 lg:col-span-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[13.5px] font-medium text-zinc-100">
                  Knowledge Synthesis Brief
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300">
                  LLM Router
                </span>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Research Topic
                </span>
                <input
                  type="text"
                  value={synthTopic}
                  onChange={(e) => setSynthTopic(e.target.value)}
                  placeholder="e.g. Hybrid BM25 + sqlite-vec retrieval latency"
                  className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Evidence &amp; Reference Notes
                </span>
                <textarea
                  rows={10}
                  value={synthNotes}
                  onChange={(e) => setSynthNotes(e.target.value)}
                  placeholder="Paste paper abstracts, benchmarks, or architectural observations…"
                  className="resize-y rounded-md border border-white/[0.08] bg-[#090a0c] p-3 text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={synthesizing || !synthTopic.trim()}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {synthesizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {synthesizing ? 'Synthesizing Brief…' : 'Synthesize Research'}
              </button>
            </form>

            <section className="monograph-surface flex flex-col rounded-lg p-6 lg:col-span-7">
              {synthesizing ? (
                <div className="flex flex-1 items-center justify-center gap-2.5 py-16 font-mono text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  Synthesizing architectural brief across LLM router…
                </div>
              ) : !synthesisOutput ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <Sparkles className="mb-3 h-5 w-5 text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-300">No active synthesis brief</p>
                  <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-500">
                    Provide a topic and optional reference notes—or send a paper straight from ArXiv Search—to generate a structured technical brief.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="monograph-hairline-b flex flex-wrap items-center justify-between gap-3 pb-3">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-zinc-400">
                      <span className="text-emerald-300">{synthesisOutput.model || 'Sovereign Router'}</span>
                      {synthesisOutput.provider && (
                        <span className="text-zinc-600">· {synthesisOutput.provider}</span>
                      )}
                      {typeof synthesisOutput.latencyMs === 'number' && (
                        <span className="text-zinc-500 tabular-nums">
                          · {synthesisOutput.latencyMs} ms
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy('synth-brief', synthesisOutput.synthesis)}
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-[11px] text-zinc-300 transition hover:text-zinc-100"
                      >
                        {copiedKey === 'synth-brief' ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCommitSynthesis()}
                        disabled={committingSynth}
                        className="inline-flex h-7 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 font-mono text-[11px] text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        {committingSynth ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        Save to Memory
                      </button>
                    </div>
                  </div>

                  {renderMonographProse(synthesisOutput.synthesis)}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Local Sovereign Notes Rail */}
            <aside className="monograph-surface flex flex-col gap-3 rounded-lg p-4 lg:col-span-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  Local Notes ({notes.length})
                </span>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="inline-flex h-7 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <Plus className="h-3 w-3" />
                  New
                </button>
              </div>

              <input
                type="text"
                value={noteFilter}
                onChange={(e) => setNoteFilter(e.target.value)}
                placeholder="Filter notes…"
                className="h-8 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
              />

              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {visibleNotes.length === 0 ? (
                  <p className="py-8 text-center text-xs text-zinc-500">
                    No local notes yet. Create one to draft offline and commit to SQLite memory.
                  </p>
                ) : (
                  visibleNotes.map((note) => {
                    const active = note.id === selectedNote?.id;
                    return (
                      <div
                        key={note.id}
                        className={`group flex items-start justify-between gap-2 rounded-md border p-3 transition ${
                          active
                            ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                            : 'border-white/[0.06] bg-[#090a0c] hover:border-white/[0.12]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedNoteId(note.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                            <span className="truncate text-[13px] font-medium text-zinc-100">
                              {note.title || 'Untitled Note'}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-zinc-500 tabular-nums">
                            <span>{note.namespace}</span>
                            <span>·</span>
                            <span>{formatTimestamp(note.updatedAt)}</span>
                            {note.syncedNodeId && (
                              <span className="text-emerald-400">· Synced</span>
                            )}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="rounded p-1 text-zinc-600 transition hover:bg-red-500/10 hover:text-red-300"
                          title="Delete local note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Editor Pane */}
            <section className="monograph-surface flex flex-col gap-4 rounded-lg p-5 lg:col-span-8">
              {!selectedNote ? (
                <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                  <FileText className="mb-3 h-5 w-5 text-zinc-600" />
                  <p className="text-sm font-medium text-zinc-300">Select or create a Sovereign Note</p>
                  <p className="mt-1.5 max-w-md text-xs text-zinc-500">
                    Drafts save continuously to local storage and can be indexed into SQLite FTS5 memory at any time.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-1 flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={selectedNote.title}
                        onChange={(e) => handleUpdateSelectedNote({ title: e.target.value })}
                        placeholder="Note title…"
                        className="h-9 min-w-[220px] flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 text-sm font-medium text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                      />
                      <select
                        value={selectedNote.namespace}
                        onChange={(e) => handleUpdateSelectedNote({ namespace: e.target.value })}
                        aria-label="Note target namespace"
                        className="h-9 rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 font-mono text-xs text-zinc-300 focus:border-emerald-500/40 focus:outline-none"
                      >
                        {DEFAULT_NAMESPACES.map((ns) => (
                          <option key={ns} value={ns}>
                            {ns}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCommitNoteToMemory(selectedNote)}
                      disabled={committingNoteId === selectedNote.id}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {committingNoteId === selectedNote.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Database className="h-3.5 w-3.5" />
                      )}
                      Commit to Memory
                    </button>
                  </div>

                  <textarea
                    rows={15}
                    value={selectedNote.content}
                    onChange={(e) => handleUpdateSelectedNote({ content: e.target.value })}
                    placeholder="Write sovereign architecture notes, research excerpts, or personal knowledge…"
                    className="flex-1 resize-y rounded-md border border-white/[0.08] bg-[#090a0c] p-4 font-sans text-[13.5px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-zinc-500 tabular-nums">
                    <span>
                      Autosaved to localStorage · {selectedNote.content.length} chars
                    </span>
                    <span>
                      {selectedNote.syncedNodeId
                        ? `Indexed in WAL (${selectedNote.syncedNodeId}) · ${formatTimestamp(selectedNote.syncedAt)}`
                        : 'Local draft only'}
                    </span>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScholarView;
