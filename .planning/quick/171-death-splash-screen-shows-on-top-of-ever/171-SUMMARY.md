---
phase: 171-death-overlay-zindex
plan: 01
subsystem: ui
tags: [vue, styles, z-index, death-screen]

# Dependency graph
requires: []
provides:
  - Death overlay always renders on top of all UI elements
affects: [death-ux]

# Tech tracking
tech-stack:
  added: []
  patterns: [death overlay uses zIndex 9999 — highest in the UI stack]

key-files:
  created: []
  modified:
    - src/ui/styles.ts

key-decisions:
  - "zIndex 9999: above floating panels (max ~5000), above resurrect confirmation (9000)"

# Metrics
duration: 1min
completed: 2026-02-18
---

# Quick Task 171: Death Overlay Z-Index Fix

**Bumped deathOverlay zIndex from 70 → 9999 so the death screen covers all floating panels and modals.**

## Root Cause

`deathOverlay` had `zIndex: 70`. Floating panels (via usePanelManager) can reach ~5000, and the resurrect/corpse-summon confirmation overlay uses `zIndex: 9000`. The death screen was buried under both.

## Fix

- `src/ui/styles.ts`: `deathOverlay.zIndex: 70 → 9999`

## Files Modified
- `src/ui/styles.ts`

---
*Phase: 171-death-overlay-zindex*
*Completed: 2026-02-18*
