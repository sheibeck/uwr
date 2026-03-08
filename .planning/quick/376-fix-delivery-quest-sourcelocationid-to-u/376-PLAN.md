---
phase: quick-376
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/llm_prompts.ts
  - spacetimedb/src/index.ts
autonomous: true
requirements: [FIX-376]
must_haves:
  truths:
    - "Delivery quest sourceLocationId is NEVER set to the quest-giver NPC's location"
    - "LLM can specify a sourceLocationName for delivery quests"
    - "If LLM provides sourceLocationName, it is fuzzy-matched against region locations"
    - "If no match or not provided, a random neighboring location (not NPC's) is used as source"
  artifacts:
    - path: "spacetimedb/src/data/llm_prompts.ts"
      provides: "sourceLocationName field in NPC conversation response schema"
    - path: "spacetimedb/src/index.ts"
      provides: "sourceLocationId resolution logic for delivery quests"
  key_links:
    - from: "spacetimedb/src/data/llm_prompts.ts"
      to: "spacetimedb/src/index.ts"
      via: "LLM response schema sourceLocationName field consumed during quest creation"
      pattern: "effect\\.sourceLocationName"
---

<objective>
Fix delivery quest sourceLocationId so it points to a pickup location DIFFERENT from the quest-giver NPC's location. Currently line ~1089 sets sourceLocationId = npcLocation, making the "go pick up items" location identical to where the NPC already is.

Purpose: Delivery quests should send the player to a different location to pick up items, then return to the NPC. "Go THERE, bring it back HERE."
Output: Updated LLM schema + quest creation logic in index.ts
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/data/llm_prompts.ts (NPC conversation prompts and response schema)
@spacetimedb/src/index.ts (quest creation logic, lines ~1053-1111)
@spacetimedb/src/schema/tables.ts (LocationConnection table: fromLocationId/toLocationId; Location table: id, name, regionId)
@spacetimedb/src/reducers/npc_interaction.ts (talk_to_npc reducer that builds LLM context)

<interfaces>
<!-- LocationConnection table -->
LocationConnection: { id: u64, fromLocationId: u64, toLocationId: u64 }
Index: ctx.db.location_connection.by_from.filter(locationId)
Index: ctx.db.location_connection.by_to.filter(locationId)

<!-- Location table -->
Location: { id: u64, name: string, description: string, zone: string, regionId: u64, levelOffset: i64, isSafe: bool, terrainType: string, bindStone: bool, craftingAvailable: bool }

<!-- QuestTemplate relevant fields -->
sourceLocationId: u64 (optional) -- where to PICK UP the item
targetLocationId: u64 (optional) -- destination (for delivery: NPC location / turn-in)
targetNpcId: u64 (optional) -- delivery turn-in NPC

