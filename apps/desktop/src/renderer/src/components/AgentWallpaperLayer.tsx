// apps/desktop/src/renderer/src/components/AgentWallpaperLayer.tsx
// NEXUS OS v5.0 — Autonomous Desktop Spatial Neural Engine
// Agent Wallpaper Layer: Layer -1 (z-0 fixed inset-0) Ambient Visual Backbone
// Supports Image (nexus-asset://), Video (auto-pausing on hidden/silent/battery),
// Direct URL, and 5 WebGL Shaders (nebula_vortex, plasma_waves, cyber_grid,
// constellation_starfield, pure_void) with Audio-Reactive Surge.

import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useTheme } from '../context/ThemeProvider'

export type WallpaperKind = 'image' | 'video' | 'shader' | 'url' | string

export interface WallpaperConfig {
  opacity?: number
  blur?: number
  vignette?: number
  parallax?: number
  audio_reactive?: boolean
  blend_mode?: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | string
  playback_rate?: number
  scale?: number
  [key: string]: any
}

export interface WallpaperItem {
  id: string
  name: string
  kind: WallpaperKind
  source_path: string
  mode_binding?: string
  config?: WallpaperConfig
  config_json?: string | WallpaperConfig
  is_active?: number | boolean
  updated_at?: string
}

export interface AgentWallpaperLayerProps {
  wallpaper?: WallpaperItem | null
  activeWallpaper?: WallpaperItem | null
  mode?: string
  className?: string
  onWallpaperChange?: (wallpaper: WallpaperItem) => void
}

// Built-in Default WebGL Shader Wallpaper
const DEFAULT_WALLPAPER: WallpaperItem = {
  id: 'nebula_vortex_shader',
  name: 'Nebula Vortex WebGL',
  kind: 'shader',
  source_path: 'shader://nebula_vortex',
  mode_binding: 'GLOBAL',
  config: {
    opacity: 0.9,
    blur: 0,
    vignette: 0.4,
    parallax: 12,
    audio_reactive: true,
    blend_mode: 'screen'
  },
  is_active: 1
}

// Map of canonical shader identifiers
const SHADER_MAP: Record<string, string> = {
  nebula_vortex: 'nebula_vortex',
  nebula_vortex_shader: 'nebula_vortex',
  'shader://nebula_vortex': 'nebula_vortex',

  plasma_waves: 'plasma_waves',
  plasma_waves_shader: 'plasma_waves',
  'shader://plasma_waves': 'plasma_waves',

  cyber_grid: 'cyber_grid',
  cyber_grid_shader: 'cyber_grid',
  'shader://cyber_grid': 'cyber_grid',

  constellation_starfield: 'constellation_starfield',
  'shader://constellation_starfield': 'constellation_starfield',

  pure_void: 'pure_void',
  'shader://pure_void': 'pure_void'
}

/**
 * Resolves local wallpaper file paths into secure nexus-asset:// URLs or returns existing URLs.
 */
export function resolveWallpaperAssetUrl(sourcePath?: string): string {
  if (!sourcePath) return ''
  const trimmed = sourcePath.trim()
  if (
    trimmed.startsWith('nexus-asset://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed
  }

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized.includes('.nexus-agent/wallpapers/')) {
    const filename = normalized.split('.nexus-agent/wallpapers/')[1]
    return `nexus-asset://wallpapers/${encodeURI(filename)}`
  }
  if (normalized.includes('docs/screenshots/')) {
    const filename = normalized.split('docs/screenshots/')[1]
    return `nexus-asset://screenshots/${encodeURI(filename)}`
  }
  return `nexus-asset://${encodeURI(normalized.replace(/^\/+/, ''))}`
}

/**
 * Safely parses config whether stored in config or config_json
 */
