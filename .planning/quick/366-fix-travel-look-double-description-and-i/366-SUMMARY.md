---
phase: quick-366
plan: 01
subsystem: narrative-ui
tags: [travel, look, deduplication, styling]
dependency_graph:
  requires: []
  provides: [clean-travel-look-flow, look-visual-styling]
  affects: [intent.ts, movement.ts, commands.ts, NarrativeMessage.vue]
tech_stack:
  patterns: [auto-look-after-travel, unified-look-output]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/reducers/movement.ts
    - spacetimedb/src/reducers/commands.ts
    - src/components/NarrativeMessage.vue
decisions:
  - Travel messages stripped to "You travel to X." -- auto-look provides full details
  - movement.ts now imports buildLookOutput from intent.ts for consistency
  - commands.ts legacy look handler replaced with full buildLookOutput
  - Look events styled with subtle left border and background gradient (#c8ccd0 palette)
metrics:
  duration: 1min
  completed: "2026-03-08"
---

# Quick 366: Fix Travel/Look Double Description and Improve Look Styling

Travel messages stripped to name-only with auto-look providing full location details; look events get visual border/spacing treatment.

## What Was Done

### Task 1: Remove description from travel messages and ensure auto-look everywhere
- **Commit:** 945f299
- Removed `${location.description}` from all three travel paths (intent explicit, intent implicit, movement reducer)
- Added auto-look block to movement.ts (was missing -- only intent.ts had it)
- Replaced legacy commands.ts look handler with full `buildLookOutput` output

### Task 2: Add visual styling for LOOK events in NarrativeMessage
- **Commit:** fe90a14
- Added `isLook` computed property for look event detection
- Look events now render with: 2px left border (#c8ccd044), 8px top/bottom margin, 4px vertical padding, 10px left padding, subtle background gradient

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- All three travel paths produce "You travel to X." without description
- Auto-look fires after all travel paths including movement.ts
- Legacy look command uses full buildLookOutput
- Look events have visual distinction in narrative stream

## Self-Check: PASSED
