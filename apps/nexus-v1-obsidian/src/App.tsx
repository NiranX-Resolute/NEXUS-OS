import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Eye,
  Globe,
  Info,
  Lock,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Square,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import { CircuitDrawer } from '@/components/CircuitDrawer';
import { CommandPalette } from '@/components/CommandPalette';
import { useNexusStore } from '@/store/useNexusStore';
import type { NavTabId, ToastTone, WorkspaceMode } from '@/types';

const CockpitView = lazy(() => import('@/views/CockpitView'));
const ChatView = lazy(() => import('@/views/ChatView'));
const StudioView = lazy(() => import('@/views/StudioView'));
const ScholarView = lazy(() => import('@/views/ScholarView'));
const AutopilotView = lazy(() => import('@/views/AutopilotView'));
const InterviewView = lazy(() => import('@/views/InterviewView'));
const WorldView = lazy(() => import('@/views/WorldView'));
const VaultView = lazy(() => import('@/views/VaultView'));
const SettingsView = lazy(() => import('@/views/SettingsView'));

interface NavRailItem {
  id: NavTabId;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: readonly NavRailItem[] = [
  { id: 'core', label: 'Core', hint: 'Cockpit & Telemetry', icon: Activity },
  { id: 'chat', label: 'Chat', hint: 'Companion & Haru Voice', icon: Bot },
  { id: 'studio', label: 'Studio', hint: 'NexKoder & Verify', icon: Code2 },
  { id: 'scholar', label: 'Scholar', hint: 'FTS5 Memory & Papers', icon: BookOpen },
  { id: 'autopilot', label: 'Autopilot', hint: 'Routines & Macros', icon: Zap },
  { id: 'interview', label: 'Interview', hint: 'Stealth Copilot', icon: Eye },
  { id: 'world', label: 'World', hint: 'Reach & Browser Recon', icon: Globe },
  { id: 'vault', label: 'Vault', hint: 'DPAPI, Shield & Canvas', icon: Shield },
  { id: 'settings', label: 'Settings', hint: 'Providers & Compute', icon: Settings },
];

const WORKSPACE_MODES: Array<{ mode: WorkspaceMode; label: string; detail: string }> = [
  { mode: 'DEV', label: 'DEV', detail: 'Full autonomous workspace' },
  { mode: 'STUDY', label: 'STUDY', detail: 'Focused Scholar cadence' },
  { mode: 'STUDIO', label: 'STUDIO', detail: 'Creative & voice mesh' },
  { mode: 'SILENT', label: 'SILENT', detail: 'Air-gapped lock' },
];

interface ViewErrorBoundaryProps {
  activeTab: NavTabId;
  onResetToCore: () => void;
  children: React.ReactNode;
}

interface ViewErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  constructor(props: ViewErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ViewErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected module render failure.',
    };
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps): void {
    if (prevProps.activeTab !== this.props.activeTab && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="obsidian-panel rounded-xl p-6 max-w-md w-full space-y-4 border border-red-500/35">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-red-500/35 bg-red-500/10 flex items-center justify-center text-red-400 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Module Render Interrupted
              </h3>
              <p className="text-xs font-mono text-[var(--text-muted)]">
                activeTab: {this.props.activeTab}
              </p>
            </div>
          </div>
          <p className="text-xs font-mono text-red-300/90 bg-[var(--panel-muted)] border border-[var(--border-subtle)] rounded-lg p-3 break-words">
            {this.state.errorMessage}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, errorMessage: '' })}
              className="flex-1 py-2 px-3 rounded-lg border border-emerald-500/40 bg-emerald-500/12 hover:bg-emerald-500/20 text-xs font-mono text-emerald-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Module
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onResetToCore();
              }}
              className="py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs font-mono text-[var(--text-secondary)] transition-colors"
            >
              Core Cockpit
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function ViewSuspenseFallback({ activeTab }: { activeTab: NavTabId }) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="obsidian-panel rounded-xl px-6 py-5 flex items-center gap-3.5">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-obsidian-pulse shrink-0" />
        <div className="space-y-0.5">
          <div className="text-xs font-mono uppercase tracking-[0.16em] text-[var(--text)]">
            Mounting {activeTab}
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Obsidian Sovereign Runtime
          </div>
        </div>
      </div>
    </div>
  );
}

