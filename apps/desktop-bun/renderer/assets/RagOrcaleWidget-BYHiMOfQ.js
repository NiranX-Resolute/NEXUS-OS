import { h as createLucideIcon, r as reactExports, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, co as Database, bd as CircleCheck, cp as SquareTerminal, bf as Activity, cq as cancelIngestion } from "./index-CYaMQ3cR.js";
import { L as LoaderCircle, B as BrainCircuit, C as Clock, T as Timer } from "./timer-Ch-zpmYO.js";
import { X } from "./x-BKeSnbZm.js";
const __iconNode$2 = [
  ["path", { d: "M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8", key: "14sh0y" }],
  [
    "path",
    {
      d: "M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z",
      key: "1970lx"
    }
  ],
  ["path", { d: "M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1", key: "l4dndm" }]
];
const Files = createLucideIcon("files", __iconNode$2);
const __iconNode$1 = [
  [
    "path",
    {
      d: "M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z",
      key: "2d38gg"
    }
  ]
];
const Octagon = createLucideIcon("octagon", __iconNode$1);
const __iconNode = [
  ["line", { x1: "19", x2: "5", y1: "5", y2: "19", key: "1x9vlm" }],
  ["circle", { cx: "6.5", cy: "6.5", r: "2.5", key: "4mh3h7" }],
  ["circle", { cx: "17.5", cy: "17.5", r: "2.5", key: "1mdrzq" }]
];
const Percent = createLucideIcon("percent", __iconNode);
function OracleWidget() {
  const [status, setStatus] = reactExports.useState("idle");
  const [path, setPath] = reactExports.useState("");
  const [chunkCount, setChunkCount] = reactExports.useState(0);
  const [fileCount, setFileCount] = reactExports.useState(0);
  const [targetTotalFiles, setTargetTotalFiles] = reactExports.useState(0);
  const [message, setMessage] = reactExports.useState("");
  const [currentFile, setCurrentFile] = reactExports.useState("");
  const [startTime, setStartTime] = reactExports.useState(null);
  const [elapsedMs, setElapsedMs] = reactExports.useState(0);
  const [logStream, setLogStream] = reactExports.useState([]);
  const terminalRef = reactExports.useRef(null);
  const addLog = (log) => {
    setLogStream((prev) => [...prev, log].slice(-6));
  };
  const handleClose = () => setStatus("idle");
  const handleStop = async () => {
    addLog("[SYSTEM OVERRIDE] -> PROCESS HALTED BY USER");
    setStatus("cancelled");
    setMessage(`Scan paused. Progress saved for ${fileCount} files.`);
    await cancelIngestion();
    setTimeout(() => setStatus("idle"), 5e3);
  };
  reactExports.useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logStream]);
  reactExports.useEffect(() => {
    let interval;
    if ((status === "scanning" || status === "ingesting") && startTime) {
      interval = setInterval(() => setElapsedMs(Date.now() - startTime), 1e3);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);
  reactExports.useEffect(() => {
    const onIngestStart = (e) => {
      setStatus("scanning");
      setPath(e.detail.path || "Unknown Directory");
      setLogStream(["Starting Directory Scan...", "Checking for saved progress..."]);
      setStartTime(Date.now());
      setElapsedMs(0);
    };
    const onProgress = (e) => {
      if (!e.detail) return;
      if (e.detail.status === "cancelled") {
        setStatus("cancelled");
        return;
      }
      if (e.detail.totalFiles) setTargetTotalFiles(e.detail.totalFiles);
      if (e.detail.filesProcessed) setFileCount(e.detail.filesProcessed);
      if (e.detail.chunks) setChunkCount(e.detail.chunks);
      if (e.detail.status === "scanning") {
        setStatus("scanning");
        if (e.detail.totalFound) setTargetTotalFiles(e.detail.totalFound);
        if (e.detail.file !== "Scan Complete") addLog(`Found: ${e.detail.file}`);
      } else if (e.detail.status === "reading") {
        setStatus("ingesting");
        setCurrentFile(e.detail.file);
        addLog(`[READING] -> ${e.detail.file}...`);
      } else if (e.detail.status === "embedded") {
        setStatus("ingesting");
        addLog(`[SAVED] -> ${e.detail.file}`);
      }
    };
    const onIngestDone = (e) => {
      if (status !== "cancelled") {
        setStatus("done");
        setMessage(e.detail.message || `Successfully processed ${e.detail.chunks} vectors.`);
        setTimeout(() => setStatus("idle"), 5e3);
      }
    };
    const onThinking = () => {
      setStatus("thinking");
      setMessage("AI is reading the code...");
      setLogStream(["Searching saved files..."]);
    };
    const onAnswered = () => {
      setStatus("done");
      setMessage("Complete. Sending response.");
      setTimeout(() => setStatus("idle"), 5e3);
    };
    window.addEventListener("oracle-ingest-start", onIngestStart);
    window.addEventListener("oracle-progress", onProgress);
    window.addEventListener("oracle-ingest-done", onIngestDone);
    window.addEventListener("oracle-thinking", onThinking);
    window.addEventListener("oracle-answered", onAnswered);
    return () => {
      window.removeEventListener("oracle-ingest-start", onIngestStart);
      window.removeEventListener("oracle-progress", onProgress);
      window.removeEventListener("oracle-ingest-done", onIngestDone);
      window.removeEventListener("oracle-thinking", onThinking);
      window.removeEventListener("oracle-answered", onAnswered);
    };
  }, [status]);
  if (status === "idle") return null;
  const percentRaw = targetTotalFiles > 0 ? fileCount / targetTotalFiles * 100 : 0;
  const percentFormatted = percentRaw.toFixed(1);
  let etaMs = 0;
  const filesRemaining = targetTotalFiles - fileCount;
  if (fileCount > 0 && filesRemaining > 0) {
    const timePerFile = elapsedMs / fileCount;
    etaMs = timePerFile * filesRemaining;
  } else if (filesRemaining > 0 && status === "ingesting") {
    etaMs = filesRemaining * 4e3;
  }
  const formatTime = (ms) => {
    if (!isFinite(ms) || ms < 0) return "--:--";
    const totalSeconds = Math.floor(ms / 1e3);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };
  const isPaused = status === "cancelled" || status === "done";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-999 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { opacity: 0, scale: 0.95, y: 20 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.95, y: 20 },
      transition: { type: "spring", damping: 25, stiffness: 300 },
      className: "w-full max-w-4xl bg-[#050505] border border-emerald-500/30 rounded-2xl shadow-[0_0_100px_rgba(16,185,129,0.15)] overflow-hidden flex flex-col relative",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.div,
          {
            className: `absolute top-0 left-0 h-0.5 z-10 transition-colors ${status === "cancelled" ? "bg-red-500" : "bg-emerald-500"}`,
            initial: { width: "0%" },
            animate: {
              width: status === "scanning" || status === "ingesting" || status === "thinking" ? "100%" : "0%"
            },
            transition: {
              duration: 1.5,
              repeat: status === "scanning" || status === "ingesting" || status === "thinking" ? Infinity : 0,
              ease: "linear"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-16 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between px-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
            status === "scanning" && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 text-emerald-400 animate-spin" }),
            status === "ingesting" && /* @__PURE__ */ jsxRuntimeExports.jsx(Database, { className: "w-6 h-6 text-emerald-400 animate-pulse" }),
            status === "thinking" && /* @__PURE__ */ jsxRuntimeExports.jsx(BrainCircuit, { className: "w-6 h-6 text-emerald-400 animate-pulse" }),
            status === "done" && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-6 h-6 text-emerald-400" }),
            status === "cancelled" && /* @__PURE__ */ jsxRuntimeExports.jsx(Octagon, { className: "w-6 h-6 text-red-500" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `text-base font-black tracking-[0.2em] uppercase ${status === "cancelled" ? "text-red-500" : "text-emerald-400"}`,
                children: status === "scanning" ? "Scanning Folders" : status === "ingesting" ? `Reading Files ${isPaused ? "(Paused)" : ""}` : status === "thinking" ? "AI Computing" : status === "cancelled" ? "Process Paused" : "System Ready"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleClose,
              className: "text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-full",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-6 h-6" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(motion.div, { layout: true, className: "p-10 flex flex-col gap-8", children: status === "scanning" || status === "ingesting" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(motion.div, { layout: true, className: "flex flex-col gap-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SquareTerminal, { className: "w-5 h-5 text-emerald-500/50" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-zinc-400 break-all line-clamp-1", children: path })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: handleStop,
                disabled: isPaused,
                className: `flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black tracking-widest transition-all shadow-lg ${isPaused ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" : "bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Octagon, { className: "w-4 h-4" }),
                  isPaused ? "PAUSED" : "STOP SCAN"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Activity,
                  {
                    className: `w-5 h-5 ${status === "ingesting" && !isPaused ? "text-emerald-400 animate-pulse" : "text-emerald-500/50"}`
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-bold tracking-widest text-emerald-500 uppercase", children: status === "scanning" ? "Looking for files..." : `Processing: ${currentFile || "Loading..."}` })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-emerald-400", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Percent, { className: "w-5 h-5" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  motion.span,
                  {
                    className: "text-xl font-black",
                    animate: { opacity: [0.8, 1, 0.8] },
                    transition: { duration: 2, repeat: Infinity },
                    children: [
                      percentFormatted,
                      "%"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full h-3 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 relative", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                motion.div,
                {
                  className: "h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] rounded-full absolute top-0 left-0",
                  initial: { width: 0 },
                  animate: { width: `${percentRaw}%` },
                  transition: { ease: "easeInOut", duration: 0.3 }
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                motion.div,
                {
                  className: "h-full bg-emerald-500/20 absolute top-0 left-0",
                  animate: {
                    width: targetTotalFiles > 0 ? `${fileCount / targetTotalFiles * 100}%` : "0%"
                  },
                  transition: { ease: "linear", duration: 0.1 }
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              ref: terminalRef,
              className: "bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 h-45 overflow-y-auto relative font-mono text-sm scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent",
              children: logStream.map((log, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                motion.div,
                {
                  initial: { opacity: 0, x: -10 },
                  animate: { opacity: 1, x: 0 },
                  className: "text-emerald-400/80 mb-2 flex items-start gap-3",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-600 font-bold mt-0.5", children: ">" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "break-all", children: log })
                  ]
                },
                i + log
              ))
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              StatBox,
              {
                icon: Files,
                label: "Files Done",
                value: fileCount,
                total: targetTotalFiles
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              StatBox,
              {
                icon: Database,
                label: "Saved Vectors",
                value: chunkCount,
                iconColor: "text-emerald-500",
                valueColor: "text-emerald-400"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(StatBox, { icon: Clock, label: "Time Taken", textValue: formatTime(elapsedMs) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              StatBox,
              {
                icon: Timer,
                label: "Time Left",
                textValue: formatTime(etaMs),
                iconColor: "text-emerald-500",
                valueColor: "text-emerald-400",
                animate: status === "ingesting" && !isPaused
              }
            )
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(motion.div, { layout: true, className: "flex flex-col items-center justify-center py-20", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "h2",
            {
              className: `text-3xl font-black mb-3 ${status === "cancelled" ? "text-red-500" : "text-white"}`,
              children: status === "thinking" ? "ANALYZING CODE" : status === "cancelled" ? "SCAN PAUSED" : "PROCESS COMPLETE"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "p",
            {
              className: `text-base font-mono ${status === "cancelled" ? "text-red-400/80" : "text-zinc-400"}`,
              children: message
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: `mt-8 text-sm font-mono flex flex-col items-center gap-2 ${status === "cancelled" ? "text-red-500/50" : "text-emerald-500/50"}`,
              children: logStream.slice(-3).map((log, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: status === "thinking" ? "animate-pulse" : "", children: log }, idx))
            }
          )
        ] }) })
      ]
    }
  ) }) });
}
const StatBox = ({
  icon: Icon,
  label,
  value,
  total,
  textValue,
  iconColor = "text-zinc-500",
  valueColor = "text-white",
  animate = false
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "div",
  {
    className: `flex flex-col justify-center p-5 rounded-xl border ${animate ? "border-emerald-500/20 bg-emerald-500/5" : "bg-black/40 border-white/5"}`,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: `w-4 h-4 ${iconColor}` }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: `text-xs font-bold tracking-widest uppercase ${iconColor.replace("text-", "text-").replace("500", "500/70")}`,
            children: label
          }
        )
      ] }),
      textValue ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: `text-4xl font-black font-mono ${valueColor} ${animate ? "animate-pulse" : ""}`,
          children: textValue
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          motion.span,
          {
            initial: { opacity: 0, y: -5 },
            animate: { opacity: 1, y: 0 },
            className: `text-4xl font-black ${valueColor}`,
            children: value
          },
          value
        ),
        total !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-lg font-mono text-zinc-500", children: [
          "/ ",
          total
        ] })
      ] })
    ]
  }
);
export {
  OracleWidget as default
};
