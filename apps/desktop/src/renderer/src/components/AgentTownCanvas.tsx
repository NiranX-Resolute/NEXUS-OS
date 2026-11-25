import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  Users,
  Play,
  Pause,
  Navigation,
  Shield,
  Code,
  Globe,
  Terminal,
  Activity,
  X,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  Coffee,
  Database
} from 'lucide-react'

// Canvas Dimensions & 32px Grid
export const CANVAS_WIDTH = 800
export const CANVAS_HEIGHT = 500
export const TILE_SIZE = 32
export const COLS = Math.floor(CANVAS_WIDTH / TILE_SIZE) // 25 columns (0..24)
export const ROWS = Math.floor(CANVAS_HEIGHT / TILE_SIZE) // 15 rows (0..14)

export type AgentId = 'DEV-01' | 'SYS-01' | 'SCOUT-01' | 'SEC-01' | 'OPS-01'
export type AgentStatus = 'IDLE' | 'ASSIGNED' | 'EXECUTING' | 'COMPLETED' | 'ERROR'

export interface Point {
  x: number
  y: number
}

export interface Desk {
  id: AgentId
  name: string
  role: string
  gridX: number
  gridY: number
  color: string
  secondaryColor: string
}

export const DESKS: Record<AgentId, Desk> = {
  'DEV-01': {
    id: 'DEV-01',
    name: 'Dev-01 Coder',
    role: 'AST / Full-Stack',
    gridX: 3,
    gridY: 3,
    color: '#38BDF8', // Cyan / Sky
    secondaryColor: '#0284C7'
  },
  'SYS-01': {
    id: 'SYS-01',
    name: 'Sys-01 Win32',
    role: 'OS / Win32 UIA / PTY',
    gridX: 8,
    gridY: 3,
    color: '#10B981', // Emerald
    secondaryColor: '#059669'
  },
  'SCOUT-01': {
    id: 'SCOUT-01',
    name: 'Scout-01 Web',
    role: 'Web Ingest / Obscura',
    gridX: 14,
    gridY: 3,
    color: '#818CF8', // Indigo / Violet
    secondaryColor: '#6366F1'
  },
  'SEC-01': {
    id: 'SEC-01',
    name: 'Sec-01 Sentinel',
    role: 'ScopeGuard Auditor',
    gridX: 19,
    gridY: 3,
    color: '#F43F5E', // Rose / Red
    secondaryColor: '#E11D48'
  },
  'OPS-01': {
    id: 'OPS-01',
    name: 'Ops-01 Runner',
    role: 'Infinity Slices / Mesh',
    gridX: 3,
    gridY: 9,
    color: '#F59E0B', // Amber
    secondaryColor: '#D97706'
  }
}

// Key Points of Interest in Autonomous Workspace
export const DISPATCH_HUB: Point = { x: 12, y: 8 }
export const SERVER_RACK: Point = { x: 18, y: 8 }
export const WHITEBOARD: Point = { x: 7, y: 8 }
export const LOUNGE_AREA: Point = { x: 18, y: 12 }

export type StationId = AgentId | 'CENTRAL_HUB' | 'SOVEREIGN_EDGE' | 'BREAKROOM'

export interface StationInfo {
  id: StationId
  name: string
  role: string
  color: string
  gridX: number
  gridY: number
}

export const ALL_WORKSTATIONS: StationInfo[] = [
  { id: 'DEV-01', name: 'DEV-01 Coder', role: 'AST / Full-Stack', color: '#38BDF8', gridX: 3, gridY: 3 },
  { id: 'SYS-01', name: 'SYS-01 Win32', role: 'OS / Win32 UIA / PTY', color: '#10B981', gridX: 8, gridY: 3 },
  { id: 'SCOUT-01', name: 'SCOUT-01 Web', role: 'Web Ingest / Obscura', color: '#818CF8', gridX: 14, gridY: 3 },
  { id: 'SEC-01', name: 'SEC-01 Sentinel', role: 'ScopeGuard Auditor', color: '#F43F5E', gridX: 19, gridY: 3 },
  { id: 'OPS-01', name: 'OPS-01 Runner', role: 'Infinity Slices / Mesh', color: '#F59E0B', gridX: 3, gridY: 9 },
  { id: 'CENTRAL_HUB', name: 'Central Hub', role: 'Nexus Mesh Router', color: '#00F0FF', gridX: 12, gridY: 8 },
  { id: 'SOVEREIGN_EDGE', name: 'Sovereign Edge', role: 'SQLite WAL & Mainframe', color: '#A855F7', gridX: 18, gridY: 8 },
  { id: 'BREAKROOM', name: 'Breakroom', role: 'Standby / Lounge', color: '#34D399', gridX: 18, gridY: 12 }
]

// Realistic tasks pool matching the specification
const AGENT_TASKS: Record<AgentId, string[]> = {
  'DEV-01': [
    'Writing AST Edit',
    'Refactoring Component Tree',
    'Vite HMR Hot-Reload',
    'Validating TS Invariants'
  ],
  'SYS-01': [
    'Polling Win32 UIA',
    'Capturing Window Bounds',
    'Checking SHQueryState',
    'PTY Pipe Stream Active'
  ],
  'SCOUT-01': [
    'Web Ingest Active',
    'Obscura CDP Grounding',
    'Parsing DOM Snapshot',
    'Fetching Vector Embeddings'
  ],
  'SEC-01': [
    'ScopeGuard Invariants: 6/6',
    'Auditing DPAPI Vault',
    'Path Containment Verified',
    'Security Policy Enforced'
  ],
  'OPS-01': [
    'Infinity Slices Active',
    'D1 Serverless Mesh Sync',
    'Parallel Slice Dispatch',
    'Telemetry Pipeline: 60Hz'
  ]
}

