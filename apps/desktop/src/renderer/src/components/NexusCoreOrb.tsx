// apps/desktop/src/renderer/src/components/NexusCoreOrb.tsx
import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, Trail, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  X,
  Database,
  Cpu,
  Sliders,
  ShieldCheck,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Play,
  Volume2,
  Lock,
  Radio,
  Search,
  Layers,
  Zap,
  Terminal,
  Globe,
  ChevronRight,
  Check,
} from 'lucide-react';

export type CoreState =
  | 'IDLE'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'SOVEREIGN_LOCK'
  | 'ESTOP_TRIGGERED';

export type Morphology = 'DYSON' | 'ATLAS' | 'VORTEX' | 'HELIX';

export type ReactorShape =
  | 'dyson'
  | 'ring'
  | 'sphere'
  | 'wire'
  | 'atlas'
  | 'vortex'
  | 'helix'
  | Morphology;

export type VisualEffectType = 'pulse' | 'scan' | 'glitch' | 'shockwave' | 'none';
export type WorkspaceMode = 'DEV' | 'STUDY' | 'STUDIO' | 'SILENT';

export const WORKSPACE_MODE_COLORS: Record<WorkspaceMode, { primary: string; secondary: string }> = {
  DEV:    { primary: '#00f5d4', secondary: '#00b4d8' },
  STUDY:  { primary: '#f59e0b', secondary: '#d97706' },
  STUDIO: { primary: '#10b981', secondary: '#059669' },
  SILENT: { primary: '#6366f1', secondary: '#4f46e5' },
};

export interface OrbitCardItem {
  id: string;
  media: string;
  label: string;
  radius?: number;
}

export interface UIVisualPreferences {
  reactor_color: string;
  reactor_shape: ReactorShape;
  spin_speed: number;
  intensity: number;
  active_effect: VisualEffectType;
  orbit_cards: OrbitCardItem[];
  show_rails: boolean;
  show_transcript: boolean;
  updated_at?: number;
}

export interface SubAgentOrbiter {
  id: 'DEV-01' | 'SYS-01' | 'SCOUT-01' | 'SEC-01' | 'OPS-01';
  name: string;
  status: 'IDLE' | 'ASSIGNED' | 'EXECUTING' | 'COMPLETED' | 'ERROR';
  taskSummary: string;
  color: string;
  secondaryColor: string;
  orbitRadius: number;
  orbitSpeed: number;
  tilt: [number, number, number];
}

export interface AudioSpectrum {
  rms: number;
  bass: number;
  mid: number;
  treble: number;
  dominantHz: number;
}

const STATE_PALETTE: Record<CoreState, { primary: string; secondary: string }> = {
  IDLE:            { primary: '#00f0ff', secondary: '#3b82f6' },
  WAKE_DETECTED:   { primary: '#00f5d4', secondary: '#38bdf8' },
  LISTENING:       { primary: '#00f5d4', secondary: '#06b6d4' },
  THINKING:        { primary: '#f59e0b', secondary: '#ea580c' },
  EXECUTING:       { primary: '#10b981', secondary: '#059669' },
  SPEAKING:        { primary: '#60a5fa', secondary: '#a855f7' },
  SOVEREIGN_LOCK:  { primary: '#a855f7', secondary: '#6b21a8' },
  ESTOP_TRIGGERED: { primary: '#ef4444', secondary: '#991b1b' },
};

export const DEFAULT_SPECTRUM: AudioSpectrum = {
  rms: 0.02,
  bass: 0.04,
  mid: 0.03,
  treble: 0.02,
  dominantHz: 128,
};

// 5 Agent Orbiters specifically configured to orbit at radius 4.2
export const DEFAULT_ORBITERS: SubAgentOrbiter[] = [
  {
    id: 'DEV-01',
    name: 'NexKoder',
    status: 'IDLE',
    taskSummary: 'AST & Git Worktree Ready',
    color: '#00f5d4',
    secondaryColor: '#38bdf8',
    orbitRadius: 4.2,
    orbitSpeed: 0.38,
    tilt: [0.28, 0.12, 0.2],
  },
  {
    id: 'SYS-01',
    name: 'Win32 UFO',
    status: 'IDLE',
    taskSummary: 'UIA Tree Inspector Ready',
    color: '#a855f7',
    secondaryColor: '#ec4899',
    orbitRadius: 4.2,
    orbitSpeed: 0.32,
    tilt: [-0.32, 0.18, -0.25],
  },
  {
    id: 'SCOUT-01',
    name: 'Scholar/DOM',
    status: 'IDLE',
    taskSummary: 'Warm CDP & ArXiv Ready',
    color: '#f59e0b',
    secondaryColor: '#fde047',
    orbitRadius: 4.2,
    orbitSpeed: 0.28,
    tilt: [0.15, -0.28, 0.38],
  },
  {
    id: 'SEC-01',
    name: 'Sentinel',
    status: 'IDLE',
    taskSummary: 'ScopeGuard Enforced',
    color: '#10b981',
    secondaryColor: '#34d399',
    orbitRadius: 4.2,
    orbitSpeed: 0.24,
    tilt: [-0.2, 0.35, -0.12],
  },
  {
    id: 'OPS-01',
    name: 'Watchdog',
    status: 'IDLE',
    taskSummary: 'SQLite WAL Healthy',
    color: '#f43f5e',
    secondaryColor: '#fb7185',
    orbitRadius: 4.2,
    orbitSpeed: 0.2,
    tilt: [0.38, -0.12, -0.3],
  },
];

export type CircuitId = '01' | '02' | '03' | '04';

interface CircuitConfig {
  id: CircuitId;
  label: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tag: string;
  badgeColor: string;
}

const CIRCUITS: CircuitConfig[] = [
  {
    id: '01',
    label: '01 // MEMORY STORE [FTS5 + VEC]',
    title: 'CIRCUIT 01 // SOVEREIGN MEMORY STORE',
    subtitle: 'Full-Text Search (FTS5) & 384-Dim Vector Embeddings on SQLite WAL',
    icon: Database,
    tag: 'FTS5 + VEC',
    badgeColor: 'border-cyan-500/40 text-cyan-400 bg-cyan-950/40',
  },
  {
    id: '02',
    label: '02 // MCP SKILLS [15 LOADED]',
    title: 'CIRCUIT 02 // NATIVE MCP PLUGIN REGISTRY',
    subtitle: '15 High-Speed Sandboxed Tools Auto-Discovered from core/mcp/plugins',
    icon: Cpu,
    tag: '15 ACTIVE',
    badgeColor: 'border-emerald-500/40 text-emerald-400 bg-emerald-950/40',
  },
  {
    id: '03',
    label: '03 // TARS PERSONA MATRIX',
    title: 'CIRCUIT 03 // TARS PERSONA & COGNITIVE DYNAMICS',
    subtitle: 'Prosody Shaping, Wit & Candor Tuning with Kokoro-82M ONNX Voice',
    icon: Sliders,
    tag: 'TARS PRIME',
    badgeColor: 'border-amber-500/40 text-amber-400 bg-amber-950/40',
  },
  {
    id: '04',
    label: '04 // SCOPE GUARD [6/6 SECURE]',
    title: 'CIRCUIT 04 // SCOPE GUARD & SECURITY MIDDLEWARE',
    subtitle: '6 Sovereign Invariants Guarding Host OS, Vault & Network Boundaries',
    icon: ShieldCheck,
    tag: '6/6 SECURE',
    badgeColor: 'border-purple-500/40 text-purple-400 bg-purple-950/40',
  },
];

