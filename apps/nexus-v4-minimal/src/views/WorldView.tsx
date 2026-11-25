import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  Globe,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

type WorldTab = 'scout' | 'ingests' | 'browser';
type ScoutMode = 'search' | 'read';
type BrowserEngineType = 'auto' | 'obscura' | 'chromium_persistent';
type BrowserActionType = 'inspect' | 'navigate' | 'status';

interface ReachStatusPayload {
  success?: boolean;
  workspace_mode?: string;
  air_gapped?: boolean;
  count?: number;
  status?: {
    ok?: boolean;
    installed?: boolean;
    executable?: string | null;
    pinned_version?: string;
    message?: string;
    stdout?: string;
    stderr?: string;
    error?: string;
    install_cmd?: string;
    docs?: string;
    channels?: Record<string, string>;
  };
  recent_events?: Array<{
    id?: string;
    source_url?: string;
    title?: string;
    channel?: string;
    summary?: string;
    content?: string;
    workspace_mode?: string;
    created_at?: string | number;
  }>;
  error?: string;
}

interface ScoutSearchItem {
  title?: string;
  url?: string;
  link?: string;
  source_url?: string;
  snippet?: string;
  summary?: string;
  channel?: string;
}

interface ScoutSearchResult {
  success?: boolean;
  ok?: boolean;
  blocked?: boolean;
  installed?: boolean;
  cached?: boolean;
  query?: string;
  channel?: string;
  results?: ScoutSearchItem[];
  count?: number;
  summary?: string;
  reason?: string;
  error?: string;
  install_cmd?: string;
  latency_ms?: number;
  workspace_mode?: string;
}

interface ScoutReadResult {
  success?: boolean;
  ok?: boolean;
  blocked?: boolean;
  installed?: boolean;
  cached?: boolean;
  target?: string;
  source_url?: string;
  channel?: string;
  title?: string;
  summary?: string;
  summary_or_body?: string;
  content?: string;
  reason?: string;
  error?: string;
  install_cmd?: string;
  latency_ms?: number;
  fetched_at?: string;
  workspace_mode?: string;
}

interface WebIngestEvent {
  id: string;
  source?: string;
  url?: string;
  title?: string;
  prompt?: string;
  response?: string;
  response_text?: string;
  elements_json?: string;
  commentary?: string;
  tars_commentary?: string;
  workspace_mode?: string;
  created_at?: string;
}

interface WebIngestRecentPayload {
  success?: boolean;
  status?: string;
  workspace_mode?: string;
  air_gapped?: boolean;
  events?: WebIngestEvent[];
  count?: number;
  error?: string;
}

interface BrowserDomElement {
  id?: number | string;
  tag?: string;
  text?: string;
  type?: string;
  href?: string;
  rect?: number[];
  center?: number[];
}

interface BrowserEnginePayload {
  success?: boolean;
  engine?: string;
  status?: string;
  url?: string;
  error?: string;
  result?: {
    success?: boolean;
    url?: string;
    page_title?: string;
    elements?: BrowserDomElement[];
    elements_count?: number;
    latency_ms?: number;
  };
  dom?: {
    success?: boolean;
    url?: string;
    title?: string;
    elements?: BrowserDomElement[];
    elements_count?: number;
    engine?: string;
  };
}

const SCOUT_CHANNELS = ['all', 'web', 'github', 'reddit', 'youtube', 'twitter', 'bilibili'] as const;

