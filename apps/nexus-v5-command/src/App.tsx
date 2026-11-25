import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Cpu,
  Globe,
  Info,
  Loader2,
  Lock,
  Maximize2,
  MessageSquare,
  Minus,
  Search,
  Settings,
  ShieldAlert,
  Square,
  Unlock,
  X,
} from 'lucide-react';
import { CircuitDrawer } from '@/components/CircuitDrawer';
import { CommandPalette } from '@/components/CommandPalette';
import { useNexusStore } from '@/store/useNexusStore';
import type { NavTabId, WorkspaceMode } from '@/types';

const CockpitView = lazy(() => import('@/views/CockpitView'));
const ChatView = lazy(() => import('@/views/ChatView'));
const StudioView = lazy(() => import('@/views/StudioView'));
const ScholarView = lazy(() => import('@/views/ScholarView'));
const AutopilotView = lazy(() => import('@/views/AutopilotView'));
const InterviewView = lazy(() => import('@/views/InterviewView'));
const WorldView = lazy(() => import('@/views/WorldView'));
const VaultView = lazy(() => import('@/views/VaultView'));
const SettingsView = lazy(() => import('@/views/SettingsView'));

interface NexusWindowBridge {
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
  isMaximized?: () => Promise<boolean>;
}

interface NavItem {
  id: NavTabId;
  label: string;
  code: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'core', label: 'Core Matrix', code: '01', icon: Cpu },
  { id: 'chat', label: 'Neural Chat', code: '02', icon: MessageSquare },
  { id: 'studio', label: 'NexKoder IDE', code: '03', icon: Code2 },
  { id: 'scholar', label: 'Scholar & FTS5', code: '04', icon: BookOpen },
  { id: 'autopilot', label: 'Autopilot Mesh', code: '05', icon: Bot },
  { id: 'interview', label: 'Live Interview', code: '06', icon: Briefcase },
  { id: 'world', label: 'World & Browser', code: '07', icon: Globe },
  { id: 'vault', label: 'Sovereign Vault', code: '08', icon: Lock },
  { id: 'settings', label: 'Matrix Settings', code: '09', icon: Settings },
];

const WORKSPACE_MODES: WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT'];

