import { create } from 'zustand'
import { ipcJson, WS_URL } from '@/services/ipc'
import type {
  CommandDispatchResult,
  GpuDeviceInfo,
  LogEntry,
  NavTabId,
  TaskItem,
  TelemetrySnapshot,
  ToastNotice,
  ToastTone,
  WorkspaceMode,
} from '@/types'

interface StatusApiResponse {
  success?: boolean
  status?: string
  version?: string
  workspace_mode?: string
  uptime_secs?: number
}

interface WorkspaceModeApiResponse {
  success?: boolean
  mode?: string
  air_gapped?: boolean
  is_sovereign_locked?: boolean
}

interface TasksApiResponse {
  success?: boolean
  tasks?: TaskItem[]
}

interface LogsApiResponse {
  success?: boolean
  logs?: LogEntry[]
}

interface HardwareApiResponse {
  success?: boolean
  hardware?: {
    cpu_cores_logical?: number
    cpu_cores_physical?: number
    cpu_percent?: number
    ram_total_mb?: number
    ram_free_mb?: number
    ram_used_mb?: number
    ram_percent?: number
    gpus?: GpuDeviceInfo[]
    primary_gpu_name?: string
    primary_vram_total_mb?: number
    primary_vram_free_mb?: number
    recommended_profile?: string
    local_llm_capable?: boolean
    recommended_local_model?: string | null
    gpu_temperature_c?: number | null
    cpu_temperature_c?: number | null
  }
}

interface TelemetryApiResponse {
  success?: boolean
  telemetry?: {
    cpu?: {
      logical_cores?: number
      physical_cores?: number
      utilization_percent?: number
    }
    ram?: {
      total_bytes?: number
      free_bytes?: number
      used_bytes?: number
      utilization_percent?: number
    }
    active_slices?: number
    fps?: number
    cpuUsage?: number
    cpuCoresLogical?: number
    cpuCoresPhysical?: number
    memoryUsage?: number
    memoryTotal?: number
    memoryFree?: number
    ramPercent?: number
    gpus?: GpuDeviceInfo[]
    gpuTempC?: number | null
    cpuTempC?: number | null
    activeAgents?: number
    securityState?: 'NOMINAL' | 'ELEVATED' | 'LOCKED'
    uptimeSecs?: number
  }
}

interface EstopApiResponse {
  success?: boolean
  estop?: boolean
  estop_active?: boolean
  status?: string
  message?: string
  error?: string
}

interface CommandApiResponse {
  success?: boolean
  blocked?: boolean
  handled_by?: string
  output?: string
  response?: string
  result?: unknown
  message?: string
  error?: string
  latency_ms?: number
}

export interface NexusStoreState {
  activeTab: NavTabId
  setActiveTab: (tab: NavTabId) => void
  telemetry: TelemetrySnapshot
  tasks: TaskItem[]
  logs: LogEntry[]
  isOnline: boolean
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  toast: ToastNotice | null
  pushToast: (message: string, tone?: ToastTone) => void
  dismissToast: () => void
  connectTelemetryWs: () => void
  disconnectTelemetryWs: () => void
  updateTelemetryFromWs: (payload: Partial<{
    fps: number
    ramMb: number
    activeSlices: number
    cpuUsagePct: number
    micRms: number
    wsConnected: boolean
    timestamp: number
  }>) => void
  refreshAll: () => Promise<void>
  switchWorkspaceMode: (mode: WorkspaceMode) => Promise<void>
  toggleEstop: (reason?: string) => Promise<void>
  dispatchCommand: (command: string) => Promise<CommandDispatchResult>
  cancelTask: (taskId: string) => Promise<boolean>
}

const VALID_MODES: WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT']

function normalizeMode(raw?: string | null): WorkspaceMode {
  const upper = String(raw || 'DEV').trim().toUpperCase()
  return (VALID_MODES.includes(upper as WorkspaceMode) ? upper : 'DEV') as WorkspaceMode
}

