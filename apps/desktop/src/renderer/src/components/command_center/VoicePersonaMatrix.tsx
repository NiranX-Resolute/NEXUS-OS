import React, { useState } from 'react';
import {
  Heart,
  Smile,
  ShieldAlert,
  MessageSquare,
  Volume2,
  Sparkles,
  Zap,
  Check,
  Radio,
  Sliders,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useAgentStore, agentStore, PersonaTelemetry } from '../../store/agentStore';

export function VoicePersonaMatrix() {
  const { persona, availableVoices } = useAgentStore();
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewFeedback, setPreviewFeedback] = useState<string>('');

  const handleSliderChange = (param: keyof PersonaTelemetry, val: number) => {
    agentStore.updatePersona({ [param]: val });
  };

  const handlePresetClick = (presetKey: string) => {
    agentStore.applyPreset(presetKey);
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    agentStore.updatePersona({ voice_id: e.target.value });
  };

  const handleTestVoice = async () => {
    setIsPlayingPreview(true);
    setPreviewFeedback('Synthesizing neural preview...');
    const res = await agentStore.previewPersona();
    if (res.success && res.preview_text) {
      setPreviewFeedback(`"${res.preview_text}"`);
    } else {
      setPreviewFeedback('Preview synthesized via local TTS audio bus.');
    }
    setTimeout(() => {
      setIsPlayingPreview(false);
    }, 3500);
  };

  const getEmpathyLabel = (pct: number) => {
    if (pct >= 70) return 'Deeply Caring & Attuned';
    if (pct >= 31) return 'Supportive Co-Pilot';
    return 'Clinical & Direct';
  };

  const getHumorLabel = (pct: number) => {
    if (pct >= 66) return 'Lively TARS Wit & Banter';
    if (pct >= 26) return 'Dry Observational Humor';
    return 'Strictly Serious (Zero Banter)';
  };

  const getCandorLabel = (pct: number) => {
    if (pct >= 85) return 'Unfiltered TARS Honesty';
    if (pct >= 50) return 'Balanced & Constructive';
    return 'Gentle & Diplomatic';
  };

  const getVerbosityLabel = (pct: number) => {
    if (pct >= 70) return 'Detailed Walkthrough';
    if (pct >= 35) return '2–4 Spoken Sentences';
    return 'Ultra-Brief (1 Sentence)';
  };

  const presets = [
    {
      id: 'CARING_COMPANION',
      label: 'Caring Companion',
      desc: 'Warm co-pilot, emotional presence & protective care',
      color: 'from-sky-500/20 to-emerald-500/20 border-sky-500/40 text-sky-300',
      activeColor: 'bg-sky-500/20 border-sky-400 text-sky-200 ring-1 ring-sky-400/50',
    },
    {
      id: 'TARS_TACTICAL',
      label: 'TARS Tactical',
      desc: 'Dry humor, 95% candor & ultra-crisp execution',
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300',
      activeColor: 'bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400/50',
    },
    {
      id: 'LATE_NIGHT_CARE',
      label: 'Late-Night Care',
      desc: 'Gentle cadence, stamina checks & empathetic focus',
      color: 'from-indigo-500/20 to-purple-500/20 border-indigo-500/40 text-indigo-300',
      activeColor: 'bg-indigo-500/20 border-indigo-400 text-indigo-200 ring-1 ring-indigo-400/50',
    },
    {
      id: 'DEBUG_SURGEON',
      label: 'Debug Surgeon',
      desc: '100% candor, zero fluff & surgical code dissection',
      color: 'from-rose-500/20 to-pink-500/20 border-rose-500/40 text-rose-300',
      activeColor: 'bg-rose-500/20 border-rose-400 text-rose-200 ring-1 ring-rose-400/50',
    },
  ];

  return (
    <div className="grid grid-cols-12 gap-5 h-full overflow-y-auto pr-1 select-none">
      <div className="col-span-12 lg:col-span-7 flex flex-col space-y-5">
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                Personality & Emotion Presets
              </h2>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
              SQLite WAL Synced
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {presets.map((p) => {
              const isActive = persona.active_preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePresetClick(p.id)}
                  className={`p-3 rounded-lg border text-left transition-all relative overflow-hidden ${
                    isActive
                      ? p.activeColor
                      : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{p.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 flex-1 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-5">
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                  TARS Telemetry Sliders
                </h2>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">0% &ndash; 100% Real-Time</span>
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span>Empathy & Emotional Care</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">
                      {getEmpathyLabel(persona.empathy_pct)}
                    </span>
                    <span className="font-mono font-bold text-rose-400 text-sm w-10 text-right">
                      {persona.empathy_pct}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={persona.empathy_pct}
                  onChange={(e) => handleSliderChange('empathy_pct', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                    <Smile className="w-3.5 h-3.5 text-amber-400" />
                    <span>Humor & Deadpan Wit</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">
                      {getHumorLabel(persona.humor_pct)}
                    </span>
                    <span className="font-mono font-bold text-amber-400 text-sm w-10 text-right">
                      {persona.humor_pct}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={persona.humor_pct}
                  onChange={(e) => handleSliderChange('humor_pct', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5 text-sky-400" />
                    <span>Candor & Direct Honesty</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">
                      {getCandorLabel(persona.candor_pct)}
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-sm w-10 text-right">
                      {persona.candor_pct}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={persona.candor_pct}
                  onChange={(e) => handleSliderChange('candor_pct', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Spoken Verbosity</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">
                      {getVerbosityLabel(persona.verbosity_pct)}
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-sm w-10 text-right">
                      {persona.verbosity_pct}%
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={persona.verbosity_pct}
                  onChange={(e) => handleSliderChange('verbosity_pct', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Spoken commands like &ldquo;Nexus, set empathy to 90%&rdquo; animate sliders live.</span>
            <span className="font-mono text-slate-400">Sub-50ms Reflex</span>
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5 flex flex-col space-y-5">
        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center space-x-2.5">
              <Volume2 className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                Voice Model Selection
              </h2>
            </div>
            <span className="text-[10px] uppercase font-bold text-sky-400 px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 rounded">
              Neural Edge
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                Active Spoken Voice
              </label>
              <select
                value={persona.voice_id}
                onChange={handleVoiceChange}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-sky-500 transition-colors"
              >
                {availableVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} &bull; [{v.engine.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleTestVoice}
              disabled={isPlayingPreview}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                isPlayingPreview
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-400 animate-pulse'
                  : 'bg-gradient-to-r from-sky-500 to-emerald-500 text-slate-950 hover:brightness-110 shadow-lg shadow-sky-500/20'
              }`}
            >
              <Play className={`w-3.5 h-3.5 ${isPlayingPreview ? 'animate-spin' : ''}`} />
              <span>{isPlayingPreview ? 'Synthesizing Spoken Audio...' : 'Test Voice & Emotion'}</span>
            </button>

            {previewFeedback && (
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-mono italic">
                {previewFeedback}
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#0B0F19] border border-slate-800 rounded-xl p-5 flex-1 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center space-x-2.5">
                <Radio className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                  Derived Neural Prosody
                </h2>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Live Modulation</span>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Kokoro Speech Speed</span>
                <span className="font-mono text-sm font-bold text-sky-400">
                  {Math.round((1.12 - (persona.empathy_pct / 100) * 0.14) * 100) / 100}x
                </span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Edge-TTS Prosody Rate</span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {Math.round(((1.12 - (persona.empathy_pct / 100) * 0.14) - 1.0) * 100)}%
                </span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Vocal Pitch Inflection</span>
                <span className="font-mono text-sm font-bold text-indigo-400">
                  {Math.round(((persona.empathy_pct - 50) / 50) * 4)} Hz
                </span>
              </div>

              <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">Warmth Cadence Factor</span>
                <span className="font-mono text-sm font-bold text-rose-400">
                  {Math.round((persona.empathy_pct / 80) * 100) / 100}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500">
            Nexus OS v5.0 Full-Duplex Acoustic & Emotional Engine &bull; Zero Cloud Leaks
          </div>
        </div>
      </div>
    </div>
  );
}

export default VoicePersonaMatrix;
