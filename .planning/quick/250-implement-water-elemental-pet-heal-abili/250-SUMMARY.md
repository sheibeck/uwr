---
phase: quick-250
plan: "01"
subsystem: combat
tags: [pet, healing, water-elemental, combat, regen]
dependency_graph:
  requires: []
  provides: [pet_heal ability for water elemental pet]
  affects: [executePetAbility, regen_health, clearCombatArtifacts, flee path]
tech_stack:
  added: []
  patterns: [lowest-HP targeting, out-of-combat scheduled tick via regen_health]
key_files:
  created: []
  modified:
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Use character.name (not displayName) for heal messages — Character table has no displayName field"
  - "Use lowestHpRatio starting at 101n (not 2n as in plan) to correctly cover 0-100 ratio range"
  - "Re-arm out-of-combat heal immediately on combat exit (nextAbilityAt = now) so first regen tick activates it"
  - "Disarm pet (clear nextAbilityAt) when all party at full HP, re-arm only on next combat exit"
metrics:
  duration: "~20 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-250 Plan 01: Implement Water Elemental Pet Heal Ability Summary

Water elemental pet `pet_heal` ability implemented: heals the lowest-HP living party member during combat via `executePetAbility`, and continues ticking heals out of combat via the `regen_health` scheduled reducer using the pet's `abilityCooldownSeconds` cooldown.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement pet_heal in executePetAbility (in-combat path) | 4906c09 | spacetimedb/src/helpers/combat.ts |
| 2 | Out-of-combat heal loop in regen_health + preserve nextAbilityAt on combat exit | df2f0fc | spacetimedb/src/reducers/combat.ts |

## What Was Built

### Task 1: In-Combat Healing (helpers/combat.ts)

Added `pet_heal` case in `executePetAbility` before the enemy-target guard. The implementation:

- Iterates over `combatParticipant.by_combat` to find the lowest-HP active participant using integer ratio comparison (`hp * 100 / maxHp`)
- Falls back to healing the owner directly if no injured participant is found via the participant table
- Returns `false` (skips ability) if everyone is at max HP
- Heals for `10 + level * 5` HP, capped at maxHp
- Logs the event to owner's private feed and group feed
- Moved `actorGroupId` declaration above the new `pet_heal` block (was previously after enemy-target guard)

### Task 2: Out-of-Combat Healing (reducers/combat.ts)

Two sub-changes:

**A — Preserve nextAbilityAt on combat exit (both paths):**
- `clearCombatArtifacts` (combat end): surviving `pet_heal` pets get `nextAbilityAt = ctx.timestamp.microsSinceUnixEpoch`
- Flee path: same treatment for the fleeing character's `pet_heal` pet
- Other pets still get `nextAbilityAt: undefined` (unchanged behavior)

**B — Out-of-combat heal loop in regen_health:**
- Runs after the pet HP regen loop, before the watchdog section
- Iterates `activePet.iter()`, skips non-heal pets, in-combat pets, dead pets, and pets without an armed `nextAbilityAt`
- Finds lowest-HP party member: checks owner, then co-located group members via `groupMember.by_group`
- When all party at full HP: clears `nextAbilityAt` (dormant until next combat exit re-arms)
- When healing: logs to owner private and group event feeds, sets next cooldown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used character.name instead of plan's displayName**
- **Found during:** Task 1 implementation
- **Issue:** Plan used `healTarget.displayName ?? 'an ally'` but `Character` table has no `displayName` field (only `Player` and `ItemInstance` have it)
- **Fix:** Used `healTarget.name` directly (Character always has a name)
- **Files modified:** spacetimedb/src/helpers/combat.ts
- **Commit:** 4906c09

**2. [Rule 1 - Bug] Fixed lowestHpRatio initial value**
- **Found during:** Task 1 implementation
- **Issue:** Plan used `lowestHpRatio = 2n` for in-combat case (ratio comparison via `hp * 100 / maxHp` produces 0-100 range, not 0-1)
- **Fix:** Used `lowestHpRatio = 101n` in both in-combat and out-of-combat implementations to ensure first candidate always wins
- **Files modified:** spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts
- **Commit:** 4906c09, df2f0fc

## Verification

- `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` compiled successfully with no errors
- Build finished successfully; module uploaded to local SpacetimeDB

## Self-Check: PASSED

- spacetimedb/src/helpers/combat.ts — FOUND (modified)
- spacetimedb/src/reducers/combat.ts — FOUND (modified)
- Commit 4906c09 — FOUND
- Commit df2f0fc — FOUND
