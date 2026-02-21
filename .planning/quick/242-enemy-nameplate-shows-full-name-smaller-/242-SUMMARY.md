---
phase: quick-242
plan: 01
subsystem: ui
tags: [vue, combat, enemy, nameplate, context-menu]

# Dependency graph
requires: []
provides:
  - Enemy nameplate shows full role-qualified name (e.g. "Night Rat Scrapper")
  - Level badge rendered as small muted suffix, visually subordinate to enemy name
  - Right-click context menu on enemies no longer shows Members item
affects: [combat, LocationGrid]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive display name from template + role at the composable layer, pass as string to component"
    - "Split compound display fields into separate spans with individual style control"

key-files:
  created: []
  modified:
    - src/composables/useCombat.ts
    - src/components/LocationGrid.vue

key-decisions:
  - "Full name (template + role) derived in availableEnemies computed, not in the template"
  - "Members context menu block deleted entirely rather than hidden — groupCount is always 1 post-quick-238"

patterns-established:
  - "Name derivation: pick roleTemplate from members[0], concat template.name + role.displayName"

requirements-completed: [QUICK-242]

# Metrics
duration: 10min
completed: 2026-02-21
---

# Phase quick-242 Plan 01: Enemy Nameplate Full Name Summary

**Enemy nameplate now shows role-qualified names like "Night Rat Scrapper" with a small muted level badge, and the dead Members context menu item is removed.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `availableEnemies` in useCombat.ts now derives full names by combining template name + role `displayName`
- Enemy nameplate in LocationGrid.vue splits name and level into separate `<span>` elements — name retains con color, level shown at 65% font size and 55% opacity
- Deleted the `if (enemy.memberNames ...)` block from `openEnemyContextMenu` — the dead affordance is gone

## Task Commits

1. **Task 1: Derive full enemy name in useCombat.ts availableEnemies** - `ad4d430` (feat)
2. **Task 2: Nameplate visual polish and remove Members from context menu** - `36a53f9` (feat)

## Files Created/Modified
- `src/composables/useCombat.ts` - Added roleTemplate lookup and fullName assembly before the return object in `availableEnemies`
- `src/components/LocationGrid.vue` - Split nameplate span, styled level badge, removed Members push block

## Decisions Made
- Full name derived at composable layer (useCombat) rather than in the Vue template — keeps templates simple and testable
- Members block deleted rather than conditionally hidden — the data is always empty post-quick-238, keeping dead code out is cleaner

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - pre-existing type errors in App.vue (unrelated readonly/mutable mismatches) were present before and after; no new errors introduced.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Enemy tiles now present full identity (name + level) cleanly
- Context menu is minimal: only Careful Pull and Aggressive Pull remain
- No blockers for future combat UI improvements

---
*Phase: quick-242*
*Completed: 2026-02-21*
