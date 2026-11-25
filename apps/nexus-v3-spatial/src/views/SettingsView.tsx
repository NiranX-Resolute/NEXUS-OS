import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Palette,
  Plug,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { ProviderItem } from '@/types'

type SettingsTab = 'providers' | 'compute' | 'themes' | 'remote'
type ProviderFilter = 'all' | 'configured' | 'unconfigured'
type SkillsFilter = 'all' | 'skills' | 'tools'

type ProviderRow = ProviderItem & {
  last_status?: string
  last_latency_ms?: number
}

interface ProvidersListResponse {
  success?: boolean
  providers?: ProviderRow[]
  count?: number
  error?: string
}

interface ProviderTestResponse {
  success?: boolean
  status?: string
  latency_ms?: number
  provider_id?: string
  error?: string
}

interface HfStatusResponse {
  success?: boolean
  authenticated?: boolean
  status?: string
  username?: string
  email?: string
  organizations?: string[]
  type?: string
  message?: string
  error?: string
}

interface ReleaseGpuResponse {
  success?: boolean
  released_nodes?: string[]
  failed_nodes?: string[]
  count?: number
  reason?: string
  timestamp?: number
  error?: string
}

interface WalCheckpointResponse {
  success?: boolean
  checkpoint?: number[]
  db_path?: string
  error?: string
}

interface ThemeRecord {
  id: string
  name: string
  is_builtin?: boolean
  tokens?: Record<string, string>
  is_active?: boolean
  updated_at?: string | number
}

interface ThemesListResponse {
  success?: boolean
  themes?: ThemeRecord[]
  active_theme?: ThemeRecord
  error?: string
}

interface WallpaperRecord {
  id: string
  name: string
  kind?: string
  source_path?: string
  mode_binding?: string
  config?: Record<string, unknown>
  is_active?: boolean
  updated_at?: string | number
}

interface WallpapersListResponse {
  success?: boolean
  wallpapers?: WallpaperRecord[]
  active_wallpaper?: WallpaperRecord | null
  error?: string
}

interface RemoteQrResponse {
  success?: boolean
  pairing_url?: string
  qr_payload?: string
  token?: string
  host?: string
  port?: number
  pin?: string
  tunnel_url?: string
  tunnel_type?: string
  bound_to?: string
  expires_in_seconds?: number
  expires_at?: string | number
  qr_base64?: string
  error?: string
}

interface RemoteConnectResponse {
  success?: boolean
  message?: string
  ipc_host?: string
  ipc_port?: number
  timestamp?: number
  error?: string
}

interface InstalledSkillRecord {
  slug: string
  name: string
  version?: string
  description?: string
  category?: string
  type?: string
  orbiter_group?: string
  permission_scope?: string[]
}

interface McpToolRecord {
  name: string
  description?: string
  dependencies?: string[]
  agent?: string
  requires_approval?: boolean
}

interface SkillsApiResponse {
  success?: boolean
  skills?: InstalledSkillRecord[]
  tools?: McpToolRecord[]
  error?: string
}

function formatMbToGb(mb: number): string {
  if (!mb || mb <= 0) return '0.0 GB'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}

function isTruthyFlag(val: number | boolean | undefined): boolean {
  return val === true || val === 1
}

