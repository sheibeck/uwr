---
phase: quick-373
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/helpers/search.ts
  - spacetimedb/src/index.ts
  - spacetimedb/src/seeding/ensure_world.ts
  - spacetimedb/src/data/llm_prompts.ts
autonomous: true
requirements: [QUICK-373]
must_haves:
  truths:
    - "Delivery quest items spawn at the quest giver's location (source), not the delivery destination"
    - "Explore quest items still spawn at targetLocationId as before"
    - "LLM-generated delivery quests have sourceLocationId set to the NPC's location"
    - "Seeded delivery quests include sourceLocationId and targetItemName for item pickup"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "sourceLocationId optional field on QuestTemplate"
      contains: "sourceLocationId"
    - path: "spacetimedb/src/helpers/search.ts"
      provides: "Delivery quests check sourceLocationId for item spawning"
    - path: "spacetimedb/src/index.ts"
      provides: "LLM quest creation sets sourceLocationId from NPC location"
  key_links:
    - from: "spacetimedb/src/helpers/search.ts"
      to: "QuestTemplate.sourceLocationId"
      via: "delivery quest item spawn location lookup"
      pattern: "qt\\.sourceLocationId"
    - from: "spacetimedb/src/index.ts"
      to: "QuestTemplate.sourceLocationId"
      via: "LLM quest creation sets NPC location as source"
      pattern: "sourceLocationId.*npc"
---

<objective>
Fix delivery quest item spawning so items appear at the quest giver's location (pickup source) instead of the delivery destination. Currently `performPassiveSearch` uses `targetLocationId` for all quest types, but for delivery quests that's where items should be DELIVERED, not where they should be FOUND.

Purpose: Delivery quests should have players pick up items near the quest giver, then deliver them to the target NPC/location.
Output: Schema change + search logic fix + LLM/seeding integration.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/schema/tables.ts (QuestTemplate table, line ~169-191)
@spacetimedb/src/helpers/search.ts (performPassiveSearch, line 35-68)
@spacetimedb/src/index.ts (LLM quest creation, line 1053-1106)
@spacetimedb/src/seeding/ensure_world.ts (upsertQuestByName + delivery quests)
@spacetimedb/src/data/llm_prompts.ts (NPC conversation response schema)

<interfaces>
<!-- QuestTemplate table (from tables.ts line 169-191) -->
QuestTemplate columns:
  id: t.u64().primaryKey().autoInc()
  name: t.string()
  npcId: t.u64()
  targetEnemyTemplateId: t.u64()
  requiredCount: t.u64()
  minLevel/maxLevel: t.u64()
  rewardXp: t.u64()
  questType: t.string().optional()  // 'kill' | 'kill_loot' | 'explore' | 'delivery' | 'boss_kill'
  targetLocationId: t.u64().optional()  // for explore/delivery quests (DELIVERY destination)
  targetNpcId: t.u64().optional()  // for delivery quest turn-in target NPC
  targetItemName: t.string().optional()
  itemDropChance: t.u64().optional()
  description: t.string().optional()
  rewardType/rewardItemName/rewardItemDesc/rewardGold/characterId: optional fields

<!-- performPassiveSearch currently checks qt.targetLocationId for both explore AND delivery -->
<!-- LLM quest creation (index.ts ~1065) does NOT set targetLocationId or targetNpcId at all -->
<!-- Seeded delivery quests have targetNpcName but no targetItemName or source location -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sourceLocationId to schema and fix search logic</name>
  <files>spacetimedb/src/schema/tables.ts, spacetimedb/src/helpers/search.ts</files>
  <action>
1. In `spacetimedb/src/schema/tables.ts`, add `sourceLocationId: t.u64().optional()` to the QuestTemplate table columns (after `targetLocationId` on line 180). Add comment: `// for delivery quests: where to PICK UP the item (quest giver's location)`.

2. In `spacetimedb/src/helpers/search.ts`, update the quest item spawning block (lines 35-68). Change the location check logic:
   - For `delivery` quests: check `qt.sourceLocationId === locationId` (spawn item at source/pickup location). If `sourceLocationId` is not set, fall back to `qt.targetLocationId === locationId` for backward compatibility.
   - For `explore` quests: keep using `qt.targetLocationId === locationId` (unchanged).

Replace line 42:
```typescript
if (qt.targetLocationId !== locationId) continue;
```
With:
```typescript
// Delivery quests: item spawns at sourceLocationId (pickup location)
// Explore quests: item spawns at targetLocationId (destination)
const spawnLocationId = qtype === 'delivery'
  ? (qt.sourceLocationId ?? qt.targetLocationId)
  : qt.targetLocationId;
if (spawnLocationId !== locationId) continue;
```

This is a SCHEMA CHANGE requiring `--clear-database` on next publish.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>QuestTemplate has sourceLocationId field. performPassiveSearch uses sourceLocationId for delivery quests, targetLocationId for explore quests.</done>
</task>

<task type="auto">
  <name>Task 2: Wire sourceLocationId in LLM quest creation and seeded quests</name>
  <files>spacetimedb/src/index.ts, spacetimedb/src/seeding/ensure_world.ts, spacetimedb/src/data/llm_prompts.ts</files>
  <action>
1. In `spacetimedb/src/index.ts` at the LLM quest creation block (~line 1065), when creating the QuestTemplate for delivery/explore quests, set location fields:

After the quest template insert (line 1081), add a block that sets location IDs for delivery and explore quests:
```typescript
// Set location fields for delivery/explore quests
if (['delivery', 'explore'].includes(questType)) {
  // For delivery: sourceLocationId = NPC's location (pickup), targetLocationId = resolve from effect or leave undefined
  // For explore: targetLocationId = resolve from effect or use NPC's location as fallback
  const npcLocation = npc.locationId;

  if (questType === 'delivery') {
    ctx.db.quest_template.id.update({
      ...ctx.db.quest_template.id.find(qt.id)!,
      sourceLocationId: npcLocation,
      targetItemName: effect.targetItemName || effect.questName || 'Package',
    });
  } else if (questType === 'explore') {
    // For explore quests, try to find a nearby connected location as target
    // Fall back to current location if no better option
    ctx.db.quest_template.id.update({
      ...ctx.db.quest_template.id.find(qt.id)!,
      targetLocationId: npcLocation,  // Default to NPC's location; future: LLM can specify target
      targetItemName: effect.targetItemName || effect.questName || 'Hidden Object',
    });
  }
}
```

Also for delivery quests, resolve the targetNpcId if the LLM provides a target NPC name. Check if `effect.targetNpcName` exists, find the NPC by name at any location, and set `targetNpcId`. If not provided, leave undefined (the quest just needs the item delivered to targetLocationId).

2. In `spacetimedb/src/data/llm_prompts.ts`, add `targetItemName` to the offer_quest schema (around line 421-425):
```
"targetItemName": "string -- name of item to pick up/find (for delivery/explore quests)",
```

3. In `spacetimedb/src/seeding/ensure_world.ts`:

a. Add `sourceLocationName?: string` and `targetItemName` to the `upsertQuestByName` args interface (line ~370).

b. In the function body, resolve `sourceLocationName` to a location ID the same way `targetLocationName` is resolved (~line 374-376):
```typescript
const sourceLocation = args.sourceLocationName
  ? [...ctx.db.location.iter()].find((row) => row.name === args.sourceLocationName)
  : null;
```

c. Include `sourceLocationId: sourceLocation?.id` in both the insert and update calls for QuestTemplate.

d. Update the seeded delivery quests to include `sourceLocationName` and `targetItemName`:
- 'Old Debts' (Marla the Guide -> Scout Thessa): add `sourceLocationName: 'Hearthhollow'` (Marla's location), `targetItemName: 'Sealed Letter'`
- 'The Iron Compact Leak' (Scout Thessa -> Keeper Mordane): add `sourceLocationName: 'Bramble Hollow'` (Thessa's location), `targetItemName: 'Intelligence Report'`
- 'Moorland Tidings' (Moorcaller Phelan -> Hermit Dunstan): add `sourceLocationName: 'Greymoor Crossroads'` (Phelan's location), `targetItemName: 'Sealed Scroll'`
- "The Deserter's Intel" (Field Medic Saera -> Deserter Callum): add source location matching Saera's location, `targetItemName: 'Medical Records'`

NOTE: Verify NPC locations by checking `upsertNpcByName` calls earlier in the file. Use the NPC's `locationName` as the `sourceLocationName`.
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>LLM-generated delivery quests automatically set sourceLocationId to the quest giver NPC's location. Seeded delivery quests have sourceLocationId and targetItemName. LLM prompt schema includes targetItemName field.</done>
</task>

</tasks>

<verification>
1. TypeScript compilation passes: `npx tsc --noEmit -p spacetimedb/tsconfig.json`
2. Publish with --clear-database (schema change): `spacetime publish uwr -p spacetimedb --clear-database -y`
3. Manual test: Accept a delivery quest, search at quest giver's location -- item should spawn there, NOT at delivery destination
</verification>

<success_criteria>
- QuestTemplate table has `sourceLocationId` optional field
- `performPassiveSearch` uses `sourceLocationId` for delivery quests, `targetLocationId` for explore quests
- LLM quest creation sets `sourceLocationId` to NPC's location for delivery quests
- Seeded delivery quests include `sourceLocationName` and `targetItemName`
- TypeScript compiles without errors
- Requires `--clear-database` on next publish (schema change)
</success_criteria>

<output>
After completion, create `.planning/quick/373-add-sourcelocationid-to-delivery-quests-/373-SUMMARY.md`
</output>
