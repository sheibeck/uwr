---
phase: quick-101
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/location.ts
autonomous: true

must_haves:
  truths:
    - "No enemy spawns exist at locations with isSafe: true"
    - "Enemy spawns continue to work normally at unsafe locations"
    - "Existing enemy spawns at safe locations are cleaned up on bootstrap"
  artifacts:
    - path: "spacetimedb/src/helpers/location.ts"
      provides: "isSafe guards on all spawn functions"
      contains: "isSafe"
  key_links:
    - from: "spacetimedb/src/helpers/location.ts"
      to: "ctx.db.location"
      via: "isSafe check before spawning"
      pattern: "location\\.isSafe"
---

<objective>
Fix enemy spawns appearing in safe zones (isSafe: true locations like Hollowmere).

Purpose: Safe zones like the starting town Hollowmere should never have enemy spawns. Currently, `ensureLocationRuntimeBootstrap` and `ensureSpawnsForLocation` create spawns at ALL locations without checking the `isSafe` flag, even though the day/night respawn cycle and the `respawn_enemy` scheduled reducer already respect it.

Output: Enemy spawns no longer created at safe locations; existing safe-zone spawns cleaned up on bootstrap.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/location.ts (contains ensureLocationRuntimeBootstrap, ensureSpawnsForLocation, spawnEnemy, spawnEnemyWithTemplate)
@spacetimedb/src/reducers/combat.ts (respawn_enemy reducer already checks isSafe at line 991)
@spacetimedb/src/index.ts (day/night cycle already checks isSafe at line 249)
@spacetimedb/src/reducers/movement.ts (calls ensureSpawnsForLocation on travel)
@spacetimedb/src/reducers/characters.ts (calls ensureSpawnsForLocation on character select)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add isSafe guards to all enemy spawn entry points in location.ts</name>
  <files>spacetimedb/src/helpers/location.ts</files>
  <action>
Add isSafe checks to these three functions in `spacetimedb/src/helpers/location.ts`:

1. **`ensureLocationRuntimeBootstrap`** (line ~279): Inside the `for (const location of ctx.db.location.iter())` loop, add an `isSafe` check before spawning enemies. The location object is already available. Add `if (location.isSafe) continue;` BEFORE the enemy spawn `while` loop (but AFTER the `ensureResourceNodesForLocation` call — resources should still spawn in safe zones). The existing code structure is:
   ```
   for (const location of ctx.db.location.iter()) {
     ensureResourceNodesForLocation(ctx, location.id);  // keep this for all locations
     // ADD: if (location.isSafe) continue;  <-- skip enemy spawns for safe zones
     let count = 0;
     for (const _row of ctx.db.enemySpawn.by_location.filter(location.id)) { ... }
     while (count < DEFAULT_LOCATION_SPAWNS) { ... spawnEnemy ... }
   }
   ```
   ALSO: Before the `continue`, clean up any existing enemy spawns at the safe location (they may exist from before this fix). Loop through `ctx.db.enemySpawn.by_location.filter(location.id)` and for each spawn: delete all members via `ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)`, then delete the spawn itself via `ctx.db.enemySpawn.id.delete(spawn.id)`.

2. **`ensureSpawnsForLocation`** (line ~254): At the top of the function, look up the location and early-return if safe:
   ```
   const location = ctx.db.location.id.find(locationId);
   if (!location || location.isSafe) return;
   ```

3. **`spawnEnemy`** (line ~320): At the top of the function, add a guard:
   ```
   const locationRow = ctx.db.location.id.find(locationId);
   if (locationRow?.isSafe) throw new SenderError('Cannot spawn enemies in safe zones');
   ```
   Note: The variable is `locationRow` to avoid shadowing the existing `location` variable used later in the function (line ~382).

4. **`spawnEnemyWithTemplate`** (line ~432): At the top of the function, add the same guard:
   ```
   const locationRow = ctx.db.location.id.find(locationId);
   if (locationRow?.isSafe) throw new SenderError('Cannot spawn enemies in safe zones');
   ```

Do NOT modify `respawnLocationSpawns` or the `respawn_enemy` reducer — they already handle isSafe correctly (respawn_enemy checks directly, respawnLocationSpawns is only called from the day/night cycle which already filters).
  </action>
  <verify>
Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` to verify no TypeScript errors.

Grep for `isSafe` in `spacetimedb/src/helpers/location.ts` — should now appear in 4 functions: ensureLocationRuntimeBootstrap, ensureSpawnsForLocation, spawnEnemy, spawnEnemyWithTemplate.
  </verify>
  <done>
All enemy spawn creation paths check isSafe before spawning. Safe locations like Hollowmere will have zero enemy spawns after bootstrap cleanup. Unsafe locations remain unaffected.
  </done>
</task>

</tasks>

<verification>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` passes
2. Grep confirms `isSafe` appears in all 4 spawn functions
3. No changes to combat.ts, index.ts, movement.ts, or characters.ts — those callers are unmodified
</verification>

<success_criteria>
- TypeScript compiles without errors
- ensureLocationRuntimeBootstrap skips enemy spawns for safe locations and cleans up existing ones
- ensureSpawnsForLocation early-returns for safe locations
- spawnEnemy and spawnEnemyWithTemplate throw SenderError for safe locations
- Resource nodes still spawn at safe locations (only enemy spawns blocked)
</success_criteria>

<output>
After completion, create `.planning/quick/101-fix-enemy-spawns-appearing-in-safe-zones/101-SUMMARY.md`
</output>
