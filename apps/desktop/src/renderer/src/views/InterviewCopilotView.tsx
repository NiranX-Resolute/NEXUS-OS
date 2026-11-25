import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  RiShieldFlashLine,
  RiShieldCheckLine,
  RiVolumeUpLine,
  RiMicLine,
  RiMicOffLine,
  RiScanLine,
  RiCameraLensLine,
  RiCursorLine,
  RiGhostLine,
  RiCodeSSlashLine,
  RiServerLine,
  RiStarLine,
  RiFileCopyLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiSparklingLine,
  RiExternalLinkLine,
  RiTimeLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiTerminalBoxLine,
  RiTvLine,
  RiCloseLine,
  RiRefreshLine,
  RiPlayCircleLine,
  RiStopCircleLine,
  RiSoundModuleLine,
  RiBrainLine,
  RiBookOpenLine,
  RiSendPlane2Line,
  RiEyeOffLine
} from 'react-icons/ri'
import MarkdownMath from '@renderer/components/MarkdownMath'
import { executePuterChat } from '@renderer/services/nexus-puter-api'
import { generateWithNexusGeminiClient } from '@renderer/services/nexus-gemini-api'

export type InterviewMode = 'Coding' | 'System Design' | 'STAR'
export type AiEngineType = 'auto' | 'puter' | 'gemini' | 'daemon'

interface ScreenSource {
  id: string
  name: string
  thumbnail: string
}

interface PracticeQuestion {
  id: string
  category: InterviewMode
  title: string
  question: string
  expectedComplexity?: string
  referenceSolution: string
}

