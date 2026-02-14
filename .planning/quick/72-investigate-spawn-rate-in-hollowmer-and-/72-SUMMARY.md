---
phase: quick-72
plan: 01
subsystem: enemy-spawning
tags: [bug-fix, game-balance, new-player-experience]
dependency_graph:
  requires: [location-system, enemy-spawn-system]
  provides: [safe-location-guarantee, level-appropriate-starter-enemies]
  affects: [bootstrap-seeding, day-night-cycle, enemy-respawn]
tech_stack:
  patterns: [early-return-guards, cleanup-on-bootstrap, level-offset-tuning]
key_files:
  created: []
  modified:
    - spacetimedb/src/index.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "Safe locations (isSafe: true) excluded from all enemy spawn paths via early return guards"
  - "Existing spawns at safe locations cleaned up during bootstrap for existing databases"
  - "Resource node spawning unaffected - still works at safe locations"
  - "Starter zone level offsets reduced: Ashen Road 1->0, Fogroot/Bramble 2->1"
  - "Non-starter regions (Embermarch) unchanged to preserve intended difficulty curve"
metrics:
  duration_minutes: 3
  completed_date: 2026-02-13
  tasks_completed: 2
  files_modified: 2
  commits: 2
---

# Quick Task 72: Fix Enemy Spawn Rate and Levels in Starter Zones

**One-liner:** Safe locations (Hollowmere) now skip all enemy spawning via isSafe guards, and starter zone level offsets reduced (Ashen Road 0, Fogroot/Bramble 1) for gentle level 1-2 progression appropriate for new characters.

---

## Objective

Fix enemy spawn rate and level issues in starter zones. Players in Hollowmere (a safe town) were encountering 6 groups of enemies at once, and starter zone enemies were too high level for fresh level 1 characters, making the new player experience frustrating.

---

## Root Causes Identified

### Problem 1: Safe Towns Spawning Enemies
Three spawn sources stacked on safe locations:
1. `ensureLocationRuntimeBootstrap()` - spawned DEFAULT_LOCATION_SPAWNS (3) per location
2. `ensureSpawnsForLocation()` - created spawns based on active player count
3. `tick_day_night` - called `respawnLocationSpawns()` on day/night transitions

None checked `location.isSafe`, resulting in 6+ enemy groups in Hollowmere.

### Problem 2: Starter Zone Levels Too High
- Ashen Road (levelOffset: 1) spawned level 1-3 enemies (target 2, range ±1)
- Fogroot Crossing (levelOffset: 2) spawned level 2-4 enemies (target 3, range ±1)
- Level 1 characters faced level 3 Blight Stalkers, Hexbinders in second combat zone

---

## Tasks Completed

### Task 1: Skip Safe Locations in All Spawn Functions
**Commit:** `11d05f7`

Added `isSafe` checks to prevent enemy spawning in safe locations:

1. **`ensureSpawnsForLocation`** (line ~5239): Early return if location is safe
   ```typescript
   const location = ctx.db.location.id.find(locationId);
   if (!location || location.isSafe) return;
   ```

2. **`ensureLocationRuntimeBootstrap`** (line ~5263): Clean up existing spawns and skip spawn creation
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
   Resource nodes still spawn (call happens BEFORE isSafe check).

3. **`tick_day_night` reducer** (line ~5344): Skip respawn for safe locations
   ```typescript
   if (!location.isSafe) {
     respawnLocationSpawns(ctx, location.id, DEFAULT_LOCATION_SPAWNS);
   }
   respawnResourceNodesForLocation(ctx, location.id);
   ```

4. **`respawn_enemy` reducer** (combat.ts line ~987): Safety check before spawning
   ```typescript
   const location = ctx.db.location.id.find(arg.locationId);
   if (location?.isSafe) return;
   deps.spawnEnemy(ctx, arg.locationId, 1n);
   ```

**Files modified:**
- `spacetimedb/src/index.ts` (3 spawn functions)
- `spacetimedb/src/reducers/combat.ts` (1 reducer)

