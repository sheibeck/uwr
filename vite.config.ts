import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const versionPlugin = () => ({
  name: 'version-json',
  closeBundle() {
    const version = Date.now().toString();
    writeFileSync(
      resolve(__dirname, 'dist/version.json'),
      JSON.stringify({ version })
    );
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), versionPlugin()],
  define: {
    __BUILD_VERSION__: JSON.stringify(Date.now().toString()),
  },
});
