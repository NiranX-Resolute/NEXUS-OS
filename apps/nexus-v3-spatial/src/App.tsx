import React, { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  Command,
  Copy,
  Cpu,
  Globe,
  Info,
  Lock,
  MessageSquare,
  MessageSquareQuote,
  Minus,
  PanelRight,
  RefreshCw,
  Settings,
  ShieldAlert,
  Square,
  X,
  Zap,
} from 'lucide-react'
import { CircuitDrawer } from '@/components/CircuitDrawer'
import { CommandPalette } from '@/components/CommandPalette'
import { useNexusStore } from '@/store/useNexusStore'
import type { NavTabId, ToastTone, WorkspaceMode } from '@/types'

const CockpitView = lazy(() => import('@/views/CockpitView'))
const ChatView = lazy(() => import('@/views/ChatView'))
const StudioView = lazy(() => import('@/views/StudioView'))
const ScholarView = lazy(() => import('@/views/ScholarView'))
const AutopilotView = lazy(() => import('@/views/AutopilotView'))
const InterviewView = lazy(() => import('@/views/InterviewView'))
const WorldView = lazy(() => import('@/views/WorldView'))
const VaultView = lazy(() => import('@/views/VaultView'))
const SettingsView = lazy(() => import('@/views/SettingsView'))

const WORKSPACE_MODES: WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT']

const DOCK_TABS: Array<{
  id: NavTabId
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { id: 'core', label: 'Core', icon: Cpu },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'studio', label: 'Studio', icon: Code2 },
  { id: 'scholar', label: 'Scholar', icon: BookOpen },
  { id: 'autopilot', label: 'Autopilot', icon: Zap },
  { id: 'interview', label: 'Interview', icon: MessageSquareQuote },
  { id: 'world', label: 'World', icon: Globe },
  { id: 'vault', label: 'Vault', icon: Lock },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface ViewBoundaryProps {
  tabKey: NavTabId
  onResetTab: () => void
  children: React.ReactNode
}

interface ViewBoundaryState {
  errorMessage: string | null
}

class SpatialViewErrorBoundary extends Component<ViewBoundaryProps, ViewBoundaryState> {
  state: ViewBoundaryState = { errorMessage: null }

  static getDerivedStateFromError(error: Error): ViewBoundaryState {
    return { errorMessage: error.message || 'Spatial module failed to render' }
  }

  componentDidUpdate(prevProps: ViewBoundaryProps): void {
    if (prevProps.tabKey !== this.props.tabKey && this.state.errorMessage) {
      this.setState({ errorMessage: null })
    }
  }

  render(): React.ReactNode {
    if (this.state.errorMessage) {
      return (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="spatial-panel flex max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Module Render Notice</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                {this.state.errorMessage}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => this.setState({ errorMessage: null })}
                className="spatial-pill rounded-xl px-4 py-2 text-xs font-medium text-slate-200"
              >
                Retry View
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ errorMessage: null })
                  this.props.onResetTab()
                }}
                className="spatial-pill-active rounded-xl px-4 py-2 text-xs font-medium text-emerald-200"
              >
                Return to Core
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function getToastStyles(tone: ToastTone): {
  borderClass: string
  iconClass: string
  Icon: React.ComponentType<{ className?: string }>
} {
  switch (tone) {
    case 'success':
      return {
        borderClass: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100',
        iconClass: 'text-emerald-300',
        Icon: CheckCircle2,
      }
    case 'warning':
      return {
        borderClass: 'border-amber-400/35 bg-amber-400/10 text-amber-100',
        iconClass: 'text-amber-300',
        Icon: AlertTriangle,
      }
    case 'error':
      return {
        borderClass: 'border-rose-400/40 bg-rose-500/15 text-rose-100',
        iconClass: 'text-rose-300',
        Icon: ShieldAlert,
      }
    default:
      return {
        borderClass: 'border-white/15 bg-white/[0.06] text-slate-100',
        iconClass: 'text-emerald-300',
        Icon: Info,
      }
  }
}

function SpatialLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="spatial-panel flex items-center gap-3 rounded-2xl px-5 py-3.5 text-xs text-slate-300">
        <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
        <span>Loading spatial workspace...</span>
      </div>
    </div>
  )
}

