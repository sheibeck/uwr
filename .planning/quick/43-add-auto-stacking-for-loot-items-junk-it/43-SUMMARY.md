---
phase: quick-43
plan: 1
subsystem: inventory
tags: [loot, stacking, items, inventory-management]

# Dependency graph
requires:
  - phase: initial-inventory
    provides: addItemToInventory stacking logic, ItemTemplate.stackable field
provides:
  - Junk item templates configured as stackable (Rat Tail, Torn Pelt, Cracked Fang, Ashen Bone)
affects: [loot-system, inventory-ux, combat-rewards]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts

key-decisions:
  - "Junk items now stackable via seed data change only - no infrastructure changes needed"

patterns-established: []

# Metrics
duration: 3min
completed: 2026-02-13
---

# Quick Task 43: Auto-Stacking for Loot Items (Junk)

**Junk loot items (Rat Tail, Torn Pelt, Cracked Fang, Ashen Bone) now auto-stack when looted, matching gatherable resource behavior**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T00:29:00Z (approx)
- **Completed:** 2026-02-13T00:32:39Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Changed junk item template seed data from `stackable: false` to `stackable: true`
- Verified existing `addItemToInventory` logic already handles stacking correctly
- Confirmed gear items (weapons, armor, accessories) remain `stackable: false`

## Task Commits

Each task was committed atomically:

1. **Task 1: Set junk item templates to stackable** - `c108744` (feat)

## Files Created/Modified
- `spacetimedb/src/index.ts` - Changed junk template seeding (line 3489) from `stackable: false` to `stackable: true`

## Decisions Made

None - followed plan as specified. The plan correctly identified that only the seed data needed changing, as the stacking infrastructure already exists in `addItemToInventory` (checks `template.stackable` and merges into existing stacks).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The change was a simple one-line modification. Pre-existing TypeScript compilation errors exist in the codebase but are unrelated to this change.

## User Setup Required

None - no external service configuration required. After publishing the module and calling `sync_equipment_tables` or `sync_all_content`, the updated junk templates will take effect and looted junk items will auto-stack.

## Next Phase Readiness

Junk item stacking complete. Players will see immediate inventory management improvement when looting junk items from combat, as they'll now merge into existing stacks instead of filling separate bag slots.

## Self-Check

Verification of deliverables:

**Files exist:**
- spacetimedb/src/index.ts modified (junk templates at line 3489 now have stackable: true)

**Commits exist:**
- c108744: feat(quick-43): make junk items stackable

**Stackable verification:**
```
Junk items (line 3489): stackable: true ✓
Armor items (lines 3338, 3360, 3382, 3424, 3457): stackable: false ✓
Resource items (lines 3543, 3573, 3615, 3685): stackable: true (unchanged) ✓
```

## Self-Check: PASSED

---
*Phase: quick-43*
*Completed: 2026-02-13*
