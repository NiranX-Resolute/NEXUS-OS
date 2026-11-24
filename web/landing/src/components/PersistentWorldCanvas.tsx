import React, { useRef, useMemo, createContext, useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Trail, Html } from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// 1. World Theme Context & Types
// ==========================================
export type WorldTheme = 'frontier' | 'abliterated' | 'silent' | 'default';

interface WorldThemeContextType {
  theme: WorldTheme;
  setTheme: (t: WorldTheme) => void;
}

export const WorldThemeContext = createContext<WorldThemeContextType>({
  theme: 'frontier',
  setTheme: () => {},
});

export const useWorldTheme = () => useContext(WorldThemeContext);

// ==========================================
// 2. Dual-Shell Fibonacci Dyson Sphere (4,000 Particles)
// ==========================================
const FibonacciCore: React.FC<{ theme: WorldTheme; isSubRoute: boolean }> = ({ theme, isSubRoute }) => {
  const pointsRef1 = useRef<THREE.Points>(null);
  const pointsRef2 = useRef<THREE.Points>(null);
  const icosaRef = useRef<THREE.Mesh>(null);

  // Generate 2,000 Cyan + 2,000 Emerald = 4,000 Fibonacci particles
  const [innerGeo, outerGeo] = useMemo(() => {
    const createFibonacciPoints = (count: number, baseRadius: number, accentType: 'cyan' | 'emerald') => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = phi * i;

        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;
        const r = baseRadius * (0.95 + Math.random() * 0.1);

        positions[i * 3] = x * r;
        positions[i * 3 + 1] = y * r;
        positions[i * 3 + 2] = z * r;

        const t = (y + 1) / 2;
        if (accentType === 'cyan') {
          // #00F5D4 (Cyan)
          colors[i * 3] = 0.0 + t * 0.1;
          colors[i * 3 + 1] = 0.90 + t * 0.1;
          colors[i * 3 + 2] = 0.80 + t * 0.18;
        } else {
          // #10B981 (Emerald)
          colors[i * 3] = 0.04 + t * 0.08;
          colors[i * 3 + 1] = 0.70 + t * 0.25;
          colors[i * 3 + 2] = 0.45 + t * 0.2;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    };

    return [
      createFibonacciPoints(2000, 2.1, 'cyan'),
      createFibonacciPoints(2000, 2.8, 'emerald'),
    ];
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const rotSpeed = isSubRoute ? 0.06 : 0.12;

    if (pointsRef1.current) {
      pointsRef1.current.rotation.y = t * rotSpeed;
      pointsRef1.current.rotation.x = Math.sin(t * (rotSpeed * 0.7)) * 0.15;
    }
    if (pointsRef2.current) {
      pointsRef2.current.rotation.y = -t * (rotSpeed * 0.75);
      pointsRef2.current.rotation.z = Math.cos(t * (rotSpeed * 0.8)) * 0.15;
    }
    if (icosaRef.current) {
      icosaRef.current.rotation.x = t * (rotSpeed * 2);
      icosaRef.current.rotation.y = t * (rotSpeed * 2.8);
      const s = 1.0 + Math.sin(t * 2.2) * 0.06;
      icosaRef.current.scale.set(s, s, s);
    }
  });

  const icosaColor = theme === 'abliterated' ? '#F59E0B' : theme === 'silent' ? '#6366F1' : '#00F5D4';

  return (
    <group>
      {/* Inner Wireframe Plasma Core */}
      <mesh ref={icosaRef}>
        <icosahedronGeometry args={[1.15, 1]} />
        <meshBasicMaterial
          wireframe
          color={icosaColor}
          transparent
          opacity={isSubRoute ? 0.35 : 0.65}
        />
      </mesh>

      {/* Shell 1: Inner 2,000 Particles */}
      <points ref={pointsRef1} geometry={innerGeo}>
        <pointsMaterial
          size={isSubRoute ? 0.032 : 0.038}
          vertexColors
          transparent
          opacity={isSubRoute ? 0.6 : 0.9}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Shell 2: Outer 2,000 Particles */}
      <points ref={pointsRef2} geometry={outerGeo}>
        <pointsMaterial
          size={isSubRoute ? 0.036 : 0.044}
          vertexColors
          transparent
          opacity={isSubRoute ? 0.5 : 0.8}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
};

