import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Cpu,
  Globe,
  Info,
  Lock,
  MessageSquare,
  Minus,
  OctagonAlert,
  PanelRight,
  Search,
  Settings,
  Square,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { CircuitDrawer } from './components/CircuitDrawer';
import { CommandPalette } from './components/CommandPalette';
import { useNexusStore } from './store/useNexusStore';
import type { NavTabId, ToastNotice, WorkspaceMode } from './types';

const CockpitView = lazy(() => import('./views/CockpitView'));
const ChatView = lazy(() => import('./views/ChatView'));
const StudioView = lazy(() => import('./views/StudioView'));
const ScholarView = lazy(() => import('./views/ScholarView'));
const AutopilotView = lazy(() => import('./views/AutopilotView'));
const InterviewView = lazy(() => import('./views/InterviewView'));
const WorldView = lazy(() => import('./views/WorldView'));
const VaultView = lazy(() => import('./views/VaultView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

interface NexusWindowBridge {
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
  isMaximized?: () => Promise<boolean>;
  onStateChange?: (cb: (state: { maximized: boolean }) => void) => () => void;
}

const NAV_TABS: Array<{
  id: NavTabId;
  label: string;
  icon: typeof Cpu;
}> = [
  { id: 'core', label: 'Core', icon: Cpu },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'studio', label: 'Studio', icon: Code2 },
  { id: 'scholar', label: 'Scholar', icon: BookOpen },
  { id: 'autopilot', label: 'Autopilot', icon: Zap },
  { id: 'interview', label: 'Interview', icon: BrainCircuit },
  { id: 'world', label: 'World', icon: Globe },
  { id: 'vault', label: 'Vault', icon: Lock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const WORKSPACE_MODE_META: Record<
  WorkspaceMode,
  { dotClass: string; pillClass: string; caption: string }
> = {
  DEV: {
    dotClass: 'bg-cyan-400',
    pillClass: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-200',
    caption: 'Engineering & AST',
  },
  STUDY: {
    dotClass: 'bg-amber-400',
    pillClass: 'border-amber-400/35 bg-amber-500/10 text-amber-200',
    caption: 'Academic & Research',
  },
  STUDIO: {
    dotClass: 'bg-emerald-400',
    pillClass: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200',
    caption: 'Creative Audio / Vision',
  },
  SILENT: {
    dotClass: 'bg-indigo-400',
    pillClass: 'border-indigo-400/35 bg-indigo-500/10 text-indigo-200',
    caption: 'Air-Gapped Sovereign',
  },
};

function getNexusWindow(): NexusWindowBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { nexusWindow?: NexusWindowBridge }).nexusWindow;
}

interface ViewErrorBoundaryProps {
  moduleKey: NavTabId;
  children: ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Module failed to render',
    };
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps) {
    if (prevProps.moduleKey !== this.props.moduleKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[nexus-v2-cockpit] View error (${this.props.moduleKey}):`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="aether-glass rounded-2xl p-8 max-w-md w-full text-center space-y-4 border border-rose-400/30">
            <div className="w-12 h-12 mx-auto rounded-2xl border border-rose-400/35 bg-rose-500/15 flex items-center justify-center text-rose-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-100">
                Module Fault Isolated ({this.props.moduleKey})
              </h2>
              <p className="text-xs font-mono text-rose-300 break-words">
                {this.state.errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="px-4 py-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-xs font-medium text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              Reload Module
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ModuleSuspenseFallback() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="aether-glass rounded-2xl px-6 py-5 flex items-center gap-3.5 border border-cyan-500/25">
        <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 aether-pulse" />
        <span className="text-xs font-mono uppercase tracking-[0.2em] text-cyan-200">
          Initializing Module
        </span>
      </div>
    </div>
  );
}

function toastToneMeta(tone: ToastNotice['tone']) {
  switch (tone) {
    case 'success':
      return {
        border: 'border-emerald-400/40 bg-emerald-950/75 text-emerald-100',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
      };
    case 'warn':
      return {
        border: 'border-amber-400/40 bg-amber-950/75 text-amber-100',
        icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
      };
    case 'error':
      return {
        border: 'border-rose-400/45 bg-rose-950/80 text-rose-100',
        icon: <XCircle className="w-4 h-4 text-rose-400 shrink-0" />,
      };
    default:
      return {
        border: 'border-cyan-400/40 bg-[#091322]/90 text-slate-100',
        icon: <Info className="w-4 h-4 text-cyan-400 shrink-0" />,
      };
  }
}

export function App() {
  const activeTab = useNexusStore((s) => s.activeTab);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const setCommandPaletteOpen = useNexusStore((s) => s.setCommandPaletteOpen);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const toggleEstop = useNexusStore((s) => s.toggleEstop);
  const toast = useNexusStore((s) => s.toast);
  const dismissToast = useNexusStore((s) => s.dismissToast);

  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [hasElectronWindow, setHasElectronWindow] = useState(false);

  const modeMenuRef = useRef<HTMLDivElement | null>(null);

  // Boot gateway polling + telemetry WebSocket on mount; clean up on unmount
  useEffect(() => {
    const store = useNexusStore.getState();
    void store.refreshAll();
    store.connectTelemetryWs();

    const refreshInterval = window.setInterval(() => {
      void useNexusStore.getState().refreshAll();
    }, 15_000);

    return () => {
      window.clearInterval(refreshInterval);
      useNexusStore.getState().disconnectTelemetryWs();
    };
  }, []);

  // Global Ctrl+K / Cmd+K Command Palette binding
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const state = useNexusStore.getState();
        state.setCommandPaletteOpen(!state.commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Electron frameless window state tracking
  useEffect(() => {
    const winBridge = getNexusWindow();
    if (!winBridge) {
      setHasElectronWindow(false);
      return undefined;
    }

    setHasElectronWindow(true);
    let mounted = true;

    void winBridge.isMaximized?.().then((maxState) => {
      if (mounted && typeof maxState === 'boolean') {
        setIsMaximized(maxState);
      }
    }).catch(() => {});

    const unsubscribe = winBridge.onStateChange?.((state) => {
      if (mounted && typeof state?.maximized === 'boolean') {
        setIsMaximized(state.maximized);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  // Dismiss workspace mode dropdown on outside click or Escape
  useEffect(() => {
    if (!modeMenuOpen) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [modeMenuOpen]);

  const activeModeMeta = WORKSPACE_MODE_META[telemetry.workspaceMode] ?? WORKSPACE_MODE_META.DEV;
  const activeTaskCount = tasks.filter((t) => {
    const s = t.status.toUpperCase();
    return s === 'PENDING' || s === 'QUEUED' || s === 'RUNNING' || s === 'IN_PROGRESS';
  }).length;

  const statusDotClass =
    telemetry.estopActive || telemetry.status === 'OFFLINE'
      ? 'bg-rose-400'
      : telemetry.status === 'ONLINE'
        ? 'bg-emerald-400 aether-pulse'
        : 'bg-amber-400';

  const winBridge = hasElectronWindow ? getNexusWindow() : undefined;

  const renderActiveView = () => {
    switch (activeTab) {
      case 'core':
        return <CockpitView onNavigate={setActiveTab} />;
      case 'chat':
        return <ChatView />;
      case 'studio':
        return <StudioView />;
      case 'scholar':
        return <ScholarView />;
      case 'autopilot':
        return <AutopilotView />;
      case 'interview':
        return <InterviewView />;
      case 'world':
        return <WorldView />;
      case 'vault':
        return <VaultView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <CockpitView onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col aether-hud-grid text-slate-100">
      {/* Sleek 52px Top Aerospace HUD — Max 3 Balanced Clusters */}
      <header className="h-[52px] shrink-0 px-4 lg:px-6 border-b border-cyan-500/20 bg-[#050a14]/90 backdrop-blur-xl flex items-center justify-between gap-4 drag-region select-none z-30">
        {/* Cluster 1: Brand + Telemetry Status + Mode Selector */}
        <div className="flex items-center gap-3 min-w-0 no-drag">
          <button
            type="button"
            onClick={() => setActiveTab('core')}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.03] transition-colors"
            title="Nexus V2 — Aether Telemetry Cockpit"
          >
            <div className="w-7 h-7 rounded-lg border border-cyan-400/40 bg-cyan-500/15 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
              <Cpu className="w-3.5 h-3.5" />
            </div>
            <span className="hidden xl:inline text-xs font-semibold tracking-[0.14em] uppercase text-slate-100 whitespace-nowrap">
              Nexus V2
            </span>
          </button>

          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-800 bg-[#091322]/90 text-[10px] font-mono text-slate-300"
            title={`Gateway: ${telemetry.status} • WS: ${
              telemetry.wsConnected ? 'Live' : 'Polling'
            } • ${telemetry.latencyMs}ms`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`} />
            <span className="uppercase">{telemetry.estopActive ? 'LOCKED' : telemetry.status}</span>
          </div>

          {/* Compact Mode Selector */}
          <div className="relative" ref={modeMenuRef}>
            <button
              type="button"
              onClick={() => setModeMenuOpen((v) => !v)}
              aria-expanded={modeMenuOpen}
              aria-haspopup="listbox"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono transition-colors ${activeModeMeta.pillClass}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeModeMeta.dotClass}`} />
              <span>{telemetry.workspaceMode}</span>
              <ChevronDown className="w-3 h-3 opacity-75" />
            </button>

            {modeMenuOpen && (
              <div
                role="listbox"
                aria-label="Workspace Mode"
                className="absolute left-0 mt-2 w-56 aether-glass rounded-xl p-1.5 border border-cyan-400/30 shadow-2xl z-50 space-y-1"
              >
                {(['DEV', 'STUDY', 'STUDIO', 'SILENT'] as const).map((mode) => {
                  const meta = WORKSPACE_MODE_META[mode];
                  const selected = telemetry.workspaceMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setModeMenuOpen(false);
                        void switchWorkspaceMode(mode);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors border ${
                        selected
                          ? 'border-cyan-400/40 bg-cyan-500/15 text-slate-100'
                          : 'border-transparent text-slate-300 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-semibold">{mode}</div>
                          <div className="text-[10px] text-slate-400 truncate">{meta.caption}</div>
                        </div>
                      </div>
                      {selected && (
                        <span className="text-[10px] font-mono text-emerald-300">ACTIVE</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cluster 2: Compact Segmented Nav Tabs (All 9 Modules) */}
        <nav
          aria-label="Primary Cockpit Modules"
          className="no-drag flex items-center gap-0.5 rounded-xl border border-cyan-500/20 bg-[#091322]/90 p-1 overflow-x-auto max-w-full"
        >
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap border ${
                  active
                    ? 'border-cyan-400/45 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.18)]'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                }`}
              >
                <Icon className="hidden xl:block w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Cluster 3: Circuit Drawer + Ctrl+K + E-Stop + Electron Window Controls */}
        <div className="flex items-center gap-2 shrink-0 no-drag">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            title="Command Palette (Ctrl+K)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700/70 bg-[#091322]/90 text-[11px] font-mono text-slate-300 hover:border-cyan-400/45 hover:text-cyan-200 transition-colors"
          >
            <Search className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden 2xl:inline">Palette</span>
            <kbd className="text-[10px] text-slate-400">Ctrl+K</kbd>
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-expanded={drawerOpen}
            title="Toggle Circuit & Telemetry Inspector"
            className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
              drawerOpen
                ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700/70 bg-[#091322]/90 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200'
            }`}
          >
            <PanelRight className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Circuit</span>
            {activeTaskCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] text-emerald-300">
                {activeTaskCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleEstop('Top HUD Operator E-Stop')}
            title={
              telemetry.estopActive
                ? 'Reset Emergency Stop'
                : 'Engage Emergency Stop (Halt Autonomous Execution)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors ${
              telemetry.estopActive
                ? 'border-rose-400/70 bg-rose-500/25 text-rose-100 aether-pulse'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:border-rose-400/55'
            }`}
          >
            {telemetry.estopActive ? (
              <Activity className="w-3.5 h-3.5" />
            ) : (
              <OctagonAlert className="w-3.5 h-3.5" />
            )}
            <span>{telemetry.estopActive ? 'RESET' : 'E-STOP'}</span>
          </button>

          {winBridge && (
            <div className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-slate-800">
              <button
                type="button"
                onClick={() => winBridge.minimize?.()}
                aria-label="Minimize Window"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => winBridge.maximize?.()}
                aria-label={isMaximized ? 'Restore Window' : 'Maximize Window'}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
              >
                {isMaximized ? (
                  <Copy className="w-3 h-3" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => winBridge.close?.()}
                aria-label="Close Window"
                className="p-1.5 rounded-md text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Generous Centered Main Viewport */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full max-w-[1440px] mx-auto px-8 py-6 min-h-0 flex flex-col">
          <ViewErrorBoundary moduleKey={activeTab}>
            <Suspense fallback={<ModuleSuspenseFallback />}>
              <div className="flex-1 min-h-0 h-full">{renderActiveView()}</div>
            </Suspense>
          </ViewErrorBoundary>
        </div>
      </main>

      {/* Slide-over Circuit & Telemetry Drawer (closed by default) */}
      <CircuitDrawer />

      {/* Global Ctrl+K Command Palette */}
      <CommandPalette />

      {/* Toast Notification Overlay */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[60] max-w-sm pointer-events-none"
        >
          {(() => {
            const tone = toastToneMeta(toast.tone);
            return (
              <div
                className={`pointer-events-auto aether-glass rounded-xl px-4 py-3 border flex items-center gap-3 shadow-2xl ${tone.border}`}
              >
                {tone.icon}
                <span className="text-xs font-medium leading-snug flex-1">{toast.message}</span>
                <button
                  type="button"
                  onClick={dismissToast}
                  aria-label="Dismiss notification"
                  className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default App;
