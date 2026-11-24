/**
 * Nexus Puter AI Chat Application
 * Powered by Puter.js (https://js.puter.com/v2/)
 * Universal frontier AI model orchestration for Nexus AI.
 */

// ---------------------------------------------------------------------------
// 1. Initial State & Built-in Model Presets
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT =
  'You are Nexus AI, an elite autonomous assistant and pairing engineer. Be concise, technically precise, and format all code in clean markdown blocks. Write mathematical equations in LaTeX notation with $ or $$.';

const POPULAR_MODELS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'openai', desc: 'Frontier multimodal flagship model' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', desc: 'Hybrid reasoning & coding intelligence' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', desc: 'Industry-standard code & reasoning model' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', desc: 'State-of-the-art open reasoning model' },
  { id: 'gemini-2.5-flash', name: 'Google Gemini 2.5 Flash', provider: 'google', desc: 'Ultra-fast multimodal 1M context' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', provider: 'meta', desc: 'Powerful open weights foundation model' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', desc: 'High-speed compact model' },
  { id: 'mistralai/mistral-large-2411', name: 'Mistral Large', provider: 'mistral', desc: 'Flagship multilingual reasoning engine' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct', provider: 'alibaba', desc: 'Top tier coding & math foundation' },
  { id: 'ollama/qwen2.5-coder:7b', name: 'Local Ollama Coder', provider: 'ollama', desc: '100% Sovereign air-gapped local model' }
];

const FREE_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', desc: 'High-speed default model' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', desc: 'Lightweight fast Google model' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', provider: 'deepseek', desc: 'Free reasoning tier' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', provider: 'meta', desc: 'Free fast text generation' }
];

const REASONING_MODELS = [
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', provider: 'deepseek', desc: 'Autonomous chain of thought reasoning' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', desc: 'Extended thinking and deep logic' },
  { id: 'openai/o3-mini', name: 'OpenAI o3-mini', provider: 'openai', desc: 'STEM and competitive coding reasoner' },
  { id: 'ollama/qwen2.5-coder:7b', name: 'Local Qwen 2.5 Coder', provider: 'ollama', desc: 'Air-gapped local logic reasoner' }
];

const VISION_MODELS = [
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'openai', desc: 'High resolution visual understanding' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', desc: 'Visual diagram and document analysis' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', desc: 'Long context multimodal video/image' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', desc: 'Fast multimodal visual processing' }
];

// App State
let state = {
  currentModel: localStorage.getItem('nexus_puter_model') || 'gpt-4o',
  systemPrompt: localStorage.getItem('nexus_puter_sys_prompt') || DEFAULT_SYSTEM_PROMPT,
  temperature: parseFloat(localStorage.getItem('nexus_puter_temp') || '0.7'),
  maxTokens: parseInt(localStorage.getItem('nexus_puter_max_tokens') || '4096', 10),
  reasoningEffort: localStorage.getItem('nexus_puter_reasoning') || '',
  testMode: localStorage.getItem('nexus_puter_test_mode') === 'true',
  activeSessionId: null,
  sessions: {},
  liveModels: [],
  attachments: [],
  isStreaming: false,
  shouldStopStream: false,
  puterUser: null
};

// ---------------------------------------------------------------------------
// 2. DOM Elements
// ---------------------------------------------------------------------------
const elements = {
  // Top bar
  currentModelLabel: document.getElementById('current-model-label'),
  activeModelDisplay: document.getElementById('active-model-display'),
  modelProviderDisplay: document.getElementById('model-provider-display'),
  modelContextDisplay: document.getElementById('model-context-display'),
  streamingIndicator: document.getElementById('streaming-indicator'),
  totalTokensBadge: document.getElementById('total-tokens-badge'),
  modelStatusIndicator: document.getElementById('model-status-indicator'),
  modelModalTrigger: document.getElementById('model-modal-trigger'),
  settingsDrawerTrigger: document.getElementById('settings-drawer-trigger'),
  puterAuthBtn: document.getElementById('puter-auth-btn'),
  puterUserStatus: document.getElementById('puter-user-status'),
  newChatTopBtn: document.getElementById('new-chat-top-btn'),

  // Sidebar
  toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
  closeSidebarBtn: document.getElementById('close-sidebar-btn'),
  chatSidebar: document.getElementById('chat-sidebar'),
  sidebarNewChatBtn: document.getElementById('sidebar-new-chat-btn'),
  sessionsList: document.getElementById('sessions-list'),
  sessionsCount: document.getElementById('sessions-count'),
  clearAllSessionsBtn: document.getElementById('clear-all-sessions-btn'),
  exportChatMdBtn: document.getElementById('export-chat-md-btn'),
  exportChatJsonBtn: document.getElementById('export-chat-json-btn'),
  syncStatus: document.getElementById('sync-status'),

  // Chat Area
  messagesContainer: document.getElementById('messages-container'),
  welcomeHero: document.getElementById('welcome-hero'),
  messagesList: document.getElementById('messages-list'),
  attachmentTray: document.getElementById('attachment-tray'),
  attachmentPreviews: document.getElementById('attachment-previews'),
  chatForm: document.getElementById('chat-form'),
  userInput: document.getElementById('user-input'),
  fileInput: document.getElementById('file-input'),
  attachBtn: document.getElementById('attach-btn'),
  voiceInputBtn: document.getElementById('voice-input-btn'),
  stopStreamBtn: document.getElementById('stop-stream-btn'),
  sendBtn: document.getElementById('send-btn'),

  // Model Modal
  modelModal: document.getElementById('model-modal'),
  closeModelModalBtn: document.getElementById('close-model-modal-btn'),
  customModelInput: document.getElementById('custom-model-input'),
  applyCustomModelBtn: document.getElementById('apply-custom-model-btn'),
  modelSearchInput: document.getElementById('model-search-input'),
  modelGrid: document.getElementById('model-grid'),
  totalModelsCount: document.getElementById('total-models-count'),

  // Settings Drawer
  settingsDrawer: document.getElementById('settings-drawer'),
  closeSettingsDrawerBtn: document.getElementById('close-settings-drawer-btn'),
  systemPromptInput: document.getElementById('system-prompt-input'),
  temperatureSlider: document.getElementById('temperature-slider'),
  tempVal: document.getElementById('temp-val'),
  maxTokensSlider: document.getElementById('max-tokens-slider'),
  maxTokensVal: document.getElementById('max-tokens-val'),
  reasoningEffortSelect: document.getElementById('reasoning-effort-select'),
  testModeToggle: document.getElementById('test-mode-toggle'),
  resetParamsBtn: document.getElementById('reset-params-btn'),
  saveParamsBtn: document.getElementById('save-params-btn')
};

