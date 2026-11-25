import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Bot,
  Check,
  Code2,
  Cpu,
  Database,
  Eye,
  Globe,
  HardDrive,
  Lock,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Unlock,
  Zap,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { NavTabId, WorkspaceMode } from '@/types';

type PaletteCategory = 'Navigation' | 'Workspace Modes' | 'System & Security' | 'Gateway Command';

interface PaletteActionItem {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle: string;
  keywords: string;
  badge?: string;
  active?: boolean;
  tone?: 'default' | 'emerald' | 'amber' | 'danger';
  icon: React.ComponentType<{ className?: string }>;
  run: () => Promise<void> | void;
}

interface ReleaseGpuResponse {
  success?: boolean;
  released_nodes?: string[];
  count?: number;
  error?: string;
}

interface WalCheckpointResponse {
  success?: boolean;
  checkpoint?: number[];
  db_path?: string;
  error?: string;
}

interface AuditRunResponse {
  success?: boolean;
  audit_passed?: boolean;
  shield?: {
    score?: number;
    status?: string;
    findings_count?: number;
  };
  score?: number;
  status?: string;
  findings_count?: number;
  error?: string;
}

const NAV_ACTIONS: Array<{
  id: NavTabId;
  title: string;
  subtitle: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'core',
    title: 'Core Cockpit',
    subtitle: 'Sovereign telemetry reactor, KPI vitals & task queue',
    keywords: 'cockpit home core dashboard telemetry reactor',
    icon: Activity,
  },
  {
    id: 'chat',
    title: 'AI Companion & Voice',
    subtitle: 'Multi-provider LLM chat, Persona Matrix & Haru duplex',
    keywords: 'chat ai llm haru voice persona dictate',
    icon: Bot,
  },
  {
    id: 'studio',
    title: 'NexKoder Studio',
    subtitle: 'ScopeGuard code explorer, editor & verification runner',
    keywords: 'studio code editor nexkoder git verify terminal',
    icon: Code2,
  },
  {
    id: 'scholar',
    title: 'Scholar & FTS5 Memory',
    subtitle: 'Semantic SQLite FTS5 memory, arXiv search & synthesis',
    keywords: 'scholar memory fts5 arxiv papers notes synthesis',
    icon: BookOpen,
  },
  {
    id: 'autopilot',
    title: 'Autopilot & Macros',
    subtitle: 'Voice routines, macro recorder, keep-awake & expenses',
    keywords: 'autopilot routines macros keep-awake purge expenses',
    icon: Zap,
  },
  {
    id: 'interview',
    title: 'Interview Copilot',
    subtitle: 'Stealth coding, system design & behavioral copilot',
    keywords: 'interview stealth copilot vision coding system design',
    icon: Eye,
  },
  {
    id: 'world',
    title: 'World & Browser Recon',
    subtitle: 'Agent Reach recon, web ingests & browser engine',
    keywords: 'world recon scout reach browser dom web ingest',
    icon: Globe,
  },
  {
    id: 'vault',
    title: 'Vault, Shield & Whiteboard',
    subtitle: 'DPAPI enclave, AgentShield, market ticker, timers & canvas',
    keywords: 'vault dpapi shield security audit timers whiteboard stock',
    icon: Shield,
  },
  {
    id: 'settings',
    title: 'Settings & Compute Mesh',
    subtitle: 'BYOK providers, HF auth, GPU pool, themes & QR pairing',
    keywords: 'settings providers keys gpu themes wallpapers qr remote skills',
    icon: Settings,
  },
];

const MODE_DESCRIPTIONS: Record<WorkspaceMode, string> = {
  DEV: 'Full autonomous coding, terminal verification & provider mesh',
  STUDY: 'Focused research cadence with Scholar memory & quiet telemetry',
  STUDIO: 'Creative synthesis & multi-modal studio routing',
  SILENT: 'Air-gapped sovereign lock; blocks outbound cloud sync',
};

