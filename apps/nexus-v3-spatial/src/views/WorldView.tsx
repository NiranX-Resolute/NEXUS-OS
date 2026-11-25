import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Compass,
  Copy,
  Eye,
  Globe,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'

type WorldTab = 'scout' | 'ingests' | 'browser'
type ReachChannel = 'all' | 'web' | 'github' | 'reddit' | 'youtube' | 'twitter'
type BrowserEngineType = 'auto' | 'obscura' | 'chromium_persistent'

interface ReachDoctorData {
  ok?: boolean
  installed?: boolean
  executable?: string | null
  pinned_version?: string
  message?: string
  stdout?: string
  stderr?: string
  channels?: Record<string, string>
  install_cmd?: string
  docs?: string
  error?: string
}

interface ReachEventItem {
  id?: string
  source_url?: string
  title?: string
  content?: string
  summary?: string
  channel?: string
  workspace_mode?: string
  created_at?: string | number
}

interface ReachStatusResponse {
  success?: boolean
  status?: ReachDoctorData
  workspace_mode?: string
  air_gapped?: boolean
  recent_events?: ReachEventItem[]
  count?: number
  error?: string
}

interface ReachSearchResultItem {
  title?: string
  snippet?: string
  summary?: string
  url?: string
  link?: string
  channel?: string
  author?: string
  published_at?: string
}

interface ReachSearchResponse {
  success?: boolean
  ok?: boolean
  blocked?: boolean
  reason?: string
  error?: string
  cached?: boolean
  query?: string
  channel?: string
  results?: ReachSearchResultItem[]
  count?: number
  summary?: string
  summary_or_body?: string
  latency_ms?: number
  fetched_at?: string
  install_cmd?: string
}

interface ReachReadResponse {
  success?: boolean
  ok?: boolean
  blocked?: boolean
  reason?: string
  error?: string
  cached?: boolean
  target?: string
  source_url?: string
  channel?: string
  title?: string
  summary?: string
  summary_or_body?: string
  content?: string
  latency_ms?: number
  fetched_at?: string
  install_cmd?: string
}

interface WebIngestEvent {
  id: string
  source?: string
  url?: string
  title?: string
  prompt?: string
  response?: string
  response_text?: string
  elements_json?: string
  commentary?: string
  tars_commentary?: string
  workspace_mode?: string
  created_at?: string
}

interface WebIngestRecentResponse {
  success?: boolean
  status?: string
  workspace_mode?: string
  air_gapped?: boolean
  events?: WebIngestEvent[]
  count?: number
  error?: string
}

interface DistilledElement {
  id: number | string
  tag: string
  text?: string
  type?: string
  name?: string
  href?: string
  rect?: number[]
}

interface BrowserEngineResponse {
  success?: boolean
  engine?: string
  status?: string
  url?: string
  error?: string
  result?: {
    success?: boolean
    url?: string
    page_title?: string
    elements?: DistilledElement[]
    elements_count?: number
    latency_ms?: number
  }
  dom?: {
    success?: boolean
    url?: string
    title?: string
    elements?: DistilledElement[]
    elements_count?: number
    engine?: string
  }
}