// ---------------------------------------------------------------------------
// 3. Puter.js Detection & Authentication
// ---------------------------------------------------------------------------
async function initPuter() {
  if (typeof window.puter === 'undefined') {
    elements.modelStatusIndicator.textContent = 'Puter.js script connecting...';
    elements.modelStatusIndicator.className = 'text-amber-400';
    let retries = 0;
    while (typeof window.puter === 'undefined' && retries < 20) {
      await new Promise((r) => setTimeout(r, 200));
      retries++;
    }
  }

  if (typeof window.puter !== 'undefined') {
    elements.modelStatusIndicator.textContent = 'Puter.js Connected (500+ LLMs)';
    elements.modelStatusIndicator.className = 'text-emerald-400';

    // Check Puter Auth
    try {
      if (window.puter.auth && typeof window.puter.auth.isSignedIn === 'function') {
        const signedIn = window.puter.auth.isSignedIn();
        if (signedIn) {
          const user = await window.puter.auth.getUser();
          state.puterUser = user;
          updateAuthUI(user);
        }
      }
    } catch (e) {
      console.warn('Puter Auth Check:', e);
    }

    // Fetch Live Models Catalog
    loadLiveModels();

    // Load KV Sessions
    loadSessionsFromStorage();
  } else {
    elements.modelStatusIndicator.textContent = 'Local Sovereign Fallback Active';
    elements.modelStatusIndicator.className = 'text-amber-400 font-bold';
    renderModelList(POPULAR_MODELS);
    loadSessionsFromStorage();
  }
}

function updateAuthUI(user) {
  if (user && user.username) {
    elements.puterUserStatus.textContent = `@${user.username}`;
    elements.puterAuthBtn.classList.remove('text-cyan-200', 'border-cyan-500/30');
    elements.puterAuthBtn.classList.add('text-emerald-300', 'border-emerald-500/40', 'bg-emerald-500/10');
  } else {
    elements.puterUserStatus.textContent = 'Sign In';
    elements.puterAuthBtn.classList.remove('text-emerald-300', 'border-emerald-500/40', 'bg-emerald-500/10');
    elements.puterAuthBtn.classList.add('text-cyan-200', 'border-cyan-500/30');
  }
}

