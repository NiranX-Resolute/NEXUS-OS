import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Loader2,
  Mic,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ipcFetch, ipcJson } from '../services/ipc';
import { useNexusStore } from '../store/useNexusStore';
import type { ModelItem } from '../types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  createdAt: string;
  isError?: boolean;
}

interface PersonaPayload {
  success?: boolean;
  persona?: {
    active_preset?: string;
    voice_id?: string;
    voice_engine?: string;
    empathy_pct?: number;
    humor_pct?: number;
    candor_pct?: number;
    verbosity_pct?: number;
    warmth_prosody?: number;
  };
  settings?: {
    active_preset?: string;
    voice_id?: string;
    voice_engine?: string;
  };
  presets?: string[] | Record<string, Record<string, number>>;
}

interface HaruStatus {
  success?: boolean;
  enabled?: boolean;
  available?: boolean;
  node_url?: string | null;
  latency_ms?: number;
  active_mode?: string;
  air_gapped?: boolean;
  estop_active?: boolean;
  reference_clip_present?: boolean;
  status?: HaruStatus;
  error?: string;
}

const STORAGE_KEY = 'nexus_v4_chat_messages';

function loadStoredMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function formatPresetLabel(id: string): string {
  return id
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function ChatView() {
  const telemetry = useNexusStore((s) => s.telemetry);
  const pushToast = useNexusStore((s) => s.pushToast);

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadStoredMessages());
  const [promptInput, setPromptInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelUid, setSelectedModelUid] = useState<string>('');
  const [modelsLoading, setModelsLoading] = useState(false);

  const [presets, setPresets] = useState<string[]>([]);
  const [activePersona, setActivePersona] = useState<string>('CARING_COMPANION');
  const [personaUpdating, setPersonaUpdating] = useState(false);

  const [haru, setHaru] = useState<HaruStatus | null>(null);
  const [haruBusy, setHaruBusy] = useState(false);
  const [dictating, setDictating] = useState(false);

  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      // Ignore storage quota errors
    }
  }, [messages]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const loadMetadata = useCallback(async () => {
    setModelsLoading(true);
    try {
      const [catalogRes, personaRes, haruRes] = await Promise.allSettled([
        ipcJson<{ models?: ModelItem[] }>('/api/models/catalog'),
        ipcJson<PersonaPayload>('/api/persona'),
        ipcJson<HaruStatus>('/api/voice/haru/status'),
      ]);

      if (catalogRes.status === 'fulfilled' && Array.isArray(catalogRes.value.models)) {
        const list = catalogRes.value.models;
        setModels(list);
        setSelectedModelUid((prev) => {
          if (prev && list.some((m) => m.model_uid === prev)) return prev;
          return list[0]?.model_uid || '';
        });
      }

      if (personaRes.status === 'fulfilled') {
        const pData = personaRes.value;
        const rawPresets = pData.presets;
        if (Array.isArray(rawPresets)) {
          setPresets(rawPresets);
        } else if (rawPresets && typeof rawPresets === 'object') {
          setPresets(Object.keys(rawPresets));
        }
        const currentPreset =
          pData.persona?.active_preset || pData.settings?.active_preset;
        if (currentPreset) {
          setActivePersona(currentPreset);
        }
      }

      if (haruRes.status === 'fulfilled') {
        setHaru(haruRes.value);
      }
    } finally {
      setModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_uid === selectedModelUid) || null,
    [models, selectedModelUid]
  );

  const handleActivatePersona = async (presetId: string) => {
    if (!presetId || personaUpdating) return;
    const prev = activePersona;
    setActivePersona(presetId);
    setPersonaUpdating(true);

    try {
      const res = await ipcFetch('/api/persona/activate', {
        method: 'POST',
        body: JSON.stringify({ persona_id: presetId }),
      });

      if (res.status === 404) {
        const fallback = await ipcJson<PersonaPayload>('/api/persona', {
          method: 'POST',
          body: JSON.stringify({ preset: presetId }),
        });
        if (fallback.success === false) {
          setActivePersona(prev);
          pushToast(fallback.error || 'Failed to activate persona', 'error');
          return;
        }
        pushToast(`Persona set to ${formatPresetLabel(presetId)}`, 'success');
        return;
      }

      const data = (await res.json()) as PersonaPayload & { error?: string };
      if (!res.ok || data.success === false) {
        setActivePersona(prev);
        pushToast(data.error || 'Failed to activate persona', 'error');
        return;
      }
      pushToast(`Persona active: ${formatPresetLabel(presetId)}`, 'success');
    } catch (err) {
      setActivePersona(prev);
      pushToast(err instanceof Error ? err.message : 'Persona update failed', 'error');
    } finally {
      setPersonaUpdating(false);
    }
  };

  const handleToggleHaru = async () => {
    if (haruBusy) return;
    setHaruBusy(true);
    try {
      const targetEnabled = !(haru?.enabled ?? false);
      const res = await ipcJson<HaruStatus>('/api/voice/haru/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: targetEnabled }),
      });

      if (res.success === false) {
        if (res.status) setHaru(res.status);
        pushToast(res.error || 'Cannot toggle Haru voice engine', 'warn');
        return;
      }

      const nextStatus = res.status || res;
      setHaru(nextStatus);
      pushToast(
        nextStatus.enabled ? 'Haru-4B duplex voice enabled' : 'Haru-4B voice switched to Kokoro local',
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Haru toggle failed', 'error');
    } finally {
      setHaruBusy(false);
    }
  };

  const handleDictate = async () => {
    if (dictating) return;
    setDictating(true);
    try {
      const res = await ipcJson<{
        cleaned_text?: string;
        raw_text?: string;
        latency_ms?: number;
      }>('/api/voice/dictate', {
        method: 'POST',
        body: JSON.stringify({ duration_sec: 3.0, inject: false }),
      });

      if (res.success === false) {
        pushToast(res.error || 'Voice dictation failed', 'error');
        return;
      }

      const transcript = (res.cleaned_text || res.raw_text || '').trim();
      if (!transcript) {
        pushToast('No speech detected in microphone window', 'info');
        return;
      }

      setPromptInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      pushToast(
        typeof res.latency_ms === 'number'
          ? `Dictated (${res.latency_ms.toFixed(0)} ms)`
          : 'Dictation inserted',
        'success'
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Microphone dictation request failed', 'error');
    } finally {
      setDictating(false);
    }
  };

  const sendPrompt = async () => {
    const clean = promptInput.trim();
    if (!clean || sending) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: 'user',
      content: clean,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setPromptInput('');
    setSending(true);

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await ipcJson<{
        response?: string;
        text?: string;
        provider?: string;
        model?: string;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: clean,
          messages: nextHistory.slice(-16).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          model: selectedModel?.api_or_hf_id,
          model_uid: selectedModel?.model_uid,
          provider_id: selectedModel?.provider_id,
          persona: activePersona,
          max_tokens: 1024,
        }),
      });

      const elapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );

      if (res.success === false) {
        const errText = res.error || 'Inference router returned an error';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: errText,
            createdAt: new Date().toISOString(),
            isError: true,
          },
        ]);
        pushToast(errText, 'error');
        return;
      }

      const replyText = (res.response || res.text || '').trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `ast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: replyText || 'Empty response received from model router.',
          model: res.model || selectedModel?.display_name || 'Auto Router',
          provider: res.provider || selectedModel?.provider_id || 'local',
          latencyMs: elapsed,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Chat request failed';
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: errMsg,
          createdAt: new Date().toISOString(),
          isError: true,
        },
      ]);
      pushToast(errMsg, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendPrompt();
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt();
    }
  };

  const handleCopy = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      pushToast('Copied response to clipboard', 'info');
    } catch {
      pushToast('Clipboard unavailable', 'warn');
    }
  };

  const haruActive = Boolean(haru?.enabled);
  const haruHealthy = Boolean(haru?.available);

  return (
    <div className="flex h-full w-full flex-col bg-[#090a0c] text-zinc-100">
      {/* Calm Single-Row Monograph Toolbar */}
      <header className="monograph-hairline-b flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h1 className="text-[14px] font-medium tracking-[-0.01em] text-zinc-100">
              Neural Prompt Stream
            </h1>
          </div>

          <span className="text-zinc-700">/</span>

          {/* Model Catalog Picker */}
          <label className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Model
            </span>
            <select
              value={selectedModelUid}
              onChange={(e) => setSelectedModelUid(e.target.value)}
              disabled={modelsLoading || models.length === 0}
              aria-label="Select AI model"
              className="h-8 max-w-[230px] rounded-md border border-white/[0.08] bg-[#0e1014] px-2.5 font-mono text-xs text-zinc-200 focus:border-emerald-500/40 focus:outline-none disabled:opacity-50"
            >
              {models.length === 0 ? (
                <option value="">
                  {modelsLoading ? 'Loading catalog…' : 'Router Auto'}
                </option>
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
          <label className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Persona
            </span>
            <select
              value={activePersona}
              onChange={(e) => void handleActivatePersona(e.target.value)}
              disabled={personaUpdating}
              aria-label="Select AI persona"
              className="h-8 rounded-md border border-white/[0.08] bg-[#0e1014] px-2.5 font-mono text-xs text-zinc-200 focus:border-emerald-500/40 focus:outline-none disabled:opacity-50"
            >
              {(presets.length > 0
                ? presets
                : ['CARING_COMPANION', 'TARS_TACTICAL', 'LATE_NIGHT_CARE', 'DEBUG_SURGEON']
              ).map((preset) => (
                <option key={preset} value={preset}>
                  {formatPresetLabel(preset)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Haru-4B Voice Toggle */}
          <button
            type="button"
            onClick={() => void handleToggleHaru()}
            disabled={haruBusy}
            title={
              haru?.air_gapped
                ? 'Haru remote duplex disabled in SILENT mode'
                : haru?.node_url
                ? `Haru node: ${haru.node_url}`
                : 'Toggle Haru-4B full-duplex voice'
            }
            className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 font-mono text-xs transition ${
              haruActive
                ? haruHealthy
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.08] bg-[#0e1014] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {haruActive ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            <span>Haru</span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                haruActive
                  ? haruHealthy
                    ? 'bg-emerald-400'
                    : 'bg-amber-400'
                  : 'bg-zinc-600'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => void loadMetadata()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] bg-[#0e1014] text-zinc-400 transition hover:text-zinc-200"
            title="Refresh models, persona, and Haru status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${modelsLoading ? 'animate-spin' : ''}`} />
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#0e1014] px-2.5 font-mono text-xs text-zinc-400 transition hover:border-red-500/30 hover:text-red-300"
              title="Clear prompt stream"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </header>

      {/* Prompt Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {messages.length === 0 ? (
            <div className="monograph-surface mt-8 rounded-lg p-8">
              <div className="mb-3 flex items-center gap-2 font-mono text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                READY · {telemetry.workspaceMode}
                {selectedModel ? ` · ${selectedModel.display_name}` : ''}
              </div>
              <h2 className="text-base font-medium tracking-tight text-zinc-100">
                Direct Inference Stream
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
                Messages route through the sovereign LLM router with your active persona matrix (
                <span className="font-mono text-zinc-300">{formatPresetLabel(activePersona)}</span>
                ). Use microphone dictation to transcribe straight into the prompt bar.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4 font-mono text-[11px] text-zinc-500">
                <span>
                  <span className="monograph-kbd mr-1.5">Enter</span> Dispatch
                </span>
                <span>
                  <span className="monograph-kbd mr-1.5">Shift+Enter</span> Newline
                </span>
                {selectedModel?.context_window && (
                  <span className="tabular-nums">CTX {selectedModel.context_window}</span>
                )}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <article
                  key={msg.id}
                  className={`rounded-lg border p-5 ${
                    isUser
                      ? 'border-white/[0.08] bg-[#0e1014]'
                      : msg.isError
                      ? 'border-red-500/25 bg-red-500/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.015]'
                  }`}
                >
                  <div className="mb-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400">
                      {isUser ? (
                        <>
                          <User className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="uppercase tracking-wider text-zinc-300">Operator</span>
                        </>
                      ) : (
                        <>
                          <Bot
                            className={`h-3.5 w-3.5 ${
                              msg.isError ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          />
                          <span
                            className={`uppercase tracking-wider ${
                              msg.isError ? 'text-red-300' : 'text-emerald-300'
                            }`}
                          >
                            {msg.model || 'Nexus'}
                          </span>
                          {msg.provider && (
                            <span className="text-zinc-600">· {msg.provider}</span>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 font-mono text-[11px] text-zinc-500 tabular-nums">
                      {typeof msg.latencyMs === 'number' && <span>{msg.latencyMs} ms</span>}
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => void handleCopy(msg)}
                          className="rounded p-1 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-zinc-200">
                    {msg.content}
                  </div>
                </article>
              );
            })
          )}

          {sending && (
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#0e1014] px-5 py-4 font-mono text-xs text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span>Synthesizing response via {selectedModel?.display_name || 'LLM router'}…</span>
            </div>
          )}

          <div ref={streamEndRef} />
        </div>
      </div>

      {/* Composer */}
      <footer className="monograph-hairline-t px-6 py-4">
        <form onSubmit={handleFormSubmit} className="mx-auto w-full max-w-3xl">
          <div className="monograph-surface rounded-lg p-3 focus-within:border-emerald-500/40">
            <textarea
              rows={3}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Write a prompt or dictate with faster-whisper…"
              disabled={sending}
              className="w-full resize-none bg-transparent px-1 py-1 text-[13.5px] leading-relaxed text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-60"
            />

            <div className="monograph-hairline-t mt-2 flex items-center justify-between gap-3 pt-2.5">
              <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                <button
                  type="button"
                  onClick={() => void handleDictate()}
                  disabled={dictating || sending}
                  className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 transition ${
                    dictating
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                  } disabled:opacity-50`}
                >
                  <Mic className={`h-3 w-3 ${dictating ? 'animate-pulse' : ''}`} />
                  {dictating ? 'Listening (3s)…' : 'Dictate'}
                </button>
                <span className="hidden sm:inline text-zinc-600">
                  {haruActive ? 'Haru duplex armed' : 'Local voice standby'}
                </span>
              </div>

              <button
                type="submit"
                disabled={sending || !promptInput.trim()}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}

export default ChatView;
