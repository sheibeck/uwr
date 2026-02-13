---
phase: quick-61
plan: 01
subsystem: ui-panels
tags: [bugfix, race-condition, ux]
dependency_graph:
  requires: []
  provides: ["race-condition-free panel dragging"]
  affects: ["panel position persistence", "multi-device sync"]
tech_stack:
  added: []
  patterns: ["local-authority dirty tracking", "optimistic UI"]
key_files:
  created: []
  modified:
    - "src/composables/usePanelManager.ts"
decisions:
  - "3-second dirty window covers full save pipeline (300ms localStorage + 2000ms server + ~500ms round-trip)"
  - "Single timestamp-based dirty flag simpler than per-panel dirty tracking"
  - "Early-return guard in server sync watcher prevents overwrite during dirty window"
metrics:
  duration_minutes: 6
  tasks_completed: 1
  files_modified: 1
  commits: 1
  completed_at: "2026-02-13T05:57:51Z"
---

# Quick Task 61: Fix Window Position Blinking Race Condition

**One-liner:** Local-authority dirty tracking prevents server sync from overwriting active panel moves during debounced save pipeline

## Context

When users dragged panels to new positions, they would "blink back" to old positions before settling at the new location. This was caused by a race condition:

1. User drags panel → local state updates immediately
2. 300ms localStorage debounce → saves to localStorage
3. 2000ms server debounce → sends to server
4. During this 2.3s window, ANY subscription update fires the server sync watcher
5. Watcher reads server data (still has OLD positions) and overwrites local state
6. Result: Panel visually "blinks" back before final save completes

## Implementation

### Root Cause

The `watch` on `serverPanelLayouts` (line 359-396) fires whenever the reactive `uiPanelLayout` table updates from subscription events. When it fires during the save pipeline, it applies stale server data over fresh local state.

### Solution: Local-Authority Dirty Tracking

Added a **dirty window** pattern that gives local state authority over server data during active user interactions:

1. **`dirtyUntil` ref** - Timestamp marking when local state has authority
2. **`DIRTY_WINDOW = 3000ms`** - Window covers full save pipeline:
   - 300ms localStorage debounce
   - 2000ms server save debounce
   - ~500ms server processing + subscription round-trip

3. **`markDirty()` helper** - Sets `dirtyUntil = Date.now() + 3000` on all user interactions

4. **Server sync guard** - Early-return in watcher: `if (dirtyUntil.value > Date.now()) return;`

5. **Dirty tracking locations** (where local state changes):
   - `onMouseMove` during drag (every move event)
   - `onMouseMove` during resize (every move event)
   - `togglePanel`, `openPanel`, `closePanel` (once per action)

6. **NOT set during restore operations**:
   - `loadFromStorage` (loading saved state, not user action)
   - Server sync watcher (applying server state, not user action)

### Key Design Decisions

**Why 3 seconds?**
Covers worst-case save pipeline: 300ms + 2000ms + 500ms = 2800ms. 3000ms provides margin.

**Why timestamp instead of per-panel dirty flags?**
Simpler implementation, same protection. Any panel change during user's "interaction session" should block ALL server syncs, not just for that panel.

**Why not clear dirty flag in saveToServer callback?**
Can't know when server actually processes it. Timestamp approach is safer and simpler.

**Orthogonal to existing loadingFromServer flag**
- `loadingFromServer` - Prevents server restore from triggering save-back-to-server
- `dirtyUntil` - Prevents server updates from overwriting local changes during save

Both guards serve different purposes and work together.

## Changes

### Modified Files

**src/composables/usePanelManager.ts**
- Added `dirtyUntil` ref (timestamp-based dirty flag)
- Added `DIRTY_WINDOW` constant (3000ms)
- Added `markDirty()` helper function
- Added early-return guard in server sync watcher
- Added `markDirty()` calls in: `togglePanel`, `openPanel`, `closePanel`, `onMouseMove` (drag), `onMouseMove` (resize)

## Verification

### Automated
- ✅ TypeScript compiles with no new errors in `usePanelManager.ts`
- ✅ All dirty tracking locations verified in code review

### Manual Testing Required
- Move a panel → should stay at new position without blinking
- Wait 5+ seconds after moving → trigger subscription event → panel should stay at saved position
- Switch characters → layout should load from server correctly (dirty flag not set during character switch)
- Reload page → layout should restore from server correctly

## Deviations from Plan

None - plan executed exactly as written.

## Auth Gates

None.

## Blockers

None.

## Self-Check

### Created Files
N/A - no new files created

### Modified Files
```bash
[ -f "C:/projects/uwr/src/composables/usePanelManager.ts" ] && echo "FOUND: src/composables/usePanelManager.ts" || echo "MISSING: src/composables/usePanelManager.ts"
```
Result: FOUND: src/composables/usePanelManager.ts

### Commits
```bash
git log --oneline --all | grep -q "df901cc" && echo "FOUND: df901cc" || echo "MISSING: df901cc"
```
Result: FOUND: df901cc

## Self-Check: PASSED

All files exist, commit is in git history, implementation verified.

---

## Next Steps

Manual verification required:
1. Test panel dragging doesn't blink during active gameplay
2. Test character switching still loads correct layouts
3. Test page reload restores layouts correctly
