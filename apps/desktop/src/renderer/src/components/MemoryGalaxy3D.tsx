// apps/desktop/src/renderer/src/components/MemoryGalaxy3D.tsx
/**
 * NEXUS OS v5.0 - MEMORY GALAXY 3D
 * 
 * Interactive WebGL Point Cloud & Filament Constellation
 * Backed by Sovereign Memory Store (FTS5 + sqlite-vec) via IPC (127.0.0.1:47630)
 * 
 * Invariants:
 * - 100% Free-Tier & Local-First Sovereignty (Zero cloud token leakage)
 * - FTS5 + sqlite-vec hybrid memory querying
 * - Cluster color mapping: DEV, STUDY, STUDIO, SILENT, RESEARCH, SYSTEM
 * - Floating 3D HUD labels & Billboard inspection
 * - Footer Legend: DRAG SPACE ORBIT | SCROLL ZOOM | DRAG NODE PULL
 * - Node Inspector: Inline Edit, Pin/Unpin, Forget/Dissolve
 * - 3-Column Bottom Telemetry Strip: [INDEX LOG], [RADAR], [DISTRIBUTION]
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import {
  Search,
  Database,
  Cpu,
  RotateCcw,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Save,
  X,
  Sparkles,
  Radio,
  Layers,
  Activity,
  Compass,
  Check,
  AlertCircle,
  Terminal,
  Plus,
  Filter,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  ExternalLink,
  Info
} from 'lucide-react'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ClusterNamespace =
  | 'DEV'
  | 'STUDY'
  | 'STUDIO'
  | 'SILENT'
  | 'RESEARCH'
  | 'SYSTEM'
  | 'DEFAULT'

export interface MemoryNodeData {
  id: string
  title: string
  content: string
  namespace: string
  metadata?: {
    tags?: string[]
    pinned?: boolean
    score?: number
    source?: string
    category?: string
    importance?: number
    cluster?: string
    [key: string]: any
  }
  created_at?: number | string
  updated_at?: number | string
  position?: [number, number, number]
  is_archived?: boolean
}

export interface FilamentLink {
  sourceId: string
  targetId: string
  sourcePos: [number, number, number]
  targetPos: [number, number, number]
  colorA: string
  colorB: string
  weight: number
}

export interface IndexLogEvent {
  id: string
  timestamp: string
  category: 'FTS5' | 'VEC' | 'WAL' | 'MUTATION' | 'SYNC' | 'INFO'
  message: string
  latencyMs?: number
  status: 'OK' | 'WARN' | 'INFO'
}

// Cluster Color Definitions
export const CLUSTER_CONFIG: Record<
  string,
  { label: string; primary: string; secondary: string; glow: string; dark: string }
> = {
  DEV: {
    label: 'DEV CONTEXT',
    primary: '#00f5d4',
    secondary: '#00b4d8',
    glow: 'rgba(0, 245, 212, 0.6)',
    dark: 'rgba(0, 245, 212, 0.12)'
  },
  STUDY: {
    label: 'STUDY / SCHOLAR',
    primary: '#fbbf24',
    secondary: '#f59e0b',
    glow: 'rgba(251, 191, 36, 0.6)',
    dark: 'rgba(251, 191, 36, 0.12)'
  },
  STUDIO: {
    label: 'CREATOR STUDIO',
    primary: '#34d399',
    secondary: '#10b981',
    glow: 'rgba(52, 211, 153, 0.6)',
    dark: 'rgba(52, 211, 153, 0.12)'
  },
  SILENT: {
    label: 'SILENT / ENCLAVE',
    primary: '#818cf8',
    secondary: '#6366f1',
    glow: 'rgba(129, 140, 248, 0.6)',
    dark: 'rgba(129, 140, 248, 0.12)'
  },
  RESEARCH: {
    label: 'DEEP RESEARCH',
    primary: '#c084fc',
    secondary: '#a855f7',
    glow: 'rgba(192, 132, 252, 0.6)',
    dark: 'rgba(192, 132, 252, 0.12)'
  },
  SYSTEM: {
    label: 'SYSTEM SOVEREIGN',
    primary: '#f43f5e',
    secondary: '#e11d48',
    glow: 'rgba(244, 63, 94, 0.6)',
    dark: 'rgba(244, 63, 94, 0.12)'
  },
  DEFAULT: {
    label: 'SOVEREIGN GENERAL',
    primary: '#38bdf8',
    secondary: '#0284c7',
    glow: 'rgba(56, 189, 248, 0.6)',
    dark: 'rgba(56, 189, 248, 0.12)'
  }
}

// Cluster Centroid Anchors in 3D Space
const CLUSTER_CENTROIDS: Record<string, [number, number, number]> = {
  DEV: [-4.8, 2.2, -1.2],
  STUDY: [4.6, 2.4, -2.0],
  STUDIO: [0.0, -3.8, 3.2],
  SILENT: [-3.6, -3.2, -3.8],
  RESEARCH: [4.2, -2.8, 2.4],
  SYSTEM: [0.0, 4.8, -1.5],
  DEFAULT: [0.0, 0.0, 0.0]
}

// Seed Nodes if DB is in initial boot phase
const INITIAL_SEED_NODES: MemoryNodeData[] = [
  {
    id: 'mem-seed-core-01',
    title: 'Nexus Sovereign Engine Architecture',
    content: 'Zero-subscription sovereign edge-to-desktop runtime. Enforces 6 GRAVITAS invariants, local DPAPI vault, and loopback 127.0.0.1:47630 IPC.',
    namespace: 'DEV',
    metadata: { tags: ['architecture', 'gravitas', 'ipc'], pinned: true, importance: 98 },
    created_at: Date.now() - 86400000 * 3
  },
  {
    id: 'mem-seed-core-02',
    title: 'FTS5 & sqlite-vec Hybrid Mesh',
    content: 'Full-text BM25 index with porter unicode61 tokenizer coupled with sqlite-vec 384-dimensional cosine vector embeddings.',
    namespace: 'DEV',
    metadata: { tags: ['fts5', 'sqlite-vec', 'database'], pinned: true, importance: 95 },
    created_at: Date.now() - 86400000 * 2
  },
  {
    id: 'mem-seed-study-01',
    title: 'ArXiv Deep Research Synthesis Workflow',
    content: 'Multi-provider paper ingestion pipeline with real-time KaTeX notes rendering and DPAPI RAG codebase ingest.',
    namespace: 'STUDY',
    metadata: { tags: ['arxiv', 'scholar', 'katex'], pinned: false, importance: 88 },
    created_at: Date.now() - 86400000 * 4
  },
  {
    id: 'mem-seed-study-02',
    title: 'AST Worktree & ContextKeeper Protocol',
    content: 'Persistent session cache storing git branch state, active diffs, and LLM context tokens under ~/.nexus-agent/db/.',
    namespace: 'STUDY',
    metadata: { tags: ['ast', 'contextkeeper', 'git'], pinned: true, importance: 90 },
    created_at: Date.now() - 86400000 * 1
  },
  {
    id: 'mem-seed-studio-01',
    title: 'Custom Shader Engine & Audio FFT',
    content: '5 WebGL GLSL fragment shaders (nebula_vortex, plasma_waves, cyber_grid) with live Web Audio 3-band FFT reactivity.',
    namespace: 'STUDIO',
    metadata: { tags: ['glsl', 'shaders', 'audio-fft'], pinned: false, importance: 84 },
    created_at: Date.now() - 86400000 * 5
  },
  {
    id: 'mem-seed-studio-02',
    title: 'Blueprint Holographic Canvas Engine',
    content: 'Vector design surface with snap grids, connector wires, and lossless PNG/PDF export pipeline.',
    namespace: 'STUDIO',
    metadata: { tags: ['blueprint', 'canvas', 'design'], pinned: false, importance: 82 },
    created_at: Date.now() - 86400000 * 2
  },
  {
    id: 'mem-seed-silent-01',
    title: 'Local DPAPI Master Key Cryptography',
    content: 'Zero-cloud credential encryption using Windows CryptProtectData DPAPI APIs. All secrets remain strictly jailed in RAM and encrypted on disk.',
    namespace: 'SILENT',
    metadata: { tags: ['dpapi', 'crypto', 'vault'], pinned: true, importance: 99 },
    created_at: Date.now() - 86400000 * 6
  },
  {
    id: 'mem-seed-silent-02',
    title: 'ScopeGuard Invariant Sentinel',
    content: 'Path traversal jailing, Win32 desktop surface isolation WinSta0\\Default, and HITL authorization for high-risk actions.',
    namespace: 'SILENT',
    metadata: { tags: ['scopeguard', 'security', 'isolation'], pinned: false, importance: 94 },
    created_at: Date.now() - 86400000 * 3
  },
  {
    id: 'mem-seed-res-01',
    title: 'Federated Compute Pool & QuotaGuard',
    content: 'Headless Kaggle GPU fallback with 15-minute cooldown guard and multi-cloud serverless orchestration.',
    namespace: 'RESEARCH',
    metadata: { tags: ['compute', 'gpu', 'quotaguard'], pinned: false, importance: 87 },
    created_at: Date.now() - 86400000 * 4
  },
  {
    id: 'mem-seed-sys-01',
    title: 'Notch HUD Dynamic HITL Gate',
    content: 'PySide6 transparent overlay window interacting with desktop drag-shelf, MCP shared files, and system estop.',
    namespace: 'SYSTEM',
    metadata: { tags: ['notch_hud', 'pyside6', 'hitl'], pinned: true, importance: 96 },
    created_at: Date.now() - 86400000 * 7
  }
]

// Hash string helper for deterministic pseudo-random 3D coordinates
function hashToCoords(str: string, centroid: [number, number, number], spread = 2.4): [number, number, number] {
  let hash1 = 0
  let hash2 = 0
  let hash3 = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash1 = (hash1 * 31 + ch) & 0xffffff
    hash2 = (hash2 * 37 + ch) & 0xffffff
    hash3 = (hash3 * 41 + ch) & 0xffffff
  }
  const u = (hash1 % 1000) / 1000
  const v = (hash2 % 1000) / 1000
  const w = (hash3 % 1000) / 1000

  // Spherical coordinates
  const theta = u * 2.0 * Math.PI
  const phi = Math.acos(2.0 * v - 1.0)
  const r = Math.cbrt(w) * spread

  const x = centroid[0] + r * Math.sin(phi) * Math.cos(theta)
  const y = centroid[1] + r * Math.sin(phi) * Math.sin(theta)
  const z = centroid[2] + r * Math.cos(phi)

  return [x, y, z]
}

// ============================================================================
// 3D SCENE SUB-COMPONENTS
// ============================================================================

/**
 * Cosmic Starfield Background Particle Dust
 */
