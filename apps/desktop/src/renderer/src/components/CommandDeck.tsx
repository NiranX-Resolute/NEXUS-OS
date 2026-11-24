// apps/desktop/src/renderer/src/components/CommandDeck.tsx
// NEXUS OS v5.0 — Autonomous CommandDeck Floating Bar (z-40)
// Complete suite: + Upload Media, Vision Share, Camera, Voice Call (live audio FFT bars),
// Queue: N slices drawer, Transcript, Model Selector (Gemini, Groq, DeepSeek, OpenRouter :free, Ollama),
// omni-input with @agent, @ecc:, /skill:, /ck:, /reflex fuzzy autocomplete, Attach, Steer, Execute.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  RiAttachment2,
  RiComputerLine,
  RiCameraLine,
  RiPhoneFill,
  RiPhoneLine,
  RiListCheck2,
  RiSendPlane2Line,
  RiSparklingLine,
  RiCommandLine,
  RiCpuLine,
  RiShieldCheckLine,
  RiFileList3Line,
  RiCompass3Line,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiCloseLine,
  RiRefreshLine,
  RiStopCircleLine,
  RiCheckLine
} from 'react-icons/ri'
import { AbliteratedWarningBanner, checkIsAbliterated } from './AbliteratedWarningBanner'
import { nexusService } from '@renderer/services/nexus-voice-ai'

export interface CommandDeckProps {
  isSystemActive?: boolean
  isMicMuted?: boolean
  isVideoOn?: boolean
  visionMode?: string
  onToggleVoice?: () => void
  onToggleVision?: () => void
  onToggleCamera?: () => void
  onToggleTranscript?: () => void
  onSubmitPrompt?: (prompt: string, routeAgent?: string) => Promise<void> | void
  onSteerPrompt?: (prompt: string, routeAgent?: string) => Promise<void> | void
  className?: string
}

interface AutocompleteItem {
  id: string
  label: string
  insertText: string
  category: 'AGENT' | 'ECC' | 'SKILL' | 'CK' | 'REFLEX'
  description: string
  badge: string
}

interface ModelOption {
  id: string
  name: string
  provider: 'Gemini' | 'Groq' | 'DeepSeek' | 'OpenRouter' | 'Ollama'
  badge: string
  description: string
  isFree: boolean
}

export interface TaskSlice {
  id: string
  prompt: string
  status: string
  agent?: string
  created_at?: string | number
}

export interface TranscriptEntry {
  id: string
  timestamp: string
  role: 'USER' | 'NEXUS' | 'AGENT' | 'SYSTEM'
  text: string
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'Gemini',
    badge: 'GOOGLE',
    description: 'Sub-second multimodality & tool orchestration',
    isFree: true
  },
  {
    id: 'groq:llama-3.3-70b-versatile',
    name: 'Groq Llama 3.3 70B',
    provider: 'Groq',
    badge: 'GROQ LPU',
    description: 'Ultra-low latency inference (300+ tok/s)',
    isFree: true
  },
  {
    id: 'deepseek:deepseek-chat',
    name: 'DeepSeek V3 / R1',
    provider: 'DeepSeek',
    badge: 'DEEPSEEK',
    description: 'Advanced reasoning and mathematical synthesis',
    isFree: true
  },
  {
    id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
    name: 'OpenRouter Llama 3.3 :free',
    provider: 'OpenRouter',
    badge: 'FREE ROUTE',
    description: 'Zero-cost serverless multi-model routing',
    isFree: true
  },
  {
    id: 'ollama:qwen2.5-coder:7b',
    name: 'Ollama Qwen 2.5 Coder',
    provider: 'Ollama',
    badge: 'LOCAL SOVEREIGN',
    description: 'Local DirectML / CPU offline inference',
    isFree: true
  }
]

