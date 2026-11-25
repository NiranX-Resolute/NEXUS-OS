import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Code2,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Lock,
  MessageSquare,
  OctagonAlert,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { NavTabId, WorkspaceMode } from '../types';

type PaletteCategory = 'Navigation' | 'Workspace Mode' | 'System Operations';

interface PaletteAction {
  id: string;
  category: PaletteCategory;
  label: string;
  description: string;
  keywords: string;
  badge?: string;
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose';
  icon: typeof Activity;
  run: () => Promise<void> | void;
}

interface SystemActionResponse {
  success?: boolean;
  message?: string;
  released?: number;
  checkpoint?: number[];
  audit_passed?: boolean;
  shield?: {
    score?: number;
    status?: string;
    findings_count?: number;
  };
  error?: string;
}

const NAV_ITEMS: Array<{
  id: NavTabId;
  label: string;
  description: string;
  keywords: string;
  icon: typeof Activity;
}> = [
  {
    id: 'core',
    label: 'Cockpit Core',
    description: 'Holo-Core reactor, KPI telemetry & task dispatch',
    keywords: 'home overview dashboard reactor telemetry core',
    icon: Cpu,
  },
  {
    id: 'chat',
    label: 'Neural Chat',
    description: 'Sovereign LLM chat, persona matrix & voice dictation',
    keywords: 'ai chat llm prompt voice haru persona',
    icon: MessageSquare,
  },
  {
    id: 'studio',
    label: 'Code Studio',
    description: 'Git workspace, AST analyzer & Context Keeper',
    keywords: 'code git diff editor studio ast',
    icon: Code2,
  },
  {
    id: 'scholar',
    label: 'Scholar & Memory',
    description: 'FTS5 memory search, ArXiv papers & sovereign notes',
    keywords: 'memory fts5 papers arxiv research notes scholar',
    icon: BookOpen,
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    description: 'Voice routines, input macros, keep-awake & expenses',
    keywords: 'routines macros automation keep awake purge autopilot',
    icon: Zap,
  },
  {
    id: 'interview',
    label: 'Interview Copilot',
    description: 'Stealth coding, system design & behavioral copilot',
    keywords: 'interview coding system design behavioral stealth',
    icon: BrainCircuit,
  },
  {
    id: 'world',
    label: 'World & Obscura',
    description: 'Scout search, web reader & browser DOM inspector',
    keywords: 'web scout search ingest browser obscura world',
    icon: Globe,
  },
  {
    id: 'vault',
    label: 'Vault & Shield',
    description: 'DPAPI encrypted secrets, AgentShield, canvas & timers',
    keywords: 'vault dpapi security shield whiteboard timers market',
    icon: Lock,
  },
  {
    id: 'settings',
    label: 'System Settings',
    description: 'Providers, compute hardware, themes, wallpapers & skills',
    keywords: 'providers keys compute themes wallpapers remote skills settings',
    icon: Settings,
  },
];

const WORKSPACE_MODES: Array<{
  mode: WorkspaceMode;
  label: string;
  description: string;
  tone: 'cyan' | 'amber' | 'emerald';
}> = [
  {
    mode: 'DEV',
    label: 'Switch Mode: DEV',
    description: 'Engineering & AST active workspace profile',
    tone: 'cyan',
  },
  {
    mode: 'STUDY',
    label: 'Switch Mode: STUDY',
    description: 'Academic research & FTS5 scholar focus profile',
    tone: 'amber',
  },
  {
    mode: 'STUDIO',
    label: 'Switch Mode: STUDIO',
    description: 'Creative audio, vision & media pipeline profile',
    tone: 'emerald',
  },
  {
    mode: 'SILENT',
    label: 'Switch Mode: SILENT',
    description: 'Air-gapped sovereign execution (external network blocked)',
    tone: 'amber',
  },
];

function toneBadgeClass(tone: PaletteAction['tone']): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-400/35 bg-emerald-500/15 text-emerald-300';
    case 'amber':
      return 'border-amber-400/35 bg-amber-500/15 text-amber-300';
    case 'rose':
      return 'border-rose-400/40 bg-rose-500/15 text-rose-300';
    default:
      return 'border-cyan-400/35 bg-cyan-500/15 text-cyan-300';
  }
}

