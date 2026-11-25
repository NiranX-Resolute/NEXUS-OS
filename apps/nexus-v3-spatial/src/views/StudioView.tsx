import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  BookmarkCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileCode2,
  Folder,
  GitBranch,
  Layers,
  Play,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'

interface FsTreeEntry {
  name: string
  path: string
  abs_path?: string
  is_dir: boolean
  size: number
  ext?: string
}

interface FsTreeResponse {
  success?: boolean
  root?: string
  items?: FsTreeEntry[]
  files?: FsTreeEntry[]
  error?: string
}

interface FsReadResponse {
  success?: boolean
  path?: string
  name?: string
  size?: number
  content?: string
  error?: string
}

interface FsWriteResponse {
  success?: boolean
  path?: string
  bytes_written?: number
  error?: string
}

interface GitStatusResponse {
  success?: boolean
  branch?: string
  clean?: boolean
  staged_count?: number
  modified_count?: number
  untracked_count?: number
  total_changes?: number
  status_lines?: string[]
  error?: string
}

interface ExecVerifyResponse {
  success?: boolean
  command?: string
  exit_code?: number
  returncode?: number
  stdout?: string
  stderr?: string
  duration_ms?: number
  error?: string
}

interface ShieldFinding {
  severity: string
  category?: string
  message: string
  line?: number
  snippet?: string
}

interface ShieldScanResponse {
  success?: boolean
  safe?: boolean
  score?: number
  status?: string
  scanned_files?: number
  critical_count?: number
  high_count?: number
  medium_count?: number
  findings?: ShieldFinding[]
  quarantined_plugins?: string[]
  error?: string
}

interface ContextSnapshot {
  project_path: string
  project_name?: string
  workspace_mode?: string
  branch?: string
  goal?: string
  left_off?: string
  summary?: string
  updated_at?: string
}

interface ContextKeeperStatusResponse {
  success?: boolean
  active?: boolean
  count?: number
  contexts?: ContextSnapshot[]
  error?: string
}

interface SliceDispatchResponse {
  success?: boolean
  slice_id?: string
  agent_id?: string
  error?: string
}

type RunnerTab = 'verify' | 'shield' | 'slice' | 'context'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function getParentDir(dir: string): string {
  const clean = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!clean || clean === '.') return '.'
  const idx = clean.lastIndexOf('/')
  return idx <= 0 ? '.' : clean.slice(0, idx)
}

