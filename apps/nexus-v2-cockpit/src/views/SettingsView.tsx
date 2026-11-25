import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Palette,
  QrCode,
  RefreshCw,
  Server,
  Sliders,
  Sparkles,
  Trash2,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { ProviderItem } from '../types';

type SettingsSubTab = 'providers' | 'compute' | 'appearance' | 'remote';
type ProviderFilter = 'all' | 'configured' | 'free';
type SkillsMode = 'skills' | 'tools';

interface ProvidersResponse {
  success?: boolean;
  providers?: ProviderItem[];
  count?: number;
  error?: string;
}

interface ProviderTestResult {
  success?: boolean;
  status?: string;
  latency_ms?: number;
  provider_id?: string;
  error?: string;
}

interface HfStatusResponse {
  success?: boolean;
  authenticated?: boolean;
  status?: string;
  username?: string;
  email?: string;
  organizations?: string[];
  type?: string;
  message?: string;
  error?: string;
}

interface SystemActionResult {
  success?: boolean;
  message?: string;
  released?: number;
  checkpoint?: number[];
  db_path?: string;
  error?: string;
  [key: string]: unknown;
}

interface ThemeTokens {
  void_bg?: string;
  accent_primary?: string;
  accent_secondary?: string;
  surface_tint?: string;
  typography_pair?: string;
  core_morphology?: string;
  [key: string]: unknown;
}

interface ThemeItem {
  id: string;
  name: string;
  is_builtin?: boolean;
  tokens?: ThemeTokens;
  is_active?: boolean;
  updated_at?: string;
}

interface ThemesResponse {
  success?: boolean;
  themes?: ThemeItem[];
  active_theme?: ThemeItem;
  error?: string;
}

interface WallpaperItem {
  id: string;
  name: string;
  kind?: string;
  source_path?: string;
  mode_binding?: string;
  config?: Record<string, unknown>;
  is_active?: boolean;
  updated_at?: string;
}

interface WallpapersResponse {
  success?: boolean;
  wallpapers?: WallpaperItem[];
  active_wallpaper?: WallpaperItem | null;
  error?: string;
}

interface QrRegenerateResponse {
  success?: boolean;
  pairing_url?: string;
  token?: string;
  host?: string;
  port?: number;
  pin?: string;
  tunnel_url?: string;
  tunnel_type?: string;
  bound_to?: string;
  expires_in_seconds?: number;
  qr_base64?: string;
  error?: string;
}

interface RemoteConnectResponse {
  success?: boolean;
  message?: string;
  ipc_host?: string;
  ipc_port?: number;
  timestamp?: number;
  error?: string;
}

interface InstalledSkillItem {
  slug: string;
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
  orbiter_group?: string;
  permission_scope?: string[];
}

interface RegisteredToolItem {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
  plugin_file?: string;
}

interface SkillsResponse {
  success?: boolean;
  skills?: InstalledSkillItem[];
  tools?: RegisteredToolItem[];
  error?: string;
}

