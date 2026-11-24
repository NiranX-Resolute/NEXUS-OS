import React, { useState, useEffect } from 'react';
import { Download, ChevronRight, Menu, X, Grid, ExternalLink } from 'lucide-react';

interface NavbarProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onOpenDownload?: () => void;
  onOpenMarketplace?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath = typeof window !== 'undefined' ? window.location.pathname : '/',
  onNavigate,
  onOpenDownload,
  onOpenMarketplace,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Overview', shortName: 'Overview', href: '/' },
    { name: '45+ BYOK & Benchmarks', shortName: 'Benchmarks', href: '/guides' },
    { name: 'Compute & Abliterated', shortName: 'Compute', href: '/compute' },
    { name: 'Skills & Packs', shortName: 'Skills', href: '/skills' },
    { name: 'System Status', shortName: 'Status', href: '/status' },
  ];

  const mobileNavLinks = [
    { name: 'Overview', href: '/' },
    { name: 'Download v5.0', href: '/download' },
    { name: '45+ BYOK & Benchmarks', href: '/guides' },
    { name: 'Compute & Abliterated', href: '/compute' },
    { name: 'Skills & Packs', href: '/skills' },
    { name: 'System Status', href: '/status' },
  ];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/')) {
      e.preventDefault();
      if (window.location.pathname !== href) {
        window.history.pushState({}, '', href);
        window.dispatchEvent(new PopStateEvent('popstate'));
        if (onNavigate) {
          onNavigate(href);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isCurrentActive = (href: string) => {
    if (href === '/') {
      return currentPath === '/' || currentPath === '';
    }
    return currentPath === href || currentPath.startsWith(href);
  };

  return (
    <>
      <nav
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 w-[94%] max-w-7xl h-16 rounded-2xl px-4 py-2.5 flex items-center justify-between ${
          scrolled
            ? 'spatial-glass border-cyan-500/20 shadow-[0_10px_35px_-10px_rgba(0,245,212,0.15)] backdrop-blur-2xl'
            : 'bg-[#080f1c]/80 border border-sky-500/20 backdrop-blur-xl shadow-lg'
        }`}
      >
        {/* Brand Emblem */}
        <a
          href="/"
          onClick={(e) => handleNavClick(e, '/')}
          className="flex items-center gap-3 group"
        >
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-600/30 border border-cyan-400/30 flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:border-cyan-400 group-hover:shadow-[0_0_15px_rgba(0,245,212,0.4)]">
            <div className="absolute inset-0 bg-cyan-400/10 animate-pulse" />
            <div className="w-4 h-4 rounded-full border-2 border-cyan-300 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-space font-bold tracking-wider text-base text-white group-hover:text-cyan-300 transition-colors">
                NEXUS<span className="text-cyan-400 font-mono">_OS</span>
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 tracking-tighter">
                v5.0
              </span>
            </div>
            <span className="font-mono text-[9px] text-slate-400 tracking-widest uppercase">
              Sovereign Runtime
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <div className="hidden lg:flex items-center gap-1 xl:gap-2 px-3 py-1 rounded-xl bg-slate-900/40 border border-slate-800/80">
          {navLinks.map((link) => {
            const active = isCurrentActive(link.href);
            return (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className={`px-2.5 xl:px-3 py-1.5 rounded-lg font-space text-xs tracking-wide transition-all ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(0,245,212,0.2)] font-medium'
                    : 'text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10'
                }`}
              >
                <span className="hidden xl:inline">{link.name}</span>
                <span className="xl:hidden">{link.shortName}</span>
              </a>
            );
          })}
          <button
            onClick={onOpenMarketplace}
            className="px-2.5 xl:px-3 py-1.5 rounded-lg font-space text-xs tracking-wide text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/15 transition-all flex items-center gap-1.5 cursor-pointer ml-0.5"
          >
            <Grid className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Marketplace</span>
          </button>
        </div>

        {/* Telemetry Status Pill & Action */}
        <div className="hidden sm:flex items-center gap-2 xl:gap-2.5">
          {/* GitHub Repository Link */}
          <a
            href="https://github.com/NiranX-Resolute/NEXUS-OS"
            target="_blank"
            rel="noopener noreferrer"
            title="NEXUS-OS on GitHub"
            className="flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-xl bg-slate-900/60 border border-slate-700/60 hover:border-cyan-400/40 text-slate-300 hover:text-white font-space text-xs tracking-wide transition cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="hidden xl:inline">GitHub</span>
          </a>

          <a
            href="/status"
            onClick={(e) => handleNavClick(e, '/status')}
            title="View Live System Diagnostics"
            className="hidden 2xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/30 border border-emerald-500/25 hover:border-emerald-500/50 text-emerald-400 font-mono text-[11px] tracking-tight transition cursor-pointer"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-slate-300 font-sans font-medium">0 MB IDLE RAM</span>
          </a>

          <a
            href="/download"
            onClick={(e) => {
              handleNavClick(e, '/download');
              if (onOpenDownload) onOpenDownload();
            }}
            className="group relative px-3.5 xl:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-space font-semibold text-xs tracking-wider uppercase transition-all duration-300 shadow-[0_0_20px_rgba(0,245,212,0.35)] hover:shadow-[0_0_28px_rgba(0,245,212,0.6)] flex items-center gap-2 active:scale-95 cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" />
            <span>Download v5.0</span>
          </a>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg bg-slate-900/60 border border-slate-700/60 text-slate-300 hover:text-white cursor-pointer"
          aria-label="Toggle mobile menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5 text-cyan-400" /> : <Menu className="w-5 h-5" />}
        </button>
      </nav>

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-[#030711]/95 backdrop-blur-2xl flex flex-col pt-24 px-6 lg:hidden animate-in fade-in duration-200">
          <div className="flex flex-col gap-3 py-6">
            {mobileNavLinks.map((link) => {
              const active = isCurrentActive(link.href);
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => {
                    handleNavClick(e, link.href);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-4 py-3 rounded-xl border text-base font-space transition-colors flex items-center justify-between ${
                    active
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'bg-slate-900/50 border-slate-800 text-slate-200 hover:text-cyan-300 hover:border-cyan-500/30'
                  }`}
                >
                  <span>{link.name}</span>
                  <ChevronRight className="w-4 h-4 text-cyan-400" />
                </a>
              );
            })}
            <a
              href="https://github.com/NiranX-Resolute/NEXUS-OS"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-800 text-base font-space text-slate-200 hover:text-cyan-300 transition-colors flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub Repository</span>
              </span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                if (onOpenMarketplace) onOpenMarketplace();
              }}
              className="px-4 py-3 rounded-xl bg-slate-900/50 border border-cyan-500/30 text-base font-space text-cyan-300 hover:text-cyan-200 transition-colors flex items-center justify-between text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-cyan-400" />
                <span>Marketplace Modal</span>
              </span>
              <ChevronRight className="w-4 h-4 text-cyan-400" />
            </button>
          </div>

          <div className="mt-auto pb-10 flex flex-col gap-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 font-mono text-xs">
              <span className="text-slate-400">Memory Footprint</span>
              <span className="text-emerald-400 font-semibold">0 MB Idle RAM (Stackless)</span>
            </div>
            <a
              href="/download"
              onClick={(e) => {
                handleNavClick(e, '/download');
                setMobileMenuOpen(false);
                if (onOpenDownload) onOpenDownload();
              }}
              className="w-full py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-space font-bold text-sm tracking-wide uppercase transition-all shadow-[0_0_25px_rgba(0,245,212,0.4)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download NEXUS OS v5.0
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
