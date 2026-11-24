import React, { useState } from 'react';
import {
  Search,
  Filter,
  Shield,
  Download,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Terminal,
  Cpu,
  Layers,
  Zap,
  Code2,
  Lock,
  ArrowLeft,
  Share2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Package,
  X,
} from 'lucide-react';

interface NxSkillItem {
  slug: string;
  name: string;
  category: 'Development' | 'Security & Audit' | 'Voice & Multimodal' | 'Mesh & Compute' | 'Data & Memory' | 'Stealth & Actuation';
  orbiter_group: string;
  description: string;
  author: string;
  version: string;
  installs: number;
  sha256: string;
  agent_shield_score: number;
  permissions: string[];
  ram_footprint: string;
  tags: string[];
}

interface StarterPackItem {
  slug: string;
  name: string;
  badge: string;
  orbiter_group: string;
  description: string;
  skill_slugs: string[];
  skills_count: number;
}

const STARTER_PACKS: StarterPackItem[] = [
  {
    slug: 'core-developer-pack',
    name: 'DEV-01 Full-Stack Autonomous Pack',
    badge: 'Popular',
    orbiter_group: 'DEV-01',
    description: 'Complete autonomous engineering pipeline: codebase exploration, git operations, paper digestion, and multi-channel reach.',
    skill_slugs: ['scout-01', 'git-autopilot', 'arxiv-scholar', 'agent-reach'],
    skills_count: 4,
  },
  {
    slug: 'redcell-security-pack',
    name: 'SEC-01 Red Team & Compliance Pack',
    badge: 'Zero-Trust',
    orbiter_group: 'SEC-01',
    description: 'Autonomous vulnerability scanning, Windows DPAPI hardware vault invariants, and OWASP perimeter defense.',
    skill_slugs: ['redcell-audit', 'dpapi-gravitas-vault', 'obscura-stealth-crawler'],
    skills_count: 3,
  },
  {
    slug: 'voice-duplex-pack',
    name: 'VOICE-01 Omni Duplex Speech & Wit Pack',
    badge: 'Real-Time',
    orbiter_group: 'VOICE-01',
    description: 'Sub-15ms WASAPI duplex speech stream, barge-in interruption detection, and witty conversational persona commentary.',
    skill_slugs: ['whisper-duplex', 'tars-commentary'],
    skills_count: 2,
  },
  {
    slug: 'cloud-mesh-pack',
    name: 'MESH-01 Kaggle & Hugging Face Sovereign Mesh',
    badge: 'Free Tier',
    orbiter_group: 'MESH-01',
    description: 'Bridges local agent to Kaggle dual-T4 GPUs, Hugging Face ZeroGPU Spaces, and local sqlite-vec memory with tunnel auto-sync.',
    skill_slugs: ['kaggle-t4-mesh-bridge', 'sqlite-wal-fts5-graph'],
    skills_count: 2,
  },
];

