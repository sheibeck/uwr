---
phase: quick-72
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "Safe locations (isSafe: true) never have enemy spawns"
    - "Starter zone enemies at levelOffset 0 are always level 1"
    - "No more than DEFAULT_LOCATION_SPAWNS (3) spawn groups exist per non-safe location at bootstrap"
    - "Level 1 enemies provide appropriate challenge for fresh characters"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Fixed spawn logic and level-appropriate enemy templates"
  key_links:
    - from: "ensureLocationRuntimeBootstrap"
      to: "location.isSafe"
      via: "skip safe locations"
      pattern: "isSafe.*continue"
    - from: "ensureSpawnsForLocation"
      to: "location.isSafe"
      via: "skip safe locations"
      pattern: "isSafe"
    - from: "respawnLocationSpawns caller"
      to: "location.isSafe"
      via: "skip safe locations in day/night cycle"
---

<objective>
Fix enemy spawn rate and level issues in starter zones.

Purpose: Players in Hollowmere (a safe town) are encountering 6 groups of enemies at once, and starter zone enemies are too high level for fresh level 1 characters. This makes the new player experience frustrating and confusing.

Output: Updated spawn logic that skips safe locations, and adjusted enemy template levels so starter zone enemies match level 1 characters.
</objective>

<execution_context>
@.planning/STATE.md
</execution_context>

<context>
## Investigation Findings

### Root Cause 1: Hollowmere spawning 6 groups
Three spawn sources stack on safe locations that shouldn't have enemies:
1. `ensureLocationRuntimeBootstrap()` (line ~5263) iterates ALL locations and spawns `DEFAULT_LOCATION_SPAWNS` (3) enemies per location — including `isSafe: true` towns like Hollowmere
2. `ensureSpawnsForLocation()` (line ~5239) creates additional spawns based on active player/group count at the location — called on character select and movement
3. `tick_day_night` reducer (line ~5344) calls `respawnLocationSpawns()` for ALL locations on day/night transition

None of these functions check `location.isSafe`. A safe town gets 3 from bootstrap + more from player activity = 6+ groups.

### Root Cause 2: Starter zone enemy levels too high
- Hollowmere (town): `levelOffset: 0n` → target level 1, spawns level 1-2 enemies
- Ashen Road: `levelOffset: 1n` → target level 2, spawns level 1-3 enemies
- Fogroot Crossing: `levelOffset: 2n` → target level 3, spawns level 2-4 enemies (but max template is 3)
- The level range `adjustedTarget +/- 1` means even the first combat location (Ashen Road) can spawn level 3 Blight Stalkers, Hexbinders, Gloom Stags

The location level offsets are too aggressive for the starter region. A level 1 character traveling to the second location already faces level 3 enemies.

### Enemy Template Level Summary
- Level 1: Thicket Wolf, Marsh Croaker, Dust Hare, Emberling (4 templates)
- Level 2: Bog Rat, Ember Wisp, Bandit, Grave Acolyte, Ash Jackal, Thorn Sprite, Mire Leech, Grave Skirmisher (8 templates)
- Level 3: Blight Stalker, Hexbinder, Gloom Stag, Fen Witch, Cinder Sentinel (5 templates)

### Key Constants
- `DEFAULT_LOCATION_SPAWNS = 3`
- `GROUP_SIZE_DANGER_BASE = 100n` (Hollowmere Vale region: `dangerMultiplier: 100n`)
- `ENEMY_RESPAWN_MICROS = 5 * 60 * 1_000_000n` (5 minutes)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Skip safe locations in all spawn functions</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Add `isSafe` checks to prevent enemy spawning in safe locations:

1. **`ensureLocationRuntimeBootstrap`** (line ~5263): Before the `while (count < DEFAULT_LOCATION_SPAWNS)` loop, add:
   ```typescript
   if (location.isSafe) continue;
   ```
   right after `for (const location of ctx.db.location.iter()) {` and before `ensureResourceNodesForLocation`. Actually, resource nodes should still spawn in towns, so add the `isSafe` skip AFTER `ensureResourceNodesForLocation(ctx, location.id)` but BEFORE the enemy spawn count/loop.

2. **`ensureSpawnsForLocation`** (line ~5239): At the top of the function, add early return:
   ```typescript
   const location = ctx.db.location.id.find(locationId);
   if (!location || location.isSafe) return;
   ```