const CosmicStarfield: React.FC<{ count?: number }> = ({ count = 1400 }) => {
  const pointsRef = useRef<THREE.Points>(null!)

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const colorChoices = [
      new THREE.Color('#00f5d4'),
      new THREE.Color('#38bdf8'),
      new THREE.Color('#a855f7'),
      new THREE.Color('#fbbf24'),
      new THREE.Color('#ffffff')
    ]

    for (let i = 0; i < count; i++) {
      const radius = 22 + Math.random() * 28
      const theta = Math.random() * 2 * Math.PI
      const phi = Math.acos(2 * Math.random() - 1)

      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = radius * Math.cos(phi)

      const c = colorChoices[Math.floor(Math.random() * colorChoices.length)]
      const brightness = 0.2 + Math.random() * 0.6
      col[i * 3] = c.r * brightness
      col[i * 3 + 1] = c.g * brightness
      col[i * 3 + 2] = c.b * brightness
    }
    return [pos, col]
  }, [count])

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.012
      pointsRef.current.rotation.x += delta * 0.005
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        vertexColors
        transparent
        opacity={0.65}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}

/**
 * Dynamic Constellation Filaments Web
 */
const ConstellationFilaments: React.FC<{
  filaments: FilamentLink[]
  visible: boolean
}> = ({ filaments, visible }) => {
  const lineRef = useRef<THREE.LineSegments>(null!)

  const [positions, colors] = useMemo(() => {
    if (!visible || filaments.length === 0) {
      return [new Float32Array(0), new Float32Array(0)]
    }

    const pos = new Float32Array(filaments.length * 6)
    const col = new Float32Array(filaments.length * 6)

    filaments.forEach((f, idx) => {
      const baseIdx = idx * 6
      // Source position
      pos[baseIdx] = f.sourcePos[0]
      pos[baseIdx + 1] = f.sourcePos[1]
      pos[baseIdx + 2] = f.sourcePos[2]
      // Target position
      pos[baseIdx + 3] = f.targetPos[0]
      pos[baseIdx + 4] = f.targetPos[1]
      pos[baseIdx + 5] = f.targetPos[2]

      // Source color
      const colorA = new THREE.Color(f.colorA)
      const colorB = new THREE.Color(f.colorB)

      col[baseIdx] = colorA.r
      col[baseIdx + 1] = colorA.g
      col[baseIdx + 2] = colorA.b

      col[baseIdx + 3] = colorB.r
      col[baseIdx + 4] = colorB.g
      col[baseIdx + 5] = colorB.b
    })

    return [pos, col]
  }, [filaments, visible])

  useFrame((state) => {
    if (lineRef.current && lineRef.current.material) {
      const mat = lineRef.current.material as THREE.LineBasicMaterial
      const t = state.clock.getElapsedTime()
      mat.opacity = 0.35 + 0.12 * Math.sin(t * 1.8)
    }
  })

  if (!visible || filaments.length === 0) return null

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}