const SKILLS_DATABASE: NxSkillItem[] = [
  {
    slug: 'scout-01',
    name: 'Scout-01 Codebase & Architecture Deep Explorer',
    category: 'Development',
    orbiter_group: 'DEV-01',
    description: 'Traverses large monorepos, constructs AST symbol dependency trees, identifies dead code, and generates architectural blueprints in sub-100ms.',
    author: 'NiranX / Nexus Core',
    version: '2.5.0',
    installs: 21400,
    sha256: 'sha256:a4f82...91bc',
    agent_shield_score: 100,
    permissions: ['filesystem:read', 'ast:inspect'],
    ram_footprint: '0 MB Idle',
    tags: ['AST', 'Symbol Graph', 'Fast Navigation'],
  },
  {
    slug: 'redcell-audit',
    name: 'RedCell Security & Penetration Auditor',
    category: 'Security & Audit',
    orbiter_group: 'SEC-01',
    description: 'Runs passive vulnerability audits, secret exposure detection, and OWASP Top 10 scans against local microservices with zero false positives.',
    author: 'Nexus Security Lab',
    version: '3.1.2',
    installs: 18250,
    sha256: 'sha256:6e11b...4a39',
    agent_shield_score: 100,
    permissions: ['net:inspect', 'filesystem:read', 'dpapi:isolated'],
    ram_footprint: '0 MB Idle',
    tags: ['OWASP', 'Secret Leak Audit', 'SAST'],
  },
  {
    slug: 'whisper-duplex',
    name: 'Whisper Duplex Audio & WASAPI Interrupter',
    category: 'Voice & Multimodal',
    orbiter_group: 'VOICE-01',
    description: 'Full-duplex low-latency audio capture and synthesis with sub-15ms barge-in interruption, echo cancellation, and acoustic noise gating.',
    author: 'NiranX / Nexus Core',
    version: '4.0.1',
    installs: 24300,
    sha256: 'sha256:bf230...881f',
    agent_shield_score: 100,
    permissions: ['audio:stream', 'audio:playback'],
    ram_footprint: '0 MB Idle',
    tags: ['Barge-In', 'Duplex', 'WASAPI', 'Speech'],
  },
  {
    slug: 'tars-commentary',
    name: 'TARS Real-Time Wit & Candor Commentary',
    category: 'Voice & Multimodal',
    orbiter_group: 'VOICE-01',
    description: 'Dynamic conversational personality dial. Injects witty observations, terminal sarcasm, or military-grade succinct operational telemetry.',
    author: 'NiranX / Nexus Core',
    version: '5.0.0',
    installs: 19800,
    sha256: 'sha256:3d91c...77a4',
    agent_shield_score: 100,
    permissions: ['prompt:augment'],
    ram_footprint: '0 MB Idle',
    tags: ['Personality', 'Candor', 'Humor Dial'],
  },
  {
    slug: 'git-autopilot',
    name: 'Git Autopilot Branch & Commit Orchestrator',
    category: 'Development',
    orbiter_group: 'DEV-01',
    description: 'Automates semantic Conventional Commits, interactive branch rebasing, merge conflict resolution hints, and pull request summarization.',
    author: 'Nexus Core',
    version: '2.1.0',
    installs: 16700,
    sha256: 'sha256:7c09d...ee12',
    agent_shield_score: 100,
    permissions: ['git:execute', 'filesystem:read', 'filesystem:write'],
    ram_footprint: '0 MB Idle',
    tags: ['Git', 'PR Workflow', 'Automated Diffs'],
  },
  {
    slug: 'arxiv-scholar',
    name: 'ArXiv Scholar Paper Digest & BibTeX Synthesizer',
    category: 'Development',
    orbiter_group: 'RESEARCH-01',
    description: 'Fetches, parses, and distills latest AI/ML arXiv papers, converts LaTeX formulas into KaTeX markdown, and curates validated citations.',
    author: 'Nexus Research Lab',
    version: '1.8.4',
    installs: 14200,
    sha256: 'sha256:5a62f...09e1',
    agent_shield_score: 100,
    permissions: ['net:outbound:arxiv', 'filesystem:read'],
    ram_footprint: '0 MB Idle',
    tags: ['arXiv', 'LaTeX', 'Research Digest'],
  },
  {
    slug: 'agent-reach',
    name: 'AgentReach Multi-Channel Outreach Automation',
    category: 'Development',
    orbiter_group: 'OPS-01',
    description: 'Monitors inbound inquiries, drafts personalized contextual follow-ups, and integrates securely with Discord, Telegram, and GitHub webhooks.',
    author: 'Nexus Community',
    version: '2.0.2',
    installs: 12100,
    sha256: 'sha256:8812c...3d22',
    agent_shield_score: 100,
    permissions: ['net:outbound:webhooks', 'dpapi:read_tokens'],
    ram_footprint: '0 MB Idle',
    tags: ['Webhooks', 'Discord', 'Notifications'],
  },
  {
    slug: 'win32-uia-actuator',
    name: 'Win32 UIA Native OS Actuator',
    category: 'Stealth & Actuation',
    orbiter_group: 'ACTUATE-01',
    description: 'Sub-70ms Windows Accessibility Tree click, drag, scroll, and WinRT OCR without browser overhead or brittle mouse simulations.',
    author: 'NiranX / Nexus Core',
    version: '2.4.0',
    installs: 27900,
    sha256: 'sha256:7f8b9...c312',
    agent_shield_score: 100,
    permissions: ['win32:ui_automation', 'winrt:ocr'],
    ram_footprint: '0 MB Idle',
    tags: ['Win32', 'UIA', 'OCR', 'Native GUI'],
  },
  {
    slug: 'obscura-stealth-crawler',
    name: 'Obscura Dual-Engine Stealth Browser',
    category: 'Stealth & Actuation',
    orbiter_group: 'STEALTH-01',
    description: 'Headless Rust CDP session runner with anti-bot fingerprint masking, profile cookies, and markdown DOM distillation.',
    author: 'Nexus Security Lab',
    version: '1.9.2',
    installs: 15400,
    sha256: 'sha256:91da4...e44f',
    agent_shield_score: 100,
    permissions: ['net:outbound', 'sandbox:cdp'],
    ram_footprint: '0 MB Idle',
    tags: ['Headless CDP', 'Anti-Bot Masking', 'DOM'],
  },
  {
    slug: 'kaggle-t4-mesh-bridge',
    name: 'Kaggle Dual-T4 GPU Mesh Connector',
    category: 'Mesh & Compute',
    orbiter_group: 'MESH-01',
    description: 'Autonomous orchestrator connecting local agent tasks to free Kaggle dual-T4 GPUs, QuotaGuard auto-idle, and Cloudflare quick tunnels.',
    author: 'Nexus Federated Network',
    version: '3.1.0',
    installs: 22100,
    sha256: 'sha256:44fa8...98ab',
    agent_shield_score: 100,
    permissions: ['net:tunnel', 'dpapi:kaggle_token'],
    ram_footprint: '0 MB Idle',
    tags: ['Kaggle GPU', 'T4 x2', 'Cloudflare Tunnel'],
  },
  {
    slug: 'dpapi-gravitas-vault',
    name: 'DPAPI Hardware Vault & GRAVITAS Invariants',
    category: 'Security & Audit',
    orbiter_group: 'SEC-01',
    description: 'Windows TPM-derived AES-256-GCM credential vault enforcing 6 GRAVITAS invariants, strict HITL elevation, and zero plaintext leaks.',
    author: 'Gravitas Enclave Team',
    version: '4.2.0',
    installs: 31200,
    sha256: 'sha256:32cc1...009a',
    agent_shield_score: 100,
    permissions: ['dpapi:vault', 'governor:enforce'],
    ram_footprint: '0 MB Idle',
    tags: ['TPM', 'DPAPI', 'Security Invariants'],
  },
  {
    slug: 'sqlite-wal-fts5-graph',
    name: 'SQLite WAL + sqlite-vec Hybrid Memory',
    category: 'Data & Memory',
    orbiter_group: 'MEM-01',
    description: 'Local BM25 text indexer combined with sqlite-vec cosine similarity vectors for zero-leak offline memory and sub-5ms retrieval.',
    author: 'Nexus Core Memory',
    version: '2.0.4',
    installs: 19500,
    sha256: 'sha256:11bd2...887f',
    agent_shield_score: 100,
    permissions: ['sqlite:local_wal', 'fts5:query'],
    ram_footprint: '0 MB Idle',
    tags: ['FTS5', 'sqlite-vec', 'WAL Mode', 'Hybrid'],
  },
];

