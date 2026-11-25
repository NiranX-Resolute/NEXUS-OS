import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Loader2,
  Palette,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { ProviderItem } from '@/types';

type SettingsSubTab = 'providers' | 'compute' | 'themes' | 'remote';

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
  error?: string;
}

interface WalCheckpointResponse {
  success?: boolean;
  checkpoint?: number[];
  db_path?: string;
  error?: string;
}

interface ThemeRecord {
  id: string;
  name: string;
  is_builtin?: boolean;
  tokens?: Record<string, string | number>;
  is_active?: boolean;
  updated_at?: string;
}

interface ThemesResponse {
  success?: boolean;
  themes?: ThemeRecord[];
  active_theme?: ThemeRecord;
  error?: string;
}

interface WallpaperRecord {
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
  wallpapers?: WallpaperRecord[];
  active_wallpaper?: WallpaperRecord | null;
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

interface SkillRecord {
  slug: string;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  type?: string;
  orbiter_group?: string;
  permission_scope?: string[];
  sha256?: string;
}

interface McpToolRecord {
  name: string;
  description?: string;
  agent?: string;
  requires_approval?: boolean;
  plugin_file?: string;
}

interface SkillsResponse {
  success?: boolean;
  skills?: SkillRecord[];
  tools?: McpToolRecord[];
  error?: string;
}

function formatMb(mb: number): string {
  if (!Number.isFinite(mb) || mb <= 0) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export function SettingsView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [subTab, setSubTab] = useState<SettingsSubTab>('providers');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Providers & Keys state
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [providerCategory, setProviderCategory] = useState('all');
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [editModel, setEditModel] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editEnabled, setEditEnabled] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);
  const [probeResult, setProbeResult] = useState<ProviderTestResponse | null>(null);

  // Compute & Hardware state
  const [hfStatus, setHfStatus] = useState<HfStatusResponse | null>(null);
  const [hfTokenProbe, setHfTokenProbe] = useState('');
  const [loadingHf, setLoadingHf] = useState(false);
  const [releasingGpu, setReleasingGpu] = useState(false);
  const [gpuResult, setGpuResult] = useState<ReleaseGpuResponse | null>(null);
  const [checkpointingWal, setCheckpointingWal] = useState(false);
  const [walResult, setWalResult] = useState<WalCheckpointResponse | null>(null);

  // Themes & Wallpapers state
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [wallpapers, setWallpapers] = useState<WallpaperRecord[]>([]);
  const [loadingVisuals, setLoadingVisuals] = useState(false);
  const [activatingThemeId, setActivatingThemeId] = useState<string | null>(null);
  const [activatingWallpaperId, setActivatingWallpaperId] = useState<string | null>(null);

  // Remote & Skills state
  const [qrData, setQrData] = useState<RemoteQrResponse | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [verifyingRemote, setVerifyingRemote] = useState(false);
  const [remoteConnectRes, setRemoteConnectRes] = useState<RemoteConnectResponse | null>(null);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [tools, setTools] = useState<McpToolRecord[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [skillsFilter, setSkillsFilter] = useState('');
  const [skillsTabMode, setSkillsTabMode] = useState<'skills' | 'tools'>('skills');

  const copyText = useCallback(
    async (text: string, id: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedKey(id);
        pushToast('Copied to clipboard', 'success');
      } catch {
        pushToast('Clipboard unavailable', 'warn');
      }
    },
    [pushToast]
  );

  const loadProviders = useCallback(async () => {
    setLoadingProviders(true);
    try {
      const res = await ipcJson<ProvidersResponse>('/api/providers');
      if (res.success && Array.isArray(res.providers)) {
        setProviders(res.providers);
        setSelectedProviderId((prev) => {
          if (prev && res.providers?.some((p) => p.provider_id === prev)) return prev;
          return res.providers?.[0]?.provider_id ?? '';
        });
      }
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const loadHfStatus = useCallback(async (tokenOverride?: string) => {
    setLoadingHf(true);
    try {
      const cleanToken = (tokenOverride ?? '').trim();
      const url = cleanToken
        ? `/api/hf/status?token=${encodeURIComponent(cleanToken)}`
        : '/api/hf/status';
      const res = await ipcJson<HfStatusResponse>(url);
      setHfStatus(res);
    } finally {
      setLoadingHf(false);
    }
  }, []);

  const loadThemesAndWallpapers = useCallback(async () => {
    setLoadingVisuals(true);
    try {
      const [themeRes, wpRes] = await Promise.all([
        ipcJson<ThemesResponse>('/api/themes'),
        ipcJson<WallpapersResponse>('/api/wallpapers'),
      ]);
      if (themeRes.success && Array.isArray(themeRes.themes)) {
        setThemes(themeRes.themes);
      }
      if (wpRes.success && Array.isArray(wpRes.wallpapers)) {
        setWallpapers(wpRes.wallpapers);
      }
    } finally {
      setLoadingVisuals(false);
    }
  }, []);

  const regenerateQr = useCallback(async () => {
    setGeneratingQr(true);
    try {
      const res = await ipcJson<RemoteQrResponse>('/api/remote/qr-regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setQrData(res);
      setRemoteConnectRes(null);
      if (!res.success) {
        pushToast(res.error || 'Failed generating QR pairing token', 'error');
      }
    } finally {
      setGeneratingQr(false);
    }
  }, [pushToast]);

  const loadSkills = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const res = await ipcJson<SkillsResponse>('/api/skills');
      if (res.success) {
        setSkills(Array.isArray(res.skills) ? res.skills : []);
        setTools(Array.isArray(res.tools) ? res.tools : []);
      }
    } finally {
      setLoadingSkills(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
    void loadHfStatus();
    void loadThemesAndWallpapers();
    void loadSkills();
    void regenerateQr();
  }, [loadProviders, loadHfStatus, loadThemesAndWallpapers, loadSkills, regenerateQr]);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.provider_id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  useEffect(() => {
    if (!selectedProvider) return;
    setEditModel(selectedProvider.selected_model || '');
    setEditBaseUrl(selectedProvider.base_url || '');
    setEditEnabled(Boolean(selectedProvider.enabled));
    setApiKeyInput('');
    setProbeResult(null);
  }, [selectedProvider]);

  const categories = useMemo(() => {
    const set = new Set<string>(['all']);
    for (const p of providers) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [providers]);

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase();
    return providers.filter((p) => {
      if (providerCategory !== 'all' && p.category !== providerCategory) return false;
      if (!q) return true;
      return [p.display_name, p.provider_id, p.selected_model, p.free_tier_badge]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [providers, providerSearch, providerCategory]);

  const configuredProvidersCount = useMemo(
    () => providers.filter((p) => Boolean(p.has_key)).length,
    [providers]
  );

  const activeThemeName = useMemo(
    () => themes.find((t) => t.is_active)?.name || 'Obsidian Cyber',
    [themes]
  );

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    setSavingProvider(true);
    try {
      const payload: Record<string, unknown> = {
        selected_model: editModel.trim() || selectedProvider.selected_model,
        base_url: editBaseUrl.trim() || selectedProvider.base_url,
        enabled: editEnabled,
      };
      if (apiKeyInput.trim()) {
        payload.api_key = apiKeyInput.trim();
      }
      const res = await ipcJson<{ success?: boolean; has_key?: number; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/save`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (!res.success) {
        pushToast(res.error || 'Failed saving provider configuration', 'error');
      } else {
        setApiKeyInput('');
        pushToast(`Saved ${selectedProvider.display_name} configuration`, 'success');
        await loadProviders();
      }
    } finally {
      setSavingProvider(false);
    }
  };

  const handleTestProvider = async () => {
    if (!selectedProvider) return;
    setTestingProvider(true);
    try {
      const body: Record<string, string> = {};
      if (apiKeyInput.trim()) {
        body.api_key = apiKeyInput.trim();
      }
      const res = await ipcJson<ProviderTestResponse>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      setProbeResult(res);
      if (res.success) {
        pushToast(
          `${selectedProvider.display_name} probe OK (${res.latency_ms ?? 0}ms)`,
          'success'
        );
      } else {
        pushToast(res.error || `${selectedProvider.display_name} probe failed`, 'warn');
      }
      void loadProviders();
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
      if (!res.success) {
        pushToast(res.error || 'Failed removing DPAPI key', 'error');
      } else {
        setApiKeyInput('');
        setProbeResult(null);
        pushToast(`Revoked DPAPI key for ${selectedProvider.display_name}`, 'info');
        await loadProviders();
      }
    } finally {
      setDeletingKey(false);
    }
  };

  const handleReleaseGpu = async () => {
    setReleasingGpu(true);
    try {
      const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setGpuResult(res);
      if (res.success) {
        pushToast(
          `Released ${res.count ?? 0} idle cloud compute node(s)`,
          'success'
        );
      } else {
        pushToast(res.error || 'GPU release failed', 'error');
      }
    } finally {
      setReleasingGpu(false);
    }
  };

  const handleWalCheckpoint = async () => {
    setCheckpointingWal(true);
    try {
      const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setWalResult(res);
      if (res.success) {
        pushToast('SQLite WAL checkpoint truncated cleanly', 'success');
      } else {
        pushToast(res.error || 'WAL checkpoint failed', 'error');
      }
    } finally {
      setCheckpointingWal(false);
    }
  };

  const handleActivateTheme = async (themeId: string) => {
    setActivatingThemeId(themeId);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/themes/activate/${encodeURIComponent(themeId)}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (res.success) {
        pushToast(`Theme '${themeId}' activated`, 'success');
        await loadThemesAndWallpapers();
      } else {
        pushToast(res.error || 'Theme activation failed', 'error');
      }
    } finally {
      setActivatingThemeId(null);
    }
  };

  const handleActivateWallpaper = async (wallpaperId: string) => {
    setActivatingWallpaperId(wallpaperId);
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/wallpapers/activate/${encodeURIComponent(wallpaperId)}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (res.success) {
        pushToast(`Wallpaper '${wallpaperId}' activated`, 'success');
        await loadThemesAndWallpapers();
      } else {
        pushToast(res.error || 'Wallpaper activation failed', 'error');
      }
    } finally {
      setActivatingWallpaperId(null);
    }
  };

  const handleVerifyRemoteConnect = async () => {
    const token = qrData?.token?.trim();
    if (!token) {
      pushToast('Generate a QR pairing token first', 'warn');
      return;
    }
    setVerifyingRemote(true);
    try {
      const res = await ipcJson<RemoteConnectResponse>(
        `/api/remote/connect?token=${encodeURIComponent(token)}`
      );
      setRemoteConnectRes(res);
      if (res.success) {
        pushToast(res.message || 'Mobile handshake verified', 'success');
      } else {
        pushToast(res.error || 'Handshake verification failed', 'error');
      }
    } finally {
      setVerifyingRemote(false);
    }
  };

  const filteredSkills = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter((s) =>
      [s.name, s.slug, s.category, s.description, s.orbiter_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [skills, skillsFilter]);

  const filteredTools = useMemo(() => {
    const q = skillsFilter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) =>
      [t.name, t.agent, t.description, t.plugin_file]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [tools, skillsFilter]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 animate-matrix-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-500/15 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-emerald-400">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>SYS-01 // CONFIGURATION &amp; ORCHESTRATION</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-50">
            System Control &amp; Provider Mesh
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-200">
            <KeyRound className="w-3 h-3 text-emerald-400" />
            {configuredProvidersCount}/{providers.length} keys sealed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1 text-xs font-mono text-cyan-200">
            <Palette className="w-3 h-3 text-cyan-300" />
            {activeThemeName}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#090e14] px-3 py-1 text-xs font-mono text-slate-300">
            {telemetry.workspaceMode}
          </span>
        </div>
      </div>

      {/* 4 Clean Sub-Tabs */}
      <div className="inline-flex flex-wrap rounded-xl border border-white/10 bg-[#090e14]/90 p-1 gap-1">
        {(
          [
            { id: 'providers', label: 'Providers & Keys', icon: KeyRound },
            { id: 'compute', label: 'Compute & Hardware', icon: Cpu },
            { id: 'themes', label: 'Themes & Wallpapers', icon: Palette },
            { id: 'remote', label: 'Remote & Skills', icon: QrCode },
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

      {/* TAB 1: PROVIDERS & KEYS (Master-Detail Split) */}
      {subTab === 'providers' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Provider List */}
          <div className="xl:col-span-5 matrix-panel rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Filter 45+ providers..."
                  className="w-full rounded-lg border border-white/10 bg-[#05080b] pl-8 pr-3 py-2 text-xs text-emerald-50 placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadProviders()}
                disabled={loadingProviders}
                className="rounded-lg border border-white/10 bg-[#05080b] p-2 text-slate-300 hover:text-emerald-300"
                title="Reload providers"
              >
                {loadingProviders ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setProviderCategory(cat)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase transition ${
                    providerCategory === cat
                      ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/8 bg-[#05080b] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
              {filteredProviders.map((p) => {
                const selected = p.provider_id === selectedProviderId;
                const hasKey = Boolean(p.has_key);
                return (
                  <button
                    key={p.provider_id}
                    type="button"
                    onClick={() => setSelectedProviderId(p.provider_id)}
                    className={`w-full text-left rounded-xl border p-3 transition space-y-1.5 ${
                      selected
                        ? 'border-cyan-400/50 bg-cyan-500/10 matrix-glow-cyan'
                        : 'border-white/8 bg-[#05080b]/85 hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-50 truncate">
                        {p.display_name}
                      </span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                          hasKey
                            ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300'
                            : 'border-white/10 bg-white/5 text-slate-400'
                        }`}
                      >
                        {hasKey ? 'KEY SEALED' : 'NO KEY'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-slate-400 truncate">{p.selected_model}</span>
                      <span
                        className={
                          p.last_status === 'OPERATIONAL'
                            ? 'text-emerald-400'
                            : p.last_status === 'AUTH_ERROR'
                              ? 'text-red-400'
                              : 'text-slate-500'
                        }
                      >
                        {p.last_status}
                        {typeof p.last_latency_ms === 'number' ? ` · ${p.last_latency_ms}ms` : ''}
                      </span>
                    </div>

                    {p.free_tier_badge && (
                      <div className="text-[10px] font-mono text-cyan-300/90 truncate">
                        {p.free_tier_badge}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Provider Inspector */}
          <div className="xl:col-span-7 matrix-panel holo-ring rounded-xl p-6 space-y-5 h-fit">
            {selectedProvider ? (
              <form onSubmit={handleSaveProvider} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-emerald-50">
                        {selectedProvider.display_name}
                      </h2>
                      <span className="rounded border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-200">
                        {selectedProvider.protocol}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 mt-0.5">
                      ID: {selectedProvider.provider_id} · Priority #{selectedProvider.priority_order}
                    </div>
                  </div>

                  {selectedProvider.key_console_url && (
                    <a
                      href={selectedProvider.key_console_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#05080b] px-3 py-1.5 text-xs font-mono text-cyan-300 hover:border-cyan-400/40"
                    >
                      <span>Key Console</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Default Model ID
                    </label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 focus:border-emerald-400/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                      Gateway Base URL
                    </label>
                    <input
                      type="text"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 focus:border-cyan-400/60 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                      DPAPI API Key (Write-Only)
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        selectedProvider.has_key ? 'text-emerald-300' : 'text-slate-500'
                      }`}
                    >
                      {selectedProvider.has_key
                        ? `Encrypted in Vault as PROVIDER_KEY_${selectedProvider.provider_id.toUpperCase()}`
                        : 'No key currently sealed'}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        selectedProvider.has_key
                          ? 'Enter new API key to rotate existing DPAPI secret'
                          : 'Paste provider API key to encrypt in Windows DPAPI'
                      }
                      autoComplete="off"
                      className="w-full rounded-lg border border-white/10 bg-[#05080b] px-3 py-2.5 pr-10 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-emerald-400/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-300"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editEnabled}
                    onChange={(e) => setEditEnabled(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span>Enable provider in autonomous routing cascade</span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleDeleteProviderKey()}
                    disabled={!selectedProvider.has_key || deletingKey}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                  >
                    {deletingKey ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Revoke Key
                  </button>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleTestProvider()}
                      disabled={testingProvider}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
                    >
                      {testingProvider ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5" />
                      )}
                      Test Probe
                    </button>

                    <button
                      type="submit"
                      disabled={savingProvider}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/45 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {savingProvider ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      Save Config
                    </button>
                  </div>
                </div>

                {probeResult && (
                  <div
                    className={`rounded-lg border p-3 text-xs font-mono space-y-1 ${
                      probeResult.success
                        ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
                        : 'border-amber-500/35 bg-amber-950/20 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>PROBE STATUS: {probeResult.status || (probeResult.success ? 'OPERATIONAL' : 'FAILED')}</span>
                      {typeof probeResult.latency_ms === 'number' && (
                        <span>{probeResult.latency_ms}ms</span>
                      )}
                    </div>
                    {probeResult.error && <div className="text-[11px]">{probeResult.error}</div>}
                  </div>
                )}
              </form>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a provider from the catalog to inspect or seal its API credentials.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPUTE & HARDWARE */}
      {subTab === 'compute' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Hugging Face Hub Status */}
          <div className="xl:col-span-6 matrix-panel holo-ring rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Hugging Face Hub Identity
                </h2>
                <p className="text-xs text-slate-400">
                  Zero-card Space &amp; model checkpoint federation (`GET /api/hf/status`).
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadHfStatus(hfTokenProbe)}
                disabled={loadingHf}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {loadingHf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Verify HF
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="password"
                value={hfTokenProbe}
                onChange={(e) => setHfTokenProbe(e.target.value)}
                placeholder="Optional hf_... token to probe before vaulting"
                autoComplete="off"
                className="flex-1 rounded-lg border border-white/10 bg-[#05080b] px-3 py-2 text-xs font-mono text-emerald-50 placeholder-slate-500 focus:border-cyan-400/60 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-white/8 bg-[#05080b] p-4 space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <span
                  className={
                    hfStatus?.authenticated ? 'text-emerald-300' : 'text-amber-300'
                  }
                >
                  {hfStatus?.status || (loadingHf ? 'PROBING...' : 'UNKNOWN')}
                </span>
              </div>
              {hfStatus?.username && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Account</span>
                  <span className="text-cyan-200">{hfStatus.username}</span>
                </div>
              )}
              {hfStatus?.organizations && hfStatus.organizations.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">Organizations</span>
                  <span className="text-slate-200 truncate">
                    {hfStatus.organizations.join(', ')}
                  </span>
                </div>
              )}
              {(hfStatus?.message || hfStatus?.error) && (
                <div className="text-[11px] text-slate-300 pt-1 border-t border-white/8">
                  {hfStatus.message || hfStatus.error}
                </div>
              )}
            </div>

            {/* Maintenance Actions */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Compute &amp; Storage Maintenance
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void handleReleaseGpu()}
                  disabled={releasingGpu}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  {releasingGpu ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  Release Cloud GPUs
                </button>

                <button
                  type="button"
                  onClick={() => void handleWalCheckpoint()}
                  disabled={checkpointingWal}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {checkpointingWal ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  SQLite WAL Checkpoint
                </button>
              </div>

              {gpuResult && (
                <div className="rounded-lg border border-white/8 bg-[#05080b] p-3 text-xs font-mono text-slate-300">
                  GPU Release: {gpuResult.count ?? 0} released ({gpuResult.reason || 'completed'})
                </div>
              )}

              {walResult && (
                <div className="rounded-lg border border-white/8 bg-[#05080b] p-3 text-xs font-mono text-emerald-300 space-y-0.5">
                  <div>
                    WAL Truncate Tuple: [{(walResult.checkpoint ?? []).join(', ')}]
                  </div>
                  {walResult.db_path && (
                    <div className="text-[11px] text-slate-400 truncate">{walResult.db_path}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hardware Telemetry Snapshot */}
          <div className="xl:col-span-6 matrix-panel holo-ring rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Local Hardware &amp; Sovereign Compute Profile
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">CPU UTILIZATION</div>
                <div className="text-lg font-bold font-mono text-emerald-200">
                  {telemetry.cpuUsagePct.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {telemetry.cpuCoresPhysical}P / {telemetry.cpuCoresLogical}L cores
                  {telemetry.cpuTempC !== null ? ` · ${telemetry.cpuTempC}°C` : ''}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">SYSTEM MEMORY</div>
                <div className="text-lg font-bold font-mono text-cyan-200">
                  {formatMb(telemetry.ramMb)} / {formatMb(telemetry.ramTotalMb)}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {telemetry.ramPercent.toFixed(1)}% committed
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">PRIMARY GPU</div>
                <div className="text-xs font-semibold text-emerald-100 truncate">
                  {telemetry.primaryGpuName}
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {formatMb(telemetry.primaryVramFreeMb)} free / {formatMb(telemetry.primaryVramTotalMb)}
                  {telemetry.gpuTempC !== null ? ` · ${telemetry.gpuTempC}°C` : ''}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1">
                <div className="text-[11px] font-mono text-slate-400">PROFILE &amp; LOCAL LLM</div>
                <div className="text-xs font-mono font-semibold text-cyan-300">
                  {telemetry.recommendedProfile}
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {telemetry.localLlmCapable
                    ? telemetry.recommendedLocalModel || 'Local LLM Capable'
                    : 'Cloud / LPU Recommended'}
                </div>
              </div>
            </div>

            {telemetry.gpus.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Detected Adapters ({telemetry.gpus.length})
                </div>
                {telemetry.gpus.map((gpu) => (
                  <div
                    key={gpu.index}
                    className="rounded-lg border border-white/8 bg-[#05080b] p-3 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-emerald-100 truncate">
                        GPU #{gpu.index}: {gpu.name}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0">
                      {formatMb(gpu.vram_used_mb)} / {formatMb(gpu.vram_total_mb)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: THEMES & WALLPAPERS */}
      {subTab === 'themes' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Activate persistent Forge themes and WebGL/shader wallpapers stored in SQLite WAL.
            </div>
            <button
              type="button"
              onClick={() => void loadThemesAndWallpapers()}
              disabled={loadingVisuals}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#090e14] px-3 py-1.5 text-xs font-mono text-slate-200 hover:border-cyan-400/40"
            >
              {loadingVisuals ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh Catalog
            </button>
          </div>

          {/* Themes Grid */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-400" />
              Nexus Themes ({themes.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {themes.map((theme) => {
                const swatches = [
                  theme.tokens?.void_bg,
                  theme.tokens?.surface_tint,
                  theme.tokens?.accent_primary,
                  theme.tokens?.accent_secondary,
                ].filter((v): v is string => typeof v === 'string' && v.startsWith('#'));

                return (
                  <div
                    key={theme.id}
                    className={`matrix-panel rounded-xl p-4 space-y-3 transition ${
                      theme.is_active
                        ? 'border-emerald-400/50 matrix-glow'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-emerald-50">{theme.name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {theme.id} {theme.is_builtin ? '· Built-in' : '· Custom'}
                        </div>
                      </div>
                      {theme.is_active && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/45 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono text-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {swatches.length > 0 && (
                      <div className="flex items-center gap-2">
                        {swatches.map((hex, idx) => (
                          <span
                            key={`${theme.id}-${hex}-${idx}`}
                            style={{ backgroundColor: hex }}
                            title={hex}
                            className="h-5 flex-1 rounded-md border border-white/15"
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={theme.is_active || activatingThemeId === theme.id}
                      onClick={() => void handleActivateTheme(theme.id)}
                      className={`w-full rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        theme.is_active
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 cursor-default'
                          : 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                      }`}
                    >
                      {activatingThemeId === theme.id
                        ? 'Activating...'
                        : theme.is_active
                          ? 'Active Theme'
                          : 'Activate Theme'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Wallpapers Grid */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Shader &amp; Ambient Wallpapers ({wallpapers.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {wallpapers.map((wp) => (
                <div
                  key={wp.id}
                  className={`matrix-panel rounded-xl p-4 space-y-3 transition ${
                    wp.is_active
                      ? 'border-cyan-400/50 matrix-glow-cyan'
                      : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-emerald-50 truncate">{wp.name}</div>
                      <div className="text-[11px] font-mono text-slate-400 truncate">
                        {wp.kind || 'shader'} · {wp.mode_binding || 'GLOBAL'}
                      </div>
                    </div>
                    {wp.is_active && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-cyan-400/45 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-mono text-cyan-200">
                        <CheckCircle2 className="w-3 h-3" />
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {wp.source_path && (
                    <div className="text-[11px] font-mono text-slate-500 truncate">
                      {wp.source_path}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={wp.is_active || activatingWallpaperId === wp.id}
                    onClick={() => void handleActivateWallpaper(wp.id)}
                    className={`w-full rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      wp.is_active
                        ? 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200 cursor-default'
                        : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                    }`}
                  >
                    {activatingWallpaperId === wp.id
                      ? 'Applying...'
                      : wp.is_active
                        ? 'Active Wallpaper'
                        : 'Activate Wallpaper'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REMOTE & SKILLS */}
      {subTab === 'remote' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Remote QR Companion Pairing */}
          <div className="xl:col-span-5 matrix-panel holo-ring rounded-xl p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-emerald-100 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  Mobile Companion Pairing
                </h2>
                <p className="text-xs text-slate-400">
                  Scoped Bearer token QR handshake bound to `127.0.0.1:47630`.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void regenerateQr()}
                disabled={generatingQr}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {generatingQr ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Regenerate
              </button>
            </div>

            {qrData?.qr_base64 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#05080b] p-4">
                <img
                  src={qrData.qr_base64}
                  alt="Nexus Remote Pairing QR"
                  className="w-44 h-44 rounded-lg border border-emerald-500/30 bg-white p-1"
                />
                <div className="w-full space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Pairing PIN</span>
                    <span className="text-emerald-300 font-bold tracking-widest">
                      {qrData.pin || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tunnel</span>
                    <span className="text-cyan-300">
                      {qrData.tunnel_type || 'edge'} ({qrData.host}:{qrData.port ?? 47630})
                    </span>
                  </div>
                  {qrData.pairing_url && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/8">
                      <span className="text-[11px] text-slate-400 truncate">
                        {qrData.pairing_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyText(qrData.pairing_url || '', 'pairing-url')}
                        className="shrink-0 text-cyan-300 hover:text-emerald-300"
                        title="Copy pairing URL"
                      >
                        {copiedKey === 'pairing-url' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-[#05080b] p-8 text-center text-xs text-slate-400">
                {qrData?.error || 'Click Regenerate to mint a scoped mobile QR pairing token.'}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleVerifyRemoteConnect()}
              disabled={verifyingRemote || !qrData?.token}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/45 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {verifyingRemote ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              Verify Handshake (`GET /api/remote/connect`)
            </button>

            {remoteConnectRes && (
              <div
                className={`rounded-lg border p-3 text-xs font-mono ${
                  remoteConnectRes.success
                    ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
                    : 'border-red-500/35 bg-red-950/20 text-red-200'
                }`}
              >
                {remoteConnectRes.success
                  ? `${remoteConnectRes.message} · ${remoteConnectRes.ipc_host}:${remoteConnectRes.ipc_port}`
                  : remoteConnectRes.error}
              </div>
            )}
          </div>

          {/* Installed Skills & MCP Tools */}
          <div className="xl:col-span-7 matrix-panel rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-white/10 bg-[#05080b] p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setSkillsTabMode('skills')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    skillsTabMode === 'skills'
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  Installed Skills ({skills.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSkillsTabMode('tools')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    skillsTabMode === 'tools'
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  MCP Tools ({tools.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={skillsFilter}
                  onChange={(e) => setSkillsFilter(e.target.value)}
                  placeholder="Filter skills or tools..."
                  className="w-48 rounded-lg border border-white/10 bg-[#05080b] px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void loadSkills()}
                  disabled={loadingSkills}
                  className="rounded-lg border border-white/10 bg-[#05080b] p-1.5 text-slate-300 hover:text-emerald-300"
                >
                  {loadingSkills ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {skillsTabMode === 'skills' ? (
              filteredSkills.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-8 text-center text-xs text-slate-400">
                  No installed `.nxskill` bundles match the current filter.
                </div>
              ) : (
                <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1">
                  {filteredSkills.map((sk) => (
                    <div
                      key={sk.slug}
                      className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-emerald-100 truncate">
                          {sk.name || sk.slug}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
                          {sk.orbiter_group && (
                            <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-200">
                              {sk.orbiter_group}
                            </span>
                          )}
                          {sk.version && (
                            <span className="text-slate-400">v{sk.version}</span>
                          )}
                        </div>
                      </div>
                      {sk.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">{sk.description}</p>
                      )}
                      {sk.permission_scope && sk.permission_scope.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {sk.permission_scope.map((perm) => (
                            <span
                              key={perm}
                              className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : filteredTools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#05080b]/60 p-8 text-center text-xs text-slate-400">
                No registered `@nexus_tool` endpoints match the filter.
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="rounded-xl border border-white/8 bg-[#05080b] p-3.5 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Wrench className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs font-mono font-semibold text-emerald-100 truncate">
                          {tool.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono">
                        {tool.agent && (
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                            {tool.agent}
                          </span>
                        )}
                        {tool.requires_approval && (
                          <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                            APPROVAL
                          </span>
                        )}
                      </div>
                    </div>
                    {tool.description && (
                      <p className="text-xs text-slate-400 line-clamp-2">{tool.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsView;
