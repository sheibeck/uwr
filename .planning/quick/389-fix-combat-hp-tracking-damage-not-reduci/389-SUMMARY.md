---
phase: quick-389
plan: 01
subsystem: combat
tags: [bugfix, combat, damage-routing]
dependency_graph:
  requires: []
  provides: [correct-enemy-ability-damage-routing]
  affects: [combat-hp-tracking, player-damage]
tech_stack:
  patterns: [actor-type-dispatch]
key_files:
  modified:
    - spacetimedb/src/helpers/combat.ts
decisions:
  - "Follow existing aoe_damage pattern for actor-type branching"
  - "Enemy DoT uses addCharacterEffect (not addEnemyEffect) to apply DoT to player"
  - "Enemy debuff uses addCharacterEffect to apply debuff to player character"
metrics:
  duration: 2min
  completed: "2026-03-09T01:55:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Task 389: Fix Combat HP Tracking - Damage Not Reducing Player HP

Actor-type-aware routing in resolveAbility for damage/dot/debuff kinds so enemy abilities correctly reduce player HP instead of damaging other enemies.

## What Changed

The `resolveAbility` function in `combat.ts` had three ability kinds (damage, dot, debuff) that unconditionally routed damage to enemies via `findEnemyTarget()` + `applyDamageToEnemy()`, regardless of whether the actor was a player or an enemy. When an enemy used an ability, it would damage another enemy (or itself) instead of the targeted player character. The log messages told the player they were hit, but HP never decreased.

### Fix Applied

Added actor-type branching (matching the existing `aoe_damage` pattern) to all three kinds:

1. **damage kind**: When `actor.type === 'enemy'`, calls `applyDamageToCharacter()` on the target player character instead of `applyDamageToEnemy()`.

2. **dot kind**: When `actor.type === 'enemy'`, applies initial damage via `applyDamageToCharacter()` and adds a DoT effect via `addCharacterEffect()` instead of `addEnemyEffect()`.

3. **debuff kind**: When `actor.type === 'enemy'`, applies direct damage via `applyDamageToCharacter()` and adds debuff via `addCharacterEffect()` instead of `addEnemyEffect()`.

Player-to-enemy routing is unchanged for all three kinds.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix actor-type routing in resolveAbility | 3a21f93 | spacetimedb/src/helpers/combat.ts |
| 2 | Publish and verify via server logs | (verification only) | - |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