function parseWallpaperConfig(wallpaper?: WallpaperItem | null): WallpaperConfig {
  if (!wallpaper) {
    return {
      opacity: 1.0,
      blur: 0,
      vignette: 0.0,
      parallax: 0,
      audio_reactive: false,
      blend_mode: 'normal'
    }
  }

  let baseCfg: WallpaperConfig = {}
  if (wallpaper.config && typeof wallpaper.config === 'object') {
    baseCfg = { ...wallpaper.config }
  } else if (wallpaper.config_json) {
    if (typeof wallpaper.config_json === 'string') {
      try {
        baseCfg = JSON.parse(wallpaper.config_json)
      } catch {
        baseCfg = {}
      }
    } else if (typeof wallpaper.config_json === 'object') {
      baseCfg = { ...wallpaper.config_json }
    }
  }

  return {
    opacity: baseCfg.opacity ?? 0.9,
    blur: Math.min(Math.max(baseCfg.blur ?? 0, 0), 40),
    vignette: Math.min(Math.max(baseCfg.vignette ?? 0.35, 0), 1),
    parallax: Math.min(Math.max(baseCfg.parallax ?? 10, 0), 25),
    audio_reactive: baseCfg.audio_reactive ?? true,
    blend_mode: baseCfg.blend_mode || 'normal',
    playback_rate: baseCfg.playback_rate ?? 1,
    ...baseCfg
  }
}

// ============================================================================
// WebGL Shader Source Code
// ============================================================================

const VERTEX_SHADER_SRC = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const FRAG_HEADER = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;
  uniform float u_audio_reactivity;
  uniform float u_audio_bass;
  uniform float u_audio_mid;
  uniform float u_audio_treble;
  uniform float u_opacity;
  uniform float u_vignette;

  mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
  }

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = rot(0.5) * p * 2.02;
      a *= 0.5;
    }
    return v;
  }
`

const NEBULA_VORTEX_FRAG = `
  ${FRAG_HEADER}
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv -= u_mouse * 0.15;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    float speed = u_time * (0.22 + u_audio_reactivity * 0.35);
    float twist = (2.2 + u_audio_bass * 1.8) / (r + 0.28);
    float theta = angle + twist - speed;

    vec2 spiralUv = vec2(cos(theta), sin(theta)) * r;

    float n1 = fbm(spiralUv * 3.6 + vec2(u_time * 0.08, -u_time * 0.05));
    float n2 = fbm(spiralUv * 7.2 - vec2(u_time * 0.12));
    float nebula = smoothstep(0.18, 0.85, n1 + n2 * 0.45);

    vec3 colDeep = vec3(0.02, 0.03, 0.08);
    vec3 colCyan = vec3(0.04, 0.72, 0.95);
    vec3 colMagenta = vec3(0.85, 0.12, 0.65);
    vec3 colViolet = vec3(0.48, 0.18, 0.92);
    vec3 colCore = vec3(0.98, 0.94, 0.85);

    vec3 color = mix(colDeep, colViolet, smoothstep(0.7, 0.1, r) * nebula);
    color = mix(color, colCyan, smoothstep(0.2, 0.6, n1) * (0.8 + u_audio_mid * 0.5));
    color = mix(color, colMagenta, smoothstep(0.4, 0.75, n2) * (0.7 + u_audio_bass * 0.6));

    float coreGlow = exp(-r * (7.0 - u_audio_bass * 2.5)) * (1.2 + u_audio_reactivity * 0.8);
    color += colCore * coreGlow;

    float vig = smoothstep(1.3, 0.3, length(gl_FragCoord.xy / u_resolution - 0.5));
    color *= mix(1.0, vig, u_vignette);

    gl_FragColor = vec4(color * u_opacity, u_opacity);
  }
