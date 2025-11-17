import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../../packages/shared-schema/src'),
            '@schema': path.resolve(__dirname, '../../packages/shared-schema/src/schema'),
            '@spacetime': path.resolve(__dirname, '../../packages/spacetime-modules/src'),
            '@orchestrator': path.resolve(__dirname, '../../services/orchestrator/src')
        }
    }
    ,
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
