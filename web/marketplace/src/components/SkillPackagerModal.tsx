import React, { useState } from 'react';

// Lightweight in-browser ZIP generator for .nxskill bundles (Zero external dependencies)
function createNxskillZip(manifestJson: string, skillMdContent: string, mainPyContent: string = ''): Blob {
  const textEncoder = new TextEncoder();

  // CRC32 table
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  function crc32(buf: Uint8Array): number {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  interface FileEntry {
    name: string;
    data: Uint8Array;
    crc: number;
    offset: number;
  }

  const files: { name: string; content: string }[] = [
    { name: 'manifest.json', content: manifestJson },
    { name: 'SKILL.md', content: skillMdContent },
  ];
  if (mainPyContent) {
    files.push({ name: 'main.py', content: mainPyContent });
  }

  const entries: FileEntry[] = [];
  const parts: Uint8Array[] = [];
  let currentOffset = 0;

  for (const f of files) {
    const data = textEncoder.encode(f.content);
    const nameBytes = textEncoder.encode(f.name);
    const fileCrc = crc32(data);

    // Local file header (30 bytes + name length)
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // PK\x03\x04
    view.setUint16(4, 20, true);         // version needed
    view.setUint16(6, 0, true);          // flags
    view.setUint16(8, 0, true);          // compression (0 = stored)
    view.setUint16(10, 0, true);         // mod time
    view.setUint16(12, 0, true);         // mod date
    view.setUint32(14, fileCrc, true);   // crc32
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true); // filename length
    view.setUint16(28, 0, true);         // extra field length
    header.set(nameBytes, 30);

    parts.push(header);
    parts.push(data);

    entries.push({
      name: f.name,
      data,
      crc: fileCrc,
      offset: currentOffset,
    });

    currentOffset += header.length + data.length;
  }

  // Central Directory
  const cdOffset = currentOffset;
  let cdSize = 0;

  for (const e of entries) {
    const nameBytes = textEncoder.encode(e.name);
    const cdHeader = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true); // PK\x01\x02
    view.setUint16(4, 20, true);         // version made by
    view.setUint16(6, 20, true);         // version needed
    view.setUint16(8, 0, true);          // flags
    view.setUint16(10, 0, true);         // compression
    view.setUint16(12, 0, true);         // mod time
    view.setUint16(14, 0, true);         // mod date
    view.setUint32(16, e.crc, true);     // crc32
    view.setUint32(20, e.data.length, true);
    view.setUint32(24, e.data.length, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);         // extra length
    view.setUint16(32, 0, true);         // comment length
    view.setUint16(34, 0, true);         // disk number
    view.setUint16(36, 0, true);         // internal attrs
    view.setUint32(38, 0, true);         // external attrs
    view.setUint32(42, e.offset, true);  // relative offset
    cdHeader.set(nameBytes, 46);

    parts.push(cdHeader);
    cdSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // PK\x05\x06
  eocdView.setUint16(4, 0, true);          // disk number
  eocdView.setUint16(6, 0, true);          // start disk
  eocdView.setUint16(8, entries.length, true);  // total entries this disk
  eocdView.setUint16(10, entries.length, true); // total entries
  eocdView.setUint32(12, cdSize, true);         // size of CD
  eocdView.setUint32(16, cdOffset, true);       // offset of CD
  eocdView.setUint16(20, 0, true);              // comment length
  parts.push(eocd);

  return new Blob(parts as any, { type: 'application/octet-stream' });
}

interface SkillPackagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SkillPackagerModal: React.FC<SkillPackagerModalProps> = ({ isOpen, onClose }) => {
  const [title, setTitle] = useState('My Custom Capability');
  const [slug, setSlug] = useState('my-custom-capability');
  const [author, setAuthor] = useState('NEXUS Operator');
  const [category, setCategory] = useState('developer');
  const [anchor, setAnchor] = useState('DEV-01');
  const [description, setDescription] = useState('High-performance autonomous skill package.');
  const [skillMd, setSkillMd] = useState(
`---
name: my-custom-capability
title: "My Custom Capability"
version: 1.0.0
author: NEXUS Operator
description: "High-performance autonomous skill package."
category: developer
---

# My Custom Capability

Execute verified system tasks deterministically.

## Implementation

\`\`\`python
def execute_skill():
    return {"status": "SUCCESS", "message": "Skill executed cleanly"}
\`\`\`
`
  );
  const [pyCode, setPyCode] = useState(
`# main.py for my-custom-capability
def execute_skill():
    return {"status": "SUCCESS", "message": "Skill executed cleanly"}
`
  );

  if (!isOpen) return null;

  const handleDownload = () => {
    const manifest = {
      format: "nxskill/v1",
      slug: slug || "custom-skill",
      title: title || "Custom Skill",
      version: "1.0.0",
      author: author || "NEXUS Operator",
      category: category || "developer",
      anchor: anchor || "DEV-01",
      description: description || "",
      tools: ["filesystem"],
      created_at: new Date().toISOString(),
    };

    const zipBlob = createNxskillZip(JSON.stringify(manifest, null, 2), skillMd, pyCode);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug || 'custom-skill'}.nxskill`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl p-6 bg-slate-900/95 border border-cyan-500/30 rounded-2xl shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-cyan-300">SKILL.md → .nxskill Client-Side Packager</h3>
            <p className="text-xs text-slate-400">Bundle, sign, and download portable .nxskill packages with zero cloud leaks.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 pt-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="developer">developer</option>
                <option value="system">system</option>
                <option value="research">research</option>
                <option value="security">security</option>
                <option value="orchestration">orchestration</option>
                <option value="voice">voice</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Anchor Orbiter</label>
              <select
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="DEV-01">DEV-01 (NexKoder)</option>
                <option value="SYS-01">SYS-01 (SysGuard)</option>
                <option value="SCOUT-01">SCOUT-01 (Scout)</option>
                <option value="SEC-01">SEC-01 (Sentinel)</option>
                <option value="OPS-01">OPS-01 (Orchestrator)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Author</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">SKILL.md Definition</label>
            <textarea
              rows={6}
              value={skillMd}
              onChange={(e) => setSkillMd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500 leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Optional Python Implementation (main.py)</label>
            <textarea
              rows={4}
              value={pyCode}
              onChange={(e) => setPyCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500 leading-relaxed"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800">
          <div className="text-[10px] text-slate-400 font-mono">Output: {slug}.nxskill (ZIP format)</div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold cursor-pointer transition-all shadow-[0_0_12px_rgba(6,182,212,0.4)]"
            >
              ⬇ Download .nxskill Package
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
