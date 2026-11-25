import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  Database,
  ExternalLink,
  FileText,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { MemoryNode } from '@/types';

type ScholarTab = 'memory' | 'arxiv' | 'notes';

interface MemoryListResponse {
  success?: boolean;
  memories?: MemoryNode[];
  error?: string;
}

interface MemorySearchResponse {
  success?: boolean;
  query?: string;
  results?: MemoryNode[];
  count?: number;
  error?: string;
}

interface MemoryStoreResponse {
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
  namespace: string;
  content: string;
  updatedAt: string;
  syncedMemoryId?: string;
}

const NOTES_STORAGE_KEY = 'nexus_v1_sovereign_notes';

function formatTimestamp(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return 'Recent';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const str = String(raw).trim();
  const asNum = Number(str);
  if (str && !Number.isNaN(asNum)) {
    const ms = asNum < 1e12 ? asNum * 1000 : asNum;
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return str;
}

function readStoredNotes(): SovereignNote[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SovereignNote =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as SovereignNote).id === 'string' &&
        typeof (item as SovereignNote).title === 'string'
    );
  } catch {
    return [];
  }
}

function writeStoredNotes(notes: SovereignNote[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Ignore storage quota errors in constrained contexts
  }
}

export function ScholarView() {
  const { telemetry, pushToast } = useNexusStore();
  const [activeTab, setActiveTab] = useState<ScholarTab>('memory');

  // Semantic FTS5 Memory state
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);
  const [syncingMemory, setSyncingMemory] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<{
    nodes: number;
    target: string;
    at: string;
  } | null>(null);

  // Store Memory Form state
  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemNamespace, setNewMemNamespace] = useState('scholar_context');
  const [newMemTags, setNewMemTags] = useState('');
  const [newMemContent, setNewMemContent] = useState('');
  const [savingMemory, setSavingMemory] = useState(false);

  // Scholar / ArXiv Search & Synthesis state
  const [scholarQuery, setScholarQuery] = useState('');
  const [papers, setPapers] = useState<ScholarPaper[]>([]);
  const [scholarLoading, setScholarLoading] = useState(false);
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);

  const [synthTopic, setSynthTopic] = useState('');
  const [synthNotes, setSynthNotes] = useState('');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthResult, setSynthResult] = useState<{
    text: string;
    provider?: string;
    model?: string;
    latencyMs?: number;
  } | null>(null);
  const [copiedSynth, setCopiedSynth] = useState(false);
  const [savingSynth, setSavingSynth] = useState(false);

  // Sovereign Notes state (localStorage + SQLite memory store)
  const [notes, setNotes] = useState<SovereignNote[]>(() => {
    const initial = readStoredNotes();
    if (initial.length > 0) return initial;
    return [
      {
        id: `note-${Date.now()}`,
        title: 'Research Scratchpad',
        namespace: 'scholar_context',
        content: '',
        updatedAt: new Date().toISOString(),
      },
    ];
  });
  const [activeNoteId, setActiveNoteId] = useState<string>(() => notes[0]?.id ?? '');
  const [committingNote, setCommittingNote] = useState(false);
  const [pullingMemoryNotes, setPullingMemoryNotes] = useState(false);

  useEffect(() => {
    writeStoredNotes(notes);
  }, [notes]);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? notes[0] ?? null;

  const loadMemories = useCallback(
    async (queryOverride?: string) => {
      const q = (queryOverride ?? memoryQuery).trim();
      setMemoryLoading(true);
      try {
        if (q) {
          const res = await ipcJson<MemorySearchResponse>(
            `/api/memory/search?q=${encodeURIComponent(q)}&limit=30`
          );
          if (res.success === false) {
            pushToast({
              title: 'Memory Search Failed',
              message: res.error ?? 'Unable to query FTS5 index.',
              tone: 'error',
            });
            return;
          }
          setMemories(Array.isArray(res.results) ? res.results : []);
        } else {
          const res = await ipcJson<MemoryListResponse>('/api/memory?limit=40');
          if (res.success === false) {
            pushToast({
              title: 'Memory Fetch Failed',
              message: res.error ?? 'Unable to load SQLite memory nodes.',
              tone: 'error',
            });
            return;
          }
          setMemories(Array.isArray(res.memories) ? res.memories : []);
        }
      } catch (err) {
        pushToast({
          title: 'Memory Store Offline',
          message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
          tone: 'error',
        });
      } finally {
        setMemoryLoading(false);
      }
    },
    [memoryQuery, pushToast]
  );

  useEffect(() => {
    void loadMemories('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchMemory = (e: React.FormEvent) => {
    e.preventDefault();
    void loadMemories(memoryQuery);
  };

  const handleStoreMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newMemTitle.trim();
    const content = newMemContent.trim();
    const namespace = newMemNamespace.trim() || 'scholar_context';
    if (!title || !content || savingMemory) return;

    const tags = newMemTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSavingMemory(true);
    try {
      const res = await ipcJson<MemoryStoreResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace,
          metadata: tags.length > 0 ? { tags } : {},
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Memory Store Rejected',
          message: res.error ?? 'Unable to persist memory node.',
          tone: 'error',
        });
        return;
      }
      setNewMemTitle('');
      setNewMemContent('');
      setNewMemTags('');
      pushToast({
        title: 'Memory Node Stored',
        message: `${title} (${namespace})`,
        tone: 'success',
      });
      await loadMemories(memoryQuery);
    } catch (err) {
      pushToast({
        title: 'Memory Store Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (nodeId: string) => {
    if (!nodeId || deletingMemoryId) return;
    setDeletingMemoryId(nodeId);
    try {
      const res = await ipcJson<{ success?: boolean; id?: string; error?: string }>(
        `/api/memory/${encodeURIComponent(nodeId)}`,
        { method: 'DELETE' }
      );
      if (res.success === false) {
        pushToast({
          title: 'Delete Failed',
          message: res.error ?? `Unable to delete node ${nodeId}`,
          tone: 'error',
        });
        return;
      }
      setMemories((prev) => prev.filter((item) => item.id !== nodeId));
      pushToast({
        title: 'Memory Node Deleted',
        message: nodeId,
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Delete Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setDeletingMemoryId(null);
    }
  };

  const handleSyncMemory = async () => {
    if (syncingMemory) return;
    setSyncingMemory(true);
    try {
      const res = await ipcJson<MemorySyncResponse>('/api/memory/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.success === false) {
        pushToast({
          title: 'WAL Sync Blocked',
          message: res.error ?? 'Memory sync rejected.',
          tone: 'warning',
        });
        return;
      }
      const count = res.synced_nodes ?? memories.length;
      const target = res.target ?? 'sqlite_wal_edge_ready';
      setLastSyncInfo({
        nodes: count,
        target,
        at: formatTimestamp(res.timestamp ?? Date.now()),
      });
      pushToast({
        title: 'Memory WAL Checkpointed',
        message: `${count} nodes ready (${target})`,
        tone: 'success',
      });
      void loadMemories(memoryQuery);
    } catch (err) {
      pushToast({
        title: 'Sync Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory/sync',
        tone: 'error',
      });
    } finally {
      setSyncingMemory(false);
    }
  };

  const handleScholarSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = scholarQuery.trim();
    if (!cleanQ || scholarLoading) return;
    setScholarLoading(true);
    try {
      const res = await ipcJson<ScholarSearchResponse>(
        `/api/scholar/search?query=${encodeURIComponent(cleanQ)}&limit=10`
      );
      if (res.success === false) {
        pushToast({
          title: 'Scholar Search Failed',
          message: res.error ?? 'Unable to query ArXiv / scholar index.',
          tone: 'error',
        });
        return;
      }
      const list = Array.isArray(res.papers)
        ? res.papers
        : Array.isArray(res.results)
          ? res.results
          : [];
      setPapers(list);
      if (!synthTopic.trim()) {
        setSynthTopic(cleanQ);
      }
    } catch (err) {
      pushToast({
        title: 'Scholar Search Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/scholar/search',
        tone: 'error',
      });
    } finally {
      setScholarLoading(false);
    }
  };

  const handleAppendPaperToSynthesis = (paper: ScholarPaper) => {
    const authorsStr = Array.isArray(paper.authors) ? paper.authors.join(', ') : 'Unknown';
    const summaryText = (paper.summary ?? paper.abstract ?? '').trim();
    const snippet = `[${paper.title}] (${authorsStr}, ${paper.year ?? 'n.d.'})\n${summaryText}`;
    setSynthNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet));
    if (!synthTopic.trim()) {
      setSynthTopic(paper.title);
    }
    pushToast({
      title: 'Added to Synthesis Context',
      message: paper.title,
      tone: 'info',
    });
  };

  const handleSavePaperToMemory = async (paper: ScholarPaper) => {
    if (savingPaperId) return;
    setSavingPaperId(paper.id);
    try {
      const authorsStr = Array.isArray(paper.authors) ? paper.authors.join(', ') : '';
      const summaryText = (paper.summary ?? paper.abstract ?? '').trim();
      const content = `${authorsStr ? `Authors: ${authorsStr}\n` : ''}${paper.venue ? `Venue: ${paper.venue}\n` : ''}${paper.link ? `Source: ${paper.link}\n\n` : '\n'}${summaryText}`;
      const res = await ipcJson<MemoryStoreResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: paper.title,
          content: content.trim(),
          namespace: 'scholar_context',
          metadata: {
            source: paper.is_local ? 'sovereign' : 'arxiv',
            year: paper.year,
            link: paper.link ?? '',
          },
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Save Failed',
          message: res.error ?? 'Could not store paper in memory.',
          tone: 'error',
        });
        return;
      }
      pushToast({
        title: 'Paper Saved to Memory',
        message: paper.title,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Save Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setSavingPaperId(null);
    }
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = synthTopic.trim();
    if (!topic || synthesizing) return;
    setSynthesizing(true);
    setCopiedSynth(false);
    try {
      const res = await ipcJson<ScholarSynthesizeResponse>('/api/scholar/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          notes: synthNotes.trim(),
        }),
      });
      if (res.success === false || !res.synthesis) {
        pushToast({
          title: 'Synthesis Failed',
          message: res.error ?? 'Router could not synthesize topic.',
          tone: 'error',
        });
        return;
      }
      setSynthResult({
        text: res.synthesis,
        provider: res.provider,
        model: res.model,
        latencyMs: res.latency_ms,
      });
    } catch (err) {
      pushToast({
        title: 'Synthesis Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/scholar/synthesize',
        tone: 'error',
      });
    } finally {
      setSynthesizing(false);
    }
  };

  const handleCopySynthesis = async () => {
    if (!synthResult?.text) return;
    try {
      await navigator.clipboard.writeText(synthResult.text);
      setCopiedSynth(true);
    } catch {
      pushToast({ title: 'Clipboard Unavailable', tone: 'warning' });
    }
  };

  const handleSaveSynthesisToMemory = async () => {
    if (!synthResult?.text || savingSynth) return;
    setSavingSynth(true);
    try {
      const title = `Synthesis: ${synthTopic.trim() || 'Research Brief'}`;
      const res = await ipcJson<MemoryStoreResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content: synthResult.text,
          namespace: 'scholar_context',
          metadata: {
            provider: synthResult.provider ?? 'local',
            model: synthResult.model ?? '',
          },
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Memory Save Failed',
          message: res.error ?? 'Unable to commit synthesis.',
          tone: 'error',
        });
        return;
      }
      pushToast({
        title: 'Synthesis Saved to FTS5 Memory',
        message: title,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Save Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setSavingSynth(false);
    }
  };

  // Sovereign Notes handlers
  const handleCreateNote = () => {
    const fresh: SovereignNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Sovereign Note ${notes.length + 1}`,
      namespace: 'scholar_context',
      content: '',
      updatedAt: new Date().toISOString(),
    };
    setNotes((prev) => [fresh, ...prev]);
    setActiveNoteId(fresh.id);
  };

  const handleUpdateActiveNote = (patch: Partial<SovereignNote>) => {
    if (!activeNote) return;
    const nowIso = new Date().toISOString();
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNote.id ? { ...n, ...patch, updatedAt: nowIso } : n))
    );
  };

  const handleDeleteNote = (noteId: string) => {
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== noteId);
      if (remaining.length === 0) {
        const blank: SovereignNote = {
          id: `note-${Date.now()}`,
          title: 'Research Scratchpad',
          namespace: 'scholar_context',
          content: '',
          updatedAt: new Date().toISOString(),
        };
        setActiveNoteId(blank.id);
        return [blank];
      }
      if (activeNoteId === noteId) {
        setActiveNoteId(remaining[0].id);
      }
      return remaining;
    });
    pushToast({ title: 'Local Note Removed', tone: 'info' });
  };

  const handleCommitNoteToMemory = async () => {
    if (!activeNote || committingNote) return;
    const title = activeNote.title.trim();
    const content = activeNote.content.trim();
    if (!title || !content) {
      pushToast({
        title: 'Empty Note',
        message: 'Provide both a title and note content before committing to memory.',
        tone: 'warning',
      });
      return;
    }
    setCommittingNote(true);
    try {
      const res = await ipcJson<MemoryStoreResponse>('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          namespace: activeNote.namespace || 'scholar_context',
          metadata: { source: 'sovereign_notes', local_note_id: activeNote.id },
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Memory Commit Failed',
          message: res.error ?? 'Unable to save note to SQLite memory.',
          tone: 'error',
        });
        return;
      }
      handleUpdateActiveNote({ syncedMemoryId: res.id });
      pushToast({
        title: 'Note Committed to Memory Store',
        message: `${title} (${res.id ?? 'indexed'})`,
        tone: 'success',
      });
      void loadMemories('');
    } catch (err) {
      pushToast({
        title: 'Commit Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setCommittingNote(false);
    }
  };

  const handlePullNotesFromMemory = async () => {
    if (pullingMemoryNotes) return;
    setPullingMemoryNotes(true);
    try {
      const res = await ipcJson<MemoryListResponse>(
        '/api/memory?namespace=scholar_context&limit=20'
      );
      if (res.success === false) {
        pushToast({
          title: 'Pull Failed',
          message: res.error ?? 'Could not fetch scholar_context memories.',
          tone: 'error',
        });
        return;
      }
      const remote = Array.isArray(res.memories) ? res.memories : [];
      if (remote.length === 0) {
        pushToast({
          title: 'No Scholar Notes Found',
          message: 'Namespace scholar_context is currently empty.',
          tone: 'info',
        });
        return;
      }
      setNotes((prev) => {
        const existingMemIds = new Set(prev.map((n) => n.syncedMemoryId).filter(Boolean));
        const additions: SovereignNote[] = remote
          .filter((m) => !existingMemIds.has(m.id))
          .map((m) => ({
            id: `mem-note-${m.id}`,
            title: m.title,
            namespace: m.namespace || 'scholar_context',
            content: m.content,
            updatedAt: new Date().toISOString(),
            syncedMemoryId: m.id,
          }));
        if (additions.length === 0) return prev;
        return [...additions, ...prev];
      });
      pushToast({
        title: 'Imported Memory Notes',
        message: `Synced ${remote.length} scholar_context entries.`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Pull Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/memory',
        tone: 'error',
      });
    } finally {
      setPullingMemoryNotes(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-obsidian-fade overflow-hidden">
      {/* Calm Header & Sub-Tab Switcher */}
      <header className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-6 shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Obsidian Knowledge Architecture</span>
            {telemetry.workspaceMode === 'SILENT' && (
              <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">
                AIR-GAPPED
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text)]">
            Scholar, FTS5 Memory &amp; Sovereign Notes
          </h1>
        </div>

        <nav
          aria-label="Scholar sections"
          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] p-1 gap-1"
        >
          {(
            [
              { id: 'memory', label: 'Semantic Memory', icon: Database },
              { id: 'arxiv', label: 'ArXiv & Synthesis', icon: Sparkles },
              { id: 'notes', label: 'Sovereign Notes', icon: NotebookPen },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* TAB 1: Semantic FTS5 Memory */}
      {activeTab === 'memory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left: Search & Memory Nodes */}
          <section className="lg:col-span-7 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  FTS5 Semantic Store ({memories.length})
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  SQLite WAL full-text BM25 retrieval across sovereign namespaces.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSyncMemory()}
                disabled={syncingMemory}
                className="px-3.5 py-2 rounded-lg border border-[var(--border)] hover:border-emerald-500/45 bg-[var(--panel-muted)] text-xs font-medium text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingMemory ? 'animate-spin' : ''}`} />
                {syncingMemory ? 'Syncing WAL...' : 'Sync WAL'}
              </button>
            </div>

            <form onSubmit={handleSearchMemory} className="flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memoryQuery}
                  onChange={(e) => setMemoryQuery(e.target.value)}
                  placeholder="Search FTS5 memory (leave empty to list recent)..."
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={memoryLoading}
                className="px-4 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors shrink-0"
              >
                {memoryLoading ? 'Querying...' : 'Search'}
              </button>
            </form>

            {lastSyncInfo && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5 text-xs font-mono text-emerald-300 flex items-center justify-between gap-4 shrink-0">
                <span>
                  WAL Checkpointed · {lastSyncInfo.nodes} nodes · {lastSyncInfo.target}
                </span>
                <span className="text-[var(--text-muted)]">{lastSyncInfo.at}</span>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {memories.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  {memoryLoading
                    ? 'Querying ~/.nexus-agent/db/agent_local.db...'
                    : 'No memory nodes matched your query.'}
                </div>
              ) : (
                memories.map((node) => (
                  <article
                    key={node.id}
                    className="rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border)] bg-[var(--panel-muted)] p-4 flex flex-col gap-2.5 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                            {node.namespace || 'default'}
                          </span>
                          {typeof node.score === 'number' && (
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              BM25 {node.score.toFixed(2)}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-[var(--text-muted)]">
                            {formatTimestamp(node.updated_at)}
                          </span>
                        </div>
                        <h3 className="text-sm font-medium text-[var(--text)] truncate">
                          {node.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleDeleteMemory(node.id)}
                        disabled={deletingMemoryId === node.id}
                        title="Delete memory node"
                        className="p-2 rounded-lg border border-[var(--border-subtle)] hover:border-red-500/40 hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-300 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed line-clamp-5">
                      {node.content}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Right: Store Memory Node */}
          <section className="lg:col-span-5 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Store Memory Node</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Index knowledge directly into FTS5 + SQLite WAL.
              </p>
            </div>

            <form onSubmit={handleStoreMemory} className="flex flex-col gap-4 flex-1">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Title
                </label>
                <input
                  type="text"
                  required
                  value={newMemTitle}
                  onChange={(e) => setNewMemTitle(e.target.value)}
                  placeholder="e.g., SQLite WAL Concurrency Invariant"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Namespace
                  </label>
                  <select
                    value={newMemNamespace}
                    onChange={(e) => setNewMemNamespace(e.target.value)}
                    className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2.5 text-xs font-mono text-[var(--text)] outline-none"
                  >
                    <option value="scholar_context">scholar_context</option>
                    <option value="dev">dev</option>
                    <option value="architecture">architecture</option>
                    <option value="study">study</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                    Tags (Optional)
                  </label>
                  <input
                    type="text"
                    value={newMemTags}
                    onChange={(e) => setNewMemTags(e.target.value)}
                    placeholder="fts5, sqlite, architecture"
                    className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2.5 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5 flex-1 flex flex-col min-h-[180px]">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Content
                </label>
                <textarea
                  required
                  value={newMemContent}
                  onChange={(e) => setNewMemContent(e.target.value)}
                  placeholder="Capture technical insight, citation summary, or verified architecture decision..."
                  className="flex-1 min-h-[160px] resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-3 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={savingMemory || !newMemTitle.trim() || !newMemContent.trim()}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {savingMemory ? 'Committing...' : 'Commit Memory Node'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 2: ArXiv & Synthesis */}
      {activeTab === 'arxiv' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left: Scholar / ArXiv Search */}
          <section className="lg:col-span-6 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">
                ArXiv &amp; Local Literature Search
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Blends local scholar_context FTS5 hits with live arXiv preprints.
              </p>
            </div>

            <form onSubmit={handleScholarSearch} className="flex items-center gap-3 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={scholarQuery}
                  onChange={(e) => setScholarQuery(e.target.value)}
                  placeholder="Query arXiv or sovereign scholar index..."
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={scholarLoading || !scholarQuery.trim()}
                className="px-4 py-2.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors shrink-0"
              >
                {scholarLoading ? 'Searching...' : 'Search'}
              </button>
            </form>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {papers.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-8 text-center text-xs font-mono text-[var(--text-muted)]">
                  {scholarLoading
                    ? 'Querying arXiv & local scholar_context...'
                    : 'Enter a topic above to retrieve arXiv papers and local dossiers.'}
                </div>
              ) : (
                papers.map((paper) => {
                  const abstractText = paper.summary ?? paper.abstract ?? '';
                  return (
                    <article
                      key={paper.id}
                      className="rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border)] bg-[var(--panel-muted)] p-4 flex flex-col gap-3 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${
                                paper.is_local
                                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                                  : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)]'
                              }`}
                            >
                              {paper.venue ?? (paper.is_local ? 'Sovereign' : 'arXiv')}
                            </span>
                            {paper.year && (
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                {paper.year}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-medium text-[var(--text)] leading-snug">
                            {paper.title}
                          </h3>
                          {Array.isArray(paper.authors) && paper.authors.length > 0 && (
                            <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1 truncate">
                              {paper.authors.join(', ')}
                            </p>
                          )}
                        </div>

                        {paper.link && (
                          <a
                            href={paper.link}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-md border border-[var(--border-subtle)] hover:border-emerald-500/40 text-[var(--text-muted)] hover:text-emerald-300 transition-colors shrink-0"
                            title="Open paper URL"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {abstractText && (
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-4">
                          {abstractText}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleAppendPaperToSynthesis(paper)}
                          className="px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors"
                        >
                          Use in Synthesis
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSavePaperToMemory(paper)}
                          disabled={savingPaperId === paper.id}
                          className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:border-[var(--border-accent)] text-[var(--text-secondary)] hover:text-[var(--text)] text-xs font-medium transition-colors"
                        >
                          {savingPaperId === paper.id ? 'Saving...' : 'Save to Memory'}
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {/* Right: Synthesis Engine */}
          <section className="lg:col-span-6 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-y-auto">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Research Synthesis Engine
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Generates structured technical briefs via LLMRouter from your curated context.
              </p>
            </div>

            <form onSubmit={handleSynthesize} className="flex flex-col gap-4 shrink-0">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Research Topic
                </label>
                <input
                  type="text"
                  required
                  value={synthTopic}
                  onChange={(e) => setSynthTopic(e.target.value)}
                  placeholder="e.g., Hybrid FTS5 + Vector Retrieval for Local Agents"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                  Reference Context &amp; Notes
                </label>
                <textarea
                  rows={5}
                  value={synthNotes}
                  onChange={(e) => setSynthNotes(e.target.value)}
                  placeholder="Paste abstracts, select papers from the left pane, or outline constraints..."
                  className="w-full resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-3 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={synthesizing || !synthTopic.trim()}
                className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {synthesizing ? 'Synthesizing Brief...' : 'Synthesize Research Brief'}
              </button>
            </form>

            {synthResult && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-muted)] p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                    <span className="text-emerald-300 font-medium">SYNTHESIS BRIEF</span>
                    {synthResult.provider && <span>· {synthResult.provider}</span>}
                    {synthResult.model && <span>· {synthResult.model}</span>}
                    {typeof synthResult.latencyMs === 'number' && synthResult.latencyMs > 0 && (
                      <span>· {Math.round(synthResult.latencyMs)} ms</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopySynthesis()}
                      className="px-2.5 py-1 rounded border border-[var(--border)] hover:border-emerald-500/40 text-xs text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
                    >
                      {copiedSynth ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveSynthesisToMemory()}
                      disabled={savingSynth}
                      className="px-2.5 py-1 rounded border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs text-emerald-300 transition-colors"
                    >
                      {savingSynth ? 'Saving...' : 'Save to Memory'}
                    </button>
                  </div>
                </div>

                <div className="text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed font-sans">
                  {synthResult.text}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: Sovereign Notes */}
      {activeTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left: Local Notes Index */}
          <aside className="lg:col-span-4 obsidian-panel rounded-xl p-6 flex flex-col gap-4 min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <h2 className="text-sm font-semibold text-[var(--text)]">
                Local Notes ({notes.length})
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handlePullNotesFromMemory()}
                  disabled={pullingMemoryNotes}
                  title="Import scholar_context entries from SQLite memory"
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] hover:border-emerald-500/40 text-[11px] font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors"
                >
                  {pullingMemoryNotes ? 'Pulling...' : 'Pull Memory'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
              {notes.map((note) => {
                const selected = activeNote?.id === note.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setActiveNoteId(note.id)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-colors flex flex-col gap-1.5 ${
                      selected
                        ? 'border-emerald-500/45 bg-emerald-500/10'
                        : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--text)] truncate flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        {note.title || 'Untitled Note'}
                      </span>
                      {note.syncedMemoryId && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-mono shrink-0">
                          FTS5
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-muted)]">
                      <span>{note.namespace}</span>
                      <span>{formatTimestamp(note.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right: Sovereign Note Editor */}
          <section className="lg:col-span-8 obsidian-panel rounded-xl p-6 flex flex-col gap-5 min-h-0 overflow-hidden">
            {activeNote ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
                  <div className="flex-1 min-w-[220px]">
                    <input
                      type="text"
                      value={activeNote.title}
                      onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                      placeholder="Note title..."
                      className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
                    />
                  </div>

                  <select
                    value={activeNote.namespace}
                    onChange={(e) => handleUpdateActiveNote({ namespace: e.target.value })}
                    aria-label="Note memory namespace"
                    className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2.5 text-xs font-mono text-[var(--text)] outline-none"
                  >
                    <option value="scholar_context">scholar_context</option>
                    <option value="notes">notes</option>
                    <option value="dev">dev</option>
                    <option value="architecture">architecture</option>
                  </select>
                </div>

                <textarea
                  value={activeNote.content}
                  onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                  placeholder="Write sovereign notes here — automatically persisted to localStorage and ready to commit into SQLite FTS5 memory..."
                  className="flex-1 min-h-0 resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-xl p-5 text-sm font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none leading-relaxed"
                />

                <div className="flex flex-wrap items-center justify-between gap-4 pt-1 shrink-0">
                  <div className="text-xs font-mono text-[var(--text-muted)]">
                    Auto-saved locally · {activeNote.content.length} chars
                    {activeNote.syncedMemoryId ? ` · Memory ID ${activeNote.syncedMemoryId}` : ''}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(activeNote.id)}
                      className="px-3.5 py-2 rounded-lg border border-[var(--border)] hover:border-red-500/40 hover:bg-red-500/10 text-xs font-medium text-[var(--text-secondary)] hover:text-red-300 transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCommitNoteToMemory()}
                      disabled={committingNote || !activeNote.content.trim()}
                      className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-xs font-medium transition-colors flex items-center gap-2"
                    >
                      <Database className="w-3.5 h-3.5" />
                      {committingNote ? 'Committing...' : 'Save to Memory Store'}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

export default ScholarView;
