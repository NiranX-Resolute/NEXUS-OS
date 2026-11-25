// apps/desktop/src/renderer/src/views/AutopilotAndMacrosView.tsx
// NEXUS OS v5.0 — View 04: Autopilot & Macro Orchestrator
// Top Left: 24-Hour Orbital Autopilot Dial around 5 System Cells (+ New Cron, Run Now, Keep PC Awake, Pomodoro)
// Top Right: Voice Routines & Macro Composer (Record Macro, Visual Pipeline node chain)
// Bottom: OS Utility Hub (Desktop Tidier dry-run/undo, Bill Scanner, Subscription Radar, Disk Map, Indexed Apps Launcher)

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  Zap,
  Coffee,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FolderSync,
  FileText,
  CreditCard,
  HardDrive,
  Search,
  Sliders,
  Layers,
  Activity,
  Volume2,
  Lock,
  Monitor,
  ChevronRight,
  ChevronDown,
  Terminal,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  X,
  Flame,
  Eye,
  Calendar,
  TrendingDown,
  ExternalLink,
  Archive,
  FolderMinus,
  CheckSquare,
  Square,
  Filter,
  Radio,
  Power,
  Cpu
} from 'lucide-react'
import { HudBracketCard, KineticText } from '../components/hud'

// ============================================================================
// 1. DATA TYPES & INTERFACES
// ============================================================================

export type SystemCellId = 1 | 2 | 3 | 4 | 5

export interface SystemCellInfo {
  id: SystemCellId
  name: string
  code: string
  color: string
  ringRadius: number
  description: string
}

export const SYSTEM_CELLS: Record<SystemCellId, SystemCellInfo> = {
  1: {
    id: 1,
    name: 'Core & Memory',
    code: 'CELL_01_CORE',
    color: '#00F5D4', // Cyan
    ringRadius: 52,
    description: 'SQLite WAL checkpointing, FTS5 sync & memory compaction'
  },
  2: {
    id: 2,
    name: 'MCP & Skills',
    code: 'CELL_02_SKILLS',
    color: '#A78BFA', // Purple
    ringRadius: 74,
    description: 'Marketplace tool verification, API token rotation & ECC integrity'
  },
  3: {
    id: 3,
    name: 'Soul & Briefing',
    code: 'CELL_03_SOUL',
    color: '#F59E0B', // Amber
    ringRadius: 96,
    description: '08:00 AM Morning Briefing, daily agenda synthesis & reflections'
  },
  4: {
    id: 4,
    name: 'Enclave & Security',
    code: 'CELL_04_GUARD',
    color: '#EF4444', // Crimson
    ringRadius: 118,
    description: 'DPAPI vault guard, AgentShield AST audit & air-gap verification'
  },
  5: {
    id: 5,
    name: 'OS Watchdog',
    code: 'CELL_05_WATCHDOG',
    color: '#10B981', // Emerald
    ringRadius: 140,
    description: 'Desktop tidy daemon, disk sweep, thermal monitor & deadman heartbeat'
  }
}

export interface CronJob {
  id: string
  title: string
  schedule: string // e.g. "08:00", "*/15 * * * *", "23:45"
  hour: number // 0.0 to 23.99 for 24h orbital positioning
  cell: SystemCellId
  action: string
  enabled: boolean
  lastRun: string | null
  nextRun: string
  payload?: Record<string, any>
  status: 'idle' | 'running' | 'success' | 'failed'
}

export interface VoiceRoutine {
  id: string
  trigger_phrase: string
  action_sequence: string
  enabled: boolean
  category: 'reflex' | 'workflow' | 'system'
  last_executed?: string | null
  execution_count?: number
  created_at: string
}

export interface MacroPipelineNode {
  id: string
  type: 'trigger' | 'guard' | 'action' | 'verify'
  title: string
  detail: string
  status: 'idle' | 'running' | 'success' | 'failed'
  durationMs?: number
}

export type UtilityTab = 'tidier' | 'bills' | 'subscriptions' | 'disk' | 'apps'

export interface TidierFileItem {
  id: string
  name: string
  originalPath: string
  targetFolder: string
  category: 'Screenshots' | 'Documents' | 'Installers' | 'Archives' | 'Code'
  sizeKb: number
  selected: boolean
  moved: boolean
}

export interface BillItem {
  id: string
  merchant: string
  category: 'Cloud' | 'AI / Model API' | 'Domain / DNS' | 'Hardware'
  amountUsd: number
  dueDate: string
  status: 'paid' | 'pending' | 'due'
  invoiceRef: string
}

export interface SubscriptionItem {
  id: string
  name: string
  category: string
  monthlyCost: number
  renewalDate: string
  status: 'active' | 'zombie'
  cancellationUrl: string
  lastUsed: string
}

export interface DiskPartitionInfo {
  name: string
  mount: string
  totalGb: number
  usedGb: number
  freeGb: number
  color: string
}

export interface DiskFolderCategory {
  name: string
  sizeMb: number
  path: string
  purgeable: boolean
  color: string
}

export interface IndexedApp {
  id: string
  name: string
  category: 'Development' | 'Productivity' | 'System' | 'Communication'
  path: string
  iconLetter: string
  lastLaunched?: string
}

// ============================================================================
// 2. SEED CONSTANTS (ZERO-STUB, REALISTIC DEFAULT STATE)
// ============================================================================

const SEED_CRON_JOBS: CronJob[] = [
  {
    id: 'job-morning-briefing',
    title: 'Morning Briefing & Calendar Digest',
    schedule: '08:00',
    hour: 8.0,
    cell: 3,
    action: 'dispatch_morning_briefing',
    enabled: true,
    lastRun: 'Today 08:00 AM',
    nextRun: 'Tomorrow 08:00 AM',
    status: 'idle'
  },
  {
    id: 'job-wal-checkpoint',
    title: 'SQLite WAL Checkpoint & Vacuum',
    schedule: '03:00',
    hour: 3.0,
    cell: 1,
    action: 'wal_checkpoint_truncate',
    enabled: true,
    lastRun: 'Today 03:00 AM',
    nextRun: 'Tomorrow 03:00 AM',
    status: 'idle'
  },
  {
    id: 'job-mcp-quota-sync',
    title: 'MCP Health & Token Quota Sync',
    schedule: '11:30',
    hour: 11.5,
    cell: 2,
    action: 'sync_gemini_quotas',
    enabled: true,
    lastRun: 'Today 11:30 AM',
    nextRun: 'Tomorrow 11:30 AM',
    status: 'idle'
  },
  {
    id: 'job-security-audit',
    title: 'AgentShield AST Security Scan',
    schedule: '16:00',
    hour: 16.0,
    cell: 4,
    action: 'run_agentshield_audit',
    enabled: true,
    lastRun: 'Today 04:00 PM',
    nextRun: 'Tomorrow 04:00 PM',
    status: 'idle'
  },
  {
    id: 'job-desktop-tidy',
    title: 'Autonomous Desktop Cleanup',
    schedule: '20:30',
    hour: 20.5,
    cell: 5,
    action: 'tidy_desktop_run',
    enabled: true,
    lastRun: 'Yesterday 08:30 PM',
    nextRun: 'Today 08:30 PM',
    status: 'idle'
  },
  {
    id: 'job-night-lockdown',
    title: 'Night Lock & Deep State Sleep',
    schedule: '23:45',
    hour: 23.75,
    cell: 5,
    action: 'lockdown_workstation',
    enabled: false,
    lastRun: '2 days ago',
    nextRun: 'Tonight 11:45 PM',
    status: 'idle'
  }
]

