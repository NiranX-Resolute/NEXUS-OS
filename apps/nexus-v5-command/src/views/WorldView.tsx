import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Globe,
  Layers,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Terminal,
  WifiOff,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

type WorldSubTab = 'scout' | 'ingest' | 'browser';
type ScoutChannel = 'all' | 'web' | 'github' | 'reddit' | 'youtube' | 'twitter' | 'bilibili';
type BrowserEngineType = 'auto' | 'obscura' | 'chromium_persistent';

interface ReachEventItem {
  id?: string;
  source_url?: string;
  target?: string;
  title?: string;
  summary?: string;
  content?: string;
  channel?: string;
  workspace_mode?: string;
  created_at?: string;
}

interface ScoutDoctorStatus {
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
}

interface ScoutStatusResponse {
  success?: boolean;
  status?: ScoutDoctorStatus;
  workspace_mode?: string;
  air_gapped?: boolean;
  recent_events?: ReachEventItem[];
  count?: number;
  error?: string;
}

interface ScoutSearchResultItem {
  title?: string;
  url?: string;
  source_url?: string;
  snippet?: string;
  channel?: string;
  author?: string;
  score?: number;
}

interface ScoutSearchResponse {
  success?: boolean;
  ok?: boolean;
  cached?: boolean;
  blocked?: boolean;
  reason?: string;
  installed?: boolean;
  install_cmd?: string;
  query?: string;
  channel?: string;
  results?: ScoutSearchResultItem[];
  count?: number;
  summary?: string;
  summary_or_body?: string;
  latency_ms?: number;
  fetched_at?: string;
  error?: string;
}

interface ScoutReadResponse {
  success?: boolean;
  ok?: boolean;
  cached?: boolean;
  blocked?: boolean;
  reason?: string;
  installed?: boolean;
  install_cmd?: string;
  target?: string;
  source_url?: string;
  channel?: string;
  title?: string;
  summary?: string;
  summary_or_body?: string;
  content?: string;
  latency_ms?: number;
  fetched_at?: string;
  error?: string;
}

interface WebIngestEvent {
  id?: string;
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

interface DomElementItem {
  id: number | string;
  tag?: string;
  text?: string;
  type?: string;
  name?: string;
  href?: string;
  rect?: number[];
  center?: number[];
  is_interactive?: boolean;
}

interface BrowserEngineResponse {
  success?: boolean;
  engine?: string;
  status?: string;
  url?: string;
  error?: string;
  result?: {
    success?: boolean;
    url?: string;
    page_title?: string;
    elements?: DomElementItem[];
    elements_count?: number;
    latency_ms?: number;
  };
  dom?: {
    success?: boolean;
    url?: string;
    title?: string;
    elements?: DomElementItem[];
    elements_count?: number;
    engine?: string;
  };
}

const SCOUT_CHANNELS: { id: ScoutChannel; label: string }[] = [
  { id: 'all', label: 'All Channels' },
  { id: 'web', label: 'Web' },
  { id: 'github', label: 'GitHub' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'bilibili', label: 'Bilibili' },
];

function formatDateTime(raw?: string): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function parseElementsCount(elementsJson?: string): number {
  if (!elementsJson) return 0;
  try {
    const parsed = JSON.parse(elementsJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function WorldView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<WorldSubTab>('scout');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Scout Reach state
  const [scoutStatus, setScoutStatus] = useState<ScoutStatusResponse | null>(null);
  const [loadingScoutStatus, setLoadingScoutStatus] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchChannel, setSearchChannel] = useState<ScoutChannel>('all');
  const [searching, setSearching] = useState(false);
  const [searchOutput, setSearchOutput] = useState<ScoutSearchResponse | null>(null);

  const [readTarget, setReadTarget] = useState('');
  const [reading, setReading] = useState(false);
  const [readOutput, setReadOutput] = useState<ScoutReadResponse | null>(null);
  const [selectedReachEvent, setSelectedReachEvent] = useState<ReachEventItem | null>(null);

  // Web Ingest Stream state
  const [ingestData, setIngestData] = useState<WebIngestRecentResponse | null>(null);
  const [loadingIngests, setLoadingIngests] = useState(false);
  const [ingestFilter, setIngestFilter] = useState('');
  const [expandedIngestId, setExpandedIngestId] = useState<string | null>(null);

  // Browser Engine / Obscura DOM Inspector state
  const [browserEngine, setBrowserEngine] = useState<BrowserEngineType>('auto');
  const [browserUrl, setBrowserUrl] = useState('https://news.ycombinator.com');
  const [browserQuery, setBrowserQuery] = useState('');
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserOutput, setBrowserOutput] = useState<BrowserEngineResponse | null>(null);
  const [domFilter, setDomFilter] = useState('');

  const isAirGapped = telemetry.workspaceMode === 'SILENT';

  const copyText = useCallback(
    async (text: string, key: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(key);
        pushToast('Copied to clipboard', 'success');
      } catch {
        pushToast('Clipboard access unavailable', 'warn');
      }
    },
    [pushToast]
  );

