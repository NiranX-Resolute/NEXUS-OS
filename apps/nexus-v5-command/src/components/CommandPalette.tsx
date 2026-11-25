import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Bot,
  Briefcase,
  Code2,
  Command,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Lock,
  MessageSquare,
  PanelRightOpen,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { NavTabId, WorkspaceMode } from '@/types';

interface PaletteAction {
  id: string;
  title: string;
  subtitle: string;
  group: 'Modules' | 'Workspace Mode' | 'System & Security';
  keywords: string;
  shortcut?: string;
  badge?: string;
  tone?: 'emerald' | 'cyan' | 'amber' | 'danger';
  icon: React.ComponentType<{ className?: string }>;
  execute: () => void | Promise<void>;
}

interface SystemActionResponse {
  success?: boolean;
  released_nodes?: string[];
  count?: number;
  checkpoint?: number[];
  audit_passed?: boolean;
  shield?: {
    score?: number;
    status?: string;
  };
  error?: string;
}

const MODULE_META: Array<{
  id: NavTabId;
  title: string;
  subtitle: string;
  keywords: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'core',
    title: 'Core Matrix Cockpit',
    subtitle: 'Neural core reactor, KPI telemetry, dispatch & live streams',
    keywords: 'core cockpit home reactor dashboard telemetry',
    shortcut: '01',
    icon: Cpu,
  },
  {
    id: 'chat',
    title: 'Neural Chat',
    subtitle: 'Multi-model AI dialogue, personas & Haru voice dictation',
    keywords: 'chat ai prompt voice haru model llm',
    shortcut: '02',
    icon: MessageSquare,
  },
  {
    id: 'studio',
    title: 'NexKoder IDE',
    subtitle: 'Workspace explorer, code editor, git, verify & AgentShield scan',
    keywords: 'studio ide code editor git verify shield slice',
    shortcut: '03',
    icon: Code2,
  },
  {
    id: 'scholar',
    title: 'Scholar & Memory',
    subtitle: 'SQLite FTS5 memory graph, ArXiv synthesis & sovereign notes',
    keywords: 'scholar memory fts5 arxiv research notes',
    shortcut: '04',
    icon: BookOpen,
  },
  {
    id: 'autopilot',
    title: 'Autopilot Mesh',
    subtitle: 'Autonomous routines, drag shelf & system media controls',
    keywords: 'autopilot routines cron macros shelf media',
    shortcut: '05',
    icon: Bot,
  },
  {
    id: 'interview',
    title: 'Live Interview',
    subtitle: 'Stealth interview copilot, resume matcher & live audio feed',
    keywords: 'interview stealth resume audio copilot',
    shortcut: '06',
    icon: Briefcase,
  },
  {
    id: 'world',
    title: 'World & Browser',
    subtitle: 'OS bridge, maps, headless web navigation & sandbox execution',
    keywords: 'world browser os map sandbox automation',
    shortcut: '07',
    icon: Globe,
  },
  {
    id: 'vault',
    title: 'Sovereign Vault',
    subtitle: 'DPAPI secrets, AgentShield audit, whiteboard & sprint timers',
    keywords: 'vault dpapi secrets security audit whiteboard timers',
    shortcut: '08',
    icon: Lock,
  },
  {
    id: 'settings',
    title: 'Matrix Settings',
    subtitle: 'Providers, GPU/WAL compute, themes, skills & remote QR pairing',
    keywords: 'settings providers keys gpu wal themes skills remote qr',
    shortcut: '09',
    icon: Settings,
  },
];

