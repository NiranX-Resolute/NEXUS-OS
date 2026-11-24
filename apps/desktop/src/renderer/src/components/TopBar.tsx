// apps/desktop/src/renderer/src/components/TopBar.tsx
// NEXUS OS v5.0 — Spatial Cockpit Header Bar (52px, z-30 with 280x44 Dynamic Notch HUD Bay Cutout)

import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  Sliders,
  ShieldAlert,
  Layers,
  Search,
  Palette,
  Cpu,
  Zap,
  Lock
} from 'lucide-react'
import { WorkspaceMode } from './NexusCoreOrb'
import { KineticText } from './hud/KineticText'
import nexusLogo from '../assets/nexus-logo.png'

export interface TopBarTelemetry {
  ramMb: number
  lastPingMs: number
  wsConnected: boolean
}

export interface TopBarProps {
  workspaceMode: WorkspaceMode
  onSelectWorkspaceMode: (mode: WorkspaceMode) => void
  onTriggerEstop: () => void
  telemetry: TopBarTelemetry
  isIpcOnline: boolean
  showDiagnostics?: boolean
  onToggleDiagnostics?: () => void
  isDrawerOpen?: boolean
  onToggleDrawer?: () => void
  onNavigateHome?: () => void
  onOpenCommandPalette?: () => void
  onOpenThemeForge?: () => void
  onLockSession?: () => void
}

const MODE_PILLS: Array<{ id: WorkspaceMode; label: string; color: string; border: string; bg: string }> = [
  { id: 'DEV', label: '[DEV]', color: 'text-[#00F5D4]', border: 'border-[#00F5D4]/40', bg: 'bg-[#00F5D4]/10' },
  { id: 'STUDY', label: '[STUDY]', color: 'text-[#F59E0B]', border: 'border-[#F59E0B]/40', bg: 'bg-[#F59E0B]/10' },
  { id: 'STUDIO', label: '[STUDIO]', color: 'text-[#10B981]', border: 'border-[#10B981]/40', bg: 'bg-[#10B981]/10' },
  { id: 'SILENT', label: '[SILENT]', color: 'text-[#6366F1]', border: 'border-[#6366F1]/40', bg: 'bg-[#6366F1]/10' }
]

