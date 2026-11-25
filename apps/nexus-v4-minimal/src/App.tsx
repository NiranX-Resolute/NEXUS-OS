import {
  Component,
  type ComponentType,
  type ErrorInfo,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Cpu,
  Globe,
  Loader2,
  MessageSquare,
  Minus,
  OctagonAlert,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Search,
  Shield,
  Sliders,
  Square,
  Target,
  X,
} from 'lucide-react';
import CircuitDrawer from './components/CircuitDrawer';
import CommandPalette from './components/CommandPalette';
import { useNexusStore } from './store/useNexusStore';
import type { NavTabId, WorkspaceMode } from './types';

const CockpitView = lazy(() => import('./views/CockpitView'));
const ChatView = lazy(() => import('./views/ChatView'));
const StudioView = lazy(() => import('./views/StudioView'));
const ScholarView = lazy(() => import('./views/ScholarView'));
const AutopilotView = lazy(() => import('./views/AutopilotView'));
const InterviewView = lazy(() => import('./views/InterviewView'));
const WorldView = lazy(() => import('./views/WorldView'));
const VaultView = lazy(() => import('./views/VaultView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

interface NavModule {
  id: NavTabId;
  label: string;
  shortcut: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV_MODULES: NavModule[] = [
  { id: 'core', label: 'Cockpit', shortcut: '1', icon: Activity },
  { id: 'chat', label: 'Chat', shortcut: '2', icon: MessageSquare },
  { id: 'studio', label: 'Studio', shortcut: '3', icon: Code2 },
  { id: 'scholar', label: 'Scholar', shortcut: '4', icon: BookOpen },
  { id: 'autopilot', label: 'Autopilot', shortcut: '5', icon: Cpu },
  { id: 'interview', label: 'Interview', shortcut: '6', icon: Target },
  { id: 'world', label: 'World', shortcut: '7', icon: Globe },
  { id: 'vault', label: 'Vault', shortcut: '8', icon: Shield },
  { id: 'settings', label: 'Settings', shortcut: '9', icon: Sliders },
];

const WORKSPACE_MODES: WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT'];
const SIDEBAR_STORAGE_KEY = 'nexus_v4_sidebar_collapsed';

interface ViewBoundaryProps {
  activeTab: NavTabId;
  onNavigateHome: () => void;
  children: ReactNode;
}

interface ViewBoundaryState {
  hasError: boolean;
  message: string;
}

class ViewErrorBoundary extends Component<ViewBoundaryProps, ViewBoundaryState> {
  state: ViewBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ViewBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Module failed to render',
    };
  }

  componentDidUpdate(prevProps: ViewBoundaryProps): void {
    if (prevProps.activeTab !== this.props.activeTab && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[nexus-v4-minimal] View error boundary caught failure:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="monograph-surface w-full max-w-md rounded-lg p-6">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-amber-400">
              Module Boundary Recovery
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-300">
              {this.state.message}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/[0.08]"
              >
                Retry Module
              </button>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  this.props.onNavigateHome();
                }}
                className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
              >
                Return to Cockpit
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ViewLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
        <span>Loading {label}…</span>
      </div>
    </div>
  );
}

