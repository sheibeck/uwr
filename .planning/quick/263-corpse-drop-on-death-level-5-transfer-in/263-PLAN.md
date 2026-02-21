---
phase: quick-263
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/corpse.ts
  - spacetimedb/src/reducers/corpse.ts
autonomous: true
requirements: [QUICK-263]

must_haves:
  truths:
    - "After death, inventory items no longer appear in the dead character's inventory"
    - "After looting a corpse item, that item appears in the looting character's inventory"
    - "Looting all corpse items returns all items to the character's inventory"
    - "Decayed corpse items are permanently deleted (no ownership leak)"
  artifacts:
    - path: "spacetimedb/src/helpers/corpse.ts"
      provides: "createCorpse transfers ownerCharacterId to 0n sentinel for each item"
      contains: "ownerCharacterId: 0n"
    - path: "spacetimedb/src/reducers/corpse.ts"
      provides: "loot_corpse_item and loot_all_corpse restore ownerCharacterId to character.id before deleting CorpseItem"
      contains: "ownerCharacterId: character.id"
  key_links:
    - from: "spacetimedb/src/helpers/corpse.ts"
      to: "ctx.db.itemInstance.id.update"
      via: "ownerCharacterId set to 0n inside inventoryItems loop"
      pattern: "ownerCharacterId: 0n"
    - from: "spacetimedb/src/reducers/corpse.ts"
      to: "ctx.db.itemInstance.id.update"
      via: "ownerCharacterId restored to character.id before CorpseItem delete"
      pattern: "ownerCharacterId: character.id"
---

<objective>
Fix corpse item ownership transfer so inventory items genuinely disappear from a dead character's inventory and return when looted.

Purpose: The corpse system creates CorpseItem rows but never changes ItemInstance.ownerCharacterId, so items still appear in the dead character's inventory. Setting ownerCharacterId to 0n (sentinel — no valid character ID starts at 0) removes them from the useInventory filter on the client. Restoring it to character.id on loot returns items properly.

Output: Two file edits. No schema changes. No client changes. No bindings regeneration needed.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Transfer item ownership to 0n sentinel in createCorpse</name>
  <files>spacetimedb/src/helpers/corpse.ts</files>
  <action>
In the `createCorpse` function, inside the `for (const item of inventoryItems)` loop (lines 47-56), after the `ctx.db.corpseItem.insert(...)` call, add an update to set the item's ownerCharacterId to 0n:

```typescript
// Transfer ownership away from character (0n sentinel = on corpse, no owner)
ctx.db.itemInstance.id.update({ ...item, ownerCharacterId: 0n });
```

The existingCorpseItems guard (`if (existingCorpseItems.has(item.id)) continue;`) already skips items already in the corpse, so items that were already transferred (already 0n) will not be double-written. No additional guard needed.

Do NOT modify decayCorpse — it already deletes ItemInstance rows by ID entirely, which is correct (permanent loss).
Do NOT modify spawn_corpse in corpse.ts reducers — it creates the item with ownerCharacterId: character.id intentionally for testing, then inserts a CorpseItem. This is a test/admin tool and its inconsistency is acceptable for now.
  </action>
  <verify>
Search for the update call:
`grep -n "ownerCharacterId: 0n" spacetimedb/src/helpers/corpse.ts`
Should return one match inside the inventoryItems loop.
  </verify>
  <done>createCorpse sets ownerCharacterId to 0n for every item it links to a corpse, making them invisible to the dead character's useInventory filter (which filters by character.id).</done>
</task>

<task type="auto">
  <name>Task 2: Restore item ownership on loot in corpse reducers</name>
  <files>spacetimedb/src/reducers/corpse.ts</files>
  <action>
Two changes in this file:

**Change A — loot_corpse_item reducer (around line 50-55):**
The `itemInstance` fetch already exists at line 50. Before the `ctx.db.corpseItem.id.delete(corpseItem.id)` call at line 55, add an ownership restore:

```typescript
// Restore ownership to the looting character
if (itemInstance) {
  ctx.db.itemInstance.id.update({ ...itemInstance, ownerCharacterId: character.id });
}
```

Insert this block immediately before `ctx.db.corpseItem.id.delete(corpseItem.id);`.

**Change B — loot_all_corpse reducer (around line 101-105):**
The current loop only deletes CorpseItem rows. Update the loop to also restore ownership before deletion:

Replace:
```typescript
for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
  ctx.db.corpseItem.id.delete(corpseItem.id);
  itemCount += 1;
}
```

With:
```typescript
for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
  const itemInstance = ctx.db.itemInstance.id.find(corpseItem.itemInstanceId);
  if (itemInstance) {
    ctx.db.itemInstance.id.update({ ...itemInstance, ownerCharacterId: character.id });
  }
  ctx.db.corpseItem.id.delete(corpseItem.id);
  itemCount += 1;
}
```
  </action>
  <verify>
Check both restore calls exist:
`grep -n "ownerCharacterId: character.id" spacetimedb/src/reducers/corpse.ts`
Should return two matches — one in loot_corpse_item and one in the loot_all_corpse loop.
  </verify>
  <done>loot_corpse_item and loot_all_corpse both restore ownerCharacterId to character.id before deleting the CorpseItem row, causing items to reappear in the character's inventory immediately after looting.</done>
</task>

<task type="auto">
  <name>Task 3: Publish to local and verify</name>
  <files></files>
  <action>
Publish the updated module to local SpacetimeDB:

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

If publish fails, check `spacetime logs uwr` for TypeScript errors. The most likely error would be a type mismatch on ownerCharacterId — it must be bigint (0n) not number (0).

Do NOT publish to maincloud. Local only per project rules.
  </action>
  <verify>
Publish command exits with success (no error output). Then confirm with:
`spacetime logs uwr`
No runtime errors on startup.
  </verify>
  <done>Module published to local SpacetimeDB successfully. The corpse item ownership transfer is live.</done>
</task>

</tasks>

<verification>
After all tasks complete:
1. Create a level 5+ character and give it inventory items
2. Kill the character (use admin commands or combat)
3. Verify: inventory panel shows no items for the dead character
4. Navigate to corpse location, loot one item
5. Verify: that item reappears in inventory
6. Loot all remaining items
7. Verify: all items return, corpse disappears
</verification>

<success_criteria>
Dead character's inventory is empty (ownerCharacterId=0n items filtered out). Looted items return to inventory (ownerCharacterId restored to character.id). Decayed items are permanently deleted (no orphan ItemInstance rows with ownerCharacterId=0n).
</success_criteria>

<output>
After completion, create `.planning/quick/263-corpse-drop-on-death-level-5-transfer-in/263-SUMMARY.md` using the summary template.
</output>
