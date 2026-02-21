---
phase: quick-243
plan: 01
subsystem: ui
tags: [vue, composables, hotbar, mana, stamina, ux]

requires: []
provides:
  - Client-side resource affordability pre-check in onHotbarClick before reducer call
affects: [hotbar, combat, abilities]

tech-stack:
  added: []
  patterns:
    - "UX guard pattern: check affordability client-side before firing server reducer, with server remaining authoritative"

key-files:
  created: []
  modified:
    - src/composables/useHotbar.ts

key-decisions:
  - "Pre-check uses same cost formula as hotbarTooltipItem (4n + level * 2n + power for mana; 2n + power / 2n for stamina) to keep client display and guard consistent"
  - "Guard fires before runPrediction to avoid optimistic UI on unaffordable cast"
  - "Free abilities (resource = '') are explicitly excluded from the check"

patterns-established:
  - "Resource guard pattern: derive cost from ability template fields, compare to char.mana/stamina, addLocalEvent and return early if insufficient"

requirements-completed:
  - QUICK-243

duration: 5min
completed: 2026-02-21
---

# Quick Task 243: Client-Side Mana/Stamina Check Before Cast Summary

**Instant 'Not enough mana/stamina' feedback in hotbar click handler via client-side affordability guard before server reducer call**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T20:18:00Z
- **Completed:** 2026-02-21T20:23:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Inserted mana and stamina affordability pre-check in `onHotbarClick` just before `runPrediction` and `useAbility`
- Shows "Not enough mana." or "Not enough stamina." instantly via `addLocalEvent` when character cannot afford the ability
- Returns early without calling `useAbility` reducer, eliminating server round-trip for the rejection case
- Free abilities (no resource cost) are completely unaffected

## Task Commits

1. **Task 1: Add resource pre-check to onHotbarClick** - `cfe6952` (feat)

## Files Created/Modified

- `src/composables/useHotbar.ts` - Added 18-line resource affordability guard block in `onHotbarClick` before `runPrediction` call

## Decisions Made

- Used the same cost formula already established in `hotbarTooltipItem` to ensure the tooltip display and the guard are always consistent
- Placed the guard after all existing early-return checks (combatState, resurrect, corpse summon) so special-case abilities are unaffected
- `char` variable reuses `selectedCharacter.value` which is already confirmed non-null at the top of `onHotbarClick`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in `src/App.vue` were confirmed pre-existing (unrelated to this change). No new errors introduced in `useHotbar.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Guard is in place; can be extended to other resource types if new ones are added
- Server-side check is unchanged and remains authoritative

---
*Phase: quick-243*
*Completed: 2026-02-21*
