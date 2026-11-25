import { create } from 'zustand';
import { WS_URL, ipcJson } from '../services/ipc';
import type {
  LogEntry,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
  ToastNotice,
  WorkspaceMode,
} from '../types';

interface StatusResponse {
  success?: boolean;
  status?: string;
  branding?: string;
  version?: string;
  workspace_mode?: WorkspaceMode;
  uptime_secs?: number;
}

interface WorkspaceModeResponse {
  success?: boolean;
  mode?: WorkspaceMode;
}

interface TasksResponse {
  success?: boolean;
  tasks?: TaskItem[];
}

interface LogsResponse {
  success?: boolean;
  logs?: LogEntry[];
}

interface HardwareResponse {
  success?: boolean;
  hardware?: {
    timestamp?: number;
    cpu_cores_logical?: number;
    cpu_cores_physical?: number;
    cpu_percent?: number;
    ram_total_mb?: number;
    ram_free_mb?: number;
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
  };
}

interface CommandResponse {
  success?: boolean;
  output?: string;
  response?: string;
  result?: string;
  message?: string;
  error?: string;
  blocked?: boolean;
  reflex?: boolean;
  handled_by?: string;
  latency_ms?: number;
}

interface EstopResponse {
  success?: boolean;
  estop?: boolean;
  status?: string;
  message?: string;
  error?: string;
}

export interface CommandDispatchResult {
  success: boolean;
  output?: string;
  error?: string;
  reflex?: boolean;
  handled_by?: string;
  latency_ms?: number;
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
  toast: ToastNotice | null;
  pushToast: (message: string, tone?: ToastNotice['tone']) => void;
  dismissToast: () => void;
  refreshAll: () => Promise<void>;
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<boolean>;
  toggleEstop: (reason?: string) => Promise<boolean>;
  dispatchCommand: (command: string) => Promise<CommandDispatchResult>;
  cancelTask: (taskId: string) => Promise<boolean>;
  connectTelemetryWs: () => void;
  disconnectTelemetryWs: () => void;
}

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  status: 'OFFLINE',
  branding: 'Nexus Sovereign Engine',
  version: '5.0.0',
  workspaceMode: 'DEV',
  securityState: 'NOMINAL',
  estopActive: false,
  uptimeSecs: 0,
  fps: 60,
  cpuPercent: 0,
  cpuCoresLogical: 0,
  cpuCoresPhysical: 0,
  ramTotalMb: 0,
  ramUsedMb: 0,
  ramFreeMb: 0,
  ramPercent: 0,
  gpuName: 'Detecting GPU...',
  vramTotalMb: 0,
  vramFreeMb: 0,
  gpuTempC: null,
  cpuTempC: null,
  activeSlices: 0,
  latencyMs: 0,
  micRms: 0,
  wsConnected: false,
  recommendedProfile: 'BALANCED',
  localLlmCapable: false,
  recommendedLocalModel: null,
  timestamp: 0,
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;
let telemetrySocket: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsShouldStayConnected = false;

