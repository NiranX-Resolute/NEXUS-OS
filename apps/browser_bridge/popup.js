// Nexus OS v5.0 - Browser Bridge Popup Controller

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const statusSub = document.getElementById('statusSub');
  const btnRefresh = document.getElementById('btnRefresh');
  const inputToken = document.getElementById('inputToken');
  const btnSaveToken = document.getElementById('btnSaveToken');
  const btnAutoDetect = document.getElementById('btnAutoDetect');
  const toggleCommentary = document.getElementById('toggleCommentary');
  const valMode = document.getElementById('valMode');
  const valCount = document.getElementById('valCount');
  const toastMessage = document.getElementById('toastMessage');

  let toastTimer = null;
  function showToast(msg, duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.textContent = msg;
    toastTimer = setTimeout(() => {
      toastMessage.textContent = '';
    }, duration);
  }

  function renderStatus(status, mode = 'DEV') {
    statusDot.className = 'status-dot';
    valMode.textContent = mode || 'DEV';

    if (status === 'Connected') {
      statusDot.classList.add('connected');
      statusLabel.textContent = 'Connected';
      statusSub.textContent = `IPC Active [${mode}]`;
    } else if (status === 'SILENT Air-Gap') {
      statusDot.classList.add('silent');
      statusLabel.textContent = 'SILENT Air-Gap';
      statusSub.textContent = 'Ingest Blocked (Air-Gapped)';
    } else {
      statusDot.classList.add('offline');
      statusLabel.textContent = 'Offline';
      statusSub.textContent = '127.0.0.1:47630 unreachable';
    }
  }

  // Load stored state
  chrome.storage.local.get(
    ['nexus_bearer_token', 'speak_commentary', 'last_status', 'events_count'],
    (items) => {
      if (items.nexus_bearer_token) {
        inputToken.value = items.nexus_bearer_token;
      }
      toggleCommentary.checked = items.speak_commentary !== false;
      valCount.textContent = items.events_count || 0;
      renderStatus(items.last_status || 'Offline');
      checkStatus();
    }
  );

  function checkStatus() {
    statusLabel.textContent = 'Connecting...';
    chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (res) => {
      if (chrome.runtime.lastError) {
        renderStatus('Offline');
        return;
      }
      if (res && res.success) {
        renderStatus(res.status, res.workspaceMode);
        if (res.events && Array.isArray(res.events)) {
          valCount.textContent = res.events.length;
          chrome.storage.local.set({ events_count: res.events.length });
        }
      } else if (res && res.status === 'SILENT Air-Gap') {
        renderStatus('SILENT Air-Gap', 'SILENT');
      } else {
        renderStatus('Offline');
      }
    });
  }

  btnRefresh.addEventListener('click', () => {
    checkStatus();
    showToast('Pinging Nexus IPC server...');
  });

  btnSaveToken.addEventListener('click', () => {
    const token = inputToken.value.trim();
    chrome.storage.local.set({ nexus_bearer_token: token }, () => {
      showToast('Token saved to local storage.');
      checkStatus();
    });
  });

  btnAutoDetect.addEventListener('click', () => {
    showToast('Auto-detecting from loopback...');
    chrome.runtime.sendMessage({ type: 'AUTO_DISCOVER_TOKEN' }, (res) => {
      if (res && res.success && res.token) {
        inputToken.value = res.token;
        showToast('Token detected & saved!');
        checkStatus();
      } else {
        showToast('Auto-detection failed. Is Nexus running?');
      }
    });
  });

  toggleCommentary.addEventListener('change', () => {
    const enabled = toggleCommentary.checked;
    chrome.storage.local.set({ speak_commentary: enabled }, () => {
      showToast(enabled ? 'TARS commentary enabled.' : 'TARS commentary disabled.');
    });
  });
});
