import { create } from 'zustand';
import { WS_URL, ipcFetch, ipcJson } from '@/services/ipc';
import type {
  CommandDispatchResult,
  GpuTelemetry,
  LogEntry,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
  ThermalZone,
  ToastMessage,
  ToastTone,
  WorkspaceMode,
} from '@/types';

const VALID_MODES: readonly WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT'];

function normalizeWorkspaceMode(raw: unknown, fallback: WorkspaceMode = 'DEV'): WorkspaceMode {
  if (typeof raw !== 'string') {
    return fallback;
  }
  const upper = raw.trim().toUpperCase();
  return (VALID_MODES as readonly string[]).includes(upper) ? (upper as WorkspaceMode) : fallback;
}

function createInitialTelemetry(): TelemetrySnapshot {
  return {
    status: 'OFFLINE',
    version: '5.0.0',
    uptimeSecs: 0,
    workspaceMode: 'DEV',
    airGapped: false,
    estopActive: false,
    securityState: 'NOMINAL',
    pingMs: 0,
    fps: 0,
    activeSlices: 0,
    cpuPercent: 0,
    cpuCoresLogical: 0,
    cpuCoresPhysical: 0,
    ramUsedMb: 0,
    ramTotalMb: 0,
    ramFreeMb: 0,
    ramPercent: 0,
    primaryGpuName: 'N/A',
    vramUsedMb: 0,
    vramTotalMb: 0,
    vramFreeMb: 0,
    gpuTempC: null,
    cpuTempC: null,
    gpus: [],
    thermalZones: [],
    recommendedProfile: 'BALANCED',
    localLlmCapable: false,
    recommendedLocalModel: null,
    wsConnected: false,
    micRms: 0,
    updatedAt: 0,
  };
}

export type ToastInput =
  | (Omit<ToastMessage, 'id' | 'createdAt' | 'tone'> & { tone?: ToastTone })
  | string;

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
  toast: ToastMessage | null;
  pushToast: (msg: ToastInput, tone?: ToastTone, message?: string) => void;
  dismissToast: () => void;
  refreshAll: () => Promise<void>;
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<void>;
  toggleEstop: (reset?: boolean) => Promise<void>;
  dispatchCommand: (command: string) => Promise<CommandDispatchResult>;
  cancelTask: (taskId: string) => Promise<boolean>;
  connectTelemetryWs: () => void;
  disconnectTelemetryWs: () => void;
}

interface StatusPayload {
  success?: boolean;
  status?: string;
  version?: string;
  workspace_mode?: string;
  uptime_secs?: number;
}

interface WorkspaceModePayload {
  success?: boolean;
  mode?: string;
  active_mode?: string;
  air_gapped?: boolean;
  estop_active?: boolean;
  security_state?: string;
  rules?: {
    air_gapped?: boolean;
  };
}

interface TasksPayload {
  success?: boolean;
  tasks?: TaskItem[];
}

interface LogsPayload {
  success?: boolean;
  logs?: LogEntry[];
}

