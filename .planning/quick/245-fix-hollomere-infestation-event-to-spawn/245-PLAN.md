---
phase: quick-245
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/world_events.ts
autonomous: true
requirements: [QUICK-245]
must_haves:
  truths:
    - "Firing the hollowmere_rat_infestation event spawns 5 individual Bog Rat EnemySpawn rows at Hollowmere"
    - "Each spawned EnemySpawn has groupCount=1 and one EnemySpawnMember"
    - "Each spawned enemy has its own EventSpawnEnemy row linking it to the event"
    - "Other events with count>1 (ashen_awakening: 3 Ash Jackals, hollowmere_siege: 4 Bog Lurkers) also spawn N individual enemies"
    - "Despawn on event resolution correctly removes all N individual spawns"
  artifacts:
    - path: "spacetimedb/src/helpers/world_events.ts"
      provides: "spawnEventContent with per-enemy loop"
      contains: "for (let i = 0; i < enemySpec.count; i"
  key_links:
    - from: "spawnEventContent"
      to: "ctx.db.enemySpawn.insert"
      via: "individual loop per enemy"
      pattern: "for.*enemySpec.count"
    - from: "ctx.db.eventSpawnEnemy.insert"
      to: "individual spawnId"
      via: "one EventSpawnEnemy per EnemySpawn"
---

<objective>
Fix `spawnEventContent` in `helpers/world_events.ts` to spawn N individual EnemySpawn rows (groupCount=1 each) instead of one grouped spawn with groupCount=N.

Purpose: After quick-238, all enemies are individual spawns. The event spawner still uses the old group pattern, so infestation events spawn 1 rat instead of 5.
Output: Updated `spawnEventContent` that loops `enemySpec.count` times, each iteration creating one EnemySpawn + one EnemySpawnMember + one EventSpawnEnemy.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@spacetimedb/src/helpers/world_events.ts
@spacetimedb/src/helpers/location.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix spawnEventContent to loop per enemy</name>
  <files>spacetimedb/src/helpers/world_events.ts</files>
  <action>
In `spawnEventContent` (around line 121), replace the single-group spawn block with a per-enemy loop.

Current broken pattern (lines 139-168):
```
// Create one EnemySpawn group for the count
const groupCount = BigInt(enemySpec.count);
const spawn = ctx.db.enemySpawn.insert({
  ...
  groupCount,
});
// Insert EnemySpawnMember rows for each enemy in the group
for (let i = 0; i < enemySpec.count; i++) {
  ctx.db.enemySpawnMember.insert({ ... spawnId: spawn.id ... });
}
// Insert EventSpawnEnemy row linking this spawn to the event
ctx.db.eventSpawnEnemy.insert({ ... spawnId: spawn.id ... });
```

Replace with a loop that creates one EnemySpawn (groupCount: 1n) per enemy, one EnemySpawnMember per spawn, and one EventSpawnEnemy per spawn:

```typescript
// Spawn N individual enemies (groupCount=1 each) — post quick-238 pattern
for (let i = 0; i < enemySpec.count; i++) {
  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: enemyTemplate.id,
    name: `${enemyTemplate.name} (Event)`,
    state: 'available',
    lockedCombatId: undefined,
    groupCount: 1n,
  });

  // Use roleTemplateId resolved above (first found), same as before
  ctx.db.enemySpawnMember.insert({
    id: 0n,
    spawnId: spawn.id,
    enemyTemplateId: enemyTemplate.id,
    roleTemplateId,
  });

  // Each individual spawn gets its own EventSpawnEnemy link
  ctx.db.eventSpawnEnemy.insert({
    id: 0n,
    eventId,
    spawnId: spawn.id,
    locationId,
  });
}
```

Remove the old single `ctx.db.enemySpawn.insert(...)` call, old `for (let i...)` EnemySpawnMember loop, and old single `ctx.db.eventSpawnEnemy.insert(...)` that were outside the new loop.

No other changes needed — `despawnEventContent` already iterates `ctx.db.eventSpawnEnemy.by_event.filter(eventId)` and deletes each linked spawn individually, so it handles N spawns correctly without modification.
  </action>
  <verify>
    1. `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` compiles without errors.
    2. Grep confirms the old single-group pattern is gone: `grep -n "groupCount = BigInt(enemySpec.count)" C:/projects/uwr/spacetimedb/src/helpers/world_events.ts` returns no matches.
    3. Grep confirms the new per-enemy loop: `grep -n "for (let i = 0; i < enemySpec.count" C:/projects/uwr/spacetimedb/src/helpers/world_events.ts` returns a match inside `spawnEventContent`.
  </verify>
  <done>
    `spawnEventContent` creates exactly `enemySpec.count` individual EnemySpawn rows (each with groupCount=1n and one EnemySpawnMember), each linked via its own EventSpawnEnemy row. Firing hollowmere_rat_infestation produces 5 Bog Rat spawns at Hollowmere. All three events (infestation: 5 rats, siege: 4 bog lurkers, awakening: 3 ash jackals) produce correct individual spawn counts.
  </done>
</task>

</tasks>

<verification>
After publishing:
- Fire the hollowmere_rat_infestation event via admin panel or `fire_world_event` reducer
- Query `SELECT * FROM enemy_spawn WHERE location_id = <Hollowmere id>` — expect 5 rows with `group_count=1`, all named "Bog Rat (Event)"
- Query `SELECT * FROM event_spawn_enemy WHERE event_id = <event id>` — expect 5 rows
- Resolve or let the event expire — all 5 spawns should be cleaned up by `despawnEventContent`
</verification>

<success_criteria>
Firing any world event that defines enemies with count > 1 now creates N individual EnemySpawn rows instead of 1 grouped row. The hollowmere_rat_infestation spawns 5 rats. Module compiles and publishes without errors.
</success_criteria>

<output>
After completion, create `.planning/quick/245-fix-hollomere-infestation-event-to-spawn/245-01-SUMMARY.md`
</output>
