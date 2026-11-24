import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, Trail, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Volume2, Shield, Activity, Zap, RefreshCw, Cpu, Layers } from 'lucide-react';

export type CoreState =
  | 'IDLE'
  | 'WAKE_DETECTED'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'SPEAKING'
  | 'SOVEREIGN_LOCK'
  | 'ESTOP_TRIGGERED';

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

const DEFAULT_ORBITERS: SubAgentOrbiter[] = [
  {
    id: 'DEV-01',
    name: 'NexKoder AST',
    status: 'IDLE',
    taskSummary: 'Standing by for AST diff',
    color: '#00f5d4',
    secondaryColor: '#38bdf8',
    orbitRadius: 2.2,
    orbitSpeed: 0.8,
    tilt: [0.35, 0.0, 0.2],
  },
  {
    id: 'SYS-01',
    name: 'Win32 UIA',
    status: 'IDLE',
    taskSummary: 'Desktop automation idle',
    color: '#a855f7',
    secondaryColor: '#ec4899',
    orbitRadius: 2.6,
    orbitSpeed: 0.65,
    tilt: [-0.45, 0.2, -0.3],
  },
  {
    id: 'SCOUT-01',
    name: 'Scholar & DOM',
    status: 'IDLE',
    taskSummary: 'arXiv index connected',
    color: '#f59e0b',
    secondaryColor: '#fde047',
    orbitRadius: 3.0,
    orbitSpeed: 0.55,
    tilt: [0.15, -0.3, 0.55],
  },
  {
    id: 'SEC-01',
    name: 'Sentinel Scope',
    status: 'IDLE',
    taskSummary: 'ScopeGuard Invariants enforced',
    color: '#10b981',
    secondaryColor: '#84cc16',
    orbitRadius: 3.4,
    orbitSpeed: 0.45,
    tilt: [-0.25, 0.4, -0.5],
  },
  {
    id: 'OPS-01',
    name: 'Edge & Cron',
    status: 'IDLE',
    taskSummary: 'D1 sync mesh healthy',
    color: '#f43f5e',
    secondaryColor: '#fb7185',
    orbitRadius: 3.8,
    orbitSpeed: 0.35,
    tilt: [0.6, 0.1, -0.15],
  },
];

const STATE_PALETTE: Record<CoreState, { primary: string; secondary: string }> = {
  IDLE:            { primary: '#38bdf8', secondary: '#1d4ed8' },
  WAKE_DETECTED:   { primary: '#00f5d4', secondary: '#38bdf8' },
  LISTENING:       { primary: '#00f5d4', secondary: '#06b6d4' },
  THINKING:        { primary: '#f59e0b', secondary: '#ea580c' },
  EXECUTING:       { primary: '#10b981', secondary: '#059669' },
  SPEAKING:        { primary: '#60a5fa', secondary: '#a855f7' },
  SOVEREIGN_LOCK:  { primary: '#a855f7', secondary: '#6b21a8' },
  ESTOP_TRIGGERED: { primary: '#ef4444', secondary: '#991b1b' },
};

