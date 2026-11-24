import { h as createLucideIcon, r as reactExports, cr as gsapWithCSS, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, bg as Cpu, bd as CircleCheck } from "./index-CYaMQ3cR.js";
import { u as useGSAP } from "./index-DcCoZIiB.js";
const __iconNode = [
  ["path", { d: "m21 21-4.34-4.34", key: "14j7rj" }],
  ["circle", { cx: "11", cy: "11", r: "8", key: "4ej97u" }]
];
const Search = createLucideIcon("search", __iconNode);
gsapWithCSS.registerPlugin(useGSAP);
function SemanticWidget() {
  const [isOpen, setIsOpen] = reactExports.useState(false);
  const [target, setTarget] = reactExports.useState("");
  const [statusText, setStatusText] = reactExports.useState("Booting Search Engine...");
  const [isSuccess, setIsSuccess] = reactExports.useState(null);
  const containerRef = reactExports.useRef(null);
  const textRef = reactExports.useRef(null);
  const progressRef = reactExports.useRef(null);
  const { contextSafe } = useGSAP({ scope: containerRef });
  const handleStart = contextSafe((e) => {
    setTarget(e.detail.target);
    setIsSuccess(null);
    setIsOpen(true);
    setStatusText("Waking Llama 3.1 Neural Core...");
    if (progressRef.current) gsapWithCSS.to(progressRef.current, { width: "5%", duration: 0.5 });
  });
  const handleProgress = contextSafe(
    (_event, data) => {
      if (textRef.current) {
        gsapWithCSS.to(textRef.current, {
          y: -5,
          opacity: 0,
          duration: 0.15,
          onComplete: () => {
            setStatusText(data.text);
            gsapWithCSS.to(textRef.current, { y: 0, opacity: 1, duration: 0.2, ease: "power2.out" });
          }
        });
      }
      if (progressRef.current)
        gsapWithCSS.to(progressRef.current, {
          width: `${data.progress}%`,
          duration: 0.5,
          ease: "power1.out"
        });
    }
  );
  const handleDone = contextSafe((e) => {
    const success = e.detail.success;
    setIsSuccess(success);
    if (textRef.current) {
      gsapWithCSS.to(textRef.current, {
        opacity: 0,
        y: -10,
        duration: 0.2,
        onComplete: () => {
          setStatusText(success ? `Protocol Complete.` : "Protocol Failed.");
          gsapWithCSS.to(textRef.current, { opacity: 1, y: 0, duration: 0.3 });
        }
      });
    }
    if (progressRef.current)
      gsapWithCSS.to(progressRef.current, {
        width: "100%",
        backgroundColor: success ? "#3b82f6" : "#ef4444",
        duration: 0.6
      });
    setTimeout(() => setIsOpen(false), 4e3);
  });
  reactExports.useEffect(() => {
    window.addEventListener("semantic-start", handleStart);
    window.addEventListener("semantic-done", handleDone);
    window.electron.ipcRenderer.on("semantic-progress", handleProgress);
    return () => {
      window.removeEventListener("semantic-start", handleStart);
      window.removeEventListener("semantic-done", handleDone);
      window.electron.ipcRenderer.removeAllListeners("semantic-progress");
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
      className: "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl p-8 shadow-[0_0_80px_rgba(0,0,0,0.9)] z-9999 text-white font-sans flex flex-col justify-center",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6 border-b border-white/10 pb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Cpu, { className: "w-6 h-6 text-blue-400 animate-[pulse_2s_ease-in-out_infinite]" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-bold tracking-[0.3em] text-blue-400 uppercase", children: "Omni-System Search" })
          ] }),
          isSuccess === true && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-6 h-6 text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] rounded-full" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-gray-400 uppercase tracking-[0.2em] mb-2 font-semibold", children: "Target Intent" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium text-gray-100 leading-relaxed border-l-2 border-blue-500 pl-4", children: target })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 mb-6 bg-white/3 py-3 px-4 rounded-lg border border-white/5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "w-5 h-5 text-blue-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: textRef, className: "text-sm text-gray-300 font-mono tracking-wider", children: statusText })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-1.5 bg-white/5 rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            ref: progressRef,
            className: "h-full bg-blue-500 rounded-full w-0 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
          }
        ) })
      ]
    }
  ) });
}
export {
  SemanticWidget as default
};
