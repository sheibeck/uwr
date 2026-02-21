---
phase: quick
plan: 237
subsystem: combat
tags: [enemy-ai, summoner, pets, aggro, abilities]
dependency_graph:
  requires: []
  provides: [enemy-ability-pet-targeting]
  affects: [combat-loop, aggro-system, summoner-pets]
tech_stack:
  added: []
  patterns: [pet-routing-in-ability-execution]
key_files:
  created: []
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/helpers/combat.ts
    - src/module_bindings/combat_enemy_cast_table.ts
    - src/module_bindings/combat_enemy_cast_type.ts
decisions:
  - "Pet ability targeting uses raw total power (no armor mitigation) for simplicity — pets are simple HP sponges"
  - "pickEnemyTarget now returns { characterId?, petId? } union rather than bigint to distinguish pet vs character targets"
  - "dot/debuff already-applied checks short-circuit to false for pet targets since pets have no CharacterEffect rows"
metrics:
  duration: ~8 minutes
  completed: 2026-02-21T18:33:25Z
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 237: Fix Enemy Ability Targeting to Respect Pet Aggro Summary

Enemy ability targeting now respects pet aggro entries — when a summoner pet holds top aggro, enemy abilities damage the pet instead of bypassing it to hit the summoner.

## What Was Done

### Task 1: Fix threat generation loop and pickEnemyTarget

**File:** `spacetimedb/src/reducers/combat.ts`

**Change A - Threat loop (line ~2284):**
Added `&& !entry.petId` guard to the summoner auto-attack threat generation loop. Previously, pet aggro entries for the same summoner+enemy pair could be matched, causing the summoner's own hit to erroneously boost the pet's aggro entry instead of the summoner's own.

**Change B - `pickEnemyTarget` function:**
- Changed return type from `bigint | undefined` to `{ characterId?: bigint; petId?: bigint } | undefined`
- The aggro branch now includes pet entries in the candidate pool (previously filtered them out via `activeParticipants` check)
- If the top-aggro entry has `petId`, returns `{ petId }` instead of a character ID
- Updated `Candidate` type: `targetId: bigint` → `target: { characterId?, petId? }`
- Updated all callers:
  - dot/debuff already-applied checks are guarded with `if (!target.petId)` since pets have no `CharacterEffect` rows
  - Debuff scoring comparison updated from `=== targetId` to `=== target.characterId`
  - `combatEnemyCast.insert` stores both `targetCharacterId: chosen.target.characterId` and `targetPetId: chosen.target.petId`
  - `executeAbilityAction` call site passes `targetPetId: existingCast.targetPetId`

### Task 2: Add targetPetId to schema and thread through execution

**File:** `spacetimedb/src/schema/tables.ts`
Added `targetPetId: t.u64().optional()` field to `CombatEnemyCast` table, after `targetCharacterId`.

**File:** `spacetimedb/src/helpers/combat.ts`
- Added `targetPetId?: bigint` parameter to `executeEnemyAbility`
- When `targetPetId` is provided, routes damage directly to the pet:
  - Fetches the `activePet` row; returns early if pet is dead or missing
  - Applies raw `totalPower` damage (no armor mitigation — pets are simple)
  - Logs damage to owner's private events and group events
  - On pet death: removes all pet aggro entries for the combat, deletes the `activePet` row, logs death message
  - Returns early so the existing character targeting path is skipped
- Added `targetPetId?: bigint` to the `enemy` variant of `executeAbilityAction`'s args union
- Passes `args.targetPetId` through the `executeEnemyAbility` call in the enemy branch

**Files:** `src/module_bindings/combat_enemy_cast_table.ts`, `src/module_bindings/combat_enemy_cast_type.ts`
Regenerated via `spacetime generate` — `CombatEnemyCast` type now includes `targetPetId: option<u64>`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `4dbe367` | feat(237): fix threat loop and pickEnemyTarget to support pet targets |
| 2 | `ccc565e` | feat(237): route enemy ability damage to pets and regenerate bindings |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/schema/tables.ts` - modified with targetPetId field
- `spacetimedb/src/reducers/combat.ts` - pickEnemyTarget updated, threat loop fixed, all callers updated
- `spacetimedb/src/helpers/combat.ts` - executeEnemyAbility handles pet routing, executeAbilityAction updated
- `src/module_bindings/combat_enemy_cast_type.ts` - contains targetPetId field
- Module published successfully with no errors
- Client bindings regenerated successfully
