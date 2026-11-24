import { h as createLucideIcon, r as reactExports, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, bd as CircleCheck, cp as SquareTerminal, bk as FileText, bh as Archive } from "./index-CYaMQ3cR.js";
import { C as ChevronRight } from "./chevron-right-C64GmUmu.js";
const __iconNode$4 = [
  ["path", { d: "m18 16 4-4-4-4", key: "1inbqp" }],
  ["path", { d: "m6 8-4 4 4 4", key: "15zrgr" }],
  ["path", { d: "m14.5 4-5 16", key: "e7oirm" }]
];
const CodeXml = createLucideIcon("code-xml", __iconNode$4);
const __iconNode$3 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "afitv7" }],
  ["path", { d: "M7 3v18", key: "bbkbws" }],
  ["path", { d: "M3 7.5h4", key: "zfgn84" }],
  ["path", { d: "M3 12h18", key: "1i2n21" }],
  ["path", { d: "M3 16.5h4", key: "1230mu" }],
  ["path", { d: "M17 3v18", key: "in4fa5" }],
  ["path", { d: "M17 7.5h4", key: "myr1c1" }],
  ["path", { d: "M17 16.5h4", key: "go4c1d" }]
];
const Film = createLucideIcon("film", __iconNode$3);
const __iconNode$2 = [
  [
    "path",
    {
      d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      key: "1kt360"
    }
  ],
  ["path", { d: "M12 10v6", key: "1bos4e" }],
  ["path", { d: "m15 13-3 3-3-3", key: "6j2sf0" }]
];
const FolderDown = createLucideIcon("folder-down", __iconNode$2);
const __iconNode$1 = [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
  ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
  ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
];
const Image = createLucideIcon("image", __iconNode$1);
const __iconNode = [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
];
const Zap = createLucideIcon("zap", __iconNode);
function SmartDropZonesWidget() {
  const [status, setStatus] = reactExports.useState("idle");
  const [targetCategory, setTargetCategory] = reactExports.useState(null);
  const [currentFile, setCurrentFile] = reactExports.useState("");
  const [progress, setProgress] = reactExports.useState({ current: 0, total: 0 });
  const [basePath, setBasePath] = reactExports.useState("");
  const [logStream, setLogStream] = reactExports.useState([]);
  const terminalRef = reactExports.useRef(null);
  const addLog = (log) => {
    setLogStream((prev) => [...prev, log].slice(-10));
  };
  reactExports.useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logStream]);
  reactExports.useEffect(() => {
    const handleStart = (e) => {
      setStatus("sorting");
      setBasePath(e.detail.path);
      setProgress({ current: 0, total: e.detail.total });
      setLogStream(["[SYSTEM] -> Initializing Smart Directory Router..."]);
    };
    const handleUpdate = (e) => {
      const { category, fileName, current, total } = e.detail;
      setTargetCategory(category.toLowerCase());
      setCurrentFile(fileName);
      setProgress({ current, total });
      addLog(`[ROUTED] -> ${fileName} => /${category}/`);
    };
    const handleDone = (e) => {
      setTargetCategory(null);
      if (e.detail?.error) {
        addLog("[ERROR] -> Process halted.");
      } else {
        addLog("[SYSTEM] -> Directory Sort Complete. All assets secured.");
        setStatus("done");
      }
      setTimeout(() => setStatus("idle"), 3e3);
    };
    window.addEventListener("dropzone-start", handleStart);
    window.addEventListener("dropzone-update", handleUpdate);
    window.addEventListener("dropzone-done", handleDone);
    return () => {
      window.removeEventListener("dropzone-start", handleStart);
      window.removeEventListener("dropzone-update", handleUpdate);
      window.removeEventListener("dropzone-done", handleDone);
    };
  }, []);
  if (status === "idle") return null;
  const percentRaw = progress.total > 0 ? progress.current / progress.total * 100 : 0;
  const folders = [
    {
      id: "images",
      label: "Images",
      icon: Image,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30"
    },
    {
      id: "videos",
      label: "Videos",
      icon: Film,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30"
    },
    {
      id: "documents",
      label: "Docs",
      icon: FileText,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30"
    },
    {
      id: "code",
      label: "Source",
      icon: CodeXml,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/30"
    },
    {
      id: "misc",
      label: "Misc",
      icon: Archive,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "border-pink-500/30"
    }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-9999 flex items-center justify-center bg-black/80 backdrop-blur-md p-8 animate-in fade-in duration-200", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { opacity: 0, scale: 0.95, y: 10 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.95, y: 10 },
      transition: { type: "spring", damping: 25, stiffness: 400 },
      className: "w-full max-w-3xl bg-[#050505] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.div,
          {
            className: "absolute top-0 left-0 h-1 bg-white z-10",
            initial: { width: "0%" },
            animate: { width: `${percentRaw}%` },
            transition: { ease: "easeOut", duration: 0.2 }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-16 bg-white/5 border-b border-white/10 flex items-center justify-between px-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            status === "sorting" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "w-5 h-5 text-white animate-pulse" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-emerald-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-black tracking-[0.2em] uppercase text-white", children: status === "sorting" ? "High-Speed Asset Router" : "Routing Complete" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs font-mono text-zinc-500", children: [
            progress.current,
            " / ",
            progress.total,
            " FILES"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-8 flex flex-col gap-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SquareTerminal, { className: "w-5 h-5 text-zinc-500" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-zinc-400 truncate", children: basePath })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center gap-6 py-4", children: folders.map((folder) => {
            const isTargeted = targetCategory?.includes(folder.id) || folder.id === "images" && targetCategory?.includes("photo") || folder.id === "documents" && targetCategory?.includes("pdf") || folder.id === "code" && targetCategory?.includes("dev") || folder.id === "videos" && (targetCategory?.includes("video") || targetCategory?.includes("mp4")) || folder.id === "misc" && targetCategory?.includes("misc");
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              motion.div,
              {
                animate: isTargeted ? { scale: 1.05, y: -5 } : { scale: 1, y: 0 },
                transition: { type: "spring", stiffness: 500, damping: 15 },
                className: `w-40 h-32 rounded-xl border flex flex-col items-center justify-center gap-3 transition-colors duration-200
                      ${isTargeted ? `${folder.bg} ${folder.border}` : "bg-black/40 border-white/5 opacity-50"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    folder.icon,
                    {
                      className: `w-8 h-8 ${isTargeted ? folder.color : "text-zinc-600"}`
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "span",
                    {
                      className: `text-[10px] font-bold tracking-widest uppercase ${isTargeted ? "text-white" : "text-zinc-600"}`,
                      children: folder.label
                    }
                  )
                ]
              },
              folder.id
            );
          }) }),
          status === "sorting" && currentFile && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            motion.div,
            {
              initial: { opacity: 0, x: -20 },
              animate: { opacity: 1, x: 0 },
              className: "flex items-center gap-3 px-4 py-2 bg-white/5 rounded-md border border-white/10",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FolderDown, { className: "w-4 h-4 text-zinc-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-white truncate", children: currentFile })
              ]
            },
            currentFile
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              ref: terminalRef,
              className: "bg-[#0a0a0a] border border-zinc-800 rounded-xl p-4 h-40 overflow-hidden relative font-mono text-[11px]",
              children: logStream.map((log, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                motion.div,
                {
                  initial: { opacity: 0, y: 5 },
                  animate: { opacity: 1, y: 0 },
                  className: "mb-1.5 flex items-start gap-2 text-zinc-400",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3 h-3 text-zinc-600 mt-0.5" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: log.includes("[ROUTED]") ? "text-white" : "", children: log })
                  ]
                },
                i + log
              ))
            }
          )
        ] })
      ]
    }
  ) }) });
}
export {
  SmartDropZonesWidget as default
};
