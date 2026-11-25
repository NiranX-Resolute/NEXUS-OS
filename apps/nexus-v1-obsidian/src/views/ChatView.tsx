import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Mic,
  Radio,
  RefreshCw,
  Send,
  Sliders,
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
  role: 'user' | 'assistant' | 'error';
  content: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  createdAt: string;
}

interface ModelsCatalogResponse {
  success?: boolean;
  models?: ModelItem[];
  error?: string;
}

interface PersonaSettingsShape {
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
  settings?: PersonaSettingsShape;
  persona?: PersonaSettingsShape;
  presets?: string[] | Record<string, unknown>;
  error?: string;
}

interface HaruStatusShape {
  success?: boolean;
  enabled?: boolean;
  available?: boolean;
  node_url?: string;
  latency_ms?: number | null;
  active_mode?: string;
  air_gapped?: boolean;
  estop_active?: boolean;
  error?: string;
  status?: HaruStatusShape;
}

interface DictateResponse {
  success?: boolean;
  raw_text?: string;
  cleaned_text?: string;
  text?: string;
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

const CANONICAL_PERSONAS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'CARING_COMPANION', label: 'Caring Companion', hint: 'Empathetic & warm' },
  { id: 'TARS_TACTICAL', label: 'TARS Tactical', hint: '75% humor · 95% candor' },
  { id: 'LATE_NIGHT_CARE', label: 'Late-Night Care', hint: 'Calm & attentive' },
  { id: 'DEBUG_SURGEON', label: 'Debug Surgeon', hint: '100% candor · concise' },
];

const QUICK_PROMPTS = [
  'Summarize active system telemetry and recommended local model.',
  'Audit our current architecture for free-tier edge-to-desktop bottlenecks.',
  'Draft a concise verification checklist for SQLite WAL + FastAPI IPC.',
];

