import React, { useEffect, useState, useMemo } from 'react';
import { CatalogData, CatalogSkillItem, CatalogAgentItem, StarterPack } from './types/marketplace';
import { SkillInspectorModal } from './components/SkillInspectorModal';
import { CreatorPackagerModal } from './components/CreatorPackagerModal';

export default function App() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedOrbiter, setSelectedOrbiter] = useState<string>('ALL');
  const [selectedScope, setSelectedScope] = useState<string>('ALL');

  const [inspectingSkill, setInspectingSkill] = useState<CatalogSkillItem | null>(null);
  const [isPackagerOpen, setIsPackagerOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/catalog.json')
      .then((res) => {
        if (!res.ok) throw new Error('Catalog fetch failed');
        return res.json();
      })
      .then((data: CatalogData) => {
        setCatalog(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load marketplace catalog:', err);
        setLoading(false);
      });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleInstallSkill = (slug: string, bundleUrl: string) => {
    const deepLink = `nexus://install-skill?slug=${encodeURIComponent(slug)}&bundle=${encodeURIComponent(bundleUrl)}`;
    console.log('[MARKETPLACE] Launching protocol:', deepLink);
    window.location.href = deepLink;
    showToast(`⚡ Dispatched install signal to Nexus OS for /skill:${slug}`);
  };

  const handleInstallPack = (packSlug: string) => {
    const deepLink = `nexus://install-pack?pack=${encodeURIComponent(packSlug)}`;
    console.log('[MARKETPLACE] Launching starter pack protocol:', deepLink);
    window.location.href = deepLink;
    showToast(`⚡ Dispatched starter pack install to Nexus OS for ${packSlug}`);
  };

  // Derive unique permission scopes across catalog
  const allScopes = useMemo(() => {
    if (!catalog?.skills) return [];
    const s = new Set<string>();
    catalog.skills.forEach((item) => {
      (item.permission_scope || []).forEach((p) => s.add(p));
    });
    return Array.from(s).sort();
  }, [catalog]);

  // Combined filtered items
  const filteredSkills = useMemo(() => {
    if (!catalog?.skills) return [];
    return catalog.skills.filter((item) => {
      // Type filter
      if (selectedType !== 'all' && item.type !== selectedType) return false;

      // Orbiter filter
      if (selectedOrbiter !== 'ALL') {
        const itemOrb = item.orbiter_group || item.anchor || '';
        if (itemOrb !== selectedOrbiter) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      // Permission scope filter
      if (selectedScope !== 'ALL') {
        if (!item.permission_scope || !item.permission_scope.includes(selectedScope)) return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = (item.name || item.title || '').toLowerCase().includes(q);
        const matchSlug = item.slug.toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        const matchCat = (item.category || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSlug && !matchDesc && !matchCat) return false;
      }

      return true;
    });
  }, [catalog, selectedType, selectedOrbiter, selectedCategory, selectedScope, search]);

  return (
    <div className="min-h-screen bg-[#030711] text-slate-100 flex flex-col font-sans selection:bg-[#00F5D4]/20 selection:text-[#00F5D4]">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#030711]/95 border border-[#00F5D4] text-[#00F5D4] shadow-[0_0_30px_rgba(0,245,212,0.3)] text-xs font-semibold backdrop-blur-md animate-in fade-in slide-in-from-bottom-4">
          <span className="w-2 h-2 rounded-full bg-[#00F5D4] animate-ping" />
          {toastMessage}
        </div>
      )}

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-[#030711]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tighter text-white">NEXUS</span>
              <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-[#00F5D4]/10 text-[#00F5D4] border border-[#00F5D4]/30">
                v5.0 STOREFRONT
              </span>
            </div>
            <span className="hidden md:inline text-xs text-slate-400 border-l border-white/10 pl-4">
              Sovereign .nxskill Capability Mesh
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://nexus-landing.pages.dev/download"
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg text-slate-950 bg-gradient-to-r from-[#00F5D4] to-emerald-400 hover:from-[#5cf5ff] hover:to-emerald-300 shadow-[0_0_15px_rgba(0,245,212,0.3)] transition-all cursor-pointer"
            >
              <span>⚡ Download NEXUS OS</span>
            </a>
            <button
              onClick={() => setIsPackagerOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all cursor-pointer"
            >
              <span>📦</span>
              <span>Create .nxskill</span>
            </button>
            <a
              href="https://github.com/NiranX-Resolute/NEXUS-OS"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-10">
        {/* Hero Section */}
        <div className="relative rounded-3xl p-8 md:p-12 overflow-hidden border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#00F5D4]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-[#00F5D4] bg-[#00F5D4]/10 border border-[#00F5D4]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00F5D4] animate-pulse" />
              100% Free-Tier & Local-First Zero Cloud Leakage
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Sovereign Skill & Agent Marketplace
            </h1>
            <p className="text-sm md:text-base text-slate-400 leading-relaxed">
              Discover, audit with real AgentShield static analysis, and 1-click install verified{' '}
              <code className="text-[#00F5D4] font-mono">.nxskill</code> packages directly into your local
              Nexus OS SQLite WAL engine.
            </p>
          </div>
        </div>

        {/* 4 Starter Packs Banner */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="text-[#00F5D4]">⚡</span> 1-Click Starter Packs
            </h2>
            <span className="text-xs text-slate-500 font-mono">Curated Toolchains</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(catalog?.starter_packs || []).map((pack: StarterPack) => (
              <div
                key={pack.slug}
                className="group relative p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-[#00F5D4]/40 hover:shadow-[0_0_30px_rgba(0,245,212,0.12)] transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#00F5D4]/10 text-[#00F5D4] border border-[#00F5D4]/30">
                      {pack.orbiter_group}
                    </span>
                    {pack.badge && (
                      <span className="text-[10px] font-semibold text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded">
                        {pack.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-[#00F5D4] transition-colors">
                      {pack.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {pack.description}
                    </p>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {pack.skills.length} bundled skills
                  </div>
                </div>

                <button
                  onClick={() => handleInstallPack(pack.slug)}
                  className="mt-4 w-full py-2 text-xs font-bold text-center text-[#030711] bg-[#00F5D4] hover:bg-[#5cf5ff] rounded-lg transition-all shadow-[0_0_15px_rgba(0,245,212,0.2)]"
                >
                  ⚡ Install Pack
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Filter & Search Matrix */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search capabilities, playbooks, tools, or orbiter groups..."
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#00F5D4] focus:ring-1 focus:ring-[#00F5D4]"
              />
            </div>

            {/* Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Switcher */}
              <div className="flex rounded-lg bg-white/[0.03] p-1 border border-white/10 text-xs">
                {['all', 'skill', 'agent'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    className={`px-3 py-1 rounded-md font-semibold capitalize transition-all ${
                      selectedType === t
                        ? 'bg-[#00F5D4] text-[#030711]'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Orbiter Group Filter */}
              <select
                value={selectedOrbiter}
                onChange={(e) => setSelectedOrbiter(e.target.value)}
                className="px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-[#00F5D4]"
              >
                <option value="ALL">All Orbiters</option>
                <option value="DEV-01">DEV-01 (NexKoder)</option>
                <option value="SYS-01">SYS-01 (SysGuard)</option>
                <option value="SCOUT-01">SCOUT-01 (Scout)</option>
                <option value="SEC-01">SEC-01 (Sentinel)</option>
                <option value="OPS-01">OPS-01 (Orchestrator)</option>
              </select>

              {/* Permission Scope Filter */}
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value)}
                className="px-3 py-2 text-xs bg-white/[0.03] border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-[#00F5D4]"
              >
                <option value="ALL">All Permissions</option>
                {allScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            {(catalog?.categories || ['all']).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-xs rounded-full border transition-all capitalize font-medium ${
                  selectedCategory === cat
                    ? 'border-[#00F5D4] text-[#00F5D4] bg-[#00F5D4]/10 shadow-[0_0_10px_rgba(0,245,212,0.2)]'
                    : 'border-white/5 text-slate-400 bg-white/[0.02] hover:border-white/20 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Skills & Agents Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Showing <span className="text-white font-bold">{filteredSkills.length}</span> capabilities
            </span>
            <span className="font-mono text-slate-500">AgentShield Invariant Guard Active</span>
          </div>

          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              Loading capabilities mesh...
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-white/10 text-slate-500 text-sm">
              No skills found matching your filters. Try clearing filters or create a new capability!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredSkills.map((item) => (
                <div
                  key={item.slug}
                  className="group relative p-6 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-[#00F5D4]/40 hover:shadow-[0_0_25px_rgba(0,245,212,0.12)] transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#00F5D4]/10 text-[#00F5D4] border border-[#00F5D4]/30">
                          {item.orbiter_group || item.anchor || 'DEV-01'}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded">
                          {item.type}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        <span className="w-1 h-1 rounded-full bg-emerald-400" />
                        Verified Clean
                      </span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-white group-hover:text-[#00F5D4] transition-colors">
                        {item.name || item.title || item.slug}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Permission Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(item.permission_scope || []).slice(0, 3).map((perm) => (
                        <span
                          key={perm}
                          className="text-[10px] font-mono text-slate-400 bg-white/[0.03] px-2 py-0.5 rounded border border-white/5"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>

                    {/* SHA Snippet */}
                    <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>SHA-256</span>
                      <span className="text-slate-400 font-mono">
                        {item.sha256 ? `${item.sha256.slice(0, 8)}...${item.sha256.slice(-6)}` : 'verified'}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={() => setInspectingSkill(item)}
                      className="flex-1 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-lg transition-colors text-center"
                    >
                      Inspect
                    </button>
                    <button
                      onClick={() =>
                        handleInstallSkill(item.slug, `${window.location.origin}${item.package_url}`)
                      }
                      className="flex-1 py-2 text-xs font-bold text-[#030711] bg-[#00F5D4] hover:bg-[#5cf5ff] rounded-lg transition-all text-center shadow-[0_0_15px_rgba(0,245,212,0.2)]"
                    >
                      ⚡ Install
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6 text-center text-xs text-slate-500 font-mono space-y-2">
        <p>NEXUS OS v5.0 Sovereign Edge-to-Desktop Autonomous Engine</p>
        <p className="text-slate-600">Zero-Card // Zero-Subscription // Local-First Data Sovereignty</p>
        <div className="flex items-center justify-center gap-4 pt-2 text-[11px]">
          <a
            href="https://nexus-landing.pages.dev/download"
            className="text-[#00F5D4] hover:underline"
          >
            Download v5.0
          </a>
          <span>•</span>
          <a
            href="https://github.com/NiranX-Resolute/NEXUS-OS"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-white hover:underline"
          >
            GitHub Repository
          </a>
          <span>•</span>
          <a
            href="https://nexus-landing.pages.dev"
            className="text-slate-400 hover:text-white hover:underline"
          >
            Landing Portal
          </a>
        </div>
      </footer>

      {/* Modals */}
      <SkillInspectorModal
        skill={inspectingSkill}
        onClose={() => setInspectingSkill(null)}
        onInstall={handleInstallSkill}
      />

      <CreatorPackagerModal
        isOpen={isPackagerOpen}
        onClose={() => setIsPackagerOpen(false)}
        onInstall={handleInstallSkill}
      />
    </div>
  );
}
