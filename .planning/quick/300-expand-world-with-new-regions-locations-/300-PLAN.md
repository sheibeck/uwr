---
phase: quick-300
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/seeding/ensure_world.ts
  - spacetimedb/src/seeding/ensure_enemies.ts
  - spacetimedb/src/data/dialogue_data.ts
autonomous: true
requirements: [WORLD-300]
must_haves:
  truths:
    - "World has at least 7 regions with 10 locations each"
    - "Regions form an interconnected map with multiple paths, not a linear chain"
    - "Content covers levels 1 through 12+ for group challenges"
    - "Each new region has NPCs with dialogue trees, quests of varied types, and level-appropriate enemies"
    - "New enemy templates cover levels 5-12 with diverse creature types and terrain coverage"
  artifacts:
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "New regions, locations, connections, NPCs, quests, dialogue"
    - path: "spacetimedb/src/seeding/ensure_enemies.ts"
      provides: "New enemy templates and role templates for levels 5-12"
    - path: "spacetimedb/src/data/dialogue_data.ts"
      provides: "Dialogue trees for all new NPCs"
  key_links:
    - from: "ensure_world.ts ensureWorldLayout"
      to: "ensure_world.ts ensureNpcs"
      via: "location names referenced in NPC locationName"
    - from: "ensure_world.ts ensureNpcs"
      to: "ensure_world.ts ensureQuestTemplates"
      via: "NPC names referenced in quest npcName"
    - from: "ensure_enemies.ts ensureEnemyTemplatesAndRoles"
      to: "ensure_world.ts ensureQuestTemplates"
      via: "enemy template names referenced in quest enemyName"
    - from: "ensure_world.ts ensureNpcs"
      to: "dialogue_data.ts NPC_DIALOGUE_OPTIONS"
      via: "NPC names referenced in dialogue npcName"
---

<objective>
Expand the world from 3 regions to 7+ regions with an interconnected, non-linear topology. Add new locations, NPCs, quests, enemies, and dialogue covering levels 1-12+ to support solo and group play.

Purpose: Create a rich, explorable world with diverse terrain, multiple pathways between regions, and challenging content that scales from starter solo play through max-level group content.

Output: Updated seeding files with complete world data for all new regions.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/seeding/ensure_world.ts (existing world layout, NPCs, quests, dialogue seeding patterns)
@spacetimedb/src/seeding/ensure_enemies.ts (existing enemy templates, role templates, loot tables)
@spacetimedb/src/seeding/ensure_content.ts (content sync order — enemies before quests, quests after NPCs)
@spacetimedb/src/data/npc_data.ts (NPC_PERSONALITIES — available personality presets)
@spacetimedb/src/data/dialogue_data.ts (dialogue option structure and patterns)
@spacetimedb/src/data/faction_data.ts (4 factions: Iron Compact, Verdant Circle, Ashen Order, Free Blades)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add new regions, locations, and inter-region connections to ensureWorldLayout</name>
  <files>spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
Add 4 new regions and their locations to `ensureWorldLayout()`, following the exact same `upsertRegionByName` / `upsertLocationByName` / `connectIfMissing` patterns already used.

## World Topology (interconnected, NOT linear)

The new world map should look like this conceptual topology:

```
                    Greyveil Moors (L3-5, outdoor)
                   /        |
  Hollowmere Vale --------- Silverpine Forest (L4-6, outdoor)
       |                         |
  Embermarch Fringe -------- Ironhold Garrison (L6-8, outdoor)
       |                         |
  Embermarch Depths          Dreadspire Ruins (L8-12, dungeon)
       |                    /
  Greyveil Moors (cross-link via Lichen Ridge)
```

Key connections making this non-linear:
- Hollowmere Vale connects to BOTH Embermarch Fringe (existing) AND Greyveil Moors AND Silverpine Forest
- Greyveil Moors connects to Hollowmere Vale AND Silverpine Forest
- Silverpine Forest connects to Greyveil Moors AND Ironhold Garrison
- Embermarch Fringe connects to Ironhold Garrison (cross-region shortcut)
- Ironhold Garrison connects to Silverpine Forest AND Dreadspire Ruins AND Embermarch Fringe
- Embermarch Depths connects back to Greyveil Moors (underground passage)

## New Regions

