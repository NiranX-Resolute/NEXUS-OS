import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  Image,
  KeyRound,
  Loader2,
  Palette,
  QrCode,
  RefreshCw,
  Save,
  Sliders,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { ProviderItem } from '../types';

type SettingsTab = 'providers' | 'compute' | 'appearance' | 'remote';
type ProviderFilterMode = 'all' | 'configured' | 'unconfigured';
type SkillsSubMode = 'skills' | 'tools';

interface ProvidersResponse {
  success?: boolean;
  providers?: ProviderItem[];
  count?: number;
  error?: string;
}

interface ProviderTestResponse {
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

interface ReleaseGpuResponse {
  success?: boolean;
  released_nodes?: string[];
  failed_nodes?: string[];
  count?: number;
  reason?: string;
  timestamp?: number;
  error?: string;
}

interface WalCheckpointResponse {
  success?: boolean;
  checkpoint?: number[];
  db_path?: string;
  error?: string;
}

interface ThemeItem {
  id: string;
  name: string;
  is_builtin?: boolean;
  tokens?: Record<string, string>;
  is_active?: boolean;
  updated_at?: string;
}

interface ThemesListResponse {
  success?: boolean;
  themes?: ThemeItem[];
  active_theme?: ThemeItem | null;
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

interface WallpapersListResponse {
  success?: boolean;
  wallpapers?: WallpaperItem[];
  active_wallpaper?: WallpaperItem | null;
  error?: string;
}

interface RemoteQrResponse {
  success?: boolean;
  pairing_url?: string;
  qr_payload?: string;
  token?: string;
  host?: string;
  port?: number;
  pin?: string;
  tunnel_url?: string;
  tunnel_type?: string;
  bound_to?: string;
  expires_in_seconds?: number;
  expires_at?: string | number;
  qr_base64?: string;
  error?: string;
}

interface RemoteConnectResponse {
  success?: boolean;
  message?: string;
  ipc_host?: string;
  ipc_port?: number;
  bound_to?: string;
  timestamp?: number;
  error?: string;
}

interface InstalledSkillItem {
  slug: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
  orbiter_group?: string;
  path?: string;
  permission_scope?: string[];
  installed_at?: string;
}

interface McpToolItem {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
  plugin_file?: string;
  func_name?: string;
}

interface SkillsListResponse {
  success?: boolean;
  skills?: InstalledSkillItem[];
  tools?: McpToolItem[];
  error?: string;
}

function extractSwatches(tokens?: Record<string, string>): string[] {
  if (!tokens || typeof tokens !== 'object') return [];
  const hexes: string[] = [];
  for (const val of Object.values(tokens)) {
    if (typeof val === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(val.trim())) {
      hexes.push(val.trim());
    }
    if (hexes.length >= 4) break;
  }
  return hexes;
}

function formatMemoryGb(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '—';
  const normalizedBytes = bytes > 1024 * 1024 ? bytes : bytes * 1024 * 1024;
  return `${(normalizedBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function SettingsView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');
  const [refreshing, setRefreshing] = useState(false);

  // Providers & Keys
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilterMode>('all');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [draftModel, setDraftModel] = useState('');
  const [draftBaseUrl, setDraftBaseUrl] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [draftApiKey, setDraftApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [deletingProviderKey, setDeletingProviderKey] = useState(false);
  const [probeResult, setProbeResult] = useState<ProviderTestResponse | null>(null);

  // Compute & Hardware
  const [hfStatus, setHfStatus] = useState<HfStatusResponse | null>(null);
  const [hfTokenTestInput, setHfTokenTestInput] = useState('');
  const [hfBusy, setHfBusy] = useState(false);
  const [gpuBusy, setGpuBusy] = useState(false);
  const [gpuResult, setGpuResult] = useState<ReleaseGpuResponse | null>(null);
  const [walBusy, setWalBusy] = useState(false);
  const [walResult, setWalResult] = useState<WalCheckpointResponse | null>(null);

  // Themes & Wallpapers
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [activeTheme, setActiveTheme] = useState<ThemeItem | null>(null);
  const [activatingThemeId, setActivatingThemeId] = useState<string | null>(null);
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [activeWallpaper, setActiveWallpaper] = useState<WallpaperItem | null>(null);
  const [activatingWallpaperId, setActivatingWallpaperId] = useState<string | null>(null);

  // Remote & Skills
  const [qrInfo, setQrInfo] = useState<RemoteQrResponse | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [connectTokenInput, setConnectTokenInput] = useState('');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectResult, setConnectResult] = useState<RemoteConnectResponse | null>(null);
  const [skills, setSkills] = useState<InstalledSkillItem[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolItem[]>([]);
  const [skillsMode, setSkillsMode] = useState<SkillsSubMode>('skills');
  const [skillsSearch, setSkillsSearch] = useState('');

  const loadProviders = useCallback(async () => {
    const res = await ipcJson<ProvidersResponse>('/api/providers');
    if (Array.isArray(res.providers)) {
      setProviders(res.providers);
      setSelectedProviderId((prev) => {
        if (prev && res.providers!.some((p) => p.provider_id === prev)) return prev;
        return res.providers![0]?.provider_id ?? '';
      });
    }
  }, []);

  const loadComputeStatus = useCallback(async () => {
    const res = await ipcJson<HfStatusResponse>('/api/hf/status');
    setHfStatus(res);
  }, []);

  const loadAppearance = useCallback(async () => {
    const [themesRes, wallpapersRes] = await Promise.allSettled([
      ipcJson<ThemesListResponse>('/api/themes'),
      ipcJson<WallpapersListResponse>('/api/wallpapers'),
    ]);
    if (themesRes.status === 'fulfilled') {
      if (Array.isArray(themesRes.value.themes)) setThemes(themesRes.value.themes);
      if (themesRes.value.active_theme) setActiveTheme(themesRes.value.active_theme);
    }
    if (wallpapersRes.status === 'fulfilled') {
      if (Array.isArray(wallpapersRes.value.wallpapers)) setWallpapers(wallpapersRes.value.wallpapers);
      if (wallpapersRes.value.active_wallpaper !== undefined) {
        setActiveWallpaper(wallpapersRes.value.active_wallpaper);
      }
    }
  }, []);

  const regenerateQrPairing = useCallback(async () => {
    setQrBusy(true);
    try {
      const res = await ipcJson<RemoteQrResponse>('/api/remote/qr-regenerate', {
        method: 'POST',
      });
      setQrInfo(res);
      if (res.token) {
        setConnectTokenInput(res.token);
      }
      if (!res.success && res.error) {
        pushToast(res.error, 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'QR pairing generation failed', 'error');
    } finally {
      setQrBusy(false);
    }
  }, [pushToast]);

  const loadSkills = useCallback(async () => {
    const res = await ipcJson<SkillsListResponse>('/api/skills');
    if (Array.isArray(res.skills)) setSkills(res.skills);
    if (Array.isArray(res.tools)) setMcpTools(res.tools);
  }, []);

  const refreshAllSettings = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        loadProviders(),
        loadComputeStatus(),
        loadAppearance(),
        loadSkills(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadAppearance, loadComputeStatus, loadProviders, loadSkills]);

  useEffect(() => {
    void refreshAllSettings();
  }, [refreshAllSettings]);

  // Generate QR pairing automatically the first time Remote & Skills is opened
  useEffect(() => {
    if (activeTab === 'remote' && !qrInfo && !qrBusy) {
      void regenerateQrPairing();
    }
  }, [activeTab, qrBusy, qrInfo, regenerateQrPairing]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.provider_id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  // Sync draft editor whenever selected provider changes
  useEffect(() => {
    if (!selectedProvider) return;
    setDraftModel(selectedProvider.selected_model || '');
    setDraftBaseUrl(selectedProvider.base_url || '');
    setDraftEnabled(Boolean(selectedProvider.enabled));
    setDraftApiKey('');
    setShowApiKey(false);
    setProbeResult(null);
  }, [selectedProvider]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return providers.filter((p) => {
      const hasKey = Boolean(p.has_key);
      if (providerFilter === 'configured' && !hasKey) return false;
      if (providerFilter === 'unconfigured' && hasKey) return false;
      if (!q) return true;
      return [p.display_name, p.provider_id, p.category, p.selected_model, p.free_tier_badge]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(q));
    });
  }, [providerFilter, providerSearch, providers]);

  const handleSaveProvider = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    const pid = selectedProvider.provider_id;
    setSavingProvider(true);
    try {
      const payload: Record<string, unknown> = {
        selected_model: draftModel.trim() || selectedProvider.selected_model,
        base_url: draftBaseUrl.trim() || selectedProvider.base_url,
        enabled: draftEnabled,
      };
      if (draftApiKey.trim()) {
        payload.api_key = draftApiKey.trim();
      }
      const res = await ipcJson<{ success?: boolean; has_key?: number | boolean; error?: string }>(
        `/api/providers/${encodeURIComponent(pid)}/save`,
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
        pushToast(res.error || 'Failed to save provider', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Save provider failed', 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async () => {
    if (!selectedProvider) return;
    const pid = selectedProvider.provider_id;
    setTestingProvider(true);
    try {
      const bodyPayload: Record<string, string> = {};
      if (draftApiKey.trim()) {
        bodyPayload.api_key = draftApiKey.trim();
      }
      const res = await ipcJson<ProviderTestResponse>(
        `/api/providers/${encodeURIComponent(pid)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(bodyPayload),
        }
      );
      setProbeResult(res);
      if (res.success) {
        pushToast(`${selectedProvider.display_name} operational (${res.latency_ms ?? 0} ms)`, 'success');
      } else {
        pushToast(res.error || `${selectedProvider.display_name} probe failed`, 'warn');
      }
      await loadProviders();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Provider probe failed', 'error');
    } finally {
      setTestingProvider(false);
    }
  };

  const handleDeleteProviderKey = async () => {
    if (!selectedProvider) return;
    const pid = selectedProvider.provider_id;
    setDeletingProviderKey(true);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/providers/${encodeURIComponent(pid)}/key`,
        { method: 'DELETE' }
      );
      if (res.success) {
        setDraftApiKey('');
        setProbeResult(null);
        pushToast(`Removed key for ${selectedProvider.display_name} from DPAPI Vault`, 'info');
        await loadProviders();
      } else {
        pushToast(res.error || 'Failed to delete provider key', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete key request failed', 'error');
    } finally {
      setDeletingProviderKey(false);
    }
  };

  const handleCheckHfStatus = async (e: FormEvent) => {
    e.preventDefault();
    setHfBusy(true);
    try {
      const cleanToken = hfTokenTestInput.trim();
      const url = cleanToken
        ? `/api/hf/status?token=${encodeURIComponent(cleanToken)}`
        : '/api/hf/status';
      const res = await ipcJson<HfStatusResponse>(url);
      setHfStatus(res);
      if (res.authenticated) {
        pushToast(`Hugging Face authenticated as ${res.username || 'user'}`, 'success');
      } else {
        pushToast(res.error || res.message || 'Hugging Face token not authenticated', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'HF status check failed', 'error');
    } finally {
      setHfBusy(false);
    }
  };

  const handleReleaseGpu = async () => {
    setGpuBusy(true);
    try {
      const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
        method: 'POST',
      });
      setGpuResult(res);
      if (res.success) {
        pushToast(`Released ${res.count ?? 0} idle cloud GPU node(s)`, 'success');
      } else {
        pushToast(res.error || 'GPU release returned an error', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Release GPU request failed', 'error');
    } finally {
      setGpuBusy(false);
    }
  };

  const handleWalCheckpoint = async () => {
    setWalBusy(true);
    try {
      const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
        method: 'POST',
      });
      setWalResult(res);
      if (res.success) {
        pushToast('SQLite WAL checkpoint truncated cleanly', 'success');
      } else {
        pushToast(res.error || 'WAL checkpoint failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WAL checkpoint request failed', 'error');
    } finally {
      setWalBusy(false);
    }
  };

  const handleActivateTheme = async (themeId: string) => {
    setActivatingThemeId(themeId);
    try {
      const res = await ipcJson<{ success?: boolean; active_theme?: ThemeItem; error?: string }>(
        `/api/themes/activate/${encodeURIComponent(themeId)}`,
        { method: 'POST' }
      );
      if (res.success) {
        if (res.active_theme) setActiveTheme(res.active_theme);
        pushToast(`Activated theme ${res.active_theme?.name || themeId}`, 'success');
        await loadAppearance();
      } else {
        pushToast(res.error || 'Theme activation failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Theme activation failed', 'error');
    } finally {
      setActivatingThemeId(null);
    }
  };

  const handleActivateWallpaper = async (wallpaperId: string) => {
    setActivatingWallpaperId(wallpaperId);
    try {
      const res = await ipcJson<{
        success?: boolean;
        active_wallpaper?: WallpaperItem;
        error?: string;
      }>(`/api/wallpapers/activate/${encodeURIComponent(wallpaperId)}`, {
        method: 'POST',
      });
      if (res.success) {
        if (res.active_wallpaper) setActiveWallpaper(res.active_wallpaper);
        pushToast(`Activated wallpaper ${res.active_wallpaper?.name || wallpaperId}`, 'success');
        await loadAppearance();
      } else {
        pushToast(res.error || 'Wallpaper activation failed', 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Wallpaper activation failed', 'error');
    } finally {
      setActivatingWallpaperId(null);
    }
  };

  const handleVerifyRemoteConnect = async (e: FormEvent) => {
    e.preventDefault();
    const tok = connectTokenInput.trim();
    if (!tok) {
      pushToast('Enter or generate a pairing token first', 'warn');
      return;
    }
    setConnectBusy(true);
    try {
      const res = await ipcJson<RemoteConnectResponse>(
        `/api/remote/connect?token=${encodeURIComponent(tok)}`
      );
      setConnectResult(res);
      if (res.success) {
        pushToast(res.message || 'Remote handshake verified', 'success');
      } else {
        pushToast(res.error || 'Handshake token invalid or expired', 'warn');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Handshake check failed', 'error');
    } finally {
      setConnectBusy(false);
    }
  };

  const handleCopyText = (text: string, label: string) => {
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      pushToast(`Copied ${label} to clipboard`, 'info');
    });
  };

  const configuredCount = useMemo(
    () => providers.filter((p) => Boolean(p.has_key)).length,
    [providers]
  );

  const filteredSkills = useMemo(() => {
    const q = skillsSearch.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.slug, s.category, s.description, s.orbiter_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [skills, skillsSearch]);

  const filteredTools = useMemo(() => {
    const q = skillsSearch.trim().toLowerCase();
    if (!q) return mcpTools;
    return mcpTools.filter((t) =>
      [t.name, t.agent, t.description, t.func_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [mcpTools, skillsSearch]);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto bg-[#090a0c] p-6 text-zinc-100">
      {/* Header + 4 Clean Monograph Sub-Tabs */}
      <header className="monograph-surface rounded-lg p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Sliders className="h-4 w-4 text-emerald-400" />
              <h1 className="text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                System Settings &amp; Control Plane
              </h1>
              <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-300 tabular-nums">
                KEYS {configuredCount}/{providers.length}
              </span>
              <span className="inline-flex items-center rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-zinc-400 tabular-nums">
                SKILLS {skills.length}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              BYOK provider mesh, compute maintenance, theme &amp; wallpaper tokens, mobile QR handshake, and installed capabilities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav
              aria-label="Settings sub-tabs"
              className="inline-flex flex-wrap items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5"
            >
              {(
                [
                  { id: 'providers', label: 'Providers & Keys' },
                  { id: 'compute', label: 'Compute & Hardware' },
                  { id: 'appearance', label: 'Themes & Wallpapers' },
                  { id: 'remote', label: 'Remote & Skills' },
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
              onClick={() => void refreshAllSettings()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-zinc-400 ${refreshing ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>
      </header>

      {/* Tab 1: Providers & Keys */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[13px] font-medium text-zinc-100">BYOK Provider Catalog</h2>
              <div className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5">
                {(['all', 'configured', 'unconfigured'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProviderFilter(mode)}
                    className={`rounded px-2 py-1 font-mono text-[10px] uppercase transition ${
                      providerFilter === mode
                        ? 'bg-white/[0.08] text-zinc-100'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              value={providerSearch}
              onChange={(e) => setProviderSearch(e.target.value)}
              placeholder="Search providers, protocols, or models..."
              className="rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            />

            <div className="max-h-[540px] divide-y divide-white/[0.06] overflow-y-auto rounded-md border border-white/[0.08] bg-[#090a0c]">
              {filteredProviders.map((p) => {
                const hasKey = Boolean(p.has_key);
                const selected = p.provider_id === selectedProvider?.provider_id;
                const dotColor = !hasKey
                  ? 'bg-zinc-600'
                  : p.last_status === 'OPERATIONAL'
                  ? 'bg-emerald-400'
                  : 'bg-amber-400';

                return (
                  <button
                    key={p.provider_id}
                    type="button"
                    onClick={() => setSelectedProviderId(p.provider_id)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.025]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                        <span className="truncate text-xs font-medium text-zinc-100">
                          {p.display_name}
                        </span>
                        {p.free_tier_badge && (
                          <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                            {p.free_tier_badge}
                          </span>
                        )}
                      </div>
                      <p className="truncate font-mono text-[11px] text-zinc-500">
                        {p.selected_model || p.protocol}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
                      <span className={hasKey ? 'text-emerald-300' : 'text-zinc-500'}>
                        {p.last_status || (hasKey ? 'CONFIGURED' : 'UNCONFIGURED')}
                      </span>
                      {typeof p.last_latency_ms === 'number' && p.last_latency_ms > 0 && (
                        <span className="block text-[10px] text-zinc-500">
                          {p.last_latency_ms.toFixed(0)} ms
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredProviders.length === 0 && (
                <div className="px-4 py-10 text-center text-xs text-zinc-500">
                  No providers match the active filter.
                </div>
              )}
            </div>
          </section>

          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-7">
            {selectedProvider ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-medium text-zinc-100">
                        {selectedProvider.display_name}
                      </h3>
                      <span className="rounded border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                        {selectedProvider.protocol}
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-[10px] ${
                          selectedProvider.has_key
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : 'border-white/[0.08] text-zinc-400'
                        }`}
                      >
                        {selectedProvider.has_key ? 'KEY STORED' : 'NO KEY'}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-zinc-500">
                      {selectedProvider.provider_id} · {selectedProvider.category}
                    </p>
                  </div>

                  {selectedProvider.key_console_url && (
                    <a
                      href={selectedProvider.key_console_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-zinc-100"
                    >
                      Key Console
                      <ExternalLink className="h-3 w-3 text-zinc-500" />
                    </a>
                  )}
                </div>

                <form onSubmit={handleSaveProvider} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="provider-model-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                        Selected Model
                      </label>
                      <input
                        id="provider-model-input"
                        type="text"
                        value={draftModel}
                        onChange={(e) => setDraftModel(e.target.value)}
                        className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="provider-url-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                        Base Endpoint URL
                      </label>
                      <input
                        id="provider-url-input"
                        type="text"
                        value={draftBaseUrl}
                        onChange={(e) => setDraftBaseUrl(e.target.value)}
                        className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500/50 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="provider-key-input" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                      API Key (Windows DPAPI Encrypted)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="provider-key-input"
                        type={showApiKey ? 'text' : 'password'}
                        value={draftApiKey}
                        onChange={(e) => setDraftApiKey(e.target.value)}
                        placeholder={
                          selectedProvider.has_key
                            ? 'Stored in DPAPI Vault — enter new key only to replace...'
                            : 'Enter API key...'
                        }
                        className="w-full rounded-md border border-white/[0.08] bg-[#090a0c] py-2 pl-3 pr-10 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((s) => !s)}
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                        className="absolute right-2.5 text-zinc-500 transition hover:text-zinc-300"
                      >
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2.5 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={draftEnabled}
                      onChange={(e) => setDraftEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-emerald-500"
                    />
                    Enable provider in LLM failover cascade
                  </label>

                  <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
                    <button
                      type="submit"
                      disabled={savingProvider}
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {savingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save Configuration
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleTestProvider()}
                      disabled={testingProvider}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
                    >
                      {testingProvider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-400" />}
                      Test Probe
                    </button>

                    {Boolean(selectedProvider.has_key) && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteProviderKey()}
                        disabled={deletingProviderKey}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                      >
                        {deletingProviderKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete Key
                      </button>
                    )}
                  </div>
                </form>

                {probeResult && (
                  <div
                    className={`rounded-md border p-4 font-mono text-xs tabular-nums ${
                      probeResult.success
                        ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200'
                        : 'border-amber-500/30 bg-amber-500/[0.07] text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>PROBE STATUS · {probeResult.status || (probeResult.success ? 'OK' : 'FAILED')}</span>
                      {typeof probeResult.latency_ms === 'number' && (
                        <span>{probeResult.latency_ms.toFixed(1)} ms</span>
                      )}
                    </div>
                    {probeResult.error && (
                      <p className="mt-1.5 text-[11px] opacity-90">{probeResult.error}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[280px] items-center justify-center text-xs text-zinc-500">
                Select a provider from the catalog to inspect or configure its DPAPI credentials.
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: Compute & Hardware */}
      {activeTab === 'compute' && (
        <div className="flex flex-col gap-6">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="monograph-surface rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono uppercase tracking-wider">CPU Load</span>
                <Cpu className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="mt-2 font-mono text-2xl font-medium text-zinc-100 tabular-nums">
                {telemetry.cpuUsage.toFixed(1)}%
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 tabular-nums">
                {telemetry.cpuCoresPhysical ?? '—'}P / {telemetry.cpuCoresLogical ?? '—'}L cores
                {typeof telemetry.cpuTempC === 'number' ? ` · ${telemetry.cpuTempC.toFixed(0)}°C` : ''}
              </p>
            </div>

            <div className="monograph-surface rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono uppercase tracking-wider">Memory</span>
                <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="mt-2 font-mono text-2xl font-medium text-zinc-100 tabular-nums">
                {formatMemoryGb(telemetry.memoryUsage)}
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 tabular-nums">
                of {formatMemoryGb(telemetry.memoryTotal)} ({(telemetry.ramPercent ?? 0).toFixed(0)}%)
              </p>
            </div>

            <div className="monograph-surface rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono uppercase tracking-wider">GPU Nodes</span>
                <Zap className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="mt-2 font-mono text-2xl font-medium text-zinc-100 tabular-nums">
                {telemetry.gpus?.length ?? 0}
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 tabular-nums">
                {typeof telemetry.gpuTempC === 'number' ? `Temp ${telemetry.gpuTempC.toFixed(0)}°C` : 'Idle / Serverless'}
              </p>
            </div>

            <div className="monograph-surface rounded-lg p-5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-mono uppercase tracking-wider">Workspace</span>
                <Database className="h-3.5 w-3.5 text-zinc-500" />
              </div>
              <div className="mt-2 font-mono text-2xl font-medium text-emerald-300">
                {telemetry.workspaceMode}
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500 tabular-nums">
                Security: {telemetry.securityState}
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Hugging Face Hub Auth */}
            <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-[13px] font-medium text-zinc-100">Hugging Face Hub Status</h2>
                  <p className="font-mono text-[11px] text-zinc-500">GET /api/hf/status</p>
                </div>
                <span
                  className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
                    hfStatus?.authenticated
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {hfStatus?.status || 'UNKNOWN'}
                </span>
              </div>

              <form onSubmit={handleCheckHfStatus} className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  value={hfTokenTestInput}
                  onChange={(e) => setHfTokenTestInput(e.target.value)}
                  placeholder="Optional HF token override to verify (uses DPAPI vault by default)..."
                  className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={hfBusy}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
                >
                  {hfBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Verify HF Auth
                </button>
              </form>

              <div className="space-y-2 rounded-md border border-white/[0.06] bg-[#090a0c] p-4 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span className="text-zinc-400">Account</span>
                  <span className="text-zinc-200">{hfStatus?.username || '—'}</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <span className="text-zinc-400">Organizations</span>
                  <span className="text-zinc-300">
                    {hfStatus?.organizations?.length ? hfStatus.organizations.join(', ') : '—'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  {hfStatus?.error || hfStatus?.message || (hfStatus?.authenticated ? 'Token verified via whoami-v2.' : 'No HF token stored.')}
                </div>
              </div>
            </section>

            {/* GPU Release + SQLite WAL Checkpoint */}
            <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-6">
              <div className="space-y-0.5">
                <h2 className="text-[13px] font-medium text-zinc-100">System Maintenance Operations</h2>
                <p className="text-xs text-zinc-400">
                  Release idle cloud GPU workers to protect free-tier quota and checkpoint SQLite WAL frames cleanly.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col justify-between gap-3 rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-medium text-zinc-100">Release Cloud GPUs</span>
                    <p className="text-[11px] text-zinc-400">
                      Sends shutdown signal to idle GPU nodes and deregisters them from KV edge.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReleaseGpu()}
                    disabled={gpuBusy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {gpuBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Release Idle GPUs
                  </button>
                  {gpuResult && (
                    <p className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      Released {gpuResult.count ?? 0} node(s)
                    </p>
                  )}
                </div>

                <div className="flex flex-col justify-between gap-3 rounded-md border border-white/[0.06] bg-[#090a0c] p-4">
                  <div className="space-y-1">
                    <span className="font-mono text-xs font-medium text-zinc-100">WAL Checkpoint</span>
                    <p className="text-[11px] text-zinc-400">
                      Executes <code className="text-zinc-300">PRAGMA wal_checkpoint(TRUNCATE)</code> on local SQLite DB.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleWalCheckpoint()}
                    disabled={walBusy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    {walBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Run Checkpoint
                  </button>
                  {walResult && (
                    <p className="truncate font-mono text-[11px] text-emerald-300 tabular-nums" title={walResult.db_path}>
                      Frames: [{walResult.checkpoint?.join(', ') || '0, 0, 0'}]
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Tab 3: Themes & Wallpapers */}
      {activeTab === 'appearance' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Themes */}
          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-emerald-400" />
                <h2 className="text-[13px] font-medium text-zinc-100">Sovereign Themes</h2>
              </div>
              <span className="font-mono text-[11px] text-zinc-400">
                Active: {activeTheme?.name || '—'}
              </span>
            </div>

            {themes.length > 0 ? (
              <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08] bg-[#090a0c]">
                {themes.map((theme) => {
                  const isActive = theme.id === activeTheme?.id || Boolean(theme.is_active);
                  const swatches = extractSwatches(theme.tokens);
                  return (
                    <div
                      key={theme.id}
                      className="flex items-center justify-between gap-4 px-4 py-3.5"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-zinc-100">
                            {theme.name}
                          </span>
                          {theme.is_builtin && (
                            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
                              builtin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {swatches.map((hex, idx) => (
                            <span
                              key={`${theme.id}-sw-${idx}`}
                              className="h-3 w-3 rounded-full border border-white/15"
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                          <span className="font-mono text-[11px] text-zinc-500">{theme.id}</span>
                        </div>
                      </div>

                      {isActive ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleActivateTheme(theme.id)}
                          disabled={activatingThemeId === theme.id}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
                        >
                          {activatingThemeId === theme.id && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Activate
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                No themes returned from /api/themes.
              </div>
            )}
          </section>

          {/* Wallpapers */}
          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="h-4 w-4 text-amber-400" />
                <h2 className="text-[13px] font-medium text-zinc-100">Dynamic Wallpapers</h2>
              </div>
              <span className="font-mono text-[11px] text-zinc-400">
                Active: {activeWallpaper?.name || 'None'}
              </span>
            </div>

            {wallpapers.length > 0 ? (
              <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.08] bg-[#090a0c]">
                {wallpapers.map((wp) => {
                  const isActive = wp.id === activeWallpaper?.id || Boolean(wp.is_active);
                  return (
                    <div
                      key={wp.id}
                      className="flex items-center justify-between gap-4 px-4 py-3.5"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-xs font-medium text-zinc-100">
                            {wp.name}
                          </span>
                          {wp.kind && (
                            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                              {wp.kind}
                            </span>
                          )}
                          {wp.mode_binding && (
                            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                              {wp.mode_binding}
                            </span>
                          )}
                        </div>
                        <p className="truncate font-mono text-[11px] text-zinc-500">
                          {wp.source_path || wp.id}
                        </p>
                      </div>

                      {isActive ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleActivateWallpaper(wp.id)}
                          disabled={activatingWallpaperId === wp.id}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
                        >
                          {activatingWallpaperId === wp.id && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          Activate
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                No custom wallpapers registered in SQLite WAL.
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 4: Remote & Skills */}
      {activeTab === 'remote' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Remote QR Pairing & Connect Handshake */}
          <section className="monograph-surface flex flex-col gap-5 rounded-lg p-6 xl:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-emerald-400" />
                <h2 className="text-[13px] font-medium text-zinc-100">Mobile &amp; Edge QR Pairing</h2>
              </div>
              <button
                type="button"
                onClick={() => void regenerateQrPairing()}
                disabled={qrBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {qrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Regenerate QR
              </button>
            </div>

            {qrInfo?.qr_base64 ? (
              <div className="flex flex-col items-center gap-4 rounded-md border border-white/[0.08] bg-[#090a0c] p-5 sm:flex-row sm:items-start">
                <img
                  src={qrInfo.qr_base64}
                  alt="Nexus Remote Pairing QR Code"
                  className="h-36 w-36 shrink-0 rounded border border-white/15 bg-white p-1.5"
                />
                <div className="min-w-0 flex-1 space-y-2.5 font-mono text-xs">
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Pairing PIN</span>
                    <span className="text-lg font-medium tracking-widest text-emerald-300 tabular-nums">
                      {qrInfo.pin || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-zinc-500">Tunnel Endpoint</span>
                    <span className="block truncate text-zinc-200" title={qrInfo.tunnel_url}>
                      {qrInfo.tunnel_url || '—'}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {qrInfo.tunnel_type || 'edge'} · bound {qrInfo.bound_to || '127.0.0.1:47630'}
                    </span>
                  </div>
                  {qrInfo.pairing_url && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(qrInfo.pairing_url!, 'pairing URL')}
                      className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:bg-white/[0.07]"
                    >
                      <Copy className="h-3 w-3" />
                      Copy Pairing URL
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                {qrBusy ? 'Generating scoped pairing token & QR...' : 'Click Regenerate QR to mint a scoped 15-minute mobile handshake.'}
              </div>
            )}

            <form onSubmit={handleVerifyRemoteConnect} className="space-y-2.5 border-t border-white/[0.08] pt-4">
              <label htmlFor="remote-connect-token" className="block font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                Handshake Verification (GET /api/remote/connect)
              </label>
              <div className="flex gap-2">
                <input
                  id="remote-connect-token"
                  type="text"
                  value={connectTokenInput}
                  onChange={(e) => setConnectTokenInput(e.target.value)}
                  placeholder="Scoped pairing token..."
                  className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={connectBusy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.07] disabled:opacity-50"
                >
                  {connectBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  Verify
                </button>
              </div>
              {connectResult && (
                <div
                  className={`rounded-md border px-3 py-2 font-mono text-[11px] ${
                    connectResult.success
                      ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-300'
                      : 'border-amber-500/30 bg-amber-500/[0.07] text-amber-300'
                  }`}
                >
                  {connectResult.success
                    ? `${connectResult.message || 'Verified'} (${connectResult.ipc_host || '127.0.0.1'}:${connectResult.ipc_port || 47630})`
                    : connectResult.error || 'Token verification failed'}
                </div>
              )}
            </form>
          </section>

          {/* Installed Skills & Registered MCP Tools */}
          <section className="monograph-surface flex flex-col gap-4 rounded-lg p-6 xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-emerald-400" />
                <h2 className="text-[13px] font-medium text-zinc-100">Skills &amp; MCP Capabilities</h2>
              </div>

              <div className="inline-flex items-center rounded-md border border-white/[0.08] bg-[#090a0c] p-0.5">
                <button
                  type="button"
                  onClick={() => setSkillsMode('skills')}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] transition tabular-nums ${
                    skillsMode === 'skills'
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Skills ({skills.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSkillsMode('tools')}
                  className={`rounded px-2.5 py-1 font-mono text-[11px] transition tabular-nums ${
                    skillsMode === 'tools'
                      ? 'bg-white/[0.08] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  MCP Tools ({mcpTools.length})
                </button>
              </div>
            </div>

            <input
              type="text"
              value={skillsSearch}
              onChange={(e) => setSkillsSearch(e.target.value)}
              placeholder={`Filter ${skillsMode === 'skills' ? 'installed skills' : 'registered @nexus_tool plugins'}...`}
              className="rounded-md border border-white/[0.08] bg-[#090a0c] px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            />

            {skillsMode === 'skills' ? (
              filteredSkills.length > 0 ? (
                <div className="max-h-[460px] divide-y divide-white/[0.06] overflow-y-auto rounded-md border border-white/[0.08] bg-[#090a0c]">
                  {filteredSkills.map((sk) => (
                    <div key={sk.slug} className="space-y-1.5 px-4 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-zinc-100">{sk.name}</span>
                          <span className="font-mono text-[10px] text-zinc-500">{sk.slug}</span>
                          {sk.version && (
                            <span className="rounded border border-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                              v{sk.version}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] uppercase text-emerald-400">
                          {sk.orbiter_group || sk.category || 'skill'}
                        </span>
                      </div>
                      {sk.description && (
                        <p className="text-xs leading-relaxed text-zinc-400">{sk.description}</p>
                      )}
                      {Array.isArray(sk.permission_scope) && sk.permission_scope.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {sk.permission_scope.map((perm) => (
                            <span
                              key={perm}
                              className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                  No installed marketplace skills found matching the filter.
                </div>
              )
            ) : filteredTools.length > 0 ? (
              <div className="max-h-[460px] divide-y divide-white/[0.06] overflow-y-auto rounded-md border border-white/[0.08] bg-[#090a0c]">
                {filteredTools.map((tool) => (
                  <div key={tool.name} className="space-y-1 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-zinc-100">
                        {tool.name}
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[10px]">
                        {tool.agent && (
                          <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-emerald-300">
                            {tool.agent}
                          </span>
                        )}
                        {tool.requires_approval && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                            APPROVAL
                          </span>
                        )}
                      </div>
                    </div>
                    {tool.description && (
                      <p className="text-xs leading-relaxed text-zinc-400">{tool.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-white/[0.08] px-4 py-10 text-center text-xs text-zinc-500">
                No registered @nexus_tool plugins match the filter.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
