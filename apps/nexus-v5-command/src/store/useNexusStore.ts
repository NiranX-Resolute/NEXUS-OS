import { create } from 'zustand';
import { WS_URL, ipcJson } from '@/services/ipc';
import type {
  CommandDispatchResult,
  GpuInfo,
  LogEntry,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
  ToastItem,
  ToastLevel,
  WorkspaceMode,
} from '@/types';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  fps: 60,
  ramMb: 0,
  ramTotalMb: 0,
  ramPercent: 0,
  cpuUsagePct: 0,
  cpuCoresLogical: 0,
  cpuCoresPhysical: 0,
  activeSlices: 0,
  micRms: 0,
  pingMs: 0,
  uptimeSecs: 0,
  wsConnected: false,
  workspaceMode: 'DEV',
  securityState: 'NOMINAL',
  estopActive: false,
  primaryGpuName: 'Detecting...',
  primaryVramTotalMb: 0,
  primaryVramFreeMb: 0,
  gpuTempC: null,
  cpuTempC: null,
  recommendedProfile: 'STANDARD',
  localLlmCapable: false,
  recommendedLocalModel: null,
  gpus: [],
  timestamp: 0,
};

const VALID_MODES = new Set<WorkspaceMode>(['DEV', 'STUDY', 'STUDIO', 'SILENT']);

function normalizeMode(value: unknown, fallback: WorkspaceMode = 'DEV'): WorkspaceMode {
  const upper = String(value ?? '').trim().toUpperCase() as WorkspaceMode;
  return VALID_MODES.has(upper) ? upper : fallback;
}

interface StatusResponse {
  success?: boolean;
  status?: string;
  workspace_mode?: string;
  uptime_secs?: number;
}

interface WorkspaceModeResponse {
  success?: boolean;
  mode?: string;
  active_mode?: string;
  security_state?: string;
  estop_active?: boolean;
}

interface TasksResponse {
  success?: boolean;
  tasks?: TaskItem[];
}

interface LogsResponse {
  success?: boolean;
  logs?: LogEntry[];
}

interface HardwarePayload {
  cpu_percent?: number;
  cpu_cores_logical?: number;
  cpu_cores_physical?: number;
  ram_total_mb?: number;
  ram_used_mb?: number;
  ram_percent?: number;
  primary_gpu_name?: string;
  primary_vram_total_mb?: number;
  primary_vram_free_mb?: number;
  gpu_temperature_c?: number | null;
  cpu_temperature_c?: number | null;
  recommended_profile?: string;
  local_llm_capable?: boolean;
  recommended_local_model?: string | null;
  gpus?: GpuInfo[];
  timestamp?: number;
}

interface HardwareResponse {
  success?: boolean;
  hardware?: HardwarePayload;
}

interface EstopResponse {
  success?: boolean;
  estop?: boolean;
  estop_active?: boolean;
  status?: string;
  security_state?: string;
  message?: string;
  error?: string;
}

