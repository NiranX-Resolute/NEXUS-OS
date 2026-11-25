import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode === 'development';
  let reticlePlugin: PluginOption | null = null;

  if (isDev) {
    try {
      const { reticle } = require('@reticlehq/vite-plugin') as { reticle: () => PluginOption };
      reticlePlugin = reticle();
    } catch {
      reticlePlugin = null;
    }
  }

  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      ...(reticlePlugin ? [reticlePlugin] : []),
    ],
    resolve: {
      preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5184,
      strictPort: true,
      host: '127.0.0.1',
    },
    preview: {
      port: 5184,
      strictPort: true,
      host: '127.0.0.1',
    },
  };
});
