---
phase: 221-fix-mana-regen
plan: 01
subsystem: combat
tags: [bug-fix, mana-regen, gear-bonuses, racial-bonuses, admin-tools]
dependency_graph:
  requires: []
  provides: [gear-mana-regen-in-tick, recompute-racial-admin]
  affects: [regen_health, character-stats]
tech_stack:
  added: []
  patterns: [gear-bonus-lookup-per-tick]
key_files:
  created: []
  modified:
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/reducers/commands.ts
decisions:
  - "Call getEquippedBonuses once per character per regen tick — acceptable overhead since effects loop already runs per character"
  - "admin recompute_racial_all iterates ctx.db.race via iter() then finds by name — acceptable for admin one-shot reducer"
metrics:
  duration: 8m
  completed: 2026-02-21
---

# Phase 221 Plan 01: Fix Mana Regen Racial and Gear Bonuses Summary

Gear manaRegen affix bonuses now apply during the regen tick; existing characters with null racial columns can be repaired via admin `recompute_racial_all` reducer.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Apply gear manaRegen in the regen tick | ef5b35b | spacetimedb/src/reducers/combat.ts |
| 2 | Add recompute_racial_all admin reducer | b3317a1 | spacetimedb/src/reducers/commands.ts |

## Changes Made

### Task 1: Apply gear manaRegen in regen tick

The `regen_health` reducer was computing racial regen and food-effect bonuses but silently dropping gear manaRegen affix bonuses. `getEquippedBonuses` was already available in items.ts but not imported in combat.ts.

Two changes:
1. Added `getEquippedBonuses` to the import from `'../helpers/items'`
2. After the racial regen lines, call `getEquippedBonuses(ctx, character.id)` and add `gear.manaRegen` to `manaRegenBonus`

A Gnome Summoner with a +1 manaRegen gear affix now receives 5 (base) + 1 (racial) + 1 (gear) = 7 mana/tick out-of-combat.

### Task 2: recompute_racial_all admin reducer

Characters created before the `racialManaRegen` column was added to the schema have `null` in that field. The `?? 0n` guard at tick time silently drops the racial bonus for those characters.

Added `recompute_racial_all` reducer to `commands.ts` (gated by `requireAdmin`):
- Iterates all characters
- Looks up race row by `character.race` name
- Calls `computeRacialAtLevelForAdmin(raceRow, character.level)` (already defined at top of file)
- Updates all racial columns using the same pattern as `level_character`
- Calls `recomputeCharacterDerived` after each update
- Broadcasts system message with count of repaired characters

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Both publishes to local succeeded with no compile errors.

- `grep -n "getEquippedBonuses" spacetimedb/src/reducers/combat.ts` confirms import and usage
- `grep -n "gear.manaRegen" spacetimedb/src/reducers/combat.ts` confirms line added at 1308
- `spacetime publish uwr` after each task: clean build

## Self-Check: PASSED

- FOUND: spacetimedb/src/reducers/combat.ts
- FOUND: spacetimedb/src/reducers/commands.ts
- FOUND: ef5b35b (fix gear manaRegen in regen tick)
- FOUND: b3317a1 (recompute_racial_all admin reducer)
