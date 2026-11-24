import { r as reactExports, j as jsxRuntimeExports, at as RiPlugLine, a5 as RiRefreshLine, G as RiAddLine, w as RiCloseLine, au as RiArrowDownSLine, av as RiArrowRightSLine, a as RiTerminalBoxLine, n as RiGlobalLine, aw as RiDeleteBin6Line, ax as RiToolsLine, ay as listMcpServers, az as getAllMcpTools, aA as saveMcpServer, aB as deleteMcpServer, aC as mediaDeviceManager, aD as RiEqualizerLine, aE as RiShieldCheckLine, a2 as RiMicLine, aF as RiStopFill, H as RiPlayFill, p as RiVolumeUpLine, aG as RiCameraLine, aH as RiVidiconLine, aI as DEFAULT_LIVE_GEMINI_MODEL, aJ as normalizeGeminiLiveModel, aK as motion, aL as GiArtificialIntelligence, aM as RiRecordCircleLine, aN as RiTerminalWindowLine, v as RiSettings4Line, aO as RiShieldKeyholeLine, aP as AnimatePresence, aQ as RiRocketLine, aR as RiDownloadCloud2Line, aj as RiTimeLine, Y as RiFolderOpenLine, aS as RiUserLine, x as RiSave3Line, ai as RiUserVoiceLine, aT as RiLock2Line, aU as RiCompass3Line, z as RiCheckLine, ao as RiSparklingLine, aV as RiLayoutBottomLine, aW as RiLayoutTopLine, aX as RiMacbookLine, a0 as RiKey2Line, $ as RiRobot2Line, A as RiBrainLine, aY as RiCpuLine, aZ as RiCloudLine, a_ as RiLockPasswordLine, a$ as RiScan2Line, b0 as RiFolderShield2Line, ak as RiExternalLinkLine, b1 as GEMINI_MODEL_OPTIONS, b2 as nets, b3 as detectSingleFace } from "./index-CYaMQ3cR.js";
import { a as DEFAULT_AI_GATEWAY_MODELS, A as AI_GATEWAY_PROVIDERS, D as DEFAULT_AI_GATEWAY_MODEL } from "./ai-provider-models-Jdd593NY.js";
const glassCard = "rounded-xl border border-white/10 bg-zinc-950/60 p-4 shadow-xl backdrop-blur-xl transition-all";
const PRESETS = [
  {
    name: "Filesystem Server",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users"]
  },
  {
    name: "Memory Graph Server",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"]
  },
  {
    name: "GitHub Server",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"]
  },
  {
    name: "Brave Search Server",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
  }
];
function McpSettingsTab() {
  const [servers, setServers] = reactExports.useState([]);
  const [tools, setTools] = reactExports.useState([]);
  const [isLoading, setIsLoading] = reactExports.useState(false);
  const [expandedServerId, setExpandedServerId] = reactExports.useState(null);
  const [showAddForm, setShowAddForm] = reactExports.useState(false);
  const [name, setName] = reactExports.useState("");
  const [transport, setTransport] = reactExports.useState("stdio");
  const [command, setCommand] = reactExports.useState("");
  const [argsStr, setArgsStr] = reactExports.useState("");
  const [url, setUrl] = reactExports.useState("");
  const [formError, setFormError] = reactExports.useState("");
  const refresh = async () => {
    setIsLoading(true);
    try {
      const [srvList, toolList] = await Promise.all([listMcpServers(), getAllMcpTools()]);
      setServers(srvList);
      setTools(toolList);
    } finally {
      setIsLoading(false);
    }
  };
  reactExports.useEffect(() => {
    refresh();
  }, []);
  const handleApplyPreset = (preset) => {
    setName(preset.name);
    setTransport(preset.transport);
    setCommand(preset.command);
    setArgsStr(preset.args.join(" "));
    setUrl("");
  };
  const handleSave = async () => {
    if (!name.trim()) {
      setFormError("Server name is required.");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setFormError("Command is required for stdio transport.");
      return;
    }
    if (transport === "sse" && !url.trim()) {
      setFormError("URL is required for SSE transport.");
      return;
    }
    setFormError("");
    const parsedArgs = argsStr.trim().split(/\s+/).filter(Boolean);
    const newConfig = {
      id: `mcp-${Date.now()}`,
      name: name.trim(),
      transport,
      enabled: true,
      command: command.trim() || void 0,
      args: parsedArgs.length > 0 ? parsedArgs : void 0,
      url: url.trim() || void 0
    };
    const res = await saveMcpServer(newConfig);
    if (res.success) {
      setShowAddForm(false);
      setName("");
      setCommand("");
      setArgsStr("");
      setUrl("");
      await refresh();
    } else {
      setFormError(res.error || "Failed to save server.");
    }
  };
  const handleToggleEnable = async (srv) => {
    const updated = {
      id: srv.id,
      name: srv.name,
      transport: srv.transport,
      enabled: !srv.enabled
    };
    await saveMcpServer(updated);
    await refresh();
  };
  const handleDelete = async (id) => {
    await deleteMcpServer(id);
    await refresh();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/5 pb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlugLine, { className: "text-emerald-400 text-xl" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold tracking-wider uppercase text-zinc-100 font-mono", children: "Model Context Protocol (MCP) Ecosystem" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 mt-1", children: "Connect Nexus to standard MCP servers to dynamically expose external tools, APIs, and databases." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: refresh,
            disabled: isLoading,
            className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white hover:border-emerald-500/50 transition-all",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { className: isLoading ? "animate-spin" : "" }),
              "SYNC"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowAddForm(!showAddForm),
            className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-xs font-mono text-emerald-300 hover:bg-emerald-500/30 transition-all",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiAddLine, {}),
              "ADD SERVER"
            ]
          }
        )
      ] })
    ] }),
    showAddForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-emerald-500/30 bg-black/80 p-5 space-y-4 shadow-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/5 pb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono font-bold uppercase tracking-wider text-emerald-400", children: "Register New MCP Server" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setShowAddForm(false),
            className: "text-zinc-400 hover:text-zinc-200 text-sm",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, {})
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase font-mono tracking-widest text-zinc-400 block mb-2", children: "Fast Presets:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: PRESETS.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => handleApplyPreset(p),
            className: "px-2.5 py-1 rounded bg-zinc-900 border border-white/10 text-[11px] font-mono text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300 transition-all",
            children: [
              "+ ",
              p.name
            ]
          },
          p.name
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1", children: "Server Label" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: name,
              onChange: (e) => setName(e.target.value),
              placeholder: "e.g. GitHub Agent",
              className: "w-full rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-400/50 font-mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1", children: "Transport Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: transport,
              onChange: (e) => setTransport(e.target.value),
              className: "w-full rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-400/50 font-mono",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "stdio", children: "stdio (Local Command / Process)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "sse", children: "SSE (HTTP / Remote Endpoint)" })
              ]
            }
          )
        ] })
      ] }),
      transport === "stdio" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1", children: "Executable Command" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: command,
              onChange: (e) => setCommand(e.target.value),
              placeholder: "npx, python, uvx...",
              className: "w-full rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-400/50 font-mono"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "md:col-span-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1", children: "Arguments (Space-separated)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: argsStr,
              onChange: (e) => setArgsStr(e.target.value),
              placeholder: "-y @modelcontextprotocol/server-filesystem C:\\...",
              className: "w-full rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-400/50 font-mono"
            }
          )
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] uppercase font-mono tracking-wider text-zinc-400 block mb-1", children: "SSE Endpoint URL" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: url,
            onChange: (e) => setUrl(e.target.value),
            placeholder: "http://localhost:8000/sse",
            className: "w-full rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-400/50 font-mono"
          }
        )
      ] }),
      formError && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-red-400 font-mono", children: formError }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-3 pt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setShowAddForm(false),
            className: "px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-zinc-400 hover:text-white",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: handleSave,
            className: "px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs font-mono hover:bg-emerald-400 transition-all",
            children: "SAVE & CONNECT"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: servers.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-8 text-center border border-dashed border-white/10 rounded-xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlugLine, { className: "text-3xl text-zinc-600 mx-auto mb-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 font-mono", children: "No MCP servers registered yet." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-500 mt-1", children: 'Click "ADD SERVER" or choose a preset above to equip Nexus with external capabilities.' })
    ] }) : servers.map((srv) => {
      const isExpanded = expandedServerId === srv.id;
      const serverTools = tools.filter((t) => t.serverId === srv.id);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: glassCard, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "flex items-center gap-3 cursor-pointer flex-1",
              onClick: () => setExpandedServerId(isExpanded ? null : srv.id),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("button", { className: "text-zinc-400 hover:text-white", children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowDownSLine, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiArrowRightSLine, {}) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  srv.transport === "stdio" ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiTerminalBoxLine, { className: "text-zinc-400 text-sm" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiGlobalLine, { className: "text-zinc-400 text-sm" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono font-medium text-zinc-200", children: srv.name })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: `inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider ${srv.status === "connected" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : srv.status === "connecting" ? "bg-amber-500/10 text-amber-400 border border-amber-500/30" : "bg-red-500/10 text-red-400 border border-red-500/30"}`,
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "span",
                        {
                          className: `w-1.5 h-1.5 rounded-full ${srv.status === "connected" ? "bg-emerald-400 animate-pulse" : srv.status === "connecting" ? "bg-amber-400 animate-ping" : "bg-red-400"}`
                        }
                      ),
                      srv.status
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-500", children: [
                  srv.toolCount,
                  " tool",
                  srv.toolCount === 1 ? "" : "s"
                ] })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleToggleEnable(srv),
                className: `px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all ${srv.enabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`,
                children: srv.enabled ? "Enabled" : "Disabled"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleDelete(srv.id),
                className: "p-1.5 text-zinc-500 hover:text-red-400 transition-colors",
                title: "Delete Server",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiDeleteBin6Line, { className: "text-xs" })
              }
            )
          ] })
        ] }),
        srv.error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-[11px] font-mono text-red-400 bg-red-950/20 p-2 rounded border border-red-900/30", children: srv.error }),
        isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 pt-3 border-t border-white/5 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-zinc-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiToolsLine, { className: "text-emerald-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "Exposed Tools (",
              serverTools.length,
              "):"
            ] })
          ] }),
          serverTools.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-500 font-mono italic", children: "No tools exposed or server not yet connected." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 scrollbar-small", children: serverTools.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "bg-black/50 p-2 rounded border border-white/5 space-y-0.5",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono font-semibold text-emerald-300 block", children: t.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 line-clamp-2", children: t.description || "No description provided." })
              ]
            },
            t.name
          )) })
        ] })
      ] }, srv.id);
    }) })
  ] });
}
function useMediaDevices() {
  const [deviceState, setDeviceState] = reactExports.useState(
    () => mediaDeviceManager.getState()
  );
  const [micLevel, setMicLevel] = reactExports.useState(0);
  const [isTestingMic, setIsTestingMic] = reactExports.useState(false);
  const [cameraPreviewStream, setCameraPreviewStream] = reactExports.useState(null);
  const [isCameraActive, setIsCameraActive] = reactExports.useState(false);
  const micStreamRef = reactExports.useRef(null);
  const audioContextRef = reactExports.useRef(null);
  const animFrameRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const unsubscribe = mediaDeviceManager.subscribe((newState) => {
      setDeviceState(newState);
    });
    return () => {
      unsubscribe();
    };
  }, []);
  const selectAudioInput = reactExports.useCallback((deviceId) => {
    mediaDeviceManager.setSelectedAudioInputId(deviceId);
  }, []);
  const selectAudioOutput = reactExports.useCallback((deviceId) => {
    mediaDeviceManager.setSelectedAudioOutputId(deviceId);
  }, []);
  const selectVideoInput = reactExports.useCallback((deviceId) => {
    mediaDeviceManager.setSelectedVideoInputId(deviceId);
  }, []);
  const refreshDevices = reactExports.useCallback(async () => {
    return await mediaDeviceManager.enumerateDevices();
  }, []);
  const requestPermissions = reactExports.useCallback(async () => {
    return await mediaDeviceManager.requestPermissions();
  }, []);
  const testAudioOutput = reactExports.useCallback(async (sinkId) => {
    await mediaDeviceManager.testAudioOutput(sinkId);
  }, []);
  const stopMicTest = reactExports.useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {
      });
      audioContextRef.current = null;
    }
    setMicLevel(0);
    setIsTestingMic(false);
  }, []);
  const startMicTest = reactExports.useCallback(async () => {
    stopMicTest();
    try {
      const constraints = {
        audio: mediaDeviceManager.getAudioConstraints({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        })
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round(average / 128 * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      setIsTestingMic(true);
      updateLevel();
    } catch (err) {
      console.warn("[useMediaDevices] startMicTest failed:", err);
      stopMicTest();
    }
  }, [stopMicTest]);
  const stopCameraPreview = reactExports.useCallback(() => {
    if (cameraPreviewStream) {
      cameraPreviewStream.getTracks().forEach((t) => t.stop());
      setCameraPreviewStream(null);
    }
    setIsCameraActive(false);
  }, [cameraPreviewStream]);
  const startCameraPreview = reactExports.useCallback(async () => {
    stopCameraPreview();
    try {
      const constraints = {
        video: mediaDeviceManager.getVideoConstraints({
          width: { ideal: 640 },
          height: { ideal: 480 }
        })
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraPreviewStream(stream);
      setIsCameraActive(true);
    } catch (err) {
      console.warn("[useMediaDevices] startCameraPreview failed:", err);
      stopCameraPreview();
    }
  }, [stopCameraPreview]);
  reactExports.useEffect(() => {
    return () => {
      stopMicTest();
      stopCameraPreview();
    };
  }, [stopMicTest, stopCameraPreview]);
  return {
    ...deviceState,
    selectAudioInput,
    selectAudioOutput,
    selectVideoInput,
    refreshDevices,
    requestPermissions,
    testAudioOutput,
    // Live mic test
    isTestingMic,
    micLevel,
    startMicTest,
    stopMicTest,
    // Live camera preview
    isCameraActive,
    cameraPreviewStream,
    startCameraPreview,
    stopCameraPreview
  };
}
const MediaDeviceSettings = ({
  cardClass = "bg-[#0a0a0c] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl",
  titleClass = "text-xs font-mono font-bold tracking-widest text-zinc-400 uppercase flex items-center gap-2",
  compact = false
}) => {
  const {
    audioInputs,
    audioOutputs,
    videoInputs,
    selectedAudioInputId,
    selectedAudioOutputId,
    selectedVideoInputId,
    selectAudioInput,
    selectAudioOutput,
    selectVideoInput,
    refreshDevices,
    requestPermissions,
    testAudioOutput,
    isTestingMic,
    micLevel,
    startMicTest,
    stopMicTest,
    isCameraActive,
    cameraPreviewStream,
    startCameraPreview,
    stopCameraPreview
  } = useMediaDevices();
  const videoRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (videoRef.current && cameraPreviewStream) {
      videoRef.current.srcObject = cameraPreviewStream;
      videoRef.current.play().catch(() => {
      });
    }
  }, [cameraPreviewStream]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex flex-col gap-6 w-full`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiEqualizerLine, { className: "text-cyan-400", size: 18 }),
          " Media & Hardware Routing"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 mt-1 font-sans", children: "Choose active microphone input, speaker output, and camera feed for Nexus AI." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => requestPermissions(),
            className: "px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer",
            title: "Scan & detect system device labels",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiShieldCheckLine, { size: 14, className: "text-emerald-400" }),
              " Unlock Labels"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => refreshDevices(),
            className: "px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer",
            title: "Rescan connected audio and video devices",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { size: 14, className: "text-cyan-400" }),
              " Refresh"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiMicLine, { className: "text-emerald-400", size: 18 }),
            " Microphone (Audio Input)"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10", children: [
            audioInputs.length,
            " ",
            audioInputs.length === 1 ? "Device" : "Devices"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] font-mono text-zinc-400", children: "Input Source Device" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: selectedAudioInputId,
              onChange: (e) => {
                selectAudioInput(e.target.value);
                if (isTestingMic) {
                  stopMicTest();
                }
              },
              className: "w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-emerald-500/50 transition-colors cursor-pointer font-sans",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "default", children: "System Default Microphone" }),
                audioInputs.map((d, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: d.deviceId, children: d.label || `Microphone ${index + 1}` }, d.deviceId || `input-${index}`))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#050505] border border-white/5 rounded-xl p-3 flex flex-col gap-2 mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[11px] font-mono text-zinc-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: `w-2 h-2 rounded-full ${isTestingMic ? "bg-emerald-400 animate-ping" : "bg-zinc-600"}`
                }
              ),
              "Mic Volume Monitor"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => isTestingMic ? stopMicTest() : startMicTest(),
                className: `px-2.5 py-1 rounded text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 transition-all cursor-pointer ${isTestingMic ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"}`,
                children: isTestingMic ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiStopFill, { size: 12 }),
                  " Stop Test"
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlayFill, { size: 12 }),
                  " Test Mic"
                ] })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 p-0.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: `h-full rounded-full transition-all duration-75 ${micLevel > 75 ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" : micLevel > 40 ? "bg-gradient-to-r from-emerald-500 to-emerald-300" : "bg-emerald-500"}`,
              style: { width: `${isTestingMic ? Math.max(3, micLevel) : 0}%` }
            }
          ) }),
          isTestingMic && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[10px] font-mono text-zinc-500 text-right", children: [
            "Level: ",
            micLevel,
            "%"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cardClass, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiVolumeUpLine, { className: "text-cyan-400", size: 18 }),
            " Speakers (Audio Output)"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10", children: [
            audioOutputs.length,
            " ",
            audioOutputs.length === 1 ? "Device" : "Devices"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] font-mono text-zinc-400", children: "Output Playback Sink" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: selectedAudioOutputId,
              onChange: (e) => selectAudioOutput(e.target.value),
              className: "w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-cyan-500/50 transition-colors cursor-pointer font-sans",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "default", children: "System Default Speakers" }),
                audioOutputs.map((d, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: d.deviceId, children: d.label || `Speaker ${index + 1}` }, d.deviceId || `output-${index}`))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#050505] border border-white/5 rounded-xl p-3 flex items-center justify-between mt-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono text-zinc-300", children: "Speaker Sound Check" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500", children: "Play confirmation chime" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => testAudioOutput(),
              className: "px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer font-bold tracking-wider",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiVolumeUpLine, { size: 14 }),
                " PLAY CHIME"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} md:col-span-2`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiCameraLine, { className: "text-purple-400", size: 18 }),
            " Camera (Video Input)"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10", children: [
            videoInputs.length,
            " ",
            videoInputs.length === 1 ? "Device" : "Devices"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[11px] font-mono text-zinc-400", children: "Primary Optical Sensor" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "select",
              {
                value: selectedVideoInputId,
                onChange: (e) => {
                  selectVideoInput(e.target.value);
                  if (isCameraActive) {
                    stopCameraPreview();
                  }
                },
                className: "w-full bg-[#050505] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-zinc-200 outline-none focus:border-purple-500/50 transition-colors cursor-pointer font-sans",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "default", children: "System Default Webcam" }),
                  videoInputs.map((d, index) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: d.deviceId, children: d.label || `Camera ${index + 1}` }, d.deviceId || `camera-${index}`))
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3 mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => isCameraActive ? stopCameraPreview() : startCameraPreview(),
                className: `px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${isCameraActive ? "bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30" : "bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30"}`,
                children: isCameraActive ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiStopFill, { size: 14 }),
                  " Turn Off Camera"
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiVidiconLine, { size: 14 }),
                  " Test Camera Feed"
                ] })
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-500 font-sans", children: "Camera feed is used for Face ID biometric unlock and multimodal vision AI reasoning." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative min-h-[160px] max-h-[220px] rounded-xl overflow-hidden bg-black border border-white/10 flex items-center justify-center", children: isCameraActive ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "video",
              {
                ref: videoRef,
                autoPlay: true,
                playsInline: true,
                muted: true,
                className: "w-full h-full object-cover"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 border border-emerald-500/40 text-[9px] font-mono text-emerald-300 flex items-center gap-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" }),
              "LIVE SENSOR"
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center gap-2 p-6 text-center text-zinc-600", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiCameraLine, { size: 32, className: "opacity-40" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono", children: "Camera preview inactive" })
          ] }) })
        ] })
      ] })
    ] })
  ] });
};
const liveGeminiModelOptions = GEMINI_MODEL_OPTIONS.filter((model) => model.live);
const SettingsView = ({ isSystemActive }) => {
  const [activeTab, setActiveTab] = reactExports.useState("updates");
  const [voice, setVoice] = reactExports.useState(
    localStorage.getItem("nexus_voice_profile") || "MALE"
  );
  const [personality, setPersonality] = reactExports.useState("");
  const [userName, setUserName] = reactExports.useState(localStorage.getItem("nexus_user_name") || "");
  const [geminiKey, setGeminiKey] = reactExports.useState(localStorage.getItem("nexus_custom_api_key") || "");
  const [groqKey, setGroqKey] = reactExports.useState(localStorage.getItem("nexus_groq_api_key") || "");
  const [fireworksKey, setFireworksKey] = reactExports.useState(
    localStorage.getItem("nexus_fireworks_api_key") || ""
  );
  const [hfKey, setHfKey] = reactExports.useState(localStorage.getItem("nexus_hf_api_key") || "");
  const [tailvyKey, setTailvyKey] = reactExports.useState(localStorage.getItem("nexus_tailvy_api_key") || "");
  const [puterToken, setPuterToken] = reactExports.useState(
    localStorage.getItem("nexus_puter_token") || ""
  );
  const [defaultModel, setDefaultModel] = reactExports.useState(
    normalizeGeminiLiveModel(localStorage.getItem("nexus_default_ai_model")) || DEFAULT_LIVE_GEMINI_MODEL
  );
  const [isSecurityUnlocked, setIsSecurityUnlocked] = reactExports.useState(false);
  const [authPin, setAuthPin] = reactExports.useState("");
  const [authError, setAuthError] = reactExports.useState(false);
  const [newPin, setNewPin] = reactExports.useState("");
  const [faceCount, setFaceCount] = reactExports.useState(0);
  const [isScanningFace, setIsScanningFace] = reactExports.useState(false);
  const [enrollStatus, setEnrollStatus] = reactExports.useState("");
  const videoRef = reactExports.useRef(null);
  const [appVersion, setAppVersion] = reactExports.useState("1.1.5");
  const [updateStatus, setUpdateStatus] = reactExports.useState("idle");
  const [updateVersion, setUpdateVersion] = reactExports.useState("");
  const [updateNotes, setUpdateNotes] = reactExports.useState("No new updates detected.");
  const [downloadProgress, setDownloadProgress] = reactExports.useState(0);
  const [downloadedFilePath, setDownloadedFilePath] = reactExports.useState("");
  const [updateAssetName, setUpdateAssetName] = reactExports.useState("");
  const [gatewayModels, setGatewayModels] = reactExports.useState(DEFAULT_AI_GATEWAY_MODELS);
  const [sandboxEnabled, setSandboxEnabled] = reactExports.useState(true);
  const [sandboxWorkspace, setSandboxWorkspace] = reactExports.useState("");
  const [sandboxBlockedCount, setSandboxBlockedCount] = reactExports.useState(0);
  const [dockLocation, setDockLocation] = reactExports.useState("taskbar-left");
  const [dockStyle, setDockStyle] = reactExports.useState("line");
  const [dockSavedNotice, setDockSavedNotice] = reactExports.useState(false);
  const handleSaveDockConfig = async (loc = dockLocation, sty = dockStyle) => {
    try {
      if (window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("set-dock-config", {
          location: loc,
          style: sty,
          setupCompleted: true
        });
      }
      localStorage.setItem("nexus_dock_location", loc);
      localStorage.setItem("nexus_dock_style", sty);
      setDockSavedNotice(true);
      setTimeout(() => setDockSavedNotice(false), 3e3);
    } catch (err) {
      console.warn("[Settings] Failed to save dock config:", err);
    }
  };
  reactExports.useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke("get-dock-config").then((cfg) => {
        if (cfg?.location) setDockLocation(cfg.location);
        if (cfg?.style) setDockStyle(cfg.style);
      }).catch(() => {
      });
      window.electron.ipcRenderer.invoke("get-personality").then((res) => {
        if (res) setPersonality(res);
      });
      window.electron.ipcRenderer.invoke("check-vault-status").then((res) => setFaceCount(res?.faceCount || 0));
      window.electron.ipcRenderer.invoke("get-app-version").then((v) => setAppVersion(v));
      window.electron.ipcRenderer.invoke("get-update-status").then((res) => {
        if (res?.isDownloaded && res?.status === "downloaded") {
          setUpdateStatus("ready");
          if (res.latestVersion) setUpdateVersion(res.latestVersion);
          if (res.releaseNotes) setUpdateNotes(res.releaseNotes);
          if (res.filePath) setDownloadedFilePath(res.filePath);
          if (res.assetName) setUpdateAssetName(res.assetName);
        } else if (res?.status === "available") {
          setUpdateStatus("available");
          if (res.latestVersion) setUpdateVersion(res.latestVersion);
          if (res.releaseNotes) setUpdateNotes(res.releaseNotes);
          if (res.assetName) setUpdateAssetName(res.assetName);
        }
      }).catch(() => {
      });
      window.electron.ipcRenderer.invoke("sandbox:get-status").then((res) => {
        if (res) {
          setSandboxEnabled(res.enabled);
          setSandboxWorkspace(res.workspaceDir || res.rootDir);
          setSandboxBlockedCount(res.blockedCount || 0);
        }
      }).catch(() => {
      });
      window.electron.ipcRenderer.on("sandbox:violation-alert", () => {
        setSandboxBlockedCount((prev) => prev + 1);
      });
      window.electron.ipcRenderer.on("updater-event", (_e, { status, data, error }) => {
        if (status === "checking") setUpdateStatus("checking");
        if (status === "available") {
          setUpdateStatus("available");
          setUpdateVersion(data.version);
          setUpdateNotes(data.releaseNotes || "Bug fixes and performance improvements.");
          if (data.assetName) setUpdateAssetName(data.assetName);
        }
        if (status === "not-available") {
          setUpdateStatus("idle");
          setUpdateNotes("System is up to date with latest GitHub release.");
        }
        if (status === "downloading") {
          setUpdateStatus("downloading");
          setDownloadProgress(Math.round(data.percent));
          if (data.assetName) setUpdateAssetName(data.assetName);
        }
        if (status === "downloaded") {
          setUpdateStatus("ready");
          if (data.version) setUpdateVersion(data.version);
          if (data.releaseNotes) setUpdateNotes(data.releaseNotes);
          if (data.filePath) setDownloadedFilePath(data.filePath);
          if (data.assetName) setUpdateAssetName(data.assetName);
        }
        if (status === "error") {
          setUpdateStatus("error");
          setUpdateNotes(`Error: ${error}`);
        }
      });
    }
    return () => {
      if (window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.removeAllListeners("updater-event");
        window.electron.ipcRenderer.removeAllListeners("sandbox:violation-alert");
      }
    };
  }, []);
  reactExports.useEffect(() => {
    AI_GATEWAY_PROVIDERS.forEach(async (provider) => {
      if (provider === "gemini") return;
      try {
        const result = await window.electron?.ipcRenderer?.invoke("ai-gateway:list-models", {
          provider
        });
        if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
          setGatewayModels((current) => ({ ...current, [provider]: result.models }));
        }
      } catch {
      }
    });
  }, []);
  const checkForUpdates = (force = false) => window.electron.ipcRenderer.invoke("check-for-updates", force);
  const downloadUpdate = () => window.electron.ipcRenderer.invoke("download-update");
  const installUpdate = () => window.electron.ipcRenderer.invoke("install-update");
  const deferUpdate = () => {
    window.electron.ipcRenderer.invoke("defer-update");
    setUpdateStatus("idle");
    setUpdateNotes("Update deferred. Downloaded installer is preserved on disk for later.");
  };
  const openUpdatesFolder = () => window.electron.ipcRenderer.invoke("open-updates-folder");
  const handleVoiceChange = (v) => {
    if (isSystemActive) return;
    setVoice(v);
    localStorage.setItem("nexus_voice_profile", v);
  };
  const handlePersonalityChange = (e) => {
    const text = e.target.value;
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= 150) setPersonality(text);
  };
  const savePersonality = async () => {
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke("set-personality", personality);
      alert("Personality Matrix Saved Securely to OS.");
    }
  };
  const saveUserName = () => {
    localStorage.setItem("nexus_user_name", userName);
    alert("User Designation Saved.");
  };
  const handleToggleSandbox = async () => {
    const nextVal = !sandboxEnabled;
    setSandboxEnabled(nextVal);
    try {
      const res = await window.electron.ipcRenderer.invoke("sandbox:set-enabled", nextVal);
      if (res) {
        setSandboxEnabled(res.enabled);
        setSandboxBlockedCount(res.blockedCount || 0);
      }
    } catch {
    }
  };
  const handleOpenSandboxFolder = () => {
    window.electron.ipcRenderer.invoke("sandbox:open-folder").catch(() => {
    });
  };
  const saveApiKeys = async () => {
    localStorage.setItem("nexus_custom_api_key", geminiKey);
    localStorage.setItem("nexus_groq_api_key", groqKey);
    localStorage.setItem("nexus_fireworks_api_key", fireworksKey);
    localStorage.setItem("nexus_hf_api_key", hfKey);
    localStorage.setItem("nexus_tailvy_api_key", tailvyKey);
    localStorage.setItem("nexus_puter_token", puterToken);
    localStorage.setItem("nexus_default_ai_model", normalizeGeminiLiveModel(defaultModel));
    if (window.electron?.ipcRenderer) {
      try {
        await window.electron.ipcRenderer.invoke("secure-save-keys", {
          groqKey,
          geminiKey,
          fireworksKey,
          puterToken
        });
      } catch (e) {
      }
    }
    alert(
      "All Neural Uplinks (API Keys) secured locally and in OS Vault. Restart AI modules to apply."
    );
  };
  const currentWordCount = personality.trim().split(/\s+/).filter((w) => w.length > 0).length;
  const unlockSecurityModule = async () => {
    if (!window.electron?.ipcRenderer) return;
    const isValid = await window.electron.ipcRenderer.invoke("verify-vault-pin", authPin);
    if (isValid) {
      setIsSecurityUnlocked(true);
      setAuthPin("");
    } else {
      setAuthError(true);
      setTimeout(() => setAuthError(false), 1e3);
    }
  };
  const updateMasterPin = async () => {
    if (newPin.length !== 4 || !window.electron?.ipcRenderer) return;
    await window.electron.ipcRenderer.invoke("setup-vault-pin", newPin);
    setNewPin("");
    alert("Master PIN Updated Successfully.");
  };
  const startFaceEnrollment = async () => {
    setIsScanningFace(true);
    setEnrollStatus("INITIALIZING CAMERA...");
    try {
      await Promise.all([
        nets.ssdMobilenetv1.loadFromUri("./models"),
        nets.faceLandmark68Net.loadFromUri("./models"),
        nets.faceRecognitionNet.loadFromUri("./models")
      ]);
      const videoConstraints = mediaDeviceManager.getVideoConstraints(true);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setEnrollStatus("POSITION FACE IN FRAME");
        const scanInterval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState !== 4) return;
          const detection = await detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
          if (detection) {
            clearInterval(scanInterval);
            setEnrollStatus("FACE ACQUIRED. ENCRYPTING...");
            const descriptorArray = Array.from(detection.descriptor);
            if (window.electron?.ipcRenderer) {
              await window.electron.ipcRenderer.invoke("setup-vault-face", descriptorArray);
            }
            stream.getTracks().forEach((t) => t.stop());
            setIsScanningFace(false);
            setFaceCount((prev) => prev + 1);
            alert("New Biometric Identity Saved.");
          }
        }, 1e3);
      }
    } catch (e) {
      setEnrollStatus("CAMERA ERROR");
      setTimeout(() => setIsScanningFace(false), 2e3);
    }
  };
  const cardClass = "bg-[#0f0f13] border border-white/10 p-6 md:p-8 rounded-2xl flex flex-col gap-5 hover:border-white/20 transition-all shadow-lg";
  const inputContainerClass = "flex items-center bg-[#050505] border border-white/10 rounded-lg px-4 py-3 focus-within:border-white/30 focus-within:bg-black transition-all duration-300 w-full";
  const titleClass = "text-sm font-semibold text-white flex items-center gap-2";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full w-full p-6 md:p-10 lg:p-16 flex flex-col items-center bg-black text-zinc-100 overflow-y-auto scrollbar-small pb-36", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    motion.div,
    {
      className: "w-full max-w-4xl flex flex-col gap-8",
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 bg-[#111] rounded-2xl border border-white/10 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.03)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(GiArtificialIntelligence, { size: 36, className: "text-white" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight text-white", children: "Command Center" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-zinc-400 font-mono mt-1 tracking-widest flex items-center gap-2 uppercase", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  RiRecordCircleLine,
                  {
                    className: `${isSystemActive ? "text-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" : "text-zinc-600"}`,
                    size: 14
                  }
                ),
                isSystemActive ? "System Online" : "System Offline"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex bg-[#0a0a0c] p-1 rounded-xl border border-white/10 w-full md:w-fit shadow-lg overflow-x-auto scrollbar-none", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("updates"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "updates" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiTerminalWindowLine, { size: 16 }),
                  " SYSTEM"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("general"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "general" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiSettings4Line, { size: 16 }),
                  " GENERAL"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("devices"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "devices" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiEqualizerLine, { size: 16 }),
                  " DEVICES & AUDIO"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("keys"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "keys" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlugLine, { size: 16 }),
                  " API KEYS"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("mcp"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "mcp" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiToolsLine, { size: 16 }),
                  " MCP TOOLS"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setActiveTab("security"),
                className: `flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold tracking-widest rounded-lg transition-all duration-300 ${activeTab === "security" ? "bg-white text-black shadow-md" : "text-zinc-500 hover:text-white hover:bg-white/5"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiShieldKeyholeLine, { size: 16 }),
                  " SECURITY"
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full pb-24 mt-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AnimatePresence, { mode: "wait", children: [
          activeTab === "updates" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "grid grid-cols-1 md:grid-cols-2 gap-6 w-full",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} md:col-span-1 border-emerald-500/20`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center border-b border-white/10 pb-4", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiRocketLine, { className: "text-emerald-400", size: 18 }),
                      " OS Firmware"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded font-mono font-bold tracking-widest", children: [
                      "v",
                      appVersion
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-4 items-center justify-center flex-1 py-4 text-center", children: updateStatus === "idle" || updateStatus === "error" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiTerminalWindowLine, { size: 48, className: "text-zinc-700" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 font-mono", children: "Current build is stable." }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "button",
                      {
                        onClick: () => checkForUpdates(),
                        className: "mt-2 w-full py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all cursor-pointer",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { size: 16 }),
                          " CHECK FOR UPDATES"
                        ]
                      }
                    )
                  ] }) : updateStatus === "checking" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { size: 48, className: "text-emerald-500 animate-spin" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-emerald-400 font-mono animate-pulse", children: "PINGING NEURAL NETWORK..." })
                  ] }) : updateStatus === "available" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiDownloadCloud2Line, { size: 48, className: "text-cyan-400" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-cyan-400 font-mono", children: [
                      "NEW BUILD FOUND: v",
                      updateVersion
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "button",
                      {
                        onClick: downloadUpdate,
                        className: "mt-2 w-full py-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 text-cyan-400 hover:text-black font-bold tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all border border-cyan-500/50 cursor-pointer",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(RiDownloadCloud2Line, { size: 16 }),
                          " INITIALIZE DOWNLOAD"
                        ]
                      }
                    )
                  ] }) : updateStatus === "downloading" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full flex flex-col gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between text-[10px] font-mono text-zinc-400", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "DOWNLOADING PATCH..." }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                        downloadProgress,
                        "%"
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-2 bg-black rounded-full overflow-hidden border border-white/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "div",
                      {
                        className: "h-full bg-cyan-500 shadow-[0_0_10px_#06b6d4] transition-all duration-300",
                        style: { width: `${downloadProgress}%` }
                      }
                    ) })
                  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full flex flex-col gap-2.5 items-center", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiRecordCircleLine, { size: 44, className: "text-emerald-400 animate-pulse" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-emerald-400 font-mono font-bold tracking-wide", children: "PACKAGE DOWNLOADED & PRESERVED" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-400 font-mono", children: [
                        "Ready to apply v",
                        updateVersion
                      ] })
                    ] }),
                    updateAssetName && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full bg-zinc-950/80 px-3 py-1.5 rounded-lg border border-white/10 text-left font-mono text-[10px] text-zinc-300 truncate", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 mr-1.5", children: "File:" }),
                      updateAssetName
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-400 text-center leading-relaxed", children: "The update package is safely kept on your PC. You can apply the update now and restart, or keep working and apply it later." }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 w-full mt-1", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          onClick: installUpdate,
                          className: "w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black tracking-widest text-[11px] flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer uppercase",
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(RiRocketLine, { size: 16 }),
                            " Execute Restart Now"
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "button",
                          {
                            onClick: deferUpdate,
                            className: "flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-bold tracking-wider text-[10px] flex items-center justify-center gap-1.5 transition-all border border-white/10 cursor-pointer uppercase",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(RiTimeLine, { size: 14 }),
                              " Update Later"
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "button",
                          {
                            onClick: openUpdatesFolder,
                            className: "py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white font-mono text-[10px] flex items-center justify-center gap-1 transition-all border border-white/10 cursor-pointer",
                            title: "Reveal downloaded installer in Explorer",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(RiFolderOpenLine, { size: 14 }),
                              " View File"
                            ]
                          }
                        )
                      ] })
                    ] })
                  ] }) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} md:col-span-1`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-between items-center border-b border-white/10 pb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiTerminalWindowLine, { className: "text-zinc-400", size: 18 }),
                    " Patch Notes"
                  ] }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 bg-[#050505] border border-white/5 rounded-xl p-4 overflow-y-auto max-h-60 scrollbar-small", children: /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "text-[11px] font-mono text-zinc-400 whitespace-pre-wrap leading-relaxed", children: updateNotes }) })
                ] })
              ]
            },
            "updates"
          ),
          activeTab === "general" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "grid grid-cols-1 md:grid-cols-2 gap-6 w-full",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} md:col-span-2`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiUserLine, { className: "text-zinc-400", size: 18 }),
                      " AI Personality Matrix"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "span",
                        {
                          className: `text-[10px] font-mono tracking-widest ${currentWordCount >= 150 ? "text-red-400" : "text-zinc-400"}`,
                          children: [
                            currentWordCount,
                            " / 150 WORDS"
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: savePersonality,
                          className: "text-zinc-400 hover:text-white transition-colors bg-white/5 p-2 rounded-md hover:bg-white/10 border border-white/5",
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSave3Line, { size: 18 })
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "textarea",
                    {
                      value: personality,
                      onChange: handlePersonalityChange,
                      placeholder: "Define who NEXUS is. Example: 'You are a sassy, highly technical assistant...'",
                      className: "bg-[#050505] border border-white/10 rounded-lg p-4 text-sm text-zinc-200 h-32 resize-none focus:border-white/30 outline-none transition-all scrollbar-small"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: cardClass, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-between items-end", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiUserLine, { className: "text-zinc-400", size: 18 }),
                    " User Designation"
                  ] }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: inputContainerClass, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "text",
                        value: userName,
                        onChange: (e) => setUserName(e.target.value),
                        placeholder: "Enter operator name...",
                        className: "bg-transparent border-none outline-none text-sm text-zinc-100 w-full placeholder:text-zinc-600 font-medium"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: saveUserName,
                        className: "text-zinc-500 hover:text-white transition-colors ml-2",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSave3Line, { size: 20 })
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} relative`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiUserVoiceLine, { className: "text-zinc-400", size: 18 }),
                      " OS Voice Profile"
                    ] }),
                    isSystemActive && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-red-400 font-mono tracking-widest flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded border border-red-500/20", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiLock2Line, {}),
                      " LOCKED AS NEXUS IS CONNECTED"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      className: `flex gap-3 h-12 mt-1 ${isSystemActive ? "opacity-40 cursor-not-allowed" : ""}`,
                      children: ["FEMALE", "MALE"].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: () => handleVoiceChange(s),
                          disabled: isSystemActive,
                          className: `cursor-pointer flex-1 flex items-center justify-center text-[12px] font-bold rounded-lg transition-all tracking-widest border ${voice === s ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]" : "bg-[#050505] border-white/10 text-zinc-400 hover:text-white hover:border-white/30"}`,
                          children: s
                        },
                        s
                      ))
                    }
                  ),
                  isSystemActive && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      className: "absolute inset-0 z-10",
                      title: "Disconnect AI to change voice"
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} md:col-span-2 border-emerald-500/20`, children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiCompass3Line, { className: "text-emerald-400", size: 18 }),
                        " HUD & Dock Variable Placement"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 mt-0.5", children: "Relocate your sovereign Nexus dock anytime. Move it to the taskbar empty slot, webcam notch, or drag it anywhere." })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                      dockSavedNotice && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30 flex items-center gap-1 animate-pulse", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckLine, { size: 12 }),
                        " DOCK RELOCATED"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => window.dispatchEvent(new CustomEvent("nexus-open-dock-setup")),
                          className: "px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-mono text-zinc-300 hover:text-white transition-all flex items-center gap-1 cursor-pointer",
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingLine, { size: 12, className: "text-cyan-400" }),
                            " Open Wizard"
                          ]
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2.5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiLayoutBottomLine, { size: 14, className: "text-emerald-400" }),
                      " Screen Placement Preset"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("taskbar-left");
                            handleSaveDockConfig("taskbar-left", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "taskbar-left" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx(RiLayoutBottomLine, { size: 14, className: "text-emerald-300" }),
                                " Taskbar Empty Slot"
                              ] }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40", children: "WIN 11" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Sits in empty space between Weather and Start icons." })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("top-center");
                            handleSaveDockConfig("top-center", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "top-center" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx(RiLayoutTopLine, { size: 14, className: "text-teal-300" }),
                                " Camera Notch"
                              ] }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300", children: "TOP CENTER" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Floats centered right under your webcam bezel." })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("bottom-center");
                            handleSaveDockConfig("bottom-center", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "bottom-center" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(RiMacbookLine, { size: 14, className: "text-cyan-300" }),
                              " Bottom Center"
                            ] }) }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Centered above taskbar at screen bottom." })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("top-right");
                            handleSaveDockConfig("top-right", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "top-right" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingLine, { size: 14, className: "text-cyan-300" }),
                              " Top Right Corner"
                            ] }) }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Discreet telemetry in upper right display corner." })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("top-left");
                            handleSaveDockConfig("top-left", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "top-left" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(RiLayoutTopLine, { size: 14, className: "text-zinc-300" }),
                              " Top Left Corner"
                            ] }) }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Discreet telemetry in upper left display corner." })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setDockLocation("custom");
                            handleSaveDockConfig("custom", dockStyle);
                          },
                          className: `text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${dockLocation === "custom" ? "border-cyan-400/80 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white flex items-center gap-1.5", children: [
                                /* @__PURE__ */ jsxRuntimeExports.jsx(RiCompass3Line, { size: 14, className: "text-cyan-300" }),
                                " Custom Dragged"
                              ] }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300", children: "FREE DRAG" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10.5px] text-zinc-400", children: "Drag the dock anywhere. Nexus remembers custom X/Y." })
                          ]
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2.5 pt-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingLine, { size: 14, className: "text-cyan-400" }),
                      " Visual Density & Profile"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          onClick: () => {
                            setDockStyle("line");
                            handleSaveDockConfig(dockLocation, "line");
                          },
                          className: `p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2.5 ${dockStyle === "line" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-white", children: "2mm Cyber Line (Extra Compact)" }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40", children: "STEALTH 2MM" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-400", children: "Futuristic glowing neon laser strip below camera (~2mm). Whisper-quiet, expands on hover." }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative h-[3px] w-28 rounded-full bg-gradient-to-r from-emerald-400 via-teal-200 to-cyan-400 shadow-[0_0_10px_#10b981,0_0_20px_rgba(6,182,212,0.8)]" }) })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          onClick: () => {
                            setDockStyle("pill");
                            handleSaveDockConfig(dockLocation, "pill");
                          },
                          className: `p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-2.5 ${dockStyle === "pill" ? "border-emerald-400/80 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "border-white/10 bg-[#050505] hover:border-white/20"}`,
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-white", children: "Dynamic Island Pill (Standard 40px)" }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-zinc-300", children: "CLASSIC" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-400", children: "Curved glass capsule with NX LIVE indicator, audio waveform equalizer, and mic button." }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-8 rounded-lg bg-black/60 border border-white/5 flex items-center justify-center px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-5 w-28 rounded-full border border-white/20 bg-slate-900/60 px-2 flex items-center justify-between text-[7.5px] font-bold text-emerald-300", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "NX LIVE" }),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" })
                            ] }) })
                          ]
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[11px] text-zinc-400 font-mono", children: [
                      "Current: ",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-300 font-bold uppercase", children: dockLocation }),
                      " •",
                      " ",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-cyan-300 font-bold uppercase", children: dockStyle === "line" ? "2mm Cyber Line" : "Dynamic Island" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            if (window.electron?.ipcRenderer) {
                              window.electron.ipcRenderer.send("dock-command", "open-dock")(window).electron.ipcRenderer.send("dock-command", "reposition-dock");
                            }
                          },
                          className: "px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 hover:text-white transition-all cursor-pointer",
                          children: "Reveal Dock Window"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => handleSaveDockConfig(dockLocation, dockStyle),
                          className: "px-4 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold tracking-wider uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer",
                          children: "Save Placement"
                        }
                      )
                    ] })
                  ] })
                ] })
              ]
            },
            "general"
          ),
          activeTab === "devices" && /* @__PURE__ */ jsxRuntimeExports.jsx(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "w-full",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(MediaDeviceSettings, { cardClass, titleClass })
            },
            "devices"
          ),
          activeTab === "keys" && /* @__PURE__ */ jsxRuntimeExports.jsx(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "grid grid-cols-1 gap-6 w-full",
              children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `${cardClass} gap-6`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RiKey2Line, { className: "text-zinc-400", size: 18 }),
                    " External API Endpoints"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      onClick: saveApiKeys,
                      className: "bg-white text-black px-6 py-2.5 rounded-lg text-xs font-bold tracking-widest hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 cursor-pointer",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiSave3Line, { size: 16 }),
                        " SAVE ALL KEYS"
                      ]
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiRobot2Line, { size: 14 }),
                      " Default Voice AI Model (Gemini Live / Groq LPU)"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "select",
                      {
                        value: defaultModel,
                        onChange: (e) => {
                          const nextModel = normalizeGeminiLiveModel(e.target.value);
                          setDefaultModel(nextModel);
                          localStorage.setItem("nexus_default_ai_model", nextModel);
                        },
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full",
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("optgroup", { label: "Google Gemini Live", className: "bg-black text-emerald-400 font-semibold", children: liveGeminiModelOptions.filter((m) => !m.id.startsWith("groq/")).map((model) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { className: "bg-black text-zinc-100", value: model.id, children: [
                            model.label,
                            " - ",
                            model.limits
                          ] }, model.id)) }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("optgroup", { label: "Groq Cloud LPU", className: "bg-black text-orange-400 font-semibold", children: liveGeminiModelOptions.filter((m) => m.id.startsWith("groq/")).map((model) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { className: "bg-black text-zinc-100", value: model.id, children: [
                            model.label,
                            " - ",
                            model.limits
                          ] }, model.id)) })
                        ]
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiBrainLine, { size: 14 }),
                      " Gemini Pro Core"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: geminiKey,
                        onChange: (e) => setGeminiKey(e.target.value),
                        placeholder: "AIzaSy_...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiCpuLine, { size: 14 }),
                      " Groq Fast Inferencing"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: groqKey,
                        onChange: (e) => setGroqKey(e.target.value),
                        placeholder: "gsk_...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloudLine, { size: 14 }),
                      " Fireworks AI Fallback"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: fireworksKey,
                        onChange: (e) => setFireworksKey(e.target.value),
                        placeholder: "fw_...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3 md:col-span-2 rounded-xl border border-white/5 bg-[#050505] p-4", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase", children: "AI Gateway fallback models" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-3", children: AI_GATEWAY_PROVIDERS.map((provider) => {
                      const storageKey = `nexus_default_${provider}_model`;
                      const savedModel = localStorage.getItem(storageKey);
                      const selected = (provider === "gemini" && (savedModel === "models/gemini-2.5-flash" || savedModel === "models/gemini-2.0-flash" || savedModel === "models/gemini-1.5-flash") ? DEFAULT_AI_GATEWAY_MODEL[provider] : savedModel) || DEFAULT_AI_GATEWAY_MODEL[provider];
                      return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex flex-col gap-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] text-zinc-500 font-mono uppercase tracking-widest", children: provider }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "select",
                          {
                            defaultValue: selected,
                            onChange: (e) => localStorage.setItem(storageKey, e.target.value),
                            className: "bg-black border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono text-zinc-200 outline-none",
                            children: (gatewayModels[provider] || DEFAULT_AI_GATEWAY_MODELS[provider]).map((model) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { className: "bg-black", value: model.id, children: model.label }, model.id))
                          }
                        )
                      ] }, provider);
                    }) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloudLine, { size: 14 }),
                      " Hugging Face Vision"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: hfKey,
                        onChange: (e) => setHfKey(e.target.value),
                        placeholder: "hf_...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-zinc-400 font-mono tracking-widest uppercase flex items-center gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlugLine, { size: 14 }),
                      " Tailvy Builder Agent"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: tailvyKey,
                        onChange: (e) => setTailvyKey(e.target.value),
                        placeholder: "tlv_...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-[10px] text-amber-400 font-mono tracking-widest uppercase flex items-center gap-2 font-bold", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiRocketLine, { size: 14 }),
                        " Puter.js AI Engine (Primary Sovereign Free LLMs & Art)"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded", children: "Primary Engine (Active)" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: inputContainerClass, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "input",
                      {
                        type: "password",
                        value: puterToken,
                        onChange: (e) => setPuterToken(e.target.value),
                        placeholder: "Optional Puter auth token (Puter works zero-auth out of the box)...",
                        className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full placeholder:text-zinc-700"
                      }
                    ) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-500 font-mono", children: "Provides zero-barrier primary access to GPT-4o, Claude 3.7 Sonnet, DeepSeek R1, Mistral Large, and Puter txt2img without requiring paid subscriptions." })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#050505] border border-white/5 p-4 rounded-xl mt-2 flex items-start gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiShieldKeyholeLine, { className: "text-zinc-500 shrink-0 mt-0.5", size: 16 }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 font-mono leading-relaxed", children: "[SECURITY NOTICE]: All API keys are encrypted and stored strictly in your local OS. NEXUS does not transmit these keys to any centralized server. You maintain full ownership and billing control over your provider endpoints." })
                ] })
              ] })
            },
            "keys"
          ),
          activeTab === "security" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "w-full rounded-3xl overflow-hidden shadow-2xl border border-white/5 relative",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(AnimatePresence, { children: !isSecurityUnlocked && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  motion.div,
                  {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0, backdropFilter: "blur(0px)" },
                    className: "absolute inset-0 z-20 backdrop-blur-2xl bg-black/70 border border-white/10 rounded-3xl flex flex-col items-center justify-center",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-[#111] p-5 rounded-full mb-6 border border-white/10 shadow-[0_0_30px_rgba(255,255,255,0.05)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiLockPasswordLine, { size: 40, className: "text-white" }) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-300 font-mono tracking-widest uppercase mb-6 font-semibold", children: "Authenticate to access Vault Settings" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3 items-center h-12", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "input",
                          {
                            type: "password",
                            maxLength: 4,
                            pattern: "\\d*",
                            value: authPin,
                            onChange: (e) => setAuthPin(e.target.value.replace(/\D/g, "")),
                            placeholder: "PIN",
                            className: `h-full bg-[#050505] border w-32 rounded-lg text-center text-xl tracking-[0.5em] text-white outline-none transition-colors ${authError ? "border-red-500 text-red-500 bg-red-500/10" : "border-white/20 focus:border-white focus:bg-[#111]"}`
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "button",
                          {
                            onClick: unlockSecurityModule,
                            className: "h-full px-8 bg-white text-black text-xs font-bold tracking-widest rounded-lg hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.2)] cursor-pointer",
                            children: "UNLOCK"
                          }
                        )
                      ] })
                    ]
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0a0a0c] p-6 rounded-3xl border border-white/5", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#111113] border border-white/10 p-7 rounded-2xl flex flex-col gap-5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(RiLockPasswordLine, { className: "text-zinc-400", size: 18 }),
                      " Update Master PIN"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: inputContainerClass, children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "input",
                        {
                          type: "password",
                          maxLength: 4,
                          pattern: "\\d*",
                          value: newPin,
                          onChange: (e) => setNewPin(e.target.value.replace(/\D/g, "")),
                          placeholder: "Enter new 4-digit PIN...",
                          className: "bg-transparent border-none outline-none text-sm font-mono text-zinc-100 w-full tracking-[0.3em]"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: updateMasterPin,
                          className: "text-zinc-500 hover:text-white transition-colors ml-2 cursor-pointer",
                          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSave3Line, { size: 20 })
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#111113] border border-white/10 p-7 rounded-2xl flex flex-col gap-6", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between items-center border-b border-white/10 pb-4", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: titleClass, children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(RiScan2Line, { className: "text-zinc-400", size: 18 }),
                        " Biometric Registry"
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-white font-mono tracking-widest bg-white/10 px-3 py-1.5 rounded-md font-semibold border border-white/5", children: [
                        faceCount,
                        " ENROLLED"
                      ] })
                    ] }),
                    isScanningFace ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 bg-[#050505] p-3 rounded-xl border border-white/20", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "video",
                        {
                          ref: videoRef,
                          autoPlay: true,
                          muted: true,
                          playsInline: true,
                          className: "w-16 h-16 rounded-lg object-cover -scale-x-100 border border-white/10"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] text-white font-mono tracking-widest animate-pulse font-bold", children: enrollStatus }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-zinc-400", children: "Keep head steady..." })
                      ] })
                    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 h-full justify-between", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 leading-relaxed", children: "Enroll additional structural face descriptors. Data is mathematically encrypted and stored locally." }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          onClick: startFaceEnrollment,
                          className: "w-full py-3 rounded-lg bg-white text-black font-bold tracking-widest text-[12px] flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)] mt-auto cursor-pointer",
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(RiAddLine, { size: 18 }),
                            " ENROLL NEW IDENTITY"
                          ]
                        }
                      )
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-[#111113] border border-white/10 p-7 rounded-2xl flex flex-col gap-6 md:col-span-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/10 pb-4", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "div",
                          {
                            className: `p-2.5 rounded-xl border ${sandboxEnabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`,
                            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiShieldCheckLine, { size: 24 })
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: titleClass, children: "Nexus Sandbox Shield" }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                              "span",
                              {
                                className: `text-[9px] font-mono tracking-widest px-2.5 py-0.5 rounded-full font-bold border ${sandboxEnabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`,
                                children: sandboxEnabled ? "HOST PC PROTECTED" : "SANDBOX OFF - UNRESTRICTED"
                              }
                            )
                          ] }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-400 mt-0.5", children: "Jails agent file mutations and shell executions inside an isolated workspace. Zero host PC file tampering." })
                        ] })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          onClick: handleToggleSandbox,
                          className: `px-5 py-2.5 rounded-xl text-xs font-mono font-bold tracking-wider transition-all cursor-pointer border ${sandboxEnabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "bg-white/10 text-zinc-300 border-white/10 hover:bg-white/20"}`,
                          children: sandboxEnabled ? "ACTIVE (SAFE)" : "DISABLED (RISK)"
                        }
                      )
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-1.5", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(RiFolderShield2Line, { size: 13, className: "text-emerald-400" }),
                          " Filesystem Jail"
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-zinc-200 font-mono font-semibold", children: "Strict Workspace Confinement" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 leading-normal", children: "Writes, deletes, and patches outside the designated sandbox are intercepted and blocked." })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-1.5", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(RiTerminalWindowLine, { size: 13, className: "text-emerald-400" }),
                          " Command Firewall"
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-zinc-200 font-mono font-semibold", children: "Destructive Action Blocker" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 leading-normal", children: "Stops recursive disk deletes, registry alterations, power commands, and OS process terminations." })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-1.5", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 font-mono uppercase tracking-widest flex items-center gap-1.5", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(RiShieldKeyholeLine, { size: 13, className: "text-emerald-400" }),
                          " Interceptions"
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-baseline gap-2", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-lg font-mono font-bold text-white", children: sandboxBlockedCount }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-zinc-500 font-mono", children: "Violations Prevented" })
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-zinc-400 leading-normal", children: "Live telemetry monitoring untrusted actions from autonomous agent routines." })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-black/60 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 overflow-hidden", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] text-zinc-500 font-mono uppercase tracking-widest", children: "Active Sandbox Workspace Location" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-[11px] font-mono text-zinc-300 truncate max-w-xl", children: sandboxWorkspace || "Initializing Sandbox Workspace..." })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "button",
                        {
                          onClick: handleOpenSandboxFolder,
                          className: "shrink-0 px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-mono rounded-lg border border-white/10 transition-colors flex items-center gap-2 cursor-pointer",
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(RiExternalLinkLine, { size: 14 }),
                            " Open Sandbox Folder"
                          ]
                        }
                      )
                    ] })
                  ] })
                ] })
              ]
            },
            "security"
          ),
          activeTab === "mcp" && /* @__PURE__ */ jsxRuntimeExports.jsx(
            motion.div,
            {
              initial: { opacity: 0, y: 10 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -10 },
              transition: { duration: 0.2 },
              className: "w-full",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(McpSettingsTab, {})
            },
            "mcp"
          )
        ] }) })
      ]
    }
  ) });
};
export {
  SettingsView as default
};
