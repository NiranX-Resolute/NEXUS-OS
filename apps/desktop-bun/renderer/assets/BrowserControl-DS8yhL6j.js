import { r as reactExports, bv as getSkyvernConfig, bw as getSkyvernStatus, j as jsxRuntimeExports, bx as RiEyeLine, by as RiComputerLine, n as RiGlobalLine, bz as RiSettings3Line, w as RiCloseLine, a4 as RiStopCircleLine, bA as RiLoader4Line, H as RiPlayFill, bB as RiCrosshairLine, bC as RiCursorLine, a5 as RiRefreshLine, bD as startSkyvernTask, bE as stopSkyvernTask, bF as executeSkyvernVisualClick, bG as captureScreenPreview, bH as saveSkyvernConfig, bI as RiSearchEyeLine, o as RiKeyboardLine, aU as RiCompass3Line, G as RiAddLine, br as RiMagicLine, bJ as RiArrowLeftLine, bK as RiArrowRightLine, bL as RiHome4Line, bM as RiLockLine, bN as RiStarFill, bO as RiStarLine, z as RiCheckLine, D as RiFileCopyLine, ak as RiExternalLinkLine, bP as RiZoomOutLine, bQ as RiZoomInLine, bR as RiBookOpenLine, aY as RiCpuLine, Z as RiHistoryLine, aw as RiDeleteBin6Line, bS as RiRobotLine, a8 as RiSendPlane2Line, ac as executePuterChat } from "./index-CYaMQ3cR.js";
const QUICK_TEMPLATES = [
  {
    label: "Search & Click",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSearchEyeLine, {}),
    goal: 'Open browser, search Google for "Skyvern AI browser workflows", and click on the GitHub repository link.'
  },
  {
    label: "GitHub Star",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RiGlobalLine, {}),
    goal: "Navigate to https://github.com/Skyvern-AI/skyvern and click the Star repository button."
  },
  {
    label: "Form Fill",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RiKeyboardLine, {}),
    goal: "Locate the text input on screen, click it to focus, type my query, and press Enter to submit."
  },
  {
    label: "Visual Click",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCrosshairLine, {}),
    goal: "Find the download button on screen and click it."
  },
  {
    label: "Read & Scroll",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCompass3Line, {}),
    goal: "Scroll down through the page to find the documentation section and click Getting Started."
  }
];
function SkyvernScreenStudio() {
  const [goal, setGoal] = reactExports.useState("");
  const [mode, setMode] = reactExports.useState("desktop");
  const [startUrl, setStartUrl] = reactExports.useState("");
  const [taskState, setTaskState] = reactExports.useState(null);
  const [steps, setSteps] = reactExports.useState([]);
  const [isStarting, setIsStarting] = reactExports.useState(false);
  const [visualClickTarget, setVisualClickTarget] = reactExports.useState("");
  const [isVisualClicking, setIsVisualClicking] = reactExports.useState(false);
  const [visualClickMsg, setVisualClickMsg] = reactExports.useState("");
  const [showConfig, setShowConfig] = reactExports.useState(false);
  const [config, setConfig] = reactExports.useState({
    skyvernApiUrl: "http://localhost:8000",
    geminiModel: "gemini-3.8-flash",
    maxSteps: 15,
    stepDelayMs: 900,
    smoothMouse: true
  });
  const [screenPreview, setScreenPreview] = reactExports.useState("");
  const [isCapturingPreview, setIsCapturingPreview] = reactExports.useState(false);
  const stepsScrollRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    getSkyvernConfig().then(setConfig);
    getSkyvernStatus().then((status) => {
      if (status && "taskId" in status) {
        setTaskState(status);
        setSteps(status.steps || []);
      }
    });
    const handleStepUpdate = (_event, step) => {
      setSteps((prev) => {
        const next = [...prev, step];
        return next;
      });
      if (step.screenshotDataUrl) {
        setScreenPreview(step.screenshotDataUrl);
      }
    };
    const handleTaskUpdate = (_event, task) => {
      setTaskState(task);
      if (task.steps && task.steps.length > 0) {
        setSteps(task.steps);
      }
      if (task.lastScreenshot) {
        setScreenPreview(task.lastScreenshot);
      }
    };
    const removeStepListener = window.electron.ipcRenderer.on("skyvern:step-update", handleStepUpdate);
    const removeTaskListener = window.electron.ipcRenderer.on("skyvern:task-update", handleTaskUpdate);
    return () => {
      removeStepListener?.();
      removeTaskListener?.();
    };
  }, []);
  reactExports.useEffect(() => {
    stepsScrollRef.current?.scrollTo({ top: stepsScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [steps]);
  const handleStartTask = async (e) => {
    if (e) e.preventDefault();
    const cleanGoal = goal.trim();
    if (!cleanGoal || isStarting || taskState?.status === "running") return;
    setIsStarting(true);
    setSteps([]);
    try {
      const state = await startSkyvernTask(cleanGoal, {
        mode,
        startUrl: startUrl.trim() || void 0,
        maxSteps: config.maxSteps
      });
      setTaskState(state);
    } finally {
      setIsStarting(false);
    }
  };
  const handleStopTask = async () => {
    await stopSkyvernTask();
    if (taskState) {
      setTaskState({ ...taskState, status: "cancelled" });
    }
  };
  const handleInstantVisualClick = async (e) => {
    e.preventDefault();
    const target = visualClickTarget.trim();
    if (!target || isVisualClicking) return;
    setIsVisualClicking(true);
    setVisualClickMsg("Locating element on screen with vision AI...");
    try {
      const res = await executeSkyvernVisualClick(target);
      setVisualClickMsg(res.message);
      if (res.success) {
        setVisualClickTarget("");
      }
    } catch (err) {
      setVisualClickMsg(`Error: ${err?.message || "Visual click failed"}`);
    } finally {
      setIsVisualClicking(false);
    }
  };
  const handleRefreshPreview = async () => {
    setIsCapturingPreview(true);
    try {
      const res = await captureScreenPreview();
      if (res.dataUrl) setScreenPreview(res.dataUrl);
    } finally {
      setIsCapturingPreview(false);
    }
  };
  const handleSaveConfig = async (newCfg) => {
    const updated = await saveSkyvernConfig(newCfg);
    setConfig(updated);
  };
  const isRunning = taskState?.status === "running";
  const latestStep = steps[steps.length - 1];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full w-full flex-col gap-3 overflow-hidden text-zinc-100", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 flex-wrap items-center justify-between gap-3 border border-emerald-400/20 bg-black/40 p-3 backdrop-blur-xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.15)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiEyeLine, { size: 22, className: isRunning ? "animate-pulse text-emerald-400" : "" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-black uppercase tracking-[0.16em] text-white", children: "Nexus Screen Agent" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-300", children: "Vision Agent" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[9px] font-medium text-zinc-400", children: "Autonomous computer & browser workflow automation driven by Gemini multimodal vision" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex rounded-lg border border-white/10 bg-black/50 p-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setMode("desktop"),
              className: `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition ${mode === "desktop" ? "border border-emerald-400/30 bg-emerald-400/20 text-emerald-200" : "text-zinc-500 hover:text-zinc-300"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiComputerLine, {}),
                " Desktop OS"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setMode("browser"),
              className: `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition ${mode === "browser" ? "border border-cyan-400/30 bg-cyan-400/20 text-cyan-200" : "text-zinc-500 hover:text-zinc-300"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiGlobalLine, {}),
                " Browser Web"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: `flex items-center gap-2 rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${isRunning ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300 animate-pulse" : taskState?.status === "completed" ? "border-green-400/40 bg-green-400/15 text-green-300" : taskState?.status === "failed" ? "border-red-400/40 bg-red-400/15 text-red-300" : "border-white/10 bg-white/[0.04] text-zinc-400"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `h-2 w-2 rounded-full ${isRunning ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : taskState?.status === "completed" ? "bg-green-400" : taskState?.status === "failed" ? "bg-red-400" : "bg-zinc-600"}`
                }
              ),
              isRunning ? `Running (${taskState?.currentStep || steps.length}/${config.maxSteps})` : taskState?.status || "Idle"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowConfig(!showConfig),
            className: "grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-emerald-400/40 hover:text-emerald-300",
            title: "Screen Agent Settings",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSettings3Line, {})
          }
        )
      ] })
    ] }),
    showConfig && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "shrink-0 rounded-lg border border-white/10 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/10 pb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-emerald-400", children: "Screen Engine Configuration" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setShowConfig(false),
            className: "text-zinc-500 hover:text-white",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, {})
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[8px] font-bold uppercase tracking-widest text-zinc-400", children: "Vision LLM Model" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: config.geminiModel,
              onChange: (e) => handleSaveConfig({ geminiModel: e.target.value }),
              className: "mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[8px] font-bold uppercase tracking-widest text-zinc-400", children: "Skyvern API Endpoint" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: config.skyvernApiUrl,
              onChange: (e) => handleSaveConfig({ skyvernApiUrl: e.target.value }),
              placeholder: "http://localhost:8000",
              className: "mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[8px] font-bold uppercase tracking-widest text-zinc-400", children: "Max Autonomous Steps" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              value: config.maxSteps,
              onChange: (e) => handleSaveConfig({ maxSteps: parseInt(e.target.value) || 15 }),
              className: "mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[8px] font-bold uppercase tracking-widest text-zinc-400", children: "Step Settle Delay (ms)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              value: config.stepDelayMs,
              onChange: (e) => handleSaveConfig({ stepDelayMs: parseInt(e.target.value) || 900 }),
              className: "mt-1 w-full rounded border border-white/10 bg-black/50 px-2 py-1 text-xs font-mono text-zinc-200 outline-none focus:border-emerald-400"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-7", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "form",
          {
            onSubmit: handleStartTask,
            className: "shrink-0 rounded-lg border border-white/10 bg-black/40 p-3 backdrop-blur-xl",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pb-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-zinc-400", children: "Workflow Goal / Directive" }),
                mode === "browser" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] uppercase tracking-wider text-zinc-500", children: "Start URL:" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "input",
                    {
                      type: "text",
                      value: startUrl,
                      onChange: (e) => setStartUrl(e.target.value),
                      placeholder: "https://...",
                      className: "h-5 rounded border border-white/10 bg-black/60 px-1.5 text-[9px] font-mono text-cyan-300 outline-none focus:border-cyan-400"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  rows: 2,
                  value: goal,
                  onChange: (e) => setGoal(e.target.value),
                  placeholder: 'e.g., "Go to Google, search for weather forecast, click the first link, and summarize"',
                  className: "w-full resize-none rounded-lg border border-white/10 bg-black/60 p-2.5 text-xs font-medium text-white placeholder-zinc-600 outline-none focus:border-emerald-400/50"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: QUICK_TEMPLATES.map((tmpl) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => setGoal(tmpl.goal),
                  className: "flex items-center gap-1 rounded border border-white/5 bg-white/[0.03] px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-zinc-400 transition hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:text-emerald-200",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-400", children: tmpl.icon }),
                    tmpl.label
                  ]
                },
                tmpl.label
              )) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 flex items-center justify-between border-t border-white/5 pt-2.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-medium text-zinc-500", children: "Press Launch to engage autonomous vision-guided loop." }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: isRunning ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: handleStopTask,
                    className: "flex items-center gap-1.5 rounded-lg border border-red-400/30 bg-red-400/15 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-red-200 transition hover:bg-red-400/30",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiStopCircleLine, { size: 14 }),
                      " Abort Agent"
                    ]
                  }
                ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "submit",
                    disabled: !goal.trim() || isStarting,
                    className: "flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/20 px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-30",
                    children: [
                      isStarting ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiLoader4Line, { className: "animate-spin", size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlayFill, { size: 14 }),
                      "Launch Screen Agent"
                    ]
                  }
                ) })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "form",
          {
            onSubmit: handleInstantVisualClick,
            className: "shrink-0 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-xl",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiCrosshairLine, { className: "text-emerald-400 shrink-0", size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "text",
                  value: visualClickTarget,
                  onChange: (e) => setVisualClickTarget(e.target.value),
                  placeholder: 'Instant Visual Click: e.g. "blue login button", "profile avatar", "search input"',
                  className: "flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "submit",
                  disabled: !visualClickTarget.trim() || isVisualClicking,
                  className: "flex items-center gap-1 rounded border border-cyan-400/30 bg-cyan-400/15 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-cyan-200 transition hover:bg-cyan-400 hover:text-black disabled:opacity-30",
                  children: [
                    isVisualClicking ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiLoader4Line, { className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiCursorLine, {}),
                    "Click Target"
                  ]
                }
              )
            ]
          }
        ),
        visualClickMsg && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "shrink-0 px-2 text-[9px] font-mono text-cyan-300/80", children: visualClickMsg }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-black/40 p-3 backdrop-blur-xl", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex shrink-0 items-center justify-between border-b border-white/10 pb-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-black uppercase tracking-widest text-zinc-400", children: [
              "Action Execution Feed (",
              steps.length,
              " Steps)"
            ] }),
            isRunning && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-emerald-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiLoader4Line, { className: "animate-spin" }),
              " Observing screen"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              ref: stepsScrollRef,
              className: "min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-small",
              children: steps.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-600", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiComputerLine, { size: 28 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-black uppercase tracking-widest", children: "No steps executed yet" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "max-w-xs text-[9px] text-zinc-600", children: "Define a goal above and click Launch Screen Agent. The vision agent will inspect your screen, determine coordinates, and execute mouse & keyboard actions." })
              ] }) : steps.map((st, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: `rounded-lg border p-2.5 transition ${st.action === "COMPLETE" ? "border-green-400/30 bg-green-400/10" : st.action === "FAIL" || !st.success ? "border-red-400/30 bg-red-400/10" : "border-white/5 bg-white/[0.025] hover:border-emerald-400/20"}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-400", children: [
                          "Step ",
                          st.stepIndex
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "span",
                          {
                            className: `rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${st.action === "CLICK" || st.action === "DOUBLE_CLICK" ? "bg-emerald-400/20 text-emerald-300" : st.action === "TYPE" ? "bg-cyan-400/20 text-cyan-300" : st.action === "PRESS" ? "bg-amber-400/20 text-amber-300" : st.action === "SCROLL" ? "bg-purple-400/20 text-purple-300" : st.action === "COMPLETE" ? "bg-green-400/20 text-green-300" : "bg-zinc-800 text-zinc-300"}`,
                            children: st.action
                          }
                        ),
                        st.coordinate && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[8px] font-mono text-zinc-500", children: [
                          "(",
                          st.coordinate.x,
                          ", ",
                          st.coordinate.y,
                          ")"
                        ] })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[7px] font-mono text-zinc-600", children: new Date(st.timestamp).toLocaleTimeString() })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-[10px] font-semibold leading-relaxed text-zinc-300", children: st.thought }),
                    st.text && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 rounded bg-black/40 px-2 py-0.5 text-[9px] font-mono text-cyan-300", children: [
                      'typed: "',
                      st.text,
                      '"'
                    ] }),
                    st.error && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-[8px] font-mono text-red-300", children: [
                      "Error: ",
                      st.error
                    ] })
                  ]
                },
                `${st.timestamp}-${idx}`
              ))
            }
          ),
          taskState?.finalResult && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2.5 shrink-0 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold text-emerald-300", children: "Final Outcome: " }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-200", children: taskState.finalResult })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "col-span-12 flex min-h-0 flex-col gap-3 lg:col-span-5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-h-0 flex-1 flex-col rounded-lg border border-white/10 bg-black/40 p-3 backdrop-blur-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex shrink-0 items-center justify-between border-b border-white/10 pb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-black uppercase tracking-widest text-zinc-400", children: "Visual Screen Observer" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: handleRefreshPreview,
              disabled: isCapturingPreview,
              className: "flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { className: isCapturingPreview ? "animate-spin" : "" }),
                " Capture Now"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative min-h-0 flex-1 overflow-hidden rounded-lg border border-white/5 bg-zinc-950/60", children: screenPreview ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-full w-full", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: screenPreview,
              alt: "Screen Observation",
              className: "h-full w-full object-contain"
            }
          ),
          latestStep?.coordinate && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2",
              style: {
                left: `${latestStep.coordinate.x / 1e3 * 100}%`,
                top: `${latestStep.coordinate.y / 1e3 * 100}%`
              },
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center justify-center", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-6 w-6 rounded-full border-2 border-emerald-400 shadow-[0_0_15px_#34d399] animate-ping" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute h-4 w-4 rounded-full border border-emerald-300 bg-emerald-400/40" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute h-1.5 w-1.5 rounded-full bg-emerald-200" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "absolute top-4 left-4 whitespace-nowrap rounded bg-black/80 px-1 py-0.5 text-[7px] font-mono font-bold text-emerald-300 border border-emerald-400/40", children: [
                  "(",
                  latestStep.coordinate.x,
                  ", ",
                  latestStep.coordinate.y,
                  ")"
                ] })
              ] })
            }
          )
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-zinc-600", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiEyeLine, { size: 32 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-black uppercase tracking-widest", children: "No Screen Capture Loaded" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] text-zinc-600", children: 'Click "Capture Now" or launch a Skyvern task to view visual telemetry and target coordinates.' })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2.5 shrink-0 grid grid-cols-2 gap-2 text-[9px] font-mono", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-white/5 bg-white/[0.02] p-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 block text-[7px] uppercase tracking-widest font-sans", children: "Active Model" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-400 font-bold", children: config.geminiModel })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-white/5 bg-white/[0.02] p-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 block text-[7px] uppercase tracking-widest font-sans", children: "Latest Action" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-cyan-400 font-bold", children: latestStep ? `${latestStep.action} (Step ${latestStep.stepIndex})` : "None" })
          ] })
        ] })
      ] }) })
    ] })
  ] });
}
const SEARCH_ENGINES = {
  google: {
    name: "Google",
    url: "https://www.google.com/search?q=",
    icon: "🔍",
    placeholder: "Search Google or type URL"
  },
  duckduckgo: {
    name: "DuckDuckGo",
    url: "https://duckduckgo.com/?q=",
    icon: "🦆",
    placeholder: "Search private DuckDuckGo"
  },
  bing: {
    name: "Bing",
    url: "https://www.bing.com/search?q=",
    icon: "🌊",
    placeholder: "Search Microsoft Bing"
  },
  brave: {
    name: "Brave",
    url: "https://search.brave.com/search?q=",
    icon: "🦁",
    placeholder: "Search Brave"
  },
  youtube: {
    name: "YouTube",
    url: "https://www.youtube.com/results?search_query=",
    icon: "▶️",
    placeholder: "Search YouTube videos"
  },
  github: {
    name: "GitHub",
    url: "https://github.com/search?q=",
    icon: "🐙",
    placeholder: "Search GitHub repos"
  },
  wikipedia: {
    name: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Special:Search?search=",
    icon: "📚",
    placeholder: "Search encyclopedia"
  }
};
const DEFAULT_BOOKMARKS = [
  { id: "bm-google", title: "Google", url: "https://www.google.com", icon: "🔍" },
  { id: "bm-youtube", title: "YouTube", url: "https://www.youtube.com", icon: "▶️" },
  { id: "bm-github", title: "GitHub", url: "https://github.com", icon: "🐙" },
  { id: "bm-chatgpt", title: "ChatGPT", url: "https://chatgpt.com", icon: "🤖" },
  { id: "bm-claude", title: "Claude", url: "https://claude.ai", icon: "🧠" },
  { id: "bm-reddit", title: "Reddit", url: "https://www.reddit.com", icon: "💬" },
  { id: "bm-wiki", title: "Wikipedia", url: "https://www.wikipedia.org", icon: "📚" },
  { id: "bm-puter", title: "Puter Cloud", url: "https://puter.com", icon: "🌐" },
  { id: "bm-hn", title: "Hacker News", url: "https://news.ycombinator.com", icon: "⚡" },
  { id: "bm-x", title: "X / Twitter", url: "https://x.com", icon: "𝕏" }
];
const SPEED_DIAL_ITEMS = [
  {
    title: "Google Search",
    url: "https://www.google.com",
    icon: "🔍",
    category: "Search & Explore",
    desc: "Web, research, maps and tools"
  },
  {
    title: "YouTube Music & Videos",
    url: "https://www.youtube.com",
    icon: "▶️",
    category: "Media",
    desc: "Podcasts, video streams and tutorials"
  },
  {
    title: "GitHub Repositories",
    url: "https://github.com",
    icon: "🐙",
    category: "Developer",
    desc: "Open source codebase, PRs and releases"
  },
  {
    title: "Puter Cloud & AI",
    url: "https://puter.com",
    icon: "🌐",
    category: "AI Cloud",
    desc: "Zero-friction sovereign AI cloud computing"
  },
  {
    title: "ChatGPT & OpenAI",
    url: "https://chatgpt.com",
    icon: "🤖",
    category: "AI Assistant",
    desc: "Conversations, code and reasoning"
  },
  {
    title: "Claude AI",
    url: "https://claude.ai",
    icon: "🧠",
    category: "AI Assistant",
    desc: "Anthropic deep thought & analysis"
  },
  {
    title: "Reddit Discussions",
    url: "https://www.reddit.com",
    icon: "💬",
    category: "Community",
    desc: "Tech news, discussions and trends"
  },
  {
    title: "Wikipedia Encyclopedia",
    url: "https://www.wikipedia.org",
    icon: "📚",
    category: "Knowledge",
    desc: "Universal free knowledge base"
  },
  {
    title: "Hacker News",
    url: "https://news.ycombinator.com",
    icon: "⚡",
    category: "Tech News",
    desc: "Silicon Valley & startup pulse"
  },
  {
    title: "arXiv AI Papers",
    url: "https://arxiv.org/list/cs.AI/recent",
    icon: "📄",
    category: "Research",
    desc: "Latest CS & Machine Learning preprints"
  },
  {
    title: "Hugging Face Hub",
    url: "https://huggingface.co",
    icon: "🤗",
    category: "Open Source AI",
    desc: "Open models, spaces and datasets"
  },
  {
    title: "X / Social Feed",
    url: "https://x.com",
    icon: "𝕏",
    category: "Real-time News",
    desc: "Breaking news, tech and updates"
  }
];
const normalizeInputToUrl = (input, engineKey) => {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "nexus://start" || trimmed === "home" || trimmed === "about:blank") {
    return "nexus://start";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/i.test(trimmed) || /^localhost(:[0-9]+)?(\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(:[0-9]+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  const engine = SEARCH_ENGINES[engineKey] || SEARCH_ENGINES.google;
  return `${engine.url}${encodeURIComponent(trimmed)}`;
};
function BrowserControlView({
  isSystemActive,
  isSystemStarting,
  isMicMuted,
  toggleSystem,
  toggleMic
}) {
  const [tabs, setTabs] = reactExports.useState(() => {
    try {
      const saved = localStorage.getItem("nexus_browser_open_tabs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
    }
    return [
      {
        id: "tab-1",
        title: "Nexus Start Portal",
        url: "nexus://start",
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        history: ["nexus://start"],
        historyIndex: 0
      }
    ];
  });
  const [activeTabId, setActiveTabId] = reactExports.useState(() => tabs[0]?.id || "tab-1");
  const [addressBarInput, setAddressBarInput] = reactExports.useState("nexus://start");
  const [searchEngine, setSearchEngine] = reactExports.useState("google");
  const [showEngineDropdown, setShowEngineDropdown] = reactExports.useState(false);
  const [zoomFactor, setZoomFactor] = reactExports.useState(1);
  const [copiedUrl, setCopiedUrl] = reactExports.useState(false);
  const [bookmarks, setBookmarks] = reactExports.useState(() => {
    try {
      const saved = localStorage.getItem("nexus_browser_bookmarks");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
    }
    return DEFAULT_BOOKMARKS;
  });
  const [historyList, setHistoryList] = reactExports.useState(() => {
    try {
      const saved = localStorage.getItem("nexus_browser_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
    }
    return [];
  });
  const [showBookmarksBar, setShowBookmarksBar] = reactExports.useState(true);
  const [activeMode, setActiveMode] = reactExports.useState("browser");
  const [showCopilot, setShowCopilot] = reactExports.useState(false);
  const [copilotLoading, setCopilotLoading] = reactExports.useState(false);
  const [copilotSummary, setCopilotSummary] = reactExports.useState("");
  const [copilotMessages, setCopilotMessages] = reactExports.useState([
    {
      id: "welcome",
      role: "assistant",
      text: "I am your Nexus Web Copilot powered by Puter AI. I can summarize any page, extract key points, answer questions about live content, or assist in browsing.",
      timestamp: Date.now()
    }
  ]);
  const [copilotInput, setCopilotInput] = reactExports.useState("");
  const [readerMode, setReaderMode] = reactExports.useState(false);
  const [readerContent, setReaderContent] = reactExports.useState("");
  const webviewRef = reactExports.useRef(null);
  const iframeRef = reactExports.useRef(null);
  const copilotChatRef = reactExports.useRef(null);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  reactExports.useEffect(() => {
    try {
      localStorage.setItem("nexus_browser_open_tabs", JSON.stringify(tabs));
    } catch {
    }
  }, [tabs]);
  reactExports.useEffect(() => {
    try {
      localStorage.setItem("nexus_browser_bookmarks", JSON.stringify(bookmarks));
    } catch {
    }
  }, [bookmarks]);
  reactExports.useEffect(() => {
    try {
      localStorage.setItem("nexus_browser_history", JSON.stringify(historyList.slice(0, 100)));
    } catch {
    }
  }, [historyList]);
  reactExports.useEffect(() => {
    if (activeTab) {
      setAddressBarInput(activeTab.url === "nexus://start" ? "" : activeTab.url);
    }
  }, [activeTab?.id, activeTab?.url]);
  const recordHistory = (url, title) => {
    if (!url || url === "nexus://start" || url.startsWith("about:")) return;
    setHistoryList((prev) => [
      { id: `h-${Date.now()}-${Math.random()}`, url, title: title || url, timestamp: Date.now() },
      ...prev.filter((item) => item.url !== url).slice(0, 99)
    ]);
  };
  const updateTab = (id, patch) => {
    setTabs(
      (prev) => prev.map((t) => {
        if (t.id === id) {
          const updated = { ...t, ...patch };
          if (patch.url && patch.url !== t.url) {
            const history = [...t.history.slice(0, t.historyIndex + 1), patch.url];
            updated.history = history;
            updated.historyIndex = history.length - 1;
            updated.canGoBack = updated.historyIndex > 0;
            updated.canGoForward = false;
          }
          return updated;
        }
        return t;
      })
    );
  };
  const handleNewTab = (initialUrl = "nexus://start") => {
    const newId = `tab-${Date.now()}`;
    const isStart = initialUrl === "nexus://start";
    const newTab = {
      id: newId,
      title: isStart ? "Nexus Start Portal" : "New Tab",
      url: initialUrl,
      isLoading: !isStart,
      canGoBack: false,
      canGoForward: false,
      history: [initialUrl],
      historyIndex: 0
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setReaderMode(false);
  };
  const handleCloseTab = (idToClose, e) => {
    e?.stopPropagation();
    if (tabs.length === 1) {
      updateTab(tabs[0].id, {
        title: "Nexus Start Portal",
        url: "nexus://start",
        favicon: void 0,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        history: ["nexus://start"],
        historyIndex: 0
      });
      setActiveTabId(tabs[0].id);
      return;
    }
    const nextTabs = tabs.filter((t) => t.id !== idToClose);
    setTabs(nextTabs);
    if (activeTabId === idToClose) {
      const idx = tabs.findIndex((t) => t.id === idToClose);
      const nextActive = nextTabs[Math.max(0, idx - 1)];
      if (nextActive) setActiveTabId(nextActive.id);
    }
  };
  const navigateTo = (urlOrQuery) => {
    const finalUrl = normalizeInputToUrl(urlOrQuery, searchEngine);
    setReaderMode(false);
    setReaderContent("");
    if (finalUrl === "nexus://start") {
      updateTab(activeTabId, {
        title: "Nexus Start Portal",
        url: "nexus://start",
        favicon: void 0,
        isLoading: false
      });
      return;
    }
    updateTab(activeTabId, {
      title: finalUrl.replace(/^https?:\/\//i, "").split("/")[0] || finalUrl,
      url: finalUrl,
      isLoading: true
    });
    const wv = webviewRef.current;
    if (wv && typeof wv.loadURL === "function") {
      try {
        wv.loadURL(finalUrl);
      } catch {
      }
    }
  };
  const handleAddressSubmit = (e) => {
    e.preventDefault();
    if (!addressBarInput.trim()) {
      navigateTo("nexus://start");
      return;
    }
    navigateTo(addressBarInput);
  };
  const handleGoBack = () => {
    const wv = webviewRef.current;
    if (wv && typeof wv.goBack === "function" && wv.canGoBack?.()) {
      wv.goBack();
      return;
    }
    if (activeTab && activeTab.historyIndex > 0) {
      const newIndex = activeTab.historyIndex - 1;
      const prevUrl = activeTab.history[newIndex];
      updateTab(activeTabId, {
        url: prevUrl,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: true
      });
    }
  };
  const handleGoForward = () => {
    const wv = webviewRef.current;
    if (wv && typeof wv.goForward === "function" && wv.canGoForward?.()) {
      wv.goForward();
      return;
    }
    if (activeTab && activeTab.historyIndex < activeTab.history.length - 1) {
      const newIndex = activeTab.historyIndex + 1;
      const nextUrl = activeTab.history[newIndex];
      updateTab(activeTabId, {
        url: nextUrl,
        historyIndex: newIndex,
        canGoBack: true,
        canGoForward: newIndex < activeTab.history.length - 1
      });
    }
  };
  const handleReloadOrStop = () => {
    const wv = webviewRef.current;
    if (activeTab.isLoading) {
      if (wv && typeof wv.stop === "function") wv.stop();
      updateTab(activeTabId, { isLoading: false });
    } else {
      if (wv && typeof wv.reload === "function") {
        wv.reload();
      } else {
        navigateTo(activeTab.url);
      }
      updateTab(activeTabId, { isLoading: true });
    }
  };
  const handleZoom = (delta) => {
    const nextZoom = Math.min(2, Math.max(0.5, Number((zoomFactor + delta).toFixed(2))));
    setZoomFactor(nextZoom);
    const wv = webviewRef.current;
    if (wv && typeof wv.setZoomFactor === "function") {
      wv.setZoomFactor(nextZoom);
    }
  };
  const isBookmarked = bookmarks.some((b) => b.url === activeTab?.url);
  const handleToggleBookmark = () => {
    if (!activeTab || activeTab.url === "nexus://start") return;
    if (isBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.url !== activeTab.url));
    } else {
      const newBm = {
        id: `bm-${Date.now()}`,
        title: activeTab.title || activeTab.url,
        url: activeTab.url,
        icon: "🔖"
      };
      setBookmarks((prev) => [...prev, newBm]);
    }
  };
  const handleCopyUrl = async () => {
    if (!activeTab || !activeTab.url) return;
    try {
      await navigator.clipboard.writeText(activeTab.url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2e3);
    } catch {
    }
  };
  const handleOpenExternal = async () => {
    if (!activeTab || !activeTab.url || activeTab.url === "nexus://start") return;
    try {
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("open-external-url", activeTab.url);
      } else {
        window.open(activeTab.url, "_blank");
      }
    } catch {
      window.open(activeTab.url, "_blank");
    }
  };
  reactExports.useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const onStartLoading = () => {
      updateTab(activeTabId, { isLoading: true });
    };
    const onStopLoading = () => {
      updateTab(activeTabId, {
        isLoading: false,
        canGoBack: wv.canGoBack ? wv.canGoBack() : false,
        canGoForward: wv.canGoForward ? wv.canGoForward() : false
      });
    };
    const onNavigate = (e) => {
      const currentUrl = e.url || "";
      if (currentUrl && currentUrl !== "about:blank") {
        updateTab(activeTabId, {
          url: currentUrl,
          canGoBack: wv.canGoBack ? wv.canGoBack() : false,
          canGoForward: wv.canGoForward ? wv.canGoForward() : false
        });
        recordHistory(currentUrl, activeTab?.title || currentUrl);
      }
    };
    const onTitleUpdated = (e) => {
      if (e.title) {
        updateTab(activeTabId, { title: e.title });
        if (activeTab?.url) recordHistory(activeTab.url, e.title);
      }
    };
    const onFaviconUpdated = (e) => {
      if (e.favicons && e.favicons.length > 0) {
        updateTab(activeTabId, { favicon: e.favicons[0] });
      }
    };
    const onNewWindow = (e) => {
      if (e.url) handleNewTab(e.url);
    };
    try {
      wv.addEventListener("did-start-loading", onStartLoading);
      wv.addEventListener("did-stop-loading", onStopLoading);
      wv.addEventListener("did-navigate", onNavigate);
      wv.addEventListener("did-navigate-in-page", onNavigate);
      wv.addEventListener("page-title-updated", onTitleUpdated);
      wv.addEventListener("page-favicon-updated", onFaviconUpdated);
      wv.addEventListener("new-window", onNewWindow);
    } catch {
    }
    return () => {
      try {
        wv.removeEventListener("did-start-loading", onStartLoading);
        wv.removeEventListener("did-stop-loading", onStopLoading);
        wv.removeEventListener("did-navigate", onNavigate);
        wv.removeEventListener("did-navigate-in-page", onNavigate);
        wv.removeEventListener("page-title-updated", onTitleUpdated);
        wv.removeEventListener("page-favicon-updated", onFaviconUpdated);
        wv.removeEventListener("new-window", onNewWindow);
      } catch {
      }
    };
  }, [activeTabId]);
  const extractPageText = async () => {
    const wv = webviewRef.current;
    if (wv && typeof wv.executeJavaScript === "function") {
      try {
        const text = await wv.executeJavaScript(`
          (() => {
            const el = document.querySelector('article') || document.querySelector('main') || document.body;
            return el ? el.innerText.slice(0, 15000) : '';
          })()
        `);
        if (typeof text === "string" && text.trim().length > 30) {
          return text.trim();
        }
      } catch {
      }
    }
    if (iframeRef.current) {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc?.body?.innerText) {
          return doc.body.innerText.slice(0, 15e3);
        }
      } catch {
      }
    }
    return `Page title: ${activeTab.title || "Untitled"}
URL: ${activeTab.url}`;
  };
  const handleSummarizePage = async () => {
    setShowCopilot(true);
    setCopilotLoading(true);
    setCopilotSummary("");
    try {
      const pageText = await extractPageText();
      const prompt = `You are Nexus AI Web Copilot. Provide a high-impact, professional executive summary of the following webpage content.

PAGE TITLE: ${activeTab.title}
PAGE URL: ${activeTab.url}

CONTENT:
${pageText.slice(0, 8e3)}

Format your answer with:
1. 🎯 Quick Snapshot (1-2 sentences)
2. 🔑 Key Takeaways (3-5 bullet points)
3. 💡 Recommended Action or Insight`;
      const reply = await executePuterChat({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      });
      setCopilotSummary(reply);
      setCopilotMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: "assistant",
          text: `Here is the AI summary for ${activeTab.title}:

${reply}`,
          timestamp: Date.now()
        }
      ]);
    } catch (err) {
      setCopilotSummary(`Unable to summarize page: ${err?.message || "Error occurred"}`);
    } finally {
      setCopilotLoading(false);
    }
  };
  const handleSendCopilotChat = async (e) => {
    e?.preventDefault();
    const question = copilotInput.trim();
    if (!question || copilotLoading) return;
    setCopilotInput("");
    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
      timestamp: Date.now()
    };
    setCopilotMessages((prev) => [...prev, userMsg]);
    setCopilotLoading(true);
    try {
      const pageText = await extractPageText();
      const systemPrompt = `You are Nexus AI Web Copilot. You are inspecting the user's active browser page titled "${activeTab.title}" at "${activeTab.url}". Answer the user's question clearly, accurately, and concisely using the page text whenever available.`;
      const response = await executePuterChat({
        model: "gpt-4o",
        system: systemPrompt,
        messages: [
          { role: "user", content: `PAGE CONTEXT:
${pageText.slice(0, 6e3)}

USER QUESTION: ${question}` }
        ]
      });
      const botMsg = {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: response,
        timestamp: Date.now()
      };
      setCopilotMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setCopilotMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: `Copilot error: ${err?.message || "Failed to get answer"}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setCopilotLoading(false);
      setTimeout(() => {
        copilotChatRef.current?.scrollTo({
          top: copilotChatRef.current.scrollHeight,
          behavior: "smooth"
        });
      }, 100);
    }
  };
  const handleToggleReaderMode = async () => {
    if (!readerMode) {
      const text = await extractPageText();
      setReaderContent(text);
      setReaderMode(true);
    } else {
      setReaderMode(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full w-full flex-col overflow-hidden bg-[#05070a] text-zinc-100 select-none", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-black/60 px-3 py-1.5 backdrop-blur-xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none pr-3", children: [
        tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => setActiveTabId(tab.id),
              className: `group relative flex h-8 max-w-[220px] min-w-[130px] cursor-pointer items-center gap-2 rounded-lg border px-3 transition-all duration-150 ${isActive ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/15 to-transparent text-emerald-200 shadow-[0_2px_12px_rgba(16,185,129,0.12)]" : "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10 hover:bg-white/[0.05] hover:text-zinc-200"}`,
              children: [
                tab.isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiLoader4Line, { className: "h-3.5 w-3.5 shrink-0 animate-spin text-emerald-400" }) : tab.favicon ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "img",
                  {
                    src: tab.favicon,
                    alt: "",
                    onError: (e) => {
                      e.target.style.display = "none";
                    },
                    className: "h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
                  }
                ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                  RiGlobalLine,
                  {
                    className: `h-3.5 w-3.5 shrink-0 ${isActive ? "text-emerald-400" : "text-zinc-500"}`
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "min-w-0 flex-1 truncate text-xs font-semibold tracking-wide", children: tab.title || (tab.url === "nexus://start" ? "Nexus Start" : tab.url) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: (e) => handleCloseTab(tab.id, e),
                    className: "grid h-4 w-4 shrink-0 place-items-center rounded-sm text-zinc-500 opacity-60 transition hover:bg-white/10 hover:text-red-300 hover:opacity-100",
                    title: "Close tab (Ctrl+W)",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { className: "h-3 w-3" })
                  }
                )
              ]
            },
            tab.id
          );
        }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => handleNewTab(),
            className: "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/5 bg-white/[0.02] text-zinc-400 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300",
            title: "Open new tab (Ctrl+T)",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiAddLine, { className: "h-4 w-4" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setActiveMode("browser"),
              className: `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${activeMode === "browser" ? "bg-emerald-500/20 text-emerald-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiGlobalLine, { className: "text-xs" }),
                "Browser"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setActiveMode("skyvern"),
              className: `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${activeMode === "skyvern" ? "bg-cyan-500/20 text-cyan-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`,
              title: "Launch Skyvern Autonomous Screen Agent",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiEyeLine, { className: "text-xs" }),
                "Screen Studio"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setShowCopilot((prev) => !prev),
            className: `flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold tracking-wide transition ${showCopilot ? "border-emerald-400/50 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-emerald-500/30 hover:text-emerald-300"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiMagicLine, { className: "text-emerald-400 text-sm animate-pulse" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "AI Copilot" })
            ]
          }
        )
      ] })
    ] }),
    activeMode === "browser" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.06] bg-zinc-950/70 px-3 py-2 backdrop-blur-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleGoBack,
            disabled: !activeTab?.canGoBack && activeTab?.historyIndex <= 0,
            className: "grid h-8 w-8 place-items-center rounded-lg border border-white/5 bg-black/30 text-zinc-400 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-30 disabled:hover:border-white/5 disabled:hover:bg-black/30 disabled:hover:text-zinc-400",
            title: "Back",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowLeftLine, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleGoForward,
            disabled: !activeTab?.canGoForward && activeTab?.historyIndex >= activeTab?.history.length - 1,
            className: "grid h-8 w-8 place-items-center rounded-lg border border-white/5 bg-black/30 text-zinc-400 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-30 disabled:hover:border-white/5 disabled:hover:bg-black/30 disabled:hover:text-zinc-400",
            title: "Forward",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowRightLine, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleReloadOrStop,
            className: "grid h-8 w-8 place-items-center rounded-lg border border-white/5 bg-black/30 text-zinc-400 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300",
            title: activeTab.isLoading ? "Stop loading" : "Reload page (Ctrl+R)",
            children: activeTab.isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { className: "h-4 w-4 text-red-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => navigateTo("nexus://start"),
            className: `grid h-8 w-8 place-items-center rounded-lg border transition ${activeTab.url === "nexus://start" ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-white/5 bg-black/30 text-zinc-400 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-300"}`,
            title: "Nexus Start Portal",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiHome4Line, { className: "h-4 w-4" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: handleAddressSubmit, className: "relative flex min-w-0 flex-1 items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-3 transition-all focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/15", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setShowEngineDropdown((prev) => !prev),
              className: "flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/[0.08]",
              title: "Switch Search Engine",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: SEARCH_ENGINES[searchEngine].icon }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline font-mono text-[10px] uppercase font-bold text-emerald-400/80", children: SEARCH_ENGINES[searchEngine].name })
              ]
            }
          ),
          showEngineDropdown && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-8 left-0 z-50 w-44 rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl backdrop-blur-2xl", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-2 py-1 text-[9px] font-black uppercase tracking-wider text-zinc-500", children: "Search Engines" }),
            Object.entries(SEARCH_ENGINES).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => {
                  setSearchEngine(key);
                  setShowEngineDropdown(false);
                },
                className: `flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${searchEngine === key ? "bg-emerald-500/20 text-emerald-300 font-bold" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: val.icon }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: val.name })
                ]
              },
              key
            ))
          ] })
        ] }),
        activeTab.url !== "nexus://start" && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "flex shrink-0 items-center text-emerald-400/80",
            title: "Connection secure (SSL 256-bit)",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiLockLine, { className: "h-3.5 w-3.5" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: addressBarInput,
            onChange: (e) => setAddressBarInput(e.target.value),
            placeholder: SEARCH_ENGINES[searchEngine].placeholder,
            className: "min-w-0 flex-1 bg-transparent text-xs font-mono text-zinc-100 outline-none placeholder:text-zinc-600 selection:bg-emerald-500/30 selection:text-white",
            onFocus: (e) => e.target.select()
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex shrink-0 items-center gap-1", children: activeTab.url !== "nexus://start" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleToggleBookmark,
              className: `grid h-6 w-6 place-items-center rounded transition ${isBookmarked ? "text-yellow-400 hover:text-yellow-300" : "text-zinc-500 hover:text-zinc-300"}`,
              title: isBookmarked ? "Remove Bookmark" : "Bookmark this page",
              children: isBookmarked ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiStarFill, { className: "h-3.5 w-3.5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiStarLine, { className: "h-3.5 w-3.5" })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleCopyUrl,
              className: "grid h-6 w-6 place-items-center rounded text-zinc-500 transition hover:text-zinc-300",
              title: copiedUrl ? "Copied!" : "Copy Link",
              children: copiedUrl ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckLine, { className: "h-3.5 w-3.5 text-emerald-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiFileCopyLine, { className: "h-3.5 w-3.5" })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleOpenExternal,
              className: "grid h-6 w-6 place-items-center rounded text-zinc-500 transition hover:text-cyan-300",
              title: "Open in system browser (Chrome/Edge)",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiExternalLinkLine, { className: "h-3.5 w-3.5" })
            }
          )
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center rounded-lg border border-white/5 bg-black/40 px-1 py-0.5 text-xs text-zinc-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => handleZoom(-0.1),
              className: "px-1 text-zinc-500 hover:text-zinc-200",
              title: "Zoom Out",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiZoomOutLine, {})
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-[10px] w-9 text-center text-zinc-400", children: [
            Math.round(zoomFactor * 100),
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => handleZoom(0.1),
              className: "px-1 text-zinc-500 hover:text-zinc-200",
              title: "Zoom In",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiZoomInLine, {})
            }
          )
        ] }),
        activeTab.url !== "nexus://start" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleToggleReaderMode,
            className: `flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition ${readerMode ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-white/5 bg-black/30 text-zinc-400 hover:border-white/10 hover:text-zinc-200"}`,
            title: "Toggle Clean Reader Mode",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiBookOpenLine, { className: "h-3.5 w-3.5" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden md:inline text-[10px] font-bold", children: "Reader" })
            ]
          }
        ),
        activeTab.url !== "nexus://start" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleSummarizePage,
            className: "flex h-8 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs text-emerald-300 transition hover:bg-emerald-500/20 shadow-sm",
            title: "Summarize page with Puter AI",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiCpuLine, { className: "h-3.5 w-3.5 text-emerald-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden lg:inline text-[10px] font-bold", children: "Summarize" })
            ]
          }
        )
      ] })
    ] }),
    activeMode === "browser" && showBookmarksBar && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.04] bg-black/40 px-3 py-1 text-xs scrollbar-none", children: [
      bookmarks.map((bm) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => navigateTo(bm.url),
          className: "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100",
          title: bm.url,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: bm.icon || "🔖" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "max-w-[120px] truncate font-medium text-[11px]", children: bm.title })
          ]
        },
        bm.id
      )),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: handleToggleBookmark,
          className: "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/5 hover:text-emerald-300",
          title: "Bookmark Current Page",
          children: "+ Add Bookmark"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex min-h-0 flex-1 overflow-hidden", children: [
      activeMode === "skyvern" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SkyvernScreenStudio, {}) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative flex h-full w-full min-w-0 flex-1 overflow-hidden", children: activeTab.url === "nexus://start" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-full overflow-y-auto p-6 md:p-10 scrollbar-small bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/20 via-[#05070a] to-[#030508]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-5xl space-y-8", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/30 to-black/60 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-emerald-400", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiGlobalLine, { className: "text-2xl animate-spin", style: { animationDuration: "18s" } }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-black uppercase tracking-[0.25em]", children: "Nexus Quantum Browser" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl", children: "Cybernetic Web Gateway" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-zinc-400", children: "Chromium engine with Puter AI Copilot, live page summaries, and autonomous steering." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-right", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] font-mono uppercase tracking-wider text-emerald-400", children: "Engine Status" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-black text-white", children: "Chromium 120 // Live" })
            ] }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: handleAddressSubmit, className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center rounded-2xl border border-emerald-400/30 bg-black/80 p-2 shadow-2xl transition focus-within:border-emerald-400 focus-within:ring-4 focus-within:ring-emerald-500/15", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-3 text-lg", children: SEARCH_ENGINES[searchEngine].icon }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: addressBarInput,
                onChange: (e) => setAddressBarInput(e.target.value),
                placeholder: `Search ${SEARCH_ENGINES[searchEngine].name} or enter any URL (e.g. github.com, youtube.com)...`,
                className: "min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600",
                autoFocus: true
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "submit",
                className: "rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-black shadow-lg transition hover:brightness-110",
                children: "Explore"
              }
            )
          ] }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xs font-black uppercase tracking-[0.2em] text-zinc-400", children: "Speed Dial Destinations" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-emerald-400/70", children: "Instant 1-Click Launch" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6", children: SPEED_DIAL_ITEMS.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => navigateTo(item.url),
              className: "group flex cursor-pointer flex-col justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] hover:shadow-[0_10px_30px_rgba(16,185,129,0.1)]",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-2xl transition-transform duration-200 group-hover:scale-110", children: item.icon }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiExternalLinkLine, { className: "text-xs text-zinc-600 opacity-0 transition group-hover:text-emerald-400 group-hover:opacity-100" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs font-bold text-zinc-200 group-hover:text-emerald-200", children: item.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 truncate text-[10px] font-medium text-zinc-500", children: item.desc })
                ] })
              ]
            },
            item.title
          )) })
        ] }),
        historyList.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl border border-white/5 bg-black/40 p-5 backdrop-blur-md", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiHistoryLine, { className: "text-emerald-400" }),
              "Recent History"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setHistoryList([]),
                className: "flex items-center gap-1 text-[10px] text-zinc-500 hover:text-red-400",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiDeleteBin6Line, {}),
                  " Clear History"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-2", children: historyList.slice(0, 6).map((h) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => navigateTo(h.url),
              className: "flex cursor-pointer items-center justify-between rounded-lg border border-white/[0.03] bg-white/[0.01] px-3 py-2 transition hover:border-white/10 hover:bg-white/[0.04]",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 pr-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-xs font-semibold text-zinc-200", children: h.title || h.url }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate font-mono text-[10px] text-zinc-500", children: h.url })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 font-mono text-[9px] text-zinc-600", children: new Date(h.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                }) })
              ]
            },
            h.id
          )) })
        ] })
      ] }) }) : readerMode ? (
        /* 2. READER MODE VIEWPORT */
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-full overflow-y-auto bg-zinc-950 p-6 md:p-12 scrollbar-small", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-3xl space-y-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-white/10 pb-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setReaderMode(false),
                className: "mb-3 flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline",
                children: "← Exit Reader Mode"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-black text-white", children: activeTab.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 font-mono text-xs text-zinc-500", children: activeTab.url })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "prose prose-invert max-w-none text-zinc-300 whitespace-pre-wrap leading-relaxed text-sm", children: readerContent || "Extracting article contents..." })
        ] }) })
      ) : (
        /* 3. REAL CHROMIUM WEBVIEW */
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-full w-full flex-1 bg-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "webview",
            {
              ref: webviewRef,
              src: activeTab.url,
              className: "h-full w-full border-0 bg-white",
              allowpopups: true,
              webpreferences: "contextIsolation=no, nodeIntegration=no",
              style: { width: "100%", height: "100%" }
            },
            activeTab.id
          ),
          activeTab.isLoading && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute top-0 left-0 right-0 h-1 bg-emerald-500/20 overflow-hidden z-20", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-1/3 bg-gradient-to-r from-emerald-400 to-cyan-400 animate-pulse" }) })
        ] })
      ) }),
      showCopilot && activeMode === "browser" && /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "flex h-full w-96 shrink-0 flex-col border-l border-white/[0.08] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl transition-all duration-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/10 p-3.5 bg-black/40", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-md", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiRobotLine, { className: "text-base" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-black uppercase tracking-wider text-white", children: "Nexus Web Copilot" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] font-mono text-emerald-400", children: "Puter AI / GPT-4o" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => setShowCopilot(false),
              className: "grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-white",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { className: "text-base" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-white/5 bg-white/[0.02] p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] font-black uppercase tracking-wider text-zinc-500", children: "Active Tab" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 truncate text-xs font-bold text-zinc-200", children: activeTab.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate font-mono text-[10px] text-zinc-500", children: activeTab.url }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: handleSummarizePage,
                disabled: copilotLoading,
                className: "flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiCpuLine, { className: "text-xs" }),
                  "Summarize"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: handleToggleReaderMode,
                className: "flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[10px] font-bold text-zinc-300 transition hover:bg-white/10",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiBookOpenLine, { className: "text-xs" }),
                  "Clean View"
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: copilotChatRef, className: "flex-1 overflow-y-auto p-3 space-y-3 scrollbar-small", children: [
          copilotMessages.map((msg) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: `max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed ${msg.role === "user" ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-100 rounded-br-xs" : "bg-white/[0.04] border border-white/10 text-zinc-200 rounded-bl-xs"}`,
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "whitespace-pre-wrap", children: msg.text })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 text-[8px] font-mono text-zinc-600", children: new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                }) })
              ]
            },
            msg.id
          )),
          copilotLoading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-zinc-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiLoader4Line, { className: "h-4 w-4 animate-spin text-emerald-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Analyzing webpage content..." })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: handleSendCopilotChat, className: "border-t border-white/10 p-3 bg-black/60", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 focus-within:border-emerald-500/40", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: copilotInput,
              onChange: (e) => setCopilotInput(e.target.value),
              placeholder: "Ask AI anything about this page...",
              className: "min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              disabled: !copilotInput.trim() || copilotLoading,
              className: "grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300 transition hover:bg-emerald-500 hover:text-black disabled:opacity-30",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSendPlane2Line, { className: "text-xs" })
            }
          )
        ] }) })
      ] })
    ] })
  ] });
}
export {
  BrowserControlView as default
};