### Region 4: Greyveil Moors (dangerMultiplier: 140, regionType: 'outdoor')
A fog-shrouded moorland of standing stones and ancient burial mounds. Levels 3-5.

10 locations:
1. **Greyveil Crossroads** (town, levelOffset: 0, isSafe: true, bindStone: true, craftingAvailable: true) — "A windswept crossroads where moss-covered signposts point in every direction. A small inn offers warmth."
2. **Misthollow Bog** (swamp, levelOffset: 1) — "Thick fog clings to pools of dark water where unseen things splash and gurgle."
3. **Standing Stone Circle** (plains, levelOffset: 1) — "Twelve weathered megaliths form a circle on a treeless hilltop. Faint runes glow at dusk."
4. **Barrowfield** (plains, levelOffset: 2) — "Low earthen mounds stretch across a grey field. Some have been broken open."
5. **Thornmire Edge** (swamp, levelOffset: 2) — "Where the moor meets tangled briars, the ground squelches with every step."
6. **Cairn Heights** (mountains, levelOffset: 2) — "Rocky outcrops and cairn markers overlook the misty lowlands."
7. **Wraith Hollow** (woods, levelOffset: 3) — "Gnarled trees with bone-white bark grow in a silent depression. No birds sing here."
8. **Peat Quarry** (plains, levelOffset: 1) — "An abandoned peat-cutting operation. Tools still rust where they were dropped."
9. **Greywind Pass** (mountains, levelOffset: 3) — "A narrow mountain pass where wind screams through rocky teeth."
10. **Hauntwell Springs** (swamp, levelOffset: 3) — "Natural springs bubble up from deep underground, their water tinged grey with mineral deposits."

Connections within region:
- Greyveil Crossroads <-> Misthollow Bog, Standing Stone Circle, Peat Quarry, Barrowfield
- Misthollow Bog <-> Thornmire Edge, Hauntwell Springs
- Standing Stone Circle <-> Barrowfield, Cairn Heights
- Barrowfield <-> Wraith Hollow, Thornmire Edge
- Cairn Heights <-> Greywind Pass
- Wraith Hollow <-> Hauntwell Springs
- Thornmire Edge <-> Hauntwell Springs
- Greywind Pass <-> Wraith Hollow

Cross-region connections:
- Lichen Ridge (Hollowmere Vale) <-> Greyveil Crossroads
- Cairn Meadow (Hollowmere Vale) <-> Standing Stone Circle
- Greyveil Crossroads <-> first location of Silverpine Forest

### Region 5: Silverpine Forest (dangerMultiplier: 180, regionType: 'outdoor')
An ancient primeval forest where silver-barked pines tower above a canopy so thick that daylight barely penetrates. Levels 4-6.

10 locations:
1. **Silverroot Camp** (town, levelOffset: 0, isSafe: true, bindStone: true, craftingAvailable: true) — "A Verdant Circle outpost built around the roots of an enormous silver pine. Rope bridges connect platforms."
2. **Dappled Glade** (woods, levelOffset: 1) — "Shafts of pale light pierce the canopy, illuminating a clearing of soft moss and wildflowers."
3. **Webwood Thicket** (woods, levelOffset: 2) — "Dense webs stretch between trunks. The silk is strong as rope and sticky as pitch."
4. **Moonwell Clearing** (plains, levelOffset: 2) — "A natural clearing where a crystalline pool reflects the sky. The water hums faintly."
5. **Rootknot Caves** (dungeon, levelOffset: 3) — "Tree roots have broken through cave ceilings, creating a labyrinth of stone and wood."
6. **Darkpine Hollow** (woods, levelOffset: 3) — "The oldest trees grow here, their bark nearly black. Strange fungi glow between their roots."
7. **Owlwatch Ridge** (mountains, levelOffset: 2) — "A forested ridge where ancient owls roost in hollow trunks. Their eyes track all movement."
8. **Frostfern Dell** (woods, levelOffset: 2) — "Delicate frost-covered ferns grow year-round in this shaded valley. The air is always cold."
9. **Mossgrave Ruins** (plains, levelOffset: 3) — "Crumbling walls and broken arches of a civilization older than memory, reclaimed by moss and vine."
10. **Briarthorn Gate** (woods, levelOffset: 3) — "Massive thorny growths form a natural archway. Beyond lies the road to harder lands."