function normalizeWorkspaceMode(raw: unknown, fallback: WorkspaceMode): WorkspaceMode {
  const value = typeof raw === 'string' ? raw.toUpperCase().trim() : '';
  if (value === 'DEV' || value === 'STUDY' || value === 'STUDIO' || value === 'SILENT') {
    return value;
  }
  return fallback;
}

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
  pushToast: (message, tone = 'info') => {
    const id = ++toastSeq;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    set({ toast: { id, message, tone } });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 4200);
  },
  dismissToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },

  refreshAll: async () => {
    const startedAt = performance.now();
    const [statusRes, modeRes, tasksRes, logsRes, hwRes] = await Promise.allSettled([
      ipcJson<StatusResponse>('/api/status'),
      ipcJson<WorkspaceModeResponse>('/api/workspace/mode'),
      ipcJson<TasksResponse>('/api/tasks'),
      ipcJson<LogsResponse>('/api/telemetry/logs?limit=25'),
      ipcJson<HardwareResponse>('/api/telemetry/hardware'),
    ]);
    const latencyMs = Math.round(performance.now() - startedAt);

    const prev = get().telemetry;
    const statusOk =
      statusRes.status === 'fulfilled' &&
      (statusRes.value.success === true || statusRes.value.status === 'ONLINE');

    if (!statusOk && modeRes.status !== 'fulfilled' && hwRes.status !== 'fulfilled') {
      set({
        isOnline: false,
        telemetry: {
          ...prev,
          status: 'OFFLINE',
          latencyMs,
        },
      });
      return;
    }

    const nextTelemetry: TelemetrySnapshot = {
      ...prev,
      status: statusOk ? 'ONLINE' : 'DEGRADED',
      latencyMs,
      timestamp: Date.now(),
    };

    if (statusRes.status === 'fulfilled' && statusRes.value.success !== false) {
      const s = statusRes.value;
      if (s.branding) nextTelemetry.branding = s.branding;
      if (s.version) nextTelemetry.version = s.version;
      if (typeof s.uptime_secs === 'number') nextTelemetry.uptimeSecs = s.uptime_secs;
      if (s.workspace_mode) {
        nextTelemetry.workspaceMode = normalizeWorkspaceMode(s.workspace_mode, nextTelemetry.workspaceMode);
      }
    }

    if (modeRes.status === 'fulfilled' && modeRes.value.mode) {
      nextTelemetry.workspaceMode = normalizeWorkspaceMode(modeRes.value.mode, nextTelemetry.workspaceMode);
    }

    if (hwRes.status === 'fulfilled' && hwRes.value.hardware) {
      const hw = hwRes.value.hardware;
      if (typeof hw.cpu_percent === 'number') nextTelemetry.cpuPercent = hw.cpu_percent;
      if (typeof hw.cpu_cores_logical === 'number') nextTelemetry.cpuCoresLogical = hw.cpu_cores_logical;
      if (typeof hw.cpu_cores_physical === 'number') nextTelemetry.cpuCoresPhysical = hw.cpu_cores_physical;
      if (typeof hw.ram_total_mb === 'number') nextTelemetry.ramTotalMb = hw.ram_total_mb;
      if (typeof hw.ram_used_mb === 'number') nextTelemetry.ramUsedMb = hw.ram_used_mb;
      if (typeof hw.ram_free_mb === 'number') nextTelemetry.ramFreeMb = hw.ram_free_mb;
      if (typeof hw.ram_percent === 'number') nextTelemetry.ramPercent = hw.ram_percent;
      if (hw.primary_gpu_name) nextTelemetry.gpuName = hw.primary_gpu_name;
      if (typeof hw.primary_vram_total_mb === 'number') nextTelemetry.vramTotalMb = hw.primary_vram_total_mb;
      if (typeof hw.primary_vram_free_mb === 'number') nextTelemetry.vramFreeMb = hw.primary_vram_free_mb;
      if (hw.gpu_temperature_c !== undefined) nextTelemetry.gpuTempC = hw.gpu_temperature_c;
      if (hw.cpu_temperature_c !== undefined) nextTelemetry.cpuTempC = hw.cpu_temperature_c;
      if (hw.recommended_profile) nextTelemetry.recommendedProfile = hw.recommended_profile;
      if (typeof hw.local_llm_capable === 'boolean') nextTelemetry.localLlmCapable = hw.local_llm_capable;
      if (hw.recommended_local_model !== undefined) nextTelemetry.recommendedLocalModel = hw.recommended_local_model;
    }

    const nextTasks =
      tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value.tasks)
        ? tasksRes.value.tasks
        : get().tasks;

    const nextLogs =
      logsRes.status === 'fulfilled' && Array.isArray(logsRes.value.logs)
        ? logsRes.value.logs
        : get().logs;

    set({
      isOnline: statusOk || (modeRes.status === 'fulfilled' && modeRes.value.success === true),
      telemetry: nextTelemetry,
      tasks: nextTasks,
      logs: nextLogs,
    });
  },

  switchWorkspaceMode: async (mode) => {
    try {
      const res = await ipcJson<WorkspaceModeResponse>('/api/workspace/mode', {
        method: 'POST',
        body: JSON.stringify({ mode }),
      });

      if (res.success === false) {
        get().pushToast(res.error || `Failed switching to ${mode}`, 'error');
        return false;
      }

      const resolvedMode = normalizeWorkspaceMode(res.mode, mode);
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          workspaceMode: resolvedMode,
        },
      }));
      get().pushToast(`Workspace mode: ${resolvedMode}`, 'success');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workspace mode request failed';
      get().pushToast(message, 'error');
      return false;
    }
  },

  toggleEstop: async (reason) => {
    const currentlyActive = get().telemetry.estopActive;
    try {
      const payload = currentlyActive
        ? { reset: true }
        : { reset: false, reason: reason || 'Cockpit Operator E-Stop Triggered' };

      const res = await ipcJson<EstopResponse>('/api/estop', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success === false) {
        get().pushToast(res.error || 'E-Stop toggle failed', 'error');
        return false;
      }

      const estopNow = typeof res.estop === 'boolean' ? res.estop : !currentlyActive;
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          estopActive: estopNow,
          securityState: estopNow ? 'LOCKED' : 'NOMINAL',
        },
      }));

      get().pushToast(
        estopNow ? 'EMERGENCY STOP ENGAGED — Execution halted' : 'E-Stop cleared — Nominal operation restored',
        estopNow ? 'warn' : 'success'
      );
      void get().refreshAll();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'E-Stop endpoint unreachable';
      get().pushToast(message, 'error');
      return false;
    }
  },

  dispatchCommand: async (command) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return { success: false, error: 'Command prompt cannot be empty' };
    }

    try {
      const res = await ipcJson<CommandResponse>('/api/command', {
        method: 'POST',
        body: JSON.stringify({ command: trimmed }),
      });

      const ok = res.success === true && !res.blocked;
      const output = res.output ?? res.response ?? res.result ?? res.message;

      if (ok) {
        get().pushToast(
          res.reflex
            ? `Reflex executed (${res.latency_ms ?? 0}ms)`
            : `Dispatched via ${res.handled_by || 'SubAgentSwarm'}`,
          'success'
        );
      } else {
        get().pushToast(res.error || output || 'Command execution blocked', res.blocked ? 'warn' : 'error');
      }

      void get().refreshAll();
      return {
        success: ok,
        output: typeof output === 'string' ? output : undefined,
        error: res.error,
        reflex: res.reflex,
        handled_by: res.handled_by,
        latency_ms: res.latency_ms,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gateway command dispatch failed';
      get().pushToast(message, 'error');
      return { success: false, error: message };
    }
  },

  cancelTask: async (taskId) => {
    try {
      const res = await ipcJson<{ success?: boolean; error?: string }>(
        `/api/tasks/${encodeURIComponent(taskId)}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );

      if (res.success === false) {
        get().pushToast(res.error || `Failed cancelling task ${taskId}`, 'error');
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel task';
      get().pushToast(message, 'error');
      return false;
    }
  },

  connectTelemetryWs: () => {
    if (typeof WebSocket === 'undefined') return;
    wsShouldStayConnected = true;

    if (telemetrySocket && (telemetrySocket.readyState === WebSocket.OPEN || telemetrySocket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);
      telemetrySocket = ws;

      ws.onopen = () => {
        set((state) => ({
          isOnline: true,
          telemetry: {
            ...state.telemetry,
            wsConnected: true,
            status: state.telemetry.status === 'OFFLINE' ? 'ONLINE' : state.telemetry.status,
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            fps?: number;
            ramMb?: number;
            activeSlices?: number;
            cpuUsagePct?: number;
            micRms?: number;
            wsConnected?: boolean;
            timestamp?: number;
          };
          set((state) => ({
            telemetry: {
              ...state.telemetry,
              fps: typeof payload.fps === 'number' ? payload.fps : state.telemetry.fps,
              ramUsedMb: typeof payload.ramMb === 'number' ? payload.ramMb : state.telemetry.ramUsedMb,
              activeSlices: typeof payload.activeSlices === 'number' ? payload.activeSlices : state.telemetry.activeSlices,
              cpuPercent: typeof payload.cpuUsagePct === 'number' ? payload.cpuUsagePct : state.telemetry.cpuPercent,
              micRms: typeof payload.micRms === 'number' ? payload.micRms : state.telemetry.micRms,
              wsConnected: payload.wsConnected ?? true,
              timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
            },
          }));
        } catch {
          // Ignore malformed telemetry frame
        }
      };

      ws.onclose = () => {
        if (telemetrySocket === ws) {
          telemetrySocket = null;
        }
        set((state) => ({
          telemetry: {
            ...state.telemetry,
            wsConnected: false,
          },
        }));
        if (wsShouldStayConnected) {
          if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
          wsReconnectTimer = setTimeout(() => {
            if (wsShouldStayConnected) {
              get().connectTelemetryWs();
            }
          }, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // Ignore socket constructor error in restricted environment
    }
  },

  disconnectTelemetryWs: () => {
    wsShouldStayConnected = false;
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (telemetrySocket) {
      telemetrySocket.close();
      telemetrySocket = null;
    }
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        wsConnected: false,
      },
    }));
  },
}));