function formatTime(raw?: string | number | null): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const num = typeof raw === 'number' ? raw : Number(raw);
  const d =
    Number.isFinite(num) && num > 0
      ? new Date(num > 1e12 ? num : num * 1000)
      : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseElementsCount(rawJson?: string): number {
  if (!rawJson) return 0;
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function WorldView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<WorldTab>('scout');
  const [syncing, setSyncing] = useState(false);
  const [modeSwitching, setModeSwitching] = useState(false);

  const [reachStatus, setReachStatus] = useState<ReachStatusPayload | null>(null);
  const [scoutMode, setScoutMode] = useState<ScoutMode>('search');
  const [scoutChannel, setScoutChannel] = useState<string>('all');
  const [scoutInput, setScoutInput] = useState('');
  const [scoutBusy, setScoutBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<ScoutSearchResult | null>(null);
  const [readResult, setReadResult] = useState<ScoutReadResult | null>(null);

  const [ingestsMeta, setIngestsMeta] = useState<WebIngestRecentPayload | null>(null);
  const [ingestsFilter, setIngestsFilter] = useState('');
  const [selectedIngestId, setSelectedIngestId] = useState<string | null>(null);

  const [browserEngine, setBrowserEngine] = useState<BrowserEngineType>('auto');
  const [browserAction, setBrowserAction] = useState<BrowserActionType>('inspect');
  const [browserUrl, setBrowserUrl] = useState('');
  const [browserQuery, setBrowserQuery] = useState('');
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserOutput, setBrowserOutput] = useState<BrowserEnginePayload | null>(null);

  const isSilent = telemetry.workspaceMode === 'SILENT' || Boolean(telemetry.airGapped);

  const loadWorldContext = useCallback(async () => {
    setSyncing(true);
    try {
      const [statusRes, ingestsRes] = await Promise.allSettled([
        ipcJson<ReachStatusPayload>('/api/scout/reach/status'),
        ipcJson<WebIngestRecentPayload>('/api/bridge/web-ingest/recent?limit=30'),
      ]);

      if (statusRes.status === 'fulfilled') {
        setReachStatus(statusRes.value);
      }
      if (ingestsRes.status === 'fulfilled') {
        setIngestsMeta(ingestsRes.value);
        const list = Array.isArray(ingestsRes.value.events) ? ingestsRes.value.events : [];
        setSelectedIngestId((prev) => {
          if (prev && list.some((e) => e.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      }
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorldContext();
  }, [loadWorldContext]);

  const handleExitSilent = async () => {
    setModeSwitching(true);
    try {
      const ok = await switchWorkspaceMode('DEV');
      if (ok) {
        await loadWorldContext();
      }
    } finally {
      setModeSwitching(false);
    }
  };

  const runReadTarget = useCallback(
    async (targetUrl: string) => {
      const clean = targetUrl.trim();
      if (!clean) {
        pushToast('Enter a target URL to read', 'warn');
        return;
      }
      setScoutMode('read');
      setScoutInput(clean);
      setScoutBusy(true);
      try {
        const res = await ipcJson<ScoutReadResult>('/api/scout/reach/read', {
          method: 'POST',
          body: JSON.stringify({
            target: clean,
            workspace_mode: telemetry.workspaceMode,
          }),
        });
        setReadResult(res);
        if (res.blocked) {
          pushToast(res.reason || 'Blocked by WorkspaceGovernor / ScopeGuard', 'warn');
        } else if (res.ok || res.success) {
          pushToast(res.cached ? 'Loaded cached read from SovereignStore' : 'Scout read completed', 'success');
          void loadWorldContext();
        } else {
          pushToast(res.error || 'Scout read failed', 'error');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scout read request failed';
        setReadResult({ success: false, ok: false, error: msg, target: clean });
        pushToast(msg, 'error');
      } finally {
        setScoutBusy(false);
      }
    },
    [loadWorldContext, pushToast, telemetry.workspaceMode]
  );

  const handleScoutSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = scoutInput.trim();
    if (!clean) {
      pushToast(scoutMode === 'search' ? 'Enter a search query' : 'Enter a URL to read', 'warn');
      return;
    }

    if (scoutMode === 'read') {
      await runReadTarget(clean);
      return;
    }

    setScoutBusy(true);
    try {
      const res = await ipcJson<ScoutSearchResult>('/api/scout/reach/search', {
        method: 'POST',
        body: JSON.stringify({
          query: clean,
          channel: scoutChannel,
          workspace_mode: telemetry.workspaceMode,
        }),
      });
      setSearchResult(res);
      if (res.blocked) {
        pushToast(res.reason || 'Search blocked in SILENT mode', 'warn');
      } else if (res.ok || res.success) {
        pushToast(
          res.cached
            ? 'Loaded cached search findings'
            : `Found ${res.count ?? res.results?.length ?? 0} result(s)`,
          'success'
        );
        void loadWorldContext();
      } else {
        pushToast(res.error || 'Scout search failed', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scout search request failed';
      setSearchResult({ success: false, ok: false, error: msg, query: clean });
      pushToast(msg, 'error');
    } finally {
      setScoutBusy(false);
    }
  };

  const handleBrowserSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (browserAction === 'navigate' && !browserUrl.trim()) {
      pushToast('Target URL is required for navigation', 'warn');
      return;
    }
    setBrowserBusy(true);
    try {
      const res = await ipcJson<BrowserEnginePayload>('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({
          engine: browserEngine,
          action: browserAction,
          url: browserUrl.trim(),
          query: browserQuery.trim(),
        }),
      });
      setBrowserOutput(res);
      if (res.success) {
        pushToast(`Browser engine (${res.engine || browserEngine}) completed ${browserAction}`, 'success');
      } else {
        pushToast(res.error || 'Browser engine dispatch failed', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Browser engine request failed';
      setBrowserOutput({ success: false, error: msg, engine: browserEngine });
      pushToast(msg, 'error');
    } finally {
      setBrowserBusy(false);
    }
  };

  const filteredIngests = useMemo(() => {
    const events = Array.isArray(ingestsMeta?.events) ? ingestsMeta.events : [];
    const q = ingestsFilter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((ev) =>
      [ev.title, ev.url, ev.source, ev.prompt, ev.response, ev.response_text]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [ingestsFilter, ingestsMeta?.events]);

  const selectedIngest = useMemo(
    () => filteredIngests.find((ev) => ev.id === selectedIngestId) ?? filteredIngests[0] ?? null,
    [filteredIngests, selectedIngestId]
  );

  const reachDiagnostic = reachStatus?.status;
  const reachTone = useMemo(() => {
    if (isSilent) {
      return {
        badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        label: 'AIR-GAPPED',
      };
    }
    if (reachDiagnostic?.ok) {
      return {
        badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        label: 'SCOUT READY',
      };
    }
    if (reachDiagnostic && reachDiagnostic.installed === false) {
      return {
        badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
        label: 'CLI MISSING',
      };
    }
    return {
      badge: 'border-white/[0.1] bg-white/[0.03] text-zinc-400',
      label: 'DIAGNOSTIC',
    };
  }, [isSilent, reachDiagnostic]);

  const browserElements = useMemo(() => {
    if (Array.isArray(browserOutput?.dom?.elements)) {
      return browserOutput.dom.elements;
    }
    if (Array.isArray(browserOutput?.result?.elements)) {
      return browserOutput.result.elements;
    }
    return [];
  }, [browserOutput]);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto bg-[#090a0c] p-6 text-zinc-100">
      {/* Air-Gap Banner when SILENT mode is active */}
      {isSilent && (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-0.5">
              <p className="text-[13px] font-medium text-amber-200">
                SILENT Air-Gap Mode Active
              </p>
              <p className="text-xs text-amber-200/75">
                Outbound Scout Search, live Web Reader fetches, and external web ingestion are deterministically blocked by WorkspaceGovernor. Cached SovereignStore reads remain inspectable.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={modeSwitching}
            onClick={() => void handleExitSilent()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50"
          >
            {modeSwitching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Switch to DEV
          </button>
        </section>
      )}

      {/* Single-Row Monograph Header */}
      <header className="monograph-surface rounded-lg p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Globe className="h-4 w-4 text-emerald-400" />
              <h1 className="text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                World &amp; Web Intelligence
              </h1>
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] tracking-wider ${reachTone.badge}`}
              >
                {reachTone.label}
              </span>
              <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                INGESTS {ingestsMeta?.count ?? ingestsMeta?.events?.length ?? 0}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              SCOUT-01 multi-channel discovery, Shadow-DOM web ingest history, and Obscura / Chromium DOM inspection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              aria-label="World view sections"
              className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5"
            >
              {(
                [
                  { id: 'scout', label: 'Scout & Reader' },
                  { id: 'ingests', label: 'Web Ingests' },
                  { id: 'browser', label: 'Browser Engine' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition ${
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

            <button
              type="button"
              onClick={() => void loadWorldContext()}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${syncing ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>
      </header>

      {/* Tab 1: Scout Search & Web Reader */}
      {activeTab === 'scout' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5">
                <button
                  type="button"
                  onClick={() => setScoutMode('search')}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                    scoutMode === 'search'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Search className="h-3.5 w-3.5" />
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => setScoutMode('read')}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition ${
                    scoutMode === 'read'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  Read URL
                </button>
              </div>

              {scoutMode === 'search' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="scout-channel" className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                    Channel
                  </label>
                  <select
                    id="scout-channel"
                    value={scoutChannel}
                    onChange={(e) => setScoutChannel(e.target.value)}
                    className="rounded-md border border-white/[0.08] bg-[#090a0c] px-2.5 py-1 font-mono text-xs text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
                  >
                    {SCOUT_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <form onSubmit={handleScoutSubmit} className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={scoutInput}
                onChange={(e) => setScoutInput(e.target.value)}
                placeholder={
                  scoutMode === 'search'
                    ? 'Search across public channels (e.g. sqlite-vec local hybrid retrieval)...'
                    : 'Enter target URL (https://github.com/..., Reddit, YouTube, or article)...'
                }
                className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3.5 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={scoutBusy}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {scoutBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : scoutMode === 'search' ? (
                  <Search className="h-3.5 w-3.5" />
                ) : (
                  <Compass className="h-3.5 w-3.5" />
                )}
                {scoutMode === 'search' ? 'Run Search' : 'Read Target'}
              </button>
            </form>

            {/* Scout Search Output */}
            {scoutMode === 'search' && searchResult && (
              <div className="space-y-4 border-t border-white/[0.08] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-zinc-400 tabular-nums">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 ${
                        searchResult.blocked
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : searchResult.ok || searchResult.success
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {searchResult.blocked
                        ? 'BLOCKED'
                        : searchResult.ok || searchResult.success
                        ? searchResult.cached
                          ? 'CACHED'
                          : 'LIVE'
                        : 'ERROR'}
                    </span>
                    {searchResult.channel && <span>CHANNEL · {searchResult.channel}</span>}
                    {typeof searchResult.count === 'number' && <span>ITEMS · {searchResult.count}</span>}
                    {typeof searchResult.latency_ms === 'number' && (
                      <span>{searchResult.latency_ms.toFixed(1)} ms</span>
                    )}
                  </div>
                </div>

                {(searchResult.error || searchResult.reason) && (
                  <div className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs text-amber-200">
                    <p>{searchResult.reason || searchResult.error}</p>
                    {searchResult.install_cmd && (
                      <p className="mt-1.5 font-mono text-[11px] text-zinc-300">
                        Install: <code>{searchResult.install_cmd}</code>
                      </p>
                    )}
                  </div>
                )}

                {searchResult.summary && (
                  <p className="text-xs leading-relaxed text-zinc-300">{searchResult.summary}</p>
                )}

                {Array.isArray(searchResult.results) && searchResult.results.length > 0 ? (
                  <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08] bg-[#090a0c]">
                    {searchResult.results.map((item, idx) => {
                      const targetUrl = item.url || item.link || item.source_url || '';
                      return (
                        <div key={`${item.title || 'res'}-${idx}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13px] font-medium text-zinc-100">
                                {item.title || targetUrl || `Finding #${idx + 1}`}
                              </span>
                              {item.channel && (
                                <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">
                                  {item.channel}
                                </span>
                              )}
                            </div>
                            {(item.snippet || item.summary) && (
                              <p className="text-xs leading-relaxed text-zinc-400">
                                {item.snippet || item.summary}
                              </p>
                            )}
                            {targetUrl && (
                              <p className="truncate font-mono text-[11px] text-zinc-500">{targetUrl}</p>
                            )}
                          </div>
                          {targetUrl && (
                            <button
                              type="button"
                              onClick={() => void runReadTarget(targetUrl)}
                              className="inline-flex shrink-0 items-center gap-1 rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                              Read
                              <ExternalLink className="h-3 w-3 text-zinc-500" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (searchResult.ok || searchResult.success) && (
                    <p className="text-xs text-zinc-500">No structured items returned for this query.</p>
                  )
                )}
              </div>
            )}

            {/* Scout Read Output */}
            {scoutMode === 'read' && readResult && (
              <div className="space-y-4 border-t border-white/[0.08] pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-zinc-400 tabular-nums">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 ${
                        readResult.blocked
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : readResult.ok || readResult.success
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/30 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {readResult.blocked
                        ? 'BLOCKED'
                        : readResult.ok || readResult.success
                        ? readResult.cached
                          ? 'CACHED'
                          : 'EXTRACTED'
                        : 'ERROR'}
                    </span>
                    {readResult.channel && <span>CHANNEL · {readResult.channel}</span>}
                    {typeof readResult.latency_ms === 'number' && (
                      <span>{readResult.latency_ms.toFixed(1)} ms</span>
                    )}
                    {readResult.fetched_at && <span>{formatTime(readResult.fetched_at)}</span>}
                  </div>
                </div>

                {(readResult.error || readResult.reason) && (
                  <div className="rounded-md border border-amber-500/25 bg-amber-500/[0.06] p-3.5 text-xs text-amber-200">
                    <p>{readResult.reason || readResult.error}</p>
                    {readResult.install_cmd && (
                      <p className="mt-1.5 font-mono text-[11px] text-zinc-300">
                        Install: <code>{readResult.install_cmd}</code>
                      </p>
                    )}
                  </div>
                )}

                {(readResult.title || readResult.summary || readResult.content) && (
                  <article className="space-y-3 rounded-md border border-white/[0.08] bg-[#090a0c] p-5">
                    <div className="space-y-1">
                      <h2 className="text-sm font-medium text-zinc-100">
                        {readResult.title || readResult.target || 'Extracted Page'}
                      </h2>
                      {(readResult.source_url || readResult.target) && (
                        <p className="truncate font-mono text-[11px] text-zinc-500">
                          {readResult.source_url || readResult.target}
                        </p>
                      )}
                    </div>
                    {readResult.summary && (
                      <p className="border-l-2 border-emerald-500/40 pl-3 text-xs leading-relaxed text-zinc-300">
                        {readResult.summary}
                      </p>
                    )}
                    {(readResult.content || readResult.summary_or_body) && (
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded border border-white/[0.06] bg-[#0e1014] p-4 font-mono text-xs leading-relaxed text-zinc-300">
                        {readResult.content || readResult.summary_or_body}
                      </pre>
                    )}
                  </article>
                )}
              </div>
            )}

            {((scoutMode === 'search' && !searchResult) || (scoutMode === 'read' && !readResult)) && (
              <div className="rounded-md border border-dashed border-white/[0.08] px-5 py-10 text-center">
                <p className="text-xs text-zinc-400">
                  {scoutMode === 'search'
                    ? 'Query public developer channels via SCOUT-01 or pick a recent event from the diagnostic rail.'
                    : 'Paste any public URL to extract structured Markdown and persist it into SovereignStore.'}
                </p>
              </div>
            )}
          </section>

          {/* Right Rail: Reach Doctor & Recent Events */}
          <aside className="flex flex-col gap-6 xl:col-span-4">
            <section className="monograph-surface space-y-4 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-medium text-zinc-100">Channel Diagnostics</h2>
                <span className="font-mono text-[11px] text-zinc-500">
                  {reachDiagnostic?.pinned_version ? `v${reachDiagnostic.pinned_version}` : 'agent-reach'}
                </span>
              </div>

              {reachDiagnostic ? (
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                    <span className="text-zinc-400">CLI Binary</span>
                    <span className={`font-mono ${reachDiagnostic.installed ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {reachDiagnostic.installed ? 'Installed' : 'Not Found'}
                    </span>
                  </div>
                  {reachDiagnostic.executable && (
                    <p className="truncate font-mono text-[11px] text-zinc-500" title={reachDiagnostic.executable}>
                      {reachDiagnostic.executable}
                    </p>
                  )}
                  {reachDiagnostic.message && (
                    <p className="leading-relaxed text-zinc-400">{reachDiagnostic.message}</p>
                  )}
                  {reachDiagnostic.channels && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {Object.entries(reachDiagnostic.channels).map(([channelName, state]) => (
                        <div
                          key={channelName}
                          className="flex items-center justify-between rounded border border-white/[0.06] bg-[#090a0c] px-2.5 py-1.5 font-mono text-[11px]"
                        >
                          <span className="text-zinc-300">{channelName}</span>
                          <span className={state === 'ok' || state === 'ready' ? 'text-emerald-400' : 'text-zinc-500'}>
                            {state}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {reachDiagnostic.stdout && (
                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-white/[0.06] bg-[#090a0c] p-3 font-mono text-[11px] text-zinc-400">
                      {reachDiagnostic.stdout}
                    </pre>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Awaiting diagnostics from /api/scout/reach/status.</p>
              )}
            </section>

            <section className="monograph-surface space-y-3 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-medium text-zinc-100">Recent Reach Ledger</h2>
                <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                  {reachStatus?.recent_events?.length ?? 0}
                </span>
              </div>

              {Array.isArray(reachStatus?.recent_events) && reachStatus.recent_events.length > 0 ? (
                <div className="max-h-[300px] divide-y divide-white/[0.06] overflow-y-auto rounded-md border border-white/[0.06] bg-[#090a0c]">
                  {reachStatus.recent_events.map((ev, idx) => (
                    <button
                      key={ev.id || `${ev.source_url}-${idx}`}
                      type="button"
                      onClick={() => {
                        if (ev.source_url && !ev.source_url.startsWith('search://')) {
                          void runReadTarget(ev.source_url);
                        } else if (ev.source_url) {
                          setScoutInput(ev.title?.replace(/^Search:\s*/i, '') || ev.source_url);
                        }
                      }}
                      className="flex w-full flex-col gap-1 px-3.5 py-2.5 text-left transition hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-zinc-200">
                          {ev.title || ev.source_url || 'Reach event'}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase text-zinc-500">
                          {ev.channel || 'web'}
                        </span>
                      </div>
                      {ev.summary && (
                        <p className="line-clamp-2 text-[11px] text-zinc-400">{ev.summary}</p>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No cached reach events recorded yet.</p>
              )}
            </section>
          </aside>
        </div>
      )}

      {/* Tab 2: Recent Web Ingests */}
      {activeTab === 'ingests' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="text-[13px] font-medium text-zinc-100">Shadow-DOM Web Ingests</h2>
                <p className="font-mono text-[11px] text-zinc-500">
                  {ingestsMeta?.status || 'Connected'} · {filteredIngests.length} shown
                </p>
              </div>
              <span className="rounded border border-white/[0.08] px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                {ingestsMeta?.workspace_mode || telemetry.workspaceMode}
              </span>
            </div>

            <input
              type="text"
              value={ingestsFilter}
              onChange={(e) => setIngestsFilter(e.target.value)}
              placeholder="Filter ingests by title, URL, source, or prompt..."
              className="rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            />

            {filteredIngests.length > 0 ? (
              <div className="max-h-[540px] divide-y divide-white/[0.06] overflow-y-auto rounded-md border border-white/[0.08] bg-[#090a0c]">
                {filteredIngests.map((ev) => {
                  const active = selectedIngest?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedIngestId(ev.id)}
                      className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left transition ${
                        active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium text-zinc-100">
                          {ev.title || ev.url || ev.id}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-500 tabular-nums">
                          {formatTime(ev.created_at)}
                        </span>
                      </div>
                      {ev.url && (
                        <p className="truncate font-mono text-[11px] text-zinc-500">{ev.url}</p>
                      )}
                      <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
                        <span className="rounded border border-white/[0.06] px-1.5 py-0.5">
                          {ev.source || 'web'}
                        </span>
                        {ev.workspace_mode && <span>{ev.workspace_mode}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                No web ingest events match the current filter.
              </div>
            )}
          </section>

          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-7">
            {selectedIngest ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-sm font-medium text-zinc-100">
                      {selectedIngest.title || selectedIngest.url || selectedIngest.id}
                    </h3>
                    {selectedIngest.url && (
                      <p className="truncate font-mono text-[11px] text-zinc-400">
                        {selectedIngest.url}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 tabular-nums">
                    <span className="rounded border border-white/[0.08] px-2 py-0.5">
                      {selectedIngest.source || 'bridge'}
                    </span>
                    <span>{formatTime(selectedIngest.created_at)}</span>
                  </div>
                </div>

                {selectedIngest.prompt && (
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      Prompt / Context
                    </span>
                    <p className="rounded-md border border-white/[0.06] bg-[#090a0c] p-3 text-xs leading-relaxed text-zinc-200">
                      {selectedIngest.prompt}
                    </p>
                  </div>
                )}

                {(selectedIngest.response || selectedIngest.response_text) && (
                  <div className="space-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      Captured Payload
                    </span>
                    <pre className="max-h-[340px] overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.06] bg-[#090a0c] p-4 font-mono text-xs leading-relaxed text-zinc-300">
                      {selectedIngest.response || selectedIngest.response_text}
                    </pre>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3 font-mono text-[11px] text-zinc-400 tabular-nums">
                  <span>
                    {selectedIngest.commentary || selectedIngest.tars_commentary || 'No commentary recorded'}
                  </span>
                  <span>
                    DOM ELEMENTS · {parseElementsCount(selectedIngest.elements_json)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[260px] items-center justify-center text-xs text-zinc-500">
                Select an ingested web event on the left to inspect its captured payload.
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 3: Browser Engine / Obscura DOM Inspector */}
      {activeTab === 'browser' && (
        <div className="flex flex-col gap-6">
          <section className="monograph-surface rounded-lg p-6">
            <form onSubmit={handleBrowserSubmit} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <h2 className="text-[13px] font-medium text-zinc-100">
                    Browser Engine &amp; Obscura DOM Inspector
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-zinc-500">
                  POST /api/bridge/browser-engine
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="space-y-1.5 md:col-span-3">
                  <label htmlFor="browser-engine-select" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    Engine
                  </label>
                  <select
                    id="browser-engine-select"
                    value={browserEngine}
                    onChange={(e) => setBrowserEngine(e.target.value as BrowserEngineType)}
                    className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="auto">auto</option>
                    <option value="obscura">obscura</option>
                    <option value="chromium_persistent">chromium_persistent</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="browser-action-select" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    Action
                  </label>
                  <select
                    id="browser-action-select"
                    value={browserAction}
                    onChange={(e) => setBrowserAction(e.target.value as BrowserActionType)}
                    className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="inspect">inspect</option>
                    <option value="navigate">navigate</option>
                    <option value="status">status</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-4">
                  <label htmlFor="browser-url-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    Target URL
                  </label>
                  <input
                    id="browser-url-input"
                    type="text"
                    value={browserUrl}
                    onChange={(e) => setBrowserUrl(e.target.value)}
                    placeholder="https://example.com or file:///..."
                    className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-3">
                  <label htmlFor="browser-query-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                    Query / Filter
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="browser-query-input"
                      type="text"
                      value={browserQuery}
                      onChange={(e) => setBrowserQuery(e.target.value)}
                      placeholder="Optional selector/query"
                      className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={browserBusy}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {browserBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Dispatch
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </section>

          <section className="monograph-surface space-y-4 rounded-lg p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-400" />
                <h3 className="text-[13px] font-medium text-zinc-100">DOM Inspection Output</h3>
              </div>
              {browserOutput && (
                <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-400 tabular-nums">
                  <span
                    className={`rounded border px-2 py-0.5 ${
                      browserOutput.success
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    {browserOutput.success ? 'ACTIVE' : 'FAILED'}
                  </span>
                  <span>ENGINE · {browserOutput.engine || browserEngine}</span>
                  <span>
                    ELEMENTS ·{' '}
                    {browserOutput.dom?.elements_count ??
                      browserOutput.result?.elements_count ??
                      browserElements.length}
                  </span>
                  {typeof browserOutput.result?.latency_ms === 'number' && (
                    <span>{browserOutput.result.latency_ms.toFixed(2)} ms</span>
                  )}
                </div>
              )}
            </div>

            {browserOutput?.error && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-xs text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{browserOutput.error}</span>
              </div>
            )}

            {browserOutput ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 rounded-md border border-white/[0.06] bg-[#090a0c] p-4 font-mono text-xs sm:grid-cols-3">
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Resolved URL</span>
                    <span className="mt-1 block truncate text-zinc-200">
                      {browserOutput.dom?.url || browserOutput.result?.url || browserOutput.url || 'about:blank'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Page Title</span>
                    <span className="mt-1 block truncate text-zinc-200">
                      {browserOutput.dom?.title || browserOutput.result?.page_title || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Engine State</span>
                    <span className="mt-1 block text-emerald-300">
                      {browserOutput.status || (browserOutput.success ? 'inspected' : 'error')}
                    </span>
                  </div>
                </div>

                {browserElements.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-white/[0.08] bg-[#090a0c]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.08] font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          <th className="px-3.5 py-2.5">ID</th>
                          <th className="px-3.5 py-2.5">Tag</th>
                          <th className="px-3.5 py-2.5">Text / Label</th>
                          <th className="px-3.5 py-2.5">Center</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {browserElements.map((el, idx) => (
                          <tr key={`${el.id ?? idx}`} className="hover:bg-white/[0.02]">
                            <td className="px-3.5 py-2 font-mono text-emerald-400 tabular-nums">
                              [{el.id ?? idx + 1}]
                            </td>
                            <td className="px-3.5 py-2 font-mono text-zinc-300">{el.tag || 'node'}</td>
                            <td className="max-w-md truncate px-3.5 py-2 text-zinc-200">
                              {el.text || el.href || '—'}
                            </td>
                            <td className="px-3.5 py-2 font-mono text-zinc-400 tabular-nums">
                              {Array.isArray(el.center) ? `${el.center[0]}, ${el.center[1]}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Session attached cleanly. Navigate to a local or remote target URL to distill interactive DOM nodes.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-5 py-10 text-center text-xs text-zinc-500">
                Dispatch an <code className="font-mono text-zinc-300">inspect</code> or <code className="font-mono text-zinc-300">navigate</code> operation to examine the active Obscura or Chromium Persistent DOM tree.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default WorldView;
