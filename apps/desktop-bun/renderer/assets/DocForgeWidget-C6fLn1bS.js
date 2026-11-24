import { r as reactExports, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, cK as RiFilePpt2Line, cL as RiTableLine, w as RiCloseLine, _ as RiDownload2Line, cM as forgePresentation, cN as forgeSpreadsheet } from "./index-CYaMQ3cR.js";
const SLIDE_PRESETS = [
  {
    title: "Nexus Neural OS 9.1 Architecture",
    topic: "High-Performance Local-First Desktop Agentic OS",
    slides: [
      {
        title: "NEXUS NEURAL OS",
        subtitle: "Next-Generation Autonomous Desktop Computing",
        bullets: [
          "Direct Electron IPC Native Bridge with zero-latency threading",
          "Gemini 3.1 Live API real-time WebRTC audio streaming",
          "Hardware-accelerated Three.js / R3F neural visualization"
        ],
        footer: "CONFIDENTIAL • FOR ARCHITECT EYES ONLY"
      },
      {
        title: "CORE SUBSYSTEMS",
        subtitle: "Decoupled Microservice Topology",
        bullets: [
          "Telekinesis: Coordinate-based OS window teleportation & macros",
          "ScreenPeeler: Sub-pixel rectangular OCR vision grounding",
          "Mobile Bridge: ADB wireless command transport on port 17173"
        ],
        footer: "NEXUS ENGINE SUBSYSTEMS"
      },
      {
        title: "PERFORMANCE GUARANTEES",
        subtitle: "Zero Garbage Collection Stutters",
        bullets: [
          "Memory pre-allocation via useMemo vector lerping",
          "Cap DPR scaling to prevent GPU thermal throttling",
          "Direct Win32 kernel integration for background tasks"
        ],
        footer: "HARDWARE LEVEL OPTIMIZATIONS"
      }
    ]
  },
  {
    title: "Q3 Autonomous Agent Fleet Roadmap",
    topic: "Distributed Agentic Workers & Tool Swarms",
    slides: [
      {
        title: "FLEET SCALING PROTOCOL",
        subtitle: "Autonomous Worker Swarms",
        bullets: [
          "Subagent isolation with ephemeral sandbox execution",
          "Bi-directional messaging bus with reactive wakeups",
          "Auto-pruning process lifecycles on task completion"
        ],
        footer: "AGENT FLEET PROTOCOL"
      },
      {
        title: "DEPLOYMENT MILESTONES",
        subtitle: "Desktop & Mobile Convergence",
        bullets: [
          "Nexus Desktop (Electron + Vite) packaged installer",
          "Nexus-X C++/Rust core engine integration",
          "Cross-device clipboard and APK hot-reloading"
        ],
        footer: "Q3 MILESTONES"
      }
    ]
  }
];
const SPREADSHEET_PRESETS = [
  {
    title: "Nexus System Telemetry & Latency Matrix",
    columns: [
      { key: "subsystem", label: "SUBSYSTEM" },
      { key: "latency", label: "LATENCY (MS)" },
      { key: "memory", label: "MEM WORKING SET" },
      { key: "status", label: "HEALTH STATUS" }
    ],
    rows: [
      { subsystem: "WebRTC Audio Pipeline", latency: "42ms", memory: "185MB", status: "OPTIMAL" },
      { subsystem: "ScreenPeeler Multimodal OCR", latency: "180ms", memory: "92MB", status: "READY" },
      { subsystem: "Mobile Command Bridge", latency: "12ms", memory: "48MB", status: "CONNECTED" },
      { subsystem: "Permanent Vector Memory", latency: "65ms", memory: "210MB", status: "INDEXED" },
      { subsystem: "Deep Research Crawler", latency: "450ms", memory: "320MB", status: "STANDBY" }
    ]
  },
  {
    title: "Model Inference & Token Expenditure Q3",
    columns: [
      { key: "model", label: "MODEL DEPLOYED" },
      { key: "requests", label: "INVOCATIONS" },
      { key: "avgTokens", label: "AVG TOKENS/CALL" },
      { key: "costEfficiency", label: "COST EFFICIENCY" }
    ],
    rows: [
      { model: "Gemini 2.5 Flash Live", requests: "14,200", avgTokens: "1,450", costEfficiency: "99.4%" },
      { model: "Groq Llama-3-70B", requests: "8,950", avgTokens: "820", costEfficiency: "98.8%" },
      { model: "Tavily Web Search", requests: "3,120", avgTokens: "3,200", costEfficiency: "95.1%" },
      { model: "Local Face-API MobileNet", requests: "26,400", avgTokens: "0 (LOCAL)", costEfficiency: "100%" }
    ]
  }
];
function DocForgeWidget() {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [activeTab, setActiveTab] = reactExports.useState("presentation");
  const [selectedSlidePreset, setSelectedSlidePreset] = reactExports.useState(SLIDE_PRESETS[0]);
  const [selectedSheetPreset, setSelectedSheetPreset] = reactExports.useState(SPREADSHEET_PRESETS[0]);
  const [activeSlideIdx, setActiveSlideIdx] = reactExports.useState(0);
  const [isForging, setIsForging] = reactExports.useState(false);
  const [statusMsg, setStatusMsg] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const handleOpen = (e) => {
      setIsVisible(true);
      if (e.detail?.type === "spreadsheet") setActiveTab("spreadsheet");
      else setActiveTab("presentation");
    };
    window.addEventListener("show-doc-forge", handleOpen);
    return () => window.removeEventListener("show-doc-forge", handleOpen);
  }, []);
  const handleForgePresentation = async () => {
    setIsForging(true);
    setStatusMsg("FORGING PRESENTATION DECK...");
    const res = await forgePresentation(
      selectedSlidePreset.title,
      selectedSlidePreset.topic,
      selectedSlidePreset.slides,
      true
    );
    setIsForging(false);
    setStatusMsg(res.includes("📊") ? "PRESENTATION FORGED & LAUNCHED" : "FORGE FAILED");
    setTimeout(() => setStatusMsg(null), 4e3);
  };
  const handleForgeSpreadsheet = async () => {
    setIsForging(true);
    setStatusMsg("FORGING CSV SPREADSHEET...");
    const res = await forgeSpreadsheet(selectedSheetPreset, true);
    setIsForging(false);
    setStatusMsg(res.includes("📈") ? "SPREADSHEET FORGED & LAUNCHED" : "FORGE FAILED");
    setTimeout(() => setStatusMsg(null), 4e3);
  };
  if (!isVisible) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[9700] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { opacity: 0, scale: 0.94, y: 15 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.94, y: 15 },
      className: "relative w-full max-w-4xl bg-zinc-950/85 border border-white/10 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden flex flex-col",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400", children: activeTab === "presentation" ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiFilePpt2Line, { size: 18 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiTableLine, { size: 18 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-white text-sm font-bold tracking-wide uppercase", children: "Autonomous Document Forge" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-mono text-zinc-400 tracking-widest uppercase", children: "Instant Slide Decks • Structured Spreadsheets • Direct OS Export" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            statusMsg && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono px-3 py-1 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300 animate-pulse", children: statusMsg }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setIsVisible(false),
                className: "p-2 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 20 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center px-6 pt-4 gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setActiveTab("presentation"),
              className: `px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase transition flex items-center gap-2 border ${activeTab === "presentation" ? "bg-purple-500/15 border-purple-500/40 text-purple-300 font-bold" : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiFilePpt2Line, { size: 14 }),
                "Slide Presentations (",
                SLIDE_PRESETS.length,
                ")"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setActiveTab("spreadsheet"),
              className: `px-4 py-2 rounded-lg text-xs font-mono tracking-wider uppercase transition flex items-center gap-2 border ${activeTab === "spreadsheet" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold" : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiTableLine, { size: 14 }),
                "Data Spreadsheets (",
                SPREADSHEET_PRESETS.length,
                ")"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: activeTab === "presentation" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 gap-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-5 flex flex-col gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest", children: "Available Presentation Blueprints" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-small", children: SLIDE_PRESETS.map((preset, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                onClick: () => {
                  setSelectedSlidePreset(preset);
                  setActiveSlideIdx(0);
                },
                className: `p-3 rounded-xl border cursor-pointer transition ${selectedSlidePreset.title === preset.title ? "bg-purple-950/40 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]" : "bg-zinc-900/40 border-white/5 hover:border-white/20"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-semibold text-white truncate", children: preset.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 truncate font-sans mt-0.5", children: preset.topic }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-mono text-purple-400 mt-2 block", children: [
                    preset.slides.length,
                    " SLIDES GENERATED"
                  ] })
                ]
              },
              idx
            )) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                disabled: isForging,
                onClick: handleForgePresentation,
                className: "mt-4 w-full py-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-black font-mono font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(168,85,247,0.3)] disabled:opacity-50",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiDownload2Line, { size: 16 }),
                  "Forge & Launch Slides (.html)"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-7 flex flex-col justify-between p-6 rounded-xl bg-zinc-900/70 border border-white/10 min-h-[300px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-emerald-400 tracking-widest uppercase", children: [
                  "SLIDE ",
                  activeSlideIdx + 1,
                  " OF ",
                  selectedSlidePreset.slides.length
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1.5", children: selectedSlidePreset.slides.map((_, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setActiveSlideIdx(i),
                    className: `w-2.5 h-2.5 rounded-full transition ${activeSlideIdx === i ? "bg-purple-400 scale-110" : "bg-zinc-700"}`
                  },
                  i
                )) })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-bold text-white mb-1", children: selectedSlidePreset.slides[activeSlideIdx].title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 mb-4 font-sans", children: selectedSlidePreset.slides[activeSlideIdx].subtitle }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: selectedSlidePreset.slides[activeSlideIdx].bullets.map((bullet, bi) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-xs text-zinc-300 flex items-center gap-2 font-sans", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" }),
                bullet
              ] }, bi)) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-zinc-500", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: selectedSlidePreset.slides[activeSlideIdx].footer }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "STANDALONE HTML DECK" })
            ] })
          ] })
        ] }) : (
          /* Spreadsheet View */
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 gap-6", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-5 flex flex-col gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest", children: "Spreadsheet Blueprints" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-small", children: SPREADSHEET_PRESETS.map((sheet, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  onClick: () => setSelectedSheetPreset(sheet),
                  className: `p-3 rounded-xl border cursor-pointer transition ${selectedSheetPreset.title === sheet.title ? "bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "bg-zinc-900/40 border-white/5 hover:border-white/20"}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-semibold text-white truncate", children: sheet.title }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-mono text-emerald-400 mt-2 block", children: [
                      sheet.rows.length,
                      " ROWS • ",
                      sheet.columns.length,
                      " COLUMNS"
                    ] })
                  ]
                },
                idx
              )) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  disabled: isForging,
                  onClick: handleForgeSpreadsheet,
                  className: "mt-4 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.3)] disabled:opacity-50",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiDownload2Line, { size: 16 }),
                    "Forge & Open Spreadsheet (.csv)"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-7 flex flex-col p-4 rounded-xl bg-zinc-900/70 border border-white/10 overflow-hidden", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400 tracking-widest uppercase mb-3", children: "Structured Data Matrix Preview" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto scrollbar-small", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left text-xs", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-white/10 text-zinc-400 font-mono text-[10px]", children: selectedSheetPreset.columns.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "pb-2 px-2 uppercase", children: c.label }, c.key)) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-white/5", children: selectedSheetPreset.rows.map((row, ri) => /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "hover:bg-white/[0.02]", children: selectedSheetPreset.columns.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-2 text-zinc-300 font-mono text-[11px]", children: row[c.key] }, c.key)) }, ri)) })
              ] }) })
            ] })
          ] })
        ) })
      ]
    }
  ) }) });
}
export {
  DocForgeWidget as default
};
