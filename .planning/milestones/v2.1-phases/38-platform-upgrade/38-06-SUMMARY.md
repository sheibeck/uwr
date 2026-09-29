---
phase: 38-platform-upgrade
plan: 06
subsystem: tooling
tags: [vue, typescript-6, vue-tsc-3, vite-8, plugin-vue-6, vitest-5, pnpm]
requires: [38-05]
provides:
  - Root toolchain on vue 3.5.43, typescript 6.0.3, vue-tsc 3.3.11, vite 8.3.1, plugin-vue 6.0.9, vitest 5.0.2
  - Temporary root pnpm-workspace.yaml retired (esbuild no longer in the root graph)
affects: [38-07, 38-08]
tech-stack:
  added: []
  patterns:
    - "TypeScript tilde-pinned to ~6.0.3 (latest dist-tag is 7.x; vue-tsc cannot run on it)"
key-files:
  created: []
  modified:
    - package.json
    - pnpm-lock.yaml
  deleted:
    - pnpm-workspace.yaml
key-decisions:
  - "No source, tsconfig or vite.config.ts changes were required by any of the three bumps"
requirements-completed: [SC-3, SC-6]
metrics:
  tasks: 3
  commits: 3
completed: 2026-09-29
status: complete
---

# Phase 38 Plan 06: Root Toolchain Upgrade Summary

The root now runs Vue 3.5.43, TypeScript 6.0.3, vue-tsc 3.3.11, Vite 8.3.1, @vitejs/plugin-vue 6.0.9 and Vitest 5.0.2, in three isolated commits, with `vue-tsc` at 0 errors, no code changes needed, and the temporary root `pnpm-workspace.yaml` removed.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Vue 3.5 patch bump | 5f80656a |
| 2 | TypeScript ~6.0.3 and vue-tsc 3 | 29342077 |
| 3 | Vite 8, plugin-vue 6, Vitest 5, retire root pnpm-workspace.yaml | 197e4b8c |

Each commit changed only `package.json` and `pnpm-lock.yaml` (plus the `pnpm-workspace.yaml` deletion in commit 3).

## Results

- **Resolved versions**
  - After task 1: vue 3.5.29 to 3.5.43.
  - After task 2: typescript 5.6.3 to 6.0.3 (pnpm noted 7.0.2 exists and it was correctly not selected), vue-tsc 2.2.12 to 3.3.11.
  - After task 3: vite 6.4.1 to 8.3.1, @vitejs/plugin-vue 5.2.4 to 6.0.9, vitest 4.1.11 to 5.0.2.
- **vue-tsc after TS 6 / vue-tsc 3:** `vue-tsc --noEmit -p tsconfig.json` exit 0, 0 errors. No fixes were needed, so the fix list is empty. The TS2719 at `App.vue:87` predicted by RESEARCH did not appear, because 38-01 had unified `HotbarDisplaySlot`. `tsconfig.json` is untouched, with no strictness or `noUnused*` relaxation.
- **llm-proxy typecheck with root TS 6:** `node_modules/.bin/tsc --noEmit -p llm-proxy/tsconfig.json`, 0 `error TS` lines.
- **Gates after each bump:** `pnpm run build` exit 0, root `pnpm test` 19 files / 513 tests, `pnpm --dir spacetimedb test` 16 files / 478 tests. All green after all three bumps.
- **Vitest 5 test adjustments:** none. All 513 root tests passed unchanged.
- **vite.config.ts:** unchanged.
- **html2canvas static check:** `grep -l html2canvas dist/assets/*.js | wc -l` printed 1. The runtime Bug Report screenshot check remains the 38-08 human step (Rolldown CJS interop, RESEARCH A3).
- **Dev-server smoke** (`vite --host 127.0.0.1 --port 5173 --strictPort`, Vite v8.3.1 ready in 2.6 s): `/` contained `id="app"` (count 1), `/src/main.ts` returned 200, `/src/App.vue` returned 200. The server was stopped (`taskkill` on PID 9108); port 5173 has no listener and curl gets no response. Ports 3000 and 8787 were not touched.
- **`pnpm why esbuild`:** empty output (0 matches) once vite 8 and vitest 5 were in. `git rm pnpm-workspace.yaml` was done, then `pnpm install` exit 0 and `pnpm install --frozen-lockfile` exit 0. `pnpm run build` was re-run after the removal and exited 0.
- The TS pin survived: `grep -c '"typescript": "~6.0.3"' package.json` prints 1.

## Deviations from Plan

None. The plan was executed exactly as written. No auto-fixes, no auth gates, and no permission denials.

## Known Stubs

None.

## Threat Flags

None. The smoke server bound to 127.0.0.1 only and was stopped. Nothing was pushed, published or deployed, and `spacetimedb/` and `llm-proxy/` manifests were not touched.

## Notes for later plans

- The build now emits a Rolldown PLUGIN_TIMINGS informational notice (the vite:vue transform takes 73% of the build). It is not an error.
- 38-08 human check: open the Bug Report panel (html2canvas screenshot) under the Vite 8 build.

## Self-Check: PASSED

- Commits 5f80656a, 29342077 and 197e4b8c exist in git log.
- `pnpm-workspace.yaml` is no longer tracked at the root.
