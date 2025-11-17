import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['**/*.test.ts']
    },
    resolve: {
        alias: {
            '@shared': '/packages/shared-schema/src',
            '@schema': '/packages/shared-schema/src/schema',
            '@spacetime': '/packages/spacetime-modules/src',
            '@orchestrator': '/services/orchestrator/src',
            '@prompt': '/packages/prompt-schema/src'
        }
    }
});
