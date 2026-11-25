// apps/desktop/src/renderer/src/components/SidebarRail.tsx
// NEXUS OS v5.0 — Minimalist Left Spatial Navigation Rail with Breathable Spacing

import React, { useState, useEffect, useCallback } from 'react'
import {
  Cpu,
  Code2,
  BookOpen,
  Zap,
  UserCheck,
  Globe,
  PenTool,
  Palette,
  ShieldCheck,
  Settings,
  Mic,
  MicOff,
  Columns,
  PanelLeftClose,
  PanelLeftOpen,
  Activity,
  MessageSquare
} from 'lucide-react'
import nexusLogo from '../assets/nexus-logo.png'

export type MasterTab =
  | 'core'
  | 'chat'
  | 'studio'
  | 'scholar'
  | 'interview'
  | 'world'
  | 'routines'
  | 'vault'
  | 'theme'
  | 'profile'
  | 'settings'
  | 'obscura'
  | 'globe'
  | (string & {})

export interface RailTabItem {
  id: MasterTab
  testId?: string
  num: string
  label: string
  fullLabel: string
  icon: React.ComponentType<{ className?: string }>
  badge: string
  shortcut: string
  description: string
  aliases?: string[]
}

export const RAIL_TABS: RailTabItem[] = [
  {
    id: 'core',
    num: '01',
    label: 'Core',
    fullLabel: 'Core Agent HUD',
    icon: Cpu,
    badge: 'LIVE',
    shortcut: 'Alt+1',
    description: 'Living Core Stage, Optics, Voice & Telemetry'
  },
  {
    id: 'chat',
    num: '02',
    label: 'AI Chat',
    fullLabel: 'AI Chat & Fleet',
    icon: MessageSquare,
    badge: 'LLM',
    shortcut: 'Alt+C',
    description: 'Streaming Multi-Model Chat & Tool Orchestrator'
  },
  {
    id: 'studio',
    testId: 'nav-item-nexkoder',
    num: '03',
    label: 'Studio',
    fullLabel: 'NexKoder Studio',
    icon: Code2,
    badge: 'IDE',
    shortcut: 'Alt+2',
    description: 'NexKoder IDE, Agentic Diff & Ghost Terminal'
  },
  {
    id: 'scholar',
    num: '04',
    label: 'Memory & Scholar',
    fullLabel: 'Memory & Scholar Lab',
    icon: BookOpen,
    badge: 'ARXIV',
    shortcut: 'Alt+3',
    description: '3D Memory Galaxy, Scholar Lab & Notes',
    aliases: ['memory', 'scholar', 'notes']
  },
  {
    id: 'routines',
    num: '05',
    label: 'Autopilot & Apps',
    fullLabel: 'Autopilot, Macros & Apps',
    icon: Zap,
    badge: 'AUTO',
    shortcut: 'Alt+4',
    description: 'Orbital Autopilot, Visual Workflows & Installed Apps',
    aliases: ['routines', 'autopilot', 'macros', 'apps', 'workflows']
  },
  {
    id: 'interview',
    num: '06',
    label: 'Interview',
    fullLabel: 'Interview Copilot',
    icon: UserCheck,
    badge: 'STEALTH',
    shortcut: 'Alt+5',
    description: 'Low-Profile Stealth HUD & Real-Time Copilot'
  },
  {
    id: 'world',
    num: '07',
    label: 'World & Browser',
    fullLabel: 'World & Browser Tactical Suite',
    icon: Globe,
    badge: 'RADAR',
    shortcut: 'Alt+6',
    description: 'Live Browser WebView, Obscura Inspector, PlanetWatch & AgentTown',
    aliases: ['world', 'globe', 'obscura', 'browser']
  },
  {
    id: 'vault',
    num: '08',
    label: 'Board & Vault',
    fullLabel: 'Board, Vault, Phone & Widgets',
    icon: PenTool,
    badge: 'STUDIO',
    shortcut: 'Alt+7',
    description: 'Blueprint Whiteboard, Gallery, Creator Suite, 17 Widgets & ADB Phone',
    aliases: ['vault', 'board', 'phone', 'gallery']
  },
  {
    id: 'theme',
    num: '09',
    label: 'Theme Forge',
    fullLabel: 'Theme Forge & Shaders',
    icon: Palette,
    badge: 'WEBGL',
    shortcut: 'Alt+8',
    description: 'Cyberpunk Theme Presets & WebGL Shader Engine',
    aliases: ['theme', 'themes', 'forge']
  },
  {
    id: 'profile',
    num: '10',
    label: 'Profile',
    fullLabel: 'Profile & Enclave',
    icon: ShieldCheck,
    badge: 'DPAPI',
    shortcut: 'Alt+9',
    description: 'Operator Dossier, DPAPI Vault & AgentShield AST Score',
    aliases: ['profile', 'enclave']
  },
  {
    id: 'settings',
    num: '11',
    label: 'Settings',
    fullLabel: 'Settings Command Center',
    icon: Settings,
    badge: 'CONFIG',
    shortcut: 'Alt+0',
    description: '7-Tab Sovereign Configuration, Providers & Audio/Media Hub',
    aliases: ['settings', 'config']
  }
]