export function SettingsView() {
  const telemetry = useNexusStore((s) => s.telemetry)
  const refreshAll = useNexusStore((s) => s.refreshAll)
  const pushToast = useNexusStore((s) => s.pushToast)

  const [activeTab, setActiveTab] = useState<SettingsTab>('providers')

  // Providers & Keys state
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providerSearch, setProviderSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all')
  const [selectedProviderId, setSelectedProviderId] = useState<string>('')

  const [editModel, setEditModel] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)
  const [editApiKey, setEditApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingProvider, setSavingProvider] = useState(false)
  const [testingProvider, setTestingProvider] = useState(false)
  const [deletingKey, setDeletingKey] = useState(false)
  const [lastProbeResult, setLastProbeResult] = useState<ProviderTestResponse | null>(null)

  // Compute & Hardware state
  const [hfStatus, setHfStatus] = useState<HfStatusResponse | null>(null)
  const [hfLoading, setHfLoading] = useState(false)
  const [hfTokenInput, setHfTokenInput] = useState('')
  const [releasingGpu, setReleasingGpu] = useState(false)
  const [gpuReleaseRes, setGpuReleaseRes] = useState<ReleaseGpuResponse | null>(null)
  const [walChecking, setWalChecking] = useState(false)
  const [walRes, setWalRes] = useState<WalCheckpointResponse | null>(null)

  // Themes & Wallpapers state
  const [themes, setThemes] = useState<ThemeRecord[]>([])
  const [activeTheme, setActiveTheme] = useState<ThemeRecord | null>(null)
  const [themesLoading, setThemesLoading] = useState(false)
  const [activatingThemeId, setActivatingThemeId] = useState('')

  const [wallpapers, setWallpapers] = useState<WallpaperRecord[]>([])
  const [activeWallpaper, setActiveWallpaper] = useState<WallpaperRecord | null>(null)
  const [wallpapersLoading, setWallpapersLoading] = useState(false)
  const [activatingWallpaperId, setActivatingWallpaperId] = useState('')

  // Remote & Skills state
  const [qrData, setQrData] = useState<RemoteQrResponse | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)
  const [connectToken, setConnectToken] = useState('')
  const [verifyingConnect, setVerifyingConnect] = useState(false)
  const [connectResult, setConnectResult] = useState<RemoteConnectResponse | null>(null)

  const [skills, setSkills] = useState<InstalledSkillRecord[]>([])
  const [tools, setTools] = useState<McpToolRecord[]>([])
  const [skillsLoading, setSkillsLoading] = useState(false)
  const [skillsQuery, setSkillsQuery] = useState('')
  const [skillsFilter, setSkillsFilter] = useState<SkillsFilter>('all')

  const fetchProviders = useCallback(async () => {
    setProvidersLoading(true)
    try {
      const res = await ipcJson<ProvidersListResponse>('/api/providers')
      if (Array.isArray(res.providers)) {
        setProviders(res.providers)
        setSelectedProviderId((prev) =>
          prev && res.providers?.some((p) => p.provider_id === prev)
            ? prev
            : res.providers?.[0]?.provider_id || '',
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load providers', 'error')
    } finally {
      setProvidersLoading(false)
    }
  }, [pushToast])

  const fetchHfStatus = useCallback(async (overrideToken?: string) => {
    setHfLoading(true)
    try {
      const tok = overrideToken?.trim()
      const url = tok ? `/api/hf/status?token=${encodeURIComponent(tok)}` : '/api/hf/status'
      const res = await ipcJson<HfStatusResponse>(url)
      setHfStatus(res)
    } catch (err) {
      setHfStatus({
        success: false,
        authenticated: false,
        status: 'ERROR',
        error: err instanceof Error ? err.message : 'Hugging Face probe failed',
      })
    } finally {
      setHfLoading(false)
    }
  }, [])

  const fetchThemes = useCallback(async () => {
    setThemesLoading(true)
    try {
      const res = await ipcJson<ThemesListResponse>('/api/themes')
      if (Array.isArray(res.themes)) setThemes(res.themes)
      if (res.active_theme) setActiveTheme(res.active_theme)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading themes', 'error')
    } finally {
      setThemesLoading(false)
    }
  }, [pushToast])

  const fetchWallpapers = useCallback(async () => {
    setWallpapersLoading(true)
    try {
      const res = await ipcJson<WallpapersListResponse>('/api/wallpapers')
      if (Array.isArray(res.wallpapers)) setWallpapers(res.wallpapers)
      setActiveWallpaper(res.active_wallpaper ?? null)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading wallpapers', 'error')
    } finally {
      setWallpapersLoading(false)
    }
  }, [pushToast])

  const fetchSkills = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const res = await ipcJson<SkillsApiResponse>('/api/skills')
      if (Array.isArray(res.skills)) setSkills(res.skills)
      if (Array.isArray(res.tools)) setTools(res.tools)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed loading skills registry', 'error')
    } finally {
      setSkillsLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    void fetchProviders()
    void fetchHfStatus()
    void fetchThemes()
    void fetchWallpapers()
    void fetchSkills()
  }, [fetchProviders, fetchHfStatus, fetchThemes, fetchWallpapers, fetchSkills])

  const selectedProvider = useMemo(
    () => providers.find((p) => p.provider_id === selectedProviderId) || null,
    [providers, selectedProviderId],
  )

  useEffect(() => {
    if (!selectedProvider) return
    setEditModel(selectedProvider.selected_model || '')
    setEditBaseUrl(selectedProvider.base_url || '')
    setEditEnabled(selectedProvider.enabled === undefined ? true : isTruthyFlag(selectedProvider.enabled))
    setEditApiKey('')
    setShowKey(false)
    setLastProbeResult(null)
  }, [selectedProvider])

  const filteredProviders = useMemo(() => {
    const q = providerSearch.trim().toLowerCase()
    return providers.filter((p) => {
      const configured = isTruthyFlag(p.has_key)
      if (providerFilter === 'configured' && !configured) return false
      if (providerFilter === 'unconfigured' && configured) return false
      if (!q) return true
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.provider_id.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.selected_model.toLowerCase().includes(q)
      )
    })
  }, [providerFilter, providerSearch, providers])

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProvider) return
    setSavingProvider(true)
    try {
      const payload: Record<string, unknown> = {
        selected_model: editModel.trim() || selectedProvider.selected_model,
        base_url: editBaseUrl.trim() || selectedProvider.base_url,
        enabled: editEnabled,
      }
      if (editApiKey.trim()) {
        payload.api_key = editApiKey.trim()
      }
      const res = await ipcJson<{ success?: boolean; has_key?: number; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/save`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )
      if (res.success === false) {
        pushToast(res.error || 'Failed saving provider configuration', 'error')
        return
      }
      setEditApiKey('')
      pushToast(`Saved ${selectedProvider.display_name} settings`, 'success')
      await fetchProviders()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Provider save error', 'error')
    } finally {
      setSavingProvider(false)
    }
  }

  const handleTestProvider = async () => {
    if (!selectedProvider) return
    setTestingProvider(true)
    try {
      const body = editApiKey.trim() ? { api_key: editApiKey.trim() } : {}
      const res = await ipcJson<ProviderTestResponse>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/test`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      )
      setLastProbeResult(res)
      if (res.success) {
        pushToast(
          `${selectedProvider.display_name} operational (${res.latency_ms ?? 0}ms)`,
          'success',
        )
      } else {
        pushToast(
          res.error || `${selectedProvider.display_name} status: ${res.status || 'OFFLINE'}`,
          'warning',
        )
      }
      await fetchProviders()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Provider probe failed', 'error')
    } finally {
      setTestingProvider(false)
    }
  }

  const handleDeleteProviderKey = async () => {
    if (!selectedProvider) return
    setDeletingKey(true)
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/providers/${encodeURIComponent(selectedProvider.provider_id)}/key`,
        { method: 'DELETE' },
      )
      if (res.success === false) {
        pushToast(res.error || 'Unable to delete provider key', 'error')
        return
      }
      setEditApiKey('')
      setLastProbeResult(null)
      pushToast(`Removed DPAPI key for ${selectedProvider.display_name}`, 'info')
      await fetchProviders()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete key error', 'error')
    } finally {
      setDeletingKey(false)
    }
  }

  const handleReleaseGpu = async () => {
    setReleasingGpu(true)
    try {
      const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setGpuReleaseRes(res)
      if (res.success === false) {
        pushToast(res.error || 'GPU release returned an error', 'error')
      } else {
        pushToast(`Released ${res.count ?? 0} idle cloud compute nodes`, 'success')
        await refreshAll()
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'GPU release request failed', 'error')
    } finally {
      setReleasingGpu(false)
    }
  }

  const handleWalCheckpoint = async () => {
    setWalChecking(true)
    try {
      const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setWalRes(res)
      if (res.success === false) {
        pushToast(res.error || 'WAL checkpoint failed', 'error')
      } else {
        pushToast('SQLite WAL checkpoint truncated cleanly', 'success')
        await refreshAll()
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'WAL checkpoint request failed', 'error')
    } finally {
      setWalChecking(false)
    }
  }

  const handleActivateTheme = async (themeId: string) => {
    setActivatingThemeId(themeId)
    try {
      const res = await ipcJson<{
        success?: boolean
        active_theme?: ThemeRecord
        error?: string
      }>(`/api/themes/activate/${encodeURIComponent(themeId)}`, {
        method: 'POST',
        body: JSON.stringify({ theme_id: themeId }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Theme activation failed', 'error')
        return
      }
      if (res.active_theme) setActiveTheme(res.active_theme)
      pushToast(`Activated theme "${res.active_theme?.name || themeId}"`, 'success')
      await fetchThemes()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Theme activation error', 'error')
    } finally {
      setActivatingThemeId('')
    }
  }

  const handleActivateWallpaper = async (wp: WallpaperRecord) => {
    setActivatingWallpaperId(wp.id)
    try {
      const res = await ipcJson<{
        success?: boolean
        active_wallpaper?: WallpaperRecord
        error?: string
      }>(`/api/wallpapers/activate/${encodeURIComponent(wp.id)}`, {
        method: 'POST',
        body: JSON.stringify({
          wallpaper_id: wp.id,
          mode_binding: wp.mode_binding || 'GLOBAL',
        }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Wallpaper activation failed', 'error')
        return
      }
      if (res.active_wallpaper) setActiveWallpaper(res.active_wallpaper)
      pushToast(`Activated wallpaper "${wp.name}"`, 'success')
      await fetchWallpapers()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Wallpaper activation error', 'error')
    } finally {
      setActivatingWallpaperId('')
    }
  }

  const handleGenerateQr = async () => {
    setGeneratingQr(true)
    try {
      const res = await ipcJson<RemoteQrResponse>('/api/remote/qr-regenerate', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setQrData(res)
      if (res.token) {
        setConnectToken(res.token)
      }
      if (res.success === false) {
        pushToast(res.error || 'Failed generating QR pairing code', 'error')
      } else {
        pushToast(`Generated QR pairing token (PIN ${res.pin || 'Ready'})`, 'success')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'QR generation failed', 'error')
    } finally {
      setGeneratingQr(false)
    }
  }

  const handleVerifyRemoteConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const tok = connectToken.trim()
    if (!tok) {
      pushToast('Generate or paste a pairing token first', 'warning')
      return
    }
    setVerifyingConnect(true)
    try {
      const res = await ipcJson<RemoteConnectResponse>(
        `/api/remote/connect?token=${encodeURIComponent(tok)}`,
      )
      setConnectResult(res)
      if (res.success) {
        pushToast(res.message || 'Mobile handshake verified', 'success')
      } else {
        pushToast(res.error || 'Handshake token invalid or expired', 'warning')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Handshake check failed', 'error')
    } finally {
      setVerifyingConnect(false)
    }
  }

  const copyString = async (text: string, label: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      pushToast(`${label} copied`, 'success')
    } catch {
      pushToast('Clipboard unavailable', 'warning')
    }
  }

  const filteredSkills = useMemo(() => {
    const q = skillsQuery.trim().toLowerCase()
    return skills.filter((s) => {
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q)
      )
    })
  }, [skills, skillsQuery])

  const filteredTools = useMemo(() => {
    const q = skillsQuery.trim().toLowerCase()
    return tools.filter((t) => {
      if (!q) return true
      return (
        t.name.toLowerCase().includes(q) ||
        (t.agent || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      )
    })
  }, [tools, skillsQuery])

  const configuredCount = useMemo(
    () => providers.filter((p) => isTruthyFlag(p.has_key)).length,
    [providers],
  )

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 animate-spatial-enter">
      {/* Floating Header Dock */}
      <header className="spatial-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 mint-glow">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              System Configuration &amp; Mesh Controls
            </h1>
            <p className="text-xs text-slate-400">
              Providers, compute hardware, themes, wallpapers, remote pairing &amp; skills
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {(
            [
              { id: 'providers', label: 'Providers & Keys', icon: KeyRound },
              { id: 'compute', label: 'Compute & Hardware', icon: Cpu },
              { id: 'themes', label: 'Themes & Wallpapers', icon: Palette },
              { id: 'remote', label: 'Remote & Skills', icon: Smartphone },
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
      </header>

      {/* TAB 1: PROVIDERS & KEYS */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Provider List */}
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">LLM Provider Mesh</h2>
                <p className="text-xs text-slate-400">
                  {configuredCount} of {providers.length} providers keyed in DPAPI
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchProviders()}
                disabled={providersLoading}
                className="spatial-pill rounded-xl p-2 text-slate-200 disabled:opacity-50"
                title="Refresh providers"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${providersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Filter providers or models..."
                  className="w-full rounded-xl border border-white/10 bg-[#070b10]/70 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
              </div>

              <div className="flex gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'configured', label: 'Keyed' },
                    { id: 'unconfigured', label: 'Unconfigured' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setProviderFilter(f.id)}
                    className={`rounded-lg px-3 py-1 text-[11px] font-medium transition ${
                      providerFilter === f.id
                        ? 'spatial-pill-active text-emerald-200'
                        : 'border border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex max-h-[460px] flex-col gap-2 overflow-y-auto pr-1">
              {filteredProviders.map((p) => {
                const selected = p.provider_id === selectedProviderId
                const hasKey = isTruthyFlag(p.has_key)
                const statusLabel = p.status || p.last_status || (hasKey ? 'KEYED' : 'UNCONFIGURED')
                return (
                  <button
                    key={p.provider_id}
                    type="button"
                    onClick={() => setSelectedProviderId(p.provider_id)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition ${
                      selected
                        ? 'border-emerald-400/40 bg-emerald-400/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            hasKey ? 'bg-emerald-400' : 'bg-slate-600'
                          }`}
                        />
                        <span className="truncate text-xs font-semibold text-slate-100">
                          {p.display_name}
                        </span>
                        {p.free_tier_badge && (
                          <span className="shrink-0 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                            {p.free_tier_badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                        {p.selected_model}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-slate-400">
                      {statusLabel}
                    </span>
                  </button>
                )
              })}
              {filteredProviders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                  No providers match the current filter.
                </div>
              )}
            </div>
          </section>

          {/* Selected Provider Inspector */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 lg:col-span-7">
            {selectedProvider ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-semibold text-slate-100">
                        {selectedProvider.display_name}
                      </h3>
                      <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-300">
                        {selectedProvider.protocol}
                      </span>
                      {isTruthyFlag(selectedProvider.has_key) && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] text-emerald-300">
                          DPAPI Key Stored
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      ID: <span className="font-mono text-slate-300">{selectedProvider.provider_id}</span> · Priority #{selectedProvider.priority_order}
                    </p>
                  </div>

                  {selectedProvider.key_console_url && (
                    <a
                      href={selectedProvider.key_console_url}
                      target="_blank"
                      rel="noreferrer"
                      className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-emerald-300"
                    >
                      <span>Key Console</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                <form onSubmit={handleSaveProvider} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-300">Selected Model</span>
                      <input
                        type="text"
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-emerald-400/50"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-300">Base Endpoint URL</span>
                      <input
                        type="text"
                        value={editBaseUrl}
                        onChange={(e) => setEditBaseUrl(e.target.value)}
                        className="rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2.5 font-mono text-xs text-slate-100 outline-none focus:border-emerald-400/50"
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      API Key (stored encrypted via Windows DPAPI; leave blank to keep existing)
                    </span>
                    <div className="relative flex items-center">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={editApiKey}
                        onChange={(e) => setEditApiKey(e.target.value)}
                        placeholder={
                          isTruthyFlag(selectedProvider.has_key)
                            ? '•••••••••••• (stored in DPAPI vault)'
                            : 'Paste provider API key...'
                        }
                        className="w-full rounded-xl border border-white/10 bg-[#070b10]/70 py-2.5 pl-3.5 pr-10 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((v) => !v)}
                        className="absolute right-3 text-slate-400 hover:text-slate-200"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={editEnabled}
                      onChange={(e) => setEditEnabled(e.target.checked)}
                      className="h-4 w-4 accent-emerald-400"
                    />
                    <span>Enable provider in autonomous cascade router</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingProvider}
                      className="spatial-pill-active flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{savingProvider ? 'Saving...' : 'Save Configuration'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleTestProvider()}
                      disabled={testingProvider}
                      className="spatial-pill flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-emerald-300 disabled:opacity-50"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>{testingProvider ? 'Testing...' : 'Test Connection'}</span>
                    </button>

                    {isTruthyFlag(selectedProvider.has_key) && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteProviderKey()}
                        disabled={deletingKey}
                        className="spatial-pill flex items-center gap-2 rounded-xl border-rose-400/25 px-3.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{deletingKey ? 'Deleting...' : 'Revoke Key'}</span>
                      </button>
                    )}
                  </div>
                </form>

                {lastProbeResult && (
                  <div
                    className={`rounded-2xl border p-4 text-xs ${
                      lastProbeResult.success
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                        : 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span>Status: {lastProbeResult.status || 'CHECKED'}</span>
                      {typeof lastProbeResult.latency_ms === 'number' && (
                        <span>{lastProbeResult.latency_ms}ms</span>
                      )}
                    </div>
                    {lastProbeResult.error && (
                      <p className="mt-1.5 text-amber-200/90">{lastProbeResult.error}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center text-xs text-slate-400">
                Select a provider on the left to inspect or update its model and key.
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 2: COMPUTE & HARDWARE */}
      {activeTab === 'compute' && (
        <div className="flex flex-col gap-6">
          {/* Hardware Snapshot Tiles */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="spatial-panel rounded-3xl p-5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">CPU Compute</span>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-100">
                {Math.round(telemetry.cpuPercent)}%
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {telemetry.cpuCoresPhysical || 0} physical / {telemetry.cpuCoresLogical || 0} logical cores
                {telemetry.cpuTempC !== null ? ` · ${telemetry.cpuTempC}°C` : ''}
              </p>
            </div>

            <div className="spatial-panel rounded-3xl p-5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">System RAM</span>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-100">
                {formatMbToGb(telemetry.ramUsedMb)}{' '}
                <span className="text-sm font-normal text-slate-400">
                  / {formatMbToGb(telemetry.ramTotalMb)}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {Math.round(telemetry.ramPercent)}% utilized · Profile: {telemetry.recommendedProfile}
              </p>
            </div>

            <div className="spatial-panel rounded-3xl p-5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400">Primary GPU</span>
              <p className="mt-2 truncate text-base font-semibold text-slate-100">
                {telemetry.gpuName || 'CPU / Integrated'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                VRAM {formatMbToGb(telemetry.vramUsedMb)} / {formatMbToGb(telemetry.vramTotalMb)}
                {telemetry.gpuTempC !== null ? ` · ${telemetry.gpuTempC}°C` : ''}
              </p>
            </div>
          </div>

          {/* HF Status + Cloud GPU / WAL Maintenance */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {/* Hugging Face Hub Auth */}
            <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 xl:col-span-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Hugging Face Hub Identity
                    </h2>
                    <p className="text-xs text-slate-400">
                      Token status for GGUF search &amp; Sovereign Spaces
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchHfStatus(hfTokenInput)}
                  disabled={hfLoading}
                  className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${hfLoading ? 'animate-spin' : ''}`} />
                  <span>Validate</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={hfTokenInput}
                  onChange={(e) => setHfTokenInput(e.target.value)}
                  placeholder="Optional: test a Hugging Face token (hf_...)"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
                <button
                  type="button"
                  onClick={() => void fetchHfStatus(hfTokenInput)}
                  disabled={hfLoading}
                  className="spatial-pill-active rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Check
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#070b10]/65 p-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Auth State</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                      hfStatus?.authenticated
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                        : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                    }`}
                  >
                    {hfStatus?.status || 'UNKNOWN'}
                  </span>
                </div>
                {hfStatus?.username && (
                  <p className="mt-2 text-slate-200">
                    Signed in as <span className="font-mono text-emerald-300">{hfStatus.username}</span>
                    {hfStatus.email ? ` (${hfStatus.email})` : ''}
                  </p>
                )}
                {Array.isArray(hfStatus?.organizations) && hfStatus.organizations.length > 0 && (
                  <p className="mt-1 text-slate-400">
                    Orgs: {hfStatus.organizations.join(', ')}
                  </p>
                )}
                {(hfStatus?.message || hfStatus?.error) && (
                  <p className="mt-2 text-amber-200/90">
                    {hfStatus.message || hfStatus.error}
                  </p>
                )}
              </div>

              {telemetry.localLlmCapable && (
                <p className="text-xs text-slate-400">
                  Local Ollama Ready · Recommended Model:{' '}
                  <span className="font-mono text-emerald-300">
                    {telemetry.recommendedLocalModel || 'Auto'}
                  </span>
                </p>
              )}
            </section>

            {/* Cloud GPU Release & SQLite WAL Checkpoint */}
            <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-6">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Compute Pool &amp; Storage Maintenance
                </h2>
                <p className="text-xs text-slate-400">
                  Reclaim remote cloud GPU quotas and flush SQLite WAL journals
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      Release Idle Cloud GPUs
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Sends shutdown to idle Kaggle/Colab nodes and deregisters KV pool entries
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleReleaseGpu()}
                    disabled={releasingGpu}
                    className="spatial-pill-active flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>{releasingGpu ? 'Releasing...' : 'Release GPUs'}</span>
                  </button>
                </div>
                {gpuReleaseRes && (
                  <p className="font-mono text-[11px] text-emerald-300">
                    Released: {gpuReleaseRes.count ?? 0} node(s)
                    {gpuReleaseRes.released_nodes?.length
                      ? ` (${gpuReleaseRes.released_nodes.join(', ')})`
                      : ''}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      SQLite WAL Checkpoint
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Executes PRAGMA wal_checkpoint(TRUNCATE) on agent_local.db
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleWalCheckpoint()}
                    disabled={walChecking}
                    className="spatial-pill flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
                  >
                    <Database className="h-3.5 w-3.5 text-emerald-300" />
                    <span>{walChecking ? 'Flushing...' : 'Checkpoint WAL'}</span>
                  </button>
                </div>
                {walRes && (
                  <p className="truncate font-mono text-[11px] text-emerald-300">
                    Checkpoint [{(walRes.checkpoint || []).join(', ')}] · {walRes.db_path}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 3: THEMES & WALLPAPERS */}
      {activeTab === 'themes' && (
        <div className="flex flex-col gap-6">
          {/* Themes Section */}
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Workspace Themes</h2>
                <p className="text-xs text-slate-400">
                  Active: <span className="text-emerald-300">{activeTheme?.name || 'Default'}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchThemes()}
                disabled={themesLoading}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${themesLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {themes.map((theme) => {
                const isActive = Boolean(theme.is_active || activeTheme?.id === theme.id)
                const swatches = Object.values(theme.tokens || {})
                  .filter((v) => typeof v === 'string' && (v.startsWith('#') || v.startsWith('rgb')))
                  .slice(0, 5)
                return (
                  <div
                    key={theme.id}
                    className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition ${
                      isActive
                        ? 'border-emerald-400/45 bg-emerald-400/[0.08]'
                        : 'border-white/10 bg-white/[0.025]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{theme.name}</h3>
                        <p className="font-mono text-[11px] text-slate-400">{theme.id}</p>
                      </div>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </span>
                      ) : theme.is_builtin ? (
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400">
                          Built-in
                        </span>
                      ) : null}
                    </div>

                    {swatches.length > 0 && (
                      <div className="flex items-center gap-2">
                        {swatches.map((color, idx) => (
                          <span
                            key={`${theme.id}-sw-${idx}`}
                            className="h-5 w-5 rounded-full border border-white/15"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={isActive || activatingThemeId === theme.id}
                      onClick={() => void handleActivateTheme(theme.id)}
                      className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                        isActive
                          ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 opacity-75'
                          : 'spatial-pill text-slate-200 hover:border-emerald-400/35'
                      }`}
                    >
                      {activatingThemeId === theme.id
                        ? 'Activating...'
                        : isActive
                          ? 'Current Theme'
                          : 'Activate Theme'}
                    </button>
                  </div>
                )
              })}
              {themes.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                  No themes registered in SQLite WAL.
                </div>
              )}
            </div>
          </section>

          {/* Wallpapers Section */}
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Spatial Wallpapers</h2>
                <p className="text-xs text-slate-400">
                  Active:{' '}
                  <span className="text-emerald-300">
                    {activeWallpaper?.name || 'System Ambient'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchWallpapers()}
                disabled={wallpapersLoading}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${wallpapersLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {wallpapers.map((wp) => {
                const isActive = Boolean(wp.is_active || activeWallpaper?.id === wp.id)
                return (
                  <div
                    key={wp.id}
                    className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition ${
                      isActive
                        ? 'border-emerald-400/45 bg-emerald-400/[0.08]'
                        : 'border-white/10 bg-white/[0.025]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">{wp.name}</h3>
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                          {wp.mode_binding || 'GLOBAL'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">
                        {wp.kind || 'shader'}
                        {wp.source_path ? ` · ${wp.source_path}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isActive || activatingWallpaperId === wp.id}
                      onClick={() => void handleActivateWallpaper(wp)}
                      className={`rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                        isActive
                          ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 opacity-75'
                          : 'spatial-pill text-slate-200 hover:border-emerald-400/35'
                      }`}
                    >
                      {activatingWallpaperId === wp.id
                        ? 'Applying...'
                        : isActive
                          ? 'Active Wallpaper'
                          : 'Activate Wallpaper'}
                    </button>
                  </div>
                )
              })}
              {wallpapers.length === 0 && (
                <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                  No custom wallpapers stored yet.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: REMOTE PAIRING & SKILLS */}
      {activeTab === 'remote' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Remote Mobile QR Pairing */}
          <section className="spatial-panel flex flex-col gap-5 rounded-3xl p-6 xl:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Remote Mobile QR Pairing
                </h2>
                <p className="text-xs text-slate-400">
                  Short-lived scoped Bearer handshake bound to 127.0.0.1:47630
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateQr()}
                disabled={generatingQr}
                className="spatial-pill-active flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>{generatingQr ? 'Generating...' : 'Generate QR'}</span>
              </button>
            </div>

            {qrData?.qr_base64 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-[#070b10]/70 p-5">
                <img
                  src={qrData.qr_base64}
                  alt="Nexus Remote Pairing QR"
                  className="h-44 w-44 rounded-xl border border-white/15 bg-white p-2"
                />
                <div className="w-full space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Pairing PIN</span>
                    <span className="font-mono text-sm font-bold text-emerald-300">
                      {qrData.pin || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Tunnel</span>
                    <span className="font-mono text-slate-200">
                      {qrData.tunnel_type || 'edge_gateway'} · {qrData.host}:{qrData.port}
                    </span>
                  </div>
                  {qrData.pairing_url && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="truncate font-mono text-[11px] text-slate-400">
                        {qrData.pairing_url}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyString(qrData.pairing_url || '', 'Pairing URL')}
                        className="spatial-pill shrink-0 rounded-lg p-1.5 text-slate-300"
                        title="Copy pairing URL"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center text-xs text-slate-400">
                Click Generate QR to mint a 15-minute scoped pairing code for mobile control.
              </div>
            )}

            {/* Verify Token Handshake */}
            <form onSubmit={handleVerifyRemoteConnect} className="flex flex-col gap-2.5">
              <span className="text-xs font-medium text-slate-300">
                Verify Mobile Handshake Token
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={connectToken}
                  onChange={(e) => setConnectToken(e.target.value)}
                  placeholder="Paste QR pairing token..."
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#070b10]/70 px-3.5 py-2 font-mono text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
                <button
                  type="submit"
                  disabled={verifyingConnect}
                  className="spatial-pill rounded-xl px-3.5 py-2 text-xs font-medium text-emerald-300 disabled:opacity-50"
                >
                  {verifyingConnect ? 'Checking...' : 'Verify'}
                </button>
              </div>
              {connectResult && (
                <p
                  className={`text-xs ${
                    connectResult.success ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {connectResult.success
                    ? `${connectResult.message} (${connectResult.ipc_host}:${connectResult.ipc_port})`
                    : connectResult.error}
                </p>
              )}
            </form>
          </section>

          {/* Installed Skills & MCP Tools */}
          <section className="spatial-panel flex flex-col gap-4 rounded-3xl p-6 xl:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Plug className="h-4 w-4 text-emerald-300" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Installed Skills &amp; MCP Tools
                  </h2>
                  <p className="text-xs text-slate-400">
                    {skills.length} skills · {tools.length} registered MCP tools
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void fetchSkills()}
                disabled={skillsLoading}
                className="spatial-pill flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${skillsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={skillsQuery}
                  onChange={(e) => setSkillsQuery(e.target.value)}
                  placeholder="Search installed skills or MCP tools..."
                  className="w-full rounded-xl border border-white/10 bg-[#070b10]/70 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-400/50"
                />
              </div>

              <div className="flex gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'skills', label: `Skills (${filteredSkills.length})` },
                    { id: 'tools', label: `MCP Tools (${filteredTools.length})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSkillsFilter(f.id)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition ${
                      skillsFilter === f.id
                        ? 'spatial-pill-active text-emerald-200'
                        : 'border border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex max-h-[460px] flex-col gap-2.5 overflow-y-auto pr-1">
              {(skillsFilter === 'all' || skillsFilter === 'skills') &&
                filteredSkills.map((sk) => (
                  <div
                    key={`skill-${sk.slug}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100">{sk.name}</span>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                          skill {sk.version ? `v${sk.version}` : ''}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {sk.orbiter_group || sk.category || sk.slug}
                      </span>
                    </div>
                    {sk.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-300">{sk.description}</p>
                    )}
                  </div>
                ))}

              {(skillsFilter === 'all' || skillsFilter === 'tools') &&
                filteredTools.map((tool) => (
                  <div
                    key={`tool-${tool.name}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-100">
                          {tool.name}
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          {tool.agent || 'MCP'}
                        </span>
                        {tool.requires_approval && (
                          <span className="rounded-md border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200">
                            Approval Guarded
                          </span>
                        )}
                      </div>
                    </div>
                    {tool.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{tool.description}</p>
                    )}
                  </div>
                ))}

              {filteredSkills.length === 0 && filteredTools.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-xs text-slate-400">
                  No matching installed skills or MCP tools found.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default SettingsView
