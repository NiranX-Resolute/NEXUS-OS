// Nexus OS v5.0 - Gemini Web Passive Ingest Bridge Content Script
// Implements recursive Shadow-DOM walking MutationObserver with 450ms quiet-window debounce

(function () {
  'use strict';

  const DEBOUNCE_QUIET_MS = 450;
  const processedHashes = new Set();
  const observedRoots = new WeakSet();
  let debounceTimer = null;

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  // Recursive text extraction diving through node.shadowRoot boundaries
  function extractDeepText(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }
    // Skip scripts, styles, and hidden visual clutter
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript') {
        return '';
      }
    }

    let text = '';
    if (node.shadowRoot) {
      text += extractDeepText(node.shadowRoot);
    }
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i++) {
      text += extractDeepText(children[i]);
    }
    return text;
  }

  // Recursively search DOM and all attached shadow roots for elements matching selectors
  function querySelectorAllDeep(root, selector, results = []) {
    if (!root) return results;
    if (root.querySelectorAll) {
      try {
        const matches = root.querySelectorAll(selector);
        for (let i = 0; i < matches.length; i++) {
          results.push(matches[i]);
        }
      } catch (err) {
        // Suppress invalid selector issues on specific custom host elements
      }
    }
    // Recursively walk elements to find shadow roots
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.shadowRoot) {
        querySelectorAllDeep(el.shadowRoot, selector, results);
      }
    }
    return results;
  }

  // Detect whether streaming / typing animations or pending states are active
  function isStreamingActive() {
    const streamingSelectors = [
      '.streaming',
      '[data-is-streaming="true"]',
      '.animating',
      '.loading',
      '.generating',
      '.show-cursor',
      '.typing-cursor',
      'mat-progress-spinner',
      '.sparkle-anim',
      'sparkle-hover',
      '.gemini-spinner'
    ];
    for (const sel of streamingSelectors) {
      const found = querySelectorAllDeep(document.body || document.documentElement, sel);
      if (found && found.length > 0) {
        return true;
      }
    }
    return false;
  }

  // Extract latest user prompt and completed model response
  function extractLatestInteraction() {
    const root = document.body || document.documentElement;

    // Search user prompts
    const promptSelectors = [
      '.user-query-container',
      'user-query',
      '[data-test-id="user-query"]',
      '.query-text',
      '.user-query-text',
      '.request-container',
      '.message-content.user'
    ];
    let userPrompts = [];
    for (const sel of promptSelectors) {
      userPrompts = querySelectorAllDeep(root, sel);
      if (userPrompts.length > 0) break;
    }

    let latestPrompt = '';
    if (userPrompts.length > 0) {
      latestPrompt = extractDeepText(userPrompts[userPrompts.length - 1]).trim();
    }

    // Search model responses
    const responseSelectors = [
      'model-response',
      '.model-response-text',
      '.response-container-content',
      '[data-test-id="model-response"]',
      'message-content.model',
      '.markdown',
      '.response-content'
    ];
    let modelResponses = [];
    for (const sel of responseSelectors) {
      modelResponses = querySelectorAllDeep(root, sel);
      if (modelResponses.length > 0) break;
    }

    let latestResponse = '';
    if (modelResponses.length > 0) {
      latestResponse = extractDeepText(modelResponses[modelResponses.length - 1]).trim();
    } else {
      // Fallback: search main role or chat container
      const main = document.querySelector('main, [role="main"], #chat-history');
      if (main) {
        latestResponse = extractDeepText(main).trim();
      }
    }

    return { prompt: latestPrompt, response: latestResponse };
  }

  function tryIngest() {
    // 1. Verify that token mutations and streaming indicators have genuinely stopped
    if (isStreamingActive()) {
      // Re-arm quiet-window debounce
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tryIngest, DEBOUNCE_QUIET_MS);
      return;
    }

    const { prompt, response } = extractLatestInteraction();
    if (!response || response.length < 15) {
      return;
    }

    const effectivePrompt = prompt || 'Passive Web Observation';
    const payloadHash = hashString(effectivePrompt + ':::' + response.slice(0, 300));
    if (processedHashes.has(payloadHash)) {
      return;
    }

    const payload = {
      source: 'gemini_web',
      prompt: effectivePrompt,
      response: response,
      url: window.location.href,
      timestamp: Date.now()
    };

    // Relay to background service worker
    try {
      chrome.runtime.sendMessage(
        {
          type: 'GEMINI_WEB_INGEST',
          payload: payload
        },
        (res) => {
          if (chrome.runtime.lastError) {
            console.debug('[Nexus Bridge] Background relay notice:', chrome.runtime.lastError.message);
            return;
          }
          if (res && res.success) {
            processedHashes.add(payloadHash);
            console.log(
              '[Nexus Bridge] Ingested Gemini Web interaction to Sovereign Store (ID: ' + (res.id || 'ok') + ')'
            );
          }
        }
      );
    } catch (err) {
      console.debug('[Nexus Bridge] Runtime messaging error:', err);
    }
  }

  // Recursive shadow-DOM observer attachment
  function attachShadowObservers(root) {
    if (!root) return;
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (el.shadowRoot && !observedRoots.has(el.shadowRoot)) {
        observedRoots.add(el.shadowRoot);
        const sObs = new MutationObserver(onMutation);
        sObs.observe(el.shadowRoot, {
          childList: true,
          subtree: true,
          characterData: true
        });
        attachShadowObservers(el.shadowRoot);
      }
    }
  }

  function onMutation() {
    // Check for newly created shadow roots
    attachShadowObservers(document.body || document.documentElement);

    // Reset 450ms quiet-window debounce timer
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tryIngest, DEBOUNCE_QUIET_MS);
  }

  // Initialize observers on main document
  const mainObserver = new MutationObserver(onMutation);
  const target = document.body || document.documentElement;
  if (target) {
    mainObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
    observedRoots.add(target);
    attachShadowObservers(target);
  }

  window.addEventListener('load', () => {
    attachShadowObservers(document.body);
    setTimeout(tryIngest, 1000);
  });
})();
