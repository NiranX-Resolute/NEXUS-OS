import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Code2,
  FileCode,
  Folder,
  GitBranch,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

interface FsEntry {
  name: string;
  path: string;
  abs_path?: string;
  is_dir: boolean;
  size: number;
  ext: string;
}

interface GitStatusPayload {
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

interface ContextKeeperEntry {
  project_path: string;
  project_name?: string;
  workspace_mode?: string;
  goal?: string;
  left_off?: string;
  branch?: string;
  updated_at?: string;
}

interface ContextKeeperStatusPayload {
  success?: boolean;
  active?: boolean;
  count?: number;
  contexts?: ContextKeeperEntry[];
}

interface VerifyPayload {
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

interface ShieldScanPayload {
  success?: boolean;
  safe?: boolean;
  score?: number;
  risk_score?: number;
  status?: string;
  source?: string;
  quarantined?: boolean;
  findings?: ShieldFinding[];
  error?: string;
}

interface SliceDispatchReceipt {
  slice_id: string;
  agent_id: string;
  task_summary: string;
  dispatched_at: string;
}

type DrawerTab = 'verify' | 'shield' | 'slices' | 'context';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StudioView() {
  const pushToast = useNexusStore((s) => s.pushToast);
  const refreshAll = useNexusStore((s) => s.refreshAll);

  const [currentDir, setCurrentDir] = useState('.');
  const [treeEntries, setTreeEntries] = useState<FsEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeFilter, setTreeFilter] = useState('');

  const [activePath, setActivePath] = useState('');
  const [activeName, setActiveName] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusPayload | null>(null);
  const [contextStatus, setContextStatus] = useState<ContextKeeperStatusPayload | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('verify');

  const [verifyCmd, setVerifyCmd] = useState('npx tsc --noEmit');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyPayload | null>(null);

  const [scanning, setScanning] = useState(false);
  const [shieldResult, setShieldResult] = useState<ShieldScanPayload | null>(null);

  const [sliceAgentId, setSliceAgentId] = useState('DEV-01');
  const [sliceSummary, setSliceSummary] = useState('');
  const [dispatchingSlice, setDispatchingSlice] = useState(false);
  const [lastSlice, setLastSlice] = useState<SliceDispatchReceipt | null>(null);

  const isDirty = Boolean(activePath) && editorContent !== savedContent;

  const loadDirectory = useCallback(
    async (dir: string) => {
      const target = dir.trim() || '.';
      setTreeLoading(true);
      try {
        const res = await ipcJson<{ items?: FsEntry[]; files?: FsEntry[] }>(
          `/api/fs/tree?dir=${encodeURIComponent(target)}`
        );
        if (res.success === false) {
          pushToast(res.error || `Failed to inspect ${target}`, 'error');
          return;
        }
        const entries = Array.isArray(res.items)
          ? res.items
          : Array.isArray(res.files)
          ? res.files
          : [];
        setCurrentDir(target);
        setTreeEntries(entries);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Directory load failed', 'error');
      } finally {
        setTreeLoading(false);
      }
    },
    [pushToast]
  );

  const loadWorkspaceTelemetry = useCallback(async () => {
    const [gitRes, ckRes] = await Promise.allSettled([
      ipcJson<GitStatusPayload>('/api/git/status'),
      ipcFetch('/api/context-keeper/status'),
    ]);

    if (gitRes.status === 'fulfilled') {
      setGitStatus(gitRes.value);
    }

    if (ckRes.status === 'fulfilled') {
      if (ckRes.value.status === 404) {
        const fallback = await ipcJson<ContextKeeperStatusPayload>('/api/context-keeper');
        setContextStatus(fallback);
      } else {
        try {
          const parsed = (await ckRes.value.json()) as ContextKeeperStatusPayload;
          setContextStatus(parsed);
        } catch {
          // Keep previous context state
        }
      }
    }
  }, []);