export interface NexusStoreState {
  activeTab: NavTabId;
  setActiveTab: (tab: NavTabId) => void;
  telemetry: TelemetrySnapshot;
  tasks: TaskItem[];
  logs: LogEntry[];
  isOnline: boolean;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toast: ToastItem | null;
  pushToast: (
    messageOrToast: string | { message: string; kind?: ToastLevel },
    kind?: ToastLevel
  ) => void;
  dismissToast: () => void;
  applyTelemetryFrame: (frame: Partial<TelemetrySnapshot>) => void;
  connectTelemetryWs: () => void;
  disconnectTelemetryWs: () => void;
  refreshAll: () => Promise<void>;
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<boolean>;
  toggleEstop: (reason?: string) => Promise<boolean>;
  dispatchCommand: (command: string) => Promise<CommandDispatchResult>;
  cancelTask: (taskId: string) => Promise<boolean>;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let telemetrySocket: WebSocket | null = null;
let telemetryReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryIntentionalClose = false;

export const useNexusStore = create<NexusStoreState>((set, get) => ({
  activeTab: 'core',
  setActiveTab: (tab) => set({ activeTab: tab }),

  telemetry: INITIAL_TELEMETRY,
  tasks: [],
  logs: [],
  isOnline: false,

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),

  toast: null,
  pushToast: (messageOrToast, kind = 'info') => {
    const resolvedMessage =
      typeof messageOrToast === 'string' ? messageOrToast : messageOrToast.message;
    const resolvedKind: ToastLevel =
      typeof messageOrToast === 'string' ? kind : (messageOrToast.kind ?? kind);
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    set({ toast: { id, message: resolvedMessage, kind: resolvedKind } });

    toastTimer = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state));
      toastTimer = null;
    }, 3600);
  },

  dismissToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },

  applyTelemetryFrame: (frame) => {
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        ...frame,
      },
    }));
  },

  connectTelemetryWs: () => {
    if (
      telemetrySocket &&
      (telemetrySocket.readyState === WebSocket.OPEN ||
        telemetrySocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    telemetryIntentionalClose = false;
    if (telemetryReconnectTimer) {
      clearTimeout(telemetryReconnectTimer);
      telemetryReconnectTimer = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      telemetrySocket = ws;

      ws.onopen = () => {
        set((state) => ({
          isOnline: true,
          telemetry: { ...state.telemetry, wsConnected: true },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as Record<string, unknown>;
          set((state) => {
            const prev = state.telemetry;
            return {
              telemetry: {
                ...prev,
                wsConnected: true,
                fps: typeof data.fps === 'number' ? data.fps : prev.fps,
                ramMb: typeof data.ramMb === 'number' ? Math.round(data.ramMb) : prev.ramMb,
                activeSlices:
                  typeof data.activeSlices === 'number' ? data.activeSlices : prev.activeSlices,
                cpuUsagePct:
                  typeof data.cpuUsagePct === 'number'
                    ? Math.round(data.cpuUsagePct * 10) / 10
                    : prev.cpuUsagePct,
                micRms: typeof data.micRms === 'number' ? data.micRms : prev.micRms,
                timestamp: typeof data.timestamp === 'number' ? data.timestamp : prev.timestamp,
              },
            };
          });
        } catch {
          // Ignore malformed telemetry WebSocket frames
        }
      };

      ws.onerror = () => {
        set((state) => ({
          telemetry: { ...state.telemetry, wsConnected: false },
        }));
      };

      ws.onclose = () => {
        if (telemetrySocket === ws) {
          telemetrySocket = null;
        }
        set((state) => ({
          telemetry: { ...state.telemetry, wsConnected: false },
        }));
        if (!telemetryIntentionalClose && !telemetryReconnectTimer) {
          telemetryReconnectTimer = setTimeout(() => {
            telemetryReconnectTimer = null;
            get().connectTelemetryWs();
          }, 5000);
        }
      };
    } catch {
      set((state) => ({
        telemetry: { ...state.telemetry, wsConnected: false },
      }));
    }
  },

  disconnectTelemetryWs: () => {
    telemetryIntentionalClose = true;
    if (telemetryReconnectTimer) {
      clearTimeout(telemetryReconnectTimer);
      telemetryReconnectTimer = null;
    }
    if (telemetrySocket) {
      try {
        telemetrySocket.close();
      } catch {
        // Ignore close errors
      }
      telemetrySocket = null;
    }
    set((state) => ({
      telemetry: { ...state.telemetry, wsConnected: false },
    }));
  },

  refreshAll: async () => {
    const t0 = performance.now();
    const [statusRes, modeRes, tasksRes, logsRes, hwRes] = await Promise.all([
      ipcJson<StatusResponse>('/api/status'),
      ipcJson<WorkspaceModeResponse>('/api/workspace/mode'),
      ipcJson<TasksResponse>('/api/tasks?limit=50'),
      ipcJson<LogsResponse>('/api/telemetry/logs?limit=25'),
      ipcJson<HardwareResponse>('/api/telemetry/hardware'),
    ]);
    const measuredPingMs = Math.max(1, Math.round(performance.now() - t0));

    let online = Boolean(statusRes.success);
    let uptimeSecs = typeof statusRes.uptime_secs === 'number' ? Math.round(statusRes.uptime_secs) : get().telemetry.uptimeSecs;

    if (!online) {
      const healthRes = await ipcJson<{ success?: boolean; uptime_secs?: number }>('/api/health');
      if (healthRes.success) {
        online = true;
        if (typeof healthRes.uptime_secs === 'number') {
          uptimeSecs = Math.round(healthRes.uptime_secs);
        }
      }
    }

    set((state) => {
      const prev = state.telemetry;
      const hw = hwRes.success ? hwRes.hardware : undefined;
      const modeCandidate =
        modeRes.success ? (modeRes.mode ?? modeRes.active_mode) : statusRes.workspace_mode;
      const workspaceMode = normalizeMode(modeCandidate, prev.workspaceMode);

      const rawSec = String(modeRes.security_state ?? prev.securityState).toUpperCase();
      const estopActive =
        typeof modeRes.estop_active === 'boolean'
          ? modeRes.estop_active
          : rawSec === 'LOCKED'
            ? true
            : prev.estopActive;
      const securityState: TelemetrySnapshot['securityState'] = estopActive
        ? 'LOCKED'
        : rawSec === 'ELEVATED'
          ? 'ELEVATED'
          : 'NOMINAL';

      return {
        isOnline: online,
        tasks: tasksRes.success && Array.isArray(tasksRes.tasks) ? tasksRes.tasks : state.tasks,
        logs: logsRes.success && Array.isArray(logsRes.logs) ? logsRes.logs : state.logs,
        telemetry: {
          ...prev,
          pingMs: online ? measuredPingMs : prev.pingMs,
          uptimeSecs,
          workspaceMode,
          securityState,
          estopActive,
          cpuUsagePct:
            typeof hw?.cpu_percent === 'number' ? Math.round(hw.cpu_percent * 10) / 10 : prev.cpuUsagePct,
          cpuCoresLogical: hw?.cpu_cores_logical ?? prev.cpuCoresLogical,
          cpuCoresPhysical: hw?.cpu_cores_physical ?? prev.cpuCoresPhysical,
          ramMb: typeof hw?.ram_used_mb === 'number' ? Math.round(hw.ram_used_mb) : prev.ramMb,
          ramTotalMb: typeof hw?.ram_total_mb === 'number' ? Math.round(hw.ram_total_mb) : prev.ramTotalMb,
          ramPercent:
            typeof hw?.ram_percent === 'number' ? Math.round(hw.ram_percent * 10) / 10 : prev.ramPercent,
          primaryGpuName: hw?.primary_gpu_name ?? prev.primaryGpuName,
          primaryVramTotalMb: hw?.primary_vram_total_mb ?? prev.primaryVramTotalMb,
          primaryVramFreeMb: hw?.primary_vram_free_mb ?? prev.primaryVramFreeMb,
          gpuTempC: hw?.gpu_temperature_c ?? prev.gpuTempC,
          cpuTempC: hw?.cpu_temperature_c ?? prev.cpuTempC,
          recommendedProfile: hw?.recommended_profile ?? prev.recommendedProfile,
          localLlmCapable: hw?.local_llm_capable ?? prev.localLlmCapable,
          recommendedLocalModel: hw?.recommended_local_model ?? prev.recommendedLocalModel,
          gpus: Array.isArray(hw?.gpus) ? hw.gpus : prev.gpus,
          timestamp: hw?.timestamp ?? Date.now() / 1000,
        },
      };
    });
  },

  switchWorkspaceMode: async (mode) => {
    const normalized = normalizeMode(mode, get().telemetry.workspaceMode);
    const prevMode = get().telemetry.workspaceMode;

    set((state) => ({
      telemetry: { ...state.telemetry, workspaceMode: normalized },
    }));

    const res = await ipcJson<WorkspaceModeResponse & { error?: string }>('/api/workspace/mode', {
      method: 'POST',
      body: JSON.stringify({ mode: normalized }),
    });

    if (!res.success) {
      set((state) => ({
        telemetry: { ...state.telemetry, workspaceMode: prevMode },
      }));
      get().pushToast(res.error || `Failed switching to ${normalized} mode`, 'error');
      return false;
    }

    const confirmed = normalizeMode(res.mode ?? res.active_mode, normalized);
    set((state) => ({
      telemetry: { ...state.telemetry, workspaceMode: confirmed },
    }));
    get().pushToast(`Workspace mode switched to ${confirmed}`, 'success');
    return true;
  },

  toggleEstop: async (reason) => {
    const currentlyActive = get().telemetry.estopActive;
    const endpoint = currentlyActive ? '/api/estop/reset' : '/api/estop/trigger';
    const payload = currentlyActive
      ? {}
      : { reason: reason?.trim() || 'Nexus V5 Operator E-Stop Triggered' };

    let res = await ipcJson<EstopResponse>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.success) {
      res = await ipcJson<EstopResponse>('/api/estop', {
        method: 'POST',
        body: JSON.stringify(
          currentlyActive
            ? { reset: true }
            : { reset: false, reason: reason?.trim() || 'Nexus V5 Operator E-Stop Triggered' }
        ),
      });
    }

    if (!res.success) {
      get().pushToast(res.error || 'E-Stop state transition failed', 'error');
      return false;
    }

    const nextActive = typeof res.estop_active === 'boolean'
      ? res.estop_active
      : typeof res.estop === 'boolean'
        ? res.estop
        : !currentlyActive;

    set((state) => ({
      telemetry: {
        ...state.telemetry,
        estopActive: nextActive,
        securityState: nextActive ? 'LOCKED' : 'NOMINAL',
      },
    }));

    get().pushToast(
      nextActive ? 'EMERGENCY STOP ENGAGED — Execution halted' : 'E-STOP RESET — Nominal operation restored',
      nextActive ? 'error' : 'success'
    );

    void get().refreshAll();
    return true;
  },

  dispatchCommand: async (command) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return { success: false, error: 'Command prompt is empty' };
    }

    const res = await ipcJson<CommandDispatchResult>('/api/command', {
      method: 'POST',
      body: JSON.stringify({ command: trimmed, prompt: trimmed }),
    });

    if (res.success) {
      const summary = res.output || res.message || res.response || 'Command executed';
      get().pushToast(
        res.reflex ? `Reflex executed (${res.latency_ms ?? 0}ms): ${summary}` : summary,
        'success'
      );
    } else {
      get().pushToast(res.error || res.message || 'Command dispatch failed', 'error');
    }

    void get().refreshAll();
    return res;
  },

  cancelTask: async (taskId) => {
    const res = await ipcJson<{ success?: boolean; error?: string }>(
      `/api/tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: 'POST' }
    );

    if (!res.success) {
      get().pushToast(res.error || `Failed to cancel task ${taskId}`, 'error');
      return false;
    }

    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, status: 'CANCELLED' } : task
      ),
    }));
    get().pushToast(`Task ${taskId} cancelled`, 'warn');
    void get().refreshAll();
    return true;
  },
}));