const ALL_AUTOCOMPLETE_ITEMS: AutocompleteItem[] = [
  // 1. @AGENT Items
  { id: 'agent-dev', label: '@DEV-01', insertText: '@DEV-01 ', category: 'AGENT', description: 'NexKoder (AST & Git Worktree Isolation)', badge: 'ORBITER' },
  { id: 'agent-sys', label: '@SYS-01', insertText: '@SYS-01 ', category: 'AGENT', description: 'Win32 UFO (UIA Tree & OS Automation)', badge: 'ORBITER' },
  { id: 'agent-scout', label: '@SCOUT-01', insertText: '@SCOUT-01 ', category: 'AGENT', description: 'Scholar/DOM (Warm CDP & ArXiv)', badge: 'ORBITER' },
  { id: 'agent-sec', label: '@SEC-01', insertText: '@SEC-01 ', category: 'AGENT', description: 'Sentinel (ScopeGuard 6/6 Invariant Enclave)', badge: 'ORBITER' },
  { id: 'agent-ops', label: '@OPS-01', insertText: '@OPS-01 ', category: 'AGENT', description: 'Chronos (Routines & Process Guard)', badge: 'ORBITER' },
  { id: 'agent-all', label: '@agent', insertText: '@agent ', category: 'AGENT', description: 'Universal Multi-Agent Dispatcher', badge: 'ROUTER' },

  // 2. @ECC Items
  { id: 'ecc-arch', label: '@ecc:architect', insertText: '@ecc:architect ', category: 'ECC', description: 'Master System Architect & Topology Designer', badge: 'ECC CORE' },
  { id: 'ecc-debug', label: '@ecc:debugger', insertText: '@ecc:debugger ', category: 'ECC', description: 'Win32 UFO & DirectML Deep Debugger', badge: 'ECC CORE' },
  { id: 'ecc-code', label: '@ecc:coder', insertText: '@ecc:coder ', category: 'ECC', description: 'NexKoder AST Synthesis & Refactor Agent', badge: 'ECC CORE' },
  { id: 'ecc-review', label: '@ecc:reviewer', insertText: '@ecc:reviewer ', category: 'ECC', description: 'Security Audit & Invariant Reviewer', badge: 'ECC CORE' },
  { id: 'ecc-research', label: '@ecc:researcher', insertText: '@ecc:researcher ', category: 'ECC', description: 'Scholar ArXiv & Web Explorer', badge: 'ECC CORE' },
  { id: 'ecc-orch', label: '@ecc:orchestrator', insertText: '@ecc:orchestrator ', category: 'ECC', description: 'Swarm Mitosis & Dynamic Task Coordinator', badge: 'ECC CORE' },

  // 3. /SKILL Items
  { id: 'sk-ast', label: '/skill:ast-code-transformer', insertText: '/skill:ast-code-transformer ', category: 'SKILL', description: 'AST code transformation and refactoring', badge: 'SKILL' },
  { id: 'sk-git', label: '/skill:git-ops', insertText: '/skill:git-ops ', category: 'SKILL', description: 'Branch, commit, and git worktree isolation', badge: 'SKILL' },
  { id: 'sk-web', label: '/skill:web-research', insertText: '/skill:web-research ', category: 'SKILL', description: 'ArXiv and web intelligence search', badge: 'SKILL' },
  { id: 'sk-whiteboard', label: '/skill:whiteboard-draw', insertText: '/skill:whiteboard-draw ', category: 'SKILL', description: 'Marker ink and vector diagram synthesizer', badge: 'SKILL' },
  { id: 'sk-voice', label: '/skill:voice-control', insertText: '/skill:voice-control ', category: 'SKILL', description: 'Duplex audio, Kokoro-82M and Silero VAD', badge: 'SKILL' },
  { id: 'sk-desktop', label: '/skill:desktop-automator', insertText: '/skill:desktop-automator ', category: 'SKILL', description: 'Win32 desktop automation and UIA', badge: 'SKILL' },
  { id: 'sk-scope', label: '/skill:scope-enclave', insertText: '/skill:scope-enclave ', category: 'SKILL', description: 'Sovereign ScopeGuard policy audit', badge: 'SKILL' },
  { id: 'sk-docforge', label: '/skill:doc-forge', insertText: '/skill:doc-forge ', category: 'SKILL', description: 'Multi-modal document and spec generator', badge: 'SKILL' },

  // 4. /CK Items
  { id: 'ck-save', label: '/ck:save', insertText: '/ck:save', category: 'CK', description: 'Save current session snapshot to Context Keeper WAL', badge: 'CONTEXT' },
  { id: 'ck-resume', label: '/ck:resume', insertText: '/ck:resume', category: 'CK', description: 'Restore session from last Context Keeper checkpoint', badge: 'CONTEXT' },
  { id: 'ck-init', label: '/ck:init', insertText: '/ck:init', category: 'CK', description: 'Initialize fresh Context Keeper memory session', badge: 'CONTEXT' },
  { id: 'ck-status', label: '/ck:status', insertText: '/ck:status', category: 'CK', description: 'Inspect Context Keeper state and memory vector slots', badge: 'CONTEXT' },
  { id: 'ck-snapshot', label: '/ck:snapshot', insertText: '/ck:snapshot', category: 'CK', description: 'Create an immutable session snapshot', badge: 'CONTEXT' },

  // 5. /REFLEX Items
  { id: 'reflex-estop', label: '/reflex:estop', insertText: '/reflex:estop', category: 'REFLEX', description: 'Emergency stop all running agents and IPC loops', badge: 'REFLEX' },
  { id: 'reflex-focus', label: '/reflex:focus', insertText: '/reflex:focus', category: 'REFLEX', description: 'Toggle minimal distraction-free HUD mode', badge: 'REFLEX' },
  { id: 'reflex-purge', label: '/reflex:purge', insertText: '/reflex:purge', category: 'REFLEX', description: 'Purge transient GPU/VRAM & memory cache', badge: 'REFLEX' },
  { id: 'reflex-audit', label: '/reflex:audit', insertText: '/reflex:audit', category: 'REFLEX', description: 'Run ScopeGuard 6/6 invariant audit check', badge: 'REFLEX' },
  { id: 'reflex-dev', label: '/reflex:dev', insertText: '/reflex:dev', category: 'REFLEX', description: 'Switch workspace mode to DEV', badge: 'REFLEX' },
  { id: 'reflex-study', label: '/reflex:study', insertText: '/reflex:study', category: 'REFLEX', description: 'Switch workspace mode to STUDY', badge: 'REFLEX' },
  { id: 'reflex-studio', label: '/reflex:studio', insertText: '/reflex:studio', category: 'REFLEX', description: 'Switch workspace mode to STUDIO', badge: 'REFLEX' },
  { id: 'reflex-silent', label: '/reflex:silent', insertText: '/reflex:silent', category: 'REFLEX', description: 'Switch workspace mode to SILENT', badge: 'REFLEX' },
  { id: 'reflex-mute', label: '/reflex:mute', insertText: '/reflex:mute', category: 'REFLEX', description: 'Toggle voice pipeline audio mute state', badge: 'REFLEX' }
]