`

const PLASMA_WAVES_FRAG = `
  ${FRAG_HEADER}
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv -= u_mouse * 0.1;

    vec2 p = uv * 3.8;
    float t = u_time * (0.32 + u_audio_reactivity * 0.45);

    float v1 = sin(p.x + t);
    float v2 = sin(p.y + t * 0.85);
    float v3 = sin(p.x + p.y + t * 0.7);

    float cx = p.x + 0.6 * sin(t * 0.4) - 0.3;
    float cy = p.y + 0.6 * cos(t * 0.35) - 0.3;
    float v4 = sin(sqrt(cx * cx + cy * cy + 1.0) + t * 1.4 + u_audio_bass * 2.2);

    float wave = (v1 + v2 + v3 + v4) * 0.25;

    float r = sin(wave * 3.1415 + 0.0 + u_audio_bass * 0.5) * 0.5 + 0.5;
    float g = sin(wave * 3.1415 + 2.094 + u_audio_mid * 0.4) * 0.5 + 0.5;
    float b = sin(wave * 3.1415 + 4.188 + u_audio_treble * 0.6) * 0.5 + 0.5;

    vec3 baseVoid = vec3(0.02, 0.03, 0.09);
    vec3 neonCyan = vec3(0.0, 0.88, 0.98);
    vec3 neonViolet = vec3(0.72, 0.15, 0.95);
    vec3 neonAmber = vec3(1.0, 0.55, 0.12);

    vec3 col = mix(baseVoid, neonCyan, r);
    col = mix(col, neonViolet, g * (0.8 + u_audio_bass * 0.5));
    col += neonAmber * pow(b, 3.2) * (0.6 + u_audio_treble * 0.8);

    float audioRipples = sin(length(uv) * 22.0 - u_time * 3.0) * u_audio_bass * 0.08;
    col += vec3(0.08, 0.28, 0.38) * audioRipples;

    float vig = smoothstep(1.3, 0.25, length(gl_FragCoord.xy / u_resolution - 0.5));
    col *= mix(1.0, vig, u_vignette);

    gl_FragColor = vec4(col * u_opacity, u_opacity);
  }
`

const CYBER_GRID_FRAG = `
  ${FRAG_HEADER}
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv.x -= u_mouse.x * 0.2;

    float horizon = -0.05 + u_mouse.y * 0.15;
    vec3 col = vec3(0.015, 0.02, 0.05);

    if (uv.y < horizon) {
      float depth = horizon - uv.y;
      float z = 1.0 / (depth * 3.8 + 0.02);
      float x = uv.x * z;
      float speed = u_time * (1.1 + u_audio_reactivity * 1.4);

      float audioWave = sin(z * 0.6 - speed * 1.8) * u_audio_bass * 0.18;
      x += audioWave;

      float gx = abs(fract(x * 0.8 + 0.5) - 0.5) / (fwidth(x * 0.8) + 0.0001);
      float gz = abs(fract(z * 0.4 + speed) - 0.5) / (fwidth(z * 0.4) + 0.0001);
      float line = min(gx, gz);
      float gridGlow = 1.0 - clamp(line, 0.0, 1.0);

      vec3 nearColor = vec3(0.0, 0.85, 1.0);
      vec3 farColor = vec3(0.95, 0.15, 0.65);
      vec3 gridCol = mix(nearColor, farColor, clamp(z * 0.04, 0.0, 1.0));

      col = mix(col, gridCol, gridGlow * exp(-depth * 2.2));
      col += vec3(0.05, 0.2, 0.35) * exp(-depth * 5.0) * (0.8 + u_audio_bass);
    } else {
      float sky = uv.y - horizon;
      col = mix(vec3(0.06, 0.02, 0.14), vec3(0.01, 0.015, 0.03), clamp(sky * 1.8, 0.0, 1.0));
      col += vec3(0.0, 0.75, 1.0) * exp(-sky * 16.0) * (0.9 + u_audio_bass * 0.8);
      col += vec3(0.9, 0.1, 0.6) * exp(-sky * 8.0) * (0.6 + u_audio_mid * 0.6);

      vec2 sunCenter = vec2(0.0, horizon + 0.32);
      float sunDist = length(uv - sunCenter);
      float sunRadius = 0.26 + u_audio_reactivity * 0.04;

      if (sunDist < sunRadius) {
        float normY = (uv.y - (sunCenter.y - sunRadius)) / (sunRadius * 2.0);
        float scanlines = sin((uv.y - sunCenter.y) * 85.0) * 0.5 + 0.5;
        bool isCut = (normY < 0.65) && (scanlines < (0.65 - normY * 0.8));
        if (!isCut) {
          vec3 sunGradient = mix(vec3(1.0, 0.15, 0.5), vec3(1.0, 0.85, 0.15), normY);
          col = mix(col, sunGradient, smoothstep(sunRadius, sunRadius - 0.01, sunDist));
        }
      }
    }

    float vig = smoothstep(1.35, 0.3, length(gl_FragCoord.xy / u_resolution - 0.5));
    col *= mix(1.0, vig, u_vignette);

    gl_FragColor = vec4(col * u_opacity, u_opacity);
  }