  useEffect(() => {
    void loadDirectory('.');
    void loadWorkspaceTelemetry();
  }, [loadDirectory, loadWorkspaceTelemetry]);

  const openFile = useCallback(
    async (entry: FsEntry) => {
      if (entry.is_dir) {
        await loadDirectory(entry.path || '.');
        return;
      }

      setFileLoading(true);
      try {
        const res = await ipcJson<{
          path?: string;
          name?: string;
          size?: number;
          content?: string;
        }>(`/api/fs/read?path=${encodeURIComponent(entry.path)}`);

        if (res.success === false) {
          pushToast(res.error || `Could not read ${entry.name}`, 'error');
          return;
        }

        const nextText = typeof res.content === 'string' ? res.content : '';
        setActivePath(res.path || entry.path);
        setActiveName(res.name || entry.name);
        setSavedContent(nextText);
        setEditorContent(nextText);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'File read error', 'error');
      } finally {
        setFileLoading(false);
      }
    },
    [loadDirectory, pushToast]
  );

  const saveCurrentFile = useCallback(async () => {
    if (!activePath || saving) return;
    setSaving(true);
    try {
      const res = await ipcJson<{ path?: string; bytes_written?: number }>('/api/fs/write', {
        method: 'POST',
        body: JSON.stringify({
          path: activePath,
          content: editorContent,
        }),
      });

      if (res.success === false) {
        pushToast(res.error || `Failed to save ${activeName}`, 'error');
        return;
      }

      setSavedContent(editorContent);
      pushToast(
        `Saved ${res.path || activePath} (${formatBytes(res.bytes_written ?? editorContent.length)})`,
        'success'
      );
      void loadWorkspaceTelemetry();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Write failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [activeName, activePath, editorContent, loadWorkspaceTelemetry, pushToast, saving]);

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (activePath) {
          e.preventDefault();
          void saveCurrentFile();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePath, saveCurrentFile]);

  const navigateUp = () => {
    if (currentDir === '.' || !currentDir) return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    void loadDirectory(parts.length > 0 ? parts.join('/') : '.');
  };

  const handleRunVerify = async (e?: FormEvent) => {
    e?.preventDefault();
    if (verifying) return;
    const cmd = verifyCmd.trim() || 'npx tsc --noEmit';
    setVerifying(true);
    setDrawerOpen(true);
    setDrawerTab('verify');
    try {
      const res = await ipcJson<VerifyPayload>('/api/exec/verify', {
        method: 'POST',
        body: JSON.stringify({ command: cmd }),
      });
      setVerifyResult(res);
      const exitCode = res.exit_code ?? res.returncode;
      if (res.success && (exitCode === undefined || exitCode === 0)) {
        pushToast(`Verify passed (${res.duration_ms ?? 0} ms)`, 'success');
      } else {
        pushToast(res.error || `Verify exited with code ${exitCode ?? 'non-zero'}`, 'warn');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Verification request failed';
      setVerifyResult({ success: false, command: cmd, error: errMsg });
      pushToast(errMsg, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleShieldScan = async () => {
    if (scanning) return;
    setScanning(true);
    setDrawerOpen(true);
    setDrawerTab('shield');
    try {
      const body = activePath
        ? { code: editorContent, filename: activeName || activePath, path: activePath }
        : {};
      const res = await ipcJson<ShieldScanPayload>('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setShieldResult(res);
      if (res.success === false) {
        pushToast(res.error || 'Shield scan failed', 'error');
      } else {
        pushToast(
          `AgentShield ${res.status || 'DONE'} (score ${res.score ?? 100})`,
          res.safe === false ? 'warn' : 'success'
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Shield scan error';
      setShieldResult({ success: false, error: errMsg });
      pushToast(errMsg, 'error');
    } finally {
      setScanning(false);
    }
  };

  const handleDispatchSlice = async (e: FormEvent) => {
    e.preventDefault();
    const summary = sliceSummary.trim() || (activePath ? `Inspect and refine ${activePath}` : '');
    if (!summary || dispatchingSlice) return;

    setDispatchingSlice(true);
    try {
      const res = await ipcJson<{ slice_id?: string; agent_id?: string }>('/api/slices/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: sliceAgentId.trim() || 'DEV-01',
          task_summary: summary,
        }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Slice dispatch failed', 'error');
        return;
      }
      setLastSlice({
        slice_id: res.slice_id || 'slc-dispatched',
        agent_id: res.agent_id || sliceAgentId,
        task_summary: summary,
        dispatched_at: new Date().toLocaleTimeString(),
      });
      setSliceSummary('');
      pushToast(`Slice ${res.slice_id || ''} dispatched to ${res.agent_id || sliceAgentId}`, 'success');
      void refreshAll();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Slice dispatch error', 'error');
    } finally {
      setDispatchingSlice(false);
    }
  };

  const filteredEntries = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    if (!q) return treeEntries;
    return treeEntries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [treeEntries, treeFilter]);

  const lineCount = useMemo(() => {
    if (!activePath) return 0;
    return editorContent.split('\n').length;
  }, [activePath, editorContent]);

  const pathSegments = useMemo(
    () => (currentDir === '.' ? [] : currentDir.split('/').filter(Boolean)),
    [currentDir]
  );

  const contextCount = contextStatus?.count ?? contextStatus?.contexts?.length ?? 0;

  return (
    <div className="flex h-full w-full flex-col bg-[#090a0c] text-zinc-100">
      {/* Top IDE Strip */}
      <header className="monograph-hairline-b flex flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-emerald-400" />
            <h1 className="text-[14px] font-medium tracking-[-0.01em] text-zinc-100">
              NexKoder Studio
            </h1>
          </div>

          <span className="text-zinc-700">/</span>

          {/* Git Branch Badge */}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true);
              setDrawerTab('context');
              void loadWorkspaceTelemetry();
            }}
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#0e1014] px-2.5 py-1 font-mono text-[11px] text-zinc-300 transition hover:border-white/[0.15]"
            title="Inspect Git & Context Keeper status"
          >
            <GitBranch className="h-3 w-3 text-emerald-400" />
            <span>{gitStatus?.branch || 'main'}</span>
            {typeof gitStatus?.total_changes === 'number' && (
              <span
                className={`tabular-nums ${
                  gitStatus.total_changes > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {gitStatus.total_changes > 0 ? `· ${gitStatus.total_changes}Δ` : '· clean'}
              </span>
            )}
          </button>

          {/* Context Keeper Pill */}
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(true);
              setDrawerTab('context');
            }}
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#0e1014] px-2.5 py-1 font-mono text-[11px] text-zinc-400 tabular-nums transition hover:text-zinc-200"
          >
            <Layers className="h-3 w-3 text-zinc-500" />
            <span>CK {contextCount}</span>
          </button>
        </div>

        {/* Right Primary Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void saveCurrentFile()}
            disabled={!activePath || !isDirty || saving}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-mono text-xs transition ${
              isDirty
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-white/[0.08] bg-[#0e1014] text-zinc-500'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>

          <button
            type="button"
            onClick={() => void handleShieldScan()}
            disabled={scanning}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0e1014] px-3 font-mono text-xs text-zinc-300 transition hover:border-white/[0.16] hover:text-zinc-100 disabled:opacity-50"
          >
            {scanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            )}
            Shield
          </button>

          <button
            type="button"
            onClick={() => void handleRunVerify()}
            disabled={verifying}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 font-mono text-xs text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Verify
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-white/[0.08] bg-[#0e1014] px-2.5 font-mono text-xs text-zinc-400 transition hover:text-zinc-200"
            title={drawerOpen ? 'Collapse diagnostics drawer' : 'Expand diagnostics drawer'}
          >
            <Terminal className="h-3.5 w-3.5" />
            {drawerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Explorer + Editor Split */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Explorer */}
        <aside className="monograph-hairline-r flex w-64 shrink-0 flex-col bg-[#0b0d10]">
          <div className="monograph-hairline-b flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              <button
                type="button"
                onClick={navigateUp}
                disabled={currentDir === '.'}
                className="rounded p-1 text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-30"
                title="Parent directory"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => void loadDirectory('.')}
                className="truncate hover:text-zinc-200"
              >
                root
              </button>
              {pathSegments.map((seg, idx) => {
                const segPath = pathSegments.slice(0, idx + 1).join('/');
                return (
                  <span key={segPath} className="flex min-w-0 items-center gap-1">
                    <span className="text-zinc-600">/</span>
                    <button
                      type="button"
                      onClick={() => void loadDirectory(segPath)}
                      className="truncate hover:text-zinc-200"
                    >
                      {seg}
                    </button>
                  </span>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void loadDirectory(currentDir)}
              className="rounded p-1 text-zinc-500 transition hover:text-zinc-200"
              title="Reload tree"
            >
              <RefreshCw className={`h-3 w-3 ${treeLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="monograph-hairline-b px-3 py-2">
            <div className="flex items-center gap-2 rounded border border-white/[0.07] bg-[#090a0c] px-2 py-1">
              <Search className="h-3 w-3 text-zinc-500" />
              <input
                type="text"
                value={treeFilter}
                onChange={(e) => setTreeFilter(e.target.value)}
                placeholder="Filter files…"
                className="w-full bg-transparent font-mono text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5">
            {filteredEntries.length === 0 ? (
              <div className="px-3 py-6 text-center font-mono text-[11px] text-zinc-600">
                {treeLoading ? 'Scanning workspace…' : 'Empty directory'}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filteredEntries.map((entry) => {
                  const isActive = !entry.is_dir && entry.path === activePath;
                  return (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() => void openFile(entry)}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left font-mono text-xs transition ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {entry.is_dir ? (
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                          ) : (
                            <FileCode
                              className={`h-3.5 w-3.5 shrink-0 ${
                                isActive ? 'text-emerald-400' : 'text-zinc-500'
                              }`}
                            />
                          )}
                          <span className="truncate">{entry.name}</span>
                        </span>
                        {!entry.is_dir && entry.size > 0 && (
                          <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums">
                            {formatBytes(entry.size)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Center Code Editor */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#090a0c]">
          <div className="monograph-hairline-b flex items-center justify-between gap-4 px-5 py-2.5 font-mono text-xs">
            <div className="flex min-w-0 items-center gap-2">
              {activePath ? (
                <>
                  <span className="truncate text-zinc-200">{activePath}</span>
                  {isDirty && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                      Modified
                    </span>
                  )}
                </>
              ) : (
                <span className="text-zinc-500">Select a file from the workspace explorer</span>
              )}
            </div>

            {activePath && (
              <div className="flex shrink-0 items-center gap-3 text-[11px] text-zinc-500 tabular-nums">
                <span>{lineCount} lines</span>
                <span>{formatBytes(editorContent.length)}</span>
                <span className="monograph-kbd">Ctrl+S</span>
              </div>
            )}
          </div>

          {fileLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 font-mono text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Reading file via ScopeGuard…
            </div>
          ) : !activePath ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="monograph-surface max-w-md rounded-lg p-6">
                <div className="mb-2 font-mono text-xs uppercase tracking-wider text-emerald-400">
                  ScopeGuard Protected Buffer
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-400">
                  Browse repository files on the left to inspect or edit source code with full
                  read-before-write enforcement, live AgentShield security audits, and test
                  verification.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 overflow-hidden">
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                spellCheck={false}
                aria-label={`Code editor for ${activePath}`}
                className="h-full w-full resize-none bg-[#090a0c] p-5 font-mono text-[13px] leading-6 text-zinc-200 focus:outline-none"
              />
            </div>
          )}
        </main>
      </div>

      {/* Collapsible Bottom Drawer */}
      {drawerOpen && (
        <section className="monograph-hairline-t flex h-64 shrink-0 flex-col bg-[#0c0e12]">
          <div className="monograph-hairline-b flex flex-wrap items-center justify-between gap-3 px-5 py-2">
            <div className="flex items-center gap-1 font-mono text-xs">
              {(
                [
                  { id: 'verify', label: 'Verify Output' },
                  { id: 'shield', label: 'Shield Audit' },
                  { id: 'slices', label: 'Slice Dispatch' },
                  { id: 'context', label: 'Git & Context' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerTab(tab.id)}
                  className={`rounded px-2.5 py-1 transition ${
                    drawerTab === tab.id
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded p-1 text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
              aria-label="Collapse drawer"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
            {drawerTab === 'verify' && (
              <div className="space-y-3">
                <form onSubmit={handleRunVerify} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={verifyCmd}
                    onChange={(e) => setVerifyCmd(e.target.value)}
                    placeholder="npx tsc --noEmit"
                    className="h-8 flex-1 rounded border border-white/[0.08] bg-[#090a0c] px-3 text-xs text-zinc-200 focus:border-emerald-500/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={verifying}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    Execute
                  </button>
                </form>

                {verifyResult ? (
                  <div className="space-y-2 rounded border border-white/[0.08] bg-[#090a0c] p-3">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
                      <span
                        className={
                          verifyResult.success ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        {verifyResult.success ? 'PASS' : 'FAIL'} (exit{' '}
                        {verifyResult.exit_code ?? verifyResult.returncode ?? '—'})
                      </span>
                      {typeof verifyResult.duration_ms === 'number' && (
                        <span className="text-zinc-500">{verifyResult.duration_ms} ms</span>
                      )}
                      {verifyResult.command && (
                        <span className="text-zinc-500">{verifyResult.command}</span>
                      )}
                    </div>
                    {verifyResult.error && (
                      <pre className="whitespace-pre-wrap text-red-300">{verifyResult.error}</pre>
                    )}
                    {verifyResult.stdout && (
                      <pre className="whitespace-pre-wrap text-zinc-300">{verifyResult.stdout}</pre>
                    )}
                    {verifyResult.stderr && (
                      <pre className="whitespace-pre-wrap text-amber-300">{verifyResult.stderr}</pre>
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500">
                    Run TypeScript or pytest verification via `/api/exec/verify`.
                  </p>
                )}
              </div>
            )}

            {drawerTab === 'shield' && (
              <div className="space-y-3">
                {shieldResult ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/[0.08] bg-[#090a0c] px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        {shieldResult.safe === false || shieldResult.quarantined ? (
                          <ShieldAlert className="h-4 w-4 text-amber-400" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        )}
                        <span
                          className={
                            shieldResult.safe === false ? 'text-amber-300' : 'text-emerald-300'
                          }
                        >
                          {shieldResult.status || (shieldResult.success ? 'CLEAN' : 'ERROR')}
                        </span>
                        {shieldResult.source && (
                          <span className="text-zinc-500">· {shieldResult.source}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-[11px] tabular-nums">
                        <span>SCORE {shieldResult.score ?? '—'}/100</span>
                        <span className="text-zinc-500">
                          RISK {shieldResult.risk_score ?? 0}
                        </span>
                      </div>
                    </div>

                    {shieldResult.error && (
                      <p className="text-red-300">{shieldResult.error}</p>
                    )}

                    {Array.isArray(shieldResult.findings) && shieldResult.findings.length > 0 ? (
                      <div className="divide-y divide-white/[0.06] rounded border border-white/[0.08] bg-[#090a0c]">
                        {shieldResult.findings.map((finding, idx) => (
                          <div key={`${finding.category || 'f'}-${idx}`} className="p-3">
                            <div className="mb-1 flex items-center gap-2 text-[11px]">
                              <span
                                className={
                                  finding.severity === 'CRITICAL'
                                    ? 'text-red-400'
                                    : 'text-amber-400'
                                }
                              >
                                {finding.severity || 'INFO'}
                              </span>
                              {finding.category && (
                                <span className="text-zinc-400">{finding.category}</span>
                              )}
                              {typeof finding.line === 'number' && (
                                <span className="text-zinc-600 tabular-nums">
                                  L{finding.line}
                                </span>
                              )}
                            </div>
                            <p className="text-zinc-300">{finding.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      !shieldResult.error && (
                        <p className="text-emerald-400/90">
                          Zero Gravitas invariant violations detected.
                        </p>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-zinc-500">
                    Click Shield in the header to audit the open buffer or workspace plugins.
                  </p>
                )}
              </div>
            )}

            {drawerTab === 'slices' && (
              <div className="space-y-3">
                <form onSubmit={handleDispatchSlice} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={sliceAgentId}
                    onChange={(e) => setSliceAgentId(e.target.value)}
                    placeholder="DEV-01"
                    className="h-8 w-28 rounded border border-white/[0.08] bg-[#090a0c] px-2.5 text-xs text-zinc-200 focus:border-emerald-500/40 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={sliceSummary}
                    onChange={(e) => setSliceSummary(e.target.value)}
                    placeholder={
                      activePath
                        ? `Task summary (default: Inspect and refine ${activePath})`
                        : 'Describe autonomous slice assignment…'
                    }
                    className="h-8 min-w-[220px] flex-1 rounded border border-white/[0.08] bg-[#090a0c] px-3 text-xs text-zinc-200 placeholder-zinc-600 focus:border-emerald-500/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={dispatchingSlice || (!sliceSummary.trim() && !activePath)}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    {dispatchingSlice ? 'Dispatching…' : 'Dispatch Slice'}
                  </button>
                </form>

                {lastSlice && (
                  <div className="rounded border border-white/[0.08] bg-[#090a0c] p-3 text-zinc-300">
                    <span className="text-emerald-400">{lastSlice.slice_id}</span> →{' '}
                    <span className="text-zinc-200">{lastSlice.agent_id}</span> ·{' '}
                    {lastSlice.task_summary}{' '}
                    <span className="text-zinc-600">({lastSlice.dispatched_at})</span>
                  </div>
                )}
              </div>
            )}

            {drawerTab === 'context' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded border border-white/[0.08] bg-[#090a0c] p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-400">
                    <span>Git Working Tree</span>
                    <span className="text-emerald-400">{gitStatus?.branch || 'main'}</span>
                  </div>
                  {gitStatus?.status_lines && gitStatus.status_lines.length > 0 ? (
                    <ul className="space-y-1 text-[11px] text-zinc-300">
                      {gitStatus.status_lines.slice(0, 12).map((line, i) => (
                        <li key={`${line}-${i}`} className="truncate">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-500">Working tree clean.</p>
                  )}
                </div>

                <div className="rounded border border-white/[0.08] bg-[#090a0c] p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-400">
                    <span>Context Keeper</span>
                    <span className="tabular-nums text-zinc-300">{contextCount} saved</span>
                  </div>
                  {contextStatus?.contexts && contextStatus.contexts.length > 0 ? (
                    <ul className="space-y-2 text-[11px]">
                      {contextStatus.contexts.slice(0, 4).map((ctx) => (
                        <li key={ctx.project_path} className="space-y-0.5">
                          <div className="flex items-center justify-between text-zinc-200">
                            <span className="truncate">{ctx.project_name || ctx.project_path}</span>
                            {ctx.branch && <span className="text-zinc-500">{ctx.branch}</span>}
                          </div>
                          {ctx.goal && <p className="truncate text-zinc-500">{ctx.goal}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-zinc-500">No project checkpoints stored yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default StudioView;
