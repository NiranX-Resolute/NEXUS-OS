export const IPC_ORIGIN = 'http://127.0.0.1:47630';
export const WS_URL = 'ws://127.0.0.1:47630/ws/telemetry';

let cachedToken = '';
let tokenInFlight: Promise<string> | null = null;

function buildIpcUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${IPC_ORIGIN}${normalized}`;
}

/**
 * Resolves and caches the local loopback IPC Bearer token via Electron preload bridge.
 */
export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }
  if (!forceRefresh && tokenInFlight) {
    return tokenInFlight;
  }

  tokenInFlight = (async (): Promise<string> => {
    try {
      if (typeof window !== 'undefined' && window.nexusAuth?.getAuthToken) {
        const tok = await window.nexusAuth.getAuthToken();
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim();
          return cachedToken;
        }
      }
    } catch {
      // Fall through to secondary IPC channels
    }

    try {
      if (typeof window !== 'undefined' && window.electron?.ipcRenderer?.invoke) {
        const tok = await window.electron.ipcRenderer.invoke('get-auth-token');
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim();
          return cachedToken;
        }
      }
    } catch {
      // Fall through to sessionStorage for browser preview contexts
    }

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem('nexus_ipc_token');
        if (stored && stored.trim()) {
          cachedToken = stored.trim();
          return cachedToken;
        }
      }
    } catch {
      // Ignore restricted storage contexts
    }

    return '';
  })().finally(() => {
    tokenInFlight = null;
  });

  return tokenInFlight;
}

/**
 * Clears the cached Bearer token so the next request re-reads from Electron IPC.
 */
export function clearToken(): void {
  cachedToken = '';
}

/**
 * Authenticated fetch wrapper against the 127.0.0.1:47630 local gateway with 401 retry.
 */
export async function ipcFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = buildIpcUrl(pathOrUrl);
  const initialToken = await getToken(false);

  const buildHeaders = (tok: string): Headers => {
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    if (tok) {
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${tok}`);
      }
      if (!headers.has('X-Nexus-Token')) {
        headers.set('X-Nexus-Token', tok);
      }
    }
    return headers;
  };

  let response = await fetch(url, {
    ...init,
    headers: buildHeaders(initialToken),
  });

  if (response.status === 401) {
    clearToken();
    const refreshed = await getToken(true);
    if (refreshed && refreshed !== initialToken) {
      response = await fetch(url, {
        ...init,
        headers: buildHeaders(refreshed),
      });
    }
  }

  return response;
}

/**
 * Executes an authenticated gateway request and decodes the JSON payload cleanly.
 */
export async function ipcJson<T = unknown>(
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<T & { success?: boolean; error?: string }> {
  const response = await ipcFetch(pathOrUrl, init);
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    } as T & { success?: boolean; error?: string };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!response.ok && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const detail = typeof parsed.detail === 'string' ? parsed.detail : undefined;
      const errMsg = typeof parsed.error === 'string' ? parsed.error : detail ?? `HTTP ${response.status}`;
      return {
        ...parsed,
        success: typeof parsed.success === 'boolean' ? parsed.success : false,
        error: errMsg,
      } as unknown as T & { success?: boolean; error?: string };
    }
    return parsed as unknown as T & { success?: boolean; error?: string };
  } catch {
    return {
      success: response.ok,
      error: response.ok ? undefined : rawText || `HTTP ${response.status}`,
    } as T & { success?: boolean; error?: string };
  }
}
