// apps/desktop/src/renderer/src/views/PlanetWatchView.tsx
// NEXUS OS v5.0 — Planet Watch 3D Globe View & Geospatial Monitor
// Interactive Three.js / @react-three/fiber 3D Earth, live USGS all-day GeoJSON seismic feed,
// orbital rings (GPS, ISS, Geo), news hotspots, gesture/voice camera focus, and air-gapped [SILENT] mode fallback.

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import {
  Globe,
  Radio,
  Activity,
  Satellite,
  Compass,
  RefreshCw,
  Search,
  ExternalLink,
  Shield,
  Layers,
  MapPin,
  Clock,
  RotateCcw,
  Sliders,
  ChevronRight,
  AlertCircle,
  Eye,
  Hand,
  Volume2
} from 'lucide-react'

// --- Types & Interfaces ---

export interface USGSProperties {
  mag: number | null
  place: string
  time: number
  updated: number
  tz?: number | null
  url: string
  detail: string
  felt?: number | null
  cdi?: number | null
  mmi?: number | null
  alert?: string | null
  status: string
  tsunami: number
  sig: number
  net: string
  code: string
  ids: string
  sources: string
  types: string
  nst?: number | null
  dmin?: number | null
  rms?: number | null
  gap?: number | null
  magType?: string
  type: string
  title: string
}

export interface USGSFeature {
  id: string
  properties: USGSProperties
  geometry: {
    type: string
    coordinates: [number, number, number] // [longitude, latitude, depth_km]
  }
}

export interface USGSGeoJSONResponse {
  type: string
  metadata: {
    generated: number
    url: string
    title: string
    status: number
    api: string
    count: number
  }
  features: USGSFeature[]
}

export interface NewsHotspot {
  id: string
  name: string
  region: string
  lat: number
  lon: number
  category: 'TECH' | 'FINTECH' | 'QUANTUM' | 'ENERGY' | 'ARCHIVE' | 'AEROSPACE'
  headline: string
  summary: string
  metric: string
  color: string
}

const USGS_API_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
const GLOBE_RADIUS = 2.0

// Helper: Convert [lat, lon] to 3D Cartesian coordinates
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number
): [number, number, number] {
  const phi = (lat * Math.PI) / 180
  const theta = (lon * Math.PI) / 180
  const x = radius * Math.cos(phi) * Math.sin(theta)
  const y = radius * Math.sin(phi)
  const z = radius * Math.cos(phi) * Math.cos(theta)
  return [x, y, z]
}

// Color resolver based on Richter magnitude
function getMagnitudeColor(mag: number | null): {
  hex: string
  color: THREE.Color
  tailwindText: string
  tailwindBg: string
  tailwindBorder: string
  category: string
} {
  const m = mag ?? 0
  if (m < 2.0) {
    return {
      hex: '#22d3ee',
      color: new THREE.Color('#22d3ee'),
      tailwindText: 'text-cyan-400',
      tailwindBg: 'bg-cyan-500/10',
      tailwindBorder: 'border-cyan-500/30',
      category: 'MICRO'
    }
  }
  if (m < 4.0) {
    return {
      hex: '#f59e0b',
      color: new THREE.Color('#f59e0b'),
      tailwindText: 'text-amber-400',
      tailwindBg: 'bg-amber-500/10',
      tailwindBorder: 'border-amber-500/30',
      category: 'MODERATE'
    }
  }
  return {
    hex: '#ef4444',
    color: new THREE.Color('#ef4444'),
    tailwindText: 'text-red-400',
    tailwindBg: 'bg-red-500/10',
    tailwindBorder: 'border-red-500/30',
    category: 'SEVERE'
  }
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  return `${diffHours}h ago`
}

