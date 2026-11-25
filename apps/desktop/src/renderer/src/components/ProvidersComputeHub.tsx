import React, { useState, useEffect } from 'react'
import {
  RiCpuLine,
  RiServerLine,
  RiCloudLine,
  RiKeyLine,
  RiShieldCheckLine,
  RiSpeedLine,
  RiCheckLine,
  RiCloseLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiSparklingLine,
  RiVoiceprintLine,
  RiTerminalBoxLine,
  RiRefreshLine,
  RiDeleteBinLine,
  RiSearchLine,
  RiAlertFill,
  RiAddLine,
  RiLockLine,
  RiMoneyDollarCircleLine,
  RiPlayLine,
  RiStopCircleLine,
  RiCodeSSlashLine,
  RiEyeLine,
  RiUserVoiceLine
} from 'react-icons/ri'
import { AbliteratedWarningBanner, checkIsAbliterated } from './AbliteratedWarningBanner'

interface ProviderConfig {
  provider_id: string
  display_name: string
  category: string
  protocol: string
  base_url: string
  key_console_url: string
  selected_model: string
  free_tier_badge?: string
  priority_order: number
  enabled: number | boolean
  has_key: number | boolean
  last_latency_ms?: number
  last_status?: string
}

interface ModelItem {
  model_uid: string
  display_name: string
  creator: string
  provider_id: string
  api_or_hf_id: string
  runtime_target: string
  modality: string
  is_abliterated: number | boolean
  abliteration_source?: string
  voice_compatible: number | boolean
  voice_role?: string
  vram_gb: number
  ram_gb: number
  quant_tag?: string
  intelligence_index?: number
  cost_per_task_usd?: number
  time_per_task_min?: number
  ttft_sec?: number
  error_rate_pct?: number
  context_window?: string
  license?: string
}

interface RoleSlotConfig {
  role_id: string
  provider_id: string
  model_id: string
  updated_at?: string
}

interface GuardrailsConfig {
  free_tier_only: number
  allow_paid_failover: number
  daily_budget_usd: number
  daily_spend_usd: number
  budget_date?: string
}

interface ProvidersComputeHubProps {
  isOpen: boolean
  onClose: () => void
  activeModelName?: string
  onSelectModel?: (model: ModelItem) => void
}

