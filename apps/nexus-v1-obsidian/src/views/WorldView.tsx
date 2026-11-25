import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Layers,
  Lock,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  Unlock,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';

type WorldSubTab = 'scout' | 'ingests' | 'browser';
type BrowserEngineType = 'auto' | 'obscura' | 'chromium_persistent';
type BrowserActionType = 'navigate' | 'inspect' | 'status';

interface ReachDoctorStatus {
  ok?: boolean;
  installed?: boolean;
  executable?: string | null;
  pinned_version?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  channels?: Record<string, string>;
  install_cmd?: string;
  docs?: string;
}

interface ReachEventItem {
  id: string;
  source_url?: string;
  channel?: string;
  title?: string;
  content?: string;
  summary?: string;
  workspace_mode?: string;
  created_at?: number | string;
}

interface ScoutStatusResponse {
  success?: boolean;
  status?: ReachDoctorStatus;
  workspace_mode?: string;
  air_gapped?: boolean;
  recent_events?: ReachEventItem[];
  count?: number;
  error?: string;
}

interface ScoutSearchItem {
  title?: string;
  url?: string;
  link?: string;
  snippet?: string;
  summary?: string;
  channel?: string;
  [key: string]: unknown;
}

interface ScoutActionResponse {
  success?: boolean;
  ok?: boolean;
  blocked?: boolean;
  reason?: string;
  installed?: boolean;
  install_cmd?: string;
  docs?: string;
  cached?: boolean;
  event_id?: string;
  target?: string;
  query?: string;
  source_url?: string;
  channel?: string;
  title?: string;
  summary?: string;
  summary_or_body?: string;
  content?: string;
  results?: ScoutSearchItem[];
  count?: number;
  fetched_at?: string;
  workspace_mode?: string;
  latency_ms?: number;
  error?: string;
}

interface WebIngestItem {
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

interface WebIngestResponse {
  success?: boolean;
  status?: string;
  workspace_mode?: string;
  air_gapped?: boolean;
  events?: WebIngestItem[];
  count?: number;
  error?: string;
}

interface DistilledDomElement {
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
    elements?: DistilledDomElement[];
    elements_count?: number;
    latency_ms?: number;
  };
  dom?: {
    success?: boolean;
    url?: string;
    title?: string;
    elements?: DistilledDomElement[];
    elements_count?: number;
    engine?: string;
  };
}

const CHANNELS = ['all', 'web', 'github', 'reddit', 'youtube', 'twitter', 'bilibili'] as const;

function formatTimestamp(raw: number | string | undefined): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return String(raw);
}

function isSafeExternalUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.startsWith('https://') || raw.startsWith('http://');
}

