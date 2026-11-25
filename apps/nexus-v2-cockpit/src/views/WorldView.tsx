import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';

type WorldSubTab = 'scout' | 'ingests' | 'obscura';
type ScoutMode = 'search' | 'read';
type BrowserEngineId = 'auto' | 'obscura' | 'chromium_persistent';

interface ScoutStatusData {
  ok?: boolean;
  installed?: boolean;
  executable?: string;
  pinned_version?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  install_cmd?: string;
  docs?: string;
  channels?: Record<string, string>;
}

interface ReachEventItem {
  id?: string;
  source_url?: string;
  title?: string;
  channel?: string;
  summary?: string;
  content?: string;
  workspace_mode?: string;
  created_at?: string;
}

interface ScoutStatusResponse {
  success?: boolean;
  status?: ScoutStatusData;
  workspace_mode?: string;
  air_gapped?: boolean;
  recent_events?: ReachEventItem[];
  count?: number;
  error?: string;
}

interface ScoutSearchResultItem {
  title?: string;
  snippet?: string;
  url?: string;
  source_url?: string;
  link?: string;
  channel?: string;
}

interface ScoutSearchResponse {
  success?: boolean;
  ok?: boolean;
  blocked?: boolean;
  reason?: string;
  error?: string;
  cached?: boolean;
  query?: string;
  channel?: string;
  results?: ScoutSearchResultItem[];
  count?: number;
  summary?: string;
  latency_ms?: number;
  workspace_mode?: string;
}

interface ScoutReadResponse {
  success?: boolean;
  ok?: boolean;
  blocked?: boolean;
  reason?: string;
  error?: string;
  cached?: boolean;
  target?: string;
  source_url?: string;
  channel?: string;
  title?: string;
  summary?: string;
  content?: string;
  fetched_at?: string;
  latency_ms?: number;
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

interface WebIngestRecentResponse {
  success?: boolean;
  status?: string;
  workspace_mode?: string;
  air_gapped?: boolean;
  events?: WebIngestEvent[];
  count?: number;
  error?: string;
}

interface BrowserElementItem {
  id: number | string;
  tag?: string;
  text?: string;
  type?: string;
  name?: string;
  href?: string;
  rect?: number[];
  center?: number[];
}

interface BrowserDomPayload {
  success?: boolean;
  url?: string;
  title?: string;
  page_title?: string;
  elements?: BrowserElementItem[];
  elements_count?: number;
  latency_ms?: number;
  engine?: string;
}

interface BrowserEngineResponse {
  success?: boolean;
  engine?: string;
  status?: string;
  url?: string;
  error?: string;
  result?: BrowserDomPayload;
  dom?: BrowserDomPayload;
}

const SCOUT_CHANNELS = ['all', 'web', 'github', 'reddit', 'youtube', 'twitter', 'bilibili'] as const;

export function WorldView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<WorldSubTab>('scout');
  const [scoutMode, setScoutMode] = useState<ScoutMode>('search');

  // Scout status + search + read state
  const [scoutStatus, setScoutStatus] = useState<ScoutStatusData | null>(null);
  const [recentReach, setRecentReach] = useState<ReachEventItem[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchChannel, setSearchChannel] = useState<string>('all');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<ScoutSearchResponse | null>(null);

  const [readTarget, setReadTarget] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [readResult, setReadResult] = useState<ScoutReadResponse | null>(null);

  // Recent Web Ingests state
  const [ingests, setIngests] = useState<WebIngestEvent[]>([]);
  const [ingestStatus, setIngestStatus] = useState<string>('Checking...');
  const [ingestsLoading, setIngestsLoading] = useState(false);
  const [selectedIngestId, setSelectedIngestId] = useState<string | null>(null);