interface HardwarePayload {
  success?: boolean;
  hardware?: {
    cpu_percent?: number;
    cpu_cores_logical?: number;
    cpu_cores_physical?: number;
    ram_used_mb?: number;
    ram_total_mb?: number;
    ram_free_mb?: number;
    ram_percent?: number;
    primary_gpu_name?: string;
    primary_vram_total_mb?: number;
    primary_vram_free_mb?: number;
    gpu_temperature_c?: number | null;
    cpu_temperature_c?: number | null;
    gpus?: GpuTelemetry[];
    thermal_zones?: ThermalZone[];
    recommended_profile?: string;
    local_llm_capable?: boolean;
    recommended_local_model?: string | null;
  };
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let telemetryWs: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsExplicitlyClosed = false;

export const useNexusStore = create<NexusStoreState>((set, get) => ({
  activeTab: 'core',
  setActiveTab: (tab) => set({ activeTab: tab }),

  telemetry: createInitialTelemetry(),
  tasks: [],
  logs: [],
  isOnline: false,

  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  drawerOpen: false,
  setDrawerOpen: (open) => set({ drawerOpen: open }),

  toast: null,
  pushToast: (input, toneArg = 'info', messageArg) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextToast: ToastMessage =
      typeof input === 'string'
        ? {
            id,
            title: input,
            message: messageArg,
            tone: toneArg,
            createdAt: Date.now(),
          }
        : {
            id,
            title: input.title,
            message: input.message,
            tone: input.tone ?? toneArg,
            createdAt: Date.now(),
          };

    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    set({ toast: nextToast });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 4200);
  },
  dismissToast: () => {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    set({ toast: null });
  },

  refreshAll: async () => {
    const statusStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const [statusRes, modeRes, tasksRes, logsRes, hwRes] = await Promise.allSettled([
      ipcJson<StatusPayload>('/api/status'),
      ipcJson<WorkspaceModePayload>('/api/workspace/mode'),
      ipcJson<TasksPayload>('/api/tasks'),
      ipcJson<LogsPayload>('/api/telemetry/logs?limit=25'),
      ipcJson<HardwarePayload>('/api/telemetry/hardware'),
    ]);

    const prev = get().telemetry;
    const nextTelemetry: TelemetrySnapshot = {
      ...prev,
      updatedAt: Date.now(),
    };
    let nextOnline = false;

    if (statusRes.status === 'fulfilled' && statusRes.value && statusRes.value.success !== false) {
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - statusStart;
      nextOnline = true;
      nextTelemetry.status = String(statusRes.value.status ?? 'ONLINE');
      nextTelemetry.version = String(statusRes.value.version ?? prev.version);
      nextTelemetry.uptimeSecs = Number(statusRes.value.uptime_secs ?? prev.uptimeSecs);
      nextTelemetry.pingMs = Math.max(1, Math.round(elapsed));
      if (statusRes.value.workspace_mode) {
        nextTelemetry.workspaceMode = normalizeWorkspaceMode(
          statusRes.value.workspace_mode,
          nextTelemetry.workspaceMode
        );
      }
    } else {
      nextTelemetry.status = 'OFFLINE';
    }

    if (modeRes.status === 'fulfilled' && modeRes.value && modeRes.value.success !== false) {
      const ws = modeRes.value;
      const resolvedMode = normalizeWorkspaceMode(
        ws.mode ?? ws.active_mode,
        nextTelemetry.workspaceMode
      );
      nextTelemetry.workspaceMode = resolvedMode;
      nextTelemetry.airGapped = Boolean(
        ws.air_gapped ?? ws.rules?.air_gapped ?? resolvedMode === 'SILENT'
      );
      if (typeof ws.estop_active === 'boolean') {
        nextTelemetry.estopActive = ws.estop_active;
      }
      if (ws.estop_active) {
        nextTelemetry.securityState = 'LOCKED';
      } else if (typeof ws.security_state === 'string') {
        const sec = ws.security_state.trim().toUpperCase();
        if (sec === 'LOCKED' || sec === 'ELEVATED' || sec === 'NOMINAL') {
          nextTelemetry.securityState = sec;
        }
      }
    }

    if (hwRes.status === 'fulfilled' && hwRes.value?.hardware) {
      const hw = hwRes.value.hardware;
      const gpus = Array.isArray(hw.gpus) ? hw.gpus : prev.gpus;
      const primaryGpu = gpus[0];
      const vramTotal = Number(hw.primary_vram_total_mb ?? primaryGpu?.vram_total_mb ?? prev.vramTotalMb);
      const vramFree = Number(hw.primary_vram_free_mb ?? primaryGpu?.vram_free_mb ?? prev.vramFreeMb);
      const vramUsed = Number(primaryGpu?.vram_used_mb ?? Math.max(0, vramTotal - vramFree));

      nextTelemetry.cpuPercent = Number(hw.cpu_percent ?? prev.cpuPercent);
      nextTelemetry.cpuCoresLogical = Number(hw.cpu_cores_logical ?? prev.cpuCoresLogical);
      nextTelemetry.cpuCoresPhysical = Number(hw.cpu_cores_physical ?? prev.cpuCoresPhysical);
      nextTelemetry.ramUsedMb = Math.round(Number(hw.ram_used_mb ?? prev.ramUsedMb));
      nextTelemetry.ramTotalMb = Math.round(Number(hw.ram_total_mb ?? prev.ramTotalMb));
      nextTelemetry.ramFreeMb = Math.round(Number(hw.ram_free_mb ?? prev.ramFreeMb));
      nextTelemetry.ramPercent = Number(hw.ram_percent ?? prev.ramPercent);
      nextTelemetry.primaryGpuName = String(hw.primary_gpu_name ?? primaryGpu?.name ?? prev.primaryGpuName);
      nextTelemetry.vramTotalMb = Math.round(vramTotal);
      nextTelemetry.vramFreeMb = Math.round(vramFree);
      nextTelemetry.vramUsedMb = Math.round(vramUsed);
      nextTelemetry.gpuTempC =
        hw.gpu_temperature_c !== undefined ? hw.gpu_temperature_c : prev.gpuTempC;
      nextTelemetry.cpuTempC =
        hw.cpu_temperature_c !== undefined ? hw.cpu_temperature_c : prev.cpuTempC;
      nextTelemetry.gpus = gpus;
      nextTelemetry.thermalZones = Array.isArray(hw.thermal_zones)
        ? hw.thermal_zones
        : prev.thermalZones;
      nextTelemetry.recommendedProfile = String(
        hw.recommended_profile ?? prev.recommendedProfile
      );
      nextTelemetry.localLlmCapable = Boolean(
        hw.local_llm_capable ?? prev.localLlmCapable
      );
      nextTelemetry.recommendedLocalModel =
        hw.recommended_local_model !== undefined
          ? hw.recommended_local_model
          : prev.recommendedLocalModel;
    }

    const nextTasks: TaskItem[] =
      tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value?.tasks)
        ? tasksRes.value.tasks
        : get().tasks;

    const nextLogs: LogEntry[] =
      logsRes.status === 'fulfilled' && Array.isArray(logsRes.value?.logs)
        ? logsRes.value.logs
        : get().logs;

    set({
      isOnline: nextOnline,
      telemetry: nextTelemetry,
      tasks: nextTasks,
      logs: nextLogs,
    });
  },

