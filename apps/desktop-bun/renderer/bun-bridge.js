// Nexus Bun Bridge — Universal IPC & WebSocket Layer for Exact Desktop UI
(function () {
  console.log('[Nexus Bun Bridge] Initializing sovereign IPC bridge for exact UI...')

  const listeners = new Map()

  // Connect WebSocket to Bun backend for real-time telemetry and pushed events
  let ws = null
  function connectWs() {
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${proto}//${window.location.host}/ws`
      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        console.log('[Nexus Bun Bridge] WebSocket connected to Bun.serve.')
      }

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'telemetry:stream') {
            triggerEvent('telemetry-data', payload.data)
            triggerEvent('system-proactive-alert', payload.data)
          } else if (payload.type === 'terminal:data') {
            triggerEvent('terminal-data', payload.data)
          } else if (payload.type === 'event') {
            triggerEvent(payload.event, payload.payload)
          } else if (payload.type === 'ipc:reply') {
            triggerEvent(payload.channel, payload.data)
          }
        } catch (e) {}
      }

      ws.onclose = () => {
        setTimeout(connectWs, 2000)
      }
    } catch (e) {
      setTimeout(connectWs, 3000)
    }
  }
  connectWs()

  function triggerEvent(channel, ...args) {
    const cbs = listeners.get(channel)
    if (cbs) {
      cbs.forEach((cb) => {
        try {
          cb({ sender: window.electron.ipcRenderer }, ...args)
        } catch (e) {
          console.error(`[Nexus Bun Bridge] Error in listener for ${channel}:`, e)
        }
      })
    }
  }

  // Unified IPC caller via HTTP POST to /api/ipc
  async function invokeIpc(channel, ...args) {
    try {
      const res = await fetch('/api/ipc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, args })
      })

      if (!res.ok) {
        console.warn(`[Nexus Bun Bridge] ${channel} returned HTTP ${res.status}`)
        return { success: false }
      }

      return await res.json()
    } catch (err) {
      console.warn(`[Nexus Bun Bridge] Failed invoking ${channel}:`, err)
      return { success: false, error: err.message }
    }
  }

  window.electron = {
    ipcRenderer: {
      invoke: invokeIpc,
      on: (channel, callback) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel).add(callback)
        return () => listeners.get(channel)?.delete(callback)
      },
      once: (channel, callback) => {
        const onceWrapper = (...args) => {
          listeners.get(channel)?.delete(onceWrapper)
          callback(...args)
        };
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel).add(onceWrapper)
      },
      send: (channel, ...args) => {
        invokeIpc(channel, ...args)
      },
      removeListener: (channel, callback) => {
        listeners.get(channel)?.delete(callback)
      },
      removeAllListeners: (channel) => {
        if (channel) listeners.delete(channel)
        else listeners.clear()
      }
    },
    webFrame: {
      setZoomFactor: (factor) => {
        document.body.style.zoom = factor
      },
      getZoomFactor: () => parseFloat(document.body.style.zoom || '1'),
      setZoomLevel: (level) => {
        document.body.style.zoom = Math.pow(1.2, level)
      },
      getZoomLevel: () => 0
    },
    process: {
      platform: 'win32',
      arch: 'x64',
      env: {}
    }
  }

  window.api = {}

  if (!window.desktopCapturer) {
    window.desktopCapturer = {
      getSources: async () => [{ id: 'screen:0:0', name: 'Entire Screen', thumbnail: '' }]
    }
  }

  console.log('[Nexus Bun Bridge] Exact UI IPC bridge initialized successfully.')
})()