export function CommandPalette() {
  const open = useNexusStore((s) => s.commandPaletteOpen);
  const setOpen = useNexusStore((s) => s.setCommandPaletteOpen);
  const activeTab = useNexusStore((s) => s.activeTab);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const telemetry = useNexusStore((s) => s.telemetry);
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const toggleEstop = useNexusStore((s) => s.toggleEstop);
  const refreshAll = useNexusStore((s) => s.refreshAll);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open]);

  const runSystemAction = useCallback(
    async (
      endpoint: string,
      pendingLabel: string,
      formatSuccess: (res: SystemActionResponse) => string
    ) => {
      try {
        const res = await ipcJson<SystemActionResponse>(endpoint, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (res.success === false) {
          pushToast(res.error || `${pendingLabel} failed`, 'error');
          return;
        }
        pushToast(formatSuccess(res), 'success');
        void refreshAll();
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : `${pendingLabel} endpoint unreachable`,
          'error'
        );
      }
    },
    [pushToast, refreshAll]
  );

  const actions = useMemo<PaletteAction[]>(() => {
    const navActions: PaletteAction[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.id}`,
      category: 'Navigation',
      label: item.label,
      description: item.description,
      keywords: `${item.id} ${item.keywords}`,
      badge: activeTab === item.id ? 'ACTIVE' : item.id.toUpperCase(),
      tone: activeTab === item.id ? 'emerald' : 'cyan',
      icon: item.icon,
      run: () => {
        setActiveTab(item.id);
      },
    }));

    const modeActions: PaletteAction[] = WORKSPACE_MODES.map((entry) => ({
      id: `mode:${entry.mode}`,
      category: 'Workspace Mode',
      label: entry.label,
      description: entry.description,
      keywords: `mode workspace ${entry.mode.toLowerCase()}`,
      badge: telemetry.workspaceMode === entry.mode ? 'CURRENT' : entry.mode,
      tone: telemetry.workspaceMode === entry.mode ? 'emerald' : entry.tone,
      icon: Activity,
      run: async () => {
        await switchWorkspaceMode(entry.mode);
      },
    }));

    const systemActions: PaletteAction[] = [
      {
        id: 'sys:drawer',
        category: 'System Operations',
        label: drawerOpen ? 'Close Circuit Inspector Drawer' : 'Open Circuit Inspector Drawer',
        description: 'Inspect live telemetry logs, task queue, FTS5 memory, skills & shield',
        keywords: 'drawer telemetry logs tasks memory skills shield inspector circuit',
        badge: drawerOpen ? 'OPEN' : 'CLOSED',
        tone: drawerOpen ? 'emerald' : 'cyan',
        icon: PanelRight,
        run: () => {
          setDrawerOpen(!drawerOpen);
        },
      },
      {
        id: 'sys:estop',
        category: 'System Operations',
        label: telemetry.estopActive
          ? 'Reset Emergency Stop (Restore Nominal)'
          : 'Trigger Emergency Stop (Halt Execution)',
        description: telemetry.estopActive
          ? 'Clear SafetyGuard E-Stop lock and restore nominal execution'
          : 'Immediately halt autonomous execution and assert SafetyGuard E-Stop',
        keywords: 'estop emergency stop halt lock reset safetyguard',
        badge: telemetry.estopActive ? 'LOCKED' : 'ARMED',
        tone: telemetry.estopActive ? 'emerald' : 'rose',
        icon: OctagonAlert,
        run: async () => {
          await toggleEstop('Command Palette Operator E-Stop');
        },
      },
      {
        id: 'sys:release-gpu',
        category: 'System Operations',
        label: 'Release Idle GPU Compute Nodes',
        description: 'POST /api/system/release-gpu — reclaim idle cloud or local compute slots',
        keywords: 'gpu release vram compute pool free',
        badge: 'GPU',
        tone: 'cyan',
        icon: HardDrive,
        run: () =>
          runSystemAction('/api/system/release-gpu', 'Release GPU', (res) => {
            if (res.message) return res.message;
            if (typeof res.released === 'number') {
              return `Released ${res.released} idle GPU compute node(s)`;
            }
            return 'Idle GPU compute nodes released';
          }),
      },
      {
        id: 'sys:wal-checkpoint',
        category: 'System Operations',
        label: 'SQLite WAL Checkpoint',
        description: 'POST /api/system/wal-checkpoint — flush & truncate agent_local.db WAL',
        keywords: 'wal sqlite database checkpoint truncate flush',
        badge: 'WAL',
        tone: 'cyan',
        icon: Database,
        run: () =>
          runSystemAction('/api/system/wal-checkpoint', 'WAL Checkpoint', (res) => {
            const frames = Array.isArray(res.checkpoint) ? res.checkpoint.join('/') : 'OK';
            return `SQLite WAL checkpoint complete (${frames})`;
          }),
      },
      {
        id: 'sys:audit-run',
        category: 'System Operations',
        label: 'Run Security & AgentShield Audit',
        description: 'POST /api/audit/run — execute ScopeGuard & AgentShield verification scan',
        keywords: 'security audit shield scopeguard scan verify',
        badge: 'SHIELD',
        tone: 'emerald',
        icon: ShieldCheck,
        run: () =>
          runSystemAction('/api/audit/run', 'Security Audit', (res) => {
            const score = res.shield?.score;
            const status = res.shield?.status || (res.audit_passed ? 'PASS' : 'COMPLETE');
            return typeof score === 'number'
              ? `AgentShield audit ${status} (Score ${score}/100)`
              : `AgentShield audit ${status}`;
          }),
      },
      {
        id: 'sys:refresh-telemetry',
        category: 'System Operations',
        label: 'Refresh Telemetry & Task State',
        description: 'Sync gateway status, hardware metrics, active tasks & telemetry logs',
        keywords: 'refresh sync telemetry status hardware tasks logs',
        badge: 'SYNC',
        tone: 'cyan',
        icon: RefreshCw,
        run: async () => {
          await refreshAll();
          pushToast('Telemetry snapshot refreshed', 'info');
        },
      },
    ];

    return [...navActions, ...modeActions, ...systemActions];
  }, [
    activeTab,
    drawerOpen,
    pushToast,
    refreshAll,
    runSystemAction,
    setActiveTab,
    setDrawerOpen,
    switchWorkspaceMode,
    telemetry.estopActive,
    telemetry.workspaceMode,
    toggleEstop,
  ]);

  const filteredActions = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return actions;
    return actions.filter((action) => {
      const haystack = `${action.category} ${action.label} ${action.description} ${action.keywords}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= filteredActions.length && filteredActions.length > 0) {
      setSelectedIndex(filteredActions.length - 1);
    }
  }, [filteredActions.length, selectedIndex]);

  useEffect(() => {
    const target = itemRefs.current[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeAction = useCallback(
    (action: PaletteAction) => {
      if (busyActionId) return;
      setBusyActionId(action.id);
      setOpen(false);
      Promise.resolve(action.run()).finally(() => {
        setBusyActionId(null);
      });
    },
    [busyActionId, setOpen]
  );

  useEffect(() => {
    if (!open) return;
    const handleGlobalEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalEsc, true);
    return () => window.removeEventListener('keydown', handleGlobalEsc, true);
  }, [open, setOpen]);

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredActions.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredActions.length === 0) return;
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      if (filteredActions.length > 0) {
        setSelectedIndex(filteredActions.length - 1);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredActions[selectedIndex];
      if (target) {
        executeAction(target);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[#030710]/80 backdrop-blur-md pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nexus Command Palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl aether-glass rounded-2xl overflow-hidden border border-cyan-400/35 shadow-[0_24px_80px_rgba(2,6,16,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight Search Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-cyan-500/20 bg-[#050a14]/75">
          <Search className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Jump to module, switch mode, or run cockpit action..."
            aria-label="Search commands"
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="shrink-0 rounded-md border border-slate-700/80 bg-[#091322] px-2 py-0.5 text-[10px] font-mono text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Filtered Command List */}
        <div className="max-h-[420px] overflow-y-auto p-2.5 space-y-1">
          {filteredActions.length === 0 ? (
            <div className="py-10 text-center space-y-1.5">
              <p className="text-sm font-medium text-slate-300">No matching commands</p>
              <p className="text-xs text-slate-500">
                Try module names (core, scholar, vault), workspace modes, or system actions.
              </p>
            </div>
          ) : (
            filteredActions.map((action, index) => {
              const Icon = action.icon;
              const isSelected = index === selectedIndex;
              const prevCategory = index > 0 ? filteredActions[index - 1].category : null;
              const showGroupHeader = action.category !== prevCategory;

              return (
                <div key={action.id}>
                  {showGroupHeader && (
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-400/75">
                      {action.category}
                    </div>
                  )}
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => executeAction(action)}
                    className={`w-full text-left rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 border transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400/45 text-slate-100 shadow-[0_0_16px_rgba(6,182,212,0.12)]'
                        : 'bg-transparent border-transparent text-slate-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                          isSelected
                            ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-300'
                            : 'border-slate-800 bg-[#050a14]/80 text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-100 truncate">
                          {action.label}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {action.description}
                        </div>
                      </div>
                    </div>

                    {action.badge && (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${toneBadgeClass(
                          action.tone
                        )}`}
                      >
                        {action.badge}
                      </span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-5 py-2.5 border-t border-cyan-500/15 bg-[#050a14]/85 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-4">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
            <span>Esc Close</span>
          </div>
          <span className="text-cyan-400/80">
            {filteredActions.length} command{filteredActions.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