3. **`tick_day_night` reducer** (line ~5344): In the `for (const location of ctx.db.location.iter())` loop, wrap the `respawnLocationSpawns` call:
   ```typescript
   if (!location.isSafe) {
     respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS);
   }
   respawnResourceNodesForLocation(ctx, location.id);
   ```
   (Resource nodes should still respawn in safe locations.)

4. **`respawn_enemy` reducer** (in `spacetimedb/src/reducers/combat.ts` line ~987): Add a safety check:
   ```typescript
   const location = ctx.db.location.id.find(arg.locationId);
   if (location?.isSafe) return;
   deps.spawnEnemy(ctx, arg.locationId, 1n);
   ```

Also, add a cleanup step in `ensureLocationRuntimeBootstrap` to delete existing spawns from safe locations (for existing databases):
   After the `isSafe` continue, but before the continue, delete any existing spawns at safe locations:
   ```typescript
   if (location.isSafe) {
     // Clean up any existing spawns in safe locations
     for (const row of ctx.db.enemySpawn.by_location.filter(location.id)) {
       for (const member of ctx.db.enemySpawnMember.by_spawn.filter(row.id)) {
         ctx.db.enemySpawnMember.id.delete(member.id);
       }
       ctx.db.enemySpawn.id.delete(row.id);
     }
     continue;
   }
   ```
  </action>
  <verify>
Read modified functions to confirm isSafe guards are present in all four locations. Grep for `isSafe` in index.ts and combat.ts to verify all spawn paths are guarded.
  </verify>
  <done>Safe locations (isSafe: true) are excluded from all enemy spawn creation paths: bootstrap, player movement/select, day/night respawn, and scheduled respawn. Existing spawns at safe locations are cleaned up on next publish.</done>
</task>

<task type="auto">
  <name>Task 2: Reduce starter zone location level offsets</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Adjust location `levelOffset` values in `ensureWorldLayout` for the Hollowmere Vale starter region to create a gentler progression for level 1 characters:

1. **Hollowmere** (town): Keep `levelOffset: 0n` and `isSafe: true` — no enemies after Task 1 fix
2. **Ashen Road**: Change `levelOffset: 1n` to `levelOffset: 0n` — this is the first combat zone, should spawn level 1 enemies (range 1-1 since min clamps to 1). Level 1 characters need level 1 enemies here.
3. **Fogroot Crossing**: Change `levelOffset: 2n` to `levelOffset: 1n` — second combat zone, should spawn level 1-2 enemies (target 2, range 1-3 but mostly 2s). Appropriate for characters who have gained a level.
4. **Bramble Hollow**: Change `levelOffset: 2n` to `levelOffset: 1n` — parallel to Fogroot, same difficulty tier.

This creates the progression:
- Hollowmere (town): Safe, no enemies
- Ashen Road: Level 1 enemies (Thicket Wolf, Dust Hare, Marsh Croaker, Emberling)
- Fogroot/Bramble: Level 1-2 enemies (mix of level 1 and level 2 templates)

Do NOT change the Embermarch region locations (gate, approach, depths) — those are appropriately higher level.
  </action>
  <verify>
Read the ensureWorldLayout function and verify levelOffset values: Hollowmere=0, Ashen Road=0, Fogroot=1, Bramble=1. Confirm no other location offsets were changed.
  </verify>
  <done>Starter zone level offsets create a gentle level 1 to level 2 progression appropriate for new characters. Ashen Road spawns level 1 enemies, Fogroot/Bramble spawn level 1-2 enemies.</done>
</task>

</tasks>

<verification>
After both tasks:
1. Grep for `isSafe` in spawn-related functions to confirm all paths are guarded
2. Verify levelOffset values in ensureWorldLayout match the intended progression
3. Confirm Hollowmere (isSafe: true) will have spawns cleaned up and no new ones created
4. Confirm resource nodes still spawn/respawn at safe locations (not blocked by isSafe guards)
</verification>

<success_criteria>
- Safe locations never have enemy spawns (created or persisted)
- Ashen Road (first combat zone) spawns level 1 enemies only
- Fogroot/Bramble spawn level 1-2 enemies as a gentle step up
- Resource nodes unaffected at all locations including towns
- No changes to non-starter regions (Embermarch etc.)
</success_criteria>

<output>
After completion, create `.planning/quick/72-investigate-spawn-rate-in-hollowmer-and-/72-SUMMARY.md`
</output>
