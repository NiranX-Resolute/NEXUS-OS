import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Code2,
  FileCode2,
  FileText,
  Folder,
  FolderUp,
  GitBranch,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  ext?: string;
}

interface FsTreeResponse {
  success?: boolean;
  files?: FsEntry[];
  items?: FsEntry[];
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
  severity: string;
  category: string;
  message: string;
  line?: number;
  snippet?: string;
  invariant?: string;
}

interface ShieldScanResponse {
  success?: boolean;
  score?: number;
  risk_score?: number;
  safe?: boolean;
  status?: string;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  scanned_files?: number;
  findings?: ShieldFinding[];
  error?: string;
}

interface ContextItem {
  id?: string;
  project_name?: string;
  project_path?: string;
  branch?: string;
  goal?: string;
  left_off?: string;
  next_steps?: string[];
  active_files?: string[];
  updated_at?: string;
}

interface ContextKeeperResponse {
  success?: boolean;
  active?: boolean;
  count?: number;
  contexts?: ContextItem[];
  error?: string;
}

interface SliceDispatchResponse {
  success?: boolean;
  slice_id?: string;
  agent_id?: string;
  error?: string;
}

type InspectorTab = 'verify' | 'shield' | 'context' | 'slice';

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
  const [treeFilter, setTreeFilter] = useState('');
  const [loadingTree, setLoadingTree] = useState(false);

  const [activeFilePath, setActiveFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [contextKeeper, setContextKeeper] = useState<ContextKeeperResponse | null>(null);

  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('verify');

  const [verifyCmd, setVerifyCmd] = useState('python scripts/grep_check.py');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<ExecVerifyResponse | null>(null);

  const [scanningShield, setScanningShield] = useState(false);
  const [shieldResult, setShieldResult] = useState<ShieldScanResponse | null>(null);

  const [sliceAgent, setSliceAgent] = useState('DEV-01');
  const [sliceSummary, setSliceSummary] = useState('');
  const [dispatchingSlice, setDispatchingSlice] = useState(false);
  const [lastSliceResult, setLastSliceResult] = useState<SliceDispatchResponse | null>(null);

  const isDirty = Boolean(activeFilePath) && editorContent !== savedContent;

  const loadDirectory = useCallback(
    async (dirPath: string) => {
      setLoadingTree(true);
      try {
        const cleanDir = dirPath || '.';
        const res = await ipcJson<FsTreeResponse>(
          `/api/fs/tree?dir=${encodeURIComponent(cleanDir)}`
        );
        if (!res.success) {
          pushToast(res.error || `Unable to list ${cleanDir}`, 'error');
          return;
        }
        const entries = res.files ?? res.items ?? [];
        setCurrentDir(cleanDir);
        setTreeEntries(entries);
      } finally {
        setLoadingTree(false);
      }
    },
    [pushToast]
  );

  const loadTelemetryMeta = useCallback(async () => {
    const [gitRes, ckStatusRes] = await Promise.all([
      ipcJson<GitStatusResponse>('/api/git/status'),
      ipcJson<ContextKeeperResponse>('/api/context-keeper/status'),
    ]);
    let resolvedCk = ckStatusRes;
    if (!resolvedCk.success && /404|not found/i.test(resolvedCk.error || '')) {
      resolvedCk = await ipcJson<ContextKeeperResponse>('/api/context-keeper');
    }
    setGitStatus(gitRes);
    setContextKeeper(
      resolvedCk.success && Array.isArray(resolvedCk.contexts)
        ? {
            ...resolvedCk,
            count: resolvedCk.count ?? resolvedCk.contexts.length,
            active: resolvedCk.active ?? resolvedCk.contexts.length > 0,
          }
        : resolvedCk
    );
  }, []);

  useEffect(() => {
    void loadDirectory('.');
    void loadTelemetryMeta();
  }, [loadDirectory, loadTelemetryMeta]);

  const openFile = useCallback(
    async (filePath: string) => {
      setLoadingFile(true);
      try {
        const res = await ipcJson<FsReadResponse>(
          `/api/fs/read?path=${encodeURIComponent(filePath)}`
        );
        if (!res.success) {
          pushToast(res.error || `Failed to read ${filePath}`, 'error');
          return;
        }
        const content = res.content ?? '';
        setActiveFilePath(res.path || filePath);
        setEditorContent(content);
        setSavedContent(content);
      } finally {
        setLoadingFile(false);
      }
    },
    [pushToast]
  );

  const saveActiveFile = useCallback(async () => {
    if (!activeFilePath || savingFile) return;
    setSavingFile(true);
    try {
      const res = await ipcJson<FsWriteResponse>('/api/fs/write', {
        method: 'POST',
        body: JSON.stringify({
          path: activeFilePath,
          content: editorContent,
        }),
      });
      if (!res.success) {
        pushToast(res.error || `Failed saving ${activeFilePath}`, 'error');
        return;
      }
      setSavedContent(editorContent);
      pushToast(
        `Saved ${res.path || activeFilePath} (${formatBytes(res.bytes_written ?? editorContent.length)})`,
        'success'
      );
      void loadTelemetryMeta();
    } finally {
      setSavingFile(false);
    }
  }, [activeFilePath, editorContent, loadTelemetryMeta, pushToast, savingFile]);

  const handleRunVerify = async () => {
    if (verifying) return;
    setInspectorOpen(true);
    setInspectorTab('verify');
    setVerifying(true);
    try {
      const res = await ipcJson<ExecVerifyResponse>('/api/exec/verify', {
        method: 'POST',
        body: JSON.stringify({ command: verifyCmd.trim() || undefined }),
      });
      setVerifyResult(res);
      pushToast(
        res.success ? 'Verification passed' : res.error || 'Verification failed',
        res.success ? 'success' : 'error'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleRunShieldScan = async () => {
    if (scanningShield) return;
    setInspectorOpen(true);
    setInspectorTab('shield');
    setScanningShield(true);
    try {
      const payload = activeFilePath
        ? { code: editorContent, filename: activeFilePath }
        : {};
      const res = await ipcJson<ShieldScanResponse>('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setShieldResult(res);
      const score = res.score ?? 100;
      pushToast(
        `AgentShield score: ${score}/100 (${res.status || (res.safe ? 'CLEAN' : 'REVIEW')})`,
        score >= 85 ? 'success' : 'warn'
      );
    } finally {
      setScanningShield(false);
    }
  };

  const handleDispatchSlice = async (e: React.FormEvent) => {
    e.preventDefault();
    const summary = sliceSummary.trim();
    if (!summary || dispatchingSlice) return;
    setDispatchingSlice(true);
    try {
      const res = await ipcJson<SliceDispatchResponse>('/api/slices/dispatch', {
        method: 'POST',
        body: JSON.stringify({
          agent_id: sliceAgent,
          task_summary: summary,
        }),
      });
      setLastSliceResult(res);
      if (!res.success) {
        pushToast(res.error || 'Slice dispatch failed', 'error');
        return;
      }
      setSliceSummary('');
      pushToast(`Slice ${res.slice_id} queued for ${res.agent_id}`, 'success');
      void refreshAll();
    } finally {
      setDispatchingSlice(false);
    }
  };

  const handleNavigateParent = () => {
    if (currentDir === '.' || !currentDir) return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    void loadDirectory(parts.length > 0 ? parts.join('/') : '.');
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void saveActiveFile();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${editorContent.slice(0, start)}  ${editorContent.slice(end)}`;
      setEditorContent(next);
      window.requestAnimationFrame(() => {
        target.selectionStart = start + 2;
        target.selectionEnd = start + 2;
      });
    }
  };

  const filteredTree = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    if (!q) return treeEntries;
    return treeEntries.filter((entry) => entry.name.toLowerCase().includes(q));
  }, [treeEntries, treeFilter]);

  const lineCount = useMemo(
    () => (activeFilePath ? editorContent.split('\n').length : 0),
    [activeFilePath, editorContent]
  );

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-matrix-in min-h-0">
      {/* Single Clean IDE Header */}
      <header className="matrix-panel rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">NexKoder Cyber Studio</h1>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-0.5">
              <span className="inline-flex items-center gap-1 text-emerald-300">
                <GitBranch className="w-3 h-3" />
                {gitStatus?.branch || 'main'}
              </span>
              <span>
                {gitStatus?.clean
                  ? 'clean tree'
                  : `${gitStatus?.total_changes ?? 0} changed`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setInspectorOpen(true);
                  setInspectorTab('context');
                }}
                className="text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline"
              >
                CK: {contextKeeper?.count ?? 0} contexts
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void saveActiveFile()}
            disabled={!isDirty || savingFile}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 text-xs font-mono transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {savingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>

          <button
            type="button"
            onClick={() => void handleRunVerify()}
            disabled={verifying}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 text-xs font-mono transition-colors disabled:opacity-50"
          >
            {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Verify
          </button>

          <button
            type="button"
            onClick={() => void handleRunShieldScan()}
            disabled={scanningShield}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:border-emerald-400/40 text-slate-200 hover:text-emerald-200 text-xs font-mono transition-colors disabled:opacity-50"
          >
            {scanningShield ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            )}
            Shield Scan
          </button>

          <button
            type="button"
            onClick={() => {
              setInspectorOpen(true);
              setInspectorTab('slice');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:border-cyan-400/40 text-slate-200 hover:text-cyan-200 text-xs font-mono transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-300" />
            Slice
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* File Tree Explorer */}
        <aside className="lg:col-span-3 matrix-panel rounded-2xl p-4 flex flex-col gap-3 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300/85 truncate">
              /{currentDir === '.' ? 'workspace' : currentDir}
            </span>
            <div className="flex items-center gap-1">
              {currentDir !== '.' && (
                <button
                  type="button"
                  onClick={handleNavigateParent}
                  title="Parent directory"
                  className="p-1.5 rounded-lg border border-white/10 hover:border-cyan-400/40 text-slate-300 hover:text-cyan-200 transition-colors"
                >
                  <FolderUp className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void loadDirectory(currentDir);
                  void loadTelemetryMeta();
                }}
                title="Refresh explorer"
                className="p-1.5 rounded-lg border border-white/10 hover:border-emerald-400/40 text-slate-300 hover:text-emerald-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTree ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              placeholder="Filter files..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#05080b]/85 border border-white/10 focus:border-emerald-400/50 focus:outline-none text-xs font-mono text-slate-200 placeholder-slate-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {filteredTree.length === 0 ? (
              <div className="text-xs font-mono text-slate-500 p-3 text-center">
                {loadingTree ? 'Scanning ScopeGuard workspace...' : 'Empty directory'}
              </div>
            ) : (
              filteredTree.map((entry) => {
                const isActive = entry.path === activeFilePath;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => {
                      if (entry.is_dir) {
                        void loadDirectory(entry.path);
                      } else {
                        void openFile(entry.path);
                      }
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs font-mono transition-colors ${
                      isActive
                        ? 'bg-emerald-500/18 border border-emerald-400/40 text-emerald-100'
                        : 'border border-transparent hover:bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      {entry.is_dir ? (
                        <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      ) : entry.ext === '.ts' || entry.ext === '.tsx' || entry.ext === '.py' ? (
                        <FileCode2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{entry.name}</span>
                    </span>
                    {!entry.is_dir && (
                      <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                        {formatBytes(entry.size)}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Code Editor + Collapsible Bottom Inspector */}
        <div className="lg:col-span-9 flex flex-col gap-6 min-h-0">
          {/* Code Editor Panel */}
          <section className="matrix-panel rounded-2xl flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-4 bg-[#05080b]/60">
              <div className="flex items-center gap-2 min-w-0 text-xs font-mono">
                <span className="text-cyan-300 truncate">
                  {activeFilePath || 'Select a file from workspace explorer'}
                </span>
                {isDirty && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                    title="Unsaved modifications"
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                {activeFilePath && (
                  <>
                    <span>{lineCount} lines</span>
                    <span>{formatBytes(editorContent.length)}</span>
                    <button
                      type="button"
                      onClick={() => void openFile(activeFilePath)}
                      disabled={loadingFile}
                      title="Reload from disk"
                      className="text-slate-400 hover:text-cyan-200 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingFile ? 'animate-spin' : ''}`} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {activeFilePath ? (
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                onKeyDown={handleEditorKeyDown}
                spellCheck={false}
                className="flex-1 w-full bg-[#05080b]/85 p-4 font-mono text-[13px] leading-6 text-emerald-50 focus:outline-none resize-none overflow-auto"
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2 bg-[#05080b]/55">
                <Code2 className="w-8 h-8 text-emerald-400/60" />
                <p className="text-sm text-slate-300">ScopeGuard-Protected IDE Buffer</p>
                <p className="text-xs font-mono text-slate-500 max-w-md">
                  Select any workspace file on the left to inspect, edit (`Ctrl+S` to persist), verify, or scan with AgentShield.
                </p>
              </div>
            )}
          </section>

          {/* Collapsible Diagnostics & Execution Drawer */}
          <section className="matrix-panel rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 bg-[#05080b]/70">
              <div className="inline-flex items-center gap-1">
                {(
                  [
                    { id: 'verify', label: 'Verify Output' },
                    { id: 'shield', label: 'AgentShield' },
                    { id: 'context', label: 'Context Keeper' },
                    { id: 'slice', label: 'Slice Dispatch' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setInspectorTab(tab.id);
                      setInspectorOpen(true);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                      inspectorTab === tab.id && inspectorOpen
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/35'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setInspectorOpen((prev) => !prev)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
                aria-label={inspectorOpen ? 'Collapse inspector drawer' : 'Expand inspector drawer'}
              >
                {inspectorOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>

            {inspectorOpen && (
              <div className="p-4 max-h-56 overflow-y-auto space-y-3 bg-[#05080b]/60">
                {inspectorTab === 'verify' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Terminal className="w-4 h-4 text-cyan-400 shrink-0" />
                      <input
                        type="text"
                        value={verifyCmd}
                        onChange={(e) => setVerifyCmd(e.target.value)}
                        placeholder="Verification command (e.g. python scripts/grep_check.py)"
                        className="flex-1 px-3 py-1.5 rounded-xl bg-[#090e14] border border-white/12 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-100"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRunVerify()}
                        disabled={verifying}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-mono transition-colors"
                      >
                        {verifying ? 'Running...' : 'Run'}
                      </button>
                    </div>

                    {verifyResult ? (
                      <div className="rounded-xl bg-[#05080b] border border-white/10 p-3 font-mono text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={verifyResult.success ? 'text-emerald-300' : 'text-red-300'}>
                            {verifyResult.success ? 'PASS' : 'FAIL'} · exit{' '}
                            {verifyResult.exit_code ?? verifyResult.returncode ?? (verifyResult.success ? 0 : 1)}
                          </span>
                          {typeof verifyResult.duration_ms === 'number' && (
                            <span className="text-slate-500 tabular-nums">{verifyResult.duration_ms}ms</span>
                          )}
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-slate-300 max-h-32 overflow-y-auto">
                          {[verifyResult.stdout, verifyResult.stderr, verifyResult.error]
                            .filter(Boolean)
                            .join('\n') || 'Completed with no output.'}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-xs font-mono text-slate-500">
                        Run a real subprocess verification command via ScopeGuard-guarded `/api/exec/verify`.
                      </p>
                    )}
                  </div>
                )}

                {inspectorTab === 'shield' && (
                  <div className="space-y-3">
                    {shieldResult ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                          <div className="flex items-center gap-2">
                            {(shieldResult.score ?? 100) >= 85 ? (
                              <ShieldCheck className="w-4 h-4 text-emerald-300" />
                            ) : (
                              <ShieldAlert className="w-4 h-4 text-amber-300" />
                            )}
                            <span className="text-white font-semibold">
                              Score: {shieldResult.score ?? 100}/100
                            </span>
                            <span className="text-cyan-300">
                              [{shieldResult.status || (shieldResult.safe ? 'CLEAN' : 'REVIEW')}]
                            </span>
                          </div>
                          <span className="text-slate-400">
                            Findings: {shieldResult.findings?.length ?? 0}
                          </span>
                        </div>

                        {shieldResult.findings && shieldResult.findings.length > 0 ? (
                          <div className="space-y-2">
                            {shieldResult.findings.map((finding, idx) => (
                              <div
                                key={`${finding.category}-${idx}`}
                                className="rounded-xl bg-[#05080b] border border-amber-400/25 p-2.5 text-xs font-mono space-y-1"
                              >
                                <div className="flex items-center gap-2 text-[11px] text-amber-300">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>{finding.severity}</span>
                                  <span>·</span>
                                  <span>{finding.category}</span>
                                  {finding.line && <span>(L{finding.line})</span>}
                                </div>
                                <p className="text-slate-200">{finding.message}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs font-mono text-emerald-300">
                            Zero security invariant violations detected.
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs font-mono text-slate-500">
                        Click Shield Scan above to audit the active buffer or plugin directory.
                      </p>
                    )}
                  </div>
                )}

                {inspectorTab === 'context' && (
                  <div className="space-y-2.5">
                    {contextKeeper?.contexts && contextKeeper.contexts.length > 0 ? (
                      contextKeeper.contexts.map((ctx, idx) => (
                        <div
                          key={ctx.id || ctx.project_path || idx}
                          className="rounded-xl bg-[#05080b] border border-white/10 p-3 text-xs font-mono space-y-1"
                        >
                          <div className="flex items-center justify-between text-emerald-300">
                            <span>{ctx.project_name || ctx.project_path || 'Workspace'}</span>
                            <span className="text-cyan-300">{ctx.branch || 'main'}</span>
                          </div>
                          {ctx.goal && <p className="text-slate-200">Goal: {ctx.goal}</p>}
                          {ctx.left_off && <p className="text-slate-400">Checkpoint: {ctx.left_off}</p>}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs font-mono text-slate-400">
                        No Context Keeper checkpoints recorded yet (`/api/context-keeper/status`).
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === 'slice' && (
                  <form onSubmit={handleDispatchSlice} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={sliceAgent}
                        onChange={(e) => setSliceAgent(e.target.value)}
                        className="px-3 py-1.5 rounded-xl bg-[#090e14] border border-white/12 focus:border-emerald-400/50 focus:outline-none text-xs font-mono text-emerald-200"
                      >
                        <option value="DEV-01">DEV-01 (Builder)</option>
                        <option value="SEC-01">SEC-01 (Sentinel)</option>
                        <option value="SCOUT-01">SCOUT-01 (Research)</option>
                        <option value="TEST-01">TEST-01 (Verifier)</option>
                      </select>
                      <input
                        type="text"
                        value={sliceSummary}
                        onChange={(e) => setSliceSummary(e.target.value)}
                        placeholder={
                          activeFilePath
                            ? `Vertical slice objective for ${activeFilePath}...`
                            : 'Vertical slice objective...'
                        }
                        className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-[#090e14] border border-white/12 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-emerald-50"
                      />
                      <button
                        type="submit"
                        disabled={dispatchingSlice || !sliceSummary.trim()}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-mono transition-colors disabled:opacity-40"
                      >
                        {dispatchingSlice ? 'Dispatching...' : 'Dispatch Slice'}
                      </button>
                    </div>
                    {lastSliceResult?.success && (
                      <div className="text-xs font-mono text-emerald-300">
                        Dispatched slice <span className="text-cyan-200">{lastSliceResult.slice_id}</span>{' '}
                        to {lastSliceResult.agent_id}.
                      </div>
                    )}
                  </form>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default StudioView;
