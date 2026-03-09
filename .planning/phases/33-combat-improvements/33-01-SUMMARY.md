---
phase: 33-combat-improvements
plan: 01
subsystem: combat
tags: [combat-log, narrative, balance, dot, hot, buff, debuff, scaling]

requires:
  - phase: 31-testing
    provides: Mock DB utilities and test infrastructure for combat helpers
provides:
  - Narrative-style DoT/HoT tick messages with ability names
  - Buff/debuff application and expiry lifecycle events with correct event kinds
  - ABILITY_DAMAGE_SCALER constant (50n) halving ability damage for longer fights
  - MANA_COST_MULTIPLIER constant (150n) increasing mana costs by 50%
  - MANA_MIN_CAST_SECONDS constant (1n) enforcing minimum cast time for mana abilities
  - Client-side buff (blue) and debuff (orange) color rendering
affects: [combat, ui, balance]

tech-stack:
  added: []
  patterns:
    - "Buff/debuff event kinds for combat log color differentiation"
    - "ABILITY_DAMAGE_SCALER as single lever for combat duration tuning"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/helpers/combat.test.ts
    - spacetimedb/src/data/combat_scaling.test.ts
    - src/components/NarrativeMessage.vue

key-decisions:
  - "ABILITY_DAMAGE_SCALER at 50n (halves damage) as primary combat duration lever"
  - "MANA_COST_MULTIPLIER at 150n (50% more expensive) to differentiate mana vs stamina economy"
  - "Mana cast time floor of 1s enforced at resolution time, not generation time"
  - "Buff events use kind='buff' (blue), debuff events use kind='debuff' (orange)"

patterns-established:
  - "Effect lifecycle events: application emits buff/debuff kind, expiry emits system kind with enriched label"
  - "Damage scaling applied in resolveAbility scaledPower() with minimum 1n floor"

requirements-completed: [COMB-01, COMB-02, COMB-03, COMB-04, COMB-07]

duration: 5min
completed: 2026-03-09
---

# Phase 33 Plan 01: Combat Log Narrative Messages and Balance Tuning Summary

**Narrative DoT/HoT tick messages, buff/debuff lifecycle events with color-coded kinds, and ability damage/mana cost rebalancing via ABILITY_DAMAGE_SCALER (50n) and MANA_COST_MULTIPLIER (150n)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T23:26:07Z
- **Completed:** 2026-03-09T23:30:39Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- DoT ticks now say "You suffer X damage from Y" and HoT ticks say "Y soothes you for X HP" with correct event kinds
- Buff/debuff application and expiry events include stat, magnitude, duration info with color-coded kinds (buff=blue, debuff=orange)
- ABILITY_DAMAGE_SCALER halves all ability damage to roughly double combat duration
- MANA_COST_MULTIPLIER makes mana abilities 50% more expensive than base formula
- Mana abilities enforce minimum 1s cast time at resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Combat log narrative messages + buff/debuff lifecycle events** - `fd3d824` (feat)
2. **Task 2: Combat balance tuning - ability damage scaler, mana costs, cast time floor** - `66f98c2` (feat)

## Files Created/Modified
- `spacetimedb/src/helpers/combat.ts` - Narrative messages for addCharacterEffect, buff/debuff application events, ABILITY_DAMAGE_SCALER in scaledPower, mana cost multiplier in abilityResourceCost
- `spacetimedb/src/reducers/combat.ts` - Narrative tick messages in tickEffectsForRound, enriched expiry messages with effect type labels
- `spacetimedb/src/data/combat_scaling.ts` - New constants: ABILITY_DAMAGE_SCALER, MANA_COST_MULTIPLIER, MANA_MIN_CAST_SECONDS
- `spacetimedb/src/helpers/combat.test.ts` - 9 new tests: 6 narrative message tests + 3 mana cost tests
- `spacetimedb/src/data/combat_scaling.test.ts` - 8 new tests for balance constants and scaling behavior
- `src/components/NarrativeMessage.vue` - Added buff (#74c0fc) and debuff (#ffa94d) to KIND_COLORS

## Decisions Made
- ABILITY_DAMAGE_SCALER set to 50n (halves damage) as primary combat duration lever -- auto-attacks unaffected
- MANA_COST_MULTIPLIER set to 150n (50% cost increase) to differentiate mana vs stamina economy
- Mana cast time floor enforced at resolution time (in scaledPower) rather than at ability generation -- catches existing 0-cast abilities
- Buff/debuff event kinds separate from existing damage/heal kinds for independent color control

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Combat balance constants are tunable single-lever adjustments
- All 302 tests pass with zero regressions
- Ready for Phase 33 Plan 02 (if any)

---
*Phase: 33-combat-improvements*
*Completed: 2026-03-09*