const REACH_CHANNELS: { id: ReachChannel; label: string }[] = [
  { id: 'all', label: 'All Channels' },
  { id: 'web', label: 'Web' },
  { id: 'github', label: 'GitHub' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitter', label: 'X / Twitter' },
]

const BROWSER_ENGINES: { id: BrowserEngineType; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto Cascade', hint: 'Obscura Rust -> Persistent CDP' },
  { id: 'obscura', label: 'Obscura Rust', hint: 'Sub-100ms headless CDP' },
  { id: 'chromium_persistent', label: 'Persistent Chromium', hint: 'Shadow-DOM SPA profile' },
]

function formatTimestamp(raw?: string | number | null): string {
  if (raw === undefined || raw === null || raw === '') return 'Recent'
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString()
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString()
}

export function WorldView() {
  const telemetry = useNexusStore((s) => s.telemetry)
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode)
  const pushToast = useNexusStore((s) => s.pushToast)

  const isSilent = telemetry.workspaceMode === 'SILENT' || telemetry.airGapped
  const [activeTab, setActiveTab] = useState<WorldTab>('scout')

  // Scout Reach state
  const [reachStatus, setReachStatus] = useState<ReachStatusResponse | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchChannel, setSearchChannel] = useState<ReachChannel>('all')
  const [searching, setSearching] = useState(false)
  const [searchRes, setSearchRes] = useState<ReachSearchResponse | null>(null)

  const [readTarget, setReadTarget] = useState('')
  const [reading, setReading] = useState(false)
  const [readRes, setReadRes] = useState<ReachReadResponse | null>(null)

  // Web Ingests state
  const [ingests, setIngests] = useState<WebIngestEvent[]>([])
  const [ingestStatusLabel, setIngestStatusLabel] = useState('Connected')
  const [loadingIngests, setLoadingIngests] = useState(false)
  const [selectedIngestId, setSelectedIngestId] = useState<string>('')

  // Browser Engine / Obscura DOM state
  const [browserEngine, setBrowserEngine] = useState<BrowserEngineType>('auto')
  const [browserUrl, setBrowserUrl] = useState('https://example.com')
  const [browserQuery, setBrowserQuery] = useState('')
  const [browserLoading, setBrowserLoading] = useState(false)
  const [browserRes, setBrowserRes] = useState<BrowserEngineResponse | null>(null)

  const fetchReachStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const res = await ipcJson<ReachStatusResponse>('/api/scout/reach/status')
      setReachStatus(res)
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Unable to fetch Scout Reach status',
        'error',
      )
    } finally {
      setStatusLoading(false)
    }
  }, [pushToast])

  const fetchRecentIngests = useCallback(async () => {
    setLoadingIngests(true)
    try {
      const res = await ipcJson<WebIngestRecentResponse>('/api/bridge/web-ingest/recent?limit=25')
      if (res.status) setIngestStatusLabel(res.status)
      if (Array.isArray(res.events)) {
        setIngests(res.events)
        setSelectedIngestId((prev) =>
          prev && res.events?.some((ev) => ev.id === prev) ? prev : res.events?.[0]?.id || '',
        )
      }
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Failed loading web ingest stream',
        'error',
      )
    } finally {
      setLoadingIngests(false)
    }
  }, [pushToast])

  useEffect(() => {
    void fetchReachStatus()
    void fetchRecentIngests()
  }, [fetchReachStatus, fetchRecentIngests])

  const handleScoutSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const clean = searchQuery.trim()
    if (!clean) {
      pushToast('Enter a search query for Scout Reach', 'warning')
      return
    }
    setSearching(true)
    try {
      const res = await ipcJson<ReachSearchResponse>('/api/scout/reach/search', {
        method: 'POST',
        body: JSON.stringify({
          query: clean,
          channel: searchChannel,
          workspace_mode: telemetry.workspaceMode,
        }),
      })
      setSearchRes(res)
      if (res.blocked) {
        pushToast(res.reason || 'Blocked by SILENT mode or ScopeGuard', 'warning')
      } else if (res.ok === false || res.success === false) {
        pushToast(res.error || 'Scout search returned an error', 'error')
      } else {
        pushToast(
          `Found ${res.count ?? res.results?.length ?? 0} items on ${res.channel || searchChannel}`,
          'success',
        )
        void fetchReachStatus()
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Scout search request failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  const executeReadTarget = async (urlToRead: string) => {
    const clean = urlToRead.trim()
    if (!clean) {
      pushToast('Enter a URL to extract via Scout Reader', 'warning')
      return
    }
    setReadTarget(clean)
    setReading(true)
    try {
      const res = await ipcJson<ReachReadResponse>('/api/scout/reach/read', {
        method: 'POST',
        body: JSON.stringify({
          target: clean,
          workspace_mode: telemetry.workspaceMode,
        }),
      })
      setReadRes(res)
      if (res.blocked) {
        pushToast(res.reason || 'Read blocked by SILENT air-gap or ScopeGuard', 'warning')
      } else if (res.ok === false || res.success === false) {
        pushToast(res.error || 'Scout Reader failed on target URL', 'error')
      } else {
        pushToast(`Extracted ${res.title || clean}`, 'success')
        void fetchReachStatus()
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Scout Reader request failed', 'error')
    } finally {
      setReading(false)
    }
  }

  const handleBrowserAction = async (
    action: 'navigate' | 'inspect' | 'status',
    overrideUrl?: string,
  ) => {
    const targetUrl = (overrideUrl ?? browserUrl).trim()
    if (action === 'navigate' && !targetUrl) {
      pushToast('Enter a target URL before navigating', 'warning')
      return
    }
    if (overrideUrl !== undefined) {
      setBrowserUrl(overrideUrl)
      setActiveTab('browser')
    }

    setBrowserLoading(true)
    try {
      const res = await ipcJson<BrowserEngineResponse>('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({
          engine: browserEngine,
          action,
          url: targetUrl,
          query: browserQuery.trim(),
        }),
      })
      setBrowserRes(res)
      if (res.success === false) {
        pushToast(res.error || `Browser engine ${action} failed`, 'error')
      } else {
        pushToast(
          `Obscura / ${res.engine || browserEngine} ${action} complete`,
          'success',
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Browser engine dispatch failed', 'error')
    } finally {
      setBrowserLoading(false)
    }
  }

  const copyText = async (text: string, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      pushToast(`${label} copied to clipboard`, 'success')
    } catch {
      pushToast('Clipboard access unavailable', 'warning')
    }
  }

  const selectedIngest = useMemo(
    () => ingests.find((ev) => ev.id === selectedIngestId) || ingests[0] || null,
    [ingests, selectedIngestId],
  )

  const parsedIngestElements = useMemo(() => {
    if (!selectedIngest?.elements_json) return []
    try {
      const parsed = JSON.parse(selectedIngest.elements_json)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [selectedIngest])

  const browserElements = useMemo<DistilledElement[]>(() => {
    if (Array.isArray(browserRes?.dom?.elements)) return browserRes.dom.elements
    if (Array.isArray(browserRes?.result?.elements)) return browserRes.result.elements
    return []
  }, [browserRes])

  const doctor = reachStatus?.status
  const channelEntries = useMemo(
    () => Object.entries(doctor?.channels || {}),
    [doctor?.channels],
  )

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter">
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              World Mesh &amp; Web Intelligence
            </h1>
            <p className="text-xs text-slate-400">
              Scout Reach multi-channel reader, web ingest stream &amp; Obscura DOM inspector
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${
              isSilent
                ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
            }`}
          >
            {isSilent ? <Lock className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
            <span>{isSilent ? 'SILENT Air-Gap' : `${telemetry.workspaceMode} Egress Ready`}</span>
          </div>

          <nav className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {(
              [
                { id: 'scout', label: 'Scout & Reader', icon: Compass },
                { id: 'ingests', label: 'Web Ingests', icon: Layers },
                { id: 'browser', label: 'Obscura DOM', icon: Terminal },
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
        </div>
      </header>

      {/* Air-Gap Aware Banner */}
      {isSilent && (
        <div className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border-amber-400/30 bg-amber-500/[0.08] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/15 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-100">
                SILENT Air-Gap Mode Engaged — External Network Egress Halted
              </p>
              <p className="text-xs text-amber-200/80">
                WorkspaceGovernor blocks live Scout Reach queries and external web fetches in SILENT mode. Cached SQLite ingests and local file:/// inspection remain available.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void switchWorkspaceMode('DEV')}
            className="spatial-pill rounded-xl border-amber-300/35 bg-amber-400/15 px-4 py-2 text-xs font-medium text-amber-100 hover:bg-amber-400/25"
          >
            Restore DEV Mode
          </button>
        </div>
      )}

      {/* TAB 1: SCOUT SEARCH & WEB READER */}
      {activeTab === 'scout' && (
        <div className="flex flex-col gap-6">
          {/* Scout Readiness Strip */}
          <section className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-3xl px-6 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  doctor?.installed
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {doctor?.installed ? 'Agent Reach Ready' : 'Agent Reach CLI Missing'}
              </span>
              {doctor?.pinned_version && (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-300">
                  v{doctor.pinned_version}
                </span>
              )}
              {channelEntries.map(([ch, st]) => (
                <span
                  key={ch}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-300"
                >
                  {ch}: <span className="text-emerald-300">{st}</span>
                </span>
              ))}
              {!doctor?.installed && doctor?.install_cmd && (
                <span className="font-mono text-xs text-slate-400">
                  Install: <code className="text-emerald-300">{doctor.install_cmd}</code>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void fetchReachStatus()}
              disabled={statusLoading}
              className="spatial-pill flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statusLoading ? 'animate-spin' : ''}`} />
              <span>Probe Channels</span>
            </button>
          </section>

          {/* 2-Column Spacious Workspace: Search + Reader */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Scout Multi-Channel Search */}
            <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Scout Multi-Channel Search
                  </h2>
                  <p className="text-xs text-slate-400">
                    Query GitHub, Reddit, YouTube, X/Twitter, and web indexes
                  </p>
                </div>
                {typeof searchRes?.latency_ms === 'number' && (
                  <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                    {searchRes.latency_ms}ms{searchRes.cached ? ' · cached' : ''}
                  </span>
                )}
              </div>

              <form onSubmit={handleScoutSearch} className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search repositories, threads, videos, docs..."
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
                  />
                  <select
                    value={searchChannel}
                    onChange={(e) => setSearchChannel(e.target.value as ReachChannel)}
                    className="rounded-xl border border-white/10 bg-[#070b10]/85 px-3 py-2.5 text-xs font-medium text-slate-200 outline-none focus:border-emerald-400/50"
                  >
                    {REACH_CHANNELS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={searching || isSilent}
                    className="spatial-pill-active flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>{searching ? 'Searching...' : 'Search'}</span>
                  </button>
                </div>
              </form>

              {searchRes && (searchRes.blocked || searchRes.error) && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-xs text-amber-200">
                  {searchRes.reason || searchRes.error}
                  {searchRes.install_cmd && (
                    <div className="mt-2 font-mono text-[11px] text-slate-300">
                      {searchRes.install_cmd}
                    </div>
                  )}
                </div>
              )}

              <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                {searchRes?.results && searchRes.results.length > 0 ? (
                  searchRes.results.map((item, idx) => {
                    const targetLink = item.url || item.link || ''
                    return (
                      <article
                        key={`${targetLink || item.title || 'res'}-${idx}`}
                        className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-emerald-400/25"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-medium text-slate-100">
                            {item.title || targetLink || `Result #${idx + 1}`}
                          </h3>
                          {item.channel && (
                            <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-300">
                              {item.channel}
                            </span>
                          )}
                        </div>
                        {(item.snippet || item.summary) && (
                          <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-slate-300">
                            {item.snippet || item.summary}
                          </p>
                        )}
                        {targetLink && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="truncate font-mono text-[11px] text-slate-400">
                              {targetLink}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void executeReadTarget(targetLink)}
                                className="spatial-pill rounded-lg px-2.5 py-1 text-[11px] font-medium text-emerald-300"
                              >
                                Read Article
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleBrowserAction('navigate', targetLink)}
                                className="spatial-pill rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-300"
                              >
                                Inspect DOM
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    )
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-xs text-slate-400">
                    {searchRes
                      ? searchRes.summary || 'No matching channel entries returned.'
                      : 'Run a Scout Reach query to retrieve live structured search hits.'}
                  </div>
                )}
              </div>
            </section>

            {/* Scout Web Reader */}
            <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Scout Structured Web Reader
                  </h2>
                  <p className="text-xs text-slate-400">
                    Extract clean markdown &amp; summaries into SovereignStore
                  </p>
                </div>
                {readRes?.content && (
                  <button
                    type="button"
                    onClick={() => void copyText(readRes.content || '', 'Extracted content')}
                    className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </button>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void executeReadTarget(readTarget)
                }}
                className="flex flex-wrap gap-2"
              >
                <input
                  type="url"
                  value={readTarget}
                  onChange={(e) => setReadTarget(e.target.value)}
                  placeholder="https://github.com/..."
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none transition focus:border-emerald-400/50"
                />
                <button
                  type="submit"
                  disabled={reading || isSilent}
                  className="spatial-pill-active flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{reading ? 'Reading...' : 'Read URL'}</span>
                </button>
              </form>

              {readRes && (readRes.blocked || readRes.error) && (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-xs text-amber-200">
                  {readRes.reason || readRes.error}
                </div>
              )}

              {readRes && (readRes.content || readRes.summary_or_body) ? (
                <div className="flex max-h-[340px] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-[#070b10]/65 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                    <span className="text-sm font-medium text-slate-100">
                      {readRes.title || readRes.target}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300">
                      {readRes.channel && <span>{readRes.channel}</span>}
                      {typeof readRes.latency_ms === 'number' && (
                        <span>· {readRes.latency_ms}ms</span>
                      )}
                      {readRes.cached && <span>· cached</span>}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-300">
                    {readRes.content || readRes.summary_or_body}
                  </pre>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-xs text-slate-400">
                  Paste any public URL (GitHub, Reddit, YouTube, Docs) to distill clean content into local memory.
                </div>
              )}

              {/* Recent Reach Events Chips */}
              {Array.isArray(reachStatus?.recent_events) && reachStatus.recent_events.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Recent Reach Captures ({reachStatus.recent_events.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {reachStatus.recent_events.slice(0, 6).map((ev, idx) => (
                      <button
                        key={ev.id || `${ev.source_url}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (ev.source_url?.startsWith('search://')) {
                            const qMatch = ev.source_url.split('?q=')[1]
                            if (qMatch) setSearchQuery(decodeURIComponent(qMatch))
                          } else if (ev.source_url) {
                            setReadTarget(ev.source_url)
                            setReadRes({
                              ok: true,
                              success: true,
                              cached: true,
                              target: ev.source_url,
                              title: ev.title,
                              channel: ev.channel,
                              summary: ev.summary,
                              content: ev.content,
                            })
                          }
                        }}
                        className="spatial-pill max-w-[230px] truncate rounded-xl px-3 py-1.5 text-left text-[11px] text-slate-300"
                        title={ev.source_url || ev.title}
                      >
                        {ev.title || ev.source_url || 'Capture'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: RECENT WEB INGESTS */}
      {activeTab === 'ingests' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Recent Web Ingests</h2>
                <p className="text-xs text-slate-400">
                  {ingestStatusLabel} · {ingests.length} captured events
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchRecentIngests()}
                disabled={loadingIngests}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingIngests ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex max-h-[520px] flex-col gap-2.5 overflow-y-auto pr-1">
              {ingests.length > 0 ? (
                ingests.map((ev) => {
                  const active = selectedIngest?.id === ev.id
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedIngestId(ev.id)}
                      className={`flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition ${
                        active
                          ? 'border-emerald-400/40 bg-emerald-400/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-slate-100">
                          {ev.title || ev.url || ev.source || 'Web Ingest'}
                        </span>
                        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                          {ev.source || 'web'}
                        </span>
                      </div>
                      {ev.url && (
                        <span className="truncate font-mono text-[11px] text-slate-400">
                          {ev.url}
                        </span>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{ev.workspace_mode || 'DEV'}</span>
                        <span>{formatTimestamp(ev.created_at)}</span>
                      </div>
                    </button>
                  )
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
                  No web ingest events persisted in SQLite WAL yet.
                </div>
              )}
            </div>
          </section>

          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 lg:col-span-7">
            {selectedIngest ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-slate-100">
                      {selectedIngest.title || selectedIngest.url || selectedIngest.id}
                    </h3>
                    {selectedIngest.url && (
                      <p className="mt-1 truncate font-mono text-xs text-emerald-300/90">
                        {selectedIngest.url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedIngest.url && (
                      <button
                        type="button"
                        onClick={() => void handleBrowserAction('navigate', selectedIngest.url)}
                        className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-emerald-300"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        <span>Inspect DOM</span>
                      </button>
                    )}
                  </div>
                </div>

                {selectedIngest.prompt && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Captured Prompt
                    </span>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                      {selectedIngest.prompt}
                    </p>
                  </div>
                )}

                {(selectedIngest.response_text || selectedIngest.response) && (
                  <div className="rounded-2xl border border-white/10 bg-[#070b10]/70 p-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      Ingested Response
                    </span>
                    <pre className="mt-2 max-h-[260px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-200">
                      {selectedIngest.response_text || selectedIngest.response}
                    </pre>
                  </div>
                )}

                {(selectedIngest.tars_commentary || selectedIngest.commentary) && (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-300">
                      Telemetry Commentary
                    </span>
                    <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/90">
                      {selectedIngest.tars_commentary || selectedIngest.commentary}
                    </p>
                  </div>
                )}

                {parsedIngestElements.length > 0 && (
                  <div className="text-xs text-slate-400">
                    Distilled Interactive Nodes Captured: <span className="font-mono text-emerald-300">{parsedIngestElements.length}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center text-xs text-slate-400">
                Select a web ingest event on the left to inspect its captured payload.
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: BROWSER ENGINE / OBSCURA DOM INSPECTOR */}
      {activeTab === 'browser' && (
        <div className="flex flex-col gap-6">
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Browser Engine &amp; Obscura DOM Inspector
                </h2>
                <p className="text-xs text-slate-400">
                  Dispatch warm CDP navigation and Shadow-DOM distillation across Obscura Rust or Persistent Chromium
                </p>
              </div>
              {browserRes?.engine && (
                <span className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 font-mono text-xs text-emerald-300">
                  Active Engine: {browserRes.engine}
                </span>
              )}
            </div>

            {/* Engine Selector */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {BROWSER_ENGINES.map((eng) => {
                const selected = browserEngine === eng.id
                return (
                  <button
                    key={eng.id}
                    type="button"
                    onClick={() => setBrowserEngine(eng.id)}
                    className={`flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
                        : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="text-xs font-semibold">{eng.label}</span>
                    <span className="text-[11px] text-slate-400">{eng.hint}</span>
                  </button>
                )
              })}
            </div>

            {/* URL & Query Dispatch Controls */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="https://... or file:///C:/..."
                className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50 lg:col-span-6"
              />
              <input
                type="text"
                value={browserQuery}
                onChange={(e) => setBrowserQuery(e.target.value)}
                placeholder="Optional selector / query focus"
                className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50 lg:col-span-3"
              />
              <div className="flex flex-wrap gap-2 lg:col-span-3 lg:justify-end">
                <button
                  type="button"
                  disabled={browserLoading}
                  onClick={() => void handleBrowserAction('navigate')}
                  className="spatial-pill-active rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Navigate
                </button>
                <button
                  type="button"
                  disabled={browserLoading}
                  onClick={() => void handleBrowserAction('inspect')}
                  className="spatial-pill rounded-xl px-3.5 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
                >
                  Inspect DOM
                </button>
                <button
                  type="button"
                  disabled={browserLoading}
                  onClick={() => void handleBrowserAction('status')}
                  className="spatial-pill rounded-xl px-3.5 py-2 text-xs font-medium text-slate-300 disabled:opacity-50"
                >
                  Probe
                </button>
              </div>
            </div>
          </section>

          {/* DOM Telemetry & Distilled Elements Table */}
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Distilled Interactive DOM</h3>
                <p className="font-mono text-xs text-slate-400">
                  {browserRes?.dom?.url ||
                    browserRes?.result?.url ||
                    browserRes?.url ||
                    'Awaiting browser dispatch'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                {(browserRes?.dom?.title || browserRes?.result?.page_title) && (
                  <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1">
                    {browserRes.dom?.title || browserRes.result?.page_title}
                  </span>
                )}
                {typeof browserRes?.result?.latency_ms === 'number' && (
                  <span className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-emerald-300">
                    {browserRes.result.latency_ms}ms
                  </span>
                )}
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono">
                  {browserElements.length} elements
                </span>
              </div>
            </div>

            {browserElements.length > 0 ? (
              <div className="max-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-[#070b10]/60">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-[#0b1016]/95 text-[11px] uppercase tracking-wider text-slate-400">
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-2.5">ID</th>
                      <th className="px-4 py-2.5">Tag</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Text / Label</th>
                      <th className="px-4 py-2.5">Target / Rect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-slate-200">
                    {browserElements.map((el, idx) => (
                      <tr key={`${el.id}-${idx}`} className="hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5 font-mono text-emerald-300">[{el.id}]</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{el.tag}</td>
                        <td className="px-4 py-2.5 text-slate-400">{el.type || '—'}</td>
                        <td className="max-w-xs truncate px-4 py-2.5">{el.text || el.name || '—'}</td>
                        <td className="max-w-xs truncate px-4 py-2.5 font-mono text-[11px] text-slate-400">
                          {el.href || (Array.isArray(el.rect) ? el.rect.join(', ') : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-xs text-slate-400">
                {browserRes?.error
                  ? browserRes.error
                  : 'Run Navigate or Inspect DOM to populate the warm distilled element map.'}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default WorldView