// -----------------------------------------------------------------------------
// A* Pathfinding Engine
// -----------------------------------------------------------------------------
function aStarPathfind(
  start: Point,
  target: Point,
  isObstacle: (x: number, y: number) => boolean
): Point[] {
  if (start.x === target.x && start.y === target.y) return [start]

  interface Node {
    x: number
    y: number
    g: number
    h: number
    f: number
    parent: Node | null
  }

  const openList: Node[] = []
  const closedSet = new Set<string>()

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    h: Math.abs(start.x - target.x) + Math.abs(start.y - target.y),
    f: 0,
    parent: null
  }
  startNode.f = startNode.g + startNode.h
  openList.push(startNode)

  while (openList.length > 0) {
    openList.sort((a, b) => a.f - b.f)
    const current = openList.shift()!

    if (current.x === target.x && current.y === target.y) {
      const path: Point[] = []
      let curr: Node | null = current
      while (curr) {
        path.unshift({ x: curr.x, y: curr.y })
        curr = curr.parent
      }
      return path
    }

    const key = `${current.x},${current.y}`
    closedSet.add(key)

    const neighbors: Point[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ]

    for (const nb of neighbors) {
      if (nb.x < 1 || nb.x >= COLS - 1 || nb.y < 1 || nb.y >= ROWS - 1) continue
      if (isObstacle(nb.x, nb.y) && !(nb.x === target.x && nb.y === target.y)) continue
      const nbKey = `${nb.x},${nb.y}`
      if (closedSet.has(nbKey)) continue

      const gScore = current.g + 1
      const existing = openList.find((n) => n.x === nb.x && n.y === nb.y)

      if (!existing) {
        const hScore = Math.abs(nb.x - target.x) + Math.abs(nb.y - target.y)
        const newNode: Node = {
          x: nb.x,
          y: nb.y,
          g: gScore,
          h: hScore,
          f: gScore + hScore,
          parent: current
        }
        openList.push(newNode)
      } else if (gScore < existing.g) {
        existing.g = gScore
        existing.f = gScore + existing.h
        existing.parent = current
      }
    }
  }

  // Direct line fallback
  return [start, target]
}

interface AgentSprite {
  id: AgentId
  pixelX: number
  pixelY: number
  gridX: number
  gridY: number
  targetGridX: number
  targetGridY: number
  path: Point[]
  status: AgentStatus
  taskSummary: string
  sliceId: string
  facing: 'left' | 'right' | 'up' | 'down'
  walkCycle: number
  typingFrame: number
  bubbleTimer: number
  taskTimer: number
}

