import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Shield, Zap, Terminal, CheckCircle2, XCircle, Sliders, FileCode, Cpu, AlertTriangle, Play, RefreshCw } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

// ==========================================
// Matrix / Cipher Text Scramble Component
// ==========================================
const CIPHER_CHARS = '0123456789ABCDEF$#@%&*<>_/~!=';

interface CipherHeaderProps {
  text: string;
  triggerKey?: any;
}

const CipherHeader: React.FC<CipherHeaderProps> = ({ text, triggerKey }) => {
  const [displayText, setDisplayText] = useState(text);
  const [hasScrambled, setHasScrambled] = useState(false);
  const elementRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let frame = 0;
    const maxFrames = 20;
    const length = text.length;

    const interval = setInterval(() => {
      frame++;
      const progress = frame / maxFrames;
      const resolvedCount = Math.floor(progress * length);

      const scrambled = text
        .split('')
        .map((char, idx) => {
          if (idx < resolvedCount || char === ' ' || char === '/') {
            return char;
          }
          return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
        })
        .join('');

      setDisplayText(scrambled);

      if (frame >= maxFrames) {
        clearInterval(interval);
        setDisplayText(text);
        setHasScrambled(true);
      }
    }, 35);

    return () => clearInterval(interval);
  }, [text, triggerKey]);

  return (
    <h3 ref={elementRef} className="font-mono text-cyan-400 font-bold tracking-wider text-base sm:text-lg mb-2">
      {displayText}
    </h3>
  );
};