  const fetchScoutStatus = useCallback(async () => {
    setLoadingScoutStatus(true);
    try {
      const res = await ipcJson<ScoutStatusResponse>('/api/scout/reach/status');
      setScoutStatus(res);
      if (Array.isArray(res.recent_events) && res.recent_events.length > 0) {
        setSelectedReachEvent((prev) => prev ?? res.recent_events?.[0] ?? null);
      }
    } finally {
      setLoadingScoutStatus(false);
    }
  }, []);

  const fetchRecentIngests = useCallback(async () => {
    setLoadingIngests(true);
    try {
      const res = await ipcJson<WebIngestRecentResponse>('/api/bridge/web-ingest/recent?limit=25');
      setIngestData(res);
    } finally {
      setLoadingIngests(false);
    }
  }, []);

  useEffect(() => {
    void fetchScoutStatus();
    void fetchRecentIngests();
  }, [fetchScoutStatus, fetchRecentIngests]);

  const handleScoutSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      pushToast('Enter a search query for Scout Reach', 'warn');
      return;
    }
    setSearching(true);
    try {
      const res = await ipcJson<ScoutSearchResponse>('/api/scout/reach/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          channel: searchChannel,
          workspace_mode: telemetry.workspaceMode,
        }),
      });
      setSearchOutput(res);
      if (res.blocked) {
        pushToast(res.reason || 'Blocked by WorkspaceGovernor in SILENT mode', 'warn');
      } else if (!res.success && !res.ok) {
        pushToast(res.error || 'Scout search failed', 'error');
      } else {
        pushToast(`Scout returned ${res.count ?? res.results?.length ?? 0} results`, 'success');
        void fetchScoutStatus();
      }
    } finally {
      setSearching(false);
    }
  };

  const runScoutRead = useCallback(
    async (targetUrl: string) => {
      const target = targetUrl.trim();
      if (!target) {
        pushToast('Enter a target URL to read', 'warn');
        return;
      }
      setReadTarget(target);
      setReading(true);
      try {
        const res = await ipcJson<ScoutReadResponse>('/api/scout/reach/read', {
          method: 'POST',
          body: JSON.stringify({
            target,
            workspace_mode: telemetry.workspaceMode,
          }),
        });
        setReadOutput(res);
        setSelectedReachEvent(null);
        if (res.blocked) {
          pushToast(res.reason || 'Blocked by WorkspaceGovernor in SILENT mode', 'warn');
        } else if (!res.success && !res.ok) {
          pushToast(res.error || 'Scout web read failed', 'error');
        } else {
          pushToast(`Extracted ${res.title || target}`, 'success');
          void fetchScoutStatus();
        }
      } finally {
        setReading(false);
      }
    },
    [pushToast, telemetry.workspaceMode, fetchScoutStatus]
  );

  const handleScoutReadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runScoutRead(readTarget);
  };

  const handleBrowserDispatch = async (action: 'navigate' | 'inspect' | 'status') => {
    if (action === 'navigate' && !browserUrl.trim()) {
      pushToast('Enter a target URL before navigating', 'warn');
      return;
    }
    setBrowserBusy(true);
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
      setBrowserOutput(res);
      if (!res.success) {
        pushToast(res.error || `Browser ${action} failed`, 'error');
      } else {
        pushToast(
          `Browser ${action} via ${res.engine || browserEngine} completed`,
          'success'
        );
      }
    } finally {
      setBrowserBusy(false);
    }
  };

  const filteredIngests = useMemo(() => {
    const rows = ingestData?.events ?? [];
    const q = ingestFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((ev) =>
      [ev.title, ev.url, ev.source, ev.prompt, ev.response, ev.commentary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [ingestData, ingestFilter]);

  const domElements = useMemo(() => {
    const raw =
      browserOutput?.dom?.elements ?? browserOutput?.result?.elements ?? [];
    const q = domFilter.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((el) =>
      [el.tag, el.text, el.type, el.name, el.href, String(el.id)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [browserOutput, domFilter]);

  const activeArticle = useMemo(() => {
    if (readOutput) {
      return {
        title: readOutput.title || readOutput.target || 'Extracted Page',
        url: readOutput.source_url || readOutput.target || '',
        channel: readOutput.channel || 'web',
        summary: readOutput.summary || readOutput.summary_or_body || '',
        content: readOutput.content || readOutput.summary_or_body || '',
        cached: Boolean(readOutput.cached),
        latencyMs: readOutput.latency_ms,
        fetchedAt: readOutput.fetched_at,
        error: readOutput.error || (readOutput.blocked ? readOutput.reason : undefined),
      };
    }
    if (selectedReachEvent) {
      return {
        title: selectedReachEvent.title || selectedReachEvent.source_url || 'Cached Reach Event',
        url: selectedReachEvent.source_url || selectedReachEvent.target || '',
        channel: selectedReachEvent.channel || 'web',
        summary: selectedReachEvent.summary || '',
        content: selectedReachEvent.content || selectedReachEvent.summary || '',
        cached: true,
        latencyMs: undefined,
        fetchedAt: selectedReachEvent.created_at,
        error: undefined,
      };
    }
    return null;
  }, [readOutput, selectedReachEvent]);

  const doctor = scoutStatus?.status;
  const recentEvents = scoutStatus?.recent_events ?? [];

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-500/15 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>SCOUT-01 // WORLD &amp; WEB BRIDGE</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-50">
            World Intelligence &amp; DOM Bridge
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
              isAirGapped
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            <Radio className="w-3 h-3" />
            {telemetry.workspaceMode}
          </span>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono ${
              doctor?.installed
                ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200'
                : 'border-slate-600/50 bg-slate-900/70 text-slate-300'
            }`}
          >
            <Compass className="w-3 h-3 text-cyan-400" />
            {doctor?.installed ? `Scout CLI v${doctor.pinned_version ?? '0.1.0'}` : 'Scout CLI Uninstalled'}
          </span>

          <button
            type="button"
            onClick={() => {
              void fetchScoutStatus();
              void fetchRecentIngests();
            }}
            disabled={loadingScoutStatus || loadingIngests}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-[#090e14] px-3 py-1.5 text-xs font-medium text-emerald-200 hover:border-cyan-400/50 hover:text-cyan-200 transition disabled:opacity-50"
          >
            {loadingScoutStatus || loadingIngests ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Sync Telemetry
          </button>
        </div>
      </div>

      {/* Air-Gap Aware Banner */}
      {isAirGapped && (
        <div className="matrix-panel holo-ring rounded-xl border border-amber-500/35 bg-amber-950/20 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-amber-300">
              <WifiOff className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-amber-200">
                SILENT Mode Air-Gap Enforced by WorkspaceGovernor
              </div>
              <p className="text-xs text-slate-300 max-w-2xl">
                Outbound Scout Reach queries, remote web extraction, and live network ingests are blocked while
                <span className="font-mono text-amber-300"> workspaceMode === &apos;SILENT&apos;</span>. Local SovereignStore
                cache and local file DOM inspection remain available.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void switchWorkspaceMode('DEV')}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/45 bg-emerald-500/15 px-3.5 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 transition"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-300" />
            Restore DEV Network Mode
          </button>
        </div>
      )}

      {/* Clean Sub-Tab Switcher */}
      <div className="inline-flex rounded-xl border border-white/10 bg-[#090e14]/90 p-1 gap-1">
        {(
          [
            { id: 'scout', label: 'Scout Search & Reader', icon: Search },
            { id: 'ingest', label: 'Recent Web Ingests', icon: Database },
            { id: 'browser', label: 'Browser & Obscura DOM', icon: Terminal },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition ${
                active
                  ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/35 matrix-glow'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-cyan-300' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SCOUT SEARCH & WEB READER */}
      {subTab === 'scout' && (
        <div className="space-y-6">
          {/* Scout Reach Diagnostics Card */}
          <div className="matrix-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
                <Compass className="w-3.5 h-3.5" />
                <span>AGENT REACH STATUS</span>
                {doctor?.executable && (
                  <span className="text-slate-400 truncate max-w-md">{doctor.executable}</span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                {doctor?.message ||
                  doctor?.stdout ||
                  (doctor?.installed
                    ? 'Agent Reach CLI healthy and ready for Tier-1 multi-channel extraction.'
                    : 'Run status check to probe installed Scout channels.')}
              </p>
              {doctor && !doctor.installed && doctor.install_cmd && (
                <div className="inline-flex items-center gap-2 rounded-md border border-cyan-500/25 bg-[#05080b] px-2.5 py-1 text-[11px] font-mono text-cyan-300">
                  <span>{doctor.install_cmd}</span>
                  <button
                    type="button"
                    onClick={() => void copyText(doctor.install_cmd || '', 'install-cmd')}
                    className="text-slate-400 hover:text-emerald-300"
                    title="Copy install command"
                  >
                    {copiedId === 'install-cmd' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              )}
            </div>

            {doctor?.channels && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(doctor.channels).map(([ch, state]) => (
                  <span
                    key={ch}
                    className="rounded-md border border-white/10 bg-[#05080b] px-2 py-0.5 text-[11px] font-mono text-slate-300"
                  >
                    <span className="text-emerald-400">{ch}</span>: {state}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Column: Search + Cached History */}
            <div className="xl:col-span-5 space-y-6">
              {/* Scout Search Form */}
              <form onSubmit={handleScoutSearch} className="matrix-panel holo-ring rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-400" />
                    Multi-Channel Scout Search
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400">POST /api/scout/reach/search</span>
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search GitHub repos, docs, Reddit threads, videos..."
                    className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3.5 py-2.5 text-sm text-emerald-50 placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
                  />

                  <div className="flex items-center gap-2">
                    <select
                      value={searchChannel}
                      onChange={(e) => setSearchChannel(e.target.value as ScoutChannel)}
                      className="flex-1 rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-slate-200 focus:border-cyan-400/60 focus:outline-none"
                    >
                      {SCOUT_CHANNELS.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          {ch.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      disabled={searching}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 transition disabled:opacity-50"
                    >
                      {searching ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      Execute Search
                    </button>
                  </div>
                </div>

                {/* Search Results */}
                {searchOutput && (
                  <div className="border-t border-white/10 pt-3 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>
                        {searchOutput.summary ||
                          `Results: ${searchOutput.count ?? searchOutput.results?.length ?? 0}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {searchOutput.cached && (
                          <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-cyan-300">CACHED</span>
                        )}
                        {typeof searchOutput.latency_ms === 'number' && (
                          <span className="text-emerald-300">{searchOutput.latency_ms}ms</span>
                        )}
                      </div>
                    </div>

                    {(searchOutput.error || searchOutput.blocked) && (
                      <div className="rounded-lg border border-red-500/35 bg-red-950/25 p-3 text-xs text-red-200">
                        {searchOutput.reason || searchOutput.error}
                      </div>
                    )}

                    <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                      {(searchOutput.results ?? []).map((item, idx) => {
                        const itemUrl = item.url || item.source_url || '';
                        return (
                          <div
                            key={`${itemUrl || item.title}-${idx}`}
                            className="rounded-lg border border-white/8 bg-[#05080b]/90 p-3 space-y-1.5 hover:border-cyan-400/35 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-medium text-emerald-100 line-clamp-2">
                                {item.title || itemUrl || `Result #${idx + 1}`}
                              </div>
                              {item.channel && (
                                <span className="shrink-0 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-300">
                                  {item.channel}
                                </span>
                              )}
                            </div>
                            {item.snippet && item.snippet !== item.title && (
                              <p className="text-[11px] text-slate-400 line-clamp-2">{item.snippet}</p>
                            )}
                            {itemUrl && (
                              <div className="flex items-center justify-between gap-2 pt-1">
                                <span className="text-[11px] font-mono text-cyan-400/90 truncate">
                                  {itemUrl}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void runScoutRead(itemUrl)}
                                  className="shrink-0 rounded border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono text-cyan-200 hover:bg-cyan-500/20"
                                >
                                  Read URL
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </form>

              {/* Recent Reach Events Cache */}
              <div className="matrix-panel rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300">
                    SovereignStore Reach Cache ({recentEvents.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => void fetchScoutStatus()}
                    className="text-[11px] font-mono text-cyan-300 hover:text-cyan-200"
                  >
                    Refresh
                  </button>
                </div>

                {recentEvents.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No cached Scout Reach extractions stored in SQLite WAL yet.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {recentEvents.map((ev, idx) => (
                      <button
                        key={ev.id || `${ev.source_url}-${idx}`}
                        type="button"
                        onClick={() => {
                          setReadOutput(null);
                          setSelectedReachEvent(ev);
                          if (ev.source_url && !ev.source_url.startsWith('search://')) {
                            setReadTarget(ev.source_url);
                          }
                        }}
                        className={`w-full text-left rounded-lg border p-2.5 transition ${
                          selectedReachEvent?.id === ev.id && !readOutput
                            ? 'border-cyan-400/45 bg-cyan-500/10'
                            : 'border-white/8 bg-[#05080b]/80 hover:border-emerald-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-emerald-100 truncate">
                            {ev.title || ev.source_url || 'Reach Event'}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono text-cyan-300">
                            {ev.channel || 'web'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                          {ev.source_url || '—'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Web Reader */}
            <div className="xl:col-span-7 space-y-6">
              <form onSubmit={handleScoutReadSubmit} className="matrix-panel holo-ring rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-cyan-400" />
                    Structured Web Reader
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400">POST /api/scout/reach/read</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    value={readTarget}
                    onChange={(e) => setReadTarget(e.target.value)}
                    placeholder="https://github.com/owner/repo or article / YouTube URL"
                    className="flex-1 min-w-[240px] rounded-lg border border-white/10 bg-[#05080b] px-3.5 py-2.5 text-sm font-mono text-emerald-50 placeholder-slate-500 focus:border-cyan-400/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={reading}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-4 py-2.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 transition disabled:opacity-50"
                  >
                    {reading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BookOpen className="w-3.5 h-3.5" />
                    )}
                    Extract Content
                  </button>
                </div>

                {activeArticle ? (
                  <div className="border-t border-white/10 pt-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <h3 className="text-base font-semibold text-emerald-50 break-words">
                          {activeArticle.title}
                        </h3>
                        {activeArticle.url && (
                          <div className="flex items-center gap-2 text-xs font-mono text-cyan-300/90">
                            <span className="truncate max-w-lg">{activeArticle.url}</span>
                            {activeArticle.url.startsWith('http') && (
                              <a
                                href={activeArticle.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-slate-400 hover:text-cyan-200"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono text-emerald-300">
                          {activeArticle.channel}
                        </span>
                        {activeArticle.cached && (
                          <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                            WAL CACHE
                          </span>
                        )}
                        {typeof activeArticle.latencyMs === 'number' && (
                          <span className="text-[11px] font-mono text-slate-400">
                            {activeArticle.latencyMs}ms
                          </span>
                        )}
                        {activeArticle.content && (
                          <button
                            type="button"
                            onClick={() => void copyText(activeArticle.content, 'article-body')}
                            className="inline-flex items-center gap-1 rounded border border-white/10 bg-[#05080b] px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-emerald-300"
                          >
                            {copiedId === 'article-body' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            Copy
                          </button>
                        )}
                      </div>
                    </div>

                    {activeArticle.error && (
                      <div className="rounded-lg border border-red-500/35 bg-red-950/25 p-3 text-xs text-red-200">
                        {activeArticle.error}
                      </div>
                    )}

                    {activeArticle.summary && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-3 text-xs text-emerald-100/90 leading-relaxed">
                        {activeArticle.summary}
                      </div>
                    )}

                    {activeArticle.content && (
                      <pre className="max-h-[440px] overflow-auto rounded-lg border border-white/8 bg-[#05080b] p-4 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {activeArticle.content}
                      </pre>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-8 text-center space-y-1.5">
                    <BookOpen className="w-6 h-6 text-slate-500 mx-auto" />
                    <div className="text-xs font-medium text-slate-300">
                      Ready for Tier-1 Structured Web Extraction
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Enter a target URL above or select a cached Reach extraction from the left column.
                    </p>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECENT WEB INGESTS */}
      {subTab === 'ingest' && (
        <div className="matrix-panel rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Recent Web Ingest Stream
              </h2>
              <p className="text-xs text-slate-400">
                Bridge status:{' '}
                <span className="font-mono text-cyan-300">
                  {ingestData?.status || (isAirGapped ? 'SILENT Air-Gap' : 'Connected')}
                </span>{' '}
                · {filteredIngests.length} events shown
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ingestFilter}
                onChange={(e) => setIngestFilter(e.target.value)}
                placeholder="Filter ingests by URL, source, prompt..."
                className="w-64 rounded-lg border border-white/10 bg-[#05080b] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void fetchRecentIngests()}
                disabled={loadingIngests}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {loadingIngests ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Refresh
              </button>
            </div>
          </div>

          {ingestData?.error && (
            <div className="rounded-lg border border-red-500/35 bg-red-950/25 p-3 text-xs text-red-200">
              {ingestData.error}
            </div>
          )}

          {filteredIngests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-10 text-center space-y-1.5">
              <Database className="w-6 h-6 text-slate-500 mx-auto" />
              <div className="text-xs font-medium text-slate-300">No Web Ingest Events Found</div>
              <p className="text-[11px] text-slate-500">
                Web bridge ingests captured via browser extensions or Shadow-DOM dispatches appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredIngests.map((ev, idx) => {
                const key = ev.id || `${ev.url}-${idx}`;
                const expanded = expandedIngestId === key;
                const elCount = parseElementsCount(ev.elements_json);
                const commentary = ev.tars_commentary || ev.commentary;
                const bodyText = ev.response_text || ev.response;

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-white/10 bg-[#05080b]/90 p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedIngestId(expanded ? null : key)}
                        className="flex items-start gap-2 text-left min-w-0 flex-1"
                      >
                        {expanded ? (
                          <ChevronDown className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-emerald-100 truncate">
                            {ev.title || ev.url || 'Web Ingest Event'}
                          </div>
                          <div className="text-[11px] font-mono text-cyan-400/80 truncate">
                            {ev.url || '—'}
                          </div>
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                          {ev.source || 'bridge'}
                        </span>
                        {elCount > 0 && (
                          <span className="rounded border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">
                            {elCount} DOM nodes
                          </span>
                        )}
                        {ev.workspace_mode && (
                          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-slate-300">
                            {ev.workspace_mode}
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-slate-500">
                          {formatDateTime(ev.created_at)}
                        </span>
                      </div>
                    </div>

                    {commentary && (
                      <p className="text-xs text-slate-300 pl-6 border-l border-emerald-500/30">
                        {commentary}
                      </p>
                    )}

                    {expanded && (
                      <div className="pl-6 pt-2 space-y-2 border-t border-white/8">
                        {ev.prompt && (
                          <div className="text-xs text-cyan-200 font-mono bg-cyan-950/20 border border-cyan-500/20 rounded-lg p-2.5">
                            Prompt: {ev.prompt}
                          </div>
                        )}
                        {bodyText && (
                          <pre className="max-h-60 overflow-auto rounded-lg border border-white/8 bg-[#090e14] p-3 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                            {bodyText}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BROWSER ENGINE / OBSCURA DOM INSPECTOR */}
      {subTab === 'browser' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 matrix-panel holo-ring rounded-xl p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                Browser Engine / Obscura Bridge
              </h2>
              <span className="text-[11px] font-mono text-slate-400">POST /api/bridge/browser-engine</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Engine Driver
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'auto', label: 'Auto Cascade' },
                      { id: 'obscura', label: 'Obscura Rust' },
                      { id: 'chromium_persistent', label: 'Chromium CDP' },
                    ] as const
                  ).map((eng) => (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => setBrowserEngine(eng.id)}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                        browserEngine === eng.id
                          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/10 bg-[#05080b] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {eng.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Target URL
                </label>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  placeholder="https://example.com or file:///path/to/page.html"
                  className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Selector / Inspection Query (Optional)
                </label>
                <input
                  type="text"
                  value={browserQuery}
                  onChange={(e) => setBrowserQuery(e.target.value)}
                  placeholder="Optional interactive element query or tag filter"
                  className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={browserBusy}
                  onClick={() => void handleBrowserDispatch('navigate')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {browserBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  Navigate
                </button>

                <button
                  type="button"
                  disabled={browserBusy}
                  onClick={() => void handleBrowserDispatch('inspect')}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Inspect DOM
                </button>

                <button
                  type="button"
                  disabled={browserBusy}
                  onClick={() => void handleBrowserDispatch('status')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-[#05080b] px-3 py-2 text-xs font-medium text-slate-300 hover:text-emerald-200 disabled:opacity-50"
                >
                  Probe
                </button>
              </div>
            </div>

            {browserOutput && (
              <div className="border-t border-white/10 pt-3 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Active Engine</span>
                  <span className="text-cyan-300">{browserOutput.engine || browserEngine}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Page Title</span>
                  <span className="text-emerald-200 truncate max-w-[220px]">
                    {browserOutput.result?.page_title || browserOutput.dom?.title || '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Distilled Elements</span>
                  <span className="text-emerald-300">
                    {browserOutput.dom?.elements_count ??
                      browserOutput.result?.elements_count ??
                      domElements.length}
                  </span>
                </div>
                {typeof browserOutput.result?.latency_ms === 'number' && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Latency</span>
                    <span className="text-cyan-300">{browserOutput.result.latency_ms}ms</span>
                  </div>
                )}
                {browserOutput.error && (
                  <div className="rounded-lg border border-red-500/35 bg-red-950/25 p-2.5 text-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{browserOutput.error}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="xl:col-span-7 matrix-panel rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-emerald-100">
                  Distilled Interactive DOM Map
                </h3>
                <p className="text-xs text-slate-400 font-mono truncate max-w-md">
                  {browserOutput?.dom?.url || browserOutput?.result?.url || browserOutput?.url || 'No active inspection'}
                </p>
              </div>
              <input
                type="text"
                value={domFilter}
                onChange={(e) => setDomFilter(e.target.value)}
                placeholder="Filter by tag, text, href, id..."
                className="w-56 rounded-lg border border-white/10 bg-[#05080b] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
            </div>

            {domElements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-10 text-center space-y-1.5">
                <Terminal className="w-6 h-6 text-slate-500 mx-auto" />
                <div className="text-xs font-medium text-slate-300">
                  No Distilled DOM Elements Loaded
                </div>
                <p className="text-[11px] text-slate-500">
                  Run <span className="font-mono text-cyan-300">Navigate</span> on a target URL or{' '}
                  <span className="font-mono text-cyan-300">Inspect DOM</span> to capture interactive Shadow-DOM badges.
                </p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-auto rounded-lg border border-white/8 bg-[#05080b]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-[#090e14] border-b border-white/10 text-[11px] font-mono uppercase text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Tag</th>
                      <th className="py-2.5 px-3">Label / Text</th>
                      <th className="py-2.5 px-3">Type / Href</th>
                      <th className="py-2.5 px-3">Center</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {domElements.map((el) => (
                      <tr key={String(el.id)} className="hover:bg-emerald-500/5">
                        <td className="py-2 px-3 font-mono text-cyan-300">[{el.id}]</td>
                        <td className="py-2 px-3 font-mono text-emerald-300">{el.tag || 'el'}</td>
                        <td className="py-2 px-3 text-slate-200 max-w-[220px] truncate">
                          {el.text || el.name || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 max-w-[180px] truncate">
                          {el.href || el.type || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {Array.isArray(el.center) ? `${el.center[0]}, ${el.center[1]}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WorldView;
