---
phase: quick-233
plan: 01
subsystem: ui
tags: [vue, hotbar, tooltip, abilities, combat]

# Dependency graph
requires: []
provides:
  - "Hotbar ability tooltips show resource cost, cast time, and cooldown duration"
affects: [hotbar, ui, combat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tooltip stats array: append Cost/Cast/Cooldown lines computed from AbilityTemplateRow fields"
    - "Cost mirrors server-side formulas: mana = 4 + level*2 + power, stamina = 2 + power/2"

key-files:
  created: []
  modified:
    - src/composables/useHotbar.ts

key-decisions:
  - "Cost formulas mirrored from spacetimedb/src/helpers/combat.ts (abilityResourceCost and staminaResourceCost) to keep client display in sync with server truth"
  - "Resources other than mana/stamina show 'Free' (covers none, free, passive, empty string)"
  - "Cooldown and cast values fall back through liveAbility then slot fields for robustness"

patterns-established:
  - "Tooltip stat computation: derive display values from abilityLookup data at render time, not stored state"

requirements-completed: [Q-233]

# Metrics
duration: 5min
completed: 2026-02-21
---

# Quick Task 233: Hotbar Ability Tooltip Shows Cost, Cast Time, and Cooldown

**Hotbar ability tooltips now show resource cost (e.g. '12 mana', '6 stamina', 'Free'), cast time ('2s' or 'Instant'), and cooldown ('8s' or 'No cooldown') computed from AbilityTemplateRow fields**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-21T00:00:00Z
- **Completed:** 2026-02-21T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added Cost stat to hotbar tooltip using server-mirrored formulas: mana = `4 + level*2 + power`, stamina = `2 + power/2`, otherwise "Free"
- Added Cast stat showing cast duration in seconds or "Instant"
- Added Cooldown stat showing cooldown duration in seconds or "No cooldown"
- Tooltip now shows 6 stat lines: Level, Type, Resource, Cost, Cast, Cooldown

## Task Commits

1. **Task 1: Add cost, cast time, and cooldown to hotbarTooltipItem** - `0eac176` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `src/composables/useHotbar.ts` - Extended `hotbarTooltipItem` to compute and append Cost, Cast, and Cooldown stats from ability template data

## Decisions Made
- Cost formulas mirrored directly from `spacetimedb/src/helpers/combat.ts` (`abilityResourceCost` and `staminaResourceCost`) to ensure client display matches server behavior
- Resources other than `mana` or `stamina` display as "Free" — covers passive, utility, and free abilities uniformly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Pre-existing TypeScript errors in `src/App.vue` (unrelated readonly array incompatibilities) were present before and after this change — scoped out per boundary rules.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tooltip displays all three new fields for every filled hotbar slot
- No server changes needed — all data was already available in `AbilityTemplateRow`

---
*Phase: quick-233*
*Completed: 2026-02-21*
