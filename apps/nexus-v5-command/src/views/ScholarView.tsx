import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BrainCircuit,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  WifiOff,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { MemoryNode } from '@/types';

type ScholarSubTab = 'memory' | 'arxiv' | 'notes';

interface MemorySearchNode extends MemoryNode {
  score?: number;
  match_type?: string;
}

interface MemoryListResponse {
  success?: boolean;
  memories?: MemoryNode[];
  error?: string;
}

interface MemorySearchResponse {
  success?: boolean;
  query?: string;
  results?: MemorySearchNode[];
  count?: number;
  error?: string;
}

interface MemoryCreateResponse {
  success?: boolean;
  id?: string;
  error?: string;
}

interface MemorySyncResponse {
  success?: boolean;
  synced_nodes?: number;
  target?: string;
  timestamp?: number;
  error?: string;
}

interface ScholarPaper {
  id: string;
  title: string;
  authors?: string[];
  year?: number;
  abstract?: string;
  summary?: string;
  venue?: string;
  category?: string;
  citations?: number;
  is_local?: boolean;
  link?: string;
}

interface ScholarSearchResponse {
  success?: boolean;
  query?: string;
  papers?: ScholarPaper[];
  results?: ScholarPaper[];
  error?: string;
}

interface ScholarSynthesizeResponse {
  success?: boolean;
  synthesis?: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
  error?: string;
}

interface SovereignNote {
  id: string;
  title: string;
  tags: string;
  body: string;
  updatedAt: string;
  syncedMemoryId?: string;
}

const SOVEREIGN_NOTES_STORAGE_KEY = 'nexus_v5_sovereign_notes';
const DEFAULT_NAMESPACES = ['DEV', 'STUDY', 'scholar_context', 'sovereign_notes'];

function loadLocalNotes(): SovereignNote[] {
  try {
    const raw = window.localStorage.getItem(SOVEREIGN_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SovereignNote =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.body === 'string'
    );
  } catch {
    return [];
  }
}

