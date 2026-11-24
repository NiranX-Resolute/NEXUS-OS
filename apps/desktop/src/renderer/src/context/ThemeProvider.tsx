import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'

export interface ThemeTokens {
  void_bg?: string
  bg_void?: string
  accent_primary?: string
  accent_secondary?: string
  accent_danger?: string
  surface_tint?: string
  text_primary?: string
  text_muted?: string
  glass_opacity?: number
  glass_blur_px?: number
  border_glow_intensity?: number
  corner_brackets?: boolean
  scanline_opacity?: number
  film_grain_opacity?: number
  kinetic_cipher_speed?: string
  typography_pair?: string
  core_morphology?: 'dyson' | 'atlas' | 'vortex' | 'helix' | string
  orbiter_colors?: Record<string, string>
  [key: string]: any
}

export interface Theme {
  id: string
  name: string
  is_builtin?: boolean
  tokens: ThemeTokens
  is_active?: boolean
  updated_at?: string
}

export interface WallpaperConfig {
  opacity?: number
  blur?: number
  vignette?: number
  parallax?: number
  audio_reactive?: boolean
  blend_mode?: string
  [key: string]: any
}

export interface Wallpaper {
  id: string
  name: string
  kind: 'shader' | 'video' | 'image' | string
  source_path: string
  mode_binding?: string
  config?: WallpaperConfig
  is_active?: boolean
  updated_at?: string
}

export interface ThemeContextValue {
  theme: Theme
  themes: Theme[]
  activeThemeId: string
  setActiveTheme: (themeId: string) => Promise<boolean>
  saveTheme: (themeData: Partial<Theme> & { name: string; tokens: ThemeTokens }) => Promise<boolean>
  deleteTheme: (themeId: string) => Promise<boolean>
  refreshThemes: () => Promise<void>
  wallpaper: Wallpaper
  wallpapers: Wallpaper[]
  activeWallpaperId: string
  setActiveWallpaper: (wallpaperId: string, mode?: string) => Promise<boolean>
  saveWallpaper: (
    wallpaperData: Partial<Wallpaper> & { name: string; kind: string; source_path: string }
  ) => Promise<boolean>
  deleteWallpaper: (wallpaperId: string) => Promise<boolean>
  refreshWallpapers: (mode?: string) => Promise<void>
  isLoading: boolean
  error: string | null
}

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  void_bg: '#030711',
  accent_primary: '#00F5D4',
  accent_secondary: '#38BDF8',
  accent_danger: '#EF4444',
  surface_tint: '#061325',
  text_primary: '#F8FAFC',
  text_muted: '#64748B',
  glass_opacity: 0.85,
  glass_blur_px: 20,
  border_glow_intensity: 0.65,
  corner_brackets: true,
  scanline_opacity: 0.08,
  film_grain_opacity: 0.04,
  kinetic_cipher_speed: 'normal',
  typography_pair: 'Space Grotesk + JetBrains Mono',
  core_morphology: 'dyson',
  orbiter_colors: {
    'DEV-01': '#00F5D4',
    'SYS-01': '#38BDF8',
    'SCOUT-01': '#F59E0B',
    'SEC-01': '#10B981',
    'OPS-01': '#8B5CF6'
  }
}

export const DEFAULT_THEME: Theme = {
  id: 'obsidian_cyber',
  name: 'Obsidian Cyber',
  is_builtin: true,
  tokens: DEFAULT_THEME_TOKENS,
  is_active: true
}

