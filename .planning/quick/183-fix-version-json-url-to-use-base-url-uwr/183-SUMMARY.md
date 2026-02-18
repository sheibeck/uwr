---
phase: quick-183
plan: "01"
subsystem: client-infrastructure
tags: [version-polling, vite, github-pages, auto-reload]
dependency_graph:
  requires: [quick-144]
  provides: [base-url-aware-version-polling]
  affects: [src/main.ts]
tech_stack:
  added: []
  patterns: [import.meta.env.BASE_URL prefix for asset URLs]
key_files:
  created: []
  modified:
    - src/main.ts
decisions:
  - "Use import.meta.env.BASE_URL + 'version.json' (no leading slash on filename) to avoid double-slash; BASE_URL always ends with trailing slash"
metrics:
  duration: ~2min
  completed: 2026-02-18
---

# Quick-183: Fix version.json URL to use BASE_URL Summary

One-line fix: `checkForUpdates` now fetches `import.meta.env.BASE_URL + 'version.json?_=...'` instead of hardcoded `/version.json?_=...`, correcting a 404 in the GitHub Pages production deployment where the site lives at `/uwr/`.

## What Was Done

### Task 1: Prefix version.json fetch with Vite BASE_URL

Changed `src/main.ts` line 56 from:
```typescript
const resp = await fetch('/version.json?_=' + Date.now(), {
```
to:
```typescript
const resp = await fetch(import.meta.env.BASE_URL + 'version.json?_=' + Date.now(), {
```

Vite's `import.meta.env.BASE_URL` is:
- `/uwr/` in production (set by `--base=/uwr/` in the GitHub Actions workflow)
- `/` in dev mode (default)

So the resulting URLs are:
- Production: `/uwr/version.json?_=...` (correct — file is at this path on GitHub Pages)
- Dev: `/version.json?_=...` (unchanged behavior)

**Commit:** bab1585

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/main.ts
- FOUND: commit bab1585
- FOUND: import.meta.env.BASE_URL in main.ts
