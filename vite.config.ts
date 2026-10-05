import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const BUILD_VERSION = process.env.BUILD_VERSION || Date.now().toString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  resolve: {
    alias: {
      '@game-data': fileURLToPath(new URL('./spacetimedb/src/data', import.meta.url)),
    },
  },
  server: {
    // Without strictPort Vite drifts to 5174 and SpacetimeAuth rejects the redirect URI.
    port: 5173,
    strictPort: true,
  },
});
