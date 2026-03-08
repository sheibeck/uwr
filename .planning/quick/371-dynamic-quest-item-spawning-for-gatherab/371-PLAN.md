---
phase: quick-371
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/search.ts
autonomous: true
requirements: [QUEST-ITEM-SPAWN]
must_haves:
  truths:
    - "Delivery quest items spawn immediately at targetLocationId when player arrives"
    - "Explore quest items spawn immediately at targetLocationId when player arrives (no 40% RNG)"
    - "Kill and kill_loot quests are unaffected (no gatherable spawning)"
    - "Quest items appear in LOOK output as gold [Loot ItemName] links"
    - "Duplicate quest items are not created if one already exists unlooted"
  artifacts:
    - path: "spacetimedb/src/helpers/search.ts"
      provides: "Updated performPassiveSearch with delivery+explore quest item spawning"
      contains: "delivery"
  key_links:
    - from: "spacetimedb/src/helpers/search.ts"
      to: "ctx.db.quest_item"
      via: "insert with discovered=true for delivery+explore quests"
      pattern: "delivery.*explore|explore.*delivery"
---

<objective>
Fix quest item spawning so delivery and explore quests always create visible gatherable items at the target location when a player arrives.

Purpose: Currently only explore quests can spawn items, and only with a 40% RNG roll. Delivery quests like "Casks to the Watchtower" never spawn their items. This makes delivery quests uncompletable.

Output: Updated `performPassiveSearch` in search.ts that deterministically spawns quest items for both delivery and explore quests.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/helpers/search.ts
@spacetimedb/src/schema/tables.ts (QuestItem table, QuestTemplate table)
@spacetimedb/src/reducers/intent.ts (buildLookOutput already renders discovered quest items)

<interfaces>
<!-- QuestTemplate fields relevant to this task -->
From spacetimedb/src/schema/tables.ts:
```typescript
// QuestTemplate has:
//   questType: string | undefined  // 'kill' | 'kill_loot' | 'explore' | 'delivery' | 'boss_kill'; undefined = 'kill'
//   targetLocationId: u64 | undefined  // for explore/delivery quests
//   targetItemName: string | undefined  // display name of the quest item

// QuestItem has:
//   id: u64 (autoInc)
//   characterId: u64
//   questTemplateId: u64
//   locationId: u64
//   name: string
//   discovered: bool
//   looted: bool
```

From spacetimedb/src/reducers/intent.ts (buildLookOutput):
```typescript
// Already renders quest items at lines 106-111:
// const questItems = [...ctx.db.quest_item.by_location.filter(character.locationId)]
//   .filter((qi) => qi.characterId === character.id && qi.discovered && !qi.looted);
// Renders as gold [Loot ItemName] tags — no changes needed here
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand quest item spawning to delivery+explore without RNG</name>
  <files>spacetimedb/src/helpers/search.ts</files>
  <action>
Modify the "Roll 2: Quest items" section in performPassiveSearch (lines 35-74) with these changes:

1. Change the quest type filter (line 44) from only `'explore'` to include `'delivery'`:
   - Replace: `if ((qt.questType ?? 'kill') !== 'explore') continue;`
   - With a check that accepts both: `const qtype = qt.questType ?? 'kill'; if (qtype !== 'explore' && qtype !== 'delivery') continue;`

2. Remove the 40% RNG gate (line 57). The quest item insert should happen unconditionally when the character has an active explore/delivery quest targeting this location and doesn't already have an unlooted item.
   - Remove the `if (questRoll < 40n)` wrapper around the insert block
   - Keep the duplicate check (lines 47-55) that prevents creating items if one already exists

3. Remove the `break` at line 73 so ALL matching quests get items spawned (a player could have multiple delivery/explore quests for the same location).

4. Since RNG is no longer used for quest items, remove the questRoll computation (lines 37-38) — it's dead code after this change.

5. Update the comment at line 35 from "Roll 2: Quest items (40% chance)" to "Quest items: always spawn for delivery/explore quests at target location".

Keep everything else in the function unchanged (resource rolls, named enemy rolls, SearchResult insert).
  </action>
  <verify>
    <automated>cd C:/projects/uwr && npx tsc --noEmit -p spacetimedb/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
    - performPassiveSearch spawns quest items for both 'explore' and 'delivery' quest types
    - No RNG roll gates quest item creation (deterministic spawn)
    - Duplicate prevention still works (existing unlooted items skip insert)
    - All other search functionality (resources, named enemies) unchanged
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit -p spacetimedb/tsconfig.json`
2. Code review: search.ts quest item section handles 'delivery' and 'explore' types
3. Code review: no `questRoll < 40n` gate remains
4. Code review: duplicate prevention still in place
</verification>

<success_criteria>
- Delivery quests spawn gatherable items at targetLocationId on arrival
- Explore quests spawn gatherable items deterministically (no 40% roll)
- Kill/kill_loot/boss_kill quests unaffected
- No duplicate quest items created
- Existing buildLookOutput renders items without changes
</success_criteria>

<output>
After completion, create `.planning/quick/371-dynamic-quest-item-spawning-for-gatherab/371-SUMMARY.md`
</output>