export const ProvidersComputeHub: React.FC<ProvidersComputeHubProps> = ({
  isOpen,
  onClose,
  activeModelName = 'qwen2.5-coder:7b',
  onSelectModel
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'roles' | 'catalog' | 'kaggle' | 'hf'>('providers')

  // Auth helper
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    try {
      const { getIpcToken } = await import('@renderer/services/ipc-client')
      const token = await getIpcToken()
      if (token) {
        return {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Nexus-Token': token
        }
      }
    } catch (err) {
      console.warn('[BYOK Hub] Token lookup failed:', err)
    }
    return { 'Content-Type': 'application/json' }
  }

  // Providers state
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({})
  const [testingKey, setTestingKey] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, { latency?: number; status: string }>>({})

  // Guardrails state
  const [guardrails, setGuardrails] = useState<GuardrailsConfig>({
    free_tier_only: 1,
    allow_paid_failover: 0,
    daily_budget_usd: 5.0,
    daily_spend_usd: 0.0
  })
  const [savingGuardrails, setSavingGuardrails] = useState(false)

  // Custom Provider Modal state
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customProviderId, setCustomProviderId] = useState('')
  const [customDisplayName, setCustomDisplayName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customSelectedModel, setCustomSelectedModel] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customSaving, setCustomSaving] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)

  // Roles state
  const [roles, setRoles] = useState<Record<string, RoleSlotConfig>>({})
  const [roleInputs, setRoleInputs] = useState<Record<string, { provider_id: string; model_id: string }>>({})
  const [savingRole, setSavingRole] = useState<Record<string, boolean>>({})

  // Catalog state
  const [models, setModels] = useState<ModelItem[]>([])
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'original' | 'abliterated' | 'voice'>('all')
  const [hardwareFilter, setHardwareFilter] = useState<string>('all')
  const [catalogSearch, setCatalogSearch] = useState<string>('')
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null)

  // Kaggle Builder state
  const [kaggleAccelerator, setKaggleAccelerator] = useState<'gpu_t4_x2' | 'gpu_p100' | 'cpu_30gb'>('gpu_t4_x2')
  const [kaggleModelTag, setKaggleModelTag] = useState<string>('hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL')
  const [kaggleSidecar, setKaggleSidecar] = useState<'none' | 'haru_4b' | 'voxcpm2'>('none')
  const [kaggleIdleTimeout, setKaggleIdleTimeout] = useState<number>(600)
  const [kaggleScript, setKaggleScript] = useState<string>('')
  const [copiedScript, setCopiedScript] = useState(false)
  const [wakingKaggle, setWakingKaggle] = useState(false)
  const [kaggleWakeStatus, setKaggleWakeStatus] = useState<string | null>(null)
  const [releasingGpu, setReleasingGpu] = useState(false)
  const [gpuReleaseStatus, setGpuReleaseStatus] = useState<string | null>(null)
  const [remoteEndpointUrl, setRemoteEndpointUrl] = useState<string>('')

  // Hugging Face state
  const [hfStatus, setHfStatus] = useState<any>(null)
  const [hfSearchQuery, setHfSearchQuery] = useState('abliterated GGUF')
  const [hfHubResults, setHfHubResults] = useState<any[]>([])
  const [hfSearching, setHfSearching] = useState(false)
  const [hfBundleModelId, setHfBundleModelId] = useState('hf.co/huihui-ai/Huihui-Qwen3.8-Flash-Next-abliterated-GGUF:UD-Q4_K_XL')
  const [hfBundleHardware, setHfBundleHardware] = useState('zero_gpu')
  const [hfSpaceBundle, setHfSpaceBundle] = useState<{ 'app.py'?: string; 'requirements.txt'?: string } | null>(null)

  // Load providers from IPC
  const loadProviders = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/providers', { headers })
      if (resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data.providers)) {
          setProviders(data.providers)
        }
      }
    } catch (err) {
      console.error('Failed loading providers:', err)
    }
  }

  // Load models from IPC
  const loadModels = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/models/catalog', { headers })
      if (resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data.models)) {
          setModels(data.models)
          if (!selectedModel && data.models.length > 0) {
            setSelectedModel(data.models[0])
          }
        }
      }
    } catch (err) {
      console.error('Failed loading models:', err)
    }
  }

  // Load HF status from IPC
  const loadHfStatus = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/hf/status', { headers })
      if (resp.ok) {
        const data = await resp.json()
        setHfStatus(data)
      }
    } catch {}
  }

  // Load roles from IPC
  const loadRoles = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/providers/roles', { headers })
      if (resp.ok) {
        const data = await resp.json()
        if (data.roles) {
          const map: Record<string, RoleSlotConfig> = {}
          const inputMap: Record<string, { provider_id: string; model_id: string }> = {}
          for (const r of data.roles) {
            map[r.role_id] = r
            inputMap[r.role_id] = { provider_id: r.provider_id, model_id: r.model_id }
          }
          setRoles(map)
          setRoleInputs(inputMap)
        }
      }
    } catch (err) {
      console.error('Failed loading roles:', err)
    }
  }

  // Load guardrails from IPC
  const loadGuardrails = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/providers/guardrails', { headers })
      if (resp.ok) {
        const data = await resp.json()
        if (data.guardrails) {
          setGuardrails(data.guardrails)
        }
      }
    } catch (err) {
      console.error('Failed loading guardrails:', err)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadProviders()
      loadModels()
      loadHfStatus()
      loadRoles()
      loadGuardrails()
    }
  }, [isOpen])

  // Generate Kaggle script when params change
  useEffect(() => {
    const fetchKaggleScript = async () => {
      try {
        const headers = await getAuthHeaders()
        const resp = await fetch('http://127.0.0.1:47630/api/compute/kaggle-template', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            accelerator: kaggleAccelerator,
            model_name: kaggleModelTag,
            idle_timeout_sec: kaggleIdleTimeout,
            voice_sidecar: kaggleSidecar
          })
        })
        if (resp.ok) {
          const data = await resp.json()
          if (data.script) setKaggleScript(data.script)
        }
      } catch (err) {
        console.error('Kaggle template error:', err)
      }
    }
    fetchKaggleScript()
  }, [kaggleAccelerator, kaggleModelTag, kaggleSidecar, kaggleIdleTimeout])

  // Save API key into DPAPI vault
  const handleSaveKey = async (providerId: string) => {
    const keyVal = keyInputs[providerId] || ''
    setSavingKey((prev) => ({ ...prev, [providerId]: true }))
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch(`http://127.0.0.1:47630/api/providers/${providerId}/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ api_key: keyVal, enabled: true })
      })
      if (resp.ok) {
        setKeyInputs((prev) => ({ ...prev, [providerId]: '' }))
        await loadProviders()
      }
    } catch (err) {
      console.error('Error saving provider key:', err)
    } finally {
      setSavingKey((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  // Delete API key from DPAPI vault
  const handleDeleteKey = async (providerId: string) => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch(`http://127.0.0.1:47630/api/providers/${providerId}/key`, {
        method: 'DELETE',
        headers
      })
      if (resp.ok) {
        await loadProviders()
      }
    } catch (err) {}
  }

  // Test provider latency probe
  const handleTestProvider = async (providerId: string) => {
    setTestingKey((prev) => ({ ...prev, [providerId]: true }))
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch(`http://127.0.0.1:47630/api/providers/${providerId}/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ api_key: keyInputs[providerId] || undefined })
      })
      const data = await resp.json()
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          latency: data.latency_ms,
          status: data.status || (resp.ok ? 'OPERATIONAL' : 'AUTH_ERROR')
        }
      }))
      await loadProviders()
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { status: 'OFFLINE' }
      }))
    } finally {
      setTestingKey((prev) => ({ ...prev, [providerId]: false }))
    }
  }

  // Save Guardrails
  const handleSaveGuardrails = async (updated: Partial<GuardrailsConfig>) => {
    setSavingGuardrails(true)
    try {
      const headers = await getAuthHeaders()
      const payload = { ...guardrails, ...updated }
      const resp = await fetch('http://127.0.0.1:47630/api/providers/guardrails', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.guardrails) setGuardrails(data.guardrails)
      }
    } catch (err) {
      console.error('Failed saving guardrails:', err)
    } finally {
      setSavingGuardrails(false)
    }
  }

  // Save Custom Provider
  const handleCreateCustomProvider = async (e: React.FormEvent) => {
    e.preventDefault()
    setCustomSaving(true)
    setCustomError(null)
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/providers/custom', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider_id: customProviderId.trim().toLowerCase(),
          display_name: customDisplayName.trim(),
          base_url: customBaseUrl.trim(),
          selected_model: customSelectedModel.trim(),
          api_key: customApiKey.trim() || undefined
        })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setShowCustomModal(false)
        setCustomProviderId('')
        setCustomDisplayName('')
        setCustomBaseUrl('')
        setCustomSelectedModel('')
        setCustomApiKey('')
        await loadProviders()
      } else {
        setCustomError(data.error || 'Failed to add custom provider')
      }
    } catch (err: any) {
      setCustomError(err.message || 'Network error connecting to IPC')
    } finally {
      setCustomSaving(false)
    }
  }

  // Save Role Slot
  const handleSaveRole = async (roleId: string) => {
    const input = roleInputs[roleId]
    if (!input) return
    setSavingRole((prev) => ({ ...prev, [roleId]: true }))
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/providers/roles', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role_id: roleId,
          provider_id: input.provider_id,
          model_id: input.model_id
        })
      })
      if (resp.ok) {
        await loadRoles()
      }
    } catch (err) {
      console.error('Failed saving role:', err)
    } finally {
      setSavingRole((prev) => ({ ...prev, [roleId]: false }))
    }
  }

  // 1-Click Kaggle Auto-Wake
  const handleWakeKaggle = async () => {
    setWakingKaggle(true)
    setKaggleWakeStatus(null)
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/compute/kaggle-wake', {
        method: 'POST',
        headers,
        body: JSON.stringify({ slug: 'nexus-t4-worker' })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setKaggleWakeStatus(`✓ Kernel push started: ${data.message || 'Dispatched'}`)
      } else {
        setKaggleWakeStatus(`Notice: ${data.error || data.message || 'Cooldown or offline'}`)
      }
    } catch (err: any) {
      setKaggleWakeStatus(`Error: ${err.message}`)
    } finally {
      setWakingKaggle(false)
    }
  }

  // Release GPU Quota
  const handleReleaseGpu = async () => {
    setReleasingGpu(true)
    setGpuReleaseStatus(null)
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/compute/release', {
        method: 'POST',
        headers,
        body: JSON.stringify({ endpoint_url: remoteEndpointUrl.trim() || undefined })
      })
      const data = await resp.json()
      if (resp.ok && data.success) {
        setGpuReleaseStatus('✓ GPU node quota released successfully')
      } else {
        setGpuReleaseStatus(`Notice: ${data.error || 'Failed to release node'}`)
      }
    } catch (err: any) {
      setGpuReleaseStatus(`Error: ${err.message}`)
    } finally {
      setReleasingGpu(false)
    }
  }

  // Search HF Hub
  const handleSearchHf = async () => {
    setHfSearching(true)
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch(
        `http://127.0.0.1:47630/api/hf/models/search?query=${encodeURIComponent(hfSearchQuery)}&limit=15`,
        { headers }
      )
      if (resp.ok) {
        const data = await resp.json()
        setHfHubResults(data.models || [])
      }
    } catch {} finally {
      setHfSearching(false)
    }
  }

  // Generate HF Space Bundle
  const handleGenerateHfBundle = async () => {
    try {
      const headers = await getAuthHeaders()
      const resp = await fetch('http://127.0.0.1:47630/api/hf/space/bundle', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_id: hfBundleModelId,
          hardware: hfBundleHardware,
          is_abliterated: checkIsAbliterated(hfBundleModelId)
        })
      })
      if (resp.ok) {
        const data = await resp.json()
        setHfSpaceBundle(data.bundle)
      }
    } catch {}
  }

  if (!isOpen) return null

  // Filtered providers
  const filteredProviders = providers.filter((p) => {
    if (categoryFilter === 'all') return true
    return p.category === categoryFilter
  })

  // Filtered models
  const filteredModels = models.filter((m) => {
    if (catalogFilter === 'original' && m.is_abliterated) return false
    if (catalogFilter === 'abliterated' && !m.is_abliterated) return false
    if (catalogFilter === 'voice' && !m.voice_compatible) return false
    if (hardwareFilter !== 'all' && m.runtime_target !== hardwareFilter) return false
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase()
      return (
        m.display_name.toLowerCase().includes(q) ||
        m.creator.toLowerCase().includes(q) ||
        m.api_or_hf_id.toLowerCase().includes(q)
      )
    }
    return true
  })

  const currentAbliterated =
    (selectedModel && checkIsAbliterated(selectedModel.api_or_hf_id, !!selectedModel.is_abliterated)) ||
    (activeTab === 'kaggle' && checkIsAbliterated(kaggleModelTag)) ||
    (activeTab === 'hf' && checkIsAbliterated(hfBundleModelId)) ||
    checkIsAbliterated(activeModelName)

  // 5 Canonical Role Slot definitions
  const ROLE_DEFS = [
    {
      id: 'voice_brain',
      name: 'Voice Duplex Brain',
      desc: 'Sub-300ms ultra-fast audio-conversational intelligence',
      icon: <RiUserVoiceLine className="w-4 h-4 text-purple-400" />,
      defaultModel: 'gemini-2.5-flash'
    },
    {
      id: 'heavy_coder',
      name: 'Heavy Code & Math',
      desc: 'Deep reasoning, architecture, and syntax synthesis',
      icon: <RiCodeSSlashLine className="w-4 h-4 text-cyan-400" />,
      defaultModel: 'deepseek-chat'
    },
    {
      id: 'security_auditor',
      name: 'ScopeGuard & Invariant Auditor',
      desc: '6 GRAVITAS invariants and path security enforcement',
      icon: <RiShieldCheckLine className="w-4 h-4 text-emerald-400" />,
      defaultModel: 'llama-3.3-70b-versatile'
    },
    {
      id: 'vision_scout',
      name: 'Vision & Screen Scout',
      desc: 'Desktop screen perception, OCR, and DOM spatial grounding',
      icon: <RiEyeLine className="w-4 h-4 text-amber-400" />,
      defaultModel: 'gemini-2.5-flash'
    },
    {
      id: 'general_default',
      name: 'General Default Orchestrator',
      desc: 'Universal instruction following and autonomous tool planning',
      icon: <RiSparklingLine className="w-4 h-4 text-blue-400" />,
      defaultModel: 'llama-3.3-70b-versatile'
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-6xl h-[92vh] flex flex-col bg-zinc-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden font-sans text-zinc-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(0,245,212,0.3)]">
              <RiCpuLine className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Universal BYOK & Compute Hub
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  45+ Providers & Kaggle/HF Mesh
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                100% Free-Tier Edge Inference • DPAPI Vault • Role-Based Slots • Free-Tier Lock
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close modal"
            >
              <RiCloseLine className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-white/10 bg-black/40 text-xs font-mono overflow-x-auto">
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'providers'
                ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RiKeyLine className="w-3.5 h-3.5" />
            <span>45+ Providers ({providers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('roles')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RiShieldCheckLine className="w-3.5 h-3.5" />
            <span>Role-Based Model Slots (5)</span>
          </button>

          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RiSparklingLine className="w-3.5 h-3.5" />
            <span>Model Catalog & Benchmarks ({models.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('kaggle')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'kaggle'
                ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RiTerminalBoxLine className="w-3.5 h-3.5" />
            <span>Kaggle Custom Builder & Mesh</span>
          </button>

          <button
            onClick={() => setActiveTab('hf')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'hf'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RiCloudLine className="w-3.5 h-3.5" />
            <span>Hugging Face Hub & Spaces</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: 45+ API PROVIDERS */}
          {activeTab === 'providers' && (
            <div className="space-y-4">
              {/* Free-Tier Lock & Daily Spend Guardrail Bar */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/30 via-zinc-900/60 to-emerald-950/30 border border-cyan-500/20 flex items-center justify-between gap-4 flex-wrap text-xs font-mono">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <RiLockLine className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white">Free-Tier-Only Lock:</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guardrails.free_tier_only === 1}
                        onChange={(e) =>
                          handleSaveGuardrails({ free_tier_only: e.target.checked ? 1 : 0 })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                    </label>
                    <span className={`text-[10px] ${guardrails.free_tier_only === 1 ? 'text-cyan-300 font-bold' : 'text-zinc-500'}`}>
                      {guardrails.free_tier_only === 1 ? 'ACTIVE (Zero-Cost Routing)' : 'ALLOW PAID'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pl-4 border-l border-white/10">
                    <RiMoneyDollarCircleLine className="w-4 h-4 text-emerald-400" />
                    <span className="text-zinc-400">Daily Cap:</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={guardrails.daily_budget_usd}
                      onChange={(e) =>
                        setGuardrails((prev) => ({ ...prev, daily_budget_usd: parseFloat(e.target.value) || 0 }))
                      }
                      onBlur={() => handleSaveGuardrails({ daily_budget_usd: guardrails.daily_budget_usd })}
                      className="w-16 h-7 bg-black/60 border border-white/15 rounded px-2 text-white text-xs focus:border-emerald-400 focus:outline-none"
                    />
                    <span className="text-zinc-500 text-[11px]">USD</span>
                    <span className="text-zinc-400 ml-2">
                      Spent Today: <span className="text-emerald-400 font-bold">${guardrails.daily_spend_usd.toFixed(2)}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCustomModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RiAddLine className="w-4 h-4" />
                    <span>+ Add Custom Provider</span>
                  </button>
                  <button
                    onClick={loadProviders}
                    className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RiRefreshLine className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Category Filter Bar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-mono overflow-x-auto">
                  <span className="text-zinc-500">Category:</span>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'frontier_direct', label: 'Frontier Direct' },
                    { id: 'lpu_fast', label: 'Ultra-Fast LPU' },
                    { id: 'open_weight_cloud', label: 'Open-Weight Cloud' },
                    { id: 'enterprise_cloud', label: 'Enterprise Cloud' },
                    { id: 'sovereign_compute', label: 'Sovereign' }
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                        categoryFilter === cat.id
                          ? 'bg-white/15 text-white font-bold'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Provider Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredProviders.map((p) => {
                  const hasKey = !!p.has_key
                  const testRes = testResults[p.provider_id]
                  const status = testRes?.status || p.last_status || (hasKey ? 'OPERATIONAL' : 'UNCONFIGURED')
                  return (
                    <div
                      key={p.provider_id}
                      className="p-4 rounded-xl bg-zinc-900/60 border border-white/10 hover:border-white/20 transition flex flex-col justify-between gap-3 shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                              <span>{p.display_name}</span>
                              {hasKey && (
                                <RiShieldCheckLine className="w-4 h-4 text-emerald-400" title="API Key Encrypted in DPAPI" />
                              )}
                            </h3>
                            <span className="text-[10px] font-mono text-zinc-400">{p.protocol}</span>
                          </div>

                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              status === 'OPERATIONAL'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : status === 'RATE_LIMITED'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : status === 'AUTH_ERROR'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-zinc-800 text-zinc-400 border border-white/10'
                            }`}
                          >
                            {status}
                          </span>
                        </div>

                        {p.free_tier_badge && (
                          <div className="mt-2 text-[10px] font-mono text-cyan-300/90 bg-cyan-950/40 border border-cyan-500/20 rounded px-2 py-0.5 inline-block">
                            {p.free_tier_badge}
                          </div>
                        )}

                        <div className="mt-2 text-[11px] font-mono text-zinc-400 space-y-0.5">
                          <div className="truncate">
                            <span className="text-zinc-500">Model:</span> {p.selected_model}
                          </div>
                          {p.last_latency_ms !== undefined && (
                            <div className="text-emerald-400/90 flex items-center gap-1">
                              <RiSpeedLine className="w-3 h-3" />
                              <span>{p.last_latency_ms} ms</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5 text-xs font-mono">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="password"
                            placeholder={hasKey ? '••••••••••••••••' : 'Enter API Key...'}
                            value={keyInputs[p.provider_id] || ''}
                            onChange={(e) =>
                              setKeyInputs((prev) => ({ ...prev, [p.provider_id]: e.target.value }))
                            }
                            className="flex-1 h-8 bg-black/60 border border-white/10 rounded-lg px-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveKey(p.provider_id)}
                            disabled={savingKey[p.provider_id]}
                            className="h-8 px-3 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 font-bold transition disabled:opacity-50 cursor-pointer"
                          >
                            {savingKey[p.provider_id] ? 'Saving...' : 'Save'}
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <a
                            href={p.key_console_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-400 hover:text-cyan-300 flex items-center gap-1 transition"
                          >
                            <span>Get Key</span>
                            <RiExternalLinkLine className="w-3 h-3" />
                          </a>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleTestProvider(p.provider_id)}
                              disabled={testingKey[p.provider_id]}
                              className="text-zinc-400 hover:text-emerald-300 flex items-center gap-1 transition cursor-pointer"
                            >
                              <RiSpeedLine className="w-3 h-3" />
                              <span>{testingKey[p.provider_id] ? 'Testing...' : 'Test'}</span>
                            </button>

                            {hasKey && (
                              <button
                                type="button"
                                onClick={() => handleDeleteKey(p.provider_id)}
                                className="text-zinc-500 hover:text-red-400 transition cursor-pointer"
                                title="Remove key from vault"
                              >
                                <RiDeleteBinLine className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: ROLE-BASED MODEL SLOTS */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/30 text-xs font-mono space-y-2">
                <h3 className="font-bold text-sm text-blue-200 flex items-center gap-2">
                  <RiShieldCheckLine className="w-4 h-4 text-blue-400" />
                  <span>Role-Based Model Slots (Multi-Agent Dispatcher)</span>
                </h3>
                <p className="text-zinc-300 leading-relaxed font-sans">
                  Bind specific providers and models to specialized OS roles. When an agent or task invokes Voice, Heavy Coding, ScopeGuard Auditing, or Vision, Nexus OS automatically routes through these assigned slots without prompt rewrites.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ROLE_DEFS.map((role) => {
                  const currentRole = roles[role.id]
                  const input = roleInputs[role.id] || {
                    provider_id: currentRole?.provider_id || 'groq',
                    model_id: currentRole?.model_id || role.defaultModel
                  }
                  const isSaving = savingRole[role.id]

                  return (
                    <div
                      key={role.id}
                      className="p-5 rounded-xl bg-zinc-900/60 border border-white/10 hover:border-white/20 transition flex flex-col justify-between gap-4 shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {role.icon}
                            <div>
                              <h4 className="font-bold text-sm text-white">{role.name}</h4>
                              <span className="text-[10px] font-mono text-zinc-500">{role.id}</span>
                            </div>
                          </div>
                          {currentRole && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                              Active: {currentRole.provider_id}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 mt-2 font-sans">{role.desc}</p>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-white/5 text-xs font-mono">
                        <div>
                          <label className="block text-zinc-500 mb-1">Target Provider</label>
                          <select
                            value={input.provider_id}
                            onChange={(e) => {
                              const newP = e.target.value
                              const pObj = providers.find((p) => p.provider_id === newP)
                              setRoleInputs((prev) => ({
                                ...prev,
                                [role.id]: {
                                  provider_id: newP,
                                  model_id: pObj?.selected_model || input.model_id
                                }
                              }))
                            }}
                            className="w-full h-8 bg-black/60 border border-white/10 rounded-lg px-2 text-white focus:outline-none focus:border-blue-400 text-xs"
                          >
                            {providers.map((p) => (
                              <option key={p.provider_id} value={p.provider_id}>
                                {p.display_name} ({p.category})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-zinc-500 mb-1">Model Tag / ID</label>
                          <input
                            type="text"
                            value={input.model_id}
                            onChange={(e) =>
                              setRoleInputs((prev) => ({
                                ...prev,
                                [role.id]: {
                                  provider_id: input.provider_id,
                                  model_id: e.target.value
                                }
                              }))
                            }
                            placeholder="e.g. gemini-2.5-flash or llama-3.3-70b-versatile"
                            className="w-full h-8 bg-black/60 border border-white/10 rounded-lg px-2.5 text-white focus:outline-none focus:border-blue-400 text-xs"
                          />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[10px] text-zinc-500">
                            {currentRole?.updated_at ? `Updated: ${currentRole.updated_at}` : 'Default slot'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSaveRole(role.id)}
                            disabled={isSaving}
                            className="px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/40 font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <RiCheckLine className="w-3.5 h-3.5" />
                            <span>{isSaving ? 'Saving...' : 'Save Slot'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 3: MODEL CATALOG & BENCHMARKS */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              {/* Filter Bar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-mono overflow-x-auto">
                  {[
                    { id: 'all', label: 'All Models' },
                    { id: 'original', label: 'Original Checkpoints' },
                    { id: 'abliterated', label: '⚠️ Abliterated (abliteratedmodels.org)' },
                    { id: 'voice', label: '🎙️ Voice Compatible' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setCatalogFilter(f.id as any)}
                      className={`px-3 py-1 rounded-md transition cursor-pointer whitespace-nowrap ${
                        catalogFilter === f.id
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                          : 'text-zinc-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-64">
                  <RiSearchLine className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search model, creator, or HF tag..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full h-8 pl-9 pr-3 bg-black/60 border border-white/10 rounded-lg text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Hardware Fit Pills */}
              <div className="flex items-center gap-1.5 text-xs font-mono overflow-x-auto">
                <span className="text-zinc-500">Hardware Fit:</span>
                {[
                  { id: 'all', label: 'All Targets' },
                  { id: 'kaggle_cpu', label: 'Kaggle 30GB CPU / PC' },
                  { id: 'kaggle_t4_x1', label: 'Single 16GB T4/P100' },
                  { id: 'kaggle_t4_x2', label: 'Dual T4 (32GB VRAM)' },
                  { id: 'hf_zerogpu', label: 'HF ZeroGPU (Pro 6000)' },
                  { id: 'api', label: 'Direct Serverless API' }
                ].map((hw) => (
                  <button
                    key={hw.id}
                    onClick={() => setHardwareFilter(hw.id)}
                    className={`px-2 py-0.5 rounded text-[11px] transition cursor-pointer whitespace-nowrap ${
                      hardwareFilter === hw.id
                        ? 'bg-white/15 text-white font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {hw.label}
                  </button>
                ))}
              </div>

              {/* Catalog Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredModels.map((m) => {
                  const isAb = !!m.is_abliterated
                  const isVoice = !!m.voice_compatible
                  const isSelected = selectedModel?.model_uid === m.model_uid
                  return (
                    <div
                      key={m.model_uid}
                      onClick={() => setSelectedModel(m)}
                      className={`p-4 rounded-xl cursor-pointer transition flex flex-col justify-between gap-3 shadow-md ${
                        isSelected
                          ? 'bg-zinc-900 border-2 border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                          : 'bg-zinc-900/50 border border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-sm text-white">{m.display_name}</h4>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {m.creator} • {m.runtime_target}
                            </span>
                          </div>
                          {m.intelligence_index && (
                            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono text-[11px] font-bold">
                              IQ {m.intelligence_index}
                            </span>
                          )}
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {isAb && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                              ⚠️ Abliterated
                            </span>
                          )}
                          {isVoice && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1 font-bold">
                              <RiVoiceprintLine className="w-3 h-3" />
                              <span>{m.voice_role || 'Voice Duplex'}</span>
                            </span>
                          )}
                          {m.quant_tag && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                              {m.quant_tag}
                            </span>
                          )}
                        </div>

                        {/* Benchmark & VRAM stats */}
                        <div className="grid grid-cols-2 gap-2 mt-3 p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-zinc-300">
                          <div>
                            <span className="text-zinc-500">TTFT:</span> {m.ttft_sec ? `${m.ttft_sec}s` : 'N/A'}
                          </div>
                          <div>
                            <span className="text-zinc-500">Context:</span> {m.context_window || '131k'}
                          </div>
                          <div>
                            <span className="text-zinc-500">VRAM/RAM:</span> {m.vram_gb ? `${m.vram_gb}G` : '0G'} / {m.ram_gb ? `${m.ram_gb}G` : '0G'}
                          </div>
                          <div>
                            <span className="text-zinc-500">Error Rate:</span> {m.error_rate_pct ? `${m.error_rate_pct}%` : 'Low'}
                          </div>
                        </div>

                        <div className="mt-2 text-[10px] font-mono text-zinc-500 truncate" title={m.api_or_hf_id}>
                          Tag: {m.api_or_hf_id}
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs font-mono">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedModel(m)
                            if (onSelectModel) onSelectModel(m)
                          }}
                          className={`flex-1 py-1 rounded-lg font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500 text-black'
                              : 'bg-white/10 hover:bg-white/15 text-zinc-200'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <RiCheckLine className="w-3.5 h-3.5" />
                              <span>Active</span>
                            </>
                          ) : (
                            <span>Select</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setKaggleModelTag(m.api_or_hf_id)
                            if (m.runtime_target === 'kaggle_cpu') setKaggleAccelerator('cpu_30gb')
                            else if (m.runtime_target === 'kaggle_t4_x1') setKaggleAccelerator('gpu_p100')
                            else setKaggleAccelerator('gpu_t4_x2')
                            setActiveTab('kaggle')
                          }}
                          className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/30 transition text-[11px] cursor-pointer"
                        >
                          Configure on Kaggle
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 4: KAGGLE CUSTOM-MODEL BUILDER & MESH */}
          {activeTab === 'kaggle' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs font-mono space-y-2">
                <h3 className="font-bold text-sm text-purple-200 flex items-center gap-2">
                  <RiTerminalBoxLine className="w-4 h-4 text-purple-400" />
                  <span>Kaggle 30 hrs/wk Dedicated GPU Worker Builder</span>
                </h3>
                <p className="text-zinc-300 leading-relaxed font-sans">
                  Generate turnkey notebook cells to run ANY model—standard Ollama or abliterated GGUF checkpoint directly from Hugging Face (<code className="text-purple-300">hf.co/...:quant</code>). Includes QuotaGuardProxy auto-idle shutdown, 1-Click Auto-Wake CLI, and remote quota release.
                </p>
              </div>

              {/* 1-Click Auto-Wake & Remote Quota Release Controls */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between gap-4 flex-wrap text-xs font-mono">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleWakeKaggle}
                    disabled={wakingKaggle}
                    className="px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    <RiPlayLine className="w-4 h-4 text-purple-400" />
                    <span>{wakingKaggle ? 'Pushing Kernel...' : '1-Click Auto-Wake (Kaggle CLI)'}</span>
                  </button>
                  {kaggleWakeStatus && (
                    <span className="text-[11px] text-purple-300 font-mono">{kaggleWakeStatus}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Worker URL (e.g. trycloudflare.com)"
                    value={remoteEndpointUrl}
                    onChange={(e) => setRemoteEndpointUrl(e.target.value)}
                    className="w-56 h-8 bg-black/60 border border-white/10 rounded-lg px-2 text-[11px] text-white focus:outline-none focus:border-red-400"
                  />
                  <button
                    type="button"
                    onClick={handleReleaseGpu}
                    disabled={releasingGpu}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <RiStopCircleLine className="w-4 h-4 text-red-400" />
                    <span>{releasingGpu ? 'Releasing...' : 'Release GPU Quota'}</span>
                  </button>
                </div>
              </div>

              {gpuReleaseStatus && (
                <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-500/30 text-xs font-mono text-red-300">
                  {gpuReleaseStatus}
                </div>
              )}

              {/* Interactive Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <label className="block text-zinc-400 mb-1.5 font-bold">Accelerator Hardware</label>
                  <select
                    value={kaggleAccelerator}
                    onChange={(e) => setKaggleAccelerator(e.target.value as any)}
                    className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="gpu_t4_x2">GPU T4 x2 — 32GB VRAM (Dual GPU)</option>
                    <option value="gpu_p100">GPU P100 — 16GB VRAM (Single GPU)</option>
                    <option value="cpu_30gb">CPU Only — 30GB RAM (Unlimited hrs)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1.5 font-bold">Voice Sidecar (GPU 1)</label>
                  <select
                    value={kaggleSidecar}
                    onChange={(e) => setKaggleSidecar(e.target.value as any)}
                    disabled={kaggleAccelerator !== 'gpu_t4_x2'}
                    className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:border-purple-400 disabled:opacity-50"
                  >
                    <option value="none">None (Single Model on All GPUs)</option>
                    <option value="haru_4b">Haru-4B Duplex Audio Server (Port 8998)</option>
                    <option value="voxcpm2">VoxCPM2 Multilingual Voice Clone & TTS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1.5 font-bold">Auto-Idle Shutdown</label>
                  <select
                    value={kaggleIdleTimeout}
                    onChange={(e) => setKaggleIdleTimeout(Number(e.target.value))}
                    className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value={300}>5 Minutes (Aggressive Quota Saving)</option>
                    <option value={600}>10 Minutes (Standard Default)</option>
                    <option value={1800}>30 Minutes (Extended Dev Session)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1.5 font-bold text-xs font-mono">
                  Primary Model Tag (Standard Ollama or Hugging Face GGUF)
                </label>
                <input
                  type="text"
                  value={kaggleModelTag}
                  onChange={(e) => setKaggleModelTag(e.target.value)}
                  placeholder="e.g. hf.co/huihui-ai/Huihui-Qwen3.8-27B-abliterated-GGUF:UD-Q4_K_XL"
                  className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-xs font-mono text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              {/* Copyable Python Cell */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-400">Copy & Paste this into a Kaggle Notebook Cell:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(kaggleScript)
                        setCopiedScript(true)
                        setTimeout(() => setCopiedScript(false), 2000)
                      }}
                      className="px-3 py-1 rounded-md bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 border border-purple-500/40 text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedScript ? <RiCheckLine className="w-3.5 h-3.5" /> : <RiFileCopyLine className="w-3.5 h-3.5" />}
                      <span>{copiedScript ? 'Copied Cell!' : 'Copy Notebook Cell'}</span>
                    </button>
                    <a
                      href="https://www.kaggle.com/code"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-mono flex items-center gap-1 transition"
                    >
                      <span>Open Kaggle ↗</span>
                    </a>
                  </div>
                </div>

                <pre className="p-4 rounded-xl bg-black border border-white/10 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-72">
                  <code>{kaggleScript}</code>
                </pre>
              </div>
            </div>
          )}

          {/* TAB 5: HUGGING FACE HUB & SPACES */}
          {activeTab === 'hf' && (
            <div className="space-y-6">
              {/* HF Token Status */}
              <div className="p-4 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <RiCloudLine className="w-4 h-4 text-amber-400" />
                    <span>Hugging Face Account Status</span>
                  </h4>
                  <p className="text-xs text-zinc-400 font-mono">
                    {hfStatus?.authenticated
                      ? `✓ Authenticated as ${hfStatus.username} (${hfStatus.type})`
                      : 'Hugging Face token not configured or offline.'}
                  </p>
                </div>

                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono font-bold flex items-center gap-1 transition"
                >
                  <span>Get HF Token ↗</span>
                </a>
              </div>

              {/* Hub Model Search */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs font-mono text-zinc-400">Search Hugging Face Hub (GGUF & Abliterated Checkpoints)</h4>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={hfSearchQuery}
                    onChange={(e) => setHfSearchQuery(e.target.value)}
                    placeholder="Search query (e.g. abliterated GGUF, huihui-ai, heretic)..."
                    className="flex-1 h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={handleSearchHf}
                    disabled={hfSearching}
                    className="h-9 px-4 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {hfSearching ? 'Searching...' : 'Search Hub'}
                  </button>
                </div>

                {hfHubResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto">
                    {hfHubResults.map((hm) => (
                      <div
                        key={hm.id}
                        className="p-3 rounded-lg bg-black/40 border border-white/10 text-xs font-mono space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-white truncate" title={hm.id}>
                            {hm.id}
                          </span>
                          {hm.is_abliterated && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                              Abliterated
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500">
                          <span>❤️ {hm.likes} • ⬇️ {hm.downloads}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setHfBundleModelId(hm.id)
                              handleGenerateHfBundle()
                            }}
                            className="text-amber-400 hover:text-white underline cursor-pointer"
                          >
                            Build Space
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Turnkey Space Bundle Generator */}
              <div className="space-y-3 pt-3 border-t border-white/10">
                <h4 className="font-bold text-xs font-mono text-zinc-400">1-Click ZeroGPU / 16GB CPU Space Deployment Bundle</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                  <div>
                    <label className="block text-zinc-500 mb-1">Target Model ID</label>
                    <input
                      type="text"
                      value={hfBundleModelId}
                      onChange={(e) => setHfBundleModelId(e.target.value)}
                      className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-500 mb-1">Hardware Target</label>
                    <select
                      value={hfBundleHardware}
                      onChange={(e) => setHfBundleHardware(e.target.value)}
                      className="w-full h-9 bg-black/60 border border-white/10 rounded-lg px-3 text-white focus:outline-none focus:border-amber-400"
                    >
                      <option value="zero_gpu">ZeroGPU (RTX Pro 6000 48-96GB VRAM)</option>
                      <option value="cpu_16gb">Always-On CPU (16GB RAM, Free 24/7)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateHfBundle}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono font-bold transition cursor-pointer"
                  >
                    Generate app.py & requirements.txt
                  </button>
                  <a
                    href="https://huggingface.co/new-space"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1"
                  >
                    <span>Create New HF Space ↗</span>
                  </a>
                </div>

                {hfSpaceBundle && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1">
                        <span>app.py (FastAPI OpenAI Endpoint)</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(hfSpaceBundle['app.py'] || '')}
                          className="hover:text-white cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-black border border-white/10 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-56">
                        <code>{hfSpaceBundle['app.py']}</code>
                      </pre>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1">
                        <span>requirements.txt</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(hfSpaceBundle['requirements.txt'] || '')}
                          className="hover:text-white cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="p-3 rounded-lg bg-black border border-white/10 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-56">
                        <code>{hfSpaceBundle['requirements.txt']}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal: Add Custom Provider */}
        {showCustomModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-zinc-900 border border-white/15 rounded-xl p-5 shadow-2xl space-y-4 text-xs font-mono">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <RiAddLine className="w-4 h-4 text-emerald-400" />
                  <span>Add Custom OpenAI-Compatible Provider</span>
                </h3>
                <button
                  onClick={() => setShowCustomModal(false)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>

              {customError && (
                <div className="p-2.5 rounded bg-red-950/30 border border-red-500/40 text-red-300 text-[11px]">
                  {customError}
                </div>
              )}

              <form onSubmit={handleCreateCustomProvider} className="space-y-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Provider ID (lowercase, e.g. my_vllm)</label>
                  <input
                    type="text"
                    required
                    value={customProviderId}
                    onChange={(e) => setCustomProviderId(e.target.value)}
                    placeholder="my_vllm"
                    className="w-full h-8 bg-black/60 border border-white/10 rounded px-2.5 text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={customDisplayName}
                    onChange={(e) => setCustomDisplayName(e.target.value)}
                    placeholder="My Custom vLLM Cluster"
                    className="w-full h-8 bg-black/60 border border-white/10 rounded px-2.5 text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Base URL (OpenAI compatible)</label>
                  <input
                    type="url"
                    required
                    value={customBaseUrl}
                    onChange={(e) => setCustomBaseUrl(e.target.value)}
                    placeholder="http://192.168.1.100:8000/v1"
                    className="w-full h-8 bg-black/60 border border-white/10 rounded px-2.5 text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Selected Default Model</label>
                  <input
                    type="text"
                    required
                    value={customSelectedModel}
                    onChange={(e) => setCustomSelectedModel(e.target.value)}
                    placeholder="Qwen/Qwen2.5-Coder-32B-Instruct"
                    className="w-full h-8 bg-black/60 border border-white/10 rounded px-2.5 text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">API Key (Stored in Windows DPAPI Vault)</label>
                  <input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="sk-optional-or-custom-secret"
                    className="w-full h-8 bg-black/60 border border-white/10 rounded px-2.5 text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(false)}
                    className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={customSaving}
                    className="px-4 py-1.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 font-bold transition disabled:opacity-50 cursor-pointer"
                  >
                    {customSaving ? 'Saving...' : 'Add Provider'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Persistent Bottom Warning Banner */}
        <AbliteratedWarningBanner
          modelName={
            selectedModel?.api_or_hf_id ||
            (activeTab === 'kaggle' ? kaggleModelTag : activeTab === 'hf' ? hfBundleModelId : activeModelName)
          }
          isAbliterated={currentAbliterated}
          source="abliteratedmodels.org / huihui-ai"
        />
      </div>
    </div>
  )
}

export default ProvidersComputeHub
