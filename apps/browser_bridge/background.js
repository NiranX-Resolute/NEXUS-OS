// Nexus OS v5.0 - Gemini Web Ingest Bridge Background Service Worker
// Manages local Bearer token authentication and relays captured Q&A payloads to IPC server

const IPC_ENDPOINT = 'http://127.0.0.1:47630/api/bridge/web-ingest';
const TOKEN_DISCOVERY_ENDPOINT = 'http://127.0.0.1:47630/api/auth/token';

// Read config from chrome.storage.local
async function getBridgeConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ['nexus_bearer_token', 'speak_commentary', 'last_status', 'last_event_time', 'events_count'],
      (items) => {
        resolve({
          token: items.nexus_bearer_token || '',
          speakCommentary: items.speak_commentary !== false, // default true
          lastStatus: items.last_status || 'Offline',
          lastEventTime: items.last_event_time || null,
          eventsCount: items.events_count || 0
        });
      }
    );
  });
}

// Update bridge status in storage and badge
function updateBridgeStatus(status) {
  chrome.storage.local.set({ last_status: status });
  if (chrome.action) {
    if (status === 'Connected') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Emerald
    } else if (status === 'SILENT Air-Gap') {
      chrome.action.setBadgeText({ text: 'AIR' });
      chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' }); // Purple
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#64748b' }); // Slate
    }
  }
}

// Check live connection status against local IPC server
async function checkLiveStatus() {
  const config = await getBridgeConfig();
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(IPC_ENDPOINT, {
      method: 'GET',
      headers: headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const status = data.status || (data.workspace_mode === 'SILENT' ? 'SILENT Air-Gap' : 'Connected');
      updateBridgeStatus(status);
      return {
        success: true,
        status: status,
        workspaceMode: data.workspace_mode || 'DEV',
        airGapped: !!data.air_gapped,
        events: data.events || []
      };
    } else if (res.status === 403) {
      updateBridgeStatus('SILENT Air-Gap');
      return {
        success: true,
        status: 'SILENT Air-Gap',
        workspaceMode: 'SILENT',
        airGapped: true
      };
    } else if (res.status === 401) {
      updateBridgeStatus('Unauthorized');
      return {
        success: false,
        status: 'Unauthorized',
        error: 'Bearer token invalid or missing'
      };
    } else {
      updateBridgeStatus('Offline');
      return {
        success: false,
        status: 'Offline',
        error: `HTTP ${res.status}`
      };
    }
  } catch (err) {
    updateBridgeStatus('Offline');
    return {
      success: false,
      status: 'Offline',
      error: err.message || 'IPC Server Offline'
    };
  }
}

// Relay captured web Q&A payload to IPC Server
async function relayWebIngest(payload) {
  const config = await getBridgeConfig();
  const headers = {
    'Content-Type': 'application/json'
  };
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  const bodyData = {
    source: payload.source || 'gemini_web',
    url: payload.url || '',
    prompt: payload.prompt || '',
    response: payload.response || '',
    speak_commentary: config.speakCommentary,
    timestamp: payload.timestamp || Date.now()
  };

  try {
    const res = await fetch(IPC_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyData)
    });

    const resData = await res.json().catch(() => ({}));

    if (res.status === 200 || res.status === 201) {
      updateBridgeStatus('Connected');
      chrome.storage.local.get(['events_count'], (items) => {
        const nextCount = (items.events_count || 0) + 1;
        chrome.storage.local.set({
          events_count: nextCount,
          last_event_time: Date.now(),
          last_event: {
            id: resData.id,
            prompt: payload.prompt.slice(0, 80),
            commentary: resData.commentary || ''
          }
        });
      });
      return {
        success: true,
        id: resData.id,
        commentary: resData.commentary || '',
        workspace_mode: resData.workspace_mode
      };
    } else if (res.status === 403) {
      updateBridgeStatus('SILENT Air-Gap');
      return {
        success: false,
        blocked: true,
        status: 'SILENT Air-Gap',
        error: resData.error || 'Blocked: SILENT workspace mode active'
      };
    } else if (res.status === 401) {
      updateBridgeStatus('Unauthorized');
      return {
        success: false,
        status: 'Unauthorized',
        error: 'Unauthorized: Configure Bearer token in popup'
      };
    } else {
      return {
        success: false,
        error: resData.error || `HTTP ${res.status}`
      };
    }
  } catch (err) {
    updateBridgeStatus('Offline');
    return {
      success: false,
      status: 'Offline',
      error: err.message || 'Network error connecting to IPC server'
    };
  }
}

// Auto-discover token from loopback discovery endpoint
async function autoDiscoverToken() {
  try {
    const res = await fetch(TOKEN_DISCOVERY_ENDPOINT);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.token) {
        chrome.storage.local.set({ nexus_bearer_token: data.token });
        return { success: true, token: data.token };
      }
    }
    return { success: false, error: 'Could not discover token' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GEMINI_WEB_INGEST') {
    relayWebIngest(message.payload).then(sendResponse);
    return true; // async reply
  }

  if (message.type === 'CHECK_STATUS') {
    checkLiveStatus().then(sendResponse);
    return true;
  }

  if (message.type === 'AUTO_DISCOVER_TOKEN') {
    autoDiscoverToken().then(sendResponse);
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ success: true, time: Date.now() });
    return false;
  }
});

// Initial periodic ping
chrome.runtime.onInstalled.addListener(() => {
  checkLiveStatus();
});
