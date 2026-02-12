---
phase: quick
plan: 6
subsystem: combat
tags: [spacetimedb, typescript, combat-state, ability-system, data-driven]

# Dependency graph
requires:
  - phase: 01-races
    provides: AbilityTemplate table structure
  - phase: 02-hunger
    provides: Combat system with ability execution
provides:
  - Data-driven combat state validation for all abilities via combatState field
  - Generic combat state guards that work for any ability without code changes
affects: [combat, abilities, future-ability-additions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Data-driven ability restrictions using template metadata
    - Centralized combat state definitions in ensureAbilityTemplates

key-files:
  created: []
  modified:
    - spacetimedb/src/index.ts (AbilityTemplate table, ensureAbilityTemplates)
    - spacetimedb/src/reducers/items.ts (use_ability reducer)
    - src/composables/useHotbar.ts (onHotbarClick)
    - src/module_bindings/ability_template_type.ts (generated)

key-decisions:
  - "combatState field uses string values ('any', 'combat_only', 'out_of_combat_only') for flexibility"
  - "Pet summons classified as 'combat_only', Nature's Mark as 'out_of_combat_only', all others as 'any'"
  - "Defense-in-depth: kept Nature's Mark check in executeAbilityAction as secondary guard"

patterns-established:
  - "Pattern: Combat state restrictions defined once in ability template data, enforced on both server and client"
  - "Pattern: New abilities automatically inherit correct combat guards without client/server code changes"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Quick Task 6: Refactor Cooldown Guards & Generalize Combat State Summary

**Data-driven combat state validation eliminates hardcoded ability key lists - all abilities automatically derive restrictions from AbilityTemplate.combatState field**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T14:37:39Z
- **Completed:** 2026-02-12T14:41:29Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Eliminated hardcoded ability key sets (PET_SUMMON_KEYS, OUT_OF_COMBAT_ONLY_KEYS, petSummons) from both client and server
- Added combatState column to AbilityTemplate with 'any', 'combat_only', 'out_of_combat_only' values
- Refactored server use_ability reducer to read combatState from template data
- Refactored client onHotbarClick to read combatState from ability data
- All existing ability behavior preserved (pet summons still require combat, Nature's Mark still requires out-of-combat)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add combatState to AbilityTemplate and populate it** - `7a6f659` (feat)
   - Added combatState column to AbilityTemplate table
   - Created combatOnlyKeys, outOfCombatOnlyKeys, and combatStateFor helper in ensureAbilityTemplates
   - Updated use_ability reducer to use combatState from template instead of hardcoded petSummons set
   - Regenerated client bindings

2. **Task 2: Refactor client useHotbar to use combatState** - `e53aca4` (refactor)
   - Removed PET_SUMMON_KEYS and OUT_OF_COMBAT_ONLY_KEYS constants
   - Replaced hardcoded guards with data-driven combatState lookup from abilityLookup

## Files Created/Modified
- `spacetimedb/src/index.ts` - Added combatState column to AbilityTemplate, populated in ensureAbilityTemplates
- `spacetimedb/src/reducers/items.ts` - Replaced petSummons set with combatState lookup in use_ability reducer
- `src/composables/useHotbar.ts` - Replaced hardcoded key sets with data-driven combatState guards
- `src/module_bindings/ability_template_type.ts` - Generated with new combatState field

## Decisions Made
- **combatState string values:** Used 'any', 'combat_only', 'out_of_combat_only' as string values for flexibility and clarity
- **Pet summon classification:** All 4 pet summon abilities (shaman_spirit_wolf, necromancer_bone_servant, beastmaster_call_beast, summoner_earth_familiar) marked as 'combat_only'
- **Nature's Mark classification:** Marked as 'out_of_combat_only' to prevent in-combat use
- **Defense-in-depth:** Kept Nature's Mark check inside executeAbilityAction (index.ts ~line 2608-2610) as secondary guard alongside the new generic check in use_ability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - refactoring completed smoothly with all tests passing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Combat state validation fully generalized
- New abilities can be added with combat restrictions by simply setting combatState in their template data
- No client or server code changes needed for future combat-restricted abilities
- Pattern established for data-driven ability guards applicable to other ability properties

## Self-Check: PASSED

All files verified:
- FOUND: spacetimedb/src/index.ts
- FOUND: spacetimedb/src/reducers/items.ts
- FOUND: src/composables/useHotbar.ts
- FOUND: src/module_bindings/ability_template_type.ts

All commits verified:
- FOUND: 7a6f659 (Task 1)
- FOUND: e53aca4 (Task 2)

---
*Phase: quick*
*Completed: 2026-02-12*