<!-- Existing targetNpcName resolution pattern (lines 1102-1110) -->
if (questType === 'delivery' && effect.targetNpcName) {
  const targetNpc = [...ctx.db.npc.iter()].find(n => n.name === effect.targetNpcName);
  if (targetNpc) { ... targetNpcId: targetNpc.id, targetLocationId: targetNpc.locationId }
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add sourceLocationName to LLM schema and prompt</name>
  <files>spacetimedb/src/data/llm_prompts.ts</files>
  <action>
In NPC_CONVERSATION_RESPONSE_SCHEMA (line ~410), add a new field after the existing `targetNpcName` line (line 427):

```
"sourceLocationName": "string -- name of location where items should be picked up (for delivery quests, must be DIFFERENT from current NPC location)"
```

In buildNpcConversationSystemPrompt (line ~350), the function already receives `location` param. Add to the Response Rules section (after the valid quest types line ~405) an instruction about delivery quests:

```
- For delivery quests: include sourceLocationName — a nearby location where items should be picked up. This MUST be different from the NPC's current location (${location.name}). Use a location name from the region if you know one.
```

Also update buildNpcConversationUserPrompt (line ~441) to accept an optional `nearbyLocationNames: string[]` parameter. If provided and non-empty, append to the prompt:

```
Nearby locations: ${nearbyLocationNames.join(', ')}
```

This gives the LLM actual location names to pick from for sourceLocationName.
  </action>
  <verify>grep -n "sourceLocationName" spacetimedb/src/data/llm_prompts.ts returns matches in both schema and prompt</verify>
  <done>LLM response schema includes sourceLocationName field; prompt instructs LLM to specify a different pickup location for delivery quests; user prompt can include nearby location names</done>
</task>

<task type="auto">
  <name>Task 2: Resolve sourceLocationId from LLM response or neighbors</name>
  <files>spacetimedb/src/index.ts, spacetimedb/src/reducers/npc_interaction.ts</files>
  <action>
**In spacetimedb/src/index.ts**, replace the delivery quest sourceLocationId assignment block (lines ~1086-1091) with:

1. Collect all locations in the NPC's region:
```typescript
const regionLocations = [...ctx.db.location.iter()].filter(l => l.regionId === (ctx.db.location.id.find(npc.locationId)?.regionId ?? 0n));
```

2. Try to resolve LLM-provided sourceLocationName via fuzzy match (case-insensitive includes, same pattern as targetNpcName on line 1103):
```typescript
let sourceLocId: bigint | undefined;
if (effect.sourceLocationName) {
  const match = regionLocations.find(l =>
    l.name.toLowerCase() === effect.sourceLocationName.toLowerCase() && l.id !== npc.locationId
  );
  if (match) sourceLocId = match.id;
}
```

3. If no match, pick a random connected location that is NOT the NPC's location:
```typescript
if (!sourceLocId) {
  const connections = [...ctx.db.location_connection.by_from.filter(npc.locationId)];
  const neighbors = connections
    .map(c => c.toLocationId)
    .filter(id => id !== npc.locationId);
  if (neighbors.length > 0) {
    // Deterministic pseudo-random using timestamp (reducer determinism)
    const idx = Number(ctx.timestamp.microsSinceUnixEpoch % BigInt(neighbors.length));
    sourceLocId = neighbors[idx];
  }
}
```

4. Set sourceLocationId to the resolved value (fallback: keep npcLocation ONLY if there are literally no other options — isolated location with no connections and no region peers):
```typescript
ctx.db.quest_template.id.update({
  ...ctx.db.quest_template.id.find(qt.id)!,
  sourceLocationId: sourceLocId || npcLocation,
  targetItemName: effect.targetItemName || effect.questName || 'Package',
});
```

**In spacetimedb/src/reducers/npc_interaction.ts**, in the talk_to_npc reducer, after the existing location/region lookups (~line 55-56), collect nearby location names:

```typescript
const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
const nearbyLocationNames = connections
  .map(c => ctx.db.location.id.find(c.toLocationId))
  .filter(Boolean)
  .map(l => l!.name);
```

Pass `nearbyLocationNames` as the new parameter to `buildNpcConversationUserPrompt`:
```typescript
const userPrompt = buildNpcConversationUserPrompt(message, activeQuests, MAX_ACTIVE_QUESTS, nearbyLocationNames);
```
  </action>
  <verify>grep -n "sourceLocId\|sourceLocationName\|nearbyLocationNames" spacetimedb/src/index.ts spacetimedb/src/reducers/npc_interaction.ts returns matches showing the new resolution logic</verify>
  <done>Delivery quests resolve sourceLocationId from LLM-provided name or random neighbor; sourceLocationId never equals npcLocation unless the location is completely isolated; nearby location names are passed to LLM prompt</done>
</task>

</tasks>

<verification>
- `grep -n "sourceLocationId: npcLocation" spacetimedb/src/index.ts` returns NO matches (old bug removed)
- `grep -n "sourceLocId" spacetimedb/src/index.ts` returns matches showing new resolution logic
- `grep -n "sourceLocationName" spacetimedb/src/data/llm_prompts.ts` returns matches in schema and prompt
- `spacetime publish uwr -p spacetimedb` succeeds (module compiles)
</verification>

<success_criteria>
- Delivery quest sourceLocationId is resolved from LLM sourceLocationName or random neighbor, never set to NPC's own location (unless completely isolated)
- LLM schema and prompt updated to support sourceLocationName for delivery quests
- Nearby location names passed to LLM for context
- Module publishes successfully
</success_criteria>

<output>
After completion, create `.planning/quick/376-fix-delivery-quest-sourcelocationid-to-u/376-SUMMARY.md`
</output>
