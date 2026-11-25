import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Command,
  Sliders,
  Cpu,
  Layers,
  Globe,
  Terminal,
  Database,
  Sparkles,
  ShieldCheck,
  Activity,
  FileText,
  Eye,
  Flame,
  Palette,
  UserCheck,
  Volume2,
  TrendingUp,
  HardDrive,
  PlayCircle,
  Compass,
  X,
  BookOpen,
  FolderSync
} from 'lucide-react'
import { HudBracketCard } from './HudBracketCard'
import { KineticText } from './KineticText'
import { ipcFetch } from '../../services/ipc-client'
import { demandComponentManager } from '../../services/demand-component-manager'

export type CommandCategory = 'views' | 'settings' | 'widgets' | 'tools' | 'actions'

export interface CommandItem {
  id: string
  title: string
  description: string
  category: CommandCategory
  keywords: string[]
  shortcut?: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  badge?: string
}

export interface CommandPaletteProps {
  /** Controlled open state (optional; defaults to listening for Ctrl+K/Cmd+K) */
  isOpen?: boolean
  /** Callback when palette requests close */
  onClose?: () => void
  /** Callback when any view navigation is selected */
  onNavigateView?: (viewId: string) => void
  /** Callback when a workspace mode is changed */
  onSetWorkspaceMode?: (mode: 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT') => void
  /** Callback when an arbitrary command item is executed */
  onExecuteCommand?: (command: CommandItem) => void
  /** Custom extra commands to register into the fuzzy index */
  extraCommands?: CommandItem[]
}

/**
 * Fuzzy score calculator
 * Higher score = better match. 0 = no match.
 */
function computeFuzzyScore(query: string, item: CommandItem): number {
  if (!query) return 1

  const q = query.toLowerCase().trim()
  const title = item.title.toLowerCase()
  const desc = item.description.toLowerCase()
  const cat = item.category.toLowerCase()
  const keywords = item.keywords.map((k) => k.toLowerCase())

  let score = 0

  // Exact match
  if (title === q) score += 200
  // Prefix match
  else if (title.startsWith(q)) score += 120
  // Substring match in title
  else if (title.includes(q)) score += 80

  // Substring match in description
  if (desc.includes(q)) score += 40

  // Category match
  if (cat.includes(q)) score += 30

  // Keyword exact or substring matches
  for (const kw of keywords) {
    if (kw === q) score += 50
    else if (kw.includes(q)) score += 25
  }

  // Character-by-character fuzzy sequential scan
  let qIdx = 0
  let seqBonus = 0
  for (let i = 0; i < title.length && qIdx < q.length; i++) {
    if (title[i] === q[qIdx]) {
      qIdx++
      seqBonus += 5
    }
  }
  if (qIdx === q.length) {
    score += 20 + seqBonus
  }

  return score
}

const CATEGORY_LABELS: Record<CommandCategory, { label: string; color: string; badge: string }> = {
  views: { label: 'SPATIAL VIEWS', color: 'text-cyan-400', badge: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/30' },
  settings: {
    label: 'SETTINGS & ENCLAVE',
    color: 'text-amber-400',
    badge: 'bg-amber-950/60 text-amber-300 border-amber-500/30'
  },
  widgets: {
    label: 'WIDGETS & HUD',
    color: 'text-emerald-400',
    badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
  },
  tools: {
    label: 'AUTONOMOUS TOOLS',
    color: 'text-purple-400',
    badge: 'bg-purple-950/60 text-purple-300 border-purple-500/30'
  },
  actions: {
    label: 'SYSTEM ACTIONS',
    color: 'text-rose-400',
    badge: 'bg-rose-950/60 text-rose-300 border-rose-500/30'
  }
}

/**
 * CommandPalette — Ctrl+K Fuzzy Searchable Neural Launcher
 * Indexes every view, setting, widget, and tool across Nexus Desktop.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen: controlledIsOpen,
  onClose,
  onNavigateView,
  onSetWorkspaceMode,
  onExecuteCommand,
  extraCommands = []
}) => {
  const [internalOpen, setInternalOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isActuallyOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen

  const handleClose = useCallback(() => {
    if (controlledIsOpen !== undefined) {
      onClose?.()
    } else {
      setInternalOpen(false)
    }
    setSearchQuery('')
    setSelectedIndex(0)
  }, [controlledIsOpen, onClose])

  // Global Ctrl+K / Cmd+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        if (isActuallyOpen) {
          handleClose()
        } else {
          if (controlledIsOpen !== undefined) {
            onClose?.() // Or trigger parent
          } else {
            setInternalOpen(true)
          }
        }
      } else if (e.key === 'Escape' && isActuallyOpen) {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActuallyOpen, handleClose, controlledIsOpen, onClose])

  // Focus input on open
  useEffect(() => {
    if (isActuallyOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    }
  }, [isActuallyOpen])

  // Built-in Registry indexing every View, Setting, Widget, and Tool
  const defaultCommands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [
      // === 1. SPATIAL VIEWS (01 - 10) ===
      {
        id: 'view-core',
        title: '01 // Core Living HUD',
        description: 'Master Living Neural Stage with Three.js Orb, 4 Conduits & Telemetry',
        category: 'views',
        keywords: ['core', 'orb', 'stage', 'dyson', 'atlas', 'vortex', 'helix', 'telemetry', 'home'],
        shortcut: '1',
        icon: Cpu,
        action: () => onNavigateView?.('core')
      },
      {
        id: 'view-studio',
        title: '02 // NexKoder Studio',
        description: 'ScopeGuard File Tree, Monaco Side-by-Side Diff & Dynamic Swarm Panel',
        category: 'views',
        keywords: ['studio', 'nexkoder', 'code', 'editor', 'monaco', 'diff', 'git', 'terminal'],
        shortcut: '2',
        icon: Terminal,
        action: () => onNavigateView?.('studio')
      },
      {
        id: 'view-scholar',
        title: '03 // Memory Galaxy & Scholar Lab',
        description: '3D FTS5 + Vec Vector Galaxy, arXiv Scholar Search & KaTeX SQLite Notes',
        category: 'views',
        keywords: ['scholar', 'memory', 'galaxy', 'arxiv', 'research', 'vector', 'sqlite', 'katex'],
        shortcut: '3',
        icon: BookOpen,
        action: () => onNavigateView?.('scholar')
      },
      {
        id: 'view-routines',
        title: '04 // Autopilot & Voice Routines',
        description: '24-Hour Orbital Dial, Cron Scheduler, Visual Pipeline & OS Utility Hub',
        category: 'views',
        keywords: ['autopilot', 'routines', 'cron', 'macro', 'scheduler', 'awake', 'pomodoro'],
        shortcut: '4',
        icon: PlayCircle,
        action: () => onNavigateView?.('routines')
      },
      {
        id: 'view-interview',
        title: '05 // Interview Copilot',
        description: 'WDA Stealth HUD, Real-Time Loopback Audio, WinRT OCR & STAR Mode',
        category: 'views',
        keywords: ['interview', 'copilot', 'stealth', 'ocr', 'star', 'coding', 'wda'],
        shortcut: '5',
        icon: Eye,
        action: () => onNavigateView?.('interview')
      },
      {
        id: 'view-chat',
        title: '02 // AI Chat & Multi-Model Fleet',
        description: 'Direct streaming AI chat with provider routing, attachments, and model switching',
        category: 'views',
        keywords: ['chat', 'ai', 'llm', 'prompt', 'conversation', 'puter', 'gemini'],
        shortcut: '2',
        icon: Sparkles,
        action: () => onNavigateView?.('chat')
      },
      {
        id: 'view-world',
        title: '06 // World & Planet Watch',
        description: 'Spatial Orbital Globe Telemetry & Agent Town Multi-Agent 2D Canvas',
        category: 'views',
        keywords: ['world', 'planet', 'town', 'agents', 'globe', 'spatial', 'satellites'],
        shortcut: '6',
        icon: Globe,
        action: () => onNavigateView?.('world')
      },
      {
        id: 'view-vault',
        title: '07 // Board & Vault',
        description: 'Spatial Whiteboard Canvas, Obscura DOM Inspector & Sovereign Vault',
        category: 'views',
        keywords: ['vault', 'whiteboard', 'board', 'canvas', 'obscura', 'dom', 'draw'],
        shortcut: '7',
        icon: Layers,
        action: () => onNavigateView?.('vault')
      },
      {
        id: 'view-themes',
        title: '08 // Theme Forge & Wallpapers',
        description: 'Cyberpunk Palettes, Color Tokens & 5 WebGL Dynamic Shaders',
        category: 'views',
        keywords: ['theme', 'wallpaper', 'forge', 'shaders', 'cyberpunk', 'neon', 'colors'],
        shortcut: '8',
        badge: 'THEME',
        icon: Palette,
        action: () => onNavigateView?.('theme')
      },
      {
        id: 'view-profile',
        title: '09 // Sovereign Profile',
        description: 'DPAPI Encrypted Vault, NiranX Creator Identity & Model Quotas',
        category: 'views',
        keywords: ['profile', 'identity', 'niranx', 'dpapi', 'keys', 'quota', 'vault'],
        shortcut: '9',
        icon: UserCheck,
        action: () => onNavigateView?.('profile')
      },
      {
        id: 'view-settings',
        title: '10 // Settings & Enclave',
        description: 'ScopeGuard 6/6 Invariant Audit, LLM Router, Audio VAD & Hardware',
        category: 'views',
        keywords: ['settings', 'config', 'enclave', 'scopeguard', 'vad', 'audio', 'hardware'],
        shortcut: '0',
        icon: Sliders,
        action: () => onNavigateView?.('settings')
      },

      // === 2. SETTINGS & ENCLAVE ===
      {
        id: 'set-mode-dev',
        title: 'Mode: DEV Workspace',
        description: 'Full sovereign autonomy, code editing, and execution permissions',
        category: 'settings',
        keywords: ['dev', 'developer', 'mode', 'workspace', 'autonomy'],
        badge: 'DEV',
        icon: Terminal,
        action: () => onSetWorkspaceMode?.('DEV')
      },
      {
        id: 'set-mode-study',
        title: 'Mode: STUDY Workspace',
        description: 'Focused academic research, arXiv analysis, and KaTeX note taking',
        category: 'settings',
        keywords: ['study', 'scholar', 'mode', 'research', 'academic'],
        badge: 'STUDY',
        icon: BookOpen,
        action: () => onSetWorkspaceMode?.('STUDY')
      },
      {
        id: 'set-mode-studio',
        title: 'Mode: STUDIO Workspace',
        description: 'Creative audio, visual design, and real-time voice synthesis mode',
        category: 'settings',
        keywords: ['studio', 'creative', 'voice', 'audio', 'media'],
        badge: 'STUDIO',
        icon: Sparkles,
        action: () => onSetWorkspaceMode?.('STUDIO')
      },
      {
        id: 'set-mode-silent',
        title: 'Mode: SILENT Airgapped',
        description: 'Zero external network calls; strict offline DPAPI + local models',
        category: 'settings',
        keywords: ['silent', 'airgap', 'offline', 'privacy', 'isolated'],
        badge: 'SILENT',
        icon: ShieldCheck,
        action: () => onSetWorkspaceMode?.('SILENT')
      },
      {
        id: 'set-persona-tars',
        title: 'Persona: TARS Prime',
        description: 'Wit 85%, Sarcasm 20%, Directness 100% tactical assistant',
        category: 'settings',
        keywords: ['tars', 'persona', 'wit', 'sarcasm', 'direct', 'humor'],
        icon: Sliders,
        action: () => {
          ipcFetch('/api/persona/activate', {
            method: 'POST',
            body: JSON.stringify({ persona_id: 'tars_prime' })
          }).catch(() => {})
        }
      },
      {
        id: 'set-voice-kokoro',
        title: 'Voice Engine: Kokoro-82M ONNX',
        description: 'DirectML zero-subscription local neural TTS (af_heart / 24kHz)',
        category: 'settings',
        keywords: ['kokoro', 'tts', 'voice', 'speech', 'onnx', 'directml'],
        icon: Volume2,
        action: () => onNavigateView?.('settings')
      },
      {
        id: 'set-scope-audit',
        title: 'Security: Audit ScopeGuard Invariants',
        description: 'Verify 6/6 sovereign invariants and path containment boundaries',
        category: 'settings',
        keywords: ['security', 'scopeguard', 'invariants', 'audit', 'sandbox'],
        icon: ShieldCheck,
        action: () => {
          ipcFetch('/api/security/audit', { method: 'POST' }).catch(() => {})
        }
      },

      // === 3. WIDGETS & HUD ===
      {
        id: 'widget-stock',
        title: 'Widget: Market Telemetry',
        description: 'Real-time financial proxy ticker for monitored indices & assets',
        category: 'widgets',
        keywords: ['stock', 'ticker', 'finance', 'market', 'nasdaq', 'crypto'],
        icon: TrendingUp,
        action: () => {
          onNavigateView?.('core')
          demandComponentManager.demandComponent('stock', { symbol: 'NVDA' }, 'command-palette')
        }
      },
      {
        id: 'widget-memory-search',
        title: 'Widget: FTS5 Memory Search',
        description: 'Search local SQLite WAL knowledge base with full-text & vector indices',
        category: 'widgets',
        keywords: ['memory', 'fts5', 'search', 'query', 'sqlite', 'vector'],
        icon: Database,
        action: () => onNavigateView?.('scholar')
      },
      {
        id: 'widget-disk-map',
        title: 'Widget: Disk Space Treemap',
        description: 'Visual treemap breakdown of drive usage and temporary vendor cache',
        category: 'widgets',
        keywords: ['disk', 'storage', 'space', 'treemap', 'cleanup'],
        icon: HardDrive,
        action: () => onNavigateView?.('routines')
      },
      {
        id: 'widget-fft-audio',
        title: 'Widget: Live Terminal & Command Deck',
        description: 'Summon floating Ghost Terminal / on-demand tactical overlay',
        category: 'widgets',
        keywords: ['terminal', 'shell', 'audio', 'fft', 'spectrogram', 'mic'],
        icon: Terminal,
        action: () => demandComponentManager.demandComponent('terminal', {}, 'command-palette')
      },

      // === 4. AUTONOMOUS TOOLS ===
      {
        id: 'tool-swarm-mitosis',
        title: 'Tool: Swarm Mitosis (Spawn 5 Agents)',
        description: 'Split core into DEV-01, DATA-01, SEC-01, UX-01, and OPS-01 agents',
        category: 'tools',
        keywords: ['swarm', 'mitosis', 'spawn', 'agents', 'ephemeral', 'subagents'],
        badge: 'SWARM',
        icon: Sparkles,
        action: () => {
          ipcFetch('/api/swarm/mitosis', {
            method: 'POST',
            body: JSON.stringify({ count: 5, template: 'full_dev_cluster' })
          }).catch(() => {})
        }
      },
      {
        id: 'tool-screen-ocr',
        title: 'Tool: Screen OCR Problem Solver',
        description: 'Capture active screen region and distill problem statement via WinRT OCR',
        category: 'tools',
        keywords: ['ocr', 'screen', 'capture', 'problem', 'solve', 'vision'],
        icon: Eye,
        action: () => onNavigateView?.('interview')
      },
      {
        id: 'tool-macro-rec',
        title: 'Tool: Macro Action Recorder',
        description: 'Record sequence of keyboard & mouse actions into deterministic pipeline',
        category: 'tools',
        keywords: ['macro', 'record', 'automate', 'pipeline', 'workflow'],
        icon: PlayCircle,
        action: () => onNavigateView?.('routines')
      },
      {
        id: 'tool-deep-research',
        title: 'Tool: Multi-Phase Deep Research',
        description: 'Launch autonomous academic literature synthesis with arXiv & web papers',
        category: 'tools',
        keywords: ['deep', 'research', 'arxiv', 'literature', 'synthesis'],
        icon: BookOpen,
        action: () => onNavigateView?.('scholar')
      },

      // === 5. SYSTEM ACTIONS ===
      {
        id: 'act-estop',
        title: 'EMERGENCY: E-STOP Freeze',
        description: 'Instantly halt all running swarms, autonomous tools, and audio playback',
        category: 'actions',
        keywords: ['estop', 'stop', 'freeze', 'emergency', 'halt', 'kill', 'abort'],
        shortcut: 'E-STOP',
        icon: Flame,
        action: () => {
          ipcFetch('/api/estop/trigger', { method: 'POST' }).catch(() => {})
        }
      },
      {
        id: 'act-cloud-sync',
        title: 'Action: Sync Memory to Cloudflare D1',
        description: 'Export encrypted SQLite delta to serverless edge storage',
        category: 'actions',
        keywords: ['sync', 'cloud', 'cloudflare', 'd1', 'backup', 'edge'],
        icon: FolderSync,
        action: () => {
          ipcFetch('/api/memory/sync', { method: 'POST' }).catch(() => {})
        }
      },
      {
        id: 'act-diag-hud',
        title: 'Action: Toggle Diagnostic HUD (Alt+D)',
        description: 'Overlay real-time IPC ping, memory, VAD state, and DirectML diagnostics',
        category: 'actions',
        keywords: ['diag', 'diagnostics', 'telemetry', 'hud', 'ping', 'altd'],
        shortcut: 'Alt+D',
        icon: Activity,
        action: () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', altKey: true }))
        }
      }
    ]

    return [...list, ...extraCommands]
  }, [onNavigateView, onSetWorkspaceMode, extraCommands])

  // Filter and rank commands based on search query
  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) {
      return defaultCommands
    }

    const scored = defaultCommands
      .map((item) => ({
        item,
        score: computeFuzzyScore(searchQuery, item)
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map((entry) => entry.item)
  }, [searchQuery, defaultCommands])

  // Ensure selected index is clamped
  useEffect(() => {
    if (selectedIndex >= filteredCommands.length) {
      setSelectedIndex(Math.max(0, filteredCommands.length - 1))
    }
  }, [filteredCommands.length, selectedIndex])

  // Auto scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.querySelector('[data-active="true"]') as HTMLElement | null
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  // Execute selected command
  const executeItem = useCallback(
    (item: CommandItem) => {
      item.action()
      onExecuteCommand?.(item)
      handleClose()
    },
    [handleClose, onExecuteCommand]
  )

  // Keyboard navigation within list
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (filteredCommands.length === 0 ? 0 : (prev + 1) % filteredCommands.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) =>
        filteredCommands.length === 0 ? 0 : (prev - 1 + filteredCommands.length) % filteredCommands.length
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        executeItem(filteredCommands[selectedIndex])
      }
    }
  }

  return (
    <AnimatePresence>
      {isActuallyOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          {/* Dimmed backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            onClick={handleClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-2xl"
          >
            <HudBracketCard
              variant="cyan"
              cornerSize={8}
              specular={true}
              animated={true}
              className="p-0 shadow-[0_20px_60px_-15px_rgba(0,245,212,0.25)] border-cyan-500/40 bg-slate-950/90"
            >
              {/* Header / Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/20 bg-slate-900/60">
                <Search className="w-5 h-5 text-cyan-400 shrink-0 animate-pulse" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSelectedIndex(0)
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a command, view, tool, or setting..."
                  className="w-full bg-transparent text-sm text-cyan-100 placeholder-slate-500 font-mono tracking-wide focus:outline-none"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedIndex(0)
                      inputRef.current?.focus()
                    }}
                    className="p-1 text-slate-400 hover:text-cyan-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-950/40 text-[10px] font-mono text-cyan-300 shrink-0">
                  <Command className="w-3 h-3" />
                  <span>K</span>
                </div>
              </div>

              {/* Sub-header status bar with KineticText */}
              <div className="flex items-center justify-between px-4 py-1.5 border-b border-white/5 bg-slate-950/80 text-[10px] font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  <KineticText
                    text={`NEXUS LAUNCHER // ${filteredCommands.length} INDEXED TARGETS`}
                    duration={240}
                    className="text-cyan-400 font-semibold"
                  />
                </div>
                <div className="text-slate-500">
                  {searchQuery ? `QUERY: "${searchQuery}"` : 'READY // TAB TO BROWSE'}
                </div>
              </div>