const PRESET_QUESTIONS: PracticeQuestion[] = [
  {
    id: 'lru-cache',
    category: 'Coding',
    title: 'LRU Cache Design (O(1))',
    question:
      'Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement get(key) and put(key, value) in O(1) average time complexity.',
    expectedComplexity: 'Time: O(1) | Space: O(capacity)',
    referenceSolution: `### 1. Executive Thesis
Pair a **Doubly Linked List** with a **Hash Map**. The map provides $O(1)$ key lookup directly to node pointers, while the doubly linked list permits $O(1)$ node eviction from the tail and insertion at the head without memory reallocation.

### 2. Algorithmic Intuition & Invariants
* **Sentinel Nodes:** Maintain dummy \`head\` and \`tail\` pointers to eliminate edge-case null checking when splicing nodes.
* **Get Operation:** Lookup in map; if found, move node to \`head\` and return value ($O(1)$).
* **Put Operation:** If exists, update and promote to head. If new, evict \`tail.prev\` if at capacity, insert new node at head, update map ($O(1)$).

### 3. Complexity Analysis
- **Time Complexity:** $O(1)$ for both \`get\` and \`put\` via hash index + doubly-linked splicing.
- **Space Complexity:** $O(C)$ where $C$ is the maximum cache capacity.

### 4. Production Implementation
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

### 5. Edge Cases & Verification
- **Zero or 1 Capacity:** Handled cleanly without null pointer faults due to sentinels.
- **Overwrite Existing Key:** Value updates correctly without increasing size count.
- **Eviction Order:** Strictly preserves temporal access recency.`
  },
  {
    id: 'merge-k-sorted',
    category: 'Coding',
    title: 'Merge K Sorted Lists (O(N log K))',
    question:
      'You are given an array of k linked-lists lists, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.',
    expectedComplexity: 'Time: O(N log K) | Space: O(K)',
    referenceSolution: `### 1. Executive Thesis
Utilize a **Min-Heap (Priority Queue)** initialized with the root node of all $K$ lists. Repeatedly pop the minimal node into the result stream and push its \`next\` successor until all $K$ streams are exhausted.

### 2. Algorithmic Intuition
- **Heap Size Invariant:** At most $K$ elements reside in the heap simultaneously, bounding comparison overhead to $O(\\log K)$ per extracted node.
- **Sentinel Splicing:** Connect through a dummy pre-head pointer to produce a contiguous list without special casing the first element.

### 3. Complexity Analysis
- **Time Complexity:** $O(N \\log K)$ where $N$ is total node count across all lists and $K$ is number of lists.
- **Space Complexity:** $O(K)$ auxiliary memory for the binary heap.

### 4. Production Implementation
\`\`\`typescript
interface ListNode {
  val: number;
  next: ListNode | null;
}

export function mergeKLists(lists: Array<ListNode | null>): ListNode | null {
  const dummy = { val: 0, next: null } as ListNode;
  let curr = dummy;
  const heap: ListNode[] = [];

  for (const node of lists) {
    if (node) heap.push(node);
  }

  const siftUp = (i: number) => {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (heap[p].val > heap[i].val) {
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      } else break;
    }
  };

  const siftDown = (i: number) => {
    const len = heap.length;
    while (2 * i + 1 < len) {
      let smallest = 2 * i + 1;
      const right = 2 * i + 2;
      if (right < len && heap[right].val < heap[smallest].val) {
        smallest = right;
      }
      if (heap[smallest].val < heap[i].val) {
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      } else break;
    }
  };

  for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) {
    siftDown(i);
  }

  while (heap.length > 0) {
    const minNode = heap[0];
    curr.next = minNode;
    curr = curr.next;

    if (minNode.next) {
      heap[0] = minNode.next;
      siftDown(0);
    } else {
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        siftDown(0);
      }
    }
  }

  return dummy.next;
}
\`\`\``
  },
  {
    id: 'system-design-chat',
    category: 'System Design',
    title: 'Distributed Real-Time Chat Mesh',
    question:
      'Architect a low-latency real-time chat application (Discord/Slack scale) supporting 50M DAU, 1-on-1 DMs, group channels, and message persistence with P99 < 100ms.',
    expectedComplexity: 'P99 Latency < 100ms | 99.99% Availability',
    referenceSolution: `### 1. Executive Thesis
Decouple stateless REST operations from stateful duplex connections using an edge **WebSocket Gateway Cluster** backed by distributed **Redis Pub/Sub** message buses and a wide-column store (**ScyllaDB / Cassandra**) partitioned for sequential time-series pagination.

### 2. Architecture & Data Flow
1. **Edge Gateway:** Clients establish TLS WebSocket connections to the nearest regional gateway. Connection session registry mapping (\`user_id -> gateway_pod_id\`) resides in Redis.
2. **Message Sequencing:** Worker generates a monotonically ordered sequence ID (Snowflake/UUIDv7) ensuring deterministic timeline placement across sharded partitions.
3. **Dispatch:** Redis pub/sub broadcasts to recipient gateway pod; pod sends binary frame over recipient's WebSocket.
4. **Persistence:** ScyllaDB partitions by \`(channel_id, bucket_month)\` with clustering key \`seq_id DESC\`.

### 3. Low-Latency Heuristics & P99
- **Connection Keep-Alive:** Dual-heartbeat 30s ping frames with sub-5ms jitter detection.
- **Write-Behind Caching:** Recent messages (last 200) cached in Redis Sorted Sets (\`ZREVRANGEBYSCORE\`) serving 95% of reads without disk I/O.
- **Connection Pooling:** gRPC multiplexing between gateway nodes and core dispatch routers.

### 4. Persistence & Data Model
\`\`\`sql
CREATE TABLE channel_messages (
    channel_id uuid,
    bucket_month text,
    seq_id bigint,
    sender_id uuid,
    content text,
    attachments list<text>,
    PRIMARY KEY ((channel_id, bucket_month), seq_id)
) WITH CLUSTERING ORDER BY (seq_id DESC);
\`\`\`

### 5. Bottlenecks & Failure Modes
- **Celebrity Channel Broadcast Fanout:** Channels with >100k subscribers utilize tiered fanout trees with local edge proxy repeaters rather than direct point-to-point pub/sub.
- **Network Partition:** Quorum writes (\`LOCAL_QUORUM\`) prevent split-brain persistence anomalies across availability zones.`
  },
  {
    id: 'system-design-ratelimiter',
    category: 'System Design',
    title: 'High-Throughput Global Rate Limiter',
    question:
      'Design a distributed rate-limiting service capable of evaluating 1,000,000 requests per second across multi-region edge gateways with zero race conditions.',
    expectedComplexity: 'Throughput > 1M RPS | Latency < 2ms',
    referenceSolution: `### 1. Executive Thesis
Implement a **Sliding Window Counter** or **Token Bucket** algorithm executed atomically directly inside Redis memory via **Lua scripts**, supplemented by regional local memory token pre-allocations to shield central storage.

### 2. Architecture & Mechanics
1. **Local Pre-Allocation:** Edge gateways reserve token blocks (e.g. 1,000 tokens / 100ms) locally from Redis, evaluating 99% of requests with zero network roundtrips.
2. **Atomic Sliding Log Script:** For strict compliance tiers, Redis executes a single Lua transaction removing expired timestamps and verifying capacity.

### 3. Atomic Redis Lua Implementation
\`\`\`lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current_time = tonumber(ARGV[2])
local window = tonumber(ARGV[3])

-- Clean expired request timestamps
redis.call('ZREMRANGEBYSCORE', key, 0, current_time - window)

local current_requests = redis.call('ZCARD', key)
if current_requests < limit then
    redis.call('ZADD', key, current_time, current_time)
    redis.call('PEXPIRE', key, window)
    return 1 -- Allowed
else
    return 0 -- Rejected
end
\`\`\`

### 4. Failure Mode Resilience
If regional Redis clusters become temporarily partitioned, gateways switch to local in-memory fallback limits (fail-open for tier-1 traffic, fail-closed for payment endpoints).`
  },
  {
    id: 'behavioral-nexus',
    category: 'STAR',
    title: 'STAR: Sovereign Zero-Subscription Architecture',
    question:
      'Tell me about an ambitious architectural project where you had to push boundaries and overcome technical constraints.',
    expectedComplexity: 'Impact: 100% Free-Tier Sovereign Computing',
    referenceSolution: `### 1. Executive Thesis
As Creator of the Nexus OS ecosystem, I engineered a distributed, zero-subscription desktop-to-edge agent mesh delivering sovereign AI computing without relying on costly enterprise SaaS models.

### 2. STAR Method Breakdown
* **Situation:** Modern AI workflows are gated behind recurring corporate subscriptions, proprietary API paywalls, and cloud vendor lock-in. Developers needed sovereign, local-first control with zero recurring costs.
* **Task:** Architect a hybrid desktop agent connecting native OS capabilities (Win32 API, desktop WASAPI loopback audio, Display Affinity) with edge compute (Cloudflare Workers, D1 SQLite, Puter multi-model hubs) at 100% zero subscription overhead.
* **Action:**
  * Implemented native Win32 Display Affinity (\`WDA_EXCLUDEFROMCAPTURE\`) for undetectable HUD overlays during screen sharing.
  * Built low-latency WASAPI loopback audio pipelines coupled with 1300ms silence detection heuristics for real-time speech recognition.
  * Integrated multi-engine AI cascade (Puter.js free frontier models + Google Gemini + local Argon Daemon) delivering sub-400ms Time-To-First-Token answers.
  * Persisted operational context locally via SQLite WAL mode and Windows DPAPI encrypted credential vaults.
* **Result:** Achieved 100% sovereign operation, eliminated recurring monthly subscriptions, maintained absolute local data sovereignty, and demonstrated enterprise-grade real-time interview assistance.`
  },
  {
    id: 'behavioral-incident',
    category: 'STAR',
    title: 'STAR: High-Concurrency Production Incident Resolution',
    question:
      'Describe a time when a critical production system experienced high-severity failures and how you led the triage and resolution under pressure.',
    expectedComplexity: 'Impact: Restored 99.99% Availability & Prevented Cascading DB Crash',
    referenceSolution: `### 1. Executive Thesis
During a sudden 15x traffic surge on our payment authorization gateway, thread pool exhaustion caused cascading connection pool deadlocks across database clusters. I took charge as Incident Commander, implemented emergency load shedding, and resolved the architectural bottleneck.

### 2. STAR Method Breakdown
* **Situation:** A marketing push triggered 250,000 concurrent checkout attempts. Database read/write connections spiked to 100%, causing HTTP 504 timeouts across the core payment gateway.
* **Task:** Prevent complete database cluster crash, restore payment throughput within 15 minutes, and guarantee zero double-charges or corrupted transaction records.
* **Action:**
  * **Immediate Containment:** Activated circuit breakers on non-critical read analytics endpoints, immediately shedding 60% of database load.
  * **Dynamic Concurrency Throttling:** Reconfigured the edge Envoy gateways to enforce adaptive concurrency limits based on latency P99 rather than static thread counts.
  * **Idempotency Enforcement:** Ensured all retrying clients were keyed on monotonic idempotency tokens in Redis, stopping duplicate write storms.
* **Result:** Restored full service availability in under 12 minutes with zero data corruption and zero duplicate billing events. Subsequently authored the post-mortem that institutionalized bulkhead isolation and automated load-shedding across all engineering services.`
  }
]

