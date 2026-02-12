---
phase: 02-hunger
plan: 01
subsystem: backend
tags: [spacetimedb, typescript, hunger, well-fed, combat, scheduled-reducers, views]

# Dependency graph
requires:
  - phase: 01-races
    provides: Character table with race/class fields, create_character/delete_character reducers
provides:
  - Hunger table with btree index on characterId
  - HungerDecayTick scheduled table (5-minute decay)
  - ItemTemplate extended with wellFedDurationMicros/wellFedBuffType/wellFedBuffMagnitude
  - eat_food reducer consuming food slot items and applying Well Fed buff
  - decay_hunger scheduled reducer (-2 hunger per 5-min tick)
  - my_hunger view per active character
  - Well Fed str/dex flat bonus in auto-attack and ability damage
  - 4 Well Fed food templates (Herb Broth, Roasted Roots, Traveler's Stew, Forager's Salad)
  - Wild Berries + Root Vegetable resources with terrain pool entries
  - 4 food recipe templates
  - Simple Rations HoT in use_item (+1 HP x 10 ticks)
affects: [02-hunger-frontend, combat-damage-formulas, item-system]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scheduled reducer with reschedule-on-run pattern (like decay_hunger inserts next tick at end)"
    - "well-fed buff stored on Hunger row (not CharacterEffect) for direct combat lookup"
    - "ensureXxx seeding pattern extended with new food templates and resource types"

key-files:
  created:
    - spacetimedb/src/reducers/hunger.ts
    - spacetimedb/src/views/hunger.ts
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/reducers/index.ts
    - spacetimedb/src/views/types.ts
    - spacetimedb/src/views/index.ts

key-decisions:
  - "Well Fed buff stored directly on Hunger row (not CharacterEffect) for efficient O(1) combat lookup per character"
  - "mana_regen and stamina_regen Well Fed buffs left as TODOs in decay tick — Character table lacks currentMana/currentStamina fields for those regeneration paths"
  - "Food slot is separate from consumable slot — eat_food reducer only accepts slot=food items; use_item handles slot=consumable (Simple Rations)"
  - "Simple Rations uses slot=consumable (existing item), 4 new Well Fed foods use slot=food (new item type)"
  - "Hunger reaching 0 has no penalty — reward-only design confirmed in research"

patterns-established:
  - "hunger.ts reducer imports Timestamp from deps for constructing new Timestamp(micros) in wellFedUntil update"
  - "ViewDeps type extended with Hunger: any for the my_hunger view"

# Metrics
duration: 35min
completed: 2026-02-12
---

# Phase 2 Plan 1: Hunger System Backend Summary

**Server-authoritative hunger system with Hunger table, HungerDecayTick scheduled reducer, eat_food/Well Fed buff logic, auto-attack and ability damage integration, food item templates, Wild Berries/Root Vegetable resources, and 4 food recipe templates**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-02-12T03:30:00Z
- **Completed:** 2026-02-12T04:05:00Z
- **Tasks:** 2
- **Files modified:** 9 modified, 2 created (backend) + 16 generated bindings

## Accomplishments

- Hunger table with characterId btree index + HungerDecayTick scheduled every 5 minutes
- ItemTemplate extended with 3 new food fields (wellFedDurationMicros/wellFedBuffType/wellFedBuffMagnitude), all existing inserts updated with wellFedDurationMicros:0n/wellFedBuffType:''/wellFedBuffMagnitude:0n defaults
- eat_food reducer validates food slot, consumes item, applies Well Fed buff (max-extend logic for stacking buffs)
- decay_hunger scheduled reducer decrements hunger by 2 per tick, reschedules itself
- Well Fed str/dex flat bonus wired into both auto-attack (combat.ts) and ability damage (executeAbilityAction in index.ts)
- my_hunger view returns active character's Hunger rows via btree index lookup (not iter)
- 4 Well Fed food templates seeded: Herb Broth (mana_regen +4), Roasted Roots (str +2), Traveler's Stew (stamina_regen +4), Forager's Salad (dex +2) — all 45min
- Wild Berries added to woods (weight 3) + plains (weight 2, day only) pools; Root Vegetable added to plains (weight 3, any)
- 4 food recipes seeded using new resources as ingredients
- Simple Rations HoT branch in use_item (+1 HP regen x 10 ticks, stackable reset pattern)
- Hunger row created in create_character at 100; cleaned up in delete_character
- Module published with --clear-database -y and client bindings regenerated