export interface SidebarRailProps {
  activeTab: MasterTab | string
  onSelectTab: (tab: MasterTab) => void
  isMicActive?: boolean
  onToggleMic?: () => void
  isSplitCore?: boolean
  onToggleSplitCore?: () => void
  ramMb?: number
  activeSlices?: number
  isExpanded?: boolean
  onToggleExpand?: () => void
}

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeTab,
  onSelectTab,
  isMicActive: controlledMicActive,
  onToggleMic,
  isSplitCore: controlledSplitCore,
  onToggleSplitCore,
  ramMb,
  activeSlices,
  isExpanded: controlledExpanded,
  onToggleExpand
}) => {
  const [internalExpanded, setInternalExpanded] = useState<boolean>(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

  const toggleExpand = useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand()
    } else {
      setInternalExpanded((prev) => !prev)
    }
  }, [onToggleExpand])

  const [internalSplitCore, setInternalSplitCore] = useState<boolean>(false)
  const isSplitCore = controlledSplitCore !== undefined ? controlledSplitCore : internalSplitCore

  const toggleSplitCore = useCallback(() => {
    if (onToggleSplitCore) {
      onToggleSplitCore()
    } else {
      setInternalSplitCore((prev) => !prev)
    }
  }, [onToggleSplitCore])

  const [internalMicActive, setInternalMicActive] = useState<boolean>(false)
  const isMicActive = controlledMicActive !== undefined ? controlledMicActive : internalMicActive

  const toggleMic = useCallback(() => {
    if (onToggleMic) {
      onToggleMic()
    } else {
      setInternalMicActive((prev) => !prev)
    }
  }, [onToggleMic])

  const [telemetryRam, setTelemetryRam] = useState<number>(ramMb ?? 142)
  const [telemetrySlices, setTelemetrySlices] = useState<number>(activeSlices ?? 5)
  const [hoveredTooltip, setHoveredTooltip] = useState<{
    tab: RailTabItem
    top: number
  } | null>(null)

  // Listen to TopBar sidebar toggle event and broadcast current expansion state
  useEffect(() => {
    const onExternalToggle = () => {
      toggleExpand()
    }
    window.addEventListener('nexus:toggle-sidebar', onExternalToggle)
    return () => window.removeEventListener('nexus:toggle-sidebar', onExternalToggle)
  }, [toggleExpand])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('nexus:sidebar-state', { detail: { isExpanded } }))
    if (isExpanded) {
      setHoveredTooltip(null)
    }
  }, [isExpanded])

  useEffect(() => {
    if (ramMb !== undefined) setTelemetryRam(ramMb)
    if (activeSlices !== undefined) setTelemetrySlices(activeSlices)
  }, [ramMb, activeSlices])

  // Periodic gentle telemetry poll when not supplied by props
  useEffect(() => {
    if (ramMb !== undefined) return
    let isMounted = true

    const checkTelemetry = async (): Promise<void> => {
      try {
        const { ipcFetch } = await import('@renderer/services/ipc-client')
        const res = await ipcFetch('/api/health')
        if (res.ok) {
          const data = await res.json()
          if (isMounted) {
            if (typeof data.ram_mb === 'number') setTelemetryRam(Math.round(data.ram_mb))
            if (typeof data.active_slices === 'number') setTelemetrySlices(data.active_slices)
          }
        }
      } catch {
        if (
          typeof window !== 'undefined' &&
          (performance as unknown as { memory?: { usedJSHeapSize?: number } })?.memory
            ?.usedJSHeapSize
        ) {
          const heap = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory
            .usedJSHeapSize
          const used = Math.round(heap / (1024 * 1024))
          if (isMounted && used > 0) setTelemetryRam(used)
        }
      }
    }

    void checkTelemetry()
    const timer = window.setInterval(checkTelemetry, 5000)
    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [ramMb])

  // Keyboard navigation shortcuts aligned with RAIL_TABS shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const key = e.key.toLowerCase()
        const shortcutMap: Record<string, MasterTab> = {
          '1': 'core',
          c: 'chat',
          '2': 'studio',
          '3': 'scholar',
          '4': 'routines',
          '5': 'interview',
          '6': 'world',
          '7': 'vault',
          '8': 'theme',
          '9': 'profile',
          '0': 'settings'
        }
        const matchedTab = shortcutMap[key]
        if (matchedTab) {
          e.preventDefault()
          onSelectTab(matchedTab)
        } else if (key === 'm') {
          e.preventDefault()
          toggleMic()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectTab, toggleMic])

  const isTabActive = (item: RailTabItem): boolean => {
    if (activeTab === item.id) return true
    if (item.aliases && item.aliases.includes(activeTab as string)) return true
    return false
  }

  return (
    <nav
      className={`relative flex flex-col justify-between py-3 px-2 gap-1.5 z-30 shrink-0 select-none bg-slate-950/90 backdrop-blur-2xl border-r border-white/10 transition-all duration-300 ease-in-out ${
        isExpanded ? 'w-[248px] min-w-[248px]' : 'w-[64px] min-w-[64px]'
      }`}
      aria-label="NEXUS Spatial Navigation Rail"
    >
      {/* TOP HEADER: Brand Emblem + Expand/Collapse Control */}
      <div
        className={`flex items-center shrink-0 pb-1 ${
          isExpanded ? 'justify-between px-1' : 'flex-col gap-1.5'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectTab('core')}
          className={`relative rounded-xl overflow-hidden border transition-all duration-200 flex items-center justify-center cursor-pointer group ${
            isExpanded ? 'h-9 px-2 gap-2.5' : 'w-10 h-10 p-1'
          } ${
            isTabActive(RAIL_TABS[0])
              ? 'border-cyan-400/60 bg-cyan-500/15 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'border-white/10 bg-white/[0.04] hover:border-cyan-400/40 hover:bg-white/[0.08]'
          }`}
          title="Core Agent HUD (Alt+1)"
          aria-label="Core Agent HUD"
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
            <img
              src={nexusLogo}
              alt="NEXUS Core"
              className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform"
            />
          </div>
          {isExpanded && (
            <div className="flex flex-col text-left overflow-hidden">
              <span className="font-mono font-bold text-xs tracking-wider text-slate-100 truncate">
                NEXUS OS
              </span>
              <span className="text-[9px] font-mono text-cyan-400 tracking-wider">
                SPATIAL WORKSTATION
              </span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={toggleExpand}
          className={`rounded-lg flex items-center justify-center border border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100 transition-colors cursor-pointer ${
            isExpanded ? 'w-7 h-7' : 'w-10 h-6'
          }`}
          title={isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
          aria-label={isExpanded ? 'Collapse Navigation Rail' : 'Expand Navigation Rail'}
        >
          {isExpanded ? (
            <PanelLeftClose className="w-3.5 h-3.5" />
          ) : (
            <PanelLeftOpen className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* MIDDLE: Minimalist Spatial Navigation Modules */}
      <div className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden no-scrollbar py-0.5">
        {RAIL_TABS.map((tab) => {
          const Icon = tab.icon
          const active = isTabActive(tab)

          return (
            <button
              key={tab.id}
              type="button"
              data-testid={tab.testId || `nav-item-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              onMouseEnter={(e) => {
                if (!isExpanded) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHoveredTooltip({ tab, top: rect.top + rect.height / 2 })
                }
              }}
              onMouseLeave={() => {
                setHoveredTooltip((prev) => (prev?.tab.id === tab.id ? null : prev))
              }}
              aria-current={active ? 'page' : undefined}
              aria-label={tab.label}
              title={`${tab.label} (${tab.shortcut})`}
              className={`relative group shrink-0 transition-all duration-200 cursor-pointer ${
                isExpanded
                  ? 'w-full px-2.5 py-2 rounded-xl flex items-center gap-3 border text-left'
                  : 'w-10 h-10 rounded-xl flex items-center justify-center border'
              } ${
                active
                  ? 'bg-white/10 border-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] hover:border-white/5'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-cyan-400 rounded-r-full shadow-[0_0_8px_#22d3ee]" />
              )}

              {isExpanded ? (
                <>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 ${
                      active
                        ? 'text-cyan-300'
                        : 'text-zinc-400 group-hover:text-zinc-100'
                    }`}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className={`text-xs font-medium truncate leading-tight ${
                        active ? 'text-white' : 'text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </span>
                    <span className="text-[10px] text-zinc-500 truncate leading-tight mt-0.5">
                      {tab.description}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {tab.shortcut}
                  </span>
                </>
              ) : (
                <Icon
                  className={`w-[18px] h-[18px] transition-transform group-hover:scale-110 ${
                    active
                      ? 'text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]'
                      : 'text-zinc-400 group-hover:text-zinc-100'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Collapsed Floating Tooltip (Fixed positioned to prevent overflow clipping) */}
      {!isExpanded && hoveredTooltip && (
        <div
          style={{ top: hoveredTooltip.top }}
          className="pointer-events-none fixed left-[72px] -translate-y-1/2 z-50 w-56 rounded-xl border border-cyan-500/30 bg-slate-950/95 px-3 py-2 text-left shadow-[0_12px_30px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/10">
            <span className="font-mono text-xs font-semibold text-slate-100 truncate">
              {hoveredTooltip.tab.label}
            </span>
            <kbd className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300 shrink-0">
              {hoveredTooltip.tab.shortcut}
            </kbd>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
            {hoveredTooltip.tab.description}
          </p>
        </div>
      )}

      {/* BOTTOM FOOTER: Infinity RAM Status, Split-Core Toggle, Quick Mic */}
      <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5 shrink-0">
        {/* 1. Infinity Slice RAM Telemetry */}
        <div
          className={`relative group rounded-xl border border-white/10 bg-white/[0.04] hover:border-cyan-500/40 transition-all duration-200 ${
            isExpanded
              ? 'w-full px-2.5 py-2 flex flex-col gap-1'
              : 'w-10 h-10 mx-auto flex items-center justify-center'
          }`}
          title={`Infinity Slice RAM: ${telemetryRam} MB • ${telemetrySlices} active slices`}
        >
          {isExpanded ? (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono text-[10px] text-zinc-200 font-medium">
                    Infinity RAM
                  </span>
                </div>
                <span className="font-mono text-[10px] text-cyan-300 font-semibold">
                  {telemetryRam} MB
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                <span>Slices: {telemetrySlices}</span>
                <span className="text-emerald-400">WAL SYNC</span>
              </div>
              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(15, (telemetryRam / 1024) * 100))}%`
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              <Activity className="w-4 h-4 text-zinc-400 group-hover:text-cyan-300 transition-colors" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            </div>
          )}
        </div>

        {/* 2. Split-Core Viewport Toggle */}
        <button
          type="button"
          onClick={toggleSplitCore}
          className={`relative group rounded-xl border transition-all duration-200 cursor-pointer ${
            isExpanded
              ? 'w-full px-2.5 py-2 flex items-center justify-between gap-2'
              : 'w-10 h-10 mx-auto flex items-center justify-center'
          } ${
            isSplitCore
              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
              : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]'
          }`}
          title={`Split-Core: ${
            isSplitCore ? 'Split-Stage (32% Orb / 68% Stage)' : 'Full Viewport'
          }`}
          aria-label="Toggle Split-Core Viewport"
        >
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <Columns className="w-4 h-4 shrink-0" />
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs font-medium truncate">Split-Core</span>
                  <span className="text-[10px] text-zinc-500 truncate">
                    {isSplitCore ? '32% Orb / 68% Stage' : 'Full Viewport'}
                  </span>
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                  isSplitCore
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-zinc-400'
                }`}
              >
                {isSplitCore ? '32/68' : 'FULL'}
              </span>
            </>
          ) : (
            <Columns className="w-4 h-4" />
          )}
        </button>

        {/* 3. Quick Mic Toggle */}
        <button
          type="button"
          onClick={toggleMic}
          className={`relative group rounded-xl border transition-all duration-200 cursor-pointer ${
            isExpanded
              ? 'w-full px-2.5 py-2 flex items-center justify-between gap-2'
              : 'w-10 h-10 mx-auto flex items-center justify-center'
          } ${
            isMicActive
              ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
              : 'bg-white/[0.04] border-white/10 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08]'
          }`}
          title={
            isMicActive
              ? 'Quick Mic: Active (Click to Mute) (Alt+M)'
              : 'Quick Mic: Muted (Click to Unmute) (Alt+M)'
          }
          aria-label="Toggle Quick Voice Mic"
        >
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                {isMicActive ? (
                  <Mic className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <MicOff className="w-4 h-4 shrink-0 text-zinc-500" />
                )}
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs font-medium truncate">Quick Mic</span>
                  <span className="text-[10px] text-zinc-500 truncate">
                    Voice Uplink (Alt+M)
                  </span>
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                  isMicActive
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-zinc-500'
                }`}
              >
                {isMicActive ? 'LIVE' : 'MUTED'}
              </span>
            </>
          ) : isMicActive ? (
            <Mic className="w-4 h-4 text-emerald-400" />
          ) : (
            <MicOff className="w-4 h-4" />
          )}
        </button>
      </div>
    </nav>
  )
}

export default SidebarRail