// ==========================================
// 3. Counter-Rotating Dyson Gyroscope Rings
// ==========================================
const DysonGyroRings: React.FC<{ isSubRoute: boolean }> = ({ isSubRoute }) => {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const mult = isSubRoute ? 0.5 : 1.0;
    if (ring1.current) {
      ring1.current.rotation.x = t * 0.4 * mult;
      ring1.current.rotation.y = t * 0.2 * mult;
    }
    if (ring2.current) {
      ring2.current.rotation.y = -t * 0.35 * mult;
      ring2.current.rotation.z = t * 0.25 * mult;
    }
    if (ring3.current) {
      ring3.current.rotation.x = -t * 0.2 * mult;
      ring3.current.rotation.z = -t * 0.45 * mult;
    }
  });

  const opacityMult = isSubRoute ? 0.5 : 1.0;

  return (
    <group>
      <mesh ref={ring1}>
        <torusGeometry args={[3.2, 0.018, 16, 100]} />
        <meshBasicMaterial color="#00F5D4" transparent opacity={0.45 * opacityMult} />
      </mesh>
      <mesh ref={ring2}>
        <torusGeometry args={[3.75, 0.016, 16, 100]} />
        <meshBasicMaterial color="#10B981" transparent opacity={0.4 * opacityMult} />
      </mesh>
      <mesh ref={ring3}>
        <torusGeometry args={[4.3, 0.014, 16, 100]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.3 * opacityMult} />
      </mesh>
    </group>
  );
};

// ==========================================
// 4. Five Planetary Sub-Agent Orbiters
// ==========================================
interface OrbiterSpec {
  name: string;
  color: string;
  radius: number;
  speed: number;
  inclination: number;
  size: number;
}

const ORBITERS: OrbiterSpec[] = [
  { name: 'DEV-01', color: '#A855F7', radius: 4.8, speed: 0.6, inclination: 0.35, size: 0.13 },
  { name: 'SYS-01', color: '#38BDF8', radius: 5.4, speed: 0.45, inclination: -0.25, size: 0.14 },
  { name: 'SCOUT-01', color: '#00F5D4', radius: 6.0, speed: 0.52, inclination: 0.5, size: 0.12 },
  { name: 'SEC-01', color: '#10B981', radius: 6.6, speed: 0.38, inclination: -0.4, size: 0.15 },
  { name: 'OPS-01', color: '#F59E0B', radius: 7.2, speed: 0.3, inclination: 0.2, size: 0.13 },
];

const SubAgentOrbiter: React.FC<{ spec: OrbiterSpec; isSubRoute: boolean }> = ({ spec, isSubRoute }) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime() * spec.speed * (isSubRoute ? 0.6 : 1.0);
    if (meshRef.current) {
      const x = Math.cos(t) * spec.radius;
      const z = Math.sin(t) * spec.radius;
      const y = Math.sin(t) * Math.sin(spec.inclination) * (spec.radius * 0.4);

      meshRef.current.position.set(x, y, z);
      meshRef.current.rotation.y = t * 2;
    }
  });

  return (
    <group ref={meshRef}>
      <mesh>
        <sphereGeometry args={[spec.size, 16, 16]} />
        <meshBasicMaterial color={spec.color} />
      </mesh>

      <mesh rotation={[Math.PI / 3, 0, 0]}>
        <ringGeometry args={[spec.size * 1.5, spec.size * 2.2, 32]} />
        <meshBasicMaterial
          color={spec.color}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Trail
        width={spec.size * 1.2}
        length={isSubRoute ? 4 : 6}
        color={new THREE.Color(spec.color)}
        attenuation={(t) => t * t}
      >
        <mesh visible={false} />
      </Trail>

      {!isSubRoute && (
        <Html distanceFactor={14} center>
          <div className="pointer-events-none select-none px-2 py-0.5 rounded bg-black/80 border border-slate-700/80 backdrop-blur-md text-[9px] font-mono whitespace-nowrap shadow-md flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: spec.color }} />
            <span className="text-slate-200">{spec.name}</span>
          </div>
        </Html>
      )}
    </group>
  );
};

