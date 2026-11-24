import { defineConfig, PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode === 'development';
  let reticlePlugin: PluginOption | null = null;
  if (isDev) {
    try {
      // Dev-only Reticle instrumentation
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { reticle } = require('@reticlehq/vite-plugin');
      reticlePlugin = reticle();
    } catch {
      // Dev-only fallback if package not loaded
    }
  }

  return {
    plugins: [
      react(),
      ...(reticlePlugin ? [reticlePlugin] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