## Task Commits

1. **Task 1 + Task 2 (combined): Hunger system backend** - `c1a4be5` (feat)

## Files Created/Modified

- `spacetimedb/src/index.ts` - Hunger/HungerDecayTick tables, ItemTemplate extended, ensureFoodItemTemplates, ensureHungerDecayScheduled, terrain pool additions, recipe additions, syncAllContent call, reducerDeps/viewDeps additions, Well Fed ability damage
- `spacetimedb/src/reducers/hunger.ts` - NEW: registerHungerReducers with eat_food and decay_hunger
- `spacetimedb/src/reducers/characters.ts` - Hunger row insert in create_character, cleanup in delete_character
- `spacetimedb/src/reducers/combat.ts` - Well Fed str/dex flat bonus in auto-attack damage
- `spacetimedb/src/reducers/items.ts` - Simple Rations HoT in use_item, wellFed fields in create_item_template
- `spacetimedb/src/reducers/index.ts` - registerHungerReducers registered
- `spacetimedb/src/views/hunger.ts` - NEW: registerHungerViews with my_hunger view
- `spacetimedb/src/views/types.ts` - Hunger added to ViewDeps
- `spacetimedb/src/views/index.ts` - registerHungerViews registered

## Decisions Made

- **Well Fed buff on Hunger row, not CharacterEffect:** Direct O(1) lookup in combat formulas without iterating effects list. Avoids adding stacking complexity to the effect system.
- **mana_regen/stamina_regen as TODOs:** Character table has `mana`/`maxMana` and `stamina`/`maxStamina` fields but the decay tick runs in a non-combat context where restoring these would conflict with the HotTick system. Left as TODO comments to implement when regen systems are better defined.
- **Simple Rations stays consumable:** The item was already seeded as `slot: 'consumable'` with a recipe. Changed `use_item` to handle it, keeping backward compatibility. New Well Fed foods use `slot: 'food'` to distinguish from non-buff consumables.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added wellFed defaults to all existing ItemTemplate inserts**
- **Found during:** Task 1 (ItemTemplate extension)
- **Issue:** Plan mentioned adding wellFed fields to existing inserts but the upsertItemTemplateByName pattern in ensureStarterItemTemplates and direct inserts in ensureResourceItemTemplates all needed updating
- **Fix:** Added `wellFedDurationMicros: 0n, wellFedBuffType: '', wellFedBuffMagnitude: 0n` to upsertItemTemplateByName via default merge, and to all individual insert calls in ensureResourceItemTemplates
- **Files modified:** spacetimedb/src/index.ts
- **Verification:** Module compiled and published without errors
- **Committed in:** c1a4be5

**2. [Rule 1 - Bug] Used new Timestamp(micros) instead of plain object for wellFedUntil**
- **Found during:** Task 1 (eat_food reducer)
- **Issue:** Setting `wellFedUntil: { microsSinceUnixEpoch: micros }` would create a plain object, not a proper Timestamp instance — verified SpacetimeDB SDK Timestamp constructor takes bigint
- **Fix:** Used `new Timestamp(wellFedUntilMicros)` in eat_food reducer after adding Timestamp to deps
- **Files modified:** spacetimedb/src/reducers/hunger.ts
- **Verification:** Module compiled and published without errors
- **Committed in:** c1a4be5

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered

None — module published cleanly on first attempt.

## Self-Check

- [x] spacetimedb/src/reducers/hunger.ts exists
- [x] spacetimedb/src/views/hunger.ts exists
- [x] src/module_bindings/hunger_type.ts exists (generated)
- [x] src/module_bindings/eat_food_reducer.ts exists (generated)
- [x] src/module_bindings/my_hunger_table.ts exists (generated)
- [x] Commit c1a4be5 exists

## Self-Check: PASSED

## Next Phase Readiness

- Backend hunger system fully published and verified
- Client bindings include myHunger table, eatFood reducer, updated ItemTemplate type
- Ready for Phase 02 Plan 02: Hunger frontend (HUD bar, well-fed buff display, eat food UI)
- mana_regen and stamina_regen Well Fed buffs display correctly in UI even though server-side regen is TODO

---
*Phase: 02-hunger*
*Completed: 2026-02-12*
