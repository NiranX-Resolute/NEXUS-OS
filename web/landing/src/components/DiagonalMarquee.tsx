import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const BAND_1_ITEMS = [
  '0 MB IDLE RAM',
  'SUB-100MS WIN32 REFLEX',
  'LOCAL SQLITE WAL',
  'DPAPI HARDWARE VAULT',
  'ZERO SUBSCRIPTIONS',
  '0 MB IDLE RAM',
  'SUB-100MS WIN32 REFLEX',
  'LOCAL SQLITE WAL',
  'DPAPI HARDWARE VAULT',
  'ZERO SUBSCRIPTIONS',
];

const BAND_2_ITEMS = [
  '5 AUTONOMOUS ORBITERS',
  'SCOPEGUARD 6-INVARIANT JAIL',
  'WDA_EXCLUDEFROMCAPTURE STEALTH',
  'CLOUDFLARE EDGE MESH',
  '5 AUTONOMOUS ORBITERS',
  'SCOPEGUARD 6-INVARIANT JAIL',
  'WDA_EXCLUDEFROMCAPTURE STEALTH',
  'CLOUDFLARE EDGE MESH',
];

export const DiagonalMarquee: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const band1Ref = useRef<HTMLDivElement>(null);
  const band2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let currentX1 = 0;
    let currentX2 = 0;
    let scrollSpeedMultiplier = 1;

    // ScrollTrigger to calculate velocity boost
    const st = ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        // Boost multiplier with scroll velocity (self.getVelocity())
        const velocity = Math.abs(self.getVelocity() / 300);
        scrollSpeedMultiplier = 1 + Math.min(velocity, 4.5);
      },
    });

    const ticker = gsap.ticker.add((time, deltaTime) => {
      // Lerp multiplier back towards 1
      scrollSpeedMultiplier = THREE_lerp(scrollSpeedMultiplier, 1, 0.05);

      const delta = (deltaTime / 16.66) * scrollSpeedMultiplier;

      // Band 1 moves left
      currentX1 -= 1.4 * delta;
      if (currentX1 <= -50) currentX1 = 0;
      if (band1Ref.current) {
        band1Ref.current.style.transform = `translateX(${currentX1}%)`;
      }

      // Band 2 moves right
      currentX2 += 1.2 * delta;
      if (currentX2 >= 0) currentX2 = -50;
      if (band2Ref.current) {
        band2Ref.current.style.transform = `translateX(${currentX2}%)`;
      }
    });

    return () => {
      st.kill();
      gsap.ticker.remove(ticker);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full py-24 my-10 overflow-hidden bg-[#030711] select-none"
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#030711] via-cyan-950/5 to-[#030711] pointer-events-none" />

      <div className="relative w-full h-[240px] flex items-center justify-center">
        {/* Band 1: Angled at -3.5deg (Electric Cyan) */}
        <div
          className="absolute w-[120vw] -left-[10vw] py-4 bg-gradient-to-r from-[#031525]/90 via-[#062c3e]/95 to-[#031525]/90 border-y border-cyan-400/40 shadow-[0_0_35px_rgba(0,245,212,0.25)] backdrop-blur-xl z-20"
          style={{ transform: 'rotate(-3.5deg)' }}
        >
          <div
            ref={band1Ref}
            className="flex items-center gap-8 whitespace-nowrap will-change-transform font-mono text-sm sm:text-base font-bold tracking-wider text-cyan-300"
          >
            {BAND_1_ITEMS.concat(BAND_1_ITEMS).map((item, i) => (
              <div key={i} className="flex items-center gap-8">
                <span className="drop-shadow-[0_0_12px_rgba(0,245,212,0.6)]">{item}</span>
                <span className="text-cyan-500/60 font-light">•</span>
              </div>
            ))}
          </div>
        </div>

        {/* Band 2: Angled at +3.5deg (Glass Obsidian + Emerald) */}
        <div
          className="absolute w-[120vw] -left-[10vw] py-4 bg-gradient-to-r from-[#021814]/90 via-[#04281e]/95 to-[#021814]/90 border-y border-emerald-400/40 shadow-[0_0_35px_rgba(16,185,129,0.25)] backdrop-blur-xl z-10"
          style={{ transform: 'rotate(3.5deg)' }}
        >
          <div
            ref={band2Ref}
            className="flex items-center gap-8 whitespace-nowrap will-change-transform font-mono text-sm sm:text-base font-bold tracking-wider text-emerald-300"
          >
            {BAND_2_ITEMS.concat(BAND_2_ITEMS).map((item, i) => (
              <div key={i} className="flex items-center gap-8">
                <span className="drop-shadow-[0_0_12px_rgba(16,185,129,0.6)]">{item}</span>
                <span className="text-emerald-500/60 font-light">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper lerp
function THREE_lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}
