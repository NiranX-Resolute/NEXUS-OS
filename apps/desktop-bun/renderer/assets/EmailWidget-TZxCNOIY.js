import { r as reactExports, j as jsxRuntimeExports, bJ as RiArrowLeftLine, cU as RiMailSendLine, w as RiCloseLine, aP as AnimatePresence, aK as motion, cV as RiMailCheckLine, cF as RiUser3Line, a7 as RiAttachment2, aj as RiTimeLine } from "./index-CYaMQ3cR.js";
function EmailWidget() {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [emails, setEmails] = reactExports.useState([]);
  const [selectedEmail, setSelectedEmail] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const handleEvent = (event) => {
      const { emails: emails2 } = event.detail;
      if (emails2 && emails2.length > 0) {
        setEmails(emails2);
        setIsVisible(true);
        setSelectedEmail(null);
      } else {
        setEmails([]);
        setIsVisible(true);
      }
    };
    window.addEventListener("show-emails", handleEvent);
    return () => window.removeEventListener("show-emails", handleEvent);
  }, []);
  if (!isVisible) return null;
  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };
  const cleanSender = (from) => from.replace(/<.*>/, "").trim();
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-9050 flex items-center justify-center bg-black/90 backdrop-blur-md p-10 animate-in fade-in zoom-in duration-300", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative w-full max-w-5xl h-[85vh] border-2 border-emerald-500/50 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(16,185,129,0.15)] bg-zinc-950 flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-6 border-b border-white/5 bg-black/50 shrink-0 z-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        selectedEmail ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setSelectedEmail(null),
            className: "p-3 bg-white/5 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 rounded-xl transition-all",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowLeftLine, { size: 24 })
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiMailSendLine, { className: "text-emerald-400", size: 24 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold tracking-[0.2em] text-zinc-200", children: selectedEmail ? "SECURE MESSAGE VIEW" : "SECURE INBOX LINK" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-500 font-mono mt-1 uppercase", children: selectedEmail ? cleanSender(selectedEmail.from) : `INTERCEPTED BY NEXUS // ${emails.length} MESSAGES` })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setIsVisible(false),
          className: "p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/50 hover:border-red-500 rounded-xl transition-all",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 20 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-hidden relative", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AnimatePresence, { mode: "wait", children: [
      !selectedEmail && /* @__PURE__ */ jsxRuntimeExports.jsx(
        motion.div,
        {
          initial: { opacity: 0, x: -20 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -20 },
          className: "absolute inset-0 overflow-y-auto scrollbar-small p-6",
          children: emails.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full flex flex-col items-center justify-center text-zinc-600 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiMailCheckLine, { size: 48, className: "opacity-20" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs tracking-widest opacity-50 font-mono", children: "INBOX IS EMPTY" })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-4", children: emails.map((email) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => setSelectedEmail(email),
              className: "group p-5 bg-white-[0.02] hover:bg-white-[0.05] border border-white/5 hover:border-emerald-500/30 rounded-2xl transition-all cursor-pointer relative overflow-hidden",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-linear-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative z-10 flex flex-col gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-4", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-emerald-400 text-xs font-mono bg-emerald-400/10 px-3 py-1.5 rounded-md border border-emerald-400/20 max-w-[60%]", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiUser3Line, { size: 14, className: "shrink-0" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: cleanSender(email.from) })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                      email.attachments.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-emerald-500/70", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiAttachment2, { size: 14 }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono", children: email.attachments.length })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-zinc-600 text-[10px] font-mono uppercase", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiTimeLine, { size: 12 }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Date(email.date).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        }) })
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-zinc-200 font-bold text-base mb-1 group-hover:text-white transition-colors truncate", children: email.subject }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-zinc-500 text-sm line-clamp-2 leading-relaxed", children: email.preview })
                  ] })
                ] })
              ]
            },
            email.id
          )) })
        },
        "inbox"
      ),
      selectedEmail && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        motion.div,
        {
          initial: { opacity: 0, x: 20 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: 20 },
          className: "absolute inset-0 flex flex-col bg-zinc-900/50",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 border-b border-white/5 shrink-0 bg-black/20", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-white mb-4", children: selectedEmail.subject }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-zinc-300", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500", children: "From:" }),
                  " ",
                  selectedEmail.from
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-zinc-500 font-mono", children: new Date(selectedEmail.date).toLocaleString() })
              ] }) }),
              selectedEmail.attachments.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6 pt-4 border-t border-white/5 flex flex-wrap gap-3", children: selectedEmail.attachments.map((file, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: "flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2.5 rounded-lg hover:border-emerald-500/50 transition-colors cursor-default",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-emerald-500/20 text-emerald-400 rounded-md", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiAttachment2, { size: 16 }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-zinc-200 font-bold max-w-37.5 truncate", children: file.filename }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 font-mono uppercase", children: formatBytes(file.size) })
                    ] })
                  ]
                },
                idx
              )) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 p-6 bg-white overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "iframe",
              {
                title: "email-body",
                srcDoc: selectedEmail.body,
                className: "w-full h-full bg-white rounded-lg border-0",
                sandbox: "allow-popups allow-popups-to-escape-sandbox allow-same-origin"
              }
            ) })
          ]
        },
        "open-email"
      )
    ] }) })
  ] }) });
}
export {
  EmailWidget as default
};