export const StudioView: React.FC = () => {
  const pushToast = useNexusStore((s) => s.pushToast)
  const refreshAll = useNexusStore((s) => s.refreshAll)

  const [currentDir, setCurrentDir] = useState('.')
  const [treeEntries, setTreeEntries] = useState<FsTreeEntry[]>([])
  const [treeLoading, setTreeLoading] = useState(false)

  const [openFilePath, setOpenFilePath] = useState<string>('')
  const [savedContent, setSavedContent] = useState('')
  const [editorContent, setEditorContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [fileSaving, setFileSaving] = useState(false)

  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [ckStatus, setCkStatus] = useState<ContextKeeperStatusResponse | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTab, setDrawerTab] = useState<RunnerTab>('verify')

  const [verifyCmd, setVerifyCmd] = useState('python scripts/grep_check.py')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<ExecVerifyResponse | null>(null)

  const [scanning, setScanning] = useState(false)
  const [shieldResult, setShieldResult] = useState<ShieldScanResponse | null>(null)

  const [sliceAgent, setSliceAgent] = useState('DEV-01')
  const [sliceSummary, setSliceSummary] = useState('')
  const [dispatchingSlice, setDispatchingSlice] = useState(false)
  const [lastSliceResult, setLastSliceResult] = useState<SliceDispatchResponse | null>(null)

  const loadTree = useCallback(
    async (dir: string) => {
      setTreeLoading(true)
      try {
        const res = await ipcJson<FsTreeResponse>(
          `/api/fs/tree?dir=${encodeURIComponent(dir)}`,
        )
        const list = res.items || res.files || []
        setTreeEntries(list)
        setCurrentDir(dir)
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to read workspace tree', 'error')
      } finally {
        setTreeLoading(false)
      }
    },
    [pushToast],
  )

  const loadHeaderMeta = useCallback(async () => {
    const [gitRes, ckRes] = await Promise.allSettled([
      ipcJson<GitStatusResponse>('/api/git/status'),
      ipcJson<ContextKeeperStatusResponse>('/api/context-keeper/status'),
    ])
    if (gitRes.status === 'fulfilled') {
      setGitStatus(gitRes.value)
    }
    if (ckRes.status === 'fulfilled') {
      setCkStatus(ckRes.value)
    }
  }, [])

  useEffect(() => {
    void Promise.all([loadTree('.'), loadHeaderMeta()])
  }, [loadHeaderMeta, loadTree])

  const openFile = useCallback(
    async (filePath: string) => {
      setFileLoading(true)
      try {
        const res = await ipcJson<FsReadResponse>(
          `/api/fs/read?path=${encodeURIComponent(filePath)}`,
        )
        if (res.success && typeof res.content === 'string') {
          const resolvedPath = res.path || filePath
          setOpenFilePath(resolvedPath)
          setSavedContent(res.content)
          setEditorContent(res.content)
        } else {
          pushToast(res.error || `Failed opening ${filePath}`, 'error')
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'File read error', 'error')
      } finally {
        setFileLoading(false)
      }
    },
    [pushToast],
  )

  const saveFile = useCallback(async () => {
    if (!openFilePath || fileSaving) return
    setFileSaving(true)
    try {
      const res = await ipcJson<FsWriteResponse>('/api/fs/write', {
        method: 'POST',
        body: JSON.stringify({
          path: openFilePath,
          content: editorContent,
        }),
      })
      if (res.success) {
        setSavedContent(editorContent)
        pushToast(
          `Saved ${res.path || openFilePath} (${res.bytes_written ?? editorContent.length} B)`,
          'success',
        )
        void loadHeaderMeta()
      } else {
        pushToast(res.error || 'Failed writing file', 'error')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'File write failed', 'error')
    } finally {
      setFileSaving(false)
    }
  }, [editorContent, fileSaving, loadHeaderMeta, openFilePath, pushToast])

  const runVerify = useCallback(
    async (overrideCmd?: string) => {
      const cmd = (overrideCmd ?? verifyCmd).trim()
      setDrawerOpen(true)
      setDrawerTab('verify')
      setVerifying(true)
      try {
        const res = await ipcJson<ExecVerifyResponse>('/api/exec/verify', {
          method: 'POST',
          body: JSON.stringify({ command: cmd }),
        })
        setVerifyResult(res)
        pushToast(
          res.success
            ? `Verification passed (${res.duration_ms ?? 0} ms)`
            : 'Verification returned non-zero exit status',
          res.success ? 'success' : 'warning',
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Verification failed'
        setVerifyResult({ success: false, error: message })
        pushToast(message, 'error')
      } finally {
        setVerifying(false)
      }
    },
    [pushToast, verifyCmd],
  )

  const runShieldScan = useCallback(async () => {
    setDrawerOpen(true)
    setDrawerTab('shield')
    setScanning(true)
    try {
      const payload = openFilePath
        ? { code: editorContent, filename: openFilePath }
        : {}
      const res = await ipcJson<ShieldScanResponse>('/api/security/shield-scan', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setShieldResult(res)
      const score = res.score ?? 100
      pushToast(
        `AgentShield scan: ${res.status || 'DONE'} (Score ${score}/100)`,
        score >= 90 ? 'success' : 'warning',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shield scan failed'
      setShieldResult({ success: false, error: message })
      pushToast(message, 'error')
    } finally {
      setScanning(false)
    }
  }, [editorContent, openFilePath, pushToast])

  const dispatchSlice = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      const summary =
        sliceSummary.trim() ||
        (openFilePath ? `Review and verify ${openFilePath}` : 'Workspace verification slice')
      setDrawerOpen(true)
      setDrawerTab('slice')
      setDispatchingSlice(true)
      try {
        const res = await ipcJson<SliceDispatchResponse>('/api/slices/dispatch', {
          method: 'POST',
          body: JSON.stringify({
            agent_id: sliceAgent.trim() || 'DEV-01',
            task_summary: summary,
          }),
        })
        setLastSliceResult(res)
        if (res.success) {
          pushToast(`Dispatched ${res.slice_id || 'slice'} to ${res.agent_id}`, 'success')
          setSliceSummary('')
          await refreshAll()
        } else {
          pushToast(res.error || 'Slice dispatch failed', 'error')
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Slice dispatch error', 'error')
      } finally {
        setDispatchingSlice(false)
      }
    },
    [openFilePath, pushToast, refreshAll, sliceAgent, sliceSummary],
  )

  const isDirty = Boolean(openFilePath) && editorContent !== savedContent
  const lineCount = useMemo(() => (editorContent ? editorContent.split('\n').length : 0), [editorContent])

  return (
    <div className="h-full w-full overflow-hidden p-6 animate-spatial-enter">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-6">
        {/* Top Studio Toolbar */}
        <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl px-5 py-3.5">
          {/* Left: Git & Context Keeper Status */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void loadHeaderMeta()}
              className="spatial-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-slate-200 cursor-pointer"
              title="Refresh Git & Context Keeper status"
            >
              <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono">{gitStatus?.branch || 'main'}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${
                  gitStatus?.clean
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-amber-500/15 text-amber-300'
                }`}
              >
                {gitStatus?.clean
                  ? 'clean'
                  : `${gitStatus?.total_changes ?? 0} changed`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true)
                setDrawerTab('context')
              }}
              className="spatial-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-slate-300 cursor-pointer"
            >
              <BookmarkCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Context Keeper ·{' '}
                <span className="font-mono text-slate-100">{ckStatus?.count ?? 0}</span>
              </span>
            </button>
          </div>

          {/* Right: Crisp IDE Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void saveFile()}
              disabled={!openFilePath || !isDirty || fileSaving}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-40 ${
                isDirty ? 'spatial-pill-active' : 'spatial-pill text-slate-200'
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              {fileSaving ? 'Saving' : 'Save'}
            </button>

            <button
              type="button"
              onClick={() => void runVerify()}
              disabled={verifying}
              className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-45"
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              {verifying ? 'Verifying' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => void runShieldScan()}
              disabled={scanning}
              className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer disabled:opacity-45"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              {scanning ? 'Scanning' : 'Shield'}
            </button>

            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true)
                setDrawerTab('slice')
              }}
              className="spatial-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              Dispatch Slice
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium cursor-pointer ${
                drawerOpen ? 'spatial-pill-active' : 'spatial-pill text-slate-300'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              Runner
              {drawerOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </header>

        {/* Main NexKoder Split */}
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-6 lg:grid-cols-12">
          {/* File Explorer Pane */}
          <aside className="spatial-panel flex min-h-0 flex-col rounded-3xl p-4 lg:col-span-4">
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Workspace Tree
                </span>
                <p className="truncate font-mono text-xs text-emerald-300">{currentDir}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {currentDir !== '.' && (
                  <button
                    type="button"
                    onClick={() => void loadTree(getParentDir(currentDir))}
                    aria-label="Go to parent directory"
                    className="spatial-pill rounded-xl p-1.5 text-slate-300 cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void loadTree(currentDir)}
                  aria-label="Refresh tree"
                  className="spatial-pill rounded-xl p-1.5 text-slate-300 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 space-y-1 overflow-y-auto pr-1">
              {treeEntries.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-slate-500">
                  {treeLoading ? 'Scanning workspace...' : 'Empty directory'}
                </div>
              ) : (
                treeEntries.map((entry) => {
                  const selected = !entry.is_dir && openFilePath === entry.path
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => {
                        if (entry.is_dir) {
                          void loadTree(entry.path)
                        } else {
                          void openFile(entry.path)
                        }
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                        selected
                          ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'
                          : 'border border-transparent text-slate-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {entry.is_dir ? (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                        ) : (
                          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        )}
                        <span className="truncate font-mono">{entry.name}</span>
                      </span>
                      {entry.is_dir ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      ) : (
                        <span className="shrink-0 font-mono text-[10px] text-slate-500">
                          {formatBytes(entry.size)}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Code Editor Pane */}
          <section className="spatial-panel flex min-h-0 flex-col overflow-hidden rounded-3xl lg:col-span-8">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileCode2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="truncate font-mono text-xs text-slate-200">
                  {openFilePath || 'No file open'}
                </span>
                {isDirty && (
                  <span
                    title="Unsaved modifications"
                    className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
                  />
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                {openFilePath && (
                  <>
                    <span className="font-mono">{lineCount} lines</span>
                    <button
                      type="button"
                      onClick={() => void openFile(openFilePath)}
                      disabled={fileLoading}
                      className="spatial-pill rounded-full px-2.5 py-1 text-[11px] text-slate-300 cursor-pointer"
                    >
                      Reload
                    </button>
                  </>
                )}
              </div>
            </div>

            {openFilePath ? (
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault()
                    void saveFile()
                  }
                }}
                spellCheck={false}
                aria-label="Workspace file editor"
                className="flex-1 min-h-0 w-full resize-none bg-black/20 p-5 font-mono text-[13px] leading-6 text-slate-100 focus:outline-none"
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-emerald-300">
                  <FileCode2 className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">
                  NexKoder Spatial Editor
                </h3>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">
                  Select a workspace file on the left to inspect or edit under ScopeGuard read-before-write protection.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Toggleable Bottom Runner Drawer */}
        {drawerOpen && (
          <section className="spatial-dock rounded-3xl p-4 animate-spatial-enter">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'verify', label: 'Verify Runner' },
                    { id: 'shield', label: 'AgentShield' },
                    { id: 'slice', label: 'Slice Dispatch' },
                    { id: 'context', label: 'Context Keeper' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id)}
                    className={`rounded-full border px-3.5 py-1 text-xs font-medium cursor-pointer ${
                      drawerTab === tab.id
                        ? 'spatial-pill-active'
                        : 'spatial-pill text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="spatial-pill rounded-full px-3 py-1 text-xs text-slate-400 cursor-pointer"
              >
                Collapse
              </button>
            </div>

            {drawerTab === 'verify' && (
              <div className="space-y-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void runVerify()
                  }}
                  className="flex items-center gap-2.5"
                >
                  <input
                    type="text"
                    value={verifyCmd}
                    onChange={(e) => setVerifyCmd(e.target.value)}
                    placeholder="python scripts/grep_check.py"
                    className="flex-1 rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2 font-mono text-xs text-slate-100 focus:border-emerald-400/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={verifying}
                    className="spatial-pill-active inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {verifying ? 'Running' : 'Run Check'}
                  </button>
                </form>

                {verifyResult && (
                  <div className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3.5 font-mono text-xs">
                    <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span
                        className={
                          verifyResult.success ? 'text-emerald-300' : 'text-rose-300'
                        }
                      >
                        {verifyResult.success ? 'PASS' : 'FAIL'} · exit{' '}
                        {verifyResult.exit_code ?? verifyResult.returncode ?? '?'}
                      </span>
                      {typeof verifyResult.duration_ms === 'number' && (
                        <span>{verifyResult.duration_ms} ms</span>
                      )}
                    </div>
                    <pre className="whitespace-pre-wrap text-slate-200">
                      {verifyResult.stdout || verifyResult.stderr || verifyResult.error || 'No output'}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {drawerTab === 'shield' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Target:{' '}
                    <span className="font-mono text-slate-200">
                      {openFilePath || 'Workspace Plugins'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void runShieldScan()}
                    disabled={scanning}
                    className="spatial-pill-active inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {scanning ? 'Auditing' : 'Re-Scan'}
                  </button>
                </div>

                {shieldResult && (
                  <div className="max-h-40 overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-3.5 text-xs">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-100">
                        {(shieldResult.score ?? 0) >= 90 ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-amber-400" />
                        )}
                        Status: {shieldResult.status || (shieldResult.error ? 'ERROR' : 'SCANNED')}
                      </span>
                      <span className="font-mono text-emerald-300">
                        Score {shieldResult.score ?? '—'}/100
                      </span>
                    </div>

                    {shieldResult.error ? (
                      <p className="text-rose-300">{shieldResult.error}</p>
                    ) : (shieldResult.findings?.length ?? 0) === 0 ? (
                      <p className="text-slate-400">Zero GRAVITAS / AgentShield vulnerabilities detected.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {shieldResult.findings!.map((f, idx) => (
                          <div
                            key={`${f.category || 'finding'}-${idx}`}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                          >
                            <span className="font-mono text-[11px] text-amber-300">
                              [{f.severity}] {f.line ? `L${f.line} ` : ''}
                            </span>
                            <span className="text-slate-200">{f.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {drawerTab === 'slice' && (
              <div className="space-y-3">
                <form onSubmit={(e) => void dispatchSlice(e)} className="flex flex-wrap items-center gap-2.5">
                  <select
                    value={sliceAgent}
                    onChange={(e) => setSliceAgent(e.target.value)}
                    aria-label="Target slice agent"
                    className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none"
                  >
                    <option value="DEV-01" className="bg-[#0b1016]">DEV-01</option>
                    <option value="SEC-01" className="bg-[#0b1016]">SEC-01</option>
                    <option value="QA-01" className="bg-[#0b1016]">QA-01</option>
                    <option value="SCOUT-01" className="bg-[#0b1016]">SCOUT-01</option>
                  </select>
                  <input
                    type="text"
                    value={sliceSummary}
                    onChange={(e) => setSliceSummary(e.target.value)}
                    placeholder={
                      openFilePath
                        ? `Slice objective for ${openFilePath}...`
                        : 'Describe autonomous slice objective...'
                    }
                    className="min-w-[220px] flex-1 rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2 text-xs text-slate-100 focus:border-emerald-400/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={dispatchingSlice}
                    className="spatial-pill-active inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2 text-xs font-medium cursor-pointer disabled:opacity-45"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {dispatchingSlice ? 'Dispatching' : 'Dispatch'}
                  </button>
                </form>

                {lastSliceResult && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-xs text-slate-200">
                    {lastSliceResult.success
                      ? `Slice ${lastSliceResult.slice_id} queued for ${lastSliceResult.agent_id}`
                      : lastSliceResult.error || 'Dispatch failed'}
                  </div>
                )}
              </div>
            )}

            {drawerTab === 'context' && (
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {!ckStatus?.contexts || ckStatus.contexts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-slate-400">
                    No Context Keeper snapshots recorded yet.
                  </div>
                ) : (
                  ckStatus.contexts.map((ctx) => (
                    <div
                      key={ctx.project_path}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-100">
                          {ctx.project_name || ctx.project_path}
                        </span>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {ctx.goal || ctx.left_off || ctx.summary || 'Tracked workspace context'}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-300">
                        {ctx.branch || 'main'} · {ctx.workspace_mode || 'DEV'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

export default StudioView