export function App() {
  const activeTab = useNexusStore((s) => s.activeTab);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const telemetry = useNexusStore((s) => s.telemetry);
  const tasks = useNexusStore((s) => s.tasks);
  const isOnline = useNexusStore((s) => s.isOnline);
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useNexusStore((s) => s.setCommandPaletteOpen);
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const toast = useNexusStore((s) => s.toast);
  const dismissToast = useNexusStore((s) => s.dismissToast);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const toggleEstop = useNexusStore((s) => s.toggleEstop);
  const connectTelemetryWs = useNexusStore((s) => s.connectTelemetryWs);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);

  const hasElectronWindow =
    typeof window !== 'undefined' && Boolean(window.nexusWindow);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore storage write restrictions
    }
  }, [sidebarCollapsed]);

  // Boot telemetry WebSocket, initial state sync, and Electron window state
  useEffect(() => {
    void refreshAll();
    const disconnectWs = connectTelemetryWs();

    const refreshInterval = window.setInterval(() => {
      void refreshAll();
    }, 15000);

    const unsubscribeTelemetry = window.nexusTelemetry?.onEvent?.(() => {
      void refreshAll();
    });

    let unsubscribeMaximized: (() => void) | undefined;
    if (window.nexusWindow) {
      void window.nexusWindow
        .isMaximized()
        .then((val) => setIsMaximized(Boolean(val)))
        .catch(() => undefined);
      unsubscribeMaximized = window.nexusWindow.onMaximizedChange((maxState) => {
        setIsMaximized(Boolean(maxState));
      });
    }

    return () => {
      window.clearInterval(refreshInterval);
      unsubscribeTelemetry?.();
      unsubscribeMaximized?.();
      disconnectWs();
    };
  }, [connectTelemetryWs, refreshAll]);

  // Global keyboard shortcuts: Ctrl+K / Cmd+K and Alt+1..9
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!useNexusStore.getState().commandPaletteOpen);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const index = Number(e.key) - 1;
        if (Number.isInteger(index) && index >= 0 && index < NAV_MODULES.length) {
          e.preventDefault();
          setActiveTab(NAV_MODULES[index].id);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setActiveTab, setCommandPaletteOpen]);

  // Close workspace mode dropdown on outside click
  useEffect(() => {
    if (!modeMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [modeMenuOpen]);

  const currentModule = useMemo(
    () => NAV_MODULES.find((m) => m.id === activeTab) ?? NAV_MODULES[0],
    [activeTab]
  );

  const hasActiveTasks = useMemo(
    () =>
      tasks.some(
        (t) =>
          t.status === 'QUEUED' ||
          t.status === 'IN_PROGRESS' ||
          t.status === 'RUNNING'
      ),
    [tasks]
  );

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
    <div className="flex h-screen w-screen overflow-hidden bg-[#090a0c] text-zinc-100 select-none">
      {/* Narrow Collapsible Linear Sidebar (220px expanded / 56px icon mode) */}
      <aside
        className={`monograph-hairline-r flex h-full shrink-0 flex-col bg-[#090a0c] transition-[width] duration-150 ease-out ${
          sidebarCollapsed ? 'w-[56px]' : 'w-[220px]'
        }`}
      >
        {/* Sidebar Header (40px aligned with Top Bar) */}
        <div className="monograph-hairline-b electron-drag flex h-[40px] shrink-0 items-center justify-between px-3">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span className="truncate text-[13px] font-medium tracking-[-0.01em] text-zinc-100">
                Nexus
              </span>
              <span className="rounded border border-white/[0.08] bg-[#0e1014] px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-400">
                V4
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className={`electron-no-drag inline-flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200 ${
              sidebarCollapsed ? 'mx-auto' : ''
            }`}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* 9 Modules Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2.5" aria-label="Primary Modules">
          {NAV_MODULES.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? `${item.label} (Alt+${item.shortcut})` : undefined}
                aria-current={active ? 'page' : undefined}
                className={`group flex w-full items-center rounded-md border text-left transition ${
                  sidebarCollapsed ? 'justify-center px-0 py-2' : 'justify-between px-2.5 py-1.5'
                } ${
                  active
                    ? 'border-white/[0.09] bg-[#13161c] text-zinc-100'
                    : 'border-transparent text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition ${
                      active
                        ? 'text-emerald-400'
                        : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  {!sidebarCollapsed && (
                    <span className="truncate text-[13px] font-medium">{item.label}</span>
                  )}
                </span>

                {!sidebarCollapsed && (
                  <span
                    className={`font-mono text-[10.5px] tabular-nums ${
                      active ? 'text-zinc-400' : 'text-zinc-600 group-hover:text-zinc-500'
                    }`}
                  >
                    {item.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quiet Gateway Link Footer */}
        <div className="monograph-hairline-t flex h-[38px] shrink-0 items-center px-3">
          {sidebarCollapsed ? (
            <span
              title={
                isOnline
                  ? `IPC Connected${telemetry.latencyMs ? ` (${telemetry.latencyMs}ms)` : ''}`
                  : 'IPC Gateway Offline'
              }
              className={`mx-auto h-2 w-2 rounded-full ${
                isOnline ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          ) : (
            <div className="flex w-full items-center justify-between text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>{isOnline ? 'Bridge Ready' : 'Offline'}</span>
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-zinc-500">
                {isOnline && telemetry.latencyMs ? `${telemetry.latencyMs}ms` : '—'}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Column: 40px Breadcrumb Top Bar + Spacious Editorial Viewport */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#090a0c]">
        {/* Ultra-clean 40px Breadcrumb Top Bar */}
        <header className="monograph-hairline-b electron-drag flex h-[40px] shrink-0 items-center justify-between px-4">
          {/* Current Section Breadcrumb */}
          <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span className="text-zinc-500">Nexus</span>
            <span className="text-zinc-700">/</span>
            <span className="truncate font-medium text-zinc-100">{currentModule.label}</span>
          </div>

          {/* Right Controls: Mode pill / Ctrl+K / Inspector drawer / E-STOP / Electron window */}
          <div className="electron-no-drag flex items-center gap-2">
            {/* Workspace Mode Pill */}
            <div ref={modeMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setModeMenuOpen((prev) => !prev)}
                title="Switch Workspace Mode"
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] transition ${
                  telemetry.workspaceMode === 'SILENT'
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-300'
                    : 'border-white/[0.08] bg-[#0e1014] text-zinc-300 hover:border-white/[0.15] hover:text-zinc-100'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    telemetry.workspaceMode === 'SILENT'
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                />
                <span>{telemetry.workspaceMode}</span>
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              </button>

              {modeMenuOpen && (
                <div className="monograph-elevated absolute right-0 top-8 z-50 w-36 rounded-md border border-white/[0.12] p-1 shadow-xl">
                  {WORKSPACE_MODES.map((mode) => {
                    const selected = telemetry.workspaceMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setModeMenuOpen(false);
                          void switchWorkspaceMode(mode);
                        }}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 font-mono text-[11px] transition ${
                          selected
                            ? 'bg-white/[0.08] text-zinc-100'
                            : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                        }`}
                      >
                        <span>{mode}</span>
                        {selected && <Check className="h-3 w-3 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ctrl+K Spotlight Trigger */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(!commandPaletteOpen)}
              title="Open Command Palette (Ctrl+K)"
              className="inline-flex h-7 items-center gap-2 rounded-md border border-white/[0.08] bg-[#0e1014] px-2.5 text-[11.5px] text-zinc-400 transition hover:border-white/[0.15] hover:text-zinc-100"
            >
              <Search className="h-3 w-3" />
              <kbd className="monograph-kbd">Ctrl+K</kbd>
            </button>

            {/* Circuit Inspector Drawer Toggle */}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              title="Toggle Circuit Inspector Drawer"
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition ${
                drawerOpen
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/[0.08] bg-[#0e1014] text-zinc-300 hover:border-white/[0.15] hover:text-zinc-100'
              }`}
            >
              <PanelRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Inspector</span>
              {hasActiveTasks && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </button>

            {/* E-STOP Toggle */}
            <button
              type="button"
              onClick={() => void toggleEstop()}
              title={
                telemetry.estopActive
                  ? 'Reset Emergency Stop'
                  : 'Trigger Emergency Stop'
              }
              className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[11px] font-medium transition ${
                telemetry.estopActive
                  ? 'border-red-500/50 bg-red-500/20 text-red-200 hover:bg-red-500/30'
                  : 'border-white/[0.08] bg-[#0e1014] text-zinc-300 hover:border-amber-500/35 hover:text-amber-300'
              }`}
            >
              <OctagonAlert className="h-3 w-3" />
              <span>{telemetry.estopActive ? 'E-STOP ON' : 'E-STOP'}</span>
            </button>

            {/* Electron Frameless Window Controls */}
            {hasElectronWindow && (
              <div className="ml-1 flex items-center gap-0.5 border-l border-white/[0.08] pl-2">
                <button
                  type="button"
                  onClick={() => window.nexusWindow?.minimize()}
                  title="Minimize"
                  aria-label="Minimize window"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => window.nexusWindow?.maximize()}
                  title={isMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <Square className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => window.nexusWindow?.close()}
                  title="Close"
                  aria-label="Close window"
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 transition hover:bg-red-500/20 hover:text-red-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Spacious Editorial Viewport */}
        <main className="min-h-0 flex-1 overflow-hidden bg-[#090a0c]">
          <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col p-6">
            <ViewErrorBoundary
              activeTab={activeTab}
              onNavigateHome={() => setActiveTab('core')}
            >
              <Suspense fallback={<ViewLoadingFallback label={currentModule.label} />}>
                {renderActiveView()}
              </Suspense>
            </ViewErrorBoundary>
          </div>
        </main>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <CircuitDrawer />

      {/* Minimalist Toast Banner */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="electron-no-drag monograph-elevated fixed bottom-5 right-5 z-[60] flex max-w-sm items-center gap-3 rounded-lg border border-white/[0.12] px-3.5 py-2.5 shadow-xl"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              toast.tone === 'success'
                ? 'bg-emerald-400'
                : toast.tone === 'warn'
                ? 'bg-amber-400'
                : toast.tone === 'error'
                ? 'bg-red-400'
                : 'bg-zinc-400'
            }`}
          />
          <span className="text-[12.5px] leading-snug text-zinc-200">{toast.message}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss notification"
            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition hover:text-zinc-200"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
