import { useEffect, useCallback, useRef, useState } from 'react'
import Sphere from '@renderer/components/Sphere'
import {
  RiCpuLine,
  RiCameraLine,
  RiTerminalBoxLine,
  RiSwapBoxLine,
  RiLayoutGridLine,
  RiMicLine,
  RiMicOffLine,
  RiPhoneFill,
  RiHistoryLine,
  RiPulseLine,
  RiWifiLine,
  RiServerLine,
  RiEarthLine,
  RiSendPlane2Line,
  RiGitBranchLine,
  RiAttachment2,
  RiMusic2Line,
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiSkipBackLine,
  RiSkipForwardLine,
  RiVolumeUpLine,
  RiFullscreenLine,
  RiFullscreenExitLine
} from 'react-icons/ri'
import { FaMemory } from 'react-icons/fa6'
import { GiTinker } from 'react-icons/gi'
import { HiComputerDesktop } from 'react-icons/hi2'
import * as faceapi from 'face-api.js'
import { VisionMode } from '@renderer/IndexRoot'
import { nexusService } from '@renderer/services/nexus-voice-ai'
import {
  DEFAULT_LIVE_GEMINI_MODEL,
  GEMINI_MODEL_OPTIONS,
  normalizeGeminiLiveModel
} from '@renderer/config/gemini-models'
import {
  controlMediaSession,
  getMediaSessions,
  MediaControlAction,
  MediaSessionItem
} from '@renderer/functions/media-control-api'
import CommandDeck from '@renderer/components/CommandDeck'

interface NexusProps {
  isSystemActive: boolean
  isSystemStarting: boolean
  toggleSystem: () => void | Promise<void>
  isMicMuted: boolean
  toggleMic: () => void
  isVideoOn: boolean
  visionMode: VisionMode
  startVision: (mode: 'camera' | 'screen' | 'dual', options?: any) => void
  stopVision: () => void
  activeStream: MediaStream | null
  activeCameraStream?: MediaStream | null
}

interface DashboardViewProps {
  props: NexusProps
  stats: any
  chatHistory: any[]
  onVisionClick: () => void
}

const glassPanel =
  'rounded-2xl border border-white/10 bg-zinc-950/55 backdrop-blur-xl'
const liveGeminiModelOptions = GEMINI_MODEL_OPTIONS.filter((model) => model.live)

const formatMediaTime = (milliseconds = 0) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0:00'
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

const getMediaAppLabel = (source = '') => {
  if (!source) return 'System Media'
  if (/spotify/i.test(source)) return 'Spotify'
  if (/chrome/i.test(source)) return 'Chrome'
  if (/edge/i.test(source)) return 'Edge'
  if (/vlc/i.test(source)) return 'VLC'
  return source
    .replace(/!.*$/, '')
    .split('.')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/_/g, ' ')
}

type QueuedCommand = {
  id: string
  text: string
  intent: 'queue' | 'steer'
  createdAt: string
}

