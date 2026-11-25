export const IPC_ORIGIN = 'http://127.0.0.1:47630';
export const WS_URL = 'ws://127.0.0.1:47630/ws/telemetry';

interface NexusBridgeWindow {
  nexusAuth?: {
    getAuthToken?: () => Promise<string>;
  };
  nexusWindow?: {
    minimize?: () => void;
    maximize?: () => void;
    close?: () => void;
    isMaximized?: () => Promise<boolean>;
    onStateChange?: (cb: (state: { maximized: boolean }) => void) => () => void;
  };
  electron?: {
    ipcRenderer?: {
      invoke?: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
      send?: (channel: string, ...args: unknown[]) => void;
    };
  };
}

let cachedToken = '';
let tokenInFlight: Promise<string> | null = null;

function getBridgeWindow(): NexusBridgeWindow | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as NexusBridgeWindow;
}

export async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken) {
    return cachedToken;
  }
  if (!forceRefresh && tokenInFlight) {
    return tokenInFlight;
  }

  tokenInFlight = (async () => {
    const win = getBridgeWindow();

    try {
      const tok = await win?.nexusAuth?.getAuthToken?.();
      if (typeof tok === 'string' && tok.trim()) {
        cachedToken = tok.trim();
        return cachedToken;
      }
    } catch {
      // Fall through to secondary IPC channel
    }

    try {
      const tok = await win?.electron?.ipcRenderer?.invoke?.<string>('get-auth-token');
      if (typeof tok === 'string' && tok.trim()) {
        cachedToken = tok.trim();
        return cachedToken;
      }
    } catch {
      // Fall through to browser session fallback
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem('nexus_ipc_token');
        if (stored && stored.trim()) {
          cachedToken = stored.trim();
          return cachedToken;
        }
      }
    } catch {
      // Session storage unavailable
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

function mergeHeaders(baseInit: HeadersInit | undefined, token: string, hasStringBody: boolean): Headers {
  const headers = new Headers(baseInit);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (hasStringBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('X-Nexus-Token')) {
      headers.set('X-Nexus-Token', token);
    }
  }
  return headers;
}

export async function ipcFetch(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const url = resolveIpcUrl(pathOrUrl);
  const hasStringBody = typeof init.body === 'string';
  const token = await getToken(false);

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
  const response = await ipcFetch(pathOrUrl, init);
  const rawText = await response.text();

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!response.ok && parsed && typeof parsed === 'object') {
      if (!parsed.error && typeof parsed.detail === 'string') {
        parsed.error = parsed.detail;
      }
      if (parsed.success === undefined) {
        parsed.success = false;
      }
    }
    return parsed as T & { success?: boolean; error?: string };
  } catch {
    return {
      success: response.ok,
      error: response.ok ? undefined : rawText || `HTTP ${response.status}`,
    } as T & { success?: boolean; error?: string };
  }
}