export const SkillsCatalogPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [inspectModalSkill, setInspectModalSkill] = useState<NxSkillItem | null>(null);

  const categories = [
    'All',
    'Development',
    'Security & Audit',
    'Voice & Multimodal',
    'Mesh & Compute',
    'Data & Memory',
    'Stealth & Actuation',
  ];

  const filteredSkills = SKILLS_DATABASE.filter((skill) => {
    const matchesCategory = selectedCategory === 'All' || skill.category === selectedCategory;
    const matchesSearch =
      skill.name.toLowerCase().includes(search.toLowerCase()) ||
      skill.slug.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100 pt-32 sm:pt-36 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Top Header & Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800/80 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Overview
              </a>
              <span className="text-slate-600 font-mono">/</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 font-mono text-xs">
                <Sparkles className="w-3 h-3" />
                Portable .nxskill Ecosystem
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-mono text-xs">
                <Shield className="w-3 h-3" />
                AgentShield 100/100 Audited
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-space font-bold tracking-tight text-white">
              Ecosystem Skills & Autonomous Agent Packs
            </h1>
            <p className="mt-2 text-base text-slate-400 max-w-3xl leading-relaxed">
              Plug modular capabilities directly into your sovereign desktop runtime. Every skill is signed with SHA-256 integrity, enforces zero idle RAM, and is pre-audited through AgentShield.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="nexus://open-marketplace"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-space font-semibold text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(0,245,212,0.35)] flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              Open In Nexus App
            </a>
          </div>
        </div>

        {/* Section 1: Starter Packs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-space font-bold text-white tracking-wide">
                Curated Starter Packs (1-Click Multi-Agent Bundles)
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Bundled for Zero-Config Setup
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {STARTER_PACKS.map((pack) => (
              <div
                key={pack.slug}
                className="group relative p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900/60 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono text-[10px] uppercase font-semibold">
                      {pack.orbiter_group}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-semibold">
                      {pack.badge}
                    </span>
                  </div>
                  <h3 className="font-space font-bold text-base text-white group-hover:text-cyan-300 transition-colors">
                    {pack.name}
                  </h3>
                  <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                    {pack.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {pack.skill_slugs.map((slug) => (
                      <span
                        key={slug}
                        className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 font-mono text-[10px] border border-slate-700/60"
                      >
                        {slug}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-800/70 flex items-center gap-2">
                  <a
                    href={`nexus://install-pack?pack=${pack.slug}`}
                    className="flex-1 py-2 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 font-space text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    1-Click Install Pack
                  </a>
                  <button
                    onClick={() => handleCopy(`pack-${pack.slug}`, `nexus pack install ${pack.slug}`)}
                    title="Copy CLI command"
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition-colors"
                  >
                    {copiedId === `pack-${pack.slug}` ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: AgentShield Safety Guarantee Card */}
        <section className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/20 via-slate-900/50 to-cyan-950/20 border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-space font-bold text-lg text-white">
                  AgentShield™ 100/100 Verified Audit Guarantee
                </h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
                  PASS
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed max-w-3xl">
                Every published `.nxskill` package is statically scanned via AST parser for unauthorized socket binding, process spawning, and token leaks. Credential storage is restricted strictly to Windows DPAPI hardware-backed encryption, and destructive mutations are gated behind mandatory human-in-the-loop elevation.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right font-mono">
              <div className="text-2xl font-bold text-emerald-400">100 / 100</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Safety Rating</div>
            </div>
          </div>
        </section>

        {/* Section 3: Filter & Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills by name, tag, or slug..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-sm font-space text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-space font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(0,245,212,0.15)]'
                    : 'bg-slate-900/40 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Section 4: Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSkills.map((skill) => (
            <div
              key={skill.slug}
              className="p-5 rounded-2xl bg-[#080f1c]/60 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono text-[10px] font-semibold">
                      {skill.orbiter_group}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">
                      v{skill.version}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-[10px] font-semibold">
                    <Shield className="w-3 h-3" />
                    <span>{skill.agent_shield_score}/100</span>
                  </div>
                </div>

                <h3 className="font-space font-bold text-base text-white group-hover:text-cyan-300 transition-colors">
                  {skill.name}
                </h3>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed line-clamp-3">
                  {skill.description}
                </p>

                {/* Permissions & Footprint */}
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {skill.permissions.map((perm) => (
                      <span
                        key={perm}
                        className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono text-[9px]"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                    <span>RAM: <strong className="text-emerald-400">{skill.ram_footprint}</strong></span>
                    <span>Installs: <strong className="text-slate-300">{skill.installs.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center gap-2">
                <a
                  href={`nexus://install-skill?slug=${skill.slug}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 hover:from-cyan-500/30 hover:to-emerald-500/30 border border-cyan-500/30 text-cyan-300 font-space text-xs font-semibold tracking-wide transition-all flex items-center justify-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  1-Click Install
                </a>

                <button
                  onClick={() => handleCopy(skill.slug, `nexus skill install ${skill.slug}`)}
                  title="Copy CLI command"
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
                >
                  {copiedId === skill.slug ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  onClick={() => setInspectModalSkill(skill)}
                  title="Inspect Manifest & Audit"
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-slate-300 hover:text-white transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Section 5: CLI Ecosystem Box */}
        <div className="p-6 rounded-2xl bg-slate-900/30 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="font-space font-bold text-base text-white">
              Headless & CLI Skill Management
            </h3>
            <p className="text-xs text-slate-400">
              Nexus skills can be published, installed, and verified headlessly via terminal commands or Python API.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 font-mono text-xs text-cyan-400">
            <code>nexus skill install scout-01</code>
            <button
              onClick={() => handleCopy('cli-box', 'nexus skill install scout-01')}
              className="ml-2 text-slate-500 hover:text-white"
            >
              {copiedId === 'cli-box' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Inspect Manifest Modal */}
      {inspectModalSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#080f1c] border border-cyan-500/30 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                <h3 className="font-space font-bold text-lg text-white">
                  Skill Manifest: {inspectModalSkill.slug}.nxskill
                </h3>
              </div>
              <button
                onClick={() => setInspectModalSkill(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 stroke-[1.5]" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Package Hash:</span>
                  <span className="text-cyan-300">{inspectModalSkill.sha256}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">AgentShield Audit Score:</span>
                  <span className="text-emerald-400 font-bold">{inspectModalSkill.agent_shield_score}/100 (Zero Risk)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Idle RAM Footprint:</span>
                  <span className="text-emerald-400 font-bold">0 MB (Stackless Process Gating)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Elevated Permissions:</span>
                  <span className="text-slate-200">{inspectModalSkill.permissions.join(', ')}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Manifest Header JSON:</span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-cyan-400 overflow-x-auto">
{JSON.stringify(
  {
    schema_version: '1.0',
    slug: inspectModalSkill.slug,
    name: inspectModalSkill.name,
    category: inspectModalSkill.category,
    orbiter_group: inspectModalSkill.orbiter_group,
    author: inspectModalSkill.author,
    version: inspectModalSkill.version,
    permissions: inspectModalSkill.permissions,
    agent_shield: {
      score: inspectModalSkill.agent_shield_score,
      status: 'VERIFIED_SAFE',
      ast_taint_clean: true,
      socket_gated: true,
    },
  },
  null,
  2
)}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setInspectModalSkill(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-space font-medium text-slate-200"
              >
                Close
              </button>
              <a
                href={`nexus://install-skill?slug=${inspectModalSkill.slug}`}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-space font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Install Skill
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