// 1. 3D Sonic Shockwave Ring
const ShockwavePulse: React.FC<{ triggerKey: number; color: string }> = ({ triggerKey, color }) => {
  const ringRef = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);
  const progressRef = useRef<number>(1.0);

  useEffect(() => {
    if (triggerKey > 0) {
      progressRef.current = 0.0;
    }
  }, [triggerKey]);

  useFrame((_, delta) => {
    if (progressRef.current < 1.0 && ringRef.current && ring2Ref.current) {
      progressRef.current = Math.min(1.0, progressRef.current + delta * 1.45);
      const p = progressRef.current;
      const easeOut = 1 - Math.pow(1 - p, 3);
      const scale = 1.0 + easeOut * 4.2;

      ringRef.current.scale.setScalar(scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.75;

      const p2 = Math.max(0, p - 0.15);
      const scale2 = 1.0 + (1 - Math.pow(1 - p2, 3)) * 3.8;
      ring2Ref.current.scale.setScalar(scale2);
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.4;
    }
  });

  return (
    <group rotation={[Math.PI / 2.3, 0.2, 0]}>
      <mesh ref={ringRef}>
        <torusGeometry args={[1.0, 0.018, 16, 100]} />
        <meshBasicMaterial color={color} transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ring2Ref}>
        <torusGeometry args={[1.0, 0.008, 16, 100]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

// 2. Dyson Gyroscope Containment Rings
const DysonGyroRings: React.FC<{ coreState: CoreState; spectrum: AudioSpectrum; color: string }> = ({
  coreState,
  spectrum,
  color,
}) => {
  const outerRing = useRef<THREE.Mesh>(null!);
  const midRing = useRef<THREE.Mesh>(null!);
  const innerRing = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    const speedBoost =
      coreState === 'THINKING' || coreState === 'EXECUTING' ? 2.2 : 1.0 + spectrum.treble * 1.8;

    if (outerRing.current) {
      outerRing.current.rotation.x += delta * 0.35 * speedBoost;
      outerRing.current.rotation.y += delta * 0.22 * speedBoost;
    }
    if (midRing.current) {
      midRing.current.rotation.y -= delta * 0.48 * speedBoost;
      midRing.current.rotation.z += delta * 0.31 * speedBoost;
    }
    if (innerRing.current) {
      innerRing.current.rotation.x -= delta * 0.65 * speedBoost;
      innerRing.current.rotation.z -= delta * 0.4 * speedBoost;
    }
  });

  return (
    <group>
      <mesh ref={outerRing}>
        <torusGeometry args={[1.82, 0.006, 16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={midRing}>
        <torusGeometry args={[1.68, 0.008, 16, 128]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={innerRing}>
        <torusGeometry args={[1.55, 0.005, 16, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

// 3. Multi-Layer Quantum Particle Core (4,000 Particles)
const QuantumParticleCore: React.FC<{
  coreState: CoreState;
  spectrum: AudioSpectrum;
  empathyPct: number;
}> = ({ coreState, spectrum, empathyPct }) => {
  const pointsRef = useRef<THREE.Points>(null!);
  const plasmaRef = useRef<THREE.Mesh>(null!);
  const particleCount = 4000;

  const { basePositions, phases, colors } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const ph = new Float32Array(particleCount);
    const col = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const isOuterShell = i % 4 === 0;
      const r = isOuterShell ? 1.48 : 1.25;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / particleCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      ph[i] = Math.random() * Math.PI * 2;

      col[i * 3] = 0.22;
      col[i * 3 + 1] = 0.74;
      col[i * 3 + 2] = 0.97;
    }
    return { basePositions: pos, phases: ph, colors: col };
  }, []);

  const currentPositions = useMemo(() => new Float32Array(basePositions), [basePositions]);
  const currentColors = useMemo(() => new Float32Array(colors), [colors]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;

    const palette = STATE_PALETTE[coreState];
    const primaryColor = new THREE.Color(palette.primary);
    const secondaryColor = new THREE.Color(palette.secondary);

    if (empathyPct >= 75 && coreState === 'IDLE') {
      secondaryColor.lerp(new THREE.Color('#ec4899'), 0.35);
    }

    const rotSpeed =
      coreState === 'THINKING'
        ? 0.85
        : coreState === 'EXECUTING'
        ? 0.6
        : 0.16 + spectrum.mid * 0.75;

    pointsRef.current.rotation.y += delta * rotSpeed;
    pointsRef.current.rotation.z += delta * (rotSpeed * 0.28);

    const bassScale = 1.0 + spectrum.bass * 0.38 + spectrum.rms * 0.22;
    const midTurbulence = 0.03 + spectrum.mid * 0.22;

    for (let i = 0; i < particleCount; i++) {
      const ix = i * 3;
      const bx = basePositions[ix];
      const by = basePositions[ix + 1];
      const bz = basePositions[ix + 2];
      const phase = phases[i];

      const harmonic =
        Math.sin(bx * 2.5 + t * 3.4 + phase) *
        Math.cos(by * 2.5 - t * 2.8) *
        midTurbulence;

      const scale = bassScale + harmonic;
      posAttr.array[ix] = bx * scale;
      posAttr.array[ix + 1] = by * scale;
      posAttr.array[ix + 2] = bz * scale;

      const mixRatio = 0.5 + 0.5 * Math.sin(phase + t * 2.0 + spectrum.treble * 4.0);
      colAttr.array[ix] = THREE.MathUtils.lerp(primaryColor.r, secondaryColor.r, mixRatio);
      colAttr.array[ix + 1] = THREE.MathUtils.lerp(primaryColor.g, secondaryColor.g, mixRatio);
      colAttr.array[ix + 2] = THREE.MathUtils.lerp(primaryColor.b, secondaryColor.b, mixRatio);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    if (plasmaRef.current) {
      plasmaRef.current.rotation.y -= delta * 0.4;
      plasmaRef.current.scale.setScalar(0.88 + spectrum.bass * 0.42);
      (plasmaRef.current.material as THREE.MeshBasicMaterial).color.lerp(primaryColor, 0.1);
    }
  });

  return (
    <group>
      <mesh ref={plasmaRef}>
        <icosahedronGeometry args={[0.92, 3]} />
        <meshBasicMaterial
          color={STATE_PALETTE[coreState].primary}
          wireframe
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[currentPositions, 3]}
            count={particleCount}
            array={currentPositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[currentColors, 3]}
            count={particleCount}
            array={currentColors}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.028 + spectrum.treble * 0.022}
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

// 4. Planetary Sub-Agent Orbiter with Comet Trails
const PlanetarySubAgentOrbiter: React.FC<{
  orbiter: SubAgentOrbiter;
  index: number;
  shockwaveBoost: number;
  onSelect: (id: SubAgentOrbiter['id']) => void;
}> = ({ orbiter, index, shockwaveBoost, onSelect }) => {
  const satRef = useRef<THREE.Group>(null!);
  const planetaryRing1 = useRef<THREE.Mesh>(null!);
  const planetaryRing2 = useRef<THREE.Mesh>(null!);
  const [satPos, setSatPos] = useState<[number, number, number]>([orbiter.orbitRadius, 0, 0]);

  const isActive = orbiter.status === 'EXECUTING' || orbiter.status === 'ASSIGNED';
  const isError = orbiter.status === 'ERROR';

  const trackPoints = useMemo(() => {
    const pts: [number, number, number][] = [];
    const segments = 120;
    const r = isActive ? orbiter.orbitRadius * 0.78 : orbiter.orbitRadius;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
    }
    return pts;
  }, [orbiter.orbitRadius, isActive]);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    const speedMult = isActive ? 2.6 : 0.7;
    const angle = t * orbiter.orbitSpeed * speedMult + index * ((Math.PI * 2) / 5);
    const r = isActive ? orbiter.orbitRadius * 0.78 : orbiter.orbitRadius;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = Math.sin(t * 2.2 + index) * 0.08;

    if (satRef.current) {
      satRef.current.position.set(x, y, z);
      setSatPos([x, y, z]);
    }

    if (planetaryRing1.current && planetaryRing2.current) {
      planetaryRing1.current.rotation.z += delta * (isActive ? 3.5 : 1.2);
      planetaryRing2.current.rotation.x -= delta * (isActive ? 2.8 : 0.9);
    }
  });

  const activeColor = isError ? '#ef4444' : orbiter.color;

  return (
    <group rotation={orbiter.tilt}>
      <Line
        points={trackPoints}
        color={activeColor}
        lineWidth={isActive ? 1.8 : 0.7 + shockwaveBoost * 1.5}
        transparent
        opacity={isActive ? 0.6 : 0.2 + shockwaveBoost * 0.45}
      />

      {isActive && (
        <Line
          points={[[0, 0, 0], satPos]}
          color={activeColor}
          lineWidth={2.8}
          transparent
          opacity={0.88}
        />
      )}

      <Trail
        width={isActive ? 0.55 : 0.22}
        length={isActive ? 18 : 8}
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
          <mesh>
            <sphereGeometry args={[isActive ? 0.13 : 0.085, 24, 24]} />
            <meshBasicMaterial color={activeColor} />
          </mesh>

          <mesh ref={planetaryRing1} rotation={[Math.PI / 2.4, 0, 0]}>
            <ringGeometry args={[isActive ? 0.17 : 0.23, isActive ? 0.23 : 0.28, 32]} />
            <meshBasicMaterial
              color={orbiter.secondaryColor}
              side={THREE.DoubleSide}
              transparent
              opacity={isActive ? 0.85 : 0.4}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <mesh ref={planetaryRing2} rotation={[0, Math.PI / 3, Math.PI / 4]}>
            <torusGeometry args={[isActive ? 0.26 : 0.16, 0.006, 12, 48]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={isActive ? 0.75 : 0.2}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          <Html distanceFactor={9.5} position={[0, 0.28, 0]} center>
            <button
              onClick={() => onSelect(orbiter.id)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-tight whitespace-nowrap transition-all border backdrop-blur-md cursor-pointer ${
                isActive
                  ? 'bg-zinc-900/95 text-white border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.6)] scale-105'
                  : 'bg-zinc-950/75 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-600'
              }`}
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? 'animate-ping' : ''}`}
                style={{ backgroundColor: activeColor }}
              />
              <span className="font-semibold">{orbiter.id}</span>
              <span className="opacity-70 ml-1">({orbiter.name})</span>
              {isActive && orbiter.taskSummary && (
                <span className="ml-1.5 text-emerald-300">• {orbiter.taskSummary.slice(0, 22)}</span>
              )}
            </button>
          </Html>
        </group>
      </Trail>
    </group>
  );
};

// 5. Main Component Export
export function NexusCoreOrb({
  onSelectAgent,
  activeMode = 'DEV',
  onModeChange,
}: {
  onSelectAgent?: (id: SubAgentOrbiter['id']) => void;
  activeMode?: string;
  onModeChange?: (mode: string) => void;
}) {
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [shockwaveKey, setShockwaveKey] = useState<number>(0);
  const [orbiters, setOrbiters] = useState<SubAgentOrbiter[]>(DEFAULT_ORBITERS);
  const [empathyPct, setEmpathyPct] = useState<number>(50);
  const [spectrum, setSpectrum] = useState<AudioSpectrum>({
    rms: 0.05,
    bass: 0.02,
    mid: 0.04,
    treble: 0.01,
    dominantHz: 0,
  });

  // Web Audio Analyser setup
  useEffect(() => {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win && win.nexusTelemetry) {
      const unsub = win.nexusTelemetry.onEvent?.((event: any) => {
        if (event && (event.type === 'audio_rms' || event.type === 'mic_telemetry')) {
          const val = event.data?.rms ?? event.data?.audio_rms ?? event.data?.level ?? event.rms;
          if (typeof val === 'number') {
            setSpectrum((prev) => ({
              ...prev,
              rms: val,
              bass: Math.max(prev.bass, val * 0.8),
              mid: Math.max(prev.mid, val * 0.6),
              treble: Math.max(prev.treble, val * 0.4),
            }));
          }
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
    return undefined;
  }, []);

  useEffect(() => {
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let animId: number;

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          if (analyser) {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            let bassSum = 0;
            let midSum = 0;
            let trebleSum = 0;

            for (let i = 0; i < dataArray.length; i++) {
              const val = dataArray[i] / 255.0;
              sum += val;
              if (i >= 1 && i <= 8) bassSum += val;
              else if (i >= 9 && i <= 45) midSum += val;
              else if (i >= 46 && i <= 100) trebleSum += val;
            }

            const rms = sum / dataArray.length;
            const bass = bassSum / 8;
            const mid = midSum / 37;
            const treble = trebleSum / 55;

            setSpectrum({
              rms,
              bass,
              mid,
              treble,
              dominantHz: Math.round(rms * 4000),
            });

            if (rms > 0.35 && coreState === 'IDLE') {
              setCoreState('LISTENING');
            } else if (rms <= 0.08 && coreState === 'LISTENING') {
              setCoreState('IDLE');
            }
          }
          animId = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        // Fallback to IPC audio telemetry
      }
    };

    startAudio();
    return () => {
      cancelAnimationFrame(animId);
      if (audioCtx) audioCtx.close();
    };
  }, [coreState]);

  // Sync Persona Settings & Tasks from Backend
  useEffect(() => {
    const syncTelemetry = async () => {
      try {
        const pRes = await fetch('http://127.0.0.1:47630/api/persona');
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData?.persona?.empathy_pct !== undefined) {
            setEmpathyPct(pData.persona.empathy_pct);
          }
        }

        const tRes = await fetch('http://127.0.0.1:47630/api/tasks?limit=5');
        if (tRes.ok) {
          const tData = await tRes.json();
          if (Array.isArray(tData.tasks)) {
            const hasExecuting = tData.tasks.some((t: any) => t.status === 'RUNNING' || t.status === 'EXECUTING');
            if (hasExecuting && coreState !== 'SOVEREIGN_LOCK') {
              setCoreState('EXECUTING');
            }
          }
        }
      } catch {
        // Backend offline fallback
      }
    };

    syncTelemetry();
    const interval = setInterval(syncTelemetry, 3000);
    return () => clearInterval(interval);
  }, [coreState]);

  const handleModeSwitch = async (mode: string) => {
    setShockwaveKey((prev) => prev + 1);
    if (onModeChange) onModeChange(mode);

    if (mode === 'SILENT' || mode === 'SOVEREIGN_LOCK') {
      setCoreState('SOVEREIGN_LOCK');
    } else {
      setCoreState('IDLE');
    }

    try {
      await fetch('http://127.0.0.1:47630/api/workspace/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
    } catch {
      // Offline fallback
    }
  };

  const handleAgentClick = (id: SubAgentOrbiter['id']) => {
    setShockwaveKey((prev) => prev + 1);
    if (onSelectAgent) onSelectAgent(id);
  };

  return (
    <div className="relative w-full h-full min-h-[580px] flex flex-col bg-[#070B14] rounded-xl border border-slate-800/80 overflow-hidden shadow-2xl">
      {/* Top HUD Controls */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-[#0B0F19]/90 to-transparent backdrop-blur-sm border-b border-slate-800/40">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-ping"
              style={{ backgroundColor: STATE_PALETTE[coreState].primary }}
            />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase">
                Quantum Dyson Core v5.0
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">
                {coreState}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Audio-Reactive FFT &bull; 5 Planetary Orbiters
            </p>
          </div>
        </div>

        {/* Workspace Mode Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
          {(['DEV', 'STUDY', 'STUDIO', 'SILENT'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => handleModeSwitch(mode)}
              className={`px-3 py-1 text-[11px] font-mono font-medium rounded transition-all cursor-pointer ${
                activeMode === mode
                  ? mode === 'SILENT'
                    ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {mode === 'SILENT' ? '🔒 SILENT' : mode}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="w-full h-full flex-1 relative cursor-grab active:cursor-grabbing">
        <Canvas camera={{ position: [0, 1.2, 7.5], fov: 45 }} gl={{ antialias: true, alpha: true }}>
          <ambientLight intensity={0.4} />
          <pointLight position={[10, 10, 10]} intensity={1.0} color={STATE_PALETTE[coreState].primary} />

          <ShockwavePulse triggerKey={shockwaveKey} color={STATE_PALETTE[coreState].primary} />
          <DysonGyroRings coreState={coreState} spectrum={spectrum} color={STATE_PALETTE[coreState].primary} />
          <QuantumParticleCore coreState={coreState} spectrum={spectrum} empathyPct={empathyPct} />

          {orbiters.map((orbiter, idx) => (
            <PlanetarySubAgentOrbiter
              key={orbiter.id}
              orbiter={orbiter}
              index={idx}
              shockwaveBoost={shockwaveKey > 0 ? 0.5 : 0}
              onSelect={handleAgentClick}
            />
          ))}

          <OrbitControls
            enablePan={false}
            enableZoom={true}
            minDistance={4.5}
            maxDistance={14}
            autoRotate={false}
          />
        </Canvas>
      </div>

      {/* Bottom Telemetry Bar */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-6 py-3 bg-gradient-to-t from-[#0B0F19]/95 via-[#0B0F19]/70 to-transparent border-t border-slate-800/40 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center space-x-5 text-slate-400">
          <div className="flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>RMS: {(spectrum.rms * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Bass: {(spectrum.bass * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Treble: {(spectrum.treble * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-purple-400" />
            <span>Empathy: {empathyPct}%</span>
          </div>
        </div>

        <button
          onClick={() => setShockwaveKey((k) => k + 1)}
          className="px-2.5 py-1 text-[11px] rounded bg-slate-800/80 text-slate-300 border border-slate-700 hover:text-white cursor-pointer"
        >
          Pulse Shockwave
        </button>
      </div>
    </div>
  );
}

export default NexusCoreOrb;