---

### Task 2: Reduce Starter Zone Location Level Offsets
**Commit:** `f22fb20`

Adjusted `levelOffset` values in `ensureWorldLayout` for gentle level 1-2 progression:

| Location | Old Offset | New Offset | Enemy Levels | Notes |
|----------|------------|------------|--------------|-------|
| Hollowmere | 0n | 0n | None | isSafe: true - no enemies after Task 1 |
| Ashen Road | 1n | **0n** | Level 1 | First combat zone, level 1 templates only |
| Fogroot Crossing | 2n | **1n** | Level 1-2 | Second combat zone, gentle step up |
| Bramble Hollow | 2n | **1n** | Level 1-2 | Parallel to Fogroot |
| Embermarch Gate | 3n | 3n | Level 2-4 | Unchanged - appropriate for higher level |

**Enemy Template Distribution:**
- Level 1: Thicket Wolf, Marsh Croaker, Dust Hare, Emberling (4 templates)
- Level 2: Bog Rat, Ember Wisp, Bandit, Grave Acolyte, Ash Jackal, Thorn Sprite, Mire Leech, Grave Skirmisher (8 templates)
- Level 3: Blight Stalker, Hexbinder, Gloom Stag, Fen Witch, Cinder Sentinel (5 templates)

**Progression:**
- Hollowmere: Safe, no enemies
- Ashen Road: Level 1 enemies (Thicket Wolf, Dust Hare, Marsh Croaker, Emberling)
- Fogroot/Bramble: Level 1-2 enemy mix (appropriate for characters who gained a level)

**Files modified:**
- `spacetimedb/src/index.ts` (3 location definitions)

---

## Deviations from Plan

None - plan executed exactly as written.

---

## Verification

Grep verification confirmed:
1. All four spawn paths have `isSafe` guards:
   - `ensureSpawnsForLocation` (line 5241)
   - `ensureLocationRuntimeBootstrap` (line 5270)
   - `tick_day_night` (line 5360)
   - `respawn_enemy` (combat.ts line 989)

2. Resource nodes unaffected:
   - `ensureResourceNodesForLocation` called BEFORE `isSafe` check
   - Still spawns/respawns at all locations including towns

3. Level offsets match intended progression:
   - Hollowmere: 0n (isSafe: true)
   - Ashen Road: 0n
   - Fogroot: 1n
   - Bramble: 1n
   - No changes to non-starter regions

---

## Success Criteria Met

- [x] Safe locations never have enemy spawns (created or persisted)
- [x] Ashen Road (first combat zone) spawns level 1 enemies only
- [x] Fogroot/Bramble spawn level 1-2 enemies as gentle step up
- [x] Resource nodes unaffected at all locations including towns
- [x] No changes to non-starter regions (Embermarch etc.)

---

## Impact

**For new players:**
- Hollowmere is now truly safe - no enemy spawns on bootstrap, movement, or day/night cycle
- First combat (Ashen Road) features level 1 enemies matching fresh characters
- Progression from level 1 to level 2 enemies is gentle and predictable

**For existing databases:**
- Bootstrap cleanup removes existing spawns from safe locations on next publish
- Level offset changes apply immediately via upsert pattern

**Technical debt:**
- None introduced - guards follow existing pattern, level offsets are data-only

---

## Self-Check: PASSED

**Files verified:**
- [x] `spacetimedb/src/index.ts` exists and contains all modifications
- [x] `spacetimedb/src/reducers/combat.ts` exists and contains respawn_enemy guard

**Commits verified:**
- [x] Commit `11d05f7` exists: "fix(quick-72): skip safe locations in all enemy spawn functions"
- [x] Commit `f22fb20` exists: "fix(quick-72): reduce starter zone location level offsets"

**Implementation verified:**
- [x] 4 spawn functions have isSafe guards
- [x] 3 starter locations have reduced level offsets
- [x] Resource nodes still spawn in safe locations
- [x] Non-starter regions unchanged