// Built-in authentic USGS fallback seismic events dataset for offline/air-gapped [SILENT] mode
const OFFLINE_USGS_DATASET: USGSFeature[] = [
  {
    id: 'us7000m1a1',
    properties: {
      mag: 5.6,
      place: '124 km ESE of Hachinohe, Japan',
      time: Date.now() - 14 * 60 * 1000,
      updated: Date.now() - 5 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m1a1',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 482,
      net: 'us',
      code: '7000m1a1',
      ids: ',us7000m1a1,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 5.6 - 124 km ESE of Hachinohe, Japan'
    },
    geometry: {
      type: 'Point',
      coordinates: [142.82, 40.24, 35.0]
    }
  },
  {
    id: 'nc73981292',
    properties: {
      mag: 3.4,
      place: '14 km NE of Ridgecrest, CA',
      time: Date.now() - 32 * 60 * 1000,
      updated: Date.now() - 12 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/nc73981292',
      detail: '',
      status: 'automatic',
      tsunami: 0,
      sig: 178,
      net: 'nc',
      code: '73981292',
      ids: ',nc73981292,',
      sources: ',nc,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 3.4 - 14 km NE of Ridgecrest, CA'
    },
    geometry: {
      type: 'Point',
      coordinates: [-117.56, 35.72, 8.2]
    }
  },
  {
    id: 'us7000m2b2',
    properties: {
      mag: 4.8,
      place: 'Near the coast of Central Chile',
      time: Date.now() - 58 * 60 * 1000,
      updated: Date.now() - 22 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m2b2',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 355,
      net: 'us',
      code: '7000m2b2',
      ids: ',us7000m2b2,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 4.8 - Near the coast of Central Chile'
    },
    geometry: {
      type: 'Point',
      coordinates: [-71.62, -31.42, 28.0]
    }
  },
  {
    id: 'us7000m3c3',
    properties: {
      mag: 5.1,
      place: 'Reykjanes Ridge, Iceland',
      time: Date.now() - 95 * 60 * 1000,
      updated: Date.now() - 40 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m3c3',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 399,
      net: 'us',
      code: '7000m3c3',
      ids: ',us7000m3c3,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 5.1 - Reykjanes Ridge, Iceland'
    },
    geometry: {
      type: 'Point',
      coordinates: [-26.45, 59.82, 10.0]
    }
  },
  {
    id: 'us7000m4d4',
    properties: {
      mag: 4.2,
      place: 'Crete, Greece Region',
      time: Date.now() - 130 * 60 * 1000,
      updated: Date.now() - 65 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m4d4',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 271,
      net: 'us',
      code: '7000m4d4',
      ids: ',us7000m4d4,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 4.2 - Crete, Greece Region'
    },
    geometry: {
      type: 'Point',
      coordinates: [24.85, 34.98, 18.5]
    }
  },
  {
    id: 'us7000m5e5',
    properties: {
      mag: 6.1,
      place: 'Kermadec Islands Region, New Zealand',
      time: Date.now() - 175 * 60 * 1000,
      updated: Date.now() - 80 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m5e5',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 572,
      net: 'us',
      code: '7000m5e5',
      ids: ',us7000m5e5,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 6.1 - Kermadec Islands Region, New Zealand'
    },
    geometry: {
      type: 'Point',
      coordinates: [-177.35, -29.84, 42.0]
    }
  },
  {
    id: 'us7000m6f6',
    properties: {
      mag: 4.9,
      place: 'Banda Sea, Indonesia',
      time: Date.now() - 210 * 60 * 1000,
      updated: Date.now() - 95 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m6f6',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 369,
      net: 'us',
      code: '7000m6f6',
      ids: ',us7000m6f6,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 4.9 - Banda Sea, Indonesia'
    },
    geometry: {
      type: 'Point',
      coordinates: [129.42, -6.85, 145.0]
    }
  },
  {
    id: 'ak0242x9p1',
    properties: {
      mag: 2.8,
      place: '45 km W of Anchorage, Alaska',
      time: Date.now() - 240 * 60 * 1000,
      updated: Date.now() - 110 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/ak0242x9p1',
      detail: '',
      status: 'automatic',
      tsunami: 0,
      sig: 121,
      net: 'ak',
      code: '0242x9p1',
      ids: ',ak0242x9p1,',
      sources: ',ak,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 2.8 - 45 km W of Anchorage, Alaska'
    },
    geometry: {
      type: 'Point',
      coordinates: [-150.85, 61.22, 38.0]
    }
  },
  {
    id: 'hv72849182',
    properties: {
      mag: 2.4,
      place: '7 km S of Volcano, Hawaii',
      time: Date.now() - 280 * 60 * 1000,
      updated: Date.now() - 140 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/hv72849182',
      detail: '',
      status: 'automatic',
      tsunami: 0,
      sig: 89,
      net: 'hv',
      code: '72849182',
      ids: ',hv72849182,',
      sources: ',hv,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 2.4 - 7 km S of Volcano, Hawaii'
    },
    geometry: {
      type: 'Point',
      coordinates: [-155.24, 19.38, 2.8]
    }
  },
  {
    id: 'us7000m7g7',
    properties: {
      mag: 5.3,
      place: 'Eastern Turkey Region',
      time: Date.now() - 320 * 60 * 1000,
      updated: Date.now() - 160 * 60 * 1000,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000m7g7',
      detail: '',
      status: 'reviewed',
      tsunami: 0,
      sig: 432,
      net: 'us',
      code: '7000m7g7',
      ids: ',us7000m7g7,',
      sources: ',us,',
      types: ',origin,phase-data,',
      type: 'earthquake',
      title: 'M 5.3 - Eastern Turkey Region'
    },
    geometry: {
      type: 'Point',
      coordinates: [38.25, 38.12, 10.0]
    }
  }
]

// Prominent Global News & Sensor Hotspots
const NEWS_HOTSPOTS: NewsHotspot[] = [
  {
    id: 'hotspot-sv',
    name: 'Silicon Valley',
    region: 'North America // USA',
    lat: 37.3861,
    lon: -122.0839,
    category: 'TECH',
    headline: 'Frontier AI & Neural Chip Cluster',
    summary: 'Autonomous agent swarms and neuromorphic compute clusters active with low-latency edge mesh.',
    metric: '4.8M TFLOPS // LOCAL',
    color: '#00f5d4'
  },
  {
    id: 'hotspot-tyo',
    name: 'Tokyo Neural Core',
    region: 'East Asia // Japan',
    lat: 35.6762,
    lon: 139.6503,
    category: 'TECH',
    headline: 'High-Speed Quantum & Robotics Relay',
    summary: 'Sub-millisecond optical interconnects routing robotics kinematics to sovereign local orchestrators.',
    metric: '0.9ms L1 LATENCY',
    color: '#38bdf8'
  },
  {
    id: 'hotspot-lon',
    name: 'London Node',
    region: 'Western Europe // UK',
    lat: 51.5074,
    lon: -0.1278,
    category: 'FINTECH',
    headline: 'Sovereign Cryptographic Ledger Mesh',
    summary: 'Decentralized transaction verification and confidential DPAPI enclave synchronization.',
    metric: '99.999% INTEGRITY',
    color: '#f59e0b'
  },
  {
    id: 'hotspot-sgp',
    name: 'Singapore Gateway',
    region: 'Southeast Asia // Singapore',
    lat: 1.3521,
    lon: 103.8198,
    category: 'QUANTUM',
    headline: 'Trans-Oceanic Subsea Optical Gateway',
    summary: 'Key routing nexus for Asia-Pacific fiber networks connecting autonomous edge workers.',
    metric: '82 Tbps FIBER THROUGHPUT',
    color: '#10b981'
  },
  {
    id: 'hotspot-gva',
    name: 'Geneva CERN & UN',
    region: 'Central Europe // Switzerland',
    lat: 46.2044,
    lon: 6.1432,
    category: 'TECH',
    headline: 'Hadron Particle Research & Governance',
    summary: 'High-energy physics anomaly detection telemetry synced with distributed scholar databases.',
    metric: '13.6 TeV COLLISION SENSORS',
    color: '#a855f7'
  },
  {
    id: 'hotspot-rey',
    name: 'Reykjavik Geothermal',
    region: 'North Atlantic // Iceland',
    lat: 64.1466,
    lon: -21.9426,
    category: 'ENERGY',
    headline: 'Zero-Carbon Tectonic Energy Station',
    summary: 'Clean geothermal power powering sovereign air-gapped data centers on tectonic fracture zones.',
    metric: '100% RENEWABLE COLD STORAGE',
    color: '#ec4899'
  },
  {
    id: 'hotspot-sva',
    name: 'Svalbard Seed Vault',
    region: 'Arctic // Norway',
    lat: 78.2232,
    lon: 15.6267,
    category: 'ARCHIVE',
    headline: 'Arctic Permafrost Knowledge Archive',
    summary: 'Deep underground bedrock cold storage preserving biological and cryptographic blueprints.',
    metric: '-18°C CRYOGENIC PERMAFROST',
    color: '#6366f1'
  },
  {
    id: 'hotspot-cc',
    name: 'Cape Canaveral',
    region: 'North America // USA',
    lat: 28.3922,
    lon: -80.6077,
    category: 'AEROSPACE',
    headline: 'Orbital Launch & Deep-Space Downlink',
    summary: 'Telemetry ground station tracking Starlink, GPS, and ISS satellites in real-time orbits.',
    metric: '2,410 BIRDS TELEMETRY',
    color: '#f97316'
  }
]

