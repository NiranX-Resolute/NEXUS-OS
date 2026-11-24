import { useSyncExternalStore } from 'react';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'executing' | 'thinking' | 'reviewing' | 'error';
  currentTask: string;
  progress: number;
  x: number;
  y: number;
  deskId: number;
  targetX?: number;
  targetY?: number;
  lastActive: string;
  tokensProcessed: number;
  avatarColor: string;
}

export interface Task {
  id: string;
  title: string;
  agentId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  completedAt?: string;
  category: 'core' | 'scholar' | 'dev' | 'security';
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  source: string;
  message: string;
}

export interface SystemTelemetry {
  cpuUsage: number;
  memoryUsage: number;
  fps: number;
  activeAgents: number;
  totalTokens: number;
  edgeLatencyMs: number;
  quantumSync: boolean;
  securityState: 'NOMINAL' | 'ELEVATED' | 'LOCKED';
  uptimeSecs: number;
}

export interface PersonaTelemetry {
  empathy_pct: number;
  humor_pct: number;
  candor_pct: number;
  verbosity_pct: number;
  warmth_prosody?: number;
  voice_id: string;
  active_preset: string;
  updated_at?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  engine: string;
  gender: string;
}

interface AgentStoreState {
  agents: Agent[];
  tasks: Task[];
  logs: SystemLog[];
  telemetry: SystemTelemetry;
  persona: PersonaTelemetry;
  availableVoices: VoiceOption[];
}

const initialAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Nexdune-Alpha',
    role: 'Autonomous Systems Architect',
    status: 'executing',
    currentTask: 'Compiling Nexus v5.0 Command Center',
    progress: 88,
    x: 120,
    y: 140,
    deskId: 1,
    lastActive: 'Just now',
    tokensProcessed: 142500,
    avatarColor: '#38BDF8',
  },
  {
    id: 'agent-2',
    name: 'Scholar-Orion',
    role: 'Deep Research & Literature Mining',
    status: 'thinking',
    currentTask: 'Synthesizing arXiv:2603.1104 multi-agent graphs',
    progress: 64,
    x: 320,
    y: 140,
    deskId: 2,
    lastActive: '12s ago',
    tokensProcessed: 98200,
    avatarColor: '#10B981',
  },
  {
    id: 'agent-3',
    name: 'NexKoder-Prime',
    role: 'Production Synthesizer & Diff Reviewer',
    status: 'reviewing',
    currentTask: 'Auditing Three.js particle shader boundaries',
    progress: 95,
    x: 520,
    y: 140,
    deskId: 3,
    lastActive: '4s ago',
    tokensProcessed: 231400,
    avatarColor: '#A855F7',
  },
  {
    id: 'agent-4',
    name: 'Aegis-Guard',
    role: 'Sovereign Edge Guard & DPAPI Sentry',
    status: 'idle',
    currentTask: 'Monitoring zero-subscription edge boundary',
    progress: 100,
    x: 220,
    y: 300,
    deskId: 4,
    lastActive: '2m ago',
    tokensProcessed: 43100,
    avatarColor: '#F59E0B',
  },
  {
    id: 'agent-5',
    name: 'Vector-Pulse',
    role: 'Embedding & RAG Cluster Indexer',
    status: 'executing',
    currentTask: 'Re-indexing SQLite WAL vector nodes',
    progress: 42,
    x: 420,
    y: 300,
    deskId: 5,
    lastActive: '1s ago',
    tokensProcessed: 189000,
    avatarColor: '#EC4899',
  },
];

const initialTasks: Task[] = [];
const initialLogs: SystemLog[] = [];

const initialTelemetry: SystemTelemetry = {
  cpuUsage: 0.0,
  memoryUsage: 0,
  fps: 60,
  activeAgents: 4,
  totalTokens: 0,
  edgeLatencyMs: 12,
  quantumSync: true,
  securityState: 'NOMINAL',
  uptimeSecs: 0,
};

const initialPersona: PersonaTelemetry = {
  empathy_pct: 80,
  humor_pct: 45,
  candor_pct: 85,
  verbosity_pct: 45,
  warmth_prosody: 1.0,
  voice_id: 'af_heart',
  active_preset: 'CARING_COMPANION',
};

