import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  BookOpen,
  Code2,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  MessageSquare,
  OctagonAlert,
  PanelRight,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Sliders,
  Target,
  Terminal,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { NavTabId, WorkspaceMode } from '../types';

interface PaletteAction {
  id: string;
  group: 'Modules' | 'Workspace Mode' | 'System & Shield' | 'Core Dispatch';
  title: string;
  subtitle: string;
  keywords: string;
  shortcut?: string;
  badge?: string;
  tone?: 'default' | 'mint' | 'amber' | 'danger';
  icon: ComponentType<{ className?: string }>;
  run: () => Promise<void> | void;
}

const MODULE_ITEMS: Array<{
  id: NavTabId;
  title: string;
  subtitle: string;
  shortcut: string;
  keywords: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    id: 'core',
    title: 'Cockpit',
    subtitle: 'Telemetry overview, core command bar, and live task queue',
    shortcut: 'Alt+1',
    keywords: 'core cockpit dashboard telemetry home tasks away market',
    icon: Activity,
  },
  {
    id: 'chat',
    title: 'Chat',
    subtitle: 'Multi-provider LLM reasoning & whisper dictation workspace',
    shortcut: 'Alt+2',
    keywords: 'chat ai llm model conversation prompt whisper voice',
    icon: MessageSquare,
  },
  {
    id: 'studio',
    title: 'Studio',
    subtitle: 'NexKoder workspace file explorer, editor, and terminal runner',
    shortcut: 'Alt+3',
    keywords: 'studio nexkoder code ide editor files explorer',
    icon: Code2,
  },
  {
    id: 'scholar',
    title: 'Scholar',
    subtitle: 'Semantic FTS5 memory, ArXiv search, synthesis, and notes',
    shortcut: 'Alt+4',
    keywords: 'scholar memory fts5 arxiv research papers synthesis notes',
    icon: BookOpen,
  },
  {
    id: 'autopilot',
    title: 'Autopilot',
    subtitle: 'Voice routines, macro replay, keep-awake, purge, and expenses',
    shortcut: 'Alt+5',
    keywords: 'autopilot routines macros voice keep awake purge expenses',
    icon: Cpu,
  },
  {
    id: 'interview',
    title: 'Interview',
    subtitle: 'Coding, system design, and behavioral stealth copilot',
    shortcut: 'Alt+6',
    keywords: 'interview coding system design behavioral vision stealth',
    icon: Target,
  },
  {
    id: 'world',
    title: 'World',
    subtitle: 'Scout multi-channel web reader, ingests, and Obscura DOM inspector',
    shortcut: 'Alt+7',
    keywords: 'world scout web search read ingest browser obscura',
    icon: Globe,
  },
  {
    id: 'vault',
    title: 'Vault',
    subtitle: 'DPAPI secrets, AgentShield audit, focus timers, market, and whiteboard',
    shortcut: 'Alt+8',
    keywords: 'vault dpapi security shield timers stock whiteboard canvas',
    icon: Shield,
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'BYOK providers, compute nodes, themes, QR pairing, and skills',
    shortcut: 'Alt+9',
    keywords: 'settings providers keys huggingface gpu wal themes remote skills',
    icon: Sliders,
  },
];

const WORKSPACE_MODES: Array<{
  mode: WorkspaceMode;
  subtitle: string;
  keywords: string;
}> = [
  {
    mode: 'DEV',
    subtitle: 'Full local-to-edge routing and developer instrumentation',
    keywords: 'mode workspace dev development engineering standard',
  },
  {
    mode: 'STUDY',
    subtitle: 'Research-oriented memory indexing and calm focus profile',
    keywords: 'mode workspace study research scholar focus',
  },
  {
    mode: 'STUDIO',
    subtitle: 'Creative workspace tuning for media and synthesis workflows',
    keywords: 'mode workspace studio creative media generation',
  },
  {
    mode: 'SILENT',
    subtitle: 'Air-gapped offline posture blocking outbound external HTTP',
    keywords: 'mode workspace silent airgap offline private lock',
  },
];

