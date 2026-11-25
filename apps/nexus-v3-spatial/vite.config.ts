import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5183,
    host: '127.0.0.1',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
