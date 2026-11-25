import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Image,
  KeyRound,
  Palette,
  Power,
  QrCode,
  RefreshCw,
  Save,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { ProviderItem } from '@/types';

type SettingsSubTab = 'providers' | 'compute' | 'themes' | 'remote';
type RemoteSubList = 'skills' | 'tools';

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

interface QrPairingInfo {
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
  expires_at?: number;
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
  path?: string;
  permission_scope?: string[];
  installed_at?: string;
}

interface McpToolItem {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
}

interface SkillsResponse {
  success?: boolean;
  skills?: InstalledSkillItem[];
  tools?: McpToolItem[];
  error?: string;
}

function isSafeHttpsUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  return raw.startsWith('https://') || raw.startsWith('http://');
}

function providerStatusBadgeClass(status: string | undefined, hasKey: boolean): string {
  const s = (status || '').toUpperCase();
  if (s === 'OPERATIONAL') {
    return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300';
  }
  if (s === 'AUTH_ERROR' || s === 'OFFLINE') {
    return 'border-red-500/35 bg-red-500/10 text-red-300';
  }
  if (hasKey) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }
  return 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-muted)]';
}

export function SettingsView() {
  const { telemetry, pushToast } = useNexusStore();

  const [subTab, setSubTab] = useState<SettingsSubTab>('providers');

  // 1. Providers & Keys state
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providerFilter, setProviderFilter] = useState('');
  const [providerCategory, setProviderCategory] = useState<string>('all');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [editModel, setEditModel] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [editApiKey, setEditApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerBusy, setProviderBusy] = useState<'save' | 'test' | 'delete' | null>(null);
  const [lastProbeResult, setLastProbeResult] = useState<ProviderTestResponse | null>(null);

  // 2. Compute & Hardware state
  const [hfStatus, setHfStatus] = useState<HfStatusResponse | null>(null);
  const [hfLoading, setHfLoading] = useState(false);
  const [hfProbeToken, setHfProbeToken] = useState('');
  const [gpuReleaseResult, setGpuReleaseResult] = useState<ReleaseGpuResponse | null>(null);
  const [gpuReleasing, setGpuReleasing] = useState(false);
  const [walResult, setWalResult] = useState<WalCheckpointResponse | null>(null);
  const [walRunning, setWalRunning] = useState(false);

  // 3. Themes & Wallpapers state
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [activeTheme, setActiveTheme] = useState<ThemeItem | null>(null);
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [activeWallpaper, setActiveWallpaper] = useState<WallpaperItem | null>(null);
  const [wallpaperModeBinding, setWallpaperModeBinding] = useState<string>('GLOBAL');
  const [appearanceLoading, setAppearanceLoading] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  // 4. Remote & Skills state
  const [qrInfo, setQrInfo] = useState<QrPairingInfo | null>(null);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [verifyingRemote, setVerifyingRemote] = useState(false);
  const [remoteConnectResult, setRemoteConnectResult] = useState<RemoteConnectResponse | null>(null);
  const [copiedQrToken, setCopiedQrToken] = useState(false);
  const [skillsList, setSkillsList] = useState<InstalledSkillItem[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolItem[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState('');
  const [remoteListMode, setRemoteListMode] = useState<RemoteSubList>('skills');

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const res = await ipcJson<ProvidersResponse>('/api/providers');
      if (Array.isArray(res.providers)) {
        setProviders(res.providers);
        setSelectedProviderId((prev) =>
          prev && res.providers?.some((p) => p.provider_id === prev)
            ? prev
            : res.providers?.[0]?.provider_id ?? ''
        );
      }
    } catch (err) {
      pushToast({
        title: 'Providers Load Failed',
        message: err instanceof Error ? err.message : 'Unable to query /api/providers',
        tone: 'error',
      });
    } finally {
      setProvidersLoading(false);
    }
  }, [pushToast]);

  const loadHfStatus = useCallback(
    async (explicitToken?: string) => {
      setHfLoading(true);
      try {
        const cleanTok = (explicitToken ?? '').trim();
        const url = cleanTok
          ? `/api/hf/status?token=${encodeURIComponent(cleanTok)}`
          : '/api/hf/status';
        const res = await ipcJson<HfStatusResponse>(url);
        setHfStatus(res);
      } catch (err) {
        pushToast({
          title: 'Hugging Face Status Error',
          message: err instanceof Error ? err.message : 'Unable to reach /api/hf/status',
          tone: 'error',
        });
      } finally {
        setHfLoading(false);
      }
    },
    [pushToast]
  );

  const loadAppearance = useCallback(async () => {
    setAppearanceLoading(true);
    try {
      const [themeRes, wpRes] = await Promise.allSettled([
        ipcJson<ThemesResponse>('/api/themes'),
        ipcJson<WallpapersResponse>('/api/wallpapers'),
      ]);
      if (themeRes.status === 'fulfilled') {
        if (Array.isArray(themeRes.value.themes)) {
          setThemes(themeRes.value.themes);
        }
        if (themeRes.value.active_theme) {
          setActiveTheme(themeRes.value.active_theme);
        }
      }
      if (wpRes.status === 'fulfilled') {
        if (Array.isArray(wpRes.value.wallpapers)) {
          setWallpapers(wpRes.value.wallpapers);
        }
        if (wpRes.value.active_wallpaper !== undefined) {
          setActiveWallpaper(wpRes.value.active_wallpaper);
        }
      }
    } finally {
      setAppearanceLoading(false);
    }
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    try {
      const res = await ipcJson<SkillsResponse>('/api/skills');
      if (Array.isArray(res.skills)) {
        setSkillsList(res.skills);
      }
      if (Array.isArray(res.tools)) {
        setMcpTools(res.tools);
      }
    } catch (err) {
      pushToast({
        title: 'Skills Load Error',
        message: err instanceof Error ? err.message : 'Unable to query /api/skills',
        tone: 'error',
      });
    } finally {
      setSkillsLoading(false);
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

  // Synchronize editor fields when provider selection changes
  useEffect(() => {
    if (!selectedProvider) return;
    setEditModel(selectedProvider.selected_model || '');
    setEditBaseUrl(selectedProvider.base_url || '');
    setEditEnabled(Boolean(selectedProvider.enabled));
    setEditApiKey('');
    setLastProbeResult(null);
  }, [selectedProvider]);

  const providerCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of providers) {
      if (p.category) cats.add(p.category);
    }
    return ['all', 'configured', ...Array.from(cats)];
  }, [providers]);

  const filteredProviders = useMemo(() => {
    const q = providerFilter.trim().toLowerCase();
    return providers.filter((p) => {
      if (providerCategory === 'configured' && !p.has_key) return false;
      if (
        providerCategory !== 'all' &&
        providerCategory !== 'configured' &&
        p.category !== providerCategory
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.provider_id.toLowerCase().includes(q) ||
        (p.selected_model || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [providers, providerFilter, providerCategory]);

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider || providerBusy) return;

    setProviderBusy('save');
    try {
      const payload: Record<string, unknown> = {
        selected_model: editModel.trim() || selectedProvider.selected_model || 'default',
        base_url: editBaseUrl.trim() || selectedProvider.base_url,
        enabled: editEnabled,
      };
      if (editApiKey.trim()) {
        payload.api_key = editApiKey.trim();
      }
      const res = await ipcJson<{ success?: boolean; has_key?: number; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/save`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.success === false) {
        pushToast({
          title: 'Provider Save Failed',
          message: res.error ?? 'Unable to save provider configuration.',
          tone: 'error',
        });
        return;
      }
      setEditApiKey('');
      await loadProviders();
      pushToast({
        title: `${selectedProvider.display_name} Saved`,
        message: res.has_key ? 'Configuration & DPAPI key stored.' : 'Configuration updated.',
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Provider Save Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/providers/{id}/save',
        tone: 'error',
      });
    } finally {
      setProviderBusy(null);
    }
  };

  const handleTestProvider = async () => {
    if (!selectedProvider || providerBusy) return;
    setProviderBusy('test');
    try {
      const body: Record<string, unknown> = {};
      if (editApiKey.trim()) {
        body.api_key = editApiKey.trim();
      }
      const res = await ipcJson<ProviderTestResponse>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      setLastProbeResult(res);
      await loadProviders();
      pushToast({
        title: res.success
          ? `${selectedProvider.display_name} Operational`
          : `${selectedProvider.display_name} Probe: ${res.status ?? 'FAILED'}`,
        message: res.success
          ? `Latency ${Math.round(res.latency_ms ?? 0)} ms`
          : res.error ?? 'Connectivity check failed.',
        tone: res.success ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'Provider Probe Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/providers/{id}/test',
        tone: 'error',
      });
    } finally {
      setProviderBusy(null);
    }
  };

  const handleDeleteProviderKey = async () => {
    if (!selectedProvider || providerBusy) return;
    setProviderBusy('delete');
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/key`,
        { method: 'DELETE' }
      );
      if (res.success === false) {
        pushToast({
          title: 'Key Revoke Failed',
          message: res.error ?? 'Unable to delete DPAPI key.',
          tone: 'error',
        });
        return;
      }
      setEditApiKey('');
      setLastProbeResult(null);
      await loadProviders();
      pushToast({
        title: `${selectedProvider.display_name} Key Deleted`,
        message: 'Removed credential from Windows DPAPI vault.',
        tone: 'info',
      });
    } catch (err) {
      pushToast({
        title: 'Delete Key Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/providers/{id}/key',
        tone: 'error',
      });
    } finally {
      setProviderBusy(null);
    }
  };

  const handleReleaseGpu = async () => {
    if (gpuReleasing) return;
    setGpuReleasing(true);
    try {
      const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setGpuReleaseResult(res);
      pushToast({
        title: res.success === false ? 'GPU Release Error' : 'Cloud GPU Nodes Released',
        message:
          res.error ?? `Released ${res.count ?? res.released_nodes?.length ?? 0} idle cloud nodes.`,
        tone: res.success === false ? 'error' : 'success',
      });
    } catch (err) {
      pushToast({
        title: 'GPU Release Failed',
        message: err instanceof Error ? err.message : 'Unable to reach /api/system/release-gpu',
        tone: 'error',
      });
    } finally {
      setGpuReleasing(false);
    }
  };

  const handleWalCheckpoint = async () => {
    if (walRunning) return;
    setWalRunning(true);
    try {
      const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setWalResult(res);
      pushToast({
        title: res.success === false ? 'WAL Checkpoint Failed' : 'SQLite WAL Checkpointed',
        message: res.error ?? 'PRAGMA wal_checkpoint(TRUNCATE) completed.',
        tone: res.success === false ? 'error' : 'success',
      });
    } catch (err) {
      pushToast({
        title: 'WAL Checkpoint Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/system/wal-checkpoint',
        tone: 'error',
      });
    } finally {
      setWalRunning(false);
    }
  };

  const handleActivateTheme = async (themeId: string) => {
    if (activatingId) return;
    setActivatingId(themeId);
    try {
      const res = await ipcJson<{
        success?: boolean;
        active_theme?: ThemeItem;
        error?: string;
      }>(`/api/themes/activate/${encodeURIComponent(themeId)}`, {
        method: 'POST',
        body: JSON.stringify({ theme_id: themeId }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Theme Activation Failed',
          message: res.error ?? 'Could not activate theme.',
          tone: 'error',
        });
        return;
      }
      await loadAppearance();
      pushToast({
        title: 'Theme Activated',
        message: res.active_theme?.name ?? themeId,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Theme Activation Error',
        message: err instanceof Error ? err.message : 'Unable to activate theme.',
        tone: 'error',
      });
    } finally {
      setActivatingId(null);
    }
  };

  const handleActivateWallpaper = async (wallpaperId: string) => {
    if (activatingId) return;
    setActivatingId(wallpaperId);
    try {
      const res = await ipcJson<{
        success?: boolean;
        active_wallpaper?: WallpaperItem;
        error?: string;
      }>(`/api/wallpapers/activate/${encodeURIComponent(wallpaperId)}`, {
        method: 'POST',
        body: JSON.stringify({
          wallpaper_id: wallpaperId,
          mode_binding: wallpaperModeBinding,
        }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Wallpaper Activation Failed',
          message: res.error ?? 'Could not activate wallpaper.',
          tone: 'error',
        });
        return;
      }
      await loadAppearance();
      pushToast({
        title: 'Wallpaper Activated',
        message: `${res.active_wallpaper?.name ?? wallpaperId} (${wallpaperModeBinding})`,
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Wallpaper Error',
        message: err instanceof Error ? err.message : 'Unable to activate wallpaper.',
        tone: 'error',
      });
    } finally {
      setActivatingId(null);
    }
  };

  const handleGenerateQr = async () => {
    if (qrGenerating) return;
    setQrGenerating(true);
    setCopiedQrToken(false);
    setRemoteConnectResult(null);
    try {
      const res = await ipcJson<QrPairingInfo>('/api/remote/qr-regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setQrInfo(res);
      if (res.token) {
        setVerifyTokenInput(res.token);
      }
      if (res.success === false) {
        pushToast({
          title: 'QR Generation Failed',
          message: res.error ?? 'Unable to generate pairing QR.',
          tone: 'error',
        });
      } else {
        pushToast({
          title: 'QR Pairing Regenerated',
          message: `PIN ${res.pin ?? 'READY'} · TTL ${Math.round((res.expires_in_seconds ?? 900) / 60)}m`,
          tone: 'success',
        });
      }
    } catch (err) {
      pushToast({
        title: 'QR Bridge Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/remote/qr-regenerate',
        tone: 'error',
      });
    } finally {
      setQrGenerating(false);
    }
  };

  const handleVerifyRemoteConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const tok = verifyTokenInput.trim();
    if (!tok || verifyingRemote) return;
    setVerifyingRemote(true);
    try {
      const res = await ipcJson<RemoteConnectResponse>(
        `/api/remote/connect?token=${encodeURIComponent(tok)}`
      );
      setRemoteConnectResult(res);
      pushToast({
        title: res.success ? 'Mobile Handshake Verified' : 'Handshake Rejected',
        message: res.message ?? res.error ?? 'Remote verification completed.',
        tone: res.success ? 'success' : 'warning',
      });
    } catch (err) {
      pushToast({
        title: 'Remote Verify Error',
        message: err instanceof Error ? err.message : 'Unable to reach /api/remote/connect',
        tone: 'error',
      });
    } finally {
      setVerifyingRemote(false);
    }
  };

  const handleCopyQrToken = async () => {
    if (!qrInfo?.token) return;
    try {
      await navigator.clipboard.writeText(qrInfo.token);
      setCopiedQrToken(true);
      pushToast({ title: 'Pairing Token Copied', tone: 'success' });
    } catch {
      pushToast({ title: 'Clipboard Unavailable', tone: 'warning' });
    }
  };

  const filteredSkills = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return skillsList;
    return skillsList.filter((s) =>
      [s.name, s.slug, s.category, s.description, s.orbiter_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [skillsList, skillsFilter]);

  const filteredTools = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return mcpTools;
    return mcpTools.filter((t) =>
      [t.name, t.agent, t.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [mcpTools, skillsFilter]);

  const configuredProvidersCount = useMemo(
    () => providers.filter((p) => Boolean(p.has_key)).length,
    [providers]
  );

  return (
    <div className="h-full flex flex-col p-6 gap-6 overflow-y-auto animate-obsidian-fade">
      {/* Header & Categorized Sub-Tabs */}
      <header className="obsidian-panel rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide text-[var(--text)]">
              Sovereign Settings & Mesh Control
            </h1>
            <p className="text-xs text-[var(--text-secondary)] truncate">
              BYOK provider vault, compute pool governance, Theme Forge & mobile QR pairing
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1.5 bg-[var(--panel-muted)] p-1 rounded-lg border border-[var(--border-subtle)]">
          {(
            [
              { id: 'providers', label: 'Providers & Keys', icon: KeyRound },
              { id: 'compute', label: 'Compute & Hardware', icon: Cpu },
              { id: 'themes', label: 'Themes & Wallpapers', icon: Palette },
              { id: 'remote', label: 'Remote & Skills', icon: Smartphone },
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

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="px-2.5 py-1 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-emerald-300">
            {configuredProvidersCount}/{providers.length} KEYS
          </span>
        </div>
      </header>

      {/* SUB-TAB 1: PROVIDERS & KEYS */}
      {subTab === 'providers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
          {/* Left Provider Directory */}
          <section className="lg:col-span-5 obsidian-panel rounded-xl p-5 flex flex-col gap-4 min-h-[440px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Provider Mesh ({filteredProviders.length})
              </span>
              <button
                type="button"
                disabled={providersLoading}
                onClick={() => void loadProviders()}
                className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                title="Refresh Providers"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${providersLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                placeholder="Search providers or models..."
                className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs text-[var(--text)] outline-none"
              />
              <select
                value={providerCategory}
                onChange={(e) => setProviderCategory(e.target.value)}
                aria-label="Filter provider category"
                className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
              >
                {providerCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/_/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1 max-h-[520px]">
              {filteredProviders.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                  {providersLoading ? 'Loading providers...' : 'No providers match filter.'}
                </div>
              ) : (
                filteredProviders.map((prov) => {
                  const active = prov.provider_id === selectedProviderId;
                  const hasKey = Boolean(prov.has_key);
                  return (
                    <button
                      key={prov.provider_id}
                      type="button"
                      onClick={() => setSelectedProviderId(prov.provider_id)}
                      className={`text-left rounded-lg border px-3.5 py-3 transition-colors ${
                        active
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-[var(--border)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              hasKey ? 'bg-emerald-400' : 'bg-[var(--text-muted)]'
                            }`}
                          />
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {prov.display_name}
                          </span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${providerStatusBadgeClass(
                            prov.last_status,
                            hasKey
                          )}`}
                        >
                          {prov.last_status || (hasKey ? 'CONFIGURED' : 'UNCONFIGURED')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px] font-mono text-[var(--text-muted)]">
                        <span className="truncate">{prov.selected_model || 'default'}</span>
                        {typeof prov.last_latency_ms === 'number' && (
                          <span className="shrink-0 text-[var(--text-secondary)]">
                            {Math.round(prov.last_latency_ms)}ms
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* Right Selected Provider Config Editor */}
          <section className="lg:col-span-7 obsidian-panel rounded-xl p-5 flex flex-col gap-5 min-h-[440px]">
            {!selectedProvider ? (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-secondary)]">
                Select a provider from the mesh directory to manage keys and model routing.
              </div>
            ) : (
              <form onSubmit={handleSaveProvider} className="flex flex-col gap-5 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-[var(--text)]">
                        {selectedProvider.display_name}
                      </h2>
                      {selectedProvider.free_tier_badge && (
                        <span className="px-2 py-0.5 rounded border border-emerald-500/35 bg-emerald-500/10 text-[10px] font-mono text-emerald-300">
                          {selectedProvider.free_tier_badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                      ID: {selectedProvider.provider_id} · Protocol: {selectedProvider.protocol} ·
                      Priority #{selectedProvider.priority_order}
                    </div>
                  </div>
                  {isSafeHttpsUrl(selectedProvider.key_console_url) && (
                    <a
                      href={selectedProvider.key_console_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[11px] font-mono text-emerald-300 flex items-center gap-1.5"
                    >
                      <span>Key Console</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Selected Model ID
                    </label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="Model identifier"
                      className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      Endpoint Base URL
                    </label>
                    <input
                      type="text"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      API Key (Windows DPAPI Enclave)
                    </label>
                    <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                      {selectedProvider.has_key ? 'Key Stored in DPAPI' : 'No Key Stored'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      placeholder={
                        selectedProvider.has_key
                          ? 'Enter new key to rotate existing DPAPI secret...'
                          : 'Paste API key to encrypt in DPAPI...'
                      }
                      className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      className="p-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={editEnabled}
                    onChange={(e) => setEditEnabled(e.target.checked)}
                    className="accent-emerald-500 w-4 h-4 rounded"
                  />
                  <span>Enable provider in autonomous routing cascade</span>
                </label>

                {lastProbeResult && (
                  <div
                    className={`rounded-lg border p-3.5 text-xs font-mono ${
                      lastProbeResult.success
                        ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-500/35 bg-amber-500/10 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>Probe Status: {lastProbeResult.status ?? 'DONE'}</span>
                      {typeof lastProbeResult.latency_ms === 'number' && (
                        <span>{Math.round(lastProbeResult.latency_ms)} ms</span>
                      )}
                    </div>
                    {lastProbeResult.error && (
                      <p className="mt-1 text-[11px] opacity-90">{lastProbeResult.error}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-auto border-t border-[var(--border-subtle)]">
                  <button
                    type="button"
                    disabled={Boolean(providerBusy) || !selectedProvider.has_key}
                    onClick={() => void handleDeleteProviderKey()}
                    className="px-3.5 py-2 rounded-lg border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{providerBusy === 'delete' ? 'Revoking...' : 'Revoke Key'}</span>
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={Boolean(providerBusy)}
                      onClick={() => void handleTestProvider()}
                      className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-medium text-[var(--text)] flex items-center gap-1.5 transition-colors disabled:opacity-45"
                    >
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{providerBusy === 'test' ? 'Probing...' : 'Test Probe'}</span>
                    </button>
                    <button
                      type="submit"
                      disabled={Boolean(providerBusy)}
                      className="px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{providerBusy === 'save' ? 'Saving...' : 'Save Provider'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: COMPUTE & HARDWARE */}
      {subTab === 'compute' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hugging Face Hub Auth */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hugging Face Hub Identity</span>
              </div>
              <button
                type="button"
                disabled={hfLoading}
                onClick={() => void loadHfStatus(hfProbeToken)}
                className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[11px] font-mono text-[var(--text-secondary)] flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3 h-3 ${hfLoading ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Verify Auth</span>
              </button>
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-secondary)]">Hub Status</span>
                <span
                  className={`px-2 py-0.5 rounded border text-[11px] font-mono ${
                    hfStatus?.authenticated
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                  }`}
                >
                  {hfStatus?.status ?? (hfLoading ? 'CHECKING...' : 'UNKNOWN')}
                </span>
              </div>

              {hfStatus?.authenticated ? (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)] text-xs font-mono">
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)]">USERNAME</span>
                    <span className="text-[var(--text)]">{hfStatus.username ?? '—'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-[var(--text-muted)]">ACCOUNT TYPE</span>
                    <span className="text-[var(--text-secondary)]">{hfStatus.type ?? 'user'}</span>
                  </div>
                  {hfStatus.email && (
                    <div className="col-span-2">
                      <span className="block text-[10px] text-[var(--text-muted)]">EMAIL</span>
                      <span className="text-[var(--text-secondary)]">{hfStatus.email}</span>
                    </div>
                  )}
                  {Array.isArray(hfStatus.organizations) && hfStatus.organizations.length > 0 && (
                    <div className="col-span-2">
                      <span className="block text-[10px] text-[var(--text-muted)]">ORGS</span>
                      <span className="text-emerald-300">{hfStatus.organizations.join(', ')}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  {hfStatus?.message ||
                    hfStatus?.error ||
                    'Store HF_TOKEN in Vault or test an access token below.'}
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void loadHfStatus(hfProbeToken);
              }}
              className="flex items-center gap-2.5"
            >
              <input
                type="password"
                value={hfProbeToken}
                onChange={(e) => setHfProbeToken(e.target.value)}
                placeholder="Optional hf_... token to validate via whoami-v2"
                className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
              />
              <button
                type="submit"
                disabled={hfLoading}
                className="px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium"
              >
                Check Token
              </button>
            </form>
          </section>

          {/* Hardware Telemetry & Maintenance Actions */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>Compute Pool & SQLite Maintenance</span>
              </div>
              <span className="text-[11px] font-mono text-emerald-300">
                {telemetry.recommendedProfile}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">PRIMARY GPU</div>
                <div className="text-xs font-mono text-[var(--text)] mt-1 truncate">
                  {telemetry.primaryGpuName}
                </div>
                <div className="text-[11px] font-mono text-emerald-300 mt-1 tabular-nums">
                  {telemetry.vramUsedMb} / {telemetry.vramTotalMb} MB VRAM
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5">
                <div className="text-[10px] font-mono text-[var(--text-muted)]">CPU & MEMORY</div>
                <div className="text-xs font-mono text-[var(--text)] mt-1 tabular-nums">
                  {telemetry.cpuPercent.toFixed(1)}% CPU ({telemetry.cpuCoresLogical}T)
                </div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-1 tabular-nums">
                  {telemetry.ramUsedMb} / {telemetry.ramTotalMb} MB RAM
                </div>
              </div>
            </div>

            {/* Maintenance Action Cards */}
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[var(--text)]">
                    Release Idle Cloud GPU Nodes
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Sends QuotaGuard shutdown to Kaggle/Colab workers (`POST /api/system/release-gpu`)
                  </div>
                </div>
                <button
                  type="button"
                  disabled={gpuReleasing}
                  onClick={() => void handleReleaseGpu()}
                  className="px-3.5 py-2 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{gpuReleasing ? 'Releasing...' : 'Release GPU'}</span>
                </button>
              </div>

              {gpuReleaseResult && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] px-3.5 py-2.5 text-[11px] font-mono text-[var(--text-secondary)]">
                  Released {gpuReleaseResult.count ?? 0} nodes (reason:{' '}
                  {gpuReleaseResult.reason ?? 'ui_release_gpu'})
                </div>
              )}

              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[var(--text)]">
                    SQLite WAL Checkpoint (TRUNCATE)
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Flushes WAL frames into `agent_local.db` (`POST /api/system/wal-checkpoint`)
                  </div>
                </div>
                <button
                  type="button"
                  disabled={walRunning}
                  onClick={() => void handleWalCheckpoint()}
                  className="px-3.5 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{walRunning ? 'Flushing...' : 'Run Checkpoint'}</span>
                </button>
              </div>

              {walResult && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[#07090d] px-3.5 py-2.5 text-[11px] font-mono text-emerald-300">
                  WAL Checkpoint: [{(walResult.checkpoint ?? []).join(', ')}] ·{' '}
                  {walResult.db_path ?? 'agent_local.db'}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 3: THEMES & WALLPAPERS */}
      {subTab === 'themes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Themes List */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Palette className="w-3.5 h-3.5 text-emerald-400" />
                <span>Theme Forge ({themes.length})</span>
              </div>
              <button
                type="button"
                disabled={appearanceLoading}
                onClick={() => void loadAppearance()}
                className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                title="Refresh Themes & Wallpapers"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${appearanceLoading ? 'animate-spin text-emerald-400' : ''}`}
                />
              </button>
            </div>

            {activeTheme && (
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-emerald-200 font-medium">
                  Active Theme: {activeTheme.name}
                </span>
                <span className="font-mono text-[11px] text-emerald-300">{activeTheme.id}</span>
              </div>
            )}

            <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {themes.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                  {appearanceLoading ? 'Loading themes...' : 'No themes stored in SQLite WAL.'}
                </div>
              ) : (
                themes.map((theme) => {
                  const isActive = Boolean(theme.is_active || activeTheme?.id === theme.id);
                  const swatches = Object.values(theme.tokens ?? {})
                    .filter((v) => typeof v === 'string' && v.startsWith('#'))
                    .slice(0, 4);
                  return (
                    <div
                      key={theme.id}
                      className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 ${
                        isActive
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {theme.name}
                          </span>
                          {theme.is_builtin && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#07090d] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                              BUILT-IN
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {swatches.map((hex, idx) => (
                            <span
                              key={`${theme.id}-swatch-${idx}`}
                              className="w-3.5 h-3.5 rounded-full border border-white/20"
                              style={{ backgroundColor: hex }}
                              title={hex}
                            />
                          ))}
                          <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                            {theme.id}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isActive || Boolean(activatingId)}
                        onClick={() => void handleActivateTheme(theme.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium shrink-0 transition-colors ${
                          isActive
                            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                            : 'border-[var(--border)] bg-[#07090d] hover:border-emerald-500/45 text-[var(--text)]'
                        }`}
                      >
                        {activatingId === theme.id
                          ? 'Activating...'
                          : isActive
                            ? 'Active'
                            : 'Activate'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Wallpapers List */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Image className="w-3.5 h-3.5 text-emerald-400" />
                <span>Wallpaper Studio ({wallpapers.length})</span>
              </div>
              <select
                value={wallpaperModeBinding}
                onChange={(e) => setWallpaperModeBinding(e.target.value)}
                aria-label="Wallpaper Mode Binding"
                className="bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-2.5 py-1 text-[11px] font-mono text-[var(--text)] outline-none"
              >
                {['GLOBAL', 'DEV', 'STUDY', 'STUDIO', 'SILENT'].map((mode) => (
                  <option key={mode} value={mode}>
                    Bind: {mode}
                  </option>
                ))}
              </select>
            </div>

            {activeWallpaper && (
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="text-emerald-200 font-medium">
                  Active Wallpaper: {activeWallpaper.name}
                </span>
                <span className="font-mono text-[11px] text-emerald-300">
                  {activeWallpaper.mode_binding ?? 'GLOBAL'}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {wallpapers.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                  {appearanceLoading
                    ? 'Loading wallpapers...'
                    : 'No wallpapers registered in SQLite WAL.'}
                </div>
              ) : (
                wallpapers.map((wp) => {
                  const isActive = Boolean(wp.is_active || activeWallpaper?.id === wp.id);
                  return (
                    <div
                      key={wp.id}
                      className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 ${
                        isActive
                          ? 'border-emerald-500/45 bg-emerald-500/10'
                          : 'border-[var(--border-subtle)] bg-[var(--panel-muted)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {wp.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#07090d] border border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase">
                            {wp.kind || 'shader'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-1">
                          {wp.id} · Mode: {wp.mode_binding || 'GLOBAL'}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(activatingId)}
                        onClick={() => void handleActivateWallpaper(wp.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium shrink-0 transition-colors ${
                          isActive
                            ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                            : 'border-[var(--border)] bg-[#07090d] hover:border-emerald-500/45 text-[var(--text)]'
                        }`}
                      >
                        {activatingId === wp.id
                          ? 'Applying...'
                          : isActive
                            ? 'Active'
                            : 'Activate'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 4: REMOTE & SKILLS */}
      {subTab === 'remote' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mobile QR Pairing & Connect Verification */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mobile QR Remote Pairing</span>
              </div>
              <button
                type="button"
                disabled={qrGenerating}
                onClick={() => void handleGenerateQr()}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-45"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{qrGenerating ? 'Generating...' : 'Regenerate QR'}</span>
              </button>
            </div>

            {qrInfo && qrInfo.success !== false ? (
              <div className="rounded-xl border border-[var(--border)] bg-[#07090d] p-4 flex flex-col sm:flex-row items-center gap-5">
                {qrInfo.qr_base64 && (
                  <img
                    src={qrInfo.qr_base64}
                    alt="Nexus Remote Pairing QR"
                    className="w-36 h-36 rounded-lg border border-emerald-500/35 bg-white p-1.5 shrink-0"
                  />
                )}
                <div className="flex flex-col gap-2 min-w-0 flex-1 text-xs font-mono">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">PAIRING PIN</span>
                    <span className="text-sm font-semibold text-emerald-300">
                      {qrInfo.pin ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">TUNNEL</span>
                    <span className="text-[var(--text)] uppercase">
                      {qrInfo.tunnel_type ?? 'edge'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">BOUND TO</span>
                    <span className="text-[var(--text-secondary)]">
                      {qrInfo.bound_to ?? '127.0.0.1:47630'}
                    </span>
                  </div>
                  {qrInfo.token && (
                    <button
                      type="button"
                      onClick={() => void handleCopyQrToken()}
                      className="mt-1 px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center gap-1.5"
                    >
                      {copiedQrToken ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedQrToken ? 'Token Copied' : 'Copy Scoped Token'}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 text-xs text-[var(--text-secondary)] leading-relaxed">
                Click <span className="font-mono text-emerald-300">Regenerate QR</span> to mint a
                15-minute scoped Bearer pairing token bound to{' '}
                <span className="font-mono text-[var(--text)]">127.0.0.1:47630</span>.
              </div>
            )}

            {/* Verify Handshake Form */}
            <form onSubmit={handleVerifyRemoteConnect} className="flex flex-col gap-2.5">
              <label className="text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Verify Mobile Handshake (`GET /api/remote/connect`)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={verifyTokenInput}
                  onChange={(e) => setVerifyTokenInput(e.target.value)}
                  placeholder="Paste QR pairing token to verify handshake..."
                  className="flex-1 bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--text)] outline-none"
                />
                <button
                  type="submit"
                  disabled={!verifyTokenInput.trim() || verifyingRemote}
                  className="px-4 py-2 rounded-lg border border-emerald-500/45 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-medium disabled:opacity-45"
                >
                  {verifyingRemote ? 'Verifying...' : 'Verify'}
                </button>
              </div>
              {remoteConnectResult && (
                <div
                  className={`rounded-lg border px-3.5 py-2.5 text-xs font-mono ${
                    remoteConnectResult.success
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/35 bg-red-500/10 text-red-300'
                  }`}
                >
                  {remoteConnectResult.success
                    ? `${remoteConnectResult.message ?? 'Verified'} · ${remoteConnectResult.ipc_host ?? '127.0.0.1'}:${remoteConnectResult.ipc_port ?? 47630}`
                    : remoteConnectResult.error ?? 'Handshake invalid or expired.'}
                </div>
              )}
            </form>
          </section>

          {/* Installed Skills & MCP Tools */}
          <section className="obsidian-panel rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <Wrench className="w-3.5 h-3.5 text-emerald-400" />
                <span>Skills & MCP Registry</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[var(--panel-muted)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setRemoteListMode('skills')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                      remoteListMode === 'skills'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    Skills ({skillsList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoteListMode('tools')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                      remoteListMode === 'tools'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    MCP Tools ({mcpTools.length})
                  </button>
                </div>
                <button
                  type="button"
                  disabled={skillsLoading}
                  onClick={() => void loadSkills()}
                  className="p-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-[var(--text-secondary)]"
                  title="Refresh Skills & Tools"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${skillsLoading ? 'animate-spin text-emerald-400' : ''}`}
                  />
                </button>
              </div>
            </div>

            <input
              type="text"
              value={skillsFilter}
              onChange={(e) => setSkillsFilter(e.target.value)}
              placeholder={`Search ${remoteListMode === 'skills' ? 'installed skills' : 'MCP tools'}...`}
              className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3.5 py-2 text-xs text-[var(--text)] outline-none"
            />

            <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
              {remoteListMode === 'skills' ? (
                filteredSkills.length === 0 ? (
                  <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                    {skillsLoading
                      ? 'Querying installed skills...'
                      : 'No installed .nxskill packages found.'}
                  </div>
                ) : (
                  filteredSkills.map((skill) => (
                    <div
                      key={skill.slug}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text)]">
                          {skill.name || skill.slug}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-300">
                          {skill.orbiter_group || skill.category || 'skill'}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {skill.description}
                        </p>
                      )}
                      <div className="text-[10px] font-mono text-[var(--text-muted)]">
                        /skill:{skill.slug} · v{skill.version ?? '1.0.0'}
                      </div>
                    </div>
                  ))
                )
              ) : filteredTools.length === 0 ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4 text-xs text-[var(--text-secondary)]">
                  {skillsLoading ? 'Discovering MCP tools...' : 'No MCP tools matched filter.'}
                </div>
              ) : (
                filteredTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-3.5 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-medium text-emerald-300">
                        {tool.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#07090d] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                        {tool.agent ?? 'CORE'}
                      </span>
                    </div>
                    {tool.description && (
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                        {tool.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
