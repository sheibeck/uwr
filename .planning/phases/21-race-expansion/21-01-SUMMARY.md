---
phase: 21-race-expansion
plan: 01
subsystem: database
tags: [spacetimedb, race, character, schema, typescript]

# Dependency graph
requires:
  - phase: 20-quick-fixes
    provides: stable module baseline to build race expansion on top of
provides:
  - Race table with bonus1Type/bonus1Value/bonus2Type/bonus2Value flexible dual-bonus schema
  - 15 seeded races (11 unlocked, 4 locked) in published SpacetimeDB module
  - Character table with 9 optional racial bonus columns
  - computeRacialContributions() helper for dispatching bonus types at character creation
  - recomputeCharacterDerived incorporating racialMaxHp/Mana/Crit/Armor/Dodge
affects:
  - 21-02 (level-up racial stacking uses computeRacialContributions)
  - 21-03 (UI race picker reads unlocked field; combat reads racialSpellDamage/racialPhysDamage)
  - client bindings (race_type.ts updated with new field names)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flexible dual-bonus schema: bonus1Type/bonus1Value/bonus2Type/bonus2Value string+u64 pair per race"
    - "Optional racial columns on Character table: set to undefined (null) when 0n to keep DB clean"
    - "computeRacialContributions() dispatcher: switch on bonusType string, accumulates into typed result object"

key-files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/data/races.ts
    - spacetimedb/src/reducers/characters.ts
    - spacetimedb/src/helpers/character.ts
    - src/module_bindings/race_type.ts
    - src/module_bindings/race_table.ts
    - src/module_bindings/character_type.ts
    - src/module_bindings/character_table.ts
    - src/module_bindings/index.ts

key-decisions:
  - "Flexible dual-bonus schema (bonus1Type/bonus1Value/bonus2Type/bonus2Value) instead of fixed stat columns — extensible, models exactly 2 bonuses cleanly"
  - "Optional Character racial columns set to undefined (not 0n) when race bonus is 0 — keeps DB null for missing values, avoids false data"
  - "computeRacialContributions() placed in characters.ts — simplest location, reusable by future level-up stacking logic in Plan 02"
  - "racialSpellDamage/racialPhysDamage NOT included in recomputeCharacterDerived — read directly by combat code (Plan 02 Task 3)"
  - "racialManaRegen/racialStaminaRegen NOT included in recomputeCharacterDerived — read in regen path (Plan 02 Task 2)"
  - "4 locked races (Dark-Elf, Half-Giant, Cyclops, Satyr) seeded with unlocked=false — completely hidden in UI until admin /unlockrace command"

patterns-established:
  - "Bonus type string key convention: stat_str/stat_dex/stat_int/stat_wis/stat_cha/spell_damage/phys_damage/max_hp/max_mana/mana_regen/stamina_regen/crit_chance/armor/dodge"
  - "New optional Character columns use undefined (not 0n) for absent values"

requirements-completed:
  - RACE-EXP-01
  - RACE-EXP-02
  - RACE-EXP-04
  - RACE-EXP-05

# Metrics
duration: 16 min
completed: 2026-02-20
---

# Phase 21 Plan 01: Race Expansion Schema Summary

**Race table migrated to flexible dual-bonus schema (bonus1Type/bonus1Value/bonus2Type/bonus2Value), 15 races seeded (11 unlocked, 4 locked) with module published clean and client bindings regenerated**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-20T04:15:19Z
- **Completed:** 2026-02-20T04:31:24Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Replaced 5 stat-bonus columns on Race table with 4-column flexible bonus system (bonus1Type/bonus1Value/bonus2Type/bonus2Value)
- Added 9 optional racial bonus columns to Character table (racialSpellDamage, racialPhysDamage, racialMaxHp, racialMaxMana, racialManaRegen, racialStaminaRegen, racialCritBonus, racialArmorBonus, racialDodgeBonus)
- Expanded RACE_DATA from 4 races to 15 races with dual-bonus entries; 4 races locked (Dark-Elf, Half-Giant, Cyclops, Satyr)
- Added computeRacialContributions() helper; wired racial bonuses into create_character (maxHp, maxMana, armorClass, dodge, crit) and recomputeCharacterDerived
- Published module with --clear-database; 15 races confirmed in DB via SQL; client bindings regenerated with new Race type

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate Race table schema and add Character racial bonus columns** - `a6e0e66` (feat)
2. **Task 2: Expand RACE_DATA to 15 races with new schema** - `7a11221` (feat)
3. **Task 3: Update create_character, recomputeCharacterDerived, publish, regenerate bindings** - `d5fdebe` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `spacetimedb/src/schema/tables.ts` - Race table schema replaced (5 old stat columns -> 4 new flexible columns); 9 optional racial columns added to Character table
- `spacetimedb/src/data/races.ts` - RACE_DATA completely replaced with 15 races in new dual-bonus format; ensureRaces function kept unchanged
- `spacetimedb/src/reducers/characters.ts` - Added computeRacialContributions() helper function; updated create_character to use new racial bonus system
- `spacetimedb/src/helpers/character.ts` - Updated recomputeCharacterDerived to read and apply racial bonus columns (maxHp, maxMana, crit, armor, dodge)
- `src/module_bindings/race_type.ts` - Regenerated: now has bonus1Type/bonus1Value/bonus2Type/bonus2Value (no strBonus/dexBonus)
- `src/module_bindings/race_table.ts` - Regenerated with new Race schema
- `src/module_bindings/character_type.ts` - Regenerated: now includes 9 optional racial bonus fields
- `src/module_bindings/character_table.ts` - Regenerated with new Character schema
- `src/module_bindings/index.ts` - Regenerated (includes new inactivity_tick and sweep_inactivity bindings)
- `src/module_bindings/inactivity_tick_table.ts` - Newly generated binding
- `src/module_bindings/inactivity_tick_type.ts` - Newly generated binding
- `src/module_bindings/sweep_inactivity_reducer.ts` - Newly generated binding

## Decisions Made

- Used flexible string+u64 bonus type columns instead of expanding stat-specific columns — future bonus types can be added without schema changes
- Set racial bonus columns to `undefined` (not `0n`) when value is zero — keeps DB null for missing values, more semantically correct
- Placed `computeRacialContributions()` in characters.ts (not a separate helper file) — minimizes file count, function is directly consumed by create_character and will be reused by Plan 02's level-up stacking
- Did not include racialSpellDamage/racialPhysDamage/racialManaRegen/racialStaminaRegen in recomputeCharacterDerived — these are read directly by combat/regen code paths per plan specification

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in other files (combat.ts, corpse.ts, location.ts) are unrelated to race schema changes and were present before this plan. These are out-of-scope and logged to deferred items.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Race schema foundation complete; Plan 02 (level-up racial stacking) can proceed — `computeRacialContributions()` is already in place and reusable
- Client bindings regenerated; UI team can reference `bonus1Type`/`bonus1Value` fields from Race table
- 4 locked races in DB; `/unlockrace` admin command can be added in Plan 03
- racialSpellDamage/racialPhysDamage columns on Character rows ready for Plan 02 combat wiring

---
*Phase: 21-race-expansion*
*Completed: 2026-02-20*
