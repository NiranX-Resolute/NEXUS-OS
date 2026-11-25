export const IPC_ORIGIN = 'http://127.0.0.1:47630';
export const WS_URL = 'ws://127.0.0.1:47630/ws/telemetry';

interface NexusBridgeWindow {
  nexusAuth?: {
    getAuthToken?: () => Promise<string>;
  };
  electron?: {
    ipcRenderer?: {
      invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
  };
}

let cachedToken = '';
let tokenInFlight: Promise<string> | null = null;

export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }
  if (!forceRefresh && tokenInFlight) {
    return tokenInFlight;
  }

  tokenInFlight = (async () => {
    const win = window as unknown as NexusBridgeWindow;

    try {
      if (win?.nexusAuth?.getAuthToken) {
        const tok = await win.nexusAuth.getAuthToken();
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim();
          return cachedToken;
        }
      }
    } catch {
      // Fall through to Electron ipcRenderer or session storage
    }

    try {
      if (win?.electron?.ipcRenderer?.invoke) {
        const tok = await win.electron.ipcRenderer.invoke('get-auth-token');
        if (typeof tok === 'string' && tok.trim()) {
          cachedToken = tok.trim();
          return cachedToken;
        }
      }
    } catch {
      // Fall through to browser session token if provided
    }

    try {
      const stored = window.sessionStorage.getItem('nexus_ipc_token');
      if (stored && stored.trim()) {
        cachedToken = stored.trim();
        return cachedToken;
      }
    } catch {
      // Ignore storage access errors in restricted frames
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

function resolveIpcUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${IPC_ORIGIN}${normalized}`;
}

function mergeHeaders(initHeaders: HeadersInit | undefined, token: string, hasStringBody: boolean): Record<string, string> {
  const merged: Record<string, string> = {
    Accept: 'application/json',
  };

  if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      merged[key] = value;
    });
  } else if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) {
      merged[key] = value;
    }
  } else if (initHeaders) {
    Object.assign(merged, initHeaders);
  }

  if (hasStringBody && !merged['Content-Type']) {
    merged['Content-Type'] = 'application/json';
  }
  if (token && !merged['Authorization']) {
    merged['Authorization'] = `Bearer ${token}`;
  }
  if (token && !merged['X-Nexus-Token']) {
    merged['X-Nexus-Token'] = token;
  }
  return merged;
}

export async function ipcFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = resolveIpcUrl(pathOrUrl);
  const token = await getToken(false);
  const hasStringBody = typeof init.body === 'string';

  let response = await fetch(url, {
    ...init,
    headers: mergeHeaders(init.headers, token, hasStringBody),
  });

  if (response.status === 401) {
    const refreshed = await getToken(true);
    if (refreshed && refreshed !== token) {
      response = await fetch(url, {
        ...init,
        headers: mergeHeaders(init.headers, refreshed, hasStringBody),
      });
    }
  }

  return response;
}

export async function ipcJson<T = Record<string, unknown>>(
  pathOrUrl: string,
  init: RequestInit = {}
): Promise<T & { success?: boolean; error?: string }> {
  try {
    const response = await ipcFetch(pathOrUrl, init);
    const raw = await response.text();
    if (!raw) {
      return {
        success: response.ok,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      } as T & { success?: boolean; error?: string };
    }
    try {
      const parsed = JSON.parse(raw) as T & { success?: boolean; error?: string; detail?: string };
      if (!response.ok && parsed.success === undefined) {
        return {
          ...parsed,
          success: false,
          error: parsed.error || parsed.detail || `HTTP ${response.status}`,
        };
      }
      return parsed;
    } catch {
      return {
        success: response.ok,
        error: response.ok ? undefined : raw || `HTTP ${response.status}`,
      } as T & { success?: boolean; error?: string };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'IPC gateway unreachable',
    } as T & { success?: boolean; error?: string };
  }
}