interface ViewErrorBoundaryProps {
  resetKey: string;
  onResetCore: () => void;
  children: React.ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl matrix-panel border border-red-500/35 p-6 max-w-2xl mx-auto mt-10 space-y-4">
          <div className="flex items-center gap-2.5 text-red-300 font-mono text-xs uppercase tracking-[0.18em]">
            <AlertTriangle className="w-4 h-4" />
            Module Fault Boundary
          </div>
          <h2 className="text-lg font-semibold text-emerald-50">
            Active view encountered a runtime exception
          </h2>
          <pre className="rounded-xl bg-[#05080b] border border-red-500/20 p-3.5 text-xs font-mono text-red-200 overflow-x-auto whitespace-pre-wrap">
            {this.state.message}
          </pre>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-3.5 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/12 hover:bg-emerald-500/20 text-emerald-200 text-xs font-mono transition-colors"
            >
              Retry Module
            </button>
            <button
              type="button"
              onClick={this.props.onResetCore}
              className="px-3.5 py-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-xs font-mono transition-colors"
            >
              Return to Core
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function StageLoader() {
  return (
    <div className="min-h-[380px] flex flex-col items-center justify-center gap-3 text-xs font-mono text-slate-400">
      <div className="w-10 h-10 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center matrix-glow">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
      <span className="uppercase tracking-[0.2em] text-emerald-300/80">
        Initializing Cyber Matrix Module...
      </span>
    </div>
  );
}

export function App() {
  const activeTab = useNexusStore((s) => s.activeTab);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const telemetry = useNexusStore((s) => s.telemetry);
  const isOnline = useNexusStore((s) => s.isOnline);
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const setCommandPaletteOpen = useNexusStore((s) => s.setCommandPaletteOpen);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const toggleEstop = useNexusStore((s) => s.toggleEstop);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const connectTelemetryWs = useNexusStore((s) => s.connectTelemetryWs);
  const disconnectTelemetryWs = useNexusStore((s) => s.disconnectTelemetryWs);
  const toast = useNexusStore((s) => s.toast);
  const dismissToast = useNexusStore((s) => s.dismissToast);

  const [railExpanded, setRailExpanded] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const nexusWindow = (window as unknown as { nexusWindow?: NexusWindowBridge }).nexusWindow;

  useEffect(() => {
    void refreshAll();
    connectTelemetryWs();
    const timer = window.setInterval(() => {
      void refreshAll();
    }, 12000);

    return () => {
      window.clearInterval(timer);
      disconnectTelemetryWs();
    };
  }, [connectTelemetryWs, disconnectTelemetryWs, refreshAll]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const isOpen = useNexusStore.getState().commandPaletteOpen;
        setCommandPaletteOpen(!isOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (!nexusWindow?.isMaximized) return;
    void nexusWindow
      .isMaximized()
      .then((max) => setIsMaximized(Boolean(max)))
      .catch(() => undefined);
  }, [nexusWindow]);

  const handleToggleMaximize = useCallback(() => {
    if (!nexusWindow?.maximize) return;
    nexusWindow.maximize();
    setIsMaximized((prev) => !prev);
  }, [nexusWindow]);

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
    <div className="h-screen w-screen overflow-hidden flex flex-col matrix-carbon-bg relative text-emerald-50">
      {/* Restrained Neural Grid Overlay */}
      <div className="pointer-events-none fixed inset-0 matrix-grid opacity-55" aria-hidden="true" />

      {/* Slim 48px Cyber Header (Strictly 3 Crisp Groups) */}
      <header className="relative z-20 h-12 shrink-0 px-3.5 border-b border-white/10 bg-[#05080b]/90 backdrop-blur-xl flex items-center justify-between gap-3 drag-region">
        {/* Group 1: Brand + Workspace Mode Selector */}
        <div className="flex items-center gap-3 min-w-0 no-drag">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('core')}
              className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  telemetry.estopActive
                    ? 'bg-red-500 shadow-[0_0_10px_#ef4444]'
                    : isOnline
                      ? 'bg-emerald-400 shadow-[0_0_10px_#10b981]'
                      : 'bg-slate-500'
                }`}
              />
              <span className="font-mono text-xs font-semibold tracking-[0.18em] text-emerald-100 matrix-text-glow">
                NEXUS <span className="text-cyan-300">V5</span>
              </span>
            </button>
          </div>

          <div
            className="hidden md:flex items-center gap-0.5 p-0.5 rounded-xl bg-[#090f16]/90 border border-white/10"
            role="group"
            aria-label="Workspace mode selector"
          >
            {WORKSPACE_MODES.map((mode) => {
              const active = telemetry.workspaceMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void switchWorkspaceMode(mode)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono tracking-wider transition-all ${
                    active
                      ? mode === 'SILENT'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                        : 'bg-emerald-500/18 text-emerald-200 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 2: Ctrl+K Search Pill */}
        <div className="flex-1 max-w-md flex justify-center no-drag">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full max-w-sm h-8 px-3 rounded-xl bg-[#090f16]/85 border border-white/10 hover:border-cyan-400/40 flex items-center justify-between gap-2 text-xs text-slate-400 hover:text-emerald-100 transition-colors"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Command Spotlight...</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded border border-white/10 bg-[#05080b] text-[10px] font-mono text-cyan-300 shrink-0">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Group 3: Telemetry Drawer Trigger + E-STOP + Electron Window Controls */}
        <div className="flex items-center gap-2 shrink-0 no-drag">
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            aria-label="Toggle circuit telemetry drawer"
            className={`h-8 px-2.5 rounded-xl border text-xs font-mono inline-flex items-center gap-1.5 transition-colors ${
              drawerOpen
                ? 'bg-cyan-500/18 border-cyan-400/45 text-cyan-200'
                : 'bg-[#090f16]/85 border-white/10 text-slate-300 hover:border-cyan-400/35 hover:text-cyan-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden sm:inline">Circuit</span>
            {telemetry.activeSlices > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] tabular-nums">
                {telemetry.activeSlices}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleEstop()}
            className={`h-8 px-2.5 rounded-xl border text-xs font-mono font-semibold inline-flex items-center gap-1.5 transition-all ${
              telemetry.estopActive
                ? 'bg-red-500/25 border-red-400/60 text-red-100 shadow-[0_0_16px_rgba(239,68,68,0.4)] animate-pulse'
                : 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20 hover:border-red-400/50'
            }`}
          >
            {telemetry.estopActive ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>RESET</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>E-STOP</span>
              </>
            )}
          </button>

          {nexusWindow && (
            <div className="flex items-center gap-1 pl-1.5 ml-1 border-l border-white/10">
              <button
                type="button"
                onClick={() => nexusWindow.minimize?.()}
                aria-label="Minimize window"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-100 hover:bg-white/8 transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleToggleMaximize}
                aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-cyan-200 hover:bg-white/8 transition-colors"
              >
                {isMaximized ? (
                  <Square className="w-3 h-3" />
                ) : (
                  <Maximize2 className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => nexusWindow.close?.()}
                aria-label="Close window"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-300 hover:bg-red-500/15 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Body: Collapsible Left Icon Rail + Spacious Main Stage */}
      <div className="relative z-10 flex-1 min-h-0 flex">
        <nav
          aria-label="Primary module navigation"
          className={`shrink-0 border-r border-white/10 bg-[#05080b]/82 backdrop-blur-xl flex flex-col justify-between py-3 transition-all duration-200 ${
            railExpanded ? 'w-56 px-2.5' : 'w-16 px-2'
          }`}
        >
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className={`group relative w-full h-10 rounded-xl flex items-center border transition-all ${
                    railExpanded ? 'px-3 justify-between' : 'justify-center'
                  } ${
                    isActive
                      ? 'bg-emerald-500/14 border-emerald-500/40 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.16)]'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-cyan-200 hover:bg-white/[0.04] hover:border-white/10'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-emerald-300' : 'group-hover:text-cyan-300'
                      }`}
                    />
                    {railExpanded && (
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    )}
                  </span>
                  {railExpanded && (
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {item.code}
                    </span>
                  )}

                  {!railExpanded && (
                    <span className="pointer-events-none absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-[#090f16] border border-emerald-500/30 text-[11px] font-mono text-emerald-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-30">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-white/8">
            <button
              type="button"
              onClick={() => setRailExpanded((v) => !v)}
              aria-label={railExpanded ? 'Collapse navigation rail' : 'Expand navigation rail'}
              className={`w-full h-9 rounded-xl border border-white/8 bg-[#090f16]/70 hover:border-cyan-400/35 text-slate-400 hover:text-cyan-200 flex items-center transition-colors ${
                railExpanded ? 'px-3 justify-between' : 'justify-center'
              }`}
            >
              {railExpanded && (
                <span className="text-[11px] font-mono uppercase tracking-wider">Collapse</span>
              )}
              {railExpanded ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </nav>

        {/* Spacious Main Stage */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-6 max-w-[1440px] mx-auto min-h-full">
            <ViewErrorBoundary
              resetKey={activeTab}
              onResetCore={() => setActiveTab('core')}
            >
              <Suspense fallback={<StageLoader />}>{renderActiveView()}</Suspense>
            </ViewErrorBoundary>
          </div>
        </main>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <CircuitDrawer />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 max-w-sm animate-matrix-in"
        >
          <div
            className={`rounded-xl px-4 py-3 border backdrop-blur-xl shadow-2xl flex items-start gap-3 ${
              toast.kind === 'error'
                ? 'bg-[#160a0d]/95 border-red-500/45 text-red-100'
                : toast.kind === 'warn'
                  ? 'bg-[#151108]/95 border-amber-400/45 text-amber-100'
                  : toast.kind === 'success'
                    ? 'bg-[#071510]/95 border-emerald-500/45 text-emerald-100'
                    : 'bg-[#081218]/95 border-cyan-400/45 text-cyan-100'
            }`}
          >
            {toast.kind === 'error' || toast.kind === 'warn' ? (
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  toast.kind === 'error' ? 'text-red-400' : 'text-amber-300'
                }`}
              />
            ) : toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-cyan-300" />
            )}
            <p className="text-xs leading-relaxed flex-1 break-words">{toast.message}</p>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="p-0.5 rounded text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
