import { r as reactExports, cD as getScheduledWhatsApp, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, cE as RiWhatsappLine, w as RiCloseLine, cF as RiUser3Line, ao as RiSparklingLine, aj as RiTimeLine, cG as RiSendPlaneLine, cH as RiCheckDoubleLine, l as RiDeleteBinLine, cI as sendWhatsAppMessage, cJ as scheduleWhatsAppMessage } from "./index-CYaMQ3cR.js";
const QUICK_TEMPLATES = [
  "⚡ Nexus Build is complete & verified on device.",
  "🚀 Code review deployed to main. Please review.",
  "📍 Telemetry uplink active. All systems nominal.",
  "⏱️ Scheduled sync in 15 minutes."
];
function WhatsAppWidget() {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [phone, setPhone] = reactExports.useState("");
  const [recipientName, setRecipientName] = reactExports.useState("");
  const [message, setMessage] = reactExports.useState("");
  const [delayMinutes, setDelayMinutes] = reactExports.useState(5);
  const [isScheduling, setIsScheduling] = reactExports.useState(false);
  const [queue, setQueue] = reactExports.useState([]);
  const [statusMsg, setStatusMsg] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const handleOpen = (e) => {
      setIsVisible(true);
      if (e.detail?.phone) setPhone(e.detail.phone);
      if (e.detail?.message) setMessage(e.detail.message);
    };
    window.addEventListener("show-whatsapp", handleOpen);
    return () => window.removeEventListener("show-whatsapp", handleOpen);
  }, []);
  reactExports.useEffect(() => {
    if (isVisible) {
      loadQueue();
    }
  }, [isVisible]);
  const loadQueue = async () => {
    const q = await getScheduledWhatsApp();
    setQueue(q);
  };
  const handleSendDirect = async () => {
    if (!phone || !message) return;
    setStatusMsg("DISPATCHING DIRECT MESSAGE...");
    const res = await sendWhatsAppMessage(phone, message);
    setStatusMsg(res.includes("📱") ? "MESSAGE DISPATCHED" : "DISPATCH FAILED");
    setTimeout(() => setStatusMsg(null), 3500);
  };
  const handleSchedule = async () => {
    if (!phone || !message) return;
    setStatusMsg(`QUEUING FOR ${delayMinutes}M DELAY...`);
    const res = await scheduleWhatsAppMessage({
      phone,
      recipientName,
      message,
      delayMinutes
    });
    setStatusMsg(res.includes("⏱️") ? "MESSAGE SCHEDULED" : "SCHEDULING FAILED");
    loadQueue();
    setTimeout(() => setStatusMsg(null), 3500);
  };
  const handleCancelItem = async (id) => {
    await window.electron.ipcRenderer.invoke("whatsapp-cancel-scheduled", id);
    loadQueue();
  };
  if (!isVisible) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[9700] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { opacity: 0, scale: 0.94, y: 15 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.94, y: 15 },
      className: "relative w-full max-w-2xl bg-zinc-950/85 border border-white/10 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden flex flex-col",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiWhatsappLine, { size: 18 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-white text-sm font-bold tracking-wide uppercase", children: "WhatsApp Automation Engine" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-mono text-zinc-400 tracking-widest uppercase", children: "Direct Protocol Uplink • Timed Dispatch Queue" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            statusMsg && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono px-3 py-1 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 animate-pulse", children: statusMsg }),
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
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 flex flex-col gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1 block", children: "Recipient Phone (w/ Country Code)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-3 text-zinc-500 font-mono text-xs", children: "+" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "text",
                    value: phone,
                    onChange: (e) => setPhone(e.target.value),
                    placeholder: "14155552671",
                    className: "w-full bg-zinc-900/80 border border-white/10 rounded-lg pl-7 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1 block", children: "Contact Alias (Optional)" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex items-center", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiUser3Line, { className: "absolute left-3 text-zinc-500", size: 14 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "text",
                    value: recipientName,
                    onChange: (e) => setRecipientName(e.target.value),
                    placeholder: "Chief Architect",
                    className: "w-full bg-zinc-900/80 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-sans"
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest", children: "Transmission Message" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-mono text-zinc-500", children: [
                message.length,
                " CHARACTERS"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "textarea",
              {
                value: message,
                onChange: (e) => setMessage(e.target.value),
                placeholder: "Compose your neural transmission payload here...",
                rows: 3,
                className: "w-full bg-zinc-900/80 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 font-sans resize-none"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingLine, { size: 10 }),
              " Presets:"
            ] }),
            QUICK_TEMPLATES.map((tmpl, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setMessage(tmpl),
                className: "text-[10px] font-sans px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/5 hover:border-emerald-500/40 text-zinc-400 hover:text-white transition truncate max-w-[200px]",
                children: tmpl
              },
              idx
            ))
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pt-2 border-t border-white/5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setIsScheduling(!isScheduling),
                  className: `px-3 py-2 rounded-lg text-xs font-mono tracking-wider uppercase transition flex items-center gap-1.5 border ${isScheduling ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400" : "bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white"}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiTimeLine, { size: 14 }),
                    "Timed Queue"
                  ]
                }
              ),
              isScheduling && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1.5", children: [1, 5, 15, 60].map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setDelayMinutes(m),
                  className: `text-[10px] font-mono px-2 py-1 rounded ${delayMinutes === m ? "bg-cyan-500 text-black font-bold" : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/5"}`,
                  children: [
                    "+",
                    m,
                    "m"
                  ]
                },
                m
              )) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: isScheduling ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                disabled: !phone || !message,
                onClick: handleSchedule,
                className: "px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-40",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiTimeLine, { size: 14 }),
                  "Schedule (",
                  delayMinutes,
                  "m)"
                ]
              }
            ) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                disabled: !phone || !message,
                onClick: handleSendDirect,
                className: "px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs tracking-wider uppercase transition flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] disabled:opacity-40",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiSendPlaneLine, { size: 14 }),
                  "Transmit Now"
                ]
              }
            ) })
          ] }),
          queue.filter((q) => q.status === "pending").length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckDoubleLine, { className: "text-emerald-400", size: 12 }),
              "Active Scheduled Transmissions"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-small", children: queue.filter((q) => q.status === "pending").map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "flex items-center justify-between p-2 rounded bg-zinc-900/60 border border-white/5 text-xs",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 truncate", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-emerald-400", children: [
                      "+",
                      item.recipientPhone
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-zinc-500 truncate text-[11px] font-sans", children: [
                      '"',
                      item.message,
                      '"'
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400", children: new Date(item.scheduledTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: () => handleCancelItem(item.id),
                        className: "p-1 text-zinc-500 hover:text-red-400 transition",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiDeleteBinLine, { size: 13 })
                      }
                    )
                  ] })
                ]
              },
              item.id
            )) })
          ] })
        ] })
      ]
    }
  ) }) });
}
export {
  WhatsAppWidget as default
};
