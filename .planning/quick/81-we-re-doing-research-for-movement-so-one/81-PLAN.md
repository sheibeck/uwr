---
phase: quick-81
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_world.ts
autonomous: true
must_haves:
  truths:
    - "Hollowmere Vale has 10 locations with varied terrain types"
    - "Embermarch Fringe has 10 locations with varied terrain types"
    - "Embermarch Depths has 10 locations all using dungeon terrain"
    - "All locations are connected in a sensible graph within their region"
    - "Cross-region connections exist at boundary locations"
    - "Module compiles and publishes successfully"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "ensureWorldLayout with 30 locations across 3 regions"
  key_links:
    - from: "spacetimedb/src/seeding/ensure_world.ts"
      to: "spacetimedb/src/seeding/ensure_content.ts"
      via: "ensureWorldLayout called from syncAllContent"
      pattern: "ensureWorldLayout"
---

<objective>
Expand the world from 9 locations to 30 locations (10 per region) to support movement research and create a richer world.

Purpose: More locations give players meaningful travel choices and make movement systems more engaging. Each region should feel distinct with varied terrain, safe/unsafe zones, and interesting progression.
Output: Updated ensureWorldLayout in ensure_world.ts with 21 new locations and their connections.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/helpers/location.ts
@src/module_bindings/location_type.ts
@src/module_bindings/region_type.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand all 3 regions to 10 locations each</name>
  <files>spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
In the `ensureWorldLayout` function, expand each region to have exactly 10 locations. Keep all 9 existing locations UNCHANGED (same names, descriptions, terrain types, level offsets, safe flags, bind stones, crafting). Add new locations using `upsertLocationByName` with the same pattern.

**IMPORTANT:** The existing `areLocationsConnected` import and `connectIfMissing` helper must be used for all new connections. The upsert pattern ensures idempotent seeding.

## Hollowmere Vale (starter region, dangerMultiplier: 100)
Currently has 4 locations. Add 6 new ones:

5. **Willowfen** - description: "Drooping willows arch over stagnant pools buzzing with marsh flies.", zone: "Starter", levelOffset: 1n, isSafe: false, terrainType: "swamp", bindStone: false, craftingAvailable: false
6. **Ironbell Farmstead** - description: "An abandoned farmstead where a rusted bell still hangs in the rafters.", zone: "Starter", levelOffset: 0n, isSafe: true, terrainType: "plains", bindStone: true, craftingAvailable: false
7. **Duskwater Shallows** - description: "Ankle-deep water stretches across a grey mudflat dotted with reeds.", zone: "Starter", levelOffset: 1n, isSafe: false, terrainType: "swamp", bindStone: false, craftingAvailable: false
8. **Thornveil Thicket** - description: "Barbed vines weave a living wall between ancient oaks.", zone: "Starter", levelOffset: 2n, isSafe: false, terrainType: "woods", bindStone: false, craftingAvailable: false
9. **Lichen Ridge** - description: "A low ridge of mossy boulders overlooking the marshlands below.", zone: "Starter", levelOffset: 2n, isSafe: false, terrainType: "mountains", bindStone: false, craftingAvailable: false
10. **Cairn Meadow** - description: "Tall grass sways around weathered stone cairns left by forgotten travelers.", zone: "Starter", levelOffset: 1n, isSafe: false, terrainType: "plains", bindStone: false, craftingAvailable: false

Connections for Hollowmere Vale (keep existing + add):
- Hollowmere <-> Ironbell Farmstead (safe hub connection)
- Hollowmere <-> Cairn Meadow
- Ironbell Farmstead <-> Cairn Meadow
- Ashen Road <-> Cairn Meadow
- Ashen Road <-> Lichen Ridge
- Fogroot Crossing <-> Willowfen
- Fogroot Crossing <-> Duskwater Shallows
- Bramble Hollow <-> Thornveil Thicket
- Willowfen <-> Duskwater Shallows
- Thornveil Thicket <-> Lichen Ridge

## Embermarch Fringe (border region, dangerMultiplier: 160)
Currently has 2 locations. Add 8 new ones:

3. **Slagstone Waystation** - description: "A crumbling waystation built from dark volcanic stone, offering meager shelter.", zone: "Border", levelOffset: 3n, isSafe: true, terrainType: "town", bindStone: true, craftingAvailable: true
4. **Scoria Flats** - description: "Black glass shards crunch underfoot across a blasted volcanic plain.", zone: "Border", levelOffset: 4n, isSafe: false, terrainType: "plains", bindStone: false, craftingAvailable: false
5. **Brimstone Gulch** - description: "Sulfurous fumes rise from cracks in this narrow ravine.", zone: "Border", levelOffset: 4n, isSafe: false, terrainType: "mountains", bindStone: false, craftingAvailable: false
6. **Charwood Copse** - description: "Petrified trees stand like black sentinels in this scorched woodland.", zone: "Border", levelOffset: 5n, isSafe: false, terrainType: "woods", bindStone: false, craftingAvailable: false
7. **Smolder Marsh** - description: "Steam curls from warm, bubbling pools in this geothermal swamp.", zone: "Border", levelOffset: 5n, isSafe: false, terrainType: "swamp", bindStone: false, craftingAvailable: false
8. **Ironvein Pass** - description: "Exposed ore veins streak the walls of this wind-scoured mountain pass.", zone: "Border", levelOffset: 6n, isSafe: false, terrainType: "mountains", bindStone: false, craftingAvailable: false
9. **Pyre Overlook** - description: "A scorched clifftop with a commanding view of the ember-lit valleys below.", zone: "Border", levelOffset: 6n, isSafe: false, terrainType: "mountains", bindStone: false, craftingAvailable: false
10. **Ashfen Hollow** - description: "Ash-grey reeds choke a low basin where embers drift on the wind.", zone: "Border", levelOffset: 4n, isSafe: false, terrainType: "swamp", bindStone: false, craftingAvailable: false

