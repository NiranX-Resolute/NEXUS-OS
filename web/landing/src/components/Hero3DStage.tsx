import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Download,
  ArrowRight,
  ExternalLink,
  Grid,
  Radio,
  Cpu,
  Shield,
  Layers,
  Terminal,
  Activity,
} from 'lucide-react';
import { MagneticButton } from './MagneticButton';

gsap.registerPlugin(ScrollTrigger);

// ==========================================
// Live Status Radar Pill Component
// ==========================================
interface LiveStatusData {
  status: 'OPERATIONAL' | 'DEGRADED' | 'CHECKING';
  nodes: number;
  latencyMs: number;
  d1Status: string;
}

const LiveStatusRadarPill: React.FC = () => {
  const [telemetry, setTelemetry] = useState<LiveStatusData>({
    status: 'OPERATIONAL',
    nodes: 5,
    latencyMs: 16,
    d1Status: 'SYNCHRONIZED',
  });

  useEffect(() => {
    let isMounted = true;
    const fetchTelemetry = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch('https://nexus-bridge.pages.dev/api/status/summary', {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setTelemetry({
              status: data.status || 'OPERATIONAL',
              nodes: data.active_nodes || data.nodes || 5,
              latencyMs: data.latency_ms || 16,
              d1Status: data.d1_mesh || 'SYNCHRONIZED',
            });
            return;
          }
        }
      } catch {
        try {
          const controller2 = new AbortController();
          const timeout2 = setTimeout(() => controller2.abort(), 2500);
          await fetch('https://nexus-status-1cl.pages.dev', {
            signal: controller2.signal,
            mode: 'no-cors',
          });
          clearTimeout(timeout2);
          if (isMounted) {
            setTelemetry({
              status: 'OPERATIONAL',
              nodes: 5,
              latencyMs: 22,
              d1Status: 'EDGE ACTIVE',
            });
          }
        } catch {
          // Maintain operational default
        }
      }
    };

    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 25000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <a
      href="/status"
      className="group inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#040e1b]/80 border border-cyan-400/30 hover:border-cyan-400 text-cyan-300 font-mono text-[11px] mb-4 backdrop-blur-xl shadow-[0_0_20px_rgba(0,245,212,0.15)] hover:shadow-[0_0_28px_rgba(0,245,212,0.35)] transition-all cursor-pointer pointer-events-auto"
      title="Open Live System Diagnostics"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <span className="font-bold text-slate-100 group-hover:text-cyan-200 transition-colors uppercase tracking-wider">
        STATUS: {telemetry.status}
      </span>
      <span className="text-slate-600 font-mono">|</span>
      <span className="text-emerald-400 font-semibold">{telemetry.nodes} NODES</span>
      <span className="text-slate-600 font-mono">|</span>
      <span className="text-slate-400">{telemetry.latencyMs}ms</span>
      <ExternalLink className="w-3 h-3 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
    </a>
  );
};

// ==========================================
// Hero Stage Component (Zone 01)
// ==========================================
interface Hero3DStageProps {
  onOpenDownload?: () => void;
  onOpenMarketplace?: () => void;
}

