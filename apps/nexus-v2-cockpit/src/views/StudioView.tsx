import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUp,
  BookmarkCheck,
  CheckCircle2,
  FileCode2,
  Folder,
  GitBranch,
  Play,
  RefreshCw,
  Rocket,
  Save,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  ext: string;
}

interface FsTreeResponse {
  success?: boolean;
  root?: string;
  items?: FsEntry[];
  files?: FsEntry[];
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

interface VerifyResponse {
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
}

interface ShieldScanResponse {
  success?: boolean;
  safe?: boolean;
  score?: number;
  risk_score?: number;
  status?: string;
  findings?: ShieldFinding[];
  source?: string;
  quarantined?: boolean;
  error?: string;
}

interface ContextEntry {
  project_name?: string;
  project_path?: string;
  branch?: string;
  stack?: string[];
  goal?: string;
  left_off?: string;
  updated_at?: string;
}

interface ContextKeeperResponse {
  success?: boolean;
  active?: boolean;
  count?: number;
  contexts?: ContextEntry[];
  error?: string;
}

interface SliceDispatchResponse {
  success?: boolean;
  slice_id?: string;
  agent_id?: string;
  error?: string;
}

type InspectorTab = 'verify' | 'context' | 'slices';

const VERIFY_PRESETS = [
  'npx tsc --noEmit',
  'python scripts/grep_check.py',
  'python -m pytest tests/test_nexus_v5_complete.py -v',
];

export function StudioView() {
  const pushToast = useNexusStore((s) => s.pushToast);
  const refreshAll = useNexusStore((s) => s.refreshAll);

  const [currentDir, setCurrentDir] = useState('.');
  const [treeItems, setTreeItems] = useState<FsEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const [activePath, setActivePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [contextKeeper, setContextKeeper] = useState<ContextKeeperResponse | null>(null);

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('verify');
  const [verifyCmd, setVerifyCmd] = useState('npx tsc --noEmit');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const [scanning, setScanning] = useState(false);
  const [shieldResult, setShieldResult] = useState<ShieldScanResponse | null>(null);

  const [sliceAgent, setSliceAgent] = useState('DEV-01');
  const [sliceSummary, setSliceSummary] = useState('');
  const [dispatchingSlice, setDispatchingSlice] = useState(false);
  const [lastSlice, setLastSlice] = useState<SliceDispatchResponse | null>(null);

  const isDirty = useMemo(
    () => Boolean(activePath) && editorContent !== savedContent,
    [activePath, editorContent, savedContent]
  );

  const loadTree = useCallback(
    async (dirPath: string) => {
      setTreeLoading(true);
      try {
        const res = await ipcJson<FsTreeResponse>(
          `/api/fs/tree?dir=${encodeURIComponent(dirPath || '.')}`
        );
        if (res.success === false) {
          pushToast(res.error || 'Failed to read directory tree', 'error');
          return;
        }
        const entries = res.items ?? res.files ?? [];
        setTreeItems(entries);
        setCurrentDir(dirPath || '.');
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Tree endpoint unreachable', 'error');
      } finally {
        setTreeLoading(false);
      }
    },
    [pushToast]
  );

  const loadWorkspaceTelemetry = useCallback(async () => {
    const [gitRes, ckRes] = await Promise.allSettled([
      ipcJson<GitStatusResponse>('/api/git/status'),
      ipcJson<ContextKeeperResponse>('/api/context-keeper/status'),
    ]);
    if (gitRes.status === 'fulfilled') setGitStatus(gitRes.value);
    if (ckRes.status === 'fulfilled') setContextKeeper(ckRes.value);
  }, []);

  useEffect(() => {
    void loadTree('.');
    void loadWorkspaceTelemetry();
  }, [loadTree, loadWorkspaceTelemetry]);

  const handleOpenFile = async (filePath: string) => {
    setFileLoading(true);
    try {
      const res = await ipcJson<FsReadResponse>(
        `/api/fs/read?path=${encodeURIComponent(filePath)}`
      );
      if (res.success === false || typeof res.content !== 'string') {
        pushToast(res.error || `Failed to read ${filePath}`, 'error');
        return;
      }
      const nextPath = res.path || filePath;
      setActivePath(nextPath);
      setEditorContent(res.content);
      setSavedContent(res.content);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'File read failed', 'error');
    } finally {
      setFileLoading(false);
    }
  };

  const handleSaveFile = useCallback(async () => {
    if (!activePath || saving) return;
    setSaving(true);
    try {
      const res = await ipcJson<FsWriteResponse>('/api/fs/write', {
        method: 'POST',
        body: JSON.stringify({ path: activePath, content: editorContent }),
      });
      if (res.success === false) {
        pushToast(res.error || `Failed saving ${activePath}`, 'error');
        return;
      }
      setSavedContent(editorContent);
      pushToast(`Saved ${res.path || activePath} (${res.bytes_written ?? 0} B)`, 'success');
      void loadWorkspaceTelemetry();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'File save failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [activePath, editorContent, loadWorkspaceTelemetry, pushToast, saving]);

  const handleNavigateUp = () => {
    if (!currentDir || currentDir === '.') return;
    const parts = currentDir.split('/').filter(Boolean);
    parts.pop();
    void loadTree(parts.length > 0 ? parts.join('/') : '.');
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cmd = verifyCmd.trim();
    if (!cmd || verifying) return;
    setVerifying(true);
    setInspectorTab('verify');
    try {
      const res = await ipcJson<VerifyResponse>('/api/exec/verify', {
        method: 'POST',
        body: JSON.stringify({ command: cmd }),
      });
      setVerifyResult(res);
      pushToast(
        res.success ? `Verify passed (${res.duration_ms ?? 0}ms)` : 'Verify reported failures',
        res.success ? 'success' : 'warn'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification request failed';
      setVerifyResult({ success: false, command: cmd, error: msg });
      pushToast(msg, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleShieldScan = async () => {
    if (scanning) return;
    setScanning(true);
    setInspectorTab('verify');
    try {
      let targetName = activePath;
      let targetCode = editorContent;

      if (!targetName) {
        const fallback = await ipcJson<FsReadResponse>('/api/fs/read?path=nexus.py');
        if (fallback.success && typeof fallback.content === 'string') {
          targetName = fallback.path || 'nexus.py';
          targetCode = fallback.content;
        }
      }

      if (!targetName) {
        pushToast('Open a workspace file in the editor before running AgentShield.', 'warn');
        return;
      }

      const res = await ipcJson<ShieldScanResponse>('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify({
          code: targetCode.length > 0 ? targetCode : ' ',
          filename: targetName,
        }),
      });
      setShieldResult(res);
      pushToast(
        `AgentShield: ${res.status || 'SCANNED'} (Score ${res.score ?? 0}/100)`,
        res.safe === false ? 'warn' : 'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'AgentShield scan failed', 'error');
    } finally {
      setScanning(false);
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
          agent_id: sliceAgent.trim() || 'DEV-01',
          task_summary: summary,
        }),
      });
      setLastSlice(res);
      if (res.success) {
        pushToast(`Slice ${res.slice_id} dispatched to ${res.agent_id}`, 'success');
        setSliceSummary('');
        void refreshAll();
      } else {
        pushToast(res.error || 'Slice dispatch failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Slice dispatch failed', 'error');
    } finally {
      setDispatchingSlice(false);
    }
  };

  return (
    <div className="h-full p-6 flex flex-col gap-6 min-h-0">
      {/* Top Studio Bar: Max 3 calm groups */}
      <header className="aether-glass rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-6">
        {/* Group 1: Git Telemetry */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <GitBranch className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold font-mono text-slate-100">
                {gitStatus?.branch || 'main'}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${
                  gitStatus?.clean
                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                {gitStatus?.clean ? 'CLEAN' : `${gitStatus?.total_changes ?? 0} CHANGES`}
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Staged {gitStatus?.staged_count ?? 0} • Modified {gitStatus?.modified_count ?? 0}
            </p>
          </div>
        </div>

        {/* Group 2: Context Keeper Summary */}
        <button
          type="button"
          onClick={() => setInspectorTab('context')}
          className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-[#050a14]/75 px-4 py-2 text-left transition hover:border-emerald-400/50"
        >
          <BookmarkCheck className="h-4 w-4 text-emerald-400" />
          <div>
            <p className="text-xs font-medium text-slate-100">
              Context Keeper ({contextKeeper?.count ?? 0})
            </p>
            <p className="text-[11px] font-mono text-slate-400">
              {contextKeeper?.active ? 'Active session snapshot' : 'No saved snapshot'}
            </p>
          </div>
        </button>

        {/* Group 3: Primary Engineering Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={!isDirty || saving}
            onClick={() => void handleSaveFile()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            disabled={verifying}
            onClick={() => void handleVerify()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3.5 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {verifying ? 'Verifying...' : 'Verify'}
          </button>

          <button
            type="button"
            disabled={scanning}
            onClick={() => void handleShieldScan()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-600/60 bg-slate-900/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            {scanning ? 'Scanning...' : 'AgentShield'}
          </button>
        </div>
      </header>

      {/* Main 3-Pane NexKoder Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Pane 1: File Explorer */}
        <aside className="lg:col-span-3 aether-glass rounded-2xl p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-cyan-500/15">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">
                Workspace Tree
              </p>
              <p className="truncate text-xs font-mono text-slate-200 mt-0.5">{currentDir}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={currentDir === '.'}
                onClick={handleNavigateUp}
                title="Parent directory"
                className="rounded-lg border border-slate-700/60 p-1.5 text-slate-300 transition hover:border-cyan-400/50 disabled:opacity-35"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void loadTree(currentDir)}
                title="Refresh tree"
                className="rounded-lg border border-slate-700/60 p-1.5 text-slate-300 transition hover:border-cyan-400/50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto space-y-1 pr-1">
            {treeItems.length === 0 ? (
              <p className="p-3 text-xs text-slate-400">
                {treeLoading ? 'Loading workspace tree...' : 'Directory empty or gateway offline.'}
              </p>
            ) : (
              treeItems.map((entry) => {
                const selected = activePath === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() =>
                      entry.is_dir ? void loadTree(entry.path) : void handleOpenFile(entry.path)
                    }
                    className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition ${
                      selected
                        ? 'border border-cyan-400/40 bg-cyan-500/15 text-cyan-100'
                        : 'border border-transparent text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {entry.is_dir ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      ) : (
                        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" />
                      )}
                      <span className="truncate font-mono">{entry.name}</span>
                    </span>
                    {!entry.is_dir && (
                      <span className="shrink-0 text-[10px] font-mono text-slate-500">
                        {entry.size > 1024 ? `${(entry.size / 1024).toFixed(1)}K` : `${entry.size}B`}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Pane 2: Editor */}
        <section className="lg:col-span-5 aether-glass rounded-2xl flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-cyan-500/15 px-5 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileCode2 className="h-4 w-4 shrink-0 text-cyan-400" />
              <span className="truncate text-xs font-mono text-slate-200">
                {activePath || 'Select a file from Workspace Tree'}
              </span>
              {isDirty && (
                <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                  MODIFIED
                </span>
              )}
            </div>
            {fileLoading && (
              <span className="text-[11px] font-mono text-cyan-300">Reading...</span>
            )}
          </div>

          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void handleSaveFile();
              }
            }}
            spellCheck={false}
            disabled={!activePath}
            placeholder={
              activePath
                ? 'File buffer is empty.'
                : 'Open any workspace file via /api/fs/read to inspect, edit, verify, or audit.'
            }
            className="flex-1 w-full resize-none bg-[#050a14]/90 p-5 font-mono text-xs leading-6 text-slate-100 placeholder-slate-500 focus:outline-none disabled:opacity-60"
          />
        </section>

        {/* Pane 3: Inspector (Verify & Shield / Context Keeper / Slice Dispatch) */}
        <aside className="lg:col-span-4 aether-glass rounded-2xl p-5 flex flex-col gap-5 min-h-0">
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-700/60 bg-[#050a14]/85 p-1 text-xs">
            <button
              type="button"
              onClick={() => setInspectorTab('verify')}
              className={`rounded-lg py-1.5 font-medium transition ${
                inspectorTab === 'verify'
                  ? 'border border-cyan-400/35 bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Verify &amp; Shield
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('context')}
              className={`rounded-lg py-1.5 font-medium transition ${
                inspectorTab === 'context'
                  ? 'border border-emerald-400/35 bg-emerald-500/20 text-emerald-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Context
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab('slices')}
              className={`rounded-lg py-1.5 font-medium transition ${
                inspectorTab === 'slices'
                  ? 'border border-cyan-400/35 bg-cyan-500/20 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Slices
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {inspectorTab === 'verify' && (
              <>
                {/* Command Verify */}
                <div className="aether-panel rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                      <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                      Command Verify
                    </span>
                    <select
                      aria-label="Preset verify command"
                      value={VERIFY_PRESETS.includes(verifyCmd) ? verifyCmd : ''}
                      onChange={(e) => {
                        if (e.target.value) setVerifyCmd(e.target.value);
                      }}
                      className="rounded-lg border border-slate-700 bg-[#050a14] px-2 py-1 text-[11px] font-mono text-slate-300"
                    >
                      <option value="">Custom</option>
                      {VERIFY_PRESETS.map((cmd) => (
                        <option key={cmd} value={cmd}>
                          {cmd}
                        </option>
                      ))}
                    </select>
                  </div>

                  <form onSubmit={handleVerify} className="flex gap-2">
                    <input
                      type="text"
                      value={verifyCmd}
                      onChange={(e) => setVerifyCmd(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-700/70 bg-[#050a14] px-3 py-2 text-xs font-mono text-slate-100 focus:border-cyan-400/70 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={verifying || !verifyCmd.trim()}
                      className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-45"
                    >
                      Run
                    </button>
                  </form>

                  {verifyResult && (
                    <div className="rounded-xl border border-slate-700/60 bg-[#050a14]/90 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-mono">
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            verifyResult.success ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {verifyResult.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5" />
                          )}
                          Exit {verifyResult.exit_code ?? verifyResult.returncode ?? '-'}
                        </span>
                        <span className="text-slate-400">
                          {verifyResult.duration_ms ?? 0}ms
                        </span>
                      </div>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-slate-300">
                        {verifyResult.stdout ||
                          verifyResult.stderr ||
                          verifyResult.error ||
                          'No output.'}
                      </pre>
                    </div>
                  )}
                </div>

                {/* AgentShield Scan */}
                <div className="aether-panel rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                      {shieldResult?.safe === false ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                      AgentShield AST Audit
                    </span>
                    <button
                      type="button"
                      disabled={scanning}
                      onClick={() => void handleShieldScan()}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {scanning ? 'Scanning...' : 'Scan Buffer'}
                    </button>
                  </div>

                  {shieldResult ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-[#050a14]/80 px-3 py-2 font-mono">
                        <span className="text-slate-300">Score: {shieldResult.score ?? 0}/100</span>
                        <span
                          className={
                            shieldResult.safe === false ? 'text-rose-300' : 'text-emerald-300'
                          }
                        >
                          {shieldResult.status || (shieldResult.safe ? 'CLEAN' : 'FLAGGED')}
                        </span>
                      </div>

                      {Array.isArray(shieldResult.findings) && shieldResult.findings.length > 0 ? (
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {shieldResult.findings.map((f, idx) => (
                            <div
                              key={`${f.category || 'finding'}-${idx}`}
                              className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px]"
                            >
                              <div className="flex items-center justify-between font-mono text-amber-300">
                                <span>{f.severity || 'WARN'}</span>
                                <span>Line {f.line ?? '?'}</span>
                              </div>
                              <p className="mt-1 text-slate-200">{f.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-300/90">
                          Zero security findings detected.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Run AgentShield to audit active code against GRAVITAS security invariants.
                    </p>
                  )}
                </div>
              </>
            )}

            {inspectorTab === 'context' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-100">
                    Tracked Project Contexts
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadWorkspaceTelemetry()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/50"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>

                {!contextKeeper?.contexts || contextKeeper.contexts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-700/60 bg-[#050a14]/50 p-4 text-xs text-slate-400">
                    No Context Keeper snapshots stored in SQLite WAL yet.
                  </div>
                ) : (
                  contextKeeper.contexts.map((ctx, i) => (
                    <div
                      key={`${ctx.project_name || 'ctx'}-${i}`}
                      className="aether-panel rounded-xl p-4 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-300">
                          {ctx.project_name || 'Workspace'}
                        </span>
                        <span className="font-mono text-[11px] text-cyan-300">
                          {ctx.branch || 'main'}
                        </span>
                      </div>
                      {ctx.goal && <p className="text-slate-200">{ctx.goal}</p>}
                      {ctx.left_off && (
                        <p className="text-[11px] text-slate-400">Left off: {ctx.left_off}</p>
                      )}
                      {Array.isArray(ctx.stack) && ctx.stack.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ctx.stack.map((tech) => (
                            <span
                              key={tech}
                              className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300"
                            >
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {inspectorTab === 'slices' && (
              <form onSubmit={handleDispatchSlice} className="aether-panel rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                    Autonomous Execution
                  </p>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-100">
                    Slice Dispatch
                  </h3>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono text-slate-400">
                    Target Agent
                  </label>
                  <select
                    value={sliceAgent}
                    onChange={(e) => setSliceAgent(e.target.value)}
                    className="w-full rounded-xl border border-slate-700/70 bg-[#050a14] px-3 py-2 text-xs font-mono text-slate-100 focus:border-cyan-400/70 focus:outline-none"
                  >
                    <option value="DEV-01">DEV-01 (Engineering)</option>
                    <option value="SEC-01">SEC-01 (Security Audit)</option>
                    <option value="QA-01">QA-01 (Verification)</option>
                    <option value="ARCH-01">ARCH-01 (Architecture)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-mono text-slate-400">
                    Slice Summary
                  </label>
                  <textarea
                    rows={4}
                    value={sliceSummary}
                    onChange={(e) => setSliceSummary(e.target.value)}
                    placeholder="Describe vertical engineering slice to dispatch..."
                    className="w-full resize-none rounded-xl border border-slate-700/70 bg-[#050a14] px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400/70 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={dispatchingSlice || !sliceSummary.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-4 py-2.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/30 disabled:opacity-45"
                >
                  <Rocket className="h-3.5 w-3.5" />
                  {dispatchingSlice ? 'Dispatching Slice...' : 'Dispatch Vertical Slice'}
                </button>

                {lastSlice?.slice_id && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-mono text-emerald-200">
                    Dispatched {lastSlice.slice_id} → {lastSlice.agent_id}
                  </div>
                )}
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default StudioView;