Connections within region:
- Silverroot Camp <-> Dappled Glade, Frostfern Dell, Owlwatch Ridge
- Dappled Glade <-> Webwood Thicket, Moonwell Clearing
- Webwood Thicket <-> Darkpine Hollow, Rootknot Caves
- Moonwell Clearing <-> Mossgrave Ruins, Owlwatch Ridge
- Darkpine Hollow <-> Briarthorn Gate, Mossgrave Ruins
- Owlwatch Ridge <-> Frostfern Dell
- Frostfern Dell <-> Rootknot Caves
- Briarthorn Gate <-> Mossgrave Ruins

Cross-region connections:
- Greyveil Crossroads (Greyveil Moors) <-> Silverroot Camp
- Thornveil Thicket (Hollowmere Vale) <-> Dappled Glade
- Briarthorn Gate <-> first location of Ironhold Garrison

### Region 6: Ironhold Garrison (dangerMultiplier: 220, regionType: 'outdoor')
A militarized highland fortress region controlled by the Iron Compact, built around ancient fortifications. Levels 6-8.

10 locations:
1. **Ironhold Keep** (town, levelOffset: 0, isSafe: true, bindStone: true, craftingAvailable: true) — "A massive stone keep with iron-banded gates. The Iron Compact banner flies from every tower."
2. **Sentinel Walk** (plains, levelOffset: 2) — "A raised stone walkway connecting watchtowers. Patrols march here constantly."
3. **Rusted Armory** (dungeon, levelOffset: 3) — "An underground armory where weapons and armor from forgotten wars line the walls."
4. **Windshear Bluffs** (mountains, levelOffset: 3) — "Howling winds tear across exposed cliff faces. Only the sure-footed survive."
5. **Siege Fields** (plains, levelOffset: 2) — "Scarred battlegrounds where siege engines rot. Bones still surface after rain."
6. **Quarantine Ward** (town, levelOffset: 3) — "A walled-off section of the garrison where the sick and cursed are kept."
7. **Ashfallow Trenches** (plains, levelOffset: 4) — "Deep trenches dug into volcanic soil. The air tastes of sulphur and iron."
8. **Forgecinder Foundry** (dungeon, levelOffset: 4) — "A massive underground foundry still burning with ancient fires. Constructs patrol the halls."
9. **Rampart Road** (mountains, levelOffset: 3) — "A fortified mountain road lined with arrow slits and murder holes."
10. **Dreadgate** (mountains, levelOffset: 4) — "The final fortification before the Dreadspire. Its gates have been breached from within."

Connections within region:
- Ironhold Keep <-> Sentinel Walk, Siege Fields, Rampart Road
- Sentinel Walk <-> Windshear Bluffs, Quarantine Ward
- Siege Fields <-> Ashfallow Trenches, Rusted Armory
- Windshear Bluffs <-> Rampart Road
- Ashfallow Trenches <-> Forgecinder Foundry
- Quarantine Ward <-> Rusted Armory
- Rampart Road <-> Dreadgate
- Forgecinder Foundry <-> Dreadgate
- Rusted Armory <-> Forgecinder Foundry

Cross-region connections:
- Briarthorn Gate (Silverpine Forest) <-> Ironhold Keep
- Pyre Overlook (Embermarch Fringe) <-> Rampart Road
- Dreadgate <-> first location of Dreadspire Ruins

### Region 7: Dreadspire Ruins (dangerMultiplier: 280, regionType: 'dungeon')
A collapsed tower-fortress that descends deep underground, corrupted by dark magic. Levels 8-12. Group content.

10 locations:
1. **Shattered Vestibule** (dungeon, levelOffset: 1) — "Broken columns and cracked floor tiles mark the entrance to the ruined spire. A cold wind blows upward from below."
2. **Wailing Gallery** (dungeon, levelOffset: 2) — "A long corridor where the wind produces an eerie wailing. Tattered tapestries line the walls."
3. **Spire Barracks** (dungeon, levelOffset: 2, isSafe: false, bindStone: true, craftingAvailable: true) — "An old military barracks repurposed as a forward camp. A forge still glows."
4. **Runecarver Chamber** (dungeon, levelOffset: 3) — "Arcane circles cover every surface. The air crackles with residual magic."
5. **Collapsing Atrium** (dungeon, levelOffset: 3) — "The central hall of the spire, its ceiling half-caved. Rubble creates natural chokepoints."
6. **Shadowvein Depths** (dungeon, levelOffset: 4) — "Deep tunnels where veins of dark crystal pulse with faint light. The darkness feels alive."
7. **Bone Reliquary** (dungeon, levelOffset: 4) — "Shelves of preserved bones and jars of viscera. A necromancer's laboratory."
8. **Dreadlord Ascent** (dungeon, levelOffset: 5) — "A spiraling staircase ascending through the intact upper levels. Guards watch from alcoves."
9. **Throne of Whispers** (dungeon, levelOffset: 5) — "The seat of power of the fallen Dreadlord. Shadows coalesce and disperse around the throne."
10. **The Abyssal Vault** (dungeon, levelOffset: 6) — "The deepest chamber, sealed behind wards. Something immensely powerful stirs within."

