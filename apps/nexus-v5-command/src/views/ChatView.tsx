import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Loader2,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ipcJson } from '@/services/ipc';
import { useNexusStore } from '@/store/useNexusStore';
import type { ModelItem } from '@/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  error?: boolean;
}

interface ModelsCatalogResponse {
  success?: boolean;
  models?: ModelItem[];
  count?: number;
  error?: string;
}

interface PersonaMetrics {
  empathy_pct?: number;
  humor_pct?: number;
  candor_pct?: number;
  verbosity_pct?: number;
  voice_id?: string;
  voice_engine?: string;
  active_preset?: string;
  warmth_prosody?: number;
}

interface PersonaResponse {
  success?: boolean;
  persona?: PersonaMetrics;
  settings?: PersonaMetrics;
  presets?: string[] | Record<string, Record<string, number>>;
  error?: string;
}

interface HaruStatusResponse {
  success?: boolean;
  enabled?: boolean;
  available?: boolean;
  node_url?: string;
  latency_ms?: number;
  active_mode?: string;
  air_gapped?: boolean;
  estop_active?: boolean;
  reference_clip_present?: boolean;
  error?: string;
}

interface DictateResponse {
  success?: boolean;
  raw_text?: string;
  cleaned_text?: string;
  injected?: boolean;
  events_sent?: number;
  latency_ms?: number;
  error?: string;
}

interface AiChatRawResponse {
  success?: boolean;
  response?: string | { text?: string; response?: string; provider?: string; model?: string };
  text?: string | { text?: string; response?: string; provider?: string; model?: string };
  provider?: string;
  model?: string;
  error?: string;
}

interface PersonaOption {
  id: string;
  label: string;
}

const DEFAULT_PERSONA_OPTIONS: PersonaOption[] = [
  { id: 'CARING_COMPANION', label: 'Caring Companion' },
  { id: 'TARS_TACTICAL', label: 'TARS Tactical' },
  { id: 'LATE_NIGHT_CARE', label: 'Late-Night Care' },
  { id: 'DEBUG_SURGEON', label: 'Debug Surgeon' },
];

function normalizePresetId(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean === 'TARS_PRIME') return 'TARS_TACTICAL';
  return clean;
}

