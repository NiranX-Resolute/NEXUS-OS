import React, { useState, useEffect, useMemo } from 'react';
import { SkillPackage } from '../types/marketplace';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (slug: string, bundleUrlOrData: string) => void;
}

const DEFAULT_INSTRUCTIONS = `# My Custom Capability

Describe what this skill or agent playbook does and how it automates execution.

## Execution Procedure

1. Read target workspace or context
2. Transform code or perform verification
3. Output deterministic results

\`\`\`python
def execute_skill(context):
    # Pure Python logic compliant with 6 Sovereign Invariants
    return {"status": "SUCCESS"}
\`\`\`
`;

export const CreatorPackagerModal: React.FC<Props> = ({ isOpen, onClose, onInstall }) => {
  const [name, setName] = useState<string>('My Custom Capability');
  const [slug, setSlug] = useState<string>('my-custom-capability');
  const [type, setType] = useState<'skill' | 'agent'>('skill');
  const [orbiterGroup, setOrbiterGroup] = useState<string>('DEV-01');
  const [category, setCategory] = useState<string>('developer');
  const [permissionScope, setPermissionScope] = useState<string>('FILESYSTEM_READ, WORKSPACE_WRITE');
  const [instructionsMd, setInstructionsMd] = useState<string>(DEFAULT_INSTRUCTIONS);
  const [sha256Hash, setSha256Hash] = useState<string>('');
  const [isComputingHash, setIsComputingHash] = useState<boolean>(false);

  // Auto-slugify when name changes if slug wasn't manually edited
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(autoSlug || 'custom-skill');
  };

  const parsedPermissions = useMemo(() => {
    return permissionScope
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }, [permissionScope]);

  // Real Web Crypto SHA-256 Digest
  useEffect(() => {
    let isCancelled = false;
    async function computeDigest() {
      setIsComputingHash(true);
      try {
        const canonicalPayload = {
          category: String(category || 'developer'),
          instructions_md: String(instructionsMd || ''),
          name: String(name || ''),
          orbiter_group: String(orbiterGroup || 'DEV-01'),
          permission_scope: [...parsedPermissions].map(String).sort(),
          references: [],
          schema_version: '1.0',
          slug: String(slug || 'custom-skill'),
          type: String(type || 'skill'),
        };

        const jsonStr = JSON.stringify(canonicalPayload);
        const encoder = new TextEncoder();
        const data = encoder.encode(jsonStr);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        if (!isCancelled) {
          setSha256Hash(hashHex);
        }
      } catch (err) {
        console.error('Crypto digest error:', err);
      } finally {
        if (!isCancelled) {
          setIsComputingHash(false);
        }
      }
    }

    computeDigest();
    return () => {
      isCancelled = true;
    };
  }, [name, slug, type, orbiterGroup, category, parsedPermissions, instructionsMd]);

  if (!isOpen) return null;

  const currentPackage: SkillPackage = {
    schema_version: '1.0',
    slug,
    name,
    type,
    orbiter_group: orbiterGroup,
    category,
    permission_scope: parsedPermissions,
    instructions_md: instructionsMd,
    references: [],
    sha256: sha256Hash,
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(currentPackage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'skill'}.nxskill`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleInstallToNexus = () => {
    // Pass JSON data encoded or slug
    const jsonStr = JSON.stringify(currentPackage);
    const dataUri = `data:application/json;base64,${btoa(unescape(encodeURIComponent(jsonStr)))}`;
    onInstall(slug, dataUri);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div 
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-[#030711]/95 border border-[#00F5D4]/40 rounded-2xl shadow-[0_0_60px_rgba(0,245,212,0.2)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-xl">📦</span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Create & Package .nxskill Bundle
              </h2>
              <p className="text-xs text-slate-400">
                In-browser Web Crypto SHA-256 signing compliant with AgentShield & Sovereign Invariants
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Package Name</label>
              <input
                type="text"
                value={name}
                onChange={handleNameChange}
                className="w-full px-3 py-2 text-sm bg-black/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#00F5D4]"
                placeholder="e.g. AST Refactoring Pipeline"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Package Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-black/50 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-[#00F5D4]"
                placeholder="ast-refactoring-pipeline"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'skill' | 'agent')}
                className="w-full px-3 py-2 text-sm bg-black/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#00F5D4]"
              >
                <option value="skill">Skill Playbook</option>
                <option value="agent">Autonomous Agent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Orbiter Group</label>
              <select
                value={orbiterGroup}
                onChange={(e) => setOrbiterGroup(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-black/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#00F5D4]"
              >
                <option value="DEV-01">DEV-01 (NexKoder)</option>
                <option value="SYS-01">SYS-01 (SysGuard)</option>
                <option value="SCOUT-01">SCOUT-01 (Scout)</option>
                <option value="SEC-01">SEC-01 (Sentinel)</option>
                <option value="OPS-01">OPS-01 (Orchestrator)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-black/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#00F5D4]"
              >
                <option value="developer">Developer</option>
                <option value="system">System Reflex</option>
                <option value="research">Research</option>
                <option value="security">Security</option>
                <option value="orchestration">Orchestration</option>
                <option value="voice">Voice</option>
                <option value="cloud">Cloud Edge</option>
                <option value="community">Community</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Permission Scopes (comma-separated)
            </label>
            <input
              type="text"
              value={permissionScope}
              onChange={(e) => setPermissionScope(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono bg-black/50 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-[#00F5D4]"
              placeholder="FILESYSTEM_READ, WORKSPACE_WRITE"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                SKILL.md Playbook & Instructions
              </label>
              <span className="text-[10px] text-slate-500 font-mono">Markdown + Code Blocks</span>
            </div>
            <textarea
              rows={8}
              value={instructionsMd}
              onChange={(e) => setInstructionsMd(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-black/70 border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:border-[#00F5D4] leading-relaxed resize-y"
            />
          </div>

          {/* Real SHA-256 Output Badge */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-[#00F5D4]/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Web Crypto SHA-256:</span>
              <code className="text-xs font-mono text-[#00F5D4] tracking-wider">
                {isComputingHash ? 'Calculating...' : sha256Hash || 'Waiting...'}
              </code>
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ✓ Real SubtleCrypto
            </span>
          </div>
        </div>

        {/* Footer */}
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
              onClick={handleInstallToNexus}
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