export const TopBar: React.FC<TopBarProps> = ({
  workspaceMode,
  onSelectWorkspaceMode,
  onTriggerEstop,
  telemetry,
  isIpcOnline,
  showDiagnostics = false,
  onToggleDiagnostics,
  isDrawerOpen = false,
  onToggleDrawer,
  onNavigateHome,
  onOpenCommandPalette,
  onOpenThemeForge,
  onLockSession
}) => {
  const [isReleasingGpu, setIsReleasingGpu] = useState(false)
  const [gpuReleased, setGpuReleased] = useState(false)

  // Listen for Alt+D keyboard shortcut to toggle diagnostics HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        onToggleDiagnostics?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleDiagnostics])

  // Open Command & Features Palette (Cmd+K / Ctrl+K)
  const handleOpenCommandPalette = useCallback(() => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette()
    } else {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          code: 'KeyK',
          ctrlKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true
        })
      )
      window.dispatchEvent(new CustomEvent('nexus:open-command-palette'))
    }
  }, [onOpenCommandPalette])

  // Open Theme & Wallpaper Studio (View 08)
  const handleOpenTheme = useCallback(() => {
    if (onOpenThemeForge) {
      onOpenThemeForge()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:navigate-tab', { detail: 'themeforge' }))
      window.dispatchEvent(new CustomEvent('nexus:open-theme-picker'))
    }
  }, [onOpenThemeForge])

  // Release GPU VRAM cache & flush inference context
  const handleReleaseGpu = useCallback(async () => {
    if (isReleasingGpu) return
    setIsReleasingGpu(true)
    try {
      await fetch('http://127.0.0.1:47630/api/system/release-gpu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {})

      window.dispatchEvent(new CustomEvent('nexus:release-gpu'))
      setGpuReleased(true)
      setTimeout(() => setGpuReleased(false), 2500)
    } catch {
      // Continue safely on edge environments
    } finally {
      setIsReleasingGpu(false)
    }
  }, [isReleasingGpu])

  // Quick session lock
  const handleLock = useCallback(() => {
    if (onLockSession) {
      onLockSession()
    } else {
      window.dispatchEvent(new CustomEvent('nexus:lock-session'))
      window.dispatchEvent(new CustomEvent('nexus:navigate-tab', { detail: 'profile' }))
    }
  }, [onLockSession])

  return (
    <header className="h-[52px] bg-slate-950/80 backdrop-blur-xl border-b border-white/10 px-4 flex items-center justify-between z-30 shrink-0 select-none relative w-full">
      {/* =====================================================================
          LEFT: Kinetic NEXUS OS v5.0 + [DEV/STUDY/STUDIO/SILENT] + [Cmd+K Features]
         ===================================================================== */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          onClick={() => onNavigateHome && onNavigateHome()}
          title="NEXUS OS — Click to return Home"
        >
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.45)] bg-black/60 flex items-center justify-center shrink-0">
            <img
              src={nexusLogo}
              alt="NEXUS"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-cyan-400/10 pointer-events-none" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 leading-none">
              <KineticText
                text="NEXUS OS"
                duration={240}
                className="font-mono font-black text-sm tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300"
              />
              <span className="text-[10px] font-mono text-cyan-400/90 font-bold px-1 py-0.2 rounded border border-cyan-400/30 bg-cyan-500/10">
                v5.0
              </span>
            </div>
            <span className="text-[9px] font-mono text-cyan-400/80 tracking-widest mt-0.5 font-bold">
              SOVEREIGN ARCHITECTURE
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-white/10 mx-1 shrink-0" />

        {/* 4 Chromatic Mode Pills */}
        <div className="flex items-center gap-1 font-mono text-xs shrink-0">
          {MODE_PILLS.map((p) => {
            const isActive = workspaceMode === p.id
            return (
              <button
                key={p.id}
                onClick={() => onSelectWorkspaceMode(p.id)}
                className={`px-2 py-0.5 rounded-lg border font-bold text-[11px] transition-all duration-200 cursor-pointer ${
                  isActive
                    ? `${p.bg} ${p.border} ${p.color} shadow-[0_0_12px_rgba(0,245,212,0.25)]`
                    : 'border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:border-white/10'
                }`}
                title={`Switch to ${p.id} Neural Workspace`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* [Cmd+K Features] Button */}
        <button
          onClick={handleOpenCommandPalette}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-cyan-500/25 bg-cyan-950/30 hover:bg-cyan-500/15 text-cyan-300 hover:text-cyan-100 text-[11px] font-mono transition-all group cursor-pointer shadow-[0_0_8px_rgba(6,182,212,0.12)] shrink-0 active:scale-95"
          title="Open Command & Features Launcher (Cmd+K / Ctrl+K)"
        >
          <Search className="w-3 h-3 text-cyan-400 group-hover:scale-110 transition-transform" />
          <span className="font-semibold">Cmd+K Features</span>
          <kbd className="text-[9px] px-1 py-0.2 rounded bg-black/50 border border-cyan-400/30 text-cyan-300/90 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* =====================================================================
          CENTER: 280x44 Dynamic Notch HUD Bay Cutout
          Reserved clearance bay for apps/notch_hud/notch_window.py
         ===================================================================== */}
      <div
        id="nexus-notch-bay"
        className="w-[280px] min-w-[280px] h-[44px] pointer-events-none flex flex-col items-center justify-center rounded-b-2xl border-x border-b border-cyan-500/20 bg-black/40 shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md shrink-0 relative overflow-hidden"
        title="Dynamic Notch HUD Clearance Bay"
      >
        <div className="absolute top-0 left-0 w-2 h-1 border-l border-t border-cyan-400/50" />
        <div className="absolute top-0 right-0 w-2 h-1 border-r border-t border-cyan-400/50" />
        <div className="flex items-center gap-1.5 opacity-60 text-[9px] font-mono tracking-widest text-cyan-300">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 animate-pulse" />
          <span>DYNAMIC NOTCH BAY (280×44)</span>
        </div>
      </div>

      {/* =====================================================================
          RIGHT: Theme/Wallpaper quick button, GPU quota + Release GPU,
                 WAL ping LED, [Alt+D DIAG], [LOCK], and unclipped crimson [E-STOP]
         ===================================================================== */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Telemetry: RAM */}
        <div className="hidden 2xl:flex items-center gap-1 text-xs font-mono text-slate-400 cursor-default">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>RAM</span>
          <strong className="text-slate-200">{telemetry.ramMb} MB</strong>
        </div>

        {/* Theme/Wallpaper Quick Button */}
        <button
          onClick={handleOpenTheme}
          className="px-2.5 py-1 rounded-lg border border-purple-500/30 hover:border-purple-400/60 bg-purple-950/20 hover:bg-purple-900/30 text-purple-300 hover:text-purple-100 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(168,85,247,0.15)] shrink-0 active:scale-95"
          title="Theme & Wallpaper Studio (View 08)"
        >
          <Palette className="w-3.5 h-3.5 text-purple-400" />
          <span className="hidden xl:inline">THEME / WALLPAPER</span>
          <span className="xl:hidden">THEME</span>
        </button>

        {/* GPU Quota + Release GPU */}
        <div className="flex items-center rounded-lg border border-cyan-500/25 bg-slate-900/60 text-xs font-mono backdrop-blur-sm overflow-hidden shadow-[0_0_12px_rgba(6,182,212,0.12)] shrink-0">
          <div
            className="px-2 py-0.5 flex items-center gap-1 text-slate-300 border-r border-white/10"
            title="Sovereign GPU Quota: 100% Free-Tier Local & Edge VRAM"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider">
              {gpuReleased ? 'FLUSHED' : 'GPU: ∞'}
            </span>
          </div>
          <button
            onClick={handleReleaseGpu}
            disabled={isReleasingGpu}
            className="px-2 py-0.5 text-[11px] font-bold text-cyan-400 hover:text-cyan-200 hover:bg-cyan-500/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Release GPU VRAM cache, flush shader pipelines & garbage collect"
          >
            <Zap className={`w-3 h-3 ${isReleasingGpu ? 'animate-spin text-amber-400' : 'text-cyan-400'}`} />
            <span>{isReleasingGpu ? 'FLUSHING...' : 'Release GPU'}</span>
          </button>
        </div>

        {/* Real-Time WAL Ping LED */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/10 bg-slate-900/50 text-xs font-mono shrink-0 cursor-default"
          title={`SQLite WAL Replication Mesh Ping: ${telemetry.lastPingMs}ms`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                telemetry.wsConnected || isIpcOnline
                  ? telemetry.lastPingMs <= 50
                    ? 'animate-ping bg-emerald-400'
                    : 'animate-ping bg-amber-400'
                  : 'bg-red-500'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                telemetry.wsConnected || isIpcOnline
                  ? telemetry.lastPingMs <= 50
                    ? 'bg-emerald-400 shadow-[0_0_8px_#10B981]'
                    : 'bg-amber-400 shadow-[0_0_8px_#F59E0B]'
                  : 'bg-red-500 shadow-[0_0_8px_#EF4444]'
              }`}
            />
          </span>
          <span className="text-[10px] font-bold text-slate-400">WAL</span>
          <strong
            className={`text-[11px] font-mono ${
              telemetry.wsConnected || isIpcOnline
                ? telemetry.lastPingMs <= 50
                  ? 'text-emerald-400'
                  : 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {telemetry.wsConnected || isIpcOnline ? `${telemetry.lastPingMs}ms` : 'OFFLINE'}
          </strong>
        </div>

        {/* Quick Diagnostics HUD (Alt+D) */}
        <button
          onClick={onToggleDiagnostics}
          className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shrink-0 ${
            showDiagnostics
              ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
              : 'border-white/10 hover:border-cyan-400/50 bg-white/5 hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-200'
          }`}
          title="Toggle Diagnostics HUD (Alt+D)"
        >
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">DIAG [Alt+D]</span>
        </button>

        {/* [LOCK] Enclave Quick Lock */}
        <button
          onClick={handleLock}
          className="px-2.5 py-1 rounded-lg border border-amber-500/30 hover:border-amber-400/60 bg-amber-950/20 hover:bg-amber-900/30 text-amber-300 hover:text-amber-100 text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(245,158,11,0.15)] active:scale-95 shrink-0"
          title="Lock Session & Enclave Security Guard"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>[LOCK]</span>
        </button>

        {/* Unclipped Crimson [E-STOP] Button */}
        <button
          onClick={onTriggerEstop}
          className="px-3 py-1 rounded-lg border border-red-500/70 bg-red-950/70 hover:bg-red-900/90 text-red-200 hover:text-red-50 text-xs font-mono font-black tracking-wider shadow-[0_0_16px_rgba(239,68,68,0.5)] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
          title="Emergency Stop: Halt all running processes, subagents and coroutines"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-red-400 animate-pulse" />
          <span>[E-STOP]</span>
        </button>

        {/* Audit & Telemetry Drawer Toggle */}
        {onToggleDrawer && (
          <button
            onClick={onToggleDrawer}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0 ${
              isDrawerOpen
                ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 hover:border-white/20'
            }`}
            title="Toggle Audit & Telemetry Drawer"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden xl:inline">AUDIT</span>
          </button>
        )}
      </div>
    </header>
  )
}

export default TopBar
