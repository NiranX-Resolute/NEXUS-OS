import { r as reactExports, ac as executePuterChat, ah as generateWithNexusGeminiClient, j as jsxRuntimeExports, ai as RiUserVoiceLine, aj as RiTimeLine, ak as RiExternalLinkLine, a2 as RiMicLine, a3 as RiMicOffLine, a4 as RiStopCircleLine, al as RiPlayCircleLine, A as RiBrainLine, am as RiTvLine, an as RiCameraLensLine, w as RiCloseLine, ao as RiSparklingLine, z as RiCheckLine, D as RiFileCopyLine } from "./index-CYaMQ3cR.js";
import { M as MarkdownMath } from "./MarkdownMath-dUeUn8rO.js";
import "./index-D_ENciI6.js";
const PRESET_QUESTIONS = [
  {
    id: "lru-cache",
    category: "Coding",
    title: "LRU Cache Design (O(1))",
    question: "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement get(key) and put(key, value) in O(1) average time complexity.",
    expectedComplexity: "Time: O(1) | Space: O(capacity)",
    mockAnswer: `### 1. Executive Thesis
Pair a **Doubly Linked List** with a **Hash Map**. The map provides $O(1)$ key lookup directly to nodes, while the doubly linked list permits $O(1)$ node eviction from the tail and insertion at the head.

### 2. Algorithmic Intuition
* **Sentinel Nodes:** Maintain dummy \`head\` and \`tail\` pointers to eliminate edge-case null checking when splicing nodes.
* **Get Operation:** Lookup in map; if found, move node to \`head\` and return value ($O(1)$).
* **Put Operation:** If exists, update and promote to head. If new, evict \`tail.prev\` if at capacity, insert new node at head, update map ($O(1)$).

### 3. Production Implementation
\`\`\`typescript
class DNode {
  key: number;
  val: number;
  prev: DNode | null = null;
  next: DNode | null = null;
  constructor(key = 0, val = 0) { this.key = key; this.val = val; }
}

export class LRUCache {
  private capacity: number;
  private cache = new Map<number, DNode>();
  private head = new DNode();
  private tail = new DNode();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: number): number {
    const node = this.cache.get(key);
    if (!node) return -1;
    this.moveToHead(node);
    return node.val;
  }

  put(key: number, value: number): void {
    let node = this.cache.get(key);
    if (node) {
      node.val = value;
      this.moveToHead(node);
    } else {
      const newNode = new DNode(key, value);
      this.cache.set(key, newNode);
      this.addNode(newNode);
      if (this.cache.size > this.capacity) {
        const lru = this.popTail();
        this.cache.delete(lru.key);
      }
    }
  }

  private addNode(node: DNode): void {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next!.prev = node;
    this.head.next = node;
  }

  private removeNode(node: DNode): void {
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
  }

  private moveToHead(node: DNode): void {
    this.removeNode(node);
    this.addNode(node);
  }

  private popTail(): DNode {
    const res = this.tail.prev!;
    this.removeNode(res);
    return res;
  }
}
\`\`\`
`
  },
  {
    id: "system-design-chat",
    category: "System Design",
    title: "Distributed Real-Time Chat System",
    question: "Architect a low-latency real-time chat application (like Discord or Slack) handling 50 million DAU, 1-on-1 chats, group channels, and message persistence.",
    expectedComplexity: "P99 Latency < 100ms | 99.99% Availability",
    mockAnswer: `### 1. Executive Thesis
Decouple stateless REST operations from stateful duplex connections using an edge **WebSocket Gateway Cluster** backed by distributed **Redis Pub/Sub** message buses and a wide-column store (**ScyllaDB / Cassandra**) partitioned for sequential time-series pagination.

### 2. Architecture & Data Flow
1. **Edge Gateway:** Clients establish TLS WebSocket connections to the nearest regional gateway. Connection session registry mapping (\`user_id -> gateway_pod_id\`) resides in Redis.
2. **Message Sequencing:** Worker generates a monotonically ordered sequence ID (Snowflake/UUIDv7).
3. **Dispatch:** Redis pub/sub broadcasts to recipient gateway pod; pod sends binary frame over recipient's WebSocket.
4. **Persistence:** ScyllaDB partitions by \`(channel_id, bucket_month)\` with clustering key \`seq_id DESC\`.
`
  },
  {
    id: "behavioral-nexus",
    category: "Behavioral",
    title: "STAR: Sovereign Zero-Subscription Architecture",
    question: "Tell me about an ambitious architectural project where you had to push boundaries and overcome technical constraints.",
    expectedComplexity: "Impact: 100% Free-Tier Sovereign Computing",
    mockAnswer: `### 1. Executive Thesis
As Creator of the Nexus OS ecosystem, I engineered a distributed, zero-subscription desktop-to-edge agent mesh delivering sovereign AI computing without relying on costly enterprise SaaS models.

### 2. STAR Method Breakdown
* **Situation:** Modern AI workflows are gated behind recurring corporate subscriptions and cloud vendor lock-in. Developers needed sovereign, local-first control.
* **Task:** Architect a hybrid desktop agent connecting native OS capabilities (Win32 API, desktop loopback audio) with edge compute (Cloudflare Workers, D1 SQLite, Puter multi-model hubs) at zero recurring subscription cost.
* **Action:**
  * Implemented native Win32 Display Affinity (\`WDA_EXCLUDEFROMCAPTURE\`) for undetectable HUD overlays during screen sharing.
  * Built low-latency WASAPI loopback audio pipelines coupled with 1300ms silence detection heuristics.
  * Integrated the local Argon Daemon delivering sub-400ms Time-To-First-Token answers.
* **Result:** Achieved 100% sovereign operation, eliminated recurring cloud fees, maintained local data privacy with SQLite WAL persistence, and demonstrated enterprise-grade real-time interview telemetry.
`
  }
];
const INTERVIEW_SYSTEM_PROMPTS = {
  Coding: `You are Nexus Interview Copilot, an elite competitive programmer and staff software architect.
Provide concise, master-level interview answers formatted in clean Markdown with LaTeX math ($O(1)$, $O(N)$).
Structure your response as:
### 1. Executive Thesis
Optimal algorithmic strategy and data structures in 2-3 sentences.
### 2. Algorithmic Intuition & Invariants
Key pointers, invariants, or sentinel nodes.
### 3. Complexity Analysis
- **Time Complexity:** $O(...)$ with rationale.
- **Space Complexity:** $O(...)$ with rationale.
### 4. Production Implementation
Clean, fully implemented, well-commented code in TypeScript or Python.
### 5. Edge Cases & Verification
Corner cases (empty input, duplicates, large bounds) and how the code handles them.`,
  "System Design": `You are Nexus Interview Copilot, a principal distributed systems architect.
Provide low-latency, scalable system designs formatted in clean Markdown.
Structure your response as:
### 1. Executive Thesis
Primary architectural thesis and design trade-offs.
### 2. Architecture & Data Flow
Edge Gateways, Message Queues (Kafka/Redis Pub/Sub), DB Partitioning, Caching layers.
### 3. Low-Latency Heuristics & P99
Techniques for sub-100ms P99 latency, caching, and connection reuse.
### 4. Persistence & Data Model
Storage choices (ScyllaDB/Cassandra/Postgres), partition keys, and replication.
### 5. Bottlenecks & Failure Modes
Mitigations for split-brain, network partitions, and cascading failures.`,
  Behavioral: `You are Nexus Interview Copilot, an executive leadership and engineering coach.
Provide authentic, high-impact behavioral answers formatted using the STAR method.
Structure your response as:
### 1. Executive Thesis
High-level accomplishment, leadership context, and sovereign impact.
### 2. STAR Method Breakdown
- **Situation:** High-stakes environment and engineering constraint.
- **Task:** Specific ownership boundary and goal.
- **Action:** Concrete technical decisions and leadership execution.
- **Result:** Quantifiable impact (e.g. 100% free-tier sovereign architecture, sub-millisecond speedup).`
};
const InterviewCopilotView = () => {
  const [activeCategory, setActiveCategory] = reactExports.useState("Coding");
  const [activeQuestion, setActiveQuestion] = reactExports.useState(PRESET_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = reactExports.useState("");
  const [displayedAnswer, setDisplayedAnswer] = reactExports.useState(PRESET_QUESTIONS[0].mockAnswer);
  const [isStreaming, setIsStreaming] = reactExports.useState(false);
  const [latencyMs, setLatencyMs] = reactExports.useState(null);
  const [copied, setCopied] = reactExports.useState(false);
  const [aiEngine, setAiEngine] = reactExports.useState("auto");
  const [activeEngineBadge, setActiveEngineBadge] = reactExports.useState("Auto (Puter / Gemini)");
  const [daemonOnline, setDaemonOnline] = reactExports.useState(false);
  const [isCheckingDaemon, setIsCheckingDaemon] = reactExports.useState(false);
  const [launchStatus, setLaunchStatus] = reactExports.useState(null);
  const [isAudioConnected, setIsAudioConnected] = reactExports.useState(false);
  const [audioChannelMode, setAudioChannelMode] = reactExports.useState("dual");
  const [hasLoopbackAudio, setHasLoopbackAudio] = reactExports.useState(false);
  const [pcAudioLevel, setPcAudioLevel] = reactExports.useState(0);
  const [micAudioLevel, setMicAudioLevel] = reactExports.useState(0);
  const [liveTranscript, setLiveTranscript] = reactExports.useState("");
  const [interimTranscript, setInterimTranscript] = reactExports.useState("");
  const [silenceProgress, setSilenceProgress] = reactExports.useState(0);
  const [autoSolveEnabled, setAutoSolveEnabled] = reactExports.useState(true);
  const [isScreenConnected, setIsScreenConnected] = reactExports.useState(false);
  const [screenSources, setScreenSources] = reactExports.useState([]);
  const [showSourceModal, setShowSourceModal] = reactExports.useState(false);
  const [activeSourceId, setActiveSourceId] = reactExports.useState(null);
  const [screenSnapshotData, setScreenSnapshotData] = reactExports.useState(null);
  const videoRef = reactExports.useRef(null);
  const canvasRef = reactExports.useRef(null);
  const audioContextRef = reactExports.useRef(null);
  const analyserRef = reactExports.useRef(null);
  const micStreamRef = reactExports.useRef(null);
  const loopbackStreamRef = reactExports.useRef(null);
  const micSourceRef = reactExports.useRef(null);
  const loopbackSourceRef = reactExports.useRef(null);
  const micAnalyserRef = reactExports.useRef(null);
  const loopbackAnalyserRef = reactExports.useRef(null);
  const levelIntervalRef = reactExports.useRef(null);
  const screenStreamRef = reactExports.useRef(null);
  const recognitionRef = reactExports.useRef(null);
  const silenceTimerRef = reactExports.useRef(null);
  const silenceIntervalRef = reactExports.useRef(null);
  const animationFrameRef = reactExports.useRef(null);
  const disconnectAllMedia = reactExports.useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (loopbackStreamRef.current) {
      loopbackStreamRef.current.getTracks().forEach((t) => t.stop());
      loopbackStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (loopbackSourceRef.current) {
      try {
        loopbackSourceRef.current.disconnect();
      } catch {
      }
      loopbackSourceRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
      }
      micSourceRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {
      });
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
      }
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
    if (levelIntervalRef.current) clearInterval(levelIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsAudioConnected(false);
    setIsScreenConnected(false);
    setHasLoopbackAudio(false);
    setPcAudioLevel(0);
    setMicAudioLevel(0);
    setInterimTranscript("");
    setSilenceProgress(0);
    setActiveSourceId(null);
  }, []);
  reactExports.useEffect(() => {
    const handleTabSwitch = (e) => {
      const tab = e.detail?.tab;
      if (tab && tab !== "INTERVIEW") {
        disconnectAllMedia();
      }
    };
    window.addEventListener("nexus-switch-tab", handleTabSwitch);
    return () => {
      window.removeEventListener("nexus-switch-tab", handleTabSwitch);
      disconnectAllMedia();
    };
  }, [disconnectAllMedia]);
  const checkDaemonHealth = reactExports.useCallback(async () => {
    setIsCheckingDaemon(true);
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        const res = await window.electron.ipcRenderer.invoke("interview:ensure-daemon");
        setDaemonOnline(Boolean(res?.running));
      } else {
        const res = await fetch("http://127.0.0.1:8090/health", { signal: AbortSignal.timeout(800) });
        setDaemonOnline(res.ok);
      }
    } catch {
      setDaemonOnline(false);
    } finally {
      setIsCheckingDaemon(false);
    }
  }, []);
  reactExports.useEffect(() => {
    checkDaemonHealth();
  }, [checkDaemonHealth]);
  const handleLaunchHud = async () => {
    setLaunchStatus("Launching Stealth HUD...");
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        const res = await window.electron.ipcRenderer.invoke("interview:launch-hud");
        if (res.success) {
          setLaunchStatus(`Running (${res.mode})`);
        } else {
          setLaunchStatus(`Error: ${res.error}`);
        }
      } else {
        setLaunchStatus("IPC unavailable");
      }
    } catch (err) {
      setLaunchStatus(`Failed: ${err.message}`);
    }
  };
  const solveInterviewQuestion = reactExports.useCallback(
    async (questionText, contextSnapshot) => {
      const cleanPrompt = questionText.trim();
      if (!cleanPrompt) return;
      setIsStreaming(true);
      const startTime = Date.now();
      const systemPrompt = INTERVIEW_SYSTEM_PROMPTS[activeCategory];
      const engineLabel = aiEngine === "auto" ? "Puter / Gemini" : aiEngine === "puter" ? "Puter AI" : aiEngine === "gemini" ? "Google Gemini" : "Local Daemon";
      setDisplayedAnswer(`⚡ Synthesizing optimal answer via ${engineLabel}...`);
      try {
        let answerText = "";
        let engineUsed = "";
        if (aiEngine === "daemon") {
          engineUsed = "Local Daemon (8090)";
          if (window.electron?.ipcRenderer?.invoke) {
            const res = await window.electron.ipcRenderer.invoke("interview:solve-daemon", {
              question: cleanPrompt,
              mode: activeCategory.toLowerCase(),
              screenContext: contextSnapshot || screenSnapshotData || void 0
            });
            if (res.success && res.answer) {
              answerText = res.answer;
            } else {
              throw new Error(res.error || "Argon Daemon offline on port 8090. Try Auto or Puter mode.");
            }
          } else {
            const resp = await fetch("http://127.0.0.1:8090/api/interview/solve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                question: cleanPrompt,
                mode: activeCategory.toLowerCase(),
                screenContext: contextSnapshot || screenSnapshotData || void 0
              })
            });
            const data = await resp.json();
            if (data.success && data.answer) {
              answerText = data.answer;
            } else {
              throw new Error(data.error || "Failed to reach local daemon on port 8090.");
            }
          }
        }
        if (!answerText && (aiEngine === "puter" || aiEngine === "auto")) {
          try {
            const promptWithContext = contextSnapshot ? `${cleanPrompt}

[Candidate Screen Context attached from live screen share]` : cleanPrompt;
            const puterRes = await executePuterChat({
              model: "gemini-2.0-flash",
              system: systemPrompt,
              messages: [{ role: "user", content: promptWithContext }],
              temperature: 0.3,
              maxTokens: 4096
            });
            if (puterRes && puterRes.trim().length > 15) {
              answerText = puterRes.trim();
              engineUsed = "Puter AI (Gemini 2.0 Flash)";
            }
          } catch (puterErr) {
            console.warn("[InterviewCopilot] Puter AI attempt failed:", puterErr);
            if (aiEngine === "puter") throw puterErr;
          }
        }
        if (!answerText && (aiEngine === "gemini" || aiEngine === "auto")) {
          try {
            if (window.electron?.ipcRenderer?.invoke) {
              const ipcRes = await window.electron.ipcRenderer.invoke("ai-gateway:chat", {
                provider: "gemini",
                model: "gemini-2.0-flash",
                system: systemPrompt,
                messages: [{ role: "user", content: cleanPrompt }]
              });
              if (ipcRes?.success && ipcRes?.content) {
                answerText = ipcRes.content.trim();
                engineUsed = "Google Gemini Direct";
              }
            }
            if (!answerText) {
              const geminiRes = await generateWithNexusGeminiClient({
                prompt: cleanPrompt,
                system: systemPrompt,
                model: "gemini-2.5-flash",
                temperature: 0.3
              });
              if (geminiRes && geminiRes.trim().length > 15) {
                answerText = geminiRes.trim();
                engineUsed = "Google Gemini API";
              }
            }
          } catch (geminiErr) {
            console.warn("[InterviewCopilot] Gemini API attempt failed:", geminiErr);
            if (aiEngine === "gemini") throw geminiErr;
          }
        }
        if (!answerText && aiEngine === "auto" && window.electron?.ipcRenderer?.invoke) {
          try {
            const res = await window.electron.ipcRenderer.invoke("interview:solve-daemon", {
              question: cleanPrompt,
              mode: activeCategory.toLowerCase(),
              screenContext: contextSnapshot || screenSnapshotData || void 0
            });
            if (res.success && res.answer) {
              answerText = res.answer;
              engineUsed = "Local Daemon";
            }
          } catch {
          }
        }
        if (!answerText) {
          throw new Error("All AI providers (Puter.js, Gemini API) were unreachable. Please verify network connectivity.");
        }
        try {
          if (answerText.trim().startsWith("{") && answerText.trim().endsWith("}")) {
            const parsed = JSON.parse(answerText);
            if (parsed.headline || parsed.answer || parsed.solution) {
              answerText = `### 1. Solution Thesis
**${parsed.headline || "Optimal Strategy"}**

${parsed.solution || parsed.answer || parsed.content || ""}`;
            }
          }
        } catch {
        }
        const duration = Date.now() - startTime;
        setLatencyMs(duration);
        setActiveEngineBadge(engineUsed);
        let currentIdx = 0;
        const interval = setInterval(() => {
          currentIdx += 40;
          if (currentIdx >= answerText.length) {
            setDisplayedAnswer(answerText);
            setIsStreaming(false);
            clearInterval(interval);
          } else {
            setDisplayedAnswer(answerText.slice(0, currentIdx));
          }
        }, 10);
      } catch (err) {
        console.error("[InterviewCopilot] Solver error:", err);
        setDisplayedAnswer(
          `### ⚠️ Live Generation Error
\`${err?.message || String(err)}\`

Ensure network is connected or switch Engine to Puter AI or Gemini API.`
        );
        setIsStreaming(false);
      }
    },
    [activeCategory, aiEngine, screenSnapshotData]
  );
  const drawAudioVisualizer = reactExports.useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / 24 - 2;
      let x = 0;
      for (let i = 0; i < 24; i++) {
        const val = dataArray[i * 2] || 0;
        const barHeight = val / 255 * canvas.height * 0.9;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "#10b981");
        gradient.addColorStop(0.7, "#06b6d4");
        gradient.addColorStop(1, "#a855f7");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 2;
      }
    };
    draw();
  }, []);
  const attachLoopbackToPipeline = reactExports.useCallback((loopStream) => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") return;
    try {
      if (loopbackSourceRef.current) {
        try {
          loopbackSourceRef.current.disconnect();
        } catch {
        }
        loopbackSourceRef.current = null;
      }
      const audioCtx = audioContextRef.current;
      const source = audioCtx.createMediaStreamSource(loopStream);
      loopbackSourceRef.current = source;
      const loopAnalyser = audioCtx.createAnalyser();
      loopAnalyser.fftSize = 64;
      source.connect(loopAnalyser);
      loopbackAnalyserRef.current = loopAnalyser;
      if (analyserRef.current) {
        source.connect(analyserRef.current);
      }
      console.log("[InterviewCopilot] Loopback audio channel successfully connected to AudioContext.");
    } catch (e) {
      console.warn("[InterviewCopilot] Failed to attach loopback audio:", e);
    }
  }, []);
  const toggleAudioConnection = async () => {
    if (isAudioConnected) {
      disconnectAllMedia();
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const masterAnalyser = audioCtx.createAnalyser();
      masterAnalyser.fftSize = 64;
      analyserRef.current = masterAnalyser;
      if (audioChannelMode === "dual" || audioChannelMode === "mic") {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          micStreamRef.current = micStream;
          const micSource = audioCtx.createMediaStreamSource(micStream);
          micSourceRef.current = micSource;
          const micAnalyser = audioCtx.createAnalyser();
          micAnalyser.fftSize = 64;
          micSource.connect(micAnalyser);
          micAnalyserRef.current = micAnalyser;
          micSource.connect(masterAnalyser);
        } catch (micErr) {
          console.warn("[InterviewCopilot] Mic capture notice:", micErr);
        }
      }
      if ((audioChannelMode === "dual" || audioChannelMode === "loopback") && loopbackStreamRef.current) {
        attachLoopbackToPipeline(loopbackStreamRef.current);
      }
      drawAudioVisualizer();
      levelIntervalRef.current = setInterval(() => {
        if (micAnalyserRef.current) {
          const micData = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
          micAnalyserRef.current.getByteFrequencyData(micData);
          let sum = 0;
          for (let i = 0; i < micData.length; i++) sum += micData[i];
          const avg = sum / (micData.length || 1);
          setMicAudioLevel(Math.min(100, Math.round(avg / 140 * 100)));
        } else {
          setMicAudioLevel(0);
        }
        if (loopbackAnalyserRef.current) {
          const loopData = new Uint8Array(loopbackAnalyserRef.current.frequencyBinCount);
          loopbackAnalyserRef.current.getByteFrequencyData(loopData);
          let sum = 0;
          for (let i = 0; i < loopData.length; i++) sum += loopData[i];
          const avg = sum / (loopData.length || 1);
          setPcAudioLevel(Math.min(100, Math.round(avg / 140 * 100)));
        } else {
          setPcAudioLevel(0);
        }
      }, 60);
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          let interim = "";
          let final = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (interim) {
            setInterimTranscript(interim);
          }
          if (final) {
            const cleanFinal = final.trim();
            setLiveTranscript((prev) => prev ? `${prev} ${cleanFinal}` : cleanFinal);
            setInterimTranscript("");
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
            let countdown = 1300;
            setSilenceProgress(100);
            silenceIntervalRef.current = setInterval(() => {
              countdown -= 50;
              setSilenceProgress(Math.max(0, Math.round(countdown / 1300 * 100)));
            }, 50);
            silenceTimerRef.current = setTimeout(() => {
              if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
              setSilenceProgress(0);
              if (autoSolveEnabled && cleanFinal.length > 8) {
                console.log("[SilenceDetector] 1300ms pause reached. Auto-solving:", cleanFinal);
                solveInterviewQuestion(cleanFinal);
              }
            }, 1300);
          }
        };
        recognition.onerror = (e) => {
          console.warn("[SpeechRecognition] error:", e.error);
        };
        recognition.onend = () => {
          if (micStreamRef.current || loopbackStreamRef.current) {
            try {
              recognition.start();
            } catch {
            }
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
      setIsAudioConnected(true);
    } catch (err) {
      console.error("[InterviewCopilot] Audio stream error:", err);
      alert(`Could not access audio device: ${err?.message || String(err)}`);
    }
  };
  const handleOpenSourcePicker = async () => {
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        const res = await window.electron.ipcRenderer.invoke("interview:get-screen-sources");
        if (res.success && res.sources?.length > 0) {
          setScreenSources(res.sources);
          setShowSourceModal(true);
          return;
        }
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScreenConnected(true);
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("[InterviewCopilot] Meeting audio loopback track captured from displayMedia!");
        setHasLoopbackAudio(true);
        loopbackStreamRef.current = new MediaStream([audioTracks[0]]);
        attachLoopbackToPipeline(loopbackStreamRef.current);
      } else {
        setHasLoopbackAudio(false);
      }
    } catch (err) {
      console.error("[InterviewCopilot] Screen capture error:", err);
    }
  };
  const handleSelectScreenSource = async (source) => {
    setShowSourceModal(false);
    setActiveSourceId(source.id);
    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: "desktop"
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080
            }
          }
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: "desktop",
              chromeMediaSourceId: source.id,
              minWidth: 1280,
              maxWidth: 1920,
              minHeight: 720,
              maxHeight: 1080
            }
          }
        });
      }
      screenStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScreenConnected(true);
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("[InterviewCopilot] Screen stream has PC loopback audio tracks:", audioTracks.length);
        setHasLoopbackAudio(true);
        loopbackStreamRef.current = new MediaStream([audioTracks[0]]);
        attachLoopbackToPipeline(loopbackStreamRef.current);
      } else {
        setHasLoopbackAudio(false);
      }
    } catch (err) {
      console.error("[InterviewCopilot] Failed to bind screen source:", err);
    }
  };
  const handleDisconnectScreen = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (loopbackStreamRef.current) {
      loopbackStreamRef.current.getTracks().forEach((t) => t.stop());
      loopbackStreamRef.current = null;
    }
    if (loopbackSourceRef.current) {
      try {
        loopbackSourceRef.current.disconnect();
      } catch {
      }
      loopbackSourceRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScreenConnected(false);
    setHasLoopbackAudio(false);
    setPcAudioLevel(0);
    setActiveSourceId(null);
    setScreenSnapshotData(null);
  };
  const handleSnapAndSolveScreen = () => {
    if (!videoRef.current || !isScreenConnected) {
      alert("Please connect a screen or window share first to snap problem code!");
      return;
    }
    try {
      const video = videoRef.current;
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = video.videoWidth || 1280;
      offscreenCanvas.height = video.videoHeight || 720;
      const ctx = offscreenCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        const dataUrl = offscreenCanvas.toDataURL("image/jpeg", 0.8);
        setScreenSnapshotData(dataUrl);
        const query = liveTranscript.trim() || customQuestion.trim() || "Analyze the code or problem statement visible on this screen and provide optimal solution";
        solveInterviewQuestion(query, dataUrl);
      }
    } catch (err) {
      console.error("[InterviewCopilot] Snapshot error:", err);
    }
  };
  reactExports.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "!") {
        e.preventDefault();
        handleSnapAndSolveScreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSnapAndSolveScreen]);
  const handleCopy = () => {
    navigator.clipboard.writeText(displayedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full w-full flex flex-col p-6 overflow-y-auto space-y-5 text-zinc-200", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-5 rounded-2xl border border-emerald-400/20 bg-zinc-950/80 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-12 w-12 rounded-xl flex items-center justify-center bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.2)]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiUserVoiceLine, { className: "text-2xl" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-black tracking-wider text-zinc-100 uppercase", children: "Nexus Interview Copilot" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase bg-emerald-400/15 border border-emerald-400/30 text-emerald-300", children: "Stealth Cloaked" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10 text-[10px] font-mono", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAiEngine("auto"),
                  className: `px-2.5 py-1 rounded-lg transition-all cursor-pointer ${aiEngine === "auto" ? "bg-emerald-400/20 text-emerald-300 font-bold border border-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Auto-select fastest: Puter AI (Free) or Google Gemini",
                  children: "⚡ Auto (Puter/Gemini)"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAiEngine("puter"),
                  className: `px-2.5 py-1 rounded-lg transition-all cursor-pointer ${aiEngine === "puter" ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Free Sovereign Frontier Multi-Model (No API Key Required)",
                  children: "🌐 Puter AI"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAiEngine("gemini"),
                  className: `px-2.5 py-1 rounded-lg transition-all cursor-pointer ${aiEngine === "gemini" ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-400/40 shadow-[0_0_8px_rgba(168,85,247,0.2)]" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Google Gemini Direct API",
                  children: "✨ Gemini API"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setAiEngine("daemon"),
                  className: `px-2.5 py-1 rounded-lg transition-all cursor-pointer ${aiEngine === "daemon" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-400/40" : "text-zinc-500 hover:text-zinc-300"}`,
                  title: daemonOnline ? "Local Argon Daemon (Online on 8090)" : "Local Argon Daemon (Port 8090)",
                  children: [
                    "🖥️ Daemon ",
                    daemonOnline ? "●" : ""
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-400 mt-0.5", children: "Live PC audio loopback & screen-share connected assistant. Powers sub-400ms STAR and Big-O answers via Puter.js and Google Gemini." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 shrink-0 flex-wrap", children: [
        latencyMs !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1.5 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.15)]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiTimeLine, { className: "text-xs" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "⚡ ",
            latencyMs,
            "ms TTFT"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleLaunchHud,
            className: "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition-all bg-emerald-400 text-black hover:bg-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35)] cursor-pointer",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RiExternalLinkLine, { className: "text-sm" }),
              "Launch Invisible HUD"
            ]
          }
        ),
        launchStatus && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-1 rounded-lg", children: launchStatus })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "lg:col-span-6 p-4 rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl flex flex-col space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between flex-wrap gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: `h-7 w-7 rounded-lg flex items-center justify-center border ${isAudioConnected ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]" : "bg-white/5 border-white/10 text-zinc-400"}`,
                children: isAudioConnected ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiMicLine, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiMicOffLine, {})
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-zinc-100", children: "Live Voice Channeling" }),
                hasLoopbackAudio && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-950/80 border border-cyan-500/40 text-cyan-300", children: "PC Loopback Synced" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400", children: isAudioConnected ? audioChannelMode === "dual" ? "Channeling dual PC loopback + microphone" : audioChannelMode === "loopback" ? "Channeling meeting audio output loopback" : "Channeling candidate microphone" : "Audio channels idle" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center bg-black/40 p-0.5 rounded-lg border border-white/10 text-[10px] font-mono", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAudioChannelMode("dual"),
                  className: `px-2 py-1 rounded transition-all ${audioChannelMode === "dual" ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Capture both PC Meeting Audio and Candidate Mic",
                  children: "Dual Mix"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAudioChannelMode("loopback"),
                  className: `px-2 py-1 rounded transition-all ${audioChannelMode === "loopback" ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/30" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Capture PC Meeting / Speaker Audio Only (Interviewer Focus)",
                  children: "PC Audio"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => setAudioChannelMode("mic"),
                  className: `px-2 py-1 rounded transition-all ${audioChannelMode === "mic" ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-400/30" : "text-zinc-400 hover:text-zinc-200"}`,
                  title: "Capture Candidate Microphone Only",
                  children: "Mic"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: toggleAudioConnection,
                className: `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer border ${isAudioConnected ? "bg-rose-500/20 hover:bg-rose-500/30 border-rose-500/40 text-rose-300" : "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]"}`,
                children: [
                  isAudioConnected ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiStopCircleLine, {}) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiPlayCircleLine, {}),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: isAudioConnected ? "Disconnect" : "Connect Voice" })
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 p-2 rounded-xl bg-black/40 border border-white/5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[9px] font-mono", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-cyan-400 flex items-center gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: `h-1.5 w-1.5 rounded-full ${hasLoopbackAudio ? "bg-cyan-400 animate-pulse" : "bg-zinc-600"}`
                  }
                ),
                "🔊 Interviewer (PC Audio)"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-400", children: hasLoopbackAudio ? `${pcAudioLevel}%` : "Off" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-1.5 rounded-full bg-white/10 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-75",
                style: { width: `${hasLoopbackAudio ? pcAudioLevel : 0}%` }
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[9px] font-mono", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-emerald-400 flex items-center gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: `h-1.5 w-1.5 rounded-full ${isAudioConnected ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`
                  }
                ),
                "🎙️ Candidate (Mic)"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-zinc-400", children: isAudioConnected ? `${micAudioLevel}%` : "Off" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-1.5 rounded-full bg-white/10 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-75",
                style: { width: `${isAudioConnected ? micAudioLevel : 0}%` }
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-2.5 rounded-xl bg-black/40 border border-white/5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("canvas", { ref: canvasRef, width: 180, height: 32, className: "rounded" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col justify-center space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-[10px] font-mono text-zinc-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiBrainLine, { className: "text-emerald-400" }),
                "1300ms Silence Trigger"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-emerald-400 font-bold", children: [
                silenceProgress,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-1.5 rounded-full bg-white/10 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-75",
                style: { width: `${silenceProgress}%` }
              }
            ) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 cursor-pointer shrink-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "checkbox",
                checked: autoSolveEnabled,
                onChange: (e) => setAutoSolveEnabled(e.target.checked),
                className: "accent-emerald-400 rounded"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Auto-Solve" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2.5 rounded-xl bg-black/50 border border-white/5 min-h-[50px] max-h-[80px] overflow-y-auto", children: [
          interimTranscript && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-cyan-300 font-mono italic animate-pulse", children: [
            '🎙️ "',
            interimTranscript,
            '..."'
          ] }),
          liveTranscript ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-zinc-200 font-mono", children: liveTranscript }) : !interimTranscript && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-500 font-mono italic", children: isAudioConnected ? "Listening... interviewer speech will appear here and auto-solve upon pause." : 'Click "Connect PC Audio" to activate live speech capture and silence detection.' })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "lg:col-span-6 p-4 rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl flex flex-col space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: `h-7 w-7 rounded-lg flex items-center justify-center border ${isScreenConnected ? "bg-purple-500/20 border-purple-400/40 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.3)]" : "bg-white/5 border-white/10 text-zinc-400"}`,
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiTvLine, {})
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold text-zinc-100", children: "Live Problem Screen Share" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-400", children: isScreenConnected ? "Connected to desktop display" : "No screen source active" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: isScreenConnected ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: handleSnapAndSolveScreen,
                className: "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all bg-purple-500 text-white hover:bg-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)] cursor-pointer",
                title: "Shortcut: Ctrl+Shift+1",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(RiCameraLensLine, {}),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Snap & Solve" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleDisconnectScreen,
                className: "p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 cursor-pointer",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { className: "text-sm" })
              }
            )
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: handleOpenSourcePicker,
              className: "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all bg-white/10 hover:bg-white/20 border border-white/15 text-zinc-200 cursor-pointer",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiTvLine, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Connect Screen" })
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-[95px] w-full rounded-xl overflow-hidden border border-white/10 bg-black/60 flex items-center justify-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "video",
            {
              ref: videoRef,
              autoPlay: true,
              playsInline: true,
              muted: true,
              className: `h-full w-full object-cover ${isScreenConnected ? "block" : "hidden"}`
            }
          ),
          !isScreenConnected && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center text-center p-3 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(RiCameraLensLine, { className: "text-zinc-600 text-xl" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono text-zinc-400", children: "Select screen or code window to allow instant (Ctrl+Shift+1) OCR code snapshots." })
          ] }),
          isScreenConnected && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/75 border border-white/10 text-[9px] font-mono text-purple-300", children: "LIVE CAPTURE ACTIVE (Ctrl+Shift+1)" })
        ] })
      ] })
    ] }),
    showSourceModal && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-2xl bg-zinc-950 border border-white/15 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pb-3 border-b border-white/10", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-bold text-zinc-100 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(RiTvLine, { className: "text-purple-400" }),
          "Select Display or Application Window to Share"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setShowSourceModal(false),
            className: "text-zinc-400 hover:text-white p-1 rounded-lg",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RiCloseLine, { className: "text-lg" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto p-1", children: screenSources.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => handleSelectScreenSource(s),
          className: "flex flex-col rounded-xl border border-white/10 bg-white/5 hover:border-purple-400/50 hover:bg-purple-500/10 p-2.5 transition-all text-left group cursor-pointer",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: s.thumbnail,
                alt: s.name,
                className: "w-full h-24 object-cover rounded-lg border border-white/10 mb-2 bg-black"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-mono font-medium text-zinc-200 truncate group-hover:text-purple-300", children: s.name })
          ]
        },
        s.id
      )) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 border-b border-white/10 pb-2", children: ["Coding", "System Design", "Behavioral"].map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: () => {
          setActiveCategory(cat);
          const firstMatch = PRESET_QUESTIONS.find((q) => q.category === cat);
          if (firstMatch) {
            setActiveQuestion(firstMatch);
            setDisplayedAnswer(firstMatch.mockAnswer);
          }
        },
        className: `px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer ${activeCategory === cat ? "bg-emerald-400/15 border border-emerald-400/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent"}`,
        children: cat
      },
      cat
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[500px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "lg:col-span-5 flex flex-col space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl flex flex-col space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-black tracking-widest text-zinc-400 uppercase", children: [
              "Practice Prompts (",
              activeCategory,
              ")"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-emerald-400", children: "Click to Preview" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: PRESET_QUESTIONS.filter((q) => q.category === activeCategory).map((q) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => {
                setActiveQuestion(q);
                setDisplayedAnswer(q.mockAnswer);
              },
              className: `w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${activeQuestion.id === q.id ? "border-emerald-400/40 bg-emerald-400/[0.08] shadow-[0_0_15px_rgba(16,185,129,0.12)]" : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300", children: q.category }),
                  q.expectedComplexity && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-emerald-400", children: q.expectedComplexity })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-bold text-zinc-100", children: q.title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] text-zinc-400 line-clamp-2 mt-1", children: q.question })
              ]
            },
            q.id
          )) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur-xl flex flex-col space-y-2.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-black tracking-widest text-zinc-400 uppercase", children: "Direct Question Input" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-zinc-500", children: "Ctrl + Enter to solve" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              value: customQuestion,
              onChange: (e) => setCustomQuestion(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  const query = customQuestion.trim() || liveTranscript.trim();
                  if (query) solveInterviewQuestion(query);
                }
              },
              placeholder: "Paste or type any coding problem, system design prompt, or behavioral question...",
              rows: 3,
              className: "w-full text-xs p-3 rounded-xl border border-white/10 bg-black/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-400/40 transition-colors resize-none"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => {
                const query = customQuestion.trim() || liveTranscript.trim();
                if (!query) return;
                solveInterviewQuestion(query);
              },
              disabled: isStreaming,
              className: "w-full py-2.5 rounded-xl text-xs font-black tracking-wider uppercase bg-emerald-400 text-black hover:bg-emerald-300 transition-all cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.25)] flex items-center justify-center gap-2 disabled:opacity-50",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(RiSparklingLine, { className: "text-sm" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: isStreaming ? "Synthesizing..." : `Solve with ${aiEngine === "auto" ? "Puter & Gemini" : aiEngine === "puter" ? "Puter AI" : aiEngine === "gemini" ? "Gemini API" : "Local Daemon"}` })
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "lg:col-span-7 flex flex-col p-5 rounded-2xl border border-white/10 bg-zinc-950/75 backdrop-blur-2xl shadow-2xl relative overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between pb-4 border-b border-white/10 mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2.5 py-1 rounded-md text-[10px] font-mono font-black uppercase tracking-wider bg-emerald-400/15 border border-emerald-400/30 text-emerald-300", children: activeQuestion.category }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold text-zinc-100", children: activeQuestion.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-950/80 border border-cyan-500/30 text-cyan-300", children: activeEngineBadge }),
            isStreaming && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 animate-pulse", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1.5 w-1.5 rounded-full bg-cyan-400" }),
              " STREAMING"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: handleCopy,
              className: "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors cursor-pointer",
              children: [
                copied ? /* @__PURE__ */ jsxRuntimeExports.jsx(RiCheckLine, { className: "text-emerald-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RiFileCopyLine, {}),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: copied ? "Copied" : "Copy" })
              ]
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto pr-2 space-y-4 text-xs font-sans leading-relaxed", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MarkdownMath, { content: displayedAnswer || "_Waiting for question input or speech..._" }) })
      ] })
    ] })
  ] });
};
export {
  InterviewCopilotView,
  InterviewCopilotView as default
};
