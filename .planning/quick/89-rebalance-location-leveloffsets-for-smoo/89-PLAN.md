---
phase: quick-89
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_world.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
autonomous: true
must_haves:
  truths:
    - "Starter zone (Hollowmere Vale) spawns level 1-2 enemies, mostly solo"
    - "Border region (Embermarch Fringe) spawns level 2-4 enemies, some groups"
    - "Dungeon region (Embermarch Depths) spawns level 3-5 enemies, mostly groups with solo options"
    - "Smooth progression from region to region with no jumps greater than 1-2 levels"
    - "All content stays within level 1-5 range for MVP"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "Rebalanced levelOffset values for all 30 locations"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "Adjusted groupMin/groupMax for region-appropriate group sizes"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_world.ts"
      to: "spacetimedb/src/helpers/location.ts"
      via: "computeLocationTargetLevel uses levelOffset + dangerMultiplier"
      pattern: "levelOffset"
    - from: "spacetimedb/src/seeding/ensure_enemies.ts"
      to: "spacetimedb/src/helpers/location.ts"
      via: "spawnEnemy uses groupMin/groupMax from enemy templates"
      pattern: "groupMin|groupMax"
---

<objective>
Rebalance location levelOffsets and enemy group sizes across all 3 regions for a smooth level 1-5 progression curve.

Purpose: Current offsets produce enemy target levels up to 8 in the dungeon (far beyond MVP cap of 5), and border region jumps from 3 to 7. Group sizes don't differentiate between starter (solo-friendly) and dungeon (group-oriented) content.

Output: Updated levelOffset values in ensure_world.ts and groupMin/groupMax in ensure_enemies.ts that produce a smooth 1-5 progression across starter -> border -> dungeon.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/helpers/location.ts
@spacetimedb/src/data/combat_constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebalance location levelOffsets for smooth 1-5 progression</name>
  <files>spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
Update levelOffset values in `ensureWorldLayout` for all non-safe locations. The target level formula is:
`targetLevel = (baseLevel * dangerMultiplier / 100) + levelOffset`
where baseLevel=1 is passed by spawn functions.

Key: dangerMultipliers are Hollowmere Vale=100 (scaled=1), Embermarch Fringe=160 (scaled=1 due to bigint), Embermarch Depths=200 (scaled=2).

**Hollowmere Vale (starter, target levels 1-2, safe for level 1 solo characters):**
All locations should have levelOffset 0 or 1 only. Currently Thornveil and Lichen Ridge have offset 2 (target 3) -- reduce both to 1n (target 2).

Specific changes (leave all others unchanged):
- Thornveil Thicket: levelOffset 2n -> 1n (target 3 -> target 2)
- Lichen Ridge: levelOffset 2n -> 1n (target 3 -> target 2)

This gives starter zone: Hollowmere=safe, Ashen Road/Ironbell=target 1, all others=target 2.

**Embermarch Fringe (border, target levels 2-4, progression from starter):**
Currently offsets 2-6 produce targets 3-7. Reduce to produce targets 2-4.

Specific changes:
- Embermarch Gate: levelOffset 2n -> 1n (target 3 -> target 2, entry point from starter)
- Cinderwatch: levelOffset 4n -> 2n (target 5 -> target 3)
- Slagstone Waystation: levelOffset 3n -> 2n (target 4 -> target 3, safe town -- cosmetic only)
- Scoria Flats: levelOffset 4n -> 2n (target 5 -> target 3)
- Brimstone Gulch: levelOffset 4n -> 3n (target 5 -> target 4)
- Charwood Copse: levelOffset 5n -> 3n (target 6 -> target 4)
- Smolder Marsh: levelOffset 5n -> 3n (target 6 -> target 4)
- Ironvein Pass: levelOffset 6n -> 4n (target 7 -> target 5)
- Pyre Overlook: levelOffset 6n -> 4n (target 7 -> target 5)
- Ashfen Hollow: levelOffset 4n -> 2n (target 5 -> target 3)

