export const IPC_ORIGIN = 'http://127.0.0.1:47630'
export const WS_URL = 'ws://127.0.0.1:47630/ws/telemetry'

let cachedToken = ''
let tokenPromise: Promise<string> | null = null

export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken
  }
  if (!forceRefresh && tokenPromise) {
    return tokenPromise
  }

  tokenPromise = (async () => {
    try {
      if (window.nexusAuth?.getAuthToken) {
        const tok = await window.nexusAuth.getAuthToken()
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim()
          return cachedToken
        }
      }
    } catch {
      // Fall through to secondary token bridges
    }

    try {
      if (window.electron?.ipcRenderer?.invoke) {
        const tok = await window.electron.ipcRenderer.invoke<string>('get-auth-token')
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim()
          return cachedToken
        }
      }
    } catch {
      // Fall through to browser session storage
    }

    try {
      const stored = window.sessionStorage?.getItem('nexus_ipc_token')
      if (stored && stored.trim()) {
        cachedToken = stored.trim()
        return cachedToken
      }
    } catch {
      // Ignore storage restrictions
    }

    return ''
  })().finally(() => {
    tokenPromise = null
  })

  return tokenPromise
}

export function clearToken(): void {
  cachedToken = ''
}

function resolveIpcUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${IPC_ORIGIN}${normalized}`
}

function buildAuthHeaders(token: string, init: RequestInit): Headers {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (!headers.has('X-Nexus-Token')) {
      headers.set('X-Nexus-Token', token)
    }
  }
  return headers
}

export async function ipcFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = resolveIpcUrl(pathOrUrl)
  const token = await getToken(false)

  let response = await fetch(url, {
    ...init,
    headers: buildAuthHeaders(token, init),
  })

  if (response.status === 401) {
    clearToken()
    const refreshed = await getToken(true)
    if (refreshed && refreshed !== token) {
      response = await fetch(url, {
        ...init,
        headers: buildAuthHeaders(refreshed, init),
      })
    }
  }

  return response
}

export async function ipcJson<T = Record<string, unknown>>(
  pathOrUrl: string,
  init: RequestInit = {},
): Promise<T & { success?: boolean; error?: string }> {
  const response = await ipcFetch(pathOrUrl, init)
  const raw = await response.text()

  try {
    const parsed = JSON.parse(raw) as T & { success?: boolean; error?: string }
    if (!response.ok && parsed && typeof parsed === 'object' && parsed.success === undefined) {
      return {
        ...parsed,
        success: false,
        error: parsed.error || `HTTP ${response.status}`,
      }
    }
    return parsed
  } catch {
    return {
      success: response.ok,
      error: response.ok ? undefined : raw || `HTTP ${response.status}`,
    } as T & { success?: boolean; error?: string }
  }
}
