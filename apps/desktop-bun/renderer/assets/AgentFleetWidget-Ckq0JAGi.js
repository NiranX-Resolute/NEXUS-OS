import { r as reactExports, ct as getFleetStatus, cu as onFleetStatusUpdate, cv as onFleetTaskComplete, j as jsxRuntimeExports, $ as RiRobot2Line, w as RiCloseLine, aE as RiShieldCheckLine, l as RiDeleteBinLine, cw as RiCodeSSlashLine, cx as RiRadarLine, au as RiArrowDownSLine, av as RiArrowRightSLine, al as RiPlayCircleLine, cy as dispatchFleetTask } from "./index-CYaMQ3cR.js";
const AGENT_ICONS = {
  recon_scout: RiRadarLine,
  code_architect: RiCodeSSlashLine,
  system_janitor: RiDeleteBinLine,
  sentry_watcher: RiShieldCheckLine
};
function AgentFleetWidget() {
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [agents, setAgents] = reactExports.useState([]);
  const [expandedAgent, setExpandedAgent] = reactExports.useState(null);
  const [manualPrompt, setManualPrompt] = reactExports.useState("");
  const [selectedRole, setSelectedRole] = reactExports.useState("recon_scout");
  const [isDispatching, setIsDispatching] = reactExports.useState(false);
  reactExports.useEffect(() => {
    getFleetStatus().then(setAgents).catch(() => {
    });
    const unsubUpdate = onFleetStatusUpdate((updated) => setAgents(updated));
    const unsubComplete = onFleetTaskComplete((_res) => {
      getFleetStatus().then(setAgents).catch(() => {
      });
    });
    const handleToggle = (e) => {
      if (e.detail?.open !== void 0) setIsOpen(e.detail.open);
      else setIsOpen((prev) => !prev);
    };
    window.addEventListener("nexus-toggle-fleet-widget", handleToggle);
    return () => {
      unsubUpdate();
      unsubComplete();
      window.removeEventListener("nexus-toggle-fleet-widget", handleToggle);
    };
  }, []);
  const runningCount = agents.filter((a) => a.status === "running").length;
  const handleDispatch = async () => {
    if (!manualPrompt.trim()) return;
    setIsDispatching(true);
    try {
      await dispatchFleetTask(selectedRole, manualPrompt.trim());
      setManualPrompt("");
    } finally {
      setIsDispatching(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    !isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setIsOpen(true),
        className: "fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-black/80 border border-emerald-500/30 text-emerald-400 font-mono text-xs shadow-[0_0_20px_rgba(52,211,153,0.15)] hover:border-emerald-400 hover:scale-105 transition-all backdrop-blur-xl cursor-pointer",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiRobot2Line, { className: runningCount > 0 ? "animate-bounce text-emerald-300" : "" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "tracking-widest uppercase font-bold text-[11px]", children: "Fleet" }),
          runningCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex h-2 w-2 relative", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "relative inline-flex rounded-full h-2 w-2 bg-emerald-500" })
          ] })
        ]
      }
    ),
    isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed bottom-6 right-6 z-50 w-96 max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-black/90 p-4 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl transition-all", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/10 pb-3 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiRobot2Line, { size: 16 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-mono font-bold tracking-widest uppercase text-white", children: "Nexus Agent Fleet" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[10px] font-mono text-zinc-400", children: [
              runningCount,
              " Active Unit",
              runningCount === 1 ? "" : "s"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setIsOpen(false),
            className: "text-zinc-500 hover:text-white transition-colors p-1",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 18 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-small", children: agents.map((agent) => {
        const Icon = AGENT_ICONS[agent.role] || RiRobot2Line;
        const isExpanded = expandedAgent === agent.role;
        const isRunning = agent.status === "running";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "rounded-xl border border-white/5 bg-zinc-950/70 p-3 space-y-2 transition-all hover:border-white/15",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: "flex items-center justify-between cursor-pointer",
                  onClick: () => setExpandedAgent(isExpanded ? null : agent.role),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "div",
                        {
                          className: `p-1.5 rounded-lg border text-sm ${isRunning ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 animate-pulse" : agent.status === "completed" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-zinc-900 border-white/5 text-zinc-400"}`,
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, {})
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono font-semibold text-zinc-100 block", children: agent.name }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 font-mono block", children: agent.title })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "span",
                        {
                          className: `px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider ${isRunning ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : agent.status === "completed" ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "bg-zinc-900 text-zinc-500"}`,
                          children: agent.status
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "text-zinc-500 hover:text-white text-xs", children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowDownSLine, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowRightSLine, {}) })
                    ] })
                  ]
                }
              ),
              isRunning && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full bg-zinc-900 h-1.5 rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: "bg-emerald-400 h-full rounded-full transition-all duration-300",
                  style: { width: `${agent.progress}%` }
                }
              ) }),
              agent.currentTask && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] font-mono text-zinc-400 truncate", children: [
                "> ",
                agent.currentTask
              ] }),
              isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 pt-2 border-t border-white/5 space-y-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-500 uppercase tracking-widest block", children: "Telemetry Stream" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-black/60 rounded p-2 max-h-28 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-0.5", children: agent.logs.map((log, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "leading-tight", children: log }, idx)) })
              ] })
            ]
          },
          agent.role
        );
      }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 pt-3 border-t border-white/10 space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: selectedRole,
            onChange: (e) => setSelectedRole(e.target.value),
            className: "flex-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-[11px] font-mono text-zinc-200 outline-none focus:border-emerald-500/50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "recon_scout", children: "Recon Scout (Intel/Search)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "code_architect", children: "Code Architect (Code/Build)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "system_janitor", children: "System Janitor (Cleanup)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "sentry_watcher", children: "Sentry Watcher (Hardware)" })
            ]
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: manualPrompt,
              onChange: (e) => setManualPrompt(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && handleDispatch(),
              placeholder: "Directive prompt...",
              className: "flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-emerald-500/50 placeholder:text-zinc-600"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: handleDispatch,
              disabled: isDispatching,
              className: "px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-mono font-bold text-xs flex items-center gap-1 hover:bg-emerald-400 transition-all disabled:opacity-50 cursor-pointer",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlayCircleLine, {}),
                "RUN"
              ]
            }
          )
        ] })
      ] })
    ] })
  ] });
}
export {
  AgentFleetWidget as default
};
