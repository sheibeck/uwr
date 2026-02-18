---
phase: quick-185
plan: 01
subsystem: build
tags: [vite, version-check, auto-reload, build-config]
dependency_graph:
  requires: []
  provides: [correct-version-matching-between-bundle-and-version-json]
  affects: [client/auto-reload-on-deploy]
tech_stack:
  added: []
  patterns: [single-source-of-truth-constant]
key_files:
  created: []
  modified:
    - vite.config.ts
decisions:
  - BUILD_VERSION const defined at module scope ensures a single Date.now() call shared between define block and versionPlugin.closeBundle
metrics:
  duration: ~2min
  completed: 2026-02-18
---

# Quick-185: Fix version check to only reload browser on new build

**One-liner:** Single `BUILD_VERSION` constant shared between Vite define block and versionPlugin ensures inlined CLIENT_VERSION matches dist/version.json, eliminating infinite 60s-poll reloads.

## Problem

Quick-144 added version polling (`main.ts` fetches `/version.json` every 60s and reloads if `data.version !== CLIENT_VERSION`). However, two separate `Date.now()` calls ran at different moments in the build:

1. `define: { __BUILD_VERSION__: JSON.stringify(Date.now().toString()) }` — evaluated when Vite loads the config
2. `const version = Date.now().toString()` inside `closeBundle()` — called after bundling finishes

These two timestamps are always different. Every 60s poll detected a "new version" and triggered `window.location.reload()` on every production client.

## Fix

Introduced a single `const BUILD_VERSION = Date.now().toString()` constant at module scope in `vite.config.ts`, used in both:
- The `define` block: `__BUILD_VERSION__: JSON.stringify(BUILD_VERSION)`
- The `versionPlugin.closeBundle()`: `JSON.stringify({ version: BUILD_VERSION })`

## Verification

Build run confirmed both values are identical:
- `dist/version.json`: `{"version":"1771431442578"}`
- Inlined in `dist/assets/index-*.js`: `"1771431442578"`

`src/main.ts` was not modified — polling logic was already correct.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix version mismatch by using single shared timestamp | e3156af | vite.config.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `vite.config.ts` modified with single `BUILD_VERSION` constant
- [x] Commit `e3156af` exists
- [x] `src/main.ts` unchanged
- [x] Build verified: both version values identical (`1771431442578`)
