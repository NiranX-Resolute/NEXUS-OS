import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Cpu,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  Volume2,
} from 'lucide-react';
import { ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { ModelItem } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  model?: string;
  error?: boolean;
}

interface ModelsCatalogResponse {
  success?: boolean;
  models?: ModelItem[];
  count?: number;
  error?: string;
}

interface PersonaSettings {
  empathy_pct?: number;
  humor_pct?: number;
  candor_pct?: number;
  verbosity_pct?: number;
  voice_id?: string;
  voice_engine?: string;
  active_preset?: string;
}

interface PersonaResponse {
  success?: boolean;
  persona?: PersonaSettings;
  settings?: PersonaSettings;
  presets?: string[] | Record<string, Record<string, number>>;
  error?: string;
}

interface HaruStatusResponse {
  success?: boolean;
  enabled?: boolean;
  available?: boolean;
  node_url?: string | null;
  latency_ms?: number | null;
  active_mode?: string;
  air_gapped?: boolean;
  estop_active?: boolean;
  status?: HaruStatusResponse;
  error?: string;
}

interface DictateResponse {
  success?: boolean;
  raw_text?: string;
  cleaned_text?: string;
  latency_ms?: number;
  error?: string;
}

interface AiChatResponse {
  success?: boolean;
  response?: string;
  text?: string;
  provider?: string;
  model?: string;
  error?: string;
}

const DEFAULT_PERSONA_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'CARING_COMPANION', label: 'Companion' },
  { id: 'TARS_TACTICAL', label: 'TARS Tactical' },
  { id: 'LATE_NIGHT_CARE', label: 'Late-Night' },
  { id: 'DEBUG_SURGEON', label: 'Debug Surgeon' },
];

