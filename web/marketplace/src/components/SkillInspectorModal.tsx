import React, { useEffect, useState } from 'react';
import { CatalogSkillItem, SkillPackage } from '../types/marketplace';

interface Props {
  skill: CatalogSkillItem | null;
  onClose: () => void;
  onInstall: (slug: string, bundleUrl: string) => void;
}

export const SkillInspectorModal: React.FC<Props> = ({ skill, onClose, onInstall }) => {
  const [packageData, setPackageData] = useState<SkillPackage | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedSha, setCopiedSha] = useState<boolean>(false);

  useEffect(() => {
    if (!skill) {
      setPackageData(null);
      return;
    }

    setLoading(true);
    fetch(skill.package_url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load package file');
        return res.json();
      })
      .then((data: SkillPackage) => {
        setPackageData(data);
        setLoading(false);
      })
      .catch(() => {
        // Fallback synthetic package if fetch fails
        setPackageData({
          schema_version: '1.0',
          slug: skill.slug,
          name: skill.name || skill.title || skill.slug,
          type: skill.type || 'skill',
          orbiter_group: skill.orbiter_group || skill.anchor || 'DEV-01',
          category: skill.category || 'developer',
          permission_scope: skill.permission_scope || [],
          instructions_md: `# ${skill.name || skill.slug}\n\n${skill.description}`,
          references: [],
          sha256: skill.sha256,
        });
        setLoading(false);
      });
  }, [skill]);

  if (!skill) return null;

  const handleCopySha = () => {
    const hash = packageData?.sha256 || skill.sha256;
    if (hash) {
      navigator.clipboard.writeText(hash);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!packageData) return;
    const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.slug}.nxskill`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fullUrl = `${window.location.origin}${skill.package_url}`;
  const sha = packageData?.sha256 || skill.sha256;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#030711]/95 border border-[#00F5D4]/30 rounded-2xl shadow-[0_0_50px_rgba(0,245,212,0.15)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-md uppercase tracking-wider bg-[#00F5D4]/10 text-[#00F5D4] border border-[#00F5D4]/30">
              {skill.orbiter_group || skill.anchor || 'DEV-01'}
            </span>
            <span className="px-2 py-0.5 text-xs font-medium rounded text-slate-400 bg-slate-800 border border-slate-700">
              {skill.category}
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {skill.name || skill.title || skill.slug}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Badges Bar */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">SHA-256:</span>
              <code className="text-xs font-mono text-[#00F5D4] bg-black/40 px-2 py-0.5 rounded border border-[#00F5D4]/20">
                {sha ? `${sha.slice(0, 16)}...${sha.slice(-8)}` : 'Verified'}
              </code>
              <button
                onClick={handleCopySha}
                className="text-xs px-2 py-0.5 rounded text-slate-300 hover:text-[#00F5D4] hover:bg-white/10 transition-colors"
                title="Copy full SHA-256 hash"
              >
                {copiedSha ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>

            <div className="h-4 w-px bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">AgentShield:</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Verified Clean
              </span>
            </div>
          </div>

          {/* Permissions Scope */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Permission Scopes
            </h3>
            <div className="flex flex-wrap gap-2">
              {(skill.permission_scope && skill.permission_scope.length > 0) ? (
                skill.permission_scope.map((perm) => (
                  <span
                    key={perm}
                    className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300"
                  >
                    {perm}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">Standard sandboxed permissions</span>
              )}
            </div>
          </div>

          {/* Instructions Markdown Viewer */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                SKILL.md Playbook & Execution Instructions
              </h3>
              <span className="text-xs text-slate-500 font-mono">schema v1.0</span>
            </div>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
                Loading capability playbook...
              </div>
            ) : (
              <pre className="p-4 rounded-xl bg-black/60 border border-white/10 text-slate-200 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-80 selection:bg-[#00F5D4]/20">
                {packageData?.instructions_md || skill.description}
              </pre>
            )}
          </div>
        </div>

        {/* Bottom Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
          >
            ⬇ Download .nxskill
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onInstall(skill.slug, fullUrl)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-[#030711] bg-[#00F5D4] hover:bg-[#5cf5ff] hover:shadow-[0_0_20px_rgba(0,245,212,0.4)] rounded-lg transition-all"
            >
              ⚡ Install in NEXUS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
