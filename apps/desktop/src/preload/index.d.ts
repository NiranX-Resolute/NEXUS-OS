import { ElectronAPI } from '@electron-toolkit/preload'

export type CoreState =
  | 'IDLE'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'ESTOP_TRIGGERED'

export type AgentId = 'DEV-01' | 'SYS-01' | 'SCOUT-01' | 'SEC-01' | 'OPS-01'
export type AgentStatus = 'IDLE' | 'ASSIGNED' | 'EXECUTING' | 'COMPLETED' | 'ERROR'

export interface CircuitPulsePayload {
  node: 'MEMORY' | 'MCP_SKILLS' | 'PERSONA' | 'WORKSPACE'
  active: boolean
  detail: string
  latency_ms: number
}

export interface AgentSlicePayload {
  agent_id: AgentId
  status: AgentStatus
  task_summary: string
  slice_id: string
}

export interface EphemeralAgentRecord {
  agent_id: string
  swarm_id: string
  parent_id?: string | null
  anchor_orbiter: string
  role_title: string
  objective: string
  status: string
  depth: number
  created_at?: string
}

export interface GestureVectorPayload {
  gesture: 'pinch' | 'spread' | 'zoom_in' | 'swipe_left' | 'rotate_left' | 'swipe_right' | 'rotate_right' | string
  value?: number
}

export interface FocusHotspotPayload {
  hotspotId?: string
  name?: string
  lat?: number
  lon?: number
}

export type NexusTelemetryEvent =
  | { type: 'core_state'; data: { core_state: CoreState; reason?: string } }
  | { type: 'audio_rms'; data: { audio_rms: number } }
  | { type: 'circuit_pulse'; data: CircuitPulsePayload }
  | { type: 'agent_slice'; data: AgentSlicePayload }
  | { type: 'active_swarm_agents'; data: { agents: EphemeralAgentRecord[] } }
  | { type: 'gesture_vector'; data: GestureVectorPayload }
  | { type: 'focus_hotspot'; data: FocusHotspotPayload }

export interface NexusTelemetryAPI {
  onEvent(callback: (event: NexusTelemetryEvent) => void): () => void
  triggerEStop(): Promise<{ success: boolean; estop_active: boolean; error?: string }>
  resetEStop(): Promise<{ success: boolean; estop_active: boolean; error?: string }>
  switchWorkspace(mode: string): Promise<{ success: boolean; workspace: string; error?: string }>
  inspectNode(node: string): Promise<any>
  getAgents(): Promise<{ success: boolean; agents: Record<AgentId, { status: AgentStatus; task: string; slice_id: string }>; error?: string }>
  postAudioRms(rms: number): Promise<{ success: boolean }>
  getStatus(): Promise<{ success: boolean; core_state: CoreState; estop_active: boolean; workspace_mode: string }>
}

export interface NexusAuthAPI {
  getAuthToken(): Promise<string>
  getVaultSecret(keyName: string): Promise<any>
  setVaultSecret(key: string, value: string): Promise<any>
  onDeepLink?(channel: string, callback: (data: any) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI & {
      webFrame?: {
        setZoomFactor(factor: number): void
        getZoomFactor(): number
        setZoomLevel(level: number): void
        getZoomLevel(): number
      }
      ipcRenderer: {
        invoke(channel: string, ...args: any[]): Promise<any>
        send(channel: string, ...args: any[]): void
        on(channel: string, func: (...args: any[]) => void): () => void
        removeAllListeners(channel: string): void
        removeListener(channel: string, func: (...args: any[]) => void): void
      }
    }
    nexusTelemetry: NexusTelemetryAPI
    nexusAuth: NexusAuthAPI
    api: unknown
  }
}
