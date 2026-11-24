// apps/desktop/src/renderer/src/components/SidebarRail.tsx
// NEXUS OS v5.0 — 68px Left Spatial Navigation Rail with 1-Click Expand Toggle
// 10 Spatial Modules with Monochrome Icons & Cyber HUD Tooltips + DOCKED FOOTER

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
  Activity
} from 'lucide-react'
import nexusLogo from '../assets/nexus-logo.png'

export type MasterTab =
  | 'core'
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
    fullLabel: 'Core Stage',
    icon: Cpu,
    badge: '3D',
    shortcut: 'Alt+1',
    description: 'Living Core 3D Stage & 4 SVG Bezier Conduit Arcs'
  },
  {
    id: 'studio',
    num: '02',
    label: 'Studio',
    fullLabel: 'NexKoder Studio',
    icon: Code2,
    badge: 'AST',
    shortcut: 'Alt+2',
    description: 'NexKoder AST Code Editor & Multi-Pane Diff'
  },
  {
    id: 'scholar',
    num: '03',
    label: 'Memory & Scholar',
    fullLabel: 'Memory & Scholar Lab',
    icon: BookOpen,
    badge: 'ARXIV',
    shortcut: 'Alt+3',
    description: '3D Memory Galaxy & Deep Research Scholar Lab',
    aliases: ['memory', 'scholar']
  },
  {
    id: 'routines',
    num: '04',
    label: 'Autopilot & Macros',
    fullLabel: 'Autopilot & Macros',
    icon: Zap,
    badge: 'MACROS',
    shortcut: 'Alt+4',
    description: 'Orbital Autopilot Dial & Voice Macro Composer',
    aliases: ['routines', 'autopilot', 'macros']
  },
  {
    id: 'interview',
    num: '05',
    label: 'Interview',
    fullLabel: 'Interview Copilot',
    icon: UserCheck,
    badge: 'STEALTH',
    shortcut: 'Alt+5',
    description: 'Low-Profile Stealth HUD & Real-Time Copilot'
  },
  {
    id: 'world',
    num: '06',
    label: 'World & Browser',
    fullLabel: 'World & Browser Tactical Suite',
    icon: Globe,
    badge: 'RADAR',
    shortcut: 'Alt+6',
    description: 'PlanetWatch 3D Radar, AgentTown & Obscura Browser',
    aliases: ['world', 'globe', 'obscura', 'browser']
  },
  {
    id: 'vault',
    num: '07',
    label: 'Board & Vault',
    fullLabel: 'Board & Vault Hub',
    icon: PenTool,
    badge: 'TLDRAW',
    shortcut: 'Alt+7',
    description: 'Holographic Blueprint Board & Visual Gallery Vault',
    aliases: ['vault', 'board']
  },
  {
    id: 'theme',
    num: '08',
    label: 'Theme Forge',
    fullLabel: 'Theme Forge Studio',
    icon: Palette,
    badge: 'WEBGL',
    shortcut: 'Alt+8',
    description: 'Cyberpunk Theme Presets & WebGL Shader Engine',
    aliases: ['theme', 'themes', 'forge']
  },
  {
    id: 'profile',
    num: '09',
    label: 'Profile',
    fullLabel: 'Profile Enclave',
    icon: ShieldCheck,
    badge: 'DPAPI',
    shortcut: 'Alt+9',
    description: 'Sovereign Dossier, DPAPI Vault & AgentShield AST Score',
    aliases: ['profile', 'enclave']
  },
  {
    id: 'settings',
    num: '10',
    label: 'Settings',
    fullLabel: 'Settings Command Center',
    icon: Settings,
    badge: 'CONFIG',
    shortcut: 'Alt+0',
    description: '7-Tab Sovereign Configuration Hub & MCP Marketplace',
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
  // 1-Click Expand Toggle State (Self-managed fallback)
  const [internalExpanded, setInternalExpanded] = useState<boolean>(false)
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded

  const toggleExpand = useCallback(() => {
    if (onToggleExpand) {
      onToggleExpand()
    } else {
      setInternalExpanded((prev) => !prev)
    }
  }, [onToggleExpand])

  // Split-Core State (Self-managed fallback)
  const [internalSplitCore, setInternalSplitCore] = useState<boolean>(false)
  const isSplitCore = controlledSplitCore !== undefined ? controlledSplitCore : internalSplitCore

  const toggleSplitCore = useCallback(() => {
    if (onToggleSplitCore) {
      onToggleSplitCore()
    } else {
      setInternalSplitCore((prev) => !prev)
    }
  }, [onToggleSplitCore])

  // Mic State (Self-managed fallback)
  const [internalMicActive, setInternalMicActive] = useState<boolean>(false)
  const isMicActive = controlledMicActive !== undefined ? controlledMicActive : internalMicActive

  const toggleMic = useCallback(() => {
    if (onToggleMic) {
      onToggleMic()
    } else {
      setInternalMicActive((prev) => !prev)
    }
  }, [onToggleMic])

  // Infinity Slice RAM Telemetry State
  const [telemetryRam, setTelemetryRam] = useState<number>(ramMb ?? 142)
  const [telemetrySlices, setTelemetrySlices] = useState<number>(activeSlices ?? 5)

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
        const res = await fetch('http://127.0.0.1:47630/api/health')
        if (res.ok) {
          const data = await res.json()
          if (isMounted) {
            if (typeof data.ram_mb === 'number') setTelemetryRam(Math.round(data.ram_mb))
            if (typeof data.active_slices === 'number') setTelemetrySlices(data.active_slices)
          }
        }
      } catch {
        // Fallback to JS heap memory in browser environment if available
        if (typeof window !== 'undefined' && (performance as unknown as { memory?: { usedJSHeapSize?: number } })?.memory?.usedJSHeapSize) {
          const heap = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
          const used = Math.round(heap / (1024 * 1024))
          if (isMounted && used > 0) setTelemetryRam(used)
        }
      }
    }

    checkTelemetry()
    const timer = setInterval(checkTelemetry, 5000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [ramMb])

  // Keyboard navigation shortcuts: Alt+1..Alt+9, Alt+0, Alt+M
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key >= '1' && e.key <= '9') {
          const idx = parseInt(e.key, 10) - 1
          if (RAIL_TABS[idx]) {
            e.preventDefault()
            onSelectTab(RAIL_TABS[idx].id)
          }
        } else if (e.key === '0') {
          if (RAIL_TABS[9]) {
            e.preventDefault()
            onSelectTab(RAIL_TABS[9].id)
          }
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault()
          toggleMic()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectTab, toggleMic])

  // Active tab resolver
  const isTabActive = (item: RailTabItem): boolean => {
    if (activeTab === item.id) return true
    if (item.aliases && item.aliases.includes(activeTab as string)) return true
    return false
  }

  return (
    <nav
      className={`relative flex flex-col justify-between py-2.5 z-30 shrink-0 select-none bg-slate-950/90 backdrop-blur-2xl border-r border-white/10 transition-all duration-300 ease-in-out ${
        isExpanded ? 'w-[240px] min-w-[240px]' : 'w-[68px] min-w-[68px]'
      }`}
      aria-label="NEXUS Spatial Navigation Rail"
    >
      {/* =====================================================================
          TOP HEADER: LOGO BRAND BUTTON & 1-CLICK EXPAND TOGGLE
         ===================================================================== */}
      <div className="flex flex-col items-center px-2 mb-2 gap-2 shrink-0">
        <div
          className={`w-full flex items-center ${
            isExpanded ? 'justify-between px-1' : 'justify-center flex-col gap-1.5'
          }`}
        >
          {/* Logo Brand Button */}
          <button
            onClick={() => onSelectTab('core')}
            className={`relative rounded-xl overflow-hidden border transition-all duration-200 flex items-center justify-center cursor-pointer group ${
              isExpanded
                ? 'h-9 px-2 gap-2 bg-white/5 border-white/10 hover:border-cyan-400/40'
                : 'w-11 h-11 p-1'
            } ${
              isTabActive(RAIL_TABS[0])
                ? 'border-cyan-400/80 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.45)]'
                : 'border-white/10 bg-white/5 hover:border-cyan-400/40 hover:bg-white/10'
            }`}
            title="01 Core — Living Core Stage (Alt+1)"
            aria-label="01 Core — Living Core Stage"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
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
                <span className="text-[8px] font-mono text-cyan-400 tracking-widest font-semibold">
                  v5.0 SPATIAL
                </span>
              </div>
            )}
          </button>

          {/* 1-Click Expand / Collapse Toggle Button */}
          <button
            onClick={toggleExpand}
            className={`rounded-lg flex items-center justify-center border transition-all duration-200 cursor-pointer ${
              isExpanded
                ? 'w-7 h-7 bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400 hover:text-white'
                : 'w-11 h-6 bg-white/5 hover:bg-white/10 border-white/10 text-zinc-400 hover:text-cyan-300'
            }`}
            title={isExpanded ? 'Collapse Rail to 68px' : '1-Click Expand Rail'}
            aria-label={isExpanded ? 'Collapse Navigation Rail' : 'Expand Navigation Rail'}
          >
            {isExpanded ? (
              <PanelLeftClose className="w-3.5 h-3.5" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* =====================================================================
          MIDDLE: 10 SPATIAL MODULES WITH MONOCHROME ICONS & TOOLTIPS
         ===================================================================== */}
      <div className="flex-1 flex flex-col items-center gap-1.5 px-2 overflow-y-auto overflow-x-hidden no-scrollbar">
        {RAIL_TABS.map((tab) => {
          const Icon = tab.icon
          const active = isTabActive(tab)

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative group transition-all duration-200 cursor-pointer ${
                isExpanded
                  ? 'w-full px-2.5 py-2 rounded-xl flex items-center justify-between border'
                  : 'w-12 h-11 rounded-xl flex flex-col items-center justify-center border'
              } ${
                active
                  ? 'bg-white/10 border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.12)]'
                  : 'border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/5 hover:border-white/5'
              }`}
              title={`${tab.num} ${tab.label} (${tab.shortcut})`}
            >
              {/* Active glowing indicator strip */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-cyan-400 rounded-r-full shadow-[0_0_8px_#22d3ee]" />
              )}

              {isExpanded ? (
                // EXPANDED VIEW: Number + Monochrome Icon + Label + Badge
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-zinc-500 font-bold shrink-0">
                    {tab.num}
                  </span>
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                      active
                        ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.6)]'
                        : 'text-zinc-400 group-hover:text-zinc-100'
                    }`}
                  />
                  <div className="flex flex-col text-left truncate flex-1">
                    <span
                      className={`text-xs font-mono font-medium truncate ${
                        active ? 'text-white' : 'text-zinc-300'
                      }`}
                    >
                      {tab.label}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-white/10 bg-white/5 text-zinc-400 shrink-0">
                    {tab.badge}
                  </span>
                </div>
              ) : (
                // COLLAPSED 68px VIEW: Monochrome Icon + Micro Number + Cyber Tooltip
                <>
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      active
                        ? 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]'
                        : 'text-zinc-400 group-hover:text-zinc-100'
                    }`}
                  />
                  <span
                    className={`text-[8px] font-mono tracking-wider mt-0.5 leading-none ${
                      active ? 'text-cyan-300 font-bold' : 'text-zinc-400'
                    }`}
                  >
                    {tab.num}
                  </span>

                  {/* Rich Cyber HUD Floating Tooltip for 68px Rail */}
                  <div className="absolute left-[72px] top-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-slate-950/95 border border-cyan-500/30 text-left whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-[0_0_20px_rgba(0,0,0,0.85)] backdrop-blur-xl z-50 min-w-[210px]">
                    {/* Triangular pointer arrow */}
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-950 border-l border-b border-cyan-500/30 rotate-45" />

                    <div className="relative z-10 flex items-center justify-between gap-3 pb-1 border-b border-white/10">
                      <span className="font-mono text-xs font-bold text-slate-100">
                        {tab.num} {tab.label.toUpperCase()}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-400/30 text-cyan-300">
                        {tab.badge}
                      </span>
                    </div>
                    <p className="relative z-10 text-[10px] font-mono text-zinc-400 mt-1 leading-snug">
                      {tab.description}
                    </p>
                    <div className="relative z-10 flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1.5 pt-1 border-t border-white/5">
                      <span>SHORTCUT</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 font-bold">
                        {tab.shortcut}
                      </kbd>
                    </div>
                  </div>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* =====================================================================
          BOTTOM FOOTER: INFINITY SLICE RAM, SPLIT-CORE TOGGLE, QUICK MIC
         ===================================================================== */}
      <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5 px-2 shrink-0">
        {/* 1. Infinity Slice RAM Telemetry */}
        <div
          className={`relative group rounded-xl border transition-all duration-200 cursor-pointer ${
            isExpanded
              ? 'w-full px-2.5 py-2 bg-white/5 border-white/10 flex flex-col gap-1 hover:border-cyan-500/40'
              : 'w-12 h-11 mx-auto flex flex-col items-center justify-center bg-white/5 border-white/10 hover:border-cyan-500/40'
          }`}
          title="Infinity Slice RAM Status"
        >
          {isExpanded ? (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-zinc-300 font-semibold tracking-wider">
                    INFINITY RAM
                  </span>
                </div>
                <span className="font-mono text-[9px] text-cyan-400 font-bold">
                  {telemetryRam} MB
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                <span>SLICES: {telemetrySlices}</span>
                <span className="text-emerald-400 font-semibold">WAL SYNC</span>
              </div>
              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500 shadow-[0_0_6px_#22d3ee]"
                  style={{
                    width: `${Math.min(100, Math.max(15, (telemetryRam / 1024) * 100))}%`
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Activity className="w-4 h-4 text-zinc-400 group-hover:text-cyan-300 transition-colors" />
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
              </div>
              <span className="text-[8px] font-mono font-bold text-zinc-300 mt-0.5">
                {telemetryRam}M
              </span>

              {/* Floating Tooltip for Infinity RAM */}
              <div className="absolute left-[72px] bottom-0 px-3 py-2 rounded-xl bg-slate-950/95 border border-cyan-500/30 text-left whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-[0_0_20px_rgba(0,0,0,0.85)] backdrop-blur-xl z-50 min-w-[200px]">
                <div className="absolute -left-1.5 bottom-3 w-3 h-3 bg-slate-950 border-l border-b border-cyan-500/30 rotate-45" />
                <div className="relative z-10 flex items-center justify-between pb-1 border-b border-white/10">
                  <span className="font-mono text-xs font-bold text-slate-100">
                    INFINITY SLICE RAM
                  </span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                    ACTIVE
                  </span>
                </div>
                <div className="relative z-10 font-mono text-[10px] text-zinc-400 mt-1 flex flex-col gap-0.5">
                  <div>
                    Allocated Memory: <span className="text-cyan-300 font-bold">{telemetryRam} MB</span>
                  </div>
                  <div>
                    Active Slices: <span className="text-slate-200 font-bold">{telemetrySlices}</span>
                  </div>
                  <div>
                    Storage Mesh: <span className="text-emerald-400 font-bold">SQLite WAL Mesh</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 2. Split-Core Viewport Toggle */}
        <button
          onClick={toggleSplitCore}
          className={`relative group rounded-xl border transition-all duration-200 cursor-pointer ${
            isExpanded
              ? 'w-full px-2.5 py-2 flex items-center justify-between'
              : 'w-12 h-10 mx-auto flex items-center justify-center'
          } ${
            isSplitCore
              ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
              : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
          }`}
          title={`Split-Core: ${
            isSplitCore ? 'Split-Stage (32% Orb / 68% Stage)' : 'Full Viewport'
          }`}
          aria-label="Toggle Split-Core Viewport"
        >
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2">
                <Columns className="w-4 h-4 shrink-0" />
                <span className="font-mono text-xs font-medium">Split-Core</span>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  isSplitCore
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-zinc-400'
                }`}
              >
                {isSplitCore ? '32/68' : 'FULL'}
              </span>
            </>
          ) : (
            <>
              <Columns className="w-4 h-4" />
              {/* Floating Tooltip */}
              <div className="absolute left-[72px] bottom-0 px-3 py-2 rounded-xl bg-slate-950/95 border border-cyan-500/30 text-left whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-[0_0_20px_rgba(0,0,0,0.85)] backdrop-blur-xl z-50 min-w-[190px]">
                <div className="absolute -left-1.5 bottom-3 w-3 h-3 bg-slate-950 border-l border-b border-cyan-500/30 rotate-45" />
                <div className="relative z-10 flex items-center justify-between gap-3 pb-1 border-b border-white/10">
                  <span className="font-mono text-xs font-bold text-slate-100">SPLIT-CORE</span>
                  <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                    {isSplitCore ? '32/68 STAGE' : 'FULL STAGE'}
                  </span>
                </div>
                <p className="relative z-10 text-[10px] font-mono text-zinc-400 mt-1">
                  {isSplitCore ? 'Docked 32% Core Orb + 68% Stage' : 'Full Stage Viewport'}
                </p>
              </div>
            </>
          )}
        </button>

        {/* 3. Quick Mic Toggle */}
        <button
          onClick={toggleMic}
          className={`relative group rounded-xl border transition-all duration-200 cursor-pointer ${
            isExpanded
              ? 'w-full px-2.5 py-2 flex items-center justify-between'
              : 'w-12 h-10 mx-auto flex items-center justify-center'
          } ${
            isMicActive
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] animate-pulse'
              : 'bg-white/5 border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/10'
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
              <div className="flex items-center gap-2">
                {isMicActive ? (
                  <Mic className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <MicOff className="w-4 h-4 shrink-0 text-zinc-500" />
                )}
                <span className="font-mono text-xs font-medium">Quick Mic</span>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  isMicActive
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-white/5 border-white/10 text-zinc-500'
                }`}
              >
                {isMicActive ? 'LIVE' : 'MUTED'}
              </span>
            </>
          ) : (
            <>
              {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {/* Floating Tooltip */}
              <div className="absolute left-[72px] bottom-0 px-3 py-2 rounded-xl bg-slate-950/95 border border-cyan-500/30 text-left whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 shadow-[0_0_20px_rgba(0,0,0,0.85)] backdrop-blur-xl z-50 min-w-[180px]">
                <div className="absolute -left-1.5 bottom-3 w-3 h-3 bg-slate-950 border-l border-b border-cyan-500/30 rotate-45" />
                <div className="relative z-10 flex items-center justify-between gap-3 pb-1 border-b border-white/10">
                  <span className="font-mono text-xs font-bold text-slate-100">QUICK MIC</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded border ${
                      isMicActive
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-white/5 border-white/10 text-zinc-500'
                    }`}
                  >
                    {isMicActive ? 'LIVE' : 'MUTED'}
                  </span>
                </div>
                <p className="relative z-10 text-[10px] font-mono text-zinc-400 mt-1">
                  {isMicActive ? 'Mic Active • Click to Mute' : 'Mic Muted • Click to Listen'}
                </p>
              </div>
            </>
          )}
        </button>
      </div>
    </nav>
  )
}

export default SidebarRail
