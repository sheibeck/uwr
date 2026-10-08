---
phase: quick-261008-ag8
plan: 01
subsystem: combat-and-world
tags: [enemy-spawn, place-level, enemy_rules, combat_enemy, nearby, encounter, additive-schema]
requires:
  - phase: 51.1-party-and-social
    provides: fight roster, strict mock fixtures
provides:
  - enemy_spawn.level and combat_enemy.level (defaulted u64, appended last; 0 = row from before the column)
  - shared pure rules in data/enemy_rules.ts (enemyStatsForLevel, placeLevelBand, placeSpawnLevel, effectiveEnemyLevel, templateAtLevel)
  - spawns that take the place's target level when no enemy type fits its band
  - fight-start stats, victory XP, gold, loot gates, renown and enemy ability power at the scaled level
  - Nearby, Encounter rail and strip, look, examine, consider, enemies list and attack prompt showing the scaled level
affects: [Phase 51.3 loot rewrite, Phase 51.3.1 world-gen level ranges and boss bump, end-of-milestone UAT]
tech-stack:
  added: []
  patterns: [shared pure rule imported on the client through @game-data, never re-derived; additive defaulted column appended last]
key-files:
  created:
    - spacetimedb/src/data/enemy_rules.test.ts
    - spacetimedb/src/helpers/location_spawn_level.test.ts
    - spacetimedb/src/reducers/spawn_level.integration.test.ts
  modified:
    - spacetimedb/src/data/enemy_rules.ts
    - spacetimedb/src/helpers/world_gen.ts
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/helpers/location.ts
    - spacetimedb/src/helpers/world_events.ts
    - spacetimedb/src/reducers/combat.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/helpers/look.ts
    - spacetimedb/src/helpers/examine.ts
    - spacetimedb/src/reducers/intent.ts
    - src/module_bindings/enemy_spawn_table.ts
    - src/module_bindings/combat_enemy_table.ts
    - src/module_bindings/types.ts
    - src/rails/enemies.ts
    - src/rails/enemies.test.ts
    - src/combat/hostiles.ts
    - src/combat/hostiles.test.ts
key-decisions:
  - "Quest and named spawns (spawnEnemyWithTemplate) follow the place's level band like any other spawn. Owner 2026-10-08: Quest bosses should be harder. Any extra boss bump is Phase 51.3.1, not here."
  - "Event enemies keep their authored type level (level: enemyTemplate.level). Scaling them is out of scope."
  - "handleVictory scales its template list once at its head; the loot, essence, modifier and gold code is untouched (Phase 51.3 rewrites it)."
patterns-established:
  - "A row level of 0 means a row from before the column and reads as the type's level (effectiveEnemyLevel)."
requirements-completed: [TODO-2026-10-08-nearby-enemies-ignore-the-location-level]
duration: n/a
completed: 2026-10-08
status: complete
---

# Phase quick-261008-ag8 Plan 01: Enemy spawns scale to the place level Summary

**Spawns at a place that no enemy type fits now take the place's target level (Mother Pan Undercroft: level 5, inside its 4-6 band), with stats, rewards and every level display following it, added through two defaulted columns and a local publish that needed no clear.**

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 | ec27831e | enemy_rules (five pure rules), the two columns, spawn paths, legacy re-level, world_gen uses the shared formulas |
| 2 | 15d71387 | addEnemyToCombat, handleVictory and renown at the scaled level; ability power; look, examine, enemies list, consider, attack prompt |
| 3 | dc29e192 | regenerated bindings; Nearby (enemyRows) and Encounter (hostileViews) read the level through the shared rule |

## What changed

