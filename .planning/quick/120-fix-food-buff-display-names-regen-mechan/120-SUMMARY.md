---
phase: quick-120
plan: 01
subsystem: gameplay
tags: [spacetimedb, food-buff, character-effect, regen, hunger]

# Dependency graph
requires:
  - phase: quick-76
    provides: food buff system using CharacterEffect rows (eat_food reducer, food slot items)
provides:
  - eat_food reducer with correct display name 'Well Fed', readable stat labels in log, food-specific regen effectTypes, one-food-at-a-time enforcement
  - regen_health tick that reads food_mana_regen/food_stamina_regen effects and adds to per-tick regen rate
affects: [combat, hunger, group-panel, character-effects]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Food buffs use food-specific effectTypes (food_mana_regen, food_stamina_regen) to avoid conflicting with tick_effects periodic heal handlers"
    - "sourceAbility='Well Fed' as canonical food buff identifier for display and one-at-a-time enforcement"

key-files:
  created: []
  modified:
    - spacetimedb/src/reducers/hunger.ts
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "food_mana_regen and food_stamina_regen effectTypes used instead of mana_regen/stamina_regen to avoid tick_effects periodic heal behavior"
  - "One-food-at-a-time enforced by checking sourceAbility === 'Well Fed' only (not effectType), removing all food buffs before applying new one"
  - "Food regen bonus applied in regen_health tick (not tick_effects) so it boosts per-tick rate, not granting extra periodic heals"

# Metrics
duration: 8min
completed: 2026-02-17
---

# Quick Task 120: Fix Food Buff Display Names and Regen Mechanic Summary

**Food buffs now show 'Well Fed' in group panel, log readable stat labels ('mana regeneration'), enforce one-food-at-a-time, and boost per-tick regen rate instead of granting periodic heal ticks**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-02-17
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Fixed group panel showing raw 'food_buff' string — sourceAbility now 'Well Fed' which effectLabel() returns directly
- Fixed log message showing 'MANA_REGEN' — now uses BUFF_TYPE_LABELS map producing 'mana regeneration', 'stamina regeneration' etc.
- Fixed regen food buffs using periodic heal ticks — food_mana_regen/food_stamina_regen effectTypes bypass tick_effects case handlers and instead augment regen_health per-tick rate
- Fixed multiple food buffs stacking — deletion loop checks only sourceAbility === 'Well Fed' (moved before effectType mapping) to remove ALL food buffs before applying new one
- Module published and bindings regenerated successfully

## Task Commits

1. **Task 1: Fix eat_food reducer** - `8eb7ef4` (fix)
2. **Task 2: Add food regen bonus to regen_health tick** - `74ef58c` (fix)
3. **Task 3: Publish module, generate bindings** - module published, no new file commits needed

## Files Created/Modified

- `spacetimedb/src/reducers/hunger.ts` - BUFF_TYPE_LABELS map, sourceAbility 'Well Fed', food-specific effectTypes, one-food-at-a-time deletion by sourceAbility only
- `spacetimedb/src/reducers/combat.ts` - regen_health now sums food_mana_regen/food_stamina_regen effect magnitudes and adds to per-tick regen

## Decisions Made

- Used `food_mana_regen` / `food_stamina_regen` effectType names instead of overloading `mana_regen` / `stamina_regen` — the existing tick_effects reducer has explicit case handlers for those that grant periodic heals; new names pass through to the generic roundsRemaining decrement, avoiding duplicate healing
- Deletion loop moved BEFORE effectType mapping so it always removes previous food buffs regardless of new food type — handles cross-type replacement (e.g. mana_regen food replacing stamina_regen food)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Build (npm run build) showed pre-existing TypeScript errors in App.vue and composables (readonly array type mismatches, unused imports) — these are unrelated to food buff changes and were present before this task. Module published and generated bindings correctly.

## Next Phase Readiness

- Food buff system fully correct; ready for any future food item additions using wellFedBuffType 'mana_regen' or 'stamina_regen'
- If hp regen food buff is ever needed, add 'food_hp_regen' effectType and handle in regen_health similarly

## Self-Check: PASSED

- FOUND: spacetimedb/src/reducers/hunger.ts
- FOUND: spacetimedb/src/reducers/combat.ts
- FOUND: .planning/quick/120-fix-food-buff-display-names-regen-mechan/120-SUMMARY.md
- FOUND commit: 8eb7ef4 (Task 1)
- FOUND commit: 74ef58c (Task 2)

---
*Phase: quick-120*
*Completed: 2026-02-17*