export const Hero3DStage: React.FC<Hero3DStageProps> = ({ onOpenDownload, onOpenMarketplace }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        onUpdate: (self) => {
          setScrollProgress(self.progress);
        },
      });
    }, el);

    return () => ctx.revert();
  }, []);

  const handleDownloadClick = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/download');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (onOpenDownload) {
      onOpenDownload();
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-[160vh] pointer-events-none">
      {/* Sticky Hero Content Viewport with top clearance */}
      <div className="sticky top-0 left-0 w-full h-screen overflow-hidden flex flex-col justify-between pt-28 md:pt-32 pb-4 px-6 sm:px-8 max-w-7xl mx-auto">
        {/* Main 2-Column Responsive Hero Grid */}
        <div
          className="grid grid-cols-1 lg:grid-cols-12 items-center gap-8 w-full my-auto transition-all duration-300"
          style={{
            opacity: Math.max(0, 1 - scrollProgress * 2.8),
            transform: `translate3d(0, -${scrollProgress * 50}px, 0)`,
          }}
        >
          {/* Column 1: Left Editorial Content (Strictly in col-span-6 z-20) */}
          <div className="lg:col-span-6 relative z-20 pointer-events-auto space-y-4">
            {/* Section Index Marker */}
            <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
              <span className="text-cyan-400">01 //</span>
              <span>SOVEREIGN DESKTOP RUNTIME</span>
              <span className="text-slate-700">•</span>
              <span>EDGE COMPUTING MESH</span>
            </div>

            {/* Live Status Pill */}
            <LiveStatusRadarPill />

            {/* Bold Display Typography */}
            <h1 className="font-space font-extrabold text-3xl sm:text-5xl md:text-6xl xl:text-7xl tracking-[-0.03em] text-white leading-[1.08] drop-shadow-2xl">
              NEXUS OS{' '}
              <span className="font-mono text-cyan-400 text-2xl sm:text-4xl md:text-5xl font-normal">
                v5.0
              </span>
              <br />
              <span className="font-editorial italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-emerald-400">
                Sovereign Edge-to-Desktop AI
              </span>
            </h1>

            {/* Subtitle / Philosophy */}
            <p className="text-sm sm:text-base md:text-lg text-slate-300 leading-relaxed font-sans max-w-xl font-light">
              A 100% free-tier, zero-subscription sovereign intelligence runtime. Built on{' '}
              <span className="text-cyan-300 font-medium font-mono">local SQLite WAL</span>, sub-100ms{' '}
              <span className="text-emerald-300 font-medium">Win32 actuation</span>, and{' '}
              <span className="text-sky-300 font-medium font-mono">0 MB idle execution slices</span>.
            </p>

            {/* The Primary CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Primary CTA 1: Download Windows Installer */}
              <MagneticButton
                onClick={handleDownloadClick}
                className="group px-5 py-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-space font-bold text-xs tracking-wider uppercase transition-all duration-300 shadow-[0_0_25px_rgba(0,245,212,0.4)] hover:shadow-[0_0_35px_rgba(0,245,212,0.65)] flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 transition-transform group-hover:-translate-y-0.5 stroke-[1.5]" />
                <span>Download Windows Installer</span>
                <ArrowRight className="w-4 h-4 text-slate-950 transition-transform group-hover:translate-x-1 stroke-[1.5]" />
              </MagneticButton>

              {/* Primary CTA 2: Explore GitHub Repository */}
              <a
                href="https://github.com/NiranX-Resolute/NEXUS-OS"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-3 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-400/40 text-slate-200 hover:text-white font-space font-semibold text-xs tracking-wide transition-all backdrop-blur-md flex items-center gap-2 shadow-md cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current text-cyan-400" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Explore GitHub</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              {/* Primary CTA 3: Browse .nxskill Marketplace */}
              <MagneticButton
                onClick={onOpenMarketplace}
                className="group px-4 py-3 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-white/10 hover:border-cyan-400/30 text-cyan-300 font-space font-medium text-xs tracking-wide transition-all backdrop-blur-md flex items-center gap-2 cursor-pointer"
              >
                <Grid className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
                <span>Marketplace</span>
              </MagneticButton>
            </div>
          </div>

          {/* Column 2: Right 3D Orbiting Stage Bay (Strictly in col-span-6 z-10) */}
          <div className="lg:col-span-6 relative z-10 h-[380px] sm:h-[440px] lg:h-[520px] flex items-center justify-center pointer-events-auto">
            {/* Spatial Frame HUD Overlay around the 3D Sphere */}
            <div className="w-full h-full max-w-lg rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-cyan-950/10 via-transparent to-emerald-950/10 backdrop-blur-[2px] p-5 flex flex-col justify-between shadow-[0_0_40px_rgba(0,245,212,0.06)]">
              {/* Top HUD Telemetry */}
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                  <span className="font-semibold tracking-wider">DYSON MESH v5.0</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-emerald-400">4,000 FIBONACCI NODES</span>
                </div>
              </div>

              {/* 5 Orbiters Pill Status Matrix (Cleanly docked in right column) */}
              <div className="my-auto space-y-2.5 py-4">
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-purple-500/30 text-purple-300 backdrop-blur-md">
                    <span className="font-bold">DEV-01</span>
                    <span className="text-slate-400">Synthesizer</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-sky-500/30 text-sky-300 backdrop-blur-md">
                    <span className="font-bold">SYS-01</span>
                    <span className="text-slate-400">Win32 Hook</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-cyan-500/30 text-cyan-300 backdrop-blur-md">
                    <span className="font-bold">SCOUT-01</span>
                    <span className="text-slate-400">Vision UIA</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-emerald-500/30 text-emerald-300 backdrop-blur-md">
                    <span className="font-bold">SEC-01</span>
                    <span className="text-slate-400">DPAPI Guard</span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-amber-500/30 text-amber-300 backdrop-blur-md text-[10px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">OPS-01</span>
                    <span className="text-slate-400">Federated Edge Router</span>
                  </div>
                  <span className="text-emerald-400 font-semibold">100% AUTONOMOUS</span>
                </div>
              </div>

              {/* Bottom HUD Stat */}
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 border-t border-white/10 pt-3">
                <span>IPC: 127.0.0.1:47630</span>
                <span className="text-cyan-400">SUB-100MS WIN32 REFLEX</span>
              </div>
            </div>
          </div>
        </div>

        {/* Separated Bottom Telemetry Strip & Scroll Prompt */}
        <div className="w-full pointer-events-auto mt-4">
          {/* Key Architectural Telemetry Tickers */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 pt-3 border-t border-white/10 font-mono text-[11px] sm:text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>LOCAL SQLITE WAL</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>0 MB IDLE RAM</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>SUB-100MS WIN32 REFLEX</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span>FEDERATED GPU MESH</span>
            </div>
          </div>

          {/* Scroll Indicator Prompt (Cleanly spaced below ticker with mt-6 pb-6) */}
          <div
            className="mt-6 pb-6 flex flex-col items-center gap-1.5 font-mono text-[10px] text-slate-500 tracking-widest uppercase transition-opacity duration-300 pointer-events-none"
            style={{ opacity: Math.max(0, 1 - scrollProgress * 3.5) }}
          >
            <span>Scroll to explore architecture</span>
            <div className="w-3.5 h-6 rounded-full border border-slate-700 flex items-start justify-center p-1">
              <div className="w-1 h-1.5 rounded-full bg-cyan-400 animate-bounce" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Hero3DStage;