const initialVoices: VoiceOption[] = [
  { id: 'af_heart', name: 'Kokoro Heart (Warm)', engine: 'kokoro', gender: 'female' },
  { id: 'af_bella', name: 'Kokoro Bella (Expressive)', engine: 'kokoro', gender: 'female' },
  { id: 'am_adam', name: 'Kokoro Adam (Crisp)', engine: 'kokoro', gender: 'male' },
  { id: 'en-IN-NeerjaNeural', name: 'Neerja (Indian English)', engine: 'edge-tts', gender: 'female' },
  { id: 'hi-IN-SwaraNeural', name: 'Swara (Hindi / Hinglish)', engine: 'edge-tts', gender: 'female' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (TARS Tactical)', engine: 'edge-tts', gender: 'male' },
];

let currentState: AgentStoreState = {
  agents: initialAgents,
  tasks: initialTasks,
  logs: initialLogs,
  telemetry: initialTelemetry,
  persona: initialPersona,
  availableVoices: initialVoices,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export const agentStore = {
  getState(): AgentStoreState {
    return currentState;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  updateAgent(id: string, updates: Partial<Agent>) {
    currentState = {
      ...currentState,
      agents: currentState.agents.map((ag) => (ag.id === id ? { ...ag, ...updates } : ag)),
    };
    notify();
  },

  updateAgentPosition(id: string, x: number, y: number) {
    currentState = {
      ...currentState,
      agents: currentState.agents.map((ag) => (ag.id === id ? { ...ag, x, y } : ag)),
    };
    notify();
  },

  addTask(task: Omit<Task, 'id' | 'createdAt'>) {
    const newTask: Task = {
      ...task,
      id: `task-${Date.now()}`,
      createdAt: new Date().toLocaleTimeString(),
    };
    currentState = {
      ...currentState,
      tasks: [newTask, ...currentState.tasks],
    };
    notify();
  },

  updateTaskStatus(id: string, status: Task['status']) {
    currentState = {
      ...currentState,
      tasks: currentState.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              completedAt: status === 'completed' ? new Date().toLocaleTimeString() : t.completedAt,
            }
          : t
      ),
    };
    notify();
  },

  addLog(log: Omit<SystemLog, 'id' | 'timestamp'>) {
    const newLog: SystemLog = {
      ...log,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
    };
    currentState = {
      ...currentState,
      logs: [newLog, ...currentState.logs.slice(0, 99)],
    };
    notify();
  },

  async syncWithBackend() {
    try {
      // 1. Live Win32 Telemetry
      const resTel = await fetch('http://127.0.0.1:47630/api/telemetry');
      if (resTel.ok) {
        const data = await resTel.json();
        if (data && data.telemetry) {
          this.updateTelemetry({
            cpuUsage: data.telemetry.cpuUsage ?? currentState.telemetry.cpuUsage,
            memoryUsage: Math.round(data.telemetry.memoryUsage ?? currentState.telemetry.memoryUsage),
            uptimeSecs: Math.round(data.telemetry.uptimeSecs ?? currentState.telemetry.uptimeSecs),
            activeAgents: data.telemetry.activeAgents ?? currentState.telemetry.activeAgents,
            securityState: data.telemetry.securityState ?? currentState.telemetry.securityState,
          });
        }
      }
    } catch {
      // Backend polling error: keep last telemetry
    }

    try {
      // 2. Live Tasks from SQLite WAL
      const resTasks = await fetch('http://127.0.0.1:47630/api/tasks?limit=50');
      if (resTasks.ok) {
        const data = await resTasks.json();
        if (data && Array.isArray(data.tasks)) {
          const loadedTasks: Task[] = data.tasks.map((r: any) => ({
            id: r.id,
            title: r.prompt_raw || r.action_plan || 'Autonomous Task',
            agentId: 'agent-1',
            status: (
              r.status?.toLowerCase() === 'completed'
                ? 'completed'
                : r.status?.toLowerCase() === 'in_progress'
                ? 'in_progress'
                : r.status?.toLowerCase() === 'failed'
                ? 'failed'
                : 'queued'
            ) as Task['status'],
            priority: (r.command_type === 'SECURITY' ? 'critical' : 'high') as Task['priority'],
            createdAt: r.created_at || new Date().toISOString(),
            completedAt: r.completed_at,
            category: (
              ['core', 'scholar', 'dev', 'security'].includes(r.command_type?.toLowerCase())
                ? r.command_type.toLowerCase()
                : 'core'
            ) as Task['category'],
          }));
          currentState = {
            ...currentState,
            tasks: loadedTasks,
          };
          notify();
        }
      }
    } catch {
      // Tasks endpoint currently unreachable
    }

    try {
      // 3. Live Telemetry Logs from SQLite WAL
      const resLogs = await fetch('http://127.0.0.1:47630/api/telemetry/logs?limit=50');
      if (resLogs.ok) {
        const data = await resLogs.json();
        if (data && Array.isArray(data.logs)) {
          const loadedLogs: SystemLog[] = data.logs.map((r: any) => {
            const lvl = (r.level || 'info').toLowerCase();
            const validLevel: SystemLog['level'] =
              lvl === 'warn' || lvl === 'warning'
                ? 'warn'
                : lvl === 'error' || lvl === 'critical'
                ? 'error'
                : lvl === 'success'
                ? 'success'
                : lvl === 'debug'
                ? 'debug'
                : 'info';

            const timeStr = r.created_at
              ? new Date(r.created_at).toLocaleTimeString()
              : new Date().toLocaleTimeString();

            return {
              id: String(r.id),
              timestamp: timeStr,
              level: validLevel,
              source: r.source || 'NexusCore',
              message: r.message + (r.latency_ms ? ` (${r.latency_ms}ms)` : ''),
            };
          });
          currentState = {
            ...currentState,
            logs: loadedLogs,
          };
          notify();
        }
      }
    } catch {
      // Telemetry logs endpoint currently unreachable
    }

    try {
      // 4. Live Persona & Emotional Telemetry from SQLite WAL
      const resPersona = await fetch('http://127.0.0.1:47630/api/persona');
      if (resPersona.ok) {
        const data = await resPersona.json();
        if (data && data.persona) {
          currentState = {
            ...currentState,
            persona: {
              empathy_pct: data.persona.empathy_pct ?? currentState.persona.empathy_pct,
              humor_pct: data.persona.humor_pct ?? currentState.persona.humor_pct,
              candor_pct: data.persona.candor_pct ?? currentState.persona.candor_pct,
              verbosity_pct: data.persona.verbosity_pct ?? currentState.persona.verbosity_pct,
              warmth_prosody: data.persona.warmth_prosody ?? currentState.persona.warmth_prosody,
              voice_id: data.persona.voice_id ?? currentState.persona.voice_id,
              active_preset: data.persona.active_preset ?? currentState.persona.active_preset,
              updated_at: data.persona.updated_at,
            },
            availableVoices: Array.isArray(data.available_voices)
              ? data.available_voices
              : currentState.availableVoices,
          };
          notify();
        }
      }
    } catch {
      // Persona endpoint currently unreachable
    }
  },

  async updatePersona(updates: Partial<PersonaTelemetry>) {
    // Optimistic local update
    currentState = {
      ...currentState,
      persona: {
        ...currentState.persona,
        ...updates,
      },
    };
    notify();

    try {
      const res = await fetch('http://127.0.0.1:47630/api/persona', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.persona) {
          currentState = {
            ...currentState,
            persona: {
              ...currentState.persona,
              ...data.persona,
            },
          };
          notify();
        }
      }
    } catch {
      // Offline fallback: optimistic state remains
    }
  },

  async applyPreset(presetName: string) {
    const presets: Record<string, Partial<PersonaTelemetry>> = {
      CARING_COMPANION: { empathy_pct: 88, humor_pct: 45, candor_pct: 80, verbosity_pct: 50, active_preset: 'CARING_COMPANION' },
      TARS_TACTICAL: { empathy_pct: 35, humor_pct: 75, candor_pct: 95, verbosity_pct: 30, active_preset: 'TARS_TACTICAL' },
      LATE_NIGHT_CARE: { empathy_pct: 95, humor_pct: 30, candor_pct: 75, verbosity_pct: 40, active_preset: 'LATE_NIGHT_CARE' },
      DEBUG_SURGEON: { empathy_pct: 25, humor_pct: 15, candor_pct: 100, verbosity_pct: 25, active_preset: 'DEBUG_SURGEON' },
    };

    const target = presets[presetName] || { active_preset: presetName };
    await this.updatePersona(target);
  },

  async previewPersona(sampleText?: string): Promise<{ success: boolean; preview_text?: string }> {
    try {
      const res = await fetch('http://127.0.0.1:47630/api/persona/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sampleText || '' }),
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, preview_text: data.preview_text };
      }
    } catch {
      // preview endpoint unreachable
    }
    return { success: false };
  },

  async submitTaskToBackend(title: string, category: Task['category'] = 'core') {
    try {
      const res = await fetch('http://127.0.0.1:47630/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: title, command_type: category.toUpperCase() }),
      });
      if (res.ok) {
        await this.syncWithBackend();
        return;
      }
    } catch {
      // Offline fallback: keep optimistic local task
    }
    this.addTask({
      title,
      agentId: 'agent-1',
      status: 'queued',
      priority: 'high',
      category,
    });
  },

  updateTelemetry(updates: Partial<SystemTelemetry>) {
    currentState = {
      ...currentState,
      telemetry: {
        ...currentState.telemetry,
        ...updates,
      },
    };
    notify();
  },
};

export function useAgentStore(): AgentStoreState {
  return useSyncExternalStore(agentStore.subscribe, agentStore.getState);
}

if ((import.meta as any).env?.DEV) {
  // @ts-ignore - Dev-only Reticle store registration
  import('@reticlehq/browser')
    .then((m: any) => {
      m.registerStore?.('agentStore', useAgentStore);
    })
    .catch(() => {
      // Dev-only Reticle instrumentation fallback
    });
}
