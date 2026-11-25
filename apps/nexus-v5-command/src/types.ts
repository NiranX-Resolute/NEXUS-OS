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

export interface GpuInfo {
  index: number;
  name: string;
  vram_total_mb: number;
  vram_free_mb: number;
  vram_used_mb: number;
  driver_version?: string | null;
  temperature_c?: number | null;
}

export interface TelemetrySnapshot {
  fps: number;
  ramMb: number;
  ramTotalMb: number;
  ramPercent: number;
  cpuUsagePct: number;
  cpuCoresLogical: number;
  cpuCoresPhysical: number;
  activeSlices: number;
  micRms: number;
  pingMs: number;
  uptimeSecs: number;
  wsConnected: boolean;
  workspaceMode: WorkspaceMode;
  securityState: 'NOMINAL' | 'ELEVATED' | 'LOCKED';
  estopActive: boolean;
  primaryGpuName: string;
  primaryVramTotalMb: number;
  primaryVramFreeMb: number;
  gpuTempC: number | null;
  cpuTempC: number | null;
  recommendedProfile: string;
  localLlmCapable: boolean;
  recommendedLocalModel: string | null;
  gpus: GpuInfo[];
  timestamp: number;
}

export interface TaskItem {
  id: string;
  source_device: string;
  target_device: string;
  command_type: string;
  prompt_raw: string;
  action_plan?: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  result_output?: string | null;
  execution_log?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface LogEntry {
  id: number | string;
  source: string;
  level: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'SUCCESS' | 'DEBUG' | string;
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
  metadata?: Record<string, unknown>;
  is_archived?: boolean;
  updated_at: string;
}

export interface ProviderItem {
  provider_id: string;
  display_name: string;
  category: string;
  protocol: string;
  base_url: string;
  key_console_url?: string;
  auth_header?: string;
  auth_prefix?: string;
  selected_model: string;
  extra_config?: Record<string, unknown>;
  free_tier_badge?: string;
  priority_order: number;
  enabled: number | boolean;
  has_key: number | boolean;
  last_latency_ms?: number | null;
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
  abliteration_source?: string | null;
  voice_compatible: number | boolean;
  voice_role?: string | null;
  vram_gb?: number | null;
  ram_gb?: number | null;
  quant_tag?: string | null;
  intelligence_index?: number | null;
  cost_per_task_usd?: number | null;
  time_per_task_min?: number | null;
  ttft_sec?: number | null;
  error_rate_pct?: number | null;
  context_window?: number | null;
  license?: string | null;
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

export type ToastLevel = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastLevel;
}

export interface CommandDispatchResult {
  success: boolean;
  reflex?: boolean;
  handled_by?: string;
  output?: string;
  response?: string;
  message?: string;
  error?: string;
  latency_ms?: number;
  blocked?: boolean;
  invariant?: string;
}
