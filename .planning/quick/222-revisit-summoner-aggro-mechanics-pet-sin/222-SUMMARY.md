---
phase: quick-222
plan: "01"
subsystem: combat
tags: [summoner, aggro, pet, threat, balance]
dependency_graph:
  requires: []
  provides: [summoner-single-target-taunt, summoner-threat-tuning]
  affects: [spacetimedb/src/data/combat_scaling.ts, spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts]
tech_stack:
  added: []
  patterns: [single-target-taunt-on-summon]
key_files:
  modified:
    - spacetimedb/src/data/combat_scaling.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Summoner threat raised to 75n so summoners are at meaningful risk even with pet tanking"
  - "Pet aggro on summon is single-target (targeted enemy only), not AoE against all enemies"
  - "startCombatForSpawn uses spawnId field match to identify primary enemy for pet taunt"
metrics:
  duration: "~10 minutes"
  completed: "2026-02-21"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase quick-222 Plan 01: Revisit Summoner Aggro Mechanics Summary

**One-liner:** Summoner pet aggro changed from AoE-taunt-all to single-target-taunt, and summoner threat multiplier raised from 25n to 75n for meaningful combat risk.

## Objective

Revise summoner pet aggro mechanics: pets now taunt only their current target on summon (not every enemy in combat), and the summoner's own threat multiplier is raised from 0.25x to 0.75x so summoners face genuine danger and must rely on pet positioning rather than blanket threat suppression.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Raise SUMMONER_THREAT_MULTIPLIER from 25n to 75n | 6ba7ee5 | spacetimedb/src/data/combat_scaling.ts |
| 2 | Change pet initial aggro to single-target in summonPet and startCombatForSpawn | a9caf50 | spacetimedb/src/helpers/combat.ts, spacetimedb/src/reducers/combat.ts |

## Changes Made

### Task 1 — combat_scaling.ts

Changed `SUMMONER_THREAT_MULTIPLIER` from `25n` to `75n` and updated the JSDoc comment to reflect the new design intent: summoners are at meaningful risk in combat, not shielded behind near-zero threat.

### Task 2 — helpers/combat.ts (summonPet)

Replaced the `for...of` loop over all `combatEnemy.by_combat` entries with a single `aggroEntry.insert` using `enemy!.id` — the enemy that was already in scope as the summon target. The pet taunts exactly the enemy it is targeting, not every enemy in the encounter.

### Task 2 — reducers/combat.ts (startCombatForSpawn)

Replaced the `for...of` loop over all combat enemies with a `.find()` that matches `en.spawnId === spawnToUse.id && en.currentHp > 0n` to identify the primary enemy. A single `aggroEntry.insert` is performed against that enemy only. If no matching enemy is found (guard `if (primaryEnemy)`), no insert occurs.

## Verification

- `SUMMONER_THREAT_MULTIPLIER = 75n` confirmed in combat_scaling.ts
- No `for.*combatEnemy.*by_combat` loop remains inside the summonPet aggro block
- No `for.*combatEnemy.*by_combat` loop remains inside the startCombatForSpawn pet aggro block
- `enemy!.id` single-target insert confirmed in helpers/combat.ts
- `primaryEnemy` find + single insert confirmed in reducers/combat.ts
- `spacetime publish uwr` completed successfully with no TypeScript errors

## Deviations from Plan

None — plan executed exactly as written. The `spawnId` field name on `combatEnemy` was confirmed from schema before writing the `primaryEnemy` lookup.

## Self-Check: PASSED

- spacetimedb/src/data/combat_scaling.ts — modified, SUMMONER_THREAT_MULTIPLIER = 75n
- spacetimedb/src/helpers/combat.ts — modified, single-target insert with enemy!.id
- spacetimedb/src/reducers/combat.ts — modified, primaryEnemy find + single insert
- Commit 6ba7ee5 — exists (Task 1)
- Commit a9caf50 — exists (Task 2)
- Module published cleanly to local
