import React, { useEffect, useState } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { Navbar } from './components/Navbar';
import { Hero3DStage } from './components/Hero3DStage';
import { ManifestoScramble } from './components/ManifestoScramble';
import { DiagonalMarquee } from './components/DiagonalMarquee';
import { FeatureShowcaseGrid } from './components/FeatureShowcaseGrid';
import { WorkspaceScrubber } from './components/WorkspaceScrubber';
import { FooterHorizon } from './components/FooterHorizon';
import { DownloadModal } from './components/DownloadModal';
import { SkillMarketplaceModal } from './components/SkillMarketplaceModal';
import { PersistentWorldCanvas, WorldThemeContext, WorldTheme } from './components/PersistentWorldCanvas';

import { GuidesPage } from './pages/GuidesPage';
import { ComputeHubPage } from './pages/ComputeHubPage';
import { SkillsCatalogPage } from './pages/SkillsCatalogPage';
import { StatusPage } from './pages/StatusPage';
import { DownloadPage } from './pages/DownloadPage';

gsap.registerPlugin(ScrollTrigger);

export const App: React.FC = () => {
  const [worldTheme, setWorldTheme] = useState<WorldTheme>('default');
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [marketplaceModalOpen, setMarketplaceModalOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      let p = window.location.pathname;
      if (p.endsWith('/') && p.length > 1) {
        p = p.slice(0, -1);
      }
      setCurrentPath(p);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Scroll to top on route change
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
      window.__nexusScrollVelocity = 0;
      window.__nexusScrollProgress = 0;
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      touchMultiplier: 2,
    });

    const handleScroll = (e: any) => {
      ScrollTrigger.update();
      if (typeof window !== 'undefined') {
        window.__nexusScrollVelocity = e.velocity ?? 0;
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        window.__nexusScrollProgress = total > 0 ? window.scrollY / total : 0;
      }
    };

    lenis.on('scroll', handleScroll);

    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(tickerCallback);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tickerCallback);
      lenis.destroy();
      if (typeof window !== 'undefined') {
        window.__nexusScrollVelocity = 0;
        window.__nexusScrollProgress = 0;
      }
    };
  }, [currentPath]);

  const renderContent = () => {
    switch (currentPath) {
      case '/download':
        return <DownloadPage />;
      case '/guides':
        return <GuidesPage />;
      case '/compute':
        return <ComputeHubPage />;
      case '/skills':
        return <SkillsCatalogPage />;
      case '/status':
        return <StatusPage />;
      default:
        return (
          <main>
            {/* Section 1: Hero 3D Stage with Bold Editorial Typography, Live Status Pill & CTAs */}
            <Hero3DStage
              onOpenDownload={() => setDownloadModalOpen(true)}
              onOpenMarketplace={() => setMarketplaceModalOpen(true)}
            />

            {/* Section 2: Word-by-Word Manifesto & Cipher Scramble Walkthrough */}
            <ManifestoScramble />

            {/* Section 3: Dual Crossing Diagonal Telemetry Marquees */}
            <DiagonalMarquee />

            {/* Section 4: Interactive Feature Showcase Grid (6 Core Pillars) */}
            <FeatureShowcaseGrid />

            {/* Section 5: Interactive Workspace Scrubber & 5-Orbiter Swarm */}
            <WorkspaceScrubber />

            {/* Section 6: Zero-Subscription Stack, Architecture & FAQ Accordion, Horizon Footer */}
            <FooterHorizon
              onOpenDownload={() => setDownloadModalOpen(true)}
              onOpenMarketplace={() => setMarketplaceModalOpen(true)}
            />
          </main>
        );
    }
  };

  return (
    <WorldThemeContext.Provider value={{ theme: worldTheme, setTheme: setWorldTheme }}>
      <div className="relative min-h-screen bg-[#03050A] text-slate-100 overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
        {/* Master Persistent 3D World Canvas (WebGL R3F) */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <PersistentWorldCanvas currentPath={currentPath} />
        </div>

        {/* Architectural 3% SVG Film-Grain Texture Overlay */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 pointer-events-none opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating Architectural Glass Capsule Navbar */}
        <Navbar
          currentPath={currentPath}
          onNavigate={(path) => setCurrentPath(path)}
          onOpenDownload={() => setDownloadModalOpen(true)}
          onOpenMarketplace={() => setMarketplaceModalOpen(true)}
        />

        {/* Foreground Content Layer */}
        <div className="relative z-10">
          {renderContent()}

          {/* When on subpages, render FooterHorizon as well for consistent footer navigation */}
          {(currentPath === '/download' || currentPath === '/guides' || currentPath === '/compute' || currentPath === '/skills' || currentPath === '/status') && (
            <FooterHorizon
              onOpenDownload={() => setDownloadModalOpen(true)}
              onOpenMarketplace={() => setMarketplaceModalOpen(true)}
            />
          )}
        </div>

        {/* Download Binary Modal */}
        <DownloadModal
          isOpen={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
        />

        {/* .nxskill Ecosystem Marketplace Modal */}
        <SkillMarketplaceModal
          isOpen={marketplaceModalOpen}
          onClose={() => setMarketplaceModalOpen(false)}
        />
      </div>
    </WorldThemeContext.Provider>
  );
};

export default App;