`

const CONSTELLATION_STARFIELD_FRAG = `
  ${FRAG_HEADER}
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  vec2 hash22(vec2 p) {
    float k = hash21(p);
    return vec2(k, hash21(p + k));
  }

  float lineSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv -= u_mouse * 0.08;

    vec3 col = vec3(0.012, 0.016, 0.035);

    vec2 gridUv = uv * 6.5;
    vec2 id = floor(gridUv);
    vec2 gv = fract(gridUv) - 0.5;

    vec2 points[9];
    int idx = 0;
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      for (float x = -1.0; x <= 1.0; x += 1.0) {
        vec2 offset = vec2(x, y);
        vec2 h = hash22(id + offset);
        vec2 pt = offset + (h - 0.5) * 0.75 + vec2(sin(u_time * 0.4 + h.x * 6.28), cos(u_time * 0.35 + h.y * 6.28)) * 0.12;
        points[idx] = pt;
        idx++;
      }
    }

    float lineGlow = 0.0;
    for (int i = 0; i < 9; i++) {
      for (int j = 0; j < 9; j++) {
        if (j > i) {
          float dist = length(points[i] - points[j]);
          if (dist < 1.35) {
            float d = lineSegment(gv, points[i], points[j]);
            float alpha = smoothstep(1.35, 0.4, dist);
            lineGlow += smoothstep(0.035, 0.0, d) * alpha;
          }
        }
      }
    }

    float stars = 0.0;
    for (int i = 0; i < 9; i++) {
      float d = length(gv - points[i]);
      float twinkle = sin(u_time * 2.0 + hash21(id + points[i]) * 10.0) * 0.35 + 0.65;
      float starRadius = (0.045 + u_audio_bass * 0.04) * twinkle;
      stars += smoothstep(starRadius, 0.0, d);
      stars += smoothstep(starRadius * 4.0, 0.0, d) * 0.4;
    }

    vec3 starCol = vec3(0.95, 0.98, 1.0);
    vec3 lineCol = mix(vec3(0.0, 0.8, 1.0), vec3(0.7, 0.2, 0.95), sin(u_time * 0.2) * 0.5 + 0.5);

    col += lineCol * lineGlow * (0.45 + u_audio_mid * 0.6);
    col += starCol * stars * (0.85 + u_audio_reactivity * 0.65);

    float bgTwinkle = hash21(floor(uv * 40.0));
    if (bgTwinkle > 0.985) {
      col += vec3(0.8, 0.9, 1.0) * (sin(u_time * 3.0 + bgTwinkle * 30.0) * 0.5 + 0.5) * 0.5;
    }

    float vig = smoothstep(1.4, 0.35, length(gl_FragCoord.xy / u_resolution - 0.5));
    col *= mix(1.0, vig, u_vignette);

    gl_FragColor = vec4(col * u_opacity, u_opacity);
  }
`

const PURE_VOID_FRAG = `
  ${FRAG_HEADER}
  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    uv -= u_mouse * 0.03;

    vec3 colDark = vec3(0.012, 0.016, 0.028);
    vec3 colDeep = vec3(0.032, 0.042, 0.065);

    float r = length(uv);
    float breathing = sin(u_time * 0.4) * 0.03 + (u_audio_bass * 0.06);
    vec3 col = mix(colDeep, colDark, clamp(r * 1.2 + breathing, 0.0, 1.0));

    vec2 moteUv = uv * 14.0 + vec2(sin(u_time * 0.15) * 0.5, u_time * 0.1);
    vec2 moteId = floor(moteUv);
    float moteHash = hash(moteId);
    if (moteHash > 0.965) {
      vec2 moteGv = fract(moteUv) - 0.5;
      float d = length(moteGv);
      float pulse = sin(u_time * 1.5 + moteHash * 20.0) * 0.5 + 0.5;
      float mote = smoothstep(0.08, 0.0, d) * pulse * (0.35 + u_audio_mid * 0.4);
      col += vec3(0.2, 0.65, 0.95) * mote;
    }

    float vig = smoothstep(1.5, 0.4, length(gl_FragCoord.xy / u_resolution - 0.5));
    col *= mix(1.0, vig, max(0.2, u_vignette));

    gl_FragColor = vec4(col * u_opacity, u_opacity);
  }
