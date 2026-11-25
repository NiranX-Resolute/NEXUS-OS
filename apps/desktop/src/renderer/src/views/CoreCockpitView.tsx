import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  Box,
  CalendarClock,
  ChevronDown,
  CloudSun,
  Compass,
  Cpu,
  Database,
  FileSpreadsheet,
  Flame,
  LayoutGrid,
  Mail,
  MapPin,
  Music2,
  Shield,
  Terminal,
  TrendingUp
} from 'lucide-react'
import { useNexusRuntime } from '@renderer/context/NexusRuntimeContext'
import { demandComponentManager } from '@renderer/services/demand-component-manager'
import type { CircuitDrawerId } from '@renderer/components/CircuitDrawers'
import type { WorkspaceMode } from '@renderer/components/TopBar'
import type { StartVisionOptions } from '@renderer/components/VisionSourceModal'

const DashboardView = lazy(() => import('@renderer/views/Dashboard'))
const CoreHUDView = lazy(() =>
  import('@renderer/views/CoreHUDView').then((m) => ({ default: m.CoreHUDView }))
)
const AgentTownCanvas = lazy(() => import('@renderer/components/AgentTownCanvas'))

export type CockpitStageMode = 'workstation' | 'living3d' | 'town'

export interface CoreCockpitViewProps {
  stageMode: CockpitStageMode
  onChangeStageMode: (mode: CockpitStageMode) => void
  workspaceMode: WorkspaceMode
  isIpcOnline: boolean
  telemetry: {
    fps: number
    ramMb: number
    activeSlices: number
    cpuUsagePct: number
    wsConnected: boolean
    lastPingMs: number
  }
  onNavigateTab: (tab: string) => void
  onSelectCircuit: (id: CircuitDrawerId) => void
}

const StageLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full w-full items-center justify-center bg-black/30">
    <div className="flex flex-col items-center gap-3 font-mono text-xs text-emerald-300">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
      <span className="tracking-widest uppercase">INITIALIZING {label}...</span>
    </div>
  </div>
)

const QUICK_WIDGETS: Array<{
  id: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  payload?: Record<string, unknown>
  accent: string
}> = [
  { id: 'terminal', label: 'Terminal', icon: Terminal, accent: 'text-emerald-300' },
  {
    id: 'stock',
    label: 'Stocks',
    icon: TrendingUp,
    payload: { symbol: 'NVDA' },
    accent: 'text-cyan-300'
  },
  { id: 'weather', label: 'Weather', icon: CloudSun, accent: 'text-sky-300' },
  { id: 'emails', label: 'Gmail', icon: Mail, accent: 'text-rose-300' },
  { id: 'rag-oracle', label: 'RAG Oracle', icon: Database, accent: 'text-violet-300' },
  { id: 'music', label: 'Music', icon: Music2, accent: 'text-emerald-300' },
  { id: 'map', label: 'Earth Map', icon: MapPin, accent: 'text-amber-300' },
  { id: 'doc-forge', label: 'Doc Forge', icon: FileSpreadsheet, accent: 'text-cyan-300' },
  { id: 'focus', label: 'Focus', icon: Flame, accent: 'text-orange-300' }
]

const CIRCUIT_SHORTCUTS: Array<{
  id: CircuitDrawerId
  code: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { id: '01', code: '01', label: 'Memory & FTS5', icon: Database },
  { id: '02', code: '02', label: 'Skills & SCOUT', icon: Compass },
  { id: '03', code: '03', label: 'Compute & Vault', icon: Cpu },
  { id: '04', code: '04', label: 'Sandbox & Guard', icon: Shield }
]

const STAGE_OPTIONS: Array<{
  id: CockpitStageMode
  label: string
  testId: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  activeClass: string
}> = [
  {
    id: 'workstation',
    label: 'Cockpit',
    testId: 'cockpit-mode-workstation',
    icon: Activity,
    activeClass: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
  },
  {
    id: 'living3d',
    label: '3D Reactor',
    testId: 'cockpit-mode-living3d',
    icon: Box,
    activeClass: 'border-cyan-400/35 bg-cyan-500/15 text-cyan-200'
  },
  {
    id: 'town',
    label: 'Agent Town',
    testId: 'cockpit-mode-town',
    icon: Bot,
    activeClass: 'border-violet-400/35 bg-violet-500/15 text-violet-200'
  }
]