export default function DashboardView({
  props,
  stats,
  chatHistory,
  onVisionClick
}: DashboardViewProps) {
  const {
    isSystemActive,
    isSystemStarting,
    isVideoOn,
    visionMode,
    startVision,
    activeStream,
    activeCameraStream,
    toggleMic,
    toggleSystem,
    isMicMuted
  } = props

  const scrollRef = useRef<HTMLDivElement>(null)
  const videoElementRef = useRef<HTMLVideoElement | null>(null)
  const pipVideoElementRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const faceScanInterval = useRef<NodeJS.Timeout | null>(null)

  const [modelsLoaded, setModelsLoaded] = useState(false)

  const [networkStats, setNetworkStats] = useState({ ping: 24, rate: 1.2, tx: 40, rx: 60 })
  const [commandText, setCommandText] = useState('')
  const [commandQueue, setCommandQueue] = useState<QueuedCommand[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('nexus_command_queue') || '[]')
    } catch {
      return []
    }
  })
  const [commandStatus, setCommandStatus] = useState('AI text command path is ready.')
  const [sharedFiles, setSharedFiles] = useState<File[]>([])
  const [mediaSessions, setMediaSessions] = useState<MediaSessionItem[]>([])
  const [mediaStatus, setMediaStatus] = useState('Scanning media transport.')
  const [selectedModel, setSelectedModel] = useState(
    normalizeGeminiLiveModel(localStorage.getItem('nexus_default_ai_model')) ||
      DEFAULT_LIVE_GEMINI_MODEL
  )
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [userAudioVolume, setUserAudioVolume] = useState(0)
  const [isScreenAudioActive, setIsScreenAudioActive] = useState(false)
  const [isFullScreen, setIsFullScreen] = useState(() => {
    try {
      return localStorage.getItem('nexus_voice_fullscreen') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('nexus_voice_fullscreen', String(isFullScreen))
    } catch {}
  }, [isFullScreen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable

      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false)
      } else if (
        (e.key === 'f' || e.key === 'F') &&
        !isInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        setIsFullScreen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullScreen])

  useEffect(() => {
    const handleSpeaking = (e: any) => {
      setIsUserSpeaking(Boolean(e.detail?.speaking))
      setUserAudioVolume(typeof e.detail?.volume === 'number' ? e.detail.volume : 0)
    }
    const handleScreenAudio = (e: any) => {
      setIsScreenAudioActive(Boolean(e.detail?.active))
    }
    window.addEventListener('nexus-user-speaking', handleSpeaking)
    window.addEventListener('nexus-screen-audio-changed', handleScreenAudio)
    return () => {
      window.removeEventListener('nexus-user-speaking', handleSpeaking)
      window.removeEventListener('nexus-screen-audio-changed', handleScreenAudio)
    }
  }, [])

  const activeMedia =
    mediaSessions.find((session) => session.status === 'Playing') ||
    mediaSessions.find((session) => session.isCurrent) ||
    mediaSessions[0] ||
    null

  const mediaProgress =
    activeMedia && activeMedia.durationMs > 0
      ? Math.min(100, Math.max(0, (activeMedia.positionMs / activeMedia.durationMs) * 100))
      : 0

  const refreshMediaSessions = useCallback(async () => {
    const sessions = await getMediaSessions()
    const visibleSessions = sessions.filter((session) => session.title || session.artist)
    setMediaSessions(visibleSessions)
    setMediaStatus(
      visibleSessions.length > 0 ? 'Media transport synced.' : 'No active media session.'
    )
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatHistory])

  useEffect(() => {
    localStorage.setItem('nexus_command_queue', JSON.stringify(commandQueue))
  }, [commandQueue])

  useEffect(() => {
    let cancelled = false

    const loadMediaSessions = async () => {
      const sessions = await getMediaSessions()
      if (cancelled) return
      const visibleSessions = sessions.filter((session) => session.title || session.artist)
      setMediaSessions(visibleSessions)
      setMediaStatus(
        visibleSessions.length > 0 ? 'Media transport synced.' : 'No active media session.'
      )
    }

    loadMediaSessions()
    const timer = setInterval(loadMediaSessions, 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!isSystemActive || commandQueue.length === 0) return

    const timer = setInterval(async () => {
      const next = commandQueue[0]
      if (!next || !nexusService.isConnected) return

      try {
        await nexusService.sendTextPrompt(next.text, next.intent)
        setCommandQueue((items) => items.slice(1))
        setCommandStatus(`${next.intent === 'steer' ? 'Steered' : 'Queued'} request sent.`)
      } catch {
        setCommandStatus('Queue is waiting for Nexus AI to come online.')
      }
    }, 1800)

    return () => clearInterval(timer)
  }, [isSystemActive, commandQueue])

  useEffect(() => {
    if (!isSystemActive) {
      setNetworkStats({ ping: 0, rate: 0.0, tx: 0, rx: 0 })
      return
    }

    const interval = setInterval(() => {
      setNetworkStats({
        ping: Math.floor(Math.random() * (45 - 12 + 1)) + 12,
        rate: +(Math.random() * 8.5 + 0.5).toFixed(2),
        tx: Math.floor(Math.random() * 100),
        rx: Math.floor(Math.random() * 100)
      })
    }, 1700)

    return () => clearInterval(interval)
  }, [isSystemActive])

  useEffect(() => {
    if (!isVideoOn || visionMode !== 'camera' || modelsLoaded) return
    const loadModels = async () => {
      try {
        const MODEL_URL = './models'
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL)
        ])
        setModelsLoaded(true)
      } catch (e) {}
    }
    loadModels()
  }, [isVideoOn, visionMode, modelsLoaded])

  useEffect(() => {
    if (
      isVideoOn &&
      visionMode === 'camera' &&
      modelsLoaded &&
      videoElementRef.current &&
      canvasRef.current
    ) {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)

      faceScanInterval.current = setInterval(async () => {
        const video = videoElementRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState !== 4 || video.videoWidth === 0) return

        try {
          const vw = video.videoWidth
          const vh = video.videoHeight

          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw
            canvas.height = vh
          }

          const ctx = canvas.getContext('2d')
          if (!ctx) return

          const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
          const detection = await faceapi
            .detectSingleFace(video, options)
            .withFaceExpressions()
            .withAgeAndGender()

          ctx.clearRect(0, 0, vw, vh)

          if (detection) {
            const { x, y, width, height } = detection.detection.box

            const mirroredX = vw - x - width

            ctx.strokeStyle = '#34d399'
            ctx.lineWidth = 4
            const l = 25

            ctx.beginPath()
            ctx.moveTo(mirroredX, y + l)
            ctx.lineTo(mirroredX, y)
            ctx.lineTo(mirroredX + l, y)
            ctx.moveTo(mirroredX + width - l, y)
            ctx.lineTo(mirroredX + width, y)
            ctx.lineTo(mirroredX + width, y + l)
            ctx.moveTo(mirroredX, y + height - l)
            ctx.lineTo(mirroredX, y + height)
            ctx.lineTo(mirroredX + l, y + height)
            ctx.moveTo(mirroredX + width - l, y + height)
            ctx.lineTo(mirroredX + width, y + height)
            ctx.lineTo(mirroredX + width, y + height - l)
            ctx.stroke()

            const expressions = detection.expressions
            const domExp = Object.keys(expressions).reduce((a, b) =>
              expressions[a] > expressions[b] ? a : b
            )
            const gender = detection.gender === 'male' ? 'M' : 'F'
            const age = Math.round(detection.age)
            const labelText = ` ID:${gender} | AGE:${age} | ${domExp.toUpperCase()} `

            ctx.fillStyle = 'rgba(10, 10, 10, 0.85)'
            ctx.fillRect(mirroredX, y - 32, width, 26)

            ctx.fillStyle = '#34d399'
            ctx.font = 'bold 16px monospace'
            ctx.fillText(labelText, mirroredX + 5, y - 14)
          } else {
            ctx.fillStyle = 'rgba(52, 211, 153, 0.8)'
            ctx.font = 'bold 14px monospace'
            ctx.fillText('SCANNING OPTICS...', 20, 30)
          }
        } catch (e) {}
      }, 250)
    } else {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
    }

    return () => {
      if (faceScanInterval.current) clearInterval(faceScanInterval.current)
    }
  }, [isVideoOn, visionMode, modelsLoaded])

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoElementRef.current = node
      if (node && activeStream && isVideoOn) {
        node.srcObject = activeStream
        node.onloadedmetadata = () => node.play().catch(() => {})
      }
    },
    [activeStream, isVideoOn, visionMode]
  )

  const setPipVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      pipVideoElementRef.current = node
      if (node && activeCameraStream && isVideoOn) {
        node.srcObject = activeCameraStream
        node.onloadedmetadata = () => node.play().catch(() => {})
      }
    },
    [activeCameraStream, isVideoOn, visionMode]
  )

  const setMobileVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      if (node && activeStream && isVideoOn) {
        node.srcObject = activeStream
        node.onloadedmetadata = () => node.play().catch(() => {})
      }
    },
    [activeStream, isVideoOn, visionMode]
  )

  const toggleSource = () => {
    if (!isSystemActive) return
    const nextMode = visionMode === 'camera' ? 'screen' : 'camera'
    startVision(nextMode)
  }

  const handleMediaAction = async (action: MediaControlAction) => {
    if (!activeMedia) return
    setMediaStatus(`${action} command sent.`)
    const result = await controlMediaSession(activeMedia.index, action)
    setMediaStatus(result.success ? 'Media command acknowledged.' : result.error || 'Media failed.')
    await refreshMediaSessions()
  }

  const readSharedFiles = async () => {
    if (sharedFiles.length === 0) return ''

    const fileBlocks = await Promise.all(
      sharedFiles.slice(0, 5).map(async (file) => {
        const text = await file.text()
        const clipped = text.length > 18000 ? `${text.slice(0, 18000)}\n[TRUNCATED]` : text
        return `\n\n--- FILE: ${file.name} (${Math.round(file.size / 1024)} KB) ---\n${clipped}`
      })
    )

    return `\n\nUse these shared files as context for the answer:${fileBlocks.join('')}`
  }

  const submitTextCommand = async (intent: 'queue' | 'steer', overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : commandText).trim()
    if (!text && sharedFiles.length === 0) return

    const sharedContext = await readSharedFiles()
    const finalText = `${text || 'Read the shared files and summarize what matters.'}${sharedContext}`

    if (/\b(whiteboard|board|draw|diagram|annotate|solve on board)\b/i.test(finalText)) {
      localStorage.setItem(
        'nexus_whiteboard_request',
        JSON.stringify({ prompt: finalText, createdAt: Date.now() })
      )
      window.dispatchEvent(new CustomEvent('nexus-whiteboard-request', { detail: finalText }))
      setCommandStatus('Whiteboard request sent to the annotation board.')
    }

    if (intent === 'steer' && isSystemActive && nexusService.isConnected) {
      try {
        await nexusService.sendTextPrompt(finalText, 'steer')
        if (overrideText === undefined) setCommandText('')
        setSharedFiles([])
        setCommandStatus('Steer command sent into the live AI response.')
        return
      } catch {}
    }

    setCommandQueue((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        text: finalText,
        intent,
        createdAt: new Date().toLocaleTimeString()
      }
    ])
    if (overrideText === undefined) setCommandText('')
    setSharedFiles([])
    setCommandStatus(
      intent === 'steer'
        ? 'Steer command queued until Nexus AI is online.'
        : 'Request added to the AI queue.'
    )
  }

  const systemMetrics = [
    {
      icon: <RiCpuLine />,
      label: 'CPU LOAD',
      val: isSystemActive && stats ? `${stats.cpu}%` : '--',
      raw: isSystemActive && stats ? stats.cpu : 0,
      colorClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/85'
    },
    {
      icon: <FaMemory />,
      label: 'RAM USAGE',
      val: isSystemActive && stats ? `${stats.memory.usedPercentage}%` : '--',
      raw: isSystemActive && stats ? stats.memory.usedPercentage : 0,
      colorClass: 'text-cyan-400',
      bgClass: 'bg-cyan-500/85'
    },
    {
      icon: <GiTinker />,
      label: 'TEMP',
      val: isSystemActive && stats ? `${stats.temperature}°C` : '--',
      raw: isSystemActive && stats ? Math.min((stats.temperature / 90) * 100, 100) : 0,
      colorClass: 'text-orange-400',
      bgClass: 'bg-orange-500/85'
    },
    {
      icon: <HiComputerDesktop />,
      label: 'OS',
      val: isSystemActive && stats ? `${stats.os.type}` : '--',
      raw: 0,
      colorClass: 'text-purple-400',
      bgClass: 'bg-purple-500/85',
      hideBar: true
    }
  ]

  return (
    <div className="flex-1 min-h-0 p-4 lg:p-5 bg-white/[0.015] grid grid-cols-12 gap-4 lg:gap-5 h-full overflow-hidden relative animate-in fade-in zoom-in duration-300 w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => setSharedFiles(Array.from(event.target.files || []))}
      />
      <div
        className={`hidden lg:flex ${
          isFullScreen ? 'col-span-12 lg:col-span-4 xl:col-span-3' : 'col-span-3'
        } min-h-0 flex-col gap-4 overflow-y-auto pr-1 pb-6 z-40 scrollbar-small transition-all duration-300`}
      >
        <div
          className={`${glassPanel} h-[208px] shrink-0 flex flex-col p-1.5 overflow-hidden relative group`}
        >
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/75 px-2.5 py-1 backdrop-blur-md">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVideoOn
                  ? visionMode === 'dual'
                    ? 'bg-cyan-400 animate-pulse'
                    : 'bg-red-500 animate-pulse'
                  : 'bg-zinc-600'
              }`}
            />
            <span
              className={`text-[9px] font-bold tracking-widest ${
                isVideoOn
                  ? visionMode === 'dual'
                    ? 'text-cyan-300'
                    : 'text-red-300'
                  : 'text-zinc-500'
              }`}
            >
              {isVideoOn
                ? visionMode === 'dual'
                  ? 'DUAL FEED (SCREEN + CAM)'
                  : visionMode === 'screen'
                    ? 'SCREEN FEED'
                    : 'OPTICAL FEED'
                : 'OPTICS OFFLINE'}
            </span>
            {isVideoOn && isScreenAudioActive && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[8px] font-mono font-bold">
                <RiVolumeUpLine size={10} /> AUDIO
              </span>
            )}
          </div>

          {isVideoOn && (
            <button
              onClick={onVisionClick}
              className="absolute top-2.5 right-2.5 z-30 p-1.5 rounded-lg bg-zinc-950/75 text-emerald-300 border border-white/10 hover:border-emerald-400/40 hover:bg-emerald-500 hover:text-black transition-all cursor-pointer backdrop-blur-md"
              title="Change capture source or mode"
            >
              <RiSwapBoxLine size={14} />
            </button>
          )}

          <div
            className={`w-full h-full rounded-xl overflow-hidden bg-black/30 relative border border-white/5 transition-opacity ${isVideoOn ? 'opacity-100' : 'opacity-40'}`}
          >
            <video
              key={visionMode}
              ref={setVideoRef}
              className={`absolute inset-0 w-full h-full object-cover ${visionMode === 'camera' ? '-scale-x-100' : ''}`}
              autoPlay
              playsInline
              muted
            />

            {/* Picture-In-Picture Webcam overlay for Dual Vision Mode */}
            {visionMode === 'dual' && activeCameraStream && (
              <div className="absolute bottom-2 right-2 w-28 h-20 rounded-lg overflow-hidden border border-cyan-400/50 shadow-lg shadow-black/50 bg-black/85 z-25 group">
                <video
                  ref={setPipVideoRef}
                  className="w-full h-full object-cover -scale-x-100"
                  autoPlay
                  playsInline
                  muted
                />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[7px] font-mono font-bold text-cyan-300 border border-cyan-400/30">
                  WEBCAM PIP
                </div>
              </div>
            )}

            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none z-20"
            />

            {!isVideoOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
                <RiCameraLine size={22} />
                <span className="text-[9px] font-mono tracking-widest">NO SIGNAL</span>
              </div>
            )}
          </div>
        </div>

        <div className={`${glassPanel} shrink-0 p-4 flex flex-col gap-3`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-[10px] font-bold tracking-widest text-zinc-400 flex items-center gap-1.5">
              <RiPulseLine className={isSystemActive ? 'text-emerald-400' : 'text-zinc-500'} />
              NETWORK TELEMETRY
            </span>
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-semibold border ${isSystemActive ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-500 border-white/10 bg-white/[0.03]'}`}
            >
              {isSystemActive ? 'SECURE UPLINK' : 'STANDBY'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-zinc-500 font-mono tracking-wider">WSS LATENCY</span>
              <span className="text-xs font-semibold text-zinc-100 font-mono flex items-center gap-1.5">
                <RiWifiLine className={isSystemActive ? 'text-emerald-400' : 'text-zinc-600'} />
                {isSystemActive ? `${networkStats.ping}ms` : '--'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-zinc-500 font-mono tracking-wider">PACKET RATE</span>
              <span className="text-xs font-semibold text-zinc-100 font-mono">
                {isSystemActive ? `${networkStats.rate} MB/s` : '--'}
              </span>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-zinc-500 font-mono tracking-wider">ROUTING</span>
              <span className="text-xs font-semibold text-zinc-100 font-mono flex items-center gap-1.5">
                {isSystemActive ? 'GLOBAL' : 'LOCAL'}
                {isSystemActive ? (
                  <RiEarthLine className="text-cyan-400" />
                ) : (
                  <RiServerLine className="text-zinc-500" />
                )}
              </span>
            </div>
          </div>

          <div className="w-full flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-zinc-500 w-4">TX</span>
              <div className="flex-1 h-1 bg-black/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500/90 transition-all duration-300 ease-out"
                  style={{ width: `${isSystemActive ? networkStats.tx : 0}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-zinc-500 w-4">RX</span>
              <div className="flex-1 h-1 bg-black/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500/90 transition-all duration-300 ease-out delay-75"
                  style={{ width: `${isSystemActive ? networkStats.rx : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className={`${glassPanel} shrink-0 p-4 flex flex-col gap-3`}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold tracking-widest text-zinc-400">
              <RiMusic2Line
                className={activeMedia?.status === 'Playing' ? 'text-cyan-300' : 'text-zinc-500'}
              />
              NOW PLAYING
            </span>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-mono font-semibold uppercase ${activeMedia?.status === 'Playing' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}
            >
              {activeMedia?.status || 'IDLE'}
            </span>
          </div>

          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-zinc-100">
              {activeMedia?.title || 'No media detected'}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <span className="truncate">
                {activeMedia
                  ? activeMedia.artist ||
                    activeMedia.albumTitle ||
                    getMediaAppLabel(activeMedia.source)
                  : mediaStatus}
              </span>
              <span className="shrink-0 text-cyan-300/80">
                {activeMedia ? getMediaAppLabel(activeMedia.source) : '--'}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className="h-1 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full bg-cyan-300/90 transition-all duration-500"
                style={{ width: `${activeMedia ? mediaProgress : 0}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] font-mono text-zinc-500">
              <span>{formatMediaTime(activeMedia?.positionMs || 0)}</span>
              <span>{formatMediaTime(activeMedia?.durationMs || 0)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleMediaAction('previous')}
              disabled={!activeMedia?.canPrevious}
              className="flex h-8 min-w-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-35 cursor-pointer"
              title="Previous media"
              aria-label="Previous media"
            >
              <RiSkipBackLine />
            </button>
            <button
              onClick={() => handleMediaAction('toggle')}
              disabled={!activeMedia}
              className="flex h-8 min-w-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 transition hover:bg-cyan-300 hover:text-black disabled:opacity-35 cursor-pointer"
              title="Play or pause media"
              aria-label="Play or pause media"
            >
              {activeMedia?.status === 'Playing' ? <RiPauseCircleLine /> : <RiPlayCircleLine />}
            </button>
            <button
              onClick={() => handleMediaAction('next')}
              disabled={!activeMedia?.canNext}
              className="flex h-8 min-w-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-35 cursor-pointer"
              title="Next media"
              aria-label="Next media"
            >
              <RiSkipForwardLine />
            </button>
          </div>
        </div>

        <div className={`${glassPanel} shrink-0 p-4 flex flex-col gap-3`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-[10px] font-bold tracking-widest text-zinc-400 flex items-center gap-1.5">
              <RiLayoutGridLine /> CORE METRICS
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {systemMetrics.map((m, i) => (
              <div
                key={i}
                className="rounded-xl p-3 flex flex-col justify-between gap-2 border border-white/10 bg-white/[0.03] hover:border-white/20 transition-colors"
              >
                <div className="flex justify-between items-center text-zinc-400">
                  <span className={`text-base ${m.colorClass}`}>{m.icon}</span>
                  <span className="text-[9px] font-mono tracking-wider uppercase text-zinc-400">
                    {m.label}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-100 text-right font-mono tracking-wide">
                    {m.val}
                  </span>

                  {!m.hideBar && (
                    <div className="w-full h-1 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${m.bgClass} transition-all duration-700 ease-out`}
                        style={{ width: isSystemActive ? `${m.raw}%` : '0%' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`col-span-12 ${
          isFullScreen ? 'lg:col-span-8 xl:col-span-9' : 'lg:col-span-6'
        } relative isolate flex min-h-0 flex-col items-center justify-between overflow-y-auto overflow-x-hidden pb-2 scrollbar-small transition-all duration-300`}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <div
            className={`absolute left-1/2 top-[42%] ${
              isFullScreen ? 'h-[min(68vh,660px)] w-[min(68vh,660px)]' : 'h-[min(56vh,520px)] w-[min(56vh,520px)]'
            } -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#10b98118_0%,#06b6d410_38%,transparent_70%)] blur-3xl transition-all duration-700`}
          />
          <div
            className={`nexus-core-grid absolute left-1/2 top-[42%] ${
              isFullScreen ? 'h-[min(72vh,700px)] w-[min(72vh,700px)]' : 'h-[min(60vh,560px)] w-[min(60vh,560px)]'
            } -translate-x-1/2 -translate-y-1/2 opacity-25 transition-all duration-700`}
          />
        </div>

        {/* Voice Agent Fullscreen Mode Toggle Button */}
        <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
          <button
            onClick={() => setIsFullScreen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border backdrop-blur-xl text-[9px] font-mono uppercase tracking-wider transition-all cursor-pointer group ${
              isFullScreen
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                : 'border-white/10 bg-zinc-950/70 text-zinc-400 hover:border-emerald-400/40 hover:text-emerald-300'
            }`}
            title={isFullScreen ? 'Exit Full Screen Mode (Esc or F)' : 'Enter Full Screen Voice Mode (F)'}
          >
            {isFullScreen ? (
              <>
                <RiFullscreenExitLine size={13} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <RiFullscreenLine size={13} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
        </div>

        <div
          className={`lg:hidden absolute top-12 right-4 w-32 h-24 ${glassPanel} z-50 overflow-hidden ${isVideoOn ? 'block' : 'hidden'}`}
        >
          <video
            ref={setMobileVideoRef}
            className={`w-full h-full object-cover ${visionMode === 'camera' ? '-scale-x-100' : ''}`}
            autoPlay
            playsInline
            muted
          />
        </div>

        <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center px-2">
          <div
            className={`group/core relative flex aspect-square ${
              isFullScreen
                ? 'h-[min(65vh,640px)] min-h-[340px] max-h-[640px] w-full max-w-[640px]'
                : 'h-[min(54vh,500px)] min-h-[280px] max-h-[500px] w-full max-w-[500px]'
            } items-center justify-center transition-all duration-700 ${
              isSystemActive || isSystemStarting ? 'opacity-100 scale-100' : 'opacity-85 scale-95 grayscale'
            }`}
          >
            <div className="absolute inset-0 rounded-full border border-emerald-300/10 bg-[radial-gradient(circle,#031915_0%,#020807_48%,transparent_68%)]" />
            {isUserSpeaking && !isMicMuted && (
              <>
                <div className="pointer-events-none absolute inset-[-6%] animate-ping rounded-full border border-cyan-400/30 opacity-35 duration-1000" />
                <div className="pointer-events-none absolute inset-[-12%] animate-pulse rounded-full border border-cyan-300/20" />
              </>
            )}
            <div className="absolute inset-[5%] rounded-full border border-emerald-300/10 animate-[nexus-orbit_18s_linear_infinite]" />
            <div className="absolute inset-[13%] rounded-full border border-cyan-300/8 animate-[nexus-orbit-reverse_26s_linear_infinite]" />

            <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-zinc-950/70 px-4 py-1.5 text-center backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[0.26em] text-emerald-200">
                Nexus Core
              </div>
              <div className="mt-0.5 text-[8px] font-mono uppercase tracking-widest text-zinc-400">
                {isSystemStarting ? 'BOOTING' : isSystemActive ? 'ONLINE' : 'STANDBY'}
              </div>
            </div>

            <div className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-start gap-1 sm:flex">
              <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">
                Vision
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${
                  isVideoOn
                    ? visionMode === 'dual'
                      ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200'
                      : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200'
                    : 'border-white/10 bg-white/[0.04] text-zinc-500'
                }`}
              >
                {isVideoOn ? (visionMode === 'dual' ? 'Dual' : visionMode) : 'Off'}
              </span>
            </div>

            <div className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-1 sm:flex">
              <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500">
                Voice
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest transition-all ${
                  isMicMuted
                    ? 'border-red-300/25 bg-red-500/10 text-red-300'
                    : isUserSpeaking
                      ? 'border-cyan-400/50 bg-cyan-400/20 text-cyan-200 flex items-center gap-1.5'
                      : 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200'
                }`}
              >
                {isMicMuted ? (
                  'Muted'
                ) : isUserSpeaking ? (
                  <>
                    <span className="flex items-center gap-0.5">
                      <span className="h-2 w-0.5 animate-pulse rounded-full bg-cyan-300" />
                      <span className="h-3 w-0.5 animate-pulse rounded-full bg-cyan-100 delay-75" />
                      <span className="h-1.5 w-0.5 animate-pulse rounded-full bg-cyan-300 delay-150" />
                    </span>
                    <span>Speaking</span>
                  </>
                ) : (
                  'Live'
                )}
              </span>
            </div>

            <div
              className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider backdrop-blur-md transition-all ${
                isUserSpeaking && !isMicMuted
                  ? 'border-cyan-400/40 bg-zinc-950/80 text-cyan-200'
                  : 'border-white/10 bg-zinc-950/65 text-zinc-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  isUserSpeaking && !isMicMuted
                    ? 'bg-cyan-300 animate-ping'
                    : 'bg-emerald-400'
                }`}
              />
              {isUserSpeaking && !isMicMuted ? 'User Voice Uplink Active' : 'Neural lattice synced'}
            </div>

            <div className="relative h-[78%] w-[78%] overflow-hidden rounded-full">
              <Sphere />
            </div>
          </div>
        </div>

        {isFullScreen ? (
          /* FULLSCREEN MODE: Translucent command bar with voice/vision controls */
          <div className="relative z-50 w-full max-w-2xl xl:max-w-3xl shrink-0 px-2 sm:px-4 mb-2 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className={`${glassPanel} p-3 flex flex-col gap-2.5`}>
              {/* Translucent Buttons Row */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={onVisionClick}
                  className={`flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    isVideoOn
                      ? visionMode === 'dual'
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                        : 'border-red-400/35 bg-red-500/15 text-red-300'
                      : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                  }`}
                  title="Vision source"
                >
                  {isVideoOn ? <RiSwapBoxLine size={18} /> : <RiCameraLine size={18} />}
                  <span>
                    {isVideoOn ? (visionMode === 'dual' ? 'Dual' : 'Vision') : 'Vision'}
                  </span>
                </button>

                <button
                  onClick={toggleSystem}
                  className={`relative flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    isSystemStarting
                      ? 'border-amber-400/45 bg-amber-400/15 text-amber-200'
                      : isSystemActive
                        ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                        : 'border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                  }`}
                  title="Core status"
                >
                  <RiPhoneFill
                    size={18}
                    className={isSystemActive || isSystemStarting ? 'animate-pulse' : ''}
                  />
                  <span>{isSystemStarting ? 'Booting' : isSystemActive ? 'Online' : 'Core'}</span>
                  {isSystemActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </button>

                <button
                  onClick={toggleMic}
                  className={`flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    isMicMuted
                      ? 'border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                      : isUserSpeaking
                        ? 'border-cyan-400/60 bg-cyan-500/25 text-cyan-100'
                        : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  }`}
                  title="Voice status"
                >
                  {isMicMuted ? (
                    <RiMicOffLine size={18} />
                  ) : (
                    <RiMicLine
                      size={18}
                      className={isUserSpeaking ? 'text-cyan-300 animate-bounce' : ''}
                    />
                  )}
                  <span>
                    {isMicMuted ? 'Muted' : isUserSpeaking ? 'Speaking' : 'Voice'}
                  </span>
                  {isUserSpeaking && !isMicMuted && (
                    <span className="flex items-center gap-0.5 ml-0.5">
                      <span className="h-2 w-0.5 rounded-full bg-cyan-300 animate-pulse" />
                      <span className="h-3.5 w-0.5 rounded-full bg-cyan-100 animate-pulse delay-75" />
                      <span className="h-2 w-0.5 rounded-full bg-cyan-300 animate-pulse delay-150" />
                    </span>
                  )}
                </button>
              </div>

              {/* Translucent Text Box with controls */}
              <div className="flex items-center gap-2 w-full">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`h-11 w-11 shrink-0 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                    sharedFiles.length > 0
                      ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-emerald-400/40 hover:text-emerald-300 hover:bg-white/[0.08]'
                  }`}
                  title="Share files with AI"
                >
                  <RiAttachment2 size={18} />
                </button>

                <select
                  value={selectedModel}
                  onChange={(event) => {
                    const nextModel = normalizeGeminiLiveModel(event.target.value)
                    setSelectedModel(nextModel)
                    nexusService.setModel(nextModel)
                  }}
                  className="h-11 max-w-36 sm:max-w-44 shrink-0 rounded-xl border border-white/10 bg-zinc-950/70 px-2.5 text-[10px] font-mono text-zinc-300 outline-none focus:border-emerald-400/50"
                  title="AI model"
                >
                  {liveGeminiModelOptions.map((model) => (
                    <option key={model.id} className="bg-zinc-950 text-zinc-200" value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>

                <input
                  value={commandText}
                  onChange={(event) => setCommandText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      submitTextCommand('queue')
                    }
                  }}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-mono text-emerald-50 placeholder:text-zinc-500 outline-none focus:border-emerald-400/50 focus:bg-white/[0.07] transition-all"
                  placeholder="Enter AI command or steer..."
                />

                <button
                  onClick={() => submitTextCommand('steer')}
                  className="h-11 w-11 shrink-0 rounded-xl border border-cyan-400/30 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 hover:border-cyan-400/50 flex items-center justify-center transition-all cursor-pointer"
                  title="Steer live response immediately"
                >
                  <RiGitBranchLine size={18} />
                </button>

                <button
                  onClick={() => submitTextCommand('queue')}
                  className="h-11 px-4 shrink-0 rounded-xl border border-emerald-400/40 bg-emerald-500/20 hover:bg-emerald-400 hover:text-black text-emerald-200 font-mono text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Send command"
                >
                  <RiSendPlane2Line size={16} />
                  <span className="hidden sm:inline">SEND</span>
                </button>
              </div>

              {/* Minimalist Status Bar */}
              <div className="flex items-center justify-between px-1 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                <span className="truncate flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {sharedFiles.length > 0
                    ? `${sharedFiles.length} file(s) ready for AI read`
                    : commandStatus}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {commandQueue.length > 0 && (
                    <span className="text-emerald-400/80 font-bold">{commandQueue.length} queued</span>
                  )}
                  <button
                    onClick={() => setIsFullScreen(false)}
                    className="text-zinc-500 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Exit Fullscreen (Esc)"
                  >
                    <RiFullscreenExitLine size={11} />
                    <span>Exit (Esc)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* NORMAL MODE: Clean Voice/Vision status strip + CommandDeck */
          <div className="relative z-50 w-full max-w-[700px] mx-auto shrink-0">
            <div className="flex flex-col gap-2">
              <div className="px-6">
                <div className={`${glassPanel} grid grid-cols-3 gap-2 p-2`}>
                  <button
                    onClick={onVisionClick}
                    className={`flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      isVideoOn
                        ? visionMode === 'dual'
                          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                          : 'border-red-400/35 bg-red-500/15 text-red-300'
                        : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-200'
                    }`}
                    title="Vision source"
                  >
                    {isVideoOn ? <RiSwapBoxLine size={18} /> : <RiCameraLine size={18} />}
                    <span className="hidden sm:inline">
                      {isVideoOn ? (visionMode === 'dual' ? 'Dual' : 'Vision') : 'Vision'}
                    </span>
                  </button>
                  <button
                    onClick={toggleSystem}
                    className={`relative flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${isSystemStarting ? 'border-amber-300/45 bg-amber-400/15 text-amber-100' : isSystemActive ? 'border-emerald-300/40 bg-emerald-400 text-black' : 'border-red-400/35 bg-red-500/10 text-red-300 hover:bg-red-500/20'}`}
                    title="Core"
                  >
                    <RiPhoneFill
                      size={19}
                      className={isSystemActive || isSystemStarting ? 'animate-pulse' : ''}
                    />
                    <span>{isSystemStarting ? 'Booting' : isSystemActive ? 'Online' : 'Core'}</span>
                  </button>
                  <button
                    onClick={toggleMic}
                    className={`flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      isMicMuted
                        ? 'border-red-400/30 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                        : isUserSpeaking
                          ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-200'
                          : 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/45'
                    }`}
                    title="Voice"
                  >
                    {isMicMuted ? (
                      <RiMicOffLine size={18} />
                    ) : (
                      <RiMicLine
                        size={18}
                        className={isUserSpeaking ? 'text-cyan-300 animate-bounce' : ''}
                      />
                    )}
                    <span className="hidden sm:inline">
                      {isMicMuted ? 'Muted' : isUserSpeaking ? 'Speaking' : 'Voice'}
                    </span>
                    {isUserSpeaking && !isMicMuted && (
                      <span className="hidden sm:flex items-center gap-0.5 ml-0.5">
                        <span className="h-2 w-0.5 rounded-full bg-cyan-300 animate-pulse" />
                        <span className="h-3.5 w-0.5 rounded-full bg-cyan-100 animate-pulse delay-75" />
                        <span className="h-2 w-0.5 rounded-full bg-cyan-300 animate-pulse delay-150" />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <CommandDeck
                isSystemActive={isSystemActive}
                isMicMuted={isMicMuted}
                isVideoOn={isVideoOn}
                visionMode={visionMode}
                onToggleVoice={toggleSystem}
                onToggleVision={onVisionClick}
                onToggleCamera={() => {
                  if (isVideoOn && visionMode === 'camera') props.stopVision()
                  else props.startVision('camera')
                }}
                onSubmitPrompt={async (prompt, routeAgent) => {
                  if (routeAgent) {
                    await submitTextCommand('steer', prompt)
                  } else {
                    await submitTextCommand('queue', prompt)
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {!isFullScreen && (
        <div className="hidden lg:flex col-span-3 min-h-0 flex-col overflow-hidden h-full z-40">
          <div className={`${glassPanel} h-full p-4 lg:p-5 flex flex-col`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <span className="text-[10px] font-bold tracking-widest text-zinc-400 flex items-center gap-1.5">
                <RiTerminalBoxLine /> TRANSCRIPT
              </span>
              <span className="text-[9px] font-mono text-emerald-400/70">LIVE-LOG</span>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1.5 pb-6 scrollbar-small">
              {chatHistory.filter((msg) => {
                const text = msg.parts && msg.parts[0] ? msg.parts[0].text : msg.content || ''
                return text && !/<(?:no[- ]speech|silence|applause|music|laughter|\|nospeech\|)>/i.test(text) && text.trim().length > 0
              }).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2 opacity-60">
                  <RiHistoryLine size={24} />
                  <span className="text-[10px] tracking-widest uppercase font-mono">
                    No Data Stream
                  </span>
                </div>
              ) : (
                chatHistory
                  .filter((msg) => {
                    const text = msg.parts && msg.parts[0] ? msg.parts[0].text : msg.content || ''
                    return text && !/<(?:no[- ]speech|silence|applause|music|laughter|\|nospeech\|)>/i.test(text) && text.trim().length > 0
                  })
                  .map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[95%] py-2.5 px-3 rounded-xl text-xs leading-relaxed border font-mono ${msg.role === 'user' ? 'bg-emerald-950/35 border-emerald-500/20 text-emerald-100 rounded-br-none' : 'bg-white/[0.03] border-white/10 text-zinc-300 rounded-bl-none'}`}
                      >
                        {msg.parts && msg.parts[0] ? msg.parts[0].text : msg.content}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
