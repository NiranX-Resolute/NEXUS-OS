import React, { useRef, useEffect, useState } from 'react'
import {
  RiMicLine,
  RiVolumeUpLine,
  RiCameraLine,
  RiRefreshLine,
  RiCheckLine,
  RiPlayFill,
  RiStopFill,
  RiShieldCheckLine,
  RiEqualizerLine,
  RiVidiconLine,
  RiSmartphoneLine,
  RiFileCopyLine
} from 'react-icons/ri'
import { useMediaDevices } from '../hooks/useMediaDevices'

export interface MediaDeviceSettingsProps {
  cardClass?: string
  titleClass?: string
  compact?: boolean
}

export const MediaDeviceSettings: React.FC<MediaDeviceSettingsProps> = ({
  cardClass = 'bg-[#0a0a0c] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl',
  titleClass = 'text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2',
  compact = false
}) => {
  const {
    audioInputs,
    audioOutputs,
    videoInputs,
    selectedAudioInputId,
    selectedAudioOutputId,
    selectedVideoInputId,
    selectAudioInput,
    selectAudioOutput,
    selectVideoInput,
    refreshDevices,
    requestPermissions,
    testAudioOutput,
    isTestingMic,
    micLevel,
    startMicTest,
    stopMicTest,
    isCameraActive,
    cameraPreviewStream,
    startCameraPreview,
    stopCameraPreview
  } = useMediaDevices()

  const videoRef = useRef<HTMLVideoElement>(null)

  const [qrPairing, setQrPairing] = useState<{
    pairingUrl: string
    qrBase64: string
    token: string
    loading: boolean
    error: string | null
    copied: boolean
  }>({
    pairingUrl: '',
    qrBase64: '',
    token: '',
    loading: true,
    error: null,
    copied: false
  })

  const fetchQrPairing = async () => {
    setQrPairing((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/remote/qr-pairing?format=json')
      if (resp.ok) {
        const data = await resp.json()
        setQrPairing({
          pairingUrl: data.pairing_url || '',
          qrBase64: data.qr_base64 || '',
          token: data.token || '',
          loading: false,
          error: null,
          copied: false
        })
      } else {
        setQrPairing((prev) => ({ ...prev, loading: false, error: `IPC status ${resp.status}` }))
      }
    } catch (err: any) {
      setQrPairing((prev) => ({ ...prev, loading: false, error: err.message || 'Offline' }))
    }
  }

  const handleCopyPairingUrl = () => {
    if (qrPairing.pairingUrl) {
      navigator.clipboard.writeText(qrPairing.pairingUrl)
      setQrPairing((prev) => ({ ...prev, copied: true }))
      setTimeout(() => setQrPairing((prev) => ({ ...prev, copied: false })), 2000)
    }
  }

  useEffect(() => {
    fetchQrPairing()
  }, [])

  useEffect(() => {
    if (videoRef.current && cameraPreviewStream) {
      videoRef.current.srcObject = cameraPreviewStream
      videoRef.current.play().catch(() => {})
    }
  }, [cameraPreviewStream])

  return (
    <div className={`flex flex-col gap-6 w-full`}>
      {/* Top Bar / Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <span className={titleClass}>
            <RiEqualizerLine className="text-cyan-400" size={18} /> Media & Hardware Routing
          </span>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Choose active microphone input, speaker output, and camera feed for Nexus AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => requestPermissions()}
            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
            title="Scan & detect system device labels"
          >
            <RiShieldCheckLine size={14} className="text-emerald-400" /> Unlock Labels
          </button>
          <button
            onClick={() => refreshDevices()}
            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer"
            title="Rescan connected audio and video devices"
          >
            <RiRefreshLine size={14} className="text-cyan-400" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. AUDIO INPUT (MICROPHONE) */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <span className={titleClass}>
              <RiMicLine className="text-emerald-400" size={18} /> Microphone (Audio Input)
            </span>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              {audioInputs.length} {audioInputs.length === 1 ? 'Device' : 'Devices'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-mono text-zinc-400">Input Source Device</label>
            <select
              value={selectedAudioInputId}
              onChange={(e) => {
                selectAudioInput(e.target.value)
                if (isTestingMic) {
                  stopMicTest()
                }
              }}
              className="w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors cursor-pointer font-sans"
            >
              <option value="default">System Default Microphone</option>
              {audioInputs.map((d, index) => (
                <option key={d.deviceId || `input-${index}`} value={d.deviceId}>
                  {d.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Mic Meter / Live Test */}
          <div className="bg-[#050505] border border-white/5 rounded-xl p-3 flex flex-col gap-2 mt-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isTestingMic ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'
                  }`}
                />
                Mic Volume Monitor
              </span>
              <button
                onClick={() => (isTestingMic ? stopMicTest() : startMicTest())}
                className={`px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 transition-all cursor-pointer ${
                  isTestingMic
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                }`}
              >
                {isTestingMic ? (
                  <>
                    <RiStopFill size={12} /> Stop Test
                  </>
                ) : (
                  <>
                    <RiPlayFill size={12} /> Test Mic
                  </>
                )}
              </button>
            </div>

            {/* Audio Level Bar */}
            <div className="w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-75 ${
                  micLevel > 75
                    ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500'
                    : micLevel > 40
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
                      : 'bg-emerald-500'
                }`}
                style={{ width: `${isTestingMic ? Math.max(3, micLevel) : 0}%` }}
              />
            </div>
            {isTestingMic && (
              <p className="text-[10px] font-mono text-zinc-500 text-right">Level: {micLevel}%</p>
            )}
          </div>
        </div>

        {/* 2. AUDIO OUTPUT (SPEAKER / SINK) */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <span className={titleClass}>
              <RiVolumeUpLine className="text-cyan-400" size={18} /> Speakers (Audio Output)
            </span>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              {audioOutputs.length} {audioOutputs.length === 1 ? 'Device' : 'Devices'}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-mono text-zinc-400">Output Playback Sink</label>
            <select
              value={selectedAudioOutputId}
              onChange={(e) => selectAudioOutput(e.target.value)}
              className="w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-cyan-500/50 transition-colors cursor-pointer font-sans"
            >
              <option value="default">System Default Speakers</option>
              {audioOutputs.map((d, index) => (
                <option key={d.deviceId || `output-${index}`} value={d.deviceId}>
                  {d.label || `Speaker ${index + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Test Audio Chime */}
          <div className="bg-[#050505] border border-white/5 rounded-xl p-3 flex items-center justify-between mt-1">
            <div className="flex flex-col">
              <span className="text-[11px] font-mono text-zinc-300">Speaker Sound Check</span>
              <span className="text-[10px] text-zinc-500">Play confirmation chime</span>
            </div>
            <button
              onClick={() => testAudioOutput()}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer font-bold tracking-wider"
            >
              <RiVolumeUpLine size={14} /> PLAY CHIME
            </button>
          </div>
        </div>

        {/* 3. VIDEO INPUT (CAMERA) */}
        <div className={`${cardClass} md:col-span-2`}>
          <div className="flex items-center justify-between">
            <span className={titleClass}>
              <RiCameraLine className="text-purple-400" size={18} /> Camera (Video Input)
            </span>
            <span className="text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              {videoInputs.length} {videoInputs.length === 1 ? 'Device' : 'Devices'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3">
              <label className="text-[11px] font-mono text-zinc-400">Primary Optical Sensor</label>
              <select
                value={selectedVideoInputId}
                onChange={(e) => {
                  selectVideoInput(e.target.value)
                  if (isCameraActive) {
                    stopCameraPreview()
                  }
                }}
                className="w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-purple-500/50 transition-colors cursor-pointer font-sans"
              >
                <option value="default">System Default Webcam</option>
                {videoInputs.map((d, index) => (
                  <option key={d.deviceId || `camera-${index}`} value={d.deviceId}>
                    {d.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => (isCameraActive ? stopCameraPreview() : startCameraPreview())}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    isCameraActive
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                      : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30'
                  }`}
                >
                  {isCameraActive ? (
                    <>
                      <RiStopFill size={14} /> Turn Off Camera
                    </>
                  ) : (
                    <>
                      <RiVidiconLine size={14} /> Test Camera Feed
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 font-sans">
                Camera feed is used for Face ID biometric unlock and multimodal vision AI reasoning.
              </p>
            </div>

            {/* Camera Preview Box */}
            <div className="relative min-h-[160px] max-h-[220px] rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center">
              {isCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 border border-emerald-500/40 text-[9px] font-mono text-emerald-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE SENSOR
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-zinc-600">
                  <RiCameraLine size={32} className="opacity-40" />
                  <span className="text-[11px] font-mono">Camera preview inactive</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4. MOBILE REMOTE QR PAIRING (MARK-LVII PARITY) */}
        <div className={`${cardClass} md:col-span-2 border-emerald-500/20 bg-gradient-to-br from-emerald-950/10 via-[#0a0a0c] to-[#0a0a0c]`}>
          <div className="flex items-center justify-between">
            <span className={titleClass}>
              <RiSmartphoneLine className="text-emerald-400" size={18} /> Mobile QR Remote Pairing (Mark-LVII)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchQrPairing}
                className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-[10px] font-mono flex items-center gap-1 transition cursor-pointer"
                title="Regenerate scoped session pairing token"
              >
                <RiRefreshLine size={12} className={qrPairing.loading ? 'animate-spin text-emerald-400' : 'text-zinc-400'} />
                <span>Rotate Token</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            {/* Scannable QR Code */}
            <div className="relative w-40 h-40 shrink-0 rounded-xl overflow-hidden bg-white p-2.5 shadow-[0_0_25px_rgba(16,185,129,0.2)] border border-emerald-500/30 flex items-center justify-center">
              {qrPairing.loading ? (
                <div className="flex flex-col items-center justify-center gap-2 text-zinc-700">
                  <RiRefreshLine size={24} className="animate-spin text-emerald-600" />
                  <span className="text-[10px] font-mono">Generating...</span>
                </div>
              ) : qrPairing.qrBase64 ? (
                <img
                  src={qrPairing.qrBase64}
                  alt="Nexus Mobile QR Pairing"
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src="http://127.0.0.1:47630/api/remote/qr-pairing"
                  alt="Nexus Mobile QR Pairing"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    ;(e.target as HTMLElement).style.display = 'none'
                  }}
                />
              )}
            </div>

            {/* Info & Pairing Controls */}
            <div className="flex-1 flex flex-col gap-2.5 w-full">
              <div className="space-y-1">
                <span className="text-xs font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Edge Control Web Pairing Bridge
                </span>
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed">
                  Scan this encrypted QR code with your mobile camera or Tailscale browser to control Nexus OS v5.0 remotely. Includes voice duplex actuation, task steering, and push notifications.
                </p>
              </div>

              {/* URL Display & Copy */}
              <div className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-xl p-2 font-mono text-xs">
                <span className="text-zinc-500 text-[10px] uppercase font-bold shrink-0">Uplink:</span>
                <input
                  type="text"
                  readOnly
                  value={qrPairing.pairingUrl || 'http://127.0.0.1:47630/api/remote/qr-pairing'}
                  className="bg-transparent border-none text-zinc-300 text-xs w-full focus:outline-none truncate select-all font-mono"
                />
                <button
                  onClick={handleCopyPairingUrl}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition shrink-0 cursor-pointer ${
                    qrPairing.copied
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/10'
                  }`}
                  title="Copy Remote Pairing URL"
                >
                  {qrPairing.copied ? (
                    <>
                      <RiCheckLine size={13} className="text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <RiFileCopyLine size={13} /> Copy URL
                    </>
                  )}
                </button>
              </div>

              {/* Status footer */}
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                <span>Security: Scoped Bearer Token (Windows DPAPI Protected)</span>
                {qrPairing.token && <span>Token: {qrPairing.token.slice(0, 8)}...</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MediaDeviceSettings