Connections within region:
- Shattered Vestibule <-> Wailing Gallery, Spire Barracks
- Wailing Gallery <-> Runecarver Chamber, Collapsing Atrium
- Spire Barracks <-> Collapsing Atrium
- Runecarver Chamber <-> Bone Reliquary
- Collapsing Atrium <-> Shadowvein Depths, Dreadlord Ascent
- Shadowvein Depths <-> Bone Reliquary, Throne of Whispers
- Bone Reliquary <-> Dreadlord Ascent
- Dreadlord Ascent <-> Throne of Whispers
- Throne of Whispers <-> The Abyssal Vault

Cross-region connections:
- Dreadgate (Ironhold Garrison) <-> Shattered Vestibule
- Ashwarden Throne (Embermarch Depths) <-> Shadowvein Depths (underground passage)

IMPORTANT: Do NOT modify any existing region, location, or connection code. Only ADD new code after the existing content. Follow the exact same variable naming and function call patterns.
  </action>
  <verify>
Run `npx tsc --noEmit --project C:/projects/uwr/spacetimedb/tsconfig.json` to verify no TypeScript errors. Manually count that each new region has exactly 10 locations. Verify cross-region connections exist between the specified locations.
  </verify>
  <done>
4 new regions added (Greyveil Moors, Silverpine Forest, Ironhold Garrison, Dreadspire Ruins) with 10 locations each. World topology is interconnected with at least 6 cross-region connections making multiple paths available. All locations have descriptions, correct terrain types, level offsets, and safe/bindStone/crafting flags. At least one safe town with bindStone per non-dungeon region plus one bindStone location in each dungeon.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add new enemy templates and role templates for levels 5-12</name>
  <files>spacetimedb/src/seeding/ensure_enemies.ts</files>
  <action>
Add new enemy templates to `ensureEnemyTemplatesAndRoles()` following the exact same `addEnemyTemplate` / `addRoleTemplate` patterns.

New enemies should fill the level 5-12 range across all terrain types, providing appropriate challenges for the new regions. Each template needs 2-3 role templates.

## New Enemy Templates

### Greyveil Moors enemies (levels 3-5):
1. **Moorland Harrier** — Level 3, beast, plains+swamp, day. Fast predatory bird. HP 28, damage 7, AC 8, XP 22. Verdant Circle.
   - Roles: moorland_harrier (dps/ranged, 'diving strike, screech'), moorland_harrier_swooper (dps/melee, 'swoop, rake')
2. **Barrow Wight** — Level 4, undead, plains, night. Risen dead from burial mounds. HP 34, damage 8, AC 11, XP 30. Ashen Order.
   - Roles: barrow_wight (tank/melee, 'death grip, wail'), barrow_wight_shade (dps/magic, 'shadow bolt, drain'), barrow_wight_guardian (tank/melee, 'shield wall, slam')
3. **Moor Hag** — Level 5, humanoid, swamp+woods, night. Ancient crone of the moors. HP 32, damage 7, AC 9, XP 36. Ashen Order.
   - Roles: moor_hag (support/magic, 'curse, hex ward'), moor_hag_cackler (dps/magic, 'cackle, blight bolt')

### Silverpine Forest enemies (levels 4-6):
4. **Webspinner** — Level 4, beast, woods, any. Giant spider that lurks in webs. HP 30, damage 7, AC 10, XP 28. Verdant Circle.
   - Roles: webspinner (dps/melee, 'venomous bite, web'), webspinner_lurker (support/melee, 'web trap, ambush'), webspinner_matriarch (tank/melee, 'shield cocoon, bite')
