---
phase: quick-100
plan: 01
subsystem: ui
tags: [z-index, tooltips, panels, floating-ui]
dependency_graph:
  requires: []
  provides: [tooltip-always-visible]
  affects: [floating-panels, tooltips, context-menus]
tech_stack:
  added: []
  patterns: [z-index-ceiling, automatic-reset]
key_files:
  created: []
  modified:
    - src/ui/styles.ts
    - src/composables/usePanelManager.ts
decisions:
  - Tooltip z-index set to 9998 (above panels, below context menus/footer)
  - Panel z-index ceiling at 5000 with automatic reset
  - Reset preserves relative ordering by sorting panels by current z-index
metrics:
  duration_seconds: 39
  completed_date: 2026-02-16
---

# Quick Task 100: Fix Hotbar Tooltip Appearing Behind Adjacent Items

**One-liner:** Tooltip z-index raised to 9998 with panel z-index ceiling at 5000 preventing tooltips from ever being hidden behind floating panels.

## Problem Statement

When hovering over hotbar ability slots, the tooltip with ability description appeared behind other floating panels (e.g., group, location, inventory panels), making it unreadable. The root cause was that the tooltip z-index (1000) could be exceeded by floating panel z-indexes which increment without bound (starting at 10, +1 per click). In a typical play session with many panel interactions, panel z-indexes easily surpassed 1000.

## Solution

Two changes implemented:

1. **Tooltip z-index raised to 9998** - Well above any reachable panel z-index, but below context menus (9999) and footer (10000) to maintain proper UI layering hierarchy
2. **Panel z-index ceiling at 5000** - When `topZ` reaches 5000, all panel z-indexes are recalculated relative to their current ordering, starting from 10 again

## Implementation Details

### src/ui/styles.ts
- Changed `tooltip.zIndex` from `1000` to `9998`

### src/composables/usePanelManager.ts
- Added z-index ceiling check in `bringToFront()` function
- When `topZ.value > 5000`:
  - Collect all panels with current z-indexes
  - Sort by z-index ascending (preserves relative ordering)
  - Reassign z-indexes starting from 10 (10, 11, 12, ...)
  - Update `topZ.value` to `10 + panel count`
  - Re-apply current panel to top with new highest z-index

## Z-Index Hierarchy

Final z-index layer cake (bottom to top):

- Floating panels: **10-5000** (dynamic, resets when ceiling reached)
- Tooltip: **9998** (fixed)
- Context menu: **9999** (fixed)
- Footer: **10000** (fixed, establishes stacking context)

## Deviations from Plan

None - plan executed exactly as written.

## Commits

- **f55c19a**: fix(quick-100): fix hotbar tooltip z-index and cap panel z-index growth

## Self-Check: PASSED

Files exist:
```bash
$ [ -f "src/ui/styles.ts" ] && echo "FOUND: src/ui/styles.ts" || echo "MISSING: src/ui/styles.ts"
FOUND: src/ui/styles.ts

$ [ -f "src/composables/usePanelManager.ts" ] && echo "FOUND: src/composables/usePanelManager.ts" || echo "MISSING: src/composables/usePanelManager.ts"
FOUND: src/composables/usePanelManager.ts
```

Commits exist:
```bash
$ git log --oneline --all | grep -q "f55c19a" && echo "FOUND: f55c19a" || echo "MISSING: f55c19a"
FOUND: f55c19a
```

## Verification Notes

To verify fix:
1. Open the game, open multiple panels (hotbar, group, location, inventory)
2. Click several panels multiple times to increase their z-indexes
3. Hover over hotbar ability slots - tooltip should appear above all panels
4. Right-click an inventory item - context menu should appear above tooltip
5. Type in command input - autocomplete dropdown should appear above tooltip (footer z-index 10000)

Expected behavior:
- Tooltip always visible above all floating panels regardless of click history
- Context menus and footer UI elements still render above tooltip
- Panel bring-to-front still works correctly even after z-index reset at 5000 ceiling
