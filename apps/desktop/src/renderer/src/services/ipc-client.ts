/**
 * Nexus Desktop - Authenticated Loopback IPC Client & Electron Bridge
 *
 * Centralizes Bearer token discovery (strictly via Electron contextBridge / IPC,
 * never unauthenticated HTTP token leaks) and standardizes authenticated requests
 * to the unified FastAPI + IPC gateway on 127.0.0.1:47630.
 */

export const IPC_ORIGIN = 'http://127.0.0.1:47630'

let cachedToken: string = ''
let tokenInFlight: Promise<string> | null = null

export async function getIpcToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken
  }
  if (!forceRefresh && tokenInFlight) {
    return tokenInFlight
  }

  tokenInFlight = (async () => {
    const win = window as any
    try {
      if (win?.nexusAuth?.getAuthToken) {
        const tok = await win.nexusAuth.getAuthToken()
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim()
          return cachedToken
        }
      }
    } catch {
      // Try secondary bridge paths below
    }

    try {
      if (win?.electron?.ipcRenderer?.invoke) {
        const tok = await win.electron.ipcRenderer.invoke('get-auth-token')
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim()
          return cachedToken
        }
      }
    } catch {
      // Fallback to web/test context
    }

    try {
      const stored = sessionStorage.getItem('nexus_ipc_token')
      if (stored && stored.trim()) {
        cachedToken = stored.trim()
        return cachedToken
      }
    } catch {
      // Ignore storage access errors
    }

    return ''
  })().finally(() => {
    tokenInFlight = null
  })

  return tokenInFlight
}

export function clearCachedIpcToken(): void {
  cachedToken = ''
}

function buildIpcUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${IPC_ORIGIN}${normalized}`
}

export async function ipcFetch(pathOrUrl: string, options: RequestInit = {}): Promise<Response> {
  const url = buildIpcUrl(pathOrUrl)
  const token = await getIpcToken(false)

  const buildHeaders = (tok: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {})
    }
    if (typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
    if (tok && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${tok}`
    }
    if (tok && !headers['X-Nexus-Token']) {
      headers['X-Nexus-Token'] = tok
    }
    return headers
  }

  let response = await fetch(url, { ...options, headers: buildHeaders(token) })
  if (response.status === 401) {
    const refreshed = await getIpcToken(true)
    if (refreshed && refreshed !== token) {
      response = await fetch(url, { ...options, headers: buildHeaders(refreshed) })
    }
  }
  return response
}

export async function ipcJson<T = any>(
  pathOrUrl: string,
  options: RequestInit = {}
): Promise<T & { success?: boolean; error?: string }> {
  const response = await ipcFetch(pathOrUrl, options)
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return {
      success: response.ok,
      error: response.ok ? undefined : text || `HTTP ${response.status}`
    } as T & { success?: boolean; error?: string }
  }
}

export async function ipcInvoke<T = any>(channel: string, ...args: any[]): Promise<T | null> {
  const ipc = (window as any)?.electron?.ipcRenderer
  if (!ipc?.invoke) return null
  try {
    return (await ipc.invoke(channel, ...args)) as T
  } catch {
    return null
  }
}

export function ipcSend(channel: string, ...args: any[]): boolean {
  const ipc = (window as any)?.electron?.ipcRenderer
  if (!ipc?.send) return false
  try {
    ipc.send(channel, ...args)
    return true
  } catch {
    return false
  }
}