5. **Silverpine Sentinel** — Level 5, spirit, woods, day. Animated tree guardian. HP 44, damage 6, AC 14, XP 38. Verdant Circle.
   - Roles: silverpine_sentinel (tank/melee, 'root slam, bark shield'), silverpine_sentinel_warden (support/magic, 'entangle, thorns')
6. **Moss Troll** — Level 6, beast, woods+swamp, any. Regenerating brute covered in moss. HP 52, damage 9, AC 12, XP 44. Verdant Circle.
   - Roles: moss_troll (tank/melee, 'crush, regenerate'), moss_troll_hurler (dps/ranged, 'boulder throw, smash')
7. **Feral Druid** — Level 5, humanoid, woods+plains, day. Corrupted Verdant Circle member. HP 34, damage 8, AC 10, XP 36. Verdant Circle.
   - Roles: feral_druid (healer/support, 'wild mend, entangle'), feral_druid_shapeshifter (dps/melee, 'claw swipe, frenzy'), feral_druid_caller (support/magic, 'beast call, thorns')

### Ironhold Garrison enemies (levels 6-8):
8. **Iron Golem** — Level 7, construct, plains+dungeon, any. Iron Compact military construct. HP 62, damage 10, AC 16, XP 52. Iron Compact.
   - Roles: iron_golem (tank/melee, 'iron fist, bulwark'), iron_golem_siege (dps/melee, 'siege slam, cleave')
9. **Renegade Knight** — Level 7, humanoid, plains+mountains, day. Deserter from the garrison. HP 48, damage 11, AC 14, XP 50. Free Blades.
   - Roles: renegade_knight (tank/melee, 'shield charge, riposte'), renegade_knight_berserker (dps/melee, 'wild swing, frenzy'), renegade_knight_captain (support/melee, 'rally, command')
10. **Plague Cultist** — Level 6, humanoid, town+plains, night. Spreader of disease in the garrison. HP 36, damage 8, AC 9, XP 42. Ashen Order.
    - Roles: plague_cultist (dps/magic, 'plague bolt, miasma'), plague_cultist_preacher (support/magic, 'dark prayer, ward'), plague_cultist_fanatic (dps/melee, 'infected blade, frenzy')
11. **Warforged Hulk** — Level 8, construct, mountains+dungeon, any. Ancient war machine. HP 70, damage 11, AC 17, XP 58. Iron Compact.
    - Roles: warforged_hulk (tank/melee, 'iron crush, brace'), warforged_hulk_devastator (dps/melee, 'devastate, cleave')

### Dreadspire Ruins enemies (levels 8-12):
12. **Dreadspire Wraith** — Level 9, undead, dungeon, any. Ghostly guard of the spire. HP 56, damage 12, AC 12, XP 62. Ashen Order.
    - Roles: dreadspire_wraith (dps/magic, 'soul rend, phase shift'), dreadspire_wraith_anchor (tank/melee, 'spectral chain, drain'), dreadspire_wraith_howler (support/magic, 'terrifying howl, chill')
13. **Runebound Golem** — Level 10, construct, dungeon, any. Arcane-powered construct. HP 78, damage 13, AC 18, XP 70. Iron Compact.
    - Roles: runebound_golem (tank/melee, 'rune slam, arcane shield'), runebound_golem_shatterer (dps/melee, 'shatter, rune pulse')
14. **Shadow Necromancer** — Level 10, humanoid, dungeon, any. Dark spellcaster of the ruins. HP 44, damage 14, AC 10, XP 68. Ashen Order.
    - Roles: shadow_necromancer (dps/magic, 'death bolt, shadow blast'), shadow_necromancer_summoner (support/magic, 'raise dead, dark ward'), shadow_necromancer_lich (healer/support, 'soul siphon, dark mend')
15. **Abyssal Fiend** — Level 11, spirit, dungeon, any. Demon summoned from below. HP 66, damage 15, AC 14, XP 76. Ashen Order.
    - Roles: abyssal_fiend (dps/magic, 'hellfire, corruption'), abyssal_fiend_tormentor (dps/melee, 'rend, agony'), abyssal_fiend_guardian (tank/melee, 'abyssal ward, crush')
