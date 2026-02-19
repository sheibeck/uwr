---
phase: quick-204
plan: 01
subsystem: backend
tags: [world-events, kill-credit, combat, bug-fix]
key-files:
  modified:
    - spacetimedb/src/reducers/combat.ts
decisions:
  - Use WORLD_EVENT_DEFINITIONS static lookup instead of EventSpawnEnemy->EnemySpawn chain to determine kill credit eligibility
metrics:
  duration: ~5min
  completed: 2026-02-18
  tasks: 1
  files: 1
---

# Phase quick-204 Plan 01: Fix World Event Kill Credit Summary

**One-liner:** Definition-based kill credit using WORLD_EVENT_DEFINITIONS Set lookup replaces stale EventSpawnEnemy->EnemySpawn chain that broke after first kill in safe-town locations.

## What Was Built

The world event kill credit check in `combat.ts` previously followed an `EventSpawnEnemy -> EnemySpawn` chain to determine whether a killed enemy belonged to an active world event. This broke in three ways for The Hollowmere Infestation:

1. **Strict per-location filter:** `ese.locationId !== freshChar.locationId` rejected valid kills.
2. **Stale spawnId references:** `EnemySpawn` rows are deleted on first kill so `ctx.db.enemySpawn.id.find(ese.spawnId)` returns undefined.
3. **Safe-town respawn block:** Hollowmere's safe-town flag prevents enemy respawn, so `EnemySpawn` rows never return after deletion.

The fix replaces the chain with a direct lookup against `WORLD_EVENT_DEFINITIONS[activeEvent.eventKey]`. It builds a `Set<bigint>` of all enemy template IDs referenced in the event definition's `contentLocations` array and checks whether the killed template ID is a member. This check is based purely on static data, so it never goes stale.

## Changes

### `spacetimedb/src/reducers/combat.ts`

- Added import: `import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';`
- Replaced 9-line `EventSpawnEnemy` chain with 16-line definition-based check using `WORLD_EVENT_DEFINITIONS[activeEvent.eventKey]`
- All downstream logic (`if (!matchesEvent) continue;`, contribution/objective update) unchanged

## Verification

- `spacetime publish uwr --project-path spacetimedb` completed with no TypeScript compile errors.
- `WORLD_EVENT_DEFINITIONS` is a named export in `world_event_data.ts` and the import path resolves correctly.
- Manual functional test required in live environment: fire Hollowmere Infestation event, kill Bog Rats, confirm `eventContribution.count` and `eventObjective.currentCount` increment including after all initial spawn rows have been deleted.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `spacetimedb/src/reducers/combat.ts` modified with both edits verified
- Commit 3b3fe9f exists and matches expected changes
- Module published successfully with no compile errors