export function CommandPalette() {
  const {
    activeTab,
    setActiveTab,
    telemetry,
    drawerOpen,
    setDrawerOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    switchWorkspaceMode,
    toggleEstop,
    dispatchCommand,
    refreshAll,
    pushToast,
  } = useNexusStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }
    setQuery('');
    setSelectedIndex(0);
    setBusyActionId(null);
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [commandPaletteOpen]);

  const closePalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, [setCommandPaletteOpen]);

  const runReleaseGpu = useCallback(async () => {
    const res = await ipcJson<ReleaseGpuResponse>('/api/system/release-gpu', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (res.success === false) {
      pushToast({
        title: 'GPU Release Rejected',
        message: res.error ?? 'Unable to release cloud GPU nodes.',
        tone: 'error',
      });
      return;
    }
    const releasedCount = res.count ?? res.released_nodes?.length ?? 0;
    pushToast({
      title: 'Cloud GPU Nodes Released',
      message: `Released ${releasedCount} idle compute node${releasedCount === 1 ? '' : 's'}.`,
      tone: 'success',
    });
    void refreshAll();
  }, [pushToast, refreshAll]);

  const runWalCheckpoint = useCallback(async () => {
    const res = await ipcJson<WalCheckpointResponse>('/api/system/wal-checkpoint', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (res.success === false) {
      pushToast({
        title: 'WAL Checkpoint Failed',
        message: res.error ?? 'SQLite WAL truncate failed.',
        tone: 'error',
      });
      return;
    }
    const stats = Array.isArray(res.checkpoint) ? res.checkpoint.join(' / ') : 'OK';
    pushToast({
      title: 'SQLite WAL Checkpointed',
      message: `PRAGMA wal_checkpoint(TRUNCATE) completed (${stats}).`,
      tone: 'success',
    });
  }, [pushToast]);

  const runSecurityAudit = useCallback(async () => {
    const res = await ipcJson<AuditRunResponse>('/api/audit/run', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const score = res.shield?.score ?? res.score ?? 100;
    const status = res.shield?.status ?? res.status ?? 'SECURE';
    if (res.success === false) {
      pushToast({
        title: 'AgentShield Audit Alert',
        message: res.error ?? `Status ${status} (${score}/100)`,
        tone: 'warning',
      });
      return;
    }
    pushToast({
      title: 'AgentShield Audit Complete',
      message: `Posture ${status} · Score ${score}/100`,
      tone: status === 'CRITICAL_RISK' ? 'warning' : 'success',
    });
    void refreshAll();
  }, [pushToast, refreshAll]);

  const allItems = useMemo<PaletteActionItem[]>(() => {
    const navItems: PaletteActionItem[] = NAV_ACTIONS.map((nav) => ({
      id: `nav-${nav.id}`,
      category: 'Navigation',
      title: nav.title,
      subtitle: nav.subtitle,
      keywords: `${nav.id} ${nav.keywords}`,
      badge: activeTab === nav.id ? 'ACTIVE' : nav.id.toUpperCase(),
      active: activeTab === nav.id,
      tone: activeTab === nav.id ? 'emerald' : 'default',
      icon: nav.icon,
      run: () => {
        setActiveTab(nav.id);
      },
    }));

    const modeItems: PaletteActionItem[] = (['DEV', 'STUDY', 'STUDIO', 'SILENT'] as const).map(
      (mode) => {
        const isCurrent = telemetry.workspaceMode === mode;
        return {
          id: `mode-${mode}`,
          category: 'Workspace Modes',
          title: `Switch Mode: ${mode}`,
          subtitle: MODE_DESCRIPTIONS[mode],
          keywords: `mode workspace ${mode.toLowerCase()} ${mode === 'SILENT' ? 'airgap offline' : ''}`,
          badge: isCurrent ? 'CURRENT' : mode,
          active: isCurrent,
          tone: mode === 'SILENT' ? 'amber' : isCurrent ? 'emerald' : 'default',
          icon: mode === 'SILENT' ? Lock : Cpu,
          run: () => switchWorkspaceMode(mode),
        };
      }
    );

    const systemItems: PaletteActionItem[] = [
      {
        id: 'sys-estop',
        category: 'System & Security',
        title: telemetry.estopActive ? 'Reset E-STOP Lock' : 'Trigger E-STOP Emergency Lock',
        subtitle: telemetry.estopActive
          ? 'Clear ESTOP lock and restore NOMINAL execution state'
          : 'Halt active child agents, release cloud nodes & lock execution',
        keywords: 'estop emergency stop halt lock reset kill safety',
        badge: telemetry.estopActive ? 'LOCKED' : 'ARMED',
        tone: 'danger',
        icon: telemetry.estopActive ? Unlock : ShieldAlert,
        run: () => toggleEstop(!telemetry.estopActive),
      },
      {
        id: 'sys-drawer',
        category: 'System & Security',
        title: drawerOpen ? 'Close Circuit Inspector Drawer' : 'Open Circuit Inspector Drawer',
        subtitle: 'Inspect Shield posture, FTS5 memory, task queue, logs & skills',
        keywords: 'drawer circuit inspector telemetry logs shield memory skills',
        badge: drawerOpen ? 'OPEN' : 'CLOSED',
        tone: drawerOpen ? 'emerald' : 'default',
        icon: PanelRight,
        run: () => setDrawerOpen(!drawerOpen),
      },
      {
        id: 'sys-audit',
        category: 'System & Security',
        title: 'Run AgentShield Security Audit',
        subtitle: 'POST /api/audit/run — scan plugins, manifests & ScopeGuard posture',
        keywords: 'audit security scan agentshield scopeguard',
        badge: 'POST',
        tone: 'emerald',
        icon: ShieldCheck,
        run: runSecurityAudit,
      },
      {
        id: 'sys-gpu-release',
        category: 'System & Security',
        title: 'Release Cloud GPU Nodes',
        subtitle: 'POST /api/system/release-gpu — reclaim idle remote compute allocations',
        keywords: 'gpu release vram compute pool nvidia cloud',
        badge: 'POST',
        tone: 'default',
        icon: Cpu,
        run: runReleaseGpu,
      },
      {
        id: 'sys-wal-checkpoint',
        category: 'System & Security',
        title: 'Checkpoint SQLite WAL',
        subtitle: 'POST /api/system/wal-checkpoint — flush & truncate agent_local.db WAL',
        keywords: 'wal sqlite checkpoint database db truncate',
        badge: 'POST',
        tone: 'default',
        icon: Database,
        run: runWalCheckpoint,
      },
      {
        id: 'sys-refresh',
        category: 'System & Security',
        title: 'Refresh Gateway Telemetry',
        subtitle: 'Sync /api/status, /api/workspace/mode, tasks, logs & hardware metrics',
        keywords: 'refresh sync telemetry status hardware tasks logs',
        badge: 'SYNC',
        tone: 'default',
        icon: RefreshCw,
        run: () => refreshAll(),
      },
    ];

    return [...navItems, ...modeItems, ...systemItems];
  }, [
    activeTab,
    drawerOpen,
    refreshAll,
    runReleaseGpu,
    runSecurityAudit,
    runWalCheckpoint,
    setActiveTab,
    setDrawerOpen,
    switchWorkspaceMode,
    telemetry.estopActive,
    telemetry.workspaceMode,
    toggleEstop,
  ]);

  const filteredItems = useMemo<PaletteActionItem[]>(() => {
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const matched = q
      ? allItems.filter((item) => {
          const haystack =
            `${item.title} ${item.subtitle} ${item.keywords} ${item.category}`.toLowerCase();
          return q.split(/\s+/).every((part) => haystack.includes(part));
        })
      : allItems;

    if (!trimmed) {
      return matched;
    }

    const commandText = trimmed.startsWith('>') ? trimmed.slice(1).trim() : trimmed;
    if (!commandText) {
      return matched;
    }

    return [
      ...matched,
      {
        id: 'gateway-dispatch',
        category: 'Gateway Command',
        title: `Dispatch "${commandText}"`,
        subtitle: 'POST /api/command — send directly to Sovereign Reflex & Gateway Router',
        keywords: commandText,
        badge: 'EXEC',
        tone: 'emerald',
        icon: Terminal,
        run: async () => {
          const res = await dispatchCommand(commandText);
          if (res.success) {
            pushToast({
              title: res.handledBy ? `Handled by ${res.handledBy}` : 'Gateway Command Executed',
              message: res.output ? res.output.slice(0, 140) : 'Command completed.',
              tone: 'success',
            });
          }
        },
      },
    ];
  }, [allItems, dispatchCommand, pushToast, query]);

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      return Math.min(prev, filteredItems.length - 1);
    });
  }, [filteredItems]);

  useEffect(() => {
    const target = itemRefs.current[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const executeItem = useCallback(
    async (item: PaletteActionItem | undefined) => {
      if (!item || busyActionId) return;
      setBusyActionId(item.id);
      try {
        await item.run();
        closePalette();
      } catch (err) {
        pushToast({
          title: 'Palette Action Error',
          message: err instanceof Error ? err.message : 'Unable to execute command.',
          tone: 'error',
        });
      } finally {
        setBusyActionId(null);
      }
    },
    [busyActionId, closePalette, pushToast]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePalette();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length === 0) return;
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      void executeItem(filteredItems[selectedIndex]);
    }
  };

  if (!commandPaletteOpen) {
    return null;
  }

  let lastCategory: PaletteCategory | null = null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Obsidian Sovereign Command Palette"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[11vh] px-4 bg-black/70 backdrop-blur-[3px] animate-obsidian-fade"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closePalette();
        }
      }}
    >
      <div className="w-full max-w-2xl obsidian-panel-elevated rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden border border-[var(--border)]">
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)] bg-[#0a0e14]">
          <Search className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Jump to module, switch mode, audit shield, or run >command..."
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none font-sans"
          />
          <button
            type="button"
            onClick={closePalette}
            className="px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--panel)] text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-[58vh] overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-2">
              <HardDrive className="w-5 h-5 text-[var(--text-muted)] mx-auto" />
              <p className="text-xs font-mono text-[var(--text-secondary)]">
                No matching modules or sovereign commands.
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const showGroupHeader = item.category !== lastCategory;
              lastCategory = item.category;
              const isSelected = idx === selectedIndex;
              const isBusy = busyActionId === item.id;
              const Icon = item.icon;

              const badgeStyle =
                item.tone === 'danger'
                  ? 'border-red-500/40 bg-red-500/12 text-red-300'
                  : item.tone === 'amber'
                    ? 'border-amber-500/40 bg-amber-500/12 text-amber-300'
                    : item.tone === 'emerald'
                      ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-300'
                      : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-muted)]';

              const iconStyle =
                item.tone === 'danger'
                  ? 'text-red-400'
                  : item.tone === 'amber'
                    ? 'text-amber-400'
                    : isSelected || item.tone === 'emerald'
                      ? 'text-emerald-400'
                      : 'text-[var(--text-secondary)]';

              return (
                <React.Fragment key={item.id}>
                  {showGroupHeader && (
                    <div className="px-2.5 pt-2 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {item.category}
                    </div>
                  )}
                  <button
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => void executeItem(item)}
                    disabled={Boolean(busyActionId)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'border-emerald-500/45 bg-emerald-500/10'
                        : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--panel-muted)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'border-emerald-500/35 bg-emerald-500/10'
                            : 'border-[var(--border-subtle)] bg-[var(--panel)]'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${iconStyle} ${isBusy ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-[var(--text)] truncate">
                            {item.title}
                          </span>
                          {item.active && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono tracking-wider shrink-0 ${badgeStyle}`}
                      >
                        {isBusy ? 'RUNNING' : item.badge}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <footer className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[#0a0e14] flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-4">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
            <span>Esc Close</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                telemetry.estopActive ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            <span>
              {telemetry.workspaceMode} · {telemetry.securityState}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default CommandPalette;