`

const SHADER_SOURCES: Record<string, string> = {
  nebula_vortex: NEBULA_VORTEX_FRAG,
  plasma_waves: PLASMA_WAVES_FRAG,
  cyber_grid: CYBER_GRID_FRAG,
  constellation_starfield: CONSTELLATION_STARFIELD_FRAG,
  pure_void: PURE_VOID_FRAG
}

// ============================================================================
// Helper: Raw WebGL Program Setup
// ============================================================================

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

// Safe hook to consume ThemeContext if mounted within ThemeProvider
function useOptionalTheme() {
  try {
    return useTheme()
  } catch {
    return null
  }
}

// ============================================================================
// Main AgentWallpaperLayer Component
// ============================================================================

export const AgentWallpaperLayer: React.FC<AgentWallpaperLayerProps> = ({
  wallpaper: directWallpaper,
  activeWallpaper: aliasWallpaper,
  mode = 'GLOBAL',
  className = '',
  onWallpaperChange
}) => {
  const themeContext = useOptionalTheme()

  const [internalWallpaper, setInternalWallpaper] = useState<WallpaperItem>(DEFAULT_WALLPAPER)
  const [isBatterySaving, setIsBatterySaving] = useState(false)
  const [isSilentMode, setIsSilentMode] = useState(mode.toUpperCase() === 'SILENT')
  const [isDocHidden, setIsDocHidden] = useState(false)
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 })
  const [audioSurgeScale, setAudioSurgeScale] = useState(1.0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const mousePosRef = useRef({ targetX: 0, targetY: 0, currentX: 0, currentY: 0 })
  const animationFrameRef = useRef<number | null>(null)

  // WebGL context & program cache (pure WebGL, zero Three.js)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programsRef = useRef<Map<string, WebGLProgram>>(new Map())
  const positionBufferRef = useRef<WebGLBuffer | null>(null)

  // Audio reactivity refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioTelemetryRef = useRef({ reactivity: 0, bass: 0, mid: 0, treble: 0 })

  // Effective wallpaper selection:
  // Prop `wallpaper` > prop `activeWallpaper` > `themeContext.wallpaper` > `internalWallpaper`
  const activeWp = useMemo(() => {
    const raw = directWallpaper ?? aliasWallpaper ?? (themeContext?.wallpaper as any) ?? internalWallpaper
    return raw || DEFAULT_WALLPAPER
  }, [directWallpaper, aliasWallpaper, themeContext?.wallpaper, internalWallpaper])

  const config = useMemo(() => parseWallpaperConfig(activeWp), [activeWp])

  // 1. Fetch active wallpaper from IPC Server if no prop was provided
  useEffect(() => {
    if (directWallpaper !== undefined || aliasWallpaper !== undefined) return

    let isMounted = true
    const fetchActive = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:47630/api/wallpapers?mode=${mode || 'GLOBAL'}`)
        if (res.ok && isMounted) {
          const data = await res.json()
          if (data.success && data.active_wallpaper) {
            setInternalWallpaper(data.active_wallpaper)
            if (onWallpaperChange) onWallpaperChange(data.active_wallpaper)
          }
        }
      } catch {
        // Retain default wallpaper
      }
    }
    fetchActive()
    return () => {
      isMounted = false
    }
  }, [directWallpaper, aliasWallpaper, mode, onWallpaperChange])

  // 2. Listen to custom wallpaper change events & audio telemetry
  useEffect(() => {
    const handleWallpaperChanged = (e: any) => {
      if (e.detail) {
        const wp = e.detail.wallpaper || e.detail
        if (wp && wp.kind) {
          setInternalWallpaper(wp)
          if (onWallpaperChange) onWallpaperChange(wp)
        } else if (e.detail.source || e.detail.path) {
          setInternalWallpaper((prev) => ({
            ...prev,
            kind: 'image',
            source_path: e.detail.source || e.detail.path || prev.source_path
          }))
        }
      }
    }

    const handleGovernorMode = (e: any) => {
      if (e.detail?.mode) {
        setIsSilentMode(String(e.detail.mode).toUpperCase() === 'SILENT')
      }
    }

    const handleAudioFft = (e: any) => {
      if (e.detail) {
        audioTelemetryRef.current = {
          reactivity: e.detail.energy ?? e.detail.reactivity ?? audioTelemetryRef.current.reactivity,
          bass: e.detail.bass ?? audioTelemetryRef.current.bass,
          mid: e.detail.mid ?? audioTelemetryRef.current.mid,
          treble: e.detail.treble ?? audioTelemetryRef.current.treble
        }
      }
    }

    window.addEventListener('wallpaper-changed', handleWallpaperChanged as EventListener)
    window.addEventListener('wallpaper-applied', handleWallpaperChanged as EventListener)
    window.addEventListener('nexus:wallpaper:update', handleWallpaperChanged as EventListener)
    window.addEventListener('nexus:governor:mode', handleGovernorMode as EventListener)
    window.addEventListener('nexus:audio:fft', handleAudioFft as EventListener)

    return () => {
      window.removeEventListener('wallpaper-changed', handleWallpaperChanged as EventListener)
      window.removeEventListener('wallpaper-applied', handleWallpaperChanged as EventListener)
      window.removeEventListener('nexus:wallpaper:update', handleWallpaperChanged as EventListener)
      window.removeEventListener('nexus:governor:mode', handleGovernorMode as EventListener)
      window.removeEventListener('nexus:audio:fft', handleAudioFft as EventListener)
    }
  }, [onWallpaperChange])

  // 3. Document visibility, battery status, and silent mode auto-pause
  useEffect(() => {
    const handleVisibility = () => {
      setIsDocHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    let batteryInstance: any = null
    if ('getBattery' in navigator) {
      ;(navigator as any)
        .getBattery()
        .then((battery: any) => {
          batteryInstance = battery
          const checkBattery = () => {
            const low = !battery.charging && battery.level < 0.2
            setIsBatterySaving(low)
          }
          checkBattery()
          battery.addEventListener('levelchange', checkBattery)
          battery.addEventListener('chargingchange', checkBattery)
        })
        .catch(() => {})
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (batteryInstance) {
        batteryInstance.removeEventListener?.('levelchange', () => {})
        batteryInstance.removeEventListener?.('chargingchange', () => {})
      }
    }
  }, [])

  useEffect(() => {
    setIsSilentMode(mode.toUpperCase() === 'SILENT')
  }, [mode])

  // Video auto-pausing execution on hidden / silent / battery low
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const shouldPause = isDocHidden || isSilentMode || isBatterySaving
    if (shouldPause) {
      video.pause()
    } else {
      video.play().catch(() => {})
    }
  }, [isDocHidden, isSilentMode, isBatterySaving, activeWp.kind])

  // 4. Parallax Mouse Tracker
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      mousePosRef.current.targetX = nx
      mousePosRef.current.targetY = ny
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // 5. Audio Reactivity: Web Audio API analyser setup with procedural rhythm fallback
  useEffect(() => {
    if (!config.audio_reactive) return

    const initAudio = async () => {
      try {
        if (!audioContextRef.current && typeof window !== 'undefined') {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioContextClass) {
            audioContextRef.current = new AudioContextClass()
            analyserRef.current = audioContextRef.current.createAnalyser()
            analyserRef.current.fftSize = 64
          }
        }
      } catch {
        // Procedural rhythm fallback active
      }
    }
    initAudio()

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
    }
  }, [config.audio_reactive])

  // 6. WebGL Shader Rendering Engine + Audio-Reactive Surge Loop
  useEffect(() => {
    const isShader = activeWp.kind === 'shader'
    const canvas = canvasRef.current

    let gl: WebGLRenderingContext | null = null
    let program: WebGLProgram | null = null

    if (isShader && canvas) {
      gl = glRef.current
      if (!gl) {
        gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
        glRef.current = gl
      }

      if (gl) {
        const shaderKey =
          SHADER_MAP[activeWp.source_path] ||
          SHADER_MAP[activeWp.id] ||
          'nebula_vortex'

        const fragSource = SHADER_SOURCES[shaderKey] || NEBULA_VORTEX_FRAG

        program = programsRef.current.get(shaderKey) || null
        if (!program) {
          const vShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC)
          const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragSource)
          if (vShader && fShader) {
            program = createProgram(gl, vShader, fShader)
            if (program) {
              programsRef.current.set(shaderKey, program)
            }
          }
        }

        if (program && !positionBufferRef.current) {
          const quadVertices = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0
          ])
          const buf = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, buf)
          gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)
          positionBufferRef.current = buf
        }
      }
    }

    const resizeCanvas = () => {
      if (!canvas || !gl) return
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.floor(window.innerWidth * dpr)
      const h = Math.floor(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const startTime = performance.now()
    const freqData = new Uint8Array(32)

    const render = (time: number) => {
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(render)
        return
      }

      const elapsedSec = (time - startTime) * 0.001

      // Mouse Parallax Lerping
      const mouse = mousePosRef.current
      mouse.currentX += (mouse.targetX - mouse.currentX) * 0.06
      mouse.currentY += (mouse.targetY - mouse.currentY) * 0.06

      // Audio analysis or procedural heartbeat
      let bass = 0.1
      let mid = 0.1
      let treble = 0.1
      let energy = 0.1

      // Audio-reactive surge: read from window.__NEXUS_AUDIO_RMS__ (set by CommandDeck FFT analyzer)
      const globalRms = typeof window !== 'undefined' ? (window as any).__NEXUS_AUDIO_RMS__ : undefined

      if (typeof globalRms === 'number' && !isNaN(globalRms)) {
        energy = Math.min(Math.max(globalRms, 0), 1)
        bass = energy * 1.1
        mid = energy * 0.9
        treble = energy * 0.8
      } else if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(freqData)
        bass = (freqData[1] + freqData[2] + freqData[3]) / (3 * 255)
        mid = (freqData[6] + freqData[7] + freqData[8]) / (3 * 255)
        treble = (freqData[12] + freqData[13] + freqData[14]) / (3 * 255)
        energy = bass * 0.5 + mid * 0.3 + treble * 0.2
      } else if (audioTelemetryRef.current.reactivity > 0) {
        bass = audioTelemetryRef.current.bass
        mid = audioTelemetryRef.current.mid
        treble = audioTelemetryRef.current.treble
        energy = audioTelemetryRef.current.reactivity
      } else {
        const t = elapsedSec
        bass = (Math.sin(t * 1.2) * 0.5 + 0.5) * 0.35 + (Math.sin(t * 0.4) * 0.5 + 0.5) * 0.15
        mid = (Math.sin(t * 2.1 + 1.2) * 0.5 + 0.5) * 0.3
        treble = (Math.sin(t * 3.4 + 2.5) * 0.5 + 0.5) * 0.25
        energy = bass * 0.5 + mid * 0.3 + treble * 0.2
      }

      // Compute surge scale: 1.0 + (rms * 0.5)
      if (config.audio_reactive) {
        setAudioSurgeScale(1.0 + energy * 0.5)
      } else {
        setAudioSurgeScale(1.0)
      }

      // Render WebGL Shader Quad
      if (isShader && gl && program && positionBufferRef.current) {
        gl.useProgram(program)

        const positionLoc = gl.getAttribLocation(program, 'position')
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current)
        gl.enableVertexAttribArray(positionLoc)
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas?.width || 1, canvas?.height || 1)
        gl.uniform1f(gl.getUniformLocation(program, 'u_time'), elapsedSec)
        gl.uniform2f(gl.getUniformLocation(program, 'u_mouse'), mouse.currentX, mouse.currentY)
        gl.uniform1f(gl.getUniformLocation(program, 'u_audio_reactivity'), energy)
        gl.uniform1f(gl.getUniformLocation(program, 'u_audio_bass'), bass)
        gl.uniform1f(gl.getUniformLocation(program, 'u_audio_mid'), mid)
        gl.uniform1f(gl.getUniformLocation(program, 'u_audio_treble'), treble)
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), config.opacity ?? 0.9)
        gl.uniform1f(gl.getUniformLocation(program, 'u_vignette'), config.vignette ?? 0.35)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }

      // Parallax offset update for DOM layers
      const pFactor = config.parallax ?? 10
      setParallaxOffset({
        x: mouse.currentX * pFactor,
        y: mouse.currentY * pFactor
      })

      animationFrameRef.current = requestAnimationFrame(render)
    }

    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [activeWp.kind, activeWp.id, activeWp.source_path, config])

  // Parallax transform style for media
  const mediaTransformStyle: React.CSSProperties = {
    transform: `translate3d(${-parallaxOffset.x}px, ${-parallaxOffset.y}px, 0px) scale(1.05)`,
    transition: 'transform 0.12s ease-out'
  }

  // Combined filter: blur + audio-reactive surge brightness
  const dynamicFilter = [
    config.blur ? `blur(${config.blur}px)` : '',
    config.audio_reactive && audioSurgeScale !== 1.0 ? `brightness(${audioSurgeScale.toFixed(3)})` : ''
  ]
    .filter(Boolean)
    .join(' ')

  const assetUrl = resolveWallpaperAssetUrl(activeWp.source_path)
  const isPureVoid = activeWp.kind === 'shader' && (activeWp.id === 'pure_void' || activeWp.source_path.includes('pure_void'))

  return (
    <div
      data-layer="-1"
      aria-hidden="true"
      className={`fixed inset-0 z-0 pointer-events-none select-none overflow-hidden bg-black ${className}`}
      style={{
        zIndex: 0,
        backgroundColor: isPureVoid ? (themeContext?.theme?.tokens?.void_bg || '#030711') : '#000000'
      }}
    >
      {/* 1. WebGL Shader Canvas (Pure WebGL) */}
      {activeWp.kind === 'shader' && !isPureVoid && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            filter: dynamicFilter || undefined,
            mixBlendMode: (config.blend_mode as any) || 'normal'
          }}
        />
      )}

      {/* 2. Looping Video Wallpaper */}
      {activeWp.kind === 'video' && assetUrl && (
        <video
          ref={videoRef}
          src={assetUrl}
          loop
          muted
          playsInline
          autoPlay
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 pointer-events-none"
          style={{
            ...mediaTransformStyle,
            opacity: config.opacity ?? 0.85,
            filter: dynamicFilter || undefined,
            mixBlendMode: (config.blend_mode as any) || 'normal'
          }}
        />
      )}

      {/* 3. Static/Animated Image Wallpaper (nexus-asset://) */}
      {activeWp.kind === 'image' && assetUrl && (
        <img
          src={assetUrl}
          alt="Nexus Wallpaper"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 pointer-events-none"
          style={{
            ...mediaTransformStyle,
            opacity: config.opacity ?? 0.9,
            filter: dynamicFilter || undefined,
            mixBlendMode: (config.blend_mode as any) || 'normal'
          }}
        />
      )}

      {/* 4. Direct URL Mode */}
      {activeWp.kind === 'url' && activeWp.source_path && (
        <img
          src={activeWp.source_path}
          alt="Nexus Direct URL Wallpaper"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700 pointer-events-none"
          style={{
            ...mediaTransformStyle,
            opacity: config.opacity ?? 0.9,
            filter: dynamicFilter || undefined,
            mixBlendMode: (config.blend_mode as any) || 'normal'
          }}
        />
      )}

      {/* 5. Vignette Radial Overlay */}
      {(config.vignette ?? 0) > 0 && !isPureVoid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, transparent 35%, rgba(0, 0, 0, ${
              (config.vignette ?? 0.35) * 0.95
            }) 100%)`
          }}
        />
      )}
    </div>
  )
}

export default AgentWallpaperLayer