              {/* Command List Area */}
              <div
                ref={listRef}
                className="max-h-[380px] overflow-y-auto overflow-x-hidden p-2 space-y-1 divide-y divide-white/[0.03] scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent"
              >
                {filteredCommands.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 font-mono text-xs">
                    <Compass className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-60 animate-spin" />
                    <div>NO MATCHING SYSTEM TARGETS</div>
                    <div className="text-[10px] text-slate-600 mt-1">Try "core", "studio", "dev", "ocr", or "estop"</div>
                  </div>
                ) : (
                  filteredCommands.map((item, index) => {
                    const isSelected = index === selectedIndex
                    const catMeta = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.actions
                    const IconComponent = item.icon

                    return (
                      <div
                        key={item.id}
                        data-active={isSelected}
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`group relative flex items-center justify-between px-3 py-2.5 rounded cursor-pointer transition-all duration-150 font-mono ${
                          isSelected
                            ? 'bg-cyan-950/60 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,245,212,0.15)] text-cyan-200'
                            : 'hover:bg-slate-900/50 border border-transparent text-slate-300'
                        }`}
                      >
                        {/* Left edge selection indicator */}
                        {isSelected && (
                          <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_#00f5d4]" />
                        )}

                        <div className="flex items-center gap-3 min-w-0 pr-3">
                          <div
                            className={`p-1.5 rounded border transition-colors shrink-0 ${
                              isSelected
                                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                                : 'bg-slate-900/70 border-white/5 text-slate-400 group-hover:text-slate-200'
                            }`}
                          >
                            <IconComponent className="w-4 h-4" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-semibold tracking-wide truncate ${
                                  isSelected ? 'text-cyan-100' : 'text-slate-200'
                                }`}
                              >
                                {item.title}
                              </span>
                              {item.badge && (
                                <span className={`text-[9px] px-1.5 py-0.2 rounded border ${catMeta.badge}`}>
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">{item.description}</div>
                          </div>
                        </div>

                        {/* Right Metadata / Shortcut */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[9px] font-mono tracking-wider hidden sm:inline ${catMeta.color}`}>
                            {catMeta.label}
                          </span>
                          {item.shortcut && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                isSelected
                                  ? 'bg-cyan-900/60 text-cyan-300 border-cyan-500/40'
                                  : 'bg-slate-900/60 text-slate-500 border-white/10'
                              }`}
                            >
                              {item.shortcut}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer hints */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 bg-slate-950 text-[10px] font-mono text-slate-500">
                <div className="flex items-center gap-3">
                  <span>
                    <strong className="text-slate-400">↑↓</strong> Navigate
                  </span>
                  <span>
                    <strong className="text-slate-400">↵</strong> Execute
                  </span>
                  <span>
                    <strong className="text-slate-400">ESC</strong> Dismiss
                  </span>
                </div>
                <div className="text-cyan-500/80 tracking-widest text-[9px]">SOVEREIGN NEURAL DESKTOP</div>
              </div>
            </HudBracketCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default CommandPalette