16. **Dread Knight** — Level 12, undead, dungeon, any. Elite undead warrior. HP 82, damage 16, AC 16, XP 84. Ashen Order.
    - Roles: dread_knight (tank/melee, 'unholy shield, death strike'), dread_knight_executioner (dps/melee, 'execute, cleave'), dread_knight_commander (support/melee, 'dark rally, command')

Use the same faction lookup pattern (`factionIdByName`) already in the function. Use `isSocial: true` for humanoids and undead, `isSocial: false` for beasts and spirits, `isSocial: true` for constructs. Set `groupMin: 1n, groupMax: 2n` for most, `groupMax: 3n` for dungeon enemies. Set `socialRadius` to 3n for humanoids/undead, 2n for beasts, 1n for spirits/constructs. Set `awareness: 'idle'` for all.
  </action>
  <verify>
Run `npx tsc --noEmit --project C:/projects/uwr/spacetimedb/tsconfig.json` to verify no TypeScript errors. Verify that each new enemy template has at least 2 role templates. Verify terrain types match the regions they should appear in.
  </verify>
  <done>
16 new enemy templates added covering levels 3-12 with full role templates. Terrain type coverage ensures enemies appear in the correct new regions. Levels 8-12 dungeon enemies provide group-appropriate challenges. All enemy templates follow existing patterns with proper faction assignments, creature types, and stat scaling.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add NPCs, quests, and dialogue for all new regions</name>
  <files>spacetimedb/src/seeding/ensure_world.ts, spacetimedb/src/data/dialogue_data.ts</files>
  <action>
Add NPCs and quests for each new region in `ensureNpcs()` and `ensureQuestTemplates()`, plus dialogue trees in `dialogue_data.ts`. Follow existing patterns exactly.

## NPCs (add to ensureNpcs)

### Greyveil Moors NPCs:
1. **Taverness Ellyn** — vendor, Greyveil Crossroads. "A no-nonsense innkeeper who trades supplies for news of the road." Personality: friendly_merchant. Faction: Free Blades.
2. **Moorcaller Phelan** — quest, Greyveil Crossroads. "A hooded figure who communes with the spirits of the moor." Personality: curious_scholar. Faction: Verdant Circle.
3. **Gravewatcher Maren** — quest, Barrowfield. "A somber woman who guards the barrow tombs from desecration." Personality: hardened_soldier. Faction: Ashen Order.
4. **Hermit Dunstan** — lore, Wraith Hollow. "A wild-eyed hermit who claims to hear the dead speak." Personality: bitter_exile.

### Silverpine Forest NPCs:
5. **Rootwarden Lyria** — quest, Silverroot Camp. "A Verdant Circle ranger who protects the oldest trees." Personality: veteran_scout. Faction: Verdant Circle.
6. **Alchemist Corwin** — vendor, Silverroot Camp. "A traveling alchemist who studies the unique properties of silverpine sap." Personality: shrewd_trader. Faction: Verdant Circle.
7. **Spider Hunter Vex** — quest, Webwood Thicket. "A scarred hunter who tracks the giant spiders deeper into the forest." Personality: hardened_soldier. Faction: Free Blades.
8. **Sage Tindra** — lore, Mossgrave Ruins. "An elderly scholar piecing together the history of the ruined civilization." Personality: wise_elder.

### Ironhold Garrison NPCs:
9. **Marshal Greyholt** — quest, Ironhold Keep. "The garrison's commanding officer, stern and unyielding." Personality: grumpy_guard. Faction: Iron Compact.
10. **Field Medic Saera** — quest, Quarantine Ward. "A tired healer working tirelessly to contain the plague." Personality: weary_healer. Faction: Iron Compact.
11. **Armorer Brant** — vendor, Ironhold Keep. "A master smith who forges the garrison's finest equipment." Personality: friendly_merchant. Faction: Iron Compact.
12. **Deserter Callum** — lore, Siege Fields. "A former knight who questions the Compact's methods." Personality: bitter_exile. Faction: Free Blades.

### Dreadspire Ruins NPCs:
13. **Pathfinder Zara** — quest, Spire Barracks. "A fearless explorer who maps the ruins' shifting corridors." Personality: veteran_scout. Faction: Free Blades.
14. **Arcanist Morvaine** — quest, Runecarver Chamber. "An Ashen Order scholar studying the spire's dark magic." Personality: curious_scholar. Faction: Ashen Order.
15. **Keeper of Bones** — lore, Bone Reliquary. "A disturbing figure who catalogs the dead with unsettling care." Personality: dungeon_warden. Faction: Ashen Order.

