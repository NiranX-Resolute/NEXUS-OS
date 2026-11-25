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

export interface TelemetrySnapshot {
  timestamp: number;
  cpuUsage: number;
  cpuCoresLogical?: number;
  cpuCoresPhysical?: number;
  memoryUsage: number;
  memoryTotal?: number;
  memoryFree?: number;
  ramPercent?: number;
  gpus?: Array<Record<string, unknown>>;
  gpuTempC?: number | null;
  cpuTempC?: number | null;
  activeAgents: number;
  activeSlices?: number;
  fps?: number;
  micRms?: number;
  wsConnected?: boolean;
  securityState: 'NOMINAL' | 'ELEVATED' | 'LOCKED';
  workspaceMode: WorkspaceMode;
  estopActive: boolean;
  airGapped?: boolean;
  uptimeSecs: number;
  latencyMs?: number;
}

export interface TaskItem {
  id: string;
  source_device: string;
  target_device?: string;
  command_type: string;
  prompt_raw: string;
  action_plan?: string | null;
  status: 'QUEUED' | 'IN_PROGRESS' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | (string & {});
  result_output?: string | null;
  execution_log?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface LogEntry {
  id: number | string;
  source: string;
  level: 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'SUCCESS' | 'DEBUG' | (string & {});
  message: string;
  latency_ms?: number;
  metadata?: string | Record<string, unknown>;
  created_at: string;
}

export interface MemoryNode {
  id: string;
  namespace: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  is_archived?: boolean;
  score?: number;
  updated_at: number | string;
  created_at?: number | string;
}

export interface ProviderItem {
  provider_id: string;
  display_name: string;
  category: string;
  protocol: string;
  base_url: string;
  key_console_url: string;
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
  abliteration_source?: string;
  voice_compatible: number | boolean;
  voice_role?: string;
  vram_gb?: number;
  ram_gb?: number;
  quant_tag?: string;
  intelligence_index?: number | null;
  cost_per_task_usd?: number | null;
  time_per_task_min?: number | null;
  ttft_sec?: number | null;
  error_rate_pct?: number | null;
  context_window?: string | null;
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
  last_triggered?: number | null;
  execution_count: number;
  description?: string;
}

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface ToastNotice {
  id: string;
  message: string;
  tone: ToastTone;
  createdAt: number;
}

declare global {
  interface Window {
    nexusAuth?: {
      getAuthToken: () => Promise<string>;
      getVaultSecret: (keyName: string) => Promise<{ success?: boolean; value?: string; error?: string }>;
      setVaultSecret: (key: string, value: string) => Promise<{ success?: boolean; error?: string }>;
    };
    nexusTelemetry?: {
      triggerEStop: (reason?: string) => Promise<Record<string, unknown>>;
      resetEStop: () => Promise<Record<string, unknown>>;
      switchWorkspace: (mode: WorkspaceMode) => Promise<Record<string, unknown>>;
      getStatus: () => Promise<Record<string, unknown>>;
      onEvent: (callback: (payload: unknown) => void) => () => void;
    };
    nexusWindow?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
    };
    electron?: {
      ipcRenderer: {
        invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
        send: (channel: string, ...args: unknown[]) => void;
        on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
      };
    };
  }
}
