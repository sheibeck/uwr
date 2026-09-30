// Vitest config for the live-proof harness files (scripts/llm/**/*.live.ts), Plan 41-15.
// Deliberately not named vitest.config.ts and includes only *.live.ts, so the root
// `pnpm test` and `pnpm --dir spacetimedb test` never run live files.
//
// Run from the repo root (local server only):
//   PROVE_LIVE_DRY=1 pnpm exec vitest run --config scripts/llm/vitest.live.config.ts   # no spend
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts                     # paid (Plan 41-16)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['scripts/llm/**/*.live.ts'],
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    environment: 'node',
    silent: false, // the harness prints its status lines with console.log
    reporters: ['verbose'],
  },
});
