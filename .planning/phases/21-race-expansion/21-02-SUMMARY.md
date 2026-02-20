---
phase: 21-race-expansion
plan: 02
subsystem: combat
tags: [spacetimedb, race, combat, level-up, racial-bonuses, typescript]

# Dependency graph
requires:
  - phase: 21-race-expansion
    provides: Race table with bonus1Type/bonus1Value/bonus2Type/bonus2Value; Character table with 9 optional racial bonus columns; computeRacialContributions() helper
provides:
  - awardXp preserves and stacks racial bonuses at every level-up using flat additive formula
  - level_character admin reducer applies identical flat additive racial bonus formula
  - /unlockrace admin command with world broadcast and private confirmation
  - racialManaRegen/racialStaminaRegen wired into regen tick
  - racialSpellDamage/racialPhysDamage wired into executeAbility single-target hit loop
affects:
  - 21-03 (UI race panel, client reads updated character racial bonus fields)
  - combat system (all characters now correctly receive racial bonuses on level-up)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat additive racial stacking: baseValue + (baseValue / 2n) * (level / 2n) — full base at creation, half-base increment per even level"
    - "Race row lookup by name string: [...ctx.db.race.iter()].find(r => r.name === character.race)"
    - "Optional racial column preservation: set to undefined when 0n to keep DB clean"

key-files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/commands.ts
    - spacetimedb/src/reducers/combat.ts

key-decisions:
  - "Flat additive stacking: full baseValue at creation + floor(baseValue/2) per even level — simple, predictable, transparent"
  - "Race lookup by name string (not ID): character.race stores display name, iterate race table to find matching row"
  - "Single-target path only for racial damage bonus: AoE path unchanged for simplicity, can be added later"
  - "racialDamageBonus routed by damageType string before the raw calculation — consistent with existing totalDamageUp pattern"

patterns-established:
  - "Racial bonus stacking pattern: accumulateRacialBonus/applyRacialBonus switch on bonusType string to dispatch to typed out-object"
  - "Even-level detection: newLevel % 2n === 0n (BigInt modulo)"

requirements-completed:
  - RACE-EXP-03
  - RACE-EXP-04
  - RACE-EXP-05

# Metrics
duration: 12 min
completed: 2026-02-20
---

# Phase 21 Plan 02: Race Expansion Combat Wiring Summary

**awardXp and level_character both now apply flat additive racial stat stacking (full base at level 1 + half-base per even level), /unlockrace admin command broadcasts world event, racialManaRegen/racialStaminaRegen flow into the regen tick, and racialSpellDamage/racialPhysDamage are added per hit in executeAbility**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-20T04:46:40Z
- **Completed:** 2026-02-20T04:58:33Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Fixed the level-up racial bonus bug: awardXp now looks up the character's race row, computes flat additive stacking formula (`baseValue + (baseValue / 2n) * evenApplications`), and updates all 9 optional racial bonus columns on every level-up
- Fixed the level_character admin reducer with identical flat additive formula so /level command matches natural XP gain behavior
- Implemented /unlockrace admin command with requireAdmin guard, world broadcast via appendWorldEvent, private confirmation, and "not found" error message
- Wired character.racialManaRegen and character.racialStaminaRegen into regen_health tick alongside food regen effects
- Wired racialSpellDamage (for magic abilities) and racialPhysDamage (for physical abilities) as flat per-hit bonuses in executeAbility single-target loop
- Module published to local SpacetimeDB without --clear-database (no schema changes in this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix awardXp level-up bug and add even-level racial bonus stacking** - `6f4d8c8` (fix)
2. **Task 2: Fix level_character, add /unlockrace command, wire racial regen** - `27462ca` (feat)
3. **Task 3: Wire racialSpellDamage/racialPhysDamage into executeAbility** - `4e26707` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `spacetimedb/src/helpers/combat.ts` - Fixed awardXp: race row lookup + flat additive stacking for all 9 racial bonus columns + even-level notification; fixed executeAbility single-target hit loop to add racialSpellDamage/racialPhysDamage per hit
- `spacetimedb/src/reducers/commands.ts` - Added appendWorldEvent import; fixed level_character reducer with same racial stacking formula; added /unlockrace command with world broadcast
- `spacetimedb/src/reducers/combat.ts` - Added character.racialManaRegen and character.racialStaminaRegen to regen_health tick after CharacterEffect food regen loop

## Decisions Made

- Used flat additive stacking formula (`baseValue + (baseValue / 2n) * evenApplications`) — same formula in both awardXp and level_character to keep behavior consistent between natural and admin level-up
- Race row lookup by name string iteration: character.race is a display name string, not a foreign key ID, so iterate race table and find by name match
- Single-target path only for racial damage bonuses: AoE path uses a different computation (`aoeDamage` before the hit loop) — wiring AoE deferred to future plan
- racialDamageBonus computed inside the hit loop (after dmgType is determined) to correctly route spell vs physical bonus per hit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in combat.ts (line 2052), corpse.ts, location.ts, auth.ts, characters.ts, items.ts, movement.ts, social.ts, and ensure_enemies.ts were present before this plan and are out of scope. The module publishes successfully despite these tsc errors (SpacetimeDB uses its own bundler). None of the errors are in code modified by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Racial bonus system fully wired into all game paths: character creation (Plan 01), level-up via XP, level-up via /level command, regen tick, and combat hit calculation
- /unlockrace admin command ready for use in production
- Plan 03 (UI race picker) can proceed: unlocked field on Race table controls visibility; racial bonus columns on Character are populated correctly after level-ups

## Self-Check: PASSED

- `spacetimedb/src/helpers/combat.ts` - FOUND
- `spacetimedb/src/reducers/commands.ts` - FOUND
- `spacetimedb/src/reducers/combat.ts` - FOUND
- `.planning/phases/21-race-expansion/21-02-SUMMARY.md` - FOUND
- Commit `6f4d8c8` (Task 1: fix awardXp) - FOUND
- Commit `27462ca` (Task 2: fix level_character, /unlockrace, regen) - FOUND
- Commit `4e26707` (Task 3: wire executeAbility racial damage) - FOUND
- Module published successfully to local SpacetimeDB

---
*Phase: 21-race-expansion*
*Completed: 2026-02-20*