- `data/enemy_rules.ts` (no imports, shared with the client through `@game-data`): `enemyStatsForLevel` (HP level*12+20, damage level*3+5, armor level*2+2, XP level*15+10), `placeLevelBand`, `placeSpawnLevel`, `effectiveEnemyLevel`, `templateAtLevel`. `writeRegionFill` now uses `enemyStatsForLevel`, so the values are identical to before.
- `enemy_spawn.level` and `combat_enemy.level`: `t.u64().default(0n)`, last column, both tables stay public.
- `spawnEnemy` and `spawnEnemyWithTemplate` write `placeSpawnLevel(type level, place target, offset)`. A type inside the band keeps its level. `ensureAvailableSpawn` compares the effective level. `relevelLegacySpawns` (called from `ensureSpawnsForLocation` after the safe-place guard) re-levels available, non-event, level-0 spawns on arrival.
- `addEnemyToCombat` builds stats from `templateAtLevel(template, spawn.level)` through the unchanged `computeEnemyStats` and stores `combat_enemy.level`. `handleVictory` maps each enemy through `templateAtLevel(template, row.level)` at its head (XP, gold, loot gates and renown follow). `executeEnemyAbility` reads the effective level.
- Server text: look, examine, the enemies list, consider and the attack prompt show the spawn level and use it for the con colour.
- Client: `enemyRows` and `hostileViews` use `effectiveEnemyLevel(row.level, template level)`. No .vue file changed.

## TDD evidence

- Task 1 RED: `enemy_rules.test.ts` and `location_spawn_level.test.ts` run before any implementation: 20 failed, 1 passed (the stale-module import errors and every behaviour case). GREEN: 21 passed.
- Task 2 RED: the Task 2 source diff was reverse-applied (`git apply -R`) and `spawn_level.integration.test.ts` run: 7 of 9 failed (scaled fight start, legacy level 1, exact fit, victory XP, look, examine, combat_enemy insert scan). The diff was re-applied and the file passes 9 of 9.
- Task 3 RED: three scaled-level cases failed before the client change (enemies: scaled row, spawn level before template; hostiles: scaled enemy); GREEN afterwards.

## Test results

- Task 1 verify set (7 files): 212 passed.
- Task 2 verify set (10 files): 326 passed. No existing test needed a `level` addition.
- Client: `enemies.test.ts`, `hostiles.test.ts`, `NearbyList.test.ts`: 87 passed.
- `npx vue-tsc -b`: clean.
- Full `npx vitest run --maxWorkers=1`: 364 files, 11034 tests; 11031 passed. Failures: the three baseline files (call_log_report, proof_rules, measurement.results: 2 tests) plus one transient `src/social/PartySheet.test.ts` case ('shows the summary, no Loot line...') caused by another agent's in-flight `PartyBlock.vue` change; it passes on rerun after that change was committed. None of it touches this plan.

## Publish evidence (local only)

- Server up: `/v1/ping` 200.
- Key check before: `spacetime sql uwr "SELECT * FROM admin_llm_status" --server local` showed `true | 108`; `grep -qE "true +[|] +108"` matched.
- `spacetime publish uwr -p spacetimedb --server local --break-clients < /dev/null` exited 0. Migration plan (no clear, no other change):

```
Created column in table combat_enemy   + level: U64 (default: U64(0))
Created column in table enemy_spawn    + level: U64 (default: U64(0))
Warning: All clients will be disconnected due to breaking schema changes
Updated database with name: uwr
```

- Key check after: matched (`true | 108`). `SELECT ... FROM enemy_spawn` shows the new `level` column reading 0 on existing rows (legacy until a character arrives or the day/night turn). Logs: "Database updated", no panic.
- Bindings regenerated with `pnpm spacetime:generate -y`: only `enemy_spawn_table.ts`, `combat_enemy_table.ts` and `types.ts` changed (4 inserted lines, `level` only).

## Deviations from Plan

None - the plan was executed as written. Notes:
- Task 2 RED was produced by reverse-applying the implementation diff after the code had been written, rather than by writing the test first; the evidence is the same failing set.
- `src/rails/PartyBlock.vue` showed as modified in the tree during the publish step; it belongs to another agent and was not staged.

## Known Stubs

None.

## Deferred / open

- Fix (b): world-gen enemy level ranges (Phase 51.3.1), and the boss bump for quest bosses (owner: "Quest bosses should be harder!").
- Event enemies keep their authored type level; llm_apply's formula for quest-invented types is unchanged.
- UAT backstop (end of milestone): Armond at Mother Pan Undercroft travels away and back (or re-selects his character); Nearby shows Lv 5 with the matching con, and a fight's HP reflects level 5.

## Threat Flags

None. `level` is written only by server helpers; no reducer takes a level argument; the Task 2 source scan pins every insert site.

## Self-Check: PASSED

- Commits ec27831e, 15d71387, dc29e192 exist.
- The three new test files and this summary exist.
- Key check matched before and after the publish; no `--clear-database`.