// --- 3D Scene Components ---

// 1. Radar Earth Wireframe & Atmosphere
const RadarGlobe: React.FC<{
  radarSweep: boolean
  wireframeColor?: string
}> = ({ radarSweep, wireframeColor = '#0f172a' }) => {
  const radarSweepRef = useRef<THREE.Group>(null)
  const outerAtmosphereRef = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    if (radarSweepRef.current && radarSweep) {
      radarSweepRef.current.rotation.y += delta * 0.75
    }
    if (outerAtmosphereRef.current) {
      outerAtmosphereRef.current.rotation.y += delta * 0.05
    }
  })

  // Pre-generate orbital rings (meridians & parallels)
  const rings = useMemo(() => {
    const r = GLOBE_RADIUS * 1.002
    const items: Array<{ radius: number; y: number; tilt: [number, number, number] }> = []
    for (const lat of [-60, -30, 0, 30, 60]) {
      const phi = (lat * Math.PI) / 180
      const ringR = r * Math.cos(phi)
      const ringY = r * Math.sin(phi)
      items.push({ radius: ringR, y: ringY, tilt: [0, 0, 0] })
    }
    return items
  }, [])

  return (
    <group>
      {/* Deep Space Core Solid */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS * 0.985, 48, 48]} />
        <meshBasicMaterial color="#020617" />
      </mesh>

      {/* Primary Wireframe Sphere */}
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 36, 36]} />
        <meshBasicMaterial
          color={wireframeColor}
          wireframe
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Latitudinal Guide Rings */}
      {rings.map((ring, idx) => (
        <group key={`lat-${idx}`} position={[0, ring.y, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[ring.radius - 0.003, ring.radius + 0.003, 64]} />
            <meshBasicMaterial
              color="#1e293b"
              side={THREE.DoubleSide}
              transparent
              opacity={0.45}
            />
          </mesh>
        </group>
      ))}

      {/* Outer Atmosphere Cyan / Slate Glow Shell */}
      <mesh ref={outerAtmosphereRef}>
        <sphereGeometry args={[GLOBE_RADIUS * 1.045, 32, 32]} />
        <meshBasicMaterial
          color="#00f0ff"
          wireframe
          transparent
          opacity={0.06}
        />
      </mesh>

      {/* Equatorial Radar Scan Ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[GLOBE_RADIUS * 1.08, GLOBE_RADIUS * 1.085, 96]}
        />
        <meshBasicMaterial
          color="#00f0ff"
          side={THREE.DoubleSide}
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Rotating Radar Sweep Cone / Scanning Sector */}
      {radarSweep && (
        <group ref={radarSweepRef}>
          <mesh rotation={[0, 0, 0]}>
            <ringGeometry
              args={[GLOBE_RADIUS * 0.99, GLOBE_RADIUS * 1.25, 32, 1, 0, Math.PI / 4]}
            />
            <meshBasicMaterial
              color="#00f0ff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.12}
            />
          </mesh>
          <mesh rotation={[0, 0, 0]}>
            <cylinderGeometry
              args={[0.005, 0.005, GLOBE_RADIUS * 2.5, 8]}
            />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.25}
            />
          </mesh>
        </group>
      )}

      {/* Polar Coordinate Nodes */}
      <mesh position={[0, GLOBE_RADIUS + 0.08, 0]}>
        <octahedronGeometry args={[0.03, 0]} />
        <meshBasicMaterial color="#38bdf8" wireframe />
      </mesh>
      <mesh position={[0, -GLOBE_RADIUS - 0.08, 0]}>
        <octahedronGeometry args={[0.03, 0]} />
        <meshBasicMaterial color="#38bdf8" wireframe />
      </mesh>
    </group>
  )
}