const MODE_META: Array<{ mode: WorkspaceMode; description: string }> = [
  { mode: 'DEV', description: 'Full tool execution, local build verify & NexKoder access' },
  { mode: 'STUDY', description: 'Scholar focus, FTS5 indexing & calm research pacing' },
  { mode: 'STUDIO', description: 'Media, voice pipeline & creative synthesis priority' },
  { mode: 'SILENT', description: 'Air-gapped privacy mode — blocks outbound cloud sync' },
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
  const pushToast = useNexusStore((s) => s.pushToast);
  const refreshAll = useNexusStore((s) => s.refreshAll);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const runGpuRelease = useCallback(async () => {
    const res = await ipcJson<SystemActionResponse>('/api/system/release-gpu', {
      method: 'POST',
      body: JSON.stringify({ reason: 'command_palette' }),
    });
    if (res.success) {
      const releasedCount = res.count ?? res.released_nodes?.length ?? 0;
      pushToast(`GPU / idle compute released (${releasedCount} node(s))`, 'success');
      void refreshAll();
    } else {
      pushToast(res.error || 'Failed to release GPU compute nodes', 'error');
    }
  }, [pushToast, refreshAll]);

  const runWalCheckpoint = useCallback(async () => {
    const res = await ipcJson<SystemActionResponse>('/api/system/wal-checkpoint', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (res.success) {
      const stats = Array.isArray(res.checkpoint) ? res.checkpoint.join('/') : 'TRUNCATE';
      pushToast(`SQLite WAL checkpoint complete (${stats})`, 'success');
      void refreshAll();
    } else {
      pushToast(res.error || 'SQLite WAL checkpoint failed', 'error');
    }
  }, [pushToast, refreshAll]);

  const runSecurityAudit = useCallback(async () => {
    const res = await ipcJson<SystemActionResponse>('/api/audit/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (res.success) {
      const score = res.shield?.score ?? 100;
      const status = res.shield?.status ?? 'NOMINAL';
      pushToast(`Security Audit ${status} — Score ${score}/100`, 'success');
      void refreshAll();
    } else {
      pushToast(res.error || 'Security audit failed', 'error');
    }
  }, [pushToast, refreshAll]);

  const actions = useMemo<PaletteAction[]>(() => {
    const navActions: PaletteAction[] = MODULE_META.map((mod) => ({
      id: `nav-${mod.id}`,
      title: mod.title,
      subtitle: mod.subtitle,
      group: 'Modules',
      keywords: `${mod.id} ${mod.title} ${mod.keywords} ${mod.shortcut}`,
      shortcut: mod.shortcut,
      badge: activeTab === mod.id ? 'ACTIVE' : undefined,
      tone: activeTab === mod.id ? 'emerald' : 'cyan',
      icon: mod.icon,
      execute: () => {
        setActiveTab(mod.id);
      },
    }));

    const modeActions: PaletteAction[] = MODE_META.map(({ mode, description }) => ({
      id: `mode-${mode}`,
      title: `Switch Workspace Mode → ${mode}`,
      subtitle: description,
      group: 'Workspace Mode',
      keywords: `mode workspace switch ${mode.toLowerCase()} ${description.toLowerCase()}`,
      badge: telemetry.workspaceMode === mode ? 'CURRENT' : undefined,
      tone: mode === 'SILENT' ? 'amber' : 'emerald',
      icon: Sparkles,
      execute: async () => {
        await switchWorkspaceMode(mode);
      },
    }));

    const systemActions: PaletteAction[] = [
      {
        id: 'sys-estop',
        title: telemetry.estopActive
          ? 'Reset E-STOP (Restore Nominal Execution)'
          : 'Engage E-STOP (Halt Autonomous Execution)',
        subtitle: telemetry.estopActive
          ? 'Clear safety interlock and return security state to NOMINAL'
          : 'Immediately lock execution and release idle cloud compute',
        group: 'System & Security',
        keywords: 'estop emergency stop halt lock reset unlock safety',
        badge: telemetry.estopActive ? 'LOCKED' : 'ARMED',
        tone: telemetry.estopActive ? 'emerald' : 'danger',
        icon: telemetry.estopActive ? Unlock : ShieldAlert,
        execute: async () => {
          await toggleEstop();
        },
      },
      {
        id: 'sys-drawer',
        title: drawerOpen ? 'Close Circuit Inspector Drawer' : 'Open Circuit Inspector Drawer',
        subtitle: 'Slide-over Shield, Memory FTS5, Task Queue, Telemetry Logs & Skills',
        group: 'System & Security',
        keywords: 'drawer circuit inspector telemetry shield logs memory skills',
        badge: drawerOpen ? 'OPEN' : 'CLOSED',
        tone: 'cyan',
        icon: PanelRightOpen,
        execute: () => {
          setDrawerOpen(!drawerOpen);
        },
      },
      {
        id: 'sys-audit',
        title: 'Run Security Audit (ScopeGuard + AgentShield)',
        subtitle: 'POST /api/audit/run — scan workspace invariants and plugin posture',
        group: 'System & Security',
        keywords: 'security audit agentshield scopeguard scan verify',
        tone: 'emerald',
        icon: ShieldCheck,
        execute: runSecurityAudit,
      },
      {
        id: 'sys-gpu',
        title: 'Release GPU & Idle Compute Nodes',
        subtitle: 'POST /api/system/release-gpu — reclaim VRAM and idle node leases',
        group: 'System & Security',
        keywords: 'gpu vram release compute memory reclaim cuda',
        tone: 'cyan',
        icon: HardDrive,
        execute: runGpuRelease,
      },
      {
        id: 'sys-wal',
        title: 'Run SQLite WAL Checkpoint',
        subtitle: 'POST /api/system/wal-checkpoint — flush WAL journal into main DB',
        group: 'System & Security',
        keywords: 'sqlite wal checkpoint flush database truncate',
        tone: 'emerald',
        icon: Database,
        execute: runWalCheckpoint,
      },
      {
        id: 'sys-refresh',
        title: 'Refresh Matrix Telemetry Snapshot',
        subtitle: 'Sync status, workspace mode, tasks, hardware & logs from IPC spine',
        group: 'System & Security',
        keywords: 'refresh sync telemetry status ping ipc',
        tone: 'cyan',
        icon: Activity,
        execute: async () => {
          await refreshAll();
          pushToast('Telemetry snapshot synchronized', 'info');
        },
      },
    ];

    return [...navActions, ...modeActions, ...systemActions];
  }, [
    activeTab,
    drawerOpen,
    pushToast,
    refreshAll,
    runGpuRelease,
    runSecurityAudit,
    runWalCheckpoint,
    setActiveTab,
    setDrawerOpen,
    switchWorkspaceMode,
    telemetry.estopActive,
    telemetry.workspaceMode,
    toggleEstop,
  ]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    const tokens = q.split(/\s+/).filter(Boolean);
    return actions.filter((item) => {
      const haystack = `${item.title} ${item.subtitle} ${item.group} ${item.keywords}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [actions, query]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }
    setQuery('');
    setSelectedIndex(0);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [commandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredActions.length === 0) return 0;
      return Math.min(prev, filteredActions.length - 1);
    });
  }, [filteredActions.length]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const activeEl = itemRefs.current[selectedIndex];
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [commandPaletteOpen, selectedIndex]);

  const executeItem = useCallback(
    (action: PaletteAction | undefined) => {
      if (!action) return;
      setCommandPaletteOpen(false);
      void action.execute();
    },
    [setCommandPaletteOpen]
  );

  useEffect(() => {
    if (!commandPaletteOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setCommandPaletteOpen(false);
        return;
      }
      if (filteredActions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredActions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % filteredActions.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setSelectedIndex(filteredActions.length - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeItem(filteredActions[selectedIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, executeItem, filteredActions, selectedIndex, setCommandPaletteOpen]);

  if (!commandPaletteOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-[#030508]/80 backdrop-blur-md animate-matrix-in"
      role="dialog"
      aria-modal="true"
      aria-label="Nexus Command Palette"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#070d14]/95 border border-emerald-500/30 shadow-[0_24px_80px_rgba(0,0,0,0.75),0_0_32px_rgba(16,185,129,0.16)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-[#05080b]/70">
          <Search className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to module, switch mode (DEV/STUDY/STUDIO/SILENT), audit, GPU, WAL..."
            aria-label="Search Nexus commands"
            className="flex-1 bg-transparent text-sm text-emerald-50 placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="p-1 rounded-md text-slate-400 hover:text-emerald-200 hover:bg-white/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-[10px] font-mono text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Filtered Action List */}
        <div className="max-h-[58vh] overflow-y-auto p-2 space-y-1">
          {filteredActions.length === 0 ? (
            <div className="py-10 px-4 text-center">
              <div className="text-xs font-mono text-slate-400">
                No matrix commands match &ldquo;{query.trim()}&rdquo;
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
                className="mt-3 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-mono hover:bg-emerald-500/20 transition-colors"
              >
                Reset filter
              </button>
            </div>
          ) : (
            filteredActions.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              const showGroupHeader =
                idx === 0 || filteredActions[idx - 1].group !== item.group;

              const badgeStyle =
                item.tone === 'danger'
                  ? 'border-red-500/40 bg-red-500/15 text-red-300'
                  : item.tone === 'amber'
                    ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                    : item.tone === 'cyan'
                      ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200'
                      : 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300';

              return (
                <React.Fragment key={item.id}>
                  {showGroupHeader && (
                    <div className="px-3 pt-2.5 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                      {item.group}
                    </div>
                  )}
                  <button
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => executeItem(item)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-emerald-500/12 border-emerald-500/35 shadow-[0_0_16px_rgba(16,185,129,0.12)]'
                        : 'bg-transparent border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                          isSelected
                            ? item.tone === 'danger'
                              ? 'border-red-500/40 bg-red-500/15 text-red-300'
                              : 'border-cyan-400/40 bg-cyan-500/12 text-cyan-200'
                            : 'border-white/10 bg-[#05080b]/80 text-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-emerald-50 truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase tracking-wider ${badgeStyle}`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {item.shortcut && (
                        <span className="px-1.5 py-0.5 rounded border border-white/10 bg-[#05080b]/80 text-[10px] font-mono text-slate-400">
                          {item.shortcut}
                        </span>
                      )}
                    </div>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-[#05080b]/85 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-emerald-300/90">
              <Command className="w-3.5 h-3.5" />
              NEXUS V5 SPOTLIGHT
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">
              Mode: <span className="text-cyan-300">{telemetry.workspaceMode}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