## Quests (add to ensureQuestTemplates)

### Greyveil Moors quests:
1. "Harrier Harassment" — Moorcaller Phelan, kill Moorland Harrier x4, level 3-5, 80 XP
2. "Barrow Blight" — Gravewatcher Maren, kill Barrow Wight x3, level 4-6, 110 XP
3. "Wight Relics" — Gravewatcher Maren, kill_loot Barrow Wight, target "Ancient Wight Relic", dropChance 25, level 4-6, 120 XP
4. "The Hermit's Warning" — Gravewatcher Maren, delivery to Hermit Dunstan, level 3-10, 90 XP
5. "Moorland Survey" — Moorcaller Phelan, explore Hauntwell Springs, target "Moorland Survey Notes", level 3-6, 100 XP

### Silverpine Forest quests:
6. "Spider Infestation" — Spider Hunter Vex, kill Webspinner x5, level 4-6, 120 XP
7. "Sentinel Communion" — Rootwarden Lyria, kill Silverpine Sentinel x3, level 5-7, 140 XP (story: corrupted sentinels need cleansing)
8. "Troll Slaying" — Spider Hunter Vex, kill Moss Troll x2, level 5-8, 160 XP
9. "Druid Corruption" — Rootwarden Lyria, kill Feral Druid x4, level 5-7, 130 XP
10. "Roots of Darkness" — Rootwarden Lyria, explore Rootknot Caves, target "Corrupted Root Sample", level 4-7, 110 XP
11. "The Lost Expedition" — Sage Tindra, explore Mossgrave Ruins, target "Expedition Journal", level 5-7, 120 XP
12. "Venom Harvest" — Spider Hunter Vex, kill_loot Webspinner, target "Spider Venom Sac", dropChance 30, level 4-6, 100 XP

### Ironhold Garrison quests:
13. "Golem Malfunction" — Marshal Greyholt, kill Iron Golem x3, level 6-8, 180 XP
14. "Renegade Roundup" — Marshal Greyholt, kill Renegade Knight x4, level 6-9, 200 XP
15. "Plague Source" — Field Medic Saera, kill Plague Cultist x5, level 6-8, 170 XP
16. "Cure Components" — Field Medic Saera, kill_loot Plague Cultist, target "Plague Sample", dropChance 20, level 6-8, 190 XP
17. "Foundry Sabotage" — Marshal Greyholt, explore Forgecinder Foundry, target "Foundry Control Key", level 7-9, 220 XP
18. "The Deserter's Intel" — Field Medic Saera, delivery to Deserter Callum, level 6-10, 150 XP

### Dreadspire Ruins quests (group content, higher rewards):
19. "Wraith Purge" — Pathfinder Zara, kill Dreadspire Wraith x5, level 8-12, 280 XP
20. "Golem Dismantling" — Pathfinder Zara, kill Runebound Golem x3, level 9-12, 320 XP
21. "Necromancer Hunt" — Arcanist Morvaine, kill Shadow Necromancer x3, level 9-12, 340 XP
22. "Fiend Banishment" — Arcanist Morvaine, kill Abyssal Fiend x2, level 10-12, 380 XP
23. "The Dread Knight" — Arcanist Morvaine, boss_kill Dread Knight, targetLocation "Throne of Whispers", targetItem "Dread Knight", level 10-12, 500 XP
24. "Abyssal Vault Key" — Pathfinder Zara, explore The Abyssal Vault, target "Abyssal Vault Key", level 10-12, 400 XP
25. "Dark Tomes" — Arcanist Morvaine, kill_loot Shadow Necromancer, target "Dark Tome", dropChance 15, level 9-12, 360 XP

## Dialogue Trees (add to dialogue_data.ts)

Add dialogue trees for all quest NPCs (not vendors or lore-only NPCs — they get simple dialogues). Follow the exact same `DialogueOptionSeed` structure. Each quest NPC should have:
- A root node (optionKey: '{npc_key}_root', parentOptionKey: null, playerText: '')
- 2-3 first-tier conversation topics (affinity 0)
- At least 1 quest-granting dialogue option
- 1 affinity-gated deeper topic (affinity 25)

Minimum dialogue patterns per NPC:

**Moorcaller Phelan**: root -> [moors] (lore, +2), [spirits] (quest: Harrier Harassment, +2), [survey] (quest: Moorland Survey, +2), [visions] (affinity 25, +3)

**Gravewatcher Maren**: root -> [barrows] (lore, +2), [wights] (quest: Barrow Blight, +2), [relics] (quest: Wight Relics, +2), [warning] (quest: The Hermit's Warning, +1), [duty] (affinity 25, +3)

**Rootwarden Lyria**: root -> [forest] (lore, +2), [corruption] (quest: Druid Corruption, +2), [sentinels] (quest: Sentinel Communion, +2), [roots] (quest: Roots of Darkness, +1), [bond] (affinity 25, +3)

**Spider Hunter Vex**: root -> [spiders] (quest: Spider Infestation, +2), [trolls] (quest: Troll Slaying, +2), [venom] (quest: Venom Harvest, +1), [scars] (affinity 25, +3)

**Marshal Greyholt**: root -> [garrison] (lore, +1), [golems] (quest: Golem Malfunction, +2), [renegades] (quest: Renegade Roundup, +2), [foundry] (quest: Foundry Sabotage, +2), [command] (affinity 25, +2)

**Field Medic Saera**: root -> [plague] (quest: Plague Source, +2), [cure] (quest: Cure Components, +2), [deserter] (quest: The Deserter's Intel, +1), [exhaustion] (affinity 25, +3)

**Pathfinder Zara**: root -> [ruins] (lore, +2), [wraiths] (quest: Wraith Purge, +2), [golems] (quest: Golem Dismantling, +2), [vault] (quest: Abyssal Vault Key, +2), [fear] (affinity 25, +3)

**Arcanist Morvaine**: root -> [magic] (lore, +2), [necromancers] (quest: Necromancer Hunt, +2), [fiends] (quest: Fiend Banishment, +2), [dreadknight] (quest: The Dread Knight, +2), [tomes] (quest: Dark Tomes, +1), [truth] (affinity 25, +3)

Write appropriate NPC response text that fits the character personality and world lore. Include [bracketed keywords] in NPC responses to indicate further conversation branches, matching the existing dialogue pattern.
  </action>
  <verify>
Run `npx tsc --noEmit --project C:/projects/uwr/spacetimedb/tsconfig.json` to verify no TypeScript errors. Verify every quest references a valid NPC name and enemy name (matching names exactly from Task 1 and Task 2). Verify every dialogue entry references a valid NPC name and quest template name.
  </verify>
  <done>
15 new NPCs added across all 4 new regions. 25 new quests covering kill, kill_loot, explore, delivery, and boss_kill types. Dialogue trees for all 8 quest NPCs with root nodes, first-tier topics, quest-granting dialogues, and affinity-gated deeper conversations. All names cross-reference correctly between NPCs, enemies, locations, and quests.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project C:/projects/uwr/spacetimedb/tsconfig.json` passes with no errors
2. Count regions in ensureWorldLayout: should be 7 total (3 existing + 4 new)
3. Count locations: should be approximately 70 total (30 existing + 40 new)
4. Verify cross-region connections create non-linear topology:
   - Hollowmere connects to Embermarch Fringe, Greyveil Moors, and Silverpine Forest
   - Embermarch Fringe connects to Ironhold Garrison
   - Embermarch Depths connects to Dreadspire Ruins
   - Greyveil Moors connects to Silverpine Forest
   - Silverpine Forest connects to Ironhold Garrison
   - Ironhold Garrison connects to Dreadspire Ruins
5. Enemy level coverage: levels 1-12 with no gaps
6. All new NPCs reference valid location names
7. All new quests reference valid NPC and enemy names
8. All dialogue entries reference valid NPC and quest names
</verification>

<success_criteria>
- World expanded from 3 regions to 7 regions with 10 locations each
- Non-linear interconnected topology with 6+ cross-region connections
- Level range extended from 1-6 to 1-12+ with appropriate enemy scaling
- 15+ new NPCs with varied types (quest, vendor, lore, banker)
- 25+ new quests spanning all quest types (kill, kill_loot, explore, delivery, boss_kill)
- Dialogue trees for all new quest NPCs
- All code compiles without TypeScript errors
- Existing content unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/300-expand-world-with-new-regions-locations-/300-SUMMARY.md`
</output>