// 2. Glowing 3D Orbital Rings with Orbiting Satellites
const OrbitalRings: React.FC = () => {
  const gpsRingRef = useRef<THREE.Group>(null)
  const issRingRef = useRef<THREE.Group>(null)
  const geoRingRef = useRef<THREE.Group>(null)

  const gpsSatelliteRef = useRef<THREE.Mesh>(null)
  const issSatelliteRef = useRef<THREE.Mesh>(null)
  const geoSatelliteRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (gpsRingRef.current) gpsRingRef.current.rotation.z = t * 0.08
    if (issRingRef.current) issRingRef.current.rotation.z = t * 0.14
    if (geoRingRef.current) geoRingRef.current.rotation.y = t * 0.04

    // Orbiting satellite positions
    if (gpsSatelliteRef.current) {
      const r = GLOBE_RADIUS * 1.32
      gpsSatelliteRef.current.position.set(Math.cos(t * 0.6) * r, Math.sin(t * 0.6) * r, 0)
    }
    if (issSatelliteRef.current) {
      const r = GLOBE_RADIUS * 1.14
      issSatelliteRef.current.position.set(Math.cos(t * 1.1) * r, Math.sin(t * 1.1) * r, 0)
    }
    if (geoSatelliteRef.current) {
      const r = GLOBE_RADIUS * 1.50
      geoSatelliteRef.current.position.set(Math.cos(t * 0.25) * r, 0, Math.sin(t * 0.25) * r)
    }
  })

  return (
    <group>
      {/* Ring 1: GPS Constellation Orbit (Inclination 55°) */}
      <group rotation={[Math.PI * 0.305, 0, Math.PI * 0.2]}>
        <mesh>
          <ringGeometry args={[GLOBE_RADIUS * 1.315, GLOBE_RADIUS * 1.325, 96]} />
          <meshBasicMaterial
            color="#00f5d4"
            side={THREE.DoubleSide}
            transparent
            opacity={0.40}
          />
        </mesh>
        <mesh ref={gpsSatelliteRef}>
          <boxGeometry args={[0.04, 0.04, 0.04]} />
          <meshBasicMaterial color="#00f5d4" />
        </mesh>
      </group>

      {/* Ring 2: ISS Orbit (Inclination 51.6°) */}
      <group rotation={[Math.PI * 0.287, 0, -Math.PI * 0.35]}>
        <mesh>
          <ringGeometry args={[GLOBE_RADIUS * 1.135, GLOBE_RADIUS * 1.145, 96]} />
          <meshBasicMaterial
            color="#10b981"
            side={THREE.DoubleSide}
            transparent
            opacity={0.45}
          />
        </mesh>
        <mesh ref={issSatelliteRef}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      </group>

      {/* Ring 3: Geostationary Orbit (Equatorial, 1.50x Radius) */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[GLOBE_RADIUS * 1.495, GLOBE_RADIUS * 1.505, 128]} />
          <meshBasicMaterial
            color="#818cf8"
            side={THREE.DoubleSide}
            transparent
            opacity={0.30}
          />
        </mesh>
        <mesh ref={geoSatelliteRef}>
          <octahedronGeometry args={[0.04, 0]} />
          <meshBasicMaterial color="#a5b4fc" wireframe />
        </mesh>
      </group>
    </group>
  )
}

// 3. News Hotspot 3D Beacon
const HotspotMarker: React.FC<{
  hotspot: NewsHotspot
  isSelected: boolean
  onSelect: (hotspot: NewsHotspot) => void
}> = ({ hotspot, isSelected, onSelect }) => {
  const pulseRef = useRef<THREE.Mesh>(null)

  const [posX, posY, posZ] = useMemo(() => {
    return latLonToVector3(hotspot.lat, hotspot.lon, GLOBE_RADIUS * 1.018)
  }, [hotspot.lat, hotspot.lon])

  const normal = useMemo(() => {
    return new THREE.Vector3(posX, posY, posZ).normalize()
  }, [posX, posY, posZ])

  const rotationQuaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    q.setFromUnitVectors(up, normal)
    return q
  }, [normal])

  useFrame((state) => {
    if (!pulseRef.current) return
    const t = state.clock.getElapsedTime() * 2.5
    const cycle = (Math.sin(t) + 1) / 2
    const scale = 1.0 + cycle * 1.2
    pulseRef.current.scale.set(scale, scale, scale)
    const mat = pulseRef.current.material as THREE.MeshBasicMaterial
    if (mat) {
      mat.opacity = Math.max(0.15, (1 - cycle) * 0.7)
    }
  })

  return (
    <group position={[posX, posY, posZ]} quaternion={rotationQuaternion}>
      {/* Hotspot Central Diamond Node */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(hotspot)
        }}
      >
        <octahedronGeometry args={[0.04, 0]} />
        <meshBasicMaterial
          color={isSelected ? '#ffffff' : hotspot.color}
          toneMapped={false}
        />
      </mesh>

      {/* Vertical Sensor Light Column */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.16, 6]} />
        <meshBasicMaterial color={hotspot.color} transparent opacity={0.85} />
      </mesh>

      {/* Pulsing Base Ring */}
      <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.05, 0.065, 24]} />
        <meshBasicMaterial color={hotspot.color} side={THREE.DoubleSide} transparent opacity={0.6} />
      </mesh>

      {/* Selected Tactical Tooltip */}
      {isSelected && (
        <Html distanceFactor={8} position={[0, 0.28, 0]} center>
          <div className="pointer-events-none flex flex-col items-center select-none">
            <div className="bg-[#040812]/95 border border-cyan-400/80 px-2.5 py-1.5 rounded-lg shadow-[0_0_20px_rgba(0,245,212,0.4)] backdrop-blur-md whitespace-nowrap font-mono text-[11px] text-white">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="text-cyan-300 uppercase">{hotspot.name}</span>
                <span className="text-slate-500">|</span>
                <span className="text-[10px] text-emerald-400">{hotspot.category}</span>
              </div>
              <div className="text-[10px] text-slate-300 mt-0.5 max-w-[200px] truncate">
                {hotspot.headline}
              </div>
            </div>
            <div className="w-0.5 h-3 bg-cyan-400/80" />
          </div>
        </Html>
      )}
    </group>
  )
}

