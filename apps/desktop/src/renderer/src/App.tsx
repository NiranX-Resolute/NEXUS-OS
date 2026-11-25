import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Database,
  Flame,
  Mic,
  MicOff,
  Radio,
  Sliders,
  Sparkles,
  Terminal,
  X
} from 'lucide-react'
import { ThemeProvider, useTheme } from '@renderer/context/ThemeProvider'
import { NexusRuntimeProvider, useNexusRuntime } from '@renderer/context/NexusRuntimeContext'
import { agentStore, useAgentStore } from '@renderer/store/agentStore'
import { ipcFetch, ipcInvoke, ipcSend } from '@renderer/services/ipc-client'
import AgentWallpaperLayer from '@renderer/components/AgentWallpaperLayer'
import TopBar, { type WorkspaceMode } from '@renderer/components/TopBar'
import SidebarRail, { type MasterTab } from '@renderer/components/SidebarRail'
import CommandDeck from '@renderer/components/CommandDeck'
import OnDemandWidgetHost from '@renderer/components/OnDemandWidgetHost'
import DemandResourceHUD from '@renderer/components/DemandResourceHUD'
import VisionSourceModal from '@renderer/components/VisionSourceModal'
import CommandPalette from '@renderer/components/hud/CommandPalette'
import CircuitDrawers, { type CircuitDrawerId } from '@renderer/components/CircuitDrawers'
import UpdatePromptModal from '@renderer/components/UpdatePromptModal'
import DockSetupModal from '@renderer/components/DockSetupModal'
import NexusContextMenu from '@renderer/components/NexusContextMenu'
import MiniOverlay from '@renderer/components/MiniOverlay'
import CoreCockpitView, { type CockpitStageMode } from '@renderer/views/CoreCockpitView'
import {
  AutopilotSuiteView,
  ProfileSuiteView,
  ScholarSuiteView,
  StudioSuiteView,
  VaultSuiteView,
  WorldSuiteView
} from '@renderer/views/UnifiedStageSuites'

const AiChatView = lazy(() => import('@renderer/views/AiChat'))
const InterviewCopilotView = lazy(() =>
  import('@renderer/views/InterviewCopilotView').then((m) => ({
    default: m.InterviewCopilotView
  }))
)
const ThemeForgeView = lazy(() => import('@renderer/views/ThemeForgeView'))
const SettingsCommandCenter = lazy(() => import('@renderer/views/SettingsCommandCenter'))
const ObscuraInspectorView = lazy(() => import('@renderer/views/ObscuraInspectorView'))
const NexusCoreOrb = lazy(() => import('@renderer/components/NexusCoreOrb'))

const CONDUITS: Array<{ id: CircuitDrawerId; gradId: string; color: string }> = [
  { id: '01', gradId: 'conduit-grad-01', color: '#10b981' },
  { id: '02', gradId: 'conduit-grad-02', color: '#06b6d4' },
  { id: '03', gradId: 'conduit-grad-03', color: '#38bdf8' },
  { id: '04', gradId: 'conduit-grad-04', color: '#f59e0b' }
]

const ViewLoader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-full w-full items-center justify-center bg-black/40">
    <div className="flex flex-col items-center gap-3 font-mono text-xs text-emerald-300">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-400/20 border-t-emerald-400" />
      <span className="tracking-widest uppercase">LOADING {label}...</span>
    </div>
  </div>
)

function normalizeMasterTab(raw: string): {
  tab: MasterTab
  worldSubTab?: 'world' | 'webview' | 'serverless' | 'obscura'
} {
  const clean = String(raw || 'core').trim().toLowerCase()
  if (clean === 'themes' || clean === 'theme') return { tab: 'theme' }
  if (clean === 'nexkoder' || clean === 'studio' || clean === 'ide') return { tab: 'studio' }
  if (clean === 'memory' || clean === 'scholar' || clean === 'notes') return { tab: 'scholar' }
  if (clean === 'autopilot' || clean === 'macros' || clean === 'routines' || clean === 'apps')
    return { tab: 'routines' }
  if (clean === 'ai' || clean === 'chat' || clean === 'ai_chat') return { tab: 'chat' }
  if (clean === 'obscura') return { tab: 'world', worldSubTab: 'obscura' }
  if (clean === 'browser' || clean === 'webview') return { tab: 'world', worldSubTab: 'webview' }
  if (clean === 'globe' || clean === 'world' || clean === 'planet')
    return { tab: 'world', worldSubTab: 'world' }
  if (clean === 'vault' || clean === 'board' || clean === 'whiteboard' || clean === 'phone')
    return { tab: 'vault' }
  if (clean === 'profile' || clean === 'enclave') return { tab: 'profile' }
  if (clean === 'settings' || clean === 'config') return { tab: 'settings' }
  if (clean === 'interview' || clean === 'copilot') return { tab: 'interview' }
  return { tab: 'core' }
}

