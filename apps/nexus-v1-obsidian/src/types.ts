export type EditionId =
  | 'v1-obsidian'
  | 'v2-cockpit'
  | 'v3-spatial'
  | 'v4-minimal'
  | 'v5-command';

export type NavTabId =
  | 'core'
  | 'chat'
  | 'studio'
  | 'scholar'
  | 'autopilot'
  | 'interview'
  | 'world'
  | 'vault'
  | 'settings';

export type WorkspaceMode = 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT';

export interface GpuTelemetry {
  index?: number;
  name: string;
  vram_total_mb: number;
  vram_free_mb: number;
  vram_used_mb: number;
  driver_version?: string | null;
  temperature_c?: number | null;
}

export interface ThermalZone {
  name?: string;
  zone?: string;
  temperature_c: number;
}

export interface TelemetrySnapshot {
  status: string;
  version: string;
  uptimeSecs: number;
  workspaceMode: WorkspaceMode;
  airGapped: boolean;
  estopActive: boolean;
  securityState: 'NOMINAL' | 'LOCKED' | 'ELEVATED';
  pingMs: number;
  fps: number;
  activeSlices: number;
  cpuPercent: number;
  cpuCoresLogical: number;
  cpuCoresPhysical: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramFreeMb: number;
  ramPercent: number;
  primaryGpuName: string;
  vramUsedMb: number;
  vramTotalMb: number;
  vramFreeMb: number;
  gpuTempC: number | null;
  cpuTempC: number | null;
  gpus: GpuTelemetry[];
  thermalZones: ThermalZone[];
  recommendedProfile: string;
  localLlmCapable: boolean;
  recommendedLocalModel: string | null;
  wsConnected: boolean;
  micRms: number;
  updatedAt: number;
}

export type TaskStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | string;

export interface TaskItem {
  id: string;
  source_device: string;
  target_device: string;
  command_type: string;
  prompt_raw: string;
  action_plan: string | null;
  media_blob?: string | null;
  status: TaskStatus;
  result_output: string | null;
  execution_log: string | null;
  created_at: string;
  completed_at: string | null;
}

export type LogLevel =
  | 'INFO'
  | 'WARN'
  | 'WARNING'
  | 'ERROR'
  | 'CRITICAL'
  | 'DEBUG'
  | 'SUCCESS'
  | string;

export interface LogEntry {
  id: number | string;
  source: string;
  level: LogLevel;
  message: string;
  latency_ms: number;
  metadata?: string | Record<string, unknown> | null;
  created_at: string;
}

export interface MemoryNode {
  id: string;
  namespace: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  is_archived: boolean;
  updated_at: string;
  score?: number;
}

export interface ProviderItem {
  provider_id: string;
  display_name: string;
  category: string;
  protocol: string;
  base_url: string;
  key_console_url: string;
  auth_header: string;
  auth_prefix: string;
  selected_model: string;
  extra_config?: Record<string, unknown>;
  extra_config_json?: string;
  free_tier_badge: string;
  priority_order: number;
  enabled: number | boolean;
  has_key: number | boolean;
  last_latency_ms: number | null;
  last_status: string;
  updated_at?: string;
}

export interface ModelItem {
  model_uid: string;
  display_name: string;
  creator: string;
  provider_id: string;
  api_or_hf_id: string;
  runtime_target: string;
  modality: string;
  is_abliterated: number | boolean;
  abliteration_source?: string;
  voice_compatible: number | boolean;
  voice_role?: string;
  vram_gb: number;
  ram_gb: number;
  quant_tag?: string;
  intelligence_index?: number | null;
  cost_per_task_usd?: number | null;
  time_per_task_min?: number | null;
  ttft_sec?: number | null;
  error_rate_pct?: number | null;
  context_window?: string;
  license?: string;
}

export interface RoutineItem {
  id: string;
  name: string;
  trigger_phrase: string;
  actions_json: string;
  action_sequence: string;
  enabled: boolean;
  created_at: string;
  last_triggered: number | null;
  execution_count: number;
  description: string;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
  createdAt: number;
}

export interface CommandDispatchResult {
  success: boolean;
  output: string;
  handledBy?: string;
  reflex?: boolean;
  blocked?: boolean;
  latencyMs?: number;
  error?: string;
}

export interface NexusAuthBridge {
  getAuthToken: () => Promise<string>;
}

export interface NexusWindowBridge {
  minimize: () => Promise<boolean>;
  maximize: () => Promise<boolean>;
  close: () => Promise<boolean>;
  isMaximized?: () => Promise<boolean>;
}

export interface NexusElectronBridge {
  ipcRenderer?: {
    invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
    send?: (channel: string, ...args: unknown[]) => void;
  };
}

declare global {
  interface Window {
    nexusAuth?: NexusAuthBridge;
    nexusWindow?: NexusWindowBridge;
    electron?: NexusElectronBridge;
  }
}