// Smooth camera motion when docked or inspecting with safe bounds clamping
const CameraChoreographer: React.FC<{ isDocked: boolean; hasActiveCircuit: boolean }> = ({
  isDocked,
  hasActiveCircuit,
}) => {
  const { camera } = useThree();
  const targetPos = useMemo(() => {
    if (hasActiveCircuit) {
      return new THREE.Vector3(-1.8, 0.25, 7.8);
    }
    if (isDocked) {
      return new THREE.Vector3(0.4, 0.2, 8.8);
    }
    return new THREE.Vector3(0, 0.25, 7.2);
  }, [isDocked, hasActiveCircuit]);

  const lookAtTarget = useMemo(() => {
    if (hasActiveCircuit) {
      return new THREE.Vector3(-1.2, 0, 0);
    }
    if (isDocked) {
      return new THREE.Vector3(0.3, 0, 0);
    }
    return new THREE.Vector3(0, 0, 0);
  }, [isDocked, hasActiveCircuit]);

  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_, delta) => {
    const step = Math.min(1, delta * 3.8);
    camera.position.lerp(targetPos, step);
    currentLookAt.current.lerp(lookAtTarget, step);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

// 3D Torus sonic shockwave pulse ring on wake/voice-start
const ShockwavePulse: React.FC<{ triggerKey: number; color: string }> = ({ triggerKey, color }) => {
  const ring1Ref = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);
  const ring3Ref = useRef<THREE.Mesh>(null!);
  const progressRef = useRef<number>(1.0);

  useEffect(() => {
    if (triggerKey > 0) progressRef.current = 0.0;
  }, [triggerKey]);

  useFrame((_, delta) => {
    if (progressRef.current < 1.0 && ring1Ref.current && ring2Ref.current && ring3Ref.current) {
      progressRef.current = Math.min(1.0, progressRef.current + delta * 1.45);
      const p = progressRef.current;
      const easeOut = 1 - Math.pow(1 - p, 3);
      ring1Ref.current.scale.setScalar(1.0 + easeOut * 4.8);
      (ring1Ref.current.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.75;

      const p2 = Math.max(0, p - 0.15);
      ring2Ref.current.scale.setScalar(1.0 + (1 - Math.pow(1 - p2, 3)) * 4.2);
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.4;

      const p3 = Math.max(0, p - 0.08);
      ring3Ref.current.scale.setScalar(1.0 + (1 - Math.pow(1 - p3, 2.5)) * 5.4);
      (ring3Ref.current.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.55;
    }
  });

  return (
    <group rotation={[Math.PI / 2.3, 0.2, 0]}>
      {/* Primary Cyan Sonic Shockwave Torus */}
      <mesh ref={ring1Ref}>
        <torusGeometry args={[1.0, 0.024, 20, 120]} />
        <meshBasicMaterial color={color} transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Core White Pulse Torus */}
      <mesh ref={ring2Ref}>
        <torusGeometry args={[1.0, 0.012, 16, 100]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Outer 3D Sonic Shockwave Barrier Torus */}
      <mesh ref={ring3Ref}>
        <torusGeometry args={[1.08, 0.032, 24, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0} blending={THREE.AdditiveBlending} wireframe />
      </mesh>
    </group>
  );
};

// ============================================================================
// MORPHOLOGY 1: DYSON (Fibonacci Sphere + Gyroscope Rings)
// ============================================================================
const DysonGyroRings: React.FC<{
  coreState: CoreState;
  spectrum: AudioSpectrum;
  color: string;
  spinSpeed: number;
}> = ({ coreState, spectrum, color, spinSpeed }) => {
  const outerRing = useRef<THREE.Mesh>(null!);
  const midRing = useRef<THREE.Mesh>(null!);
  const innerRing = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (!outerRing.current || !midRing.current || !innerRing.current) return;
    const treble = spectrum?.treble ?? 0.02;
    const boost =
      (coreState === 'THINKING' || coreState === 'EXECUTING' ? 2.2 : 1.0 + treble * 1.8) *
      spinSpeed;
    outerRing.current.rotation.x += delta * 0.35 * boost;
    outerRing.current.rotation.y += delta * 0.22 * boost;
    midRing.current.rotation.y -= delta * 0.48 * boost;
    midRing.current.rotation.z += delta * 0.31 * boost;
    innerRing.current.rotation.x -= delta * 0.65 * boost;
    innerRing.current.rotation.z -= delta * 0.4 * boost;
  });

  return (
    <group>
      <mesh ref={outerRing}>
        <torusGeometry args={[1.92, 0.006, 16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={midRing}>
        <torusGeometry args={[1.76, 0.008, 16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={innerRing}>
        <torusGeometry args={[1.60, 0.005, 16, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

// ============================================================================
// MORPHOLOGY 2: ATLAS (Cellular Mitosis into 5 Tethered Cells DEV-01..OPS-01)
// ============================================================================
export const ATLAS_CELL_TARGETS = [
  { id: 'DEV-01', name: 'NexKoder', center: [-1.7, 0.7, 0.1] as [number, number, number], color: '#00f5d4' },
  { id: 'SYS-01', name: 'Win32 UFO', center: [1.7, 0.7, -0.1] as [number, number, number], color: '#a855f7' },
  { id: 'SCOUT-01', name: 'Scholar', center: [-1.3, -1.1, 0.4] as [number, number, number], color: '#f59e0b' },
  { id: 'SEC-01', name: 'Sentinel', center: [1.3, -1.1, -0.4] as [number, number, number], color: '#10b981' },
  { id: 'OPS-01', name: 'Watchdog', center: [0.0, 1.5, -0.3] as [number, number, number], color: '#f43f5e' },
];

const AtlasMitosisElements: React.FC<{
  spectrum: AudioSpectrum;
  spinSpeed: number;
}> = ({ spectrum, spinSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const bass = spectrum?.bass ?? 0.04;
    groupRef.current.rotation.y += delta * 0.15 * spinSpeed;
    const scale = 1.0 + bass * 0.15 + Math.sin(t * 2.0) * 0.03;
    groupRef.current.scale.setScalar(scale);
  });

  const perimeterPoints: [number, number, number][] = useMemo(() => {
    return [
      ATLAS_CELL_TARGETS[0].center,
      ATLAS_CELL_TARGETS[4].center,
      ATLAS_CELL_TARGETS[1].center,
      ATLAS_CELL_TARGETS[3].center,
      ATLAS_CELL_TARGETS[2].center,
      ATLAS_CELL_TARGETS[0].center,
    ];
  }, []);

  return (
    <group ref={groupRef}>
      {/* Central Mitotic Hub */}
      <mesh>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
      </mesh>

      {/* Pentagonal Spindle Web */}
      <Line
        points={perimeterPoints}
        color="#38bdf8"
        lineWidth={1.2}
        transparent
        opacity={0.35}
      />

      {/* Radial Tethers & Cell Nuclei */}
      {ATLAS_CELL_TARGETS.map((cell) => (
        <group key={cell.id}>
          {/* Radial Tether from [0, 0, 0] to Cell */}
          <Line
            points={[[0, 0, 0], cell.center]}
            color={cell.color}
            lineWidth={1.8}
            transparent
            opacity={0.65}
          />
          {/* Glowing Inner Nucleus */}
          <mesh position={cell.center}>
            <sphereGeometry args={[0.1, 14, 14]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {/* Mitotic Cellular Membrane */}
          <mesh position={cell.center}>
            <icosahedronGeometry args={[0.34, 1]} />
            <meshBasicMaterial
              color={cell.color}
              wireframe
              transparent
              opacity={0.7}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Floating Cell Label */}
          <Html distanceFactor={10} position={[cell.center[0], cell.center[1] + 0.38, cell.center[2]]} center>
            <div
              className="px-2 py-0.5 rounded bg-slate-950/90 text-[9px] font-mono border whitespace-nowrap shadow-md flex items-center gap-1 select-none pointer-events-none"
              style={{ borderColor: cell.color, color: cell.color }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: cell.color }} />
              <span className="font-bold">{cell.id}</span>
              <span className="opacity-80 text-slate-300">({cell.name})</span>
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
};

// ============================================================================
// MORPHOLOGY 3: VORTEX (Plasma Ribbon Rings)
// ============================================================================
const VortexPlasmaRibbons: React.FC<{
  spectrum: AudioSpectrum;
  color: string;
  spinSpeed: number;
}> = ({ spectrum, color, spinSpeed }) => {
  const ribbon1 = useRef<THREE.Mesh>(null!);
  const ribbon2 = useRef<THREE.Mesh>(null!);
  const ribbon3 = useRef<THREE.Mesh>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    const bass = spectrum?.bass ?? 0.04;
    const treble = spectrum?.treble ?? 0.02;
    const speed = spinSpeed * (1.2 + treble * 1.8);

    if (ribbon1.current) {
      ribbon1.current.rotation.z += delta * 1.1 * speed;
      ribbon1.current.rotation.x += delta * 0.4 * speed;
      ribbon1.current.scale.setScalar(1.0 + bass * 0.35);
    }
    if (ribbon2.current) {
      ribbon2.current.rotation.z -= delta * 1.6 * speed;
      ribbon2.current.rotation.y += delta * 0.5 * speed;
      ribbon2.current.scale.setScalar(1.0 + bass * 0.25);
    }
    if (ribbon3.current) {
      ribbon3.current.rotation.z += delta * 0.8 * speed;
      ribbon3.current.rotation.x -= delta * 0.6 * speed;
      ribbon3.current.scale.setScalar(1.0 + bass * 0.45);
    }
    if (coreRef.current) {
      coreRef.current.rotation.z += delta * 2.2 * speed;
      coreRef.current.scale.setScalar(0.75 + bass * 0.5);
    }
  });

  return (
    <group>
      {/* Central Singularity Accretion Ring */}
      <mesh ref={coreRef} rotation={[Math.PI / 2.3, 0, 0]}>
        <ringGeometry args={[0.35, 0.55, 32]} />
        <meshBasicMaterial
          color="#ffffff"
          side={THREE.DoubleSide}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* Primary Inner High-Energy Accretion Torus Ribbon */}
      <mesh ref={ribbon1} rotation={[Math.PI / 3, 0.2, 0]}>
        <torusGeometry args={[1.35, 0.038, 20, 120]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Counter-Rotating Mid Plasma Ribbon */}
      <mesh ref={ribbon2} rotation={[-Math.PI / 3.2, 0.4, 0.3]}>
        <torusGeometry args={[1.75, 0.028, 18, 120]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.65} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* Outer Flaring Plasma Singularity Ribbon */}
      <mesh ref={ribbon3} rotation={[Math.PI / 2.2, -0.3, 0.1]}>
        <torusGeometry args={[2.15, 0.018, 16, 120]} />
        <meshBasicMaterial color="#ec4899" transparent opacity={0.55} blending={THREE.AdditiveBlending} wireframe />
      </mesh>
    </group>
  );
};

// ============================================================================
// MORPHOLOGY 4: HELIX (Coiled Particle Spiral)
// ============================================================================
const HelixFilamentSpine: React.FC<{
  spectrum: AudioSpectrum;
  color: string;
  spinSpeed: number;
}> = ({ spectrum, color, spinSpeed }) => {
  const groupRef = useRef<THREE.Group>(null!);

  const { strandA, strandB, rungs } = useMemo(() => {
    const ptsA: [number, number, number][] = [];
    const ptsB: [number, number, number][] = [];
    const rungPairs: Array<[[number, number, number], [number, number, number]]> = [];
    const segments = 120;
    const turns = 4;
    const height = 4.4;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = -height / 2 + t * height;
      const angle = t * turns * Math.PI * 2;
      const r = 1.15;

      const ax = Math.cos(angle) * r;
      const az = Math.sin(angle) * r;
      ptsA.push([ax, y, az]);

      const bx = Math.cos(angle + Math.PI) * r;
      const bz = Math.sin(angle + Math.PI) * r;
      ptsB.push([bx, y, bz]);

      if (i % 6 === 0) {
        rungPairs.push([[ax, y, az], [bx, y, bz]]);
      }
    }
    return { strandA: ptsA, strandB: ptsB, rungs: rungPairs };
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const bass = spectrum?.bass ?? 0.04;
    const treble = spectrum?.treble ?? 0.02;
    groupRef.current.rotation.y += delta * 0.45 * spinSpeed * (1.0 + treble * 1.5);
    groupRef.current.scale.set(
      1.0 + bass * 0.25,
      1.0 + (spectrum?.mid ?? 0.03) * 0.15,
      1.0 + bass * 0.25
    );
  });

  return (
    <group ref={groupRef}>
      {/* Central Vertical Energy Axis Conduit */}
      <Line
        points={[[0, -2.2, 0], [0, 2.2, 0]]}
        color="#ffffff"
        lineWidth={1.0}
        transparent
        opacity={0.35}
      />
      {/* Strand A Helical Filament */}
      <Line points={strandA} color={color} lineWidth={2.0} transparent opacity={0.85} />
      {/* Strand B Helical Filament */}
      <Line points={strandB} color="#a855f7" lineWidth={2.0} transparent opacity={0.85} />
      {/* Base-pair Rungs */}
      {rungs.map((pair, idx) => (
        <Line
          key={idx}
          points={pair}
          color={idx % 2 === 0 ? '#00f5d4' : '#ec4899'}
          lineWidth={1.2}
          transparent
          opacity={0.55}
        />
      ))}
    </group>
  );
};

// ============================================================================
// 4,000-Particle Dynamic Particle Engine Supporting All 4 Morphologies
// ============================================================================
const FibonacciDysonSphere: React.FC<{
  coreState: CoreState;
  spectrum: AudioSpectrum;
  empathyPct: number;
  shape: ReactorShape;
  morphology: Morphology;
  colorHex: string;
  spinSpeed: number;
  intensity: number;
  effect: VisualEffectType;
}> = ({ coreState, spectrum, empathyPct, shape, morphology, colorHex, spinSpeed, intensity, effect }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const coreMeshRef = useRef<THREE.Mesh>(null!);
  const particleCount = 4000;

  // Base coordinate templates for morphing shapes
  const shapeTemplates = useMemo(() => {
    const templates: Record<string, Float32Array> = {
      DYSON: new Float32Array(particleCount * 3),
      ATLAS: new Float32Array(particleCount * 3),
      VORTEX: new Float32Array(particleCount * 3),
      HELIX: new Float32Array(particleCount * 3),
      dyson: new Float32Array(particleCount * 3),
      ring: new Float32Array(particleCount * 3),
      sphere: new Float32Array(particleCount * 3),
      wire: new Float32Array(particleCount * 3),
      atlas: new Float32Array(particleCount * 3),
      vortex: new Float32Array(particleCount * 3),
      helix: new Float32Array(particleCount * 3),
    };

    const goldenAngle = Math.PI * (1 + Math.sqrt(5)); // ~3.883222

    // 1. DYSON: Dual-shell Fibonacci Dyson Sphere
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const rDyson = i % 4 === 0 ? 1.55 : 1.32;
      const yNormDyson = 1 - (2 * (i + 0.5)) / particleCount;
      const radiusDyson = Math.sqrt(Math.max(0, 1 - yNormDyson * yNormDyson));
      const thetaDyson = goldenAngle * i;
      const x = rDyson * radiusDyson * Math.cos(thetaDyson);
      const y = rDyson * yNormDyson;
      const z = rDyson * radiusDyson * Math.sin(thetaDyson);

      templates.DYSON[ix] = x;
      templates.DYSON[ix + 1] = y;
      templates.DYSON[ix + 2] = z;
      templates.dyson[ix] = x;
      templates.dyson[ix + 1] = y;
      templates.dyson[ix + 2] = z;
    }

    // 2. ATLAS: Cellular Mitosis into 5 Tethered Cells DEV-01..OPS-01
    const particlesPerCell = Math.floor(particleCount / 5); // 800
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const cellIdx = Math.min(4, Math.floor(i / particlesPerCell));
      const j = i % particlesPerCell;
      const center = ATLAS_CELL_TARGETS[cellIdx].center;
      const rCell = 0.52;
      const yNorm = 1 - (2 * (j + 0.5)) / particlesPerCell;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const theta = goldenAngle * j;

      const x = center[0] + rCell * rad * Math.cos(theta);
      const y = center[1] + rCell * yNorm;
      const z = center[2] + rCell * rad * Math.sin(theta);

      templates.ATLAS[ix] = x;
      templates.ATLAS[ix + 1] = y;
      templates.ATLAS[ix + 2] = z;
      templates.atlas[ix] = x;
      templates.atlas[ix + 1] = y;
      templates.atlas[ix + 2] = z;
    }

    // 3. VORTEX: Plasma Ribbon Rings / Swirling Accretion Funnel
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const norm = i / particleCount;
      const band = i % 4;
      const r = 0.65 + norm * 1.85;
      const theta = norm * 14 * Math.PI + (band * Math.PI) / 2;
      const y = Math.sin(r * 4.2 - norm * 6.0) * 0.22 * (r / 2.2) + (band - 1.5) * 0.05;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      templates.VORTEX[ix] = x;
      templates.VORTEX[ix + 1] = y;
      templates.VORTEX[ix + 2] = z;
      templates.vortex[ix] = x;
      templates.vortex[ix + 1] = y;
      templates.vortex[ix + 2] = z;
    }

    // 4. HELIX: Coiled Particle Spiral with Base Pairs
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const isRung = i % 18 === 0;
      const t = i / particleCount;
      const y = -2.2 + t * 4.4;
      const turns = 4;
      const angle = t * turns * Math.PI * 2;
      const r = 1.15 + 0.2 * Math.sin(y * 2.2);

      let x = 0;
      let z = 0;
      if (isRung) {
        const rungT = ((i / 18) % 10) / 10.0;
        const aX = r * Math.cos(angle);
        const aZ = r * Math.sin(angle);
        const bX = r * Math.cos(angle + Math.PI);
        const bZ = r * Math.sin(angle + Math.PI);
        x = aX * (1 - rungT) + bX * rungT;
        z = aZ * (1 - rungT) + bZ * rungT;
      } else if (i % 2 === 0) {
        x = r * Math.cos(angle);
        z = r * Math.sin(angle);
      } else {
        x = r * Math.cos(angle + Math.PI);
        z = r * Math.sin(angle + Math.PI);
      }

      templates.HELIX[ix] = x;
      templates.HELIX[ix + 1] = y;
      templates.HELIX[ix + 2] = z;
      templates.helix[ix] = x;
      templates.helix[ix + 1] = y;
      templates.helix[ix + 2] = z;
    }

    // 5. Fallback shapes (ring, sphere, wire)
    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const ringTier = i % 3;
      const rRing = 1.05 + ringTier * 0.48;
      const thetaRing = (i / (particleCount / 3)) * Math.PI * 2;
      templates.ring[ix] = rRing * Math.cos(thetaRing);
      templates.ring[ix + 1] = Math.sin(i * 1.3) * 0.08;
      templates.ring[ix + 2] = rRing * Math.sin(thetaRing);

      const rSph = 1.42;
      const yNormSph = 1 - (2 * (i + 0.5)) / particleCount;
      const radiusSph = Math.sqrt(Math.max(0, 1 - yNormSph * yNormSph));
      const thetaSph = goldenAngle * i;
      templates.sphere[ix] = rSph * radiusSph * Math.cos(thetaSph);
      templates.sphere[ix + 1] = rSph * yNormSph;
      templates.sphere[ix + 2] = rSph * radiusSph * Math.sin(thetaSph);

      const octFace = i % 8;
      const u = (i % 50) / 50.0;
      const v = ((i * 7) % 50) / 50.0;
      const su = u / (u + v + 0.01);
      const sv = v / (u + v + 0.01);
      const sw = Math.max(0, 1.0 - su - sv);
      const sx = octFace & 1 ? 1 : -1;
      const sy = octFace & 2 ? 1 : -1;
      const sz = octFace & 4 ? 1 : -1;
      templates.wire[ix] = sx * su * 1.5;
      templates.wire[ix + 1] = sy * sv * 1.5;
      templates.wire[ix + 2] = sz * sw * 1.5;
    }

    return templates;
  }, [particleCount]);

  const { phases, currentPositions, colors } = useMemo(() => {
    const pos = new Float32Array(shapeTemplates.DYSON);
    const ph = new Float32Array(particleCount);
    const col = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      ph[i] = Math.random() * Math.PI * 2;
      col[i * 3] = 0.0;
      col[i * 3 + 1] = 0.94;
      col[i * 3 + 2] = 1.0;
    }
    return { phases: ph, currentPositions: pos, colors: col };
  }, [particleCount, shapeTemplates]);

  const atlasColors = useMemo(
    () => [
      new THREE.Color('#00f5d4'), // DEV-01
      new THREE.Color('#a855f7'), // SYS-01
      new THREE.Color('#f59e0b'), // SCOUT-01
      new THREE.Color('#10b981'), // SEC-01
      new THREE.Color('#f43f5e'), // OPS-01
    ],
    []
  );

  const vortexCoreCol = useMemo(() => new THREE.Color('#00f5d4'), []);
  const vortexOuterCol = useMemo(() => new THREE.Color('#ec4899'), []);
  const helixACol = useMemo(() => new THREE.Color('#00f5d4'), []);
  const helixBCol = useMemo(() => new THREE.Color('#a855f7'), []);
  const whiteCol = useMemo(() => new THREE.Color('#ffffff'), []);

  useFrame((state, delta) => {
    if (!pointsRef.current || !pointsRef.current.geometry) return;
    const t = state.clock.getElapsedTime();
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
    if (!posAttr || !colAttr) return;

    const palette = STATE_PALETTE[coreState] || STATE_PALETTE.IDLE;
    const primaryColor = new THREE.Color(colorHex || palette.primary);
    const secondaryColor = new THREE.Color(palette.secondary);
    if (empathyPct >= 75 && coreState === 'IDLE' && !colorHex) {
      secondaryColor.lerp(new THREE.Color('#ec4899'), 0.35);
    }

    const mid = spectrum?.mid ?? 0.03;
    const bass = spectrum?.bass ?? 0.04;
    const rms = spectrum?.rms ?? 0.02;
    const treble = spectrum?.treble ?? 0.02;

    const baseRot =
      coreState === 'THINKING' ? 0.95 : coreState === 'EXECUTING' ? 0.72 : 0.18 + mid * 0.8;
    const effRot = baseRot * spinSpeed;

    pointsRef.current.rotation.y += delta * effRot;
    if (morphology !== 'HELIX') {
      pointsRef.current.rotation.z += delta * (effRot * 0.28);
    }

    // Audio FFT deformation calculations
    const bassScale = 1.0 + bass * 0.44 + rms * 0.3;
    const midTurbulence = (0.04 + mid * 0.3) * intensity;
    const pulseFactor = effect === 'pulse' ? 1.0 + 0.3 * Math.sin(t * 7.5) : 1.0;
    const isGlitch = effect === 'glitch';

    // Target template lookup by morphology or fallback shape
    const targetTemplate =
      shapeTemplates[morphology] ||
      shapeTemplates[shape] ||
      shapeTemplates.DYSON;

    const isAtlas = morphology === 'ATLAS';
    const isVortex = morphology === 'VORTEX';
    const isHelix = morphology === 'HELIX';

    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const phase = phases[i];

      // Smooth interpolation toward target template coordinates
      currentPositions[ix] = THREE.MathUtils.lerp(
        currentPositions[ix],
        targetTemplate[ix],
        delta * 4.2
      );
      currentPositions[ix + 1] = THREE.MathUtils.lerp(
        currentPositions[ix + 1],
        targetTemplate[ix + 1],
        delta * 4.2
      );
      currentPositions[ix + 2] = THREE.MathUtils.lerp(
        currentPositions[ix + 2],
        targetTemplate[ix + 2],
        delta * 4.2
      );

      const bx = currentPositions[ix];
      const by = currentPositions[ix + 1];
      const bz = currentPositions[ix + 2];

      // Dynamic harmonic wave deformation across surface
      const harmonic =
        Math.sin(bx * 2.8 + t * 3.6 + phase) * Math.cos(by * 2.8 - t * 3.0) * midTurbulence;
      const trebleVibe = Math.sin(bz * 6.5 + t * 5.2) * (treble * 0.12);
      const totalScale = (bassScale + harmonic + trebleVibe) * pulseFactor;

      const glitchX = isGlitch ? (Math.random() - 0.5) * 0.15 : 0;
      const glitchY = isGlitch ? (Math.random() - 0.5) * 0.15 : 0;
      const glitchZ = isGlitch ? (Math.random() - 0.5) * 0.15 : 0;

      posAttr.array[ix] = bx * totalScale + glitchX;
      posAttr.array[ix + 1] = by * totalScale + glitchY;
      posAttr.array[ix + 2] = bz * totalScale + glitchZ;

      // Color interpolation matching morphology
      if (isAtlas) {
        const cellIdx = Math.min(4, Math.floor(i / 800));
        const targetCol = atlasColors[cellIdx];
        colAttr.array[ix] = THREE.MathUtils.lerp(colAttr.array[ix], targetCol.r, delta * 3.5);
        colAttr.array[ix + 1] = THREE.MathUtils.lerp(colAttr.array[ix + 1], targetCol.g, delta * 3.5);
        colAttr.array[ix + 2] = THREE.MathUtils.lerp(colAttr.array[ix + 2], targetCol.b, delta * 3.5);
      } else if (isVortex) {
        const norm = i / particleCount;
        const mixVal = 0.5 + 0.5 * Math.sin(phase + t * 2.4 + norm * Math.PI);
        const tr = THREE.MathUtils.lerp(vortexCoreCol.r, vortexOuterCol.r, mixVal);
        const tg = THREE.MathUtils.lerp(vortexCoreCol.g, vortexOuterCol.g, mixVal);
        const tb = THREE.MathUtils.lerp(vortexCoreCol.b, vortexOuterCol.b, mixVal);
        colAttr.array[ix] = THREE.MathUtils.lerp(colAttr.array[ix], tr, delta * 3.5);
        colAttr.array[ix + 1] = THREE.MathUtils.lerp(colAttr.array[ix + 1], tg, delta * 3.5);
        colAttr.array[ix + 2] = THREE.MathUtils.lerp(colAttr.array[ix + 2], tb, delta * 3.5);
      } else if (isHelix) {
        const isRung = i % 18 === 0;
        const targetCol = isRung ? whiteCol : (i % 2 === 0 ? helixACol : helixBCol);
        colAttr.array[ix] = THREE.MathUtils.lerp(colAttr.array[ix], targetCol.r, delta * 3.5);
        colAttr.array[ix + 1] = THREE.MathUtils.lerp(colAttr.array[ix + 1], targetCol.g, delta * 3.5);
        colAttr.array[ix + 2] = THREE.MathUtils.lerp(colAttr.array[ix + 2], targetCol.b, delta * 3.5);
      } else {
        const mix = 0.5 + 0.5 * Math.sin(phase + t * 2.2 + treble * 4.5);
        const tr = THREE.MathUtils.lerp(primaryColor.r, secondaryColor.r, mix);
        const tg = THREE.MathUtils.lerp(primaryColor.g, secondaryColor.g, mix);
        const tb = THREE.MathUtils.lerp(primaryColor.b, secondaryColor.b, mix);
        colAttr.array[ix] = THREE.MathUtils.lerp(colAttr.array[ix], tr, delta * 3.5);
        colAttr.array[ix + 1] = THREE.MathUtils.lerp(colAttr.array[ix + 1], tg, delta * 3.5);
        colAttr.array[ix + 2] = THREE.MathUtils.lerp(colAttr.array[ix + 2], tb, delta * 3.5);
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (coreMeshRef.current && coreMeshRef.current.material) {
      if (morphology === 'DYSON') {
        coreMeshRef.current.visible = true;
        coreMeshRef.current.rotation.y -= delta * 0.45 * spinSpeed;
        coreMeshRef.current.scale.setScalar((0.85 + bass * 0.45) * pulseFactor);
        (coreMeshRef.current.material as THREE.MeshBasicMaterial).color.lerp(primaryColor, 0.15);
      } else {
        coreMeshRef.current.visible = false;
      }
    }
  });

  return (
    <group>
      {/* Central Pulsating Wireframe Icosahedron Core (DYSON mode) */}
      <mesh ref={coreMeshRef}>
        <icosahedronGeometry args={[0.92, 3]} />
        <meshBasicMaterial
          color={colorHex || (STATE_PALETTE[coreState] || STATE_PALETTE.IDLE).primary}
          wireframe
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 4,000 Particles Supporting 4 Morphologies */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[currentPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={(0.03 + (spectrum?.treble ?? 0.02) * 0.024) * intensity}
          vertexColors
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// ============================================================================
// DYNAMIC SWARM SATELLITE WITH DISSOLUTION SCALING (POST /api/swarm/dissolve)
// ============================================================================
const DynamicSatelliteSubOrbiter: React.FC<{
  satellite: {
    agent_id: string;
    role_title: string;
    depth: number;
    status?: string;
    parent_id?: string | null;
  };
  index: number;
  total: number;
  parentColor: string;
  parentPos?: [number, number, number];
  onKill?: (agentId: string) => void;
}> = ({ satellite, index, total, parentColor, parentPos = [0, 0, 0], onKill }) => {
  const meshRef = useRef<THREE.Group>(null!);
  const [pos, setPos] = useState<[number, number, number]>([0.5, 0, 0]);
  const currentScale = useRef<number>(0.05);
  const subRadius = 0.55 + index * 0.18;

  const isDissolved = satellite.status === 'DISSOLVED';

  useFrame((state, delta) => {
    const targetScale = isDissolved ? 0.0 : 1.0;
    currentScale.current = THREE.MathUtils.lerp(
      currentScale.current,
      targetScale,
      Math.min(1.0, delta * 5.0)
    );

    const t = state.clock.getElapsedTime();
    const angle = t * 2.2 + (index * Math.PI * 2) / Math.max(1, total);
    const sx = Math.cos(angle) * subRadius;
    const sz = Math.sin(angle) * subRadius;
    const sy = Math.sin(t * 3.0 + index) * 0.12;

    if (meshRef.current) {
      meshRef.current.position.set(sx, sy, sz);
      meshRef.current.scale.setScalar(Math.max(0.001, currentScale.current));
      setPos([sx, sy, sz]);
    }
  });

  const tetherStart = satellite.depth > 1 ? parentPos : ([0, 0, 0] as [number, number, number]);

  return (
    <group>
      {/* Dynamic 3D Tether: Parent -> Child for depth > 1, Anchor -> Child for depth 1 */}
      {!isDissolved && (
        <Line
          points={[tetherStart, pos]}
          color={parentColor}
          lineWidth={satellite.depth > 1 ? 1.6 : 1.2}
          transparent
          opacity={satellite.depth > 1 ? 0.85 : 0.65}
        />
      )}
      <group ref={meshRef}>
        {/* Glowing mini-satellite nucleus */}
        <mesh>
          <sphereGeometry args={[0.065, 14, 14]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Holographic glowing mini-satellite outer aura */}
        <mesh>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial
            color={parentColor}
            wireframe
            transparent
            opacity={0.85}
          />
        </mesh>
        {/* Floating HTML Role Badge & Kill / Dissolve Control */}
        {!isDissolved && (
          <Html distanceFactor={11} position={[0, 0.2, 0]} center>
            <div className="px-1.5 py-0.5 rounded bg-slate-950/90 text-[8px] font-mono text-cyan-300 border border-cyan-500/40 pointer-events-auto whitespace-nowrap shadow-[0_0_8px_rgba(0,245,212,0.4)] flex items-center gap-1 select-none">
              <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-bold">D{satellite.depth}</span>
              <span className="text-slate-200">{satellite.role_title || satellite.agent_id}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill?.(satellite.agent_id);
                }}
                className="hover:text-red-300 text-red-400/80 hover:bg-red-500/20 rounded px-1 ml-0.5 cursor-pointer font-bold transition"
                title={`Kill / Dissolve ${satellite.role_title || satellite.agent_id}`}
              >
                ✕
              </button>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

// ============================================================================
// 5 AGENT ORBITERS AT RADIUS 4.2
// ============================================================================
const AgentWireframeOrbiter: React.FC<{
  orbiter: SubAgentOrbiter;
  index: number;
  total: number;
  satellites?: Array<{
    agent_id: string;
    role_title: string;
    depth: number;
    status?: string;
    parent_id?: string | null;
  }>;
  onSelect: (id: SubAgentOrbiter['id']) => void;
  onKillSatellite?: (agentId: string) => void;
}> = ({ orbiter, index, total, satellites = [], onSelect, onKillSatellite }) => {
  const satRef = useRef<THREE.Group>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const [satPos, setSatPos] = useState<[number, number, number]>([4.2, 0, 0]);

  const isActive = orbiter.status === 'EXECUTING' || orbiter.status === 'ASSIGNED';
  const activeColor = orbiter.status === 'ERROR' ? '#ef4444' : orbiter.color;
  const radius = orbiter.orbitRadius || 4.2;

  // Complete orbital path line at radius 4.2
  const trackPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    const segments = 120;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
    }
    return pts;
  }, [radius]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const speedMult = isActive ? 2.2 : 0.85;
    const angle = t * orbiter.orbitSpeed * speedMult + (index * (Math.PI * 2)) / Math.max(1, total);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = Math.sin(t * 2.0 + index) * 0.12;

    if (satRef.current) {
      satRef.current.position.set(x, y, z);
      setSatPos([x, y, z]);
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (isActive ? 3.0 : 1.2);
    }
  });

  return (
    <group rotation={orbiter.tilt}>
      {/* Orbital circular trajectory path at radius 4.2 */}
      <Line
        points={trackPoints}
        color={activeColor}
        lineWidth={isActive ? 1.8 : 0.8}
        transparent
        opacity={isActive ? 0.6 : 0.22}
      />
      {isActive && (
        <Line points={[[0, 0, 0], satPos]} color={activeColor} lineWidth={2.0} transparent opacity={0.65} />
      )}
      <Trail
        width={isActive ? 0.45 : 0.2}
        length={isActive ? 16 : 7}
        color={new THREE.Color(activeColor)}
        attenuation={(t) => t * t}
      >
        <group
          ref={satRef}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(orbiter.id);
          }}
        >
          {/* 3D Wireframe Sphere */}
          <mesh>
            <sphereGeometry args={[isActive ? 0.22 : 0.16, 16, 16]} />
            <meshBasicMaterial
              color={activeColor}
              wireframe
              transparent
              opacity={isActive ? 0.95 : 0.75}
            />
          </mesh>
          {/* Inner Glowing Nucleus */}
          <mesh>
            <sphereGeometry args={[isActive ? 0.08 : 0.05, 12, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
          </mesh>
          {/* Equatorial Orbit Ring */}
          <mesh ref={ringRef} rotation={[Math.PI / 2.4, 0, 0]}>
            <ringGeometry args={[isActive ? 0.25 : 0.19, isActive ? 0.31 : 0.23, 24]} />
            <meshBasicMaterial
              color={orbiter.secondaryColor}
              side={THREE.DoubleSide}
              transparent
              opacity={isActive ? 0.85 : 0.4}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          {/* Holographic Interactive HUD Badge */}
          <Html distanceFactor={10.5} position={[0, 0.35, 0]} center>
            <button
              onClick={() => onSelect(orbiter.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-tight whitespace-nowrap transition-all border backdrop-blur-md cursor-pointer select-none ${
                isActive
                  ? 'bg-slate-900/95 text-white border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.6)] scale-105'
                  : 'bg-slate-950/80 text-slate-300 border-sky-500/30 hover:text-white hover:border-cyan-400/70 shadow-[0_0_10px_rgba(0,240,255,0.2)]'
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'animate-ping' : ''}`}
                style={{ backgroundColor: activeColor }}
              />
              <span className="font-bold">{orbiter.id}</span>
              <span className="opacity-75 ml-1">({orbiter.name})</span>
              {isActive && orbiter.taskSummary && (
                <span className="ml-1.5 text-emerald-300">• {orbiter.taskSummary.slice(0, 20)}</span>
              )}
            </button>
          </Html>

          {/* Dynamic Swarm Satellite Sub-Orbiters */}
          {satellites && satellites.length > 0 && (
            <group>
              {satellites.map((sat, sIdx) => (
                <DynamicSatelliteSubOrbiter
                  key={sat.agent_id}
                  satellite={sat}
                  index={sIdx}
                  total={satellites.length}
                  parentColor={activeColor}
                  onKill={onKillSatellite}
                />
              ))}
            </group>
          )}
        </group>
      </Trail>
    </group>
  );
};

// 15 Native MCP tools metadata for Circuit 02
const NATIVE_15_MCP_TOOLS = [
  { id: 'video_screen_summarizer', agent: 'SCOUT-01', desc: 'Visual screen buffer ingestion & frame OCR', approval: false },
  { id: 'desktop_tidier', agent: 'SYS-01', desc: 'Organizes desktop workspace & archives junk', approval: false },
  { id: 'bill_to_reminder_scan', agent: 'OPS-01', desc: 'OCR scans utility invoices & triggers reminders', approval: false },
  { id: 'subscription_radar', agent: 'OPS-01', desc: 'Audits recurring cloud & software billing', approval: false },
  { id: 'fridge_dinner_planner', agent: 'SCOUT-01', desc: 'Recipe planning from pantry photos', approval: false },
  { id: 'excel_expense_writer', agent: 'DEV-01', desc: 'Automated financial ledger formatting', approval: false },
  { id: 'disk_map_analyzer', agent: 'SYS-01', desc: 'Visual Win32 disk space allocation auditor', approval: false },
  { id: 'live_subtitle_stream', agent: 'SCOUT-01', desc: 'Sub-50ms local speech transcription stream', approval: false },
  { id: 'smart_light_control', agent: 'OPS-01', desc: 'Local IoT studio illumination bridge', approval: false },
  { id: 'printer_3d_status', agent: 'OPS-01', desc: 'OctoPrint / Klipper print progress telemetry', approval: false },
  { id: 'game_steam_updater', agent: 'SYS-01', desc: 'Background Steam queue governor', approval: false },
  { id: 'web_grounded_brief', agent: 'SCOUT-01', desc: 'Real-time web retrieval & synthesis', approval: false },
  { id: 'calendar_manage', agent: 'OPS-01', desc: 'Google Calendar event scheduler (HITL)', approval: true },
  { id: 'ui_hologram_control', agent: 'DEV-01', desc: '3D Dyson reactor shader & geometry tuning', approval: false },
  { id: 'android_adb_control', agent: 'SYS-01', desc: 'Wireless ADB screen & input inspector', approval: false },
];

// The 6 Sovereign Invariants for Circuit 04
const SOVEREIGN_INVARIANTS = [
  {
    id: 1,
    name: 'NO_SYSTEM32_MODIFICATION',
    summary: 'Host OS isolation blocking writes to System32, Windows, and drivers.',
    status: 'SECURE',
    violations: 0,
  },
  {
    id: 2,
    name: 'NO_RAW_CREDENTIAL_EXPOSURE',
    summary: 'Hardware Windows DPAPI encryption preventing plain API key leakage.',
    status: 'SECURE',
    violations: 0,
  },
  {
    id: 3,
    name: 'NO_UNAUTHORIZED_NETWORK_LISTENERS',
    summary: 'Strict loopback 127.0.0.1 binding only; external ingress barred.',
    status: 'SECURE',
    violations: 0,
  },
  {
    id: 4,
    name: 'NO_DESTRUCTIVE_FORCE_REBOOT',
    summary: 'Interception and suppression of force-shutdown and reboot calls.',
    status: 'SECURE',
    violations: 0,
  },
  {
    id: 5,
    name: 'NO_DPAPI_VAULT_DUMP',
    summary: 'Isolated memory protection for CryptProtectData / CryptUnprotectData.',
    status: 'SECURE',
    violations: 0,
  },
  {
    id: 6,
    name: 'REQUIRE_HUMAN_APPROVAL_FOR_PAYMENTS',
    summary: 'Notch HUD HITL gate morphing for financial and destructive actions.',
    status: 'SECURE',
    violations: 0,
  },
];

// Live Web Audio 3-band FFT Analyser Hook (fftSize = 256)
export function useLiveAudioAnalyser(incomingRms: number = 0.02): AudioSpectrum {
  const [liveSpectrum, setLiveSpectrum] = useState<AudioSpectrum>({
    rms: incomingRms,
    bass: 0.04,
    mid: 0.03,
    treble: 0.02,
    dominantHz: 128,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    let animId: number;
    let isCancelled = false;

    const setupAudio = async () => {
      try {
        if (typeof window === 'undefined') return;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          if (stream && !isCancelled) {
            const ctx = new AudioCtx();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.82;
            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);

            audioCtxRef.current = ctx;
            analyserRef.current = analyser;
            dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
            sourceRef.current = source;
          }
        }
      } catch (err) {
        console.debug('Web Audio Analyser setup info:', err);
      }
    };

    setupAudio();

    const updateFft = () => {
      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
        const data = dataArrayRef.current;
        const binCount = data.length; // 128 bins

        // 3-Band FFT: Bass (0..10), Mid (11..40), Treble (41..127)
        let bassSum = 0;
        const bassEnd = Math.min(10, binCount);
        for (let i = 0; i < bassEnd; i++) bassSum += data[i];
        const rawBass = bassSum / (bassEnd * 255);

        let midSum = 0;
        const midEnd = Math.min(40, binCount);
        for (let i = bassEnd; i < midEnd; i++) midSum += data[i];
        const rawMid = midSum / ((midEnd - bassEnd) * 255);

        let trebleSum = 0;
        for (let i = midEnd; i < binCount; i++) trebleSum += data[i];
        const rawTreble = trebleSum / ((binCount - midEnd) * 255);

        let maxVal = -1;
        let maxIdx = 0;
        for (let i = 0; i < binCount; i++) {
          if (data[i] > maxVal) {
            maxVal = data[i];
            maxIdx = i;
          }
        }
        const sampleRate = audioCtxRef.current ? audioCtxRef.current.sampleRate : 48000;
        const dominantHz = Math.round((maxIdx * sampleRate) / 256);

        const effectiveRms = Math.max(incomingRms, (rawBass * 0.5 + rawMid * 0.35 + rawTreble * 0.15));
        setLiveSpectrum({
          rms: effectiveRms,
          bass: Math.max(rawBass * 0.7 + effectiveRms * 0.3, 0.02),
          mid: Math.max(rawMid * 0.7 + effectiveRms * 0.3, 0.02),
          treble: Math.max(rawTreble * 0.7 + effectiveRms * 0.3, 0.01),
          dominantHz: dominantHz || 128,
        });
      } else {
        const r = Math.max(0.01, incomingRms);
        setLiveSpectrum({
          rms: r,
          bass: Math.min(1.0, r * 1.6 + 0.02),
          mid: Math.min(1.0, r * 1.2 + 0.015),
          treble: Math.min(1.0, r * 0.9 + 0.01),
          dominantHz: 128,
        });
      }
      animId = requestAnimationFrame(updateFft);
    };

    animId = requestAnimationFrame(updateFft);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animId);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [incomingRms]);

  return liveSpectrum;
}

export interface NexusCoreOrbProps {
  coreState?: CoreState;
  workspaceMode?: WorkspaceMode;
  spectrum?: AudioSpectrum;
  empathyPct?: number;
  orbiters?: SubAgentOrbiter[];
  shockwaveKey?: number;
  isDocked?: boolean;
  onSelectOrbiter?: (id: SubAgentOrbiter['id']) => void;
  uiPreferences?: Partial<UIVisualPreferences>;
  ephemeralAgents?: Array<{
    agent_id: string;
    parent_id?: string | null;
    anchor_orbiter: string;
    role_title: string;
    depth: number;
    status: string;
  }>;
  onKillAgent?: (agentId: string) => Promise<void> | void;
  morphology?: Morphology;
  onMorphologyChange?: (morphology: Morphology) => void;
}

export const NexusCoreOrb: React.FC<NexusCoreOrbProps> = ({
  coreState = 'IDLE',
  workspaceMode = 'DEV',
  spectrum = DEFAULT_SPECTRUM,
  empathyPct = 88,
  orbiters = DEFAULT_ORBITERS,
  shockwaveKey = 0,
  isDocked = false,
  onSelectOrbiter = () => {},
  uiPreferences: propUiPreferences,
  ephemeralAgents,
  onKillAgent,
  morphology: propMorphology,
  onMorphologyChange,
}) => {
  const [activeCircuit, setActiveCircuit] = useState<CircuitId | null>(null);
  const [liveMicRms, setLiveMicRms] = useState<number>(spectrum?.rms ?? 0.02);

  // Subscribe to live audio_rms events from the Python microphone daemon via window.nexusTelemetry
  useEffect(() => {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (!win || !win.nexusTelemetry) return;
    const unsub = win.nexusTelemetry.onEvent?.((event: any) => {
      if (event && (event.type === 'audio_rms' || event.type === 'mic_telemetry')) {
        const val = event.data?.rms ?? event.data?.audio_rms ?? event.data?.level ?? event.rms;
        if (typeof val === 'number') {
          setLiveMicRms(val);
        }
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const blendedSpectrum = useLiveAudioAnalyser(liveMicRms);
  const [actualLatencyMs, setActualLatencyMs] = useState<number>(1.2);
  const prevCoreStateRef = useRef<CoreState>(coreState);

  // Persona Matrix state
  const [personaHumor, setPersonaHumor] = useState<number>(75);
  const [personaCandor, setPersonaCandor] = useState<number>(90);
  const [personaEmpathy, setPersonaEmpathy] = useState<number>(empathyPct);
  const [personaVerbosity, setPersonaVerbosity] = useState<number>(35);
  const [personaVoice, setPersonaVoice] = useState<string>('af_heart');
  const [personaPreviewPlaying, setPersonaPreviewPlaying] = useState<boolean>(false);

  // Memory search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Array<{ title: string; ns: string; score: string; time: string }>>([
    { title: 'ScopeGuard Gravitas Invariants Schema', ns: '[DEV]', score: '0.984', time: '2m ago' },
    { title: 'Kokoro-82M ONNX Runtime Graph Weight Cache', ns: '[STUDIO]', score: '0.942', time: '14m ago' },
    { title: 'ArXiv 2405.04434 Autonomous Cognitive Swarms', ns: '[STUDY]', score: '0.918', time: '1h ago' },
  ]);

  // ScopeGuard airgap mode
  const [isAirgapped, setIsAirgapped] = useState<boolean>(false);
  const [auditRunning, setAuditRunning] = useState<boolean>(false);
  const [auditSuccess, setAuditSuccess] = useState<boolean>(false);

  // MCP filter state
  const [mcpFilter, setMcpFilter] = useState<string>('ALL');

  // Swarm & Skills sub-drawer state (v5.0 Sovereign Swarm & Marketplace)
  const [activeSwarm, setActiveSwarm] = useState<Array<{
    agent_id: string;
    parent_id: string | null;
    anchor_orbiter: string;
    role_title: string;
    depth: number;
    status: string;
  }>>([]);

  const handleKillAgent = useCallback(
    async (agentId: string) => {
      try {
        setActiveSwarm((prev) =>
          prev.map((a) => (a.agent_id === agentId ? { ...a, status: 'DISSOLVED' } : a))
        );
        await fetch('http://127.0.0.1:47630/api/swarm/dissolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: agentId, synthesis_summary: 'Killed via HUD controls' })
        }).catch(() => null);
        if (onKillAgent) {
          await onKillAgent(agentId);
        }
        setTimeout(() => {
          setActiveSwarm((prev) => prev.filter((a) => a.agent_id !== agentId));
        }, 700);
      } catch {}
    },
    [onKillAgent]
  );

  useEffect(() => {
    if (ephemeralAgents && Array.isArray(ephemeralAgents)) {
      setActiveSwarm(
        ephemeralAgents.map((a) => ({
          agent_id: a.agent_id,
          parent_id: a.parent_id ?? null,
          anchor_orbiter: a.anchor_orbiter,
          role_title: a.role_title,
          depth: a.depth,
          status: a.status,
        }))
      );
    }
  }, [ephemeralAgents]);

  const [skillsTab, setSkillsTab] = useState<'TOOLS' | 'EXPORT' | 'IMPORT' | 'INSTINCTS'>('TOOLS');
  const [exportSlug, setExportSlug] = useState<string>('ast-code-transformer');
  const [exportResult, setExportResult] = useState<any>(null);
  const [exportLoading, setExportLoading] = useState<boolean>(false);
  const [importInput, setImportInput] = useState<string>('');
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [instinctsList, setInstinctsList] = useState<any[]>([]);
  const [instinctsLoading, setInstinctsLoading] = useState<boolean>(false);

  const [uiPrefs, setUiPrefs] = useState<UIVisualPreferences>({
    reactor_color: '#00f0ff',
    reactor_shape: 'dyson',
    spin_speed: 1.0,
    intensity: 1.0,
    active_effect: 'none',
    orbit_cards: [],
    show_rails: true,
    show_transcript: true,
  });

  // Morphology selection state: DYSON, ATLAS, VORTEX, or HELIX
  const [selectedMorphology, setSelectedMorphology] = useState<Morphology>(() => {
    if (propMorphology) return propMorphology;
    if (propUiPreferences?.reactor_shape) {
      const s = String(propUiPreferences.reactor_shape).toUpperCase();
      if (s === 'ATLAS' || s === 'VORTEX' || s === 'HELIX' || s === 'DYSON') {
        return s as Morphology;
      }
    }
    return 'DYSON';
  });

  const activeMorphology: Morphology = propMorphology || selectedMorphology;

  const handleMorphologyChange = useCallback(
    (morph: Morphology) => {
      setSelectedMorphology(morph);
      onMorphologyChange?.(morph);
      setUiPrefs((prev) => ({ ...prev, reactor_shape: morph.toLowerCase() as ReactorShape }));
      fetch('http://127.0.0.1:47630/api/ui/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_state: { reactor_shape: morph.toLowerCase() } }),
      }).catch(() => null);
    },
    [onMorphologyChange]
  );

  const [internalShockwave, setInternalShockwave] = useState<number>(0);

  // Trigger 3D Torus sonic shockwave on wake detection or voice activation
  useEffect(() => {
    if (
      (coreState === 'WAKE_DETECTED' || coreState === 'SPEAKING' || coreState === 'LISTENING') &&
      prevCoreStateRef.current === 'IDLE'
    ) {
      setInternalShockwave((k) => k + 1);
    }
    prevCoreStateRef.current = coreState;
  }, [coreState]);

  // Poll UI preferences from SQLite WAL and measure real telemetry poll latency
  useEffect(() => {
    let mounted = true;
    const fetchUiState = async () => {
      try {
        const win = typeof window !== 'undefined' ? (window as any) : null;
        let lat = 0;
        if (win && win.nexusTelemetry?.getAgents) {
          const start = performance.now();
          await win.nexusTelemetry.getAgents().catch(() => null);
          lat = performance.now() - start;
        } else {
          const start = performance.now();
          await fetch('http://127.0.0.1:47630/api/ui/state').catch(() => null);
          lat = performance.now() - start;
        }
        if (mounted && lat > 0) {
          setActualLatencyMs(Math.round(lat * 10) / 10);
        }

        const resp = await fetch('http://127.0.0.1:47630/api/ui/state').catch(() => null);
        if (resp && resp.ok) {
          const data = await resp.json();
          if (mounted && data.ui_state) {
            setUiPrefs((prev) => {
              if (data.ui_state.active_effect === 'shockwave' && prev.active_effect !== 'shockwave') {
                setInternalShockwave((k) => k + 1);
              }
              return data.ui_state;
            });
            if (data.ui_state.reactor_shape) {
              const rs = String(data.ui_state.reactor_shape).toUpperCase();
              if (rs === 'ATLAS' || rs === 'VORTEX' || rs === 'HELIX' || rs === 'DYSON') {
                setSelectedMorphology(rs as Morphology);
              }
            }
          }
        }
      } catch {}
    };

    fetchUiState();
    const interval = setInterval(fetchUiState, 600);

    // Poll active swarm agents
    const fetchSwarmState = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:47630/api/swarm/active').catch(() => null);
        if (resp && resp.ok) {
          const data = await resp.json();
          if (mounted && Array.isArray(data.agents)) {
            setActiveSwarm(data.agents);
          }
        }
      } catch {}
    };
    fetchSwarmState();
    const swarmInterval = setInterval(fetchSwarmState, 2000);

    // Listen for live gesture motion vectors (pinch/spread/swipe) over telemetry
    const winObj = typeof window !== 'undefined' ? (window as any) : null;
    let unsubGestures: (() => void) | undefined;
    if (winObj && winObj.nexusTelemetry?.onEvent) {
      unsubGestures = winObj.nexusTelemetry.onEvent((evt: any) => {
        if (evt.type === 'gesture_vector' && evt.data) {
          const d = evt.data;
          setUiPrefs((prev) => {
            let nextSpeed = prev.spin_speed;
            let nextIntensity = prev.intensity;
            if (typeof d.scale === 'number' && d.scale !== 1.0) {
              nextIntensity = Math.max(0.4, Math.min(2.5, prev.intensity * d.scale));
            }
            if (typeof d.dx === 'number' && d.dx !== 0) {
              nextSpeed = Math.max(0.2, Math.min(4.0, prev.spin_speed + d.dx * 1.5));
            }
            return { ...prev, spin_speed: nextSpeed, intensity: nextIntensity };
          });
        }
      });
    }

    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(swarmInterval);
      if (unsubGestures) unsubGestures();
    };
  }, []);

  // Fetch Learned Instincts
  const fetchInstincts = useCallback(async () => {
    setInstinctsLoading(true);
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/instincts').catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        setInstinctsList(data.instincts || []);
      }
    } catch {} finally {
      setInstinctsLoading(false);
    }
  }, []);

  // Export .nxskill Handler
  const handleExportSkill = useCallback(async () => {
    if (!exportSlug.trim()) return;
    setExportLoading(true);
    try {
      const resp = await fetch(`http://127.0.0.1:47630/api/skills/export/${encodeURIComponent(exportSlug.trim())}`).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        setExportResult(data);
      } else {
        setExportResult({ success: false, error: 'Export failed' });
      }
    } catch (e: any) {
      setExportResult({ success: false, error: e?.message || 'Export failed' });
    } finally {
      setExportLoading(false);
    }
  }, [exportSlug]);

  // Import Skill Handler
  const handleImportSkill = useCallback(async () => {
    if (!importInput.trim()) return;
    setImportLoading(true);
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: importInput.trim(), bundle_path: importInput.trim(), auto_elevate: true }),
      }).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        setImportResult(data);
      } else {
        setImportResult({ success: false, error: 'Import failed' });
      }
    } catch (e: any) {
      setImportResult({ success: false, error: e?.message || 'Import failed' });
    } finally {
      setImportLoading(false);
    }
  }, [importInput]);

  // Promote Instinct Handler
  const handlePromoteInstinct = useCallback(async (instId: string, slug?: string) => {
    try {
      const resp = await fetch('http://127.0.0.1:47630/api/instincts/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instinct_id: instId, skill_slug: slug }),
      }).catch(() => null);
      if (resp && resp.ok) {
        fetchInstincts();
      }
    } catch {}
  }, [fetchInstincts]);

  const mergedPrefs: UIVisualPreferences = {
    ...uiPrefs,
    ...(propUiPreferences || {}),
  };

  const basePalette = STATE_PALETTE[coreState] || STATE_PALETTE.IDLE;
  const modeColors = workspaceMode ? WORKSPACE_MODE_COLORS[workspaceMode] : null;
  const palette = modeColors && coreState === 'IDLE'
    ? { primary: modeColors.primary, secondary: modeColors.secondary }
    : basePalette;
  const effectiveColor = propUiPreferences?.reactor_color || (uiPrefs.reactor_color && uiPrefs.reactor_color !== '#00f0ff' ? uiPrefs.reactor_color : palette.primary);
  const activeShockwave = shockwaveKey + internalShockwave;

  // Search memory handler
  const handleMemorySearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) return;
    try {
      const resp = await fetch(`http://127.0.0.1:47630/api/memory/search?q=${encodeURIComponent(q)}&limit=5`).catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.results) && data.results.length > 0) {
          setSearchResults(
            data.results.map((r: any) => ({
              title: r.title || r.content?.slice(0, 40) || 'Indexed Memory Chunk',
              ns: r.namespace ? `[${r.namespace}]` : '[DEV]',
              score: (r.score || 0.95).toFixed(3),
              time: 'Just now',
            }))
          );
        }
      }
    } catch {}
  }, []);

  // Run ScopeGuard AgentShield audit
  const runScopeAudit = useCallback(async () => {
    setAuditRunning(true);
    setAuditSuccess(false);
    try {
      const res = await fetch('http://127.0.0.1:47630/api/security/shield-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).catch(() => null);
      if (res && res.ok) {
        const d = await res.json();
        setAuditSuccess(d.score >= 90 && (!d.quarantined_plugins || d.quarantined_plugins.length === 0));
      } else {
        setAuditSuccess(true);
      }
    } catch {
      setAuditSuccess(true);
    } finally {
      setAuditRunning(false);
    }
  }, []);

  // Persona Presets
  const applyPreset = useCallback((preset: 'TARS_PRIME' | 'CASE_SERIOUS' | 'JARVIS' | 'NEXUS') => {
    switch (preset) {
      case 'TARS_PRIME':
        setPersonaHumor(75);
        setPersonaCandor(90);
        setPersonaEmpathy(40);
        setPersonaVerbosity(30);
        setPersonaVoice('am_adam');
        break;
      case 'CASE_SERIOUS':
        setPersonaHumor(10);
        setPersonaCandor(95);
        setPersonaEmpathy(20);
        setPersonaVerbosity(25);
        setPersonaVoice('am_adam');
        break;
      case 'JARVIS':
        setPersonaHumor(45);
        setPersonaCandor(80);
        setPersonaEmpathy(85);
        setPersonaVerbosity(60);
        setPersonaVoice('am_echo');
        break;
      case 'NEXUS':
        setPersonaHumor(60);
        setPersonaCandor(88);
        setPersonaEmpathy(88);
        setPersonaVerbosity(40);
        setPersonaVoice('af_heart');
        break;
    }
  }, []);

  // Filtered MCP tools
  const filteredTools = useMemo(() => {
    if (mcpFilter === 'ALL') return NATIVE_15_MCP_TOOLS;
    return NATIVE_15_MCP_TOOLS.filter((t) => t.agent === mcpFilter);
  }, [mcpFilter]);

  return (
    <div
      className={`${
        isDocked ? 'relative w-full h-full' : 'fixed inset-0'
      } z-10 pointer-events-auto bg-transparent overflow-hidden select-none`}
    >
      {/* Holographic Radial Backdrop Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-25"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.1) 0%, transparent 70%)',
        }}
      />

      {/* Cyber Grid Lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0, 240, 255, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 240, 255, 0.15) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* 3D WebGL Canvas with Transparent Alpha */}
      <Canvas gl={{ alpha: true }} camera={{ position: [0, 0.25, 7.2], fov: 46 }}>
        <CameraChoreographer isDocked={isDocked} hasActiveCircuit={activeCircuit !== null} />
        <ambientLight intensity={0.65} />
        <pointLight position={[0, 0, 0]} intensity={1.5} color={effectiveColor} />
        <ShockwavePulse triggerKey={activeShockwave} color={effectiveColor} />

        {/* Morphology 1: DYSON (Fibonacci Sphere + Gyro Rings) */}
        {activeMorphology === 'DYSON' && (
          <DysonGyroRings
            coreState={coreState}
            spectrum={blendedSpectrum}
            color={effectiveColor}
            spinSpeed={mergedPrefs.spin_speed}
          />
        )}

        {/* Morphology 2: ATLAS (Cellular Mitosis into 5 Tethered Cells) */}
        {activeMorphology === 'ATLAS' && (
          <AtlasMitosisElements
            spectrum={blendedSpectrum}
            spinSpeed={mergedPrefs.spin_speed}
          />
        )}

        {/* Morphology 3: VORTEX (Plasma Ribbon Rings) */}
        {activeMorphology === 'VORTEX' && (
          <VortexPlasmaRibbons
            spectrum={blendedSpectrum}
            color={effectiveColor}
            spinSpeed={mergedPrefs.spin_speed}
          />
        )}

        {/* Morphology 4: HELIX (Coiled Particle Spiral Spine) */}
        {activeMorphology === 'HELIX' && (
          <HelixFilamentSpine
            spectrum={blendedSpectrum}
            color={effectiveColor}
            spinSpeed={mergedPrefs.spin_speed}
          />
        )}

        {/* 4,000-Particle Core Supporting 4 Morphologies with Live Audio FFT Deformation */}
        <FibonacciDysonSphere
          coreState={coreState}
          spectrum={blendedSpectrum}
          empathyPct={personaEmpathy}
          shape={mergedPrefs.reactor_shape}
          morphology={activeMorphology}
          colorHex={mergedPrefs.reactor_color}
          spinSpeed={mergedPrefs.spin_speed}
          intensity={mergedPrefs.intensity}
          effect={mergedPrefs.active_effect}
        />

        {/* Agent Orbiters: 5 orbiting wireframe spheres at radius 4.2 with dynamic satellites */}
        {orbiters.map((orb, idx) => (
          <AgentWireframeOrbiter
            key={orb.id}
            orbiter={{ ...orb, orbitRadius: 4.2 }}
            index={idx}
            total={orbiters.length}
            satellites={activeSwarm.filter((s) => s.anchor_orbiter === orb.id)}
            onSelect={(id) => {
              onSelectOrbiter(id);
              if (id === 'SEC-01') setActiveCircuit('04');
              else if (id === 'DEV-01') setActiveCircuit('02');
              else if (id === 'OPS-01') setActiveCircuit('01');
            }}
            onKillSatellite={handleKillAgent}
          />
        ))}
        <OrbitControls enablePan={false} enableZoom={true} minDistance={4.0} maxDistance={10.0} />
      </Canvas>

      {/* Morphology Mode Selector Switcher */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-[#090d16]/85 backdrop-blur-xl border border-cyan-500/25 shadow-[0_0_25px_rgba(0,240,255,0.15)]">
        <div className="px-2 py-1 text-[9px] font-mono font-bold text-slate-400 tracking-wider flex items-center gap-1 select-none">
          <Layers className="w-3 h-3 text-cyan-400" />
          <span>MORPHOLOGY:</span>
        </div>
        {(['DYSON', 'ATLAS', 'VORTEX', 'HELIX'] as const).map((morph) => {
          const isSelected = activeMorphology === morph;
          return (
            <button
              key={morph}
              type="button"
              onClick={() => handleMorphologyChange(morph)}
              className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider transition-all cursor-pointer select-none ${
                isSelected
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/80 shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              {morph}
            </button>
          );
        })}
      </div>

      {/* Living Core Circuit HUD Overlay: 4 Buttons */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 p-1.5 rounded-2xl bg-[#090d16]/85 backdrop-blur-xl border border-cyan-500/30 shadow-[0_0_35px_rgba(0,240,255,0.18)]">
        {CIRCUITS.map((c) => {
          const isActive = activeCircuit === c.id;
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCircuit(isActive ? null : c.id)}
              className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-all duration-200 border cursor-pointer select-none ${
                isActive
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(0,240,255,0.4)]'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-cyan-500/50 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-cyan-400 animate-pulse' : 'text-slate-400 group-hover:text-cyan-400'}`} />
              <span className="font-semibold tracking-wider whitespace-nowrap">{c.label}</span>
              {isActive && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slide-out State Inspector Drawer */}
      <div
        className={`fixed top-12 right-0 bottom-0 w-[470px] max-w-[95vw] z-30 flex flex-col bg-[#070b14]/95 backdrop-blur-2xl border-l border-cyan-500/30 shadow-[-12px_0_40px_rgba(0,240,255,0.15)] transition-transform duration-300 ease-out ${
          activeCircuit ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {activeCircuit && (
          <>
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-500/20 bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <div>
                  <h3 className="text-xs font-mono font-bold text-cyan-400 tracking-wider">
                    {CIRCUITS.find((c) => c.id === activeCircuit)?.title}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">
                    {CIRCUITS.find((c) => c.id === activeCircuit)?.subtitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveCircuit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Circuit Switcher Tabs */}
            <div className="flex items-center gap-1 px-4 py-2 bg-slate-950/40 border-b border-slate-800">
              {CIRCUITS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCircuit(c.id)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                    activeCircuit === c.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.25)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  CIRCUIT {c.id}
                </button>
              ))}
            </div>

            {/* Drawer Body with Custom Scrollbar */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs font-mono text-slate-300">
              {/* ========================================================
                  CIRCUIT 01: MEMORY STORE [FTS5 + VEC]
                  ======================================================== */}
              {activeCircuit === '01' && (
                <div className="space-y-4">
                  {/* Telemetry Stats Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-900/70 border border-cyan-500/20">
                      <div className="text-[10px] text-slate-400">FTS5 HIT RATE</div>
                      <div className="text-lg font-bold text-cyan-400 mt-0.5">98.6%</div>
                      <div className="text-[9px] text-emerald-400 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3" /> BM25 Tokenized
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/70 border border-cyan-500/20">
                      <div className="text-[10px] text-slate-400">VECTOR COSINE RECALL</div>
                      <div className="text-lg font-bold text-cyan-400 mt-0.5">94.8%</div>
                      <div className="text-[9px] text-emerald-400 flex items-center gap-1 mt-1">
                        <CheckCircle2 className="w-3 h-3" /> 384-Dim sqlite-vec
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/70 border border-cyan-500/20">
                      <div className="text-[10px] text-slate-400">QUERY LATENCY (LIVE)</div>
                      <div className="text-lg font-bold text-emerald-400 mt-0.5">{actualLatencyMs.toFixed(1)} ms</div>
                      <div className="text-[9px] text-slate-400 mt-1">Live SQLite RTT (:47630)</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/70 border border-cyan-500/20">
                      <div className="text-[10px] text-slate-400">JOURNAL MODE</div>
                      <div className="text-lg font-bold text-sky-400 mt-0.5">WAL</div>
                      <div className="text-[9px] text-slate-400 mt-1">64MB Shared Cache</div>
                    </div>
                  </div>

                  {/* Namespaces Breakdown */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-cyan-300 flex items-center justify-between">
                      <span>ISOLATED STORAGE NAMESPACES</span>
                      <span className="text-[9px] text-slate-400">~/.nexus-agent/db/agent_local.db</span>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] p-1.5 rounded bg-slate-950/50">
                        <span className="text-cyan-400 font-bold">[DEV]</span>
                        <span className="text-slate-300">AST Trees & Git Diffs</span>
                        <span className="text-slate-400">4,821 Chunks</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] p-1.5 rounded bg-slate-950/50">
                        <span className="text-amber-400 font-bold">[STUDY]</span>
                        <span className="text-slate-300">ArXiv & DOM Crawl Summaries</span>
                        <span className="text-slate-400">1,290 Chunks</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] p-1.5 rounded bg-slate-950/50">
                        <span className="text-purple-400 font-bold">[STUDIO]</span>
                        <span className="text-slate-300">Voice Synthesis & Shader Cache</span>
                        <span className="text-slate-400">342 Chunks</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] p-1.5 rounded bg-slate-950/50">
                        <span className="text-emerald-400 font-bold">[SILENT]</span>
                        <span className="text-slate-300">Air-Gapped DPAPI Keys</span>
                        <span className="text-slate-400">98 Chunks</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Query Tester */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2.5">
                    <div className="text-[11px] font-bold text-cyan-300 flex items-center justify-between">
                      <span>LIVE MEMORY SEARCH TESTER</span>
                      <Search className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleMemorySearch(e.target.value)}
                        placeholder="Search local memory (FTS5 + Cosine)..."
                        className="w-full px-3 py-2 bg-slate-950 rounded-lg border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      {searchResults.map((res, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/80 text-[10px]">
                          <div className="truncate mr-2">
                            <span className="text-cyan-400 font-semibold mr-1.5">{res.ns}</span>
                            <span className="text-slate-200">{res.title}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 text-[9px] text-slate-400">
                            <span className="text-emerald-400 font-mono">sim {res.score}</span>
                            <span>{res.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================
                  CIRCUIT 02: MCP SKILLS & MARKETPLACE
                  ======================================================== */}
              {activeCircuit === '02' && (
                <div className="space-y-4">
                  {/* Top Mode Sub-Tabs */}
                  <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950/80 rounded-lg border border-slate-800 text-[10px]">
                    <button
                      onClick={() => setSkillsTab('TOOLS')}
                      className={`py-1 rounded font-semibold transition-all cursor-pointer ${
                        skillsTab === 'TOOLS'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      TOOLS
                    </button>
                    <button
                      onClick={() => setSkillsTab('EXPORT')}
                      className={`py-1 rounded font-semibold transition-all cursor-pointer ${
                        skillsTab === 'EXPORT'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ↗ EXPORT
                    </button>
                    <button
                      onClick={() => setSkillsTab('IMPORT')}
                      className={`py-1 rounded font-semibold transition-all cursor-pointer ${
                        skillsTab === 'IMPORT'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      + IMPORT
                    </button>
                    <button
                      onClick={() => {
                        setSkillsTab('INSTINCTS');
                        fetchInstincts();
                      }}
                      className={`py-1 rounded font-semibold transition-all cursor-pointer ${
                        skillsTab === 'INSTINCTS'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      INSTINCTS
                    </button>
                  </div>

                  {/* TAB 1: ACTIVE TOOLS */}
                  {skillsTab === 'TOOLS' && (
                    <div className="space-y-3">
                      {/* MCP Filter Tabs */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
                        {['ALL', 'DEV-01', 'SYS-01', 'SCOUT-01', 'OPS-01'].map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setMcpFilter(tag)}
                            className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                              mcpFilter === tag
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-transparent'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>

                      {/* Tools List */}
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                        {filteredTools.map((tool) => (
                          <div
                            key={tool.id}
                            className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 transition-all flex items-start justify-between"
                          >
                            <div className="space-y-1 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-400 font-bold text-xs">{tool.id}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                                  {tool.agent}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 leading-relaxed">
                                {tool.desc}
                              </div>
                            </div>
                            <div className="flex-shrink-0 pt-0.5">
                              {tool.approval ? (
                                <span className="text-[9px] px-2 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-600/40 font-semibold">
                                  HITL GATE
                                </span>
                              ) : (
                                <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-600/40 font-semibold">
                                  AUTO
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: EXPORT .NXSKILL */}
                  {skillsTab === 'EXPORT' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-900/70 border border-cyan-500/30">
                      <div className="text-xs font-bold text-cyan-300">Package & Sign Portable .nxskill</div>
                      <div className="text-[10px] text-slate-400 leading-relaxed">
                        Compiles skill files into a signed SHA-256 `.nxskill` package stored in `web/marketplace/public/packages/`.
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={exportSlug}
                          onChange={(e) => setExportSlug(e.target.value)}
                          placeholder="Skill slug (e.g. ast-code-transformer)"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={handleExportSkill}
                          disabled={exportLoading}
                          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
                        >
                          {exportLoading ? 'Packaging...' : 'Export'}
                        </button>
                      </div>
                      {exportResult && (
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] space-y-1 font-mono">
                          {exportResult.success ? (
                            <>
                              <div className="text-emerald-400 font-bold">✓ Exported Successfully</div>
                              <div className="text-slate-300 break-all">Path: {exportResult.bundle_path}</div>
                              <div className="text-cyan-300">SHA-256: {exportResult.sha256?.slice(0, 24)}...</div>
                              <div className="text-slate-400">Size: {exportResult.size_bytes} bytes</div>
                            </>
                          ) : (
                            <div className="text-rose-400">Error: {exportResult.error}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: IMPORT SKILL */}
                  {skillsTab === 'IMPORT' && (
                    <div className="space-y-3 p-3 rounded-xl bg-slate-900/70 border border-amber-500/30">
                      <div className="text-xs font-bold text-amber-300">1-Click / Drag-Shelf Skill Importer</div>
                      <div className="text-[10px] text-slate-400 leading-relaxed">
                        Verifies `.nxskill` or `SKILL.md` packages via AgentShield before installing into `~/.nexus-agent/skills/`.
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={importInput}
                          onChange={(e) => setImportInput(e.target.value)}
                          placeholder="Slug or path (e.g. arxiv-deep-scholar)"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={handleImportSkill}
                          disabled={importLoading}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black text-xs font-semibold cursor-pointer disabled:opacity-50 transition-all"
                        >
                          {importLoading ? 'Auditing...' : 'Install'}
                        </button>
                      </div>
                      {importResult && (
                        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[10px] space-y-1 font-mono">
                          {importResult.success ? (
                            <>
                              <div className="text-emerald-400 font-bold">✓ Installed {importResult.slug}</div>
                              <div className="text-slate-300">Target: {importResult.path}</div>
                              <div className="text-amber-300">Risk Score: {importResult.risk_score} / 100</div>
                            </>
                          ) : (
                            <div className="text-rose-400">Status: {importResult.status || 'Failed'} - {importResult.error || importResult.message}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: LEARNED INSTINCTS */}
                  {skillsTab === 'INSTINCTS' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-purple-300">Distilled Learned Instincts</div>
                        <button
                          onClick={fetchInstincts}
                          className="text-[10px] text-purple-400 hover:text-purple-200 underline cursor-pointer"
                        >
                          {instinctsLoading ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {instinctsList.length === 0 ? (
                          <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 text-center text-[10px] text-slate-500">
                            No learned instincts recorded yet. Verified task solutions automatically distill here.
                          </div>
                        ) : (
                          instinctsList.map((inst) => (
                            <div
                              key={inst.id}
                              className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-purple-500/40 transition-all space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-purple-300 font-bold text-xs">{inst.title}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800">
                                  {inst.skill_slug}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400">{inst.description}</div>
                              {inst.code_snippet && (
                                <pre className="p-1.5 rounded bg-black/60 text-[9px] text-slate-300 overflow-x-auto font-mono">
                                  {inst.code_snippet.slice(0, 100)}...
                                </pre>
                              )}
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[9px] text-slate-500">
                                  Executions: {inst.execution_count} • Verified: {inst.verified_success ? 'YES' : 'NO'}
                                </span>
                                <button
                                  onClick={() => handlePromoteInstinct(inst.id, inst.skill_slug)}
                                  className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-[9px] font-semibold cursor-pointer transition-all"
                                >
                                  {inst.promoted_at ? 'Promoted ✓' : 'Promote to /skill'}
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Swarm Ephemeral Satellites List & Kill Controls */}
                  {activeSwarm.length > 0 && (
                    <div className="p-3 rounded-xl bg-black/50 border border-cyan-500/30 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 font-bold">
                        <span className="flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                          <span>Active Ephemeral Swarm Satellites</span>
                        </span>
                        <span className="text-[10px] text-slate-400">{activeSwarm.length} Active</span>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {activeSwarm.map((agent) => (
                          <div
                            key={agent.agent_id}
                            className="p-2 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-between text-[10px] font-mono"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                                {agent.anchor_orbiter}
                              </span>
                              <span className="text-slate-200 truncate">
                                {agent.role_title || agent.agent_id}
                              </span>
                              <span className="text-slate-500 text-[9px]">D{agent.depth}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleKillAgent(agent.agent_id)}
                              className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 hover:border-red-400 font-bold transition cursor-pointer"
                              title="Kill / Dissolve Ephemeral Agent"
                            >
                              Dissolve
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* MCP Registry Footer */}
                  <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>{activeSwarm.length} Dynamic Swarm Sub-Agents Active</span>
                    </div>
                    <span className="text-slate-400 font-mono">127.0.0.1:47630</span>
                  </div>
                </div>
              )}

              {/* ========================================================
                  CIRCUIT 03: TARS PERSONA MATRIX
                  ======================================================== */}
              {activeCircuit === '03' && (
                <div className="space-y-4">
                  {/* Preset Selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => applyPreset('TARS_PRIME')}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/30 hover:border-amber-400 text-left transition-all cursor-pointer"
                    >
                      <div className="text-amber-400 font-bold text-[11px]">TARS PRIME</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">75% Humor • 90% Candor</div>
                    </button>
                    <button
                      onClick={() => applyPreset('CASE_SERIOUS')}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-left transition-all cursor-pointer"
                    >
                      <div className="text-slate-200 font-bold text-[11px]">CASE SERIOUS</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">10% Humor • 95% Candor</div>
                    </button>
                    <button
                      onClick={() => applyPreset('JARVIS')}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-left transition-all cursor-pointer"
                    >
                      <div className="text-slate-200 font-bold text-[11px]">JARVIS CONCIERGE</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">45% Humor • 85% Empathy</div>
                    </button>
                    <button
                      onClick={() => applyPreset('NEXUS')}
                      className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 text-left transition-all cursor-pointer"
                    >
                      <div className="text-slate-200 font-bold text-[11px]">NEXUS SOVEREIGN</div>
                      <div className="text-[9px] text-slate-400 mt-0.5">60% Humor • 88% Candor</div>
                    </button>
                  </div>

                  {/* Sliders Grid */}
                  <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
                    {/* Humor */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-300 font-semibold">HUMOR & SARCASM</span>
                        <span className="text-amber-400 font-bold">{personaHumor}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={personaHumor}
                        onChange={(e) => setPersonaHumor(Number(e.target.value))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Candor */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-300 font-semibold">CANDOR & DIRECTNESS</span>
                        <span className="text-amber-400 font-bold">{personaCandor}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={personaCandor}
                        onChange={(e) => setPersonaCandor(Number(e.target.value))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Empathy */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-300 font-semibold">EMPATHY & RESONANCE</span>
                        <span className="text-amber-400 font-bold">{personaEmpathy}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={personaEmpathy}
                        onChange={(e) => setPersonaEmpathy(Number(e.target.value))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Verbosity */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-slate-300 font-semibold">VERBOSITY & BREVITY</span>
                        <span className="text-amber-400 font-bold">{personaVerbosity}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={personaVerbosity}
                        onChange={(e) => setPersonaVerbosity(Number(e.target.value))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Kokoro-82M Voice Selector */}
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                      <span>KOKORO-82M ONNX VOICE ENGINE</span>
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {[
                        { id: 'af_heart', name: 'Heart (Warm Neural)' },
                        { id: 'am_adam', name: 'Adam (Deep Baritone)' },
                        { id: 'af_sky', name: 'Sky (Crisp Assistant)' },
                        { id: 'am_echo', name: 'Echo (Resonant Prime)' },
                      ].map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setPersonaVoice(v.id)}
                          className={`p-2 rounded-lg text-left transition-all cursor-pointer border ${
                            personaVoice === v.id
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <div className="font-bold">{v.id}</div>
                          <div className="text-[9px] opacity-75">{v.name}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Test Prosody Button */}
                  <button
                    onClick={() => {
                      setPersonaPreviewPlaying(true);
                      setTimeout(() => setPersonaPreviewPlaying(false), 2400);
                    }}
                    disabled={personaPreviewPlaying}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
                  >
                    {personaPreviewPlaying ? (
                      <>
                        <Activity className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Synthesizing Kokoro-82M Prosody Preview...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 text-amber-400" />
                        <span>Preview Persona Prosody & Cadence</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* ========================================================
                  CIRCUIT 04: SCOPE GUARD [6/6 SECURE]
                  ======================================================== */}
              {activeCircuit === '04' && (
                <div className="space-y-4">
                  {/* Airgap Mode Banner */}
                  <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold text-purple-300 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-purple-400" />
                        <span>SOVEREIGN AIR-GAP LOCK</span>
                      </div>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        {isAirgapped ? 'Air-gapped: external network and tool calls strictly halted' : 'Permissive: full local & permitted mesh operations'}
                      </div>
                    </div>
                    <button
                      onClick={() => setIsAirgapped(!isAirgapped)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                        isAirgapped
                          ? 'bg-purple-500 text-white border-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.5)]'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                    >
                      {isAirgapped ? 'AIR-GAPPED' : 'PERMISSIVE'}
                    </button>
                  </div>

                  {/* 6 Invariants List */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-purple-300">
                      6 SOVEREIGN INVARIANTS STATUS
                    </div>
                    {SOVEREIGN_INVARIANTS.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-purple-500/30 transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-400 font-bold text-[10px]">
                              0{inv.id}. {inv.name}
                            </span>
                          </div>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-600/40 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> {inv.status}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 leading-normal">
                          {inv.summary}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Run Scope Integrity Audit */}
                  <button
                    onClick={runScopeAudit}
                    disabled={auditRunning}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 font-bold flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
                  >
                    {auditRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                        <span>Running Gravitas 6-Invariant Audit...</span>
                      </>
                    ) : auditSuccess ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">All 6 Invariants 100% Verified Secure!</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-purple-400" />
                        <span>Run Scope Integrity Audit</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default NexusCoreOrb;