async function handlePuterAuth() {
  if (!window.puter || !window.puter.auth) {
    alert('Puter.js is still initializing. Please try again in a moment.');
    return;
  }

  if (state.puterUser) {
    const confirmSignOut = confirm(`Signed in as @${state.puterUser.username}. Sign out?`);
    if (confirmSignOut) {
      await window.puter.auth.signOut();
      state.puterUser = null;
      updateAuthUI(null);
    }
  } else {
    try {
      const res = await window.puter.auth.signIn();
      const user = await window.puter.auth.getUser();
      state.puterUser = user;
      updateAuthUI(user);
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Model Catalog & Filtering
// ---------------------------------------------------------------------------
async function loadLiveModels() {
  try {
    if (window.puter && window.puter.ai && typeof window.puter.ai.listModels === 'function') {
      const models = await window.puter.ai.listModels();
      if (Array.isArray(models) && models.length > 0) {
        state.liveModels = models;
        elements.totalModelsCount.textContent = `${models.length}+`;
        renderModelList(POPULAR_MODELS);
        updateActiveModelInfo();
        return;
      }
    }
  } catch (err) {
    console.warn('Could not fetch live Puter models:', err);
  }
  // Fallback to built-in list
  state.liveModels = POPULAR_MODELS;
  renderModelList(POPULAR_MODELS);
  updateActiveModelInfo();
}

function updateActiveModelInfo() {
  const modelId = state.currentModel;
  elements.currentModelLabel.textContent = modelId;
  elements.activeModelDisplay.textContent = modelId;

  // Find info from live models or popular models
  const found =
    state.liveModels.find((m) => m.id === modelId || m.puterId === modelId) ||
    POPULAR_MODELS.find((m) => m.id === modelId);

  if (found) {
    elements.modelProviderDisplay.textContent = found.provider || found.name || 'Puter AI';
    elements.modelContextDisplay.textContent = found.context
      ? `${Math.round(found.context / 1000)}k context`
      : 'Frontier context';
  } else {
    elements.modelProviderDisplay.textContent = 'Custom LLM';
    elements.modelContextDisplay.textContent = 'User Defined';
  }
}

function renderModelList(modelsToRender) {
  elements.modelGrid.innerHTML = '';
  if (!modelsToRender || modelsToRender.length === 0) {
    elements.modelGrid.innerHTML = `
      <div class="text-center py-8 text-zinc-500 font-mono text-xs">
        No matching models found. Try entering a custom model ID above.
      </div>
    `;
    return;
  }

  modelsToRender.slice(0, 80).forEach((model) => {
    const isSelected = state.currentModel === model.id || state.currentModel === model.puterId;
    const card = document.createElement('div');
    card.className = `p-3 rounded-xl border transition cursor-pointer flex items-center justify-between group ${
      isSelected
        ? 'border-emerald-500/60 bg-emerald-500/10'
        : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15'
    }`;

    const modelName = model.name || model.id;
    const modelId = model.id || model.puterId;
    const provider = model.provider || 'AI';
    const context = model.context ? `${Math.round(model.context / 1000)}k` : '';

    card.innerHTML = `
      <div class="min-w-0 flex-1 pr-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-bold text-zinc-100 group-hover:text-emerald-300 truncate">${modelName}</span>
          <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-zinc-400 uppercase border border-white/10">${provider}</span>
          ${context ? `<span class="text-[9px] font-mono text-zinc-500">${context}</span>` : ''}
        </div>
        <div class="text-[11px] font-mono text-zinc-500 truncate">${modelId}</div>
      </div>
      <button class="px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition ${
        isSelected
          ? 'bg-emerald-500 text-black font-bold'
          : 'bg-white/5 text-zinc-300 group-hover:bg-emerald-500/20 group-hover:text-emerald-200'
      }">
        ${isSelected ? 'Active' : 'Select'}
      </button>
    `;

    card.addEventListener('click', () => {
      selectModel(modelId);
      closeModelModal();
    });

    elements.modelGrid.appendChild(card);
  });
}

function selectModel(modelId) {
  if (!modelId) return;
  state.currentModel = modelId.trim();
  localStorage.setItem('nexus_puter_model', state.currentModel);
  updateActiveModelInfo();
  updateSessionsUI();
}

function openModelModal() {
  elements.modelModal.classList.remove('hidden');
  elements.customModelInput.value = state.currentModel;
  renderModelList(POPULAR_MODELS);
  lucide.createIcons();
}

function closeModelModal() {
  elements.modelModal.classList.add('hidden');
}

// ---------------------------------------------------------------------------
// 5. Session & Storage Management
// ---------------------------------------------------------------------------
function generateId() {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createNewSession() {
  const id = generateId();
  state.sessions[id] = {
    id,
    title: 'New Conversation',
    createdAt: Date.now(),
    model: state.currentModel,
    messages: []
  };
  state.activeSessionId = id;
  saveSessionsToStorage();
  renderCurrentSession();
  updateSessionsUI();
}

function getActiveSession() {
  if (!state.activeSessionId || !state.sessions[state.activeSessionId]) {
    createNewSession();
  }
  return state.sessions[state.activeSessionId];
}

async function loadSessionsFromStorage() {
  let loaded = false;
  // Try Puter KV first if available
  if (window.puter && window.puter.kv && typeof window.puter.kv.get === 'function') {
    try {
      const kvData = await window.puter.kv.get('nexus_puter_sessions');
      if (kvData && typeof kvData === 'object' && Object.keys(kvData).length > 0) {
        state.sessions = kvData;
        loaded = true;
        elements.syncStatus.textContent = 'Puter KV Synced';
      }
    } catch (e) {
      console.warn('Puter KV load skipped:', e);
    }
  }

  // Fallback to localStorage
  if (!loaded) {
    try {
      const local = localStorage.getItem('nexus_puter_sessions');
      if (local) {
        state.sessions = JSON.parse(local);
      }
    } catch (e) {}
  }

  const sessionIds = Object.keys(state.sessions);
  if (sessionIds.length > 0) {
    state.activeSessionId = sessionIds[sessionIds.length - 1];
  } else {
    createNewSession();
  }

  renderCurrentSession();
  updateSessionsUI();
}

async function saveSessionsToStorage() {
  // Save locally
  try {
    localStorage.setItem('nexus_puter_sessions', JSON.stringify(state.sessions));
  } catch (e) {}

  // Save to Puter KV asynchronously
  if (window.puter && window.puter.kv && typeof window.puter.kv.set === 'function') {
    try {
      await window.puter.kv.set('nexus_puter_sessions', state.sessions);
      elements.syncStatus.textContent = 'Puter KV Synced';
    } catch (e) {
      elements.syncStatus.textContent = 'Local Storage Only';
    }
  }
}

function updateSessionsUI() {
  elements.sessionsList.innerHTML = '';
  const sessionList = Object.values(state.sessions).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  elements.sessionsCount.textContent = sessionList.length;

  sessionList.forEach((sess) => {
    const isActive = sess.id === state.activeSessionId;
    const item = document.createElement('div');
    item.className = `p-2 rounded-xl text-xs flex items-center justify-between group transition cursor-pointer ${
      isActive
        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
        : 'hover:bg-white/5 text-zinc-400 hover:text-zinc-200'
    }`;

    item.innerHTML = `
      <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
        <i data-lucide="${isActive ? 'message-square-code' : 'message-square'}" class="w-3.5 h-3.5 shrink-0 ${
      isActive ? 'text-emerald-400' : 'text-zinc-500'
    }"></i>
        <span class="truncate font-medium">${escapeHtml(sess.title || 'Conversation')}</span>
      </div>
      <button class="delete-session-btn opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition" title="Delete conversation">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-session-btn')) return;
      state.activeSessionId = sess.id;
      renderCurrentSession();
      updateSessionsUI();
      // On mobile, close sidebar
      if (window.innerWidth < 1024) {
        elements.chatSidebar.classList.add('-translate-x-full');
      }
    });

    const delBtn = item.querySelector('.delete-session-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(sess.id);
    });

    elements.sessionsList.appendChild(item);
  });

  lucide.createIcons();
}

function deleteSession(id) {
  delete state.sessions[id];
  const remaining = Object.keys(state.sessions);
  if (remaining.length > 0) {
    state.activeSessionId = remaining[remaining.length - 1];
  } else {
    createNewSession();
  }
  saveSessionsToStorage();
  renderCurrentSession();
  updateSessionsUI();
}

function clearAllSessions() {
  if (confirm('Are you sure you want to delete all chat history?')) {
    state.sessions = {};
    createNewSession();
  }
}

// ---------------------------------------------------------------------------
// 6. Message Rendering (Markdown, Math, Code Copy)
// ---------------------------------------------------------------------------
function configureMarked() {
  const renderer = new marked.Renderer();

  // Custom code renderer with header and copy button
  renderer.code = function ({ text, lang }) {
    const validLang = lang && hljs.getLanguage(lang) ? lang : '';
    const highlighted = validLang
      ? hljs.highlight(text, { language: validLang }).value
      : hljs.highlightAuto(text).value;

    const displayLang = validLang || 'code';
    const escapedRaw = encodeURIComponent(text);

    return `
      <div class="my-3 rounded-xl overflow-hidden border border-white/10 bg-[#090d14]">
        <div class="code-block-header">
          <span class="font-mono text-[11px] text-zinc-400 uppercase font-bold">${displayLang}</span>
          <button class="copy-btn" data-code="${escapedRaw}" onclick="copyCode(this)">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy</span>
          </button>
        </div>
        <pre class="p-3.5 text-xs font-mono overflow-x-auto text-zinc-200"><code>${highlighted}</code></pre>
      </div>
    `;
  };

  marked.setOptions({
    renderer,
    breaks: true,
    gfm: true
  });
}
configureMarked();

window.copyCode = function (btn) {
  const code = decodeURIComponent(btn.getAttribute('data-code'));
  navigator.clipboard.writeText(code).then(() => {
    const span = btn.querySelector('span');
    span.textContent = 'Copied!';
    btn.style.color = '#34d399';
    setTimeout(() => {
      span.textContent = 'Copy';
      btn.style.color = '';
    }, 2000);
  });
};

function renderMarkdownAndMath(element, text) {
  const rawHtml = marked.parse(text || '');
  const cleanHtml = DOMPurify.sanitize(rawHtml);
  element.innerHTML = cleanHtml;

  // Render LaTeX formulas with KaTeX
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

function renderCurrentSession() {
  const sess = getActiveSession();
  elements.messagesList.innerHTML = '';

  if (!sess.messages || sess.messages.length === 0) {
    elements.welcomeHero.classList.remove('hidden');
    elements.totalTokensBadge.textContent = '0 tokens';
    return;
  }

  elements.welcomeHero.classList.add('hidden');

  let totalChars = 0;
  sess.messages.forEach((msg, idx) => {
    totalChars += (msg.content || '').length;
    appendMessageElement(msg, idx);
  });

  const estimatedTokens = Math.round(totalChars / 4);
  elements.totalTokensBadge.textContent = `${estimatedTokens.toLocaleString()} tokens`;
  scrollToBottom();
}

function appendMessageElement(msg, idx) {
  const isUser = msg.role === 'user';
  const item = document.createElement('div');
  item.className = `flex gap-3 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`;

  if (isUser) {
    item.innerHTML = `
      <div class="max-w-[85%] sm:max-w-[75%] space-y-1.5">
        <div class="rounded-2xl rounded-tr-sm bg-gradient-to-br from-emerald-500/20 to-teal-600/10 border border-emerald-500/30 p-3.5 sm:p-4 text-zinc-100 text-sm shadow-lg shadow-emerald-500/5 whitespace-pre-wrap leading-relaxed">
          ${escapeHtml(msg.content)}
        </div>
        <div class="text-[10px] font-mono text-zinc-500 text-right pr-1">
          ${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'You'}
        </div>
      </div>
      <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0 self-start shadow">
        <i data-lucide="user" class="w-4 h-4"></i>
      </div>
    `;
  } else {
    item.innerHTML = `
      <div class="w-8 h-8 rounded-xl bg-nexus-900 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 self-start shadow-md shadow-emerald-500/10">
        <i data-lucide="bot" class="w-4 h-4"></i>
      </div>
      <div class="max-w-[85%] sm:max-w-[80%] space-y-1.5">
        <div class="flex items-center gap-2 pl-1 text-[11px] font-mono text-zinc-400">
          <span class="font-bold text-emerald-400">${escapeHtml(msg.model || state.currentModel)}</span>
          <span class="text-zinc-600">&bull;</span>
          <span>${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Puter.js'}</span>
        </div>
        <div class="rounded-2xl rounded-tl-sm bg-nexus-900/90 border border-white/10 p-4 sm:p-5 text-zinc-100 text-sm shadow-xl shadow-black/40 prose-chat">
          <div class="message-content"></div>
        </div>
        <div class="flex items-center gap-2 pl-1">
          <button class="copy-msg-btn text-[11px] text-zinc-500 hover:text-emerald-300 flex items-center gap-1 transition" title="Copy message">
            <i data-lucide="copy" class="w-3 h-3"></i> Copy
          </button>
          <button class="speak-msg-btn text-[11px] text-zinc-500 hover:text-cyan-300 flex items-center gap-1 transition" title="Speak aloud">
            <i data-lucide="volume-2" class="w-3 h-3"></i> Speak
          </button>
        </div>
      </div>
    `;

    const contentDiv = item.querySelector('.message-content');
    renderMarkdownAndMath(contentDiv, msg.content);

    // Message action buttons
    const copyBtn = item.querySelector('.copy-msg-btn');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content);
      copyBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i> Copied';
      lucide.createIcons();
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i> Copy';
        lucide.createIcons();
      }, 2000);
    });

    const speakBtn = item.querySelector('.speak-msg-btn');
    speakBtn.addEventListener('click', () => speakMessage(msg.content));
  }

  elements.messagesList.appendChild(item);
  lucide.createIcons();
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// 7. Real-Time Streaming Chat Execution via Puter.js
// ---------------------------------------------------------------------------
async function handleChatSubmit(e) {
  if (e) e.preventDefault();
  const text = elements.userInput.value.trim();
  if ((!text && state.attachments.length === 0) || state.isStreaming) return;

  const sess = getActiveSession();

  // Reset Input
  elements.userInput.value = '';
  elements.userInput.style.height = 'auto';

  // Build message content
  let fullPrompt = text;
  if (state.attachments.length > 0) {
    fullPrompt += `\n\nAttached files:\n${state.attachments.map((a) => `- ${a.name} (${a.type})`).join('\n')}`;
  }

  // Update session title if first message
  if (sess.messages.length === 0) {
    sess.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
  }

  // Append user message
  const userMsg = {
    role: 'user',
    content: fullPrompt,
    timestamp: Date.now()
  };
  sess.messages.push(userMsg);
  appendMessageElement(userMsg, sess.messages.length - 1);
  elements.welcomeHero.classList.add('hidden');
  scrollToBottom();

  // Clear attachments tray
  state.attachments = [];
  elements.attachmentTray.classList.add('hidden');
  elements.attachmentPreviews.innerHTML = '';

  // Prepare Assistant message container
  const assistantMsg = {
    role: 'assistant',
    model: state.currentModel,
    content: '',
    timestamp: Date.now()
  };
  sess.messages.push(assistantMsg);

  // Create streaming bubble DOM element
  const streamItem = document.createElement('div');
  streamItem.className = 'flex gap-3 sm:gap-4 justify-start';
  streamItem.innerHTML = `
    <div class="w-8 h-8 rounded-xl bg-nexus-900 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 self-start shadow-md shadow-emerald-500/10">
      <i data-lucide="bot" class="w-4 h-4"></i>
    </div>
    <div class="max-w-[85%] sm:max-w-[80%] space-y-1.5">
      <div class="flex items-center gap-2 pl-1 text-[11px] font-mono text-zinc-400">
        <span class="font-bold text-emerald-400">${escapeHtml(state.currentModel)}</span>
        <span class="text-zinc-600">&bull;</span>
        <span class="text-emerald-400 font-bold flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Streaming
        </span>
      </div>
      <div class="rounded-2xl rounded-tl-sm bg-nexus-900/90 border border-white/10 p-4 sm:p-5 text-zinc-100 text-sm shadow-xl shadow-black/40 prose-chat">
        <div class="message-content"></div>
        <span class="stream-cursor"></span>
      </div>
    </div>
  `;
  elements.messagesList.appendChild(streamItem);
  lucide.createIcons();
  scrollToBottom();

  const streamContentDiv = streamItem.querySelector('.message-content');
  const streamCursor = streamItem.querySelector('.stream-cursor');

  // Streaming control state
  state.isStreaming = true;
  state.shouldStopStream = false;
  elements.streamingIndicator.classList.remove('hidden');
  elements.streamingIndicator.classList.add('flex');
  elements.stopStreamBtn.classList.remove('hidden');
  elements.sendBtn.classList.add('hidden');

  // Build message history for Puter
  const messagesPayload = [
    { role: 'system', content: state.systemPrompt },
    ...sess.messages.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content
    }))
  ];

  try {
    let streamingSuccess = false;
    let accumulatedText = '';

    // Check if Puter.js is loaded and not on a restricted origin (e.g. file://)
    const isPuterAvailable =
      window.puter &&
      window.puter.ai &&
      typeof window.puter.ai.chat === 'function' &&
      window.location.protocol !== 'file:' &&
      !state.currentModel.startsWith('ollama/');

    if (isPuterAvailable) {
      try {
        const options = {
          model: state.currentModel,
          stream: true,
          temperature: state.temperature,
          max_tokens: state.maxTokens
        };
        if (state.reasoningEffort) options.reasoning_effort = state.reasoningEffort;
        if (state.testMode) options.testMode = true;

        const responseStream = await window.puter.ai.chat(messagesPayload, options);
        for await (const chunk of responseStream) {
          if (state.shouldStopStream) break;

          if (chunk.type === 'text' && chunk.text) {
            accumulatedText += chunk.text;
          } else if (typeof chunk === 'string') {
            accumulatedText += chunk;
          } else if (chunk.text) {
            accumulatedText += chunk.text;
          } else if (chunk.type === 'error') {
            accumulatedText += `\n\n*[Puter Stream Notice: ${chunk.message || 'Stream interrupted'}]*`;
            break;
          }

          assistantMsg.content = accumulatedText;
          renderMarkdownAndMath(streamContentDiv, accumulatedText);
          scrollToBottom();
        }
        streamingSuccess = true;
      } catch (puterErr) {
        console.warn('Puter.js failed, falling back to local sovereign engine...', puterErr);
      }
    }

    // -------------------------------------------------------------------------
    // Automatic Failover: Local Sovereign Engine & Air-Gapped Local LLMs
    // -------------------------------------------------------------------------
    if (!streamingSuccess) {
      // 1. Display "Local Sovereign Fallback Active" indicator in UI
      if (elements.modelStatusIndicator) {
        elements.modelStatusIndicator.textContent = 'Local Sovereign Fallback Active';
        elements.modelStatusIndicator.className = 'text-amber-400 font-bold';
      }

      accumulatedText += (accumulatedText ? '\n\n' : '') + '*[Local Sovereign Fallback Active]*\n\n';
      renderMarkdownAndMath(streamContentDiv, accumulatedText);

      // Strategy A: Sovereign Engine (:47630 /api/chat)
      try {
        const sovereignResp = await fetch('http://127.0.0.1:47630/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messagesPayload,
            model: state.currentModel,
            stream: true,
            temperature: state.temperature
          })
        }).catch(() => null);

        if (sovereignResp && sovereignResp.ok) {
          const contentType = sovereignResp.headers.get('content-type') || '';
          if (contentType.includes('text/event-stream') || sovereignResp.body) {
            const reader = sovereignResp.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              if (state.shouldStopStream) break;
              const { done, value } = await reader.read();
              if (done) break;
              const chunkStr = decoder.decode(value, { stream: true });
              const lines = chunkStr.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith('data:')) {
                  const dataStr = trimmed.slice(5).trim();
                  if (dataStr === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const token = parsed.choices?.[0]?.delta?.content || parsed.response || parsed.text || '';
                    if (token) {
                      accumulatedText += token;
                      assistantMsg.content = accumulatedText;
                      renderMarkdownAndMath(streamContentDiv, accumulatedText);
                      scrollToBottom();
                    }
                  } catch {}
                } else {
                  try {
                    const parsed = JSON.parse(trimmed);
                    const token = parsed.response || parsed.text || parsed.message?.content || '';
                    if (token) {
                      accumulatedText += token;
                      assistantMsg.content = accumulatedText;
                      renderMarkdownAndMath(streamContentDiv, accumulatedText);
                      scrollToBottom();
                    }
                  } catch {}
                }
              }
            }
            streamingSuccess = true;
          } else {
            const json = await sovereignResp.json().catch(() => null);
            if (json) {
              const textOutput = json.response || json.text || json.output || json.message?.content || '';
              if (textOutput) {
                accumulatedText += textOutput;
                assistantMsg.content = accumulatedText;
                renderMarkdownAndMath(streamContentDiv, accumulatedText);
                scrollToBottom();
                streamingSuccess = true;
              }
            }
          }
        }
      } catch (sovErr) {
        console.debug('Sovereign engine :47630 unreachable, trying Ollama v1 completions...', sovErr);
      }

      // Strategy B: Local Ollama OpenAI-compatible endpoint (:11434/v1/chat/completions)
      if (!streamingSuccess) {
        try {
          const modelName = state.currentModel.replace('ollama/', '') || 'qwen2.5-coder:7b';
          const v1Resp = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages: messagesPayload,
              stream: true,
              temperature: state.temperature
            })
          }).catch(() => null);

          if (v1Resp && v1Resp.ok && v1Resp.body) {
            const reader = v1Resp.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              if (state.shouldStopStream) break;
              const { done, value } = await reader.read();
              if (done) break;
              const chunkStr = decoder.decode(value, { stream: true });
              const lines = chunkStr.split('\n');
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const dataStr = trimmed.slice(5).trim();
                if (dataStr === '[DONE]') break;
                try {
                  const parsed = JSON.parse(dataStr);
                  const token = parsed.choices?.[0]?.delta?.content || '';
                  if (token) {
                    accumulatedText += token;
                    assistantMsg.content = accumulatedText;
                    renderMarkdownAndMath(streamContentDiv, accumulatedText);
                    scrollToBottom();
                  }
                } catch {}
              }
            }
            streamingSuccess = true;
          }
        } catch (v1Err) {
          console.debug('Ollama v1 endpoint unreachable, trying native Ollama chat...', v1Err);
        }
      }

      // Strategy C: Native Ollama API (:11434/api/chat)
      if (!streamingSuccess) {
        try {
          const modelName = state.currentModel.replace('ollama/', '') || 'qwen2.5-coder:7b';
          const ollamaRes = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelName,
              messages: messagesPayload,
              stream: true
            })
          });

          if (ollamaRes.ok && ollamaRes.body) {
            const reader = ollamaRes.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              if (state.shouldStopStream) break;
              const { done, value } = await reader.read();
              if (done) break;
              const chunkStr = decoder.decode(value, { stream: true });
              const lines = chunkStr.split('\n');
              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  if (parsed.message?.content) {
                    accumulatedText += parsed.message.content;
                    assistantMsg.content = accumulatedText;
                    renderMarkdownAndMath(streamContentDiv, accumulatedText);
                    scrollToBottom();
                  }
                } catch {}
              }
            }
            streamingSuccess = true;
          }
        } catch (ollamaErr) {
          console.warn('Native Ollama fallback unreachable:', ollamaErr);
        }
      }

      if (!streamingSuccess) {
        throw new Error('Neither Puter AI nor local sovereign fallbacks (127.0.0.1:47630 / 127.0.0.1:11434) could be reached.');
      }
    }

    if (!accumulatedText.trim()) {
      accumulatedText = '(No response text returned by model.)';
      assistantMsg.content = accumulatedText;
      renderMarkdownAndMath(streamContentDiv, accumulatedText);
    }
  } catch (err) {
    console.error('Chat Execution Error:', err);
    const errorMsg = `\n\n❌ **AI Gateway Notice**: ${err.message || String(err)}`;
    assistantMsg.content += errorMsg;
    renderMarkdownAndMath(streamContentDiv, assistantMsg.content);
  } finally {
    state.isStreaming = false;
    elements.streamingIndicator.classList.add('hidden');
    elements.streamingIndicator.classList.remove('flex');
    elements.stopStreamBtn.classList.add('hidden');
    elements.sendBtn.classList.remove('hidden');
    if (streamCursor) streamCursor.remove();

    saveSessionsToStorage();
    renderCurrentSession();
    updateSessionsUI();
  }
}

// Stop Stream
function handleStopStream() {
  state.shouldStopStream = true;
  elements.streamingIndicator.classList.add('hidden');
  elements.stopStreamBtn.classList.add('hidden');
  elements.sendBtn.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 8. Audio Speech Synthesis & Voice Input
// ---------------------------------------------------------------------------
function speakMessage(text) {
  if (!('speechSynthesis' in window)) {
    alert('Speech synthesis is not supported in this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[*_#`~]/g, '')
    .slice(0, 1500);

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    elements.voiceInputBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  let isRecording = false;

  elements.voiceInputBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
      return;
    }
    recognition.start();
    isRecording = true;
    elements.voiceInputBtn.classList.add('text-red-400', 'animate-pulse');
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    elements.userInput.value = (elements.userInput.value + ' ' + transcript).trim();
    autoResizeTextarea();
  };

  recognition.onerror = () => {
    isRecording = false;
    elements.voiceInputBtn.classList.remove('text-red-400', 'animate-pulse');
  };

  recognition.onend = () => {
    isRecording = false;
    elements.voiceInputBtn.classList.remove('text-red-400', 'animate-pulse');
  };
}

// ---------------------------------------------------------------------------
// 9. File Attachments
// ---------------------------------------------------------------------------
function handleFileSelection(files) {
  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      state.attachments.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: e.target.result
      });
      renderAttachmentsTray();
    };
    reader.readAsDataURL(file);
  });
}

