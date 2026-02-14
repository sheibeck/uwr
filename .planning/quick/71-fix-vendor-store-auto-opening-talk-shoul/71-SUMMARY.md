---
phase: quick-71
plan: 01
subsystem: ui-vendors
tags: [bugfix, vendor, interaction, context-menu]
dependency_graph:
  requires: []
  provides: [vendor-interaction-separation]
  affects: [npc-dialog, vendor-store]
tech_stack:
  added: []
  patterns: [event-handler-simplification]
key_files:
  created: []
  modified:
    - src/App.vue
decisions: []
metrics:
  duration: ~3min
  completed: 2026-02-14T00:59:44Z
---

# Quick Task 71: Fix Vendor Store Auto-Opening

Remove vendor store auto-open from Talk and /hail interactions - only "Open Store" context menu should open vendor panel.

## One-liner

Decoupled NPC dialog from vendor store opening by removing auto-open logic from hailNpc and onNpcHail handlers.

## What Changed

### Task 1: Remove vendor auto-open from Talk and /hail paths

**Changes made:**
- **src/App.vue (lines 1044-1048):** Simplified `onNpcHail` callback from conditional vendor panel logic to empty no-op function
- **src/App.vue (lines 1105-1112):** Removed vendor auto-open logic from `hailNpc` function - now only calls `hailNpcReducer` without checking NPC type or opening vendor panel

**Behavior after fix:**
- "Talk" context menu option: Shows NPC dialog text only (no store panel)
- "/hail <vendor>" command: Shows NPC dialog text only (no store panel)
- "Open Store" context menu option: Opens vendor panel (via separate 'open-vendor' event) + shows dialog text

**Key implementation detail:**
The "Open Store" context menu in LocationGrid.vue emits both 'hail' (for dialog) and 'open-vendor' (for store) events. With the hailNpc fix, the 'hail' emission no longer auto-opens the store, while the 'open-vendor' emission correctly handles store opening via the existing `openVendor` handler.

## Verification

- Code review: `hailNpc` function has no `openVendor` calls or vendor type checks
- Code review: `onNpcHail` callback is now a no-op with no panel opening logic
- Code review: `openVendor` function (line 1078) remains unchanged for "Open Store" path
- No TypeScript errors introduced by changes (verified with grep for function names in build output)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

File verification:
```
FOUND: src/App.vue (modified)
```

Commit verification:
```
FOUND: 089ddfc
```

Commit details:
- 089ddfc: fix(quick-71): remove vendor store auto-open from Talk and /hail
