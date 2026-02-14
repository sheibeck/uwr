---
phase: quick-73
plan: 01
subsystem: ui
tags: [bug-fix, panels, z-index, ux]
completed: 2026-02-14
duration: 86s

dependency_graph:
  requires: []
  provides:
    - "Reliable panel z-index stacking on click/drag"
  affects:
    - "All floating panels (Character, Inventory, Group, etc.)"

tech_stack:
  added: []
  patterns:
    - "Always-increment z-index pattern for bring-to-front"

key_files:
  created: []
  modified:
    - path: "src/composables/usePanelManager.ts"
      role: "Panel z-index management"
      changes: "Removed early-return guard from bringToFront function"

decisions:
  - decision: "Remove early-return guard entirely instead of making it smarter"
    rationale: "Any guard checking equality against topZ breaks when multiple panels share the same z-index. Always incrementing is simple and correct."
    alternatives:
      - "Add guard counting panels at topZ (complexity for zero benefit)"
      - "Check if panel is already highest (still breaks with shared z-index)"

metrics:
  tasks_completed: 1
  files_modified: 1
  commits: 1
  deviations: 0
---

# Quick Task 73: Fix Window Z-Index Not Updating When Dragging or Clicking

**One-liner:** Removed early-return guard preventing z-index updates when multiple panels share the same zIndex value

## Summary

Fixed window z-index stacking bug where clicking or dragging panels failed to bring them to front when multiple panels had the same zIndex value. This commonly occurred at initialization (all panels start at zIndex 10) or after server state restoration.

## Root Cause

The `bringToFront` function had an early-return guard: `if (panels[id].zIndex === topZ.value) return;`

This guard assumed only one panel could have `zIndex === topZ.value` (the "on top" panel). However, multiple panels often share the same zIndex:
- **At initialization:** All panels start at zIndex 10
- **After server restore:** Server doesn't store zIndex (local-only), so panels may have identical values
- **Edge cases:** Race conditions during rapid clicking

When clicking a panel with `zIndex === topZ.value`, the guard prevented incrementing topZ, so the panel's z-index never changed. Since multiple panels shared the same z-index, none could be brought to front.

## Implementation

Removed the problematic early-return guard entirely from the `bringToFront` function:

```typescript
// Before (broken)
const bringToFront = (id: string) => {
    if (!panels[id]) return;
    if (panels[id].zIndex === topZ.value) return; // Already on top ❌
    topZ.value += 1;
    panels[id].zIndex = topZ.value;
};

// After (fixed)
const bringToFront = (id: string) => {
    if (!panels[id]) return;
    topZ.value += 1;
    panels[id].zIndex = topZ.value;
};
```

The function now **always** increments `topZ` and assigns the new value to the clicked panel. This ensures the panel always gets the highest z-index, regardless of current values.

### Why Always Increment Is Safe

**Z-index inflation is negligible:**
- CSS z-index supports values up to 2^31 - 1 (2,147,483,647)
- Even with 1000 clicks per minute for 24 hours = 1.44M clicks
- Years of heavy use won't approach problematic values
- Browser would crash from memory issues long before z-index overflow

**Alternative guards all break:**
- "Check if already highest" → breaks when multiple panels share topZ
- "Count panels at topZ" → adds complexity for zero benefit
- "Reset z-index periodically" → causes visible flashing

## Files Modified

### `src/composables/usePanelManager.ts`
- **Changed:** Removed early-return guard from `bringToFront` function
- **Impact:** Clicking or dragging any panel now reliably brings it to the visual front

## Deviations from Plan

None - plan executed exactly as written.

## Testing Notes

**Manual verification:**
1. Open multiple overlapping panels (Character, Inventory, Group)
2. Click on a panel visually behind another → should jump to front
3. Drag a panel by its header → should come to front during drag
4. Refresh page, then click panels → should work correctly from first click
5. Clear localStorage (fresh session), open panels → clicking should work immediately

**Expected behavior:**
- Any panel clicked always comes to visual front
- Dragging a panel header brings it to front
- No visual glitches or z-index conflicts
- Works correctly after page refresh or character switch

## Impact

**User-facing:**
- Fixed frustrating UX bug where panels wouldn't come to front when clicked
- Improved window management reliability across all floating panels
- Consistent behavior regardless of initialization state

**Technical:**
- Simplified `bringToFront` logic (removed problematic guard)
- No performance impact (negligible z-index increments)
- No changes to panel persistence or sync behavior

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | fd53bd1 | Remove early-return guard preventing z-index updates |

## Self-Check: PASSED

**Files exist:**
- `src/composables/usePanelManager.ts` - FOUND (modified correctly)

**Commits exist:**
- fd53bd1 - FOUND in git history

**Code verification:**
- Early-return guard removed from `bringToFront` - CONFIRMED
- Null check still present - CONFIRMED
- `syncTopZ` function unchanged - CONFIRMED
- `syncTopZ` call sites unchanged (loadFromStorage, server sync) - CONFIRMED