function formatPresetLabel(raw: string): string {
  const norm = normalizePresetId(raw);
  const matched = DEFAULT_PERSONA_OPTIONS.find((p) => p.id === norm);
  if (matched) return matched.label;
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function extractReplyText(res: AiChatRawResponse): {
  text: string;
  provider?: string;
  model?: string;
} {
  const candidate = res.response ?? res.text;
  if (candidate && typeof candidate === 'object') {
    const nested = candidate as {
      text?: string;
      response?: string;
      provider?: string;
      model?: string;
    };
    return {
      text: String(nested.text ?? nested.response ?? ''),
      provider: nested.provider ?? res.provider,
      model: nested.model ?? res.model,
    };
  }
  return {
    text: typeof candidate === 'string' ? candidate : '',
    provider: res.provider,
    model: res.model,
  };
}

export function ChatView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelUid, setSelectedModelUid] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);

  const [personaOptions, setPersonaOptions] = useState<PersonaOption[]>(DEFAULT_PERSONA_OPTIONS);
  const [activePersonaId, setActivePersonaId] = useState('CARING_COMPANION');
  const [personaMetrics, setPersonaMetrics] = useState<PersonaMetrics | null>(null);
  const [switchingPersona, setSwitchingPersona] = useState(false);

  const [haruStatus, setHaruStatus] = useState<HaruStatusResponse | null>(null);
  const [togglingHaru, setTogglingHaru] = useState(false);
  const [dictating, setDictating] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const hydrateWorkspaceState = useCallback(async () => {
    setLoadingModels(true);
    const [catalogRes, personaRes, haruRes] = await Promise.all([
      ipcJson<ModelsCatalogResponse>('/api/models/catalog'),
      ipcJson<PersonaResponse>('/api/persona'),
      ipcJson<HaruStatusResponse>('/api/voice/haru/status'),
    ]);

    if (!isMountedRef.current) return;

    if (catalogRes.success && Array.isArray(catalogRes.models)) {
      const chatModels = catalogRes.models.filter(
        (m) => !m.modality || m.modality.toLowerCase().includes('text') || m.modality.toLowerCase().includes('chat') || m.modality.toLowerCase().includes('multimodal')
      );
      const list = chatModels.length > 0 ? chatModels : catalogRes.models;
      setModels(list);
      setSelectedModelUid((prev) => prev || list[0]?.model_uid || '');
    }
    setLoadingModels(false);

    if (personaRes.success) {
      const current = personaRes.persona ?? personaRes.settings ?? null;
      if (current) {
        setPersonaMetrics(current);
        if (current.active_preset) {
          setActivePersonaId(normalizePresetId(current.active_preset));
        }
      }
      if (Array.isArray(personaRes.presets) && personaRes.presets.length > 0) {
        setPersonaOptions(
          personaRes.presets.map((p) => ({
            id: normalizePresetId(p),
            label: formatPresetLabel(p),
          }))
        );
      } else if (personaRes.presets && typeof personaRes.presets === 'object') {
        const keys = Object.keys(personaRes.presets);
        if (keys.length > 0) {
          setPersonaOptions(
            keys.map((k) => ({
              id: normalizePresetId(k),
              label: formatPresetLabel(k),
            }))
          );
        }
      }
    }

    if (haruRes) {
      setHaruStatus(haruRes);
    }
  }, []);

  useEffect(() => {
    void hydrateWorkspaceState();
  }, [hydrateWorkspaceState, telemetry.workspaceMode]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_uid === selectedModelUid) ?? null,
    [models, selectedModelUid]
  );

  const handleActivatePersona = async (nextPresetId: string) => {
    const normalized = normalizePresetId(nextPresetId);
    setSwitchingPersona(true);
    try {
      let res = await ipcJson<PersonaResponse>('/api/persona/activate', {
        method: 'POST',
        body: JSON.stringify({ persona_id: normalized }),
      });

      if (!res.success && /404|not found/i.test(res.error || '')) {
        res = await ipcJson<PersonaResponse>('/api/persona', {
          method: 'POST',
          body: JSON.stringify({ preset: normalized }),
        });
      }

      if (!res.success) {
        pushToast(res.error || 'Failed to activate persona preset', 'error');
        return;
      }

      const updated = res.persona ?? res.settings ?? null;
      setActivePersonaId(
        updated?.active_preset ? normalizePresetId(updated.active_preset) : normalized
      );
      if (updated) {
        setPersonaMetrics(updated);
      }
      pushToast(`Persona calibrated: ${formatPresetLabel(normalized)}`, 'success');
    } finally {
      setSwitchingPersona(false);
    }
  };

  const handleToggleHaru = async () => {
    if (togglingHaru) return;
    setTogglingHaru(true);
    try {
      const nextEnabled = !(haruStatus?.enabled ?? false);
      const res = await ipcJson<HaruStatusResponse & { status?: HaruStatusResponse }>(
        '/api/voice/haru/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ enabled: nextEnabled }),
        }
      );

      if (!res.success) {
        pushToast(res.error || 'Haru-4B toggle rejected', res.air_gapped ? 'warn' : 'error');
        if (res.status) {
          setHaruStatus(res.status);
        }
        return;
      }

      const refreshed = await ipcJson<HaruStatusResponse>('/api/voice/haru/status');
      setHaruStatus(refreshed.success ? refreshed : { ...haruStatus, enabled: nextEnabled });
      pushToast(
        nextEnabled ? 'Haru-4B full-duplex voice enabled' : 'Haru-4B full-duplex paused',
        'info'
      );
    } finally {
      setTogglingHaru(false);
    }
  };

  const handleDictate = async () => {
    if (dictating) return;
    setDictating(true);
    try {
      const res = await ipcJson<DictateResponse>('/api/voice/dictate', {
        method: 'POST',
        body: JSON.stringify({ duration_sec: 4, inject: false }),
      });
      if (!res.success) {
        pushToast(res.error || 'Microphone dictation unavailable', 'warn');
        return;
      }
      const transcript = (res.cleaned_text || res.raw_text || '').trim();
      if (!transcript) {
        pushToast('No speech detected during 4s capture window', 'info');
        return;
      }
      setComposer((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      pushToast(`Transcribed in ${Math.round(res.latency_ms ?? 0)}ms`, 'success');
    } finally {
      setDictating(false);
    }
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const promptText = (overridePrompt ?? composer).trim();
    if (!promptText || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!overridePrompt) {
      setComposer('');
    }
    setSending(true);

    const t0 = performance.now();
    try {
      const res = await ipcJson<AiChatRawResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText,
          model: selectedModel?.api_or_hf_id || selectedModel?.model_uid || undefined,
          provider_id: selectedModel?.provider_id || undefined,
          messages: nextHistory.slice(-12).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const elapsed = Math.round(performance.now() - t0);
      const { text, provider, model } = extractReplyText(res);

      if (!res.success && !text) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: res.error || 'Neural gateway failed to return a completion.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            latencyMs: elapsed,
            error: true,
          },
        ]);
        pushToast(res.error || 'AI completion failed', 'error');
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: text || 'Completed with empty payload.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          provider: provider || selectedModel?.provider_id || 'router',
          model: model || selectedModel?.display_name || 'auto',
          latencyMs: elapsed,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleCopy = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      pushToast('Message copied to clipboard', 'success');
    } catch {
      pushToast('Clipboard unavailable', 'warn');
    }
  };

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-matrix-in min-h-0">
      {/* Single Clean Control Header */}
      <header className="matrix-panel rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center text-emerald-300">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Neural Matrix Chat</h1>
            <div className="text-[11px] font-mono text-slate-400">
              {telemetry.workspaceMode === 'SILENT'
                ? 'AIR-GAP ROUTING · LOCAL SOVEREIGN ONLY'
                : 'FEDERATED FREE-TIER CASCADE'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Model Catalog Selector */}
          <label className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <span className="text-slate-500 hidden sm:inline">MODEL</span>
            <select
              value={selectedModelUid}
              onChange={(e) => setSelectedModelUid(e.target.value)}
              disabled={loadingModels || models.length === 0}
              className="max-w-[230px] px-3 py-1.5 rounded-xl bg-[#05080b]/90 border border-white/12 focus:border-cyan-400/50 focus:outline-none text-xs font-mono text-cyan-100"
            >
              {models.length === 0 ? (
                <option value="">Auto Router Cascade</option>
              ) : (
                models.map((m) => (
                  <option key={m.model_uid} value={m.model_uid}>
                    {m.display_name} ({m.provider_id})
                  </option>
                ))
              )}
            </select>
          </label>

          {/* Persona Selector */}
          <label className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <span className="text-slate-500 hidden sm:inline">PERSONA</span>
            <select
              value={activePersonaId}
              onChange={(e) => void handleActivatePersona(e.target.value)}
              disabled={switchingPersona}
              className="px-3 py-1.5 rounded-xl bg-[#05080b]/90 border border-white/12 focus:border-emerald-400/50 focus:outline-none text-xs font-mono text-emerald-200"
            >
              {personaOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          {/* Haru-4B Voice Duplex Pill */}
          <button
            type="button"
            onClick={() => void handleToggleHaru()}
            disabled={togglingHaru}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-colors ${
              haruStatus?.enabled
                ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200 matrix-glow'
                : 'bg-[#05080b]/80 border-white/12 text-slate-300 hover:border-cyan-400/40'
            }`}
            title={haruStatus?.node_url || 'Haru-4B Full-Duplex Voice Bridge'}
          >
            {togglingHaru ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : haruStatus?.enabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-300" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
            Haru {haruStatus?.enabled ? 'ON' : 'OFF'}
            {haruStatus?.available && (
              <Radio className="w-3 h-3 text-cyan-300" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void hydrateWorkspaceState()}
            title="Refresh catalog & voice status"
            className="p-2 rounded-xl border border-white/10 bg-[#05080b]/70 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Conversation Thread */}
      <div className="matrix-panel rounded-2xl flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-5 py-8">
              <div className="w-14 h-14 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 flex items-center justify-center text-emerald-300 matrix-glow">
                <Bot className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-white">
                  Cyber Matrix Neural Channel Ready
                </h2>
                <p className="text-sm text-slate-400">
                  Direct dispatch to <span className="text-cyan-300 font-mono">/api/ai/chat</span>{' '}
                  calibrated with <span className="text-emerald-300 font-mono">{formatPresetLabel(activePersonaId)}</span>.
                </p>
              </div>

              {personaMetrics && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-[#05080b]/80 border border-white/10 text-emerald-200">
                    Empathy {personaMetrics.empathy_pct ?? 80}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#05080b]/80 border border-white/10 text-cyan-200">
                    Humor {personaMetrics.humor_pct ?? 45}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#05080b]/80 border border-white/10 text-emerald-200">
                    Candor {personaMetrics.candor_pct ?? 85}%
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-[#05080b]/80 border border-white/10 text-slate-300">
                    Verbosity {personaMetrics.verbosity_pct ?? 45}%
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                {[
                  'Summarize current system architecture and active invariants.',
                  'Review SQLite WAL synchronization latency optimization strategies.',
                  'Draft a clean Python diagnostic script for local telemetry.',
                ].map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void handleSendMessage(starter)}
                    className="text-left px-3.5 py-2 rounded-xl border border-white/10 bg-[#05080b]/70 hover:border-emerald-400/40 hover:bg-emerald-500/10 text-xs text-slate-300 hover:text-emerald-100 transition-colors"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                        msg.error
                          ? 'bg-red-500/15 border-red-400/40 text-red-300'
                          : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                      }`}
                    >
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-3xl rounded-2xl px-4 py-3 border space-y-2 ${
                      isUser
                        ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-50'
                        : msg.error
                          ? 'bg-red-500/10 border-red-500/35 text-red-200'
                          : 'bg-[#05080b]/80 border-white/10 text-emerald-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
                      <span className={isUser ? 'text-cyan-300' : 'text-emerald-300'}>
                        {isUser ? 'OPERATOR' : `NEXUS · ${msg.provider || 'router'}`}
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.model && !isUser && (
                          <span className="text-slate-500 truncate max-w-[160px]">{msg.model}</span>
                        )}
                        {typeof msg.latencyMs === 'number' && (
                          <span className="tabular-nums text-slate-500">{msg.latencyMs}ms</span>
                        )}
                        <span>{msg.timestamp}</span>
                        <button
                          type="button"
                          onClick={() => void handleCopy(msg)}
                          title="Copy message"
                          className="text-slate-500 hover:text-emerald-300 transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-300" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl border border-cyan-400/35 bg-cyan-500/15 flex items-center justify-center text-cyan-200 shrink-0 mt-0.5">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-3 text-xs font-mono text-emerald-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Routing neural inference via {selectedModel?.display_name || 'auto cascade'}...</span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Bottom Composer */}
        <div className="border-t border-white/10 bg-[#05080b]/75 p-4">
          <div className="flex items-end gap-3">
            <button
              type="button"
              onClick={() => void handleDictate()}
              disabled={dictating || sending}
              title="Voice Dictate (4s local Whisper capture)"
              className={`p-3 rounded-xl border transition-colors shrink-0 ${
                dictating
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 matrix-glow'
                  : 'bg-[#090e14] border-white/12 text-slate-300 hover:border-cyan-400/45 hover:text-cyan-200'
              }`}
            >
              {dictating ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
            </button>

            <textarea
              rows={2}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={sending}
              placeholder="Transmit prompt to Cyber Matrix neural router (Enter to send, Shift+Enter for newline)..."
              className="flex-1 resize-none rounded-xl bg-[#090e14] border border-white/12 focus:border-emerald-400/60 focus:outline-none px-4 py-2.5 text-sm text-emerald-50 placeholder-slate-500 transition-colors"
            />

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={sending}
                title="Clear conversation thread"
                className="p-3 rounded-xl border border-white/12 bg-[#090e14] hover:border-red-400/45 hover:text-red-300 text-slate-400 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSendMessage()}
              disabled={sending || !composer.trim()}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-emerald-100 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatView;