Connections for Embermarch Fringe (keep existing + add):
- Embermarch Gate <-> Slagstone Waystation
- Embermarch Gate <-> Scoria Flats
- Embermarch Gate <-> Ashfen Hollow
- Slagstone Waystation <-> Brimstone Gulch
- Slagstone Waystation <-> Scoria Flats
- Scoria Flats <-> Charwood Copse
- Scoria Flats <-> Ashfen Hollow
- Brimstone Gulch <-> Ironvein Pass
- Charwood Copse <-> Smolder Marsh
- Cinderwatch <-> Charwood Copse
- Cinderwatch <-> Pyre Overlook
- Ironvein Pass <-> Pyre Overlook
- Smolder Marsh <-> Ashfen Hollow

## Embermarch Depths (dungeon region, dangerMultiplier: 200)
Currently has 3 locations. Add 7 new ones (ALL use terrainType: "dungeon"):

4. **Slag Tunnels** - description: "Narrow passages carved by ancient lava flows, walls still warm to the touch.", zone: "Dungeon", levelOffset: 2n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false
5. **The Crucible** - description: "A vast underground forge hall where molten metal once flowed like rivers.", zone: "Dungeon", levelOffset: 4n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false
6. **Bonecinder Gallery** - description: "Charred skeletal remains line alcoves in this grim processional corridor.", zone: "Dungeon", levelOffset: 3n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false
7. **Embervault Sanctum** - description: "A sealed chamber where restless embers orbit a cracked obsidian altar.", zone: "Dungeon", levelOffset: 5n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false
8. **Cinder Wellspring** - description: "A deep shaft where magma glows far below, heating the stone floor above.", zone: "Dungeon", levelOffset: 5n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false
9. **Gloomspire Landing** - description: "A wide ledge overlooking a bottomless chasm spanned by a chain bridge.", zone: "Dungeon", levelOffset: 3n, isSafe: false, terrainType: "dungeon", bindStone: true, craftingAvailable: false
10. **Ashwarden Throne** - description: "The deepest chamber where an empty throne of fused iron and bone awaits.", zone: "Dungeon", levelOffset: 6n, isSafe: false, terrainType: "dungeon", bindStone: false, craftingAvailable: false

Connections for Embermarch Depths (keep existing + add):
- Ashvault Entrance <-> Slag Tunnels
- Ashvault Entrance <-> Bonecinder Gallery
- Slag Tunnels <-> Gloomspire Landing
- Sootveil Hall <-> Bonecinder Gallery
- Sootveil Hall <-> The Crucible
- Bonecinder Gallery <-> Gloomspire Landing
- Gloomspire Landing <-> The Crucible
- The Crucible <-> Cinder Wellspring
- Furnace Crypt <-> Embervault Sanctum
- Furnace Crypt <-> Cinder Wellspring
- Cinder Wellspring <-> Ashwarden Throne
- Embervault Sanctum <-> Ashwarden Throne

Store each new location in a local variable (matching the pattern of existing code) so it can be referenced in connectIfMissing calls. Use the exact same upsertLocationByName and connectIfMissing patterns already in the function.

Do NOT modify any other functions in this file (ensureNpcs, ensureQuestTemplates, ensureEnemyAbilities).
  </action>
  <verify>
Run `cd C:/projects/uwr && npx tsc --noEmit --project spacetimedb/tsconfig.json` to verify TypeScript compilation. If that command doesn't work, try `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit`. Verify no type errors.
  </verify>
  <done>
ensureWorldLayout contains 30 locations (10 per region) with sensible terrain variety, level progression, and interconnected travel graphs. Each region has at least one safe location. The module compiles without errors.
  </done>
</task>

</tasks>

<verification>
- Count locations: grep for `upsertLocationByName` calls should show exactly 30
- Count connections: grep for `connectIfMissing` calls should show significant increase from original 8
- TypeScript compilation passes
- Each region has 10 locations
- Level offsets increase logically within each region
- Terrain types are varied within outdoor regions
</verification>

<success_criteria>
- 30 total locations across 3 regions (10 each)
- All existing 9 locations unchanged
- All new locations properly connected via connectIfMissing
- Cross-region boundary connections preserved (Fogroot->Gate, Gate->Ashvault)
- Module compiles successfully
- Terrain variety within each outdoor region (no region is all one terrain)
</success_criteria>

<output>
After completion, create `.planning/quick/81-we-re-doing-research-for-movement-so-one/81-SUMMARY.md`
</output>