export const CoreCockpitView: React.FC<CoreCockpitViewProps> = ({
  stageMode,
  onChangeStageMode,
  workspaceMode,
  isIpcOnline,
  telemetry,
  onNavigateTab,
  onSelectCircuit
}) => {
  const runtime = useNexusRuntime()
  const [openMenu, setOpenMenu] = useState<'circuits' | 'widgets' | null>(null)
  const [, setDemandTick] = useState(0)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return demandComponentManager.subscribe(() => {
      setDemandTick((prev) => prev + 1)
    })
  }, [])

  useEffect(() => {
    if (!openMenu) return

    const handlePointerDown = (event: MouseEvent): void => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  const activeWidgetCount = QUICK_WIDGETS.filter((w) =>
    demandComponentManager.isComponentActive(w.id)
  ).length

  const handleToggleWidget = (widget: (typeof QUICK_WIDGETS)[number]): void => {
    const active = demandComponentManager.isComponentActive(widget.id)
    if (active) {
      demandComponentManager.releaseComponent(widget.id, 'cockpit-bar-toggle')
    } else {
      demandComponentManager.demandComponent(widget.id, widget.payload || {}, 'cockpit-bar-launch')
    }
    setOpenMenu(null)
  }

  const mappedVisionMode: 'screen' | 'camera' | 'dual' =
    runtime.visionMode === 'camera' ? 'camera' : runtime.visionMode === 'dual' ? 'dual' : 'screen'

  const dashboardProps = {
    isSystemActive: runtime.isSystemActive,
    isSystemStarting: runtime.isSystemStarting,
    toggleSystem: runtime.toggleSystem,
    isMicMuted: runtime.isMicMuted,
    toggleMic: runtime.toggleMic,
    isVideoOn: runtime.isVideoOn,
    visionMode: mappedVisionMode,
    startVision: (mode: 'camera' | 'screen' | 'dual', options?: StartVisionOptions): void => {
      void runtime.startVisionWithSource(mode, options)
    },
    stopVision: runtime.stopVision,
    activeStream: runtime.activeStream,
    activeCameraStream: runtime.activeCameraStream
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Minimal 2-Zone Core Stage Header */}
      <div className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/60 px-5 py-2.5 backdrop-blur-xl shrink-0">
        {/* Left: 3-Option Segmented Stage Switcher */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {STAGE_OPTIONS.map((option) => {
            const Icon = option.icon
            const isSelected = stageMode === option.id
            return (
              <button
                key={option.id}
                type="button"
                data-testid={option.testId}
                onClick={() => onChangeStageMode(option.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? option.activeClass
                    : 'border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                }`}
              >
                <Icon size={13} />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>

        {/* Right: Circuits (01–04) & Widgets & Deck Dropdown Popovers */}
        <div ref={menuContainerRef} className="relative flex items-center gap-2">
          {/* Popover 1: Circuits (01–04) */}
          <div className="relative">
            <button
              type="button"
              data-testid="cockpit-circuits-trigger"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'circuits'}
              onClick={() => setOpenMenu((prev) => (prev === 'circuits' ? null : 'circuits'))}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                openMenu === 'circuits'
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]'
              }`}
            >
              <Cpu size={13} className="text-emerald-400" />
              <span>Circuits (01–04)</span>
              <ChevronDown
                size={13}
                className={`text-zinc-400 transition-transform ${
                  openMenu === 'circuits' ? 'rotate-180' : ''
                }`}
              />
            </button>

            {openMenu === 'circuits' && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-2xl"
              >
                <div className="px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                  Living Core Circuits
                </div>
                <div className="space-y-0.5">
                  {CIRCUIT_SHORTCUTS.map((circuit) => {
                    const Icon = circuit.icon
                    return (
                      <button
                        key={circuit.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onSelectCircuit(circuit.id)
                          setOpenMenu(null)
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon size={14} className="text-cyan-400" />
                          <span>{circuit.label}</span>
                        </span>
                        <span className="rounded-md border border-emerald-400/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                          {circuit.code}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Popover 2: Widgets & Deck */}
          <div className="relative">
            <button
              type="button"
              data-testid="cockpit-widgets-trigger"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'widgets'}
              onClick={() => setOpenMenu((prev) => (prev === 'widgets' ? null : 'widgets'))}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                openMenu === 'widgets'
                  ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
                  : 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08]'
              }`}
            >
              <LayoutGrid size={13} className="text-cyan-400" />
              <span>Widgets &amp; Deck</span>
              {activeWidgetCount > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  {activeWidgetCount}
                </span>
              )}
              <ChevronDown
                size={13}
                className={`text-zinc-400 transition-transform ${
                  openMenu === 'widgets' ? 'rotate-180' : ''
                }`}
              />
            </button>

            {openMenu === 'widgets' && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-1.5 shadow-2xl backdrop-blur-2xl"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                  <span>Demand Widgets</span>
                  {activeWidgetCount > 0 && (
                    <span className="text-emerald-400">{activeWidgetCount} active</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {QUICK_WIDGETS.map((w) => {
                    const Icon = w.icon
                    const active = demandComponentManager.isComponentActive(w.id)
                    return (
                      <button
                        key={w.id}
                        type="button"
                        role="menuitem"
                        data-testid={`cockpit-widget-${w.id}`}
                        onClick={() => handleToggleWidget(w)}
                        title={`${active ? 'Close' : 'Summon'} ${w.label} Widget`}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20'
                            : 'text-zinc-200 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <Icon size={14} className={w.accent} />
                          <span>{w.label}</span>
                        </span>
                        {active && (
                          <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Active</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                <div className="my-1.5 border-t border-white/10" />

                <button
                  type="button"
                  role="menuitem"
                  data-testid="cockpit-jump-autopilot"
                  onClick={() => {
                    onNavigateTab('routines')
                    setOpenMenu(null)
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-cyan-500/10 hover:text-cyan-200 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarClock size={14} className="text-cyan-400" />
                    <span>Autopilot &amp; Timers</span>
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">Suite</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Core Stage Surface */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {stageMode === 'workstation' && (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            <Suspense fallback={<StageLoader label="Tactical Workstation" />}>
              <DashboardView
                props={dashboardProps}
                stats={runtime.systemTelemetry}
                chatHistory={runtime.historyMessages}
                onVisionClick={runtime.openVisionPicker}
              />
            </Suspense>
          </div>
        )}

        {stageMode === 'living3d' && (
          <Suspense fallback={<StageLoader label="3D Dyson Core" />}>
            <CoreHUDView
              workspaceMode={workspaceMode}
              telemetry={telemetry}
              onNavigateTab={onNavigateTab}
              onSelectCircuit={onSelectCircuit}
              isIpcOnline={isIpcOnline}
            />
          </Suspense>
        )}

        {stageMode === 'town' && (
          <div className="h-full w-full overflow-auto p-3">
            <Suspense fallback={<StageLoader label="Agent Town 2D Canvas" />}>
              <AgentTownCanvas />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}

export default CoreCockpitView