function NexusWorkstationShell({
  activeTab,
  onSelectTab,
  worldSubTab
}: {
  activeTab: MasterTab
  onSelectTab: (tab: string) => void
  worldSubTab?: 'world' | 'webview' | 'serverless' | 'obscura'
}) {
  const { theme, wallpaper } = useTheme()
  const runtime = useNexusRuntime()
  const storeState = useAgentStore()

  const [cockpitMode, setCockpitMode] = useState<CockpitStageMode>('workstation')
  const [isSplitCore, setIsSplitCore] = useState<boolean>(false)
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false)
  const [activeCircuit, setActiveCircuit] = useState<CircuitDrawerId | null>(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false)
  const [isDeckCollapsed, setIsDeckCollapsed] = useState<boolean>(false)
  const [isIpcOnline, setIsIpcOnline] = useState<boolean>(false)
  const [pingMs, setPingMs] = useState<number>(4)
  const [zoomFactor, setZoomFactor] = useState<number>(1.0)

  const rawMode = String(storeState.workspace?.active_mode || 'DEV').toUpperCase()
  const workspaceMode: WorkspaceMode =
    rawMode === 'STUDY' || rawMode === 'STUDIO' || rawMode === 'SILENT' ? rawMode : 'DEV'

  // Poll Gateway Health & Telemetry into external agentStore
  useEffect(() => {
    let active = true
    const syncLoop = async () => {
      const t0 = performance.now()
      try {
        const res = await ipcFetch('/api/health')
        if (active) {
          setIsIpcOnline(res.ok)
          if (res.ok) {
            setPingMs(Math.max(1, Math.round(performance.now() - t0)))
          }
        }
      } catch {
        if (active) setIsIpcOnline(false)
      }
      await agentStore.syncWithBackend()
    }
    void syncLoop()
    const timer = window.setInterval(syncLoop, 4000)

    const unsubTelemetry = (window as any)?.nexusTelemetry?.onUpdate?.((payload: any) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.workspace?.active_mode) {
        agentStore.setWorkspaceModeLocal(payload.workspace.active_mode)
      }
      if (payload.telemetry?.securityState) {
        agentStore.updateTelemetry({ securityState: payload.telemetry.securityState })
      }
    })

    return () => {
      active = false
      window.clearInterval(timer)
      if (typeof unsubTelemetry === 'function') unsubTelemetry()
    }
  }, [])

  // Keyboard shortcuts & Global event bridge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen((prev) => !prev)
        return
      }
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setShowDiagnostics((prev) => !prev)
        return
      }
      if (e.altKey) {
        const keyMap: Record<string, string> = {
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
        const matched = keyMap[e.key.toLowerCase()]
        if (matched) {
          e.preventDefault()
          onSelectTab(matched)
        }
      }
    }

    const onOpenPalette = () => setIsCommandPaletteOpen(true)
    const onNavigateEvent = (ev: Event) => {
      const tab = (ev as CustomEvent)?.detail?.tab
      if (tab) onSelectTab(tab)
    }
    const onLockEvent = () => runtime.lockSession()
    const onZoomIn = () => setZoomFactor((z) => Math.min(1.25, Number((z + 0.05).toFixed(2))))
    const onZoomOut = () => setZoomFactor((z) => Math.max(0.85, Number((z - 0.05).toFixed(2))))
    const onResetZoom = () => setZoomFactor(1.0)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('nexus:open-command-palette', onOpenPalette)
    window.addEventListener('nexus:navigate-tab', onNavigateEvent)
    window.addEventListener('nexus:lock-session', onLockEvent)
    window.addEventListener('nexus-zoom-in', onZoomIn)
    window.addEventListener('nexus-zoom-out', onZoomOut)
    window.addEventListener('nexus-zoom-reset', onResetZoom)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('nexus:open-command-palette', onOpenPalette)
      window.removeEventListener('nexus:navigate-tab', onNavigateEvent)
      window.removeEventListener('nexus:lock-session', onLockEvent)
      window.removeEventListener('nexus-zoom-in', onZoomIn)
      window.removeEventListener('nexus-zoom-out', onZoomOut)
      window.removeEventListener('nexus-zoom-reset', onResetZoom)
    }
  }, [onSelectTab, runtime])

  const handleSelectWorkspaceMode = useCallback(async (mode: WorkspaceMode) => {
    agentStore.setWorkspaceModeLocal(mode)
    try {
      await (window as any)?.nexusTelemetry?.switchWorkspace?.(mode)
    } catch {
      // Pure web / test runtime fallback handled by gateway call below
    }
    try {
      await ipcFetch('/api/workspace/mode', {
        method: 'POST',
        body: JSON.stringify({ mode })
      })
    } catch {
      // Logged in telemetry status indicator
    }
  }, [])

  const handleTriggerEstop = useCallback(async () => {
    agentStore.updateTelemetry({ securityState: 'LOCKED' })
    if (runtime.isSystemActive) {
      await runtime.toggleSystem()
    }
    runtime.stopVision()
    try {
      await (window as any)?.nexusTelemetry?.triggerEStop?.('TopBar Emergency Stop')
    } catch {
      // Gateway call persists E-Stop cleanly
    }
    try {
      await ipcFetch('/api/estop/trigger', {
        method: 'POST',
        body: JSON.stringify({ reason: 'TopBar Emergency Stop' })
      })
    } catch {
      // Logged in UI state
    }
  }, [runtime])

  const handleResetEstop = useCallback(async () => {
    agentStore.updateTelemetry({ securityState: 'NOMINAL' })
    try {
      await ipcFetch('/api/estop/reset', { method: 'POST' })
    } catch {
      // Logged in UI state
    }
  }, [])

  const hwStats = runtime.systemTelemetry || {}
  const cpuPct = Math.round(hwStats.cpu?.usagePercent ?? storeState.telemetry.cpuUsage ?? 14)
  const ramPct = Math.round(hwStats.memory?.usedPercent ?? storeState.telemetry.memoryUsage ?? 42)
  const vramUsedMb = Math.round(hwStats.gpu?.vramUsedMb ?? 0)
  const vramTotalMb = Math.round(hwStats.gpu?.vramTotalMb ?? 8192)
  const usedRamMb = Math.round(
    hwStats.memory?.usedMb ?? (ramPct > 0 ? ramPct * 160 : 4096)
  )

  const showGlobalCommandDeck = !(activeTab === 'core' && cockpitMode === 'workstation')

  if (runtime.isMiniMode) {
    return (
      <div className="h-screen w-screen bg-black/90 text-white">
        <MiniOverlay
          assistantVisualState={runtime.isUserSpeaking ? 'listening' : runtime.isSystemActive ? 'connected' : 'idle'}
          isSystemActive={runtime.isSystemActive}
          isSystemStarting={runtime.isSystemStarting}
          toggleSystem={runtime.toggleSystem}
          isMicMuted={runtime.isMicMuted}
          toggleMic={runtime.toggleMic}
          isVideoOn={runtime.isVideoOn}
          visionMode={runtime.visionMode}
          startVision={(mode, options) => runtime.startVisionWithSource(mode, options)}
          stopVision={runtime.stopVision}
          sendTextCommand={async (cmd) => {
            await runtime.sendPromptToCore(cmd)
          }}
        />
      </div>
    )
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault()
        runtime.setContextMenuPos({ x: e.clientX, y: e.clientY })
      }}
      style={{
        backgroundColor: theme.tokens?.void_bg || '#030709',
        zoom: zoomFactor
      }}
      className="relative flex h-screen w-screen flex-col overflow-hidden text-zinc-100 nexus-shell-bg nexus-shell-scan select-none"
    >
      {/* Dynamic Shader / Image Wallpaper Layer */}
      <AgentWallpaperLayer activeWallpaper={wallpaper} mode={workspaceMode} />

      {/* Top Cyber Workstation Header */}
      <TopBar
        workspaceMode={workspaceMode}
        onSelectWorkspaceMode={handleSelectWorkspaceMode}
        onTriggerEstop={handleTriggerEstop}
        onResetEstop={handleResetEstop}
        telemetry={{
          pingMs,
          ramPercent: ramPct,
          vramUsedMb,
          vramTotalMb,
          activeWorkers: storeState.agents.length,
          securityState: storeState.telemetry.securityState
        }}
        isIpcOnline={isIpcOnline}
        isSystemActive={runtime.isSystemActive}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics((prev) => !prev)}
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
        onNavigateHome={() => onSelectTab('core')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenThemeForge={() => onSelectTab('theme')}
        onLockSession={runtime.lockSession}
        onRefreshAll={runtime.triggerRefreshAll}
        isRefreshing={runtime.isRefreshing}
        onToggleMiniMode={() => {
          ipcSend('toggle-mini-mode')
          runtime.setIsMiniMode(true)
        }}
      />

      {/* Main Middle Shell: Left Rail + Optional Split-Core + Full Workspace Stage + Right Audit Drawer */}
      <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
        <SidebarRail
          activeTab={activeTab}
          onSelectTab={(tab) => onSelectTab(tab)}
          isMicActive={!runtime.isMicMuted && runtime.isSystemActive}
          onToggleMic={() => {
            if (!runtime.isSystemActive) {
              void runtime.toggleSystem()
            } else {
              runtime.toggleMic()
            }
          }}
          isSplitCore={isSplitCore}
          onToggleSplitCore={() => setIsSplitCore((prev) => !prev)}
          ramMb={usedRamMb}
          activeSlices={storeState.tasks.filter((t) => t.status === 'in_progress' || t.status === 'queued').length}
          isExpanded={isRailExpanded}
          onToggleExpand={() => setIsRailExpanded((prev) => !prev)}
        />

        {/* Optional Split-Core Companion Panel on non-Core tabs */}
        {isSplitCore && activeTab !== 'core' && (
          <aside className="hidden lg:flex w-[310px] shrink-0 flex-col border-r border-emerald-500/20 bg-zinc-950/75 backdrop-blur-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-emerald-500/20 px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-widest text-emerald-300 uppercase">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>SPLIT CORE COMPANION</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSplitCore(false)}
                className="text-zinc-500 hover:text-white cursor-pointer"
                title="Close Split Core"
              >
                <X size={13} />
              </button>
            </div>

            <div className="relative h-[240px] w-full border-b border-white/10 bg-black/50">
              <Suspense fallback={<ViewLoader label="3D Core" />}>
                <NexusCoreOrb
                  coreState={
                    runtime.isUserSpeaking
                      ? 'LISTENING'
                      : runtime.isSystemActive
                      ? 'SPEAKING'
                      : 'IDLE'
                  }
                  workspaceMode={workspaceMode}
                  empathyPct={storeState.persona.empathy_pct}
                />
              </Suspense>
            </div>

            <div className="flex items-center gap-2 border-b border-white/10 p-3">
              <button
                type="button"
                onClick={() => void runtime.toggleSystem()}
                className={`flex-1 rounded-lg border py-1.5 font-mono text-[10px] font-bold transition-all cursor-pointer ${
                  runtime.isSystemActive
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                }`}
              >
                {runtime.isSystemActive ? 'CORE LIVE' : 'CONNECT CORE'}
              </button>
              <button
                type="button"
                onClick={runtime.toggleMic}
                className={`rounded-lg border p-1.5 cursor-pointer ${
                  runtime.isMicMuted
                    ? 'border-red-500/40 bg-red-500/15 text-red-300'
                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                }`}
                title="Mute / Unmute Mic"
              >
                {runtime.isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="font-mono text-[9px] tracking-widest text-zinc-500 uppercase">
                CIRCUIT CONDUITS
              </div>
              {(
                [
                  ['01', 'Memory & Knowledge Graph'],
                  ['02', 'Skills & SCOUT-01 Reach'],
                  ['03', 'Compute Pool & Keys'],
                  ['04', 'Sandbox & Safety Guard']
                ] as Array<[CircuitDrawerId, string]>
              ).map(([cid, label]) => (
                <button
                  key={cid}
                  type="button"
                  onClick={() => setActiveCircuit(cid)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left font-mono text-[10px] text-zinc-300 hover:border-emerald-400/40 hover:bg-emerald-500/10 cursor-pointer"
                >
                  <span>{label}</span>
                  <span className="text-emerald-400 font-bold">{cid}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Primary Full-Width Spatial Viewport */}
        <main className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-black/25">
          {activeTab === 'core' && (
            <CoreCockpitView
              stageMode={cockpitMode}
              onChangeStageMode={setCockpitMode}
              workspaceMode={workspaceMode}
              isIpcOnline={isIpcOnline}
              telemetry={{
                fps: Math.round(storeState.telemetry.fps ?? 60),
                ramMb: usedRamMb,
                activeSlices: storeState.tasks.filter(
                  (t) => t.status === 'in_progress' || t.status === 'queued'
                ).length,
                cpuUsagePct: cpuPct,
                wsConnected: isIpcOnline,
                lastPingMs: pingMs
              }}
              onNavigateTab={onSelectTab}
              onSelectCircuit={(cid) => setActiveCircuit(cid)}
            />
          )}

          {activeTab === 'chat' && (
            <div className="h-full w-full overflow-hidden">
              <Suspense fallback={<ViewLoader label="AI Chat" />}>
                <AiChatView
                  isSystemActive={runtime.isSystemActive}
                  isSystemStarting={runtime.isSystemStarting}
                  isMicMuted={runtime.isMicMuted}
                  toggleSystem={runtime.toggleSystem}
                  toggleMic={runtime.toggleMic}
                />
              </Suspense>
            </div>
          )}

          {activeTab === 'studio' && <StudioSuiteView />}
          {activeTab === 'scholar' && <ScholarSuiteView />}
          {activeTab === 'routines' && <AutopilotSuiteView />}

          {activeTab === 'interview' && (
            <div className="h-full w-full overflow-hidden">
              <Suspense fallback={<ViewLoader label="Interview Copilot" />}>
                <InterviewCopilotView />
              </Suspense>
            </div>
          )}

          {activeTab === 'world' && (
            <WorldSuiteView initialTab={worldSubTab} obscuraView={<ObscuraInspectorView />} />
          )}
          {activeTab === 'vault' && <VaultSuiteView />}

          {activeTab === 'theme' && (
            <div className="h-full w-full overflow-auto">
              <Suspense fallback={<ViewLoader label="Theme Forge" />}>
                <ThemeForgeView />
              </Suspense>
            </div>
          )}

          {activeTab === 'profile' && <ProfileSuiteView />}

          {activeTab === 'settings' && (
            <div className="h-full w-full overflow-hidden">
              <Suspense fallback={<ViewLoader label="Settings Command" />}>
                <SettingsCommandCenter isSystemActive={runtime.isSystemActive} />
              </Suspense>
            </div>
          )}
        </main>

        {/* Collapsible Right Audit, Swarm & Persona Drawer */}
        {isDrawerOpen && (
          <aside className="w-[320px] shrink-0 border-l border-emerald-500/20 bg-zinc-950/90 backdrop-blur-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-widest text-cyan-300 uppercase">
                <Activity size={13} className="text-emerald-400" />
                <span>LIVE TELEMETRY & SWARM</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-500 hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Persona Quick Matrix */}
              <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-2">
                <div className="flex items-center justify-between font-mono text-[10px] text-emerald-300 uppercase">
                  <span className="flex items-center gap-1.5">
                    <Sliders size={11} />
                    TARS Persona Matrix
                  </span>
                  <span className="text-[9px] text-cyan-300">
                    {storeState.persona.active_preset}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                  <div className="rounded border border-white/10 bg-black/40 p-1.5 text-center">
                    <div className="text-zinc-500 text-[9px]">CANDOR</div>
                    <div className="text-emerald-300 font-bold">{storeState.persona.candor_pct}%</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/40 p-1.5 text-center">
                    <div className="text-zinc-500 text-[9px]">HUMOR</div>
                    <div className="text-cyan-300 font-bold">{storeState.persona.humor_pct}%</div>
                  </div>
                  <div className="rounded border border-white/10 bg-black/40 p-1.5 text-center">
                    <div className="text-zinc-500 text-[9px]">EMPATHY</div>
                    <div className="text-violet-300 font-bold">{storeState.persona.empathy_pct}%</div>
                  </div>
                </div>
              </section>

              {/* Active Agents */}
              <section className="space-y-2">
                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 uppercase">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={11} className="text-cyan-400" />
                    Agent Orbiters ({storeState.agents.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {storeState.agents.map((ag) => (
                    <div
                      key={ag.id}
                      className="rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[10px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-200">{ag.name}</span>
                        <span className="text-emerald-400 uppercase text-[9px]">{ag.status}</span>
                      </div>
                      <div className="text-zinc-500 text-[9px] truncate mt-0.5">{ag.currentTask}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* SQLite WAL Audit Logs */}
              <section className="space-y-2">
                <div className="flex items-center justify-between font-mono text-[10px] text-zinc-400 uppercase">
                  <span className="flex items-center gap-1.5">
                    <Database size={11} className="text-emerald-400" />
                    WAL Execution Log ({storeState.logs.length})
                  </span>
                </div>
                <div className="space-y-1">
                  {storeState.logs.slice(0, 12).map((log) => (
                    <div
                      key={log.id}
                      className="rounded border border-white/5 bg-black/50 px-2 py-1.5 font-mono text-[9px]"
                    >
                      <div className="flex items-center justify-between text-zinc-500">
                        <span
                          className={
                            log.level === 'error'
                              ? 'text-red-400'
                              : log.level === 'warn'
                              ? 'text-amber-300'
                              : 'text-emerald-400'
                          }
                        >
                          [{log.source}]
                        </span>
                        <span>{log.timestamp}</span>
                      </div>
                      <div className="text-zinc-300 mt-0.5 break-words">{log.message}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Persistent Command Deck on non-Dashboard Views */}
      {showGlobalCommandDeck && (
        <div className="relative z-30 shrink-0 border-t border-emerald-500/20 bg-zinc-950/88 backdrop-blur-2xl">
          <div className="flex items-center justify-between px-4 py-1 border-b border-white/5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400">
              <Terminal size={11} className="text-emerald-400" />
              <span>COMMAND DECK // 127.0.0.1:47630</span>
              {runtime.isSystemActive && (
                <span className="flex items-center gap-1 text-cyan-300">
                  <Radio size={10} className="animate-pulse" />
                  VOICE UPLINK
                </span>
              )}
              {storeState.telemetry.securityState === 'LOCKED' && (
                <span className="flex items-center gap-1 text-red-400 font-bold">
                  <Flame size={10} />
                  E-STOP LOCKED
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsDeckCollapsed((prev) => !prev)}
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-emerald-300 cursor-pointer"
            >
              <span>{isDeckCollapsed ? 'Expand Deck' : 'Minimize Deck'}</span>
              {isDeckCollapsed ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          {!isDeckCollapsed && (
            <div className="px-4 py-2">
              <CommandDeck
                isSystemActive={runtime.isSystemActive}
                isMicMuted={runtime.isMicMuted}
                isVideoOn={runtime.isVideoOn}
                visionMode={runtime.visionMode}
                onToggleVoice={runtime.toggleSystem}
                onToggleVision={runtime.openVisionPicker}
                onToggleCamera={runtime.quickStartCamera}
                onToggleTranscript={() => setIsDrawerOpen((prev) => !prev)}
                onSubmitPrompt={async (prompt) => {
                  await runtime.sendPromptToCore(prompt, 'queue')
                }}
                onSteerPrompt={async (prompt) => {
                  await runtime.sendPromptToCore(prompt, 'steer')
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Global Living Core Circuit Conduit SVG Definitions & Drawers */}
      <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden="true">
        <defs>
          {CONDUITS.map((c) => (
            <linearGradient key={c.gradId} id={c.gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={c.color} stopOpacity={0.9} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
            </linearGradient>
          ))}
        </defs>
      </svg>
      <CircuitDrawers
        activeCircuit={activeCircuit}
        onClose={() => setActiveCircuit(null)}
        onSelectCircuit={(cid) => setActiveCircuit(cid)}
        workspaceMode={workspaceMode}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigateView={(viewId) => onSelectTab(viewId)}
        onSetWorkspaceMode={(mode) => void handleSelectWorkspaceMode(mode)}
      />

      {/* On-Demand Floating Tool Widgets (17 widgets: WhatsApp, DocForge, Focus, Weather, Terminal, etc.) */}
      <OnDemandWidgetHost />

      {/* On-Demand Resource & RAM Governor HUD (Alt+D) */}
      {showDiagnostics && (
        <div className="fixed bottom-16 right-4 z-50 w-[340px] max-w-[92vw] shadow-2xl">
          <DemandResourceHUD />
        </div>
      )}

      {/* Vision Screen / Window / Camera Source Selector Modal */}
      <VisionSourceModal
        isOpen={runtime.isSourceModalOpen}
        onClose={() => runtime.setIsSourceModalOpen(false)}
        onSelect={(mode, options) => {
          void runtime.startVisionWithSource(mode, options)
        }}
      />

      {/* Electron Auto-Updater Prompt Modal */}
      <UpdatePromptModal
        isOpen={runtime.showUpdateModal}
        updateInfo={runtime.updateInfo}
        onClose={() => runtime.setShowUpdateModal(false)}
        onInstall={() => {
          void ipcInvoke('install-update')
          runtime.setShowUpdateModal(false)
        }}
        onDefer={() => runtime.setShowUpdateModal(false)}
      />

      {/* Floating Edge Dock Setup Modal */}
      <DockSetupModal
        isOpen={runtime.showDockModal}
        onClose={() => runtime.setShowDockModal(false)}
      />

      {/* Right-Click Tactical Workstation Context Menu */}
      <NexusContextMenu
        isOpen={Boolean(runtime.contextMenuPos)}
        x={runtime.contextMenuPos?.x ?? 0}
        y={runtime.contextMenuPos?.y ?? 0}
        onClose={() => runtime.setContextMenuPos(null)}
        onRefreshAll={runtime.triggerRefreshAll}
        isRefreshing={runtime.isRefreshing}
        zoomFactor={zoomFactor}
        onZoomIn={() => setZoomFactor((z) => Math.min(1.25, Number((z + 0.05).toFixed(2))))}
        onZoomOut={() => setZoomFactor((z) => Math.max(0.85, Number((z - 0.05).toFixed(2))))}
        onResetZoom={() => setZoomFactor(1.0)}
        activeTab={activeTab}
        onNavigate={onSelectTab}
        isSystemActive={runtime.isSystemActive}
        toggleSystem={runtime.toggleSystem}
        isMicMuted={runtime.isMicMuted}
        toggleMic={runtime.toggleMic}
        isVideoOn={runtime.isVideoOn}
        onToggleVision={runtime.openVisionPicker}
      />
    </div>
  )
}

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MasterTab>('core')
  const [worldSubTab, setWorldSubTab] = useState<
    'world' | 'webview' | 'serverless' | 'obscura' | undefined
  >(undefined)

  const handleSelectTab = useCallback((rawTab: string) => {
    const resolved = normalizeMasterTab(rawTab)
    setActiveTab(resolved.tab)
    if (resolved.worldSubTab) {
      setWorldSubTab(resolved.worldSubTab)
    }
  }, [])

  return (
    <ThemeProvider>
      <NexusRuntimeProvider onNavigateTab={handleSelectTab}>
        <NexusWorkstationShell
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          worldSubTab={worldSubTab}
        />
      </NexusRuntimeProvider>
    </ThemeProvider>
  )
}

export default App
