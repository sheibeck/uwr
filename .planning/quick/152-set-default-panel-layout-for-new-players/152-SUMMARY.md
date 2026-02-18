---
phase: quick-152
plan: 01
subsystem: ui/panels
tags: [panel-layout, ux, new-player, resetwindows]
dependency_graph:
  requires: []
  provides: [getDefaultLayout]
  affects: [usePanelManager, App.vue]
tech_stack:
  added: []
  patterns: [viewport-aware-layout, shared-defaults]
key_files:
  created: []
  modified:
    - src/composables/usePanelManager.ts
    - src/App.vue
decisions:
  - getDefaultLayout reads window.innerWidth/innerHeight at call time — correct for browser-only game, SSR falls back to 1920x1080
  - resetAllPanels reuses getDefaultLayout for identical layout as new player defaults — single source of truth
  - travel panel width assumed 320px (floatingPanel), hotbar 160px, group 260px (compact) — matches styles.ts constants
metrics:
  duration: ~3min
  completed: 2026-02-17
  tasks: 1
  files: 2
---

# Quick-152: Set Default Panel Layout for New Players

Viewport-aware default layout for 4 always-open panels, shared between new-player init and /resetwindows.

## What Was Done

Added `getDefaultLayout()` function to `usePanelManager.ts` that computes panel positions based on current viewport at call time. New players see the 4 always-open panels arranged in a practical HUD layout instead of at arbitrary positions. The `/resetwindows` command now restores this same layout instead of stacking all panels in the center.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create getDefaultLayout and update defaults + resetAllPanels | 99cf383 | usePanelManager.ts, App.vue |

## Layout Specification

For a 1920px wide viewport:
- **Log**: x=16, y=16, w=500, h=300 (top-left)
- **Travel**: x=1584, y=16 (top-right, 320px wide panel with 16px margin)
- **Hotbar**: x=1416, y=16 (160px wide, 8px gap left of travel)
- **Group**: x=1148, y=16 (260px wide, 8px gap left of hotbar)
- **All other panels**: screen center (open on demand)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `src/composables/usePanelManager.ts` — getDefaultLayout exported, resetAllPanels updated
- [x] `src/App.vue` — imports getDefaultLayout, passes it to usePanelManager()
- [x] Commit 99cf383 exists
- [x] No new TypeScript errors introduced (pre-existing errors unchanged)

## Self-Check: PASSED