function toastToneStyles(tone: ToastTone): {
  border: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  switch (tone) {
    case 'success':
      return {
        border: 'border-emerald-500/40',
        accent: 'text-emerald-400',
        icon: CheckCircle2,
      };
    case 'warning':
      return {
        border: 'border-amber-500/40',
        accent: 'text-amber-400',
        icon: AlertTriangle,
      };
    case 'error':
      return {
        border: 'border-red-500/45',
        accent: 'text-red-400',
        icon: ShieldAlert,
      };
    default:
      return {
        border: 'border-[var(--border)]',
        accent: 'text-emerald-400',
        icon: Info,
      };
  }
}

export function App() {
  const {
    activeTab,
    setActiveTab,
    telemetry,
    tasks,
    isOnline,
    drawerOpen,
    setDrawerOpen,
    setCommandPaletteOpen,
    toast,
    dismissToast,
    refreshAll,
    switchWorkspaceMode,
    toggleEstop,
    connectTelemetryWs,
    disconnectTelemetryWs,
  } = useNexusStore();

  const [railExpanded, setRailExpanded] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);

  const hasElectronWindow =
    typeof window !== 'undefined' && Boolean(window.nexusWindow);

  // Boot gateway telemetry + WebSocket stream on mount
  useEffect(() => {
    void refreshAll();
    connectTelemetryWs();

    const pollId = window.setInterval(() => {
      void refreshAll();
    }, 8000);

    return () => {
      window.clearInterval(pollId);
      disconnectTelemetryWs();
    };
  }, [connectTelemetryWs, disconnectTelemetryWs, refreshAll]);

  // Sync initial Electron window maximized state if running inside desktop shell
  useEffect(() => {
    if (typeof window === 'undefined' || !window.nexusWindow?.isMaximized) return;
    let active = true;
    void window.nexusWindow
      .isMaximized()
      .then((maxed) => {
        if (active) setIsMaximized(Boolean(maxed));
      })
      .catch(() => {
        // Ignore non-Electron runtime
      });
    return () => {
      active = false;
    };
  }, []);

  // Global Ctrl+K / Cmd+K spotlight binding
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const currentlyOpen = useNexusStore.getState().commandPaletteOpen;
        setCommandPaletteOpen(!currentlyOpen);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setCommandPaletteOpen]);

  // Close mode dropdown on outside click or Escape
  useEffect(() => {
    if (!modeMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [modeMenuOpen]);

  const activeTaskCount = tasks.filter((t) => {
    const st = String(t.status).toUpperCase();
    return st === 'QUEUED' || st === 'RUNNING' || st === 'IN_PROGRESS' || st === 'PENDING';
  }).length;

  const handleToggleMaximize = async () => {
    if (!window.nexusWindow?.maximize) return;
    try {
      const next = await window.nexusWindow.maximize();
      setIsMaximized(Boolean(next));
    } catch {
      // Ignore Electron bridge error
    }
  };

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

  const toastStyles = toast ? toastToneStyles(toast.tone) : null;
  const ToastIcon = toastStyles?.icon;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07090d] text-[#e6edf3] flex flex-col select-none">
      {/* 48px Crisp Top Header — strictly max 3 clean clusters */}
      <header className="h-12 shrink-0 border-b border-[var(--border)] bg-[#0a0d13] px-4 flex items-center justify-between gap-4 drag-region z-30">
        {/* Cluster 1: Brand + Mode Selector Dropdown */}
        <div className="flex items-center gap-3 min-w-0 no-drag">
          <button
            type="button"
            onClick={() => setActiveTab('core')}
            className="flex items-center gap-2.5 group focus:outline-none"
            title="Return to Core Cockpit"
          >
            <div className="w-7 h-7 rounded-lg border border-emerald-500/35 bg-emerald-500/10 flex items-center justify-center">
              <span
                className={`w-2 h-2 rounded-full ${
                  telemetry.estopActive
                    ? 'bg-red-400'
                    : isOnline
                      ? 'bg-emerald-400 animate-obsidian-pulse'
                      : 'bg-slate-500'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold tracking-[0.14em] uppercase text-[var(--text)] group-hover:text-emerald-300 transition-colors">
                Nexus
              </span>
              <span className="text-[10px] font-mono text-emerald-400/90">V1</span>
            </div>
          </button>

          <div className="h-4 w-px bg-[var(--border)]" />

          {/* Mode Selector Dropdown */}
          <div className="relative" ref={modeMenuRef}>
            <button
              type="button"
              onClick={() => setModeMenuOpen((prev) => !prev)}
              aria-expanded={modeMenuOpen}
              aria-haspopup="listbox"
              className={`h-7 px-2.5 rounded-lg border text-[11px] font-mono tracking-wider flex items-center gap-1.5 transition-colors ${
                telemetry.workspaceMode === 'SILENT'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-[var(--border)] bg-[var(--panel)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              {telemetry.workspaceMode === 'SILENT' && <Lock className="w-3 h-3 text-amber-400" />}
              <span>{telemetry.workspaceMode}</span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {modeMenuOpen && (
              <div
                role="listbox"
                aria-label="Workspace mode selector"
                className="absolute left-0 top-full mt-1.5 w-56 obsidian-panel-elevated rounded-xl p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.75)] z-50 space-y-0.5 animate-obsidian-fade"
              >
                {WORKSPACE_MODES.map((item) => {
                  const selected = telemetry.workspaceMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setModeMenuOpen(false);
                        void switchWorkspaceMode(item.mode);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                        selected
                          ? 'bg-emerald-500/12 text-emerald-300'
                          : 'hover:bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-mono font-semibold">{item.mode}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {item.detail}
                        </div>
                      </div>
                      {selected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cluster 2: Ctrl+K Command Palette Search Pill */}
        <div className="flex-1 max-w-md flex justify-center no-drag">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full max-w-sm h-8 px-3 rounded-lg border border-[var(--border)] bg-[#0d1218] hover:border-emerald-500/45 flex items-center justify-between gap-3 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            title="Open Command Palette (Ctrl+K)"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 text-emerald-400/85 shrink-0" />
              <span className="truncate">Search modules, modes, or gateway commands...</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-subtle)] bg-[#07090d] text-[10px] font-mono text-[var(--text-muted)] shrink-0">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Cluster 3: Circuit Drawer Toggle + E-STOP + Electron Window Controls */}
        <div className="flex items-center gap-2 shrink-0 no-drag">
          <button
            type="button"
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`h-7 px-2.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 transition-colors ${
              drawerOpen
                ? 'border-emerald-500/45 bg-emerald-500/14 text-emerald-300'
                : 'border-[var(--border)] bg-[var(--panel)] hover:border-emerald-500/40 text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
            title="Toggle Circuit Inspector Drawer"
          >
            <PanelRight className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Inspector</span>
            {activeTaskCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                {activeTaskCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => void toggleEstop()}
            className={`h-7 px-2.5 rounded-lg border text-[11px] font-mono font-semibold tracking-wider flex items-center gap-1.5 transition-colors ${
              telemetry.estopActive
                ? 'border-red-500/60 bg-red-500/22 text-red-200 hover:bg-red-500/30'
                : 'border-red-500/35 bg-red-500/10 text-red-300 hover:bg-red-500/18'
            }`}
            title={telemetry.estopActive ? 'Reset E-STOP Lock' : 'Trigger Emergency Stop'}
          >
            {telemetry.estopActive ? (
              <Unlock className="w-3 h-3" />
            ) : (
              <ShieldAlert className="w-3 h-3" />
            )}
            <span>{telemetry.estopActive ? 'RESET E-STOP' : 'E-STOP'}</span>
          </button>

          {hasElectronWindow && (
            <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[var(--border)]">
              <button
                type="button"
                onClick={() => void window.nexusWindow?.minimize()}
                className="w-7 h-7 rounded-md hover:bg-[var(--panel-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center transition-colors"
                aria-label="Minimize window"
                title="Minimize"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleToggleMaximize()}
                className="w-7 h-7 rounded-md hover:bg-[var(--panel-elevated)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center transition-colors"
                aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => void window.nexusWindow?.close()}
                className="w-7 h-7 rounded-md hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-300 flex items-center justify-center transition-colors"
                aria-label="Close window"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body: Slim Collapsible Icon Rail + Spacious 12-Col Obsidian Canvas */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Collapsible Left Icon Rail (w-16 collapsed, w-56 expanded) */}
        <aside
          aria-label="Primary module navigation"
          className={`${
            railExpanded ? 'w-56' : 'w-16'
          } shrink-0 border-r border-[var(--border)] bg-[#0a0d13] flex flex-col justify-between transition-[width] duration-200 ease-out z-20`}
        >
          <nav className="p-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={!railExpanded ? `${item.label} — ${item.hint}` : undefined}
                  className={`group relative w-full h-10 rounded-lg border flex items-center transition-colors ${
                    railExpanded ? 'px-3 gap-3 justify-start' : 'justify-center'
                  } ${
                    isActive
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
                      : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--panel)] text-[var(--text-secondary)] hover:text-[var(--text)]'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-emerald-400"
                    />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-[var(--text-secondary)] group-hover:text-[var(--text)]'
                    }`}
                  />
                  {railExpanded ? (
                    <div className="min-w-0 text-left">
                      <div className="text-xs font-medium truncate">{item.label}</div>
                    </div>
                  ) : (
                    <span
                      role="tooltip"
                      className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute left-full ml-3 px-2.5 py-1.5 rounded-lg obsidian-panel-elevated shadow-[0_8px_24px_rgba(0,0,0,0.65)] whitespace-nowrap z-50 text-left"
                    >
                      <span className="block text-xs font-medium text-[var(--text)]">
                        {item.label}
                      </span>
                      <span className="block text-[10px] font-mono text-[var(--text-muted)]">
                        {item.hint}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Rail Footer: Gateway Pulse + Collapse Toggle */}
          <div className="p-2 border-t border-[var(--border-subtle)] space-y-1">
            {railExpanded && (
              <div className="px-2.5 py-1.5 rounded-lg bg-[var(--panel-muted)] border border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  {isOnline ? 'IPC ONLINE' : 'IPC OFFLINE'}
                </span>
                <span>{telemetry.pingMs > 0 ? `${telemetry.pingMs}ms` : '—'}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setRailExpanded((prev) => !prev)}
              className={`w-full h-9 rounded-lg border border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--panel)] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center transition-colors ${
                railExpanded ? 'px-3 justify-between' : 'justify-center'
              }`}
              title={railExpanded ? 'Collapse navigation rail' : 'Expand navigation rail'}
              aria-label={railExpanded ? 'Collapse navigation rail' : 'Expand navigation rail'}
            >
              {railExpanded && (
                <span className="text-[11px] font-mono uppercase tracking-wider">Collapse</span>
              )}
              {railExpanded ? (
                <PanelLeftClose className="w-4 h-4 shrink-0" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 shrink-0" />
              )}
            </button>
          </div>
        </aside>

        {/* Spacious 12-Col Obsidian Canvas */}
        <main className="flex-1 min-w-0 min-h-0 obsidian-grid-bg overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 w-full max-w-[1440px] mx-auto p-6 grid grid-cols-12">
            <div className="col-span-12 h-full min-h-0 [&>*]:!p-1">
              <ViewErrorBoundary activeTab={activeTab} onResetToCore={() => setActiveTab('core')}>
                <Suspense fallback={<ViewSuspenseFallback activeTab={activeTab} />}>
                  {renderActiveView()}
                </Suspense>
              </ViewErrorBoundary>
            </div>
          </div>
        </main>
      </div>

      {/* Global Overlays */}
      <CommandPalette />
      <CircuitDrawer />

      {/* Sovereign Toast Banner */}
      {toast && toastStyles && ToastIcon && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-[60] max-w-sm w-[calc(100%-2.5rem)] obsidian-panel-elevated rounded-xl p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.7)] border ${toastStyles.border} flex items-start gap-3 animate-obsidian-fade`}
        >
          <ToastIcon className={`w-4 h-4 mt-0.5 shrink-0 ${toastStyles.accent}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--text)]">{toast.title}</div>
            {toast.message && (
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)] break-words">
                {toast.message}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismissToast}
            className="p-1 rounded hover:bg-[var(--panel-muted)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
