import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Palette,
  Plus,
  Check,
  Download,
  Upload,
  Image,
  Video,
  Trash2,
  Zap,
  Eye,
  Link,
  RefreshCw,
  ChevronRight,
  Layers,
  Sliders,
  Globe,
  FileInput,
  CircleDot,
  Waves,
  Grid3X3,
  Star,
  Sparkles,
  Monitor,
  Cpu,
  Share2,
  SlidersHorizontal,
  Type,
  Activity,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import { useTheme } from '../context/ThemeProvider'
import type { ThemeTokens, Theme, Wallpaper } from '../context/ThemeProvider'
import NexusCoreOrb, { Morphology, WorkspaceMode, CoreState } from '../components/NexusCoreOrb'
import AgentWallpaperLayer, { WallpaperItem } from '../components/AgentWallpaperLayer'
import { HudBracketCard, KineticText } from '../components/hud'

// ─── IPC Origin & Auth ──────────────────────────────────────────────────────
const IPC = 'http://127.0.0.1:47630'

async function resolveNexusToken(): Promise<string> {
  try {
    const win = window as any
    if (win.__NEXUS_IPC_TOKEN__) return win.__NEXUS_IPC_TOKEN__
    if (win.nexusAuth?.getAuthToken) {
      const t = await win.nexusAuth.getAuthToken()
      if (t) return t
    }
    if (win.electron?.ipcRenderer?.invoke) {
      const t = await win.electron.ipcRenderer.invoke('get-auth-token')
      if (t) return t
    }
  } catch {
    // context isolation fallback
  }

  try {
    return (
      localStorage.getItem('nexus_ipc_token') ||
      localStorage.getItem('nexus_access_token') ||
      ''
    )
  } catch {
    return ''
  }
}

