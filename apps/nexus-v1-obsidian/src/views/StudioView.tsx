import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  FileCode2,
  Folder,
  GitBranch,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

interface FsTreeItem {
  name: string;
  path: string;
  abs_path?: string;
  is_dir: boolean;
  size: number;
  ext: string;
}

interface FsTreeResponse {
  success?: boolean;
  root?: string;
  items?: FsTreeItem[];
  files?: FsTreeItem[];
  error?: string;
}

interface FsReadResponse {
  success?: boolean;
  path?: string;
  name?: string;
  size?: number;
  content?: string;
  error?: string;
}

interface FsWriteResponse {
  success?: boolean;
  path?: string;
  bytes_written?: number;
  error?: string;
}

interface GitStatusResponse {
  success?: boolean;
  branch?: string;
  clean?: boolean;
  staged_count?: number;
  modified_count?: number;
  untracked_count?: number;
  total_changes?: number;
  status_lines?: string[];
  error?: string;
}

interface ExecVerifyResponse {
  success?: boolean;
  command?: string;
  exit_code?: number;
  returncode?: number;
  stdout?: string;
  stderr?: string;
  duration_ms?: number;
  error?: string;
}

interface ShieldFinding {
  severity?: string;
  category?: string;
  message?: string;
  line?: number;
  snippet?: string;
  invariant?: string;
}

interface ShieldScanResponse {
  success?: boolean;
  safe?: boolean;
  score?: number;
  risk_score?: number;
  status?: string;
  findings?: ShieldFinding[];
  source?: string;
  error?: string;
}

interface ContextKeeperItem {
  project_name?: string;
  project_path?: string;
  branch?: string;
  goal?: string;
  left_off?: string;
  next_steps?: string[];
  updated_at?: string;
}

interface ContextKeeperStatusResponse {
  success?: boolean;
  active?: boolean;
  count?: number;
  contexts?: ContextKeeperItem[];
  error?: string;
}

interface SliceDispatchResponse {
  success?: boolean;
  slice_id?: string;
  agent_id?: string;
  error?: string;
}

interface OpenBuffer {
  path: string;
  name: string;
  originalContent: string;
  content: string;
  loading: boolean;
  saving: boolean;
}

type DrawerTab = 'verify' | 'shield' | 'context';