// ==========================================
// 5. Deep-Space Volumetric Dust Field (1,200 Particles)
// Reacts in real time to scroll velocity!
// ==========================================
const DeepSpaceDustField: React.FC = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 1200;

  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 35;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 35;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;

      const shade = 0.4 + Math.random() * 0.6;
      col[i * 3] = shade * 0.5;
      col[i * 3 + 1] = shade * 0.8;
      col[i * 3 + 2] = shade;
    }

    return [pos, col];
  }, []);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [positions, colors]);

  useFrame((_state, delta) => {
    if (!pointsRef.current) return;
    const attr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const array = attr.array as Float32Array;

    // Read real-time scroll velocity from Lenis window global
    const vel = typeof window !== 'undefined' ? (window as any).__nexusScrollVelocity || 0 : 0;
    const speed = 0.05 + Math.abs(vel) * 0.12;

    for (let i = 0; i < count; i++) {
      array[i * 3 + 2] += speed * (delta * 60);
      if (array[i * 3 + 2] > 25) {
        array[i * 3 + 2] = -35;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.4}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// ==========================================
// 6. Spline Camera Choreographer
// Flies smoothly along CatmullRomCurve3 driven by Lenis scroll progress!
// ==========================================
interface SplineCameraProps {
  currentPath: string;
}

const SplineCameraChoreographer: React.FC<SplineCameraProps> = ({ currentPath }) => {
  const isHome = currentPath === '/' || currentPath === '';

  // 3D Camera spline path across zones 01 -> 04
  const positionSpline = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0.1, 11.6), // 0.00: Hero 2-column offset (confines sphere to right column)
      new THREE.Vector3(0.2, 0.15, 3.8),  // 0.22: Dive through gyro rings
      new THREE.Vector3(-3.2, 0.8, 5.2),  // 0.45: Manifesto side-stage (core right)
      new THREE.Vector3(2.6, -0.5, 6.4),  // 0.70: Pinned cockpit isometric bay
      new THREE.Vector3(0, -2.6, 6.0),    // 1.00: Footer horizon rising core
    ]);
  }, []);

  const lookAtSpline = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, 0, 0),      // 0.00: Focus right-hand Dyson orbital bay
      new THREE.Vector3(0, 0, 0),         // 0.22: Keep centered during dive
      new THREE.Vector3(1.4, 0.1, 0),     // 0.45: Look right at Dyson core
      new THREE.Vector3(-0.4, 0, 0),      // 0.70: Look left at workstation
      new THREE.Vector3(0, 0.8, 0),       // 1.00: Look up at glowing sphere
    ]);
  }, []);

  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state) => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isHome || prefersReducedMotion) {
      // Sub-route calm wide-angle vantage (or reduced motion)
      const targetPos = new THREE.Vector3(0, 1.8, 9.2);
      state.camera.position.lerp(targetPos, 0.05);
      currentLookAt.current.lerp(new THREE.Vector3(0, 0, 0), 0.05);
      state.camera.lookAt(currentLookAt.current);
      return;
    }

    // Read global scroll progress (0.0 to 1.0)
    const p = typeof window !== 'undefined' ? (window as any).__nexusScrollProgress || 0 : 0;
    const clampedProgress = Math.min(Math.max(p, 0), 1);

    // Calculate spline coordinates
    const targetPoint = positionSpline.getPointAt(clampedProgress);
    const targetLook = lookAtSpline.getPointAt(clampedProgress);

    // Organic pointer parallax
    const parallaxX = state.pointer.x * 0.4;
    const parallaxY = state.pointer.y * 0.25;

    targetPoint.x += parallaxX;
    targetPoint.y += parallaxY;

    state.camera.position.lerp(targetPoint, 0.08);
    currentLookAt.current.lerp(targetLook, 0.08);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
};

// ==========================================
// 7. Persistent World Canvas Master Underlay
// ==========================================
interface PersistentWorldCanvasProps {
  currentPath: string;
}

export const PersistentWorldCanvas: React.FC<PersistentWorldCanvasProps> = ({ currentPath }) => {
  const { theme } = useWorldTheme();
  const isSubRoute = currentPath !== '/' && currentPath !== '';

  const primaryLightColor = theme === 'abliterated' ? '#F59E0B' : '#00F5D4';
  const secondaryLightColor = theme === 'silent' ? '#6366F1' : '#10B981';

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 12], fov: 45, near: 0.1, far: 100 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
      className="w-full h-full pointer-events-none"
    >
      <ambientLight intensity={isSubRoute ? 0.35 : 0.55} />
      <pointLight position={[10, 10, 10]} intensity={1.3} color={primaryLightColor} />
      <pointLight position={[-10, -10, -10]} intensity={0.9} color={secondaryLightColor} />

      <SplineCameraChoreographer currentPath={currentPath} />
      <DeepSpaceDustField />
      <FibonacciCore theme={theme} isSubRoute={isSubRoute} />
      <DysonGyroRings isSubRoute={isSubRoute} />
      {ORBITERS.map((orb) => (
        <SubAgentOrbiter key={orb.name} spec={orb} isSubRoute={isSubRoute} />
      ))}
    </Canvas>
  );
};

export default PersistentWorldCanvas;
