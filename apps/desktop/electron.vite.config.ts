import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isDev = process.env.NODE_ENV !== 'production'
let reticlePlugin: PluginOption | null = null
if (isDev) {
  try {
    // Dev-only Reticle instrumentation
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { reticle } = require('@reticlehq/vite-plugin')
    reticlePlugin = reticle()
  } catch {
    // Dev-only fallback if package not loaded
  }
}

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'src/renderer/src/public'),
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [
      react(),
      tailwindcss(),
      ...(reticlePlugin ? [reticlePlugin] : [])
    ]
  }
})