export function CommandPalette() {
  const commandPaletteOpen = useNexusStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useNexusStore((s) => s.setCommandPaletteOpen);
  const activeTab = useNexusStore((s) => s.activeTab);
  const setActiveTab = useNexusStore((s) => s.setActiveTab);
  const telemetry = useNexusStore((s) => s.telemetry);
  const drawerOpen = useNexusStore((s) => s.drawerOpen);
  const setDrawerOpen = useNexusStore((s) => s.setDrawerOpen);
  const switchWorkspaceMode = useNexusStore((s) => s.switchWorkspaceMode);
  const toggleEstop = useNexusStore((s) => s.toggleEstop);
  const dispatchCommand = useNexusStore((s) => s.dispatchCommand);
  const pushToast = useNexusStore((s) => s.pushToast);
  const refreshAll = useNexusStore((s) => s.refreshAll);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const closePalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setExecutingId(null);
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [commandPaletteOpen]);

  const baseActions = useMemo<PaletteAction[]>(() => {
    const moduleActions: PaletteAction[] = MODULE_ITEMS.map((item) => ({
      id: `nav-${item.id}`,
      group: 'Modules',
      title: item.title,
      subtitle: item.subtitle,
      keywords: `${item.id} ${item.keywords}`,
      shortcut: item.shortcut,
      badge: activeTab === item.id ? 'ACTIVE' : undefined,
      tone: activeTab === item.id ? 'mint' : 'default',
      icon: item.icon,
      run: () => {
        setActiveTab(item.id);
        closePalette();
      },
    }));

    const modeActions: PaletteAction[] = WORKSPACE_MODES.map((entry) => ({
      id: `mode-${entry.mode.toLowerCase()}`,
      group: 'Workspace Mode',
      title: `Switch Mode: ${entry.mode}`,
      subtitle: entry.subtitle,
      keywords: entry.keywords,
      badge: telemetry.workspaceMode === entry.mode ? 'CURRENT' : undefined,
      tone:
        entry.mode === 'SILENT'
          ? 'amber'
          : telemetry.workspaceMode === entry.mode
          ? 'mint'
          : 'default',
      icon: Layers,
      run: async () => {
        await switchWorkspaceMode(entry.mode);
        closePalette();
      },
    }));

    const systemActions: PaletteAction[] = [
      {
        id: 'sys-estop',
        group: 'System & Shield',
        title: telemetry.estopActive ? 'Reset Emergency Stop (E-STOP)' : 'Trigger Emergency Stop (E-STOP)',
        subtitle: telemetry.estopActive
          ? 'Clear lock and restore autonomous agent execution'
          : 'Immediately halt child agents and external tool invocations',
        keywords: 'estop emergency stop halt reset lock unlock safety',
        badge: telemetry.estopActive ? 'ENGAGED' : 'READY',
        tone: telemetry.estopActive ? 'amber' : 'danger',
        icon: OctagonAlert,
        run: async () => {
          await toggleEstop(
            telemetry.estopActive ? undefined : 'Command Palette Emergency Stop'
          );
          closePalette();
        },
      },
      {
        id: 'sys-drawer',
        group: 'System & Shield',
        title: drawerOpen ? 'Close Circuit Inspector Drawer' : 'Open Circuit Inspector Drawer',
        subtitle: 'Slide-over Workspace Shield, FTS5 memory lookup, tasks, logs & skills',
        keywords: 'drawer inspector circuit shield memory logs tasks skills',
        badge: drawerOpen ? 'OPEN' : 'CLOSED',
        tone: drawerOpen ? 'mint' : 'default',
        icon: PanelRight,
        run: () => {
          setDrawerOpen(!drawerOpen);
          closePalette();
        },
      },
      {
        id: 'sys-audit',
        group: 'System & Shield',
        title: 'Run ScopeGuard + AgentShield Security Audit',
        subtitle: 'Execute POST /api/audit/run and refresh posture score',
        keywords: 'security audit shield scopeguard scan run verify',
        tone: 'mint',
        icon: ShieldCheck,
        run: async () => {
          const res = await ipcJson<{
            audit_passed?: boolean;
            shield?: { score?: number; status?: string };
          }>('/api/audit/run', { method: 'POST' });
          if (res.success) {
            const scorePart =
              typeof res.shield?.score === 'number' ? ` (${res.shield.score}/100)` : '';
            pushToast(`Security audit passed${scorePart}`, 'success');
            void refreshAll();
          } else {
            pushToast(res.error || 'Security audit failed', 'error');
          }
          closePalette();
        },
      },
      {
        id: 'sys-release-gpu',
        group: 'System & Shield',
        title: 'Release Idle Cloud GPU Nodes',
        subtitle: 'Execute POST /api/system/release-gpu to reclaim compute resources',
        keywords: 'gpu release vram compute idle nodes free hardware',
        icon: HardDrive,
        run: async () => {
          const res = await ipcJson<{ count?: number; released_nodes?: string[] }>(
            '/api/system/release-gpu',
            { method: 'POST' }
          );
          if (res.success) {
            const count = res.count ?? res.released_nodes?.length ?? 0;
            pushToast(`Released ${count} idle GPU compute node(s)`, 'success');
          } else {
            pushToast(res.error || 'GPU release returned an error', 'warn');
          }
          closePalette();
        },
      },
      {
        id: 'sys-wal-checkpoint',
        group: 'System & Shield',
        title: 'Run SQLite WAL Checkpoint (Truncate)',
        subtitle: 'Execute POST /api/system/wal-checkpoint on agent_local.db',
        keywords: 'wal sqlite checkpoint truncate database maintenance storage',
        icon: Database,
        run: async () => {
          const res = await ipcJson<{ checkpoint?: number[] }>('/api/system/wal-checkpoint', {
            method: 'POST',
          });
          if (res.success) {
            pushToast('SQLite WAL checkpoint truncated cleanly', 'success');
          } else {
            pushToast(res.error || 'WAL checkpoint failed', 'error');
          }
          closePalette();
        },
      },
      {
        id: 'sys-refresh',
        group: 'System & Shield',
        title: 'Refresh Telemetry, Tasks & Logs',
        subtitle: 'Sync live IPC gateway health, workspace mode, tasks, and telemetry logs',
        keywords: 'refresh reload sync telemetry tasks logs health',
        icon: RefreshCw,
        run: async () => {
          await refreshAll();
          pushToast('Telemetry and runtime state synced', 'info');
          closePalette();
        },
      },
    ];

    return [...moduleActions, ...modeActions, ...systemActions];
  }, [
    activeTab,
    closePalette,
    drawerOpen,
    pushToast,
    refreshAll,
    setActiveTab,
    setDrawerOpen,
    switchWorkspaceMode,
    telemetry.estopActive,
    telemetry.workspaceMode,
    toggleEstop,
  ]);

  const filteredActions = useMemo<PaletteAction[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return baseActions;

    if (trimmed.startsWith('>')) {
      const cmdText = trimmed.slice(1).trim();
      if (!cmdText) return baseActions;
      return [
        {
          id: 'core-dispatch-prefix',
          group: 'Core Dispatch',
          title: `Dispatch "${cmdText}"`,
          subtitle: 'Execute command via Nexus Core IPC router (POST /api/command)',
          keywords: cmdText,
          tone: 'mint',
          icon: Terminal,
          run: async () => {
            await dispatchCommand(cmdText);
            closePalette();
          },
        },
      ];
    }

    const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const matched = baseActions.filter((action) => {
      const haystack = `${action.group} ${action.title} ${action.subtitle} ${action.keywords}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });

    const dispatchOption: PaletteAction = {
      id: 'core-dispatch-fallback',
      group: 'Core Dispatch',
      title: `Run Core Command: "${trimmed}"`,
      subtitle: 'Dispatch input directly to Nexus Core router (POST /api/command)',
      keywords: trimmed,
      tone: 'default',
      icon: Terminal,
      run: async () => {
        await dispatchCommand(trimmed);
        closePalette();
      },
    };

    return [...matched, dispatchOption];
  }, [baseActions, closePalette, dispatchCommand, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (selectedIndex >= filteredActions.length && filteredActions.length > 0) {
      setSelectedIndex(filteredActions.length - 1);
    }
  }, [filteredActions.length, selectedIndex]);

  useEffect(() => {
    const activeButton = itemRefs.current[selectedIndex];
    if (activeButton) {
      activeButton.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredActions]);

  const executeAction = useCallback(
    async (action: PaletteAction | undefined) => {
      if (!action || executingId) return;
      setExecutingId(action.id);
      try {
        await action.run();
      } finally {
        setExecutingId(null);
      }
    },
    [executingId]
  );

  useEffect(() => {
    if (!commandPaletteOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredActions.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredActions.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        void executeAction(filteredActions[selectedIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [closePalette, commandPaletteOpen, executeAction, filteredActions, selectedIndex]);

  if (!commandPaletteOpen) {
    return null;
  }

  let runningIndex = -1;
  const groupsOrder: Array<PaletteAction['group']> = [
    'Modules',
    'Workspace Mode',
    'System & Shield',
    'Core Dispatch',
  ];

  return (
    <div
      className="electron-no-drag fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Nexus Command Palette"
    >
      <div className="monograph-elevated w-full max-w-xl overflow-hidden rounded-lg border border-white/[0.12] shadow-2xl">
        {/* Search Header */}
        <div className="monograph-hairline-b flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter modules, modes, shield actions, or prefix > to run command…"
            className="w-full bg-transparent text-[13.5px] text-zinc-100 placeholder-zinc-500 focus:outline-none"
            aria-label="Search commands"
          />
          {executingId ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" />
          ) : (
            <kbd className="monograph-kbd shrink-0">Esc</kbd>
          )}
        </div>

        {/* Grouped Command List */}
        <div className="max-h-[380px] overflow-y-auto py-2">
          {filteredActions.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              No matching commands found.
            </div>
          ) : (
            groupsOrder.map((groupName) => {
              const groupItems = filteredActions.filter((item) => item.group === groupName);
              if (groupItems.length === 0) return null;

              return (
                <div key={groupName} className="mb-1.5 last:mb-0">
                  <div className="px-4 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    {groupName}
                  </div>
                  <div className="space-y-0.5 px-2">
                    {groupItems.map((action) => {
                      runningIndex += 1;
                      const currentIdx = runningIndex;
                      const isSelected = currentIdx === selectedIndex;
                      const isBusy = executingId === action.id;
                      const Icon = action.icon;

                      const iconColor =
                        action.tone === 'mint'
                          ? 'text-emerald-400'
                          : action.tone === 'amber'
                          ? 'text-amber-400'
                          : action.tone === 'danger'
                          ? 'text-red-400'
                          : isSelected
                          ? 'text-zinc-100'
                          : 'text-zinc-400';

                      return (
                        <button
                          key={action.id}
                          ref={(el) => {
                            itemRefs.current[currentIdx] = el;
                          }}
                          type="button"
                          disabled={Boolean(executingId)}
                          onMouseEnter={() => setSelectedIndex(currentIdx)}
                          onClick={() => void executeAction(action)}
                          className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition ${
                            isSelected
                              ? 'bg-white/[0.07] text-zinc-100'
                              : 'text-zinc-300 hover:bg-white/[0.04]'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-medium text-zinc-100">
                                {action.title}
                              </div>
                              <div className="truncate text-[11.5px] text-zinc-500">
                                {action.subtitle}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {isBusy && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                            )}
                            {action.badge && (
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider ${
                                  action.tone === 'mint'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    : action.tone === 'amber'
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                    : action.tone === 'danger'
                                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                    : 'border-white/[0.08] bg-white/[0.03] text-zinc-400'
                                }`}
                              >
                                {action.badge}
                              </span>
                            )}
                            {action.shortcut && (
                              <kbd className="monograph-kbd tabular-nums">{action.shortcut}</kbd>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Minimal Footer Hints */}
        <div className="monograph-hairline-t flex items-center justify-between bg-[#090a0c]/70 px-4 py-2 text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <kbd className="monograph-kbd">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="monograph-kbd">↵</kbd>
              <span>Execute</span>
            </span>
          </div>
          <span className="font-mono text-[10.5px] text-zinc-500 tabular-nums">
            Mode: {telemetry.workspaceMode}
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
