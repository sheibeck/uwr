import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const BUILD_VERSION = Date.now().toString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
});
