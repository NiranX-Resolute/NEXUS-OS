import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  UserCircle2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { ipcJson } from '@/services/ipc'
import { useNexusStore } from '@/store/useNexusStore'
import type { ModelItem } from '@/types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  model?: string
  provider?: string
  timestamp: string
}

interface ModelsCatalogResponse {
  success?: boolean
  models?: ModelItem[]
  count?: number
  error?: string
}

interface PersonaSettings {
  id?: number
  empathy_pct: number
  humor_pct: number
  candor_pct: number
  verbosity_pct: number
  voice_id: string
  voice_engine?: string
  active_preset: string
}

interface PersonaApiResponse {
  success?: boolean
  settings?: PersonaSettings
  persona?: PersonaSettings
  presets?: string[] | Record<string, unknown>
  error?: string
}

interface PersonaActivateResponse {
  success?: boolean
  persona?: PersonaSettings
  settings?: PersonaSettings
  voice_engine?: string
  error?: string
}

interface HaruStatusResponse {
  success?: boolean
  enabled?: boolean
  available?: boolean
  node_url?: string | null
  latency_ms?: number
  active_mode?: string
  air_gapped?: boolean
  estop_active?: boolean
  reference_clip_present?: boolean
  status?: HaruStatusResponse
  error?: string
}

interface DictateResponse {
  success?: boolean
  raw_text?: string
  cleaned_text?: string
  injected?: boolean
  latency_ms?: number
  error?: string
}

interface AiChatResponse {
  success?: boolean
  response?: string
  text?: string
  provider?: string
  model?: string
  error?: string
}

interface NormalizedPreset {
  id: string
  label: string
}

const DEFAULT_PRESETS: NormalizedPreset[] = [
  { id: 'CARING_COMPANION', label: 'Caring Companion' },
  { id: 'TARS_TACTICAL', label: 'TARS Tactical' },
  { id: 'LATE_NIGHT_CARE', label: 'Late-Night Care' },
  { id: 'DEBUG_SURGEON', label: 'Debug Surgeon' },
]

function normalizePresetKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function formatPresetLabel(id: string): string {
  const found = DEFAULT_PRESETS.find((p) => p.id === id)
  if (found) return found.label
  return id
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizePresetsList(raw?: string[] | Record<string, unknown>): NormalizedPreset[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((item) => ({
      id: normalizePresetKey(item),
      label: item.includes('_') ? formatPresetLabel(item) : item,
    }))
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw)
    if (keys.length > 0) {
      return keys.map((k) => ({ id: normalizePresetKey(k), label: formatPresetLabel(k) }))
    }
  }
  return DEFAULT_PRESETS
}