  switchWorkspaceMode: async (mode) => {
    const normalized = normalizeWorkspaceMode(mode);
    const res = await ipcJson<{ success?: boolean; mode?: string; error?: string }>(
      '/api/workspace/mode',
      {
        method: 'POST',
        body: JSON.stringify({ mode: normalized }),
      }
    );

    if (res.success === false) {
      get().pushToast({
        title: 'Mode Switch Rejected',
        message: res.error ?? `Unable to switch to ${normalized}`,
        tone: 'error',
      });
      return;
    }

    const activeMode = normalizeWorkspaceMode(res.mode ?? normalized);
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        workspaceMode: activeMode,
        airGapped: activeMode === 'SILENT',
        updatedAt: Date.now(),
      },
    }));
    get().pushToast({
      title: `Workspace Mode: ${activeMode}`,
      message:
        activeMode === 'SILENT'
          ? 'Air-gapped sovereign lock engaged.'
          : `Active runtime profile updated to ${activeMode}.`,
      tone: 'success',
    });
  },

  toggleEstop: async (reset) => {
    const currentlyActive = get().telemetry.estopActive;
    const shouldReset = typeof reset === 'boolean' ? reset : currentlyActive;
    const bridgePath = shouldReset ? '/api/estop/reset' : '/api/estop/trigger';

    let response = await ipcFetch(bridgePath, {
      method: 'POST',
      body: JSON.stringify({
        reason: shouldReset ? 'User E-Stop Reset' : 'Manual User E-Stop Triggered',
      }),
    });

    if (response.status === 404 || response.status === 405) {
      response = await ipcFetch('/api/estop', {
        method: 'POST',
        body: JSON.stringify({
          reset: shouldReset,
          reason: shouldReset ? 'User E-Stop Reset' : 'Manual User E-Stop Triggered',
        }),
      });
    }

    let payload: { success?: boolean; estop?: boolean; estop_active?: boolean; error?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = { success: response.ok };
    }

    if (!response.ok || payload.success === false) {
      get().pushToast({
        title: 'E-STOP Command Failed',
        message: payload.error ?? `HTTP ${response.status}`,
        tone: 'error',
      });
      return;
    }

    const nextActive =
      typeof payload.estop_active === 'boolean'
        ? payload.estop_active
        : typeof payload.estop === 'boolean'
          ? payload.estop
          : !shouldReset;

    set((state) => ({
      telemetry: {
        ...state.telemetry,
        estopActive: nextActive,
        securityState: nextActive ? 'LOCKED' : 'NOMINAL',
        updatedAt: Date.now(),
      },
    }));

    get().pushToast({
      title: nextActive ? 'E-STOP ENGAGED' : 'E-STOP RESET',
      message: nextActive
        ? 'Active child agents and tool calls halted.'
        : 'System security state restored to NOMINAL.',
      tone: nextActive ? 'warning' : 'success',
    });
  },

  dispatchCommand: async (command) => {
    const trimmed = command.trim();
    if (!trimmed) {
      return {
        success: false,
        output: '',
        error: 'Command input is empty.',
      };
    }

    const res = await ipcJson<{
      success?: boolean;
      output?: string;
      response?: string;
      result?: string;
      message?: string;
      handled_by?: string;
      reflex?: boolean;
      blocked?: boolean;
      latency_ms?: number;
      error?: string;
    }>('/api/command', {
      method: 'POST',
      body: JSON.stringify({ command: trimmed }),
    });

    const result: CommandDispatchResult = {
      success: Boolean(res.success),
      output: String(res.output ?? res.response ?? res.result ?? res.message ?? ''),
      handledBy: res.handled_by,
      reflex: Boolean(res.reflex),
      blocked: Boolean(res.blocked),
      latencyMs: typeof res.latency_ms === 'number' ? res.latency_ms : undefined,
      error: res.error,
    };

    if (result.blocked) {
      get().pushToast({
        title: 'Blocked by ScopeGuard',
        message: result.error ?? result.output,
        tone: 'warning',
      });
    } else if (!result.success) {
      get().pushToast({
        title: 'Command Dispatch Failed',
        message: result.error ?? 'Gateway rejected command.',
        tone: 'error',
      });
    } else {
      void get().refreshAll();
    }

    return result;
  },

  cancelTask: async (taskId) => {
    const cleanId = taskId.trim();
    if (!cleanId) {
      return false;
    }

    const res = await ipcJson<{ success?: boolean; error?: string }>(
      `/api/tasks/${encodeURIComponent(cleanId)}/cancel`,
      { method: 'POST' }
    );

    if (!res.success) {
      get().pushToast({
        title: 'Task Cancel Failed',
        message: res.error ?? `Unable to cancel task ${cleanId}`,
        tone: 'error',
      });
      return false;
    }

    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === cleanId
          ? {
              ...task,
              status: 'CANCELLED',
              completed_at: new Date().toISOString(),
            }
          : task
      ),
    }));

    get().pushToast({
      title: 'Task Cancelled',
      message: cleanId,
      tone: 'info',
    });
    return true;
  },

  connectTelemetryWs: () => {
    wsExplicitlyClosed = false;
    if (typeof WebSocket === 'undefined') {
      return;
    }
    if (
      telemetryWs &&
      (telemetryWs.readyState === WebSocket.OPEN ||
        telemetryWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (wsReconnectTimer !== null) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }

    try {
      const ws = new WebSocket(WS_URL);
      telemetryWs = ws;

      ws.onopen = () => {
        set((state) => ({
          isOnline: true,
          telemetry: {
            ...state.telemetry,
            status: state.telemetry.status === 'OFFLINE' ? 'ONLINE' : state.telemetry.status,
            wsConnected: true,
            updatedAt: Date.now(),
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
          };
          set((state) => ({
            telemetry: {
              ...state.telemetry,
              fps: typeof payload.fps === 'number' ? payload.fps : state.telemetry.fps,
              ramUsedMb:
                typeof payload.ramMb === 'number' && Number.isFinite(payload.ramMb)
                  ? Math.round(payload.ramMb)
                  : state.telemetry.ramUsedMb,
              activeSlices:
                typeof payload.activeSlices === 'number'
                  ? payload.activeSlices
                  : state.telemetry.activeSlices,
              cpuPercent:
                typeof payload.cpuUsagePct === 'number'
                  ? payload.cpuUsagePct
                  : state.telemetry.cpuPercent,
              micRms:
                typeof payload.micRms === 'number' ? payload.micRms : state.telemetry.micRms,
              wsConnected:
                typeof payload.wsConnected === 'boolean' ? payload.wsConnected : true,
              updatedAt: Date.now(),
            },
          }));
        } catch {
          // Ignore malformed telemetry frame
        }
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      ws.onclose = () => {
        if (telemetryWs === ws) {
          telemetryWs = null;
        }
        set((state) => ({
          telemetry: {
            ...state.telemetry,
            wsConnected: false,
          },
        }));
        if (!wsExplicitlyClosed) {
          wsReconnectTimer = setTimeout(() => {
            get().connectTelemetryWs();
          }, 3500);
        }
      };
    } catch {
      telemetryWs = null;
    }
  },

  disconnectTelemetryWs: () => {
    wsExplicitlyClosed = true;
    if (wsReconnectTimer !== null) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (telemetryWs) {
      try {
        telemetryWs.close();
      } catch {
        // Ignore socket teardown error
      }
      telemetryWs = null;
    }
    set((state) => ({
      telemetry: {
        ...state.telemetry,
        wsConnected: false,
      },
    }));
  },
}));
