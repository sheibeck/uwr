// Vitest config for the Phase 39 live harness files (scripts/spike/**/*.live.ts).
// Deliberately not named vitest.config.ts and includes only *.live.ts, so the root
// `pnpm test` and `pnpm --dir spacetimedb test` never run live files.
//
// Run from the repo root:
//   pnpm exec vitest run --config scripts/spike/vitest.spike.config.ts <file>
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['scripts/spike/**/*.live.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    environment: 'node',
  },
});
