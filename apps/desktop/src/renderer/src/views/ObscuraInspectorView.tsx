import React, { useState, useEffect, useRef } from 'react'
import {
  RiCompass3Line,
  RiTerminalBoxLine,
  RiVolumeUpLine,
  RiBookmarkLine,
  RiFlashlightLine,
  RiRefreshLine,
  RiArrowRightLine,
  RiCpuLine,
  RiShieldCheckLine,
  RiCheckLine,
  RiExternalLinkLine
} from 'react-icons/ri'

export interface WebIngestEvent {
  id: string
  url: string
  title: string
  prompt: string
  response_text: string
  elements_json: string
  tars_commentary: string
  created_at: number
}

export interface InteractiveElement {
  id: number
  tag: string
  text: string
  rect?: number[]
}

export type BrowserEngineMode = 'AUTO' | 'OBSCURA RUST' | 'WARM CHROMIUM'

export default function ObscuraInspectorView() {
  const [engineMode, setEngineMode] = useState<BrowserEngineMode>('AUTO')
  const [targetUrl, setTargetUrl] = useState('https://gemini.google.com')
  const [events, setEvents] = useState<WebIngestEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeElementId, setActiveElementId] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string>('Obscura Shadow-DOM Engine Ready')

  const containerRef = useRef<HTMLDivElement>(null)

  // 1. Initial Load of recent web ingestion events
  useEffect(() => {
    let mounted = true

    async function loadRecentEvents() {
      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const res = await window.electron.ipcRenderer.invoke('nexus-telemetry:get-web-ingests', 25)
          if (mounted && res && res.success && Array.isArray(res.events)) {
            setEvents(res.events)
          }
        }
      } catch (err) {
        console.warn('[ObscuraInspector] Failed to load recent ingests:', err)
      }
    }

    loadRecentEvents()

    // 2. Real-time streaming listener via telemetry bridge
    const handleIngestEvent = (_event: any, newEvent: WebIngestEvent) => {
      if (!mounted || !newEvent) return
      setEvents((prev) => [newEvent, ...prev.filter((e) => e.id !== newEvent.id)])
      setStatusMessage(`Ingested event: ${newEvent.title || newEvent.url || 'Web Capture'}`)
    }

    if (window.electron?.ipcRenderer?.on) {
      window.electron.ipcRenderer.on('nexus-web-ingest-event', handleIngestEvent)
    }

    return () => {
      mounted = false
      if (window.electron?.ipcRenderer?.removeAllListeners) {
        window.electron.ipcRenderer.removeAllListeners('nexus-web-ingest-event')
      }
    }
  }, [])

  // Switch Engine
  const handleEngineSwitch = async (mode: BrowserEngineMode) => {
    setEngineMode(mode)
    const engineMap: Record<BrowserEngineMode, string> = {
      AUTO: 'auto',
      'OBSCURA RUST': 'obscura',
      'WARM CHROMIUM': 'chromium_persistent'
    }

    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      const resp = await ipcFetch('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({ engine: engineMap[mode], action: 'switch' })
      }).catch(() => null)

      if (resp && resp.ok) {
        setStatusMessage(`Browser Engine switched to [${mode}]`)
      }
    } catch {}
  }

  // Navigate / Inspect URL
  const handleNavigate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!targetUrl.trim()) return

    setIsLoading(true)
    setStatusMessage(`Navigating and distilling DOM on ${targetUrl}...`)

    try {
      const engineMap: Record<BrowserEngineMode, string> = {
        AUTO: 'auto',
        'OBSCURA RUST': 'obscura',
        'WARM CHROMIUM': 'chromium_persistent'
      }

      const { ipcFetch } = await import('@renderer/services/ipc-client')
      const resp = await ipcFetch('/api/bridge/browser-engine', {
        method: 'POST',
        body: JSON.stringify({
          engine: engineMap[engineMode],
          action: 'navigate',
          url: targetUrl
        })
      })

      if (resp.ok) {
        const data = await resp.json()
        setStatusMessage(`Active DOM Distilled: ${data.engine || engineMode} (${data.result?.elements_count || 0} controls)`)
      } else {
        setStatusMessage(`Navigation response: ${resp.status}`)
      }
    } catch (err: any) {
      setStatusMessage(`Navigation error: ${err.message || 'Offline'}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Click on distilled interactive element
  const handleElementClick = async (elementId: number) => {
    setActiveElementId(elementId)
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/action', {
        method: 'POST',
        body: JSON.stringify({
          action: 'WEB_CLICK',
          payload: { element_id: elementId }
        })
      })
      setStatusMessage(`Dispatched click to element [${elementId}]`)
    } catch {}
  }

  // TARS TTS Playback
  const handleSpeakTars = async (text: string) => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/persona/preview', {
        method: 'POST',
        body: JSON.stringify({ text })
      })
      setStatusMessage('TARS Commentary audio streaming...')
    } catch {}
  }

  // Pin to Sovereign Memory
  const handlePinMemory = async (evt: WebIngestEvent) => {
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/memory', {
        method: 'POST',
        body: JSON.stringify({
          title: `Pinned: ${evt.title || evt.url}`,
          content: `Prompt:\n${evt.prompt}\n\nResponse:\n${evt.response_text}\n\nTARS:\n${evt.tars_commentary}`,
          namespace: 'RESEARCH',
          metadata: { pinned: true, source: evt.url, event_id: evt.id }
        })
      })
      setCopiedId(evt.id)
      setStatusMessage('Pinned to Sovereign SQLite Memory Store.')
      setTimeout(() => setCopiedId(null), 2500)
    } catch {}
  }

  // Parse elements JSON safely
  const parseElements = (jsonStr: string): InteractiveElement[] => {
    if (!jsonStr) return []
    try {
      const parsed = JSON.parse(jsonStr)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full min-h-0 overflow-y-auto pb-24 text-zinc-100 font-sans px-6 pt-4"
    >
      {/* 1. Header & Engine Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <RiCompass3Line className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wide uppercase flex items-center gap-2">
              Obscura Shadow-DOM & Web Ingest
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                v5.0 Sovereign
              </span>
            </h1>
            <p className="text-xs text-zinc-400 font-mono">
              Dual-Engine CDP Actuator & Passive Gemini Web Ingestion Pipeline
            </p>
          </div>
        </div>

        {/* Engine Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-white/10 backdrop-blur-md">
          {(['AUTO', 'OBSCURA RUST', 'WARM CHROMIUM'] as BrowserEngineMode[]).map((mode) => {
            const isActive = engineMode === mode
            return (
              <button
                key={mode}
                onClick={() => handleEngineSwitch(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500 text-black font-bold shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {mode}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Target URL & SCOUT-01 Navigation Bar */}
      <form onSubmit={handleNavigate} className="flex items-center gap-3 mt-4 shrink-0">
        <div className="flex-1 relative">
          <input
            type="text"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="Enter URL or domain (e.g. https://gemini.google.com)..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-mono font-medium flex items-center gap-2 transition disabled:opacity-50"
        >
          {isLoading ? (
            <RiRefreshLine className="w-4 h-4 animate-spin text-cyan-400" />
          ) : (
            <RiArrowRightLine className="w-4 h-4 text-cyan-400" />
          )}
          <span>Inspect / Distill</span>
        </button>
      </form>

      {/* 3. Status Bar */}
      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 py-2 px-1 border-b border-white/5 mt-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-zinc-300">{statusMessage}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Port 47630 IPC: Active</span>
          <span>Shadow-DOM: Traversal [1..N]</span>
        </div>
      </div>

      {/* 4. Streamed Ingest Events & TARS Interpretation Stage */}
      <div className="flex-1 mt-4 space-y-4">
        {events.length === 0 ? (
          <div className="p-8 rounded-2xl bg-zinc-950/40 border border-white/5 text-center text-zinc-500 font-mono text-xs">
            No web ingestion events captured yet.
            <br />
            Responses from <span className="text-cyan-400">gemini.google.com</span> or active browser visits will automatically populate this stage in real-time.
          </div>
        ) : (
          events.map((evt) => {
            const elements = parseElements(evt.elements_json)
            const isPinned = copiedId === evt.id

            return (
              <div
                key={evt.id}
                className="p-5 rounded-2xl bg-zinc-950/50 border border-white/10 backdrop-blur-xl shadow-xl space-y-4 transition hover:border-cyan-500/30"
              >
                {/* Event Header */}
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                      SCOUT-01 INGEST
                    </span>
                    <span className="text-zinc-400 truncate max-w-sm">{evt.url || evt.title}</span>
                  </div>
                  <span className="text-zinc-500">
                    {new Date(evt.created_at * 1000).toLocaleTimeString()}
                  </span>
                </div>

                {/* Prompt & Model Response */}
                <div className="space-y-2">
                  {evt.prompt && (
                    <div className="text-xs bg-black/40 border border-white/5 rounded-xl p-3 text-zinc-300 font-mono">
                      <span className="text-zinc-500 uppercase font-bold text-[10px] block mb-1">
                        Captured User Query:
                      </span>
                      {evt.prompt}
                    </div>
                  )}

                  <div className="text-xs bg-black/60 border border-white/10 rounded-xl p-4 text-zinc-200 leading-relaxed font-sans max-h-56 overflow-y-auto whitespace-pre-wrap">
                    <span className="text-emerald-400 uppercase font-bold text-[10px] font-mono block mb-2">
                      Distilled Assistant Response:
                    </span>
                    {evt.response_text}
                  </div>
                </div>

                {/* TARS Persona Commentary Card */}
                {evt.tars_commentary && (
                  <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200 text-xs font-mono flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <RiCpuLine className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold uppercase tracking-wider text-[10px] text-purple-300 block mb-0.5">
                          TARS Interpretation [Humor: 75% | Candor: 90%]
                        </span>
                        <span>"{evt.tars_commentary}"</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSpeakTars(evt.tars_commentary)}
                      className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 transition shrink-0"
                      title="Speak commentary via TTS"
                    >
                      <RiVolumeUpLine className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Interactive Elements [1..N] */}
                {elements.length > 0 && (
                  <div>
                    <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block mb-2 font-bold">
                      Interactive Controls ({elements.length} tagged):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {elements.slice(0, 30).map((el) => {
                        const isSelected = activeElementId === el.id
                        return (
                          <button
                            key={el.id}
                            onClick={() => handleElementClick(el.id)}
                            className={`px-2 py-1 rounded-md text-[11px] font-mono border transition flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-cyan-500 text-black border-cyan-400 font-bold shadow-md shadow-cyan-500/30'
                                : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10 hover:border-cyan-500/40'
                            }`}
                            title={`Click tag <${el.tag}> at (${el.rect?.join(', ') || ''})`}
                          >
                            <span className="text-[9px] px-1 rounded bg-black/40 text-cyan-300">
                              [{el.id}]
                            </span>
                            <span className="truncate max-w-xs">{el.text || el.tag}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => handlePinMemory(evt)}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
                  >
                    {isPinned ? (
                      <>
                        <RiCheckLine className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Pinned</span>
                      </>
                    ) : (
                      <>
                        <RiBookmarkLine className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Pin to Memory</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleSpeakTars(evt.tars_commentary || evt.response_text.slice(0, 150))}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
                  >
                    <RiVolumeUpLine className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Speak (TTS)</span>
                  </button>
                  {evt.url && (
                    <a
                      href={evt.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 transition"
                    >
                      <RiExternalLinkLine className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Open Origin</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
