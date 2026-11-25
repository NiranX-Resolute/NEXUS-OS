export const IPC_ORIGIN = 'http://127.0.0.1:47630';
export const WS_URL = 'ws://127.0.0.1:47630/ws/telemetry';

let cachedToken = '';
let tokenInFlight: Promise<string> | null = null;

export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }
  if (!forceRefresh && tokenInFlight) {
    return tokenInFlight;
  }

  tokenInFlight = (async (): Promise<string> => {
    if (typeof window !== 'undefined') {
      try {
        if (window.nexusAuth?.getAuthToken) {
          const tok = await window.nexusAuth.getAuthToken();
          if (typeof tok === 'string' && tok.trim()) {
            cachedToken = tok.trim();
            return cachedToken;
          }
        }
      } catch {
        // Continue to secondary Electron IPC channel
      }

      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const tok = await window.electron.ipcRenderer.invoke<string>('get-auth-token');
          if (typeof tok === 'string' && tok.trim()) {
            cachedToken = tok.trim();
            return cachedToken;
          }
        }
      } catch {
        // Continue to web/session fallback
      }

      try {
        const stored = window.sessionStorage?.getItem('nexus_ipc_token');
        if (stored && stored.trim()) {
          cachedToken = stored.trim();
          return cachedToken;
        }
      } catch {
        // Ignore storage restrictions
      }
    }

    const envToken = import.meta.env.VITE_NEXUS_IPC_TOKEN;
    if (typeof envToken === 'string' && envToken.trim()) {
      cachedToken = envToken.trim();
      return cachedToken;
    }

    return '';
  })().finally(() => {
    tokenInFlight = null;
  });

  return tokenInFlight;
}

export function clearToken(): void {
  cachedToken = '';
}

function buildIpcUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${IPC_ORIGIN}${normalized}`;
}

function normalizeHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export async function ipcFetch(pathOrUrl: string, options: RequestInit = {}): Promise<Response> {
  const url = buildIpcUrl(pathOrUrl);
  const token = await getToken(false);

  const buildHeaders = (tok: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...normalizeHeaderRecord(options.headers),
    };
    if (typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (tok && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${tok}`;
    }
    if (tok && !headers['X-Nexus-Token']) {
      headers['X-Nexus-Token'] = tok;
    }
    return headers;
  };

  let response = await fetch(url, { ...options, headers: buildHeaders(token) });
  if (response.status === 401) {
    const refreshed = await getToken(true);
    if (refreshed && refreshed !== token) {
      response = await fetch(url, { ...options, headers: buildHeaders(refreshed) });
    }
  }
  return response;
}

export async function ipcJson<T = Record<string, unknown>>(
  pathOrUrl: string,
  options: RequestInit = {}
): Promise<T & { success?: boolean; error?: string }> {
  const response = await ipcFetch(pathOrUrl, options);
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as T & { success?: boolean; error?: string };
    return parsed;
  } catch {
    return {
      success: response.ok,
      error: response.ok ? undefined : text || `HTTP ${response.status}`,
    } as T & { success?: boolean; error?: string };
  }
}
