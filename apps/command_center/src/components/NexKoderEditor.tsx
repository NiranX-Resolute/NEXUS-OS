import React, { useState, useEffect } from 'react';
import {
  Code2,
  FileCode,
  Play,
  Copy,
  FolderTree,
  Terminal,
  Save,
  CheckCheck,
  ChevronRight,
  SplitSquareHorizontal,
  RefreshCw,
} from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  path: string;
  language: string;
  originalCode: string;
  modifiedCode: string;
  is_dir?: boolean;
}

interface GitStatus {
  branch: string;
  clean: boolean;
  staged_count: number;
  modified_count: number;
  untracked_count: number;
  total_changes: number;
  status_lines: string[];
}

export function NexKoderEditor() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'editor' | 'diff'>('diff');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [gitStatus, setGitStatus] = useState<GitStatus>({
    branch: 'main',
    clean: true,
    staged_count: 0,
    modified_count: 0,
    untracked_count: 0,
    total_changes: 0,
    status_lines: [],
  });

  // 1. Fetch live workspace file tree & git status
  const refreshWorkspace = async () => {
    try {
      // Live Git Status
      const gitRes = await fetch('http://127.0.0.1:47630/api/git/status');
      if (gitRes.ok) {
        const gitData = await gitRes.json();
        setGitStatus(gitData);
      }
    } catch {
      // Git status offline fallback
    }

    try {
      // Live Filesystem Tree (guarded by ScopeGuard)
      const fsRes = await fetch('http://127.0.0.1:47630/api/fs/tree');
      if (fsRes.ok) {
        const fsData = await fsRes.json();
        if (fsData && Array.isArray(fsData.files)) {
          const mappedFiles: FileItem[] = fsData.files
            .filter((f: any) => !f.is_dir)
            .map((f: any, idx: number) => ({
              id: `f-${idx}-${f.name}`,
              name: f.name,
              path: f.path,
              language: f.ext === '.ts' || f.ext === '.tsx' ? 'typescript' : f.ext === '.py' ? 'python' : 'plaintext',
              originalCode: '',
              modifiedCode: '',
            }));

          setFiles(mappedFiles);
          if (mappedFiles.length > 0 && !activeFileId) {
            const first = mappedFiles[0];
            setActiveFileId(first.id);
            setOpenTabs([first.id]);
            loadContent(first.path, first.id);
          }
        }
      }
    } catch {
      // FS Tree offline fallback
    }
  };

  useEffect(() => {
    refreshWorkspace();
  }, []);

  const loadContent = async (filePath: string, fileId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:47630/api/fs/read?path=${encodeURIComponent(filePath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          const content = data.content || '';
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileId
                ? { ...f, originalCode: content, modifiedCode: content }
                : f
            )
          );
        }
      }
    } catch {
      // File read error
    }
  };

  const activeFile = files.find((f) => f.id === activeFileId) || files[0] || {
    id: 'empty-selection',
    name: 'Select a file',
    path: '',
    language: 'plaintext',
    originalCode: '// Select a file from the Project Explorer tree to begin live editing',
    modifiedCode: '// Select a file from the Project Explorer tree to begin live editing',
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.modifiedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveFile = async () => {
    if (!activeFile.path) return;
    setIsSaving(true);
    try {
      const res = await fetch('http://127.0.0.1:47630/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activeFile.path,
          content: activeFile.modifiedCode,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        await refreshWorkspace();
      }
    } catch (err: any) {
      setTerminalOutput(`[SAVE ERROR] Failed to write ${activeFile.path}: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunVerify = async () => {
    setIsRunning(true);
    setTerminalOutput('Executing typecheck and compilation tests...\n');
    try {
      const res = await fetch('http://127.0.0.1:47630/api/exec/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'npx tsc -b' }),
      });
      const data = await res.json();
      if (data && data.success) {
        setTerminalOutput(
          `[VERIFICATION SUCCESS] Exit code: ${data.exit_code} (Duration: ${data.duration_ms}ms)\n` +
          `Command: ${data.command}\n` +
          (data.stdout ? `STDOUT:\n${data.stdout}\n` : '') +
          `✓ Typecheck & compilation clean. Zero TypeScript errors.`
        );
      } else {
        setTerminalOutput(
          `[VERIFICATION FAILED] Exit code: ${data.exit_code}\n` +
          `Command: ${data.command}\n` +
          (data.stderr ? `STDERR:\n${data.stderr}\n` : '') +
          (data.stdout ? `STDOUT:\n${data.stdout}\n` : '') +
          (data.error ? `Error: ${data.error}\n` : '')
        );
      }
    } catch (err: any) {
      setTerminalOutput(`[EXEC ERROR] Unable to contact verify runner: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((t) => t !== id);
    setOpenTabs(newTabs);
    if (activeFileId === id && newTabs.length > 0) {
      setActiveFileId(newTabs[0]);
    }
  };

  const openFile = (file: FileItem) => {
    if (!openTabs.includes(file.id)) {
      setOpenTabs([...openTabs, file.id]);
    }
    setActiveFileId(file.id);
    if (!file.originalCode && !file.modifiedCode) {
      loadContent(file.path, file.id);
    }
  };

  const origLines = (activeFile.originalCode || '').split('\n');
  const modLines = (activeFile.modifiedCode || '').split('\n');
  const maxLines = Math.max(origLines.length, modLines.length);

  return (
    <div className="flex flex-col h-full bg-[#070B14] rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
      {/* Top Application Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#0B0F19] border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Code2 className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
              NexKoder &bull; Agent Code Workbench
            </h2>
            <p className="text-xs text-slate-400">
              Live Workspace &bull; ScopeGuard Invariants &bull; Autonomous Patch Verification
            </p>
          </div>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('editor')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'editor'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'diff'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SplitSquareHorizontal className="w-3.5 h-3.5" />
              <span>Side-by-Side Diff</span>
            </button>
          </div>

          <button
            onClick={handleSaveFile}
            disabled={isSaving || !activeFile.path}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600/20 text-purple-300 border border-purple-500/30 hover:bg-purple-600/30 rounded-lg transition-colors"
          >
            {saveSuccess ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaving ? 'Writing...' : saveSuccess ? 'Saved' : 'Save'}</span>
          </button>

          <button
            onClick={handleRunVerify}
            disabled={isRunning}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg transition-colors"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Validating...' : 'Verify Patch'}</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Editor Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left File Explorer */}
        <div className="w-64 bg-[#090D16] border-r border-slate-800/80 p-3 flex flex-col">
          <div className="flex items-center justify-between px-2 py-2 mb-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <FolderTree className="w-3.5 h-3.5 text-slate-500" />
              <span>Workspace Files</span>
            </div>
            <button
              onClick={refreshWorkspace}
              className="text-slate-500 hover:text-slate-300 p-1 rounded"
              title="Refresh Workspace"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1 flex-1 overflow-y-auto pr-1">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => openFile(file)}
                className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  activeFileId === file.id
                    ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </div>

          {/* Live Git Status Widget */}
          <div className="mt-auto p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Git Working Tree</span>
              <span className={gitStatus.clean ? 'text-emerald-400' : 'text-amber-400'}>
                {gitStatus.clean ? 'Clean' : 'Modified'}
              </span>
            </p>
            <p className="text-emerald-400">● {gitStatus.staged_count} files staged for review</p>
            <p className="text-slate-400">● {gitStatus.modified_count} unstaged &bull; {gitStatus.untracked_count} untracked</p>
            <p className="text-slate-500 mt-1">Branch: {gitStatus.branch}</p>
          </div>
        </div>

        {/* Center Code Area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#070B14]">
          {/* File Tabs */}
          <div className="flex items-center space-x-1 bg-[#090D16] border-b border-slate-800 px-3 pt-2 overflow-x-auto">
            {openTabs.map((tabId) => {
              const file = files.find((f) => f.id === tabId);
              if (!file) return null;
              const isActive = activeFileId === tabId;

              return (
                <div
                  key={tabId}
                  onClick={() => setActiveFileId(tabId)}
                  className={`flex items-center space-x-2 px-3 py-1.5 text-xs rounded-t-md cursor-pointer border-t border-x transition-colors ${
                    isActive
                      ? 'bg-[#0B0F19] text-purple-300 border-slate-700 font-medium'
                      : 'bg-slate-900/40 text-slate-400 border-transparent hover:text-slate-200'
                  }`}
                >
                  <span className="truncate max-w-[140px]">{file.name}</span>
                  <button
                    onClick={(e) => closeTab(e, tabId)}
                    className="hover:text-rose-400 text-slate-500 p-0.5 rounded"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          {/* Main View Area */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs">
            {viewMode === 'diff' ? (
              /* Side-by-Side Diff View */
              <div className="grid grid-cols-2 gap-4 h-full">
                {/* Left: Original Code */}
                <div className="bg-[#0B0F19] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold text-rose-400 flex items-center justify-between">
                    <span>Base Version (Disk)</span>
                    <span className="text-slate-500">{origLines.length} lines</span>
                  </div>
                  <div className="p-3 overflow-auto flex-1 leading-relaxed">
                    {Array.from({ length: maxLines }).map((_, idx) => {
                      const line = origLines[idx] || '';
                      return (
                        <div key={idx} className="flex hover:bg-slate-900/60">
                          <span className="w-8 text-right pr-3 select-none text-slate-600">
                            {idx < origLines.length ? idx + 1 : ''}
                          </span>
                          <span className="text-slate-400 whitespace-pre flex-1">
                            {line || ' '}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Modified Working Tree Code */}
                <div className="bg-[#0B0F19] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
                    <span>Active Buffer (Workspace)</span>
                    <span className="text-slate-500">{modLines.length} lines</span>
                  </div>
                  <div className="p-3 overflow-auto flex-1 leading-relaxed">
                    {Array.from({ length: maxLines }).map((_, idx) => {
                      const line = modLines[idx] || '';
                      const isNew = idx >= origLines.length || line !== origLines[idx];
                      return (
                        <div
                          key={idx}
                          className={`flex hover:bg-slate-900/60 ${
                            isNew ? 'bg-emerald-950/20 text-emerald-300' : ''
                          }`}
                        >
                          <span className="w-8 text-right pr-3 select-none text-slate-600">
                            {idx < modLines.length ? idx + 1 : ''}
                          </span>
                          <span className="whitespace-pre flex-1">
                            {line || ' '}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              /* Single Full Code View (Editable) */
              <div className="bg-[#0B0F19] border border-slate-800 rounded-lg p-2 h-full flex flex-col">
                <textarea
                  value={activeFile.modifiedCode}
                  onChange={(e) => {
                    const newCode = e.target.value;
                    setFiles((prev) =>
                      prev.map((f) => (f.id === activeFile.id ? { ...f, modifiedCode: newCode } : f))
                    );
                  }}
                  className="w-full h-full bg-transparent text-slate-200 font-mono text-xs p-2 leading-relaxed resize-none focus:outline-none"
                  placeholder="Code buffer empty or loading..."
                  spellCheck={false}
                />
              </div>
            )}
          </div>

          {/* Terminal Output Drawer */}
          {terminalOutput && (
            <div className="h-36 bg-[#090D16] border-t border-slate-800 p-3 font-mono text-xs overflow-auto">
              <div className="flex items-center justify-between pb-1 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                <span className="flex items-center space-x-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  <span>Real Subprocess Terminal Output</span>
                </span>
                <button
                  onClick={() => setTerminalOutput(null)}
                  className="text-slate-500 hover:text-slate-300"
                >
                  &times; Dismiss
                </button>
              </div>
              <pre className="text-slate-300 whitespace-pre-wrap">{terminalOutput}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default NexKoderEditor;