// ==========================================
// Main Manifesto & Feature Walkthrough
// ==========================================
export const ManifestoScramble: React.FC = () => {
  const manifestoRef = useRef<HTMLDivElement>(null);
  const walkthroughRef = useRef<HTMLDivElement>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);

  const [illuminatedWordCount, setIlluminatedWordCount] = useState(0);
  const [activeStep, setActiveStep] = useState(0);

  // Micro-Demo 1 State: HITL Notch Approval
  const [notchState, setNotchState] = useState<'PENDING' | 'ALLOWED' | 'DENIED'>('PENDING');
  
  // Micro-Demo 2 State: TARS Sliders
  const [candor, setCandor] = useState(90);
  const [humor, setHumor] = useState(65);
  const [empathy, setEmpathy] = useState(85);

  const words = [
    { text: 'Every', highlight: false },
    { text: 'AI', highlight: false },
    { text: 'wrapper', highlight: false },
    { text: 'gives', highlight: false },
    { text: 'you', highlight: false },
    { text: 'a', highlight: false },
    { text: 'chat', highlight: false },
    { text: 'box.', highlight: false },
    { text: 'NEXUS', highlight: true },
    { text: 'lives', italic: true },
    { text: 'inside', italic: true },
    { text: 'your', italic: true },
    { text: 'operating', italic: true },
    { text: 'system—', italic: true },
    { text: 'seeing', highlight: false },
    { text: 'your', highlight: false },
    { text: 'screen', highlight: false },
    { text: 'in', highlight: false },
    { text: 'real', highlight: false },
    { text: 'time,', highlight: false },
    { text: 'patching', highlight: false },
    { text: 'your', highlight: false },
    { text: 'codebase', highlight: false },
    { text: 'in', highlight: false },
    { text: 'isolated', highlight: false },
    { text: 'Git', highlight: false },
    { text: 'worktrees,', highlight: false },
    { text: 'and', highlight: false },
    { text: 'guarding', highlight: false },
    { text: 'every', highlight: false },
    { text: 'file', highlight: false },
    { text: 'in', highlight: false },
    { text: '0', highlight: true },
    { text: 'MB', highlight: true },
    { text: 'idle', highlight: true },
    { text: 'RAM.', highlight: true },
  ];

  // Word-by-word scroll illumination
  useEffect(() => {
    const el = manifestoRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 80%',
        end: 'bottom 40%',
        scrub: true,
        onUpdate: (self) => {
          const count = Math.floor(self.progress * words.length);
          setIlluminatedWordCount(count);
        },
      });
    }, el);

    return () => ctx.revert();
  }, [words.length]);

  // Walkthrough cards trigger activeStep
  useEffect(() => {
    const el = walkthroughRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      const cards = [card1Ref.current, card2Ref.current, card3Ref.current];
      cards.forEach((card, idx) => {
        if (!card) return;
        ScrollTrigger.create({
          trigger: card,
          start: 'top 60%',
          end: 'bottom 60%',
          onEnter: () => setActiveStep(idx),
          onEnterBack: () => setActiveStep(idx),
        });
      });
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <section id="manifesto" className="relative w-full py-28 px-4 sm:px-8 bg-[#030711] overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-cyan-500/5 blur-[140px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto">
        {/* Section Pill */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 font-mono text-xs">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>MANIFESTO // 001</span>
          </div>
        </div>

        {/* Word-by-Word Scroll Illumination Statement */}
        <div ref={manifestoRef} className="max-w-4xl mx-auto text-center mb-36 py-8">
          <p className="font-space font-medium text-2xl sm:text-3xl md:text-5xl lg:text-5xl leading-relaxed md:leading-normal">
            {words.map((item, index) => {
              const isIlluminated = index <= illuminatedWordCount;
              return (
                <span
                  key={index}
                  className={`inline-block mx-1.5 transition-all duration-200 ${
                    item.italic
                      ? isIlluminated
                        ? 'font-editorial italic font-normal text-cyan-300 drop-shadow-[0_0_15px_rgba(0,245,212,0.6)]'
                        : 'font-editorial italic font-normal text-slate-700'
                      : item.highlight
                      ? isIlluminated
                        ? 'text-cyan-400 font-bold drop-shadow-[0_0_12px_rgba(0,245,212,0.4)]'
                        : 'text-slate-800'
                      : isIlluminated
                      ? 'text-white'
                      : 'text-slate-800'
                  }`}
                >
                  {item.text}
                </span>
              );
            })}
          </p>
        </div>

        {/* Sticky 2-Column Feature Walkthrough */}
        <div id="architecture" ref={walkthroughRef} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column: 3 Narrative Narrative Cards */}
          <div className="lg:col-span-7 space-y-24 py-6">
            {/* Card 1: ZERO-IDLE-RAM */}
            <div
              ref={card1Ref}
              className={`p-8 rounded-2xl transition-all duration-500 ${
                activeStep === 0
                  ? 'spatial-glass-cyan shadow-[0_0_35px_rgba(0,245,212,0.12)]'
                  : 'spatial-glass opacity-60 hover:opacity-90'
              }`}
            >
              <CipherHeader text="01 // ZERO-IDLE-RAM INFINITY SLICES" triggerKey={activeStep === 0} />
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-sans">
                Stackless execution threads load state directly from <code className="px-1.5 py-0.5 rounded bg-black/60 text-cyan-300 font-mono text-xs">~/.nexus-agent/db/agent_local.db</code>, execute exactly one atomic tool turn, and instantly release 100% of host RAM.
              </p>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">State Persistence</span>
                  <span className="text-cyan-300 font-semibold">SQLite WAL (Local)</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Sleep Footprint</span>
                  <span className="text-emerald-400 font-semibold">0.00 MB Memory</span>
                </div>
              </div>
            </div>

            {/* Card 2: SUB-100MS WIN32 & OBSCURA */}
            <div
              ref={card2Ref}
              className={`p-8 rounded-2xl transition-all duration-500 ${
                activeStep === 1
                  ? 'spatial-glass-cyan shadow-[0_0_35px_rgba(0,245,212,0.12)]'
                  : 'spatial-glass opacity-60 hover:opacity-90'
              }`}
            >
              <CipherHeader text="02 // SUB-100MS WIN32 & OBSCURA ACTUATION" triggerKey={activeStep === 1} />
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-sans">
                Native Windows UI Automation (UIA) accessibility tree inspection, offline WinRT OCR, and dual-engine <code className="px-1.5 py-0.5 rounded bg-black/60 text-sky-300 font-mono text-xs">obscura</code> Rust CDP + persistent browser distillation.
              </p>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Actuation Speed</span>
                  <span className="text-amber-400 font-semibold">&lt; 100ms Win32</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Browser Engine</span>
                  <span className="text-sky-300 font-semibold">Obscura Rust CDP</span>
                </div>
              </div>
            </div>

            {/* Card 3: SCOPEGUARD 6-INVARIANT */}
            <div
              ref={card3Ref}
              className={`p-8 rounded-2xl transition-all duration-500 ${
                activeStep === 2
                  ? 'spatial-glass-cyan shadow-[0_0_35px_rgba(0,245,212,0.12)]'
                  : 'spatial-glass opacity-60 hover:opacity-90'
              }`}
            >
              <CipherHeader text="03 // SCOPEGUARD 6-INVARIANT & HITL NOTCH" triggerKey={activeStep === 2} />
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 font-sans">
                Strict path-jail containment, Windows DPAPI hardware-backed encryption vault, and 1-tap Human-In-The-Loop <code className="px-1.5 py-0.5 rounded bg-black/60 text-emerald-300 font-mono text-xs">Allow / Deny</code> Dynamic Notch execution approvals.
              </p>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Security Model</span>
                  <span className="text-emerald-400 font-semibold">6 GRAVITAS Invariants</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-slate-800">
                  <span className="text-slate-400 block mb-1">Credential Storage</span>
                  <span className="text-cyan-300 font-semibold">Windows DPAPI</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Interactive Cockpit Micro-Demo Card */}
          <div className="lg:col-span-5 sticky top-28">
            <div className="spatial-glass rounded-2xl p-6 border-cyan-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
              {/* Subtle grid pattern inside card */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#081b2e_1px,transparent_1px),linear-gradient(to_bottom,#081b2e_1px,transparent_1px)] bg-[size:16px_16px] opacity-25 pointer-events-none" />

              {/* Card Header with Telemetry */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-mono text-xs font-semibold text-slate-200 uppercase">
                    {activeStep === 0 && 'DEMO // HITL NOTCH APPROVAL'}
                    {activeStep === 1 && 'DEMO // TARS TELEMETRY'}
                    {activeStep === 2 && 'DEMO // DEV-01 AST DIFF'}
                  </span>
                </div>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  LIVE INTERACTIVE
                </span>
              </div>

              {/* MICRO-DEMO 0: Dynamic Notch Approval Simulation */}
              {activeStep === 0 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-black/50 border border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-xs text-slate-400">DYNAMIC NOTCH HUD</span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                        notchState === 'PENDING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        notchState === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}>
                        {notchState}
                      </span>
                    </div>

                    {/* Notch Pill Header */}
                    <div className="w-full py-2 px-3 rounded-lg bg-[#030711] border border-cyan-500/30 flex items-center justify-between text-xs font-mono mb-4">
                      <div className="flex items-center gap-2 text-cyan-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Action: Modify File System</span>
                      </div>
                      <span className="text-slate-500 text-[10px]">core/runtime</span>
                    </div>

                    <p className="text-xs text-slate-300 font-mono mb-4">
                      Target: <span className="text-amber-300">core/security/vault.py</span>
                      <br />
                      Operation: <span className="text-cyan-300">DPAPI key rotation (turn 1)</span>
                    </p>

                    {/* Allow / Deny buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setNotchState('ALLOWED')}
                        className={`flex-1 py-2 rounded-lg font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          notchState === 'ALLOWED'
                            ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                            : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ALLOW (1-Tap)</span>
                      </button>

                      <button
                        onClick={() => setNotchState('DENIED')}
                        className={`flex-1 py-2 rounded-lg font-mono text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          notchState === 'DENIED'
                            ? 'bg-red-500 text-slate-950 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                            : 'bg-red-950/40 text-red-300 border border-red-500/30 hover:bg-red-900/50'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>DENY</span>
                      </button>

                      <button
                        onClick={() => setNotchState('PENDING')}
                        className="p-2 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white"
                        title="Reset demo"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-[11px] font-mono text-slate-400">
                    <span className="text-cyan-400">&gt; Status: </span>
                    {notchState === 'PENDING' && 'Waiting for physical approval via Notch HUD...'}
                    {notchState === 'ALLOWED' && 'Turn executed. RAM released in 12ms. 0 MB active.'}
                    {notchState === 'DENIED' && 'Aborted. ScopeGuard invariant #2 maintained.'}
                  </div>
                </div>
              )}

              {/* MICRO-DEMO 1: TARS Telemetry Sliders */}
              {activeStep === 1 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-black/50 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">TARS REASONING MATRIX</span>
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    </div>

                    {/* Candor Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-300">Candor</span>
                        <span className="text-cyan-400">{candor}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={candor}
                        onChange={(e) => setCandor(Number(e.target.value))}
                        className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Humor Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-300">Humor</span>
                        <span className="text-amber-400">{humor}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={humor}
                        onChange={(e) => setHumor(Number(e.target.value))}
                        className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Empathy Slider */}
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-300">Empathy</span>
                        <span className="text-emerald-400">{empathy}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={empathy}
                        onChange={(e) => setEmpathy(Number(e.target.value))}
                        className="w-full accent-emerald-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono text-slate-300">
                    <span className="text-cyan-400 font-bold">&gt; TARS Output: </span>
                    <span className="text-slate-300">
                      {candor > 85 ? '"Zero mocks detected. Code is razor-sharp. Ready for production."' : '"Telemetry normalized. Awaiting directive."'}
                    </span>
                  </div>
                </div>
              )}

              {/* MICRO-DEMO 2: DEV-01 AST Diff Preview */}
              {activeStep === 2 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-black/60 border border-slate-800 font-mono text-[11px] overflow-x-auto">
                    <div className="flex items-center justify-between text-slate-400 mb-2 border-b border-slate-800 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                        git-worktree/dev-01-patch.ts
                      </span>
                      <span className="text-emerald-400 font-semibold">AST VERIFIED</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-red-400/80 bg-red-950/30 px-1 py-0.5 rounded">
                        - const state = await mockDatabase.find();
                      </div>
                      <div className="text-emerald-400 bg-emerald-950/30 px-1 py-0.5 rounded">
                        + const state = await localSqliteWal.execute(query);
                      </div>
                      <div className="text-slate-400 px-1">
                        &nbsp;&nbsp;await scopeGuard.enforceInvariants(state);
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/25 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Tree-sitter Parser: 0 Errors</span>
                    </div>
                    <span className="text-slate-400 text-[10px]">Git Worktree Clean</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