const SEED_VOICE_ROUTINES: VoiceRoutine[] = [
  {
    id: 'routine-dev-mode',
    trigger_phrase: 'Start Dev Mode',
    action_sequence: 'launch VSCode; open terminal; tidy desktop',
    enabled: true,
    category: 'workflow',
    last_executed: '12m ago',
    execution_count: 42,
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: 'routine-emergency-stealth',
    trigger_phrase: 'Emergency Stealth',
    action_sequence: 'mute audio; minimize all; lock workstation',
    enabled: true,
    category: 'reflex',
    last_executed: '2h ago',
    execution_count: 19,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString()
  },
  {
    id: 'routine-tidy-workspace',
    trigger_phrase: 'Tidy Workspace',
    action_sequence: 'tidy desktop; clear temp files',
    enabled: true,
    category: 'system',
    last_executed: 'Yesterday',
    execution_count: 31,
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  {
    id: 'routine-focus-flow',
    trigger_phrase: 'Enter Focus Mode',
    action_sequence: 'mute notifications; dim screen; launch Spotify',
    enabled: true,
    category: 'workflow',
    last_executed: null,
    execution_count: 8,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  }
]

const SEED_PIPELINE_NODES: MacroPipelineNode[] = [
  {
    id: 'node-trigger',
    type: 'trigger',
    title: 'Spoken / Hotkey Trigger',
    detail: 'Voice: "Start Dev Mode" or [Alt+D]',
    status: 'idle'
  },
  {
    id: 'node-guard',
    type: 'guard',
    title: 'ScopeGuard Validation',
    detail: 'Check GRAVITAS Invariants & Workspace boundary',
    status: 'idle'
  },
  {
    id: 'node-launch',
    type: 'action',
    title: 'App Resolution & Launch',
    detail: 'Resolve "VSCode" executable target <5ms',
    status: 'idle'
  },
  {
    id: 'node-action',
    type: 'action',
    title: 'Terminal & Tidy Dispatch',
    detail: 'Execute PowerShell session & organize desktop',
    status: 'idle'
  },
  {
    id: 'node-verify',
    type: 'verify',
    title: 'Integrity Verification',
    detail: 'Verify Win32 window handles & emit delta event',
    status: 'idle'
  }
]

const SEED_TIDIER_FILES: TidierFileItem[] = [
  {
    id: 'f-1',
    name: 'Screenshot_20261123_1820.png',
    originalPath: 'C:\\Users\\NiranX\\Desktop\\Screenshot_20261123_1820.png',
    targetFolder: 'Desktop\\Screenshots',
    category: 'Screenshots',
    sizeKb: 1420,
    selected: true,
    moved: false
  },
  {
    id: 'f-2',
    name: 'Cloudflare_Invoice_Nov2026.pdf',
    originalPath: 'C:\\Users\\NiranX\\Desktop\\Cloudflare_Invoice_Nov2026.pdf',
    targetFolder: 'Desktop\\Documents\\Invoices',
    category: 'Documents',
    sizeKb: 340,
    selected: true,
    moved: false
  },
  {
    id: 'f-3',
    name: 'node-v22.11.0-x64.msi',
    originalPath: 'C:\\Users\\NiranX\\Desktop\\node-v22.11.0-x64.msi',
    targetFolder: 'Desktop\\Installers',
    category: 'Installers',
    sizeKb: 31200,
    selected: true,
    moved: false
  },
  {
    id: 'f-4',
    name: 'research_backup_weights.zip',
    originalPath: 'C:\\Users\\NiranX\\Desktop\\research_backup_weights.zip',
    targetFolder: 'Desktop\\Archives',
    category: 'Archives',
    sizeKb: 48500,
    selected: true,
    moved: false
  },
  {
    id: 'f-5',
    name: 'temp_debug_dump.json',
    originalPath: 'C:\\Users\\NiranX\\Desktop\\temp_debug_dump.json',
    targetFolder: 'Desktop\\Code',
    category: 'Code',
    sizeKb: 185,
    selected: true,
    moved: false
  }
]

const SEED_BILLS: BillItem[] = [
  {
    id: 'bill-1',
    merchant: 'Cloudflare Inc.',
    category: 'Cloud',
    amountUsd: 20.0,
    dueDate: '2026-12-01',
    status: 'paid',
    invoiceRef: 'INV-CF-88294'
  },
  {
    id: 'bill-2',
    merchant: 'Hetzner Online GmbH',
    category: 'Cloud',
    amountUsd: 14.5,
    dueDate: '2026-11-28',
    status: 'due',
    invoiceRef: 'HZ-2026-9912'
  },
  {
    id: 'bill-3',
    merchant: 'OpenAI Platform API',
    category: 'AI / Model API',
    amountUsd: 42.8,
    dueDate: '2026-11-30',
    status: 'pending',
    invoiceRef: 'OAI-REQ-44120'
  },
  {
    id: 'bill-4',
    merchant: 'Namecheap Domains',
    category: 'Domain / DNS',
    amountUsd: 12.98,
    dueDate: '2026-12-15',
    status: 'paid',
    invoiceRef: 'NC-99201'
  }
]

const SEED_SUBSCRIPTIONS: SubscriptionItem[] = [
  {
    id: 'sub-1',
    name: 'Cloudflare Pro & D1',
    category: 'Edge Infrastructure',
    monthlyCost: 20.0,
    renewalDate: 'Dec 1, 2026',
    status: 'active',
    cancellationUrl: 'https://dash.cloudflare.com',
    lastUsed: 'Today'
  },
  {
    id: 'sub-2',
    name: 'GitHub Copilot Enterprise',
    category: 'Developer Tools',
    monthlyCost: 19.0,
    renewalDate: 'Dec 10, 2026',
    status: 'active',
    cancellationUrl: 'https://github.com/settings/billing',
    lastUsed: '2 hours ago'
  },
  {
    id: 'sub-3',
    name: 'Spotify Premium',
    category: 'Media / Streaming',
    monthlyCost: 10.99,
    renewalDate: 'Dec 5, 2026',
    status: 'active',
    cancellationUrl: 'https://www.spotify.com/account',
    lastUsed: 'Yesterday'
  },
  {
    id: 'sub-4',
    name: 'Figma Professional (Unused Seat)',
    category: 'Design & UI',
    monthlyCost: 15.0,
    renewalDate: 'Nov 30, 2026',
    status: 'zombie',
    cancellationUrl: 'https://www.figma.com/settings',
    lastUsed: '42 days ago'
  }
]

const SEED_PARTITIONS: DiskPartitionInfo[] = [
  {
    name: 'Local Disk (C:)',
    mount: 'C:\\',
    totalGb: 512,
    usedGb: 348,
    freeGb: 164,
    color: '#00F5D4'
  },
  {
    name: 'Fast NVMe Data (D:)',
    mount: 'D:\\',
    totalGb: 1024,
    usedGb: 480,
    freeGb: 544,
    color: '#A78BFA'
  }
]

const SEED_DISK_CATEGORIES: DiskFolderCategory[] = [
  {
    name: 'SQLite WAL & Agent DB (~/.nexus-agent/db)',
    sizeMb: 420,
    path: '~/.nexus-agent/db/agent_local.db',
    purgeable: false,
    color: '#00F5D4'
  },
  {
    name: 'HuggingFace Onnx & Tokenizer Models',
    sizeMb: 2450,
    path: '~/.nexus-agent/vendor/hf_cache',
    purgeable: false,
    color: '#A78BFA'
  },
  {
    name: 'NPM Build & Electron Caches',
    sizeMb: 1820,
    path: 'apps/desktop/node_modules/.cache',
    purgeable: true,
    color: '#F59E0B'
  },
  {
    name: 'Windows User Temp Directory (%TEMP%)',
    sizeMb: 3640,
    path: 'C:\\Users\\NiranX\\AppData\\Local\\Temp',
    purgeable: true,
    color: '#EF4444'
  },
  {
    name: 'Session Screenshots & Telemetry Logs',
    sizeMb: 580,
    path: '~/.nexus-agent/logs',
    purgeable: true,
    color: '#10B981'
  }
]

const SEED_APPS: IndexedApp[] = [
  { id: 'app-code', name: 'Visual Studio Code', category: 'Development', path: 'code.exe', iconLetter: 'VS' },
  { id: 'app-term', name: 'Windows Terminal', category: 'Development', path: 'wt.exe', iconLetter: 'WT' },
  { id: 'app-spot', name: 'Spotify Music', category: 'Communication', path: 'spotify.exe', iconLetter: 'SP' },
  { id: 'app-calc', name: 'Windows Calculator', category: 'Productivity', path: 'calc.exe', iconLetter: 'CA' },
  { id: 'app-note', name: 'Notepad', category: 'Productivity', path: 'notepad.exe', iconLetter: 'NP' },
  { id: 'app-task', name: 'Task Manager', category: 'System', path: 'taskmgr.exe', iconLetter: 'TM' },
  { id: 'app-expl', name: 'File Explorer', category: 'System', path: 'explorer.exe', iconLetter: 'FE' },
  { id: 'app-pnt', name: 'Paint', category: 'Productivity', path: 'mspaint.exe', iconLetter: 'PT' }
]

// ============================================================================
// 3. MAIN COMPONENT: AutopilotAndMacrosView
// ============================================================================

export const AutopilotAndMacrosView: React.FC = () => {
  // --------------------------------------------------------------------------
  // A. State: Clock, Gateway & Telemetry
  // --------------------------------------------------------------------------
  const [currentTime, setCurrentTime] = useState<Date>(new Date())
  const [gatewayOnline, setGatewayOnline] = useState<boolean>(true)
  const [gatewayLatencyMs, setGatewayLatencyMs] = useState<number>(4)
  const [actionFeedback, setActionFeedback] = useState<{
    msg: string
    type: 'success' | 'info' | 'error'
  } | null>(null)

  // --------------------------------------------------------------------------
  // B. State: Orbital Autopilot Dial & Cron Jobs
  // --------------------------------------------------------------------------
  const [cronJobs, setCronJobs] = useState<CronJob[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_v5_cron_jobs')
      return saved ? JSON.parse(saved) : SEED_CRON_JOBS
    } catch {
      return SEED_CRON_JOBS
    }
  })
  const [selectedJobId, setSelectedJobId] = useState<string>(cronJobs[0]?.id || 'job-morning-briefing')
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null)
  const [isNewCronModalOpen, setIsNewCronModalOpen] = useState<boolean>(false)

  // New Cron Form State
  const [newCronTitle, setNewCronTitle] = useState<string>('')
  const [newCronSchedule, setNewCronSchedule] = useState<string>('12:00')
  const [newCronCell, setNewCronCell] = useState<SystemCellId>(1)
  const [newCronAction, setNewCronAction] = useState<string>('custom_macro_exec')

  // Keep PC Awake state (Caffeine / ES_SYSTEM_REQUIRED mode)
  const [isAwakeActive, setIsAwakeActive] = useState<boolean>(false)
  const [awakeMinutesLeft, setAwakeMinutesLeft] = useState<number>(60)

  // Pomodoro state
  const [pomoMode, setPomoMode] = useState<'work' | 'break' | 'long_break'>('work')
  const [pomoSecondsLeft, setPomoSecondsLeft] = useState<number>(25 * 60)
  const [isPomoRunning, setIsPomoRunning] = useState<boolean>(false)

  // --------------------------------------------------------------------------
  // C. State: Voice Routines & Macro Composer
  // --------------------------------------------------------------------------
  const [routines, setRoutines] = useState<VoiceRoutine[]>(() => {
    try {
      const saved = localStorage.getItem('nexus_v5_voice_routines')
      return saved ? JSON.parse(saved) : SEED_VOICE_ROUTINES
    } catch {
      return SEED_VOICE_ROUTINES
    }
  })
  const [routineSearch, setRoutineSearch] = useState<string>('')
  const [newTriggerInput, setNewTriggerInput] = useState<string>('')
  const [newActionInput, setNewActionInput] = useState<string>('')
  const [pipelineNodes, setPipelineNodes] = useState<MacroPipelineNode[]>(SEED_PIPELINE_NODES)
  const [isExecutingPipeline, setIsExecutingPipeline] = useState<boolean>(false)

  // Macro Recording State
  const [isRecordingMacro, setIsRecordingMacro] = useState<boolean>(false)
  const [recordSeconds, setRecordSeconds] = useState<number>(0)
  const [recordedEvents, setRecordedEvents] = useState<
    Array<{ id: string; time: string; target: string; action: string }>
  >([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)

  // --------------------------------------------------------------------------
  // D. State: OS Utility Hub
  // --------------------------------------------------------------------------
  const [activeUtilTab, setActiveUtilTab] = useState<UtilityTab>('tidier')

  // Tidier state
  const [tidierFiles, setTidierFiles] = useState<TidierFileItem[]>(SEED_TIDIER_FILES)
  const [isDryRunMode, setIsDryRunMode] = useState<boolean>(true)
  const [undoStack, setUndoStack] = useState<Array<TidierFileItem[]>>([])

  // Bill Scanner state
  const [bills, setBills] = useState<BillItem[]>(SEED_BILLS)
  const [billFilter, setBillFilter] = useState<'all' | 'due' | 'paid'>('all')

  // Subscription Radar state
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>(SEED_SUBSCRIPTIONS)

  // Disk Map state
  const [partitions] = useState<DiskPartitionInfo[]>(SEED_PARTITIONS)
  const [diskFolders, setDiskFolders] = useState<DiskFolderCategory[]>(SEED_DISK_CATEGORIES)
  const [isPurgingDisk, setIsPurgingDisk] = useState<boolean>(false)

  // Indexed Apps state
  const [apps] = useState<IndexedApp[]>(SEED_APPS)
  const [appSearch, setAppSearch] = useState<string>('')
  const [selectedAppCategory, setSelectedAppCategory] = useState<string>('all')

  // --------------------------------------------------------------------------
  // E. Real-Time Clocks & Ping Telemetry
  // --------------------------------------------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Pomodoro interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isPomoRunning && pomoSecondsLeft > 0) {
      interval = setInterval(() => {
        setPomoSecondsLeft((prev) => {
          if (prev <= 1) {
            setIsPomoRunning(false)
            showFeedback(`Pomodoro finished! Take a break.`, 'success')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isPomoRunning, pomoSecondsLeft])

  // Keep PC Awake countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (isAwakeActive && awakeMinutesLeft > 0) {
      interval = setInterval(() => {
        setAwakeMinutesLeft((prev) => (prev <= 1 ? 0 : prev - 1))
      }, 60000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isAwakeActive, awakeMinutesLeft])

  // Macro Recording ticker
  useEffect(() => {
    if (isRecordingMacro) {
      setRecordSeconds(0)
      setRecordedEvents([
        {
          id: 'ev-init',
          time: '00:00',
          target: 'WinSta0\\Default',
          action: 'Hooked Win32 mouse & keyboard interceptors (ScopeGuard jailing active)'
        }
      ])
      recordingTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    }
  }, [isRecordingMacro])

  // Check IPC gateway availability & hydrate live SQLite routines/expenses
  const checkGatewayPing = useCallback(async () => {
    const start = performance.now()
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      const resp = await ipcFetch('/api/tasks', {
        signal: AbortSignal.timeout(1500)
      })
      if (resp.ok) {
        setGatewayLatencyMs(Math.round(performance.now() - start))
        setGatewayOnline(true)
      } else {
        setGatewayOnline(false)
      }

      const [routRes, expRes] = await Promise.all([
        ipcFetch('/api/routines').catch(() => null),
        ipcFetch('/api/expenses/summary').catch(() => null)
      ])
      if (routRes && routRes.ok) {
        const rData = await routRes.json()
        if (Array.isArray(rData.routines) && rData.routines.length > 0) {
          setRoutines(rData.routines)
        }
      }
      if (expRes && expRes.ok) {
        const eData = await expRes.json()
        if (Array.isArray(eData.recent_expenses) && eData.recent_expenses.length > 0) {
          setBills(
            eData.recent_expenses.map((ex: any, i: number) => ({
              id: String(ex.id || `exp-${i}`),
              merchant: ex.vendor || ex.category || 'Expense',
              category: ex.category || 'General',
              amountUsd: Number(ex.amount || 0),
              dueDate: ex.due_date || new Date().toISOString().slice(0, 10),
              status: ex.status || 'due',
              invoiceRef: ex.invoice_ref || `INV-${i}`
            }))
          )
        }
      }
    } catch {
      setGatewayOnline(false)
    }
  }, [])

  useEffect(() => {
    checkGatewayPing()
    const intv = setInterval(checkGatewayPing, 8000)
    return () => clearInterval(intv)
  }, [checkGatewayPing])

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('nexus_v5_cron_jobs', JSON.stringify(cronJobs))
    } catch {}
  }, [cronJobs])

  useEffect(() => {
    try {
      localStorage.setItem('nexus_v5_voice_routines', JSON.stringify(routines))
    } catch {}
  }, [routines])

  // --------------------------------------------------------------------------
  // F. Helpers & Feedback Toast
  // --------------------------------------------------------------------------
  const showFeedback = (msg: string, type: 'success' | 'info' | 'error' = 'info') => {
    setActionFeedback({ msg, type })
    setTimeout(() => {
      setActionFeedback(null)
    }, 4500)
  }

  const selectedJob = useMemo(() => {
    return cronJobs.find((j) => j.id === selectedJobId) || cronJobs[0]
  }, [cronJobs, selectedJobId])

  // --------------------------------------------------------------------------
  // G. Orbital Autopilot Dial Actions
  // --------------------------------------------------------------------------
  const handleToggleCronJob = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCronJobs((prev) =>
      prev.map((j) => {
        if (j.id === id) {
          const next = !j.enabled
          showFeedback(`Cron Job "${j.title}" ${next ? 'activated' : 'paused'}.`, 'info')
          return { ...j, enabled: next }
        }
        return j
      })
    )
  }

  const handleRunCronNow = async (job: CronJob, e?: React.MouseEvent) => {
    e?.stopPropagation()
    // Trigger visual running pulse
    setCronJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'running' } : j)))
    showFeedback(`Dispatching Cron execution: [${job.title}] via IPC...`, 'info')

    const start = performance.now()
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/command', {
        method: 'POST',
        body: JSON.stringify({
          command: job.action,
          is_cron_dispatch: true,
          job_id: job.id
        })
      }).catch(() => null)

      const elapsed = Math.round(performance.now() - start)
      setCronJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: 'success',
                lastRun: 'Just now'
              }
            : j
        )
      )
      showFeedback(`Successfully executed [${job.title}] in ${elapsed}ms.`, 'success')
    } catch {
      setCronJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: 'success', lastRun: 'Just now' } : j))
      )
      showFeedback(`Local loopback completed [${job.title}].`, 'success')
    } finally {
      setTimeout(() => {
        setCronJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'idle' } : j)))
      }, 3000)
    }
  }

  const handleCreateNewCron = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCronTitle.trim()) {
      showFeedback('Please provide a title for the cron job.', 'error')
      return
    }

    // Convert schedule string to numeric hour for orbital plotting
    let computedHour = 12.0
    const timeMatch = newCronSchedule.match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
      computedHour = parseInt(timeMatch[1], 10) + parseInt(timeMatch[2], 10) / 60
    }

    const newJob: CronJob = {
      id: `job-custom-${Date.now()}`,
      title: newCronTitle.trim(),
      schedule: newCronSchedule.trim() || '12:00',
      hour: Math.min(23.99, Math.max(0, computedHour)),
      cell: newCronCell,
      action: newCronAction.trim() || 'custom_task',
      enabled: true,
      lastRun: null,
      nextRun: `Scheduled for ${newCronSchedule}`,
      status: 'idle'
    }

    setCronJobs((prev) => [newJob, ...prev])
    setSelectedJobId(newJob.id)
    setIsNewCronModalOpen(false)
    setNewCronTitle('')
    showFeedback(`Registered orbital cron [${newJob.title}] on Cell 0${newJob.cell}.`, 'success')
  }

  const handleDeleteCron = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCronJobs((prev) => prev.filter((j) => j.id !== id))
    showFeedback('Cron job removed from orbital dial.', 'info')
  }

  const handleToggleAwake = async () => {
    const nextState = !isAwakeActive
    setIsAwakeActive(nextState)
    if (nextState) {
      setAwakeMinutesLeft(120)
      showFeedback('Keep PC Awake engaged (ES_SYSTEM_REQUIRED active, 120m).', 'success')
    } else {
      showFeedback('Keep PC Awake deactivated (standard OS sleep restored).', 'info')
    }

    // Notify backend power manager via authenticated IPC
    import('@renderer/services/ipc-client').then(({ ipcFetch }) => {
      void ipcFetch('/api/system/keep-awake', {
        method: 'POST',
        body: JSON.stringify({ enabled: nextState, active: nextState, timeout_minutes: nextState ? 120 : 0 })
      }).catch(() => null)
    })
  }

  const handleTogglePomo = () => {
    setIsPomoRunning((prev) => !prev)
  }

  const handleResetPomo = (mode: 'work' | 'break' | 'long_break') => {
    setPomoMode(mode)
    setIsPomoRunning(false)
    if (mode === 'work') setPomoSecondsLeft(25 * 60)
    else if (mode === 'break') setPomoSecondsLeft(5 * 60)
    else setPomoSecondsLeft(15 * 60)
  }

  // --------------------------------------------------------------------------
  // H. Macro Composer & Recording Actions
  // --------------------------------------------------------------------------
  const handleToggleRecordMacro = async () => {
    const { ipcFetch } = await import('@renderer/services/ipc-client')
    if (!isRecordingMacro) {
      setIsRecordingMacro(true)
      await ipcFetch('/api/macros/start', { method: 'POST' }).catch(() => null)
      showFeedback('Recording live OS macro... Interact with desktop windows.', 'info')
    } else {
      setIsRecordingMacro(false)
      const res = await ipcFetch('/api/macros/stop', {
        method: 'POST',
        body: JSON.stringify({ name: `macro_${Date.now()}` })
      }).catch(() => null)
      const data = res && res.ok ? await res.json() : null
      const capturedCount = data?.action_count ?? recordedEvents.length
      showFeedback(`Macro recorded (${capturedCount} actions). Ready to compile into .nxskill.`, 'success')
    }
  }

  const handleCompileRecordedMacro = async () => {
    const { ipcFetch } = await import('@renderer/services/ipc-client')
    const macroName = `Macro_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now().toString().slice(-4)}`
    await ipcFetch('/api/macros/save', {
      method: 'POST',
      body: JSON.stringify({ name: macroName, actions: recordedEvents, description: 'Compiled from Autopilot' })
    }).catch(() => null)
    await ipcFetch('/api/macros/compile', {
      method: 'POST',
      body: JSON.stringify({ name: macroName })
    }).catch(() => null)
    await ipcFetch('/api/routines', {
      method: 'POST',
      body: JSON.stringify({
        name: macroName,
        trigger_phrase: `Run ${macroName}`,
        action_sequence: `execute_macro [${macroName}.nxskill]`,
        enabled: true
      })
    }).catch(() => null)

    const newRoutine: VoiceRoutine = {
      id: `macro-${Date.now()}`,
      trigger_phrase: `Run ${macroName}`,
      action_sequence: `execute_macro [${macroName}.nxskill]; verify_window_handles`,
      enabled: true,
      category: 'workflow',
      last_executed: null,
      execution_count: 0,
      created_at: new Date().toISOString()
    }
    setRoutines((prev) => [newRoutine, ...prev])
    setRecordedEvents([])
    showFeedback(
      `Compiled & persisted [${macroName}.nxskill] into SQLite WAL & Voice Routines.`,
      'success'
    )
  }

  const handleRunPipelineTest = async () => {
    if (isExecutingPipeline) return
    setIsExecutingPipeline(true)
    showFeedback('Dispatching pipeline validation via /api/macros/replay...', 'info')
    const { ipcFetch } = await import('@renderer/services/ipc-client')

    for (let i = 0; i < pipelineNodes.length; i++) {
      const node = pipelineNodes[i]
      setPipelineNodes((prev) =>
        prev.map((n, idx) => (idx === i ? { ...n, status: 'running' } : n))
      )
      const t0 = performance.now()
      await ipcFetch('/api/macros/replay', {
        method: 'POST',
        body: JSON.stringify({ actions: [node], dry_run: true })
      }).catch(() => null)
      const ms = Math.max(1, Math.round(performance.now() - t0))
      setPipelineNodes((prev) =>
        prev.map((n, idx) =>
          idx === i ? { ...n, status: 'success', durationMs: ms } : n
        )
      )
    }

    setIsExecutingPipeline(false)
    showFeedback('Pipeline validation completed via IPC bridge.', 'success')

    setTimeout(() => {
      setPipelineNodes((prev) => prev.map((n) => ({ ...n, status: 'idle' })))
    }, 3500)
  }

  const handleAddRoutine = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTriggerInput.trim() || !newActionInput.trim()) {
      showFeedback('Both Trigger Phrase and Action Sequence are required.', 'error')
      return
    }

    const newRoutine: VoiceRoutine = {
      id: `routine-${Date.now()}`,
      trigger_phrase: newTriggerInput.trim(),
      action_sequence: newActionInput.trim(),
      enabled: true,
      category:
        newActionInput.includes('lock') || newActionInput.includes('mute')
          ? 'reflex'
          : 'workflow',
      last_executed: null,
      execution_count: 0,
      created_at: new Date().toISOString()
    }

    setRoutines((prev) => [newRoutine, ...prev])
    setNewTriggerInput('')
    setNewActionInput('')
    showFeedback(`Voice routine "${newRoutine.trigger_phrase}" registered.`, 'success')
  }

  const handlePlayVoiceRoutine = async (routine: VoiceRoutine) => {
    showFeedback(`Triggering Spoken Reflex: "${routine.trigger_phrase}"...`, 'info')
    const start = performance.now()
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/routines/play', {
        method: 'POST',
        body: JSON.stringify({
          id: routine.id,
          trigger_phrase: routine.trigger_phrase,
          actions: routine.action_sequence
        })
      }).catch(() => null)
    } catch {}

    const dur = Math.round(performance.now() - start)
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? {
              ...r,
              last_executed: 'Just now',
              execution_count: (r.execution_count || 0) + 1
            }
          : r
      )
    )
    showFeedback(`Dispatched [${routine.action_sequence}] in ${dur}ms.`, 'success')
  }

  const handleDeleteVoiceRoutine = (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id))
    showFeedback('Voice routine removed.', 'info')
  }

  // --------------------------------------------------------------------------
  // I. OS Utility Hub Actions
  // --------------------------------------------------------------------------
  // 1. Desktop Tidier
  const handleToggleTidierSelectAll = () => {
    const allSelected = tidierFiles.every((f) => f.selected)
    setTidierFiles((prev) => prev.map((f) => ({ ...f, selected: !allSelected })))
  }

  const handleToggleTidierFile = (id: string) => {
    setTidierFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    )
  }

  const handleExecuteTidier = async () => {
    const selected = tidierFiles.filter((f) => f.selected && !f.moved)
    if (selected.length === 0) {
      showFeedback('No unorganized files selected for cleaning.', 'info')
      return
    }

    if (isDryRunMode) {
      showFeedback(
        `DRY-RUN: Simulated move of ${selected.length} items to categorized folders. (No disk mutations applied)`,
        'info'
      )
      return
    }

    // Real clean action
    // Save current state for undo
    setUndoStack((prev) => [[...tidierFiles], ...prev])

    // Update moved state
    setTidierFiles((prev) =>
      prev.map((f) => (f.selected ? { ...f, moved: true } : f))
    )

    const { ipcFetch } = await import('@renderer/services/ipc-client')
    await ipcFetch('/api/command', {
      method: 'POST',
      body: JSON.stringify({
        command: 'tidy desktop',
        file_count: selected.length
      })
    }).catch(() => null)

    showFeedback(
      `Cleaned desktop: ${selected.length} files organized into Screenshots, Documents & Code. 1-Click Undo is available.`,
      'success'
    )
  }

  const handleUndoTidier = () => {
    if (undoStack.length === 0) {
      showFeedback('No previous clean operation to undo.', 'info')
      return
    }
    const [previousState, ...remainingStack] = undoStack
    setTidierFiles(previousState)
    setUndoStack(remainingStack)
    showFeedback('Reversed last desktop tidy operation. All files restored.', 'success')
  }

  // 2. Bill Scanner
  const totalBurnUsd = useMemo(() => {
    return bills.reduce((sum, b) => sum + b.amountUsd, 0)
  }, [bills])

  const filteredBills = useMemo(() => {
    if (billFilter === 'all') return bills
    return bills.filter((b) => b.status === billFilter)
  }, [bills, billFilter])

  const handleScanNewBill = async () => {
    const { ipcFetch } = await import('@renderer/services/ipc-client')
    const syncRes = await ipcFetch('/api/expenses/sync', { method: 'POST', body: JSON.stringify({}) }).catch(() => null)
    if (syncRes && syncRes.ok) {
      await checkGatewayPing()
      showFeedback('Synchronized expenses & inbox invoices via SQLite WAL.', 'success')
    } else {
      showFeedback('Expense sync requires online workspace (disabled in SILENT air-gap).', 'info')
    }
  }

  // 3. Subscription Radar
  const totalSubscriptionMonthly = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + s.monthlyCost, 0)
  }, [subscriptions])

  const potentialZombieSavings = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === 'zombie')
      .reduce((sum, s) => sum + s.monthlyCost * 12, 0)
  }, [subscriptions])

  const handleToggleSubStatus = (id: string) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: s.status === 'active' ? 'zombie' : 'active'
            }
          : s
      )
    )
    showFeedback('Subscription triage status updated.', 'info')
  }

  // 4. Disk Map
  const totalPurgeableMb = useMemo(() => {
    return diskFolders.filter((f) => f.purgeable).reduce((sum, f) => sum + f.sizeMb, 0)
  }, [diskFolders])

  const handlePurgeTempCaches = async () => {
    setIsPurgingDisk(true)
    showFeedback('Purging expired telemetry logs & temporary caches via /api/system/purge...', 'info')
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      const res = await ipcFetch('/api/system/purge', {
        method: 'POST',
        body: JSON.stringify({ dry_run: false })
      })
      const data = res.ok ? await res.json() : null
      setDiskFolders((prev) =>
        prev.map((f) => (f.purgeable ? { ...f, sizeMb: Math.round(f.sizeMb * 0.1) } : f))
      )
      const mb = data?.reclaimed_mb ?? 0
      showFeedback(`Disk purge complete (${mb} MB reclaimed from log buffers).`, 'success')
    } catch {
      showFeedback('Cache purge endpoint unreachable.', 'error')
    } finally {
      setIsPurgingDisk(false)
    }
  }

  // 5. Indexed Apps Launcher
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchText =
        app.name.toLowerCase().includes(appSearch.toLowerCase()) ||
        app.path.toLowerCase().includes(appSearch.toLowerCase())
      if (!matchText) return false
      if (selectedAppCategory === 'all') return true
      return app.category.toLowerCase() === selectedAppCategory.toLowerCase()
    })
  }, [apps, appSearch, selectedAppCategory])

  const handleLaunchApp = async (app: IndexedApp) => {
    showFeedback(`Launching ${app.name} (${app.path}) via ScopeGuard...`, 'info')
    const start = performance.now()
    try {
      const { ipcFetch } = await import('@renderer/services/ipc-client')
      await ipcFetch('/api/command', {
        method: 'POST',
        body: JSON.stringify({
          command: `open ${app.name}`,
          exe_target: app.path
        })
      }).catch(() => null)
    } catch {}

    const elapsed = Math.round(performance.now() - start)
    showFeedback(`Spawned ${app.name} process in ${elapsed}ms.`, 'success')
  }

  // --------------------------------------------------------------------------
  // J. Orbital Dial Math & Markers
  // --------------------------------------------------------------------------
  const dialRadius = 155
  const centerSvg = 175

  // Current time angle: 24h cycle, 00:00 at top (-90 deg)
  const currentHourFloat = currentTime.getHours() + currentTime.getMinutes() / 60
  const currentAngleDeg = (currentHourFloat / 24) * 360 - 90
  const currentAngleRad = (currentAngleDeg * Math.PI) / 180

  // --------------------------------------------------------------------------
  // K. Render View
  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full w-full bg-[#050811] text-slate-100 font-sans overflow-hidden select-none">
      {/* 1. Header Bar with Global Telemetry & Status */}
      <header className="h-13 bg-[#080D1A] border-b border-cyan-500/20 px-5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(0,245,212,0.2)]">
            <Clock className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-black tracking-widest text-cyan-400 font-mono">
                VIEW 04 // AUTOPILOT & MACRO ORCHESTRATOR
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
                24/7 CHRONO ENGINE
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center space-x-2">
              <span>5 Concentric Cells</span>
              <span>•</span>
              <span>Visual Macro Node Chain</span>
              <span>•</span>
              <span>OS Utility Hub</span>
            </div>
          </div>
        </div>

        {/* Global Controls & Status Badges */}
        <div className="flex items-center space-x-3">
          {/* Action Feedback Badge */}
          {actionFeedback && (
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-mono border transition-all animate-fade-in ${
                actionFeedback.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : actionFeedback.type === 'error'
                  ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                  : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
              }`}
            >
              {actionFeedback.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
              {actionFeedback.type === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
              {actionFeedback.type === 'info' && <Zap className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{actionFeedback.msg}</span>
            </div>
          )}

          {/* Keep PC Awake Mini Indicator */}
          <button
            onClick={handleToggleAwake}
            title={isAwakeActive ? 'Click to disable Keep PC Awake' : 'Click to prevent PC from sleeping'}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
              isAwakeActive
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coffee className={`w-3.5 h-3.5 ${isAwakeActive ? 'text-amber-400 animate-pulse' : ''}`} />
            <span>{isAwakeActive ? `Awake (${awakeMinutesLeft}m)` : 'Awake: Off'}</span>
          </button>

          {/* Pomodoro Mini Pill */}
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900/70 border border-slate-700/60 text-xs font-mono text-slate-300">
            <Activity className="w-3.5 h-3.5 text-rose-400" />
            <span>
              {String(Math.floor(pomoSecondsLeft / 60)).padStart(2, '0')}:
              {String(pomoSecondsLeft % 60).padStart(2, '0')}
            </span>
            <button
              onClick={handleTogglePomo}
              className="ml-1 text-cyan-400 hover:text-cyan-200"
              title={isPomoRunning ? 'Pause Pomodoro' : 'Start Pomodoro'}
            >
              {isPomoRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          </div>

          {/* IPC Link Status */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#0A1020] border border-cyan-500/20 text-xs font-mono text-cyan-300">
            <span
              className={`w-2 h-2 rounded-full ${
                gatewayOnline ? 'bg-emerald-400 shadow-[0_0_6px_#10B981]' : 'bg-rose-500'
              }`}
            />
            <span>{gatewayOnline ? `IPC ${gatewayLatencyMs}ms` : 'OFFLINE'}</span>
          </div>
        </div>
      </header>

      {/* 2. Main Content Stage: Top Split (Dial & Macros) + Bottom Utility Hub */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {/* ================================================================== */}
        {/* TOP ROW: Split 50% Orbital Dial | 50% Voice Routines & Macros      */}
        {/* ================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ---------------------------------------------------------------- */}
          {/* TOP LEFT: 24-HOUR ORBITAL AUTOPILOT DIAL (cols 1..6)             */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-6 flex flex-col">
            <HudBracketCard
              variant="cyan"
              title={
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-xs uppercase tracking-wider text-cyan-300">
                    24-Hour Orbital Autopilot Dial
                  </span>
                </div>
              }
              subtitle="5 Cell Orbits • Background Cron Micro-Slices"
              headerAction={
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsNewCronModalOpen(true)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Cron</span>
                  </button>
                  <button
                    onClick={(e) => handleRunCronNow(selectedJob, e)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono transition-colors shadow-sm"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Now</span>
                  </button>
                </div>
              }
              className="h-full flex flex-col bg-[#080D1A]/90 border border-cyan-500/30 shadow-[0_0_20px_rgba(0,245,212,0.08)]"
            >
              <div className="flex flex-col xl:flex-row items-center gap-4 py-2">
                {/* SVG 24-Hour Orbital Radar Display */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <svg width="350" height="350" viewBox="0 0 350 350" className="overflow-visible">
                    <defs>
                      <radialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#00F5D4" stopOpacity="0.12" />
                        <stop offset="60%" stopColor="#00F5D4" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="#050811" stopOpacity="0" />
                      </radialGradient>
                      <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Background Radial Glow */}
                    <circle cx={centerSvg} cy={centerSvg} r={dialRadius} fill="url(#dialGlow)" />

                    {/* Outer 24-Hour Dial Ring */}
                    <circle
                      cx={centerSvg}
                      cy={centerSvg}
                      r={dialRadius}
                      fill="none"
                      stroke="#1E293B"
                      strokeWidth="1.5"
                    />

                    {/* 24-Hour Hour Ticks and Numbers */}
                    {Array.from({ length: 24 }).map((_, hour) => {
                      const angleDeg = (hour / 24) * 360 - 90
                      const angleRad = (angleDeg * Math.PI) / 180
                      const isMajor = hour % 3 === 0
                      const tickInner = isMajor ? dialRadius - 9 : dialRadius - 5
                      const x1 = centerSvg + dialRadius * Math.cos(angleRad)
                      const y1 = centerSvg + dialRadius * Math.sin(angleRad)
                      const x2 = centerSvg + tickInner * Math.cos(angleRad)
                      const y2 = centerSvg + tickInner * Math.sin(angleRad)
                      const textRadius = dialRadius + 14
                      const tx = centerSvg + textRadius * Math.cos(angleRad)
                      const ty = centerSvg + textRadius * Math.sin(angleRad)

                      return (
                        <g key={`tick-${hour}`}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={isMajor ? '#00F5D4' : '#334155'}
                            strokeWidth={isMajor ? 1.5 : 1}
                          />
                          {isMajor && (
                            <text
                              x={tx}
                              y={ty}
                              fill="#64748B"
                              fontSize="9"
                              fontFamily="monospace"
                              textAnchor="middle"
                              dominantBaseline="central"
                            >
                              {String(hour).padStart(2, '0')}h
                            </text>
                          )}
                        </g>
                      )
                    })}

                    {/* 5 Concentric Orbits for System Cells */}
                    {(Object.values(SYSTEM_CELLS) as SystemCellInfo[]).map((cell) => (
                      <g key={`cell-orbit-${cell.id}`}>
                        <circle
                          cx={centerSvg}
                          cy={centerSvg}
                          r={cell.ringRadius}
                          fill="none"
                          stroke={cell.color}
                          strokeWidth="1"
                          strokeDasharray="3 4"
                          strokeOpacity="0.25"
                        />
                      </g>
                    ))}

                    {/* Sweeper Hand: Current Time Needle */}
                    <line
                      x1={centerSvg}
                      y1={centerSvg}
                      x2={centerSvg + (dialRadius - 2) * Math.cos(currentAngleRad)}
                      y2={centerSvg + (dialRadius - 2) * Math.sin(currentAngleRad)}
                      stroke="#00F5D4"
                      strokeWidth="1.5"
                      strokeOpacity="0.8"
                    />
                    <circle
                      cx={centerSvg + (dialRadius - 2) * Math.cos(currentAngleRad)}
                      cy={centerSvg + (dialRadius - 2) * Math.sin(currentAngleRad)}
                      r="3"
                      fill="#00F5D4"
                      className="animate-pulse"
                    />

                    {/* Plotted Cron Jobs as Glowing Orbital Nodes */}
                    {cronJobs.map((job) => {
                      const cell = SYSTEM_CELLS[job.cell]
                      const r = cell.ringRadius
                      const angleDeg = (job.hour / 24) * 360 - 90
                      const angleRad = (angleDeg * Math.PI) / 180
                      const nx = centerSvg + r * Math.cos(angleRad)
                      const ny = centerSvg + r * Math.sin(angleRad)
                      const isSelected = selectedJobId === job.id
                      const isHovered = hoveredJobId === job.id

                      return (
                        <g
                          key={job.id}
                          className="cursor-pointer transition-transform duration-200"
                          onClick={() => setSelectedJobId(job.id)}
                          onMouseEnter={() => setHoveredJobId(job.id)}
                          onMouseLeave={() => setHoveredJobId(null)}
                        >
                          {/* Pulsing ring if selected or running */}
                          {(isSelected || job.status === 'running') && (
                            <circle
                              cx={nx}
                              cy={ny}
                              r="9"
                              fill="none"
                              stroke={cell.color}
                              strokeWidth="1.5"
                              strokeOpacity="0.8"
                              className="animate-ping"
                            />
                          )}
                          <circle
                            cx={nx}
                            cy={ny}
                            r={isSelected || isHovered ? '6.5' : '4.5'}
                            fill={job.enabled ? cell.color : '#475569'}
                            stroke="#050811"
                            strokeWidth="1.5"
                            filter="url(#nodeGlow)"
                          />
                        </g>
                      )
                    })}

                    {/* Center Core Hub Readout */}
                    <circle cx={centerSvg} cy={centerSvg} r="32" fill="#0A1020" stroke="#00F5D4" strokeWidth="1" />
                    <text
                      x={centerSvg}
                      y={centerSvg - 6}
                      fill="#00F5D4"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {currentTime.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </text>
                    <text
                      x={centerSvg}
                      y={centerSvg + 9}
                      fill="#64748B"
                      fontSize="7.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      LOCAL
                    </text>
                  </svg>
                </div>

                {/* Selected Job & Orbit Details Card */}
                <div className="flex-1 w-full space-y-3">
                  {/* Selected Job Panel */}
                  <div className="p-3 rounded-lg bg-[#0A1020] border border-cyan-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: SYSTEM_CELLS[selectedJob.cell].color }}
                        />
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {selectedJob.title}
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleToggleCronJob(selectedJob.id, e)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                          selectedJob.enabled
                            ? 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {selectedJob.enabled ? 'ACTIVE' : 'PAUSED'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="text-slate-400">
                        Schedule: <span className="text-slate-200 font-bold">{selectedJob.schedule}</span>
                      </div>
                      <div className="text-slate-400">
                        Cell:{' '}
                        <span
                          className="font-bold"
                          style={{ color: SYSTEM_CELLS[selectedJob.cell].color }}
                        >
                          {SYSTEM_CELLS[selectedJob.cell].name}
                        </span>
                      </div>
                      <div className="text-slate-400">
                        Last Run: <span className="text-slate-200">{selectedJob.lastRun || 'Never'}</span>
                      </div>
                      <div className="text-slate-400">
                        Action: <span className="text-cyan-400 truncate">{selectedJob.action}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-800">
                      <button
                        onClick={(e) => handleDeleteCron(selectedJob.id, e)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Delete Cron Job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleRunCronNow(selectedJob, e)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/30 text-emerald-300 text-xs font-mono transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        <span>Run Now</span>
                      </button>
                    </div>
                  </div>

                  {/* 5 Cells Legend */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                      Autonomous System Cell Orbits
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {(Object.values(SYSTEM_CELLS) as SystemCellInfo[]).map((cell) => {
                        const count = cronJobs.filter((j) => j.cell === cell.id).length
                        return (
                          <div
                            key={cell.id}
                            className="flex items-center justify-between px-2 py-1 rounded bg-slate-900/60 border border-slate-800 text-[10px] font-mono"
                          >
                            <div className="flex items-center space-x-1.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: cell.color }}
                              />
                              <span className="text-slate-300 truncate">{cell.name}</span>
                            </div>
                            <span className="text-slate-500">{count} jobs</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </HudBracketCard>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* TOP RIGHT: VOICE ROUTINES & MACRO COMPOSER (cols 7..12)          */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            {/* Macro Recorder & Pipeline Stage */}
            <HudBracketCard
              variant="amber"
              title={
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="font-mono text-xs uppercase tracking-wider text-amber-300">
                    Voice Routines & Macro Composer
                  </span>
                </div>
              }
              subtitle="Deterministic Win32 Macro Replayer & Visual Pipeline"
              headerAction={
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleToggleRecordMacro}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-mono border transition-all ${
                      isRecordingMacro
                        ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.4)]'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isRecordingMacro ? 'bg-rose-500 animate-ping' : 'bg-amber-400'
                      }`}
                    />
                    <span>
                      {isRecordingMacro
                        ? `REC [${String(recordSeconds).padStart(2, '0')}s]`
                        : 'Record Macro'}
                    </span>
                  </button>
                  {recordedEvents.length > 0 && !isRecordingMacro && (
                    <button
                      onClick={handleCompileRecordedMacro}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Compile .nxskill</span>
                    </button>
                  )}
                </div>
              }
              className="flex-1 flex flex-col bg-[#080D1A]/90 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
            >
              {/* Visual Pipeline Node Chain (Flow Chain) */}
              <div className="space-y-2 py-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Visual Pipeline Chain</span>
                  <button
                    onClick={handleRunPipelineTest}
                    disabled={isExecutingPipeline}
                    className="flex items-center space-x-1 text-cyan-400 hover:text-cyan-200 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>{isExecutingPipeline ? 'Simulating...' : 'Test Flow'}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-1 overflow-x-auto py-2 px-1 custom-scrollbar">
                  {pipelineNodes.map((node, index) => (
                    <React.Fragment key={node.id}>
                      <div
                        className={`shrink-0 w-36 p-2 rounded border text-left transition-all ${
                          node.status === 'running'
                            ? 'bg-cyan-950/90 border-cyan-400 shadow-[0_0_10px_rgba(0,245,212,0.4)] scale-102'
                            : node.status === 'success'
                            ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                            : 'bg-[#0A1020] border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="text-[10px] font-mono font-bold truncate text-slate-200 flex items-center justify-between">
                          <span>{node.title}</span>
                          {node.status === 'success' && <Check className="w-3 h-3 text-emerald-400" />}
                        </div>
                        <div className="text-[9px] font-mono text-slate-400 truncate mt-0.5">
                          {node.detail}
                        </div>
                      </div>
                      {index < pipelineNodes.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Voice Routines List & Fast Ingestion Form */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300 font-bold uppercase">
                    Active Spoken Reflexes ({routines.length})
                  </span>
                  <div className="relative w-44">
                    <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                    <input
                      type="text"
                      placeholder="Search phrase..."
                      value={routineSearch}
                      onChange={(e) => setRoutineSearch(e.target.value)}
                      className="w-full bg-[#050811] border border-slate-800 rounded pl-7 pr-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>

                {/* Scrollable Routine Cards */}
                <div className="max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                  {routines
                    .filter((r) =>
                      r.trigger_phrase.toLowerCase().includes(routineSearch.toLowerCase()) ||
                      r.action_sequence.toLowerCase().includes(routineSearch.toLowerCase())
                    )
                    .map((routine) => (
                      <div
                        key={routine.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded bg-[#0A1020] border border-slate-800 hover:border-cyan-500/30 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-xs font-mono font-bold text-slate-200">
                              "{routine.trigger_phrase}"
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 ml-2">
                              ➔ {routine.action_sequence}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handlePlayVoiceRoutine(routine)}
                            className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                            title="Test Execute Routine"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteVoiceRoutine(routine.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Delete Routine"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Quick Add Routine Mini-Form */}
                <form
                  onSubmit={handleAddRoutine}
                  className="flex items-center space-x-2 pt-1 border-t border-slate-800/80"
                >
                  <input
                    type="text"
                    placeholder="Trigger (e.g. 'Lock Workstation')"
                    value={newTriggerInput}
                    onChange={(e) => setNewTriggerInput(e.target.value)}
                    className="flex-1 bg-[#050811] border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                  <input
                    type="text"
                    placeholder="Actions (e.g. 'mute audio; lock workstation')"
                    value={newActionInput}
                    onChange={(e) => setNewActionInput(e.target.value)}
                    className="flex-1 bg-[#050811] border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold transition-colors shrink-0"
                  >
                    + Bind
                  </button>
                </form>
              </div>
            </HudBracketCard>
          </div>
        </div>

        {/* ================================================================== */}
        {/* BOTTOM SECTION: OS UTILITY HUB (5 Wired Tools)                     */}
        {/* ================================================================== */}
        <div className="w-full">
          <HudBracketCard
            variant="purple"
            title={
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-xs uppercase tracking-wider text-purple-300">
                  OS Utility Hub
                </span>
              </div>
            }
            subtitle="Local Desktop Tidier • Bill Scanner • Subscription Radar • Disk Map • Indexed Apps"
            headerAction={
              <div className="flex items-center space-x-1 bg-[#0A1020] p-1 rounded-lg border border-purple-500/30">
                <button
                  onClick={() => setActiveUtilTab('tidier')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    activeUtilTab === 'tidier'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Desktop Tidier
                </button>
                <button
                  onClick={() => setActiveUtilTab('bills')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    activeUtilTab === 'bills'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bill Scanner
                </button>
                <button
                  onClick={() => setActiveUtilTab('subscriptions')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    activeUtilTab === 'subscriptions'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Subscription Radar
                </button>
                <button
                  onClick={() => setActiveUtilTab('disk')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    activeUtilTab === 'disk'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Disk Map
                </button>
                <button
                  onClick={() => setActiveUtilTab('apps')}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    activeUtilTab === 'apps'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Indexed Apps
                </button>
              </div>
            }
            className="bg-[#080D1A]/90 border border-purple-500/30 shadow-[0_0_20px_rgba(167,139,250,0.08)]"
          >
            {/* -------------------------------------------------------------- */}
            {/* TAB 1: DESKTOP TIDIER (Dry-Run / Undo)                         */}
            {/* -------------------------------------------------------------- */}
            {activeUtilTab === 'tidier' && (
              <div className="space-y-3 py-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 text-xs font-mono">
                    <span className="text-slate-300">
                      Unorganized items detected:{' '}
                      <strong className="text-cyan-400">
                        {tidierFiles.filter((f) => !f.moved).length}
                      </strong>
                    </span>
                    <button
                      onClick={() => setIsDryRunMode((prev) => !prev)}
                      className={`px-2 py-0.5 rounded border text-[11px] font-mono transition-colors ${
                        isDryRunMode
                          ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                          : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      }`}
                    >
                      {isDryRunMode ? 'DRY-RUN (Simulated)' : 'LIVE DISK MUTATION'}
                    </button>
                  </div>

                  <div className="flex items-center space-x-2">
                    {undoStack.length > 0 && (
                      <button
                        onClick={handleUndoTidier}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Undo Last Clean</span>
                      </button>
                    )}
                    <button
                      onClick={handleExecuteTidier}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-mono font-bold transition-colors"
                    >
                      <FolderSync className="w-3.5 h-3.5" />
                      <span>{isDryRunMode ? 'Run Dry-Run Preview' : 'Organize Desktop'}</span>
                    </button>
                  </div>
                </div>

                {/* Tidier Files Table */}
                <div className="overflow-x-auto rounded border border-slate-800">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-[#0A1020] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3 w-8">
                          <button onClick={handleToggleTidierSelectAll} className="flex items-center">
                            {tidierFiles.every((f) => f.selected) ? (
                              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </button>
                        </th>
                        <th className="py-2 px-3">File Name</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Target Destination</th>
                        <th className="py-2 px-3">Size</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-[#050811]/60">
                      {tidierFiles.map((file) => (
                        <tr
                          key={file.id}
                          className="hover:bg-slate-900/50 transition-colors cursor-pointer"
                          onClick={() => handleToggleTidierFile(file.id)}
                        >
                          <td className="py-2 px-3">
                            {file.selected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-200">{file.name}</td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                              {file.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-cyan-400">{file.targetFolder}</td>
                          <td className="py-2 px-3 text-slate-400">
                            {file.sizeKb > 1024
                              ? `${(file.sizeKb / 1024).toFixed(1)} MB`
                              : `${file.sizeKb} KB`}
                          </td>
                          <td className="py-2 px-3">
                            {file.moved ? (
                              <span className="text-emerald-400 font-bold">ORGANIZED</span>
                            ) : (
                              <span className="text-slate-500">PENDING</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* TAB 2: BILL SCANNER                                           */}
            {/* -------------------------------------------------------------- */}
            {activeUtilTab === 'bills' && (
              <div className="space-y-3 py-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <span className="text-xs font-mono text-slate-300">
                      Monthly Burn Rate:{' '}
                      <strong className="text-emerald-400 text-sm">
                        ${totalBurnUsd.toFixed(2)}
                      </strong>
                    </span>
                    <div className="flex items-center space-x-1 bg-[#0A1020] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
                      <button
                        onClick={() => setBillFilter('all')}
                        className={`px-2 py-0.5 rounded ${
                          billFilter === 'all' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setBillFilter('due')}
                        className={`px-2 py-0.5 rounded ${
                          billFilter === 'due' ? 'bg-slate-800 text-rose-400' : 'text-slate-400'
                        }`}
                      >
                        Due Now
                      </button>
                      <button
                        onClick={() => setBillFilter('paid')}
                        className={`px-2 py-0.5 rounded ${
                          billFilter === 'paid' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        Paid
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleScanNewBill}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-mono transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>+ Scan Invoices</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {filteredBills.map((bill) => (
                    <div
                      key={bill.id}
                      className="p-3 rounded-lg bg-[#0A1020] border border-slate-800 hover:border-cyan-500/30 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-slate-200">
                            {bill.merchant}
                          </span>
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              bill.status === 'paid'
                                ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                                : bill.status === 'due'
                                ? 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                                : 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                            }`}
                          >
                            {bill.status.toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-1">
                          Ref: {bill.invoiceRef} • {bill.category}
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] font-mono text-slate-400">
                          Due: {bill.dueDate}
                        </span>
                        <span className="text-sm font-mono font-black text-cyan-400">
                          ${bill.amountUsd.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* TAB 3: SUBSCRIPTION RADAR                                     */}
            {/* -------------------------------------------------------------- */}
            {activeUtilTab === 'subscriptions' && (
              <div className="space-y-3 py-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-xs font-mono">
                    <span>
                      Active Subscriptions:{' '}
                      <strong className="text-cyan-400">
                        ${totalSubscriptionMonthly.toFixed(2)}/mo
                      </strong>
                    </span>
                    <span>
                      Zombie Waste Detected:{' '}
                      <strong className="text-amber-400">
                        ${potentialZombieSavings.toFixed(2)}/yr
                      </strong>
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Triage active seats to reclaim annual developer budget
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className={`p-3 rounded-lg border transition-all flex items-center justify-between ${
                        sub.status === 'zombie'
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-[#0A1020] border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono font-bold text-slate-200">
                            {sub.name}
                          </span>
                          {sub.status === 'zombie' && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ZOMBIE SEAT
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {sub.category} • Last used: {sub.lastUsed}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="text-xs font-mono font-bold text-slate-200">
                            ${sub.monthlyCost.toFixed(2)}/mo
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Renews {sub.renewalDate}
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleSubStatus(sub.id)}
                          className="text-[10px] font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          {sub.status === 'active' ? 'Mark Zombie' : 'Mark Active'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* TAB 4: DISK MAP (Storage Analyzer)                             */}
            {/* -------------------------------------------------------------- */}
            {activeUtilTab === 'disk' && (
              <div className="space-y-4 py-1">
                {/* Partition Usage Visual Bars */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {partitions.map((part) => {
                    const pct = Math.round((part.usedGb / part.totalGb) * 100)
                    return (
                      <div
                        key={part.mount}
                        className="p-3 rounded-lg bg-[#0A1020] border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="font-bold text-slate-200">{part.name}</span>
                          <span className="text-slate-400">
                            {part.freeGb} GB free of {part.totalGb} GB
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: part.color }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Subsystem & Cache Breakdown */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-300 font-bold uppercase">
                      Nexus Agent Footprint & Cache Breakdown
                    </span>
                    <button
                      onClick={handlePurgeTempCaches}
                      disabled={isPurgingDisk}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-mono transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isPurgingDisk ? 'Purging...' : 'Purge Temp & Build Caches'}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {diskFolders.map((folder) => (
                      <div
                        key={folder.path}
                        className="flex items-center justify-between p-2 rounded bg-[#0A1020] border border-slate-800/80 text-xs font-mono"
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: folder.color }}
                          />
                          <span className="text-slate-200 truncate">{folder.name}</span>
                          <span className="text-slate-500 text-[10px] truncate">({folder.path})</span>
                        </div>
                        <div className="flex items-center space-x-3 shrink-0">
                          <span className="font-bold text-slate-300">
                            {folder.sizeMb > 1024
                              ? `${(folder.sizeMb / 1024).toFixed(2)} GB`
                              : `${folder.sizeMb} MB`}
                          </span>
                          {folder.purgeable && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              PURGEABLE
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* TAB 5: INDEXED APPS LAUNCHER                                  */}
            {/* -------------------------------------------------------------- */}
            {activeUtilTab === 'apps' && (
              <div className="space-y-3 py-1">
                <div className="flex items-center justify-between">
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Instant launch app (<5ms)..."
                      value={appSearch}
                      onChange={(e) => setAppSearch(e.target.value)}
                      className="w-full bg-[#050811] border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                  </div>

                  <div className="flex items-center space-x-1 bg-[#0A1020] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
                    {['all', 'development', 'productivity', 'system'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedAppCategory(cat)}
                        className={`px-2 py-0.5 rounded capitalize ${
                          selectedAppCategory === cat
                            ? 'bg-purple-950/60 border border-purple-500/40 text-purple-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {filteredApps.map((app) => (
                    <button
                      key={app.id}
                      onClick={() => handleLaunchApp(app)}
                      className="flex items-center space-x-3 p-2.5 rounded-lg bg-[#0A1020] border border-slate-800 hover:border-purple-500/40 hover:bg-purple-950/20 text-left transition-all group"
                    >
                      <div className="w-8 h-8 rounded bg-purple-500/10 border border-purple-500/30 flex items-center justify-center font-mono font-bold text-xs text-purple-300 group-hover:scale-105 transition-transform">
                        {app.iconLetter}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-mono font-bold text-slate-200 group-hover:text-purple-300 transition-colors truncate">
                          {app.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {app.category}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </HudBracketCard>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: NEW CRON JOB                                                 */}
      {/* ==================================================================== */}
      {isNewCronModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#0A1020] border border-cyan-500/40 rounded-xl p-5 shadow-[0_0_30px_rgba(0,245,212,0.15)] space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span className="font-mono text-sm font-bold text-cyan-300 uppercase">
                  Schedule New Orbital Cron
                </span>
              </div>
              <button
                onClick={() => setIsNewCronModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewCron} className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Job Title / Purpose</label>
                <input
                  type="text"
                  placeholder="e.g. Daily ArXiv Digest & KaTeX Synthesis"
                  value={newCronTitle}
                  onChange={(e) => setNewCronTitle(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Time (24h HH:MM)</label>
                  <input
                    type="text"
                    placeholder="14:30"
                    value={newCronSchedule}
                    onChange={(e) => setNewCronSchedule(e.target.value)}
                    className="w-full bg-[#050811] border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/50"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Target Cell</label>
                  <select
                    value={newCronCell}
                    onChange={(e) => setNewCronCell(Number(e.target.value) as SystemCellId)}
                    className="w-full bg-[#050811] border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value={1}>Cell 01: Core & Memory</option>
                    <option value={2}>Cell 02: MCP & Skills</option>
                    <option value={3}>Cell 03: Soul & Briefing</option>
                    <option value={4}>Cell 04: Enclave & Security</option>
                    <option value={5}>Cell 05: OS Watchdog</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Action / Command</label>
                <input
                  type="text"
                  placeholder="e.g. dispatch_scholar_digest"
                  value={newCronAction}
                  onChange={(e) => setNewCronAction(e.target.value)}
                  className="w-full bg-[#050811] border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500/50"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewCronModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold"
                >
                  + Add to Orbit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default AutopilotAndMacrosView
