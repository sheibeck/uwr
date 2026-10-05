// Vitest config for the live-proof harness files (scripts/llm/**/*.live.ts), Plan 41-15.
// Deliberately not named vitest.config.ts and includes only *.live.ts, so the root
// `pnpm test` and `pnpm --dir spacetimedb test` never run live files.
//
// Run from the repo root (local server only):
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live                      # dry, no spend
//   PROVE_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live   # paid (Plan 44-09, after approval)
// Always pass a file filter (prove-live, golden or sweep): the config includes every *.live.ts file.
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