const INTERVIEW_SYSTEM_PROMPTS: Record<InterviewMode, string> = {
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

  'System Design': `You are Nexus Interview Copilot, a principal distributed systems architect.
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

  STAR: `You are Nexus Interview Copilot, an executive leadership and engineering coach.
Provide authentic, high-impact behavioral answers formatted using the STAR method.
Structure your response as:
### 1. Executive Thesis
High-level accomplishment, leadership context, and sovereign impact.
### 2. STAR Method Breakdown
- **Situation:** High-stakes environment and engineering constraint.
- **Task:** Specific ownership boundary and goal.
- **Action:** Concrete technical decisions and leadership execution.
- **Result:** Quantifiable impact (e.g. 100% free-tier sovereign architecture, sub-millisecond speedup).`
}

export const InterviewCopilotView = () => {
  // Mode & Questions State
  const [activeCategory, setActiveCategory] = useState<InterviewMode>('Coding')
  const [activeQuestion, setActiveQuestion] = useState<PracticeQuestion>(PRESET_QUESTIONS[0])
  const [customQuestion, setCustomQuestion] = useState('')
  const [displayedAnswer, setDisplayedAnswer] = useState(PRESET_QUESTIONS[0].referenceSolution)
  const [isStreaming, setIsStreaming] = useState(false)
  const [latencyMs, setLatencyMs] = useState<number | null>(340)
  const [copiedAll, setCopiedAll] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Drawer & Popover Toggles
  const [showPromptsDrawer, setShowPromptsDrawer] = useState(false)
  const [showDirectInput, setShowDirectInput] = useState(false)

  // Cyberpunk HUD Row 1 Feature States
  const [isStealthCloaked, setIsStealthCloaked] = useState(true)
  const [isPassthrough, setIsPassthrough] = useState(false)
  const [isAudioConnected, setIsAudioConnected] = useState(false)
  const [audioChannelMode, setAudioChannelMode] = useState<'dual' | 'loopback' | 'mic'>('dual')
  const [hasLoopbackAudio, setHasLoopbackAudio] = useState(false)
  const [pcAudioLevel, setPcAudioLevel] = useState(0)
  const [micAudioLevel, setMicAudioLevel] = useState(0)
  const [vadActive, setVadActive] = useState(false)
  const [autoSolveEnabled, setAutoSolveEnabled] = useState(true)
  const [silenceProgress, setSilenceProgress] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')

  // Multi-Engine State (Auto, Puter, Gemini, Daemon)
  const [aiEngine, setAiEngine] = useState<AiEngineType>('auto')
  const [activeEngineBadge, setActiveEngineBadge] = useState<string>('Auto (Puter / Gemini)')
  const [daemonOnline, setDaemonOnline] = useState<boolean>(false)
  const [launchStatus, setLaunchStatus] = useState<string | null>(null)

  // WinRT OCR & Screen Sentry State
  const [isScreenConnected, setIsScreenConnected] = useState(false)
  const [screenSources, setScreenSources] = useState<ScreenSource[]>([])
  const [showSourceModal, setShowSourceModal] = useState(false)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'capturing' | 'analyzing' | 'done'>('idle')
  const [screenSnapshotData, setScreenSnapshotData] = useState<string | null>(null)

  // Media & Hardware References
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const loopbackStreamRef = useRef<MediaStream | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const loopbackSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const loopbackAnalyserRef = useRef<AnalyserNode | null>(null)
  const levelIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const silenceIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // Disconnect & Cleanup Media
  const disconnectAllMedia = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (loopbackStreamRef.current) {
      loopbackStreamRef.current.getTracks().forEach((t) => t.stop())
      loopbackStreamRef.current = null
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }
    if (loopbackSourceRef.current) {
      try {
        loopbackSourceRef.current.disconnect()
      } catch {}
      loopbackSourceRef.current = null
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect()
      } catch {}
      micSourceRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)
    if (levelIntervalRef.current) clearInterval(levelIntervalRef.current)
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    if (videoRef.current) videoRef.current.srcObject = null

    setIsAudioConnected(false)
    setIsScreenConnected(false)
    setHasLoopbackAudio(false)
    setPcAudioLevel(0)
    setMicAudioLevel(0)
    setVadActive(false)
    setInterimTranscript('')
    setSilenceProgress(0)
  }, [])

  // Auto-cleanup on unmount or tab switch
  useEffect(() => {
    const handleTabSwitch = (e: any) => {
      const tab = e.detail?.tab
      if (tab && tab !== 'interview' && tab !== 'INTERVIEW') {
        disconnectAllMedia()
      }
    }
    window.addEventListener('nexus-switch-tab', handleTabSwitch)
    return () => {
      window.removeEventListener('nexus-switch-tab', handleTabSwitch)
      disconnectAllMedia()
    }
  }, [disconnectAllMedia])

  // Check Argon Daemon
  useEffect(() => {
    const checkDaemon = async () => {
      try {
        if (window.electron?.ipcRenderer?.invoke) {
          const res = await window.electron.ipcRenderer.invoke('interview:ensure-daemon')
          setDaemonOnline(Boolean(res?.running))
        } else {
          const res = await fetch('http://127.0.0.1:8090/health', { signal: AbortSignal.timeout(800) })
          setDaemonOnline(res.ok)
        }
      } catch {
        setDaemonOnline(false)
      }
    }
    checkDaemon()
  }, [])

  // 1. WDA_EXCLUDEFROMCAPTURE Stealth Toggle
  const toggleStealthCloak = async () => {
    const nextState = !isStealthCloaked
    setIsStealthCloaked(nextState)
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        await window.electron.ipcRenderer.invoke('interview:set-stealth', {
          affinity: nextState ? 'WDA_EXCLUDEFROMCAPTURE' : 'WDA_NONE'
        })
      }
    } catch {
      // Graceful fallback
    }
  }

  // 2. Click-Through Passthrough Mode Toggle
  const togglePassthrough = async () => {
    const nextState = !isPassthrough
    setIsPassthrough(nextState)
    try {
      if (window.electron?.ipcRenderer) {
        // Toggle window mouse events ignoring
        await window.electron.ipcRenderer.invoke('interview:set-ignore-mouse-events', {
          ignore: nextState,
          forward: true
        })
      }
    } catch {
      // Graceful local state handling
    }
  }

  // Keyboard shortcut listener: Escape exits passthrough, Ctrl+Shift+1 for WinRT OCR
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPassthrough) {
        togglePassthrough()
      }
      if (e.ctrlKey && e.shiftKey && (e.key === '!' || e.key === '1')) {
        e.preventDefault()
        handleTriggerWinRtOcr()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPassthrough])

  // 3. Multi-Engine Solver Function
  const solveInterviewQuestion = useCallback(
    async (questionText: string, contextSnapshot?: string) => {
      const cleanPrompt = questionText.trim()
      if (!cleanPrompt) return

      setIsStreaming(true)
      const startTime = Date.now()
      const systemPrompt = INTERVIEW_SYSTEM_PROMPTS[activeCategory]
      const engineLabel =
        aiEngine === 'auto'
          ? 'Puter / Gemini'
          : aiEngine === 'puter'
            ? 'Puter AI'
            : aiEngine === 'gemini'
              ? 'Google Gemini'
              : 'Argon Daemon'

      setDisplayedAnswer(`⚡ [NEXUS COPILOT] Synthesizing optimal answer via ${engineLabel}...`)

      try {
        let answerText = ''
        let engineUsed = ''

        // Strategy A: Argon Daemon
        if (aiEngine === 'daemon') {
          engineUsed = 'Argon Daemon (8090)'
          if (window.electron?.ipcRenderer?.invoke) {
            const res = await window.electron.ipcRenderer.invoke('interview:solve-daemon', {
              question: cleanPrompt,
              mode: activeCategory.toLowerCase(),
              screenContext: contextSnapshot || screenSnapshotData || undefined
            })
            if (res.success && res.answer) {
              answerText = res.answer
            } else {
              throw new Error(res.error || 'Argon Daemon offline on port 8090. Try Auto or Puter mode.')
            }
          } else {
            const resp = await fetch('http://127.0.0.1:8090/api/interview/solve', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                question: cleanPrompt,
                mode: activeCategory.toLowerCase(),
                screenContext: contextSnapshot || screenSnapshotData || undefined
              })
            })
            const data = await resp.json()
            if (data.success && data.answer) {
              answerText = data.answer
            } else {
              throw new Error(data.error || 'Failed to reach local daemon on port 8090.')
            }
          }
        }

        // Strategy B: Puter.js
        if (!answerText && (aiEngine === 'puter' || aiEngine === 'auto')) {
          try {
            const promptWithContext = contextSnapshot
              ? `${cleanPrompt}\n\n[WinRT OCR Candidate Screen Context attached from live screen share]`
              : cleanPrompt

            const puterRes = await executePuterChat({
              model: 'gemini-2.0-flash',
              system: systemPrompt,
              messages: [{ role: 'user', content: promptWithContext }],
              temperature: 0.3,
              maxTokens: 4096
            })

            if (puterRes && puterRes.trim().length > 15) {
              answerText = puterRes.trim()
              engineUsed = 'Puter AI (Gemini 2.0 Flash)'
            }
          } catch (puterErr) {
            console.warn('[InterviewCopilot] Puter AI attempt failed:', puterErr)
            if (aiEngine === 'puter') throw puterErr
          }
        }

        // Strategy C: Google Gemini API Direct
        if (!answerText && (aiEngine === 'gemini' || aiEngine === 'auto')) {
          try {
            if (window.electron?.ipcRenderer?.invoke) {
              const ipcRes = await window.electron.ipcRenderer.invoke('ai-gateway:chat', {
                provider: 'gemini',
                model: 'gemini-2.0-flash',
                system: systemPrompt,
                messages: [{ role: 'user', content: cleanPrompt }]
              })

              if (ipcRes?.success && ipcRes?.content) {
                answerText = ipcRes.content.trim()
                engineUsed = 'Google Gemini Direct'
              }
            }

            if (!answerText) {
              const geminiRes = await generateWithNexusGeminiClient({
                prompt: cleanPrompt,
                system: systemPrompt,
                model: 'gemini-2.5-flash',
                temperature: 0.3
              })
              if (geminiRes && geminiRes.trim().length > 15) {
                answerText = geminiRes.trim()
                engineUsed = 'Google Gemini API'
              }
            }
          } catch (geminiErr) {
            console.warn('[InterviewCopilot] Gemini API attempt failed:', geminiErr)
            if (aiEngine === 'gemini') throw geminiErr
          }
        }

        // Strategy D: Daemon fallback
        if (!answerText && aiEngine === 'auto' && window.electron?.ipcRenderer?.invoke) {
          try {
            const res = await window.electron.ipcRenderer.invoke('interview:solve-daemon', {
              question: cleanPrompt,
              mode: activeCategory.toLowerCase(),
              screenContext: contextSnapshot || screenSnapshotData || undefined
            })
            if (res.success && res.answer) {
              answerText = res.answer
              engineUsed = 'Argon Daemon'
            }
          } catch {}
        }

        if (!answerText) {
          throw new Error('All AI synthesis engines (Puter, Gemini, Daemon) unreachable. Check connectivity.')
        }

        // Parse JSON wrapper if present
        try {
          if (answerText.trim().startsWith('{') && answerText.trim().endsWith('}')) {
            const parsed = JSON.parse(answerText)
            if (parsed.headline || parsed.answer || parsed.solution) {
              answerText = `### 1. Solution Thesis\n**${parsed.headline || 'Optimal Strategy'}**\n\n${
                parsed.solution || parsed.answer || parsed.content || ''
              }`
            }
          }
        } catch {}

        const duration = Date.now() - startTime
        setLatencyMs(duration)
        setActiveEngineBadge(engineUsed)

        // Typewriter streaming effect
        let currentIdx = 0
        const interval = setInterval(() => {
          currentIdx += 45
          if (currentIdx >= answerText.length) {
            setDisplayedAnswer(answerText)
            setIsStreaming(false)
            clearInterval(interval)
          } else {
            setDisplayedAnswer(answerText.slice(0, currentIdx))
          }
        }, 12)
      } catch (err: any) {
        console.error('[InterviewCopilot] Solver error:', err)
        setDisplayedAnswer(
          `### ⚠️ Live Generation Error\n\`${err?.message || String(err)}\`\n\nEnsure network is connected or switch Engine to Puter AI or Gemini API.`
        )
        setIsStreaming(false)
      }
    },
    [activeCategory, aiEngine, screenSnapshotData]
  )

  // Attach Loopback Audio Channel
  const attachLoopbackToPipeline = useCallback((loopStream: MediaStream) => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') return

    try {
      if (loopbackSourceRef.current) {
        try {
          loopbackSourceRef.current.disconnect()
        } catch {}
        loopbackSourceRef.current = null
      }

      const audioCtx = audioContextRef.current
      const source = audioCtx.createMediaStreamSource(loopStream)
      loopbackSourceRef.current = source

      const loopAnalyser = audioCtx.createAnalyser()
      loopAnalyser.fftSize = 64
      source.connect(loopAnalyser)
      loopbackAnalyserRef.current = loopAnalyser

      if (analyserRef.current) {
        source.connect(analyserRef.current)
      }
      setHasLoopbackAudio(true)
    } catch (e) {
      console.warn('[InterviewCopilot] Failed to attach loopback audio:', e)
    }
  }, [])

  // 4. Connect / Disconnect Audio Pipeline (Loopback WASAPI + Mic VAD)
  const toggleAudioConnection = async () => {
    if (isAudioConnected) {
      disconnectAllMedia()
      return
    }

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const audioCtx = new AudioCtx()
      audioContextRef.current = audioCtx

      const masterAnalyser = audioCtx.createAnalyser()
      masterAnalyser.fftSize = 64
      analyserRef.current = masterAnalyser

      // 1. Microphone Channel (Candidate Voice)
      if (audioChannelMode === 'dual' || audioChannelMode === 'mic') {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          })
          micStreamRef.current = micStream

          const micSource = audioCtx.createMediaStreamSource(micStream)
          micSourceRef.current = micSource

          const micAnalyser = audioCtx.createAnalyser()
          micAnalyser.fftSize = 64
          micSource.connect(micAnalyser)
          micAnalyserRef.current = micAnalyser
          micSource.connect(masterAnalyser)
        } catch (micErr) {
          console.warn('[InterviewCopilot] Mic access notice:', micErr)
        }
      }

      // 2. Loopback Audio Channel (WASAPI Meeting Audio)
      if ((audioChannelMode === 'dual' || audioChannelMode === 'loopback') && loopbackStreamRef.current) {
        attachLoopbackToPipeline(loopbackStreamRef.current)
      }

      // 3. Audio Levels & Voice Activity Detection (VAD) Loop
      levelIntervalRef.current = setInterval(() => {
        // Measure Mic
        if (micAnalyserRef.current) {
          const micData = new Uint8Array(micAnalyserRef.current.frequencyBinCount)
          micAnalyserRef.current.getByteFrequencyData(micData)
          let sum = 0
          for (let i = 0; i < micData.length; i++) sum += micData[i]
          const avg = sum / (micData.length || 1)
          const level = Math.min(100, Math.round((avg / 140) * 100))
          setMicAudioLevel(level)
          setVadActive(level > 12)
        } else {
          setMicAudioLevel(0)
          setVadActive(false)
        }

        // Measure Loopback
        if (loopbackAnalyserRef.current) {
          const loopData = new Uint8Array(loopbackAnalyserRef.current.frequencyBinCount)
          loopbackAnalyserRef.current.getByteFrequencyData(loopData)
          let sum = 0
          for (let i = 0; i < loopData.length; i++) sum += loopData[i]
          const avg = sum / (loopData.length || 1)
          setPcAudioLevel(Math.min(100, Math.round((avg / 140) * 100)))
        } else {
          setPcAudioLevel(0)
        }
      }, 60)

      // 4. Speech Recognition with 1300ms Silence VAD Trigger
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRec) {
        const recognition = new SpeechRec()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event: any) => {
          let interim = ''
          let final = ''

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript
            } else {
              interim += event.results[i][0].transcript
            }
          }

          if (interim) {
            setInterimTranscript(interim)
          }

          if (final) {
            const cleanFinal = final.trim()
            setLiveTranscript((prev) => (prev ? `${prev} ${cleanFinal}` : cleanFinal))
            setInterimTranscript('')

            // 1300ms silence detection window
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)

            let countdown = 1300
            setSilenceProgress(100)
            silenceIntervalRef.current = setInterval(() => {
              countdown -= 50
              setSilenceProgress(Math.max(0, Math.round((countdown / 1300) * 100)))
            }, 50)

            silenceTimerRef.current = setTimeout(() => {
              if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)
              setSilenceProgress(0)

              if (autoSolveEnabled && cleanFinal.length > 8) {
                solveInterviewQuestion(cleanFinal)
              }
            }, 1300)
          }
        }

        recognition.onerror = (e: any) => {
          console.warn('[SpeechRecognition] error:', e.error)
        }

        recognition.onend = () => {
          if (micStreamRef.current || loopbackStreamRef.current) {
            try {
              recognition.start()
            } catch {}
          }
        }

        recognition.start()
        recognitionRef.current = recognition
      }

      setIsAudioConnected(true)
    } catch (err: any) {
      console.error('[InterviewCopilot] Audio connect error:', err)
      alert(`Could not access audio device: ${err?.message || String(err)}`)
    }
  }

  // 5. WinRT OCR Problem Analysis Trigger
  const handleTriggerWinRtOcr = async () => {
    setOcrStatus('capturing')
    try {
      // If screen stream is already connected, take frame snapshot
      if (videoRef.current && isScreenConnected) {
        const video = videoRef.current
        const offscreenCanvas = document.createElement('canvas')
        offscreenCanvas.width = video.videoWidth || 1920
        offscreenCanvas.height = video.videoHeight || 1080
        const ctx = offscreenCanvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height)
          const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.85)
          setScreenSnapshotData(dataUrl)
          setOcrStatus('analyzing')

          const query =
            liveTranscript.trim() ||
            customQuestion.trim() ||
            'Analyze problem statement and code visible on candidate screen, output optimal Big-O algorithm and solution.'

          await solveInterviewQuestion(query, dataUrl)
          setOcrStatus('done')
          setTimeout(() => setOcrStatus('idle'), 3000)
          return
        }
      }

      // If no screen stream is active, capture active display via getDisplayMedia
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      screenStreamRef.current = stream
      setIsScreenConnected(true)

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        setHasLoopbackAudio(true)
        loopbackStreamRef.current = new MediaStream([audioTracks[0]])
        attachLoopbackToPipeline(loopbackStreamRef.current)
      }

      const tempVideo = document.createElement('video')
      tempVideo.srcObject = stream
      await tempVideo.play()

      const offscreenCanvas = document.createElement('canvas')
      offscreenCanvas.width = tempVideo.videoWidth || 1920
      offscreenCanvas.height = tempVideo.videoHeight || 1080
      const ctx = offscreenCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(tempVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height)
        const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.85)
        setScreenSnapshotData(dataUrl)
        setOcrStatus('analyzing')

        const query =
          liveTranscript.trim() ||
          customQuestion.trim() ||
          'Analyze problem statement and code visible on candidate screen, output optimal Big-O algorithm and solution.'

        await solveInterviewQuestion(query, dataUrl)
        setOcrStatus('done')
        setTimeout(() => setOcrStatus('idle'), 3000)
      }
    } catch (err: any) {
      console.warn('[InterviewCopilot] OCR capture cancelled or failed:', err)
      setOcrStatus('idle')
    }
  }

  // 6. Launch Standalone Invisible HUD Window
  const handleLaunchHud = async () => {
    setLaunchStatus('Detaching HUD...')
    try {
      if (window.electron?.ipcRenderer?.invoke) {
        const res = await window.electron.ipcRenderer.invoke('interview:launch-hud')
        if (res.success) {
          setLaunchStatus(`Running (${res.mode || 'Stealth'})`)
        } else {
          setLaunchStatus(`Error: ${res.error}`)
        }
      } else {
        setLaunchStatus('IPC Offline')
      }
    } catch (err: any) {
      setLaunchStatus(`Failed: ${err.message}`)
    }
    setTimeout(() => setLaunchStatus(null), 4000)
  }

  // 7. Smart Code & All Copy Handlers
  const handleCopyAll = () => {
    navigator.clipboard.writeText(displayedAnswer)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2000)
  }

  const handleCopyCode = () => {
    // Extract first code block or all code blocks
    const codeMatch = displayedAnswer.match(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/)
    const codeToCopy = codeMatch && codeMatch[1] ? codeMatch[1].trim() : displayedAnswer
    navigator.clipboard.writeText(codeToCopy)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  // 8. Clear State
  const handleClear = () => {
    setLiveTranscript('')
    setInterimTranscript('')
    setCustomQuestion('')
    setSilenceProgress(0)
    setDisplayedAnswer(`_Ready. Speak via loopback/mic or press WinRT OCR (Ctrl+Shift+1) to analyze problem._`)
  }

  // Filtered preset questions for active category
  const filteredQuestions = useMemo(() => {
    return PRESET_QUESTIONS.filter((q) => q.category === activeCategory)
  }, [activeCategory])

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden select-none font-sans relative">
      {/* =========================================================================
          ROW 1: CYBERPUNK TRANSLUCENT HUD (HARDWARE, STEALTH, VAD, OCR, PASSTHROUGH)
          ========================================================================= */}
      <div className="shrink-0 h-11 px-4 border-b border-emerald-500/20 bg-zinc-950/90 backdrop-blur-xl flex items-center justify-between gap-3 text-xs z-30 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
        {/* Left: Brand Identity & Stealth Cloak Status */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold tracking-wider text-[11px] uppercase">
            <RiShieldFlashLine className="text-sm" />
            <span>NEXUS COPILOT</span>
          </div>

          {/* WDA_EXCLUDEFROMCAPTURE Stealth Badge & Toggle */}
          <button
            onClick={toggleStealthCloak}
            title="Win32 WDA_EXCLUDEFROMCAPTURE: Invisible to Zoom, Teams & Discord screen share"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              isStealthCloaked
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {isStealthCloaked ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <RiShieldCheckLine className="text-xs" />
                <span>WDA_EXCLUDE: ON</span>
              </>
            ) : (
              <>
                <RiEyeOffLine className="text-xs text-zinc-500" />
                <span>WDA_EXCLUDE: OFF</span>
              </>
            )}
          </button>
        </div>

        {/* Center: Audio Loopback, Mic VAD Meter, WinRT OCR */}
        <div className="flex items-center gap-2">
          {/* Loopback Audio WASAPI Status */}
          <button
            onClick={toggleAudioConnection}
            title={
              isAudioConnected
                ? `Loopback Audio: Active (${hasLoopbackAudio ? 'WASAPI Synced' : 'Mic Stream'})`
                : 'Click to Connect Loopback Audio & Mic'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              isAudioConnected && hasLoopbackAudio
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                : isAudioConnected
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : 'bg-zinc-900/90 border-zinc-700/80 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            <RiVolumeUpLine className="text-xs" />
            <span>LOOPBACK</span>
            <div className="w-10 h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-75"
                style={{ width: `${isAudioConnected ? Math.max(hasLoopbackAudio ? pcAudioLevel : 10, 4) : 0}%` }}
              />
            </div>
          </button>

          {/* Mic VAD (Voice Activity Detection) */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider border ${
              isAudioConnected && vadActive
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : isAudioConnected
                  ? 'bg-zinc-900/90 border-emerald-500/30 text-emerald-400/70'
                  : 'bg-zinc-900/90 border-zinc-700/80 text-zinc-500'
            }`}
          >
            {isAudioConnected ? <RiMicLine className="text-xs" /> : <RiMicOffLine className="text-xs" />}
            <span>MIC VAD</span>
            <div className="w-8 h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10 flex items-center">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-75"
                style={{ width: `${isAudioConnected ? Math.max(micAudioLevel, vadActive ? 30 : 5) : 0}%` }}
              />
            </div>
            {silenceProgress > 0 && (
              <span className="text-[9px] text-cyan-300 font-bold ml-0.5">{silenceProgress}%</span>
            )}
          </div>

          {/* WinRT OCR Problem Analysis Button */}
          <button
            onClick={handleTriggerWinRtOcr}
            disabled={ocrStatus === 'analyzing' || ocrStatus === 'capturing'}
            title="WinRT OCR Screen Sentry (Shortcut: Ctrl+Shift+1)"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              ocrStatus === 'analyzing' || ocrStatus === 'capturing'
                ? 'bg-purple-500/20 border-purple-400/50 text-purple-300 animate-pulse'
                : ocrStatus === 'done'
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-purple-950/40 hover:bg-purple-900/40 border-purple-500/30 hover:border-purple-400/60 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.15)]'
            }`}
          >
            <RiScanLine className="text-xs" />
            <span>
              {ocrStatus === 'capturing'
                ? 'CAPTURING...'
                : ocrStatus === 'analyzing'
                  ? 'ANALYZING OCR...'
                  : ocrStatus === 'done'
                    ? 'OCR SOLVED'
                    : 'WINRT OCR'}
            </span>
            <span className="text-[9px] opacity-70">Ctrl+Shift+1</span>
          </button>
        </div>

        {/* Right: Passthrough Mode, Latency, Detach HUD */}
        <div className="flex items-center gap-2">
          {/* Click-Through Passthrough Mode Toggle */}
          <button
            onClick={togglePassthrough}
            title={
              isPassthrough
                ? 'Passthrough ACTIVE (Clicks pass through to IDE). Press ESC to interact.'
                : 'Enable Click-Through Passthrough (Make overlay click-transparent)'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              isPassthrough
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)] animate-pulse'
                : 'bg-zinc-900/90 border-zinc-700/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            {isPassthrough ? <RiGhostLine className="text-xs" /> : <RiCursorLine className="text-xs" />}
            <span>{isPassthrough ? 'PASSTHROUGH ON' : 'PASSTHROUGH'}</span>
          </button>

          {/* Latency Meter */}
          {latencyMs !== null && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 border border-cyan-500/30 text-cyan-300 font-mono text-[10px]">
              <RiTimeLine className="text-xs" />
              <span>{latencyMs}ms</span>
            </div>
          )}

          {/* Detach / Launch Invisible HUD */}
          <button
            onClick={handleLaunchHud}
            title="Launch standalone minimal HUD window"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold tracking-wider uppercase bg-emerald-500 text-black hover:bg-emerald-400 transition-all cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)]"
          >
            <RiExternalLinkLine className="text-xs" />
            <span>HUD</span>
          </button>
          {launchStatus && (
            <span className="text-[9px] font-mono text-emerald-400 animate-pulse">{launchStatus}</span>
          )}
        </div>
      </div>

      {/* =========================================================================
          ROW 2: CYBERPUNK TRANSLUCENT HUD (MODES, ENGINE, PROMPTS, COPY CODE, CLEAR)
          ========================================================================= */}
      <div className="shrink-0 h-11 px-4 border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl flex items-center justify-between gap-3 text-xs z-20">
        {/* Left: Mode Switchers (STAR, System Design, Coding) */}
        <div className="flex items-center gap-1.5">
          {(['Coding', 'System Design', 'STAR'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setActiveCategory(mode)
                const first = PRESET_QUESTIONS.find((q) => q.category === mode)
                if (first) {
                  setActiveQuestion(first)
                  setDisplayedAnswer(first.referenceSolution)
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                activeCategory === mode
                  ? mode === 'Coding'
                    ? 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                    : mode === 'System Design'
                      ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                      : 'bg-purple-400/15 border-purple-400/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                  : 'bg-zinc-900/60 border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              {mode === 'Coding' && <RiCodeSSlashLine className="text-xs" />}
              {mode === 'System Design' && <RiServerLine className="text-xs" />}
              {mode === 'STAR' && <RiStarLine className="text-xs" />}
              <span>{mode === 'STAR' ? 'STAR Method' : mode}</span>
            </button>
          ))}
        </div>

        {/* Center: Practice Prompts Quick Selector & Direct Input Trigger */}
        <div className="flex items-center gap-2">
          {/* Practice Prompts Drawer Dropdown */}
          <button
            onClick={() => {
              setShowPromptsDrawer(!showPromptsDrawer)
              setShowDirectInput(false)
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              showPromptsDrawer
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                : 'bg-zinc-900/80 border-white/10 text-zinc-300 hover:border-emerald-500/40 hover:text-white'
            }`}
          >
            <RiBookOpenLine className="text-xs" />
            <span>PRACTICE PROMPTS ({filteredQuestions.length})</span>
            {showPromptsDrawer ? (
              <RiArrowUpSLine className="text-xs" />
            ) : (
              <RiArrowDownSLine className="text-xs" />
            )}
          </button>

          {/* Direct Input Toggle */}
          <button
            onClick={() => {
              setShowDirectInput(!showDirectInput)
              setShowPromptsDrawer(false)
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold tracking-wider transition-all cursor-pointer border ${
              showDirectInput
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'bg-zinc-900/80 border-white/10 text-zinc-300 hover:border-cyan-500/40 hover:text-white'
            }`}
          >
            <RiTerminalBoxLine className="text-xs" />
            <span>DIRECT INPUT</span>
          </button>
        </div>

        {/* Right: AI Engine Selector, Copy Code, Copy All, Clear */}
        <div className="flex items-center gap-2">
          {/* AI Engine Selector Pill */}
          <div className="hidden md:flex items-center bg-black/70 p-0.5 rounded-lg border border-white/10 text-[9px] font-mono">
            <button
              onClick={() => setAiEngine('auto')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                aiEngine === 'auto'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Fastest: Puter.js / Gemini API Cascade"
            >
              ⚡ Auto
            </button>
            <button
              onClick={() => setAiEngine('puter')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                aiEngine === 'puter'
                  ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Puter AI Frontier Multi-Model"
            >
              🌐 Puter
            </button>
            <button
              onClick={() => setAiEngine('gemini')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                aiEngine === 'gemini'
                  ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Direct Google Gemini API"
            >
              ✨ Gemini
            </button>
            <button
              onClick={() => setAiEngine('daemon')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                aiEngine === 'daemon'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-400/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title={daemonOnline ? 'Argon Daemon Online (8090)' : 'Argon Daemon (8090)'}
            >
              🖥️ Daemon {daemonOnline ? '●' : ''}
            </button>
          </div>

          {/* Action Buttons: Copy Code */}
          <button
            onClick={handleCopyCode}
            title="Extract and copy production code block"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all cursor-pointer"
          >
            {copiedCode ? <RiCheckLine className="text-xs text-emerald-400" /> : <RiCodeSSlashLine className="text-xs" />}
            <span>{copiedCode ? 'COPIED!' : 'COPY CODE'}</span>
          </button>

          {/* Action Buttons: Copy All */}
          <button
            onClick={handleCopyAll}
            title="Copy full solution Markdown"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 transition-all cursor-pointer"
          >
            {copiedAll ? <RiCheckLine className="text-xs text-emerald-400" /> : <RiFileCopyLine className="text-xs" />}
            <span>{copiedAll ? 'COPIED!' : 'COPY ALL'}</span>
          </button>

          {/* Action Buttons: Clear */}
          <button
            onClick={handleClear}
            title="Clear transcript & reset solution"
            className="p-1.5 rounded-lg font-mono text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
          >
            <RiDeleteBinLine className="text-xs" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          PRACTICE PROMPTS COLLAPSIBLE DRAWER
          ========================================================================= */}
      {showPromptsDrawer && (
        <div className="shrink-0 bg-zinc-950/95 border-b border-emerald-500/20 p-3.5 z-20 backdrop-blur-2xl shadow-xl animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="font-mono text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <RiBookOpenLine className="text-emerald-400" />
              <span>Preset Practice Problems — {activeCategory}</span>
            </span>
            <span className="font-mono text-[10px] text-zinc-500">
              Click problem to instantly load verified solution
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto scrollbar-thin">
            {filteredQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  setActiveQuestion(q)
                  setDisplayedAnswer(q.referenceSolution)
                  setShowPromptsDrawer(false)
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  activeQuestion.id === q.id
                    ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                    : 'bg-zinc-900/60 border-white/5 text-zinc-300 hover:border-emerald-500/30 hover:bg-zinc-900'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-zinc-400 border border-white/10">
                      {q.category}
                    </span>
                    {q.expectedComplexity && (
                      <span className="font-mono text-[9px] text-emerald-400">{q.expectedComplexity}</span>
                    )}
                  </div>
                  <div className="font-bold text-xs text-zinc-100">{q.title}</div>
                  <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{q.question}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          DIRECT QUESTION INPUT DRAWER
          ========================================================================= */}
      {showDirectInput && (
        <div className="shrink-0 bg-zinc-950/95 border-b border-cyan-500/20 p-3.5 z-20 backdrop-blur-2xl shadow-xl animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <RiTerminalBoxLine className="text-cyan-400" />
              <span>Direct Problem Statement / Custom Prompt</span>
            </span>
            <span className="font-mono text-[10px] text-zinc-500">Press Ctrl+Enter to solve</span>
          </div>
          <div className="flex items-start gap-2">
            <textarea
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  if (customQuestion.trim()) {
                    solveInterviewQuestion(customQuestion.trim())
                    setShowDirectInput(false)
                  }
                }
              }}
              placeholder="Paste or type any coding problem, LeetCode problem statement, or system design prompt..."
              rows={2}
              className="flex-1 text-xs p-2.5 rounded-xl border border-white/10 bg-black/70 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-400/50 resize-none font-mono"
            />
            <button
              onClick={() => {
                if (customQuestion.trim()) {
                  solveInterviewQuestion(customQuestion.trim())
                  setShowDirectInput(false)
                }
              }}
              disabled={isStreaming || !customQuestion.trim()}
              className="px-4 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider bg-cyan-400 text-black hover:bg-cyan-300 transition-all cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            >
              <RiSendPlane2Line className="text-sm" />
              <span>{isStreaming ? 'SOLVING...' : 'SOLVE'}</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          LIVE VAD & INTERVIEW SPEECH TICKER (MICRO STRIP)
          ========================================================================= */}
      {(liveTranscript || interimTranscript || isAudioConnected) && (
        <div className="shrink-0 h-7 px-4 bg-black/60 border-b border-white/5 flex items-center justify-between gap-3 text-[11px] font-mono z-10">
          <div className="flex items-center gap-2 overflow-hidden truncate">
            <span className="text-emerald-400 flex items-center gap-1 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SPEECH:
            </span>
            {interimTranscript && (
              <span className="text-cyan-300 italic truncate">"{interimTranscript}..."</span>
            )}
            {liveTranscript && !interimTranscript && (
              <span className="text-zinc-300 truncate">{liveTranscript}</span>
            )}
            {!interimTranscript && !liveTranscript && (
              <span className="text-zinc-600 italic">Listening for interviewer questions...</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {silenceProgress > 0 && (
              <span className="text-[10px] text-cyan-400">
                Silence Pause: {silenceProgress}% (Auto-Solve)
              </span>
            )}
            <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSolveEnabled}
                onChange={(e) => setAutoSolveEnabled(e.target.checked)}
                className="accent-emerald-400 rounded h-3 w-3"
              />
              <span>VAD Auto-Solve</span>
            </label>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCROLL-SAFE STREAMING ANSWER STAGE (ZERO CLIPPING GUARANTEE)
          ========================================================================= */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 w-full overflow-y-auto px-6 py-5 pb-32 space-y-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent select-text"
      >
        {/* Answer Header Card */}
        <div className="p-4 rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span
                className={`px-2 py-0.5 rounded font-mono text-[10px] font-black uppercase tracking-wider border ${
                  activeQuestion.category === 'Coding'
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                    : activeQuestion.category === 'System Design'
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                      : 'bg-purple-500/15 border-purple-400/40 text-purple-300'
                }`}
              >
                {activeQuestion.category}
              </span>
              <h2 className="text-sm font-bold text-zinc-100">{activeQuestion.title}</h2>
              {isStreaming && (
                <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-400 animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  STREAMING ANSWER...
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{activeQuestion.question}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeQuestion.expectedComplexity && (
              <span className="px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px] text-emerald-400 font-bold">
                {activeQuestion.expectedComplexity}
              </span>
            )}
            <span className="px-2 py-1 rounded-lg bg-black/60 border border-white/10 font-mono text-[10px] text-cyan-300">
              {activeEngineBadge}
            </span>
          </div>
        </div>

        {/* Answer Body with KaTeX Math & Syntax-Highlighted Code Blocks */}
        <div className="p-6 rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-2xl shadow-2xl space-y-4 text-xs font-sans leading-relaxed text-zinc-200">
          <MarkdownMath content={displayedAnswer} />
        </div>
      </div>
    </div>
  )
}

export default InterviewCopilotView