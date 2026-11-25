/**
 * NexusRuntimeContext
 *
 * Unified headless runtime provider for the Nexus Desktop Workstation.
 * Ports and unifies all subsystems from IndexRoot:
 *  - Gemini Live full-duplex WebSocket voice session (nexusService)
 *  - Camera / Screen / Dual-PIP vision streams + 1 FPS frame uplink
 *  - Keyboard shortcuts (Ctrl+M mic, Ctrl+Shift+V vision, Ctrl+Shift+R refresh, zoom)
 *  - System status telemetry & SQLite WAL brain chat history
 *  - Dock sync, Electron update prompts, VisionSourceModal, and Context Menu state
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { nexusService } from '@renderer/services/nexus-voice-ai'
import { mediaDeviceManager } from '@renderer/services/media-devices'
import { getHistory, saveMessage } from '@renderer/services/nexus-ai-brain'
import { getSystemStatus } from '@renderer/services/system-info'
import { getScreenSourceId } from '@renderer/hooks/CaptureDesktop'
import { useNexusShortcuts } from '@renderer/hooks/useNexusShortcuts'
import { ipcFetch, ipcInvoke, ipcSend } from '@renderer/services/ipc-client'
import type { UpdateInfo } from '@renderer/components/UpdatePromptModal'
import type { StartVisionOptions } from '@renderer/components/VisionSourceModal'

export type VisionMode = 'screen' | 'camera' | 'dual' | 'tab'

export interface NexusRuntimeContextValue {
  // Voice & Core Link
  isSystemActive: boolean
  isSystemStarting: boolean
  isSystemRecovering: boolean
  isMicMuted: boolean
  isUserSpeaking: boolean
  toggleSystem: () => Promise<void>
  toggleMic: () => void
  sendPromptToCore: (prompt: string, intent?: 'queue' | 'steer') => Promise<boolean>

  // Vision (Camera, Screen, Dual PIP, Browser Tab)
  isVideoOn: boolean
  visionMode: VisionMode
  activeStream: MediaStream | null
  activeCameraStream: MediaStream | null
  isSourceModalOpen: boolean
  setIsSourceModalOpen: (open: boolean) => void
  openVisionPicker: () => void
  startVisionWithSource: (mode: VisionMode, options?: StartVisionOptions) => Promise<void>
  quickStartCamera: () => Promise<void>
  quickStartScreen: () => Promise<void>
  stopVision: () => void

  // Telemetry & History
  systemTelemetry: any
  isRefreshing: boolean
  triggerRefreshAll: () => Promise<void>
  historyMessages: Array<{ role: string; text: string; timestamp?: string | number }>
  refreshHistory: () => Promise<void>

  // Desktop Window, Modals, Dock & Context Menu
  isMiniMode: boolean
  setIsMiniMode: (mini: boolean) => void
  lockSession: () => void
  updateInfo: UpdateInfo | null
  showUpdateModal: boolean
  setShowUpdateModal: (open: boolean) => void
  showDockModal: boolean
  setShowDockModal: (open: boolean) => void
  contextMenuPos: { x: number; y: number } | null
  setContextMenuPos: (pos: { x: number; y: number } | null) => void
}

const NexusRuntimeContext = createContext<NexusRuntimeContextValue | null>(null)

export function NexusRuntimeProvider({
  onNavigateTab,
  children
}: {
  onNavigateTab?: (tabId: string) => void
  children: React.ReactNode
}) {
  const [isSystemActive, setIsSystemActive] = useState(false)
  const [isSystemStarting, setIsSystemStarting] = useState(false)
  const [isSystemRecovering, setIsSystemRecovering] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)

  const [isVideoOn, setIsVideoOn] = useState(false)
  const [visionMode, setVisionMode] = useState<VisionMode>('screen')
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null)
  const [activeCameraStream, setActiveCameraStream] = useState<MediaStream | null>(null)
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false)

  const [systemTelemetry, setSystemTelemetry] = useState<any>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [historyMessages, setHistoryMessages] = useState<
    Array<{ role: string; text: string; timestamp?: string | number }>
  >([])

  const [isMiniMode, setIsMiniMode] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [showDockModal, setShowDockModal] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)

  const frameTimerRef = useRef<number | null>(null)
  const primaryStreamRef = useRef<MediaStream | null>(null)
  const secondaryStreamRef = useRef<MediaStream | null>(null)

  const refreshHistory = useCallback(async () => {
    try {
      const items = await getHistory()
      if (Array.isArray(items)) {
        setHistoryMessages(
          items.map((item: any) => ({
            role: item.role || 'model',
            text: item.content || item.text || '',
            timestamp: item.created_at || item.timestamp
          }))
        )
      }
    } catch {
      // Keep current transcript if SQLite brain is warming up
    }
  }, [])

  // Subscribe to GeminiLiveService status & speaking events
  useEffect(() => {
    const unsubStatus = nexusService.subscribeStatus((status) => {
      setIsSystemActive(status.isConnected)
      setIsSystemRecovering(status.isRecovering)
      if (status.isConnected) {
        setIsSystemStarting(false)
      }
    })

    const handleUserSpeaking = (ev: Event) => {
      const detail = (ev as CustomEvent).detail || {}
      setIsUserSpeaking(Boolean(detail.speaking))
    }

    const handleHistoryUpdate = () => {
      void refreshHistory()
    }

    window.addEventListener('nexus-user-speaking', handleUserSpeaking)
    window.addEventListener('nexus-message-saved', handleHistoryUpdate)
    void refreshHistory()

    return () => {
      unsubStatus()
      window.removeEventListener('nexus-user-speaking', handleUserSpeaking)
      window.removeEventListener('nexus-message-saved', handleHistoryUpdate)
    }
  }, [refreshHistory])

  // Poll hardware status cleanly for dashboard meters
  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const info = await getSystemStatus()
        if (active && info) setSystemTelemetry(info)
      } catch {
        // Ignore outside Electron if Electron IPC is unavailable
      }
    }
    void poll()
    const timer = window.setInterval(poll, 3500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  // Electron IPC listeners (Update prompt, Dock setup, Mini mode)
  useEffect(() => {
    const ipc = (window as any)?.electron?.ipcRenderer
    if (!ipc?.on) return

    const onUpdateAvailable = (_e: any, info: UpdateInfo) => {
      setUpdateInfo(info)
      setShowUpdateModal(true)
    }
    const onShowDockSetup = () => setShowDockModal(true)
    const onMiniMode = (_e: any, mini: boolean) => setIsMiniMode(Boolean(mini))

    ipc.on('update-available', onUpdateAvailable)
    ipc.on('show-dock-setup', onShowDockSetup)
    ipc.on('mini-mode-toggled', onMiniMode)
    ipc.on('app:mini-mode', onMiniMode)

    return () => {
      ipc.removeListener?.('update-available', onUpdateAvailable)
      ipc.removeListener?.('show-dock-setup', onShowDockSetup)
      ipc.removeListener?.('mini-mode-toggled', onMiniMode)
      ipc.removeListener?.('app:mini-mode', onMiniMode)
    }
  }, [])

  // Clean up all active vision media tracks & interval
  const stopVision = useCallback(() => {
    if (frameTimerRef.current !== null) {
      window.clearInterval(frameTimerRef.current)
      frameTimerRef.current = null
    }
    if (primaryStreamRef.current) {
      primaryStreamRef.current.getTracks().forEach((t) => t.stop())
      primaryStreamRef.current = null
    }
    if (secondaryStreamRef.current) {
      secondaryStreamRef.current.getTracks().forEach((t) => t.stop())
      secondaryStreamRef.current = null
    }
    nexusService.detachScreenAudio()
    setActiveStream(null)
    setActiveCameraStream(null)
    setIsVideoOn(false)
    ipcFetch('/api/vision/stream', {
      method: 'POST',
      body: JSON.stringify({ source: 'none', active: false })
    }).catch(() => null)
  }, [])

  // Push 1 FPS optical frame to Gemini Live session when connected
  const startOpticalFrameLoop = useCallback((stream: MediaStream, sourceLabel: VisionMode) => {
    if (frameTimerRef.current !== null) {
      window.clearInterval(frameTimerRef.current)
      frameTimerRef.current = null
    }

    const hiddenVideo = document.createElement('video')
    hiddenVideo.muted = true
    hiddenVideo.playsInline = true
    hiddenVideo.srcObject = stream
    hiddenVideo.play().catch(() => null)

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    frameTimerRef.current = window.setInterval(() => {
      if (!ctx || hiddenVideo.readyState < 2 || hiddenVideo.videoWidth === 0) return
      const scale = Math.min(1, 960 / hiddenVideo.videoWidth)
      canvas.width = Math.max(160, Math.round(hiddenVideo.videoWidth * scale))
      canvas.height = Math.max(90, Math.round(hiddenVideo.videoHeight * scale))
      ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65)
      const b64 = dataUrl.split(',')[1]
      if (!b64) return

      if (nexusService.isConnected) {
        nexusService.sendVideoFrame(b64)
      }
      ipcFetch('/api/vision/stream', {
        method: 'POST',
        body: JSON.stringify({ source: sourceLabel, active: true, frame_b64: b64 })
      }).catch(() => null)
    }, 1000)
  }, [])

  const acquireCameraStream = useCallback(async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices?.getUserMedia) return null
    const videoConstraints = mediaDeviceManager.getVideoConstraints({
      width: { ideal: 1280 },
      height: { ideal: 720 }
    })
    return navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
  }, [])

  const acquireDisplayStream = useCallback(
    async (explicitSourceId?: string, shareAudio = false): Promise<MediaStream | null> => {
      if (!navigator.mediaDevices) return null
      const sourceId = explicitSourceId || (await getScreenSourceId().catch(() => null))
      if (sourceId && (window as any)?.electron) {
        const videoConstraint: any = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
        return navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: shareAudio
            ? ({
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: sourceId
                }
              } as any)
            : false
        })
      }
      if (navigator.mediaDevices.getDisplayMedia) {
        return navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: shareAudio
        })
      }
      return null
    },
    []
  )

  const startVisionWithSource = useCallback(
    async (modeInput: VisionMode, options: StartVisionOptions = {}) => {
      stopVision()
      try {
        const mode: VisionMode = options.dualCamera
          ? 'dual'
          : modeInput === 'camera'
          ? 'camera'
          : modeInput === 'dual'
          ? 'dual'
          : modeInput === 'tab'
          ? 'tab'
          : 'screen'
        setVisionMode(mode)

        if (mode === 'camera') {
          const cam = await acquireCameraStream()
          if (!cam) return
          primaryStreamRef.current = cam
          setActiveCameraStream(cam)
          setActiveStream(cam)
          setIsVideoOn(true)
          startOpticalFrameLoop(cam, 'camera')
          return
        }

        const display = await acquireDisplayStream(options.sourceId, Boolean(options.shareAudio))
        if (!display) return
        primaryStreamRef.current = display
        setActiveStream(display)

        display.getVideoTracks().forEach((track) => {
          track.onended = () => stopVision()
        })

        if (options.shareAudio) {
          nexusService.attachScreenAudio(display)
        }

        if (mode === 'dual') {
          const cam = await acquireCameraStream().catch(() => null)
          if (cam) {
            secondaryStreamRef.current = cam
            setActiveCameraStream(cam)
          }
        }

        setIsVideoOn(true)
        startOpticalFrameLoop(display, mode)
      } catch (err) {
        console.warn('[NexusRuntime] Vision acquisition canceled or failed:', err)
        stopVision()
      }
    },
    [acquireCameraStream, acquireDisplayStream, startOpticalFrameLoop, stopVision]
  )

  const quickStartCamera = useCallback(async () => {
    await startVisionWithSource('camera', { shareAudio: false })
  }, [startVisionWithSource])

  const quickStartScreen = useCallback(async () => {
    await startVisionWithSource('screen', { shareAudio: false })
  }, [startVisionWithSource])

  const openVisionPicker = useCallback(() => {
    if (isVideoOn) {
      stopVision()
    } else {
      setIsSourceModalOpen(true)
    }
  }, [isVideoOn, stopVision])

  const toggleSystem = useCallback(async () => {
    if (nexusService.isConnected) {
      nexusService.disconnect()
      setIsSystemActive(false)
      setIsSystemStarting(false)
      return
    }
    setIsSystemStarting(true)
    try {
      await nexusService.connect()
      if (isMicMuted) {
        nexusService.setMute(true)
      }
    } catch (err) {
      console.warn('[NexusRuntime] Core voice connect failed:', err)
      setIsSystemStarting(false)
    }
  }, [isMicMuted])

  const toggleMic = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev
      nexusService.setMute(next)
      return next
    })
  }, [])

  const sendPromptToCore = useCallback(
    async (prompt: string, intent: 'queue' | 'steer' = 'queue'): Promise<boolean> => {
      const clean = prompt.trim()
      if (!clean) return false

      if (nexusService.isConnected) {
        try {
          await nexusService.sendTextPrompt(clean, intent)
          void refreshHistory()
          return true
        } catch {
          // Fall through to gateway command router
        }
      }

      try {
        await saveMessage('user', clean)
        const res = await ipcFetch('/api/command', {
          method: 'POST',
          body: JSON.stringify({ prompt: clean, intent })
        })
        if (res.ok) {
          const data = await res.json()
          const reply =
            data?.result?.response ||
            data?.result?.text ||
            data?.response ||
            data?.message ||
            data?.status ||
            'Command dispatched.'
          await saveMessage('model', typeof reply === 'string' ? reply : JSON.stringify(reply))
          void refreshHistory()
          return true
        }
      } catch {
        // Logged via caller feedback
      }
      return false
    },
    [refreshHistory]
  )

  const triggerRefreshAll = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.allSettled([
        ipcFetch('/api/system/wal-checkpoint', { method: 'POST' }),
        ipcFetch('/api/telemetry'),
        refreshHistory(),
        getSystemStatus().then((s) => s && setSystemTelemetry(s))
      ])
      window.dispatchEvent(new CustomEvent('nexus-refresh-all'))
      window.dispatchEvent(new CustomEvent('nexus-theme-refresh'))
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 350)
    }
  }, [refreshHistory])

  const lockSession = useCallback(() => {
    if (!ipcSend('lock-screen') && !ipcInvoke('lock-session')) {
      window.location.hash = '#/lock'
    }
  }, [])

  useNexusShortcuts({
    onNavigateTab,
    toggleMic,
    toggleSystem,
    isMicMuted,
    isSystemActive,
    isVideoOn,
    onToggleVision: openVisionPicker
  })

  useEffect(() => {
    return () => {
      stopVision()
    }
  }, [stopVision])

  const value = useMemo<NexusRuntimeContextValue>(
    () => ({
      isSystemActive,
      isSystemStarting,
      isSystemRecovering,
      isMicMuted,
      isUserSpeaking,
      toggleSystem,
      toggleMic,
      sendPromptToCore,
      isVideoOn,
      visionMode,
      activeStream,
      activeCameraStream,
      isSourceModalOpen,
      setIsSourceModalOpen,
      openVisionPicker,
      startVisionWithSource,
      quickStartCamera,
      quickStartScreen,
      stopVision,
      systemTelemetry,
      isRefreshing,
      triggerRefreshAll,
      historyMessages,
      refreshHistory,
      isMiniMode,
      setIsMiniMode,
      lockSession,
      updateInfo,
      showUpdateModal,
      setShowUpdateModal,
      showDockModal,
      setShowDockModal,
      contextMenuPos,
      setContextMenuPos
    }),
    [
      isSystemActive,
      isSystemStarting,
      isSystemRecovering,
      isMicMuted,
      isUserSpeaking,
      toggleSystem,
      toggleMic,
      sendPromptToCore,
      isVideoOn,
      visionMode,
      activeStream,
      activeCameraStream,
      isSourceModalOpen,
      openVisionPicker,
      startVisionWithSource,
      quickStartCamera,
      quickStartScreen,
      stopVision,
      systemTelemetry,
      isRefreshing,
      triggerRefreshAll,
      historyMessages,
      refreshHistory,
      isMiniMode,
      lockSession,
      updateInfo,
      showUpdateModal,
      showDockModal,
      contextMenuPos
    ]
  )

  return <NexusRuntimeContext.Provider value={value}>{children}</NexusRuntimeContext.Provider>
}

export function useNexusRuntime(): NexusRuntimeContextValue {
  const ctx = useContext(NexusRuntimeContext)
  if (!ctx) {
    throw new Error('useNexusRuntime must be used inside <NexusRuntimeProvider>')
  }
  return ctx
}