This gives border: entry=target 2, middle=target 3-4, far end=target 5.

**Embermarch Depths (dungeon, target levels 3-5, hardest content):**
Currently offsets 2-6 with scaled=2 produce targets 4-8. Reduce to produce targets 3-5.

Specific changes:
- Ashvault Entrance: levelOffset 2n -> 1n (target 4 -> target 3, dungeon entrance)
- Sootveil Hall: levelOffset 3n -> 2n (target 5 -> target 4)
- Furnace Crypt: levelOffset 4n -> 3n (target 6 -> target 5)
- Slag Tunnels: levelOffset 2n -> 1n (target 4 -> target 3)
- The Crucible: levelOffset 4n -> 3n (target 6 -> target 5)
- Bonecinder Gallery: levelOffset 3n -> 2n (target 5 -> target 4)
- Embervault Sanctum: levelOffset 5n -> 3n (target 7 -> target 5)
- Cinder Wellspring: levelOffset 5n -> 3n (target 7 -> target 5)
- Gloomspire Landing: levelOffset 3n -> 2n (target 5 -> target 4)
- Ashwarden Throne: levelOffset 6n -> 3n (target 8 -> target 5)

This gives dungeon: entrance=target 3, middle=target 4, deep rooms=target 5.
  </action>
  <verify>
Grep for levelOffset in ensure_world.ts and manually verify:
- All Hollowmere Vale locations have levelOffset 0n or 1n
- All Embermarch Fringe locations have levelOffset 1n-4n
- All Embermarch Depths locations have levelOffset 1n-3n
- No levelOffset exceeds 4n anywhere
  </verify>
  <done>
All 30 locations have levelOffsets that produce target levels within the 1-5 range for MVP. Starter zone targets 1-2, border targets 2-5, dungeon targets 3-5.
  </done>
</task>

<task type="auto">
  <name>Task 2: Adjust enemy template group sizes by region tier</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
Adjust groupMin/groupMax on enemy templates to match the region difficulty philosophy. The terrain-based location-enemy-template mapping means enemies are matched to locations by terrainType, so we use terrain as a proxy for region tier.

**Starter-zone enemies (terrainTypes including plains, woods, swamp -- level 1-2 templates):**
These should be mostly solo with occasional pairs. Reduce groupMax for level 1-2 enemies that can appear in starter zones.

Specific changes to groupMax (keep groupMin at 1n for all):
- Thicket Wolf (level 1, woods/plains): groupMax 3n -> 2n (solo or pair)
- Emberling (level 1, mountains/plains): groupMax 3n -> 2n (solo or pair)
- Ember Wisp (level 2, plains/mountains): groupMax 3n -> 2n (solo or pair)
- Bandit (level 2, plains/woods): groupMax 3n -> 2n (solo or pair)
- Grave Skirmisher (level 2, town/city): groupMax 3n -> 2n (solo or pair)

Leave these UNCHANGED (already at groupMax 2n or are level 3+ border/dungeon enemies):
- Bog Rat (level 2, swamp): groupMax 2n -- already correct
- Marsh Croaker (level 1, swamp): groupMax 2n -- already correct
- Dust Hare (level 1, plains): groupMax 2n -- already correct
- Ash Jackal (level 2, plains): groupMax 2n -- already correct
- Thorn Sprite (level 2, woods): groupMax 2n -- already correct
- Mire Leech (level 2, swamp): groupMax 2n -- already correct
- Grave Acolyte (level 2, town/city): groupMax 2n -- already correct

**Border/dungeon enemies (level 3-4 templates):**
These should allow moderate groups for border content. Increase groupMax slightly for variety.

Specific changes:
- Blight Stalker (level 3, woods/swamp): groupMax 4n -> 3n (reduce from 4 since it appears in starter-adjacent woods)
- Alley Shade (level 4, town/city): groupMax 3n -> 2n (keep as solo/pair since town terrain)
- Ridge Skirmisher (level 3, mountains): groupMax 3n -- keep (appropriate for border mountains)

