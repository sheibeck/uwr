---
phase: 36-ability-expansion
plan: 02
subsystem: combat-rewards, races
tags: [heritage, racial-bonuses, race-abilities, level-up, combat-rewards]
dependency_graph:
  requires: []
  provides: [every-level-heritage-formula, race-ability-data]
  affects: [character-creation, level-up-flow, races-command]
tech_stack:
  added: []
  patterns: [tdd-red-green, bigint-arithmetic, data-driven-race-abilities]
key_files:
  created:
    - spacetimedb/src/helpers/combat_rewards.test.ts
  modified:
    - spacetimedb/src/helpers/combat_rewards.ts
    - spacetimedb/src/data/races.ts
    - spacetimedb/src/reducers/intent.ts
    - spacetimedb/src/index.ts
decisions:
  - "levelBonusValue halved via round-up for odd values (5->3, 3->2, 50->25) to maintain power parity at level 20"
  - "Race ability kinds mapped from ABILITY_KINDS vocabulary: buff, hot, utility"
  - "All 15 race abilities use 'self' target rule with 300s (5 min) cooldown as baseline"
metrics:
  duration: ~10 minutes
  completed: 2026-03-10
  tasks_completed: 2
  files_modified: 4
  files_created: 1
---

# Phase 36 Plan 02: Heritage Bonus Every Level and Race Ability Data Summary

Every-level heritage bonus formula with halved levelBonusValues for power parity, plus functional race ability definitions (kind, name, key, cooldown, value) added to all 15 races in RACE_DATA.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Change heritage bonus to every level and add race ability data | 4f8a6e4 | combat_rewards.ts, races.ts, combat_rewards.test.ts |
| 2 | Update heritage display in intent.ts and level-up in index.ts | 047ad6d | intent.ts, index.ts |

## What Was Built

### Task 1: Every-Level Heritage Formula (TDD)

**combat_rewards.ts** - `computeRacialAtLevelFromRow`:
- Removed `const evenLevels = level / 2n`
- Changed condition from `if (evenLevels > 0n)` to `if (level > 0n)`
- Changed application from `levelBonusValue * evenLevels` to `levelBonusValue * level`

**races.ts** - `RACE_DATA` updates:
- Halved `levelBonusValue` for all races (round up odd values):
  - Ironclad: 5n -> 3n, Wyldfang: 50n -> 25n, Half-Elf: 50n -> 25n
  - Eldrin: 2n -> 1n, Gnome: 2n -> 1n, Troll: 2n -> 1n
  - Half-Giant: 3n -> 2n, Satyr: 50n -> 25n
  - Human, Goblin, Dwarf, Orc, Dark-Elf, Cyclops: already 1n, unchanged
- Added 7 new fields to all 15 RACE_DATA entries: `abilityName`, `abilityDescription`, `abilityKind`, `abilityTargetRule`, `abilityCooldownSeconds`, `abilityValue`, `abilityKey`

**Race abilities added:**
| Race | Ability | Kind |
|------|---------|------|
| Human | Diplomatic Poise | buff |
| Eldrin | Arcane Attunement | buff |
| Ironclad | Iron Bulwark | buff |
| Wyldfang | Predator's Instinct | buff |
| Goblin | Scavenger's Eye | utility |
| Troll | Troll Regeneration | hot |
| Dwarf | Stonehide | buff |
| Gnome | Mana Surge | hot |
| Halfling | Lucky Dodge | buff |
| Half-Elf | Focused Aim | buff |
| Orc | Blood Frenzy | buff |
| Dark-Elf | Shadow Veil | buff |
| Half-Giant | Giant's Wrath | buff |
| Cyclops | True Sight | buff |
| Satyr | Primal Ward | buff |

**combat_rewards.test.ts** - 15 tests created covering:
- Every-level formula at levels 1, 5, 10 (not divided by 2)
- Power parity verification (Eldrin at level 20 = same as old formula)
- All RACE_DATA entries have abilityKind, abilityName, abilityKey, abilityDescription, abilityCooldownSeconds, abilityValue, abilityTargetRule
- abilityKey values are unique across races

### Task 2: Display and Notification Updates

**intent.ts** - races command:
- Changed "Level Bonus (every 2 levels)" to "Level Bonus (every level)"
- Changed "per even level" to "per level"
- Total calculation now uses `levelBonusValue * BigInt(character.level)` (not half)
- Added race ability section showing name, description, and cooldown (when available)

**index.ts** - level-up heritage notification:
- Removed `if (newLevel % 2n === 0n)` gate — fires every level now
- Enhanced message: "Your {race} heritage grows stronger — +{value} {bonusLabel} at level {N}."

## Verification

- `npm test -- combat_rewards`: 15/15 tests passing
- `npx tsc --noEmit`: No new errors in modified files (pre-existing errors in unrelated files unchanged)
- No `evenLevels` in combat_rewards.ts
- No "every 2 levels" in intent.ts
- No `newLevel % 2n` in index.ts (for heritage gate)

## Deviations from Plan

None - plan executed exactly as written. The TypeScript cast `BigInt(character.level)` was added in intent.ts to resolve a type error from the `character.level * bigint` multiplication (character is `any` but the race row's levelBonusValue is statically typed `bigint`).

## Self-Check: PASSED