export function AgentTownCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const [selectedStation, setSelectedStation] = useState<StationId | null>(null)
  const [activeCount, setActiveCount] = useState<number>(5)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [simFilter, setSimFilter] = useState<'ALL' | AgentId>('ALL')
  const [lastEventTime, setLastEventTime] = useState<string>('Live')

  // Agents Reference State
  const agentsRef = useRef<Record<AgentId, AgentSprite>>({
    'DEV-01': {
      id: 'DEV-01',
      pixelX: DESKS['DEV-01'].gridX * TILE_SIZE,
      pixelY: (DESKS['DEV-01'].gridY + 1) * TILE_SIZE,
      gridX: DESKS['DEV-01'].gridX,
      gridY: DESKS['DEV-01'].gridY + 1,
      targetGridX: DESKS['DEV-01'].gridX,
      targetGridY: DESKS['DEV-01'].gridY + 1,
      path: [],
      status: 'EXECUTING',
      taskSummary: 'Writing AST Edit',
      sliceId: 'slc_dev_01_ast',
      facing: 'up',
      walkCycle: 0,
      typingFrame: 0,
      bubbleTimer: 180,
      taskTimer: 240
    },
    'SYS-01': {
      id: 'SYS-01',
      pixelX: DESKS['SYS-01'].gridX * TILE_SIZE,
      pixelY: (DESKS['SYS-01'].gridY + 1) * TILE_SIZE,
      gridX: DESKS['SYS-01'].gridX,
      gridY: DESKS['SYS-01'].gridY + 1,
      targetGridX: DESKS['SYS-01'].gridX,
      targetGridY: DESKS['SYS-01'].gridY + 1,
      path: [],
      status: 'EXECUTING',
      taskSummary: 'Polling Win32 UIA',
      sliceId: 'slc_sys_01_uia',
      facing: 'up',
      walkCycle: 0,
      typingFrame: 0,
      bubbleTimer: 180,
      taskTimer: 300
    },
    'SCOUT-01': {
      id: 'SCOUT-01',
      pixelX: DESKS['SCOUT-01'].gridX * TILE_SIZE,
      pixelY: (DESKS['SCOUT-01'].gridY + 1) * TILE_SIZE,
      gridX: DESKS['SCOUT-01'].gridX,
      gridY: DESKS['SCOUT-01'].gridY + 1,
      targetGridX: DESKS['SCOUT-01'].gridX,
      targetGridY: DESKS['SCOUT-01'].gridY + 1,
      path: [],
      status: 'EXECUTING',
      taskSummary: 'Web Ingest Active',
      sliceId: 'slc_scout_01_web',
      facing: 'up',
      walkCycle: 0,
      typingFrame: 0,
      bubbleTimer: 180,
      taskTimer: 200
    },
    'SEC-01': {
      id: 'SEC-01',
      pixelX: DESKS['SEC-01'].gridX * TILE_SIZE,
      pixelY: (DESKS['SEC-01'].gridY + 1) * TILE_SIZE,
      gridX: DESKS['SEC-01'].gridX,
      gridY: DESKS['SEC-01'].gridY + 1,
      targetGridX: DESKS['SEC-01'].gridX,
      targetGridY: DESKS['SEC-01'].gridY + 1,
      path: [],
      status: 'EXECUTING',
      taskSummary: 'ScopeGuard Invariants: 6/6',
      sliceId: 'slc_sec_01_audit',
      facing: 'up',
      walkCycle: 0,
      typingFrame: 0,
      bubbleTimer: 180,
      taskTimer: 280
    },
    'OPS-01': {
      id: 'OPS-01',
      pixelX: DESKS['OPS-01'].gridX * TILE_SIZE,
      pixelY: (DESKS['OPS-01'].gridY + 1) * TILE_SIZE,
      gridX: DESKS['OPS-01'].gridX,
      gridY: DESKS['OPS-01'].gridY + 1,
      targetGridX: DESKS['OPS-01'].gridX,
      targetGridY: DESKS['OPS-01'].gridY + 1,
      path: [],
      status: 'EXECUTING',
      taskSummary: 'Parallel Slice Dispatch',
      sliceId: 'slc_ops_01_mesh',
      facing: 'up',
      walkCycle: 0,
      typingFrame: 0,
      bubbleTimer: 180,
      taskTimer: 220
    }
  })

  // Collision map: bounds, desks, dispatch hub, servers, lounge
  const isObstacle = useCallback((gx: number, gy: number) => {
    // Outer perimeter
    if (gx <= 0 || gx >= COLS - 1 || gy <= 0 || gy >= ROWS - 1) return true

    // Workstation Desks (2 tiles wide, 1 tile high)
    for (const d of Object.values(DESKS)) {
      if ((gx === d.gridX || gx === d.gridX + 1) && gy === d.gridY) return true
    }

    // Central Dispatch Hub (3 tiles wide, 2 tiles high)
    if (
      gx >= DISPATCH_HUB.x &&
      gx <= DISPATCH_HUB.x + 2 &&
      gy >= DISPATCH_HUB.y &&
      gy <= DISPATCH_HUB.y + 1
    ) {
      return true
    }

    // Server Mainframe Rack (2 tiles wide, 2 tiles high)
    if (
      gx >= SERVER_RACK.x &&
      gx <= SERVER_RACK.x + 1 &&
      gy >= SERVER_RACK.y &&
      gy <= SERVER_RACK.y + 1
    ) {
      return true
    }

    // Whiteboard (2 tiles wide, 1 tile high)
    if (gx >= WHITEBOARD.x && gx <= WHITEBOARD.x + 1 && gy === WHITEBOARD.y) {
      return true
    }

    // Lounge Coffee Bar (3 tiles wide, 1 tile high)
    if (gx >= LOUNGE_AREA.x && gx <= LOUNGE_AREA.x + 2 && gy === LOUNGE_AREA.y) {
      return true
    }

    return false
  }, [])

  // Dispatch movement with A* pathfinding
  const dispatchAgentMovement = useCallback(
    (
      agentId: AgentId,
      target: Point,
      newStatus: AgentStatus,
      taskSummary: string,
      sliceId: string
    ) => {
      const ag = agentsRef.current[agentId]
      if (!ag) return

      const currentGrid: Point = { x: ag.gridX, y: ag.gridY }
      const path = aStarPathfind(currentGrid, target, isObstacle)

      ag.targetGridX = target.x
      ag.targetGridY = target.y
      ag.path = path.slice(1) // Skip current tile
      ag.status = newStatus
      ag.taskSummary = taskSummary
      ag.sliceId = sliceId
      ag.bubbleTimer = 240
    },
    [isObstacle]
  )

  // Wire workstation dispatch click to POST /api/slices/dispatch and animate agent movement
  const dispatchWorkstationSlice = useCallback(
    async (agentId?: AgentId) => {
      const targetIds: AgentId[] = agentId
        ? [agentId]
        : (Object.keys(DESKS) as AgentId[])

      for (const id of targetIds) {
        const ag = agentsRef.current[id]
        if (!ag) continue
        const tasks = AGENT_TASKS[id] || ['Executing autonomous task slice']
        const randomTask = tasks[Math.floor(Math.random() * tasks.length)]
        const sliceId = `slc_${id.toLowerCase()}_${Date.now().toString(36)}`

        // Cycle through targets: Workstation -> Dispatch Hub -> Server/Lounge -> Workstation
        const destinations: Point[] = [
          { x: DESKS[id].gridX, y: DESKS[id].gridY + 1 },
          { x: DISPATCH_HUB.x + (Object.keys(DESKS).indexOf(id) % 3), y: DISPATCH_HUB.y + 2 },
          { x: SERVER_RACK.x, y: SERVER_RACK.y + 2 },
          { x: LOUNGE_AREA.x + (Object.keys(DESKS).indexOf(id) % 3), y: LOUNGE_AREA.y + 1 }
        ]

        // Pick next destination distinct from current
        const nextDest = destinations[Math.floor(Math.random() * destinations.length)]

        // Send real HTTP POST to http://127.0.0.1:47630/api/slices/dispatch
        try {
          import('@renderer/services/ipc-client').then(({ ipcFetch }) => {
            void ipcFetch('http://127.0.0.1:47630/api/slices/dispatch', {
              method: 'POST',
              body: JSON.stringify({
                slice_id: sliceId,
                agent_id: id,
                action: 'dispatch',
                task_summary: randomTask,
                target: { x: nextDest.x, y: nextDest.y }
              })
            }).catch(() => {})
          })
        } catch {}

        dispatchAgentMovement(id, nextDest, 'EXECUTING', randomTask, sliceId)
      }

      setLastEventTime(new Date().toLocaleTimeString())
    },
    [dispatchAgentMovement]
  )

  const simulateTaskSlice = dispatchWorkstationSlice

  // Reset all agents to their respective workstations
  const resetToWorkstations = useCallback(() => {
    ;(Object.keys(DESKS) as AgentId[]).forEach((id) => {
      const desk = DESKS[id]
      const tasks = AGENT_TASKS[id]
      dispatchAgentMovement(
        id,
        { x: desk.gridX, y: desk.gridY + 1 },
        'EXECUTING',
        tasks[0],
        `slc_${id.toLowerCase()}_ready`
      )
    })
    setLastEventTime('Reset')
  }, [dispatchAgentMovement])

  // Hook into live Electron IPC Telemetry if available
  useEffect(() => {
    const win = typeof window !== 'undefined' ? window : null
    if (!win || !win.nexusTelemetry) return

    win.nexusTelemetry
      .getAgents()
      .then((res) => {
        if (res && res.success && res.agents) {
          let count = 0
          for (const [idStr, data] of Object.entries(res.agents)) {
            const id = idStr as AgentId
            if (agentsRef.current[id]) {
              agentsRef.current[id].status = data.status
              agentsRef.current[id].taskSummary = data.task
              agentsRef.current[id].sliceId = data.slice_id
              if (data.status === 'EXECUTING' || data.status === 'ASSIGNED') {
                count++
                dispatchAgentMovement(
                  id,
                  { x: DESKS[id].gridX, y: DESKS[id].gridY + 1 },
                  data.status,
                  data.task,
                  data.slice_id
                )
              }
            }
          }
          setActiveCount(count)
        }
      })
      .catch(() => {})

    const unsubscribe = win.nexusTelemetry.onEvent((event: any) => {
      if (event && event.type === 'agent_slice') {
        const payload = event.data
        const id = payload.agent_id as AgentId
        if (agentsRef.current[id]) {
          dispatchAgentMovement(
            id,
            { x: DESKS[id].gridX, y: DESKS[id].gridY + 1 },
            payload.status,
            payload.task_summary,
            payload.slice_id
          )
          setLastEventTime(new Date().toLocaleTimeString())
        }
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [dispatchAgentMovement])

  // 60 FPS Render & Physics Simulation Loop
  useEffect(() => {
    let animId: number
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let autonomousTick = 0

    const render = () => {
      if (!isPaused) {
        autonomousTick++

        // Autonomous Lifecycle: Keep agents dynamically active
        if (autonomousTick % 360 === 0) {
          // Every ~6 seconds, pick a random agent and assign a new realistic task or waypoint
          const agentIds: AgentId[] = ['DEV-01', 'SYS-01', 'SCOUT-01', 'SEC-01', 'OPS-01']
          const pick = agentIds[Math.floor(Math.random() * agentIds.length)]
          const ag = agentsRef.current[pick]
          if (ag && ag.path.length === 0) {
            const isAtDesk = ag.gridX === DESKS[pick].gridX && ag.gridY === DESKS[pick].gridY + 1
            if (isAtDesk) {
              // Walk to Dispatch Hub or Lounge
              const targets = [
                { x: DISPATCH_HUB.x + 1, y: DISPATCH_HUB.y + 2 },
                { x: SERVER_RACK.x, y: SERVER_RACK.y + 2 },
                { x: LOUNGE_AREA.x + 1, y: LOUNGE_AREA.y + 1 }
              ]
              const tgt = targets[Math.floor(Math.random() * targets.length)]
              const tasks = AGENT_TASKS[pick]
              const task = tasks[Math.floor(Math.random() * tasks.length)]
              dispatchAgentMovement(pick, tgt, 'EXECUTING', task, `slc_${pick.toLowerCase()}_transit`)
            } else {
              // Return to desk to continue work
              const desk = DESKS[pick]
              const tasks = AGENT_TASKS[pick]
              dispatchAgentMovement(
                pick,
                { x: desk.gridX, y: desk.gridY + 1 },
                'EXECUTING',
                tasks[0],
                `slc_${pick.toLowerCase()}_desk`
              )
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // 1. Cyber Dark Pixel Floor & Grid (#090d16 background, #1e293b grid lines)
      // -----------------------------------------------------------------------
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // Solid Cyber Background #090d16
      ctx.fillStyle = '#090d16'
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      // 32px Grid Lines #1e293b
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 1

      // Vertical lines
      for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
        ctx.beginPath()
        ctx.moveTo(x + 0.5, 0)
        ctx.lineTo(x + 0.5, CANVAS_HEIGHT)
        ctx.stroke()
      }

      // Horizontal lines
      for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
        ctx.beginPath()
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(CANVAS_WIDTH, y + 0.5)
        ctx.stroke()
      }

      // Sub-pixel crosshair dots at intersections
      ctx.fillStyle = '#334155'
      for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
        for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
          ctx.fillRect(x - 1, y - 1, 2, 2)
        }
      }

      // Ambient Cyber Circuit Decal / Conduit Lines connecting workstations
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      // Bus line across desks
      ctx.moveTo(3 * TILE_SIZE, 4 * TILE_SIZE + 16)
      ctx.lineTo(21 * TILE_SIZE, 4 * TILE_SIZE + 16)
      // Connection down to Central Dispatch
      ctx.moveTo(13 * TILE_SIZE, 4 * TILE_SIZE + 16)
      ctx.lineTo(13 * TILE_SIZE, 8 * TILE_SIZE)
      ctx.stroke()
      ctx.setLineDash([])

      // Outer Perimeter Security Border with Neon Brackets
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2
      ctx.strokeRect(16, 16, CANVAS_WIDTH - 32, CANVAS_HEIGHT - 32)

      // Neon Cyan Corner Accents
      ctx.strokeStyle = '#00f0ff'
      ctx.lineWidth = 2
      // Top-Left
      ctx.beginPath()
      ctx.moveTo(16, 28)
      ctx.lineTo(16, 16)
      ctx.lineTo(28, 16)
      ctx.stroke()
      // Top-Right
      ctx.beginPath()
      ctx.moveTo(CANVAS_WIDTH - 28, 16)
      ctx.lineTo(CANVAS_WIDTH - 16, 16)
      ctx.lineTo(CANVAS_WIDTH - 16, 28)
      ctx.stroke()
      // Bottom-Left
      ctx.beginPath()
      ctx.moveTo(16, CANVAS_HEIGHT - 28)
      ctx.lineTo(16, CANVAS_HEIGHT - 16)
      ctx.lineTo(28, CANVAS_HEIGHT - 16)
      ctx.stroke()
      // Bottom-Right
      ctx.beginPath()
      ctx.moveTo(CANVAS_WIDTH - 28, CANVAS_HEIGHT - 16)
      ctx.lineTo(CANVAS_WIDTH - 16, CANVAS_HEIGHT - 16)
      ctx.lineTo(CANVAS_WIDTH - 16, CANVAS_HEIGHT - 28)
      ctx.stroke()

      // -----------------------------------------------------------------------
      // 2. Render Workstation Desks (#334155) for Agents
      // -----------------------------------------------------------------------
      for (const d of Object.values(DESKS)) {
        const dx = d.gridX * TILE_SIZE
        const dy = d.gridY * TILE_SIZE
        const deskW = 2 * TILE_SIZE // 64px
        const deskH = TILE_SIZE // 32px

        // Desk Chair in #1e293b
        ctx.fillStyle = '#1e293b'
        ctx.fillRect(dx + 22, dy + 28, 20, 10)
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 1
        ctx.strokeRect(dx + 22, dy + 28, 20, 10)

        // Workstation Desk Surface #334155
        ctx.fillStyle = '#334155'
        ctx.fillRect(dx, dy, deskW, deskH)
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1.5
        ctx.strokeRect(dx, dy, deskW, deskH)

        // Accent edge highlight in agent color
        ctx.fillStyle = d.color
        ctx.fillRect(dx, dy + deskH - 2, deskW, 2)

        // Dual Monitors on Workstation Desk
        // Primary Screen (Left)
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(dx + 8, dy + 4, 22, 16)
        ctx.strokeStyle = d.color
        ctx.lineWidth = 1
        ctx.strokeRect(dx + 8, dy + 4, 22, 16)
        // Screen code glow lines
        ctx.fillStyle = d.color
        ctx.fillRect(dx + 11, dy + 8, 16, 2)
        ctx.fillRect(dx + 11, dy + 12, 12, 2)

        // Secondary Screen (Right)
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(dx + 34, dy + 4, 22, 16)
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1
        ctx.strokeRect(dx + 34, dy + 4, 22, 16)
        // Secondary screen telemetry pulse
        ctx.fillStyle = '#10b981'
        ctx.fillRect(dx + 37, dy + 10, 8, 2)
        ctx.fillRect(dx + 46, dy + 8, 7, 4)

        // Monitor Stand
        ctx.fillStyle = '#1e293b'
        ctx.fillRect(dx + 17, dy + 20, 4, 4)
        ctx.fillRect(dx + 43, dy + 20, 4, 4)

        // Workstation Chassis / Tower on Floor
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(dx + deskW - 8, dy + 8, 6, 18)
        ctx.fillStyle = d.color
        ctx.fillRect(dx + deskW - 6, dy + 10, 2, 2)

        // Desk Agent Name Badge Plate
        ctx.fillStyle = '#090d16'
        ctx.fillRect(dx + 6, dy - 10, 52, 12)
        ctx.strokeStyle = '#334155'
        ctx.lineWidth = 1
        ctx.strokeRect(dx + 6, dy - 10, 52, 12)

        ctx.fillStyle = d.color
        ctx.font = 'bold 8px monospace'
        ctx.fillText(d.id, dx + 10, dy - 1)
      }

      // -----------------------------------------------------------------------
      // 3. Central Holographic Dispatch Hub (Workstation Surface in #334155)
      // -----------------------------------------------------------------------
      const disX = DISPATCH_HUB.x * TILE_SIZE
      const disY = DISPATCH_HUB.y * TILE_SIZE
      const disW = 3 * TILE_SIZE
      const disH = 2 * TILE_SIZE

      ctx.fillStyle = '#334155'
      ctx.fillRect(disX, disY, disW, disH)
      ctx.strokeStyle = '#00f0ff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(disX, disY, disW, disH)

      // Holographic Core Emitter Ring
      const pulseSize = Math.sin(autonomousTick * 0.05) * 4
      ctx.strokeStyle = '#00f0ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(disX + disW / 2, disY + disH / 2, 16 + pulseSize, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = '#090d16'
      ctx.beginPath()
      ctx.arc(disX + disW / 2, disY + disH / 2, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#38bdf8'
      ctx.stroke()

      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 8px monospace'
      ctx.fillText('DISPATCH HUB', disX + 16, disY + 12)
      ctx.fillStyle = '#64748b'
      ctx.font = '7px monospace'
      ctx.fillText('NEXUS MESH // ROUTER', disX + 8, disY + disH - 4)

      // -----------------------------------------------------------------------
      // 4. Server Mainframe Rack (#334155 & #1e293b)
      // -----------------------------------------------------------------------
      const srvX = SERVER_RACK.x * TILE_SIZE
      const srvY = SERVER_RACK.y * TILE_SIZE
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(srvX, srvY, 2 * TILE_SIZE, 2 * TILE_SIZE)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1.5
      ctx.strokeRect(srvX, srvY, 2 * TILE_SIZE, 2 * TILE_SIZE)

      // Server Blade Slots & Blinking LEDs
      for (let i = 0; i < 4; i++) {
        const slotY = srvY + 6 + i * 14
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(srvX + 4, slotY, 2 * TILE_SIZE - 8, 10)

        // Blinking Green / Amber LEDs
        const ledBlink = (autonomousTick + i * 15) % 30 > 15
        ctx.fillStyle = ledBlink ? '#10b981' : '#047857'
        ctx.fillRect(srvX + 8, slotY + 3, 4, 4)

        ctx.fillStyle = ledBlink ? '#38bdf8' : '#0369a1'
        ctx.fillRect(srvX + 16, slotY + 3, 4, 4)
      }
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 7px monospace'
      ctx.fillText('SQLITE WAL VEC', srvX + 4, srvY - 3)

      // -----------------------------------------------------------------------
      // 5. Architecture Whiteboard
      // -----------------------------------------------------------------------
      const wbX = WHITEBOARD.x * TILE_SIZE
      const wbY = WHITEBOARD.y * TILE_SIZE
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(wbX, wbY, 2 * TILE_SIZE, TILE_SIZE + 10)
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1
      ctx.strokeRect(wbX, wbY, 2 * TILE_SIZE, TILE_SIZE + 10)

      // Diagram sketch lines on whiteboard
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1
      ctx.strokeRect(wbX + 6, wbY + 6, 16, 12)
      ctx.strokeRect(wbX + 38, wbY + 6, 16, 12)
      ctx.beginPath()
      ctx.moveTo(wbX + 22, wbY + 12)
      ctx.lineTo(wbX + 38, wbY + 12)
      ctx.stroke()
      ctx.fillStyle = '#64748b'
      ctx.font = '7px monospace'
      ctx.fillText('SPEC ARCH', wbX + 8, wbY + 32)

      // -----------------------------------------------------------------------
      // 6. Cyber Lounge / Coffee Station (#334155 Counters)
      // -----------------------------------------------------------------------
      const lngX = LOUNGE_AREA.x * TILE_SIZE
      const lngY = LOUNGE_AREA.y * TILE_SIZE
      ctx.fillStyle = '#334155'
      ctx.fillRect(lngX, lngY, 3 * TILE_SIZE, TILE_SIZE)
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1.5
      ctx.strokeRect(lngX, lngY, 3 * TILE_SIZE, TILE_SIZE)

      // Coffee Maker & Water Cooler
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(lngX + 8, lngY + 4, 16, 22)
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(lngX + 12, lngY + 16, 8, 8) // Coffee pot

      // Steaming Vapor particle
      const steamY = lngY + 2 - ((autonomousTick * 0.5) % 6)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.fillRect(lngX + 15, steamY, 2, 2)

      // Water Cooler
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(lngX + 36, lngY + 4, 12, 14)
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(lngX + 34, lngY + 18, 16, 10)

      // Breakroom Live Seat Counters (idle/total)
      const allAgentsList = Object.values(agentsRef.current)
      const idleCount = allAgentsList.filter((ag) => ag.status === 'IDLE').length
      const totalCount = allAgentsList.length

      for (let s = 0; s < 4; s++) {
        const sx = lngX + 6 + s * 22
        const sy = lngY + TILE_SIZE + 3
        ctx.fillStyle = s < idleCount ? '#10b981' : '#1e293b'
        ctx.fillRect(sx, sy, 14, 8)
        ctx.strokeStyle = s < idleCount ? '#34d399' : '#475569'
        ctx.lineWidth = 1
        ctx.strokeRect(sx, sy, 14, 8)
      }

      ctx.fillStyle = idleCount > 0 ? '#34d399' : '#94a3b8'
      ctx.font = 'bold 8px monospace'
      ctx.fillText(`BREAKROOM // [${idleCount}/${totalCount} IDLE]`, lngX + 4, lngY - 4)

      // -----------------------------------------------------------------------
      // 7. Update & Render Active Sub-Agents (Pixel-Art Sprites & Animation)
      // -----------------------------------------------------------------------
      const agents = allAgentsList
      let currentActive = 0

      for (const ag of agents) {
        if (ag.status === 'EXECUTING' || ag.status === 'ASSIGNED') {
          currentActive++
        }

        // Smooth Movement Interpolation between waypoints
        if (ag.path.length > 0 && !isPaused) {
          const nextWaypoint = ag.path[0]
          const targetPxX = nextWaypoint.x * TILE_SIZE
          const targetPxY = nextWaypoint.y * TILE_SIZE

          const dx = targetPxX - ag.pixelX
          const dy = targetPxY - ag.pixelY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const moveSpeed = 2.4 // Pixels per frame

          // Update facing direction
          if (Math.abs(dx) > Math.abs(dy)) {
            ag.facing = dx > 0 ? 'right' : 'left'
          } else if (Math.abs(dy) > 0.1) {
            ag.facing = dy > 0 ? 'down' : 'up'
          }

          ag.walkCycle = (ag.walkCycle + 0.25) % 4

          if (dist <= moveSpeed) {
            ag.pixelX = targetPxX
            ag.pixelY = targetPxY
            ag.gridX = nextWaypoint.x
            ag.gridY = nextWaypoint.y
            ag.path.shift()

            // If arrived at final target
            if (ag.path.length === 0) {
              const desk = DESKS[ag.id]
              const isAtDesk = ag.gridX === desk.gridX && ag.gridY === desk.gridY + 1
              if (isAtDesk) {
                ag.facing = 'up'
                ag.status = 'EXECUTING'
              }
            }
          } else {
            ag.pixelX += (dx / dist) * moveSpeed
            ag.pixelY += (dy / dist) * moveSpeed
          }
        }

        const desk = DESKS[ag.id]
        const isExecuting = ag.status === 'EXECUTING'
        const isMoving = ag.path.length > 0
        const isAtDesk = ag.gridX === desk.gridX && ag.gridY === desk.gridY + 1

        if (isAtDesk && !isMoving && !isPaused) {
          ag.typingFrame = (ag.typingFrame + 0.15) % 4
        }

        // Draw Pixel-Art Character Body
        ctx.save()
        ctx.translate(ag.pixelX + 6, ag.pixelY + 4)

        // Active Glow Aura
        if (isExecuting) {
          ctx.shadowColor = desk.color
          ctx.shadowBlur = 10
        }

        // Head (12x10)
        ctx.fillStyle = desk.color
        ctx.fillRect(4, 0, 12, 10)

        // Visor / Eyes
        ctx.fillStyle = '#020617'
        if (ag.facing === 'left') {
          ctx.fillRect(3, 3, 5, 3)
          ctx.fillStyle = '#00f0ff'
          ctx.fillRect(4, 4, 3, 2)
        } else if (ag.facing === 'right') {
          ctx.fillRect(12, 3, 5, 3)
          ctx.fillStyle = '#00f0ff'
          ctx.fillRect(13, 4, 3, 2)
        } else if (ag.facing === 'up') {
          // Back of head cyber node
          ctx.fillStyle = desk.secondaryColor
          ctx.fillRect(7, 2, 6, 4)
        } else {
          // Down / Front facing visor
          ctx.fillRect(6, 3, 8, 3)
          ctx.fillStyle = '#00f0ff'
          ctx.fillRect(7, 4, 6, 2)
        }

        // Torso / Cyber Jacket (16x12)
        ctx.fillStyle = isExecuting ? desk.secondaryColor : '#334155'
        ctx.fillRect(2, 10, 16, 11)

        // Shoulder Armor Pads
        ctx.fillStyle = desk.color
        ctx.fillRect(0, 10, 3, 5)
        ctx.fillRect(17, 10, 3, 5)

        // Animated Hands / Typing at Desk or Stride while walking
        if (isAtDesk && !isMoving) {
          // Typing motion
          const handYOffset = Math.sin(ag.typingFrame * Math.PI) * 2
          ctx.fillStyle = '#e2e8f0'
          ctx.fillRect(1, 14 + handYOffset, 3, 3)
          ctx.fillRect(16, 14 - handYOffset, 3, 3)

          // Keystroke spark particles
          if (autonomousTick % 4 === 0) {
            ctx.fillStyle = desk.color
            ctx.fillRect(8 + Math.sin(autonomousTick) * 4, 15, 2, 2)
          }
        } else if (isMoving) {
          // Walking Legs Animation
          const legPhase = Math.floor(ag.walkCycle)
          ctx.fillStyle = '#1e293b'
          if (legPhase === 0 || legPhase === 2) {
            ctx.fillRect(4, 21, 4, 6)
            ctx.fillRect(12, 21, 4, 6)
          } else if (legPhase === 1) {
            ctx.fillRect(3, 20, 4, 7) // Left step forward
            ctx.fillRect(13, 22, 4, 5)
          } else {
            ctx.fillRect(3, 22, 4, 5)
            ctx.fillRect(13, 20, 4, 7) // Right step forward
          }
        } else {
          // Standing Legs
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(4, 21, 4, 6)
          ctx.fillRect(12, 21, 4, 6)
        }

        ctx.restore()

        // ---------------------------------------------------------------------
        // 8. Speech Bubbles Displaying Agent Name & Live Task States
        // ---------------------------------------------------------------------
        // Requirements: "speech bubbles displaying agent name and live task states
        // (e.g. 'Writing AST Edit', 'Polling Win32 UIA', 'Web Ingest Active')"
        const statusSummary = ag.taskSummary || (ag.status === 'IDLE' ? 'Breakroom Standby' : '')
        if (statusSummary) {
          const taskText =
            statusSummary.length > 34 ? statusSummary.slice(0, 32) + '...' : statusSummary

          ctx.font = 'bold 9px monospace'
          const nameWidth = ctx.measureText(ag.id + ': ').width
          const taskWidth = ctx.measureText(taskText).width
          const totalTextWidth = nameWidth + taskWidth
          const bubbleWidth = Math.max(totalTextWidth + 24, 130)
          const bubbleHeight = 22

          // Position bubble centered above agent head with boundary clamping
          let bx = ag.pixelX + 16 - bubbleWidth / 2
          let by = ag.pixelY - 30

          // Clamp inside canvas bounds
          if (bx < 8) bx = 8
          if (bx + bubbleWidth > CANVAS_WIDTH - 8) bx = CANVAS_WIDTH - bubbleWidth - 8
          if (by < 8) by = ag.pixelY + 36 // Flip below if too high

          // Draw Speech Bubble Background (#090d16 with glowing border)
          ctx.fillStyle = '#090d16'
          ctx.fillRect(bx, by, bubbleWidth, bubbleHeight)
          ctx.strokeStyle = desk.color
          ctx.lineWidth = 1.2
          ctx.strokeRect(bx, by, bubbleWidth, bubbleHeight)

          // Pointer Triangle
          ctx.beginPath()
          if (by < ag.pixelY) {
            // Pointer facing down
            ctx.moveTo(ag.pixelX + 12, by + bubbleHeight)
            ctx.lineTo(ag.pixelX + 16, by + bubbleHeight + 5)
            ctx.lineTo(ag.pixelX + 20, by + bubbleHeight)
          } else {
            // Pointer facing up
            ctx.moveTo(ag.pixelX + 12, by)
            ctx.lineTo(ag.pixelX + 16, by - 5)
            ctx.lineTo(ag.pixelX + 20, by)
          }
          ctx.fillStyle = '#090d16'
          ctx.fill()
          ctx.strokeStyle = desk.color
          ctx.stroke()

          // Pulsing Activity Dot
          const dotPulsing = Math.sin(autonomousTick * 0.1) > 0
          ctx.fillStyle = dotPulsing ? '#10b981' : '#38bdf8'
          ctx.beginPath()
          ctx.arc(bx + 8, by + 11, 3, 0, Math.PI * 2)
          ctx.fill()

          // Draw Agent Name (in accent color)
          ctx.fillStyle = desk.color
          ctx.font = 'bold 9px monospace'
          ctx.fillText(ag.id, bx + 16, by + 14)

          // Draw Live Task State text
          ctx.fillStyle = '#f8fafc'
          ctx.font = '9px monospace'
          ctx.fillText(taskText, bx + 16 + nameWidth, by + 14)
        }
      }

      setActiveCount(currentActive)
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animId)
    }
  }, [isObstacle, isPaused, dispatchAgentMovement])

  // Canvas Click Handler: Select Specialist Agent / Workstation & Open Telemetry Drawer
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const clickX = (e.clientX - rect.left) * scaleX
    const clickY = (e.clientY - rect.top) * scaleY

    for (const ag of Object.values(agentsRef.current)) {
      if (
        clickX >= ag.pixelX - 10 &&
        clickX <= ag.pixelX + 36 &&
        clickY >= ag.pixelY - 10 &&
        clickY <= ag.pixelY + 36
      ) {
        setSelectedAgent(ag.id)
        setSelectedStation(ag.id)
        return
      }
    }

    // Check Central Hub click
    if (
      clickX >= DISPATCH_HUB.x * TILE_SIZE - 8 &&
      clickX <= (DISPATCH_HUB.x + 3) * TILE_SIZE + 8 &&
      clickY >= DISPATCH_HUB.y * TILE_SIZE - 8 &&
      clickY <= (DISPATCH_HUB.y + 2) * TILE_SIZE + 8
    ) {
      setSelectedStation('CENTRAL_HUB')
      setSelectedAgent(null)
      return
    }

    // Check Sovereign Edge / Server Rack click
    if (
      clickX >= SERVER_RACK.x * TILE_SIZE - 8 &&
      clickX <= (SERVER_RACK.x + 2) * TILE_SIZE + 8 &&
      clickY >= SERVER_RACK.y * TILE_SIZE - 8 &&
      clickY <= (SERVER_RACK.y + 2) * TILE_SIZE + 8
    ) {
      setSelectedStation('SOVEREIGN_EDGE')
      setSelectedAgent(null)
      return
    }

    // Check Breakroom / Lounge click
    if (
      clickX >= LOUNGE_AREA.x * TILE_SIZE - 8 &&
      clickX <= (LOUNGE_AREA.x + 3) * TILE_SIZE + 8 &&
      clickY >= LOUNGE_AREA.y * TILE_SIZE - 8 &&
      clickY <= (LOUNGE_AREA.y + 2) * TILE_SIZE + 8
    ) {
      setSelectedStation('BREAKROOM')
      setSelectedAgent(null)
      return
    }

    // Check Workstation Desks click
    for (const d of Object.values(DESKS)) {
      if (
        clickX >= d.gridX * TILE_SIZE - 8 &&
        clickX <= (d.gridX + 2) * TILE_SIZE + 8 &&
        clickY >= d.gridY * TILE_SIZE - 8 &&
        clickY <= (d.gridY + 1) * TILE_SIZE + 8
      ) {
        setSelectedAgent(d.id)
        setSelectedStation(d.id)
        return
      }
    }
  }

  const selectedStationData = useMemo(() => {
    if (!selectedStation) return null

    if (selectedStation === 'CENTRAL_HUB') {
      return {
        id: 'CENTRAL_HUB' as StationId,
        name: 'Central Hub',
        role: 'Nexus Mesh Router & Slice Dispatcher',
        color: '#00F0FF',
        status: 'ONLINE',
        task: 'Routing mesh task slices across 5 agents',
        sliceId: 'mesh_dispatch_hub_active',
        gridPos: `(${DISPATCH_HUB.x}, ${DISPATCH_HUB.y})`,
        isPoi: true
      }
    }
    if (selectedStation === 'SOVEREIGN_EDGE') {
      return {
        id: 'SOVEREIGN_EDGE' as StationId,
        name: 'Sovereign Edge',
        role: 'SQLite WAL (FTS5 + VEC) Mesh & Local Runtimes',
        color: '#A855F7',
        status: 'SYNCHRONIZED',
        task: 'WAL mode active, 384-dim vector embeddings healthy',
        sliceId: 'wal_vec_mainframe_sync',
        gridPos: `(${SERVER_RACK.x}, ${SERVER_RACK.y})`,
        isPoi: true
      }
    }
    if (selectedStation === 'BREAKROOM') {
      const allList = Object.values(agentsRef.current)
      const idleCount = allList.filter((ag) => ag.status === 'IDLE').length
      return {
        id: 'BREAKROOM' as StationId,
        name: 'Breakroom',
        role: 'Standby / Energy Replenishment Lounge',
        color: '#34D399',
        status: `${idleCount}/${allList.length} IDLE`,
        task: `${idleCount} specialist agents currently on standby in breakroom`,
        sliceId: 'breakroom_standby_pool',
        gridPos: `(${LOUNGE_AREA.x}, ${LOUNGE_AREA.y})`,
        isPoi: true
      }
    }

    const ag = agentsRef.current[selectedStation as AgentId]
    const desk = DESKS[selectedStation as AgentId]
    if (!ag || !desk) return null
    return {
      id: selectedStation,
      name: desk.name,
      role: desk.role,
      color: desk.color,
      status: ag.status,
      task: ag.taskSummary,
      sliceId: ag.sliceId,
      gridPos: `(${ag.gridX}, ${ag.gridY})`,
      pathLen: ag.path.length,
      isPoi: false
    }
  }, [selectedStation])

  return (
    <div className="relative w-full h-full flex flex-col bg-[#050811] rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl">
      {/* Top Header Control Bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-b from-[#090d16] to-[#070b14] border-b border-slate-800/80 z-20">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs font-bold tracking-widest text-slate-100 uppercase font-mono">
                AgentTown // Autonomous Workspace
              </h2>
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-sky-500/10 border border-sky-500/30 text-sky-300 rounded">
                800x500 • 32px Grid
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center space-x-2 font-mono">
              <span className="text-emerald-400 font-bold">{activeCount}/5 Active Specialists</span>
              <span>•</span>
              <span>A* Pathfinding</span>
              <span>•</span>
              <span className="text-slate-500">Updated: {lastEventTime}</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Dispatch Mission Slices Button */}
          <button
            onClick={() => dispatchWorkstationSlice()}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-sky-500/15 border border-sky-500/40 text-sky-300 hover:bg-sky-500/25 transition-all shadow-sm"
            title="Dispatch live slices to all agents via POST /api/slices/dispatch"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Dispatch Slices</span>
          </button>

          {/* Reset to Desks Button */}
          <button
            onClick={resetToWorkstations}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
            title="Reset all agents to workstation desks"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Pause / Play Toggle */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded-lg border transition-all ${
              isPaused
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <div className="flex items-center space-x-1.5 text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span>60 FPS</span>
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport Container */}
      <div className="relative flex-1 flex items-center justify-center p-3 bg-[#050811] overflow-hidden">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          className="rounded-xl border border-slate-800 shadow-2xl cursor-pointer bg-[#090d16]"
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            maxWidth: '100%',
            aspectRatio: '800 / 500'
          }}
        />

        {/* Selected Station / Agent Telemetry Inspector Drawer */}
        {selectedStation && selectedStationData && (
          <div className="absolute right-5 top-5 bottom-5 w-80 z-30 bg-[#090d16]/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/80">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedStationData.color }}
                />
                <span className="text-xs font-bold font-mono text-slate-100 tracking-wider">
                  TELEMETRY // {selectedStationData.id}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedStation(null)
                  setSelectedAgent(null)
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-slate-300 space-y-3.5">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Designation</div>
                <div className="font-bold text-slate-100 text-sm">{selectedStationData.name}</div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase">Specialization</div>
                <div
                  className="font-medium text-xs mt-0.5"
                  style={{ color: selectedStationData.color }}
                >
                  {selectedStationData.role}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase">Execution Status</div>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center space-x-1.5 px-2 py-0.5 text-[10px] font-bold rounded border ${
                      selectedStationData.status === 'EXECUTING' || selectedStationData.status === 'ONLINE' || selectedStationData.status === 'SYNCHRONIZED'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                        : selectedStationData.status === 'ASSIGNED'
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{selectedStationData.status}</span>
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase">Live Task State</div>
                <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-slate-200 text-[11px] mt-1 font-mono leading-relaxed">
                  {selectedStationData.task}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase">Active Slice ID</div>
                <div className="text-emerald-400/90 text-[11px] font-mono truncate mt-0.5">
                  {selectedStationData.sliceId || 'none'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-slate-950/60 border border-slate-800 rounded">
                  <div className="text-[9px] text-slate-500">GRID TILE</div>
                  <div className="text-slate-300 font-bold">{selectedStationData.gridPos}</div>
                </div>
                <div className="p-2 bg-slate-950/60 border border-slate-800 rounded">
                  <div className="text-[9px] text-slate-500">WAYPOINTS</div>
                  <div className="text-slate-300 font-bold">
                    {typeof selectedStationData.pathLen === 'number'
                      ? `${selectedStationData.pathLen} in queue`
                      : 'Static Node'}
                  </div>
                </div>
              </div>

              {/* Action Buttons for Selected Workstation / Agent */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <div className="text-[10px] text-slate-500 uppercase">Workstation Directives</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => dispatchWorkstationSlice(selectedStation in DESKS ? (selectedStation as AgentId) : undefined)}
                    className="p-1.5 text-[10px] rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 transition-all text-center cursor-pointer"
                    title="Dispatch live slice via POST /api/slices/dispatch"
                  >
                    Dispatch Slice
                  </button>
                  {selectedStation in DESKS ? (
                    <>
                      <button
                        onClick={() => {
                          const id = selectedStation as AgentId
                          const desk = DESKS[id]
                          dispatchAgentMovement(
                            id,
                            { x: desk.gridX, y: desk.gridY + 1 },
                            'EXECUTING',
                            AGENT_TASKS[id][0],
                            `slc_${id.toLowerCase()}_desk`
                          )
                        }}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        Return to Desk
                      </button>
                      <button
                        onClick={() => {
                          const id = selectedStation as AgentId
                          dispatchAgentMovement(
                            id,
                            { x: DISPATCH_HUB.x + 1, y: DISPATCH_HUB.y + 2 },
                            'EXECUTING',
                            'Submitting Slice Deliverable',
                            `slc_${id.toLowerCase()}_hub`
                          )
                        }}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        Walk to Hub
                      </button>
                      <button
                        onClick={() => {
                          const id = selectedStation as AgentId
                          dispatchAgentMovement(
                            id,
                            { x: LOUNGE_AREA.x + 1, y: LOUNGE_AREA.y + 1 },
                            'IDLE',
                            'Recharging at Coffee Station',
                            `slc_${id.toLowerCase()}_coffee`
                          )
                        }}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        Send to Lounge
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => resetToWorkstations()}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        Reset All Desks
                      </button>
                      <button
                        onClick={() => {
                          ;(Object.keys(DESKS) as AgentId[]).forEach((id, idx) => {
                            dispatchAgentMovement(
                              id,
                              { x: DISPATCH_HUB.x + (idx % 3), y: DISPATCH_HUB.y + 2 },
                              'EXECUTING',
                              'Swarm Huddle at Central Hub',
                              `slc_${id.toLowerCase()}_huddle`
                            )
                          })
                        }}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        Huddle at Hub
                      </button>
                      <button
                        onClick={() => {
                          ;(Object.keys(DESKS) as AgentId[]).forEach((id, idx) => {
                            dispatchAgentMovement(
                              id,
                              { x: LOUNGE_AREA.x + (idx % 3), y: LOUNGE_AREA.y + 1 },
                              'IDLE',
                              'Breakroom Standby & Recharge',
                              `slc_${id.toLowerCase()}_break`
                            )
                          })
                        }}
                        className="p-1.5 text-[10px] rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all text-center cursor-pointer"
                      >
                        All to Breakroom
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Specialist Legend & Status: All 8 Workstations Selectable with Zero Truncation */}
      <div className="px-5 py-2.5 bg-[#090d16] border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400 z-20 overflow-x-auto">
        <div className="flex items-center space-x-3 whitespace-nowrap">
          {ALL_WORKSTATIONS.map((station) => {
            const isSel = selectedStation === station.id
            return (
              <button
                key={station.id}
                onClick={() => {
                  setSelectedStation(station.id)
                  if (station.id in DESKS) setSelectedAgent(station.id as AgentId)
                  else setSelectedAgent(null)
                }}
                className={`flex items-center space-x-1.5 px-2 py-0.5 rounded transition-all cursor-pointer ${
                  isSel
                    ? 'text-slate-100 font-bold bg-slate-800/90 border border-slate-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: station.color }}
                />
                <span>{station.name}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center space-x-3 text-slate-500 whitespace-nowrap pl-4">
          <span>Click sprite or workstation to inspect</span>
          <span>•</span>
          <span className="text-emerald-400">All 8 Workstations Selectable</span>
        </div>
      </div>
    </div>
  )
}
export default AgentTownCanvas
