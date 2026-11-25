import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Database,
  Sparkles,
  StickyNote,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Send,
  CloudUpload,
  Layers,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { MemoryNode } from '../types';

type ScholarTab = 'memory' | 'scholar' | 'notes';

interface ScholarPaper {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  category?: string;
  citations?: number;
  abstract?: string;
  summary?: string;
  link?: string;
  is_local?: boolean;
}

interface SovereignNote {
  id: string;
  title: string;
  namespace: string;
  content: string;
  updatedAt: number;
  syncedMemoryId?: string;
  lastSyncedAt?: number;
}

interface MemoryListResponse {
  memories?: MemoryNode[];
}

interface MemorySearchResponse {
  query?: string;
  results?: MemoryNode[];
  count?: number;
}

interface MemoryCreateResponse {
  id?: string;
}

interface MemorySyncResponse {
  synced_nodes?: number;
  target?: string;
  timestamp?: number;
}

interface ScholarSearchResponse {
  query?: string;
  papers?: ScholarPaper[];
  results?: ScholarPaper[];
}

interface ScholarSynthesizeResponse {
  synthesis?: string;
  provider?: string;
  model?: string;
  latency_ms?: number;
}

const NOTES_STORAGE_KEY = 'nexus_v2_sovereign_notes';
const NAMESPACES = ['DEV', 'STUDY', 'STUDIO', 'scholar_context', 'notes'] as const;

function loadNotesFromStorage(): SovereignNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SovereignNote[]) : [];
  } catch {
    return [];
  }
}

function saveNotesToStorage(notes: SovereignNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Storage quota or private browsing restriction
  }
}