export function StudioView() {
  const { pushToast, refreshAll } = useNexusStore();

  // File tree navigation
  const [currentDir, setCurrentDir] = useState('.');
  const [treeItems, setTreeItems] = useState<FsTreeItem[]>([]);
  const [treeFilter, setTreeFilter] = useState('');
  const [treeLoading, setTreeLoading] = useState(false);

  // Open file buffers
  const [openBuffers, setOpenBuffers] = useState<OpenBuffer[]>([]);
  const [activePath, setActivePath] = useState<string>('');

  // Git & Context Keeper
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [contextKeeper, setContextKeeper] = useState<ContextKeeperStatusResponse | null>(null);

  // Bottom drawer state (collapsed by default or toggleable for calm workspace)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('verify');

  // Exec Verify
  const [verifyCommand, setVerifyCommand] = useState('python scripts/grep_check.py');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ExecVerifyResponse | null>(null);

  // AgentShield
  const [scanningShield, setScanningShield] = useState(false);
  const [shieldResult, setShieldResult] = useState<ShieldScanResponse | null>(null);

  // Slice Dispatch
  const [sliceAgentId, setSliceAgentId] = useState('DEV-01');
  const [sliceSummary, setSliceSummary] = useState('');
  const [dispatchingSlice, setDispatchingSlice] = useState(false);
  const [sliceHistory, setSliceHistory] = useState<Array<{ sliceId: string; agentId: string; summary: string }>>([]);

  const gutterRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const loadTree = useCallback(async (dir: string) => {
    setTreeLoading(true);
    try {
      const res = await ipcJson<FsTreeResponse>(
        `/api/fs/tree?dir=${encodeURIComponent(dir)}`
      );
      if (res.success !== false) {
        const list = Array.isArray(res.items)
          ? res.items
          : Array.isArray(res.files)
            ? res.files
            : [];
        setTreeItems(list);
        setCurrentDir(dir);
      } else {
        pushToast({
          title: 'Workspace Tree Error',
          message: res.error ?? 'Unable to list directory.',
          tone: 'error',
        });
      }
    } catch (err) {
      pushToast({
        title: 'Filesystem Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/fs/tree',
        tone: 'error',
      });
    } finally {
      setTreeLoading(false);
    }
  }, [pushToast]);

  const loadGitAndContext = useCallback(async () => {
    const [gitRes, ckRes] = await Promise.allSettled([
      ipcJson<GitStatusResponse>('/api/git/status'),
      ipcJson<ContextKeeperStatusResponse>('/api/context-keeper/status'),
    ]);
    if (gitRes.status === 'fulfilled') {
      setGitStatus(gitRes.value);
    }
    if (ckRes.status === 'fulfilled') {
      setContextKeeper(ckRes.value);
    }
  }, []);

  useEffect(() => {
    void loadTree('.');
    void loadGitAndContext();
  }, [loadTree, loadGitAndContext]);

  const activeBuffer = useMemo(
    () => openBuffers.find((b) => b.path === activePath) ?? null,
    [openBuffers, activePath]
  );

  const openFile = useCallback(
    async (item: FsTreeItem) => {
      if (item.is_dir) {
        void loadTree(item.path || '.');
        return;
      }

      const existing = openBuffers.find((b) => b.path === item.path);
      if (existing) {
        setActivePath(item.path);
        return;
      }

      setOpenBuffers((prev) => [
        ...prev,
        {
          path: item.path,
          name: item.name,
          originalContent: '',
          content: '',
          loading: true,
          saving: false,
        },
      ]);
      setActivePath(item.path);

      try {
        const res = await ipcJson<FsReadResponse>(
          `/api/fs/read?path=${encodeURIComponent(item.path)}`
        );
        if (res.success === false) {
          pushToast({
            title: 'Read Blocked',
            message: res.error ?? `Cannot read ${item.path}`,
            tone: 'error',
          });
          setOpenBuffers((prev) => {
            const remaining = prev.filter((b) => b.path !== item.path);
            setActivePath(remaining[remaining.length - 1]?.path ?? '');
            return remaining;
          });
          return;
        }
        const text = res.content ?? '';
        setOpenBuffers((prev) =>
          prev.map((b) =>
            b.path === item.path
              ? { ...b, originalContent: text, content: text, loading: false }
              : b
          )
        );
      } catch (err) {
        pushToast({
          title: 'File Read Error',
          message: err instanceof Error ? err.message : 'Unable to reach /api/fs/read',
          tone: 'error',
        });
        setOpenBuffers((prev) => {
          const remaining = prev.filter((b) => b.path !== item.path);
          setActivePath(remaining[remaining.length - 1]?.path ?? '');
          return remaining;
        });
      }
    },
    [loadTree, openBuffers, pushToast]
  );

  const handleCloseBuffer = (e: React.MouseEvent, targetPath: string) => {
    e.stopPropagation();
    const next = openBuffers.filter((b) => b.path !== targetPath);
    setOpenBuffers(next);
    if (activePath === targetPath) {
      setActivePath(next[next.length - 1]?.path ?? '');
    }
  };

  const handleSaveBuffer = useCallback(async () => {
    if (!activeBuffer || activeBuffer.saving || activeBuffer.loading) return;
    const targetPath = activeBuffer.path;
    const contentToSave = activeBuffer.content;

    setOpenBuffers((prev) =>
      prev.map((b) => (b.path === targetPath ? { ...b, saving: true } : b))
    );

    try {
      const res = await ipcJson<FsWriteResponse>('/api/fs/write', {
        method: 'POST',
        body: JSON.stringify({ path: targetPath, content: contentToSave }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Save Rejected',
          message: res.error ?? 'ScopeGuard rejected write.',
          tone: 'error',
        });
        return;
      }
      setOpenBuffers((prev) =>
        prev.map((b) =>
          b.path === targetPath ? { ...b, originalContent: contentToSave } : b
        )
      );
      pushToast({
        title: 'File Saved',
        message: `${activeBuffer.name} (${res.bytes_written ?? contentToSave.length} bytes)`,
        tone: 'success',
      });
      void loadGitAndContext();
    } catch (err) {
      pushToast({
        title: 'Write Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/fs/write',
        tone: 'error',
      });
    } finally {
      setOpenBuffers((prev) =>
        prev.map((b) => (b.path === targetPath ? { ...b, saving: false } : b))
      );
    }
  }, [activeBuffer, loadGitAndContext, pushToast]);

  const handleRevertBuffer = () => {
    if (!activeBuffer) return;
    setOpenBuffers((prev) =>
      prev.map((b) =>
        b.path === activeBuffer.path ? { ...b, content: b.originalContent } : b
      )
    );
  };

  const handleVerify = async () => {
    if (verifying) return;
    setDrawerOpen(true);
    setDrawerTab('verify');
    setVerifying(true);
    try {
      const res = await ipcJson<ExecVerifyResponse>('/api/exec/verify', {
        method: 'POST',
        body: JSON.stringify({ command: verifyCommand.trim() }),
      });
      setVerifyResult(res);
      pushToast({
        title: res.success ? 'Verification Passed' : 'Verification Failed',
        message:
          typeof res.duration_ms === 'number'
            ? `${res.command ?? verifyCommand} (${res.duration_ms} ms)`
            : res.error ?? 'Completed',
        tone: res.success ? 'success' : 'warning',
      });
    } catch (err) {
      setVerifyResult({
        success: false,
        command: verifyCommand,
        error: err instanceof Error ? err.message : 'Verification request failed',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleShieldScan = async () => {
    if (scanningShield) return;
    setDrawerOpen(true);
    setDrawerTab('shield');
    setScanningShield(true);
    try {
      const payload = activeBuffer
        ? { code: activeBuffer.content, filename: activeBuffer.name }
        : {};
      const res = await ipcJson<ShieldScanResponse>('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShieldResult(res);
      pushToast({
        title: res.safe !== false ? 'AgentShield Clean' : 'AgentShield Findings',
        message: `Score ${res.score ?? 100}/100 · ${res.status ?? 'SCANNED'}`,
        tone: res.safe !== false ? 'success' : 'warning',
      });
    } catch (err) {
      setShieldResult({
        success: false,
        safe: false,
        error: err instanceof Error ? err.message : 'Shield scan failed',
      });
    } finally {
      setScanningShield(false);
    }
  };

  const handleSliceDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSummary = sliceSummary.trim();
    if (!cleanSummary || dispatchingSlice) return;
    setDispatchingSlice(true);
    try {
      const res = await ipcJson<SliceDispatchResponse>('/api/slices/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: sliceAgentId.trim() || 'DEV-01',
          task_summary: cleanSummary,
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Slice Dispatch Failed',
          message: res.error ?? 'Gateway rejected slice.',
          tone: 'error',
        });
        return;
      }
      const sid = res.slice_id ?? 'slc-dispatched';
      const aid = res.agent_id ?? sliceAgentId;
      setSliceHistory((prev) => [{ sliceId: sid, agentId: aid, summary: cleanSummary }, ...prev]);
      setSliceSummary('');
      pushToast({
        title: `Slice Dispatched (${aid})`,
        message: sid,
        tone: 'success',
      });
      void refreshAll();
    } catch (err) {
      pushToast({
        title: 'Slice Dispatch Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/slices/dispatch',
        tone: 'error',
      });
    } finally {
      setDispatchingSlice(false);
    }
  };

  const handleNavigateUp = () => {
    if (!currentDir || currentDir === '.') return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    void loadTree(parts.length > 0 ? parts.join('/') : '.');
  };

  const filteredTree = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    if (!q) return treeItems;
    return treeItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [treeItems, treeFilter]);

  const lineCount = useMemo(() => {
    if (!activeBuffer) return 1;
    return Math.max(1, activeBuffer.content.split('\n').length);
  }, [activeBuffer]);

  const handleEditorScroll = () => {
    if (gutterRef.current && editorRef.current) {
      gutterRef.current.scrollTop = editorRef.current.scrollTop;
    }
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSaveBuffer();
    }
  };

  const activeDirty = Boolean(
    activeBuffer && activeBuffer.content !== activeBuffer.originalContent
  );

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-obsidian-fade overflow-hidden">
      {/* Studio Top Bar: 3 uncrowded visual groups */}
      <header className="obsidian-panel rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Group 1: Brand + Git Status */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold tracking-tight text-[var(--text)]">
              NexKoder Studio
            </h2>
          </div>
          <div className="h-4 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>{gitStatus?.branch ?? 'main'}</span>
            {gitStatus && (
              <span
                className={`px-2 py-0.5 rounded border text-[10px] ${
                  gitStatus.clean
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                {gitStatus.clean
                  ? 'clean'
                  : `${gitStatus.total_changes ?? 0} changed`}
              </span>
            )}
          </div>
        </div>

        {/* Group 2: Context Keeper & Verification Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true);
              setDrawerTab('context');
              void loadGitAndContext();
            }}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            Context Keeper ({contextKeeper?.count ?? 0})
          </button>

          <button
            type="button"
            onClick={() => void handleShieldScan()}
            disabled={scanningShield}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-mono text-[var(--text-secondary)] hover:text-emerald-300 transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {scanningShield ? 'Scanning...' : 'AgentShield'}
          </button>

          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={verifying}
            className="px-3 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/20 text-xs font-mono text-emerald-300 transition-colors flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>

        {/* Group 3: Save & Drawer Toggle */}
        <div className="flex items-center gap-2">
          {activeBuffer && (
            <>
              <button
                type="button"
                onClick={handleRevertBuffer}
                disabled={!activeDirty}
                className="p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] disabled:opacity-35 hover:border-[var(--border)] text-[var(--text-secondary)] transition-colors"
                title="Revert unsaved edits"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleSaveBuffer()}
                disabled={!activeDirty || activeBuffer.saving}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 disabled:opacity-35 hover:bg-emerald-500/25 text-xs font-mono text-emerald-300 transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {activeBuffer.saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-mono text-[var(--text-secondary)] transition-colors flex items-center gap-1.5"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            Drawer
            {drawerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Split: Explorer (left) + Editor & Collapsible Drawer (right) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: ScopeGuard Workspace Explorer */}
        <aside className="lg:col-span-3 obsidian-panel rounded-xl flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-[var(--border-subtle)] space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={handleNavigateUp}
                  disabled={currentDir === '.'}
                  className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] disabled:opacity-35 hover:border-emerald-500/40 text-[var(--text-secondary)]"
                  title="Parent directory"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono text-[var(--text-secondary)] truncate">
                  /{currentDir === '.' ? 'workspace' : currentDir}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void loadTree(currentDir)}
                className="p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                title="Refresh tree"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder="Filter files..."
                className="w-full bg-[var(--panel-muted)] border border-[var(--border-subtle)] focus:border-emerald-500/50 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredTree.length === 0 ? (
              <p className="p-4 text-xs font-mono text-[var(--text-muted)] text-center">
                {treeLoading ? 'Reading workspace tree...' : 'No matching entries.'}
              </p>
            ) : (
              filteredTree.map((item) => {
                const selected = item.path === activePath;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => void openFile(item)}
                    className={`w-full px-3 py-2 rounded-lg text-left text-xs font-mono flex items-center justify-between gap-2 transition-colors ${
                      selected
                        ? 'bg-emerald-500/12 border border-emerald-500/35 text-emerald-300'
                        : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--panel-elevated)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {item.is_dir ? (
                        <Folder className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                      ) : (
                        <FileCode2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </span>
                    {!item.is_dir && item.size > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                        {item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(1)}K`}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Column: Editor + Collapsible Bottom Runner Drawer */}
        <section className="lg:col-span-9 flex flex-col min-h-0 gap-4">
          {/* Code Editor Surface */}
          <div className="obsidian-panel rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Open Buffer Tabs */}
            <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--panel-muted)] flex items-center gap-2 overflow-x-auto shrink-0">
              {openBuffers.length === 0 ? (
                <span className="text-xs font-mono text-[var(--text-muted)] py-1">
                  Select a file from ScopeGuard explorer to inspect or edit
                </span>
              ) : (
                openBuffers.map((buf) => {
                  const isActive = buf.path === activePath;
                  const dirty = buf.content !== buf.originalContent;
                  return (
                    <div
                      key={buf.path}
                      onClick={() => setActivePath(buf.path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setActivePath(buf.path);
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 cursor-pointer transition-colors shrink-0 ${
                        isActive
                          ? 'border-emerald-500/40 bg-[var(--panel)] text-[var(--text)]'
                          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      <span>{buf.name}</span>
                      <button
                        type="button"
                        onClick={(e) => handleCloseBuffer(e, buf.path)}
                        className="hover:text-red-300 transition-colors"
                        title="Close tab"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Editor Canvas */}
            {activeBuffer ? (
              activeBuffer.loading ? (
                <div className="flex-1 flex items-center justify-center text-xs font-mono text-[var(--text-secondary)]">
                  Reading {activeBuffer.path} through ScopeGuard...
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex bg-[var(--bg)] overflow-hidden">
                  <div
                    ref={gutterRef}
                    aria-hidden="true"
                    className="w-12 py-4 pr-3 text-right select-none overflow-hidden bg-[var(--panel-muted)] border-r border-[var(--border-subtle)] text-[11px] leading-6 font-mono text-[var(--text-muted)] shrink-0"
                  >
                    {Array.from({ length: lineCount }, (_, i) => (
                      <div key={i + 1}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={editorRef}
                    value={activeBuffer.content}
                    onScroll={handleEditorScroll}
                    onKeyDown={handleEditorKeyDown}
                    onChange={(e) => {
                      const nextText = e.target.value;
                      setOpenBuffers((prev) =>
                        prev.map((b) =>
                          b.path === activeBuffer.path ? { ...b, content: nextText } : b
                        )
                      );
                    }}
                    spellCheck={false}
                    className="flex-1 h-full resize-none bg-transparent p-4 text-xs leading-6 font-mono text-[var(--text)] outline-none overflow-auto whitespace-pre"
                  />
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                <FileCode2 className="w-8 h-8 text-emerald-400/60" />
                <p className="text-sm text-[var(--text-secondary)]">
                  ScopeGuard Read-Before-Write Editor Ready
                </p>
                <p className="text-xs font-mono text-[var(--text-muted)] max-w-md">
                  Browse the workspace tree on the left to open files, run AgentShield AST scans,
                  verify builds, or dispatch slices.
                </p>
              </div>
            )}
          </div>

          {/* Toggleable Bottom Diagnostics & Runner Drawer */}
          {drawerOpen && (
            <div className="obsidian-panel rounded-xl h-72 flex flex-col overflow-hidden shrink-0">
              <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--panel-muted)] flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  {(
                    [
                      { id: 'verify', label: 'Exec Verify' },
                      { id: 'shield', label: 'AgentShield AST' },
                      { id: 'context', label: 'Context & Slices' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDrawerTab(tab.id)}
                      className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                        drawerTab === tab.id
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                  title="Collapse drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {drawerTab === 'verify' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={verifyCommand}
                        onChange={(e) => setVerifyCommand(e.target.value)}
                        placeholder="Command (e.g. python scripts/grep_check.py or npx tsc --noEmit)"
                        className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleVerify()}
                        disabled={verifying}
                        className="px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-mono text-emerald-300"
                      >
                        {verifying ? 'Running...' : 'Run Verify'}
                      </button>
                    </div>
                    {verifyResult && (
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg)] p-3 font-mono text-xs space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={
                              verifyResult.success ? 'text-emerald-400' : 'text-red-400'
                            }
                          >
                            {verifyResult.success ? 'PASS' : 'FAIL'} · exit{' '}
                            {verifyResult.exit_code ?? verifyResult.returncode ?? '—'}
                          </span>
                          {typeof verifyResult.duration_ms === 'number' && (
                            <span className="text-[var(--text-muted)]">
                              {verifyResult.duration_ms} ms
                            </span>
                          )}
                        </div>
                        {verifyResult.error && (
                          <pre className="text-red-300 whitespace-pre-wrap">{verifyResult.error}</pre>
                        )}
                        {verifyResult.stdout && (
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap">
                            {verifyResult.stdout}
                          </pre>
                        )}
                        {verifyResult.stderr && (
                          <pre className="text-amber-300 whitespace-pre-wrap">
                            {verifyResult.stderr}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === 'shield' && (
                  <div className="space-y-3">
                    {shieldResult ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-xs font-mono">
                          <span className="flex items-center gap-2">
                            {shieldResult.safe !== false ? (
                              <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-400" />
                            )}
                            <span className="text-[var(--text)]">
                              Status: {shieldResult.status ?? (shieldResult.safe ? 'CLEAN' : 'ALERT')}
                            </span>
                          </span>
                          <span className="text-emerald-300">
                            Score: {shieldResult.score ?? '—'}/100 · Risk:{' '}
                            {shieldResult.risk_score ?? 0}
                          </span>
                        </div>
                        {shieldResult.error && (
                          <p className="text-xs font-mono text-red-300">{shieldResult.error}</p>
                        )}
                        {Array.isArray(shieldResult.findings) && shieldResult.findings.length > 0 ? (
                          <div className="space-y-2">
                            {shieldResult.findings.map((f, idx) => (
                              <div
                                key={`${f.category ?? 'finding'}-${idx}`}
                                className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3 text-xs font-mono space-y-1"
                              >
                                <div className="flex items-center justify-between text-amber-300">
                                  <span>
                                    [{f.severity ?? 'WARN'}] {f.category ?? 'INVARIANT'}
                                  </span>
                                  {typeof f.line === 'number' && <span>Line {f.line}</span>}
                                </div>
                                <p className="text-[var(--text)]">{f.message}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs font-mono text-[var(--text-secondary)]">
                            Zero security findings detected across the active buffer.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-mono text-[var(--text-muted)]">
                        Click AgentShield above to run AST &amp; invariant auditing against the active
                        file buffer.
                      </p>
                    )}
                  </div>
                )}

                {drawerTab === 'context' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Context Keeper List */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                        Context Keeper ({contextKeeper?.count ?? 0})
                      </p>
                      {Array.isArray(contextKeeper?.contexts) &&
                      contextKeeper.contexts.length > 0 ? (
                        <div className="space-y-2">
                          {contextKeeper.contexts.slice(0, 4).map((ctx, idx) => (
                            <div
                              key={`${ctx.project_name ?? 'ctx'}-${idx}`}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono">
                                <span className="text-emerald-300">
                                  {ctx.project_name ?? 'Workspace'}
                                </span>
                                <span className="text-[var(--text-muted)]">{ctx.branch ?? 'main'}</span>
                              </div>
                              {ctx.goal && (
                                <p className="text-[var(--text-secondary)] line-clamp-2">{ctx.goal}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs font-mono text-[var(--text-muted)]">
                          No active Context Keeper snapshots recorded yet.
                        </p>
                      )}
                    </div>

                    {/* Slice Dispatch Form */}
                    <div className="space-y-3">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                        Slice Dispatch (/api/slices/dispatch)
                      </p>
                      <form onSubmit={handleSliceDispatch} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <select
                            value={sliceAgentId}
                            onChange={(e) => setSliceAgentId(e.target.value)}
                            className="bg-[var(--panel-muted)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                          >
                            <option value="DEV-01">DEV-01</option>
                            <option value="SEC-01">SEC-01</option>
                            <option value="QA-01">QA-01</option>
                            <option value="SCOUT-01">SCOUT-01</option>
                          </select>
                          <input
                            type="text"
                            value={sliceSummary}
                            onChange={(e) => setSliceSummary(e.target.value)}
                            placeholder="Slice directive summary..."
                            className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
                          />
                          <button
                            type="submit"
                            disabled={dispatchingSlice || !sliceSummary.trim()}
                            className="px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-xs font-mono text-emerald-300 flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Dispatch
                          </button>
                        </div>
                      </form>
                      {sliceHistory.length > 0 && (
                        <div className="space-y-1.5">
                          {sliceHistory.slice(0, 3).map((item) => (
                            <div
                              key={item.sliceId}
                              className="rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-3 py-1.5 text-[11px] font-mono text-[var(--text-secondary)] flex items-center justify-between gap-2"
                            >
                              <span className="truncate">
                                [{item.agentId}] {item.summary}
                              </span>
                              <span className="text-emerald-400 shrink-0">{item.sliceId}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default StudioView;