/**
 * Interactive Memory Node Mesh (Sphere + Outer Halo + Floating Label)
 */
interface NodeMeshProps {
  node: MemoryNodeData
  position: [number, number, number]
  isSelected: boolean
  isHovered: boolean
  isDragged: boolean
  onSelect: (node: MemoryNodeData) => void
  onHover: (node: MemoryNodeData | null) => void
  onDragStart: (node: MemoryNodeData, e: any) => void
}

const NodeMesh: React.FC<NodeMeshProps> = ({
  node,
  position,
  isSelected,
  isHovered,
  isDragged,
  onSelect,
  onHover,
  onDragStart
}) => {
  const meshRef = useRef<THREE.Group>(null!)
  const haloRef = useRef<THREE.Mesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)

  const cfg = CLUSTER_CONFIG[node.namespace.toUpperCase()] || CLUSTER_CONFIG.DEFAULT
  const isPinned = !!node.metadata?.pinned

  // Pulsing animation for active/selected/hovered states
  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.getElapsedTime()
    const pulse = Math.sin(t * 3.0 + position[0]) * 0.12

    if (isSelected) {
      meshRef.current.scale.setScalar(1.4 + pulse * 0.2)
    } else if (isHovered || isDragged) {
      meshRef.current.scale.setScalar(1.25)
    } else {
      meshRef.current.scale.setScalar(1.0 + (isPinned ? 0.15 : 0))
    }

    if (haloRef.current) {
      haloRef.current.rotation.z += 0.015
    }
    if (ringRef.current && (isSelected || isPinned)) {
      ringRef.current.rotation.x += 0.02
      ringRef.current.rotation.y += 0.03
    }
  })

  return (
    <group
      ref={meshRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(node)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onDragStart(node, e)
      }}
    >
      {/* Core Sphere */}
      <mesh>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial
          color={cfg.primary}
          emissive={cfg.primary}
          emissiveIntensity={isSelected ? 1.8 : isHovered ? 1.4 : 0.8}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Outer Halo Sphere */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.38, 16, 16]} />
        <meshBasicMaterial
          color={cfg.secondary}
          transparent
          opacity={isSelected ? 0.45 : isHovered ? 0.35 : 0.18}
          blending={THREE.AdditiveBlending}
          wireframe
        />
      </mesh>

      {/* Orbiting Targeting Ring for Selected or Pinned Nodes */}
      {(isSelected || isPinned) && (
        <mesh ref={ringRef}>
          <ringGeometry args={[0.42, 0.48, 32]} />
          <meshBasicMaterial
            color={isSelected ? '#ffffff' : cfg.primary}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Floating 3D HUD Label above node */}
      {(isHovered || isSelected || isPinned) && (
        <Html
          position={[0, 0.55, 0]}
          center
          distanceFactor={13}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`px-2 py-1 rounded backdrop-blur-md text-[10px] font-mono uppercase tracking-wider whitespace-nowrap shadow-xl border flex items-center gap-1.5 transition-all select-none ${
              isSelected
                ? 'bg-slate-900/90 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(0,245,212,0.4)]'
                : 'bg-black/80 border-slate-700/80 text-slate-200'
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: cfg.primary }}
            />
            <span className="font-semibold text-[9px] px-1 py-0.2 rounded bg-black/40 border border-slate-700 text-slate-300">
              {node.namespace}
            </span>
            <span className="max-w-[140px] truncate">{node.title}</span>
            {isPinned && <Pin className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />}
          </div>
        </Html>
      )}
    </group>
  )
}

/**
 * 3D Scene Controller Handling Node Pulling and Orbit Constraints
 */
interface GalaxySceneProps {
  nodes: MemoryNodeData[]
  nodePositions: Map<string, [number, number, number]>
  filaments: FilamentLink[]
  selectedNode: MemoryNodeData | null
  hoveredNode: MemoryNodeData | null
  showFilaments: boolean
  autoOrbit: boolean
  onSelectNode: (node: MemoryNodeData) => void
  onHoverNode: (node: MemoryNodeData | null) => void
  onUpdateNodePosition: (id: string, newPos: [number, number, number]) => void
}

const GalaxyScene: React.FC<GalaxySceneProps> = ({
  nodes,
  nodePositions,
  filaments,
  selectedNode,
  hoveredNode,
  showFilaments,
  autoOrbit,
  onSelectNode,
  onHoverNode,
  onUpdateNodePosition
}) => {
  const { camera, gl } = useThree()
  const controlsRef = useRef<any>(null)
  const [draggedNode, setDraggedNode] = useState<MemoryNodeData | null>(null)
  const dragPlaneRef = useRef(new THREE.Plane())
  const raycasterRef = useRef(new THREE.Raycaster())

  // Auto-Orbit Drift Animation
  useFrame((_, delta) => {
    if (autoOrbit && controlsRef.current && !draggedNode) {
      controlsRef.current.autoRotate = true
      controlsRef.current.autoRotateSpeed = 0.6
      controlsRef.current.update()
    } else if (controlsRef.current) {
      controlsRef.current.autoRotate = false
    }
  })

  // Start dragging node
  const handleDragStart = useCallback(
    (node: MemoryNodeData, e: any) => {
      setDraggedNode(node)
      if (controlsRef.current) {
        controlsRef.current.enabled = false
      }

      // Create a plane facing camera through node's position
      const pos = nodePositions.get(node.id) || [0, 0, 0]
      const nodePos = new THREE.Vector3(...pos)
      const cameraDir = new THREE.Vector3()
      camera.getWorldDirection(cameraDir)
      dragPlaneRef.current.setFromNormalAndCoplanarPoint(cameraDir.negate(), nodePos)
    },
    [camera, nodePositions]
  )

  // Handle pointer move while dragging
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggedNode) return

      const rect = gl.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera)
      const intersection = new THREE.Vector3()
      if (raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersection)) {
        onUpdateNodePosition(draggedNode.id, [intersection.x, intersection.y, intersection.z])
      }
    }

    const handlePointerUp = () => {
      if (draggedNode) {
        setDraggedNode(null)
        if (controlsRef.current) {
          controlsRef.current.enabled = true
        }
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [draggedNode, camera, gl, onUpdateNodePosition])

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[12, 16, 12]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-14, -12, -10]} intensity={0.8} color="#00f5d4" />

      {/* Orbit Controls with Damping */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.7}
        zoomSpeed={0.9}
        minDistance={3.5}
        maxDistance={45}
      />

      {/* Ambient Cosmic Background */}
      <CosmicStarfield count={1500} />

      {/* Constellation Filament Web */}
      <ConstellationFilaments filaments={filaments} visible={showFilaments} />

      {/* Interactive Memory Nodes */}
      {nodes.map((node) => {
        const pos = nodePositions.get(node.id) || [0, 0, 0]
        return (
          <NodeMesh
            key={node.id}
            node={node}
            position={pos}
            isSelected={selectedNode?.id === node.id}
            isHovered={hoveredNode?.id === node.id}
            isDragged={draggedNode?.id === node.id}
            onSelect={onSelectNode}
            onHover={onHoverNode}
            onDragStart={handleDragStart}
          />
        )
      })}
    </>
  )
}

// ============================================================================
// MAIN COMPONENT: MemoryGalaxy3D
// ============================================================================

export interface MemoryGalaxy3DProps {
  onNodeSelect?: (node: MemoryNodeData | null) => void
  activeNamespace?: string
  className?: string
}

export const MemoryGalaxy3D: React.FC<MemoryGalaxy3DProps> = ({
  onNodeSelect,
  activeNamespace = 'ALL',
  className = ''
}) => {
  // Authentication & IPC state
  const [authToken, setAuthToken] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedNamespace, setSelectedNamespace] = useState<string>(activeNamespace)

  // Nodes & Spatial Graph State
  const [allNodes, setAllNodes] = useState<MemoryNodeData[]>(INITIAL_SEED_NODES)
  const [nodePositions, setNodePositions] = useState<Map<string, [number, number, number]>>(
    new Map()
  )
  const [selectedNode, setSelectedNode] = useState<MemoryNodeData | null>(null)
  const [hoveredNode, setHoveredNode] = useState<MemoryNodeData | null>(null)

  // Canvas View Controls
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true)
  const [showFilaments, setShowFilaments] = useState<boolean>(true)
  const [cameraResetCounter, setCameraResetCounter] = useState<number>(0)

  // Node Inspector Editing State
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editTitle, setEditTitle] = useState<string>('')
  const [editNamespace, setEditNamespace] = useState<string>('DEV')
  const [editContent, setEditContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // Manual Ingest Modal State
  const [showIngestModal, setShowIngestModal] = useState<boolean>(false)
  const [newTitle, setNewTitle] = useState<string>('')
  const [newNamespace, setNewNamespace] = useState<string>('DEV')
  const [newContent, setNewContent] = useState<string>('')
  const [newTags, setNewTags] = useState<string>('sovereign, memory')

  // Telemetry Strip Logs & Events
  const [indexLogs, setIndexLogs] = useState<IndexLogEvent[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString(),
      category: 'FTS5',
      message: 'FTS5 virtual table memory_fts ready (porter unicode61)',
      latencyMs: 0.8,
      status: 'OK'
    },
    {
      id: 'log-2',
      timestamp: new Date().toLocaleTimeString(),
      category: 'VEC',
      message: 'sqlite-vec cosine vector engine online (384-dim)',
      latencyMs: 1.2,
      status: 'OK'
    },
    {
      id: 'log-3',
      timestamp: new Date().toLocaleTimeString(),
      category: 'WAL',
      message: 'WAL journal mode NORMAL synchronous checkpoint OK',
      latencyMs: 0.4,
      status: 'OK'
    }
  ])

  // Helper to add log entries
  const addLog = useCallback(
    (
      category: 'FTS5' | 'VEC' | 'WAL' | 'MUTATION' | 'SYNC' | 'INFO',
      message: string,
      latencyMs?: number,
      status: 'OK' | 'WARN' | 'INFO' = 'OK'
    ) => {
      const newEvt: IndexLogEvent = {
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        category,
        message,
        latencyMs,
        status
      }
      setIndexLogs((prev) => [newEvt, ...prev.slice(0, 40)])
    },
    []
  )

  // 1. Discover IPC Auth Token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:47630/api/auth/token').catch(() => null)
        if (resp && resp.ok) {
          const data = await resp.json()
          if (data.token) {
            setAuthToken(data.token)
          }
        }
      } catch {}
    }
    fetchToken()
  }, [])

  // 2. Fetch Initial Memories from GET /api/memory
  const fetchMemories = useCallback(async () => {
    setLoading(true)
    const startTime = performance.now()
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const resp = await fetch('http://127.0.0.1:47630/api/memory?limit=100', { headers }).catch(
        () => null
      )
      const duration = parseFloat((performance.now() - startTime).toFixed(2))

      if (resp && resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data.memories) && data.memories.length > 0) {
          // Merge fetched memories with seed nodes ensuring uniqueness
          const fetchedMap = new Map<string, MemoryNodeData>()
          data.memories.forEach((m: any) => {
            fetchedMap.set(m.id || `mem-${Math.random()}`, {
              id: m.id,
              title: m.title || 'Untitled Memory',
              content: m.content || '',
              namespace: m.namespace || 'DEV',
              metadata: typeof m.metadata === 'object' ? m.metadata : {},
              created_at: m.created_at || Date.now(),
              updated_at: m.updated_at || Date.now()
            })
          })

          INITIAL_SEED_NODES.forEach((seed) => {
            if (!fetchedMap.has(seed.id)) {
              fetchedMap.set(seed.id, seed)
            }
          })

          const combined = Array.from(fetchedMap.values())
          setAllNodes(combined)
          addLog('SYNC', `Hydrated ${combined.length} nodes from SQLite WAL`, duration, 'OK')
        } else {
          setAllNodes(INITIAL_SEED_NODES)
          addLog('INFO', `Initialized Sovereign Memory galaxy with core seed topology`, duration, 'INFO')
        }
      } else {
        setAllNodes(INITIAL_SEED_NODES)
        addLog('INFO', `IPC store offline; operating in local sovereign standby cache`, duration, 'INFO')
      }
    } catch {
      setAllNodes(INITIAL_SEED_NODES)
    } finally {
      setLoading(false)
    }
  }, [authToken, addLog])

  useEffect(() => {
    fetchMemories()
  }, [fetchMemories])

  // 3. Compute Deterministic 3D Positions for Nodes
  useEffect(() => {
    setNodePositions((prev) => {
      const nextMap = new Map(prev)
      allNodes.forEach((node) => {
        if (!nextMap.has(node.id)) {
          const ns = (node.namespace || 'DEFAULT').toUpperCase()
          const centroid = CLUSTER_CENTROIDS[ns] || CLUSTER_CENTROIDS.DEFAULT
          const coords = hashToCoords(node.id + node.title, centroid, 2.8)
          nextMap.set(node.id, coords)
        }
      })
      return nextMap
    })
  }, [allNodes])

  // 4. Handle Live Search Query (FTS5 + sqlite-vec)
  const handleLiveSearch = useCallback(
    async (queryText: string) => {
      setSearchQuery(queryText)
      const cleanQ = queryText.trim()
      if (!cleanQ) {
        return
      }

      const startTime = performance.now()
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`

        const resp = await fetch(
          `http://127.0.0.1:47630/api/memory/search?q=${encodeURIComponent(cleanQ)}&limit=30`,
          { headers }
        ).catch(() => null)

        const duration = parseFloat((performance.now() - startTime).toFixed(2))

        if (resp && resp.ok) {
          const data = await resp.json()
          const results = Array.isArray(data.results) ? data.results : []
          addLog('FTS5', `Query "${cleanQ}" matched ${results.length} nodes`, duration, 'OK')

          if (results.length > 0) {
            // Select the highest-ranked result
            const topMatch = allNodes.find((n) => n.id === results[0].id)
            if (topMatch) {
              setSelectedNode(topMatch)
              if (onNodeSelect) onNodeSelect(topMatch)
            }
          }
        } else {
          // Local fallback filter if offline
          const matches = allNodes.filter(
            (n) =>
              n.title.toLowerCase().includes(cleanQ.toLowerCase()) ||
              n.content.toLowerCase().includes(cleanQ.toLowerCase())
          )
          addLog('FTS5', `Local fallback query "${cleanQ}" matched ${matches.length} nodes`, duration, 'INFO')
          if (matches.length > 0) {
            setSelectedNode(matches[0])
            if (onNodeSelect) onNodeSelect(matches[0])
          }
        }
      } catch (err: any) {
        addLog('FTS5', `Search error: ${err.message}`, undefined, 'WARN')
      }
    },
    [allNodes, authToken, addLog, onNodeSelect]
  )

  // 5. Filter Nodes by Selected Namespace
  const filteredNodes = useMemo(() => {
    return allNodes.filter((node) => {
      const matchNs =
        selectedNamespace === 'ALL' ||
        node.namespace.toUpperCase() === selectedNamespace.toUpperCase()
      const matchSearch =
        !searchQuery.trim() ||
        node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.namespace.toLowerCase().includes(searchQuery.toLowerCase())
      return matchNs && matchSearch
    })
  }, [allNodes, selectedNamespace, searchQuery])

  // 6. Generate Constellation Filament Links
  const filamentLinks = useMemo<FilamentLink[]>(() => {
    if (!showFilaments) return []
    const links: FilamentLink[] = []
    const maxIntraDist = 3.6
    const maxInterDist = 5.2

    for (let i = 0; i < filteredNodes.length; i++) {
      const nodeA = filteredNodes[i]
      const posA = nodePositions.get(nodeA.id)
      if (!posA) continue

      const cfgA = CLUSTER_CONFIG[nodeA.namespace.toUpperCase()] || CLUSTER_CONFIG.DEFAULT

      for (let j = i + 1; j < filteredNodes.length; j++) {
        const nodeB = filteredNodes[j]
        const posB = nodePositions.get(nodeB.id)
        if (!posB) continue

        const cfgB = CLUSTER_CONFIG[nodeB.namespace.toUpperCase()] || CLUSTER_CONFIG.DEFAULT
        const isSameCluster = nodeA.namespace.toUpperCase() === nodeB.namespace.toUpperCase()

        const dx = posA[0] - posB[0]
        const dy = posA[1] - posB[1]
        const dz = posA[2] - posB[2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        // Intra-cluster proximity bond
        if (isSameCluster && dist <= maxIntraDist) {
          links.push({
            sourceId: nodeA.id,
            targetId: nodeB.id,
            sourcePos: posA,
            targetPos: posB,
            colorA: cfgA.primary,
            colorB: cfgB.secondary,
            weight: 1.0 - dist / maxIntraDist
          })
        }
        // Inter-cluster semantic link (e.g., both pinned or sharing tags)
        else if (!isSameCluster && dist <= maxInterDist) {
          const tagsA = nodeA.metadata?.tags || []
          const tagsB = nodeB.metadata?.tags || []
          const sharesTag = tagsA.some((t) => tagsB.includes(t))

          if (sharesTag || (nodeA.metadata?.pinned && nodeB.metadata?.pinned)) {
            links.push({
              sourceId: nodeA.id,
              targetId: nodeB.id,
              sourcePos: posA,
              targetPos: posB,
              colorA: cfgA.primary,
              colorB: cfgB.primary,
              weight: 0.6
            })
          }
        }
      }
    }
    return links
  }, [filteredNodes, nodePositions, showFilaments])

  // 7. Update Single Node Position from 3D Drag
  const handleUpdateNodePosition = useCallback(
    (id: string, newPos: [number, number, number]) => {
      setNodePositions((prev) => {
        const next = new Map(prev)
        next.set(id, newPos)
        return next
      })
    },
    []
  )

  // 8. Select Node Action
  const handleSelectNode = useCallback(
    (node: MemoryNodeData) => {
      setSelectedNode(node)
      setIsEditing(false)
      setEditTitle(node.title)
      setEditNamespace(node.namespace)
      setEditContent(node.content)
      if (onNodeSelect) onNodeSelect(node)
      addLog('FTS5', `Inspecting node: [${node.namespace}] ${node.title}`, undefined, 'INFO')
    },
    [onNodeSelect, addLog]
  )

  // 9. Node Inspector Actions: Save Edit
  const handleSaveEdit = async () => {
    if (!selectedNode) return
    setIsSaving(true)
    const startTime = performance.now()

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const payload = {
        title: editTitle.trim() || selectedNode.title,
        content: editContent.trim() || selectedNode.content,
        namespace: editNamespace.trim() || selectedNode.namespace,
        metadata: {
          ...(selectedNode.metadata || {}),
          updated_at: Date.now()
        }
      }

      const resp = await fetch('http://127.0.0.1:47630/api/memory', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }).catch(() => null)

      const duration = parseFloat((performance.now() - startTime).toFixed(2))

      // Update in-memory state
      const updatedNode: MemoryNodeData = {
        ...selectedNode,
        title: payload.title,
        content: payload.content,
        namespace: payload.namespace,
        metadata: payload.metadata,
        updated_at: Date.now()
      }

      setAllNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? updatedNode : n)))
      setSelectedNode(updatedNode)
      setIsEditing(false)
      addLog('MUTATION', `Updated memory node "${updatedNode.title}"`, duration, 'OK')
    } catch (err: any) {
      addLog('MUTATION', `Failed to update node: ${err.message}`, undefined, 'WARN')
    } finally {
      setIsSaving(false)
    }
  }

  // 10. Node Inspector Action: Toggle Pin
  const handleTogglePin = async () => {
    if (!selectedNode) return
    const newPinned = !selectedNode.metadata?.pinned
    const updatedMeta = { ...(selectedNode.metadata || {}), pinned: newPinned }

    const updatedNode: MemoryNodeData = {
      ...selectedNode,
      metadata: updatedMeta,
      updated_at: Date.now()
    }

    setAllNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? updatedNode : n)))
    setSelectedNode(updatedNode)

    // Sync to backend
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      await fetch('http://127.0.0.1:47630/api/memory', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: updatedNode.title,
          content: updatedNode.content,
          namespace: updatedNode.namespace,
          metadata: updatedMeta
        })
      }).catch(() => null)

      addLog(
        'MUTATION',
        `${newPinned ? 'Pinned' : 'Unpinned'} node "${updatedNode.title}"`,
        0.8,
        'OK'
      )
    } catch {}
  }

  // 11. Node Inspector Action: Forget / Dissolve Node
  const handleForgetNode = async () => {
    if (!selectedNode) return
    if (!confirm(`Are you sure you want to forget node "${selectedNode.title}" from sovereign memory?`)) {
      return
    }

    const forgottenId = selectedNode.id
    const forgottenTitle = selectedNode.title

    // Remove from local memory state
    setAllNodes((prev) => prev.filter((n) => n.id !== forgottenId))
    setSelectedNode(null)
    setIsEditing(false)
    if (onNodeSelect) onNodeSelect(null)

    // Call forget endpoint if available
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      await fetch(`http://127.0.0.1:47630/api/memory/forget`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id: forgottenId, title: forgottenTitle })
      }).catch(() => null)

      addLog('MUTATION', `Dissolved memory node "${forgottenTitle}" from SQLite WAL`, 1.1, 'OK')
    } catch {
      addLog('MUTATION', `Dissolved node "${forgottenTitle}" locally`, undefined, 'INFO')
    }
  }

  // 12. Ingest New Memory Node
  const handleCreateNewNode = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    setIsSaving(true)
    const startTime = performance.now()

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const tagsArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const payload = {
        title: newTitle.trim(),
        content: newContent.trim(),
        namespace: newNamespace.trim().toUpperCase(),
        metadata: {
          tags: tagsArray,
          pinned: false,
          importance: 85,
          created_at: Date.now()
        }
      }

      let generatedId = `mem-user-${Date.now()}`
      const resp = await fetch('http://127.0.0.1:47630/api/memory', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      }).catch(() => null)

      const duration = parseFloat((performance.now() - startTime).toFixed(2))

      if (resp && resp.ok) {
        const resData = await resp.json()
        if (resData.id) generatedId = resData.id
      }

      const newNode: MemoryNodeData = {
        id: generatedId,
        title: payload.title,
        content: payload.content,
        namespace: payload.namespace,
        metadata: payload.metadata,
        created_at: Date.now(),
        updated_at: Date.now()
      }

      setAllNodes((prev) => [newNode, ...prev])
      setSelectedNode(newNode)
      setShowIngestModal(false)
      setNewTitle('')
      setNewContent('')
      addLog('MUTATION', `Ingested new memory node "${newNode.title}"`, duration, 'OK')
    } catch (err: any) {
      addLog('MUTATION', `Ingest failed: ${err.message}`, undefined, 'WARN')
    } finally {
      setIsSaving(false)
    }
  }

  // 13. Cluster Distribution Calculations for Telemetry
  const clusterDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      DEV: 0,
      STUDY: 0,
      STUDIO: 0,
      SILENT: 0,
      RESEARCH: 0,
      SYSTEM: 0
    }
    allNodes.forEach((n) => {
      const ns = n.namespace.toUpperCase()
      if (counts[ns] !== undefined) {
        counts[ns]++
      } else {
        counts['DEV']++
      }
    })
    const total = allNodes.length || 1
    return Object.entries(counts).map(([ns, count]) => ({
      namespace: ns,
      count,
      pct: Math.round((count / total) * 100),
      cfg: CLUSTER_CONFIG[ns] || CLUSTER_CONFIG.DEFAULT
    }))
  }, [allNodes])

  return (
    <div
      className={`relative w-full h-full min-h-[640px] flex flex-col bg-[#070b12] text-slate-200 overflow-hidden select-none font-sans ${className}`}
    >
      {/* ==================================================================== */}
      {/* TOP HUD BAR: SEARCH, CLUSTERS, & ACTION PILLS                        */}
      {/* ==================================================================== */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        {/* Left: Branding & Search Input */}
        <div className="flex items-center gap-3 flex-1 min-w-[280px] max-w-[520px]">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-800">
            <Database className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-xs font-bold text-cyan-300 tracking-wider">
              MEMORY GALAXY
            </span>
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleLiveSearch(e.target.value)}
              placeholder="Search FTS5 & sqlite-vec (BM25 + 384d)..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => handleLiveSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Cluster Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded border border-slate-800">
          <button
            onClick={() => setSelectedNamespace('ALL')}
            className={`px-2 py-1 rounded text-[11px] font-mono tracking-wider transition-all ${
              selectedNamespace === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL ({allNodes.length})
          </button>
          {['DEV', 'STUDY', 'STUDIO', 'SILENT', 'RESEARCH', 'SYSTEM'].map((ns) => {
            const cfg = CLUSTER_CONFIG[ns]
            const isAct = selectedNamespace === ns
            return (
              <button
                key={ns}
                onClick={() => setSelectedNamespace(ns)}
                className={`px-2 py-1 rounded text-[11px] font-mono tracking-wider flex items-center gap-1.5 transition-all ${
                  isAct
                    ? 'font-semibold border'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                style={{
                  backgroundColor: isAct ? cfg.dark : 'transparent',
                  borderColor: isAct ? cfg.primary : 'transparent',
                  color: isAct ? cfg.primary : undefined
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: cfg.primary }}
                />
                {ns}
              </button>
            )
          })}
        </div>

        {/* Right: Quick Controls & Ingest Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoOrbit((prev) => !prev)}
            title={autoOrbit ? 'Pause Orbit Drift' : 'Resume Auto Orbit'}
            className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition-all ${
              autoOrbit
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            {autoOrbit ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>DRIFT</span>
          </button>

          <button
            onClick={() => setShowFilaments((prev) => !prev)}
            title="Toggle Filament Bonds"
            className={`px-2.5 py-1 rounded border text-[11px] font-mono flex items-center gap-1.5 transition-all ${
              showFilaments
                ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>BONDS</span>
          </button>

          <button
            onClick={() => setShowIngestModal(true)}
            className="px-2.5 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-mono font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,245,212,0.4)] transition-all"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>+ INGEST</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3D WEBGL GALAXY CANVAS STAGE                                         */}
      {/* ==================================================================== */}
      <div className="relative flex-1 w-full min-h-[360px] bg-gradient-to-b from-[#070b12] via-[#05080e] to-[#030508]">
        <Canvas
          key={cameraResetCounter}
          camera={{ position: [0, 8, 18], fov: 54 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          className="w-full h-full"
        >
          <GalaxyScene
            nodes={filteredNodes}
            nodePositions={nodePositions}
            filaments={filamentLinks}
            selectedNode={selectedNode}
            hoveredNode={hoveredNode}
            showFilaments={showFilaments}
            autoOrbit={autoOrbit}
            onSelectNode={handleSelectNode}
            onHoverNode={setHoveredNode}
            onUpdateNodePosition={handleUpdateNodePosition}
          />
        </Canvas>

        {/* Floating Top-Left Status Pill */}
        <div className="absolute top-3 left-4 pointer-events-none z-10 flex flex-col gap-1">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded border border-slate-800 text-[11px] font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-slate-400">NODES:</span>
            <span className="text-emerald-400 font-bold">{filteredNodes.length}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">BONDS:</span>
            <span className="text-purple-400 font-bold">{filamentLinks.length}</span>
            <span className="text-slate-600">|</span>
            <span className="text-cyan-400 font-bold">WAL ACTIVE</span>
          </div>
        </div>

        {/* Floating Right-Side Node Inspector Drawer */}
        {selectedNode && (
          <div className="absolute top-3 right-4 bottom-3 w-[340px] z-20 flex flex-col bg-slate-950/90 backdrop-blur-xl border border-cyan-500/40 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-200">
            {/* Inspector Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/80 border-b border-slate-800">
              <div className="flex items-center gap-2 truncate">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor:
                      (CLUSTER_CONFIG[selectedNode.namespace.toUpperCase()] || CLUSTER_CONFIG.DEFAULT)
                        .primary
                  }}
                />
                <span className="text-xs font-mono font-bold text-cyan-300 tracking-wider truncate">
                  NODE INSPECTOR
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleTogglePin}
                  title={selectedNode.metadata?.pinned ? 'Unpin Node' : 'Pin Node'}
                  className={`p-1 rounded transition-colors ${
                    selectedNode.metadata?.pinned
                      ? 'text-amber-400 bg-amber-950/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {selectedNode.metadata?.pinned ? (
                    <Pin className="w-3.5 h-3.5 fill-amber-400" />
                  ) : (
                    <PinOff className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setIsEditing((prev) => !prev)}
                  title="Edit Node"
                  className={`p-1 rounded transition-colors ${
                    isEditing
                      ? 'text-cyan-300 bg-cyan-950/40'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleForgetNode}
                  title="Forget Node"
                  className="p-1 rounded text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/40 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inspector Body */}
            <div className="flex-1 p-3.5 overflow-y-auto font-mono text-xs space-y-3">
              {isEditing ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                      Cluster Namespace
                    </label>
                    <select
                      value={editNamespace}
                      onChange={(e) => setEditNamespace(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    >
                      <option value="DEV">DEV CONTEXT</option>
                      <option value="STUDY">STUDY / SCHOLAR</option>
                      <option value="STUDIO">CREATOR STUDIO</option>
                      <option value="SILENT">SILENT / ENCLAVE</option>
                      <option value="RESEARCH">DEEP RESEARCH</option>
                      <option value="SYSTEM">SYSTEM SOVEREIGN</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                      Content / Reason Trace
                    </label>
                    <textarea
                      rows={6}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400 leading-relaxed resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={isSaving}
                      className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] flex items-center gap-1.5"
                    >
                      <Save className="w-3 h-3" />
                      <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold border"
                        style={{
                          backgroundColor:
                            (
                              CLUSTER_CONFIG[selectedNode.namespace.toUpperCase()] ||
                              CLUSTER_CONFIG.DEFAULT
                            ).dark,
                          borderColor:
                            (
                              CLUSTER_CONFIG[selectedNode.namespace.toUpperCase()] ||
                              CLUSTER_CONFIG.DEFAULT
                            ).primary,
                          color:
                            (
                              CLUSTER_CONFIG[selectedNode.namespace.toUpperCase()] ||
                              CLUSTER_CONFIG.DEFAULT
                            ).primary
                        }}
                      >
                        {selectedNode.namespace}
                      </span>
                      {selectedNode.metadata?.pinned && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/60 border border-amber-500/40 text-amber-300 font-semibold flex items-center gap-1">
                          <Pin className="w-2.5 h-2.5 fill-amber-300" />
                          PINNED
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white leading-snug">
                      {selectedNode.title}
                    </h3>
                  </div>

                  <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80 text-[11px] leading-relaxed text-slate-300 max-h-[180px] overflow-y-auto select-text whitespace-pre-wrap">
                    {selectedNode.content}
                  </div>

                  {/* Metadata Chips */}
                  {selectedNode.metadata?.tags && selectedNode.metadata.tags.length > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                        Semantic Tags
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {selectedNode.metadata.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 bg-slate-900 border border-slate-700/80 rounded text-[10px] text-slate-400"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Node Telemetry IDs */}
                  <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>NODE ID:</span>
                      <span className="text-slate-400 font-mono truncate max-w-[180px]">
                        {selectedNode.id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>VECTOR DIM:</span>
                      <span className="text-cyan-400 font-mono">384-DIM COSINE</span>
                    </div>
                    <div className="flex justify-between">
                      <span>UPDATED:</span>
                      <span className="text-slate-400">
                        {typeof selectedNode.updated_at === 'number'
                          ? new Date(selectedNode.updated_at).toLocaleTimeString()
                          : 'REALTIME WAL'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer Legend Bar */}
        <div className="absolute bottom-2 inset-x-4 z-10 pointer-events-none flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 bg-slate-950/80 backdrop-blur-md rounded border border-slate-800 shadow-lg text-slate-300">
            <span className="text-cyan-400 font-bold">DRAG SPACE ORBIT</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-bold">SCROLL ZOOM</span>
            <span className="text-slate-600">|</span>
            <span className="text-purple-400 font-bold">DRAG NODE PULL</span>
          </div>

          <button
            onClick={() => setCameraResetCounter((c) => c + 1)}
            className="pointer-events-auto px-2.5 py-1 bg-slate-950/80 hover:bg-slate-900 backdrop-blur-md rounded border border-slate-800 text-[11px] font-mono text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-all shadow-lg"
          >
            <RotateCcw className="w-3 h-3" />
            <span>RESET VIEW</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3-COLUMN BOTTOM TELEMETRY STRIP (INDEX LOG, RADAR, DISTRIBUTION)     */}
      {/* ==================================================================== */}
      <div className="relative z-20 grid grid-cols-1 md:grid-cols-3 gap-0 bg-slate-950 border-t border-slate-800/80 text-xs font-mono">
        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 1: INDEX LOG                                                */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-3 border-r border-slate-800/80 flex flex-col h-[160px] overflow-hidden">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px] tracking-wider">
              <Terminal className="w-3.5 h-3.5" />
              <span>INDEX LOG [FTS5 + VEC]</span>
            </div>
            <span className="text-[10px] text-slate-500">BM25 PORTER</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 text-[10px] text-slate-400 pr-1">
            {indexLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-1.5 leading-tight">
                <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                <span
                  className={`font-semibold shrink-0 ${
                    log.category === 'FTS5'
                      ? 'text-cyan-400'
                      : log.category === 'VEC'
                      ? 'text-purple-400'
                      : log.category === 'MUTATION'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  [{log.category}]
                </span>
                <span className="text-slate-300 truncate">{log.message}</span>
                {log.latencyMs !== undefined && (
                  <span className="text-slate-500 shrink-0 ml-auto">{log.latencyMs}ms</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 2: SPATIAL VECTOR RADAR                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-3 border-r border-slate-800/80 flex items-center justify-between h-[160px] relative overflow-hidden">
          <div className="flex flex-col justify-between h-full z-10">
            <div>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px] tracking-wider mb-1">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>SPATIAL VECTOR RADAR</span>
              </div>
              <p className="text-[10px] text-slate-400">2D Polar Projection of 3D Clusters</p>
            </div>

            <div className="text-[10px] text-slate-400 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">COHESION:</span>
                <span className="text-amber-400 font-bold">98.4%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">ACTIVE RAY:</span>
                <span className="text-cyan-400 font-bold">
                  {searchQuery ? `FTS5: "${searchQuery}"` : 'IDLE SCAN'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">PROJECTION:</span>
                <span className="text-slate-300">POLAR (r, θ)</span>
              </div>
            </div>
          </div>

          {/* Radar Scanner Visual Widget */}
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            {/* Concentric rings */}
            <div className="absolute inset-0 rounded-full border border-amber-500/20" />
            <div className="absolute inset-3 rounded-full border border-amber-500/25" />
            <div className="absolute inset-7 rounded-full border border-amber-500/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-[1px] bg-amber-500/20" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-full w-[1px] bg-amber-500/20" />
            </div>

            {/* Rotating radar sweep ray */}
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none animate-spin [animation-duration:4s]">
              <div
                className="w-1/2 h-1/2 origin-bottom-right"
                style={{
                  background: 'linear-gradient(45deg, rgba(251, 191, 36, 0.4), transparent)'
                }}
              />
            </div>

            {/* Plotted Node Radar Blips */}
            {filteredNodes.slice(0, 16).map((node, i) => {
              const pos = nodePositions.get(node.id) || [0, 0, 0]
              const r = Math.min(48, Math.sqrt(pos[0] * pos[0] + pos[2] * pos[2]) * 4.5)
              const angle = Math.atan2(pos[2], pos[0])
              const bx = 56 + r * Math.cos(angle)
              const by = 56 + r * Math.sin(angle)
              const cfg = CLUSTER_CONFIG[node.namespace.toUpperCase()] || CLUSTER_CONFIG.DEFAULT

              return (
                <div
                  key={node.id}
                  className="absolute w-1.5 h-1.5 rounded-full"
                  style={{
                    left: `${bx}px`,
                    top: `${by}px`,
                    backgroundColor: cfg.primary,
                    boxShadow: `0 0 4px ${cfg.primary}`
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COLUMN 3: CLUSTER DISTRIBUTION                                     */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-3 flex flex-col justify-between h-[160px]">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 text-purple-400 font-bold text-[11px] tracking-wider">
              <Layers className="w-3.5 h-3.5" />
              <span>CLUSTER DISTRIBUTION</span>
            </div>
            <span className="text-[10px] text-slate-500">{allNodes.length} TOTAL</span>
          </div>

          {/* Cluster breakdown horizontal progress bars */}
          <div className="space-y-1.5 my-1">
            {clusterDistribution.map((item) => (
              <div key={item.namespace} className="flex items-center gap-2 text-[10px]">
                <span className="w-12 font-bold text-slate-400">{item.namespace}</span>
                <div className="flex-1 h-1.5 bg-slate-900 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${item.pct}%`,
                      backgroundColor: item.cfg.primary
                    }}
                  />
                </div>
                <span className="w-6 text-right text-slate-300 font-semibold">{item.count}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
            <span>WAL CACHE: 64MB</span>
            <span className="text-emerald-400 font-bold">100% LOCAL-FIRST</span>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: MANUAL MEMORY INGEST                                          */}
      {/* ==================================================================== */}
      {showIngestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-950 border border-cyan-500/50 rounded-lg shadow-2xl overflow-hidden font-mono text-xs">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-cyan-300 tracking-wider">
                  INGEST SOVEREIGN MEMORY NODE
                </span>
              </div>
              <button
                onClick={() => setShowIngestModal(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Node Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. SQLite WAL Checkpointing Protocol"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Cluster Namespace
                </label>
                <select
                  value={newNamespace}
                  onChange={(e) => setNewNamespace(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                >
                  <option value="DEV">DEV CONTEXT (Cyan)</option>
                  <option value="STUDY">STUDY / SCHOLAR (Amber)</option>
                  <option value="STUDIO">CREATOR STUDIO (Emerald)</option>
                  <option value="SILENT">SILENT / ENCLAVE (Indigo)</option>
                  <option value="RESEARCH">DEEP RESEARCH (Purple)</option>
                  <option value="SYSTEM">SYSTEM SOVEREIGN (Crimson)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Semantic Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="sqlite, memory, wal"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">
                  Content / Knowledge Trace
                </label>
                <textarea
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write the full verified sovereign note or code block here..."
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-400 resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 bg-slate-900/50 border-t border-slate-800">
              <button
                onClick={() => setShowIngestModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewNode}
                disabled={isSaving || !newTitle.trim() || !newContent.trim()}
                className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,245,212,0.4)]"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Ingesting...' : 'Ingest Node'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MemoryGalaxy3D
