import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const BUILD_VERSION = Date.now().toString();

const versionPlugin = () => ({
  name: 'version-json',
  closeBundle() {
    writeFileSync(
      resolve(__dirname, 'dist/version.json'),
      JSON.stringify({ version: BUILD_VERSION })
    );
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), versionPlugin()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
});
