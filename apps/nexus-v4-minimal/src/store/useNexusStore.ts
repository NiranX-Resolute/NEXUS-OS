import { create } from 'zustand';
import { WS_URL, ipcFetch, ipcJson } from '../services/ipc';
import type {
  LogEntry,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
  ToastNotice,
  ToastTone,
  WorkspaceMode,
} from '../types';

export interface CommandDispatchResult {
  success: boolean;
  output?: string;
  error?: string;
  blocked?: boolean;
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
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: () => void;
  refreshAll: () => Promise<void>;
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<boolean>;
  toggleEstop: (reason?: string) => Promise<boolean>;
  dispatchCommand: (command: string) => Promise<CommandDispatchResult>;
  cancelTask: (taskId: string) => Promise<boolean>;
  connectTelemetryWs: () => () => void;
  disconnectTelemetryWs: () => void;
}

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  timestamp: 0,
  cpuUsage: 0,
  memoryUsage: 0,
  ramPercent: 0,
  activeAgents: 0,
  activeSlices: 0,
  fps: 60,
  wsConnected: false,
  securityState: 'NOMINAL',
  workspaceMode: 'DEV',
  estopActive: false,
  airGapped: false,
  uptimeSecs: 0,
  latencyMs: 0,
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let activeSocket: WebSocket | null = null;
let activeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let socketIntentionalClose = false;

function normalizeWorkspaceMode(raw: unknown): WorkspaceMode {
  const mode = String(raw || 'DEV').trim().toUpperCase();
  if (mode === 'STUDY' || mode === 'STUDIO' || mode === 'SILENT') {
    return mode;
  }
  return 'DEV';
}

function normalizeSecurityState(raw: unknown, estopActive: boolean): TelemetrySnapshot['securityState'] {
  if (estopActive) return 'LOCKED';
  const norm = String(raw || 'NOMINAL').trim().toUpperCase();
  if (norm === 'LOCKED' || norm === 'ELEVATED') {
    return norm;
  }
  return 'NOMINAL';
}