export function WorldView() {
  const { telemetry, switchWorkspaceMode, pushToast } = useNexusStore();
  const isSilentMode = telemetry.workspaceMode === 'SILENT' || telemetry.airGapped;

  const [subTab, setSubTab] = useState<WorldSubTab>('scout');
  const [switchingMode, setSwitchingMode] = useState(false);

  // Scout Reach state
  const [scoutStatus, setScoutStatus] = useState<ScoutStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchChannel, setSearchChannel] = useState<string>('all');
  const [readUrl, setReadUrl] = useState('');
  const [reconBusy, setReconBusy] = useState<'search' | 'read' | null>(null);
  const [reconOutput, setReconOutput] = useState<ScoutActionResponse | null>(null);
  const [copiedRecon, setCopiedRecon] = useState(false);

  // Web Ingests state
  const [ingestData, setIngestData] = useState<WebIngestResponse | null>(null);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestFilter, setIngestFilter] = useState('');
  const [selectedIngestId, setSelectedIngestId] = useState<string>('');

  // Browser Engine / Obscura DOM Inspector state
  const [browserEngine, setBrowserEngine] = useState<BrowserEngineType>('auto');
  const [browserUrl, setBrowserUrl] = useState('https://example.com');
  const [domQueryFilter, setDomQueryFilter] = useState('');
  const [browserBusy, setBrowserBusy] = useState<BrowserActionType | null>(null);
  const [browserOutput, setBrowserOutput] = useState<BrowserEngineResponse | null>(null);

  const loadScoutStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await ipcJson<ScoutStatusResponse>('/api/scout/reach/status');
      setScoutStatus(res);
    } catch (err) {
      pushToast({
        title: 'Scout Status Unreachable',
        message: err instanceof Error ? err.message : 'Unable to query /api/scout/reach/status',
        tone: 'error',
      });
    } finally {
      setStatusLoading(false);
    }
  }, [pushToast]);

  const loadWebIngests = useCallback(async () => {
    setIngestLoading(true);
    try {
      const res = await ipcJson<WebIngestResponse>('/api/bridge/web-ingest/recent?limit=30');
      setIngestData(res);
      if (Array.isArray(res.events) && res.events.length > 0) {
        setSelectedIngestId((prev) =>
          prev && res.events?.some((ev) => ev.id === prev) ? prev : res.events![0].id
        );
      }
    } catch (err) {
      pushToast({
        title: 'Web Ingest Feed Error',
        message: err instanceof Error ? err.message : 'Unable to query /api/bridge/web-ingest/recent',
        tone: 'error',
      });
    } finally {
      setIngestLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadScoutStatus();
    void loadWebIngests();
  }, [loadScoutStatus, loadWebIngests]);

  const handleRestoreDevMode = async () => {
    if (switchingMode) return;
    setSwitchingMode(true);
    try {
      await switchWorkspaceMode('DEV');
      await loadScoutStatus();
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleScoutSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery || reconBusy) return;

    setReconBusy('search');
    setCopiedRecon(false);
    try {
      const res = await ipcJson<ScoutActionResponse>('/api/scout/reach/search', {
        method: 'POST',
        body: JSON.stringify({
          query: cleanQuery,
          channel: searchChannel,
          workspace_mode: telemetry.workspaceMode,
        }),
      });
      setReconOutput(res);
      if (res.blocked) {
        pushToast({
          title: 'Scout Search Blocked',
          message: res.reason ?? 'WorkspaceGovernor blocked network search.',
          tone: 'warning',
        });
      } else if (res.ok === false || res.success === false) {
        pushToast({
          title: 'Scout Search Error',
          message: res.error ?? 'Search failed.',
          tone: 'error',
        });
      } else {
        void loadScoutStatus();
      }
    } catch (err) {
      pushToast({
        title: 'Scout Search Failed',
        message: err instanceof Error ? err.message : 'Network error calling /api/scout/reach/search',
        tone: 'error',
      });
    } finally {
      setReconBusy(null);
    }
  };

  const runScoutRead = useCallback(
    async (targetUrl: string) => {
      const cleanTarget = targetUrl.trim();
      if (!cleanTarget || reconBusy) return;

      setReadUrl(cleanTarget);
      setReconBusy('read');
      setCopiedRecon(false);
      try {
        const res = await ipcJson<ScoutActionResponse>('/api/scout/reach/read', {
          method: 'POST',
          body: JSON.stringify({
            target: cleanTarget,
            workspace_mode: telemetry.workspaceMode,
          }),
        });
        setReconOutput(res);
        if (res.blocked) {
          pushToast({
            title: 'Web Reader Blocked',
            message: res.reason ?? 'Target blocked by air-gap or ScopeGuard.',
            tone: 'warning',
          });
        } else if (res.ok === false || res.success === false) {
          pushToast({
            title: 'Web Reader Error',
            message: res.error ?? 'Failed reading target URL.',
            tone: 'error',
          });
        } else {
          void loadScoutStatus();
        }
      } catch (err) {
        pushToast({
          title: 'Web Reader Failed',
          message: err instanceof Error ? err.message : 'Network error calling /api/scout/reach/read',
          tone: 'error',
        });
      } finally {
        setReconBusy(null);
      }
    },
    [pushToast, reconBusy, telemetry.workspaceMode, loadScoutStatus]
  );

  const handleScoutReadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runScoutRead(readUrl);
  };

  const handleInspectCachedReach = (ev: ReachEventItem) => {
    setCopiedRecon(false);
    setReconOutput({
      success: true,
      ok: true,
      cached: true,
      event_id: ev.id,
      target: ev.source_url,
      source_url: ev.source_url,
      channel: ev.channel,
      title: ev.title,
      summary: ev.summary,
      summary_or_body: ev.summary || ev.content,
      content: ev.content,
      workspace_mode: ev.workspace_mode,
      fetched_at: typeof ev.created_at === 'string' ? ev.created_at : undefined,
    });
  };

  const handleCopyReconContent = async () => {
    const text =
      reconOutput?.content ||
      reconOutput?.summary_or_body ||
      reconOutput?.summary ||
      JSON.stringify(reconOutput?.results ?? [], null, 2);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRecon(true);
      pushToast({ title: 'Recon Output Copied', tone: 'success' });
    } catch {
      pushToast({ title: 'Clipboard Unavailable', tone: 'warning' });
    }
  };

  const handleBrowserDispatch = async (action: BrowserActionType) => {
    if (browserBusy) return;
    setBrowserBusy(action);
    try {
      const res = await ipcJson<BrowserEngineResponse>('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({
          engine: browserEngine,
          action,
          url: browserUrl.trim(),
          query: domQueryFilter.trim(),
        }),
      });
      setBrowserOutput(res);
      if (res.success === false) {
        pushToast({
          title: 'Browser Engine Error',
          message: res.error ?? 'Dispatch failed.',
          tone: 'error',
        });
      } else {
        pushToast({
          title: `Browser ${action.toUpperCase()} Complete`,
          message: `Engine: ${res.engine ?? browserEngine}`,
          tone: 'success',
        });
      }
    } catch (err) {
      pushToast({
        title: 'Browser Bridge Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/bridge/browser-engine',
        tone: 'error',
      });
    } finally {
      setBrowserBusy(null);
    }
  };

  const filteredIngests = useMemo(() => {
    const list = ingestData?.events ?? [];
    const q = ingestFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) =>
      [item.title, item.url, item.source, item.prompt, item.response]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [ingestData, ingestFilter]);

  const selectedIngest = useMemo(
    () =>
      filteredIngests.find((ev) => ev.id === selectedIngestId) ??
      filteredIngests[0] ??
      null,
    [filteredIngests, selectedIngestId]
  );

  const parsedIngestElements = useMemo(() => {
    if (!selectedIngest?.elements_json) return null;
    try {
      return JSON.parse(selectedIngest.elements_json) as unknown;
    } catch {
      return selectedIngest.elements_json;
    }
  }, [selectedIngest]);

  const distilledElements = useMemo(() => {
    const list =
      browserOutput?.dom?.elements ??
      browserOutput?.result?.elements ??
      [];
    const q = domQueryFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((el) =>
      [el.tag, el.type, el.text, el.name, el.href]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [browserOutput, domQueryFilter]);

  const resolvedBrowserMeta = useMemo(() => {
    if (!browserOutput) return null;
    const url = browserOutput.dom?.url ?? browserOutput.result?.url ?? browserOutput.url ?? browserUrl;
    const title = browserOutput.dom?.title ?? browserOutput.result?.page_title ?? '';
    const count =
      browserOutput.dom?.elements_count ??
      browserOutput.result?.elements_count ??
      distilledElements.length;
    const latencyMs = browserOutput.result?.latency_ms;
    return {
      engine: browserOutput.dom?.engine ?? browserOutput.engine ?? browserEngine,
      url,
      title,
      count,
      latencyMs,
      status: browserOutput.status,
    };
  }, [browserOutput, browserEngine, browserUrl, distilledElements.length]);

  const recentReachEvents = scoutStatus?.recent_events ?? [];
  const doctor = scoutStatus?.status;
  const reachInstalled = Boolean(doctor?.installed);

  return (
    <div className="h-full flex flex-col p-6 gap-6 overflow-y-auto animate-obsidian-fade">
      {/* Air-Gap Aware Sovereign Banner when SILENT mode is engaged */}
      {isSilentMode && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0"
        >
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-amber-300 font-semibold">
                <span>SILENT Air-Gap Active</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                  WorkspaceGovernor
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                External Scout Reach queries, outbound web reads, and new web ingests are strictly
                blocked while <span className="font-mono text-amber-200">SILENT</span> mode is active.
                Cached local WAL ingests remain inspectable offline.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={switchingMode}
            onClick={() => void handleRestoreDevMode()}
            className="px-3.5 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-2 transition-colors shrink-0 disabled:opacity-50"
          >
            <Unlock className="w-3.5 h-3.5" />
            <span>{switchingMode ? 'Switching...' : 'Switch to DEV Mode'}</span>
          </button>
        </div>
      )}

      {/* Calm Header & Sub-Tab Navigation */}
      <header className="obsidian-panel rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide text-[var(--text)]">
              World & Web Intelligence
            </h1>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              SCOUT-01 multi-channel recon, Shadow-DOM web ingests & Obscura browser bridge
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <nav className="flex items-center gap-1.5 bg-[var(--panel-muted)] p-1 rounded-lg border border-[var(--border-subtle)]">
          {(
            [
              { id: 'scout', label: 'Scout Recon', icon: Compass },
              { id: 'ingests', label: 'Web Ingests', icon: Layers },
              { id: 'browser', label: 'Browser Engine', icon: Eye },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Status Indicator & Refresh */}
        <div className="flex items-center gap-2.5">
          <span
            className={`px-2.5 py-1 rounded-md border text-[11px] font-mono flex items-center gap-1.5 ${
              isSilentMode
                ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                : reachInstalled
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                  : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)]'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>
              {isSilentMode
                ? 'AIR-GAPPED'
                : reachInstalled
                  ? `REACH v${doctor?.pinned_version ?? '0.1.0'}`
                  : 'REACH STANDBY'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (subTab === 'ingests') {
                void loadWebIngests();
              } else {
                void loadScoutStatus();
              }
            }}
            className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${statusLoading || ingestLoading ? 'animate-spin text-emerald-400' : ''}`}
            />
            <span>Sync</span>
          </button>
        </div>
      </header>

      {/* TAB 1: SCOUT RECON */}
      {subTab === 'scout' && (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          {/* Diagnostic Readiness Strip */}
          <section className="obsidian-panel rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Reach Engine
              </span>
              <span
                className={`px-2 py-0.5 rounded border text-[11px] font-mono ${
                  reachInstalled
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                }`}
              >
                {statusLoading
                  ? 'PROBING...'
                  : reachInstalled
                    ? 'CLI READY'
                    : 'CLI NOT FOUND'}
              </span>
              {doctor?.executable && (
                <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-xs">
                  {doctor.executable}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {doctor?.channels ? (
                Object.entries(doctor.channels).map(([ch, state]) => (
                  <span
                    key={ch}
                    className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[11px] font-mono text-[var(--text-secondary)]"
                  >
                    {ch}: <span className="text-[var(--text-muted)]">{state}</span>
                  </span>
                ))
              ) : (
                <span className="text-[11px] font-mono text-[var(--text-muted)]">
                  Cached Reach Events: {scoutStatus?.count ?? recentReachEvents.length}
                </span>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
            {/* Left Column: Search, Read & Cached Events */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Scout Search Card */}
              <form
                onSubmit={handleScoutSearch}
                className="obsidian-panel rounded-xl p-5 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <Search className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Multi-Channel Search</span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    /api/scout/reach/search
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Query GitHub, Reddit, YouTube, X, or web..."
                    className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs text-[var(--text)] outline-none"
                  />
                  <div className="flex items-center gap-2.5">
                    <select
                      value={searchChannel}
                      onChange={(e) => setSearchChannel(e.target.value)}
                      aria-label="Search Channel"
                      className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
                    >
                      {CHANNELS.map((ch) => (
                        <option key={ch} value={ch}>
                          {ch.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={!searchQuery.trim() || Boolean(reconBusy) || isSilentMode}
                      className="flex-1 px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <span>{reconBusy === 'search' ? 'Searching...' : 'Run Scout Search'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* Scout Web Reader Card */}
              <form
                onSubmit={handleScoutReadSubmit}
                className="obsidian-panel rounded-xl p-5 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <FileText className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Structured Web Reader</span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    /api/scout/reach/read
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="url"
                    value={readUrl}
                    onChange={(e) => setReadUrl(e.target.value)}
                    placeholder="https://github.com/... or article URL"
                    className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!readUrl.trim() || Boolean(reconBusy) || isSilentMode}
                    className="px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>{reconBusy === 'read' ? 'Reading...' : 'Read'}</span>
                  </button>
                </div>
              </form>

              {/* Recent Cached Reach Events */}
              <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-3 flex-1 min-h-[220px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    Cached Reach History ({recentReachEvents.length})
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    SQLite WAL
                  </span>
                </div>
                {recentReachEvents.length === 0 ? (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                    No cached Scout Reach events in WAL yet. Run a search or read a target URL to index findings.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {recentReachEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => handleInspectCachedReach(ev)}
                        className="text-left rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 px-3.5 py-2.5 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {ev.title || ev.source_url || ev.id}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-300 uppercase shrink-0">
                            {ev.channel ?? 'web'}
                          </span>
                        </div>
                        {ev.source_url && (
                          <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-1">
                            {ev.source_url}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Right Column: Active Recon Output Inspector */}
            <section className="lg:col-span-7 obsidian-panel rounded-xl p-5 flex flex-col gap-4 min-h-[420px]">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <h2 className="text-xs font-mono uppercase tracking-[0.14em] text-[var(--text)] truncate">
                    {reconOutput?.title || 'Recon Output Inspector'}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {reconOutput?.cached && (
                    <span className="px-2 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-[10px] font-mono text-emerald-300">
                      CACHED
                    </span>
                  )}
                  {typeof reconOutput?.latency_ms === 'number' && (
                    <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[10px] font-mono text-[var(--text-secondary)]">
                      {Math.round(reconOutput.latency_ms)} ms
                    </span>
                  )}
                  {reconOutput && (
                    <button
                      type="button"
                      onClick={() => void handleCopyReconContent()}
                      className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center gap-1"
                    >
                      {copiedRecon ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedRecon ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              {!reconOutput ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                  <Compass className="w-8 h-8 text-emerald-500/40" />
                  <p className="text-xs text-[var(--text-secondary)] max-w-md leading-relaxed">
                    Execute a multi-channel search, read a target URL, or select a cached WAL event
                    on the left to inspect structured output here.
                  </p>
                  {!reachInstalled && doctor?.message && (
                    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left max-w-lg">
                      <div className="text-[11px] font-mono text-amber-300 font-medium">
                        Agent-Reach CLI Notice
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{doctor.message}</p>
                      {doctor.install_cmd && (
                        <code className="block mt-2 text-[11px] font-mono text-emerald-300 bg-[#07090d] px-2.5 py-1.5 rounded border border-[var(--border-subtle)]">
                          {doctor.install_cmd}
                        </code>
                      )}
                    </div>
                  )}
                </div>
              ) : reconOutput.blocked ? (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-5 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-amber-200">
                      Execution Blocked by Security Guardrail
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {reconOutput.reason ?? reconOutput.error ?? 'Blocked by WorkspaceGovernor / ScopeGuard.'}
                    </span>
                  </div>
                </div>
              ) : reconOutput.ok === false || reconOutput.success === false ? (
                <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-5 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Scout Operation Failed</span>
                  </div>
                  <p className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap">
                    {reconOutput.error ?? 'Unknown error executing Scout Reach command.'}
                  </p>
                  {reconOutput.install_cmd && (
                    <code className="mt-1 text-[11px] font-mono text-emerald-300 bg-[#07090d] px-2.5 py-1.5 rounded border border-[var(--border-subtle)] w-fit">
                      {reconOutput.install_cmd}
                    </code>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                  {reconOutput.source_url && (
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-muted)]">
                      <span className="truncate">{reconOutput.source_url}</span>
                      {isSafeExternalUrl(reconOutput.source_url) && (
                        <a
                          href={reconOutput.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 shrink-0"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Search Result Items */}
                  {Array.isArray(reconOutput.results) && reconOutput.results.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Results ({reconOutput.results.length})
                      </div>
                      {reconOutput.results.map((item, idx) => {
                        const itemUrl =
                          typeof item.url === 'string'
                            ? item.url
                            : typeof item.link === 'string'
                              ? item.link
                              : '';
                        return (
                          <div
                            key={`${itemUrl || item.title || 'res'}-${idx}`}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5 flex flex-col gap-1.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="text-xs font-medium text-[var(--text)]">
                                {item.title || itemUrl || `Result #${idx + 1}`}
                              </span>
                              {itemUrl && !isSilentMode && (
                                <button
                                  type="button"
                                  disabled={Boolean(reconBusy)}
                                  onClick={() => void runScoutRead(itemUrl)}
                                  className="px-2 py-1 rounded border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10px] font-mono text-emerald-300 shrink-0"
                                >
                                  Read Page
                                </button>
                              )}
                            </div>
                            {(item.snippet || item.summary) && (
                              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {item.snippet || item.summary}
                              </p>
                            )}
                            {itemUrl && (
                              <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                                {itemUrl}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Summary / Extracted Content */}
                  {(reconOutput.content || reconOutput.summary_or_body || reconOutput.summary) && (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] p-4">
                      <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">
                        Extracted Content
                      </div>
                      <pre className="text-xs font-mono text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed">
                        {reconOutput.content || reconOutput.summary_or_body || reconOutput.summary}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: RECENT WEB INGESTS */}
      {subTab === 'ingests' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
          {/* Left Feed List */}
          <section className="lg:col-span-5 obsidian-panel rounded-xl p-5 flex flex-col gap-4 min-h-[420px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Recent Web Ingests ({filteredIngests.length})</span>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                {ingestData?.status ?? 'Checking...'}
              </span>
            </div>

            <input
              type="text"
              value={ingestFilter}
              onChange={(e) => setIngestFilter(e.target.value)}
              placeholder="Filter ingested URLs, titles, or sources..."
              className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs text-[var(--text)] outline-none"
            />

            {ingestLoading && filteredIngests.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs font-mono text-[var(--text-secondary)]">
                Loading web ingest events...
              </div>
            ) : filteredIngests.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 text-xs text-[var(--text-secondary)] leading-relaxed">
                No web ingest events match your filter. Shadow-DOM extensions and headless web bridges
                write here via <code className="font-mono text-emerald-300">POST /api/bridge/web-ingest</code>.
              </div>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
                {filteredIngests.map((ev) => {
                  const active = selectedIngest?.id === ev.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedIngestId(ev.id)}
                      className={`text-left rounded-lg border px-3.5 py-3 transition-colors ${
                        active
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text)] truncate">
                          {ev.title || ev.url || ev.id}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#07090d] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)] shrink-0">
                          {ev.source || 'web'}
                        </span>
                      </div>
                      {ev.url && (
                        <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-1">
                          {ev.url}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-[var(--text-muted)]">
                        <span>{ev.workspace_mode || 'DEV'}</span>
                        <span>{formatTimestamp(ev.created_at)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Ingest Detail */}
          <section className="lg:col-span-7 obsidian-panel rounded-xl p-5 flex flex-col gap-4 min-h-[420px]">
            {!selectedIngest ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
                <Layers className="w-8 h-8 text-emerald-500/40" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Select a web ingest event to inspect captured Shadow-DOM payload, prompt, and TARS commentary.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 overflow-y-auto pr-1">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-[var(--text)] break-words">
                      {selectedIngest.title || 'Captured Web Event'}
                    </h2>
                    {selectedIngest.url && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] font-mono text-[var(--text-muted)] break-all">
                          {selectedIngest.url}
                        </span>
                        {isSafeExternalUrl(selectedIngest.url) && (
                          <a
                            href={selectedIngest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 shrink-0"
                            title="Open URL"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-emerald-300">
                      {selectedIngest.source || 'web'}
                    </span>
                    <span className="px-2 py-0.5 rounded border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]">
                      {formatTimestamp(selectedIngest.created_at)}
                    </span>
                  </div>
                </div>

                {selectedIngest.prompt && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] mb-1">
                      Captured Prompt / Context
                    </div>
                    <p className="text-xs text-[var(--text)] whitespace-pre-wrap">
                      {selectedIngest.prompt}
                    </p>
                  </div>
                )}

                {(selectedIngest.response_text || selectedIngest.response) && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] mb-1.5">
                      Response / Extracted Body
                    </div>
                    <pre className="text-xs font-mono text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed">
                      {selectedIngest.response_text || selectedIngest.response}
                    </pre>
                  </div>
                )}

                {(selectedIngest.tars_commentary || selectedIngest.commentary) && (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-300 mb-1">
                      Sentinel Commentary
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">
                      {selectedIngest.tars_commentary || selectedIngest.commentary}
                    </p>
                  </div>
                )}

                {parsedIngestElements !== null && (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] p-3.5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-muted)] mb-1.5">
                      Shadow-DOM Elements Payload
                    </div>
                    <pre className="text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                      {typeof parsedIngestElements === 'string'
                        ? parsedIngestElements
                        : JSON.stringify(parsedIngestElements, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: BROWSER ENGINE / OBSCURA DOM INSPECTOR */}
      {subTab === 'browser' && (
        <div className="flex flex-col gap-6 flex-1 min-h-0">
          {/* Controls Bar */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Browser Engine & Obscura DOM Inspector</span>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                POST /api/bridge/browser-engine
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-3">
                <select
                  value={browserEngine}
                  onChange={(e) => setBrowserEngine(e.target.value as BrowserEngineType)}
                  aria-label="Browser Engine"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
                >
                  <option value="auto">Engine: AUTO</option>
                  <option value="obscura">Engine: OBSCURA (Rust CDP)</option>
                  <option value="chromium_persistent">Engine: CHROMIUM PERSISTENT</option>
                </select>
              </div>
              <div className="lg:col-span-5">
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  placeholder="Target URL (https://... or file:///...)"
                  className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                />
              </div>
              <div className="lg:col-span-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={Boolean(browserBusy) || !browserUrl.trim()}
                  onClick={() => void handleBrowserDispatch('navigate')}
                  className="flex-1 px-3.5 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium transition-colors disabled:opacity-45"
                >
                  {browserBusy === 'navigate' ? 'Navigating...' : 'Navigate'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(browserBusy)}
                  onClick={() => void handleBrowserDispatch('inspect')}
                  className="flex-1 px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-medium text-[var(--text)] transition-colors disabled:opacity-45"
                >
                  {browserBusy === 'inspect' ? 'Inspecting...' : 'Inspect DOM'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(browserBusy)}
                  onClick={() => void handleBrowserDispatch('status')}
                  className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)] text-xs text-[var(--text-secondary)] transition-colors disabled:opacity-45"
                >
                  Status
                </button>
              </div>
            </div>
          </section>

          {/* DOM Inspector Output */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4 flex-1 min-h-[340px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <span className="px-2.5 py-1 rounded border border-emerald-500/35 bg-emerald-500/10 font-mono text-emerald-300">
                  {resolvedBrowserMeta?.engine?.toUpperCase() ?? browserEngine.toUpperCase()}
                </span>
                {resolvedBrowserMeta?.title && (
                  <span className="font-medium text-[var(--text)]">
                    {resolvedBrowserMeta.title}
                  </span>
                )}
                {resolvedBrowserMeta?.url && (
                  <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-md">
                    {resolvedBrowserMeta.url}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {typeof resolvedBrowserMeta?.latencyMs === 'number' && (
                  <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                    {resolvedBrowserMeta.latencyMs.toFixed(1)} ms
                  </span>
                )}
                <input
                  type="text"
                  value={domQueryFilter}
                  onChange={(e) => setDomQueryFilter(e.target.value)}
                  placeholder="Filter distilled DOM elements..."
                  className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-1.5 text-xs text-[var(--text)] outline-none w-56"
                />
              </div>
            </div>

            {!browserOutput ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
                <Eye className="w-8 h-8 text-emerald-500/40" />
                <p className="text-xs text-[var(--text-secondary)] max-w-md leading-relaxed">
                  Click <span className="font-mono text-emerald-300">Navigate</span> to warm the
                  Obscura / Chromium CDP bridge and distill interactive elements, or{' '}
                  <span className="font-mono text-emerald-300">Inspect DOM</span> to query the live DOM map.
                </p>
              </div>
            ) : browserOutput.success === false ? (
              <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-4 text-xs font-mono text-red-300">
                {browserOutput.error ?? 'Browser engine returned an error.'}
              </div>
            ) : distilledElements.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Session active ({resolvedBrowserMeta?.status ?? 'connected'}).{' '}
                {resolvedBrowserMeta?.count === 0
                  ? '0 interactive elements distilled for the current URL. Remote HTTPS URLs require an attached CDP session or local file:/// target.'
                  : 'No elements matched your filter.'}
              </div>
            ) : (
              <div className="overflow-auto flex-1 rounded-lg border border-[var(--border-subtle)] bg-[#07090d]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--panel-muted)] text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Tag</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Text / Label</th>
                      <th className="py-2.5 px-3">Bounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distilledElements.map((el) => (
                      <tr
                        key={String(el.id)}
                        className="border-b border-[var(--border-subtle)] hover:bg-[var(--panel)] transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-emerald-300">[{el.id}]</td>
                        <td className="py-2 px-3 font-mono text-[var(--text)]">{el.tag ?? '—'}</td>
                        <td className="py-2 px-3 font-mono text-[var(--text-secondary)]">
                          {el.type || 'interactive'}
                        </td>
                        <td className="py-2 px-3 text-[var(--text)] max-w-md truncate">
                          {el.text || el.name || el.href || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-[var(--text-muted)]">
                          {Array.isArray(el.rect) ? el.rect.join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default WorldView;
