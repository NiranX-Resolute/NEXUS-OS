// apps/desktop/src/renderer/src/components/Settings.tsx
// NEXUS OS v5.0 — Unified 6-Tab Settings Re-export & Backward-Compatibility Adapter
// Backed strictly by 127.0.0.1:47630 Bearer IPC and Windows DPAPI Vault (Zero LocalStorage)

import React from 'react'
import { SettingsView, SettingsViewProps, SettingsTabId } from '../views/Settings'

export interface NexusEngineConfig {
  developerMode?: boolean
  groqApiKey?: string
  geminiApiKey?: string
  geminiModel?: string
  ollamaEndpoint?: string
  cloudflareBridgeUrl?: string
  cloudflareAuthToken?: string
  deviceId?: string
}

export interface SettingsProps extends SettingsViewProps {
  initialConfig?: Partial<NexusEngineConfig>
  onSave?: (config: NexusEngineConfig) => void
}

export const Settings: React.FC<SettingsProps> = ({ isSystemActive, onSave: _onSave }) => {
  return <SettingsView isSystemActive={isSystemActive} />
}

export { SettingsView }
export type { SettingsViewProps, SettingsTabId }
export default Settings
