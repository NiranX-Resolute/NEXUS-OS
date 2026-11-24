import React, { useState } from 'react';
import { X, Download, Terminal, Shield, Check, Copy, ExternalLink, Laptop, Apple, Code2, HardDrive, ArrowRight } from 'lucide-react';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  if (!isOpen) return null;

  const RELEASE_TAG = 'v5.0.0';
  const GITHUB_RELEASE_BASE = `https://github.com/NiranX-Resolute/NEXUS-OS/releases/download/${RELEASE_TAG}`;
  const GITHUB_RELEASE_PAGE = `https://github.com/NiranX-Resolute/NEXUS-OS/releases/tag/${RELEASE_TAG}`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText('irm https://nexus-landing.pages.dev/install.ps1 | iex');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleCopyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const downloads = [
    {
      id: 'win-installer',
      title: 'Windows x64 Installer',
      desc: 'NSIS Setup with Win32 HUD, Dynamic Island Notch, DPAPI Vault & Obscura bundle',
      file: 'NEXUS-OS-v5.0-Setup.exe',
      size: '181.9 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-Setup.exe`,
      sha256: 'c164f46c95d87e78040c3e90439ab47b3db7cd5b92832f47110eab34d21df244',
      recommended: true,
      icon: Laptop,
    },
    {
      id: 'win-portable',
      title: 'Windows Portable Suite',
      desc: 'Standalone executable with zero installation footprint for USBs & VMs',
      file: 'NEXUS-OS-v5.0-Windows-Portable.exe',
      size: '181.3 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-Windows-Portable.exe`,
      sha256: '284243ce92dd1c0301dc2d184359b95bb9f1dbe0f814d671d94f748ea45f2d69',
      icon: Laptop,
    },
    {
      id: 'linux-appimage',
      title: 'Linux Standalone AppImage',
      desc: 'Ubuntu, Debian, Fedora, Arch desktop binary with X11 & Wayland support',
      file: 'NEXUS-OS-v5.0-x86_64.AppImage',
      size: '299.8 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-x86_64.AppImage`,
      sha256: 'db079a993b8c317e06799ca30c877d352fcaadd208a8d94f0d5420ab86b9f20b',
      icon: Code2,
    },
    {
      id: 'linux-img',
      title: 'Linux Raw Bootable Disk Image',
      desc: 'Ext4 filesystem image with MBR partition table for bare-metal & Hyper-V / QEMU',
      file: 'NEXUS-OS-v5.0-Linux-x86_64.img',
      size: '552.0 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-Linux-x86_64.img`,
      sha256: '9bd6a54a7a91b3fb9488c6e58a88c3b556a57875b92666d6ffe4fc2290a20783',
      icon: HardDrive,
    },
    {
      id: 'macos-dmg',
      title: 'macOS Universal Disk Image',
      desc: 'Apple Silicon (M1/M2/M3/M4) & Intel Universal DMG disk image',
      file: 'NEXUS-OS-v5.0-macOS-Universal.dmg',
      size: '49.9 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-macOS-Universal.dmg`,
      sha256: 'fca763ca0dce577a2217638346f648bb108a4cb55f221616b1a615b2f75a8d18',
      icon: Apple,
    },
    {
      id: 'macos-zip',
      title: 'macOS Application Bundle Archive',
      desc: 'NEXUS OS.app zipped directory preserving executable permissions',
      file: 'NEXUS-OS-v5.0-macOS.app.zip',
      size: '49.8 MB',
      href: `${GITHUB_RELEASE_BASE}/NEXUS-OS-v5.0-macOS.app.zip`,
      sha256: '19f6fe00ae50ff705687f45739143f8ade3582e6d814a4a03b0c0738f8f2f313',
      icon: Apple,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl rounded-3xl bg-[#060c18] border border-cyan-500/40 shadow-[0_0_80px_rgba(0,245,212,0.25)] p-6 sm:p-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background ambient lighting */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-800">
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
              Direct high-speed downloads hosted on official GitHub Releases.
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
        <div className="my-5 p-4 rounded-2xl bg-black/70 border border-cyan-500/25">
          <div className="flex items-center justify-between font-mono text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              PowerShell Instant 1-Liner (Windows)
            </span>
            <button
              onClick={handleCopyCmd}
              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
            >
              {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
            </button>
          </div>
          <div className="p-2.5 rounded-xl bg-[#030711] font-mono text-xs text-slate-200 overflow-x-auto select-all border border-slate-800">
            irm https://nexus-landing.pages.dev/install.ps1 | iex
          </div>
        </div>

        {/* Direct Download Binary Cards */}
        <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
          {downloads.map((item) => {
            const Icon = item.icon;
            const isCopied = copiedHash === item.id;
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200 ${
                  item.recommended
                    ? 'bg-cyan-950/25 border border-cyan-500/50 hover:border-cyan-400 hover:bg-cyan-950/35 shadow-[0_0_20px_rgba(0,245,212,0.12)]'
                    : 'bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${item.recommended ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-300'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-space font-bold text-sm text-white">
                        {item.title}
                      </span>
                      {item.recommended && (
                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-cyan-400 text-slate-950 font-bold uppercase">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-sans line-clamp-1">{item.desc}</p>
                    
                    <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-slate-400">
                      <span className="text-slate-300 font-semibold">{item.size}</span>
                      <span>•</span>
                      <button
                        onClick={() => handleCopyHash(item.sha256, item.id)}
                        className="hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Copy SHA-256 Checksum"
                      >
                        {isCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                        <span>{isCopied ? 'Hash Copied!' : `SHA256: ${item.sha256.slice(0, 10)}...`}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <a
                    href={item.href}
                    download={item.file}
                    className={`px-3.5 py-2 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                      item.recommended
                        ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-cyan-400/20'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cryptographic SHA-256 verified • Zero telemetry leaks</span>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="/download"
              onClick={(e) => {
                e.preventDefault();
                onClose();
                window.history.pushState({}, '', '/download');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              <span>Full Download Hub</span>
              <ArrowRight className="w-3 h-3" />
            </a>

            <a
              href={GITHUB_RELEASE_PAGE}
              target="_blank"
              rel="noreferrer"
              className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <span>GitHub Release</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
