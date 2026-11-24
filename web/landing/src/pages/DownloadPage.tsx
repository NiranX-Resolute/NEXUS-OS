import React, { useState, useEffect } from 'react';
import {
  Download,
  Terminal,
  Shield,
  Check,
  Copy,
  ExternalLink,
  Laptop,
  Code2,
  HardDrive,
  Apple,
  RefreshCw,
  FileCheck,
  Sparkles,
  Info,
} from 'lucide-react';

interface ReleaseAsset {
  name: string;
  size: number;
  download_count?: number;
  browser_download_url: string;
}

interface ReleaseManifestItem {
  filename: string;
  target: string;
  size_bytes: number;
  size_human: string;
  sha256: string;
  download_url: string;
}

export const DownloadPage: React.FC = () => {
  const [detectedOS, setDetectedOS] = useState<'windows' | 'linux' | 'mac'>('windows');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseTag, setReleaseTag] = useState('v5.0.0');

  // Canonical base URLs
  const GITHUB_REPO_URL = 'https://github.com/NiranX-Resolute/NEXUS-OS';
  const GITHUB_RELEASES_API = 'https://api.github.com/repos/NiranX-Resolute/NEXUS-OS/releases/latest';
  const CANONICAL_DOWNLOAD_BASE = 'https://github.com/NiranX-Resolute/NEXUS-OS/releases/latest/download';

  // Live checksums & sizes dictionary (updated from release-manifest.json or fallback)
  const [assetsInfo, setAssetsInfo] = useState<Record<string, { size: string; sha256: string; url: string }>>({
    'NEXUS-OS-v5.0-Setup.exe': {
      size: '181.9 MB',
      sha256: 'c164f46c95d87e78040c3e90439ab47b3db7cd5b92832f47110eab34d21df244',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-Setup.exe`,
    },
    'NEXUS-OS-v5.0-Windows-Portable.exe': {
      size: '181.3 MB',
      sha256: '284243ce92dd1c0301dc2d184359b95bb9f1dbe0f814d671d94f748ea45f2d69',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-Windows-Portable.exe`,
    },
    'NEXUS-OS-v5.0-Linux-x86_64.img': {
      size: '552.0 MB',
      sha256: '9bd6a54a7a91b3fb9488c6e58a88c3b556a57875b92666d6ffe4fc2290a20783',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-Linux-x86_64.img`,
    },
    'NEXUS-OS-v5.0-Linux-x86_64.iso': {
      size: '299.7 MB',
      sha256: 'c4545c1624e6a236eb08cce39943baae4759f64355369001800d5a8112be3516',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-Linux-x86_64.iso`,
    },
    'NEXUS-OS-v5.0-x86_64.AppImage': {
      size: '299.8 MB',
      sha256: 'db079a993b8c317e06799ca30c877d352fcaadd208a8d94f0d5420ab86b9f20b',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-x86_64.AppImage`,
    },
    'NEXUS-OS-v5.0-macOS-Universal.dmg': {
      size: '49.9 MB',
      sha256: 'fca763ca0dce577a2217638346f648bb108a4cb55f221616b1a615b2f75a8d18',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-macOS-Universal.dmg`,
    },
    'NEXUS-OS-v5.0-macOS.app.zip': {
      size: '49.8 MB',
      sha256: '19f6fe00ae50ff705687f45739143f8ade3582e6d814a4a03b0c0738f8f2f313',
      url: `${CANONICAL_DOWNLOAD_BASE}/NEXUS-OS-v5.0-macOS.app.zip`,
    },
  });

  // 1. Detect Visitor OS
  useEffect(() => {
    if (typeof window !== 'undefined' && window.navigator) {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes('win')) {
        setDetectedOS('windows');
      } else if (ua.includes('mac') || ua.includes('darwin')) {
        setDetectedOS('mac');
      } else if (ua.includes('linux') || ua.includes('x11')) {
        setDetectedOS('linux');
      }
    }
  }, []);

  // 2. Fetch Live GitHub Releases API or local release-manifest.json
  useEffect(() => {
    let isMounted = true;

    const loadReleaseData = async () => {
      setReleaseLoading(true);

      // Attempt 1: Local release manifest if available
      try {
        const manifestRes = await fetch('/releases/release-manifest.json');
        if (manifestRes.ok) {
          const manifestData: Record<string, ReleaseManifestItem> = await manifestRes.json();
          if (isMounted) {
            setAssetsInfo((prev) => {
              const updated = { ...prev };
              Object.entries(manifestData).forEach(([filename, info]) => {
                updated[filename] = {
                  size: info.size_human || `${Math.round(info.size_bytes / 1024 / 1024)} MB`,
                  sha256: info.sha256 || updated[filename]?.sha256 || '',
                  url: info.download_url || `${CANONICAL_DOWNLOAD_BASE}/${filename}`,
                };
              });
              return updated;
            });
          }
        }
      } catch {
        // Continue to GitHub API
      }

      // Attempt 2: Live GitHub Releases API
      try {
        const res = await fetch(GITHUB_RELEASES_API);
        if (res.ok) {
          const release = await res.json();
          if (isMounted && release) {
            setReleaseTag(release.tag_name || 'v5.0.0');
            if (Array.isArray(release.assets)) {
              setAssetsInfo((prev) => {
                const updated = { ...prev };
                release.assets.forEach((asset: ReleaseAsset) => {
                  if (updated[asset.name]) {
                    const mb = Math.round(asset.size / (1024 * 1024));
                    updated[asset.name].size = `${mb} MB`;
                    updated[asset.name].url = asset.browser_download_url;
                  }
                });
                return updated;
              });
            }
          }
        }
      } catch (err) {
        console.warn('GitHub Releases API fallback engaged:', err);
      } finally {
        if (isMounted) {
          setReleaseLoading(false);
        }
      }
    };

    loadReleaseData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <div className="min-h-screen pt-32 sm:pt-36 pb-24 px-4 sm:px-6 max-w-7xl mx-auto space-y-12">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 font-mono text-xs">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>OFFICIAL NEXUS OS v5.0 RELEASE HUB</span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400 font-semibold">{releaseTag}</span>
        </div>

        <h1 className="font-space font-extrabold text-4xl sm:text-6xl text-white tracking-tight leading-tight">
          Download <span className="text-cyan-400">NEXUS OS</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-300 font-sans leading-relaxed">
          100% Free-Tier, Zero-Subscription Sovereign AI Desktop Runtime. Choose your platform
          installer or run our 1-command terminal bootstrap below.
        </p>

        {/* Visitor OS Auto-Detection Banner */}
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/60 border border-emerald-500/30 font-mono text-xs text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Detected System:</span>
          <span className="text-emerald-400 font-bold uppercase tracking-wider">
            {detectedOS === 'windows' ? 'Windows x64' : detectedOS === 'mac' ? 'macOS (Universal)' : 'Linux x86_64'}
          </span>
          <span className="text-slate-500">· Recommended binary highlighted</span>
        </div>
      </div>

      {/* Terminal 1-Liner Quick Bootstrap Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {/* Windows PowerShell Command */}
        <div className="p-5 rounded-2xl bg-[#060c18] border border-cyan-500/30 shadow-lg space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Windows (PowerShell)
            </span>
            <button
              onClick={() => handleCopy('irm https://nexus-landing.pages.dev/install.ps1 | iex', 'ps-install')}
              className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              {copiedKey === 'ps-install' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <div className="p-3 rounded-xl bg-black/80 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto select-all">
            <code>irm https://nexus-landing.pages.dev/install.ps1 | iex</code>
          </div>
        </div>

        {/* Linux / macOS Shell Command */}
        <div className="p-5 rounded-2xl bg-[#060c18] border border-emerald-500/30 shadow-lg space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Linux & macOS (Bash / Zsh)
            </span>
            <button
              onClick={() => handleCopy('curl -fsSL https://nexus-landing.pages.dev/install.sh | bash', 'sh-install')}
              className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
            >
              {copiedKey === 'sh-install' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <div className="p-3 rounded-xl bg-black/80 border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto select-all">
            <code>curl -fsSL https://nexus-landing.pages.dev/install.sh | bash</code>
          </div>
        </div>
      </div>

      {/* 3 Main Platform Download Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ========================================== */}
        {/* 1. WINDOWS CARD */}
        {/* ========================================== */}
        <div
          className={`relative p-6 sm:p-7 rounded-3xl bg-[#060c18] border transition-all duration-300 flex flex-col justify-between ${
            detectedOS === 'windows'
              ? 'border-cyan-400 shadow-[0_0_40px_rgba(0,245,212,0.2)] ring-1 ring-cyan-400/50'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          {detectedOS === 'windows' && (
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-cyan-400 text-slate-950 font-space font-bold text-[10px] tracking-widest uppercase shadow-[0_0_15px_rgba(0,245,212,0.6)]">
              Recommended for your device
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-space font-bold text-lg text-white">Windows</h2>
                  <p className="text-xs text-slate-400 font-mono">Windows 10 / 11 (64-bit)</p>
                </div>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Win32 / UIA
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Native desktop experience with Dynamic Notch HUD, WinSta0 reflex actuation, local DPAPI
              encryption, and background hotkey daemon.
            </p>

            {/* Binary 1: NSIS Setup .exe */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Setup Installer</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-Setup.exe • {assetsInfo['NEXUS-OS-v5.0-Setup.exe']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-Setup.exe']?.url}
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-space font-bold text-xs flex items-center gap-1.5 transition shadow-[0_0_12px_rgba(0,245,212,0.3)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.exe</span>
                </a>
              </div>
              {/* SHA256 Checksum */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[200px]" title={assetsInfo['NEXUS-OS-v5.0-Setup.exe']?.sha256}>
                  SHA: {assetsInfo['NEXUS-OS-v5.0-Setup.exe']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-Setup.exe']?.sha256, 'win-setup-sha')}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'win-setup-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'win-setup-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Binary 2: Windows Portable .exe */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Portable Binary</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-Windows-Portable.exe • {assetsInfo['NEXUS-OS-v5.0-Windows-Portable.exe']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-Windows-Portable.exe']?.url}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-space font-semibold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.exe</span>
                </a>
              </div>
              {/* SHA256 Checksum */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[200px]" title={assetsInfo['NEXUS-OS-v5.0-Windows-Portable.exe']?.sha256}>
                  SHA: {assetsInfo['NEXUS-OS-v5.0-Windows-Portable.exe']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-Windows-Portable.exe']?.sha256, 'win-port-sha')}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'win-port-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'win-port-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 mt-6 text-[11px] font-mono text-slate-400">
            <span>Requires: Windows 10/11 64-bit • Python 3.11+ included</span>
          </div>
        </div>

        {/* ========================================== */}
        {/* 2. LINUX CARD */}
        {/* ========================================== */}
        <div
          className={`relative p-6 sm:p-7 rounded-3xl bg-[#060c18] border transition-all duration-300 flex flex-col justify-between ${
            detectedOS === 'linux'
              ? 'border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.2)] ring-1 ring-emerald-400/50'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          {detectedOS === 'linux' && (
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-400 text-slate-950 font-space font-bold text-[10px] tracking-widest uppercase shadow-[0_0_15px_rgba(16,185,129,0.6)]">
              Recommended for your device
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-space font-bold text-lg text-white">Linux</h2>
                  <p className="text-xs text-slate-400 font-mono">Ubuntu, Debian, Fedora, Arch (x86_64)</p>
                </div>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                ext4 / AppImage
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Raw disk image for bare-metal flash, bootable ISO-9660 image, and standalone AppImage with
              X11 and Wayland display server support.
            </p>

            {/* Binary 1: Raw Disk Image .img */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Raw Disk Image</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-Linux-x86_64.img • {assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.img']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.img']?.url}
                  className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-space font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.img</span>
                </a>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[180px]">
                  SHA: {assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.img']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.img']?.sha256, 'img-sha')}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'img-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'img-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Binary 2: Bootable ISO .iso */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">ISO-9660 Boot Image</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-Linux-x86_64.iso • {assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.iso']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.iso']?.url}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-space font-semibold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.iso</span>
                </a>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[180px]">
                  SHA: {assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.iso']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-Linux-x86_64.iso']?.sha256, 'iso-sha')}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'iso-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'iso-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Binary 3: AppImage */}
            <div className="p-3.5 rounded-2xl bg-black/50 border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Standalone AppImage</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-x86_64.AppImage • {assetsInfo['NEXUS-OS-v5.0-x86_64.AppImage']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-x86_64.AppImage']?.url}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-space font-semibold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.AppImage</span>
                </a>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[180px]">
                  SHA: {assetsInfo['NEXUS-OS-v5.0-x86_64.AppImage']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-x86_64.AppImage']?.sha256, 'appimg-sha')}
                  className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'appimg-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'appimg-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 mt-6 text-[11px] font-mono text-slate-400">
            <span>Requires: Linux Kernel 5.4+ (glibc 2.31+) • FUSE for AppImage</span>
          </div>
        </div>

        {/* ========================================== */}
        {/* 3. MACOS CARD */}
        {/* ========================================== */}
        <div
          className={`relative p-6 sm:p-7 rounded-3xl bg-[#060c18] border transition-all duration-300 flex flex-col justify-between ${
            detectedOS === 'mac'
              ? 'border-indigo-400 shadow-[0_0_40px_rgba(99,102,241,0.2)] ring-1 ring-indigo-400/50'
              : 'border-slate-800/80 hover:border-slate-700'
          }`}
        >
          {detectedOS === 'mac' && (
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-indigo-400 text-slate-950 font-space font-bold text-[10px] tracking-widest uppercase shadow-[0_0_15px_rgba(99,102,241,0.6)]">
              Recommended for your device
            </div>
          )}

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Apple className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-space font-bold text-lg text-white">macOS</h2>
                  <p className="text-xs text-slate-400 font-mono">Apple Silicon (M1/M2/M3/M4) & Intel</p>
                </div>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                Universal DMG
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Hardened-runtime universal binary configured for macOS Sonoma & Sequoia with Metal GPU
              acceleration and Keychain security enclave.
            </p>

            {/* Binary 1: Universal DMG */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Universal DMG Installer</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-macOS-Universal.dmg • {assetsInfo['NEXUS-OS-v5.0-macOS-Universal.dmg']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-macOS-Universal.dmg']?.url}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-space font-bold text-xs flex items-center gap-1.5 transition shadow-[0_0_12px_rgba(99,102,241,0.3)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.dmg</span>
                </a>
              </div>
              {/* SHA256 Checksum */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[200px]" title={assetsInfo['NEXUS-OS-v5.0-macOS-Universal.dmg']?.sha256}>
                  SHA: {assetsInfo['NEXUS-OS-v5.0-macOS-Universal.dmg']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-macOS-Universal.dmg']?.sha256, 'mac-dmg-sha')}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'mac-dmg-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'mac-dmg-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Binary 2: Standalone .app.zip */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-space font-bold text-xs text-white">Standalone Application Zip</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    NEXUS-OS-v5.0-macOS.app.zip • {assetsInfo['NEXUS-OS-v5.0-macOS.app.zip']?.size}
                  </div>
                </div>
                <a
                  href={assetsInfo['NEXUS-OS-v5.0-macOS.app.zip']?.url}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-space font-semibold text-xs flex items-center gap-1.5 transition border border-white/10 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>.zip</span>
                </a>
              </div>
              {/* SHA256 Checksum */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] font-mono text-slate-500">
                <span className="truncate max-w-[200px]" title={assetsInfo['NEXUS-OS-v5.0-macOS.app.zip']?.sha256}>
                  SHA: {assetsInfo['NEXUS-OS-v5.0-macOS.app.zip']?.sha256.slice(0, 16)}...
                </span>
                <button
                  onClick={() => handleCopy(assetsInfo['NEXUS-OS-v5.0-macOS.app.zip']?.sha256, 'mac-zip-sha')}
                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedKey === 'mac-zip-sha' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'mac-zip-sha' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 mt-6 text-[11px] font-mono text-slate-400">
            <span>Requires: macOS 12 Monterey or higher • Universal Binary</span>
          </div>
        </div>
      </div>

      {/* Verify Checksum & Cryptographic Security Guide */}
      <div className="p-6 sm:p-8 rounded-3xl bg-[#060c18] border border-cyan-500/20 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <FileCheck className="w-6 h-6 text-cyan-400" />
            <div>
              <h3 className="font-space font-bold text-lg text-white">Cryptographic Checksum Verification</h3>
              <p className="text-xs text-slate-400 font-sans">
                Verify the integrity and authenticity of downloaded binaries against our public SHA-256 digests.
              </p>
            </div>
          </div>
          <a
            href={`${GITHUB_REPO_URL}/releases/latest`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300 hover:text-white hover:border-cyan-400 transition"
          >
            <span>GitHub Releases</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-mono text-cyan-300 font-semibold">
              PowerShell (Windows) Verification Command:
            </span>
            <div className="p-3 rounded-xl bg-black/80 border border-slate-800 font-mono text-xs text-slate-300 flex items-center justify-between">
              <code>Get-FileHash .\NEXUS-OS-v5.0-Setup.exe -Algorithm SHA256</code>
              <button
                onClick={() =>
                  handleCopy('Get-FileHash .\\NEXUS-OS-v5.0-Setup.exe -Algorithm SHA256', 'hash-win')
                }
                className="text-cyan-400 hover:text-cyan-300 ml-2 cursor-pointer"
              >
                {copiedKey === 'hash-win' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-mono text-emerald-300 font-semibold">
              Linux & macOS Verification Command:
            </span>
            <div className="p-3 rounded-xl bg-black/80 border border-slate-800 font-mono text-xs text-slate-300 flex items-center justify-between">
              <code>sha256sum NEXUS-OS-v5.0-Linux-x86_64.img</code>
              <button
                onClick={() =>
                  handleCopy('sha256sum NEXUS-OS-v5.0-Linux-x86_64.img', 'hash-nix')
                }
                className="text-emerald-400 hover:text-emerald-300 ml-2 cursor-pointer"
              >
                {copiedKey === 'hash-nix' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 pt-2">
          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>
            Direct link to canonical SHA-256 sums file:{' '}
            <a
              href={`${CANONICAL_DOWNLOAD_BASE}/SHA256SUMS.txt`}
              className="text-cyan-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              SHA256SUMS.txt
            </a>
          </span>
        </div>
      </div>
    </div>
  );
};

export default DownloadPage;
