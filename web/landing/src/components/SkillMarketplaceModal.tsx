import React, { useState } from 'react';
import { X, Search, Download, Check, Copy, Sparkles, Terminal, Shield, Cpu, ExternalLink, Filter } from 'lucide-react';

export interface NxSkill {
  id: string;
  name: string;
  version: string;
  category: 'Actuation' | 'Intelligence' | 'Stealth' | 'Mesh' | 'Security';
  description: string;
  author: string;
  installs: number;
  hash: string;
  ramUsage: string;
  command: string;
}

const SKILL_CATALOG: NxSkill[] = [
  {
    id: 'win32-uia-actuator',
    name: 'Win32 UIA Native Actuator',
    version: '2.4.0',
    category: 'Actuation',
    description: 'Sub-70ms Windows Accessibility Tree click, drag, scroll, and WinRT OCR OCR without browser overhead.',
    author: 'NiranX / Nexus Core',
    installs: 14200,
    hash: 'sha256:7f8b9...c312',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install win32-uia-actuator',
  },
  {
    id: 'obscura-stealth-crawler',
    name: 'Obscura Dual-Engine Stealth Browser',
    version: '1.9.2',
    category: 'Stealth',
    description: 'Headless Rust CDP session runner with anti-bot fingerprint masking, profile cookies, and markdown DOM distillation.',
    author: 'Nexus Security Lab',
    installs: 9800,
    hash: 'sha256:91da4...e44f',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install obscura-stealth-crawler',
  },
  {
    id: 'kaggle-t4-mesh-bridge',
    name: 'Kaggle 2x T4 GPU Mesh Connector',
    version: '3.1.0',
    category: 'Mesh',
    description: 'Autonomous orchestrator connecting local tasks to free Kaggle dual-T4 GPUs and Haru-4B edge inference.',
    author: 'Nexus Federated Network',
    installs: 11450,
    hash: 'sha256:44fa8...98ab',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install kaggle-t4-mesh-bridge',
  },
  {
    id: 'tars-voice-duplex',
    name: 'TARS WASAPI Duplex Audio Core',
    version: '5.0.1',
    category: 'Intelligence',
    description: 'Real-time duplex voice stream with 4-tier anti-echo cancellation, <15ms barge-in, and candor/humor dials.',
    author: 'NiranX / Nexus Core',
    installs: 18900,
    hash: 'sha256:6e01a...f521',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install tars-voice-duplex',
  },
  {
    id: 'dpapi-gravitas-vault',
    name: 'DPAPI Hardware Vault & Invariants',
    version: '4.2.0',
    category: 'Security',
    description: 'Windows TPM-derived AES-256-GCM credential vault enforcing 6 GRAVITAS invariants and path containment.',
    author: 'Gravitas Enclave Team',
    installs: 16700,
    hash: 'sha256:32cc1...009a',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install dpapi-gravitas-vault',
  },
  {
    id: 'sqlite-wal-fts5-graph',
    name: 'SQLite WAL + sqlite-vec Hybrid Memory',
    version: '2.0.4',
    category: 'Intelligence',
    description: 'Local BM25 text indexer combined with sqlite-vec cosine similarity vectors for zero-leak offline memory.',
    author: 'Nexus Core Memory',
    installs: 13100,
    hash: 'sha256:11bd2...887f',
    ramUsage: '0 MB Idle',
    command: 'nexus skill install sqlite-wal-fts5-graph',
  },
];

interface SkillMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SkillMarketplaceModal: React.FC<SkillMarketplaceModalProps> = ({ isOpen, onClose }) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedSkillId, setCopiedSkillId] = useState<string | null>(null);

  if (!isOpen) return null;

  const categories = ['All', 'Actuation', 'Intelligence', 'Stealth', 'Mesh', 'Security'];

  const filteredSkills = SKILL_CATALOG.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || skill.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopyCommand = (skill: NxSkill) => {
    navigator.clipboard.writeText(skill.command);
    setCopiedSkillId(skill.id);
    setTimeout(() => setCopiedSkillId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl bg-[#060c18] border border-cyan-500/40 shadow-[0_0_90px_rgba(0,245,212,0.25)] p-6 sm:p-8 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow backdrop */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-space font-extrabold text-xl sm:text-2xl text-white">
                .nxskill Ecosystem Marketplace
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                SOVEREIGN REPRODUCIBLE
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-sans">
              Hot-swappable zero-stub skills for Win32 OS actuation, stealth browsing, and free-tier GPU mesh.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="py-4 flex flex-col sm:flex-row gap-3 items-center justify-between shrink-0">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search skills, triggers, or authors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/60 border border-slate-800 focus:border-cyan-500/50 font-mono text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Skills Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 my-2">
          {filteredSkills.map((skill) => {
            const isCopied = copiedSkillId === skill.id;
            return (
              <div
                key={skill.id}
                className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-cyan-500/40 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-space font-bold text-base text-white group-hover:text-cyan-300 transition-colors">
                      {skill.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">v{skill.version}</span>
                    <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                      {skill.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {skill.description}
                  </p>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 pt-1">
                    <span>By: <span className="text-slate-400">{skill.author}</span></span>
                    <span>•</span>
                    <span>Memory: <span className="text-emerald-400 font-semibold">{skill.ramUsage}</span></span>
                    <span>•</span>
                    <span className="text-cyan-400">{skill.installs.toLocaleString()} installs</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopyCommand(skill)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-xs flex items-center gap-2 transition-all cursor-pointer group/btn"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/btn:text-cyan-300" />
                        <span>CLI Install</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://github.com/NiranX"
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 transition-all"
                    title="View skill source"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}

          {filteredSkills.length === 0 && (
            <div className="p-12 text-center text-slate-500 font-mono text-xs">
              No .nxskill package found matching your query.
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sandboxed execution slices • YAML manifest validated</span>
          </div>
          <div className="text-slate-500 text-[11px]">
            Package format: <code className="text-cyan-400">bundle.nxskill</code>
          </div>
        </div>
      </div>
    </div>
  );
};
