export type EditionId =
  | 'v1'
  | 'v2'
  | 'v3'
  | 'v4'
  | 'v5'
  | 'v1-obsidian'
  | 'v2-cockpit'
  | 'v3-spatial'
  | 'v4-minimal'
  | 'v5-command'
  | 'nexus-v1-obsidian'
  | 'nexus-v2-cockpit'
  | 'nexus-v3-spatial'
  | 'nexus-v4-minimal'
  | 'nexus-v5-command'

export type NavTabId =
  | 'core'
  | 'chat'
  | 'studio'
  | 'scholar'
  | 'autopilot'
  | 'interview'
  | 'world'
  | 'vault'
  | 'settings'

export type WorkspaceMode = 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT'

export interface GpuDeviceInfo {
  index: number
  name: string
  vram_total_mb: number
  vram_free_mb: number
  vram_used_mb: number
  driver_version?: string | null
  temperature_c?: number | null
}

export interface TelemetrySnapshot {
  workspaceMode: WorkspaceMode
  airGapped: boolean
  estopActive: boolean
  securityState: 'NOMINAL' | 'ELEVATED' | 'LOCKED'
  cpuPercent: number
  cpuCoresLogical: number
  cpuCoresPhysical: number
  ramUsedMb: number
  ramTotalMb: number
  ramFreeMb: number
  ramPercent: number
  gpuName: string
  vramTotalMb: number
  vramFreeMb: number
  vramUsedMb: number
  gpuTempC: number | null
  cpuTempC: number | null
  gpus: GpuDeviceInfo[]
  fps: number
  activeSlices: number
  activeAgents: number
  micRms: number
  pingMs: number
  uptimeSecs: number
  wsConnected: boolean
  recommendedProfile: string
  localLlmCapable: boolean
  recommendedLocalModel: string | null
  version: string
  updatedAt: number
}

export interface TaskItem {
  id: string
  source_device?: string
  target_device?: string
  command_type: string
  prompt_raw: string
  action_plan?: string | null
  status: 'QUEUED' | 'RUNNING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string
  result_output?: string | null
  execution_log?: string | null
  created_at: string
  completed_at?: string | null
}

export interface LogEntry {
  id: number | string
  source: string
  level: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'DEBUG' | 'SUCCESS' | string
  message: string
  latency_ms?: number
  metadata?: string | Record<string, unknown> | null
  created_at: string
}

export interface MemoryNode {
  id: string
  namespace: string
  title: string
  content: string
  metadata?: Record<string, unknown>
  is_archived?: boolean
  updated_at: number | string
  score?: number
}

export interface ProviderItem {
  provider_id: string
  display_name: string
  category: string
  protocol: string
  base_url: string
  key_console_url?: string
  auth_header?: string
  auth_prefix?: string
  selected_model: string
  extra_config?: Record<string, unknown>
  free_tier_badge?: string
  priority_order: number
  enabled?: number | boolean
  has_key?: number | boolean
  status?: string
}

export interface ModelItem {
  model_uid: string
  display_name: string
  creator: string
  provider_id: string
  api_or_hf_id: string
  runtime_target: string
  modality: string
  is_abliterated: number | boolean
  abliteration_source?: string
  voice_compatible: number | boolean
  voice_role?: string
  vram_gb: number
  ram_gb: number
  quant_tag?: string
  intelligence_index: number
  cost_per_task_usd: number
  time_per_task_min?: number
  ttft_sec?: number
  error_rate_pct?: number
  context_window?: string
  license?: string
}

export interface RoutineItem {
  id: string | number
  name: string
  trigger_phrase: string
  actions_json: string
  action_sequence: string
  enabled: boolean
  created_at: string
  last_triggered?: number | null
  execution_count: number
  description: string
}

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastNotice {
  id: string
  message: string
  tone: ToastTone
  createdAt: number
}

export interface CommandDispatchResult {
  success: boolean
  output?: string
  error?: string
  handledBy?: string
  blocked?: boolean
  latencyMs?: number
}

declare global {
  interface Window {
    nexusAuth?: {
      getAuthToken: () => Promise<string>
    }
    nexusWindow?: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized?: () => Promise<boolean>
    }
    electron?: {
      ipcRenderer?: {
        invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>
        send: (channel: string, ...args: unknown[]) => void
        on?: (channel: string, listener: (...args: unknown[]) => void) => () => void
      }
    }
  }
}
