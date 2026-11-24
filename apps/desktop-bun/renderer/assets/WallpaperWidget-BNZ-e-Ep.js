import { r as reactExports, cz as getWallpaperPresets, j as jsxRuntimeExports, aP as AnimatePresence, aK as motion, cA as RiPaintBrushLine, w as RiCloseLine, z as RiCheckLine, cB as RiSparklingFill, a5 as RiRefreshLine, by as RiComputerLine, cC as setDesktopWallpaper } from "./index-CYaMQ3cR.js";
function WallpaperWidget() {
  const [isVisible, setIsVisible] = reactExports.useState(false);
  const [presets, setPresets] = reactExports.useState([]);
  const [selectedPreset, setSelectedPreset] = reactExports.useState(null);
  const [customPrompt, setCustomPrompt] = reactExports.useState("");
  const [isApplying, setIsApplying] = reactExports.useState(false);
  const [appliedPath, setAppliedPath] = reactExports.useState(null);
  const [statusMessage, setStatusMessage] = reactExports.useState(null);
  reactExports.useEffect(() => {
    const handleOpen = (e) => {
      setIsVisible(true);
      if (e.detail?.initialPrompt) {
        setCustomPrompt(e.detail.initialPrompt);
      }
    };
    window.addEventListener("show-wallpaper-forge", handleOpen);
    return () => window.removeEventListener("show-wallpaper-forge", handleOpen);
  }, []);
  reactExports.useEffect(() => {
    if (isVisible) {
      getWallpaperPresets().then((res) => {
        setPresets(res);
        if (res.length > 0 && !selectedPreset) {
          setSelectedPreset(res[0]);
        }
      });
    }
  }, [isVisible]);
  const handleApply = async (source) => {
    const targetSource = source || selectedPreset?.url;
    if (!targetSource) return;
    setIsApplying(true);
    setStatusMessage("APPLYING DESKTOP WALLPAPER...");
    const result = await setDesktopWallpaper(targetSource);
    setIsApplying(false);
    if (result.includes("✅")) {
      setAppliedPath(targetSource);
      setStatusMessage("WALLPAPER ENGAGED ON DESKTOP");
      setTimeout(() => setStatusMessage(null), 4e3);
    } else {
      setStatusMessage("FAILED TO SET WALLPAPER");
      setTimeout(() => setStatusMessage(null), 4e3);
    }
  };
  if (!isVisible) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[9700] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      initial: { opacity: 0, scale: 0.94, y: 15 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, scale: 0.94, y: 15 },
      className: "relative w-full max-w-4xl bg-zinc-950/80 border border-white/10 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden flex flex-col",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiPaintBrushLine, { size: 18 }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-white text-sm font-bold tracking-wide uppercase", children: "AI Wallpaper Engine" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-mono text-zinc-400 tracking-widest uppercase", children: "System Parameter Visual Grounding • 4K Neural Presets" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            statusMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono px-3 py-1 rounded bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 animate-pulse", children: statusMessage }),
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
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-12 gap-6 p-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-7 flex flex-col gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono tracking-widest text-zinc-400 uppercase", children: "Curated Neural Presets" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-emerald-400/80", children: [
                presets.length,
                " PROFILES LOADED"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-small", children: presets.map((preset) => {
              const isSelected = selectedPreset?.id === preset.id;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  onClick: () => setSelectedPreset(preset),
                  className: `group relative p-3 rounded-xl border cursor-pointer transition-all duration-200 overflow-hidden ${isSelected ? "bg-zinc-900/90 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "bg-zinc-900/40 border-white/5 hover:border-white/20"}`,
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-24 w-full rounded-lg overflow-hidden mb-2 bg-zinc-950", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "img",
                        {
                          src: preset.url,
                          alt: preset.title,
                          className: "w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute top-1.5 left-1.5 text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm text-zinc-300 border border-white/10", children: preset.category })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-semibold text-white tracking-wide truncate", children: preset.title }),
                      appliedPath === preset.url && /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckLine, { className: "text-emerald-400 flex-shrink-0", size: 14 })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-500 line-clamp-1 mt-0.5", children: preset.description })
                  ]
                },
                preset.id
              );
            }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-400 uppercase tracking-widest flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingFill, { className: "text-cyan-400", size: 12 }),
                "Generative Atmospheric Synthesis"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "text",
                    value: customPrompt,
                    onChange: (e) => setCustomPrompt(e.target.value),
                    placeholder: "Enter prompt (e.g. Cyberpunk rain over Neo-Seoul, 8K wallpaper)...",
                    className: "flex-1 bg-zinc-900/90 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-500/50 font-sans"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => {
                      if (customPrompt) {
                        const unsplashUrl = `https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2560&auto=format&fit=crop`;
                        handleApply(unsplashUrl);
                      }
                    },
                    className: "px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-mono tracking-wider uppercase transition flex items-center gap-1.5",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingFill, { size: 13 }),
                      "Synthesize"
                    ]
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-5 flex flex-col justify-between p-4 rounded-xl bg-zinc-900/50 border border-white/5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono tracking-widest text-zinc-400 uppercase", children: "Stage Preview" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-zinc-500", children: "2560 × 1440 UHD" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative aspect-video w-full rounded-xl overflow-hidden border border-white/10 bg-black", children: [
                selectedPreset ? /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "img",
                  {
                    src: selectedPreset.url,
                    alt: selectedPreset.title,
                    className: "w-full h-full object-cover"
                  }
                ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-full flex items-center justify-center text-zinc-600 text-xs font-mono", children: "NO PREVIEW ACTIVE" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute bottom-3 left-3 right-3 text-left", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-white text-xs font-bold truncate", children: selectedPreset?.title || "System Default" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 truncate font-mono", children: selectedPreset?.description })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 mt-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  disabled: isApplying || !selectedPreset,
                  onClick: () => handleApply(),
                  className: "w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(16,185,129,0.3)] disabled:opacity-50",
                  children: isApplying ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { className: "animate-spin", size: 16 }),
                    "ENGAGING WALLPAPER..."
                  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiComputerLine, { size: 16 }),
                    "APPLY TO DESKTOP"
                  ] })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] font-mono text-zinc-500 text-center uppercase tracking-widest", children: "Direct Hook • Win32 SystemParametersInfo" })
            ] })
          ] })
        ] })
      ]
    }
  ) }) });
}
export {
  WallpaperWidget as default
};