**Dungeon enemies (level 4-6, terrainType=dungeon):**
These should have larger groups to challenge level 5 parties, but with solo options (groupMin stays 1n).

Specific changes:
- Vault Sentinel (level 4, dungeon): groupMax 2n -> 3n (small groups in dungeon)
- Sootbound Mystic (level 5, dungeon): groupMax 2n -> 3n (small groups in dungeon)
- Ember Priest (level 5, dungeon): groupMax 2n -> 3n (small groups in dungeon)
- Ashforged Revenant (level 6, dungeon): groupMax 2n -> 3n (small groups for boss-like encounters)

All dungeon enemies keep groupMin 1n so solo encounters remain possible.
  </action>
  <verify>
Grep for groupMax in ensure_enemies.ts and verify:
- Level 1-2 enemies (starter zone capable): all have groupMax <= 2n
- Level 3 enemies: groupMax 2n-3n
- Level 4-6 dungeon enemies: groupMax 3n
- No enemy has groupMax > 3n (was 4 for Blight Stalker)
- All enemies retain groupMin 1n
  </verify>
  <done>
Enemy group sizes differentiate by region tier: starter enemies solo/pairs (groupMax 2), border enemies small groups (groupMax 2-3), dungeon enemies moderate groups (groupMax 3) with solo options (groupMin 1). Blight Stalker reduced from max 4 to 3.
  </done>
</task>

</tasks>

<verification>
After both tasks, verify the complete progression curve by computing target levels for all locations:

Hollowmere Vale (dangerMultiplier=100, scaled=1):
- Hollowmere: 1+0=1 (safe, no enemies)
- Ashen Road: 1+0=1
- Ironbell Farmstead: 1+0=1
- Fogroot Crossing: 1+1=2
- Bramble Hollow: 1+1=2
- Willowfen: 1+1=2
- Duskwater Shallows: 1+1=2
- Cairn Meadow: 1+1=2
- Thornveil Thicket: 1+1=2
- Lichen Ridge: 1+1=2

Embermarch Fringe (dangerMultiplier=160, scaled=1):
- Embermarch Gate: 1+1=2
- Slagstone Waystation: 1+2=3 (safe)
- Ashfen Hollow: 1+2=3
- Cinderwatch: 1+2=3
- Scoria Flats: 1+2=3
- Brimstone Gulch: 1+3=4
- Charwood Copse: 1+3=4
- Smolder Marsh: 1+3=4
- Ironvein Pass: 1+4=5
- Pyre Overlook: 1+4=5

Embermarch Depths (dangerMultiplier=200, scaled=2):
- Ashvault Entrance: 2+1=3
- Slag Tunnels: 2+1=3
- Sootveil Hall: 2+2=4
- Bonecinder Gallery: 2+2=4
- Gloomspire Landing: 2+2=4
- Furnace Crypt: 2+3=5
- The Crucible: 2+3=5
- Embervault Sanctum: 2+3=5
- Cinder Wellspring: 2+3=5
- Ashwarden Throne: 2+3=5

Progression: Starter 1-2, Border 2-5, Dungeon 3-5. All within MVP level 1-5 cap.
</verification>

<success_criteria>
- All locations produce target levels within 1-5 range
- Starter zone (Hollowmere Vale): targets 1-2 only, enemies mostly solo (groupMax 2)
- Border region (Embermarch Fringe): targets 2-5, some groups (groupMax 2-3)
- Dungeon region (Embermarch Depths): targets 3-5, mostly groups (groupMax 3) with solo options (groupMin 1)
- Smooth gradient with no level jumps > 2 between adjacent areas
- Module compiles and publishes successfully
</success_criteria>

<output>
After completion, create `.planning/quick/89-rebalance-location-leveloffsets-for-smoo/89-SUMMARY.md`
</output>