const initialTelemetry: TelemetrySnapshot = {
  workspaceMode: 'DEV',
  airGapped: false,
  estopActive: false,
  securityState: 'NOMINAL',
  cpuPercent: 0,
  cpuCoresLogical: 0,
  cpuCoresPhysical: 0,
  ramUsedMb: 0,
  ramTotalMb: 0,
  ramFreeMb: 0,
  ramPercent: 0,
  gpuName: '',
  vramTotalMb: 0,
  vramFreeMb: 0,
  vramUsedMb: 0,
  gpuTempC: null,
  cpuTempC: null,
  gpus: [],
  fps: 0,
  activeSlices: 0,
  activeAgents: 0,
  micRms: 0,
  pingMs: 0,
  uptimeSecs: 0,
  wsConnected: false,
  recommendedProfile: 'BALANCED',
  localLlmCapable: false,
  recommendedLocalModel: null,
  version: '5.0.0',
  updatedAt: 0,
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
let wsInstance: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsManualClose = false

export const useNexusStore = create<NexusStoreState>((set, get) => ({
  activeTab: 'core',
  setActiveTab: (tab) => set({ activeTab: tab }),

  telemetry: initialTelemetry,
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
      clearTimeout(toastTimer)
      toastTimer = null
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set({
      toast: {
        id,
        message,
        tone,
        createdAt: Date.now(),
      },
    })
    toastTimer = setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null })
      }
      toastTimer = null
    }, 3600)
  },

  dismissToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toast: null })
  },

  connectTelemetryWs: () => {
    if (
      wsInstance &&
      (wsInstance.readyState === WebSocket.OPEN ||
        wsInstance.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    wsManualClose = false
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer)
      wsReconnectTimer = null
    }

    try {
      const socket = new WebSocket(WS_URL)
      wsInstance = socket

      socket.onopen = () => {
        set((state) => ({
          isOnline: true,
          telemetry: { ...state.telemetry, wsConnected: true },
        }))
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as Partial<{
            fps: number
            ramMb: number
            activeSlices: number
            cpuUsagePct: number
            micRms: number
            wsConnected: boolean
            timestamp: number
          }>
          get().updateTelemetryFromWs(parsed)
        } catch {
          // Ignore non-JSON frames
        }
      }

      socket.onerror = () => {
        set((state) => ({
          telemetry: { ...state.telemetry, wsConnected: false },
        }))
      }

      socket.onclose = () => {
        if (wsInstance === socket) {
          wsInstance = null
        }
        set((state) => ({
          telemetry: { ...state.telemetry, wsConnected: false },
        }))
        if (!wsManualClose) {
          wsReconnectTimer = setTimeout(() => {
            wsReconnectTimer = null
            get().connectTelemetryWs()
          }, 3000)
        }
      }
    } catch {
      set((state) => ({
        telemetry: { ...state.telemetry, wsConnected: false },
      }))
    }
  },

  disconnectTelemetryWs: () => {
    wsManualClose = true
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer)
      wsReconnectTimer = null
    }
    if (wsInstance) {
      try {
        wsInstance.close()
      } catch {
        // Ignore close errors
      }
      wsInstance = null
    }
    set((state) => ({
      telemetry: { ...state.telemetry, wsConnected: false },
    }))
  },

  updateTelemetryFromWs: (payload) => {
    set((state) => ({
      isOnline: true,
      telemetry: {
        ...state.telemetry,
        fps: typeof payload.fps === 'number' ? payload.fps : state.telemetry.fps,
        ramUsedMb: typeof payload.ramMb === 'number' ? payload.ramMb : state.telemetry.ramUsedMb,
        activeSlices:
          typeof payload.activeSlices === 'number'
            ? payload.activeSlices
            : state.telemetry.activeSlices,
        cpuPercent:
          typeof payload.cpuUsagePct === 'number'
            ? payload.cpuUsagePct
            : state.telemetry.cpuPercent,
        micRms: typeof payload.micRms === 'number' ? payload.micRms : state.telemetry.micRms,
        wsConnected:
          typeof payload.wsConnected === 'boolean' ? payload.wsConnected : true,
        updatedAt: Date.now(),
      },
    }))
  },

  refreshAll: async () => {
    const pingStart = performance.now()
    const [statusRes, modeRes, tasksRes, logsRes, hwRes, telemRes] = await Promise.allSettled([
      ipcJson<StatusApiResponse>('/api/status'),
      ipcJson<WorkspaceModeApiResponse>('/api/workspace/mode'),
      ipcJson<TasksApiResponse>('/api/tasks'),
      ipcJson<LogsApiResponse>('/api/telemetry/logs?limit=25'),
      ipcJson<HardwareApiResponse>('/api/telemetry/hardware'),
      ipcJson<TelemetryApiResponse>('/api/telemetry'),
    ])
    const measuredPing = Math.max(1, Math.round(performance.now() - pingStart))

    const statusOk =
      statusRes.status === 'fulfilled' &&
      (statusRes.value.success !== false && statusRes.value.status === 'ONLINE')

    const prev = get().telemetry
    const nextTelemetry: TelemetrySnapshot = {
      ...prev,
      pingMs: statusOk ? measuredPing : prev.pingMs,
      updatedAt: Date.now(),
    }

    if (statusRes.status === 'fulfilled' && statusRes.value) {
      const s = statusRes.value
      if (typeof s.uptime_secs === 'number') nextTelemetry.uptimeSecs = s.uptime_secs
      if (s.version) nextTelemetry.version = s.version
      if (s.workspace_mode) {
        nextTelemetry.workspaceMode = normalizeMode(s.workspace_mode)
        nextTelemetry.airGapped = nextTelemetry.workspaceMode === 'SILENT'
      }
    }

    if (modeRes.status === 'fulfilled' && modeRes.value && modeRes.value.mode) {
      const m = normalizeMode(modeRes.value.mode)
      nextTelemetry.workspaceMode = m
      nextTelemetry.airGapped = Boolean(modeRes.value.air_gapped ?? m === 'SILENT')
    }

    if (hwRes.status === 'fulfilled' && hwRes.value?.hardware) {
      const hw = hwRes.value.hardware
      const gpus = Array.isArray(hw.gpus) ? hw.gpus : []
      const primaryGpu = gpus[0]
      nextTelemetry.cpuCoresLogical = hw.cpu_cores_logical ?? nextTelemetry.cpuCoresLogical
      nextTelemetry.cpuCoresPhysical = hw.cpu_cores_physical ?? nextTelemetry.cpuCoresPhysical
      nextTelemetry.cpuPercent = hw.cpu_percent ?? nextTelemetry.cpuPercent
      nextTelemetry.ramTotalMb = hw.ram_total_mb ?? nextTelemetry.ramTotalMb
      nextTelemetry.ramFreeMb = hw.ram_free_mb ?? nextTelemetry.ramFreeMb
      nextTelemetry.ramUsedMb = hw.ram_used_mb ?? nextTelemetry.ramUsedMb
      nextTelemetry.ramPercent = hw.ram_percent ?? nextTelemetry.ramPercent
      nextTelemetry.gpus = gpus
      nextTelemetry.gpuName = hw.primary_gpu_name || primaryGpu?.name || nextTelemetry.gpuName
      nextTelemetry.vramTotalMb =
        hw.primary_vram_total_mb ?? primaryGpu?.vram_total_mb ?? nextTelemetry.vramTotalMb
      nextTelemetry.vramFreeMb =
        hw.primary_vram_free_mb ?? primaryGpu?.vram_free_mb ?? nextTelemetry.vramFreeMb
      nextTelemetry.vramUsedMb =
        primaryGpu?.vram_used_mb ??
        Math.max(0, nextTelemetry.vramTotalMb - nextTelemetry.vramFreeMb)
      nextTelemetry.gpuTempC =
        hw.gpu_temperature_c ?? primaryGpu?.temperature_c ?? nextTelemetry.gpuTempC
      nextTelemetry.cpuTempC = hw.cpu_temperature_c ?? nextTelemetry.cpuTempC
      nextTelemetry.recommendedProfile =
        hw.recommended_profile || nextTelemetry.recommendedProfile
      nextTelemetry.localLlmCapable = Boolean(hw.local_llm_capable)
      nextTelemetry.recommendedLocalModel = hw.recommended_local_model ?? null
    }

    if (telemRes.status === 'fulfilled' && telemRes.value?.telemetry) {
      const t = telemRes.value.telemetry
      if (typeof t.fps === 'number') nextTelemetry.fps = t.fps
      if (typeof t.active_slices === 'number') nextTelemetry.activeSlices = t.active_slices
      if (typeof t.activeAgents === 'number') nextTelemetry.activeAgents = t.activeAgents
      if (t.securityState) {
        nextTelemetry.securityState = t.securityState
        nextTelemetry.estopActive = t.securityState === 'LOCKED'
      }
      if (typeof t.uptimeSecs === 'number') nextTelemetry.uptimeSecs = t.uptimeSecs
      if (typeof t.cpu?.utilization_percent === 'number' && !nextTelemetry.cpuPercent) {
        nextTelemetry.cpuPercent = t.cpu.utilization_percent
      } else if (typeof t.cpuUsage === 'number' && !nextTelemetry.cpuPercent) {
        nextTelemetry.cpuPercent = t.cpuUsage
      }
      if (typeof t.ram?.utilization_percent === 'number' && !nextTelemetry.ramPercent) {
        nextTelemetry.ramPercent = t.ram.utilization_percent
      } else if (typeof t.ramPercent === 'number' && !nextTelemetry.ramPercent) {
        nextTelemetry.ramPercent = t.ramPercent
      }
    }

    const nextTasks =
      tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value?.tasks)
        ? tasksRes.value.tasks
        : get().tasks

    const nextLogs =
      logsRes.status === 'fulfilled' && Array.isArray(logsRes.value?.logs)
        ? logsRes.value.logs
        : get().logs

    const anyReachable =
      statusOk ||
      (modeRes.status === 'fulfilled' && modeRes.value?.success === true) ||
      (tasksRes.status === 'fulfilled' && tasksRes.value?.success === true) ||
      (hwRes.status === 'fulfilled' && hwRes.value?.success === true)

    set({
      isOnline: anyReachable,
      telemetry: nextTelemetry,
      tasks: nextTasks,
      logs: nextLogs,
    })
  },

  switchWorkspaceMode: async (mode) => {
    const targetMode = normalizeMode(mode)
    try {
      const res = await ipcJson<WorkspaceModeApiResponse & { error?: string }>(
        '/api/workspace/mode',
        {
          method: 'POST',
          body: JSON.stringify({ mode: targetMode }),
        },
      )
      if (res.success === false) {
        get().pushToast(res.error || `Failed switching to ${targetMode}`, 'error')
        return
      }
      const actualMode = normalizeMode(res.mode || targetMode)
      set((state) => ({
        telemetry: {
          ...state.telemetry,
          workspaceMode: actualMode,
          airGapped: actualMode === 'SILENT',
        },
      }))
      get().pushToast(
        actualMode === 'SILENT'
          ? 'SILENT Air-Gap engaged — cloud & external egress halted'
          : `Workspace switched to ${actualMode}`,
        actualMode === 'SILENT' ? 'warning' : 'success',
      )
      await get().refreshAll()
    } catch (err) {
      get().pushToast(
        err instanceof Error ? err.message : 'Workspace mode request failed',
        'error',
      )
    }
  },

  toggleEstop: async (reason) => {
    const currentlyActive = get().telemetry.estopActive
    try {
      const res = await ipcJson<EstopApiResponse>('/api/estop', {
        method: 'POST',
        body: JSON.stringify({
          reset: currentlyActive,
          reason: reason || 'Spatial Floating Dock Operator E-Stop',
        }),
      })
      if (res.success === false) {
        get().pushToast(res.error || 'E-Stop toggle failed', 'error')
        return
      }
      const nextActive =
        typeof res.estop === 'boolean'
          ? res.estop
          : typeof res.estop_active === 'boolean'
            ? res.estop_active
            : !currentlyActive

      set((state) => ({
        telemetry: {
          ...state.telemetry,
          estopActive: nextActive,
          securityState: nextActive ? 'LOCKED' : 'NOMINAL',
        },
      }))

      get().pushToast(
        res.message ||
          (nextActive
            ? 'E-STOP ASSERTED — child agents and tool calls halted'
            : 'E-STOP cleared — nominal execution restored'),
        nextActive ? 'error' : 'success',
      )
      await get().refreshAll()
    } catch (err) {
      get().pushToast(
        err instanceof Error ? err.message : 'Failed communicating with E-Stop circuit',
        'error',
      )
    }
  },

  dispatchCommand: async (command) => {
    const clean = command.trim()
    if (!clean) {
      return { success: false, error: 'Command prompt cannot be empty' }
    }

    try {
      const res = await ipcJson<CommandApiResponse>('/api/command', {
        method: 'POST',
        body: JSON.stringify({ command: clean }),
      })

      const outputText =
        res.output ||
        res.response ||
        (typeof res.result === 'string' ? res.result : undefined) ||
        res.message

      if (res.blocked) {
        get().pushToast(outputText || res.error || 'Blocked by ScopeGuard invariant', 'warning')
        await get().refreshAll()
        return {
          success: false,
          blocked: true,
          handledBy: res.handled_by || 'ScopeGuard',
          output: outputText,
          error: res.error || outputText,
          latencyMs: res.latency_ms,
        }
      }

      if (res.success === false) {
        get().pushToast(res.error || outputText || 'Command execution failed', 'error')
        await get().refreshAll()
        return {
          success: false,
          handledBy: res.handled_by,
          output: outputText,
          error: res.error || outputText,
          latencyMs: res.latency_ms,
        }
      }

      get().pushToast(
        outputText ? `${res.handled_by || 'Nexus'}: ${outputText.slice(0, 96)}` : 'Command executed',
        'success',
      )
      await get().refreshAll()

      return {
        success: true,
        handledBy: res.handled_by,
        output: outputText,
        latencyMs: res.latency_ms,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Command dispatch error'
      get().pushToast(message, 'error')
      return { success: false, error: message }
    }
  },

  cancelTask: async (taskId) => {
    const cleanId = taskId.trim()
    if (!cleanId) return false

    try {
      const res = await ipcJson<{ success?: boolean; status?: string; error?: string }>(
        `/api/tasks/${encodeURIComponent(cleanId)}/cancel`,
        {
          method: 'POST',
        },
      )

      if (res.success) {
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === cleanId ? { ...t, status: res.status || 'CANCELLED' } : t,
          ),
        }))
        get().pushToast(`Task ${cleanId} cancelled`, 'info')
        await get().refreshAll()
        return true
      }

      get().pushToast(res.error || `Unable to cancel task ${cleanId}`, 'warning')
      return false
    } catch (err) {
      get().pushToast(
        err instanceof Error ? err.message : 'Task cancellation request failed',
        'error',
      )
      return false
    }
  },
}))
