import React, { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Cpu,
  Flame,
  Lock,
  Minimize2,
  Minus,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Wrench,
  X
} from 'lucide-react'
import { ipcFetch, ipcSend } from '@renderer/services/ipc-client'

export type WorkspaceMode = 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT'

export interface TopBarTelemetry {
  pingMs?: number
  ramMb?: number
  ramPercent?: number
  gpuPercent?: number
  walSyncState?: string
  vramUsedMb?: number
  vramTotalMb?: number
  activeWorkers?: number
  securityState?: 'NOMINAL' | 'ELEVATED' | 'LOCKED'
}

export interface TopBarProps {
  workspaceMode: WorkspaceMode
  onSelectWorkspaceMode: (mode: WorkspaceMode) => void
  onTriggerEstop: () => void
  onResetEstop?: () => void
  telemetry: TopBarTelemetry
  isIpcOnline: boolean
  isSystemActive?: boolean
  showDiagnostics?: boolean
  onToggleDiagnostics?: () => void
  isDrawerOpen?: boolean
  onToggleDrawer?: () => void
  onNavigateHome?: () => void
  onOpenCommandPalette?: () => void
  onOpenThemeForge?: () => void
  onLockSession?: () => void
  onRefreshAll?: () => void
  isRefreshing?: boolean
  onToggleMiniMode?: () => void
  isSidebarExpanded?: boolean
  onToggleSidebar?: () => void
}

const MODE_PILLS: Array<{
  mode: WorkspaceMode
  label: string
  activeClass: string
  hint: string
}> = [
  {
    mode: 'DEV',
    label: 'DEV',
    activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/45',
    hint: 'Full local autonomy, IDE edits & terminal execution'
  },
  {
    mode: 'STUDY',
    label: 'STUDY',
    activeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/45',
    hint: 'Scholar research, arXiv synthesis & focus guardrails'
  },
  {
    mode: 'STUDIO',
    label: 'STUDIO',
    activeClass: 'bg-violet-500/20 text-violet-300 border-violet-400/45',
    hint: 'Voice synthesis, creator recording & WebGL themes'
  },
  {
    mode: 'SILENT',
    label: 'SILENT',
    activeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/45',
    hint: 'Air-gapped offline lockdown (zero outbound network)'
  }
]