export function App() {
  const activeTab = useNexusStore((s) => s.activeTab)
  const setActiveTab = useNexusStore((s) => s.setActiveTab)
  const telemetry = useNexusStore((s) => s.telemetry)
  const tasks = useNexusStore((s) => s.tasks)
  const isOnline = useNexusStore((s) => s.isOnline)
  const setCommandPaletteOpen = useNexusStore((s) => s.setCommandPaletteOpen)
  const drawerOpen = useNexusStore((s) => s.drawerOpen)
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen)
  const toast = useNexusStore((s) => s.toast)
  const dismissToast = useNexusStore((s) => s.dismissToast)
  const connectTelemetryWs = useNexusStore((s) => s.connectTelemetryWs)
  const disconnectTelemetryWs = useNexusStore((s) => s.disconnectTelemetryWs)
  const refreshAll = useNexusStore((s) => s.refreshAll)
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode)
  const toggleEstop = useNexusStore((s) => s.toggleEstop)

  const [hasElectronWindow] = useState(
    () => typeof window !== 'undefined' && Boolean(window.nexusWindow),
  )
  const [isMaximized, setIsMaximized] = useState(false)
  const [modeBusy, setModeBusy] = useState(false)
  const [estopBusy, setEstopBusy] = useState(false)

  // Boot live IPC snapshot, WebSocket telemetry stream, and periodic fallback sync
  useEffect(() => {
    void refreshAll()
    connectTelemetryWs()

    const timer = window.setInterval(() => {
      void refreshAll()
    }, 12000)

    return () => {
      window.clearInterval(timer)
      disconnectTelemetryWs()
    }
  }, [connectTelemetryWs, disconnectTelemetryWs, refreshAll])

  // Global Ctrl+K / Cmd+K spotlight binding
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const currentlyOpen = useNexusStore.getState().commandPaletteOpen
        setCommandPaletteOpen(!currentlyOpen)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setCommandPaletteOpen])

  // Sync Electron window maximize state if inside frameless Electron shell
  const syncMaximizedState = useCallback(async () => {
    if (!window.nexusWindow?.isMaximized) return
    try {
      const maxState = await window.nexusWindow.isMaximized()
      setIsMaximized(Boolean(maxState))
    } catch {
      // Ignore bridge error outside Electron
    }
  }, [])

  useEffect(() => {
    if (!hasElectronWindow) return
    void syncMaximizedState()
    const onResize = () => {
      void syncMaximizedState()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [hasElectronWindow, syncMaximizedState])

  const handleModeSelect = async (mode: WorkspaceMode) => {
    if (modeBusy || mode === telemetry.workspaceMode) return
    setModeBusy(true)
    try {
      await switchWorkspaceMode(mode)
    } finally {
      setModeBusy(false)
    }
  }

  const handleToggleEstop = async () => {
    if (estopBusy) return
    setEstopBusy(true)
    try {
      await toggleEstop('Top Status Pill E-Stop')
    } finally {
      setEstopBusy(false)
    }
  }

  const activeTasksCount = tasks.filter((t) => {
    const u = t.status.toUpperCase()
    return u === 'QUEUED' || u === 'RUNNING' || u === 'IN_PROGRESS'
  }).length

  const renderActiveView = () => {
    switch (activeTab) {
      case 'core':
        return <CockpitView onNavigate={setActiveTab} />
      case 'chat':
        return <ChatView />
      case 'studio':
        return <StudioView />
      case 'scholar':
        return <ScholarView />
      case 'autopilot':
        return <AutopilotView />
      case 'interview':
        return <InterviewView />
      case 'world':
        return <WorldView />
      case 'vault':
        return <VaultView />
      case 'settings':
        return <SettingsView />
      default:
        return <CockpitView onNavigate={setActiveTab} />
    }
  }

  const toastMeta = toast ? getToastStyles(toast.tone) : null

  return (
    <div className="spatial-canvas relative h-screen w-screen overflow-hidden text-slate-100">
      {/* Subtle Ambient Spatial Mint Orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-emerald-400/[0.06] blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-500/[0.05] blur-3xl" />
      </div>

      {/* Centered Floating Top Status Pill */}
      <header className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4">
        <div className="app-drag pointer-events-auto spatial-panel flex max-w-full items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 backdrop-blur-2xl">
          {/* Brand + Live Pulse */}
          <button
            type="button"
            onClick={() => setActiveTab('core')}
            className="app-no-drag flex items-center gap-2 rounded-full px-2 py-1 text-left transition hover:bg-white/[0.05]"
            title={
              telemetry.estopActive
                ? 'Emergency Stop Engaged'
                : isOnline
                  ? `IPC Connected (${telemetry.pingMs || 1}ms)`
                  : 'IPC Standby'
            }
          >
            <span
              className={`h-2 w-2 rounded-full ${
                telemetry.estopActive
                  ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.9)] animate-pulse'
                  : isOnline
                    ? 'bg-emerald-400 animate-mint-breathe'
                    : 'bg-slate-500'
              }`}
            />
            <span className="text-xs font-semibold tracking-[0.14em] text-slate-100">
              NEXUS V3
            </span>
            {telemetry.pingMs > 0 && isOnline && (
              <span className="hidden font-mono text-[10px] text-emerald-300/80 sm:inline">
                {telemetry.pingMs}ms
              </span>
            )}
          </button>

          <span className="h-4 w-px bg-white/10" />

          {/* Workspace Mode Selector */}
          <div
            role="group"
            aria-label="Workspace Mode"
            className="app-no-drag flex items-center gap-1 rounded-full bg-black/25 p-0.5"
          >
            {WORKSPACE_MODES.map((mode) => {
              const selected = telemetry.workspaceMode === mode
              const isSilent = mode === 'SILENT'
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={modeBusy}
                  onClick={() => void handleModeSelect(mode)}
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium transition disabled:opacity-60 ${
                    selected
                      ? isSilent
                        ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200'
                        : 'spatial-pill-active text-emerald-200'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              )
            })}
          </div>

          <span className="h-4 w-px bg-white/10" />

          {/* Command Palette Trigger (Ctrl+K) */}
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="app-no-drag spatial-pill flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-200"
            title="Open Command Palette (Ctrl+K)"
          >
            <Command className="h-3.5 w-3.5 text-emerald-300" />
            <span className="hidden font-mono text-[10px] text-slate-300 md:inline">Ctrl+K</span>
          </button>

          {/* Circuit Telemetry Drawer Toggle */}
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-pressed={drawerOpen}
            className={`app-no-drag flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
              drawerOpen
                ? 'spatial-pill-active text-emerald-200'
                : 'spatial-pill text-slate-200'
            }`}
            title="Toggle Circuit Telemetry Drawer"
          >
            {drawerOpen ? (
              <PanelRight className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <Activity className="h-3.5 w-3.5 text-emerald-300" />
            )}
            <span className="hidden sm:inline">Inspector</span>
            {activeTasksCount > 0 && (
              <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.2 font-mono text-[9px] text-emerald-200">
                {activeTasksCount}
              </span>
            )}
          </button>

          {/* E-Stop Control */}
          <button
            type="button"
            disabled={estopBusy}
            onClick={() => void handleToggleEstop()}
            className={`app-no-drag flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold transition disabled:opacity-60 ${
              telemetry.estopActive
                ? 'border-rose-400/60 bg-rose-500/25 text-rose-100 shadow-[0_0_20px_-4px_rgba(244,63,94,0.65)] animate-pulse'
                : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200'
            }`}
            title={
              telemetry.estopActive
                ? 'Click to reset Emergency Stop'
                : 'Assert Emergency Stop (halt child agents)'
            }
          >
            <ShieldAlert className="h-3.5 w-3.5 text-rose-300" />
            <span>{telemetry.estopActive ? 'RESET E-STOP' : 'E-STOP'}</span>
          </button>

          {/* Frameless Electron Window Controls */}
          {hasElectronWindow && (
            <>
              <span className="h-4 w-px bg-white/10" />
              <div className="app-no-drag flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => window.nexusWindow?.minimize()}
                  aria-label="Minimize window"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-100"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    window.nexusWindow?.maximize()
                    window.requestAnimationFrame(() => {
                      void syncMaximizedState()
                    })
                  }}
                  aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/[0.08] hover:text-slate-100"
                >
                  {isMaximized ? (
                    <Copy className="h-3 w-3" />
                  ) : (
                    <Square className="h-3 w-3" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => window.nexusWindow?.close()}
                  aria-label="Close window"
                  className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Floating Toast Alert */}
      {toast && toastMeta && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
        >
          <div
            className={`pointer-events-auto spatial-panel flex max-w-lg items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-xs backdrop-blur-2xl animate-spatial-enter ${toastMeta.borderClass}`}
          >
            <toastMeta.Icon className={`h-4 w-4 shrink-0 ${toastMeta.iconClass}`} />
            <span className="leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss alert"
              className="ml-1 rounded-lg p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Open Edge-to-Edge Spatial Viewport */}
      <main className="relative h-full w-full overflow-hidden">
        <div className="mx-auto h-full max-w-[1440px] px-6 pb-24 pt-16">
          <SpatialViewErrorBoundary
            tabKey={activeTab}
            onResetTab={() => setActiveTab('core')}
          >
            <Suspense fallback={<SpatialLoadingFallback />}>
              {renderActiveView()}
            </Suspense>
          </SpatialViewErrorBoundary>
        </div>
      </main>

      {/* Centered Floating Bottom Glass Dock */}
      <nav
        aria-label="Nexus Spatial Navigation Dock"
        className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2"
      >
        <div className="spatial-dock flex items-center gap-1 rounded-3xl border border-white/10 px-2.5 py-2 backdrop-blur-2xl sm:gap-1.5">
          {DOCK_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={`group relative flex h-9 w-9 items-center justify-center rounded-2xl transition-all duration-200 hover:-translate-y-1 hover:scale-105 sm:h-11 sm:w-11 ${
                  isActive
                    ? 'spatial-pill-active text-emerald-300 mint-glow'
                    : 'text-slate-400 hover:bg-white/[0.07] hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />

                {/* Floating VisionOS/macOS Hover Label */}
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0b1016]/95 px-2.5 py-1 text-[11px] font-medium text-slate-100 opacity-0 shadow-lg backdrop-blur-xl transition-all duration-150 group-hover:-top-10 group-hover:opacity-100">
                  {tab.label}
                </span>

                {/* Active Mint Indicator Dot */}
                {isActive && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Slide-Over Frosted Right Circuit Drawer */}
      <CircuitDrawer />

      {/* Global Ctrl+K Spotlight Command Palette */}
      <CommandPalette />
    </div>
  )
}

export default App
