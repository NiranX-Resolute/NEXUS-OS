import { r as reactExports, X as listPuterModels, j as jsxRuntimeExports, Y as RiFolderOpenLine, G as RiAddLine, Z as RiHistoryLine, _ as RiDownload2Line, $ as RiRobot2Line, a0 as RiKey2Line, A as RiBrainLine, a1 as nexusService, a2 as RiMicLine, a3 as RiMicOffLine, p as RiVolumeUpLine, a4 as RiStopCircleLine, w as RiCloseLine, l as RiDeleteBinLine, z as RiCheckLine, D as RiFileCopyLine, a5 as RiRefreshLine, a6 as RiFileTextLine, a7 as RiAttachment2, a8 as RiSendPlane2Line, a9 as saveMessage, aa as demandComponentManager, ab as handleImageGeneration, ac as executePuterChat, ad as isWhiteboardCommand, ae as publishWhiteboardWrite, af as createWhiteboardPayload, ag as extractWhiteboardQuestion } from "./index-CYaMQ3cR.js";
import { M as MarkdownMath } from "./MarkdownMath-dUeUn8rO.js";
import { D as DEFAULT_AI_GATEWAY_MODEL, a as DEFAULT_AI_GATEWAY_MODELS, A as AI_GATEWAY_PROVIDERS } from "./ai-provider-models-Jdd593NY.js";
import "./index-D_ENciI6.js";
const systemPrompt = `You are Nexus AI, an advanced sovereign desktop AI intelligence agent.
[MATHEMATICAL FORMATTING REQUIREMENT]: ALWAYS format all mathematical expressions, formulas, scientific notation, numbers, calculations, algebraic variables, limits, integrals, and equations strictly using standard LaTeX syntax.
- Use $...$ for inline equations (e.g. $E=mc^2$, $\\lambda = \\frac{h}{p}$).
- Use $$...$$ on their own separate lines for standalone block formulas.
- Never output raw unformatted formulas.
Provide sharp, structured Markdown with code blocks, tables, and step-by-step reasoning where applicable.`;
const cleanSpeechText = (text) => text.replace(/```[\s\S]*?```/g, "code block omitted.").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "link").replace(/[*_#>~]/g, "").replace(/\$+/g, "").replace(/\s+/g, " ").trim();
const ATTACHMENT_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  html: "text/html",
  css: "text/css",
  xml: "application/xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  zip: "application/zip"
};
const guessAttachmentMimeType = (file) => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension && ATTACHMENT_MIME_BY_EXTENSION[extension] || "application/octet-stream";
};
const formatAttachmentSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const readFileAsBase64 = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
};
const fileToGeminiAttachment = async (file) => ({
  name: file.name,
  mimeType: guessAttachmentMimeType(file),
  size: file.size,
  data: await readFileAsBase64(file)
});
const PROVIDER_DISPLAY_NAMES = {
  puter: "Puter AI (Primary • 500+ Frontier Models)",
  gemini: "Google Gemini API",
  groq: "Groq Cloud LPU",
  openai: "OpenAI Direct",
  anthropic: "Anthropic Claude",
  deepseek: "DeepSeek Direct",
  ollama: "Ollama / Edge0 (Local Offline)",
  fireworks: "Fireworks AI"
};
function AiChatView({
  isSystemActive,
  isSystemStarting,
  isMicMuted,
  toggleSystem,
  toggleMic
}) {
  const [sessionId, setSessionId] = reactExports.useState(() => `nexus_session_${Date.now()}`);
  const [sessionTitle, setSessionTitle] = reactExports.useState("New Nexus Session");
  const [savedSessions, setSavedSessions] = reactExports.useState([]);
  const [showHistoryDrawer, setShowHistoryDrawer] = reactExports.useState(false);
  const [docsFolderPath, setDocsFolderPath] = reactExports.useState("");
  const [provider, setProvider] = reactExports.useState(
    localStorage.getItem("nexus_ai_chat_provider") || "puter"
  );
  const [model, setModel] = reactExports.useState(() => {
    const saved = localStorage.getItem("nexus_ai_chat_model");
    if (!saved || saved === "models/gemini-1.5-flash") {
      return DEFAULT_AI_GATEWAY_MODEL.puter;
    }
    return saved;
  });
  const [customModel, setCustomModel] = reactExports.useState(() => {
    return localStorage.getItem("nexus_ai_chat_custom_model") || "gpt-4o";
  });
  const [modelsByProvider, setModelsByProvider] = reactExports.useState(DEFAULT_AI_GATEWAY_MODELS);
  const [showKeyModal, setShowKeyModal] = reactExports.useState(false);
  const [customKeyInput, setCustomKeyInput] = reactExports.useState("");
  const [messages, setMessages] = reactExports.useState([
    {
      role: "assistant",
      content: "✨ **Nexus Sovereign AI Chat is online.**\n\nAll AI providers are connected. Responses automatically format mathematical equations in **LaTeX** ($inline$ and $$block$$). Your complete chat history is continuously persisted directly into your **OS Documents** folder (`Documents/Nexus_Docs/Chat_History/`) as formatted Markdown and JSON documents.",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  ]);
  const [input, setInput] = reactExports.useState("");
  const [attachments, setAttachments] = reactExports.useState([]);
  const [isSending, setIsSending] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  const [copiedIndex, setCopiedIndex] = reactExports.useState(null);
  const [voiceReplies, setVoiceReplies] = reactExports.useState(
    localStorage.getItem("nexus_ai_chat_main_voice") !== "false"
  );
  const [voiceStatus, setVoiceStatus] = reactExports.useState("Main voice ready");
  const [voiceProfile, setVoiceProfile] = reactExports.useState(
    localStorage.getItem("nexus_voice_profile") === "FEMALE" ? "Aoede" : "Puck"
  );
  const scrollRef = reactExports.useRef(null);
  const fileInputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);
  reactExports.useEffect(() => {
    localStorage.setItem("nexus_ai_chat_provider", provider);
    localStorage.setItem("nexus_ai_chat_model", model);
  }, [provider, model]);
  reactExports.useEffect(() => {
    localStorage.setItem("nexus_ai_chat_main_voice", String(voiceReplies));
  }, [voiceReplies]);
  reactExports.useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke("chat-history:get-folder-path").then((res) => {
        if (res?.folderPath) setDocsFolderPath(res.folderPath);
      });
      window.electron.ipcRenderer.invoke("chat-history:get-sessions").then((res) => {
        if (res?.success && Array.isArray(res.sessions) && res.sessions.length > 0) {
          setSavedSessions(res.sessions);
        }
      });
    }
  }, []);
  reactExports.useEffect(() => {
    const syncVoiceProfile = () => {
      setVoiceProfile(localStorage.getItem("nexus_voice_profile") === "FEMALE" ? "Aoede" : "Puck");
    };
    syncVoiceProfile();
    const timer = window.setInterval(syncVoiceProfile, 1e3);
    window.addEventListener("storage", syncVoiceProfile);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", syncVoiceProfile);
    };
  }, []);
  reactExports.useEffect(() => {
    AI_GATEWAY_PROVIDERS.forEach(async (nextProvider) => {
      try {
        const result = await window.electron.ipcRenderer.invoke("ai-gateway:list-models", {
          provider: nextProvider
        });
        if (result?.success && Array.isArray(result.models) && result.models.length > 0) {
          setModelsByProvider((current) => ({ ...current, [nextProvider]: result.models }));
        }
      } catch {
      }
    });
    listPuterModels().then((puterModels) => {
      if (puterModels.length > 0) {
        setModelsByProvider((current) => ({
          ...current,
          puter: [
            ...puterModels.slice(0, 80),
            { provider: "puter", id: "custom", label: "Custom Model ID (Enter below)" }
          ]
        }));
      }
    });
  }, []);
  const persistSessionToDocuments = async (currentMessages, activeTitle = sessionTitle, activeId = sessionId) => {
    if (!window.electron?.ipcRenderer) return;
    try {
      const res = await window.electron.ipcRenderer.invoke("chat-history:save-session", {
        id: activeId,
        title: activeTitle,
        provider,
        model: model || "default",
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || (/* @__PURE__ */ new Date()).toISOString()
        }))
      });
      if (res?.success) {
        const sessionsRes = await window.electron.ipcRenderer.invoke("chat-history:get-sessions");
        if (sessionsRes?.success) setSavedSessions(sessionsRes.sessions);
      }
    } catch (err) {
      console.error("[ChatHistory] Auto-save to documents failed:", err);
    }
  };
  const handleNewChat = () => {
    const newId = `nexus_session_${Date.now()}`;
    setSessionId(newId);
    setSessionTitle("New Nexus Session");
    setAttachments([]);
    setError("");
    const initialWelcome = {
      role: "assistant",
      content: "✨ **New chat session started.**\n\nAsk any question, request mathematical derivations in LaTeX, generate art, or execute tasks. Everything is safely written to your **Documents** folder.",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    setMessages([initialWelcome]);
    persistSessionToDocuments([initialWelcome], "New Nexus Session", newId);
  };
  const handleLoadSession = (session) => {
    setSessionId(session.id);
    setSessionTitle(session.title);
    if (session.provider && AI_GATEWAY_PROVIDERS.includes(session.provider)) {
      setProvider(session.provider);
    }
    if (session.model) setModel(session.model);
    setMessages(
      (session.messages || []).map((m) => ({
        role: m.role === "assistant" || m.role === "model" ? "assistant" : "user",
        content: m.content,
        timestamp: m.timestamp
      }))
    );
    setShowHistoryDrawer(false);
  };
  const handleDeleteSession = async (idToDelete, e) => {
    e.stopPropagation();
    if (!window.electron?.ipcRenderer) return;
    await window.electron.ipcRenderer.invoke("chat-history:delete-session", idToDelete);
    setSavedSessions((current) => current.filter((s) => s.id !== idToDelete));
    if (sessionId === idToDelete) {
      handleNewChat();
    }
  };
  const handleOpenDocumentsFolder = async () => {
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke("chat-history:open-folder");
    }
  };
  const handleExportMarkdown = () => {
    const mdLines = [
      `# 🧠 Nexus AI Session: ${sessionTitle}`,
      `**Date:** ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
      `**Provider:** ${PROVIDER_DISPLAY_NAMES[provider] || provider} | **Model:** ${model}`,
      `
---
`
    ];
    messages.forEach((m) => {
      mdLines.push(`### ${m.role === "user" ? "👤 User" : "🤖 Nexus AI"}`);
      mdLines.push(m.content);
      mdLines.push("\n---\n");
    });
    const blob = new Blob([mdLines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionTitle.replace(/\s+/g, "_")}_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const ensureMainVoiceOnline = async () => {
    if (!nexusService.isConnected) {
      setVoiceStatus(isSystemStarting ? "Main voice starting" : "Starting main voice");
      if (!isSystemStarting && !isSystemActive) await toggleSystem();
      const deadline = Date.now() + 12e3;
      while (!nexusService.isConnected && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }
    if (!nexusService.isConnected) throw new Error("Main voice assistant is not online.");
    setVoiceStatus("Main voice online");
  };
  const speakWithMainVoice = async (text) => {
    if (!voiceReplies) return;
    const clean = cleanSpeechText(text);
    if (!clean) return;
    try {
      await ensureMainVoiceOnline();
      nexusService.speakInstruction(
        `Read this AI Chat response aloud using the current Nexus assistant voice. Keep the wording faithful:

${clean.slice(0, 5e3)}`,
        { persistTranscript: false }
      );
      setVoiceStatus(`Speaking with ${voiceProfile}`);
    } catch (error2) {
      setVoiceStatus(error2?.message || "Main voice unavailable");
    }
  };
  const stopSpeaking = () => {
    nexusService.stopAudioOutput();
    setVoiceStatus("Main voice stopped");
  };
  const toggleMainVoice = async () => {
    if (isSystemStarting) {
      setVoiceStatus("Main voice starting");
      return;
    }
    try {
      if (!isSystemActive || !nexusService.isConnected) {
        await ensureMainVoiceOnline();
        setVoiceStatus("Main voice online");
        return;
      }
      toggleMic();
      setVoiceStatus(isMicMuted ? "Main voice mic live" : "Main voice mic muted");
    } catch (error2) {
      setVoiceStatus(error2?.message || "Main voice unavailable");
    }
  };
  const handleAttachFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setError("");
    try {
      const encoded = await Promise.all(files.map(fileToGeminiAttachment));
      setAttachments((current) => [...current, ...encoded]);
    } catch (err) {
      setError(err?.message || "Unable to attach selected files.");
    } finally {
      event.target.value = "";
    }
  };
  const removeAttachment = (index) => {
    setAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index));
  };
  const copyMessageText = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2e3);
    } catch {
    }
  };
  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    const prompt = input.trim();
    const selectedAttachments = attachments;
    if (!prompt && selectedAttachments.length === 0 || isSending) return;
    setError("");
    setInput("");
    setAttachments([]);
    const attachmentSummary = selectedAttachments.length ? `

Attached files:
${selectedAttachments.map((attachment) => `- ${attachment.name} (${formatAttachmentSize(attachment.size)})`).join("\n")}` : "";
    const userContent = `${prompt || "Please review the attached file(s)."}${attachmentSummary}`;
    const userMsg = {
      role: "user",
      content: userContent,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsSending(true);
    let activeTitle = sessionTitle;
    if (sessionTitle === "New Nexus Session" && prompt) {
      activeTitle = prompt.slice(0, 40);
      setSessionTitle(activeTitle);
    }
    void persistSessionToDocuments(nextMessages, activeTitle);
    void saveMessage("user", userContent);
    demandComponentManager.evaluatePromptAndActivate(prompt);
    const lowerPrompt = (prompt || "").toLowerCase().trim();
    if (lowerPrompt.startsWith("/screen ") || lowerPrompt.startsWith("use screen to ") || lowerPrompt.startsWith("/click ")) {
      const isSingleClick = lowerPrompt.startsWith("/click ");
      const screenGoal = prompt.replace(/^\/(?:screen|click)\s+/i, "").replace(/^use screen to\s+/i, "").trim();
      try {
        if (isSingleClick) {
          const clickRes = await window.electron.ipcRenderer.invoke("skyvern:visual-click", screenGoal);
          const response = `👁️ [Screen Visual Click]

${clickRes.message}`;
          const assistantMsg = { role: "assistant", content: response, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
          const updated = [...nextMessages, assistantMsg];
          setMessages(updated);
          void persistSessionToDocuments(updated, activeTitle);
          await saveMessage("nexus", response);
          if (voiceReplies) await speakWithMainVoice(response);
        } else {
          const taskRes = await window.electron.ipcRenderer.invoke("skyvern:start-task", {
            goal: screenGoal,
            mode: "desktop"
          });
          const response = `👁️ [Screen Use Agent Deployed]

**Goal**: "${screenGoal}"
**Status**: Initialized (${taskRes.status})

Nexus AI is visually inspecting your screen and executing actions autonomously.`;
          const assistantMsg = { role: "assistant", content: response, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
          const updated = [...nextMessages, assistantMsg];
          setMessages(updated);
          void persistSessionToDocuments(updated, activeTitle);
          await saveMessage("nexus", response);
          if (voiceReplies) await speakWithMainVoice(response);
        }
      } catch (err) {
        const errResponse = `❌ [Screen Use Error]: ${err?.message || "Failed to start screen use task."}`;
        const updated = [
          ...nextMessages,
          { role: "assistant", content: errResponse, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
        ];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
      } finally {
        setIsSending(false);
      }
      return;
    }
    const isArtCommand = lowerPrompt.startsWith("/image ") || lowerPrompt.startsWith("/imagine ") || lowerPrompt.startsWith("/art ") || lowerPrompt.startsWith("generate image") || lowerPrompt.startsWith("generate art") || lowerPrompt.startsWith("create image") || lowerPrompt.startsWith("create art") || lowerPrompt.startsWith("draw ") || lowerPrompt.startsWith("paint ");
    if (isArtCommand) {
      const artPrompt = prompt.replace(/^\/(?:image|imagine|art)\s+/i, "").replace(
        /^(?:generate|create)\s+(?:an?\s+)?(?:image|art|picture|illustration|wallpaper|photo)\s+(?:of\s+)?/i,
        ""
      ).replace(/^(?:draw|paint)\s+(?:an?\s+)?/i, "").trim() || prompt;
      try {
        const artResult = await handleImageGeneration(artPrompt);
        const response = `🎨 [Puter AI Art Engine]

${artResult}

**Prompt:** "${artPrompt}"

*Saved to your Gallery & Documents folder.*`;
        const assistantMsg = { role: "assistant", content: response, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
        const updated = [...nextMessages, assistantMsg];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
        await saveMessage("nexus", response);
        if (voiceReplies) await speakWithMainVoice(`Rendering visual art on Puter AI for ${artPrompt.slice(0, 50)}`);
      } catch (err) {
        const errResponse = `❌ [Art Generation Error]: ${err?.message || "Failed to generate visual art."}`;
        const updated = [
          ...nextMessages,
          { role: "assistant", content: errResponse, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
        ];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
      } finally {
        setIsSending(false);
      }
      return;
    }
    const effectiveModel = (provider === "puter" || provider === "ollama") && (model === "custom" || !model) ? customModel.trim() || "gpt-4o" : model;
    if (provider === "puter") {
      try {
        const puterContent = await executePuterChat({
          model: effectiveModel,
          system: systemPrompt,
          messages: nextMessages.filter((m) => !m.content.includes("Nexus Sovereign AI Chat is online")).slice(-14).map((m) => ({ role: m.role, content: m.content }))
        });
        const response = puterContent || "No response returned from Puter AI.";
        const assistantMsg = {
          role: "assistant",
          content: response,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          provider: "puter",
          model: effectiveModel
        };
        const updated = [...nextMessages, assistantMsg];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
        await saveMessage("nexus", response);
        if (isWhiteboardCommand(userContent)) {
          publishWhiteboardWrite(createWhiteboardPayload(extractWhiteboardQuestion(userContent), response, "chat"));
        }
        if (voiceReplies) await speakWithMainVoice(response);
      } catch (err) {
        console.warn("[Puter AI Direct] Falling back to AI Gateway:", err?.message);
        await executeGatewayChat(nextMessages, userContent, activeTitle, effectiveModel);
      } finally {
        setIsSending(false);
      }
      return;
    }
    await executeGatewayChat(nextMessages, userContent, activeTitle, effectiveModel);
  };
  const executeGatewayChat = async (nextMessages, userContent, activeTitle, effectiveModel) => {
    try {
      const requestProvider = attachments.length ? "gemini" : provider;
      const requestModel = attachments.length && provider !== "gemini" ? DEFAULT_AI_GATEWAY_MODEL.gemini : effectiveModel;
      const result = await window.electron.ipcRenderer.invoke("ai-gateway:chat", {
        provider: requestProvider,
        model: requestModel,
        modelsByProvider: {
          puter: effectiveModel,
          gemini: DEFAULT_AI_GATEWAY_MODEL.gemini,
          groq: localStorage.getItem("nexus_default_groq_model") || DEFAULT_AI_GATEWAY_MODEL.groq,
          fireworks: localStorage.getItem("nexus_default_fireworks_model") || DEFAULT_AI_GATEWAY_MODEL.fireworks,
          openai: DEFAULT_AI_GATEWAY_MODEL.openai,
          anthropic: DEFAULT_AI_GATEWAY_MODEL.anthropic,
          deepseek: DEFAULT_AI_GATEWAY_MODEL.deepseek,
          ollama: DEFAULT_AI_GATEWAY_MODEL.ollama
        },
        puterToken: localStorage.getItem("nexus_puter_token") || "",
        geminiApiKey: localStorage.getItem("nexus_gemini_api_key") || "",
        groqApiKey: localStorage.getItem("nexus_groq_api_key") || "",
        openaiApiKey: localStorage.getItem("nexus_openai_api_key") || "",
        anthropicApiKey: localStorage.getItem("nexus_anthropic_api_key") || "",
        deepseekApiKey: localStorage.getItem("nexus_deepseek_api_key") || "",
        system: systemPrompt,
        fallbackOrder: attachments.length ? ["gemini"] : ["puter", "gemini", "groq", "openai", "anthropic", "deepseek", "ollama"],
        attachments,
        messages: nextMessages.filter((message) => !message.content.includes("Nexus Sovereign AI Chat is online")).slice(-14)
      });
      if (!result?.success) throw new Error(result?.error || "AI gateway request failed.");
      const response = attachments.length && provider !== "gemini" ? `[Multimodal Attachment via Gemini]

${result.content || "No response returned."}` : result.provider && result.provider !== provider ? `[Automatic Fallback: ${result.provider}]

${result.content || "No response returned."}` : result.content || "No response returned.";
      const assistantMsg = {
        role: "assistant",
        content: response,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        provider: result.provider || provider,
        model: requestModel
      };
      const updated = [...nextMessages, assistantMsg];
      setMessages(updated);
      void persistSessionToDocuments(updated, activeTitle);
      await saveMessage("nexus", response);
      if (isWhiteboardCommand(userContent)) {
        publishWhiteboardWrite(createWhiteboardPayload(extractWhiteboardQuestion(userContent), response, "chat"));
      }
      if (voiceReplies) await speakWithMainVoice(response);
    } catch (err) {
      try {
        const backupModel = customModel.trim() || "gpt-4o";
        const backupContent = await executePuterChat({
          model: backupModel,
          system: systemPrompt,
          messages: nextMessages.filter((m) => !m.content.includes("Nexus Sovereign AI Chat is online")).slice(-12).map((m) => ({ role: m.role, content: m.content }))
        });
        const response = `[Active Fallback: Puter AI (${backupModel})]

${backupContent}`;
        const assistantMsg = { role: "assistant", content: response, timestamp: (/* @__PURE__ */ new Date()).toISOString() };
        const updated = [...nextMessages, assistantMsg];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
        await saveMessage("nexus", response);
        if (voiceReplies) await speakWithMainVoice(response);
      } catch (backupErr) {
        const message = `${err?.message || "Gateway failed"} (Puter Fallback: ${backupErr?.message || "Offline"})`;
        setError(message);
        const updated = [
          ...nextMessages,
          { role: "assistant", content: `❌ Error: ${message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
        ];
        setMessages(updated);
        void persistSessionToDocuments(updated, activeTitle);
      }
    } finally {
      setIsSending(false);
    }
  };
  const sendToMainVoiceAssistant = async () => {
    const prompt = input.trim();
    if (!prompt || isSending) return;
    setError("");
    setInput("");
    setIsSending(true);
    const next = [...messages, { role: "user", content: prompt, timestamp: (/* @__PURE__ */ new Date()).toISOString() }];
    setMessages(next);
    try {
      await ensureMainVoiceOnline();
      await nexusService.sendTextPrompt(`[AI CHAT PAGE]
${prompt}`, "queue");
      setVoiceStatus("Sent to main voice assistant");
    } catch (err) {
      const message = err?.message || "Unable to reach the main voice assistant.";
      setError(message);
      setMessages((current) => [...current, { role: "assistant", content: `Error: ${message}` }]);
      setVoiceStatus(message);
    } finally {
      setIsSending(false);
    }
  };
  const handleSaveCustomKey = async () => {
    const key = customKeyInput.trim();
    if (!key) return;
    localStorage.setItem(`nexus_${provider}_api_key`, key);
    if (provider === "gemini") localStorage.setItem("gemini_api_key", key);
    if (provider === "groq") localStorage.setItem("groq_api_key", key);
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke("secure-save-keys", {
        geminiKey: provider === "gemini" ? key : localStorage.getItem("nexus_gemini_api_key") || "",
        groqKey: provider === "groq" ? key : localStorage.getItem("nexus_groq_api_key") || "",
        fireworksKey: provider === "fireworks" ? key : localStorage.getItem("nexus_fireworks_api_key") || "",
        puterToken: provider === "puter" ? key : localStorage.getItem("nexus_puter_token") || ""
      });
    }
    setShowKeyModal(false);
    setCustomKeyInput("");
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full w-full overflow-hidden p-3 text-zinc-100 flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/60 px-4 py-2 text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-2 w-2 rounded-full bg-emerald-400 animate-pulse" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold font-mono uppercase tracking-wider text-emerald-300 truncate max-w-[200px]", children: sessionTitle })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-zinc-500 font-mono hidden sm:inline", children: [
          "(",
          messages.length,
          " messages)"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleOpenDocumentsFolder,
            className: "flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300 transition hover:bg-emerald-500/20 hover:border-emerald-400",
            title: `Chat history saved in: ${docsFolderPath || "Documents/Nexus_Docs/Chat_History"}. Click to open in File Explorer.`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiFolderOpenLine, { size: 14 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden md:inline", children: "Documents Folder" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] text-emerald-400/70 font-mono", children: "📁 Live Sync" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleNewChat,
            className: "flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-200 transition hover:bg-white/15",
            title: "Start new conversation",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiAddLine, { size: 14 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "New Chat" })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setShowHistoryDrawer((prev) => !prev),
            className: "flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-200 transition hover:bg-white/15",
            title: "Browse past conversations",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiHistoryLine, { size: 14 }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "History (",
                savedSessions.length,
                ")"
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleExportMarkdown,
            className: "flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/15",
            title: "Download formatted Markdown log",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiDownload2Line, { size: 13 })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid flex-1 min-h-0 grid-cols-12 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("aside", { className: "col-span-12 flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 scrollbar-small rounded-2xl border border-emerald-500/15 bg-black/65 p-3.5 lg:col-span-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5 border-b border-white/10 pb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-emerald-300 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiRobot2Line, { size: 22 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-black uppercase tracking-[0.16em]", children: "Nexus AI" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[9px] font-mono tracking-widest text-emerald-400/80", children: "SOVEREIGN MULTI-ENGINE" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 font-bold", children: "AI Provider" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setShowKeyModal(true),
                className: "flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 underline",
                title: "Configure custom API keys",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiKey2Line, { size: 11 }),
                  " API Key"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: provider,
              onChange: (event) => {
                const nextProvider = event.target.value;
                setProvider(nextProvider);
                setModel(DEFAULT_AI_GATEWAY_MODEL[nextProvider]);
              },
              className: "w-full rounded-lg border border-white/15 bg-black/90 p-2.5 text-xs font-bold text-zinc-100 outline-none focus:border-emerald-400/60 transition",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "puter", children: "Puter AI (Primary • 500+ Frontier Models • Zero-Auth)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "gemini", children: "Google Gemini API (Flagship Multimodal)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "groq", children: "Groq Cloud (Ultra-Fast LPU)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "openai", children: "OpenAI Direct (GPT-4o / o1 / o3-mini)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "anthropic", children: "Anthropic (Claude 3.7 / 3.5 Sonnet)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "deepseek", children: "DeepSeek (V3 / R1 Reasoner)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ollama", children: "Ollama / Edge0 (Local Offline)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "fireworks", children: "Fireworks AI (Open Models)" })
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 font-bold", children: "Active Model" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] font-mono text-cyan-400 font-bold uppercase", children: [
              modelsByProvider[provider]?.length || 0,
              " Models"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: model,
              onChange: (event) => setModel(event.target.value),
              className: "w-full rounded-lg border border-white/15 bg-black/90 p-2.5 text-xs font-bold text-zinc-100 outline-none focus:border-cyan-400/60 transition",
              children: (modelsByProvider[provider] || DEFAULT_AI_GATEWAY_MODELS[provider] || []).map((item) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: item.id, children: item.label }, item.id))
            }
          )
        ] }),
        (model === "custom" || provider === "puter" || provider === "ollama") && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 p-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-[9px] font-mono uppercase tracking-wider text-emerald-300 font-bold", children: "Custom Model Identifier" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: customModel,
              onChange: (e) => {
                setCustomModel(e.target.value);
                localStorage.setItem("nexus_ai_chat_custom_model", e.target.value);
              },
              placeholder: "e.g. claude-3-7-sonnet, deepseek-r1, gpt-4o",
              className: "rounded-lg border border-white/15 bg-black/90 p-2 text-xs font-mono text-zinc-100 outline-none focus:border-emerald-400"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2.5 rounded-xl border border-white/10 bg-white/[0.03] space-y-1.5 text-[10px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between font-mono font-bold", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-400", children: "MATH PARSER" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-emerald-400 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiBrainLine, {}),
              " LaTeX Active"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-zinc-500 leading-snug", children: "Equations automatically render with KaTeX. Documents folder updates in real-time." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-auto rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-black uppercase tracking-widest text-cyan-200", children: "Nexus Voice" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full border border-cyan-400/20 bg-black/60 px-2 py-0.5 text-[8px] font-mono uppercase text-cyan-300", children: voiceProfile })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 truncate text-[9px] font-mono uppercase text-zinc-400", children: voiceStatus }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2.5 grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: toggleMainVoice,
                className: `flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${nexusService.isConnected && !isMicMuted ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-zinc-300 hover:text-cyan-200"}`,
                children: [
                  nexusService.isConnected && !isMicMuted ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiMicLine, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiMicOffLine, {}),
                  nexusService.isConnected ? isMicMuted ? "Muted" : "Live" : "Start"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setVoiceReplies((current) => !current),
                className: `flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${voiceReplies ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" : "border-white/10 bg-white/5 text-zinc-400"}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiVolumeUpLine, {}),
                  " ",
                  voiceReplies ? "Replies" : "Silent"
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: stopSpeaking,
              className: "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-200 transition hover:bg-red-500/20",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiStopCircleLine, {}),
                " Stop Audio"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/50 lg:col-span-9 relative", children: [
        showHistoryDrawer && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-0 z-20 bg-black/85 backdrop-blur-md p-4 flex flex-col overflow-hidden", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/10 pb-3 mb-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiHistoryLine, { className: "text-emerald-400", size: 18 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-bold text-sm text-zinc-100", children: "Saved Conversations in Documents" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => setShowHistoryDrawer(false),
                className: "p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 20 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-small", children: savedSessions.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-center py-12 text-zinc-500 text-xs font-mono", children: "No saved conversations found in Documents folder yet." }) : savedSessions.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              onClick: () => handleLoadSession(s),
              className: `p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${s.id === sessionId ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-bold text-xs truncate", children: s.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-zinc-500 font-mono flex items-center gap-2 mt-0.5", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Date(s.updatedAt || s.createdAt).toLocaleString() }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: s.provider }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "•" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                      s.messages?.length || 0,
                      " msgs"
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: (e) => handleDeleteSession(s.id, e),
                    className: "p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition",
                    title: "Delete conversation from Documents",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiDeleteBinLine, { size: 16 })
                  }
                )
              ]
            },
            s.id
          )) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { ref: scrollRef, className: "flex-1 overflow-y-auto p-4 sm:p-5 scrollbar-small", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 max-w-4xl mx-auto", children: [
          messages.map((message, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: `group relative rounded-2xl border p-4 transition ${message.role === "user" ? "ml-auto max-w-[85%] border-emerald-500/25 bg-emerald-500/10 shadow-md" : "border-white/10 bg-white/[0.04] shadow-md max-w-[92%]"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2 border-b border-white/5 pb-2 mb-2 text-[10px] font-mono text-zinc-400", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold uppercase tracking-wider text-emerald-300/80", children: message.role === "user" ? "👤 You" : `🤖 Nexus AI (${message.provider || provider})` }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 opacity-70 group-hover:opacity-100 transition", children: [
                    message.timestamp && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => copyMessageText(message.content, index),
                        className: "p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white",
                        title: "Copy message",
                        children: copiedIndex === index ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckLine, { className: "text-emerald-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiFileCopyLine, {})
                      }
                    ),
                    message.role === "assistant" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => speakWithMainVoice(message.content),
                        className: "p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-cyan-300",
                        title: "Read aloud with Nexus Voice",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiVolumeUpLine, {})
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownMath, { content: message.content })
              ]
            },
            `${message.role}-${index}`
          )),
          isSending && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "inline-flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 animate-pulse", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiRefreshLine, { className: "animate-spin text-emerald-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Nexus AI is thinking and formulating LaTeX responses..." })
          ] })
        ] }) }),
        error ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: error }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setError(""), className: "text-red-300 hover:text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 16 }) })
        ] }) : null,
        attachments.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-2", children: attachments.map((attachment, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "flex max-w-full items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[11px] text-emerald-100",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiFileTextLine, { className: "shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "max-w-[180px] truncate", children: attachment.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-emerald-100/60 font-mono", children: formatAttachmentSize(attachment.size) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => removeAttachment(index),
                  className: "rounded p-0.5 text-emerald-100/70 hover:text-white",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, {})
                }
              )
            ]
          },
          `${attachment.name}-${attachment.size}-${index}`
        )) }) : null,
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 overflow-x-auto px-3 py-1 border-t border-white/5 bg-black/40 text-[10px] font-mono scrollbar-none", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-500 uppercase tracking-widest shrink-0", children: "Quick:" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setInput("Explain Schrödinger equation in quantum mechanics and write it in LaTeX.");
                handleSubmit();
              },
              className: "shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition",
              children: "⚛️ Schrödinger Equation"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setInput("Derive the quadratic formula step by step with LaTeX math.");
                handleSubmit();
              },
              className: "shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition",
              children: "📐 Quadratic Formula"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setInput("Explain Bayes theorem with formula in LaTeX and an example.");
                handleSubmit();
              },
              className: "shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition",
              children: "📊 Bayes Theorem"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setInput("/image futuristic sovereign quantum cyber desktop workstation neon emerald 8k");
                handleSubmit();
              },
              className: "shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-zinc-300 hover:border-emerald-400 hover:text-emerald-300 transition",
              children: "🎨 /image Cyber Workstation"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "flex gap-2 border-t border-white/10 p-3 bg-black/80", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              multiple: true,
              className: "hidden",
              onChange: handleAttachFiles
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => fileInputRef.current?.click(),
              disabled: isSending,
              className: "rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-emerald-200 transition hover:bg-emerald-400 hover:text-black disabled:opacity-40",
              title: "Attach documents, images, code files",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiAttachment2, { size: 18 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              value: input,
              onChange: (event) => setInput(event.target.value),
              placeholder: attachments.length ? "Ask about attached files..." : "Ask Nexus AI (formulas render in LaTeX, history saves to Documents)...",
              className: "min-w-0 flex-1 rounded-xl border border-white/15 bg-black/90 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-emerald-400/70 transition"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: sendToMainVoiceAssistant,
              disabled: isSending || !input.trim(),
              className: "rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3.5 py-3 text-cyan-200 transition hover:bg-cyan-400 hover:text-black disabled:opacity-40",
              title: "Send to main voice assistant",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiVolumeUpLine, { size: 18 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              disabled: isSending || !input.trim() && attachments.length === 0,
              className: "rounded-xl bg-emerald-500 px-5 py-3 font-bold text-black shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95 disabled:opacity-40",
              title: "Send prompt to active AI",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiSendPlane2Line, { size: 18 })
            }
          )
        ] })
      ] })
    ] }),
    showKeyModal && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-md rounded-2xl border border-emerald-500/30 bg-zinc-950 p-5 shadow-2xl space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-white/10 pb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiKey2Line, { className: "text-emerald-400", size: 20 }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "font-bold text-sm text-zinc-100", children: [
            "Configure ",
            PROVIDER_DISPLAY_NAMES[provider],
            " Key"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowKeyModal(false),
            className: "p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { size: 20 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 leading-relaxed", children: "Keys are encrypted with Windows DPAPI in your local vault. Puter.js AI runs zero-auth in browser without mandatory keys." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "password",
          value: customKeyInput,
          onChange: (e) => setCustomKeyInput(e.target.value),
          placeholder: `Enter custom ${provider} API key...`,
          className: "w-full rounded-xl border border-white/15 bg-black/90 p-3 text-xs font-mono text-zinc-100 outline-none focus:border-emerald-400"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowKeyModal(false),
            className: "rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/10",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleSaveCustomKey,
            className: "rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-black hover:bg-emerald-400",
            children: "Save Encrypted Key"
          }
        )
      ] })
    ] }) })
  ] });
}
export {
  AiChatView as default
};