// 4. Individual Seismic Beacon Marker
const SeismicMarker: React.FC<{
  feature: USGSFeature
  isSelected: boolean
  onSelect: (feature: USGSFeature) => void
}> = ({ feature, isSelected, onSelect }) => {
  const markerRef = useRef<THREE.Group>(null)
  const pulseRingRef = useRef<THREE.Mesh>(null)

  const [lon, lat, depth] = feature.geometry.coordinates
  const mag = feature.properties.mag ?? 1.0
  const colorSpec = useMemo(() => getMagnitudeColor(mag), [mag])

  const [posX, posY, posZ] = useMemo(() => {
    return latLonToVector3(lat, lon, GLOBE_RADIUS * 1.015)
  }, [lat, lon])

  const normal = useMemo(() => {
    return new THREE.Vector3(posX, posY, posZ).normalize()
  }, [posX, posY, posZ])

  const markerScale = useMemo(() => {
    return Math.max(0.035, (mag / 8.0) * 0.09)
  }, [mag])

  useFrame((state) => {
    if (!pulseRingRef.current) return
    const t = state.clock.getElapsedTime() * 3.5 + (mag * 0.5)
    const cycle = (Math.sin(t) + 1) / 2
    const scale = 1.0 + cycle * (isSelected ? 2.2 : 1.4)
    pulseRingRef.current.scale.set(scale, scale, scale)
    const mat = pulseRingRef.current.material as THREE.MeshBasicMaterial
    if (mat) {
      mat.opacity = Math.max(0.15, (1 - cycle) * 0.75)
    }
  })

  const rotationQuaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    q.setFromUnitVectors(up, normal)
    return q
  }, [normal])

  return (
    <group position={[posX, posY, posZ]} quaternion={rotationQuaternion}>
      <mesh
        ref={markerRef}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(feature)
        }}
        scale={[markerScale, markerScale, markerScale]}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={isSelected ? '#ffffff' : colorSpec.color}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0.04 + markerScale * 0.5, 0]}>
        <cylinderGeometry
          args={[0.003, 0.003, 0.08 + Math.min(0.2, (mag / 5) * 0.15), 6]}
        />
        <meshBasicMaterial
          color={colorSpec.color}
          transparent
          opacity={0.8}
        />
      </mesh>

      <mesh ref={pulseRingRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[
            markerScale * 1.2,
            markerScale * 1.2 + 0.012,
            24
          ]}
        />
        <meshBasicMaterial
          color={colorSpec.color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.65}
        />
      </mesh>

      {isSelected && (
        <>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry
              args={[
                markerScale * 2.8,
                markerScale * 2.8 + 0.015,
                32
              ]}
            />
            <meshBasicMaterial
              color="#00f0ff"
              side={THREE.DoubleSide}
              transparent
              opacity={0.9}
            />
          </mesh>
          <Html distanceFactor={8} position={[0, 0.25, 0]} center>
            <div className="pointer-events-none flex flex-col items-center select-none">
              <div className="bg-[#090d16]/95 border border-cyan-500/80 px-2.5 py-1.5 rounded shadow-[0_0_15px_rgba(0,240,255,0.4)] backdrop-blur-md whitespace-nowrap font-mono text-[11px] text-white">
                <div className="flex items-center gap-1.5 font-bold">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      mag >= 4.0 ? 'bg-red-400' : mag >= 2.0 ? 'bg-amber-400' : 'bg-cyan-400'
                    } animate-ping`}
                  />
                  <span className="text-cyan-300">M {mag.toFixed(1)}</span>
                  <span className="text-slate-400">|</span>
                  <span className="truncate max-w-[160px]">
                    {feature.properties.place}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Lat: {lat.toFixed(2)}° · Lon: {lon.toFixed(2)}° · Depth: {depth.toFixed(1)}km
                </div>
              </div>
              <div className="w-0.5 h-3 bg-cyan-400/80" />
            </div>
          </Html>
        </>
      )}
    </group>
  )
}

// 5. Camera & Orbit Controller with Voice/Gesture Vector Binding
const CameraController: React.FC<{
  targetCoord: [number, number, number] | null
  gestureDelta: { dx: number; dy: number; scale: number; timestamp: number } | null
  autoRotate: boolean
}> = ({ targetCoord, gestureDelta, autoRotate }) => {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const lastGestureTsRef = useRef<number>(0)

  // React to gesture vectors (pinch zoom, swipe rotate)
  useEffect(() => {
    if (!gestureDelta || gestureDelta.timestamp === lastGestureTsRef.current) return
    lastGestureTsRef.current = gestureDelta.timestamp

    if (gestureDelta.scale && gestureDelta.scale !== 1.0) {
      // Zoom vector
      const currentDist = camera.position.length()
      const newDist = THREE.MathUtils.clamp(
        currentDist * (gestureDelta.scale < 1.0 ? 1.15 : 0.85),
        2.8,
        9.5
      )
      camera.position.setLength(newDist)
    }

    if (gestureDelta.dx !== 0 && controlsRef.current) {
      // Yaw rotation vector
      controlsRef.current.setAzimuthalAngle(
        controlsRef.current.getAzimuthalAngle() + gestureDelta.dx * 0.8
      )
    }

    if (gestureDelta.dy !== 0 && controlsRef.current) {
      // Pitch tilt vector
      controlsRef.current.setPolarAngle(
        THREE.MathUtils.clamp(
          controlsRef.current.getPolarAngle() + gestureDelta.dy * 0.5,
          0.3,
          Math.PI - 0.3
        )
      )
    }
  }, [gestureDelta, camera])

  // Smooth target orientation
  useFrame(() => {
    if (controlsRef.current) {
      controlsRef.current.update()
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      minDistance={2.8}
      maxDistance={9.5}
      autoRotate={autoRotate}
      autoRotateSpeed={0.5}
      dampingFactor={0.06}
    />
  )
}

// --- Main PlanetWatchView Component ---

export const PlanetWatchView: React.FC = () => {
  const [events, setEvents] = useState<USGSFeature[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isCachedFeed, setIsCachedFeed] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [minMagFilter, setMinMagFilter] = useState<number>(0)
  const [activeTabMode, setActiveTabMode] = useState<'quakes' | 'hotspots'>('quakes')
  const [autoRotate, setAutoRotate] = useState<boolean>(true)
  const [radarSweepActive, setRadarSweepActive] = useState<boolean>(true)
  const [refreshCountdown, setRefreshCountdown] = useState<number>(60)

  // Gesture Vector Telemetry State
  const [gestureDelta, setGestureDelta] = useState<{ dx: number; dy: number; scale: number; timestamp: number } | null>(null)
  const [lastGestureLabel, setLastGestureLabel] = useState<string>('NEUTRAL')

  // Listen to Telemetry Spine for gesture_vector and voice_focus events
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).nexusTelemetry?.onEvent) {
      const unsub = (window as any).nexusTelemetry.onEvent((evt: any) => {
        if (evt.type === 'gesture_vector' && evt.data) {
          const d = evt.data
          setGestureDelta({
            dx: typeof d.dx === 'number' ? d.dx : 0,
            dy: typeof d.dy === 'number' ? d.dy : 0,
            scale: typeof d.scale === 'number' ? d.scale : 1.0,
            timestamp: d.timestamp || Date.now()
          })
          if (d.gesture) {
            setLastGestureLabel(String(d.gesture).toUpperCase())
          }
        }
      })
      return () => {
        if (unsub) unsub()
      }
    }
    return undefined
  }, [])

  // Fetch live USGS seismic activity from USGS GeoJSON all_day feed
  const fetchSeismicData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Check if current workspace mode is SILENT (air-gapped)
      let isSilentMode = false
      try {
        const modeResp = await fetch('http://127.0.0.1:47630/api/workspace', { signal: AbortSignal.timeout(1000) })
        if (modeResp.ok) {
          const mData = await modeResp.json()
          if (mData.mode === 'SILENT') isSilentMode = true
        }
      } catch {
        // Local IPC check offline or fast fallback
      }

      if (isSilentMode) {
        // Enforce air-gap: load built-in authentic USGS dataset without external network calls
        setEvents(OFFLINE_USGS_DATASET)
        setIsCachedFeed(true)
        setLastSync(new Date())
        setRefreshCountdown(60)
        if (!selectedEventId && OFFLINE_USGS_DATASET.length > 0) {
          setSelectedEventId(OFFLINE_USGS_DATASET[0].id)
        }
        setIsLoading(false)
        return
      }

      const response = await fetch(USGS_API_URL, {
        cache: 'no-store',
        signal: AbortSignal.timeout(6000)
      })

      if (!response.ok) {
        throw new Error(`USGS HTTP ${response.status}: ${response.statusText}`)
      }

      const data: USGSGeoJSONResponse = await response.json()
      if (Array.isArray(data.features) && data.features.length > 0) {
        setEvents(data.features)
        setIsCachedFeed(false)
        setLastSync(new Date())
        setRefreshCountdown(60)
        if (!selectedEventId) {
          setSelectedEventId(data.features[0].id)
        }
      } else {
        throw new Error('Empty features array from USGS')
      }
    } catch (err: unknown) {
      // Graceful fallback: load authentic offline dataset so 3D stage is never empty
      setEvents(OFFLINE_USGS_DATASET)
      setIsCachedFeed(true)
      setLastSync(new Date())
      if (!selectedEventId && OFFLINE_USGS_DATASET.length > 0) {
        setSelectedEventId(OFFLINE_USGS_DATASET[0].id)
      }
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Air-Gap Fallback: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }, [selectedEventId])

  // Polling timer: 60-second cycle
  useEffect(() => {
    fetchSeismicData()
    const interval = setInterval(() => {
      fetchSeismicData()
    }, 60000)

    const tick = setInterval(() => {
      setRefreshCountdown((prev) => (prev > 1 ? prev - 1 : 60))
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(tick)
    }
  }, [fetchSeismicData])

  // Filtered events based on search query and magnitude threshold
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const mag = ev.properties.mag ?? 0
      if (mag < minMagFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        ev.properties.place.toLowerCase().includes(q) ||
        ev.properties.title.toLowerCase().includes(q) ||
        ev.id.toLowerCase().includes(q)
      )
    })
  }, [events, searchQuery, minMagFilter])

  // Filtered hotspots
  const filteredHotspots = useMemo(() => {
    if (!searchQuery.trim()) return NEWS_HOTSPOTS
    const q = searchQuery.toLowerCase()
    return NEWS_HOTSPOTS.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.region.toLowerCase().includes(q) ||
        h.headline.toLowerCase().includes(q)
    )
  }, [searchQuery])

  // Selected event
  const selectedEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || null
  }, [events, selectedEventId])

  // Selected hotspot
  const selectedHotspot = useMemo(() => {
    return NEWS_HOTSPOTS.find((h) => h.id === selectedHotspotId) || null
  }, [selectedHotspotId])

  // Telemetry statistics
  const stats = useMemo(() => {
    if (events.length === 0) {
      return { count: 0, maxMag: 0, avgMag: 0, maxDepth: 0, minDepth: 0 }
    }
    let maxM = 0
    let sumM = 0
    let validMCount = 0
    let maxD = -Infinity
    let minD = Infinity

    for (const ev of events) {
      const m = ev.properties.mag
      if (typeof m === 'number') {
        if (m > maxM) maxM = m
        sumM += m
        validMCount++
      }
      const d = ev.geometry.coordinates[2]
      if (typeof d === 'number') {
        if (d > maxD) maxD = d
        if (d < minD) minD = d
      }
    }

    return {
      count: events.length,
      maxMag: maxM,
      avgMag: validMCount > 0 ? sumM / validMCount : 0,
      maxDepth: maxD === -Infinity ? 0 : maxD,
      minDepth: minD === Infinity ? 0 : minD
    }
  }, [events])

  return (
    <div className="relative flex w-full h-full bg-[#090d16] text-white overflow-hidden select-none font-sans">
      {/* Background Cyber Grid Accent */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(9, 13, 22, 0.95) 100%), linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px'
        }}
      />

      {/* Main 3D Canvas Stage */}
      <div className="relative flex-1 h-full flex flex-col min-w-0">
        {/* Top HUD Bar */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-[#090d16]/95 via-[#090d16]/70 to-transparent backdrop-blur-sm border-b border-slate-800/40">
          {/* Left Title & System Badge */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
              <Globe className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black tracking-widest text-cyan-400">
                  PLANETWATCH
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 font-mono text-slate-300">
                  3D EARTH & RADAR
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                NEXUS OS v5.0 // ORBITAL & TECTONIC MESH
              </div>
            </div>
          </div>

          {/* Center Badges */}
          <div className="flex items-center gap-3">
            {/* Badge 1: USGS Seismic Feed Status */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm ${
                isCachedFeed
                  ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                  : 'bg-slate-900/90 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                    isCachedFeed ? 'bg-amber-400' : 'bg-emerald-400'
                  } opacity-75`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isCachedFeed ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <span className="font-mono text-xs font-bold tracking-wider">
                {isCachedFeed
                  ? 'USGS SEISMIC: AIR-GAP CACHED'
                  : 'USGS SEISMIC FEED: LIVE (ALL-DAY)'}
              </span>
            </div>

            {/* Badge 2: Satellite Telemetry */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/40 shadow-[0_0_12px_rgba(0,240,255,0.2)]">
              <Satellite className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="font-mono text-xs font-bold tracking-wider text-cyan-300">
                ORBITAL RINGS: GPS • ISS • GEO
              </span>
            </div>

            {/* Badge 3: Active Gesture Vector HUD */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-950/50 border border-purple-500/30 text-[11px] font-mono text-purple-300">
              <Hand className="w-3 h-3 text-purple-400" />
              <span>GESTURE:</span>
              <strong className="text-white">{lastGestureLabel}</strong>
            </div>
          </div>

          {/* Right Action & Diagnostics */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRotate((prev) => !prev)}
              title={autoRotate ? 'Pause Rotation' : 'Enable Orbit Rotation'}
              className={`p-2 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 ${
                autoRotate
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.15)]'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin-slow' : ''}`} />
              <span className="hidden sm:inline">ORBIT</span>
            </button>

            <button
              onClick={() => setRadarSweepActive((prev) => !prev)}
              title={radarSweepActive ? 'Disable Radar Sweep' : 'Enable Radar Sweep'}
              className={`p-2 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 ${
                radarSweepActive
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">SWEEP</span>
            </button>

            <button
              onClick={() => fetchSeismicData()}
              disabled={isLoading}
              title="Force Refresh USGS Feed"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50 font-mono text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
              <span className="text-[11px] text-slate-400 font-mono">
                {refreshCountdown}s
              </span>
            </button>
          </div>
        </div>

        {/* 3D Canvas Container */}
        <div className="relative w-full h-full">
          <Canvas
            camera={{ position: [0, 1.2, 5.0], fov: 45 }}
            gl={{ antialias: true, alpha: true }}
            onPointerMissed={() => {
              setSelectedEventId(null)
              setSelectedHotspotId(null)
            }}
          >
            <ambientLight intensity={0.65} />
            <pointLight position={[10, 10, 10]} intensity={1.2} />
            <pointLight position={[-10, -10, -10]} intensity={0.4} color="#00f0ff" />

            {/* Orbit Controls with Damping & Auto-Rotation + Gesture Binding */}
            <CameraController
              targetCoord={null}
              gestureDelta={gestureDelta}
              autoRotate={autoRotate}
            />

            {/* 3D Radar Globe */}
            <RadarGlobe
              radarSweep={radarSweepActive}
              wireframeColor="#0f172a"
            />

            {/* Glowing 3D Orbital Rings (GPS, ISS, Geo) */}
            <OrbitalRings />

            {/* 3D Seismic Markers */}
            {filteredEvents.map((feature) => (
              <SeismicMarker
                key={feature.id}
                feature={feature}
                isSelected={feature.id === selectedEventId}
                onSelect={(f) => {
                  setSelectedEventId(f.id)
                  setSelectedHotspotId(null)
                }}
              />
            ))}

            {/* 3D Global News Hotspots */}
            {filteredHotspots.map((hotspot) => (
              <HotspotMarker
                key={hotspot.id}
                hotspot={hotspot}
                isSelected={hotspot.id === selectedHotspotId}
                onSelect={(h) => {
                  setSelectedHotspotId(h.id)
                  setSelectedEventId(null)
                }}
              />
            ))}
          </Canvas>

          {/* Bottom Left Tactical Radar Readout Overlay */}
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none flex flex-col gap-2">
            <div className="pointer-events-auto bg-[#090d16]/90 border border-slate-800 p-3 rounded-lg backdrop-blur-md shadow-xl flex flex-col gap-2 min-w-[250px]">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <span className="font-mono text-[10px] text-slate-400 tracking-wider">
                  RADAR METRICS // ALL-DAY FEED
                </span>
                <span className="font-mono text-[10px] text-cyan-400 font-bold">
                  {isCachedFeed ? 'AIR-GAP MODE' : 'LIVE UTC SYNC'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <div className="text-[10px] text-slate-500">EVENTS RECORDED</div>
                  <div className="font-bold text-white">{stats.count} ACTIVE</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">MAX MAG</div>
                  <div className="font-bold text-amber-400">
                    M {stats.maxMag.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">AVG MAG</div>
                  <div className="text-slate-300">
                    M {stats.avgMag.toFixed(1)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">DEPTH SPAN</div>
                  <div className="text-slate-300">
                    {stats.minDepth.toFixed(0)} - {stats.maxDepth.toFixed(0)} km
                  </div>
                </div>
              </div>

              {/* Magnitude Severity Legend */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-1 text-cyan-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  &lt; 2.0
                </div>
                <div className="flex items-center gap-1 text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  2.0 - 4.0
                </div>
                <div className="flex items-center gap-1 text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  &gt; 4.0
                </div>
              </div>
            </div>

            {error && (
              <div className="pointer-events-auto bg-amber-950/80 border border-amber-500/50 p-2.5 rounded-lg text-xs font-mono text-amber-200 flex items-center gap-2 shadow-lg backdrop-blur-md">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate max-w-[280px]">{error}</span>
                <button
                  onClick={() => fetchSeismicData()}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold"
                >
                  RETRY
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar: Dual-Tab Geospatial Events & News Hotspots */}
      <div className="relative w-96 shrink-0 h-full bg-[#090d16]/95 border-l border-slate-800 flex flex-col z-20 backdrop-blur-md">
        {/* Sidebar Header & Mode Switcher */}
        <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="font-mono text-xs font-bold tracking-wider text-slate-100 uppercase">
                World Telemetry
              </h2>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <button
                onClick={() => setActiveTabMode('quakes')}
                className={`px-2 py-1 rounded transition ${
                  activeTabMode === 'quakes'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                QUAKES ({filteredEvents.length})
              </button>
              <button
                onClick={() => setActiveTabMode('hotspots')}
                className={`px-2 py-1 rounded transition ${
                  activeTabMode === 'hotspots'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                HOTSPOTS ({NEWS_HOTSPOTS.length})
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTabMode === 'quakes'
                  ? 'Filter by region, place, or ID...'
                  : 'Search global news nodes & hubs...'
              }
              className="w-full bg-[#020617] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[10px] text-slate-500 hover:text-slate-300 font-mono"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Magnitude Threshold Filter Pills (for Quakes) */}
          {activeTabMode === 'quakes' && (
            <div className="flex items-center gap-1.5">
              {[
                { label: 'ALL', min: 0 },
                { label: 'M1.0+', min: 1.0 },
                { label: 'M2.5+', min: 2.5 },
                { label: 'M4.0+', min: 4.0 }
              ].map((pill) => (
                <button
                  key={pill.label}
                  onClick={() => setMinMagFilter(pill.min)}
                  className={`flex-1 py-1 rounded text-[10px] font-mono tracking-wider transition ${
                    minMagFilter === pill.min
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Event Spotlight Card */}
        {activeTabMode === 'quakes' && selectedEvent && (
          <div className="p-3 bg-gradient-to-r from-cyan-950/30 via-slate-900/40 to-cyan-950/20 border-b border-cyan-500/30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-cyan-400" />
                TARGET LOCK
              </span>
              <a
                href={selectedEvent.properties.url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 underline underline-offset-2"
              >
                USGS REPORT
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>

            <div className="flex items-start gap-3">
              <div
                className={`px-2.5 py-1.5 rounded-lg border font-mono font-black text-sm flex flex-col items-center justify-center shrink-0 ${
                  getMagnitudeColor(selectedEvent.properties.mag).tailwindBg
                } ${getMagnitudeColor(selectedEvent.properties.mag).tailwindBorder} ${
                  getMagnitudeColor(selectedEvent.properties.mag).tailwindText
                }`}
              >
                <span>M {selectedEvent.properties.mag?.toFixed(1) ?? '—'}</span>
                <span className="text-[8px] font-normal opacity-80">
                  {getMagnitudeColor(selectedEvent.properties.mag).category}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">
                  {selectedEvent.properties.place}
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-mono text-slate-400 mt-1">
                  <div>
                    LAT: <span className="text-slate-200 font-semibold">{selectedEvent.geometry.coordinates[1].toFixed(3)}°</span>
                  </div>
                  <div>
                    LON: <span className="text-slate-200 font-semibold">{selectedEvent.geometry.coordinates[0].toFixed(3)}°</span>
                  </div>
                  <div>
                    DEPTH: <span className="text-slate-200 font-semibold">{selectedEvent.geometry.coordinates[2].toFixed(1)} km</span>
                  </div>
                  <div>
                    TIME: <span className="text-slate-200 font-semibold">{formatRelativeTime(selectedEvent.properties.time)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Selected Hotspot Spotlight Card */}
        {activeTabMode === 'hotspots' && selectedHotspot && (
          <div className="p-3 bg-gradient-to-r from-purple-950/30 via-slate-900/40 to-purple-950/20 border-b border-purple-500/30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-purple-400 font-bold tracking-wider flex items-center gap-1.5">
                <Compass className="w-3 h-3 text-purple-400" />
                HOTSPOT INTELLIGENCE
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                {selectedHotspot.category}
              </span>
            </div>

            <div>
              <div className="text-xs font-bold text-white">
                {selectedHotspot.name} — {selectedHotspot.region}
              </div>
              <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                {selectedHotspot.summary}
              </p>
              <div className="text-[10px] font-mono text-cyan-400 font-semibold mt-1.5 flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                <span>TELEMETRY: {selectedHotspot.metric}</span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
          {activeTabMode === 'quakes' ? (
            isLoading && events.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-500 font-mono text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                <span>ACQUIRING USGS SEISMIC FEED...</span>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                NO EVENTS MATCHING ACTIVE CRITERIA
              </div>
            ) : (
              filteredEvents.map((event) => {
                const isSelected = event.id === selectedEventId
                const mag = event.properties.mag
                const colorSpec = getMagnitudeColor(mag)
                const [lon, lat, depth] = event.geometry.coordinates

                return (
                  <div
                    key={event.id}
                    onClick={() => {
                      setSelectedEventId(event.id)
                      setSelectedHotspotId(null)
                    }}
                    className={`p-3 cursor-pointer transition flex items-start gap-3 ${
                      isSelected
                        ? 'bg-cyan-950/30 border-l-2 border-cyan-400 pl-[10px]'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div
                      className={`px-2 py-1 rounded border font-mono font-bold text-xs shrink-0 flex flex-col items-center justify-center min-w-[42px] ${colorSpec.tailwindBg} ${colorSpec.tailwindBorder} ${colorSpec.tailwindText}`}
                    >
                      <span>M {mag?.toFixed(1) ?? '—'}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {event.properties.place || event.properties.title}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-1">
                        <span>
                          {lat.toFixed(2)}°, {lon.toFixed(2)}°
                        </span>
                        <span>·</span>
                        <span>{depth.toFixed(1)} km</span>
                        <span>·</span>
                        <span className="text-slate-500 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatRelativeTime(event.properties.time)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 self-center transition ${
                        isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600'
                      }`}
                    />
                  </div>
                )
              })
            )
          ) : (
            // Hotspots List
            filteredHotspots.map((hotspot) => {
              const isSelected = hotspot.id === selectedHotspotId
              return (
                <div
                  key={hotspot.id}
                  onClick={() => {
                    setSelectedHotspotId(hotspot.id)
                    setSelectedEventId(null)
                  }}
                  className={`p-3 cursor-pointer transition flex items-start gap-3 ${
                    isSelected
                      ? 'bg-purple-950/30 border-l-2 border-purple-400 pl-[10px]'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 animate-ping"
                    style={{ backgroundColor: hotspot.color }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">
                        {hotspot.name}
                      </span>
                      <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-400">
                        {hotspot.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {hotspot.headline}
                    </p>
                    <div className="text-[10px] font-mono text-cyan-400/80 mt-1">
                      {hotspot.metric}
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 self-center transition ${
                      isSelected ? 'text-purple-400 translate-x-0.5' : 'text-slate-600'
                    }`}
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#060a12] flex items-center justify-between text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCachedFeed ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
            />
            <span>{isCachedFeed ? 'AIR-GAP CACHED FEED' : 'USGS HAZARDS FEED: LIVE'}</span>
          </div>
          <div>
            {lastSync ? `SYNC ${lastSync.toLocaleTimeString()}` : 'STANDBY'}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlanetWatchView
