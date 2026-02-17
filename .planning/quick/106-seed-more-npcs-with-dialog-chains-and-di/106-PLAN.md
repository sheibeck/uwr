---
phase: quick-106
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/npc_data.ts
  - spacetimedb/src/data/dialogue_data.ts
  - spacetimedb/src/seeding/ensure_world.ts
autonomous: true
must_haves:
  truths:
    - "NPCs exist in all three regions, not just Hollowmere"
    - "Each NPC has a multi-tier dialogue tree with affinity-gated deeper conversation"
    - "Kill quests exist for varied enemies across regions and level ranges"
    - "Running /synccontent seeds all new NPCs, quests, and dialogue options"
  artifacts:
    - path: "spacetimedb/src/data/npc_data.ts"
      provides: "New NPC personality definitions for diverse NPC archetypes"
    - path: "spacetimedb/src/data/dialogue_data.ts"
      provides: "Dialog chains for all new NPCs (root greeting, topics, affinity-gated tiers)"
    - path: "spacetimedb/src/seeding/ensure_world.ts"
      provides: "NPC upsert calls and quest template upsert calls for new content"
  key_links:
    - from: "spacetimedb/src/data/dialogue_data.ts"
      to: "spacetimedb/src/seeding/ensure_world.ts"
      via: "NPC_DIALOGUE_OPTIONS array consumed by ensureDialogueOptions"
      pattern: "NPC_DIALOGUE_OPTIONS"
    - from: "spacetimedb/src/seeding/ensure_world.ts"
      to: "spacetimedb/src/seeding/ensure_content.ts"
      via: "ensureNpcs, ensureQuestTemplates, ensureDialogueOptions called from syncAllContent"
      pattern: "ensureNpcs.*ensureQuestTemplates.*ensureDialogueOptions"
---

<objective>
Seed 8-10 new NPCs across all three regions (Hollowmere Vale, Embermarch Fringe, Embermarch Depths) with multi-tier dialogue trees and kill quests, making the world feel populated and alive beyond the starting town.

Purpose: Currently only 3 NPCs exist, all in Hollowmere. The rest of the world (27 locations) has no NPCs, no quest givers, and no dialogue. This makes exploration feel empty and unrewarding.

Output: New NPC personalities, dialogue chains, quest templates, and seeding code. All activated via existing /synccontent command.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/data/npc_data.ts
@spacetimedb/src/data/dialogue_data.ts
@spacetimedb/src/seeding/ensure_world.ts
@spacetimedb/src/seeding/ensure_enemies.ts
@spacetimedb/src/seeding/ensure_content.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add NPC personality archetypes and seed 8-10 new NPCs across all regions</name>
  <files>spacetimedb/src/data/npc_data.ts, spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
1. In `spacetimedb/src/data/npc_data.ts`, add 5-6 new personality profiles to NPC_PERSONALITIES:
   - `weary_healer` (high agreeableness, moderate neuroticism, affinityMultiplier: 1.0)
   - `hardened_soldier` (high conscientiousness, low openness, affinityMultiplier: 0.9)
   - `curious_scholar` (very high openness, low extraversion, affinityMultiplier: 1.1)
   - `shrewd_trader` (high extraversion, moderate agreeableness, affinityMultiplier: 1.0)
   - `bitter_exile` (low agreeableness, high neuroticism, affinityMultiplier: 0.8)
   - `dungeon_warden` (high conscientiousness, low openness, affinityMultiplier: 0.9)

2. In `spacetimedb/src/seeding/ensure_world.ts` inside `ensureNpcs()`, add upsertNpcByName calls for the following NPCs. Look up faction IDs for Verdant Circle, Ashen Order, and Free Blades the same way Iron Compact is looked up (iterate ctx.db.faction.iter()). Place NPCs at thematically appropriate locations:

   **Hollowmere Vale (3 new NPCs):**
   - `Warden Kael` (quest NPC) at `Bramble Hollow` — A ranger who patrols the thickets hunting Blight Stalkers. Uses veteran_scout personality. Greeting: "Stay low and move quick. The thickets have teeth." No faction.
   - `Herbalist Venna` (quest NPC) at `Willowfen` — A Verdant Circle herbalist gathering reagents from the marshes. Uses weary_healer personality. Greeting: "The marshes give and the marshes take. I am here to make sure it gives more." Faction: Verdant Circle.
   - `Old Moss` (lore NPC) at `Lichen Ridge` — A reclusive old man who watches the marshlands from his ridge perch. Uses wise_elder personality. Greeting: "Hmph. Another one climbing up here to gawk. Well, sit down if you must." No faction.

   **Embermarch Fringe (3-4 new NPCs):**
   - `Forgemaster Dara` (vendor NPC) at `Slagstone Waystation` — An Iron Compact smith running the waystation forge. Uses friendly_merchant personality. Greeting: "Iron bends to will, not whim. What do you need forged?" Faction: Iron Compact.
   - `Scout Thessa` (quest NPC) at `Cinderwatch` — A Free Blades scout tracking enemy movement across the ash dunes. Uses hardened_soldier personality. Greeting: "You look like you can handle yourself. The Fringe needs fighters." Faction: Free Blades.
   - `Ashwalker Ren` (quest NPC) at `Charwood Copse` — An Ashen Order researcher studying the petrified trees and undead activity. Uses curious_scholar personality. Greeting: "The dead do not rest here. I study why. Care to help?" Faction: Ashen Order.
   - `Exile Voss` (lore NPC) at `Brimstone Gulch` — A bitter exile who knows the mountain passes. Uses bitter_exile personality. Greeting: "Keep walking. Unless you have coin or news." No faction.

   **Embermarch Depths (2 new NPCs):**
   - `Torchbearer Isa` (quest NPC) at `Gloomspire Landing` (the dungeon bind stone) — A brave torchbearer who keeps the landing safe for adventurers. Uses hardened_soldier personality. Greeting: "This is the last safe light before the deep. Ready yourself." No faction.
   - `Keeper Mordane` (lore NPC) at `Sootveil Hall` — An Ashen Order keeper who studies the vault's history. Uses dungeon_warden personality. Greeting: "These halls remember what we have forgotten. Tread carefully." Faction: Ashen Order.
  </action>
  <verify>
    Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` to verify no TypeScript errors. Visually confirm ensure_world.ts has 11+ upsertNpcByName calls (3 existing + 8-10 new).
  </verify>
  <done>8-10 new NPCs defined across all 3 regions with appropriate personalities, factions, and thematic placement at specific named locations.</done>
</task>

<task type="auto">
  <name>Task 2: Create dialogue trees and kill quests for new NPCs</name>
  <files>spacetimedb/src/data/dialogue_data.ts, spacetimedb/src/seeding/ensure_world.ts</files>
  <action>
1. In `spacetimedb/src/data/dialogue_data.ts`, add dialogue chains to the NPC_DIALOGUE_OPTIONS array for each new NPC. Follow the exact same DialogueOptionSeed format used by Marla/Soren/Jyn. Each NPC should have:

   **Warden Kael (Bramble Hollow):**
   - Root greeting (optionKey: 'kael_root', playerText: '', npcResponse mentioning [thickets], [wolves], [stalkers])
   - 'thickets' option (affinityChange: 2n) — flavor text about Bramble Hollow dangers
   - 'wolves' option (affinityChange: 2n) — offers quest "Wolf Pack Thinning" (questTemplateName)
   - 'stalkers' option (affinityChange: 2n) — offers quest "Stalker Hunt" (questTemplateName)
   - Affinity 25+ option: 'ranger' (playerText: 'ranger') — deeper personal backstory about being a ranger

   **Herbalist Venna (Willowfen):**
   - Root greeting (optionKey: 'venna_root', mentioning [herbs], [marsh], [croakers])
   - 'herbs' option (affinityChange: 1n) — flavor about marsh herbs
   - 'marsh' option (affinityChange: 2n) — flavor about Willowfen ecology
   - 'croakers' option (affinityChange: 2n) — offers quest "Croaker Culling" (questTemplateName)
   - Affinity 25+ option: 'circle' — deeper lore about Verdant Circle

   **Old Moss (Lichen Ridge):**
   - Root greeting (optionKey: 'moss_root', mentioning [ridge], [below], [cairns])
   - 'ridge' option (affinityChange: 2n) — flavor about the ridge
   - 'below' option (affinityChange: 2n) — hints about what lurks in the swamps
   - 'cairns' option (affinityChange: 2n) — lore about the ancient cairns
   - Affinity 50+ option: 'secret' — a hidden piece of world lore

   **Forgemaster Dara (Slagstone Waystation):**
   - Root greeting (optionKey: 'dara_root', mentioning [forge], [iron], [trade])
   - 'forge' option (affinityChange: 1n) — talks about the waystation forge
   - 'iron' option (affinityChange: 2n) — lore about Iron Compact presence here
   - 'trade' option (affinityChange: 1n) — mentions opening the store

   **Scout Thessa (Cinderwatch):**
   - Root greeting (optionKey: 'thessa_root', mentioning [scouts], [jackals], [sentinels])
   - 'scouts' option (affinityChange: 2n) — talks about Free Blades scouting mission
   - 'jackals' option (affinityChange: 2n) — offers quest "Jackal Purge" (questTemplateName)
   - 'sentinels' option (affinityChange: 2n) — offers quest "Sentinel Dismantling" (questTemplateName)
   - Affinity 25+ option: 'blades' — deeper Free Blades lore

   **Ashwalker Ren (Charwood Copse):**
   - Root greeting (optionKey: 'ren_root', mentioning [research], [dead], [sprites])
   - 'research' option (affinityChange: 2n) — talks about studying undead
   - 'dead' option (affinityChange: 2n) — lore about undead in the area
   - 'sprites' option (affinityChange: 2n) — offers quest "Sprite Specimens" (questTemplateName, Thorn Sprite kills)
   - Affinity 25+ option: 'order' — Ashen Order lore

   **Exile Voss (Brimstone Gulch):**
   - Root greeting (optionKey: 'voss_root', mentioning [gulch], [past], [beasts])
   - 'gulch' option (affinityChange: 1n) — grumpy description of the gulch
   - 'past' option — affinity locked at 25+, hint: "Buy me a drink first." isAffinityLocked: true
   - 'beasts' option (affinityChange: 2n) — mentions dangerous rams and hawks
   - Affinity 25+ unlocked 'past' option: backstory about exile from the Iron Compact

   **Torchbearer Isa (Gloomspire Landing):**
   - Root greeting (optionKey: 'isa_root', mentioning [deep], [revenants], [sentinels])
   - 'deep' option (affinityChange: 2n) — talks about what lies beyond
   - 'revenants' option (affinityChange: 2n) — offers quest "Revenant Scourge" (questTemplateName)
   - 'sentinels' option (affinityChange: 2n) — offers quest "Vault Clearing" (questTemplateName)
   - Affinity 25+ option: 'torch' — personal story about why she carries the torch

   **Keeper Mordane (Sootveil Hall):**
   - Root greeting (optionKey: 'mordane_root', mentioning [halls], [mystics], [history])
   - 'halls' option (affinityChange: 2n) — vault history flavor
   - 'mystics' option (affinityChange: 2n) — offers quest "Mystic Suppression" (questTemplateName)
   - 'history' option (affinityChange: 2n) — deep lore about Embermarch Depths
   - Affinity 50+ option: 'ashwarden' — hints about the Ashwarden Throne

2. In `spacetimedb/src/seeding/ensure_world.ts` inside `ensureQuestTemplates()`, add upsertQuestByName calls for the following quests. Reference existing enemy template names from ensure_enemies.ts (all names already exist there):

   **Hollowmere Vale quests (Warden Kael, Herbalist Venna):**
   - "Wolf Pack Thinning" — npcName: 'Warden Kael', enemyName: 'Thicket Wolf', requiredCount: 5n, minLevel: 1n, maxLevel: 3n, rewardXp: 50n
   - "Stalker Hunt" — npcName: 'Warden Kael', enemyName: 'Blight Stalker', requiredCount: 3n, minLevel: 2n, maxLevel: 5n, rewardXp: 70n
   - "Croaker Culling" — npcName: 'Herbalist Venna', enemyName: 'Marsh Croaker', requiredCount: 6n, minLevel: 1n, maxLevel: 3n, rewardXp: 45n

   **Embermarch Fringe quests (Scout Thessa, Ashwalker Ren):**
   - "Jackal Purge" — npcName: 'Scout Thessa', enemyName: 'Ash Jackal', requiredCount: 5n, minLevel: 2n, maxLevel: 5n, rewardXp: 80n
   - "Sentinel Dismantling" — npcName: 'Scout Thessa', enemyName: 'Cinder Sentinel', requiredCount: 3n, minLevel: 3n, maxLevel: 6n, rewardXp: 100n
   - "Sprite Specimens" — npcName: 'Ashwalker Ren', enemyName: 'Thorn Sprite', requiredCount: 4n, minLevel: 2n, maxLevel: 5n, rewardXp: 65n

   **Embermarch Depths quests (Torchbearer Isa, Keeper Mordane):**
   - "Revenant Scourge" — npcName: 'Torchbearer Isa', enemyName: 'Ashforged Revenant', requiredCount: 4n, minLevel: 4n, maxLevel: 8n, rewardXp: 140n
   - "Vault Clearing" — npcName: 'Torchbearer Isa', enemyName: 'Vault Sentinel', requiredCount: 5n, minLevel: 4n, maxLevel: 7n, rewardXp: 120n
   - "Mystic Suppression" — npcName: 'Keeper Mordane', enemyName: 'Sootbound Mystic', requiredCount: 4n, minLevel: 4n, maxLevel: 8n, rewardXp: 130n

IMPORTANT: The questTemplateName field in dialogue options must EXACTLY match the quest name string in upsertQuestByName. This is how the dialogue system links to quests at runtime.
  </action>
  <verify>
    Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` to verify no TypeScript errors. Count dialogue options: should have 50+ total entries in NPC_DIALOGUE_OPTIONS (existing ~15 for Marla/Soren/Jyn + ~45-50 new). Count quest templates: should have 11 total (existing 2 + 9 new).
  </verify>
  <done>All new NPCs have multi-tier dialogue trees with root greetings, topic branches, quest-offering options with correct questTemplateName linkage, and affinity-gated deeper conversation tiers. 9 new kill quests span all 3 regions with appropriate enemy targets and level ranges.</done>
</task>

</tasks>

<verification>
1. `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` passes with no errors
2. NPC_DIALOGUE_OPTIONS array has entries for all new NPCs, each with a root greeting, 3+ topic branches, and at least one affinity-gated option
3. ensureNpcs() has 11+ NPC definitions across 3 regions
4. ensureQuestTemplates() has 11 quest definitions referencing valid enemy template names
5. All questTemplateName strings in dialogue_data.ts match quest name strings in ensure_world.ts exactly
6. Dialogue optionKey values are unique per NPC and follow the naming pattern (npcshortname_topic)
</verification>

<success_criteria>
- 8-10 new NPCs seeded across Hollowmere Vale, Embermarch Fringe, and Embermarch Depths
- Each NPC has a personality profile, description, greeting, and thematic location placement
- Each NPC has a dialogue tree with root greeting, 3+ topic branches, and affinity-gated tiers
- 9 new kill quests covering all regions and level ranges 1-8
- Quest-offering dialogue options correctly reference quest names
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/106-seed-more-npcs-with-dialog-chains-and-di/106-SUMMARY.md`
</output>
