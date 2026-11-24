import { r as reactExports, j as jsxRuntimeExports } from "./index-CYaMQ3cR.js";
function ImageWidget() {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [imageSrc, setImageSrc] = reactExports.useState("");
  const [prompt, setPrompt] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(false);
  const [hasError, setHasError] = reactExports.useState(false);
  const [statusText, setStatusText] = reactExports.useState("");
  const [debugMsg, setDebugMsg] = reactExports.useState("");
  const abortControllerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const handleEvent = (event) => {
      const { url, prompt: prompt2, loading: loading2, error, errorMessage } = event.detail;
      setPrompt(prompt2);
      if (loading2) {
        setIsVisible(true);
        setLoading(true);
        setHasError(false);
        setImageSrc("");
        setStatusText("NEXUS IS CRAFTING YOUR IMAGE...");
        return;
      }
      if (error) {
        setHasError(true);
        setLoading(false);
        setDebugMsg(errorMessage || "API Error");
        return;
      }
      if (url) {
        downloadAndAutoSave(url, prompt2);
      }
    };
    window.addEventListener("image-gen", handleEvent);
    return () => window.removeEventListener("image-gen", handleEvent);
  }, []);
  const downloadAndAutoSave = async (url, currentPrompt) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      setStatusText("DOWNLOADING & SAVING...");
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Download Error: ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setImageSrc(objectUrl);
      setLoading(false);
      setHasError(false);
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result;
        await window.electron.ipcRenderer.invoke("save-image-to-gallery", {
          title: currentPrompt,
          base64Data: base64data
        });
        setStatusText("SAVED TO GALLERY ✔️");
      };
    } catch (err) {
      if (err.name === "AbortError") return;
      setHasError(true);
      setDebugMsg("Failed to download/save image.");
      setLoading(false);
    }
  };
  if (!isVisible) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-9050 flex items-center justify-center bg-black/90 backdrop-blur-md p-10 animate-in fade-in zoom-in duration-300", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative max-w-5xl max-h-[85vh] border-2 border-orange-500/50 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(249,115,22,0.2)] bg-black", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-0 left-0 w-full z-10 p-4 flex justify-between items-start pointer-events-none", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-black/80 backdrop-blur border border-orange-500/50 px-4 py-2 rounded-lg pointer-events-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-orange-400 font-bold tracking-widest text-xs uppercase font-mono", children: [
        "NEXUS Image Generator // ",
        prompt.slice(0, 30),
        "..."
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => setIsVisible(false),
          className: "bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white border border-red-500 px-4 py-2 rounded-lg font-bold pointer-events-auto transition-all",
          children: "CLOSE"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative w-full h-full flex items-center justify-center min-w-200 min-h-125", children: [
      loading && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-orange-400 font-mono text-sm animate-pulse tracking-widest", children: statusText })
      ] }),
      hasError && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center text-red-500 px-10 max-w-xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-6xl mb-4", children: "⚠️" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold font-mono", children: "GENERATION PAUSED" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm opacity-90 mt-2 font-mono bg-red-900/20 p-4 rounded border border-red-500/30", children: debugMsg })
      ] }),
      !loading && !hasError && imageSrc && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative w-full h-full flex items-center justify-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "img",
          {
            src: imageSrc,
            alt: "Generated",
            className: "w-full h-auto max-h-full object-contain animate-in fade-in duration-1000"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-4 right-4 bg-green-500/20 text-green-400 border border-green-500/50 px-3 py-1 rounded-full text-xs font-bold font-mono animate-in slide-in-from-bottom-2 fade-in duration-700 delay-500", children: "💾 SAVED TO GALLERY" })
      ] })
    ] })
  ] }) });
}
export {
  ImageWidget as default
};