  // Obscura / Browser Engine state
  const [browserEngine, setBrowserEngine] = useState<BrowserEngineId>('auto');
  const [browserUrl, setBrowserUrl] = useState('https://example.com');
  const [browserQuery, setBrowserQuery] = useState('');
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserData, setBrowserData] = useState<BrowserDomPayload | null>(null);
  const [activeEngineLabel, setActiveEngineLabel] = useState<string>('auto');
  const [browserError, setBrowserError] = useState<string | null>(null);

  const isSilent = telemetry.workspaceMode === 'SILENT';

  const loadScoutStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await ipcJson<ScoutStatusResponse>('/api/scout/reach/status');
      if (res.status) {
        setScoutStatus(res.status);
      }
      if (Array.isArray(res.recent_events)) {
        setRecentReach(res.recent_events);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to probe SCOUT-01 Reach status';
      pushToast(msg, 'error');
    } finally {
      setStatusLoading(false);
    }
  }, [pushToast]);

  const loadRecentIngests = useCallback(async () => {
    setIngestsLoading(true);
    try {
      const res = await ipcJson<WebIngestRecentResponse>('/api/bridge/web-ingest/recent?limit=25');
      if (res.success !== false) {
        const rows = Array.isArray(res.events) ? res.events : [];
        setIngests(rows);
        setIngestStatus(res.status || (res.air_gapped ? 'SILENT Air-Gap' : 'Connected'));
        setSelectedIngestId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      } else {
        setIngestStatus('Disconnected');
        pushToast(res.error || 'Failed loading recent web ingests', 'error');
      }
    } catch (err) {
      setIngestStatus('Offline');
      pushToast(err instanceof Error ? err.message : 'Web ingest bridge unreachable', 'error');
    } finally {
      setIngestsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadScoutStatus();
    void loadRecentIngests();
  }, [loadScoutStatus, loadRecentIngests]);

  const handleScoutSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      pushToast('Enter a Scout search query first', 'warn');
      return;
    }
    setSearchLoading(true);
    try {
      const resp = await ipcFetch('/api/scout/reach/search', {
        method: 'POST',
        body: JSON.stringify({
          query: trimmed,
          channel: searchChannel,
          workspace_mode: telemetry.workspaceMode,
        }),
      });
      const data = (await resp.json()) as ScoutSearchResponse;
      setSearchResult(data);
      if (resp.status === 403 || data.blocked) {
        pushToast(data.reason || data.error || 'Scout search blocked in SILENT air-gap mode', 'warn');
      } else if (data.success || data.ok) {
        pushToast(`Scout returned ${data.count ?? data.results?.length ?? 0} result(s)`, 'success');
        void loadScoutStatus();
      } else {
        pushToast(data.error || 'Scout search returned an error', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Scout search request failed', 'error');
    } finally {
      setSearchLoading(false);
    }
  };

  const executeReadTarget = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!trimmed) {
      pushToast('Enter a target URL to read', 'warn');
      return;
    }
    setReadTarget(trimmed);
    setScoutMode('read');
    setSubTab('scout');
    setReadLoading(true);
    try {
      const resp = await ipcFetch('/api/scout/reach/read', {
        method: 'POST',
        body: JSON.stringify({
          target: trimmed,
          workspace_mode: telemetry.workspaceMode,
        }),
      });
      const data = (await resp.json()) as ScoutReadResponse;
      setReadResult(data);
      if (resp.status === 403 || data.blocked) {
        pushToast(data.reason || data.error || 'Scout reader blocked in SILENT air-gap mode', 'warn');
      } else if (data.success || data.ok) {
        pushToast(`Extracted content from ${data.channel || 'web'}`, 'success');
        void loadScoutStatus();
      } else {
        pushToast(data.error || 'Scout read failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Scout read request failed', 'error');
    } finally {
      setReadLoading(false);
    }
  };

  const handleScoutReadSubmit = (e: FormEvent) => {
    e.preventDefault();
    void executeReadTarget(readTarget);
  };

  const runBrowserAction = async (action: 'navigate' | 'inspect') => {
    if (action === 'navigate' && !browserUrl.trim()) {
      pushToast('Enter a target URL before navigating', 'warn');
      return;
    }
    setBrowserLoading(true);
    setBrowserError(null);
    try {
      const res = await ipcJson<BrowserEngineResponse>('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({
          engine: browserEngine,
          action,
          url: browserUrl.trim(),
          query: browserQuery.trim(),
        }),
      });
      if (res.success === false) {
        const msg = res.error || `Browser engine ${action} failed`;
        setBrowserError(msg);
        pushToast(msg, 'error');
        return;
      }
      if (res.engine) {
        setActiveEngineLabel(res.engine);
      }
      const payload = res.dom ?? res.result ?? null;
      if (payload) {
        setBrowserData(payload);
        if (payload.url && payload.url !== 'about:blank') {
          setBrowserUrl(payload.url);
        }
      }
      pushToast(
        action === 'navigate'
          ? `Navigated via ${res.engine || browserEngine}`
          : `Inspected ${payload?.elements_count ?? payload?.elements?.length ?? 0} DOM elements`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Browser engine bridge request failed';
      setBrowserError(msg);
      pushToast(msg, 'error');
    } finally {
      setBrowserLoading(false);
    }
  };

  const selectedIngest = ingests.find((item) => item.id === selectedIngestId) ?? ingests[0] ?? null;

  const parseIngestElementCount = (raw?: string): number => {
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Segmented Sub-Tab Controls */}
      <div className="aether-glass rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">
              World &amp; Obscura Telemetry
            </h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                isSilent
                  ? 'bg-amber-500/15 text-amber-300 border-amber-400/40'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
              }`}
            >
              {isSilent ? 'AIR-GAP ACTIVE' : 'SCOUT LINK READY'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Zero-fee SCOUT-01 multi-channel reader, Shadow-DOM web ingestion feed, and Obscura DOM inspector.
          </p>
        </div>

        {/* Calm Segmented Switcher */}
        <div
          role="tablist"
          aria-label="World view sections"
          className="inline-flex items-center p-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/20 gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'scout'}
            onClick={() => setSubTab('scout')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'scout'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Scout Search &amp; Reader
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'ingests'}
            onClick={() => setSubTab('ingests')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'ingests'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Web Ingests ({ingests.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'obscura'}
            onClick={() => setSubTab('obscura')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
              subTab === 'obscura'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Obscura Inspector
          </button>
        </div>
      </div>

      {/* Air-Gap Aware Banner */}
      {isSilent && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-400/40 bg-amber-950/35 backdrop-blur-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <span>SILENT Air-Gap Enforced by WorkspaceGovernor</span>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  OFFLINE
                </span>
              </div>
              <p className="text-xs text-amber-100/80">
                Outbound Scout Reach lookups, web ingestion mutations, and external network probes are blocked.
                Cached SQLite WAL records remain inspectable locally.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void switchWorkspaceMode('DEV')}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 transition-colors shrink-0"
          >
            Switch to DEV Mode
          </button>
        </div>
      )}

      {/* TAB 1: SCOUT SEARCH & WEB READER */}
      {subTab === 'scout' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left 8 cols: Search / Read Workbench */}
          <div className="xl:col-span-8 space-y-6">
            <div className="aether-bracket-card rounded-2xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-semibold text-slate-100">
                    SCOUT-01 Multi-Channel Workbench
                  </h2>
                </div>

                <div className="inline-flex p-1 rounded-xl bg-[#050a14] border border-slate-700/60 gap-1">
                  <button
                    type="button"
                    onClick={() => setScoutMode('search')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      scoutMode === 'search'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Channel Search
                  </button>
                  <button
                    type="button"
                    onClick={() => setScoutMode('read')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      scoutMode === 'read'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Web Reader
                  </button>
                </div>
              </div>

              {scoutMode === 'search' ? (
                <form onSubmit={handleScoutSearch} className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search GitHub repos, Reddit threads, YouTube transcripts, or docs..."
                      className="flex-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <select
                      aria-label="Scout channel filter"
                      value={searchChannel}
                      onChange={(e) => setSearchChannel(e.target.value)}
                      className="rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                    >
                      {SCOUT_CHANNELS.map((ch) => (
                        <option key={ch} value={ch}>
                          {ch.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={searchLoading || isSilent}
                      className="px-5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 disabled:cursor-not-allowed text-cyan-200 border border-cyan-400/40 text-xs font-semibold transition-colors shrink-0"
                    >
                      {searchLoading ? 'Searching...' : 'Run Search'}
                    </button>
                  </div>

                  {searchResult && (
                    <div className="aether-panel rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="text-xs text-slate-300">
                          {searchResult.summary || searchResult.error || searchResult.reason || 'Search completed'}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          {searchResult.cached && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                              CACHED
                            </span>
                          )}
                          {typeof searchResult.latency_ms === 'number' && (
                            <span className="text-cyan-300">{searchResult.latency_ms}ms</span>
                          )}
                        </div>
                      </div>

                      {searchResult.results && searchResult.results.length > 0 ? (
                        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                          {searchResult.results.map((item, idx) => {
                            const itemUrl = item.url || item.source_url || item.link;
                            return (
                              <div
                                key={`${item.title ?? 'res'}-${idx}`}
                                className="rounded-xl bg-[#050a14]/75 border border-slate-800 p-3.5 flex items-start justify-between gap-3"
                              >
                                <div className="space-y-1 min-w-0">
                                  <div className="text-xs font-medium text-slate-100 truncate">
                                    {item.title || itemUrl || 'Untitled entry'}
                                  </div>
                                  {item.snippet && item.snippet !== item.title && (
                                    <p className="text-xs text-slate-400 line-clamp-2">{item.snippet}</p>
                                  )}
                                  {itemUrl && (
                                    <div className="text-[11px] font-mono text-cyan-400/80 truncate">{itemUrl}</div>
                                  )}
                                </div>
                                {itemUrl && (
                                  <button
                                    type="button"
                                    disabled={isSilent}
                                    onClick={() => void executeReadTarget(itemUrl)}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 text-emerald-300 border border-emerald-400/30 shrink-0"
                                  >
                                    Read
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        !searchResult.error &&
                        !searchResult.blocked && (
                          <div className="text-xs text-slate-400 py-3">
                            No structured items returned for this query.
                          </div>
                        )
                      )}
                    </div>
                  )}
                </form>
              ) : (
                <form onSubmit={handleScoutReadSubmit} className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={readTarget}
                      onChange={(e) => setReadTarget(e.target.value)}
                      placeholder="https://github.com/... or article / YouTube URL"
                      className="flex-1 rounded-xl bg-[#050a14]/90 border border-emerald-500/25 px-4 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      type="submit"
                      disabled={readLoading || isSilent}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 disabled:cursor-not-allowed text-emerald-200 border border-emerald-400/40 text-xs font-semibold transition-colors shrink-0"
                    >
                      {readLoading ? 'Extracting...' : 'Extract Reader'}
                    </button>
                  </div>

                  {readResult && (
                    <div className="aether-panel rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-100 truncate">
                            {readResult.title || readResult.target || 'Reader Output'}
                          </div>
                          {readResult.error || readResult.reason ? (
                            <div className="text-xs text-amber-300 mt-0.5">
                              {readResult.error || readResult.reason}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          {readResult.channel && (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                              {readResult.channel.toUpperCase()}
                            </span>
                          )}
                          {readResult.cached && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                              CACHED
                            </span>
                          )}
                          {typeof readResult.latency_ms === 'number' && (
                            <span className="text-slate-400">{readResult.latency_ms}ms</span>
                          )}
                        </div>
                      </div>

                      {(readResult.content || readResult.summary) && (
                        <pre className="rounded-xl bg-[#050a14] border border-slate-800 p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                          {readResult.content || readResult.summary}
                        </pre>
                      )}
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>

          {/* Right 4 cols: Scout CLI Health & Recent Reach Cache */}
          <div className="xl:col-span-4 space-y-6">
            <div className="aether-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-100">Reach Engine Status</h3>
                </div>
                <button
                  type="button"
                  onClick={() => void loadScoutStatus()}
                  disabled={statusLoading}
                  aria-label="Refresh Scout status"
                  className="p-2 rounded-lg bg-[#050a14]/80 hover:bg-cyan-500/15 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${statusLoading ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>

              <div className="aether-panel rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Binary</span>
                  <span
                    className={`font-mono px-2 py-0.5 rounded border ${
                      scoutStatus?.installed
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                    }`}
                  >
                    {scoutStatus?.installed ? 'INSTALLED' : 'NOT FOUND'}
                  </span>
                </div>
                {scoutStatus?.pinned_version && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Pinned Version</span>
                    <span className="font-mono text-slate-200">{scoutStatus.pinned_version}</span>
                  </div>
                )}
                {scoutStatus?.executable && (
                  <div className="text-[11px] font-mono text-slate-400 break-all pt-1 border-t border-slate-800/80">
                    {scoutStatus.executable}
                  </div>
                )}
                {scoutStatus?.message && (
                  <p className="text-[11px] text-amber-300/90 leading-relaxed pt-1">
                    {scoutStatus.message}
                  </p>
                )}
                {scoutStatus?.channels && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {Object.entries(scoutStatus.channels).map(([ch, st]) => (
                      <span
                        key={ch}
                        className="px-2 py-0.5 rounded-md bg-[#050a14] border border-slate-800 text-[10px] font-mono text-slate-300"
                      >
                        {ch}: {st}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="aether-glass rounded-2xl p-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">Cached Reach History</h3>
              {recentReach.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No cached Reach events recorded in SQLite WAL yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {recentReach.slice(0, 8).map((ev, idx) => (
                    <button
                      key={ev.id || `${ev.source_url}-${idx}`}
                      type="button"
                      disabled={isSilent || !ev.source_url || ev.source_url.startsWith('search://')}
                      onClick={() => {
                        if (ev.source_url && !ev.source_url.startsWith('search://')) {
                          void executeReadTarget(ev.source_url);
                        }
                      }}
                      className="w-full text-left rounded-xl bg-[#050a14]/80 hover:bg-cyan-500/10 disabled:hover:bg-[#050a14]/80 border border-slate-800 p-3 transition-colors space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-200 truncate">
                          {ev.title || ev.source_url || 'Reach Event'}
                        </span>
                        {ev.channel && (
                          <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                            {ev.channel.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {ev.summary && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{ev.summary}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECENT WEB INGESTS */}
      {subTab === 'ingests' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Shadow-DOM Ingest Stream</h2>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">Bridge: {ingestStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadRecentIngests()}
                disabled={ingestsLoading}
                className="px-3 py-1.5 rounded-xl bg-[#050a14] hover:bg-cyan-500/15 text-xs text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${ingestsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {ingests.length === 0 ? (
              <div className="aether-panel rounded-xl p-6 text-center space-y-2">
                <WifiOff className="w-5 h-5 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">
                  No web ingest captures found in `web_ingest_events`.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                {ingests.map((ev) => {
                  const active = selectedIngest?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedIngestId(ev.id)}
                      className={`w-full text-left rounded-xl p-3.5 border transition-colors space-y-1.5 ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/45'
                          : 'bg-[#050a14]/75 border-slate-800 hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-mono text-cyan-300 uppercase">
                          {ev.source || 'web_bridge'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {ev.workspace_mode || 'DEV'}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-100 truncate">
                        {ev.title || ev.prompt || ev.url || ev.id}
                      </div>
                      {ev.url && (
                        <div className="text-[11px] font-mono text-slate-400 truncate">{ev.url}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 aether-bracket-card rounded-2xl p-6 space-y-4">
            {selectedIngest ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-100">
                      {selectedIngest.title || selectedIngest.source || 'Ingested Capture'}
                    </div>
                    {selectedIngest.url && (
                      <div className="text-xs font-mono text-cyan-400 break-all">
                        {selectedIngest.url}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {parseIngestElementCount(selectedIngest.elements_json) > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 text-[11px] font-mono">
                        {parseIngestElementCount(selectedIngest.elements_json)} DOM nodes
                      </span>
                    )}
                    {selectedIngest.url && (
                      <button
                        type="button"
                        disabled={isSilent}
                        onClick={() => void executeReadTarget(selectedIngest.url || '')}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 text-cyan-200 border border-cyan-400/30 text-xs flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Scout Read
                      </button>
                    )}
                  </div>
                </div>

                {selectedIngest.prompt && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      Captured Prompt
                    </div>
                    <div className="aether-panel rounded-xl p-3.5 text-xs text-slate-200 whitespace-pre-wrap">
                      {selectedIngest.prompt}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    Ingested Response Payload
                  </div>
                  <div className="aether-panel rounded-xl p-4 text-xs text-slate-200 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                    {selectedIngest.response || selectedIngest.response_text || 'No response body captured.'}
                  </div>
                </div>

                {(selectedIngest.commentary || selectedIngest.tars_commentary) && (
                  <div className="rounded-xl bg-emerald-950/25 border border-emerald-500/25 p-3.5 space-y-1">
                    <div className="text-[11px] font-mono text-emerald-300">Sovereign Commentary</div>
                    <p className="text-xs text-emerald-100/90">
                      {selectedIngest.commentary || selectedIngest.tars_commentary}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex items-center justify-center py-16 text-xs text-slate-400">
                Select a captured web ingest on the left to inspect its Shadow-DOM content.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BROWSER ENGINE / OBSCURA DOM INSPECTOR */}
      {subTab === 'obscura' && (
        <div className="aether-bracket-card rounded-2xl p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">
                  Browser Engine &amp; Obscura DOM Inspector
                </h2>
                <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-[11px] font-mono">
                  ENGINE: {activeEngineLabel.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Route WarmBrowserSession between Auto, Obscura Rust CDP, or Persistent Chromium and inspect distilled interactive controls.
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#050a14] border border-slate-700/60 gap-1">
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'obscura', label: 'Obscura' },
                  { id: 'chromium_persistent', label: 'Chromium' },
                ] as const
              ).map((eng) => (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => setBrowserEngine(eng.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    browserEngine === eng.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {eng.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <input
              type="text"
              value={browserUrl}
              onChange={(e) => setBrowserUrl(e.target.value)}
              placeholder="https://example.com or file:///..."
              className="md:col-span-6 rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-4 py-2.5 text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              value={browserQuery}
              onChange={(e) => setBrowserQuery(e.target.value)}
              placeholder="Optional selector / query hint"
              className="md:col-span-3 rounded-xl bg-[#050a14]/90 border border-slate-700/80 px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                type="button"
                disabled={browserLoading}
                onClick={() => void runBrowserAction('navigate')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/40 text-xs font-semibold transition-colors"
              >
                {browserLoading ? 'Working...' : 'Navigate'}
              </button>
              <button
                type="button"
                disabled={browserLoading}
                onClick={() => void runBrowserAction('inspect')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold transition-colors"
              >
                Inspect DOM
              </button>
            </div>
          </div>

          {browserError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{browserError}</span>
            </div>
          )}

          {browserData ? (
            <div className="aether-panel rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">
                    {browserData.page_title || browserData.title || 'Active Session'}
                  </div>
                  <div className="text-xs font-mono text-cyan-400 truncate">
                    {browserData.url || browserUrl}
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                    {browserData.elements_count ?? browserData.elements?.length ?? 0} ELEMENTS
                  </span>
                  {typeof browserData.latency_ms === 'number' && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                      {browserData.latency_ms}ms
                    </span>
                  )}
                </div>
              </div>

              {browserData.elements && browserData.elements.length > 0 ? (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] font-mono uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Tag</th>
                        <th className="py-2 pr-3">Label / Text</th>
                        <th className="py-2 pr-3">Center</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {browserData.elements.map((el) => (
                        <tr key={String(el.id)} className="hover:bg-cyan-500/5">
                          <td className="py-2 pr-3 font-mono text-cyan-300">[{el.id}]</td>
                          <td className="py-2 pr-3 font-mono text-emerald-300">
                            &lt;{el.tag || 'el'}&gt;
                          </td>
                          <td className="py-2 pr-3 text-slate-200 max-w-md truncate">
                            {el.text || el.name || el.href || el.type || 'interactive control'}
                          </td>
                          <td className="py-2 pr-3 font-mono text-slate-400">
                            {Array.isArray(el.center) ? `${el.center[0]}, ${el.center[1]}` : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Session warmed at <span className="font-mono text-slate-300">{browserData.url}</span>. No local interactive DOM badges cached yet for this target.
                </p>
              )}
            </div>
          ) : (
            <div className="aether-panel rounded-xl p-6 text-xs text-slate-400">
              Select an engine mode and click <span className="text-cyan-300 font-medium">Navigate</span> or{' '}
              <span className="text-emerald-300 font-medium">Inspect DOM</span> to query the warm browser bridge.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WorldView;