function saveLocalNotes(notes: SovereignNote[]): void {
  try {
    window.localStorage.setItem(SOVEREIGN_NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}

function formatTimestamp(raw?: string | number): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  const date =
    Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
      : new Date(String(raw));
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScholarView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);
  const isSilent = telemetry.workspaceMode === 'SILENT';

  const [subTab, setSubTab] = useState<ScholarSubTab>('memory');

  // Semantic FTS5 Memory State
  const [memories, setMemories] = useState<MemorySearchNode[]>([]);
  const [memoryQuery, setMemoryQuery] = useState('');
  const [activeSearchQuery, setActiveSearchQuery] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('ALL');
  const [loadingMemory, setLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [syncingMemory, setSyncingMemory] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{ count: number; target: string } | null>(null);

  // New Memory Node Form
  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemNamespace, setNewMemNamespace] = useState('DEV');
  const [newMemContent, setNewMemContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  // ArXiv & Synthesis State
  const [scholarQuery, setScholarQuery] = useState('');
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [searchingPapers, setSearchingPapers] = useState(false);
  const [scholarError, setScholarError] = useState<string | null>(null);
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);

  const [synthTopic, setSynthTopic] = useState('');
  const [synthNotes, setSynthNotes] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<ScholarSynthesizeResponse | null>(null);
  const [copiedSynthesis, setCopiedSynthesis] = useState(false);
  const [committingSynthesis, setCommittingSynthesis] = useState(false);

  // Sovereign Notes State (localStorage + POST /api/memory)
  const [notes, setNotes] = useState<SovereignNote[]>(() => loadLocalNotes());
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() => {
    const initial = loadLocalNotes();
    return initial[0]?.id ?? null;
  });
  const [committingNoteId, setCommittingNoteId] = useState<string | null>(null);

  useEffect(() => {
    saveLocalNotes(notes);
  }, [notes]);

  const loadMemories = useCallback(async (queryText = '') => {
    setLoadingMemory(true);
    setMemoryError(null);
    const trimmed = queryText.trim();

    if (trimmed) {
      const res = await ipcJson<MemorySearchResponse>(
        `/api/memory/search?q=${encodeURIComponent(trimmed)}&limit=30`
      );
      if (res.success && Array.isArray(res.results)) {
        setMemories(res.results);
        setActiveSearchQuery(trimmed);
      } else {
        setMemoryError(res.error || 'Semantic FTS5 search failed');
      }
    } else {
      const res = await ipcJson<MemoryListResponse>('/api/memory?limit=60');
      if (res.success && Array.isArray(res.memories)) {
        setMemories(res.memories);
        setActiveSearchQuery('');
      } else {
        setMemoryError(res.error || 'Failed to load memory nodes');
      }
    }
    setLoadingMemory(false);
  }, []);

  useEffect(() => {
    void loadMemories('');
  }, [loadMemories]);

  const availableNamespaces = useMemo(() => {
    const set = new Set<string>(DEFAULT_NAMESPACES);
    for (const node of memories) {
      if (node.namespace) set.add(node.namespace);
    }
    return ['ALL', ...Array.from(set)];
  }, [memories]);

  const filteredMemories = useMemo(() => {
    if (namespaceFilter === 'ALL') return memories;
    const target = namespaceFilter.toLowerCase();
    return memories.filter((m) => (m.namespace || '').toLowerCase() === target);
  }, [memories, namespaceFilter]);

  const handleMemorySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadMemories(memoryQuery);
  };

  const handleClearMemorySearch = async () => {
    setMemoryQuery('');
    await loadMemories('');
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newMemTitle.trim();
    const content = newMemContent.trim();
    const namespace = newMemNamespace.trim() || 'DEV';
    if (!title || !content) {
      pushToast('Title and content are required to store a memory node', 'warn');
      return;
    }

    setSavingMemory(true);
    const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
        namespace,
        metadata: { source: 'scholar_view_v5', created_via: 'manual_ingest' },
      }),
    });
    setSavingMemory(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to store memory node', 'error');
      return;
    }

    pushToast(`Stored memory node "${title}" in [${namespace}]`, 'success');
    setNewMemTitle('');
    setNewMemContent('');
    await loadMemories(activeSearchQuery);
  };

  const handleDeleteMemory = async (node: MemorySearchNode) => {
    setDeletingMemoryId(node.id);
    let res = await ipcJson<{ success?: boolean; error?: string }>(
      `/api/memory/${encodeURIComponent(node.id)}`,
      { method: 'DELETE' }
    );

    if (!res.success && /404|not found|endpoint/i.test(res.error || '')) {
      res = await ipcJson<{ success?: boolean; error?: string }>('/api/memory/forget', {
        method: 'POST',
        body: JSON.stringify({ id: node.id }),
      });
    }
    setDeletingMemoryId(null);

    if (!res.success) {
      pushToast(res.error || 'Failed to delete memory node', 'error');
      return;
    }

    setMemories((prev) => prev.filter((item) => item.id !== node.id));
    pushToast(`Deleted memory node "${node.title}"`, 'info');
  };

  const handleSyncMemory = async () => {
    setSyncingMemory(true);
    const res = await ipcJson<MemorySyncResponse>('/api/memory/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setSyncingMemory(false);

    if (!res.success) {
      pushToast(res.error || 'WAL memory sync failed', 'error');
      return;
    }

    const syncedCount = res.synced_nodes ?? memories.length;
    setLastSyncInfo({
      count: syncedCount,
      target: res.target || 'sqlite_wal',
    });
    pushToast(`Memory WAL checkpoint synced (${syncedCount} nodes)`, 'success');
  };

  const handleScholarSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = scholarQuery.trim();
    if (!query) {
      pushToast('Enter a research query for arXiv & Scholar search', 'warn');
      return;
    }

    setSearchingPapers(true);
    setScholarError(null);
    const res = await ipcJson<ScholarSearchResponse>(
      `/api/scholar/search?query=${encodeURIComponent(query)}&limit=10`
    );
    setSearchingPapers(false);

    if (!res.success) {
      setScholarError(res.error || 'Scholar search failed');
      return;
    }

    const list = Array.isArray(res.papers)
      ? res.papers
      : Array.isArray(res.results)
        ? res.results
        : [];
    setPapers(list);
    if (!synthTopic.trim()) {
      setSynthTopic(query);
    }
  };

  const handleCitePaper = (paper: ScholarPaper) => {
    const authors = paper.authors?.length ? paper.authors.slice(0, 3).join(', ') : 'Unknown';
    const abstractText = paper.abstract || paper.summary || '';
    const snippet = `[${paper.year ?? 'arXiv'}] ${paper.title} (${authors})\n${abstractText}`;
    setSynthTopic((prev) => prev.trim() || paper.title);
    setSynthNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    pushToast('Added citation context to Neural Synthesis', 'info');
  };

  const handleSavePaperToMemory = async (paper: ScholarPaper) => {
    setSavingPaperId(paper.id);
    const authors = paper.authors?.length ? paper.authors.join(', ') : 'Unknown';
    const abstractText = paper.abstract || paper.summary || 'No abstract provided.';
    const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        title: paper.title,
        content: `Authors: ${authors}\nVenue: ${paper.venue || paper.category || 'arXiv'} (${paper.year ?? 'N/A'})\n${paper.link ? `Link: ${paper.link}\n` : ''}\n${abstractText}`,
        namespace: 'scholar_context',
        metadata: {
          source: 'scholar_arxiv',
          paper_id: paper.id,
          year: paper.year,
          link: paper.link,
        },
      }),
    });
    setSavingPaperId(null);

    if (!res.success) {
      pushToast(res.error || 'Failed to save paper to memory', 'error');
      return;
    }

    pushToast(`Saved "${paper.title.slice(0, 40)}" to [scholar_context]`, 'success');
    void loadMemories(activeSearchQuery);
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = synthTopic.trim();
    if (!topic) {
      pushToast('Provide a synthesis topic first', 'warn');
      return;
    }

    setSynthesizing(true);
    setCopiedSynthesis(false);
    const res = await ipcJson<ScholarSynthesizeResponse>('/api/scholar/synthesize', {
      method: 'POST',
      body: JSON.stringify({ topic, notes: synthNotes }),
    });
    setSynthesizing(false);

    if (!res.success || !res.synthesis) {
      pushToast(res.error || 'Synthesis request failed', 'error');
      return;
    }

    setSynthesisResult(res);
    pushToast(`Synthesis complete via ${res.provider || 'local'}`, 'success');
  };

  const handleCopySynthesis = async () => {
    if (!synthesisResult?.synthesis) return;
    try {
      await navigator.clipboard.writeText(synthesisResult.synthesis);
      setCopiedSynthesis(true);
      pushToast('Synthesis brief copied to clipboard', 'info');
    } catch {
      pushToast('Clipboard access unavailable', 'warn');
    }
  };

  const handleCommitSynthesisToMemory = async () => {
    if (!synthesisResult?.synthesis) return;
    const topic = synthTopic.trim() || 'Scholar Synthesis';
    setCommittingSynthesis(true);
    const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        title: `Synthesis: ${topic}`,
        content: synthesisResult.synthesis,
        namespace: 'scholar_context',
        metadata: {
          source: 'scholar_synthesize',
          provider: synthesisResult.provider,
          model: synthesisResult.model,
        },
      }),
    });
    setCommittingSynthesis(false);

    if (!res.success) {
      pushToast(res.error || 'Failed to store synthesis', 'error');
      return;
    }

    pushToast('Synthesis brief committed to SQLite FTS5 memory', 'success');
    void loadMemories(activeSearchQuery);
  };

  // Sovereign Notes Handlers
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const handleCreateNote = (initial?: { title?: string; tags?: string; body?: string }) => {
    const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const next: SovereignNote = {
      id,
      title: initial?.title || 'Untitled Research Note',
      tags: initial?.tags || 'research, architecture',
      body: initial?.body || '',
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => [next, ...prev]);
    setSelectedNoteId(id);
    setSubTab('notes');
  };

  const handleUpdateSelectedNote = (patch: Partial<SovereignNote>) => {
    if (!selectedNote) return;
    const now = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => (n.id === selectedNote.id ? { ...n, ...patch, updatedAt: now } : n))
    );
  };

  const handleDeleteLocalNote = (id: string) => {
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== id);
      if (selectedNoteId === id) {
        setSelectedNoteId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const handleCommitNoteToMemory = async (note: SovereignNote) => {
    const title = note.title.trim();
    const content = note.body.trim();
    if (!title || !content) {
      pushToast('Note requires both a title and body before committing to FTS5', 'warn');
      return;
    }

    setCommittingNoteId(note.id);
    const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
        namespace: 'sovereign_notes',
        metadata: {
          source: 'sovereign_notes',
          local_note_id: note.id,
          tags: note.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }),
    });
    setCommittingNoteId(null);

    if (!res.success) {
      pushToast(res.error || 'Failed to commit note to FTS5 memory', 'error');
      return;
    }

    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, syncedMemoryId: res.id || 'synced' } : n))
    );
    pushToast(`Committed "${title}" to [sovereign_notes]`, 'success');
    void loadMemories(activeSearchQuery);
  };

  const handleSendNoteToSynthesis = (note: SovereignNote) => {
    setSynthTopic(note.title);
    setSynthNotes(note.body);
    setSubTab('arxiv');
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Header Bar */}
      <div className="matrix-panel matrix-border rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-500/12 border border-emerald-500/30 flex items-center justify-center shrink-0 matrix-glow">
            <BrainCircuit className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-emerald-50 flex items-center gap-2">
              Scholar &amp; Sovereign Memory
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              FTS5 Neural Recall · Live arXiv Preprint Matrix · LLM Synthesis · Local-First Notes
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isSilent && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-amber-500/10 border border-amber-500/30 text-amber-300">
              <WifiOff className="h-3.5 w-3.5" />
              SILENT AIR-GAP
            </span>
          )}

          <div className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-cyan-300">
            {memories.length} Memory Nodes
          </div>

          {lastSyncInfo && (
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-mono text-emerald-300">
              WAL Synced · {lastSyncInfo.count}
            </div>
          )}

          <button
            type="button"
            onClick={handleSyncMemory}
            disabled={syncingMemory || isSilent}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 transition disabled:opacity-45 cursor-pointer"
          >
            {syncingMemory ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UploadCloud className="h-3.5 w-3.5 text-emerald-400" />
            )}
            Sync WAL
          </button>
        </div>
      </div>

      {/* Sub-Tab Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center p-1 rounded-xl bg-[#090e14] border border-white/10 gap-1">
          {(
            [
              { id: 'memory', label: 'Semantic Memory', icon: Database },
              { id: 'arxiv', label: 'arXiv & Synthesis', icon: BookOpen },
              { id: 'notes', label: 'Sovereign Notes', icon: NotebookPen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
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
      </div>

      {/* TAB 1: SEMANTIC FTS5 MEMORY */}
      {subTab === 'memory' && (
        <div className="space-y-6">
          {/* Search & Namespace Filter Bar */}
          <form
            onSubmit={handleMemorySearch}
            className="matrix-panel rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3"
          >
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-emerald-400/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={memoryQuery}
                onChange={(e) => setMemoryQuery(e.target.value)}
                placeholder="Query SQLite FTS5 BM25 index (keywords, architecture decisions, tokens)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-500"
              />
            </div>

            <select
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
              aria-label="Filter memory namespace"
              className="px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-200"
            >
              {availableNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns === 'ALL' ? 'ALL NAMESPACES' : ns}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loadingMemory}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-100 transition cursor-pointer"
              >
                {loadingMemory ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Search className="h-3.5 w-3.5" />
                )}
                Search FTS5
              </button>

              {activeSearchQuery && (
                <button
                  type="button"
                  onClick={handleClearMemorySearch}
                  className="px-3 py-2.5 rounded-xl text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition cursor-pointer"
                >
                  Reset
                </button>
              )}

              <button
                type="button"
                onClick={() => void loadMemories(activeSearchQuery)}
                aria-label="Refresh memory nodes"
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${loadingMemory ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Ingest Memory Node */}
            <form
              onSubmit={handleCreateMemory}
              className="lg:col-span-5 matrix-panel matrix-border rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-emerald-50">Ingest Memory Node</h2>
                </div>
                <span className="text-[11px] font-mono text-cyan-300/80">POST /api/memory</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">Title</label>
                <input
                  type="text"
                  value={newMemTitle}
                  onChange={(e) => setNewMemTitle(e.target.value)}
                  placeholder="e.g. IPC Bearer Auth Pattern"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">Namespace</label>
                <input
                  type="text"
                  value={newMemNamespace}
                  onChange={(e) => setNewMemNamespace(e.target.value)}
                  list="nexus-v5-namespaces"
                  placeholder="DEV"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-200 placeholder:text-slate-600"
                />
                <datalist id="nexus-v5-namespaces">
                  {DEFAULT_NAMESPACES.map((ns) => (
                    <option key={ns} value={ns} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">Content</label>
                <textarea
                  rows={6}
                  value={newMemContent}
                  onChange={(e) => setNewMemContent(e.target.value)}
                  placeholder="Enter technical insight, code pattern, or semantic context to index in SQLite WAL..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-slate-100 placeholder:text-slate-600 resize-y"
                />
              </div>

              <button
                type="submit"
                disabled={savingMemory}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-100 transition disabled:opacity-50 cursor-pointer"
              >
                {savingMemory ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4 text-emerald-400" />
                )}
                Commit Node to FTS5
              </button>
            </form>

            {/* Right: Memory Node List */}
            <div className="lg:col-span-7 space-y-4">
              {memoryError && (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {memoryError}
                </div>
              )}

              {activeSearchQuery && (
                <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-xs font-mono text-cyan-200">
                  <span>
                    FTS5 BM25 matches for &ldquo;{activeSearchQuery}&rdquo; ({filteredMemories.length})
                  </span>
                </div>
              )}

              {loadingMemory && filteredMemories.length === 0 ? (
                <div className="matrix-panel rounded-2xl p-10 flex items-center justify-center gap-3 text-xs font-mono text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  Querying SQLite WAL Memory Store...
                </div>
              ) : filteredMemories.length === 0 ? (
                <div className="matrix-panel rounded-2xl p-10 text-center space-y-2">
                  <Database className="h-8 w-8 text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-300 font-medium">No memory nodes matched</p>
                  <p className="text-xs text-slate-500">
                    Ingest a memory node on the left or broaden your FTS5 search query.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMemories.map((node) => (
                    <article
                      key={node.id}
                      className="matrix-panel rounded-2xl p-4 border border-white/8 hover:border-emerald-500/30 transition space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-emerald-50 truncate">
                              {node.title}
                            </h3>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-cyan-500/10 border border-cyan-400/25 text-cyan-300">
                              {node.namespace}
                            </span>
                            {typeof node.score === 'number' && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                                BM25 {node.score.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            ID: {node.id} · Updated {formatTimestamp(node.updated_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateNote({
                                title: node.title,
                                tags: node.namespace,
                                body: node.content,
                              })
                            }
                            title="Clone into Sovereign Notes"
                            className="p-2 rounded-lg bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-400/30 text-slate-300 hover:text-cyan-200 transition cursor-pointer"
                          >
                            <NotebookPen className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDeleteMemory(node)}
                            disabled={deletingMemoryId === node.id}
                            title="Delete memory node"
                            className="p-2 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/35 text-slate-400 hover:text-red-300 transition disabled:opacity-50 cursor-pointer"
                          >
                            {deletingMemoryId === node.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words bg-[#05080b]/70 border border-white/5 rounded-xl p-3">
                        {node.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ARXIV SEARCH & NEURAL SYNTHESIS */}
      {subTab === 'arxiv' && (
        <div className="space-y-6">
          <form
            onSubmit={handleScholarSearch}
            className="matrix-panel rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          >
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-cyan-400/75 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={scholarQuery}
                onChange={(e) => setScholarQuery(e.target.value)}
                placeholder="Search arXiv preprints & local scholar_context (e.g. speculative decoding, multi-agent systems)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              disabled={searchingPapers}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-cyan-500/18 hover:bg-cyan-500/28 border border-cyan-400/40 text-cyan-100 transition disabled:opacity-50 cursor-pointer"
            >
              {searchingPapers ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" />
              )}
              Query Scholar
            </button>
          </form>

          {isSilent && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2">
              <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
              SILENT air-gap active: external arXiv network queries may fall back to local sovereign memory entries.
            </div>
          )}

          {scholarError && (
            <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {scholarError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Literature Results */}
            <div className="lg:col-span-7 space-y-4">
              {searchingPapers ? (
                <div className="matrix-panel rounded-2xl p-10 flex items-center justify-center gap-3 text-xs font-mono text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  Querying arXiv &amp; Sovereign Knowledge Base...
                </div>
              ) : papers.length === 0 ? (
                <div className="matrix-panel rounded-2xl p-10 text-center space-y-2">
                  <BookOpen className="h-8 w-8 text-slate-600 mx-auto" />
                  <p className="text-sm text-slate-300 font-medium">Scholar Feed Ready</p>
                  <p className="text-xs text-slate-500">
                    Run a query above to fetch live arXiv preprints and local FTS5 scholar records.
                  </p>
                </div>
              ) : (
                papers.map((paper) => {
                  const abstractText = paper.abstract || paper.summary || '';
                  const externalUrl =
                    paper.link && paper.link.startsWith('http')
                      ? paper.link
                      : paper.id.startsWith('http')
                        ? paper.id
                        : '';
                  return (
                    <article
                      key={paper.id}
                      className="matrix-panel rounded-2xl p-5 border border-white/8 hover:border-cyan-400/30 transition space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-mono border ${
                                paper.is_local
                                  ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                                  : 'bg-cyan-500/12 border-cyan-400/30 text-cyan-300'
                              }`}
                            >
                              {paper.is_local ? 'LOCAL KB' : paper.venue || paper.category || 'arXiv'}
                            </span>
                            {paper.year && (
                              <span className="text-[11px] font-mono text-slate-400">
                                {paper.year}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-emerald-50 leading-snug">
                            {paper.title}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {paper.authors?.length ? paper.authors.join(', ') : 'Contributor'}
                          </p>
                        </div>

                        {externalUrl && (
                          <a
                            href={externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-white/5 hover:bg-cyan-500/15 border border-white/10 text-cyan-300 shrink-0"
                            title="Open paper source"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>

                      {abstractText && (
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {abstractText}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleCitePaper(paper)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/22 border border-cyan-400/30 text-cyan-200 transition cursor-pointer"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Cite in Synthesis
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleSavePaperToMemory(paper)}
                          disabled={savingPaperId === paper.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/12 hover:bg-emerald-500/22 border border-emerald-500/30 text-emerald-200 transition disabled:opacity-50 cursor-pointer"
                        >
                          {savingPaperId === paper.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Database className="h-3.5 w-3.5" />
                          )}
                          Save to Memory
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Right: Neural Synthesis Engine */}
            <div className="lg:col-span-5 space-y-4">
              <form
                onSubmit={handleSynthesize}
                className="matrix-panel matrix-border rounded-2xl p-5 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-white/8 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-sm font-semibold text-emerald-50">Neural Synthesis</h2>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-300/80">
                    POST /api/scholar/synthesize
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Research Topic</label>
                  <input
                    type="text"
                    value={synthTopic}
                    onChange={(e) => setSynthTopic(e.target.value)}
                    placeholder="e.g. Deterministic Guardrails in Autonomous Agents"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-sm text-emerald-50 placeholder:text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">
                    Notes &amp; Cited Abstracts
                  </label>
                  <textarea
                    rows={6}
                    value={synthNotes}
                    onChange={(e) => setSynthNotes(e.target.value)}
                    placeholder="Cite papers from the left column or paste reference notes..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs text-slate-200 placeholder:text-slate-600 resize-y"
                  />
                </div>

                <button
                  type="submit"
                  disabled={synthesizing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/45 text-emerald-100 transition disabled:opacity-50 cursor-pointer"
                >
                  {synthesizing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                  )}
                  Synthesize Technical Brief
                </button>
              </form>

              {synthesisResult?.synthesis && (
                <div className="matrix-panel rounded-2xl p-5 border border-emerald-500/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-3">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-300">
                      <span>{synthesisResult.provider || 'local'}</span>
                      {synthesisResult.model && <span>· {synthesisResult.model}</span>}
                      {typeof synthesisResult.latency_ms === 'number' && (
                        <span>· {Math.round(synthesisResult.latency_ms)}ms</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopySynthesis()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 cursor-pointer"
                      >
                        {copiedSynthesis ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedSynthesis ? 'Copied' : 'Copy'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleCommitSynthesisToMemory()}
                        disabled={committingSynthesis}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 cursor-pointer"
                      >
                        {committingSynthesis ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Database className="h-3 w-3" />
                        )}
                        Commit
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-1">
                    {synthesisResult.synthesis}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SOVEREIGN NOTES */}
      {subTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Local Notes Index */}
          <div className="lg:col-span-4 matrix-panel matrix-border rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-emerald-50">Sovereign Notebook</h2>
                <p className="text-[11px] font-mono text-slate-500">
                  localStorage + FTS5 Commit
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCreateNote()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/18 hover:bg-emerald-500/28 border border-emerald-500/35 text-emerald-200 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                New Note
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <FileText className="h-7 w-7 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">No local notes yet.</p>
                <p className="text-[11px] text-slate-500">
                  Create a note to draft locally, then commit to SQLite FTS5 when ready.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {notes.map((note) => {
                  const selected = note.id === selectedNoteId;
                  return (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={`rounded-xl p-3 border transition cursor-pointer ${
                        selected
                          ? 'bg-emerald-500/12 border-emerald-500/40'
                          : 'bg-[#05080b]/70 border-white/8 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-emerald-50 truncate">
                            {note.title || 'Untitled Note'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            {formatTimestamp(note.updatedAt)}
                            {note.syncedMemoryId ? ' · FTS5 Synced' : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLocalNote(note.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition cursor-pointer"
                          title="Delete local note"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Active Note Editor */}
          <div className="lg:col-span-8 matrix-panel rounded-2xl p-5 border border-white/10">
            {!selectedNote ? (
              <div className="py-16 text-center space-y-3">
                <NotebookPen className="h-9 w-9 text-slate-600 mx-auto" />
                <p className="text-sm text-slate-300 font-medium">
                  Select or create a Sovereign Note
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Drafts persist immediately in browser localStorage and can be promoted into SQLite
                  FTS5 semantic memory (`sovereign_notes` namespace) or fed into Neural Synthesis.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
                  <span className="text-[11px] font-mono text-cyan-300">
                    LOCAL DRAFT · {formatTimestamp(selectedNote.updatedAt)}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSendNoteToSynthesis(selectedNote)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/22 border border-cyan-400/30 text-cyan-200 transition cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Synthesize
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCommitNoteToMemory(selectedNote)}
                      disabled={committingNoteId === selectedNote.id}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/18 hover:bg-emerald-500/28 border border-emerald-500/40 text-emerald-100 transition disabled:opacity-50 cursor-pointer"
                    >
                      {committingNoteId === selectedNote.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Database className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      Commit to Memory
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-400">Note Title</label>
                    <input
                      type="text"
                      value={selectedNote.title}
                      onChange={(e) => handleUpdateSelectedNote({ title: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-emerald-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-slate-400">
                      Tags (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={selectedNote.tags}
                      onChange={(e) => handleUpdateSelectedNote({ tags: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#05080b] border border-white/10 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-200"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Body</label>
                  <textarea
                    rows={13}
                    value={selectedNote.body}
                    onChange={(e) => handleUpdateSelectedNote({ body: e.target.value })}
                    placeholder="Capture architectural insights, paper notes, or command snippets..."
                    className="w-full px-4 py-3 rounded-xl bg-[#05080b] border border-white/10 focus:border-emerald-500/50 focus:outline-none text-sm text-slate-100 leading-relaxed font-mono resize-y"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScholarView;