function formatTimestamp(ts: number | string | undefined): string {
  if (ts === undefined || ts === null || ts === '') return 'Recent';
  if (typeof ts === 'number') {
    const ms = ts > 1_000_000_000_000 ? ts : ts * 1000;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const num = Number(ts);
  if (!Number.isNaN(num) && num > 0) {
    const ms = num > 1_000_000_000_000 ? num : num * 1000;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const parsed = Date.parse(ts);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(ts);
}

export function ScholarView() {
  const pushToast = useNexusStore((s) => s.pushToast);
  const workspaceMode = useNexusStore((s) => s.telemetry.workspaceMode);

  const [activeTab, setActiveTab] = useState<ScholarTab>('memory');

  // --- Tab 1: Semantic FTS5 Memory ---
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [syncingMemory, setSyncingMemory] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{ count: number; target: string } | null>(null);

  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemNamespace, setNewMemNamespace] = useState<string>('STUDY');
  const [newMemContent, setNewMemContent] = useState('');
  const [creatingMemory, setCreatingMemory] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  // --- Tab 2: Scholar Search & Synthesis ---
  const [paperQuery, setPaperQuery] = useState('');
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [searchingPapers, setSearchingPapers] = useState(false);
  const [paperError, setPaperError] = useState<string | null>(null);

  const [synthTopic, setSynthTopic] = useState('');
  const [synthNotes, setSynthNotes] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<{
    text: string;
    provider?: string;
    model?: string;
    latencyMs?: number;
  } | null>(null);
  const [copiedSynth, setCopiedSynth] = useState(false);

  // --- Tab 3: Sovereign Notes ---
  const [notes, setNotes] = useState<SovereignNote[]>(() => loadNotesFromStorage());
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    const initial = loadNotesFromStorage();
    return initial[0]?.id ?? null;
  });
  const [committingNote, setCommittingNote] = useState(false);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const fetchMemories = useCallback(
    async (queryText: string) => {
      setMemoryLoading(true);
      setMemoryError(null);
      try {
        const trimmed = queryText.trim();
        if (trimmed) {
          const res = await ipcJson<MemorySearchResponse>(
            `/api/memory/search?q=${encodeURIComponent(trimmed)}&limit=25`
          );
          if (res.success === false) {
            setMemoryError(res.error || 'Failed querying FTS5 memory');
            return;
          }
          const rows = Array.isArray(res.results) ? res.results : [];
          setMemories(rows);
          if (rows.length > 0 && !rows.some((r) => r.id === selectedMemoryId)) {
            setSelectedMemoryId(rows[0].id);
          }
        } else {
          const res = await ipcJson<MemoryListResponse>('/api/memory?limit=30');
          if (res.success === false) {
            setMemoryError(res.error || 'Failed loading SQLite WAL memories');
            return;
          }
          const rows = Array.isArray(res.memories) ? res.memories : [];
          setMemories(rows);
          if (rows.length > 0 && !rows.some((r) => r.id === selectedMemoryId)) {
            setSelectedMemoryId(rows[0].id);
          }
        }
      } catch (err) {
        setMemoryError(err instanceof Error ? err.message : 'Memory IPC unreachable');
      } finally {
        setMemoryLoading(false);
      }
    },
    [selectedMemoryId]
  );

  useEffect(() => {
    void fetchMemories('');
  }, [fetchMemories]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newMemTitle.trim();
    const content = newMemContent.trim();
    if (!title || !content) {
      pushToast('Title and content are required to store a memory node', 'warn');
      return;
    }

    setCreatingMemory(true);
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: newMemNamespace,
          metadata: { source: 'nexus-v2-cockpit', tab: 'scholar' },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed storing memory node', 'error');
        return;
      }
      pushToast(`Stored memory node "${title}"`, 'success');
      setNewMemTitle('');
      setNewMemContent('');
      await fetchMemories(memoryQuery);
      if (res.id) setSelectedMemoryId(res.id);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed storing memory node', 'error');
    } finally {
      setCreatingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    setDeletingMemoryId(id);
    try {
      const res = await ipcJson(`/api/memory/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed deleting memory node', 'error');
        return;
      }
      setMemories((prev) => prev.filter((item) => item.id !== id));
      if (selectedMemoryId === id) {
        setSelectedMemoryId(null);
      }
      pushToast('Memory node deleted from SQLite WAL', 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete request failed', 'error');
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const handleSyncMemory = async () => {
    setSyncingMemory(true);
    try {
      const res = await ipcJson<MemorySyncResponse>('/api/memory/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast(res.error || 'Memory sync failed', 'warn');
        return;
      }
      const syncedCount = res.synced_nodes ?? memories.length;
      const target = res.target ?? 'sqlite_wal_edge_ready';
      setLastSyncInfo({ count: syncedCount, target });
      pushToast(`SQLite WAL checkpoint synced (${syncedCount} nodes)`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Sync endpoint unreachable', 'error');
    } finally {
      setSyncingMemory(false);
    }
  };

  const handleScholarSearch = async (e?: React.FormEvent, overrideQuery?: string) => {
    e?.preventDefault();
    const q = (overrideQuery ?? paperQuery).trim();
    if (!q) {
      pushToast('Enter a research query for arXiv & sovereign search', 'warn');
      return;
    }
    if (overrideQuery !== undefined) setPaperQuery(overrideQuery);

    setSearchingPapers(true);
    setPaperError(null);
    try {
      const res = await ipcJson<ScholarSearchResponse>(
        `/api/scholar/search?query=${encodeURIComponent(q)}&q=${encodeURIComponent(q)}&limit=10`
      );
      if (res.success === false) {
        setPaperError(res.error || 'Scholar search failed');
        return;
      }
      const list = Array.isArray(res.papers)
        ? res.papers
        : Array.isArray(res.results)
          ? res.results
          : [];
      setPapers(list);
      if (!synthTopic.trim()) {
        setSynthTopic(q);
      }
    } catch (err) {
      setPaperError(err instanceof Error ? err.message : 'Scholar search unreachable');
    } finally {
      setSearchingPapers(false);
    }
  };

  const handleAttachPaperToSynthesis = (paper: ScholarPaper) => {
    const abstractText = paper.abstract || paper.summary || '';
    const snippet = `[${paper.year}] ${paper.title} (${paper.authors.slice(0, 3).join(', ')})\n${abstractText}`;
    setSynthTopic((prev) => prev.trim() || paper.title);
    setSynthNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    pushToast('Added paper context to Synthesis workbench', 'info');
  };

  const handleSavePaperToMemory = async (paper: ScholarPaper) => {
    const abstractText = paper.abstract || paper.summary || 'No abstract recorded.';
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: paper.title,
          namespace: 'scholar_context',
          content: `Authors: ${paper.authors.join(', ')}\nYear: ${paper.year}\nVenue: ${paper.venue || paper.category || 'arXiv'}\n\n${abstractText}`,
          metadata: { paper_id: paper.id, year: paper.year, source: 'scholar_search' },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed saving paper to FTS5 memory', 'error');
        return;
      }
      pushToast('Paper saved to scholar_context FTS5 memory', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory save failed', 'error');
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = synthTopic.trim();
    if (!topic) {
      pushToast('Enter a research topic to synthesize', 'warn');
      return;
    }

    setSynthesizing(true);
    try {
      const res = await ipcJson<ScholarSynthesizeResponse>('/api/scholar/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          notes: synthNotes.trim(),
        }),
      });
      if (res.success === false || !res.synthesis) {
        pushToast(res.error || 'Knowledge synthesis failed', 'error');
        return;
      }
      setSynthesisResult({
        text: res.synthesis,
        provider: res.provider,
        model: res.model,
        latencyMs: res.latency_ms,
      });
      pushToast('Research synthesis brief generated', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Synthesis request failed', 'error');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleSaveSynthesisToMemory = async () => {
    if (!synthesisResult?.text) return;
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: `Synthesis: ${synthTopic.trim() || 'Research Brief'}`,
          namespace: 'scholar_context',
          content: synthesisResult.text,
          metadata: {
            provider: synthesisResult.provider,
            model: synthesisResult.model,
            source: 'scholar_synthesize',
          },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed storing synthesis', 'error');
        return;
      }
      pushToast('Synthesis committed to scholar_context memory', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed storing synthesis', 'error');
    }
  };

  const handleCopySynthesis = async () => {
    if (!synthesisResult?.text) return;
    try {
      await navigator.clipboard.writeText(synthesisResult.text);
      setCopiedSynth(true);
      setTimeout(() => setCopiedSynth(false), 1800);
    } catch {
      pushToast('Clipboard access unavailable', 'warn');
    }
  };

  const updateNote = (id: string, patch: Partial<SovereignNote>) => {
    setNotes((prev) => {
      const next = prev.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: Date.now() } : note
      );
      saveNotesToStorage(next);
      return next;
    });
  };

  const handleCreateNote = () => {
    const note: SovereignNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: 'Untitled Sovereign Note',
      namespace: 'notes',
      content: '',
      updatedAt: Date.now(),
    };
    setNotes((prev) => {
      const next = [note, ...prev];
      saveNotesToStorage(next);
      return next;
    });
    setActiveNoteId(note.id);
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotesToStorage(next);
      if (activeNoteId === id) {
        setActiveNoteId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const handleCommitNoteToMemory = async () => {
    if (!activeNote) return;
    const title = activeNote.title.trim();
    const content = activeNote.content.trim();
    if (!title || !content) {
      pushToast('Note needs both a title and content before syncing to FTS5 memory', 'warn');
      return;
    }
    setCommittingNote(true);
    try {
      const res = await ipcJson<MemoryCreateResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: activeNote.namespace || 'notes',
          metadata: { source: 'sovereign_notes', local_note_id: activeNote.id },
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Failed committing note to FTS5 memory', 'error');
        return;
      }
      updateNote(activeNote.id, {
        syncedMemoryId: res.id || activeNote.syncedMemoryId,
        lastSyncedAt: Date.now(),
      });
      pushToast(`Committed "${title}" to SQLite FTS5 memory`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Memory commit failed', 'error');
    } finally {
      setCommittingNote(false);
    }
  };

  const selectedMemory = memories.find((m) => m.id === selectedMemoryId) ?? null;

  return (
    <div className="h-full overflow-y-auto p-6 flex flex-col gap-6">
      {/* Header Bar */}
      <div className="aether-glass rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300 aether-glow-cyan">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-slate-100">
                Scholar &amp; Sovereign Memory
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-300 border border-emerald-400/25">
                FTS5 WAL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Semantic SQLite memory graph, live arXiv retrieval, multi-model synthesis, and sovereign notes.
            </p>
          </div>
        </div>

        {/* Segmented Sub-Navigation */}
        <div className="flex items-center gap-2 bg-[#050a14]/80 p-1.5 rounded-xl border border-slate-700/40 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('memory')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'memory'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            FTS5 Memory
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scholar')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'scholar'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Scholar &amp; Synthesis
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'notes'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <StickyNote className="w-3.5 h-3.5" />
            Sovereign Notes
          </button>
        </div>
      </div>

      {/* TAB 1: SEMANTIC FTS5 MEMORY */}
      {activeTab === 'memory' && (
        <div className="flex flex-col gap-6">
          {/* Search + Sync Bar */}
          <div className="aether-panel rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void fetchMemories(memoryQuery);
              }}
              className="flex-1 flex items-center gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-cyan-400/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Search SQLite FTS5 memory nodes (empty shows recent entries)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </div>
              <button
                type="submit"
                disabled={memoryLoading}
                className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${memoryLoading ? 'animate-spin' : ''}`} />
                Query FTS5
              </button>
            </form>

            <div className="flex items-center gap-3">
              {lastSyncInfo && (
                <span className="text-[11px] font-mono text-emerald-300/90 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-400/25">
                  {lastSyncInfo.count} nodes synced
                </span>
              )}
              <button
                type="button"
                onClick={() => void handleSyncMemory()}
                disabled={syncingMemory || workspaceMode === 'SILENT'}
                title={
                  workspaceMode === 'SILENT'
                    ? 'Cloud/edge sync disabled in SILENT mode'
                    : 'Checkpoint SQLite WAL & sync edge mesh'
                }
                className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-45"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${syncingMemory ? 'animate-pulse' : ''}`} />
                {syncingMemory ? 'Syncing...' : 'Sync WAL'}
              </button>
            </div>
          </div>

          {memoryError && (
            <div className="rounded-xl p-4 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{memoryError}</span>
            </div>
          )}

          {/* Split Workspace: Nodes List + Detail/Create */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Memory Nodes */}
            <div className="lg:col-span-7 aether-glass rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Indexed Memory Nodes
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  {memories.length} {memories.length === 1 ? 'node' : 'nodes'}
                </span>
              </div>

              {memories.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400">
                  {memoryLoading
                    ? 'Querying FTS5 index...'
                    : 'No memory nodes matched. Create one on the right or broaden your FTS5 query.'}
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {memories.map((node) => {
                    const isSelected = node.id === selectedMemoryId;
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedMemoryId(node.id)}
                        className={`rounded-xl p-4 border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-cyan-500/10 border-cyan-400/45'
                            : 'bg-[#050a14]/70 border-slate-800/80 hover:border-cyan-400/25'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-slate-100 truncate">
                                {node.title}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-400/25">
                                {node.namespace || 'DEV'}
                              </span>
                              {typeof node.score === 'number' && (
                                <span className="text-[10px] font-mono text-emerald-300">
                                  BM25 {node.score.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 whitespace-pre-wrap">
                              {node.content}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-slate-500">
                              <Clock className="w-3 h-3" />
                              <span>{formatTimestamp(node.updated_at)}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteMemory(node.id);
                            }}
                            disabled={deletingMemoryId === node.id}
                            aria-label={`Delete ${node.title}`}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-400/30 transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedMemory && (
                <div className="mt-2 pt-4 border-t border-slate-800/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-300">
                      Node Inspector • {selectedMemory.id}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {selectedMemory.namespace}
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#050a14]/90 border border-slate-800 p-3.5 text-xs text-slate-200 whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed">
                    {selectedMemory.content}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Store New Memory */}
            <form
              onSubmit={(e) => void handleCreateMemory(e)}
              className="lg:col-span-5 aether-bracket-card rounded-2xl p-5 flex flex-col gap-4"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Store Memory Node</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Persists directly into SQLite WAL FTS5 index.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">Title</label>
                <input
                  type="text"
                  value={newMemTitle}
                  onChange={(e) => setNewMemTitle(e.target.value)}
                  placeholder="e.g., Distributed Raft Invariants"
                  className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">Namespace</label>
                <select
                  value={newMemNamespace}
                  onChange={(e) => setNewMemNamespace(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 focus:outline-none focus:border-cyan-400/60"
                >
                  {NAMESPACES.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">Content</label>
                <textarea
                  rows={6}
                  value={newMemContent}
                  onChange={(e) => setNewMemContent(e.target.value)}
                  placeholder="Write architectural context, study notes, or invariants..."
                  className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 resize-y"
                />
              </div>

              <button
                type="submit"
                disabled={creatingMemory}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-cyan-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creatingMemory ? 'Committing to WAL...' : 'Commit Memory Node'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: SCHOLAR ARXIV SEARCH & SYNTHESIS */}
      {activeTab === 'scholar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: ArXiv & Local Literature Search */}
          <div className="lg:col-span-6 aether-glass rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Literature Retrieval (arXiv + Sovereign DB)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Queries local FTS5 scholar context and live arXiv preprints.
              </p>
            </div>

            <form onSubmit={(e) => void handleScholarSearch(e)} className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-cyan-400/70 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={paperQuery}
                  onChange={(e) => setPaperQuery(e.target.value)}
                  placeholder="Search arXiv (e.g., speculative decoding, multi-agent systems)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </div>
              <button
                type="submit"
                disabled={searchingPapers}
                className="px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${searchingPapers ? 'animate-spin' : ''}`} />
                Search
              </button>
            </form>

            {paperError && (
              <div className="rounded-xl p-3.5 bg-rose-500/10 border border-rose-400/30 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paperError}</span>
              </div>
            )}

            <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto pr-1">
              {papers.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400 px-4">
                  {searchingPapers
                    ? 'Querying arXiv Atom feed & sovereign FTS5 store...'
                    : 'Run a search query above to retrieve papers and local scholar entries.'}
                </div>
              ) : (
                papers.map((paper) => {
                  const externalUrl =
                    paper.link || (paper.id?.startsWith('http') ? paper.id : '');
                  const abstractText = paper.abstract || paper.summary || '';
                  return (
                    <div
                      key={paper.id}
                      className="rounded-xl p-4 bg-[#050a14]/75 border border-slate-800/80 hover:border-cyan-400/30 transition-colors flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-sm font-medium text-slate-100 leading-snug">
                          {paper.title}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase shrink-0 border ${
                            paper.is_local
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                              : 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
                          }`}
                        >
                          {paper.is_local ? 'LOCAL' : 'arXiv'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{paper.authors?.slice(0, 3).join(', ') || 'Unknown Authors'}</span>
                        <span className="font-mono text-slate-500">• {paper.year}</span>
                        {(paper.venue || paper.category) && (
                          <span className="font-mono text-cyan-300/80">
                            • {paper.venue || paper.category}
                          </span>
                        )}
                      </div>

                      {abstractText && (
                        <p className="text-xs text-slate-300/90 leading-relaxed line-clamp-4">
                          {abstractText}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAttachPaperToSynthesis(paper)}
                            className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-[11px] font-medium transition-colors"
                          >
                            Use in Synthesis
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSavePaperToMemory(paper)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[11px] font-medium transition-colors"
                          >
                            Save to Memory
                          </button>
                        </div>

                        {externalUrl && (
                          <a
                            href={externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1"
                          >
                            Source <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Knowledge Synthesis */}
          <div className="lg:col-span-6 aether-bracket-card rounded-2xl p-5 flex flex-col gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Knowledge Synthesis</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generates structured technical research briefs via LLMRouter.
              </p>
            </div>

            <form onSubmit={(e) => void handleSynthesize(e)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">Research Topic</label>
                <input
                  type="text"
                  value={synthTopic}
                  onChange={(e) => setSynthTopic(e.target.value)}
                  placeholder="e.g., Hybrid FTS5 + Vector Retrieval Trade-offs"
                  className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Reference Context &amp; Abstracts
                </label>
                <textarea
                  rows={5}
                  value={synthNotes}
                  onChange={(e) => setSynthNotes(e.target.value)}
                  placeholder="Paste notes or click 'Use in Synthesis' on retrieved papers..."
                  className="px-3.5 py-2.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 resize-y"
                />
              </div>

              <button
                type="submit"
                disabled={synthesizing}
                className="py-2.5 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${synthesizing ? 'animate-spin' : ''}`} />
                {synthesizing ? 'Synthesizing Brief...' : 'Synthesize Research Brief'}
              </button>
            </form>

            {synthesisResult && (
              <div className="mt-2 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    {synthesisResult.provider && (
                      <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                        {synthesisResult.provider}
                      </span>
                    )}
                    {synthesisResult.model && (
                      <span className="text-slate-400">{synthesisResult.model}</span>
                    )}
                    {typeof synthesisResult.latencyMs === 'number' && (
                      <span className="text-emerald-300">
                        {Math.round(synthesisResult.latencyMs)}ms
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSaveSynthesisToMemory()}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-[11px] font-medium flex items-center gap-1.5"
                    >
                      <Database className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopySynthesis()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1.5"
                    >
                      {copiedSynth ? (
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
                </div>

                <div className="rounded-xl bg-[#050a14]/90 border border-slate-800 p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-y-auto font-mono">
                  {synthesisResult.text}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SOVEREIGN NOTES */}
      {activeTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Notes Sidebar */}
          <div className="lg:col-span-4 aether-glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Local Sovereign Notes</h2>
              <button
                type="button"
                onClick={handleCreateNote}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Note
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-700/60 rounded-xl text-xs text-slate-400 px-4">
                No local notes yet. Click &ldquo;New Note&rdquo; to draft locally and sync to FTS5.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[480px] overflow-y-auto pr-1">
                {notes.map((note) => {
                  const selected = note.id === activeNoteId;
                  return (
                    <div
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      className={`rounded-xl p-3.5 border cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        selected
                          ? 'bg-cyan-500/12 border-cyan-400/45'
                          : 'bg-[#050a14]/75 border-slate-800/80 hover:border-cyan-400/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-100 truncate">
                          {note.title || 'Untitled Note'}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-500">
                          <span className="text-cyan-300/80">{note.namespace}</span>
                          <span>• {formatTimestamp(note.updatedAt)}</span>
                          {note.lastSyncedAt && (
                            <span className="text-emerald-300">• FTS5 Synced</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNote(note.id);
                        }}
                        aria-label={`Delete ${note.title}`}
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

          {/* Note Editor */}
          <div className="lg:col-span-8 aether-bracket-card rounded-2xl p-6 flex flex-col gap-4">
            {activeNote ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={activeNote.title}
                      onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                      placeholder="Note title..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm font-medium text-slate-100 focus:outline-none focus:border-cyan-400/60"
                    />
                    <select
                      value={activeNote.namespace}
                      onChange={(e) => updateNote(activeNote.id, { namespace: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400/60"
                    >
                      {NAMESPACES.map((ns) => (
                        <option key={ns} value={ns}>
                          {ns}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCommitNoteToMemory()}
                    disabled={committingNote}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {committingNote ? 'Committing...' : 'Commit to FTS5 Memory'}
                  </button>
                </div>

                <textarea
                  rows={14}
                  value={activeNote.content}
                  onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                  placeholder="Write sovereign notes here — auto-saved to localStorage and ready to commit into SQLite WAL..."
                  className="w-full px-4 py-3.5 rounded-xl bg-[#050a14]/90 border border-slate-700/60 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 leading-relaxed resize-y"
                />

                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Auto-saved to localStorage ({activeNote.content.length} chars)</span>
                  {activeNote.lastSyncedAt ? (
                    <span className="text-emerald-300">
                      Last committed to SQLite WAL: {formatTimestamp(activeNote.lastSyncedAt)}
                    </span>
                  ) : (
                    <span>Local-only draft</span>
                  )}
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
                <StickyNote className="w-8 h-8 text-cyan-400/40" />
                <p>Select a note or create a new Sovereign Note to begin.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ScholarView;