export function SettingsView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<SettingsSubTab>('providers');

  // Providers & Keys state
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState('');
  const [draftApiKey, setDraftApiKey] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [probeResult, setProbeResult] = useState<ProviderTestResult | null>(null);

  // Compute & Hardware state
  const [hfStatus, setHfStatus] = useState<HfStatusResponse | null>(null);
  const [hfLoading, setHfLoading] = useState(false);
  const [hfTokenInput, setHfTokenInput] = useState('');
  const [releasingGpu, setReleasingGpu] = useState(false);
  const [gpuResult, setGpuResult] = useState<SystemActionResult | null>(null);
  const [checkpointingWal, setCheckpointingWal] = useState(false);
  const [walResult, setWalResult] = useState<SystemActionResult | null>(null);

  // Themes & Wallpapers state
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string>('');
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [activeWallpaperId, setActiveWallpaperId] = useState<string>('');
  const [appearanceLoading, setAppearanceLoading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // Remote & Skills state
  const [qrInfo, setQrInfo] = useState<QrRegenerateResponse | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [connectToken, setConnectToken] = useState('');
  const [connectResult, setConnectResult] = useState<RemoteConnectResponse | null>(null);
  const [connectingRemote, setConnectingRemote] = useState(false);

  const [skills, setSkills] = useState<InstalledSkillItem[]>([]);
  const [tools, setTools] = useState<RegisteredToolItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsMode, setSkillsMode] = useState<SkillsMode>('skills');
  const [skillsSearch, setSkillsSearch] = useState('');

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const res = await ipcJson<ProvidersResponse>('/api/providers');
      if (Array.isArray(res.providers)) {
        setProviders(res.providers);
        setSelectedProviderId((prev) =>
          prev && res.providers?.some((p) => p.provider_id === prev)
            ? prev
            : res.providers?.[0]?.provider_id ?? null
        );
      } else if (res.error) {
        pushToast(res.error, 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading providers', 'error');
    } finally {
      setProvidersLoading(false);
    }
  }, [pushToast]);

  const loadHfStatus = useCallback(async (overrideToken?: string) => {
    setHfLoading(true);
    try {
      const cleanToken = overrideToken?.trim();
      const url = cleanToken
        ? `/api/hf/status?token=${encodeURIComponent(cleanToken)}`
        : '/api/hf/status';
      const resp = await ipcFetch(url);
      const data = (await resp.json()) as HfStatusResponse;
      setHfStatus(data);
    } catch (err) {
      setHfStatus({
        success: false,
        authenticated: false,
        status: 'OFFLINE',
        error: err instanceof Error ? err.message : 'Hugging Face probe failed',
      });
    } finally {
      setHfLoading(false);
    }
  }, []);

  const loadAppearance = useCallback(async () => {
    setAppearanceLoading(true);
    try {
      const [themesRes, wallsRes] = await Promise.all([
        ipcJson<ThemesResponse>('/api/themes'),
        ipcJson<WallpapersResponse>('/api/wallpapers'),
      ]);
      if (Array.isArray(themesRes.themes)) {
        setThemes(themesRes.themes);
      }
      if (themesRes.active_theme?.id) {
        setActiveThemeId(themesRes.active_theme.id);
      }
      if (Array.isArray(wallsRes.wallpapers)) {
        setWallpapers(wallsRes.wallpapers);
      }
      if (wallsRes.active_wallpaper?.id) {
        setActiveWallpaperId(wallsRes.active_wallpaper.id);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading themes & wallpapers', 'error');
    } finally {
      setAppearanceLoading(false);
    }
  }, [pushToast]);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await ipcJson<SkillsResponse>('/api/skills');
      if (Array.isArray(res.skills)) setSkills(res.skills);
      if (Array.isArray(res.tools)) setTools(res.tools);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading skills registry', 'error');
    } finally {
      setSkillsLoading(false);
    }
  }, [pushToast]);

  const handleRegenerateQr = useCallback(async () => {
    setQrLoading(true);
    try {
      const res = await ipcJson<QrRegenerateResponse>('/api/remote/qr-regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setQrInfo(res);
      if (res.token) {
        setConnectToken(res.token);
      }
      if (res.success !== false) {
        pushToast('Generated scoped remote QR pairing token', 'success');
      } else {
        pushToast(res.error || 'Failed regenerating QR pairing', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'QR pairing endpoint unreachable', 'error');
    } finally {
      setQrLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadProviders();
    void loadHfStatus();
    void loadAppearance();
    void loadSkills();
  }, [loadProviders, loadHfStatus, loadAppearance, loadSkills]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.provider_id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (!selectedProvider) return;
    setDraftModel(selectedProvider.selected_model || '');
    setDraftEnabled(Boolean(selectedProvider.enabled));
    setDraftApiKey('');
    setProbeResult(null);
  }, [selectedProvider]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return providers.filter((p) => {
      if (providerFilter === 'configured' && !Boolean(p.has_key)) return false;
      if (providerFilter === 'free' && !(p.free_tier_badge || '').toLowerCase().includes('free')) {
        return false;
      }
      if (!q) return true;
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.provider_id.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [providers, providerSearch, providerFilter]);

  const handleSaveProvider = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    setSavingProvider(true);
    try {
      const payload: Record<string, unknown> = {
        selected_model: draftModel.trim() || selectedProvider.selected_model,
        enabled: draftEnabled,
      };
      if (draftApiKey.trim()) {
        payload.api_key = draftApiKey.trim();
      }
      const res = await ipcJson<{ success?: boolean; has_key?: number; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/save`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.success) {
        setDraftApiKey('');
        pushToast(`Saved ${selectedProvider.display_name} configuration`, 'success');
        await loadProviders();
      } else {
        pushToast(res.error || 'Failed saving provider', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Save provider request failed', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async () => {
    if (!selectedProvider) return;
    setTestingProvider(true);
    try {
      const body: Record<string, string> = {};
      if (draftApiKey.trim()) {
        body.api_key = draftApiKey.trim();
      }
      const res = await ipcJson<ProviderTestResult>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      setProbeResult(res);
      if (res.success) {
        pushToast(`${selectedProvider.display_name} operational (${res.latency_ms ?? 0}ms)`, 'success');
        await loadProviders();
      } else {
        pushToast(res.error || `${selectedProvider.display_name} probe failed`, 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Provider latency probe failed', 'error');
    } finally {
      setTestingProvider(false);
    }
  };

  const handleDeleteProviderKey = async () => {
    if (!selectedProvider) return;
    setDeletingKey(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/key`,
        { method: 'DELETE' }
      );
      if (res.success) {
        setDraftApiKey('');
        pushToast(`Removed vault key for ${selectedProvider.display_name}`, 'info');
        await loadProviders();
      } else {
        pushToast(res.error || 'Failed removing key', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Key deletion failed', 'error');
    } finally {
      setDeletingKey(false);
    }
  };

  const handleReleaseGpu = async () => {
    setReleasingGpu(true);
    try {
      const res = await ipcJson<SystemActionResult>('/api/system/release-gpu', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setGpuResult(res);
      pushToast(res.message || 'Idle cloud GPU nodes released', res.success !== false ? 'success' : 'warn');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Release GPU failed', 'error');
    } finally {
      setReleasingGpu(false);
    }
  };

  const handleWalCheckpoint = async () => {
    setCheckpointingWal(true);
    try {
      const res = await ipcJson<SystemActionResult>('/api/system/wal-checkpoint', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setWalResult(res);
      pushToast('SQLite WAL truncated and checkpointed', res.success ? 'success' : 'error');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WAL checkpoint failed', 'error');
    } finally {
      setCheckpointingWal(false);
    }
  };

  const handleActivateTheme = async (themeId: string) => {
    setActivatingId(themeId);
    try {
      const res = await ipcJson<{ success?: boolean; active_theme?: ThemeItem; error?: string }>(
        `/api/themes/activate/${encodeURIComponent(themeId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ theme_id: themeId }),
        }
      );
      if (res.success) {
        setActiveThemeId(res.active_theme?.id || themeId);
        await loadAppearance();
        pushToast(`Activated theme: ${res.active_theme?.name || themeId}`, 'success');
      } else {
        pushToast(res.error || 'Theme activation failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Theme activation failed', 'error');
    } finally {
      setActivatingId(null);
    }
  };

  const handleActivateWallpaper = async (wallpaperId: string) => {
    setActivatingId(wallpaperId);
    try {
      const res = await ipcJson<{ success?: boolean; active_wallpaper?: WallpaperItem; error?: string }>(
        `/api/wallpapers/activate/${encodeURIComponent(wallpaperId)}`,
        {
          method: 'POST',
          body: JSON.stringify({ wallpaper_id: wallpaperId }),
        }
      );
      if (res.success) {
        setActiveWallpaperId(res.active_wallpaper?.id || wallpaperId);
        await loadAppearance();
        pushToast(`Activated wallpaper: ${res.active_wallpaper?.name || wallpaperId}`, 'success');
      } else {
        pushToast(res.error || 'Wallpaper activation failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Wallpaper activation failed', 'error');
    } finally {
      setActivatingId(null);
    }
  };

  const handleVerifyRemoteConnect = async (e: FormEvent) => {
    e.preventDefault();
    const token = connectToken.trim();
    setConnectingRemote(true);
    try {
      const url = token
        ? `/api/remote/connect?token=${encodeURIComponent(token)}`
        : '/api/remote/connect';
      const resp = await ipcFetch(url);
      const data = (await resp.json()) as RemoteConnectResponse;
      setConnectResult(data);
      if (resp.ok && data.success) {
        pushToast(data.message || 'Remote handshake verified', 'success');
      } else {
        pushToast(data.error || 'Remote token invalid or expired', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Remote connect verification failed', 'error');
    } finally {
      setConnectingRemote(false);
    }
  };

  const filteredSkills = useMemo(() => {
    const q = skillsSearch.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q)
    );
  }, [skills, skillsSearch]);

  const filteredTools = useMemo(() => {
    const q = skillsSearch.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.agent || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [tools, skillsSearch]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header & Clean 4-Tab Bar */}
      <div className="aether-glass rounded-2xl p-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">
              Cockpit Control &amp; Configuration
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
              {providers.filter((p) => Boolean(p.has_key)).length} / {providers.length} KEYS
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Segmented management for BYOK provider keys, compute hardware, Theme Forge, and remote pairing.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Settings sub-tabs"
          className="inline-flex flex-wrap items-center p-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/20 gap-1"
        >
          {(
            [
              { id: 'providers', label: 'Providers & Keys', icon: KeyRound },
              { id: 'compute', label: 'Compute & Hardware', icon: Cpu },
              { id: 'appearance', label: 'Themes & Wallpapers', icon: Palette },
              { id: 'remote', label: 'Remote & Skills', icon: QrCode },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/35'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUB-TAB 1: PROVIDERS & KEYS (Master-Detail to prevent input walls) */}
      {subTab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Provider Selector List */}
          <div className="lg:col-span-5 aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Provider Directory</h2>
              <button
                type="button"
                onClick={() => void loadProviders()}
                disabled={providersLoading}
                aria-label="Refresh providers"
                className="p-1.5 rounded-lg bg-[#050a14] hover:bg-cyan-500/15 text-slate-300 border border-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${providersLoading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>

            <input
              type="text"
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              placeholder="Filter providers by name or category..."
              className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />

            <div className="inline-flex p-1 rounded-xl bg-[#050a14] border border-slate-800 gap-1 w-full">
              {(
                [
                  { id: 'all', label: `All (${providers.length})` },
                  { id: 'configured', label: 'With Key' },
                  { id: 'free', label: 'Free Tier' },
                ] as const
              ).map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setProviderFilter(flt.id)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                    providerFilter === flt.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {filteredProviders.map((p) => {
                const active = p.provider_id === selectedProvider?.provider_id;
                const hasKey = Boolean(p.has_key);
                return (
                  <button
                    key={p.provider_id}
                    type="button"
                    onClick={() => setSelectedProviderId(p.provider_id)}
                    className={`w-full text-left rounded-xl p-3 border transition-colors flex items-center justify-between gap-3 ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-400/45'
                        : 'bg-[#050a14]/75 border-slate-800 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            hasKey ? 'bg-emerald-400' : 'bg-slate-600'
                          }`}
                        />
                        <span className="text-xs font-medium text-slate-100 truncate">
                          {p.display_name}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 truncate pl-4">
                        {p.selected_model || p.protocol}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <div className="text-[10px] font-mono text-cyan-300">
                        {p.last_status || (hasKey ? 'CONFIGURED' : 'UNCONFIGURED')}
                      </div>
                      {typeof p.last_latency_ms === 'number' && (
                        <div className="text-[10px] font-mono text-slate-400">
                          {p.last_latency_ms}ms
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
              {filteredProviders.length === 0 && (
                <div className="text-xs text-slate-400 text-center py-8">
                  No providers match that filter.
                </div>
              )}
            </div>
          </div>

          {/* Single Selected Provider Inspector */}
          <div className="lg:col-span-7 aether-bracket-card rounded-2xl p-6">
            {selectedProvider ? (
              <form onSubmit={handleSaveProvider} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-100">
                        {selectedProvider.display_name}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          Boolean(selectedProvider.has_key)
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {Boolean(selectedProvider.has_key) ? 'KEY SEALED IN DPAPI' : 'NO KEY SET'}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400">
                      {selectedProvider.protocol} • {selectedProvider.base_url || 'Native SDK'}
                    </div>
                  </div>

                  {selectedProvider.key_console_url && (
                    <a
                      href={selectedProvider.key_console_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-[#050a14] hover:bg-cyan-500/15 text-xs text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5"
                    >
                      Get Key
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {selectedProvider.free_tier_badge && (
                  <div className="rounded-xl bg-emerald-950/25 border border-emerald-500/25 px-3.5 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{selectedProvider.free_tier_badge}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="provider-model-input" className="text-xs font-medium text-slate-300">
                      Default Model ID
                    </label>
                    <input
                      id="provider-model-input"
                      type="text"
                      value={draftModel}
                      onChange={(e) => setDraftModel(e.target.value)}
                      placeholder="Model identifier"
                      className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="provider-key-input" className="text-xs font-medium text-slate-300">
                      API Key (Stored in Windows DPAPI Vault)
                    </label>
                    <div className="relative">
                      <input
                        id="provider-key-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={draftApiKey}
                        onChange={(e) => setDraftApiKey(e.target.value)}
                        placeholder={
                          Boolean(selectedProvider.has_key)
                            ? 'Enter new key to rotate DPAPI secret'
                            : 'Paste API key to seal locally'
                        }
                        className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 pl-3.5 pr-10 py-2.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={draftEnabled}
                      onChange={(e) => setDraftEnabled(e.target.checked)}
                      className="rounded border-cyan-500/40 bg-[#050a14] text-cyan-400 focus:ring-cyan-400"
                    />
                    <span className="text-xs text-slate-200">Enable provider in LLM cascade router</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    disabled={!Boolean(selectedProvider.has_key) || deletingKey}
                    onClick={() => void handleDeleteProviderKey()}
                    className="px-3.5 py-2 rounded-xl bg-[#050a14] hover:bg-rose-500/15 disabled:opacity-40 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingKey ? 'Deleting...' : 'Delete Key'}
                  </button>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={testingProvider}
                      onClick={() => void handleTestProvider()}
                      className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-45 text-cyan-200 border border-cyan-400/35 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      {testingProvider ? 'Probing...' : 'Test Connection'}
                    </button>

                    <button
                      type="submit"
                      disabled={savingProvider}
                      className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold transition-colors"
                    >
                      {savingProvider ? 'Saving...' : 'Save Provider'}
                    </button>
                  </div>
                </div>

                {probeResult && (
                  <div
                    className={`aether-panel rounded-xl p-4 text-xs space-y-1 border ${
                      probeResult.success ? 'border-emerald-500/35' : 'border-amber-500/35'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className={probeResult.success ? 'text-emerald-300' : 'text-amber-300'}>
                        PROBE: {probeResult.status || (probeResult.success ? 'OPERATIONAL' : 'FAILED')}
                      </span>
                      {typeof probeResult.latency_ms === 'number' && (
                        <span className="text-cyan-300">{probeResult.latency_ms}ms</span>
                      )}
                    </div>
                    {probeResult.error && <p className="text-slate-300">{probeResult.error}</p>}
                  </div>
                )}
              </form>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Select a provider from the directory to configure credentials and probe latency.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: COMPUTE & HARDWARE */}
      {subTab === 'compute' && (
        <div className="space-y-6">
          {/* Live Hardware Telemetry Summary */}
          <div className="aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">Workstation Compute Telemetry</h2>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-400/30 text-[11px] font-mono">
                PROFILE: {telemetry.recommendedProfile}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="aether-panel rounded-xl p-4 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">CPU TOPOLOGY</div>
                <div className="text-base font-semibold font-mono text-slate-100">
                  {telemetry.cpuPercent.toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-400">
                  {telemetry.cpuCoresPhysical} physical / {telemetry.cpuCoresLogical} logical
                </div>
              </div>
              <div className="aether-panel rounded-xl p-4 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">SYSTEM RAM</div>
                <div className="text-base font-semibold font-mono text-slate-100">
                  {Math.round(telemetry.ramUsedMb)} / {Math.round(telemetry.ramTotalMb)} MB
                </div>
                <div className="text-[11px] text-slate-400">{telemetry.ramPercent.toFixed(1)}% utilized</div>
              </div>
              <div className="aether-panel rounded-xl p-4 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">GPU ACCELERATOR</div>
                <div className="text-sm font-semibold text-slate-100 truncate">{telemetry.gpuName}</div>
                <div className="text-[11px] font-mono text-slate-400">
                  VRAM Free: {Math.round(telemetry.vramFreeMb)} / {Math.round(telemetry.vramTotalMb)} MB
                </div>
              </div>
              <div className="aether-panel rounded-xl p-4 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">LOCAL INFERENCE</div>
                <div className="text-sm font-semibold font-mono text-emerald-300">
                  {telemetry.localLlmCapable ? 'CAPABLE' : 'CLOUD FALLBACK'}
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {telemetry.recommendedLocalModel || 'No local GGUF recommended'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Hugging Face Hub Status */}
            <div className="lg:col-span-6 aether-bracket-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-slate-100">Hugging Face Hub Status</h2>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${
                    hfStatus?.authenticated
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35'
                      : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                  }`}
                >
                  {hfStatus?.status || 'UNKNOWN'}
                </span>
              </div>

              <div className="aether-panel rounded-xl p-4 space-y-2 text-xs">
                {hfStatus?.authenticated ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account</span>
                      <span className="font-mono text-emerald-300">{hfStatus.username}</span>
                    </div>
                    {hfStatus.email && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Email</span>
                        <span className="font-mono text-slate-200">{hfStatus.email}</span>
                      </div>
                    )}
                    {hfStatus.organizations && hfStatus.organizations.length > 0 && (
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">Orgs</span>
                        <span className="font-mono text-slate-200 truncate">
                          {hfStatus.organizations.join(', ')}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-slate-300">
                    {hfStatus?.message || hfStatus?.error || 'Validate a Hugging Face token or store HF_TOKEN in Vault.'}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="password"
                  value={hfTokenInput}
                  onChange={(e) => setHfTokenInput(e.target.value)}
                  placeholder="Optional hf_... token to verify"
                  className="flex-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  disabled={hfLoading}
                  onClick={() => void loadHfStatus(hfTokenInput)}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/40 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${hfLoading ? 'animate-spin' : ''}`} />
                  Check HF Status
                </button>
              </div>
            </div>

            {/* Maintenance Actions: GPU Release & WAL Checkpoint */}
            <div className="lg:col-span-6 space-y-6">
              <div className="aether-glass rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-semibold text-slate-100">Release Cloud GPU Nodes</h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Shut down idle remote Kaggle / cloud compute allocations via QuotaGuard.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={releasingGpu}
                    onClick={() => void handleReleaseGpu()}
                    className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/40 text-xs font-semibold shrink-0"
                  >
                    {releasingGpu ? 'Releasing...' : 'Release GPU'}
                  </button>
                </div>
                {gpuResult && (
                  <div className="aether-panel rounded-xl p-3 text-xs font-mono text-slate-300">
                    {gpuResult.message || gpuResult.error || JSON.stringify(gpuResult)}
                  </div>
                )}
              </div>

              <div className="aether-glass rounded-2xl p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-sm font-semibold text-slate-100">SQLite WAL Checkpoint</h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Flush and truncate `agent_local.db-wal` into the main sovereign database file.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={checkpointingWal}
                    onClick={() => void handleWalCheckpoint()}
                    className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold shrink-0"
                  >
                    {checkpointingWal ? 'Flushing...' : 'Run Checkpoint'}
                  </button>
                </div>
                {walResult && (
                  <div className="aether-panel rounded-xl p-3 text-xs font-mono text-slate-300 flex flex-wrap items-center justify-between gap-2">
                    <span className="truncate">{walResult.db_path || 'agent_local.db'}</span>
                    <span className="text-emerald-300">
                      Frames: {Array.isArray(walResult.checkpoint) ? walResult.checkpoint.join(' / ') : 'OK'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: THEMES & WALLPAPERS */}
      {subTab === 'appearance' && (
        <div className="space-y-6">
          {/* Theme Forge Presets */}
          <div className="aether-glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">Theme Forge Presets</h2>
              </div>
              <button
                type="button"
                onClick={() => void loadAppearance()}
                disabled={appearanceLoading}
                className="px-3 py-1.5 rounded-xl bg-[#050a14] hover:bg-cyan-500/15 text-xs text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${appearanceLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {themes.map((theme) => {
                const isActive = Boolean(theme.is_active) || theme.id === activeThemeId;
                const tokens = theme.tokens || {};
                const swatches = [
                  tokens.void_bg || '#050a14',
                  tokens.surface_tint || '#091322',
                  tokens.accent_primary || '#06b6d4',
                  tokens.accent_secondary || '#34d399',
                ];
                return (
                  <div
                    key={theme.id}
                    className={`aether-panel rounded-2xl p-4 space-y-3 border ${
                      isActive ? 'border-cyan-400/50 aether-glow-cyan' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{theme.name}</div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {tokens.core_morphology ? `Core: ${tokens.core_morphology}` : theme.id}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isActive || activatingId === theme.id}
                        onClick={() => void handleActivateTheme(theme.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                            : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/35'
                        }`}
                      >
                        {isActive ? 'Active' : activatingId === theme.id ? '...' : 'Activate'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {swatches.map((hex, i) => (
                        <span
                          key={`${theme.id}-sw-${i}`}
                          className="w-6 h-6 rounded-lg border border-white/15"
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                      {tokens.typography_pair && (
                        <span className="text-[10px] font-mono text-slate-400 ml-auto truncate">
                          {tokens.typography_pair}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Wallpapers */}
          <div className="aether-glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-100">Shader &amp; Ambient Wallpapers</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {wallpapers.map((wp) => {
                const isActive = Boolean(wp.is_active) || wp.id === activeWallpaperId;
                return (
                  <div
                    key={wp.id}
                    className={`aether-panel rounded-2xl p-4 space-y-3 border ${
                      isActive ? 'border-emerald-400/50 aether-glow-emerald' : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-100 truncate">{wp.name}</div>
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {wp.kind || 'shader'} • {wp.mode_binding || 'GLOBAL'}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isActive || activatingId === wp.id}
                        onClick={() => void handleActivateWallpaper(wp.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                            : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/35'
                        }`}
                      >
                        {isActive ? 'Active' : activatingId === wp.id ? '...' : 'Activate'}
                      </button>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {wp.source_path || wp.id}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: REMOTE PAIRING & SKILLS */}
      {subTab === 'remote' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Remote QR Pairing & Handshake */}
          <div className="lg:col-span-5 aether-bracket-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-100">Mobile &amp; Edge QR Pairing</h2>
              </div>
              <button
                type="button"
                disabled={qrLoading}
                onClick={() => void handleRegenerateQr()}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-45 text-cyan-200 border border-cyan-400/40 text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                {qrInfo ? 'Regenerate QR' : 'Generate QR'}
              </button>
            </div>

            {qrInfo?.qr_base64 ? (
              <div className="aether-panel rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
                <img
                  src={qrInfo.qr_base64}
                  alt="Nexus Remote Pairing QR Code"
                  className="w-36 h-36 rounded-xl bg-white p-1.5 shrink-0"
                />
                <div className="space-y-1.5 text-xs min-w-0 w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">PIN</span>
                    <span className="font-mono font-bold text-cyan-300">{qrInfo.pin}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tunnel</span>
                    <span className="font-mono text-emerald-300">{qrInfo.tunnel_type || 'edge'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bound</span>
                    <span className="font-mono text-slate-200">{qrInfo.bound_to || '127.0.0.1:47630'}</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate pt-1">
                    {qrInfo.tunnel_url}
                  </div>
                </div>
              </div>
            ) : (
              <div className="aether-panel rounded-xl p-6 text-center text-xs text-slate-400">
                Click <span className="text-cyan-300 font-medium">Generate QR</span> to mint a short-lived scoped pairing token bound to 127.0.0.1:47630.
              </div>
            )}

            <form onSubmit={handleVerifyRemoteConnect} className="space-y-3 pt-2 border-t border-slate-800/80">
              <label htmlFor="remote-token-input" className="text-xs font-medium text-slate-300 block">
                Verify Remote Handshake Token
              </label>
              <div className="flex gap-2">
                <input
                  id="remote-token-input"
                  type="text"
                  value={connectToken}
                  onChange={(e) => setConnectToken(e.target.value)}
                  placeholder="Paste QR pairing token"
                  className="flex-1 rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  disabled={connectingRemote}
                  className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-45 text-emerald-200 border border-emerald-400/40 text-xs font-semibold shrink-0"
                >
                  {connectingRemote ? '...' : 'Verify'}
                </button>
              </div>
              {connectResult && (
                <div
                  className={`rounded-xl p-3 text-xs flex items-center gap-2 border ${
                    connectResult.success
                      ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                      : 'bg-rose-950/30 border-rose-500/35 text-rose-200'
                  }`}
                >
                  {connectResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Wifi className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {connectResult.message || connectResult.error}{' '}
                    {connectResult.ipc_host ? `(${connectResult.ipc_host}:${connectResult.ipc_port})` : ''}
                  </span>
                </div>
              )}
            </form>
          </div>

          {/* Installed Skills & Registered MCP Tools */}
          <div className="lg:col-span-7 aether-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-100">Skills &amp; MCP Tool Registry</h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex p-1 rounded-xl bg-[#050a14] border border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setSkillsMode('skills')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      skillsMode === 'skills'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Skills ({skills.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkillsMode('tools')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      skillsMode === 'tools'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    MCP Tools ({tools.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void loadSkills()}
                  disabled={skillsLoading}
                  aria-label="Refresh skills"
                  className="p-2 rounded-lg bg-[#050a14] hover:bg-cyan-500/15 text-slate-300 border border-slate-800"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${skillsLoading ? 'animate-spin text-cyan-400' : ''}`} />
                </button>
              </div>
            </div>

            <input
              type="text"
              value={skillsSearch}
              onChange={(e) => setSkillsSearch(e.target.value)}
              placeholder={`Search ${skillsMode === 'skills' ? 'installed skills' : 'registered MCP tools'}...`}
              className="w-full rounded-xl bg-[#050a14]/90 border border-cyan-500/25 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />

            <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
              {skillsMode === 'skills' ? (
                filteredSkills.length > 0 ? (
                  filteredSkills.map((sk) => (
                    <div key={sk.slug} className="aether-panel rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">
                          {sk.name || sk.slug}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          {sk.orbiter_group && (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                              {sk.orbiter_group}
                            </span>
                          )}
                          {sk.version && <span className="text-slate-400">v{sk.version}</span>}
                        </div>
                      </div>
                      {sk.description && <p className="text-xs text-slate-400">{sk.description}</p>}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">
                    No installed `.nxskill` bundles found matching filter.
                  </div>
                )
              ) : filteredTools.length > 0 ? (
                filteredTools.map((tool) => (
                  <div key={tool.name} className="aether-panel rounded-xl p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-semibold text-emerald-300">{tool.name}</span>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        {tool.agent && (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                            {tool.agent}
                          </span>
                        )}
                        {tool.requires_approval && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30">
                            APPROVAL
                          </span>
                        )}
                      </div>
                    </div>
                    {tool.description && <p className="text-xs text-slate-400">{tool.description}</p>}
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 text-center py-8">
                  No registered MCP tools found matching filter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
