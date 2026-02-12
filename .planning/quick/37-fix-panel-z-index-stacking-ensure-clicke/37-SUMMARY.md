---
phase: quick-37
plan: 01
subsystem: ui-panels
tags: [bugfix, z-index, panel-management, interaction]

dependency-graph:
  requires: []
  provides:
    - "Panel z-index management with topZ sync after load"
  affects:
    - "Panel stacking behavior"
    - "Panel click-to-front interaction"

tech-stack:
  added: []
  patterns:
    - "Reactive counter synchronization after state restoration"
    - "Early-return guard to prevent redundant reactive updates"

key-files:
  created: []
  modified:
    - path: "src/composables/usePanelManager.ts"
      changes:
        - "Added syncTopZ() helper to recalculate topZ from panel zIndex values"
        - "Call syncTopZ() after loadFromStorage() completes"
        - "Call syncTopZ() after server sync watch restores panel states"
        - "Added early-return guard in bringToFront() for already-on-top panels"

decisions:
  - what: "Sync topZ counter after all load operations"
    why: "topZ initializes at 10, but localStorage/server can restore panels with higher zIndex values, causing new clicks to assign LOWER z-index than restored panels"
    impact: "Guarantees topZ is always >= max loaded zIndex, ensuring bringToFront() increments from correct baseline"
  - what: "Early-return guard in bringToFront() for already-on-top panels"
    why: "Prevents redundant reactive updates that trigger saveToStorage, and fixes double-call issue from mousedown event bubbling (header + outer div)"
    impact: "Reduces unnecessary saves and prevents topZ from incrementing twice per single click"

metrics:
  tasks_completed: 1
  commits: 1
  files_modified: 1
  duration_seconds: 82
  completed_at: "2026-02-12T21:16:36Z"
---

# Quick Task 37: Fix Panel Z-Index Stacking Summary

**Fixed panel z-index stacking bug where clicking panels after page refresh did not bring them to front due to topZ counter desync.**

## What Was Done

### Task 1: Sync topZ counter after loading panel states

**Problem:** The `topZ` counter (which tracks the next z-index to assign) started at 10, but panels loaded from localStorage could have higher zIndex values (e.g., 25 from a previous session). When `bringToFront()` incremented `topZ` from 10 to 11, the newly-clicked panel got a LOWER z-index than restored panels, appearing behind them.

**Solution:**
1. Added `syncTopZ()` helper that scans all panels and sets `topZ.value` to the max of all `panel.zIndex` values (or 10, whichever is greater)
2. Called `syncTopZ()` at the end of `loadFromStorage()` after try/catch block
3. Called `syncTopZ()` in the server sync watch's `finally` block after `loadingFromServer.value = false`
4. Added early-return guard in `bringToFront()` to skip if panel is already at `topZ.value`

**Files modified:**
- `src/composables/usePanelManager.ts`

**Commit:** `92cfb1e`

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### The Root Cause

The panel manager uses a `topZ` counter (starts at 10) to track the next z-index value. When `bringToFront(id)` is called, it does:
```typescript
topZ.value += 1;
panels[id].zIndex = topZ.value;
```

However, `loadFromStorage()` restores panel states from localStorage (including zIndex values from previous sessions). If a restored panel has `zIndex: 25`, and topZ is still at 10, the next `bringToFront()` call assigns `zIndex: 11`, which is LOWER than 25, so the panel appears behind the restored panel.

### The Fix

After any load operation (localStorage or server sync), recalculate `topZ` to be at least as high as the max loaded zIndex:

```typescript
const syncTopZ = () => {
  let max = 10;
  for (const state of Object.values(panels)) {
    if (state.zIndex > max) max = state.zIndex;
  }
  topZ.value = max;
};
```

This ensures the next `bringToFront()` call increments from the correct baseline.

### Bonus Fix: Redundant Updates

Added early-return guard in `bringToFront()`:
```typescript
if (panels[id].zIndex === topZ.value) return; // Already on top
```

This prevents:
1. Redundant reactive updates that trigger `saveToStorage()` unnecessarily
2. Double-increment issue from mousedown event bubbling (both header mousedown via `startDrag()` and outer div mousedown via event listener call `bringToFront()`, causing topZ to increment by 2 per click)

## Verification

Manual verification steps from plan:
1. Open app with multiple panels open
2. Click on a panel behind another panel - should come to front on first click
3. Refresh the page (localStorage restore) - clicking any panel should immediately bring it to front
4. Drag a panel by header - should come to front during drag, not require separate click

## Self-Check: PASSED

- File exists: `src/composables/usePanelManager.ts` - FOUND
- Commit exists: `92cfb1e` - FOUND
- `syncTopZ()` defined and called after `loadFromStorage()` - VERIFIED
- `syncTopZ()` called after server sync in finally block - VERIFIED
- Early-return guard in `bringToFront()` - VERIFIED

## Impact

Users can now reliably bring panels to the front by clicking them, even after page refresh restores previously-saved panel z-index values. The fix also reduces unnecessary storage saves and prevents the double-increment bug from event bubbling.