function renderAttachmentsTray() {
  if (state.attachments.length === 0) {
    elements.attachmentTray.classList.add('hidden');
    elements.attachmentPreviews.innerHTML = '';
    return;
  }

  elements.attachmentTray.classList.remove('hidden');
  elements.attachmentPreviews.innerHTML = '';

  state.attachments.forEach((att, idx) => {
    const item = document.createElement('div');
    item.className =
      'flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-xs shrink-0';
    item.innerHTML = `
      <i data-lucide="file" class="w-3.5 h-3.5 text-emerald-400"></i>
      <span class="max-w-[120px] truncate font-mono">${escapeHtml(att.name)}</span>
      <button class="remove-att-btn text-zinc-400 hover:text-red-400" data-index="${idx}">
        <i data-lucide="x" class="w-3 h-3"></i>
      </button>
    `;

    item.querySelector('.remove-att-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.attachments.splice(idx, 1);
      renderAttachmentsTray();
    });

    elements.attachmentPreviews.appendChild(item);
  });

  lucide.createIcons();
}

// ---------------------------------------------------------------------------
// 10. Export Functions
// ---------------------------------------------------------------------------
function exportChatMarkdown() {
  const sess = getActiveSession();
  let md = `# ${sess.title || 'Nexus AI Chat Session'}\n`;
  md += `Date: ${new Date(sess.createdAt || Date.now()).toLocaleString()}\n`;
  md += `Model: ${sess.model || state.currentModel}\n`;
  md += `Engine: Puter.js Universal AI\n\n---\n\n`;

  sess.messages.forEach((m) => {
    md += `### ${m.role === 'user' ? 'User' : 'Assistant (' + (m.model || state.currentModel) + ')'}\n\n`;
    md += `${m.content}\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus_chat_${Date.now()}.md`;
  a.click();
}

function exportChatJson() {
  const sess = getActiveSession();
  const jsonStr = JSON.stringify(sess, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexus_chat_${Date.now()}.json`;
  a.click();
}

// ---------------------------------------------------------------------------
// 11. Presets & UI Controls
// ---------------------------------------------------------------------------
const PRESETS = {
  coder: {
    system:
      'You are Nexus Lead Software Engineer. Write clean, modular, production-ready code with complete error handling. Explain your architectural rationale concisely.',
    model: 'claude-3-7-sonnet'
  },
  math: {
    system:
      'You are Nexus Math & Theoretical Physics Engine. Solve problems step-by-step with rigorous proofs, using LaTeX notation for all formulas ($ and $$).',
    model: 'deepseek/deepseek-r1'
  },
  reasoning: {
    system:
      'You are Nexus Deep Reasoning Engine. Think deeply through hypotheses, edge cases, second-order effects, and synthesize insights methodically.',
    model: 'deepseek/deepseek-r1'
  },
  general: {
    system: DEFAULT_SYSTEM_PROMPT,
    model: 'gpt-4o'
  }
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  state.systemPrompt = p.system;
  elements.systemPromptInput.value = p.system;
  selectModel(p.model);
  localStorage.setItem('nexus_puter_sys_prompt', p.system);
}

function autoResizeTextarea() {
  elements.userInput.style.height = 'auto';
  elements.userInput.style.height = Math.min(elements.userInput.scrollHeight, 192) + 'px';
}

// ---------------------------------------------------------------------------
// 12. Event Listeners Setup
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Chat submit & Textarea
  elements.chatForm.addEventListener('submit', handleChatSubmit);
  elements.userInput.addEventListener('input', autoResizeTextarea);
  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  });

  // Stop stream
  elements.stopStreamBtn.addEventListener('click', handleStopStream);

  // New Chat buttons
  elements.newChatTopBtn.addEventListener('click', createNewSession);
  elements.sidebarNewChatBtn.addEventListener('click', createNewSession);

  // Puter Auth
  elements.puterAuthBtn.addEventListener('click', handlePuterAuth);

  // File Attachments
  elements.attachBtn.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));

  // Sidebar toggle (mobile)
  elements.toggleSidebarBtn.addEventListener('click', () => {
    elements.chatSidebar.classList.toggle('-translate-x-full');
  });
  elements.closeSidebarBtn.addEventListener('click', () => {
    elements.chatSidebar.classList.add('-translate-x-full');
  });

  // Model Modal
  elements.modelModalTrigger.addEventListener('click', openModelModal);
  elements.closeModelModalBtn.addEventListener('click', closeModelModal);
  elements.modelModal.addEventListener('click', (e) => {
    if (e.target === elements.modelModal) closeModelModal();
  });

  // Custom Model Application
  elements.applyCustomModelBtn.addEventListener('click', () => {
    const val = elements.customModelInput.value.trim();
    if (val) {
      selectModel(val);
      closeModelModal();
    }
  });
  elements.customModelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = elements.customModelInput.value.trim();
      if (val) {
        selectModel(val);
        closeModelModal();
      }
    }
  });

  // Category filter tabs in modal
  document.querySelectorAll('.model-cat-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.model-cat-tab').forEach((t) => t.classList.remove('active', 'border-emerald-500/40', 'bg-emerald-500/20', 'text-emerald-300'));
      tab.classList.add('active', 'border-emerald-500/40', 'bg-emerald-500/20', 'text-emerald-300');

      const cat = tab.getAttribute('data-category');
      if (cat === 'popular') renderModelList(POPULAR_MODELS);
      else if (cat === 'free') renderModelList(FREE_MODELS);
      else if (cat === 'reasoning') renderModelList(REASONING_MODELS);
      else if (cat === 'vision') renderModelList(VISION_MODELS);
      else if (cat === 'all') renderModelList(state.liveModels);
    });
  });

  // Search input in modal
  elements.modelSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      renderModelList(POPULAR_MODELS);
      return;
    }
    const filtered = state.liveModels.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(query)) ||
        (m.id && m.id.toLowerCase().includes(query)) ||
        (m.provider && m.provider.toLowerCase().includes(query))
    );
    renderModelList(filtered);
  });

  // Settings Drawer
  elements.settingsDrawerTrigger.addEventListener('click', () => {
    elements.systemPromptInput.value = state.systemPrompt;
    elements.temperatureSlider.value = state.temperature;
    elements.tempVal.textContent = state.temperature;
    elements.maxTokensSlider.value = state.maxTokens;
    elements.maxTokensVal.textContent = state.maxTokens;
    elements.reasoningEffortSelect.value = state.reasoningEffort;
    elements.testModeToggle.checked = state.testMode;
    elements.settingsDrawer.classList.remove('translate-x-full');
  });

  elements.closeSettingsDrawerBtn.addEventListener('click', () => {
    elements.settingsDrawer.classList.add('translate-x-full');
  });

  elements.temperatureSlider.addEventListener('input', (e) => {
    elements.tempVal.textContent = e.target.value;
  });

  elements.maxTokensSlider.addEventListener('input', (e) => {
    elements.maxTokensVal.textContent = e.target.value;
  });

  elements.saveParamsBtn.addEventListener('click', () => {
    state.systemPrompt = elements.systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
    state.temperature = parseFloat(elements.temperatureSlider.value);
    state.maxTokens = parseInt(elements.maxTokensSlider.value, 10);
    state.reasoningEffort = elements.reasoningEffortSelect.value;
    state.testMode = elements.testModeToggle.checked;

    localStorage.setItem('nexus_puter_sys_prompt', state.systemPrompt);
    localStorage.setItem('nexus_puter_temp', String(state.temperature));
    localStorage.setItem('nexus_puter_max_tokens', String(state.maxTokens));
    localStorage.setItem('nexus_puter_reasoning', state.reasoningEffort);
    localStorage.setItem('nexus_puter_test_mode', String(state.testMode));

    elements.settingsDrawer.classList.add('translate-x-full');
  });

  elements.resetParamsBtn.addEventListener('click', () => {
    elements.systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    elements.temperatureSlider.value = '0.7';
    elements.tempVal.textContent = '0.7';
    elements.maxTokensSlider.value = '4096';
    elements.maxTokensVal.textContent = '4096';
    elements.reasoningEffortSelect.value = '';
    elements.testModeToggle.checked = false;
  });

  // Preset Buttons
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      applyPreset(preset);
      // Visual feedback
      btn.classList.add('border-emerald-400');
      setTimeout(() => btn.classList.remove('border-emerald-400'), 1000);
    });
  });

  // Starter Prompt Buttons on Welcome Screen
  document.querySelectorAll('.starter-prompt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const promptText = btn.querySelector('.text-\\[11px\\]').textContent.replace(/^"|"$/g, '').trim();
      elements.userInput.value = promptText;
      autoResizeTextarea();
      elements.userInput.focus();
    });
  });

  // Export and Clear History
  elements.exportChatMdBtn.addEventListener('click', exportChatMarkdown);
  elements.exportChatJsonBtn.addEventListener('click', exportChatJson);
  elements.clearAllSessionsBtn.addEventListener('click', clearAllSessions);

  // Initialize Speech Input
  initVoiceInput();
}

// ---------------------------------------------------------------------------
// 13. App Bootstrap
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initPuter();
});
