import { r as reactExports, cr as gsapWithCSS, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, cs as Network, bd as CircleCheck, bg as Cpu, bk as FileText } from "./index-CYaMQ3cR.js";
import { u as useGSAP } from "./index-DcCoZIiB.js";
import { G as Globe } from "./globe-CUtgp0B4.js";
gsapWithCSS.registerPlugin(useGSAP);
function ResearchWidget() {
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [query, setQuery] = reactExports.useState("");
  const [statusText, setStatusText] = reactExports.useState("Initializing RAG Pipeline...");
  const [isSuccess, setIsSuccess] = reactExports.useState(null);
  const [summary, setSummary] = reactExports.useState("");
  const containerRef = reactExports.useRef(null);
  const textRef = reactExports.useRef(null);
  const progressRef = reactExports.useRef(null);
  const summaryRef = reactExports.useRef(null);
  const { contextSafe } = useGSAP({ scope: containerRef });
  const handleStart = contextSafe((e) => {
    setQuery(e.detail.query);
    setIsSuccess(null);
    setSummary("");
    setIsOpen(true);
    setStatusText("Booting Deep Search Node...");
    if (progressRef.current) gsapWithCSS.to(progressRef.current, { width: "5%", duration: 0.5 });
  });
  const handleProgress = contextSafe(
    (_event, data) => {
      if (textRef.current) {
        gsapWithCSS.to(textRef.current, {
          y: -10,
          opacity: 0,
          duration: 0.2,
          onComplete: () => {
            setStatusText(data.file);
            gsapWithCSS.to(textRef.current, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" });
          }
        });
      }
      if (progressRef.current) {
        const percentage = data.totalFound === 1 ? "35%" : data.totalFound === 2 ? "70%" : "90%";
        gsapWithCSS.to(progressRef.current, { width: percentage, duration: 1.2, ease: "expo.out" });
      }
    }
  );
  const handleDone = contextSafe((e) => {
    const success = e.detail.success;
    setIsSuccess(success);
    if (success && e.detail.summary) {
      setSummary(e.detail.summary);
      if (summaryRef.current)
        gsapWithCSS.fromTo(
          summaryRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8, delay: 0.3 }
        );
    }
    if (textRef.current) {
      gsapWithCSS.to(textRef.current, {
        opacity: 0,
        y: -10,
        duration: 0.2,
        onComplete: () => {
          setStatusText(success ? "RAG Pipeline Complete & Synthesized." : "Pipeline Terminated.");
          gsapWithCSS.to(textRef.current, { opacity: 1, y: 0, duration: 0.3 });
        }
      });
    }
    if (progressRef.current) {
      gsapWithCSS.to(progressRef.current, {
        width: "100%",
        backgroundColor: success ? "#10b981" : "#ef4444",
        duration: 0.6,
        ease: "power3.out"
      });
    }
    setTimeout(() => setIsOpen(false), 6e3);
  });
  reactExports.useEffect(() => {
    window.addEventListener("deep-research-start", handleStart);
    window.addEventListener("deep-research-done", handleDone);
    window.electron.ipcRenderer.on("oracle-progress", handleProgress);
    return () => {
      window.removeEventListener("deep-research-start", handleStart);
      window.removeEventListener("deep-research-done", handleDone);
      window.electron.ipcRenderer.removeAllListeners("oracle-progress");
    };
  }, [handleStart, handleProgress, handleDone]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      ref: containerRef,
      initial: { opacity: 0, scale: 0.9, filter: "blur(15px)" },
      animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
      exit: { opacity: 0, scale: 0.95, filter: "blur(10px)" },
      transition: { type: "spring", stiffness: 300, damping: 25 },
      className: "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-175 min-h-75 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_0_80px_rgba(0,0,0,0.9)] z-50 text-white font-sans overflow-hidden flex flex-col justify-center",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6 border-b border-white/10 pb-4 relative z-10", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Network, { className: "w-6 h-6 text-cyan-400 animate-[pulse_2s_ease-in-out_infinite]" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold tracking-[0.3em] text-cyan-400 uppercase", children: "Autonomous RAG Agent" })
          ] }),
          isSuccess === true && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-6 h-6 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] rounded-full" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6 relative z-10", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-gray-400 uppercase tracking-[0.2em] mb-2 font-semibold", children: "Active Query" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium text-gray-100 leading-relaxed border-l-2 border-cyan-500 pl-4", children: query })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 mb-6 bg-black/40 py-3 px-4 rounded-lg border border-white/5 relative z-10", children: [
          statusText.includes("Tavily") ? /* @__PURE__ */ jsxRuntimeExports.jsx(Globe, { className: "w-5 h-5 text-cyan-500 animate-spin-slow" }) : statusText.includes("Llama") ? /* @__PURE__ */ jsxRuntimeExports.jsx(Cpu, { className: "w-5 h-5 text-purple-500 animate-pulse" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-emerald-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: textRef, className: "text-sm text-gray-300 font-mono tracking-wider", children: statusText })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-4 relative z-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: progressRef,
            className: "h-full bg-cyan-500 rounded-full w-0 shadow-[0_0_15px_rgba(6,182,212,0.8)]"
          }
        ) }),
        summary && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            ref: summaryRef,
            className: "mt-4 p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-lg relative z-10 max-h-40 overflow-y-auto pr-1.5 scrollbar-small",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-emerald-400/80 uppercase tracking-widest mb-2 font-bold", children: "Data Extracted" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-gray-300 font-mono leading-relaxed", children: summary })
            ]
          }
        )
      ]
    }
  ) });
}
export {
  ResearchWidget as default
};