function normalizeTelemetryPayload(
  raw: Record<string, unknown>,
  prev: TelemetrySnapshot
): Partial<TelemetrySnapshot> {
  const cpuObj = raw.cpu as Record<string, unknown> | undefined;
  const ramObj = raw.ram as Record<string, unknown> | undefined;

  const cpuUsage =
    typeof raw.cpuUsage === 'number'
      ? raw.cpuUsage
      : typeof cpuObj?.utilization_percent === 'number'
      ? cpuObj.utilization_percent
      : prev.cpuUsage;

  const cpuCoresLogical =
    typeof raw.cpuCoresLogical === 'number'
      ? raw.cpuCoresLogical
      : typeof cpuObj?.logical_cores === 'number'
      ? cpuObj.logical_cores
      : prev.cpuCoresLogical;

  const cpuCoresPhysical =
    typeof raw.cpuCoresPhysical === 'number'
      ? raw.cpuCoresPhysical
      : typeof cpuObj?.physical_cores === 'number'
      ? cpuObj.physical_cores
      : prev.cpuCoresPhysical;

  const memoryUsage =
    typeof raw.memoryUsage === 'number'
      ? Math.round(raw.memoryUsage)
      : typeof ramObj?.used_bytes === 'number'
      ? Math.round(ramObj.used_bytes)
      : prev.memoryUsage;

  const memoryTotal =
    typeof raw.memoryTotal === 'number'
      ? Math.round(raw.memoryTotal)
      : typeof ramObj?.total_bytes === 'number'
      ? Math.round(ramObj.total_bytes)
      : prev.memoryTotal;

  const memoryFree =
    typeof raw.memoryFree === 'number'
      ? Math.round(raw.memoryFree)
      : typeof ramObj?.free_bytes === 'number'
      ? Math.round(ramObj.free_bytes)
      : prev.memoryFree;

  const ramPercent =
    typeof raw.ramPercent === 'number'
      ? raw.ramPercent
      : typeof ramObj?.utilization_percent === 'number'
      ? ramObj.utilization_percent
      : prev.ramPercent;

  const activeSlices =
    typeof raw.active_slices === 'number'
      ? raw.active_slices
      : typeof raw.activeSlices === 'number'
      ? raw.activeSlices
      : prev.activeSlices;

  const fps = typeof raw.fps === 'number' ? raw.fps : prev.fps;

  const activeAgents =
    typeof raw.activeAgents === 'number' ? raw.activeAgents : prev.activeAgents;

  const estopActive =
    typeof raw.estopActive === 'boolean' ? raw.estopActive : prev.estopActive;

  return {
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now() / 1000,
    cpuUsage: Number(cpuUsage.toFixed(1)),
    cpuCoresLogical,
    cpuCoresPhysical,
    memoryUsage,
    memoryTotal,
    memoryFree,
    ramPercent: typeof ramPercent === 'number' ? Number(ramPercent.toFixed(1)) : prev.ramPercent,
    gpus: Array.isArray(raw.gpus) ? (raw.gpus as Array<Record<string, unknown>>) : prev.gpus,
    gpuTempC: typeof raw.gpuTempC === 'number' || raw.gpuTempC === null ? raw.gpuTempC : prev.gpuTempC,
    cpuTempC: typeof raw.cpuTempC === 'number' || raw.cpuTempC === null ? raw.cpuTempC : prev.cpuTempC,
    activeAgents,
    activeSlices,
    fps,
    securityState: normalizeSecurityState(raw.securityState, estopActive),
    uptimeSecs: typeof raw.uptimeSecs === 'number' ? Math.round(raw.uptimeSecs) : prev.uptimeSecs,
  };
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
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set({
      toast: {
        id,
        message,
        tone,
        createdAt: Date.now(),
      },
    });
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
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

  refreshAll: async () => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const [healthRes, telemetryRes, modeRes, tasksRes, logsRes] = await Promise.allSettled([
      ipcFetch('/api/health'),
      ipcFetch('/api/telemetry'),
      ipcFetch('/api/workspace/mode'),
      ipcFetch('/api/tasks?limit=50'),
      ipcFetch('/api/telemetry/logs?limit=50'),
    ]);

    const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Math.max(1, Math.round(endedAt - startedAt));

    let online = false;
    let nextTelemetry: TelemetrySnapshot = { ...get().telemetry };
    let nextTasks = get().tasks;
    let nextLogs = get().logs;

    if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
      online = true;
      nextTelemetry.latencyMs = latencyMs;
      try {
        const healthData = (await healthRes.value.json()) as Record<string, unknown>;
        if (typeof healthData.uptime_secs === 'number') {
          nextTelemetry.uptimeSecs = Math.round(healthData.uptime_secs);
        }
      } catch {
        // Keep prior uptime on parse error
      }
    }

    if (telemetryRes.status === 'fulfilled' && telemetryRes.value.ok) {
      online = true;
      try {
        const data = (await telemetryRes.value.json()) as { telemetry?: Record<string, unknown> };
        if (data?.telemetry && typeof data.telemetry === 'object') {
          nextTelemetry = {
            ...nextTelemetry,
            ...normalizeTelemetryPayload(data.telemetry, nextTelemetry),
          };
        }
      } catch {
        // Keep prior telemetry snapshot
      }
    }

    if (modeRes.status === 'fulfilled' && modeRes.value.ok) {
      online = true;
      try {
        const modeData = (await modeRes.value.json()) as Record<string, unknown>;
        const mode = normalizeWorkspaceMode(modeData.mode ?? modeData.active_mode);
        const estopActive = Boolean(modeData.estop_active ?? nextTelemetry.estopActive);
        nextTelemetry = {
          ...nextTelemetry,
          workspaceMode: mode,
          airGapped: Boolean(modeData.air_gapped ?? mode === 'SILENT'),
          estopActive,
          securityState: normalizeSecurityState(modeData.security_state, estopActive),
        };
      } catch {
        // Keep prior mode state
      }
    }

    if (tasksRes.status === 'fulfilled' && tasksRes.value.ok) {
      online = true;
      try {
        const taskData = (await tasksRes.value.json()) as { tasks?: TaskItem[] };
        if (Array.isArray(taskData?.tasks)) {
          nextTasks = taskData.tasks;
        }
      } catch {
        // Keep existing tasks list
      }
    }

    if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
      online = true;
      try {
        const logData = (await logsRes.value.json()) as { logs?: LogEntry[] };
        if (Array.isArray(logData?.logs)) {
          nextLogs = logData.logs;
        }
      } catch {
        // Keep existing logs list
      }
    }

    set({
      isOnline: online,
      telemetry: nextTelemetry,
      tasks: nextTasks,
      logs: nextLogs,
    });
  },

  switchWorkspaceMode: async (mode) => {
    const normalized = normalizeWorkspaceMode(mode);
    const previousMode = get().telemetry.workspaceMode;

    set((state) => ({
      telemetry: {
        ...state.telemetry,
        workspaceMode: normalized,
        airGapped: normalized === 'SILENT',
      },
    }));

    try {
      const res = await ipcJson<{ mode?: string; air_gapped?: boolean }>('/api/workspace/mode', {
        method: 'POST',
        body: JSON.stringify({ mode: normalized }),
      });

      if (res.success === false) {
        set((state) => ({
          telemetry: {
            ...state.telemetry,
            workspaceMode: previousMode,
            airGapped: previousMode === 'SILENT',
          },
        }));
        get().pushToast(res.error || `Failed to switch mode to ${normalized}`, 'error');
        return false;
      }

      const activeMode = normalizeWorkspaceMode(res.mode ?? normalized);
      set((state) => ({
        isOnline: true,
        telemetry: {
          ...state.telemetry,
          workspaceMode: activeMode,
          airGapped: Boolean(res.air_gapped ?? activeMode === 'SILENT'),
        },
      }));
      get().pushToast(`Workspace mode switched to ${activeMode}`, 'success');
      void get().refreshAll();
      return true;
    } catch (err) {
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          workspaceMode: previousMode,
          airGapped: previousMode === 'SILENT',
        },
      }));
      const msg = err instanceof Error ? err.message : 'Workspace mode request failed';
      get().pushToast(msg, 'error');
      return false;
    }
  },

  toggleEstop: async (reason) => {
    const currentlyActive = get().telemetry.estopActive;
    const payload = currentlyActive
      ? { reset: true }
      : { reset: false, reason: reason || 'Manual Operator E-Stop' };

    try {
      const res = await ipcJson<{
        estop?: boolean;
        estop_active?: boolean;
        security_state?: string;
        message?: string;
      }>('/api/estop', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success === false) {
        get().pushToast(res.error || 'Failed to toggle E-Stop', 'error');
        return false;
      }

      const nextActive =
        typeof res.estop === 'boolean'
          ? res.estop
          : typeof res.estop_active === 'boolean'
          ? res.estop_active
          : !currentlyActive;

      set((state) => ({
        isOnline: true,
        telemetry: {
          ...state.telemetry,
          estopActive: nextActive,
          securityState: normalizeSecurityState(res.security_state, nextActive),
        },
      }));

      get().pushToast(
        nextActive
          ? 'E-STOP ENGAGED: Child agents and external tools halted'
          : 'E-STOP RESET: Sovereign execution restored',
        nextActive ? 'error' : 'success'
      );
      void get().refreshAll();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'E-Stop IPC request failed';
      get().pushToast(msg, 'error');
      return false;
    }
  },

  dispatchCommand: async (command) => {
    const clean = command.trim();
    if (!clean) {
      return { success: false, error: 'Command input is required' };
    }

    try {
      const res = await ipcJson<{
        output?: string;
        response?: string;
        result?: unknown;
        message?: string;
        blocked?: boolean;
        handled_by?: string;
        latency_ms?: number;
      }>('/api/command', {
        method: 'POST',
        body: JSON.stringify({ command: clean }),
      });

      const output =
        res.output ||
        res.response ||
        (typeof res.result === 'string' ? res.result : undefined) ||
        res.message;

      if (res.blocked) {
        get().pushToast(output || res.error || 'Blocked by ScopeGuard invariant', 'warn');
        void get().refreshAll();
        return {
          success: false,
          blocked: true,
          handled_by: res.handled_by || 'ScopeGuard',
          output,
          error: res.error || output,
          latency_ms: res.latency_ms,
        };
      }

      if (res.success === false) {
        get().pushToast(res.error || output || 'Command execution failed', 'error');
        return {
          success: false,
          output,
          error: res.error || output || 'Command execution failed',
          handled_by: res.handled_by,
          latency_ms: res.latency_ms,
        };
      }

      get().pushToast(
        res.handled_by ? `${res.handled_by}: Command completed` : 'Command executed',
        'success'
      );
      void get().refreshAll();
      return {
        success: true,
        output,
        handled_by: res.handled_by,
        latency_ms: res.latency_ms,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Command dispatch failed';
      get().pushToast(msg, 'error');
      return { success: false, error: msg };
    }
  },

  cancelTask: async (taskId) => {
    const id = taskId.trim();
    if (!id) return false;

    try {
      const res = await ipcJson<{ status?: string }>(`/api/tasks/${encodeURIComponent(id)}/cancel`, {
        method: 'POST',
      });

      if (res.success) {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, status: res.status || 'CANCELLED' } : task
          ),
        }));
        get().pushToast(`Task ${id} cancelled`, 'info');
        void get().refreshAll();
        return true;
      }

      get().pushToast(res.error || `Could not cancel task ${id}`, 'warn');
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Task cancellation failed';
      get().pushToast(msg, 'error');
      return false;
    }
  },

  connectTelemetryWs: () => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return () => undefined;
    }

    socketIntentionalClose = false;
    if (activeSocket && activeSocket.readyState <= WebSocket.OPEN) {
      return () => get().disconnectTelemetryWs();
    }

    const connect = () => {
      if (socketIntentionalClose) return;
      try {
        const ws = new WebSocket(WS_URL);
        activeSocket = ws;

        ws.onopen = () => {
          set((state) => ({
            isOnline: true,
            telemetry: { ...state.telemetry, wsConnected: true },
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as Record<string, unknown>;
            set((state) => ({
              isOnline: true,
              telemetry: {
                ...state.telemetry,
                wsConnected: true,
                fps: typeof data.fps === 'number' ? data.fps : state.telemetry.fps,
                memoryUsage:
                  typeof data.ramMb === 'number'
                    ? Math.round(data.ramMb)
                    : state.telemetry.memoryUsage,
                activeSlices:
                  typeof data.activeSlices === 'number'
                    ? data.activeSlices
                    : state.telemetry.activeSlices,
                cpuUsage:
                  typeof data.cpuUsagePct === 'number'
                    ? Number(data.cpuUsagePct.toFixed(1))
                    : state.telemetry.cpuUsage,
                micRms: typeof data.micRms === 'number' ? data.micRms : state.telemetry.micRms,
                timestamp:
                  typeof data.timestamp === 'number'
                    ? data.timestamp
                    : state.telemetry.timestamp,
              },
            }));
          } catch {
            // Ignore malformed telemetry frame
          }
        };

        ws.onclose = () => {
          if (activeSocket === ws) {
            activeSocket = null;
          }
          set((state) => ({
            telemetry: { ...state.telemetry, wsConnected: false },
          }));
          if (!socketIntentionalClose) {
            if (activeReconnectTimer) clearTimeout(activeReconnectTimer);
            activeReconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!socketIntentionalClose) {
          if (activeReconnectTimer) clearTimeout(activeReconnectTimer);
          activeReconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();
    return () => get().disconnectTelemetryWs();
  },

  disconnectTelemetryWs: () => {
    socketIntentionalClose = true;
    if (activeReconnectTimer) {
      clearTimeout(activeReconnectTimer);
      activeReconnectTimer = null;
    }
    if (activeSocket) {
      activeSocket.close();
      activeSocket = null;
    }
    set((state) => ({
      telemetry: { ...state.telemetry, wsConnected: false },
    }));
  },
}));