export const DEFAULT_WALLPAPER: Wallpaper = {
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
  is_active: true
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const IPC_ORIGIN = 'http://127.0.0.1:47630'

async function resolveIpcAuthToken(): Promise<string> {
  try {
    const win = window as any
    if (win.nexusAuth?.getAuthToken) {
      const token = await win.nexusAuth.getAuthToken()
      if (token) return token
    }
    if (win.electron?.ipcRenderer?.invoke) {
      const token = await win.electron.ipcRenderer.invoke('get-auth-token')
      if (token) return token
    }
  } catch {
    // Context isolation or offline fallback
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

export function applyTokensToCss(tokens: ThemeTokens, wallpaper?: Wallpaper | null): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  // Void background
  const voidBg = tokens.void_bg || tokens.bg_void || '#030711'
  root.style.setProperty('--bg-void', voidBg)
  root.style.setProperty('--void-bg', voidBg)

  // Accents and surfaces
  if (tokens.accent_primary) root.style.setProperty('--accent-primary', tokens.accent_primary)
  if (tokens.accent_secondary) root.style.setProperty('--accent-secondary', tokens.accent_secondary)
  if (tokens.accent_danger) root.style.setProperty('--accent-danger', tokens.accent_danger)
  if (tokens.surface_tint) root.style.setProperty('--surface-tint', tokens.surface_tint)
  if (tokens.text_primary) root.style.setProperty('--text-primary', tokens.text_primary)
  if (tokens.text_muted) root.style.setProperty('--text-muted', tokens.text_muted)

  // HUD Optics & Glass
  if (tokens.glass_opacity !== undefined) {
    root.style.setProperty('--glass-opacity', String(tokens.glass_opacity))
  }
  if (tokens.glass_blur_px !== undefined) {
    root.style.setProperty('--glass-blur-px', `${tokens.glass_blur_px}px`)
    root.style.setProperty('--glass-blur', `${tokens.glass_blur_px}px`)
  }
  if (tokens.border_glow_intensity !== undefined) {
    root.style.setProperty('--border-glow-intensity', String(tokens.border_glow_intensity))
  }
  if (tokens.corner_brackets !== undefined) {
    root.style.setProperty('--corner-brackets', tokens.corner_brackets ? '1' : '0')
  }
  if (tokens.scanline_opacity !== undefined) {
    root.style.setProperty('--scanline-opacity', String(tokens.scanline_opacity))
  }
  if (tokens.film_grain_opacity !== undefined) {
    root.style.setProperty('--film-grain-opacity', String(tokens.film_grain_opacity))
  }
  if (tokens.kinetic_cipher_speed) {
    root.style.setProperty('--kinetic-cipher-speed', tokens.kinetic_cipher_speed)
  }
  if (tokens.typography_pair) {
    root.style.setProperty('--typography-pair', tokens.typography_pair)
  }
  if (tokens.core_morphology) {
    root.style.setProperty('--core-morphology', tokens.core_morphology)
  }

  // Orbiter colors
  if (tokens.orbiter_colors && typeof tokens.orbiter_colors === 'object') {
    Object.entries(tokens.orbiter_colors).forEach(([key, color]) => {
      const sanitizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '-')
      root.style.setProperty(`--orbiter-${sanitizedKey}`, color)
    })
  }

  // Additional token keys
  Object.entries(tokens).forEach(([key, val]) => {
    if (val === undefined || val === null || typeof val === 'object') return
    const cssVar = `--${key.replace(/_/g, '-')}`
    if (!root.style.getPropertyValue(cssVar)) {
      root.style.setProperty(cssVar, String(val))
    }
  })

  // Wallpaper bindings
  if (wallpaper) {
    root.style.setProperty('--wallpaper-id', wallpaper.id)
    root.style.setProperty('--wallpaper-name', wallpaper.name)
    root.style.setProperty('--wallpaper-kind', wallpaper.kind)
    root.style.setProperty('--wallpaper-source', wallpaper.source_path)
    if (wallpaper.config?.opacity !== undefined) {
      root.style.setProperty('--wallpaper-opacity', String(wallpaper.config.opacity))
    }
    if (wallpaper.config?.blur !== undefined) {
      root.style.setProperty('--wallpaper-blur', `${wallpaper.config.blur}px`)
    }
    if (wallpaper.config?.blend_mode) {
      root.style.setProperty('--wallpaper-blend-mode', wallpaper.config.blend_mode)
    }
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themes, setThemes] = useState<Theme[]>([DEFAULT_THEME])
  const [activeTheme, setActiveThemeState] = useState<Theme>(DEFAULT_THEME)
  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([DEFAULT_WALLPAPER])
  const [activeWallpaper, setActiveWallpaperState] = useState<Wallpaper>(DEFAULT_WALLPAPER)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWithAuth = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = await resolveIpcAuthToken()
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      headers['X-Nexus-Token'] = token
    }

    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    const candidateUrls = [`${IPC_ORIGIN}${path}`, path]

    let lastError: Error | null = null
    for (const url of candidateUrls) {
      try {
        const response = await fetch(url, { ...options, headers })
        if (response.ok) {
          return await response.json()
        }
      } catch (err: any) {
        lastError = err
      }
    }
    throw lastError || new Error(`Network failure requesting ${endpoint}`)
  }, [])

  const refreshThemes = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchWithAuth('/api/themes')
      if (data && data.success) {
        const remoteThemes: Theme[] = data.themes || []
        const currentActive: Theme | null = data.active_theme || null

        if (remoteThemes.length > 0) {
          setThemes(remoteThemes)
        }
        if (currentActive) {
          setActiveThemeState(currentActive)
          applyTokensToCss(currentActive.tokens, activeWallpaper)
        } else if (remoteThemes.length > 0) {
          const fallback = remoteThemes.find((t) => t.is_active) || remoteThemes[0]
          setActiveThemeState(fallback)
          applyTokensToCss(fallback.tokens, activeWallpaper)
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch themes from IPC server')
      applyTokensToCss(DEFAULT_THEME_TOKENS, activeWallpaper)
    }
  }, [fetchWithAuth, activeWallpaper])

  const refreshWallpapers = useCallback(
    async (mode?: string) => {
      try {
        setError(null)
        const query = mode ? `?mode=${encodeURIComponent(mode)}` : ''
        const data = await fetchWithAuth(`/api/wallpapers${query}`)
        if (data && data.success) {
          const remoteWallpapers: Wallpaper[] = data.wallpapers || []
          const currentActive: Wallpaper | null = data.active_wallpaper || null

          if (remoteWallpapers.length > 0) {
            setWallpapers(remoteWallpapers)
          }
          if (currentActive) {
            setActiveWallpaperState(currentActive)
            applyTokensToCss(activeTheme.tokens, currentActive)
          } else if (remoteWallpapers.length > 0) {
            const fallback = remoteWallpapers.find((w) => w.is_active) || remoteWallpapers[0]
            setActiveWallpaperState(fallback)
            applyTokensToCss(activeTheme.tokens, fallback)
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to fetch wallpapers from IPC server')
        applyTokensToCss(activeTheme.tokens, DEFAULT_WALLPAPER)
      }
    },
    [fetchWithAuth, activeTheme]
  )

  const setActiveTheme = useCallback(
    async (themeId: string): Promise<boolean> => {
      try {
        const found = themes.find((t) => t.id === themeId)
        if (found) {
          setActiveThemeState(found)
          applyTokensToCss(found.tokens, activeWallpaper)
        }

        const data = await fetchWithAuth('/api/themes/activate', {
          method: 'POST',
          body: JSON.stringify({ id: themeId })
        })

        if (data && data.success) {
          await refreshThemes()
          window.dispatchEvent(new CustomEvent('nexus-theme-changed', { detail: { themeId } }))
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [themes, activeWallpaper, fetchWithAuth, refreshThemes]
  )

  const saveTheme = useCallback(
    async (themeData: Partial<Theme> & { name: string; tokens: ThemeTokens }): Promise<boolean> => {
      try {
        const data = await fetchWithAuth('/api/themes/save', {
          method: 'POST',
          body: JSON.stringify({ theme: themeData })
        })
        if (data && data.success) {
          await refreshThemes()
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [fetchWithAuth, refreshThemes]
  )

  const deleteTheme = useCallback(
    async (themeId: string): Promise<boolean> => {
      try {
        const data = await fetchWithAuth('/api/themes/delete', {
          method: 'POST',
          body: JSON.stringify({ id: themeId })
        })
        if (data && data.success) {
          await refreshThemes()
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [fetchWithAuth, refreshThemes]
  )

  const setActiveWallpaper = useCallback(
    async (wallpaperId: string, mode: string = 'GLOBAL'): Promise<boolean> => {
      try {
        const found = wallpapers.find((w) => w.id === wallpaperId)
        if (found) {
          setActiveWallpaperState(found)
          applyTokensToCss(activeTheme.tokens, found)
        }

        const data = await fetchWithAuth('/api/wallpapers/activate', {
          method: 'POST',
          body: JSON.stringify({ id: wallpaperId, mode })
        })

        if (data && data.success) {
          await refreshWallpapers(mode)
          window.dispatchEvent(
            new CustomEvent('nexus-wallpaper-changed', { detail: { wallpaperId, mode } })
          )
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [wallpapers, activeTheme, fetchWithAuth, refreshWallpapers]
  )

  const saveWallpaper = useCallback(
    async (
      wallpaperData: Partial<Wallpaper> & { name: string; kind: string; source_path: string }
    ): Promise<boolean> => {
      try {
        const data = await fetchWithAuth('/api/wallpapers/save', {
          method: 'POST',
          body: JSON.stringify({ wallpaper: wallpaperData })
        })
        if (data && data.success) {
          await refreshWallpapers()
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [fetchWithAuth, refreshWallpapers]
  )

  const deleteWallpaper = useCallback(
    async (wallpaperId: string): Promise<boolean> => {
      try {
        const data = await fetchWithAuth('/api/wallpapers/delete', {
          method: 'POST',
          body: JSON.stringify({ id: wallpaperId })
        })
        if (data && data.success) {
          await refreshWallpapers()
          return true
        }
        return false
      } catch {
        return false
      }
    },
    [fetchWithAuth, refreshWallpapers]
  )

  useEffect(() => {
    let mounted = true
    applyTokensToCss(DEFAULT_THEME_TOKENS, DEFAULT_WALLPAPER)

    const init = async () => {
      setIsLoading(true)
      await Promise.allSettled([refreshThemes(), refreshWallpapers()])
      if (mounted) {
        setIsLoading(false)
      }
    }

    void init()

    const handleThemeEvent = () => {
      void refreshThemes()
    }
    const handleWallpaperEvent = () => {
      void refreshWallpapers()
    }

    window.addEventListener('nexus-theme-refresh', handleThemeEvent)
    window.addEventListener('nexus-wallpaper-refresh', handleWallpaperEvent)

    return () => {
      mounted = false
      window.removeEventListener('nexus-theme-refresh', handleThemeEvent)
      window.removeEventListener('nexus-wallpaper-refresh', handleWallpaperEvent)
    }
  }, [refreshThemes, refreshWallpapers])

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme: activeTheme,
      themes,
      activeThemeId: activeTheme.id,
      setActiveTheme,
      saveTheme,
      deleteTheme,
      refreshThemes,
      wallpaper: activeWallpaper,
      wallpapers,
      activeWallpaperId: activeWallpaper.id,
      setActiveWallpaper,
      saveWallpaper,
      deleteWallpaper,
      refreshWallpapers,
      isLoading,
      error
    }),
    [
      activeTheme,
      themes,
      setActiveTheme,
      saveTheme,
      deleteTheme,
      refreshThemes,
      activeWallpaper,
      wallpapers,
      setActiveWallpaper,
      saveWallpaper,
      deleteWallpaper,
      refreshWallpapers,
      isLoading,
      error
    ]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export default ThemeProvider