async function ipcCall(path: string, options: RequestInit = {}): Promise<any> {
  const token = await resolveNexusToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string>)
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${IPC}${path}`, { ...options, headers })
  if (!res.ok) throw new Error(`IPC ${path} returned HTTP ${res.status}`)
  return res.json()
}

// ─── 6 Built-in Cyberpunk Theme Presets ─────────────────────────────────────
export interface ThemePresetDefinition {
  id: string
  name: string
  void_bg: string
  surface_tint: string
  accent_primary: string
  accent_secondary: string
  accent_danger: string
  text_primary: string
  text_muted: string
  morphology: Morphology
  typography_pair: string
  glass_opacity: number
  glass_blur_px: number
  border_glow_intensity: number
  corner_brackets: boolean
  scanline_opacity: number
  film_grain_opacity: number
  kinetic_cipher_speed: 'fast' | 'normal' | 'off'
  orbiter_colors: Record<string, string>
}

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'obsidian_cyber',
    name: 'Obsidian Cyber',
    void_bg: '#030711',
    surface_tint: '#061325',
    accent_primary: '#00F5D4',
    accent_secondary: '#38BDF8',
    accent_danger: '#EF4444',
    text_primary: '#F8FAFC',
    text_muted: '#64748B',
    morphology: 'DYSON',
    typography_pair: 'Space Grotesk + JetBrains Mono',
    glass_opacity: 85,
    glass_blur_px: 20,
    border_glow_intensity: 65,
    corner_brackets: true,
    scanline_opacity: 8,
    film_grain_opacity: 4,
    kinetic_cipher_speed: 'normal',
    orbiter_colors: {
      'DEV-01': '#00F5D4',
      'SYS-01': '#38BDF8',
      'SCOUT-01': '#F59E0B',
      'SEC-01': '#10B981',
      'OPS-01': '#8B5CF6'
    }
  },
  {
    id: 'atlas_bio_plasma',
    name: 'Atlas Bio-Plasma',
    void_bg: '#040812',
    surface_tint: '#081326',
    accent_primary: '#22D3EE',
    accent_secondary: '#F472B6',
    accent_danger: '#EF4444',
    text_primary: '#F0FDF4',
    text_muted: '#64748B',
    morphology: 'ATLAS',
    typography_pair: 'Space Grotesk + JetBrains Mono',
    glass_opacity: 82,
    glass_blur_px: 22,
    border_glow_intensity: 75,
    corner_brackets: true,
    scanline_opacity: 6,
    film_grain_opacity: 3,
    kinetic_cipher_speed: 'normal',
    orbiter_colors: {
      'DEV-01': '#22D3EE',
      'SYS-01': '#38BDF8',
      'SCOUT-01': '#F472B6',
      'SEC-01': '#34D399',
      'OPS-01': '#A78BFA'
    }
  },
  {
    id: 'nebula_vortex',
    name: 'Nebula Vortex',
    void_bg: '#070514',
    surface_tint: '#120B28',
    accent_primary: '#A855F7',
    accent_secondary: '#F59E0B',
    accent_danger: '#EF4444',
    text_primary: '#FAF5FF',
    text_muted: '#71717A',
    morphology: 'VORTEX',
    typography_pair: 'Space Grotesk + JetBrains Mono',
    glass_opacity: 85,
    glass_blur_px: 24,
    border_glow_intensity: 70,
    corner_brackets: true,
    scanline_opacity: 7,
    film_grain_opacity: 5,
    kinetic_cipher_speed: 'normal',
    orbiter_colors: {
      'DEV-01': '#A855F7',
      'SYS-01': '#EC4899',
      'SCOUT-01': '#F59E0B',
      'SEC-01': '#06B6D4',
      'OPS-01': '#8B5CF6'
    }
  },
  {
    id: 'tactical_ember',
    name: 'Tactical Ember',
    void_bg: '#050505',
    surface_tint: '#170D08',
    accent_primary: '#FF5500',
    accent_secondary: '#F4F4F5',
    accent_danger: '#DC2626',
    text_primary: '#FAFAFA',
    text_muted: '#71717A',
    morphology: 'HELIX',
    typography_pair: 'Orbitron + Fira Code',
    glass_opacity: 88,
    glass_blur_px: 18,
    border_glow_intensity: 80,
    corner_brackets: true,
    scanline_opacity: 10,
    film_grain_opacity: 6,
    kinetic_cipher_speed: 'fast',
    orbiter_colors: {
      'DEV-01': '#FF5500',
      'SYS-01': '#F97316',
      'SCOUT-01': '#EAB308',
      'SEC-01': '#EF4444',
      'OPS-01': '#71717A'
    }
  },
  {
    id: 'monochrome_optics',
    name: 'Monochrome Optics',
    void_bg: '#020202',
    surface_tint: '#111111',
    accent_primary: '#E5E7EB',
    accent_secondary: '#EF4444',
    accent_danger: '#DC2626',
    text_primary: '#FFFFFF',
    text_muted: '#52525B',
    morphology: 'DYSON',
    typography_pair: 'Rajdhani + IBM Plex Mono',
    glass_opacity: 90,
    glass_blur_px: 16,
    border_glow_intensity: 50,
    corner_brackets: true,
    scanline_opacity: 5,
    film_grain_opacity: 2,
    kinetic_cipher_speed: 'fast',
    orbiter_colors: {
      'DEV-01': '#E5E7EB',
      'SYS-01': '#D1D5DB',
      'SCOUT-01': '#EF4444',
      'SEC-01': '#9CA3AF',
      'OPS-01': '#6B7280'
    }
  },
  {
    id: 'biometric_matrix',
    name: 'Biometric Matrix',
    void_bg: '#020B08',
    surface_tint: '#041C14',
    accent_primary: '#10B981',
    accent_secondary: '#84CC16',
    accent_danger: '#EF4444',
    text_primary: '#ECFDF5',
    text_muted: '#6EE7B7',
    morphology: 'DYSON',
    typography_pair: 'Geist + JetBrains Mono',
    glass_opacity: 85,
    glass_blur_px: 20,
    border_glow_intensity: 70,
    corner_brackets: true,
    scanline_opacity: 12,
    film_grain_opacity: 4,
    kinetic_cipher_speed: 'normal',
    orbiter_colors: {
      'DEV-01': '#10B981',
      'SYS-01': '#84CC16',
      'SCOUT-01': '#06B6D4',
      'SEC-01': '#059669',
      'OPS-01': '#10B981'
    }
  }
]

// ─── 5 Built-in WebGL Shaders ───────────────────────────────────────────────
export interface WebGLShaderDef {
  id: string
  name: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  source_path: string
  description: string
  defaultBlendMode: string
}

export const WEBGL_SHADERS: WebGLShaderDef[] = [
  {
    id: 'nebula_vortex',
    name: 'Nebula Vortex',
    icon: CircleDot,
    source_path: 'shader://nebula_vortex',
    description: 'Deep cosmic spiral with particle accretion sink and chromatic surge',
    defaultBlendMode: 'screen'
  },
  {
    id: 'plasma_waves',
    name: 'Plasma Waves',
    icon: Waves,
    source_path: 'shader://plasma_waves',
    description: 'High-frequency electric quantum flux ribbons with audio modulation',
    defaultBlendMode: 'screen'
  },
  {
    id: 'cyber_grid',
    name: 'Cyber Horizon Grid',
    icon: Grid3X3,
    source_path: 'shader://cyber_grid',
    description: 'Retrofuturistic 3D perspective wireframe horizon with neon pulse',
    defaultBlendMode: 'normal'
  },
  {
    id: 'constellation_starfield',
    name: 'Constellation Starfield',
    icon: Star,
    source_path: 'shader://constellation_starfield',
    description: 'Procedural depth-sorted stars and dynamic galactic filament links',
    defaultBlendMode: 'screen'
  },
  {
    id: 'pure_void',
    name: 'Pure Obsidian Void',
    icon: Sparkles,
    source_path: 'shader://pure_void',
    description: 'Minimalist pitch-black deep focus surface with subtle radial vignette',
    defaultBlendMode: 'normal'
  }
]

export const FONT_PAIR_OPTIONS = [
  'Space Grotesk + JetBrains Mono',
  'Instrument Serif + JetBrains Mono',
  'Inter + Fira Code',
  'Sora + Cascadia Code',
  'Orbitron + Fira Code',
  'Rajdhani + IBM Plex Mono',
  'Geist + JetBrains Mono'
]

export const BLEND_MODES = [
  'screen',
  'normal',
  'overlay',
  'multiply',
  'color-dodge',
  'soft-light',
  'luminosity'
] as const

export const MODE_BINDINGS: WorkspaceMode[] = ['DEV', 'STUDY', 'STUDIO', 'SILENT']

export const ORBITER_KEYS = ['DEV-01', 'SYS-01', 'SCOUT-01', 'SEC-01', 'OPS-01'] as const

// ─── Theme Editor Form State ────────────────────────────────────────────────
interface ThemeEditorState {
  id: string
  name: string
  is_builtin: boolean
  void_bg: string
  surface_tint: string
  accent_primary: string
  accent_secondary: string
  accent_danger: string
  text_primary: string
  text_muted: string
  glass_opacity: number
  glass_blur_px: number
  border_glow_intensity: number
  corner_brackets: boolean
  scanline_opacity: number
  film_grain_opacity: number
  kinetic_cipher_speed: 'fast' | 'normal' | 'off'
  typography_pair: string
  core_morphology: Morphology
  orbiter_colors: Record<string, string>
}

function parseTokensToEditor(theme: Theme): ThemeEditorState {
  const tok = theme.tokens || {}
  const presetMatch = THEME_PRESETS.find((p) => p.id === theme.id)

  const rawMorphology = (tok.core_morphology || presetMatch?.morphology || 'DYSON')
    .toString()
    .toUpperCase()
  const validMorphology: Morphology =
    rawMorphology === 'ATLAS' || rawMorphology === 'VORTEX' || rawMorphology === 'HELIX'
      ? rawMorphology
      : 'DYSON'

  return {
    id: theme.id,
    name: theme.name || 'Custom Theme',
    is_builtin: Boolean(theme.is_builtin || presetMatch),
    void_bg: tok.void_bg || tok.bg_void || presetMatch?.void_bg || '#030711',
    surface_tint: tok.surface_tint || presetMatch?.surface_tint || '#061325',
    accent_primary: tok.accent_primary || presetMatch?.accent_primary || '#00F5D4',
    accent_secondary: tok.accent_secondary || presetMatch?.accent_secondary || '#38BDF8',
    accent_danger: tok.accent_danger || presetMatch?.accent_danger || '#EF4444',
    text_primary: tok.text_primary || presetMatch?.text_primary || '#F8FAFC',
    text_muted: tok.text_muted || presetMatch?.text_muted || '#64748B',
    glass_opacity: Math.round((tok.glass_opacity ?? (presetMatch ? presetMatch.glass_opacity / 100 : 0.85)) * 100),
    glass_blur_px: tok.glass_blur_px ?? presetMatch?.glass_blur_px ?? 20,
    border_glow_intensity: Math.round(
      (tok.border_glow_intensity ?? (presetMatch ? presetMatch.border_glow_intensity / 100 : 0.65)) * 100
    ),
    corner_brackets: tok.corner_brackets !== false,
    scanline_opacity: Math.round(
      (tok.scanline_opacity ?? (presetMatch ? presetMatch.scanline_opacity / 100 : 0.08)) * 100
    ),
    film_grain_opacity: Math.round(
      (tok.film_grain_opacity ?? (presetMatch ? presetMatch.film_grain_opacity / 100 : 0.04)) * 100
    ),
    kinetic_cipher_speed: (tok.kinetic_cipher_speed as any) || presetMatch?.kinetic_cipher_speed || 'normal',
    typography_pair: tok.typography_pair || presetMatch?.typography_pair || FONT_PAIR_OPTIONS[0],
    core_morphology: validMorphology,
    orbiter_colors: {
      'DEV-01': '#00F5D4',
      'SYS-01': '#38BDF8',
      'SCOUT-01': '#F59E0B',
      'SEC-01': '#10B981',
      'OPS-01': '#8B5CF6',
      ...(presetMatch?.orbiter_colors || {}),
      ...(tok.orbiter_colors || {})
    }
  }
}

// ─── Custom UI Color Field ──────────────────────────────────────────────────
function ColorControl({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-slate-900/60 border border-white/5 hover:border-cyan-500/30 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <label
          className="relative w-6 h-6 rounded cursor-pointer border border-white/20 shadow-inner overflow-hidden flex-shrink-0"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
        <span className="text-[11px] font-mono text-slate-300 truncate">{label}</span>
      </div>
      <span className="text-[10px] font-mono text-cyan-400/80 uppercase">{value}</span>
    </div>
  )
}

// ─── Custom UI Numeric Slider ───────────────────────────────────────────────
function SliderControl({
  label,
  value,
  min,
  max,
  unit,
  step = 1,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  step?: number
  onChange: (val: number) => void
}) {
  return (
    <div className="space-y-1 p-2 rounded bg-slate-900/40 border border-white/5">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-cyan-400 font-bold">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
      />
    </div>
  )
}

// ─── MAIN VIEW 08: THEME FORGE (Split Live-Preview Studio) ──────────────────
export default function ThemeForgeView() {
  const {
    theme,
    themes,
    activeThemeId,
    setActiveTheme,
    saveTheme,
    deleteTheme,
    refreshThemes,
    wallpaper,
    wallpapers,
    activeWallpaperId,
    setActiveWallpaper,
    saveWallpaper,
    deleteWallpaper,
    refreshWallpapers
  } = useTheme()

  // ─── Live Studio State ───────────────────────────────────────────────────
  const [editor, setEditor] = useState<ThemeEditorState>(() => parseTokensToEditor(theme))
  const [previewMorphology, setPreviewMorphology] = useState<Morphology>(editor.core_morphology)
  const [previewMode, setPreviewMode] = useState<WorkspaceMode>('DEV')
  const [previewCoreState, setPreviewCoreState] = useState<CoreState>('IDLE')
  const [syncingNotch, setSyncingNotch] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [statusNotification, setStatusNotification] = useState<{
    message: string
    type: 'success' | 'info' | 'error'
  } | null>(null)

  // ─── Theme Creation Dialog State ─────────────────────────────────────────
  const [showNewModal, setShowNewModal] = useState(false)
  const [newThemeName, setNewThemeName] = useState('')

  // ─── Custom Agent Wallpaper Tuning State ─────────────────────────────────
  const [wpTuning, setWpTuning] = useState({
    opacity: Math.round((wallpaper.config?.opacity ?? 0.9) * 100),
    blur: wallpaper.config?.blur ?? 0,
    vignette: Math.round((wallpaper.config?.vignette ?? 0.4) * 100),
    parallax: wallpaper.config?.parallax ?? 12,
    audio_reactive: wallpaper.config?.audio_reactive ?? true,
    blend_mode: wallpaper.config?.blend_mode || 'screen',
    mode_binding: (wallpaper.mode_binding as string) || 'GLOBAL'
  })
  const [activeShaderKey, setActiveShaderKey] = useState<string>('nebula_vortex')

  // File input refs
  const importThemeFileRef = useRef<HTMLInputElement>(null)
  const uploadMediaFileRef = useRef<HTMLInputElement>(null)

  // Auto-sync form when activeTheme changes externally
  useEffect(() => {
    const updated = parseTokensToEditor(theme)
    setEditor(updated)
    setPreviewMorphology(updated.core_morphology)
  }, [theme])

  // Auto-sync wallpaper tuning when active wallpaper changes
  useEffect(() => {
    setWpTuning({
      opacity: Math.round((wallpaper.config?.opacity ?? 0.9) * 100),
      blur: wallpaper.config?.blur ?? 0,
      vignette: Math.round((wallpaper.config?.vignette ?? 0.4) * 100),
      parallax: wallpaper.config?.parallax ?? 12,
      audio_reactive: wallpaper.config?.audio_reactive ?? true,
      blend_mode: wallpaper.config?.blend_mode || 'screen',
      mode_binding: (wallpaper.mode_binding as string) || 'GLOBAL'
    })

    const source = wallpaper.source_path || ''
    const match = WEBGL_SHADERS.find(
      (s) => s.id === wallpaper.id || source.includes(s.id) || s.source_path === source
    )
    if (match) {
      setActiveShaderKey(match.id)
    }
  }, [wallpaper])

  // Show auto-dismiss status badge
  const notify = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setStatusNotification({ message, type })
    setTimeout(() => {
      setStatusNotification(null)
    }, 3800)
  }, [])

  // ─── Theme Actions ───────────────────────────────────────────────────────
  const handleSelectPreset = useCallback(
    async (presetId: string) => {
      const ok = await setActiveTheme(presetId)
      if (ok) {
        notify(`Preset "${presetId}" engaged`, 'success')
      } else {
        notify(`Failed to engage preset "${presetId}"`, 'error')
      }
    },
    [setActiveTheme, notify]
  )

  const handleMorphologyChange = useCallback(
    (morph: Morphology) => {
      setPreviewMorphology(morph)
      setEditor((prev) => ({ ...prev, core_morphology: morph }))
      // Dynamically push to theme tokens
      const newTokens: ThemeTokens = {
        ...theme.tokens,
        core_morphology: morph.toLowerCase()
      }
      void saveTheme({ id: editor.id, name: editor.name, tokens: newTokens })
      notify(`Morphology set to ${morph}`, 'info')
    },
    [theme.tokens, editor.id, editor.name, saveTheme, notify]
  )

  const handleSaveTheme = useCallback(async () => {
    setIsSaving(true)
    try {
      const tokens: ThemeTokens = {
        void_bg: editor.void_bg,
        bg_void: editor.void_bg,
        surface_tint: editor.surface_tint,
        accent_primary: editor.accent_primary,
        accent_secondary: editor.accent_secondary,
        accent_danger: editor.accent_danger,
        text_primary: editor.text_primary,
        text_muted: editor.text_muted,
        glass_opacity: editor.glass_opacity / 100,
        glass_blur_px: editor.glass_blur_px,
        border_glow_intensity: editor.border_glow_intensity / 100,
        corner_brackets: editor.corner_brackets,
        scanline_opacity: editor.scanline_opacity / 100,
        film_grain_opacity: editor.film_grain_opacity / 100,
        kinetic_cipher_speed: editor.kinetic_cipher_speed,
        typography_pair: editor.typography_pair,
        core_morphology: editor.core_morphology.toLowerCase(),
        orbiter_colors: editor.orbiter_colors
      }

      const ok = await saveTheme({
        id: editor.id,
        name: editor.name,
        tokens
      })

      if (ok) {
        notify(`Theme "${editor.name}" persisted to SQLite WAL`, 'success')
        await refreshThemes()
      } else {
        notify(`Failed to save theme "${editor.name}"`, 'error')
      }
    } catch (err: any) {
      notify(`Save error: ${err.message}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }, [editor, saveTheme, refreshThemes, notify])

  const handleCreateNewTheme = useCallback(async () => {
    const trimmed = newThemeName.trim()
    if (!trimmed) {
      notify('Please enter a valid theme name', 'error')
      return
    }

    const newId = `custom_${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`
    const tokens: ThemeTokens = {
      void_bg: editor.void_bg,
      bg_void: editor.void_bg,
      surface_tint: editor.surface_tint,
      accent_primary: editor.accent_primary,
      accent_secondary: editor.accent_secondary,
      accent_danger: editor.accent_danger,
      text_primary: editor.text_primary,
      text_muted: editor.text_muted,
      glass_opacity: editor.glass_opacity / 100,
      glass_blur_px: editor.glass_blur_px,
      border_glow_intensity: editor.border_glow_intensity / 100,
      corner_brackets: editor.corner_brackets,
      scanline_opacity: editor.scanline_opacity / 100,
      film_grain_opacity: editor.film_grain_opacity / 100,
      kinetic_cipher_speed: editor.kinetic_cipher_speed,
      typography_pair: editor.typography_pair,
      core_morphology: editor.core_morphology.toLowerCase(),
      orbiter_colors: editor.orbiter_colors
    }

    const ok = await saveTheme({
      id: newId,
      name: trimmed,
      tokens
    })

    if (ok) {
      setShowNewModal(false)
      setNewThemeName('')
      await refreshThemes()
      await setActiveTheme(newId)
      notify(`Custom Theme "${trimmed}" forged and activated`, 'success')
    } else {
      notify('Failed to forge new theme', 'error')
    }
  }, [newThemeName, editor, saveTheme, refreshThemes, setActiveTheme, notify])

  const handleDeleteCurrentTheme = useCallback(async () => {
    if (editor.is_builtin) {
      notify('Built-in presets cannot be deleted', 'error')
      return
    }

    const confirmed = window.confirm(`Permanently delete custom theme "${editor.name}"?`)
    if (!confirmed) return

    const ok = await deleteTheme(editor.id)
    if (ok) {
      notify(`Theme "${editor.name}" removed`, 'info')
      await refreshThemes()
    } else {
      notify('Failed to delete theme', 'error')
    }
  }, [editor.is_builtin, editor.name, editor.id, deleteTheme, refreshThemes, notify])

  const handleExportThemeFile = useCallback(async () => {
    const payload = {
      nxtheme_version: '1.0',
      format: 'nexus_theme_bundle',
      exported_at: new Date().toISOString(),
      theme: {
        id: editor.id,
        name: editor.name,
        is_builtin: false,
        tokens: {
          void_bg: editor.void_bg,
          bg_void: editor.void_bg,
          surface_tint: editor.surface_tint,
          accent_primary: editor.accent_primary,
          accent_secondary: editor.accent_secondary,
          accent_danger: editor.accent_danger,
          text_primary: editor.text_primary,
          text_muted: editor.text_muted,
          glass_opacity: editor.glass_opacity / 100,
          glass_blur_px: editor.glass_blur_px,
          border_glow_intensity: editor.border_glow_intensity / 100,
          corner_brackets: editor.corner_brackets,
          scanline_opacity: editor.scanline_opacity / 100,
          film_grain_opacity: editor.film_grain_opacity / 100,
          kinetic_cipher_speed: editor.kinetic_cipher_speed,
          typography_pair: editor.typography_pair,
          core_morphology: editor.core_morphology.toLowerCase(),
          orbiter_colors: editor.orbiter_colors
        }
      }
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute('download', `${editor.id}.nxtheme`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
    notify(`Theme exported as ${editor.id}.nxtheme`, 'success')
  }, [editor, notify])

  const handleImportThemeFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const rawTheme = parsed.theme || parsed

        if (!rawTheme.name || !rawTheme.tokens) {
          notify('Invalid .nxtheme file: missing name or tokens dictionary', 'error')
          return
        }

        const newId = rawTheme.id || `imported_${Date.now().toString(36)}`
        const ok = await saveTheme({
          id: newId,
          name: rawTheme.name,
          tokens: rawTheme.tokens
        })

        if (ok) {
          await refreshThemes()
          await setActiveTheme(newId)
          notify(`Theme "${rawTheme.name}" imported and engaged`, 'success')
        } else {
          notify('Failed to import theme to database', 'error')
        }
      } catch (err: any) {
        notify(`Import parsing error: ${err.message}`, 'error')
      } finally {
        if (event.target) event.target.value = ''
      }
    },
    [saveTheme, refreshThemes, setActiveTheme, notify]
  )

  const handleSyncNotchHud = useCallback(async () => {
    setSyncingNotch(true)
    try {
      // 1. Post to IPC themes endpoint
      try {
        await ipcCall('/api/themes', {
          method: 'POST',
          body: JSON.stringify({
            id: editor.id,
            name: editor.name,
            tokens: {
              void_bg: editor.void_bg,
              accent_primary: editor.accent_primary,
              accent_secondary: editor.accent_secondary,
              surface_tint: editor.surface_tint,
              text_primary: editor.text_primary,
              border_glow_intensity: editor.border_glow_intensity / 100,
              glass_blur_px: editor.glass_blur_px,
              core_morphology: editor.core_morphology.toLowerCase()
            },
            is_active: 1
          })
        })
      } catch {
        // Continue to native IPC signals
      }

      // 2. Invoke native electron IPC if running in electron desktop shell
      const win = window as any
      if (win.electron?.ipcRenderer?.invoke) {
        try {
          await win.electron.ipcRenderer.invoke('notch-sync-theme', {
            themeId: editor.id,
            accent: editor.accent_primary,
            secondary: editor.accent_secondary,
            void: editor.void_bg,
            glow: editor.border_glow_intensity / 100
          })
        } catch {
          // Fall through
        }
      }

      // 3. Dispatch global DOM events for immediate in-page Notch listeners
      window.dispatchEvent(
        new CustomEvent('nexus-sync-notch', {
          detail: {
            themeId: editor.id,
            accentColor: editor.accent_primary,
            secondaryColor: editor.accent_secondary,
            voidBg: editor.void_bg,
            glowIntensity: editor.border_glow_intensity / 100
          }
        })
      )

      window.dispatchEvent(
        new CustomEvent('nexus-theme-changed', {
          detail: {
            id: editor.id,
            name: editor.name,
            tokens: {
              accent_primary: editor.accent_primary,
              accent_secondary: editor.accent_secondary,
              void_bg: editor.void_bg
            }
          }
        })
      )

      notify('Dynamic Notch HUD synchronized with active theme', 'success')
    } catch (err: any) {
      notify(`Notch sync error: ${err.message}`, 'error')
    } finally {
      setSyncingNotch(false)
    }
  }, [editor, notify])

  // ─── Wallpaper Engine Actions ────────────────────────────────────────────
  const handleSelectShader = useCallback(
    async (shaderDef: WebGLShaderDef) => {
      setActiveShaderKey(shaderDef.id)
      const fullId = `${shaderDef.id}_shader`
      const config = {
        opacity: wpTuning.opacity / 100,
        blur: wpTuning.blur,
        vignette: wpTuning.vignette / 100,
        parallax: wpTuning.parallax,
        audio_reactive: wpTuning.audio_reactive,
        blend_mode: wpTuning.blend_mode || shaderDef.defaultBlendMode
      }

      await saveWallpaper({
        id: fullId,
        name: `${shaderDef.name} WebGL`,
        kind: 'shader',
        source_path: shaderDef.source_path,
        mode_binding: wpTuning.mode_binding,
        config
      })

      const ok = await setActiveWallpaper(fullId, wpTuning.mode_binding)
      if (ok) {
        notify(`Shader "${shaderDef.name}" activated [${wpTuning.mode_binding}]`, 'success')
      } else {
        notify(`Shader activation failed`, 'error')
      }
    },
    [wpTuning, saveWallpaper, setActiveWallpaper, notify]
  )

  const handleApplyWallpaperTuning = useCallback(async () => {
    const config = {
      opacity: wpTuning.opacity / 100,
      blur: wpTuning.blur,
      vignette: wpTuning.vignette / 100,
      parallax: wpTuning.parallax,
      audio_reactive: wpTuning.audio_reactive,
      blend_mode: wpTuning.blend_mode
    }

    const currentWp = wallpapers.find((w) => w.id === activeWallpaperId) || wallpaper
    const ok = await saveWallpaper({
      id: currentWp.id,
      name: currentWp.name,
      kind: currentWp.kind,
      source_path: currentWp.source_path,
      mode_binding: wpTuning.mode_binding,
      config
    })

    if (ok) {
      await setActiveWallpaper(currentWp.id, wpTuning.mode_binding)
      window.dispatchEvent(
        new CustomEvent('wallpaper-applied', {
          detail: {
            id: currentWp.id,
            config,
            mode: wpTuning.mode_binding
          }
        })
      )
      notify(`Wallpaper parameters applied to [${wpTuning.mode_binding}]`, 'success')
    } else {
      notify('Failed to apply wallpaper parameters', 'error')
    }
  }, [wpTuning, wallpapers, activeWallpaperId, wallpaper, saveWallpaper, setActiveWallpaper, notify])

  const handleUploadMedia = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      try {
        const isVideo = file.type.startsWith('video/')
        const isImage = file.type.startsWith('image/')

        if (!isImage && !isVideo) {
          notify('Supported formats: PNG, JPG, WEBP, GIF, MP4, WEBM', 'error')
          return
        }

        const objectUrl = URL.createObjectURL(file)
        const wallId = `uploaded_${Date.now().toString(36)}`
        const cleanName = file.name.replace(/\.[^/.]+$/, '')

        const config = {
          opacity: wpTuning.opacity / 100,
          blur: wpTuning.blur,
          vignette: wpTuning.vignette / 100,
          parallax: wpTuning.parallax,
          audio_reactive: wpTuning.audio_reactive,
          blend_mode: wpTuning.blend_mode
        }

        const ok = await saveWallpaper({
          id: wallId,
          name: cleanName,
          kind: isVideo ? 'video' : 'image',
          source_path: objectUrl,
          mode_binding: wpTuning.mode_binding,
          config
        })

        if (ok) {
          await refreshWallpapers()
          await setActiveWallpaper(wallId, wpTuning.mode_binding)
          notify(`Uploaded ${isVideo ? 'Video' : 'Image'} Wallpaper "${cleanName}"`, 'success')
        } else {
          notify('Failed to save uploaded wallpaper', 'error')
        }
      } catch (err: any) {
        notify(`Upload error: ${err.message}`, 'error')
      } finally {
        if (event.target) event.target.value = ''
      }
    },
    [wpTuning, saveWallpaper, refreshWallpapers, setActiveWallpaper, notify]
  )

  // Construct the active preview wallpaper object
  const previewWallpaperItem = useMemo<WallpaperItem>(() => {
    return {
      id: activeWallpaperId,
      name: wallpaper.name || 'Active Surface',
      kind: wallpaper.kind || 'shader',
      source_path: wallpaper.source_path || 'shader://nebula_vortex',
      mode_binding: wpTuning.mode_binding,
      config: {
        opacity: wpTuning.opacity / 100,
        blur: wpTuning.blur,
        vignette: wpTuning.vignette / 100,
        parallax: wpTuning.parallax,
        audio_reactive: wpTuning.audio_reactive,
        blend_mode: wpTuning.blend_mode
      }
    }
  }, [activeWallpaperId, wallpaper, wpTuning])

  return (
    <div className="flex flex-col lg:flex-row h-full w-full overflow-hidden bg-slate-950/80 select-none">
      {/* Hidden file pickers */}
      <input
        ref={importThemeFileRef}
        type="file"
        accept=".nxtheme,.json"
        className="hidden"
        onChange={handleImportThemeFile}
      />
      <input
        ref={uploadMediaFileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleUploadMedia}
      />

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* LEFT 40%: LIVE 3D CORE & WALLPAPER PREVIEW STUDIO                       */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[40%] h-[380px] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 relative overflow-hidden bg-black/60">
        {/* Live Wallpaper Background Layer */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          <AgentWallpaperLayer
            wallpaper={previewWallpaperItem}
            mode={previewMode}
            className="w-full h-full"
          />
          {/* Subtle live optical vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center, transparent 30%, ${editor.void_bg} 95%)`,
              opacity: wpTuning.vignette / 100
            }}
          />
        </div>

        {/* Studio Telemetry Top Overlay */}
        <div className="relative z-20 flex items-center justify-between p-3 border-b border-white/10 bg-slate-950/70 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Monitor size={14} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <KineticText text="LIVE PREVIEW STUDIO" className="text-xs font-mono font-bold text-white tracking-widest uppercase" />
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
                  {previewMorphology}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                {editor.name} • {wallpaper.name}
              </p>
            </div>
          </div>

          {/* Mode Switcher Pills (DEV, STUDY, STUDIO, SILENT) */}
          <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/10">
            {MODE_BINDINGS.map((mode) => {
              const isSelected = previewMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                    isSelected
                      ? mode === 'DEV'
                        ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 shadow-[0_0_8px_rgba(0,245,212,0.3)]'
                        : mode === 'STUDY'
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                        : mode === 'STUDIO'
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                        : 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              )
            })}
          </div>
        </div>

        {/* 3D Core Viewport Area */}
        <div className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center">
          <NexusCoreOrb
            morphology={previewMorphology}
            onMorphologyChange={handleMorphologyChange}
            workspaceMode={previewMode}
            coreState={previewCoreState}
            isDocked={false}
            uiPreferences={{
              reactor_color: editor.accent_primary,
              intensity: editor.border_glow_intensity / 100
            }}
          />

          {/* Real-Time Live Floating HUD Badges */}
          <div className="absolute top-3 left-3 pointer-events-none flex flex-col gap-1 z-20">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/60 border border-white/10 backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-mono text-emerald-300 tracking-wider">60.0 FPS • WAL SYNC</span>
            </div>
            <div className="px-2 py-0.5 rounded bg-black/50 border border-white/5 text-[9px] font-mono text-slate-400">
              Font: {editor.typography_pair.split('+')[0].trim()}
            </div>
          </div>

          <div className="absolute top-3 right-3 pointer-events-none flex flex-col gap-1 items-end z-20">
            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-950/70 border border-purple-500/40 text-purple-300 uppercase">
              Blend: {wpTuning.blend_mode}
            </span>
            <span className="text-[9px] font-mono text-slate-500">GL Alpha Layer</span>
          </div>

          {/* Quick Core-State Switcher Pills */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-white/10 backdrop-blur-md">
            {(['IDLE', 'THINKING', 'EXECUTING', 'SPEAKING'] as CoreState[]).map((st) => (
              <button
                key={st}
                onClick={() => setPreviewCoreState(st)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-mono transition-colors ${
                  previewCoreState === st
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Morphology Switcher Toolbar (DYSON, ATLAS, VORTEX, HELIX) */}
        <div className="relative z-20 p-2.5 border-t border-white/10 bg-slate-950/90 backdrop-blur-md flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-slate-400 tracking-widest uppercase flex items-center gap-1">
              <Cpu size={11} className="text-cyan-400" />
              Core Morphology Matrix
            </span>
            <span className="text-cyan-400 font-bold">{previewMorphology}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(['DYSON', 'ATLAS', 'VORTEX', 'HELIX'] as Morphology[]).map((morph) => {
              const isSelected = previewMorphology === morph
              return (
                <button
                  key={morph}
                  onClick={() => handleMorphologyChange(morph)}
                  className={`py-1.5 px-1 rounded flex flex-col items-center justify-center gap-0.5 text-[9px] font-mono font-bold transition-all ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/60 shadow-[0_0_10px_rgba(0,245,212,0.3)]'
                      : 'bg-slate-900/60 text-slate-400 border border-white/10 hover:border-white/20 hover:text-slate-200'
                  }`}
                >
                  <span>{morph}</span>
                  <span className="text-[7px] text-slate-500 font-normal">
                    {morph === 'DYSON'
                      ? 'Fibonacci'
                      : morph === 'ATLAS'
                      ? '5-Cell Web'
                      : morph === 'VORTEX'
                      ? 'Plasma Torus'
                      : 'Coil Spiral'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* RIGHT 60%: THEME FORGE (TOP) & WALLPAPER ENGINE (BOTTOM)                */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[60%] h-full flex flex-col overflow-y-auto divide-y divide-white/10 p-4 gap-6 scrollbar-thin scrollbar-thumb-slate-700">
        {/* Global Notification Banner */}
        {statusNotification && (
          <div
            className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-mono transition-all animate-fadeIn ${
              statusNotification.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : statusNotification.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusNotification.type === 'success' ? (
                <CheckCircle2 size={14} className="text-emerald-400" />
              ) : statusNotification.type === 'error' ? (
                <AlertTriangle size={14} className="text-rose-400" />
              ) : (
                <Activity size={14} className="text-cyan-400" />
              )}
              <span>{statusNotification.message}</span>
            </div>
            <button
              onClick={() => setStatusNotification(null)}
              className="text-slate-400 hover:text-white text-[10px]"
            >
              ✕
            </button>
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────────── */}
        {/* RIGHT 60% TOP: CUSTOM THEME FORGE                                      */}
        {/* ────────────────────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <HudBracketCard
            variant="cyan"
            title={
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-cyan-400" />
                <KineticText text="CUSTOM THEME FORGE" className="text-white font-bold tracking-wide" />
              </div>
            }
            subtitle="v5.0 CHROMATIC MATRIX"
            headerAction={
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* + New Theme */}
                <button
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono hover:bg-cyan-500/30 transition-colors"
                >
                  <Plus size={11} />
                  New
                </button>

                {/* Save Theme */}
                <button
                  onClick={handleSaveTheme}
                  disabled={isSaving}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 border border-cyan-500/50 text-cyan-400 text-[10px] font-mono hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                  Save
                </button>

                {/* Delete Theme */}
                <button
                  onClick={handleDeleteCurrentTheme}
                  disabled={editor.is_builtin}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-rose-500/30 text-rose-400 text-[10px] font-mono hover:bg-rose-950/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={editor.is_builtin ? 'Built-in presets cannot be deleted' : 'Delete this custom theme'}
                >
                  <Trash2 size={11} />
                  Delete
                </button>

                {/* Import / Export .nxtheme */}
                <button
                  onClick={() => importThemeFileRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-white/15 text-slate-300 text-[10px] font-mono hover:border-white/30 transition-colors"
                  title="Import .nxtheme JSON"
                >
                  <Upload size={11} />
                  Import
                </button>

                <button
                  onClick={handleExportThemeFile}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 border border-white/15 text-slate-300 text-[10px] font-mono hover:border-white/30 transition-colors"
                  title="Export active theme as .nxtheme"
                >
                  <Download size={11} />
                  Export
                </button>

                {/* Sync Notch HUD */}
                <button
                  onClick={handleSyncNotchHud}
                  disabled={syncingNotch}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                  title="Synchronize active theme palette and QSS border glow with PySide6 Notch HUD"
                >
                  {syncingNotch ? (
                    <RefreshCw size={11} className="animate-spin" />
                  ) : (
                    <Share2 size={11} />
                  )}
                  Sync Notch HUD
                </button>
              </div>
            }
          >
            {/* Modal for New Theme Creation */}
            {showNewModal && (
              <div className="mb-4 p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/40 flex flex-col gap-2">
                <span className="text-xs font-mono text-cyan-300 font-bold">FORGE NEW THEME</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    placeholder="Theme callsign (e.g. Cyber Glitch)..."
                    className="flex-1 px-3 py-1.5 rounded bg-slate-900 border border-white/10 text-xs font-mono text-white placeholder-slate-600 outline-none focus:border-cyan-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateNewTheme()
                    }}
                  />
                  <button
                    onClick={handleCreateNewTheme}
                    className="px-3 py-1.5 rounded bg-cyan-500/30 border border-cyan-500/60 text-cyan-300 text-xs font-mono hover:bg-cyan-500/40"
                  >
                    Forge
                  </button>
                  <button
                    onClick={() => {
                      setShowNewModal(false)
                      setNewThemeName('')
                    }}
                    className="px-3 py-1.5 rounded bg-slate-800 text-slate-400 text-xs font-mono hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* 6 Cyberpunk Presets Strip */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={12} className="text-cyan-400" />
                  Cyberpunk Presets (6 Core Palettes)
                </span>
                <span className="text-slate-500">1-Click Engage</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                {THEME_PRESETS.map((preset) => {
                  const isActive = activeThemeId === preset.id
                  return (
                    <div
                      key={preset.id}
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`group p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isActive
                          ? 'border-cyan-400 bg-cyan-950/30 shadow-[0_0_12px_rgba(0,245,212,0.25)]'
                          : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-slate-200 truncate">
                          {preset.name}
                        </span>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                        )}
                      </div>

                      {/* 3-Color Swatch Preview */}
                      <div className="flex items-center gap-1 h-3.5 rounded overflow-hidden border border-white/10">
                        <div className="flex-1 h-full" style={{ backgroundColor: preset.void_bg }} title="Void" />
                        <div className="flex-1 h-full" style={{ backgroundColor: preset.accent_primary }} title="Primary" />
                        <div className="flex-1 h-full" style={{ backgroundColor: preset.accent_secondary }} title="Secondary" />
                      </div>

                      <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
                        <span>{preset.morphology}</span>
                        <span className={isActive ? 'text-cyan-400 font-bold' : ''}>
                          {isActive ? 'ACTIVE' : 'Engage'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Custom Theme Switcher (if user created any) */}
            {themes.some((t) => !THEME_PRESETS.some((p) => p.id === t.id)) && (
              <div className="space-y-2 mb-4">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  User Forged Themes
                </span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {themes
                    .filter((t) => !THEME_PRESETS.some((p) => p.id === t.id))
                    .map((customT) => {
                      const isActive = activeThemeId === customT.id
                      return (
                        <button
                          key={customT.id}
                          onClick={() => setActiveTheme(customT.id)}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all ${
                            isActive
                              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-300'
                              : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span>{customT.name}</span>
                          {isActive && <Check size={11} className="text-cyan-400" />}
                        </button>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Color Pickers Matrix */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Palette size={11} className="text-cyan-400" />
                Color Tokens & Swatches
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                <ColorControl
                  label="Void Background"
                  value={editor.void_bg}
                  onChange={(col) => setEditor((p) => ({ ...p, void_bg: col }))}
                />
                <ColorControl
                  label="Surface Tint"
                  value={editor.surface_tint}
                  onChange={(col) => setEditor((p) => ({ ...p, surface_tint: col }))}
                />
                <ColorControl
                  label="Primary Accent"
                  value={editor.accent_primary}
                  onChange={(col) => setEditor((p) => ({ ...p, accent_primary: col }))}
                />
                <ColorControl
                  label="Secondary Accent"
                  value={editor.accent_secondary}
                  onChange={(col) => setEditor((p) => ({ ...p, accent_secondary: col }))}
                />
                <ColorControl
                  label="Alert / Danger"
                  value={editor.accent_danger}
                  onChange={(col) => setEditor((p) => ({ ...p, accent_danger: col }))}
                />
                <ColorControl
                  label="Text Primary"
                  value={editor.text_primary}
                  onChange={(col) => setEditor((p) => ({ ...p, text_primary: col }))}
                />
                <ColorControl
                  label="Text Muted"
                  value={editor.text_muted}
                  onChange={(col) => setEditor((p) => ({ ...p, text_muted: col }))}
                />
                <ColorControl
                  label="DEV-01 Orbiter"
                  value={editor.orbiter_colors['DEV-01'] || '#00F5D4'}
                  onChange={(col) =>
                    setEditor((p) => ({
                      ...p,
                      orbiter_colors: { ...p.orbiter_colors, 'DEV-01': col }
                    }))
                  }
                />
              </div>
            </div>

            {/* Sliders & Visual Optics Controls */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <SlidersHorizontal size={11} className="text-cyan-400" />
                Optics, Glass & Scanlines
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                <SliderControl
                  label="Glass Opacity"
                  value={editor.glass_opacity}
                  min={10}
                  max={100}
                  unit="%"
                  onChange={(v) => setEditor((p) => ({ ...p, glass_opacity: v }))}
                />
                <SliderControl
                  label="Glass Blur"
                  value={editor.glass_blur_px}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(v) => setEditor((p) => ({ ...p, glass_blur_px: v }))}
                />
                <SliderControl
                  label="Border Glow Intensity"
                  value={editor.border_glow_intensity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setEditor((p) => ({ ...p, border_glow_intensity: v }))}
                />
                <SliderControl
                  label="Scanline Overlay"
                  value={editor.scanline_opacity}
                  min={0}
                  max={25}
                  unit="%"
                  onChange={(v) => setEditor((p) => ({ ...p, scanline_opacity: v }))}
                />
                <SliderControl
                  label="Film Grain"
                  value={editor.film_grain_opacity}
                  min={0}
                  max={10}
                  unit="%"
                  onChange={(v) => setEditor((p) => ({ ...p, film_grain_opacity: v }))}
                />

                {/* Corner Brackets Toggle */}
                <div className="p-2 rounded bg-slate-900/40 border border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Corner Brackets [ ]
                  </span>
                  <button
                    onClick={() => setEditor((p) => ({ ...p, corner_brackets: !p.corner_brackets }))}
                    className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                      editor.corner_brackets
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                        : 'bg-slate-800 text-slate-500 border border-white/5'
                    }`}
                  >
                    {editor.corner_brackets ? 'ENGAGED' : 'OFF'}
                  </button>
                </div>
              </div>
            </div>

            {/* Typography / Font Pair Selector */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Type size={11} className="text-cyan-400" />
                Font Pair & Typography
              </span>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                <select
                  value={editor.typography_pair}
                  onChange={(e) => setEditor((p) => ({ ...p, typography_pair: e.target.value }))}
                  className="px-3 py-2 rounded bg-slate-900 border border-white/10 text-xs font-mono text-white outline-none focus:border-cyan-400"
                >
                  {FONT_PAIR_OPTIONS.map((pair) => (
                    <option key={pair} value={pair}>
                      {pair}
                    </option>
                  ))}
                </select>

                {/* Live Specimen Preview */}
                <div className="flex-1 p-2 rounded bg-slate-900/60 border border-white/5 flex flex-col justify-center">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-0.5">
                    Live Specimen
                  </span>
                  <p className="text-xs text-slate-200 font-mono tracking-wide truncate">
                    NEXUS OS // ZERO-SUBSCRIPTION SOVEREIGN EDGE-TO-DESKTOP
                  </p>
                </div>
              </div>
            </div>
          </HudBracketCard>
        </section>

        {/* ────────────────────────────────────────────────────────────────────── */}
        {/* RIGHT 60% BOTTOM: CUSTOM AGENT WALLPAPER ENGINE                        */}
        {/* ────────────────────────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 pt-4">
          <HudBracketCard
            variant="purple"
            title={
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-purple-400" />
                <KineticText text="CUSTOM AGENT WALLPAPER ENGINE" className="text-white font-bold tracking-wide" />
              </div>
            }
            subtitle="NEURAL SURFACE LAYER"
            headerAction={
              <div className="flex items-center gap-2">
                {/* Upload Image / Video */}
                <button
                  onClick={() => uploadMediaFileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-mono hover:bg-purple-500/30 transition-colors"
                >
                  <Plus size={11} />
                  Upload Image / Video
                </button>

                {/* Apply Active Tuning */}
                <button
                  onClick={handleApplyWallpaperTuning}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 border border-purple-500/50 text-purple-300 text-[10px] font-mono hover:bg-slate-700 transition-colors"
                >
                  <Check size={11} />
                  Apply Surface
                </button>
              </div>
            }
          >
            {/* 5 Built-in WebGL Shaders Gallery */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap size={12} className="text-purple-400" />
                  WebGL Shader Gallery (5 Built-in Canvas Shaders)
                </span>
                <span className="text-slate-500">Audio-Reactive GPU Shaders</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                {WEBGL_SHADERS.map((shader) => {
                  const IconComponent = shader.icon
                  const isShaderActive =
                    activeShaderKey === shader.id ||
                    wallpaper.source_path?.includes(shader.id) ||
                    wallpaper.id === `${shader.id}_shader`

                  return (
                    <div
                      key={shader.id}
                      onClick={() => handleSelectShader(shader)}
                      className={`group p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        isShaderActive
                          ? 'border-purple-400 bg-purple-950/30 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                          : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <IconComponent size={14} className={isShaderActive ? 'text-purple-400' : 'text-slate-400'} />
                          <span className="text-[10px] font-mono font-bold text-slate-200 truncate">
                            {shader.name}
                          </span>
                        </div>
                        {isShaderActive && (
                          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        )}
                      </div>

                      <p className="text-[9px] font-mono text-slate-400 line-clamp-2">
                        {shader.description}
                      </p>

                      <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
                        <span>Blend: {shader.defaultBlendMode}</span>
                        <span className={isShaderActive ? 'text-purple-400 font-bold' : ''}>
                          {isShaderActive ? 'ACTIVE' : 'Engage'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Per-Mode Workspace Bindings */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Link size={11} className="text-purple-400" />
                Per-Mode Workspace Bindings
              </span>

              <div className="flex flex-wrap items-center gap-2">
                {['GLOBAL', 'DEV', 'STUDY', 'STUDIO', 'SILENT'].map((mode) => {
                  const isSelected = wpTuning.mode_binding === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => setWpTuning((p) => ({ ...p, mode_binding: mode }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                        isSelected
                          ? 'bg-purple-500/30 text-purple-300 border border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                          : 'bg-slate-900/60 text-slate-400 border border-white/10 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  )
                })}
                <span className="text-[10px] font-mono text-slate-500 ml-2">
                  Active surface applies specifically to [{wpTuning.mode_binding}] mode
                </span>
              </div>
            </div>

            {/* Sliders & Blend Mode */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Sliders size={11} className="text-purple-400" />
                Surface Optics & Blend Mode
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                <SliderControl
                  label="Wallpaper Opacity"
                  value={wpTuning.opacity}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setWpTuning((p) => ({ ...p, opacity: v }))}
                />
                <SliderControl
                  label="Surface Blur"
                  value={wpTuning.blur}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(v) => setWpTuning((p) => ({ ...p, blur: v }))}
                />
                <SliderControl
                  label="Vignette Intensity"
                  value={wpTuning.vignette}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(v) => setWpTuning((p) => ({ ...p, vignette: v }))}
                />
                <SliderControl
                  label="Parallax Depth"
                  value={wpTuning.parallax}
                  min={0}
                  max={40}
                  unit="px"
                  onChange={(v) => setWpTuning((p) => ({ ...p, parallax: v }))}
                />

                {/* Blend Mode Dropdown */}
                <div className="p-2 rounded bg-slate-900/40 border border-white/5 flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    CSS Blend Mode
                  </span>
                  <select
                    value={wpTuning.blend_mode}
                    onChange={(e) => setWpTuning((p) => ({ ...p, blend_mode: e.target.value }))}
                    className="px-2 py-1 rounded bg-slate-900 border border-white/10 text-xs font-mono text-purple-300 outline-none focus:border-purple-400"
                  >
                    {BLEND_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Audio-Reactive Surge Toggle */}
                <div className="p-2 rounded bg-slate-900/40 border border-white/5 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Audio-Reactive Surge
                  </span>
                  <button
                    onClick={() => setWpTuning((p) => ({ ...p, audio_reactive: !p.audio_reactive }))}
                    className={`px-3 py-1 rounded text-[10px] font-mono font-bold transition-colors ${
                      wpTuning.audio_reactive
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                        : 'bg-slate-800 text-slate-500 border border-white/5'
                    }`}
                  >
                    {wpTuning.audio_reactive ? 'ENGAGED' : 'MUTED'}
                  </button>
                </div>
              </div>
            </div>

            {/* Custom / Uploaded Wallpaper Library */}
            {wallpapers.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Image size={11} className="text-purple-400" />
                  Staged Wallpaper Library ({wallpapers.length} items)
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-2">
                  {wallpapers.map((item) => {
                    const isItemActive = activeWallpaperId === item.id
                    return (
                      <div
                        key={item.id}
                        className={`group relative p-2 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                          isItemActive
                            ? 'border-purple-400 bg-purple-950/40 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                            : 'border-white/10 bg-slate-900/40 hover:border-white/20'
                        }`}
                        onClick={() => setActiveWallpaper(item.id, wpTuning.mode_binding)}
                      >
                        <div className="w-full h-14 rounded bg-slate-950 overflow-hidden flex items-center justify-center relative">
                          {item.kind === 'video' ? (
                            <video
                              src={item.source_path}
                              muted
                              loop
                              autoPlay
                              className="w-full h-full object-cover"
                            />
                          ) : item.kind === 'image' ? (
                            <img
                              src={item.source_path}
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Waves size={20} className="text-purple-400/60" />
                          )}
                          <span className="absolute top-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[7px] font-mono text-purple-300 uppercase">
                            {item.kind}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[9px] font-mono">
                          <span className="text-slate-300 truncate">{item.name}</span>
                          {isItemActive && <Check size={10} className="text-purple-400" />}
                        </div>

                        {item.kind !== 'shader' && !item.is_active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void deleteWallpaper(item.id)
                            }}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 hover:bg-rose-900"
                            title="Delete custom wallpaper"
                          >
                            <Trash2 size={9} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </HudBracketCard>
        </section>
      </div>
    </div>
  )
}