function formatPresetLabel(id: string): string {
  const known = DEFAULT_PERSONA_OPTIONS.find((p) => p.id === id);
  if (known) return known.label;
  return id
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

function normalizePresetId(raw: string | undefined): string {
  if (!raw) return 'CARING_COMPANION';
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function extractPersonaOptions(
  rawPresets: PersonaResponse['presets']
): Array<{ id: string; label: string }> {
  if (Array.isArray(rawPresets) && rawPresets.length > 0) {
    return rawPresets.map((item) => {
      const id = normalizePresetId(item);
      return { id, label: formatPresetLabel(id) };
    });
  }
  if (rawPresets && typeof rawPresets === 'object' && !Array.isArray(rawPresets)) {
    const keys = Object.keys(rawPresets);
    if (keys.length > 0) {
      return keys.map((k) => {
        const id = normalizePresetId(k);
        return { id, label: formatPresetLabel(id) };
      });
    }
  }
  return DEFAULT_PERSONA_OPTIONS;
}

export function ChatView() {
  const pushToast = useNexusStore((s) => s.pushToast);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelUid, setSelectedModelUid] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  const [personaSettings, setPersonaSettings] = useState<PersonaSettings>({});
  const [personaOptions, setPersonaOptions] =
    useState<Array<{ id: string; label: string }>>(DEFAULT_PERSONA_OPTIONS);
  const [activePersona, setActivePersona] = useState<string>('CARING_COMPANION');
  const [personaLoading, setPersonaLoading] = useState(false);

  const [haruStatus, setHaruStatus] = useState<HaruStatusResponse | null>(null);
  const [haruToggling, setHaruToggling] = useState(false);
  const [dictating, setDictating] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_uid === selectedModelUid) ?? models[0] ?? null,
    [models, selectedModelUid]
  );

  const hydrateChatControls = useCallback(async () => {
    setModelsLoading(true);
    try {
      const [catalogRes, personaRes, haruRes] = await Promise.allSettled([
        ipcJson<ModelsCatalogResponse>('/api/models/catalog'),
        ipcJson<PersonaResponse>('/api/persona'),
        ipcJson<HaruStatusResponse>('/api/voice/haru/status'),
      ]);

      if (catalogRes.status === 'fulfilled' && Array.isArray(catalogRes.value.models)) {
        const list = catalogRes.value.models;
        setModels(list);
        if (list.length > 0) {
          setSelectedModelUid((prev) =>
            prev && list.some((m) => m.model_uid === prev) ? prev : list[0].model_uid
          );
        }
      }

      if (personaRes.status === 'fulfilled' && personaRes.value.success !== false) {
        const cfg = personaRes.value.persona ?? personaRes.value.settings ?? {};
        setPersonaSettings(cfg);
        setPersonaOptions(extractPersonaOptions(personaRes.value.presets));
        if (cfg.active_preset) {
          setActivePersona(normalizePresetId(cfg.active_preset));
        }
      }

      if (haruRes.status === 'fulfilled') {
        setHaruStatus(haruRes.value);
      }
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrateChatControls();
  }, [hydrateChatControls]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleActivatePersona = async (personaId: string) => {
    if (personaLoading) return;
    setPersonaLoading(true);
    try {
      const res = await ipcJson<PersonaResponse>('/api/persona/activate', {
        method: 'POST',
        body: JSON.stringify({ persona_id: personaId }),
      });
      if (res.success === false) {
        pushToast(res.error || `Failed to activate ${personaId}`, 'error');
        return;
      }
      const cfg = res.persona ?? res.settings ?? {};
      setPersonaSettings(cfg);
      setActivePersona(normalizePresetId(cfg.active_preset || personaId));
      pushToast(`Persona active: ${personaId.replace(/_/g, ' ')}`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Persona activation failed', 'error');
    } finally {
      setPersonaLoading(false);
    }
  };

  const handleToggleHaru = async () => {
    if (haruToggling) return;
    setHaruToggling(true);
    try {
      const nextEnabled = !(haruStatus?.enabled ?? false);
      const res = await ipcJson<HaruStatusResponse>('/api/voice/haru/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.success === false) {
        pushToast(res.error || 'Unable to toggle Haru-4B voice bridge', 'warn');
        if (res.status) setHaruStatus(res.status);
        return;
      }
      const updated = res.status ?? res;
      setHaruStatus(updated);
      pushToast(
        updated.enabled ? 'Haru-4B Full-Duplex voice enabled' : 'Haru-4B voice standby',
        updated.enabled ? 'success' : 'info'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Haru voice toggle failed', 'error');
    } finally {
      setHaruToggling(false);
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
      if (res.success === false) {
        pushToast(res.error || 'Voice dictation failed', 'error');
        return;
      }
      const transcript = (res.cleaned_text || res.raw_text || '').trim();
      if (!transcript) {
        pushToast('No speech detected during dictation window', 'warn');
        return;
      }
      setDraft((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      pushToast(`Dictated (${res.latency_ms ?? 0}ms)`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Dictation endpoint unreachable', 'error');
    } finally {
      setDictating(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const prompt = draft.trim();
    if (!prompt || sending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setDraft('');
    setSending(true);

    try {
      const payloadMessages = nextHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await ipcJson<AiChatResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          messages: payloadMessages,
          model: selectedModel?.api_or_hf_id,
          model_uid: selectedModel?.model_uid,
          provider_id: selectedModel?.provider_id,
          persona_id: activePersona,
          max_tokens: 1024,
        }),
      });

      const replyText = (res.response ?? res.text ?? '').trim();
      const ok = res.success !== false && Boolean(replyText);

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: ok
            ? replyText
            : res.error || 'Gateway returned an empty response. Verify provider configuration.',
          timestamp: new Date().toLocaleTimeString(),
          provider: res.provider || selectedModel?.provider_id,
          model: res.model || selectedModel?.display_name,
          error: !ok,
        },
      ]);

      if (!ok) {
        pushToast(res.error || 'AI generation returned no output', 'warn');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Chat gateway request failed';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toLocaleTimeString(),
          error: true,
        },
      ]);
      pushToast(errMsg, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const haruEnabled = Boolean(haruStatus?.enabled);

  return (
    <div className="h-full p-6 flex flex-col gap-6 min-h-0">
      {/* Top Bar: Max 3 calm control groups */}
      <header className="aether-glass rounded-2xl px-6 py-4 grid grid-cols-1 xl:grid-cols-3 gap-6 items-center">
        {/* Group 1: Model Selector */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-cyan-400/85">
            <span className="inline-flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              Active Model
            </span>
            <button
              type="button"
              onClick={() => void hydrateChatControls()}
              disabled={modelsLoading}
              className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300"
            >
              <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
          <select
            aria-label="Select AI Model"
            value={selectedModelUid}
            onChange={(e) => setSelectedModelUid(e.target.value)}
            disabled={models.length === 0}
            className="w-full rounded-xl border border-cyan-500/25 bg-[#050a14]/90 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400/70 focus:outline-none disabled:opacity-50"
          >
            {models.length === 0 ? (
              <option value="">No models loaded from catalog</option>
            ) : (
              models.map((m) => (
                <option key={m.model_uid} value={m.model_uid}>
                  {m.display_name} ({m.provider_id} • {m.runtime_target})
                </option>
              ))
            )}
          </select>
        </div>

        {/* Group 2: Persona Bar */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-emerald-400/85">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Persona Matrix
            </span>
            <span className="text-slate-400">
              E {personaSettings.empathy_pct ?? 80}% • C {personaSettings.candor_pct ?? 85}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-700/60 bg-[#050a14]/85 p-1">
            {personaOptions.map((preset) => {
              const active = activePersona === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={personaLoading}
                  onClick={() => void handleActivatePersona(preset.id)}
                  className={`truncate rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${
                    active
                      ? 'border border-emerald-400/40 bg-emerald-500/20 text-emerald-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 3: Haru Full-Duplex Voice Link */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700/50 bg-[#050a14]/75 px-4 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-100">
              <Radio
                className={`h-3.5 w-3.5 ${
                  haruEnabled ? 'text-emerald-400' : 'text-slate-400'
                }`}
              />
              <span>Haru-4B Voice</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-mono text-slate-400">
              {haruStatus?.air_gapped
                ? 'AIR-GAPPED (SILENT)'
                : haruEnabled
                  ? `ACTIVE • ${haruStatus?.latency_ms ?? '--'}ms`
                  : haruStatus?.available
                    ? 'NODE READY'
                    : 'STANDBY'}
            </p>
          </div>

          <button
            type="button"
            disabled={haruToggling}
            onClick={() => void handleToggleHaru()}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
              haruEnabled
                ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
            }`}
          >
            <Volume2 className="h-3.5 w-3.5" />
            {haruToggling ? 'Updating...' : haruEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </header>

      {/* Conversation Thread */}
      <section className="aether-glass rounded-2xl flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-cyan-500/15 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-100">Neural Telemetry Thread</h2>
            {selectedModel && (
              <span className="hidden sm:inline-flex rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-mono text-cyan-300">
                {selectedModel.display_name}
              </span>
            )}
          </div>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 px-2.5 py-1 text-xs text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                Nexus Sovereign Dialogue Ready
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                Prompts dispatch directly through <span className="font-mono text-cyan-300">/api/ai/chat</span>{' '}
                using your active persona matrix and sovereign compute router.
              </p>
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
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[78%] rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'border-cyan-400/35 bg-cyan-500/15 text-slate-100'
                        : msg.error
                          ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
                          : 'border-slate-700/60 bg-[#050a14]/85 text-slate-100'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
                      <span>
                        {isUser
                          ? 'OPERATOR'
                          : msg.model || msg.provider || 'SOVEREIGN_ROUTER'}
                      </span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  </div>

                  {isUser && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-3 text-xs font-mono text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400 aether-pulse" />
              Synthesizing response via Sovereign LLM Router...
            </div>
          )}
          <div ref={scrollAnchorRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSend}
          className="border-t border-cyan-500/15 bg-[#050a14]/65 p-5 flex items-end gap-3"
        >
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Send prompt to Nexus Sovereign Router (Enter to send, Shift+Enter for newline)..."
            className="flex-1 resize-none rounded-xl border border-cyan-500/25 bg-[#091322]/90 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-400/70 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => void handleDictate()}
            disabled={dictating || sending}
            title="Capture 4s microphone dictation via faster-whisper"
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium transition ${
              dictating
                ? 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
            } disabled:opacity-50`}
          >
            {dictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {dictating ? 'Listening...' : 'Dictate'}
          </button>

          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/20 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

export default ChatView;