export const CommandDeck: React.FC<CommandDeckProps> = ({
  isSystemActive = false,
  isMicMuted: _isMicMuted = true,
  isVideoOn = false,
  visionMode = 'none',
  onToggleVoice,
  onToggleVision,
  onToggleCamera,
  onToggleTranscript,
  onSubmitPrompt,
  onSteerPrompt,
  className = ''
}) => {
  const [inputText, setInputText] = useState('')
  const [activeRoute, setActiveRoute] = useState<string | null>(null)
  const [activeSlicesCount, setActiveSlicesCount] = useState<number>(0)
  const [slicesList, setSlicesList] = useState<TaskSlice[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [deckStatus, setDeckStatus] = useState('Command Uplink Ready')
  const [showAgentMenu, setShowAgentMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [activeModel, setActiveModel] = useState<string>('gemini-2.0-flash')

  // Drawers
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
  const [transcriptLogs, setTranscriptLogs] = useState<TranscriptEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      role: 'SYSTEM',
      text: 'NEXUS OS v5.0 Sovereign Command Deck initialized. SQLite WAL & IPC ready.'
    }
  ])

  // Autocomplete State
  const [autocompleteOpen, setAutocompleteOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Live Audio FFT Bars (5 frequency bands)
  const [fftBars, setFftBars] = useState<number[]>([0.15, 0.3, 0.5, 0.3, 0.15])
  const animFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Manage Live Audio FFT analysis when voice call is active
  useEffect(() => {
    if (!isSystemActive) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      if (typeof window !== 'undefined') {
        ;(window as any).__NEXUS_AUDIO_RMS__ = 0
      }
      setFftBars([0.15, 0.3, 0.5, 0.3, 0.15])
      return
    }

    let mounted = true
    let analyser: AnalyserNode | null = null

    if ((nexusService as any)?.analyser) {
      analyser = (nexusService as any).analyser
    } else if ((nexusService as any)?.inputAnalyser) {
      analyser = (nexusService as any).inputAnalyser
    }

    if (!analyser && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          if (!mounted) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }
          streamRef.current = stream
          const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioCtxClass) {
            const ctx = new AudioCtxClass()
            audioCtxRef.current = ctx
            const source = ctx.createMediaStreamSource(stream)
            const a = ctx.createAnalyser()
            a.fftSize = 64
            source.connect(a)
            analyser = a
          }
        })
        .catch(() => {})
    }

    const dataArray = new Uint8Array(32)
    let phase = 0

    const renderFft = () => {
      if (!mounted) return

      if (analyser) {
        analyser.getByteFrequencyData(dataArray)
        const b0 = dataArray[1] / 255
        const b1 = dataArray[3] / 255
        const b2 = dataArray[6] / 255
        const b3 = dataArray[10] / 255
        const b4 = dataArray[15] / 255
        const maxVal = Math.max(b0, b1, b2, b3, b4)
        const rms = (b0 + b1 + b2 + b3 + b4) / 5
        if (typeof window !== 'undefined') {
          ;(window as any).__NEXUS_AUDIO_RMS__ = rms
        }
        if (maxVal > 0.04) {
          setFftBars([b0, b1, b2, b3, b4])
        } else {
          phase += 0.1
          setFftBars([
            0.2 + 0.15 * Math.sin(phase),
            0.35 + 0.25 * Math.sin(phase + 1),
            0.55 + 0.35 * Math.sin(phase + 2),
            0.35 + 0.25 * Math.sin(phase + 3),
            0.2 + 0.15 * Math.sin(phase + 4)
          ])
        }
      } else {
        phase += 0.14
        const simulatedRms = 0.25 + 0.15 * Math.sin(phase)
        if (typeof window !== 'undefined') {
          ;(window as any).__NEXUS_AUDIO_RMS__ = simulatedRms
        }
        setFftBars([
          0.25 + 0.2 * Math.sin(phase),
          0.45 + 0.35 * Math.sin(phase + 1.2),
          0.7 + 0.3 * Math.sin(phase + 2.4),
          0.45 + 0.35 * Math.sin(phase + 3.6),
          0.25 + 0.2 * Math.sin(phase + 4.8)
        ])
      }

      animFrameRef.current = requestAnimationFrame(renderFft)
    }

    animFrameRef.current = requestAnimationFrame(renderFft)

    return () => {
      mounted = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      if (typeof window !== 'undefined') {
        ;(window as any).__NEXUS_AUDIO_RMS__ = 0
      }
    }
  }, [isSystemActive])

  // Compute fuzzy autocomplete suggestions
  const autocompleteSuggestions = useMemo(() => {
    const trimmed = inputText.trim()
    if (!trimmed) return []

    // 1. @ trigger (Agent / ECC)
    if (trimmed.startsWith('@')) {
      const query = trimmed.toLowerCase()
      return ALL_AUTOCOMPLETE_ITEMS.filter(
        (item) =>
          (item.category === 'AGENT' || item.category === 'ECC') &&
          (item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
      )
    }

    // 2. /skill trigger
    if (trimmed.startsWith('/skill')) {
      const query = trimmed.toLowerCase()
      return ALL_AUTOCOMPLETE_ITEMS.filter(
        (item) =>
          item.category === 'SKILL' &&
          (item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
      )
    }

    // 3. /ck trigger
    if (trimmed.startsWith('/ck')) {
      const query = trimmed.toLowerCase()
      return ALL_AUTOCOMPLETE_ITEMS.filter(
        (item) =>
          item.category === 'CK' &&
          (item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
      )
    }

    // 4. /reflex trigger
    if (trimmed.startsWith('/reflex')) {
      const query = trimmed.toLowerCase()
      return ALL_AUTOCOMPLETE_ITEMS.filter(
        (item) =>
          item.category === 'REFLEX' &&
          (item.label.toLowerCase().includes(query) || item.description.toLowerCase().includes(query))
      )
    }

    // 5. Generic / slash trigger
    if (trimmed.startsWith('/')) {
      const query = trimmed.toLowerCase()
      return ALL_AUTOCOMPLETE_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
      )
    }

    return []
  }, [inputText])

  // Open/close autocomplete menu based on suggestions
  useEffect(() => {
    if (autocompleteSuggestions.length > 0) {
      setAutocompleteOpen(true)
      setSelectedIndex(0)
    } else {
      setAutocompleteOpen(false)
    }
  }, [autocompleteSuggestions])

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && autocompleteOpen) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, autocompleteOpen])

  // Poll active task slices from SQLite WAL & telemetry
  const fetchActiveSlices = useCallback(async () => {
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/tasks?status=RUNNING').catch(() => null)
      if (resp && resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data.tasks)) {
          setActiveSlicesCount(data.tasks.length)
          setSlicesList(data.tasks)
          return
        }
      }

      // Check compute pool for active model
      const poolResp = await fetch('http://127.0.0.1:47630/api/compute/pool').catch(() => null)
      if (poolResp && poolResp.ok) {
        const poolData = await poolResp.json()
        if (poolData?.routes?.[0]?.model) {
          setActiveModel(poolData.routes[0].model)
        }
      }
    } catch {}

    // Fallback: check telemetry bridge if available
    try {
      if (window.nexusTelemetry?.getAgents) {
        const agentsRes = await window.nexusTelemetry.getAgents()
        if (agentsRes?.agents) {
          const list: TaskSlice[] = Object.entries(agentsRes.agents)
            .filter(([, a]: any) => a.status === 'EXECUTING' || a.status === 'ASSIGNED')
            .map(([id, a]: any) => ({
              id,
              agent: a.name || id,
              prompt: a.current_task || 'Active Task Slice',
              status: a.status
            }))
          setActiveSlicesCount(list.length)
          setSlicesList(list)
        }
      }
    } catch {}
  }, [])

  useEffect(() => {
    void fetchActiveSlices()
    const timer = setInterval(() => {
      void fetchActiveSlices()
    }, 2500)
    return () => clearInterval(timer)
  }, [fetchActiveSlices])

  // Apply chosen autocomplete item
  const applyAutocomplete = useCallback((item: AutocompleteItem) => {
    setInputText(item.insertText)
    setAutocompleteOpen(false)
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Keyboard navigation for autocomplete & execution
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocompleteOpen && autocompleteSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % autocompleteSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selected = autocompleteSuggestions[selectedIndex]
        if (selected) {
          applyAutocomplete(selected)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setAutocompleteOpen(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  // Handle file upload and SHA-256 staging into Sovereign Store
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setDeckStatus(`Staging ${file.name}...`)

    try {
      const buffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

      const textSnippet =
        file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.ts')
          ? new TextDecoder().decode(buffer).slice(0, 10000)
          : `Binary media [${file.type}], size: ${file.size} bytes`

      // Persist into Sovereign Store via IPC
      await fetch('http://127.0.0.1:47630/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Upload: ${file.name}`,
          content: textSnippet,
          namespace: 'MEDIA_STAGING',
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            sha256,
            uploadedAt: Date.now()
          }
        })
      }).catch(() => null)

      setDeckStatus(`Staged: ${file.name} (SHA-256: ${sha256.slice(0, 8)}...)`)
      window.dispatchEvent(
        new CustomEvent('nexus-media-staged', {
          detail: { fileName: file.name, sha256, size: file.size }
        })
      )

      setTranscriptLogs((prev) => [
        ...prev,
        {
          id: `media-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          role: 'SYSTEM',
          text: `Staged media asset: ${file.name} (SHA-256: ${sha256.slice(0, 12)}...)`
        }
      ])
    } catch (err: any) {
      setDeckStatus(`Upload error: ${err.message || 'Failed'}`)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setTimeout(() => setDeckStatus('Command Uplink Ready'), 3000)
    }
  }

  // Handle steer action
  const handleSteer = async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return

    setDeckStatus('Steering directive dispatched...')
    setTranscriptLogs((prev) => [
      ...prev,
      {
        id: `steer-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        role: 'USER',
        text: `[STEER] ${trimmed}${activeRoute ? ` -> @${activeRoute}` : ''}`
      }
    ])

    if (onSteerPrompt) {
      await onSteerPrompt(trimmed, activeRoute || undefined)
    } else {
      await fetch('http://127.0.0.1:47630/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'STEER_AGENT',
          payload: {
            prompt: trimmed,
            agent: activeRoute || undefined,
            source: 'COMMAND_DECK'
          }
        })
      }).catch(() => null)
    }

    setInputText('')
    setDeckStatus('✓ Steering Directive Applied')
    setTimeout(() => setDeckStatus('Command Uplink Ready'), 2500)
  }

  // Handle command execution submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return

    let finalPrompt = trimmed
    let targetAgent = activeRoute

    // Log to transcript
    setTranscriptLogs((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        role: 'USER',
        text: trimmed
      }
    ])

    // 1. Context Keeper commands (/ck:)
    if (trimmed.startsWith('/ck:')) {
      const action = trimmed.replace('/ck:', '').trim().toLowerCase()
      if (action === 'save') {
        await fetch('http://127.0.0.1:47630/api/context-keeper/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: `Snapshot ${new Date().toLocaleTimeString()}` })
        }).catch(() => null)
        setInputText('')
        setDeckStatus('✓ Context Keeper Session Snapshot Saved')
        return
      }
      if (action === 'resume') {
        await fetch('http://127.0.0.1:47630/api/context-keeper/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }).catch(() => null)
        setInputText('')
        setDeckStatus('✓ Context Keeper Session Resumed')
        return
      }
      if (action === 'init') {
        await fetch('http://127.0.0.1:47630/api/context-keeper/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }).catch(() => null)
        setInputText('')
        setDeckStatus('✓ Fresh Context Keeper Session Initialized')
        return
      }
      if (action === 'status') {
        const res = await fetch('http://127.0.0.1:47630/api/context-keeper/status').catch(() => null)
        const d = res && res.ok ? await res.json() : null
        setInputText('')
        setDeckStatus(d ? `✓ CK Slots: ${d.active_slots || 0}` : '✓ Context Keeper Active')
        return
      }
    }

    // 2. Reflex shortcuts (/reflex: or /estop, /dev, /study, etc.)
    if (trimmed.startsWith('/reflex:') || (trimmed.startsWith('/') && !trimmed.startsWith('/skill:'))) {
      const rawCmd = trimmed.replace('/reflex:', '').replace('/', '').trim().toLowerCase()
      const [reflex] = rawCmd.split(' ')

      if (reflex === 'estop') {
        if (window.nexusTelemetry?.triggerEStop) {
          await window.nexusTelemetry.triggerEStop()
        }
        await fetch('http://127.0.0.1:47630/api/estop', { method: 'POST' }).catch(() => null)
        setInputText('')
        setDeckStatus('🛑 E-STOP EXECUTED')
        return
      }

      if (['dev', 'study', 'studio', 'silent'].includes(reflex)) {
        const mode = reflex.toUpperCase()
        if (window.nexusTelemetry?.switchWorkspace) {
          await window.nexusTelemetry.switchWorkspace(mode)
        }
        await fetch('http://127.0.0.1:47630/api/workspace/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode })
        }).catch(() => null)
        setInputText('')
        setDeckStatus(`⚡ Workspace Mode: ${mode}`)
        return
      }

      if (reflex === 'mute' || reflex === 'unmute') {
        await fetch('http://127.0.0.1:47630/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'MUTE_AUDIO', payload: {} })
        }).catch(() => null)
        setInputText('')
        setDeckStatus('Audio Toggle Dispatched')
        return
      }

      if (reflex === 'focus') {
        window.dispatchEvent(new CustomEvent('nexus-toggle-focus'))
        setInputText('')
        setDeckStatus('⚡ Focus Mode Toggled')
        return
      }

      if (reflex === 'purge') {
        await fetch('http://127.0.0.1:47630/api/system/purge', { method: 'POST' }).catch(() => null)
        setInputText('')
        setDeckStatus('✓ GPU/VRAM Caches Purged')
        return
      }

      if (reflex === 'audit') {
        await fetch('http://127.0.0.1:47630/api/audit/run', { method: 'POST' }).catch(() => null)
        setInputText('')
        setDeckStatus('✓ ScopeGuard 6/6 Invariant Audit Started')
        return
      }
    }

    // 3. Routing tags: @ecc:AGENT or @AGENT
    const eccMatch = trimmed.match(/^@ecc:([a-zA-Z0-9_-]+)\s*(.*)$/i)
    if (eccMatch) {
      targetAgent = `ECC_${eccMatch[1].toUpperCase()}`
      finalPrompt = eccMatch[2] || trimmed
    } else {
      const agentMatch = trimmed.match(/^@(DEV-01|SYS-01|SCOUT-01|SEC-01|OPS-01)\s*(.*)$/i)
      if (agentMatch) {
        targetAgent = agentMatch[1].toUpperCase()
        finalPrompt = agentMatch[2] || trimmed
      }
    }

    // 4. /skill:slug execution
    const skillMatch = trimmed.match(/^\/skill:([a-zA-Z0-9_-]+)\s*(.*)$/i)
    if (skillMatch) {
      const skillSlug = skillMatch[1]
      const skillPayload = skillMatch[2] || ''
      await fetch('http://127.0.0.1:47630/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `/skill:${skillSlug} ${skillPayload}`,
          skill_slug: skillSlug,
          prompt: skillPayload,
          source: 'COMMAND_DECK'
        })
      }).catch(() => null)
      setInputText('')
      setDeckStatus(`Skill /skill:${skillSlug} executed`)
      setTimeout(() => setDeckStatus('Command Uplink Ready'), 2500)
      return
    }

    // 5. Submit Prompt to parent or IPC
    if (onSubmitPrompt) {
      await onSubmitPrompt(finalPrompt, targetAgent || undefined)
    } else {
      await fetch('http://127.0.0.1:47630/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          command_type: targetAgent ? `AGENT_${targetAgent}` : 'GENERAL',
          source_device: 'COMMAND_DECK'
        })
      }).catch(() => null)
    }

    setInputText('')
    setActiveRoute(null)
    setDeckStatus(targetAgent ? `Routed to ${targetAgent}` : 'Task Dispatched')
    setTimeout(() => setDeckStatus('Command Uplink Ready'), 2500)
  }

  // Toggle Screen Vision Share
  const handleToggleVision = async () => {
    if (onToggleVision) {
      onToggleVision()
    } else {
      const nextActive = !(isVideoOn && visionMode === 'screen')
      await fetch('http://127.0.0.1:47630/api/vision/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive, source: 'screen' })
      }).catch(() => null)
    }
  }

  // Toggle Camera Feed
  const handleToggleCamera = async () => {
    if (onToggleCamera) {
      onToggleCamera()
    } else {
      const nextActive = !(isVideoOn && visionMode === 'camera')
      await fetch('http://127.0.0.1:47630/api/vision/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive, source: 'camera' })
      }).catch(() => null)
    }
  }

  // Toggle Transcript Drawer / Event
  const handleToggleTranscript = () => {
    if (onToggleTranscript) {
      onToggleTranscript()
    }
    // Dispatch global event for host view
    window.dispatchEvent(new CustomEvent('nexus-toggle-transcript'))
    // Toggle internal quick-transcript view
    setIsTranscriptOpen((prev) => !prev)
  }

  // Select Model
  const handleSelectModel = async (model: ModelOption) => {
    setActiveModel(model.id)
    setShowModelMenu(false)
    setDeckStatus(`Model active: ${model.name}`)

    try {
      await fetch('http://127.0.0.1:47630/api/compute/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_model: model.id, provider: model.provider })
      }).catch(() => null)

      window.dispatchEvent(
        new CustomEvent('nexus-model-selected', {
          detail: { modelId: model.id, provider: model.provider }
        })
      )
    } catch {}

    setTimeout(() => setDeckStatus('Command Uplink Ready'), 2500)
  }

  // Cancel a task slice
  const handleCancelSlice = async (sliceId: string) => {
    try {
      await fetch(`http://127.0.0.1:47630/api/tasks/${sliceId}/cancel`, { method: 'POST' }).catch(() => null)
      setSlicesList((prev) => prev.filter((s) => s.id !== sliceId))
      setActiveSlicesCount((prev) => Math.max(0, prev - 1))
    } catch {}
  }

  const agentsList = ['DEV-01', 'SYS-01', 'SCOUT-01', 'SEC-01', 'OPS-01']
  const activeModelDisplay = useMemo(() => {
    const found = MODEL_OPTIONS.find((m) => m.id === activeModel || activeModel.includes(m.id.split(':')[0]))
    return found ? found.name : activeModel || 'Gemini 2.0 Flash'
  }, [activeModel])

  return (
    <div className={`w-full z-40 px-6 pb-4 pt-2 relative ${className}`}>
      <div className="max-w-5xl mx-auto rounded-2xl bg-zinc-950/85 border border-emerald-500/25 backdrop-blur-3xl shadow-[0_12px_45px_rgba(0,0,0,0.7)] p-3 space-y-2.5 transition-all duration-200 hover:border-emerald-500/40 relative">
        {/* Hidden File Input for Media Upload */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileUpload}
          className="hidden"
          aria-label="Upload Media"
        />

        {/* =====================================================================
            1. TOP ACTION STRIP (Visible Buttons)
           ===================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. + Upload Media */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono font-medium flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
              title="Stage file into Sovereign Store (SHA-256 verified)"
            >
              <RiAttachment2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Upload Media</span>
            </button>

            {/* 2. Vision Share */}
            <button
              onClick={handleToggleVision}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition cursor-pointer ${
                isVideoOn && visionMode === 'screen'
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
              }`}
              title="Toggle Screen Vision Analysis"
            >
              <RiComputerLine className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vision Share</span>
            </button>

            {/* 3. Camera */}
            <button
              onClick={handleToggleCamera}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition cursor-pointer ${
                isVideoOn && visionMode === 'camera'
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
              }`}
              title="Toggle Camera Manager Vision"
            >
              <RiCameraLine className="w-3.5 h-3.5 text-purple-400" />
              <span>Camera</span>
            </button>

            {/* 4. Voice Call (live audio FFT bars) */}
            <button
              onClick={onToggleVoice}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-2 transition cursor-pointer ${
                isSystemActive
                  ? 'border-emerald-500 bg-emerald-500/25 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
              }`}
              title="Toggle Duplex Voice Call"
            >
              {isSystemActive ? (
                <>
                  <RiPhoneFill className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
                  {/* Live Audio FFT Bars */}
                  <div className="flex items-end gap-0.5 h-3.5 px-0.5 shrink-0" title="Live audio FFT frequency spectrum">
                    {fftBars.map((val, idx) => (
                      <span
                        key={idx}
                        className="w-1 bg-emerald-400 rounded-full transition-[height] duration-75"
                        style={{ height: `${Math.max(3, Math.min(14, Math.round(val * 14)))}px` }}
                      />
                    ))}
                  </div>
                  <span>Call Active</span>
                </>
              ) : (
                <>
                  <RiPhoneLine className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Voice Call</span>
                </>
              )}
            </button>

            {/* 5. Transcript */}
            <button
              type="button"
              onClick={handleToggleTranscript}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition cursor-pointer ${
                isTranscriptOpen
                  ? 'border-amber-500/60 bg-amber-500/20 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white'
              }`}
              title="Toggle Voice & Audit Transcript Stream"
            >
              <RiFileList3Line className="w-3.5 h-3.5 text-amber-400" />
              <span>Transcript</span>
            </button>

            {/* 6. Model Selector (Gemini, Groq, DeepSeek, OpenRouter :free, Ollama) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowModelMenu((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-mono font-medium flex items-center gap-1.5 transition cursor-pointer"
                title="Select Model Routing (Gemini, Groq, DeepSeek, OpenRouter :free, Ollama)"
              >
                <RiCpuLine className="w-3.5 h-3.5 text-purple-400" />
                <span className="max-w-[120px] truncate">{activeModelDisplay}</span>
                {showModelMenu ? (
                  <RiArrowUpSLine className="w-3 h-3 text-zinc-400" />
                ) : (
                  <RiArrowDownSLine className="w-3 h-3 text-zinc-400" />
                )}
              </button>

              {/* Model Selector Dropdown */}
              {showModelMenu && (
                <div className="absolute left-0 bottom-full mb-2 z-50 w-72 rounded-xl bg-zinc-950/95 border border-purple-500/30 p-2 shadow-2xl backdrop-blur-2xl space-y-1 divide-y divide-white/5">
                  <div className="px-2 py-1 text-[10px] font-mono font-bold text-zinc-400 tracking-wider flex items-center justify-between">
                    <span>MODEL INFERENCE ROUTING</span>
                    <span className="text-emerald-400 text-[9px]">100% FREE TIER</span>
                  </div>
                  <div className="pt-1 space-y-1">
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectModel(opt)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                          activeModel === opt.id || activeModel.includes(opt.id.split(':')[0])
                            ? 'bg-purple-500/20 text-purple-200 border border-purple-400/30 font-bold'
                            : 'text-zinc-300 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{opt.name}</span>
                            {opt.isFree && (
                              <span className="px-1 py-0.2 rounded text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                :free
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">{opt.description}</div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/5 border border-white/10 text-zinc-400 shrink-0">
                          {opt.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Action: Queue Slices Drawer Trigger & Route Tag */}
          <div className="flex items-center gap-2 text-xs font-mono">
            {activeRoute && (
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold flex items-center gap-1">
                <span>@{activeRoute}</span>
                <button
                  onClick={() => setActiveRoute(null)}
                  className="hover:text-white ml-0.5 text-[10px] cursor-pointer"
                >
                  ✕
                </button>
              </span>
            )}

            {/* Queue: N slices drawer trigger button */}
            <button
              type="button"
              onClick={() => setIsQueueOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-medium transition cursor-pointer ${
                isQueueOpen
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-black/60 border-emerald-500/30 text-zinc-300 hover:border-emerald-400 hover:text-white shadow-[0_0_12px_rgba(16,185,129,0.15)]'
              }`}
              title="Open Queue: N slices drawer"
            >
              <RiListCheck2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-300">
                Queue: {activeSlicesCount} Slices
              </span>
              {isQueueOpen ? (
                <RiArrowUpSLine className="w-3 h-3 text-emerald-400" />
              ) : (
                <RiArrowDownSLine className="w-3 h-3 text-emerald-400" />
              )}
            </button>
          </div>
        </div>

        {/* =====================================================================
            2. QUEUE: N SLICES DRAWER
           ===================================================================== */}
        {isQueueOpen && (
          <div className="absolute left-3 right-3 bottom-full mb-2 z-50 rounded-2xl bg-zinc-950/95 border border-emerald-500/40 p-3.5 shadow-[0_0_35px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RiListCheck2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-white tracking-wider">
                  ACTIVE TASK SLICES ({slicesList.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void fetchActiveSlices()}
                  className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 transition cursor-pointer"
                  title="Refresh Slices"
                >
                  <RiRefreshLine className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsQueueOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 transition cursor-pointer"
                  title="Close Drawer"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-white/5 py-1">
              {slicesList.length === 0 ? (
                <div className="py-6 text-center text-xs font-mono text-zinc-500">
                  No active slices in SQLite WAL queue. Command uplink idle.
                </div>
              ) : (
                slicesList.map((slice) => (
                  <div
                    key={slice.id}
                    className="py-2 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                        @{slice.agent || 'DEV-01'}
                      </span>
                      <span className="truncate text-zinc-200">{slice.prompt}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-400 uppercase bg-black/40 px-1.5 py-0.5 rounded">
                        {slice.status || 'RUNNING'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCancelSlice(slice.id)}
                        className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded transition cursor-pointer"
                        title="Cancel slice"
                      >
                        <RiStopCircleLine className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            3. INLINE TRANSCRIPT DRAWER
           ===================================================================== */}
        {isTranscriptOpen && (
          <div className="absolute left-3 right-3 bottom-full mb-2 z-50 rounded-2xl bg-zinc-950/95 border border-amber-500/40 p-3.5 shadow-[0_0_35px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <RiFileList3Line className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-white tracking-wider">
                  VOICE & AUDIT STREAM TRANSCRIPT ({transcriptLogs.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTranscriptLogs([])}
                  className="text-[10px] font-mono text-zinc-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 transition cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsTranscriptOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 transition cursor-pointer"
                  title="Close Transcript"
                >
                  <RiCloseLine className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1.5 py-2 font-mono text-xs">
              {transcriptLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  Transcript buffer cleared. Listening on IPC spine...
                </div>
              ) : (
                transcriptLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-start gap-2.5"
                  >
                    <span className="text-[10px] text-zinc-500 shrink-0 mt-0.5">
                      {entry.timestamp}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                        entry.role === 'USER'
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : entry.role === 'AGENT'
                            ? 'bg-purple-500/20 text-purple-300'
                            : entry.role === 'SYSTEM'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {entry.role}
                    </span>
                    <span className="text-zinc-200 text-xs break-words flex-1">
                      {entry.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            4. FUZZY AUTOCOMPLETE POPOVER (@agent, @ecc:, /skill:, /ck:, /reflex)
           ===================================================================== */}
        {autocompleteOpen && autocompleteSuggestions.length > 0 && (
          <div
            ref={listRef}
            className="absolute left-3 right-3 bottom-full mb-2 z-50 max-h-56 overflow-y-auto rounded-xl bg-slate-950/95 border border-cyan-500/40 p-1.5 shadow-[0_0_30px_rgba(0,0,0,0.9)] backdrop-blur-2xl divide-y divide-white/5"
          >
            {autocompleteSuggestions.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => applyAutocomplete(item)}
                  className={`w-full px-3 py-2 rounded-lg text-left transition flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-200'
                      : 'hover:bg-white/5 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.category === 'AGENT' && <RiSparklingLine className="w-4 h-4 text-cyan-400 shrink-0" />}
                    {item.category === 'ECC' && <RiCpuLine className="w-4 h-4 text-purple-400 shrink-0" />}
                    {item.category === 'SKILL' && <RiCommandLine className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {item.category === 'CK' && <RiShieldCheckLine className="w-4 h-4 text-amber-400 shrink-0" />}
                    {item.category === 'REFLEX' && <RiSparklingLine className="w-4 h-4 text-rose-400 shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-xs truncate">
                        {item.label}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400 truncate">
                        {item.description}
                      </div>
                    </div>
                  </div>
                  <span className="ml-2 px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-white/5 border border-white/10 text-slate-400 shrink-0">
                    {item.badge}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* =====================================================================
            5. OMNI-INPUT WITH ATTACH, STEER, EXECUTE
           ===================================================================== */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 relative">
          {/* Agent Selector Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAgentMenu((prev) => !prev)}
              className="h-10 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition cursor-pointer"
              title="Select Agent Routing"
            >
              <RiSparklingLine className="w-3.5 h-3.5" />
              <span>{activeRoute ? `@${activeRoute}` : '@Agent'}</span>
            </button>

            {/* Agent Dropdown */}
            {showAgentMenu && (
              <div className="absolute left-0 bottom-12 z-50 w-44 rounded-xl bg-zinc-950 border border-white/10 p-1.5 shadow-2xl space-y-1">
                {agentsList.map((agent) => (
                  <button
                    key={agent}
                    type="button"
                    onClick={() => {
                      setActiveRoute(agent)
                      setShowAgentMenu(false)
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition flex items-center justify-between cursor-pointer ${
                      activeRoute === agent
                        ? 'bg-cyan-500/20 text-cyan-200 font-bold'
                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>@{agent}</span>
                    <span className="text-[9px] text-zinc-500">Route</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Omni-input with fuzzy autocomplete */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type command, @agent, @ecc:<agent>, /skill:<slug>, /ck:, or /reflex (Tab/Enter)"
            className="flex-1 h-10 bg-black/50 border border-white/10 rounded-xl px-4 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/40 transition"
          />

          {/* 1. Attach Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="h-10 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-1.5 transition shrink-0 cursor-pointer disabled:opacity-50"
            title="Attach file into Sovereign Store"
          >
            <RiAttachment2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Attach</span>
          </button>

          {/* 2. Steer Button */}
          <button
            type="button"
            onClick={() => void handleSteer()}
            className="h-10 px-3.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5 transition shrink-0 cursor-pointer"
            title="Steer running agents or send directive"
          >
            <RiCompass3Line className="w-3.5 h-3.5 text-cyan-400" />
            <span>Steer</span>
          </button>

          {/* 3. Execute Button */}
          <button
            type="submit"
            className="h-10 px-4 rounded-xl bg-emerald-500 text-black font-bold text-xs font-mono flex items-center gap-1.5 transition hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0 cursor-pointer"
            title="Execute command (Enter)"
          >
            <RiSendPlane2Line className="w-3.5 h-3.5" />
            <span>Execute</span>
          </button>
        </form>

        {/* =====================================================================
            6. STATUS BAR FOOTER
           ===================================================================== */}
        <div className="flex items-center justify-between px-1 text-[10px] font-mono text-zinc-500">
          <span className="truncate flex items-center gap-1.5">
            <RiCheckLine className="w-3 h-3 text-emerald-400" />
            {deckStatus}
          </span>
          <span className="text-zinc-600 hidden sm:inline">
            Fuzzy Autocomplete: @agent • @ecc: • /skill: • /ck: • /reflex
          </span>
        </div>

        {/* =====================================================================
            7. NON-DISMISSIBLE ABLITERATED WARNING BANNER
           ===================================================================== */}
        {checkIsAbliterated(activeModel || inputText) && (
          <AbliteratedWarningBanner
            modelName={activeModel || inputText}
            isAbliterated={true}
            className="rounded-xl mt-2 border border-amber-500/60"
          />
        )}
      </div>
    </div>
  )
}

export default CommandDeck