export const TopBar: React.FC<TopBarProps> = ({
  workspaceMode,
  onSelectWorkspaceMode,
  onTriggerEstop,
  onResetEstop,
  telemetry,
  isIpcOnline,
  isSystemActive = false,
  showDiagnostics = false,
  onToggleDiagnostics,
  isDrawerOpen = false,
  onToggleDrawer,
  onNavigateHome,
  onOpenCommandPalette,
  onOpenThemeForge,
  onLockSession,
  onRefreshAll,
  isRefreshing = false,
  onToggleMiniMode,
  isSidebarExpanded: controlledSidebarExpanded,
  onToggleSidebar
}) => {
  const [isToolsOpen, setIsToolsOpen] = useState(false)
  const [actionFlash, setActionFlash] = useState<string | null>(null)
  const [isReleasingGpu, setIsReleasingGpu] = useState(false)
  const [liveRamMb, setLiveRamMb] = useState<number | null>(null)
  const [internalSidebarExpanded, setInternalSidebarExpanded] = useState(false)

  const toolsRef = useRef<HTMLDivElement | null>(null)
  const flashTimerRef = useRef<number | null>(null)

  const sidebarExpanded =
    controlledSidebarExpanded !== undefined ? controlledSidebarExpanded : internalSidebarExpanded

  // Keep TopBar sidebar toggle icon synced when SidebarRail emits state changes
  useEffect(() => {
    const onSidebarState = (ev: Event) => {
      const expanded = (ev as CustomEvent)?.detail?.isExpanded
      if (typeof expanded === 'boolean') {
        setInternalSidebarExpanded(expanded)
      }
    }
    window.addEventListener('nexus:sidebar-state', onSidebarState)
    return () => window.removeEventListener('nexus:sidebar-state', onSidebarState)
  }, [])

  // Fetch real host RAM usage (MB) when caller only supplies ramPercent
  useEffect(() => {
    if (typeof telemetry.ramMb === 'number' || !isIpcOnline) return
    let active = true

    const fetchHardwareRam = async (): Promise<void> => {
      try {
        const res = await ipcFetch('/api/telemetry/hardware')
        if (res.ok) {
          const data = await res.json()
          const used = data?.hardware?.ram_used_mb
          if (active && typeof used === 'number' && Number.isFinite(used)) {
            setLiveRamMb(Math.round(used))
          }
        }
      } catch {
        // Fallback derived cleanly from telemetry.ramPercent below
      }
    }

    void fetchHardwareRam()
    const timer = window.setInterval(fetchHardwareRam, 8000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [isIpcOnline, telemetry.ramMb])

  // Close Tools dropdown on outside click or Escape
  useEffect(() => {
    if (!isToolsOpen) return

    const onMouseDown = (ev: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(ev.target as Node)) {
        setIsToolsOpen(false)
      }
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setIsToolsOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isToolsOpen])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  const showFlash = (text: string) => {
    setActionFlash(text)
    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current)
    }
    flashTimerRef.current = window.setTimeout(() => setActionFlash(null), 2200)
  }

  const handleToggleSidebar = () => {
    if (onToggleSidebar) {
      onToggleSidebar()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:toggle-sidebar'))
    }
  }

  const handleOpenCommandPalette = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:open-command-palette'))
    }
  }

  const handleToggleDrawer = () => {
    if (onToggleDrawer) {
      onToggleDrawer()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:toggle-drawer'))
    }
  }

  const handleReleaseGpu = async () => {
    if (isReleasingGpu) return
    setIsToolsOpen(false)
    setIsReleasingGpu(true)
    try {
      const res = await ipcFetch('/api/compute/release', {
        method: 'POST',
        body: JSON.stringify({ reason: 'topbar_manual_release' })
      })
      showFlash(res.ok ? 'GPU POOL RELEASED' : 'GPU RELEASE ERR')
    } catch {
      showFlash('IPC OFFLINE')
    } finally {
      setIsReleasingGpu(false)
    }
  }

  const handleToggleDiagnostics = () => {
    setIsToolsOpen(false)
    if (onToggleDiagnostics) {
      onToggleDiagnostics()
    } else {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'd', altKey: true, bubbles: true })
      )
    }
  }

  const handleOpenThemes = () => {
    setIsToolsOpen(false)
    if (onOpenThemeForge) {
      onOpenThemeForge()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:navigate-tab', { detail: { tab: 'theme' } }))
    }
  }

  const handleRefreshAll = () => {
    setIsToolsOpen(false)
    if (onRefreshAll) {
      onRefreshAll()
    } else {
      window.dispatchEvent(new CustomEvent('nexus-refresh-all'))
    }
  }

  const handleToggleMiniMode = () => {
    setIsToolsOpen(false)
    if (onToggleMiniMode) {
      onToggleMiniMode()
    } else {
      ipcSend('toggle-mini-mode')
    }
  }

  const handleLock = () => {
    setIsToolsOpen(false)
    if (onLockSession) {
      onLockSession()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:lock-session'))
    }
  }

  const isLocked = telemetry.securityState === 'LOCKED'
  const isHealthy = isIpcOnline && !isLocked
  const pingMs = telemetry.pingMs ?? (isIpcOnline ? 4 : 0)
  const ramMb =
    typeof telemetry.ramMb === 'number'
      ? Math.round(telemetry.ramMb)
      : liveRamMb !== null
      ? liveRamMb
      : typeof telemetry.ramPercent === 'number'
      ? Math.round(telemetry.ramPercent * 160)
      : 0

  return (
    <header className="relative z-40 h-11 w-full shrink-0 border-b border-white/10 bg-zinc-950/90 backdrop-blur-2xl flex items-center justify-between px-4 gap-3 select-none drag-region">
      {/* Subtle tactical top accent line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-emerald-500/45 via-cyan-400/40 to-transparent" />

      {/* LEFT: Sidebar Toggle + Compact NEXUS Badge + Compact Mode Pill Selector */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <button
          type="button"
          onClick={handleToggleSidebar}
          title={sidebarExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
          aria-label={sidebarExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
          className="no-drag flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:bg-white/[0.07] hover:text-zinc-100 transition-colors cursor-pointer"
        >
          {sidebarExpanded ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </button>

        <button
          type="button"
          onClick={onNavigateHome}
          title={
            isLocked
              ? 'NEXUS — Security Lock Engaged (Click for Core HUD)'
              : isIpcOnline
              ? isSystemActive
                ? 'NEXUS — Core Live & IPC Online (Click for Core HUD)'
                : 'NEXUS — IPC Online (Click for Core HUD)'
              : 'NEXUS — IPC Offline (Click for Core HUD)'
          }
          className="no-drag flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 hover:border-emerald-400/40 hover:bg-white/[0.07] transition-all cursor-pointer"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                isHealthy ? 'bg-emerald-400' : 'bg-red-500'
              }`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.85)]'
              }`}
            />
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-zinc-100">
            NEXUS
          </span>
        </button>

        {/* Compact Workspace Mode Pill Selector */}
        <div
          role="group"
          aria-label="Workspace Mode"
          className="no-drag flex items-center gap-0.5 rounded-full border border-white/10 bg-black/45 p-0.5"
        >
          {MODE_PILLS.map((pill) => {
            const active = workspaceMode === pill.mode
            return (
              <button
                key={pill.mode}
                type="button"
                data-testid={`workspace-mode-selector-${pill.mode.toLowerCase()}`}
                title={pill.hint}
                aria-pressed={active}
                onClick={() => onSelectWorkspaceMode(pill.mode)}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider transition-all cursor-pointer ${
                  active
                    ? pill.activeClass
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
                }`}
              >
                {pill.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* CENTER: Single Spacious Command Palette Pill */}
      <div className="flex flex-1 justify-center min-w-0 px-2">
        <button
          type="button"
          onClick={handleOpenCommandPalette}
          title="Open Command Palette (Ctrl+K)"
          aria-label="Command Palette (Ctrl+K)"
          className="no-drag flex w-full max-w-sm items-center justify-between gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-zinc-400 hover:border-cyan-400/40 hover:bg-white/[0.07] hover:text-zinc-100 transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search size={12} className="text-cyan-400 shrink-0" />
            <span className="truncate font-mono text-[11px]">Command Palette</span>
          </span>
          <kbd className="hidden sm:inline-block shrink-0 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* RIGHT: Telemetry Pill + Tools Dropdown + E-STOP + Win32 Window Controls */}
      <div className="flex items-center gap-2 shrink-0 h-full">
        {/* Single Compact Telemetry Pill */}
        <button
          type="button"
          onClick={handleToggleDrawer}
          title={
            isDrawerOpen
              ? 'Close Telemetry & Execution Drawer'
              : 'Open Telemetry & Execution Drawer'
          }
          aria-pressed={isDrawerOpen}
          className={`no-drag flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] transition-all cursor-pointer ${
            isDrawerOpen
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
              : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-cyan-400/40 hover:text-zinc-100'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              isIpcOnline ? 'bg-emerald-400' : 'bg-red-500'
            }`}
          />
          <span>
            {pingMs}ms • {ramMb}MB
          </span>
        </button>

        {/* Single Crisp Tools Dropdown */}
        <div ref={toolsRef} className="no-drag relative">
          <button
            type="button"
            onClick={() => setIsToolsOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isToolsOpen}
            title="Workstation Tools & Controls"
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium transition-all cursor-pointer ${
              isToolsOpen || showDiagnostics || isRefreshing || isReleasingGpu
                ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200'
                : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-zinc-100'
            }`}
          >
            <Wrench
              size={11}
              className={isRefreshing || isReleasingGpu ? 'animate-spin text-cyan-400' : 'text-cyan-400'}
            />
            <span>Tools</span>
            <ChevronDown
              size={11}
              className={`transition-transform duration-150 ${isToolsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {actionFlash && !isToolsOpen && (
            <div className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 whitespace-nowrap rounded-lg border border-cyan-400/35 bg-zinc-950/95 px-2.5 py-1 font-mono text-[10px] text-cyan-300 shadow-xl backdrop-blur-xl">
              {actionFlash}
            </div>
          )}

          {isToolsOpen && (
            <div
              role="menu"
              aria-label="Workstation Tools"
              className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 rounded-xl border border-white/12 bg-zinc-950/95 p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleReleaseGpu()}
                disabled={isReleasingGpu}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-white/[0.07] disabled:opacity-50 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Cpu
                    size={13}
                    className={isReleasingGpu ? 'animate-spin text-amber-400' : 'text-cyan-400'}
                  />
                  <span>GPU Release</span>
                </span>
                <span className="text-[9px] text-zinc-500">
                  {isReleasingGpu ? 'BUSY' : 'POOL'}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={handleToggleDiagnostics}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Activity
                    size={13}
                    className={showDiagnostics ? 'text-emerald-400' : 'text-zinc-400'}
                  />
                  <span>Diagnostics</span>
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] ${
                    showDiagnostics
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  Alt+D
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={handleOpenThemes}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Palette size={13} className="text-emerald-400" />
                  <span>Theme Switcher</span>
                </span>
                <span className="text-[9px] text-zinc-500">FORGE</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={handleRefreshAll}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw
                    size={13}
                    className={isRefreshing ? 'animate-spin text-emerald-400' : 'text-emerald-400'}
                  />
                  <span>{isRefreshing ? 'Syncing Systems...' : 'Force Sync / Refresh'}</span>
                </span>
                <span className="text-[9px] text-zinc-500">WAL</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={handleToggleMiniMode}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-zinc-200 hover:bg-white/[0.07] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Minimize2 size={13} className="text-cyan-400" />
                  <span>Mini Mode</span>
                </span>
                <span className="text-[9px] text-zinc-500">PiP</span>
              </button>

              <div className="my-1 border-t border-white/10" />

              <button
                type="button"
                role="menuitem"
                onClick={handleLock}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-[11px] text-amber-200 hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Lock size={13} className="text-amber-400" />
                  <span>Lock Session</span>
                </span>
                <span className="text-[9px] text-amber-400/75">VAULT</span>
              </button>
            </div>
          )}
        </div>

        {/* Compact E-STOP Trigger / Reset Toggle */}
        <button
          type="button"
          data-testid="estop-button"
          onClick={() => (isLocked && onResetEstop ? onResetEstop() : onTriggerEstop())}
          title={
            isLocked
              ? 'Clear Emergency Stop lock and restore NOMINAL operations'
              : 'EMERGENCY STOP: Halt active child swarms, tool calls & audio output'
          }
          className={`no-drag flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer ${
            isLocked
              ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
              : 'border-red-500/45 bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:text-red-100'
          }`}
        >
          {isLocked ? (
            <>
              <RotateCcw size={11} />
              <span>RESET</span>
            </>
          ) : (
            <>
              <Flame size={11} />
              <span>E-STOP</span>
            </>
          )}
        </button>

        {/* Native Win32 Frameless Window Controls */}
        <div className="no-drag flex items-center gap-0.5 pl-2 ml-0.5 border-l border-white/10">
          <button
            type="button"
            data-testid="window-min"
            onClick={() => ipcSend('window-min')}
            title="Minimize"
            aria-label="Minimize Window"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <Minus size={12} />
          </button>
          <button
            type="button"
            data-testid="window-max"
            onClick={() => ipcSend('window-max')}
            title="Maximize / Restore"
            aria-label="Maximize or Restore Window"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <Square size={10} />
          </button>
          <button
            type="button"
            data-testid="window-close"
            onClick={() => ipcSend('window-close')}
            title="Close Window"
            aria-label="Close Window"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-red-600/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  )
}

export default TopBar