function normalizePersonaKey(raw: string | undefined): string {
  if (!raw) return 'CARING_COMPANION';
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function ChatView() {
  const { telemetry, pushToast } = useNexusStore();

  // Models catalog
  const [models, setModels] = useState<ModelItem[]>([]);
  const [selectedModelUid, setSelectedModelUid] = useState<string>('');
  const [modelsLoading, setModelsLoading] = useState(false);

  // Persona state
  const [persona, setPersona] = useState<PersonaSettingsShape>({
    empathy_pct: 88,
    humor_pct: 45,
    candor_pct: 80,
    verbosity_pct: 50,
    voice_id: 'af_heart',
    voice_engine: 'kokoro',
    active_preset: 'CARING_COMPANION',
  });
  const [activatingPersona, setActivatingPersona] = useState<string | null>(null);

  // Haru voice & dictation state
  const [haruStatus, setHaruStatus] = useState<HaruStatusShape | null>(null);
  const [haruBusy, setHaruBusy] = useState(false);
  const [dictating, setDictating] = useState(false);

  // Conversation thread
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [promptInput, setPromptInput] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await ipcJson<ModelsCatalogResponse>('/api/models/catalog');
      if (res.success !== false && Array.isArray(res.models)) {
        setModels(res.models);
        setSelectedModelUid((prev) => {
          if (prev && res.models?.some((m) => m.model_uid === prev)) {
            return prev;
          }
          const recommended = telemetry.recommendedLocalModel
            ? res.models?.find(
                (m) =>
                  m.api_or_hf_id === telemetry.recommendedLocalModel ||
                  m.model_uid === telemetry.recommendedLocalModel
              )
            : undefined;
          return recommended?.model_uid ?? res.models?.[0]?.model_uid ?? '';
        });
      }
    } catch {
      // Gateway offline; keep existing catalog state
    } finally {
      setModelsLoading(false);
    }
  }, [telemetry.recommendedLocalModel]);

  const loadPersona = useCallback(async () => {
    try {
      const res = await ipcJson<PersonaResponse>('/api/persona');
      const resolved = res.persona ?? res.settings;
      if (res.success !== false && resolved) {
        setPersona(resolved);
      }
    } catch {
      // Gateway offline
    }
  }, []);

  const loadHaruStatus = useCallback(async () => {
    try {
      const res = await ipcJson<HaruStatusShape>('/api/voice/haru/status');
      if (res) {
        setHaruStatus(res.status ?? res);
      }
    } catch {
      // Gateway offline
    }
  }, []);

  useEffect(() => {
    void loadModels();
    void loadPersona();
    void loadHaruStatus();
  }, [loadModels, loadPersona, loadHaruStatus]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const selectedModel = useMemo(
    () => models.find((m) => m.model_uid === selectedModelUid) ?? null,
    [models, selectedModelUid]
  );

  const activePersonaKey = normalizePersonaKey(persona.active_preset);

  const handleActivatePersona = async (personaId: string) => {
    if (activatingPersona) return;
    setActivatingPersona(personaId);
    try {
      const res = await ipcJson<PersonaResponse>('/api/persona/activate', {
        method: 'POST',
        body: JSON.stringify({ persona_id: personaId }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Persona Update Failed',
          message: res.error ?? `Unable to activate ${personaId}`,
          tone: 'error',
        });
        return;
      }
      const nextSettings = res.persona ?? res.settings;
      if (nextSettings) {
        setPersona(nextSettings);
      } else {
        setPersona((prev) => ({ ...prev, active_preset: personaId }));
      }
      pushToast({
        title: 'Persona Activated',
        message: personaId.replace(/_/g, ' '),
        tone: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Persona Activation Error',
        message: err instanceof Error ? err.message : 'IPC request failed',
        tone: 'error',
      });
    } finally {
      setActivatingPersona(null);
    }
  };

  const handleToggleHaru = async () => {
    if (haruBusy) return;
    setHaruBusy(true);
    const nextEnabled = !(haruStatus?.enabled ?? false);
    try {
      const res = await ipcJson<HaruStatusShape>('/api/voice/haru/toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (res.status) {
        setHaruStatus(res.status);
      } else if (typeof res.enabled === 'boolean') {
        setHaruStatus(res);
      }
      if (res.success === false) {
        pushToast({
          title: res.air_gapped ? 'Blocked in SILENT Mode' : 'Haru Voice Blocked',
          message: res.error ?? 'Unable to toggle Haru-4B duplex bridge.',
          tone: 'warning',
        });
      } else {
        pushToast({
          title: nextEnabled ? 'Haru-4B Voice Enabled' : 'Kokoro Local Voice Active',
          message: nextEnabled
            ? 'Full-duplex neural voice bridge engaged.'
            : 'Switched back to local Kokoro engine.',
          tone: 'success',
        });
      }
    } catch (err) {
      pushToast({
        title: 'Haru Toggle Failed',
        message: err instanceof Error ? err.message : 'Unable to toggle voice engine',
        tone: 'error',
      });
    } finally {
      setHaruBusy(false);
    }
  };

  const handleDictate = async () => {
    if (dictating) return;
    setDictating(true);
    try {
      const res = await ipcJson<DictateResponse>('/api/voice/dictate', {
        method: 'POST',
        body: JSON.stringify({ duration_sec: 4.0, inject: false }),
      });
      if (res.success === false) {
        pushToast({
          title: 'Dictation Failed',
          message: res.error ?? 'Microphone capture or transcription error.',
          tone: 'error',
        });
        return;
      }
      const transcript = (res.cleaned_text ?? res.raw_text ?? res.text ?? '').trim();
      if (transcript) {
        setPromptInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        pushToast({
          title: 'Dictation Transcribed',
          message:
            typeof res.latency_ms === 'number'
              ? `Captured in ${Math.round(res.latency_ms)} ms`
              : 'Added to composer',
          tone: 'success',
        });
      } else {
        pushToast({
          title: 'No Speech Detected',
          message: 'Microphone captured silence during the 4s window.',
          tone: 'info',
        });
      }
    } catch (err) {
      pushToast({
        title: 'Dictation Offline',
        message: err instanceof Error ? err.message : 'Unable to reach /api/voice/dictate',
        tone: 'error',
      });
    } finally {
      setDictating(false);
    }
  };

  const sendPrompt = async (rawPrompt: string) => {
    const cleanPrompt = rawPrompt.trim();
    if (!cleanPrompt || sending) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: cleanPrompt,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setPromptInput('');
    setSending(true);

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await ipcJson<AiChatResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          prompt: cleanPrompt,
          model: selectedModel?.api_or_hf_id ?? selectedModel?.model_uid,
          provider: selectedModel?.provider_id,
          persona_preset: activePersonaKey,
          max_tokens: 1536,
          messages: nextHistory
            .filter((m) => m.role !== 'error')
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const elapsed = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt
      );
      const replyText = (res.response ?? res.text ?? '').trim();

      if (res.success === false || !replyText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'error',
            content:
              res.error ??
              'Inference router returned an empty response. Verify provider keys in Vault or local Ollama.',
            latencyMs: elapsed,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `ast-${Date.now()}`,
            role: 'assistant',
            content: replyText,
            model: res.model || selectedModel?.display_name || 'Sovereign Router',
            provider: res.provider || selectedModel?.provider_id || 'local',
            latencyMs: elapsed,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'error',
          content: err instanceof Error ? err.message : 'Unable to reach /api/ai/chat',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendPrompt(promptInput);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt(promptInput);
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
    } catch {
      pushToast({ title: 'Clipboard Unavailable', tone: 'warning' });
    }
  };

  return (
    <div className="h-full flex flex-col p-6 gap-6 animate-obsidian-fade overflow-hidden">
      {/* Top Control Header: max 3 uncrowded groups (Persona | Model | Haru Voice) */}
      <header className="obsidian-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-6 shrink-0">
        {/* Group 1: Persona Bar */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>Persona Matrix</span>
            <span className="text-[var(--text-secondary)]">
              · E {persona.empathy_pct ?? 80}% / H {persona.humor_pct ?? 45}% / C{' '}
              {persona.candor_pct ?? 85}%
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {CANONICAL_PERSONAS.map((preset) => {
              const active = activePersonaKey === preset.id;
              const busy = activatingPersona === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={Boolean(activatingPersona)}
                  onClick={() => void handleActivatePersona(preset.id)}
                  title={preset.hint}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    active
                      ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                      : 'border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  {busy ? 'Activating...' : preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Group 2: Model Picker */}
        <div className="flex flex-col gap-2 min-w-[260px] flex-1 max-w-md">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <span>Model Catalog ({models.length})</span>
            <button
              type="button"
              onClick={() => void loadModels()}
              className="hover:text-emerald-300 transition-colors flex items-center gap-1"
              title="Refresh model catalog"
            >
              <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedModelUid}
              onChange={(e) => setSelectedModelUid(e.target.value)}
              aria-label="Select AI Model"
              className="w-full bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-3 py-2 text-xs font-mono text-[var(--text)] outline-none"
            >
              {models.length === 0 ? (
                <option value="">Sovereign Auto-Router (Default)</option>
              ) : (
                models.map((m) => (
                  <option key={m.model_uid} value={m.model_uid}>
                    {m.display_name} · {m.provider_id}
                    {m.context_window ? ` (${m.context_window})` : ''}
                  </option>
                ))
              )}
            </select>
            {selectedModel && Boolean(selectedModel.is_abliterated) && (
              <span
                className="px-2 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] font-mono uppercase shrink-0"
                title="Refusal-removed / abliterated model weights"
              >
                Abliterated
              </span>
            )}
          </div>
        </div>

        {/* Group 3: Haru Voice Duplex Bridge */}
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] text-[var(--text-muted)]">
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
            <span>Haru Voice Duplex</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleToggleHaru()}
              disabled={haruBusy}
              className={`px-3.5 py-2 rounded-lg border text-xs font-mono flex items-center gap-2 transition-colors ${
                haruStatus?.enabled
                  ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                  : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-[var(--text)]'
              }`}
            >
              {haruStatus?.enabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              {haruBusy
                ? 'Switching...'
                : haruStatus?.enabled
                  ? 'Haru-4B Active'
                  : 'Haru-4B Standby'}
            </button>
            <span className="text-[11px] font-mono text-[var(--text-muted)] px-2">
              {haruStatus?.air_gapped
                ? 'AIR-GAPPED'
                : haruStatus?.available
                  ? `${haruStatus.latency_ms ?? '—'} ms`
                  : 'Local Kokoro'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Conversation Thread */}
      <section className="obsidian-panel rounded-xl flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-6 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {selectedModel
                ? `${selectedModel.display_name} · ${selectedModel.runtime_target.toUpperCase()}`
                : 'Federated Sovereign LLM Mesh'}
            </span>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="px-2.5 py-1 rounded-md border border-[var(--border-subtle)] hover:border-red-500/35 text-[11px] font-mono text-[var(--text-muted)] hover:text-red-300 transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Clear Thread
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center space-y-6 py-8">
              <div className="w-12 h-12 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                <Bot className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-medium text-[var(--text)]">
                  Obsidian Sovereign Conversation
                </h2>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Prompts dispatch directly through the local{' '}
                  <span className="font-mono text-emerald-300">/api/ai/chat</span> mesh with{' '}
                  <span className="font-mono">{telemetry.workspaceMode}</span> workspace guardrails.
                </p>
              </div>
              <div className="w-full space-y-2.5 text-left">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => setPromptInput(qp)}
                    className="w-full px-4 py-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--panel-muted)] hover:border-emerald-500/40 text-xs text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors text-left"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isError = msg.role === 'error';
              return (
                <article
                  key={msg.id}
                  className={`rounded-xl border p-5 space-y-2.5 ${
                    isUser
                      ? 'border-[var(--border)] bg-[var(--panel-elevated)] ml-auto max-w-3xl'
                      : isError
                        ? 'border-red-500/35 bg-red-500/10 mr-auto max-w-3xl'
                        : 'border-emerald-500/20 bg-[var(--panel-muted)] mr-auto max-w-4xl'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[11px] font-mono text-[var(--text-muted)]">
                    <span className="flex items-center gap-2">
                      {isUser ? (
                        <>
                          <User className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          <span className="text-[var(--text-secondary)]">OPERATOR</span>
                        </>
                      ) : isError ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-red-300">GATEWAY NOTICE</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-300">
                            {msg.model ?? 'NEXUS'} · {msg.provider ?? 'local'}
                          </span>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      {typeof msg.latencyMs === 'number' && <span>{msg.latencyMs} ms</span>}
                      <button
                        type="button"
                        onClick={() => void handleCopyMessage(msg)}
                        className="hover:text-emerald-300 transition-colors flex items-center gap-1"
                        title="Copy message"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-sm text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed">
                    {msg.content}
                  </div>
                </article>
              );
            })
          )}
          {sending && (
            <div className="rounded-xl border border-emerald-500/20 bg-[var(--panel-muted)] p-4 max-w-md flex items-center gap-3 text-xs font-mono text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-obsidian-pulse" />
              Routing inference across federated compute pool...
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Composer Dock */}
        <form
          onSubmit={handleSubmit}
          className="p-5 border-t border-[var(--border-subtle)] bg-[var(--panel)] flex items-end gap-3 shrink-0"
        >
          <button
            type="button"
            onClick={() => void handleDictate()}
            disabled={dictating}
            className={`px-3.5 py-3 rounded-lg border text-xs font-mono flex items-center gap-2 transition-colors shrink-0 ${
              dictating
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                : 'border-[var(--border)] bg-[var(--panel-muted)] text-[var(--text-secondary)] hover:border-emerald-500/40 hover:text-emerald-300'
            }`}
            title="Record 4s dictation via faster-whisper (/api/voice/dictate)"
          >
            <Mic className={`w-4 h-4 ${dictating ? 'animate-pulse text-emerald-400' : ''}`} />
            {dictating ? 'Listening...' : 'Dictate'}
          </button>

          <textarea
            rows={2}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Message Nexus Sovereign AI (Enter to send, Shift+Enter for newline)..."
            className="flex-1 resize-none bg-[var(--panel-muted)] border border-[var(--border)] focus:border-emerald-500/60 rounded-lg px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none transition-colors"
          />

          <button
            type="submit"
            disabled={sending || !promptInput.trim()}
            className="px-5 py-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-40 border border-emerald-500/40 text-emerald-300 text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Routing...' : 'Send'}
          </button>
        </form>
      </section>
    </div>
  );
}

export default ChatView;
