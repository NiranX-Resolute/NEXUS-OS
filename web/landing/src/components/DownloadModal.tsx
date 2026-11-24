import React from 'react';
import { X, Download, Terminal, Shield, Check, Copy, ExternalLink, Laptop, Smartphone, Code2 } from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText('irm https://nexus-os.pages.dev/install.ps1 | iex');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloads = [
    {
      title: 'Windows x64 Installer',
      desc: 'Native Win32 HUD, Dynamic Notch, DPAPI Vault, & UIA hooks',
      file: 'nexus-setup.exe',
      size: '181 MB',
      href: '/binaries/nexus-setup.exe',
      recommended: true,
      icon: Laptop,
    },
    {
      title: 'Windows Portable Suite',
      desc: 'Zero-install standalone binary for thumbdrives & VMs',
      file: 'nexus-suite-launcher.exe',
      size: '10.2 MB',
      href: '/binaries/nexus-suite-launcher.exe',
      icon: Laptop,
    },
    {
      title: 'Linux Standalone AppImage',
      desc: 'Ubuntu / Debian / Fedora desktop package with X11/Wayland support',
      file: 'nexus-desktop.AppImage',
      size: '501 KB',
      href: '/binaries/nexus-desktop.AppImage',
      icon: Code2,
    },
    {
      title: 'Android Companion APK',
      desc: 'Mobile notch control, voice push-to-talk, & telemetry radar',
      file: 'nexus-mobile.apk',
      size: '1.0 MB',
      href: '/binaries/nexus-mobile.apk',
      icon: Smartphone,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl rounded-3xl bg-[#060c18] border border-cyan-500/40 shadow-[0_0_80px_rgba(0,245,212,0.25)] p-6 sm:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-space font-extrabold text-xl sm:text-2xl text-white">
                Download NEXUS OS <span className="text-cyan-400 font-mono">v5.0</span>
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                100% FREE-TIER
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-sans">
              Choose your platform binary or install directly via PowerShell.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1-Line Quick Terminal Install */}
        <div className="my-6 p-4 rounded-2xl bg-black/70 border border-cyan-500/25">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 text-cyan-300">
              <Terminal className="w-3.5 h-3.5" />
              PowerShell Instant One-Liner (Windows)
            </span>
            <button
              onClick={handleCopyCmd}
              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
          <div className="p-2.5 rounded-xl bg-[#030711] font-mono text-xs text-slate-200 overflow-x-auto select-all border border-slate-800">
            irm https://nexus-os.pages.dev/install.ps1 | iex
          </div>
        </div>

        {/* Direct Download Binary Cards */}
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {downloads.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.file}
                href={item.href}
                download
                className={`p-4 rounded-2xl flex items-center justify-between transition-all duration-200 group ${
                  item.recommended
                    ? 'bg-cyan-950/20 border border-cyan-500/40 hover:border-cyan-400 hover:bg-cyan-950/30 shadow-[0_0_20px_rgba(0,245,212,0.1)]'
                    : 'bg-slate-900/40 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`p-2.5 rounded-xl ${item.recommended ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-300'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-space font-bold text-sm text-white group-hover:text-cyan-300 transition-colors">
                        {item.title}
                      </span>
                      {item.recommended && (
                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-cyan-400 text-slate-950 font-bold uppercase">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-sans">{item.desc}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs text-slate-400 shrink-0">
                  <span className="hidden sm:inline">{item.size}</span>
                  <div className="p-2 rounded-xl bg-slate-800 group-hover:bg-cyan-400 group-hover:text-slate-950 text-slate-300 transition-all">
                    <Download className="w-4 h-4" />
                  </div>
                </div>
              </a>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sha256 verified • Zero telemetry leaks</span>
          </div>
          <a
            href="https://github.com/NiranX-Resolute/NEXUS-OS"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:underline flex items-center gap-1"
          >
            <span>Source Code (GitHub)</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