export const ChatView: React.FC = () => {
  const telemetry = useNexusStore((s) => s.telemetry)
  const pushToast = useNexusStore((s) => s.pushToast)

  const [models, setModels] = useState<ModelItem[]>([])
  const [selectedModelUid, setSelectedModelUid] = useState<string>('')
  const [modelsLoading, setModelsLoading] = useState(false)

  const [persona, setPersona] = useState<PersonaSettings | null>(null)
  const [presets, setPresets] = useState<NormalizedPreset[]>(DEFAULT_PRESETS)
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false)
  const [personaSwitching, setPersonaSwitching] = useState(false)

  const [haru, setHaru] = useState<HaruStatusResponse | null>(null)
  const [haruToggling, setHaruToggling] = useState(false)
  const [dictating, setDictating] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [promptInput, setPromptInput] = useState('')
  const [sending, setSending] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const personaMenuRef = useRef<HTMLDivElement | null>(null)

  const fetchCatalog = useCallback(async () => {
    setModelsLoading(true)
    try {
      const res = await ipcJson<ModelsCatalogResponse>('/api/models/catalog')
      if (Array.isArray(res.models) && res.models.length > 0) {
        setModels(res.models)
        setSelectedModelUid((prev) =>
          prev && res.models?.some((m) => m.model_uid === prev)
            ? prev
            : res.models![0].model_uid,
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to load model catalog', 'warning')
    } finally {
      setModelsLoading(false)
    }
  }, [pushToast])

  const fetchPersona = useCallback(async () => {
    try {
      const res = await ipcJson<PersonaApiResponse>('/api/persona')
      const activeSettings = res.settings || res.persona
      if (activeSettings) {
        setPersona(activeSettings)
      }
      if (res.presets) {
        setPresets(normalizePresetsList(res.presets))
      }
    } catch {
      // Gateway may still be warming up
    }
  }, [])

  const fetchHaruStatus = useCallback(async () => {
    try {
      const res = await ipcJson<HaruStatusResponse>('/api/voice/haru/status')
      setHaru(res)
    } catch {
      // Keep prior state if unreachable
    }
  }, [])

  useEffect(() => {
    void Promise.all([fetchCatalog(), fetchPersona(), fetchHaruStatus()])
  }, [fetchCatalog, fetchHaruStatus, fetchPersona])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (!personaMenuOpen) return
    const handleOutside = (event: MouseEvent) => {
      if (personaMenuRef.current && !personaMenuRef.current.contains(event.target as Node)) {
        setPersonaMenuOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPersonaMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [personaMenuOpen])

  const selectedModel = useMemo(
    () => models.find((m) => m.model_uid === selectedModelUid) || null,
    [models, selectedModelUid],
  )

  const handleActivatePersona = useCallback(
    async (presetId: string) => {
      setPersonaSwitching(true)
      try {
        const res = await ipcJson<PersonaActivateResponse>('/api/persona/activate', {
          method: 'POST',
          body: JSON.stringify({ persona_id: presetId }),
        })
        const nextPersona = res.persona || res.settings
        if (res.success && nextPersona) {
          setPersona(nextPersona)
          pushToast(`Persona calibrated: ${formatPresetLabel(presetId)}`, 'success')
        } else {
          pushToast(res.error || 'Failed updating persona', 'error')
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Persona activation error', 'error')
      } finally {
        setPersonaSwitching(false)
        setPersonaMenuOpen(false)
      }
    },
    [pushToast],
  )

  const handleToggleHaru = useCallback(async () => {
    if (haruToggling) return
    setHaruToggling(true)
    const targetEnabled = !(haru?.enabled ?? false)
    try {
      const res = await ipcJson<HaruStatusResponse>('/api/voice/haru/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: targetEnabled }),
      })
      if (res.success === false) {
        pushToast(res.error || 'Haru voice toggle blocked', res.air_gapped ? 'warning' : 'error')
        if (res.status) {
          setHaru(res.status)
        }
      } else {
        const nextStatus = res.status || res
        setHaru(nextStatus)
        pushToast(
          nextStatus.enabled
            ? 'Haru-4B full-duplex voice armed'
            : 'Switched to local Kokoro speech',
          'info',
        )
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to toggle Haru voice', 'error')
    } finally {
      setHaruToggling(false)
    }
  }, [haru?.enabled, haruToggling, pushToast])

  const handleDictate = useCallback(async () => {
    if (dictating) return
    setDictating(true)
    try {
      const res = await ipcJson<DictateResponse>('/api/voice/dictate', {
        method: 'POST',
        body: JSON.stringify({ duration_sec: 4, inject: false }),
      })
      const transcript = (res.cleaned_text || res.raw_text || '').trim()
      if (res.success && transcript) {
        setPromptInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript))
        pushToast(
          `Dictated (${Math.round(res.latency_ms ?? 0)} ms)`,
          'success',
        )
      } else if (res.success) {
        pushToast('No speech captured during 4s dictation window', 'info')
      } else {
        pushToast(res.error || 'Voice dictation failed', 'warning')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Dictation endpoint unreachable', 'error')
    } finally {
      setDictating(false)
    }
  }, [dictating, pushToast])

  const sendPrompt = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim()
      if (!clean || sending) return

      if (telemetry.estopActive) {
        pushToast('E-STOP active — reset safety circuit before dispatching AI prompts', 'error')
        return
      }

      const userMsg: ChatMessage = {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: clean,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      const nextHistory = [...messages, userMsg]
      setMessages(nextHistory)
      setPromptInput('')
      setSending(true)

      try {
        const apiMessages = nextHistory
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }))

        const res = await ipcJson<AiChatResponse>('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({
            prompt: clean,
            messages: apiMessages,
            model: selectedModel?.api_or_hf_id || selectedModel?.model_uid,
            max_tokens: 1024,
          }),
        })

        const replyText = (res.response || res.text || '').trim()
        if (res.success === false || !replyText) {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'error',
              content: res.error || 'No response returned from inference router.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `ast-${Date.now()}`,
              role: 'assistant',
              content: replyText,
              provider: res.provider || selectedModel?.provider_id || 'local',
              model: res.model || selectedModel?.display_name || 'Router',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ])
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'error',
            content: err instanceof Error ? err.message : 'Chat gateway request failed',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ])
      } finally {
        setSending(false)
      }
    },
    [messages, pushToast, selectedModel, sending, telemetry.estopActive],
  )

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
    } catch {
      // Clipboard blocked in restricted headless context
    }
  }, [])

  const activePresetLabel = formatPresetLabel(persona?.active_preset || 'CARING_COMPANION')

  return (
    <div className="h-full w-full overflow-hidden p-6 animate-spatial-enter">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
        {/* Top Floating Controls Bar */}
        <header className="spatial-panel relative z-20 flex flex-wrap items-center justify-between gap-4 rounded-3xl px-5 py-3.5">
          {/* Model Selector */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-emerald-300">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedModelUid}
                onChange={(e) => setSelectedModelUid(e.target.value)}
                aria-label="Select inference model"
                className="rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-100 focus:border-emerald-400/50 focus:outline-none"
              >
                {models.length === 0 ? (
                  <option value="">
                    {modelsLoading ? 'Loading catalog...' : 'Auto LLM Router'}
                  </option>
                ) : (
                  models.map((m) => (
                    <option key={m.model_uid} value={m.model_uid} className="bg-[#0b1016]">
                      {m.display_name} ({m.provider_id})
                    </option>
                  ))
                )}
              </select>

              {selectedModel && (
                <span className="hidden rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-300 sm:inline-flex">
                  {selectedModel.quant_tag || selectedModel.runtime_target}
                </span>
              )}
            </div>
          </div>

          {/* Right Controls: Persona Indicator + Haru Voice + Clear */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Persona Indicator & Switcher */}
            <div ref={personaMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setPersonaMenuOpen((o) => !o)}
                disabled={personaSwitching}
                className="spatial-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-slate-200 cursor-pointer"
              >
                <UserCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>{activePresetLabel}</span>
                {persona && (
                  <span className="hidden font-mono text-[11px] text-slate-400 md:inline">
                    E{persona.empathy_pct}·H{persona.humor_pct}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {personaMenuOpen && (
                <div className="spatial-dock absolute right-0 mt-2 w-60 rounded-2xl p-2 z-30">
                  <div className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Persona Calibration
                  </div>
                  <div className="space-y-1">
                    {presets.map((p) => {
                      const active = normalizePresetKey(persona?.active_preset || '') === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => void handleActivatePersona(p.id)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? 'bg-emerald-500/15 text-emerald-200'
                              : 'text-slate-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span>{p.label}</span>
                          {active && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Haru Voice Toggle */}
            <button
              type="button"
              onClick={() => void handleToggleHaru()}
              disabled={haruToggling}
              title={
                haru?.air_gapped
                  ? 'Haru remote voice blocked in SILENT mode'
                  : haru?.node_url || 'Toggle Haru-4B full-duplex voice'
              }
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                haru?.enabled
                  ? 'spatial-pill-active'
                  : 'spatial-pill text-slate-300'
              }`}
            >
              {haru?.enabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-300" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span>
                {haru?.air_gapped
                  ? 'Haru Air-Gap'
                  : haru?.enabled
                    ? haru.available
                      ? `Haru ${Math.round(haru.latency_ms ?? 0)}ms`
                      : 'Haru Armed'
                    : 'Haru Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void fetchCatalog()}
              aria-label="Refresh model catalog"
              className="spatial-pill rounded-full p-2 text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                aria-label="Clear conversation"
                className="spatial-pill rounded-full p-2 text-slate-400 hover:text-rose-300 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </header>

        {/* Floating Frosted Chat Stream */}
        <main className="spatial-panel flex-1 min-h-0 overflow-y-auto rounded-3xl p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-emerald-400/25 bg-emerald-500/10 mint-glow">
                <Sparkles className="h-7 w-7 text-emerald-300" />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-100">
                Nexus Spatial Dialogue
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                Routed locally via <span className="text-slate-200">{selectedModel?.display_name || 'Sovereign LLM Mesh'}</span>{' '}
                with <span className="text-emerald-300">{activePresetLabel}</span> calibration.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                {[
                  'Summarize current workspace architecture',
                  'Draft a deterministic verification checklist',
                  'Explain SQLite WAL telemetry latency',
                ].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void sendPrompt(starter)}
                    className="spatial-pill rounded-full px-4 py-2 text-xs text-slate-300 cursor-pointer"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[78%] rounded-3xl rounded-br-lg border border-emerald-400/25 bg-emerald-500/12 px-5 py-3.5 text-sm leading-relaxed text-slate-100">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <div className="mt-2 text-right font-mono text-[10px] text-emerald-300/75">
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  )
                }

                if (msg.role === 'error') {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="max-w-[82%] rounded-3xl rounded-bl-lg border border-rose-400/30 bg-rose-500/10 px-5 py-3.5 text-sm text-rose-100">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        <div className="mt-1.5 font-mono text-[10px] text-rose-300/80">
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="group max-w-[84%] rounded-3xl rounded-bl-lg border border-white/10 bg-white/[0.04] px-5 py-4 text-sm leading-relaxed text-slate-100">
                      <div className="mb-2 flex items-center justify-between gap-4 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1.5 font-mono text-emerald-300">
                          <Radio className="h-3 w-3" />
                          {msg.model || 'Nexus'} · {msg.provider || 'local'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(msg.id, msg.content)}
                          aria-label="Copy response"
                          className="rounded-lg p-1 text-slate-400 opacity-70 transition-opacity hover:text-slate-100 group-hover:opacity-100 cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className="mt-2 font-mono text-[10px] text-slate-500">
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                )
              })}

              {sending && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2.5 rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3 text-xs text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    Synthesizing response...
                  </div>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>
          )}
        </main>

        {/* Bottom Floating Composer Dock */}
        <footer className="spatial-dock rounded-3xl p-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void sendPrompt(promptInput)
            }}
            className="flex items-end gap-3"
          >
            <button
              type="button"
              onClick={() => void handleDictate()}
              disabled={dictating}
              title="Capture 4s microphone dictation via faster-whisper"
              className={`flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-xs font-medium transition-all cursor-pointer ${
                dictating
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 animate-mint-breathe'
                  : 'spatial-pill text-slate-300'
              }`}
            >
              {dictating ? (
                <>
                  <Mic className="h-4 w-4 text-emerald-300 animate-pulse" />
                  <span>Listening</span>
                </>
              ) : (
                <>
                  <MicOff className="h-4 w-4 text-slate-400" />
                  <span className="hidden sm:inline">Dictate</span>
                </>
              )}
            </button>

            <textarea
              rows={1}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendPrompt(promptInput)
                }
              }}
              placeholder="Ask Nexus anything — Shift+Enter for new line..."
              className="max-h-36 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/50 focus:outline-none"
            />

            <button
              type="submit"
              disabled={sending || !promptInput.trim()}
              className="spatial-pill-active flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-5 text-sm font-medium cursor-pointer disabled:opacity-45"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </footer>
      </div>
    </div>
  )
}

export default ChatView
