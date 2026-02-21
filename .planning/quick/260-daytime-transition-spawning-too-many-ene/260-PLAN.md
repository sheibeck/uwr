---
phase: quick-260
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
autonomous: true
requirements: [QUICK-260]

must_haves:
  truths:
    - "Day/night transition does not exceed the spawn cap at any location"
    - "Locations with group-type enemies (groupMin > 1) do not accumulate extra spawns on transition"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "Fixed respawnLocationSpawns and ensureLocationRuntimeBootstrap"
      contains: "countNonEventSpawns"
  key_links:
    - from: "respawnLocationSpawns"
      to: "spawnEnemy"
      via: "count must reflect actual rows inserted, not calls made"
      pattern: "count = countNonEventSpawns"
---

<objective>
Fix day/night transition spawning too many enemies (Embermarch Gate reported 16 on daytime transition).

Purpose: `spawnEnemy` inserts one EnemySpawn row per group member (groupCount can be 2-4+), but
`respawnLocationSpawns` and `ensureLocationRuntimeBootstrap` both increment a local `count` variable
by 1 per `spawnEnemy` call. When a group of 4 spawns, count goes up by 1 but 4 rows were added,
so the while loop runs again and keeps adding groups until local count reaches cap — producing
far more than cap total spawns in the DB.

Output: Corrected helper functions that recount actual DB rows after each spawn call.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@spacetimedb/src/helpers/location.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix spawn count tracking in respawnLocationSpawns and ensureLocationRuntimeBootstrap</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
Extract a private helper function `countNonEventSpawns(ctx, locationId)` that counts the actual
number of non-event EnemySpawn rows for a location by iterating `ctx.db.enemySpawn.by_location.filter(locationId)`
and filtering out event spawns. Place it before `respawnLocationSpawns`.

Then fix both affected functions to recount from the DB after each `spawnEnemy` call instead
of incrementing a local counter:

In `respawnLocationSpawns` (around line 360-371):
  - Replace the post-deletion count loop with a call to `countNonEventSpawns(ctx, locationId)`.
  - In the while loop body, after calling `spawnEnemy(...)`, update count by calling
    `count = countNonEventSpawns(ctx, locationId)` instead of `count += 1`.
  - Add a safety guard: if count did not increase after a spawn call (spawnEnemy threw or was
    a no-op), break to prevent infinite loops.

In `ensureLocationRuntimeBootstrap` (around line 334-346):
  - Replace the `count += 1` increment with `count = countNonEventSpawns(ctx, location.id)`
    after each `spawnEnemy` call.
  - Same safety guard: if count did not increase, break.

The helper:

```typescript
function countNonEventSpawns(ctx: any, locationId: bigint): number {
  let count = 0;
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (!isEventSpawn(ctx, row.id)) count += 1;
  }
  return count;
}
```

Do NOT change any other logic in either function. Do NOT alter `ensureSpawnsForLocation` —
it already uses `available += 1` and `total += 1` which are different semantics (it tracks
available vs total, not raw DB count). That function's separate concern does not need this fix.
  </action>
  <verify>
    Publish to local: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb`
    Check logs after a manual day/night cycle trigger (admin transition) or wait for natural transition.
    Confirm `spacetime logs uwr` shows no panic/error from location spawn code.
    Visually inspect that Embermarch Gate (or any location with group enemies) does not exceed
    its spawn cap (3 + locationId%4, max 6) after a transition.
  </verify>
  <done>
    - `countNonEventSpawns` helper exists in location.ts
    - `respawnLocationSpawns` uses DB recount after each spawn, not local increment
    - `ensureLocationRuntimeBootstrap` uses DB recount after each spawn, not local increment
    - Module publishes without error
    - No location exceeds its non-event spawn cap after a day/night transition
  </done>
</task>

</tasks>

<verification>
After publishing locally:
1. Trigger or wait for a day/night transition.
2. Check enemy spawn counts at locations known to have group enemies (e.g., Embermarch Gate).
3. Non-event spawn count per location must be <= `3 + Number(locationId % 4n)`.
4. `spacetime logs uwr` shows no spawn-related errors.
</verification>

<success_criteria>
Day/night transition keeps every location at or below its spawn cap regardless of group size.
Embermarch Gate no longer spawns 16 enemies on daytime begin.
</success_criteria>

<output>
After completion, create `.planning/quick/260-daytime-transition-spawning-too-many-ene/260-SUMMARY.md`
</output>
